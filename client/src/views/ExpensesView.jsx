import React, { useState, useEffect, useRef } from 'react';
import API from '../services/api';
import { formatCurrency, formatDate, formatMonthYear } from '../utils/formatters';
import ColumnManager, { getHeaderDragProps, useResizableColumns, ResizeHandle } from '../components/ColumnManager';
import SearchableSelect from '../components/SearchableSelect';
import * as XLSX from 'xlsx';
import { 
  Plus, Search, RotateCcw, X, Edit2, Trash2, 
  Calendar, ChevronLeft, ChevronRight, Download, Check, 
  Layers, Receipt, IndianRupee, ArrowRight, Building, 
  Sparkles, Filter, CheckCircle2, Clock
} from 'lucide-react';

const CATEGORY_OPTIONS = [
  'Maintenance',
  'Electricity & Utilities',
  'Property Rent Paid',
  'Deposit Refund',
  'Repair',
  'Cleaning',
  'Security',
  'Miscellaneous',
];

const CATEGORY_COLORS = {
  'Maintenance': 'bg-blue-100 text-blue-700 border-blue-200',
  'Electricity & Utilities': 'bg-yellow-100 text-yellow-800 border-yellow-200',
  'Property Rent Paid': 'bg-purple-100 text-purple-700 border-purple-200',
  'Deposit Refund': 'bg-teal-100 text-teal-700 border-teal-200',
  'Repair': 'bg-orange-100 text-orange-700 border-orange-200',
  'Cleaning': 'bg-cyan-100 text-cyan-700 border-cyan-200',
  'Security': 'bg-indigo-100 text-indigo-700 border-indigo-200',
  'Miscellaneous': 'bg-slate-100 text-slate-700 border-slate-200',
};

const EXPENSES_SHEET_COLUMNS_DEF = [
  { id: 'index', label: '#', defaultVisible: true },
  { id: 'property', label: 'Property', defaultVisible: true },
  { id: 'category', label: 'Expense Type', defaultVisible: true },
  { id: 'description', label: 'What it was for', defaultVisible: true },
  { id: 'payee', label: 'Paid To / Vendor', defaultVisible: true },
  { id: 'paymentMode', label: 'Payment Mode', defaultVisible: true },
  { id: 'amount', label: 'Amount (₹)', defaultVisible: true },
  { id: 'createdAt', label: 'Created Date', defaultVisible: false },
  { id: 'updatedAt', label: 'Modified Date', defaultVisible: false },
  { id: 'actions', label: 'Actions', defaultVisible: true }
];

const DEFAULT_SHEET_COLUMN_WIDTHS = {
  index: 50,
  property: 160,
  category: 150,
  description: 240,
  payee: 150,
  paymentMode: 110,
  amount: 140,
  createdAt: 110,
  updatedAt: 110,
  actions: 110
};

const EXPENSES_REGISTER_COLUMNS_DEF = [
  { id: 'date', label: 'Month / Date', defaultVisible: true },
  { id: 'property', label: 'Property', defaultVisible: true },
  { id: 'category', label: 'Expense Type', defaultVisible: true },
  { id: 'description', label: 'What it was for', defaultVisible: true },
  { id: 'payee', label: 'Paid To / Mode', defaultVisible: true },
  { id: 'amount', label: 'Amount', defaultVisible: true },
  { id: 'createdAt', label: 'Created Date', defaultVisible: false },
  { id: 'updatedAt', label: 'Modified Date', defaultVisible: false },
  { id: 'actions', label: 'Action', defaultVisible: true }
];

const DEFAULT_REGISTER_COLUMN_WIDTHS = {
  date: 110,
  property: 150,
  category: 140,
  description: 230,
  payee: 140,
  amount: 120,
  createdAt: 110,
  updatedAt: 110,
  actions: 100
};

