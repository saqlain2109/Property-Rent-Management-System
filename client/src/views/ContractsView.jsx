import React, { useState, useEffect } from 'react';
import API from '../services/api';
import { formatCurrency, formatDate, formatMonthYear } from '../utils/formatters';
import SearchableSelect from '../components/SearchableSelect';
import {
  FileText, Plus, Search, Building2, Layers, Users, Calendar,
  TrendingUp, CheckCircle2, AlertCircle, Edit2, LogOut, History,
  IndianRupee, X, Check, ArrowRight, Clock, ShieldCheck
} from 'lucide-react';

export default function ContractsView() {
  const [contracts, setContracts] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [properties, setProperties] = useState([]);
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Filters
  const [search, setSearch] = useState('');
  const [propertyFilter, setPropertyFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('Active');

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showReviseModal, setShowReviseModal] = useState(false);
  const [showVacateModal, setShowVacateModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [selectedContract, setSelectedContract] = useState(null);

  // Forms
  const [createForm, setCreateForm] = useState({
    tenantId: '',
    propertyId: '',
    unitId: '',
    startDate: new Date().toISOString().split('T')[0],
    monthlyRate: '',
    depositHeld: 0,
    terms: '',
    notes: '',
  });

  const [reviseForm, setReviseForm] = useState({
    newRate: '',
    effectiveFrom: new Date().toISOString().split('T')[0],
    reason: '',
  });

  const [vacateForm, setVacateForm] = useState({
    endDate: new Date().toISOString().split('T')[0],
    depositRefunded: 0,
    notes: '',
  });

  const fetchData = async () => {
    try {
      setLoading(true);
      const [cRes, tRes, pRes, uRes] = await Promise.all([
        API.get('/assignments'),
        API.get('/tenants'),
        API.get('/properties'),
        API.get('/units'),
      ]);
      if (cRes.data.success) setContracts(cRes.data.data);
      if (tRes.data.success) setTenants(tRes.data.data);
      if (pRes.data.success) setProperties(pRes.data.data);
      if (uRes.data.success) setUnits(uRes.data.data);
    } catch (err) {
      console.error('Failed to load contracts data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Filtered Units based on Property selection in Create Form
  const availableUnitsForProperty = units.filter(
    u => !createForm.propertyId || String(u.propertyId?._id || u.propertyId) === createForm.propertyId
  );

  const handleCreateContract = async (e) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      const res = await API.post('/assignments', {
        tenantId: createForm.tenantId,
        unitId: createForm.unitId,
        startDate: createForm.startDate,
        monthlyRate: Number(createForm.monthlyRate),
        depositHeld: Number(createForm.depositHeld) || 0,
        terms: createForm.terms,
        notes: createForm.notes,
      });
      if (res.data.success) {
        setShowCreateModal(false);
        setCreateForm({
          tenantId: '',
          propertyId: '',
          unitId: '',
          startDate: new Date().toISOString().split('T')[0],
          monthlyRate: '',
          depositHeld: 0,
          terms: '',
          notes: '',
        });
        fetchData();
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to create contract.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReviseRate = async (e) => {
    e.preventDefault();
    if (!selectedContract) return;
    try {
      setSubmitting(true);
      const res = await API.post(`/assignments/${selectedContract._id}/increase-rent`, {
        newRate: Number(reviseForm.newRate),
        effectiveFrom: reviseForm.effectiveFrom,
        reason: reviseForm.reason,
      });
      if (res.data.success) {
        setShowReviseModal(false);
        setSelectedContract(null);
        setReviseForm({
          newRate: '',
          effectiveFrom: new Date().toISOString().split('T')[0],
          reason: '',
        });
        fetchData();
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to revise rent rate.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleVacateContract = async (e) => {
    e.preventDefault();
    if (!selectedContract) return;
    try {
      setSubmitting(true);
      const res = await API.post(`/assignments/${selectedContract._id}/vacate`, {
        endDate: vacateForm.endDate,
        depositRefunded: Number(vacateForm.depositRefunded) || 0,
        notes: vacateForm.notes,
      });
      if (res.data.success) {
        setShowVacateModal(false);
        setSelectedContract(null);
        fetchData();
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to vacate contract.');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredContracts = contracts.filter((c) => {
    const tName = c.tenantId?.name || '';
    const pName = c.unitId?.propertyId?.name || '';
    const uName = c.unitId?.unitName || '';
    const code = c.assignmentCode || '';

    const matchesSearch =
      !search ||
      tName.toLowerCase().includes(search.toLowerCase()) ||
      pName.toLowerCase().includes(search.toLowerCase()) ||
      uName.toLowerCase().includes(search.toLowerCase()) ||
      code.toLowerCase().includes(search.toLowerCase());

    const matchesProp =
      !propertyFilter ||
      String(c.unitId?.propertyId?._id || c.unitId?.propertyId) === propertyFilter;

    const matchesStatus =
      !statusFilter ||
      (statusFilter === 'Active' && c.status === 'Active') ||
      (statusFilter === 'Past' && c.status !== 'Active');

    return matchesSearch && matchesProp && matchesStatus;
  });

  // Overview metrics
  const totalActive = contracts.filter(c => c.status === 'Active').length;
  const totalExpectedAll = contracts.reduce((s, c) => s + (c.totalExpected || 0), 0);
  const totalReceivedAll = contracts.reduce((s, c) => s + (c.totalReceived || 0), 0);
  const totalOutstandingAll = contracts.reduce((s, c) => s + (c.outstandingBalance || 0), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 sm:p-6 rounded-2xl shadow-sm border border-slate-200">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center font-bold">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-extrabold text-slate-900">Rent Contracts & Leases</h2>
              <p className="text-xs text-slate-500">
                Independent contract records linking Tenants to Properties & Units with full rate revision history
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-bold transition-all shadow-md shadow-teal-600/20 active:scale-95 shrink-0"
        >
          <Plus className="w-4 h-4" />
          Create Contract
        </button>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4.5 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-xs font-semibold text-slate-500">Active Leases</p>
          <p className="text-2xl font-extrabold text-slate-900 mt-1">{totalActive}</p>
          <p className="text-[11px] text-teal-600 font-medium mt-0.5">Currently Occupying Units</p>
        </div>

        <div className="bg-white p-4.5 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-xs font-semibold text-slate-500">Total Expected To Date</p>
          <p className="text-2xl font-extrabold text-blue-700 mt-1">{formatCurrency(totalExpectedAll)}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">Prorated through current month</p>
        </div>

        <div className="bg-white p-4.5 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-xs font-semibold text-slate-500">Total Rent Received</p>
          <p className="text-2xl font-extrabold text-emerald-600 mt-1">{formatCurrency(totalReceivedAll)}</p>
          <p className="text-[11px] text-emerald-600 font-medium mt-0.5">Allocated payment receipts</p>
        </div>

        <div className="bg-white p-4.5 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-xs font-semibold text-slate-500">Outstanding Balance</p>
          <p className="text-2xl font-extrabold text-rose-600 mt-1">{formatCurrency(totalOutstandingAll)}</p>
          <p className="text-[11px] text-rose-500 font-medium mt-0.5">Net overdue across contracts</p>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-2.5 flex-1 bg-slate-50 px-3.5 py-2 rounded-xl border border-slate-200/80">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            type="text"
            placeholder="Search tenant, property, unit, or contract code..."
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
          options={properties.map((p) => ({ value: p._id, label: p.name }))}
        />

        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl shrink-0">
          <button
            onClick={() => setStatusFilter('Active')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              statusFilter === 'Active' ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            Active ({totalActive})
          </button>
          <button
            onClick={() => setStatusFilter('Past')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              statusFilter === 'Past' ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            Past / Vacated
          </button>
          <button
            onClick={() => setStatusFilter('')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              !statusFilter ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            All
          </button>
        </div>
      </div>

      {/* Contracts Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-7 h-7 border-4 border-teal-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filteredContracts.length === 0 ? (
          <div className="py-16 text-center text-slate-400 text-sm">
            No contracts found matching your filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="py-3.5 px-4">Contract Code</th>
                  <th className="py-3.5 px-4">Tenant Details</th>
                  <th className="py-3.5 px-4">Property & Partition</th>
                  <th className="py-3.5 px-4">Tenancy Dates</th>
                  <th className="py-3.5 px-4 text-right">Current Rate</th>
                  <th className="py-3.5 px-4 text-right">Expected To Date</th>
                  <th className="py-3.5 px-4 text-right">Received</th>
                  <th className="py-3.5 px-4 text-right">Outstanding</th>
                  <th className="py-3.5 px-4 text-center">Rate History</th>
                  <th className="py-3.5 px-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredContracts.map((c) => {
                  const isVacated = c.status !== 'Active';
                  const rateCount = c.rateHistory?.length || 1;
                  return (
                    <tr
                      key={c._id}
                      className={`hover:bg-slate-50/70 transition-colors ${isVacated ? 'bg-slate-50/40 opacity-70' : ''}`}
                    >
                      {/* Contract Code & Status */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className="font-mono font-bold text-slate-800 text-xs block">
                          {c.assignmentCode}
                        </span>
                        <span className={`inline-block mt-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          !isVacated ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
                        }`}>
                          {c.status}
                        </span>
                      </td>

                      {/* Tenant (Separate Entity) */}
                      <td className="py-3.5 px-4">
                        <span className="font-bold text-slate-900 text-sm block">
                          {c.tenantId?.name || '—'}
                        </span>
                        {c.tenantId?.phone && (
                          <span className="text-slate-500 text-[11px] block">{c.tenantId.phone}</span>
                        )}
                        {c.tenantId?.email && (
                          <span className="text-slate-400 text-[10px] block">{c.tenantId.email}</span>
                        )}
                      </td>

                      {/* Property & Unit */}
                      <td className="py-3.5 px-4">
                        <span className="font-semibold text-slate-800 block">
                          {c.unitId?.propertyId?.name || '—'}
                        </span>
                        <span className="text-teal-700 font-medium text-[11px] block">
                          {c.unitId?.unitName || '—'}
                        </span>
                      </td>

                      {/* Dates */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 text-slate-700 font-medium">
                          <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>{formatDate(c.startDate)}</span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {c.endDate ? `Ended: ${formatDate(c.endDate)}` : 'Ongoing Tenancy'}
                        </div>
                      </td>

                      {/* Current Monthly Rate */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap font-bold text-slate-900">
                        {formatCurrency(c.currentMonthlyRate || 0)}
                        <span className="text-[10px] text-slate-400 font-normal block">/ month</span>
                      </td>

                      {/* Total Expected To Date */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap font-mono font-semibold text-blue-800">
                        {formatCurrency(c.totalExpected || 0)}
                      </td>

                      {/* Total Received To Date */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap font-mono font-semibold text-emerald-700">
                        {formatCurrency(c.totalReceived || 0)}
                      </td>

                      {/* Outstanding Balance */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap font-mono font-bold">
                        <span className={c.outstandingBalance > 0 ? 'text-rose-600' : 'text-emerald-600'}>
                          {formatCurrency(c.outstandingBalance || 0)}
                        </span>
                      </td>

                      {/* Rate History Button */}
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        <button
                          onClick={() => {
                            setSelectedContract(c);
                            setShowHistoryModal(true);
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-[11px] transition-colors"
                          title="View rate revision timeline"
                        >
                          <History className="w-3 h-3 text-slate-500" />
                          <span>{rateCount} rate{rateCount > 1 ? 's' : ''}</span>
                        </button>
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1.5">
                          {!isVacated && (
                            <>
                              <button
                                onClick={() => {
                                  setSelectedContract(c);
                                  setReviseForm({
                                    newRate: String(c.currentMonthlyRate || ''),
                                    effectiveFrom: new Date().toISOString().split('T')[0],
                                    reason: '',
                                  });
                                  setShowReviseModal(true);
                                }}
                                className="px-2.5 py-1 rounded-lg bg-teal-50 hover:bg-teal-100 text-teal-700 font-bold text-[11px] transition-colors"
                                title="Revise or Increase Rent"
                              >
                                Revise Rate
                              </button>

                              <button
                                onClick={() => {
                                  setSelectedContract(c);
                                  setVacateForm({
                                    endDate: new Date().toISOString().split('T')[0],
                                    depositRefunded: c.depositHeld || 0,
                                    notes: '',
                                  });
                                  setShowVacateModal(true);
                                }}
                                className="px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 font-semibold text-[11px] transition-colors"
                                title="Vacate / End Tenancy"
                              >
                                Vacate
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL 1: Create New Contract */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-teal-100 text-teal-700">
                  <Plus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base">New Rent Contract</h3>
                  <p className="text-xs text-slate-500">Link tenant to property unit with start date and rent rate</p>
                </div>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateContract} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Select Tenant *</label>
                <select
                  required
                  value={createForm.tenantId}
                  onChange={(e) => setCreateForm({ ...createForm, tenantId: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-teal-400"
                >
                  <option value="">-- Choose Tenant --</option>
                  {tenants.map(t => (
                    <option key={t._id} value={t._id}>{t.name} {t.phone ? `(${t.phone})` : ''}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Property *</label>
                  <select
                    required
                    value={createForm.propertyId}
                    onChange={(e) => setCreateForm({ ...createForm, propertyId: e.target.value, unitId: '' })}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-teal-400"
                  >
                    <option value="">-- Choose Property --</option>
                    {properties.map(p => (
                      <option key={p._id} value={p._id}>{p.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Partition / Unit *</label>
                  <select
                    required
                    value={createForm.unitId}
                    onChange={(e) => setCreateForm({ ...createForm, unitId: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-teal-400"
                  >
                    <option value="">-- Choose Unit --</option>
                    {availableUnitsForProperty.map(u => (
                      <option key={u._id} value={u._id}>{u.unitName}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Monthly Rent Rate (₹) *</label>
                  <input
                    type="number"
                    required
                    min="0"
                    placeholder="e.g. 9000"
                    value={createForm.monthlyRate}
                    onChange={(e) => setCreateForm({ ...createForm, monthlyRate: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 font-bold text-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-400"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Contract Start Date *</label>
                  <input
                    type="date"
                    required
                    value={createForm.startDate}
                    onChange={(e) => setCreateForm({ ...createForm, startDate: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-400"
                  />
                  <p className="text-[10px] text-slate-400 mt-0.5">Prorated if starting mid-month</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Deposit Held (₹)</label>
                  <input
                    type="number"
                    min="0"
                    value={createForm.depositHeld}
                    onChange={(e) => setCreateForm({ ...createForm, depositHeld: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-400"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Agreement Terms</label>
                  <input
                    type="text"
                    placeholder="e.g. 11 months, 10% annual escalation"
                    value={createForm.terms}
                    onChange={(e) => setCreateForm({ ...createForm, terms: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-400"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold shadow-md shadow-teal-600/20 disabled:opacity-50"
                >
                  {submitting ? 'Creating...' : 'Create Contract'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Revise / Increase Rent */}
      {showReviseModal && selectedContract && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-blue-100 text-blue-700">
                  <TrendingUp className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base">Revise Rent Rate</h3>
                  <p className="text-xs text-slate-500">
                    {selectedContract.tenantId?.name} · {selectedContract.unitId?.unitName}
                  </p>
                </div>
              </div>
              <button
                onClick={() => { setShowReviseModal(false); setSelectedContract(null); }}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleReviseRate} className="p-5 space-y-4">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs flex justify-between items-center">
                <span className="text-slate-500 font-medium">Current Monthly Rate:</span>
                <span className="font-bold text-slate-800 text-sm">
                  {formatCurrency(selectedContract.currentMonthlyRate || 0)}
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">New Monthly Rate (₹) *</label>
                <input
                  type="number"
                  required
                  min="0"
                  placeholder="e.g. 10000"
                  value={reviseForm.newRate}
                  onChange={(e) => setReviseForm({ ...reviseForm, newRate: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 font-bold text-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-400"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Effective Date *</label>
                <input
                  type="date"
                  required
                  value={reviseForm.effectiveFrom}
                  onChange={(e) => setReviseForm({ ...reviseForm, effectiveFrom: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-400"
                />
                <p className="text-[10px] text-slate-400 mt-0.5">
                  If effective mid-month, that month's rent will be split proportionally between old and new rates.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Reason for Revision *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Annual 10% rent escalation, renewal"
                  value={reviseForm.reason}
                  onChange={(e) => setReviseForm({ ...reviseForm, reason: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-400"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => { setShowReviseModal(false); setSelectedContract(null); }}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold shadow-md shadow-teal-600/20 disabled:opacity-50"
                >
                  {submitting ? 'Saving...' : 'Apply Revision'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: Vacate Contract */}
      {showVacateModal && selectedContract && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-rose-100 text-rose-700">
                  <LogOut className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base">Vacate / End Contract</h3>
                  <p className="text-xs text-slate-500">{selectedContract.tenantId?.name}</p>
                </div>
              </div>
              <button
                onClick={() => { setShowVacateModal(false); setSelectedContract(null); }}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleVacateContract} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Vacate / End Date *</label>
                <input
                  type="date"
                  required
                  value={vacateForm.endDate}
                  onChange={(e) => setVacateForm({ ...vacateForm, endDate: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-rose-400"
                />
                <p className="text-[10px] text-slate-400 mt-0.5">Rent for final month will be prorated up to this day.</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Deposit Refunded (₹)</label>
                <input
                  type="number"
                  min="0"
                  value={vacateForm.depositRefunded}
                  onChange={(e) => setVacateForm({ ...vacateForm, depositRefunded: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-rose-400"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Vacate Notes / Reason</label>
                <input
                  type="text"
                  placeholder="e.g. Contract ended, tenant relocated"
                  value={vacateForm.notes}
                  onChange={(e) => setVacateForm({ ...vacateForm, notes: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-rose-400"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => { setShowVacateModal(false); setSelectedContract(null); }}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-md shadow-rose-600/20 disabled:opacity-50"
                >
                  {submitting ? 'Processing...' : 'Confirm Vacate'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: Rate Revisions Timeline History */}
      {showHistoryModal && selectedContract && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-teal-100 text-teal-700">
                  <History className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base">Rate Revision History</h3>
                  <p className="text-xs text-slate-500">
                    {selectedContract.tenantId?.name} · {selectedContract.unitId?.propertyId?.name} ({selectedContract.unitId?.unitName})
                  </p>
                </div>
              </div>
              <button
                onClick={() => { setShowHistoryModal(false); setSelectedContract(null); }}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 max-h-[70vh] overflow-y-auto space-y-4">
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 grid grid-cols-3 gap-3 text-center">
                <div>
                  <p className="text-[11px] text-slate-500 font-medium">Total Expected To Date</p>
                  <p className="text-base font-extrabold text-blue-800">{formatCurrency(selectedContract.totalExpected || 0)}</p>
                </div>
                <div>
                  <p className="text-[11px] text-slate-500 font-medium">Total Received To Date</p>
                  <p className="text-base font-extrabold text-emerald-600">{formatCurrency(selectedContract.totalReceived || 0)}</p>
                </div>
                <div>
                  <p className="text-[11px] text-slate-500 font-medium">Outstanding Balance</p>
                  <p className={`text-base font-extrabold ${selectedContract.outstandingBalance > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                    {formatCurrency(selectedContract.outstandingBalance || 0)}
                  </p>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  Chronological Rate History
                </h4>
                {(!selectedContract.rateHistory || selectedContract.rateHistory.length === 0) ? (
                  <p className="text-xs text-slate-400 italic py-4 text-center">No rate change history recorded</p>
                ) : (
                  <div className="space-y-2.5">
                    {selectedContract.rateHistory.map((ag, idx) => (
                      <div
                        key={ag._id || idx}
                        className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 ${
                          ag.isCurrentRate
                            ? 'bg-teal-50/50 border-teal-200'
                            : 'bg-white border-slate-200'
                        }`}
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-extrabold text-slate-900 text-sm">
                              {formatCurrency(ag.monthlyRate)} / month
                            </span>
                            {ag.isCurrentRate && (
                              <span className="px-2 py-0.5 rounded-full bg-teal-100 text-teal-800 font-bold text-[10px]">
                                Current Rate
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5">
                            Effective: <span className="font-medium text-slate-700">{formatDate(ag.effectiveFrom)}</span>
                            {ag.effectiveTo ? (
                              <span> to <span className="font-medium text-slate-700">{formatDate(ag.effectiveTo)}</span></span>
                            ) : (
                              <span className="text-teal-700 font-medium"> (Present ongoing)</span>
                            )}
                          </p>
                          {ag.reasonForChange && (
                            <p className="text-[11px] text-slate-600 italic mt-0.5">
                              Note: {ag.reasonForChange}
                            </p>
                          )}
                        </div>

                        {ag.previousRate > 0 && (
                          <div className="text-right shrink-0">
                            <span className="text-[11px] text-slate-400 block">Previous:</span>
                            <span className="text-xs text-slate-500 line-through">
                              {formatCurrency(ag.previousRate)}
                            </span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
