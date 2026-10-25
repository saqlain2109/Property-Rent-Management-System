import React, { useState, useEffect, useMemo } from 'react';
import API from '../services/api';
import { formatCurrency, formatMonthYear } from '../utils/formatters';
import MonthlyBatchEntryModal from '../components/MonthlyBatchEntryModal';
import {
  FileSpreadsheet, Download, ChevronLeft, ChevronRight, Calendar,
  TrendingUp, TrendingDown, DollarSign, AlertCircle, CheckCircle2,
  Building2, Layers, Users, RefreshCw, Sparkles, Filter, X
} from 'lucide-react';
import { useResizableColumns, ColumnHeaderCell, useTableAutoWrap } from '../components/ColumnManager';
import { cycleThreeStateSort } from '../utils/tableUtils';

const PRESET_MONTHS = [
  '2024-03', '2024-04', '2024-05', '2024-06',
  '2024-07', '2024-08', '2024-09', '2024-10',
  '2024-11', '2024-12', '2025-01', '2025-02',
  '2025-03', '2026-01', '2026-02', '2026-03'
];

export default function MonthlyExcelReportView() {
  const [selectedMonth, setSelectedMonth] = useState('2024-03');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);

  // Resizable columns
  const rentColDefaults = useMemo(() => ({ tenant: 200, property: 200, unit: 160, amount: 140 }), []);
  const expColDefaults = useMemo(() => ({ category: 180, description: 240, property: 200, amount: 140 }), []);

  const {
    columnWidths: rentWidths,
    handleResizeStart: handleRentResizeStart,
    resetColumnWidths: resetRentWidths
  } = useResizableColumns('monthly_excel_rent_widths_v2', rentColDefaults);

  const {
    columnWidths: expWidths,
    handleResizeStart: handleExpResizeStart,
    resetColumnWidths: resetExpWidths
  } = useResizableColumns('monthly_excel_exp_widths_v2', expColDefaults);

  const { autoWrap } = useTableAutoWrap();

  // Rent Sort & Filters
  const [rentSort, setRentSort] = useState({ key: null, direction: null });
  const [rentFilters, setRentFilters] = useState({});

  // Exp Sort & Filters
  const [expSort, setExpSort] = useState({ key: null, direction: null });
  const [expFilters, setExpFilters] = useState({});

  const handleRentSort = (colId) => setRentSort(prev => cycleThreeStateSort(prev, colId));
  const handleExpSort = (colId) => setExpSort(prev => cycleThreeStateSort(prev, colId));

  const filteredRentEntries = useMemo(() => {
    if (!data?.rentEntries) return [];
    let list = [...data.rentEntries];
    for (const [col, val] of Object.entries(rentFilters)) {
      if (!val) continue;
      const q = (typeof val === 'object' ? val.value : String(val)).toLowerCase();
      list = list.filter(r => String(r[col] || '').toLowerCase().includes(q));
    }
    if (rentSort.key && rentSort.direction) {
      const mult = rentSort.direction === 'asc' ? 1 : -1;
      list.sort((a, b) => {
        if (rentSort.key === 'amount') return mult * ((a.amount || 0) - (b.amount || 0));
        return mult * String(a[rentSort.key] || '').localeCompare(String(b[rentSort.key] || ''));
      });
    }
    return list;
  }, [data, rentFilters, rentSort]);

  const filteredExpenseEntries = useMemo(() => {
    if (!data?.expenseEntries) return [];
    let list = [...data.expenseEntries];
    for (const [col, val] of Object.entries(expFilters)) {
      if (!val) continue;
      const q = (typeof val === 'object' ? val.value : String(val)).toLowerCase();
      list = list.filter(e => String(e[col] || '').toLowerCase().includes(q));
    }
    if (expSort.key && expSort.direction) {
      const mult = expSort.direction === 'asc' ? 1 : -1;
      list.sort((a, b) => {
        if (expSort.key === 'amount') return mult * ((a.amount || 0) - (b.amount || 0));
        return mult * String(a[expSort.key] || '').localeCompare(String(b[expSort.key] || ''));
      });
    }
    return list;
  }, [data, expFilters, expSort]);

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
            </div>
          </div>
        </div>

        {/* Controls: Month Switcher & Excel Download */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Quick Month Dropdown */}
          <div className="flex items-center gap-1.5 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200 text-xs">
            <Calendar className="w-4 h-4 text-slate-500" />
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="bg-transparent font-bold text-slate-800 focus:outline-none cursor-pointer"
            >
              {PRESET_MONTHS.map(m => (
                <option key={m} value={m}>
                  {formatMonthYear(m)} ({m})
                </option>
              ))}
            </select>
          </div>

          {/* Stepper Month Picker */}
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
              className="bg-transparent text-xs font-bold text-slate-800 px-2 py-1 focus:outline-none cursor-pointer"
            />
            <button
              onClick={() => changeMonth(1)}
              className="p-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-white transition-colors"
              title="Next Month"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Enter / Edit Month Data Button */}
          <button
            onClick={() => setIsBatchModalOpen(true)}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold transition-all shadow-md shadow-teal-600/20 active:scale-95"
            title="Enter or edit rent and expenses for this month"
          >
            <Sparkles className="w-4 h-4" />
            <span>Enter / Edit Month Data</span>
          </button>

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
                      <ColumnHeaderCell
                        colId="tenant"
                        label="Tenant"
                        width={rentWidths['tenant']}
                        minWidth={120}
                        sortConfig={rentSort}
                        onSort={handleRentSort}
                        activeFilter={rentFilters['tenant']}
                        onApplyFilter={(c, v) => setRentFilters(p => ({ ...p, [c]: v }))}
                        onClearFilter={(c) => setRentFilters(p => { const n = { ...p }; delete n[c]; return n; })}
                        onResizeStart={handleRentResizeStart}
                        theme="light"
                      />
                      <ColumnHeaderCell
                        colId="property"
                        label="Property"
                        width={rentWidths['property']}
                        minWidth={120}
                        sortConfig={rentSort}
                        onSort={handleRentSort}
                        activeFilter={rentFilters['property']}
                        onApplyFilter={(c, v) => setRentFilters(p => ({ ...p, [c]: v }))}
                        onClearFilter={(c) => setRentFilters(p => { const n = { ...p }; delete n[c]; return n; })}
                        onResizeStart={handleRentResizeStart}
                        theme="light"
                      />
                      <ColumnHeaderCell
                        colId="unit"
                        label="Unit / Partition"
                        width={rentWidths['unit']}
                        minWidth={120}
                        sortConfig={rentSort}
                        onSort={handleRentSort}
                        activeFilter={rentFilters['unit']}
                        onApplyFilter={(c, v) => setRentFilters(p => ({ ...p, [c]: v }))}
                        onClearFilter={(c) => setRentFilters(p => { const n = { ...p }; delete n[c]; return n; })}
                        onResizeStart={handleRentResizeStart}
                        theme="light"
                      />
                      <ColumnHeaderCell
                        colId="amount"
                        label="Amount (₹)"
                        align="right"
                        width={rentWidths['amount']}
                        minWidth={100}
                        sortConfig={rentSort}
                        onSort={handleRentSort}
                        activeFilter={rentFilters['amount']}
                        onApplyFilter={(c, v) => setRentFilters(p => ({ ...p, [c]: v }))}
                        onClearFilter={(c) => setRentFilters(p => { const n = { ...p }; delete n[c]; return n; })}
                        onResizeStart={handleRentResizeStart}
                        theme="light"
                      />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredRentEntries.map((r, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/60 transition-colors">
                        <td
                          style={{
                            width: `${rentWidths['tenant'] || 200}px`,
                            minWidth: `${rentWidths['tenant'] || 200}px`,
                            maxWidth: `${rentWidths['tenant'] || 200}px`
                          }}
                          className={`py-2 px-3 font-bold text-slate-900 ${autoWrap ? 'whitespace-normal break-words leading-tight' : 'truncate'}`}
                        >
                          {r.tenant}
                        </td>
                        <td
                          style={{
                            width: `${rentWidths['property'] || 200}px`,
                            minWidth: `${rentWidths['property'] || 200}px`,
                            maxWidth: `${rentWidths['property'] || 200}px`
                          }}
                          className={`py-2 px-3 text-slate-700 font-medium ${autoWrap ? 'whitespace-normal break-words leading-tight' : 'truncate'}`}
                        >
                          {r.property}
                        </td>
                        <td
                          style={{
                            width: `${rentWidths['unit'] || 160}px`,
                            minWidth: `${rentWidths['unit'] || 160}px`,
                            maxWidth: `${rentWidths['unit'] || 160}px`
                          }}
                          className={`py-2 px-3 text-slate-500 ${autoWrap ? 'whitespace-normal break-words leading-tight' : 'truncate'}`}
                        >
                          {r.unit}
                        </td>
                        <td
                          style={{
                            width: `${rentWidths['amount'] || 140}px`,
                            minWidth: `${rentWidths['amount'] || 140}px`,
                            maxWidth: `${rentWidths['amount'] || 140}px`
                          }}
                          className="py-2 px-3 text-right font-mono font-bold text-emerald-700 text-sm"
                        >
                          {formatCurrency(r.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-emerald-50/60 border-t-2 border-emerald-200 font-bold">
                    <tr>
                      <td colSpan={3} className="py-3 px-3 text-emerald-950 font-extrabold text-sm uppercase">
                        Total Rent Income ({filteredRentEntries.length} entries)
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-base font-black text-emerald-700">
                        {formatCurrency(filteredRentEntries.reduce((s, r) => s + (r.amount || 0), 0))}
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
                      <ColumnHeaderCell
                        colId="category"
                        label="Category"
                        width={expWidths['category']}
                        minWidth={120}
                        sortConfig={expSort}
                        onSort={handleExpSort}
                        activeFilter={expFilters['category']}
                        onApplyFilter={(c, v) => setExpFilters(p => ({ ...p, [c]: v }))}
                        onClearFilter={(c) => setExpFilters(p => { const n = { ...p }; delete n[c]; return n; })}
                        onResizeStart={handleExpResizeStart}
                        theme="light"
                      />
                      <ColumnHeaderCell
                        colId="description"
                        label="Description / Payee"
                        width={expWidths['description']}
                        minWidth={160}
                        sortConfig={expSort}
                        onSort={handleExpSort}
                        activeFilter={expFilters['description']}
                        onApplyFilter={(c, v) => setExpFilters(p => ({ ...p, [c]: v }))}
                        onClearFilter={(c) => setExpFilters(p => { const n = { ...p }; delete n[c]; return n; })}
                        onResizeStart={handleExpResizeStart}
                        theme="light"
                      />
                      <ColumnHeaderCell
                        colId="property"
                        label="Property"
                        width={expWidths['property']}
                        minWidth={120}
                        sortConfig={expSort}
                        onSort={handleExpSort}
                        activeFilter={expFilters['property']}
                        onApplyFilter={(c, v) => setExpFilters(p => ({ ...p, [c]: v }))}
                        onClearFilter={(c) => setExpFilters(p => { const n = { ...p }; delete n[c]; return n; })}
                        onResizeStart={handleExpResizeStart}
                        theme="light"
                      />
                      <ColumnHeaderCell
                        colId="amount"
                        label="Amount (₹)"
                        align="right"
                        width={expWidths['amount']}
                        minWidth={100}
                        sortConfig={expSort}
                        onSort={handleExpSort}
                        activeFilter={expFilters['amount']}
                        onApplyFilter={(c, v) => setExpFilters(p => ({ ...p, [c]: v }))}
                        onClearFilter={(c) => setExpFilters(p => { const n = { ...p }; delete n[c]; return n; })}
                        onResizeStart={handleExpResizeStart}
                        theme="light"
                      />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredExpenseEntries.map((e, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/60 transition-colors">
                        <td
                          style={{
                            width: `${expWidths['category'] || 180}px`,
                            minWidth: `${expWidths['category'] || 180}px`,
                            maxWidth: `${expWidths['category'] || 180}px`
                          }}
                          className="py-2 px-3"
                        >
                          <span className={`px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-100 text-slate-700 ${autoWrap ? 'whitespace-normal break-words' : 'truncate'}`}>
                            {e.category}
                          </span>
                        </td>
                        <td
                          style={{
                            width: `${expWidths['description'] || 240}px`,
                            minWidth: `${expWidths['description'] || 240}px`,
                            maxWidth: `${expWidths['description'] || 240}px`
                          }}
                          className={`py-2 px-3 text-slate-800 ${autoWrap ? 'whitespace-normal break-words leading-tight' : 'truncate'}`}
                        >
                          <span className="font-medium">{e.description}</span>
                          {e.payee && (
                            <span className="text-slate-400 text-[11px] block">{e.payee}</span>
                          )}
                        </td>
                        <td
                          style={{
                            width: `${expWidths['property'] || 200}px`,
                            minWidth: `${expWidths['property'] || 200}px`,
                            maxWidth: `${expWidths['property'] || 200}px`
                          }}
                          className={`py-2 px-3 text-slate-600 font-medium ${autoWrap ? 'whitespace-normal break-words leading-tight' : 'truncate'}`}
                        >
                          {e.property}
                        </td>
                        <td
                          style={{
                            width: `${expWidths['amount'] || 140}px`,
                            minWidth: `${expWidths['amount'] || 140}px`,
                            maxWidth: `${expWidths['amount'] || 140}px`
                          }}
                          className="py-2 px-3 text-right font-mono font-bold text-rose-600 text-sm"
                        >
                          {formatCurrency(e.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-rose-50/60 border-t-2 border-rose-200 font-bold">
                    <tr>
                      <td colSpan={3} className="py-3 px-3 text-rose-950 font-extrabold text-sm uppercase">
                        Total Expenses ({filteredExpenseEntries.length} entries)
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-base font-black text-rose-700">
                        {formatCurrency(filteredExpenseEntries.reduce((s, e) => s + (e.amount || 0), 0))}
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

      {/* Monthly Batch Data Entry Modal */}
      <MonthlyBatchEntryModal
        isOpen={isBatchModalOpen}
        onClose={() => setIsBatchModalOpen(false)}
        initialMonth={selectedMonth}
        onDataSaved={() => fetchReport(selectedMonth)}
      />
    </div>
  );
}
