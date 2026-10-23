import React, { useState, useEffect } from 'react';
import API from '../services/api';
import { formatCurrency, formatDate } from '../utils/formatters';
import {
  X, Edit3, Save, Calendar, CheckCircle2, AlertCircle,
  FileText, Building2, User, RefreshCw, IndianRupee, Tag,
  Clock, ArrowUpRight, HelpCircle
} from 'lucide-react';

export default function ReportDrilldownModal({
  isOpen,
  onClose,
  target,
  basis,
  onRecordUpdated
}) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [editingReceiptId, setEditingReceiptId] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

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
      params.append('basis', basis || 'receiptDate');

      const res = await API.get(`/reports/monthly-drilldown?${params.toString()}`);
      if (res.data.success) {
        setData(res.data);
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
      setEditingReceiptId(null);
      setEditForm(null);
      setErrorMsg('');
      setSuccessMsg('');
      fetchDrilldown();
    }
  }, [isOpen, target, basis]);

  if (!isOpen || !target) return null;

  // Initialize edit form
  const startEditing = (record) => {
    setErrorMsg('');
    setSuccessMsg('');
    setEditingReceiptId(record.receiptId);

    const dateStr = record.receiptDate
      ? new Date(record.receiptDate).toISOString().split('T')[0]
      : '';

    setEditForm({
      receiptId: record.receiptId,
      receiptNumber: record.receiptNumber,
      receiptDate: dateStr,
      totalAmount: record.receiptTotalAmount || 0,
      paymentMode: record.paymentMode || 'Cash',
      referenceNumber: record.referenceNumber || '',
      bankName: record.bankName || '',
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

  const cancelEditing = () => {
    setEditingReceiptId(null);
    setEditForm(null);
    setErrorMsg('');
  };

  // Adjust allocations when total changes
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

  const handleSaveRecord = async (e) => {
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
        receiptDate: editForm.receiptDate,
        totalAmount: Number(editForm.totalAmount),
        paymentMode: editForm.paymentMode,
        referenceNumber: editForm.referenceNumber,
        bankName: editForm.bankName,
        comments: editForm.comments,
        allocations: editForm.allocations
      };

      const res = await API.put(`/payments/${editForm.receiptId}`, payload);
      if (res.data.success) {
        setSuccessMsg('Record updated and reconciled successfully!');
        setEditingReceiptId(null);
        setEditForm(null);

        // Refresh drilldown data
        await fetchDrilldown();

        // Notify parent report to update live numbers
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

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Modal Header */}
        <div className="p-5 sm:p-6 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 rounded-lg bg-teal-500/20 text-teal-300 font-mono text-xs font-bold border border-teal-500/30">
                Drill-Down
              </span>
              <h3 className="text-lg font-black tracking-tight text-white">
                {data?.title || target.title || 'Transaction Audit'}
              </h3>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              {data?.subtitle || `Click on any transaction below to edit and correct amounts`}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={fetchDrilldown}
              disabled={loading}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              title="Refresh Transactions"
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

        {/* Status / Feedback Banner */}
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
            <span>Transactions: <strong className="text-slate-900">{data?.count ?? '—'}</strong></span>
            <span>Accounting Basis: <strong className="text-teal-700 capitalize">{basis === 'receiptDate' ? 'Collection Date' : 'Allocated Month'}</strong></span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-slate-500">Total Filtered Amount:</span>
            <span className="px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-900 font-extrabold text-sm">
              {formatCurrency(data?.totalAmount ?? target.expectedAmount ?? 0)}
            </span>
          </div>
        </div>

        {/* Modal Scrollable Content */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {loading ? (
            <div className="py-16 text-center">
              <RefreshCw className="w-8 h-8 text-teal-600 animate-spin mx-auto mb-3" />
              <p className="text-xs font-semibold text-slate-500">Loading underlying transaction records...</p>
            </div>
          ) : !data || data.records.length === 0 ? (
            <div className="py-12 text-center text-slate-400 space-y-2">
              <FileText className="w-10 h-10 text-slate-300 mx-auto" />
              <p className="text-sm font-semibold text-slate-600">No payment records found for this cell.</p>
              <p className="text-xs text-slate-400">There are no recorded receipts or allocations matching this criteria.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {data.records.map((rec, idx) => {
                const isEditing = editingReceiptId === rec.receiptId;

                return (
                  <div
                    key={rec.receiptId || idx}
                    className={`rounded-2xl border transition-all ${
                      isEditing
                        ? 'border-teal-500 bg-teal-50/20 shadow-md ring-2 ring-teal-500/20'
                        : 'border-slate-200 bg-white hover:border-slate-300 shadow-xs'
                    }`}
                  >
                    {/* View Card */}
                    {!isEditing ? (
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
                            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium">
                              {rec.paymentMode}
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

                          {/* Allocation tags if multi-month */}
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
                            <span className="text-xs text-slate-400 block">
                              {basis === 'allocatedMonth' ? 'Allocated Amount' : 'Receipt Amount'}
                            </span>
                            <span className="text-lg font-black text-slate-900 text-emerald-700">
                              {formatCurrency(basis === 'allocatedMonth' ? (rec.allocatedAmount || rec.receiptTotalAmount) : rec.receiptTotalAmount)}
                            </span>
                          </div>

                          <button
                            type="button"
                            onClick={() => startEditing(rec)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-teal-600 hover:text-white text-slate-700 text-xs font-semibold transition-all shadow-2xs group"
                          >
                            <Edit3 className="w-3.5 h-3.5 text-slate-500 group-hover:text-white" />
                            <span>Edit Record</span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* Inline Edit Form */
                      <form onSubmit={handleSaveRecord} className="p-5 sm:p-6 space-y-4">
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
                              Payment Mode
                            </label>
                            <select
                              value={editForm.paymentMode}
                              onChange={(e) => setEditForm(prev => ({ ...prev, paymentMode: e.target.value }))}
                              className="w-full px-3 py-2 text-xs font-medium text-slate-900 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 cursor-pointer"
                            >
                              <option value="Bank Transfer / NEFT / RTGS">Bank Transfer / NEFT / RTGS</option>
                              <option value="Cash">Cash</option>
                              <option value="Cheque">Cheque</option>
                              <option value="UPI">UPI</option>
                              <option value="Other">Other</option>
                            </select>
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
                                className="text-[11px] font-semibold text-teal-600 hover:text-teal-800"
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
                            className="px-4 py-2 rounded-xl border border-slate-300 text-slate-600 hover:bg-slate-100 text-xs font-semibold transition-colors"
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            disabled={saving}
                            className="flex items-center gap-2 px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold transition-all shadow-sm shadow-teal-600/25 disabled:opacity-50"
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

        {/* Modal Footer */}
        <div className="p-4 bg-slate-100 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500 shrink-0">
          <span>Clicking &ldquo;Save & Update Report&rdquo; immediately updates the database, ledger, and refreshes the matrix.</span>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
