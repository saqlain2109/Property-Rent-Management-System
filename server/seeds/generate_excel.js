/**
 * Property Rent Management System — Data Model Excel Generator
 * Generates a full Excel workbook with:
 *   - Sheet 1: Data Model Diagram (entity relationship overview)
 *   - One sheet per collection with all fields and data
 * Run: node seeds/generate_excel.js
 */

const XLSX = require('xlsx');
const fs   = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const OUT_FILE = path.join(__dirname, '..', '..', 'Property_Rent_Data_Model.xlsx');
const MAX_ROWS  = 100;

// ── Helper: resolve ObjectId references to human-readable names ──────────────
function loadAll(name) {
  const file = path.join(DATA_DIR, `${name}.json`);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
}

const properties   = loadAll('properties');
const units        = loadAll('units');
const tenants      = loadAll('tenants');
const assignments  = loadAll('tenantassignments');
const agreements   = loadAll('rentagreements');
const receipts     = loadAll('paymentreceipts');
const allocations  = loadAll('paymentallocations');
const expenses     = loadAll('expenses');
const expCats      = loadAll('expensecategories');
const ledgers      = loadAll('monthlyledgers');
const pgSettlements= loadAll('pgsettlements');
const users        = loadAll('users');

// ID → name maps
const propMap   = Object.fromEntries(properties.map(p => [String(p._id?.$oid||p._id), p.name]));
const unitMap   = Object.fromEntries(units.map(u => [String(u._id?.$oid||u._id), u.unitName]));
const tenantMap = Object.fromEntries(tenants.map(t => [String(t._id?.$oid||t._id), t.name]));
const assnMap   = Object.fromEntries(assignments.map(a => [String(a._id?.$oid||a._id), a.assignmentCode]));
const receiptMap= Object.fromEntries(receipts.map(r => [String(r._id?.$oid||r._id), r.receiptNumber]));

function getId(doc) { return doc?.$oid ? doc.$oid : String(doc||''); }
function fmtDate(v) {
  if (!v) return '';
  try { return new Date(v.$date||v).toLocaleDateString('en-IN'); } catch { return String(v); }
}
function fmtBool(v) { return v === true ? 'Yes' : v === false ? 'No' : ''; }
function fmtNum(v)  { return (v===null||v===undefined||v==='') ? '' : Number(v); }

// ── Build workbook ────────────────────────────────────────────────────────────
const wb = XLSX.utils.book_new();

