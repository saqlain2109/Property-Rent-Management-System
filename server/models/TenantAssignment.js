const mongoose = require('mongoose');

const assignmentSchema = new mongoose.Schema({
  assignmentCode: {
    type: String,
    required: true,
    unique: true,
    trim: true,
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
    required: true,
  },
  endDate: {
    type: Date, // null if active
    default: null,
  },
  status: {
    type: String,
    enum: ['Active', 'Past / Vacated', 'Terminated'],
    default: 'Active',
  },
  depositHeld: {
    type: Number,
    default: 0,
  },
  depositRefunded: {
    type: Number,
    default: 0,
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
