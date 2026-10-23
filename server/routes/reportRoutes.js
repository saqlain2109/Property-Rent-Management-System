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

    const properties = await Property.find().sort({ displayOrder: 1, name: 1 }).lean();
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
      // Default: basis === 'receiptDate'
      const receipts = await PaymentReceipt.find({
        isReversed: false
      }).lean();

      receipts.forEach(r => {
        const d = new Date(r.receiptDate);
        const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
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

    const allAvailableMonths = Array.from(allEverMonthsSet).sort();
    let sortedMonths = [...allAvailableMonths];

    // Filter by year if specified
    if (filterYear !== 'all') {
      sortedMonths = sortedMonths.filter(m => m.startsWith(filterYear));
    }
    // Filter by startMonth and endMonth range if specified
    if (startMonth) {
      sortedMonths = sortedMonths.filter(m => m >= startMonth);
    }
    if (endMonth) {
      sortedMonths = sortedMonths.filter(m => m <= endMonth);
    }

    // Available years for dropdown
    const allYearsSet = new Set();
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
      grandTotal
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

    const properties = await Property.find().sort({ displayOrder: 1, name: 1 }).lean();
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
        const d = new Date(r.receiptDate);
        const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
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

    const header = ['#', 'Property Name', 'Property Code', ...monthHeaderLabels, 'Total'];
    const rangeInfo = (startMonth || endMonth) ? ` (Range: ${startMonth || 'Earliest'} to ${endMonth || 'Latest'})` : '';
    const sheetRows = [
      [`MONTHLY PROPERTY EARNINGS MATRIX (${basis === 'allocatedMonth' ? 'Rent Month Allocated' : 'Collection Month'})${rangeInfo}`],
      [`Generated: ${new Date().toISOString().split('T')[0]}`],
      [''],
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
        p.propertyCode,
        ...monthCols,
        rowTotal
      ]);
    });

    // Last row: Total
    sheetRows.push([
      '',
      'TOTAL EARNINGS',
      '',
      ...sortedMonths.map(m => colTotals[m]),
      grandTotal
    ]);

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(sheetRows);

    // Auto column widths
    ws['!cols'] = [
      { wch: 6 },
      { wch: 36 },
      { wch: 18 },
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
    const { propertyId, unitId, month, basis = 'receiptDate', year = 'all', startMonth, endMonth } = req.query;

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
          rentMonthYear: a.rentMonthYear,
          allocatedAmount: a.allocatedAmount,
          receiptTotalAmount: r.totalAmount,
          paymentMode: r.paymentMode,
          referenceNumber: r.referenceNumber || '',
          bankName: r.bankName || '',
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
      // Basis: receiptDate
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
        receiptQuery.receiptDate = { $gte: dStart, $lte: dEnd };
      } else if (startMonth || endMonth) {
        let dStart, dEnd;
        if (startMonth) {
          const [sy, sm] = startMonth.split('-').map(Number);
          dStart = new Date(Date.UTC(sy, sm - 1, 1, 0, 0, 0));
        }
        if (endMonth) {
          const [ey, em] = endMonth.split('-').map(Number);
          dEnd = new Date(Date.UTC(ey, em, 0, 23, 59, 59, 999));
        }
        if (dStart && dEnd) {
          receiptQuery.receiptDate = { $gte: dStart, $lte: dEnd };
        } else if (dStart) {
          receiptQuery.receiptDate = { $gte: dStart };
        } else if (dEnd) {
          receiptQuery.receiptDate = { $lte: dEnd };
        }
      } else if (year && year !== 'all') {
        const y = Number(year);
        const dStart = new Date(Date.UTC(y, 0, 1, 0, 0, 0));
        const dEnd = new Date(Date.UTC(y, 11, 31, 23, 59, 59, 999));
        receiptQuery.receiptDate = { $gte: dStart, $lte: dEnd };
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
          receiptTotalAmount: r.totalAmount,
          paymentMode: r.paymentMode,
          referenceNumber: r.referenceNumber || '',
          bankName: r.bankName || '',
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
      subtitle = `${mLabel} · ${basis === 'allocatedMonth' ? 'Rent Month (Allocated)' : 'Collection Month (Receipt Date)'}`;
    } else {
      subtitle = `All Months · ${basis === 'allocatedMonth' ? 'Rent Month (Allocated)' : 'Collection Month (Receipt Date)'}`;
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

    const properties = await Property.find().sort({ displayOrder: 1, name: 1 }).lean();
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
      description: e.description,
      paymentMode: e.paymentMode || 'Cash'
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
          paymentMode: r.paymentMode || 'Bank Transfer / NEFT / RTGS',
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

// @route GET /api/reports/monthly-property-earnings
// Returns matrix of all properties with monthly earnings as columns, plus row totals and column totals
router.get('/monthly-property-earnings', protect, async (req, res) => {
  try {
    const basis = req.query.basis === 'allocatedMonth' ? 'allocatedMonth' : 'receiptDate';
    const filterYear = req.query.year || 'all';
    const startMonth = req.query.startMonth || req.query.fromMonth || null;
    const endMonth = req.query.endMonth || req.query.toMonth || null;

    const properties = await Property.find().sort({ displayOrder: 1, name: 1 }).lean();
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
      // Default: basis === 'receiptDate'
      const receipts = await PaymentReceipt.find({
        isReversed: false
      }).lean();

      receipts.forEach(r => {
        const d = new Date(r.receiptDate);
        const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
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

    const allAvailableMonths = Array.from(allEverMonthsSet).sort();
    let sortedMonths = [...allAvailableMonths];

    // Filter by year if specified
    if (filterYear !== 'all') {
      sortedMonths = sortedMonths.filter(m => m.startsWith(filterYear));
    }
    // Filter by startMonth and endMonth range if specified
    if (startMonth) {
      sortedMonths = sortedMonths.filter(m => m >= startMonth);
    }
    if (endMonth) {
      sortedMonths = sortedMonths.filter(m => m <= endMonth);
    }

    // Available years for dropdown
    const allYearsSet = new Set();
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
      grandTotal
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route GET /api/reports/export-monthly-property-matrix
// Exports the monthly property earnings matrix directly into an Excel (.xlsx) file
router.get('/export-monthly-property-matrix', protect, async (req, res) => {
  try {
    const basis = req.query.basis === 'allocatedMonth' ? 'allocatedMonth' : 'receiptDate';
    const filterYear = req.query.year || 'all';
    const startMonth = req.query.startMonth || req.query.fromMonth || null;
    const endMonth = req.query.endMonth || req.query.toMonth || null;

    const properties = await Property.find().sort({ displayOrder: 1, name: 1 }).lean();
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
        const d = new Date(r.receiptDate);
        const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
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

    const header = ['#', 'Property Name', 'Property Code', ...monthHeaderLabels, 'Total'];
    const rangeInfo = (startMonth || endMonth) ? ` (Range: ${startMonth || 'Earliest'} to ${endMonth || 'Latest'})` : '';
    const sheetRows = [
      [`MONTHLY PROPERTY EARNINGS MATRIX (${basis === 'allocatedMonth' ? 'Rent Month Allocated' : 'Collection Month'})${rangeInfo}`],
      [`Generated: ${new Date().toISOString().split('T')[0]}`],
      [''],
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
        p.propertyCode,
        ...monthCols,
        rowTotal
      ]);
    });

    // Last row: Total
    sheetRows.push([
      '',
      'TOTAL EARNINGS',
      '',
      ...sortedMonths.map(m => colTotals[m]),
      grandTotal
    ]);

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(sheetRows);

    // Auto column widths
    ws['!cols'] = [
      { wch: 6 },
      { wch: 36 },
      { wch: 18 },
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
    const { propertyId, unitId, month, basis = 'receiptDate', year = 'all', startMonth, endMonth } = req.query;

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
          rentMonthYear: a.rentMonthYear,
          allocatedAmount: a.allocatedAmount,
          receiptTotalAmount: r.totalAmount,
          paymentMode: r.paymentMode,
          referenceNumber: r.referenceNumber || '',
          bankName: r.bankName || '',
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
      // Basis: receiptDate
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
        receiptQuery.receiptDate = { $gte: dStart, $lte: dEnd };
      } else if (startMonth || endMonth) {
        let dStart, dEnd;
        if (startMonth) {
          const [sy, sm] = startMonth.split('-').map(Number);
          dStart = new Date(Date.UTC(sy, sm - 1, 1, 0, 0, 0));
        }
        if (endMonth) {
          const [ey, em] = endMonth.split('-').map(Number);
          dEnd = new Date(Date.UTC(ey, em, 0, 23, 59, 59, 999));
        }
        if (dStart && dEnd) {
          receiptQuery.receiptDate = { $gte: dStart, $lte: dEnd };
        } else if (dStart) {
          receiptQuery.receiptDate = { $gte: dStart };
        } else if (dEnd) {
          receiptQuery.receiptDate = { $lte: dEnd };
        }
      } else if (year && year !== 'all') {
        const y = Number(year);
        const dStart = new Date(Date.UTC(y, 0, 1, 0, 0, 0));
        const dEnd = new Date(Date.UTC(y, 11, 31, 23, 59, 59, 999));
        receiptQuery.receiptDate = { $gte: dStart, $lte: dEnd };
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
          receiptTotalAmount: r.totalAmount,
          paymentMode: r.paymentMode,
          referenceNumber: r.referenceNumber || '',
          bankName: r.bankName || '',
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
      subtitle = `${mLabel} · ${basis === 'allocatedMonth' ? 'Rent Month (Allocated)' : 'Collection Month (Receipt Date)'}`;
    } else {
      subtitle = `All Months · ${basis === 'allocatedMonth' ? 'Rent Month (Allocated)' : 'Collection Month (Receipt Date)'}`;
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

    const properties = await Property.find().sort({ displayOrder: 1, name: 1 }).lean();
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
      description: e.description,
      paymentMode: e.paymentMode || 'Cash'
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
          paymentMode: r.paymentMode || 'Bank Transfer / NEFT / RTGS',
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

module.exports = router;
