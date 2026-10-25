const connectDB = require('../config/db');
require('../models/Property');
require('../models/Unit');
require('../models/Tenant');
const Property = require('../models/Property');
const Unit = require('../models/Unit');
const Tenant = require('../models/Tenant');
const TenantAssignment = require('../models/TenantAssignment');
const RentAgreement = require('../models/RentAgreement');

const rawCsvData = `Property,Sub Property / Partition,Tenant,Rent Per month,Rent per Annum,Deposit,Start Date,End Date,Contract Status,Comments,,Rent Frequency
65 no godown,65 Large Godown,Delhiery,78750,945000,300000,1 Sept 2026,Ongoing,Active,5% rent escalation from Sep 2026,,Monthly Fixed
65 no godown,65 Large Godown,Delhiery,78750,945000,300000,1 Sept 2025,30 Aug 2026,Ended,"Rents is 1,50,000 and 50% is compnay i.e. 75000 per month. Paid till Mar 26",,Monthly Fixed
65 no godown,65 Small Godown,Mohammed Nasir Qurashi,10500,126000,0,1 Oct 2026,Ongoing,Active,from 01/10/26 total rent is 21000,,Monthly Fixed
65 no godown,65 Small Godown,Rehan,9500,114000,25000,1 Feb 2026,30 Sept 2026,Ended,rent increased,,Monthly Fixed
Barankers room  - Building 65 No,1st Floor,Anjana Ashok Salunke,7000,84000,20000,1 Jan 2023,Ongoing,Active,"from jan 23, Paid Oct 25",,Monthly Fixed
Barankers room  - Building 65 No,Mezzanine,Umesh,5500,66000,0,1 Jun 2018,Ongoing,Active,Increase to 5500 form june 18. Paid Aug 25,,Monthly Fixed
Barankers room  - Building 65 No,Mezzanine,Umesh,5500,66000,0,1 Apr 2015,31 May 2018,Ended,from april 15,,Monthly Fixed
Byculla Club,1st Floor,Amir Kids,80000,960000,300000,2023-11-01,2026-10-30,ended,,,
Byculla Club,1st Floor,Amir Kids,88000,1056000,300000,1 Nov 2025,Ongoing,Active,"rent increase in nov 25: 48000 cash paid up to 31st Mar 26, 40000 check paid monthly. Paid till Mar 26",,Monthly Fixed
Byculla Club,1st Floor,Amir Kids,88000,1056000,300000,1 Nov 2024,30 Oct 2025,Ended,300000 depsot and rent 80000 from 1st Nov,,Monthly Fixed
Byculla Club,1st Floor,Basar,93583,1122996,, ,2016-05-30,,,,
Byculla Club,1st Floor,Basar,97833.333333333328,1174000, ,2016-06-01,2023-09-30,Ended,pd 1122000 in may 16,,Monthly Fixed
Byculla Club,Mezzanine,Romel,50000,600000,0,1 Feb 2021,Ongoing,Active,"Pd 2lac in feb21, pd 150000 in Jan 26 sheet for Oct, Nov, Dec 25. Paid till Dec 25",,Monthly Fixed
Byculla Club,Mezzanine,Raju Bhai,35000,420000,0,9 Oct 2016,30 Jul 2019,Ended,"pd 50,000 in oct 15 and 3,10,000 in nov 15",,Monthly Fixed
Ennas Room,Ennas Room,Bengali,22000,264000,0,1 Jan 2025,Ongoing,Active,"rent increased from 20000 to 22000 in Jan 25, Paid till Dec 25 + 10k part pay Jan 26",,Monthly Fixed
Ennas Room,Ennas Room,Bengali,22000,264000,0,1 Feb 2023,31 Dec 2024,Ended,rent increased from 18000 to 20000 in feb 23,,Monthly Fixed
Garage,Chira Bazar House,Altaf,20000,240000,,2014-01-01,2022-03-30,Ended,,,
Garage,Chira Bazar House,Altaf,22000,264000,0,1 Apr 2022,Ongoing,Active,"rent increased to 22000 in apr 22, Paid till Nov 25",,Monthly Fixed
Garage,Godown,Anand,10000,120000,0,1 Jan 2014,Ongoing,Active,"rented from jan 2014 @20,000 per month, Paid till Nov 25",,Monthly Fixed
Garage,Shop 1,DG Cable,25000,300000,0,2025-01-01,Ongoing,Active,"Rent increase in Jan 25, paid 140k for 4 months (Oct 25 - Jan 26) in Feb 26 sheet",,Monthly Fixed
Garage,Shop 2,Snip- Salman Ahmed,36000,432000,100000,1 Aug 2026,Ongoing,Active,rent is 36000 and deposit 1 lac given on rent from 1st aug 26,,Monthly Fixed
Garage,Shop 2,Snip - Irfan Ansari,32000,384000,0,1 Jun 2025,1 Jun 2026,Ended,"rent increase in june 2025, paid till Mar 26",,Monthly Fixed
Goa Flat,Flat no 1,Asif,22000,264000,0,2025-11-01,2026-08-30,Ended,"rent increased to 22000, paid till Mar 26",,Monthly Fixed
Goa Flat,Flat no 1,Asif,23000,276000,0,2026-09-01, ,Active,"empty from may 17, rented to Asif",,Monthly Fixed
Kandivli,Flat No 2108,Tenant 2108 (Fatu),12000,144000,0,1 Jan 2024,Ongoing,Active,rent increase to 12000. Paid Feb 26,,Monthly Fixed
Kandivli,Flat No 2108,Tenant 2108 (Fatu),12000,144000,0,1 Jan 2020,31 Dec 2023,Ended,rent was 11000,,Monthly Fixed
Kandivli,Flat No 2109,Tenant 2109,12000,144000,0,1 Jan 2024,Ongoing,Active,rent increase to 12000. Paid Feb 26,,Monthly Fixed
Kandivli,Flat No 2109,Tenant 2109,12000,144000,0,1 Jan 2020,31 Dec 2023,Ended,rent was 11000,,Monthly Fixed
Kotak Godaown (66 Godown),PG,PG,81050,972600,0,1 Jan 2018,Ongoing,Active,PG settled till Nov 2025 (Jan 26 recorded collection),,Monthly Fixed
Kotak Godaown (66 Godown),Small Godown,Water Wala,20250,243000,0,1 Jan 2018,Ongoing,Active,"from Jan 2018 rent increased to 17250, feb 2022 to 20250. Paid till Nov 25",,Monthly Fixed
Mani Mansion,Mani Mansion -Room 1,Aswini Derad Monga,16000,192000,50000,1 Feb 2026,2026-07-30,Ended,"rents increase to 16000 in feb 26, paid till Mar 26",,Monthly Fixed
Mani Mansion,Mani Mansion -Room 1,Aswini Derad Monga,16000,192000,50000,1 Jan 2024,31 Jan 2026,Ended,"from Jan 24 deposit 50,000, paid till Mar 26",,Monthly Fixed
Mani Mansion,Mani Mansion -Room 1,Jayanti Bhai,12000,144000,50000,1 Sept 2021,31 Dec 2023,Ended,from sep 21,,Monthly Fixed
Mani Mansion,Mani Mansion -Room 1,Dinesh,13000,156000,0,1 Feb 2017,28 Feb 2019,Ended,from feb 2017,,Monthly Fixed
Mani Mansion,Mani Mansion -Room 2,With Snip Saloon,3000,36000,0,1 Sept 2012,Ongoing,Active,snip worker pay 3000 from sept 12,,Monthly Fixed
Room No 10 - Building 65 No,Room No 10 - Building 65 No,Santosh,9000,108000,25000,1 May 2025,Ongoing,Active,new tenent from 09/05/25 deposit 25000. Paid Oct 25,,Monthly Fixed
Room No 10 - Building 65 No,Room No 10 - Building 65 No,Kamlesh,8000,96000,20000,1 Oct 2023,31 Mar 2024,Ended,from Oct 23 paid 20000 deposit,,Monthly Fixed
Tony room (Roshan Manzil),Tony Room 1,DG,10000,120000,0,1 Jan 2016,Ongoing,Active,DG Cable Tony Room,,Monthly Fixed
Tony room (Roshan Manzil),Tony Room 2,Jite Damai,10000,120000,0,1 Apr 2026,Ongoing,Active,New tenant from Apr 2026,,Monthly Fixed
Tony room (Roshan Manzil),Tony Room 2,Santu Hajra,10000,120000,0,1 Jan 2024,31 Mar 2026,Ended,"Paid till Mar 26, left in Mar 26",,Monthly Fixed`;

