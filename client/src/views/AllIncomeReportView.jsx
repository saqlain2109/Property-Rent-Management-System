import React, { useState, useEffect, useMemo } from 'react';
import API from '../services/api';
import * as XLSX from 'xlsx';
import { formatCurrency, formatDate } from '../utils/formatters';
import ApexToolbar from '../components/ApexToolbar';
import {
  getHeaderDragProps,
  useResizableColumns,
  ResizeHandle,
  useFrozenColumns,
  getFrozenColumnStyle
} from '../components/ColumnManager';
import { cycleThreeStateSort, evaluateFilterRule, sortDataRows, extractUniqueValues } from '../utils/tableUtils';
import {
  Receipt,
  TrendingUp,
  Search,
  Calendar,
  CreditCard,
  Edit2,
  X,
  Check,
  Download,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  Building2,
  User,
  Hash,
  Layers,
  Phone,
  FileSpreadsheet
} from 'lucide-react';

const ALL_INCOME_COLUMNS_DEF = [
  { id: 'index', label: '#', defaultVisible: true },
  { id: 'receiptDate', label: 'Receipt Date', defaultVisible: true },
  { id: 'receiptNumber', label: 'Receipt #', defaultVisible: true },
  { id: 'contractNo', label: 'Contract #', defaultVisible: true },
  { id: 'property', label: 'Property', defaultVisible: true },
  { id: 'unit', label: 'Sub-Property / Partition', defaultVisible: true },
  { id: 'tenant', label: 'Tenant', defaultVisible: true },
  { id: 'phone', label: 'Phone', defaultVisible: false },
  { id: 'monthsCovered', label: 'Month(s) Covered', defaultVisible: true },
  { id: 'paymentMode', label: 'Payment Mode', defaultVisible: true },
  { id: 'referenceNumber', label: 'Ref / Cheque #', defaultVisible: true },
  { id: 'bankName', label: 'Bank', defaultVisible: false },
  { id: 'comments', label: 'Notes / Comments', defaultVisible: true },
  { id: 'totalAmount', label: 'Amount (₹)', defaultVisible: true },
  { id: 'actions', label: 'Action', defaultVisible: true },
];

const DEFAULT_INCOME_COLS = [
  'index',
  'receiptDate',
  'receiptNumber',
  'contractNo',
  'property',
  'unit',
  'tenant',
  'monthsCovered',
  'paymentMode',
  'referenceNumber',
  'comments',
  'totalAmount',
  'actions'
];

const DEFAULT_INCOME_COLUMN_WIDTHS = {
  index: 50,
  receiptDate: 110,
  receiptNumber: 130,
  contractNo: 120,
  property: 160,
  unit: 140,
  tenant: 150,
  phone: 120,
  monthsCovered: 150,
  paymentMode: 120,
  referenceNumber: 130,
  bankName: 120,
  comments: 180,
  totalAmount: 130,
  actions: 85
};

