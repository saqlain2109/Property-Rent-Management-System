const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const PaymentReceipt = require('../models/PaymentReceipt');
const PaymentAllocation = require('../models/PaymentAllocation');
const TenantAssignment = require('../models/TenantAssignment');
const { calculateTenantUnitLedger, getCurrentMonthYear } = require('../services/rentCalculator');
const { protect, authorize } = require('../middleware/auth');
const logAudit = require('../utils/audit');
const { syncMonthlyLedgers } = require('../utils/ledgerSync');

// @route GET /api/payments
router.get('/', protect, async (req, res) => {
  try {
    const { tenantId, unitId, startDate, endDate, mode } = req.query;
    let query = { isReversed: false };

    if (tenantId) query.tenantId = tenantId;
    if (unitId) query.unitId = unitId;
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
// Shows paid-till and pending amounts for all active occupancies
router.get('/outstanding-summary', protect, async (req, res) => {
  try {
    const { upToMonthYear } = req.query;
    const targetMonth = upToMonthYear || getCurrentMonthYear();

    const activeAssignments = await TenantAssignment.find({ status: 'Active' })
      .populate('tenantId', 'name tenantCode phone')
      .populate({
        path: 'unitId',
        populate: { path: 'propertyId', select: 'name propertyCode' }
      });

    const summaries = [];
    for (const assign of activeAssignments) {
      const ledger = await calculateTenantUnitLedger(assign.unitId._id, assign.tenantId._id, targetMonth);
      summaries.push({
        assignmentId: assign._id,
        assignmentCode: assign.assignmentCode,
        createdAt: assign.createdAt,
        updatedAt: assign.updatedAt,
        tenant: assign.tenantId,
        unit: assign.unitId,
        property: assign.unitId.propertyId,
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
      receiptDate,
      totalAmount,
      paymentMode,
      referenceNumber,
      bankName,
      comments,
      allocations
    } = req.body;

    const parsedTotal = totalAmount !== undefined ? Number(totalAmount) : receipt.totalAmount;

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
          tenantId: receipt.tenantId,
          unitId: receipt.unitId,
          rentMonthYear: alloc.rentMonthYear,
          allocatedAmount: Number(alloc.allocatedAmount),
          notes: alloc.notes || ''
        });
      }
    }

    if (receiptDate) receipt.receiptDate = receiptDate;
    if (totalAmount !== undefined) receipt.totalAmount = parsedTotal;
    if (paymentMode) receipt.paymentMode = paymentMode;
    if (referenceNumber !== undefined) receipt.referenceNumber = referenceNumber;
    if (bankName !== undefined) receipt.bankName = bankName;
    if (comments !== undefined) receipt.comments = comments;

    await receipt.save();

    await logAudit({
      userId: req.user._id,
      action: 'UPDATE_PAYMENT',
      entityType: 'PaymentReceipt',
      entityId: receipt._id,
      description: `Updated receipt ${receipt.receiptNumber} amount ₹${receipt.totalAmount}`,
      req
    });

    await PaymentAllocation.find({ receiptId: receipt._id });
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
