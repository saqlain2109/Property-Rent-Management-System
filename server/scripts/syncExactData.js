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

const MASTER_DATA = [
  // 1: Kotak Godaown (66 Godown)
  {
    order: 1,
    property: { name: 'Kotak Godaown (66 Godown)', code: 'PROP-KOTAK', type: 'Commercial Godown', area: 4500, city: 'Mumbai' },
    subProperties: [
      {
        name: 'PG',
        code: 'KO-PG',
        type: 'PG Facility',
        area: 2500,
        contracts: [
          { status: 'Active', tenant: 'PG', monthly: 0, annual: 0, deposit: 0, start: '2018-01-01', end: null, comments: 'Multi-occupant PG Facility' }
        ]
      },
      {
        name: 'Small Godown',
        code: 'KO-SMALL',
        type: 'Commercial Godown',
        area: 2000,
        contracts: [
          { status: 'Active', tenant: 'Water Wala', monthly: 20250, annual: 243000, deposit: 0, start: '2018-01-01', end: null, comments: 'from Jan 2018 rent increased to 17250, currently 20250' }
        ]
      }
    ]
  },

  // 2: 65 no godown
  {
    order: 2,
    property: { name: '65 no godown', code: 'PROP-65-GODOWN', type: 'Commercial Godown', area: 2500, city: 'Mumbai' },
    subProperties: [
      {
        name: '65 Large Godown',
        code: '65-LARGE',
        type: 'Commercial Godown',
        area: 1500,
        contracts: [
          { status: 'Ended', tenant: 'Delhiery', monthly: 75000, annual: 900000, deposit: 300000, start: '2025-09-01', end: '2026-08-30', comments: 'Rents is 1,50,000 and 50% is company i.e. 75000 per month and deposit is 6L and 3 L with company. Rent start from Sep 25' },
          { status: 'Active', tenant: 'Delhiery', monthly: 78750, annual: 945000, deposit: 300000, start: '2026-09-01', end: null, comments: 'Revised 50% share rent from Sep 26 at 78,750/mo' }
        ]
      },
      {
        name: '65 Small Godown',
        code: '65-SMALL',
        type: 'Commercial Godown',
        area: 1000,
        contracts: [
          { status: 'Ended', tenant: 'Rehan', monthly: 8500, annual: 102000, deposit: 25000, start: '2025-02-01', end: null, comments: 'from feb 25' },
          { status: 'Ended', tenant: 'Rehan', monthly: 9500, annual: 114000, deposit: 25000, start: null, end: null, comments: 'rent increased' },
          { status: 'Active', tenant: 'Mohammed Nasir Qurashi', monthly: 10500, annual: 100000, deposit: 0, start: '2026-10-01', end: null, comments: 'from 01/10/26 total rent is 21000 (50% share is 10500)' }
        ]
      }
    ]
  },

  // 3: Barankers room  - Building 65 No
  {
    order: 3,
    property: { name: 'Barankers room  - Building 65 No', code: 'PROP-BARANKER', type: 'Room', area: 2500, city: 'Mumbai' },
    subProperties: [
      {
        name: '1st Floor',
        code: 'BAR-1ST',
        type: 'Room',
        area: 1200,
        contracts: [
          { status: 'Active', tenant: 'Anjana Ashok Salunke', monthly: 7000, annual: 84000, deposit: 20000, start: '2023-01-01', end: null, comments: 'ground floor- ANJANAashok salunke from jan 23' }
        ]
      },
      {
        name: 'Mezzanine',
        code: 'BAR-MEZZ',
        type: 'Room',
        area: 1300,
        contracts: [
          { status: 'Ended', tenant: 'Umesh', monthly: 4500, annual: 54000, deposit: 0, start: '2015-04-01', end: null, comments: 'from april 15' },
          { status: 'Active', tenant: 'Umesh', monthly: 5500, annual: 66000, deposit: 0, start: '2018-06-01', end: null, comments: 'Increase to 5500 from june 18' }
        ]
      }
    ]
  },

  // 4: Room No 10 - Building 65 No
  {
    order: 4,
    property: { name: 'Room No 10 - Building 65 No', code: 'PROP-ROOM10', type: 'Room', area: 500, city: 'Mumbai' },
    subProperties: [
      {
        name: 'Room No 10 - Building 65 No',
        code: 'ROOM-10',
        type: 'Room',
        area: 500,
        contracts: [
          { status: 'Ended', tenant: 'Unknown Tenant', monthly: 7500, annual: 90000, deposit: 0, start: '2019-10-01', end: null, comments: 'full year rent paid up to oct 19' },
          { status: 'Ended', tenant: 'Unknown Tenant', monthly: 9000, annual: 108000, deposit: 0, start: '2019-10-01', end: null, comments: 'rent in crease to 9000 per month and pays per month bases from oct 19' },
          { status: 'Ended', tenant: 'Unknown Tenant', monthly: 8000, annual: 96000, deposit: 4000, start: '2020-12-01', end: null, comments: 'new tenet from dec 20 rent 8000 and deposit 4000' },
          { status: 'Ended', tenant: 'Maulana', monthly: 8000, annual: 96000, deposit: 10000, start: '2021-06-01', end: null, comments: '10000 deposit and rent 8000 from June 21' },
          { status: 'Ended', tenant: 'New Tenant (Aug 22)', monthly: 8500, annual: 102000, deposit: 1500, start: '2022-08-01', end: null, comments: '8500 rent and 1500 deposit from Aug 22' },
          { status: 'Ended', tenant: 'Kamlesh', monthly: 8000, annual: 96000, deposit: 20000, start: '2023-10-01', end: null, comments: 'from Oct 23 paid 20000 deposit' },
          { status: 'Ended', tenant: 'New Tenant (Apr 24)', monthly: 10000, annual: 120000, deposit: 30000, start: '2024-04-01', end: null, comments: 'New Tenant from Apr 24' },
          { status: 'Active', tenant: 'Santosh', monthly: 9000, annual: 108000, deposit: 25000, start: '2025-05-01', end: null, comments: 'new tenet from 09/05/25 deposit 25000' }
        ]
      }
    ]
  },

  // 5: Garage
  {
    order: 5,
    property: { name: 'Garage', code: 'PROP-GARAGE', type: 'Garage', area: 3200, city: 'Mumbai' },
    subProperties: [
      {
        name: 'Shop 1',
        code: 'GA-SHOP1',
        type: 'Commercial Office',
        area: 600,
        contracts: [
          { status: 'Active', tenant: 'DG Cable', rentType: 'Annual Fixed', monthly: 2083.33, annual: 25000, deposit: 0, start: null, end: null, comments: 'Rent increase in Jan 25 (Annual rate 25,000)' }
        ]
      },
      {
        name: 'Shop 2',
        code: 'GA-SHOP2',
        type: 'Commercial Office',
        area: 800,
        contracts: [
          { status: 'Ended', tenant: 'Snip - Irfan Ansari', monthly: 32000, annual: 384000, deposit: 0, start: '2025-06-01', end: '2026-06-01', comments: 'rent increase in june 2025' },
          { status: 'Active', tenant: 'Snip- Salman Ahmed', monthly: 36000, annual: 432000, deposit: 100000, start: '2026-08-01', end: null, comments: 'rent is 36000 and deposit 1 lac given on rent from 1st aug 26' }
        ]
      },
      {
        name: 'Godown',
        code: 'GA-GODOWN',
        type: 'Commercial Godown',
        area: 1000,
        contracts: [
          { status: 'Active', tenant: 'Anand', monthly: 10000, annual: 120000, deposit: 0, start: '2014-01-01', end: null, comments: 'rented from jan 2014 @20,000 per month (50% share is 10,000)' }
        ]
      },
      {
        name: 'Chira Bazar House',
        code: 'GA-CHIRA',
        type: 'Residential Apartment',
        area: 800,
        contracts: [
          { status: 'Active', tenant: 'Altaf', monthly: 22000, annual: 264000, deposit: 0, start: '2022-04-01', end: null, comments: 'rent increased to 22000 in apr 22' }
        ]
      }
    ]
  },

  // 6: Ennas Room
  {
    order: 6,
    property: { name: 'Ennas Room', code: 'PROP-ENNAS', type: 'Room', area: 2500, city: 'Mumbai' },
    subProperties: [
      {
        name: 'Ennas Room',
        code: 'ENNAS-RM',
        type: 'Room',
        area: 2500,
        contracts: [
          { status: 'Ended', tenant: 'Bengali', monthly: 14000, annual: 168000, deposit: 0, start: '2015-03-01', end: '2017-12-31', comments: 'rent increased to 14000 from 12000 in mar 15' },
          { status: 'Ended', tenant: 'Bengali', monthly: 16000, annual: 192000, deposit: 0, start: '2018-01-01', end: '2018-12-31', comments: 'rent increased to 16000 from 14000 in jan18' },
          { status: 'Ended', tenant: 'Bengali', monthly: 18000, annual: 216000, deposit: 0, start: '2019-01-01', end: '2022-01-31', comments: 'rent increased to 18000 from 16000 in jan19' },
          { status: 'Ended', tenant: 'Bengali', monthly: 20000, annual: 240000, deposit: 0, start: '2023-02-01', end: '2025-01-31', comments: 'rent increased from 18000 to 20000 in feb 23' },
          { status: 'Active', tenant: 'Bengali', monthly: 22000, annual: 264000, deposit: 0, start: '2025-02-01', end: null, comments: 'rent increased from 20000 to 22000 in Jan 25' }
        ]
      }
    ]
  },

  // 7: Mani Mansion
  {
    order: 7,
    property: { name: 'Mani Mansion', code: 'PROP-MANI', type: 'Mixed Use', area: 2500, city: 'Mumbai' },
    subProperties: [
      {
        name: 'Mani Mansion -Room 1',
        code: 'MANI-RM1',
        type: 'Room',
        area: 1250,
        contracts: [
          { status: 'Ended', tenant: 'Dinesh', monthly: 13000, annual: 156000, deposit: 0, start: '2017-01-01', end: null, comments: 'from feb 2017' },
          { status: 'Ended', tenant: 'Unknown Tenant', monthly: 13500, annual: 162000, deposit: 0, start: '2019-03-06', end: null, comments: 'paid for 6 months from 6th march 19.' },
          { status: 'Ended', tenant: 'Unknown Tenant', monthly: 12000, annual: 144000, deposit: 50000, start: '2021-01-01', end: null, comments: 'From Jan 2021 - rent 12000 and 50000 deposit' },
          { status: 'Ended', tenant: 'Jayanti Bhai', monthly: 12000, annual: 144000, deposit: 0, start: '2021-09-01', end: null, comments: 'from sep 21' },
          { status: 'Ended', tenant: 'Aswini Derad Monga', monthly: 15000, annual: 180000, deposit: 50000, start: '2024-01-01', end: null, comments: 'from Jan 24 deposit 50,000' },
          { status: 'Active', tenant: 'Aswini Derad Monga', monthly: 16000, annual: 192000, deposit: 50000, start: '2026-02-01', end: null, comments: 'rents increase to 16000 in feb 26' }
        ]
      },
      {
        name: 'Mani Mansion -Room 2',
        code: 'MANI-RM2',
        type: 'Room',
        area: 1250,
        contracts: [
          { status: 'Active', tenant: 'With Snip Saloon', monthly: 3000, annual: 36000, deposit: 0, start: null, end: null, comments: 'snip worker pay 3000 from sept 12' }
        ]
      }
    ]
  },

  // 8: Tony room (Roshan Manzil)
  {
    order: 8,
    property: { name: 'Tony room (Roshan Manzil)', code: 'PROP-ROSHAN', type: 'Room', area: 2500, city: 'Mumbai' },
    subProperties: [
      {
        name: 'Tony Room 1',
        code: 'TONY-RM1',
        type: 'Room',
        area: 1250,
        contracts: [
          { status: 'Active', tenant: 'DG', monthly: 10000, annual: 120000, deposit: 0, start: '2026-01-01', end: null, comments: 'paid as per same as dg room above' }
        ]
      },
      {
        name: 'Tony Room 2',
        code: 'TONY-RM2',
        type: 'Room',
        area: 1250,
        contracts: [
          { status: 'Ended', tenant: 'Santu Hajra', monthly: 10000, annual: 120000, deposit: 30000, start: '2024-10-20', end: null, comments: 'From 20th Oct 24 , deposit paid in dec 24' },
          { status: 'Ended', tenant: 'Subrato', monthly: 11000, annual: 132000, deposit: 30000, start: '2026-04-01', end: null, comments: 'from April 26' },
          { status: 'Active', tenant: 'Jite Damai', monthly: 11000, annual: 132000, deposit: 50000, start: '2026-09-01', end: null, comments: 'from 01/09/26' }
        ]
      }
    ]
  },

  // 9: Byculla Club
  {
    order: 9,
    property: { name: 'Byculla Club', code: 'PROP-BYCULLA', type: 'Commercial Office', area: 2500, city: 'Mumbai' },
    subProperties: [
      {
        name: '1st Floor',
        code: 'BY-1ST',
        type: 'Commercial Office',
        area: 1500,
        contracts: [
          { status: 'Ended', tenant: 'Basar', monthly: 88000, annual: 1056000, deposit: 0, start: null, end: null, comments: 'Historic lease with Basar' },
          { status: 'Ended', tenant: 'Basar', monthly: 93583.33, annual: 1123000, deposit: 0, start: null, end: null, comments: 'pd 1122000 in may 16' },
          { status: 'Ended', tenant: 'Basar', monthly: 97833.33, annual: 1174000, deposit: 0, start: null, end: null, comments: 'pd 6.5 in june, 3.42 in jul and 2 in aug 18 paid till march 19' },
          { status: 'Ended', tenant: 'Amir Kids', monthly: 80000, annual: 960000, deposit: 300000, start: '2024-11-01', end: '2025-10-30', comments: '300000 deposit and rent 80000 from 1st Nov' },
          { status: 'Active', tenant: 'Amir Kids', monthly: 88000, annual: 1056000, deposit: 300000, start: '2025-11-01', end: null, comments: 'rent will increase in nov 25 pays 48000 cash and 40,000 by cheque' }
        ]
      },
      {
        name: 'Mezzanine',
        code: 'BY-MEZZ',
        type: 'Commercial Office',
        area: 1000,
        contracts: [
          { status: 'Ended', tenant: 'Raju Bhai', monthly: 35000, annual: 420000, deposit: 0, start: '2016-10-09', end: '2019-07-30', comments: 'pd 50,000 in oct 15 and 3,10,000 in nov 15 start date is 9th oct' },
          { status: 'Ended', tenant: 'Raju Bhai', monthly: 50000, annual: 600000, deposit: 0, start: '2019-08-01', end: null, comments: 'rents increased to 50000 from aug19' },
          { status: 'Active', tenant: 'Romel', monthly: 50000, annual: 600000, deposit: 0, start: '2021-02-01', end: null, comments: 'Pd 2lac in feb21, rents starts from aug 20' }
        ]
      }
    ]
  },

  // 10: Kandivli
  {
    order: 10,
    property: { name: 'Kandivli', code: 'PROP-KANDIVLI', type: 'Residential Apartment', area: 2500, city: 'Mumbai' },
    subProperties: [
      {
        name: 'Flat No 2108',
        code: 'KAND-2108',
        type: 'Residential Apartment',
        area: 1250,
        contracts: [
          { status: 'Ended', tenant: 'Tenant 2108', monthly: 11000, annual: 132000, deposit: 0, start: null, end: null, comments: 'Previous lease' },
          { status: 'Ended', tenant: 'Tenant 2108', monthly: 12000, annual: 144000, deposit: 0, start: null, end: null, comments: 'rent increase to 12000' },
          { status: 'Active', tenant: 'Tenant 2108 (Fatu)', monthly: 0, annual: 0, deposit: 0, start: null, end: null, comments: 'Gave to fatu' }
        ]
      },
      {
        name: 'Flat No 2109',
        code: 'KAND-2109',
        type: 'Residential Apartment',
        area: 1250,
        contracts: [
          { status: 'Ended', tenant: 'Tenant 2109', monthly: 11000, annual: 132000, deposit: 0, start: null, end: null, comments: 'Previous lease' },
          { status: 'Ended', tenant: 'Tenant 2109', monthly: 12000, annual: 144000, deposit: 0, start: '2026-01-01', end: '2026-08-14', comments: 'rent increase to 12000' },
          { status: 'Active', tenant: 'Tenant 2109', monthly: 13200, annual: 158400, deposit: 0, start: '2026-08-16', end: null, comments: 'Active lease at 13,200/mo' }
        ]
      }
    ]
  },

  // 11: Goa Flat
  {
    order: 11,
    property: { name: 'Goa Flat', code: 'PROP-GOA', type: 'Residential Apartment', area: 2500, city: 'Goa' },
    subProperties: [
      {
        name: 'Flat no 1',
        code: 'GOA-FLAT1',
        type: 'Residential Apartment',
        area: 1250,
        contracts: [
          { status: 'Ended', tenant: 'Asif', monthly: 22000, annual: 264000, deposit: 0, start: '2026-01-01', end: '2026-09-30', comments: 'Lease up to Sep 26' },
          { status: 'Active', tenant: 'Asif', monthly: 23000, annual: 276000, deposit: 0, start: '2026-10-01', end: null, comments: 'Rent increased to 23,000 from Oct 26' }
        ]
      },
      {
        name: 'Flat No.2.',
        code: 'GOA-FLAT2',
        type: 'Residential Apartment',
        area: 1250,
        contracts: [
          { status: 'Ended', tenant: 'Vacant', monthly: 0, annual: 0, deposit: 0, start: null, end: null, comments: 'empty from may 17' }
        ]
      }
    ]
  }
];

