const mongoose = require('./server/node_modules/mongoose');
const XLSX = require('./server/node_modules/xlsx');

const Property = require('./server/models/Property');
const Unit = require('./server/models/Unit');
const Tenant = require('./server/models/Tenant');
const TenantAssignment = require('./server/models/TenantAssignment');
const RentAgreement = require('./server/models/RentAgreement');
const PaymentReceipt = require('./server/models/PaymentReceipt');
const PaymentAllocation = require('./server/models/PaymentAllocation');
const Expense = require('./server/models/Expense');
const { syncMonthlyLedgers } = require('./server/utils/ledgerSync');

const BASE_DIR = 'C:/Users/Admin/.gemini/antigravity/brain/fd38458d-e7af-4d42-854b-a04e9112cacc/.user_uploaded/';

const FILES_CONFIG = [
  {
    fy: '2019-20',
    file: 'media_1792926879330_a8fde0a4.xlsx',
    earnEndRow: 46,
    expEndRow: 119
  },
  {
    fy: '2020-21',
    file: 'media_1792926845108_b57dfee8.xlsx',
    earnEndRow: 46,
    expEndRow: 119
  },
  {
    fy: '2021-22',
    file: 'media_1792926826313_8f796f16.xlsx',
    earnEndRow: 50,
    expEndRow: 124
  },
  {
    fy: '2022-23',
    file: 'media_1792926826313_50d51251.xlsx',
    earnEndRow: 50,
    expEndRow: 123
  }
];

function excelDateToMonthStr(serial) {
  if (typeof serial === 'string' && /^\d{4}-\d{2}/.test(serial)) return serial.slice(0, 7);
  if (typeof serial === 'number') {
    const utc_days = Math.floor(serial - 25569);
    const date = new Date(utc_days * 86400 * 1000);
    const yr = date.getUTCFullYear();
    const mo = String(date.getUTCMonth() + 1).padStart(2, '0');
    return `${yr}-${mo}`;
  }
  return String(serial);
}

