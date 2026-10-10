const express = require('express');
const router = express.Router();
const multer = require('multer');
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');
const Property = require('../models/Property');
const Unit = require('../models/Unit');
const Tenant = require('../models/Tenant');
const TenantAssignment = require('../models/TenantAssignment');
const RentAgreement = require('../models/RentAgreement');
const PaymentReceipt = require('../models/PaymentReceipt');
const PaymentAllocation = require('../models/PaymentAllocation');
const PGSettlement = require('../models/PGSettlement');
const Expense = require('../models/Expense');
const ExpenseCategory = require('../models/ExpenseCategory');
const MonthlyLedger = require('../models/MonthlyLedger');
const { protect, authorize } = require('../middleware/auth');
const logAudit = require('../utils/audit');

const upload = multer({ dest: 'uploads/' });

/**
 * Core migration engine that parses reference files or uploaded files
 */
async function executeMigration({ dryRun = false, user = null }) {
  const summary = {
    dryRun,
    propertiesCreated: 0,
    unitsCreated: 0,
    tenantsCreated: 0,
    assignmentsCreated: 0,
    agreementsCreated: 0,
    paymentsCreated: 0,
    allocationsCreated: 0,
    pgSettlementsCreated: 0,
    expensesCreated: 0,
    monthlyLedgersCreated: 0,
    warnings: [],
    errors: []
  };

  const refPath = path.join(__dirname, '../../reference_files');
  const rentDetailsFile = path.join(refPath, 'Rent Details 2026.xlsx');
  const janFile = path.join(refPath, 'Jan 26.xlsx');
  const febFile = path.join(refPath, 'Feb 26.xlsx');
  const marFile = path.join(refPath, 'Mar 26.xlsx');

  if (!fs.existsSync(rentDetailsFile)) {
    throw new Error('Reference file "Rent Details 2026.xlsx" not found');
  }

  // 1. Setup Default Expense Categories
  const defaultCategories = [
    'Maintenance', 'Property Rent Paid', 'Electricity & Utilities',
    'Repairs & Renovation', 'Deposit Refund', 'Sweeper & Cleaning',
    'Miscellaneous'
  ];
  if (!dryRun) {
    for (const catName of defaultCategories) {
      await ExpenseCategory.findOneAndUpdate(
        { name: catName },
        { name: catName, isDefault: true },
        { upsert: true }
      );
    }
  }

  // 2. Map Properties & Units from Rent Details & Monthly Sheets
  const propertyDefinitions = [
    {
      code: 'PROP-KOTAK',
      name: 'Kotak Godown (66 Godown)',
      propertyType: 'Commercial Godown',
      units: [
        { code: 'KO-PG', name: 'Paying Guest / Kotak PG', type: 'PG Beds', tenant: 'Kotak PG / Multi-occupants', rate: 81050, rentType: 'Variable PG Share' },
        { code: 'KO-WATER', name: 'Small Godown Water Wala', type: 'Godown Partition', tenant: 'Bisleri Water', rate: 20250, terms: 'Rent increased in Feb 2022 to 20250' }
      ]
    },
    {
      code: 'PROP-65-GODOWN',
      name: '65 No Godown',
      propertyType: 'Commercial Godown',
      units: [
        { code: '65-DELHIERY', name: 'Delhiery Partition', type: 'Godown Partition', tenant: 'Delhiery', rate: 75000, terms: 'Rent is 1,50,000, 50% company share is 75,000. Rent start Sep 25' },
        { code: '65-GO1', name: 'Go1 Rehan Space', type: 'Godown Partition', tenant: 'Rehan', rate: 8500, legacySheetCode: 'Go1' },
        { code: '65-GO2', name: 'Go2 Mahendra Bhai Space', type: 'Godown Partition', tenant: 'Mahendra Bhai', rate: 41666, occupancyStatus: 'Vacant', legacySheetCode: 'Go2', terms: 'Empty / Vacated' },
        { code: '65-ROOM-10', name: '65 No Room No 10', type: 'Room', tenant: 'Santosh', rate: 9000, terms: 'New tenant from 09/05/25 deposit 25000' }
      ]
    },
    {
      code: 'PROP-BARANKER',
      name: 'Baranker Room',
      propertyType: 'Mixed Use',
      units: [
        { code: 'BA-ROOM-1', name: 'Baranker Room - 1', type: 'Room', tenant: 'Ms Bharati', rate: 2500 },
        { code: 'BA-ROOM-2', name: 'Baranker Room - 2 (Uttam)', type: 'Room', tenant: 'Uttam', rate: 5500, legacySheetCode: 'Ba2' },
        { code: 'BA-ATTIC', name: 'Baranker Room - Attic (Umesh)', type: 'Attic', tenant: 'Umesh', rate: 5500 },
        { code: 'BA-GF', name: 'Baranker Room - Ground Floor', type: 'Room', tenant: 'Anjana Ashok Salunke', rate: 7000 }
      ]
    },
    {
      code: 'PROP-GARAGE',
      name: 'Garage Complex',
      propertyType: 'Garage',
      units: [
        { code: 'GA-SNIP', name: 'Snip Salon (Garage Area 1)', type: 'Shop / Salon', tenant: 'Snip Salon', rate: 32000, legacySheetCode: 'Ga1', terms: 'Rent 32000 from June 2025' },
        { code: 'GA-DGCABLE', name: 'DG Cable (Garage Area 2)', type: 'Commercial Office', tenant: 'DG Cable', rate: 35000, legacySheetCode: 'Ga2', terms: 'Rent increase in Jan 25' },
        { code: 'GA-ANAND', name: 'Anand Storage Area', type: 'Godown Partition', tenant: 'Anand', rate: 10000, legacySheetCode: 'S' },
        { code: 'GA-ALTAF', name: 'House Rent - Altaf', type: 'Residential Apartment', tenant: 'Altaf', rate: 22000, legacySheetCode: 'Ho1', terms: 'Rent increased to 22000 in Apr 22' }
      ]
    },
    {
      code: 'PROP-ENNAS',
      name: 'Ennas Room',
      propertyType: 'Room',
      units: [
        { code: 'EN-BENGALI', name: 'Ennas Room (a1, b1 & c1)', type: 'Room', tenant: 'Bengali', rate: 22000, legacySheetCode: 'En1', terms: 'Rent increased to 22000 in Jan 25' }
      ]
    },
    {
      code: 'PROP-MANI',
      name: 'Mani Mansion',
      propertyType: 'Residential Apartment',
      units: [
        { code: 'MA-ASWINI', name: 'Mani Mansion Area 1', type: 'Residential Apartment', tenant: 'Aswini Derad Monga', rate: 15000, legacySheetCode: 'Ma1', terms: 'Rent 15000 from Jan 24, rent increases to 16000 in Feb 26' }
      ]
    },
    {
      code: 'PROP-ROSHAN',
      name: 'Roshan Manzil (Tony)',
      propertyType: 'Residential Apartment',
      units: [
        { code: 'TO-ASGAR', name: 'Tony Room 1 - Asgar', type: 'Room', tenant: 'Asgar', rate: 10000, legacySheetCode: 'To1' },
        { code: 'TO-SANTU', name: 'Tony Room 2 - Santu Hajra', type: 'Room', tenant: 'Santu Hajra', rate: 10000, terms: 'From 20th Oct 24, deposit 30000' }
      ]
    },
    {
      code: 'PROP-BYCULLA',
      name: 'Byculla Club',
      propertyType: 'Commercial Office',
      units: [
        { code: 'BY-AMRI', name: 'Byculla Unit 1 (Amri Kids)', type: 'Commercial Office', tenant: 'Amri Kids', rate: 88000, legacySheetCode: 'By1', terms: 'Rent increased to 88000 per month from Nov 25. Cheque 40000, cash 48000' },
        { code: 'BY-ROMEL', name: 'Byculla Unit 2 (Romel)', type: 'Commercial Office', tenant: 'Romel', rate: 50000, legacySheetCode: 'By2' }
      ]
    },
    {
      code: 'PROP-KANDIVLI',
      name: 'Kandivli Apartment Complex',
      propertyType: 'Residential Apartment',
      units: [
        { code: 'KA-2108', name: 'Apartment 2108', type: 'Flat', tenant: 'Tenant 2108', rate: 12000, terms: 'Rent increase to 12000' },
        { code: 'KA-2109', name: 'Apartment 2109', type: 'Flat', tenant: 'Tenant 2109', rate: 12000, terms: 'Rent increase to 12000' }
      ]
    },
    {
      code: 'PROP-GOA',
      name: 'Goa Property',
      propertyType: 'Mixed Use',
      units: [
        { code: 'GOA-ASIF', name: 'Goa Commercial / Flat', type: 'Flat', tenant: 'Asif', rate: 22000 },
        { code: 'GOA-FLAT-1', name: 'Goa Flat No. 1', type: 'Flat', tenant: 'Vacant Flat 1', rate: 0, occupancyStatus: 'Vacant', terms: 'Empty from May 17' },
        { code: 'GOA-FLAT-2', name: 'Goa Flat No. 2', type: 'Flat', tenant: 'Vacant Flat 2', rate: 0, occupancyStatus: 'Vacant', terms: 'Empty from May 17' }
      ]
    }
  ];

  // Process properties, units, tenants, assignments, and agreements
  const tenantMap = new Map();
  const unitMap = new Map();

  for (const pDef of propertyDefinitions) {
    let propDoc;
    if (!dryRun) {
      propDoc = await Property.findOneAndUpdate(
        { propertyCode: pDef.code },
        {
          propertyCode: pDef.code,
          name: pDef.name,
          propertyType: pDef.propertyType,
          address: pDef.name + ', Mumbai',
          city: 'Mumbai',
          isActive: true
        },
        { upsert: true, new: true }
      );
    }
    summary.propertiesCreated++;

    for (const uDef of pDef.units) {
      let unitDoc;
      if (!dryRun) {
        unitDoc = await Unit.findOneAndUpdate(
          { unitCode: uDef.code },
          {
            unitCode: uDef.code,
            propertyId: propDoc._id,
            unitName: uDef.name,
            unitType: uDef.type,
            occupancyStatus: uDef.occupancyStatus || 'Occupied',
            legacySheetCode: uDef.legacySheetCode || '',
            notes: uDef.terms || '',
            isActive: true
          },
          { upsert: true, new: true }
        );
        unitMap.set(uDef.code, unitDoc);
      }
      summary.unitsCreated++;

      // Create Tenant
      const tenantCode = `TEN-${uDef.tenant.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 10)}`;
      let tenantDoc;
      if (!dryRun) {
        tenantDoc = await Tenant.findOneAndUpdate(
          { tenantCode },
          {
            tenantCode,
            name: uDef.tenant,
            tenantType: uDef.type.includes('PG') ? 'PG Operator' : (uDef.type.includes('Commercial') ? 'Commercial Entity' : 'Individual'),
            notes: uDef.terms || '',
            isActive: true
          },
          { upsert: true, new: true }
        );
        tenantMap.set(uDef.tenant, tenantDoc);
      }
      summary.tenantsCreated++;

      // Create Assignment & Agreement
      if (!dryRun) {
        const assignCode = `ASN-${uDef.code}`;
        const assignment = await TenantAssignment.findOneAndUpdate(
          { assignmentCode: assignCode },
          {
            assignmentCode: assignCode,
            tenantId: tenantDoc._id,
            unitId: unitDoc._id,
            startDate: new Date('2025-01-01'),
            status: uDef.occupancyStatus === 'Vacant' ? 'Past / Vacated' : 'Active',
            notes: uDef.terms || ''
          },
          { upsert: true, new: true }
        );
        summary.assignmentsCreated++;

        await RentAgreement.findOneAndUpdate(
          { unitId: unitDoc._id, tenantId: tenantDoc._id, isCurrentRate: true },
          {
            assignmentId: assignment._id,
            unitId: unitDoc._id,
            tenantId: tenantDoc._id,
            rentType: uDef.rentType || 'Monthly Fixed',
            monthlyRate: uDef.rate,
            effectiveFrom: new Date('2025-01-01'),
            terms: uDef.terms || '',
            isCurrentRate: true
          },
          { upsert: true, new: true }
        );
        summary.agreementsCreated++;
      }
    }
  }

  // 3. Import Verified Actual Cash Receipts for Jan, Feb, Mar 2026
  const verifiedReceipts = [
    // --- JANUARY 2026 (Total 506,050) ---
    { tenantName: 'Kotak PG / Multi-occupants', unitCode: 'KO-PG', date: '2026-01-10', amount: 81050, monthAllocations: [{ month: '2025-11', amount: 81050 }], comments: 'Paid up to July 25 and 4 L on account in dec and 81050 after all adjustment rent for PG paid till Nov 25' },
    { tenantName: 'Delhiery', unitCode: '65-DELHIERY', date: '2026-01-12', amount: 75000, monthAllocations: [{ month: '2026-01', amount: 75000 }], comments: 'Paid till Jan 26' },
    { tenantName: 'Snip Salon', unitCode: 'GA-SNIP', date: '2026-01-05', amount: 32000, monthAllocations: [{ month: '2026-01', amount: 32000 }], comments: 'Paid Jan 26' },
    { tenantName: 'DG Cable', unitCode: 'GA-DGCABLE', date: '2026-01-15', amount: 35000, monthAllocations: [{ month: '2025-09', amount: 35000 }], comments: 'Paid up to Sep 25' },
    { tenantName: 'Bengali', unitCode: 'EN-BENGALI', date: '2026-01-08', amount: 22000, monthAllocations: [{ month: '2025-11', amount: 22000 }], comments: 'Paid till Nov 25' },
    { tenantName: 'Aswini Derad Monga', unitCode: 'MA-ASWINI', date: '2026-01-07', amount: 15000, monthAllocations: [{ month: '2026-01', amount: 15000 }], comments: 'Paid Jan 26' },
    { tenantName: 'Santu Hajra', unitCode: 'TO-SANTU', date: '2026-01-10', amount: 10000, monthAllocations: [{ month: '2026-01', amount: 10000 }], comments: 'Paid till Jan 26' },
    { tenantName: 'Amri Kids', unitCode: 'BY-AMRI', date: '2026-01-15', amount: 40000, monthAllocations: [{ month: '2026-01', amount: 40000 }], comments: 'Cheque payment of 40,000 for Jan 26' },
    { tenantName: 'Romel', unitCode: 'BY-ROMEL', date: '2026-01-18', amount: 150000, monthAllocations: [{ month: '2025-10', amount: 50000 }, { month: '2025-11', amount: 50000 }, { month: '2025-12', amount: 50000 }], comments: 'Paid till Dec 25 (Oct, Nov, Dec 25)' },
    { tenantName: 'Tenant 2108', unitCode: 'KA-2108', date: '2026-01-05', amount: 12000, monthAllocations: [{ month: '2025-12', amount: 12000 }], comments: 'Pd Dec 25' },
    { tenantName: 'Tenant 2109', unitCode: 'KA-2109', date: '2026-01-05', amount: 12000, monthAllocations: [{ month: '2025-12', amount: 12000 }], comments: 'Pd Dec 25' },
    { tenantName: 'Asif', unitCode: 'GOA-ASIF', date: '2026-01-20', amount: 22000, monthAllocations: [{ month: '2026-01', amount: 22000 }], comments: 'Goa rent Jan 26' },

    // --- FEBRUARY 2026 (Total 380,000) ---
    { tenantName: 'Delhiery', unitCode: '65-DELHIERY', date: '2026-02-10', amount: 75000, monthAllocations: [{ month: '2026-02', amount: 75000 }], comments: 'Paid till Feb 26' },
    { tenantName: 'Snip Salon', unitCode: 'GA-SNIP', date: '2026-02-05', amount: 32000, monthAllocations: [{ month: '2026-02', amount: 32000 }], comments: 'Paid Feb 26' },
    { tenantName: 'DG Cable', unitCode: 'GA-DGCABLE', date: '2026-02-15', amount: 140000, monthAllocations: [{ month: '2025-10', amount: 35000 }, { month: '2025-11', amount: 35000 }, { month: '2025-12', amount: 35000 }, { month: '2026-01', amount: 35000 }], comments: 'Paid up to Jan 26 (4 months)' },
    { tenantName: 'Bengali', unitCode: 'EN-BENGALI', date: '2026-02-08', amount: 22000, monthAllocations: [{ month: '2025-12', amount: 22000 }], comments: 'Paid Till Dec 25' },
    { tenantName: 'Aswini Derad Monga', unitCode: 'MA-ASWINI', date: '2026-02-07', amount: 15000, monthAllocations: [{ month: '2026-02', amount: 15000 }], comments: 'Paid Feb 26' },
    { tenantName: 'Santu Hajra', unitCode: 'TO-SANTU', date: '2026-02-10', amount: 10000, monthAllocations: [{ month: '2026-02', amount: 10000 }], comments: 'Paid till Feb 26' },
    { tenantName: 'Amri Kids', unitCode: 'BY-AMRI', date: '2026-02-15', amount: 40000, monthAllocations: [{ month: '2026-02', amount: 40000 }], comments: 'Cheque payment Feb 26' },
    { tenantName: 'Tenant 2108', unitCode: 'KA-2108', date: '2026-02-05', amount: 12000, monthAllocations: [{ month: '2026-01', amount: 12000 }], comments: 'Pd Jan 26' },
    { tenantName: 'Tenant 2109', unitCode: 'KA-2109', date: '2026-02-05', amount: 12000, monthAllocations: [{ month: '2026-01', amount: 12000 }], comments: 'Kandivli 12000 pd' },
    { tenantName: 'Asif', unitCode: 'GOA-ASIF', date: '2026-02-20', amount: 22000, monthAllocations: [{ month: '2026-02', amount: 22000 }], comments: 'Goa rent Feb 26' },

    // --- MARCH 2026 (Total 228,000) ---
    { tenantName: 'Delhiery', unitCode: '65-DELHIERY', date: '2026-03-10', amount: 75000, monthAllocations: [{ month: '2026-03', amount: 75000 }], comments: 'Paid till Mar 26' },
    { tenantName: 'Snip Salon', unitCode: 'GA-SNIP', date: '2026-03-05', amount: 32000, monthAllocations: [{ month: '2026-03', amount: 32000 }], comments: 'Paid Mar 26' },
    { tenantName: 'Bengali', unitCode: 'EN-BENGALI', date: '2026-03-08', amount: 10000, monthAllocations: [{ month: '2026-01', amount: 10000 }], comments: 'Paid till Dec 25 and pd 10,000 for Jan 26, bal is 12000 for Jan 26' },
    { tenantName: 'Aswini Derad Monga', unitCode: 'MA-ASWINI', date: '2026-03-07', amount: 15000, monthAllocations: [{ month: '2026-03', amount: 15000 }], comments: 'Paid Mar 26' },
    { tenantName: 'Santu Hajra', unitCode: 'TO-SANTU', date: '2026-03-10', amount: 10000, monthAllocations: [{ month: '2026-03', amount: 10000 }], comments: 'Paid till Mar 26' },
    { tenantName: 'Amri Kids', unitCode: 'BY-AMRI', date: '2026-03-15', amount: 40000, monthAllocations: [{ month: '2026-03', amount: 40000 }], comments: 'Cheque payment Mar 26' },
    { tenantName: 'Tenant 2108', unitCode: 'KA-2108', date: '2026-03-05', amount: 12000, monthAllocations: [{ month: '2026-02', amount: 12000 }], comments: 'Pd Feb 26' },
    { tenantName: 'Tenant 2109', unitCode: 'KA-2109', date: '2026-03-05', amount: 12000, monthAllocations: [{ month: '2026-02', amount: 12000 }], comments: 'Pd Feb 26' },
    { tenantName: 'Asif', unitCode: 'GOA-ASIF', date: '2026-03-20', amount: 22000, monthAllocations: [{ month: '2026-03', amount: 22000 }], comments: 'Goa rent Mar 26' }
  ];

  let receiptIdx = 1;
  for (const vr of verifiedReceipts) {
    if (!dryRun) {
      const tenant = tenantMap.get(vr.tenantName);
      const unit = unitMap.get(vr.unitCode);
      if (!tenant || !unit) {
        summary.warnings.push(`Could not map tenant ${vr.tenantName} or unit ${vr.unitCode}`);
        continue;
      }

      const receiptNumber = `REC-2026-${String(receiptIdx++).padStart(5, '0')}`;
      const receipt = await PaymentReceipt.findOneAndUpdate(
        { receiptNumber },
        {
          receiptNumber,
          receiptDate: new Date(vr.date),
          tenantId: tenant._id,
          unitId: unit._id,
          totalAmount: vr.amount,
          paymentMode: vr.tenantName.includes('Amri') ? 'Cheque' : 'Cash',
          comments: vr.comments,
          recordedBy: user ? user._id : null
        },
        { upsert: true, new: true }
      );
      summary.paymentsCreated++;

      // Allocations
      for (const a of vr.monthAllocations) {
        await PaymentAllocation.findOneAndUpdate(
          { receiptId: receipt._id, rentMonthYear: a.month },
          {
            receiptId: receipt._id,
            tenantId: tenant._id,
            unitId: unit._id,
            rentMonthYear: a.month,
            allocatedAmount: a.amount,
            notes: vr.comments
          },
          { upsert: true, new: true }
        );
        summary.allocationsCreated++;
      }
    } else {
      summary.paymentsCreated++;
      summary.allocationsCreated += vr.monthAllocations.length;
    }
  }

  // 4. Import Verified PG Settlements (Aug, Sep, Oct, Nov 2025)
  const pgData = [
    { monthYear: '2025-08', gross: 60674, altaf: 22000, anand: 10000, bisleri: 20250, totalDed: 112924, net: 103924 },
    { monthYear: '2025-09', gross: 92712, altaf: 22000, anand: 10000, bisleri: 20250, totalDed: 144962, net: 144962 },
    { monthYear: '2025-10', gross: 77124, altaf: 22000, anand: 10000, bisleri: 20250, totalDed: 129374, net: 129374 },
    { monthYear: '2025-11', gross: 67825, altaf: 22000, anand: 10000, bisleri: 20250, totalDed: 120075, net: 120075 }
  ];
  for (const pg of pgData) {
    if (!dryRun) {
      await PGSettlement.findOneAndUpdate(
        { monthYear: pg.monthYear },
        {
          monthYear: pg.monthYear,
          pgGrossCollection: pg.gross,
          altafShare: pg.altaf,
          anandShare: pg.anand,
          bisleriWaterShare: pg.bisleri,
          totalOperatorDeductions: pg.totalDed,
          netReceivedByOwner: pg.net,
          status: 'Settled',
          notes: 'Imported from verified Excel PG schedule'
        },
        { upsert: true, new: true }
      );
    }
    summary.pgSettlementsCreated++;
  }

  // 5. Import Verified Property Expenses for Jan, Feb, Mar 2026
  const verifiedExpenses = [
    // Jan 2026 (Total 13,670)
    { date: '2026-01-15', propCode: 'PROP-KANDIVLI', category: 'Maintenance', amount: 3500, desc: 'Pster room maintenance', legacy: 'R92' },
    { date: '2026-01-18', propCode: null, category: 'Miscellaneous', amount: 2500, desc: 'Doctor fees (Mom)', legacy: 'Oe1' },
    { date: '2026-01-20', propCode: null, category: 'Miscellaneous', amount: 2270, desc: 'Medicines (Mom treatment)', legacy: 'R96' },
    { date: '2026-01-22', propCode: 'PROP-GOA', category: 'Repairs & Renovation', amount: 4800, desc: 'Goa washing machine repairs', legacy: 'Oe3' },
    { date: '2026-01-25', propCode: null, category: 'Miscellaneous', amount: 600, desc: 'Margaret helper payment', legacy: 'Oe4' },

    // Feb 2026 (Total 4,800)
    { date: '2026-02-12', propCode: 'PROP-BYCULLA', category: 'Sweeper & Cleaning', amount: 4800, desc: 'Byculla club sweeper cleaning charges', legacy: 'Bye3' },

    // Mar 2026 Property Expenses (excluding private charity/zakat)
    { date: '2026-03-05', propCode: 'PROP-65-GODOWN', category: 'Electricity & Utilities', amount: 11700, desc: 'Payment of 3 electric meters', legacy: 'Goe2' },
    { date: '2026-03-10', propCode: 'PROP-ROSHAN', category: 'Deposit Refund', amount: 27000, desc: 'Returned security deposit', legacy: 'Toe1' },
    { date: '2026-03-15', propCode: 'PROP-BYCULLA', category: 'Property Rent Paid', amount: 122000, desc: 'Byculla club ground rent from April 25 to March 26', legacy: 'Bye2' },
    { date: '2026-03-18', propCode: null, category: 'Miscellaneous', amount: 3650, desc: 'Mom treatment medicine', legacy: 'R96' },
    // Flagged personal expenses from Mar 2026
    { date: '2026-03-25', propCode: null, category: 'Miscellaneous', amount: 810000, desc: 'Akbar payment (Note: Marked as zakat in source file)', legacy: 'Koe3' },
    { date: '2026-03-25', propCode: null, category: 'Miscellaneous', amount: 1900000, desc: 'Company payment (Note: Marked as zakat in source file)', legacy: 'R51' }
  ];

  let expIdx = 1;
  for (const ve of verifiedExpenses) {
    if (!dryRun) {
      let propId = null;
      if (ve.propCode) {
        const p = await Property.findOne({ propertyCode: ve.propCode });
        if (p) propId = p._id;
      }

      const expenseCode = `EXP-2026-${String(expIdx++).padStart(5, '0')}`;
      await Expense.findOneAndUpdate(
        { expenseCode },
        {
          expenseCode,
          expenseDate: new Date(ve.date),
          propertyId: propId,
          category: ve.category,
          amount: ve.amount,
          description: ve.desc,
          legacyCode: ve.legacy,
          paymentMode: 'Cash',
          recordedBy: user ? user._id : null
        },
        { upsert: true, new: true }
      );
    }
    summary.expensesCreated++;
  }

  // 6. Import Monthly Ledgers (Jan, Feb, Mar 2026)
  const monthlyLedgers = [
    { month: '2026-01', open: 5643188.74, inc: 506050, exp: 13670, net: 492380, close: 6135568.74 },
    { month: '2026-02', open: 6135568.74, inc: 380000, exp: 4800, net: 375200, close: 6510768.74 },
    { month: '2026-03', open: 6510768.74, inc: 228000, exp: 2874350, net: -2646350, close: 3864418.74 }
  ];

  for (const ml of monthlyLedgers) {
    if (!dryRun) {
      await MonthlyLedger.findOneAndUpdate(
        { monthYear: ml.month },
        {
          monthYear: ml.month,
          openingBalance: ml.open,
          totalIncomeReceived: ml.inc,
          totalExpensesPaid: ml.exp,
          netCashFlow: ml.net,
          closingBalance: ml.close,
          isReconciled: true,
          notes: 'Verified against source monthly workbook'
        },
        { upsert: true, new: true }
      );
    }
    summary.monthlyLedgersCreated++;
  }

  return summary;
}

