---
name: property-app-development-guidelines
description: Consistent UI/UX and component guidelines for the Property Application. Used by Antigravity agents to generate forms, reports, and UI elements without redefining specifications each time.
---

# Property App Development Guidelines

These guidelines define a **single source of truth** for UI components, layout, and interaction patterns used throughout the *Property App* codebase. When creating new forms, reports, or pages, follow the specifications below so that Antigravity (or any AI‑assisted tooling) can automatically infer the required structure.

---
## 1. Directory Conventions
| Component Type | Primary Location | Example |
|---|---|---|
| **Views / Pages** | `client/src/views/` | `Dashboard.jsx`, `ExpensesView.jsx` |
| **Form Components** | `client/src/components/forms/` | `TenantForm.tsx` |
| **Report Components** | `client/src/components/reports/` | `MonthlyReport.tsx` |
| **Shared UI (buttons, tables, filters)** | `client/src/components/ui/` | `ActionButton.tsx`, `DataTable.tsx`, `FilterBar.tsx` |

All new components should live in the appropriate folder; create missing subfolders if needed.

---
## 2. Form Specification
| Property | Value | Notes |
|---|---|---|
| **File Extension** | `.tsx` (React + TypeScript) |
| **Base Component** | `FormWrapper` (extends `react-hook-form` utilities) |
| **Standard Props** | `onSubmit: (data) => void`<br>`initialValues?: Record<string, any>`<br>`validationSchema?: Yup.Schema` |
| **Action Buttons** | Always include **Save**, **Cancel**, and **Reset**. Use the shared `ActionButton` component with `variant="primary"` for Save and `variant="secondary"` for Cancel/Reset. |
| **Field Layout** | Use a 2‑column grid (`grid-cols-2` Tailwind class). Labels left‑aligned, inputs full‑width. |
| **Validation** | Display inline error messages under each field. Required fields must have `*` in the label. |
| **Submit Behaviour** | After successful submit, show a toast `"Saved successfully"` and navigate back to the parent view using `useNavigate()`.
| **Export / Download** | Forms do **not** include export buttons; export belongs to reports.

### Example Boilerplate
```tsx
import { FormWrapper } from "../ui/FormWrapper";
import { ActionButton } from "../ui/ActionButton";

export const TenantForm = ({ onSubmit, initialValues }: Props) => (
  <FormWrapper onSubmit={onSubmit} initialValues={initialValues}>
    {/* fields in a 2‑col grid */}
    <div className="grid grid-cols-2 gap-4">
      <label>Tenant Name *</label>
      <input name="name" />
      {/* ...more fields ... */}
    </div>
    <div className="mt-4 flex justify-end space-x-2">
      <ActionButton type="reset" variant="secondary">Reset</ActionButton>
      <ActionButton type="button" variant="secondary" onClick={() => navigate(-1)}>Cancel</ActionButton>
      <ActionButton type="submit" variant="primary">Save</ActionButton>
    </div>
  </FormWrapper>
);
``` 
---
## 3. Report Specification
| Property | Value | Notes |
|---|---|---|
| **File Extension** | `.tsx` |
| **Base Component** | `ReportWrapper` (provides header, filter bar, export button) |
| **Standard Props** | `data?: any[]`<br>`filters?: Record<string, any>` |
| **Header** | Title (`h2`) + optional subtitle. Use `ReportHeader` component. |
| **Filter Bar** | Always present unless explicitly disabled. Include common filters: Date range, Property, Tenant, Status. Use the shared `FilterBar` component. |
| **Action Buttons** | **Export to Excel**, **Print**, **Refresh**. Use `ActionButton` with `icon` prop (e.g., `icon="excel"`). |
| **Drill‑Down** | Rows that are clickable must open a detail view via `navigate('/detail/:id')`. Add a right‑arrow icon to indicate drill‑down. |
| **Table Layout** | Use `DataTable` component. Columns defined via a `columns` array; each column can specify `sortable`, `filterable`, and `render` (for custom cells). |
| **Export Implementation** | Export button calls `exportToExcel(data)` from `utils/export.ts`. The file name follows the pattern `"<ReportName>_<YYYYMMDD>.xlsx"`. |

