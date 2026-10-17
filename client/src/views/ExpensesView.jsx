import React, { useState, useEffect } from 'react';
import API from '../services/api';
import { formatCurrency, formatDate, formatMonthYear } from '../utils/formatters';
import ColumnManager, { getHeaderDragProps, useResizableColumns, ResizeHandle } from '../components/ColumnManager';
import SearchableSelect from '../components/SearchableSelect';
import { Plus, Search, RotateCcw, X, Edit2, Trash2 } from 'lucide-react';

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
  'Maintenance': 'bg-blue-100 text-blue-700',
  'Electricity & Utilities': 'bg-yellow-100 text-yellow-700',
  'Property Rent Paid': 'bg-purple-100 text-purple-700',
  'Deposit Refund': 'bg-teal-100 text-teal-700',
  'Repair': 'bg-orange-100 text-orange-700',
  'Cleaning': 'bg-cyan-100 text-cyan-700',
  'Security': 'bg-indigo-100 text-indigo-700',
  'Miscellaneous': 'bg-slate-100 text-slate-600',
};

const EXPENSES_COLUMNS_DEF = [
  { id: 'date', label: 'Date', defaultVisible: true },
  { id: 'property', label: 'Property', defaultVisible: true },
  { id: 'category', label: 'Expense Type', defaultVisible: true },
  { id: 'description', label: 'What it was for', defaultVisible: true },
  { id: 'payee', label: 'Paid To / Mode', defaultVisible: true },
  { id: 'amount', label: 'Amount', defaultVisible: true },
  { id: 'actions', label: 'Action', defaultVisible: true }
];

// Screen-fitting default column widths to ensure ZERO horizontal scrolling by default!
const DEFAULT_EXPENSES_COLUMN_WIDTHS = {
  date: 95,
  property: 140,
  category: 130,
  description: 220,
  payee: 130,
  amount: 105,
  actions: 95
};

