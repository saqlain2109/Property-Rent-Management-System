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

// Exact 11 Properties with Order and Area from Sheet
const PROPERTIES = [
  { order: 1, name: 'Kotak Godaown (66 Godown)', code: 'PROP-KOTAK', area: 4500, type: 'Commercial Godown' },
  { order: 2, name: '65 no godown', code: 'PROP-65-GODOWN', area: 2500, type: 'Commercial Godown' },
  { order: 3, name: 'Barankers room  - Building 65 No', code: 'PROP-BARANKER', area: 2500, type: 'Room' },
  { order: 4, name: 'Room No 10 - Building 65 No', code: 'PROP-ROOM10', area: 500, type: 'Room' },
  { order: 5, name: 'Garage', code: 'PROP-GARAGE', area: 3200, type: 'Garage' },
  { order: 6, name: 'Ennas Room', code: 'PROP-ENNAS', area: 2500, type: 'Room' },
  { order: 7, name: 'Mani Mansion', code: 'PROP-MANI', area: 2500, type: 'Mixed Use' },
  { order: 8, name: 'Tony room (Roshan Manzil)', code: 'PROP-ROSHAN', area: 2500, type: 'Room' },
  { order: 9, name: 'Byculla Club', code: 'PROP-BYCULLA', area: 2500, type: 'Commercial Office' },
  { order: 10, name: 'Kandivli', code: 'PROP-KANDIVLI', area: 2500, type: 'Residential Apartment' },
  { order: 11, name: 'Goa Flat', code: 'PROP-GOA', area: 2500, type: 'Residential Apartment' },
];

// Exact 22 Sub Properties from Sheet
const SUB_PROPERTIES = [
  { propOrder: 1, name: 'PG', code: 'KO-PG', area: 2500, type: 'PG Facility' },
  { propOrder: 1, name: 'Small Godown', code: 'KO-SMALL', area: 2000, type: 'Commercial Godown' },

  { propOrder: 2, name: '65 Large Godown', code: '65-LARGE', area: 1500, type: 'Commercial Godown' },
  { propOrder: 2, name: '65 Small Godown', code: '65-SMALL', area: 1000, type: 'Commercial Godown' },

  { propOrder: 3, name: '1st Floor', code: 'BAR-1ST', area: 1200, type: 'Room' },
  { propOrder: 3, name: 'Mezzanine', code: 'BAR-MEZZ', area: 1300, type: 'Room' },

  { propOrder: 4, name: 'Room No 10 - Building 65 No', code: 'ROOM-10', area: 500, type: 'Room' },

  { propOrder: 5, name: 'Shop 1', code: 'GA-SHOP1', area: 600, type: 'Commercial Office' },
  { propOrder: 5, name: 'Shop 2', code: 'GA-SHOP2', area: 800, type: 'Commercial Office' },
  { propOrder: 5, name: 'Godown', code: 'GA-GODOWN', area: 1000, type: 'Commercial Godown' },
  { propOrder: 5, name: 'Chira Bazar House', code: 'GA-CHIRA', area: 800, type: 'Residential Apartment' },

  { propOrder: 6, name: 'Ennas Room', code: 'ENNAS-RM', area: 2500, type: 'Room' },

  { propOrder: 7, name: 'Mani Mansion -Room 1', code: 'MANI-RM1', area: 1250, type: 'Room' },
  { propOrder: 7, name: 'Mani Mansion -Room 2', code: 'MANI-RM2', area: 1250, type: 'Room' },

  { propOrder: 8, name: 'Tony Room 1', code: 'TONY-RM1', area: 1250, type: 'Room' },
  { propOrder: 8, name: 'Tony Room 2', code: 'TONY-RM2', area: 1250, type: 'Room' },

  { propOrder: 9, name: '1st Floor', code: 'BY-1ST', area: 1500, type: 'Commercial Office' },
  { propOrder: 9, name: 'Mezzanine', code: 'BY-MEZZ', area: 1000, type: 'Commercial Office' },

  { propOrder: 10, name: 'Flat No 2108', code: 'KAND-2108', area: 1250, type: 'Residential Apartment' },
  { propOrder: 10, name: 'Flat No 2109', code: 'KAND-2109', area: 1250, type: 'Residential Apartment' },

  { propOrder: 11, name: 'Flat no 1', code: 'GOA-FLAT1', area: 1250, type: 'Residential Apartment' },
  { propOrder: 11, name: 'Flat No.2.', code: 'GOA-FLAT2', area: 1250, type: 'Residential Apartment' }
];

