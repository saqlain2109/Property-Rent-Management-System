const mongoose = require('mongoose');

const unitSchema = new mongoose.Schema({
  unitCode: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    uppercase: true, // e.g. "KO-PG", "65-DELHIERY", "GA-SNIP", "2108"
  },
  propertyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Property',
    required: true,
    index: true,
  },
  subUnitPartition: {
    type: String,
    required: true,
    trim: true, // e.g. "Partition 1", "Room 10", "Water Wala Space"
  },
  unitName: {
    type: String,
    trim: true,
    default: '',
  },
  areaSqFt: {
    type: Number,
    default: 0, // Area of partition in square feet
  },
  unitType: {
    type: String,
    default: 'Godown Partition',
    trim: true,
  },
  floor: {
    type: String,
    trim: true,
    default: '',
  },
  occupancyStatus: {
    type: String,
    enum: ['Occupied', 'Vacant', 'Maintenance', 'Under Notice'],
    default: 'Vacant',
  },
  legacySheetCode: {
    type: String,
    trim: true, // e.g. "Go1", "Ga1", "Ba2", "Ma1", "To1", "By1"
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

module.exports = mongoose.model('Unit', unitSchema);
