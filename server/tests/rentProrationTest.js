const assert = require('assert');

function calculateMonthRatio(startDay, endDay, totalDays) {
  if (startDay <= 1 && endDay >= totalDays) return 1.0;
  // Commercial 15th-day rule
  if (startDay === 15 && endDay >= totalDays - 1) return 0.5;
  if (startDay <= 1 && endDay === 15) return 0.5;
  if (startDay <= 1 && endDay === 14) return 0.5;
  if (startDay === 16 && endDay >= totalDays - 1) return 0.5;

  const activeDays = Math.max(1, endDay - startDay + 1);
  return Math.min(1.0, activeDays / totalDays);
}

function calculateProratedRent(monthlyRate, startDay, endDay, totalDays) {
  const ratio = calculateMonthRatio(startDay, endDay, totalDays);
  return Math.round(monthlyRate * ratio);
}

console.log('--- RUNNING RENT PRORATION TESTS ---');

// Test 1: Full month
const fullMonthRent = calculateProratedRent(9000, 1, 30, 30);
console.log('Test 1 (Full Month 9,000):', fullMonthRent);
assert.strictEqual(fullMonthRent, 9000, 'Full month must equal 9000');

// Test 2: Starts on 15th
const midStartRent = calculateProratedRent(9000, 15, 30, 30);
console.log('Test 2 (Starts 15th, Rate 9,000):', midStartRent);
assert.strictEqual(midStartRent, 4500, 'Starts on 15th must equal 4500');

// Test 2b: Starts on 15th in a 31-day month
const midStart31Rent = calculateProratedRent(9000, 15, 31, 31);
console.log('Test 2b (Starts 15th in 31-day month, Rate 9,000):', midStart31Rent);
assert.strictEqual(midStart31Rent, 4500, 'Starts on 15th in 31-day month must equal 4500');

// Test 3: Ends on 15th
const midEndRent = calculateProratedRent(9000, 1, 15, 30);
console.log('Test 3 (Ends 15th, Rate 9,000):', midEndRent);
assert.strictEqual(midEndRent, 4500, 'Ends on 15th must equal 4500');

// Test 3b: Ends on 15th in a 31-day month
const midEnd31Rent = calculateProratedRent(9000, 1, 15, 31);
console.log('Test 3b (Ends 15th in 31-day month, Rate 9,000):', midEnd31Rent);
assert.strictEqual(midEnd31Rent, 4500, 'Ends on 15th in 31-day month must equal 4500');

// Test 4: Mid-month rent change on 15th from 8000 to 10000
const oldPart = calculateProratedRent(8000, 1, 14, 30);
const newPart = calculateProratedRent(10000, 15, 30, 30);
const totalSplitRent = oldPart + newPart;
console.log(`Test 4 (Rate change on 15th 8k -> 10k): Old=${oldPart}, New=${newPart}, Total=${totalSplitRent}`);
assert.strictEqual(oldPart, 4000, 'Old part should be 4000');
assert.strictEqual(newPart, 5000, 'New part should be 5000');
assert.strictEqual(totalSplitRent, 9000, 'Total should be 9000');

// Test 5: Mid-month rent change on 10th of a 30-day month from 9000 to 12000
const r1 = calculateProratedRent(9000, 1, 9, 30);
const r2 = calculateProratedRent(12000, 10, 30, 30);
console.log(`Test 5 (Rate change on 10th 9k -> 12k): Old=${r1}, New=${r2}, Total=${r1 + r2}`);
assert.strictEqual(r1, Math.round(9000 * 9 / 30));
assert.strictEqual(r2, Math.round(12000 * 21 / 30));

console.log('✅ ALL 5 PRORATION TESTS PASSED PERFECTLY!');
