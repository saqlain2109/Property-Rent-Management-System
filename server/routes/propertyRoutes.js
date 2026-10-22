const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const Property = require('../models/Property');
const Unit = require('../models/Unit');
const { protect, authorize } = require('../middleware/auth');
const logAudit = require('../utils/audit');

// Helper to ensure clean, contiguous display orders (1, 2, 3...) without gaps or duplicates
async function normalizePropertyOrders() {
  const orderedProps = await Property.find({ displayOrder: { $gt: 0 } }).sort({ displayOrder: 1, updatedAt: -1 });
  for (let i = 0; i < orderedProps.length; i++) {
    if (orderedProps[i].displayOrder !== i + 1) {
      orderedProps[i].displayOrder = i + 1;
      await orderedProps[i].save();
    }
  }
}

// @route GET /api/properties
router.get('/', protect, async (req, res) => {
  try {
    const { search, propertyType, status } = req.query;
    let query = {};

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { propertyCode: { $regex: search, $options: 'i' } },
        { address: { $regex: search, $options: 'i' } },
      ];
    }
    if (propertyType) {
      query.propertyType = propertyType;
    }
    if (status !== undefined && status !== '') {
      query.isActive = status === 'true';
    }

    const properties = await Property.find(query);
    
    // Attach unit count
    const propertyIds = properties.map(p => p._id);
    const units = await Unit.find({ propertyId: { $in: propertyIds } });
    
    const propertiesWithCount = properties.map(p => {
      const pUnits = units.filter(u => u.propertyId.toString() === p._id.toString());
      return {
        ...p.toObject(),
        unitCount: pUnits.length,
        occupiedUnits: pUnits.filter(u => u.occupancyStatus === 'Occupied').length
      };
    });

    // Custom order sort: 1, 2, 3... followed by unassigned/0 at the end
    propertiesWithCount.sort((a, b) => {
      const orderA = (a.displayOrder && a.displayOrder > 0) ? a.displayOrder : 99999;
      const orderB = (b.displayOrder && b.displayOrder > 0) ? b.displayOrder : 99999;
      if (orderA !== orderB) return orderA - orderB;
      return (a.name || '').localeCompare(b.name || '');
    });

    res.json({ success: true, count: propertiesWithCount.length, data: propertiesWithCount });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Helper to ensure clean, contiguous display orders (1, 2, 3...) without gaps or duplicates
async function normalizePropertyOrders() {
  const orderedProps = await Property.find({ displayOrder: { $gt: 0 } }).sort({ displayOrder: 1, updatedAt: -1 });
  for (let i = 0; i < orderedProps.length; i++) {
    if (orderedProps[i].displayOrder !== i + 1) {
      orderedProps[i].displayOrder = i + 1;
      await orderedProps[i].save();
    }
  }
}

// @route GET /api/properties/:id
router.get('/:id', protect, async (req, res) => {
  try {
    const property = await Property.findById(req.params.id);
    if (!property) {
      return res.status(404).json({ success: false, message: 'Property not found' });
    }
    const units = await Unit.find({ propertyId: property._id });
    res.json({ success: true, data: { ...property.toObject(), units } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route POST /api/properties
router.post('/', protect, authorize('admin', 'manager'), [
  body('name').trim().notEmpty().withMessage('Property name is required')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  try {
    let finalCode = req.body.propertyCode?.trim()?.toUpperCase();
    if (!finalCode) {
      const cleanName = req.body.name.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 6);
      const count = await Property.countDocuments();
      finalCode = `PROP-${cleanName || 'SITE'}-${String(count + 1).padStart(2, '0')}`;
    }

    const existing = await Property.findOne({ propertyCode: finalCode });
    if (existing) {
      const rand = Math.floor(100 + Math.random() * 900);
      finalCode = `${finalCode}-${rand}`;
    }

    if (req.body.displayOrder) {
      const newOrder = Number(req.body.displayOrder) || 0;
      if (newOrder > 0) {
        await Property.updateMany(
          { displayOrder: { $gte: newOrder } },
          { $inc: { displayOrder: 1 } }
        );
      }
    }

    const property = await Property.create({
      ...req.body,
      propertyCode: finalCode
    });

    await normalizePropertyOrders();

    await logAudit({
      userId: req.user._id,
      action: 'CREATE',
      entityType: 'Property',
      entityId: property._id,
      description: `Created property ${property.name} (${property.propertyCode})`,
      newState: property.toObject(),
      req
    });

    let createdUnit = null;
    if (req.body.createSingleUnit) {
      const Unit = require('../models/Unit');
      const uCount = await Unit.countDocuments();
      const unitCode = `UNIT-${String(uCount + 1).padStart(4, '0')}`;
      const unitName = req.body.unitName || `${property.name} - Unit`;
      const subUnitPartition = req.body.subUnitPartition || unitName;

      createdUnit = await Unit.create({
        unitCode,
        propertyId: property._id,
        unitName,
        subUnitPartition,
        areaSqFt: Number(req.body.unitAreaSqFt) || Number(property.totalAreaSqFt) || 0,
        floor: req.body.floor || 'Ground',
        monthlyRentExpected: Number(req.body.monthlyRentExpected) || 0,
        unitType: req.body.unitType || property.propertyType,
        occupancyStatus: 'Vacant',
        notes: req.body.unitNotes || 'Primary unit for individual property'
      });

      await logAudit({
        userId: req.user._id,
        action: 'CREATE',
        entityType: 'Unit',
        entityId: createdUnit._id,
        description: `Auto-created unit ${createdUnit.unitName} for single-unit property ${property.name}`,
        newState: createdUnit.toObject(),
        req
      });
    }

    res.status(201).json({ success: true, data: property, createdUnit });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route PUT /api/properties/:id
router.put('/:id', protect, authorize('admin', 'manager'), async (req, res) => {
  try {
    const property = await Property.findById(req.params.id);
    if (!property) {
      return res.status(404).json({ success: false, message: 'Property not found' });
    }

    const prev = property.toObject();
    
    // Smart rank reordering (handles moving up, moving down, and new insertions)
    if (req.body.displayOrder !== undefined) {
      const newOrder = Number(req.body.displayOrder) || 0;
      const oldOrder = property.displayOrder || 0;
      if (newOrder > 0 && oldOrder > 0 && newOrder !== oldOrder) {
        if (newOrder < oldOrder) {
          // Moved up (e.g. 5 -> 2): shift range [newOrder, oldOrder - 1] by +1
          await Property.updateMany(
            { displayOrder: { $gte: newOrder, $lt: oldOrder }, _id: { $ne: property._id } },
            { $inc: { displayOrder: 1 } }
          );
        } else {
          // Moved down (e.g. 2 -> 5): shift range [oldOrder + 1, newOrder] by -1
          await Property.updateMany(
            { displayOrder: { $gt: oldOrder, $lte: newOrder }, _id: { $ne: property._id } },
            { $inc: { displayOrder: -1 } }
          );
        }
      } else if (newOrder > 0 && oldOrder === 0) {
        // Inserted with order: shift everything >= newOrder by +1
        await Property.updateMany(
          { displayOrder: { $gte: newOrder }, _id: { $ne: property._id } },
          { $inc: { displayOrder: 1 } }
        );
      }
      property.displayOrder = newOrder;
    }

    Object.assign(property, req.body);
    if (req.body.propertyCode) {
      property.propertyCode = req.body.propertyCode.toUpperCase();
    }
    await property.save();

    // Re-normalize all positive display orders to keep them clean: 1, 2, 3...
    await normalizePropertyOrders();

    await logAudit({
      userId: req.user._id,
      action: 'UPDATE',
      entityType: 'Property',
      entityId: property._id,
      description: `Updated property ${property.name} (${property.propertyCode})`,
      previousState: prev,
      newState: property.toObject(),
      req
    });

    res.json({ success: true, data: property });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route DELETE /api/properties/:id
router.delete('/:id', protect, authorize('admin'), async (req, res) => {
  try {
    const property = await Property.findById(req.params.id);
    if (!property) {
      return res.status(404).json({ success: false, message: 'Property not found' });
    }

    // Check for existing units
    const unitCount = await Unit.countDocuments({ propertyId: property._id });
    if (unitCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete property with ${unitCount} associated units. Reassign or delete units first.`
      });
    }

    await Property.findByIdAndDelete(req.params.id);

    await logAudit({
      userId: req.user._id,
      action: 'DELETE',
      entityType: 'Property',
      entityId: req.params.id,
      description: `Deleted property ${property.name}`,
      previousState: property.toObject(),
      req
    });

    res.json({ success: true, message: 'Property deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
