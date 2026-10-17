import React, { useState, useEffect } from 'react';
import API from '../services/api';
import { formatCurrency, formatMonthYear } from '../utils/formatters';
import {
  FileSpreadsheet, Download, ChevronLeft, ChevronRight, Calendar,
  TrendingUp, TrendingDown, DollarSign, AlertCircle, CheckCircle2,
  Building2, Layers, Users, RefreshCw
} from 'lucide-react';

export default function MonthlyExcelReportView() {
  const getCurrentMonth = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  };

  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  const fetchReport = async (month) => {
    try {
      setLoading(true);
      const res = await API.get(`/reports/monthly-unified-report?month=${month}`);
      if (res.data.success) {
        setData(res.data);
      }
    } catch (err) {
      console.error('Failed to fetch monthly report:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport(selectedMonth);
  }, [selectedMonth]);

  const changeMonth = (delta) => {
    const [y, m] = selectedMonth.split('-').map(Number);
    const date = new Date(y, m - 1 + delta, 1);
    const newMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    setSelectedMonth(newMonth);
  };

  const handleDownloadExcel = async () => {
    try {
      setDownloading(true);
      const res = await API.get(`/reports/export-monthly-excel?month=${selectedMonth}`, {
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Monthly_Statement_${selectedMonth}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      alert('Failed to download Excel report.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Controller Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 sm:p-6 rounded-2xl shadow-sm border border-slate-200">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-slate-900 text-lg">
                Monthly Statement · {formatMonthYear(selectedMonth)}
              </h3>
              <p className="text-xs text-slate-500">
                Single unified statement: Rent income first, expenses below, net difference & cumulative balance
              </p>
            </div>
          </div>
        </div>

        {/* Controls: Month Switcher & Excel Download */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center bg-slate-100 p-1 rounded-xl">
            <button
              onClick={() => changeMonth(-1)}
              className="p-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-white transition-colors"
              title="Previous Month"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="bg-transparent text-xs font-bold text-slate-800 px-2.5 py-1 focus:outline-none cursor-pointer"
            />
            <button
              onClick={() => changeMonth(1)}
              className="p-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-white transition-colors"
              title="Next Month"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <button
            onClick={() => fetchReport(selectedMonth)}
            className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors"
            title="Refresh Report Data"
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          <button
            onClick={handleDownloadExcel}
            disabled={downloading}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-md shadow-emerald-600/20 active:scale-95 disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            <span>{downloading ? 'Exporting...' : 'Export Excel (.xlsx)'}</span>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 bg-white rounded-2xl border border-slate-200">
          <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : !data ? (
        <div className="py-20 text-center text-slate-400 bg-white rounded-2xl border border-slate-200">
          Failed to load statement for {selectedMonth}.
        </div>
      ) : (
        <div className="space-y-6">
          {/* SECTION 1: Rent Income Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-slate-200 bg-emerald-50/40 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-600" />
                <h4 className="font-extrabold text-slate-900 text-sm tracking-wide uppercase">
                  1. Rent Income Statement
                </h4>
              </div>
              <span className="text-xs font-bold text-emerald-800 bg-emerald-100/80 px-2.5 py-1 rounded-full">
                {data.rentEntries?.length || 0} Rent Entries
              </span>
            </div>

            {(!data.rentEntries || data.rentEntries.length === 0) ? (
              <div className="py-10 text-center text-slate-400 text-xs italic">
                No rent income entries recorded for {formatMonthYear(selectedMonth)}.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[11px]">
                    <tr>
                      <th className="py-3 px-4">Tenant</th>
                      <th className="py-3 px-4">Property</th>
                      <th className="py-3 px-4">Unit / Partition</th>
                      <th className="py-3 px-4 text-right">Amount (₹)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.rentEntries.map((r, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-3 px-4 font-bold text-slate-900">{r.tenant}</td>
                        <td className="py-3 px-4 text-slate-700 font-medium">{r.property}</td>
                        <td className="py-3 px-4 text-slate-500">{r.unit}</td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-emerald-700 text-sm">
                          {formatCurrency(r.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-emerald-50/60 border-t-2 border-emerald-200 font-bold">
                    <tr>
                      <td colSpan={3} className="py-3.5 px-4 text-emerald-950 font-extrabold text-sm uppercase">
                        Total Rent Income
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-base font-black text-emerald-700">
                        {formatCurrency(data.totalRentIncome || 0)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          {/* SECTION 2: Expenses Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-slate-200 bg-rose-50/40 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingDown className="w-4 h-4 text-rose-600" />
                <h4 className="font-extrabold text-slate-900 text-sm tracking-wide uppercase">
                  2. Expenses Statement
                </h4>
              </div>
              <span className="text-xs font-bold text-rose-800 bg-rose-100/80 px-2.5 py-1 rounded-full">
                {data.expenseEntries?.length || 0} Expenses
              </span>
            </div>

            {(!data.expenseEntries || data.expenseEntries.length === 0) ? (
              <div className="py-10 text-center text-slate-400 text-xs italic">
                No expenses recorded for {formatMonthYear(selectedMonth)}.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[11px]">
                    <tr>
                      <th className="py-3 px-4">Category</th>
                      <th className="py-3 px-4">Description / Payee</th>
                      <th className="py-3 px-4">Property</th>
                      <th className="py-3 px-4 text-right">Amount (₹)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.expenseEntries.map((e, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-3 px-4">
                          <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-100 text-slate-700">
                            {e.category}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-800">
                          <span className="font-medium">{e.description}</span>
                          {e.payee && (
                            <span className="text-slate-400 text-[11px] block">{e.payee}</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-slate-600 font-medium">{e.property}</td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-rose-600 text-sm">
                          {formatCurrency(e.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-rose-50/60 border-t-2 border-rose-200 font-bold">
                    <tr>
                      <td colSpan={3} className="py-3.5 px-4 text-rose-950 font-extrabold text-sm uppercase">
                        Total Expenses
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-base font-black text-rose-700">
                        {formatCurrency(data.totalExpenses || 0)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          {/* SECTION 3: Reconciliation & Financial Summary */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
            <h4 className="font-extrabold text-slate-900 text-sm tracking-wide uppercase border-b border-slate-200 pb-3 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-teal-600" />
              <span>3. Financial Reconciliation & Balances</span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Total Income */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-xs font-semibold text-slate-500 block">Total Rent Income</span>
                <span className="text-xl font-extrabold text-emerald-700 mt-1 block">
                  {formatCurrency(data.totalRentIncome || 0)}
                </span>
                <span className="text-[10px] text-slate-400">Received for {formatMonthYear(selectedMonth)}</span>
              </div>

              {/* Total Expenses */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-xs font-semibold text-slate-500 block">Total Expenses Paid</span>
                <span className="text-xl font-extrabold text-rose-700 mt-1 block">
                  {formatCurrency(data.totalExpenses || 0)}
                </span>
                <span className="text-[10px] text-slate-400">All costs paid in month</span>
              </div>

              {/* Month Difference */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-xs font-semibold text-slate-500 block">Month Net Difference</span>
                <span className={`text-xl font-extrabold mt-1 block ${data.netDifference >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                  {data.netDifference >= 0 ? '+' : ''}{formatCurrency(data.netDifference || 0)}
                </span>
                <span className="text-[10px] text-slate-400">Income minus expenses</span>
              </div>

              {/* Opening Balance */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-xs font-semibold text-slate-500 block">Previous Month Opening Balance</span>
                <span className="text-xl font-extrabold text-slate-800 mt-1 block">
                  {formatCurrency(data.openingBalance || 0)}
                </span>
                <span className="text-[10px] text-slate-400">Balance forward from prior month</span>
              </div>

              {/* Cumulative Closing Balance */}
              <div className="p-4 rounded-xl bg-teal-50/70 border border-teal-200">
                <span className="text-xs font-bold text-teal-900 block">Cumulative Closing Balance</span>
                <span className="text-xl font-black text-teal-800 mt-1 block">
                  {formatCurrency(data.closingBalance || 0)}
                </span>
                <span className="text-[10px] text-teal-700 font-medium">Opening balance + net difference</span>
              </div>

              {/* Outstanding Rent */}
              <div className="p-4 rounded-xl bg-amber-50/70 border border-amber-200">
                <span className="text-xs font-bold text-amber-900 block">Month Outstanding Rent</span>
                <span className={`text-xl font-black mt-1 block ${data.monthOutstandingRent > 0 ? 'text-amber-800' : 'text-emerald-700'}`}>
                  {formatCurrency(data.monthOutstandingRent || 0)}
                </span>
                <span className="text-[10px] text-amber-700">Expected rent due but unpaid this month</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
