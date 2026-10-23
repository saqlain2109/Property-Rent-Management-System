import React, { useState, useEffect, useMemo } from 'react';
import API from '../services/api';
import { formatCurrency } from '../utils/formatters';
import ReportDrilldownModal from '../components/ReportDrilldownModal';
import MonthlyBatchEntryModal from '../components/MonthlyBatchEntryModal';
import {
  Table, Download, Calendar, Building2, ChevronDown, ChevronRight,
  TrendingUp, Layers, RefreshCw, Search, Filter, Sparkles,
  MousePointerClick, HelpCircle, X
} from 'lucide-react';

export default function MonthlyPropertyEarningsView() {
  const [basis, setBasis] = useState('receiptDate'); // 'receiptDate' | 'allocatedMonth'
  const [selectedYear, setSelectedYear] = useState('all');
  const [startMonth, setStartMonth] = useState('');
  const [endMonth, setEndMonth] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [expandedProperties, setExpandedProperties] = useState({});

  // Drilldown Modal State
  const [drilldownTarget, setDrilldownTarget] = useState(null);
  const [isDrilldownOpen, setIsDrilldownOpen] = useState(false);

  // Batch Month Data Entry Modal State
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);

  const formatMonthLabel = (m) => {
    if (!m) return '';
    const [y, mm] = m.split('-');
    const d = new Date(Date.UTC(Number(y), Number(mm) - 1, 1));
    return d.toLocaleString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
  };

  const fetchEarningsMatrix = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.append('basis', basis);
      if (selectedYear && selectedYear !== 'all') params.append('year', selectedYear);
      if (startMonth) params.append('startMonth', startMonth);
      if (endMonth) params.append('endMonth', endMonth);

      const res = await API.get(`/reports/monthly-property-earnings?${params.toString()}`);
      if (res.data.success) {
        setData(res.data);
      }
    } catch (err) {
      console.error('Failed to fetch monthly property earnings:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEarningsMatrix();
  }, [basis, selectedYear, startMonth, endMonth]);

  const togglePropertyExpand = (propId) => {
    setExpandedProperties(prev => ({
      ...prev,
      [propId]: !prev[propId]
    }));
  };

  const expandAll = () => {
    if (!data?.rows) return;
    const nextState = {};
    data.rows.forEach(r => {
      nextState[r.propertyId] = true;
    });
    setExpandedProperties(nextState);
  };

  const collapseAll = () => {
    setExpandedProperties({});
  };

  const openDrilldown = (opts) => {
    setDrilldownTarget(opts);
    setIsDrilldownOpen(true);
  };

  const handleDownloadExcel = async () => {
    try {
      setDownloading(true);
      const params = new URLSearchParams();
      params.append('basis', basis);
      if (selectedYear && selectedYear !== 'all') params.append('year', selectedYear);
      if (startMonth) params.append('startMonth', startMonth);
      if (endMonth) params.append('endMonth', endMonth);

      const res = await API.get(
        `/reports/export-monthly-property-matrix?${params.toString()}`,
        { responseType: 'blob' }
      );
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      const fileSuffix = (startMonth || endMonth) ? `${startMonth || 'start'}_to_${endMonth || 'end'}` : selectedYear;
      link.setAttribute('download', `Monthly_Property_Earnings_${basis}_${fileSuffix}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      alert('Failed to download Excel report.');
    } finally {
      setDownloading(false);
    }
  };

  // Filter rows by search term
  const filteredRows = useMemo(() => {
    if (!data?.rows) return [];
    if (!searchTerm.trim()) return data.rows;
    const term = searchTerm.toLowerCase();
    return data.rows.filter(r =>
      r.propertyName.toLowerCase().includes(term) ||
      (r.propertyCode && r.propertyCode.toLowerCase().includes(term)) ||
      (r.units && r.units.some(u => u.unitName.toLowerCase().includes(term) || (u.unitCode && u.unitCode.toLowerCase().includes(term))))
    );
  }, [data, searchTerm]);

  // Recalculate column totals for filtered rows
  const activeColTotals = useMemo(() => {
    if (!data?.months) return {};
    const totals = {};
    data.months.forEach(m => { totals[m] = 0; });
    filteredRows.forEach(r => {
      data.months.forEach(m => {
        totals[m] += (r.earnings[m] || 0);
      });
    });
    return totals;
  }, [data, filteredRows]);

  const activeGrandTotal = useMemo(() => {
    return filteredRows.reduce((sum, r) => sum + (r.total || 0), 0);
  }, [filteredRows]);

  // Top earning property
  const topProperty = useMemo(() => {
    if (!data?.rows || data.rows.length === 0) return null;
    return [...data.rows].sort((a, b) => (b.total || 0) - (a.total || 0))[0];
  }, [data]);

  return (
    <div className="space-y-6">
      {/* Top Banner & Control Bar */}
      <div className="bg-white p-5 sm:p-6 rounded-2xl shadow-sm border border-slate-200 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-xl bg-teal-50 text-teal-700 border border-teal-200/60">
                <Table className="w-5 h-5" />
              </span>
              <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">
                Month wise Report
              </h2>
            </div>
            <p className="text-sm text-slate-500 mt-1">
              Consolidated earnings matrix with properties as rows and months as columns, including row & column totals.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => setIsBatchModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white text-sm font-semibold transition-all shadow-sm shadow-teal-600/20"
              title="Select Month & Enter Data"
            >
              <Sparkles className="w-4 h-4" />
              <span>Select Month & Enter Data</span>
            </button>

            <button
              onClick={fetchEarningsMatrix}
              disabled={loading}
              className="p-2.5 rounded-xl border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors disabled:opacity-50"
              title="Refresh Data"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>

            <button
              onClick={handleDownloadExcel}
              disabled={downloading || loading}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-sm font-semibold transition-all shadow-sm shadow-emerald-600/20 disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              <span>{downloading ? 'Exporting...' : 'Export Matrix (.xlsx)'}</span>
            </button>
          </div>
        </div>

        {/* Toolbar: Basis, Starting Month, Ending Month, Year, Search, Expand */}
        <div className="flex flex-col gap-3 pt-3 border-t border-slate-100">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {/* Basis Toggle */}
              <div className="flex items-center bg-slate-100 p-1 rounded-xl text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setBasis('receiptDate')}
                  className={`px-3 py-1.5 rounded-lg transition-all ${
                    basis === 'receiptDate'
                      ? 'bg-white text-teal-700 shadow-sm font-bold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Collection Month (Receipts)
                </button>
                <button
                  type="button"
                  onClick={() => setBasis('allocatedMonth')}
                  className={`px-3 py-1.5 rounded-lg transition-all ${
                    basis === 'allocatedMonth'
                      ? 'bg-white text-teal-700 shadow-sm font-bold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Rent Month (Allocated)
                </button>
              </div>

              {/* Starting Month Filter */}
              <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl text-xs shadow-2xs">
                <Calendar className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                <label className="font-bold text-slate-500 whitespace-nowrap">Starting Month:</label>
                <select
                  value={startMonth}
                  onChange={(e) => {
                    const val = e.target.value;
                    setStartMonth(val);
                    if (val && endMonth && endMonth < val) {
                      setEndMonth(val);
                    }
                  }}
                  className="bg-transparent font-bold text-slate-800 focus:outline-none cursor-pointer"
                >
                  <option value="">Earliest Month</option>
                  {data?.availableMonths?.map(m => (
                    <option key={m} value={m}>
                      {formatMonthLabel(m)} ({m})
                    </option>
                  ))}
                </select>
              </div>

              {/* Ending Month Filter */}
              <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl text-xs shadow-2xs">
                <Calendar className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                <label className="font-bold text-slate-500 whitespace-nowrap">Ending Month:</label>
                <select
                  value={endMonth}
                  onChange={(e) => {
                    const val = e.target.value;
                    setEndMonth(val);
                    if (val && startMonth && startMonth > val) {
                      setStartMonth(val);
                    }
                  }}
                  className="bg-transparent font-bold text-slate-800 focus:outline-none cursor-pointer"
                >
                  <option value="">Latest Month</option>
                  {data?.availableMonths?.map(m => (
                    <option key={m} value={m}>
                      {formatMonthLabel(m)} ({m})
                    </option>
                  ))}
                </select>
              </div>

              {/* Year Selector */}
              <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-2.5 py-1.5 rounded-xl text-xs">
                <span className="text-slate-400 font-medium">Year:</span>
                <select
                  value={selectedYear}
                  onChange={(e) => {
                    setSelectedYear(e.target.value);
                    if (e.target.value !== 'all') {
                      setStartMonth('');
                      setEndMonth('');
                    }
                  }}
                  className="bg-transparent font-semibold text-slate-700 focus:outline-none cursor-pointer"
                >
                  <option value="all">All Years</option>
                  {data?.availableYears?.map(y => (
                    <option key={y} value={y}>Year {y}</option>
                  ))}
                </select>
              </div>

              {/* Reset Filters Button */}
              {(startMonth || endMonth || selectedYear !== 'all') && (
                <button
                  type="button"
                  onClick={() => {
                    setStartMonth('');
                    setEndMonth('');
                    setSelectedYear('all');
                  }}
                  className="px-2.5 py-1 text-xs font-bold text-rose-600 hover:text-rose-700 hover:bg-rose-50 border border-rose-200/60 rounded-xl transition-colors flex items-center gap-1"
                  title="Clear month range and show all months"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Reset Filter</span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              {/* Search Box */}
              <div className="relative flex-1 sm:w-56">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search property or unit..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                />
              </div>

              {/* Expand / Collapse Toggle */}
              <button
                onClick={() => {
                  const isAnyExpanded = Object.values(expandedProperties).some(Boolean);
                  if (isAnyExpanded) collapseAll();
                  else expandAll();
                }}
                className="px-3 py-1.5 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors whitespace-nowrap"
              >
                {Object.values(expandedProperties).some(Boolean) ? 'Collapse Units' : 'Expand Units'}
              </button>
            </div>
          </div>

          {/* Active Range Indicator Pill */}
          {(startMonth || endMonth) && (
            <div className="flex items-center justify-between p-2.5 rounded-xl bg-teal-50/90 border border-teal-200 text-xs text-teal-900 font-medium">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-teal-600 shrink-0" />
                <span>
                  Showing <strong>{data?.months?.length || 0}</strong> month(s) between <strong>{startMonth ? `${formatMonthLabel(startMonth)} (${startMonth})` : 'Earliest'}</strong> and <strong>{endMonth ? `${formatMonthLabel(endMonth)} (${endMonth})` : 'Latest'}</strong>
                </span>
              </div>
              <button
                onClick={() => {
                  setStartMonth('');
                  setEndMonth('');
                }}
                className="text-[11px] font-bold text-teal-700 hover:text-teal-900 hover:underline"
              >
                Show All Months
              </button>
            </div>
          )}
        </div>

        {/* Drill-down Interactive Hint Banner */}
        <div className="flex items-center gap-2 p-2.5 rounded-xl bg-teal-50/70 border border-teal-200/50 text-xs text-teal-900">
          <MousePointerClick className="w-4 h-4 text-teal-600 shrink-0" />
          <span>
            <strong>Interactive Drill-Down:</strong> Click on any amount in the table to open its transaction records, edit or correct amounts, and see the matrix update automatically.
          </span>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Grand Total Earnings</span>
            <span className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
              <TrendingUp className="w-4 h-4" />
            </span>
          </div>
          <p className="text-2xl font-black text-slate-900 mt-2">
            {formatCurrency(activeGrandTotal)}
          </p>
          <p className="text-xs text-slate-400 mt-1">
            Across {data?.months?.length || 0} active month column{data?.months?.length === 1 ? '' : 's'}
          </p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Properties</span>
            <span className="p-2 rounded-xl bg-teal-50 text-teal-600">
              <Building2 className="w-4 h-4" />
            </span>
          </div>
          <p className="text-2xl font-black text-slate-900 mt-2">
            {filteredRows.length}
          </p>
          <p className="text-xs text-slate-400 mt-1">
            {filteredRows.reduce((acc, r) => acc + (r.units?.length || 0), 0)} sub-units recorded
          </p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Top Earner Property</span>
            <span className="p-2 rounded-xl bg-blue-50 text-blue-600">
              <Sparkles className="w-4 h-4" />
            </span>
          </div>
          <p className="text-base font-extrabold text-slate-900 mt-2 truncate" title={topProperty?.propertyName || '—'}>
            {topProperty?.propertyName || '—'}
          </p>
          <p className="text-xs font-semibold text-emerald-600 mt-1">
            {formatCurrency(topProperty?.total || 0)} total
          </p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Accounting Basis</span>
            <span className="p-2 rounded-xl bg-purple-50 text-purple-600">
              <Layers className="w-4 h-4" />
            </span>
          </div>
          <p className="text-base font-extrabold text-slate-900 mt-2">
            {basis === 'receiptDate' ? 'Cash Received' : 'Rent Accrual'}
          </p>
          <p className="text-xs text-slate-400 mt-1">
            {basis === 'receiptDate' ? 'Grouped by payment receipt date' : 'Grouped by allocated rent month'}
          </p>
        </div>
      </div>

      {/* The Matrix Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="py-20 text-center">
            <RefreshCw className="w-8 h-8 text-teal-600 animate-spin mx-auto mb-3" />
            <p className="text-sm font-semibold text-slate-600">Loading Monthly Property Matrix...</p>
          </div>
        ) : !data || data.months.length === 0 ? (
          <div className="py-16 text-center text-slate-400 space-y-2">
            <Table className="w-10 h-10 mx-auto text-slate-300" />
            <p className="font-semibold text-slate-600">No earning records found for selected period.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-900 text-white font-bold tracking-wider uppercase text-[11px] border-b border-slate-800">
                  <th className="py-3.5 px-3 w-12 text-center text-slate-400">#</th>
                  <th className="py-3.5 px-4 min-w-[240px] text-slate-200">Property / Partition</th>
                  <th className="py-3.5 px-3 min-w-[130px] text-slate-400">Code / Type</th>
                  {data.monthLabels.map(m => (
                    <th key={m.key} className="py-3.5 px-3 min-w-[110px] text-right font-extrabold text-emerald-300">
                      {m.label}
                    </th>
                  ))}
                  <th className="py-3.5 px-4 min-w-[130px] text-right bg-slate-800 text-white font-black border-l border-slate-700">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRows.map((row, idx) => {
                  const isExpanded = !!expandedProperties[row.propertyId];
                  const hasUnits = row.units && row.units.length > 0;

                  return (
                    <React.Fragment key={row.propertyId}>
                      {/* Property Row */}
                      <tr className="hover:bg-teal-50/40 transition-colors group">
                        <td className="py-3.5 px-3 text-center text-slate-400 font-bold">
                          {idx + 1}
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2">
                            {hasUnits ? (
                              <button
                                type="button"
                                onClick={() => togglePropertyExpand(row.propertyId)}
                                className="p-1 rounded hover:bg-slate-200/70 text-slate-500 hover:text-slate-800 transition-colors"
                                title={isExpanded ? 'Collapse units' : 'Expand units'}
                              >
                                {isExpanded ? (
                                  <ChevronDown className="w-3.5 h-3.5 text-teal-600" />
                                ) : (
                                  <ChevronRight className="w-3.5 h-3.5" />
                                )}
                              </button>
                            ) : (
                              <span className="w-5" />
                            )}
                            <div>
                              <p className="font-extrabold text-slate-900 text-sm group-hover:text-teal-900">
                                {row.propertyName}
                              </p>
                              <p className="text-[10px] text-slate-400">
                                {row.units?.length || 0} unit{(row.units?.length === 1) ? '' : 's'}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="py-3.5 px-3">
                          <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-mono text-[10px] font-semibold border border-slate-200">
                            {row.propertyCode}
                          </span>
                        </td>

                        {/* Month Columns */}
                        {data.months.map(m => {
                          const val = row.earnings[m] || 0;
                          return (
                            <td
                              key={m}
                              onClick={() => {
                                if (val > 0) {
                                  openDrilldown({
                                    propertyId: row.propertyId,
                                    month: m,
                                    title: `${row.propertyName} · ${data.monthLabels.find(l => l.key === m)?.label || m}`,
                                    expectedAmount: val
                                  });
                                }
                              }}
                              className={`py-3.5 px-3 text-right font-medium transition-colors ${
                                val > 0
                                  ? 'cursor-pointer hover:bg-teal-100/60 group/cell'
                                  : ''
                              }`}
                              title={val > 0 ? `Click to view & edit ${row.propertyName} transactions in ${m}` : undefined}
                            >
                              {val > 0 ? (
                                <span className="font-bold text-slate-800 group-hover/cell:text-teal-700 group-hover/cell:underline decoration-teal-500/50 underline-offset-2">
                                  {formatCurrency(val)}
                                </span>
                              ) : (
                                <span className="text-slate-300 font-normal">—</span>
                              )}
                            </td>
                          );
                        })}

                        {/* Property Total Column (Last Column) */}
                        <td
                          onClick={() => {
                            if (row.total > 0) {
                              openDrilldown({
                                propertyId: row.propertyId,
                                year: selectedYear,
                                startMonth,
                                endMonth,
                                title: `${row.propertyName} · Total (${startMonth ? formatMonthLabel(startMonth) : 'Earliest'} to ${endMonth ? formatMonthLabel(endMonth) : 'Latest'})`,
                                expectedAmount: row.total
                              });
                            }
                          }}
                          className={`py-3.5 px-4 text-right bg-slate-50/80 font-black text-emerald-700 text-sm border-l border-slate-100 transition-colors ${
                            row.total > 0
                              ? 'cursor-pointer hover:bg-emerald-100/60 hover:underline decoration-emerald-500/50 underline-offset-2'
                              : ''
                          }`}
                          title={row.total > 0 ? `Click to view & edit all transactions for ${row.propertyName}` : undefined}
                        >
                          {formatCurrency(row.total)}
                        </td>
                      </tr>

                      {/* Sub-Unit Rows (when expanded) */}
                      {isExpanded && row.units?.map(u => (
                        <tr key={u.unitId} className="bg-slate-50/60 hover:bg-slate-100/60 transition-colors text-[11px]">
                          <td className="py-2.5 px-3 text-center text-slate-300">
                            ↳
                          </td>
                          <td className="py-2.5 px-4 pl-10">
                            <div className="flex items-center gap-2">
                              <span className="w-1.5 h-1.5 rounded-full bg-teal-500 shrink-0" />
                              <span className="font-semibold text-slate-700">{u.unitName}</span>
                            </div>
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="text-slate-400 font-mono text-[10px]">
                              {u.unitCode}
                            </span>
                          </td>

                          {data.months.map(m => {
                            const uVal = u.earnings[m] || 0;
                            return (
                              <td
                                key={m}
                                onClick={() => {
                                  if (uVal > 0) {
                                    openDrilldown({
                                      unitId: u.unitId,
                                      month: m,
                                      title: `${u.unitName} (${row.propertyName}) · ${data.monthLabels.find(l => l.key === m)?.label || m}`,
                                      expectedAmount: uVal
                                    });
                                  }
                                }}
                                className={`py-2.5 px-3 text-right text-slate-600 transition-colors ${
                                  uVal > 0 ? 'cursor-pointer hover:bg-teal-100/70 group/cell' : ''
                                }`}
                                title={uVal > 0 ? `Click to view & edit ${u.unitName} transactions in ${m}` : undefined}
                              >
                                {uVal > 0 ? (
                                  <span className="group-hover/cell:text-teal-800 group-hover/cell:underline font-semibold">
                                    {formatCurrency(uVal)}
                                  </span>
                                ) : (
                                  <span className="text-slate-300">—</span>
                                )}
                              </td>
                            );
                          })}

                          <td
                            onClick={() => {
                              if (u.total > 0) {
                                openDrilldown({
                                  unitId: u.unitId,
                                  year: selectedYear,
                                  startMonth,
                                  endMonth,
                                  title: `${u.unitName} (${row.propertyName}) · Total (${startMonth ? formatMonthLabel(startMonth) : 'Earliest'} to ${endMonth ? formatMonthLabel(endMonth) : 'Latest'})`,
                                  expectedAmount: u.total
                                });
                              }
                            }}
                            className={`py-2.5 px-4 text-right font-bold text-slate-700 bg-slate-100/60 border-l border-slate-100 transition-colors ${
                              u.total > 0 ? 'cursor-pointer hover:bg-teal-100/60 hover:underline' : ''
                            }`}
                            title={u.total > 0 ? `Click to view & edit all transactions for ${u.unitName}` : undefined}
                          >
                            {formatCurrency(u.total)}
                          </td>
                        </tr>
                      ))}
                    </React.Fragment>
                  );
                })}
              </tbody>

              {/* Total Row (Last Row) */}
              <tfoot>
                <tr className="bg-slate-900 text-white font-extrabold border-t-2 border-slate-800">
                  <td className="py-4 px-3 text-center text-slate-400">Σ</td>
                  <td className="py-4 px-4 text-sm tracking-wide text-white font-black" colSpan={2}>
                    TOTAL EARNINGS
                  </td>

                  {/* Column Totals */}
                  {data.months.map(m => {
                    const colSum = activeColTotals[m] || 0;
                    return (
                      <td
                        key={m}
                        onClick={() => {
                          if (colSum > 0) {
                            openDrilldown({
                              month: m,
                              title: `All Properties Portfolio · ${data.monthLabels.find(l => l.key === m)?.label || m}`,
                              expectedAmount: colSum
                            });
                          }
                        }}
                        className={`py-4 px-3 text-right font-black text-emerald-300 text-xs transition-colors ${
                          colSum > 0 ? 'cursor-pointer hover:bg-slate-800 hover:text-white' : ''
                        }`}
                        title={colSum > 0 ? `Click to view & edit all transactions across all properties in ${m}` : undefined}
                      >
                        {formatCurrency(colSum)}
                      </td>
                    );
                  })}

                  {/* Grand Total (Bottom-Right Cell) */}
                  <td
                    onClick={() => {
                      if (activeGrandTotal > 0) {
                        openDrilldown({
                          year: selectedYear,
                          startMonth,
                          endMonth,
                          title: `Grand Total · All Properties (${startMonth ? formatMonthLabel(startMonth) : 'Earliest'} to ${endMonth ? formatMonthLabel(endMonth) : 'Latest'})`,
                          expectedAmount: activeGrandTotal
                        });
                      }
                    }}
                    className="py-4 px-4 text-right bg-slate-950 border-l border-slate-800 cursor-pointer hover:bg-slate-900 transition-colors"
                    title="Click to view & edit all portfolio transactions across all months"
                  >
                    <span className="inline-block px-3 py-1 rounded-lg bg-emerald-500 text-slate-950 font-black text-sm shadow-sm hover:scale-105 transition-transform">
                      {formatCurrency(activeGrandTotal)}
                    </span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Informative Footer Note */}
      <div className="p-4 rounded-xl bg-slate-100/80 border border-slate-200 text-xs text-slate-600 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <p>
          <strong className="text-slate-800">Note:</strong> Rows represent properties, columns represent months, and the last column and row provide live audited totals. Click any amount to drill down and correct transaction records.
        </p>
        <span className="text-[11px] font-semibold text-slate-500 whitespace-nowrap">
          {filteredRows.length} Properties Displayed · Grand Total {formatCurrency(activeGrandTotal)}
        </span>
      </div>

      {/* Drill-down & Record Correction Modal */}
      <ReportDrilldownModal
        isOpen={isDrilldownOpen}
        onClose={() => setIsDrilldownOpen(false)}
        target={drilldownTarget}
        basis={basis}
        onRecordUpdated={fetchEarningsMatrix}
      />

      {/* Monthly Batch Data Entry Modal */}
      <MonthlyBatchEntryModal
        isOpen={isBatchModalOpen}
        onClose={() => setIsBatchModalOpen(false)}
        initialMonth="2024-03"
        onDataSaved={fetchEarningsMatrix}
      />
    </div>
  );
}
