const mongoose = require('mongoose');

const expenseSchema = new mongoose.Schema({
  expenseCode: {
    type: String,
    required: true,
    unique: true,
    trim: true, // e.g. "EXP-2026-001"
  },
  expenseDate: {
    type: Date,
    required: true,
    index: true,
  },
  propertyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Property',
    default: null, // null if general/other expense
    index: true,
  },
  unitId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Unit',
    default: null,
  },
  category: {
    type: String,
    required: true,
    trim: true, // "Maintenance", "Property Rent Paid", "Electricity Meters", "Repairs", "Deposit Refund", "Sweeper", "Miscellaneous"
  },
  amount: {
    type: Number,
    required: true,
    min: 0,
  },
  description: {
    type: String,
    required: true,
    trim: true,
  },
  vendorOrPayee: {
    type: String,
    trim: true,
    default: '',
  },
  paymentMode: {
    type: String,
    enum: ['Cash', 'Bank Transfer', 'Cheque', 'UPI / GPay', 'Other'],
    default: 'Cash',
  },
  referenceNumber: {
    type: String,
    trim: true,
    default: '',
  },
  legacyCode: {
    type: String,
    trim: true, // e.g. "Koe1", "Bye2", "Oe3"
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
  }
}, {
  timestamps: true,
});

module.exports = mongoose.model('Expense', expenseSchema);
