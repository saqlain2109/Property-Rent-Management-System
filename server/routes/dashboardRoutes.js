const express = require('express');
const router = express.Router();
const Property = require('../models/Property');
const Unit = require('../models/Unit');
const Tenant = require('../models/Tenant');
const TenantAssignment = require('../models/TenantAssignment');
const PaymentReceipt = require('../models/PaymentReceipt');
const Expense = require('../models/Expense');
const { calculateTenantUnitLedger, getCurrentMonthYear } = require('../services/rentCalculator');
const { protect } = require('../middleware/auth');

router.get('/summary', protect, async (req, res) => {
  try {
    const { targetMonth = getCurrentMonthYear() } = req.query;

    const totalProperties = await Property.countDocuments({ isActive: true });
    const totalUnits = await Unit.countDocuments({ isActive: true });
    const activeAssignments = await TenantAssignment.find({ status: 'Active' });
    const activeTenantsCount = await Tenant.countDocuments({ isActive: true });

    // Aggregate all-time receipts
    const totalIncomeResult = await PaymentReceipt.aggregate([
      { $match: { isReversed: false } },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } }
    ]);
    const totalRentCollected = totalIncomeResult.length > 0 ? totalIncomeResult[0].total : 0;

    // Aggregate all-time expenses
    const totalExpenseResult = await Expense.aggregate([
      { $match: { isReversed: false } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const totalPropertyExpenses = totalExpenseResult.length > 0 ? totalExpenseResult[0].total : 0;

    // Month-specific figures for targetMonth
    const monthIncomeResult = await PaymentReceipt.aggregate([
      {
        $match: {
          isReversed: false,
          $expr: {
            $eq: [{ $dateToString: { format: '%Y-%m', date: '$receiptDate' } }, targetMonth]
          }
        }
      },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } }
    ]);
    const currentMonthCollected = monthIncomeResult.length > 0 ? monthIncomeResult[0].total : 0;

    const monthExpenseResult = await Expense.aggregate([
      {
        $match: {
          isReversed: false,
          $expr: {
            $eq: [{ $dateToString: { format: '%Y-%m', date: '$expenseDate' } }, targetMonth]
          }
        }
      },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const currentMonthExpenses = monthExpenseResult.length > 0 ? monthExpenseResult[0].total : 0;

    // Compute expected rent & outstanding across all active assignments for targetMonth
    let totalExpected = 0;
    let totalOutstanding = 0;
    let monthExpectedRent = 0;
    let monthOutstandingRent = 0;
    let overdueTenantsCount = 0;

    for (const assign of activeAssignments) {
      const ledger = await calculateTenantUnitLedger(assign.unitId, assign.tenantId, targetMonth);
      totalExpected += ledger.totalExpected;
      totalOutstanding += ledger.totalOutstanding;
      if (ledger.totalOutstanding > 0) {
        overdueTenantsCount++;
      }

      const curMonthEntry = ledger.monthsBreakdown.find(m => m.monthYear === targetMonth);
      if (curMonthEntry) {
        monthExpectedRent += (curMonthEntry.expectedRate || 0);
        monthOutstandingRent += (curMonthEntry.outstandingAmount || 0);
      }
    }

    // Receipts filtered strictly by targetMonth
    const recentReceipts = await PaymentReceipt.find({
      isReversed: false,
      $expr: {
        $eq: [{ $dateToString: { format: '%Y-%m', date: '$receiptDate' } }, targetMonth]
      }
    })
      .populate('tenantId', 'name tenantCode')
      .populate({
        path: 'unitId',
        populate: { path: 'propertyId', select: 'name' }
      })
      .sort({ receiptDate: -1 })
      .limit(50);

    // Expenses filtered strictly by targetMonth
    const recentExpenses = await Expense.find({
      isReversed: false,
      $expr: {
        $eq: [{ $dateToString: { format: '%Y-%m', date: '$expenseDate' } }, targetMonth]
      }
    })
      .populate('propertyId', 'name propertyCode')
      .sort({ expenseDate: -1 })
      .limit(50);

    // Available months in database
    const recMonths = await PaymentReceipt.aggregate([
      { $match: { isReversed: false } },
      { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$receiptDate' } } } }
    ]);
    const expMonths = await Expense.aggregate([
      { $match: { isReversed: false } },
      { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$expenseDate' } } } }
    ]);
    const availableMonths = Array.from(new Set([
      '2026-01', '2026-02', '2026-03',
      ...recMonths.map(r => r._id).filter(Boolean),
      ...expMonths.map(e => e._id).filter(Boolean),
      targetMonth
    ])).sort();

    // Occupancy status breakdown
    const occupiedUnits = await Unit.countDocuments({ occupancyStatus: 'Occupied', isActive: true });
    const vacantUnits = await Unit.countDocuments({ occupancyStatus: 'Vacant', isActive: true });

    res.json({
      success: true,
      targetMonth,
      availableMonths,
      stats: {
        totalProperties,
        totalUnits,
        activeTenants: activeTenantsCount,
        occupiedUnits,
        vacantUnits,
        totalExpectedRent: monthExpectedRent || totalExpected,
        cumulativeExpectedRent: totalExpected,
        totalRentCollected,
        totalOutstandingRent: totalOutstanding,
        monthOutstandingRent,
        overdueTenantsCount,
        totalPropertyExpenses,
        currentMonthCollected,
        currentMonthExpenses,
        netCashFlowMonth: currentMonthCollected - currentMonthExpenses
      },
      recentReceipts,
      recentExpenses
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
