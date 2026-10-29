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
    const { propertyId, category, startDate, endDate, month, search, headType } = req.query;
    let query = { isReversed: false };

    if (propertyId) query.propertyId = propertyId;
    if (category) query.category = category;
    if (headType) {
      query.headType = headType === 'Common' ? 'Other' : headType;
    }
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
        { expenseCode: { $regex: search, $options: 'i' } },
        { legacyCode: { $regex: search, $options: 'i' } },
      ];
    }

    const expenses = await Expense.find(query)
      .populate('propertyId')
      .populate('unitId')
      .sort({ expenseDate: -1 })
      .lean();

    const formattedExpenses = expenses.map(e => {
      const expMonth = e.expenseMonth || (e.expenseDate ? new Date(e.expenseDate).toISOString().slice(0, 7) : '');
      return {
        ...e,
        expenseMonth: expMonth,
        expenseMonthYear: expMonth
      };
    });

    const totalAmount = formattedExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);

    res.json({ success: true, count: formattedExpenses.length, totalAmount, data: formattedExpenses });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route GET /api/expenses/categories
router.get('/categories', protect, async (req, res) => {
  try {
    const { headType } = req.query;
    const filter = {};
    if (headType) {
      const normalized = headType === 'Common' ? 'Other' : headType;
      filter.$or = [{ headType: normalized }, { headType: headType }];
    }

    let categories = await ExpenseCategory.find(filter).sort({ headType: 1, name: 1 });

    // Auto-seed default heads if empty
    if (categories.length === 0 && !headType) {
      const defaultPropertyHeads = [
        'Maintenance', 'Electricity & Utilities', 'Repairs & Renovation', 
        'Sweeper & Cleaning', 'Water Charges', 'Property Rent Paid', 
        'Deposit Refund', 'Property Tax', 'Other expenses'
      ];
      const defaultOtherHeads = [
        'MOM', 'Margaret', 'Islamic & Zakat', 'Zakat', 'Sadka', 
        'Send to dubai', 'IT Fees', 'Donations', 'Miscellaneous', 
        'Miscellaneous exp', 'Micellaneous Expenses', 'Akbar', 
        'Loan asgar Bhati', 'Loan give to Gafoor', 'Other'
      ];

      for (const name of defaultPropertyHeads) {
        await ExpenseCategory.updateOne(
          { name },
          { $setOnInsert: { name, headType: 'Property', isDefault: true } },
          { upsert: true }
        );
      }
      for (const name of defaultOtherHeads) {
        await ExpenseCategory.updateOne(
          { name },
          { $setOnInsert: { name, headType: 'Other', isDefault: true } },
          { upsert: true }
        );
      }
      categories = await ExpenseCategory.find(filter).sort({ headType: 1, name: 1 });
    }

    res.json({ success: true, count: categories.length, data: categories });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route POST /api/expenses/categories
router.post('/categories', protect, authorize('admin', 'manager'), [
  body('name').trim().notEmpty().withMessage('Category name is required'),
  body('headType').optional().isIn(['Property', 'Other', 'Common']).withMessage('headType must be Property or Other')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  try {
    const name = req.body.name.trim();
    let headType = req.body.headType || 'Property';
    if (headType === 'Common') headType = 'Other';

    const existing = await ExpenseCategory.findOne({ name });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Category already exists' });
    }

    const cat = await ExpenseCategory.create({
      name,
      headType,
      description: req.body.description || ''
    });

    res.status(201).json({ success: true, data: cat });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route PUT /api/expenses/categories/:id
router.put('/categories/:id', protect, authorize('admin', 'manager'), [
  body('name').optional().trim().notEmpty().withMessage('Category name cannot be empty'),
  body('headType').optional().isIn(['Property', 'Other', 'Common']).withMessage('headType must be Property or Other')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  try {
    const { name, description } = req.body;
    let { headType } = req.body;
    if (headType === 'Common') headType = 'Other';

    const cat = await ExpenseCategory.findById(req.params.id);
    if (!cat) {
      return res.status(404).json({ success: false, message: 'Expense head not found' });
    }

    if (name && name !== cat.name) {
      const duplicate = await ExpenseCategory.findOne({ name: name.trim(), _id: { $ne: cat._id } });
      if (duplicate) {
        return res.status(400).json({ success: false, message: 'Another category with this name already exists' });
      }
      cat.name = name.trim();
    }
    if (headType) cat.headType = headType;
    if (description !== undefined) cat.description = description;

    await cat.save();
    res.json({ success: true, data: cat });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route DELETE /api/expenses/categories/:id
router.delete('/categories/:id', protect, authorize('admin', 'manager'), async (req, res) => {
  try {
    const cat = await ExpenseCategory.findById(req.params.id);
    if (!cat) {
      return res.status(404).json({ success: false, message: 'Expense head not found' });
    }

    // Check if currently used by any expense
    const inUseCount = await Expense.countDocuments({ category: cat.name, isReversed: false });
    if (inUseCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete '${cat.name}' because it is actively used in ${inUseCount} expense record(s).`
      });
    }

    await cat.deleteOne();
    res.json({ success: true, message: 'Expense head deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route POST /api/expenses
router.post('/', protect, authorize('admin', 'manager'), [
  body('category').trim().notEmpty().withMessage('Expense category is required'),
  body('amount').isNumeric().withMessage('Amount must be a number'),
  body('description').optional().trim()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  try {
    let { expenseDate, expenseMonth, headType, description, vendorOrPayee, paymentMode, ...rest } = req.body;

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

    // Resolve headType (Property or Other)
    let finalHeadType = headType;
    if (finalHeadType === 'Common') finalHeadType = 'Other';
    if (!finalHeadType) {
      if (rest.propertyId) {
        finalHeadType = 'Property';
      } else {
        const catDoc = await ExpenseCategory.findOne({ name: req.body.category?.trim() });
        finalHeadType = (catDoc && (catDoc.headType === 'Property')) ? 'Property' : 'Other';
      }
    }

    // Generate robust unique expenseCode
    const year = finalExpenseDate.getFullYear();
    const prefix = `EXP-${year}-`;
    const lastExp = await Expense.findOne({ expenseCode: { $regex: `^${prefix}\\d+$` } })
      .sort({ expenseCode: -1 })
      .collation({ locale: 'en_US', numericOrdering: true });

    let nextNum = 1;
    if (lastExp && lastExp.expenseCode) {
      const match = lastExp.expenseCode.match(/(\d+)$/);
      if (match) {
        nextNum = parseInt(match[1], 10) + 1;
      }
    }
    let expenseCode = `${prefix}${String(nextNum).padStart(5, '0')}`;
    while (await Expense.exists({ expenseCode })) {
      nextNum++;
      expenseCode = `${prefix}${String(nextNum).padStart(5, '0')}`;
    }

    const expense = await Expense.create({
      ...rest,
      headType: finalHeadType,
      expenseDate: finalExpenseDate,
      expenseMonth: finalExpenseMonth,
      expenseCode,
      amount: Number(req.body.amount),
      description: description ? description.trim() : '',
      recordedBy: req.user._id
    });

    await logAudit({
      userId: req.user._id,
      action: 'RECORD_EXPENSE',
      entityType: 'Expense',
      entityId: expense._id,
      description: `Recorded ${finalHeadType} expense ${expenseCode} of ₹${expense.amount} under ${expense.category} for month ${finalExpenseMonth}`,
      newState: expense.toObject(),
      req
    });

    await syncMonthlyLedgers().catch(console.error);

    const populatedExpense = await Expense.findById(expense._id)
      .populate('propertyId')
      .populate('unitId');

    res.status(201).json({ success: true, data: populatedExpense });
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
      description: `Reversed expense ${expense.expenseCode} of ₹${expense.amount}. Reason: ${expense.reversalReason}`,
      newState: expense.toObject(),
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
    const { expenseDate, expenseMonth, propertyId, unitId, headType, category, amount, description, expenseCode } = req.body;
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
    if (headType) {
      expense.headType = headType === 'Common' ? 'Other' : headType;
    } else if (propertyId !== undefined) {
      if (propertyId) expense.headType = 'Property';
      else if (!expense.headType) expense.headType = 'Other';
    }
    if (category) expense.category = category;
    if (amount !== undefined) expense.amount = Number(amount);
    if (description !== undefined) expense.description = description ? description.trim() : '';
    if (expenseCode && expenseCode.trim()) expense.expenseCode = expenseCode.trim();

    await expense.save();
    await syncMonthlyLedgers().catch(console.error);

    const updatedExpense = await Expense.findById(expense._id)
      .populate('propertyId')
      .populate('unitId');

    res.json({ success: true, message: 'Expense updated successfully', data: updatedExpense });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route DELETE /api/expenses/:id
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