async function syncExact() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB:', process.env.MONGODB_URI);

  // 1. Cleanly update/upsert Properties
  console.log('\n--- Syncing 11 Properties with Exact Display Orders 1 to 11 ---');
  const propertyDocs = {};

  for (const block of MASTER_DATA) {
    const pInfo = block.property;
    let prop = await Property.findOne({ propertyCode: pInfo.code });

    if (!prop) {
      // Try finding by exact name
      prop = await Property.findOne({ name: pInfo.name });
    }

    if (prop) {
      prop.name = pInfo.name;
      prop.propertyCode = pInfo.code;
      prop.displayOrder = block.order;
      prop.totalAreaSqFt = pInfo.area;
      prop.propertyType = pInfo.type;
      prop.city = pInfo.city;
      prop.isActive = true;
      await prop.save();
    } else {
      prop = await Property.create({
        name: pInfo.name,
        propertyCode: pInfo.code,
        displayOrder: block.order,
        totalAreaSqFt: pInfo.area,
        propertyType: pInfo.type,
        city: pInfo.city,
        ownershipPercentage: 100,
        ownerOrResponsiblePerson: 'Owner',
        isActive: true
      });
    }
    propertyDocs[pInfo.code] = prop;
    console.log(`✓ Property ${block.order}: ${prop.name} (${prop.propertyCode}) [ID: ${prop._id}]`);
  }

  // 2. Sync Sub-Properties (Units)
  console.log('\n--- Syncing Sub-Properties & Partitions ---');
  const unitDocs = {};

  for (const block of MASTER_DATA) {
    const parentProp = propertyDocs[block.property.code];

    for (const sub of block.subProperties) {
      let unit = await Unit.findOne({ unitCode: sub.code });
      if (!unit) {
        unit = await Unit.findOne({
          propertyId: parentProp._id,
          subUnitPartition: sub.name
        });
      }

      if (unit) {
        unit.propertyId = parentProp._id;
        unit.unitName = sub.name;
        unit.subUnitPartition = sub.name;
        unit.unitCode = sub.code;
        unit.unitType = sub.type;
        unit.areaSqFt = sub.area;
        await unit.save();
      } else {
        unit = await Unit.create({
          unitCode: sub.code,
          propertyId: parentProp._id,
          unitName: sub.name,
          subUnitPartition: sub.name,
          unitType: sub.type,
          areaSqFt: sub.area,
          occupancyStatus: 'Occupied'
        });
      }
      unitDocs[sub.code] = unit;
      console.log(`✓ Unit: [${parentProp.name}] -> ${unit.subUnitPartition} (${unit.unitCode})`);
    }
  }

  // 3. Helper for Tenants
  async function getOrCreateTenant(tenantName) {
    let cleanName = (tenantName || 'Tenant').trim();
    let tenant = await Tenant.findOne({ name: cleanName });
    if (!tenant) {
      const count = await Tenant.countDocuments();
      const initials = cleanName.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 4) || 'TEN';
      tenant = await Tenant.create({
        name: cleanName,
        tenantCode: `TEN-${initials}-${String(count + 1).padStart(3, '0')}`,
        phone: '9820000000',
        businessName: cleanName,
        status: 'Active'
      });
    }
    return tenant;
  }

  // 4. Reset & Sync Contracts
  console.log('\n--- Syncing Active and Ended Contracts with Preserved History ---');
  let contractCounter = await TenantAssignment.countDocuments();

  for (const block of MASTER_DATA) {
    for (const sub of block.subProperties) {
      const unit = unitDocs[sub.code];
      if (!unit) continue;

      // Find contracts defined for this unit
      const contractsList = sub.contracts || [];
      const activeContractDef = contractsList.find(c => c.status === 'Active');

      // Update unit occupancy status
      const hasActive = Boolean(activeContractDef && activeContractDef.monthly > 0);
      await Unit.findByIdAndUpdate(unit._id, {
        occupancyStatus: hasActive ? 'Occupied' : (activeContractDef?.tenant === 'Vacant' ? 'Vacant' : 'Occupied'),
        monthlyRentExpected: activeContractDef?.monthly || 0
      });

      // Process each contract for this unit
      for (const cDef of contractsList) {
        const tenant = await getOrCreateTenant(cDef.tenant);
        const finalStatus = cDef.status;

        let assignment = await TenantAssignment.findOne({
          unitId: unit._id,
          tenantId: tenant._id,
          status: finalStatus
        });

        if (assignment) {
          assignment.startDate = cDef.start ? new Date(cDef.start) : assignment.startDate;
          assignment.endDate = cDef.end ? new Date(cDef.end) : assignment.endDate;
          assignment.depositHeld = cDef.deposit || assignment.depositHeld;
          assignment.notes = cDef.comments || assignment.notes;
          assignment.status = finalStatus;
          await assignment.save();
        } else {
          contractCounter++;
          assignment = await TenantAssignment.create({
            assignmentCode: `ASN-${String(contractCounter).padStart(4, '0')}`,
            tenantId: tenant._id,
            unitId: unit._id,
            startDate: cDef.start ? new Date(cDef.start) : null,
            endDate: cDef.end ? new Date(cDef.end) : null,
            depositHeld: cDef.deposit || 0,
            notes: cDef.comments || '',
            status: finalStatus
          });
        }

        const rentType = cDef.rentType || 'Monthly Fixed';
        const monthlyRate = cDef.monthly || 0;
        const annualRate = cDef.annual || monthlyRate * 12;

        let agreement = await RentAgreement.findOne({ assignmentId: assignment._id });
        if (!agreement) {
          agreement = await RentAgreement.create({
            assignmentId: assignment._id,
            unitId: unit._id,
            tenantId: tenant._id,
            rentType,
            monthlyRate,
            annualRate,
            effectiveFrom: cDef.start ? new Date(cDef.start) : null,
            effectiveTo: cDef.end ? new Date(cDef.end) : null,
            terms: cDef.comments || '',
            isCurrentRate: finalStatus === 'Active'
          });
        } else {
          agreement.rentType = rentType;
          agreement.monthlyRate = monthlyRate;
          agreement.annualRate = annualRate;
          agreement.effectiveFrom = cDef.start ? new Date(cDef.start) : agreement.effectiveFrom;
          agreement.effectiveTo = cDef.end ? new Date(cDef.end) : agreement.effectiveTo;
          agreement.isCurrentRate = finalStatus === 'Active';
          if (cDef.comments) agreement.terms = cDef.comments;
          await agreement.save();
        }

        console.log(`✓ [${finalStatus.padEnd(6)}] ${assignment.assignmentCode} | Unit: ${unit.subUnitPartition} | Tenant: ${tenant.name} | ₹${monthlyRate}/mo | Note: ${cDef.comments?.slice(0, 35)}`);
      }
    }
  }

  // 5. Verify single active contract rule across all units
  console.log('\n--- Verifying Single Active Contract Rule ---');
  const allUnits = await Unit.find();
  for (const u of allUnits) {
    const activeAssignments = await TenantAssignment.find({ unitId: u._id, status: 'Active' }).sort({ createdAt: -1 });
    if (activeAssignments.length > 1) {
      console.warn(`⚠️ Unit ${u.subUnitPartition} had ${activeAssignments.length} active assignments. Keeping latest active and setting earlier to Ended.`);
      for (let i = 1; i < activeAssignments.length; i++) {
        activeAssignments[i].status = 'Ended';
        await activeAssignments[i].save();
        await RentAgreement.updateMany({ assignmentId: activeAssignments[i]._id }, { isCurrentRate: false });
      }
    }
  }

  console.log('\n==========================================');
  console.log('✅ Master Alignment & Historical Contracts Sync 100% Complete!');
  console.log('==========================================');

  await mongoose.disconnect();
}

syncExact().catch(err => {
  console.error('Migration error:', err);
  process.exit(1);
});
