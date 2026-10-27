import React, { useState, useEffect, useMemo, useRef } from 'react';
import API from '../services/api';
import { formatCurrency, formatDate } from '../utils/formatters';
import { 
  Building2, Calendar, Download, RefreshCw, Filter, 
  Search, CheckSquare, Square, FileSpreadsheet,
  CheckCircle2, AlertCircle, ArrowUpDown, ChevronDown, ChevronRight,
  Layers, Wallet, IndianRupee, PieChart, TrendingUp, TrendingDown,
  Users, Sparkles, X, Eye, EyeOff, FileText, Check, ShieldCheck, Table,
  Phone, MapPin
} from 'lucide-react';
import ApexToolbar from '../components/ApexToolbar';
import { cycleThreeStateSort } from '../utils/tableUtils';
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

const formatMonthLabel = (m) => {
  if (!m) return '';
  const [y, mm] = m.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const idx = parseInt(mm, 10) - 1;
  return `${months[idx] || mm} ${y}`;
};

export default function LeaseContractReportView() {
  // Filters State (Month Wise Report Style)
  const [selectedYear, setSelectedYear] = useState(() => {
    return localStorage.getItem('lease_contract_year_v2') || 'all';
  });
  const [startMonth, setStartMonth] = useState(() => {
    return localStorage.getItem('lease_contract_start_month_v2') || '';
  });
  const [endMonth, setEndMonth] = useState(() => {
    return localStorage.getItem('lease_contract_end_month_v2') || '';
  });
  const [selectedTenantFilter, setSelectedTenantFilter] = useState(() => {
    return localStorage.getItem('lease_contract_tenant_filter_v2') || '';
  });
  const [selectedPropertyFilter, setSelectedPropertyFilter] = useState(() => {
    return localStorage.getItem('lease_contract_prop_filter_v2') || '';
  });

  const [searchTerm, setSearchTerm] = useState('');
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [expandedProperties, setExpandedProperties] = useState({});

  // Tooltip / Details Popover State
  const [selectedCellInfo, setSelectedCellInfo] = useState(null);

  // Column management & layout
  const [sortConfig, setSortConfig] = useState({ key: null, direction: null });
  const [frozenColumnCount, setFrozenColumnCount] = useFrozenColumns('lease_contract_freeze_v1', 0);
  const { autoWrap } = useTableAutoWrap();
  const [isHeaderSticky, setIsHeaderSticky] = useState(true);
  const [visibleColumns, setVisibleColumns] = useState([]);

  const handleHeaderSort = (colId) => {
    if (colId === 'index') return;
    setSortConfig(prev => cycleThreeStateSort(prev, colId));
  };

  // Persist filters
  useEffect(() => {
    localStorage.setItem('lease_contract_year_v2', selectedYear);
  }, [selectedYear]);

  useEffect(() => {
    localStorage.setItem('lease_contract_start_month_v2', startMonth);
  }, [startMonth]);

  useEffect(() => {
    localStorage.setItem('lease_contract_end_month_v2', endMonth);
  }, [endMonth]);

  useEffect(() => {
    localStorage.setItem('lease_contract_tenant_filter_v2', selectedTenantFilter);
  }, [selectedTenantFilter]);

  useEffect(() => {
    localStorage.setItem('lease_contract_prop_filter_v2', selectedPropertyFilter);
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
    return reportData?.availableYears || ['2027', '2026', '2025', '2024', '2023', '2022', '2021'];
  }, [reportData]);

  const availableMonths = useMemo(() => {
    if (reportData?.availableMonths && reportData.availableMonths.length > 0) {
      return reportData.availableMonths;
    }
    if (reportData?.months && reportData.months.length > 0) {
      return reportData.months;
    }
    return [];
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

  // Sorted Rows & Units based on sortConfig
  const sortedRows = useMemo(() => {
    let rows = [...filteredRows];
    if (!sortConfig.key || !sortConfig.direction) return rows;

    const { key, direction } = sortConfig;
    const isAsc = direction === 'asc';

    return rows.map(p => {
      const sortedUnits = [...(p.units || [])].sort((a, b) => {
        let valA, valB;
        if (key === 'partition') {
          valA = a.subUnitPartition || '';
          valB = b.subUnitPartition || '';
        } else if (key === 'unitCode') {
          valA = a.unitCode || '';
          valB = b.unitCode || '';
        } else if (key === 'tenant') {
          valA = a.currentTenant || '';
          valB = b.currentTenant || '';
        } else if (key === 'contractNo') {
          valA = a.contractNo || '';
          valB = b.contractNo || '';
        } else if (key === 'total') {
          valA = a.totalPeriodRent || 0;
          valB = b.totalPeriodRent || 0;
        } else if (key === 'occupancy') {
          valA = a.occupancyPct || 0;
          valB = b.occupancyPct || 0;
        } else {
          // Month column
          valA = a.monthlyCells?.[key]?.rate || 0;
          valB = b.monthlyCells?.[key]?.rate || 0;
        }

        if (typeof valA === 'number' && typeof valB === 'number') {
          return isAsc ? valA - valB : valB - valA;
        }
        return isAsc
          ? String(valA).localeCompare(String(valB), undefined, { numeric: true, sensitivity: 'base' })
          : String(valB).localeCompare(String(valA), undefined, { numeric: true, sensitivity: 'base' });
      });

      return {
        ...p,
        units: sortedUnits
      };
    }).sort((a, b) => {
      let valA, valB;
      if (key === 'partition') {
        valA = a.propertyName || '';
        valB = b.propertyName || '';
      } else if (key === 'unitCode') {
        valA = a.propertyCode || '';
        valB = b.propertyCode || '';
      } else if (key === 'total') {
        valA = a.totalPeriodRent || 0;
        valB = b.totalPeriodRent || 0;
      } else if (key === 'occupancy') {
        valA = a.occupancyPct || 0;
        valB = b.occupancyPct || 0;
      } else {
        valA = a.monthlyRent?.[key] || 0;
        valB = b.monthlyRent?.[key] || 0;
      }

      if (typeof valA === 'number' && typeof valB === 'number') {
        return isAsc ? valA - valB : valB - valA;
      }
      return isAsc
        ? String(valA).localeCompare(String(valB), undefined, { numeric: true, sensitivity: 'base' })
        : String(valB).localeCompare(String(valA), undefined, { numeric: true, sensitivity: 'base' });
    });
  }, [filteredRows, sortConfig]);

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
    const yr = selectedYear !== 'all' ? selectedYear : '2026';
    if (presetType === 'full') {
      setStartMonth(`${yr}-01`);
      setEndMonth(`${yr}-12`);
    } else if (presetType === 'h1') {
      setStartMonth(`${yr}-01`);
      setEndMonth(`${yr}-06`);
    } else if (presetType === 'h2') {
      setStartMonth(`${yr}-07`);
      setEndMonth(`${yr}-12`);
    }
  };

  // Reset all filters
  const resetFilters = () => {
    setSelectedYear('all');
    setStartMonth('');
    setEndMonth('');
    setSelectedTenantFilter('');
    setSelectedPropertyFilter('');
    setSearchTerm('');
  };

  const summary = reportData?.summary;

  return (
    <div className="space-y-2.5 pb-12">
      {/* Organized One-Line Filter Strip (Month Wise Report Style) */}
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
              {availableMonths.map(m => (
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
              {availableMonths.map(m => (
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
                const val = e.target.value;
                setSelectedYear(val);
                if (val !== 'all') {
                  setStartMonth('');
                  setEndMonth('');
                }
              }}
              className="bg-transparent font-bold text-slate-700 focus:outline-none cursor-pointer"
            >
              <option value="all">All Years</option>
              {availableYears.map(y => (
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
              onChange={(e) => setSelectedPropertyFilter(e.target.value)}
              className="bg-transparent font-bold text-slate-800 focus:outline-none cursor-pointer max-w-[200px] truncate"
            >
              <option value="">All Properties ({propertiesList.length})</option>
              {propertiesList.map(p => (
                <option key={p._id} value={p._id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {/* Tenant Filter Dropdown */}
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-2.5 py-1.5 rounded-xl text-xs shadow-2xs">
            <Users className="w-3.5 h-3.5 text-teal-600 shrink-0" />
            <label className="font-bold text-slate-500 whitespace-nowrap">Tenant:</label>
            <select
              value={selectedTenantFilter}
              onChange={(e) => setSelectedTenantFilter(e.target.value)}
              className="bg-transparent font-bold text-slate-800 focus:outline-none cursor-pointer max-w-[200px] truncate"
            >
              <option value="">All Tenants ({tenantsList.length})</option>
              {tenantsList.map(t => (
                <option key={t._id} value={t._id}>
                  {t.name} {t.tenantCode ? `(${t.tenantCode})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Reset Filters Button */}
          {(startMonth || endMonth || selectedYear !== 'all' || selectedPropertyFilter || selectedTenantFilter) && (
            <button
              type="button"
              onClick={resetFilters}
              className="px-2.5 py-1.5 text-xs font-bold text-rose-600 hover:text-rose-700 hover:bg-rose-50 border border-rose-200/60 rounded-xl transition-colors flex items-center gap-1 cursor-pointer"
              title="Clear all filters"
            >
              <X className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>
          )}

          {/* Presets & Expand / Collapse */}
          <div className="flex items-center gap-1.5 flex-wrap ml-1">
            <button
              type="button"
              onClick={() => applyPreset('full')}
              className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold transition-all cursor-pointer"
            >
              Full Year
            </button>
            <button
              type="button"
              onClick={() => applyPreset('h1')}
              className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold transition-all cursor-pointer"
            >
              H1
            </button>
            <button
              type="button"
              onClick={() => applyPreset('h2')}
              className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold transition-all cursor-pointer"
            >
              H2
            </button>
            <div className="h-4 w-px bg-slate-200 mx-0.5" />
            <button
              type="button"
              onClick={expandAll}
              className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold transition-all cursor-pointer"
              title="Expand all properties"
            >
              Expand All
            </button>
            <button
              type="button"
              onClick={collapseAll}
              className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold transition-all cursor-pointer"
              title="Collapse all properties"
            >
              Collapse All
            </button>
          </div>
        </div>

        {/* Right side: Refresh & Export buttons */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchReport}
            disabled={loading}
            className="p-2 rounded-xl border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors disabled:opacity-50 cursor-pointer shadow-2xs"
            title="Refresh Matrix"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-emerald-600' : ''}`} />
          </button>
          <button
            type="button"
            onClick={handleExportExcel}
            disabled={downloading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white text-xs font-black transition-all shadow-2xs cursor-pointer disabled:opacity-50"
            title="Export complete Lease Contract Report to Excel"
          >
            <Download className={`w-3.5 h-3.5 ${downloading ? 'animate-bounce' : ''}`} />
            <span>{downloading ? 'Exporting...' : 'Export Excel'}</span>
          </button>
        </div>
      </div>

      {/* Sleek Compact KPI Summary Strip (Matching Month Wise Report Style) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        <div className="bg-white px-3 py-2 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total Portfolio</span>
            <span className="text-base font-black text-slate-900">
              {summary?.totalProperties || 0} <span className="text-xs font-bold text-slate-500">props / {summary?.totalUnits || 0} units</span>
            </span>
          </div>
          <span className="p-1.5 rounded-lg bg-slate-50 text-slate-600">
            <Building2 className="w-3.5 h-3.5" />
          </span>
        </div>

        <div className="bg-white px-3 py-2 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Period Contracted Lease</span>
            <span className="text-base font-black text-emerald-700">{formatCurrency(summary?.grandTotalPeriodRent || 0)}</span>
          </div>
          <span className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600">
            <TrendingUp className="w-3.5 h-3.5" />
          </span>
        </div>

        <div className="bg-white px-3 py-2 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Average Occupancy</span>
            <span className="text-base font-black text-teal-700">{summary?.averageOccupancyPct || 0}%</span>
          </div>
          <span className="p-1.5 rounded-lg bg-teal-50 text-teal-600">
            <PieChart className="w-3.5 h-3.5" />
          </span>
        </div>

        <div className="bg-white px-3 py-2 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Occupied Slots</span>
            <span className="text-base font-black text-blue-700">
              {summary?.totalOccupiedSlots || 0} <span className="text-xs font-medium text-slate-400">/ {summary?.totalUnitSlots || 0}</span>
            </span>
          </div>
          <span className="p-1.5 rounded-lg bg-blue-50 text-blue-600">
            <CheckCircle2 className="w-3.5 h-3.5" />
          </span>
        </div>

        <div className="bg-white px-3 py-2 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Vacant Slots</span>
            <span className="text-base font-black text-amber-600">
              {(summary?.totalUnitSlots || 0) - (summary?.totalOccupiedSlots || 0)}
            </span>
          </div>
          <span className="p-1.5 rounded-lg bg-amber-50 text-amber-600">
            <AlertCircle className="w-3.5 h-3.5" />
          </span>
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
        sortConfig={sortConfig}
        onSortChange={setSortConfig}
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
        ) : sortedRows.length === 0 ? (
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

                  {/* Partition / Property */}
                  <th 
                    style={{ width: columnWidths['partition'] || 240 }}
                    className="p-2.5 border-r border-slate-200 bg-slate-50 min-w-[200px]"
                  >
                    <button
                      type="button"
                      onClick={() => handleHeaderSort('partition')}
                      className="group/btn flex items-center gap-1.5 w-full text-left font-black cursor-pointer hover:text-emerald-700 transition-colors"
                      title="Sort by Property / Partition"
                    >
                      <span className="truncate">Property / Partition</span>
                      <span className="inline-flex shrink-0 items-center justify-center w-3.5 h-3.5">
                        {sortConfig.key === 'partition' ? (
                          sortConfig.direction === 'desc' ? (
                            <span className="text-emerald-700 font-extrabold text-[13px] leading-none">↓</span>
                          ) : (
                            <span className="text-emerald-700 font-extrabold text-[13px] leading-none">↑</span>
                          )
                        ) : (
                          <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-0 group-hover/btn:opacity-100 transition-opacity" />
                        )}
                      </span>
                    </button>
                  </th>

                  {/* Unit Code */}
                  <th 
                    style={{ width: columnWidths['unitCode'] || 120 }}
                    className="p-2.5 border-r border-slate-200 bg-slate-50 min-w-[110px]"
                  >
                    <button
                      type="button"
                      onClick={() => handleHeaderSort('unitCode')}
                      className="group/btn flex items-center gap-1.5 w-full text-left font-black cursor-pointer hover:text-emerald-700 transition-colors"
                      title="Sort by Unit Code"
                    >
                      <span className="truncate">Unit Code</span>
                      <span className="inline-flex shrink-0 items-center justify-center w-3.5 h-3.5">
                        {sortConfig.key === 'unitCode' ? (
                          sortConfig.direction === 'desc' ? (
                            <span className="text-emerald-700 font-extrabold text-[13px] leading-none">↓</span>
                          ) : (
                            <span className="text-emerald-700 font-extrabold text-[13px] leading-none">↑</span>
                          )
                        ) : (
                          <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-0 group-hover/btn:opacity-100 transition-opacity" />
                        )}
                      </span>
                    </button>
                  </th>

                  {/* Current Tenant */}
                  <th 
                    style={{ width: columnWidths['tenant'] || 180 }}
                    className="p-2.5 border-r border-slate-200 bg-slate-50 min-w-[150px]"
                  >
                    <button
                      type="button"
                      onClick={() => handleHeaderSort('tenant')}
                      className="group/btn flex items-center gap-1.5 w-full text-left font-black cursor-pointer hover:text-emerald-700 transition-colors"
                      title="Sort by Current Tenant"
                    >
                      <span className="truncate">Current Tenant</span>
                      <span className="inline-flex shrink-0 items-center justify-center w-3.5 h-3.5">
                        {sortConfig.key === 'tenant' ? (
                          sortConfig.direction === 'desc' ? (
                            <span className="text-emerald-700 font-extrabold text-[13px] leading-none">↓</span>
                          ) : (
                            <span className="text-emerald-700 font-extrabold text-[13px] leading-none">↑</span>
                          )
                        ) : (
                          <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-0 group-hover/btn:opacity-100 transition-opacity" />
                        )}
                      </span>
                    </button>
                  </th>

                  {/* Contract No */}
                  <th 
                    style={{ width: columnWidths['contractNo'] || 140 }}
                    className="p-2.5 border-r border-slate-200 bg-slate-50 min-w-[130px]"
                  >
                    <button
                      type="button"
                      onClick={() => handleHeaderSort('contractNo')}
                      className="group/btn flex items-center gap-1.5 w-full text-left font-black cursor-pointer hover:text-emerald-700 transition-colors"
                      title="Sort by Contract No"
                    >
                      <span className="truncate">Contract No</span>
                      <span className="inline-flex shrink-0 items-center justify-center w-3.5 h-3.5">
                        {sortConfig.key === 'contractNo' ? (
                          sortConfig.direction === 'desc' ? (
                            <span className="text-emerald-700 font-extrabold text-[13px] leading-none">↓</span>
                          ) : (
                            <span className="text-emerald-700 font-extrabold text-[13px] leading-none">↑</span>
                          )
                        ) : (
                          <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-0 group-hover/btn:opacity-100 transition-opacity" />
                        )}
                      </span>
                    </button>
                  </th>

                  {/* Monthly Columns */}
                  {monthLabels.map(m => (
                    <th
                      key={m.key}
                      style={{ width: columnWidths[m.key] || 125 }}
                      className="p-2 text-center border-r border-slate-200 bg-slate-50/90 font-black min-w-[115px]"
                    >
                      <button
                        type="button"
                        onClick={() => handleHeaderSort(m.key)}
                        className="group/btn inline-flex flex-col items-center justify-center w-full cursor-pointer hover:text-emerald-700 transition-colors"
                        title={`Sort by ${m.label}`}
                      >
                        <div className="flex items-center gap-1">
                          <span className="block text-[11px] text-slate-900 leading-tight">{m.shortLabel}</span>
                          <span className="inline-flex shrink-0 items-center justify-center w-3 h-3">
                            {sortConfig.key === m.key ? (
                              sortConfig.direction === 'desc' ? (
                                <span className="text-emerald-700 font-extrabold text-[11px] leading-none">↓</span>
                              ) : (
                                <span className="text-emerald-700 font-extrabold text-[11px] leading-none">↑</span>
                              )
                            ) : (
                              <ArrowUpDown className="w-2.5 h-2.5 text-slate-400 opacity-0 group-hover/btn:opacity-100 transition-opacity" />
                            )}
                          </span>
                        </div>
                        <span className="text-[9px] font-bold text-slate-400 leading-none">{m.year}</span>
                      </button>
                    </th>
                  ))}

                  {/* Total Leased Rent */}
                  <th 
                    style={{ width: columnWidths['total'] || 140 }}
                    className="p-2.5 text-right border-r border-slate-200 bg-emerald-50 text-emerald-950 font-black min-w-[130px]"
                  >
                    <button
                      type="button"
                      onClick={() => handleHeaderSort('total')}
                      className="group/btn flex items-center justify-end gap-1.5 w-full font-black cursor-pointer hover:text-emerald-700 transition-colors"
                      title="Sort by Total Leased Rent"
                    >
                      <span className="truncate">Total Leased Rent</span>
                      <span className="inline-flex shrink-0 items-center justify-center w-3.5 h-3.5">
                        {sortConfig.key === 'total' ? (
                          sortConfig.direction === 'desc' ? (
                            <span className="text-emerald-700 font-extrabold text-[13px] leading-none">↓</span>
                          ) : (
                            <span className="text-emerald-700 font-extrabold text-[13px] leading-none">↑</span>
                          )
                        ) : (
                          <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-0 group-hover/btn:opacity-100 transition-opacity" />
                        )}
                      </span>
                    </button>
                  </th>

                  {/* Occupancy % */}
                  <th 
                    style={{ width: columnWidths['occupancy'] || 110 }}
                    className="p-2.5 text-center bg-teal-50 text-teal-950 font-black min-w-[100px]"
                  >
                    <button
                      type="button"
                      onClick={() => handleHeaderSort('occupancy')}
                      className="group/btn flex items-center justify-center gap-1.5 w-full font-black cursor-pointer hover:text-teal-700 transition-colors"
                      title="Sort by Occupancy %"
                    >
                      <span className="truncate">Occupancy</span>
                      <span className="inline-flex shrink-0 items-center justify-center w-3.5 h-3.5">
                        {sortConfig.key === 'occupancy' ? (
                          sortConfig.direction === 'desc' ? (
                            <span className="text-teal-700 font-extrabold text-[13px] leading-none">↓</span>
                          ) : (
                            <span className="text-teal-700 font-extrabold text-[13px] leading-none">↑</span>
                          )
                        ) : (
                          <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-0 group-hover/btn:opacity-100 transition-opacity" />
                        )}
                      </span>
                    </button>
                  </th>
                </tr>
              </thead>

              {/* Body */}
              <tbody className="divide-y divide-slate-200">
                {sortedRows.map((prop, pIdx) => {
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
                              onClick={() => {
                                setSelectedCellInfo({
                                  isPropertySummary: true,
                                  property: prop,
                                  propertyName: prop.propertyName,
                                  propertyCode: prop.propertyCode,
                                  month: m.label,
                                  monthKey: m.key,
                                  val,
                                  occCount,
                                  totalUnits: prop.unitsCount,
                                  breakdown: prop.monthlyBreakdown?.[m.key] || []
                                });
                              }}
                              className="p-2 text-center border-r border-slate-200 font-black text-slate-900 bg-slate-50/50 hover:bg-emerald-50/70 cursor-pointer transition-colors"
                              title={`Click to view ${prop.propertyName} units in ${m.label}`}
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

                              // If vacant: display completely blank cell with click-to-view
                              if (isVacant) {
                                return (
                                  <td 
                                    key={m.key} 
                                    onClick={() => setSelectedCellInfo({
                                      isVacant: true,
                                      month: m.label,
                                      unit,
                                      propertyName: prop.propertyName,
                                      propertyCode: prop.propertyCode,
                                      unitName: unit.subUnitPartition,
                                      unitCode: unit.unitCode,
                                      areaSqFt: unit.areaSqFt,
                                      expectedRate: unit.expectedRate
                                    })}
                                    className="p-1 border-r border-slate-200 text-center bg-slate-50/20 hover:bg-amber-50/40 cursor-pointer transition-colors"
                                    title={`${unit.subUnitPartition}: Vacant in ${m.label} (Click for details)`}
                                  >
                                    <div className="h-8 flex items-center justify-center">
                                      {/* Clean blank space indicating vacancy */}
                                      <span className="text-slate-200 text-[10px] select-none hover:text-slate-400 font-bold">·</span>
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

                              // Graphical Timeline Line Format (Continuous connecting line/bar with amount)
                              return (
                                <td 
                                  key={m.key}
                                  className="p-0 border-r border-slate-200 relative"
                                  onClick={() => setSelectedCellInfo({
                                    ...cell,
                                    month: m.label,
                                    unit,
                                    propertyName: prop.propertyName,
                                    propertyCode: prop.propertyCode
                                  })}
                                >
                                  <div 
                                    className={`h-8 flex items-center justify-center transition-all cursor-pointer border-y ${theme.border} ${theme.bg} ${
                                      isPrevConnected ? 'rounded-l-none border-l-0' : 'rounded-l-md border-l pl-1'
                                    } ${
                                      isNextConnected ? 'rounded-r-none border-r-0' : 'rounded-r-md border-r pr-1'
                                    } hover:brightness-95 hover:shadow-xs group`}
                                    title={`Click for lease contract details: ${cell.tenantName} | ${cell.contractNo || 'N/A'} | ${formatCurrency(cell.rate)}`}
                                  >
                                    {/* Monthly Amount Display */}
                                    <div className="flex items-center gap-1">
                                      {!isPrevConnected && (
                                        <span className={`w-1.5 h-1.5 rounded-full ${theme.dot} shrink-0`} />
                                      )}
                                      <span className={`text-[11px] font-black tracking-tight ${theme.text}`}>
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

      {/* Drilldown Modal: Comprehensive Lease Contract Detail, Vacant Detail, or Property Summary */}
      {selectedCellInfo && (
        <div className="fixed inset-0 bg-slate-950/60 z-50 flex items-center justify-center p-4 backdrop-blur-2xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-lg w-full p-5 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-slate-100 pb-3 mb-3">
              <div className="min-w-0 pr-2">
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md border ${
                    selectedCellInfo.isPropertySummary 
                      ? 'bg-blue-50 text-blue-700 border-blue-200'
                      : selectedCellInfo.isVacant 
                        ? 'bg-amber-50 text-amber-700 border-amber-200'
                        : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  }`}>
                    {selectedCellInfo.isPropertySummary 
                      ? 'Property Lease Summary' 
                      : selectedCellInfo.isVacant 
                        ? 'Vacant Unit Detail' 
                        : 'Lease Contract Detail'}
                  </span>
                  <span className="text-xs font-bold text-slate-500">
                    {selectedCellInfo.month}
                  </span>
                </div>
                <h3 className="text-base font-black text-slate-900 mt-1 truncate">
                  {selectedCellInfo.isPropertySummary 
                    ? selectedCellInfo.propertyName 
                    : (selectedCellInfo.unitName || selectedCellInfo.unit?.subUnitPartition || 'Unit')}
                </h3>
                <p className="text-xs text-slate-500 font-medium truncate">
                  {selectedCellInfo.propertyName && !selectedCellInfo.isPropertySummary && (
                    <span>{selectedCellInfo.propertyName} · </span>
                  )}
                  <span>Unit Code: {selectedCellInfo.unitCode || selectedCellInfo.unit?.unitCode || '—'}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedCellInfo(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            {selectedCellInfo.isPropertySummary ? (
              // CASE 1: Property monthly units breakdown
              <div className="space-y-3 text-xs">
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total Contracted Rent</span>
                    <span className="text-base font-black text-emerald-800">{formatCurrency(selectedCellInfo.val)}</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Occupancy</span>
                    <span className="text-base font-black text-slate-900">
                      {selectedCellInfo.occCount} / {selectedCellInfo.totalUnits} <span className="text-xs font-bold text-slate-500">units</span>
                    </span>
                  </div>
                </div>

                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="bg-slate-100 px-3 py-1.5 font-bold text-slate-700 text-[11px] border-b border-slate-200">
                    Units Breakdown ({selectedCellInfo.month})
                  </div>
                  <div className="max-h-60 overflow-y-auto divide-y divide-slate-100">
                    {selectedCellInfo.breakdown?.map((cu, i) => (
                      <div 
                        key={cu.unitId || i}
                        onClick={() => {
                          if (!cu.isVacant) {
                            const uObj = selectedCellInfo.property?.units?.find(u => u.unitId === cu.unitId);
                            const mCell = uObj?.monthlyCells?.[selectedCellInfo.monthKey];
                            if (mCell) {
                              setSelectedCellInfo({
                                ...mCell,
                                month: selectedCellInfo.month,
                                unit: uObj,
                                propertyName: selectedCellInfo.propertyName
                              });
                            }
                          }
                        }}
                        className={`p-2.5 flex items-center justify-between gap-2 transition-colors ${
                          !cu.isVacant ? 'hover:bg-emerald-50/50 cursor-pointer' : 'bg-slate-50/50'
                        }`}
                      >
                        <div>
                          <div className="font-extrabold text-slate-900">{cu.unitName}</div>
                          <div className="text-[10px] text-slate-500 font-medium">
                            {cu.tenantName !== 'Vacant' ? cu.tenantName : 'No active tenant'} · {cu.contractNo !== '—' ? cu.contractNo : 'Uncontracted'}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className={`font-black ${!cu.isVacant ? 'text-emerald-700' : 'text-slate-400'}`}>
                            {cu.rate ? formatCurrency(cu.rate) : 'Vacant'}
                          </div>
                          <span className={`inline-block px-1.5 py-0.2 rounded text-[9px] font-bold ${
                            !cu.isVacant ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                          }`}>
                            {cu.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : selectedCellInfo.isVacant ? (
              // CASE 2: Vacant unit in this month
              <div className="space-y-2.5 text-xs">
                <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900">
                  <div className="flex items-center gap-2 font-black text-amber-950 text-sm mb-1">
                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>Unit is Vacant for {selectedCellInfo.month}</span>
                  </div>
                  <p className="text-[11px] text-amber-800 font-medium">
                    There was no active lease contract or tenant assignment covering this period. The property was unleased.
                  </p>
                </div>

                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500 font-semibold">Sub-Property / Partition:</span>
                    <span className="font-black text-slate-900">{selectedCellInfo.unitName || selectedCellInfo.unit?.subUnitPartition}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500 font-semibold">Unit Code:</span>
                    <span className="font-mono font-bold text-slate-800">{selectedCellInfo.unitCode || selectedCellInfo.unit?.unitCode}</span>
                  </div>
                  {selectedCellInfo.areaSqFt > 0 && (
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500 font-semibold">Area:</span>
                      <span className="font-bold text-slate-800">{selectedCellInfo.areaSqFt} sq ft</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500 font-semibold">Expected Standard Rent:</span>
                    <span className="font-black text-slate-900">{formatCurrency(selectedCellInfo.expectedRate || selectedCellInfo.unit?.expectedRate || 0)}</span>
                  </div>
                </div>
              </div>
            ) : (
              // CASE 3: Active Lease Contract Detail
              <div className="space-y-2.5 text-xs">
                {/* Contract Header Highlight */}
                <div className="p-3.5 rounded-xl bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider block">Contracted Monthly Rate</span>
                    <span className="text-xl font-black text-emerald-950 font-mono">
                      {formatCurrency(selectedCellInfo.rate)}
                      <span className="text-xs font-semibold text-emerald-700"> / month</span>
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="px-2.5 py-1 rounded-lg bg-white border border-emerald-300 font-mono font-black text-emerald-900 text-xs shadow-2xs block">
                      {selectedCellInfo.contractNo || selectedCellInfo.assignmentCode || 'No Contract #'}
                    </span>
                    <span className="inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                      {selectedCellInfo.status || 'Active'}
                    </span>
                  </div>
                </div>

                {/* Tenant Card */}
                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500 font-semibold">Tenant Name:</span>
                    <span className="font-black text-slate-900 text-sm">{selectedCellInfo.tenantName}</span>
                  </div>
                  {selectedCellInfo.tenantCode && (
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500 font-semibold">Tenant Code:</span>
                      <span className="font-mono font-bold text-slate-800">{selectedCellInfo.tenantCode}</span>
                    </div>
                  )}
                  {selectedCellInfo.tenantPhone && (
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500 font-semibold">Contact Phone:</span>
                      <span className="font-bold text-slate-800">{selectedCellInfo.tenantPhone}</span>
                    </div>
                  )}
                </div>

                {/* Contract Details */}
                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500 font-semibold">Contract Type:</span>
                    <span className="font-bold text-slate-800">{selectedCellInfo.contractType || 'Rent Agreement'}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500 font-semibold">Lease Period:</span>
                    <span className="font-black text-slate-900">
                      {selectedCellInfo.startDate ? formatDate(selectedCellInfo.startDate) : 'Open'}
                      {' → '}
                      {selectedCellInfo.endDate ? formatDate(selectedCellInfo.endDate) : 'Ongoing'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500 font-semibold">Security Deposit:</span>
                    <span className="font-bold text-slate-800">
                      {selectedCellInfo.securityDeposit ? formatCurrency(selectedCellInfo.securityDeposit) : 'None'}
                    </span>
                  </div>
                  {selectedCellInfo.noticePeriodMonths != null && (
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500 font-semibold">Notice Period:</span>
                      <span className="font-bold text-slate-800">{selectedCellInfo.noticePeriodMonths} month(s)</span>
                    </div>
                  )}
                  {selectedCellInfo.rentDueDay != null && (
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500 font-semibold">Rent Due Day:</span>
                      <span className="font-bold text-slate-800">Day {selectedCellInfo.rentDueDay} of month</span>
                    </div>
                  )}
                  {(selectedCellInfo.terms || selectedCellInfo.notes) && (
                    <div className="pt-1.5 border-t border-slate-200">
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Terms / Notes:</span>
                      <p className="text-slate-700 font-medium italic mt-0.5">{selectedCellInfo.terms || selectedCellInfo.notes}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Modal Footer */}
            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
              <div>
                {!selectedCellInfo.isPropertySummary && !selectedCellInfo.isVacant && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCellInfo(null);
                      window.location.hash = '#/contracts';
                    }}
                    className="flex items-center gap-1.5 text-xs font-bold text-teal-700 hover:text-teal-900 hover:underline cursor-pointer"
                  >
                    <FileText className="w-3.5 h-3.5 text-teal-600" />
                    <span>View in Lease Contracts</span>
                  </button>
                )}
                {selectedCellInfo.isVacant && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCellInfo(null);
                      window.location.hash = '#/contracts';
                    }}
                    className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 hover:text-emerald-900 hover:underline cursor-pointer"
                  >
                    <FileText className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Create New Lease Contract</span>
                  </button>
                )}
              </div>
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
