const express = require('express');
const router = express.Router();
const Tenant = require('../models/Tenant');
const Property = require('../models/Property');
const Unit = require('../models/Unit');
const TenantAssignment = require('../models/TenantAssignment');
const RentAgreement = require('../models/RentAgreement');
const PaymentReceipt = require('../models/PaymentReceipt');
const PaymentAllocation = require('../models/PaymentAllocation');
const Expense = require('../models/Expense');
const MonthlyLedger = require('../models/MonthlyLedger');
const PGSettlement = require('../models/PGSettlement');
const { calculateTenantUnitLedger } = require('../services/rentCalculator');
const { protect } = require('../middleware/auth');

/**
 * Intelligent Intent Detection: Exclusively in Professional English
 */
function parseQueryIntent(query) {
  const q = query.toLowerCase().trim();

  // 1. Pending / Outstanding / Unpaid rent
  if (
    q.includes('pending') || q.includes('due') || q.includes('outstanding') ||
    q.includes('unpaid') || q.includes('arrears') || q.includes('dues') ||
    q.includes('owe') || q.includes('baki') || q.includes('balance')
  ) {
    if (!q.includes('ledger') && !q.includes('cash flow') && !q.includes('closing balance')) {
      return { type: 'OUTSTANDING_RENT' };
    }
  }

  // 2. Last payment / Recent payment
  if (
    q.includes('last payment') || q.includes('recent payment') ||
    q.includes('previous payment') || q.includes('when did') ||
    q.includes('latest receipt') || q.includes('last transaction') ||
    q.includes('last paid')
  ) {
    return { type: 'LAST_PAYMENT' };
  }

  // 3. Collection / Rent received / Total revenue
  if (
    q.includes('collected') || q.includes('collection') ||
    q.includes('rent received') || q.includes('total collection') ||
    q.includes('total income') || q.includes('rent received') ||
    q.includes('revenue') || q.includes('how much rent')
  ) {
    return { type: 'RENT_COLLECTED' };
  }

  // 4. Expenses / Maintenance / Repairs
  if (
    q.includes('expense') || q.includes('expenses') ||
    q.includes('maintenance') || q.includes('cost') ||
    q.includes('repair') || q.includes('utility') || q.includes('bill')
  ) {
    return { type: 'EXPENSES' };
  }

  // 5. PG Settlement details
  if (q.includes('pg') || q.includes('paying guest') || q.includes('settlement') || q.includes('operator')) {
    return { type: 'PG_SETTLEMENT' };
  }

  // 6. Current occupant / Who lives / Vacancy / Vacant units
  if (
    q.includes('occupying') || q.includes('who is occupying') ||
    q.includes('current tenant') || q.includes('who lives') ||
    q.includes('vacant') || q.includes('vacancy') || q.includes('empty') ||
    q.includes('unoccupied')
  ) {
    return { type: 'CURRENT_OCCUPANT' };
  }

  // 7. Rent increase / Revision / Rate history
  if (
    q.includes('rent before') || q.includes('increase') ||
    q.includes('previous rent') || q.includes('revision') ||
    q.includes('rate change') || q.includes('escalation')
  ) {
    return { type: 'RENT_INCREASE_HISTORY' };
  }

  // 8. Monthly Ledger / Closing Balance / Cash flow
  if (
    q.includes('ledger') || q.includes('closing balance') ||
    q.includes('opening balance') || q.includes('financial summary') ||
    q.includes('cash flow') || q.includes('statement')
  ) {
    return { type: 'MONTHLY_FINANCIALS' };
  }

  // 9. All properties overview
  if (q.includes('property') || q.includes('properties') || q.includes('portfolio') || q.includes('units')) {
    return { type: 'PROPERTIES_SUMMARY' };
  }

  // Default fallback
  return { type: 'GENERAL_SEARCH' };
}

