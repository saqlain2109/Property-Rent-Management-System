const mongoose = require('mongoose');

const rentAgreementSchema = new mongoose.Schema({
  assignmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TenantAssignment',
    required: true,
    index: true,
  },
  unitId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Unit',
    required: true,
    index: true,
  },
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true,
  },
  rentType: {
    type: String,
    enum: ['Monthly Fixed', 'Annual Fixed', 'Variable PG Share', 'Irregular / Custom'],
    default: 'Monthly Fixed',
  },
  monthlyRate: {
    type: Number,
    required: true,
    min: 0,
  },
  annualRate: {
    type: Number,
    default: 0,
  },
  cashPortion: {
    type: Number,
    default: 0, // e.g. Amri Kids: 48000 cash portion, 40000 cheque portion
  },
  chequePortion: {
    type: Number,
    default: 0,
  },
  effectiveFrom: {
    type: Date, // Date when this rate took effect (e.g. 2025-11-01)
    required: true,
  },
  effectiveTo: {
    type: Date, // null if currently ongoing
    default: null,
  },
  previousRate: {
    type: Number,
    default: 0,
  },
  reasonForChange: {
    type: String,
    trim: true,
    default: '', // e.g. "Rent increase in Jan 2025 from 20000 to 22000"
  },
  terms: {
    type: String,
    trim: true,
    default: '',
  },
  isCurrentRate: {
    type: Boolean,
    default: true,
  }
}, {
  timestamps: true,
});

module.exports = mongoose.model('RentAgreement', rentAgreementSchema);
