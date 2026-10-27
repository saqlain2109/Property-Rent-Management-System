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
const { protect, authorize } = require('../middleware/auth');
const { importHistorical } = require('../scripts/importHistorical2024_2025');

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
      'Accounting Month': r.accountingMonth || (r.receiptDate ? r.receiptDate.toISOString().slice(0, 7) : ''),
      'Date': r.receiptDate.toISOString().split('T')[0],
      'Tenant': r.tenantId?.name || '',
      'Unit': r.unitId?.unitName || '',
      'Amount': r.totalAmount,
      'Status': r.status || 'Rented',
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
      'Description': e.description || ''
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

    // 6. Monthly Property Earnings Matrix Sheet
    const unitsList = await Unit.find().lean();
    const uMap = {};
    unitsList.forEach(u => { uMap[u._id.toString()] = u; });
    const allRecs = await PaymentReceipt.find({ isReversed: false }).lean();
    const mSet = new Set();
    const pEarn = {};
    properties.forEach(p => { pEarn[p._id.toString()] = {}; });
    allRecs.forEach(r => {
      const d = new Date(r.receiptDate);
      const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      mSet.add(m);
      const u = uMap[r.unitId?.toString()];
      if (u && u.propertyId && pEarn[u.propertyId.toString()]) {
        pEarn[u.propertyId.toString()][m] = (pEarn[u.propertyId.toString()][m] || 0) + (r.totalAmount || 0);
      }
    });
    const sMonths = Array.from(mSet).sort();
    const mHeaders = sMonths.map(m => {
      const [y, mm] = m.split('-');
      const d = new Date(Date.UTC(Number(y), Number(mm) - 1, 1));
      return d.toLocaleString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
    });
    const matrixRows = properties.map((p, idx) => {
      const pid = p._id.toString();
      const row = { '#': idx + 1, 'Property Name': p.name, 'Property Code': p.propertyCode };
      let rTotal = 0;
      sMonths.forEach((m, mIdx) => {
        const val = pEarn[pid]?.[m] || 0;
        row[mHeaders[mIdx]] = val;
        rTotal += val;
      });
      row['Total'] = rTotal;
      return row;
    });
    // Add Total Row
    const totalRow = { '#': '', 'Property Name': 'TOTAL EARNINGS', 'Property Code': '' };
    let gTot = 0;
    sMonths.forEach((m, mIdx) => {
      const colSum = properties.reduce((sum, p) => sum + (pEarn[p._id.toString()]?.[m] || 0), 0);
      totalRow[mHeaders[mIdx]] = colSum;
      gTot += colSum;
    });
    totalRow['Total'] = gTot;
    matrixRows.push(totalRow);
    const wsMatrix = XLSX.utils.json_to_sheet(matrixRows);
    XLSX.utils.book_append_sheet(wb, wsMatrix, 'Monthly Property Earnings');

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
      e.description || '—',
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

