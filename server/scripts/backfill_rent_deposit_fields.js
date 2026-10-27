const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const PaymentReceipt = require('../models/PaymentReceipt');

async function backfill() {
  const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/property_rent_db';
  console.log('Connecting to:', uri);
  await mongoose.connect(uri);

  const receipts = await PaymentReceipt.find({});
  console.log(`Found ${receipts.length} receipts.`);

  let updatedCount = 0;
  for (const r of receipts) {
    let changed = false;
    if (r.rentAmount === undefined || r.rentAmount === null || (r.rentAmount === 0 && r.totalAmount > 0)) {
      r.rentAmount = r.totalAmount || 0;
      changed = true;
    }
    if (r.depositAmount === undefined || r.depositAmount === null) {
      r.depositAmount = 0;
      changed = true;
    }
    if (changed) {
      await r.save();
      updatedCount++;
    }
  }

  console.log(`Successfully backfilled ${updatedCount} receipts with rentAmount and depositAmount.`);
  await mongoose.disconnect();
}

backfill().catch(err => {
  console.error('Backfill error:', err);
  process.exit(1);
});
