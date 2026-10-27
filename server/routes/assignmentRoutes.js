const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const TenantAssignment = require('../models/TenantAssignment');
const RentAgreement = require('../models/RentAgreement');
const Unit = require('../models/Unit');
const Tenant = require('../models/Tenant');
const { protect, authorize } = require('../middleware/auth');
const logAudit = require('../utils/audit');

const { calculateTenantUnitLedger } = require('../services/rentCalculator');
const PaymentAllocation = require('../models/PaymentAllocation');
const PaymentReceipt = require('../models/PaymentReceipt');

const isDateBeforeToday = (date) => {
  if (!date) return false;
  return new Date(date).toISOString().slice(0, 10) < new Date().toISOString().slice(0, 10);
};

const formatYMD = (date) => {
  if (!date) return '';
  return new Date(date).toISOString().slice(0, 10);
};

const formatConflictingDateRange = (startDate, endDate) => {
  const sStr = startDate ? formatYMD(startDate) : 'Open Start';
  const eStr = endDate ? formatYMD(endDate) : 'Ongoing';
  return `${sStr} to ${eStr}`;
};

const doContractDatesOverlap = (startA, endA, startB, endB) => {
  const sA = startA ? formatYMD(startA) : '0000-01-01';
  const eA = endA ? formatYMD(endA) : '9999-12-31';
  const sB = startB ? formatYMD(startB) : '0000-01-01';
  const eB = endB ? formatYMD(endB) : '9999-12-31';

  return sA <= eB && eA >= sB;
};

const findContractOverlap = async (unitId, startDate, endDate, excludeAssignmentId = null) => {
  const query = {
    unitId,
    status: { $nin: ['Terminated', 'Cancelled'] }
  };
  if (excludeAssignmentId) {
    query._id = { $ne: excludeAssignmentId };
  }

  const existingContracts = await TenantAssignment.find(query)
    .populate('tenantId', 'name tenantCode')
    .populate({
      path: 'unitId',
      populate: { path: 'propertyId', select: 'name' }
    });

  for (const existing of existingContracts) {
    if (doContractDatesOverlap(startDate, endDate, existing.startDate, existing.endDate)) {
      return existing;
    }
  }
  return null;
};

