import React, { useState, useEffect, useMemo } from 'react';
import API from '../services/api';
import ApexToolbar from '../components/ApexToolbar';
import { 
  useResizableColumns, 
  ResizeHandle, 
  useFrozenColumns, 
  getFrozenColumnStyle 
} from '../components/ColumnManager';
import { 
  cycleThreeStateSort, 
  evaluateFilterRule, 
  sortDataRows 
} from '../utils/tableUtils';
import * as XLSX from 'xlsx';
import { 
  Tag, Plus, Edit2, Trash2, CheckCircle2, 
  RefreshCw, X, AlertCircle, Building2,
  ArrowUp, ArrowDown, ArrowUpDown
} from 'lucide-react';

const EXPENSE_HEADS_COLUMNS_DEF = [
  { id: 'index', label: '#', defaultVisible: true },
  { id: 'name', label: 'Expense Head Name', defaultVisible: true },
  { id: 'headType', label: 'Head Scope / Classification', defaultVisible: true },
  { id: 'usage', label: 'Logged Entries', defaultVisible: true },
  { id: 'totalAmount', label: 'Total Spent (₹)', defaultVisible: true },
  { id: 'isDefault', label: 'Status', defaultVisible: true },
  { id: 'description', label: 'Description', defaultVisible: true },
  { id: 'actions', label: 'Actions', defaultVisible: true },
];

const DEFAULT_HEADS_COLS = ['index', 'name', 'headType', 'usage', 'totalAmount', 'isDefault', 'actions'];

const DEFAULT_COLUMN_WIDTHS = {
  index: 55,
  name: 240,
  headType: 230,
  usage: 140,
  totalAmount: 150,
  isDefault: 120,
  description: 220,
  actions: 110,
};