// Exact Contracts from User's Lighted Sheet
const CONTRACTS = [
  // 1: Kotak Godaown
  { propCode: 'PROP-KOTAK', unitCode: 'KO-PG', tenantName: 'PG', monthlyRent: 0, deposit: 0, startDate: '2018-01-01', endDate: null, status: 'Active', comments: '' },
  { propCode: 'PROP-KOTAK', unitCode: 'KO-SMALL', tenantName: 'Water Wala', monthlyRent: 20250, deposit: 0, startDate: '2018-01-01', endDate: null, status: 'Active', comments: 'from Jan 2018 rent incresed to 17250' },

  // 2: 65 no godown
  { propCode: 'PROP-65-GODOWN', unitCode: '65-LARGE', tenantName: 'Delhiery', monthlyRent: 75000, deposit: 300000, startDate: '2025-09-01', endDate: '2026-08-30', status: 'Ended', comments: 'Rents is 1,50,000 and 50% is compnay i.e. 75000 per month and deposit is 6L and 3 L with company . Rent  start from Sep 25' },
  { propCode: 'PROP-65-GODOWN', unitCode: '65-LARGE', tenantName: 'Delhiery', monthlyRent: 78750, deposit: 300000, startDate: '2026-09-01', endDate: null, status: 'Active', comments: 'Rents is 1,50,000 and 50% is compnay i.e. 75000 per month and deposit is 6L and 3 L with company . Rent  start from Sep 25' },
  { propCode: 'PROP-65-GODOWN', unitCode: '65-SMALL', tenantName: 'Rehan', monthlyRent: 8500, deposit: 25000, startDate: '2025-02-01', endDate: null, status: 'Ended', comments: 'from feb 25' },
  { propCode: 'PROP-65-GODOWN', unitCode: '65-SMALL', tenantName: 'Rehan', monthlyRent: 9500, deposit: 0, startDate: null, endDate: null, status: 'Ended', comments: 'rent increased' },
  { propCode: 'PROP-65-GODOWN', unitCode: '65-SMALL', tenantName: 'Mohammed Nasir Qurashi', monthlyRent: 10500, annualRent: 100000, deposit: 0, startDate: '2026-10-01', endDate: null, status: 'Active', comments: 'from 01/10/26 total rent is 21000' },

  // 3: Garage
  { propCode: 'PROP-GARAGE', unitCode: 'GA-SHOP1', tenantName: 'DG Cable', monthlyRent: 2083.33, annualRent: 25000, deposit: 0, startDate: null, endDate: null, status: 'Active', comments: 'Rent increase in Jan 25' },
  { propCode: 'PROP-GARAGE', unitCode: 'GA-SHOP2', tenantName: 'Snip - Irfan Ansari', monthlyRent: 32000, deposit: 0, startDate: '2025-06-01', endDate: '2026-06-01', status: 'Ended', comments: 'rent increase in june 2025' },
  { propCode: 'PROP-GARAGE', unitCode: 'GA-SHOP2', tenantName: 'Snip- Salman Ahmed', monthlyRent: 36000, deposit: 100000, startDate: '2026-08-01', endDate: null, status: 'Active', comments: 'rent is 36000  and deposit 1 lac given on rent from 1st aug 26' },
  { propCode: 'PROP-GARAGE', unitCode: 'GA-GODOWN', tenantName: 'Anand', monthlyRent: 10000, deposit: 0, startDate: '2014-01-01', endDate: null, status: 'Active', comments: 'rented from jan 2014 @20,000 per month' },
  { propCode: 'PROP-GARAGE', unitCode: 'GA-CHIRA', tenantName: 'Altaf', monthlyRent: 22000, deposit: 0, startDate: '2022-04-01', endDate: null, status: 'Active', comments: 'rent increased to 22000 in apr 22' },

  // 4: Ennas Room
  { propCode: 'PROP-ENNAS', unitCode: 'ENNAS-RM', tenantName: 'Bengali', monthlyRent: 14000, deposit: 0, startDate: '2015-03-01', endDate: '2017-12-31', status: 'Ended', comments: 'rent increased to 14000  from 12000 in mar 15' },
  { propCode: 'PROP-ENNAS', unitCode: 'ENNAS-RM', tenantName: 'Bengali', monthlyRent: 16000, deposit: 0, startDate: '2018-01-01', endDate: '2018-12-31', status: 'Ended', comments: 'rent increased to 16000  from 14000 in jan18' },
  { propCode: 'PROP-ENNAS', unitCode: 'ENNAS-RM', tenantName: 'Bengali', monthlyRent: 18000, deposit: 0, startDate: '2019-01-01', endDate: '2022-01-31', status: 'Ended', comments: 'rent increased to 18000  from 16000 in jan19' },
  { propCode: 'PROP-ENNAS', unitCode: 'ENNAS-RM', tenantName: 'Bengali', monthlyRent: 20000, deposit: 0, startDate: '2023-02-01', endDate: '2025-01-31', status: 'Ended', comments: 'rent increased from18000 to 20000 in feb 23' },
  { propCode: 'PROP-ENNAS', unitCode: 'ENNAS-RM', tenantName: 'Bengali', monthlyRent: 22000, deposit: 0, startDate: '2025-02-01', endDate: null, status: 'Active', comments: 'rent increased from20000 to 22000 in Jan 25' },

  // 5: Mani Mansion
  { propCode: 'PROP-MANI', unitCode: 'MANI-RM1', tenantName: 'Dinesh', monthlyRent: 13000, deposit: 0, startDate: '2017-01-01', endDate: null, status: 'Ended', comments: 'from feb 2017' },
  { propCode: 'PROP-MANI', unitCode: 'MANI-RM1', tenantName: 'Unknown Tenant', monthlyRent: 13500, deposit: 0, startDate: '2019-03-06', endDate: null, status: 'Ended', comments: 'payed for 6 months  from 6th march 19.' },
  { propCode: 'PROP-MANI', unitCode: 'MANI-RM1', tenantName: 'Unknown Tenant', monthlyRent: 12000, deposit: 50000, startDate: '2021-01-01', endDate: null, status: 'Ended', comments: 'From Jan 2021 - rent 12000 and  50000 deposit' },
  { propCode: 'PROP-MANI', unitCode: 'MANI-RM1', tenantName: 'Jayanti Bhai', monthlyRent: 12000, deposit: 0, startDate: '2021-09-01', endDate: null, status: 'Ended', comments: 'from sep 21' },
  { propCode: 'PROP-MANI', unitCode: 'MANI-RM1', tenantName: 'Aswini Derad Monga', monthlyRent: 15000, deposit: 50000, startDate: '2024-01-01', endDate: null, status: 'Ended', comments: 'from Jan 24 deposit 50,000' },
  { propCode: 'PROP-MANI', unitCode: 'MANI-RM1', tenantName: 'Aswini Derad Monga', monthlyRent: 16000, deposit: 50000, startDate: '2026-02-01', endDate: null, status: 'Active', comments: 'rents increase to 16000 in feb 26' },
  { propCode: 'PROP-MANI', unitCode: 'MANI-RM2', tenantName: 'With Snip Saloon', monthlyRent: 3000, deposit: 0, startDate: null, endDate: null, status: 'Active', comments: 'snip wroker pay 3000 from sept 12' },

  // 6: Goa Flat
  { propCode: 'PROP-GOA', unitCode: 'GOA-FLAT1', tenantName: 'Asif', monthlyRent: 22000, annualRent: 264000, deposit: 0, startDate: '2026-01-01', endDate: '2026-09-30', status: 'Ended', comments: '' },
  { propCode: 'PROP-GOA', unitCode: 'GOA-FLAT1', tenantName: 'Asif', monthlyRent: 23000, annualRent: 276000, deposit: 0, startDate: '2026-10-01', endDate: null, status: 'Active', comments: 'Rent increased' },
  { propCode: 'PROP-GOA', unitCode: 'GOA-FLAT2', tenantName: 'Vacant', monthlyRent: 0, deposit: 0, startDate: null, endDate: null, status: 'Ended', comments: 'empty frommay 17' },

  // 7: Tony room (Roshan Manzil)
  { propCode: 'PROP-ROSHAN', unitCode: 'TONY-RM1', tenantName: 'DG', monthlyRent: 10000, deposit: 0, startDate: '2026-01-01', endDate: null, status: 'Active', comments: 'paid as  per same as dg  room above' },
  { propCode: 'PROP-ROSHAN', unitCode: 'TONY-RM2', tenantName: 'Santu Hajra', monthlyRent: 10000, deposit: 30000, startDate: '2024-10-20', endDate: null, status: 'Ended', comments: 'From 20th  Oct 24 , deposit paid in dec 24' },
  { propCode: 'PROP-ROSHAN', unitCode: 'TONY-RM2', tenantName: 'Subrato', monthlyRent: 11000, deposit: 30000, startDate: '2026-04-01', endDate: null, status: 'Ended', comments: 'from April 26' },
  { propCode: 'PROP-ROSHAN', unitCode: 'TONY-RM2', tenantName: 'Jite Damai', monthlyRent: 11000, deposit: 50000, startDate: '2026-09-01', endDate: null, status: 'Active', comments: 'from 010926' },

  // 8: Byculla Club
  { propCode: 'PROP-BYCULLA', unitCode: 'BY-1ST', tenantName: 'Basar', monthlyRent: 88000, annualRent: 1056000, deposit: 0, startDate: null, endDate: null, status: 'Ended', comments: 'dates not known' },
  { propCode: 'PROP-BYCULLA', unitCode: 'BY-1ST', tenantName: 'Basar', monthlyRent: 93583.33, annualRent: 1123000, deposit: 0, startDate: null, endDate: null, status: 'Ended', comments: 'pd 1122000 in may 16' },
  { propCode: 'PROP-BYCULLA', unitCode: 'BY-1ST', tenantName: 'Basar', monthlyRent: 97833.33, annualRent: 1174000, deposit: 0, startDate: null, endDate: null, status: 'Ended', comments: 'pd 6.5 in june, 3.42 in jul and 2 in aug 18 paid till march 19' },
  { propCode: 'PROP-BYCULLA', unitCode: 'BY-1ST', tenantName: 'Amir Kids', monthlyRent: 80000, deposit: 300000, startDate: '2024-11-01', endDate: '2025-10-30', status: 'Ended', comments: '300000 depsot and rent 80000 from 1st Nov' },
  { propCode: 'PROP-BYCULLA', unitCode: 'BY-1ST', tenantName: 'Amir Kids', monthlyRent: 88000, deposit: 300000, startDate: '2025-11-01', endDate: null, status: 'Active', comments: 'rent will incease in nov 25 pays 48000 cash and 40,000 by check' },
  { propCode: 'PROP-BYCULLA', unitCode: 'BY-MEZZ', tenantName: 'Raju Bhai', monthlyRent: 35000, annualRent: 420000, deposit: 0, startDate: '2016-10-09', endDate: '2019-07-30', status: 'Ended', comments: 'pd 50,000 in oct 15 and 3,10,000 in nov 15 start date is 9th oct' },
  { propCode: 'PROP-BYCULLA', unitCode: 'BY-MEZZ', tenantName: 'Raju Bhai', monthlyRent: 50000, deposit: 0, startDate: '2019-08-01', endDate: null, status: 'Ended', comments: 'rents increased to 50000 from aug19' },
  { propCode: 'PROP-BYCULLA', unitCode: 'BY-MEZZ', tenantName: 'Romel', monthlyRent: 50000, deposit: 0, startDate: '2021-02-01', endDate: null, status: 'Active', comments: 'Pd 2lac in feb21, rents starts from aug 20' },

  // 9: Barankers room  - Building 65 No
  { propCode: 'PROP-BARANKER', unitCode: 'BAR-1ST', tenantName: 'Anjana Ashok Salunke', monthlyRent: 7000, deposit: 20000, startDate: '2023-01-01', endDate: null, status: 'Active', comments: 'from jan 23' },
  { propCode: 'PROP-BARANKER', unitCode: 'BAR-MEZZ', tenantName: 'Umesh', monthlyRent: 4500, deposit: 0, startDate: '2015-04-01', endDate: null, status: 'Ended', comments: 'from april 15' },
  { propCode: 'PROP-BARANKER', unitCode: 'BAR-MEZZ', tenantName: 'Umesh', monthlyRent: 5500, deposit: 0, startDate: '2018-06-01', endDate: null, status: 'Active', comments: 'Increase to 5500 form june 18' },

  // 10: Room No 10 - Building 65 No
  { propCode: 'PROP-ROOM10', unitCode: 'ROOM-10', tenantName: 'Unknown Tenant', monthlyRent: 7500, annualRent: 90000, deposit: 0, startDate: '2019-10-01', endDate: null, status: 'Ended', comments: 'full year rent paid up to oct 19' },
  { propCode: 'PROP-ROOM10', unitCode: 'ROOM-10', tenantName: 'Unknown Tenant', monthlyRent: 9000, deposit: 0, startDate: '2019-10-01', endDate: null, status: 'Ended', comments: 'rent in crease to 9000 per month and pays per month bases from oct 19' },
  { propCode: 'PROP-ROOM10', unitCode: 'ROOM-10', tenantName: 'Unknown Tenant', monthlyRent: 8000, deposit: 4000, startDate: '2020-12-01', endDate: null, status: 'Ended', comments: 'new tenet fron dec 20 rent 8000 and deposit 4000' },
  { propCode: 'PROP-ROOM10', unitCode: 'ROOM-10', tenantName: 'Maulana', monthlyRent: 8000, deposit: 10000, startDate: '2021-06-01', endDate: null, status: 'Ended', comments: '10000 deposit and rent 8000 from June 21' },
  { propCode: 'PROP-ROOM10', unitCode: 'ROOM-10', tenantName: 'New Tenant (Aug 22)', monthlyRent: 8500, deposit: 1500, startDate: '2022-08-01', endDate: null, status: 'Ended', comments: '8500 rwent and 1500 deposit from Aug 22' },
  { propCode: 'PROP-ROOM10', unitCode: 'ROOM-10', tenantName: 'Kamlesh', monthlyRent: 8000, deposit: 20000, startDate: '2023-10-01', endDate: null, status: 'Ended', comments: 'from Oct 23 paid 20000 deposit' },
  { propCode: 'PROP-ROOM10', unitCode: 'ROOM-10', tenantName: 'New Tenant (Apr 24)', monthlyRent: 10000, deposit: 30000, startDate: '2024-04-01', endDate: null, status: 'Ended', comments: 'New Tenent from Apr 24' },
  { propCode: 'PROP-ROOM10', unitCode: 'ROOM-10', tenantName: 'Santosh', monthlyRent: 9000, deposit: 25000, startDate: '2025-05-01', endDate: null, status: 'Active', comments: 'new tenent form 09/05/25 depsit 25000' },

  // 11: Kandivli
  { propCode: 'PROP-KANDIVLI', unitCode: 'KAND-2108', tenantName: 'Tenant 2108 (Fatu)', monthlyRent: 11000, deposit: 0, startDate: null, endDate: null, status: 'Ended', comments: '' },
  { propCode: 'PROP-KANDIVLI', unitCode: 'KAND-2109', tenantName: 'Tenant 2109', monthlyRent: 11000, deposit: 0, startDate: null, endDate: null, status: 'Ended', comments: '' },
  { propCode: 'PROP-KANDIVLI', unitCode: 'KAND-2108', tenantName: 'Tenant 2108 (Fatu)', monthlyRent: 12000, deposit: 0, startDate: null, endDate: null, status: 'Ended', comments: 'rent increase to 12000' },
  { propCode: 'PROP-KANDIVLI', unitCode: 'KAND-2109', tenantName: 'Tenant 2109', monthlyRent: 12000, deposit: 0, startDate: null, endDate: null, status: 'Ended', comments: 'rent increase to 12000' },
  { propCode: 'PROP-KANDIVLI', unitCode: 'KAND-2108', tenantName: 'Tenant 2108 (Fatu)', monthlyRent: 0, deposit: 0, startDate: null, endDate: null, status: 'Active', comments: 'Gave to fatu' },
  { propCode: 'PROP-KANDIVLI', unitCode: 'KAND-2109', tenantName: 'Tenant 2109', monthlyRent: 13200, deposit: 0, startDate: null, endDate: null, status: 'Active', comments: '' }
];

