import React, { useState, useEffect, useMemo } from 'react';
import API from '../services/api';
import ApexToolbar from '../components/ApexToolbar';
import * as XLSX from 'xlsx';
import { 
  Tag, Plus, Edit2, Trash2, CheckCircle2, Shield, 
  Layers, RefreshCw, X, AlertCircle, Building2, HelpCircle
} from 'lucide-react';

export default function ExpenseHeadsMasterView() {
  const [categories, setCategories] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(() => {
    return localStorage.getItem('expense_heads_active_tab') || 'all'; // 'all' | 'Property' | 'Common'
  });

  // APEX Toolbar & Search States
  const [search, setSearch] = useState('');
  const [rowsPerPage, setRowsPerPage] = useState('All');
  const [currentPage, setCurrentPage] = useState(1);

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

  // Save active tab in localStorage
  useEffect(() => {
    localStorage.setItem('expense_heads_active_tab', activeTab);
  }, [activeTab]);

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

  // Metric counts
  const propertyHeadsCount = categories.filter(c => c.headType === 'Property').length;
  const commonHeadsCount = categories.filter(c => c.headType === 'Common').length;
  const totalExpensesLogged = expenses.filter(e => !e.isReversed).length;

  // Filter categories by activeTab and search
  const filteredCategories = useMemo(() => {
    return categories.filter(cat => {
      if (activeTab === 'Property' && cat.headType !== 'Property') return false;
      if (activeTab === 'Common' && cat.headType !== 'Common') return false;
      if (search) {
        const q = search.toLowerCase();
        const matchName = cat.name?.toLowerCase().includes(q);
        const matchDesc = cat.description?.toLowerCase().includes(q);
        const matchType = cat.headType?.toLowerCase().includes(q);
        if (!matchName && !matchDesc && !matchType) return false;
      }
      return true;
    });
  }, [categories, activeTab, search]);

  // Pagination
  const paginatedCategories = useMemo(() => {
    if (rowsPerPage === 'All') return filteredCategories;
    const size = Number(rowsPerPage);
    const start = (currentPage - 1) * size;
    return filteredCategories.slice(start, start + size);
  }, [filteredCategories, rowsPerPage, currentPage]);

  const totalPages = rowsPerPage === 'All' ? 1 : Math.ceil(filteredCategories.length / Number(rowsPerPage)) || 1;

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
    const rows = filteredCategories.map((c, idx) => {
      const usage = usageMap[c.name] || { count: 0, totalAmount: 0 };
      return {
        '#': idx + 1,
        'Expense Head Name': c.name,
        'Head Type': c.headType === 'Common' ? 'Common / Other Expense' : 'Property Expense',
        'Scope': c.headType === 'Common' 
          ? 'Visible only for General Common / Other Expenses' 
          : 'Visible only when a specific Property is selected',
        'System Protected': c.isDefault ? 'Yes' : 'No',
        'Times Used in Expenses': usage.count,
        'Total Amount Spent (₹)': usage.totalAmount,
        'Description': c.description || '—',
        'Created Date': c.createdAt ? new Date(c.createdAt).toLocaleDateString() : '—'
      };
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Expense Heads Master');
    XLSX.writeFile(wb, `Expense_Heads_Master_${activeTab}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const columnsDef = [
    { id: 'index', label: '#', defaultVisible: true },
    { id: 'name', label: 'Expense Head Name', defaultVisible: true },
    { id: 'headType', label: 'Head Type & Scope', defaultVisible: true },
    { id: 'usage', label: 'Expenses Logged', defaultVisible: true },
    { id: 'totalAmount', label: 'Total Spent', defaultVisible: true },
    { id: 'isDefault', label: 'Status', defaultVisible: true },
    { id: 'actions', label: 'Actions', defaultVisible: true },
  ];

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-md shadow-indigo-500/20">
              <Tag className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-900 tracking-tight">Expense Heads Master</h1>
              <p className="text-xs font-semibold text-slate-500">
                Manage separated accounting heads for Property maintenance vs. Common / Other expenditures
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchData}
            disabled={loading}
            className="p-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors shadow-2xs"
            title="Refresh list"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={handleOpenCreate}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold text-xs shadow-md shadow-emerald-600/20 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Add Expense Head
          </button>
        </div>
      </div>

      {/* KPI Metric Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-2xs">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total Expense Heads</p>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-2xl font-black text-slate-900">{categories.length}</span>
            <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">All Heads</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-emerald-100 shadow-2xs bg-emerald-50/20">
          <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">Property Expense Heads</p>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-2xl font-black text-emerald-800">{propertyHeadsCount}</span>
            <span className="text-xs font-bold text-emerald-700 bg-emerald-100/70 px-2 py-0.5 rounded-full">Property-Only</span>
          </div>
          <p className="text-[10px] text-emerald-600 mt-1 font-medium">Visible only when a Property is selected</p>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-indigo-100 shadow-2xs bg-indigo-50/20">
          <p className="text-[11px] font-bold uppercase tracking-wider text-indigo-700">Common / Other Heads</p>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-2xl font-black text-indigo-900">{commonHeadsCount}</span>
            <span className="text-xs font-bold text-indigo-700 bg-indigo-100/70 px-2 py-0.5 rounded-full">Common-Only</span>
          </div>
          <p className="text-[10px] text-indigo-600 mt-1 font-medium">MOM, Misc, Zakat, Sadka, Margaret, Other</p>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-2xs">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total Expenses Logged</p>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-2xl font-black text-slate-900">{totalExpensesLogged}</span>
            <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">Records</span>
          </div>
          <p className="text-[10px] text-slate-500 mt-1 font-medium">Active entries mapped across all heads</p>
        </div>
      </div>

      {/* Main Container */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Navigation Tabs */}
        <div className="flex flex-wrap items-center gap-2 p-4 border-b border-slate-200 bg-slate-50/50">
          <button
            onClick={() => { setActiveTab('all'); setCurrentPage(1); }}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'all'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            All Heads ({categories.length})
          </button>

          <button
            onClick={() => { setActiveTab('Property'); setCurrentPage(1); }}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'Property'
                ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-600/20'
                : 'bg-white text-emerald-800 hover:bg-emerald-50 border border-emerald-200'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            Property Expense Heads ({propertyHeadsCount})
          </button>

          <button
            onClick={() => { setActiveTab('Common'); setCurrentPage(1); }}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'Common'
                ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/20'
                : 'bg-white text-indigo-800 hover:bg-indigo-50 border border-indigo-200'
            }`}
          >
            <Tag className="w-3.5 h-3.5" />
            Common / Other Expense Heads ({commonHeadsCount})
          </button>
        </div>

        {/* APEX Toolbar */}
        <div className="p-4 border-b border-slate-100">
          <ApexToolbar
            search={search}
            onSearchChange={(val) => { setSearch(val); setCurrentPage(1); }}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={(val) => { setRowsPerPage(val); setCurrentPage(1); }}
            availableRowsOptions={[10, 25, 50, 'All']}
            columns={columnsDef}
            visibleColumns={columnsDef.map(c => c.id)}
            onExport={handleExportExcel}
            storageKey={`expense_heads_master_${activeTab}`}
          />
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-100/90 text-[11px] font-extrabold text-slate-700 border-b border-slate-200">
                <th className="py-3 px-4 w-12 text-center">#</th>
                <th className="py-3 px-4">Expense Head Name</th>
                <th className="py-3 px-4">Head Scope / Classification</th>
                <th className="py-3 px-4 text-center">Logged Entries</th>
                <th className="py-3 px-4 text-right">Total Spent</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-slate-400">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto text-emerald-500 mb-2" />
                    Loading expense heads...
                  </td>
                </tr>
              ) : paginatedCategories.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-slate-400">
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
                      <td className="py-3.5 px-4 text-center font-bold text-slate-400">{globalIdx}</td>
                      <td className="py-3.5 px-4">
                        <div className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
                          {cat.name}
                          {cat.isDefault && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
                              System
                            </span>
                          )}
                        </div>
                        {cat.description && (
                          <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">{cat.description}</p>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
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
                            ? 'Shown ONLY for General Common / Other Expenses' 
                            : 'Shown ONLY when a Property is selected'}
                        </p>
                      </td>
                      <td className="py-3.5 px-4 text-center font-bold">
                        <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs ${
                          usage.count > 0 ? 'bg-slate-100 text-slate-800' : 'text-slate-400'
                        }`}>
                          {usage.count} {usage.count === 1 ? 'entry' : 'entries'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right font-extrabold text-slate-900">
                        {usage.totalAmount > 0 ? `₹${usage.totalAmount.toLocaleString('en-IN')}` : '₹0'}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md">
                          <CheckCircle2 className="w-3 h-3" /> Active
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleOpenEdit(cat)}
                            className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
                            title="Edit head"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => { setDeletingCategory(cat); setDeleteError(''); }}
                            className="p-1.5 rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 transition-colors"
                            title="Delete head"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
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
            <span>Showing {paginatedCategories.length} of {filteredCategories.length} heads</span>
            <div className="flex items-center gap-2">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                className="px-3 py-1.5 rounded-lg border border-slate-200 disabled:opacity-40"
              >
                Previous
              </button>
              <span className="font-bold text-slate-700">Page {currentPage} of {totalPages}</span>
              <button
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                className="px-3 py-1.5 rounded-lg border border-slate-200 disabled:opacity-40"
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
                onClick={() => setShowModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
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
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 shadow-md shadow-emerald-600/20"
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
                onClick={() => setDeletingCategory(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={deleting}
                className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50 shadow-md shadow-rose-600/20"
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
