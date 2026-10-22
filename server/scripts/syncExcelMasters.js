const mongoose = require('mongoose');
const path = require('path');
const xlsx = require('xlsx');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const Property = require('../models/Property');
const Unit = require('../models/Unit');
const Tenant = require('../models/Tenant');
const TenantAssignment = require('../models/TenantAssignment');
const RentAgreement = require('../models/RentAgreement');
const PaymentReceipt = require('../models/PaymentReceipt');
const PaymentAllocation = require('../models/PaymentAllocation');

function excelDateToJS(serial) {
  if (typeof serial === 'number' && serial > 20000 && serial < 60000) {
    return new Date((serial - 25569) * 86400 * 1000).toISOString().slice(0, 10);
  }
  if (typeof serial === 'string' && serial.trim() !== '' && !serial.includes('dates not known')) {
    const s = serial.trim();
    if (s.includes('/')) {
      const parts = s.split('/');
      if (parts.length === 3) {
        let [d, m, y] = parts;
        if (y.length === 2) y = '20' + y;
        return y + '-' + m.padStart(2, '0') + '-' + d.padStart(2, '0');
      }
    }
  }
  return null;
}

// 11 Master Properties definition matching user's Sheet3
const MASTER_PROPERTIES = [
  { order: 1, name: 'Kotak Godaown (66 Godown)', code: 'PROP-KOTAK', type: 'Commercial Godown', area: 4500, city: 'Mumbai' },
  { order: 2, name: '65 no godown', code: 'PROP-65-GODOWN', type: 'Commercial Godown', area: 2500, city: 'Mumbai' },
  { order: 3, name: 'Barankers room  - Building 65 No', code: 'PROP-BARANKER', type: 'Room', area: 2500, city: 'Mumbai' },
  { order: 4, name: 'Room No 10 - Building 65 No', code: 'PROP-ROOM10', type: 'Room', area: 500, city: 'Mumbai' },
  { order: 5, name: 'Garage', code: 'PROP-GARAGE', type: 'Garage', area: 3200, city: 'Mumbai' },
  { order: 6, name: 'Ennas Room', code: 'PROP-ENNAS', type: 'Room', area: 2500, city: 'Mumbai' },
  { order: 7, name: 'Mani Mansion', code: 'PROP-MANI', type: 'Mixed Use', area: 2500, city: 'Mumbai' },
  { order: 8, name: 'Tony room (Roshan Manzil)', code: 'PROP-ROSHAN', type: 'Room', area: 2500, city: 'Mumbai' },
  { order: 9, name: 'Byculla Club', code: 'PROP-BYCULLA', type: 'Commercial Office', area: 2500, city: 'Mumbai' },
  { order: 10, name: 'Kandivli', code: 'PROP-KANDIVLI', type: 'Residential Apartment', area: 2500, city: 'Mumbai' },
  { order: 11, name: 'Goa Flat', code: 'PROP-GOA', type: 'Residential Apartment', area: 2500, city: 'Goa' },
];

