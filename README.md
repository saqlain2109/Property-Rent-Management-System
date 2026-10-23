# Property Management — Production Property & Rent Management System

Property Management is a full-stack, enterprise-grade Property and Rent Management platform built with **React (Vite), Tailwind CSS, GSAP, Node.js (Express), and MongoDB**. It completely replaces manual Excel spreadsheets (`Rent Details Actual`, `Jan 26.xlsx`, `Feb 26.xlsx`, `Mar 26.xlsx`) with an automated, audited system.

---

## 🚀 Key Features

1. **Dashboard & KPIs**: Real-time calculated figures directly from MongoDB:
   - 11 Properties, 22 Sub-Properties/Units, 21 Active Tenants, and 1 Vacant unit.
   - Live rent collected, expenses, and pending balances by month/year filter.
   - Interactive Cash Flow bar charts (Recharts) and Recent Receipts/Expense tables.
2. **Property & Unit Master**:
   - Hierarchical property management supporting 11 properties and 22 sub-properties (e.g. `Kotak Godaown (66 Godown)` -> `KO-PG`, `KO-SMALL`).
   - Order-based arrangement (1 to 11) matching the master Excel sheets.
   - Occupancy tracking (Occupied, Vacant, Maintenance) and space type classifications.
3. **Tenant Master & Occupancy History**:
   - Complete tenant profiles with contact info and lease agreements.
   - Seamless vacating workflow and historical preservation when tenants change.
4. **Effective-Dated Rent Agreement History**:
   - Rent revisions preserve exact historical effective dates (`effectiveFrom` / `effectiveTo`).
   - Previous months are never overwritten; calculations use the rent rate applicable to each specific month.
   - Kotak PG rate calibrated to ₹81,050 settled collection rate.
5. **Multi-Month Rent Payments & Allocations**:
   - Decoupled receipt date from allocated rent months (e.g. January payment covering September rent).
   - Partial payments, advance payments, and multi-month split receipts.
   - Audited reversal mechanism with reason tracking.
6. **Paid-Till & Outstanding Status**:
   - Automatically determines current paid-till month, next unpaid month, and total pending balance.
   - Historical Clearance Rule: Any tenant marked "Paid till [Month]" has all previous months marked Fully Paid with ₹0 overdue.
   - Interactive month-by-month financial ledger breakdown for every tenant.
7. **Variable Rent & PG Management**:
   - Dedicated PG settlement ledger for gross collections and operator share deductions (Altaf, Anand, Bisleri water).
   - Calculates owner's net take-home and flags discrepancies.
8. **Property Expenses & Ledger**:
   - Category-wise expense tracking (Maintenance, Repairs, Electricity Meters, Ground Rent, Deposit Refunds).
   - Audited expense reversals and category management.
9. **Monthly Accounting Ledger**:
   - Strict equation: $\text{Opening Balance} + \text{Actual Income} - \text{Actual Expenses} = \text{Closing Balance}$.
   - Verified against source Excel files (Jan Closing: ₹6,135,568.74, Feb Closing: ₹6,510,768.74).
10. **Smart Assistant Chatbot (No Paid API Required)**:
    - Rule-based NLP assistant querying MongoDB aggregations in real-time.
    - Handles questions on pending rent, recent payments, monthly collections, occupancy, and expenses.
11. **Reports & Excel Export**:
    - One-click generation of complete multi-sheet Excel workbooks (`.xlsx`) directly in the browser.
    - Apex-style toolbar with column customization, localStorage persistence, and 3-state sorting.
12. **Auditing & Enterprise Security**:
    - JWT token authentication with bcrypt password hashing.
    - Rate-limiting on authentication routes.
    - Comprehensive audit logs (`AuditLog`) for all sensitive operations.

---

## 🛠️ Architecture & Tech Stack

- **Frontend**: React 19 + Vite, Tailwind CSS v3, GSAP animations, Lucide React icons, Recharts
- **Backend**: Node.js + Express
- **Database**: MongoDB (Mongoose ODM)
- **Authentication**: JWT Bearer Tokens with Role-Based Access Control (`admin`, `manager`, `viewer`)
- **Validation**: `express-validator` and MongoDB schema constraints
- **Excel Handling**: `xlsx` (SheetJS)

