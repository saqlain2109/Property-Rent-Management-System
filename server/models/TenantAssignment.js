const mongoose = require('mongoose');

const assignmentSchema = new mongoose.Schema({
  assignmentCode: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  contractNo: {
    type: String,
    trim: true,
    default: '',
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
  startDate: {
    type: Date,
    default: null,
  },
  endDate: {
    type: Date, // null if active
    default: null,
  },
  status: {
    type: String,
    enum: ['Active', 'Past / Vacated', 'Terminated', 'Ended'],
    default: 'Active',
  },
  contractType: {
    type: String,
    enum: ['Rent', 'Business'],
    default: 'Rent',
    trim: true,
  },
  depositHeld: {
    type: Number,
    default: 0,
  },
  depositRefunded: {
    type: Number,
    default: 0,
  },
  loanAmount: {
    type: Number,
    default: 0,
    min: 0,
  },
  initialPaidTillMonth: {
    type: String, // e.g. "2025-11", "2025-12"
    default: null,
  },
  notes: {
    type: String,
    trim: true,
    default: '',
  }
}, {
  timestamps: true,
});

module.exports = mongoose.model('TenantAssignment', assignmentSchema);
