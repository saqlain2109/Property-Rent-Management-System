import React, { useState, useEffect, useMemo } from 'react';
import API from '../services/api';
import { formatCurrency } from '../utils/formatters';
import { 
  Building2, Calendar, Download, RefreshCw, Filter, 
  Search, CheckSquare, Square, FileSpreadsheet,
  CheckCircle2, AlertCircle, ArrowUpDown, ChevronDown,
  Layers, Wallet, IndianRupee, PieChart, TrendingUp, TrendingDown,
  ArrowUp, ArrowDown
} from 'lucide-react';
import ApexToolbar from '../components/ApexToolbar';
import { cycleThreeStateSort, evaluateFilterRule } from '../utils/tableUtils';
import { useFrozenColumns, getFrozenColumnStyle, useResizableColumns, ColumnHeaderCell, useTableAutoWrap } from '../components/ColumnManager';

const PRESET_RANGES = [
  { id: 'sheet1', label: 'Master Sheet 1 (Mar 2025 – Feb 2026)', start: '2025-03', end: '2026-02' },
  { id: 'fy2526', label: 'FY 2025–26 (Apr 2025 – Mar 2026)', start: '2025-04', end: '2026-03' },
  { id: 'cy2026', label: 'CY 2026 (Jan 2026 – Dec 2026)', start: '2026-01', end: '2026-12' },
  { id: 'cy2025', label: 'CY 2025 (Jan 2025 – Dec 2025)', start: '2025-01', end: '2025-12' }
];

