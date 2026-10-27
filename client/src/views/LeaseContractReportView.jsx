import React, { useState, useEffect, useMemo, useRef } from 'react';
import API from '../services/api';
import { formatCurrency } from '../utils/formatters';
import { 
  Building2, Calendar, Download, RefreshCw, Filter, 
  Search, CheckSquare, Square, FileSpreadsheet,
  CheckCircle2, AlertCircle, ArrowUpDown, ChevronDown, ChevronRight,
  Layers, Wallet, IndianRupee, PieChart, TrendingUp, TrendingDown,
  Users, Sparkles, X, Eye, EyeOff, FileText, Check, ShieldCheck, Table
} from 'lucide-react';
import ApexToolbar from '../components/ApexToolbar';
import { 
  useFrozenColumns, 
  getFrozenColumnStyle, 
  useResizableColumns, 
  ColumnHeaderCell, 
  useTableAutoWrap 
} from '../components/ColumnManager';

// Palette of distinctive, professional line accent colors for tenants
const TENANT_COLOR_PALETTES = [
  { bg: 'bg-emerald-500/15', text: 'text-emerald-900', border: 'border-emerald-500/40', bar: 'bg-emerald-500', dot: 'bg-emerald-600', badge: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
  { bg: 'bg-teal-500/15', text: 'text-teal-900', border: 'border-teal-500/40', bar: 'bg-teal-500', dot: 'bg-teal-600', badge: 'bg-teal-100 text-teal-800 border-teal-300' },
  { bg: 'bg-blue-500/15', text: 'text-blue-900', border: 'border-blue-500/40', bar: 'bg-blue-500', dot: 'bg-blue-600', badge: 'bg-blue-100 text-blue-800 border-blue-300' },
  { bg: 'bg-indigo-500/15', text: 'text-indigo-900', border: 'border-indigo-500/40', bar: 'bg-indigo-500', dot: 'bg-indigo-600', badge: 'bg-indigo-100 text-indigo-800 border-indigo-300' },
  { bg: 'bg-violet-500/15', text: 'text-violet-900', border: 'border-violet-500/40', bar: 'bg-violet-500', dot: 'bg-violet-600', badge: 'bg-violet-100 text-violet-800 border-violet-300' },
  { bg: 'bg-amber-500/15', text: 'text-amber-900', border: 'border-amber-500/40', bar: 'bg-amber-500', dot: 'bg-amber-600', badge: 'bg-amber-100 text-amber-800 border-amber-300' },
  { bg: 'bg-cyan-500/15', text: 'text-cyan-900', border: 'border-cyan-500/40', bar: 'bg-cyan-500', dot: 'bg-cyan-600', badge: 'bg-cyan-100 text-cyan-800 border-cyan-300' },
  { bg: 'bg-purple-500/15', text: 'text-purple-900', border: 'border-purple-500/40', bar: 'bg-purple-500', dot: 'bg-purple-600', badge: 'bg-purple-100 text-purple-800 border-purple-300' },
  { bg: 'bg-rose-500/15', text: 'text-rose-900', border: 'border-rose-500/40', bar: 'bg-rose-500', dot: 'bg-rose-600', badge: 'bg-rose-100 text-rose-800 border-rose-300' },
];

function getTenantTheme(tenantIdOrName) {
  if (!tenantIdOrName) return TENANT_COLOR_PALETTES[0];
  let hash = 0;
  for (let i = 0; i < tenantIdOrName.length; i++) {
    hash = tenantIdOrName.charCodeAt(i) + ((hash << 5) - hash);
  }
  const idx = Math.abs(hash) % TENANT_COLOR_PALETTES.length;
  return TENANT_COLOR_PALETTES[idx];
}

const MONTH_NAMES = [
  { num: '01', name: 'Jan' },
  { num: '02', name: 'Feb' },
  { num: '03', name: 'Mar' },
  { num: '04', name: 'Apr' },
  { num: '05', name: 'May' },
  { num: '06', name: 'Jun' },
  { num: '07', name: 'Jul' },
  { num: '08', name: 'Aug' },
  { num: '09', name: 'Sep' },
  { num: '10', name: 'Oct' },
  { num: '11', name: 'Nov' },
  { num: '12', name: 'Dec' },
];

export default function LeaseContractReportView() {
  // Filters State
  const [selectedYear, setSelectedYear] = useState(() => {
    return localStorage.getItem('lease_contract_year') || '2026';
  });
  const [startMonth, setStartMonth] = useState(() => {
    return localStorage.getItem('lease_contract_start_month') || '01';
  });
  const [endMonth, setEndMonth] = useState(() => {
    return localStorage.getItem('lease_contract_end_month') || '12';
  });
  const [selectedTenantFilter, setSelectedTenantFilter] = useState(() => {
    return localStorage.getItem('lease_contract_tenant_filter') || '';
  });
  const [selectedPropertyFilter, setSelectedPropertyFilter] = useState(() => {
    return localStorage.getItem('lease_contract_prop_filter') || '';
  });

  const [viewMode, setViewMode] = useState('graphical'); // 'graphical' | 'matrix'
  const [searchTerm, setSearchTerm] = useState('');
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [expandedProperties, setExpandedProperties] = useState({});

  // Tooltip / Details Popover State
  const [selectedCellInfo, setSelectedCellInfo] = useState(null);

  // Column management & layout
  const [frozenColumnCount, setFrozenColumnCount] = useFrozenColumns('lease_contract_freeze_v1', 0);
  const { autoWrap } = useTableAutoWrap();
  const [isHeaderSticky, setIsHeaderSticky] = useState(true);
  const [visibleColumns, setVisibleColumns] = useState([]);

  // Persist filters
  useEffect(() => {
    localStorage.setItem('lease_contract_year', selectedYear);
  }, [selectedYear]);

  useEffect(() => {
    localStorage.setItem('lease_contract_start_month', startMonth);
  }, [startMonth]);

  useEffect(() => {
    localStorage.setItem('lease_contract_end_month', endMonth);
  }, [endMonth]);

  useEffect(() => {
    localStorage.setItem('lease_contract_tenant_filter', selectedTenantFilter);
  }, [selectedTenantFilter]);

  useEffect(() => {
    localStorage.setItem('lease_contract_prop_filter', selectedPropertyFilter);
  }, [selectedPropertyFilter]);

  // Fetch report data
  const fetchReport = async () => {
    try {
      setLoading(true);
      let url = `/reports/lease-contract-matrix?year=${selectedYear}`;
      if (startMonth) url += `&startMonth=${startMonth}`;
      if (endMonth) url += `&endMonth=${endMonth}`;
      if (selectedTenantFilter) url += `&tenantId=${selectedTenantFilter}`;
      if (selectedPropertyFilter) url += `&propertyId=${selectedPropertyFilter}`;

      const res = await API.get(url);
      if (res.data?.success) {
        setReportData(res.data);
        // Expand all properties by default
        const initExpanded = {};
        res.data.rows?.forEach(r => {
          initExpanded[r.propertyId] = true;
        });
        setExpandedProperties(initExpanded);
      }
    } catch (err) {
      console.error('Error loading lease contract report:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, [selectedYear, startMonth, endMonth, selectedTenantFilter, selectedPropertyFilter]);

  // Months from report data
  const months = useMemo(() => {
    return reportData?.months || [];
  }, [reportData]);

  const monthLabels = useMemo(() => {
    return reportData?.monthLabels || [];
  }, [reportData]);

  // Available filters from backend
  const availableYears = useMemo(() => {
    return reportData?.availableYears || ['2026', '2025', '2024', '2027'];
  }, [reportData]);

  const tenantsList = useMemo(() => {
    return reportData?.tenants || [];
  }, [reportData]);

  const propertiesList = useMemo(() => {
    return reportData?.properties || [];
  }, [reportData]);

  // Columns definition for APEX Toolbar & resizable columns
  const baseColumns = useMemo(() => {
    const cols = [
      { id: 'index', label: '#', defaultVisible: true },
      { id: 'partition', label: 'Partition / Sub-Property', defaultVisible: true },
      { id: 'unitCode', label: 'Unit Code', defaultVisible: true },
      { id: 'tenant', label: 'Current Tenant', defaultVisible: true },
      { id: 'contractNo', label: 'Contract No', defaultVisible: true },
    ];
    monthLabels.forEach(m => {
      cols.push({
        id: m.key,
        label: m.label,
        shortLabel: m.shortLabel,
        defaultVisible: true
      });
    });
    cols.push({ id: 'total', label: 'Total Period Rent', defaultVisible: true });
    cols.push({ id: 'occupancy', label: 'Occupancy %', defaultVisible: true });
    return cols;
  }, [monthLabels]);

  const defaultWidths = useMemo(() => {
    const wMap = {
      index: 48,
      partition: 240,
      unitCode: 120,
      tenant: 180,
      contractNo: 140,
      total: 140,
      occupancy: 110,
    };
    monthLabels.forEach(m => {
      wMap[m.key] = 125;
    });
    return wMap;
  }, [monthLabels]);

  const {
    columnWidths,
    handleResizeStart,
    resetColumnWidths,
    hasCustomWidths
  } = useResizableColumns('lease_contract_widths_v1', defaultWidths);

  // Filter rows by search term
  const filteredRows = useMemo(() => {
    if (!reportData?.rows) return [];
    const q = searchTerm.trim().toLowerCase();
    if (!q) return reportData.rows;

    return reportData.rows.map(p => {
      const matchProp = (p.propertyName || '').toLowerCase().includes(q) ||
                        (p.propertyCode || '').toLowerCase().includes(q);

      const matchingUnits = p.units?.filter(u => {
        return (
          matchProp ||
          (u.subUnitPartition || '').toLowerCase().includes(q) ||
          (u.unitCode || '').toLowerCase().includes(q) ||
          (u.currentTenant || '').toLowerCase().includes(q) ||
          (u.contractNo || '').toLowerCase().includes(q) ||
          u.tenants?.some(t => t.toLowerCase().includes(q))
        );
      }) || [];

      return {
        ...p,
        units: matchingUnits,
        matchesSearch: matchProp || matchingUnits.length > 0
      };
    }).filter(p => p.matchesSearch || (p.units && p.units.length > 0));
  }, [reportData, searchTerm]);

  // Toggle single property expand/collapse
  const toggleProperty = (propId) => {
    setExpandedProperties(prev => ({
      ...prev,
      [propId]: !prev[propId]
    }));
  };

  // Expand / Collapse all
  const expandAll = () => {
    const map = {};
    reportData?.rows?.forEach(r => { map[r.propertyId] = true; });
    setExpandedProperties(map);
  };

  const collapseAll = () => {
    setExpandedProperties({});
  };

  // Export to Excel
  const handleExportExcel = async () => {
    try {
      setDownloading(true);
      let url = `/reports/export-lease-contract-matrix?year=${selectedYear}`;
      if (startMonth) url += `&startMonth=${startMonth}`;
      if (endMonth) url += `&endMonth=${endMonth}`;
      if (selectedTenantFilter) url += `&tenantId=${selectedTenantFilter}`;
      if (selectedPropertyFilter) url += `&propertyId=${selectedPropertyFilter}`;

      const res = await API.get(url, { responseType: 'blob' });
      const blob = new Blob([res.data], { 
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
      });
      const link = document.createElement('a');
      link.href = window.URL.createObjectURL(blob);
      link.download = `Lease_Contract_Report_${selectedYear}_${startMonth || '01'}_to_${endMonth || '12'}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error('Export failed:', err);
      alert('Failed to export Lease Contract Report to Excel');
    } finally {
      setDownloading(false);
    }
  };

  // Quick preset handlers
  const applyPreset = (presetType) => {
    if (presetType === 'full') {
      setStartMonth('01');
      setEndMonth('12');
    } else if (presetType === 'q1') {
      setStartMonth('01');
      setEndMonth('03');
    } else if (presetType === 'q2') {
      setStartMonth('04');
      setEndMonth('06');
    } else if (presetType === 'q3') {
      setStartMonth('07');
      setEndMonth('09');
    } else if (presetType === 'q4') {
      setStartMonth('10');
      setEndMonth('12');
    } else if (presetType === 'h1') {
      setStartMonth('01');
      setEndMonth('06');
    } else if (presetType === 'h2') {
      setStartMonth('07');
      setEndMonth('12');
    }
  };

  // Reset all filters
  const resetFilters = () => {
    setSelectedYear('2026');
    setStartMonth('01');
    setEndMonth('12');
    setSelectedTenantFilter('');
    setSelectedPropertyFilter('');
    setSearchTerm('');
  };

  const summary = reportData?.summary;

  return (
    <div className="space-y-3 pb-12">
      {/* Top Banner & KPI Metrics */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                Lease Contract Matrix
              </span>
              <span className="text-xs text-slate-500 font-bold">
                Direct from Lease Agreements
              </span>
            </div>
            <h1 className="text-xl font-black text-slate-900 tracking-tight mt-1 flex items-center gap-2">
              <span>Lease Contract Report</span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                {selectedYear !== 'all' ? `CY ${selectedYear}` : 'All Years'}
              </span>
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Monthly contracted lease rates in timeline line format. Vacant months are shown blank.
            </p>
          </div>

          {/* Quick Actions & View Switcher */}
          <div className="flex flex-wrap items-center gap-2">
            {/* View Mode Toggle */}
            <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-bold">
              <button
                type="button"
                onClick={() => setViewMode('graphical')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  viewMode === 'graphical'
                    ? 'bg-white text-emerald-800 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Graphical Timeline Line View (connected lines with monthly amounts)"
              >
                <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                <span>Line / Timeline</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('matrix')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  viewMode === 'matrix'
                    ? 'bg-white text-emerald-800 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Numeric Matrix View"
              >
                <Table className="w-3.5 h-3.5 text-emerald-600" />
                <span>Numeric Matrix</span>
              </button>
            </div>

            {/* Refresh */}
            <button
              type="button"
              onClick={fetchReport}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition-all shadow-xs cursor-pointer disabled:opacity-50"
              title="Refresh report data"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-emerald-600' : ''}`} />
              <span>Refresh</span>
            </button>

            {/* Export Excel */}
            <button
              type="button"
              onClick={handleExportExcel}
              disabled={downloading}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white text-xs font-black transition-all shadow-xs cursor-pointer disabled:opacity-50"
              title="Export complete Lease Contract Report to Excel"
            >
              <Download className={`w-3.5 h-3.5 ${downloading ? 'animate-bounce' : ''}`} />
              <span>{downloading ? 'Exporting...' : 'Export Excel'}</span>
            </button>
          </div>
        </div>

        {/* KPI Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 mt-4 pt-3 border-t border-slate-100">
          <div className="p-2.5 rounded-xl bg-slate-50/80 border border-slate-200/60">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Total Portfolio</span>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className="text-base font-black text-slate-900">{summary?.totalProperties || 0}</span>
              <span className="text-[11px] font-bold text-slate-500">props / {summary?.totalUnits || 0} units</span>
            </div>
          </div>

          <div className="p-2.5 rounded-xl bg-emerald-50/60 border border-emerald-200/60">
            <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider block">Period Contracted Lease</span>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className="text-base font-black text-emerald-900">
                {formatCurrency(summary?.grandTotalPeriodRent || 0)}
              </span>
            </div>
          </div>

          <div className="p-2.5 rounded-xl bg-teal-50/60 border border-teal-200/60">
            <span className="text-[10px] font-bold text-teal-700 uppercase tracking-wider block">Average Occupancy</span>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className="text-base font-black text-teal-900">{summary?.averageOccupancyPct || 0}%</span>
              <span className="text-[11px] font-medium text-teal-700">across period</span>
            </div>
          </div>

          <div className="p-2.5 rounded-xl bg-blue-50/60 border border-blue-200/60">
            <span className="text-[10px] font-bold text-blue-700 uppercase tracking-wider block">Occupied Unit-Months</span>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className="text-base font-black text-blue-900">{summary?.totalOccupiedSlots || 0}</span>
              <span className="text-[11px] font-medium text-slate-500">/ {summary?.totalUnitSlots || 0} slots</span>
            </div>
          </div>

          <div className="p-2.5 rounded-xl bg-amber-50/60 border border-amber-200/60">
            <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider block">Vacant Unit-Months</span>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className="text-base font-black text-amber-900">
                {(summary?.totalUnitSlots || 0) - (summary?.totalOccupiedSlots || 0)}
              </span>
              <span className="text-[11px] font-medium text-amber-700">vacancies</span>
            </div>
          </div>
        </div>
      </div>

      {/* Filter Control Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-3.5 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Main Filters: Year, Start Month, End Month, Tenant, Property */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Year Selector */}
            <div className="flex items-center gap-1.5">
              <label className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">Year:</label>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                className="px-2.5 py-1 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              >
                {availableYears.map(yr => (
                  <option key={yr} value={yr}>{yr}</option>
                ))}
                <option value="all">All Available Years</option>
              </select>
            </div>

            {/* From Month */}
            <div className="flex items-center gap-1.5">
              <label className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">From:</label>
              <select
                value={startMonth}
                onChange={(e) => setStartMonth(e.target.value)}
                className="px-2.5 py-1 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              >
                {MONTH_NAMES.map(m => (
                  <option key={m.num} value={m.num}>{m.name}</option>
                ))}
              </select>
            </div>

            {/* To Month */}
            <div className="flex items-center gap-1.5">
              <label className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">To:</label>
              <select
                value={endMonth}
                onChange={(e) => setEndMonth(e.target.value)}
                className="px-2.5 py-1 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              >
                {MONTH_NAMES.map(m => (
                  <option key={m.num} value={m.num}>{m.name}</option>
                ))}
              </select>
            </div>

            {/* Tenant Filter */}
            <div className="flex items-center gap-1.5">
              <label className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">Tenant:</label>
              <select
                value={selectedTenantFilter}
                onChange={(e) => setSelectedTenantFilter(e.target.value)}
                className="max-w-[190px] px-2.5 py-1 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 truncate"
              >
                <option value="">All Tenants</option>
                {tenantsList.map(t => (
                  <option key={t._id} value={t._id}>
                    {t.name} {t.tenantCode ? `(${t.tenantCode})` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Property Filter */}
            <div className="flex items-center gap-1.5">
              <label className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">Property:</label>
              <select
                value={selectedPropertyFilter}
                onChange={(e) => setSelectedPropertyFilter(e.target.value)}
                className="max-w-[210px] px-2.5 py-1 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 truncate"
              >
                <option value="">All Properties</option>
                {propertiesList.map(p => (
                  <option key={p._id} value={p._id}>{p.name}</option>
                ))}
              </select>
            </div>

            {/* Reset Button */}
            {(selectedTenantFilter || selectedPropertyFilter || startMonth !== '01' || endMonth !== '12' || selectedYear !== '2026') && (
              <button
                type="button"
                onClick={resetFilters}
                className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-rose-50 text-rose-700 hover:bg-rose-100 text-xs font-bold border border-rose-200 transition-colors cursor-pointer"
                title="Reset all filters"
              >
                <X className="w-3 h-3" />
                <span>Reset</span>
              </button>
            )}
          </div>

          {/* Quick Presets & Expand / Collapse Buttons */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider hidden sm:inline">Presets:</span>
            <button
              type="button"
              onClick={() => applyPreset('full')}
              className="px-2 py-0.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold transition-all cursor-pointer"
            >
              Full Year
            </button>
            <button
              type="button"
              onClick={() => applyPreset('h1')}
              className="px-2 py-0.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold transition-all cursor-pointer"
            >
              H1 (Jan-Jun)
            </button>
            <button
              type="button"
              onClick={() => applyPreset('h2')}
              className="px-2 py-0.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold transition-all cursor-pointer"
            >
              H2 (Jul-Dec)
            </button>

            <div className="h-4 w-px bg-slate-200 mx-1" />

            <button
              type="button"
              onClick={expandAll}
              className="px-2 py-0.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold transition-all cursor-pointer"
              title="Expand all properties"
            >
              Expand All
            </button>
            <button
              type="button"
              onClick={collapseAll}
              className="px-2 py-0.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold transition-all cursor-pointer"
              title="Collapse all properties"
            >
              Collapse All
            </button>
          </div>
        </div>
      </div>

      {/* APEX Toolbar */}
      <ApexToolbar
        search={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder="Search property, partition, unit code, tenant, contract..."
        columns={baseColumns}
        visibleColumns={visibleColumns}
        onChangeVisibleColumns={setVisibleColumns}
        columnWidths={columnWidths}
        onResetWidths={resetColumnWidths}
        isHeaderSticky={isHeaderSticky}
        onToggleHeaderSticky={() => setIsHeaderSticky(!isHeaderSticky)}
        frozenColumnCount={frozenColumnCount}
        onFrozenColumnCountChange={setFrozenColumnCount}
        onExport={handleExportExcel}
        storageKey="lease_contract_toolbar_v1"
      />

      {/* Main Matrix Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {loading ? (
          <div className="py-24 text-center">
            <RefreshCw className="w-8 h-8 text-emerald-600 animate-spin mx-auto mb-3" />
            <p className="text-sm font-bold text-slate-800">Calculating lease contract matrix...</p>
            <p className="text-xs text-slate-400 mt-1">Retrieving contracted monthly rates and active assignments</p>
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="py-20 text-center text-slate-400">
            <Building2 className="w-10 h-10 mx-auto mb-2 text-slate-300" />
            <p className="text-sm font-bold text-slate-600">No matching lease records found</p>
            <p className="text-xs text-slate-400 mt-1">Try adjusting your filters, year range, or search query</p>
          </div>
        ) : (
          <div className="overflow-x-auto select-text">
            <table className={`w-full text-xs text-left border-collapse ${autoWrap ? 'table-auto' : 'table-fixed'}`}>
              {/* Header */}
              <thead className={`bg-slate-50 text-slate-700 uppercase font-black text-[11px] tracking-wider border-b border-slate-200 select-none ${isHeaderSticky ? 'sticky top-0 z-20' : ''}`}>
                <tr>
                  <th 
                    style={{ width: columnWidths['index'] || 48 }}
                    className="p-2.5 text-center border-r border-slate-200 bg-slate-50 shrink-0"
                  >
                    #
                  </th>
                  <th 
                    style={{ width: columnWidths['partition'] || 240 }}
                    className="p-2.5 border-r border-slate-200 bg-slate-50 min-w-[200px]"
                  >
                    Property / Partition
                  </th>
                  <th 
                    style={{ width: columnWidths['unitCode'] || 120 }}
                    className="p-2.5 border-r border-slate-200 bg-slate-50 min-w-[110px]"
                  >
                    Unit Code
                  </th>
                  <th 
                    style={{ width: columnWidths['tenant'] || 180 }}
                    className="p-2.5 border-r border-slate-200 bg-slate-50 min-w-[150px]"
                  >
                    Current Tenant
                  </th>
                  <th 
                    style={{ width: columnWidths['contractNo'] || 140 }}
                    className="p-2.5 border-r border-slate-200 bg-slate-50 min-w-[130px]"
                  >
                    Contract No
                  </th>

                  {/* Monthly Columns */}
                  {monthLabels.map(m => (
                    <th
                      key={m.key}
                      style={{ width: columnWidths[m.key] || 125 }}
                      className="p-2.5 text-center border-r border-slate-200 bg-slate-50/90 font-black min-w-[115px]"
                    >
                      <div className="leading-tight">
                        <span className="block text-[11px] text-slate-900">{m.shortLabel}</span>
                        <span className="text-[9px] font-bold text-slate-400">{m.year}</span>
                      </div>
                    </th>
                  ))}

                  <th 
                    style={{ width: columnWidths['total'] || 140 }}
                    className="p-2.5 text-right border-r border-slate-200 bg-emerald-50 text-emerald-950 font-black min-w-[130px]"
                  >
                    Total Leased Rent
                  </th>
                  <th 
                    style={{ width: columnWidths['occupancy'] || 110 }}
                    className="p-2.5 text-center bg-teal-50 text-teal-950 font-black min-w-[100px]"
                  >
                    Occupancy
                  </th>
                </tr>
              </thead>

              {/* Body */}
              <tbody className="divide-y divide-slate-200">
                {filteredRows.map((prop, pIdx) => {
                  const isExpanded = !!expandedProperties[prop.propertyId];
                  const childUnits = prop.units || [];

                  return (
                    <React.Fragment key={prop.propertyId}>
                      {/* Property Header Row */}
                      <tr className="bg-slate-100/90 hover:bg-slate-200/60 font-black text-slate-900 transition-colors border-t-2 border-slate-300">
                        {/* Expand Button & Index */}
                        <td className="p-2 text-center border-r border-slate-200 font-extrabold text-slate-500">
                          <button
                            type="button"
                            onClick={() => toggleProperty(prop.propertyId)}
                            className="p-1 rounded-md hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
                            title={isExpanded ? 'Collapse units' : 'Expand units'}
                          >
                            {isExpanded ? (
                              <ChevronDown className="w-3.5 h-3.5" />
                            ) : (
                              <ChevronRight className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </td>

                        {/* Property Name */}
                        <td 
                          className="p-2.5 border-r border-slate-200 cursor-pointer"
                          onClick={() => toggleProperty(prop.propertyId)}
                        >
                          <div className="flex items-center gap-2">
                            <Building2 className="w-4 h-4 text-emerald-700 shrink-0" />
                            <span className="font-black text-slate-900 text-xs">
                              {prop.propertyName}
                            </span>
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-white text-slate-600 border border-slate-200">
                              {prop.unitsCount} {prop.unitsCount === 1 ? 'unit' : 'units'}
                            </span>
                          </div>
                        </td>

                        {/* Property Code */}
                        <td className="p-2.5 border-r border-slate-200 text-slate-500 font-bold text-[11px]">
                          {prop.propertyCode}
                        </td>

                        {/* Empty placeholders for Tenant & Contract columns at property level */}
                        <td className="p-2.5 border-r border-slate-200 text-slate-400 font-semibold text-[11px]">
                          —
                        </td>
                        <td className="p-2.5 border-r border-slate-200 text-slate-400 font-semibold text-[11px]">
                          —
                        </td>

                        {/* Property Monthly Sums */}
                        {monthLabels.map(m => {
                          const val = prop.monthlyRent[m.key] || 0;
                          const occCount = prop.monthlyOccupied[m.key] || 0;
                          const vacCount = prop.monthlyVacant[m.key] || 0;

                          return (
                            <td 
                              key={m.key} 
                              className="p-2 text-center border-r border-slate-200 font-black text-slate-900 bg-slate-50/50"
                            >
                              {val > 0 ? (
                                <div>
                                  <span className="text-xs">{formatCurrency(val)}</span>
                                  <span className="block text-[9px] font-bold text-slate-400">
                                    {occCount}/{prop.unitsCount} occ
                                  </span>
                                </div>
                              ) : (
                                <span className="text-slate-300 font-bold">—</span>
                              )}
                            </td>
                          );
                        })}

                        {/* Property Total Period Rent */}
                        <td className="p-2.5 text-right border-r border-slate-200 font-black text-emerald-900 bg-emerald-50/60 text-xs">
                          {formatCurrency(prop.totalPeriodRent || 0)}
                        </td>

                        {/* Property Occupancy */}
                        <td className="p-2.5 text-center font-black text-teal-900 bg-teal-50/60 text-xs">
                          {prop.occupancyPct}%
                        </td>
                      </tr>

                      {/* Child Partition / Unit Rows */}
                      {isExpanded && childUnits.map((unit, uIdx) => {
                        return (
                          <tr 
                            key={unit.unitId}
                            className="bg-white hover:bg-slate-50/80 transition-colors border-b border-slate-100"
                          >
                            {/* Sr Index */}
                            <td className="p-2 text-center border-r border-slate-200 text-slate-400 font-semibold text-[11px]">
                              {pIdx + 1}.{uIdx + 1}
                            </td>

                            {/* Partition Name */}
                            <td className="p-2.5 border-r border-slate-200 font-bold text-slate-800 pl-6">
                              <div className="flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-slate-300 shrink-0" />
                                <span className="text-xs truncate">{unit.subUnitPartition}</span>
                              </div>
                            </td>

                            {/* Unit Code */}
                            <td className="p-2.5 border-r border-slate-200 font-bold text-slate-600 text-[11px]">
                              <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 font-mono">
                                {unit.unitCode}
                              </span>
                            </td>

                            {/* Current Tenant */}
                            <td className="p-2.5 border-r border-slate-200 text-slate-800 font-extrabold text-xs">
                              {unit.currentTenant !== 'Vacant' ? (
                                <span className="text-slate-900 truncate block">
                                  {unit.currentTenant}
                                </span>
                              ) : (
                                <span className="text-amber-600 font-bold text-[11px] px-1.5 py-0.5 rounded bg-amber-50 border border-amber-200">
                                  Vacant
                                </span>
                              )}
                            </td>

                            {/* Contract No */}
                            <td className="p-2.5 border-r border-slate-200 text-slate-500 font-semibold text-[11px] truncate">
                              {unit.contractNo || '—'}
                            </td>

                            {/* Monthly Cells (Graphical Timeline Line Format) */}
                            {monthLabels.map((m, mIdx) => {
                              const cell = unit.monthlyCells[m.key];
                              const isVacant = !cell || cell.isVacant || cell.rate === null;

                              // If vacant: display completely blank cell as requested!
                              if (isVacant) {
                                return (
                                  <td 
                                    key={m.key} 
                                    className="p-1 border-r border-slate-200 text-center bg-slate-50/20"
                                    title={`${unit.subUnitPartition}: Vacant in ${m.label}`}
                                  >
                                    <div className="h-8 flex items-center justify-center">
                                      {/* Clean blank space indicating vacancy */}
                                      <span className="text-slate-200 text-[10px] select-none">·</span>
                                    </div>
                                  </td>
                                );
                              }

                              // It is leased! Check continuity with previous and next months for seamless line format
                              const prevMonthKey = monthLabels[mIdx - 1]?.key;
                              const nextMonthKey = monthLabels[mIdx + 1]?.key;
                              const prevCell = prevMonthKey ? unit.monthlyCells[prevMonthKey] : null;
                              const nextCell = nextMonthKey ? unit.monthlyCells[nextMonthKey] : null;

                              // Same contract continuity check
                              const isPrevConnected = prevCell && !prevCell.isVacant && 
                                (prevCell.contractNo === cell.contractNo || prevCell.tenantName === cell.tenantName);
                              const isNextConnected = nextCell && !nextCell.isVacant && 
                                (nextCell.contractNo === cell.contractNo || nextCell.tenantName === cell.tenantName);

                              const theme = getTenantTheme(cell.tenantId || cell.tenantName);

                              if (viewMode === 'matrix') {
                                // Numeric Matrix View
                                return (
                                  <td 
                                    key={m.key}
                                    onClick={() => setSelectedCellInfo({ ...cell, month: m.label, unit })}
                                    className="p-2 text-center border-r border-slate-200 font-bold text-slate-900 bg-white hover:bg-emerald-50/50 cursor-pointer transition-colors"
                                    title={`${cell.tenantName} (${cell.contractNo}): ${formatCurrency(cell.rate)}`}
                                  >
                                    <span className="text-xs font-black text-slate-900">
                                      {formatCurrency(cell.rate)}
                                    </span>
                                  </td>
                                );
                              }

                              // Graphical Timeline Line Format (Continuous connecting line/bar with amount)
                              return (
                                <td 
                                  key={m.key}
                                  className="p-0 border-r border-slate-200 relative"
                                  onClick={() => setSelectedCellInfo({ ...cell, month: m.label, unit })}
                                >
                                  <div 
                                    className={`h-8 flex items-center justify-center transition-all cursor-pointer border-y ${theme.border} ${theme.bg} ${
                                      isPrevConnected ? 'rounded-l-none border-l-0' : 'rounded-l-md border-l pl-1'
                                    } ${
                                      isNextConnected ? 'rounded-r-none border-r-0' : 'rounded-r-md border-r pr-1'
                                    } hover:brightness-95 hover:shadow-xs group`}
                                    title={`${cell.tenantName} | Contract: ${cell.contractNo || 'N/A'} | Rent: ${formatCurrency(cell.rate)}`}
                                  >
                                    {/* Monthly Amount Display */}
                                    <div className="flex items-center gap-1">
                                      {!isPrevConnected && (
                                        <span className={`w-1.5 h-1.5 rounded-full ${theme.dot} shrink-0`} />
                                      )}
                                      <span className={`text-[11px] font-black ${theme.text} tracking-tight`}>
                                        {formatCurrency(cell.rate)}
                                      </span>
                                    </div>
                                  </div>
                                </td>
                              );
                            })}

                            {/* Total Leased Rent for Period */}
                            <td className="p-2.5 text-right border-r border-slate-200 font-black text-slate-900 bg-emerald-50/30 text-xs">
                              {unit.totalPeriodRent > 0 ? formatCurrency(unit.totalPeriodRent) : '—'}
                            </td>

                            {/* Occupancy % */}
                            <td className="p-2.5 text-center font-bold text-xs">
                              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${
                                unit.occupancyPct >= 90
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : unit.occupancyPct >= 50
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-rose-100 text-rose-800'
                              }`}>
                                {unit.occupancyPct}%
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  );
                })}
              </tbody>

              {/* Bottom Summary Footer */}
              <tfoot className="bg-slate-100 text-slate-900 font-black text-xs border-t-2 border-slate-300">
                {/* Total Monthly Rent */}
                <tr className="bg-emerald-50/80 border-b border-emerald-200/60">
                  <td colSpan={5} className="p-2.5 text-right uppercase tracking-wider text-emerald-950 font-black border-r border-emerald-200/60">
                    Total Contracted Monthly Rent
                  </td>
                  {summary?.columnSummary?.map(col => (
                    <td key={col.key} className="p-2.5 text-center font-black text-emerald-950 border-r border-emerald-200/60">
                      {formatCurrency(col.totalRent)}
                    </td>
                  ))}
                  <td className="p-2.5 text-right font-black text-emerald-950 border-r border-emerald-200/60 text-sm">
                    {formatCurrency(summary?.grandTotalPeriodRent || 0)}
                  </td>
                  <td className="p-2.5 text-center font-black text-emerald-950 text-xs">
                    {summary?.averageOccupancyPct || 0}%
                  </td>
                </tr>

                {/* Occupied Partitions Count */}
                <tr className="border-b border-slate-200 bg-white">
                  <td colSpan={5} className="p-2 text-right uppercase tracking-wider text-slate-600 font-bold text-[11px] border-r border-slate-200">
                    Occupied Partitions
                  </td>
                  {summary?.columnSummary?.map(col => (
                    <td key={col.key} className="p-2 text-center text-slate-800 font-extrabold text-[11px] border-r border-slate-200">
                      <span className="text-emerald-700 font-black">{col.occupiedUnits}</span>
                      <span className="text-slate-400 font-medium">/{col.totalUnits}</span>
                    </td>
                  ))}
                  <td className="p-2 text-right font-extrabold text-slate-700 border-r border-slate-200">
                    {summary?.totalOccupiedSlots || 0} slots
                  </td>
                  <td className="p-2 text-center text-emerald-700 font-black">
                    {summary?.averageOccupancyPct || 0}%
                  </td>
                </tr>

                {/* Vacant Partitions Count */}
                <tr className="bg-slate-50">
                  <td colSpan={5} className="p-2 text-right uppercase tracking-wider text-slate-600 font-bold text-[11px] border-r border-slate-200">
                    Vacant Partitions
                  </td>
                  {summary?.columnSummary?.map(col => (
                    <td key={col.key} className="p-2 text-center font-extrabold text-[11px] border-r border-slate-200">
                      <span className={col.vacantUnits > 0 ? 'text-amber-700 font-black' : 'text-slate-400'}>
                        {col.vacantUnits}
                      </span>
                    </td>
                  ))}
                  <td className="p-2 text-right font-extrabold text-amber-700 border-r border-slate-200">
                    {(summary?.totalUnitSlots || 0) - (summary?.totalOccupiedSlots || 0)} slots
                  </td>
                  <td className="p-2 text-center text-slate-400 font-semibold text-[11px]">
                    —
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Contract & Rate Details Modal */}
      {selectedCellInfo && (
        <div className="fixed inset-0 bg-slate-950/60 z-50 flex items-center justify-center p-4 backdrop-blur-2xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between border-b border-slate-100 pb-3 mb-3">
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                  Lease Contract Detail
                </span>
                <h3 className="text-base font-black text-slate-900 mt-1">
                  {selectedCellInfo.unit?.subUnitPartition}
                </h3>
                <p className="text-xs text-slate-500 font-medium">
                  {selectedCellInfo.month} | Unit Code: {selectedCellInfo.unit?.unitCode}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedCellInfo(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2.5 text-xs">
              <div className="flex justify-between items-center p-2 rounded-lg bg-slate-50 border border-slate-200/60">
                <span className="text-slate-500 font-semibold">Tenant Name:</span>
                <span className="font-black text-slate-900">{selectedCellInfo.tenantName}</span>
              </div>

              <div className="flex justify-between items-center p-2 rounded-lg bg-slate-50 border border-slate-200/60">
                <span className="text-slate-500 font-semibold">Contract Number:</span>
                <span className="font-mono font-bold text-slate-900">{selectedCellInfo.contractNo || 'N/A'}</span>
              </div>

              <div className="flex justify-between items-center p-2 rounded-lg bg-emerald-50 border border-emerald-200/60">
                <span className="text-emerald-800 font-bold">Contracted Monthly Rent:</span>
                <span className="text-base font-black text-emerald-950">
                  {formatCurrency(selectedCellInfo.rate)}
                </span>
              </div>

              <div className="flex justify-between items-center p-2 rounded-lg bg-slate-50 border border-slate-200/60">
                <span className="text-slate-500 font-semibold">Contract Period:</span>
                <span className="font-bold text-slate-700">
                  {selectedCellInfo.startDate ? new Date(selectedCellInfo.startDate).toLocaleDateString('en-GB') : 'Open'}
                  {' to '}
                  {selectedCellInfo.endDate ? new Date(selectedCellInfo.endDate).toLocaleDateString('en-GB') : 'Ongoing'}
                </span>
              </div>

              <div className="flex justify-between items-center p-2 rounded-lg bg-slate-50 border border-slate-200/60">
                <span className="text-slate-500 font-semibold">Contract Status:</span>
                <span className={`px-2 py-0.5 rounded-full font-bold text-[11px] ${
                  selectedCellInfo.status === 'Active'
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                    : 'bg-slate-200 text-slate-700'
                }`}>
                  {selectedCellInfo.status || 'Active'}
                </span>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedCellInfo(null)}
                className="px-4 py-1.5 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
