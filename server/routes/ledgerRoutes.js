const express = require('express');
const router = express.Router();
const PaymentReceipt = require('../models/PaymentReceipt');
const Expense = require('../models/Expense');
const { syncMonthlyLedgers } = require('../utils/ledgerSync');
const { protect } = require('../middleware/auth');

/**
 * @route GET /api/ledger
 * Generates monthly financial account book dynamically from true underlying transactions
 */
router.get('/', protect, async (req, res) => {
  try {
    const { startMonth, endMonth } = req.query; // YYYY-MM
    let ledgerReport = await syncMonthlyLedgers();

    if (startMonth || endMonth) {
      ledgerReport = ledgerReport.filter(m => {
        if (startMonth && m.monthYear < startMonth) return false;
        if (endMonth && m.monthYear > endMonth) return false;
        return true;
      });
    }

    res.json({ success: true, count: ledgerReport.length, data: ledgerReport });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * @route GET /api/ledger/month-details
 * Returns detailed transaction breakdown (receipts and expenses) for a specific month
 */
router.get('/month-details', protect, async (req, res) => {
  try {
    const { month } = req.query; // YYYY-MM
    if (!month) {
      return res.status(400).json({ success: false, message: 'Month parameter is required (YYYY-MM)' });
    }

    const [year, m] = month.split('-').map(Number);
    const startOfMonth = new Date(year, m - 1, 1);
    const endOfMonth = new Date(year, m, 0, 23, 59, 59, 999);

    const receipts = await PaymentReceipt.find({
      isReversed: false,
      receiptDate: { $gte: startOfMonth, $lte: endOfMonth }
    })
      .populate('tenantId', 'name tenantCode')
      .populate('unitId', 'unitName')
      .sort({ receiptDate: 1 });

    const expenses = await Expense.find({
      isReversed: false,
      expenseDate: { $gte: startOfMonth, $lte: endOfMonth }
    })
      .populate('propertyId', 'name propertyCode')
      .sort({ expenseDate: 1 });

    res.json({
      success: true,
      month,
      receipts,
      expenses,
      totalIncome: receipts.reduce((sum, r) => sum + r.totalAmount, 0),
      totalExpenses: expenses.reduce((sum, e) => sum + e.amount, 0)
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
