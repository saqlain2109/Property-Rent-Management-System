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
const { calculateTenantUnitLedger } = require('../services/rentCalculator');
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

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Disposition', 'attachment; filename="Property_Rent_Management_Export.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
