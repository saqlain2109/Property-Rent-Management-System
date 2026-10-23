const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('./models/User');
const { syncAll } = require('./scripts/syncAll5Sheets');
const { importHistorical } = require('./scripts/importHistorical2024_2025');

dotenv.config();

async function runSeed() {
  try {
    const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/property_rent_db';
    console.log('[Seed] Connecting to MongoDB:', mongoUri);
    await mongoose.connect(mongoUri);
    console.log('[Seed] Connected successfully.');

    // 1. Create Default Admin if not existing
    let admin = await User.findOne({ email: 'admin@propertyrent.com' });
    if (!admin) {
      console.log('[Seed] Creating default administrator user...');
      admin = await User.create({
        name: 'Administrator',
        username: 'admin',
        email: 'admin@propertyrent.com',
        password: 'AdminPassword123!',
        role: 'admin'
      });
      console.log('[Seed] Admin created: admin@propertyrent.com / AdminPassword123!');
    } else {
      if (!admin.username) {
        const usernameOwner = await User.findOne({
          username: 'admin',
          _id: { $ne: admin._id }
        });
        if (usernameOwner) {
          throw new Error('Cannot assign default username "admin": it is already in use');
        }
        admin.username = 'admin';
        await admin.save();
      }
      console.log('[Seed] Admin user already exists:', admin.email);
    }

    // 2. Execute full sync of 11 properties, 22 sub-units, 21 contracts, and receipts from the 5 sheets
    console.log('[Seed] Running canonical 5-sheet sync...');
    await syncAll();

    // 3. Import 12-month historical statements (2024-03 to 2025-02) and reconcile ledgers
    console.log('[Seed] Importing 2024-2025 historical rent & expenses statement...');
    await importHistorical();

    console.log('[Seed] Database initialization and migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('[Seed Error]', error);
    process.exit(1);
  }
}

runSeed();