// ════════════════════════════════════════════════════════════════════════════
// SHEET 0: DATA MODEL OVERVIEW
// ════════════════════════════════════════════════════════════════════════════
const modelRows = [
  ['PROPERTY RENT MANAGEMENT SYSTEM — DATA MODEL DIAGRAM'],
  [''],
  ['MASTER OBJECTS (Reference / Configuration Data)'],
  ['Object', 'Description', 'Key Fields', 'Linked To'],
  ['Properties', 'Physical properties owned/managed', 'propertyCode, name, city, propertyType, ownershipPercentage, totalAreaSqFt', '→ Units'],
  ['Units', 'Rentable unit within a property', 'unitCode, unitName, unitType, areaSqFt, monthlyRentExpected, occupancyStatus', '→ Properties, TenantAssignments'],
  ['Tenants', 'Tenant / lessee master record', 'tenantCode, name, phone, email, tenantType, idProofType', '→ TenantAssignments'],
  ['ExpenseCategories', 'Category master for expenses', 'name, headType, isDefault, description', '→ Expenses'],
  ['Users', 'System login users', 'username, name, email, role, isActive', '(standalone)'],
  [''],
  ['TRANSACTION OBJECTS'],
  ['Object', 'Description', 'Key Fields', 'Linked To'],
  ['TenantAssignments', 'Links tenant to a unit with contract details', 'assignmentCode, contractNo, contractType, startDate, endDate, status, depositHeld', '→ Tenants, Units, RentAgreements'],
  ['RentAgreements', 'Rent rate applicable for an assignment period', 'rentType, monthlyRate, annualRate, cashPortion, chequePortion, effectiveFrom, effectiveTo, isCurrentRate', '→ TenantAssignments, Units, Tenants'],
  ['PaymentReceipts', 'Actual money received (receipt header)', 'receiptNumber, receiptDate, totalAmount, paymentMode, bankName, contractNo', '→ Tenants, Units, PaymentAllocations'],
  ['PaymentAllocations', 'Maps each receipt to a rent month', 'rentMonthYear, allocatedAmount, isAdvanceOrExcess', '→ PaymentReceipts, Tenants, Units'],
  ['Expenses', 'Expenditure for property / general', 'expenseCode, expenseDate, category, amount, paymentMode, headType, vendorOrPayee', '→ Properties, Units'],
  ['MonthlyLedgers', 'Month-end summary ledger per month-year', 'monthYear, totalIncomeReceived, totalExpensesPaid, netCashFlow, openingBalance, closingBalance, isReconciled', '(summary)'],
  ['PGSettlements', 'Monthly PG operator settlement breakdown', 'monthYear, pgGrossCollection, altafShare, anandShare, bisleriWaterShare, netReceivedByOwner, status', '(standalone)'],
  [''],
  ['ENTITY RELATIONSHIPS'],
  ['From', 'Relationship', 'To', 'Type'],
  ['Properties', '1 has many', 'Units', 'One-to-Many'],
  ['Units', '1 has many', 'TenantAssignments', 'One-to-Many'],
  ['Tenants', '1 has many', 'TenantAssignments', 'One-to-Many'],
  ['TenantAssignments', '1 has many', 'RentAgreements', 'One-to-Many'],
  ['TenantAssignments', '1 has many', 'PaymentReceipts', 'One-to-Many'],
  ['PaymentReceipts', '1 has many', 'PaymentAllocations', 'One-to-Many (1:1 in current data)'],
  ['ExpenseCategories', '1 has many', 'Expenses', 'One-to-Many'],
  ['Properties', '1 has many', 'Expenses', 'One-to-Many'],
  [''],
  ['RECORD COUNTS'],
  ['Collection', 'Records'],
  ['Properties', properties.length],
  ['Units', units.length],
  ['Tenants', tenants.length],
  ['TenantAssignments', assignments.length],
  ['RentAgreements', agreements.length],
  ['PaymentReceipts', receipts.length],
  ['PaymentAllocations', allocations.length],
  ['Expenses', expenses.length],
  ['ExpenseCategories', expCats.length],
  ['MonthlyLedgers', ledgers.length],
  ['PGSettlements', pgSettlements.length],
  ['Users', users.length],
  ['TOTAL', properties.length+units.length+tenants.length+assignments.length+agreements.length+
           receipts.length+allocations.length+expenses.length+expCats.length+ledgers.length+pgSettlements.length+users.length],
];

const wsModel = XLSX.utils.aoa_to_sheet(modelRows);
// Column widths
wsModel['!cols'] = [{wch:28},{wch:52},{wch:72},{wch:55}];
XLSX.utils.book_append_sheet(wb, wsModel, 'Data Model');


// ════════════════════════════════════════════════════════════════════════════
// SHEET: PROPERTIES
// ════════════════════════════════════════════════════════════════════════════
{
  const headers = ['ID','Property Code','Name','Address','City','Property Type',
                   'Owner / Responsible Person','Total Area (SqFt)','Ownership %',
                   'Description','Is Active','Display Order','Created At','Updated At'];
  const rows = properties.map(p => [
    getId(p._id), p.propertyCode, p.name, p.address, p.city, p.propertyType,
    p.ownerOrResponsiblePerson, fmtNum(p.totalAreaSqFt), fmtNum(p.ownershipPercentage),
    p.description, fmtBool(p.isActive), fmtNum(p.displayOrder),
    fmtDate(p.createdAt), fmtDate(p.updatedAt)
  ]);
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  ws['!cols'] = [{wch:26},{wch:16},{wch:32},{wch:20},{wch:14},{wch:22},{wch:24},
                 {wch:16},{wch:13},{wch:28},{wch:10},{wch:14},{wch:14},{wch:14}];
  XLSX.utils.book_append_sheet(wb, ws, 'Properties');
}


