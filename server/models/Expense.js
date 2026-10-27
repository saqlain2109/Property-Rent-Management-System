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
  expenseMonth: {
    type: String, // e.g. "2026-03"
    trim: true,
    index: true,
  },
  propertyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Property',
    default: null, // null if other/general expense
    index: true,
  },
  unitId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Unit',
    default: null,
  },
  headType: {
    type: String,
    enum: ['Property', 'Other'],
    default: 'Property',
    index: true,
  },
  category: {
    type: String,
    required: true,
    trim: true, // "Maintenance", "Property Rent Paid", "Electricity & Utilities", "Repairs & Renovation", "Deposit Refund", "Sweeper", "Miscellaneous", "MOM", etc.
  },
  amount: {
    type: Number,
    required: true,
    min: 0,
  },
  description: {
    type: String,
    required: false,
    default: '',
    trim: true,
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
