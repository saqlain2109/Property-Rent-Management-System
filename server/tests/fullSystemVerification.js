const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const assert = require('assert');

async function runFullVerification() {
  console.log('==================================================');
  console.log('🚀 RUNNING FULL END-TO-END SYSTEM VERIFICATION');
  console.log('==================================================');

  await mongoose.connect('mongodb://127.0.0.1:27017/property_rent_db');

  const User = require('../models/User');
  const Property = require('../models/Property');
  const Unit = require('../models/Unit');
  const Tenant = require('../models/Tenant');
  const TenantAssignment = require('../models/TenantAssignment');
  const RentAgreement = require('../models/RentAgreement');
  const Expense = require('../models/Expense');
  const PaymentReceipt = require('../models/PaymentReceipt');
  const PaymentAllocation = require('../models/PaymentAllocation');
  const MonthlyLedger = require('../models/MonthlyLedger');
  const { calculateTenantUnitLedger, getEffectiveRentForMonth, calculateMonthRatio } = require('../services/rentCalculator');

  const admin = await User.findOne();
  const token = jwt.sign(
    { id: admin._id },
    process.env.JWT_SECRET || 'super_secret_jwt_key_property_rent_2026_xyz!@#',
    { expiresIn: '1h' }
  );

  const BASE_URL = 'http://127.0.0.1:5000/api';

  // --------------------------------------------------------------------------
  // TEST 1: Prorated Rent Calculations
  // --------------------------------------------------------------------------
  const testUnitId = new mongoose.Types.ObjectId();
  const testTenantId = new mongoose.Types.ObjectId();
  const mockAssignStart15 = {
    startDate: new Date('2026-04-15'),
    endDate: null
  };

  // Clean up any test agreements before starting
  await RentAgreement.deleteMany({ unitId: testUnitId, tenantId: testTenantId });

  // 1a. Starts on 15th with 9,000 monthly rate
  const tempAgr1 = await RentAgreement.create({
    assignmentId: new mongoose.Types.ObjectId(),
    unitId: testUnitId,
    tenantId: testTenantId,
    monthlyRate: 9000,
    effectiveFrom: new Date('2026-04-15'),
    effectiveTo: null,
    isCurrentRate: true
  });

  const aprilRent = await getEffectiveRentForMonth(testUnitId, testTenantId, '2026-04', mockAssignStart15);
  console.log('1a. April Rent (starts on 15th, Rate 9000):', aprilRent);
  assert.strictEqual(aprilRent, 4500, 'Expected exactly 4500 for 15th start on 9000 rate');
  await RentAgreement.deleteOne({ _id: tempAgr1._id });

  // 1b. Ends mid-month on 15th
  const tempAgrEnd = await RentAgreement.create({
    assignmentId: new mongoose.Types.ObjectId(),
    unitId: testUnitId,
    tenantId: testTenantId,
    monthlyRate: 9000,
    effectiveFrom: new Date('2026-01-01'),
    effectiveTo: null,
    isCurrentRate: true
  });
  const mockAssignEnd15 = {
    startDate: new Date('2026-01-01'),
    endDate: new Date('2026-04-15')
  };
  const aprilEndRent = await getEffectiveRentForMonth(testUnitId, testTenantId, '2026-04', mockAssignEnd15);
  console.log('1b. April Rent (ends on 15th, Rate 9000):', aprilEndRent);
  assert.strictEqual(aprilEndRent, 4500, 'Expected exactly 4500 for 15th vacate on 9000 rate');
  await RentAgreement.deleteOne({ _id: tempAgrEnd._id });

  // 1c. Mid-month rate revision (e.g. 8000 old rate to 10000 new rate starting on 15th)
  const tempAgrOld = await RentAgreement.create({
    assignmentId: new mongoose.Types.ObjectId(),
    unitId: testUnitId,
    tenantId: testTenantId,
    monthlyRate: 8000,
    effectiveFrom: new Date('2026-05-01'),
    effectiveTo: new Date('2026-05-14'),
    isCurrentRate: false
  });
  const tempAgrNew = await RentAgreement.create({
    assignmentId: tempAgrOld.assignmentId,
    unitId: testUnitId,
    tenantId: testTenantId,
    monthlyRate: 10000,
    effectiveFrom: new Date('2026-05-15'),
    effectiveTo: null,
    isCurrentRate: true
  });
  const mockAssignFullMay = {
    startDate: new Date('2026-01-01'),
    endDate: null
  };
  const mayRent = await getEffectiveRentForMonth(testUnitId, testTenantId, '2026-05', mockAssignFullMay);
  console.log('1c. May Rent (split 8k old + 10k new on 15th):', mayRent);
  assert.strictEqual(mayRent, 9000, 'Expected exactly 9000 (4000 + 5000) for 15th rate split');

  // Clean up temp agreements
  await RentAgreement.deleteMany({ _id: { $in: [tempAgrOld._id, tempAgrNew._id] } });
  console.log('✅ Proration tests PASSED perfectly!');

  // --------------------------------------------------------------------------
  // TEST 2: Contracts API with rateHistory and Expected/Received Totals
  // --------------------------------------------------------------------------
  console.log('\n--- 2. Testing Contracts API (/api/assignments) ---');
  const contractsRes = await fetch(`${BASE_URL}/assignments`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const contractsData = await contractsRes.json();
  if (!contractsData.success) {
    console.error('contractsData error:', contractsData);
  }
  console.log('Contracts count returned:', contractsData.data?.length);
  assert.strictEqual(contractsData.success, true, 'Contracts endpoint must succeed');
  assert.ok(contractsData.data.length > 0, 'Must return contracts');

  const firstContract = contractsData.data[0];
  console.log('Sample Contract:', {
    code: firstContract.assignmentCode,
    tenant: firstContract.tenantId?.name,
    property: firstContract.unitId?.propertyId?.name,
    unit: firstContract.unitId?.unitName,
    currentRate: firstContract.currentMonthlyRate,
    totalExpected: firstContract.totalExpected,
    totalReceived: firstContract.totalReceived,
    outstanding: firstContract.outstandingBalance,
    rateHistoryCount: firstContract.rateHistory?.length
  });
  assert.ok(firstContract.rateHistory !== undefined, 'rateHistory must be present on contract');
  assert.ok(firstContract.totalExpected !== undefined, 'totalExpected must be present on contract');
  console.log('✅ Contracts API enrichment PASSED!');

  // --------------------------------------------------------------------------
  // TEST 3: Expense Entry by Month
  // --------------------------------------------------------------------------
  console.log('\n--- 3. Testing Expense Entry by Month ---');
  const newExpRes = await fetch(`${BASE_URL}/expenses`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      expenseMonth: '2026-03', // Assigned directly by month without requiring specific date!
      category: 'Maintenance',
      amount: 1250,
      description: 'Proration verification test plumbing expense',
      vendorOrPayee: 'Apex Services',
      paymentMode: 'Cash'
    })
  });
  const expJson = await newExpRes.json();
  console.log('Create Expense by Month response:', {
    success: expJson.success,
    code: expJson.data?.expenseCode,
    expenseMonth: expJson.data?.expenseMonth,
    expenseDate: expJson.data?.expenseDate,
    amount: expJson.data?.amount
  });
  assert.strictEqual(expJson.success, true, 'Expense creation by month must succeed');
  assert.strictEqual(expJson.data.expenseMonth, '2026-03', 'Expense month must be 2026-03');

  // Clean up created test expense
  if (expJson.data?._id) {
    await Expense.findByIdAndDelete(expJson.data._id);
  }
  console.log('✅ Expense entry by month PASSED!');

  // --------------------------------------------------------------------------
  // TEST 4: Monthly Unified Report & Excel Export
  // --------------------------------------------------------------------------
  console.log('\n--- 4. Testing Monthly Unified Report & Excel Export ---');
  const reportRes = await fetch(`${BASE_URL}/reports/monthly-unified-report?month=2026-03`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const repJson = await reportRes.json();
  console.log('Monthly Unified Report for 2026-03:', {
    success: repJson.success,
    targetMonth: repJson.targetMonth,
    rentEntriesCount: repJson.rentEntries?.length,
    totalRentIncome: repJson.totalRentIncome,
    expenseEntriesCount: repJson.expenseEntries?.length,
    totalExpenses: repJson.totalExpenses,
    netDifference: repJson.netDifference,
    openingBalance: repJson.openingBalance,
    closingBalance: repJson.closingBalance,
    monthOutstandingRent: repJson.monthOutstandingRent
  });
  assert.strictEqual(repJson.success, true, 'Monthly unified report must succeed');

  if (repJson.rentEntries?.length > 0) {
    const r0 = repJson.rentEntries[0];
    console.log('Sample Rent Entry columns:', Object.keys(r0));
    assert.strictEqual(r0.date, undefined, 'Rent entry MUST NOT include specific date');
    assert.strictEqual(r0.receiptNumber, undefined, 'Rent entry MUST NOT include receipt number');
    assert.ok(r0.tenant && r0.property && r0.unit && r0.amount, 'Rent entry must include Tenant, Property, Unit, Amount');
  }

  // 4b. Test Excel Export
  const excelRes = await fetch(`${BASE_URL}/reports/export-monthly-excel?month=2026-03`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  console.log('Excel Export HTTP Status:', excelRes.status, 'Content-Type:', excelRes.headers.get('content-type'));
  assert.strictEqual(excelRes.status, 200, 'Excel export must return status 200');
  const excelBuffer = await excelRes.arrayBuffer();
  console.log('Excel file byte size:', excelBuffer.byteLength);
  assert.ok(excelBuffer.byteLength > 1000, 'Excel workbook buffer must be valid');
  console.log('✅ Monthly Unified Report & Single-Sheet Excel Export PASSED!');

  // --------------------------------------------------------------------------
  // TEST 5: Dashboard Summary & Available Months
  // --------------------------------------------------------------------------
  console.log('\n--- 5. Testing Dashboard Summary ---');
  const dashRes = await fetch(`${BASE_URL}/dashboard/summary?targetMonth=2026-03`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const dashJson = await dashRes.json();
  console.log('Dashboard Summary:', {
    success: dashJson.success,
    availableMonthsCount: dashJson.availableMonths?.length,
    totalProperties: dashJson.stats?.totalProperties,
    totalUnits: dashJson.stats?.totalUnits,
    activeTenants: dashJson.stats?.activeTenants,
    currentMonthCollected: dashJson.stats?.currentMonthCollected,
    currentMonthExpenses: dashJson.stats?.currentMonthExpenses
  });
  assert.strictEqual(dashJson.success, true, 'Dashboard summary must succeed');
  assert.ok(dashJson.availableMonths.length >= 24, 'Available months should cover 2025-2027 continuous sequence');
  console.log('✅ Dashboard Summary PASSED!');

  await mongoose.disconnect();
  console.log('\n==================================================');
  console.log('🎉 ALL 5 SYSTEM VERIFICATION TEST SUITES PASSED 100%!');
  console.log('==================================================\n');
}

runFullVerification().catch(err => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});