// ════════════════════════════════════════════════════════════════════════════
// SHEET: UNITS
// ════════════════════════════════════════════════════════════════════════════
{
  const headers = ['ID','Unit Code','Property','Property ID','Sub-Unit Partition','Unit Name',
                   'Unit Type','Floor','Area (SqFt)','Carpet Area (SqFt)',
                   'Monthly Rent Expected','Occupancy Status','Notes','Is Active','Display Order',
                   'Created At','Updated At'];
  const rows = units.map(u => [
    getId(u._id), u.unitCode,
    propMap[getId(u.propertyId)] || '', getId(u.propertyId),
    u.subUnitPartition, u.unitName, u.unitType, u.floor,
    fmtNum(u.areaSqFt), fmtNum(u.carpetAreaSqFt), fmtNum(u.monthlyRentExpected),
    u.occupancyStatus, u.notes, fmtBool(u.isActive), fmtNum(u.displayOrder),
    fmtDate(u.createdAt), fmtDate(u.updatedAt)
  ]);
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  ws['!cols'] = [{wch:26},{wch:14},{wch:30},{wch:26},{wch:18},{wch:20},{wch:18},{wch:8},
                 {wch:12},{wch:16},{wch:22},{wch:18},{wch:24},{wch:10},{wch:14},{wch:14},{wch:14}];
  XLSX.utils.book_append_sheet(wb, ws, 'Units');
}


// ════════════════════════════════════════════════════════════════════════════
// SHEET: TENANTS
// ════════════════════════════════════════════════════════════════════════════
{
  const headers = ['ID','Tenant Code','Name','Phone','Email','Tenant Type',
                   'ID Proof Type','ID Proof Number','Address',
                   'Emergency Contact Name','Emergency Contact Phone',
                   'Notes','Is Active','Created At','Updated At'];
  const rows = tenants.map(t => [
    getId(t._id), t.tenantCode, t.name, t.phone, t.email, t.tenantType,
    t.idProofType, t.idProofNumber, t.address,
    t.emergencyContactName, t.emergencyContactPhone,
    t.notes, fmtBool(t.isActive), fmtDate(t.createdAt), fmtDate(t.updatedAt)
  ]);
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  ws['!cols'] = [{wch:26},{wch:16},{wch:28},{wch:16},{wch:28},{wch:16},
                 {wch:16},{wch:18},{wch:28},{wch:24},{wch:22},{wch:30},{wch:10},{wch:14},{wch:14}];
  XLSX.utils.book_append_sheet(wb, ws, 'Tenants');
}


// ════════════════════════════════════════════════════════════════════════════
// SHEET: TENANT ASSIGNMENTS
// ════════════════════════════════════════════════════════════════════════════
{
  const headers = ['ID','Assignment Code','Contract No','Contract Type',
                   'Tenant','Tenant ID','Unit','Unit ID',
                   'Start Date','End Date','Status',
                   'Deposit Held','Deposit Refunded',
                   'Initial Paid Till Month','Notes','Created At','Updated At'];
  const rows = assignments.map(a => [
    getId(a._id), a.assignmentCode, a.contractNo, a.contractType,
    tenantMap[getId(a.tenantId)] || '', getId(a.tenantId),
    unitMap[getId(a.unitId)] || '', getId(a.unitId),
    fmtDate(a.startDate), fmtDate(a.endDate), a.status,
    fmtNum(a.depositHeld), fmtNum(a.depositRefunded),
    a.initialPaidTillMonth, a.notes, fmtDate(a.createdAt), fmtDate(a.updatedAt)
  ]);
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  ws['!cols'] = [{wch:26},{wch:32},{wch:16},{wch:16},{wch:28},{wch:26},{wch:22},{wch:26},
                 {wch:12},{wch:12},{wch:10},{wch:14},{wch:18},{wch:22},{wch:36},{wch:14},{wch:14}];
  XLSX.utils.book_append_sheet(wb, ws, 'TenantAssignments');
}


