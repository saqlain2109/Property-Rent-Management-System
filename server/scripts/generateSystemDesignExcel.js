const XLSX = require('xlsx');
const path = require('path');

const wb = XLSX.utils.book_new();

// Sheet 1: Architecture Overview
const archData = [
  ['System Design & Architecture Specification - Property & Rent Management OS'],
  ['Generated Date', new Date().toISOString().split('T')[0]],
  ['Application Tier', 'Layer / Component', 'Technology / Framework', 'Port / Location', 'Description & Key Responsibilities'],
  ['Frontend Client', 'UI & Presentation', 'React 18, Vite 6, TailwindCSS 3', 'http://localhost:5173', 'Single Page Application with Excel-style editable grids, drag-resizable columns, responsive layouts, modals, and charts.'],
  ['Frontend Client', 'State & HTTP Client', 'Axios, LocalStorage, GSAP, Recharts', 'client/src/services/api.js', 'Centralized API wrapper with JWT bearer token interceptors, column preferences, and animations.'],
  ['Frontend Client', 'Export / Reports', 'SheetJS (xlsx)', 'client/src/utils/formatters.js', 'Client-side zero-latency multi-sheet Excel generation and formatted currency/date display.'],
  ['Backend API', 'Server & Middleware', 'Node.js 24, Express 4, Helmet, CORS', 'http://localhost:5000', 'RESTful API gateway with Helmet security headers, rate limiting, and NoSQL injection sanitizer.'],
  ['Backend API', 'Authentication & 2FA', 'JWT, Speakeasy, QRCode, Bcryptjs', 'server/routes/authRoutes.js', 'Dual login (Username/Email), bcrypt salted hashing, TOTP two-factor authentication, audit logging.'],
  ['Backend API', 'Business Logic & Services', 'Mongoose ODM, RentCalculator, LedgerSync', 'server/services/rentCalculator.js', 'Prorated day-level rent computation, advance & arrears allocation, cumulative monthly carry-forward.'],
  ['Database Tier', 'NoSQL Document Store', 'MongoDB 6+ / Mongoose 8', 'mongodb://127.0.0.1:27017/property-rent-db', 'ACID transactions, indexed schemas, automated backup models, foreign reference population.'],
  ['Integration & Storage', 'Excel Migration Engine', 'SheetJS (xlsx) Parser', 'server/routes/migrationRoutes.js', 'Extracts and synchronizes properties, rooms, tenants, contracts, payments from reference Excel workbooks.']
];
const wsArch = XLSX.utils.aoa_to_sheet(archData);
XLSX.utils.book_append_sheet(wb, wsArch, '1_System_Architecture');

