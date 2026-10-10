const express = require('express');
const router = express.Router();
const Tenant = require('../models/Tenant');
const Property = require('../models/Property');
const Unit = require('../models/Unit');
const TenantAssignment = require('../models/TenantAssignment');
const RentAgreement = require('../models/RentAgreement');
const PaymentReceipt = require('../models/PaymentReceipt');
const Expense = require('../models/Expense');
const MonthlyLedger = require('../models/MonthlyLedger');
const { calculateTenantUnitLedger } = require('../services/rentCalculator');
const { protect } = require('../middleware/auth');

/**
 * Natural language rule-based NLP parser
 */
function parseQueryIntent(query) {
  const q = query.toLowerCase().trim();

  // 1. Pending / Outstanding rent questions
  if (q.includes('pending') || q.includes('due') || q.includes('outstanding') || q.includes('unpaid')) {
    return { type: 'OUTSTANDING_RENT' };
  }

  // 2. Last payment / Recent payment
  if (q.includes('last payment') || q.includes('when was the last') || q.includes('recent payment')) {
    return { type: 'LAST_PAYMENT' };
  }

  // 3. Collection for specific month
  if (q.includes('collected') || q.includes('collection') || q.includes('how much rent was collected') || q.includes('total rent received')) {
    return { type: 'RENT_COLLECTED' };
  }

  // 4. Expenses for a property or month
  if (q.includes('expense') || q.includes('expenses') || q.includes('maintenance')) {
    return { type: 'EXPENSES' };
  }

  // 5. Current occupant / tenant occupying
  if (q.includes('occupying') || q.includes('who is occupying') || q.includes('current tenant') || q.includes('who lives in')) {
    return { type: 'CURRENT_OCCUPANT' };
  }

  // 6. Rent increase / previous rent
  if (q.includes('rent before') || q.includes('rent increase') || q.includes('previous rent')) {
    return { type: 'RENT_INCREASE_HISTORY' };
  }

  // 7. Monthly income, expenses, cash flow / balance
  if (q.includes('balance') || q.includes('monthly income') || q.includes('financial') || q.includes('summary')) {
    return { type: 'MONTHLY_FINANCIALS' };
  }

  // Default fallback
  return { type: 'GENERAL_SEARCH' };
}

