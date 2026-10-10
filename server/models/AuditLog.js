const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  action: {
    type: String,
    required: true, // "CREATE", "UPDATE", "REVERSE", "LOGIN", "MIGRATION"
    uppercase: true,
  },
  entityType: {
    type: String,
    required: true, // "PaymentReceipt", "Expense", "RentAgreement", "Tenant", "Property"
  },
  entityId: {
    type: String,
    default: '',
  },
  description: {
    type: String,
    required: true,
  },
  previousState: {
    type: mongoose.Schema.Types.Mixed,
    default: null,
  },
  newState: {
    type: mongoose.Schema.Types.Mixed,
    default: null,
  },
  ipAddress: {
    type: String,
    default: '',
  }
}, {
  timestamps: true,
});

module.exports = mongoose.model('AuditLog', auditLogSchema);
