const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const Property = require('../models/Property');
const Unit = require('../models/Unit');
const { protect, authorize } = require('../middleware/auth');
const logAudit = require('../utils/audit');

// @route GET /api/properties
router.get('/', protect, async (req, res) => {
  try {
    const { search, propertyType, status } = req.query;
    let query = {};

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { propertyCode: { $regex: search, $options: 'i' } },
        { address: { $regex: search, $options: 'i' } },
      ];
    }
    if (propertyType) {
      query.propertyType = propertyType;
    }
    if (status !== undefined && status !== '') {
      query.isActive = status === 'true';
    }

    const properties = await Property.find(query).sort({ propertyCode: 1 });
    
    // Attach unit count
    const propertyIds = properties.map(p => p._id);
    const units = await Unit.find({ propertyId: { $in: propertyIds } });
    
    const propertiesWithCount = properties.map(p => {
      const pUnits = units.filter(u => u.propertyId.toString() === p._id.toString());
      return {
        ...p.toObject(),
        unitCount: pUnits.length,
        occupiedUnits: pUnits.filter(u => u.occupancyStatus === 'Occupied').length
      };
    });

    res.json({ success: true, count: propertiesWithCount.length, data: propertiesWithCount });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route GET /api/properties/:id
router.get('/:id', protect, async (req, res) => {
  try {
    const property = await Property.findById(req.params.id);
    if (!property) {
      return res.status(404).json({ success: false, message: 'Property not found' });
    }
    const units = await Unit.find({ propertyId: property._id });
    res.json({ success: true, data: { ...property.toObject(), units } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route POST /api/properties
router.post('/', protect, authorize('admin', 'manager'), [
  body('propertyCode').trim().notEmpty().withMessage('Property code is required'),
  body('name').trim().notEmpty().withMessage('Property name is required')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  try {
    const existing = await Property.findOne({ propertyCode: req.body.propertyCode.toUpperCase() });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Property code already exists' });
    }

    const property = await Property.create({
      ...req.body,
      propertyCode: req.body.propertyCode.toUpperCase()
    });

    await logAudit({
      userId: req.user._id,
      action: 'CREATE',
      entityType: 'Property',
      entityId: property._id,
      description: `Created property ${property.name} (${property.propertyCode})`,
      newState: property.toObject(),
      req
    });

    res.status(201).json({ success: true, data: property });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route PUT /api/properties/:id
router.put('/:id', protect, authorize('admin', 'manager'), async (req, res) => {
  try {
    const property = await Property.findById(req.params.id);
    if (!property) {
      return res.status(404).json({ success: false, message: 'Property not found' });
    }

    const prev = property.toObject();
    Object.assign(property, req.body);
    if (req.body.propertyCode) {
      property.propertyCode = req.body.propertyCode.toUpperCase();
    }
    await property.save();

    await logAudit({
      userId: req.user._id,
      action: 'UPDATE',
      entityType: 'Property',
      entityId: property._id,
      description: `Updated property ${property.name} (${property.propertyCode})`,
      previousState: prev,
      newState: property.toObject(),
      req
    });

    res.json({ success: true, data: property });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route DELETE /api/properties/:id
router.delete('/:id', protect, authorize('admin'), async (req, res) => {
  try {
    const property = await Property.findById(req.params.id);
    if (!property) {
      return res.status(404).json({ success: false, message: 'Property not found' });
    }

    // Check for existing units
    const unitCount = await Unit.countDocuments({ propertyId: property._id });
    if (unitCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete property with ${unitCount} associated units. Reassign or delete units first.`
      });
    }

    await Property.findByIdAndDelete(req.params.id);

    await logAudit({
      userId: req.user._id,
      action: 'DELETE',
      entityType: 'Property',
      entityId: req.params.id,
      description: `Deleted property ${property.name}`,
      previousState: property.toObject(),
      req
    });

    res.json({ success: true, message: 'Property deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
