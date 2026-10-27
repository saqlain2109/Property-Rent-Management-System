const mongoose = require('mongoose');

const paymentReceiptSchema = new mongoose.Schema({
  receiptNumber: {
    type: String,
    required: true,
    unique: true,
    trim: true, // e.g. "REC-2026-001"
  },
  receiptDate: {
    type: Date,
    required: true, // Actual date cash/bank received (e.g. 2026-01-15)
    index: true,
  },
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: false,
    index: true,
  },
  status: {
    type: String,
    enum: ['Rented', 'Vacant'],
    default: 'Rented',
    index: true,
  },
  unitId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Unit',
    required: true,
    index: true,
  },
  rentAmount: {
    type: Number,
    default: 0,
  },
  depositAmount: {
    type: Number,
    default: 0,
  },
  totalAmount: {
    type: Number,
    required: true,
  },
  comments: {
    type: String,
    trim: true,
    default: '',
  },
  monthPaidFor: {
    type: String,
    trim: true,
    index: true, // e.g. "2026-01" or "2026-01, 2026-02"
  },
  accountingMonth: {
    type: String,
    trim: true,
    index: true, // kept in sync with monthPaidFor
  },
  contractNo: {
    type: String,
    trim: true,
    default: '',
    index: true,
  },
  adjustmentAmount: {
    type: Number,
    default: 0,
  },
  adjustmentDescription: {
    type: String,
    trim: true,
    default: '',
  },
  recordedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  isReversed: {
    type: Boolean,
    default: false,
  },
  reversalReason: {
    type: String,
    trim: true,
    default: '',
  },
  reversalDate: {
    type: Date,
  }
}, {
  timestamps: true,
});

module.exports = mongoose.model('PaymentReceipt', paymentReceiptSchema);