export default function ExpenseHeadsMasterView({ onDataChanged }) {
  const [categories, setCategories] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(() => {
    return localStorage.getItem('expense_heads_active_tab') || 'all'; // 'all' | 'Property' | 'Common'
  });

  // Save active tab in localStorage
  useEffect(() => {
    localStorage.setItem('expense_heads_active_tab', activeTab);
  }, [activeTab]);

  // APEX Toolbar & Table States
  const [search, setSearch] = useState('');
  const [rowsPerPage, setRowsPerPage] = useState('All');
  const [currentPage, setCurrentPage] = useState(1);

  // Column Visibility with persistence
  const [visibleColumns, setVisibleColumns] = useState(() => {
    const saved = localStorage.getItem('cols_expense_heads_master_v1');
    if (saved) {
      try {
        const allowed = EXPENSE_HEADS_COLUMNS_DEF.map(c => c.id);
        return JSON.parse(saved).filter(c => allowed.includes(c));
      } catch (e) {}
    }
    return DEFAULT_HEADS_COLS;
  });

  // Column Resizing
  const {
    columnWidths,
    handleResizeStart,
    resetColumnWidths
  } = useResizableColumns('expense_heads_master_v1', DEFAULT_COLUMN_WIDTHS);

  // Frozen Columns
  const [frozenColumnCount, setFrozenColumnCount] = useFrozenColumns('expense_heads_master_freeze_v1', 0);

  // Sticky Header
  const [isHeaderSticky, setIsHeaderSticky] = useState(true);

  // Sorting
  const [sortConfig, setSortConfig] = useState({ key: 'name', direction: 'asc' });

  // APEX Interactive Filters
  const [activeFilters, setActiveFilters] = useState([]);

  // Modal State for Add / Edit
  const [showModal, setShowModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    headType: 'Property',
    description: ''
  });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  // Delete Confirmation Modal State
  const [deletingCategory, setDeletingCategory] = useState(null);
  const [deleteError, setDeleteError] = useState('');
  const [deleting, setDeleting] = useState(false);

  // Fetch Categories and Expenses to compute usage
  const fetchData = async () => {
    try {
      setLoading(true);
      const [catRes, expRes] = await Promise.all([
        API.get('/expenses/categories'),
        API.get('/expenses')
      ]);

      if (catRes.data.success) {
        setCategories(catRes.data.data);
      }
      if (expRes.data.success) {
        setExpenses(expRes.data.data);
      }
      onDataChanged?.();
    } catch (err) {
      console.error('Failed to load expense categories:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Compute usage map: { [categoryName]: { count: number, totalAmount: number } }
  const usageMap = useMemo(() => {
    const map = {};
    expenses.forEach(e => {
      if (!e.isReversed && e.category) {
        if (!map[e.category]) {
          map[e.category] = { count: 0, totalAmount: 0 };
        }
        map[e.category].count += 1;
        map[e.category].totalAmount += (e.amount || 0);
      }
    });
    return map;
  }, [expenses]);

  // Counts
  const propertyHeadsCount = categories.filter(c => c.headType === 'Property').length;
  const commonHeadsCount = categories.filter(c => c.headType === 'Common').length;

  // Filter suggestions for APEX Filter builder
  const filterSuggestions = useMemo(() => {
    return {
      name: categories.map(c => c.name),
      headType: ['Property', 'Common'],
      isDefault: ['System', 'Custom']
    };
  }, [categories]);

  // Handle header sorting click
  const handleHeaderSort = (colId) => {
    if (colId === 'actions') return;
    setSortConfig(prev => cycleThreeStateSort(prev, colId));
  };

  // Filter categories by activeTab, search, and activeFilters
  const filteredCategories = useMemo(() => {
    return categories.filter(cat => {
      if (activeTab === 'Property' && cat.headType !== 'Property') return false;
      if (activeTab === 'Common' && cat.headType !== 'Common') return false;

      const usage = usageMap[cat.name] || { count: 0, totalAmount: 0 };
      const q = search.toLowerCase().trim();
      if (q) {
        const matchName = cat.name?.toLowerCase().includes(q);
        const matchDesc = cat.description?.toLowerCase().includes(q);
        const matchType = cat.headType?.toLowerCase().includes(q);
        const matchUsage = String(usage.count).includes(q);
        const matchAmount = String(usage.totalAmount).includes(q);
        if (!matchName && !matchDesc && !matchType && !matchUsage && !matchAmount) return false;
      }

      // APEX Filters
      for (const f of activeFilters) {
        let fieldVal = '';
        if (f.columnId === 'name') fieldVal = cat.name || '';
        else if (f.columnId === 'headType') fieldVal = cat.headType || 'Property';
        else if (f.columnId === 'usage') fieldVal = String(usage.count || 0);
        else if (f.columnId === 'totalAmount') fieldVal = String(usage.totalAmount || 0);
        else if (f.columnId === 'isDefault') fieldVal = cat.isDefault ? 'System' : 'Custom';
        else if (f.columnId === 'description') fieldVal = cat.description || '';

        if (!evaluateFilterRule(fieldVal, f.operator, f.value)) return false;
      }

      return true;
    });
  }, [categories, activeTab, search, activeFilters, usageMap]);

  // Sort categories
  const sortedCategories = useMemo(() => {
    return sortDataRows(filteredCategories, sortConfig, {
      index: (_, idx) => idx + 1,
      name: c => (c.name || '').toLowerCase(),
      headType: c => (c.headType || '').toLowerCase(),
      usage: c => (usageMap[c.name]?.count || 0),
      totalAmount: c => (usageMap[c.name]?.totalAmount || 0),
      isDefault: c => (c.isDefault ? 1 : 0),
      description: c => (c.description || '').toLowerCase()
    });
  }, [filteredCategories, sortConfig, usageMap]);

  // Pagination
  const totalItems = sortedCategories.length;
  const isAllRows = rowsPerPage === 'All';
  const effectivePageSize = isAllRows ? totalItems || 1 : Number(rowsPerPage);
  const totalPages = Math.ceil(totalItems / effectivePageSize) || 1;

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(1);
  }, [totalPages, currentPage]);

  const paginatedCategories = useMemo(() => {
    if (isAllRows) return sortedCategories;
    const startIndex = (currentPage - 1) * effectivePageSize;
    return sortedCategories.slice(startIndex, startIndex + effectivePageSize);
  }, [sortedCategories, isAllRows, currentPage, effectivePageSize]);

  // Open modal for Create
  const handleOpenCreate = () => {
    setEditingCategory(null);
    setFormData({
      name: '',
      headType: activeTab === 'Common' ? 'Common' : 'Property',
      description: ''
    });
    setFormError('');
    setShowModal(true);
  };

  // Open modal for Edit
  const handleOpenEdit = (cat) => {
    setEditingCategory(cat);
    setFormData({
      name: cat.name,
      headType: cat.headType || 'Property',
      description: cat.description || ''
    });
    setFormError('');
    setShowModal(true);
  };

  // Submit Add or Edit
  const handleSubmitForm = async (e) => {
    e.preventDefault();
    const name = formData.name.trim();
    if (!name) {
      setFormError('Category name is required.');
      return;
    }

    try {
      setSubmitting(true);
      setFormError('');

      if (editingCategory) {
        const res = await API.put(`/expenses/categories/${editingCategory._id}`, {
          name,
          headType: formData.headType,
          description: formData.description.trim()
        });
        if (res.data.success) {
          setShowModal(false);
          await fetchData();
        }
      } else {
        const res = await API.post('/expenses/categories', {
          name,
          headType: formData.headType,
          description: formData.description.trim()
        });
        if (res.data.success) {
          setShowModal(false);
          await fetchData();
        }
      }
    } catch (err) {
      setFormError(err.response?.data?.message || err.response?.data?.errors?.[0]?.msg || 'Failed to save expense head');
    } finally {
      setSubmitting(false);
    }
  };

  // Confirm and Delete
  const handleConfirmDelete = async () => {
    if (!deletingCategory) return;
    try {
      setDeleting(true);
      setDeleteError('');
      const res = await API.delete(`/expenses/categories/${deletingCategory._id}`);
      if (res.data.success) {
        setDeletingCategory(null);
        await fetchData();
      }
    } catch (err) {
      setDeleteError(err.response?.data?.message || 'Failed to delete expense head');
    } finally {
      setDeleting(false);
    }
  };

  // Export to Excel
  const handleExportExcel = () => {
    const rows = sortedCategories.map((c, idx) => {
      const usage = usageMap[c.name] || { count: 0, totalAmount: 0 };
      return {
        '#': idx + 1,
        'Expense Head Name': c.name,
        'Head Scope': c.headType === 'Common' ? 'Common / Other Expense' : 'Property Expense',
        'Visible In': c.headType === 'Common' 
          ? 'Other Expenses (MOM, Misc, Zakat...)' 
          : 'Property / Common Building Maintenance',
        'System Standard': c.isDefault ? 'Yes' : 'No',
        'Entries Logged': usage.count,
        'Total Spent (₹)': usage.totalAmount,
        'Description': c.description || '—'
      };
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Expense Heads Master');
    XLSX.writeFile(wb, `Expense_Heads_Master_${activeTab}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const getSortIcon = (colId) => {
    if (sortConfig.key !== colId) return <ArrowUpDown className="w-3 h-3 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />;
    return sortConfig.direction === 'asc' 
      ? <ArrowUp className="w-3 h-3 text-emerald-600" /> 
      : <ArrowDown className="w-3 h-3 text-emerald-600" />;
  };

  return (
    <div className="space-y-4">
      {/* Top Header Card with Quick Scope Filter & Add Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 sm:p-5 rounded-2xl shadow-xs border border-slate-200">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold shrink-0">
            <Tag className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-extrabold text-slate-900 leading-tight">Expense Heads Master</h2>
            <p className="text-xs text-slate-500">
              Manage separated accounting heads for Property maintenance vs. Common / Other expenditures
            </p>
          </div>
        </div>

        {/* Quick Scope Filter & Action Buttons */}
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          {/* Quick Scope Tabs */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl shrink-0">
            <button
              type="button"
              onClick={() => { setActiveTab('all'); setCurrentPage(1); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'all'
                  ? 'bg-white text-emerald-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All ({categories.length})
            </button>
            <button
              type="button"
              onClick={() => { setActiveTab('Property'); setCurrentPage(1); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'Property'
                  ? 'bg-white text-emerald-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Building2 className="w-3.5 h-3.5 text-emerald-600" />
              Property Heads ({propertyHeadsCount})
            </button>
            <button
              type="button"
              onClick={() => { setActiveTab('Common'); setCurrentPage(1); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'Common'
                  ? 'bg-white text-indigo-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Tag className="w-3.5 h-3.5 text-indigo-600" />
              Common / Other ({commonHeadsCount})
            </button>
          </div>

          {/* Refresh List */}
          <button
            type="button"
            onClick={fetchData}
            disabled={loading}
            className="p-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors shadow-2xs cursor-pointer"
            title="Refresh list"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          {/* Add Expense Head */}
          <button
            type="button"
            onClick={handleOpenCreate}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold text-xs shadow-md shadow-emerald-600/20 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Head</span>
          </button>
        </div>
      </div>

      {/* Main Container with APEX Toolbar & Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Oracle APEX-Style Interactive Toolbar */}
        <div className="p-4 border-b border-slate-100">
          <ApexToolbar
            search={search}
            onSearchChange={(val) => { setSearch(val); setCurrentPage(1); }}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={(val) => { setRowsPerPage(val); setCurrentPage(1); }}
            availableRowsOptions={[10, 25, 50, 100, 'All']}
            columns={EXPENSE_HEADS_COLUMNS_DEF}
            defaultColumns={DEFAULT_HEADS_COLS}
            visibleColumns={visibleColumns}
            onChangeVisibleColumns={(cols) => {
              setVisibleColumns(cols);
              try { localStorage.setItem('cols_expense_heads_master_v1', JSON.stringify(cols)); } catch(e){}
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
            onFiltersChange={(flts) => { setActiveFilters(flts); setCurrentPage(1); }}
            filterSuggestions={filterSuggestions}
            onExport={handleExportExcel}
            storageKey={`expense_heads_master_${activeTab}`}
          />
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/90 text-[11px] font-extrabold text-slate-700 border-b border-slate-200">
                {visibleColumns.includes('index') && (
                  <th 
                    style={{ ...getFrozenColumnStyle(0, frozenColumnCount, columnWidths, 'index', visibleColumns), width: `${columnWidths.index || 55}px` }} 
                    className="py-3 px-3 text-center relative group select-none border-r border-slate-200/60"
                  >
                    #
                    <ResizeHandle onResizeStart={(e) => handleResizeStart(e, 'index')} />
                  </th>
                )}

                {visibleColumns.includes('name') && (
                  <th 
                    onClick={() => handleHeaderSort('name')}
                    style={{ ...getFrozenColumnStyle(1, frozenColumnCount, columnWidths, 'name', visibleColumns), width: `${columnWidths.name || 240}px` }} 
                    className="py-3 px-4 relative group select-none cursor-pointer hover:bg-slate-100 transition-colors border-r border-slate-200/60"
                  >
                    <div className="flex items-center gap-1.5">
                      <span>Expense Head Name</span>
                      {getSortIcon('name')}
                    </div>
                    <ResizeHandle onResizeStart={(e) => handleResizeStart(e, 'name')} />
                  </th>
                )}

                {visibleColumns.includes('headType') && (
                  <th 
                    onClick={() => handleHeaderSort('headType')}
                    style={{ ...getFrozenColumnStyle(2, frozenColumnCount, columnWidths, 'headType', visibleColumns), width: `${columnWidths.headType || 230}px` }} 
                    className="py-3 px-4 relative group select-none cursor-pointer hover:bg-slate-100 transition-colors border-r border-slate-200/60"
                  >
                    <div className="flex items-center gap-1.5">
                      <span>Head Scope / Classification</span>
                      {getSortIcon('headType')}
                    </div>
                    <ResizeHandle onResizeStart={(e) => handleResizeStart(e, 'headType')} />
                  </th>
                )}

                {visibleColumns.includes('usage') && (
                  <th 
                    onClick={() => handleHeaderSort('usage')}
                    style={{ ...getFrozenColumnStyle(3, frozenColumnCount, columnWidths, 'usage', visibleColumns), width: `${columnWidths.usage || 140}px` }} 
                    className="py-3 px-4 text-center relative group select-none cursor-pointer hover:bg-slate-100 transition-colors border-r border-slate-200/60"
                  >
                    <div className="flex items-center justify-center gap-1.5">
                      <span>Logged Entries</span>
                      {getSortIcon('usage')}
                    </div>
                    <ResizeHandle onResizeStart={(e) => handleResizeStart(e, 'usage')} />
                  </th>
                )}

                {visibleColumns.includes('totalAmount') && (
                  <th 
                    onClick={() => handleHeaderSort('totalAmount')}
                    style={{ ...getFrozenColumnStyle(4, frozenColumnCount, columnWidths, 'totalAmount', visibleColumns), width: `${columnWidths.totalAmount || 150}px` }} 
                    className="py-3 px-4 text-right relative group select-none cursor-pointer hover:bg-slate-100 transition-colors border-r border-slate-200/60"
                  >
                    <div className="flex items-center justify-end gap-1.5">
                      <span>Total Spent</span>
                      {getSortIcon('totalAmount')}
                    </div>
                    <ResizeHandle onResizeStart={(e) => handleResizeStart(e, 'totalAmount')} />
                  </th>
                )}

                {visibleColumns.includes('isDefault') && (
                  <th 
                    onClick={() => handleHeaderSort('isDefault')}
                    style={{ ...getFrozenColumnStyle(5, frozenColumnCount, columnWidths, 'isDefault', visibleColumns), width: `${columnWidths.isDefault || 120}px` }} 
                    className="py-3 px-4 text-center relative group select-none cursor-pointer hover:bg-slate-100 transition-colors border-r border-slate-200/60"
                  >
                    <div className="flex items-center justify-center gap-1.5">
                      <span>Status</span>
                      {getSortIcon('isDefault')}
                    </div>
                    <ResizeHandle onResizeStart={(e) => handleResizeStart(e, 'isDefault')} />
                  </th>
                )}

                {visibleColumns.includes('description') && (
                  <th 
                    onClick={() => handleHeaderSort('description')}
                    style={{ ...getFrozenColumnStyle(6, frozenColumnCount, columnWidths, 'description', visibleColumns), width: `${columnWidths.description || 220}px` }} 
                    className="py-3 px-4 relative group select-none cursor-pointer hover:bg-slate-100 transition-colors border-r border-slate-200/60"
                  >
                    <div className="flex items-center gap-1.5">
                      <span>Description</span>
                      {getSortIcon('description')}
                    </div>
                    <ResizeHandle onResizeStart={(e) => handleResizeStart(e, 'description')} />
                  </th>
                )}

                {visibleColumns.includes('actions') && (
                  <th 
                    style={{ width: `${columnWidths.actions || 110}px` }} 
                    className="py-3 px-4 text-right select-none"
                  >
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs font-medium">
              {loading ? (
                <tr>
                  <td colSpan={visibleColumns.length || 7} className="text-center py-12 text-slate-400">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto text-emerald-500 mb-2" />
                    Loading expense heads...
                  </td>
                </tr>
              ) : paginatedCategories.length === 0 ? (
                <tr>
                  <td colSpan={visibleColumns.length || 7} className="text-center py-12 text-slate-400">
                    <Tag className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                    No expense heads found matching criteria.
                  </td>
                </tr>
              ) : (
                paginatedCategories.map((cat, idx) => {
                  const globalIdx = (currentPage - 1) * (rowsPerPage === 'All' ? 0 : Number(rowsPerPage)) + idx + 1;
                  const usage = usageMap[cat.name] || { count: 0, totalAmount: 0 };
                  const isCommon = cat.headType === 'Common';

                  return (
                    <tr key={cat._id} className="hover:bg-slate-50/80 transition-colors">
                      {visibleColumns.includes('index') && (
                        <td 
                          style={getFrozenColumnStyle(0, frozenColumnCount, columnWidths, 'index', visibleColumns)} 
                          className="py-3.5 px-3 text-center font-bold text-slate-400 border-r border-slate-100"
                        >
                          {globalIdx}
                        </td>
                      )}

                      {visibleColumns.includes('name') && (
                        <td 
                          style={getFrozenColumnStyle(1, frozenColumnCount, columnWidths, 'name', visibleColumns)} 
                          className="py-3.5 px-4 border-r border-slate-100"
                        >
                          <div className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
                            {cat.name}
                            {cat.isDefault && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
                                Standard
                              </span>
                            )}
                          </div>
                        </td>
                      )}

                      {visibleColumns.includes('headType') && (
                        <td 
                          style={getFrozenColumnStyle(2, frozenColumnCount, columnWidths, 'headType', visibleColumns)} 
                          className="py-3.5 px-4 border-r border-slate-100"
                        >
                          <div className="flex items-center gap-2">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-bold text-[11px] ${
                              isCommon 
                                ? 'bg-indigo-50 text-indigo-700 border border-indigo-200/60' 
                                : 'bg-emerald-50 text-emerald-700 border border-emerald-200/60'
                            }`}>
                              {isCommon ? <Tag className="w-3 h-3" /> : <Building2 className="w-3 h-3" />}
                              {isCommon ? 'Common / Other Expense' : 'Property Expense'}
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-400 mt-1 font-medium">
                            {isCommon 
                              ? 'Visible only for Other Expenses (MOM, Misc, Zakat...)' 
                              : 'Visible for Properties & Common Property maintenance'}
                          </p>
                        </td>
                      )}

                      {visibleColumns.includes('usage') && (
                        <td 
                          style={getFrozenColumnStyle(3, frozenColumnCount, columnWidths, 'usage', visibleColumns)} 
                          className="py-3.5 px-4 text-center font-bold border-r border-slate-100"
                        >
                          <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs ${
                            usage.count > 0 ? 'bg-slate-100 text-slate-800' : 'text-slate-400'
                          }`}>
                            {usage.count} {usage.count === 1 ? 'entry' : 'entries'}
                          </span>
                        </td>
                      )}

                      {visibleColumns.includes('totalAmount') && (
                        <td 
                          style={getFrozenColumnStyle(4, frozenColumnCount, columnWidths, 'totalAmount', visibleColumns)} 
                          className="py-3.5 px-4 text-right font-extrabold text-slate-900 border-r border-slate-100 font-mono"
                        >
                          {usage.totalAmount > 0 ? `₹${usage.totalAmount.toLocaleString('en-IN')}` : '₹0'}
                        </td>
                      )}

                      {visibleColumns.includes('isDefault') && (
                        <td 
                          style={getFrozenColumnStyle(5, frozenColumnCount, columnWidths, 'isDefault', visibleColumns)} 
                          className="py-3.5 px-4 text-center border-r border-slate-100"
                        >
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md">
                            <CheckCircle2 className="w-3 h-3" /> Active
                          </span>
                        </td>
                      )}

                      {visibleColumns.includes('description') && (
                        <td 
                          style={getFrozenColumnStyle(6, frozenColumnCount, columnWidths, 'description', visibleColumns)} 
                          className="py-3.5 px-4 text-slate-500 border-r border-slate-100 text-[11px]"
                        >
                          {cat.description || <span className="text-slate-300 italic">—</span>}
                        </td>
                      )}

                      {visibleColumns.includes('actions') && (
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleOpenEdit(cat)}
                              className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors cursor-pointer"
                              title="Edit head"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => { setDeletingCategory(cat); setDeleteError(''); }}
                              className="p-1.5 rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                              title="Delete head"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        {rowsPerPage !== 'All' && totalPages > 1 && (
          <div className="flex items-center justify-between p-4 border-t border-slate-100 text-xs text-slate-500">
            <span>Showing {paginatedCategories.length} of {sortedCategories.length} heads</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                className="px-3 py-1.5 rounded-lg border border-slate-200 disabled:opacity-40 cursor-pointer"
              >
                Previous
              </button>
              <span className="font-bold text-slate-700">Page {currentPage} of {totalPages}</span>
              <button
                type="button"
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                className="px-3 py-1.5 rounded-lg border border-slate-200 disabled:opacity-40 cursor-pointer"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Add / Edit Expense Head Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <Tag className="w-4 h-4" />
                </div>
                <h3 className="font-extrabold text-base text-slate-900">
                  {editingCategory ? 'Edit Expense Head' : 'Add New Expense Head'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitForm} className="p-6 space-y-4">
              {formError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Head Name */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Expense Head Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Electricity & Utilities, Maintenance, MOM..."
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-semibold"
                />
              </div>

              {/* Head Classification Radio */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Classification & Dropdown Scope *
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, headType: 'Property' })}
                    className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                      formData.headType === 'Property'
                        ? 'border-emerald-500 bg-emerald-50/50 ring-2 ring-emerald-500/20'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-extrabold text-xs text-emerald-800">
                      <Building2 className="w-3.5 h-3.5 text-emerald-600" />
                      Property Head
                    </div>
                    <p className="text-[10px] text-slate-500 mt-1 leading-tight">
                      For maintenance, repairs & property-specific costs.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, headType: 'Common' })}
                    className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                      formData.headType === 'Common'
                        ? 'border-indigo-500 bg-indigo-50/50 ring-2 ring-indigo-500/20'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-extrabold text-xs text-indigo-800">
                      <Tag className="w-3.5 h-3.5 text-indigo-600" />
                      Common / Other
                    </div>
                    <p className="text-[10px] text-slate-500 mt-1 leading-tight">
                      For MOM, Misc, Zakat, Sadka, Margaret, Other.
                    </p>
                  </button>
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Description / Remarks (Optional)
                </label>
                <textarea
                  rows={2}
                  placeholder="Optional details about this expense category..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 shadow-md shadow-emerald-600/20 cursor-pointer"
                >
                  {submitting ? 'Saving...' : editingCategory ? 'Save Changes' : 'Create Expense Head'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingCategory && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 text-center animate-in fade-in zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto mb-3">
              <Trash2 className="w-6 h-6" />
            </div>
            <h3 className="font-extrabold text-base text-slate-900 mb-1">Delete Expense Head?</h3>
            <p className="text-xs text-slate-500 mb-4">
              Are you sure you want to remove <span className="font-bold text-slate-800">"{deletingCategory.name}"</span>?
            </p>

            {deleteError && (
              <div className="p-3 mb-4 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 text-left flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{deleteError}</span>
              </div>
            )}

            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setDeletingCategory(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={deleting}
                className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50 shadow-md shadow-rose-600/20 cursor-pointer"
              >
                {deleting ? 'Deleting...' : 'Yes, Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
