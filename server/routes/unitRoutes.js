const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const Unit = require('../models/Unit');
const Property = require('../models/Property');
const TenantAssignment = require('../models/TenantAssignment');
const RentAgreement = require('../models/RentAgreement');
const { protect, authorize } = require('../middleware/auth');
const logAudit = require('../utils/audit');

// @route GET /api/units
router.get('/', protect, async (req, res) => {
  try {
    const { propertyId, status, search } = req.query;
    let query = {};

    if (propertyId) query.propertyId = propertyId;
    if (status) query.occupancyStatus = status;
    if (search) {
      query.$or = [
        { unitName: { $regex: search, $options: 'i' } },
        { unitCode: { $regex: search, $options: 'i' } },
        { legacySheetCode: { $regex: search, $options: 'i' } },
      ];
    }

    const units = await Unit.find(query).populate('propertyId', 'name propertyCode address').sort({ unitCode: 1 });
    
    // Attach current active tenant & rent info
    const unitIds = units.map(u => u._id);
    const activeAssignments = await TenantAssignment.find({
      unitId: { $in: unitIds },
      status: 'Active'
    }).populate('tenantId', 'name tenantCode phone');

    const agreements = await RentAgreement.find({
      unitId: { $in: unitIds },
      isCurrentRate: true
    });

    const unitsWithDetails = units.map(u => {
      const assignment = activeAssignments.find(a => a.unitId.toString() === u._id.toString());
      const agreement = agreements.find(ag => ag.unitId.toString() === u._id.toString());
      return {
        ...u.toObject(),
        currentTenant: assignment ? assignment.tenantId : null,
        currentAssignment: assignment || null,
        currentRentAgreement: agreement || null
      };
    });

    res.json({ success: true, count: unitsWithDetails.length, data: unitsWithDetails });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route GET /api/units/:id
router.get('/:id', protect, async (req, res) => {
  try {
    const unit = await Unit.findById(req.params.id).populate('propertyId');
    if (!unit) {
      return res.status(404).json({ success: false, message: 'Unit not found' });
    }

    const assignments = await TenantAssignment.find({ unitId: unit._id })
      .populate('tenantId')
      .sort({ startDate: -1 });

    const agreements = await RentAgreement.find({ unitId: unit._id }).sort({ effectiveFrom: -1 });

    res.json({
      success: true,
      data: {
        ...unit.toObject(),
        assignments,
        agreements
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route POST /api/units
router.post('/', protect, authorize('admin', 'manager'), [
  body('unitCode').trim().notEmpty().withMessage('Unit code is required'),
  body('unitName').trim().notEmpty().withMessage('Unit name is required'),
  body('propertyId').isMongoId().withMessage('Valid property ID is required')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  try {
    const property = await Property.findById(req.body.propertyId);
    if (!property) {
      return res.status(404).json({ success: false, message: 'Parent property not found' });
    }

    const existing = await Unit.findOne({ unitCode: req.body.unitCode.toUpperCase() });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Unit code already exists' });
    }

    const unit = await Unit.create({
      ...req.body,
      unitCode: req.body.unitCode.toUpperCase()
    });

    await logAudit({
      userId: req.user._id,
      action: 'CREATE',
      entityType: 'Unit',
      entityId: unit._id,
      description: `Created unit ${unit.unitName} (${unit.unitCode}) under ${property.name}`,
      newState: unit.toObject(),
      req
    });

    res.status(201).json({ success: true, data: unit });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route PUT /api/units/:id
router.put('/:id', protect, authorize('admin', 'manager'), async (req, res) => {
  try {
    const unit = await Unit.findById(req.params.id);
    if (!unit) {
      return res.status(404).json({ success: false, message: 'Unit not found' });
    }

    const prev = unit.toObject();
    Object.assign(unit, req.body);
    if (req.body.unitCode) {
      unit.unitCode = req.body.unitCode.toUpperCase();
    }
    await unit.save();

    await logAudit({
      userId: req.user._id,
      action: 'UPDATE',
      entityType: 'Unit',
      entityId: unit._id,
      description: `Updated unit ${unit.unitName} (${unit.unitCode})`,
      previousState: prev,
      newState: unit.toObject(),
      req
    });

    res.json({ success: true, data: unit });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route DELETE /api/units/:id
router.delete('/:id', protect, authorize('admin'), async (req, res) => {
  try {
    const unit = await Unit.findById(req.params.id);
    if (!unit) {
      return res.status(404).json({ success: false, message: 'Unit not found' });
    }

    const activeAssignment = await TenantAssignment.findOne({ unitId: unit._id, status: 'Active' });
    if (activeAssignment) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete unit with an active tenant occupancy. Vacate or reassign first.'
      });
    }

    await Unit.findByIdAndDelete(req.params.id);

    await logAudit({
      userId: req.user._id,
      action: 'DELETE',
      entityType: 'Unit',
      entityId: req.params.id,
      description: `Deleted unit ${unit.unitName}`,
      previousState: unit.toObject(),
      req
    });

    res.json({ success: true, message: 'Unit deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