export default function ExpensesView() {
  const [activeTab, setActiveTab] = useState('sheet'); // 'sheet' (Excel Grid) | 'register' (Full History)

  const getCurrentMonthYear = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  };

  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonthYear());
  const [expenses, setExpenses] = useState([]);
  const [categories, setCategories] = useState([]);
  const [properties, setProperties] = useState([]);
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(true);

  // New Category Modal states
  const [showAddCategoryModal, setShowAddCategoryModal] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [creatingCategory, setCreatingCategory] = useState(false);

  // Filters for Sheet and Register
  const [sheetSearch, setSheetSearch] = useState('');
  const [sheetPropFilter, setSheetPropFilter] = useState('');
  const [sheetCatFilter, setSheetCatFilter] = useState('');

  const [registerSearch, setRegisterSearch] = useState('');
  const [registerPropFilter, setRegisterPropFilter] = useState('');
  const [registerCatFilter, setRegisterCatFilter] = useState('');
  const [registerMonthFilter, setRegisterMonthFilter] = useState('');

  // Modals & Inline Edit States
  const [showModal, setShowModal] = useState(false);
  const [editingExpenseId, setEditingExpenseId] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [entryByDate, setEntryByDate] = useState(false);

  // Fast Inline Row Draft for Sheet
  const [quickForm, setQuickForm] = useState({
    propertyId: '',
    unitId: '',
    category: 'Maintenance',
    description: '',
    vendorOrPayee: '',
    paymentMode: 'Cash',
    amount: ''
  });
  const [quickSaving, setQuickSaving] = useState(false);
  const [quickSaveSuccess, setQuickSaveSuccess] = useState(false);
  const quickAmountInputRef = useRef(null);

  // Inline Row Amount Edit inside Sheet Table
  const [editingRowAmount, setEditingRowAmount] = useState({}); // { [expenseId]: '4500' }
  const [savingRowId, setSavingRowId] = useState(null);

  // Column Resizing for Sheet
  const [visibleSheetColumns, setVisibleSheetColumns] = useState(() => {
    const saved = localStorage.getItem('cols_expenses_sheet_v1');
    if (saved) {
      try {
        const allowed = EXPENSES_SHEET_COLUMNS_DEF.map(c => c.id);
        return JSON.parse(saved).filter(c => allowed.includes(c));
      } catch (e) {}
    }
    return EXPENSES_SHEET_COLUMNS_DEF.filter(c => c.defaultVisible !== false).map(c => c.id);
  });

  const {
    columnWidths: sheetColumnWidths,
    handleResizeStart: handleSheetResizeStart,
    resetColumnWidths: resetSheetColumnWidths
  } = useResizableColumns('expenses_sheet_v1', DEFAULT_SHEET_COLUMN_WIDTHS);

  // Column Resizing for Register
  const [visibleRegisterColumns, setVisibleRegisterColumns] = useState(() => {
    const saved = localStorage.getItem('cols_expenses_register_v1');
    if (saved) {
      try {
        const allowed = EXPENSES_REGISTER_COLUMNS_DEF.map(c => c.id);
        return JSON.parse(saved).filter(c => allowed.includes(c));
      } catch (e) {}
    }
    return EXPENSES_REGISTER_COLUMNS_DEF.filter(c => c.defaultVisible !== false).map(c => c.id);
  });

  const {
    columnWidths: registerColumnWidths,
    handleResizeStart: handleRegisterResizeStart,
    resetColumnWidths: resetRegisterColumnWidths
  } = useResizableColumns('expenses_register_v1', DEFAULT_REGISTER_COLUMN_WIDTHS);

  // Add / Edit Modal Form State
  const [form, setForm] = useState({
    expenseMonth: getCurrentMonthYear(),
    expenseDate: new Date().toISOString().split('T')[0],
    propertyId: '',
    unitId: '',
    category: 'Maintenance',
    amount: '',
    description: '',
    vendorOrPayee: '',
    paymentMode: 'Cash',
  });

  const fetchData = async () => {
    try {
      setLoading(true);
      const [eRes, cRes, pRes, uRes] = await Promise.all([
        API.get('/expenses'),
        API.get('/expenses/categories'),
        API.get('/properties'),
        API.get('/units'),
      ]);
      if (eRes.data.success) setExpenses(eRes.data.data);
      if (cRes.data.success) setCategories(cRes.data.data);
      if (pRes.data.success) setProperties(pRes.data.data);
      if (uRes.data.success) setUnits(uRes.data.data);
    } catch (err) {
      console.error('Failed to load expenses data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Compute merged category names from defaults and DB
  const allCategoryNames = React.useMemo(() => {
    const list = [...CATEGORY_OPTIONS];
    categories.forEach(c => {
      const name = typeof c === 'string' ? c : c?.name;
      if (name && !list.includes(name)) {
        list.push(name);
      }
    });
    return list;
  }, [categories]);

  // Handle creating new expense category on the fly
  const handleCreateCategory = async (name) => {
    const catName = (name || newCategoryName).trim();
    if (!catName) return;
    try {
      setCreatingCategory(true);
      const res = await API.post('/expenses/categories', { name: catName });
      if (res.data.success) {
        setCategories(prev => [...prev, res.data.data]);
        if (showModal) {
          setForm(f => ({ ...f, category: catName }));
        } else {
          setQuickForm(f => ({ ...f, category: catName }));
        }
        setShowAddCategoryModal(false);
        setNewCategoryName('');
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to create category');
    } finally {
      setCreatingCategory(false);
    }
  };

  // Month Navigation Handlers (Same as PaymentsView)
  const handlePrevMonth = () => {
    const [y, m] = selectedMonth.split('-').map(Number);
    const d = new Date(y, m - 2, 1);
    const prev = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    setSelectedMonth(prev);
  };

  const handleNextMonth = () => {
    const [y, m] = selectedMonth.split('-').map(Number);
    const d = new Date(y, m, 1);
    const next = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    setSelectedMonth(next);
  };

  const handleSelectCustomMonth = (e) => {
    if (e.target.value) {
      setSelectedMonth(e.target.value);
    }
  };

  // Month-Specific Expenses for the Excel Grid
  const monthExpenses = expenses.filter(e => {
    if (e.isReversed) return false;
    const expM = e.expenseMonth || (e.expenseDate ? e.expenseDate.slice(0, 7) : '');
    return expM === selectedMonth;
  });

  const filteredMonthExpenses = monthExpenses.filter(e => {
    const matchesSearch = !sheetSearch ||
      e.description?.toLowerCase().includes(sheetSearch.toLowerCase()) ||
      e.vendorOrPayee?.toLowerCase().includes(sheetSearch.toLowerCase()) ||
      e.propertyId?.name?.toLowerCase().includes(sheetSearch.toLowerCase()) ||
      e.category?.toLowerCase().includes(sheetSearch.toLowerCase());

    const matchesProp = !sheetPropFilter || String(e.propertyId?._id || e.propertyId || '') === sheetPropFilter;
    const matchesCat = !sheetCatFilter || e.category === sheetCatFilter;

    return matchesSearch && matchesProp && matchesCat;
  });

  const monthTotalSum = filteredMonthExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);

  // Fast Inline Expense Entry (Direct in the Sheet)
  const handleFastAddExpense = async (e) => {
    if (e) e.preventDefault();
    if (!quickForm.amount || Number(quickForm.amount) <= 0) {
      alert('Please enter a valid expense amount greater than 0.');
      quickAmountInputRef.current?.focus();
      return;
    }
    if (!quickForm.description.trim()) {
      alert('Please enter what this expense was for (Description).');
      return;
    }

    try {
      setQuickSaving(true);
      const payload = {
        propertyId: quickForm.propertyId || null,
        unitId: quickForm.unitId || null,
        category: quickForm.category || 'Maintenance',
        description: quickForm.description.trim(),
        vendorOrPayee: quickForm.vendorOrPayee.trim(),
        paymentMode: quickForm.paymentMode || 'Cash',
        amount: Number(quickForm.amount),
        expenseMonth: selectedMonth,
        expenseDate: `${selectedMonth}-01`
      };

      const res = await API.post('/expenses', payload);
      if (res.data.success) {
        setQuickSaveSuccess(true);
        setTimeout(() => setQuickSaveSuccess(false), 2500);

        // Reset fast form inputs, keeping property & category ready for next entry
        setQuickForm(prev => ({
          ...prev,
          unitId: '',
          description: '',
          vendorOrPayee: '',
          amount: ''
        }));
        await fetchData();
        quickAmountInputRef.current?.focus();
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Could not save expense.');
    } finally {
      setQuickSaving(false);
    }
  };

  // Inline Row Amount Save in Excel Table
  const handleSaveInlineRowAmount = async (expenseId) => {
    const newAmtStr = editingRowAmount[expenseId];
    if (newAmtStr === undefined) return;
    const num = Number(newAmtStr);
    if (isNaN(num) || num <= 0) {
      alert('Please enter a valid amount.');
      return;
    }

    try {
      setSavingRowId(expenseId);
      const res = await API.put(`/expenses/${expenseId}`, { amount: num });
      if (res.data.success) {
        setEditingRowAmount(prev => {
          const updated = { ...prev };
          delete updated[expenseId];
          return updated;
        });
        await fetchData();
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Could not update amount.');
    } finally {
      setSavingRowId(null);
    }
  };

  // Export Month's Expense Sheet to Excel (.xlsx)
  const exportMonthExpensesToExcel = () => {
    if (filteredMonthExpenses.length === 0) {
      alert(`No expenses recorded for ${formatMonthYear(selectedMonth)} to export.`);
      return;
    }

    const exportRows = filteredMonthExpenses.map((e, idx) => ({
      'Sr. No.': idx + 1,
      'Month': formatMonthYear(selectedMonth),
      'Property': e.propertyId?.name || 'General / Common',
      'Partition': e.unitId?.subUnitPartition || e.unitId?.unitName || 'Entire Property',
      'Expense Type': e.category || 'Maintenance',
      'What it was for': e.description || '',
      'Paid To / Vendor': e.vendorOrPayee || '—',
      'Payment Mode': e.paymentMode || 'Cash',
      'Amount (₹)': e.amount || 0
    }));

    // Add Grand Total Row
    exportRows.push({
      'Sr. No.': '',
      'Month': '',
      'Property': '',
      'Partition': '',
      'Expense Type': '',
      'What it was for': 'TOTAL EXPENSES',
      'Paid To / Vendor': '',
      'Payment Mode': '',
      'Amount (₹)': monthTotalSum
    });

    const ws = XLSX.utils.json_to_sheet(exportRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Expenses_${selectedMonth}`);
    XLSX.writeFile(wb, `Property_Expenses_${selectedMonth}.xlsx`);
  };

  // Standard Modal Actions
  const resetForm = () => {
    setEditingExpenseId(null);
    setEntryByDate(false);
    setForm({
      expenseMonth: selectedMonth,
      expenseDate: new Date().toISOString().split('T')[0],
      propertyId: '',
      unitId: '',
      category: 'Maintenance',
      amount: '',
      description: '',
      vendorOrPayee: '',
      paymentMode: 'Cash',
    });
  };

  const handleOpenCreate = () => {
    resetForm();
    setShowModal(true);
  };

  const handleSaveModal = async (e) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      const categoryName = form.category.trim();
      const payload = {
        ...form,
        propertyId: form.propertyId || null,
        unitId: form.unitId || null,
        category: categoryName,
        expenseMonth: !entryByDate ? form.expenseMonth : (form.expenseDate ? form.expenseDate.slice(0, 7) : form.expenseMonth),
        expenseDate: entryByDate ? form.expenseDate : `${form.expenseMonth}-01`
      };

      if (editingExpenseId) {
        const res = await API.put(`/expenses/${editingExpenseId}`, payload);
        if (res.data.success) {
          setShowModal(false);
          resetForm();
          fetchData();
        }
      } else {
        const res = await API.post('/expenses', payload);
        if (res.data.success) {
          setShowModal(false);
          resetForm();
          fetchData();
        }
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Could not save expense.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReverse = async (id) => {
    const reason = prompt('Why are you cancelling/reversing this expense?');
    if (!reason || !reason.trim()) return;
    try {
      await API.post(`/expenses/${id}/reverse`, { reversalReason: reason.trim() });
      fetchData();
    } catch (err) {
      alert(err.response?.data?.message || 'Could not reverse expense.');
    }
  };

  const handleDeleteExpense = async (id) => {
    if (!window.confirm('Are you sure you want to permanently delete this expense record?')) return;
    try {
      await API.delete(`/expenses/${id}`);
      fetchData();
    } catch (err) {
      alert(err.response?.data?.message || 'Could not delete expense.');
    }
  };

  // Full Register Filtered List
  const filteredRegister = expenses.filter((e) => {
    const matchesSearch =
      !registerSearch ||
      e.description?.toLowerCase().includes(registerSearch.toLowerCase()) ||
      e.vendorOrPayee?.toLowerCase().includes(registerSearch.toLowerCase()) ||
      e.propertyId?.name?.toLowerCase().includes(registerSearch.toLowerCase()) ||
      e.category?.toLowerCase().includes(registerSearch.toLowerCase());

    const matchesCategory = !registerCatFilter || e.category === registerCatFilter;
    const matchesProp = !registerPropFilter || String(e.propertyId?._id || e.propertyId || '') === registerPropFilter;
    const expM = e.expenseMonth || (e.expenseDate ? e.expenseDate.slice(0, 7) : '');
    const matchesMonth = !registerMonthFilter || expM === registerMonthFilter;

    return matchesSearch && matchesCategory && matchesProp && matchesMonth;
  });

  const totalRegisterShown = filteredRegister.reduce((s, e) => s + (e.isReversed ? 0 : e.amount), 0);
  const allCategories = [...new Set([
    ...CATEGORY_OPTIONS,
    ...categories.map(c => (typeof c === 'string' ? c : c.name)).filter(Boolean)
  ])].sort((a, b) => a.localeCompare(b));

  const availableExpenseMonths = [...new Set(
    expenses.map(e => e.expenseMonth || (e.expenseDate ? e.expenseDate.slice(0, 7) : '')).filter(Boolean)
  )].sort().reverse();

  const totalSheetTableWidth = visibleSheetColumns.reduce((sum, colId) => {
    return sum + (sheetColumnWidths[colId] || DEFAULT_SHEET_COLUMN_WIDTHS[colId] || 120);
  }, 0);

  return (
    <div className="space-y-5">
      {/* Top Header Card */}
      <div className="bg-white p-5 sm:p-6 rounded-2xl shadow-sm border border-slate-200">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="p-2 bg-rose-50 text-rose-600 rounded-xl">
                <IndianRupee className="w-5 h-5" />
              </span>
              <div>
                <h2 className="text-xl font-extrabold text-slate-900">Expenses & Expense Sheet</h2>
                <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                  Excel-Style Monthly Expense Grid, Inline Fast Entry & Expense Register
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Tab Selector (Exact same as PaymentsView) */}
            <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl">
              <button
                onClick={() => setActiveTab('sheet')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                  activeTab === 'sheet'
                    ? 'bg-white text-emerald-700 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                Monthly Expense Grid
              </button>
              <button
                onClick={() => setActiveTab('register')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                  activeTab === 'register'
                    ? 'bg-white text-emerald-700 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Receipt className="w-3.5 h-3.5" />
                All Expenses Register ({expenses.length})
              </button>
            </div>

            <button
              onClick={handleOpenCreate}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-md shadow-emerald-600/20 active:scale-95 shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>Full Form</span>
            </button>
          </div>
        </div>

        {/* Top Month Selector & Quick Metrics Bar (Identical to PaymentsView) */}
        <div className="mt-5 pt-4 border-t border-slate-100 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
          {/* Active Month Controller */}
          <div className="flex items-center gap-2 bg-slate-50 p-1.5 rounded-2xl border border-slate-200 shadow-sm">
            <button
              onClick={handlePrevMonth}
              className="p-2 rounded-xl hover:bg-white text-slate-600 hover:text-slate-900 shadow-none hover:shadow-sm transition-all cursor-pointer"
              title="Previous Month"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-2 px-3 py-1">
              <Calendar className="w-4 h-4 text-emerald-600 shrink-0" />
              <div className="text-left">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Active Month</span>
                <span className="text-sm font-extrabold text-slate-900">{formatMonthYear(selectedMonth)}</span>
              </div>
            </div>

            <button
              onClick={handleNextMonth}
              className="p-2 rounded-xl hover:bg-white text-slate-600 hover:text-slate-900 shadow-none hover:shadow-sm transition-all cursor-pointer"
              title="Next Month"
            >
              <ChevronRight className="w-4 h-4" />
            </button>

            <div className="h-6 w-px bg-slate-200 mx-1" />

            {/* Direct Month Picker */}
            <input
              type="month"
              value={selectedMonth}
              onChange={handleSelectCustomMonth}
              className="text-xs font-semibold px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
              title="Jump to specific month and year"
            />

            <button
              onClick={() => setSelectedMonth(getCurrentMonthYear())}
              className="text-xs font-bold px-3 py-1.5 rounded-xl text-emerald-700 hover:bg-emerald-50 transition-colors cursor-pointer"
            >
              Today
            </button>
          </div>

          {/* Quick Metrics Badges for Active Month */}
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 flex items-center gap-2">
              <span className="text-xs text-slate-500 font-medium">Entries:</span>
              <span className="text-xs font-bold text-slate-800">{filteredMonthExpenses.length} records</span>
            </div>
            <div className="px-3.5 py-2 rounded-xl bg-rose-50/70 border border-rose-200/80 flex items-center gap-2">
              <span className="text-xs text-rose-600 font-medium">Month Total:</span>
              <span className="text-xs font-extrabold text-rose-700 font-mono">{formatCurrency(monthTotalSum)}</span>
            </div>
            <button
              onClick={exportMonthExpensesToExcel}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-all shadow-sm active:scale-95 cursor-pointer"
              title="Download Excel Sheet for this Month"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Excel</span>
            </button>
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* VIEW 1: EXCEL-TEMPLATE-STYLE MONTHLY EXPENSE GRID */}
      {/* ======================================================== */}
      {activeTab === 'sheet' && (
        <div className="space-y-4">
          {/* FAST INLINE ROW ENTRY BAR (EXCEL FAST ENTRY) */}
          <div className="bg-white p-4 rounded-2xl border-2 border-emerald-500/30 shadow-md">
            <div className="flex items-center justify-between pb-2.5 mb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600">
                  <Sparkles className="w-4 h-4" />
                </span>
                <span className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">
                  Fast Excel Entry for {formatMonthYear(selectedMonth)}
                </span>
                <span className="text-[11px] text-slate-400 hidden sm:inline">
                  (Type amount and press Enter to save directly into sheet)
                </span>
              </div>
              {quickSaveSuccess && (
                <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 animate-fadeIn">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Saved to {formatMonthYear(selectedMonth)}!</span>
                </div>
              )}
            </div>

            <form onSubmit={handleFastAddExpense} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-end">
              {/* 1. Property Select */}
              <div className="lg:col-span-3">
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  1. Property
                </label>
                <select
                  value={quickForm.propertyId}
                  onChange={(e) => setQuickForm({ ...quickForm, propertyId: e.target.value, unitId: '' })}
                  className="w-full text-xs font-semibold px-3 py-2 rounded-xl border border-slate-300 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-2xs"
                >
                  <option value="">General / Common Expense</option>
                  {properties.map(p => (
                    <option key={p._id} value={p._id}>{p.name}</option>
                  ))}
                </select>
              </div>

              {/* 1b. Sub-Unit / Partition Select */}
              <div className="lg:col-span-2">
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Partition (Optional)
                </label>
                <select
                  value={quickForm.unitId}
                  disabled={!quickForm.propertyId}
                  onChange={(e) => setQuickForm({ ...quickForm, unitId: e.target.value })}
                  className="w-full text-xs font-semibold px-3 py-2 rounded-xl border border-slate-300 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-slate-100 disabled:text-slate-400 shadow-2xs"
                >
                  <option value="">Entire Property / Common</option>
                  {units
                    .filter(u => (u.propertyId?._id || u.propertyId) === quickForm.propertyId)
                    .map(u => (
                      <option key={u._id} value={u._id}>{u.subUnitPartition || u.unitName}</option>
                    ))
                  }
                </select>
              </div>

              {/* 2. Expense Category */}
              <div className="lg:col-span-2">
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-[11px] font-bold text-slate-600">
                    2. Expense Head
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowAddCategoryModal(true)}
                    className="text-[10px] font-bold text-emerald-600 hover:text-emerald-700 hover:underline flex items-center gap-0.5"
                    title="Add new custom category"
                  >
                    <Plus className="w-2.5 h-2.5" /> New
                  </button>
                </div>
                <select
                  value={quickForm.category}
                  onChange={(e) => {
                    if (e.target.value === '__add_new__') {
                      setShowAddCategoryModal(true);
                    } else {
                      setQuickForm({ ...quickForm, category: e.target.value });
                    }
                  }}
                  className="w-full text-xs font-semibold px-3 py-2 rounded-xl border border-slate-300 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-2xs"
                >
                  {allCategoryNames.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                  <option value="__add_new__">+ Add New Head...</option>
                </select>
              </div>

              {/* 3. Description / What it was for */}
              <div className="lg:col-span-2">
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  3. Description *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Electric bill, plumbing..."
                  value={quickForm.description}
                  onChange={(e) => setQuickForm({ ...quickForm, description: e.target.value })}
                  className="w-full text-xs px-3 py-2 rounded-xl border border-slate-300 bg-white text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-2xs"
                />
              </div>

              {/* 4. Payee / Paid to */}
              <div className="lg:col-span-1">
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  4. Payee
                </label>
                <input
                  type="text"
                  placeholder="Vendor"
                  value={quickForm.vendorOrPayee}
                  onChange={(e) => setQuickForm({ ...quickForm, vendorOrPayee: e.target.value })}
                  className="w-full text-xs px-3 py-2 rounded-xl border border-slate-300 bg-white text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-2xs"
                />
              </div>

              {/* 5. Amount & Save */}
              <div className="lg:col-span-2 flex items-center gap-2">
                <div className="flex-1 relative">
                  <label className="block text-[11px] font-bold text-rose-700 mb-1">
                    5. Amount (₹) *
                  </label>
                  <div className="relative flex items-center">
                    <span className="absolute left-2.5 text-slate-400 text-xs font-semibold">₹</span>
                    <input
                      ref={quickAmountInputRef}
                      type="number"
                      required
                      min="1"
                      step="any"
                      placeholder="Amount"
                      value={quickForm.amount}
                      onChange={(e) => setQuickForm({ ...quickForm, amount: e.target.value })}
                      className="w-full pl-6 pr-2 py-2 text-xs font-extrabold text-slate-900 bg-emerald-50/30 border border-emerald-400 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono shadow-xs"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={quickSaving}
                  className="mt-5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold transition-all shadow-md shadow-emerald-600/20 active:scale-95 shrink-0 disabled:opacity-60 cursor-pointer"
                  title="Add this expense to selected month"
                >
                  {quickSaving ? '...' : 'Add'}
                </button>
              </div>
            </form>
          </div>

          {/* Action & Filter Bar for Sheet */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm">
            {/* Search Input */}
            <div className="flex items-center gap-2.5 flex-1 bg-slate-50 px-3.5 py-2 rounded-xl border border-slate-200/80">
              <Search className="w-4 h-4 text-slate-400 shrink-0" />
              <input
                type="text"
                placeholder="Search this month's expenses by description, payee, or property..."
                value={sheetSearch}
                onChange={(e) => setSheetSearch(e.target.value)}
                className="flex-1 text-xs sm:text-sm bg-transparent border-none focus:outline-none text-slate-800 placeholder:text-slate-400"
              />
              {sheetSearch && (
                <button onClick={() => setSheetSearch('')} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Filter Dropdowns */}
            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={sheetPropFilter}
                onChange={(e) => setSheetPropFilter(e.target.value)}
                className="text-xs font-semibold px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400 cursor-pointer"
              >
                <option value="">All Properties</option>
                {properties.map(p => (
                  <option key={p._id} value={p._id}>{p.name}</option>
                ))}
              </select>

              <select
                value={sheetCatFilter}
                onChange={(e) => setSheetCatFilter(e.target.value)}
                className="text-xs font-semibold px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400 cursor-pointer"
              >
                <option value="">All Heads</option>
                {allCategories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>

              {/* Column Customizer */}
              <ColumnManager
                columns={EXPENSES_SHEET_COLUMNS_DEF}
                visibleColumns={visibleSheetColumns}
                onChangeVisible={setVisibleSheetColumns}
                storageKey="expenses_sheet_v1"
                onResetWidths={resetSheetColumnWidths}
              />

              {/* Reset Column Widths */}
              <button
                type="button"
                onClick={resetSheetColumnWidths}
                className="flex items-center gap-1.5 px-2.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-900 text-xs font-bold transition-all shadow-xs cursor-pointer"
                title="Reset column widths"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span className="hidden xl:inline">Reset</span>
              </button>
            </div>
          </div>

          {/* THE EXCEL SPREADSHEET TABLE */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            {loading ? (
              <div className="py-20 text-center text-slate-400 text-sm">Loading expense sheet for {formatMonthYear(selectedMonth)}...</div>
            ) : filteredMonthExpenses.length === 0 ? (
              <div className="py-20 text-center text-slate-400 text-sm">
                No expenses found for {formatMonthYear(selectedMonth)}. Use the Fast Excel Entry bar above to add expenses!
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table
                  className="w-full text-left text-sm border-collapse table-fixed"
                  style={{ minWidth: `${totalSheetTableWidth}px` }}
                >
                  <colgroup>
                    {visibleSheetColumns.map(colId => (
                      <col
                        key={colId}
                        style={{ width: `${sheetColumnWidths[colId] || DEFAULT_SHEET_COLUMN_WIDTHS[colId] || 120}px` }}
                      />
                    ))}
                  </colgroup>
                  <thead className="bg-slate-100/80 border-b border-slate-200 text-[11px] text-slate-600 uppercase tracking-wider font-extrabold select-none">
                    <tr>
                      {visibleSheetColumns.map(colId => {
                        const dragProps = getHeaderDragProps(colId, visibleSheetColumns, setVisibleSheetColumns, 'expenses_sheet_v1');
                        const width = sheetColumnWidths[colId] || DEFAULT_SHEET_COLUMN_WIDTHS[colId] || 120;
                        let label = colId;
                        let align = 'text-left';

                        if (colId === 'index') { label = '#'; align = 'text-center'; }
                        else if (colId === 'property') { label = 'Property'; }
                        else if (colId === 'category') { label = 'Expense Type'; }
                        else if (colId === 'description') { label = 'What it was for'; }
                        else if (colId === 'payee') { label = 'Paid To / Vendor'; }
                        else if (colId === 'paymentMode') { label = 'Payment Mode'; }
                        else if (colId === 'amount') { label = 'Amount (₹)'; align = 'text-right'; }
                        else if (colId === 'createdAt') { label = 'Created Date'; }
                        else if (colId === 'updatedAt') { label = 'Modified Date'; }
                        else if (colId === 'actions') { label = 'Actions'; align = 'text-center'; }

                        return (
                          <th
                            key={colId}
                            {...dragProps}
                            style={{ width: `${width}px` }}
                            className={`px-3 py-3.5 border-r border-slate-200 relative group ${align}`}
                          >
                            <span className="truncate block font-extrabold text-[11px] text-slate-700 pr-2">
                              {label}
                            </span>
                            <ResizeHandle colId={colId} onResizeStart={handleSheetResizeStart} />
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredMonthExpenses.map((e, idx) => {
                      const isInlineEditing = editingRowAmount[e._id] !== undefined;

                      return (
                        <tr key={e._id} className="hover:bg-slate-50/80 transition-colors">
                          {visibleSheetColumns.map(colId => {
                            if (colId === 'index') {
                              return (
                                <td key={colId} className="px-3 py-3 border-r border-slate-100 text-center text-xs text-slate-400 font-mono">
                                  {idx + 1}
                                </td>
                              );
                            }
                            if (colId === 'property') {
                              return (
                                <td key={colId} className="px-3 py-3 border-r border-slate-100">
                                  <div className="font-bold text-slate-800 text-xs">
                                    {e.propertyId?.name || <span className="text-slate-400 italic font-normal">General (Common)</span>}
                                  </div>
                                  {e.propertyId && (
                                    <p className="text-[10px] text-slate-500 font-medium">
                                      {e.unitId?.subUnitPartition || e.unitId?.unitName || 'Entire Property'}
                                    </p>
                                  )}
                                </td>
                              );
                            }
                            if (colId === 'category') {
                              return (
                                <td key={colId} className="px-3 py-3 border-r border-slate-100">
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold border ${CATEGORY_COLORS[e.category] || 'bg-slate-100 text-slate-700 border-slate-200'}`}>
                                    {e.category}
                                  </span>
                                </td>
                              );
                            }
                            if (colId === 'description') {
                              return (
                                <td key={colId} className="px-3 py-3 border-r border-slate-100">
                                  <span className="text-xs font-semibold text-slate-800 block truncate" title={e.description}>
                                    {e.description}
                                  </span>
                                </td>
                              );
                            }
                            if (colId === 'payee') {
                              return (
                                <td key={colId} className="px-3 py-3 border-r border-slate-100 text-xs text-slate-600">
                                  {e.vendorOrPayee || <span className="text-slate-400">—</span>}
                                </td>
                              );
                            }
                            if (colId === 'paymentMode') {
                              return (
                                <td key={colId} className="px-3 py-3 border-r border-slate-100">
                                  <span className="inline-block px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-700">
                                    {e.paymentMode || 'Cash'}
                                  </span>
                                </td>
                              );
                            }
                            if (colId === 'amount') {
                              return (
                                <td key={colId} className="px-3 py-3 border-r border-slate-100 text-right">
                                  {isInlineEditing ? (
                                    <div className="flex items-center gap-1 justify-end">
                                      <div className="relative">
                                        <span className="absolute left-2 text-slate-400 text-xs font-semibold">₹</span>
                                        <input
                                          type="number"
                                          autoFocus
                                          value={editingRowAmount[e._id]}
                                          onChange={(ev) => setEditingRowAmount({ ...editingRowAmount, [e._id]: ev.target.value })}
                                          onKeyDown={(ev) => {
                                            if (ev.key === 'Enter') handleSaveInlineRowAmount(e._id);
                                            if (ev.key === 'Escape') {
                                              setEditingRowAmount(prev => {
                                                const cp = { ...prev };
                                                delete cp[e._id];
                                                return cp;
                                              });
                                            }
                                          }}
                                          className="w-24 pl-5 pr-1 py-1 text-xs font-bold text-slate-900 border border-emerald-500 rounded bg-white font-mono"
                                        />
                                      </div>
                                      <button
                                        onClick={() => handleSaveInlineRowAmount(e._id)}
                                        disabled={savingRowId === e._id}
                                        className="p-1 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded cursor-pointer"
                                        title="Save Amount (Enter)"
                                      >
                                        <Check className="w-3.5 h-3.5" />
                                      </button>
                                      <button
                                        onClick={() => {
                                          setEditingRowAmount(prev => {
                                            const cp = { ...prev };
                                            delete cp[e._id];
                                            return cp;
                                          });
                                        }}
                                        className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded cursor-pointer"
                                        title="Cancel (Esc)"
                                      >
                                        <X className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  ) : (
                                    <div
                                      onClick={() => setEditingRowAmount({ ...editingRowAmount, [e._id]: String(e.amount) })}
                                      className="font-extrabold text-xs text-rose-600 font-mono cursor-pointer hover:bg-rose-50/60 px-2 py-1 rounded inline-block transition-colors"
                                      title="Click to edit amount directly"
                                    >
                                      {formatCurrency(e.amount)}
                                    </div>
                                  )}
                                </td>
                              );
                            }
                            if (colId === 'createdAt' || colId === 'updatedAt') {
                              return (
                                <td key={colId} className="px-3 py-3 border-r border-slate-100 text-xs text-slate-600 whitespace-nowrap">
                                  {e[colId] ? formatDate(e[colId]) : '—'}
                                </td>
                              );
                            }
                            if (colId === 'actions') {
                              return (
                                <td key={colId} className="px-3 py-3 text-center border-r border-slate-100">
                                  <div className="flex items-center justify-center gap-1.5">
                                    <button
                                      onClick={() => {
                                        setEditingExpenseId(e._id);
                                        const dStr = e.expenseDate ? new Date(e.expenseDate).toISOString().split('T')[0] : '';
                                        const mStr = e.expenseMonth || (dStr ? dStr.slice(0, 7) : selectedMonth);
                                        setEntryByDate(Boolean(dStr && !dStr.endsWith('-01')));
                                        setForm({
                                          expenseMonth: mStr,
                                          expenseDate: dStr,
                                          propertyId: e.propertyId?._id || e.propertyId || '',
                                          unitId: e.unitId?._id || e.unitId || '',
                                          category: e.category || 'Maintenance',
                                          amount: String(e.amount),
                                          description: e.description || '',
                                          vendorOrPayee: e.vendorOrPayee || '',
                                          paymentMode: e.paymentMode || 'Cash',
                                        });
                                        setShowModal(true);
                                      }}
                                      title="Edit details"
                                      className="p-1 text-slate-400 hover:text-emerald-700 hover:bg-slate-100 rounded transition-colors cursor-pointer"
                                    >
                                      <Edit2 className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      onClick={() => handleReverse(e._id)}
                                      title="Cancel/Reverse Expense"
                                      className="p-1 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded transition-colors cursor-pointer"
                                    >
                                      <RotateCcw className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      onClick={() => handleDeleteExpense(e._id)}
                                      title="Permanently Delete Expense"
                                      className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors cursor-pointer"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </td>
                              );
                            }
                            return null;
                          })}
                        </tr>
                      );
                    })}
                  </tbody>

                  {/* Excel Sheet Total Row */}
                  <tfoot className="bg-slate-100 border-t-2 border-slate-300 font-extrabold text-xs">
                    <tr>
                      {visibleSheetColumns.map((colId) => (
                        <td
                          key={colId}
                          className={`px-4 py-3.5 ${colId === 'amount' ? 'text-right font-mono text-sm text-rose-700' : colId === 'actions' ? 'text-center text-slate-400 font-normal text-[11px]' : 'text-slate-700'} font-extrabold`}
                        >
                          {colId === 'amount'
                            ? formatCurrency(monthTotalSum)
                            : colId === 'actions'
                              ? 'Excel Format'
                              : colId === visibleSheetColumns.find((column) => !['amount', 'actions'].includes(column))
                                ? `Total Expenses for ${formatMonthYear(selectedMonth)} (${filteredMonthExpenses.length} entries)`
                                : ''}
                        </td>
                      ))}
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* VIEW 2: ALL EXPENSES REGISTER (HISTORICAL LOG) */}
      {/* ======================================================== */}
      {activeTab === 'register' && (
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm">
            {/* Search */}
            <div className="flex items-center gap-2.5 flex-1 bg-slate-50 px-3.5 py-2 rounded-xl border border-slate-200/80">
              <Search className="w-4 h-4 text-slate-400 shrink-0" />
              <input
                type="text"
                placeholder="Search description, payee, or property..."
                value={registerSearch}
                onChange={(e) => setRegisterSearch(e.target.value)}
                className="flex-1 text-xs sm:text-sm bg-transparent border-none focus:outline-none text-slate-800 placeholder:text-slate-400"
              />
              {registerSearch && (
                <button onClick={() => setRegisterSearch('')} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <SearchableSelect
              className="w-full sm:w-56"
              value={registerPropFilter}
              onChange={setRegisterPropFilter}
              placeholder="All Properties"
              searchPlaceholder="Search properties..."
              options={properties.map((property) => ({ value: property._id, label: property.name }))}
            />

            <SearchableSelect
              className="w-full sm:w-44"
              value={registerMonthFilter}
              onChange={setRegisterMonthFilter}
              placeholder="All Months"
              searchPlaceholder="Search month..."
              options={availableExpenseMonths.map((m) => ({ value: m, label: formatMonthYear(m) }))}
            />

            <SearchableSelect
              className="w-full sm:w-52"
              value={registerCatFilter}
              onChange={setRegisterCatFilter}
              placeholder="All Expense Types"
              searchPlaceholder="Search expense types..."
              options={allCategories.map((category) => ({ value: category, label: category }))}
            />

            {/* Column Manager & Reset */}
            <div className="flex items-center gap-2">
              <ColumnManager
                columns={EXPENSES_REGISTER_COLUMNS_DEF}
                visibleColumns={visibleRegisterColumns}
                onChangeVisible={setVisibleRegisterColumns}
                storageKey="expenses_register_v1"
                onResetWidths={resetRegisterColumnWidths}
              />
              <button
                type="button"
                onClick={resetRegisterColumnWidths}
                className="flex items-center gap-1.5 px-2.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-900 text-xs font-bold transition-all shadow-xs cursor-pointer"
                title="Reset column widths"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Reset Widths</span>
              </button>
            </div>

            <div className="sm:ml-auto text-xs font-semibold text-slate-700 whitespace-nowrap pl-1">
              Total: <span className="text-rose-600 font-bold">{formatCurrency(totalRegisterShown)}</span>
            </div>
          </div>

          {/* Historical Register Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            {loading ? (
              <div className="py-16 text-center text-slate-400 text-sm">Loading expenses...</div>
            ) : filteredRegister.length === 0 ? (
              <div className="py-16 text-center text-slate-400 text-sm">
                No expenses found matching the selected filters.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table
                  className="w-full text-left text-sm border-collapse table-fixed"
                  style={{ minWidth: `${visibleRegisterColumns.reduce((sum, colId) => sum + (registerColumnWidths[colId] || DEFAULT_REGISTER_COLUMN_WIDTHS[colId] || 100), 0)}px` }}
                >
                  <colgroup>
                    {visibleRegisterColumns.map(colId => (
                      <col
                        key={colId}
                        style={{ width: `${registerColumnWidths[colId] || DEFAULT_REGISTER_COLUMN_WIDTHS[colId] || 100}px` }}
                      />
                    ))}
                  </colgroup>
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr className="text-[11px] text-slate-500 uppercase tracking-wide font-extrabold select-none">
                      {visibleRegisterColumns.map(colId => {
                        const dragProps = getHeaderDragProps(colId, visibleRegisterColumns, setVisibleRegisterColumns, 'expenses_register_v1');
                        const width = registerColumnWidths[colId] || DEFAULT_REGISTER_COLUMN_WIDTHS[colId] || 100;
                        let label = colId;
                        let align = 'text-left';
                        if (colId === 'date') label = 'Month / Date';
                        else if (colId === 'property') label = 'Property';
                        else if (colId === 'category') label = 'Expense Type';
                        else if (colId === 'description') label = 'What it was for';
                        else if (colId === 'payee') label = 'Paid To / Method';
                        else if (colId === 'amount') { label = 'Amount'; align = 'text-right'; }
                        else if (colId === 'createdAt') label = 'Created Date';
                        else if (colId === 'updatedAt') label = 'Modified Date';
                        else if (colId === 'actions') { label = 'Action'; align = 'text-center'; }

                        return (
                          <th
                            key={colId}
                            {...dragProps}
                            style={{ width: `${width}px` }}
                            className={`px-4 py-3.5 border-r border-slate-200 relative group ${align}`}
                          >
                            <span className="truncate block pr-2">{label}</span>
                            <ResizeHandle colId={colId} onResizeStart={handleRegisterResizeStart} />
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredRegister.map((e) => (
                      <tr key={e._id} className={`hover:bg-slate-50/60 transition-colors ${e.isReversed ? 'opacity-50' : ''}`}>
                        {visibleRegisterColumns.map(colId => {
                          if (colId === 'date') {
                            return (
                              <td key={colId} className="px-5 py-3.5 text-xs text-slate-500 whitespace-nowrap">
                                <span className="font-semibold text-slate-700 block">
                                  {e.expenseMonth ? formatMonthYear(e.expenseMonth) : formatDate(e.expenseDate)}
                                </span>
                                {e.expenseDate && e.expenseMonth && (
                                  <span className="text-[10px] text-slate-400 block">
                                    {formatDate(e.expenseDate)}
                                  </span>
                                )}
                              </td>
                            );
                          }
                          if (colId === 'property') {
                            return (
                              <td key={colId} className="px-5 py-3.5 text-xs font-semibold text-slate-800">
                                <div>{e.propertyId?.name || <span className="text-slate-400 italic font-normal">General</span>}</div>
                                {e.propertyId && (
                                  <span className="text-[10px] text-slate-500 font-medium block">
                                    {e.unitId?.subUnitPartition || e.unitId?.unitName || 'Entire Property'}
                                  </span>
                                )}
                              </td>
                            );
                          }
                          if (colId === 'category') {
                            return (
                              <td key={colId} className="px-5 py-3.5">
                                <span className={`px-2 py-0.5 rounded-md text-[11px] font-semibold ${CATEGORY_COLORS[e.category] || 'bg-slate-100 text-slate-600'}`}>
                                  {e.category}
                                </span>
                              </td>
                            );
                          }
                          if (colId === 'description') {
                            return <td key={colId} className="px-5 py-3.5 text-xs text-slate-700 max-w-xs">{e.description}</td>;
                          }
                          if (colId === 'payee') {
                            return (
                              <td key={colId} className="px-5 py-3.5 text-xs text-slate-500">
                                {e.vendorOrPayee || '—'}
                                <span className="ml-1 text-slate-300">·</span>
                                <span className="ml-1 text-slate-400">{e.paymentMode}</span>
                              </td>
                            );
                          }
                          if (colId === 'amount') {
                            return (
                              <td key={colId} className="px-5 py-3.5 text-right font-bold text-rose-600 text-sm">
                                {formatCurrency(e.amount)}
                              </td>
                            );
                          }
                          if (colId === 'createdAt' || colId === 'updatedAt') {
                            return (
                              <td key={colId} className="px-5 py-3.5 text-xs text-slate-600 whitespace-nowrap">
                                {e[colId] ? formatDate(e[colId]) : '—'}
                              </td>
                            );
                          }
                          if (colId === 'actions') {
                            return (
                              <td key={colId} className="px-5 py-3.5 text-center">
                                <div className="flex items-center justify-center gap-1.5 whitespace-nowrap">
                                  {!e.isReversed && (
                                    <>
                                      <button
                                        onClick={() => {
                                          setEditingExpenseId(e._id);
                                          const dStr = e.expenseDate ? new Date(e.expenseDate).toISOString().split('T')[0] : '';
                                          const mStr = e.expenseMonth || (dStr ? dStr.slice(0, 7) : getCurrentMonthYear());
                                          setEntryByDate(Boolean(dStr && !dStr.endsWith('-01')));
                                          setForm({
                                            expenseMonth: mStr,
                                            expenseDate: dStr,
                                            propertyId: e.propertyId?._id || e.propertyId || '',
                                            unitId: e.unitId?._id || e.unitId || '',
                                            category: e.category || 'Maintenance',
                                            amount: String(e.amount),
                                            description: e.description || '',
                                            vendorOrPayee: e.vendorOrPayee || '',
                                            paymentMode: e.paymentMode || 'Cash',
                                          });
                                          setShowModal(true);
                                        }}
                                        title="Edit Expense"
                                        className="p-1.5 text-slate-400 hover:text-emerald-700 hover:bg-slate-100 rounded-lg transition-colors shrink-0 cursor-pointer"
                                      >
                                        <Edit2 className="w-3.5 h-3.5" />
                                      </button>
                                      <button
                                        onClick={() => handleReverse(e._id)}
                                        title="Cancel/Reverse Expense"
                                        className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors shrink-0 cursor-pointer"
                                      >
                                        <RotateCcw className="w-3.5 h-3.5" />
                                      </button>
                                    </>
                                  )}
                                  <button
                                    onClick={() => handleDeleteExpense(e._id)}
                                    title="Permanently Delete Expense"
                                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </td>
                            );
                          }
                          return null;
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* FULL FORM / EDIT MODAL */}
      {/* ======================================================== */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-scaleUp">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-lg font-extrabold text-slate-900">
                  {editingExpenseId ? 'Edit Expense' : 'Add New Expense'}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">Record a cost or payment made for a property</p>
              </div>
              <button onClick={() => { setShowModal(false); resetForm(); }} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveModal} className="space-y-4">
              {/* Row 1: Property + Sub-Unit Partition */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <SearchableSelect
                    label="Property"
                    placeholder="General (No property)"
                    searchPlaceholder="Search properties..."
                    options={properties.map((property) => ({ value: property._id, label: property.name }))}
                    value={form.propertyId}
                    onChange={(propertyId) => setForm((prev) => ({ ...prev, propertyId, unitId: '' }))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Sub-Unit / Partition (Optional)
                  </label>
                  <select
                    value={form.unitId}
                    disabled={!form.propertyId}
                    onChange={(e) => setForm({ ...form, unitId: e.target.value })}
                    className="w-full px-3 py-2.5 text-xs font-semibold rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white disabled:bg-slate-100 disabled:text-slate-400"
                  >
                    <option value="">Entire Property / Common Partition</option>
                    {units
                      .filter(u => (u.propertyId?._id || u.propertyId) === form.propertyId)
                      .map(u => (
                        <option key={u._id} value={u._id}>{u.subUnitPartition || u.unitName}</option>
                      ))
                    }
                  </select>
                </div>
              </div>

              {/* Row 1b: Expense Head / Category */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-slate-600">Expense Type / Head *</label>
                  <button
                    type="button"
                    onClick={() => setShowAddCategoryModal(true)}
                    className="text-[11px] font-bold text-emerald-600 hover:text-emerald-700 hover:underline flex items-center gap-0.5 cursor-pointer"
                  >
                    <Plus className="w-3 h-3" /> + Add New Category
                  </button>
                </div>
                <select
                  value={form.category}
                  onChange={(e) => {
                    if (e.target.value === '__add_new__') {
                      setShowAddCategoryModal(true);
                    } else {
                      setForm({ ...form, category: e.target.value });
                    }
                  }}
                  className="w-full px-3 py-2.5 text-xs font-semibold rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white"
                >
                  {allCategoryNames.map((category) => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                  <option value="__add_new__">+ Add New Category...</option>
                </select>
              </div>

              {/* Row 2: Amount + Month / Date Assignment */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Amount (₹) *</label>
                  <input
                    type="number" required min="0" step="0.01" placeholder="e.g. 4500"
                    value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: e.target.value })}
                    className="w-full px-3 py-2.5 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-400 font-bold text-rose-600"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-slate-600">
                      {entryByDate ? 'Specific Date' : 'Assign to Month'} *
                    </label>
                    <button
                      type="button"
                      onClick={() => setEntryByDate(!entryByDate)}
                      className="text-[11px] font-semibold text-emerald-600 hover:text-emerald-700 underline cursor-pointer"
                    >
                      {entryByDate ? 'Assign by Month' : 'Specific Date?'}
                    </button>
                  </div>
                  {!entryByDate ? (
                    <input
                      type="month" required
                      value={form.expenseMonth}
                      onChange={(e) => setForm({ ...form, expenseMonth: e.target.value })}
                      className="w-full px-3 py-2.5 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-emerald-50/20 font-semibold text-slate-800"
                    />
                  ) : (
                    <input
                      type="date" required
                      value={form.expenseDate}
                      onChange={(e) => setForm({ ...form, expenseDate: e.target.value, expenseMonth: e.target.value.slice(0, 7) })}
                      className="w-full px-3 py-2.5 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                    />
                  )}
                </div>
              </div>

              {/* Row 3: Description */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">What was it for? *</label>
                <input
                  type="text" required placeholder="e.g. Water tank cleaning, electrician visit, plumbing"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full px-3 py-2.5 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                />
              </div>

              {/* Row 4: Payee + Mode */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Paid To <span className="text-slate-400 font-normal">(optional)</span></label>
                  <input
                    type="text" placeholder="e.g. Ramesh Painter"
                    value={form.vendorOrPayee}
                    onChange={(e) => setForm({ ...form, vendorOrPayee: e.target.value })}
                    className="w-full px-3 py-2.5 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Payment Method</label>
                  <select
                    value={form.paymentMode}
                    onChange={(e) => setForm({ ...form, paymentMode: e.target.value })}
                    className="w-full px-3 py-2.5 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white"
                  >
                    <option value="Cash">Cash</option>
                    <option value="Bank Transfer">Bank Transfer</option>
                    <option value="Cheque">Cheque</option>
                    <option value="UPI / GPay">UPI / GPay</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => { setShowModal(false); resetForm(); }}
                  className="px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2.5 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 rounded-xl shadow-md shadow-emerald-600/20 active:scale-95 cursor-pointer"
                >
                  {submitting ? 'Saving...' : editingExpenseId ? 'Update Expense' : 'Save Expense'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Mini-Modal to Add New Custom Expense Head / Category */}
      {showAddCategoryModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-scaleUp">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-sm w-full p-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div>
                <h4 className="text-sm font-extrabold text-slate-900">Add New Expense Head</h4>
                <p className="text-[11px] text-slate-500">Will be saved to database for future entries</p>
              </div>
              <button
                type="button"
                onClick={() => { setShowAddCategoryModal(false); setNewCategoryName(''); }}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleCreateCategory();
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Category / Head Name *
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="e.g. Legal Fees, Municipal Tax, Generator..."
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => { setShowAddCategoryModal(false); setNewCategoryName(''); }}
                  className="px-3.5 py-1.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingCategory || !newCategoryName.trim()}
                  className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm disabled:opacity-50 cursor-pointer"
                >
                  {creatingCategory ? 'Saving...' : 'Save & Select'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
