import React, { useState, useEffect, useMemo } from 'react';
import API from '../services/api';
import { formatCurrency } from '../utils/formatters';
import ReportDrilldownModal from '../components/ReportDrilldownModal';
import MonthlyBatchEntryModal from '../components/MonthlyBatchEntryModal';
import {
  Table, Download, Calendar, Building2, ChevronDown, ChevronRight,
  TrendingUp, TrendingDown, Layers, RefreshCw, Search, Filter, Sparkles,
  MousePointerClick, HelpCircle, X, ArrowUp, ArrowDown, ArrowUpDown,
  Tag, Receipt, DollarSign
} from 'lucide-react';
import ApexToolbar from '../components/ApexToolbar';
import { cycleThreeStateSort, evaluateFilterRule } from '../utils/tableUtils';
import { 
  useFrozenColumns, 
  getFrozenColumnStyle, 
  useResizableColumns, 
  ResizeHandle, 
  ColumnHeaderCell, 
  useTableAutoWrap 
} from '../components/ColumnManager';

export default function MonthlyPropertyEarningsView() {
  const [basis, setBasis] = useState('receiptDate'); // 'receiptDate' | 'allocatedMonth'
  const [selectedYear, setSelectedYear] = useState('2026');
  const [startMonth, setStartMonth] = useState('');
  const [endMonth, setEndMonth] = useState('');
  const [selectedPropertyFilter, setSelectedPropertyFilter] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [expandedProperties, setExpandedProperties] = useState({});
  const [expandedExpenseProperties, setExpandedExpenseProperties] = useState({});
  const [isCommonExpensesExpanded, setIsCommonExpensesExpanded] = useState(false);

  // Drilldown Modal State
  const [drilldownTarget, setDrilldownTarget] = useState(null);
  const [isDrilldownOpen, setIsDrilldownOpen] = useState(false);

  // Batch Month Data Entry Modal State
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);

  // APEX Toolbar & Global Grid Sort State
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: null });
  const [isHeaderSticky, setIsHeaderSticky] = useState(true);
  const [frozenColumnCount, setFrozenColumnCount] = useFrozenColumns('month_wise_report_freeze_v2', 0);
  const [activeViewId, setActiveViewId] = useState(null);
  const [reportFilters, setReportFilters] = useState([]);
  const [visibleColumns, setVisibleColumns] = useState([]);

  const default12Months = useMemo(() => {
    const yr = selectedYear !== 'all' ? selectedYear : '2026';
    return Array.from({ length: 12 }, (_, i) => {
      const num = String(i + 1).padStart(2, '0');
      const d = new Date(Date.UTC(Number(yr), i, 1));
      return {
        key: `${yr}-${num}`,
        label: d.toLocaleString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' })
      };
    });
  }, [selectedYear]);

  const effectiveMonthLabels = useMemo(() => {
    return (data?.monthLabels && data.monthLabels.length > 0)
      ? data.monthLabels
      : default12Months;
  }, [data, default12Months]);

  const defaultWidths = useMemo(() => {
    const map = {
      index: 48,
      property: 260,
      total: 135
    };
    effectiveMonthLabels.forEach(m => {
      map[m.key] = 115;
    });
    return map;
  }, [effectiveMonthLabels]);

  const {
    columnWidths,
    handleResizeStart,
    resetColumnWidths,
    hasCustomWidths
  } = useResizableColumns('month_wise_report_widths_v2', defaultWidths);

  const { autoWrap } = useTableAutoWrap();
  const [columnFilters, setColumnFilters] = useState({});

  const handleApplyColumnFilter = (colId, ruleOrValues) => {
    setColumnFilters(prev => ({ ...prev, [colId]: ruleOrValues }));
    setCurrentPage(1);
  };

  const handleClearColumnFilter = (colId) => {
    setColumnFilters(prev => {
      const next = { ...prev };
      delete next[colId];
      return next;
    });
    setCurrentPage(1);
  };

  const uniquePropertyNames = useMemo(() => {
    if (!data?.rows) return [];
    return data.rows.map(r => r.propertyName).filter(Boolean);
  }, [data]);

  const displayMonthCols = useMemo(() => {
    return effectiveMonthLabels.filter(m => visibleColumns.length === 0 || visibleColumns.includes(m.key));
  }, [effectiveMonthLabels, visibleColumns]);

  // Code/Type column removed as requested
  const columnsDef = useMemo(() => {
    const list = [
      { id: 'index', label: '#', defaultVisible: true },
      { id: 'property', label: 'Property / Partition', defaultVisible: true },
    ];
    effectiveMonthLabels.forEach(m => {
      list.push({ id: m.key, label: m.label, defaultVisible: true });
    });
    list.push({ id: 'total', label: 'Total', defaultVisible: true });
    return list;
  }, [effectiveMonthLabels]);

  useEffect(() => {
    if (columnsDef.length > 0) {
      setVisibleColumns(columnsDef.map(c => c.id));
    }
  }, [columnsDef]);

  const handleSort = (colKey) => {
    setSortConfig(prev => cycleThreeStateSort(prev, colKey));
  };

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
      if (selectedPropertyFilter) params.append('propertyId', selectedPropertyFilter);

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

  const toggleExpensePropertyExpand = (propId) => {
    setExpandedExpenseProperties(prev => ({
      ...prev,
      [propId]: !prev[propId]
    }));
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
      if (selectedPropertyFilter) params.append('propertyId', selectedPropertyFilter);

      const res = await API.get(
        `/reports/export-monthly-property-matrix?${params.toString()}`,
        { responseType: 'blob' }
      );
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      const fileSuffix = (startMonth || endMonth) ? `${startMonth || 'start'}_to_${endMonth || 'end'}` : selectedYear;
      link.setAttribute('download', `Monthly_Property_Matrix_${basis}_${fileSuffix}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      alert('Failed to download Excel report.');
    } finally {
      setDownloading(false);
    }
  };

  // Filter rows for Earnings (by Search, Property Filter, APEX filters, and Column Filters)
  const filteredRows = useMemo(() => {
    if (!data?.rows) return [];
    let rows = data.rows;
    if (selectedPropertyFilter) {
      rows = rows.filter(r => String(r.propertyId) === String(selectedPropertyFilter));
    }
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      rows = rows.filter(r =>
        r.propertyName.toLowerCase().includes(term) ||
        r.units?.some(u => u.unitName.toLowerCase().includes(term))
      );
    }
    if (reportFilters.length > 0) {
      rows = rows.filter(r => reportFilters.every(f => evaluateFilterRule(r, f)));
    }
    // Column-level filters
    if (Object.keys(columnFilters).length > 0) {
      for (const [colId, filterVal] of Object.entries(columnFilters)) {
        if (!filterVal) continue;
        if (colId === 'property') {
          if (Array.isArray(filterVal) && filterVal.length > 0) {
            rows = rows.filter(r => filterVal.includes(r.propertyName));
          } else if (typeof filterVal === 'string' && filterVal.trim()) {
            rows = rows.filter(r => r.propertyName.toLowerCase().includes(filterVal.toLowerCase()));
          } else if (filterVal.value) {
            rows = rows.filter(r => r.propertyName.toLowerCase().includes(filterVal.value.toLowerCase()));
          }
        } else if (colId === 'total') {
          const num = Number(typeof filterVal === 'object' ? filterVal.value : filterVal);
          if (!isNaN(num)) {
            rows = rows.filter(r => (r.total || 0) >= num);
          }
        } else {
          rows = rows.filter(r => (r.earnings?.[colId] || 0) > 0);
        }
      }
    }
    return rows;
  }, [data, selectedPropertyFilter, searchTerm, reportFilters, columnFilters]);

  // Filter rows for Expenses (by Search, Property Filter, Column Filters)
  const filteredExpenseRows = useMemo(() => {
    if (!data?.expenseRows) return [];
    let rows = data.expenseRows;
    if (selectedPropertyFilter) {
      rows = rows.filter(r => String(r.propertyId) === String(selectedPropertyFilter));
    }
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      rows = rows.filter(r =>
        r.propertyName.toLowerCase().includes(term) ||
        r.categories?.some(c => c.category.toLowerCase().includes(term))
      );
    }
    // Column-level filters for expenses
    if (Object.keys(columnFilters).length > 0) {
      for (const [colId, filterVal] of Object.entries(columnFilters)) {
        if (!filterVal) continue;
        if (colId === 'property') {
          if (Array.isArray(filterVal) && filterVal.length > 0) {
            rows = rows.filter(r => filterVal.includes(r.propertyName));
          } else if (typeof filterVal === 'string' && filterVal.trim()) {
            rows = rows.filter(r => r.propertyName.toLowerCase().includes(filterVal.toLowerCase()));
          } else if (filterVal.value) {
            rows = rows.filter(r => r.propertyName.toLowerCase().includes(filterVal.value.toLowerCase()));
          }
        } else if (colId === 'total') {
          const num = Number(typeof filterVal === 'object' ? filterVal.value : filterVal);
          if (!isNaN(num)) {
            rows = rows.filter(r => (r.total || 0) >= num);
          }
        } else {
          rows = rows.filter(r => (r.expenses?.[colId] || 0) > 0);
        }
      }
    }
    return rows;
  }, [data, selectedPropertyFilter, searchTerm, columnFilters]);

  // Sorted Rent Rows
  const sortedRows = useMemo(() => {
    let rows = [...filteredRows];
    if (!sortConfig.key || !sortConfig.direction) return rows;

    const { key, direction } = sortConfig;
    const mult = direction === 'asc' ? 1 : -1;

    return rows.sort((a, b) => {
      if (key === 'property') {
        return mult * (a.propertyName || '').localeCompare(b.propertyName || '');
      }
      if (key === 'total') {
        return mult * ((a.total || 0) - (b.total || 0));
      }
      if (key === 'index') {
        return mult * ((a.displayOrder || 0) - (b.displayOrder || 0));
      }
      const valA = a.earnings?.[key] || 0;
      const valB = b.earnings?.[key] || 0;
      return mult * (valA - valB);
    });
  }, [filteredRows, sortConfig]);

  const isAllRows = rowsPerPage === 'All';
  const effectivePageSize = isAllRows ? sortedRows.length || 1 : Number(rowsPerPage);
  const totalPages = Math.ceil(sortedRows.length / effectivePageSize) || 1;
  const paginatedRows = useMemo(() => {
    if (isAllRows) return sortedRows;
    const start = (currentPage - 1) * effectivePageSize;
    return sortedRows.slice(start, start + effectivePageSize);
  }, [sortedRows, isAllRows, currentPage, effectivePageSize]);

  // Active Rent Column Totals & Grand Total Earnings
  const activeColTotals = useMemo(() => {
    const months = (data?.months && data.months.length > 0) ? data.months : effectiveMonthLabels.map(l => l.key);
    const totals = {};
    months.forEach(m => { totals[m] = 0; });
    filteredRows.forEach(r => {
      months.forEach(m => {
        totals[m] += (r.earnings[m] || 0);
      });
    });
    return totals;
  }, [data, filteredRows, effectiveMonthLabels]);

  const activeGrandTotal = useMemo(() => {
    return filteredRows.reduce((sum, r) => sum + (r.total || 0), 0);
  }, [filteredRows]);

  // Active Expense Column Totals & Grand Total Expenses
  const activeExpenseColTotals = useMemo(() => {
    const months = (data?.months && data.months.length > 0) ? data.months : effectiveMonthLabels.map(l => l.key);
    const totals = {};
    months.forEach(m => { totals[m] = 0; });
    filteredExpenseRows.forEach(r => {
      months.forEach(m => {
        totals[m] += (r.expenses[m] || 0);
      });
    });
    if (!selectedPropertyFilter && data?.commonExpenseData?.expenses) {
      months.forEach(m => {
        totals[m] += (data.commonExpenseData.expenses[m] || 0);
      });
    }
    return totals;
  }, [data, filteredExpenseRows, selectedPropertyFilter, effectiveMonthLabels]);

  const activeGrandTotalExpenses = useMemo(() => {
    const propSum = filteredExpenseRows.reduce((sum, r) => sum + (r.total || 0), 0);
    const commonSum = (!selectedPropertyFilter && data?.commonExpenseData?.total) ? data.commonExpenseData.total : 0;
    return propSum + commonSum;
  }, [filteredExpenseRows, selectedPropertyFilter, data]);

  const activeGrandTotalDifference = useMemo(() => {
    return activeGrandTotal - activeGrandTotalExpenses;
  }, [activeGrandTotal, activeGrandTotalExpenses]);

  return (
    <div className="space-y-2.5 pb-2">
      {/* Top Banner & Control Bar */}
      {/* Organized One-Line Filter Strip */}
      <div className="bg-white p-2.5 rounded-2xl shadow-xs border border-slate-200 flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-2">
          {/* Starting Month Filter */}
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-2.5 py-1.5 rounded-xl text-xs shadow-2xs">
            <Calendar className="w-3.5 h-3.5 text-teal-600 shrink-0" />
            <label className="font-bold text-slate-500 whitespace-nowrap">From:</label>
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
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-2.5 py-1.5 rounded-xl text-xs shadow-2xs">
            <Calendar className="w-3.5 h-3.5 text-teal-600 shrink-0" />
            <label className="font-bold text-slate-500 whitespace-nowrap">To:</label>
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

          {/* Quick Year Selector */}
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-2.5 py-1.5 rounded-xl text-xs shadow-2xs">
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
              className="bg-transparent font-bold text-slate-700 focus:outline-none cursor-pointer"
            >
              <option value="all">All Years</option>
              {data?.availableYears?.map(y => (
                <option key={y} value={y}>Year {y}</option>
              ))}
            </select>
          </div>

          {/* Property Filter Dropdown */}
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-2.5 py-1.5 rounded-xl text-xs shadow-2xs">
            <Building2 className="w-3.5 h-3.5 text-teal-600 shrink-0" />
            <label className="font-bold text-slate-500 whitespace-nowrap">Property:</label>
            <select
              value={selectedPropertyFilter}
              onChange={(e) => {
                setSelectedPropertyFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="bg-transparent font-bold text-slate-800 focus:outline-none cursor-pointer max-w-[200px] truncate"
            >
              <option value="">All Properties ({data?.rows?.length || 0})</option>
              {data?.rows?.map(r => (
                <option key={r.propertyId} value={r.propertyId}>
                  {r.propertyName}
                </option>
              ))}
            </select>
          </div>

          {/* Reset Filters Button */}
          {(startMonth || endMonth || selectedYear !== 'all' || selectedPropertyFilter) && (
            <button
              type="button"
              onClick={() => {
                setStartMonth('');
                setEndMonth('');
                setSelectedYear('all');
                setSelectedPropertyFilter('');
              }}
              className="px-2.5 py-1.5 text-xs font-bold text-rose-600 hover:text-rose-700 hover:bg-rose-50 border border-rose-200/60 rounded-xl transition-colors flex items-center gap-1 cursor-pointer"
              title="Clear all filters"
            >
              <X className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>
          )}
        </div>

        {/* Refresh Button */}
        <div className="flex items-center gap-2">
          <button
            onClick={fetchEarningsMatrix}
            disabled={loading}
            className="p-2 rounded-xl border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors disabled:opacity-50 cursor-pointer shadow-2xs"
            title="Refresh Matrix"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Sleek Compact KPI Summary Strip (Replaces bulky cards to remove blank space) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <div className="bg-white px-3 py-2 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total Rent Earnings</span>
            <span className="text-base font-black text-emerald-700">{formatCurrency(activeGrandTotal)}</span>
          </div>
          <span className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600">
            <TrendingUp className="w-3.5 h-3.5" />
          </span>
        </div>

        <div className="bg-white px-3 py-2 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total Expenses</span>
            <span className="text-base font-black text-rose-700">{formatCurrency(activeGrandTotalExpenses)}</span>
          </div>
          <span className="p-1.5 rounded-lg bg-rose-50 text-rose-600">
            <TrendingDown className="w-3.5 h-3.5" />
          </span>
        </div>

        <div className="bg-white px-3 py-2 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Net Cash Flow (Δ)</span>
            <span className={`text-base font-black ${activeGrandTotalDifference >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
              {activeGrandTotalDifference >= 0 ? `+ ${formatCurrency(activeGrandTotalDifference)}` : `- ${formatCurrency(Math.abs(activeGrandTotalDifference))}`}
            </span>
          </div>
          <span className={`p-1.5 rounded-lg ${activeGrandTotalDifference >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
            <DollarSign className="w-3.5 h-3.5" />
          </span>
        </div>

        <div className="bg-white px-3 py-2 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Accounting Basis</span>
            <span className="text-xs font-black text-slate-800">
              {basis === 'receiptDate' ? 'Cash Received' : 'Rent Accrual'}
            </span>
          </div>
          <span className="p-1.5 rounded-lg bg-purple-50 text-purple-600">
            <Layers className="w-3.5 h-3.5" />
          </span>
        </div>
      </div>

      {/* The Matrix Table */}
      <div className="space-y-2">
        {loading ? (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 py-20 text-center">
            <RefreshCw className="w-8 h-8 text-teal-600 animate-spin mx-auto mb-3" />
            <p className="text-sm font-semibold text-slate-600">Loading Month wise Report Matrix...</p>
          </div>
        ) : !data || !data.rows || data.rows.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 py-16 text-center text-slate-400 space-y-2">
            <Table className="w-10 h-10 mx-auto text-slate-300" />
            <p className="font-semibold text-slate-600">No properties or earning records found for selected period.</p>
          </div>
        ) : (
          <div className="space-y-2">
            <ApexToolbar
              search={searchTerm}
              onSearchChange={(val) => { setSearchTerm(val); setCurrentPage(1); }}
              rowsPerPage={rowsPerPage}
              onRowsPerPageChange={(val) => { setRowsPerPage(val); setCurrentPage(1); }}
              availableRowsOptions={[5, 10, 25, 50, 100, 'All']}
              columns={columnsDef}
              visibleColumns={visibleColumns.length > 0 ? visibleColumns : columnsDef.map(c => c.id)}
              onChangeVisibleColumns={setVisibleColumns}
              columnWidths={columnWidths}
              onResetWidths={resetColumnWidths}
              filters={reportFilters}
              onFiltersChange={(flts) => { setReportFilters(flts); setCurrentPage(1); }}
              sortConfig={sortConfig}
              onSortChange={setSortConfig}
              isHeaderSticky={isHeaderSticky}
              onToggleHeaderSticky={setIsHeaderSticky}
              frozenColumnCount={frozenColumnCount}
              onFrozenColumnCountChange={setFrozenColumnCount}
              activeViewName={activeViewId}
              onViewChange={setActiveViewId}
              onExport={handleDownloadExcel}
              storageKey="month_wise_report_v2"
            />

          {/* Table Container with Freeze Header Scroll Constraint */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col relative z-10">
            <div className={`overflow-x-auto overflow-y-auto relative ${
              isHeaderSticky ? 'h-[calc(100vh-210px)] min-h-[550px]' : 'min-h-[550px]'
            }`}>
              <table className="w-full text-left border-separate border-spacing-0 text-xs">
              <thead className={isHeaderSticky ? 'sticky top-0 z-20 shadow-md bg-slate-900' : ''}>
                <tr className="bg-slate-900 text-white font-bold tracking-wider uppercase text-[11px] border-b border-slate-800 select-none">
                  {(visibleColumns.length === 0 || visibleColumns.includes('index')) && (
                    <ColumnHeaderCell
                      colId="index"
                      label="#"
                      align="center"
                      width={columnWidths['index']}
                      minWidth={40}
                      isSortable={true}
                      sortConfig={sortConfig}
                      onSort={handleSort}
                      isFilterable={false}
                      onResizeStart={handleResizeStart}
                      isFrozen={frozenColumnCount > 0}
                      frozenStyle={{
                        ...getFrozenColumnStyle(0, frozenColumnCount, visibleColumns, columnWidths, true),
                        backgroundColor: '#0f172a',
                        zIndex: isHeaderSticky ? (frozenColumnCount > 0 ? 25 : 20) : (frozenColumnCount > 0 ? 25 : undefined),
                        borderBottom: '2px solid #334155'
                      }}
                      isHeaderSticky={isHeaderSticky}
                      theme="dark"
                      style={{ borderBottom: '2px solid #334155' }}
                    />
                  )}
                  {(visibleColumns.length === 0 || visibleColumns.includes('property')) && (
                    <ColumnHeaderCell
                      colId="property"
                      label="Property / Partition"
                      align="left"
                      width={columnWidths['property']}
                      minWidth={180}
                      isSortable={true}
                      sortConfig={sortConfig}
                      onSort={handleSort}
                      isFilterable={true}
                      activeFilter={columnFilters['property']}
                      onApplyFilter={handleApplyColumnFilter}
                      onClearFilter={handleClearColumnFilter}
                      uniqueValues={uniquePropertyNames}
                      onResizeStart={handleResizeStart}
                      isFrozen={frozenColumnCount > 1}
                      frozenStyle={{
                        ...getFrozenColumnStyle(1, frozenColumnCount, visibleColumns, columnWidths, true),
                        backgroundColor: '#0f172a',
                        zIndex: isHeaderSticky ? (frozenColumnCount > 1 ? 25 : 20) : (frozenColumnCount > 1 ? 25 : undefined),
                        borderBottom: '2px solid #334155'
                      }}
                      isHeaderSticky={isHeaderSticky}
                      theme="dark"
                      style={{ borderBottom: '2px solid #334155' }}
                    />
                  )}
                  {displayMonthCols.map((m, mIdx) => (
                    <ColumnHeaderCell
                      key={m.key}
                      colId={m.key}
                      label={m.label}
                      align="right"
                      width={columnWidths[m.key]}
                      minWidth={95}
                      isSortable={true}
                      sortConfig={sortConfig}
                      onSort={handleSort}
                      isFilterable={true}
                      activeFilter={columnFilters[m.key]}
                      onApplyFilter={handleApplyColumnFilter}
                      onClearFilter={handleClearColumnFilter}
                      onResizeStart={handleResizeStart}
                      isFrozen={frozenColumnCount > (2 + mIdx)}
                      frozenStyle={getFrozenColumnStyle(2 + mIdx, frozenColumnCount, visibleColumns, columnWidths, true)}
                      isHeaderSticky={isHeaderSticky}
                      theme="dark"
                      style={{ borderBottom: '2px solid #334155' }}
                    />
                  ))}
                  {(visibleColumns.length === 0 || visibleColumns.includes('total')) && (
                    <ColumnHeaderCell
                      colId="total"
                      label="Total"
                      align="right"
                      width={columnWidths['total']}
                      minWidth={115}
                      isSortable={true}
                      sortConfig={sortConfig}
                      onSort={handleSort}
                      isFilterable={true}
                      activeFilter={columnFilters['total']}
                      onApplyFilter={handleApplyColumnFilter}
                      onClearFilter={handleClearColumnFilter}
                      onResizeStart={handleResizeStart}
                      isHeaderSticky={isHeaderSticky}
                      theme="dark"
                      style={{
                        backgroundColor: '#1e293b',
                        borderBottom: '2px solid #334155',
                        borderLeft: '1px solid #334155'
                      }}
                    />
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {/* ---------------- SECTION 1: RENT INCOME & EARNINGS ---------------- */}
                <tr className="bg-emerald-50/90 text-emerald-950 font-black text-xs border-y-2 border-emerald-300 select-none">
                  <td colSpan={2} className="py-2.5 px-4 tracking-wider">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-600"></span>
                      <span>1. RENT INCOME & EARNINGS</span>
                    </div>
                  </td>
                  <td colSpan={displayMonthCols.length + (visibleColumns.length === 0 || visibleColumns.includes('total') ? 1 : 0)}></td>
                </tr>

                {/* Property Rows */}
                {paginatedRows.map((row, idx) => {
                  const isExpanded = !!expandedProperties[row.propertyId];
                  const hasUnits = row.units && row.units.length > 0;

                  return (
                    <React.Fragment key={`earn-${row.propertyId}`}>
                      <tr className="hover:bg-teal-50/40 transition-colors group">
                        {(visibleColumns.length === 0 || visibleColumns.includes('index')) && (
                          <td
                            style={{
                              ...getFrozenColumnStyle(0, frozenColumnCount, visibleColumns, columnWidths, false),
                              width: `${columnWidths['index'] || 48}px`,
                              minWidth: `${columnWidths['index'] || 48}px`,
                              maxWidth: `${columnWidths['index'] || 48}px`
                            }}
                            className="py-2 px-2 text-center text-slate-400 font-bold bg-white"
                          >
                            {idx + 1}
                          </td>
                        )}
                        {(visibleColumns.length === 0 || visibleColumns.includes('property')) && (
                          <td
                            style={{
                              ...getFrozenColumnStyle(1, frozenColumnCount, visibleColumns, columnWidths, false),
                              width: `${columnWidths['property'] || 260}px`,
                              minWidth: `${columnWidths['property'] || 260}px`,
                              maxWidth: `${columnWidths['property'] || 260}px`
                            }}
                            className="py-2 px-3 bg-white"
                          >
                            <div className="flex items-center gap-2">
                              {hasUnits ? (
                                <button
                                  type="button"
                                  onClick={() => togglePropertyExpand(row.propertyId)}
                                  className="p-1 rounded hover:bg-slate-200/70 text-slate-500 hover:text-slate-800 transition-colors cursor-pointer shrink-0"
                                  title={isExpanded ? 'Collapse units' : 'Expand units'}
                                >
                                  {isExpanded ? (
                                    <ChevronDown className="w-3.5 h-3.5 text-teal-600" />
                                  ) : (
                                    <ChevronRight className="w-3.5 h-3.5" />
                                  )}
                                </button>
                              ) : (
                                <span className="w-5 shrink-0" />
                              )}
                              <div className="min-w-0">
                                <p className={`font-extrabold text-slate-900 text-sm group-hover:text-teal-900 ${
                                  autoWrap ? 'whitespace-normal break-words leading-tight' : 'truncate'
                                }`}>
                                  {row.propertyName}
                                </p>
                                <p className="text-[10px] text-slate-400">
                                  {row.units?.length || 0} unit{(row.units?.length === 1) ? '' : 's'}
                                </p>
                              </div>
                            </div>
                          </td>
                        )}

                        {/* Month Columns */}
                        {displayMonthCols.map(m => {
                          const val = row.earnings[m.key] || 0;
                          return (
                            <td
                              key={m.key}
                              style={{
                                width: `${columnWidths[m.key] || 115}px`,
                                minWidth: `${columnWidths[m.key] || 115}px`,
                                maxWidth: `${columnWidths[m.key] || 115}px`
                              }}
                              onClick={() => {
                                openDrilldown({
                                  propertyId: row.propertyId,
                                  month: m.key,
                                  title: `${row.propertyName} · ${m.label}`,
                                  expectedAmount: val
                                });
                              }}
                              className="py-2 px-2.5 text-right font-medium transition-colors cursor-pointer hover:bg-teal-100/60 group/cell"
                              title={val > 0 ? `Click to view & edit ${row.propertyName} transactions in ${m.label}` : `Click to add rent for ${row.propertyName} in ${m.label}`}
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
                        {(visibleColumns.length === 0 || visibleColumns.includes('total')) && (
                          <td
                            style={{
                              width: `${columnWidths['total'] || 135}px`,
                              minWidth: `${columnWidths['total'] || 135}px`,
                              maxWidth: `${columnWidths['total'] || 135}px`
                            }}
                            onClick={() => {
                                openDrilldown({
                                  propertyId: row.propertyId,
                                  year: selectedYear,
                                  startMonth,
                                  endMonth,
                                  title: `${row.propertyName} · Total (${startMonth ? formatMonthLabel(startMonth) : 'Earliest'} to ${endMonth ? formatMonthLabel(endMonth) : 'Latest'})`,
                                  expectedAmount: row.total
                                });
                              }}
                              className="py-3 px-4 text-right bg-slate-50/80 font-black text-emerald-700 text-sm border-l border-slate-100 transition-colors cursor-pointer hover:bg-emerald-100/60 hover:underline decoration-emerald-500/50 underline-offset-2"
                              title={row.total > 0 ? `Click to view & edit all transactions for ${row.propertyName}` : `Click to add transactions for ${row.propertyName}`}
                          >
                            {formatCurrency(row.total)}
                          </td>
                        )}
                      </tr>

                      {/* Sub-Unit Rows (when expanded) */}
                      {isExpanded && row.units?.map(u => (
                        <tr key={`earn-unit-${u.unitId}`} className="bg-slate-50/60 hover:bg-slate-100/60 transition-colors text-[11px]">
                          {(visibleColumns.length === 0 || visibleColumns.includes('index')) && (
                            <td
                              style={{
                                ...getFrozenColumnStyle(0, frozenColumnCount, visibleColumns, columnWidths, false),
                                width: `${columnWidths['index'] || 48}px`,
                                minWidth: `${columnWidths['index'] || 48}px`,
                                maxWidth: `${columnWidths['index'] || 48}px`
                              }}
                              className="py-2 px-2 text-center text-slate-300 bg-slate-50"
                            >
                              ↳
                            </td>
                          )}
                          {(visibleColumns.length === 0 || visibleColumns.includes('property')) && (
                            <td
                              style={{
                                ...getFrozenColumnStyle(1, frozenColumnCount, visibleColumns, columnWidths, false),
                                width: `${columnWidths['property'] || 260}px`,
                                minWidth: `${columnWidths['property'] || 260}px`,
                                maxWidth: `${columnWidths['property'] || 260}px`
                              }}
                              className="py-2 px-3 pl-8 bg-slate-50"
                            >
                              <div className="flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-teal-500 shrink-0" />
                                <span className={`font-semibold text-slate-700 ${autoWrap ? 'whitespace-normal break-words leading-tight' : 'truncate'}`}>{u.unitName}</span>
                              </div>
                            </td>
                          )}

                          {displayMonthCols.map(m => {
                            const uVal = u.earnings[m.key] || 0;
                            return (
                              <td
                                key={m.key}
                                style={{
                                  width: `${columnWidths[m.key] || 115}px`,
                                  minWidth: `${columnWidths[m.key] || 115}px`,
                                  maxWidth: `${columnWidths[m.key] || 115}px`
                                }}
                                onClick={() => {
                                  openDrilldown({
                                    propertyId: row.propertyId,
                                    unitId: u.unitId,
                                    month: m.key,
                                    title: `${u.unitName} (${row.propertyName}) · ${m.label}`,
                                    expectedAmount: uVal
                                  });
                                }}
                                className="py-2 px-2.5 text-right text-slate-600 transition-colors cursor-pointer hover:bg-teal-100/70 group/cell"
                                title={uVal > 0 ? `Click to view & edit ${u.unitName} transactions in ${m.label}` : `Click to add rent for ${u.unitName} in ${m.label}`}
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

                          {(visibleColumns.length === 0 || visibleColumns.includes('total')) && (
                            <td
                              style={{
                                width: `${columnWidths['total'] || 135}px`,
                                minWidth: `${columnWidths['total'] || 135}px`,
                                maxWidth: `${columnWidths['total'] || 135}px`
                              }}
                              onClick={() => {
                                  openDrilldown({
                                    propertyId: row.propertyId,
                                    unitId: u.unitId,
                                    year: selectedYear,
                                    startMonth,
                                    endMonth,
                                    title: `${u.unitName} (${row.propertyName}) · Total (${startMonth ? formatMonthLabel(startMonth) : 'Earliest'} to ${endMonth ? formatMonthLabel(endMonth) : 'Latest'})`,
                                    expectedAmount: u.total
                                  });
                                }}
                                className="py-2 px-3 text-right font-bold text-slate-700 bg-slate-100/60 border-l border-slate-100 transition-colors cursor-pointer hover:bg-teal-100/60 hover:underline"
                                title={u.total > 0 ? `Click to view & edit all transactions for ${u.unitName}` : `Click to add transactions for ${u.unitName}`}
                            >
                              {formatCurrency(u.total)}
                            </td>
                          )}
                        </tr>
                      ))}
                    </React.Fragment>
                  );
                })}

                {/* TOTAL EARNINGS ROW */}
                <tr className="bg-emerald-100/90 text-emerald-950 font-black text-xs border-y-2 border-emerald-400">
                  {(visibleColumns.length === 0 || visibleColumns.includes('index')) && (
                    <td
                      style={{
                        ...getFrozenColumnStyle(0, frozenColumnCount, visibleColumns, columnWidths, false),
                        width: `${columnWidths['index'] || 48}px`,
                        minWidth: `${columnWidths['index'] || 48}px`,
                        maxWidth: `${columnWidths['index'] || 48}px`
                      }}
                      className="py-2.5 px-2 text-center text-emerald-800 font-black bg-emerald-100/90"
                    >
                      Σ
                    </td>
                  )}
                  {(visibleColumns.length === 0 || visibleColumns.includes('property')) && (
                    <td
                      style={{
                        ...getFrozenColumnStyle(1, frozenColumnCount, visibleColumns, columnWidths, false),
                        width: `${columnWidths['property'] || 260}px`,
                        minWidth: `${columnWidths['property'] || 260}px`,
                        maxWidth: `${columnWidths['property'] || 260}px`
                      }}
                      className="py-2.5 px-3 font-black tracking-wide text-emerald-950 uppercase bg-emerald-100/90"
                    >
                      TOTAL EARNINGS
                    </td>
                  )}
                  {displayMonthCols.map(m => {
                    const colSum = activeColTotals[m.key] || 0;
                    return (
                      <td
                        key={m.key}
                        style={{
                          width: `${columnWidths[m.key] || 115}px`,
                          minWidth: `${columnWidths[m.key] || 115}px`,
                          maxWidth: `${columnWidths[m.key] || 115}px`
                        }}
                        onClick={() => {
                          if (colSum > 0) {
                            openDrilldown({
                              month: m.key,
                              title: `All Properties Portfolio · ${m.label}`,
                              expectedAmount: colSum
                            });
                          }
                        }}
                        className={`py-2.5 px-2.5 text-right font-black text-emerald-900 text-xs transition-colors ${
                          colSum > 0 ? 'cursor-pointer hover:bg-emerald-200/80 hover:text-emerald-950' : ''
                        }`}
                        title={colSum > 0 ? `Click to view & edit transactions across properties in ${m.label}` : undefined}
                      >
                        {formatCurrency(colSum)}
                      </td>
                    );
                  })}
                  {(visibleColumns.length === 0 || visibleColumns.includes('total')) && (
                    <td
                      style={{
                        width: `${columnWidths['total'] || 135}px`,
                        minWidth: `${columnWidths['total'] || 135}px`,
                        maxWidth: `${columnWidths['total'] || 135}px`
                      }}
                      className="py-2.5 px-3 text-right font-black text-emerald-950 text-sm bg-emerald-200/90 border-l border-emerald-300"
                    >
                      {formatCurrency(activeGrandTotal)}
                    </td>
                  )}
                </tr>

                {/* ---------------- SECTION 2: EXPENSES ---------------- */}
                <tr className="bg-rose-50/90 text-rose-950 font-black text-xs border-y-2 border-rose-300 select-none">
                  <td colSpan={2} className="py-2.5 px-4 tracking-wider">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-600"></span>
                      <span>2. EXPENSES (PROPERTY-WISE & COMMON)</span>
                    </div>
                  </td>
                  <td colSpan={displayMonthCols.length + (visibleColumns.length === 0 || visibleColumns.includes('total') ? 1 : 0)}></td>
                </tr>

                {/* Property-wise Expenses */}
                {filteredExpenseRows.map((pExp, idx) => {
                  const isExpExpanded = !!expandedExpenseProperties[pExp.propertyId];
                  const hasCategories = pExp.categories && pExp.categories.length > 0;

                  return (
                    <React.Fragment key={`exp-${pExp.propertyId}`}>
                      <tr className="hover:bg-rose-50/40 transition-colors group">
                        {(visibleColumns.length === 0 || visibleColumns.includes('index')) && (
                          <td
                            style={{
                              ...getFrozenColumnStyle(0, frozenColumnCount, visibleColumns, columnWidths, false),
                              width: `${columnWidths['index'] || 48}px`,
                              minWidth: `${columnWidths['index'] || 48}px`,
                              maxWidth: `${columnWidths['index'] || 48}px`
                            }}
                            className="py-2 px-2 text-center text-slate-400 font-bold bg-white"
                          >
                            {idx + 1}
                          </td>
                        )}
                        {(visibleColumns.length === 0 || visibleColumns.includes('property')) && (
                          <td
                            style={{
                              ...getFrozenColumnStyle(1, frozenColumnCount, visibleColumns, columnWidths, false),
                              width: `${columnWidths['property'] || 260}px`,
                              minWidth: `${columnWidths['property'] || 260}px`,
                              maxWidth: `${columnWidths['property'] || 260}px`
                            }}
                            className="py-2 px-3 bg-white"
                          >
                            <div className="flex items-center gap-2">
                              {hasCategories ? (
                                <button
                                  type="button"
                                  onClick={() => toggleExpensePropertyExpand(pExp.propertyId)}
                                  className="p-1 rounded hover:bg-slate-200/70 text-slate-500 hover:text-slate-800 transition-colors cursor-pointer shrink-0"
                                  title={isExpExpanded ? 'Collapse heads' : 'Expand heads'}
                                >
                                  {isExpExpanded ? (
                                    <ChevronDown className="w-3.5 h-3.5 text-rose-600" />
                                  ) : (
                                    <ChevronRight className="w-3.5 h-3.5" />
                                  )}
                                </button>
                              ) : (
                                <span className="w-5 shrink-0" />
                              )}
                              <div className="min-w-0">
                                <p className={`font-extrabold text-slate-900 text-sm group-hover:text-rose-900 ${
                                  autoWrap ? 'whitespace-normal break-words leading-tight' : 'truncate'
                                }`}>
                                  {pExp.propertyName}
                                </p>
                                <p className="text-[10px] text-rose-600 font-semibold">
                                  Property Expenses
                                </p>
                              </div>
                            </div>
                          </td>
                        )}

                        {displayMonthCols.map(m => {
                          const val = pExp.expenses[m.key] || 0;
                          return (
                            <td
                              key={m.key}
                              style={{
                                width: `${columnWidths[m.key] || 115}px`,
                                minWidth: `${columnWidths[m.key] || 115}px`,
                                maxWidth: `${columnWidths[m.key] || 115}px`
                              }}
                              onClick={() => {
                                openDrilldown({
                                  propertyId: pExp.propertyId,
                                  month: m.key,
                                  type: 'expense',
                                  title: `${pExp.propertyName} (Expenses) · ${m.label}`,
                                  expectedAmount: val
                                });
                              }}
                              className="py-2 px-2.5 text-right font-medium transition-colors cursor-pointer hover:bg-rose-100/60 group/cell"
                              title={val > 0 ? `Click to view ${pExp.propertyName} expenses in ${m.label}` : `Click to add expense for ${pExp.propertyName} in ${m.label}`}
                            >
                              {val > 0 ? (
                                <span className="font-bold text-rose-700 group-hover/cell:underline decoration-rose-500/50 underline-offset-2">
                                  {formatCurrency(val)}
                                </span>
                              ) : (
                                <span className="text-slate-300 font-normal">—</span>
                              )}
                            </td>
                          );
                        })}

                        {(visibleColumns.length === 0 || visibleColumns.includes('total')) && (
                          <td
                            style={{
                              width: `${columnWidths['total'] || 135}px`,
                              minWidth: `${columnWidths['total'] || 135}px`,
                              maxWidth: `${columnWidths['total'] || 135}px`
                            }}
                            onClick={() => {
                                openDrilldown({
                                  propertyId: pExp.propertyId,
                                  type: 'expense',
                                  title: `${pExp.propertyName} · Total Expenses`,
                                  expectedAmount: pExp.total
                                });
                              }}
                              className="py-2 px-3 text-right bg-rose-50/60 font-black text-rose-700 text-sm border-l border-slate-100 transition-colors cursor-pointer hover:bg-rose-100/60 hover:underline"
                              title={pExp.total > 0 ? `Click to view all expenses for ${pExp.propertyName}` : `Click to add expense for ${pExp.propertyName}`}
                          >
                            {formatCurrency(pExp.total)}
                          </td>
                        )}
                      </tr>

                      {/* Expanded Categories for this Property */}
                      {isExpExpanded && pExp.categories?.map(cat => (
                        <tr key={`exp-cat-${pExp.propertyId}-${cat.category}`} className="bg-rose-50/30 hover:bg-rose-50/60 transition-colors text-[11px]">
                          {(visibleColumns.length === 0 || visibleColumns.includes('index')) && (
                            <td
                              style={{
                                ...getFrozenColumnStyle(0, frozenColumnCount, visibleColumns, columnWidths, false),
                                width: `${columnWidths['index'] || 48}px`,
                                minWidth: `${columnWidths['index'] || 48}px`,
                                maxWidth: `${columnWidths['index'] || 48}px`
                              }}
                              className="py-2 px-2 text-center text-slate-300 bg-rose-50/20"
                            >
                              ↳
                            </td>
                          )}
                          {(visibleColumns.length === 0 || visibleColumns.includes('property')) && (
                            <td
                              style={{
                                ...getFrozenColumnStyle(1, frozenColumnCount, visibleColumns, columnWidths, false),
                                width: `${columnWidths['property'] || 260}px`,
                                minWidth: `${columnWidths['property'] || 260}px`,
                                maxWidth: `${columnWidths['property'] || 260}px`
                              }}
                              className="py-2 px-3 pl-8 bg-rose-50/20"
                            >
                              <div className="flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-rose-400 shrink-0" />
                                <span className={`font-semibold text-slate-700 ${autoWrap ? 'whitespace-normal break-words leading-tight' : 'truncate'}`}>{cat.category}</span>
                              </div>
                            </td>
                          )}
                          {displayMonthCols.map(m => {
                            const val = cat.expenses[m.key] || 0;
                            return (
                              <td
                                key={m.key}
                                style={{
                                  width: `${columnWidths[m.key] || 115}px`,
                                  minWidth: `${columnWidths[m.key] || 115}px`,
                                  maxWidth: `${columnWidths[m.key] || 115}px`
                                }}
                                onClick={() => {
                                  openDrilldown({
                                    propertyId: pExp.propertyId,
                                    category: cat.category,
                                    month: m.key,
                                    type: 'expense',
                                    title: `${pExp.propertyName} · ${cat.category} · ${m.label}`,
                                    expectedAmount: val
                                  });
                                }}
                                className="py-2 px-2.5 text-right text-slate-600 transition-colors cursor-pointer hover:bg-rose-100/60 font-semibold text-rose-800 group/cell"
                                title={val > 0 ? `Click to view ${cat.category} expenses for ${pExp.propertyName} in ${m.label}` : `Click to add ${cat.category} expense for ${pExp.propertyName} in ${m.label}`}
                              >
                                {val > 0 ? (
                                  <span className="font-semibold text-rose-800 hover:underline">
                                    {formatCurrency(val)}
                                  </span>
                                ) : (
                                  <span className="text-slate-300">—</span>
                                )}
                              </td>
                            );
                          })}
                          {(visibleColumns.length === 0 || visibleColumns.includes('total')) && (
                            <td
                              style={{
                                width: `${columnWidths['total'] || 135}px`,
                                minWidth: `${columnWidths['total'] || 135}px`,
                                maxWidth: `${columnWidths['total'] || 135}px`
                              }}
                              onClick={() => {
                                  openDrilldown({
                                    propertyId: pExp.propertyId,
                                    category: cat.category,
                                    type: 'expense',
                                    title: `${pExp.propertyName} · ${cat.category} · Total`,
                                    expectedAmount: cat.total
                                  });
                                }}
                                className="py-2 px-3 text-right font-bold text-rose-800 bg-rose-100/40 border-l border-slate-100 transition-colors cursor-pointer hover:bg-rose-200/60 hover:underline"
                                title={cat.total > 0 ? `Click to view all ${cat.category} expenses for ${pExp.propertyName}` : `Click to add ${cat.category} expense for ${pExp.propertyName}`}
                            >
                              {formatCurrency(cat.total)}
                            </td>
                          )}
                        </tr>
                      ))}
                    </React.Fragment>
                  );
                })}

                {/* Common / Other Expenses Row (shown when not filtering single property) */}
                {!selectedPropertyFilter && data?.commonExpenseData && (
                  <React.Fragment>
                    <tr className="hover:bg-purple-50/40 transition-colors group">
                      {(visibleColumns.length === 0 || visibleColumns.includes('index')) && (
                        <td
                          style={{
                            ...getFrozenColumnStyle(0, frozenColumnCount, visibleColumns, columnWidths, false),
                            width: `${columnWidths['index'] || 48}px`,
                            minWidth: `${columnWidths['index'] || 48}px`,
                            maxWidth: `${columnWidths['index'] || 48}px`
                          }}
                          className="py-2 px-2 text-center text-purple-600 font-bold bg-white"
                        >
                          C
                        </td>
                      )}
                      {(visibleColumns.length === 0 || visibleColumns.includes('property')) && (
                        <td
                          style={{
                            ...getFrozenColumnStyle(1, frozenColumnCount, visibleColumns, columnWidths, false),
                            width: `${columnWidths['property'] || 260}px`,
                            minWidth: `${columnWidths['property'] || 260}px`,
                            maxWidth: `${columnWidths['property'] || 260}px`
                          }}
                          className="py-2 px-3 bg-white"
                        >
                          <div className="flex items-center gap-2">
                            {data.commonExpenseData.categories?.length > 0 ? (
                              <button
                                type="button"
                                onClick={() => setIsCommonExpensesExpanded(!isCommonExpensesExpanded)}
                                className="p-1 rounded hover:bg-slate-200/70 text-slate-500 hover:text-slate-800 transition-colors cursor-pointer shrink-0"
                                title={isCommonExpensesExpanded ? 'Collapse common heads' : 'Expand common heads'}
                              >
                                {isCommonExpensesExpanded ? (
                                  <ChevronDown className="w-3.5 h-3.5 text-purple-600" />
                                ) : (
                                  <ChevronRight className="w-3.5 h-3.5" />
                                )}
                              </button>
                            ) : (
                              <span className="w-5 shrink-0" />
                            )}
                            <div className="min-w-0">
                              <p className={`font-extrabold text-slate-900 text-sm group-hover:text-purple-900 ${
                                autoWrap ? 'whitespace-normal break-words leading-tight' : 'truncate'
                              }`}>
                                Common / Other Expenses
                              </p>
                              <p className="text-[10px] text-purple-600 font-semibold">
                                Non-property company expenses
                              </p>
                            </div>
                          </div>
                        </td>
                      )}
                      {displayMonthCols.map(m => {
                        const val = data.commonExpenseData.expenses[m.key] || 0;
                        return (
                          <td
                            key={m.key}
                            style={{
                              width: `${columnWidths[m.key] || 115}px`,
                              minWidth: `${columnWidths[m.key] || 115}px`,
                              maxWidth: `${columnWidths[m.key] || 115}px`
                            }}
                            onClick={() => {
                              openDrilldown({
                                propertyId: '__COMMON__',
                                month: m.key,
                                type: 'expense',
                                title: `Common / Other Expenses · ${m.label}`,
                                expectedAmount: val
                              });
                            }}
                            className="py-2 px-2.5 text-right font-medium transition-colors cursor-pointer hover:bg-purple-100/60 group/cell"
                            title={val > 0 ? `Click to view common expenses in ${m.label}` : `Click to add common expense in ${m.label}`}
                          >
                            {val > 0 ? (
                              <span className="font-bold text-purple-800">
                                {formatCurrency(val)}
                              </span>
                            ) : (
                              <span className="text-slate-300 font-normal">—</span>
                            )}
                          </td>
                        );
                      })}
                      {(visibleColumns.length === 0 || visibleColumns.includes('total')) && (
                        <td
                          style={{
                            width: `${columnWidths['total'] || 135}px`,
                            minWidth: `${columnWidths['total'] || 135}px`,
                            maxWidth: `${columnWidths['total'] || 135}px`
                          }}
                          onClick={() => {
                            openDrilldown({
                              propertyId: '__COMMON__',
                              type: 'expense',
                              title: `Common / Other Expenses · Total`,
                              expectedAmount: data.commonExpenseData.total
                            });
                          }}
                          className="py-2 px-3 text-right bg-purple-50/60 font-black text-purple-800 text-sm border-l border-slate-100 cursor-pointer hover:bg-purple-100/60"
                        >
                          {formatCurrency(data.commonExpenseData.total)}
                        </td>
                      )}
                    </tr>

                    {/* Expanded Common Expense Categories */}
                    {isCommonExpensesExpanded && data.commonExpenseData.categories?.map(cat => (
                      <tr key={`common-cat-${cat.category}`} className="bg-purple-50/30 hover:bg-purple-50/60 transition-colors text-[11px]">
                        {(visibleColumns.length === 0 || visibleColumns.includes('index')) && (
                          <td
                            style={{
                              ...getFrozenColumnStyle(0, frozenColumnCount, visibleColumns, columnWidths, false),
                              width: `${columnWidths['index'] || 48}px`,
                              minWidth: `${columnWidths['index'] || 48}px`,
                              maxWidth: `${columnWidths['index'] || 48}px`
                            }}
                            className="py-2 px-2 text-center text-slate-300 bg-purple-50/20"
                          >
                            ↳
                          </td>
                        )}
                        {(visibleColumns.length === 0 || visibleColumns.includes('property')) && (
                          <td
                            style={{
                              ...getFrozenColumnStyle(1, frozenColumnCount, visibleColumns, columnWidths, false),
                              width: `${columnWidths['property'] || 260}px`,
                              minWidth: `${columnWidths['property'] || 260}px`,
                              maxWidth: `${columnWidths['property'] || 260}px`
                            }}
                            className="py-2 px-3 pl-8 bg-purple-50/20"
                          >
                            <div className="flex items-center gap-2">
                              <span className="w-1.5 h-1.5 rounded-full bg-purple-400 shrink-0" />
                              <span className={`font-semibold text-slate-700 ${autoWrap ? 'whitespace-normal break-words leading-tight' : 'truncate'}`}>{cat.category}</span>
                            </div>
                          </td>
                        )}
                        {displayMonthCols.map(m => {
                          const val = cat.expenses[m.key] || 0;
                          return (
                            <td
                              key={m.key}
                              style={{
                                width: `${columnWidths[m.key] || 115}px`,
                                minWidth: `${columnWidths[m.key] || 115}px`,
                                maxWidth: `${columnWidths[m.key] || 115}px`
                              }}
                              onClick={() => {
                                openDrilldown({
                                  propertyId: '__COMMON__',
                                  category: cat.category,
                                  month: m.key,
                                  type: 'expense',
                                  title: `Common Expenses · ${cat.category} · ${m.label}`,
                                  expectedAmount: val
                                });
                              }}
                              className="py-2 px-2.5 text-right text-slate-600 transition-colors cursor-pointer hover:bg-purple-100/60 font-semibold text-purple-800 group/cell"
                              title={val > 0 ? `Click to view ${cat.category} common expenses in ${m.label}` : `Click to add ${cat.category} common expense in ${m.label}`}
                            >
                              {val > 0 ? (
                                <span className="font-semibold text-purple-800 hover:underline">
                                  {formatCurrency(val)}
                                </span>
                              ) : (
                                <span className="text-slate-300">—</span>
                              )}
                            </td>
                          );
                        })}
                        {(visibleColumns.length === 0 || visibleColumns.includes('total')) && (
                          <td
                            style={{
                              width: `${columnWidths['total'] || 135}px`,
                              minWidth: `${columnWidths['total'] || 135}px`,
                              maxWidth: `${columnWidths['total'] || 135}px`
                            }}
                            onClick={() => {
                                openDrilldown({
                                  propertyId: '__COMMON__',
                                  category: cat.category,
                                  type: 'expense',
                                  title: `Common Expenses · ${cat.category} · Total`,
                                  expectedAmount: cat.total
                                });
                              }}
                              className="py-2 px-3 text-right font-bold text-purple-800 bg-purple-100/40 border-l border-slate-100 transition-colors cursor-pointer hover:bg-purple-200/60 hover:underline"
                              title={cat.total > 0 ? `Click to view all ${cat.category} common expenses` : `Click to add ${cat.category} common expense`}
                          >
                            {formatCurrency(cat.total)}
                          </td>
                        )}
                      </tr>
                    ))}
                  </React.Fragment>
                )}

                {/* TOTAL EXPENSES ROW */}
                <tr className="bg-rose-100/90 text-rose-950 font-black text-xs border-y-2 border-rose-400">
                  {(visibleColumns.length === 0 || visibleColumns.includes('index')) && (
                    <td
                      style={{
                        ...getFrozenColumnStyle(0, frozenColumnCount, visibleColumns, columnWidths, false),
                        width: `${columnWidths['index'] || 48}px`,
                        minWidth: `${columnWidths['index'] || 48}px`,
                        maxWidth: `${columnWidths['index'] || 48}px`
                      }}
                      className="py-2.5 px-2 text-center text-rose-800 font-black bg-rose-100/90"
                    >
                      Σ
                    </td>
                  )}
                  {(visibleColumns.length === 0 || visibleColumns.includes('property')) && (
                    <td
                      style={{
                        ...getFrozenColumnStyle(1, frozenColumnCount, visibleColumns, columnWidths, false),
                        width: `${columnWidths['property'] || 260}px`,
                        minWidth: `${columnWidths['property'] || 260}px`,
                        maxWidth: `${columnWidths['property'] || 260}px`
                      }}
                      className="py-2.5 px-3 font-black tracking-wide text-rose-950 uppercase bg-rose-100/90"
                    >
                      TOTAL EXPENSES
                    </td>
                  )}
                  {displayMonthCols.map(m => {
                    const colExp = activeExpenseColTotals[m.key] || 0;
                    return (
                      <td
                        key={m.key}
                        style={{
                          width: `${columnWidths[m.key] || 115}px`,
                          minWidth: `${columnWidths[m.key] || 115}px`,
                          maxWidth: `${columnWidths[m.key] || 115}px`
                        }}
                        onClick={() => {
                          openDrilldown({
                            month: m.key,
                            type: 'expense',
                            title: `All Expenses Portfolio · ${m.label}`,
                            expectedAmount: colExp
                          });
                        }}
                        className="py-2.5 px-2.5 text-right font-black text-rose-900 text-xs transition-colors cursor-pointer hover:bg-rose-200/80 hover:text-rose-950 group/cell"
                        title={colExp > 0 ? `Click to view all expenses across properties in ${m.label}` : `Click to add expense in ${m.label}`}
                      >
                        {formatCurrency(colExp)}
                      </td>
                    );
                  })}
                  {(visibleColumns.length === 0 || visibleColumns.includes('total')) && (
                    <td
                      style={{
                        width: `${columnWidths['total'] || 135}px`,
                        minWidth: `${columnWidths['total'] || 135}px`,
                        maxWidth: `${columnWidths['total'] || 135}px`
                      }}
                      onClick={() => {
                        openDrilldown({
                          type: 'expense',
                          title: 'All Expenses Portfolio · Total',
                          expectedAmount: activeGrandTotalExpenses
                        });
                      }}
                      className="py-2.5 px-3 text-right font-black text-rose-950 text-sm bg-rose-200/90 border-l border-rose-300 transition-colors cursor-pointer hover:bg-rose-300/80 hover:underline"
                      title="Click to view & record expenses across portfolio"
                    >
                      {formatCurrency(activeGrandTotalExpenses)}
                    </td>
                  )}
                </tr>

                {/* ---------------- SECTION 3: NET DIFFERENCE (EARNINGS - EXPENSES) ---------------- */}
                <tr className="bg-slate-900 text-white font-black text-xs border-y-2 border-slate-950 select-none shadow-md">
                  {(visibleColumns.length === 0 || visibleColumns.includes('index')) && (
                    <td
                      style={{
                        ...getFrozenColumnStyle(0, frozenColumnCount, visibleColumns, columnWidths, false),
                        width: `${columnWidths['index'] || 48}px`,
                        minWidth: `${columnWidths['index'] || 48}px`,
                        maxWidth: `${columnWidths['index'] || 48}px`
                      }}
                      className="py-3 px-2 text-center text-emerald-400 font-black text-sm bg-slate-900"
                    >
                      Δ
                    </td>
                  )}
                  {(visibleColumns.length === 0 || visibleColumns.includes('property')) && (
                    <td
                      style={{
                        ...getFrozenColumnStyle(1, frozenColumnCount, visibleColumns, columnWidths, false),
                        width: `${columnWidths['property'] || 260}px`,
                        minWidth: `${columnWidths['property'] || 260}px`,
                        maxWidth: `${columnWidths['property'] || 260}px`
                      }}
                      className="py-3 px-3 text-xs font-black tracking-wide text-white uppercase bg-slate-900"
                    >
                      Difference
                    </td>
                  )}
                  {displayMonthCols.map(m => {
                    const earn = activeColTotals[m.key] || 0;
                    const exp = activeExpenseColTotals[m.key] || 0;
                    const diff = earn - exp;
                    return (
                      <td
                        key={m.key}
                        style={{
                          width: `${columnWidths[m.key] || 115}px`,
                          minWidth: `${columnWidths[m.key] || 115}px`,
                          maxWidth: `${columnWidths[m.key] || 115}px`
                        }}
                        className={`py-3 px-2.5 text-right font-black text-xs ${
                          diff > 0 ? 'text-emerald-300' : diff < 0 ? 'text-rose-400' : 'text-slate-400'
                        }`}
                      >
                        {diff > 0 ? `+ ${formatCurrency(diff)}` : diff < 0 ? `- ${formatCurrency(Math.abs(diff))}` : '₹0'}
                      </td>
                    );
                  })}
                  {(visibleColumns.length === 0 || visibleColumns.includes('total')) && (
                    <td
                      style={{
                        width: `${columnWidths['total'] || 135}px`,
                        minWidth: `${columnWidths['total'] || 135}px`,
                        maxWidth: `${columnWidths['total'] || 135}px`
                      }}
                      className="py-3 px-3 text-right bg-slate-950 border-l border-slate-800"
                    >
                      <span className={`inline-block px-2.5 py-0.5 rounded-lg font-black text-xs shadow-sm ${
                        activeGrandTotalDifference >= 0
                          ? 'bg-emerald-500 text-slate-950'
                          : 'bg-rose-500 text-white'
                      }`}>
                        {activeGrandTotalDifference >= 0 ? `+ ${formatCurrency(activeGrandTotalDifference)}` : `- ${formatCurrency(Math.abs(activeGrandTotalDifference))}`}
                      </span>
                    </td>
                  )}
                </tr>

                {/* ---------------- SECTION 4: CUMULATIVE DIFFERENCE ---------------- */}
                <tr className="bg-slate-950 text-white font-black text-xs border-b-2 border-slate-900 select-none shadow-md">
                  {(visibleColumns.length === 0 || visibleColumns.includes('index')) && (
                    <td
                      style={{
                        ...getFrozenColumnStyle(0, frozenColumnCount, visibleColumns, columnWidths, false),
                        width: `${columnWidths['index'] || 48}px`,
                        minWidth: `${columnWidths['index'] || 48}px`,
                        maxWidth: `${columnWidths['index'] || 48}px`
                      }}
                      className="py-3 px-2 text-center text-teal-400 font-black text-sm bg-slate-950"
                    >
                      Σ
                    </td>
                  )}
                  {(visibleColumns.length === 0 || visibleColumns.includes('property')) && (
                    <td
                      style={{
                        ...getFrozenColumnStyle(1, frozenColumnCount, visibleColumns, columnWidths, false),
                        width: `${columnWidths['property'] || 260}px`,
                        minWidth: `${columnWidths['property'] || 260}px`,
                        maxWidth: `${columnWidths['property'] || 260}px`
                      }}
                      className="py-3 px-3 text-xs font-black tracking-wide text-teal-300 uppercase bg-slate-950"
                    >
                      Cumulative
                    </td>
                  )}
                  {(() => {
                    let runningDiff = 0;
                    return displayMonthCols.map(m => {
                      const earn = activeColTotals[m.key] || 0;
                      const exp = activeExpenseColTotals[m.key] || 0;
                      const diff = earn - exp;
                      runningDiff += diff;
                      return (
                        <td
                          key={m.key}
                          style={{
                            width: `${columnWidths[m.key] || 115}px`,
                            minWidth: `${columnWidths[m.key] || 115}px`,
                            maxWidth: `${columnWidths[m.key] || 115}px`
                          }}
                          className={`py-3 px-2.5 text-right font-black text-xs ${
                            runningDiff > 0 ? 'text-teal-300' : runningDiff < 0 ? 'text-rose-300' : 'text-slate-400'
                          }`}
                        >
                          {runningDiff > 0 ? `+ ${formatCurrency(runningDiff)}` : runningDiff < 0 ? `- ${formatCurrency(Math.abs(runningDiff))}` : '₹0'}
                        </td>
                      );
                    });
                  })()}
                  {(visibleColumns.length === 0 || visibleColumns.includes('total')) && (
                    <td
                      style={{
                        width: `${columnWidths['total'] || 135}px`,
                        minWidth: `${columnWidths['total'] || 135}px`,
                        maxWidth: `${columnWidths['total'] || 135}px`
                      }}
                      className="py-3 px-3 text-right bg-slate-950 border-l border-slate-800"
                    >
                      <span className={`inline-block px-2.5 py-0.5 rounded-lg font-black text-xs shadow-sm ${
                        activeGrandTotalDifference >= 0
                          ? 'bg-teal-500 text-slate-950'
                          : 'bg-rose-500 text-white'
                      }`}>
                        {activeGrandTotalDifference >= 0 ? `+ ${formatCurrency(activeGrandTotalDifference)}` : `- ${formatCurrency(Math.abs(activeGrandTotalDifference))}`}
                      </span>
                    </td>
                  )}
                </tr>

                {/* Bottom scroll buffer row ensuring sticky header never un-sticks or clips */}
                <tr>
                  <td
                    colSpan={displayMonthCols.length + (visibleColumns.length === 0 || visibleColumns.includes('index') ? 1 : 0) + (visibleColumns.length === 0 || visibleColumns.includes('property') ? 1 : 0) + (visibleColumns.length === 0 || visibleColumns.includes('total') ? 1 : 0)}
                    className="h-40 bg-transparent border-none pointer-events-none"
                  ></td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Pagination & Count Footer */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-5 py-3 border-t border-slate-200 bg-slate-50 text-xs font-bold text-slate-600 shrink-0">
              <div className="flex items-center gap-2">
                <span>
                  Showing {sortedRows.length === 0 ? 0 : isAllRows ? 1 : ((currentPage - 1) * effectivePageSize) + 1}
                  - {isAllRows ? sortedRows.length : Math.min(currentPage * effectivePageSize, sortedRows.length)} of {sortedRows.length} properties
                </span>
                <span className="text-slate-300">·</span>
                <span className="font-bold text-slate-700">
                  Net Cash Flow (Δ): <strong className={activeGrandTotalDifference >= 0 ? 'text-emerald-700' : 'text-rose-700'}>{formatCurrency(activeGrandTotalDifference)}</strong>
                </span>
                {sortConfig.key && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[11px] border border-emerald-200">
                    Sorted by {sortConfig.key} ({sortConfig.direction?.toUpperCase()})
                  </span>
                )}
              </div>
              {!isAllRows && totalPages > 1 && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(1)}
                    className="px-2.5 py-1 rounded border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 transition-colors cursor-pointer"
                  >
                    «
                  </button>
                  <button
                    type="button"
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    className="px-2.5 py-1 rounded border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 transition-colors cursor-pointer"
                  >
                    Prev
                  </button>
                  <span className="px-3 py-1 text-slate-700">
                    Page {currentPage} of {totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={currentPage >= totalPages}
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    className="px-2.5 py-1 rounded border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 transition-colors cursor-pointer"
                  >
                    Next
                  </button>
                  <button
                    type="button"
                    disabled={currentPage >= totalPages}
                    onClick={() => setCurrentPage(totalPages)}
                    className="px-2.5 py-1 rounded border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 transition-colors cursor-pointer"
                  >
                    »
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
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
