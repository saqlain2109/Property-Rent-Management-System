const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');
const connectDB = require('../config/db');

const Expense = require('../models/Expense');
const ExpenseCategory = require('../models/ExpenseCategory');

async function migrate() {
  await connectDB();
  console.log('MongoDB connected for migration');

  // 1. Update ExpenseCategory records
  console.log('\n--- Migrating ExpenseCategory Documents ---');
  const catRes = await ExpenseCategory.updateMany(
    { headType: 'Common' },
    { $set: { headType: 'Other' } }
  );
  console.log(`Updated ${catRes.modifiedCount} categories from 'Common' to 'Other'`);

  // Ensure default heads are cleanly classified
  const propertyHeads = [
    'Maintenance', 'Electricity & Utilities', 'Repairs & Renovation', 
    'Sweeper & Cleaning', 'Water Charges', 'Property Rent Paid', 
    'Deposit Refund', 'Property Tax', 'Other expenses'
  ];
  const otherHeads = [
    'MOM', 'Margaret', 'Islamic & Zakat', 'Zakat', 'Sadka', 
    'Send to dubai', 'IT Fees', 'Donations', 'Miscellaneous', 
    'Miscellaneous exp', 'Micellaneous Expenses', 'Akbar', 
    'Loan', 'Loan asgar Bhati', 'Loan give to Gafoor', 'Other'
  ];

  for (const h of propertyHeads) {
    await ExpenseCategory.updateOne(
      { name: h },
      { $set: { headType: 'Property' }, $setOnInsert: { isDefault: true } },
      { upsert: true }
    );
  }
  for (const h of otherHeads) {
    await ExpenseCategory.updateOne(
      { name: h },
      { $set: { headType: 'Other' }, $setOnInsert: { isDefault: true } },
      { upsert: true }
    );
  }

  const allCats = await ExpenseCategory.find();
  console.log(`Total Expense Categories: ${allCats.length}`);
  const propCats = allCats.filter(c => c.headType === 'Property').map(c => c.name);
  const otherCats = allCats.filter(c => c.headType === 'Other').map(c => c.name);
  console.log('Property heads count:', propCats.length);
  console.log('Other heads count:', otherCats.length);

  // 2. Classify all Expense records
  console.log('\n--- Classifying All Expense Documents ---');

  // First, fix the 22 FY 2019-20 records without propertyId that were miscategorized as Maintenance
  const fixMiscRes = await Expense.updateMany(
    {
      category: 'Maintenance',
      propertyId: null,
      $or: [
        { description: { $regex: /miscellan/i } },
        { description: { $regex: /micellaneous/i } }
      ]
    },
    {
      $set: {
        category: 'Miscellaneous',
        headType: 'Other'
      }
    }
  );
  console.log(`Updated ${fixMiscRes.modifiedCount} FY19-20 records from Maintenance to Miscellaneous (Other)`);

  // Classify all with propertyId as 'Property'
  const propExpRes = await Expense.updateMany(
    { propertyId: { $ne: null } },
    { $set: { headType: 'Property' } }
  );
  console.log(`Classified ${propExpRes.modifiedCount} expenses with propertyId as 'Property'`);

  // Classify all without propertyId as 'Other'
  const otherExpRes = await Expense.updateMany(
    { propertyId: null },
    { $set: { headType: 'Other' } }
  );
  console.log(`Classified ${otherExpRes.modifiedCount} expenses without propertyId as 'Other'`);

  // Verify full classification
  const total = await Expense.countDocuments();
  const propCount = await Expense.countDocuments({ headType: 'Property' });
  const otherCount = await Expense.countDocuments({ headType: 'Other' });
  const unclassified = await Expense.countDocuments({ headType: { $nin: ['Property', 'Other'] } });

  console.log('\n--- Final Classification Audit ---');
  console.log(`Total Expenses: ${total}`);
  console.log(`Property Expenses: ${propCount}`);
  console.log(`Other Expenses: ${otherCount}`);
  console.log(`Unclassified: ${unclassified}`);

  if (unclassified === 0 && total === propCount + otherCount) {
    console.log('SUCCESS: All expenses are 100% classified into Property or Other!');
  } else {
    console.error('WARNING: Found unclassified expenses!');
  }

  process.exit(0);
}

migrate().catch(e => {
  console.error('Fatal migration error:', e);
  process.exit(1);
});