router.post('/query', protect, async (req, res) => {
  try {
    const { query } = req.body;
    if (!query || !query.trim()) {
      return res.status(400).json({ success: false, message: 'Question/query is required' });
    }

    const q = query.trim();
    const intent = parseQueryIntent(q);

    // Extract potential tenant or property names
    const allTenants = await Tenant.find();
    const allProperties = await Property.find();
    const allUnits = await Unit.find();

    const matchedTenant = allTenants.find(t => q.toLowerCase().includes(t.name.toLowerCase()));
    const matchedProperty = allProperties.find(p => q.toLowerCase().includes(p.name.toLowerCase()));
    const matchedUnit = allUnits.find(u => q.toLowerCase().includes(u.unitName.toLowerCase()) || q.toLowerCase().includes(u.unitCode.toLowerCase()));

    // Extract Month/Year
    let matchedMonth = null;
    const monthsMap = {
      'january': '01', 'jan': '01',
      'february': '02', 'feb': '02',
      'march': '03', 'mar': '03',
      'april': '04', 'apr': '04',
      'may': '05',
      'june': '06', 'jun': '06',
      'july': '07', 'jul': '07',
      'august': '08', 'aug': '08',
      'september': '09', 'sep': '09',
      'october': '10', 'oct': '10',
      'november': '11', 'nov': '11',
      'december': '12', 'dec': '12'
    };

    let year = '2026';
    if (q.includes('2025') || q.includes(' 25')) year = '2025';

    for (const [mName, mNum] of Object.entries(monthsMap)) {
      const regex = new RegExp(`\\b${mName}\\b`, 'i');
      if (regex.test(q)) {
        matchedMonth = `${year}-${mNum}`;
        break;
      }
    }

    let answer = '';
    let tableData = null;

    switch (intent.type) {
      case 'OUTSTANDING_RENT': {
        if (matchedTenant) {
          // Find assignments for this tenant
          const assigns = await TenantAssignment.find({ tenantId: matchedTenant._id, status: 'Active' });
          if (assigns.length === 0) {
            answer = `Tenant **${matchedTenant.name}** does not have any active unit assignments.`;
          } else {
            let totalPending = 0;
            const details = [];
            for (const a of assigns) {
              const u = await Unit.findById(a.unitId).populate('propertyId');
              const calc = await calculateTenantUnitLedger(a.unitId, matchedTenant._id, matchedMonth || '2026-03');
              totalPending += calc.totalOutstanding;
              details.push({
                unit: u.unitName,
                property: u.propertyId?.name,
                paidTill: calc.paidTillMonth || 'None',
                nextUnpaid: calc.nextUnpaidMonth || 'Up to date',
                outstanding: `₹${calc.totalOutstanding.toLocaleString('en-IN')}`
              });
            }
            answer = `Total outstanding rent for **${matchedTenant.name}** is **₹${totalPending.toLocaleString('en-IN')}**.`;
            tableData = {
              columns: ['Property', 'Unit', 'Paid Till', 'Next Unpaid', 'Outstanding'],
              rows: details.map(d => [d.property, d.unit, d.paidTill, d.nextUnpaid, d.outstanding])
            };
          }
        } else {
          // General outstanding list
          const activeAssigns = await TenantAssignment.find({ status: 'Active' })
            .populate('tenantId')
            .populate({ path: 'unitId', populate: { path: 'propertyId' } });

          const rows = [];
          let grandTotal = 0;
          for (const a of activeAssigns) {
            const calc = await calculateTenantUnitLedger(a.unitId._id, a.tenantId._id, matchedMonth || '2026-03');
            if (calc.totalOutstanding > 0) {
              grandTotal += calc.totalOutstanding;
              rows.push([
                a.tenantId.name,
                a.unitId.propertyId?.name,
                a.unitId.unitName,
                calc.paidTillMonth || 'None',
                calc.nextUnpaidMonth,
                `₹${calc.totalOutstanding.toLocaleString('en-IN')}`
              ]);
            }
          }
          answer = `Found **${rows.length} tenant(s)** with outstanding rent. Total pending across all units is **₹${grandTotal.toLocaleString('en-IN')}**.`;
          tableData = {
            columns: ['Tenant', 'Property', 'Unit', 'Paid Till', 'Next Unpaid', 'Outstanding'],
            rows
          };
        }
        break;
      }

      case 'LAST_PAYMENT': {
        if (!matchedTenant) {
          answer = `Please specify which tenant you would like to look up (for example: "When was the last payment received from Delhiery?").`;
        } else {
          const lastReceipt = await PaymentReceipt.findOne({ tenantId: matchedTenant._id, isReversed: false })
            .populate({ path: 'unitId', populate: { path: 'propertyId' } })
            .sort({ receiptDate: -1 });

          if (!lastReceipt) {
            answer = `No payment receipts found for tenant **${matchedTenant.name}**.`;
          } else {
            const dateStr = lastReceipt.receiptDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
            answer = `The last payment from **${matchedTenant.name}** was **₹${lastReceipt.totalAmount.toLocaleString('en-IN')}** received on **${dateStr}** via **${lastReceipt.paymentMode}** (Receipt: ${lastReceipt.receiptNumber}).`;
            if (lastReceipt.comments) {
              answer += `\n*Note: "${lastReceipt.comments}"*`;
            }
          }
        }
        break;
      }

      case 'RENT_COLLECTED': {
        const target = matchedMonth || '2026-03';
        const receipts = await PaymentReceipt.aggregate([
          {
            $match: {
              isReversed: false,
              $expr: {
                $eq: [{ $dateToString: { format: '%Y-%m', date: '$receiptDate' } }, target]
              }
            }
          },
          { $group: { _id: null, total: { $sum: '$totalAmount' }, count: { $sum: 1 } } }
        ]);

        const total = receipts.length > 0 ? receipts[0].total : 0;
        const count = receipts.length > 0 ? receipts[0].count : 0;
        answer = `Total rent collected in **${target}** was **₹${total.toLocaleString('en-IN')}** across ${count} payment receipts.`;
        break;
      }

      case 'EXPENSES': {
        let matchQuery = { isReversed: false };
        if (matchedProperty) {
          matchQuery.propertyId = matchedProperty._id;
        }
        if (matchedMonth) {
          matchQuery.$expr = {
            $eq: [{ $dateToString: { format: '%Y-%m', date: '$expenseDate' } }, matchedMonth]
          };
        }

        const expenses = await Expense.find(matchQuery).populate('propertyId').sort({ expenseDate: -1 });
        const total = expenses.reduce((s, e) => s + e.amount, 0);

        const propLabel = matchedProperty ? ` for **${matchedProperty.name}**` : '';
        const monthLabel = matchedMonth ? ` in **${matchedMonth}**` : '';

        answer = `Total expenses recorded${propLabel}${monthLabel}: **₹${total.toLocaleString('en-IN')}** (${expenses.length} records).`;
        if (expenses.length > 0) {
          tableData = {
            columns: ['Date', 'Property', 'Category', 'Description', 'Amount'],
            rows: expenses.map(e => [
              e.expenseDate.toISOString().split('T')[0],
              e.propertyId?.name || 'General',
              e.category,
              e.description,
              `₹${e.amount.toLocaleString('en-IN')}`
            ])
          };
        }
        break;
      }

      case 'CURRENT_OCCUPANT': {
        if (matchedUnit) {
          const assign = await TenantAssignment.findOne({ unitId: matchedUnit._id, status: 'Active' })
            .populate('tenantId');
          const agree = await RentAgreement.findOne({ unitId: matchedUnit._id, isCurrentRate: true });

          if (assign && assign.tenantId) {
            answer = `**${matchedUnit.unitName}** is currently occupied by **${assign.tenantId.name}** since ${assign.startDate.toISOString().split('T')[0]}. Current rent rate is **₹${agree?.monthlyRate.toLocaleString('en-IN') || 'N/A'}/month**.`;
          } else {
            answer = `**${matchedUnit.unitName}** is currently vacant.`;
          }
        } else if (matchedProperty) {
          const units = await Unit.find({ propertyId: matchedProperty._id });
          const assigns = await TenantAssignment.find({ unitId: { $in: units.map(u => u._id) }, status: 'Active' })
            .populate('tenantId')
            .populate('unitId');

          answer = `Occupants for **${matchedProperty.name}**:`;
          tableData = {
            columns: ['Unit', 'Tenant', 'Status', 'Start Date'],
            rows: assigns.map(a => [
              a.unitId.unitName,
              a.tenantId.name,
              a.status,
              a.startDate.toISOString().split('T')[0]
            ])
          };
        } else {
          answer = `Please name the specific unit or property (e.g. "Who is occupying Byculla Club?").`;
        }
        break;
      }

      case 'RENT_INCREASE_HISTORY': {
        const history = await RentAgreement.find(matchedUnit ? { unitId: matchedUnit._id } : {})
          .populate('tenantId', 'name')
          .populate({ path: 'unitId', populate: { path: 'propertyId' } })
          .sort({ effectiveFrom: -1 })
          .limit(10);

        answer = `Rent rate history and revisions:`;
        tableData = {
          columns: ['Unit', 'Tenant', 'Effective Date', 'Current Rate', 'Previous Rate', 'Reason'],
          rows: history.map(h => [
            h.unitId?.unitName || '',
            h.tenantId?.name || '',
            h.effectiveFrom.toISOString().split('T')[0],
            `₹${h.monthlyRate.toLocaleString('en-IN')}`,
            `₹${h.previousRate.toLocaleString('en-IN')}`,
            h.reasonForChange || 'Initial Agreement'
          ])
        };
        break;
      }

      case 'MONTHLY_FINANCIALS': {
        const target = matchedMonth || '2026-03';
        const ledger = await MonthlyLedger.findOne({ monthYear: target });

        if (ledger) {
          answer = `Financial statement for **${target}**:\n` +
            `• **Opening Balance:** ₹${ledger.openingBalance.toLocaleString('en-IN')}\n` +
            `• **Rent Received:** ₹${ledger.totalIncomeReceived.toLocaleString('en-IN')}\n` +
            `• **Expenses Paid:** ₹${ledger.totalExpensesPaid.toLocaleString('en-IN')}\n` +
            `• **Net Cash Flow:** ₹${ledger.netCashFlow.toLocaleString('en-IN')}\n` +
            `• **Closing Balance:** ₹${ledger.closingBalance.toLocaleString('en-IN')}`;
        } else {
          answer = `Financial summary for **${target}** is being calculated from current transactions.`;
        }
        break;
      }

      default: {
        answer = `I can help you check outstanding rent, payment history, property expenses, occupancy details, or monthly financial statements. Try asking:\n` +
          `• "How much rent is pending for Delhiery?"\n` +
          `• "When was the last payment received from Snip Salon?"\n` +
          `• "How much rent was collected in March 2026?"\n` +
          `• "Show all properties with outstanding rent."\n` +
          `• "What expenses were recorded for Byculla Club?"`;
      }
    }

    res.json({
      success: true,
      query: q,
      intent: intent.type,
      answer,
      tableData
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
