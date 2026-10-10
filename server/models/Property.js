const mongoose = require('mongoose');

const propertySchema = new mongoose.Schema({
  propertyCode: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    uppercase: true, // e.g. "PROP-001", "KOTAK", "65_GODOWN"
  },
  name: {
    type: String,
    required: true,
    trim: true,
  },
  address: {
    type: String,
    trim: true,
    default: '',
  },
  city: {
    type: String,
    trim: true,
    default: 'Mumbai',
  },
  propertyType: {
    type: String,
    enum: ['Commercial Godown', 'Residential Apartment', 'Commercial Office', 'Garage', 'PG Facility', 'Room', 'Mixed Use', 'Other'],
    default: 'Commercial Godown',
  },
  ownerOrResponsiblePerson: {
    type: String,
    trim: true,
    default: 'Owner',
  },
  description: {
    type: String,
    trim: true,
    default: '',
  },
  legacySrNo: {
    type: String,
    trim: true,
  },
  isActive: {
    type: Boolean,
    default: true,
  }
}, {
  timestamps: true,
});

module.exports = mongoose.model('Property', propertySchema);