export default function PropertyMonthlyMatrixReport() {
  // Month Range Selection state with localStorage persistence
  const [startMonth, setStartMonth] = useState(() => {
    return localStorage.getItem('matrix_start_month') || '2025-03';
  });
  const [endMonth, setEndMonth] = useState(() => {
    return localStorage.getItem('matrix_end_month') || '2026-02';
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

  // APEX Toolbar & Global Grid Sort State
  const [rowsPerPage, setRowsPerPage] = useState('All');
  const [sortConfig, setSortConfig] = useState({ key: null, direction: null });
  const [isHeaderSticky, setIsHeaderSticky] = useState(true);
  const [frozenColumnCount, setFrozenColumnCount] = useFrozenColumns('matrix_sheet1_freeze_v1', 0);
  const [activeViewId, setActiveViewId] = useState(null);
  const [matrixFilters, setMatrixFilters] = useState([]);

  const columnsDef = useMemo(() => {
    const list = [
      { id: 'order', label: 'Sr.', defaultVisible: true },
      { id: 'partition', label: 'Partition', defaultVisible: true },
      { id: 'details', label: 'Property / Tenant / Head', defaultVisible: true },
    ];
    const mList = reportData?.months || reportData?.activeMonths || [];
    if (mList.length > 0) {
      mList.forEach(m => {
        list.push({ id: m.monthKey, label: m.shortLabel || m.monthName, defaultVisible: true });
      });
    }
    list.push({ id: 'total', label: 'Row Total (₹)', defaultVisible: true });
    list.push({ id: 'subtotal', label: 'Group Subtotal', defaultVisible: true });
    return list;
  }, [reportData]);

  const matrixColDefaults = useMemo(() => {
    const map = {
      order: 48,
      partition: 115,
      details: 230,
      total: 125,
      subtotal: 130
    };
    const mList = reportData?.months || reportData?.activeMonths || [];
    if (mList.length > 0) {
      mList.forEach(m => {
        map[m.monthKey] = 110;
      });
    }
    return map;
  }, [reportData]);

  const {
    columnWidths,
    handleResizeStart,
    resetColumnWidths
  } = useResizableColumns('property_matrix_report_widths_v2', matrixColDefaults);

  const { autoWrap } = useTableAutoWrap();

  const [visibleColumns, setVisibleColumns] = useState([]);
  useEffect(() => {
    if (columnsDef.length > 0 && visibleColumns.length === 0) {
      setVisibleColumns(columnsDef.map(c => c.id));
    }
  }, [columnsDef]);

  const handleSort = (colKey) => {
    setSortConfig(prev => cycleThreeStateSort(prev, colKey));
  };

  // Sync state to localStorage
  useEffect(() => {
    localStorage.setItem('matrix_start_month', startMonth);
  }, [startMonth]);

  useEffect(() => {
    localStorage.setItem('matrix_end_month', endMonth);
  }, [endMonth]);

  useEffect(() => {
    localStorage.setItem('matrix_prop_filter', selectedPropertyFilter);
  }, [selectedPropertyFilter]);

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
      let url = `/reports/property-monthly-matrix?startMonth=${startMonth}&endMonth=${endMonth}`;
      if (selectedPropertyFilter) {
        url += `&propertyId=${selectedPropertyFilter}`;
      }
      const res = await API.get(url);
      if (res.data.success) {
        setReportData(res.data);
      }
    } catch (err) {
      console.error('Failed to load matrix report:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMatrix();
  }, [startMonth, endMonth, selectedPropertyFilter]);

  // Active Months list directly from report data
  const activeMonths = useMemo(() => {
    return reportData?.months || [];
  }, [reportData]);

  // Detect active preset
  const activePreset = useMemo(() => {
    return PRESET_RANGES.find(p => p.start === startMonth && p.end === endMonth)?.id || 'custom';
  }, [startMonth, endMonth]);

  const handleApplyPreset = (presetId) => {
    const match = PRESET_RANGES.find(p => p.id === presetId);
    if (match) {
      setStartMonth(match.start);
      setEndMonth(match.end);
    }
  };

  const handleStartMonthChange = (e) => {
    const val = e.target.value;
    if (!val) return;
    setStartMonth(val);
    if (endMonth && val > endMonth) {
      setEndMonth(val);
    }
  };

  const handleEndMonthChange = (e) => {
    const val = e.target.value;
    if (!val) return;
    if (startMonth && val < startMonth) {
      setStartMonth(val);
    }
    setEndMonth(val);
  };

  // Download Excel
  const handleExportExcel = async () => {
    try {
      setDownloading(true);
      let url = `/reports/export-property-monthly-matrix-excel?startMonth=${startMonth}&endMonth=${endMonth}`;
      if (selectedPropertyFilter) {
        url += `&propertyId=${selectedPropertyFilter}`;
      }
      const res = await API.get(url, { responseType: 'blob' });
      const blob = new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const link = document.createElement('a');
      link.href = window.URL.createObjectURL(blob);
      link.download = `Master_Monthly_Statement_${startMonth}_to_${endMonth}.xlsx`;
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

  // Sorted Rent Groups and Units
  const sortedRentGroups = useMemo(() => {
    let groups = [...filteredRentGroups];
    if (!sortConfig.key || !sortConfig.direction) return groups;

    const { key, direction } = sortConfig;
    const isAsc = direction === 'asc';

    return groups.map(grp => {
      const sortedUnits = [...grp.units].sort((a, b) => {
        let valA, valB;
        if (key === 'partition') {
          valA = a.label || '';
          valB = b.label || '';
        } else if (key === 'details') {
          valA = a.tenant || grp.propertyName || '';
          valB = b.tenant || grp.propertyName || '';
        } else if (key === 'total') {
          valA = a.total || 0;
          valB = b.total || 0;
        } else if (key === 'order') {
          valA = a.srNo || 0;
          valB = b.srNo || 0;
        } else {
          // Month column
          valA = a.months?.[key] || 0;
          valB = b.months?.[key] || 0;
        }

        if (typeof valA === 'number' && typeof valB === 'number') {
          return isAsc ? valA - valB : valB - valA;
        }
        return isAsc 
          ? String(valA).localeCompare(String(valB), undefined, { numeric: true, sensitivity: 'base' })
          : String(valB).localeCompare(String(valA), undefined, { numeric: true, sensitivity: 'base' });
      });

      return {
        ...grp,
        units: sortedUnits
      };
    }).sort((a, b) => {
      if (key === 'details') {
        return isAsc
          ? a.propertyName.localeCompare(b.propertyName)
          : b.propertyName.localeCompare(a.propertyName);
      }
      if (key === 'total') {
        const totA = a.units.reduce((s, u) => s + (u.total || 0), 0);
        const totB = b.units.reduce((s, u) => s + (u.total || 0), 0);
        return isAsc ? totA - totB : totB - totA;
      }
      return 0;
    });
  }, [filteredRentGroups, sortConfig]);

  // Sorted Expense Groups and Heads
  const sortedExpenseGroups = useMemo(() => {
    let groups = [...filteredExpenseGroups];
    if (!sortConfig.key || !sortConfig.direction) return groups;

    const { key, direction } = sortConfig;
    const isAsc = direction === 'asc';

    return groups.map(grp => {
      const sortedHeads = [...grp.heads].sort((a, b) => {
        let valA, valB;
        if (key === 'details' || key === 'partition') {
          valA = a.headName || '';
          valB = b.headName || '';
        } else if (key === 'total') {
          valA = a.total || 0;
          valB = b.total || 0;
        } else {
          valA = a.months?.[key] || 0;
          valB = b.months?.[key] || 0;
        }

        if (typeof valA === 'number' && typeof valB === 'number') {
          return isAsc ? valA - valB : valB - valA;
        }
        return isAsc 
          ? String(valA).localeCompare(String(valB), undefined, { numeric: true, sensitivity: 'base' })
          : String(valB).localeCompare(String(valA), undefined, { numeric: true, sensitivity: 'base' });
      });

      return {
        ...grp,
        heads: sortedHeads
      };
    });
  }, [filteredExpenseGroups, sortConfig]);

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
    <div className="space-y-4">
      {/* Control Toolbar: Section Tabs, Property Filter, Month Range, Search, Refresh, Export Excel */}
      <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Left Controls: Section Switcher Tabs, Property Filter & Month Range */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Section Switcher Tabs */}
            <div className="flex items-center p-1 bg-slate-100 rounded-2xl border border-slate-200">
              <button
                type="button"
                onClick={() => setActiveSection('all')}
                className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
                  activeSection === 'all'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                All 3 Parts
              </button>
              <button
                type="button"
                onClick={() => setActiveSection('rent')}
                className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
                  activeSection === 'rent'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Part 1: Rent
              </button>
              <button
                type="button"
                onClick={() => setActiveSection('expenses')}
                className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
                  activeSection === 'expenses'
                    ? 'bg-rose-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Part 2: Expenses
              </button>
              <button
                type="button"
                onClick={() => setActiveSection('reconciliation')}
                className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
                  activeSection === 'reconciliation'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Part 3: Balance
              </button>
            </div>

            {/* Property Filter Dropdown */}
            <div>
              <select
                value={selectedPropertyFilter}
                onChange={(e) => setSelectedPropertyFilter(e.target.value)}
                className="px-3 py-2 rounded-2xl text-xs font-bold bg-slate-50 border border-slate-200 text-slate-700 hover:bg-slate-100 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
              >
                <option value="">All 11 Properties</option>
                {properties.map(p => (
                  <option key={p._id} value={p._id}>
                    {p.name} {p.propertyCode ? `(${p.propertyCode})` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Month Range Selector */}
            <div className="flex flex-wrap items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-2xl border border-slate-200">
              <Calendar className="w-4 h-4 text-emerald-600 shrink-0" />
              <div className="flex items-center gap-1.5 text-xs font-extrabold text-slate-700">
                <span className="text-[11px] font-bold text-slate-500 uppercase">From:</span>
                <input
                  type="month"
                  value={startMonth}
                  onChange={handleStartMonthChange}
                  className="px-2 py-1 rounded-xl text-xs font-extrabold bg-white border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer shadow-2xs"
                  title="Start Month (YYYY-MM)"
                />
              </div>

              <div className="flex items-center gap-1.5 text-xs font-extrabold text-slate-700">
                <span className="text-[11px] font-bold text-slate-500 uppercase">To:</span>
                <input
                  type="month"
                  value={endMonth}
                  onChange={handleEndMonthChange}
                  className="px-2 py-1 rounded-xl text-xs font-extrabold bg-white border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer shadow-2xs"
                  title="End Month (YYYY-MM)"
                />
              </div>

              {/* Quick Presets Dropdown */}
              <select
                value={activePreset}
                onChange={(e) => handleApplyPreset(e.target.value)}
                className="px-2.5 py-1 rounded-xl text-xs font-bold bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 transition-colors focus:outline-none cursor-pointer shadow-2xs"
                title="Quick Date Range Presets"
              >
                <option value="custom" disabled={activePreset !== 'custom'}>Custom Range</option>
                {PRESET_RANGES.map(p => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Right Controls: Search, Refresh, Export Excel */}
          <div className="flex flex-wrap items-center gap-2 ml-auto">
            {/* Quick Search */}
            <div className="relative w-44 sm:w-56">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search unit, head..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-2 rounded-2xl text-xs bg-slate-50 border border-slate-200 text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-2xs"
              />
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

            {/* Export Full Excel (Sheet 1) Button */}
            <button
              onClick={handleExportExcel}
              disabled={downloading || loading}
              className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-extrabold text-xs shadow-md shadow-emerald-600/20 transition-all cursor-pointer whitespace-nowrap"
            >
              <Download className="w-4 h-4" />
              <span>{downloading ? 'Exporting...' : 'Export Excel (Sheet 1)'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* APEX Toolbar for Master Matrix */}
      <ApexToolbar
        search={search}
        onSearchChange={setSearch}
        rowsPerPage={rowsPerPage}
        onRowsPerPageChange={setRowsPerPage}
        availableRowsOptions={[10, 25, 50, 100, 'All']}
        columns={columnsDef}
        visibleColumns={visibleColumns.length > 0 ? visibleColumns : columnsDef.map(c => c.id)}
        onChangeVisibleColumns={setVisibleColumns}
        columnWidths={columnWidths}
        onResetWidths={resetColumnWidths}
        filters={matrixFilters}
        onFiltersChange={setMatrixFilters}
        sortConfig={sortConfig}
        onSortChange={setSortConfig}
        isHeaderSticky={isHeaderSticky}
        onToggleHeaderSticky={setIsHeaderSticky}
        frozenColumnCount={frozenColumnCount}
        onFrozenColumnCountChange={setFrozenColumnCount}
        activeViewName={activeViewId}
        onViewChange={setActiveViewId}
        onExport={handleExportExcel}
        storageKey="matrix_sheet1_v1"
        primaryAction={
          <select
            value={activeSection}
            onChange={(e) => setActiveSection(e.target.value)}
            className="text-xs font-semibold px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400 cursor-pointer shrink-0"
          >
            <option value="all">All Sections (Rent & Expenses)</option>
            <option value="rent">1. Rent Income Only</option>
            <option value="expenses">2. Property Expenses Only</option>
            <option value="reconciliation">3. Balance Reconciliation</option>
          </select>
        }
      />

      {/* ======================================================== */}
      {/* THE MASTER FINANCIAL SPREADSHEET (SHEET 1) TABLE */}
      {/* ======================================================== */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-24 text-center">
            <RefreshCw className="w-8 h-8 text-emerald-600 animate-spin mx-auto mb-3" />
            <p className="text-sm font-bold text-slate-600">Loading Master Sheet 1 Matrix ({startMonth} to {endMonth})...</p>
          </div>
        ) : !reportData ? (
          <div className="py-24 text-center text-slate-400 text-sm">
            No report data available for this period.
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[75vh]">
            <table className="w-full text-left text-xs border-separate border-spacing-0">
              {/* STICKY MAIN TABLE HEADER */}
              <thead className={isHeaderSticky ? 'sticky top-0 z-20 bg-slate-900 text-white shadow-md' : 'bg-slate-900 text-white'}>
                <tr>
                  <ColumnHeaderCell
                    colId="order"
                    label="Sr."
                    align="center"
                    width={columnWidths['order']}
                    minWidth={40}
                    isSortable={true}
                    sortConfig={sortConfig}
                    onSort={handleSort}
                    isFilterable={false}
                    onResizeStart={handleResizeStart}
                    isFrozen={frozenColumnCount > 0}
                    frozenStyle={{
                      ...getFrozenColumnStyle(0, frozenColumnCount, visibleColumns, columnWidths, true),
                      backgroundColor: '#0f172a'
                    }}
                    isHeaderSticky={isHeaderSticky}
                    theme="dark"
                  />
                  <ColumnHeaderCell
                    colId="partition"
                    label="Partition"
                    width={columnWidths['partition']}
                    minWidth={90}
                    isSortable={true}
                    sortConfig={sortConfig}
                    onSort={handleSort}
                    isFilterable={false}
                    onResizeStart={handleResizeStart}
                    isFrozen={frozenColumnCount > 1}
                    frozenStyle={{
                      ...getFrozenColumnStyle(1, frozenColumnCount, visibleColumns, columnWidths, true),
                      backgroundColor: '#0f172a'
                    }}
                    isHeaderSticky={isHeaderSticky}
                    theme="dark"
                  />
                  <ColumnHeaderCell
                    colId="details"
                    label="Property / Tenant / Head"
                    width={columnWidths['details']}
                    minWidth={180}
                    isSortable={true}
                    sortConfig={sortConfig}
                    onSort={handleSort}
                    isFilterable={false}
                    onResizeStart={handleResizeStart}
                    isFrozen={frozenColumnCount > 2}
                    frozenStyle={{
                      ...getFrozenColumnStyle(2, frozenColumnCount, visibleColumns, columnWidths, true),
                      backgroundColor: '#0f172a'
                    }}
                    isHeaderSticky={isHeaderSticky}
                    theme="dark"
                  />
                  {activeMonths.map((m, mIdx) => (
                    <ColumnHeaderCell
                      key={m.monthKey}
                      colId={m.monthKey}
                      label={m.shortLabel || m.monthName}
                      align="right"
                      width={columnWidths[m.monthKey]}
                      minWidth={95}
                      isSortable={true}
                      sortConfig={sortConfig}
                      onSort={handleSort}
                      isFilterable={false}
                      onResizeStart={handleResizeStart}
                      isFrozen={frozenColumnCount > (3 + mIdx)}
                      frozenStyle={getFrozenColumnStyle(3 + mIdx, frozenColumnCount, visibleColumns, columnWidths, true)}
                      isHeaderSticky={isHeaderSticky}
                      theme="dark"
                    />
                  ))}
                  <ColumnHeaderCell
                    colId="total"
                    label="Row Total (₹)"
                    align="right"
                    width={columnWidths['total']}
                    minWidth={115}
                    isSortable={true}
                    sortConfig={sortConfig}
                    onSort={handleSort}
                    isFilterable={false}
                    onResizeStart={handleResizeStart}
                    isHeaderSticky={isHeaderSticky}
                    theme="dark"
                    style={{ backgroundColor: '#020617' }}
                  />
                  <ColumnHeaderCell
                    colId="subtotal"
                    label="Group Subtotal"
                    align="right"
                    width={columnWidths['subtotal']}
                    minWidth={115}
                    isSortable={true}
                    sortConfig={sortConfig}
                    onSort={handleSort}
                    isFilterable={false}
                    onResizeStart={handleResizeStart}
                    isHeaderSticky={isHeaderSticky}
                    theme="dark"
                    style={{ backgroundColor: '#020617' }}
                  />
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

                    {sortedRentGroups.map(grp => (
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

                    {sortedExpenseGroups.map(grp => (
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
