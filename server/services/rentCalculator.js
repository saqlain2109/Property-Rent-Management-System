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
 * Helper to extract calendar day number reliably
 */
function getDayNumber(date) {
  if (!date) return 1;
  if (typeof date === 'string') {
    const parts = date.split('T')[0].split('-');
    if (parts.length === 3) return parseInt(parts[2], 10);
  }
  const iso = date.toISOString ? date.toISOString().split('T')[0] : String(date);
  const parts = iso.split('-');
  if (parts.length === 3) return parseInt(parts[2], 10);
  return date.getDate();
}

/**
 * Calculates proration ratio for a date range [startDay, endDay] in a month with totalDays.
 * Implements standard commercial 15th-day rule (half month = 0.5) and day proration.
 */
function calculateMonthRatio(startDay, endDay, totalDays) {
  if (startDay <= 1 && endDay >= totalDays) return 1.0;
  // Specific half-month commercial rule:
  // Starts on 15th: 15 to totalDays = 0.5 (e.g. ₹9,000 becomes ₹4,500)
  if (startDay === 15 && endDay >= totalDays - 1) return 0.5;
  // Ends on 15th: 1 to 15 = 0.5 (e.g. ₹9,000 becomes ₹4,500)
  if (startDay <= 1 && endDay === 15) return 0.5;
  // Ends on 14th (when next rate starts on 15th): 1 to 14 = 0.5
  if (startDay <= 1 && endDay === 14) return 0.5;
  // Starts on 16th (when previous ended on 15th): 16 to totalDays = 0.5
  if (startDay === 16 && endDay >= totalDays - 1) return 0.5;

  // General proration by active days:
  const activeDays = Math.max(1, endDay - startDay + 1);
  return Math.min(1.0, activeDays / totalDays);
}

/**
 * Determine effective monthly rent for a given unit/tenant for a given month "YYYY-MM"
 * Supports proration for partial first/last month and mid-month rent rate revisions.
 */
async function getEffectiveRentForMonth(unitId, tenantId, monthYearStr, passedAssignment = null) {
  const [year, month] = monthYearStr.split('-').map(Number);
  const totalDays = new Date(year, month, 0).getDate();
  const monthStart = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
  const monthEnd = new Date(Date.UTC(year, month - 1, totalDays, 23, 59, 59, 999));

  let assignment = passedAssignment;
  if (!assignment) {
    assignment = await TenantAssignment.findOne({ unitId, tenantId }).sort({ startDate: -1 });
  }

  if (!assignment) return 0;

  const assignStart = assignment.startDate ? new Date(assignment.startDate) : (assignment.createdAt ? new Date(assignment.createdAt) : new Date(0));
  if (assignStart > monthEnd) {
    return 0; // Tenant has not occupied yet this month
  }
  if (assignment.endDate && new Date(assignment.endDate) < monthStart) {
    return 0; // Tenant vacated prior to this month
  }

  // Active occupancy window in this calendar month
  const windowStart = assignStart > monthStart ? assignStart : monthStart;
  const windowEnd = (assignment.endDate && new Date(assignment.endDate) < monthEnd)
    ? new Date(assignment.endDate)
    : monthEnd;

  if (windowStart > windowEnd) return 0;

  // Find all rent agreements active during this window for this specific assignment
  const agreements = await RentAgreement.find({
    assignmentId: assignment._id,
    $or: [
      { effectiveFrom: null },
      { effectiveFrom: { $lte: windowEnd } }
    ],
    $and: [
      {
        $or: [
          { effectiveTo: null },
          { effectiveTo: { $gte: windowStart } }
        ]
      }
    ]
  }).sort({ effectiveFrom: 1 });

  if (!agreements || agreements.length === 0) {
    const latestAgreement = await RentAgreement.findOne({
      assignmentId: assignment._id
    }).sort({ effectiveFrom: -1 });
    if (!latestAgreement) return assignment.monthlyRentExpected || 0;

    const sDay = getDayNumber(windowStart);
    const eDay = getDayNumber(windowEnd);
    const ratio = calculateMonthRatio(sDay, eDay, totalDays);
    return Math.round(latestAgreement.monthlyRate * ratio);
  }

  let totalProratedRent = 0;
  for (const ag of agreements) {
    const agFrom = ag.effectiveFrom ? new Date(ag.effectiveFrom) : monthStart;
    const agTo = ag.effectiveTo ? new Date(ag.effectiveTo) : null;

    const segStart = agFrom > windowStart ? agFrom : windowStart;
    const segEnd = (agTo && agTo < windowEnd) ? agTo : windowEnd;

    if (segStart <= segEnd) {
      const sDay = getDayNumber(segStart);
      const eDay = getDayNumber(segEnd);
      const ratio = calculateMonthRatio(sDay, eDay, totalDays);
      totalProratedRent += Math.round(ag.monthlyRate * ratio);
    }
  }

  return totalProratedRent;
}

function getCurrentMonthYear() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/**
 * Calculate detailed paid-till, outstanding, and month-by-month breakdown
 * @param {ObjectId} unitId 
 * @param {ObjectId} tenantId 
 * @param {String} upToMonthYear optional target month, defaults to current month
 * @param {Object} passedAssignment optional specific assignment instance
 */
async function calculateTenantUnitLedger(unitId, tenantId, upToMonthYear, passedAssignment = null) {
  const effectiveUpTo = upToMonthYear || getCurrentMonthYear();
  // 1. Get occupancy assignment
  let assignment = passedAssignment;
  if (!assignment) {
    if (upToMonthYear) {
      const [y, m] = upToMonthYear.split('-').map(Number);
      const totalDays = new Date(y, m, 0).getDate();
      const monthStart = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0));
      const monthEnd = new Date(Date.UTC(y, m - 1, totalDays, 23, 59, 59, 999));

      assignment = await TenantAssignment.findOne({
        unitId,
        tenantId,
        $or: [
          { startDate: null },
          { startDate: { $lte: monthEnd } }
        ],
        $and: [
          {
            $or: [
              { endDate: null },
              { endDate: { $gte: monthStart } }
            ]
          }
        ]
      }).sort({ startDate: -1 });
    }

    if (!assignment) {
      assignment = await TenantAssignment.findOne({ unitId, tenantId }).sort({ startDate: -1 });
    }
  }

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

  // Determine starting month from occupancy startDate (safely handle optional dates)
  const aStartDate = assignment.startDate ? new Date(assignment.startDate) : (assignment.createdAt ? new Date(assignment.createdAt) : new Date());
  const startMonthStr = `${aStartDate.getFullYear()}-${String(aStartDate.getMonth() + 1).padStart(2, '0')}`;
  
  // If assignment has ended before effectiveUpTo, cap it
  let endMonthStr = effectiveUpTo;
  if (assignment.endDate) {
    const aEndDate = new Date(assignment.endDate);
    const assignEndStr = `${aEndDate.getFullYear()}-${String(aEndDate.getMonth() + 1).padStart(2, '0')}`;
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
    const expectedRate = await getEffectiveRentForMonth(unitId, tenantId, m, assignment);
    
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

      if (!nextUnpaidMonth && (status === 'Unpaid' || status === 'Partially Paid') && m <= effectiveUpTo) {
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
      cumulativeExpected: totalExpected,
      cumulativeAllocated: totalAllocated,
      cumulativeOutstanding: totalOutstanding,
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
  getCurrentMonthYear,
  getEffectiveRentForMonth,
  calculateTenantUnitLedger,
  getMonthsRange,
  calculateMonthRatio
};
