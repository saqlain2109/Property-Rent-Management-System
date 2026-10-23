import React, { useState, useEffect } from 'react';
import API from '../services/api';
import { formatCurrency, formatDate, formatMonthYear } from '../utils/formatters';
import {
  Building2, Calendar, ChevronLeft, ChevronRight, Download, RefreshCw,
  TrendingUp, TrendingDown, DollarSign, Layers, CheckCircle2, Clock,
  AlertCircle, FileSpreadsheet, User, Receipt, Phone, IndianRupee, Tag
} from 'lucide-react';

export default function PropertyAccountSummaryReport() {
  const getCurrentMonth = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  };

  const [properties, setProperties] = useState([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState('');
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth);
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingProperties, setLoadingProperties] = useState(true);
  const [downloading, setDownloading] = useState(false);

  // 1. Fetch properties on mount
  useEffect(() => {
    const fetchProperties = async () => {
      try {
        setLoadingProperties(true);
        const res = await API.get('/properties');
        if (res.data.success && res.data.data.length > 0) {
          const list = res.data.data;
          setProperties(list);
          // Default to first regular property (avoid common if possible)
          const firstRegular = list.find(p => p.propertyType !== 'General / Common') || list[0];
          setSelectedPropertyId(firstRegular._id);
        }
      } catch (err) {
        console.error('Failed to fetch properties:', err);
      } finally {
        setLoadingProperties(false);
      }
    };
    fetchProperties();
  }, []);

  // 2. Fetch Account Summary when property or month changes
  const fetchReport = async (propId, month) => {
    if (!propId) return;
    try {
      setLoading(true);
      const res = await API.get(`/reports/property-account-summary?propertyId=${propId}&month=${month}`);
      if (res.data.success) {
        setReportData(res.data);
      }
    } catch (err) {
      console.error('Failed to fetch property account summary:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedPropertyId && selectedMonth) {
      fetchReport(selectedPropertyId, selectedMonth);
    }
  }, [selectedPropertyId, selectedMonth]);

  const changeMonth = (delta) => {
    const [y, m] = selectedMonth.split('-').map(Number);
    const date = new Date(y, m - 1 + delta, 1);
    const newMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    setSelectedMonth(newMonth);
  };

  const handleDownloadExcel = async () => {
    if (!selectedPropertyId) return;
    try {
      setDownloading(true);
      const res = await API.get(`/reports/export-property-account-summary-excel?propertyId=${selectedPropertyId}&month=${selectedMonth}`, {
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      const propName = reportData?.property?.name ? reportData.property.name.replace(/[^a-zA-Z0-9_-]/g, '_') : 'Property';
      link.setAttribute('download', `Property_Summary_${propName}_${selectedMonth}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      alert('Failed to download Excel report.');
    } finally {
      setDownloading(false);
    }
  };

  const earnings = reportData?.earnings || [];
  const expenses = reportData?.expenses || [];
  const summary = reportData?.summary || {
    totalExpectedRent: 0,
    totalRentReceived: 0,
    totalExpenses: 0,
    netOperatingIncome: 0,
    totalPendingRent: 0,
    occupiedUnits: 0,
    totalUnits: 0
  };

  return (
    <div className="space-y-6">
      {/* Top Filter and Controls Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-5 sm:p-6 rounded-2xl shadow-sm border border-slate-200">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center font-bold">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-slate-900 text-lg flex items-center gap-2">
                Property Account Summary
                {reportData?.property && (
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-teal-100 text-teal-800 font-bold border border-teal-200">
                    {reportData.property.name}
                  </span>
                )}
              </h3>
              <p className="text-xs text-slate-500">
                Monthly Rent Income on top, Property Expenses below, Net Cash Flow & Pending balance
              </p>
            </div>
          </div>
        </div>

        {/* Controls: Property Dropdown, Month Switcher, Excel Download */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Property Selector */}
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl shadow-2xs">
            <Building2 className="w-4 h-4 text-slate-400 shrink-0" />
            <select
              value={selectedPropertyId}
              onChange={(e) => setSelectedPropertyId(e.target.value)}
              disabled={loadingProperties}
              className="bg-transparent text-xs font-bold text-slate-800 focus:outline-none cursor-pointer pr-1"
            >
              {loadingProperties ? (
                <option>Loading properties...</option>
              ) : (
                properties.map((p) => (
                  <option key={p._id} value={p._id}>
                    {p.name} {p.propertyCode ? `(${p.propertyCode})` : ''}
                  </option>
                ))
              )}
            </select>
          </div>

          {/* Month Switcher */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl">
            <button
              onClick={() => changeMonth(-1)}
              className="p-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-white transition-colors cursor-pointer"
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
              className="p-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-white transition-colors cursor-pointer"
              title="Next Month"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Refresh */}
          <button
            onClick={() => fetchReport(selectedPropertyId, selectedMonth)}
            className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors cursor-pointer"
            title="Refresh Data"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          {/* Export Excel */}
          <button
            onClick={handleDownloadExcel}
            disabled={downloading || !reportData}
            className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-600/20 active:scale-95 transition-all disabled:opacity-60 cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>{downloading ? 'Exporting...' : 'Export Excel'}</span>
          </button>
        </div>
      </div>

      {/* KPI Cards: Financial Summary */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3.5">
        {/* Total Expected Rent */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Expected Rent</span>
            <span className="p-1.5 rounded-lg bg-blue-50 text-blue-600">
              <IndianRupee className="w-3.5 h-3.5" />
            </span>
          </div>
          <div className="text-xl font-extrabold text-slate-900 mt-2 font-mono">
            {formatCurrency(summary.totalExpectedRent)}
          </div>
          <div className="text-[10px] text-slate-500 font-semibold mt-0.5">
            {summary.occupiedUnits} of {summary.totalUnits} units active
          </div>
        </div>

        {/* Total Rent Received */}
        <div className="bg-white p-4 rounded-2xl border border-emerald-100 shadow-2xs bg-emerald-50/20">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">Rent Received</span>
            <span className="p-1.5 rounded-lg bg-emerald-100 text-emerald-700">
              <TrendingUp className="w-3.5 h-3.5" />
            </span>
          </div>
          <div className="text-xl font-extrabold text-emerald-700 mt-2 font-mono">
            {formatCurrency(summary.totalRentReceived)}
          </div>
          <div className="text-[10px] text-emerald-600 font-semibold mt-0.5">
            {summary.totalExpectedRent > 0
              ? `${Math.round((summary.totalRentReceived / summary.totalExpectedRent) * 100)}% collected`
              : 'No expected rent'
            }
          </div>
        </div>

        {/* Property Expenses */}
        <div className="bg-white p-4 rounded-2xl border border-rose-100 shadow-2xs bg-rose-50/20">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-rose-700">Property Expenses</span>
            <span className="p-1.5 rounded-lg bg-rose-100 text-rose-700">
              <TrendingDown className="w-3.5 h-3.5" />
            </span>
          </div>
          <div className="text-xl font-extrabold text-rose-700 mt-2 font-mono">
            {formatCurrency(summary.totalExpenses)}
          </div>
          <div className="text-[10px] text-rose-600 font-semibold mt-0.5">
            {expenses.length} expense {expenses.length === 1 ? 'entry' : 'entries'}
          </div>
        </div>

        {/* Net Operating Cash Flow */}
        <div className={`p-4 rounded-2xl border shadow-2xs ${
          summary.netOperatingIncome >= 0
            ? 'bg-emerald-500 text-white border-emerald-600'
            : 'bg-rose-500 text-white border-rose-600'
        }`}>
          <div className="flex items-center justify-between opacity-90">
            <span className="text-[11px] font-bold uppercase tracking-wider">Net Cash Flow</span>
            <DollarSign className="w-3.5 h-3.5" />
          </div>
          <div className="text-xl font-extrabold mt-2 font-mono">
            {formatCurrency(summary.netOperatingIncome)}
          </div>
          <div className="text-[10px] font-medium opacity-90 mt-0.5">
            (Rent Received - Expenses)
          </div>
        </div>

        {/* Pending Rent */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Balance Due</span>
            <span className={`p-1.5 rounded-lg ${summary.totalPendingRent > 0 ? 'bg-amber-50 text-amber-600' : 'bg-slate-50 text-slate-400'}`}>
              <AlertCircle className="w-3.5 h-3.5" />
            </span>
          </div>
          <div className={`text-xl font-extrabold mt-2 font-mono ${summary.totalPendingRent > 0 ? 'text-amber-600' : 'text-slate-700'}`}>
            {formatCurrency(summary.totalPendingRent)}
          </div>
          <div className="text-[10px] text-slate-500 font-semibold mt-0.5">
            {summary.totalPendingRent === 0 ? 'Fully settled' : 'Unpaid balance'}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="bg-white p-16 rounded-2xl border border-slate-200 text-center text-slate-400 text-sm">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-teal-600" />
          Loading Property Account Summary for {formatMonthYear(selectedMonth)}...
        </div>
      ) : !reportData ? (
        <div className="bg-white p-16 rounded-2xl border border-slate-200 text-center text-slate-400 text-sm">
          Please select a property to view its account summary statement.
        </div>
      ) : (
        <div className="space-y-6">
          {/* ======================================================== */}
          {/* SECTION 1: TOP SECTION - RENT & EARNINGS FOR THIS PROPERTY */}
          {/* ======================================================== */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 bg-slate-50/80 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-teal-100 text-teal-800">
                  <TrendingUp className="w-4 h-4" />
                </span>
                <div>
                  <h4 className="text-sm font-extrabold text-slate-900">
                    1. Rent & Monthly Earnings · {formatMonthYear(selectedMonth)}
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    Unit-wise rental income, contract type, receipt dates and payment status
                  </p>
                </div>
              </div>
              <div className="text-xs font-bold text-slate-700 font-mono">
                Total Received: <span className="text-emerald-700">{formatCurrency(summary.totalRentReceived)}</span>
              </div>
            </div>

            {earnings.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs">
                No units or tenants assigned to this property.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-100/90 text-slate-600 font-extrabold uppercase tracking-wider text-[11px] border-b border-slate-200">
                    <tr>
                      <th className="py-3 px-4">#</th>
                      <th className="py-3 px-4">Unit / Partition</th>
                      <th className="py-3 px-4">Tenant</th>
                      <th className="py-3 px-4">Contract Type</th>
                      <th className="py-3 px-4 text-right">Expected Rent</th>
                      <th className="py-3 px-4 text-right">Received Rent</th>
                      <th className="py-3 px-4">Receipt Date</th>
                      <th className="py-3 px-4">Mode</th>
                      <th className="py-3 px-4 text-right">Balance Due</th>
                      <th className="py-3 px-4 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {earnings.map((row, idx) => (
                      <tr key={row.unitId || idx} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3 px-4 text-slate-400 font-mono text-[11px]">{idx + 1}</td>
                        <td className="py-3 px-4 font-bold text-slate-800">
                          {row.unitName}
                          {row.unitCode && (
                            <span className="block text-[10px] text-slate-400 font-mono font-normal">
                              {row.unitCode}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 font-semibold text-slate-700">
                          {row.tenantName}
                          {row.tenantPhone && (
                            <span className="block text-[10px] text-slate-400 font-mono">
                              {row.tenantPhone}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold border ${
                            row.contractType === 'Business'
                              ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                              : 'bg-blue-50 text-blue-700 border-blue-200'
                          }`}>
                            {row.contractType || 'Rent'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-slate-700">
                          {formatCurrency(row.expectedRent)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-extrabold text-emerald-700">
                          {formatCurrency(row.receivedRent)}
                        </td>
                        <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                          {row.paidDate ? formatDate(row.paidDate) : <span className="text-slate-400">—</span>}
                        </td>
                        <td className="py-3 px-4 text-slate-600">
                          {row.paymentMode || <span className="text-slate-400">—</span>}
                        </td>
                        <td className={`py-3 px-4 text-right font-mono font-bold ${
                          row.balanceDue > 0 ? 'text-rose-600' : 'text-slate-400'
                        }`}>
                          {formatCurrency(row.balanceDue)}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                            row.status === 'Paid'
                              ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                              : row.status === 'Partial'
                              ? 'bg-amber-100 text-amber-800 border-amber-200'
                              : row.status === 'Vacant'
                              ? 'bg-slate-100 text-slate-600 border-slate-200'
                              : 'bg-rose-100 text-rose-800 border-rose-200'
                          }`}>
                            {row.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-50 border-t-2 border-slate-200 font-extrabold text-xs">
                    <tr>
                      <td colSpan={4} className="py-3.5 px-4 text-slate-800 uppercase tracking-wider">
                        Total Rent & Earnings
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-slate-900">
                        {formatCurrency(summary.totalExpectedRent)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-emerald-700">
                        {formatCurrency(summary.totalRentReceived)}
                      </td>
                      <td colSpan={2}></td>
                      <td className={`py-3.5 px-4 text-right font-mono ${
                        summary.totalPendingRent > 0 ? 'text-rose-700' : 'text-slate-700'
                      }`}>
                        {formatCurrency(summary.totalPendingRent)}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          {/* ======================================================== */}
          {/* SECTION 2: BOTTOM SECTION - PROPERTY EXPENSES */}
          {/* ======================================================== */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 bg-slate-50/80 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-rose-100 text-rose-800">
                  <TrendingDown className="w-4 h-4" />
                </span>
                <div>
                  <h4 className="text-sm font-extrabold text-slate-900">
                    2. Property Expenses · {formatMonthYear(selectedMonth)}
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    Operational costs, maintenance, repairs, taxes, and bills incurred for this property
                  </p>
                </div>
              </div>
              <div className="text-xs font-bold text-slate-700 font-mono">
                Total Expenses: <span className="text-rose-700">{formatCurrency(summary.totalExpenses)}</span>
              </div>
            </div>

            {expenses.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs">
                No expenses recorded for this property in {formatMonthYear(selectedMonth)}.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-100/90 text-slate-600 font-extrabold uppercase tracking-wider text-[11px] border-b border-slate-200">
                    <tr>
                      <th className="py-3 px-4">#</th>
                      <th className="py-3 px-4">Expense Date</th>
                      <th className="py-3 px-4">Expense Head</th>
                      <th className="py-3 px-4">Description / Details</th>
                      <th className="py-3 px-4">Paid To / Payee</th>
                      <th className="py-3 px-4">Payment Mode</th>
                      <th className="py-3 px-4 text-right">Amount (₹)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {expenses.map((exp, idx) => (
                      <tr key={exp._id || idx} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3 px-4 text-slate-400 font-mono text-[11px]">{idx + 1}</td>
                        <td className="py-3 px-4 text-slate-700 whitespace-nowrap font-medium">
                          {exp.expenseDate ? formatDate(exp.expenseDate) : formatMonthYear(exp.expenseMonth || selectedMonth)}
                        </td>
                        <td className="py-3 px-4">
                          <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                            {exp.category || 'Maintenance'}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-semibold text-slate-800">
                          {exp.description}
                        </td>
                        <td className="py-3 px-4 text-slate-600">
                          {exp.vendorOrPayee || <span className="text-slate-400">—</span>}
                        </td>
                        <td className="py-3 px-4 text-slate-600">
                          <span className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-50 text-slate-600 border border-slate-100">
                            {exp.paymentMode || 'Cash'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-extrabold text-rose-700">
                          {formatCurrency(exp.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-50 border-t-2 border-slate-200 font-extrabold text-xs">
                    <tr>
                      <td colSpan={6} className="py-3.5 px-4 text-slate-800 uppercase tracking-wider">
                        Total Property Expenses
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-rose-700">
                        {formatCurrency(summary.totalExpenses)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          {/* ======================================================== */}
          {/* SECTION 3: MONTHLY RECONCILIATION SUMMARY BOX */}
          {/* ======================================================== */}
          <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white rounded-2xl p-6 shadow-md">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <span className="text-xs uppercase font-extrabold tracking-wider text-teal-400">
                  Monthly Statement Summary · {reportData.property?.name}
                </span>
                <h4 className="text-lg font-extrabold text-white mt-1">
                  Net Operating Cash Flow for {formatMonthYear(selectedMonth)}
                </h4>
                <p className="text-xs text-slate-300 mt-0.5">
                  Calculation: Total Rent Received ({formatCurrency(summary.totalRentReceived)}) minus Total Expenses ({formatCurrency(summary.totalExpenses)})
                </p>
              </div>

              <div className="text-right bg-white/10 px-5 py-3 rounded-xl backdrop-blur-xs border border-white/10 shrink-0">
                <span className="text-xs uppercase font-bold text-slate-300 block">Net Income</span>
                <span className={`text-2xl font-black font-mono block ${
                  summary.netOperatingIncome >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}>
                  {formatCurrency(summary.netOperatingIncome)}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
