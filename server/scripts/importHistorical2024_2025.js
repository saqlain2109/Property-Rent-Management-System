const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const Property = require('../models/Property');
const Unit = require('../models/Unit');
const Tenant = require('../models/Tenant');
const TenantAssignment = require('../models/TenantAssignment');
const RentAgreement = require('../models/RentAgreement');
const PaymentReceipt = require('../models/PaymentReceipt');
const PaymentAllocation = require('../models/PaymentAllocation');
const Expense = require('../models/Expense');
const MonthlyLedger = require('../models/MonthlyLedger');
const { syncMonthlyLedgers } = require('../utils/ledgerSync');

async function importHistorical() {
  try {
    if (mongoose.connection.readyState !== 1) {
      const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/property_rent_db';
      await mongoose.connect(mongoUri);
      console.log('[Import] Connected to MongoDB.');
    }

    // 1. Ensure 12th property "Other Income & Loans" exists for accounting parity
    let otherProp = await Property.findOne({ propertyCode: 'PROP-OTHER' });
    if (!otherProp) {
      otherProp = await Property.create({
        name: 'Other Income & Financing',
        propertyCode: 'PROP-OTHER',
        propertyType: 'Mixed Use',
        address: 'Portfolio Accounts',
        displayOrder: 12,
        carpetAreaSqFt: 0,
        areaSqFt: 0
      });
      console.log('[Property] Created Property #12: Other Income & Financing');
    }

    // Units for Other Income & Financing
    let otherIncomeUnit = await Unit.findOne({ unitCode: 'OTH-INCOME' });
    if (!otherIncomeUnit) {
      otherIncomeUnit = await Unit.create({
        propertyId: otherProp._id,
        unitName: 'Other Income',
        unitNumber: 'OTH-INCOME',
        unitCode: 'OTH-INCOME',
        subUnitPartition: 'Other Income',
        unitType: 'Mixed Use',
        displayOrder: 12,
        occupancyStatus: 'Occupied'
      });
    }

    let otherLoanUnit = await Unit.findOne({ unitCode: 'OTH-LOAN' });
    if (!otherLoanUnit) {
      otherLoanUnit = await Unit.create({
        propertyId: otherProp._id,
        unitName: 'Loan Received',
        unitNumber: 'OTH-LOAN',
        unitCode: 'OTH-LOAN',
        subUnitPartition: 'Loan Received',
        unitType: 'Mixed Use',
        displayOrder: 12,
        occupancyStatus: 'Occupied'
      });
    }

    // 2. Fetch properties and units map
    const props = await Property.find();
    const propMap = {};
    props.forEach(p => {
      propMap[p.propertyCode] = p;
      propMap[p.name.toLowerCase()] = p;
    });

    const units = await Unit.find().populate('propertyId');
    const unitByCode = {};
    units.forEach(u => {
      unitByCode[u.unitCode] = u;
    });

    // 3. Helper to find or create Tenant
    async function getOrCreateTenant(tName) {
      let tenant = await Tenant.findOne({ name: tName });
      if (!tenant) {
        let baseCode = 'TEN-' + (tName.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 10) || 'USER');
        let code = baseCode;
        let c = 1;
        while (await Tenant.findOne({ tenantCode: code })) {
          code = `${baseCode.slice(0, 8)}-${c++}`;
        }
        tenant = await Tenant.create({
          tenantCode: code,
          name: tName,
          status: 'Active'
        });
        console.log(`[Tenant] Created tenant: ${tName} (${code})`);
      }
      return tenant;
    }

    // Pre-create required tenants
    const tenantNames = [
      'PG',
      'Water Wala',
      'Mahendra Bhai',
      'Alka Industry',
      'Uttam',
      'Anjana Ashok Salunke',
      'Baranker Room Tenant',
      'Santosh',
      'Kamlesh',
      'Snip - Irfan Ansari',
      'DG Cable',
      'Anand',
      'Altaf',
      'Garage Commercial Tenant',
      'Bengali',
      'Aswini Derad Monga',
      'Vinay Singh',
      'Amir Kids',
      'Romel',
      'Tenant 2108 (Fatu)',
      'Tenant 2109',
      'Other Income Financing',
      'Loan Creditor'
    ];
    const tenantMap = {};
    for (const name of tenantNames) {
      tenantMap[name] = await getOrCreateTenant(name);
    }

    // 4. Clean previous 2024-2025 receipts & allocations to ensure idempotence
    console.log('[Cleanup] Removing previous 2024-2025 receipts & expenses...');
    const dStart = new Date(Date.UTC(2024, 2, 1, 0, 0, 0));
    const dEnd = new Date(Date.UTC(2025, 2, 0, 23, 59, 59, 999));

    const oldReceipts = await PaymentReceipt.find({
      receiptDate: { $gte: dStart, $lte: dEnd }
    });
    const oldRIds = oldReceipts.map(r => r._id);
    await PaymentAllocation.deleteMany({ receiptId: { $in: oldRIds } });
    await PaymentReceipt.deleteMany({ _id: { $in: oldRIds } });

    await Expense.deleteMany({
      expenseDate: { $gte: dStart, $lte: dEnd }
    });

    console.log(`[Cleanup] Removed ${oldRIds.length} old historical receipts and expenses.`);

    // 5. Ingest Rent Receipts
    // Array of { month, unitCode, tenantName, amount, notes }
    const months = [
      '2024-03', '2024-04', '2024-05', '2024-06',
      '2024-07', '2024-08', '2024-09', '2024-10',
      '2024-11', '2024-12', '2025-01', '2025-02'
    ];

    const rentRecords = [];

    // Kotak Godaown -> PG
    const pgAmounts = [81561, 110462, 0, 0, 225573, 79452, 0, 0, 0, 0, 200000, 179576];
    pgAmounts.forEach((amt, i) => {
      if (amt > 0) rentRecords.push({ month: months[i], unitCode: 'KO-PG', tenantName: 'PG', amount: amt, notes: 'Kotak PG Rent' });
    });

    // Kotak Godaown -> Water Wala
    const waterAmounts = [20250, 20250, 0, 0, 60750, 20250, 0, 0, 0, 0, 0, 60750];
    waterAmounts.forEach((amt, i) => {
      if (amt > 0) rentRecords.push({ month: months[i], unitCode: 'KO-SMALL', tenantName: 'Water Wala', amount: amt, notes: 'Small Godown Water Wala' });
    });

    // 65 no godown -> Mahendra Bhai
    const mahendraAmounts = [100000, 100000, 0, 100000, 0, 100000, 0, 0, 0, 0, 0, 0];
    mahendraAmounts.forEach((amt, i) => {
      if (amt > 0) rentRecords.push({ month: months[i], unitCode: '65-LARGE', tenantName: 'Mahendra Bhai', amount: amt, notes: '65 Large Godown Mahendra Bhai' });
    });

    // 65 no godown -> Alka Industry
    const alkaAmounts = [0, 0, 0, 0, 41000, 25000, 0, 0, 0, 0, 0, 0];
    alkaAmounts.forEach((amt, i) => {
      if (amt > 0) rentRecords.push({ month: months[i], unitCode: '65-SMALL', tenantName: 'Alka Industry', amount: amt, notes: '65 Small Godown Alka Industry' });
    });

    // Baranker room -> Baranker room standalone
    rentRecords.push({ month: '2024-03', unitCode: 'BAR-1ST', tenantName: 'Baranker Room Tenant', amount: 20000, notes: 'Baranker room direct receipt' });

    // Baranker room -> Uttam
    const uttamAmounts = [1650, 0, 16500, 0, 16500, 0, 0, 16500, 0, 11000, 0, 5500];
    uttamAmounts.forEach((amt, i) => {
      if (amt > 0) rentRecords.push({ month: months[i], unitCode: 'BAR-MEZZ', tenantName: 'Uttam', amount: amt, notes: 'Baranker Mezzanine Uttam' });
    });

    // Baranker room -> Attic-ANJANA ashok salunke (7000 each month)
    months.forEach(m => {
      rentRecords.push({ month: m, unitCode: 'BAR-1ST', tenantName: 'Anjana Ashok Salunke', amount: 7000, notes: '1st Floor Anjana Ashok Salunke' });
    });

    // Room no 10 in 65 -> Santosh (Oct 24 to Feb 25: 10000 each)
    ['2024-10', '2024-11', '2024-12', '2025-01', '2025-02'].forEach(m => {
      rentRecords.push({ month: m, unitCode: 'ROOM-10', tenantName: 'Santosh', amount: 10000, notes: 'Room 10 Santosh' });
    });

    // Room no 10 in 65 -> Kamlesh (Apr 24: 40000, May to Sep 24: 10000 each)
    rentRecords.push({ month: '2024-04', unitCode: 'ROOM-10', tenantName: 'Kamlesh', amount: 40000, notes: 'Room 10 Kamlesh (4 months rent)' });
    ['2024-05', '2024-06', '2024-07', '2024-08', '2024-09'].forEach(m => {
      rentRecords.push({ month: m, unitCode: 'ROOM-10', tenantName: 'Kamlesh', amount: 10000, notes: 'Room 10 Kamlesh' });
    });

    // Garage -> Garage standalone (2024-06: 30000, 2024-07: 30000)
    rentRecords.push({ month: '2024-06', unitCode: 'GA-SHOP1', tenantName: 'Garage Commercial Tenant', amount: 30000, notes: 'Garage commercial rent' });
    rentRecords.push({ month: '2024-07', unitCode: 'GA-SHOP1', tenantName: 'Garage Commercial Tenant', amount: 30000, notes: 'Garage commercial rent' });

    // Garage -> Snip (30000 in 11 months, except 2024-07)
    months.forEach(m => {
      if (m !== '2024-07') {
        rentRecords.push({ month: m, unitCode: 'GA-SHOP2', tenantName: 'Snip - Irfan Ansari', amount: 30000, notes: 'Shop 2 Snip Salon' });
      }
    });

    // Garage -> DG Cable
    const dgAmounts = [30000, 30000, 30000, 0, 0, 60000, 60000, 0, 35000, 35000, 70000, 0];
    dgAmounts.forEach((amt, i) => {
      if (amt > 0) rentRecords.push({ month: months[i], unitCode: 'GA-SHOP1', tenantName: 'DG Cable', amount: amt, notes: 'Shop 1 DG Cable' });
    });

    // Garage -> Anand
    const anandAmounts = [10000, 10000, 0, 0, 30000, 10000, 0, 0, 0, 0, 0, 30000];
    anandAmounts.forEach((amt, i) => {
      if (amt > 0) rentRecords.push({ month: months[i], unitCode: 'GA-GODOWN', tenantName: 'Anand', amount: amt, notes: 'Godown Anand' });
    });

    // Garage -> 2nd Floor House Altaf
    const altafAmounts = [22000, 22000, 0, 0, 66000, 22000, 0, 0, 0, 0, 0, 66000];
    altafAmounts.forEach((amt, i) => {
      if (amt > 0) rentRecords.push({ month: months[i], unitCode: 'GA-CHIRA', tenantName: 'Altaf', amount: amt, notes: 'Chira Bazar House Altaf' });
    });

    // Ennas Room -> Bengali
    const bengaliAmounts = [20000, 20000, 20000, 20000, 0, 40000, 20000, 30000, 20000, 20000, 20000, 20000];
    bengaliAmounts.forEach((amt, i) => {
      if (amt > 0) rentRecords.push({ month: months[i], unitCode: 'ENNAS-RM', tenantName: 'Bengali', amount: amt, notes: 'Ennas Room Bengali' });
    });

    // Mani mansion -> Aswini Derad Monga (15000 each month)
    months.forEach(m => {
      rentRecords.push({ month: m, unitCode: 'MANI-RM1', tenantName: 'Aswini Derad Monga', amount: 15000, notes: 'Mani Mansion Room 1 Aswini' });
    });

    // Tonys room -> Vinay Singh
    const vinayAmounts = [9000, 0, 9000, 9000, 9000, 0, 70000, 0, 0, 30000, 20000, 10000];
    vinayAmounts.forEach((amt, i) => {
      if (amt > 0) rentRecords.push({ month: months[i], unitCode: 'TONY-RM2', tenantName: 'Vinay Singh', amount: amt, notes: 'Tony Room 2 Vinay Singh' });
    });

    // Buyculla Club -> First Floor Amir Kids (80000 each month)
    months.forEach(m => {
      rentRecords.push({ month: m, unitCode: 'BY-1ST', tenantName: 'Amir Kids', amount: 80000, notes: '1st Floor Amir Kids' });
    });

    // Buyculla Club -> Attic Romel
    const romelAmounts = [0, 0, 150000, 150000, 0, 0, 150000, 0, 0, 0, 150000, 0];
    romelAmounts.forEach((amt, i) => {
      if (amt > 0) rentRecords.push({ month: months[i], unitCode: 'BY-MEZZ', tenantName: 'Romel', amount: amt, notes: 'Mezzanine Romel' });
    });

    // Kandivili -> Flat No 2108 (11000 in Mar/Apr 24, 12000 thereafter)
    months.forEach(m => {
      const amt = (m === '2024-03' || m === '2024-04') ? 11000 : 12000;
      rentRecords.push({ month: m, unitCode: 'KAND-2108', tenantName: 'Tenant 2108 (Fatu)', amount: amt, notes: 'Flat 2108' });
    });

    // Kandivili -> Flat No 2109 (11000 in Mar/Apr 24, 12000 thereafter)
    months.forEach(m => {
      const amt = (m === '2024-03' || m === '2024-04') ? 11000 : 12000;
      rentRecords.push({ month: m, unitCode: 'KAND-2109', tenantName: 'Tenant 2109', amount: amt, notes: 'Flat 2109' });
    });

    // Other Income & Loans
    rentRecords.push({ month: '2024-04', unitCode: 'OTH-INCOME', tenantName: 'Other Income Financing', amount: 1323000, notes: 'Other Income' });
    rentRecords.push({ month: '2024-09', unitCode: 'OTH-LOAN', tenantName: 'Loan Creditor', amount: 500000, notes: 'Loan received' });
    rentRecords.push({ month: '2024-12', unitCode: 'OTH-LOAN', tenantName: 'Loan Creditor', amount: 400000, notes: 'Loan received' });
    rentRecords.push({ month: '2025-01', unitCode: 'OTH-LOAN', tenantName: 'Loan Creditor', amount: 500000, notes: 'Loan received' });

    console.log(`[Rent] Inserting ${rentRecords.length} historical rent payment receipts...`);
    let rIdx = 100;
    for (const r of rentRecords) {
      const u = unitByCode[r.unitCode];
      const t = tenantMap[r.tenantName] || await getOrCreateTenant(r.tenantName);
      if (!u || !t) {
        console.error('Missing unit or tenant for:', r.unitCode, r.tenantName);
        continue;
      }

      const receiptNumber = `REC-${r.month.replace('-', '')}-${String(rIdx++).padStart(4, '0')}`;
      const [y, m] = r.month.split('-').map(Number);
      const receiptDate = new Date(Date.UTC(y, m - 1, 10));

      const receipt = await PaymentReceipt.create({
        receiptNumber,
        receiptDate,
        tenantId: t._id,
        unitId: u._id,
        totalAmount: r.amount,
        paymentMode: 'Bank Transfer / NEFT / RTGS',
        comments: r.notes
      });

      await PaymentAllocation.create({
        receiptId: receipt._id,
        tenantId: t._id,
        unitId: u._id,
        rentMonthYear: r.month,
        allocatedAmount: r.amount,
        notes: r.notes
      });
    }

    console.log(`[Rent] Inserted ${rentRecords.length} receipts successfully.`);

    // 6. Ingest Expenses
    const expenseList = [
      // Kotak Godaown
      { propCode: 'PROP-KOTAK', cat: 'Property Rent Paid', amount: 174512, month: '2024-12', desc: 'Rent for Kotak Godown' },
      { propCode: 'PROP-KOTAK', cat: 'Maintenance', amount: 273535, month: '2025-01', desc: 'Maintainance Kotak Godown' },

      // 65 Godown
      { propCode: 'PROP-65-GODOWN', cat: 'Miscellaneous', amount: 3000, month: '2024-04', desc: 'Other expenses 65 Godown' },
      { propCode: 'PROP-65-GODOWN', cat: 'Maintenance', amount: 2800, month: '2024-06', desc: 'Maintainance 65 Godown, Barankar' },
      { propCode: 'PROP-65-GODOWN', cat: 'Miscellaneous', amount: 14772, month: '2024-12', desc: 'Other expenses 65 Godown' },

      // Garage
      { propCode: 'PROP-GARAGE', cat: 'Electricity & Utilities', amount: 15000, month: '2024-06', desc: 'Electricity for Garage snip' },

      // Goa Flat
      { propCode: 'PROP-GOA', cat: 'Maintenance', amount: 3000, month: '2024-09', desc: 'Goa Flat Maintainance' },
      { propCode: 'PROP-GOA', cat: 'Maintenance', amount: 550000, month: '2025-01', desc: 'Goa Flat Maintainance' },

      // Tony's Room
      { propCode: 'PROP-ROSHAN', cat: 'Maintenance', amount: 10000, month: '2024-08', desc: 'Tonys room maintainance' },
      { propCode: 'PROP-ROSHAN', cat: 'Maintenance', amount: 10000, month: '2024-09', desc: 'Tonys room maintainance' },
      { propCode: 'PROP-ROSHAN', cat: 'Miscellaneous', amount: 5000, month: '2024-09', desc: 'Tonys room other expenses' },
      { propCode: 'PROP-ROSHAN', cat: 'Maintenance', amount: 20000, month: '2025-01', desc: 'Tonys room maintainance' },

      // Byculla Club
      { propCode: 'PROP-BYCULLA', cat: 'Property Rent Paid', amount: 96000, month: '2024-03', desc: 'Buyculla club ground rent' },
      { propCode: 'PROP-BYCULLA', cat: 'Maintenance', amount: 5500, month: '2024-03', desc: 'Buyculla club maintainance' },
      { propCode: 'PROP-BYCULLA', cat: 'Maintenance', amount: 21500, month: '2024-06', desc: 'Buyculla club maintainance' },
      { propCode: 'PROP-BYCULLA', cat: 'Maintenance', amount: 5000, month: '2025-01', desc: 'Buyculla club maintainance' },

      // Other Expenses
      { propCode: null, cat: 'Professional Fees', amount: 19000, month: '2024-11', desc: 'IT Fees' },
      { propCode: null, cat: 'Donations', amount: 5000, month: '2024-09', desc: 'Donations' },
      { propCode: null, cat: 'Donations', amount: 8000, month: '2024-10', desc: 'Donations' },
      { propCode: null, cat: 'Miscellaneous', amount: 2000, month: '2024-08', desc: 'Miscellaneous exp' },
      { propCode: null, cat: 'Miscellaneous', amount: 1600, month: '2024-09', desc: 'Miscellaneous exp' },
      { propCode: null, cat: 'Miscellaneous', amount: 6900, month: '2024-10', desc: 'Miscellaneous exp' },
      { propCode: null, cat: 'Miscellaneous', amount: 17000, month: '2024-11', desc: 'Miscellaneous exp' },

      // Margaret helper
      { propCode: null, cat: 'Miscellaneous', amount: 16500, month: '2024-03', desc: 'Margaret helper payment' },
      { propCode: null, cat: 'Miscellaneous', amount: 16500, month: '2024-06', desc: 'Margaret helper payment' },
      { propCode: null, cat: 'Miscellaneous', amount: 16500, month: '2024-09', desc: 'Margaret helper payment' },
      { propCode: null, cat: 'Miscellaneous', amount: 16500, month: '2024-12', desc: 'Margaret helper payment' },

      // Micellaneous Expenses
      { propCode: null, cat: 'Miscellaneous', amount: 150000, month: '2024-05', desc: 'Micellaneous Expenses' },
      { propCode: null, cat: 'Miscellaneous', amount: 8840, month: '2024-07', desc: 'Micellaneous Expenses' },
      { propCode: null, cat: 'Miscellaneous', amount: 18500, month: '2024-08', desc: 'Micellaneous Expenses' },
      { propCode: null, cat: 'Miscellaneous', amount: 10000, month: '2024-10', desc: 'Micellaneous Expenses' },
      { propCode: null, cat: 'Miscellaneous', amount: 30000, month: '2024-11', desc: 'Micellaneous Expenses' },

      // Mom Medical
      { propCode: null, cat: 'Medical & Personal', amount: 46338, month: '2024-03', desc: 'Mom treatment medicine' },
      { propCode: null, cat: 'Medical & Personal', amount: 700000, month: '2024-04', desc: 'Mom medical treatment' },
      { propCode: null, cat: 'Medical & Personal', amount: 13001, month: '2024-05', desc: 'Mom treatment' },
      { propCode: null, cat: 'Medical & Personal', amount: 12190, month: '2024-06', desc: 'Mom treatment' },
      { propCode: null, cat: 'Medical & Personal', amount: 7292, month: '2024-07', desc: 'Mom treatment' },
      { propCode: null, cat: 'Medical & Personal', amount: 38163, month: '2024-08', desc: 'Mom treatment' },
      { propCode: null, cat: 'Medical & Personal', amount: 8620, month: '2024-09', desc: 'Mom treatment' },
      { propCode: null, cat: 'Medical & Personal', amount: 8576, month: '2024-10', desc: 'Mom treatment' },
      { propCode: null, cat: 'Medical & Personal', amount: 9720, month: '2024-11', desc: 'Mom treatment' },
      { propCode: null, cat: 'Medical & Personal', amount: 10500, month: '2024-12', desc: 'Mom treatment' },
      { propCode: null, cat: 'Medical & Personal', amount: 5330, month: '2025-01', desc: 'Mom treatment' },
      { propCode: null, cat: 'Medical & Personal', amount: 4940, month: '2025-02', desc: 'Mom treatment' },

      // Islamic & Zakat
      { propCode: null, cat: 'Charity & Religious', amount: 1000000, month: '2024-04', desc: 'Islamic & Zakat' },

      // Akbar drawings
      { propCode: null, cat: 'Owner Drawings', amount: 823000, month: '2024-04', desc: 'Akbar payment' },
      { propCode: null, cat: 'Owner Drawings', amount: 2000000, month: '2024-05', desc: 'Akbar payment' },
      { propCode: null, cat: 'Owner Drawings', amount: 350000, month: '2024-08', desc: 'Akbar payment' },

      // Loan give to Gafoor
      { propCode: null, cat: 'Loan Disbursement', amount: 1500000, month: '2024-09', desc: 'Loan give to Gafoor' },
      { propCode: null, cat: 'Loan Disbursement', amount: 1400000, month: '2024-10', desc: 'Loan give to Gafoor' }
    ];

    console.log(`[Expenses] Inserting ${expenseList.length} expenses...`);
    let expIdx = 100;
    for (const e of expenseList) {
      let pId = null;
      if (e.propCode) {
        const prop = propMap[e.propCode];
        if (prop) pId = prop._id;
      }
      const [y, m] = e.month.split('-').map(Number);
      const expenseDate = new Date(Date.UTC(y, m - 1, 15));
      const expenseCode = `EXP-${e.month.replace('-', '')}-${String(expIdx++).padStart(4, '0')}`;

      await Expense.create({
        expenseCode,
        expenseDate,
        expenseMonth: e.month,
        propertyId: pId,
        category: e.cat,
        amount: e.amount,
        description: e.desc,
        paymentMode: 'Bank Transfer'
      });
    }

    console.log(`[Expenses] Inserted ${expenseList.length} expenses successfully.`);

    // 7. Synchronize Monthly Financial Ledger
    console.log('[Ledger] Syncing Monthly Financial Ledgers...');
    await syncMonthlyLedgers();

    console.log('====================================================');
    console.log('HISTORICAL 2024-2025 DATA IMPORT COMPLETED!');
    console.log('====================================================');
    if (require.main === module) {
      process.exit(0);
    }
  } catch (err) {
    console.error('[Import Error]', err);
    if (require.main === module) {
      process.exit(1);
    }
    throw err;
  }
}

if (require.main === module) {
  importHistorical();
}

module.exports = { importHistorical };