function parseDate(str) {
  if (!str) return null;
  const s = str.trim();
  if (!s || s.toLowerCase() === 'ongoing' || s === '-') return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(s + 'T00:00:00.000Z');
  const months = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11 };
  const m = s.match(/^(\d+)\s+([a-zA-Z]+)\s+(\d{4})$/);
  if (m) {
    const day = parseInt(m[1], 10);
    const mon = months[m[2].toLowerCase()];
    const yr = parseInt(m[3], 10);
    if (mon !== undefined) {
      return new Date(Date.UTC(yr, mon, day));
    }
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function parseCsv(text) {
  const lines = text.trim().split('\n');
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    let inQuotes = false;
    let token = '';
    const cols = [];
    for (let c = 0; c < line.length; c++) {
      const ch = line[c];
      if (ch === '"') inQuotes = !inQuotes;
      else if (ch === ',' && !inQuotes) {
        cols.push(token);
        token = '';
      } else {
        token += ch;
      }
    }
    cols.push(token);
    rows.push(cols);
  }
  return rows;
}

async function run() {
  await connectDB();
  console.log('[Sync] Starting contract & lease sync...');

  const properties = await Property.find();
  const units = await Unit.find().populate('propertyId');
  const tenants = await Tenant.find();

  const propMap = new Map();
  properties.forEach(p => {
    propMap.set(p.name.trim().toLowerCase(), p);
  });

  const unitMap = new Map();
  units.forEach(u => {
    const pName = (u.propertyId?.name || '').trim().toLowerCase();
    const uName = (u.subUnitPartition || u.unitName || '').trim().toLowerCase();
    unitMap.set(`${pName}::${uName}`, u);
  });

  const tenantMap = new Map();
  tenants.forEach(t => {
    tenantMap.set(t.name.trim().toLowerCase(), t);
  });

  const rows = parseCsv(rawCsvData);
  console.log(`[Sync] Found ${rows.length} rows to process.`);

  let createdCount = 0;
  let updatedCount = 0;

  for (let i = 0; i < rows.length; i++) {
    const [propName, unitName, tenantName, monthlyStr, annualStr, depositStr, startStr, endStr, statusStr, comments, empty, freqStr] = rows[i];
    
    const pKey = propName.trim().toLowerCase();
    const uKey = unitName.trim().toLowerCase();
    const tKey = tenantName.trim().toLowerCase();

    const prop = propMap.get(pKey);
    const unit = unitMap.get(`${pKey}::${uKey}`);
    const tenant = tenantMap.get(tKey);

    if (!prop) {
      console.error(`[Error] Property not found: "${propName}"`);
      continue;
    }
    if (!unit) {
      console.error(`[Error] Unit not found: "${propName}" -> "${unitName}"`);
      continue;
    }
    if (!tenant) {
      console.error(`[Error] Tenant not found: "${tenantName}"`);
      continue;
    }

    const startDate = parseDate(startStr);
    const endDate = parseDate(endStr);
    const monthlyRate = parseFloat(monthlyStr) || 0;
    const annualRate = parseFloat(annualStr) || (monthlyRate * 12);
    const depositHeld = parseFloat(depositStr) || 0;
    const cleanStatus = (statusStr && statusStr.toLowerCase() === 'active') ? 'Active' : 'Ended';
    const cleanRentType = (freqStr && freqStr.trim()) ? freqStr.trim() : 'Monthly Fixed';
    const notes = (comments || '').trim();

    // Look for matching assignment by tenant, unit, and approx startDate
    let match = await TenantAssignment.findOne({
      tenantId: tenant._id,
      unitId: unit._id,
      ...(startDate ? {
        startDate: {
          $gte: new Date(startDate.getTime() - 45 * 24 * 3600 * 1000),
          $lte: new Date(startDate.getTime() + 45 * 24 * 3600 * 1000)
        }
      } : {})
    });

    // If not found and startDate is null, search without startDate
    if (!match && !startDate) {
      match = await TenantAssignment.findOne({
        tenantId: tenant._id,
        unitId: unit._id
      });
    }

    if (match) {
      // Update existing assignment
      match.startDate = startDate;
      match.endDate = endDate;
      match.status = cleanStatus;
      match.depositHeld = depositHeld;
      if (notes) match.notes = notes;
      await match.save();

      // Update or create RentAgreement
      let agreement = await RentAgreement.findOne({ assignmentId: match._id });
      if (agreement) {
        agreement.monthlyRate = monthlyRate;
        agreement.annualRate = annualRate;
        agreement.rentType = cleanRentType;
        agreement.effectiveFrom = startDate;
        agreement.effectiveTo = endDate;
        agreement.isCurrentRate = cleanStatus === 'Active';
        if (notes) agreement.terms = notes;
        await agreement.save();
      } else {
        await RentAgreement.create({
          assignmentId: match._id,
          unitId: unit._id,
          tenantId: tenant._id,
          rentType: cleanRentType,
          monthlyRate: monthlyRate,
          annualRate: annualRate,
          effectiveFrom: startDate,
          effectiveTo: endDate,
          isCurrentRate: cleanStatus === 'Active',
          terms: notes
        });
      }
      updatedCount++;
      console.log(`[Updated] ${prop.name} | ${unit.subUnitPartition || unit.unitName} | ${tenant.name} | ₹${monthlyRate} | ${cleanStatus}`);
    } else {
      // Create new TenantAssignment
      const codeSuffix = Math.floor(1000 + Math.random() * 9000);
      const cleanP = prop.name.replace(/[^a-zA-Z0-9]/g, '').slice(0, 3).toUpperCase();
      const cleanU = (unit.subUnitPartition || unit.unitName).replace(/[^a-zA-Z0-9]/g, '').slice(0, 5).toUpperCase();
      const cleanT = tenant.name.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8).toUpperCase();
      const assignmentCode = `ASGN-${cleanP}-${cleanU}-${cleanT}-${codeSuffix}`;

      const newAssign = await TenantAssignment.create({
        assignmentCode,
        tenantId: tenant._id,
        unitId: unit._id,
        startDate: startDate,
        endDate: endDate,
        status: cleanStatus,
        contractType: 'Rent',
        depositHeld: depositHeld,
        notes: notes
      });

      await RentAgreement.create({
        assignmentId: newAssign._id,
        unitId: unit._id,
        tenantId: tenant._id,
        rentType: cleanRentType,
        monthlyRate: monthlyRate,
        annualRate: annualRate,
        effectiveFrom: startDate,
        effectiveTo: endDate,
        isCurrentRate: cleanStatus === 'Active',
        terms: notes
      });

      createdCount++;
      console.log(`[Created] ${prop.name} | ${unit.subUnitPartition || unit.unitName} | ${tenant.name} | ₹${monthlyRate} | ${cleanStatus}`);
    }
  }

  console.log(`\n[Sync Summary] Completed! Created: ${createdCount}, Updated: ${updatedCount}, Total: ${rows.length}`);
  process.exit(0);
}

run().catch(err => {
  console.error('[Sync Fatal Error]', err);
  process.exit(1);
});
