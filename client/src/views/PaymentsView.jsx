import React, { useState, useEffect } from 'react';
import API from '../services/api';
import { formatCurrency, formatDate, formatMonthYear } from '../utils/formatters';
import SearchableSelect from '../components/SearchableSelect';
import ColumnManager from '../components/ColumnManager';
import { 
  Receipt, Plus, Search, AlertCircle, 
  RotateCcw, CheckCircle2, Eye, Sparkles, Clock, X,
  Edit2, Filter, Layers, ListFilter, Trash2
} from 'lucide-react';

const OUTSTANDING_COLUMNS_DEF = [
  { id: 'tenant', label: 'Tenant' },
  { id: 'property', label: 'Property & Unit' },
  { id: 'rentRate', label: 'Monthly Rent' },
  { id: 'paidUpto', label: 'Paid Up To' },
  { id: 'nextDue', label: 'Next Due' },
  { id: 'pending', label: 'Pending Dues' },
  { id: 'actions', label: 'Breakdown' }
];

const RECEIPTS_COLUMNS_DEF = [
  { id: 'receiptNo', label: 'Receipt #' },
  { id: 'receiptDate', label: 'Payment Date' },
  { id: 'forMonths', label: 'Rent Month(s)' },
  { id: 'tenantUnit', label: 'Tenant & Unit' },
  { id: 'amount', label: 'Amount Paid' },
  { id: 'mode', label: 'Payment Mode' },
  { id: 'status', label: 'Status' },
  { id: 'actions', label: 'Actions' }
];

