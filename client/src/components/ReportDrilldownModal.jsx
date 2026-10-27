import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import API from '../services/api';
import PaymentEditModal from './PaymentEditModal';
import { useModalBackHandler } from '../utils/useModalBackHandler';
import { formatCurrency, formatDate } from '../utils/formatters';
import {
  X, Edit3, Save, Calendar, CheckCircle2, AlertCircle, Plus, Trash2,
  FileText, Building2, User, RefreshCw, IndianRupee, Tag,
  Clock, ArrowUpRight, HelpCircle, Receipt, ExternalLink
} from 'lucide-react';

const DEFAULT_EXPENSE_HEADS = [
  'Maintenance',
  'Electricity & Utilities',
  'Repairs & Renovation',
  'Sweeper & Cleaning',
  'Property Rent Paid',
  'Deposit Refund',
  'Water Charges',
  'Property Tax',
  'MOM',
  'Margaret',
  'Islamic & Zakat',
  'Zakat',
  'Sadka',
  'Send to dubai',
  'IT Fees',
  'Donations',
  'Miscellaneous',
  'Miscellaneous exp',
  'Akbar',
  'Loan asgar Bhati',
  'Loan give to Gafoor',
  'Other'
];

export default function ReportDrilldownModal({
  isOpen,
  onClose,
  target,
  basis,
  onRecordUpdated
}) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [modalReceipt, setModalReceipt] = useState(null);
  const [editExpenseForm, setEditExpenseForm] = useState(null);
  const [categories, setCategories] = useState(DEFAULT_EXPENSE_HEADS);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Browser Back button navigation: dismiss drilldown modal back to the report table
  useModalBackHandler(isOpen, onClose);
  const [successMsg, setSuccessMsg] = useState('');

  const isExpenseTarget = target?.type === 'expense';

  // State for adding new records
  const [propertiesList, setPropertiesList] = useState([]);
  const [assignmentsList, setAssignmentsList] = useState([]);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newExpenseForm, setNewExpenseForm] = useState(null);
  const [newPaymentForm, setNewPaymentForm] = useState(null);

  useEffect(() => {
    if (isOpen) {
      API.get('/properties').then(res => {
        if (res.data?.success && Array.isArray(res.data.data)) setPropertiesList(res.data.data);
        else if (Array.isArray(res.data)) setPropertiesList(res.data);
      }).catch(() => {});

      API.get('/assignments').then(res => {
        if (res.data?.success && Array.isArray(res.data.data)) setAssignmentsList(res.data.data);
        else if (Array.isArray(res.data)) setAssignmentsList(res.data);
      }).catch(() => {});
    }
  }, [isOpen]);

  const openAddNewRecord = () => {
    setErrorMsg('');
    setSuccessMsg('');
    setEditingId(null);
    setEditForm(null);
    setEditExpenseForm(null);
    setIsAddingNew(true);

    const defaultMonth = target.month && target.month !== 'all' ? target.month : new Date().toISOString().slice(0, 7);
    const defaultDate = `${defaultMonth}-01`;

    if (isExpenseTarget) {
      const isCommon = target.propertyId === '__COMMON__' || target.propertyId === 'null';
      const defaultPropId = isCommon ? '' : (target.propertyId || '');
      setNewExpenseForm({
        headType: isCommon ? 'Other' : 'Property',
        propertyId: defaultPropId,
        category: target.category || categories[0] || 'Repairs & Renovation',
        amount: '',
        expenseMonth: defaultMonth,
        expenseDate: defaultDate,
        description: target.category ? `${target.category} expense` : '',

      });
      setNewPaymentForm(null);
    } else {
      const propId = target.propertyId || '';
      const unitId = target.unitId || '';
      const matchingAssigns = assignmentsList.filter(a => {
        if (unitId && String(a.unitId?._id || a.unitId) !== String(unitId)) return false;
        if (propId && String(a.unitId?.propertyId?._id || a.unitId?.propertyId) !== String(propId)) return false;
        return a.status !== 'Cancelled';
      });

      const firstAssign = matchingAssigns[0];
      setNewPaymentForm({
        propertyId: propId || String(firstAssign?.unitId?.propertyId?._id || firstAssign?.unitId?.propertyId || ''),
        unitId: unitId || String(firstAssign?.unitId?._id || firstAssign?.unitId || ''),
        tenantId: String(firstAssign?.tenantId?._id || firstAssign?.tenantId || ''),
        contractNo: firstAssign?.contractNo || firstAssign?.assignmentCode || '',
        amount: firstAssign?.unitId?.monthlyRentExpected || firstAssign?.monthlyRentExpected || '',
        status: 'Rented',
        receiptDate: defaultDate,
        rentMonthYear: defaultMonth,
        comments: `Rent collection for ${defaultMonth}`
      });
      setNewExpenseForm(null);
    }
  };

  const handleSaveNewExpense = async (e) => {
    e.preventDefault();
    if (!newExpenseForm) return;
    try {
      setSaving(true);
      setErrorMsg('');
      const amt = Number(newExpenseForm.amount);
      if (isNaN(amt) || amt <= 0) {
        setErrorMsg('Please enter a valid expense amount.');
        setSaving(false);
        return;
      }
      if (newExpenseForm.headType === 'Property' && !newExpenseForm.propertyId) {
        setErrorMsg('Please select a property for this property expense.');
        setSaving(false);
        return;
      }

      const payload = {
        propertyId: newExpenseForm.headType === 'Property' ? newExpenseForm.propertyId : null,
        category: newExpenseForm.category?.trim() || 'Miscellaneous',
        amount: amt,
        expenseMonth: newExpenseForm.expenseMonth || (target.month || new Date().toISOString().slice(0, 7)),
        expenseDate: newExpenseForm.expenseDate ? new Date(newExpenseForm.expenseDate) : new Date(),
        description: newExpenseForm.description?.trim() || `${newExpenseForm.category} expense`,

      };

      await API.post('/expenses', payload);
      setSuccessMsg('Expense record created successfully!');
      setIsAddingNew(false);
      setNewExpenseForm(null);
      await fetchDrilldown();
      if (onRecordUpdated) onRecordUpdated();
    } catch (err) {
      setErrorMsg(err.response?.data?.message || 'Failed to create expense record.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveNewPayment = async (e) => {
    e.preventDefault();
    if (!newPaymentForm) return;
    try {
      setSaving(true);
      setErrorMsg('');
      const amt = Number(newPaymentForm.amount);
      if (isNaN(amt) || amt <= 0) {
        setErrorMsg('Please enter a valid payment amount.');
        setSaving(false);
        return;
      }
      if (!newPaymentForm.tenantId || !newPaymentForm.unitId) {
        setErrorMsg('Please select a valid tenant & unit for this rent payment.');
        setSaving(false);
        return;
      }

      const m = newPaymentForm.rentMonthYear || target.month || new Date().toISOString().slice(0, 7);
      const isVacant = newPaymentForm.status === 'Vacant';
      const payload = {
        status: newPaymentForm.status || 'Rented',
        tenantId: isVacant ? null : newPaymentForm.tenantId,
        unitId: newPaymentForm.unitId,
        contractNo: isVacant ? '' : (newPaymentForm.contractNo || ''),
        receiptDate: newPaymentForm.receiptDate || new Date().toISOString().split('T')[0],
        totalAmount: amt,
        comments: newPaymentForm.comments || `Rent payment for ${m}`,
        allocations: [{
          rentMonthYear: m,
          allocatedAmount: amt,
          notes: `Rent collection for ${m}`
        }]
      };

      const res = await API.post('/payments', payload);
      if (res.data?.success) {
        setSuccessMsg('Rent payment recorded successfully!');
        setIsAddingNew(false);
        setNewPaymentForm(null);
        await fetchDrilldown();
        if (onRecordUpdated) onRecordUpdated();
      }
    } catch (err) {
      setErrorMsg(err.response?.data?.message || 'Failed to record rent payment.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRecord = async (record, isExpense) => {
    const code = record.receiptNumber || 'this record';
    const amt = formatCurrency(record.totalAmount || record.receiptTotalAmount || 0);
    if (!window.confirm(`Are you sure you want to reverse / delete ${code} (${amt})? This will update the report.`)) {
      return;
    }
    try {
      setSaving(true);
      setErrorMsg('');
      if (isExpense) {
        await API.post(`/expenses/${record.receiptId}/reverse`, {
          reversalReason: 'Reversed from Month Wise Report Drilldown'
        });
      } else {
        await API.post(`/payments/${record.receiptId}/reverse`, {
          reversalReason: 'Reversed from Month Wise Report Drilldown'
        });
      }
      setSuccessMsg(`Record ${code} reversed successfully!`);
      await fetchDrilldown();
      if (onRecordUpdated) onRecordUpdated();
    } catch (err) {
      setErrorMsg(err.response?.data?.message || 'Failed to reverse record.');
    } finally {
      setSaving(false);
    }
  };

  // Fetch expense categories
  useEffect(() => {
    if (isOpen && isExpenseTarget) {
      API.get('/expenses/categories')
        .then(res => {
          if (res.data.success && Array.isArray(res.data.data)) {
            const catNames = res.data.data.map(c => c.name).filter(Boolean);
            const merged = Array.from(new Set([...catNames, ...DEFAULT_EXPENSE_HEADS]));
            setCategories(merged);
          }
        })
        .catch(err => {
          console.error('Failed to load categories:', err);
        });
    }
  }, [isOpen, isExpenseTarget]);

  // Fetch drilldown records
  const fetchDrilldown = async () => {
    if (!target) return;
    try {
      setLoading(true);
      setErrorMsg('');
      const params = new URLSearchParams();
      if (target.propertyId) params.append('propertyId', target.propertyId);
      if (target.unitId) params.append('unitId', target.unitId);
      if (target.month) params.append('month', target.month);
      if (target.year) params.append('year', target.year);
      if (target.startMonth) params.append('startMonth', target.startMonth);
      if (target.endMonth) params.append('endMonth', target.endMonth);
      if (target.type) params.append('type', target.type);
      if (target.category) params.append('category', target.category);
      params.append('basis', basis || 'receiptDate');

      const res = await API.get(`/reports/monthly-drilldown?${params.toString()}`);
      if (res.data.success) {
        setData(res.data);
        if (!res.data.records || res.data.records.length === 0) {
          openAddNewRecord();
        }
      }
    } catch (err) {
      console.error('Failed to fetch drilldown data:', err);
      setErrorMsg(err.response?.data?.message || 'Failed to load transaction records');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && target) {
      setEditingId(null);
      setEditForm(null);
      setEditExpenseForm(null);
      setIsAddingNew(false);
      setErrorMsg('');
      setSuccessMsg('');
      fetchDrilldown();
    }
  }, [isOpen, target, basis]);

  if (!isOpen || !target) return null;

  // ---------------- Payment Receipt Edit Handlers ----------------
  const navigateToEditPayment = (rec) => {
    onClose();
    let targetMonth = rec.accountingMonth || '';
    if (rec.allocations && rec.allocations.length > 0) {
      const sorted = [...rec.allocations].map(a => a.rentMonthYear).filter(Boolean).sort();
      if (sorted.length > 0) targetMonth = sorted[sorted.length - 1];
    } else if (rec.monthsCovered || rec.monthPaidFor) {
      const raw = rec.monthsCovered || rec.monthPaidFor;
      const parts = raw.split(',').map(s => s.trim()).filter(Boolean);
      const valid = parts.filter(p => /^\d{4}-\d{2}$/.test(p)).sort();
      if (valid.length > 0) targetMonth = valid[valid.length - 1];
    }
    if (!targetMonth && rec.receiptDate) {
      targetMonth = new Date(rec.receiptDate).toISOString().slice(0, 7);
    }
    if (!targetMonth) {
      targetMonth = target?.month || '';
    }

    if (targetMonth) {
      localStorage.setItem('payments_selected_month', targetMonth);
    }
    const recId = rec.receiptId || rec._id;
    if (recId) {
      localStorage.setItem('payments_edit_receipt_id', String(recId));
    }
    const uId = rec.unitId?._id || rec.unitId || rec.unit?._id || rec.unit?.unitId;
    if (uId) {
      localStorage.setItem('payments_target_unit_id', String(uId));
    }
    window.location.hash = '#/payments';
    window.dispatchEvent(new PopStateEvent('popstate'));
  };
  const startEditingReceipt = (record) => {
    setErrorMsg('');
    setSuccessMsg('');
    setEditExpenseForm(null);
    setModalReceipt(record);

    const dateStr = record.receiptDate
      ? new Date(record.receiptDate).toISOString().split('T')[0]
      : '';

    setEditForm({
      receiptId: record.receiptId,
      receiptNumber: record.receiptNumber,
      receiptDate: dateStr,
      status: record.status || 'Rented',
      totalAmount: record.receiptTotalAmount || 0,
      comments: record.comments || '',
      allocations: record.allocations && record.allocations.length > 0
        ? record.allocations.map(a => ({
            rentMonthYear: a.rentMonthYear,
            allocatedAmount: a.allocatedAmount,
            notes: a.notes || ''
          }))
        : [{
            rentMonthYear: record.rentMonthYear || target.month || '2026-01',
            allocatedAmount: record.receiptTotalAmount || 0,
            notes: record.comments || ''
          }]
    });
  };

  const handleTotalAmountChange = (newVal) => {
    const val = Number(newVal);
    setEditForm(prev => {
      const updated = { ...prev, totalAmount: val };
      if (prev.allocations.length === 1) {
        updated.allocations = [{
          ...prev.allocations[0],
          allocatedAmount: val
        }];
      }
      return updated;
    });
  };

  const handleAllocationAmountChange = (index, newAmount) => {
    setEditForm(prev => {
      const nextAllocs = [...prev.allocations];
      nextAllocs[index] = {
        ...nextAllocs[index],
        allocatedAmount: Number(newAmount)
      };
      return { ...prev, allocations: nextAllocs };
    });
  };

  const autoBalanceAllocations = () => {
    if (!editForm || editForm.allocations.length === 0) return;
    const count = editForm.allocations.length;
    const splitAmount = Math.round(Number(editForm.totalAmount) / count);
    let remaining = Number(editForm.totalAmount);

    const balanced = editForm.allocations.map((a, idx) => {
      const amt = idx === count - 1 ? remaining : splitAmount;
      remaining -= amt;
      return { ...a, allocatedAmount: amt };
    });

    setEditForm(prev => ({ ...prev, allocations: balanced }));
  };

  const handleSaveReceiptRecord = async (e) => {
    e.preventDefault();
    if (!editForm) return;

    try {
      setSaving(true);
      setErrorMsg('');
      setSuccessMsg('');

      const totalAllocated = editForm.allocations.reduce((sum, a) => sum + Number(a.allocatedAmount || 0), 0);
      if (Math.abs(Number(editForm.totalAmount) - totalAllocated) > 0.01) {
        setErrorMsg(`Allocations sum (₹${totalAllocated.toLocaleString('en-IN')}) must equal the total amount (₹${Number(editForm.totalAmount).toLocaleString('en-IN')})`);
        setSaving(false);
        return;
      }

      const payload = {
        status: editForm.status || 'Rented',
        receiptDate: editForm.receiptDate,
        totalAmount: Number(editForm.totalAmount),
        comments: editForm.comments,
        allocations: editForm.allocations
      };

      const res = await API.put(`/payments/${editForm.receiptId}`, payload);
      if (res.data.success) {
        setSuccessMsg('Record updated and reconciled successfully!');
        setEditingId(null);
        setEditForm(null);

        await fetchDrilldown();
        if (onRecordUpdated) {
          onRecordUpdated();
        }
      }
    } catch (err) {
      console.error('Failed to update receipt:', err);
      setErrorMsg(err.response?.data?.message || err.message || 'Failed to update receipt');
    } finally {
      setSaving(false);
    }
  };

  // ---------------- Expense Edit Handlers ----------------
  const startEditingExpense = (record) => {
    setErrorMsg('');
    setSuccessMsg('');
    setEditForm(null);
    setEditingId(record.receiptId);

    const dateStr = record.receiptDate
      ? new Date(record.receiptDate).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0];

    setEditExpenseForm({
      id: record.receiptId,
      expenseCode: record.receiptNumber,
      amount: record.totalAmount ?? record.receiptTotalAmount ?? 0,
      expenseDate: dateStr,
      category: record.category || 'Maintenance',
      description: record.description || record.comments || '',

    });
  };

  const handleSaveExpenseRecord = async (e) => {
    e.preventDefault();
    if (!editExpenseForm) return;

    try {
      setSaving(true);
      setErrorMsg('');
      setSuccessMsg('');

      const amt = Number(editExpenseForm.amount);
      if (isNaN(amt) || amt <= 0) {
        setErrorMsg('Please enter a valid expense amount greater than 0');
        setSaving(false);
        return;
      }

      const payload = {
        amount: amt,
        expenseDate: editExpenseForm.expenseDate,
        category: editExpenseForm.category,
        description: editExpenseForm.description || '',
        vendorOrPayee: editExpenseForm.vendorOrPayee || '',
        paymentMode: editExpenseForm.paymentMode,
      };

      const res = await API.put(`/expenses/${editExpenseForm.id}`, payload);
      if (res.data.success) {
        setSuccessMsg(`Expense ${editExpenseForm.expenseCode} updated successfully! Report recalculated.`);
        setEditingId(null);
        setEditExpenseForm(null);

        await fetchDrilldown();
        if (onRecordUpdated) {
          onRecordUpdated();
        }
      }
    } catch (err) {
      console.error('Failed to update expense:', err);
      setErrorMsg(err.response?.data?.message || err.message || 'Failed to update expense');
    } finally {
      setSaving(false);
    }
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditForm(null);
    setEditExpenseForm(null);
    setErrorMsg('');
  };

  const modalContent = (
    <div className="fixed inset-0 z-[99999] overflow-y-auto bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Modal Header */}
        <div className={`p-5 sm:p-6 text-white flex items-center justify-between shrink-0 ${
          isExpenseTarget ? 'bg-slate-900 border-b border-rose-950/40' : 'bg-slate-900'
        }`}>
          <div>
            <div className="flex items-center gap-2">
              <span className={`px-2.5 py-1 rounded-lg font-mono text-xs font-bold border ${
                isExpenseTarget
                  ? 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                  : 'bg-teal-500/20 text-teal-300 border-teal-500/30'
              }`}>
                {isExpenseTarget ? 'Expense Drill-Down' : 'Rent Drill-Down'}
              </span>
              <h3 className="text-lg font-black tracking-tight text-white">
                {data?.title || target.title || (isExpenseTarget ? 'Expense Audit' : 'Transaction Audit')}
              </h3>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              {data?.subtitle || `Click 'Edit Record' below to modify any transaction and instantly update the report.`}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={fetchDrilldown}
              disabled={loading}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              title="Refresh Records"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              title="Close (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Feedback / Alert Banners */}
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

        {/* Modal Summary Bar */}
        <div className="px-6 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4 text-xs shrink-0">
          <div className="flex items-center gap-4 text-slate-600">
            <span>
              {isExpenseTarget ? 'Expense Records:' : 'Transactions:'}{' '}
              <strong className="text-slate-900">{data?.count ?? data?.records?.length ?? '—'}</strong>
            </span>
            {!isExpenseTarget && (
              <span>
                Accounting Basis:{' '}
                <strong className="text-teal-700 capitalize">
                  {basis === 'receiptDate' ? 'Collection Date' : 'Allocated Month'}
                </strong>
              </span>
            )}
            {target.month && (
              <span>
                Month: <strong className="text-slate-900 font-bold">{target.month}</strong>
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={openAddNewRecord}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-white font-bold text-xs shadow-sm transition-all cursor-pointer ${
                isExpenseTarget ? 'bg-rose-600 hover:bg-rose-700' : 'bg-teal-600 hover:bg-teal-700'
              }`}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{isExpenseTarget ? '+ Add Expense' : '+ Add Payment'}</span>
            </button>
            <div className="flex items-center gap-2">
              <span className="text-slate-500">Total Filtered Amount:</span>
              <span className={`px-2.5 py-1 rounded-lg font-extrabold text-sm ${
                isExpenseTarget ? 'bg-rose-100 text-rose-900' : 'bg-emerald-100 text-emerald-900'
              }`}>
                {formatCurrency(data?.totalAmount ?? target.expectedAmount ?? 0)}
              </span>
            </div>
          </div>
        </div>

        {/* Scrollable Records Area */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {isAddingNew && (
            <div className="mb-4">
              {isExpenseTarget ? (
                /* New Expense Form */
                <form onSubmit={handleSaveNewExpense} className="p-5 sm:p-6 space-y-4 rounded-2xl border-2 border-rose-400 bg-rose-50/20 shadow-md">
                  <div className="flex items-center justify-between pb-3 border-b border-rose-200">
                    <div>
                      <span className="text-xs font-bold text-rose-700 uppercase tracking-wider">New Expense Record</span>
                      <h4 className="font-extrabold text-sm text-slate-900">
                        Add Expense for {target.title || target.month || 'Selected Period'}
                      </h4>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsAddingNew(false)}
                      className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Form fields */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Expense Head type *</label>
                      <select
                        value={newExpenseForm.headType}
                        onChange={(e) => {
                          const val = e.target.value;
                          setNewExpenseForm(prev => ({
                            ...prev,
                            headType: val,
                            propertyId: (val === 'Other' || val === 'Common') ? '' : (prev.propertyId || propertiesList[0]?._id || '')
                          }));
                        }}
                        className="w-full px-3 py-2 text-xs font-semibold text-slate-900 bg-white border border-slate-300 rounded-xl"
                      >
                        <option value="Property">Property</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>

                    {newExpenseForm.headType === 'Property' && (
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Property *</label>
                        <select
                          required
                          value={newExpenseForm.propertyId}
                          onChange={(e) => setNewExpenseForm(prev => ({ ...prev, propertyId: e.target.value }))}
                          className="w-full px-3 py-2 text-xs font-semibold text-slate-900 bg-white border border-slate-300 rounded-xl"
                        >
                          <option value="">Select Property...</option>
                          {propertiesList.map(p => (
                            <option key={p._id} value={p._id}>{p.name}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Category / Head *</label>
                      <select
                        required
                        value={newExpenseForm.category}
                        onChange={(e) => setNewExpenseForm(prev => ({ ...prev, category: e.target.value }))}
                        className="w-full px-3 py-2 text-xs font-semibold text-slate-900 bg-white border border-slate-300 rounded-xl"
                      >
                        {categories.map(cat => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Amount (₹) *</label>
                      <input
                        type="number"
                        step="any"
                        required
                        placeholder="₹ Amount"
                        value={newExpenseForm.amount}
                        onChange={(e) => setNewExpenseForm(prev => ({ ...prev, amount: e.target.value }))}
                        className="w-full px-3 py-2 text-sm font-bold text-slate-900 bg-white border border-slate-300 rounded-xl font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Expense Date *</label>
                      <input
                        type="date"
                        required
                        value={newExpenseForm.expenseDate}
                        onChange={(e) => setNewExpenseForm(prev => ({ ...prev, expenseDate: e.target.value }))}
                        className="w-full px-3 py-2 text-xs text-slate-900 bg-white border border-slate-300 rounded-xl"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Accounting Month *</label>
                      <input
                        type="month"
                        required
                        value={newExpenseForm.expenseMonth}
                        onChange={(e) => setNewExpenseForm(prev => ({ ...prev, expenseMonth: e.target.value }))}
                        className="w-full px-3 py-2 text-xs text-slate-900 bg-white border border-slate-300 rounded-xl"
                      />
                    </div>



                    
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Description / Notes</label>
                    <input
                      type="text"
                      placeholder="Expense description or note..."
                      value={newExpenseForm.description}
                      onChange={(e) => setNewExpenseForm(prev => ({ ...prev, description: e.target.value }))}
                      className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-xl"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-rose-200">
                    <button
                      type="button"
                      onClick={() => setIsAddingNew(false)}
                      className="px-4 py-2 rounded-xl border border-slate-300 text-slate-600 hover:bg-slate-100 text-xs font-semibold"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={saving}
                      className="flex items-center gap-2 px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-sm"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>{saving ? 'Saving Expense...' : 'Save Expense Record'}</span>
                    </button>
                  </div>
                </form>
              ) : (
                /* New Rent Payment Form */
                <form onSubmit={handleSaveNewPayment} className="p-5 sm:p-6 space-y-4 rounded-2xl border-2 border-teal-400 bg-teal-50/20 shadow-md">
                  <div className="flex items-center justify-between pb-3 border-b border-teal-200">
                    <div>
                      <span className="text-xs font-bold text-teal-700 uppercase tracking-wider">Record Rent Payment</span>
                      <h4 className="font-extrabold text-sm text-slate-900">
                        Record Collection for {target.title || target.month || 'Selected Period'}
                      </h4>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsAddingNew(false)}
                      className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-bold text-slate-700 mb-1">Tenant & Sub-property *</label>
                      <select
                        required
                        value={newPaymentForm.tenantId && newPaymentForm.unitId ? `${newPaymentForm.tenantId}_${newPaymentForm.unitId}` : ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (!val) return;
                          const [tId, uId] = val.split('_');
                          const assign = assignmentsList.find(a => String(a.tenantId?._id || a.tenantId) === tId && String(a.unitId?._id || a.unitId) === uId);
                          setNewPaymentForm(prev => ({
                            ...prev,
                            tenantId: tId,
                            unitId: uId,
                            contractNo: assign?.contractNo || assign?.assignmentCode || '',
                            amount: assign?.unitId?.monthlyRentExpected || assign?.monthlyRentExpected || prev.amount
                          }));
                        }}
                        className="w-full px-3 py-2 text-xs font-semibold text-slate-900 bg-white border border-slate-300 rounded-xl"
                      >
                        <option value="">Select Tenant & Unit...</option>
                        {assignmentsList
                          .filter(a => {
                            if (target.propertyId && target.propertyId !== '__COMMON__' && String(a.unitId?.propertyId?._id || a.unitId?.propertyId) !== String(target.propertyId)) {
                              return false;
                            }
                            if (target.unitId && String(a.unitId?._id || a.unitId) !== String(target.unitId)) {
                              return false;
                            }
                            return a.status !== 'Cancelled';
                          })
                          .map(a => {
                            const tId = String(a.tenantId?._id || a.tenantId);
                            const uId = String(a.unitId?._id || a.unitId);
                            const tName = a.tenantId?.name || 'Tenant';
                            const uName = a.unitId?.subUnitPartition || a.unitId?.unitName || 'Partition';
                            const pName = a.unitId?.propertyId?.name || '';
                            const cNo = a.contractNo || a.assignmentCode || '';
                            return (
                              <option key={a._id} value={`${tId}_${uId}`}>
                                {tName} — {uName} ({pName}) {cNo ? `[${cNo}]` : ''}
                              </option>
                            );
                          })}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Contract No</label>
                      <input
                        type="text"
                        readOnly
                        value={newPaymentForm.contractNo || 'Auto-matched'}
                        className="w-full px-3 py-2 text-xs font-mono font-bold text-slate-600 bg-slate-100 border border-slate-300 rounded-xl"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Amount Paid (₹) *</label>
                      <input
                        type="number"
                        step="any"
                        required
                        placeholder="₹ Amount"
                        value={newPaymentForm.amount}
                        onChange={(e) => setNewPaymentForm(prev => ({ ...prev, amount: e.target.value }))}
                        className="w-full px-3 py-2 text-sm font-bold text-slate-900 bg-white border border-slate-300 rounded-xl font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Payment / Receipt Date *</label>
                      <input
                        type="date"
                        required
                        value={newPaymentForm.receiptDate}
                        onChange={(e) => setNewPaymentForm(prev => ({ ...prev, receiptDate: e.target.value }))}
                        className="w-full px-3 py-2 text-xs text-slate-900 bg-white border border-slate-300 rounded-xl"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Rent Accounting Month *</label>
                      <input
                        type="month"
                        required
                        value={newPaymentForm.rentMonthYear}
                        onChange={(e) => setNewPaymentForm(prev => ({ ...prev, rentMonthYear: e.target.value }))}
                        className="w-full px-3 py-2 text-xs text-slate-900 bg-white border border-slate-300 rounded-xl"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Status</label>
                      <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 rounded-xl">
                        <button
                          type="button"
                          onClick={() => setNewPaymentForm(prev => ({ ...prev, status: 'Rented' }))}
                          className={`py-1.5 px-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                            newPaymentForm.status !== 'Vacant'
                              ? 'bg-emerald-600 text-white shadow-xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          Rented
                        </button>
                        <button
                          type="button"
                          onClick={() => setNewPaymentForm(prev => ({ ...prev, status: 'Vacant', tenantId: '', contractNo: '', amount: '0' }))}
                          className={`py-1.5 px-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                            newPaymentForm.status === 'Vacant'
                              ? 'bg-amber-600 text-white shadow-xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          Vacant
                        </button>
                      </div>
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-xs font-bold text-slate-700 mb-1">Notes / Comments</label>
                      <input
                        type="text"
                        placeholder="Notes, comments..."
                        value={newPaymentForm.comments}
                        onChange={(e) => setNewPaymentForm(prev => ({ ...prev, comments: e.target.value }))}
                        className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-xl"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-teal-200">
                    <button
                      type="button"
                      onClick={() => setIsAddingNew(false)}
                      className="px-4 py-2 rounded-xl border border-slate-300 text-slate-600 hover:bg-slate-100 text-xs font-semibold"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={saving}
                      className="flex items-center gap-2 px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold shadow-sm"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>{saving ? 'Recording Payment...' : 'Record Payment Receipt'}</span>
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {loading ? (
            <div className="py-16 text-center">
              <RefreshCw className={`w-8 h-8 animate-spin mx-auto mb-3 ${isExpenseTarget ? 'text-rose-600' : 'text-teal-600'}`} />
              <p className="text-xs font-semibold text-slate-500">
                Loading underlying {isExpenseTarget ? 'expense' : 'transaction'} records...
              </p>
            </div>
          ) : !data || !data.records || data.records.length === 0 ? (
            <div className="py-12 text-center text-slate-400 space-y-4">
              <FileText className="w-10 h-10 text-slate-300 mx-auto" />
              <div>
                <p className="text-sm font-bold text-slate-700">
                  {isExpenseTarget ? 'No expense records found for this cell.' : 'No payment records found for this cell.'}
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  You can directly add or record transactions for this cell right here.
                </p>
              </div>
              <button
                type="button"
                onClick={openAddNewRecord}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-white font-bold text-xs shadow-md transition-all cursor-pointer ${
                  isExpenseTarget ? 'bg-rose-600 hover:bg-rose-700' : 'bg-teal-600 hover:bg-teal-700'
                }`}
              >
                <Plus className="w-4 h-4" />
                <span>{isExpenseTarget ? 'Add Expense for this Cell' : 'Record Payment for this Cell'}</span>
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {data.records.map((rec, idx) => {
                const isThisRecordEditing = editingId === rec.receiptId;
                const isExpense = rec.isExpense || isExpenseTarget;

                // ---------------- 1. EXPENSE RECORD VIEW & EDIT ----------------
                if (isExpense) {
                  return (
                    <div
                      key={rec.receiptId || idx}
                      className={`rounded-2xl border transition-all ${
                        isThisRecordEditing
                          ? 'border-rose-500 bg-rose-50/20 shadow-md ring-2 ring-rose-500/20'
                          : 'border-slate-200 bg-white hover:border-slate-300 shadow-xs'
                      }`}
                    >
                      {!isThisRecordEditing ? (
                        /* Expense View Card */
                        <div className="p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                          <div className="space-y-1.5 flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-mono text-xs font-bold text-slate-900 px-2.5 py-0.5 rounded-md bg-rose-50 border border-rose-200 text-rose-800">
                                {rec.receiptNumber}
                              </span>
                              <span className="text-xs text-slate-500 flex items-center gap-1">
                                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                                {formatDate(rec.receiptDate)}
                              </span>
                              <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                                  (rec.status || 'Rented') === 'Vacant'
                                    ? 'bg-amber-50 text-amber-800 border border-amber-200'
                                    : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                }`}>
                                  {rec.status || 'Rented'}
                                </span>
                              {rec.category && (
                                <span className="text-xs px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-800 font-bold border border-rose-200">
                                  {rec.category}
                                </span>
                              )}
                            </div>

                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 text-xs">
                              {rec.vendorOrPayee && rec.vendorOrPayee !== '—' && (
                                <span className="font-bold text-slate-800 flex items-center gap-1.5">
                                  <User className="w-3.5 h-3.5 text-slate-400" />
                                  Payee: {rec.vendorOrPayee}
                                </span>
                              )}
                              <span className="text-slate-500 flex items-center gap-1">
                                <Building2 className="w-3.5 h-3.5 text-slate-400" />
                                {rec.property?.name || 'Common / Other'}
                              </span>
                              
                            </div>

                            {rec.description && (
                              <p className="text-xs text-slate-600 italic pt-1 truncate">
                                &ldquo;{rec.description}&rdquo;
                              </p>
                            )}
                          </div>

                          {/* Expense Amount & Edit Button */}
                          <div className="flex items-center justify-between md:flex-col md:items-end gap-2 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-slate-100">
                            <div className="text-left md:text-right">
                              <span className="text-xs text-slate-400 block font-medium">Expense Amount</span>
                              <span className="text-lg font-black text-rose-700">
                                {formatCurrency(rec.totalAmount || rec.receiptTotalAmount || 0)}
                              </span>
                            </div>

                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => startEditingExpense(rec)}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-rose-600 hover:text-white text-slate-700 text-xs font-semibold transition-all shadow-2xs group cursor-pointer"
                              >
                                <Edit3 className="w-3.5 h-3.5 text-slate-500 group-hover:text-white" />
                                <span>Edit Record</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteRecord(rec, true)}
                                className="p-1.5 rounded-xl border border-slate-200 text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                                title="Reverse / Remove Expense"
                              >
                                <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        /* Inline Expense Edit Form */
                        <form onSubmit={handleSaveExpenseRecord} className="p-5 sm:p-6 space-y-4">
                          <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                            <div>
                              <span className="text-xs font-bold text-rose-700 uppercase tracking-wider">Editing Expense Record</span>
                              <h4 className="font-extrabold text-sm text-slate-900 font-mono">
                                {editExpenseForm.expenseCode} &bull; {rec.property?.name || 'Common / Other'}
                              </h4>
                            </div>
                            <span className="text-xs px-2.5 py-1 rounded-lg bg-rose-100 text-rose-800 font-bold border border-rose-200">
                              Direct Correction
                            </span>
                          </div>

                          {/* Row 1: Amount, Date, Category */}
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div>
                              <label className="block text-xs font-bold text-slate-700 mb-1">
                                Expense Amount (₹) *
                              </label>
                              <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-slate-400">₹</span>
                                <input
                                  type="number"
                                  step="any"
                                  required
                                  value={editExpenseForm.amount}
                                  onChange={(e) => setEditExpenseForm(prev => ({ ...prev, amount: e.target.value }))}
                                  className="w-full pl-7 pr-3 py-2 text-sm font-bold text-slate-900 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
                                />
                              </div>
                            </div>

                            <div>
                              <label className="block text-xs font-bold text-slate-700 mb-1">
                                Expense Date *
                              </label>
                              <input
                                type="date"
                                required
                                value={editExpenseForm.expenseDate}
                                onChange={(e) => setEditExpenseForm(prev => ({ ...prev, expenseDate: e.target.value }))}
                                className="w-full px-3 py-2 text-xs font-medium text-slate-900 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
                              />
                            </div>

                            <div>
                              <label className="block text-xs font-bold text-slate-700 mb-1">
                                Expense Head (Category) *
                              </label>
                              <select
                                required
                                value={editExpenseForm.category}
                                onChange={(e) => setEditExpenseForm(prev => ({ ...prev, category: e.target.value }))}
                                className="w-full px-3 py-2 text-xs font-semibold text-slate-900 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 cursor-pointer"
                              >
                                {categories.map(cat => (
                                  <option key={cat} value={cat}>{cat}</option>
                                ))}
                                {!categories.includes(editExpenseForm.category) && (
                                  <option value={editExpenseForm.category}>{editExpenseForm.category}</option>
                                )}
                              </select>
                            </div>
                          </div>

                          

                          {/* Row 3: Description / Reason */}
                          <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1">
                              Description / Reason for Expense
                            </label>
                            <input
                              type="text"
                              value={editExpenseForm.description}
                              onChange={(e) => setEditExpenseForm(prev => ({ ...prev, description: e.target.value }))}
                              placeholder="Enter expense details or description..."
                              className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
                            />
                          </div>

                          {/* Action Buttons */}
                          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
                            <button
                              type="button"
                              onClick={cancelEditing}
                              disabled={saving}
                              className="px-4 py-2 rounded-xl border border-slate-300 text-slate-600 hover:bg-slate-100 text-xs font-semibold transition-colors cursor-pointer"
                            >
                              Cancel
                            </button>
                            <button
                              type="submit"
                              disabled={saving}
                              className="flex items-center gap-2 px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-all shadow-sm shadow-rose-600/25 disabled:opacity-50 cursor-pointer"
                            >
                              <Save className="w-3.5 h-3.5" />
                              <span>{saving ? 'Saving & Reconciling...' : 'Save & Update Report'}</span>
                            </button>
                          </div>
                        </form>
                      )}
                    </div>
                  );
                }

                // ---------------- 2. PAYMENT RECEIPT VIEW & EDIT (EARNINGS) ----------------
                return (
                  <div
                    key={rec.receiptId || idx}
                    className={`rounded-2xl border transition-all ${
                      isThisRecordEditing
                        ? 'border-teal-500 bg-teal-50/20 shadow-md ring-2 ring-teal-500/20'
                        : 'border-slate-200 bg-white hover:border-slate-300 shadow-xs'
                    }`}
                  >
                    {!isThisRecordEditing ? (
                      /* Receipt View Card */
                      <div className="p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="space-y-1.5 flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-xs font-bold text-slate-900 px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200">
                              {rec.receiptNumber}
                            </span>
                            <span className="text-xs text-slate-500 flex items-center gap-1">
                              <Calendar className="w-3.5 h-3.5 text-slate-400" />
                              {formatDate(rec.receiptDate)}
                            </span>
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                                  (rec.status || 'Rented') === 'Vacant'
                                    ? 'bg-amber-50 text-amber-800 border border-amber-200'
                                    : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                }`}>
                                  {rec.status || 'Rented'}
                                </span>
                          </div>

                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 text-xs">
                            <span className="font-bold text-slate-800 flex items-center gap-1.5">
                              <User className="w-3.5 h-3.5 text-slate-400" />
                              {rec.tenant?.name || 'Unknown Tenant'}
                            </span>
                            <span className="text-slate-500 flex items-center gap-1">
                              <Building2 className="w-3.5 h-3.5 text-slate-400" />
                              {rec.property?.name || 'Property'} &bull; <strong className="text-slate-700">{rec.unit?.unitName || rec.unit?.subUnitPartition}</strong>
                            </span>
                          </div>

                          {rec.comments && (
                            <p className="text-xs text-slate-500 italic pt-1 truncate">
                              &ldquo;{rec.comments}&rdquo;
                            </p>
                          )}

                          {rec.allocations && rec.allocations.length > 0 && (
                            <div className="flex flex-wrap items-center gap-1.5 pt-2">
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Allocations:</span>
                              {rec.allocations.map((a, aIdx) => (
                                <span
                                  key={aIdx}
                                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border ${
                                    a.rentMonthYear === target.month
                                      ? 'bg-teal-50 text-teal-800 border-teal-300 font-bold'
                                      : 'bg-slate-50 text-slate-600 border-slate-200'
                                  }`}
                                >
                                  {a.rentMonthYear}: {formatCurrency(a.allocatedAmount)}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Amount & Edit Action */}
                        <div className="flex items-center justify-between md:flex-col md:items-end gap-2 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-slate-100">
                          <div className="text-left md:text-right">
                            <span className="text-xs text-slate-400 block font-medium">
                              {basis === 'allocatedMonth' ? 'Allocated Amount' : 'Receipt Amount'}
                            </span>
                            <span className="text-lg font-black text-emerald-700">
                              {formatCurrency(basis === 'allocatedMonth' ? (rec.allocatedAmount || rec.receiptTotalAmount) : rec.receiptTotalAmount)}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => navigateToEditPayment(rec)}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-teal-50 hover:bg-teal-600 hover:text-white text-teal-800 text-xs font-semibold transition-all shadow-2xs group cursor-pointer border border-teal-200/80"
                              title="Edit in Edit Month / Payment screen"
                            >
                              <Edit3 className="w-3.5 h-3.5 text-teal-600 group-hover:text-white" />
                              <span>Edit Record</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => navigateToEditPayment(rec)}
                              className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900 text-xs font-semibold transition-all shadow-2xs cursor-pointer"
                              title="Open in Edit Month / Payment screen for this month"
                            >
                              <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
                              <span>Rent & Payment</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteRecord(rec, false)}
                              className="p-1.5 rounded-xl border border-slate-200 text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                              title="Reverse / Cancel Payment Receipt"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      /* Inline Receipt Edit Form */
                      <form onSubmit={handleSaveReceiptRecord} className="p-5 sm:p-6 space-y-4">
                        <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                          <div>
                            <span className="text-xs font-bold text-teal-700 uppercase tracking-wider">Correcting Record</span>
                            <h4 className="font-extrabold text-sm text-slate-900 font-mono">
                              {editForm.receiptNumber} &bull; {rec.tenant?.name}
                            </h4>
                          </div>
                          <span className="text-xs text-slate-500">
                            Unit: <strong className="text-slate-800">{rec.unit?.unitName || rec.unit?.subUnitPartition}</strong>
                          </span>
                        </div>

                        {/* Inputs Grid */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1">
                              Total Receipt Amount (₹) *
                            </label>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-slate-400">₹</span>
                              <input
                                type="number"
                                step="any"
                                required
                                value={editForm.totalAmount}
                                onChange={(e) => handleTotalAmountChange(e.target.value)}
                                className="w-full pl-7 pr-3 py-2 text-sm font-bold text-slate-900 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                              />
                            </div>
                          </div>

                          <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1">
                              Receipt Date *
                            </label>
                            <input
                              type="date"
                              required
                              value={editForm.receiptDate}
                              onChange={(e) => setEditForm(prev => ({ ...prev, receiptDate: e.target.value }))}
                              className="w-full px-3 py-2 text-xs font-medium text-slate-900 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1">
                              Status
                            </label>
                            <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 rounded-xl">
                              <button
                                type="button"
                                onClick={() => setEditForm(prev => ({ ...prev, status: 'Rented' }))}
                                className={`py-1.5 px-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                  editForm.status !== 'Vacant'
                                    ? 'bg-emerald-600 text-white shadow-xs'
                                    : 'text-slate-600 hover:text-slate-900'
                                }`}
                              >
                                Rented
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditForm(prev => ({ ...prev, status: 'Vacant' }))}
                                className={`py-1.5 px-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                  editForm.status === 'Vacant'
                                    ? 'bg-amber-600 text-white shadow-xs'
                                    : 'text-slate-600 hover:text-slate-900'
                                }`}
                              >
                                Vacant
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Allocations Breakdown Editor */}
                        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-700">Month Allocations Breakdown:</span>
                            {editForm.allocations.length > 1 && (
                              <button
                                type="button"
                                onClick={autoBalanceAllocations}
                                className="text-[11px] font-semibold text-teal-600 hover:text-teal-800 cursor-pointer"
                              >
                                Auto-Split Evenly
                              </button>
                            )}
                          </div>

                          <div className="space-y-2">
                            {editForm.allocations.map((alloc, aIdx) => (
                              <div key={aIdx} className="flex items-center gap-2">
                                <span className="w-24 text-xs font-mono font-bold text-slate-700 bg-white px-2 py-1.5 rounded-lg border border-slate-200">
                                  {alloc.rentMonthYear}
                                </span>
                                <div className="relative flex-1">
                                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">₹</span>
                                  <input
                                    type="number"
                                    step="any"
                                    required
                                    value={alloc.allocatedAmount}
                                    onChange={(e) => handleAllocationAmountChange(aIdx, e.target.value)}
                                    className="w-full pl-6 pr-3 py-1.5 text-xs font-bold bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-teal-500"
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Notes / Comments */}
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">
                            Comments / Reason for Correction
                          </label>
                          <input
                            type="text"
                            value={editForm.comments}
                            onChange={(e) => setEditForm(prev => ({ ...prev, comments: e.target.value }))}
                            placeholder="Enter notes or audit reason..."
                            className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                          />
                        </div>

                        {/* Form Buttons */}
                        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
                          <button
                            type="button"
                            onClick={cancelEditing}
                            disabled={saving}
                            className="px-4 py-2 rounded-xl border border-slate-300 text-slate-600 hover:bg-slate-100 text-xs font-semibold transition-colors cursor-pointer"
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            disabled={saving}
                            className="flex items-center gap-2 px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold transition-all shadow-sm shadow-teal-600/25 disabled:opacity-50 cursor-pointer"
                          >
                            <Save className="w-3.5 h-3.5" />
                            <span>{saving ? 'Saving & Reconciling...' : 'Save & Update Report'}</span>
                          </button>
                        </div>
                      </form>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* SHARED FULL-SCREEN PAYMENT EDIT MODAL */}
        {modalReceipt && (
          <PaymentEditModal
            isOpen={Boolean(modalReceipt)}
            onClose={() => setModalReceipt(null)}
            receiptId={modalReceipt.receiptId || modalReceipt._id}
            receipt={modalReceipt}
            selectedMonth={modalReceipt.accountingMonth || modalReceipt.rentMonthYear || target?.month || ''}
            backButtonLabel="Back to Monthly Report"
            onSuccess={async () => {
              setModalReceipt(null);
              await fetchDrilldown();
              if (onRecordUpdated) onRecordUpdated();
            }}
            onNavigateToPayments={(rec) => {
              setModalReceipt(null);
              onClose();
              const targetMonth = rec.accountingMonth || (rec.receiptDate ? String(rec.receiptDate).slice(0, 7) : target?.month);
              if (targetMonth) {
                localStorage.setItem('payments_selected_month', targetMonth);
              }
              window.location.hash = '#/payments';
              window.dispatchEvent(new PopStateEvent('popstate'));
            }}
          />
        )}

        {/* Modal Footer */}
        <div className="p-4 bg-slate-100 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500 shrink-0">
          <span>Clicking &ldquo;Save & Update Report&rdquo; immediately saves to the database and recalculates the matrix numbers in real time.</span>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold transition-colors cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
}