// @route GET /api/reports/monthly-property-earnings
// Returns matrix of all properties with monthly earnings as columns, plus row totals and column totals
// @route POST /api/reports/sync-historical-data
// Allows manually triggering historical 2024-2025 seed synchronization
router.post('/sync-historical-data', protect, async (req, res) => {
  try {
    console.log('[Reports] Manual trigger: importing 2024-2025 historical statements...');
    await importHistorical();
    res.json({ success: true, message: 'Historical 2024-2025 statements successfully synced into database!' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route GET /api/reports/monthly-property-earnings
// Returns matrix of all properties with monthly earnings as columns, plus row totals and column totals
router.get('/monthly-property-earnings', protect, async (req, res) => {
  try {
    // Auto-seed historical 2024-2025 data if not present on this server/database
    const historicalReceiptCount = await PaymentReceipt.countDocuments({
      receiptDate: {
        $gte: new Date(Date.UTC(2024, 2, 1)),
        $lte: new Date(Date.UTC(2025, 2, 0, 23, 59, 59, 999))
      }
    });
    if (historicalReceiptCount === 0) {
      console.log('[Reports] Auto-importing 12-month historical statements into server database...');
      try {
        await importHistorical();
      } catch (importErr) {
        console.error('[Reports] Auto-import error:', importErr);
      }
    }
    const basis = req.query.basis === 'allocatedMonth' ? 'allocatedMonth' : 'receiptDate';
    const filterYear = req.query.year || 'all';
    const startMonth = req.query.startMonth || req.query.fromMonth || null;
    const endMonth = req.query.endMonth || req.query.toMonth || null;

    const propertyIdFilter = req.query.propertyId || null;
    let propQuery = {};
    if (propertyIdFilter) {
      propQuery._id = propertyIdFilter;
    }
    const properties = await Property.find(propQuery).sort({ displayOrder: 1, name: 1 }).lean();
    const units = await Unit.find().sort({ unitName: 1 }).lean();
    const unitMap = {};
    const propUnitsMap = {};

    properties.forEach(p => {
      propUnitsMap[p._id.toString()] = [];
    });

    units.forEach(u => {
      unitMap[u._id.toString()] = u;
      const pid = u.propertyId?.toString();
      if (propUnitsMap[pid]) {
        propUnitsMap[pid].push(u);
      }
    });

    const reversedReceiptIds = await PaymentReceipt.find({ isReversed: true }).distinct('_id');

    // Aggregate data according to basis
    const allEverMonthsSet = new Set();
    const propertyEarnings = {};
    const unitEarnings = {};

    properties.forEach(p => {
      propertyEarnings[p._id.toString()] = {};
    });
    units.forEach(u => {
      unitEarnings[u._id.toString()] = {};
    });

    if (basis === 'allocatedMonth') {
      const allocations = await PaymentAllocation.find({
        receiptId: { $nin: reversedReceiptIds }
      }).lean();

      allocations.forEach(a => {
        const m = a.rentMonthYear;
        if (!m) return;
        allEverMonthsSet.add(m);

        const uid = a.unitId?.toString();
        const u = unitMap[uid];
        if (uid && unitEarnings[uid]) {
          unitEarnings[uid][m] = (unitEarnings[uid][m] || 0) + (a.allocatedAmount || 0);
        }
        if (u && u.propertyId && propertyEarnings[u.propertyId.toString()]) {
          propertyEarnings[u.propertyId.toString()][m] = 
            (propertyEarnings[u.propertyId.toString()][m] || 0) + (a.allocatedAmount || 0);
        }
      });
    } else {
      // Month Wise Report: populated based on accountingMonth (with fallback to receiptDate)
      const receipts = await PaymentReceipt.find({
        isReversed: false
      }).lean();

      receipts.forEach(r => {
        let m = r.accountingMonth;
        if (!m && r.receiptDate) {
          const d = new Date(r.receiptDate);
          if (!isNaN(d.getTime())) {
            m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          }
        }
        if (!m) return;
        allEverMonthsSet.add(m);

        const uid = r.unitId?.toString();
        const u = unitMap[uid];
        if (uid && unitEarnings[uid]) {
          unitEarnings[uid][m] = (unitEarnings[uid][m] || 0) + (r.totalAmount || 0);
        }
        if (u && u.propertyId && propertyEarnings[u.propertyId.toString()]) {
          propertyEarnings[u.propertyId.toString()][m] = 
            (propertyEarnings[u.propertyId.toString()][m] || 0) + (r.totalAmount || 0);
        }
      });
    }

    // Ensure all 12 calendar months are generated for the selected year (or 2026 by default)
    const activeYr = filterYear !== 'all' ? filterYear : '2026';
    const year12Months = Array.from({ length: 12 }, (_, i) => `${activeYr}-${String(i + 1).padStart(2, '0')}`);
    
    // Combine existing recorded months with the 12 calendar months of activeYr
    const allAvailableMonths = Array.from(new Set([...allEverMonthsSet, ...year12Months])).sort();
    
    let sortedMonths = filterYear !== 'all' 
      ? year12Months 
      : allAvailableMonths;

    // Filter by startMonth and endMonth range if specified
    if (startMonth) {
      sortedMonths = sortedMonths.filter(m => m >= startMonth);
    }
    if (endMonth) {
      sortedMonths = sortedMonths.filter(m => m <= endMonth);
    }

    // Available years for dropdown
    const allYearsSet = new Set(['2026', '2025', '2024']);
    allAvailableMonths.forEach(m => {
      allYearsSet.add(m.split('-')[0]);
    });
    const availableYears = Array.from(allYearsSet).sort().reverse();

    // Build row structures based on filtered sortedMonths
    const columnTotals = {};
    sortedMonths.forEach(m => { columnTotals[m] = 0; });
    let grandTotal = 0;

    const rows = properties.map(p => {
      const pid = p._id.toString();
      const pEarnMap = propertyEarnings[pid] || {};
      let propTotal = 0;

      const monthlyValues = {};
      sortedMonths.forEach(m => {
        const val = pEarnMap[m] || 0;
        monthlyValues[m] = val;
        propTotal += val;
        columnTotals[m] += val;
      });

      grandTotal += propTotal;

      const childUnits = (propUnitsMap[pid] || []).map(u => {
        const uid = u._id.toString();
        const uEarnMap = unitEarnings[uid] || {};
        let uTotal = 0;
        const uMonthly = {};
        sortedMonths.forEach(m => {
          const val = uEarnMap[m] || 0;
          uMonthly[m] = val;
          uTotal += val;
        });

        return {
          unitId: u._id,
          unitName: u.subUnitPartition || u.unitName || u.unitNumber,
          unitCode: u.unitCode,
          occupancyStatus: u.occupancyStatus,
          earnings: uMonthly,
          total: uTotal
        };
      });

      return {
        propertyId: p._id,
        propertyName: p.name,
        propertyCode: p.propertyCode,
        displayOrder: p.displayOrder,
        propertyType: p.propertyType,
        address: p.address,
        earnings: monthlyValues,
        total: propTotal,
        units: childUnits
      };
    });

    const monthLabels = sortedMonths.map(m => {
      const [y, mm] = m.split('-');
      const d = new Date(Date.UTC(Number(y), Number(mm) - 1, 1));
      return {
        key: m,
        label: d.toLocaleString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' })
      };
    });

    // Aggregate Expenses: Property-wise and Common
    const expenses = await Expense.find({ isReversed: false }).lean();
    const propertyExpenses = {};
    const propertyExpenseCats = {};
    const commonExpenses = {};
    const commonExpenseCategories = {};

    properties.forEach(p => {
      propertyExpenses[p._id.toString()] = {};
      propertyExpenseCats[p._id.toString()] = {};
    });

    expenses.forEach(e => {
      const d = new Date(e.expenseDate);
      const m = e.expenseMonth || (`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
      const pid = e.propertyId ? e.propertyId.toString() : null;
      const cat = e.category || 'Maintenance';
      const amt = Number(e.amount) || 0;

      if (pid && propertyExpenses[pid]) {
        propertyExpenses[pid][m] = (propertyExpenses[pid][m] || 0) + amt;
        if (!propertyExpenseCats[pid][cat]) {
          propertyExpenseCats[pid][cat] = {};
        }
        propertyExpenseCats[pid][cat][m] = (propertyExpenseCats[pid][cat][m] || 0) + amt;
      } else {
        commonExpenses[m] = (commonExpenses[m] || 0) + amt;
        if (!commonExpenseCategories[cat]) {
          commonExpenseCategories[cat] = {};
        }
        commonExpenseCategories[cat][m] = (commonExpenseCategories[cat][m] || 0) + amt;
      }
    });

    // Build expense rows for each property
    const expenseRows = properties.map((p) => {
      const pid = p._id.toString();
      const pExpMap = propertyExpenses[pid] || {};
      let propExpTotal = 0;
      const monthlyExp = {};
      sortedMonths.forEach(m => {
        const val = pExpMap[m] || 0;
        monthlyExp[m] = val;
        propExpTotal += val;
      });

      const catList = Object.keys(propertyExpenseCats[pid] || {}).map(cat => {
        const catMonthly = {};
        let catTotal = 0;
        sortedMonths.forEach(m => {
          const val = propertyExpenseCats[pid][cat][m] || 0;
          catMonthly[m] = val;
          catTotal += val;
        });
        return {
          category: cat,
          expenses: catMonthly,
          total: catTotal
        };
      });

      return {
        propertyId: p._id,
        propertyName: p.name,
        propertyCode: p.propertyCode,
        expenses: monthlyExp,
        total: propExpTotal,
        categories: catList
      };
    });

    // Build common expense data
    const commonMonthly = {};
    let commonTotal = 0;
    sortedMonths.forEach(m => {
      const val = commonExpenses[m] || 0;
      commonMonthly[m] = val;
      commonTotal += val;
    });

    const commonCategories = Object.keys(commonExpenseCategories).map(cat => {
      const catMonthly = {};
      let catTotal = 0;
      sortedMonths.forEach(m => {
        const val = commonExpenseCategories[cat][m] || 0;
        catMonthly[m] = val;
        catTotal += val;
      });
      return {
        category: cat,
        expenses: catMonthly,
        total: catTotal
      };
    });

    const commonExpenseData = {
      title: 'Common / Other Expenses',
      expenses: commonMonthly,
      total: commonTotal,
      categories: commonCategories
    };

    // Calculate Expense Column Totals & Grand Total Expenses
    const expenseColumnTotals = {};
    let grandTotalExpenses = 0;
    sortedMonths.forEach(m => {
      const propSum = properties.reduce((sum, p) => sum + (propertyExpenses[p._id.toString()]?.[m] || 0), 0);
      const commVal = commonExpenses[m] || 0;
      const colExp = propSum + commVal;
      expenseColumnTotals[m] = colExp;
      grandTotalExpenses += colExp;
    });

    // Calculate Net Difference (Earnings - Expenses)
    const netDifference = {};
    sortedMonths.forEach(m => {
      netDifference[m] = (columnTotals[m] || 0) - (expenseColumnTotals[m] || 0);
    });
    const grandTotalDifference = grandTotal - grandTotalExpenses;

    res.json({
      success: true,
      basis,
      filterYear,
      startMonth,
      endMonth,
      availableYears,
      availableMonths: allAvailableMonths,
      months: sortedMonths,
      monthLabels,
      rows,
      columnTotals,
      grandTotal,
      expenseRows,
      commonExpenseData,
      expenseColumnTotals,
      grandTotalExpenses,
      netDifference,
      grandTotalDifference
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route GET /api/reports/export-monthly-property-matrix
// Exports the monthly property earnings matrix directly into an Excel (.xlsx) file
router.get('/export-monthly-property-matrix', protect, async (req, res) => {
  try {
    const historicalReceiptCount = await PaymentReceipt.countDocuments({
      receiptDate: {
        $gte: new Date(Date.UTC(2024, 2, 1)),
        $lte: new Date(Date.UTC(2025, 2, 0, 23, 59, 59, 999))
      }
    });
    if (historicalReceiptCount === 0) {
      try {
        await importHistorical();
      } catch (e) {
        console.error('[Export Matrix] Auto-import error:', e);
      }
    }
    const basis = req.query.basis === 'allocatedMonth' ? 'allocatedMonth' : 'receiptDate';
    const filterYear = req.query.year || 'all';
    const startMonth = req.query.startMonth || req.query.fromMonth || null;
    const endMonth = req.query.endMonth || req.query.toMonth || null;

    const propertyIdFilter = req.query.propertyId || null;
    let propQuery = {};
    if (propertyIdFilter) {
      propQuery._id = propertyIdFilter;
    }
    const properties = await Property.find(propQuery).sort({ displayOrder: 1, name: 1 }).lean();
    const units = await Unit.find().lean();
    const unitMap = {};
    units.forEach(u => { unitMap[u._id.toString()] = u; });

    const reversedReceiptIds = await PaymentReceipt.find({ isReversed: true }).distinct('_id');
    const allMonthsSet = new Set();
    const propertyEarnings = {};
    properties.forEach(p => { propertyEarnings[p._id.toString()] = {}; });

    if (basis === 'allocatedMonth') {
      const allocations = await PaymentAllocation.find({ receiptId: { $nin: reversedReceiptIds } }).lean();
      allocations.forEach(a => {
        const m = a.rentMonthYear;
        if (!m) return;
        allMonthsSet.add(m);
        const u = unitMap[a.unitId?.toString()];
        if (u && u.propertyId && propertyEarnings[u.propertyId.toString()]) {
          propertyEarnings[u.propertyId.toString()][m] = (propertyEarnings[u.propertyId.toString()][m] || 0) + (a.allocatedAmount || 0);
        }
      });
    } else {
      const receipts = await PaymentReceipt.find({ isReversed: false }).lean();
      receipts.forEach(r => {
        let m = r.accountingMonth;
        if (!m && r.receiptDate) {
          const d = new Date(r.receiptDate);
          if (!isNaN(d.getTime())) {
            m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          }
        }
        if (!m) return;
        allMonthsSet.add(m);
        const u = unitMap[r.unitId?.toString()];
        if (u && u.propertyId && propertyEarnings[u.propertyId.toString()]) {
          propertyEarnings[u.propertyId.toString()][m] = (propertyEarnings[u.propertyId.toString()][m] || 0) + (r.totalAmount || 0);
        }
      });
    }

    let sortedMonths = Array.from(allMonthsSet).sort();
    if (filterYear !== 'all') {
      sortedMonths = sortedMonths.filter(m => m.startsWith(filterYear));
    }
    if (startMonth) {
      sortedMonths = sortedMonths.filter(m => m >= startMonth);
    }
    if (endMonth) {
      sortedMonths = sortedMonths.filter(m => m <= endMonth);
    }

    const monthHeaderLabels = sortedMonths.map(m => {
      const [y, mm] = m.split('-');
      const d = new Date(Date.UTC(Number(y), Number(mm) - 1, 1));
      return d.toLocaleString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
    });

    // Query expenses for full matrix report
    const expenses = await Expense.find({ isReversed: false }).lean();
    const propertyExpenses = {};
    const commonExpenses = {};
    properties.forEach(p => { propertyExpenses[p._id.toString()] = {}; });

    expenses.forEach(e => {
      const d = new Date(e.expenseDate);
      const m = e.expenseMonth || (`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
      const pid = e.propertyId ? e.propertyId.toString() : null;
      const amt = Number(e.amount) || 0;
      if (pid && propertyExpenses[pid]) {
        propertyExpenses[pid][m] = (propertyExpenses[pid][m] || 0) + amt;
      } else {
        commonExpenses[m] = (commonExpenses[m] || 0) + amt;
      }
    });

    const header = ['#', 'Property / Partition', ...monthHeaderLabels, 'Total'];
    const rangeInfo = (startMonth || endMonth) ? ` (Range: ${startMonth || 'Earliest'} to ${endMonth || 'Latest'})` : '';
    const sheetRows = [
      [`${basis === 'allocatedMonth' ? 'RENT REPORT (Month Paid For)' : 'MONTH WISE REPORT (Accounting Month)'} - EARNINGS & EXPENSES${rangeInfo}`],
      [`Generated: ${new Date().toISOString().split('T')[0]}`],
      [''],
      ['', '1. RENT INCOME & EARNINGS', ...sortedMonths.map(() => ''), ''],
      header
    ];

    const colTotals = {};
    sortedMonths.forEach(m => { colTotals[m] = 0; });
    let grandTotal = 0;

    properties.forEach((p, idx) => {
      const pid = p._id.toString();
      const pEarnMap = propertyEarnings[pid] || {};
      let rowTotal = 0;
      const monthCols = sortedMonths.map(m => {
        const val = pEarnMap[m] || 0;
        rowTotal += val;
        colTotals[m] += val;
        return val;
      });
      grandTotal += rowTotal;

      sheetRows.push([
        idx + 1,
        p.name,
        ...monthCols,
        rowTotal
      ]);
    });

    // Subtotal row: Total Earnings
    sheetRows.push([
      'Σ',
      'TOTAL EARNINGS',
      ...sortedMonths.map(m => colTotals[m]),
      grandTotal
    ]);

    // Section 2: EXPENSES
    sheetRows.push(['']);
    sheetRows.push(['', '2. EXPENSES', ...sortedMonths.map(() => ''), '']);
    sheetRows.push(header);

    const expColTotals = {};
    sortedMonths.forEach(m => { expColTotals[m] = 0; });
    let grandTotalExpenses = 0;

    // Property-wise expenses
    properties.forEach((p, idx) => {
      const pid = p._id.toString();
      const pExpMap = propertyExpenses[pid] || {};
      let propExpTotal = 0;
      const monthCols = sortedMonths.map(m => {
        const val = pExpMap[m] || 0;
        propExpTotal += val;
        expColTotals[m] += val;
        return val;
      });
      grandTotalExpenses += propExpTotal;

      sheetRows.push([
        idx + 1,
        `${p.name} (Expenses)`,
        ...monthCols,
        propExpTotal
      ]);
    });

    // Common expenses row
    let commonTotal = 0;
    const commonCols = sortedMonths.map(m => {
      const val = commonExpenses[m] || 0;
      commonTotal += val;
      expColTotals[m] += val;
      return val;
    });
    grandTotalExpenses += commonTotal;

    sheetRows.push([
      'C',
      'Common / Other Expenses',
      ...commonCols,
      commonTotal
    ]);

    // Subtotal row: Total Expenses
    sheetRows.push([
      'Σ',
      'TOTAL EXPENSES',
      ...sortedMonths.map(m => expColTotals[m]),
      grandTotalExpenses
    ]);

    // Section 3: NET DIFFERENCE
    sheetRows.push(['']);
    sheetRows.push([
      'Δ',
      'Difference',
      ...sortedMonths.map(m => (colTotals[m] || 0) - (expColTotals[m] || 0)),
      grandTotal - grandTotalExpenses
    ]);

    // Section 4: CUMULATIVE
    let runningDiff = 0;
    const cumulativeCols = sortedMonths.map(m => {
      const diff = (colTotals[m] || 0) - (expColTotals[m] || 0);
      runningDiff += diff;
      return runningDiff;
    });
    sheetRows.push([
      'Σ',
      'Cumulative',
      ...cumulativeCols,
      grandTotal - grandTotalExpenses
    ]);

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(sheetRows);

    // Auto column widths
    ws['!cols'] = [
      { wch: 6 },
      { wch: 40 },
      ...sortedMonths.map(() => ({ wch: 16 })),
      { wch: 18 }
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Monthly Earnings');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const filenameSuffix = (startMonth || endMonth) ? `${startMonth || 'start'}_to_${endMonth || 'end'}` : filterYear;
    res.setHeader('Content-Disposition', `attachment; filename="Monthly_Property_Earnings_${filenameSuffix}.xlsx"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route GET /api/reports/monthly-drilldown
// Returns underlying payment receipts/allocations contributing to a specific cell in the monthly matrix
router.get('/monthly-drilldown', protect, async (req, res) => {
  try {
    const { propertyId, unitId, month, basis = 'receiptDate', year = 'all', startMonth, endMonth, type, category } = req.query;

    if (type === 'expense') {
      const expQuery = { isReversed: false };
      if (propertyId === '__COMMON__' || propertyId === 'null') {
        expQuery.propertyId = null;
      } else if (propertyId) {
        expQuery.propertyId = propertyId;
      }
      if (category) {
        expQuery.category = category;
      }
      if (month && month !== 'all') {
        const [y, m] = month.split('-').map(Number);
        const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0));
        const end = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));
        expQuery.$or = [
          { expenseMonth: month },
          { expenseDate: { $gte: start, $lte: end } }
        ];
      } else {
        if (startMonth && endMonth) {
          const [sy, sm] = startMonth.split('-').map(Number);
          const [ey, em] = endMonth.split('-').map(Number);
          const start = new Date(Date.UTC(sy, sm - 1, 1, 0, 0, 0));
          const end = new Date(Date.UTC(ey, em, 0, 23, 59, 59, 999));
          expQuery.expenseDate = { $gte: start, $lte: end };
        } else if (year && year !== 'all') {
          const y = Number(year);
          const start = new Date(Date.UTC(y, 0, 1, 0, 0, 0));
          const end = new Date(Date.UTC(y, 11, 31, 23, 59, 59, 999));
          expQuery.expenseDate = { $gte: start, $lte: end };
        }
      }
      const expenses = await Expense.find(expQuery).populate('propertyId', 'name propertyCode').sort({ expenseDate: -1 });
      const records = expenses.map(e => ({
        receiptId: e._id,
        receiptNumber: e.expenseCode,
        receiptDate: e.expenseDate,
        expenseMonth: e.expenseMonth,
        totalAmount: e.amount,
        receiptTotalAmount: e.amount,
        category: e.category,
        description: e.description,
        comments: e.description ? `${e.category}: ${e.description}` : e.category,
        tenant: null,
        property: e.propertyId ? { name: e.propertyId.name, _id: e.propertyId._id } : { name: 'Common / Other' },
        unit: null,
        isExpense: true
      }));
      return res.json({
        success: true,
        property: propertyId && propertyId !== '__COMMON__' ? await Property.findById(propertyId).select('name propertyCode') : { name: 'Common / Other' },
        records,
        totalAmount: records.reduce((s, r) => s + r.totalAmount, 0),
        count: records.length
      });
    }

    let targetUnits = [];
    let property = null;
    let unit = null;

    if (unitId) {
      unit = await Unit.findById(unitId).populate('propertyId', 'name propertyCode');
      if (unit) {
        targetUnits = [unit._id];
        property = unit.propertyId;
      }
    } else if (propertyId) {
      property = await Property.findById(propertyId).select('name propertyCode');
      const units = await Unit.find({ propertyId: property._id });
      targetUnits = units.map(u => u._id);
    }

    const reversedReceiptIds = await PaymentReceipt.find({ isReversed: true }).distinct('_id');
    let records = [];

    if (basis === 'allocatedMonth') {
      const allocQuery = {
        receiptId: { $nin: reversedReceiptIds }
      };
      if (targetUnits.length > 0) {
        allocQuery.unitId = { $in: targetUnits };
      }
      if (month && month !== 'all') {
        allocQuery.rentMonthYear = month;
      } else if (startMonth && endMonth) {
        allocQuery.rentMonthYear = { $gte: startMonth, $lte: endMonth };
      } else if (startMonth) {
        allocQuery.rentMonthYear = { $gte: startMonth };
      } else if (endMonth) {
        allocQuery.rentMonthYear = { $lte: endMonth };
      } else if (year && year !== 'all') {
        allocQuery.rentMonthYear = { $regex: `^${year}` };
      }

      const allocations = await PaymentAllocation.find(allocQuery)
        .populate({
          path: 'receiptId',
          populate: [
            { path: 'tenantId', select: 'name tenantCode phone' },
            { path: 'unitId', populate: { path: 'propertyId', select: 'name propertyCode' } }
          ]
        })
        .sort({ rentMonthYear: -1, createdAt: -1 });

      // Group or format
      for (const a of allocations) {
        const r = a.receiptId;
        if (!r) continue;
        const allRAllocs = await PaymentAllocation.find({ receiptId: r._id });
        records.push({
          allocationId: a._id,
          receiptId: r._id,
          receiptNumber: r.receiptNumber,
          receiptDate: r.receiptDate,
          accountingMonth: r.accountingMonth || (r.receiptDate ? new Date(r.receiptDate).toISOString().slice(0, 7) : ''),
          rentMonthYear: a.rentMonthYear,
          allocatedAmount: a.allocatedAmount,
          receiptTotalAmount: r.totalAmount,
          status: r.status || 'Rented',
          contractNo: r.contractNo || '',
          adjustmentAmount: r.adjustmentAmount || 0,
          adjustmentDescription: r.adjustmentDescription || '',
          comments: a.notes || r.comments || '',
          tenant: r.tenantId,
          unit: r.unitId,
          property: r.unitId?.propertyId || property,
          allocations: allRAllocs.map(al => ({
            _id: al._id,
            rentMonthYear: al.rentMonthYear,
            allocatedAmount: al.allocatedAmount,
            notes: al.notes
          }))
        });
      }
    } else {
      // Basis: accountingMonth / receiptDate
      const receiptQuery = {
        isReversed: false
      };
      if (targetUnits.length > 0) {
        receiptQuery.unitId = { $in: targetUnits };
      }
      if (month && month !== 'all') {
        const [y, m] = month.split('-').map(Number);
        const dStart = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0));
        const dEnd = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));
        receiptQuery.$or = [
          { accountingMonth: month },
          {
            $and: [
              { accountingMonth: { $in: [null, ''] } },
              { receiptDate: { $gte: dStart, $lte: dEnd } }
            ]
          }
        ];
      } else if (startMonth || endMonth) {
        let dStart, dEnd;
        const conds = [];
        if (startMonth) {
          const [sy, sm] = startMonth.split('-').map(Number);
          dStart = new Date(Date.UTC(sy, sm - 1, 1, 0, 0, 0));
          conds.push({
            $or: [
              { accountingMonth: { $gte: startMonth } },
              { $and: [{ accountingMonth: { $in: [null, ''] } }, { receiptDate: { $gte: dStart } }] }
            ]
          });
        }
        if (endMonth) {
          const [ey, em] = endMonth.split('-').map(Number);
          dEnd = new Date(Date.UTC(ey, em, 0, 23, 59, 59, 999));
          conds.push({
            $or: [
              { accountingMonth: { $lte: endMonth } },
              { $and: [{ accountingMonth: { $in: [null, ''] } }, { receiptDate: { $lte: dEnd } }] }
            ]
          });
        }
        if (conds.length > 0) {
          receiptQuery.$and = conds;
        }
      } else if (year && year !== 'all') {
        const y = Number(year);
        const dStart = new Date(Date.UTC(y, 0, 1, 0, 0, 0));
        const dEnd = new Date(Date.UTC(y, 11, 31, 23, 59, 59, 999));
        receiptQuery.$or = [
          { accountingMonth: { $regex: `^${year}-` } },
          {
            $and: [
              { accountingMonth: { $in: [null, ''] } },
              { receiptDate: { $gte: dStart, $lte: dEnd } }
            ]
          }
        ];
      }

      const receipts = await PaymentReceipt.find(receiptQuery)
        .populate('tenantId', 'name tenantCode phone')
        .populate({
          path: 'unitId',
          populate: { path: 'propertyId', select: 'name propertyCode' }
        })
        .sort({ receiptDate: -1, createdAt: -1 });

      const receiptIds = receipts.map(r => r._id);
      const allAllocations = await PaymentAllocation.find({ receiptId: { $in: receiptIds } });
      const allocMap = {};
      allAllocations.forEach(a => {
        const rid = a.receiptId.toString();
        if (!allocMap[rid]) allocMap[rid] = [];
        allocMap[rid].push({
          _id: a._id,
          rentMonthYear: a.rentMonthYear,
          allocatedAmount: a.allocatedAmount,
          notes: a.notes
        });
      });

      records = receipts.map(r => {
        const rid = r._id.toString();
        return {
          receiptId: r._id,
          receiptNumber: r.receiptNumber,
          receiptDate: r.receiptDate,
          accountingMonth: r.accountingMonth || (r.receiptDate ? new Date(r.receiptDate).toISOString().slice(0, 7) : ''),
          receiptTotalAmount: r.totalAmount,
          status: r.status || 'Rented',
          contractNo: r.contractNo || '',
          adjustmentAmount: r.adjustmentAmount || 0,
          adjustmentDescription: r.adjustmentDescription || '',
          comments: r.comments || '',
          tenant: r.tenantId,
          unit: r.unitId,
          property: r.unitId?.propertyId || property,
          allocations: allocMap[rid] || []
        };
      });
    }

    const totalAmount = records.reduce((sum, item) => {
      const val = basis === 'allocatedMonth' ? (item.allocatedAmount || 0) : (item.receiptTotalAmount || 0);
      return sum + val;
    }, 0);

    let title = 'Drill-Down Details';
    if (unit) {
      title = `${unit.subUnitPartition || unit.unitName} (${unit.propertyId?.name || ''})`;
    } else if (property) {
      title = property.name;
    } else {
      title = 'All Properties Portfolio';
    }

    let subtitle = '';
    if (month && month !== 'all') {
      const [y, mm] = month.split('-');
      const d = new Date(Date.UTC(Number(y), Number(mm) - 1, 1));
      const mLabel = d.toLocaleString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
      subtitle = `${mLabel} · ${basis === 'allocatedMonth' ? 'Month Paid For (Rent Month)' : 'Accounting Month'}`;
    } else {
      subtitle = `All Months · ${basis === 'allocatedMonth' ? 'Month Paid For (Rent Month)' : 'Accounting Month'}`;
    }

    res.json({
      success: true,
      title,
      subtitle,
      basis,
      month,
      property,
      unit,
      count: records.length,
      totalAmount,
      records
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route GET /api/reports/monthly-batch-entry
// Pre-fills all properties & units (for rent) and expenses for the selected month
router.get('/monthly-batch-entry', protect, async (req, res) => {
  try {
    const targetMonth = req.query.month || getCurrentMonthYear();
    const [y, m] = targetMonth.split('-').map(Number);
    const dStart = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0));
    const dEnd = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));

    const propertyIdFilter = req.query.propertyId || null;
    let propQuery = {};
    if (propertyIdFilter) {
      propQuery._id = propertyIdFilter;
    }
    const properties = await Property.find(propQuery).sort({ displayOrder: 1, name: 1 }).lean();
    const units = await Unit.find().populate('propertyId', 'name propertyCode').sort({ displayOrder: 1, unitName: 1 }).lean();

    const assignments = await TenantAssignment.find({ status: 'Active' }).populate('tenantId', 'name').lean();
    const unitTenantMap = {};
    assignments.forEach(a => {
      if (a.unitId) unitTenantMap[a.unitId.toString()] = a.tenantId;
    });

    const receipts = await PaymentReceipt.find({
      receiptDate: { $gte: dStart, $lte: dEnd },
      isReversed: false
    }).populate('tenantId', 'name').lean();

    const unitReceiptMap = {};
    receipts.forEach(r => {
      const uid = r.unitId?.toString();
      if (uid) unitReceiptMap[uid] = r;
    });

    const rentGrid = units.map(u => {
      const existingR = unitReceiptMap[u._id.toString()];
      const tenant = existingR?.tenantId || unitTenantMap[u._id.toString()] || null;
      return {
        unitId: u._id,
        unitName: u.subUnitPartition || u.unitName || u.unitNumber,
        unitCode: u.unitCode,
        propertyId: u.propertyId?._id,
        propertyName: u.propertyId?.name,
        propertyCode: u.propertyId?.propertyCode,
        tenantId: tenant?._id || null,
        tenantName: tenant?.name || '—',
        amount: existingR?.totalAmount || 0,
        receiptId: existingR?._id || null,
        notes: existingR?.comments || ''
      };
    });

    const expenses = await Expense.find({
      $or: [
        { expenseMonth: targetMonth },
        { expenseDate: { $gte: dStart, $lte: dEnd } }
      ],
      isReversed: false
    }).populate('propertyId', 'name propertyCode').lean();

    const expenseGrid = expenses.map(e => ({
      expenseId: e._id,
      propertyId: e.propertyId?._id || null,
      propertyName: e.propertyId?.name || 'General / Other',
      category: e.category,
      amount: e.amount,
      description: e.description
    }));

    res.json({
      success: true,
      month: targetMonth,
      properties,
      rentGrid,
      expenseGrid
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route POST /api/reports/monthly-batch-entry
// Bulk saves/updates all rent and expense records for a selected month
router.post('/monthly-batch-entry', protect, authorize('admin', 'manager'), async (req, res) => {
  try {
    const { month, rentEntries = [], expenseEntries = [] } = req.body;
    if (!month) return res.status(400).json({ success: false, message: 'Month is required' });

    const [y, m] = month.split('-').map(Number);
    const receiptDate = new Date(Date.UTC(y, m - 1, 10));
    const expenseDate = new Date(Date.UTC(y, m - 1, 15));

    for (const r of rentEntries) {
      const val = Number(r.amount || 0);
      if (r.receiptId) {
        if (val === 0) {
          await PaymentAllocation.deleteMany({ receiptId: r.receiptId });
          await PaymentReceipt.findByIdAndDelete(r.receiptId);
        } else {
          const rec = await PaymentReceipt.findById(r.receiptId);
          if (rec) {
            rec.totalAmount = val;
            rec.comments = r.notes || rec.comments;
            await rec.save();
            await PaymentAllocation.updateMany({ receiptId: rec._id }, { allocatedAmount: val });
          }
        }
      } else if (val > 0 && r.unitId) {
        let tId = r.tenantId;
        if (!tId) {
          const fallbackTenant = await Tenant.findOne();
          tId = fallbackTenant?._id;
        }
        const recNumber = `REC-${month.replace('-', '')}-${Date.now().toString().slice(-4)}-${Math.floor(Math.random() * 1000)}`;
        const newRec = await PaymentReceipt.create({
          receiptNumber: recNumber,
          receiptDate,
          tenantId: tId,
          unitId: r.unitId,
          totalAmount: val,
          status: 'Rented',
          comments: r.notes || `Rent for ${month}`
        });
        await PaymentAllocation.create({
          receiptId: newRec._id,
          tenantId: tId,
          unitId: r.unitId,
          rentMonthYear: month,
          allocatedAmount: val,
          notes: r.notes || `Rent for ${month}`
        });
      }
    }

    for (const e of expenseEntries) {
      const val = Number(e.amount || 0);
      if (e.expenseId) {
        if (val === 0) {
          await Expense.findByIdAndDelete(e.expenseId);
        } else {
          const exp = await Expense.findById(e.expenseId);
          if (exp) {
            exp.amount = val;
            exp.category = e.category || exp.category;
            exp.description = e.description || exp.description;
            if (e.propertyId !== undefined) exp.propertyId = e.propertyId || null;
            await exp.save();
          }
        }
      } else if (val > 0) {
        const expCode = `EXP-${month.replace('-', '')}-${Date.now().toString().slice(-4)}-${Math.floor(Math.random() * 1000)}`;
        await Expense.create({
          expenseCode: expCode,
          expenseDate,
          expenseMonth: month,
          propertyId: e.propertyId || null,
          category: e.category || 'Maintenance',
          amount: val,
          description: e.description || `Expense for ${month}`,
          paymentMode: e.paymentMode || 'Bank Transfer'
        });
      }
    }

    await syncMonthlyLedgers();

    res.json({
      success: true,
      message: `Successfully saved month data for ${month}`
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});



async function generateSheet1ReportData({ period, year, viewMode = 'received', propertyId, startMonth, endMonth }) {
  let months = [];
  let periodLabel = '';

  if (startMonth && endMonth) {
    months = [];
    let [sy, sm] = startMonth.split('-').map(Number);
    let [ey, em] = endMonth.split('-').map(Number);
    let curDate = new Date(sy, sm - 1, 1);
    const targetDate = new Date(ey, em - 1, 1);
    while (curDate <= targetDate && months.length < 48) {
      const yStr = curDate.getFullYear();
      const mStr = String(curDate.getMonth() + 1).padStart(2, '0');
      months.push(`${yStr}-${mStr}`);
      curDate.setMonth(curDate.getMonth() + 1);
    }
    if (months.length === 0) {
      months = [startMonth];
    }
    const [firstY, firstM] = months[0].split('-').map(Number);
    const [lastY, lastM] = months[months.length - 1].split('-').map(Number);
    const firstDate = new Date(firstY, firstM - 1, 1);
    const lastDate = new Date(lastY, lastM - 1, 1);
    periodLabel = `${firstDate.toLocaleString('en-US', { month: 'short' })} ${firstY} – ${lastDate.toLocaleString('en-US', { month: 'short' })} ${lastY}`;
    period = `${startMonth}_${endMonth}`;
  } else if (period === 'CY2026' || year === 2026) {
    period = 'CY2026';
    periodLabel = 'Calendar Year 2026 (Jan 2026 – Dec 2026)';
    months = ['2026-01','2026-02','2026-03','2026-04','2026-05','2026-06','2026-07','2026-08','2026-09','2026-10','2026-11','2026-12'];
  } else if (period === 'FY2025-26') {
    periodLabel = 'Financial Year 2025–26 (Apr 2025 – Mar 2026)';
    months = ['2025-04','2025-05','2025-06','2025-07','2025-08','2025-09','2025-10','2025-11','2025-12','2026-01','2026-02','2026-03'];
  } else if (period === 'CY2025' || year === 2025) {
    period = 'CY2025';
    periodLabel = 'Calendar Year 2025 (Jan 2025 – Dec 2025)';
    months = ['2025-01','2025-02','2025-03','2025-04','2025-05','2025-06','2025-07','2025-08','2025-09','2025-10','2025-11','2025-12'];
  } else {
    // Default: Master Sheet 1 Period (Mar 2025 to Feb 2026)
    period = '2025-03_2026-02';
    periodLabel = 'Master Sheet 1 Year (Mar 2025 – Feb 2026)';
    months = ['2025-03','2025-04','2025-05','2025-06','2025-07','2025-08','2025-09','2025-10','2025-11','2025-12','2026-01','2026-02'];
  }

  const monthObjects = months.map((k, i) => {
    const [y, m] = k.split('-').map(Number);
    const d = new Date(y, m - 1, 1);
    const mName = d.toLocaleString('en-US', { month: 'short' });
    return {
      index: i,
      monthKey: k,
      monthName: mName,
      monthLabel: `${mName} ${y}`,
      shortLabel: `${mName} '${String(y).slice(-2)}`
    };
  });

  // Canonical mapping from sheet1_baseline.json labels to unitCode
  const CANONICAL_BASELINE_UNIT_MAP = {
    'Kotak Godaown__a) Tenant No.1   - PG': 'KO-PG',
    'Kotak Godaown__bisleri': 'KO-SMALL',
    '65 no godown__a) Tenant 1 : Mahendra Bhai': '65-LARGE',
    '65 no godown__b) Tenant 2 (Alka Industry)': '65-SMALL',
    'Baranker room__Uttam': 'BAR-MEZZ',
    'Baranker room__Attic-ANJANA ashok salunke': 'BAR-1ST',
    'Dinesh Chaklani-bela  bera__Dinesh': 'ROOM-10',
    'Garage__Tenant No1.Snip': 'GA-SHOP2',
    'Garage__DG Cable': 'GA-SHOP1',
    'Garage__Anand': 'GA-GODOWN',
    'Garage__2nd Floor House Altaf': 'GA-CHIRA',
    'Ennas Room__Bengali': 'ENNAS-RM',
    'Mani mansion__Aswini Derad Monga': 'MANI-RM1',
    'Mani mansion__With Snip Saloon': 'MANI-RM2',
    'Goa Flat__a) Flat no 1': 'GOA-FLAT1',
    'Goa Flat__b) Flat No.2.': 'GOA-FLAT2',
    'Tonys room__DG/asgar': 'TONY-RM1',
    'Tonys room__Hajra': 'TONY-RM2',
    'Buyculla Club__First Floor Amir Kids': 'BY-1ST',
    'Buyculla Club__Attic Romel': 'BY-MEZZ',
    'Byculla Club__First Floor Amir Kids': 'BY-1ST',
    'Byculla Club__Attic Romel': 'BY-MEZZ',
    'Kandivili__Flat No 2108': 'KAND-2108',
    'Kandivili__Flat No 2109': 'KAND-2109',
    'Kandivli__Flat No 2108': 'KAND-2108',
    'Kandivli__Flat No 2109': 'KAND-2109'
  };

  // Helper to parse months covered by a receipt into sorted array of 'YYYY-MM'
  const parseMonthsPaidFor = (monthPaidForStr, allocations, fallbackMonth) => {
    const mSet = new Set();
    if (allocations && Array.isArray(allocations)) {
      for (const a of allocations) {
        if (a.rentMonthYear && /^\d{4}-\d{2}$/.test(a.rentMonthYear)) {
          mSet.add(a.rentMonthYear);
        }
      }
    }
    if (monthPaidForStr && typeof monthPaidForStr === 'string') {
      const parts = monthPaidForStr.split(',').map(s => s.trim()).filter(Boolean);
      const monthNames = {
        jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
        jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
      };
      for (const p of parts) {
        if (/^\d{4}-\d{2}$/.test(p)) {
          mSet.add(p);
        } else {
          const match = p.match(/([a-zA-Z]+)[^\d]*(\d{4})/);
          if (match) {
            const mKey = match[1].slice(0, 3).toLowerCase();
            const mNum = monthNames[mKey];
            if (mNum) mSet.add(`${match[2]}-${mNum}`);
          }
        }
      }
    }
    if (mSet.size === 0 && fallbackMonth && /^\d{4}-\d{2}$/.test(fallbackMonth)) {
      mSet.add(fallbackMonth);
    }
    return Array.from(mSet).sort();
  };

  const formatMonthsList = (monthsArr) => {
    if (!monthsArr || monthsArr.length === 0) return '';
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return monthsArr.map(m => {
      const [y, mon] = m.split('-').map(Number);
      return `${monthNames[mon - 1]} ${y}`;
    }).join(', ');
  };

  // Fetch DB units to map unitCode -> ObjectId
  const dbUnits = await Unit.find().populate('propertyId').lean();
  const codeToId = {};
  dbUnits.forEach(u => { if (u.unitCode) codeToId[u.unitCode] = String(u._id); });

  // Build MATRIX_UNIT_CODE_MAP: "propertyName__unitLabel" -> unitCode (for baseline.json cross-referencing)
  const MATRIX_UNIT_CODE_MAP = { ...CANONICAL_BASELINE_UNIT_MAP };
  dbUnits.forEach(u => {
    if (u.unitCode && u.propertyId) {
      const propName = u.propertyId.name || '';
      const unitLabel = u.unitName || u.unitCode || '';
      MATRIX_UNIT_CODE_MAP[`${propName}__${unitLabel}`] = u.unitCode;
      MATRIX_UNIT_CODE_MAP[`${propName}__${u.unitCode}`] = u.unitCode;
      if (u.subUnitPartition) {
        MATRIX_UNIT_CODE_MAP[`${propName}__${u.subUnitPartition}`] = u.unitCode;
      }
    }
  });

  // Fetch PaymentAllocations & PaymentReceipts from MongoDB (excluding reversed receipts)
  const reversedReceiptIds = (await PaymentReceipt.find({ isReversed: true }).select('_id')).map(r => r._id);
  const activeReceipts = await PaymentReceipt.find({
    isReversed: { $ne: true }
  }).lean();
  const allAllocations = await PaymentAllocation.find({
    receiptId: { $nin: reversedReceiptIds }
  }).lean();

  const allocsByReceiptId = {};
  for (const a of allAllocations) {
    const rid = String(a.receiptId);
    if (!allocsByReceiptId[rid]) allocsByReceiptId[rid] = [];
    allocsByReceiptId[rid].push(a);
  }

  // Aggregate receipts by LAST month paid for:
  // e.g., For REC-2026-00712 (months paid for Oct 2025, Nov 2025, Dec 2025),
  // place full 150,000 into Dec 2025.
  const unitMonthAmounts = {};
  const unitMonthMeta = {};

  for (const r of activeReceipts) {
    const rAllocations = allocsByReceiptId[String(r._id)] || [];
    const fallbackMonth = r.accountingMonth || (r.receiptDate ? new Date(r.receiptDate).toISOString().slice(0, 7) : null);
    const monthsSorted = parseMonthsPaidFor(r.monthPaidFor, rAllocations, fallbackMonth);
    if (monthsSorted.length === 0) continue;

    // Pick the LAST month chronologically
    const targetMonth = monthsSorted[monthsSorted.length - 1];
    const uId = r.unitId?._id ? String(r.unitId._id) : String(r.unitId || '');
    if (!uId) continue;

    const rentAmt = (r.rentAmount !== undefined && r.rentAmount !== null && r.rentAmount > 0)
      ? Number(r.rentAmount)
      : (Number(r.totalAmount) || 0);

    const key = `${uId}_${targetMonth}`;
    unitMonthAmounts[key] = (unitMonthAmounts[key] || 0) + rentAmt;

    const coveredText = formatMonthsList(monthsSorted);
    const noteText = monthsSorted.length > 1
      ? `Rent paid for ${coveredText} (${r.receiptNumber})`
      : (r.receiptNumber ? `Receipt ${r.receiptNumber}` : '');

    if (!unitMonthMeta[key]) unitMonthMeta[key] = [];
    unitMonthMeta[key].push({
      receiptId: r._id,
      receiptNumber: r.receiptNumber,
      amount: rentAmt,
      targetMonth,
      monthsCovered: monthsSorted,
      coveredText,
      note: noteText,
      monthPaidForRaw: r.monthPaidFor,
      tenantId: r.tenantId,
      unitId: uId
    });
  }

  // Fetch DB Expenses
  const dbExpenses = await Expense.find({
    isReversed: { $ne: true }
  }).populate('propertyId').lean();

  // Load canonical Sheet 1 structure
  let baselineData;
  try {
    baselineData = JSON.parse(JSON.stringify(require('../data/sheet1_baseline.json')));
  } catch (e) {
    baselineData = { rentGroups: [], expenseGroups: [], depositReceived: {}, loanReceived: {}, reconciliation: {} };
  }

  let rentGroups = baselineData?.rentGroups || [];
  let expenseGroups = baselineData?.expenseGroups || [];
  let depositReceived = baselineData?.depositReceived || {};
  let loanReceived = baselineData?.loanReceived || {};

  // Part 1: Rent Groups and Units
  const rentTotals = {};
  const totalIncome = {};
  months.forEach(m => {
    rentTotals[m] = 0;
    totalIncome[m] = 0;
  });

  for (const grp of rentGroups) {
    grp.propertyTotals = {};
    for (const u of grp.units) {
      u.months = u.months || {};
      u.cellDetails = {};
      const mapKey = `${grp.propertyName}__${u.label}`;
      const uCode = MATRIX_UNIT_CODE_MAP[mapKey] || u.unitCode;
      const uId = uCode ? codeToId[uCode] : null;
      u.unitId = uId || null;

      const unitNotes = [];

      for (const m of months) {
        const k = uId ? `${uId}_${m}` : null;
        if (k && unitMonthAmounts[k] !== undefined && unitMonthAmounts[k] !== null) {
          u.months[m] = unitMonthAmounts[k];
          if (unitMonthMeta[k] && unitMonthMeta[k][0]) {
            u.cellDetails[m] = unitMonthMeta[k][0];
            if (unitMonthMeta[k][0].note) {
              unitNotes.push(unitMonthMeta[k][0].note);
            }
          }
        } else if (u.months[m] === undefined || u.months[m] === null) {
          u.months[m] = 0;
        }
      }
      u.total = months.reduce((s, m) => s + (u.months[m] || 0), 0);
      u.notes = Array.from(new Set(unitNotes)).join('; ');
    }

    for (const m of months) {
      const gSum = grp.units.reduce((s, u) => s + (u.months[m] || 0), 0);
      grp.propertyTotals[m] = gSum;
      rentTotals[m] += gSum;
    }
    grp.propertyTotal = months.reduce((s, m) => s + (grp.propertyTotals[m] || 0), 0);
  }

  months.forEach(m => {
    totalIncome[m] = rentTotals[m] + (depositReceived[m] || 0) + (loanReceived[m] || 0);
  });

  // Part 2: Expense Groups and Heads
  const totalExpenses = {};
  months.forEach(m => { totalExpenses[m] = 0; });

  for (const grp of expenseGroups) {
    grp.groupTotals = {};
    for (const h of grp.heads) {
      h.months = h.months || {};
      for (const m of months) {
        if (h.months[m] === undefined || h.months[m] === null) {
          const matching = dbExpenses.filter(e => {
            const expM = e.expenseMonth || (e.expenseDate ? e.expenseDate.slice(0, 7) : '');
            if (expM !== m) return false;
            const pName = e.propertyId?.name || '';
            const isCommon = e.propertyId?.propertyType === 'General / Common' || e.propertyId?.propertyCode === 'PROP-COMMON';
            if (grp.groupName === 'Other Expenses') {
              return isCommon && (e.category || '').toLowerCase().includes(h.headName.toLowerCase());
            } else {
              return pName.toLowerCase().includes(grp.groupName.toLowerCase()) && (e.category || '').toLowerCase().includes(h.headName.toLowerCase());
            }
          });
          h.months[m] = matching.reduce((s, e) => s + (e.amount || 0), 0);
        }
      }
      h.total = months.reduce((s, m) => s + (h.months[m] || 0), 0);
    }

    for (const m of months) {
      const gSum = grp.heads.reduce((s, h) => s + (h.months[m] || 0), 0);
      grp.groupTotals[m] = gSum;
      totalExpenses[m] += gSum;
    }
    grp.groupTotal = months.reduce((s, m) => s + (grp.groupTotals[m] || 0), 0);
  }

  // Part 3: Balance Reconciliation
  const diff = {};
  const balPrev = {};
  const totBal = {};
  const minAdj = baselineData?.reconciliation?.adjustments || {};

  // Compute carried forward balance at months[0]
  let runningBal = 3843345; // Baseline opening balance at 2025-03 from Sheet 1
  const baselineMonths = ['2025-03','2025-04','2025-05','2025-06','2025-07','2025-08','2025-09','2025-10','2025-11','2025-12','2026-01','2026-02'];

  if (months[0] > '2025-03') {
    for (const bm of baselineMonths) {
      if (bm >= months[0]) break;
      const bInc = baselineData?.totalIncome?.[bm] || 0;
      const bExp = baselineData?.totalExpenses?.[bm] || 0;
      const bDiff = bInc - bExp;
      const bAdj = minAdj[bm] || 0;
      runningBal = runningBal + bDiff + bAdj;
    }
  }

  for (const m of months) {
    const d = totalIncome[m] - totalExpenses[m];
    diff[m] = d;
    balPrev[m] = runningBal;
    const endBal = runningBal + d + (minAdj[m] || 0);
    totBal[m] = endBal;
    runningBal = endBal;
  }

  const reconciliation = {
    difference: diff,
    balancePreviousMonth: balPrev,
    adjustments: minAdj,
    totalBalance: totBal
  };

  // Optional Property Filter
  if (propertyId) {
    const propDoc = await Property.findById(propertyId).lean();
    if (propDoc) {
      rentGroups = rentGroups.filter(g => 
        g.propertyName.toLowerCase().includes(propDoc.name.toLowerCase()) || 
        propDoc.name.toLowerCase().includes(g.propertyName.toLowerCase())
      );
      expenseGroups = expenseGroups.filter(g => 
        g.groupName.toLowerCase().includes(propDoc.name.toLowerCase()) || 
        propDoc.name.toLowerCase().includes(g.groupName.toLowerCase())
      );
    }
  }

  return {
    period,
    periodLabel,
    isSheet1Period: true,
    months: monthObjects,
    rentPart: {
      rentGroups,
      rentTotals,
      depositReceived,
      loanReceived,
      totalIncome
    },
    expensePart: {
      expenseGroups,
      totalExpenses
    },
    reconciliationPart: reconciliation
  };
}

// @route GET /api/reports/property-monthly-matrix
// Master Financial Spreadsheet (Sheet 1) endpoint:
// Part 1: Rent Statement + Total Income
// Part 2: Actual Expense Statement + Total Expenses
// Part 3: Cash Flow & Balance Reconciliation


router.get('/property-monthly-matrix', protect, async (req, res) => {
  try {
    const { period, year, viewMode, propertyId, startMonth, endMonth } = req.query;
    const data = await generateSheet1ReportData({
      period,
      year: year ? parseInt(year, 10) : undefined,
      viewMode,
      propertyId,
      startMonth,
      endMonth
    });
    res.json({ success: true, ...data });
  } catch (error) {
    console.error('Error generating property monthly matrix:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route GET /api/reports/export-property-monthly-matrix-excel
// Generates Multi-Section Excel Workbook matching Sheet 1 exactly
router.get('/export-property-monthly-matrix-excel', protect, async (req, res) => {
  try {
    const { period, year, viewMode, propertyId, startMonth, endMonth } = req.query;
    const data = await generateSheet1ReportData({
      period,
      year: year ? parseInt(year, 10) : undefined,
      viewMode,
      propertyId,
      startMonth,
      endMonth
    });

    const monthKeys = data.months.map(m => m.monthKey);
    const monthLabels = data.months.map(m => m.shortLabel || m.monthLabel);

    const sheetRows = [];

    // Title Row
    sheetRows.push([`MASTER MONTHLY FINANCIAL STATEMENT (SHEET 1) · ${data.periodLabel}`]);
    sheetRows.push(['']);

    // --- PART 1: RENT / REVENUE STATEMENT ---
    sheetRows.push(['1. RENT / REVENUE STATEMENT']);
    sheetRows.push([
      'Sr. No.',
      'Partition',
      'Property / Tenant',
      ...monthLabels,
      'Total (₹)',
      'Property Totals (₹)',
      'Notes'
    ]);

    data.rentPart.rentGroups.forEach(grp => {
      sheetRows.push([
        grp.order,
        '',
        grp.propertyName,
        ...monthKeys.map(() => ''),
        '',
        grp.propertyTotal || '',
        ''
      ]);

      grp.units.forEach(u => {
        sheetRows.push([
          '',
          u.partitionCode || '',
          u.label,
          ...monthKeys.map(m => u.months[m] || 0),
          u.total || 0,
          '',
          u.notes || ''
        ]);
      });
    });

    // Summary Rows for Part 1
    sheetRows.push([
      '', '', 'Total Rent',
      ...monthKeys.map(m => data.rentPart.rentTotals[m] || 0),
      monthKeys.reduce((s, m) => s + (data.rentPart.rentTotals[m] || 0), 0),
      '', ''
    ]);
    sheetRows.push([
      '', '', 'Deposit Received',
      ...monthKeys.map(m => data.rentPart.depositReceived[m] || 0),
      monthKeys.reduce((s, m) => s + (data.rentPart.depositReceived[m] || 0), 0),
      '', ''
    ]);
    sheetRows.push([
      '', '', 'Loan received',
      ...monthKeys.map(m => data.rentPart.loanReceived[m] || 0),
      monthKeys.reduce((s, m) => s + (data.rentPart.loanReceived[m] || 0), 0),
      '', ''
    ]);
    sheetRows.push([
      '', '', 'Total Income',
      ...monthKeys.map(m => data.rentPart.totalIncome[m] || 0),
      monthKeys.reduce((s, m) => s + (data.rentPart.totalIncome[m] || 0), 0),
      '', ''
    ]);

    sheetRows.push(['']); // Blank separator

    // --- PART 2: ACTUAL EXPENSE STATEMENT ---
    sheetRows.push(['2. ACTUAL EXPENSE STATEMENT']);
    sheetRows.push([
      'Sr. No.',
      '',
      'Property / Expense Head',
      ...monthLabels,
      'Total (₹)',
      'Group Totals (₹)',
      'Notes'
    ]);

    data.expensePart.expenseGroups.forEach(grp => {
      sheetRows.push([
        grp.order,
        '',
        grp.groupName,
        ...monthKeys.map(() => ''),
        '',
        grp.groupTotal || '',
        ''
      ]);

      grp.heads.forEach(h => {
        sheetRows.push([
          '',
          '',
          h.headName,
          ...monthKeys.map(m => h.months[m] || 0),
          h.total || 0,
          '',
          ''
        ]);
      });
    });

    sheetRows.push([
      '', '', 'Total Expenses',
      ...monthKeys.map(m => data.expensePart.totalExpenses[m] || 0),
      monthKeys.reduce((s, m) => s + (data.expensePart.totalExpenses[m] || 0), 0),
      '', ''
    ]);

    sheetRows.push(['']); // Blank separator

    // --- PART 3: CASH FLOW & BALANCE RECONCILIATION ---
    sheetRows.push(['3. CASH FLOW & BALANCE RECONCILIATION']);
    sheetRows.push([
      '', '', 'Difference (Income - Expenses)',
      ...monthKeys.map(m => data.reconciliationPart.difference[m] || 0),
      monthKeys.reduce((s, m) => s + (data.reconciliationPart.difference[m] || 0), 0),
      '', ''
    ]);
    sheetRows.push([
      '', '', 'Balance of previous month',
      ...monthKeys.map(m => data.reconciliationPart.balancePreviousMonth[m] || 0),
      '', '', ''
    ]);
    sheetRows.push([
      '', '', 'Minnor adjustments',
      ...monthKeys.map(m => data.reconciliationPart.adjustments[m] || 0),
      monthKeys.reduce((s, m) => s + (data.reconciliationPart.adjustments[m] || 0), 0),
      '', ''
    ]);
    sheetRows.push([
      '', '', 'Total Balance (Closing)',
      ...monthKeys.map(m => data.reconciliationPart.totalBalance[m] || 0),
      '', '', ''
    ]);

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(sheetRows);

    ws['!cols'] = [
      { wch: 8 },  // Sr No
      { wch: 15 }, // Partition
      { wch: 32 }, // Label
      ...monthKeys.map(() => ({ wch: 14 })),
      { wch: 16 }, // Total
      { wch: 18 }, // Property Totals
      { wch: 15 }  // Notes
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const filename = `Master_Monthly_Statement_${data.period}.xlsx`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (error) {
    console.error('Error exporting sheet 1 matrix:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route GET /api/reports/lease-contract-matrix
// Returns lease contract monthly rate matrix by property & partition/unit with timeline details
router.get('/lease-contract-matrix', protect, async (req, res) => {
  try {
    const filterYear = req.query.year || '2026';
    let startMonth = req.query.startMonth || req.query.fromMonth || null;
    let endMonth = req.query.endMonth || req.query.toMonth || null;
    const tenantIdFilter = req.query.tenantId || null;
    const propertyIdFilter = req.query.propertyId || null;

    // Normalize startMonth and endMonth if given as single or two-digit month
    if (startMonth && !startMonth.includes('-') && filterYear !== 'all') {
      startMonth = `${filterYear}-${String(startMonth).padStart(2, '0')}`;
    }
    if (endMonth && !endMonth.includes('-') && filterYear !== 'all') {
      endMonth = `${filterYear}-${String(endMonth).padStart(2, '0')}`;
    }

    // 1. Fetch properties & units
    let propQuery = {};
    if (propertyIdFilter) {
      propQuery._id = propertyIdFilter;
    }
    const properties = await Property.find(propQuery).sort({ displayOrder: 1, name: 1 }).lean();
    
    let unitQuery = {};
    if (propertyIdFilter) {
      unitQuery.propertyId = propertyIdFilter;
    }
    const units = await Unit.find(unitQuery).sort({ displayOrder: 1, unitCode: 1 }).lean();

    // Map units to property
    const propUnitsMap = {};
    properties.forEach(p => {
      propUnitsMap[p._id.toString()] = [];
    });
    units.forEach(u => {
      const pid = u.propertyId?.toString();
      if (propUnitsMap[pid]) {
        propUnitsMap[pid].push(u);
      }
    });

    // 2. Fetch all tenants for filter dropdown
    const allTenants = await Tenant.find({}).select('name tenantCode phone isActive').sort({ name: 1 }).lean();

    // 3. Fetch assignments
    const assignQuery = {
      status: { $nin: ['Terminated', 'Cancelled'] }
    };
    if (tenantIdFilter) {
      assignQuery.tenantId = tenantIdFilter;
    }
    const assignments = await TenantAssignment.find(assignQuery)
      .populate('tenantId', 'name tenantCode phone')
      .sort({ startDate: 1 })
      .lean();

    // 4. Fetch rent agreements
    const assignIds = assignments.map(a => a._id);
    const agreements = await RentAgreement.find({ assignmentId: { $in: assignIds } })
      .sort({ effectiveFrom: 1 })
      .lean();

    const agMap = {};
    agreements.forEach(ag => {
      const k = String(ag.assignmentId);
      if (!agMap[k]) agMap[k] = [];
      agMap[k].push(ag);
    });

    // 5. Gather all years from assignments for dropdown
    const availableYearsSet = new Set(['2026', '2025', '2024', '2027']);
    assignments.forEach(a => {
      if (a.startDate) {
        availableYearsSet.add(new Date(a.startDate).getUTCFullYear().toString());
      }
      if (a.endDate) {
        availableYearsSet.add(new Date(a.endDate).getUTCFullYear().toString());
      }
    });
    const availableYears = Array.from(availableYearsSet).sort().reverse();

    const allYearsNum = Array.from(availableYearsSet).map(Number);
    let minYear = Math.min(...allYearsNum);
    let maxYear = Math.max(...allYearsNum);

    // Build all available continuous months across portfolio years
    const allAvailableMonths = [];
    for (let y = minYear; y <= maxYear; y++) {
      for (let m = 1; m <= 12; m++) {
        allAvailableMonths.push(`${y}-${String(m).padStart(2, '0')}`);
      }
    }

    // 6. Build month range
    let sortedMonths = [];
    if (filterYear !== 'all') {
      sortedMonths = Array.from({ length: 12 }, (_, i) => `${filterYear}-${String(i + 1).padStart(2, '0')}`);
    } else {
      sortedMonths = [...allAvailableMonths];
    }

    if (startMonth) {
      sortedMonths = sortedMonths.filter(m => m >= startMonth);
    }
    if (endMonth) {
      sortedMonths = sortedMonths.filter(m => m <= endMonth);
    }

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthLabels = sortedMonths.map(m => {
      const [y, mo] = m.split('-').map(Number);
      return {
        key: m,
        label: `${monthNames[mo - 1]} ${y}`,
        shortLabel: monthNames[mo - 1],
        month: mo,
        year: y
      };
    });

    // Group assignments by unitId string
    const assignsByUnit = {};
    assignments.forEach(a => {
      const uid = String(a.unitId);
      if (!assignsByUnit[uid]) assignsByUnit[uid] = [];
      assignsByUnit[uid].push(a);
    });

    // 7. Calculate cells for each unit & property
    const columnTotals = {};
    const columnOccupiedCounts = {};
    const columnVacantCounts = {};
    sortedMonths.forEach(m => {
      columnTotals[m] = 0;
      columnOccupiedCounts[m] = 0;
      columnVacantCounts[m] = 0;
    });

    let grandTotalPeriodRent = 0;
    let totalUnitSlots = 0;
    let totalOccupiedSlots = 0;

    const rows = properties.map(p => {
      const pid = p._id.toString();
      const pUnits = propUnitsMap[pid] || [];

      const propMonthlyRent = {};
      const propMonthlyOccupied = {};
      const propMonthlyVacant = {};
      sortedMonths.forEach(m => {
        propMonthlyRent[m] = 0;
        propMonthlyOccupied[m] = 0;
        propMonthlyVacant[m] = 0;
      });

      let propPeriodTotal = 0;

      const childUnits = pUnits.map(u => {
        const uid = u._id.toString();
        const uAssigns = assignsByUnit[uid] || [];

        const monthlyCells = {};
        let unitPeriodTotal = 0;
        let occupiedMonths = 0;
        let activeTenantsInPeriod = new Set();
        let lastKnownTenant = '';
        let lastKnownContractNo = '';

        sortedMonths.forEach(m => {
          totalUnitSlots++;
          const [yr, mo] = m.split('-').map(Number);
          const mStartStr = `${m}-01`;
          const lastDay = new Date(Date.UTC(yr, mo, 0)).getUTCDate();
          const mEndStr = `${m}-${String(lastDay).padStart(2, '0')}`;

          // Find active assignment in month m
          const matchingAssigns = uAssigns.filter(a => {
            const sStr = a.startDate ? new Date(a.startDate).toISOString().slice(0, 10) : '0000-01-01';
            const eStr = a.endDate ? new Date(a.endDate).toISOString().slice(0, 10) : '9999-12-31';
            return sStr <= mEndStr && eStr >= mStartStr;
          });

          let activeAssign = null;
          if (matchingAssigns.length > 0) {
            matchingAssigns.sort((a, b) => {
              if (a.status === 'Active' && b.status !== 'Active') return -1;
              if (b.status === 'Active' && a.status !== 'Active') return 1;
              const aStart = a.startDate ? new Date(a.startDate).getTime() : 0;
              const bStart = b.startDate ? new Date(b.startDate).getTime() : 0;
              return bStart - aStart;
            });
            activeAssign = matchingAssigns[0];
          }

          if (activeAssign) {
            const uAgs = agMap[String(activeAssign._id)] || [];
            let matchingAg = uAgs.find(ag => {
              const agStart = ag.effectiveFrom ? new Date(ag.effectiveFrom).toISOString().slice(0, 10) : '0000-01-01';
              const agEnd = ag.effectiveTo ? new Date(ag.effectiveTo).toISOString().slice(0, 10) : '9999-12-31';
              return agStart <= mEndStr && agEnd >= mStartStr;
            });

            if (!matchingAg) {
              matchingAg = uAgs.find(ag => ag.isCurrentRate) || uAgs[uAgs.length - 1];
            }

            const rate = matchingAg ? Number(matchingAg.monthlyRate || 0) : Number(u.monthlyRentExpected || 0);
            const tenantName = activeAssign.tenantId ? activeAssign.tenantId.name : 'Unknown';
            const contractNo = activeAssign.contractNo || '';

            monthlyCells[m] = {
              rate: rate,
              tenantName: tenantName,
              tenantCode: activeAssign.tenantId?.tenantCode || '',
              tenantPhone: activeAssign.tenantId?.phone || '',
              tenantId: activeAssign.tenantId?._id ? activeAssign.tenantId._id.toString() : '',
              contractNo: contractNo,
              contractType: activeAssign.contractType || 'Rent',
              startDate: activeAssign.startDate,
              endDate: activeAssign.endDate,
              status: activeAssign.status,
              assignmentId: activeAssign._id ? activeAssign._id.toString() : '',
              assignmentCode: activeAssign.assignmentCode || '',
              securityDeposit: activeAssign.securityDeposit || 0,
              noticePeriodMonths: activeAssign.noticePeriodMonths || 1,
              rentDueDay: activeAssign.rentDueDay || 1,
              terms: activeAssign.terms || '',
              notes: activeAssign.notes || '',
              unitName: u.subUnitPartition || u.unitName || u.unitCode,
              unitCode: u.unitCode,
              propertyName: p.name,
              propertyCode: p.propertyCode,
              areaSqFt: u.areaSqFt || 0,
              expectedRate: u.monthlyRentExpected || 0,
              isVacant: false
            };

            unitPeriodTotal += rate;
            occupiedMonths++;
            totalOccupiedSlots++;
            activeTenantsInPeriod.add(tenantName);
            lastKnownTenant = tenantName;
            lastKnownContractNo = contractNo;

            propMonthlyRent[m] += rate;
            propMonthlyOccupied[m] += 1;
            columnTotals[m] += rate;
            columnOccupiedCounts[m] += 1;
          } else {
            // Vacant / unleased
            monthlyCells[m] = {
              rate: null,
              isVacant: true,
              unitName: u.subUnitPartition || u.unitName || u.unitCode,
              unitCode: u.unitCode,
              propertyName: p.name,
              propertyCode: p.propertyCode,
              areaSqFt: u.areaSqFt || 0,
              expectedRate: u.monthlyRentExpected || 0
            };
            propMonthlyVacant[m] += 1;
            columnVacantCounts[m] += 1;
          }
        });

        propPeriodTotal += unitPeriodTotal;
        grandTotalPeriodRent += unitPeriodTotal;

        const occupancyPct = sortedMonths.length > 0 
          ? Math.round((occupiedMonths / sortedMonths.length) * 100) 
          : 0;

        return {
          unitId: uid,
          unitCode: u.unitCode,
          subUnitPartition: u.subUnitPartition || u.unitName || u.unitCode,
          unitName: u.unitName || u.subUnitPartition || u.unitCode,
          areaSqFt: u.areaSqFt || 0,
          expectedRate: u.monthlyRentExpected || 0,
          monthlyCells,
          totalPeriodRent: unitPeriodTotal,
          occupiedMonths,
          vacantMonths: sortedMonths.length - occupiedMonths,
          occupancyPct,
          tenants: Array.from(activeTenantsInPeriod),
          currentTenant: lastKnownTenant || 'Vacant',
          contractNo: lastKnownContractNo || '-'
        };
      });

      const totalPropUnits = pUnits.length;
      const propOccupancyPct = (totalPropUnits > 0 && sortedMonths.length > 0)
        ? Math.round((Object.values(propMonthlyOccupied).reduce((s, c) => s + c, 0) / (totalPropUnits * sortedMonths.length)) * 100)
        : 0;

      // Property monthly units breakdown
      const propMonthlyBreakdown = {};
      sortedMonths.forEach(m => {
        propMonthlyBreakdown[m] = childUnits.map(cu => ({
          unitId: cu.unitId,
          unitName: cu.subUnitPartition,
          unitCode: cu.unitCode,
          rate: cu.monthlyCells[m]?.rate,
          isVacant: cu.monthlyCells[m]?.isVacant,
          tenantName: cu.monthlyCells[m]?.tenantName || 'Vacant',
          contractNo: cu.monthlyCells[m]?.contractNo || '—',
          status: cu.monthlyCells[m]?.status || 'Vacant'
        }));
      });

      return {
        propertyId: pid,
        propertyName: p.name,
        propertyCode: p.propertyCode,
        propertyType: p.propertyType,
        totalAreaSqFt: p.totalAreaSqFt || 0,
        unitsCount: totalPropUnits,
        monthlyRent: propMonthlyRent,
        monthlyOccupied: propMonthlyOccupied,
        monthlyVacant: propMonthlyVacant,
        monthlyBreakdown: propMonthlyBreakdown,
        totalPeriodRent: propPeriodTotal,
        occupancyPct: propOccupancyPct,
        units: childUnits
      };
    });

    const averageOccupancyPct = totalUnitSlots > 0
      ? Math.round((totalOccupiedSlots / totalUnitSlots) * 100)
      : 0;

    const columnSummary = sortedMonths.map(m => ({
      key: m,
      totalRent: columnTotals[m] || 0,
      occupiedUnits: columnOccupiedCounts[m] || 0,
      vacantUnits: columnVacantCounts[m] || 0,
      totalUnits: (columnOccupiedCounts[m] || 0) + (columnVacantCounts[m] || 0),
      occupancyPct: ((columnOccupiedCounts[m] || 0) + (columnVacantCounts[m] || 0)) > 0
        ? Math.round(((columnOccupiedCounts[m] || 0) / ((columnOccupiedCounts[m] || 0) + (columnVacantCounts[m] || 0))) * 100)
        : 0
    }));

    res.json({
      success: true,
      year: filterYear,
      startMonth,
      endMonth,
      tenantId: tenantIdFilter,
      propertyId: propertyIdFilter,
      months: sortedMonths,
      monthLabels,
      availableYears,
      availableMonths: allAvailableMonths,
      tenants: allTenants,
      properties: properties.map(p => ({ _id: p._id, name: p.name, propertyCode: p.propertyCode })),
      rows,
      summary: {
        grandTotalPeriodRent,
        totalProperties: properties.length,
        totalUnits: units.length,
        totalUnitSlots,
        totalOccupiedSlots,
        averageOccupancyPct,
        columnSummary
      }
    });
  } catch (error) {
    console.error('Error fetching lease contract matrix report:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route GET /api/reports/export-lease-contract-matrix
// Export lease contract matrix to Excel spreadsheet
router.get('/export-lease-contract-matrix', protect, async (req, res) => {
  try {
    const filterYear = req.query.year || '2026';
    let startMonth = req.query.startMonth || req.query.fromMonth || null;
    let endMonth = req.query.endMonth || req.query.toMonth || null;
    const tenantIdFilter = req.query.tenantId || null;
    const propertyIdFilter = req.query.propertyId || null;

    if (startMonth && !startMonth.includes('-') && filterYear !== 'all') {
      startMonth = `${filterYear}-${String(startMonth).padStart(2, '0')}`;
    }
    if (endMonth && !endMonth.includes('-') && filterYear !== 'all') {
      endMonth = `${filterYear}-${String(endMonth).padStart(2, '0')}`;
    }

    let propQuery = {};
    if (propertyIdFilter) propQuery._id = propertyIdFilter;
    const properties = await Property.find(propQuery).sort({ displayOrder: 1, name: 1 }).lean();

    let unitQuery = {};
    if (propertyIdFilter) unitQuery.propertyId = propertyIdFilter;
    const units = await Unit.find(unitQuery).sort({ displayOrder: 1, unitCode: 1 }).lean();

    const propUnitsMap = {};
    properties.forEach(p => { propUnitsMap[p._id.toString()] = []; });
    units.forEach(u => {
      const pid = u.propertyId?.toString();
      if (propUnitsMap[pid]) propUnitsMap[pid].push(u);
    });

    const assignQuery = { status: { $nin: ['Terminated', 'Cancelled'] } };
    if (tenantIdFilter) assignQuery.tenantId = tenantIdFilter;
    const assignments = await TenantAssignment.find(assignQuery)
      .populate('tenantId', 'name tenantCode')
      .sort({ startDate: 1 })
      .lean();

    const assignIds = assignments.map(a => a._id);
    const agreements = await RentAgreement.find({ assignmentId: { $in: assignIds } }).lean();
    const agMap = {};
    agreements.forEach(ag => {
      const k = String(ag.assignmentId);
      if (!agMap[k]) agMap[k] = [];
      agMap[k].push(ag);
    });

    let sortedMonths = [];
    if (filterYear !== 'all') {
      sortedMonths = Array.from({ length: 12 }, (_, i) => `${filterYear}-${String(i + 1).padStart(2, '0')}`);
    } else {
      let minYear = 2024, maxYear = 2026;
      assignments.forEach(a => {
        if (a.startDate) minYear = Math.min(minYear, new Date(a.startDate).getUTCFullYear());
        if (a.endDate) maxYear = Math.max(maxYear, new Date(a.endDate).getUTCFullYear());
      });
      for (let y = minYear; y <= maxYear; y++) {
        for (let m = 1; m <= 12; m++) sortedMonths.push(`${y}-${String(m).padStart(2, '0')}`);
      }
    }

    if (startMonth) sortedMonths = sortedMonths.filter(m => m >= startMonth);
    if (endMonth) sortedMonths = sortedMonths.filter(m => m <= endMonth);

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthHeaders = sortedMonths.map(m => {
      const [y, mo] = m.split('-').map(Number);
      return `${monthNames[mo - 1]} ${y}`;
    });

    const assignsByUnit = {};
    assignments.forEach(a => {
      const uid = String(a.unitId);
      if (!assignsByUnit[uid]) assignsByUnit[uid] = [];
      assignsByUnit[uid].push(a);
    });

    const sheetRows = [];
    // Title block
    sheetRows.push([`LEASE CONTRACT REPORT - MONTHLY RATE TIMELINE (${filterYear})`]);
    sheetRows.push([`Period: ${sortedMonths[0] || ''} to ${sortedMonths[sortedMonths.length - 1] || ''} | Generated: ${new Date().toLocaleDateString('en-GB')}`]);
    sheetRows.push([]); // blank line

    // Header row
    sheetRows.push([
      'Sr No',
      'Property',
      'Partition / Unit',
      'Unit Code',
      'Contract No',
      'Tenant Name',
      ...monthHeaders,
      'Total Period Rent',
      'Occupancy %'
    ]);

    const colTotals = {};
    sortedMonths.forEach(m => { colTotals[m] = 0; });
    let overallPeriodRent = 0;
    let srNo = 1;

    properties.forEach(p => {
      const pid = p._id.toString();
      const pUnits = propUnitsMap[pid] || [];
      if (pUnits.length === 0) return;

      pUnits.forEach(u => {
        const uid = u._id.toString();
        const uAssigns = assignsByUnit[uid] || [];
        let unitTotal = 0;
        let occupiedCount = 0;
        let lastTenant = '';
        let lastContract = '';

        const monthVals = sortedMonths.map(m => {
          const [yr, mo] = m.split('-').map(Number);
          const mStartStr = `${m}-01`;
          const lastDay = new Date(Date.UTC(yr, mo, 0)).getUTCDate();
          const mEndStr = `${m}-${String(lastDay).padStart(2, '0')}`;

          const matchingAssigns = uAssigns.filter(a => {
            const sStr = a.startDate ? new Date(a.startDate).toISOString().slice(0, 10) : '0000-01-01';
            const eStr = a.endDate ? new Date(a.endDate).toISOString().slice(0, 10) : '9999-12-31';
            return sStr <= mEndStr && eStr >= mStartStr;
          });

          if (matchingAssigns.length > 0) {
            matchingAssigns.sort((a, b) => (b.startDate ? new Date(b.startDate).getTime() : 0) - (a.startDate ? new Date(a.startDate).getTime() : 0));
            const activeAssign = matchingAssigns[0];
            const uAgs = agMap[String(activeAssign._id)] || [];
            let matchingAg = uAgs.find(ag => {
              const agStart = ag.effectiveFrom ? new Date(ag.effectiveFrom).toISOString().slice(0, 10) : '0000-01-01';
              const agEnd = ag.effectiveTo ? new Date(ag.effectiveTo).toISOString().slice(0, 10) : '9999-12-31';
              return agStart <= mEndStr && agEnd >= mStartStr;
            }) || uAgs[0];

            const rate = matchingAg ? Number(matchingAg.monthlyRate || 0) : Number(u.monthlyRentExpected || 0);
            unitTotal += rate;
            occupiedCount++;
            colTotals[m] += rate;
            lastTenant = activeAssign.tenantId?.name || '';
            lastContract = activeAssign.contractNo || '';
            return rate;
          } else {
            return ''; // Blank for vacant
          }
        });

        overallPeriodRent += unitTotal;
        const occPct = sortedMonths.length > 0 ? `${Math.round((occupiedCount / sortedMonths.length) * 100)}%` : '0%';

        sheetRows.push([
          srNo++,
          p.name,
          u.subUnitPartition || u.unitName || u.unitCode,
          u.unitCode,
          lastContract || '-',
          lastTenant || 'Vacant',
          ...monthVals,
          unitTotal,
          occPct
        ]);
      });
    });

    // Summary row
    sheetRows.push([]);
    sheetRows.push([
      '',
      'TOTAL CONTRACTED LEASE RENT',
      '',
      '',
      '',
      '',
      ...sortedMonths.map(m => colTotals[m] || 0),
      overallPeriodRent,
      ''
    ]);

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(sheetRows);

    ws['!cols'] = [
      { wch: 8 },  // Sr No
      { wch: 30 }, // Property
      { wch: 25 }, // Partition
      { wch: 14 }, // Unit Code
      { wch: 16 }, // Contract No
      { wch: 24 }, // Tenant
      ...sortedMonths.map(() => ({ wch: 13 })),
      { wch: 18 }, // Total Period Rent
      { wch: 14 }  // Occupancy %
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Lease Contracts');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const filename = `Lease_Contract_Report_${filterYear}.xlsx`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (error) {
    console.error('Error exporting lease contract matrix:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});





module.exports = router;
