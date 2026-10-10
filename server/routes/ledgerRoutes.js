const express = require('express');
const router = express.Router();
const PaymentReceipt = require('../models/PaymentReceipt');
const Expense = require('../models/Expense');
const MonthlyLedger = require('../models/MonthlyLedger');
const { protect } = require('../middleware/auth');

/**
 * Generate monthly financial ledger on the fly from true underlying transactions
 */
router.get('/', protect, async (req, res) => {
  try {
    const { startMonth, endMonth } = req.query; // YYYY-MM
    const ledgers = await MonthlyLedger.find().sort({ monthYear: 1 });

    // Aggregate monthly receipts
    const receipts = await PaymentReceipt.aggregate([
      { $match: { isReversed: false } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m', date: '$receiptDate' } },
          totalIncome: { $sum: '$totalAmount' },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Aggregate monthly expenses
    const expenses = await Expense.aggregate([
      { $match: { isReversed: false } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m', date: '$expenseDate' } },
          totalExpense: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Gather all distinct months
    const allMonths = new Set([
      ...ledgers.map(l => l.monthYear),
      ...receipts.map(r => r._id),
      ...expenses.map(e => e._id)
    ]);
    const sortedMonths = Array.from(allMonths).sort();

    // Baseline opening balance for Jan 2026 is 5,643,188.74 as proven by Excel
    let currentBalance = 5643188.74;
    const ledgerReport = [];

    for (const m of sortedMonths) {
      if (startMonth && m < startMonth) continue;
      if (endMonth && m > endMonth) continue;

      const incObj = receipts.find(r => r._id === m);
      const expObj = expenses.find(e => e._id === m);
      const inc = incObj ? incObj.totalIncome : 0;
      const exp = expObj ? expObj.totalExpense : 0;
      const net = inc - exp;
      const opening = currentBalance;
      const closing = opening + net;
      currentBalance = closing;

      const storedLedger = ledgers.find(l => l.monthYear === m);

      ledgerReport.push({
        monthYear: m,
        openingBalance: opening,
        totalIncomeReceived: inc,
        totalExpensesPaid: exp,
        netCashFlow: net,
        closingBalance: closing,
        storedOpening: storedLedger ? storedLedger.openingBalance : null,
        storedClosing: storedLedger ? storedLedger.closingBalance : null,
        isReconciled: storedLedger ? Math.abs(storedLedger.closingBalance - closing) < 1 : true
      });
    }

    res.json({ success: true, count: ledgerReport.length, data: ledgerReport });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