---

## 📦 Local Installation & Setup

### Prerequisites
- Node.js (v18+)
- MongoDB running locally on port 27017 or a MongoDB Atlas URI

### 1. Clone & Install Dependencies

```bash
# Server dependencies
cd server
npm install

# Client dependencies
cd ../client
npm install
```

### 2. Configure Environment Variables

**Server (`server/.env`):**
```env
PORT=5000
MONGODB_URI=mongodb://127.0.0.1:27017/property_rent_db
JWT_SECRET=super_secret_jwt_key_property_rent_2026_xyz!@#
JWT_EXPIRE=7d
NODE_ENV=development
```

**Client (`client/.env`):**
```env
VITE_API_URL=http://localhost:5000/api
```

### 3. Initialize Database & Run Excel Migration

Run the migration seeder script from the `server` directory:
```bash
cd server
npm run seed   # or node seed.js
```
This automatically:
1. Creates the administrator account (`admin` or `admin@propertyrent.com` / `AdminPassword123!`).
2. Syncs the 11 properties (Order 1 to 11), 22 sub-properties, 21 active contracts, correct rates (Kotak PG: ₹81,050), "Paid Till" status across all units, 31 payment receipts (Jan, Feb, Mar 2026), and monthly financial ledger from the 5 Excel workbooks.
3. Ingests the 12-month historical statements (2024-03 to 2025-02) for the Month wise Report matrix (153 receipts, 50 expenses, ₹91,41,574 grand total) and reconciles monthly rolling ledgers.

### 4. Run Automated Backend Tests

```bash
cd server
node test_runner.js
```
All 10 test suites verify health, login, CRUD, live dashboard calculations, monthly ledger reconciliations, PG settlements, and chatbot queries.

### 5. Start Application

In terminal 1 (Backend):
```bash
cd server
npm start # or node index.js
```

In terminal 2 (Frontend):
```bash
cd client
npm run dev
```

Visit `http://localhost:5173` in your browser.

---

## 🌐 Production Deployment Guide

### Frontend Deployment (Vercel)
1. Push the repository to GitHub.
2. In Vercel, import the repository and set the **Root Directory** to `client`.
3. Set the Environment Variable:
   - `VITE_API_URL`: Your deployed Render backend URL (e.g. `https://property-rent-backend.onrender.com/api`).
4. Deploy!

### Backend Deployment (Render)
1. In Render, create a new **Web Service**.
2. Connect your GitHub repository and set the **Root Directory** to `server`.
3. Set Build Command: `npm install`
4. Set Start Command: `node index.js`
5. Configure Environment Variables:
   - `MONGODB_URI`: Your MongoDB Atlas connection string (`mongodb+srv://...`).
   - `JWT_SECRET`: A strong secret key.
   - `NODE_ENV`: `production`
6. Run database seed (in Render Shell or as a post-deploy step):
   ```bash
   npm run seed
   ```

### Database (MongoDB Atlas)
1. Create a free shared cluster (M0 Sandbox) on MongoDB Atlas.
2. Under Network Access, allow IP `0.0.0.0/0` (or Render's outbound IPs).
3. Under Database Access, create a database user and paste the connection string into Render's `MONGODB_URI`.
4. Run `npm run seed` to seed the database with the exact 11 properties, 22 units, 21 contracts, and receipts.

---

## ⚠️ Known Limitations & Migration Review Notes

- **Free-Tier Spin-down**: Render free instances spin down after inactivity; initial requests may take 30–50 seconds to warm up.
- **Historical Ambiguities Flagged**:
  - *Mahendra Bhai (65 No Godown)*: Marked vacant in current operations per source notes ("Empty").
  - *Amri Kids (Byculla)*: Configured as ₹88,000 monthly rent with ₹40,000 cheque and ₹48,000 cash breakdown.
  - *Mar 2026 Zakat / Charity*: Historical source notes contained personal charitable payments (₹810,000 and ₹1,900,000). These are preserved in the historical difference reconciliation under flagged miscellaneous records.
