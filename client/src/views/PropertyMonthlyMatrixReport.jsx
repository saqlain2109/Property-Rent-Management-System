import React, { useState, useEffect, useMemo } from 'react';
import API from '../services/api';
import { formatCurrency } from '../utils/formatters';
import { 
  Building2, Calendar, Download, RefreshCw, Filter, 
  Search, CheckSquare, Square, FileSpreadsheet,
  CheckCircle2, AlertCircle, ArrowUpDown, ChevronDown,
  Layers, Wallet, IndianRupee, PieChart, TrendingUp, TrendingDown
} from 'lucide-react';

const PERIOD_OPTIONS = [
  { id: '2025-03_2026-02', label: 'Master Sheet 1 Year (Mar 2025 – Feb 2026)', badge: 'Master Sheet 1' },
  { id: 'CY2026', label: 'Calendar Year 2026 (Jan 2026 – Dec 2026)', badge: 'CY 2026' },
  { id: 'FY2025-26', label: 'Financial Year 2025–26 (Apr 2025 – Mar 2026)', badge: 'FY 2025-26' },
  { id: 'CY2025', label: 'Calendar Year 2025 (Jan 2025 – Dec 2025)', badge: 'CY 2025' }
];

export default function PropertyMonthlyMatrixReport() {
  // Period Selection state with localStorage persistence
  const [selectedPeriod, setSelectedPeriod] = useState(() => {
    return localStorage.getItem('matrix_selected_period') || '2025-03_2026-02';
  });

  const [selectedPropertyFilter, setSelectedPropertyFilter] = useState(() => {
    return localStorage.getItem('matrix_prop_filter') || '';
  });

  const [search, setSearch] = useState('');
  const [activeSection, setActiveSection] = useState('all'); // 'all' | 'rent' | 'expenses' | 'reconciliation'

  // Data states
  const [reportData, setReportData] = useState(null);
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  // Visible Months state (Array of month keys e.g. ['2025-03', ...])
  const [visibleMonthKeys, setVisibleMonthKeys] = useState(() => {
    try {
      const saved = localStorage.getItem('matrix_visible_month_keys');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return null; // Will initialize to all months when reportData loads
  });

  const [showMonthSelector, setShowMonthSelector] = useState(false);

  // Sync state to localStorage
  useEffect(() => {
    localStorage.setItem('matrix_selected_period', selectedPeriod);
  }, [selectedPeriod]);

  useEffect(() => {
    localStorage.setItem('matrix_prop_filter', selectedPropertyFilter);
  }, [selectedPropertyFilter]);

  useEffect(() => {
    if (visibleMonthKeys) {
      try {
        localStorage.setItem('matrix_visible_month_keys', JSON.stringify(visibleMonthKeys));
      } catch (e) {}
    }
  }, [visibleMonthKeys]);

  // Load properties list
  useEffect(() => {
    const fetchProps = async () => {
      try {
        const res = await API.get('/properties');
        if (res.data.success) {
          setProperties(res.data.data.filter(p => p.propertyType !== 'General / Common'));
        }
      } catch (err) {
        console.error('Failed to fetch properties:', err);
      }
    };
    fetchProps();
  }, []);

  // Fetch matrix report data
  const fetchMatrix = async () => {
    try {
      setLoading(true);
      let url = `/reports/property-monthly-matrix?period=${selectedPeriod}`;
      if (selectedPropertyFilter) {
        url += `&propertyId=${selectedPropertyFilter}`;
      }
      const res = await API.get(url);
      if (res.data.success) {
        setReportData(res.data);
        const allKeys = res.data.months.map(m => m.monthKey);
        // If no visible months or keys don't belong to current period, reset to all
        setVisibleMonthKeys(prev => {
          if (!prev || prev.length === 0 || !prev.some(k => allKeys.includes(k))) {
            return allKeys;
          }
          return prev.filter(k => allKeys.includes(k));
        });
      }
    } catch (err) {
      console.error('Failed to load matrix report:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMatrix();
  }, [selectedPeriod, selectedPropertyFilter]);

  // Visible Months list
  const activeMonths = useMemo(() => {
    if (!reportData?.months) return [];
    if (!visibleMonthKeys || visibleMonthKeys.length === 0) return reportData.months;
    return reportData.months.filter(m => visibleMonthKeys.includes(m.monthKey));
  }, [reportData, visibleMonthKeys]);

  const toggleMonth = (mKey) => {
    setVisibleMonthKeys(prev => {
      if (!prev) return [mKey];
      if (prev.includes(mKey)) {
        if (prev.length === 1) return prev; // keep at least 1 month
        return prev.filter(k => k !== mKey);
      } else {
        const allKeys = reportData?.months?.map(m => m.monthKey) || [];
        const next = [...prev, mKey];
        return allKeys.filter(k => next.includes(k));
      }
    });
  };

  const selectAllMonths = () => {
    if (reportData?.months) {
      setVisibleMonthKeys(reportData.months.map(m => m.monthKey));
    }
  };

  const selectQuarter = (qIndex) => {
    if (!reportData?.months) return;
    const all = reportData.months;
    const start = qIndex * 3;
    const qMonths = all.slice(start, start + 3).map(m => m.monthKey);
    if (qMonths.length > 0) setVisibleMonthKeys(qMonths);
  };

  // Download Excel
  const handleExportExcel = async () => {
    try {
      setDownloading(true);
      let url = `/reports/export-property-monthly-matrix-excel?period=${selectedPeriod}`;
      if (selectedPropertyFilter) {
        url += `&propertyId=${selectedPropertyFilter}`;
      }
      const res = await API.get(url, { responseType: 'blob' });
      const blob = new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const link = document.createElement('a');
      link.href = window.URL.createObjectURL(blob);
      link.download = `Master_Monthly_Statement_${selectedPeriod}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      alert('Failed to export Excel matrix');
    } finally {
      setDownloading(false);
    }
  };

  // Filtered Groups by search
  const filteredRentGroups = useMemo(() => {
    if (!reportData?.rentPart?.rentGroups) return [];
    const q = search.trim().toLowerCase();
    if (!q) return reportData.rentPart.rentGroups;

    return reportData.rentPart.rentGroups.map(grp => {
      const matchGrpName = grp.propertyName.toLowerCase().includes(q);
      const matchUnits = grp.units.filter(u => 
        matchGrpName ||
        (u.label || '').toLowerCase().includes(q) ||
        (u.partitionCode || '').toLowerCase().includes(q)
      );
      return {
        ...grp,
        units: matchUnits
      };
    }).filter(g => g.units.length > 0);
  }, [reportData, search]);

  const filteredExpenseGroups = useMemo(() => {
    if (!reportData?.expensePart?.expenseGroups) return [];
    const q = search.trim().toLowerCase();
    if (!q) return reportData.expensePart.expenseGroups;

    return reportData.expensePart.expenseGroups.map(grp => {
      const matchGrpName = grp.groupName.toLowerCase().includes(q);
      const matchHeads = grp.heads.filter(h => 
        matchGrpName ||
        (h.headName || '').toLowerCase().includes(q)
      );
      return {
        ...grp,
        heads: matchHeads
      };
    }).filter(g => g.heads.length > 0);
  }, [reportData, search]);

  // Overall KPI sums calculated across active (visible) months
  const kpis = useMemo(() => {
    if (!reportData) return { totalRent: 0, totalIncome: 0, totalExpenses: 0, difference: 0, closingBalance: 0 };
    const rTotals = reportData.rentPart?.rentTotals || {};
    const incTotals = reportData.rentPart?.totalIncome || {};
    const expTotals = reportData.expensePart?.totalExpenses || {};
    const recTotals = reportData.reconciliationPart?.totalBalance || {};

    let sumRent = 0;
    let sumIncome = 0;
    let sumExpenses = 0;
    activeMonths.forEach(m => {
      sumRent += (rTotals[m.monthKey] || 0);
      sumIncome += (incTotals[m.monthKey] || 0);
      sumExpenses += (expTotals[m.monthKey] || 0);
    });

    const lastMonthKey = activeMonths.length > 0 ? activeMonths[activeMonths.length - 1].monthKey : null;
    const closingBal = lastMonthKey ? (recTotals[lastMonthKey] || 0) : 0;

    return {
      totalRent: sumRent,
      totalIncome: sumIncome,
      totalExpenses: sumExpenses,
      difference: sumIncome - sumExpenses,
      closingBalance: closingBal
    };
  }, [reportData, activeMonths]);

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white shadow-lg shadow-emerald-500/20">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-black text-slate-900 tracking-tight">
                  Master Monthly Financial Statement
                </h1>
                <span className="text-[10px] font-extrabold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                  Sheet 1 Format
                </span>
              </div>
              <p className="text-xs font-semibold text-slate-500 mt-0.5">
                Full 3-Part Master Matrix: Part 1 Rent Income, Part 2 Actual Expenses, Part 3 Cash Flow & Balance Reconciliation
              </p>
            </div>
          </div>
        </div>

        {/* Global Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Period Selector */}
          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-2xl border border-slate-200 shadow-2xs">
            <Calendar className="w-4 h-4 text-emerald-600 ml-2" />
            <select
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value)}
              className="bg-transparent text-xs font-extrabold text-slate-800 pr-3 py-1.5 focus:outline-none cursor-pointer"
            >
              {PERIOD_OPTIONS.map(opt => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Refresh Button */}
          <button
            onClick={fetchMatrix}
            disabled={loading}
            className="p-2.5 rounded-2xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors shadow-2xs cursor-pointer"
            title="Refresh spreadsheet data"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          {/* Export Full Excel */}
          <button
            onClick={handleExportExcel}
            disabled={downloading || loading}
            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-extrabold text-xs shadow-md shadow-emerald-600/20 transition-all cursor-pointer"
          >
            <Download className="w-4 h-4" />
            {downloading ? 'Exporting...' : 'Export Excel (Sheet 1)'}
          </button>
        </div>
      </div>

      {/* Control Toolbar: Section Filter, Property Filter, Search & Month Checkboxes */}
      <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Section Switcher Tabs */}
            <div className="flex items-center p-1 bg-slate-100 rounded-2xl border border-slate-200">
              <button
                type="button"
                onClick={() => setActiveSection('all')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
                  activeSection === 'all'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                All 3 Parts (Complete Sheet 1)
              </button>
              <button
                type="button"
                onClick={() => setActiveSection('rent')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
                  activeSection === 'rent'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Part 1: Rent Income
              </button>
              <button
                type="button"
                onClick={() => setActiveSection('expenses')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
                  activeSection === 'expenses'
                    ? 'bg-rose-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Part 2: Actual Expenses
              </button>
              <button
                type="button"
                onClick={() => setActiveSection('reconciliation')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
                  activeSection === 'reconciliation'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Part 3: Balance Reconciliation
              </button>
            </div>

            {/* Property Filter Dropdown */}
            <div>
              <select
                value={selectedPropertyFilter}
                onChange={(e) => setSelectedPropertyFilter(e.target.value)}
                className="px-3.5 py-2 rounded-2xl text-xs font-bold bg-slate-50 border border-slate-200 text-slate-700 hover:bg-slate-100 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
              >
                <option value="">All 11 Properties</option>
                {properties.map(p => (
                  <option key={p._id} value={p._id}>
                    {p.name} {p.propertyCode ? `(${p.propertyCode})` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Month Column Selector Toggle */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowMonthSelector(!showMonthSelector)}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-2xl text-xs font-bold bg-slate-50 border border-slate-200 text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <Calendar className="w-3.5 h-3.5 text-emerald-600" />
                <span>Columns: {activeMonths.length} Months</span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showMonthSelector ? 'rotate-180' : ''}`} />
              </button>

              {/* Month Selection Dropdown */}
              {showMonthSelector && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setShowMonthSelector(false)} />
                  <div className="absolute left-0 mt-2 w-80 bg-white rounded-3xl shadow-2xl border border-slate-200 p-4 z-40 animate-in fade-in zoom-in-95 duration-100">
                    <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
                      <span className="text-xs font-extrabold text-slate-800">Toggle Visible Months</span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={selectAllMonths}
                          className="text-[11px] font-bold text-emerald-600 hover:underline cursor-pointer"
                        >
                          All
                        </button>
                      </div>
                    </div>

                    {/* Quarter Presets */}
                    <div className="grid grid-cols-4 gap-1 mb-3">
                      {['Q1', 'Q2', 'Q3', 'Q4'].map((q, idx) => (
                        <button
                          key={q}
                          type="button"
                          onClick={() => selectQuarter(idx)}
                          className="py-1 rounded-lg bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 text-[11px] font-extrabold text-slate-700 transition-colors cursor-pointer text-center"
                        >
                          {q}
                        </button>
                      ))}
                    </div>

                    {/* Month Checkboxes */}
                    <div className="grid grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1">
                      {reportData?.months?.map(m => {
                        const isChecked = visibleMonthKeys?.includes(m.monthKey);
                        return (
                          <label
                            key={m.monthKey}
                            className={`flex items-center gap-2 p-2 rounded-xl text-xs font-bold cursor-pointer transition-colors ${
                              isChecked ? 'bg-emerald-50 text-emerald-900 border border-emerald-200/60' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleMonth(m.monthKey)}
                              className="rounded text-emerald-600 focus:ring-emerald-500 w-3.5 h-3.5 cursor-pointer"
                            />
                            <span className="truncate">{m.shortLabel || m.monthName}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Quick Search */}
          <div className="relative w-full sm:w-72">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search property, partition, head..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-2xl text-xs bg-slate-50 border border-slate-200 text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-2xs"
            />
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* THE MASTER FINANCIAL SPREADSHEET (SHEET 1) TABLE */}
      {/* ======================================================== */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-24 text-center">
            <RefreshCw className="w-8 h-8 text-emerald-600 animate-spin mx-auto mb-3" />
            <p className="text-sm font-bold text-slate-600">Loading Master Sheet 1 Matrix for {selectedPeriod}...</p>
          </div>
        ) : !reportData ? (
          <div className="py-24 text-center text-slate-400 text-sm">
            No report data available for this period.
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[75vh]">
            <table className="w-full text-left text-xs border-collapse">
              {/* STICKY MAIN TABLE HEADER */}
              <thead className="sticky top-0 z-20 bg-slate-900 text-white shadow-md">
                <tr>
                  <th className="px-3 py-3 w-12 text-center font-extrabold uppercase text-[10px] tracking-wider border-r border-slate-800">
                    Sr.
                  </th>
                  <th className="px-3 py-3 w-28 font-extrabold uppercase text-[10px] tracking-wider border-r border-slate-800">
                    Partition
                  </th>
                  <th className="px-4 py-3 min-w-[220px] font-extrabold uppercase text-[10px] tracking-wider border-r border-slate-800">
                    Property / Tenant / Head
                  </th>
                  {activeMonths.map(m => (
                    <th
                      key={m.monthKey}
                      className="px-3 py-3 min-w-[105px] text-right font-extrabold uppercase text-[10px] tracking-wider border-r border-slate-800"
                    >
                      {m.shortLabel || m.monthName}
                    </th>
                  ))}
                  <th className="px-3 py-3 min-w-[125px] text-right font-extrabold uppercase text-[10px] tracking-wider border-r border-slate-800 bg-slate-950">
                    Row Total (₹)
                  </th>
                  <th className="px-3 py-3 min-w-[130px] text-right font-extrabold uppercase text-[10px] tracking-wider bg-slate-950">
                    Group Subtotal
                  </th>
                </tr>
              </thead>

              <tbody>
                {/* ======================================================== */}
                {/* SECTION 1: RENT / REVENUE STATEMENT */}
                {/* ======================================================== */}
                {(activeSection === 'all' || activeSection === 'rent') && (
                  <>
                    <tr className="bg-emerald-700 text-white sticky top-[41px] z-10 shadow-xs">
                      <td colSpan={3 + activeMonths.length + 2} className="px-4 py-2 font-black text-xs uppercase tracking-wider">
                        1. RENT / REVENUE STATEMENT
                      </td>
                    </tr>

                    {filteredRentGroups.map(grp => (
                      <React.Fragment key={`rent_grp_${grp.order}_${grp.propertyName}`}>
                        {/* Property Group Header Row */}
                        <tr className="bg-slate-100/90 font-extrabold text-slate-900 border-t border-b border-slate-300">
                          <td className="px-3 py-2 text-center font-mono font-bold text-slate-700 border-r border-slate-200">
                            {grp.order}
                          </td>
                          <td className="px-3 py-2 border-r border-slate-200 text-slate-400">
                            —
                          </td>
                          <td className="px-4 py-2 border-r border-slate-200 text-slate-900 font-black">
                            {grp.propertyName}
                          </td>
                          {activeMonths.map(m => {
                            const val = grp.propertyTotals?.[m.monthKey] || 0;
                            return (
                              <td key={m.monthKey} className="px-3 py-2 text-right border-r border-slate-200 font-mono text-slate-600">
                                {val > 0 ? formatCurrency(val) : '—'}
                              </td>
                            );
                          })}
                          <td className="px-3 py-2 text-right border-r border-slate-200 font-mono font-extrabold text-slate-800 bg-slate-200/50">
                            {formatCurrency(grp.propertyTotal || 0)}
                          </td>
                          <td className="px-3 py-2 text-right font-mono font-black text-emerald-800 bg-emerald-100/50">
                            {formatCurrency(grp.propertyTotal || 0)}
                          </td>
                        </tr>

                        {/* Units / Tenant Rows under this property */}
                        {grp.units.map((u, uIdx) => {
                          const unitRowTotal = activeMonths.reduce((s, m) => s + (u.months?.[m.monthKey] || 0), 0);
                          return (
                            <tr key={`unit_${grp.order}_${uIdx}`} className="hover:bg-emerald-50/30 border-b border-slate-100 transition-colors">
                              <td className="px-3 py-2 text-center text-slate-400 border-r border-slate-100 font-mono text-[11px]">
                                {grp.order}.{uIdx + 1}
                              </td>
                              <td className="px-3 py-2 border-r border-slate-100 text-slate-600 font-semibold text-[11px]">
                                {u.partitionCode || '—'}
                              </td>
                              <td className="px-4 py-2 border-r border-slate-100 text-slate-800 font-medium pl-6">
                                {u.label}
                              </td>
                              {activeMonths.map(m => {
                                const val = u.months?.[m.monthKey] || 0;
                                return (
                                  <td key={m.monthKey} className="px-3 py-2 text-right border-r border-slate-100 font-mono text-slate-700">
                                    {val > 0 ? (
                                      <span className="font-semibold text-slate-800">{formatCurrency(val)}</span>
                                    ) : (
                                      <span className="text-slate-300">0</span>
                                    )}
                                  </td>
                                );
                              })}
                              <td className="px-3 py-2 text-right border-r border-slate-100 font-mono font-bold text-slate-900 bg-slate-50/80">
                                {formatCurrency(unitRowTotal)}
                              </td>
                              <td className="px-3 py-2 text-right text-slate-300 font-mono">
                                —
                              </td>
                            </tr>
                          );
                        })}
                      </React.Fragment>
                    ))}

                    {/* Part 1 Summary Rows */}
                    <tr className="bg-emerald-50 font-bold text-emerald-950 border-t-2 border-emerald-400">
                      <td className="px-3 py-2.5 text-center font-mono border-r border-emerald-200">Σ</td>
                      <td className="px-3 py-2.5 border-r border-emerald-200"></td>
                      <td className="px-4 py-2.5 border-r border-emerald-200 font-extrabold text-emerald-900">
                        Total Rent
                      </td>
                      {activeMonths.map(m => {
                        const val = reportData.rentPart?.rentTotals?.[m.monthKey] || 0;
                        return (
                          <td key={m.monthKey} className="px-3 py-2.5 text-right border-r border-emerald-200 font-mono font-extrabold text-emerald-800">
                            {formatCurrency(val)}
                          </td>
                        );
                      })}
                      <td className="px-3 py-2.5 text-right border-r border-emerald-200 font-mono font-black text-emerald-900 bg-emerald-100/60">
                        {formatCurrency(activeMonths.reduce((s, m) => s + (reportData.rentPart?.rentTotals?.[m.monthKey] || 0), 0))}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono font-bold text-emerald-800">
                        {formatCurrency(activeMonths.reduce((s, m) => s + (reportData.rentPart?.rentTotals?.[m.monthKey] || 0), 0))}
                      </td>
                    </tr>

                    {/* Deposit Received */}
                    <tr className="bg-white border-b border-slate-200 font-semibold text-slate-700">
                      <td className="px-3 py-2 text-center border-r border-slate-200 text-slate-400 font-mono">+</td>
                      <td className="px-3 py-2 border-r border-slate-200"></td>
                      <td className="px-4 py-2 border-r border-slate-200 text-slate-700">
                        Deposit Received
                      </td>
                      {activeMonths.map(m => {
                        const val = reportData.rentPart?.depositReceived?.[m.monthKey] || 0;
                        return (
                          <td key={m.monthKey} className="px-3 py-2 text-right border-r border-slate-200 font-mono text-slate-600">
                            {val > 0 ? formatCurrency(val) : '0'}
                          </td>
                        );
                      })}
                      <td className="px-3 py-2 text-right border-r border-slate-200 font-mono font-bold text-slate-800 bg-slate-50">
                        {formatCurrency(activeMonths.reduce((s, m) => s + (reportData.rentPart?.depositReceived?.[m.monthKey] || 0), 0))}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-slate-400">—</td>
                    </tr>

                    {/* Loan received */}
                    <tr className="bg-white border-b border-slate-200 font-semibold text-slate-700">
                      <td className="px-3 py-2 text-center border-r border-slate-200 text-slate-400 font-mono">+</td>
                      <td className="px-3 py-2 border-r border-slate-200"></td>
                      <td className="px-4 py-2 border-r border-slate-200 text-slate-700">
                        Loan received
                      </td>
                      {activeMonths.map(m => {
                        const val = reportData.rentPart?.loanReceived?.[m.monthKey] || 0;
                        return (
                          <td key={m.monthKey} className="px-3 py-2 text-right border-r border-slate-200 font-mono text-slate-600">
                            {val > 0 ? formatCurrency(val) : '0'}
                          </td>
                        );
                      })}
                      <td className="px-3 py-2 text-right border-r border-slate-200 font-mono font-bold text-slate-800 bg-slate-50">
                        {formatCurrency(activeMonths.reduce((s, m) => s + (reportData.rentPart?.loanReceived?.[m.monthKey] || 0), 0))}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-slate-400">—</td>
                    </tr>

                    {/* Total Income Row */}
                    <tr className="bg-emerald-600 text-white font-black border-t-2 border-b-2 border-emerald-700 shadow-sm">
                      <td className="px-3 py-3 text-center font-mono border-r border-emerald-500">★</td>
                      <td className="px-3 py-3 border-r border-emerald-500"></td>
                      <td className="px-4 py-3 border-r border-emerald-500 text-sm tracking-wide">
                        TOTAL INCOME
                      </td>
                      {activeMonths.map(m => {
                        const val = reportData.rentPart?.totalIncome?.[m.monthKey] || 0;
                        return (
                          <td key={m.monthKey} className="px-3 py-3 text-right border-r border-emerald-500 font-mono text-sm">
                            {formatCurrency(val)}
                          </td>
                        );
                      })}
                      <td className="px-3 py-3 text-right border-r border-emerald-500 font-mono text-sm bg-emerald-700">
                        {formatCurrency(activeMonths.reduce((s, m) => s + (reportData.rentPart?.totalIncome?.[m.monthKey] || 0), 0))}
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-sm bg-emerald-700">
                        {formatCurrency(activeMonths.reduce((s, m) => s + (reportData.rentPart?.totalIncome?.[m.monthKey] || 0), 0))}
                      </td>
                    </tr>

                    {/* Spacer */}
                    <tr className="h-6 bg-slate-100/60 border-t border-b border-slate-200">
                      <td colSpan={3 + activeMonths.length + 2}></td>
                    </tr>
                  </>
                )}

                {/* ======================================================== */}
                {/* SECTION 2: ACTUAL EXPENSE STATEMENT */}
                {/* ======================================================== */}
                {(activeSection === 'all' || activeSection === 'expenses') && (
                  <>
                    <tr className="bg-rose-700 text-white sticky top-[41px] z-10 shadow-xs">
                      <td colSpan={3 + activeMonths.length + 2} className="px-4 py-2 font-black text-xs uppercase tracking-wider">
                        2. ACTUAL EXPENSE STATEMENT
                      </td>
                    </tr>

                    {filteredExpenseGroups.map(grp => (
                      <React.Fragment key={`exp_grp_${grp.order}_${grp.groupName}`}>
                        {/* Expense Group Header Row */}
                        <tr className="bg-slate-100/90 font-extrabold text-slate-900 border-t border-b border-slate-300">
                          <td className="px-3 py-2 text-center font-mono font-bold text-slate-700 border-r border-slate-200">
                            {grp.order}
                          </td>
                          <td className="px-3 py-2 border-r border-slate-200 text-slate-400">
                            —
                          </td>
                          <td className="px-4 py-2 border-r border-slate-200 text-slate-900 font-black">
                            {grp.groupName}
                          </td>
                          {activeMonths.map(m => {
                            const val = grp.groupTotals?.[m.monthKey] || 0;
                            return (
                              <td key={m.monthKey} className="px-3 py-2 text-right border-r border-slate-200 font-mono text-slate-600">
                                {val > 0 ? formatCurrency(val) : '—'}
                              </td>
                            );
                          })}
                          <td className="px-3 py-2 text-right border-r border-slate-200 font-mono font-extrabold text-slate-800 bg-slate-200/50">
                            {formatCurrency(grp.groupTotal || 0)}
                          </td>
                          <td className="px-3 py-2 text-right font-mono font-black text-rose-800 bg-rose-100/50">
                            {formatCurrency(grp.groupTotal || 0)}
                          </td>
                        </tr>

                        {/* Expense Heads under this group */}
                        {grp.heads.map((h, hIdx) => {
                          const headRowTotal = activeMonths.reduce((s, m) => s + (h.months?.[m.monthKey] || 0), 0);
                          return (
                            <tr key={`head_${grp.order}_${hIdx}`} className="hover:bg-rose-50/30 border-b border-slate-100 transition-colors">
                              <td className="px-3 py-2 text-center text-slate-400 border-r border-slate-100 font-mono text-[11px]">
                                {grp.order}.{hIdx + 1}
                              </td>
                              <td className="px-3 py-2 border-r border-slate-100 text-slate-400">
                                —
                              </td>
                              <td className="px-4 py-2 border-r border-slate-100 text-slate-800 font-medium pl-6">
                                {h.headName}
                              </td>
                              {activeMonths.map(m => {
                                const val = h.months?.[m.monthKey] || 0;
                                return (
                                  <td key={m.monthKey} className="px-3 py-2 text-right border-r border-slate-100 font-mono text-slate-700">
                                    {val > 0 ? (
                                      <span className="font-semibold text-rose-700">{formatCurrency(val)}</span>
                                    ) : (
                                      <span className="text-slate-300">0</span>
                                    )}
                                  </td>
                                );
                              })}
                              <td className="px-3 py-2 text-right border-r border-slate-100 font-mono font-bold text-slate-900 bg-slate-50/80">
                                {formatCurrency(headRowTotal)}
                              </td>
                              <td className="px-3 py-2 text-right text-slate-300 font-mono">
                                —
                              </td>
                            </tr>
                          );
                        })}
                      </React.Fragment>
                    ))}

                    {/* Part 2 Total Expenses Row */}
                    <tr className="bg-rose-600 text-white font-black border-t-2 border-b-2 border-rose-700 shadow-sm">
                      <td className="px-3 py-3 text-center font-mono border-r border-rose-500">★</td>
                      <td className="px-3 py-3 border-r border-rose-500"></td>
                      <td className="px-4 py-3 border-r border-rose-500 text-sm tracking-wide">
                        TOTAL EXPENSES
                      </td>
                      {activeMonths.map(m => {
                        const val = reportData.expensePart?.totalExpenses?.[m.monthKey] || 0;
                        return (
                          <td key={m.monthKey} className="px-3 py-3 text-right border-r border-rose-500 font-mono text-sm">
                            {formatCurrency(val)}
                          </td>
                        );
                      })}
                      <td className="px-3 py-3 text-right border-r border-rose-500 font-mono text-sm bg-rose-700">
                        {formatCurrency(activeMonths.reduce((s, m) => s + (reportData.expensePart?.totalExpenses?.[m.monthKey] || 0), 0))}
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-sm bg-rose-700">
                        {formatCurrency(activeMonths.reduce((s, m) => s + (reportData.expensePart?.totalExpenses?.[m.monthKey] || 0), 0))}
                      </td>
                    </tr>

                    {/* Spacer */}
                    <tr className="h-6 bg-slate-100/60 border-t border-b border-slate-200">
                      <td colSpan={3 + activeMonths.length + 2}></td>
                    </tr>
                  </>
                )}

                {/* ======================================================== */}
                {/* SECTION 3: CASH FLOW & BALANCE RECONCILIATION */}
                {/* ======================================================== */}
                {(activeSection === 'all' || activeSection === 'reconciliation') && (
                  <>
                    <tr className="bg-indigo-700 text-white sticky top-[41px] z-10 shadow-xs">
                      <td colSpan={3 + activeMonths.length + 2} className="px-4 py-2 font-black text-xs uppercase tracking-wider">
                        3. CASH FLOW & BALANCE RECONCILIATION
                      </td>
                    </tr>

                    {/* Row 1: Difference (Total Income - Total Expenses) */}
                    <tr className="bg-slate-50 font-extrabold text-slate-900 border-b border-slate-200">
                      <td className="px-3 py-2.5 text-center font-mono border-r border-slate-200">A</td>
                      <td className="px-3 py-2.5 border-r border-slate-200"></td>
                      <td className="px-4 py-2.5 border-r border-slate-200 font-black text-slate-900">
                        Difference (Total Income - Total Expenses)
                      </td>
                      {activeMonths.map(m => {
                        const val = reportData.reconciliationPart?.difference?.[m.monthKey] || 0;
                        return (
                          <td
                            key={m.monthKey}
                            className={`px-3 py-2.5 text-right border-r border-slate-200 font-mono font-extrabold ${
                              val >= 0 ? 'text-emerald-700' : 'text-rose-700'
                            }`}
                          >
                            {formatCurrency(val)}
                          </td>
                        );
                      })}
                      <td className="px-3 py-2.5 text-right border-r border-slate-200 font-mono font-black text-slate-900 bg-slate-200/50">
                        {formatCurrency(activeMonths.reduce((s, m) => s + (reportData.reconciliationPart?.difference?.[m.monthKey] || 0), 0))}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-slate-400">—</td>
                    </tr>

                    {/* Row 2: Balance of previous month */}
                    <tr className="bg-white font-semibold text-slate-700 border-b border-slate-200">
                      <td className="px-3 py-2.5 text-center font-mono border-r border-slate-200 text-slate-400">B</td>
                      <td className="px-3 py-2.5 border-r border-slate-200"></td>
                      <td className="px-4 py-2.5 border-r border-slate-200 text-slate-700 font-bold">
                        Balance of previous month (Opening)
                      </td>
                      {activeMonths.map(m => {
                        const val = reportData.reconciliationPart?.balancePreviousMonth?.[m.monthKey] || 0;
                        return (
                          <td key={m.monthKey} className="px-3 py-2.5 text-right border-r border-slate-200 font-mono text-slate-700 font-semibold">
                            {formatCurrency(val)}
                          </td>
                        );
                      })}
                      <td className="px-3 py-2.5 text-right border-r border-slate-200 font-mono text-slate-400 bg-slate-50">—</td>
                      <td className="px-3 py-2.5 text-right font-mono text-slate-400">—</td>
                    </tr>

                    {/* Row 3: Minnor adjustments */}
                    <tr className="bg-white font-semibold text-slate-700 border-b border-slate-200">
                      <td className="px-3 py-2.5 text-center font-mono border-r border-slate-200 text-slate-400">C</td>
                      <td className="px-3 py-2.5 border-r border-slate-200"></td>
                      <td className="px-4 py-2.5 border-r border-slate-200 text-slate-700">
                        Minnor adjustments
                      </td>
                      {activeMonths.map(m => {
                        const val = reportData.reconciliationPart?.adjustments?.[m.monthKey] || 0;
                        return (
                          <td key={m.monthKey} className="px-3 py-2.5 text-right border-r border-slate-200 font-mono text-slate-500">
                            {val !== 0 ? formatCurrency(val) : '0'}
                          </td>
                        );
                      })}
                      <td className="px-3 py-2.5 text-right border-r border-slate-200 font-mono text-slate-500 bg-slate-50">
                        {formatCurrency(activeMonths.reduce((s, m) => s + (reportData.reconciliationPart?.adjustments?.[m.monthKey] || 0), 0))}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-slate-400">—</td>
                    </tr>

                    {/* Row 4: Total Balance (Closing) */}
                    <tr className="bg-slate-900 text-amber-300 font-black border-t-2 border-b-2 border-slate-950 shadow-md">
                      <td className="px-3 py-3 text-center font-mono border-r border-slate-800 text-white">★</td>
                      <td className="px-3 py-3 border-r border-slate-800"></td>
                      <td className="px-4 py-3 border-r border-slate-800 text-sm tracking-wide text-white">
                        TOTAL BALANCE (Closing)
                      </td>
                      {activeMonths.map(m => {
                        const val = reportData.reconciliationPart?.totalBalance?.[m.monthKey] || 0;
                        return (
                          <td key={m.monthKey} className="px-3 py-3 text-right border-r border-slate-800 font-mono text-sm font-extrabold text-amber-300">
                            {formatCurrency(val)}
                          </td>
                        );
                      })}
                      <td className="px-3 py-3 text-right border-r border-slate-800 font-mono text-sm bg-slate-950 text-white">
                        {formatCurrency(kpis.closingBalance)}
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-sm bg-slate-950 text-amber-400">
                        {formatCurrency(kpis.closingBalance)}
                      </td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