// ════════════════════════════════════════════════════════════════════════════
// SHEET: RENT AGREEMENTS
// ════════════════════════════════════════════════════════════════════════════
{
  const headers = ['ID','Assignment Code','Assignment ID','Unit','Unit ID','Tenant','Tenant ID',
                   'Contract Type','Rent Type','Monthly Rate','Annual Rate',
                   'Cash Portion','Cheque Portion',
                   'Effective From','Effective To',
                   'Previous Rate','Reason For Change',
                   'Is Current Rate','Terms','Created At','Updated At'];
  const rows = agreements.map(ag => [
    getId(ag._id),
    assnMap[getId(ag.assignmentId)] || '', getId(ag.assignmentId),
    unitMap[getId(ag.unitId)] || '', getId(ag.unitId),
    tenantMap[getId(ag.tenantId)] || '', getId(ag.tenantId),
    ag.contractType, ag.rentType,
    fmtNum(ag.monthlyRate), fmtNum(ag.annualRate),
    fmtNum(ag.cashPortion), fmtNum(ag.chequePortion),
    fmtDate(ag.effectiveFrom), fmtDate(ag.effectiveTo),
    fmtNum(ag.previousRate), ag.reasonForChange,
    fmtBool(ag.isCurrentRate), ag.terms,
    fmtDate(ag.createdAt), fmtDate(ag.updatedAt)
  ]);
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  ws['!cols'] = [{wch:26},{wch:32},{wch:26},{wch:22},{wch:26},{wch:28},{wch:26},
                 {wch:16},{wch:18},{wch:14},{wch:14},{wch:14},{wch:16},
                 {wch:14},{wch:14},{wch:14},{wch:22},{wch:16},{wch:40},{wch:14},{wch:14}];
  XLSX.utils.book_append_sheet(wb, ws, 'RentAgreements');
}


// ════════════════════════════════════════════════════════════════════════════
// SHEET: PAYMENT RECEIPTS (up to MAX_ROWS)
// ════════════════════════════════════════════════════════════════════════════
{
  const headers = ['ID','Receipt Number','Contract No','Receipt Date',
                   'Tenant','Tenant ID','Unit','Unit ID',
                   'Total Amount','Payment Mode','Bank Name',
                   'Comments','Is Reversed','Reversal Reason','Created At','Updated At'];
  const slice = receipts.slice(0, MAX_ROWS);
  const rows = slice.map(r => [
    getId(r._id), r.receiptNumber, r.contractNo, fmtDate(r.receiptDate),
    tenantMap[getId(r.tenantId)] || '', getId(r.tenantId),
    unitMap[getId(r.unitId)] || '', getId(r.unitId),
    fmtNum(r.totalAmount), r.paymentMode,  r.bankName,
    r.comments, fmtBool(r.isReversed), r.reversalReason,
    fmtDate(r.createdAt), fmtDate(r.updatedAt)
  ]);
  const noteRow = [`[Showing ${slice.length} of ${receipts.length} total records]`];
  const ws = XLSX.utils.aoa_to_sheet([headers, noteRow, ...rows]);
  ws['!cols'] = [{wch:26},{wch:20},{wch:16},{wch:14},{wch:28},{wch:26},{wch:22},{wch:26},
                 {wch:14},{wch:28},{wch:18},{wch:16},{wch:40},{wch:12},{wch:20},{wch:14},{wch:14}];
  XLSX.utils.book_append_sheet(wb, ws, 'PaymentReceipts');
}


