const mongoose = require('mongoose');
const Tenant = require('../models/Tenant');
const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const PaymentReceipt = require('../models/PaymentReceipt');
const PaymentAllocation = require('../models/PaymentAllocation');
const TenantAssignment = require('../models/TenantAssignment');
const Unit = require('../models/Unit');
const { calculateTenantUnitLedger, getEffectiveRentForMonth, getCurrentMonthYear } = require('../services/rentCalculator');
const { protect, authorize } = require('../middleware/auth');
const logAudit = require('../utils/audit');
const { syncMonthlyLedgers } = require('../utils/ledgerSync');

// @route GET /api/payments
router.get('/', protect, async (req, res) => {
  try {
    const { tenantId, unitId, startDate, endDate, mode, contractNo } = req.query;
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
    if (mode) query.paymentMode = mode;
    if (startDate || endDate) {
      query.receiptDate = {};
      if (startDate) query.receiptDate.$gte = new Date(startDate);
      if (endDate) query.receiptDate.$lte = new Date(endDate);
    }

    const receipts = await PaymentReceipt.find(query)
      .populate('tenantId', 'name tenantCode phone')
      .populate({
        path: 'unitId',
        populate: { path: 'propertyId', select: 'name propertyCode' }
      })
      .sort({ receiptDate: -1 });

    // Fetch allocations for these receipts
    const receiptIds = receipts.map(r => r._id);
    const allocations = await PaymentAllocation.find({ receiptId: { $in: receiptIds } });

    const receiptsWithAllocations = receipts.map(r => {
      const rAlloc = allocations.filter(a => a.receiptId.toString() === r._id.toString());
      return {
        ...r.toObject(),
        allocations: rAlloc,
        monthsCovered: rAlloc.map(a => a.rentMonthYear).join(', ')
      };
    });

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

    // Get all units excluding inactive ones
    const reversedReceiptIds = await PaymentReceipt.find({ isReversed: true }).distinct('_id');
    const targetAllocs = await PaymentAllocation.find({
      rentMonthYear: targetMonth,
      receiptId: { $nin: reversedReceiptIds }
    });

    const allUnits = await Unit.find({ isActive: { $ne: false } })
      .populate('propertyId', 'name propertyCode displayOrder totalAreaSqFt propertyType address')
      .sort({ displayOrder: 1, unitCode: 1 });

    const summaries = [];
    const processedPairs = new Set();

    for (const unit of allUnits) {
      if (!unit.propertyId) continue;

      // 1. Find all active assignments covering targetMonth
      let assigns = await TenantAssignment.find({
        unitId: unit._id,
        $or: [
          { startDate: { $lte: monthEnd }, endDate: { $gte: monthStart } },
          { startDate: null, endDate: null },
          { startDate: { $lte: monthEnd }, endDate: null }
        ]
      }).populate('tenantId', 'name tenantCode phone').sort({ startDate: -1 });

      // Fallback if no matching assignment for targetMonth
      if (!assigns || assigns.length === 0) {
        let fallback = await TenantAssignment.findOne({ unitId: unit._id, status: 'Active' })
          .populate('tenantId', 'name tenantCode phone').sort({ startDate: -1 });
        if (!fallback) {
          fallback = await TenantAssignment.findOne({ unitId: unit._id })
            .populate('tenantId', 'name tenantCode phone').sort({ startDate: -1 });
        }
        if (fallback) assigns = [fallback];
      }

      // Check allocations for this unit in targetMonth
      const unitAllocs = targetAllocs.filter(a => a.unitId.toString() === unit._id.toString());
      for (const ua of unitAllocs) {
        const alreadyHas = assigns.some(asgn => asgn.tenantId && asgn.tenantId._id.toString() === ua.tenantId.toString());
        if (!alreadyHas) {
          let uaAssign = await TenantAssignment.findOne({ unitId: unit._id, tenantId: ua.tenantId })
            .populate('tenantId', 'name tenantCode phone').sort({ startDate: -1 });
          if (!uaAssign) {
            const t = await Tenant.findById(ua.tenantId);
            if (t) {
              uaAssign = {
                _id: new mongoose.Types.ObjectId(),
                assignmentCode: `AUTO-${ua.contractNo || 'IMPORT'}`,
                contractNo: ua.contractNo || '',
                status: 'Ended',
                startDate: monthStart,
                endDate: monthEnd,
                tenantId: t,
                unitId: unit
              };
            }
          }
          if (uaAssign) assigns.push(uaAssign);
        }
      }

      for (const assign of assigns) {
        if (!assign || !assign.tenantId) continue;
        const pairKey = `${unit._id.toString()}_${assign.tenantId._id.toString()}`;
        if (processedPairs.has(pairKey)) continue;
        processedPairs.add(pairKey);

        const ledger = await calculateTenantUnitLedger(unit._id, assign.tenantId._id, targetMonth, assign);
        const effectiveRate = await getEffectiveRentForMonth(unit._id, assign.tenantId._id, targetMonth, assign);
        const targetMonthData = ledger.monthsBreakdown.find(m => m.monthYear === targetMonth);
        const actualPaidForMonth = targetMonthData ? (targetMonthData.actualAllocated ?? targetMonthData.allocatedAmount ?? 0) : 0;

        summaries.push({
          assignmentId: assign._id,
          assignmentCode: assign.assignmentCode,
          contractNo: assign.contractNo || assign.assignmentCode,
          contractStatus: assign.status,
          contractType: assign.contractType || 'Rent',
          startDate: assign.startDate,
          endDate: assign.endDate,
          createdAt: assign.createdAt,
          updatedAt: assign.updatedAt,
          tenant: assign.tenantId,
          unit: unit,
          property: unit.propertyId,
          monthlyRentExpected: effectiveRate || unit.monthlyRentExpected || 0,
          actualPaidForMonth: actualPaidForMonth,
          paidTillMonth: ledger.paidTillMonth || 'None',
          nextUnpaidMonth: ledger.nextUnpaidMonth || 'Up to date',
          totalExpected: ledger.totalExpected,
          totalAllocated: ledger.totalAllocated,
          totalOutstanding: ledger.totalOutstanding,
          isOverdue: ledger.totalOutstanding > 0,
          unpaidMonthsCount: ledger.monthsBreakdown.filter(m => m.status === 'Unpaid' || m.status === 'Partially Paid').length,
          monthsBreakdown: ledger.monthsBreakdown
        });
      }
    }

    // Also include any allocations for special units or units not in allUnits
    for (const a of targetAllocs) {
      const pairKey = `${a.unitId.toString()}_${a.tenantId.toString()}`;
      if (!processedPairs.has(pairKey)) {
        processedPairs.add(pairKey);
        const u = await Unit.findById(a.unitId).populate('propertyId');
        const t = await Tenant.findById(a.tenantId);
        if (u && t && u.propertyId) {
          let asgn = await TenantAssignment.findOne({ unitId: u._id, tenantId: t._id });
          if (!asgn) {
            asgn = {
              _id: new mongoose.Types.ObjectId(),
              assignmentCode: `AUTO-${a.contractNo || 'IMPORT'}`,
              contractNo: a.contractNo || '',
              status: 'Ended',
              startDate: monthStart,
              endDate: monthEnd,
              tenantId: t,
              unitId: u
            };
          }
          const ledger = await calculateTenantUnitLedger(u._id, t._id, targetMonth, asgn);
          const effectiveRate = await getEffectiveRentForMonth(u._id, t._id, targetMonth, asgn);
          const targetMonthData = ledger.monthsBreakdown.find(m => m.monthYear === targetMonth);
          const actualPaidForMonth = targetMonthData ? (targetMonthData.actualAllocated ?? targetMonthData.allocatedAmount ?? 0) : 0;

          summaries.push({
            assignmentId: asgn._id,
            assignmentCode: asgn.assignmentCode,
            contractNo: asgn.contractNo || asgn.assignmentCode,
            contractStatus: asgn.status,
            contractType: asgn.contractType || 'Rent',
            startDate: asgn.startDate,
            endDate: asgn.endDate,
            createdAt: asgn.createdAt,
            updatedAt: asgn.updatedAt,
            tenant: t,
            unit: u,
            property: u.propertyId,
            monthlyRentExpected: effectiveRate || u.monthlyRentExpected || 0,
            actualPaidForMonth: actualPaidForMonth,
            paidTillMonth: ledger.paidTillMonth || 'None',
            nextUnpaidMonth: ledger.nextUnpaidMonth || 'Up to date',
            totalExpected: ledger.totalExpected,
            totalAllocated: ledger.totalAllocated,
            totalOutstanding: ledger.totalOutstanding,
            isOverdue: ledger.totalOutstanding > 0,
            unpaidMonthsCount: ledger.monthsBreakdown.filter(m => m.status === 'Unpaid' || m.status === 'Partially Paid').length,
            monthsBreakdown: ledger.monthsBreakdown
          });
        }
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

// @route POST /api/payments
// Create receipt and allocate amount to rent months
router.post('/', protect, authorize('admin', 'manager'), [
  body('tenantId').isMongoId().withMessage('Valid tenant ID is required'),
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
      paymentMode,
      referenceNumber,
      bankName,
      comments,
      allocations // array of { rentMonthYear: "YYYY-MM", allocatedAmount: number, notes?: string }
    } = req.body;

    const parsedTotal = Number(totalAmount);
    const sumAllocated = allocations.reduce((sum, a) => sum + Number(a.allocatedAmount || 0), 0);

    if (Math.abs(parsedTotal - sumAllocated) > 0.01) {
      return res.status(400).json({
        success: false,
        message: `Sum of monthly allocations (₹${sumAllocated}) must equal receipt total amount (₹${parsedTotal})`
      });
    }

    // Generate receipt number
    const count = await PaymentReceipt.countDocuments();
    const d = new Date(receiptDate);
    const receiptNumber = `REC-${d.getFullYear()}-${String(count + 1).padStart(5, '0')}`;

    const receipt = await PaymentReceipt.create({
      receiptNumber,
      receiptDate,
      tenantId,
      unitId,
      totalAmount: parsedTotal,
      paymentMode: paymentMode || 'Cash',
      referenceNumber: referenceNumber || '',
      bankName: bankName || '',
      comments: comments || '',
      contractNo: req.body.contractNo || '',
      recordedBy: req.user._id
    });

    const createdAllocations = [];
    for (const alloc of allocations) {
      const created = await PaymentAllocation.create({
        receiptId: receipt._id,
        tenantId,
        unitId,
        rentMonthYear: alloc.rentMonthYear,
        allocatedAmount: Number(alloc.allocatedAmount),
        contractNo: req.body.contractNo || '',
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

    await syncMonthlyLedgers().catch(console.error);

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
  body('paymentMode').optional().isString(),
  body('allocations').optional().isArray({ min: 1 }).withMessage('At least one month allocation is required')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  try {
    const receipt = await PaymentReceipt.findById(req.params.id);
    if (!receipt) {
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
      paymentMode,
      referenceNumber,
      bankName,
      comments,
      allocations,
      contractNo
    } = req.body;

    const parsedTotal = totalAmount !== undefined ? Number(totalAmount) : receipt.totalAmount;
    const targetTenantId = tenantId || receipt.tenantId;
    const targetUnitId = unitId || receipt.unitId;
    const targetContractNo = contractNo !== undefined ? contractNo : (req.body.contractNo !== undefined ? req.body.contractNo : receipt.contractNo || '');

    if (allocations && Array.isArray(allocations)) {
      const sumAllocated = allocations.reduce((sum, a) => sum + Number(a.allocatedAmount || 0), 0);
      if (Math.abs(parsedTotal - sumAllocated) > 0.01) {
        return res.status(400).json({
          success: false,
          message: `Sum of monthly allocations (₹${sumAllocated}) must equal receipt total amount (₹${parsedTotal})`
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

    if (tenantId) receipt.tenantId = targetTenantId;
    if (unitId) receipt.unitId = targetUnitId;
    if (receiptNumber && receiptNumber.trim()) receipt.receiptNumber = receiptNumber.trim();
    if (receiptDate) receipt.receiptDate = receiptDate;
    if (totalAmount !== undefined) receipt.totalAmount = parsedTotal;
    if (paymentMode) receipt.paymentMode = paymentMode;
    if (referenceNumber !== undefined) receipt.referenceNumber = referenceNumber;
    if (bankName !== undefined) receipt.bankName = bankName;
    if (comments !== undefined) receipt.comments = comments;
    if (contractNo !== undefined) receipt.contractNo = targetContractNo;

    await receipt.save();

    await logAudit({
      userId: req.user._id,
      action: 'UPDATE_PAYMENT',
      entityType: 'PaymentReceipt',
      entityId: receipt._id,
      description: `Updated receipt ${receipt.receiptNumber} amount ₹${receipt.totalAmount}`,
      req
    });

    const updatedAllocations = await PaymentAllocation.find({ receiptId: receipt._id });
    await syncMonthlyLedgers().catch(console.error);

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
    const receipt = await PaymentReceipt.findById(req.params.id);
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

    await syncMonthlyLedgers().catch(console.error);

    res.json({ success: true, message: 'Payment successfully reversed with full audit trail', data: receipt });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route DELETE /api/payments/:id
// Hard delete payment receipt and allocations
router.delete('/:id', protect, authorize('admin'), async (req, res) => {
  try {
    const receipt = await PaymentReceipt.findById(req.params.id);
    if (!receipt) {
      return res.status(404).json({ success: false, message: 'Receipt not found' });
    }

    await PaymentAllocation.deleteMany({ receiptId: receipt._id });
    await PaymentReceipt.findByIdAndDelete(req.params.id);

    await logAudit({
      userId: req.user._id,
      action: 'DELETE_PAYMENT',
      entityType: 'PaymentReceipt',
      entityId: receipt._id,
      description: `Permanently deleted receipt ${receipt.receiptNumber} of ₹${receipt.totalAmount}`,
      req
    });

    await syncMonthlyLedgers().catch(console.error);

    res.json({ success: true, message: 'Payment receipt permanently deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
