import React, { useState, useEffect, useMemo } from 'react';
import API from '../services/api';
import { formatCurrency } from '../utils/formatters';
import { 
  Building2, Calendar, Download, RefreshCw, Filter, 
  Search, CheckSquare, Square, Eye, FileSpreadsheet,
  CheckCircle2, AlertCircle, Layers, ArrowUpDown, ChevronDown
} from 'lucide-react';

const MONTH_NAMES = [
  { key: '01', name: 'Jan' },
  { key: '02', name: 'Feb' },
  { key: '03', name: 'Mar' },
  { key: '04', name: 'Apr' },
  { key: '05', name: 'May' },
  { key: '06', name: 'Jun' },
  { key: '07', name: 'Jul' },
  { key: '08', name: 'Aug' },
  { key: '09', name: 'Sep' },
  { key: '10', name: 'Oct' },
  { key: '11', name: 'Nov' },
  { key: '12', name: 'Dec' },
];

export default function PropertyMonthlyMatrixReport() {
  const currentYear = new Date().getFullYear();

  // State with localStorage persistence
  const [selectedYear, setSelectedYear] = useState(() => {
    return Number(localStorage.getItem('matrix_selected_year')) || currentYear;
  });

  const [selectedPropertyFilter, setSelectedPropertyFilter] = useState(() => {
    return localStorage.getItem('matrix_prop_filter') || '';
  });

  const [viewMode, setViewMode] = useState(() => {
    return localStorage.getItem('matrix_view_mode') || 'received'; // 'received' | 'expected' | 'balance'
  });

  const [search, setSearch] = useState('');
  
  // Visible Months state (Array of month numbers '01'..'12')
  const [visibleMonths, setVisibleMonths] = useState(() => {
    try {
      const saved = localStorage.getItem('matrix_visible_months');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return MONTH_NAMES.map(m => m.key); // Default: all 12 months visible
  });

  // Data states
  const [reportData, setReportData] = useState(null);
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  // Sync state to localStorage
  useEffect(() => {
    localStorage.setItem('matrix_selected_year', String(selectedYear));
  }, [selectedYear]);

  useEffect(() => {
    localStorage.setItem('matrix_prop_filter', selectedPropertyFilter);
  }, [selectedPropertyFilter]);

  useEffect(() => {
    localStorage.setItem('matrix_view_mode', viewMode);
  }, [viewMode]);

  useEffect(() => {
    try {
      localStorage.setItem('matrix_visible_months', JSON.stringify(visibleMonths));
    } catch (e) {}
  }, [visibleMonths]);

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
      let url = `/reports/property-monthly-matrix?year=${selectedYear}`;
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
  }, [selectedYear, selectedPropertyFilter]);

  // Toggle single month visibility
  const toggleMonth = (mKey) => {
    setVisibleMonths(prev => {
      if (prev.includes(mKey)) {
        if (prev.length === 1) return prev; // Keep at least one month
        return prev.filter(k => k !== mKey);
      } else {
        // Keep in calendar order
        const next = [...prev, mKey];
        return MONTH_NAMES.filter(m => next.includes(m.key)).map(m => m.key);
      }
    });
  };

  const selectAllMonths = () => {
    setVisibleMonths(MONTH_NAMES.map(m => m.key));
  };

  const selectQuarter = (q) => {
    let qMonths = [];
    if (q === 1) qMonths = ['01', '02', '03'];
    if (q === 2) qMonths = ['04', '05', '06'];
    if (q === 3) qMonths = ['07', '08', '09'];
    if (q === 4) qMonths = ['10', '11', '12'];
    setVisibleMonths(qMonths);
  };

  // Download Excel
  const handleExportExcel = async () => {
    try {
      setDownloading(true);
      let url = `/reports/export-property-monthly-matrix-excel?year=${selectedYear}&mode=${viewMode}`;
      if (selectedPropertyFilter) {
        url += `&propertyId=${selectedPropertyFilter}`;
      }
      const res = await API.get(url, { responseType: 'blob' });
      const blob = new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const link = document.createElement('a');
      link.href = window.URL.createObjectURL(blob);
      link.download = `Property_Monthly_Matrix_${selectedYear}_${viewMode}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      alert('Failed to export Excel matrix');
    } finally {
      setDownloading(false);
    }
  };

  // Month objects for visible months
  const activeMonths = useMemo(() => {
    return MONTH_NAMES
      .filter(m => visibleMonths.includes(m.key))
      .map(m => ({
        key: m.key,
        monthKey: `${selectedYear}-${m.key}`,
        name: m.name,
        label: `${m.name} ${String(selectedYear).slice(-2)}`
      }));
  }, [visibleMonths, selectedYear]);

  // Flatten and filter rows by search
  const filteredMatrix = useMemo(() => {
    if (!reportData?.matrix) return [];
    const q = search.trim().toLowerCase();

    return reportData.matrix.map(propGroup => {
      const matchingUnits = propGroup.units.filter(u => {
        if (!q) return true;
        const matchProp = u.propertyName?.toLowerCase().includes(q);
        const matchUnit = u.subUnitPartition?.toLowerCase().includes(q) || u.unitName?.toLowerCase().includes(q);
        const matchTenant = u.currentTenant?.toLowerCase().includes(q);
        const matchType = u.contractType?.toLowerCase().includes(q);
        return matchProp || matchUnit || matchTenant || matchType;
      });

      return {
        ...propGroup,
        units: matchingUnits
      };
    }).filter(g => g.units.length > 0);
  }, [reportData, search]);

  // Compute dynamic totals based on visible months and filtered rows
  const dynamicTotals = useMemo(() => {
    const colSums = {};
    activeMonths.forEach(m => {
      colSums[m.monthKey] = 0;
    });
    let grandSum = 0;
    let grandExpected = 0;
    let grandReceived = 0;
    let grandBalance = 0;

    filteredMatrix.forEach(group => {
      group.units.forEach(unit => {
        activeMonths.forEach(m => {
          const mData = unit.months?.[m.monthKey] || { expected: 0, received: 0, balance: 0 };
          const val = viewMode === 'expected' ? mData.expected : viewMode === 'balance' ? mData.balance : mData.received;
          colSums[m.monthKey] += (val || 0);
          grandSum += (val || 0);

          grandExpected += (mData.expected || 0);
          grandReceived += (mData.received || 0);
          grandBalance += (mData.balance || 0);
        });
      });
    });

    const efficiency = grandExpected > 0 ? Math.round((grandReceived / grandExpected) * 100) : 100;

    return {
      colSums,
      grandSum,
      grandExpected,
      grandReceived,
      grandBalance,
      efficiency
    };
  }, [filteredMatrix, activeMonths, viewMode]);

  let globalRowCounter = 1;

  return (
    <div className="space-y-5">
      {/* Top Header Card */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white shadow-md shadow-emerald-500/20">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-900 tracking-tight">
                Property Monthly Matrix Report
              </h1>
              <p className="text-xs font-semibold text-slate-500">
                Full-year portfolio grid: Properties & partitions on left, monthly columns across top, and grand totals
              </p>
            </div>
          </div>
        </div>

        {/* Global Actions */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Year Selector */}
          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-2xl border border-slate-200">
            <Calendar className="w-3.5 h-3.5 text-slate-500 ml-2" />
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="bg-transparent text-xs font-bold text-slate-800 pr-2 py-1 focus:outline-none cursor-pointer"
            >
              {[2024, 2025, 2026, 2027, 2028].map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          {/* Refresh Button */}
          <button
            onClick={fetchMatrix}
            disabled={loading}
            className="p-2.5 rounded-2xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors shadow-2xs"
            title="Refresh matrix data"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          {/* Export to Excel */}
          <button
            onClick={handleExportExcel}
            disabled={downloading || loading}
            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold text-xs shadow-md shadow-emerald-600/20 transition-all cursor-pointer"
          >
            <Download className="w-4 h-4" />
            {downloading ? 'Exporting...' : 'Export Matrix (Excel)'}
          </button>
        </div>
      </div>

      {/* KPI Metric Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/80 shadow-2xs">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total Expected Rent</p>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-xl sm:text-2xl font-black text-slate-800">
              ₹{dynamicTotals.grandExpected.toLocaleString('en-IN')}
            </span>
            <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
              {activeMonths.length} {activeMonths.length === 1 ? 'Month' : 'Months'}
            </span>
          </div>
          <p className="text-[10px] text-slate-400 mt-1 font-medium">Scheduled target rent</p>
        </div>

        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-emerald-100 shadow-2xs bg-emerald-50/20">
          <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">Total Rent Received</p>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-xl sm:text-2xl font-black text-emerald-800">
              ₹{dynamicTotals.grandReceived.toLocaleString('en-IN')}
            </span>
            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
              {dynamicTotals.efficiency}% Paid
            </span>
          </div>
          <p className="text-[10px] text-emerald-600 mt-1 font-medium">Actual collections credited</p>
        </div>

        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-rose-100 shadow-2xs bg-rose-50/20">
          <p className="text-[11px] font-bold uppercase tracking-wider text-rose-700">Balance Outstanding</p>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-xl sm:text-2xl font-black text-rose-800">
              ₹{dynamicTotals.grandBalance.toLocaleString('en-IN')}
            </span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
              dynamicTotals.grandBalance === 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
            }`}>
              {dynamicTotals.grandBalance === 0 ? 'Clear' : 'Pending'}
            </span>
          </div>
          <p className="text-[10px] text-rose-600 mt-1 font-medium">Unpaid rent for selected months</p>
        </div>

        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/80 shadow-2xs">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Portfolio Units</p>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-xl sm:text-2xl font-black text-slate-900">
              {reportData?.summary?.totalUnits || 0}
            </span>
            <span className="text-[10px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full">
              {reportData?.summary?.totalProperties || 0} Properties
            </span>
          </div>
          <p className="text-[10px] text-slate-500 mt-1 font-medium">Active sub-property partitions</p>
        </div>
      </div>

      {/* Control Panel: Property Filter, View Mode, Quick Search & Month Toggles */}
      <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm p-5 space-y-4">
        {/* Row 1: Filters & Mode Switcher */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* View Mode Switcher */}
            <div className="flex items-center p-1 bg-slate-100 rounded-2xl border border-slate-200">
              <button
                type="button"
                onClick={() => setViewMode('received')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  viewMode === 'received'
                    ? 'bg-white text-emerald-800 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Rent Received (Collections)
              </button>
              <button
                type="button"
                onClick={() => setViewMode('expected')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  viewMode === 'expected'
                    ? 'bg-white text-indigo-800 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Rent Expected (Target)
              </button>
              <button
                type="button"
                onClick={() => setViewMode('balance')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  viewMode === 'balance'
                    ? 'bg-white text-rose-800 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Balance Due (Pending)
              </button>
            </div>

            {/* Property Filter Dropdown */}
            <div className="relative">
              <select
                value={selectedPropertyFilter}
                onChange={(e) => setSelectedPropertyFilter(e.target.value)}
                className="text-xs font-bold px-3.5 py-2 rounded-2xl border border-slate-200 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-400 cursor-pointer shadow-2xs"
              >
                <option value="">All Properties ({properties.length})</option>
                {properties.map(p => (
                  <option key={p._id} value={p._id}>{p.name} {p.propertyCode ? `(${p.propertyCode})` : ''}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Quick Search */}
          <div className="relative w-full lg:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search property, partition, tenant..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full text-xs font-medium pl-9 pr-3.5 py-2 rounded-2xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400 shadow-2xs"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Row 2: Month Selector / Removable Toggles (User can check/uncheck any months) */}
        <div className="pt-3 border-t border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-extrabold text-slate-600 uppercase tracking-wide">
              Months to Display:
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={selectAllMonths}
                className="text-[10px] font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-2 py-0.5 rounded-md transition-colors"
              >
                All 12 Months
              </button>
              <button
                onClick={() => selectQuarter(1)}
                className="text-[10px] font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 px-2 py-0.5 rounded-md transition-colors"
              >
                Q1 (Jan-Mar)
              </button>
              <button
                onClick={() => selectQuarter(2)}
                className="text-[10px] font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 px-2 py-0.5 rounded-md transition-colors"
              >
                Q2 (Apr-Jun)
              </button>
              <button
                onClick={() => selectQuarter(3)}
                className="text-[10px] font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 px-2 py-0.5 rounded-md transition-colors"
              >
                Q3 (Jul-Sep)
              </button>
              <button
                onClick={() => selectQuarter(4)}
                className="text-[10px] font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 px-2 py-0.5 rounded-md transition-colors"
              >
                Q4 (Oct-Dec)
              </button>
            </div>
          </div>

          {/* Month Checkboxes */}
          <div className="flex flex-wrap items-center gap-1.5">
            {MONTH_NAMES.map(m => {
              const isChecked = visibleMonths.includes(m.key);
              return (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => toggleMonth(m.key)}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold transition-all border cursor-pointer ${
                    isChecked
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                      : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300'
                  }`}
                  title={`Toggle ${m.name}`}
                >
                  {m.name}
                  <span className="text-[10px]">{isChecked ? '✓' : '×'}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Spreadsheet Matrix Grid */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
        {/* Mobile Swipe Cue */}
        <div className="sm:hidden px-4 py-2 bg-emerald-50 border-b border-emerald-100 text-[11px] text-emerald-800 font-medium flex items-center justify-between">
          <span>Swipe horizontally to view all months</span>
          <span>→</span>
        </div>

        <div className="overflow-x-auto max-h-[70vh]">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 z-20 bg-slate-100 border-b border-slate-300 shadow-2xs">
              <tr className="text-[11px] font-extrabold text-slate-700">
                {/* Left Sticky Columns */}
                <th className="py-3 px-3 w-10 text-center sticky left-0 z-30 bg-slate-100 border-r border-slate-200">#</th>
                <th className="py-3 px-3.5 min-w-[200px] sticky left-10 z-30 bg-slate-100 border-r border-slate-200">Property</th>
                <th className="py-3 px-3.5 min-w-[170px] border-r border-slate-200">Sub-Property / Partition</th>
                <th className="py-3 px-3.5 min-w-[150px] border-r border-slate-200">Current Tenant</th>
                <th className="py-3 px-3 min-w-[90px] text-center border-r border-slate-200">Type</th>

                {/* Visible Month Columns */}
                {activeMonths.map(m => (
                  <th key={m.key} className="py-3 px-3 min-w-[110px] text-right border-r border-slate-200 whitespace-nowrap">
                    <span className="block text-slate-800">{m.label}</span>
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">
                      {viewMode === 'expected' ? 'Target' : viewMode === 'balance' ? 'Due' : 'Received'}
                    </span>
                  </th>
                ))}

                {/* Right Sticky Total Column */}
                <th className="py-3 px-4 min-w-[130px] text-right sticky right-0 z-30 bg-slate-200/90 border-l-2 border-slate-300 font-black text-slate-900">
                  Total ({activeMonths.length}M)
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100 text-xs">
              {loading ? (
                <tr>
                  <td colSpan={6 + activeMonths.length} className="text-center py-20 text-slate-400">
                    <RefreshCw className="w-7 h-7 animate-spin mx-auto text-emerald-500 mb-2" />
                    <p className="font-bold text-sm text-slate-600">Generating Property Monthly Matrix...</p>
                    <p className="text-xs text-slate-400 mt-1">Calculating month-by-month rent and active contracts</p>
                  </td>
                </tr>
              ) : filteredMatrix.length === 0 ? (
                <tr>
                  <td colSpan={6 + activeMonths.length} className="text-center py-16 text-slate-400">
                    <FileSpreadsheet className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                    <p className="font-bold text-sm text-slate-600">No properties or units found matching criteria.</p>
                  </td>
                </tr>
              ) : (
                filteredMatrix.map((group, groupIdx) => {
                  return (
                    <React.Fragment key={group.property._id}>
                      {/* Property Header Subheading */}
                      <tr className="bg-slate-50/80 font-bold border-t-2 border-slate-200">
                        <td colSpan={5 + activeMonths.length + 1} className="py-2.5 px-3.5 text-xs text-slate-800">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Building2 className="w-4 h-4 text-emerald-600" />
                              <span className="font-extrabold text-slate-900 text-sm">{group.property.name}</span>
                              {group.property.code && (
                                <span className="text-[10px] font-mono text-slate-400 bg-white border border-slate-200 px-1.5 py-0.2 rounded">
                                  {group.property.code}
                                </span>
                              )}
                              <span className="text-[11px] font-semibold text-slate-500">
                                ({group.units.length} {group.units.length === 1 ? 'partition' : 'partitions'})
                              </span>
                            </div>
                          </div>
                        </td>
                      </tr>

                      {/* Units Rows */}
                      {group.units.map((unit) => {
                        const rowSr = globalRowCounter++;

                        // Calculate row total for active months
                        let unitActiveTotal = 0;
                        activeMonths.forEach(m => {
                          const mData = unit.months?.[m.monthKey] || { expected: 0, received: 0, balance: 0 };
                          const val = viewMode === 'expected' ? mData.expected : viewMode === 'balance' ? mData.balance : mData.received;
                          unitActiveTotal += (val || 0);
                        });

                        return (
                          <tr key={unit.unitId} className="hover:bg-emerald-50/30 transition-colors">
                            {/* Sr. No */}
                            <td className="py-2.5 px-3 text-center font-bold text-slate-400 sticky left-0 z-10 bg-white border-r border-slate-100">
                              {rowSr}
                            </td>

                            {/* Property Name */}
                            <td className="py-2.5 px-3.5 font-bold text-slate-800 sticky left-10 z-10 bg-white border-r border-slate-100 whitespace-nowrap overflow-hidden text-ellipsis max-w-[200px]">
                              {unit.propertyName}
                            </td>

                            {/* Sub-Property / Partition */}
                            <td className="py-2.5 px-3.5 font-extrabold text-slate-900 border-r border-slate-100 whitespace-nowrap">
                              {unit.subUnitPartition}
                            </td>

                            {/* Tenant */}
                            <td className="py-2.5 px-3.5 border-r border-slate-100 whitespace-nowrap">
                              <div className="font-semibold text-slate-800">{unit.currentTenant}</div>
                            </td>

                            {/* Contract Type */}
                            <td className="py-2.5 px-3 text-center border-r border-slate-100 whitespace-nowrap">
                              <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                                unit.contractType === 'Business'
                                  ? 'bg-purple-50 text-purple-700 border border-purple-200'
                                  : 'bg-slate-100 text-slate-600'
                              }`}>
                                {unit.contractType || 'Rent'}
                              </span>
                            </td>

                            {/* Month Cells */}
                            {activeMonths.map(m => {
                              const mData = unit.months?.[m.monthKey] || { expected: 0, received: 0, balance: 0, status: 'N/A' };
                              const val = viewMode === 'expected' ? mData.expected : viewMode === 'balance' ? mData.balance : mData.received;

                              let cellClass = 'text-slate-800 font-semibold';
                              if (viewMode === 'received') {
                                if (val > 0 && val >= mData.expected && mData.expected > 0) {
                                  cellClass = 'text-emerald-700 font-extrabold bg-emerald-50/40';
                                } else if (val > 0) {
                                  cellClass = 'text-amber-700 font-bold bg-amber-50/40';
                                } else if (mData.expected > 0) {
                                  cellClass = 'text-rose-600 font-medium';
                                } else {
                                  cellClass = 'text-slate-400';
                                }
                              } else if (viewMode === 'balance') {
                                if (val > 0) {
                                  cellClass = 'text-rose-700 font-extrabold bg-rose-50/50';
                                } else {
                                  cellClass = 'text-slate-400';
                                }
                              }

                              return (
                                <td key={m.key} className={`py-2.5 px-3 text-right border-r border-slate-100 whitespace-nowrap tabular-nums ${cellClass}`}>
                                  {val > 0 ? `₹${val.toLocaleString('en-IN')}` : '—'}
                                </td>
                              );
                            })}

                            {/* Right Sticky Unit Total */}
                            <td className="py-2.5 px-4 text-right sticky right-0 z-10 bg-slate-50 font-black text-slate-900 border-l border-slate-200 tabular-nums">
                              ₹{unitActiveTotal.toLocaleString('en-IN')}
                            </td>
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>

            {/* Bottom Sticky Portfolio Totals Row */}
            {filteredMatrix.length > 0 && (
              <tfoot className="sticky bottom-0 z-20 bg-slate-900 text-white font-extrabold text-xs shadow-lg">
                <tr>
                  <td colSpan={5} className="py-3 px-4 uppercase tracking-wider text-slate-200 border-r border-slate-800 sticky left-0 z-30 bg-slate-900">
                    TOTAL ({viewMode.toUpperCase()})
                  </td>

                  {/* Monthly Column Sums */}
                  {activeMonths.map(m => {
                    const sum = dynamicTotals.colSums[m.monthKey] || 0;
                    return (
                      <td key={m.key} className="py-3 px-3 text-right border-r border-slate-800 whitespace-nowrap tabular-nums text-emerald-400 font-black">
                        ₹{sum.toLocaleString('en-IN')}
                      </td>
                    );
                  })}

                  {/* Grand Total */}
                  <td className="py-3 px-4 text-right sticky right-0 z-30 bg-emerald-700 text-white font-black text-sm whitespace-nowrap tabular-nums shadow-md">
                    ₹{dynamicTotals.grandSum.toLocaleString('en-IN')}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
