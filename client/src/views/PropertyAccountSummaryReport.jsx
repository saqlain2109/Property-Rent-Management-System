import React, { useState, useEffect, useMemo } from 'react';
import API from '../services/api';
import { formatCurrency, formatDate, formatMonthYear } from '../utils/formatters';
import {
  Building2, Calendar, ChevronLeft, ChevronRight, Download, RefreshCw,
  TrendingUp, TrendingDown, DollarSign, Layers, CheckCircle2, Clock,
  AlertCircle, FileSpreadsheet, User, Receipt, Phone, IndianRupee, Tag, Filter, X, RotateCcw
} from 'lucide-react';
import { useResizableColumns, ColumnHeaderCell, useTableAutoWrap } from '../components/ColumnManager';
import { cycleThreeStateSort } from '../utils/tableUtils';

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

  // Column Widths for Earnings Table
  const earnColDefaults = useMemo(() => ({
    index: 48,
    unit: 160,
    tenant: 160,
    contractType: 120,
    expectedRent: 130,
    receivedRent: 130,
    receiptDate: 120,
    balanceDue: 120,
    status: 100
  }), []);

  const {
    columnWidths: earnWidths,
    handleResizeStart: handleEarnResizeStart,
    resetColumnWidths: resetEarnWidths
  } = useResizableColumns('prop_summary_earn_widths_v2', earnColDefaults);

  // Column Widths for Expenses Table
  const expColDefaults = useMemo(() => ({
    index: 48,
    expenseDate: 120,
    head: 160,
    description: 240,
    payee: 160,
    paymentMode: 120,
    amount: 130
  }), []);

  const {
    columnWidths: expWidths,
    handleResizeStart: handleExpResizeStart,
    resetColumnWidths: resetExpWidths
  } = useResizableColumns('prop_summary_exp_widths_v2', expColDefaults);

  const { autoWrap } = useTableAutoWrap();

  // Sorting and Filtering for Earnings
  const [earnSort, setEarnSort] = useState({ key: null, direction: null });
  const [earnFilters, setEarnFilters] = useState({});

  // Sorting and Filtering for Expenses
  const [expSort, setExpSort] = useState({ key: null, direction: null });
  const [expFilters, setExpFilters] = useState({});

  const handleEarnSort = (colId) => setEarnSort(prev => cycleThreeStateSort(prev, colId));
  const handleExpSort = (colId) => setExpSort(prev => cycleThreeStateSort(prev, colId));

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

  // Filtered and sorted earnings
  const processedEarnings = useMemo(() => {
    let result = [...earnings];
    // Filters
    Object.entries(earnFilters).forEach(([colId, filterVals]) => {
      if (!filterVals || filterVals.length === 0) return;
      result = result.filter(row => {
        let val = '';
        if (colId === 'unit') val = row.unitName || '';
        else if (colId === 'tenant') val = row.tenantName || '';
        else if (colId === 'contractType') val = row.contractType || '';
        else if (colId === 'status') val = row.status || '';
        return filterVals.includes(String(val));
      });
    });
    // Sort
    if (earnSort.key && earnSort.direction) {
      result.sort((a, b) => {
        let va, vb;
        if (earnSort.key === 'unit') { va = a.unitName || ''; vb = b.unitName || ''; }
        else if (earnSort.key === 'tenant') { va = a.tenantName || ''; vb = b.tenantName || ''; }
        else if (earnSort.key === 'contractType') { va = a.contractType || ''; vb = b.contractType || ''; }
        else if (earnSort.key === 'expectedRent') { va = a.expectedRent || 0; vb = b.expectedRent || 0; }
        else if (earnSort.key === 'receivedRent') { va = a.receivedRent || 0; vb = b.receivedRent || 0; }
        else if (earnSort.key === 'receiptDate') { va = a.paidDate || ''; vb = b.paidDate || ''; }
        else if (earnSort.key === 'balanceDue') { va = a.balanceDue || 0; vb = b.balanceDue || 0; }
        else if (earnSort.key === 'status') { va = a.status || ''; vb = b.status || ''; }
        else { va = a[earnSort.key]; vb = b[earnSort.key]; }

        if (typeof va === 'string') {
          return earnSort.direction === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
        }
        return earnSort.direction === 'asc' ? va - vb : vb - va;
      });
    }
    return result;
  }, [earnings, earnFilters, earnSort]);

  // Unique values for earnings filters
  const earnUniqueValues = useMemo(() => {
    const units = Array.from(new Set(earnings.map(r => r.unitName).filter(Boolean))).sort();
    const tenants = Array.from(new Set(earnings.map(r => r.tenantName).filter(Boolean))).sort();
    const contractTypes = Array.from(new Set(earnings.map(r => r.contractType).filter(Boolean))).sort();
    const statuses = Array.from(new Set(earnings.map(r => r.status).filter(Boolean))).sort();
    return { unit: units, tenant: tenants, contractType: contractTypes, status: statuses };
  }, [earnings]);

  // Filtered and sorted expenses
  const processedExpenses = useMemo(() => {
    let result = [...expenses];
    // Filters
    Object.entries(expFilters).forEach(([colId, filterVals]) => {
      if (!filterVals || filterVals.length === 0) return;
      result = result.filter(row => {
        let val = '';
        if (colId === 'head') val = row.category || '';
        else if (colId === 'description') val = row.description || '';
        else if (colId === 'payee') val = row.vendorOrPayee || '';
        else if (colId === 'paymentMode') val = row.paymentMode || '';
        return filterVals.includes(String(val));
      });
    });
    // Sort
    if (expSort.key && expSort.direction) {
      result.sort((a, b) => {
        let va, vb;
        if (expSort.key === 'expenseDate') { va = a.expenseDate || ''; vb = b.expenseDate || ''; }
        else if (expSort.key === 'head') { va = a.category || ''; vb = b.category || ''; }
        else if (expSort.key === 'description') { va = a.description || ''; vb = b.description || ''; }
        else if (expSort.key === 'payee') { va = a.vendorOrPayee || ''; vb = b.vendorOrPayee || ''; }
        else if (expSort.key === 'paymentMode') { va = a.paymentMode || ''; vb = b.paymentMode || ''; }
        else if (expSort.key === 'amount') { va = a.amount || 0; vb = b.amount || 0; }
        else { va = a[expSort.key]; vb = b[expSort.key]; }

        if (typeof va === 'string') {
          return expSort.direction === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
        }
        return expSort.direction === 'asc' ? va - vb : vb - va;
      });
    }
    return result;
  }, [expenses, expFilters, expSort]);

  // Unique values for expenses filters
  const expUniqueValues = useMemo(() => {
    const heads = Array.from(new Set(expenses.map(r => r.category).filter(Boolean))).sort();
    const descriptions = Array.from(new Set(expenses.map(r => r.description).filter(Boolean))).sort();
    const payees = Array.from(new Set(expenses.map(r => r.vendorOrPayee).filter(Boolean))).sort();
    const paymentModes = Array.from(new Set(expenses.map(r => r.paymentMode).filter(Boolean))).sort();
    return { head: heads, description: descriptions, payee: payees, paymentMode: paymentModes };
  }, [expenses]);

  return (
    <div className="space-y-3">
      {/* Top Filter and Controls Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-white p-3.5 sm:p-4 rounded-xl shadow-xs border border-slate-200">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center font-bold">
              <Building2 className="w-4.5 h-4.5" />
            </div>
            <div>
              <h3 className="font-extrabold text-slate-900 text-base flex items-center gap-2">
                Property Account Summary
                {reportData?.property && (
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-teal-100 text-teal-800 font-bold border border-teal-200">
                    {reportData.property.name}
                  </span>
                )}
              </h3>
            </div>
          </div>
        </div>

        {/* Controls: Property Dropdown, Month Switcher, Excel Download */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Property Selector */}
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-2.5 py-1.5 rounded-xl shadow-2xs">
            <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
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
          <div className="flex items-center bg-slate-100 p-0.5 rounded-xl">
            <button
              onClick={() => changeMonth(-1)}
              className="p-1 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-white transition-colors cursor-pointer"
              title="Previous Month"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="bg-transparent text-xs font-bold text-slate-800 px-2 py-0.5 focus:outline-none cursor-pointer"
            />
            <button
              onClick={() => changeMonth(1)}
              className="p-1 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-white transition-colors cursor-pointer"
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
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>

          {/* Reset Column Widths */}
          <button
            onClick={() => {
              resetEarnWidths();
              resetExpWidths();
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
            title="Reset column widths to default"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Reset Widths</span>
          </button>

          {/* Export Excel */}
          <button
            onClick={handleDownloadExcel}
            disabled={downloading || !reportData}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs active:scale-95 transition-all disabled:opacity-60 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{downloading ? 'Exporting...' : 'Export Excel'}</span>
          </button>
        </div>
      </div>

      {/* KPI Cards: Financial Summary */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5">
        {/* Total Expected Rent */}
        <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Expected Rent</span>
            <span className="p-1 rounded-lg bg-blue-50 text-blue-600">
              <IndianRupee className="w-3.5 h-3.5" />
            </span>
          </div>
          <div className="text-lg font-extrabold text-slate-900 mt-1 font-mono">
            {formatCurrency(summary.totalExpectedRent)}
          </div>
          <div className="text-[10px] text-slate-500 font-semibold mt-0.5">
            {summary.occupiedUnits} of {summary.totalUnits} units active
          </div>
        </div>

        {/* Total Rent Received */}
        <div className="bg-white p-3 rounded-xl border border-emerald-100 shadow-2xs bg-emerald-50/20">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">Rent Received</span>
            <span className="p-1 rounded-lg bg-emerald-100 text-emerald-700">
              <TrendingUp className="w-3.5 h-3.5" />
            </span>
          </div>
          <div className="text-lg font-extrabold text-emerald-700 mt-1 font-mono">
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
        <div className="bg-white p-3 rounded-xl border border-rose-100 shadow-2xs bg-rose-50/20">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-rose-700">Property Expenses</span>
            <span className="p-1 rounded-lg bg-rose-100 text-rose-700">
              <TrendingDown className="w-3.5 h-3.5" />
            </span>
          </div>
          <div className="text-lg font-extrabold text-rose-700 mt-1 font-mono">
            {formatCurrency(summary.totalExpenses)}
          </div>
          <div className="text-[10px] text-rose-600 font-semibold mt-0.5">
            {expenses.length} expense {expenses.length === 1 ? 'entry' : 'entries'}
          </div>
        </div>

        {/* Net Operating Cash Flow */}
        <div className={`p-3 rounded-xl border shadow-2xs ${
          summary.netOperatingIncome >= 0
            ? 'bg-emerald-500 text-white border-emerald-600'
            : 'bg-rose-500 text-white border-rose-600'
        }`}>
          <div className="flex items-center justify-between opacity-90">
            <span className="text-[10px] font-bold uppercase tracking-wider">Net Cash Flow</span>
            <DollarSign className="w-3.5 h-3.5" />
          </div>
          <div className="text-lg font-extrabold mt-1 font-mono">
            {formatCurrency(summary.netOperatingIncome)}
          </div>
          <div className="text-[10px] font-medium opacity-90 mt-0.5">
            (Rent Received - Expenses)
          </div>
        </div>

        {/* Pending Rent */}
        <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Balance Due</span>
            <span className={`p-1 rounded-lg ${summary.totalPendingRent > 0 ? 'bg-amber-50 text-amber-600' : 'bg-slate-50 text-slate-400'}`}>
              <AlertCircle className="w-3.5 h-3.5" />
            </span>
          </div>
          <div className={`text-lg font-extrabold mt-1 font-mono ${summary.totalPendingRent > 0 ? 'text-amber-600' : 'text-slate-700'}`}>
            {formatCurrency(summary.totalPendingRent)}
          </div>
          <div className="text-[10px] text-slate-500 font-semibold mt-0.5">
            {summary.totalPendingRent === 0 ? 'Fully settled' : 'Unpaid balance'}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="bg-white p-12 rounded-xl border border-slate-200 text-center text-slate-400 text-sm">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-teal-600" />
          Loading Property Account Summary for {formatMonthYear(selectedMonth)}...
        </div>
      ) : !reportData ? (
        <div className="bg-white p-12 rounded-xl border border-slate-200 text-center text-slate-400 text-sm">
          Please select a property to view its account summary statement.
        </div>
      ) : (
        <div className="space-y-3">
          {/* ======================================================== */}
          {/* SECTION 1: TOP SECTION - RENT & EARNINGS FOR THIS PROPERTY */}
          {/* ======================================================== */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="px-4 py-2.5 border-b border-slate-200 bg-slate-50/80 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="p-1 rounded-lg bg-teal-100 text-teal-800">
                  <TrendingUp className="w-3.5 h-3.5" />
                </span>
                <h4 className="text-xs font-extrabold text-slate-900">
                  1. Rent & Monthly Earnings · {formatMonthYear(selectedMonth)}
                </h4>
              </div>
              <div className="text-xs font-bold text-slate-700 font-mono">
                Total Received: <span className="text-emerald-700">{formatCurrency(summary.totalRentReceived)}</span>
              </div>
            </div>

            {processedEarnings.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs">
                {earnings.length === 0 ? 'No units or tenants assigned to this property.' : 'No records match the active filters.'}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-separate border-spacing-0">
                  <thead>
                    <tr>
                      <ColumnHeaderCell
                        colId="index"
                        width={earnWidths.index}
                        isSortable={false}
                        align="center"
                        className="border-b border-r border-slate-200"
                      >
                        #
                      </ColumnHeaderCell>
                      <ColumnHeaderCell
                        colId="unit"
                        label="Unit / Partition"
                        width={earnWidths.unit}
                        isSortable={true}
                        sortDirection={earnSort.key === 'unit' ? earnSort.direction : null}
                        onSort={() => handleEarnSort('unit')}
                        isFilterable={true}
                        uniqueValues={earnUniqueValues.unit}
                        filterValue={earnFilters.unit}
                        onApplyFilter={(col, vals) => setEarnFilters(p => ({ ...p, [col]: vals }))}
                        onClearFilter={(col) => setEarnFilters(p => { const n = { ...p }; delete n[col]; return n; })}
                        onResizeStart={handleEarnResizeStart}
                        className="border-b border-r border-slate-200"
                      />
                      <ColumnHeaderCell
                        colId="tenant"
                        label="Tenant"
                        width={earnWidths.tenant}
                        isSortable={true}
                        sortDirection={earnSort.key === 'tenant' ? earnSort.direction : null}
                        onSort={() => handleEarnSort('tenant')}
                        isFilterable={true}
                        uniqueValues={earnUniqueValues.tenant}
                        filterValue={earnFilters.tenant}
                        onApplyFilter={(col, vals) => setEarnFilters(p => ({ ...p, [col]: vals }))}
                        onClearFilter={(col) => setEarnFilters(p => { const n = { ...p }; delete n[col]; return n; })}
                        onResizeStart={handleEarnResizeStart}
                        className="border-b border-r border-slate-200"
                      />
                      <ColumnHeaderCell
                        colId="contractType"
                        label="Contract Type"
                        width={earnWidths.contractType}
                        isSortable={true}
                        sortDirection={earnSort.key === 'contractType' ? earnSort.direction : null}
                        onSort={() => handleEarnSort('contractType')}
                        isFilterable={true}
                        uniqueValues={earnUniqueValues.contractType}
                        filterValue={earnFilters.contractType}
                        onApplyFilter={(col, vals) => setEarnFilters(p => ({ ...p, [col]: vals }))}
                        onClearFilter={(col) => setEarnFilters(p => { const n = { ...p }; delete n[col]; return n; })}
                        onResizeStart={handleEarnResizeStart}
                        className="border-b border-r border-slate-200"
                      />
                      <ColumnHeaderCell
                        colId="expectedRent"
                        label="Expected Rent"
                        width={earnWidths.expectedRent}
                        align="right"
                        isSortable={true}
                        sortDirection={earnSort.key === 'expectedRent' ? earnSort.direction : null}
                        onSort={() => handleEarnSort('expectedRent')}
                        onResizeStart={handleEarnResizeStart}
                        className="border-b border-r border-slate-200"
                      />
                      <ColumnHeaderCell
                        colId="receivedRent"
                        label="Received Rent"
                        width={earnWidths.receivedRent}
                        align="right"
                        isSortable={true}
                        sortDirection={earnSort.key === 'receivedRent' ? earnSort.direction : null}
                        onSort={() => handleEarnSort('receivedRent')}
                        onResizeStart={handleEarnResizeStart}
                        className="border-b border-r border-slate-200"
                      />
                      <ColumnHeaderCell
                        colId="receiptDate"
                        label="Receipt Date"
                        width={earnWidths.receiptDate}
                        isSortable={true}
                        sortDirection={earnSort.key === 'receiptDate' ? earnSort.direction : null}
                        onSort={() => handleEarnSort('receiptDate')}
                        onResizeStart={handleEarnResizeStart}
                        className="border-b border-r border-slate-200"
                      />
                                            <ColumnHeaderCell
                        colId="balanceDue"
                        label="Balance Due"
                        width={earnWidths.balanceDue}
                        align="right"
                        isSortable={true}
                        sortDirection={earnSort.key === 'balanceDue' ? earnSort.direction : null}
                        onSort={() => handleEarnSort('balanceDue')}
                        onResizeStart={handleEarnResizeStart}
                        className="border-b border-r border-slate-200"
                      />
                      <ColumnHeaderCell
                        colId="status"
                        label="Status"
                        width={earnWidths.status}
                        align="center"
                        isSortable={true}
                        sortDirection={earnSort.key === 'status' ? earnSort.direction : null}
                        onSort={() => handleEarnSort('status')}
                        isFilterable={true}
                        uniqueValues={earnUniqueValues.status}
                        filterValue={earnFilters.status}
                        onApplyFilter={(col, vals) => setEarnFilters(p => ({ ...p, [col]: vals }))}
                        onClearFilter={(col) => setEarnFilters(p => { const n = { ...p }; delete n[col]; return n; })}
                        onResizeStart={handleEarnResizeStart}
                        className="border-b border-slate-200"
                      />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {processedEarnings.map((row, idx) => (
                      <tr key={row.unitId || idx} className="hover:bg-slate-50/70 transition-colors">
                        <td
                          style={{ width: earnWidths.index, minWidth: earnWidths.index, maxWidth: earnWidths.index }}
                          className="py-2.5 px-3 text-slate-400 font-mono text-[11px] text-center border-b border-slate-100"
                        >
                          {idx + 1}
                        </td>
                        <td
                          style={{ width: earnWidths.unit, minWidth: earnWidths.unit, maxWidth: earnWidths.unit }}
                          className={`py-2.5 px-3 font-bold text-slate-800 border-b border-slate-100 ${
                            autoWrap ? 'whitespace-normal break-words leading-tight' : 'truncate'
                          }`}
                        >
                          {row.unitName}
                          {row.unitCode && (
                            <span className="block text-[10px] text-slate-400 font-mono font-normal">
                              {row.unitCode}
                            </span>
                          )}
                        </td>
                        <td
                          style={{ width: earnWidths.tenant, minWidth: earnWidths.tenant, maxWidth: earnWidths.tenant }}
                          className={`py-2.5 px-3 font-semibold text-slate-700 border-b border-slate-100 ${
                            autoWrap ? 'whitespace-normal break-words leading-tight' : 'truncate'
                          }`}
                        >
                          {row.tenantName}
                          {row.tenantPhone && (
                            <span className="block text-[10px] text-slate-400 font-mono">
                              {row.tenantPhone}
                            </span>
                          )}
                        </td>
                        <td
                          style={{ width: earnWidths.contractType, minWidth: earnWidths.contractType, maxWidth: earnWidths.contractType }}
                          className="py-2.5 px-3 border-b border-slate-100"
                        >
                          <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold border ${
                            row.contractType === 'Business'
                              ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                              : 'bg-blue-50 text-blue-700 border-blue-200'
                          }`}>
                            {row.contractType || 'Rent'}
                          </span>
                        </td>
                        <td
                          style={{ width: earnWidths.expectedRent, minWidth: earnWidths.expectedRent, maxWidth: earnWidths.expectedRent }}
                          className="py-2.5 px-3 text-right font-mono font-bold text-slate-700 border-b border-slate-100"
                        >
                          {formatCurrency(row.expectedRent)}
                        </td>
                        <td
                          style={{ width: earnWidths.receivedRent, minWidth: earnWidths.receivedRent, maxWidth: earnWidths.receivedRent }}
                          className="py-2.5 px-3 text-right font-mono font-extrabold text-emerald-700 border-b border-slate-100"
                        >
                          {formatCurrency(row.receivedRent)}
                        </td>
                        <td
                          style={{ width: earnWidths.receiptDate, minWidth: earnWidths.receiptDate, maxWidth: earnWidths.receiptDate }}
                          className="py-2.5 px-3 text-slate-600 whitespace-nowrap border-b border-slate-100"
                        >
                          {row.paidDate ? formatDate(row.paidDate) : <span className="text-slate-400">—</span>}
                        </td>

                        <td
                          style={{ width: earnWidths.balanceDue, minWidth: earnWidths.balanceDue, maxWidth: earnWidths.balanceDue }}
                          className={`py-2.5 px-3 text-right font-mono font-bold border-b border-slate-100 ${
                            row.balanceDue > 0 ? 'text-rose-600' : 'text-slate-400'
                          }`}
                        >
                          {formatCurrency(row.balanceDue)}
                        </td>
                        <td
                          style={{ width: earnWidths.status, minWidth: earnWidths.status, maxWidth: earnWidths.status }}
                          className="py-2.5 px-3 text-center border-b border-slate-100"
                        >
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
                      <td colSpan={4} className="py-2.5 px-3 text-slate-800 uppercase tracking-wider">
                        Total Rent & Earnings
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-900">
                        {formatCurrency(summary.totalExpectedRent)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-emerald-700">
                        {formatCurrency(summary.totalRentReceived)}
                      </td>
                      <td colSpan={2}></td>
                      <td className={`py-2.5 px-3 text-right font-mono ${
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
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="px-4 py-2.5 border-b border-slate-200 bg-slate-50/80 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="p-1 rounded-lg bg-rose-100 text-rose-800">
                  <TrendingDown className="w-3.5 h-3.5" />
                </span>
                <h4 className="text-xs font-extrabold text-slate-900">
                  2. Property Expenses · {formatMonthYear(selectedMonth)}
                </h4>
              </div>
              <div className="text-xs font-bold text-slate-700 font-mono">
                Total Expenses: <span className="text-rose-700">{formatCurrency(summary.totalExpenses)}</span>
              </div>
            </div>

            {processedExpenses.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs">
                {expenses.length === 0 ? `No expenses recorded for this property in ${formatMonthYear(selectedMonth)}.` : 'No expenses match the active filters.'}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-separate border-spacing-0">
                  <thead>
                    <tr>
                      <ColumnHeaderCell
                        colId="index"
                        width={expWidths.index}
                        isSortable={false}
                        align="center"
                        className="border-b border-r border-slate-200"
                      >
                        #
                      </ColumnHeaderCell>
                      <ColumnHeaderCell
                        colId="expenseDate"
                        label="Expense Date"
                        width={expWidths.expenseDate}
                        isSortable={true}
                        sortDirection={expSort.key === 'expenseDate' ? expSort.direction : null}
                        onSort={() => handleExpSort('expenseDate')}
                        onResizeStart={handleExpResizeStart}
                        className="border-b border-r border-slate-200"
                      />
                      <ColumnHeaderCell
                        colId="head"
                        label="Expense Head"
                        width={expWidths.head}
                        isSortable={true}
                        sortDirection={expSort.key === 'head' ? expSort.direction : null}
                        onSort={() => handleExpSort('head')}
                        isFilterable={true}
                        uniqueValues={expUniqueValues.head}
                        filterValue={expFilters.head}
                        onApplyFilter={(col, vals) => setExpFilters(p => ({ ...p, [col]: vals }))}
                        onClearFilter={(col) => setExpFilters(p => { const n = { ...p }; delete n[col]; return n; })}
                        onResizeStart={handleExpResizeStart}
                        className="border-b border-r border-slate-200"
                      />
                      <ColumnHeaderCell
                        colId="description"
                        label="Description / Details"
                        width={expWidths.description}
                        isSortable={true}
                        sortDirection={expSort.key === 'description' ? expSort.direction : null}
                        onSort={() => handleExpSort('description')}
                        isFilterable={true}
                        uniqueValues={expUniqueValues.description}
                        filterValue={expFilters.description}
                        onApplyFilter={(col, vals) => setExpFilters(p => ({ ...p, [col]: vals }))}
                        onClearFilter={(col) => setExpFilters(p => { const n = { ...p }; delete n[col]; return n; })}
                        onResizeStart={handleExpResizeStart}
                        className="border-b border-r border-slate-200"
                      />
                      <ColumnHeaderCell
                        colId="payee"
                        label="Paid To / Payee"
                        width={expWidths.payee}
                        isSortable={true}
                        sortDirection={expSort.key === 'payee' ? expSort.direction : null}
                        onSort={() => handleExpSort('payee')}
                        isFilterable={true}
                        uniqueValues={expUniqueValues.payee}
                        filterValue={expFilters.payee}
                        onApplyFilter={(col, vals) => setExpFilters(p => ({ ...p, [col]: vals }))}
                        onClearFilter={(col) => setExpFilters(p => { const n = { ...p }; delete n[col]; return n; })}
                        onResizeStart={handleExpResizeStart}
                        className="border-b border-r border-slate-200"
                      />
                      <ColumnHeaderCell
                        colId="paymentMode"
                        label="Payment Mode"
                        width={expWidths.paymentMode}
                        isSortable={true}
                        sortDirection={expSort.key === 'paymentMode' ? expSort.direction : null}
                        onSort={() => handleExpSort('paymentMode')}
                        isFilterable={true}
                        uniqueValues={expUniqueValues.paymentMode}
                        filterValue={expFilters.paymentMode}
                        onApplyFilter={(col, vals) => setExpFilters(p => ({ ...p, [col]: vals }))}
                        onClearFilter={(col) => setExpFilters(p => { const n = { ...p }; delete n[col]; return n; })}
                        onResizeStart={handleExpResizeStart}
                        className="border-b border-r border-slate-200"
                      />
                      <ColumnHeaderCell
                        colId="amount"
                        label="Amount (₹)"
                        width={expWidths.amount}
                        align="right"
                        isSortable={true}
                        sortDirection={expSort.key === 'amount' ? expSort.direction : null}
                        onSort={() => handleExpSort('amount')}
                        onResizeStart={handleExpResizeStart}
                        className="border-b border-slate-200"
                      />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {processedExpenses.map((exp, idx) => (
                      <tr key={exp._id || idx} className="hover:bg-slate-50/70 transition-colors">
                        <td
                          style={{ width: expWidths.index, minWidth: expWidths.index, maxWidth: expWidths.index }}
                          className="py-2.5 px-3 text-slate-400 font-mono text-[11px] text-center border-b border-slate-100"
                        >
                          {idx + 1}
                        </td>
                        <td
                          style={{ width: expWidths.expenseDate, minWidth: expWidths.expenseDate, maxWidth: expWidths.expenseDate }}
                          className="py-2.5 px-3 text-slate-700 whitespace-nowrap font-medium border-b border-slate-100"
                        >
                          {exp.expenseDate ? formatDate(exp.expenseDate) : formatMonthYear(exp.expenseMonth || selectedMonth)}
                        </td>
                        <td
                          style={{ width: expWidths.head, minWidth: expWidths.head, maxWidth: expWidths.head }}
                          className="py-2.5 px-3 border-b border-slate-100"
                        >
                          <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                            {exp.category || 'Maintenance'}
                          </span>
                        </td>
                        <td
                          style={{ width: expWidths.description, minWidth: expWidths.description, maxWidth: expWidths.description }}
                          className={`py-2.5 px-3 font-semibold text-slate-800 border-b border-slate-100 ${
                            autoWrap ? 'whitespace-normal break-words leading-tight' : 'truncate'
                          }`}
                        >
                          {exp.description}
                        </td>
                        <td
                          style={{ width: expWidths.payee, minWidth: expWidths.payee, maxWidth: expWidths.payee }}
                          className={`py-2.5 px-3 text-slate-600 border-b border-slate-100 ${
                            autoWrap ? 'whitespace-normal break-words leading-tight' : 'truncate'
                          }`}
                        >
                          {exp.vendorOrPayee || <span className="text-slate-400">—</span>}
                        </td>
                        <td
                          style={{ width: expWidths.paymentMode, minWidth: expWidths.paymentMode, maxWidth: expWidths.paymentMode }}
                          className="py-2.5 px-3 text-slate-600 border-b border-slate-100"
                        >
                          <span className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-50 text-slate-600 border border-slate-100">
                            {exp.paymentMode || 'Cash'}
                          </span>
                        </td>
                        <td
                          style={{ width: expWidths.amount, minWidth: expWidths.amount, maxWidth: expWidths.amount }}
                          className="py-2.5 px-3 text-right font-mono font-extrabold text-rose-700 border-b border-slate-100"
                        >
                          {formatCurrency(exp.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-50 border-t-2 border-slate-200 font-extrabold text-xs">
                    <tr>
                      <td colSpan={6} className="py-2.5 px-3 text-slate-800 uppercase tracking-wider">
                        Total Property Expenses
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-rose-700">
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
          <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white rounded-xl p-4 sm:p-5 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <span className="text-[10px] uppercase font-extrabold tracking-wider text-teal-400">
                  Monthly Statement Summary · {reportData.property?.name}
                </span>
                <h4 className="text-base font-extrabold text-white mt-0.5">
                  Net Operating Cash Flow for {formatMonthYear(selectedMonth)}
                </h4>
                <p className="text-[11px] text-slate-300 mt-0.5">
                  Calculation: Total Rent Received ({formatCurrency(summary.totalRentReceived)}) minus Total Expenses ({formatCurrency(summary.totalExpenses)})
                </p>
              </div>

              <div className="text-right bg-white/10 px-4 py-2 rounded-xl backdrop-blur-xs border border-white/10 shrink-0">
                <span className="text-[10px] uppercase font-bold text-slate-300 block">Net Income</span>
                <span className={`text-xl font-black font-mono block ${
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