// Sheet 2: Database Schema & Collections
const schemaData = [
  ['Database Schema & Entity Relationship Model (MongoDB / Mongoose)'],
  ['Collection / Model', 'Field Name', 'BSON Type', 'Constraints / Index', 'Relationship / Foreign Key', 'Business Rule / Description'],
  ['users', '_id', 'ObjectId', 'Primary Key', '-', 'Unique User Identifier'],
  ['users', 'username', 'String', 'Unique, Trim, Lowercase', '-', 'Login username (e.g. admin)'],
  ['users', 'email', 'String', 'Unique, Trim, Lowercase', '-', 'Login email (e.g. admin@propertyrent.com)'],
  ['users', 'password', 'String', 'Select: false, Bcrypt Hashed', '-', 'Salted Bcrypt hash (min 6 chars)'],
  ['users', 'role', 'String', 'Enum: admin, manager, viewer', '-', 'Role-based access control'],
  ['users', 'twoFactorEnabled', 'Boolean', 'Default: false', '-', 'TOTP 2FA authenticator toggle'],
  ['properties', '_id', 'ObjectId', 'Primary Key', '-', 'Unique Property Identifier'],
  ['properties', 'name', 'String', 'Required, Unique, Trim', '-', 'Property Name (e.g. 65 No Godown, Kotak Godown)'],
  ['properties', 'propertyType', 'String', 'Enum', '-', 'Godown, Commercial Building, Residential, PG, Plot'],
  ['properties', 'ownershipPercent', 'Number', 'Min: 0, Max: 100, Default: 100', '-', 'Ownership percentage (e.g. 50% company share for Delhiery)'],
  ['units', '_id', 'ObjectId', 'Primary Key', '-', 'Unique Unit / Sub-Unit Identifier'],
  ['units', 'propertyId', 'ObjectId', 'Required, Indexed', 'properties._id', 'Parent Property Reference'],
  ['units', 'unitName', 'String', 'Required, Trim', '-', 'Room / Unit number / Partition name'],
  ['units', 'monthlyRent', 'Number', 'Min: 0, Default: 0', '-', 'Base monthly rate in INR'],
  ['units', 'status', 'String', 'Enum: Vacant, Occupied, Maintenance', '-', 'Current occupancy status of partition'],
  ['tenants', '_id', 'ObjectId', 'Primary Key', '-', 'Unique Tenant Master Identifier'],
  ['tenants', 'name', 'String', 'Required, Trim', '-', 'Tenant legal / business name'],
  ['tenants', 'phone', 'String', 'Trim', '-', 'Contact phone number'],
  ['tenants', 'isActive', 'Boolean', 'Default: true, Indexed', '-', 'Soft active / inactive tenancy indicator'],
  ['tenantassignments', '_id', 'ObjectId', 'Primary Key', '-', 'Contract / Lease Agreement Record'],
  ['tenantassignments', 'assignmentCode', 'String', 'Unique, Indexed', '-', 'Human-readable contract code (e.g. ASN-65-DELHIERY)'],
  ['tenantassignments', 'tenantId', 'ObjectId', 'Required, Indexed', 'tenants._id', 'Associated Tenant'],
  ['tenantassignments', 'unitId', 'ObjectId', 'Required, Indexed', 'units._id', 'Associated Partition / Unit'],
  ['tenantassignments', 'startDate', 'Date', 'Required', '-', 'Lease contract start date'],
  ['tenantassignments', 'endDate', 'Date', 'Nullable (Ongoing)', '-', 'Lease end / vacate date'],
  ['tenantassignments', 'status', 'String', 'Enum: Active, Past / Vacated', '-', 'Lease contract lifecycle state'],
  ['rentagreements', 'assignmentId', 'ObjectId', 'Required, Indexed', 'tenantassignments._id', 'Parent contract linkage'],
  ['rentagreements', 'monthlyRate', 'Number', 'Required, Min: 0', '-', 'Agreed monthly rent amount'],
  ['rentagreements', 'effectiveFrom', 'Date', 'Required', '-', 'Date when this rent rate revision started'],
  ['rentagreements', 'effectiveTo', 'Date', 'Nullable (Ongoing)', '-', 'Date when this rate was revised'],
  ['paymentreceipts', '_id', 'ObjectId', 'Primary Key', '-', 'Payment Receipt Record'],
  ['paymentreceipts', 'receiptNumber', 'String', 'Unique, Indexed', '-', 'Receipt voucher number (e.g. RCP-2026-001)'],
  ['paymentreceipts', 'tenantId', 'ObjectId', 'Required, Indexed', 'tenants._id', 'Payer Tenant'],
  ['paymentreceipts', 'receiptDate', 'Date', 'Required, Indexed', '-', 'Voucher / Payment date'],
  ['paymentreceipts', 'totalAmount', 'Number', 'Required, Min: 1', '-', 'Total received sum in INR'],
  ['paymentreceipts', 'paymentMode', 'String', 'Enum: Cash, Cheque, Bank Transfer, UPI, Mixed', '-', 'Payment method'],
  ['paymentallocations', 'receiptId', 'ObjectId', 'Required, Indexed', 'paymentreceipts._id', 'Parent receipt voucher'],
  ['paymentallocations', 'assignmentId', 'ObjectId', 'Required, Indexed', 'tenantassignments._id', 'Credited contract lease'],
  ['paymentallocations', 'rentMonthYear', 'String', 'Required, Regex: ^\\d{4}-\\d{2}$', '-', 'Credited month (YYYY-MM)'],
  ['paymentallocations', 'allocatedAmount', 'Number', 'Required, Min: 0', '-', 'Amount applied toward that specific month rent'],
  ['expenses', '_id', 'ObjectId', 'Primary Key', '-', 'Property Expense Record'],
  ['expenses', 'propertyId', 'ObjectId', 'Required, Indexed', 'properties._id', 'Property incurring expense'],
  ['expenses', 'unitId', 'ObjectId', 'Nullable, Indexed', 'units._id', 'Specific partition (or whole property if null)'],
  ['expenses', 'category', 'String', 'Required, Indexed', '-', 'Category (Maintenance, Light Bill, Repair, etc.)'],
  ['expenses', 'amount', 'Number', 'Required, Min: 1', '-', 'Expense amount in INR'],
  ['expenses', 'expenseMonthYear', 'String', 'Required, Indexed', '-', 'Accounting month (YYYY-MM)'],
  ['monthlyledgers', 'monthYear', 'String', 'Unique, Indexed', '-', 'Accounting month (YYYY-MM)'],
  ['monthlyledgers', 'openingBalance', 'Number', 'Default: 0', '-', 'Starting balance carried forward from previous month'],
  ['monthlyledgers', 'totalIncomeReceived', 'Number', 'Default: 0', '-', 'Total rent collected during month'],
  ['monthlyledgers', 'totalExpensesPaid', 'Number', 'Default: 0', '-', 'Total expenses incurred during month'],
  ['monthlyledgers', 'netCashFlow', 'Number', 'Computed', '-', 'Income minus Expenses'],
  ['monthlyledgers', 'closingBalance', 'Number', 'Computed', '-', 'Opening Balance + Net Cash Flow']
];
const wsSchema = XLSX.utils.aoa_to_sheet(schemaData);
XLSX.utils.book_append_sheet(wb, wsSchema, '2_Database_Schema');

