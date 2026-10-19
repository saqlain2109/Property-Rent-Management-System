const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const Expense = require('../models/Expense');
const ExpenseCategory = require('../models/ExpenseCategory');
const Property = require('../models/Property');
const { protect, authorize } = require('../middleware/auth');
const logAudit = require('../utils/audit');
const { syncMonthlyLedgers } = require('../utils/ledgerSync');

// @route GET /api/expenses
router.get('/', protect, async (req, res) => {
  try {
    const { propertyId, category, startDate, endDate, month, search } = req.query;
    let query = { isReversed: false };

    if (propertyId) query.propertyId = propertyId;
    if (category) query.category = category;
    if (month) {
      const [year, m] = month.split('-').map(Number);
      const startOfMonth = new Date(Date.UTC(year, m - 1, 1, 0, 0, 0));
      const endOfMonth = new Date(Date.UTC(year, m, 0, 23, 59, 59, 999));
      query.$or = [
        { expenseMonth: month },
        { expenseDate: { $gte: startOfMonth, $lte: endOfMonth } }
      ];
    } else if (startDate || endDate) {
      query.expenseDate = {};
      if (startDate) query.expenseDate.$gte = new Date(startDate);
      if (endDate) query.expenseDate.$lte = new Date(endDate);
    }
    if (search) {
      query.$or = [
        { description: { $regex: search, $options: 'i' } },
        { vendorOrPayee: { $regex: search, $options: 'i' } },
        { expenseCode: { $regex: search, $options: 'i' } },
        { legacyCode: { $regex: search, $options: 'i' } },
      ];
    }

    const expenses = await Expense.find(query)
      .populate('propertyId', 'name propertyCode')
      .populate('unitId', 'unitName unitCode subUnitPartition')
      .sort({ expenseDate: -1 });

    const totalAmount = expenses.reduce((sum, e) => sum + e.amount, 0);

    res.json({ success: true, count: expenses.length, totalAmount, data: expenses });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route GET /api/expenses/categories
router.get('/categories', protect, async (req, res) => {
  try {
    const categories = await ExpenseCategory.find().sort({ name: 1 });
    res.json({ success: true, count: categories.length, data: categories });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route POST /api/expenses/categories
router.post('/categories', protect, authorize('admin', 'manager'), [
  body('name').trim().notEmpty().withMessage('Category name is required')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  try {
    const existing = await ExpenseCategory.findOne({ name: req.body.name.trim() });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Category already exists' });
    }

    const cat = await ExpenseCategory.create({
      name: req.body.name.trim(),
      description: req.body.description || ''
    });

    res.status(201).json({ success: true, data: cat });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route POST /api/expenses
router.post('/', protect, authorize('admin', 'manager'), [
  body('category').trim().notEmpty().withMessage('Expense category is required'),
  body('amount').isNumeric().withMessage('Amount must be a number'),
  body('description').trim().notEmpty().withMessage('Description is required')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  try {
    let { expenseDate, expenseMonth, ...rest } = req.body;

    if (!expenseDate && !expenseMonth) {
      const now = new Date();
      expenseMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }

    let finalExpenseDate;
    let finalExpenseMonth;

    if (expenseMonth && !expenseDate) {
      finalExpenseMonth = expenseMonth;
      const [y, m] = expenseMonth.split('-').map(Number);
      finalExpenseDate = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0));
    } else {
      finalExpenseDate = new Date(expenseDate);
      const y = finalExpenseDate.getFullYear();
      const m = String(finalExpenseDate.getMonth() + 1).padStart(2, '0');
      finalExpenseMonth = expenseMonth || `${y}-${m}`;
    }

    const count = await Expense.countDocuments();
    const expenseCode = `EXP-${finalExpenseDate.getFullYear()}-${String(count + 1).padStart(5, '0')}`;

    const expense = await Expense.create({
      ...rest,
      expenseDate: finalExpenseDate,
      expenseMonth: finalExpenseMonth,
      expenseCode,
      amount: Number(req.body.amount),
      recordedBy: req.user._id
    });

    await logAudit({
      userId: req.user._id,
      action: 'RECORD_EXPENSE',
      entityType: 'Expense',
      entityId: expense._id,
      description: `Recorded expense ${expenseCode} of ₹${expense.amount} under ${expense.category} for month ${finalExpenseMonth}`,
      newState: expense.toObject(),
      req
    });

    await syncMonthlyLedgers().catch(console.error);

    res.status(201).json({ success: true, data: expense });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route POST /api/expenses/:id/reverse
router.post('/:id/reverse', protect, authorize('admin'), [
  body('reversalReason').trim().notEmpty().withMessage('Reversal reason is required')
], async (req, res) => {
  try {
    const expense = await Expense.findById(req.params.id);
    if (!expense) {
      return res.status(404).json({ success: false, message: 'Expense not found' });
    }
    if (expense.isReversed) {
      return res.status(400).json({ success: false, message: 'Expense is already reversed' });
    }

    expense.isReversed = true;
    expense.reversalReason = req.body.reversalReason;
    await expense.save();

    await logAudit({
      userId: req.user._id,
      action: 'REVERSE_EXPENSE',
      entityType: 'Expense',
      entityId: expense._id,
      description: `Reversed expense ${expense.expenseCode} of ₹${expense.amount}. Reason: ${req.body.reversalReason}`,
      req
    });

    await syncMonthlyLedgers().catch(console.error);

    res.json({ success: true, message: 'Expense reversed successfully with audit trail', data: expense });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route PUT /api/expenses/:id
router.put('/:id', protect, authorize('admin', 'manager'), async (req, res) => {
  try {
    const expense = await Expense.findById(req.params.id);
    if (!expense) {
      return res.status(404).json({ success: false, message: 'Expense not found' });
    }
    const { expenseDate, expenseMonth, propertyId, unitId, category, amount, description, vendorOrPayee, paymentMode } = req.body;
    if (expenseMonth && !expenseDate) {
      expense.expenseMonth = expenseMonth;
      const [y, m] = expenseMonth.split('-').map(Number);
      expense.expenseDate = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0));
    } else if (expenseDate) {
      expense.expenseDate = new Date(expenseDate);
      const y = expense.expenseDate.getFullYear();
      const m = String(expense.expenseDate.getMonth() + 1).padStart(2, '0');
      expense.expenseMonth = expenseMonth || `${y}-${m}`;
    }
    if (propertyId !== undefined) expense.propertyId = propertyId || null;
    if (unitId !== undefined) expense.unitId = unitId || null;
    if (category) expense.category = category;
    if (amount !== undefined) expense.amount = Number(amount);
    if (description) expense.description = description;
    if (vendorOrPayee !== undefined) expense.vendorOrPayee = vendorOrPayee;
    if (paymentMode) expense.paymentMode = paymentMode;

    await expense.save();
    await syncMonthlyLedgers().catch(console.error);

    res.json({ success: true, message: 'Expense updated successfully', data: expense });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route DELETE /api/expenses/:id
// Hard delete expense
router.delete('/:id', protect, authorize('admin'), async (req, res) => {
  try {
    const expense = await Expense.findById(req.params.id);
    if (!expense) {
      return res.status(404).json({ success: false, message: 'Expense not found' });
    }

    await Expense.findByIdAndDelete(req.params.id);

    await logAudit({
      userId: req.user._id,
      action: 'DELETE_EXPENSE',
      entityType: 'Expense',
      entityId: expense._id,
      description: `Permanently deleted expense ${expense.expenseCode} of ₹${expense.amount}`,
      req
    });

    await syncMonthlyLedgers().catch(console.error);

    res.json({ success: true, message: 'Expense permanently deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