// ════════════════════════════════════════════════════════════════════════════
// SHEET: PAYMENT ALLOCATIONS (up to MAX_ROWS)
// ════════════════════════════════════════════════════════════════════════════
{
  const headers = ['ID','Receipt Number','Receipt ID','Tenant','Tenant ID','Unit','Unit ID',
                   'Rent Month-Year','Allocated Amount','Is Advance / Excess',
                   'Notes','Created At','Updated At'];
  const slice = allocations.slice(0, MAX_ROWS);
  const rows = slice.map(a => [
    getId(a._id),
    receiptMap[getId(a.receiptId)] || '', getId(a.receiptId),
    tenantMap[getId(a.tenantId)] || '', getId(a.tenantId),
    unitMap[getId(a.unitId)] || '', getId(a.unitId),
    a.rentMonthYear, fmtNum(a.allocatedAmount), fmtBool(a.isAdvanceOrExcess),
    a.notes, fmtDate(a.createdAt), fmtDate(a.updatedAt)
  ]);
  const noteRow = [`[Showing ${slice.length} of ${allocations.length} total records]`];
  const ws = XLSX.utils.aoa_to_sheet([headers, noteRow, ...rows]);
  ws['!cols'] = [{wch:26},{wch:22},{wch:26},{wch:28},{wch:26},{wch:22},{wch:26},
                 {wch:18},{wch:18},{wch:20},{wch:36},{wch:14},{wch:14}];
  XLSX.utils.book_append_sheet(wb, ws, 'PaymentAllocations');
}


// ════════════════════════════════════════════════════════════════════════════
// SHEET: EXPENSE CATEGORIES
// ════════════════════════════════════════════════════════════════════════════
{
  const headers = ['ID','Name','Head Type','Is Default','Description','Created At','Updated At'];
  const rows = expCats.map(c => [
    getId(c._id), c.name, c.headType, fmtBool(c.isDefault),
    c.description, fmtDate(c.createdAt), fmtDate(c.updatedAt)
  ]);
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  ws['!cols'] = [{wch:26},{wch:28},{wch:14},{wch:12},{wch:36},{wch:14},{wch:14}];
  XLSX.utils.book_append_sheet(wb, ws, 'ExpenseCategories');
}


// ════════════════════════════════════════════════════════════════════════════
// SHEET: EXPENSES (up to MAX_ROWS)
// ════════════════════════════════════════════════════════════════════════════
{
  const headers = ['ID','Expense Code','Expense Date','Head Type','Category',
                   'Property','Property ID','Unit','Unit ID',
                   'Amount','Payment Mode',
                   'Vendor / Payee','Description','Legacy Code',
                   'Is Reversed','Reversal Reason','Created At','Updated At'];
  const slice = expenses.slice(0, MAX_ROWS);
  const rows = slice.map(e => [
    getId(e._id), e.expenseCode, fmtDate(e.expenseDate), e.headType, e.category,
    propMap[getId(e.propertyId)] || '', getId(e.propertyId),
    e.unitId ? (unitMap[getId(e.unitId)] || '') : '', e.unitId ? getId(e.unitId) : '',
    fmtNum(e.amount), e.paymentMode, 
    e.vendorOrPayee, e.description, e.legacyCode,
    fmtBool(e.isReversed), e.reversalReason, fmtDate(e.createdAt), fmtDate(e.updatedAt)
  ]);
  const noteRow = [`[Showing ${slice.length} of ${expenses.length} total records]`];
  const ws = XLSX.utils.aoa_to_sheet([headers, noteRow, ...rows]);
  ws['!cols'] = [{wch:26},{wch:18},{wch:14},{wch:14},{wch:28},{wch:28},{wch:26},{wch:20},{wch:26},
                 {wch:12},{wch:28},{wch:18},{wch:22},{wch:36},{wch:14},{wch:12},{wch:20},{wch:14},{wch:14}];
  XLSX.utils.book_append_sheet(wb, ws, 'Expenses');
}


