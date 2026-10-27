const mongoose = require('mongoose');
const Tenant = require('../models/Tenant');
const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const PaymentReceipt = require('../models/PaymentReceipt');
const PaymentAllocation = require('../models/PaymentAllocation');
const TenantAssignment = require('../models/TenantAssignment');
const RentAgreement = require('../models/RentAgreement');
const Unit = require('../models/Unit');
const { calculateTenantUnitLedger, getEffectiveRentForMonth, getCurrentMonthYear } = require('../services/rentCalculator');
const { protect, authorize } = require('../middleware/auth');
const logAudit = require('../utils/audit');
const { syncMonthlyLedgers } = require('../utils/ledgerSync');

// @route GET /api/payments
router.get('/', protect, async (req, res) => {
  try {
    const { tenantId, unitId, startDate, endDate, mode, status, contractNo } = req.query;
    let query = { isReversed: false };

    if (contractNo) {
      const allocReceiptIds = await PaymentAllocation.find({ contractNo }).distinct('receiptId');
      const orConditions = [
        { contractNo: contractNo },
        { _id: { $in: allocReceiptIds } }
      ];
      if (tenantId && unitId) {
        orConditions.push({
          tenantId,
          unitId,
          $or: [
            { contractNo: { $exists: false } },
            { contractNo: '' },
            { contractNo: null }
          ]
        });
      }
      query.$or = orConditions;
    } else {
      if (tenantId) query.tenantId = tenantId;
      if (unitId) query.unitId = unitId;
    }
    if (status) query.status = status;
    if (mode) query.status = mode;
    if (startDate || endDate) {
      query.receiptDate = {};
      if (startDate) query.receiptDate.$gte = new Date(startDate);
      if (endDate) query.receiptDate.$lte = new Date(endDate);
    }

    const receipts = await PaymentReceipt.find(query)
      .populate('tenantId', 'name tenantCode phone email')
      .populate({
        path: 'unitId',
        select: 'unitName subUnitPartition propertyId monthlyRentExpected floor totalAreaSqFt displayOrder unitCode',
        populate: { path: 'propertyId', select: 'name propertyCode displayOrder totalAreaSqFt propertyType address' }
      })
      .sort({ receiptDate: -1 })
      .lean();

    // Fetch allocations for these receipts in parallel with lean
    const receiptIds = receipts.map(r => r._id);
    const allocations = await PaymentAllocation.find({ receiptId: { $in: receiptIds } })
      .select('receiptId rentMonthYear allocatedAmount contractNo notes')
      .lean();

    // Fast O(1) allocation lookup Map
    const allocMap = new Map();
    for (let i = 0; i < allocations.length; i++) {
      const a = allocations[i];
      const rid = a.receiptId.toString();
      let arr = allocMap.get(rid);
      if (!arr) {
        arr = [];
        allocMap.set(rid, arr);
      }
      arr.push(a);
    }

    const receiptsWithAllocations = new Array(receipts.length);
    for (let i = 0; i < receipts.length; i++) {
      const r = receipts[i];
      const rAlloc = allocMap.get(r._id.toString()) || [];
      const derivedAccountingMonth = r.accountingMonth || (r.receiptDate ? new Date(r.receiptDate).toISOString().slice(0, 7) : '');
      const monthsPaidFor = rAlloc.map(a => a.rentMonthYear).join(', ') || r.monthPaidFor || derivedAccountingMonth;
      const recRent = r.rentAmount !== undefined ? r.rentAmount : (r.totalAmount || 0);
      const recDep = r.depositAmount !== undefined ? r.depositAmount : 0;
      receiptsWithAllocations[i] = {
        ...r,
        rentAmount: recRent,
        depositAmount: recDep,
        totalAmount: r.totalAmount !== undefined ? r.totalAmount : (recRent + recDep),
        status: r.status || 'Rented',
        monthPaidFor: monthsPaidFor,
        monthsCovered: monthsPaidFor,
        paidForMonth: monthsPaidFor,
        accountingMonth: r.accountingMonth || monthsPaidFor,
        allocations: rAlloc
      };
    }

    res.json({ success: true, count: receiptsWithAllocations.length, data: receiptsWithAllocations });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route GET /api/payments/outstanding-summary
// Shows paid-till and pending amounts for all occupancies effective for the requested targetMonth
router.get('/outstanding-summary', protect, async (req, res) => {
  try {
    const { upToMonthYear } = req.query;
    const targetMonth = upToMonthYear || getCurrentMonthYear();

    const [year, m] = targetMonth.split('-').map(Number);
    const totalDays = new Date(year, m, 0).getDate();
    const monthStart = new Date(Date.UTC(year, m - 1, 1, 0, 0, 0));
    const monthEnd = new Date(Date.UTC(year, m - 1, totalDays, 23, 59, 59, 999));

    // Fast parallel batch pre-fetch of units, assignments, agreements, allocations, and tenants
    const [
      reversedReceiptIds,
      allUnits,
      allAssignments,
      allAgreements,
      allAllocations,
      allTenants,
      monthReceipts
    ] = await Promise.all([
      PaymentReceipt.find({ isReversed: true }).distinct('_id'),
      Unit.find({ isActive: { $ne: false } })
        .populate('propertyId', 'name propertyCode displayOrder totalAreaSqFt propertyType address')
        .sort({ displayOrder: 1, unitCode: 1 }),
      TenantAssignment.find({
        status: { $nin: ['Terminated', 'Cancelled'] },
        $or: [
          { startDate: null, endDate: null },
          { startDate: null, endDate: { $gte: monthStart } },
          { startDate: { $lte: monthEnd }, endDate: null },
          { startDate: { $lte: monthEnd }, endDate: { $gte: monthStart } }
        ]
      }).populate('tenantId', 'name tenantCode phone').sort({ startDate: -1 }),
      RentAgreement.find({}).sort({ effectiveFrom: 1 }),
      PaymentAllocation.find({}),
      Tenant.find({}),
      PaymentReceipt.find({
        isReversed: false,
        $or: [
          { accountingMonth: targetMonth },
          { receiptDate: { $gte: monthStart, $lte: monthEnd } }
        ]
      }).select('unitId tenantId status rentAmount depositAmount totalAmount contractNo accountingMonth')
    ]);

    const revIdSet = new Set(reversedReceiptIds.map(String));
    const validAllocations = allAllocations.filter(a => !revIdSet.has(String(a.receiptId)));
    const targetAllocs = validAllocations.filter(a => a.rentMonthYear === targetMonth);

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

    const tenantsById = new Map();
    for (const t of allTenants) {
      tenantsById.set(String(t._id), t);
    }

    const unitsById = new Map();
    for (const u of allUnits) {
      unitsById.set(String(u._id), u);
    }

    const calcOptions = {
      reversedReceiptIds,
      agreementsByAssign,
      allocationsByUnitTenant
    };

    const summaries = [];
    const processedPairs = new Set();

    for (const unit of allUnits) {
      if (!unit.propertyId) continue;

      // 1. Find all active assignments covering targetMonth for this unit
      const assigns = allAssignments.filter(a => {
        const uId = String(a.unitId?._id || a.unitId || '');
        if (uId !== String(unit._id)) return false;
        if (a.startDate && new Date(a.startDate) > monthEnd) return false;
        if (a.endDate && new Date(a.endDate) < monthStart) return false;
        if (a.status === 'Terminated' || a.status === 'Cancelled') return false;
        return true;
      });

      // Check if unit has a receipt for this month explicitly marked as Vacant
      const unitMonthReceipt = monthReceipts.find(r => String(r.unitId?._id || r.unitId) === String(unit._id));
      const isExplicitlyVacant = unitMonthReceipt?.status === 'Vacant';

      // If no active lease contract covering targetMonth, unit is Vacant
      if (!assigns || assigns.length === 0) {
        summaries.push({
          assignmentId: null,
          assignmentCode: '',
          contractNo: '',
          contractStatus: 'Vacant',
          contractType: 'Rent',
          startDate: null,
          endDate: null,
          createdAt: null,
          updatedAt: null,
          status: 'Vacant',
          tenant: null,
          unit: unit,
          property: unit.propertyId,
          monthlyRentExpected: 0,
          actualPaidForMonth: 0,
          rentAmountPaid: 0,
          depositAmount: 0,
          paidTillMonth: 'Vacant',
          nextUnpaidMonth: 'None',
          totalExpected: 0,
          totalAllocated: 0,
          totalOutstanding: 0,
          isOverdue: false,
          unpaidMonthsCount: 0,
          monthsBreakdown: []
        });
        continue;
      }

      for (const assign of assigns) {
        if (!assign || !assign.tenantId) continue;
        const tenantActualId = assign.tenantId._id || assign.tenantId;
        const pairKey = `${String(unit._id)}_${String(tenantActualId)}`;
        if (processedPairs.has(pairKey)) continue;
        processedPairs.add(pairKey);

        const ledger = await calculateTenantUnitLedger(unit._id, tenantActualId, targetMonth, assign, calcOptions);
        const effectiveRate = await getEffectiveRentForMonth(unit._id, tenantActualId, targetMonth, assign, calcOptions);
        const targetMonthData = ledger.monthsBreakdown.find(m => m.monthYear === targetMonth);
        const activeReceipt = monthReceipts.find(r => 
          String(r.unitId?._id || r.unitId) === String(unit._id) &&
          (r.accountingMonth === targetMonth || (r.monthPaidFor && r.monthPaidFor.includes(targetMonth))) &&
          (!r.tenantId || String(r.tenantId?._id || r.tenantId) === String(tenantActualId))
        ) || monthReceipts.find(r => String(r.unitId?._id || r.unitId) === String(unit._id)) || unitMonthReceipt;
        const receiptPaidInMonth = (activeReceipt && activeReceipt.status !== 'Vacant' && activeReceipt.totalAmount !== undefined)
          ? (Number(activeReceipt.totalAmount) || 0)
          : null;
        const receiptRentInMonth = (activeReceipt && activeReceipt.status !== 'Vacant')
          ? (activeReceipt.rentAmount !== undefined ? Number(activeReceipt.rentAmount) : receiptPaidInMonth)
          : null;
        const receiptDepositInMonth = (activeReceipt && activeReceipt.status !== 'Vacant' && activeReceipt.depositAmount !== undefined)
          ? Number(activeReceipt.depositAmount)
          : 0;
        const actualPaidForMonth = isExplicitlyVacant
          ? 0
          : (receiptPaidInMonth !== null
              ? receiptPaidInMonth
              : (targetMonthData ? (targetMonthData.actualAllocated ?? targetMonthData.allocatedAmount ?? 0) : 0));
        const actualRentForMonth = isExplicitlyVacant
          ? 0
          : (receiptRentInMonth !== null
              ? receiptRentInMonth
              : actualPaidForMonth);
        const actualDepositForMonth = isExplicitlyVacant ? 0 : receiptDepositInMonth;

        summaries.push({
          assignmentId: assign._id,
          assignmentCode: assign.assignmentCode,
          contractNo: isExplicitlyVacant ? '' : (assign.contractNo || assign.assignmentCode),
          contractStatus: assign.status, // Preserve underlying contract status for reference
          contractType: assign.contractType || 'Rent',
          startDate: assign.startDate,
          endDate: assign.endDate,
          createdAt: assign.createdAt,
          updatedAt: assign.updatedAt,
          status: isExplicitlyVacant ? 'Vacant' : (unitMonthReceipt?.status || 'Rented'),
          tenant: isExplicitlyVacant ? null : assign.tenantId,
          unit: unit,
          property: unit.propertyId,
          monthlyRentExpected: isExplicitlyVacant ? 0 : (effectiveRate || unit.monthlyRentExpected || 0),
          actualPaidForMonth: actualPaidForMonth,
          rentAmountPaid: actualRentForMonth,
          depositAmount: actualDepositForMonth,
          paidTillMonth: isExplicitlyVacant ? 'Vacant' : (ledger.paidTillMonth || 'None'),
          nextUnpaidMonth: isExplicitlyVacant ? 'None' : (ledger.nextUnpaidMonth || 'Up to date'),
          totalExpected: isExplicitlyVacant ? 0 : ledger.totalExpected,
          totalAllocated: isExplicitlyVacant ? 0 : ledger.totalAllocated,
          totalOutstanding: isExplicitlyVacant ? 0 : ledger.totalOutstanding,
          isOverdue: isExplicitlyVacant ? false : (ledger.totalOutstanding > 0),
          unpaidMonthsCount: isExplicitlyVacant ? 0 : ledger.monthsBreakdown.filter(m => m.status === 'Unpaid' || m.status === 'Partially Paid').length,
          monthsBreakdown: isExplicitlyVacant ? [] : ledger.monthsBreakdown
        });
      }
    }

    summaries.sort((a, b) => {
      const orderA = (a.property?.displayOrder && a.property.displayOrder > 0) ? a.property.displayOrder : 9999;
      const orderB = (b.property?.displayOrder && b.property.displayOrder > 0) ? b.property.displayOrder : 9999;
      if (orderA !== orderB) return orderA - orderB;
      const nameA = a.property?.name || '';
      const nameB = b.property?.name || '';
      if (nameA.localeCompare(nameB) !== 0) return nameA.localeCompare(nameB);
      const unitA = a.unit?.subUnitPartition || a.unit?.unitName || '';
      const unitB = b.unit?.subUnitPartition || b.unit?.unitName || '';
      return unitA.localeCompare(unitB);
    });

    res.json({ success: true, targetMonth, count: summaries.length, data: summaries });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route GET /api/payments/tenant-unit-ledger
router.get('/tenant-unit-ledger', protect, async (req, res) => {
  try {
    const { unitId, tenantId, upToMonthYear } = req.query;
    if (!unitId || !tenantId) {
      return res.status(400).json({ success: false, message: 'unitId and tenantId are required' });
    }

    const ledger = await calculateTenantUnitLedger(unitId, tenantId, upToMonthYear || getCurrentMonthYear());
    res.json({ success: true, data: ledger });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route GET /api/payments/:id
// Get single receipt with populated details and allocations
router.get('/:id', protect, async (req, res) => {
  try {
    const receipt = await PaymentReceipt.findById(req.params.id)
      .populate('tenantId', 'name tenantCode phone email')
      .populate({
        path: 'unitId',
        populate: { path: 'propertyId', select: 'name propertyCode' }
      });
    if (!receipt) {
      return res.status(404).json({ success: false, message: 'Receipt not found' });
    }
    const allocations = await PaymentAllocation.find({ receiptId: receipt._id }).sort({ rentMonthYear: 1 });
    res.json({
      success: true,
      data: {
        ...receipt.toObject(),
        allocations
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * Collision-proof receipt number generator.
 * Finds highest numeric sequence for the year and guarantees uniqueness.
 */
async function getNextReceiptNumber(receiptDate) {
  const d = receiptDate ? new Date(receiptDate) : new Date();
  const year = isNaN(d.getFullYear()) ? new Date().getFullYear() : d.getFullYear();
  const prefix = "REC-" + year + "-";

  const allYearReceipts = await PaymentReceipt.find({
    receiptNumber: new RegExp("^REC-" + year + "-")
  }).select('receiptNumber').lean();

  let maxNum = 0;
  for (const r of allYearReceipts) {
    if (r.receiptNumber) {
      const parts = r.receiptNumber.split('-');
      const num = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(num) && num > maxNum) {
        maxNum = num;
      }
    }
  }

  let nextSeq = maxNum + 1;
  while (await PaymentReceipt.exists({ receiptNumber: prefix + String(nextSeq).padStart(5, '0') })) {
    nextSeq++;
  }

  return prefix + String(nextSeq).padStart(5, '0');
}

// @route POST /api/payments
// Create receipt and allocate amount to rent months
router.post('/', protect, authorize('admin', 'manager'), [
  body('tenantId').custom((val, { req }) => {
    if (req.body.status === 'Vacant') return true;
    if (!val || !mongoose.Types.ObjectId.isValid(val)) {
      throw new Error('Valid tenant ID is required when status is Rented');
    }
    return true;
  }),
  body('unitId').isMongoId().withMessage('Valid unit ID is required'),
  body('receiptDate').isISO8601().withMessage('Valid receipt date is required'),
  body('totalAmount').isNumeric().withMessage('Total amount must be a number'),
  body('allocations').isArray({ min: 1 }).withMessage('At least one month allocation is required')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  try {
    const {
      tenantId,
      unitId,
      receiptDate,
      totalAmount,
      comments,
      allocations
    } = req.body;
    const status = req.body.status === 'Vacant' ? 'Vacant' : 'Rented';
    const finalTenantId = status === 'Vacant' ? null : tenantId;
    const finalContractNo = status === 'Vacant' ? '' : (req.body.contractNo || '');

    const parsedDeposit = Number(req.body.depositAmount) || 0;
    let parsedRent = req.body.rentAmount !== undefined && req.body.rentAmount !== ''
      ? Number(req.body.rentAmount)
      : (totalAmount !== undefined && totalAmount !== ''
          ? Math.max(0, Number(totalAmount) - parsedDeposit)
          : 0);
    const parsedTotal = parsedRent + parsedDeposit;
    const sumAllocated = allocations.reduce((sum, a) => sum + Number(a.allocatedAmount || 0), 0);

    // Allocations allocate the rent portion across rent months (allow matching parsedRent or parsedTotal)
    if (Math.abs(parsedRent - sumAllocated) > 0.01 && Math.abs(parsedTotal - sumAllocated) > 0.01) {
      return res.status(400).json({
        success: false,
        message: `Sum of monthly allocations (₹${sumAllocated}) must equal rent amount paid (₹${parsedRent})`
      });
    }

    const allocMonthsList = (allocations || []).map(a => a.rentMonthYear).filter(Boolean);
    const targetMonth = allocMonthsList[0] || req.body.accountingMonth || req.body.monthPaidFor || (receiptDate ? new Date(receiptDate).toISOString().slice(0, 7) : getCurrentMonthYear());
    const finalMonthPaidFor = allocMonthsList.join(', ') || targetMonth;

    // RULE: Only one receipt per property unit per month.
    // If an active receipt already exists for this unit & month, update it in place!
    let existingReceipt = null;

    const existingAlloc = await PaymentAllocation.findOne({
      unitId,
      rentMonthYear: targetMonth
    });
    if (existingAlloc && existingAlloc.receiptId) {
      existingReceipt = await PaymentReceipt.findById(existingAlloc.receiptId);
      if (existingReceipt && existingReceipt.isReversed) existingReceipt = null;
    }

    if (!existingReceipt) {
      existingReceipt = await PaymentReceipt.findOne({
        unitId,
        isReversed: false,
        $or: [
          { accountingMonth: targetMonth },
          { monthPaidFor: { $regex: targetMonth } }
        ]
      });
    }

    if (existingReceipt) {
      // UPDATE EXISTING RECEIPT IN PLACE
      existingReceipt.status = status;
      existingReceipt.tenantId = finalTenantId;
      existingReceipt.contractNo = finalContractNo;
      existingReceipt.rentAmount = parsedRent;
      existingReceipt.depositAmount = parsedDeposit;
      existingReceipt.totalAmount = parsedTotal;
      if (receiptDate) existingReceipt.receiptDate = receiptDate;
      if (comments !== undefined) existingReceipt.comments = comments;
      existingReceipt.accountingMonth = targetMonth;
      existingReceipt.monthPaidFor = finalMonthPaidFor;
      if (req.body.adjustmentAmount !== undefined) existingReceipt.adjustmentAmount = Number(req.body.adjustmentAmount) || 0;
      if (req.body.adjustmentDescription !== undefined) existingReceipt.adjustmentDescription = req.body.adjustmentDescription || '';
      await existingReceipt.save();

      await PaymentAllocation.deleteMany({ receiptId: existingReceipt._id });
      const createdAllocations = [];
      for (const alloc of allocations) {
        const created = await PaymentAllocation.create({
          receiptId: existingReceipt._id,
          tenantId: finalTenantId,
          unitId,
          rentMonthYear: alloc.rentMonthYear,
          allocatedAmount: Number(alloc.allocatedAmount),
          contractNo: finalContractNo,
          notes: alloc.notes || ''
        });
        createdAllocations.push(created);
      }

      // Clean up any extra duplicate receipts for this unit & month
      const duplicates = await PaymentReceipt.find({
        _id: { $ne: existingReceipt._id },
        unitId,
        isReversed: false,
        $or: [
          { accountingMonth: targetMonth },
          { monthPaidFor: targetMonth }
        ]
      });
      for (const dup of duplicates) {
        await PaymentAllocation.deleteMany({ receiptId: dup._id });
        await PaymentReceipt.findByIdAndDelete(dup._id);
      }

      await logAudit({
        userId: req.user._id,
        action: 'UPDATE_PAYMENT',
        entityType: 'PaymentReceipt',
        entityId: existingReceipt._id,
        description: `Updated single monthly receipt ${existingReceipt.receiptNumber} of ₹${parsedTotal} for ${targetMonth}`,
        req
      });

      setImmediate(() => syncMonthlyLedgers().catch(console.error));

      return res.json({
        success: true,
        message: 'Payment updated successfully',
        data: { receipt: existingReceipt, allocations: createdAllocations }
      });
    }

    // No existing receipt: create new with collision-proof receipt number
    const receiptNumber = await getNextReceiptNumber(receiptDate);

    const receipt = await PaymentReceipt.create({
      receiptNumber,
      receiptDate,
      monthPaidFor: finalMonthPaidFor,
      accountingMonth: targetMonth,
      status,
      tenantId: finalTenantId,
      unitId,
      rentAmount: parsedRent,
      depositAmount: parsedDeposit,
      totalAmount: parsedTotal,
      comments: comments || '',
      contractNo: finalContractNo,
      adjustmentAmount: Number(req.body.adjustmentAmount) || 0,
      adjustmentDescription: req.body.adjustmentDescription || '',
      recordedBy: req.user._id
    });

    const createdAllocations = [];
    for (const alloc of allocations) {
      const created = await PaymentAllocation.create({
        receiptId: receipt._id,
        tenantId: finalTenantId,
        unitId,
        rentMonthYear: alloc.rentMonthYear,
        allocatedAmount: Number(alloc.allocatedAmount),
        contractNo: finalContractNo,
        notes: alloc.notes || ''
      });
      createdAllocations.push(created);
    }

    await logAudit({
      userId: req.user._id,
      action: 'PAYMENT_RECEIVED',
      entityType: 'PaymentReceipt',
      entityId: receipt._id,
      description: `Recorded payment receipt ${receiptNumber} of ₹${parsedTotal} for tenant`,
      newState: { receipt, createdAllocations },
      req
    });

    setImmediate(() => syncMonthlyLedgers().catch(console.error));

    res.status(201).json({
      success: true,
      message: 'Payment recorded and allocated successfully',
      data: { receipt, allocations: createdAllocations }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route PUT /api/payments/:id
// Update payment receipt details & allocations
router.put('/:id', protect, authorize('admin', 'manager'), [
  body('receiptDate').optional().isISO8601().withMessage('Valid receipt date is required'),
  body('totalAmount').optional().isNumeric().withMessage('Total amount must be a number'),
    body('allocations').optional().isArray({ min: 1 }).withMessage('At least one month allocation is required')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  try {
    let receipt = await PaymentReceipt.findById(req.params.id);
    if (!receipt) {
      const parsedTotal = req.body.totalAmount !== undefined ? Number(req.body.totalAmount) : 0;
      if (parsedTotal === 0) {
        await PaymentAllocation.deleteMany({
          $or: [{ receiptId: req.params.id }, { _id: req.params.id }]
        });
        setImmediate(() => syncMonthlyLedgers().catch(console.error));
        return res.json({ success: true, message: 'Payment set to zero', data: { totalAmount: 0, allocations: [] } });
      }
      return res.status(404).json({ success: false, message: 'Receipt not found' });
    }
    if (receipt.isReversed) {
      return res.status(400).json({ success: false, message: 'Cannot edit a cancelled/reversed receipt' });
    }

    const {
      tenantId,
      unitId,
      receiptNumber,
      receiptDate,
      totalAmount,
      comments,
      allocations,
      contractNo,
      status
    } = req.body;

    const parsedDeposit = req.body.depositAmount !== undefined && req.body.depositAmount !== ''
      ? Number(req.body.depositAmount)
      : (receipt.depositAmount || 0);

    let parsedRent = req.body.rentAmount !== undefined && req.body.rentAmount !== ''
      ? Number(req.body.rentAmount)
      : (totalAmount !== undefined && totalAmount !== ''
          ? Math.max(0, Number(totalAmount) - parsedDeposit)
          : (receipt.rentAmount !== undefined ? receipt.rentAmount : (receipt.totalAmount - parsedDeposit)));

    const parsedTotal = (totalAmount !== undefined && req.body.rentAmount === undefined && req.body.depositAmount === undefined)
      ? Number(totalAmount)
      : (parsedRent + parsedDeposit);

    const newStatus = status !== undefined ? status : (receipt.status || 'Rented');
    const targetTenantId = newStatus === 'Vacant' ? null : (tenantId !== undefined ? tenantId : receipt.tenantId);
    const targetUnitId = unitId || receipt.unitId;
    const targetContractNo = newStatus === 'Vacant' ? '' : (contractNo !== undefined ? contractNo : (receipt.contractNo || ''));

    if (allocations && Array.isArray(allocations)) {
      const sumAllocated = allocations.reduce((sum, a) => sum + Number(a.allocatedAmount || 0), 0);
      if (Math.abs(parsedRent - sumAllocated) > 0.01 && Math.abs(parsedTotal - sumAllocated) > 0.01) {
        return res.status(400).json({
          success: false,
          message: `Sum of monthly allocations (₹${sumAllocated}) must equal rent amount paid (₹${parsedRent})`
        });
      }

      // Remove previous allocations and create new ones
      await PaymentAllocation.deleteMany({ receiptId: receipt._id });
      for (const alloc of allocations) {
        await PaymentAllocation.create({
          receiptId: receipt._id,
          tenantId: targetTenantId,
          unitId: targetUnitId,
          rentMonthYear: alloc.rentMonthYear,
          allocatedAmount: Number(alloc.allocatedAmount),
          contractNo: targetContractNo,
          notes: alloc.notes || ''
        });
      }
    } else {
      const updateFields = {};
      if (tenantId) updateFields.tenantId = targetTenantId;
      if (unitId) updateFields.unitId = targetUnitId;
      if (contractNo !== undefined) updateFields.contractNo = targetContractNo;
      if (Object.keys(updateFields).length > 0) {
        await PaymentAllocation.updateMany({ receiptId: receipt._id }, updateFields);
      }
    }

    receipt.status = newStatus;
    receipt.tenantId = targetTenantId;
    receipt.unitId = targetUnitId;
    if (receiptNumber && receiptNumber.trim()) receipt.receiptNumber = receiptNumber.trim();
    if (receiptDate) receipt.receiptDate = receiptDate;
    receipt.rentAmount = parsedRent;
    receipt.depositAmount = parsedDeposit;
    receipt.totalAmount = parsedTotal;
    if (comments !== undefined) receipt.comments = comments;
    receipt.contractNo = targetContractNo;
    if (allocations && Array.isArray(allocations)) {
      const allocMonths = allocations.map(a => a.rentMonthYear).filter(Boolean).join(', ');
      receipt.monthPaidFor = allocMonths;
      receipt.accountingMonth = allocMonths;
    } else if (req.body.monthPaidFor !== undefined) {
      receipt.monthPaidFor = req.body.monthPaidFor;
      receipt.accountingMonth = req.body.monthPaidFor;
    } else if (req.body.accountingMonth !== undefined) {
      receipt.monthPaidFor = req.body.accountingMonth;
      receipt.accountingMonth = req.body.accountingMonth;
    } else if (receiptDate) {
      const dMonth = new Date(receiptDate).toISOString().slice(0, 7);
      receipt.monthPaidFor = dMonth;
      receipt.accountingMonth = dMonth;
    }
    if (req.body.adjustmentAmount !== undefined) receipt.adjustmentAmount = Number(req.body.adjustmentAmount) || 0;
    if (req.body.adjustmentDescription !== undefined) receipt.adjustmentDescription = req.body.adjustmentDescription;

    await receipt.save();

    // Clean up any other duplicate receipts for this unit & month to guarantee single receipt
    const targetMonth = receipt.accountingMonth || receipt.monthPaidFor;
    if (targetMonth && targetUnitId) {
      const duplicates = await PaymentReceipt.find({
        _id: { $ne: receipt._id },
        unitId: targetUnitId,
        isReversed: false,
        $or: [
          { accountingMonth: targetMonth },
          { monthPaidFor: targetMonth }
        ]
      });
      for (const dup of duplicates) {
        await PaymentAllocation.deleteMany({ receiptId: dup._id });
        await PaymentReceipt.findByIdAndDelete(dup._id);
      }
    }

    await logAudit({
      userId: req.user._id,
      action: 'UPDATE_PAYMENT',
      entityType: 'PaymentReceipt',
      entityId: receipt._id,
      description: `Updated receipt ${receipt.receiptNumber} amount ₹${receipt.totalAmount}`,
      req
    });

    const updatedAllocations = await PaymentAllocation.find({ receiptId: receipt._id });
    setImmediate(() => syncMonthlyLedgers().catch(console.error));

    res.json({
      success: true,
      message: 'Payment updated successfully',
      data: { receipt, allocations: updatedAllocations }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route POST /api/payments/:id/reverse
// Safe audited reversal of payment
router.post('/:id/reverse', protect, authorize('admin'), [
  body('reversalReason').trim().notEmpty().withMessage('Reversal reason is required')
], async (req, res) => {
  try {
    let receipt = await PaymentReceipt.findById(req.params.id);
    if (!receipt) {
      return res.status(404).json({ success: false, message: 'Receipt not found' });
    }
    if (receipt.isReversed) {
      return res.status(400).json({ success: false, message: 'Receipt is already reversed' });
    }

    receipt.isReversed = true;
    receipt.reversalReason = req.body.reversalReason;
    receipt.reversalDate = new Date();
    await receipt.save();

    await logAudit({
      userId: req.user._id,
      action: 'REVERSE_PAYMENT',
      entityType: 'PaymentReceipt',
      entityId: receipt._id,
      description: `Reversed receipt ${receipt.receiptNumber} of ₹${receipt.totalAmount}. Reason: ${req.body.reversalReason}`,
      req
    });

    setImmediate(() => syncMonthlyLedgers().catch(console.error));

    res.json({ success: true, message: 'Payment successfully reversed with full audit trail', data: receipt });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route DELETE /api/payments/:id (and /api/payments/:id/permanent)
// Hard delete payment receipt and allocations
const deletePaymentHandler = async (req, res) => {
  try {
    const receiptId = req.params.id;
    if (receiptId) {
      await PaymentAllocation.deleteMany({
        $or: [{ receiptId: receiptId }, { _id: receiptId }]
      });
    }

    const receipt = await PaymentReceipt.findById(receiptId);
    if (!receipt) {
      setImmediate(() => syncMonthlyLedgers().catch(console.error));
      return res.json({ success: true, message: 'Payment receipt is already removed' });
    }

    await PaymentReceipt.findByIdAndDelete(receipt._id);

    await logAudit({
      userId: req.user._id,
      action: 'DELETE_PAYMENT',
      entityType: 'PaymentReceipt',
      entityId: receipt._id,
      description: `Permanently deleted receipt ${receipt.receiptNumber} of ₹${receipt.totalAmount}`,
      req
    });

    setImmediate(() => syncMonthlyLedgers().catch(console.error));

    res.json({ success: true, message: 'Payment receipt permanently deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

router.delete('/:id/permanent', protect, authorize('admin', 'manager'), deletePaymentHandler);
router.delete('/:id', protect, authorize('admin', 'manager'), deletePaymentHandler);

module.exports = router;
