const mongoose = require('mongoose');

const paymentAllocationSchema = new mongoose.Schema({
  receiptId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PaymentReceipt',
    required: true,
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
  rentMonthYear: {
    type: String, // e.g. "2025-09", "2026-01" (YYYY-MM)
    required: true,
    index: true,
  },
  allocatedAmount: {
    type: Number,
    required: true,
  },
  isAdvanceOrExcess: {
    type: Boolean,
    default: false,
  },
  contractNo: {
    type: String,
    trim: true,
    default: '',
    index: true,
  },
  notes: {
    type: String,
    trim: true,
    default: '',
  }
}, {
  timestamps: true,
});

module.exports = mongoose.model('PaymentAllocation', paymentAllocationSchema);
