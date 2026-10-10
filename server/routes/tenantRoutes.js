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

    // Populate active unit info
    const tenantIds = tenants.map(t => t._id);
    const assignments = await TenantAssignment.find({
      tenantId: { $in: tenantIds },
      status: 'Active'
    }).populate({
      path: 'unitId',
      populate: { path: 'propertyId', select: 'name propertyCode' }
    });

    const tenantsWithUnits = tenants.map(t => {
      const activeAssign = assignments.find(a => a.tenantId.toString() === t._id.toString());
      return {
        ...t.toObject(),
        activeAssignment: activeAssign || null,
        activeUnit: activeAssign ? activeAssign.unitId : null
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
  body('name').trim().notEmpty().withMessage('Tenant name is required'),
  body('tenantCode').trim().notEmpty().withMessage('Tenant code is required')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  try {
    const existing = await Tenant.findOne({ tenantCode: req.body.tenantCode.toUpperCase() });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Tenant code already exists' });
    }

    const tenant = await Tenant.create({
      ...req.body,
      tenantCode: req.body.tenantCode.toUpperCase()
    });

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
    Object.assign(tenant, req.body);
    if (req.body.tenantCode) {
      tenant.tenantCode = req.body.tenantCode.toUpperCase();
    }
    await tenant.save();

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
