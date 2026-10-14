const mongoose = require('mongoose');
require('dotenv').config({ path: './server/.env' });
const TenantAssignment = require('../models/TenantAssignment');
const Unit = require('../models/Unit');

async function updateHistorical() {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/property_rent_db');
    console.log('Connected to MongoDB');

    const units = await Unit.find({});
    console.log(`Found ${units.length} total units in DB`);

    const mappings = [
      { key: 'WATER', month: '2025-11' },   // Bisleri Water
      { key: 'PG', month: '2025-11' },      // Kotak PG
      { key: 'DGCABLE', month: '2025-09' }, // DG Cable
      { key: 'ALTAF', month: '2025-11' },   // Altaf
      { key: 'ANAND', month: '2025-11' },   // Anand
      { key: 'REHAN', month: '2025-07' },   // Rehan (or GO1)
      { key: 'UTTAM', month: '2025-08' },   // Uttam
      { key: 'ANJANA', month: '2025-10' },  // Anjana
      { key: 'SANTOSH', month: '2025-10' }, // Dinesh Chaklani / Santosh
      { key: 'BENGALI', month: '2025-12' }, // Bengali
      { key: 'ROMEL', month: '2025-12' },   // Romel
      { key: '2108', month: '2025-12' },    // Tenant 2108
      { key: '2109', month: '2025-12' }     // Tenant 2109
    ];

    for (const m of mappings) {
      const matchedUnits = units.filter(u => 
        (u.unitCode && u.unitCode.toUpperCase().includes(m.key)) || 
        (u.unitName && u.unitName.toUpperCase().includes(m.key))
      );
      
      for (const u of matchedUnits) {
        const res = await TenantAssignment.updateMany(
          { unitId: u._id, status: 'Active' },
          { $set: { initialPaidTillMonth: m.month } }
        );
        console.log(`Matched [${m.key}] -> Unit: ${u.unitCode} (${u.unitName}) -> Set to ${m.month}, modified: ${res.modifiedCount}`);
      }
    }

    console.log('Update complete!');
  } catch (err) {
    console.error('Error updating historical data:', err);
  } finally {
    process.exit(0);
  }
}

updateHistorical();
