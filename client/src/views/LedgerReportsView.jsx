import React, { useState, useEffect } from 'react';
import PropertyMonthlyMatrixReport from './PropertyMonthlyMatrixReport';
import PropertyAccountSummaryReport from './PropertyAccountSummaryReport';
import LedgerView from './LedgerView';
import ReportsView from './ReportsView';
import { 
  Building2, BookOpen, Download, FileSpreadsheet, 
  ChevronDown, Layers, CheckCircle2 
} from 'lucide-react';

const REPORT_OPTIONS = [
  { 
    id: 'property_matrix', 
    sidebarId: 'reports_matrix',
    label: 'Property Monthly Matrix (Sheet 1)', 
    shortLabel: 'Sheet 1 Master Matrix',
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
    label: 'Portfolio Workbook (Excel Export)', 
    shortLabel: 'Portfolio Export',
    icon: Download, 
    badge: 'Full Backup',
    desc: 'Export all properties, units, tenants, receipts, expenses, and ledger into an Excel workbook' 
  },
];

export default function LedgerReportsView({ activeReportId, onSelectReport }) {
  // Map sidebar IDs ('reports_matrix', etc.) to internal IDs ('property_matrix', etc.)
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
    <div className="space-y-6">
      {/* Top Header Card with Dropdown Switcher */}
      <div className="bg-white p-5 sm:p-6 rounded-3xl shadow-sm border border-slate-200">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center text-white shadow-md shadow-emerald-500/20 shrink-0 mt-0.5 sm:mt-0">
              <CurrentIcon className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Reports Section</span>
                <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                  {currentReport.badge}
                </span>
              </div>
              <h2 className="text-xl font-black text-slate-900 tracking-tight">{currentReport.label}</h2>
              <p className="text-xs font-medium text-slate-500 mt-0.5 max-w-2xl">
                {currentReport.desc}
              </p>
            </div>
          </div>

          {/* Report View Switcher Dropdown */}
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="w-full sm:w-auto flex items-center justify-between gap-3 px-4 py-2.5 rounded-2xl border-2 border-emerald-500/30 bg-emerald-50/50 hover:bg-emerald-50 text-slate-900 font-extrabold text-xs transition-all shadow-xs cursor-pointer"
            >
              <div className="flex items-center gap-2 text-left">
                <CurrentIcon className="w-4 h-4 text-emerald-600 shrink-0" />
                <div>
                  <p className="text-[10px] text-emerald-700 font-bold uppercase leading-none">Switch Report View</p>
                  <p className="text-xs font-extrabold text-slate-900 leading-tight mt-0.5">{currentReport.shortLabel}</p>
                </div>
              </div>
              <ChevronDown className={`w-4 h-4 text-emerald-600 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {/* Dropdown Menu */}
            {dropdownOpen && (
              <>
                <div 
                  className="fixed inset-0 z-30" 
                  onClick={() => setDropdownOpen(false)}
                />
                <div className="absolute right-0 mt-2 w-80 bg-white rounded-3xl shadow-2xl border border-slate-200 p-2 z-40 animate-in fade-in zoom-in-95 duration-100">
                  <div className="px-3 py-2 border-b border-slate-100 mb-1">
                    <p className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Available Reports</p>
                  </div>
                  <div className="space-y-1">
                    {REPORT_OPTIONS.map((item) => {
                      const Icon = item.icon;
                      const isSelected = item.id === activeTab;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => handleSelectTab(item.id)}
                          className={`w-full flex items-start gap-3 p-2.5 rounded-2xl text-left transition-all ${
                            isSelected
                              ? 'bg-emerald-50 text-emerald-950 font-bold'
                              : 'text-slate-700 hover:bg-slate-50 font-medium'
                          }`}
                        >
                          <div className={`p-2 rounded-xl mt-0.5 shrink-0 ${
                            isSelected ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-500'
                          }`}>
                            <Icon className="w-4 h-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <p className="text-xs font-extrabold truncate">{item.label}</p>
                              {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 ml-1" />}
                            </div>
                            <p className="text-[10px] text-slate-500 line-clamp-1 mt-0.5">{item.desc}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Render Active Report */}
      <div>
        {activeTab === 'property_matrix' && <PropertyMonthlyMatrixReport />}
        {activeTab === 'property_summary' && <PropertyAccountSummaryReport />}
        {activeTab === 'ledger' && <LedgerView />}
        {activeTab === 'export' && <ReportsView />}
      </div>
    </div>
  );
}
