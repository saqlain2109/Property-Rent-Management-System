/**
 * MongoDB Data Restore Script
 * Imports all collections from server/seeds/data/ JSON files into MongoDB
 * Automatically casts 24-char hex IDs into BSON ObjectIds and Date strings into Date objects
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
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const DB_URI = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/property_rent_db';
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

function transformDoc(doc) {
  if (!doc || typeof doc !== 'object') return doc;
  const isObjectIdStr = (val) => typeof val === 'string' && /^[0-9a-fA-F]{24}$/.test(val);
  const isDateKey = (k) => [
    'createdAt', 'updatedAt', 'lastLogin', 'receiptDate', 'expenseDate', 
    'startDate', 'endDate', 'effectiveFrom', 'effectiveTo'
  ].includes(k);
  const isIdKey = (k) => k === '_id' || k.endsWith('Id') || [
    'propertyId', 'unitId', 'tenantId', 'receiptId', 'assignmentId', 'userId', 'entityId'
  ].includes(k);

  const transformed = Array.isArray(doc) ? [] : {};
  for (const [k, v] of Object.entries(doc)) {
    if (v === null || v === undefined) {
      transformed[k] = v;
    } else if (Array.isArray(v)) {
      transformed[k] = v.map(transformDoc);
    } else if (typeof v === 'object' && !(v instanceof Date)) {
      transformed[k] = transformDoc(v);
    } else if (isIdKey(k) && isObjectIdStr(v)) {
      transformed[k] = new mongoose.Types.ObjectId(v);
    } else if (isDateKey(k) && typeof v === 'string') {
      const d = new Date(v);
      transformed[k] = isNaN(d.getTime()) ? v : d;
    } else {
      transformed[k] = v;
    }
  }
  return transformed;
}

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

    const transformedDocs = docs.map(transformDoc);
    const col = db.collection(colName);

    if (CLEAR_EXISTING) {
      await col.deleteMany({});
      console.log(`🗑️  Cleared existing data in ${colName}`);
    }

    try {
      const result = await col.insertMany(transformedDocs, { ordered: false });
      console.log(`✅ Restored ${colName}: ${result.insertedCount} documents (ObjectIds & Dates cast properly)`);
    } catch (err) {
      if (err.code === 11000) {
        console.log(`ℹ️  ${colName}: Some documents already exist (duplicate key), skipped duplicates.`);
      } else {
        console.error(`❌ Failed to restore ${colName}:`, err.message);
      }
    }
  }

  await mongoose.disconnect();
  console.log('\n🎉 Restore complete with proper ObjectId and Date types!');
}

restoreData().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