async function run() {
  await mongoose.connect('mongodb://127.0.0.1:27017/property_rent_db');
  console.log('Connected to DB');

  const properties = await Property.find();
  const units = await Unit.find().populate('propertyId');
  const tenants = await Tenant.find();
  const assignments = await TenantAssignment.find().populate('tenantId').populate('unitId');

  const getOrCreateTenant = async (name, phone = '') => {
    let t = tenants.find(x => x.name.toLowerCase() === name.toLowerCase());
    if (!t) {
      const code = `TNT-${name.slice(0, 3).toUpperCase()}-${Date.now().toString().slice(-4)}`;
      t = await Tenant.create({ name, phone, tenantCode: code, isActive: true });
      tenants.push(t);
      console.log(`Created tenant: ${name}`);
    }
    return t;
  };

  const findUnit = (propName, unitSubName) => {
    return units.find(u => {
      const pMatch = u.propertyId && (
        u.propertyId.name.toLowerCase().includes(propName.toLowerCase()) ||
        u.propertyId.propertyCode.toLowerCase().includes(propName.toLowerCase())
      );
      if (!pMatch) return false;
      return (
        (u.subUnitPartition && u.subUnitPartition.toLowerCase().includes(unitSubName.toLowerCase())) ||
        (u.unitName && u.unitName.toLowerCase().includes(unitSubName.toLowerCase()))
      );
    });
  };

  const getOrCreateContract = async (tenant, unit, contractNo, startYr, endYr, rent = 0) => {
    let assign = assignments.find(a => 
      a.tenantId && a.tenantId._id.toString() === tenant._id.toString() &&
      a.unitId && a.unitId._id.toString() === unit._id.toString() &&
      (a.contractNo === contractNo || (a.startDate && a.startDate.toISOString().slice(0, 4) === String(startYr)))
    );

    if (!assign) {
      assign = assignments.find(a => 
        a.tenantId && a.tenantId._id.toString() === tenant._id.toString() &&
        a.unitId && a.unitId._id.toString() === unit._id.toString()
      );
    }

    if (!assign) {
      const code = `CON-${tenant.name.slice(0, 3).toUpperCase()}-${Date.now().toString().slice(-4)}`;
      assign = await TenantAssignment.create({
        assignmentCode: code,
        tenantId: tenant._id,
        unitId: unit._id,
        contractNo: contractNo,
        startDate: new Date(`${startYr}-04-01`),
        endDate: new Date(`${endYr}-03-31`),
        depositHeld: 0,
        contractType: 'Rent',
        notes: `Historical contract for ${tenant.name}`,
        status: 'Ended'
      });
      await RentAgreement.create({
        assignmentId: assign._id,
        unitId: unit._id,
        tenantId: tenant._id,
        contractType: 'Rent',
        rentType: 'Monthly Fixed',
        monthlyRate: rent,
        annualRate: rent * 12,
        effectiveFrom: new Date(`${startYr}-04-01`),
        effectiveTo: new Date(`${endYr}-03-31`),
        terms: '11 months',
        isCurrentRate: false
      });
      assignments.push(assign);
      console.log(`Created contract: ${contractNo} for ${tenant.name}`);
    } else if (!assign.contractNo) {
      assign.contractNo = contractNo;
      await assign.save();
    }
    return assign;
  };

  // Ensure any missing historical tenants
  const tDinesh = tenants.find(t => t.name.toLowerCase() === 'dinesh');
  const tJayanti = tenants.find(t => t.name.toLowerCase().includes('jayanti'));
  const tRaju = tenants.find(t => t.name.toLowerCase().includes('raju'));
  const tAjit = await getOrCreateTenant('Ajit Bhai');
  const tNikku = await getOrCreateTenant('Nikku');

  // Helper to map earning row to { unit, tenant, contractNo, label }
  const resolveEarningTarget = async (propTitle, lineTitle, yearStr) => {
    const p = propTitle.toLowerCase();
    const l = lineTitle.toLowerCase();

    if (p.includes('kotak')) {
      if (l.includes('water')) {
        const u = findUnit('Kotak', 'Small Godown');
        const t = tenants.find(x => x.name.toLowerCase().includes('water wala'));
        return { unit: u, tenant: t, contractNo: 'WaterWala-2018', label: 'Kotak Water Wala' };
      } else {
        const u = findUnit('Kotak', 'PG');
        const t = tenants.find(x => x.name.toLowerCase() === 'pg');
        return { unit: u, tenant: t, contractNo: 'PG-2018', label: 'Kotak PG' };
      }
    }

    if (p.includes('65 no godown')) {
      if (l.includes('mahendra')) {
        const u = findUnit('65 no godown', '65 Large Godown');
        const t = tenants.find(x => x.name.toLowerCase().includes('mahendra'));
        await getOrCreateContract(t, u, `Mahendra-${yearStr}`, yearStr, Number(yearStr) + 1, 100000);
        return { unit: u, tenant: t, contractNo: `Mahendra-${yearStr}`, label: '65 Godown Mahendra Bhai' };
      } else {
        const u = findUnit('65 no godown', '65 Small Godown');
        const t = tenants.find(x => x.name.toLowerCase().includes('alka'));
        await getOrCreateContract(t, u, `Alka-${yearStr}`, yearStr, Number(yearStr) + 1, 40000);
        return { unit: u, tenant: t, contractNo: `Alka-${yearStr}`, label: '65 Godown Alka/Akash' };
      }
    }

    if (p.includes('baranker')) {
      if (l.includes('anjana') || l.includes('attic')) {
        const u = findUnit('Baranker', '1st Floor');
        const t = tenants.find(x => x.name.toLowerCase().includes('anjana'));
        return { unit: u, tenant: t, contractNo: 'Anjana-2023', label: 'Baranker Anjana' };
      } else {
        const u = findUnit('Baranker', 'Mezzanine');
        const t = tenants.find(x => x.name.toLowerCase().includes('uttam'));
        await getOrCreateContract(t, u, `Uttam-${yearStr}`, yearStr, Number(yearStr) + 1, 16500);
        return { unit: u, tenant: t, contractNo: `Uttam-${yearStr}`, label: 'Baranker Uttam/Down' };
      }
    }

    if (p.includes('room no 10') || p.includes('room no 4')) {
      const u = findUnit('Room No 10', 'Room No 10');
      const t = tenants.find(x => x.name.toLowerCase().includes('kamlesh'));
      return { unit: u, tenant: t, contractNo: 'Kamlesh-2023', label: 'Room 10 / 4' };
    }

    if (p.includes('garage')) {
      if (l.includes('snip')) {
        const u = findUnit('Garage', 'Shop 2');
        const t = tenants.find(x => x.name.toLowerCase().includes('snip - irfan'));
        await getOrCreateContract(t, u, `Snip-${yearStr}`, yearStr, Number(yearStr) + 1, 30000);
        return { unit: u, tenant: t, contractNo: `Snip-${yearStr}`, label: 'Garage Snip' };
      }
      if (l.includes('dg cable') || l.includes('dg')) {
        const u = findUnit('Garage', 'Shop 1');
        const t = tenants.find(x => x.name.toLowerCase() === 'dg cable');
        return { unit: u, tenant: t, contractNo: 'DG-2013', label: 'Garage DG Cable' };
      }
      if (l.includes('girja') || l.includes('super star')) {
        const u = findUnit('Garage', 'Godown');
        const t = tenants.find(x => x.name.toLowerCase().includes('anand'));
        return { unit: u, tenant: t, contractNo: 'Anand-2014', label: 'Garage Girja / Superstar' };
      }
      if (l.includes('altaf') || l.includes('chira')) {
        const u = findUnit('Garage', 'Chira Bazar House');
        const t = tenants.find(x => x.name.toLowerCase().includes('altaf'));
        return { unit: u, tenant: t, contractNo: 'Altaf-2014', label: 'Garage Altaf' };
      }
    }

    if (p.includes('ennas')) {
      const u = findUnit('Ennas Room', 'Ennas Room');
      const t = tenants.find(x => x.name.toLowerCase().includes('bengali'));
      return { unit: u, tenant: t, contractNo: 'Bengali-2023', label: 'Ennas Room Bengali' };
    }

    if (p.includes('mani mansion')) {
      const u = findUnit('Mani Mansion', 'Room 1');
      if (l.includes('jayanthi') || l.includes('jayanti')) {
        return { unit: u, tenant: tJayanti, contractNo: 'Jayanti-2021', label: 'Mani Mansion Jayanti Bhai' };
      } else {
        return { unit: u, tenant: tDinesh, contractNo: 'Dinesh-2017', label: 'Mani Mansion Dinesh' };
      }
    }

    if (p.includes('tonys room') || p.includes('tony')) {
      if (l.includes('dg')) {
        const u = findUnit('Tony room', 'Tony Room 1');
        const t = tenants.find(x => x.name.toLowerCase() === 'dg');
        return { unit: u, tenant: t, contractNo: 'DG-2016', label: 'Tony room DG' };
      }
      const u = findUnit('Tony room', 'Tony Room 2');
      const t = tenants.find(x => x.name.toLowerCase().includes('vinay'));
      await getOrCreateContract(t, u, `Vinay-${yearStr}`, yearStr, Number(yearStr) + 1, 9000);
      return { unit: u, tenant: t, contractNo: `Vinay-${yearStr}`, label: `Tony room ${lineTitle}` };
    }

    if (p.includes('buyculla')) {
      if (l.includes('basar')) {
        const u = findUnit('Byculla Club', '1st Floor');
        const t = tenants.find(x => x.name.toLowerCase().includes('basar'));
        return { unit: u, tenant: t, contractNo: 'Basar-2016', label: 'Byculla Club Basar' };
      } else if (l.includes('romel')) {
        const u = findUnit('Byculla Club', 'Mezzanine');
        const t = tenants.find(x => x.name.toLowerCase().includes('romel'));
        return { unit: u, tenant: t, contractNo: 'Romel-2021', label: 'Byculla Club Romel' };
      } else if (l.includes('raju')) {
        const u = findUnit('Byculla Club', 'Mezzanine');
        return { unit: u, tenant: tRaju, contractNo: 'Raju-2016', label: 'Byculla Club Raju Bhai' };
      }
    }

    if (p.includes('kandivili') || p.includes('kandivli')) {
      if (l.includes('2108')) {
        const u = findUnit('Kandivli', 'Flat No 2108');
        const t = tenants.find(x => x.name.toLowerCase().includes('2108'));
        return { unit: u, tenant: t, contractNo: 'Tenant-2020-1', label: 'Kandivli Flat 2108' };
      } else if (l.includes('2109')) {
        const u = findUnit('Kandivli', 'Flat No 2109');
        const t = tenants.find(x => x.name.toLowerCase().includes('2109'));
        return { unit: u, tenant: t, contractNo: 'Tenant-2020-2', label: 'Kandivli Flat 2109' };
      }
    }

    if (l.includes('other income')) {
      const u = findUnit('Other Income', 'Other Income');
      const t = tenants.find(x => x.name.toLowerCase().includes('other income'));
      return { unit: u, tenant: t, contractNo: `OtherIncome-${yearStr}`, label: 'Other Income' };
    }

    // Default fallback
    console.warn(`Unresolved earning line: Prop="${propTitle}", Line="${lineTitle}"`);
    const defU = units[0];
    const defT = tenants[0];
    return { unit: defU, tenant: defT, contractNo: 'MISC-2019', label: lineTitle };
  };

  // Helper to map expense row to { prop, cat, title }
  const resolveExpenseTarget = (propTitle, lineTitle) => {
    const p = propTitle.toLowerCase();
    const l = lineTitle.toLowerCase();

    // Property lookup
    let prop = null;
    if (p.includes('kotak')) prop = properties.find(x => x.name.toLowerCase().includes('kotak'));
    else if (p.includes('65 godown') || p.includes('65 no godown')) prop = properties.find(x => x.name.toLowerCase().includes('65 no godown'));
    else if (p.includes('garage')) prop = properties.find(x => x.name.toLowerCase().includes('garage'));
    else if (p.includes('ennas')) prop = properties.find(x => x.name.toLowerCase().includes('ennas'));
    else if (p.includes('mani mansion')) prop = properties.find(x => x.name.toLowerCase().includes('mani mansion'));
    else if (p.includes('goa')) prop = properties.find(x => x.name.toLowerCase().includes('goa'));
    else if (p.includes('tony')) prop = properties.find(x => x.name.toLowerCase().includes('tony'));
    else if (p.includes('buyculla')) prop = properties.find(x => x.name.toLowerCase().includes('byculla'));
    else if (p.includes('kandivili') || p.includes('kandivli')) prop = properties.find(x => x.name.toLowerCase().includes('kandivli'));

    // Category lookup
    let cat = 'Maintenance';
    if (l.includes('rent')) cat = 'Property Rent Paid';
    else if (l.includes('electricity')) cat = 'Electricity & Utilities';
    else if (l.includes('other expense')) cat = 'Other expenses';
    else if (l.includes('it fee')) cat = 'Miscellaneous';
    else if (l.includes('donation')) cat = 'Donations';
    else if (l.includes('miscellanous') || l.includes('miscellaneous')) cat = 'Miscellaneous';
    else if (l.includes('margaret')) cat = 'Margaret';
    else if (l.includes('mom')) cat = 'MOM';
    else if (l.includes('zakat') || l.includes('islamic')) cat = 'Islamic & Zakat';
    else if (l.includes('akbar')) cat = 'Akbar';
    else if (l.includes('loan') || l.includes('mustaq')) cat = 'Loan';
    else if (l.includes('duba')) cat = 'Miscellaneous';

    return { prop, cat, title: lineTitle || `${prop ? prop.name : 'Common'} - Expense` };
  };

  // Process all 4 years
  for (const cfg of FILES_CONFIG) {
    console.log(`\n======================================================`);
    console.log(`            IMPORTING FY ${cfg.fy}            `);
    console.log(`======================================================`);

    const wb = XLSX.readFile(BASE_DIR + cfg.file);
    const ws = wb.Sheets['Summary'];
    const data = XLSX.utils.sheet_to_json(ws, { header: 1 });

    const header = data[0];
    const months = [];
    for (let c = 3; c <= 14; c++) months.push(excelDateToMonthStr(header[c]));

    console.log('Months in sheet:', months);

    // Clean existing allocations/receipts/expenses for this FY prefix
    const startM = months[0];
    const endM = months[months.length - 1];
    console.log(`Cleaning existing records for range ${startM} to ${endM}...`);
    
    // We only clean the specific months covered by this sheet
    await PaymentAllocation.deleteMany({ rentMonthYear: { $in: months } });
    await PaymentReceipt.deleteMany({ receiptNumber: { $regex: `^REC-FY${cfg.fy.slice(2, 4)}-` } });
    await Expense.deleteMany({ expenseCode: { $regex: `^EXP-FY${cfg.fy.slice(2, 4)}-` } });

    // 1. EARNINGS
    let receiptSeq = 1;
    let totalEarn = 0;
    const earnMonthly = {};
    months.forEach(m => { earnMonthly[m] = 0; });

    let currentProp = '';
    for (let r = 2; r < cfg.earnEndRow; r++) {
      const row = data[r];
      if (!row) continue;
      if (row[0] && typeof row[0] === 'number') currentProp = row[2] || currentProp;
      const lineTitle = String(row[2] || row[1] || '').trim();
      const hasVal = row.slice(3, 15).some(v => Number(v) > 0);
      if (!hasVal) continue;

      const target = await resolveEarningTarget(currentProp, lineTitle, cfg.fy.slice(0, 4));

      for (let mIdx = 0; mIdx < months.length; mIdx++) {
        const mStr = months[mIdx];
        const amt = Number(row[3 + mIdx]) || 0;
        if (amt === 0) continue;

        const receiptNumber = `REC-FY${cfg.fy.slice(2, 4)}-${mStr.replace('-', '')}-${String(receiptSeq++).padStart(4, '0')}`;
        const receiptDate = new Date(`${mStr}-15T10:00:00.000Z`);

        const receipt = await PaymentReceipt.create({
          receiptNumber,
          receiptDate,
          tenantId: target.tenant._id,
          unitId: target.unit._id,
          totalAmount: amt,
          paymentMode: 'Cash',
          comments: `${target.label} - Rent for ${mStr} (FY ${cfg.fy})`,
          contractNo: target.contractNo,
          isReversed: false
        });

        await PaymentAllocation.create({
          receiptId: receipt._id,
          tenantId: target.tenant._id,
          unitId: target.unit._id,
          rentMonthYear: mStr,
          allocatedAmount: amt,
          isAdvanceOrExcess: false,
          contractNo: target.contractNo,
          notes: `Imported FY ${cfg.fy}: ${target.label}`
        });

        earnMonthly[mStr] += amt;
        totalEarn += amt;
      }
    }

    // 2. EXPENSES
    let expSeq = 1;
    let totalExp = 0;
    const expMonthly = {};
    months.forEach(m => { expMonthly[m] = 0; });

    currentProp = '';
    for (let r = cfg.earnEndRow + 1; r < cfg.expEndRow; r++) {
      const row = data[r];
      if (!row) continue;
      if (row[0] && typeof row[0] === 'number') currentProp = row[2] || currentProp;
      const lineTitle = String(row[2] || row[1] || '').trim();
      if (lineTitle.toLowerCase().includes('total income') || lineTitle.toLowerCase().includes('loan received') || lineTitle.toLowerCase().includes('actual expense') || lineTitle === 'Property') continue;
      const hasVal = row.slice(3, 15).some(v => Number(v) > 0);
      if (!hasVal) continue;

      const target = resolveExpenseTarget(currentProp, lineTitle);

      for (let mIdx = 0; mIdx < months.length; mIdx++) {
        const mStr = months[mIdx];
        const amt = Number(row[3 + mIdx]) || 0;
        if (amt === 0) continue;

        const expenseCode = `EXP-FY${cfg.fy.slice(2, 4)}-${mStr.replace('-', '')}-${String(expSeq++).padStart(4, '0')}`;
        const expenseDate = new Date(`${mStr}-15T12:00:00.000Z`);

        await Expense.create({
          expenseCode,
          expenseDate,
          expenseMonth: mStr,
          propertyId: target.prop ? target.prop._id : null,
          category: target.cat,
          amount: amt,
          description: `FY ${cfg.fy}: ${target.title} for ${mStr}`,
          vendorOrPayee: target.prop ? target.prop.name : target.title,
          paymentMode: 'Cash',
          isReversed: false
        });

        expMonthly[mStr] += amt;
        totalExp += amt;
      }
    }

    // 3. COMPARISON & VERIFICATION FOR THIS FY
    console.log(`\nMonth-by-Month Verification for FY ${cfg.fy}:`);
    const reportedEarnRow = data[cfg.earnEndRow];
    const reportedExpRow = data[cfg.expEndRow];
    let allMatches = true;

    console.log('| Month   | Excel Earning | DB Earning    | Match | Excel Expense | DB Expense    | Match |');
    console.log('|---------|---------------|---------------|-------|---------------|---------------|-------|');

    for (let mIdx = 0; mIdx < months.length; mIdx++) {
      const m = months[mIdx];
      const exEarn = Number(reportedEarnRow[3 + mIdx]) || 0;
      const dbEarn = earnMonthly[m] || 0;
      const earnMatch = exEarn === dbEarn;

      const exExp = Number(reportedExpRow[3 + mIdx]) || 0;
      const dbExp = expMonthly[m] || 0;
      const expMatch = exExp === dbExp;

      if (!earnMatch || !expMatch) allMatches = false;

      console.log(
        `| ${m} | ` +
        `${exEarn.toLocaleString('en-IN').padStart(13)} | ` +
        `${dbEarn.toLocaleString('en-IN').padStart(13)} | ` +
        `${earnMatch ? '  OK ' : ' MIS '} | ` +
        `${exExp.toLocaleString('en-IN').padStart(13)} | ` +
        `${dbExp.toLocaleString('en-IN').padStart(13)} | ` +
        `${expMatch ? '  OK ' : ' MIS '} |`
      );
    }

    const exTotalEarn = Number(reportedEarnRow[15]) || 0;
    const exTotalExp = Number(reportedExpRow[15]) || 0;
    console.log(`\nTotals for FY ${cfg.fy}:`);
    console.log(`  Earnings: Excel ₹${exTotalEarn.toLocaleString('en-IN')} vs DB ₹${totalEarn.toLocaleString('en-IN')} -> ${exTotalEarn === totalEarn ? 'EXACT MATCH' : 'MISMATCH'}`);
    console.log(`  Expenses: Excel ₹${exTotalExp.toLocaleString('en-IN')} vs DB ₹${totalExp.toLocaleString('en-IN')} -> ${exTotalExp === totalExp ? 'EXACT MATCH' : 'MISMATCH'}`);
  }

  console.log('\nRunning syncMonthlyLedgers across all entities...');
  await syncMonthlyLedgers();
  console.log('Ledger sync completed successfully!');

  await mongoose.disconnect();
}

run().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
