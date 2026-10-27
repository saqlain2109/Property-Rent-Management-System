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
  TrendingDown,
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
  Tag,
  Layers,
  FileSpreadsheet
} from 'lucide-react';

const ALL_EXPENSE_COLUMNS_DEF = [
  { id: 'index', label: '#', defaultVisible: true },
  { id: 'expenseDate', label: 'Expense Date', defaultVisible: true },
  { id: 'expenseMonthYear', label: 'Accounting Month', defaultVisible: true },
  { id: 'expenseCode', label: 'Expense Code', defaultVisible: true },
  { id: 'headType', label: 'Expense Head type', defaultVisible: true },
  { id: 'property', label: 'Property', defaultVisible: true },
  { id: 'propertyCode', label: 'Property Code', defaultVisible: false },
  { id: 'propertyType', label: 'Property Type', defaultVisible: false },
  { id: 'propertyAddress', label: 'Property Address', defaultVisible: false },
  { id: 'city', label: 'City', defaultVisible: false },
  { id: 'ownerOrResponsiblePerson', label: 'Property Owner', defaultVisible: false },
  { id: 'unit', label: 'Sub-Property / Partition', defaultVisible: true },
  { id: 'unitCode', label: 'Unit Code', defaultVisible: false },
  { id: 'subUnitArea', label: 'Partition Area (Sq Ft)', defaultVisible: false },
  { id: 'floor', label: 'Floor / Location', defaultVisible: false },
  { id: 'unitType', label: 'Unit Type', defaultVisible: false },
  { id: 'category', label: 'Expense Head / Category', defaultVisible: true },

  { id: 'description', label: 'Description', defaultVisible: true },
  { id: 'amount', label: 'Amount (₹)', defaultVisible: true },
  { id: 'legacyCode', label: 'Legacy Expense Code', defaultVisible: false },
  { id: 'isReversed', label: 'Reversal Status', defaultVisible: false },
  { id: 'reversalReason', label: 'Reversal Reason', defaultVisible: false },
  { id: 'createdAt', label: 'Created Date', defaultVisible: false },
  { id: 'updatedAt', label: 'Modified Date', defaultVisible: false },
  { id: 'actions', label: 'Action', defaultVisible: true },
];

const DEFAULT_EXPENSE_COLS = [
  'index',
  'expenseDate',
  'expenseMonthYear',
  'expenseCode',
  'headType',
  'property',
  'unit',
  'category',
  'vendorOrPayee',
  'paymentMode',
  'description',
  'amount',
  'actions'
];

const DEFAULT_EXPENSE_COLUMN_WIDTHS = {
  index: 50,
  expenseDate: 110,
  expenseMonthYear: 120,
  expenseCode: 120,
  headType: 110,
  property: 160,
  propertyCode: 120,
  propertyType: 140,
  propertyAddress: 180,
  city: 100,
  ownerOrResponsiblePerson: 130,
  unit: 140,
  unitCode: 110,
  subUnitArea: 130,
  floor: 110,
  unitType: 130,
  category: 150,
  vendorOrPayee: 140,
  paymentMode: 120,
  description: 180,
  amount: 130,
  legacyCode: 120,
  isReversed: 120,
  reversalReason: 150,
  createdAt: 120,
  updatedAt: 120,
  actions: 85
};