export default function AllIncomeReportView() {
  const [receipts, setReceipts] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [properties, setProperties] = useState([]);
  const [units, setUnits] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);

  // APEX Toolbar & table state
  const [search, setSearch] = useState(() => localStorage.getItem('income_report_search') || '');
  useEffect(() => { localStorage.setItem('income_report_search', search); }, [search]);

  const [sortConfig, setSortConfig] = useState({ key: 'receiptDate', direction: 'desc' });
  const [activeFilters, setActiveFilters] = useState([]);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [currentPage, setCurrentPage] = useState(1);
  const [isHeaderSticky, setIsHeaderSticky] = useState(true);

  // Column management & widths
  const [visibleColumns, setVisibleColumns] = useState(() => {
    const saved = localStorage.getItem('cols_all_income_v1');
    if (!saved) return DEFAULT_INCOME_COLS;
    try {
      const allowed = ALL_INCOME_COLUMNS_DEF.map(c => c.id);
      const parsed = JSON.parse(saved).filter(c => allowed.includes(c));
      return parsed.length > 0 ? parsed : DEFAULT_INCOME_COLS;
    } catch {
      return DEFAULT_INCOME_COLS;
    }
  });

  const {
    columnWidths,
    handleResizeStart,
    resetColumnWidths
  } = useResizableColumns('all_income_v1', DEFAULT_INCOME_COLUMN_WIDTHS);

  const [frozenColumnCount, setFrozenColumnCount] = useFrozenColumns('all_income_v1', 0);

  // Edit Receipt Modal
  const [editingReceipt, setEditingReceipt] = useState(null);
  const [editForm, setEditForm] = useState({
    receiptNumber: '',
    receiptDate: '',
    rentMonthYear: '',
    propertyId: '',
    unitId: '',
    tenantId: '',
    contractNo: '',
    customContractNo: '',
    isCustomContract: false,
    totalAmount: '',
    paymentMode: 'Cash',
    referenceNumber: '',
    bankName: '',
    comments: ''
  });
  const [savingReceipt, setSavingReceipt] = useState(false);

  const fetchIncomeData = async () => {
    try {
      setLoading(true);
      const [pRes, tRes, propRes, uRes, aRes] = await Promise.all([
        API.get('/payments'),
        API.get('/tenants'),
        API.get('/properties'),
        API.get('/units'),
        API.get('/assignments')
      ]);
      if (pRes.data?.success) setReceipts(pRes.data.data || []);
      if (tRes.data?.success) setTenants(tRes.data.data || []);
      if (propRes.data?.success) setProperties(propRes.data.data || []);
      if (uRes.data?.success) setUnits(uRes.data.data || []);
      if (aRes.data?.success) setAssignments(aRes.data.data || []);
    } catch (err) {
      console.error('Failed to load income data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIncomeData();
  }, []);

  const handleHeaderSort = (colId) => {
    if (colId === 'actions' || colId === 'index') return;
    setSortConfig(prev => cycleThreeStateSort(prev, colId));
  };

  const filterSuggestions = useMemo(() => {
    return {
      receiptNumber: extractUniqueValues(receipts, r => r.receiptNumber),
      contractNo: extractUniqueValues(receipts, r => r.contractNo),
      property: extractUniqueValues(receipts, r => r.unitId?.propertyId?.name),
      unit: extractUniqueValues(receipts, r => r.unitId?.subUnitPartition || r.unitId?.unitName),
      tenant: extractUniqueValues(receipts, r => r.tenantId?.name),
      phone: extractUniqueValues(receipts, r => r.tenantId?.phone),
      paymentMode: ['Cash', 'Bank Transfer', 'Cheque', 'UPI / Online'],
      monthsCovered: extractUniqueValues(receipts, r => r.monthsCovered),
      bankName: extractUniqueValues(receipts, r => r.bankName),
      comments: extractUniqueValues(receipts, r => r.comments)
    };
  }, [receipts]);

  // Filtering & Sorting
  const processedReceipts = useMemo(() => {
    let rows = [...receipts];

    // 1. Text Search across all visible data
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      rows = rows.filter(r => {
        const rNo = (r.receiptNumber || '').toLowerCase();
        const cNo = (r.contractNo || '').toLowerCase();
        const prop = (r.unitId?.propertyId?.name || '').toLowerCase();
        const unit = (r.unitId?.subUnitPartition || r.unitId?.unitName || '').toLowerCase();
        const ten = (r.tenantId?.name || '').toLowerCase();
        const phone = (r.tenantId?.phone || '').toLowerCase();
        const mode = (r.paymentMode || '').toLowerCase();
        const ref = (r.referenceNumber || '').toLowerCase();
        const bank = (r.bankName || '').toLowerCase();
        const comm = (r.comments || '').toLowerCase();
        const months = (r.monthsCovered || '').toLowerCase();
        const amt = String(r.totalAmount || '');

        return (
          rNo.includes(q) ||
          cNo.includes(q) ||
          prop.includes(q) ||
          unit.includes(q) ||
          ten.includes(q) ||
          phone.includes(q) ||
          mode.includes(q) ||
          ref.includes(q) ||
          bank.includes(q) ||
          comm.includes(q) ||
          months.includes(q) ||
          amt.includes(q)
        );
      });
    }

    // 2. APEX Structured Filters
    if (activeFilters.length > 0) {
      rows = rows.filter(r => {
        return activeFilters.every(flt => {
          let cellVal = '';
          if (flt.column === 'receiptNumber') cellVal = r.receiptNumber;
          else if (flt.column === 'receiptDate') cellVal = r.receiptDate ? formatDate(r.receiptDate) : '';
          else if (flt.column === 'contractNo') cellVal = r.contractNo;
          else if (flt.column === 'property') cellVal = r.unitId?.propertyId?.name;
          else if (flt.column === 'unit') cellVal = r.unitId?.subUnitPartition || r.unitId?.unitName;
          else if (flt.column === 'tenant') cellVal = r.tenantId?.name;
          else if (flt.column === 'phone') cellVal = r.tenantId?.phone;
          else if (flt.column === 'monthsCovered') cellVal = r.monthsCovered;
          else if (flt.column === 'paymentMode') cellVal = r.paymentMode;
          else if (flt.column === 'referenceNumber') cellVal = r.referenceNumber;
          else if (flt.column === 'bankName') cellVal = r.bankName;
          else if (flt.column === 'comments') cellVal = r.comments;
          else if (flt.column === 'totalAmount') cellVal = r.totalAmount;
          return evaluateFilterRule(cellVal, flt.operator, flt.value);
        });
      });
    }

    // 3. Sorting
    if (sortConfig.key) {
      rows = sortDataRows(rows, sortConfig.key, sortConfig.direction, (item, key) => {
        if (key === 'totalAmount') return Number(item.totalAmount) || 0;
        if (key === 'receiptDate') return item.receiptDate ? new Date(item.receiptDate).getTime() : 0;
        if (key === 'property') return item.unitId?.propertyId?.name || '';
        if (key === 'unit') return item.unitId?.subUnitPartition || item.unitId?.unitName || '';
        if (key === 'tenant') return item.tenantId?.name || '';
        if (key === 'phone') return item.tenantId?.phone || '';
        return item[key] || '';
      });
    }

    return rows;
  }, [receipts, search, activeFilters, sortConfig]);

  // Pagination
  const totalPages = rowsPerPage === 'All' ? 1 : Math.ceil(processedReceipts.length / Number(rowsPerPage));
  const paginatedReceipts = useMemo(() => {
    if (rowsPerPage === 'All') return processedReceipts;
    const start = (currentPage - 1) * Number(rowsPerPage);
    return processedReceipts.slice(start, start + Number(rowsPerPage));
  }, [processedReceipts, rowsPerPage, currentPage]);

  // Export to Excel
  const exportToExcel = () => {
    try {
      const dataToExport = processedReceipts.map((r, i) => ({
        '#': i + 1,
        'Receipt Date': r.receiptDate ? formatDate(r.receiptDate) : '',
        'Receipt #': r.receiptNumber || '',
        'Contract #': r.contractNo || '',
        'Property': r.unitId?.propertyId?.name || '',
        'Sub-Property / Partition': r.unitId?.subUnitPartition || r.unitId?.unitName || '',
        'Tenant': r.tenantId?.name || '',
        'Phone': r.tenantId?.phone || '',
        'Month(s) Covered': r.monthsCovered || '',
        'Payment Mode': r.paymentMode || 'Cash',
        'Ref / Cheque #': r.referenceNumber || '',
        'Bank': r.bankName || '',
        'Notes / Comments': r.comments || '',
        'Amount (₹)': Number(r.totalAmount) || 0
      }));

      const ws = XLSX.utils.json_to_sheet(dataToExport);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'All Income');
      XLSX.writeFile(wb, `All_Income_Report_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (err) {
      console.error('Failed to export income to Excel:', err);
      alert('Failed to export Excel.');
    }
  };

  // Open Edit Modal - Single-Value Form for full record editing
  const openEditReceiptModal = (r) => {
    setEditingReceipt(r);
    const allocMonth = r.allocations?.[0]?.rentMonthYear || (r.monthsCovered?.split(',')?.[0]?.trim()) || (r.receiptDate ? new Date(r.receiptDate).toISOString().slice(0, 7) : '');
    const propId = r.unitId?.propertyId?._id || r.unitId?.propertyId || '';
    const uId = r.unitId?._id || r.unitId || '';
    const tId = r.tenantId?._id || r.tenantId || '';
    const cNo = r.contractNo || r.allocations?.[0]?.contractNo || '';

    setEditForm({
      receiptNumber: r.receiptNumber || '',
      receiptDate: r.receiptDate ? new Date(r.receiptDate).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
      rentMonthYear: allocMonth,
      propertyId: propId,
      unitId: uId,
      tenantId: tId,
      contractNo: cNo,
      customContractNo: '',
      isCustomContract: false,
      totalAmount: String(r.totalAmount || 0),
      paymentMode: r.paymentMode || 'Cash',
      referenceNumber: r.referenceNumber || '',
      bankName: r.bankName || '',
      comments: r.comments || ''
    });
  };

  const availableUnitsForEdit = useMemo(() => {
    if (!editForm.propertyId) return units;
    return units.filter(u => String(u.propertyId?._id || u.propertyId) === String(editForm.propertyId));
  }, [units, editForm.propertyId]);

  // Dynamic contract options filtered strictly by date ranges, tenant, and unit
  const contractOptions = useMemo(() => {
    const targetMonth = editForm.rentMonthYear || (editForm.receiptDate ? editForm.receiptDate.slice(0, 7) : '');
    const tId = String(editForm.tenantId || '');
    const uId = String(editForm.unitId || '');

    // Match assignments for selected tenant / unit
    const relevantContracts = assignments.filter(c => {
      const cTId = String(c.tenantId?._id || c.tenantId || '');
      const cUId = String(c.unitId?._id || c.unitId || '');
      if (tId && cTId !== tId) return false;
      if (uId && cUId !== uId) return false;
      return true;
    });

    const validForDateRange = [];
    const otherPeriods = [];

    relevantContracts.forEach(c => {
      const sMonth = c.startDate ? c.startDate.slice(0, 7) : null;
      const eMonth = c.endDate ? c.endDate.slice(0, 7) : null;

      let inRange = true;
      if (targetMonth) {
        if (sMonth && sMonth > targetMonth) inRange = false;
        if (eMonth && eMonth < targetMonth) inRange = false;
      }

      if (inRange) {
        validForDateRange.push(c);
      } else {
        otherPeriods.push(c);
      }
    });

    return { validForDateRange, otherPeriods, allRelevant: relevantContracts };
  }, [assignments, editForm.tenantId, editForm.unitId, editForm.rentMonthYear, editForm.receiptDate]);

  const handleSaveReceipt = async (e) => {
    e.preventDefault();
    if (!editingReceipt) return;
    try {
      setSavingReceipt(true);
      const targetMonth = editForm.rentMonthYear || editForm.receiptDate.slice(0, 7);
      const amountNum = Number(editForm.totalAmount);
      const resolvedContractNo = editForm.isCustomContract
        ? (editForm.customContractNo || editForm.contractNo)
        : editForm.contractNo;

      const payload = {
        receiptNumber: editForm.receiptNumber.trim(),
        receiptDate: editForm.receiptDate,
        totalAmount: amountNum,
        paymentMode: editForm.paymentMode,
        referenceNumber: editForm.referenceNumber,
        bankName: editForm.bankName,
        contractNo: resolvedContractNo,
        tenantId: editForm.tenantId || undefined,
        unitId: editForm.unitId || undefined,
        comments: editForm.comments,
        allocations: [
          {
            rentMonthYear: targetMonth,
            allocatedAmount: amountNum,
            contractNo: resolvedContractNo,
            notes: editForm.comments || ''
          }
        ]
      };

      const res = await API.put(`/payments/${editingReceipt._id}`, payload);
      if (res.data?.success) {
        setEditingReceipt(null);
        fetchIncomeData();
      }
    } catch (err) {
      console.error('Failed to update receipt:', err);
      alert(err.response?.data?.message || 'Failed to update payment receipt.');
    } finally {
      setSavingReceipt(false);
    }
  };

  // Summary Metrics
  const totalIncome = useMemo(() => {
    return processedReceipts.reduce((sum, r) => sum + (Number(r.totalAmount) || 0), 0);
  }, [processedReceipts]);

  const grandTotalIncome = useMemo(() => {
    return receipts.reduce((sum, r) => sum + (Number(r.totalAmount) || 0), 0);
  }, [receipts]);

  return (
    <div className="space-y-4">
      {/* Header & KPI Summary */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-teal-600 text-white shadow-sm shadow-teal-600/30 shrink-0">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight">All Income Report</h1>
                <span className="px-2.5 py-0.5 rounded-full bg-teal-100 text-teal-800 text-xs font-bold border border-teal-200">
                  {processedReceipts.length} Line{processedReceipts.length !== 1 ? 's' : ''}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Comprehensive register of all rent collections, receipts, payment modes, and tenant transactions
              </p>
            </div>
          </div>

          {/* Quick Metrics */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="px-4 py-2 rounded-xl bg-emerald-50 border border-emerald-200 shadow-2xs">
              <span className="text-[10px] text-emerald-700 font-bold uppercase tracking-wider block">
                Total Income (Filtered)
              </span>
              <span className="text-base sm:text-lg font-black text-emerald-800 font-mono">
                {formatCurrency(totalIncome)}
              </span>
            </div>

            <div className="px-4 py-2 rounded-xl bg-slate-50 border border-slate-200 shadow-2xs">
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">
                Portfolio Grand Total
              </span>
              <span className="text-base sm:text-lg font-bold text-slate-800 font-mono">
                {formatCurrency(grandTotalIncome)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* APEX Interactive Toolbar */}
      <ApexToolbar
        search={search}
        onSearchChange={(v) => { setSearch(v); setCurrentPage(1); }}
        rowsPerPage={rowsPerPage}
        onRowsPerPageChange={(v) => { setRowsPerPage(v); setCurrentPage(1); }}
        availableRowsOptions={[10, 25, 50, 100, 'All']}
        columns={ALL_INCOME_COLUMNS_DEF}
        defaultColumns={DEFAULT_INCOME_COLS}
        visibleColumns={visibleColumns}
        onChangeVisibleColumns={(cols) => {
          setVisibleColumns(cols);
          try { localStorage.setItem('cols_all_income_v1', JSON.stringify(cols)); } catch(e){}
        }}
        columnWidths={columnWidths}
        onResetWidths={resetColumnWidths}
        sortConfig={sortConfig}
        onSortChange={setSortConfig}
        isHeaderSticky={isHeaderSticky}
        onToggleHeaderSticky={setIsHeaderSticky}
        frozenColumnCount={frozenColumnCount}
        onFrozenColumnCountChange={setFrozenColumnCount}
        filters={activeFilters}
        onFiltersChange={(f) => { setActiveFilters(f); setCurrentPage(1); }}
        filterSuggestions={filterSuggestions}
        onExport={exportToExcel}
        storageKey="all_income_v1"
      />

      {/* Grid Container */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden flex flex-col">
        <div className="overflow-x-auto max-h-[68vh] overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-7 h-7 border-4 border-teal-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-xs text-slate-500 ml-3 font-medium">Loading all income records...</span>
            </div>
          ) : paginatedReceipts.length === 0 ? (
            <div className="py-20 text-center text-slate-400 text-xs">
              {receipts.length === 0
                ? 'No income records found in system.'
                : 'No income lines match your current search and filter settings.'}
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead className={`bg-slate-100 text-slate-700 font-bold border-b border-slate-300 select-none ${isHeaderSticky ? 'sticky top-0 z-20 shadow-xs' : ''}`}>
                <tr>
                  {visibleColumns.map((colId, colIndex) => {
                    const def = ALL_INCOME_COLUMNS_DEF.find(c => c.id === colId) || { id: colId, label: colId };
                    const width = columnWidths[colId] || DEFAULT_INCOME_COLUMN_WIDTHS[colId] || 120;
                    const frozenStyle = getFrozenColumnStyle(colIndex, frozenColumnCount, visibleColumns, columnWidths, true);

                    const isActions = colId === 'actions';
                    const isIndex = colId === 'index';
                    const isAmount = colId === 'totalAmount';
                    const align = isActions || isIndex ? 'text-center' : isAmount ? 'text-right' : 'text-left';

                    return (
                      <th
                        key={colId}
                        {...getHeaderDragProps(colId, visibleColumns, (cols) => {
                          setVisibleColumns(cols);
                          try { localStorage.setItem('cols_all_income_v1', JSON.stringify(cols)); } catch(e){}
                        }, 'all_income_v1')}
                        style={{ ...frozenStyle, width: `${Math.max(width, 45)}px`, minWidth: `${Math.max(width, 45)}px` }}
                        className={`py-2.5 pl-3 pr-6 border-r border-slate-300 relative group bg-slate-100 ${align}`}
                      >
                        <div className={`flex items-center gap-1 w-full ${isActions || isIndex ? 'justify-center' : isAmount ? 'justify-end' : 'justify-start'}`}>
                          {isActions || isIndex ? (
                            <span className="text-xs font-bold text-slate-700">{def.label}</span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleHeaderSort(colId)}
                              className="group/btn flex items-center gap-1 min-w-0 max-w-full text-xs font-bold text-slate-700 hover:text-slate-900 transition-colors text-left cursor-pointer"
                              title={`Sort by ${def.label} (Click: Descending → Ascending → Clear)`}
                            >
                              <span className="truncate">{def.label}</span>
                              <span className="inline-flex shrink-0 items-center justify-center w-3.5 h-3.5">
                                {sortConfig.key === colId ? (
                                  sortConfig.direction === 'desc' ? (
                                    <span className="text-teal-600 font-extrabold text-[13px] leading-none">↓</span>
                                  ) : (
                                    <span className="text-teal-600 font-extrabold text-[13px] leading-none">↑</span>
                                  )
                                ) : (
                                  <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-0 group-hover/btn:opacity-100 transition-opacity" />
                                )}
                              </span>
                            </button>
                          )}
                        </div>
                        <ResizeHandle colId={colId} onResizeStart={handleResizeStart} />
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedReceipts.map((r, rowIndex) => {
                  const globalIndex = rowsPerPage === 'All' ? rowIndex + 1 : (currentPage - 1) * Number(rowsPerPage) + rowIndex + 1;

                  return (
                    <tr key={r._id} className="hover:bg-slate-50/80 transition-colors">
                      {visibleColumns.map((colId, colIndex) => {
                        const frozenStyle = getFrozenColumnStyle(colIndex, frozenColumnCount, visibleColumns, columnWidths, false);

                        if (colId === 'index') {
                          return (
                            <td key={colId} style={frozenStyle} className="py-2.5 px-3 border-r border-slate-200 text-center font-mono text-slate-400 whitespace-nowrap">
                              {globalIndex}
                            </td>
                          );
                        }

                        if (colId === 'receiptDate') {
                          return (
                            <td key={colId} style={frozenStyle} className="py-2.5 px-3 border-r border-slate-200 whitespace-nowrap text-slate-700">
                              {formatDate(r.receiptDate)}
                            </td>
                          );
                        }

                        if (colId === 'receiptNumber') {
                          return (
                            <td key={colId} style={frozenStyle} className="py-2.5 px-3 border-r border-slate-200 font-mono font-bold text-teal-800 whitespace-nowrap">
                              {r.receiptNumber}
                            </td>
                          );
                        }

                        if (colId === 'contractNo') {
                          return (
                            <td key={colId} style={frozenStyle} className="py-2.5 px-3 border-r border-slate-200 whitespace-nowrap">
                              {r.contractNo ? (
                                <span className="inline-block px-2 py-0.5 rounded-lg bg-teal-50 text-teal-800 font-mono font-bold text-[11px] border border-teal-200/60">
                                  {r.contractNo}
                                </span>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </td>
                          );
                        }

                        if (colId === 'property') {
                          return (
                            <td key={colId} style={frozenStyle} className="py-2.5 px-3 border-r border-slate-200 font-medium text-slate-900 whitespace-nowrap">
                              {r.unitId?.propertyId?.name || '—'}
                            </td>
                          );
                        }

                        if (colId === 'unit') {
                          return (
                            <td key={colId} style={frozenStyle} className="py-2.5 px-3 border-r border-slate-200 whitespace-nowrap font-medium text-slate-700">
                              {r.unitId?.subUnitPartition || r.unitId?.unitName || '—'}
                            </td>
                          );
                        }

                        if (colId === 'tenant') {
                          return (
                            <td key={colId} style={frozenStyle} className="py-2.5 px-3 border-r border-slate-200 whitespace-nowrap font-bold text-slate-900">
                              {r.tenantId?.name || '—'}
                            </td>
                          );
                        }

                        if (colId === 'phone') {
                          return (
                            <td key={colId} style={frozenStyle} className="py-2.5 px-3 border-r border-slate-200 whitespace-nowrap font-mono text-slate-600">
                              {r.tenantId?.phone || '—'}
                            </td>
                          );
                        }

                        if (colId === 'monthsCovered') {
                          return (
                            <td key={colId} style={frozenStyle} className="py-2.5 px-3 border-r border-slate-200 whitespace-nowrap">
                              <span className="inline-block px-2 py-0.5 rounded-md bg-slate-100 text-slate-800 font-bold text-[11px] border border-slate-200">
                                {r.monthsCovered || (r.allocations && r.allocations.map(a => a.rentMonthYear).join(', ')) || '—'}
                              </span>
                            </td>
                          );
                        }

                        if (colId === 'paymentMode') {
                          return (
                            <td key={colId} style={frozenStyle} className="py-2.5 px-3 border-r border-slate-200 whitespace-nowrap">
                              <span className="inline-block px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[10px] font-semibold border border-slate-200">
                                {r.paymentMode || 'Cash'}
                              </span>
                            </td>
                          );
                        }

                        if (colId === 'referenceNumber') {
                          return (
                            <td key={colId} style={frozenStyle} className="py-2.5 px-3 border-r border-slate-200 font-mono text-[11px] text-slate-600 whitespace-nowrap">
                              {r.referenceNumber || '—'}
                            </td>
                          );
                        }

                        if (colId === 'bankName') {
                          return (
                            <td key={colId} style={frozenStyle} className="py-2.5 px-3 border-r border-slate-200 text-slate-600 whitespace-nowrap">
                              {r.bankName || '—'}
                            </td>
                          );
                        }

                        if (colId === 'comments') {
                          return (
                            <td key={colId} style={frozenStyle} className="py-2.5 px-3 border-r border-slate-200 text-slate-600 text-[11px] max-w-xs truncate" title={r.comments}>
                              {r.comments || '—'}
                            </td>
                          );
                        }

                        if (colId === 'totalAmount') {
                          return (
                            <td key={colId} style={frozenStyle} className="py-2.5 px-3 border-r border-slate-200 text-right font-mono font-bold text-emerald-700 whitespace-nowrap">
                              {formatCurrency(r.totalAmount || 0)}
                            </td>
                          );
                        }

                        if (colId === 'actions') {
                          return (
                            <td key={colId} style={frozenStyle} className="py-2.5 px-3 text-center whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() => openEditReceiptModal(r)}
                                className="px-2.5 py-1 rounded-lg bg-teal-50 hover:bg-teal-100 text-teal-700 font-bold text-[11px] transition-colors inline-flex items-center gap-1.5 border border-teal-200/60 cursor-pointer shadow-2xs"
                                title="Edit Receipt Details"
                              >
                                <Edit2 className="w-3 h-3 text-teal-600" />
                                <span>Edit</span>
                              </button>
                            </td>
                          );
                        }

                        return <td key={colId} style={frozenStyle} className="py-2.5 px-3 border-r border-slate-200">—</td>;
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination Footer */}
        {processedReceipts.length > 0 && (
          <div className="px-4 py-3 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
            <span className="font-medium">
              Showing{' '}
              <strong>
                {rowsPerPage === 'All'
                  ? 1
                  : Math.min((currentPage - 1) * Number(rowsPerPage) + 1, processedReceipts.length)}
              </strong>{' '}
              to{' '}
              <strong>
                {rowsPerPage === 'All'
                  ? processedReceipts.length
                  : Math.min(currentPage * Number(rowsPerPage), processedReceipts.length)}
              </strong>{' '}
              of <strong>{processedReceipts.length}</strong> income records
            </span>

            {rowsPerPage !== 'All' && totalPages > 1 && (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
                  disabled={currentPage === 1}
                  className="p-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span className="font-bold text-slate-700 px-2">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))}
                  disabled={currentPage >= totalPages}
                  className="p-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* EDIT RECEIPT MODAL - Clean Single-Value Form (No Grid) */}
      {editingReceipt && (
        <div className="fixed inset-0 z-[99999] overflow-y-auto bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5">
          <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col my-auto max-h-[90vh] z-[100000] animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-4 sm:px-6 border-b border-slate-800 flex items-center justify-between bg-slate-900 text-white shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-teal-600 text-white shadow-xs">
                  <Receipt className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-extrabold text-white text-base">Edit Income Transaction</h3>
                    <span className="px-2.5 py-0.5 rounded-md bg-teal-500/20 text-teal-300 text-xs font-mono font-bold border border-teal-500/30">
                      {editForm.receiptNumber || editingReceipt.receiptNumber}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Single transaction form — updating receipt and monthly allocation
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingReceipt(null)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form Body */}
            <form onSubmit={handleSaveReceipt} className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4 bg-white">
              {/* Row 1: Receipt Number & Payment Date */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Receipt # <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={editForm.receiptNumber}
                    onChange={(e) => setEditForm({ ...editForm, receiptNumber: e.target.value })}
                    className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-400 font-mono font-bold text-teal-800"
                    placeholder="e.g. REC-2026-0001"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Payment Date <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={editForm.receiptDate}
                    onChange={(e) => setEditForm({ ...editForm, receiptDate: e.target.value })}
                    className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-400"
                  />
                </div>
              </div>

              {/* Row 2: Accounting Month & Amount */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Accounting Month <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="month"
                    required
                    value={editForm.rentMonthYear}
                    onChange={(e) => setEditForm({ ...editForm, rentMonthYear: e.target.value })}
                    className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-400 font-mono font-bold text-slate-800"
                  />
                  <span className="text-[10px] text-slate-400 mt-0.5 block">Determines contract period & monthly ledger</span>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Amount (₹) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    required
                    min="0"
                    value={editForm.totalAmount}
                    onChange={(e) => setEditForm({ ...editForm, totalAmount: e.target.value })}
                    className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-200 font-black text-emerald-700 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                    placeholder="e.g. 25000"
                  />
                </div>
              </div>

              {/* Row 3: Property & Sub-Property / Partition */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Property</label>
                  <select
                    value={editForm.propertyId}
                    onChange={(e) => {
                      const newPropId = e.target.value;
                      const validUnits = units.filter(u => String(u.propertyId?._id || u.propertyId) === String(newPropId));
                      const newUnitId = validUnits.length > 0 ? validUnits[0]._id : '';
                      setEditForm({ ...editForm, propertyId: newPropId, unitId: newUnitId });
                    }}
                    className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-teal-400 font-medium"
                  >
                    <option value="">-- Choose Property --</option>
                    {properties.map(p => (
                      <option key={p._id} value={p._id}>{p.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Sub-Property / Partition</label>
                  <select
                    value={editForm.unitId}
                    onChange={(e) => setEditForm({ ...editForm, unitId: e.target.value })}
                    className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-teal-400 font-medium"
                  >
                    <option value="">-- Choose Unit / Partition --</option>
                    {availableUnitsForEdit.map(u => (
                      <option key={u._id} value={u._id}>
                        {u.subUnitPartition || u.unitName}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Row 4: Tenant & Contract No (Filtered by Date Ranges!) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Tenant</label>
                  <select
                    value={editForm.tenantId}
                    onChange={(e) => setEditForm({ ...editForm, tenantId: e.target.value })}
                    className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-teal-400 font-medium"
                  >
                    <option value="">-- Choose Tenant --</option>
                    {tenants.map(t => (
                      <option key={t._id} value={t._id}>
                        {t.name} {t.phone ? `(${t.phone})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-bold text-slate-700">
                      Contract # (Date Range Filtered)
                    </label>
                    <button
                      type="button"
                      onClick={() => setEditForm({ ...editForm, isCustomContract: !editForm.isCustomContract })}
                      className="text-[10px] text-teal-700 hover:underline font-semibold cursor-pointer"
                    >
                      {editForm.isCustomContract ? 'Choose from list' : 'Custom / Type'}
                    </button>
                  </div>

                  {editForm.isCustomContract ? (
                    <input
                      type="text"
                      placeholder="Type custom contract #..."
                      value={editForm.customContractNo || editForm.contractNo}
                      onChange={(e) => setEditForm({ ...editForm, customContractNo: e.target.value, contractNo: e.target.value })}
                      className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-200 font-mono font-bold text-teal-800 focus:outline-none focus:ring-2 focus:ring-teal-400"
                    />
                  ) : (
                    <select
                      value={editForm.contractNo}
                      onChange={(e) => setEditForm({ ...editForm, contractNo: e.target.value })}
                      className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-200 bg-white font-mono font-bold text-teal-800 focus:outline-none focus:ring-2 focus:ring-teal-400"
                    >
                      <option value="">-- No Contract / Clear --</option>

                      {/* Current assigned contract if not in list */}
                      {editForm.contractNo && !assignments.some(c => (c.contractNo || c.assignmentCode) === editForm.contractNo) && (
                        <option value={editForm.contractNo}>
                          {editForm.contractNo} (Current)
                        </option>
                      )}

                      {/* Option Group 1: Strictly Valid for this Accounting Month / Date Range */}
                      {contractOptions.validForDateRange.length > 0 && (
                        <optgroup label={`✔ Valid for ${editForm.rentMonthYear || 'Period'} (Within Date Range)`}>
                          {contractOptions.validForDateRange.map(c => {
                            const cNo = c.contractNo || c.assignmentCode;
                            const sStr = c.startDate ? formatDate(c.startDate) : 'Start';
                            const eStr = c.endDate ? formatDate(c.endDate) : 'Active';
                            return (
                              <option key={c._id} value={cNo}>
                                {cNo} ({sStr} to {eStr})
                              </option>
                            );
                          })}
                        </optgroup>
                      )}

                      {/* Option Group 2: Other Contracts for this Tenant/Unit (Outside range) */}
                      {contractOptions.otherPeriods.length > 0 && (
                        <optgroup label="⚠ Other Contracts (Outside this Month Range)">
                          {contractOptions.otherPeriods.map(c => {
                            const cNo = c.contractNo || c.assignmentCode;
                            const sStr = c.startDate ? formatDate(c.startDate) : 'Start';
                            const eStr = c.endDate ? formatDate(c.endDate) : 'Ended';
                            return (
                              <option key={c._id} value={cNo}>
                                {cNo} ({sStr} to {eStr})
                              </option>
                            );
                          })}
                        </optgroup>
                      )}

                      {/* Fallback: All contracts if neither tenant nor unit selected */}
                      {contractOptions.validForDateRange.length === 0 && contractOptions.otherPeriods.length === 0 && (
                        <optgroup label="All System Lease Contracts">
                          {assignments.filter(c => c.contractNo).map(c => (
                            <option key={c._id} value={c.contractNo}>
                              {c.contractNo} ({c.tenantId?.name || 'Tenant'})
                            </option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                  )}
                  {contractOptions.validForDateRange.length === 0 && !editForm.isCustomContract && (
                    <span className="text-[10px] text-amber-600 block mt-0.5">
                      No contract date range strictly overlaps with {editForm.rentMonthYear || 'this month'}. Select from other periods or type custom.
                    </span>
                  )}
                </div>
              </div>

              {/* Row 5: Payment Mode & Ref / Cheque # */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Payment Mode</label>
                  <select
                    value={editForm.paymentMode}
                    onChange={(e) => setEditForm({ ...editForm, paymentMode: e.target.value })}
                    className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-teal-400 font-medium"
                  >
                    <option value="Cash">Cash</option>
                    <option value="Bank Transfer / NEFT / RTGS">Bank Transfer / NEFT / RTGS</option>
                    <option value="Cheque">Cheque</option>
                    <option value="UPI / GPay">UPI / GPay</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Ref / Cheque #</label>
                  <input
                    type="text"
                    placeholder="UTR / Cheque / Transaction #"
                    value={editForm.referenceNumber}
                    onChange={(e) => setEditForm({ ...editForm, referenceNumber: e.target.value })}
                    className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-400 font-mono"
                  />
                </div>
              </div>

              {/* Row 6: Bank Name & Comments */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Bank Name</label>
                  <input
                    type="text"
                    placeholder="e.g. HDFC / SBI / ICICI"
                    value={editForm.bankName}
                    onChange={(e) => setEditForm({ ...editForm, bankName: e.target.value })}
                    className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Notes / Comments</label>
                  <textarea
                    rows="2"
                    placeholder="Notes, remarks or collection details..."
                    value={editForm.comments}
                    onChange={(e) => setEditForm({ ...editForm, comments: e.target.value })}
                    className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-400"
                  />
                </div>
              </div>

              {/* Modal Footer */}
              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingReceipt(null)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingReceipt}
                  className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold shadow-xs disabled:opacity-50 flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <Check className="w-4 h-4" />
                  <span>{savingReceipt ? 'Saving Changes...' : 'Save Income'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}