// Sheet 3: REST API Endpoints Specification
const apiData = [
  ['RESTful API Endpoints Specification'],
  ['Module / Domain', 'HTTP Method', 'Endpoint Path', 'Auth Required', 'Request Payload (JSON)', 'Success Response (200/201)', 'Description & Business Rules'],
  ['Auth', 'POST', '/api/auth/login', 'No', '{ username, password }', '{ success, token, user }', 'Dual authentication with either username or email + bcrypt comparison.'],
  ['Auth', 'POST', '/api/auth/verify-2fa-login', 'No', '{ tempToken, token }', '{ success, token, user }', 'Verifies 6-digit TOTP authenticator code when 2FA is active.'],
  ['Auth', 'POST', '/api/auth/setup-admin', 'No', '{ name, username, email, password }', '{ success, token, user }', 'One-time initial bootstrap of root administrator.'],
  ['Properties', 'GET', '/api/properties', 'Yes (Bearer)', '-', '{ success, data: [ Property ] }', 'Returns all properties with populated units and counts.'],
  ['Properties', 'POST', '/api/properties', 'Yes (Bearer)', '{ name, propertyType, ownershipPercent, isSingleUnit }', '{ success, data: Property }', 'Creates property. Auto-creates unit if isSingleUnit is true.'],
  ['Properties', 'PUT', '/api/properties/:id', 'Yes (Bearer)', '{ name, propertyType, ownershipPercent }', '{ success, data: Property }', 'Updates property details.'],
  ['Properties', 'DELETE', '/api/properties/:id', 'Yes (Bearer)', '-', '{ success, message }', 'Deletes property if no active leases or receipts attached.'],
  ['Units', 'GET', '/api/units', 'Yes (Bearer)', '?propertyId=', '{ success, data: [ Unit ] }', 'Returns partitions / sub-units for properties.'],
  ['Units', 'POST', '/api/units', 'Yes (Bearer)', '{ propertyId, unitName, monthlyRent }', '{ success, data: Unit }', 'Creates new unit partition under a property.'],
  ['Tenants', 'GET', '/api/tenants', 'Yes (Bearer)', '-', '{ success, data: [ Tenant ] }', 'Returns all tenants with their active lease and room assignment.'],
  ['Tenants', 'POST', '/api/tenants', 'Yes (Bearer)', '{ name, phone, unitId, startDate, monthlyRate }', '{ success, data: Tenant }', 'Creates tenant and optionally provisions lease contract.'],
  ['Tenants', 'DELETE', '/api/tenants/:id', 'Yes (Bearer)', '-', '{ success, message }', 'Safe deletion of tenant after cleaning up assignment links.'],
  ['Contracts', 'GET', '/api/assignments', 'Yes (Bearer)', '-', '{ success, data: [ Contract ] }', 'Returns leases with prorated expected rent, received & outstanding.'],
  ['Contracts', 'POST', '/api/assignments', 'Yes (Bearer)', '{ tenantId, unitId, startDate, monthlyRate }', '{ success, data: Contract }', 'Creates binding lease agreement.'],
  ['Contracts', 'POST', '/api/assignments/:id/revise-rate', 'Yes (Bearer)', '{ newRate, effectiveFrom, reason }', '{ success, data: Contract }', 'Appends new rate revision to timeline without losing historical rates.'],
  ['Contracts', 'POST', '/api/assignments/:id/vacate', 'Yes (Bearer)', '{ endDate, depositRefunded, notes }', '{ success, data: Contract }', 'Marks contract as past/vacated and frees up sub-unit.'],
  ['Payments', 'GET', '/api/payments/receipts', 'Yes (Bearer)', '?tenantId=&propertyId=&month=', '{ success, data: [ Receipt ] }', 'Returns payment receipts with multi-month filters.'],
  ['Payments', 'POST', '/api/payments/receipts', 'Yes (Bearer)', '{ tenantId, receiptDate, totalAmount, paymentMode, allocations }', '{ success, data: Receipt }', 'Registers payment receipt and creates monthly ledger allocations.'],
  ['Expenses', 'GET', '/api/expenses', 'Yes (Bearer)', '?monthYear=&propertyId=&category=', '{ success, data: [ Expense ] }', 'Returns monthly expenses with property & sub-unit breakdown.'],
  ['Expenses', 'POST', '/api/expenses', 'Yes (Bearer)', '{ propertyId, unitId, category, amount, expenseMonthYear, paymentMode }', '{ success, data: Expense }', 'Creates new expense voucher and recomputes monthly ledger.'],
  ['Expenses', 'POST', '/api/expenses/categories', 'Yes (Bearer)', '{ name }', '{ success, data: Category }', 'Creates new expense head on-the-fly.'],
  ['Ledger', 'GET', '/api/ledger', 'Yes (Bearer)', '-', '{ success, data: [ MonthlyLedger ] }', 'Returns monthly balance sheet with opening, income, expenses & closing.'],
  ['Dashboard', 'GET', '/api/dashboard/summary', 'Yes (Bearer)', '?targetMonth=YYYY-MM', '{ success, stats, trends }', 'Returns live KPIs, occupancy rate, pending dues, cash flow charts.']
];
const wsApi = XLSX.utils.aoa_to_sheet(apiData);
XLSX.utils.book_append_sheet(wb, wsApi, '3_REST_API_Endpoints');

