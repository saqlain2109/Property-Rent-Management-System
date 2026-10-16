import React, { useState } from 'react';
import API from '../services/api';
import { FileSpreadsheet, Download, Filter, CheckCircle2 } from 'lucide-react';

export default function ReportsView() {
  const [downloading, setDownloading] = useState(false);

  const handleExportExcel = async () => {
    try {
      setDownloading(true);
      const response = await API.get('/reports/export-excel', {
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'Property_Rent_Management_Export.xlsx');
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      alert('Failed to export Excel report');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-200/80">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Reports & Excel Export</h2>
          <p className="text-sm text-slate-500">Download formatted workbooks and generate portfolio statements</p>
        </div>
        <button
          onClick={handleExportExcel}
          disabled={downloading}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-sm font-semibold transition-colors shadow-md shadow-emerald-600/20 disabled:opacity-50"
        >
          <Download className="w-4 h-4" />
          <span>{downloading ? 'Generating Workbook...' : 'Export Complete Workbook (.xlsx)'}</span>
        </button>
      </div>

      {/* Report Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
            <FileSpreadsheet className="w-5 h-5" />
          </div>
          <h3 className="font-bold text-slate-800 text-base">Properties & Units Master</h3>
          <p className="text-xs text-slate-500">
            Export all real estate properties, partitioned units, occupancy rates, and current tenant allocations.
          </p>
          <div className="pt-2 text-xs text-emerald-600 font-semibold flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" /> Included in exported workbook
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-3">
          <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center">
            <FileSpreadsheet className="w-5 h-5" />
          </div>
          <h3 className="font-bold text-slate-800 text-base">Tenant Outstanding Ledger</h3>
          <p className="text-xs text-slate-500">
            Detailed statement of paid-till months, next unpaid months, expected versus received rent, and pending balances.
          </p>
          <div className="pt-2 text-xs text-emerald-600 font-semibold flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" /> Included in exported workbook
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-3">
          <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center">
            <FileSpreadsheet className="w-5 h-5" />
          </div>
          <h3 className="font-bold text-slate-800 text-base">Payment Receipts & Expenses</h3>
          <p className="text-xs text-slate-500">
            Audit trail of every cash, cheque, and bank transaction, with month-by-month allocations and operational expenses.
          </p>
          <div className="pt-2 text-xs text-emerald-600 font-semibold flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" /> Included in exported workbook
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-3">
          <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center">
            <FileSpreadsheet className="w-5 h-5" />
          </div>
          <h3 className="font-bold text-slate-800 text-base">Monthly Account Book</h3>
          <p className="text-xs text-slate-500">
            Consecutive starting balance, live rent received, live expenses paid, net cash flow, and closing balance.
          </p>
          <div className="pt-2 text-xs text-emerald-600 font-semibold flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" /> Included in exported workbook
          </div>
        </div>
      </div>
    </div>
  );
}