export default function ExpensesView() {
  const [expenses, setExpenses] = useState([]);
  const [categories, setCategories] = useState([]);
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [propertyFilter, setPropertyFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingExpenseId, setEditingExpenseId] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const [visibleColumns, setVisibleColumns] = useState(() => {
    const saved = localStorage.getItem('cols_expenses');
    if (!saved) return EXPENSES_COLUMNS_DEF.map(c => c.id);
    try {
      const allowed = EXPENSES_COLUMNS_DEF.map((column) => column.id);
      return JSON.parse(saved).filter((column) => allowed.includes(column));
    } catch {
      return EXPENSES_COLUMNS_DEF.map(c => c.id);
    }
  });

  const {
    columnWidths,
    handleResizeStart,
    resetColumnWidths,
    hasCustomWidths
  } = useResizableColumns('expenses', DEFAULT_EXPENSES_COLUMN_WIDTHS);

  const [entryByDate, setEntryByDate] = useState(false);
  const [monthFilter, setMonthFilter] = useState('');

  const getInitialMonth = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  };

  const [form, setForm] = useState({
    expenseMonth: getInitialMonth(),
    expenseDate: new Date().toISOString().split('T')[0],
    propertyId: '',
    category: 'Maintenance',
    amount: '',
    description: '',
    vendorOrPayee: '',
    paymentMode: 'Cash',
  });

  const fetchData = async () => {
    try {
      setLoading(true);
      const [eRes, cRes, pRes] = await Promise.all([
        API.get('/expenses'),
        API.get('/expenses/categories'),
        API.get('/properties'),
      ]);
      if (eRes.data.success) setExpenses(eRes.data.data);
      if (cRes.data.success) setCategories(cRes.data.data);
      if (pRes.data.success) setProperties(pRes.data.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const resetForm = () => {
    setEditingExpenseId(null);
    setEntryByDate(false);
    setForm({
      expenseMonth: getInitialMonth(),
      expenseDate: new Date().toISOString().split('T')[0],
      propertyId: '',
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

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      const categoryName = form.category.trim();
      const existingCategory = [...CATEGORY_OPTIONS, ...categories.map((category) => (
        typeof category === 'string' ? category : category.name
      ))].some((category) => category?.toLowerCase() === categoryName.toLowerCase());
      if (!existingCategory) {
        try {
          const categoryRes = await API.post('/expenses/categories', { name: categoryName });
          if (categoryRes.data.success) {
            setCategories((current) => [...current, categoryRes.data.data]);
          }
        } catch (error) {
          const isDuplicate = error.response?.status === 400 &&
            error.response?.data?.message === 'Category already exists';
          if (!isDuplicate) throw error;
        }
      }
      const payload = {
        ...form,
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

  const filtered = expenses.filter((e) => {
    const matchesSearch =
      !search ||
      e.description?.toLowerCase().includes(search.toLowerCase()) ||
      e.vendorOrPayee?.toLowerCase().includes(search.toLowerCase()) ||
      e.propertyId?.name?.toLowerCase().includes(search.toLowerCase()) ||
      e.category?.toLowerCase().includes(search.toLowerCase());

    const matchesCategory = !categoryFilter || e.category === categoryFilter;
    const matchesProp = !propertyFilter || String(e.propertyId?._id || e.propertyId || '') === propertyFilter;
    const expM = e.expenseMonth || (e.expenseDate ? e.expenseDate.slice(0, 7) : '');
    const matchesMonth = !monthFilter || expM === monthFilter;

    return matchesSearch && matchesCategory && matchesProp && matchesMonth;
  });

  const totalShown = filtered.reduce((s, e) => s + (e.isReversed ? 0 : e.amount), 0);
  const allCategories = [...new Set([
    ...CATEGORY_OPTIONS,
    ...categories.map(c => (typeof c === 'string' ? c : c.name)).filter(Boolean)
  ])].sort((a, b) => a.localeCompare(b));

  const availableExpenseMonths = [...new Set(
    expenses.map(e => e.expenseMonth || (e.expenseDate ? e.expenseDate.slice(0, 7) : '')).filter(Boolean)
  )].sort().reverse();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 sm:p-6 rounded-2xl shadow-sm border border-slate-200">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900">Expenses</h2>
          <p className="text-sm text-slate-500 mt-0.5">Track property costs, maintenance, repairs, and bills</p>
        </div>
        <button
          onClick={handleOpenCreate}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold transition-all shadow-md shadow-emerald-600/20 active:scale-95"
        >
          <Plus className="w-4 h-4" />
          Add Expense
        </button>
      </div>

      {/* Filter and Column Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm">
        {/* Search */}
        <div className="flex items-center gap-2.5 flex-1 bg-slate-50 px-3.5 py-2 rounded-xl border border-slate-200/80">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            type="text"
            placeholder="Search description, payee, or property..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 text-xs sm:text-sm bg-transparent border-none focus:outline-none text-slate-800 placeholder:text-slate-400"
          />
          {search && (
            <button onClick={() => setSearch('')} className="text-slate-400 hover:text-slate-600">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <SearchableSelect
          className="w-full sm:w-56"
          value={propertyFilter}
          onChange={setPropertyFilter}
          placeholder="All Properties"
          searchPlaceholder="Search properties..."
          options={properties.map((property) => ({ value: property._id, label: property.name }))}
        />

        <SearchableSelect
          className="w-full sm:w-44"
          value={monthFilter}
          onChange={setMonthFilter}
          placeholder="All Months"
          searchPlaceholder="Search month..."
          options={availableExpenseMonths.map((m) => ({ value: m, label: formatMonthYear(m) }))}
        />

        <SearchableSelect
          className="w-full sm:w-52"
          value={categoryFilter}
          onChange={setCategoryFilter}
          placeholder="All Expense Types"
          searchPlaceholder="Search expense types..."
          options={allCategories.map((category) => ({ value: category, label: category }))}
        />

        {/* Column Manager & Reset */}
        <div className="flex items-center gap-2">
          <ColumnManager
            columns={EXPENSES_COLUMNS_DEF}
            visibleColumns={visibleColumns}
            onChangeVisible={setVisibleColumns}
            storageKey="expenses"
            onResetWidths={resetColumnWidths}
          />
          <button
            type="button"
            onClick={resetColumnWidths}
            className="flex items-center gap-1.5 px-2.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-900 text-xs font-bold transition-all shadow-xs"
            title="Reset column widths"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Reset Widths</span>
          </button>
        </div>

        <div className="sm:ml-auto text-xs font-semibold text-slate-700 whitespace-nowrap pl-1">
          Total: <span className="text-rose-600 font-bold">{formatCurrency(totalShown)}</span>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-slate-400 text-sm">Loading expenses...</div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-slate-400 text-sm">
            No expenses found. {search || categoryFilter || propertyFilter ? 'Try clearing your filters.' : 'Click "Add Expense" to get started.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table
              className="w-full text-left text-sm border-collapse table-fixed"
              style={{ minWidth: `${visibleColumns.reduce((sum, colId) => sum + (columnWidths[colId] || DEFAULT_EXPENSES_COLUMN_WIDTHS[colId] || 100), 0)}px` }}
            >
              <colgroup>
                {visibleColumns.map(colId => (
                  <col
                    key={colId}
                    style={{ width: `${columnWidths[colId] || DEFAULT_EXPENSES_COLUMN_WIDTHS[colId] || 100}px` }}
                  />
                ))}
              </colgroup>
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr className="text-[11px] text-slate-500 uppercase tracking-wide font-extrabold select-none">
                  {visibleColumns.map(colId => {
                    const dragProps = getHeaderDragProps(colId, visibleColumns, setVisibleColumns, 'expenses');
                    const width = columnWidths[colId] || DEFAULT_EXPENSES_COLUMN_WIDTHS[colId] || 100;
                    let label = colId;
                    let align = 'text-left';
                    if (colId === 'date') label = 'Date';
                    else if (colId === 'property') label = 'Property';
                    else if (colId === 'category') label = 'Expense Type';
                    else if (colId === 'description') label = 'What it was for';
                    else if (colId === 'payee') label = 'Paid To / Method';
                    else if (colId === 'amount') { label = 'Amount'; align = 'text-right'; }
                    else if (colId === 'actions') { label = 'Action'; align = 'text-center'; }

                    return (
                      <th
                        key={colId}
                        {...dragProps}
                        style={{ width: `${width}px` }}
                        className={`px-4 py-3.5 border-r border-slate-200 relative group ${align}`}
                      >
                        <span className="truncate block pr-2">{label}</span>
                        <ResizeHandle colId={colId} onResizeStart={handleResizeStart} />
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((e) => (
                  <tr key={e._id} className={`hover:bg-slate-50/60 transition-colors ${e.isReversed ? 'opacity-50' : ''}`}>
                    {visibleColumns.map(colId => {
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
                            {e.propertyId?.name || <span className="text-slate-400 italic font-normal">General</span>}
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
                                      const mStr = e.expenseMonth || (dStr ? dStr.slice(0, 7) : getInitialMonth());
                                      setEntryByDate(Boolean(dStr && !dStr.endsWith('-01')));
                                      setForm({
                                        expenseMonth: mStr,
                                        expenseDate: dStr,
                                        propertyId: e.propertyId?._id || e.propertyId || '',
                                        category: e.category || 'Maintenance',
                                        amount: String(e.amount),
                                        description: e.description || '',
                                        vendorOrPayee: e.vendorOrPayee || '',
                                        paymentMode: e.paymentMode || 'Cash',
                                      });
                                      setShowModal(true);
                                    }}
                                    title="Edit Expense"
                                    className="p-1.5 text-slate-400 hover:text-emerald-700 hover:bg-slate-100 rounded-lg transition-colors shrink-0"
                                  >
                                    <Edit2 className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => handleReverse(e._id)}
                                    title="Cancel/Reverse Expense"
                                    className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors shrink-0"
                                  >
                                    <RotateCcw className="w-3.5 h-3.5" />
                                  </button>
                                </>
                              )}
                              <button
                                onClick={() => handleDeleteExpense(e._id)}
                                title="Permanently Delete Expense"
                                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
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

      {/* Add / Edit Expense Modal */}
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
              <button onClick={() => { setShowModal(false); resetForm(); }} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              {/* Row 1: Property + Expense Type */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <SearchableSelect
                    label="Property"
                    placeholder="General (No property)"
                    searchPlaceholder="Search properties..."
                    options={properties.map((property) => ({ value: property._id, label: property.name }))}
                    value={form.propertyId}
                    onChange={(propertyId) => setForm((prev) => ({ ...prev, propertyId }))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Expense Type *</label>
                  <input
                    type="text"
                    list="expense-category-options"
                    required
                    placeholder="Select or type new..."
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    className="w-full px-3 py-2.5 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white"
                  />
                  <datalist id="expense-category-options">
                    {allCategories.map((category) => <option key={category} value={category} />)}
                  </datalist>
                  <p className="mt-1 text-[11px] text-slate-400">Choose from list or type custom value</p>
                </div>
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
                  <p className="mt-1 text-[11px] text-slate-400">
                    {!entryByDate ? 'Assigned directly to selected month' : 'Specific day within month'}
                  </p>
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
                  className="px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2.5 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 rounded-xl shadow-md shadow-emerald-600/20 active:scale-95"
                >
                  {submitting ? 'Saving...' : editingExpenseId ? 'Update Expense' : 'Save Expense'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