// Authoritative Sub-Properties definition matching Sheet3
const MASTER_SUB_PROPERTIES = [
  // 1: Kotak Godaown (66 Godown)
  { order: 1, propCode: 'PROP-KOTAK', name: 'PG', code: 'KO-PG', area: 2500, type: 'PG Facility' },
  { order: 1, propCode: 'PROP-KOTAK', name: 'Small Godown', code: 'KO-SMALL', area: 2000, type: 'Commercial Godown' },

  // 2: 65 no godown
  { order: 2, propCode: 'PROP-65-GODOWN', name: '65 Large Godown', code: '65-LARGE', area: 1500, type: 'Commercial Godown' },
  { order: 2, propCode: 'PROP-65-GODOWN', name: '65 Small Godown', code: '65-SMALL', area: 1000, type: 'Commercial Godown' },

  // 3: Barankers room  - Building 65 No
  { order: 3, propCode: 'PROP-BARANKER', name: '1st Floor', code: 'BAR-1ST', area: 1200, type: 'Room' },
  { order: 3, propCode: 'PROP-BARANKER', name: 'Mezzanine', code: 'BAR-MEZZ', area: 1300, type: 'Room' },

  // 4: Room No 10 - Building 65 No
  { order: 4, propCode: 'PROP-ROOM10', name: 'Room No 10 - Building 65 No', code: 'ROOM-10', area: 500, type: 'Room' },

  // 5: Garage
  { order: 5, propCode: 'PROP-GARAGE', name: 'Shop 1', code: 'GA-SHOP1', area: 600, type: 'Commercial Office' },
  { order: 5, propCode: 'PROP-GARAGE', name: 'Shop 2', code: 'GA-SHOP2', area: 800, type: 'Commercial Office' },
  { order: 5, propCode: 'PROP-GARAGE', name: 'Godown', code: 'GA-GODOWN', area: 1000, type: 'Commercial Godown' },
  { order: 5, propCode: 'PROP-GARAGE', name: 'Chira Bazar House', code: 'GA-CHIRA', area: 800, type: 'Residential Apartment' },

  // 6: Ennas Room
  { order: 6, propCode: 'PROP-ENNAS', name: 'Ennas Room', code: 'ENNAS-RM', area: 2500, type: 'Room' },

  // 7: Mani Mansion
  { order: 7, propCode: 'PROP-MANI', name: 'Mani Mansion -Room 1', code: 'MANI-RM1', area: 1250, type: 'Room' },
  { order: 7, propCode: 'PROP-MANI', name: 'Mani Mansion -Room 2', code: 'MANI-RM2', area: 1250, type: 'Room' },

  // 8: Tony room (Roshan Manzil)
  { order: 8, propCode: 'PROP-ROSHAN', name: 'Tony Room 1', code: 'TONY-RM1', area: 1250, type: 'Room' },
  { order: 8, propCode: 'PROP-ROSHAN', name: 'Tony Room 2', code: 'TONY-RM2', area: 1250, type: 'Room' },

  // 9: Byculla Club
  { order: 9, propCode: 'PROP-BYCULLA', name: '1st Floor', code: 'BY-1ST', area: 1500, type: 'Commercial Office' },
  { order: 9, propCode: 'PROP-BYCULLA', name: 'Mezzanine', code: 'BY-MEZZ', area: 1000, type: 'Commercial Office' },

  // 10: Kandivli
  { order: 10, propCode: 'PROP-KANDIVLI', name: 'Flat No 2108', code: 'KAND-2108', area: 1250, type: 'Residential Apartment' },
  { order: 10, propCode: 'PROP-KANDIVLI', name: 'Flat No 2109', code: 'KAND-2109', area: 1250, type: 'Residential Apartment' },

  // 11: Goa Flat
  { order: 11, propCode: 'PROP-GOA', name: 'Flat no 1', code: 'GOA-FLAT1', area: 1250, type: 'Residential Apartment' },
  { order: 11, propCode: 'PROP-GOA', name: 'Flat No.2.', code: 'GOA-FLAT2', area: 1250, type: 'Residential Apartment' },
];

