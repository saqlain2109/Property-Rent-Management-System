const express = require('express');
const router = express.Router();
const XLSX = require('xlsx');
const Property = require('../models/Property');
const Unit = require('../models/Unit');
const Tenant = require('../models/Tenant');
const TenantAssignment = require('../models/TenantAssignment');
const RentAgreement = require('../models/RentAgreement');
const PaymentReceipt = require('../models/PaymentReceipt');
const Expense = require('../models/Expense');
const MonthlyLedger = require('../models/MonthlyLedger');
const PaymentAllocation = require('../models/PaymentAllocation');
const { calculateTenantUnitLedger, getCurrentMonthYear } = require('../services/rentCalculator');
const { syncMonthlyLedgers } = require('../utils/ledgerSync');
const { protect } = require('../middleware/auth');

// @route GET /api/reports/tenant-ledger/:tenantId
router.get('/tenant-ledger/:tenantId', protect, async (req, res) => {
  try {
    const tenant = await Tenant.findById(req.params.tenantId);
    if (!tenant) return res.status(404).json({ success: false, message: 'Tenant not found' });

    const assignments = await TenantAssignment.find({ tenantId: tenant._id })
      .populate({ path: 'unitId', populate: { path: 'propertyId' } });

    const ledgers = [];
    for (const a of assignments) {
      const calc = await calculateTenantUnitLedger(a.unitId._id, tenant._id);
      ledgers.push({
        unit: a.unitId,
        assignment: a,
        ...calc
      });
    }

    const receipts = await PaymentReceipt.find({ tenantId: tenant._id, isReversed: false }).sort({ receiptDate: -1 });

    res.json({ success: true, tenant, ledgers, receipts });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route GET /api/reports/property-summary/:propertyId
router.get('/property-summary/:propertyId', protect, async (req, res) => {
  try {
    const property = await Property.findById(req.params.propertyId);
    if (!property) return res.status(404).json({ success: false, message: 'Property not found' });

    const units = await Unit.find({ propertyId: property._id });
    const unitIds = units.map(u => u._id);

    const receipts = await PaymentReceipt.find({ unitId: { $in: unitIds }, isReversed: false });
    const totalIncome = receipts.reduce((sum, r) => sum + r.totalAmount, 0);

    const expenses = await Expense.find({ propertyId: property._id, isReversed: false });
    const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);

    const activeAssignments = await TenantAssignment.find({ unitId: { $in: unitIds }, status: 'Active' })
      .populate('tenantId');

    let totalOutstanding = 0;
    for (const a of activeAssignments) {
      const calc = await calculateTenantUnitLedger(a.unitId, a.tenantId._id);
      totalOutstanding += calc.totalOutstanding;
    }

    res.json({
      success: true,
      property,
      unitCount: units.length,
      units,
      activeTenantsCount: activeAssignments.length,
      totalIncome,
      totalExpenses,
      netYield: totalIncome - totalExpenses,
      totalOutstanding,
      expenses
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route GET /api/reports/export-excel
// Generates live Excel workbook of tenants, properties, payments, expenses, and ledger
router.get('/export-excel', protect, async (req, res) => {
  try {
    const wb = XLSX.utils.book_new();

    // 1. Properties Sheet
    const properties = await Property.find().lean();
    const propRows = properties.map(p => ({
      'Code': p.propertyCode,
      'Name': p.name,
      'Type': p.propertyType,
      'Address': p.address,
      'Responsible Person': p.ownerOrResponsiblePerson,
      'Status': p.isActive ? 'Active' : 'Inactive'
    }));
    const wsProp = XLSX.utils.json_to_sheet(propRows);
    XLSX.utils.book_append_sheet(wb, wsProp, 'Properties');

    // 2. Outstanding & Tenants Sheet
    const activeAssigns = await TenantAssignment.find({ status: 'Active' })
      .populate('tenantId')
      .populate({ path: 'unitId', populate: { path: 'propertyId' } });

    const outRows = [];
    for (const a of activeAssigns) {
      const calc = await calculateTenantUnitLedger(a.unitId._id, a.tenantId._id);
      outRows.push({
        'Property': a.unitId?.propertyId?.name || '',
        'Unit': a.unitId?.unitName || '',
        'Tenant': a.tenantId?.name || '',
        'Paid Till Month': calc.paidTillMonth || 'None',
        'Next Unpaid Month': calc.nextUnpaidMonth || 'Up to Date',
        'Expected Rent': calc.totalExpected,
        'Allocated Rent': calc.totalAllocated,
        'Outstanding Balance': calc.totalOutstanding
      });
    }
    const wsOut = XLSX.utils.json_to_sheet(outRows);
    XLSX.utils.book_append_sheet(wb, wsOut, 'Outstanding Balances');

    // 3. Payment Receipts Sheet
    const receipts = await PaymentReceipt.find({ isReversed: false })
      .populate('tenantId', 'name')
      .populate('unitId', 'unitName')
      .sort({ receiptDate: -1 })
      .lean();
    const recRows = receipts.map(r => ({
      'Receipt No': r.receiptNumber,
      'Date': r.receiptDate.toISOString().split('T')[0],
      'Tenant': r.tenantId?.name || '',
      'Unit': r.unitId?.unitName || '',
      'Amount': r.totalAmount,
      'Mode': r.paymentMode,
      'Reference No': r.referenceNumber,
      'Comments': r.comments
    }));
    const wsRec = XLSX.utils.json_to_sheet(recRows);
    XLSX.utils.book_append_sheet(wb, wsRec, 'Rent Receipts');

    // 4. Expenses Sheet
    const expenses = await Expense.find({ isReversed: false })
      .populate('propertyId', 'name')
      .sort({ expenseDate: -1 })
      .lean();
    const expRows = expenses.map(e => ({
      'Expense Code': e.expenseCode,
      'Date': e.expenseDate.toISOString().split('T')[0],
      'Property': e.propertyId?.name || 'General / Other',
      'Category': e.category,
      'Amount': e.amount,
      'Description': e.description,
      'Vendor / Payee': e.vendorOrPayee,
      'Payment Mode': e.paymentMode
    }));
    const wsExp = XLSX.utils.json_to_sheet(expRows);
    XLSX.utils.book_append_sheet(wb, wsExp, 'Expenses');

    // 5. Monthly Account Book Sheet
    const ledgerData = await syncMonthlyLedgers();
    const ledgerRows = ledgerData.map(m => ({
      'Month': m.monthYear,
      'Starting Balance': m.openingBalance,
      'Rent Received': m.totalIncomeReceived,
      'Expenses Paid': m.totalExpensesPaid,
      'Net Cash Flow': m.netCashFlow,
      'Closing Balance': m.closingBalance,
      'Status': m.isReconciled ? 'Verified' : 'Pending'
    }));
    const wsLedger = XLSX.utils.json_to_sheet(ledgerRows);
    XLSX.utils.book_append_sheet(wb, wsLedger, 'Monthly Account Book');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Disposition', 'attachment; filename="Property_Rent_Management_Export.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route GET /api/reports/monthly-unified-report
// Generates the single Excel-style unified statement: Rent income first, expenses below, net difference, cumulative total & outstanding
router.get('/monthly-unified-report', protect, async (req, res) => {
  try {
    const targetMonth = req.query.month || getCurrentMonthYear();
    const [year, m] = targetMonth.split('-').map(Number);
    const startOfMonth = new Date(Date.UTC(year, m - 1, 1, 0, 0, 0));
    const endOfMonth = new Date(Date.UTC(year, m, 0, 23, 59, 59, 999));

    // 1. Get Rent Income items for targetMonth
    // Columns: Tenant, Property, Unit, Amount (NO date, NO receipt number!)
    const reversedReceipts = await PaymentReceipt.find({ isReversed: true }).distinct('_id');
    const allocations = await PaymentAllocation.find({
      rentMonthYear: targetMonth,
      receiptId: { $nin: reversedReceipts }
    })
      .populate('tenantId', 'name')
      .populate({
        path: 'unitId',
        populate: { path: 'propertyId', select: 'name' }
      })
      .sort({ createdAt: 1 });

    let rentEntries = [];
    if (allocations.length > 0) {
      rentEntries = allocations.map(a => ({
        tenant: a.tenantId?.name || '—',
        property: a.unitId?.propertyId?.name || '—',
        unit: a.unitId?.unitName || '—',
        amount: a.allocatedAmount
      }));
    } else {
      // Fallback: receipts in month
      const receipts = await PaymentReceipt.find({
        isReversed: false,
        receiptDate: { $gte: startOfMonth, $lte: endOfMonth }
      })
        .populate('tenantId', 'name')
        .populate({
          path: 'unitId',
          populate: { path: 'propertyId', select: 'name' }
        })
        .sort({ receiptDate: 1 });

      rentEntries = receipts.map(r => ({
        tenant: r.tenantId?.name || '—',
        property: r.unitId?.propertyId?.name || '—',
        unit: r.unitId?.unitName || '—',
        amount: r.totalAmount
      }));
    }

    const totalRentIncome = rentEntries.reduce((sum, r) => sum + r.amount, 0);

    // 2. Expenses for targetMonth
    const expenses = await Expense.find({
      isReversed: false,
      $or: [
        { expenseMonth: targetMonth },
        { expenseDate: { $gte: startOfMonth, $lte: endOfMonth } }
      ]
    })
      .populate('propertyId', 'name propertyCode')
      .sort({ expenseDate: 1 });

    const expenseEntries = expenses.map(e => ({
      category: e.category,
      description: e.description,
      payee: e.vendorOrPayee || '',
      property: e.propertyId?.name || 'General / Other',
      amount: e.amount
    }));

    const totalExpenses = expenseEntries.reduce((sum, e) => sum + e.amount, 0);

    // 3. Balance & Reconciliation
    await syncMonthlyLedgers();
    const ledgerDoc = await MonthlyLedger.findOne({ monthYear: targetMonth });
    const openingBalance = ledgerDoc ? ledgerDoc.openingBalance : 0;
    const netDifference = totalRentIncome - totalExpenses;
    const closingBalance = ledgerDoc ? ledgerDoc.closingBalance : (openingBalance + netDifference);

    // 4. Expected rent and outstanding dues for this month
    const activeAssignments = await TenantAssignment.find({ status: 'Active' });
    let monthExpectedRent = 0;
    let monthOutstandingRent = 0;

    for (const assign of activeAssignments) {
      const ledger = await calculateTenantUnitLedger(assign.unitId, assign.tenantId, targetMonth);
      const curMonthEntry = ledger.monthsBreakdown.find(entry => entry.monthYear === targetMonth);
      if (curMonthEntry) {
        monthExpectedRent += (curMonthEntry.expectedRate || 0);
        monthOutstandingRent += (curMonthEntry.outstandingAmount || 0);
      }
    }

    res.json({
      success: true,
      targetMonth,
      rentEntries,
      totalRentIncome,
      expenseEntries,
      totalExpenses,
      netDifference,
      openingBalance,
      closingBalance,
      monthExpectedRent,
      monthOutstandingRent
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route GET /api/reports/export-monthly-excel
// Exports the single-sheet Excel report matching the client's familiar Excel format
router.get('/export-monthly-excel', protect, async (req, res) => {
  try {
    const targetMonth = req.query.month || getCurrentMonthYear();
    const [year, m] = targetMonth.split('-').map(Number);
    const startOfMonth = new Date(Date.UTC(year, m - 1, 1, 0, 0, 0));
    const endOfMonth = new Date(Date.UTC(year, m, 0, 23, 59, 59, 999));

    // Rent allocations
    const reversedReceipts = await PaymentReceipt.find({ isReversed: true }).distinct('_id');
    const allocations = await PaymentAllocation.find({
      rentMonthYear: targetMonth,
      receiptId: { $nin: reversedReceipts }
    })
      .populate('tenantId', 'name')
      .populate({ path: 'unitId', populate: { path: 'propertyId', select: 'name' } })
      .sort({ createdAt: 1 });

    let rentRows = [];
    if (allocations.length > 0) {
      rentRows = allocations.map(a => [
        a.tenantId?.name || '—',
        a.unitId?.propertyId?.name || '—',
        a.unitId?.unitName || '—',
        a.allocatedAmount
      ]);
    } else {
      const receipts = await PaymentReceipt.find({
        isReversed: false,
        receiptDate: { $gte: startOfMonth, $lte: endOfMonth }
      })
        .populate('tenantId', 'name')
        .populate({ path: 'unitId', populate: { path: 'propertyId', select: 'name' } })
        .sort({ receiptDate: 1 });

      rentRows = receipts.map(r => [
        r.tenantId?.name || '—',
        r.unitId?.propertyId?.name || '—',
        r.unitId?.unitName || '—',
        r.totalAmount
      ]);
    }

    const totalRentIncome = rentRows.reduce((sum, r) => sum + Number(r[3] || 0), 0);

    // Expenses
    const expenses = await Expense.find({
      isReversed: false,
      $or: [
        { expenseMonth: targetMonth },
        { expenseDate: { $gte: startOfMonth, $lte: endOfMonth } }
      ]
    })
      .populate('propertyId', 'name propertyCode')
      .sort({ expenseDate: 1 });

    const expRows = expenses.map(e => [
      e.category,
      e.description + (e.vendorOrPayee ? ` (${e.vendorOrPayee})` : ''),
      e.propertyId?.name || 'General / Other',
      e.amount
    ]);

    const totalExpenses = expRows.reduce((sum, e) => sum + Number(e[3] || 0), 0);

    // Ledger balances
    await syncMonthlyLedgers();
    const ledgerDoc = await MonthlyLedger.findOne({ monthYear: targetMonth });
    const openingBalance = ledgerDoc ? ledgerDoc.openingBalance : 0;
    const netDifference = totalRentIncome - totalExpenses;
    const closingBalance = ledgerDoc ? ledgerDoc.closingBalance : (openingBalance + netDifference);

    // Expected & outstanding
    const activeAssignments = await TenantAssignment.find({ status: 'Active' });
    let monthExpectedRent = 0;
    let monthOutstandingRent = 0;
    for (const assign of activeAssignments) {
      const ledger = await calculateTenantUnitLedger(assign.unitId, assign.tenantId, targetMonth);
      const curMonthEntry = ledger.monthsBreakdown.find(entry => entry.monthYear === targetMonth);
      if (curMonthEntry) {
        monthExpectedRent += (curMonthEntry.expectedRate || 0);
        monthOutstandingRent += (curMonthEntry.outstandingAmount || 0);
      }
    }

    // Single unified worksheet layout
    const sheetData = [
      [`MONTHLY STATEMENT · ${targetMonth}`],
      [''],
      ['RENT INCOME STATEMENT'],
      ['Tenant', 'Property', 'Unit', 'Amount'],
      ...rentRows,
      ['Total Rent Income', '', '', totalRentIncome],
      [''],
      ['EXPENSES STATEMENT'],
      ['Category', 'Description / Payee', 'Property', 'Amount'],
      ...expRows,
      ['Total Expenses', '', '', totalExpenses],
      [''],
      ['FINANCIAL RECONCILIATION SUMMARY'],
      ['Total Rent Income Received', '', '', totalRentIncome],
      ['Less: Total Expenses Paid', '', '', totalExpenses],
      ['Month Net Difference', '', '', netDifference],
      ['Previous Month Opening Balance', '', '', openingBalance],
      ['Cumulative Closing Balance', '', '', closingBalance],
      ['Month Outstanding Rent Balance', '', '', monthOutstandingRent]
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(sheetData);

    // Auto column widths
    ws['!cols'] = [
      { wch: 32 },
      { wch: 36 },
      { wch: 28 },
      { wch: 18 }
    ];

    XLSX.utils.book_append_sheet(wb, ws, `Statement ${targetMonth}`);

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Disposition', `attachment; filename="Monthly_Report_${targetMonth}.xlsx"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