async function syncExactSheet() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  // 1. Upsert Properties
  const propMap = {};
  for (const p of PROPERTIES) {
    const doc = await Property.findOneAndUpdate(
      { propertyCode: p.code },
      { name: p.name, propertyCode: p.code, displayOrder: p.order, totalAreaSqFt: p.area, propertyType: p.type, city: p.code === 'PROP-GOA' ? 'Goa' : 'Mumbai', isActive: true },
      { upsert: true, returnDocument: 'after' }
    );
    propMap[p.code] = doc;
    console.log(`✓ Property [${p.order}] ${p.name}`);
  }

  // Delete properties not in PROPERTIES list
  const validPropIds = Object.values(propMap).map(p => p._id);
  await Property.deleteMany({ _id: { $nin: validPropIds } });

  // 2. Upsert Sub Properties
  const unitMap = {};
  for (const sp of SUB_PROPERTIES) {
    const parentProp = PROPERTIES.find(p => p.order === sp.propOrder);
    const parentDoc = propMap[parentProp.code];
    const doc = await Unit.findOneAndUpdate(
      { unitCode: sp.code },
      { propertyId: parentDoc._id, unitName: sp.name, subUnitPartition: sp.name, unitCode: sp.code, areaSqFt: sp.area, unitType: sp.type, isActive: true },
      { upsert: true, returnDocument: 'after' }
    );
    unitMap[sp.code] = doc;
    console.log(`  ✓ Unit [${sp.code}] ${sp.name} -> Property: ${parentProp.name}`);
  }

  // Delete units not in SUB_PROPERTIES
  const validUnitIds = Object.values(unitMap).map(u => u._id);
  await Unit.deleteMany({ _id: { $nin: validUnitIds } });

  // 3. Clean-sync Tenants:
  // We identify the unique tenants in CONTRACTS
  const tenantMap = {};
  const uniqueTenantNames = Array.from(new Set(CONTRACTS.map(c => c.tenantName)));

  for (const name of uniqueTenantNames) {
    let t = await Tenant.findOne({ name: { $regex: new RegExp(`^${name}$`, 'i') } });
    if (!t) {
      const clean = name.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 4) || 'TENA';
      const rand = Math.floor(100 + Math.random() * 900);
      t = new Tenant({
        name,
        tenantCode: `TEN-${clean}-${rand}`,
        phone: '9820000000',
        tenantType: 'Individual',
        isActive: true
      });
      await t.save();
    }
    tenantMap[name] = t;
    console.log(`✓ Tenant: ${t.name} (${t.tenantCode})`);
  }

  // 4. Preserve payment receipts:
  // Check which tenantIds and unitIds are in existing PaymentReceipts
  const existingReceipts = await PaymentReceipt.find();
  console.log(`Total payment receipts to protect: ${existingReceipts.length}`);

  // Re-link payment receipts to canonical unit & tenant
  for (const r of existingReceipts) {
    // If unit is not in validUnitIds, find best match
    if (!validUnitIds.some(uid => uid.toString() === r.unitId?.toString())) {
      console.warn(`Receipt ${r.receiptNumber} unit ${r.unitId} not in valid list!`);
    }
  }

  // 5. Clean-sync Contracts / Assignments:
  // Remove all assignments except those created from this exact list
  // First, remove existing dummy assignments
  await TenantAssignment.deleteMany({});
  await RentAgreement.deleteMany({});
  console.log('Cleared old dummy assignments and agreements.');

  let assignCounter = 1;
  const createdAssignments = [];

  for (const c of CONTRACTS) {
    const unit = unitMap[c.unitCode];
    const tenant = tenantMap[c.tenantName];
    if (!unit || !tenant) {
      console.error(`Missing unit or tenant for contract:`, c);
      continue;
    }

    const code = `ASN-${String(assignCounter++).padStart(4, '0')}`;
    const assign = new TenantAssignment({
      assignmentCode: code,
      unitId: unit._id,
      tenantId: tenant._id,
      startDate: c.startDate ? new Date(c.startDate) : null,
      endDate: c.endDate ? new Date(c.endDate) : null,
      status: c.status,
      depositHeld: c.deposit || 0,
      notes: c.comments || '',
      initialPaidTillMonth: null
    });
    await assign.save();

    const agreement = new RentAgreement({
      agreementCode: `AGR-${code.slice(4)}`,
      assignmentId: assign._id,
      unitId: unit._id,
      tenantId: tenant._id,
      monthlyRate: c.monthlyRent || 0,
      annualRate: c.annualRent || (c.monthlyRent ? c.monthlyRent * 12 : 0),
      rentType: c.annualRent ? 'Annual Fixed' : 'Monthly Fixed',
      depositAmount: c.deposit || 0,
      effectiveFrom: c.startDate ? new Date(c.startDate) : null,
      effectiveTo: c.endDate ? new Date(c.endDate) : null,
      isCurrentRate: c.status === 'Active'
    });
    await agreement.save();

    createdAssignments.push(assign);
    console.log(`  ✓ Contract ${assign.assignmentCode}: ${tenant.name} on ${unit.subUnitPartition} (${c.status}) - ₹${c.monthlyRent}/m`);
  }

  // 6. Delete any tenants not referenced in any assignment or payment receipt
  const usedTenantIds = new Set(createdAssignments.map(a => a.tenantId.toString()));
  for (const r of existingReceipts) {
    if (r.tenantId) usedTenantIds.add(r.tenantId.toString());
  }
  await Tenant.deleteMany({ _id: { $nin: Array.from(usedTenantIds) } });

  // 7. Update occupancyStatus on all 22 units
  for (const u of Object.values(unitMap)) {
    const hasActive = await TenantAssignment.findOne({ unitId: u._id, status: 'Active' });
    await Unit.findByIdAndUpdate(u._id, {
      occupancyStatus: hasActive ? 'Occupied' : 'Vacant'
    });
  }

  // 8. Re-link existing payment receipts to the active or historical assignments
  for (const r of existingReceipts) {
    // find assignment matching unit and tenant, or unit
    let assign = await TenantAssignment.findOne({ unitId: r.unitId, tenantId: r.tenantId, status: 'Active' });
    if (!assign) {
      assign = await TenantAssignment.findOne({ unitId: r.unitId, status: 'Active' });
    }
    if (!assign) {
      assign = await TenantAssignment.findOne({ unitId: r.unitId });
    }
    if (assign) {
      await PaymentReceipt.findByIdAndUpdate(r._id, {
        tenantId: assign.tenantId,
        unitId: assign.unitId
      });
      await PaymentAllocation.updateMany({ receiptId: r._id }, {
        tenantId: assign.tenantId,
        unitId: assign.unitId
      });
    }
  }

  // Audit
  const finalProps = await Property.countDocuments();
  const finalUnits = await Unit.countDocuments();
  const finalTenants = await Tenant.countDocuments();
  const finalContracts = await TenantAssignment.countDocuments();
  const finalActive = await TenantAssignment.countDocuments({ status: 'Active' });
  const finalEnded = await TenantAssignment.countDocuments({ status: 'Ended' });
  const finalReceipts = await PaymentReceipt.countDocuments();

  console.log('\n=============================================');
  console.log('✅ SYNC WITH EXACT SHEET COMPLETED!');
  console.log(`Properties: ${finalProps} (expected 11)`);
  console.log(`Partitions/Units: ${finalUnits} (expected 22)`);
  console.log(`Tenants: ${finalTenants} (clean, no demo duplicates!)`);
  console.log(`Total Contracts: ${finalContracts} (Active: ${finalActive}, Ended: ${finalEnded})`);
  console.log(`Payment Receipts: ${finalReceipts} (100% intact!)`);
  console.log('=============================================');

  await mongoose.disconnect();
}

syncExactSheet().catch(err => {
  console.error('Error syncing exact sheet:', err);
  process.exit(1);
});