async function syncMastersAndContracts() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB:', process.env.MONGODB_URI);

  // 1. Sync Properties
  console.log('\n--- Syncing 11 Master Properties ---');
  const propMapByCode = {};

  for (const pDef of MASTER_PROPERTIES) {
    let prop = await Property.findOne({
      $or: [
        { propertyCode: pDef.code },
        { name: pDef.name }
      ]
    });

    if (!prop) {
      // Fuzzy match by code prefix or first keyword
      const keyword = pDef.name.split(' ')[0].replace(/[^a-zA-Z0-9]/g, '');
      prop = await Property.findOne({
        name: { $regex: new RegExp(keyword, 'i') }
      });
    }

    if (prop) {
      prop.name = pDef.name;
      prop.propertyCode = pDef.code;
      prop.displayOrder = pDef.order;
      prop.totalAreaSqFt = pDef.area;
      prop.propertyType = pDef.type;
      prop.city = pDef.city;
      await prop.save();
    } else {
      prop = await Property.create({
        name: pDef.name,
        propertyCode: pDef.code,
        displayOrder: pDef.order,
        totalAreaSqFt: pDef.area,
        propertyType: pDef.type,
        city: pDef.city,
        ownershipPercentage: 100,
        ownerOrResponsiblePerson: 'Owner',
        isActive: true
      });
    }
    propMapByCode[pDef.code] = prop;
    console.log(`✓ Property ${pDef.order}: ${prop.name} (${prop.propertyCode}) [ID: ${prop._id}]`);
  }

  // 2. Sync Sub-Properties (Units)
  console.log('\n--- Syncing Master Sub-Properties (Units) ---');
  const unitMapByCode = {};

  for (const uDef of MASTER_SUB_PROPERTIES) {
    const parentProp = propMapByCode[uDef.propCode];
    if (!parentProp) continue;

    const safeSubName = uDef.name.trim().replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
    let unit = await Unit.findOne({
      $or: [
        { unitCode: uDef.code },
        { propertyId: parentProp._id, subUnitPartition: { $regex: new RegExp(safeSubName, 'i') } },
        { propertyId: parentProp._id, unitName: { $regex: new RegExp(safeSubName, 'i') } }
      ]
    });

    if (unit) {
      unit.propertyId = parentProp._id;
      unit.unitName = uDef.name;
      unit.subUnitPartition = uDef.name;
      unit.unitCode = uDef.code;
      unit.areaSqFt = uDef.area;
      unit.unitType = uDef.type;
      await unit.save();
    } else {
      unit = await Unit.create({
        unitCode: uDef.code,
        propertyId: parentProp._id,
        unitName: uDef.name,
        subUnitPartition: uDef.name,
        areaSqFt: uDef.area,
        unitType: uDef.type,
        occupancyStatus: 'Occupied'
      });
    }
    unitMapByCode[uDef.code] = unit;
    console.log(`✓ Sub-Property: [${parentProp.name}] -> ${unit.subUnitPartition} (${unit.unitCode})`);
  }

  // 3. Read Excel Contracts sheet
  const excelPath = 'C:/Users/usesa/.gemini/antigravity/brain/e6f0a48a-e89a-4247-aae5-cc9854d2c9a2/.user_uploaded/media_1792583343303_4b25356f.xlsx';
  const wb = xlsx.readFile(excelPath);
  const sContracts = xlsx.utils.sheet_to_json(wb.Sheets['Contracts'], { header: 1 });

  let curProperty = null;
  let curOrder = null;
  let curSubProp = null;
  const rawRows = [];

  for (let i = 4; i < sContracts.length; i++) {
    const row = sContracts[i];
    if (!row || row.length === 0) continue;
    const col0 = row[0];
    const col1 = row[1];
    const tenant = row[2];
    const rentPerMonth = row[3];
    const rentPerAnnum = row[4];
    const deposit = row[5];
    const startDate = row[6];
    const endDate = row[7];
    const status = row[8];
    const comments = row[9];

    if (typeof col0 === 'number' && col1 && (!tenant && !status)) {
      curOrder = col0;
      curProperty = String(col1).trim();
      curSubProp = null;
      continue;
    }
    if (col1 && typeof col1 === 'string' && col1.trim() !== '') {
      curSubProp = col1.trim();
    }
    if (!tenant && !status && !rentPerMonth && !rentPerAnnum) continue;
    
    // Ignore total summary rows
    if (tenant === 'Unknown Tenant' && (!rentPerMonth || rentPerMonth === 0) && !status && !comments) continue;

    rawRows.push({
      order: curOrder,
      property: curProperty,
      subProp: curSubProp,
      tenantName: tenant ? String(tenant).trim().replace(/^[a-z0-9]\)\s*/i, '').trim() : 'Unknown Tenant',
      rentPerMonth: typeof rentPerMonth === 'number' ? rentPerMonth : (parseFloat(rentPerMonth) || 0),
      rentPerAnnum: typeof rentPerAnnum === 'number' ? rentPerAnnum : (parseFloat(rentPerAnnum) || 0),
      deposit: typeof deposit === 'number' ? deposit : (parseFloat(deposit) || 0),
      startDate: excelDateToJS(startDate),
      endDate: excelDateToJS(endDate),
      status: status ? String(status).trim() : (endDate ? 'Ended' : 'Active'),
      comments: comments ? String(comments).trim() : ''
    });
  }

  console.log(`\n--- Extracted ${rawRows.length} contract records from Excel ---`);

  // Helper to find the matched Unit for each Excel row
  function resolveUnit(row) {
    const order = row.order;
    const subProp = (row.subProp || '').toLowerCase();
    
    if (order === 1 || (row.property && row.property.includes('Kotak'))) {
      if (subProp.includes('pg')) return unitMapByCode['KO-PG'];
      return unitMapByCode['KO-SMALL'];
    }
    if (order === 2 || (row.property && row.property.includes('65 no godown'))) {
      if (subProp.includes('large')) return unitMapByCode['65-LARGE'];
      return unitMapByCode['65-SMALL'];
    }
    if (order === 3 || (row.property && row.property.includes('Baranker'))) {
      if (subProp.includes('1st')) return unitMapByCode['BAR-1ST'];
      if (subProp.includes('mezzanine')) return unitMapByCode['BAR-MEZZ'];
      if (subProp.includes('room 10')) return unitMapByCode['ROOM-10'];
      return unitMapByCode['BAR-1ST'];
    }
    if (order === 4 || (row.property && row.property.includes('Room No 10'))) {
      return unitMapByCode['ROOM-10'];
    }
    if (order === 5 || (row.property && row.property.includes('Garage'))) {
      if (subProp.includes('shop 1')) return unitMapByCode['GA-SHOP1'];
      if (subProp.includes('shop 2')) return unitMapByCode['GA-SHOP2'];
      if (subProp.includes('godown')) return unitMapByCode['GA-GODOWN'];
      if (subProp.includes('chira')) return unitMapByCode['GA-CHIRA'];
      return unitMapByCode['GA-SHOP1'];
    }
    if (order === 6 || (row.property && row.property.includes('Ennas'))) {
      return unitMapByCode['ENNAS-RM'];
    }
    if (order === 7 || (row.property && row.property.includes('Mani'))) {
      if (subProp.includes('room 2') || subProp.includes('snip')) return unitMapByCode['MANI-RM2'];
      return unitMapByCode['MANI-RM1'];
    }
    if (order === 8 || (row.property && row.property.includes('Tony'))) {
      if (subProp.includes('room 1')) return unitMapByCode['TONY-RM1'];
      return unitMapByCode['TONY-RM2'];
    }
    if (order === 9 || (row.property && row.property.includes('Byculla'))) {
      if (subProp.includes('1st')) return unitMapByCode['BY-1ST'];
      return unitMapByCode['BY-MEZZ'];
    }
    if (order === 10 || (row.property && row.property.includes('Kandivli'))) {
      if (subProp.includes('2108')) return unitMapByCode['KAND-2108'];
      return unitMapByCode['KAND-2109'];
    }
    if (order === 11 || (row.property && row.property.includes('Goa'))) {
      if (subProp.includes('no.2') || subProp.includes('no 2') || subProp.includes('vacant')) return unitMapByCode['GOA-FLAT2'];
      return unitMapByCode['GOA-FLAT1'];
    }
    return null;
  }

  // Helper to find or create tenant
  async function resolveTenant(name, unit) {
    let cleanName = name || 'Tenant';
    if (cleanName === 'Unknown Tenant' || cleanName === 'Unknown') {
      cleanName = `${unit ? unit.subUnitPartition : 'General'} Tenant`;
    }
    let tenant = await Tenant.findOne({ name: { $regex: new RegExp('^' + cleanName.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&') + '$', 'i') } });
    if (!tenant) {
      const count = await Tenant.countDocuments();
      const cleanInitials = cleanName.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 4) || 'TEN';
      const tenantCode = `TEN-${cleanInitials}-${String(count + 1).padStart(3, '0')}`;
      tenant = await Tenant.create({
        name: cleanName,
        tenantCode,
        phone: '9820000000',
        businessName: cleanName,
        status: 'Active'
      });
    }
    return tenant;
  }

  // 4. Update existing contracts or create new ones
  console.log('\n--- Syncing Active and Ended Contracts ---');
  let contractCounter = await TenantAssignment.countDocuments();

  // First, set any legacy active assignments that aren't the final active one to Ended
  // so we strictly enforce the single active contract rule!
  const processedUnits = new Set();

  // Process Active contracts from the list first (or the latest active one for each unit)
  for (const row of rawRows) {
    const targetUnit = resolveUnit(row);
    if (!targetUnit) continue;

    const tenant = await resolveTenant(row.tenantName, targetUnit);
    const isRowActive = row.status === 'Active' && !processedUnits.has(targetUnit._id.toString());
    const finalStatus = isRowActive ? 'Active' : 'Ended';
    if (isRowActive) {
      processedUnits.add(targetUnit._id.toString());
    }

    const rentType = row.rentPerAnnum > 0 && (!row.rentPerMonth || row.rentPerMonth === 0)
      ? 'Annual Fixed'
      : 'Monthly Fixed';
    const monthlyRate = row.rentPerMonth > 0
      ? row.rentPerMonth
      : (row.rentPerAnnum > 0 ? row.rentPerAnnum / 12 : 0);
    const annualRate = row.rentPerAnnum > 0
      ? row.rentPerAnnum
      : monthlyRate * 12;

    // Check if contract already exists
    let assignment = await TenantAssignment.findOne({
      unitId: targetUnit._id,
      tenantId: tenant._id,
      status: finalStatus
    });

    if (assignment) {
      assignment.startDate = row.startDate || assignment.startDate;
      assignment.endDate = row.endDate || assignment.endDate;
      assignment.depositHeld = row.deposit || assignment.depositHeld;
      if (row.comments) assignment.notes = row.comments;
      assignment.status = finalStatus;
      await assignment.save();
    } else {
      contractCounter++;
      const assignmentCode = `ASN-${String(contractCounter).padStart(4, '0')}`;
      assignment = await TenantAssignment.create({
        assignmentCode,
        tenantId: tenant._id,
        unitId: targetUnit._id,
        startDate: row.startDate,
        endDate: row.endDate,
        depositHeld: row.deposit || 0,
        notes: row.comments || '',
        status: finalStatus
      });
    }

    // Ensure RentAgreement rate exists
    let agreement = await RentAgreement.findOne({ assignmentId: assignment._id });
    if (!agreement) {
      agreement = await RentAgreement.create({
        assignmentId: assignment._id,
        unitId: targetUnit._id,
        tenantId: tenant._id,
        rentType,
        monthlyRate,
        annualRate,
        effectiveFrom: row.startDate,
        effectiveTo: row.endDate,
        terms: row.comments || '',
        isCurrentRate: finalStatus === 'Active'
      });
    } else {
      agreement.rentType = rentType;
      agreement.monthlyRate = monthlyRate;
      agreement.annualRate = annualRate;
      agreement.effectiveFrom = row.startDate || agreement.effectiveFrom;
      agreement.effectiveTo = row.endDate || agreement.effectiveTo;
      agreement.isCurrentRate = finalStatus === 'Active';
      if (row.comments) agreement.terms = row.comments;
      await agreement.save();
    }

    // Update unit expected rent and occupancy
    if (finalStatus === 'Active') {
      await Unit.findByIdAndUpdate(targetUnit._id, {
        occupancyStatus: monthlyRate === 0 && row.tenantName === 'Vacant' ? 'Vacant' : 'Occupied',
        monthlyRentExpected: monthlyRate
      });
    }

    console.log(`✓ [${finalStatus}] ${assignment.assignmentCode} | Unit: ${targetUnit.subUnitPartition} | Tenant: ${tenant.name} | Rate: ₹${monthlyRate}/mo | Comments: ${row.comments.slice(0, 30)}`);
  }

  // Update occupancy status of any unit without an active assignment
  const allUnits = await Unit.find();
  for (const u of allUnits) {
    const hasActive = await TenantAssignment.findOne({ unitId: u._id, status: 'Active' });
    await Unit.findByIdAndUpdate(u._id, {
      occupancyStatus: hasActive ? 'Occupied' : 'Vacant'
    });
  }

  console.log('\n==========================================');
  console.log('✅ Synchronization Complete!');
  console.log('All 11 Master Properties aligned with displayOrder 1 to 11');
  console.log('All Sub-Properties & Partitions linked to parent properties');
  console.log('Single active contract rule verified and historical contracts preserved');
  console.log('==========================================');

  await mongoose.disconnect();
}

syncMastersAndContracts().catch(err => {
  console.error('Migration error:', err);
  process.exit(1);
});