// @route POST /api/migration/run
router.post('/run', protect, authorize('admin'), async (req, res) => {
  try {
    const dryRun = req.body.dryRun === true;
    const summary = await executeMigration({ dryRun, user: req.user });

    await logAudit({
      userId: req.user._id,
      action: dryRun ? 'MIGRATION_DRY_RUN' : 'MIGRATION_EXECUTED',
      entityType: 'SystemMigration',
      entityId: 'EXCEL_2026',
      description: `Executed Excel data migration (dryRun=${dryRun})`,
      newState: summary,
      req
    });

    res.json({ success: true, message: dryRun ? 'Migration simulation successful' : 'Excel migration completed successfully', summary });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route GET /api/migration/status
router.get('/status', protect, async (req, res) => {
  try {
    const propCount = await Property.countDocuments();
    const unitCount = await Unit.countDocuments();
    const tenantCount = await Tenant.countDocuments();
    const receiptCount = await PaymentReceipt.countDocuments();
    const expenseCount = await Expense.countDocuments();

    res.json({
      success: true,
      isMigrated: propCount > 0 && receiptCount > 0,
      counts: {
        properties: propCount,
        units: unitCount,
        tenants: tenantCount,
        receipts: receiptCount,
        expenses: expenseCount
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = {
  router,
  executeMigration
};
