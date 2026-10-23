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
    enum: ['Commercial Godown', 'Residential Apartment', 'Commercial Office', 'Garage', 'PG Facility', 'Room', 'Mixed Use', 'General / Common', 'Other'],
    default: 'Commercial Godown',
  },
  ownerOrResponsiblePerson: {
    type: String,
    trim: true,
    default: 'Owner',
  },
  totalAreaSqFt: {
    type: Number,
    default: 0, // Area in square feet e.g. 5000 sq ft
  },
  ownershipPercentage: {
    type: Number,
    default: 100, // e.g. 100 for godown 100%, 50 for 50/50 split
    min: 0,
    max: 100,
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
  },
  displayOrder: {
    type: Number,
    default: 0, // Order for custom property sorting (1, 2, 3...)
  }
}, {
  timestamps: true,
});

module.exports = mongoose.model('Property', propertySchema);
