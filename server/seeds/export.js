/**
 * MongoDB Data Export Script
 * Exports all collections to JSON files in server/seeds/data/
 * Run from server/ directory: node seeds/export.js
 */

const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

const DB_URI = 'mongodb://127.0.0.1:27017/property_rent_db';
const OUT_DIR = path.join(__dirname, 'data');

const COLLECTIONS = [
  'properties',
  'units',
  'tenants',
  'tenantassignments',
  'rentagreements',
  'paymentreceipts',
  'paymentallocations',
  'expenses',
  'expensecategories',
  'monthlyledgers',
  'pgsettlements',
  'users',
];

async function exportData() {
  await mongoose.connect(DB_URI);
  console.log('✅ Connected to MongoDB');

  if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
  }

  const db = mongoose.connection.db;

  for (const colName of COLLECTIONS) {
    try {
      const col = db.collection(colName);
      const docs = await col.find({}).toArray();
      const outFile = path.join(OUT_DIR, `${colName}.json`);
      fs.writeFileSync(outFile, JSON.stringify(docs, null, 2), 'utf8');
      console.log(`✅ Exported ${colName}: ${docs.length} documents → ${outFile}`);
    } catch (err) {
      console.error(`❌ Failed to export ${colName}:`, err.message);
    }
  }

  await mongoose.disconnect();
  console.log('\n🎉 Export complete! Files saved to server/seeds/data/');
}

exportData().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
