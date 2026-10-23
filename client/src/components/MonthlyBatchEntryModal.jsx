import React, { useState, useEffect } from 'react';
import API from '../services/api';
import { formatCurrency } from '../utils/formatters';
import {
  X, Save, Calendar, Building2, Plus, Trash2, CheckCircle2,
  AlertCircle, RefreshCw, IndianRupee, Receipt, ArrowRight
} from 'lucide-react';

const COMMON_EXPENSE_CATEGORIES = [
  'Maintenance',
  'Property Rent Paid',
  'Electricity & Utilities',
  'Miscellaneous',
  'Medical & Personal',
  'Charity & Religious',
  'Owner Drawings',
  'Donations',
  'Professional Fees',
  'Loan Disbursement',
  'Repairs & Renovation',
  'Deposit Refund'
];

export default function MonthlyBatchEntryModal({
  isOpen,
  onClose,
  initialMonth = '2024-03',
  onDataSaved
}) {
  const [selectedMonth, setSelectedMonth] = useState(initialMonth);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('rent'); // 'rent' | 'expenses'
  const [properties, setProperties] = useState([]);
  const [rentGrid, setRentGrid] = useState([]);
  const [expenseGrid, setExpenseGrid] = useState([]);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Fetch month data when month changes
  const fetchMonthData = async (m) => {
    try {
      setLoading(true);
      setErrorMsg('');
      setSuccessMsg('');
      const res = await API.get(`/reports/monthly-batch-entry?month=${m}`);
      if (res.data.success) {
        setProperties(res.data.properties || []);
        setRentGrid(res.data.rentGrid || []);
        setExpenseGrid(res.data.expenseGrid || []);
      }
    } catch (err) {
      console.error('Failed to load month data:', err);
      setErrorMsg(err.response?.data?.message || 'Failed to load month data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchMonthData(selectedMonth);
    }
  }, [isOpen, selectedMonth]);

  if (!isOpen) return null;

  const handleRentAmountChange = (index, value) => {
    setRentGrid(prev => {
      const next = [...prev];
      next[index] = { ...next[index], amount: Number(value) || 0 };
      return next;
    });
  };

  const handleRentNotesChange = (index, value) => {
    setRentGrid(prev => {
      const next = [...prev];
      next[index] = { ...next[index], notes: value };
      return next;
    });
  };

  const handleExpenseChange = (index, field, value) => {
    setExpenseGrid(prev => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: field === 'amount' ? (Number(value) || 0) : value };
      return next;
    });
  };

  const addExpenseRow = () => {
    setExpenseGrid(prev => [
      ...prev,
      {
        expenseId: null,
        propertyId: properties[0]?._id || null,
        propertyName: properties[0]?.name || 'General / Other',
        category: 'Maintenance',
        amount: 0,
        description: '',
        paymentMode: 'Bank Transfer'
      }
    ]);
  };

  const removeExpenseRow = (index) => {
    setExpenseGrid(prev => prev.filter((_, i) => i !== index));
  };

  // Calculated totals
  const totalRent = rentGrid.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
  const totalExpense = expenseGrid.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  const netCashFlow = totalRent - totalExpense;

  const handleSave = async () => {
    try {
      setSaving(true);
      setErrorMsg('');
      setSuccessMsg('');

      const payload = {
        month: selectedMonth,
        rentEntries: rentGrid.map(r => ({
          unitId: r.unitId,
          tenantId: r.tenantId,
          amount: Number(r.amount || 0),
          receiptId: r.receiptId,
          notes: r.notes
        })),
        expenseEntries: expenseGrid.map(e => ({
          expenseId: e.expenseId,
          propertyId: e.propertyId || null,
          category: e.category,
          amount: Number(e.amount || 0),
          description: e.description,
          paymentMode: e.paymentMode || 'Bank Transfer'
        }))
      };

      const res = await API.post('/reports/monthly-batch-entry', payload);
      if (res.data.success) {
        setSuccessMsg(`Data for ${selectedMonth} saved and synchronized successfully!`);
        await fetchMonthData(selectedMonth);
        if (onDataSaved) {
          onDataSaved();
        }
      }
    } catch (err) {
      console.error('Failed to save monthly data:', err);
      setErrorMsg(err.response?.data?.message || err.message || 'Failed to save month data');
    } finally {
      setSaving(false);
    }
  };

  const monthOptions = [
    '2024-03', '2024-04', '2024-05', '2024-06',
    '2024-07', '2024-08', '2024-09', '2024-10',
    '2024-11', '2024-12', '2025-01', '2025-02',
    '2025-03', '2026-01', '2026-02', '2026-03'
  ];

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white w-full max-w-5xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* Header */}
        <div className="p-5 sm:p-6 bg-slate-900 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 rounded-lg bg-teal-500/20 text-teal-300 font-mono text-xs font-bold border border-teal-500/30">
                Monthly Data Entry
              </span>
              <h3 className="text-lg font-black tracking-tight text-white">
                Enter & Correct Monthly Property Data
              </h3>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Select any month and enter rent received and operational expenses against the correct properties.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Month Picker */}
            <div className="flex items-center gap-2 bg-slate-800 border border-slate-700 px-3 py-1.5 rounded-xl">
              <Calendar className="w-4 h-4 text-teal-400" />
              <label className="text-xs text-slate-300 font-bold">Month:</label>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="bg-transparent text-white font-extrabold text-xs focus:outline-none cursor-pointer"
              >
                {monthOptions.map(m => (
                  <option key={m} value={m} className="bg-slate-900 text-white">
                    {m}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              title="Close (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab Switcher & Feedback */}
        <div className="px-6 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4 shrink-0 text-xs">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('rent')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold transition-all ${
                activeTab === 'rent'
                  ? 'bg-teal-600 text-white shadow-sm'
                  : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200'
              }`}
            >
              <IndianRupee className="w-4 h-4" />
              <span>Rent Received ({rentGrid.filter(r => r.amount > 0).length} active)</span>
            </button>
            <button
              onClick={() => setActiveTab('expenses')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold transition-all ${
                activeTab === 'expenses'
                  ? 'bg-teal-600 text-white shadow-sm'
                  : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200'
              }`}
            >
              <Receipt className="w-4 h-4" />
              <span>Actual Expenses ({expenseGrid.length} items)</span>
            </button>
          </div>

          <div className="flex items-center gap-4 text-xs font-semibold">
            <span className="text-slate-600">Rent: <strong className="text-emerald-700 font-extrabold">{formatCurrency(totalRent)}</strong></span>
            <span className="text-slate-600">Expenses: <strong className="text-rose-700 font-extrabold">{formatCurrency(totalExpense)}</strong></span>
            <span className="text-slate-600">Net: <strong className={netCashFlow >= 0 ? 'text-teal-700 font-extrabold' : 'text-amber-700 font-extrabold'}>{formatCurrency(netCashFlow)}</strong></span>
          </div>
        </div>

        {/* Status Banners */}
        {errorMsg && (
          <div className="mx-6 mt-4 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}
        {successMsg && (
          <div className="mx-6 mt-4 p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Tab Content */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {loading ? (
            <div className="py-20 text-center">
              <RefreshCw className="w-8 h-8 text-teal-600 animate-spin mx-auto mb-3" />
              <p className="text-xs font-semibold text-slate-500">Loading records for {selectedMonth}...</p>
            </div>
          ) : activeTab === 'rent' ? (
            /* Rent Received Table */
            <div className="rounded-xl border border-slate-200 overflow-hidden">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                    <th className="py-3 px-3 w-10 text-center">#</th>
                    <th className="py-3 px-3 min-w-[200px]">Property</th>
                    <th className="py-3 px-3 min-w-[160px]">Unit / Partition</th>
                    <th className="py-3 px-3 min-w-[140px]">Tenant</th>
                    <th className="py-3 px-3 min-w-[140px] text-right">Rent Amount (₹)</th>
                    <th className="py-3 px-3 min-w-[180px]">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rentGrid.map((r, idx) => (
                    <tr key={r.unitId || idx} className="hover:bg-slate-50 transition-colors">
                      <td className="py-2.5 px-3 text-center text-slate-400 font-bold">{idx + 1}</td>
                      <td className="py-2.5 px-3 font-bold text-slate-800">{r.propertyName}</td>
                      <td className="py-2.5 px-3 font-medium text-slate-700">{r.unitName}</td>
                      <td className="py-2.5 px-3 text-slate-500">{r.tenantName}</td>
                      <td className="py-2.5 px-3 text-right">
                        <div className="relative inline-block w-32">
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold">₹</span>
                          <input
                            type="number"
                            step="any"
                            value={r.amount || ''}
                            placeholder="0"
                            onChange={(e) => handleRentAmountChange(idx, e.target.value)}
                            className="w-full pl-6 pr-2 py-1 text-right text-xs font-extrabold bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                          />
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        <input
                          type="text"
                          value={r.notes || ''}
                          placeholder="Optional notes..."
                          onChange={(e) => handleRentNotesChange(idx, e.target.value)}
                          className="w-full px-2.5 py-1 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-teal-500"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            /* Expenses Table */
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700">Property Expenses in {selectedMonth}:</span>
                <button
                  type="button"
                  onClick={addExpenseRow}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold transition-all shadow-sm"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Expense</span>
                </button>
              </div>

              {expenseGrid.length === 0 ? (
                <div className="py-12 text-center text-slate-400 border border-dashed border-slate-200 rounded-xl">
                  <Receipt className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="font-semibold text-slate-600">No expenses recorded for {selectedMonth}.</p>
                  <p className="text-xs">Click &ldquo;Add Expense&rdquo; above to record an expense for this month.</p>
                </div>
              ) : (
                <div className="rounded-xl border border-slate-200 overflow-hidden">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                        <th className="py-3 px-3 w-10 text-center">#</th>
                        <th className="py-3 px-3 min-w-[180px]">Property</th>
                        <th className="py-3 px-3 min-w-[150px]">Category</th>
                        <th className="py-3 px-3 min-w-[200px]">Description</th>
                        <th className="py-3 px-3 min-w-[130px] text-right">Amount (₹)</th>
                        <th className="py-3 px-3 w-12 text-center"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {expenseGrid.map((e, idx) => (
                        <tr key={idx} className="hover:bg-slate-50 transition-colors">
                          <td className="py-2.5 px-3 text-center text-slate-400 font-bold">{idx + 1}</td>
                          <td className="py-2.5 px-3">
                            <select
                              value={e.propertyId || ''}
                              onChange={(ev) => handleExpenseChange(idx, 'propertyId', ev.target.value)}
                              className="w-full px-2 py-1 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-teal-500"
                            >
                              <option value="">General / Other</option>
                              {properties.map(p => (
                                <option key={p._id} value={p._id}>{p.name}</option>
                              ))}
                            </select>
                          </td>
                          <td className="py-2.5 px-3">
                            <select
                              value={e.category}
                              onChange={(ev) => handleExpenseChange(idx, 'category', ev.target.value)}
                              className="w-full px-2 py-1 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-teal-500"
                            >
                              {COMMON_EXPENSE_CATEGORIES.map(cat => (
                                <option key={cat} value={cat}>{cat}</option>
                              ))}
                            </select>
                          </td>
                          <td className="py-2.5 px-3">
                            <input
                              type="text"
                              value={e.description || ''}
                              placeholder="Description..."
                              onChange={(ev) => handleExpenseChange(idx, 'description', ev.target.value)}
                              className="w-full px-2.5 py-1 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-teal-500"
                            />
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <div className="relative inline-block w-28">
                              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold">₹</span>
                              <input
                                type="number"
                                step="any"
                                value={e.amount || ''}
                                placeholder="0"
                                onChange={(ev) => handleExpenseChange(idx, 'amount', ev.target.value)}
                                className="w-full pl-6 pr-2 py-1 text-right text-xs font-extrabold bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-teal-500"
                              />
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <button
                              type="button"
                              onClick={() => removeExpenseRow(idx)}
                              className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                              title="Delete row"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-100 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-slate-600">
            Selected Month: <strong className="text-slate-900">{selectedMonth}</strong> &bull; Total Rent: <strong className="text-emerald-700">{formatCurrency(totalRent)}</strong> &bull; Total Expenses: <strong className="text-rose-700">{formatCurrency(totalExpense)}</strong>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 rounded-xl border border-slate-300 text-slate-600 hover:bg-slate-200 text-xs font-semibold transition-colors"
            >
              Close
            </button>
            <button
              onClick={handleSave}
              disabled={saving || loading}
              className="flex items-center gap-2 px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white text-xs font-bold transition-all shadow-md shadow-teal-600/25 disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? 'Saving Month Data...' : 'Save Month Data'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