### Example Boilerplate
```tsx
import { ReportWrapper } from "../ui/ReportWrapper";
import { DataTable } from "../ui/DataTable";
import { ActionButton } from "../ui/ActionButton";
import { exportToExcel } from "../../utils/export";

export const MonthlyExpenseReport = ({ data, filters }) => {
  const columns = [
    { header: "Date", accessor: "date", sortable: true },
    { header: "Category", accessor: "category", sortable: true },
    { header: "Amount", accessor: "amount", sortable: true, render: (v) => `$${v.toFixed(2)}` },
    { header: "", accessor: "id", render: (id) => (
      <ActionButton variant="link" onClick={() => navigate(`/expense/${id}`)} icon="arrow-right" />
    )},
  ];

  return (
    <ReportWrapper title="Monthly Expense Report" filters={filters}>
      <div className="flex justify-end mb-2">
        <ActionButton variant="primary" icon="excel" onClick={() => exportToExcel(data, "MonthlyExpenseReport")}>Export to Excel</ActionButton>
      </div>
      <DataTable columns={columns} data={data} />
    </ReportWrapper>
  );
};
```
---
## 4. Shared UI Components
### 4.1 `ActionButton`
*Props*: `variant` (`primary`, `secondary`, `link`), `icon?`, `type?`, `onClick`. 
Consistent styling lives in `src/components/ui/ActionButton.tsx`.

### 4.2 `FilterBar`
Accepts a `filters` object defining each filter field (`type`, `options`, `placeholder`). Automatically renders appropriate inputs (date picker, select, text). Emits `onChange(filters)`.

### 4.3 `DataTable`
Wraps `react-table`. Exposes `columns`, `data`, `onRowClick?`. Handles pagination (default 25 rows) and CSV/Excel export hooks.

### 4.4 `ReportHeader`
Shows title, optional subtitle, and a breadcrumb trail. Use `ReportHeader` for every report component.

---
## 5. Export to Excel
All reports must use the utility `exportToExcel(data: any[], filePrefix: string)` located at `client/src/utils/export.ts`. The function:
1. Converts the array of objects to a worksheet using `xlsx` library.
2. Applies a header style (bold, background `#f0f0f0`).
3. Saves the file via `file-saver` with the name `<filePrefix>_<YYYYMMDD>.xlsx`.
4. Shows a toast `"Exported <filePrefix>.xlsx"`.

---
## 6. Naming Conventions
* Files: `PascalCase` for components, ending with the type (e.g., `TenantForm.tsx`, `ExpenseReport.tsx`).
* Functions / hooks: `camelCase`.
* CSS/Tailwind classes: follow existing project patterns; avoid custom CSS unless necessary.
* Routes: `/entity/:id` for detail pages, `/entity/report` for reports.

---
## 7. Antigravity Integration
To make Antigravity understand these rules, place this file at the project root **or** reference it in a custom skill:
```json
{
  "type": "skill",
  "name": "property-app-guidelines",
  "manifest": "development_manual.md"
}
```
When you ask Antigravity to *create a new form* or *generate a report*, include the phrase **"follow the Property App Development Guidelines"**. Antigravity will read the markdown and apply the conventions automatically.

---
## 8. Checklist for New UI Work
1. Choose the correct folder (`forms`, `reports`, `views`).
2. Scaffold using the appropriate boilerplate (see sections 2 & 3).
3. Use shared UI components (`ActionButton`, `FilterBar`, `DataTable`).
4. Add an export button **only** for reports.
5. Verify routing matches the pattern.
6. Run `npm run lint && npm run test` – lint will flag any deviation from naming or missing imports.
7. Commit with a clear message, e.g., `feat: add MonthlyExpenseReport view`.

---
*Document version:* 1.0 – 2026‑10‑26
*Maintainer:* Akbar (Project Owner)
*Contact:* `akbar@example.com`


---
## 9. Monthly Collection Active Lease Filtering & Stability Rules
1. **Active Lease Contract Filtering**:
   - In monthly collection views (Rent & Payments screen), only tenants and contracts that have an **active lease contract strictly encompassing the target month** (`startDate <= monthEnd` AND `(!endDate || endDate >= monthStart)`) must be displayed.
   - Contracts that ended before `monthStart` or have not yet started (`startDate > monthEnd`) must NEVER appear for that month.
   - Units without an active contract covering the target month must display as **Vacant** (`status: 'Vacant'`, `tenant: null`, `contractNo: ''`, `monthlyRentExpected: 0`).
   - Under no circumstances should expired contracts from prior years or stray historical allocations fabricate collection rows for months after a contract has ended.
2. **Crash & Disconnect Prevention**:
   - Always guard `.toString()` and property dereferences against `null` / `undefined` (`String(val || '')`).
   - Hooks such as `useModalBackHandler` must be called only after all dependent `useState` variables are declared to avoid Temporal Dead Zone `ReferenceError` crashes.
3. **Payment Receipt 'Add Month' & Multi-Month Settlement Flexibility**:
   - The payment recording modal is titled **Add Month** (and **Edit Month** when editing existing records).
   - In "Due Months to Settle", tenants can pay for past due months, the current month, or future advance months (via the inline "Add Advance Month" picker).
   - The system takes and records the amount paid for the active accounting month irrespective of whether the due month settled matches the accounting month. Both the collection sheet's "Amount Paid" column and total earning footers properly display payments collected during that accounting month.