const generateContractNo = async (tenantId, startDate, customNo) => {
  if (customNo && String(customNo).trim()) return String(customNo).trim();
  const tenant = await Tenant.findById(tenantId);
  const tenantName = tenant ? tenant.name : 'Tenant';
  let clean = tenantName.replace(/^(with\s+)/i, '').trim();
  if (/^snip/i.test(clean)) clean = 'Snip';
  else if (/^water/i.test(clean)) clean = 'WaterWala';
  else if (/^dg/i.test(clean)) clean = 'DG';
  else if (/^pg/i.test(clean)) clean = 'PG';
  else if (/^delhiery/i.test(clean)) clean = 'Delhiery';
  else if (/^amir/i.test(clean)) clean = 'Amir';
  else {
    let first = clean.split(/[\s\-()]+/)[0];
    clean = first ? (first.charAt(0).toUpperCase() + first.slice(1)) : 'Tenant';
  }
  const yr = startDate ? new Date(startDate).getFullYear() : new Date().getFullYear();
  const baseKey = `${clean}-${yr}`;
  const existing = await TenantAssignment.find({
    contractNo: { $regex: `^${baseKey}(-[0-9]+)?$`, $options: 'i' }
  }).sort({ createdAt: 1 });
  if (existing.length === 0) {
    return baseKey;
  } else if (existing.length === 1 && !existing[0].contractNo.includes('-' + (existing[0].contractNo.split('-')[2] || ''))) {
    await TenantAssignment.updateOne({ _id: existing[0]._id }, { $set: { contractNo: `${baseKey}-1` } });
    return `${baseKey}-2`;
  } else {
    return `${baseKey}-${existing.length + 1}`;
  }
};

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

    // Fetch reversed receipts, all agreements, and all allocations in parallel
    const [reversedReceipts, allAgreements, allAllocations] = await Promise.all([
      PaymentReceipt.find({ isReversed: true }).distinct('_id'),
      RentAgreement.find({}).sort({ effectiveFrom: 1 }),
      PaymentAllocation.find({})
    ]);

    const revIdSet = new Set(reversedReceipts.map(String));
    const validAllocations = allAllocations.filter(a => !revIdSet.has(String(a.receiptId)));

    const agreementsByAssign = new Map();
    for (const ag of allAgreements) {
      if (ag.assignmentId) {
        const k = String(ag.assignmentId);
        if (!agreementsByAssign.has(k)) agreementsByAssign.set(k, []);
        agreementsByAssign.get(k).push(ag);
      }
    }

    const allocationsByUnitTenant = new Map();
    for (const al of validAllocations) {
      const k = `${String(al.unitId)}_${String(al.tenantId)}`;
      if (!allocationsByUnitTenant.has(k)) allocationsByUnitTenant.set(k, []);
      allocationsByUnitTenant.get(k).push(al);
    }

    const calcOptions = {
      reversedReceiptIds: reversedReceipts,
      agreementsByAssign,
      allocationsByUnitTenant
    };

    // Enrich each assignment with rate history, total expected, and total received
    const enriched = await Promise.all(assignments.map(async (assign) => {
      const obj = assign.toObject();
      obj.contractType = obj.contractType || 'Rent';
      if (!assign.unitId || !assign.tenantId) {
        return {
          ...obj,
          rateHistory: [],
          totalExpected: 0,
          totalReceived: 0,
          outstandingBalance: 0,
          currentRate: 0
        };
      }

      // Fetch rent agreements strictly for this specific assignment from in-memory cache
      let rateHistory = agreementsByAssign.get(String(assign._id)) || [];
      if (!rateHistory.length) {
        rateHistory = allAgreements.filter(a =>
          !a.assignmentId &&
          String(a.unitId) === String(assign.unitId._id) &&
          String(a.tenantId) === String(assign.tenantId._id)
        );
      }

      const currentAgr = assign.status === 'Active'
        ? (rateHistory.find(r => r.isCurrentRate) || rateHistory[rateHistory.length - 1] || null)
        : (rateHistory[rateHistory.length - 1] || null);

      try {
        const ledger = await calculateTenantUnitLedger(assign.unitId._id, assign.tenantId._id, null, assign, calcOptions);
        return {
          ...obj,
          rateHistory,
          currentAgreement: currentAgr,
          currentMonthlyRate: currentAgr ? currentAgr.monthlyRate : 0,
          totalExpected: ledger.totalExpected || 0,
          totalReceived: ledger.totalAllocated || 0,
          outstandingBalance: ledger.totalOutstanding || 0,
          paidTillMonth: ledger.paidTillMonth,
          nextUnpaidMonth: ledger.nextUnpaidMonth,
          monthsBreakdown: ledger.monthsBreakdown || []
        };
      } catch (err) {
        return {
          ...obj,
          rateHistory,
          currentAgreement: currentAgr,
          currentMonthlyRate: currentAgr ? currentAgr.monthlyRate : 0,
          totalExpected: 0,
          totalReceived: 0,
          outstandingBalance: 0,
          paidTillMonth: null,
          nextUnpaidMonth: null,
          monthsBreakdown: []
        };
      }
    }));

    res.json({ success: true, count: enriched.length, data: enriched });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route POST /api/assignments (Create new occupancy & agreement)
