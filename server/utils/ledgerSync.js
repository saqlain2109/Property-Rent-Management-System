const PaymentReceipt = require('../models/PaymentReceipt');
const Expense = require('../models/Expense');
const MonthlyLedger = require('../models/MonthlyLedger');

/**
 * Recalculates and synchronizes monthly financial ledgers from authentic transaction records.
 * Baseline opening balance for Jan 2026 is 5,643,188.74 as proven by Excel audit.
 */
async function syncMonthlyLedgers() {
  const BASELINE_OPENING_BALANCE = 5643188.74;
  const BASELINE_START_MONTH = '2026-01';

  // 1. Aggregate all non-reversed receipts by month
  const receipts = await PaymentReceipt.aggregate([
    { $match: { isReversed: false } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m', date: '$receiptDate' } },
        totalIncome: { $sum: '$totalAmount' },
        count: { $sum: 1 }
      }
    }
  ]);
  const receiptMap = {};
  receipts.forEach(r => {
    if (r._id) receiptMap[r._id] = r.totalIncome;
  });

  // 2. Aggregate all non-reversed expenses by month
  const expenses = await Expense.aggregate([
    { $match: { isReversed: false } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m', date: '$expenseDate' } },
        totalExpense: { $sum: '$amount' },
        count: { $sum: 1 }
      }
    }
  ]);
  const expenseMap = {};
  expenses.forEach(e => {
    if (e._id) expenseMap[e._id] = e.totalExpense;
  });

  // 3. Determine current month and latest month to cover
  const now = new Date();
  const currentMonthYear = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const allMonthsSet = new Set([
    ...Object.keys(receiptMap),
    ...Object.keys(expenseMap),
    BASELINE_START_MONTH,
    '2026-03',
    currentMonthYear
  ]);
  const sortedDistinct = Array.from(allMonthsSet).filter(Boolean).sort();
  const earliestMonth = sortedDistinct[0];
  const startMonth = earliestMonth < '2026-01' ? earliestMonth : BASELINE_START_MONTH;
  const maxMonth = sortedDistinct[sortedDistinct.length - 1];

  // 4. Generate continuous sequence of months from startMonth to maxMonth
  const months = [];
  let [curY, curM] = startMonth.split('-').map(Number);
  const [maxY, maxM] = maxMonth.split('-').map(Number);

  while (curY < maxY || (curY === maxY && curM <= maxM)) {
    months.push(`${curY}-${String(curM).padStart(2, '0')}`);
    curM++;
    if (curM > 12) {
      curM = 1;
      curY++;
    }
  }

  // 5. Carry forward balances sequentially
  // Historical baseline for 2024-03 is 5,305,950; Jan 2026 baseline is 5,643,188.74
  let runningBalance = startMonth === '2024-03' ? 5305950 : BASELINE_OPENING_BALANCE;
  const ledgerReport = [];

  const bulkOps = [];
  for (const m of months) {
    if (m === '2024-03') {
      runningBalance = 5305950;
    } else if (m === '2026-01') {
      runningBalance = BASELINE_OPENING_BALANCE; // 5,643,188.74
    }

    const inc = receiptMap[m] || 0;
    const exp = expenseMap[m] || 0;
    const net = inc - exp;
    const opening = runningBalance;
    const closing = opening + net;
    runningBalance = closing;

    bulkOps.push({
      updateOne: {
        filter: { monthYear: m },
        update: {
          $set: {
            monthYear: m,
            openingBalance: opening,
            totalIncomeReceived: inc,
            totalExpensesPaid: exp,
            netCashFlow: net,
            closingBalance: closing,
            isReconciled: true
          }
        },
        upsert: true
      }
    });

    ledgerReport.push({
      monthYear: m,
      openingBalance: opening,
      totalIncomeReceived: inc,
      totalExpensesPaid: exp,
      netCashFlow: net,
      closingBalance: closing,
      isReconciled: true
    });
  }

  if (bulkOps.length > 0) {
    await MonthlyLedger.bulkWrite(bulkOps);
  }

  return ledgerReport;
}

module.exports = { syncMonthlyLedgers };