// Sheet 4: Business Rules & Calculation Logic
const rulesData = [
  ['Core Business Logic, Calculation Formulas & Accounting Rules'],
  ['Rule / Calculation Area', 'Formula / Logic', 'Mathematical Representation', 'Edge Case Handling', 'Applied In Module'],
  ['Prorated Monthly Rent', 'Daily prorated rate based on days in month', 'Rent = (MonthlyRate / DaysInMonth) * DaysOccupied', 'Handles February 28/29 leap years, mid-month move-in/vacate', 'RentCalculator / Contracts / Receipts'],
  ['Expected Rent To Date', 'Sum of all monthly rates from Start Date through Current Month', 'TotalExpected = Sum(ProratedRent(m) for m in StartMonth..CurrentMonth)', 'Includes rent rate revisions seamlessly based on effectiveFrom dates', 'Contracts Master / Ledger'],
  ['Outstanding Dues', 'Total rent expected minus total rent payments received', 'Outstanding = Max(0, TotalExpected - TotalReceived)', 'Negative dues represent advance rent carried to future months', 'Receipts / Contracts / Dashboard'],
  ['Cumulative Monthly Balance', 'Running balance with chronological carry-forward', 'ClosingBalance(m) = OpeningBalance(m) + Income(m) - Expenses(m)', 'OpeningBalance(m) = ClosingBalance(m - 1). Never drops historical ledger', 'Monthly Ledger / Income Book'],
  ['Payment Receipt Allocation', 'Voucher amount distributed across specific unpaid months', 'TotalReceipt = Sum(Allocations[m])', 'Supports partial payment, advance multi-month payments, mixed cash/cheque', 'Rent Register / Receipts View'],
  ['Godown Single-Unit Auto Provision', 'If property is designated single unit (e.g. Godown/Flat)', 'Property created -> Unit automatically provisioned with same name', '3-second guidance lockout modal directs user to Unit Master if partitions needed', 'Property Master Modal'],
  ['Safe Tenant Deletion', 'Prevents orphaned records', 'Delete Tenant -> Deactivate/archive assignments -> Keep receipt audit logs', 'Guarantees historical financial ledgers remain 100% balanced', 'Tenant Master / Backend Service'],
  ['Dynamic Column Management', 'Custom widths & column order per user', 'User widths saved in browser localStorage (col_widths_{key})', 'Auto-fits 100% table width by default, drag-resizable, one-click reset', 'Contracts, Tenants, Expenses, Properties']
];
const wsRules = XLSX.utils.aoa_to_sheet(rulesData);
XLSX.utils.book_append_sheet(wb, wsRules, '4_Calculation_Logic_&_Rules');