router.post('/', protect, authorize('admin', 'manager'), [
  body('tenantId').isMongoId().withMessage('Valid tenant ID is required'),
  body('unitId').isMongoId().withMessage('Valid unit ID is required'),
  body('startDate').optional({ checkFalsy: true }).isISO8601().withMessage('Valid start date is required'),
  body('endDate').optional({ checkFalsy: true }).isISO8601().withMessage('Valid end date is required'),
  body('status').optional().isIn(['Active', 'Past / Vacated', 'Terminated', 'Ended']).withMessage('Invalid status'),
  body('contractType').optional().isIn(['Rent', 'Business']).withMessage('Contract type must be Rent or Business'),
  body('rentType').optional().isIn(['Monthly Fixed', 'Annual Fixed', 'Variable PG Share', 'Irregular / Custom']),
  body('rentAmount').optional().isFloat({ min: 0 }).withMessage('Rent amount must be a non-negative number'),
  body('monthlyRate').optional().isFloat({ min: 0 }).withMessage('Monthly rent rate must be a non-negative number')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  try {
    const {
      tenantId, unitId, startDate, endDate, depositHeld, contractType = 'Rent',
      rentType = 'Monthly Fixed', rentAmount, monthlyRate, terms, notes, status, contractNo
    } = req.body;
    const finalContractType = contractType === 'Business' ? 'Business' : 'Rent';
    const enteredRent = rentAmount ?? monthlyRate;
    if (enteredRent === undefined || enteredRent === null || enteredRent === '') {
      return res.status(400).json({ success: false, message: 'Rent amount is required' });
    }
    const contractEndDate = endDate || null;
    const contractStartDate = startDate || null;
    if (contractStartDate && contractEndDate && new Date(contractEndDate) < new Date(contractStartDate)) {
      return res.status(400).json({ success: false, message: 'End date cannot be before the start date' });
    }

       // Overlap restriction removed - contracts can be added for any date

    const contractHasEnded = isDateBeforeToday(contractEndDate);
    // If end date is in the past, status is Ended; otherwise keep requested status or default to Active
    const finalStatus = contractHasEnded ? 'Ended' : (status || 'Active');

    const finalContractNo = await generateContractNo(tenantId, contractStartDate, contractNo);
    const count = await TenantAssignment.countDocuments();
    const assignmentCode = `ASN-${String(count + 1).padStart(4, '0')}`;

    const assignment = await TenantAssignment.create({
      assignmentCode,
      contractNo: finalContractNo,
      tenantId,
      unitId,
      startDate: contractStartDate,
      endDate: contractEndDate,
      depositHeld: Number(depositHeld) || 0,
      contractType: finalContractType,
      notes: notes || '',
      status: finalStatus
    });

    const isAnnual = rentType === 'Annual Fixed';
    const numRent = Number(enteredRent);
    const agreementMonthly = isAnnual ? numRent / 12 : numRent;
    const agreementAnnual = isAnnual ? numRent : numRent * 12;

    // Create initial rent agreement rate
    const agreement = await RentAgreement.create({
      assignmentId: assignment._id,
      unitId,
      tenantId,
      contractType: finalContractType,
      rentType: rentType || 'Monthly Fixed',
      monthlyRate: agreementMonthly,
      annualRate: agreementAnnual,
      effectiveFrom: contractStartDate,
      effectiveTo: contractEndDate,
      terms: terms || '',
      isCurrentRate: finalStatus === 'Active'
    });

    if (finalStatus === 'Active') {
      await Unit.findByIdAndUpdate(unitId, { occupancyStatus: 'Occupied' });
    } else {
      // Check if unit has any other active assignment
      const otherActive = await TenantAssignment.findOne({ unitId, status: 'Active' });
      await Unit.findByIdAndUpdate(unitId, { occupancyStatus: otherActive ? 'Occupied' : 'Vacant' });
    }

    await logAudit({
      userId: req.user._id,
      action: 'ASSIGN_TENANT',
      entityType: 'TenantAssignment',
      entityId: assignment._id,
      description: `Assigned tenant to unit at rate ₹${enteredRent}/${rentType === 'Annual Fixed' ? 'year' : 'month'}`,
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
  body('rentType').optional().isIn(['Monthly Fixed', 'Annual Fixed', 'Variable PG Share', 'Irregular / Custom']),
  body('rentAmount').optional().isFloat({ min: 0 }).withMessage('Rent amount must be a non-negative number'),
  body('newRate').optional().isFloat({ min: 0 }).withMessage('New rent rate must be a non-negative number'),
  body('effectiveFrom').isISO8601().withMessage('Effective date is required'),
  body('reason').trim().notEmpty().withMessage('Reason for rent increase is required')
], async (req, res) => {
  try {
    const assignment = await TenantAssignment.findById(req.params.id);
    if (!assignment || assignment.status !== 'Active') {
      return res.status(400).json({ success: false, message: 'Active assignment required for rent revision' });
    }

    const { rentType, rentAmount, newRate, effectiveFrom, reason } = req.body;
    const enteredRent = rentAmount ?? newRate;
    if (enteredRent === undefined || enteredRent === null || enteredRent === '') {
      return res.status(400).json({ success: false, message: 'New rent amount is required' });
    }

    // Find current active agreement
    const currentAgreement = await RentAgreement.findOne({
      assignmentId: assignment._id,
      isCurrentRate: true
    });

    const previousRate = currentAgreement ? currentAgreement.monthlyRate : 0;
    const nextRentType = rentType || (
      rentAmount !== undefined ? currentAgreement?.rentType || 'Monthly Fixed' : 'Monthly Fixed'
    );
    const numericRent = Number(enteredRent);

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
      rentType: nextRentType,
      monthlyRate: nextRentType === 'Annual Fixed' ? numericRent / 12 : numericRent,
      annualRate: nextRentType === 'Annual Fixed' ? numericRent : 0,
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
      description: `Rent revised from ₹${previousRate} to ₹${enteredRent} effective ${effectiveFrom}: ${reason}`,
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

// @route PUT /api/assignments/:id (Update contract dates, rate, deposit, notes)
router.put('/:id', protect, authorize('admin', 'manager'), [
  body('startDate').optional({ checkFalsy: true }).isISO8601().withMessage('Valid start date is required'),
  body('endDate').optional({ checkFalsy: true }).isISO8601().withMessage('Valid end date is required'),
  body('tenantId').optional().isMongoId().withMessage('Valid tenant ID is required'),
  body('unitId').optional().isMongoId().withMessage('Valid unit ID is required'),
  body('propertyId').optional().isMongoId().withMessage('Valid property ID is required'),
  body('rentType').optional().isIn(['Monthly Fixed', 'Annual Fixed', 'Variable PG Share', 'Irregular / Custom']),
  body('rentAmount').optional().isFloat({ min: 0 }).withMessage('Rent amount must be a non-negative number'),
  body('monthlyRate').optional().isFloat({ min: 0 }).withMessage('Monthly rent rate must be a non-negative number'),
  body('depositHeld').optional().isFloat({ min: 0 }).withMessage('Deposit must be a non-negative number'),
  body('status').optional().isIn(['Active', 'Past / Vacated', 'Terminated', 'Ended']).withMessage('Invalid contract status'),
  body('contractType').optional().isIn(['Rent', 'Business']).withMessage('Contract type must be Rent or Business'),
  body('notes').optional().isString().withMessage('Notes must be text'),
  body('terms').optional().isString().withMessage('Agreement terms must be text')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  try {
    const assignment = await TenantAssignment.findById(req.params.id);
    if (!assignment) {
      return res.status(404).json({ success: false, message: 'Contract assignment not found' });
    }

    const {
      startDate, endDate, tenantId, unitId, propertyId, contractType,
      rentType, rentAmount, monthlyRate, depositHeld, notes, terms, status, contractNo
    } = req.body;
    const nextTenantId = tenantId || assignment.tenantId;
    const nextUnitId = unitId || assignment.unitId;
    const unit = await Unit.findById(nextUnitId);
    if (!unit) {
      return res.status(404).json({ success: false, message: 'Selected unit not found' });
    }
    if (propertyId && unit.propertyId.toString() !== propertyId) {
      return res.status(400).json({ success: false, message: 'Selected unit does not belong to the selected property' });
    }
    if (tenantId) {
      const tenant = await Tenant.findById(tenantId);
      if (!tenant) {
        return res.status(404).json({ success: false, message: 'Selected tenant not found' });
      }
    }
    const assignmentLinkChanged =
      nextTenantId.toString() !== assignment.tenantId.toString() ||
      nextUnitId.toString() !== assignment.unitId.toString();
    if (assignmentLinkChanged) {
      const [allocationCount, receiptCount] = await Promise.all([
        PaymentAllocation.countDocuments({
          tenantId: assignment.tenantId,
          unitId: assignment.unitId
        }),
        PaymentReceipt.countDocuments({
          tenantId: assignment.tenantId,
          unitId: assignment.unitId
        })
      ]);
      if (allocationCount || receiptCount) {
        return res.status(409).json({
          success: false,
          message: 'Tenant or unit cannot be changed because payment history already exists for this contract.'
        });
      }
    }

    const nextStartDate = startDate !== undefined ? (startDate || null) : assignment.startDate;
    const nextEndDate = endDate !== undefined ? (endDate || null) : assignment.endDate;
    if (nextStartDate && nextEndDate && new Date(nextEndDate) < new Date(nextStartDate)) {
      return res.status(400).json({ success: false, message: 'End date cannot be before the start date' });
    }

       // Overlap restriction removed - contracts can be added for any date

    const contractHasEnded = isDateBeforeToday(nextEndDate);
    const nextStatus = contractHasEnded
      ? 'Ended'
      : (status || (endDate !== undefined ? (contractHasEnded ? 'Ended' : 'Active') : assignment.status));

    let agreements = await RentAgreement.find({
      assignmentId: assignment._id
    }).sort({ effectiveFrom: 1 });
    if (!agreements.length) {
      agreements = await RentAgreement.find({
        assignmentId: { $exists: false },
        unitId: assignment.unitId,
        tenantId: assignment.tenantId
      }).sort({ effectiveFrom: 1 });
    }

    let agreement = agreements.find((item) => item.isCurrentRate) || agreements[agreements.length - 1];
    const firstAgreement = agreements[0];
    if (
      startDate &&
      agreements.length > 1 &&
      new Date(startDate) >= new Date(agreements[1].effectiveFrom)
    ) {
      return res.status(400).json({
        success: false,
        message: 'Contract start date must be earlier than its first rent revision'
      });
    }

    const enteredRent = rentAmount ?? monthlyRate;
    if (enteredRent !== undefined && enteredRent !== null && enteredRent === '') {
      return res.status(400).json({ success: false, message: 'Rent amount cannot be empty' });
    }
    const previousState = {
      assignment: assignment.toObject(),
      agreements: agreements.map((item) => item.toObject())
    };

    assignment.startDate = nextStartDate;
    assignment.endDate = nextEndDate;
    assignment.status = nextStatus;
    assignment.tenantId = nextTenantId;
    assignment.unitId = nextUnitId;
    if (contractType !== undefined) assignment.contractType = contractType === 'Business' ? 'Business' : 'Rent';
    if (depositHeld !== undefined) assignment.depositHeld = Number(depositHeld) || 0;
    if (contractNo !== undefined) assignment.contractNo = String(contractNo).trim();
    if (notes !== undefined) assignment.notes = notes;
    await assignment.save();

    if (enteredRent !== undefined) {
      const nextRentType = rentType || (
        rentAmount !== undefined ? agreement?.rentType || 'Monthly Fixed' : 'Monthly Fixed'
      );
      const numericRent = Number(enteredRent);
      if (nextStatus === 'Active') {
        await Unit.findByIdAndUpdate(nextUnitId, { monthlyRentExpected: numericRent });
      }
      if (!agreement) {
        agreement = await RentAgreement.create({
          assignmentId: assignment._id,
          unitId: nextUnitId,
          tenantId: nextTenantId,
          contractType: assignment.contractType || 'Rent',
          rentType: nextRentType,
          monthlyRate: nextRentType === 'Annual Fixed' ? numericRent / 12 : numericRent,
          annualRate: nextRentType === 'Annual Fixed' ? numericRent : numericRent * 12,
          effectiveFrom: nextStartDate,
          effectiveTo: nextEndDate,
          terms: terms || '',
          isCurrentRate: nextStatus === 'Active'
        });
      } else {
        if (firstAgreement && startDate) firstAgreement.effectiveFrom = nextStartDate;
        if (contractType !== undefined) agreement.contractType = contractType === 'Business' ? 'Business' : 'Rent';
        agreement.rentType = nextRentType;
        agreement.monthlyRate = nextRentType === 'Annual Fixed' ? numericRent / 12 : numericRent;
        agreement.annualRate = nextRentType === 'Annual Fixed' ? numericRent : numericRent * 12;
        agreement.effectiveTo = nextEndDate;
        agreement.isCurrentRate = nextStatus === 'Active';
        if (terms !== undefined) agreement.terms = terms;
        await Promise.all(
          [...new Set([firstAgreement, agreement].filter(Boolean))].map((item) => item.save())
        );
      }
    } else if (agreement) {
      if (nextStatus === 'Active' && agreement.monthlyRate) {
        await Unit.findByIdAndUpdate(nextUnitId, { monthlyRentExpected: agreement.monthlyRate });
      }
      if (firstAgreement && startDate) firstAgreement.effectiveFrom = nextStartDate;
      if (contractType !== undefined) agreement.contractType = contractType === 'Business' ? 'Business' : 'Rent';
      if (terms !== undefined) agreement.terms = terms;
      if (endDate !== undefined || status !== undefined) {
        agreement.effectiveTo = nextEndDate;
        agreement.isCurrentRate = nextStatus === 'Active';
      }
      if (firstAgreement && firstAgreement !== agreement && startDate) {
        await Promise.all([firstAgreement.save(), agreement.save()]);
      } else if (startDate || endDate !== undefined || status !== undefined || terms !== undefined || contractType !== undefined) {
        await agreement.save();
      }
    }

    if (nextUnitId.toString() !== previousState.assignment.unitId.toString()) {
      const otherActiveOnOldUnit = await TenantAssignment.findOne({
        unitId: previousState.assignment.unitId,
        status: 'Active',
        _id: { $ne: assignment._id }
      });
      await Unit.findByIdAndUpdate(previousState.assignment.unitId, {
        occupancyStatus: otherActiveOnOldUnit ? 'Occupied' : 'Vacant'
      });
    }

    if (endDate !== undefined || status !== undefined || nextUnitId.toString() !== previousState.assignment.unitId.toString()) {
      const activeAssignment = assignment.status === 'Active'
        ? assignment
        : await TenantAssignment.findOne({
            unitId: nextUnitId,
            status: 'Active',
            _id: { $ne: assignment._id }
          });
      if (activeAssignment) {
        await Unit.findByIdAndUpdate(nextUnitId, { occupancyStatus: 'Occupied' });
      } else {
        await Unit.findByIdAndUpdate(nextUnitId, { occupancyStatus: 'Vacant' });
      }
    }

    for (const rate of agreements) {
      rate.assignmentId = assignment._id;
      rate.unitId = nextUnitId;
      rate.tenantId = nextTenantId;
    }
    if (agreements.length) {
      await Promise.all(agreements.map((rate) => rate.save()));
    }
    if (agreement && !agreements.includes(agreement)) {
      agreement.assignmentId = assignment._id;
      agreement.unitId = nextUnitId;
      agreement.tenantId = nextTenantId;
      await agreement.save();
    }

    await logAudit({
      userId: req.user._id,
      action: 'UPDATE_CONTRACT',
      entityType: 'TenantAssignment',
      entityId: assignment._id,
      description: `Updated contract ${assignment.assignmentCode} (Rate: ₹${enteredRent ?? 'unchanged'})`,
      previousState,
      newState: {
        assignment: assignment.toObject(),
        agreements: agreements.map((item) => item.toObject()),
        agreement: agreement ? agreement.toObject() : null
      },
      req
    });

    res.json({ success: true, message: 'Contract updated successfully', data: assignment });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route DELETE /api/assignments/:id (Delete contract)
router.delete('/:id', protect, authorize('admin'), async (req, res) => {
  try {
    const assignment = await TenantAssignment.findById(req.params.id);
    if (!assignment) {
      return res.status(404).json({ success: false, message: 'Contract not found' });
    }

    // Set unit back to Vacant
    await Unit.findByIdAndUpdate(assignment.unitId, { occupancyStatus: 'Vacant' });

    await RentAgreement.deleteMany({ assignmentId: assignment._id });
    await TenantAssignment.findByIdAndDelete(req.params.id);

    await logAudit({
      userId: req.user._id,
      action: 'DELETE_CONTRACT',
      entityType: 'TenantAssignment',
      entityId: assignment._id,
      description: `Deleted contract ${assignment.assignmentCode}`,
      req
    });

    res.json({ success: true, message: 'Contract deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
