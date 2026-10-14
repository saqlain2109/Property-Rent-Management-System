import React, { useState, useEffect } from 'react';
import API from '../services/api';
import { formatCurrency, formatDate } from '../utils/formatters';
import SearchableSelect from '../components/SearchableSelect';
import { Users, Plus, Search, UserCheck, TrendingUp, Calendar, AlertCircle, Edit, Trash2, LogOut } from 'lucide-react';

export default function TenantsView() {
  const [tenants, setTenants] = useState([]);
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  
  // Modals
  const [showTenantModal, setShowTenantModal] = useState(false);
  const [editingTenant, setEditingTenant] = useState(null);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showIncreaseModal, setShowIncreaseModal] = useState(false);
  const [showVacateModal, setShowVacateModal] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState(null);

  // Forms
  const [tenantForm, setTenantForm] = useState({
    tenantCode: '',
    name: '',
    phone: '',
    email: '',
    tenantType: 'Individual',
    address: '',
    notes: ''
  });

  const [assignForm, setAssignForm] = useState({
    tenantId: '',
    unitId: '',
    startDate: '2026-01-01',
    monthlyRate: '',
    depositHeld: '0',
    rentType: 'Monthly Fixed',
    notes: ''
  });

  const [increaseForm, setIncreaseForm] = useState({
    assignmentId: '',
    newRate: '',
    effectiveFrom: '2026-04-01',
    reason: ''
  });

  const [vacateForm, setVacateForm] = useState({
    assignmentId: '',
    tenantName: '',
    unitName: '',
    endDate: new Date().toISOString().split('T')[0],
    depositRefunded: '0',
    notes: ''
  });

  const fetchData = async () => {
    try {
      setLoading(true);
      const [tRes, uRes] = await Promise.all([
        API.get('/tenants'),
        API.get('/units')
      ]);
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

  // Save / Update Tenant
  const handleSaveTenant = async (e) => {
    e.preventDefault();
    try {
      if (editingTenant) {
        const res = await API.put(`/tenants/${editingTenant._id}`, tenantForm);
        if (res.data.success) {
          setShowTenantModal(false);
          setEditingTenant(null);
          fetchData();
        }
      } else {
        const res = await API.post('/tenants', tenantForm);
        if (res.data.success) {
          setShowTenantModal(false);
          setTenantForm({ tenantCode: '', name: '', phone: '', email: '', tenantType: 'Individual', address: '', notes: '' });
          fetchData();
        }
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to save tenant');
    }
  };

  // Open Edit Tenant Modal
  const openEditTenant = (t) => {
    setEditingTenant(t);
    setTenantForm({
      tenantCode: t.tenantCode || '',
      name: t.name || '',
      phone: t.phone || '',
      email: t.email || '',
      tenantType: t.tenantType || 'Individual',
      address: t.address || '',
      notes: t.notes || ''
    });
    setShowTenantModal(true);
  };

  // Delete Tenant
  const handleDeleteTenant = async (tenantId) => {
    if (!window.confirm('Are you sure you want to delete this tenant?')) return;
    try {
      const res = await API.delete(`/tenants/${tenantId}`);
      if (res.data.success) {
        fetchData();
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to delete tenant');
    }
  };

  const handleAssignTenant = async (e) => {
    e.preventDefault();
    try {
      const res = await API.post('/assignments', assignForm);
      if (res.data.success) {
        setShowAssignModal(false);
        fetchData();
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to assign tenant');
    }
  };

  const handleIncreaseRent = async (e) => {
    e.preventDefault();
    try {
      const res = await API.post('/assignments/increase-rent', increaseForm);
      if (res.data.success) {
        setShowIncreaseModal(false);
        alert('Rent revision recorded successfully!');
        fetchData();
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to revise rent');
    }
  };

  const handleVacateTenant = async (e) => {
    e.preventDefault();
    try {
      const res = await API.post(`/assignments/${vacateForm.assignmentId}/vacate`, {
        endDate: vacateForm.endDate,
        depositRefunded: Number(vacateForm.depositRefunded) || 0,
        notes: vacateForm.notes
      });
      if (res.data.success) {
        setShowVacateModal(false);
        alert(res.data.message || 'Tenant vacated successfully');
        fetchData();
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to vacate tenant');
    }
  };

  const filteredTenants = tenants.filter(t =>
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.tenantCode.toLowerCase().includes(search.toLowerCase()) ||
    t.phone?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-200/80">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Tenant & Lease Agreement Master</h2>
          <p className="text-sm text-slate-500">Manage tenant profiles, active unit assignments, and rent revisions</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setAssignForm({
                tenantId: '',
                unitId: '',
                startDate: new Date().toISOString().split('T')[0],
                monthlyRate: '',
                depositHeld: '0',
                rentType: 'Monthly Fixed',
                notes: ''
              });
              setShowAssignModal(true);
            }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-semibold transition-colors"
          >
            <UserCheck className="w-4 h-4 text-emerald-600" />
            <span>Assign Unit Lease</span>
          </button>
          <button
            onClick={() => {
              setEditingTenant(null);
              setTenantForm({ tenantCode: '', name: '', phone: '', email: '', tenantType: 'Individual', address: '', notes: '' });
              setShowTenantModal(true);
            }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>Register Tenant</span>
          </button>
        </div>
      </div>

      {/* Search & Tenants Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
            <input
              type="text"
              placeholder="Search by tenant name, code, or phone number..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <span className="text-xs text-slate-400 font-semibold">{filteredTenants.length} tenants</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-100 text-slate-400 uppercase font-semibold">
                <th className="pb-3">Tenant Details</th>
                <th className="pb-3">Contact</th>
                <th className="pb-3">Assigned Unit</th>
                <th className="pb-3">Monthly Rent</th>
                <th className="pb-3">Lease Status</th>
                <th className="pb-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredTenants.map((t) => (
                <tr key={t._id} className="hover:bg-slate-50/50">
                  <td className="py-3.5">
                    <span className="font-bold text-slate-900 text-xs block">{t.name}</span>
                    <span className="text-[11px] text-slate-400 font-mono">{t.tenantCode} • {t.tenantType}</span>
                  </td>
                  <td className="py-3.5 text-xs text-slate-600">
                    <div>{t.phone || 'No Phone'}</div>
                    <div className="text-[11px] text-slate-400">{t.email || ''}</div>
                  </td>
                  <td className="py-3.5">
                    {t.activeUnit ? (
                      <div>
                        <span className="font-semibold text-slate-800 text-xs block">{t.activeUnit.unitName}</span>
                        <span className="text-[11px] text-slate-400">{t.activeUnit.propertyId?.name}</span>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400 italic">No Active Unit</span>
                    )}
                  </td>
                  <td className="py-3.5 font-bold text-slate-800 text-xs">
                    {t.currentRentAgreement ? formatCurrency(t.currentRentAgreement.monthlyRate) : 'N/A'}
                  </td>
                  <td className="py-3.5">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                      t.activeAssignment
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-slate-100 text-slate-600'
                    }`}>
                      {t.activeAssignment ? 'Active Lease' : 'Inactive'}
                    </span>
                  </td>
                  <td className="py-3.5 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {t.activeAssignment && (
                        <>
                          <button
                            onClick={() => {
                              setIncreaseForm({
                                assignmentId: t.activeAssignment._id,
                                newRate: '',
                                effectiveFrom: '2026-04-01',
                                reason: ''
                              });
                              setShowIncreaseModal(true);
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors border border-emerald-200"
                            title="Revise monthly rent amount"
                          >
                            <TrendingUp className="w-3 h-3" />
                            <span>Revise</span>
                          </button>
                          <button
                            onClick={() => {
                              setVacateForm({
                                assignmentId: t.activeAssignment._id,
                                tenantName: t.name,
                                unitName: t.activeUnit?.unitName || 'Unit',
                                endDate: new Date().toISOString().split('T')[0],
                                depositRefunded: String(t.activeAssignment.depositHeld || '0'),
                                notes: ''
                              });
                              setShowVacateModal(true);
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-lg transition-colors border border-amber-200"
                            title="Mark tenant as vacated to free up unit"
                          >
                            <LogOut className="w-3 h-3" />
                            <span>Vacate</span>
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => openEditTenant(t)}
                        title="Edit Tenant"
                        className="p-1.5 text-slate-400 hover:text-emerald-700 hover:bg-slate-100 rounded-lg transition-colors"
                      >
                        <Edit className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteTenant(t._id)}
                        title="Delete Tenant"
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create / Edit Tenant Modal */}
      {showTenantModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-lg w-full p-6">
            <h3 className="text-lg font-bold text-slate-900 mb-4">
              {editingTenant ? 'Edit Tenant Master' : 'Register New Tenant'}
            </h3>
            <form onSubmit={handleSaveTenant} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Tenant Code <span className="text-slate-400 font-normal">(Auto-generated)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Auto-generated from name"
                    value={tenantForm.tenantCode}
                    readOnly={!editingTenant}
                    onChange={(e) => setTenantForm({ ...tenantForm, tenantCode: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 text-slate-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Tenant Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Ramesh Kumar"
                    value={tenantForm.name}
                    onChange={(e) => {
                      const name = e.target.value;
                      const clean = name.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 6);
                      setTenantForm(prev => ({
                        ...prev,
                        name,
                        tenantCode: editingTenant ? prev.tenantCode : (clean ? `TEN-${clean}` : '')
                      }));
                    }}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-semibold text-slate-800"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Phone Number</label>
                  <input
                    type="text"
                    placeholder="e.g. +91 9876543210"
                    value={tenantForm.phone}
                    onChange={(e) => setTenantForm({ ...tenantForm, phone: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Email</label>
                  <input
                    type="email"
                    placeholder="e.g. contact@delhiery.com"
                    value={tenantForm.email}
                    onChange={(e) => setTenantForm({ ...tenantForm, email: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Tenant Type</label>
                  <select
                    value={tenantForm.tenantType}
                    onChange={(e) => setTenantForm({ ...tenantForm, tenantType: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                  >
                    <option value="Individual">Individual</option>
                    <option value="Commercial Entity">Commercial Entity</option>
                    <option value="PG Operator">PG Operator</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Address</label>
                  <input
                    type="text"
                    placeholder="Tenant Address"
                    value={tenantForm.address}
                    onChange={(e) => setTenantForm({ ...tenantForm, address: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Notes / Terms</label>
                <textarea
                  rows="2"
                  value={tenantForm.notes}
                  onChange={(e) => setTenantForm({ ...tenantForm, notes: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setShowTenantModal(false);
                    setEditingTenant(null);
                  }}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-sm"
                >
                  {editingTenant ? 'Save Changes' : 'Register Tenant'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Assign Lease Modal */}
      {showAssignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-lg w-full p-6">
            <h3 className="text-lg font-bold text-slate-900 mb-4">Assign Lease & Initial Rent Agreement</h3>
            <form onSubmit={handleAssignTenant} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <SearchableSelect
                    label="Tenant"
                    required
                    placeholder="Choose Tenant..."
                    options={tenants.map(t => ({
                      value: t._id,
                      label: t.name,
                      subtext: t.tenantCode,
                      badge: t.activeAssignment ? 'Occupied' : 'Available',
                      badgeColor: t.activeAssignment ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                    }))}
                    value={assignForm.tenantId}
                    onChange={(tId) => setAssignForm(prev => ({ ...prev, tenantId: tId }))}
                  />
                </div>
                <div>
                  <SearchableSelect
                    label="Unit to Assign"
                    required
                    placeholder="Choose Unit..."
                    options={units.map(u => ({
                      value: u._id,
                      label: u.unitName,
                      subtext: `${u.unitCode} • ${u.propertyId?.name || ''}`,
                      badge: u.occupancyStatus === 'Occupied' ? 'Already Occupied' : 'Vacant',
                      badgeColor: u.occupancyStatus === 'Occupied' ? 'bg-rose-100 text-rose-800 font-bold' : 'bg-emerald-100 text-emerald-800',
                      disabled: u.occupancyStatus === 'Occupied'
                    }))}
                    value={assignForm.unitId}
                    onChange={(uId, rawUnit) => {
                      const matchedUnit = units.find(u => u._id === uId);
                      const rate = matchedUnit?.currentRentAgreement?.monthlyRate || '';
                      setAssignForm(prev => ({
                        ...prev,
                        unitId: uId,
                        monthlyRate: rate ? String(rate) : prev.monthlyRate
                      }));
                    }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Start Date</label>
                  <input
                    type="date"
                    required
                    value={assignForm.startDate}
                    onChange={(e) => setAssignForm({ ...assignForm, startDate: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Monthly Rent Rate (₹)</label>
                  <input
                    type="number"
                    required
                    placeholder="e.g. 75000"
                    value={assignForm.monthlyRate}
                    onChange={(e) => setAssignForm({ ...assignForm, monthlyRate: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Security Deposit Held (₹)</label>
                  <input
                    type="number"
                    value={assignForm.depositHeld}
                    onChange={(e) => setAssignForm({ ...assignForm, depositHeld: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Rent Frequency</label>
                  <select
                    value={assignForm.rentType}
                    onChange={(e) => setAssignForm({ ...assignForm, rentType: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                  >
                    <option value="Monthly Fixed">Monthly Fixed</option>
                    <option value="Annual Lump-Sum">Annual Lump-Sum</option>
                    <option value="Fixed Term">Fixed Term</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Notes / Terms</label>
                <textarea
                  rows="2"
                  value={assignForm.notes}
                  onChange={(e) => setAssignForm({ ...assignForm, notes: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAssignModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-sm"
                >
                  Create Lease Assignment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Revise Rent Modal */}
      {showIncreaseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-slate-900 mb-4">Revise Unit Rent Rate</h3>
            <form onSubmit={handleIncreaseRent} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">New Monthly Rent Rate (₹)</label>
                <input
                  type="number"
                  required
                  placeholder="e.g. 80000"
                  value={increaseForm.newRate}
                  onChange={(e) => setIncreaseForm({ ...increaseForm, newRate: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Effective From Date</label>
                <input
                  type="date"
                  required
                  value={increaseForm.effectiveFrom}
                  onChange={(e) => setIncreaseForm({ ...increaseForm, effectiveFrom: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Reason for Revision</label>
                <input
                  type="text"
                  placeholder="e.g. Annual contractual 10% rent increment"
                  value={increaseForm.reason}
                  onChange={(e) => setIncreaseForm({ ...increaseForm, reason: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowIncreaseModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-sm"
                >
                  Save Rent Revision
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Vacate Tenant Modal */}
      {showVacateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-scaleUp">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center">
                <LogOut className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">Vacate Tenant & Free Unit</h3>
                <p className="text-xs text-slate-500">
                  {vacateForm.tenantName} · {vacateForm.unitName}
                </p>
              </div>
            </div>

            <form onSubmit={handleVacateTenant} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Vacating End Date *</label>
                <input
                  type="date"
                  required
                  value={vacateForm.endDate}
                  onChange={(e) => setVacateForm({ ...vacateForm, endDate: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Security Deposit Refunded (₹)</label>
                <input
                  type="number"
                  value={vacateForm.depositRefunded}
                  onChange={(e) => setVacateForm({ ...vacateForm, depositRefunded: e.target.value })}
                  placeholder="0"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <p className="text-[11px] text-slate-400 mt-1">Amount returned from initial deposit</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Remarks / Inspection Notes</label>
                <textarea
                  rows="2"
                  placeholder="e.g. Handover keys received, bills settled"
                  value={vacateForm.notes}
                  onChange={(e) => setVacateForm({ ...vacateForm, notes: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowVacateModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-xl shadow-sm"
                >
                  Confirm Vacate
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