export default function PaymentsView() {
  const [activeTab, setActiveTab] = useState('outstanding'); // 'outstanding' | 'receipts'
  const [outstandingData, setOutstandingData] = useState([]);
  const [receipts, setReceipts] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [units, setUnits] = useState([]);
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [selectedPropertyFilter, setSelectedPropertyFilter] = useState('');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState(''); // 'overdue' | 'clear'

  // Column Managers
  const [outColumns, setOutColumns] = useState(() => {
    const saved = localStorage.getItem('cols_payments_out');
    return saved ? JSON.parse(saved) : OUTSTANDING_COLUMNS_DEF.map(c => c.id);
  });
  const [recColumns, setRecColumns] = useState(() => {
    const saved = localStorage.getItem('cols_payments_rec');
    return saved ? JSON.parse(saved) : RECEIPTS_COLUMNS_DEF.map(c => c.id);
  });

  // Modals & form state
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [editingReceiptId, setEditingReceiptId] = useState(null);
  const [selectedLedgerModal, setSelectedLedgerModal] = useState(null);
  const [tenantLedgerInfo, setTenantLedgerInfo] = useState(null);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    tenantId: '',
    unitId: '',
    receiptDate: new Date().toISOString().split('T')[0],
    totalAmount: '',
    paymentMode: 'Cash',
    referenceNumber: '',
    bankName: '',
    comments: '',
    allocations: [{ rentMonthYear: '2026-04', allocatedAmount: '', notes: '' }],
  });

  const fetchData = async () => {
    try {
      setLoading(true);
      const [outRes, recRes, tRes, uRes, pRes] = await Promise.all([
        API.get('/payments/outstanding-summary?upToMonthYear=2026-04'),
        API.get('/payments'),
        API.get('/tenants'),
        API.get('/units'),
        API.get('/properties')
      ]);
      if (outRes.data.success) setOutstandingData(outRes.data.data);
      if (recRes.data.success) setReceipts(recRes.data.data);
      if (tRes.data.success) setTenants(tRes.data.data);
      if (uRes.data.success) setUnits(uRes.data.data);
      if (pRes.data.success) setProperties(pRes.data.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleTenantOrUnitSelection = async (tenantId, unitId) => {
    if (!tenantId || !unitId) { setTenantLedgerInfo(null); return; }
    try {
      setLedgerLoading(true);
      const [ledgerRes, lastPayRes] = await Promise.all([
        API.get(`/payments/tenant-unit-ledger?tenantId=${tenantId}&unitId=${unitId}&upToMonthYear=2026-06`),
        API.get(`/payments?tenantId=${tenantId}&unitId=${unitId}`),
      ]);
      const ledger = ledgerRes.data?.data;
      const recentPayments = lastPayRes.data?.data || [];
      const lastPayment = recentPayments.length > 0 ? recentPayments[0] : null;
      setTenantLedgerInfo({ ...ledger, lastPayment });

      if (ledger?.nextUnpaidMonth && !editingReceiptId) {
        const targetMonth = ledger.monthsBreakdown?.find(m => m.monthYear === ledger.nextUnpaidMonth);
        const suggestedAmount = targetMonth ? (targetMonth.outstandingAmount || targetMonth.expectedRate) : '';
        setForm(prev => ({
          ...prev,
          allocations: [{
            rentMonthYear: ledger.nextUnpaidMonth,
            allocatedAmount: suggestedAmount ? String(suggestedAmount) : '',
            notes: `Rent for ${ledger.nextUnpaidMonth}`,
          }],
          totalAmount: suggestedAmount ? String(suggestedAmount) : '',
        }));
      }
    } catch (err) {
      console.error('Failed to load tenant status:', err);
    } finally {
      setLedgerLoading(false);
    }
  };

  const handleAddMonth = () => {
    const lastRow = form.allocations[form.allocations.length - 1];
    let nextMonth = '2026-04';
    if (lastRow?.rentMonthYear) {
      const [y, m] = lastRow.rentMonthYear.split('-').map(Number);
      const d = new Date(y, m, 1);
      nextMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    }
    setForm(prev => ({
      ...prev,
      allocations: [...prev.allocations, { rentMonthYear: nextMonth, allocatedAmount: '', notes: '' }],
    }));
  };

  const handleAllocChange = (idx, field, val) => {
    setForm(prev => {
      const updated = [...prev.allocations];
      updated[idx][field] = val;
      return { ...prev, allocations: updated };
    });
  };

  const openNewPaymentModal = () => {
    setEditingReceiptId(null);
    setForm({
      tenantId: '',
      unitId: '',
      receiptDate: new Date().toISOString().split('T')[0],
      totalAmount: '',
      paymentMode: 'Cash',
      referenceNumber: '',
      bankName: '',
      comments: '',
      allocations: [{ rentMonthYear: '2026-04', allocatedAmount: '', notes: '' }],
    });
    setTenantLedgerInfo(null);
    setShowPaymentModal(true);
  };

  const openEditReceiptModal = (receipt) => {
    setEditingReceiptId(receipt._id);
    const existingAllocations = receipt.allocations && receipt.allocations.length > 0
      ? receipt.allocations.map(a => ({
          rentMonthYear: a.rentMonthYear,
          allocatedAmount: String(a.allocatedAmount),
          notes: a.notes || ''
        }))
      : [{ rentMonthYear: '2026-04', allocatedAmount: String(receipt.totalAmount), notes: '' }];

    setForm({
      tenantId: receipt.tenantId?._id || receipt.tenantId,
      unitId: receipt.unitId?._id || receipt.unitId,
      receiptDate: receipt.receiptDate ? new Date(receipt.receiptDate).toISOString().split('T')[0] : '',
      totalAmount: String(receipt.totalAmount || ''),
      paymentMode: receipt.paymentMode || 'Cash',
      referenceNumber: receipt.referenceNumber || '',
      bankName: receipt.bankName || '',
      comments: receipt.comments || '',
      allocations: existingAllocations
    });
    handleTenantOrUnitSelection(receipt.tenantId?._id || receipt.tenantId, receipt.unitId?._id || receipt.unitId);
    setShowPaymentModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.tenantId || !form.unitId) {
      alert('Please select a tenant and property unit.');
      return;
    }
    if (!form.totalAmount || Number(form.totalAmount) <= 0) {
      alert('Please enter a valid payment amount.');
      return;
    }
    const totalAllocated = form.allocations.reduce((s, a) => s + Number(a.allocatedAmount || 0), 0);
    if (Math.abs(Number(form.totalAmount) - totalAllocated) > 0.01) {
      alert(`Month breakdown amounts (₹${totalAllocated}) must equal total payment (₹${form.totalAmount}). Please adjust.`);
      return;
    }

    try {
      setSubmitting(true);
      if (editingReceiptId) {
        const res = await API.put(`/payments/${editingReceiptId}`, form);
        if (res.data.success) {
          setShowPaymentModal(false);
          setEditingReceiptId(null);
          fetchData();
        }
      } else {
        const res = await API.post('/payments', form);
        if (res.data.success) {
          setShowPaymentModal(false);
          fetchData();
        }
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Could not save payment. Please check your data.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReverse = async (id, receiptNo) => {
    const reason = prompt(`Why are you cancelling payment ${receiptNo}? (This will be logged in audit history)`);
    if (!reason || !reason.trim()) return;
    try {
      await API.post(`/payments/${id}/reverse`, { reversalReason: reason.trim() });
      fetchData();
    } catch (err) {
      alert(err.response?.data?.message || 'Could not cancel payment.');
    }
  };

  const handleDeleteReceipt = async (id, receiptNo) => {
    if (!window.confirm(`Are you sure you want to permanently delete receipt ${receiptNo}? This cannot be undone.`)) return;
    try {
      await API.delete(`/payments/${id}`);
      fetchData();
    } catch (err) {
      alert(err.response?.data?.message || 'Could not delete payment receipt.');
    }
  };

  // Filter Outstanding Data
  const filteredOut = outstandingData.filter(d => {
    const matchesSearch = !search ||
      d.tenant?.name?.toLowerCase().includes(search.toLowerCase()) ||
      d.property?.name?.toLowerCase().includes(search.toLowerCase()) ||
      d.unit?.unitName?.toLowerCase().includes(search.toLowerCase());

    const matchesProp = !selectedPropertyFilter ||
      d.property?._id === selectedPropertyFilter ||
      d.property?.name === selectedPropertyFilter;

    const matchesStatus = !selectedStatusFilter ||
      (selectedStatusFilter === 'overdue' && (d.totalOutstanding > 0)) ||
      (selectedStatusFilter === 'clear' && (d.totalOutstanding <= 0));

    return matchesSearch && matchesProp && matchesStatus;
  });

  // Filter Receipts
  const filteredRec = receipts.filter(r => {
    const matchesSearch = !search ||
      r.tenantId?.name?.toLowerCase().includes(search.toLowerCase()) ||
      r.receiptNumber?.toLowerCase().includes(search.toLowerCase()) ||
      r.unitId?.unitName?.toLowerCase().includes(search.toLowerCase()) ||
      (r.monthsCovered && r.monthsCovered.toLowerCase().includes(search.toLowerCase()));

    const matchesProp = !selectedPropertyFilter ||
      r.unitId?.propertyId?._id === selectedPropertyFilter ||
      r.unitId?.propertyId?.name === selectedPropertyFilter;

    return matchesSearch && matchesProp;
  });

  const closePaymentModal = () => {
    setShowPaymentModal(false);
    setEditingReceiptId(null);
    setTenantLedgerInfo(null);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 sm:p-6 rounded-2xl shadow-sm border border-slate-200">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900">Rent & Payments</h2>
          <p className="text-sm text-slate-500">
            View pending tenant dues or browse the payment receipt register
          </p>
        </div>
        <button
          onClick={openNewPaymentModal}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold transition-all shadow-md shadow-emerald-600/20 active:scale-95"
        >
          <Plus className="w-4 h-4" />
          Record Payment
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 bg-white px-2 pt-2 rounded-t-2xl">
        <button
          onClick={() => setActiveTab('outstanding')}
          className={`flex items-center gap-2 px-5 py-3 text-sm font-bold border-b-2 transition-all ${
            activeTab === 'outstanding'
              ? 'border-emerald-600 text-emerald-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <AlertCircle className="w-4 h-4" />
          <span>Pending Dues Status</span>
          <span className="ml-1 text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-bold">
            {outstandingData.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('receipts')}
          className={`flex items-center gap-2 px-5 py-3 text-sm font-bold border-b-2 transition-all ${
            activeTab === 'receipts'
              ? 'border-emerald-600 text-emerald-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Receipt className="w-4 h-4" />
          <span>Payment History Register</span>
          <span className="ml-1 text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-bold">
            {receipts.length}
          </span>
        </button>
      </div>

      {/* Filters & Column Customizer Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm">
        {/* Search */}
        <div className="flex items-center gap-2.5 flex-1 bg-slate-50 px-3.5 py-2 rounded-xl border border-slate-200/80">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            type="text"
            placeholder={activeTab === 'outstanding' ? "Search tenant or property..." : "Search tenant, receipt #, or month..."}
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
        <div className="flex items-center gap-2">
          <select
            value={selectedPropertyFilter}
            onChange={(e) => setSelectedPropertyFilter(e.target.value)}
            className="text-xs font-semibold px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400 cursor-pointer"
          >
            <option value="">All Properties</option>
            {properties.map(p => (
              <option key={p._id} value={p._id}>{p.name}</option>
            ))}
          </select>

          {/* Dues Status Filter (for Outstanding tab) */}
          {activeTab === 'outstanding' && (
            <select
              value={selectedStatusFilter}
              onChange={(e) => setSelectedStatusFilter(e.target.value)}
              className="text-xs font-semibold px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400 cursor-pointer"
            >
              <option value="">All Status</option>
              <option value="overdue">Has Pending Dues</option>
              <option value="clear">All Clear / Paid</option>
            </select>
          )}

          {/* Column Manager */}
          {activeTab === 'outstanding' ? (
            <ColumnManager
              columns={OUTSTANDING_COLUMNS_DEF}
              visibleColumns={outColumns}
              onChangeVisible={setOutColumns}
              storageKey="payments_out"
            />
          ) : (
            <ColumnManager
              columns={RECEIPTS_COLUMNS_DEF}
              visibleColumns={recColumns}
              onChangeVisible={setRecColumns}
              storageKey="payments_rec"
            />
          )}
        </div>
      </div>

      {/* 1. OUTSTANDING DUES TAB */}
      {activeTab === 'outstanding' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          {loading ? (
            <div className="py-16 text-center text-slate-400 text-sm">Loading pending dues...</div>
          ) : filteredOut.length === 0 ? (
            <div className="py-16 text-center text-slate-400 text-sm">No tenant records match your filter criteria.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 text-[11px] text-slate-400 uppercase tracking-wide font-semibold">
                  <tr>
                    {outColumns.map(colId => {
                      if (colId === 'tenant') return <th key={colId} className="px-5 py-3.5">Tenant</th>;
                      if (colId === 'property') return <th key={colId} className="px-5 py-3.5">Property & Unit</th>;
                      if (colId === 'rentRate') return <th key={colId} className="px-5 py-3.5">Monthly Rent</th>;
                      if (colId === 'paidUpto') return <th key={colId} className="px-5 py-3.5">Paid Up To</th>;
                      if (colId === 'nextDue') return <th key={colId} className="px-5 py-3.5">Next Due Month</th>;
                      if (colId === 'pending') return <th key={colId} className="px-5 py-3.5">Pending Dues</th>;
                      if (colId === 'actions') return <th key={colId} className="px-5 py-3.5 text-right">Breakdown</th>;
                      return null;
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredOut.map((item, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/70 transition-colors">
                      {outColumns.map(colId => {
                        if (colId === 'tenant') {
                          return (
                            <td key={colId} className="px-5 py-4">
                              <p className="font-bold text-slate-900 text-sm">{item.tenant?.name || 'Unknown'}</p>
                              <p className="text-slate-400 text-[11px] mt-0.5">{item.tenant?.phone || '—'}</p>
                            </td>
                          );
                        }
                        if (colId === 'property') {
                          return (
                            <td key={colId} className="px-5 py-4">
                              <p className="font-semibold text-slate-800 text-xs">{item.property?.name || '—'}</p>
                              <p className="text-slate-400 text-[11px]">{item.unit?.unitName || '—'}</p>
                            </td>
                          );
                        }
                        if (colId === 'rentRate') {
                          return (
                            <td key={colId} className="px-5 py-4 font-semibold text-slate-700 text-xs">
                              {formatCurrency(item.currentRate || 0)}
                            </td>
                          );
                        }
                        if (colId === 'paidUpto') {
                          return (
                            <td key={colId} className="px-5 py-4">
                              {item.paidTillMonth && item.paidTillMonth !== 'None' ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  <CheckCircle2 className="w-3 h-3" />
                                  {formatMonthYear(item.paidTillMonth)}
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-500 border border-slate-200">
                                  No payments yet
                                </span>
                              )}
                            </td>
                          );
                        }
                        if (colId === 'nextDue') {
                          return (
                            <td key={colId} className="px-5 py-4">
                              {item.nextUnpaidMonth && item.nextUnpaidMonth !== 'Up to date' ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                                  <AlertCircle className="w-3 h-3" />
                                  {formatMonthYear(item.nextUnpaidMonth)}
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  <CheckCircle2 className="w-3 h-3" />
                                  All Cleared
                                </span>
                              )}
                            </td>
                          );
                        }
                        if (colId === 'pending') {
                          return (
                            <td key={colId} className="px-5 py-4">
                              <span className={`font-bold text-sm ${item.totalOutstanding > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                                {formatCurrency(item.totalOutstanding || 0)}
                              </span>
                            </td>
                          );
                        }
                        if (colId === 'actions') {
                          return (
                            <td key={colId} className="px-5 py-4 text-right">
                              <button
                                onClick={() => setSelectedLedgerModal(item)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                View Breakdown
                              </button>
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
      )}

      {/* 2. ALL RECEIPTS REGISTER TAB */}
      {activeTab === 'receipts' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          {loading ? (
            <div className="py-16 text-center text-slate-400 text-sm">Loading receipt register...</div>
          ) : filteredRec.length === 0 ? (
            <div className="py-16 text-center text-slate-400 text-sm">No payment receipts found matching your search.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 text-[11px] text-slate-400 uppercase tracking-wide font-semibold">
                  <tr>
                    {recColumns.map(colId => {
                      if (colId === 'receiptNo') return <th key={colId} className="px-5 py-3.5">Receipt #</th>;
                      if (colId === 'receiptDate') return <th key={colId} className="px-5 py-3.5">Payment Date</th>;
                      if (colId === 'forMonths') return <th key={colId} className="px-5 py-3.5">Rent Month(s)</th>;
                      if (colId === 'tenantUnit') return <th key={colId} className="px-5 py-3.5">Tenant & Unit</th>;
                      if (colId === 'amount') return <th key={colId} className="px-5 py-3.5">Amount Paid</th>;
                      if (colId === 'mode') return <th key={colId} className="px-5 py-3.5">Payment Mode</th>;
                      if (colId === 'status') return <th key={colId} className="px-5 py-3.5">Status</th>;
                      if (colId === 'actions') return <th key={colId} className="px-5 py-3.5 text-right">Actions</th>;
                      return null;
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredRec.map((r) => {
                    const monthsDisplay = r.allocations && r.allocations.length > 0
                      ? r.allocations.map(a => formatMonthYear(a.rentMonthYear)).join(', ')
                      : r.monthsCovered
                      ? r.monthsCovered.split(', ').map(m => formatMonthYear(m)).join(', ')
                      : '—';

                    return (
                      <tr key={r._id} className={`hover:bg-slate-50/70 transition-colors ${r.isReversed ? 'opacity-60 bg-slate-50/40' : ''}`}>
                        {recColumns.map(colId => {
                          if (colId === 'receiptNo') {
                            return (
                              <td key={colId} className="px-5 py-4 font-mono font-bold text-slate-800 text-xs">
                                {r.receiptNumber}
                              </td>
                            );
                          }
                          if (colId === 'receiptDate') {
                            return (
                              <td key={colId} className="px-5 py-4 text-slate-600 text-xs whitespace-nowrap">
                                <p className="font-semibold text-slate-800">{formatDate(r.receiptDate)}</p>
                                <p className="text-[10px] text-slate-400">Date Received</p>
                              </td>
                            );
                          }
                          if (colId === 'forMonths') {
                            return (
                              <td key={colId} className="px-5 py-4">
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                                  {monthsDisplay}
                                </span>
                              </td>
                            );
                          }
                          if (colId === 'tenantUnit') {
                            return (
                              <td key={colId} className="px-5 py-4">
                                <p className="font-semibold text-slate-800 text-xs">{r.tenantId?.name || 'Unknown'}</p>
                                <p className="text-slate-400 text-[11px]">{r.unitId?.unitName || '—'}</p>
                              </td>
                            );
                          }
                          if (colId === 'amount') {
                            return (
                              <td key={colId} className="px-5 py-4 font-bold text-emerald-600 text-sm">
                                {formatCurrency(r.totalAmount)}
                              </td>
                            );
                          }
                          if (colId === 'mode') {
                            return (
                              <td key={colId} className="px-5 py-4 text-slate-600 text-xs font-medium">
                                {r.paymentMode}
                              </td>
                            );
                          }
                          if (colId === 'status') {
                            return (
                              <td key={colId} className="px-5 py-4">
                                {r.isReversed ? (
                                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700" title={r.reversalReason}>
                                    Cancelled
                                  </span>
                                ) : (
                                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700">
                                    Active
                                  </span>
                                )}
                              </td>
                            );
                          }
                          if (colId === 'actions') {
                            return (
                              <td key={colId} className="px-5 py-4 text-right">
                                <div className="inline-flex items-center gap-2">
                                  {!r.isReversed && (
                                    <>
                                      <button
                                        onClick={() => openEditReceiptModal(r)}
                                        className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:text-emerald-700 hover:bg-slate-100 rounded-lg transition-colors border border-slate-200"
                                        title="Edit receipt details & rent month"
                                      >
                                        <Edit2 className="w-3 h-3 text-slate-500" />
                                        Edit
                                      </button>
                                      <button
                                        onClick={() => handleReverse(r._id, r.receiptNumber)}
                                        className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-amber-700 hover:bg-amber-50 rounded-lg transition-colors border border-amber-200"
                                        title="Cancel/reverse receipt with audit note"
                                      >
                                        <RotateCcw className="w-3 h-3" />
                                        Cancel
                                      </button>
                                    </>
                                  )}
                                  <button
                                    onClick={() => handleDeleteReceipt(r._id, r.receiptNumber)}
                                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                                    title="Permanently Delete Record"
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
              </table>
            </div>
          )}
        </div>
      )}

      {/* Month Breakdown Modal */}
      {selectedLedgerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-scaleUp">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-2xl w-full p-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div>
                <h3 className="text-base font-extrabold text-slate-900">{selectedLedgerModal.tenant?.name}</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {selectedLedgerModal.property?.name} · {selectedLedgerModal.unit?.unitName}
                </p>
              </div>
              <button
                onClick={() => setSelectedLedgerModal(null)}
                className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-4 max-h-[400px] overflow-y-auto">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-white border-b border-slate-100">
                  <tr className="text-[11px] text-slate-400 uppercase tracking-wide font-semibold">
                    <th className="pb-2.5">Month</th>
                    <th className="pb-2.5">Rent Due</th>
                    <th className="pb-2.5">Paid</th>
                    <th className="pb-2.5">Still Owed</th>
                    <th className="pb-2.5 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {selectedLedgerModal.monthsBreakdown?.map((m, i) => (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="py-3 font-semibold text-slate-800 text-xs">{formatMonthYear(m.monthYear)}</td>
                      <td className="py-3 text-slate-500 text-xs">{formatCurrency(m.expectedRate)}</td>
                      <td className="py-3 font-semibold text-emerald-600 text-xs">{formatCurrency(m.allocatedAmount)}</td>
                      <td className="py-3 font-semibold text-rose-600 text-xs">{formatCurrency(m.outstandingAmount)}</td>
                      <td className="py-3 text-right">
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                          m.status === 'Fully Paid'
                            ? 'bg-emerald-100 text-emerald-800'
                            : m.status === 'Partially Paid'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}>
                          {m.status === 'Fully Paid' ? '✓ Paid' : m.status === 'Partially Paid' ? 'Part Paid' : 'Due'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between">
              <div className="text-sm text-slate-500">
                Total Pending: <span className="font-bold text-rose-600">{formatCurrency(selectedLedgerModal.totalOutstanding || 0)}</span>
              </div>
              <button
                onClick={() => setSelectedLedgerModal(null)}
                className="px-5 py-2 text-sm font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Record or Edit Payment Modal */}
      {showPaymentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-3 sm:p-4 animate-scaleUp">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-2xl w-full max-h-[92vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between p-5 border-b border-slate-100 shrink-0 bg-white">
              <div>
                <h3 className="text-lg font-extrabold text-slate-900">
                  {editingReceiptId ? 'Edit Payment Receipt' : 'Record Rent Payment'}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {editingReceiptId ? 'Update payment date, amount, and allocated rent months' : 'Select tenant to record payment'}
                </p>
              </div>
              <button onClick={closePaymentModal} className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
              {/* Tenant & Unit Search */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <SearchableSelect
                  label="Tenant"
                  required
                  placeholder="Type to search tenant..."
                  options={tenants}
                  value={form.tenantId}
                  displayKey="name"
                  secondaryKey="tenantCode"
                  valueKey="_id"
                  onChange={(tId, selectedT) => {
                    const unitId = selectedT?.activeUnit?._id || form.unitId;
                    setForm(prev => ({ ...prev, tenantId: tId, unitId }));
                    handleTenantOrUnitSelection(tId, unitId);
                  }}
                />
                <SearchableSelect
                  label="Property Unit"
                  required
                  placeholder="Type to search unit..."
                  options={units}
                  value={form.unitId}
                  displayKey="unitName"
                  secondaryKey="unitCode"
                  valueKey="_id"
                  onChange={(uId) => {
                    setForm(prev => ({ ...prev, unitId: uId }));
                    handleTenantOrUnitSelection(form.tenantId, uId);
                  }}
                />
              </div>

              {/* Payment History & Month Status */}
              {form.tenantId && form.unitId && (
                <div className="bg-blue-50/60 rounded-2xl p-3.5 border border-blue-100 space-y-2.5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-blue-100 pb-2">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-blue-600 shrink-0" />
                      <span className="text-xs font-bold text-slate-800">Tenant Rent Status</span>
                      {tenantLedgerInfo?.nextUnpaidMonth && (
                        <span className="text-[11px] text-blue-700 font-bold bg-blue-100 px-2 py-0.5 rounded-full">
                          Due: {formatMonthYear(tenantLedgerInfo.nextUnpaidMonth)}
                        </span>
                      )}
                    </div>
                    {tenantLedgerInfo?.lastPayment ? (
                      <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800">
                        <Clock className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                        <span>Last paid: <strong>{formatCurrency(tenantLedgerInfo.lastPayment.totalAmount)}</strong> ({formatDate(tenantLedgerInfo.lastPayment.receiptDate)})</span>
                      </div>
                    ) : (
                      <span className="text-[11px] text-slate-400 italic">No previous payments</span>
                    )}
                  </div>

                  {ledgerLoading ? (
                    <div className="text-xs text-slate-400 text-center py-2">Loading month status...</div>
                  ) : (
                    <div>
                      <p className="text-[10px] text-slate-500 font-medium mb-1.5">
                        Tap any month to auto-fill payment form:
                      </p>
                      <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto pr-1">
                        {tenantLedgerInfo?.monthsBreakdown?.map((m) => {
                          const isPaid = m.status === 'Fully Paid';
                          const isPartial = m.status === 'Partially Paid';
                          const isNextDue = m.monthYear === tenantLedgerInfo.nextUnpaidMonth;
                          return (
                            <button
                              type="button"
                              key={m.monthYear}
                              onClick={() => {
                                if (isPaid && !editingReceiptId) {
                                  alert(`${formatMonthYear(m.monthYear)} is already marked paid.`);
                                  return;
                                }
                                setForm(prev => ({
                                  ...prev,
                                  allocations: [{
                                    rentMonthYear: m.monthYear,
                                    allocatedAmount: String(m.outstandingAmount || m.expectedRate),
                                    notes: `Rent for ${m.monthYear}`,
                                  }],
                                  totalAmount: String(m.outstandingAmount || m.expectedRate),
                                }));
                              }}
                              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all border flex items-center gap-1 ${
                                isPaid
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : isPartial
                                  ? 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100'
                                  : isNextDue
                                  ? 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700 shadow-sm'
                                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                              }`}
                            >
                              <span>{formatMonthYear(m.monthYear)}</span>
                              <span className="text-[10px] opacity-80">
                                {isPaid ? '✓' : isPartial ? `₹${m.outstandingAmount}` : isNextDue ? '★' : `₹${m.expectedRate}`}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Payment Details */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">Payment Date Received</label>
                  <input
                    type="date" required
                    value={form.receiptDate}
                    onChange={(e) => setForm({ ...form, receiptDate: e.target.value })}
                    className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">Total Amount (₹)</label>
                  <input
                    type="number" required placeholder="e.g. 75000"
                    value={form.totalAmount}
                    onChange={(e) => setForm({ ...form, totalAmount: e.target.value })}
                    className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-400 font-bold text-emerald-700"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">Payment Mode</label>
                  <select
                    value={form.paymentMode}
                    onChange={(e) => setForm({ ...form, paymentMode: e.target.value })}
                    className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white"
                  >
                    <option value="Cash">Cash</option>
                    <option value="Bank Transfer / NEFT / RTGS">Bank Transfer</option>
                    <option value="Cheque">Cheque</option>
                    <option value="UPI / GPay">UPI / GPay</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>

              {/* Month Allocation */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700">Which Month(s) is this Payment For?</span>
                  <button
                    type="button"
                    onClick={handleAddMonth}
                    className="text-xs font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-1"
                  >
                    + Add Another Month
                  </button>
                </div>

                {form.allocations.map((alloc, idx) => (
                  <div key={idx} className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
                    <input
                      type="month" required
                      value={alloc.rentMonthYear}
                      onChange={(e) => handleAllocChange(idx, 'rentMonthYear', e.target.value)}
                      className="w-full sm:w-auto px-3 py-2.5 text-sm rounded-xl border border-slate-200 bg-white font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                    />
                    <input
                      type="number" required placeholder="Amount (₹)"
                      value={alloc.allocatedAmount}
                      onChange={(e) => handleAllocChange(idx, 'allocatedAmount', e.target.value)}
                      className="w-full sm:w-36 px-3 py-2.5 text-sm rounded-xl border border-slate-200 bg-white font-bold text-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                    />
                    <input
                      type="text" placeholder="Note (optional)"
                      value={alloc.notes}
                      onChange={(e) => handleAllocChange(idx, 'notes', e.target.value)}
                      className="w-full sm:flex-1 px-3 py-2.5 text-sm rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400"
                    />
                    {form.allocations.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setForm(prev => ({ ...prev, allocations: prev.allocations.filter((_, i) => i !== idx) }))}
                        className="text-slate-400 hover:text-rose-500 p-2 rounded-lg hover:bg-rose-50"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Comments */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Notes / Comments <span className="text-slate-400 font-normal">(optional)</span></label>
                <input
                  type="text" placeholder="e.g. Paid in advance via RTGS"
                  value={form.comments}
                  onChange={(e) => setForm({ ...form, comments: e.target.value })}
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={closePaymentModal}
                  className="px-5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2.5 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 rounded-xl shadow-md shadow-emerald-600/20 active:scale-95"
                >
                  {submitting ? 'Saving...' : editingReceiptId ? 'Update Payment' : 'Save Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
