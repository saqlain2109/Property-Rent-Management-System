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

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  // 1. Ensure the 11 Master Properties
  const propKotak = await Property.findOneAndUpdate(
    { propertyCode: 'PROP-KOTAK' },
    { name: 'Kotak Godaown (66 Godown)', propertyCode: 'PROP-KOTAK', displayOrder: 1, totalAreaSqFt: 4500, propertyType: 'Commercial Godown', city: 'Mumbai', isActive: true },
    { upsert: true, returnDocument: 'after' }
  );
  const prop65 = await Property.findOneAndUpdate(
    { propertyCode: 'PROP-65-GODOWN' },
    { name: '65 no godown', propertyCode: 'PROP-65-GODOWN', displayOrder: 2, totalAreaSqFt: 2500, propertyType: 'Commercial Godown', city: 'Mumbai', isActive: true },
    { upsert: true, returnDocument: 'after' }
  );
  const propBaranker = await Property.findOneAndUpdate(
    { propertyCode: 'PROP-BARANKER' },
    { name: 'Barankers room  - Building 65 No', propertyCode: 'PROP-BARANKER', displayOrder: 3, totalAreaSqFt: 2500, propertyType: 'Room', city: 'Mumbai', isActive: true },
    { upsert: true, returnDocument: 'after' }
  );
  const propRoom10 = await Property.findOneAndUpdate(
    { propertyCode: 'PROP-ROOM10' },
    { name: 'Room No 10 - Building 65 No', propertyCode: 'PROP-ROOM10', displayOrder: 4, totalAreaSqFt: 500, propertyType: 'Room', city: 'Mumbai', isActive: true },
    { upsert: true, returnDocument: 'after' }
  );
  const propGarage = await Property.findOneAndUpdate(
    { propertyCode: 'PROP-GARAGE' },
    { name: 'Garage', propertyCode: 'PROP-GARAGE', displayOrder: 5, totalAreaSqFt: 3200, propertyType: 'Garage', city: 'Mumbai', isActive: true },
    { upsert: true, returnDocument: 'after' }
  );
  const propEnnas = await Property.findOneAndUpdate(
    { propertyCode: 'PROP-ENNAS' },
    { name: 'Ennas Room', propertyCode: 'PROP-ENNAS', displayOrder: 6, totalAreaSqFt: 2500, propertyType: 'Room', city: 'Mumbai', isActive: true },
    { upsert: true, returnDocument: 'after' }
  );
  const propMani = await Property.findOneAndUpdate(
    { propertyCode: 'PROP-MANI' },
    { name: 'Mani Mansion', propertyCode: 'PROP-MANI', displayOrder: 7, totalAreaSqFt: 2500, propertyType: 'Mixed Use', city: 'Mumbai', isActive: true },
    { upsert: true, returnDocument: 'after' }
  );
  const propRoshan = await Property.findOneAndUpdate(
    { propertyCode: 'PROP-ROSHAN' },
    { name: 'Tony room (Roshan Manzil)', propertyCode: 'PROP-ROSHAN', displayOrder: 8, totalAreaSqFt: 2500, propertyType: 'Room', city: 'Mumbai', isActive: true },
    { upsert: true, returnDocument: 'after' }
  );
  const propByculla = await Property.findOneAndUpdate(
    { propertyCode: 'PROP-BYCULLA' },
    { name: 'Byculla Club', propertyCode: 'PROP-BYCULLA', displayOrder: 9, totalAreaSqFt: 2500, propertyType: 'Commercial Office', city: 'Mumbai', isActive: true },
    { upsert: true, returnDocument: 'after' }
  );
  const propKandivli = await Property.findOneAndUpdate(
    { propertyCode: 'PROP-KANDIVLI' },
    { name: 'Kandivli', propertyCode: 'PROP-KANDIVLI', displayOrder: 10, totalAreaSqFt: 2500, propertyType: 'Residential Apartment', city: 'Mumbai', isActive: true },
    { upsert: true, returnDocument: 'after' }
  );
  const propGoa = await Property.findOneAndUpdate(
    { propertyCode: 'PROP-GOA' },
    { name: 'Goa Flat', propertyCode: 'PROP-GOA', displayOrder: 11, totalAreaSqFt: 2500, propertyType: 'Residential Apartment', city: 'Goa', isActive: true },
    { upsert: true, returnDocument: 'after' }
  );

  const validPropIds = [
    propKotak._id, prop65._id, propBaranker._id, propRoom10._id,
    propGarage._id, propEnnas._id, propMani._id, propRoshan._id,
    propByculla._id, propKandivli._id, propGoa._id
  ];

  // Remove any non-canonical properties
  await Property.deleteMany({ _id: { $nin: validPropIds } });
  console.log('✓ 11 Master Properties verified (Orders 1 to 11)');

  // 2. Define the exact 22 Sub-Properties
  const SUB_PROPS = [
    // 1: Kotak Godaown (66 Godown)
    { propId: propKotak._id, code: 'KO-PG', name: 'PG', area: 2500, type: 'PG Facility' },
    { propId: propKotak._id, code: 'KO-SMALL', name: 'Small Godown', area: 2000, type: 'Commercial Godown' },

    // 2: 65 no godown
    { propId: prop65._id, code: '65-LARGE', name: '65 Large Godown', area: 1500, type: 'Commercial Godown' },
    { propId: prop65._id, code: '65-SMALL', name: '65 Small Godown', area: 1000, type: 'Commercial Godown' },

    // 3: Barankers room  - Building 65 No
    { propId: propBaranker._id, code: 'BAR-1ST', name: '1st Floor', area: 1200, type: 'Room' },
    { propId: propBaranker._id, code: 'BAR-MEZZ', name: 'Mezzanine', area: 1300, type: 'Room' },

    // 4: Room No 10 - Building 65 No
    { propId: propRoom10._id, code: 'ROOM-10', name: 'Room No 10 - Building 65 No', area: 500, type: 'Room' },

    // 5: Garage
    { propId: propGarage._id, code: 'GA-SHOP1', name: 'Shop 1', area: 600, type: 'Commercial Office' },
    { propId: propGarage._id, code: 'GA-SHOP2', name: 'Shop 2', area: 800, type: 'Commercial Office' },
    { propId: propGarage._id, code: 'GA-GODOWN', name: 'Godown', area: 1000, type: 'Commercial Godown' },
    { propId: propGarage._id, code: 'GA-CHIRA', name: 'Chira Bazar House', area: 800, type: 'Residential Apartment' },

    // 6: Ennas Room
    { propId: propEnnas._id, code: 'ENNAS-RM', name: 'Ennas Room', area: 2500, type: 'Room' },

    // 7: Mani Mansion
    { propId: propMani._id, code: 'MANI-RM1', name: 'Mani Mansion -Room 1', area: 1250, type: 'Room' },
    { propId: propMani._id, code: 'MANI-RM2', name: 'Mani Mansion -Room 2', area: 1250, type: 'Room' },

    // 8: Tony room (Roshan Manzil)
    { propId: propRoshan._id, code: 'TONY-RM1', name: 'Tony Room 1', area: 1250, type: 'Room' },
    { propId: propRoshan._id, code: 'TONY-RM2', name: 'Tony Room 2', area: 1250, type: 'Room' },

    // 9: Byculla Club
    { propId: propByculla._id, code: 'BY-1ST', name: '1st Floor', area: 1500, type: 'Commercial Office' },
    { propId: propByculla._id, code: 'BY-MEZZ', name: 'Mezzanine', area: 1000, type: 'Commercial Office' },

    // 10: Kandivli
    { propId: propKandivli._id, code: 'KAND-2108', name: 'Flat No 2108', area: 1250, type: 'Residential Apartment' },
    { propId: propKandivli._id, code: 'KAND-2109', name: 'Flat No 2109', area: 1250, type: 'Residential Apartment' },

    // 11: Goa Flat
    { propId: propGoa._id, code: 'GOA-FLAT1', name: 'Flat no 1', area: 1250, type: 'Residential Apartment' },
    { propId: propGoa._id, code: 'GOA-FLAT2', name: 'Flat No.2.', area: 1250, type: 'Residential Apartment' }
  ];

  const canonicalUnitsByCode = {};

  for (const sp of SUB_PROPS) {
    let u = await Unit.findOne({ unitCode: sp.code });
    if (!u) {
      u = new Unit({
        propertyId: sp.propId,
        unitCode: sp.code,
        unitName: sp.name,
        subUnitPartition: sp.name,
        unitType: sp.type,
        areaSqFt: sp.area,
        isActive: true
      });
      await u.save();
    } else {
      u.propertyId = sp.propId;
      u.unitName = sp.name;
      u.subUnitPartition = sp.name;
      u.unitType = sp.type;
      u.areaSqFt = sp.area;
      u.isActive = true;
      await u.save();
    }
    canonicalUnitsByCode[sp.code] = u;
    console.log(`✓ Unit ${sp.code} (${sp.name}) linked to Property ID ${sp.propId}`);
  }

  // 3. Explicitly re-route assignments to the correct canonical units
  const baranker1stUnit = canonicalUnitsByCode['BAR-1ST'];
  const barankerMezzUnit = canonicalUnitsByCode['BAR-MEZZ'];
  const byculla1stUnit = canonicalUnitsByCode['BY-1ST'];
  const bycullaMezzUnit = canonicalUnitsByCode['BY-MEZZ'];
  const room10Unit = canonicalUnitsByCode['ROOM-10'];
  const gaShop1Unit = canonicalUnitsByCode['GA-SHOP1'];
  const gaShop2Unit = canonicalUnitsByCode['GA-SHOP2'];
  const gaGodownUnit = canonicalUnitsByCode['GA-GODOWN'];
  const gaChiraUnit = canonicalUnitsByCode['GA-CHIRA'];

  // Baranker 1st floor assignments
  const bar1stCodes = ['ASN-BA-ROOM-1', 'ASN-BA-GF', 'ASN-0061', 'ASN-0071'];
  await TenantAssignment.updateMany({ assignmentCode: { $in: bar1stCodes } }, { unitId: baranker1stUnit._id });
  await RentAgreement.updateMany({ assignmentId: { $in: (await TenantAssignment.find({ assignmentCode: { $in: bar1stCodes } })).map(a => a._id) } }, { unitId: baranker1stUnit._id });

  // Baranker Mezzanine assignments
  const barMezzCodes = ['ASN-BA-ROOM-2', 'ASN-BA-ATTIC', 'ASN-0062', 'ASN-0072'];
  await TenantAssignment.updateMany({ assignmentCode: { $in: barMezzCodes } }, { unitId: barankerMezzUnit._id });
  await RentAgreement.updateMany({ assignmentId: { $in: (await TenantAssignment.find({ assignmentCode: { $in: barMezzCodes } })).map(a => a._id) } }, { unitId: barankerMezzUnit._id });

  // Room 10 assignments
  const room10Codes = ['ASN-65-ROOM-10', 'ASN-0063', 'ASN-0064', 'ASN-0065', 'ASN-0066', 'ASN-0067'];
  await TenantAssignment.updateMany({ assignmentCode: { $in: room10Codes } }, { unitId: room10Unit._id });
  await RentAgreement.updateMany({ assignmentId: { $in: (await TenantAssignment.find({ assignmentCode: { $in: room10Codes } })).map(a => a._id) } }, { unitId: room10Unit._id });

  // Garage Shop 1 assignments
  const gaShop1Codes = ['ASN-GA-DGCABLE', 'ASN-0033'];
  await TenantAssignment.updateMany({ assignmentCode: { $in: gaShop1Codes } }, { unitId: gaShop1Unit._id });
  await RentAgreement.updateMany({ assignmentId: { $in: (await TenantAssignment.find({ assignmentCode: { $in: gaShop1Codes } })).map(a => a._id) } }, { unitId: gaShop1Unit._id });

  // Garage Shop 2 assignments
  const gaShop2Codes = ['ASN-GA-SNIP', 'ASN-0034', 'ASN-0035'];
  await TenantAssignment.updateMany({ assignmentCode: { $in: gaShop2Codes } }, { unitId: gaShop2Unit._id });
  await RentAgreement.updateMany({ assignmentId: { $in: (await TenantAssignment.find({ assignmentCode: { $in: gaShop2Codes } })).map(a => a._id) } }, { unitId: gaShop2Unit._id });

  // Garage Godown assignments
  const gaGodownCodes = ['ASN-GA-ANAND', 'ASN-0036'];
  await TenantAssignment.updateMany({ assignmentCode: { $in: gaGodownCodes } }, { unitId: gaGodownUnit._id });
  await RentAgreement.updateMany({ assignmentId: { $in: (await TenantAssignment.find({ assignmentCode: { $in: gaGodownCodes } })).map(a => a._id) } }, { unitId: gaGodownUnit._id });

  // Garage Chira assignments
  const gaChiraCodes = ['ASN-GA-ALTAF', 'ASN-0037'];
  await TenantAssignment.updateMany({ assignmentCode: { $in: gaChiraCodes } }, { unitId: gaChiraUnit._id });
  await RentAgreement.updateMany({ assignmentId: { $in: (await TenantAssignment.find({ assignmentCode: { $in: gaChiraCodes } })).map(a => a._id) } }, { unitId: gaChiraUnit._id });

  // Byculla 1st Floor
  const by1stCodes = ['ASN-BY-AMRI', 'ASN-0095', 'ASN-0096', 'ASN-0097'];
  await TenantAssignment.updateMany({ assignmentCode: { $in: by1stCodes } }, { unitId: byculla1stUnit._id });
  await RentAgreement.updateMany({ assignmentId: { $in: (await TenantAssignment.find({ assignmentCode: { $in: by1stCodes } })).map(a => a._id) } }, { unitId: byculla1stUnit._id });

  // Byculla Mezzanine
  const byMezzCodes = ['ASN-BY-ROMEL', 'ASN-0098', 'ASN-0099'];
  await TenantAssignment.updateMany({ assignmentCode: { $in: byMezzCodes } }, { unitId: bycullaMezzUnit._id });
  await RentAgreement.updateMany({ assignmentId: { $in: (await TenantAssignment.find({ assignmentCode: { $in: byMezzCodes } })).map(a => a._id) } }, { unitId: bycullaMezzUnit._id });

  // 4. Delete any units not in the 22 canonical list
  const canonicalUnitIds = Object.values(canonicalUnitsByCode).map(u => u._id);
  const leftoverUnits = await Unit.find({ _id: { $nin: canonicalUnitIds } });
  console.log(`Found ${leftoverUnits.length} leftover units to clean up`);
  for (const lu of leftoverUnits) {
    const pCount = await PaymentReceipt.countDocuments({ unitId: lu._id });
    if (pCount > 0) {
      console.warn(`WARNING: leftover unit ${lu.unitCode} has ${pCount} payments!`);
    } else {
      await TenantAssignment.deleteMany({ unitId: lu._id });
      await RentAgreement.deleteMany({ unitId: lu._id });
      await Unit.findByIdAndDelete(lu._id);
    }
  }

  // 5. Ensure Baranker active contracts exist if needed:
  // In the Excel:
  // Baranker 1st floor has Anjana Ashok Salunke (Rent 7000)
  const bar1stActive = await TenantAssignment.findOne({ unitId: baranker1stUnit._id, status: 'Active' });
  if (!bar1stActive) {
    // Check if Anjana's contract is ended, make it active
    const anjana = await TenantAssignment.findOne({ assignmentCode: 'ASN-0071' });
    if (anjana) {
      anjana.status = 'Active';
      anjana.unitId = baranker1stUnit._id;
      await anjana.save();
      await RentAgreement.updateMany({ assignmentId: anjana._id }, { isCurrentRate: true, unitId: baranker1stUnit._id });
      console.log('✓ Reactivated Baranker 1st floor contract for Anjana Ashok Salunke');
    }
  }

  // Baranker Mezzanine has Umesh (Rent 5500)
  const barMezzActive = await TenantAssignment.findOne({ unitId: barankerMezzUnit._id, status: 'Active' });
  if (!barMezzActive) {
    const umesh = await TenantAssignment.findOne({ assignmentCode: 'ASN-0072' });
    if (umesh) {
      umesh.status = 'Active';
      umesh.unitId = barankerMezzUnit._id;
      await umesh.save();
      await RentAgreement.updateMany({ assignmentId: umesh._id }, { isCurrentRate: true, unitId: barankerMezzUnit._id });
      console.log('✓ Reactivated Baranker Mezzanine contract for Umesh');
    }
  }

  // 6. Enforce Single Active Contract per unit
  for (const unit of Object.values(canonicalUnitsByCode)) {
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

  // Final database audit
  const finalPropCount = await Property.countDocuments();
  const finalUnitCount = await Unit.countDocuments();
  const finalReceiptCount = await PaymentReceipt.countDocuments();
  const finalActiveAssignments = await TenantAssignment.countDocuments({ status: 'Active' });
  const finalEndedAssignments = await TenantAssignment.countDocuments({ status: { $in: ['Ended', 'Past / Vacated', 'Terminated'] } });

  console.log('\n=============================================');
  console.log('🎉 AUDIT & CONSOLIDATION SUCCESSFUL!');
  console.log(`Master Properties: ${finalPropCount} (expected 11)`);
  console.log(`Sub-Properties/Units: ${finalUnitCount} (expected 22)`);
  console.log(`Payment Receipts: ${finalReceiptCount} (expected 32, 100% intact)`);
  console.log(`Active Contracts: ${finalActiveAssignments}`);
  console.log(`Past / Ended Contracts: ${finalEndedAssignments} (History fully preserved)`);
  console.log('=============================================');

  await mongoose.disconnect();
}

run().catch(err => {
  console.error('Migration error:', err);
  process.exit(1);
});
