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
    required: true,
    index: true,
  },
  unitId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Unit',
    required: true,
    index: true,
  },
  totalAmount: {
    type: Number,
    required: true,
    min: 0,
  },
  paymentMode: {
    type: String,
    enum: ['Cash', 'Bank Transfer / NEFT / RTGS', 'Cheque', 'UPI / GPay', 'Other'],
    default: 'Cash',
  },
  referenceNumber: {
    type: String,
    trim: true,
    default: '', // Cheque no / UTR / Transaction id
  },
  bankName: {
    type: String,
    trim: true,
    default: '',
  },
  comments: {
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
