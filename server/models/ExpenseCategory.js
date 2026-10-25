const mongoose = require('mongoose');

const expenseCategorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  headType: {
    type: String,
    enum: ['Property', 'Other', 'Common'],
    default: 'Property',
    index: true,
  },
  description: {
    type: String,
    trim: true,
    default: '',
  },
  isDefault: {
    type: Boolean,
    default: false,
  }
}, {
  timestamps: true,
});

module.exports = mongoose.model('ExpenseCategory', expenseCategorySchema);
