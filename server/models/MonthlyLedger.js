const mongoose = require('mongoose');

const monthlyLedgerSchema = new mongoose.Schema({
  monthYear: {
    type: String, // "2026-01", "2026-02", "2026-03" (YYYY-MM)
    required: true,
    unique: true,
    index: true,
  },
  openingBalance: {
    type: Number,
    required: true,
  },
  totalIncomeReceived: {
    type: Number,
    required: true,
    default: 0,
  },
  totalExpensesPaid: {
    type: Number,
    required: true,
    default: 0,
  },
  netCashFlow: {
    type: Number,
    required: true,
    default: 0,
  },
  closingBalance: {
    type: Number,
    required: true,
  },
  isReconciled: {
    type: Boolean,
    default: true,
  },
  notes: {
    type: String,
    trim: true,
    default: '',
  }
}, {
  timestamps: true,
});

module.exports = mongoose.model('MonthlyLedger', monthlyLedgerSchema);
