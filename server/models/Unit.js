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
  unitName: {
    type: String,
    required: true,
    trim: true, // e.g. "Paying Guest / Kotak PG", "Room 2108"
  },
  unitType: {
    type: String,
    enum: ['Room', 'Godown Partition', 'Shop / Salon', 'Attic', 'Flat', 'PG Beds', 'Garage Space', 'Other'],
    default: 'Room',
  },
  floor: {
    type: String,
    trim: true,
    default: '',
  },
  occupancyStatus: {
    type: String,
    enum: ['Occupied', 'Vacant', 'Maintenance', 'Under Notice'],
    default: 'Occupied',
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
