import React, { useState, useEffect } from 'react';
import PropertyMonthlyMatrixReport from './PropertyMonthlyMatrixReport';
import MonthWiseReportView from './MonthWiseReportView';
import RentReportView from './RentReportView';
import LeaseContractReportView from './LeaseContractReportView';
import AllIncomeReportView from './AllIncomeReportView';
import AllExpenseReportView from './AllExpenseReportView';
import LedgerView from './LedgerView';
import ReportsView from './ReportsView';
import { 
  Building2, BookOpen, Download, FileSpreadsheet, 
  ChevronDown, Layers, CheckCircle2, Table, TrendingUp, TrendingDown, FileText
} from 'lucide-react';

const REPORT_OPTIONS = [
  { 
    id: 'month_wise', 
    sidebarId: 'reports_month_wise',
    label: 'Month wise Report', 
    shortLabel: 'Month wise Report',
    icon: Table, 
    desc: 'Property-wise earnings matrix based on accounting month, with monthly columns, drilldown edit, batch entries, and Excel export' 
  },
  { 
    id: 'rent_report', 
    sidebarId: 'reports_rent',
    label: 'Rent report', 
    shortLabel: 'Rent report',
    icon: Table, 
    badge: 'Month Paid For',
    desc: 'Property-wise rent matrix based on month paid for, with monthly columns, drilldown edit, and Excel export' 
  },
  { 
    id: 'lease_contract', 
    sidebarId: 'reports_lease_contract',
    label: 'Lease Contract Report', 
    shortLabel: 'Lease Contract Report',
    icon: FileText, 
    badge: 'Contracts Timeline',
    desc: 'Property & partition contracted monthly rent timeline matrix with graphical line format and vacancy visualization' 
  },
  { 
    id: 'all_income', 
    sidebarId: 'reports_all_income',
    label: 'All Income', 
    shortLabel: 'All Income',
    icon: TrendingUp, 
    desc: 'Full register of all rent income receipts, occupancy statuses, and transactions' 
  },
  { 
    id: 'all_expense', 
    sidebarId: 'reports_all_expense',
    label: 'All Expense', 
    shortLabel: 'All Expense',
    icon: TrendingDown, 
    desc: 'Full register of all property and common expenses, categories, and vendors' 
  },
  { 
    id: 'property_matrix', 
    sidebarId: 'reports_matrix',
    label: 'Property Monthly Matrix', 
    shortLabel: 'Property Monthly Matrix',
    icon: FileSpreadsheet, 
    badge: 'Master Sheet 1',
    desc: 'Spreadsheet-style full year matrix: Rent Income, Property & Other Expenses, and Balance Reconciliation' 
  },
  { 
    id: 'ledger', 
    sidebarId: 'reports_ledger',
    label: 'Account Book (Ledger)', 
    shortLabel: 'Account Book',
    icon: BookOpen, 
    badge: 'Monthly Cashflow',
    desc: 'Month-by-month income, expenses, and rolling balance ledger' 
  },
  { 
    id: 'export', 
    sidebarId: 'reports_export',
    label: 'Portfolio Workbook (Excel)', 
    shortLabel: 'Portfolio Workbook',
    icon: Download, 
    badge: 'Full Backup',
    desc: 'Export all properties, units, tenants, receipts, expenses, and ledger into an Excel workbook' 
  },
];

export default function LedgerReportsView({ activeReportId, onSelectReport }) {
  // Map sidebar IDs ('reports_month_wise', 'reports_matrix', etc.) to internal IDs ('month_wise', 'property_matrix', etc.)
  const resolveInitialTab = () => {
    if (activeReportId) {
      const match = REPORT_OPTIONS.find(r => r.sidebarId === activeReportId || r.id === activeReportId);
      if (match) return match.id;
    }
    const saved = localStorage.getItem('property_active_report_tab');
    if (saved && REPORT_OPTIONS.some(r => r.id === saved)) {
      return saved;
    }
    return 'property_matrix'; // Default to user's desired Sheet 1 report
  };

  const [activeTab, setActiveTab] = useState(resolveInitialTab);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // Sync when activeReportId prop changes from Sidebar
  useEffect(() => {
    if (activeReportId) {
      const match = REPORT_OPTIONS.find(r => r.sidebarId === activeReportId || r.id === activeReportId);
      if (match && match.id !== activeTab) {
        setActiveTab(match.id);
      }
    }
  }, [activeReportId]);

  // Persist activeTab
  useEffect(() => {
    localStorage.setItem('property_active_report_tab', activeTab);
  }, [activeTab]);

  const handleSelectTab = (tabId) => {
    setActiveTab(tabId);
    setDropdownOpen(false);
    const opt = REPORT_OPTIONS.find(r => r.id === tabId);
    if (opt && onSelectReport) {
      onSelectReport(opt.sidebarId);
    }
  };

  const currentReport = REPORT_OPTIONS.find(t => t.id === activeTab) || REPORT_OPTIONS[0];
  const CurrentIcon = currentReport.icon;

  return (
    <div className="space-y-2.5">
      {/* Render Active Report */}
      <div>
        {activeTab === 'month_wise' && <MonthWiseReportView />}
        {activeTab === 'rent_report' && <RentReportView />}
        {activeTab === 'lease_contract' && <LeaseContractReportView />}
        {activeTab === 'all_income' && <AllIncomeReportView />}
        {activeTab === 'all_expense' && <AllExpenseReportView />}
        {activeTab === 'property_matrix' && <PropertyMonthlyMatrixReport />}
        {activeTab === 'ledger' && <LedgerView />}
        {activeTab === 'export' && <ReportsView />}
      </div>
    </div>
  );
}
