const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const ExpenseCategory = require('../models/ExpenseCategory');

async function seedHeads() {
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/property_rent_db';
  await mongoose.connect(mongoUri);

  const propertyHeads = [
    'Maintenance',
    'Electricity & Utilities',
    'Repairs & Renovation',
    'Sweeper & Cleaning',
    'Water Charges',
    'Property Rent Paid',
    'Deposit Refund',
    'Property Tax',
    'Other expenses'
  ];

  const commonHeads = [
    'MOM',
    'Margaret',
    'Islamic & Zakat',
    'Zakat',
    'Sadka',
    'Send to dubai',
    'IT Fees',
    'Donations',
    'Miscellaneous',
    'Miscellaneous exp',
    'Micellaneous Expenses',
    'Akbar',
    'Loan asgar Bhati',
    'Loan give to Gafoor',
    'Other'
  ];

  for (const name of propertyHeads) {
    await ExpenseCategory.updateOne(
      { name },
      { $set: { name, headType: 'Property', isDefault: true } },
      { upsert: true }
    );
  }

  for (const name of commonHeads) {
    await ExpenseCategory.updateOne(
      { name },
      { $set: { name, headType: 'Common', isDefault: true } },
      { upsert: true }
    );
  }

  const all = await ExpenseCategory.find().sort({ headType: 1, name: 1 });
  console.log(`[ExpenseCategory Master] Synced ${all.length} categories.`);
  console.log('Property heads:', all.filter(c => c.headType === 'Property').map(c => c.name));
  console.log('Common heads:', all.filter(c => c.headType === 'Common').map(c => c.name));
  process.exit(0);
}

seedHeads().catch(err => {
  console.error(err);
  process.exit(1);
});
