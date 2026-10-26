/**
 * MongoDB Data Restore Script
 * Imports all collections from server/seeds/data/ JSON files into MongoDB
 *
 * Usage:
 *   cd server
 *   node seeds/restore.js
 *
 * Optional: Clear existing data before restore (drops each collection first)
 *   CLEAR_EXISTING=true node seeds/restore.js
 */

const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

const DB_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/property_rent_db';
const DATA_DIR = path.join(__dirname, 'data');
const CLEAR_EXISTING = process.env.CLEAR_EXISTING === 'true';

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

async function restoreData() {
  await mongoose.connect(DB_URI);
  console.log('✅ Connected to MongoDB:', DB_URI);

  const db = mongoose.connection.db;

  for (const colName of COLLECTIONS) {
    const filePath = path.join(DATA_DIR, `${colName}.json`);

    if (!fs.existsSync(filePath)) {
      console.warn(`⚠️  Skipping ${colName} — file not found: ${filePath}`);
      continue;
    }

    const docs = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!docs.length) {
      console.log(`ℹ️  ${colName}: 0 documents, skipping.`);
      continue;
    }

    const col = db.collection(colName);

    if (CLEAR_EXISTING) {
      await col.deleteMany({});
      console.log(`🗑️  Cleared existing data in ${colName}`);
    }

    try {
      const result = await col.insertMany(docs, { ordered: false });
      console.log(`✅ Restored ${colName}: ${result.insertedCount} documents`);
    } catch (err) {
      if (err.code === 11000) {
        console.log(`ℹ️  ${colName}: Some documents already exist (duplicate key), skipped duplicates.`);
      } else {
        console.error(`❌ Failed to restore ${colName}:`, err.message);
      }
    }
  }

  await mongoose.disconnect();
  console.log('\n🎉 Restore complete!');
}

restoreData().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
