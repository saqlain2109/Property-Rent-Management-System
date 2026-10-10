import React, { useState, useEffect } from 'react';
import API from '../services/api';
import { formatCurrency, formatDate, formatMonthYear } from '../utils/formatters';
import { 
  Receipt, Plus, Search, Filter, AlertCircle, CheckCircle, 
  RotateCcw, Calendar, CheckCircle2, ChevronRight, Eye 
} from 'lucide-react';

export default function PaymentsView() {
  const [activeSubTab, setActiveSubTab] = useState('outstanding'); // 'outstanding' | 'receipts'
  const [outstandingData, setOutstandingData] = useState([]);
  const [receipts, setReceipts] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedLedgerModal, setSelectedLedgerModal] = useState(null);

  // Payment form state
  const [form, setForm] = useState({
    tenantId: '',
    unitId: '',
    receiptDate: new Date().toISOString().split('T')[0],
    totalAmount: '',
    paymentMode: 'Cash',
    referenceNumber: '',
    bankName: '',
    comments: '',
    allocations: [{ rentMonthYear: '2026-01', allocatedAmount: '', notes: '' }]
  });

  const fetchData = async () => {
    try {
      setLoading(true);
      const [outRes, recRes, tRes, uRes] = await Promise.all([
        API.get('/payments/outstanding-summary?upToMonthYear=2026-03'),
        API.get('/payments'),
        API.get('/tenants'),
        API.get('/units')
      ]);
      if (outRes.data.success) setOutstandingData(outRes.data.data);
      if (recRes.data.success) setReceipts(recRes.data.data);
      if (tRes.data.success) setTenants(tRes.data.data);
      if (uRes.data.success) setUnits(uRes.data.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleAddAllocationRow = () => {
    setForm(prev => ({
      ...prev,
      allocations: [...prev.allocations, { rentMonthYear: '2026-02', allocatedAmount: '', notes: '' }]
    }));
  };

  const handleRemoveAllocationRow = (index) => {
    setForm(prev => ({
      ...prev,
      allocations: prev.allocations.filter((_, i) => i !== index)
    }));
  };

  const handleAllocationChange = (index, field, value) => {
    setForm(prev => {
      const updated = [...prev.allocations];
      updated[index][field] = value;
      return { ...prev, allocations: updated };
    });
  };

  const handleSubmitPayment = async (e) => {
    e.preventDefault();
    try {
      const totalAllocated = form.allocations.reduce((sum, a) => sum + Number(a.allocatedAmount || 0), 0);
      if (Math.abs(Number(form.totalAmount) - totalAllocated) > 0.01) {
        alert(`Sum of month allocations (₹${totalAllocated}) must equal total receipt amount (₹${form.totalAmount})`);
        return;
      }

      const res = await API.post('/payments', form);
      if (res.data.success) {
        setShowPaymentModal(false);
        alert('Rent payment recorded and allocated successfully!');
        setForm({
          tenantId: '',
          unitId: '',
          receiptDate: new Date().toISOString().split('T')[0],
          totalAmount: '',
          paymentMode: 'Cash',
          referenceNumber: '',
          bankName: '',
          comments: '',
          allocations: [{ rentMonthYear: '2026-01', allocatedAmount: '', notes: '' }]
        });
        fetchData();
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to record payment');
    }
  };

  const handleReversePayment = async (receiptId) => {
    const reason = prompt('Please enter audited reason for payment reversal:');
    if (!reason) return;

    try {
      const res = await API.post(`/payments/${receiptId}/reverse`, { reversalReason: reason });
      if (res.data.success) {
        alert('Payment reversed successfully with audit trail.');
        fetchData();
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to reverse payment');
    }
  };

  const filteredOutstanding = outstandingData.filter(d =>
    d.tenant?.name?.toLowerCase().includes(search.toLowerCase()) ||
    d.property?.name?.toLowerCase().includes(search.toLowerCase()) ||
    d.unit?.unitName?.toLowerCase().includes(search.toLowerCase())
  );

  const filteredReceipts = receipts.filter(r =>
    r.tenantId?.name?.toLowerCase().includes(search.toLowerCase()) ||
    r.receiptNumber?.toLowerCase().includes(search.toLowerCase()) ||
    r.unitId?.unitName?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-200/80">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Rent Payments & Paid-Till Tracking</h2>
          <p className="text-sm text-slate-500">Real-time payment allocation, multi-month receipts, and verified outstanding rent status</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowPaymentModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>Record Rent Payment</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200">
        <button
          onClick={() => setActiveSubTab('outstanding')}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-all ${
            activeSubTab === 'outstanding'
              ? 'border-emerald-600 text-emerald-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Paid-Till & Outstanding Status ({outstandingData.length})
        </button>
        <button
          onClick={() => setActiveSubTab('receipts')}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-all ${
            activeSubTab === 'receipts'
              ? 'border-emerald-600 text-emerald-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Payment Receipts Ledger ({receipts.length})
        </button>
      </div>

      {/* Search Input */}
      <div className="relative max-w-sm">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="Search tenant, property, or unit..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
      </div>

      {/* Tab 1: Outstanding & Paid Till */}
      {activeSubTab === 'outstanding' && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs text-slate-400 uppercase">
                  <th className="pb-3 font-semibold">Tenant</th>
                  <th className="pb-3 font-semibold">Property & Unit</th>
                  <th className="pb-3 font-semibold">Paid Till Month</th>
                  <th className="pb-3 font-semibold">Next Unpaid Month</th>
                  <th className="pb-3 font-semibold">Expected Rent</th>
                  <th className="pb-3 font-semibold">Amount Paid</th>
                  <th className="pb-3 font-semibold text-right">Outstanding</th>
                  <th className="pb-3 font-semibold text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredOutstanding.map((item) => (
                  <tr key={item.assignmentId} className="hover:bg-slate-50/50">
                    <td className="py-3.5">
                      <span className="font-bold text-slate-900 text-sm block">{item.tenant?.name}</span>
                      <span className="text-xs text-slate-400">{item.tenant?.tenantCode}</span>
                    </td>
                    <td className="py-3.5">
                      <span className="font-semibold text-slate-800 text-xs block">{item.property?.name}</span>
                      <span className="text-[11px] text-slate-400">{item.unit?.unitName}</span>
                    </td>
                    <td className="py-3.5">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                        item.paidTillMonth && item.paidTillMonth !== 'None'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}>
                        {item.paidTillMonth ? formatMonthYear(item.paidTillMonth) : 'None'}
                      </span>
                    </td>
                    <td className="py-3.5 text-xs font-medium text-slate-700">
                      {item.nextUnpaidMonth && item.nextUnpaidMonth !== 'Up to date'
                        ? formatMonthYear(item.nextUnpaidMonth)
                        : <span className="text-emerald-600 font-semibold">Fully Up to Date</span>
                      }
                    </td>
                    <td className="py-3.5 text-xs text-slate-600">{formatCurrency(item.totalExpected)}</td>
                    <td className="py-3.5 text-xs font-semibold text-emerald-600">{formatCurrency(item.totalAllocated)}</td>
                    <td className="py-3.5 text-right font-bold text-xs">
                      {item.totalOutstanding > 0 ? (
                        <span className="text-rose-600">{formatCurrency(item.totalOutstanding)}</span>
                      ) : (
                        <span className="text-emerald-600">₹0</span>
                      )}
                    </td>
                    <td className="py-3.5 text-center">
                      <button
                        onClick={() => setSelectedLedgerModal(item)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg border border-slate-200 transition-colors"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Breakdown</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 2: Receipts Ledger */}
      {activeSubTab === 'receipts' && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs text-slate-400 uppercase">
                  <th className="pb-3 font-semibold">Receipt No</th>
                  <th className="pb-3 font-semibold">Date</th>
                  <th className="pb-3 font-semibold">Tenant</th>
                  <th className="pb-3 font-semibold">Unit</th>
                  <th className="pb-3 font-semibold">Months Covered</th>
                  <th className="pb-3 font-semibold">Mode</th>
                  <th className="pb-3 font-semibold text-right">Amount</th>
                  <th className="pb-3 font-semibold text-center">Audit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredReceipts.map((r) => (
                  <tr key={r._id} className="hover:bg-slate-50/50">
                    <td className="py-3.5 font-bold font-mono text-xs text-slate-800">{r.receiptNumber}</td>
                    <td className="py-3.5 text-xs text-slate-500">{formatDate(r.receiptDate)}</td>
                    <td className="py-3.5 font-medium text-slate-900 text-xs">{r.tenantId?.name}</td>
                    <td className="py-3.5 text-xs text-slate-500">{r.unitId?.unitName}</td>
                    <td className="py-3.5 text-xs">
                      {r.allocations?.map((a, i) => (
                        <span key={i} className="inline-block bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-[11px] mr-1">
                          {formatMonthYear(a.rentMonthYear)}: {formatCurrency(a.allocatedAmount)}
                        </span>
                      ))}
                    </td>
                    <td className="py-3.5 text-xs text-slate-600">{r.paymentMode}</td>
                    <td className="py-3.5 text-right font-bold text-emerald-600 text-xs">{formatCurrency(r.totalAmount)}</td>
                    <td className="py-3.5 text-center">
                      <button
                        onClick={() => handleReversePayment(r._id)}
                        title="Audited Payment Reversal"
                        className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
                      >
                        <RotateCcw className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Month-by-Month Breakdown Modal */}
      {selectedLedgerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-2xl w-full p-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-slate-900 text-base">{selectedLedgerModal.tenant?.name}</h3>
                <p className="text-xs text-slate-500">{selectedLedgerModal.property?.name} • {selectedLedgerModal.unit?.unitName}</p>
              </div>
              <button
                onClick={() => setSelectedLedgerModal(null)}
                className="text-slate-400 hover:text-slate-600 text-xl font-bold"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 max-h-96 overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-400 uppercase">
                    <th className="pb-2 font-semibold">Rent Month</th>
                    <th className="pb-2 font-semibold">Expected Rate</th>
                    <th className="pb-2 font-semibold">Allocated</th>
                    <th className="pb-2 font-semibold">Pending</th>
                    <th className="pb-2 font-semibold text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {selectedLedgerModal.monthsBreakdown?.map((m, i) => (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="py-2.5 font-semibold text-slate-800">{formatMonthYear(m.monthYear)}</td>
                      <td className="py-2.5 text-slate-600">{formatCurrency(m.expectedRate)}</td>
                      <td className="py-2.5 font-semibold text-emerald-600">{formatCurrency(m.allocatedAmount)}</td>
                      <td className="py-2.5 font-semibold text-rose-600">{formatCurrency(m.outstandingAmount)}</td>
                      <td className="py-2.5 text-right">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          m.status === 'Fully Paid'
                            ? 'bg-emerald-100 text-emerald-800'
                            : m.status === 'Partially Paid'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}>
                          {m.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setSelectedLedgerModal(null)}
                className="px-4 py-2 text-xs font-semibold text-white bg-slate-800 hover:bg-slate-900 rounded-xl"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Record Payment Modal */}
      {showPaymentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-xl w-full p-6">
            <h3 className="text-lg font-bold text-slate-900 mb-4">Record Rent Payment Receipt</h3>
            <form onSubmit={handleSubmitPayment} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Tenant</label>
                  <select
                    required
                    value={form.tenantId}
                    onChange={(e) => {
                      const tId = e.target.value;
                      const selectedT = tenants.find(t => t._id === tId);
                      setForm({
                        ...form,
                        tenantId: tId,
                        unitId: selectedT?.activeUnit?._id || form.unitId
                      });
                    }}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                  >
                    <option value="">Select Tenant...</option>
                    {tenants.map(t => (
                      <option key={t._id} value={t._id}>{t.name} ({t.tenantCode})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Unit</label>
                  <select
                    required
                    value={form.unitId}
                    onChange={(e) => setForm({ ...form, unitId: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                  >
                    <option value="">Select Unit...</option>
                    {units.map(u => (
                      <option key={u._id} value={u._id}>{u.unitName} ({u.unitCode})</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Receipt Date</label>
                  <input
                    type="date"
                    required
                    value={form.receiptDate}
                    onChange={(e) => setForm({ ...form, receiptDate: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Total Amount (₹)</label>
                  <input
                    type="number"
                    required
                    placeholder="e.g. 75000"
                    value={form.totalAmount}
                    onChange={(e) => setForm({ ...form, totalAmount: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Payment Mode</label>
                  <select
                    value={form.paymentMode}
                    onChange={(e) => setForm({ ...form, paymentMode: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                  >
                    <option value="Cash">Cash</option>
                    <option value="Bank Transfer / NEFT / RTGS">Bank Transfer</option>
                    <option value="Cheque">Cheque</option>
                    <option value="UPI / GPay">UPI / GPay</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>

              {/* Monthly Allocation Matrix */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Rent Month Allocations
                  </span>
                  <button
                    type="button"
                    onClick={handleAddAllocationRow}
                    className="text-xs font-semibold text-emerald-600 hover:text-emerald-700"
                  >
                    + Add Another Month
                  </button>
                </div>

                {form.allocations.map((alloc, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      type="month"
                      required
                      value={alloc.rentMonthYear}
                      onChange={(e) => handleAllocationChange(idx, 'rentMonthYear', e.target.value)}
                      className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white"
                    />
                    <input
                      type="number"
                      required
                      placeholder="Allocated ₹"
                      value={alloc.allocatedAmount}
                      onChange={(e) => handleAllocationChange(idx, 'allocatedAmount', e.target.value)}
                      className="w-32 px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white"
                    />
                    <input
                      type="text"
                      placeholder="Remarks / Note"
                      value={alloc.notes}
                      onChange={(e) => handleAllocationChange(idx, 'notes', e.target.value)}
                      className="flex-1 px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white"
                    />
                    {form.allocations.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveAllocationRow(idx)}
                        className="text-slate-400 hover:text-rose-500 p-1 text-xs"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Comments / Audit Note</label>
                <input
                  type="text"
                  placeholder="e.g. Paid in full via RTGS"
                  value={form.comments}
                  onChange={(e) => setForm({ ...form, comments: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowPaymentModal(false)}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-sm"
                >
                  Save & Allocate Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