// Helper to extract formatted backend values for any expense column ID
const getExpenseFieldVal = (e, colId) => {
  if (!e) return '';
  const isCommon = !e.propertyId;
  const isOther = e.headType === 'Other' || isCommon;
  switch (colId) {
    case 'index': return '';
    case 'expenseDate': return e.expenseDate ? formatDate(e.expenseDate) : '';
    case 'expenseMonthYear': return e.expenseMonthYear || '';
    case 'expenseCode': return e.expenseCode || '';
    case 'headType': return isOther ? 'Other' : 'Property';
    case 'property': return e.propertyId?.name || (isOther ? 'Other / General' : '');
    case 'propertyCode': return e.propertyId?.propertyCode || '';
    case 'propertyType': return e.propertyId?.propertyType || '';
    case 'propertyAddress': return typeof e.propertyId?.address === 'string' ? e.propertyId.address : '';
    case 'city': return e.propertyId?.city || '';
    case 'ownerOrResponsiblePerson': return e.propertyId?.ownerOrResponsiblePerson || '';
    case 'unit': return e.unitId?.subUnitPartition || e.unitId?.unitName || (isCommon ? 'Common' : '');
    case 'unitCode': return e.unitId?.unitCode || '';
    case 'subUnitArea': return e.unitId?.areaSqFt ? `${e.unitId.areaSqFt} sq ft` : '';
    case 'floor': return e.unitId?.floor || '';
    case 'unitType': return e.unitId?.unitType || '';
    case 'category': return e.category || '';
    case 'vendorOrPayee': return e.vendorOrPayee || '';
    case 'paymentMode': return e.paymentMode || 'Cash';
    case 'description': return e.description || '';
    case 'amount': return Number(e.amount) || 0;
    case 'legacyCode': return e.legacyCode || '';
    case 'isReversed': return e.isReversed ? 'Reversed' : 'Active';
    case 'reversalReason': return e.reversalReason || '';
    case 'createdAt': return e.createdAt ? formatDate(e.createdAt) : '';
    case 'updatedAt': return e.updatedAt ? formatDate(e.updatedAt) : '';
    default: return e[colId] != null ? String(e[colId]) : '';
  }
};