// Sheet 5: UI/UX Component Tree & State Flow
const uiData = [
  ['UI / UX Architecture, View Routes & State Management'],
  ['View / Component', 'Route / Tab', 'Key UI Capabilities', 'Modals / Drawers', 'Associated API Services'],
  ['Dashboard View', 'Home (/dashboard)', 'Monthly KPI cards, rent trend charts, pending tenant dues alerts, cash flow bar chart', 'None', 'GET /api/dashboard/summary, GET /api/ledger'],
  ['Contracts Master', 'Contracts & Leases', 'Excel table with customizable drag-resizable columns, rate revision history button, vacancy tracking', 'Create Contract Modal, Revise Rent Modal, Vacate Tenancy Modal, Rate Revision History Modal', 'GET/POST /api/assignments, POST /revise-rate, POST /vacate'],
  ['Tenant Master', 'Tenants', 'Excel table grid, optional direct lease contract creation checkbox, status badges, column manager', 'Create Tenant Modal (with sub-unit dropdown & lease checkbox), Edit Tenant Modal, Delete Confirm', 'GET/POST/DELETE /api/tenants, GET /api/properties, GET /api/units'],
  ['Property Master', 'Properties', 'Card/Grid view, single-unit auto-provisioning toggle, 3s lockout popup, partition counts', 'Add Property Modal, Single-Unit Guidance Modal, Edit Property Modal', 'GET/POST/PUT/DELETE /api/properties'],
  ['Partitions Master', 'Partitions (Units)', 'Individual room/godown unit tracking, square footage, occupancy status indicator', 'Add Unit Modal, Edit Unit Modal', 'GET/POST/PUT/DELETE /api/units'],
  ['Payments & Rent Register', 'Rent & Payments', 'Monthly Excel-style interactive grid, fast inline payment entry, cumulative outstanding totals', 'Add Payment Receipt Modal, Multi-Month Allocation Drawer, Receipt View Breakdown Modal', 'GET /api/payments/sheet, POST /api/payments/receipts'],
  ['Expenses View', 'Expenses', 'Monthly Excel-style grid, inline editable amount cells, sub-unit selection, on-the-fly category adder', 'Add Expense Voucher Modal, Create Expense Head Modal, Excel Export', 'GET/POST/PUT/DELETE /api/expenses, POST /categories'],
  ['Monthly Ledger View', 'Ledger & Book', 'Verified monthly carry-forward books, starting/closing balance, net margin %', 'Monthly Breakdown Drilldown Modal', 'GET /api/ledger, GET /api/ledger/:monthYear']
];
const wsUI = XLSX.utils.aoa_to_sheet(uiData);
XLSX.utils.book_append_sheet(wb, wsUI, '5_UI_UX_Architecture');

