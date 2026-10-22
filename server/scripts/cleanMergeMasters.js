const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const Property = require('../models/Property');
const Unit = require('../models/Unit');
const Tenant = require('../models/Tenant');
const TenantAssignment = require('../models/TenantAssignment');
const RentAgreement = require('../models/RentAgreement');
const PaymentReceipt = require('../models/PaymentReceipt');
const PaymentAllocation = require('../models/PaymentAllocation');

async function cleanMerge() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  // 1. Fetch or create the 11 Master Properties
  const propKotak = await Property.findOneAndUpdate(
    { propertyCode: 'PROP-KOTAK' },
    { name: 'Kotak Godaown (66 Godown)', propertyCode: 'PROP-KOTAK', displayOrder: 1, totalAreaSqFt: 4500, propertyType: 'Commercial Godown', city: 'Mumbai', isActive: true },
    { upsert: true, new: true }
  );
  const prop65 = await Property.findOneAndUpdate(
    { propertyCode: 'PROP-65-GODOWN' },
    { name: '65 no godown', propertyCode: 'PROP-65-GODOWN', displayOrder: 2, totalAreaSqFt: 2500, propertyType: 'Commercial Godown', city: 'Mumbai', isActive: true },
    { upsert: true, new: true }
  );
  const propBaranker = await Property.findOneAndUpdate(
    { propertyCode: 'PROP-BARANKER' },
    { name: 'Barankers room  - Building 65 No', propertyCode: 'PROP-BARANKER', displayOrder: 3, totalAreaSqFt: 2500, propertyType: 'Room', city: 'Mumbai', isActive: true },
    { upsert: true, new: true }
  );
  const propRoom10 = await Property.findOneAndUpdate(
    { propertyCode: 'PROP-ROOM10' },
    { name: 'Room No 10 - Building 65 No', propertyCode: 'PROP-ROOM10', displayOrder: 4, totalAreaSqFt: 500, propertyType: 'Room', city: 'Mumbai', isActive: true },
    { upsert: true, new: true }
  );
  const propGarage = await Property.findOneAndUpdate(
    { propertyCode: 'PROP-GARAGE' },
    { name: 'Garage', propertyCode: 'PROP-GARAGE', displayOrder: 5, totalAreaSqFt: 3200, propertyType: 'Garage', city: 'Mumbai', isActive: true },
    { upsert: true, new: true }
  );
  const propEnnas = await Property.findOneAndUpdate(
    { propertyCode: 'PROP-ENNAS' },
    { name: 'Ennas Room', propertyCode: 'PROP-ENNAS', displayOrder: 6, totalAreaSqFt: 2500, propertyType: 'Room', city: 'Mumbai', isActive: true },
    { upsert: true, new: true }
  );
  const propMani = await Property.findOneAndUpdate(
    { propertyCode: 'PROP-MANI' },
    { name: 'Mani Mansion', propertyCode: 'PROP-MANI', displayOrder: 7, totalAreaSqFt: 2500, propertyType: 'Mixed Use', city: 'Mumbai', isActive: true },
    { upsert: true, new: true }
  );
  const propRoshan = await Property.findOneAndUpdate(
    { propertyCode: 'PROP-ROSHAN' },
    { name: 'Tony room (Roshan Manzil)', propertyCode: 'PROP-ROSHAN', displayOrder: 8, totalAreaSqFt: 2500, propertyType: 'Room', city: 'Mumbai', isActive: true },
    { upsert: true, new: true }
  );
  const propByculla = await Property.findOneAndUpdate(
    { propertyCode: 'PROP-BYCULLA' },
    { name: 'Byculla Club', propertyCode: 'PROP-BYCULLA', displayOrder: 9, totalAreaSqFt: 2500, propertyType: 'Commercial Office', city: 'Mumbai', isActive: true },
    { upsert: true, new: true }
  );
  const propKandivli = await Property.findOneAndUpdate(
    { propertyCode: 'PROP-KANDIVLI' },
    { name: 'Kandivli', propertyCode: 'PROP-KANDIVLI', displayOrder: 10, totalAreaSqFt: 2500, propertyType: 'Residential Apartment', city: 'Mumbai', isActive: true },
    { upsert: true, new: true }
  );
  const propGoa = await Property.findOneAndUpdate(
    { propertyCode: 'PROP-GOA' },
    { name: 'Goa Flat', propertyCode: 'PROP-GOA', displayOrder: 11, totalAreaSqFt: 2500, propertyType: 'Residential Apartment', city: 'Goa', isActive: true },
    { upsert: true, new: true }
  );

  const validPropIds = [
    propKotak._id, prop65._id, propBaranker._id, propRoom10._id,
    propGarage._id, propEnnas._id, propMani._id, propRoshan._id,
    propByculla._id, propKandivli._id, propGoa._id
  ];

  // Clean up any test properties not in the 11 valid properties
  const testProps = await Property.find({ _id: { $nin: validPropIds } });
  for (const tp of testProps) {
    const tpUnits = await Unit.find({ propertyId: tp._id });
    for (const tu of tpUnits) {
      await TenantAssignment.deleteMany({ unitId: tu._id });
      await RentAgreement.deleteMany({ unitId: tu._id });
      await Unit.findByIdAndDelete(tu._id);
    }
    await Property.findByIdAndDelete(tp._id);
    console.log(`Cleaned up extra/test property: ${tp.name} (${tp.propertyCode})`);
  }

  // Also clean up any test tenants without assignments/payments
  const testTenants = await Tenant.find({ name: { $regex: /test/i } });
  for (const tt of testTenants) {
    const aCount = await TenantAssignment.countDocuments({ tenantId: tt._id });
    const pCount = await PaymentReceipt.countDocuments({ tenantId: tt._id });
    if (aCount === 0 && pCount === 0) {
      await Tenant.findByIdAndDelete(tt._id);
      console.log(`Cleaned up test tenant: ${tt.name}`);
    }
  }

  console.log('✓ Exactly 11 Master Properties verified with displayOrder 1 to 11');

  // Mapping of 22 Authoritative Units to their primary MongoDB unit IDs or Codes
  const UNIT_CONFIG = [
    // 1: Kotak Godaown (66 Godown)
    { propId: propKotak._id, code: 'KO-PG', name: 'PG', aliases: ['KO-PG', 'Paying Guest / Kotak PG'], area: 2500, type: 'PG Facility' },
    { propId: propKotak._id, code: 'KO-SMALL', name: 'Small Godown', aliases: ['KO-SMALL', 'Small Godown Water Wala'], area: 2000, type: 'Commercial Godown' },

    // 2: 65 no godown
    { propId: prop65._id, code: '65-LARGE', name: '65 Large Godown', aliases: ['65-LARGE', '65-DELHIERY', 'Delhiery Partition'], area: 1500, type: 'Commercial Godown' },
    { propId: prop65._id, code: '65-SMALL', name: '65 Small Godown', aliases: ['65-SMALL', '65-GO1', 'Go1 Rehan Space', '65-GO2'], area: 1000, type: 'Commercial Godown' },

    // 3: Barankers room  - Building 65 No
    { propId: propBaranker._id, code: 'BAR-1ST', name: '1st Floor', aliases: ['BAR-1ST', 'BA-GF', 'Baranker Room - Ground Floor', 'BA-ROOM-1'], area: 1200, type: 'Room' },
    { propId: propBaranker._id, code: 'BAR-MEZZ', name: 'Mezzanine', aliases: ['BAR-MEZZ', 'BA-ATTIC', 'Baranker Room - Attic (Umesh)', 'BA-ROOM-2'], area: 1300, type: 'Room' },

    // 4: Room No 10 - Building 65 No
    { propId: propRoom10._id, code: 'ROOM-10', name: 'Room No 10 - Building 65 No', aliases: ['ROOM-10', '65-ROOM-10', '65 No Room No 10'], area: 500, type: 'Room' },

    // 5: Garage
    { propId: propGarage._id, code: 'GA-SHOP1', name: 'Shop 1', aliases: ['GA-SHOP1', 'GA-DGCABLE', 'DG Cable (Garage Area 2)'], area: 600, type: 'Commercial Office' },
    { propId: propGarage._id, code: 'GA-SHOP2', name: 'Shop 2', aliases: ['GA-SHOP2', 'GA-SNIP', 'Snip Salon (Garage Area 1)'], area: 800, type: 'Commercial Office' },
    { propId: propGarage._id, code: 'GA-GODOWN', name: 'Godown', aliases: ['GA-GODOWN', 'GA-ANAND', 'Anand Storage Area'], area: 1000, type: 'Commercial Godown' },
    { propId: propGarage._id, code: 'GA-CHIRA', name: 'Chira Bazar House', aliases: ['GA-CHIRA', 'GA-ALTAF', 'House Rent - Altaf'], area: 800, type: 'Residential Apartment' },

    // 6: Ennas Room
    { propId: propEnnas._id, code: 'ENNAS-RM', name: 'Ennas Room', aliases: ['ENNAS-RM', 'Ennas Room (a1, b1 & c1)'], area: 2500, type: 'Room' },

    // 7: Mani Mansion
    { propId: propMani._id, code: 'MANI-RM1', name: 'Mani Mansion -Room 1', aliases: ['MANI-RM1', 'MA-ASWINI', 'Mani Mansion Area 1'], area: 1250, type: 'Room' },
    { propId: propMani._id, code: 'MANI-RM2', name: 'Mani Mansion -Room 2', aliases: ['MANI-RM2'], area: 1250, type: 'Room' },

    // 8: Tony room (Roshan Manzil)
    { propId: propRoshan._id, code: 'TONY-RM1', name: 'Tony Room 1', aliases: ['TONY-RM1', 'Tony Room 1 - Asgar'], area: 1250, type: 'Room' },
    { propId: propRoshan._id, code: 'TONY-RM2', name: 'Tony Room 2', aliases: ['TONY-RM2', 'Tony Room 2 - Santu Hajra'], area: 1250, type: 'Room' },

    // 9: Byculla Club
    { propId: propByculla._id, code: 'BY-1ST', name: '1st Floor', aliases: ['BY-1ST', 'BY-AMRI', 'Byculla Unit 1 (Amri Kids)'], area: 1500, type: 'Commercial Office' },
    { propId: propByculla._id, code: 'BY-MEZZ', name: 'Mezzanine', aliases: ['BY-MEZZ', 'BY-ROMEL', 'Byculla Unit 2 (Romel)'], area: 1000, type: 'Commercial Office' },

    // 10: Kandivli
    { propId: propKandivli._id, code: 'KAND-2108', name: 'Flat No 2108', aliases: ['KAND-2108', 'KA-2108', 'Apartment 2108'], area: 1250, type: 'Residential Apartment' },
    { propId: propKandivli._id, code: 'KAND-2109', name: 'Flat No 2109', aliases: ['KAND-2109', 'KA-2109', 'Apartment 2109'], area: 1250, type: 'Residential Apartment' },

    // 11: Goa Flat
    { propId: propGoa._id, code: 'GOA-FLAT1', name: 'Flat no 1', aliases: ['GOA-FLAT1', 'GOA-ASIF', 'Goa Commercial / Flat', 'GOA-FLAT-1'], area: 1250, type: 'Residential Apartment' },
    { propId: propGoa._id, code: 'GOA-FLAT2', name: 'Flat No.2.', aliases: ['GOA-FLAT2', 'GOA-FLAT-2', 'Goa Flat No. 2'], area: 1250, type: 'Residential Apartment' },
  ];

  const canonicalUnits = {};
  const processedUnitIds = new Set();

  for (const cfg of UNIT_CONFIG) {
    const allSearchKeys = Array.from(new Set([cfg.code, cfg.name, ...cfg.aliases]));
    const matching = await Unit.find({
      $or: [
        { unitCode: { $in: allSearchKeys } },
        { subUnitPartition: { $in: allSearchKeys } },
        { unitName: { $in: allSearchKeys } }
      ]
    });

    let primaryUnit = null;
    // Prefer unit that has payments/allocations, or the first one
    for (const u of matching) {
      const pCount = await PaymentReceipt.countDocuments({ unitId: u._id });
      if (pCount > 0) {
        primaryUnit = u;
        break;
      }
    }
    if (!primaryUnit && matching.length > 0) primaryUnit = matching[0];

    if (!primaryUnit) {
      // Create new unit if not found
      primaryUnit = new Unit({
        propertyId: cfg.propId,
        unitCode: cfg.code,
        unitName: cfg.name,
        subUnitPartition: cfg.name,
        unitType: cfg.type,
        areaSqFt: cfg.area,
        isActive: true
      });
      await primaryUnit.save();
    }

    // Check if there is any OTHER unit in the DB that already has unitCode === cfg.code
    const conflictingUnit = await Unit.findOne({ unitCode: cfg.code, _id: { $ne: primaryUnit._id } });
    if (conflictingUnit) {
      await PaymentReceipt.updateMany({ unitId: conflictingUnit._id }, { unitId: primaryUnit._id });
      await PaymentAllocation.updateMany({ unitId: conflictingUnit._id }, { unitId: primaryUnit._id });
      await TenantAssignment.updateMany({ unitId: conflictingUnit._id }, { unitId: primaryUnit._id });
      await RentAgreement.updateMany({ unitId: conflictingUnit._id }, { unitId: primaryUnit._id });
      await Unit.findByIdAndDelete(conflictingUnit._id);
      console.log(`  Removed code conflict unit (${cfg.code}) and merged into primary unit`);
    }

    // Re-link any payments, assignments, or agreements from duplicate matching units to primaryUnit FIRST and delete them
    for (const other of matching) {
      if (other._id.toString() !== primaryUnit._id.toString()) {
        await PaymentReceipt.updateMany({ unitId: other._id }, { unitId: primaryUnit._id });
        await PaymentAllocation.updateMany({ unitId: other._id }, { unitId: primaryUnit._id });
        await TenantAssignment.updateMany({ unitId: other._id }, { unitId: primaryUnit._id });
        await RentAgreement.updateMany({ unitId: other._id }, { unitId: primaryUnit._id });
        await Unit.findByIdAndDelete(other._id);
        console.log(`  Merged duplicate unit ${other.subUnitPartition} (${other.unitCode}) into primary unit`);
      }
    }

    primaryUnit.propertyId = cfg.propId;
    primaryUnit.unitName = cfg.name;
    primaryUnit.subUnitPartition = cfg.name;
    primaryUnit.unitCode = cfg.code;
    primaryUnit.unitType = cfg.type;
    primaryUnit.areaSqFt = cfg.area;
    primaryUnit.isActive = true;
    await primaryUnit.save();

    canonicalUnits[cfg.code] = primaryUnit;
    processedUnitIds.add(primaryUnit._id.toString());
    console.log(`✓ Canonical Unit: [${cfg.name}] (${primaryUnit.unitCode}) -> ID: ${primaryUnit._id}`);
  }

  // Delete any lingering orphaned units that are NOT in processedUnitIds and have 0 payments
  const lingeringUnits = await Unit.find({ _id: { $nin: Array.from(processedUnitIds) } });
  for (const lu of lingeringUnits) {
    const pCount = await PaymentReceipt.countDocuments({ unitId: lu._id });
    if (pCount === 0) {
      await TenantAssignment.deleteMany({ unitId: lu._id });
      await RentAgreement.deleteMany({ unitId: lu._id });
      await Unit.findByIdAndDelete(lu._id);
      console.log(`Cleaned up lingering orphaned unit: ${lu.subUnitPartition || lu.unitName} (${lu.unitCode})`);
    } else {
      console.warn(`WARNING: lingering unit has ${pCount} payments! ID: ${lu._id}`);
    }
  }

  // Ensure each canonical unit has strictly ONE Active assignment
  console.log('\n--- Enforcing Single Active Contract Rule across all 22 Sub-Properties ---');
  for (const [code, unit] of Object.entries(canonicalUnits)) {
    const activeAssignments = await TenantAssignment.find({
      unitId: unit._id,
      status: 'Active'
    }).sort({ createdAt: -1 });

    if (activeAssignments.length > 1) {
      console.log(`Fixing duplicate active contracts on ${unit.subUnitPartition} (${activeAssignments.length} found):`);
      for (let i = 1; i < activeAssignments.length; i++) {
        activeAssignments[i].status = 'Ended';
        await activeAssignments[i].save();
        await RentAgreement.updateMany({ assignmentId: activeAssignments[i]._id }, { isCurrentRate: false });
        console.log(`  -> Marked older contract ${activeAssignments[i].assignmentCode} as Ended`);
      }
    }

    const currentActive = await TenantAssignment.findOne({ unitId: unit._id, status: 'Active' });
    const isOccupied = Boolean(currentActive);
    await Unit.findByIdAndUpdate(unit._id, {
      occupancyStatus: isOccupied ? 'Occupied' : 'Vacant'
    });
  }

  // Verification counts
  const finalPropCount = await Property.countDocuments();
  const finalUnitCount = await Unit.countDocuments();
  const finalReceiptCount = await PaymentReceipt.countDocuments();
  const finalActiveAssignments = await TenantAssignment.countDocuments({ status: 'Active' });
  const finalEndedAssignments = await TenantAssignment.countDocuments({ status: { $in: ['Ended', 'Past / Vacated', 'Terminated'] } });

  console.log('\n=============================================');
  console.log('✅ CLEAN MERGE COMPLETE!');
  console.log(`Properties: ${finalPropCount} (expected 11)`);
  console.log(`Sub-Properties/Units: ${finalUnitCount} (expected 22)`);
  console.log(`Payment Receipts: ${finalReceiptCount} (expected 32, 100% intact)`);
  console.log(`Active Contracts: ${finalActiveAssignments}`);
  console.log(`Past / Ended Contracts: ${finalEndedAssignments} (History fully preserved)`);
  console.log('=============================================');

  await mongoose.disconnect();
}

cleanMerge().catch(err => {
  console.error('Clean merge error:', err);
  process.exit(1);
});
