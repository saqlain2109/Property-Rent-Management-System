const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const Tenant = require('../models/Tenant');
const TenantAssignment = require('../models/TenantAssignment');
const PaymentReceipt = require('../models/PaymentReceipt');
const RentAgreement = require('../models/RentAgreement');
const { protect, authorize } = require('../middleware/auth');
const logAudit = require('../utils/audit');

// @route GET /api/tenants
router.get('/', protect, async (req, res) => {
  try {
    const { search, status, tenantType } = req.query;
    let query = {};

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { tenantCode: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { address: { $regex: search, $options: 'i' } },
      ];
    }
    if (tenantType) query.tenantType = tenantType;
    if (status !== undefined && status !== '') query.isActive = status === 'true';

    const tenants = await Tenant.find(query).sort({ name: 1 });

    // Populate active unit info and rent agreement
    const tenantIds = tenants.map(t => t._id);
    const assignments = await TenantAssignment.find({
      tenantId: { $in: tenantIds },
      status: 'Active'
    }).populate({
      path: 'unitId',
      populate: { path: 'propertyId', select: 'name propertyCode totalAreaSqFt ownershipPercentage' }
    });

    const assignmentIds = assignments.map(a => a._id);
    const agreements = await RentAgreement.find({
      assignmentId: { $in: assignmentIds },
      isCurrentRate: true
    });

    const tenantsWithUnits = tenants.map(t => {
      const activeAssign = assignments.find(a => a.tenantId.toString() === t._id.toString());
      const activeAgreement = activeAssign ? agreements.find(ag => ag.assignmentId.toString() === activeAssign._id.toString()) : null;
      return {
        ...t.toObject(),
        activeAssignment: activeAssign || null,
        activeUnit: activeAssign ? activeAssign.unitId : null,
        currentRentAgreement: activeAgreement || null
      };
    });

    res.json({ success: true, count: tenantsWithUnits.length, data: tenantsWithUnits });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route GET /api/tenants/:id
router.get('/:id', protect, async (req, res) => {
  try {
    const tenant = await Tenant.findById(req.params.id);
    if (!tenant) {
      return res.status(404).json({ success: false, message: 'Tenant not found' });
    }

    const assignments = await TenantAssignment.find({ tenantId: tenant._id })
      .populate({
        path: 'unitId',
        populate: { path: 'propertyId' }
      })
      .sort({ startDate: -1 });

    const payments = await PaymentReceipt.find({ tenantId: tenant._id })
      .sort({ receiptDate: -1 });

    res.json({
      success: true,
      data: {
        ...tenant.toObject(),
        assignments,
        payments
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route POST /api/tenants
router.post('/', protect, authorize('admin', 'manager'), [
  body('name').trim().notEmpty().withMessage('Tenant name is required')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  try {
    let finalCode = req.body.tenantCode?.trim()?.toUpperCase();
    if (!finalCode) {
      const cleanName = req.body.name.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 6);
      const count = await Tenant.countDocuments();
      finalCode = `TEN-${cleanName || 'USER'}-${String(count + 1).padStart(3, '0')}`;
    }

    const existing = await Tenant.findOne({ tenantCode: finalCode });
    if (existing) {
      const rand = Math.floor(100 + Math.random() * 900);
      finalCode = `${finalCode}-${rand}`;
    }

    const { unitId, monthlyRate, startDate, endDate, depositHeld, terms, initialPaidTillMonth } = req.body;

    const tenant = await Tenant.create({
      ...req.body,
      tenantCode: finalCode
    });

    if (unitId && monthlyRate !== undefined && monthlyRate !== null && monthlyRate !== '') {
      const asnCount = await TenantAssignment.countDocuments();
      const assignment = await TenantAssignment.create({
        assignmentCode: `ASN-${String(asnCount + 1).padStart(4, '0')}`,
        tenantId: tenant._id,
        unitId,
        startDate: startDate || new Date().toISOString().split('T')[0],
        endDate: endDate || null,
        depositHeld: Number(depositHeld) || 0,
        initialPaidTillMonth: initialPaidTillMonth || null,
        status: 'Active'
      });

      await RentAgreement.create({
        assignmentId: assignment._id,
        unitId,
        tenantId: tenant._id,
        rentType: 'Monthly Fixed',
        monthlyRate: Number(monthlyRate) || 0,
        effectiveFrom: startDate || new Date().toISOString().split('T')[0],
        terms: terms || '',
        isCurrentRate: true
      });

      const Unit = require('../models/Unit');
      await Unit.findByIdAndUpdate(unitId, { occupancyStatus: 'Occupied' });
    }

    await logAudit({
      userId: req.user._id,
      action: 'CREATE',
      entityType: 'Tenant',
      entityId: tenant._id,
      description: `Created tenant ${tenant.name} (${tenant.tenantCode})`,
      newState: tenant.toObject(),
      req
    });

    res.status(201).json({ success: true, data: tenant });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route PUT /api/tenants/:id
router.put('/:id', protect, authorize('admin', 'manager'), async (req, res) => {
  try {
    const tenant = await Tenant.findById(req.params.id);
    if (!tenant) {
      return res.status(404).json({ success: false, message: 'Tenant not found' });
    }

    const prev = tenant.toObject();
    const { unitId, monthlyRate, startDate, endDate, depositHeld, terms } = req.body;

    Object.assign(tenant, req.body);
    if (req.body.tenantCode) {
      tenant.tenantCode = req.body.tenantCode.toUpperCase();
    }
    await tenant.save();

    // Handle unit & rent updates if provided
    if (unitId || monthlyRate !== undefined) {
      const Unit = require('../models/Unit');
      const currentAssignment = await TenantAssignment.findOne({ tenantId: tenant._id, status: 'Active' });

      if (currentAssignment) {
        if (unitId && currentAssignment.unitId.toString() !== unitId.toString()) {
          // Free previous unit
          await Unit.findByIdAndUpdate(currentAssignment.unitId, { occupancyStatus: 'Vacant' });
          currentAssignment.unitId = unitId;
          await Unit.findByIdAndUpdate(unitId, { occupancyStatus: 'Occupied' });
        }
        if (startDate) currentAssignment.startDate = startDate;
        if (endDate !== undefined) currentAssignment.endDate = endDate || null;
        if (depositHeld !== undefined) currentAssignment.depositHeld = Number(depositHeld) || 0;
        await currentAssignment.save();

        if (monthlyRate !== undefined && monthlyRate !== '') {
          const currentAgreement = await RentAgreement.findOne({
            assignmentId: currentAssignment._id,
            isCurrentRate: true
          });
          if (currentAgreement) {
            currentAgreement.monthlyRate = Number(monthlyRate);
            if (terms !== undefined) currentAgreement.terms = terms;
            if (unitId) currentAgreement.unitId = unitId;
            await currentAgreement.save();
          } else {
            await RentAgreement.create({
              assignmentId: currentAssignment._id,
              unitId: currentAssignment.unitId,
              tenantId: tenant._id,
              rentType: 'Monthly Fixed',
              monthlyRate: Number(monthlyRate) || 0,
              effectiveFrom: startDate || currentAssignment.startDate,
              terms: terms || '',
              isCurrentRate: true
            });
          }
        }
      } else if (unitId && monthlyRate !== undefined && monthlyRate !== '') {
        // Create new assignment
        const asnCount = await TenantAssignment.countDocuments();
        const newAsn = await TenantAssignment.create({
          assignmentCode: `ASN-${String(asnCount + 1).padStart(4, '0')}`,
          tenantId: tenant._id,
          unitId,
          startDate: startDate || new Date().toISOString().split('T')[0],
          endDate: endDate || null,
          depositHeld: Number(depositHeld) || 0,
          status: 'Active'
        });

        await RentAgreement.create({
          assignmentId: newAsn._id,
          unitId,
          tenantId: tenant._id,
          rentType: 'Monthly Fixed',
          monthlyRate: Number(monthlyRate) || 0,
          effectiveFrom: startDate || new Date().toISOString().split('T')[0],
          terms: terms || '',
          isCurrentRate: true
        });

        await Unit.findByIdAndUpdate(unitId, { occupancyStatus: 'Occupied' });
      }
    }

    await logAudit({
      userId: req.user._id,
      action: 'UPDATE',
      entityType: 'Tenant',
      entityId: tenant._id,
      description: `Updated tenant ${tenant.name} (${tenant.tenantCode})`,
      previousState: prev,
      newState: tenant.toObject(),
      req
    });

    res.json({ success: true, data: tenant });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
