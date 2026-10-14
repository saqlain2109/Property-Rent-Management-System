import React, { useState, useEffect } from 'react';
import API from '../services/api';
import { formatCurrency, formatDate } from '../utils/formatters';
import ColumnManager from '../components/ColumnManager';
import { Receipt, Plus, Search, RotateCcw, Tag, X, Edit2, Trash2 } from 'lucide-react';

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
  { id: 'date', label: 'Date' },
  { id: 'property', label: 'Property' },
  { id: 'category', label: 'Expense Type' },
  { id: 'description', label: 'What it was for' },
  { id: 'payee', label: 'Paid To / Mode' },
  { id: 'amount', label: 'Amount' },
  { id: 'actions', label: 'Action' }
];

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
    return saved ? JSON.parse(saved) : EXPENSES_COLUMNS_DEF.map(c => c.id);
  });

  const [form, setForm] = useState({
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
    setForm({
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
      if (editingExpenseId) {
        const res = await API.put(`/expenses/${editingExpenseId}`, form);
        if (res.data.success) {
          setShowModal(false);
          resetForm();
          fetchData();
        }
      } else {
        const res = await API.post('/expenses', form);
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
      e.propertyId?.name?.toLowerCase().includes(search.toLowerCase());

    const matchesCategory = !categoryFilter || e.category === categoryFilter;
    const matchesProp = !propertyFilter || e.propertyId?._id === propertyFilter || e.propertyId?.name === propertyFilter;

    return matchesSearch && matchesCategory && matchesProp;
  });

  const totalShown = filtered.reduce((s, e) => s + (e.isReversed ? 0 : e.amount), 0);
  const allCategories = categories.length > 0 
    ? categories.map(c => (typeof c === 'string' ? c : c.name || c._id))
    : CATEGORY_OPTIONS;

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

        {/* Property Filter */}
        <select
          value={propertyFilter}
          onChange={(e) => setPropertyFilter(e.target.value)}
          className="text-xs font-semibold px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400 cursor-pointer"
        >
          <option value="">All Properties</option>
          {properties.map(p => (
            <option key={p._id} value={p._id}>{p.name}</option>
          ))}
        </select>

        {/* Category Filter */}
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="text-xs font-semibold px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400 cursor-pointer"
        >
          <option value="">All Expense Types</option>
          {allCategories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        {/* Column Manager */}
        <ColumnManager
          columns={EXPENSES_COLUMNS_DEF}
          visibleColumns={visibleColumns}
          onChangeVisible={setVisibleColumns}
          storageKey="expenses"
        />

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
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr className="text-[11px] text-slate-400 uppercase tracking-wide font-semibold">
                  {visibleColumns.map(colId => {
                    if (colId === 'date') return <th key={colId} className="px-5 py-3.5">Date</th>;
                    if (colId === 'property') return <th key={colId} className="px-5 py-3.5">Property</th>;
                    if (colId === 'category') return <th key={colId} className="px-5 py-3.5">Expense Type</th>;
                    if (colId === 'description') return <th key={colId} className="px-5 py-3.5">What it was for</th>;
                    if (colId === 'payee') return <th key={colId} className="px-5 py-3.5">Paid To / Method</th>;
                    if (colId === 'amount') return <th key={colId} className="px-5 py-3.5 text-right">Amount</th>;
                    if (colId === 'actions') return <th key={colId} className="px-5 py-3.5 text-center">Action</th>;
                    return null;
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((e) => (
                  <tr key={e._id} className={`hover:bg-slate-50/60 transition-colors ${e.isReversed ? 'opacity-50' : ''}`}>
                    {visibleColumns.map(colId => {
                      if (colId === 'date') {
                        return <td key={colId} className="px-5 py-3.5 text-xs text-slate-500 whitespace-nowrap">{formatDate(e.expenseDate)}</td>;
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
                            <div className="flex items-center justify-center gap-1.5">
                              {!e.isReversed && (
                                <>
                                  <button
                                    onClick={() => {
                                      setEditingExpenseId(e._id);
                                      setForm({
                                        expenseDate: e.expenseDate ? new Date(e.expenseDate).toISOString().split('T')[0] : '',
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
                                    className="p-1.5 text-slate-400 hover:text-emerald-700 hover:bg-slate-100 rounded-lg transition-colors"
                                  >
                                    <Edit2 className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => handleReverse(e._id)}
                                    title="Cancel/Reverse Expense"
                                    className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
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
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Date</label>
                  <input
                    type="date" required
                    value={form.expenseDate}
                    onChange={(e) => setForm({ ...form, expenseDate: e.target.value })}
                    className="w-full px-3 py-2.5 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Property</label>
                  <select
                    value={form.propertyId}
                    onChange={(e) => setForm({ ...form, propertyId: e.target.value })}
                    className="w-full px-3 py-2.5 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white"
                  >
                    <option value="">General (No property)</option>
                    {properties.map(p => (
                      <option key={p._id} value={p._id}>{p.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Expense Type</label>
                  <select
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    className="w-full px-3 py-2.5 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white"
                  >
                    {allCategories.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Amount (₹)</label>
                  <input
                    type="number" required placeholder="e.g. 4500"
                    value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: e.target.value })}
                    className="w-full px-3 py-2.5 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-400 font-bold text-rose-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">What it was for</label>
                <input
                  type="text" required placeholder="e.g. Water tank cleaning, electrician visit"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full px-3 py-2.5 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Paid To (optional)</label>
                  <input
                    type="text" placeholder="e.g. Ramesh Painter"
                    value={form.vendorOrPayee}
                    onChange={(e) => setForm({ ...form, vendorOrPayee: e.target.value })}
                    className="w-full px-3 py-2.5 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">How was it paid?</label>
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