// ════════════════════════════════════════════════════════════════════════════
// SHEET: MONTHLY LEDGERS
// ════════════════════════════════════════════════════════════════════════════
{
  const headers = ['ID','Month-Year','Opening Balance','Total Income Received',
                   'Total Expenses Paid','Net Cash Flow','Closing Balance',
                   'Is Reconciled','Notes','Created At','Updated At'];
  const sorted = [...ledgers].sort((a,b) => a.monthYear < b.monthYear ? -1 : 1);
  const rows = sorted.map(l => [
    getId(l._id), l.monthYear,
    fmtNum(l.openingBalance), fmtNum(l.totalIncomeReceived),
    fmtNum(l.totalExpensesPaid), fmtNum(l.netCashFlow), fmtNum(l.closingBalance),
    fmtBool(l.isReconciled), l.notes, fmtDate(l.createdAt), fmtDate(l.updatedAt)
  ]);
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  ws['!cols'] = [{wch:26},{wch:12},{wch:18},{wch:22},{wch:22},{wch:16},{wch:18},
                 {wch:14},{wch:30},{wch:14},{wch:14}];
  XLSX.utils.book_append_sheet(wb, ws, 'MonthlyLedgers');
}


// ════════════════════════════════════════════════════════════════════════════
// SHEET: PG SETTLEMENTS
// ════════════════════════════════════════════════════════════════════════════
{
  const headers = ['ID','Month-Year','PG Gross Collection','Altaf Share','Anand Share',
                   'Bisleri Water Share','Rehan Share','Total Operator Deductions',
                   'Net Received By Owner','Actual Bank Received',
                   'Discrepancy / Excess','Status','Notes','Created At','Updated At'];
  const rows = pgSettlements.map(p => [
    getId(p._id), p.monthYear,
    fmtNum(p.pgGrossCollection), fmtNum(p.altafShare), fmtNum(p.anandShare),
    fmtNum(p.bisleriWaterShare), fmtNum(p.rehanShare), fmtNum(p.totalOperatorDeductions),
    fmtNum(p.netReceivedByOwner), fmtNum(p.actualBankReceived),
    fmtNum(p.discrepancyOrExcess), p.status, p.notes,
    fmtDate(p.createdAt), fmtDate(p.updatedAt)
  ]);
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  ws['!cols'] = [{wch:26},{wch:12},{wch:22},{wch:14},{wch:14},{wch:20},{wch:14},{wch:26},
                 {wch:24},{wch:22},{wch:22},{wch:12},{wch:40},{wch:14},{wch:14}];
  XLSX.utils.book_append_sheet(wb, ws, 'PGSettlements');
}


// ════════════════════════════════════════════════════════════════════════════
// SHEET: USERS
// ════════════════════════════════════════════════════════════════════════════
{
  const headers = ['ID','Name','Username','Email','Phone','Role',
                   'Is Active','Two Factor Enabled','Last Login','Created At','Updated At'];
  const rows = users.map(u => [
    getId(u._id), u.name, u.username, u.email, u.phone, u.role,
    fmtBool(u.isActive), fmtBool(u.twoFactorEnabled),
    fmtDate(u.lastLogin), fmtDate(u.createdAt), fmtDate(u.updatedAt)
  ]);
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  ws['!cols'] = [{wch:26},{wch:20},{wch:16},{wch:28},{wch:16},{wch:12},
                 {wch:12},{wch:20},{wch:20},{wch:14},{wch:14}];
  XLSX.utils.book_append_sheet(wb, ws, 'Users');
}


// ── Write the file ────────────────────────────────────────────────────────────
XLSX.writeFile(wb, OUT_FILE);
console.log('✅ Excel file created:', OUT_FILE);
console.log('   Sheets:', wb.SheetNames.join(', '));
