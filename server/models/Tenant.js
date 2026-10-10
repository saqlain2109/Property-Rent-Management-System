const mongoose = require('mongoose');

const tenantSchema = new mongoose.Schema({
  tenantCode: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    uppercase: true, // e.g. "TEN-001", "TEN-DELHIERY"
  },
  name: {
    type: String,
    required: true,
    trim: true,
  },
  phone: {
    type: String,
    trim: true,
    default: '',
  },
  email: {
    type: String,
    trim: true,
    default: '',
  },
  idProofType: {
    type: String,
    enum: ['Aadhaar', 'PAN', 'Passport', 'Driving License', 'Company Registration', 'None'],
    default: 'None',
  },
  idProofNumber: {
    type: String,
    trim: true,
    default: '',
  },
  address: {
    type: String,
    trim: true,
    default: '',
  },
  tenantType: {
    type: String,
    enum: ['Individual', 'Commercial Entity', 'PG Operator', 'Co-tenant'],
    default: 'Individual',
  },
  emergencyContactName: {
    type: String,
    trim: true,
    default: '',
  },
  emergencyContactPhone: {
    type: String,
    trim: true,
    default: '',
  },
  notes: {
    type: String,
    trim: true,
    default: '',
  },
  isActive: {
    type: Boolean,
    default: true,
  }
}, {
  timestamps: true,
});

module.exports = mongoose.model('Tenant', tenantSchema);