// Sheet 6: Deployment & Security Architecture
const secData = [
  ['Security, Deployment & Operational Specifications'],
  ['Security / Infrastructure Layer', 'Implementation Details', 'Configuration / Standard', 'Protection Scope'],
  ['HTTP & Network Security', 'Helmet security headers', 'Strict CSP, HSTS, X-Content-Type-Options: nosniff', 'Mitigates XSS, clickjacking, MIME sniffing'],
  ['CORS Policy', 'Whitelisted cross-origin resource sharing', 'Origin, methods (GET, POST, PUT, DELETE), headers (Authorization)', 'Cross-domain API isolation'],
  ['Brute-Force Rate Limiting', 'express-rate-limit middleware', '50 login attempts / 15 mins for /auth, 1000 requests / 15 mins for /api', 'Protects against password brute-force and DoS scraping'],
  ['NoSQL Injection Defense', 'Input sanitization regex middleware', 'Replaces $ and . in req.body and req.params', 'Prevents MongoDB query injection attacks'],
  ['Password Storage', 'Bcrypt.js with salt rounds = 10', 'One-way irreversible hashing, never logged or transmitted in plain text', 'Credential database compromise defense'],
  ['Authentication Protocol', 'JSON Web Tokens (JWT)', 'Signed with HS256 algorithm, 7-day expiration with Bearer token header', 'Stateless authorized API session'],
  ['Two-Factor Authentication', 'TOTP (Time-based One Time Password)', 'Speakeasy standard RFC 6238, Google Authenticator QR Code', 'Multi-factor authentication on sensitive user accounts'],
  ['Audit Logging', 'AuditLog collection', 'Stores userId, action, entity, IP address, user-agent, timestamp', 'Full enterprise compliance and traceability of all modifications']
];
const wsSec = XLSX.utils.aoa_to_sheet(secData);
XLSX.utils.book_append_sheet(wb, wsSec, '6_Security_&_Operations');

// Auto-adjust column widths for all sheets
[wsArch, wsSchema, wsApi, wsRules, wsUI, wsSec].forEach(ws => {
  ws['!cols'] = [
    { wch: 22 },
    { wch: 30 },
    { wch: 35 },
    { wch: 40 },
    { wch: 45 },
    { wch: 55 }
  ];
});

const fileName = 'Property_Rent_Management_System_Design.xlsx';
const filePath = path.join(__dirname, '..', fileName);
XLSX.writeFile(wb, filePath);
console.log('SUCCESS_CREATED:', filePath);
