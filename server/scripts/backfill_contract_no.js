const mongoose = require('mongoose');

async function run() {
  await mongoose.connect('mongodb://127.0.0.1:27017/property_rent_db');
  console.log('Connected to MongoDB');

  const assignments = await mongoose.connection.collection('tenantassignments').find().sort({ startDate: 1, createdAt: 1 }).toArray();
  const tenants = await mongoose.connection.collection('tenants').find().toArray();
  const tMap = new Map(tenants.map(t => [String(t._id), t]));

  function getShortName(tenantName) {
    if (!tenantName) return 'Tenant';
    let clean = tenantName.replace(/^(with\s+)/i, '').trim();
    if (/^snip/i.test(clean)) return 'Snip';
    if (/^water/i.test(clean)) return 'WaterWala';
    if (/^dg/i.test(clean)) return 'DG';
    if (/^pg/i.test(clean)) return 'PG';
    if (/^delhiery/i.test(clean)) return 'Delhiery';
    if (/^amir/i.test(clean)) return 'Amir';
    let first = clean.split(/[\s\-()]+/)[0];
    return first.charAt(0).toUpperCase() + first.slice(1);
  }

  const groups = {};
  assignments.forEach(a => {
    const t = tMap.get(String(a.tenantId));
    const shortName = getShortName(t ? t.name : '');
    const yr = a.startDate ? new Date(a.startDate).getFullYear() : 2026;
    const key = `${shortName}-${yr}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(a);
  });

  let updated = 0;
  for (const key of Object.keys(groups)) {
    const list = groups[key];
    if (list.length === 1) {
      await mongoose.connection.collection('tenantassignments').updateOne({ _id: list[0]._id }, { $set: { contractNo: key } });
      updated++;
    } else {
      for (let i = 0; i < list.length; i++) {
        const cNo = `${key}-${i + 1}`;
        await mongoose.connection.collection('tenantassignments').updateOne({ _id: list[i]._id }, { $set: { contractNo: cNo } });
        updated++;
      }
    }
  }

  console.log(`Successfully backfilled contractNo for ${updated} contracts`);
  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
