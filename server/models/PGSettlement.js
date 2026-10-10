const mongoose = require('mongoose');

const pgSettlementSchema = new mongoose.Schema({
  monthYear: {
    type: String, // e.g. "2025-08", "2025-09", "2026-01" (YYYY-MM)
    required: true,
    unique: true,
    index: true,
  },
  pgGrossCollection: {
    type: Number,
    required: true,
    min: 0,
  },
  altafShare: {
    type: Number,
    default: 22000,
  },
  anandShare: {
    type: Number,
    default: 10000,
  },
  bisleriWaterShare: {
    type: Number,
    default: 20250,
  },
  rehanShare: {
    type: Number,
    default: 0,
  },
  totalOperatorDeductions: {
    type: Number,
    required: true,
    min: 0,
  },
  netReceivedByOwner: {
    type: Number,
    required: true,
  },
  actualBankReceived: {
    type: Number,
    default: 0,
  },
  discrepancyOrExcess: {
    type: Number,
    default: 0,
  },
  status: {
    type: String,
    enum: ['Settled', 'Partial', 'Pending'],
    default: 'Settled',
  },
  notes: {
    type: String,
    trim: true,
    default: '',
  }
}, {
  timestamps: true,
});

module.exports = mongoose.model('PGSettlement', pgSettlementSchema);
