const TenantAssignment = require('../models/TenantAssignment');
const RentAgreement = require('../models/RentAgreement');
const PaymentAllocation = require('../models/PaymentAllocation');
const PaymentReceipt = require('../models/PaymentReceipt');

/**
 * Helper to generate month strings between start and end (inclusive)
 * Format: "YYYY-MM"
 */
function getMonthsRange(startDate, endDate) {
  const months = [];
  const current = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
  const end = new Date(endDate.getFullYear(), endDate.getMonth(), 1);

  while (current <= end) {
    const y = current.getFullYear();
    const m = String(current.getMonth() + 1).padStart(2, '0');
    months.push(`${y}-${m}`);
    current.setMonth(current.getMonth() + 1);
  }
  return months;
}

/**
 * Determine effective monthly rent for a given unit/tenant for a given month "YYYY-MM"
 */
async function getEffectiveRentForMonth(unitId, tenantId, monthYearStr) {
  const [year, month] = monthYearStr.split('-').map(Number);
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 0, 23, 59, 59);

  // Find agreement where effectiveFrom <= monthEnd AND (effectiveTo == null OR effectiveTo >= monthStart)
  const agreement = await RentAgreement.findOne({
    unitId,
    tenantId,
    effectiveFrom: { $lte: monthEnd },
    $or: [
      { effectiveTo: null },
      { effectiveTo: { $gte: monthStart } }
    ]
  }).sort({ effectiveFrom: -1 });

  return agreement ? agreement.monthlyRate : 0;
}

/**
 * Calculate detailed paid-till, outstanding, and month-by-month breakdown
 * @param {ObjectId} unitId 
 * @param {ObjectId} tenantId 
 * @param {String} upToMonthYear optional target month, defaults to current month or latest
 */
async function calculateTenantUnitLedger(unitId, tenantId, upToMonthYear = '2026-03') {
  // 1. Get occupancy assignment
  const assignment = await TenantAssignment.findOne({ unitId, tenantId }).sort({ startDate: -1 });
  if (!assignment) {
    return {
      hasAssignment: false,
      paidTillMonth: null,
      nextUnpaidMonth: null,
      totalExpected: 0,
      totalAllocated: 0,
      totalOutstanding: 0,
      monthsBreakdown: []
    };
  }

  // Determine starting month from occupancy startDate
  const startMonthStr = `${assignment.startDate.getFullYear()}-${String(assignment.startDate.getMonth() + 1).padStart(2, '0')}`;
  
  // If assignment has ended before upToMonthYear, cap it
  let endMonthStr = upToMonthYear;
  if (assignment.endDate) {
    const assignEndStr = `${assignment.endDate.getFullYear()}-${String(assignment.endDate.getMonth() + 1).padStart(2, '0')}`;
    if (assignEndStr < endMonthStr) {
      endMonthStr = assignEndStr;
    }
  }

  // Ensure start is not after end
  const [sy, sm] = startMonthStr.split('-').map(Number);
  const [ey, em] = endMonthStr.split('-').map(Number);
  const startDateObj = new Date(sy, sm - 1, 1);
  const endDateObj = new Date(ey, em - 1, 1);

  let months = [];
  if (startDateObj <= endDateObj) {
    months = getMonthsRange(startDateObj, endDateObj);
  } else {
    months = [startMonthStr];
  }

  // Fetch all payment allocations for this tenant and unit
  // Exclude allocations belonging to reversed receipts
  const reversedReceipts = await PaymentReceipt.find({ isReversed: true }).distinct('_id');
  const allocations = await PaymentAllocation.find({
    unitId,
    tenantId,
    receiptId: { $nin: reversedReceipts }
  });

  // Also include any future months allocated beyond endMonthStr
  const allocatedMonths = allocations.map(a => a.rentMonthYear);
  for (const am of allocatedMonths) {
    if (!months.includes(am) && am >= startMonthStr) {
      months.push(am);
    }
  }
  months.sort();

  let paidTillMonth = assignment.initialPaidTillMonth || null;
  let nextUnpaidMonth = null;
  let totalExpected = 0;
  let totalAllocated = 0;
  let totalOutstanding = 0;
  const monthsBreakdown = [];

  for (const m of months) {
    const isHistoricallySettled = assignment.initialPaidTillMonth && m <= assignment.initialPaidTillMonth;
    const expectedRate = await getEffectiveRentForMonth(unitId, tenantId, m);
    
    // Sum allocations for this month
    const monthAllocations = allocations.filter(a => a.rentMonthYear === m);
    const allocated = monthAllocations.reduce((sum, a) => sum + a.allocatedAmount, 0);

    let status = 'Unpaid';
    let pending = 0;
    let advance = 0;

    if (isHistoricallySettled) {
      status = 'Fully Paid';
      pending = 0;
      advance = Math.max(0, allocated);
      if (!paidTillMonth || m > paidTillMonth) paidTillMonth = m;
    } else {
      pending = Math.max(0, expectedRate - allocated);
      advance = Math.max(0, allocated - expectedRate);

      if (allocated >= expectedRate && expectedRate > 0) {
        status = 'Fully Paid';
        if (!paidTillMonth || m > paidTillMonth) paidTillMonth = m;
      } else if (allocated > 0 && allocated < expectedRate) {
        status = 'Partially Paid';
      } else if (expectedRate === 0 && allocated > 0) {
        status = 'Credit / Advance';
      }

      if (!nextUnpaidMonth && (status === 'Unpaid' || status === 'Partially Paid') && m <= upToMonthYear) {
        nextUnpaidMonth = m;
      }

      totalExpected += expectedRate;
      totalAllocated += allocated;
      totalOutstanding += pending;
    }

    monthsBreakdown.push({
      monthYear: m,
      expectedRate,
      allocatedAmount: isHistoricallySettled ? (allocated || expectedRate) : allocated,
      outstandingAmount: pending,
      advanceAmount: advance,
      status: isHistoricallySettled ? 'Fully Paid' : status,
      isHistorical: isHistoricallySettled
    });
  }

  // If all are paid, next unpaid is next month after paidTillMonth
  if (!nextUnpaidMonth && paidTillMonth) {
    const [py, pm] = paidTillMonth.split('-').map(Number);
    const nextDate = new Date(py, pm, 1);
    nextUnpaidMonth = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}`;
  }

  return {
    hasAssignment: true,
    assignmentCode: assignment.assignmentCode,
    occupancyStatus: assignment.status,
    paidTillMonth,
    nextUnpaidMonth,
    totalExpected,
    totalAllocated,
    totalOutstanding,
    monthsBreakdown
  };
}

module.exports = {
  getEffectiveRentForMonth,
  calculateTenantUnitLedger,
  getMonthsRange
};