router.post('/query', protect, async (req, res) => {
  try {
    const { query } = req.body;
    if (!query || !query.trim()) {
      return res.status(400).json({ success: false, message: 'Question or query is required' });
    }

    const q = query.trim().toLowerCase();
    const intent = parseQueryIntent(q);

    // Fetch master registries for exact and fuzzy matching
    const allTenants = await Tenant.find();
    const allProperties = await Property.find();
    const allUnits = await Unit.find().populate('propertyId');

    // Tenant match
    const matchedTenant = allTenants.find(t => {
      const name = t.name.toLowerCase();
      const code = (t.tenantCode || '').toLowerCase();
      return q.includes(name) || (name.split(' ').length > 1 && name.split(' ').some(part => part.length > 3 && q.includes(part))) || (code && q.includes(code));
    });

    // Property match
    const matchedProperty = allProperties.find(p => {
      const name = p.name.toLowerCase();
      const code = (p.propertyCode || '').toLowerCase();
      return q.includes(name) || (name.split(' ').length > 1 && name.split(' ').some(part => part.length > 3 && q.includes(part))) || (code && q.includes(code));
    });

    // Unit match
    const matchedUnit = allUnits.find(u => {
      const name = u.unitName.toLowerCase();
      const code = (u.unitCode || '').toLowerCase();
      return q.includes(name) || (code && q.includes(code));
    });

    // Month detection
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
          const assigns = await TenantAssignment.find({ tenantId: matchedTenant._id, status: 'Active' });
          if (assigns.length === 0) {
            answer = `Tenant **${matchedTenant.name}** has no active unit assignments.`;
          } else {
            let totalPending = 0;
            const details = [];
            for (const a of assigns) {
              const u = await Unit.findById(a.unitId).populate('propertyId');
              const calc = await calculateTenantUnitLedger(a.unitId, matchedTenant._id, matchedMonth || '2026-03');
              totalPending += calc.totalOutstanding;
              details.push({
                unit: u?.unitName || 'Unit',
                property: u?.propertyId?.name || 'Property',
                paidTill: calc.paidTillMonth || 'None',
                nextUnpaid: calc.nextUnpaidMonth || 'All Clear',
                outstanding: `₹${calc.totalOutstanding.toLocaleString('en-IN')}`
              });
            }
            answer = `Total outstanding rent for **${matchedTenant.name}** is **₹${totalPending.toLocaleString('en-IN')}**.`;
            tableData = {
              columns: ['Property', 'Unit', 'Paid Till Month', 'Next Due Month', 'Outstanding Amount'],
              rows: details.map(d => [d.property, d.unit, d.paidTill, d.nextUnpaid, d.outstanding])
            };
          }
        } else {
          // General outstanding across all tenants
          const activeAssigns = await TenantAssignment.find({ status: 'Active' })
            .populate('tenantId')
            .populate({ path: 'unitId', populate: { path: 'propertyId' } });

          const rows = [];
          let grandTotal = 0;
          for (const a of activeAssigns) {
            if (!a.unitId || !a.tenantId) continue;
            const calc = await calculateTenantUnitLedger(a.unitId._id, a.tenantId._id, matchedMonth || '2026-03');
            if (calc.totalOutstanding > 0) {
              grandTotal += calc.totalOutstanding;
              rows.push([
                a.tenantId.name,
                a.unitId.propertyId?.name || 'N/A',
                a.unitId.unitName,
                calc.paidTillMonth || 'None',
                calc.nextUnpaidMonth || 'Immediate',
                `₹${calc.totalOutstanding.toLocaleString('en-IN')}`
              ]);
            }
          }
          rows.sort((a, b) => {
            const numA = parseInt(a[5].replace(/[^\d]/g, ''), 10) || 0;
            const numB = parseInt(b[5].replace(/[^\d]/g, ''), 10) || 0;
            return numB - numA;
          });
          answer = `Found **${rows.length} tenant(s)** with outstanding rent. The total pending amount across all units is **₹${grandTotal.toLocaleString('en-IN')}**.`;
          tableData = {
            columns: ['Tenant Name', 'Property', 'Unit', 'Paid Till', 'Next Unpaid', 'Outstanding Amount'],
            rows
          };
        }
        break;
      }

      case 'LAST_PAYMENT': {
        let receiptsQuery = { isReversed: false };
        if (matchedTenant) {
          receiptsQuery.tenantId = matchedTenant._id;
        } else if (matchedUnit) {
          receiptsQuery.unitId = matchedUnit._id;
        }

        const receipts = await PaymentReceipt.find(receiptsQuery)
          .populate('tenantId')
          .populate({ path: 'unitId', populate: { path: 'propertyId' } })
          .sort({ receiptDate: -1 })
          .limit(matchedTenant ? 5 : 10);

        if (receipts.length === 0) {
          answer = matchedTenant 
            ? `No recorded payment receipts found for tenant **${matchedTenant.name}**.`
            : `No payment receipts found in the system.`;
        } else {
          const first = receipts[0];
          const dateStr = first.receiptDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
          answer = matchedTenant
            ? `The last payment from **${matchedTenant.name}** was **₹${first.totalAmount.toLocaleString('en-IN')}** received on **${dateStr}** (Receipt: ${first.receiptNumber}).`
            : `Recent payment receipts log:`;

          tableData = {
            columns: ['Receipt No', 'Date', 'Tenant', 'Unit', 'Status', 'Amount Received'],
            rows: receipts.map(r => [
              r.receiptNumber,
              r.receiptDate.toISOString().split('T')[0],
              r.tenantId?.name || 'N/A',
              r.unitId?.unitName || 'N/A',
              r.status || 'Rented',
              `₹${r.totalAmount.toLocaleString('en-IN')}`
            ])
          };
        }
        break;
      }

      case 'RENT_COLLECTED': {
        const target = matchedMonth || '2026-03';
        const receipts = await PaymentReceipt.find({
          isReversed: false,
          $expr: {
            $eq: [{ $dateToString: { format: '%Y-%m', date: '$receiptDate' } }, target]
          }
        }).populate('tenantId').populate({ path: 'unitId', populate: { path: 'propertyId' } });

        const total = receipts.reduce((sum, r) => sum + r.totalAmount, 0);
        answer = `Total rent collected in **${target}** is **₹${total.toLocaleString('en-IN')}** across **${receipts.length} verified payment receipt(s)**.`;

        if (receipts.length > 0) {
          tableData = {
            columns: ['Receipt No', 'Date', 'Tenant', 'Unit', 'Amount Received'],
            rows: receipts.map(r => [
              r.receiptNumber,
              r.receiptDate.toISOString().split('T')[0],
              r.tenantId?.name || 'N/A',
              r.unitId?.unitName || 'N/A',
              `₹${r.totalAmount.toLocaleString('en-IN')}`
            ])
          };
        }
        break;
      }

      case 'EXPENSES': {
        let matchQuery = { isReversed: false };
        if (matchedProperty) matchQuery.propertyId = matchedProperty._id;
        if (matchedMonth) {
          matchQuery.$expr = {
            $eq: [{ $dateToString: { format: '%Y-%m', date: '$expenseDate' } }, matchedMonth]
          };
        }

        const expenses = await Expense.find(matchQuery).populate('propertyId').sort({ expenseDate: -1 });
        const total = expenses.reduce((s, e) => s + e.amount, 0);
        const propLabel = matchedProperty ? ` for **${matchedProperty.name}**` : '';
        const monthLabel = matchedMonth ? ` in **${matchedMonth}**` : '';

        answer = `Total expenses recorded${propLabel}${monthLabel}: **₹${total.toLocaleString('en-IN')}** across ${expenses.length} record(s).`;
        if (expenses.length > 0) {
          tableData = {
            columns: ['Date', 'Property', 'Category', 'Description', 'Amount'],
            rows: expenses.map(e => [
              e.expenseDate.toISOString().split('T')[0],
              e.propertyId?.name || 'General Portfolio',
              e.category,
              e.description,
              `₹${e.amount.toLocaleString('en-IN')}`
            ])
          };
        }
        break;
      }

      case 'PG_SETTLEMENT': {
        const pgRecords = await PGSettlement.find().sort({ monthYear: -1 });
        if (pgRecords.length === 0) {
          answer = `No PG settlement records available.`;
        } else {
          answer = `Summary of Paying Guest (PG) settlements:`;
          tableData = {
            columns: ['Month', 'Gross Collection', 'Altaf Share', 'Anand Share', 'Bisleri Water', 'Net Estate Bank'],
            rows: pgRecords.map(p => [
              p.monthYear,
              `₹${p.pgGrossCollection.toLocaleString('en-IN')}`,
              `₹${p.altafShare.toLocaleString('en-IN')}`,
              `₹${p.anandShare.toLocaleString('en-IN')}`,
              `₹${p.bisleriWaterShare.toLocaleString('en-IN')}`,
              `₹${p.netBankDeposited.toLocaleString('en-IN')}`
            ])
          };
        }
        break;
      }

      case 'CURRENT_OCCUPANT': {
        if (q.includes('vacant') || q.includes('empty') || q.includes('unoccupied')) {
          const activeAssignments = await TenantAssignment.find({ status: 'Active' });
          const occupiedUnitIds = activeAssignments.map(a => a.unitId.toString());
          const vacantUnits = allUnits.filter(u => !occupiedUnitIds.includes(u._id.toString()));

          answer = `There are **${vacantUnits.length} vacant unit(s)** in the portfolio:`;
          tableData = {
            columns: ['Unit Code', 'Unit Name', 'Property', 'Type', 'Floor'],
            rows: vacantUnits.map(u => [
              u.unitCode,
              u.unitName,
              u.propertyId?.name || 'N/A',
              u.unitType,
              u.floor || 'Ground'
            ])
          };
        } else if (matchedUnit) {
          const assign = await TenantAssignment.findOne({ unitId: matchedUnit._id, status: 'Active' })
            .populate('tenantId');
          const agree = await RentAgreement.findOne({ unitId: matchedUnit._id, isCurrentRate: true });

          if (assign && assign.tenantId) {
            answer = `Unit **${matchedUnit.unitName}** is currently occupied by **${assign.tenantId.name}** since ${assign.startDate.toISOString().split('T')[0]}. The active monthly rent rate is **₹${agree?.monthlyRate.toLocaleString('en-IN') || 'N/A'}**.`;
          } else {
            answer = `Unit **${matchedUnit.unitName}** is currently vacant.`;
          }
        } else if (matchedProperty) {
          const propUnits = await Unit.find({ propertyId: matchedProperty._id });
          const assigns = await TenantAssignment.find({ unitId: { $in: propUnits.map(u => u._id) }, status: 'Active' })
            .populate('tenantId')
            .populate('unitId');

          answer = `Units and current occupants for **${matchedProperty.name}**:`;
          tableData = {
            columns: ['Unit', 'Current Tenant', 'Lease Start Date', 'Status'],
            rows: assigns.map(a => [
              a.unitId?.unitName || 'Unit',
              a.tenantId?.name || 'Unoccupied',
              a.startDate ? a.startDate.toISOString().split('T')[0] : 'N/A',
              a.status
            ])
          };
        } else {
          const activeAssigns = await TenantAssignment.find({ status: 'Active' })
            .populate('tenantId')
            .populate({ path: 'unitId', populate: { path: 'propertyId' } });

          answer = `Currently active tenants and assigned units (${activeAssigns.length} total):`;
          tableData = {
            columns: ['Property', 'Unit', 'Tenant Name', 'Lease Start', 'Status'],
            rows: activeAssigns.map(a => [
              a.unitId?.propertyId?.name || 'N/A',
              a.unitId?.unitName || 'N/A',
              a.tenantId?.name || 'N/A',
              a.startDate ? a.startDate.toISOString().split('T')[0] : 'N/A',
              a.status
            ])
          };
        }
        break;
      }

      case 'RENT_INCREASE_HISTORY': {
        const history = await RentAgreement.find(matchedUnit ? { unitId: matchedUnit._id } : {})
          .populate('tenantId', 'name')
          .populate({ path: 'unitId', populate: { path: 'propertyId' } })
          .sort({ effectiveFrom: -1 })
          .limit(10);

        answer = `Historical rent rate agreements and escalation records:`;
        tableData = {
          columns: ['Unit', 'Tenant', 'Effective Date', 'Current Rate', 'Previous Rate', 'Reason for Revision'],
          rows: history.map(h => [
            h.unitId?.unitName || '',
            h.tenantId?.name || '',
            h.effectiveFrom ? h.effectiveFrom.toISOString().split('T')[0] : 'N/A',
            `₹${h.monthlyRate.toLocaleString('en-IN')}`,
            `₹${(h.previousRate || 0).toLocaleString('en-IN')}`,
            h.reasonForChange || 'Initial Agreement'
          ])
        };
        break;
      }

      case 'MONTHLY_FINANCIALS': {
        const target = matchedMonth || '2026-03';
        const ledger = await MonthlyLedger.findOne({ monthYear: target });

        if (ledger) {
          answer = `Audited Financial Statement for **${target}**:`;
          tableData = {
            columns: ['Financial Parameter', 'Amount (₹)'],
            rows: [
              ['Opening Balance', `₹${ledger.openingBalance.toLocaleString('en-IN')}`],
              ['Total Rent Income Received', `₹${ledger.totalIncomeReceived.toLocaleString('en-IN')}`],
              ['Total Property Expenses Paid', `₹${ledger.totalExpensesPaid.toLocaleString('en-IN')}`],
              ['Net Cash Flow (Surplus)', `₹${ledger.netCashFlow.toLocaleString('en-IN')}`],
              ['Closing Bank Balance', `₹${ledger.closingBalance.toLocaleString('en-IN')}`]
            ]
          };
        } else {
          const allLedgers = await MonthlyLedger.find().sort({ monthYear: 1 });
          answer = `Summary of verified monthly financial statements:`;
          tableData = {
            columns: ['Month', 'Opening Balance', 'Income Received', 'Expenses Paid', 'Closing Balance'],
            rows: allLedgers.map(l => [
              l.monthYear,
              `₹${l.openingBalance.toLocaleString('en-IN')}`,
              `₹${l.totalIncomeReceived.toLocaleString('en-IN')}`,
              `₹${l.totalExpensesPaid.toLocaleString('en-IN')}`,
              `₹${l.closingBalance.toLocaleString('en-IN')}`
            ])
          };
        }
        break;
      }

      case 'PROPERTIES_SUMMARY': {
        answer = `Total of **${allProperties.length} properties** and **${allUnits.length} partitioned units** registered in the portfolio:`;
        tableData = {
          columns: ['Property Code', 'Property Name', 'Type', 'Responsible Person', 'Total Units'],
          rows: allProperties.map(p => {
            const count = allUnits.filter(u => u.propertyId?._id?.toString() === p._id.toString() || u.propertyId?.toString() === p._id.toString()).length;
            return [
              p.propertyCode,
              p.name,
              p.propertyType,
              p.ownerOrResponsiblePerson,
              count.toString()
            ];
          })
        };
        break;
      }

      default: {
        answer = `I am your Estate Assistant. You can ask queries regarding tenants, outstanding dues, payments, or properties. For example:\n` +
          `• "Who has outstanding rent?"\n` +
          `• "How much rent is pending for Delhiery?"\n` +
          `• "When was the last payment received from Snip Salon?"\n` +
          `• "How much rent was collected in March 2026?"\n` +
          `• "Which units are currently vacant?"\n` +
          `• "Show the PG settlement statement"\n` +
          `• "What is the financial closing balance for March?"`;
      }
    }

    res.json({
      success: true,
      query: req.body.query,
      intent: intent.type,
      answer,
      tableData
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
