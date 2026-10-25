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

const EXCEL_FILE = 'C:/Users/Admin/.gemini/antigravity/brain/fd38458d-e7af-4d42-854b-a04e9112cacc/.user_uploaded/media_1792925400286_9c84bc98.xlsx';

const MONTHS = [
  '2023-04', '2023-05', '2023-06', '2023-07',
  '2023-08', '2023-09', '2023-10', '2023-11',
  '2023-12', '2024-01', '2024-02', '2024-03'
];

async function main() {
  await mongoose.connect('mongodb://127.0.0.1:27017/property_rent_db');
  console.log('Connected to DB');

  const wb = XLSX.readFile(EXCEL_FILE);
  const ws = wb.Sheets['Summary'];
  const data = XLSX.utils.sheet_to_json(ws, { header: 1 });

  const properties = await Property.find();
  const units = await Unit.find().populate('propertyId');
  const tenants = await Tenant.find();
  const assignments = await TenantAssignment.find().populate('tenantId').populate('unitId');

  // Helpers
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

  const getOrCreateContract = async (tenant, unit, contractNo, startDate = '2023-04-01', endDate = '2024-03-31', rentAmount = 0) => {
    let assign = assignments.find(a => 
      a.tenantId && a.tenantId._id.toString() === tenant._id.toString() &&
      a.unitId && a.unitId._id.toString() === unit._id.toString() &&
      (a.contractNo === contractNo || (a.startDate && a.startDate.toISOString().slice(0, 4) <= '2023'))
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
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        depositHeld: 0,
        contractType: 'Rent',
        notes: `Imported FY23 contract for ${tenant.name}`,
        status: 'Ended'
      });
      await RentAgreement.create({
        assignmentId: assign._id,
        unitId: unit._id,
        tenantId: tenant._id,
        contractType: 'Rent',
        rentType: 'Monthly Fixed',
        monthlyRate: rentAmount,
        annualRate: rentAmount * 12,
        effectiveFrom: new Date(startDate),
        effectiveTo: new Date(endDate),
        terms: '11 months',
        isCurrentRate: false
      });
      assignments.push(assign);
      console.log(`Created contract: ${contractNo} for ${tenant.name} on ${unit.unitName}`);
    } else if (!assign.contractNo) {
      assign.contractNo = contractNo;
      await assign.save();
    }
    return assign;
  };

  // Specific tenants
  const tenantMunshi = await getOrCreateTenant('Munshi');
  const tenantMahendra = tenants.find(t => t.name.toLowerCase().includes('mahendra'));
  const tenantAlka = tenants.find(t => t.name.toLowerCase().includes('alka'));
  const tenantUttam = tenants.find(t => t.name.toLowerCase().includes('uttam'));
  const tenantVinay = tenants.find(t => t.name.toLowerCase().includes('vinay'));
  const tenantOtherInc = tenants.find(t => t.name.toLowerCase().includes('other income')) || await getOrCreateTenant('Other Income Financing');
  const tenantSnip = tenants.find(t => t.name.toLowerCase().includes('snip - irfan'));
  const tenantPG = tenants.find(t => t.name.toLowerCase() === 'pg');
  const tenantWater = tenants.find(t => t.name.toLowerCase().includes('water wala'));
  const tenantAnjana = tenants.find(t => t.name.toLowerCase().includes('anjana'));
  const tenantKamlesh = tenants.find(t => t.name.toLowerCase().includes('kamlesh'));
  const tenantDGCable = tenants.find(t => t.name.toLowerCase() === 'dg cable');
  const tenantDG = tenants.find(t => t.name.toLowerCase() === 'dg');
  const tenantAnand = tenants.find(t => t.name.toLowerCase().includes('anand'));
  const tenantAltaf = tenants.find(t => t.name.toLowerCase().includes('altaf'));
  const tenantBengali = tenants.find(t => t.name.toLowerCase().includes('bengali'));
  const tenantBasar = tenants.find(t => t.name.toLowerCase().includes('basar'));
  const tenantRomel = tenants.find(t => t.name.toLowerCase().includes('romel'));
  const tenant2108 = tenants.find(t => t.name.toLowerCase().includes('2108'));
  const tenant2109 = tenants.find(t => t.name.toLowerCase().includes('2109'));

  // Ensure contracts for all tenants
  const cMahendra = await getOrCreateContract(tenantMahendra, findUnit('65 no godown', '65 Large Godown'), 'Mahendra-2023', '2023-04-01', '2024-03-31', 100000);
  const cAlka = await getOrCreateContract(tenantAlka, findUnit('65 no godown', '65 Small Godown'), 'Alka-2023', '2023-04-01', '2024-03-31', 40000);
  const cUttam = await getOrCreateContract(tenantUttam, findUnit('Baranker', 'Mezzanine'), 'Uttam-2023', '2023-04-01', '2024-03-31', 16500);
  const cMunshi = await getOrCreateContract(tenantMunshi, findUnit('Mani Mansion', 'Room 1'), 'Munshi-2023', '2023-04-01', '2024-03-31', 24000);
  const cVinay = await getOrCreateContract(tenantVinay, findUnit('Tony room', 'Tony Room 2'), 'Vinay-2023', '2023-04-01', '2024-03-31', 9000);
  const cOther = await getOrCreateContract(tenantOtherInc, findUnit('Other Income', 'Other Income'), 'OtherIncome-2023', '2023-04-01', '2024-03-31', 50000);
  const cSnip23 = await getOrCreateContract(tenantSnip, findUnit('Garage', 'Shop 2'), 'Snip-2023', '2023-04-01', '2024-03-31', 30000);

  // Earning definitions
  const EARNING_ROWS = [
    { row: 3, unit: findUnit('Kotak', 'PG'), tenant: tenantPG, contractNo: 'PG-2018', label: 'Kotak PG' },
    { row: 4, unit: findUnit('Kotak', 'Small Godown'), tenant: tenantWater, contractNo: 'WaterWala-2018', label: 'Kotak Water Wala' },
    { row: 7, unit: findUnit('65 no godown', '65 Large Godown'), tenant: tenantMahendra, contractNo: 'Mahendra-2023', label: '65 Godown Mahendra Bhai' },
    { row: 8, unit: findUnit('65 no godown', '65 Small Godown'), tenant: tenantAlka, contractNo: 'Alka-2023', label: '65 Godown Alka Industry' },
    { row: 11, unit: findUnit('Baranker', 'Mezzanine'), tenant: tenantUttam, contractNo: 'Uttam-2023', label: 'Baranker Uttam' },
    { row: 12, unit: findUnit('Baranker', '1st Floor'), tenant: tenantAnjana, contractNo: 'Anjana-2023', label: 'Baranker Anjana' },
    { row: 14, unit: findUnit('Room No 10', 'Room No 10'), tenant: tenantKamlesh, contractNo: 'Kamlesh-2023', label: 'Room 10 Kamlesh' },
    { row: 18, unit: findUnit('Garage', 'Shop 2'), tenant: tenantSnip, contractNo: 'Snip-2023', label: 'Garage Snip' },
    { row: 19, unit: findUnit('Garage', 'Shop 1'), tenant: tenantDGCable, contractNo: 'DG-2013', label: 'Garage DG Cable' },
    { row: 20, unit: findUnit('Garage', 'Godown'), tenant: tenantAnand, contractNo: 'Anand-2014', label: 'Garage Girja / Superstar' },
    { row: 21, unit: findUnit('Garage', 'Chira Bazar House'), tenant: tenantAltaf, contractNo: 'Altaf-2022', label: 'Garage Altaf' },
    { row: 24, unit: findUnit('Ennas Room', 'Ennas Room'), tenant: tenantBengali, contractNo: 'Bengali-2023', label: 'Ennas Room Bengali' },
    { row: 27, unit: findUnit('Mani Mansion', 'Room 1'), tenant: tenantMunshi, contractNo: 'Munshi-2023', label: 'Mani Mansion Munshi' },
    { row: 34, unit: findUnit('Tony room', 'Tony Room 1'), tenant: tenantDG, contractNo: 'DG-2016', label: 'Tony room DG' },
    { row: 35, unit: findUnit('Tony room', 'Tony Room 2'), tenant: tenantVinay, contractNo: 'Vinay-2023', label: 'Tony room Vinay Singh' },
    { row: 38, unit: findUnit('Byculla Club', '1st Floor'), tenant: tenantBasar, contractNo: 'Basar-2016', label: 'Byculla Club Basar' },
    { row: 39, unit: findUnit('Byculla Club', 'Mezzanine'), tenant: tenantRomel, contractNo: 'Romel-2021', label: 'Byculla Club Romel' },
    { row: 42, unit: findUnit('Kandivli', 'Flat No 2108'), tenant: tenant2108, contractNo: 'Tenant-2020-1', label: 'Kandivli Flat 2108' },
    { row: 43, unit: findUnit('Kandivli', 'Flat No 2109'), tenant: tenant2109, contractNo: 'Tenant-2020-2', label: 'Kandivli Flat 2109' },
    { row: 45, unit: findUnit('Other Income', 'Other Income'), tenant: tenantOtherInc, contractNo: 'OtherIncome-2023', label: 'Other Income' }
  ];

  // Expense definitions
  const EXPENSE_ROWS = [
    { row: 66, prop: properties.find(p => p.name.toLowerCase().includes('65 no godown')), cat: 'Maintenance', title: '65 Godown - Maintenance' },
    { row: 67, prop: properties.find(p => p.name.toLowerCase().includes('65 no godown')), cat: 'Property Rent Paid', title: '65 Godown - Rent' },
    { row: 68, prop: properties.find(p => p.name.toLowerCase().includes('65 no godown')), cat: 'Other expenses', title: '65 Godown - Other expenses' },
    { row: 74, prop: properties.find(p => p.name.toLowerCase().includes('garage')), cat: 'Property Rent Paid', title: 'Garage - Rent' },
    { row: 75, prop: properties.find(p => p.name.toLowerCase().includes('garage')), cat: 'Other expenses', title: 'Garage - Other expenses' },
    { row: 81, prop: properties.find(p => p.name.toLowerCase().includes('ennas room')), cat: 'Property Rent Paid', title: 'Ennas Room - Rent' },
    { row: 87, prop: properties.find(p => p.name.toLowerCase().includes('mani mansion')), cat: 'Maintenance', title: 'Mani Mansion - Maintenance' },
    { row: 89, prop: properties.find(p => p.name.toLowerCase().includes('mani mansion')), cat: 'Other expenses', title: 'Mani Mansion - Other expenses' },
    { row: 93, prop: properties.find(p => p.name.toLowerCase().includes('goa flat')), cat: 'Electricity & Utilities', title: 'Goa Flat - Electricity' },
    { row: 100, prop: properties.find(p => p.name.toLowerCase().includes('tony room')), cat: 'Maintenance', title: 'Tonys room - Maintenance' },
    { row: 105, prop: properties.find(p => p.name.toLowerCase().includes('byculla club')), cat: 'Property Rent Paid', title: 'Byculla Club - Rent' },
    { row: 106, prop: properties.find(p => p.name.toLowerCase().includes('byculla club')), cat: 'Maintenance', title: 'Byculla Club - Maintenance Sep' },
    { row: 107, prop: properties.find(p => p.name.toLowerCase().includes('byculla club')), cat: 'Maintenance', title: 'Byculla Club - Maintenance Dec' },
    // Common / Other Expenses (prop: null)
    { row: 114, prop: null, cat: 'Miscellaneous', title: 'Misscellanous exp' },
    { row: 115, prop: null, cat: 'Margaret', title: 'Margaret' },
    { row: 116, prop: null, cat: 'Miscellaneous', title: 'Micellaneous Expenses' },
    { row: 117, prop: null, cat: 'MOM', title: 'Mom' },
    { row: 118, prop: null, cat: 'Islamic & Zakat', title: 'Islamic & Zakat' },
    { row: 119, prop: null, cat: 'Akbar', title: 'Akbar' },
    { row: 120, prop: null, cat: 'Loan', title: 'Loan asgar Bhati' },
    { row: 122, prop: null, cat: 'Loan', title: 'Sadat Loan' }
  ];

  // Clean existing FY23 records to ensure idempotency
  console.log('Cleaning any prior FY23 import data (2023-04 to 2024-03)...');
  const delAllocs = await PaymentAllocation.deleteMany({
    rentMonthYear: { $gte: '2023-04', $lte: '2024-02' }
  });
  console.log(`Deleted ${delAllocs.deletedCount} prior allocations.`);

  const delReceipts = await PaymentReceipt.deleteMany({
    receiptNumber: { $regex: '^REC-FY23-' }
  });
  console.log(`Deleted ${delReceipts.deletedCount} prior FY23 receipts.`);

  const delExpenses = await Expense.deleteMany({
    expenseCode: { $regex: '^EXP-FY23-' }
  });
  console.log(`Deleted ${delExpenses.deletedCount} prior FY23 expenses.`);

  // 1. IMPORT EARNINGS
  console.log('\n--- Importing Earnings from Summary Sheet ---');
  let receiptSeq = 1;
  let totalEarningsImported = 0;
  const monthEarningsMap = {};
  MONTHS.forEach(m => { monthEarningsMap[m] = 0; });

  for (const def of EARNING_ROWS) {
    const row = data[def.row];
    if (!row) continue;

    for (let mIdx = 0; mIdx < MONTHS.length; mIdx++) {
      const monthStr = MONTHS[mIdx];
      const amt = Number(row[3 + mIdx]) || 0;
      if (amt <= 0) continue;

      const receiptNumber = `REC-FY23-${monthStr.replace('-', '')}-${String(receiptSeq++).padStart(4, '0')}`;
      const receiptDate = new Date(`${monthStr}-15T10:00:00.000Z`);

      // Determine contractNo: for 2024 months on Kandivli, can use 2024 contract
      let finalContractNo = def.contractNo;
      if (def.label.includes('2108') && monthStr >= '2024-01') finalContractNo = 'Tenant-2024-1';
      if (def.label.includes('2109') && monthStr >= '2024-01') finalContractNo = 'Tenant-2024-2';

      const receipt = await PaymentReceipt.create({
        receiptNumber,
        receiptDate,
        tenantId: def.tenant._id,
        unitId: def.unit._id,
        totalAmount: amt,
        paymentMode: 'Cash',
        comments: `${def.label} - Rent for ${monthStr} (FY 2023-2024)`,
        contractNo: finalContractNo,
        isReversed: false
      });

      await PaymentAllocation.create({
        receiptId: receipt._id,
        tenantId: def.tenant._id,
        unitId: def.unit._id,
        rentMonthYear: monthStr,
        allocatedAmount: amt,
        isAdvanceOrExcess: false,
        contractNo: finalContractNo,
        notes: `Imported FY23 Summary: ${def.label}`
      });

      monthEarningsMap[monthStr] += amt;
      totalEarningsImported += amt;
    }
  }

  console.log(`Successfully created ${receiptSeq - 1} Payment Receipts & Allocations. Total: ₹${totalEarningsImported}`);

  // 2. IMPORT EXPENSES
  console.log('\n--- Importing Expenses from Summary Sheet ---');
  let expenseSeq = 1;
  let totalExpensesImported = 0;
  const monthExpensesMap = {};
  MONTHS.forEach(m => { monthExpensesMap[m] = 0; });

  for (const def of EXPENSE_ROWS) {
    const row = data[def.row];
    if (!row) continue;

    for (let mIdx = 0; mIdx < MONTHS.length; mIdx++) {
      const monthStr = MONTHS[mIdx];
      const amt = Number(row[3 + mIdx]) || 0;
      if (amt <= 0) continue;

      const expenseCode = `EXP-FY23-${monthStr.replace('-', '')}-${String(expenseSeq++).padStart(4, '0')}`;
      const expenseDate = new Date(`${monthStr}-15T12:00:00.000Z`);

      await Expense.create({
        expenseCode,
        expenseDate,
        expenseMonth: monthStr,
        propertyId: def.prop ? def.prop._id : null,
        category: def.cat,
        amount: amt,
        description: `FY23 Summary: ${def.title} for ${monthStr}`,
        vendorOrPayee: def.prop ? def.prop.name : def.title,
        paymentMode: 'Cash',
        isReversed: false
      });

      monthExpensesMap[monthStr] += amt;
      totalExpensesImported += amt;
    }
  }

  console.log(`Successfully created ${expenseSeq - 1} Expense records. Total: ₹${totalExpensesImported}`);

  // 3. COMPARISON VERIFICATION
  console.log('\n======================================================');
  console.log('       MONTH-BY-MONTH VERIFICATION & COMPARISON       ');
  console.log('======================================================');

  const excelEarningRow = data[49];
  const excelExpenseRow = data[124];
  const excelDiffRow = data[126];

  let allMatch = true;

  console.log('| Month   | Excel Earning | DB Earning    | Match | Excel Expense | DB Expense    | Match | Diff Match |');
  console.log('|---------|---------------|---------------|-------|---------------|---------------|-------|------------|');

  for (let mIdx = 0; mIdx < MONTHS.length; mIdx++) {
    const m = MONTHS[mIdx];
    const exEarn = Number(excelEarningRow[3 + mIdx]) || 0;
    const dbEarn = monthEarningsMap[m] || 0;
    const earnMatch = exEarn === dbEarn;

    const exExp = Number(excelExpenseRow[3 + mIdx]) || 0;
    const dbExp = monthExpensesMap[m] || 0;
    const expMatch = exExp === dbExp;

    const exDiff = Number(excelDiffRow[3 + mIdx]) || 0;
    const dbDiff = dbEarn - dbExp;
    const diffMatch = exDiff === dbDiff;

    if (!earnMatch || !expMatch || !diffMatch) allMatch = false;

    console.log(
      `| ${m} | ` +
      `${exEarn.toLocaleString('en-IN').padStart(13)} | ` +
      `${dbEarn.toLocaleString('en-IN').padStart(13)} | ` +
      `${earnMatch ? '  OK ' : ' MIS '} | ` +
      `${exExp.toLocaleString('en-IN').padStart(13)} | ` +
      `${dbExp.toLocaleString('en-IN').padStart(13)} | ` +
      `${expMatch ? '  OK ' : ' MIS '} | ` +
      `${diffMatch ? '    OK    ' : ' MISMATCH '} |`
    );
  }

  console.log('------------------------------------------------------');
  const exGrandEarn = Number(excelEarningRow[15]) || 0;
  const exGrandExp = Number(excelExpenseRow[15]) || 0;
  const exGrandDiff = Number(excelDiffRow[15]) || 0;
  const dbGrandDiff = totalEarningsImported - totalExpensesImported;

  console.log(`Excel Grand Total Earnings : ₹${exGrandEarn.toLocaleString('en-IN')}`);
  console.log(`DB Grand Total Earnings    : ₹${totalEarningsImported.toLocaleString('en-IN')}`);
  console.log(`Earnings 100% Match        : ${exGrandEarn === totalEarningsImported ? 'YES (EXACT)' : 'NO'}`);

  console.log(`Excel Grand Total Expenses : ₹${exGrandExp.toLocaleString('en-IN')}`);
  console.log(`DB Grand Total Expenses    : ₹${totalExpensesImported.toLocaleString('en-IN')}`);
  console.log(`Expenses 100% Match        : ${exGrandExp === totalExpensesImported ? 'YES (EXACT)' : 'NO'}`);

  console.log(`Excel Grand Difference     : ₹${exGrandDiff.toLocaleString('en-IN')}`);
  console.log(`DB Grand Difference        : ₹${dbGrandDiff.toLocaleString('en-IN')}`);
  console.log(`Difference 100% Match      : ${exGrandDiff === dbGrandDiff ? 'YES (EXACT)' : 'NO'}`);

  if (allMatch) {
    console.log('\nSUCCESS! ALL 12 MONTHS HAVE 100% EXACT NUMERICAL MATCH!');
  } else {
    console.log('\nWARNING: Discrepancy detected in one or more months.');
  }

  await mongoose.disconnect();
}

main().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
