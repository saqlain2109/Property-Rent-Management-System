import React, { useState } from 'react';
import MonthlyExcelReportView from './MonthlyExcelReportView';
import LedgerView from './LedgerView';
import ReportsView from './ReportsView';
import { BookOpen, Download, FileSpreadsheet } from 'lucide-react';

const TABS = [
  { id: 'monthly_statement', label: 'Monthly Statement (Excel Style)', icon: FileSpreadsheet, desc: 'Single report: Rent income first, expenses below, difference, cumulative balance & outstanding dues' },
  { id: 'ledger', label: 'Account Book', icon: BookOpen, desc: 'Month-by-month income, expenses, and rolling balance ledger' },
  { id: 'export', label: 'Portfolio Workbook', icon: Download, desc: 'Export all properties, units, tenants, receipts, expenses, and ledger into an Excel file' },
];

export default function LedgerReportsView() {
  const [activeTab, setActiveTab] = useState('monthly_statement');

  const currentTab = TABS.find(t => t.id === activeTab);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="bg-white p-5 sm:p-6 rounded-2xl shadow-sm border border-slate-200">
        <h2 className="text-xl font-extrabold text-slate-900">Reports & Financial Statements</h2>
        <p className="text-sm text-slate-500 mt-0.5">
          {currentTab?.desc || 'View financial statements, monthly account book, and Excel workbooks'}
        </p>

        {/* Tab Pills */}
        <div className="flex flex-wrap items-center gap-2 mt-4">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                activeTab === id
                  ? 'bg-teal-600 text-white shadow-md shadow-teal-600/20'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === 'monthly_statement' && <MonthlyExcelReportView />}
        {activeTab === 'ledger' && <LedgerView />}
        {activeTab === 'export' && <ReportsView />}
      </div>
    </div>
  );
}
