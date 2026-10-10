const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const PGSettlement = require('../models/PGSettlement');
const { protect, authorize } = require('../middleware/auth');
const logAudit = require('../utils/audit');

// @route GET /api/pg-settlements
router.get('/', protect, async (req, res) => {
  try {
    const settlements = await PGSettlement.find().sort({ monthYear: -1 });
    res.json({ success: true, count: settlements.length, data: settlements });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route GET /api/pg-settlements/:monthYear
router.get('/:monthYear', protect, async (req, res) => {
  try {
    const settlement = await PGSettlement.findOne({ monthYear: req.params.monthYear });
    if (!settlement) {
      return res.status(404).json({ success: false, message: 'Settlement record not found' });
    }
    res.json({ success: true, data: settlement });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route POST /api/pg-settlements
router.post('/', protect, authorize('admin', 'manager'), [
  body('monthYear').matches(/^\d{4}-\d{2}$/).withMessage('Month-Year must be in YYYY-MM format'),
  body('pgGrossCollection').isNumeric().withMessage('Gross collection must be a number')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  try {
    const {
      monthYear,
      pgGrossCollection,
      altafShare = 22000,
      anandShare = 10000,
      bisleriWaterShare = 20250,
      rehanShare = 0,
      actualBankReceived,
      notes
    } = req.body;

    const gross = Number(pgGrossCollection);
    const deductions = Number(altafShare) + Number(anandShare) + Number(bisleriWaterShare) + Number(rehanShare);
    const netReceived = gross - deductions;
    const bankReceived = actualBankReceived !== undefined ? Number(actualBankReceived) : netReceived;
    const discrepancy = bankReceived - netReceived;

    let settlement = await PGSettlement.findOne({ monthYear });
    if (settlement) {
      // update
      settlement.pgGrossCollection = gross;
      settlement.altafShare = Number(altafShare);
      settlement.anandShare = Number(anandShare);
      settlement.bisleriWaterShare = Number(bisleriWaterShare);
      settlement.rehanShare = Number(rehanShare);
      settlement.totalOperatorDeductions = deductions;
      settlement.netReceivedByOwner = netReceived;
      settlement.actualBankReceived = bankReceived;
      settlement.discrepancyOrExcess = discrepancy;
      settlement.notes = notes || settlement.notes;
      await settlement.save();
    } else {
      settlement = await PGSettlement.create({
        monthYear,
        pgGrossCollection: gross,
        altafShare: Number(altafShare),
        anandShare: Number(anandShare),
        bisleriWaterShare: Number(bisleriWaterShare),
        rehanShare: Number(rehanShare),
        totalOperatorDeductions: deductions,
        netReceivedByOwner: netReceived,
        actualBankReceived: bankReceived,
        discrepancyOrExcess: discrepancy,
        notes: notes || ''
      });
    }

    await logAudit({
      userId: req.user._id,
      action: 'PG_SETTLEMENT',
      entityType: 'PGSettlement',
      entityId: settlement._id,
      description: `Saved PG settlement for ${monthYear}: Gross ₹${gross}, Net Owner ₹${netReceived}`,
      newState: settlement.toObject(),
      req
    });

    res.status(201).json({ success: true, data: settlement });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