export default function AllExpenseReportView() {
  const [expenses, setExpenses] = useState([]);
  const [properties, setProperties] = useState([]);
  const [units, setUnits] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  // APEX Toolbar & table state
  const [search, setSearch] = useState(() => localStorage.getItem('expense_report_search') || '');
  useEffect(() => { localStorage.setItem('expense_report_search', search); }, [search]);

  const [sortConfig, setSortConfig] = useState({ key: 'expenseDate', direction: 'desc' });
  const [activeFilters, setActiveFilters] = useState([]);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [currentPage, setCurrentPage] = useState(1);
  const [isHeaderSticky, setIsHeaderSticky] = useState(true);

  // Column management & widths
  const [visibleColumns, setVisibleColumns] = useState(() => {
    const saved = localStorage.getItem('cols_all_expense_v1');
    if (!saved) return DEFAULT_EXPENSE_COLS;
    try {
      const allowed = ALL_EXPENSE_COLUMNS_DEF.map(c => c.id);
      const parsed = JSON.parse(saved).filter(c => allowed.includes(c));
      return parsed.length > 0 ? parsed : DEFAULT_EXPENSE_COLS;
    } catch {
      return DEFAULT_EXPENSE_COLS;
    }
  });

  const {
    columnWidths,
    handleResizeStart,
    resetColumnWidths
  } = useResizableColumns('all_expense_v1', DEFAULT_EXPENSE_COLUMN_WIDTHS);

  const [frozenColumnCount, setFrozenColumnCount] = useFrozenColumns('all_expense_v1', 0);

  // Edit Expense Modal State - Clean Single-Value Form
  const [editingExpense, setEditingExpense] = useState(null);
  const [editForm, setEditForm] = useState({
    expenseCode: '',
    expenseDate: '',
    expenseMonth: '',
    headType: 'Property',
    propertyId: '',
    unitId: '',
    category: '',
    amount: '',

    description: ''
  });
  const [savingExpense, setSavingExpense] = useState(false);

  const fetchExpenseData = async () => {
    try {
      setLoading(true);
      const [eRes, pRes, uRes, cRes] = await Promise.all([
        API.get('/expenses'),
        API.get('/properties'),
        API.get('/units'),
        API.get('/expenses/categories')
      ]);
      if (eRes.data?.success) setExpenses(eRes.data.data || []);
      if (pRes.data?.success) setProperties(pRes.data.data || []);
      if (uRes.data?.success) setUnits(uRes.data.data || []);
      if (cRes.data?.success) setCategories(cRes.data.data || []);
    } catch (err) {
      console.error('Failed to load expense data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExpenseData();
  }, []);

  const handleHeaderSort = (colId) => {
    if (colId === 'actions' || colId === 'index') return;
    setSortConfig(prev => cycleThreeStateSort(prev, colId));
  };

  const filterSuggestions = useMemo(() => {
    return {
      expenseCode: extractUniqueValues(expenses, e => e.expenseCode),
      expenseMonthYear: extractUniqueValues(expenses, e => e.expenseMonthYear),
      headType: ['Property', 'Other'],
      property: extractUniqueValues(expenses, e => e.propertyId?.name || (e.headType === 'Other' || e.headType === 'Common' ? 'Other / General' : '')),
      propertyCode: extractUniqueValues(expenses, e => e.propertyId?.propertyCode),
      propertyType: extractUniqueValues(expenses, e => e.propertyId?.propertyType),
      city: extractUniqueValues(expenses, e => e.propertyId?.city),
      unit: extractUniqueValues(expenses, e => e.unitId?.subUnitPartition || e.unitId?.unitName),
      unitCode: extractUniqueValues(expenses, e => e.unitId?.unitCode),
      floor: extractUniqueValues(expenses, e => e.unitId?.floor),
      unitType: extractUniqueValues(expenses, e => e.unitId?.unitType),
      category: extractUniqueValues(expenses, e => e.category),
      vendorOrPayee: extractUniqueValues(expenses, e => e.vendorOrPayee),
      paymentMode: ['Cash', 'Bank Transfer', 'Cheque', 'UPI / Online'],
      legacyCode: extractUniqueValues(expenses, e => e.legacyCode),
      isReversed: ['Active', 'Reversed'],
      description: extractUniqueValues(expenses, e => e.description)
    };
  }, [expenses]);

  // Filtering & Sorting
  const processedExpenses = useMemo(() => {
    let rows = [...expenses];

    // 1. Text Search across all visible data
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      rows = rows.filter(e => {
        const code = (e.expenseCode || '').toLowerCase();
        const m = (e.expenseMonthYear || '').toLowerCase();
        const hType = (e.headType || '').toLowerCase();
        const prop = (e.propertyId?.name || (e.headType === 'Common' ? 'Common / All' : '')).toLowerCase();
        const unit = (e.unitId?.subUnitPartition || e.unitId?.unitName || '').toLowerCase();
        const cat = (e.category || '').toLowerCase();
        const payee = (e.vendorOrPayee || '').toLowerCase();
        const mode = (e.paymentMode || '').toLowerCase();
        const desc = (e.description || '').toLowerCase();
        const amt = String(e.amount || '');

        return (
          code.includes(q) ||
          m.includes(q) ||
          hType.includes(q) ||
          prop.includes(q) ||
          unit.includes(q) ||
          cat.includes(q) ||
          payee.includes(q) ||
          mode.includes(q) ||
          ref.includes(q) ||
          desc.includes(q) ||
          amt.includes(q)
        );
      });
    }

    // 2. APEX Structured Filters (supports all backend columns)
    if (activeFilters.length > 0) {
      rows = rows.filter(e => {
        return activeFilters.every(flt => {
          const cellVal = getExpenseFieldVal(e, flt.column);
          return evaluateFilterRule(cellVal, flt.operator, flt.value);
        });
      });
    }

    // 3. Sorting (supports all backend columns)
    if (sortConfig.key) {
      rows = sortDataRows(rows, sortConfig.key, sortConfig.direction, (item, key) => {
        if (key === 'amount') return Number(item.amount) || 0;
        if (['expenseDate', 'createdAt', 'updatedAt'].includes(key)) {
          return item[key] ? new Date(item[key]).getTime() : 0;
        }
        return getExpenseFieldVal(item, key);
      });
    }

    return rows;
  }, [expenses, search, activeFilters, sortConfig]);

  // Pagination
  const totalPages = rowsPerPage === 'All' ? 1 : Math.ceil(processedExpenses.length / Number(rowsPerPage));
  const paginatedExpenses = useMemo(() => {
    if (rowsPerPage === 'All') return processedExpenses;
    const start = (currentPage - 1) * Number(rowsPerPage);
    return processedExpenses.slice(start, start + Number(rowsPerPage));
  }, [processedExpenses, rowsPerPage, currentPage]);

  // Export to Excel with full backend columns support
  const exportToExcel = () => {
    try {
      const exportCols = ALL_EXPENSE_COLUMNS_DEF.filter(c => c.id !== 'actions' && (visibleColumns.includes(c.id) || visibleColumns.length === 0));
      const dataToExport = processedExpenses.map((e, i) => {
        const row = { '#': i + 1 };
        exportCols.forEach(col => {
          if (col.id === 'index') return;
          const val = getExpenseFieldVal(e, col.id);
          row[col.label] = col.id === 'amount' ? (Number(val) || 0) : val;
        });
        return row;
      });

      const ws = XLSX.utils.json_to_sheet(dataToExport);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'All Expenses');
      XLSX.writeFile(wb, `All_Expense_Report_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (err) {
      console.error('Failed to export expenses to Excel:', err);
      alert('Failed to export Excel.');
    }
  };

  // Open Edit Modal - Single-Value Form for full expense editing
  const openEditExpenseModal = (e) => {
    setEditingExpense(e);
    setEditForm({
      expenseCode: e.expenseCode || '',
      expenseDate: e.expenseDate ? new Date(e.expenseDate).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
      expenseMonth: e.expenseMonthYear || (e.expenseDate ? new Date(e.expenseDate).toISOString().slice(0, 7) : ''),
      headType: e.headType || (e.propertyId ? 'Property' : 'Common'),
      propertyId: e.propertyId?._id || e.propertyId || '',
      unitId: e.unitId?._id || e.unitId || '',
      category: e.category || '',
      amount: String(e.amount || 0),

      description: e.description || ''
    });
  };

  const availableUnitsForEdit = useMemo(() => {
    if (!editForm.propertyId) return [];
    return units.filter(u => String(u.propertyId?._id || u.propertyId) === editForm.propertyId);
  }, [units, editForm.propertyId]);

  const handleSaveExpense = async (e) => {
    e.preventDefault();
    if (!editingExpense) return;
    try {
      setSavingExpense(true);
      const isOther = editForm.headType === 'Other' || editForm.headType === 'Common';
      const payload = {
        expenseCode: editForm.expenseCode ? editForm.expenseCode.trim() : undefined,
        expenseDate: editForm.expenseDate,
        expenseMonth: editForm.expenseMonth || editForm.expenseDate.slice(0, 7),
        headType: isOther ? 'Other' : 'Property',
        propertyId: isOther ? null : (editForm.propertyId || null),
        unitId: isOther ? null : (editForm.unitId || null),
        category: editForm.category,
        amount: Number(editForm.amount),

        description: editForm.description
      };

      const res = await API.put(`/expenses/${editingExpense._id}`, payload);
      if (res.data?.success) {
        setEditingExpense(null);
        fetchExpenseData();
      }
    } catch (err) {
      console.error('Failed to update expense:', err);
      alert(err.response?.data?.message || 'Failed to update expense.');
    } finally {
      setSavingExpense(false);
    }
  };

  // Metrics
  const totalExpense = useMemo(() => {
    return processedExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  }, [processedExpenses]);

  const propertyExpenseTotal = useMemo(() => {
    return processedExpenses
      .filter(e => e.headType !== 'Common')
      .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  }, [processedExpenses]);

  const commonExpenseTotal = useMemo(() => {
    return processedExpenses
      .filter(e => e.headType === 'Common')
      .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  }, [processedExpenses]);

  return (
    <div className="space-y-4">
      {/* Header & KPI Summary */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-rose-600 text-white shadow-sm shadow-rose-600/30 shrink-0">
              <TrendingDown className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight">All Expense Report</h1>
                <span className="px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-800 text-xs font-bold border border-rose-200">
                  {processedExpenses.length} Line{processedExpenses.length !== 1 ? 's' : ''}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Complete register of all property maintenance, utilities, repairs, common heads, and vendor disbursements
              </p>
            </div>
          </div>

          {/* Quick Metrics */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="px-4 py-2 rounded-xl bg-rose-50 border border-rose-200 shadow-2xs">
              <span className="text-[10px] text-rose-700 font-bold uppercase tracking-wider block">
                Total Expenses (Filtered)
              </span>
              <span className="text-base sm:text-lg font-black text-rose-800 font-mono">
                {formatCurrency(totalExpense)}
              </span>
            </div>

            <div className="px-3.5 py-2 rounded-xl bg-blue-50 border border-blue-200 shadow-2xs">
              <span className="text-[10px] text-blue-700 font-bold uppercase tracking-wider block">
                Property Expenses
              </span>
              <span className="text-sm sm:text-base font-bold text-blue-900 font-mono">
                {formatCurrency(propertyExpenseTotal)}
              </span>
            </div>

            <div className="px-3.5 py-2 rounded-xl bg-purple-50 border border-purple-200 shadow-2xs">
              <span className="text-[10px] text-purple-700 font-bold uppercase tracking-wider block">
                Common / Other
              </span>
              <span className="text-sm sm:text-base font-bold text-purple-900 font-mono">
                {formatCurrency(commonExpenseTotal)}
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
        columns={ALL_EXPENSE_COLUMNS_DEF}
        defaultColumns={DEFAULT_EXPENSE_COLS}
        visibleColumns={visibleColumns}
        onChangeVisibleColumns={(cols) => {
          setVisibleColumns(cols);
          try { localStorage.setItem('cols_all_expense_v1', JSON.stringify(cols)); } catch(e){}
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
        storageKey="all_expense_v1"
      />

      {/* Grid Container */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden flex flex-col">
        <div className="overflow-x-auto max-h-[68vh] overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-7 h-7 border-4 border-rose-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-xs text-slate-500 ml-3 font-medium">Loading all expense records...</span>
            </div>
          ) : paginatedExpenses.length === 0 ? (
            <div className="py-20 text-center text-slate-400 text-xs">
              {expenses.length === 0
                ? 'No expense records found in system.'
                : 'No expense lines match your current search and filter settings.'}
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead className={`bg-slate-100 text-slate-700 font-bold border-b border-slate-300 select-none ${isHeaderSticky ? 'sticky top-0 z-20 shadow-xs' : ''}`}>
                <tr>
                  {visibleColumns.map((colId, colIndex) => {
                    const def = ALL_EXPENSE_COLUMNS_DEF.find(c => c.id === colId) || { id: colId, label: colId };
                    const width = columnWidths[colId] || DEFAULT_EXPENSE_COLUMN_WIDTHS[colId] || 120;
                    const frozenStyle = getFrozenColumnStyle(colIndex, frozenColumnCount, visibleColumns, columnWidths, true);

                    const isActions = colId === 'actions';
                    const isIndex = colId === 'index';
                    const isAmount = colId === 'amount';
                    const align = isActions || isIndex ? 'text-center' : isAmount ? 'text-right' : 'text-left';

                    return (
                      <th
                        key={colId}
                        {...getHeaderDragProps(colId, visibleColumns, (cols) => {
                          setVisibleColumns(cols);
                          try { localStorage.setItem('cols_all_expense_v1', JSON.stringify(cols)); } catch(e){}
                        }, 'all_expense_v1')}
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
                                    <span className="text-rose-600 font-extrabold text-[13px] leading-none">↓</span>
                                  ) : (
                                    <span className="text-rose-600 font-extrabold text-[13px] leading-none">↑</span>
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
                {paginatedExpenses.map((e, rowIndex) => {
                  const globalIndex = rowsPerPage === 'All' ? rowIndex + 1 : (currentPage - 1) * Number(rowsPerPage) + rowIndex + 1;
                  const isCommon = e.headType === 'Common';

                  return (
                    <tr key={e._id} className="hover:bg-slate-50/80 transition-colors">
                      {visibleColumns.map((colId, colIndex) => {
                        const frozenStyle = getFrozenColumnStyle(colIndex, frozenColumnCount, visibleColumns, columnWidths, false);

                        if (colId === 'index') {
                          return (
                            <td key={colId} style={frozenStyle} className="py-2.5 px-3 border-r border-slate-200 text-center font-mono text-slate-400 whitespace-nowrap">
                              {globalIndex}
                            </td>
                          );
                        }

                        if (colId === 'expenseDate') {
                          return (
                            <td key={colId} style={frozenStyle} className="py-2.5 px-3 border-r border-slate-200 whitespace-nowrap text-slate-700">
                              {formatDate(e.expenseDate)}
                            </td>
                          );
                        }

                        if (colId === 'expenseMonthYear') {
                          return (
                            <td key={colId} style={frozenStyle} className="py-2.5 px-3 border-r border-slate-200 whitespace-nowrap font-mono font-semibold text-slate-800">
                              {e.expenseMonthYear || '—'}
                            </td>
                          );
                        }

                        if (colId === 'expenseCode') {
                          return (
                            <td key={colId} style={frozenStyle} className="py-2.5 px-3 border-r border-slate-200 font-mono font-bold text-rose-800 whitespace-nowrap">
                              {e.expenseCode || e.legacyCode || '—'}
                            </td>
                          );
                        }

                        if (colId === 'headType') {
                          const isOther = e.headType === 'Other' || isCommon;
                          return (
                            <td key={colId} style={frozenStyle} className="py-2.5 px-3 border-r border-slate-200 whitespace-nowrap">
                              <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                isOther
                                  ? 'bg-purple-100 text-purple-800 border-purple-200'
                                  : 'bg-emerald-100 text-emerald-800 border-emerald-200'
                              }`}>
                                {isOther ? 'Other' : 'Property'}
                              </span>
                            </td>
                          );
                        }

                        if (colId === 'property') {
                          const isOther = e.headType === 'Other' || isCommon;
                          return (
                            <td key={colId} style={frozenStyle} className="py-2.5 px-3 border-r border-slate-200 font-medium text-slate-900 whitespace-nowrap">
                              {e.propertyId?.name || (isOther ? 'Other / General' : '—')}
                            </td>
                          );
                        }

                        if (colId === 'unit') {
                          return (
                            <td key={colId} style={frozenStyle} className="py-2.5 px-3 border-r border-slate-200 whitespace-nowrap font-medium text-slate-700">
                              {e.unitId?.subUnitPartition || e.unitId?.unitName || (isCommon ? 'Common' : '—')}
                            </td>
                          );
                        }

                        if (colId === 'category') {
                          return (
                            <td key={colId} style={frozenStyle} className="py-2.5 px-3 border-r border-slate-200 whitespace-nowrap font-bold text-slate-800">
                              <span className="inline-block px-2 py-0.5 rounded-lg bg-slate-100 text-slate-800 text-[11px] font-semibold border border-slate-200">
                                {e.category || 'General Expense'}
                              </span>
                            </td>
                          );
                        }

                        if (colId === 'vendorOrPayee') {
                          return (
                            <td key={colId} style={frozenStyle} className="py-2.5 px-3 border-r border-slate-200 whitespace-nowrap font-medium text-slate-800">
                              {e.vendorOrPayee || '—'}
                            </td>
                          );
                        }

                        if (colId === 'paymentMode') {
                          return (
                            <td key={colId} style={frozenStyle} className="py-2.5 px-3 border-r border-slate-200 whitespace-nowrap">
                              <span className="inline-block px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[10px] font-semibold border border-slate-200">
                                {e.paymentMode || 'Cash'}
                              </span>
                            </td>
                          );
                        }

                        

                        if (colId === 'description') {
                          return (
                            <td key={colId} style={frozenStyle} className="py-2.5 px-3 border-r border-slate-200 text-slate-600 text-[11px] max-w-xs truncate" title={e.description}>
                              {e.description || '—'}
                            </td>
                          );
                        }

                        if (colId === 'amount') {
                          return (
                            <td key={colId} style={frozenStyle} className="py-2.5 px-3 border-r border-slate-200 text-right font-mono font-bold text-rose-700 whitespace-nowrap">
                              {formatCurrency(e.amount || 0)}
                            </td>
                          );
                        }

                        if (colId === 'actions') {
                          return (
                            <td key={colId} style={frozenStyle} className="py-2.5 px-3 text-center whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() => openEditExpenseModal(e)}
                                className="px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-[11px] transition-colors inline-flex items-center gap-1.5 border border-rose-200/60 cursor-pointer shadow-2xs"
                                title="Edit Expense Details"
                              >
                                <Edit2 className="w-3 h-3 text-rose-600" />
                                <span>Edit</span>
                              </button>
                            </td>
                          );
                        }

                        if (colId === 'isReversed') {
                          return (
                            <td key={colId} style={frozenStyle} className="py-2.5 px-3 border-r border-slate-200 text-center whitespace-nowrap">
                              <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                e.isReversed ? 'bg-rose-100 text-rose-800 border-rose-200' : 'bg-emerald-100 text-emerald-800 border-emerald-200'
                              }`}>
                                {e.isReversed ? 'Reversed' : 'Active'}
                              </span>
                            </td>
                          );
                        }

                        const textVal = getExpenseFieldVal(e, colId);
                        return (
                          <td key={colId} style={frozenStyle} className="py-2.5 px-3 border-r border-slate-200 text-xs text-slate-700 whitespace-nowrap truncate max-w-xs" title={textVal}>
                            {textVal || '—'}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination Footer */}
        {processedExpenses.length > 0 && (
          <div className="px-4 py-3 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
            <span className="font-medium">
              Showing{' '}
              <strong>
                {rowsPerPage === 'All'
                  ? 1
                  : Math.min((currentPage - 1) * Number(rowsPerPage) + 1, processedExpenses.length)}
              </strong>{' '}
              to{' '}
              <strong>
                {rowsPerPage === 'All'
                  ? processedExpenses.length
                  : Math.min(currentPage * Number(rowsPerPage), processedExpenses.length)}
              </strong>{' '}
              of <strong>{processedExpenses.length}</strong> expense records
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

      {/* EDIT EXPENSE MODAL - Clean Single-Value Form (No Grid) */}
      {editingExpense && (
        <div className="fixed inset-0 z-[99999] overflow-y-auto bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5">
          <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col my-auto max-h-[90vh] z-[100000] animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-4 sm:px-6 border-b border-slate-800 flex items-center justify-between bg-slate-900 text-white shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-rose-600 text-white shadow-xs">
                  <TrendingDown className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-extrabold text-white text-base">Edit Expense Transaction</h3>
                    <span className="px-2.5 py-0.5 rounded-md bg-rose-500/20 text-rose-300 text-xs font-mono font-bold border border-rose-500/30">
                      {editForm.expenseCode || editingExpense.expenseCode}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Single expense form — all transaction values editable
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingExpense(null)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form Body */}
            <form onSubmit={handleSaveExpense} className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4 bg-white">
              {/* Row 1: Expense Code & Expense Date */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Expense Code <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={editForm.expenseCode}
                    onChange={(e) => setEditForm({ ...editForm, expenseCode: e.target.value })}
                    className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-rose-400 font-mono font-bold text-rose-800"
                    placeholder="e.g. EXP-2026-0001"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Expense Date <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={editForm.expenseDate}
                    onChange={(e) => setEditForm({
                      ...editForm,
                      expenseDate: e.target.value,
                      expenseMonth: e.target.value ? e.target.value.slice(0, 7) : editForm.expenseMonth
                    })}
                    className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-rose-400"
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
                    value={editForm.expenseMonth}
                    onChange={(e) => setEditForm({ ...editForm, expenseMonth: e.target.value })}
                    className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-rose-400 font-mono font-bold text-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Amount (₹) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    required
                    min="0"
                    value={editForm.amount}
                    onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })}
                    className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-200 font-black text-rose-700 text-sm focus:outline-none focus:ring-2 focus:ring-rose-400"
                    placeholder="e.g. 1500"
                  />
                </div>
              </div>

              {/* Row 3: Expense Head type & Expense Head / Category */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Expense Head type</label>
                  <select
                    value={editForm.headType === 'Common' ? 'Other' : (editForm.headType || 'Property')}
                    onChange={(e) => setEditForm({ ...editForm, headType: e.target.value })}
                    className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-200 bg-white font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-400"
                  >
                    <option value="Property">Property</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Expense Head / Category <span className="text-rose-500">*</span>
                  </label>
                  <input
                    list="expense-categories-datalist"
                    type="text"
                    required
                    placeholder="Select or type category..."
                    value={editForm.category}
                    onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                    className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-rose-400 font-semibold text-slate-800"
                  />
                  <datalist id="expense-categories-datalist">
                    {categories.map(c => (
                      <option key={c._id} value={c.name} />
                    ))}
                  </datalist>
                </div>
              </div>

              {/* Row 4: Property & Partition (only if Head type is Property) */}
              {editForm.headType === 'Property' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Property</label>
                    <select
                      value={editForm.propertyId}
                      onChange={(e) => setEditForm({ ...editForm, propertyId: e.target.value, unitId: '' })}
                      className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-rose-400 font-medium"
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
                      className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-rose-400 font-medium"
                    >
                      <option value="">-- All / General Property --</option>
                      {availableUnitsForEdit.map(u => (
                        <option key={u._id} value={u._id}>
                          {u.subUnitPartition || u.unitName}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}



              {/* Row 6: Description */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Description / Notes</label>
                  <textarea
                    rows="2"
                    placeholder="Details of expense, work done..."
                    value={editForm.description}
                    onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                    className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-rose-400"
                  />
              </div>

              {/* Modal Footer */}
              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingExpense(null)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingExpense}
                  className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-xs disabled:opacity-50 flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <Check className="w-4 h-4" />
                  <span>{savingExpense ? 'Saving Changes...' : 'Save Expense'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}