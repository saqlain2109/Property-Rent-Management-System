const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const TenantAssignment = require('../models/TenantAssignment');
const RentAgreement = require('../models/RentAgreement');
const Unit = require('../models/Unit');
const Tenant = require('../models/Tenant');
const { protect, authorize } = require('../middleware/auth');
const logAudit = require('../utils/audit');

// @route GET /api/assignments
router.get('/', protect, async (req, res) => {
  try {
    const { unitId, tenantId, status } = req.query;
    let query = {};
    if (unitId) query.unitId = unitId;
    if (tenantId) query.tenantId = tenantId;
    if (status) query.status = status;

    const assignments = await TenantAssignment.find(query)
      .populate('tenantId')
      .populate({
        path: 'unitId',
        populate: { path: 'propertyId' }
      })
      .sort({ startDate: -1 });

    res.json({ success: true, count: assignments.length, data: assignments });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route POST /api/assignments (Create new occupancy & agreement)
router.post('/', protect, authorize('admin', 'manager'), [
  body('tenantId').isMongoId().withMessage('Valid tenant ID is required'),
  body('unitId').isMongoId().withMessage('Valid unit ID is required'),
  body('startDate').isISO8601().withMessage('Valid start date is required'),
  body('monthlyRate').isNumeric().withMessage('Monthly rent rate must be a number')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  try {
    const { tenantId, unitId, startDate, depositHeld, monthlyRate, rentType, terms, notes } = req.body;

    // Check if unit is already occupied by an active assignment
    const existingActive = await TenantAssignment.findOne({ unitId, status: 'Active' });
    if (existingActive) {
      return res.status(400).json({
        success: false,
        message: 'This unit currently has an active tenant assignment. Vacate the current tenant first.'
      });
    }

    const count = await TenantAssignment.countDocuments();
    const assignmentCode = `ASN-${String(count + 1).padStart(4, '0')}`;

    const assignment = await TenantAssignment.create({
      assignmentCode,
      tenantId,
      unitId,
      startDate,
      depositHeld: Number(depositHeld) || 0,
      notes: notes || '',
      status: 'Active'
    });

    // Create initial rent agreement rate
    const agreement = await RentAgreement.create({
      assignmentId: assignment._id,
      unitId,
      tenantId,
      rentType: rentType || 'Monthly Fixed',
      monthlyRate: Number(monthlyRate),
      effectiveFrom: startDate,
      terms: terms || '',
      isCurrentRate: true
    });

    // Update unit status to Occupied
    await Unit.findByIdAndUpdate(unitId, { occupancyStatus: 'Occupied' });

    await logAudit({
      userId: req.user._id,
      action: 'ASSIGN_TENANT',
      entityType: 'TenantAssignment',
      entityId: assignment._id,
      description: `Assigned tenant to unit at rate ₹${monthlyRate}/mo`,
      newState: { assignment, agreement },
      req
    });

    res.status(201).json({ success: true, data: { assignment, agreement } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route POST /api/assignments/:id/vacate
router.post('/:id/vacate', protect, authorize('admin', 'manager'), [
  body('endDate').isISO8601().withMessage('Valid end date is required'),
  body('depositRefunded').isNumeric().withMessage('Refunded deposit amount required')
], async (req, res) => {
  try {
    const assignment = await TenantAssignment.findById(req.params.id);
    if (!assignment) {
      return res.status(404).json({ success: false, message: 'Assignment not found' });
    }

    assignment.status = 'Past / Vacated';
    assignment.endDate = req.body.endDate;
    assignment.depositRefunded = Number(req.body.depositRefunded) || 0;
    if (req.body.notes) assignment.notes += ` | Vacated on ${req.body.endDate}: ${req.body.notes}`;
    await assignment.save();

    // Set agreement to inactive
    await RentAgreement.updateMany(
      { assignmentId: assignment._id },
      { effectiveTo: req.body.endDate, isCurrentRate: false }
    );

    // Set unit status to Vacant
    await Unit.findByIdAndUpdate(assignment.unitId, { occupancyStatus: 'Vacant' });

    await logAudit({
      userId: req.user._id,
      action: 'VACATE_TENANT',
      entityType: 'TenantAssignment',
      entityId: assignment._id,
      description: `Tenant vacated unit on ${req.body.endDate}`,
      newState: assignment.toObject(),
      req
    });

    res.json({ success: true, message: 'Tenant successfully vacated unit', data: assignment });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route POST /api/assignments/:id/increase-rent (Effective dated rent increase)
router.post('/:id/increase-rent', protect, authorize('admin', 'manager'), [
  body('newRate').isNumeric().withMessage('New rent rate is required'),
  body('effectiveFrom').isISO8601().withMessage('Effective date is required'),
  body('reason').trim().notEmpty().withMessage('Reason for rent increase is required')
], async (req, res) => {
  try {
    const assignment = await TenantAssignment.findById(req.params.id);
    if (!assignment || assignment.status !== 'Active') {
      return res.status(400).json({ success: false, message: 'Active assignment required for rent revision' });
    }

    const { newRate, effectiveFrom, reason } = req.body;

    // Find current active agreement
    const currentAgreement = await RentAgreement.findOne({
      assignmentId: assignment._id,
      isCurrentRate: true
    });

    const previousRate = currentAgreement ? currentAgreement.monthlyRate : 0;

    // Close previous agreement effective date
    if (currentAgreement) {
      currentAgreement.effectiveTo = new Date(new Date(effectiveFrom).getTime() - 86400000);
      currentAgreement.isCurrentRate = false;
      await currentAgreement.save();
    }

    // Create new rate record
    const newAgreement = await RentAgreement.create({
      assignmentId: assignment._id,
      unitId: assignment.unitId,
      tenantId: assignment.tenantId,
      rentType: currentAgreement ? currentAgreement.rentType : 'Monthly Fixed',
      monthlyRate: Number(newRate),
      previousRate,
      effectiveFrom,
      reasonForChange: reason,
      isCurrentRate: true
    });

    await logAudit({
      userId: req.user._id,
      action: 'RENT_INCREASE',
      entityType: 'RentAgreement',
      entityId: newAgreement._id,
      description: `Rent increased from ₹${previousRate} to ₹${newRate} effective ${effectiveFrom}: ${reason}`,
      previousState: currentAgreement ? currentAgreement.toObject() : null,
      newState: newAgreement.toObject(),
      req
    });

    res.status(201).json({
      success: true,
      message: 'Rent rate revised successfully with preserved history',
      data: newAgreement
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route GET /api/assignments/agreements/history
router.get('/agreements/history', protect, async (req, res) => {
  try {
    const { unitId, tenantId } = req.query;
    let query = {};
    if (unitId) query.unitId = unitId;
    if (tenantId) query.tenantId = tenantId;

    const history = await RentAgreement.find(query)
      .populate('tenantId', 'name tenantCode')
      .populate({
        path: 'unitId',
        populate: { path: 'propertyId', select: 'name propertyCode' }
      })
      .sort({ effectiveFrom: -1 });

    res.json({ success: true, count: history.length, data: history });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
