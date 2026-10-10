import React, { useState, useEffect } from 'react';
import API from '../services/api';
import { formatCurrency, formatDate } from '../utils/formatters';
import { Users, Plus, Search, UserCheck, TrendingUp, Calendar, AlertCircle } from 'lucide-react';

export default function TenantsView() {
  const [tenants, setTenants] = useState([]);
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showTenantModal, setShowTenantModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showIncreaseModal, setShowIncreaseModal] = useState(false);
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

  const handleCreateTenant = async (e) => {
    e.preventDefault();
    try {
      const res = await API.post('/tenants', tenantForm);
      if (res.data.success) {
        setShowTenantModal(false);
        setTenantForm({ tenantCode: '', name: '', phone: '', email: '', tenantType: 'Individual', address: '', notes: '' });
        fetchData();
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to create tenant');
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
      const res = await API.post(`/assignments/${increaseForm.assignmentId}/increase-rent`, {
        newRate: increaseForm.newRate,
        effectiveFrom: increaseForm.effectiveFrom,
        reason: increaseForm.reason
      });
      if (res.data.success) {
        setShowIncreaseModal(false);
        alert('Rent revision saved successfully with preserved historical effective dates');
        fetchData();
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to increase rent');
    }
  };

  const filteredTenants = tenants.filter(t =>
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.tenantCode.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-200/80">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Tenants & Lease Agreements</h2>
          <p className="text-sm text-slate-500">Manage tenant profiles, active unit assignments, and effective-dated rent revisions</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowTenantModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>Add Tenant</span>
          </button>
          <button
            onClick={() => setShowAssignModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition-colors shadow-sm"
          >
            <UserCheck className="w-4 h-4" />
            <span>New Occupancy Lease</span>
          </button>
        </div>
      </div>

      {/* Tenants Table */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h3 className="font-bold text-slate-800 text-base">All Registered Tenants ({filteredTenants.length})</h3>
          <div className="relative max-w-xs w-full">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search tenant name or code..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs text-slate-400 uppercase">
                <th className="pb-3 font-semibold">Tenant Name & Code</th>
                <th className="pb-3 font-semibold">Type</th>
                <th className="pb-3 font-semibold">Current Unit Occupied</th>
                <th className="pb-3 font-semibold">Property</th>
                <th className="pb-3 font-semibold">Occupancy Status</th>
                <th className="pb-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredTenants.map((t) => (
                <tr key={t._id} className="hover:bg-slate-50/50">
                  <td className="py-3.5">
                    <span className="font-bold text-slate-900 text-sm block">{t.name}</span>
                    <span className="text-xs text-slate-400 font-mono">{t.tenantCode}</span>
                  </td>
                  <td className="py-3.5 text-xs text-slate-600">{t.tenantType}</td>
                  <td className="py-3.5 text-xs">
                    {t.activeUnit ? (
                      <div>
                        <span className="font-semibold text-slate-800 block">{t.activeUnit.unitName}</span>
                        <span className="text-[11px] text-slate-400">{t.activeUnit.unitCode}</span>
                      </div>
                    ) : (
                      <span className="text-slate-400 italic">No Active Unit</span>
                    )}
                  </td>
                  <td className="py-3.5 text-xs text-slate-600">
                    {t.activeUnit?.propertyId?.name || '—'}
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
                    {t.activeAssignment && (
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
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors border border-emerald-200"
                      >
                        <TrendingUp className="w-3.5 h-3.5" />
                        <span>Revise Rent</span>
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Tenant Modal */}
      {showTenantModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-lg w-full p-6">
            <h3 className="text-lg font-bold text-slate-900 mb-4">Register New Tenant</h3>
            <form onSubmit={handleCreateTenant} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Tenant Code</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. TEN-DELHIERY"
                    value={tenantForm.tenantCode}
                    onChange={(e) => setTenantForm({ ...tenantForm, tenantCode: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Tenant Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Delhiery Pvt Ltd"
                    value={tenantForm.name}
                    onChange={(e) => setTenantForm({ ...tenantForm, name: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Mobile / Phone</label>
                  <input
                    type="text"
                    placeholder="+91 98765 43210"
                    value={tenantForm.phone}
                    onChange={(e) => setTenantForm({ ...tenantForm, phone: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Tenant Type</label>
                  <select
                    value={tenantForm.tenantType}
                    onChange={(e) => setTenantForm({ ...tenantForm, tenantType: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                  >
                    <option value="Individual">Individual</option>
                    <option value="Commercial Entity">Commercial Entity</option>
                    <option value="PG Operator">PG Operator</option>
                    <option value="Co-tenant">Co-tenant</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Notes / Terms</label>
                <textarea
                  rows="2"
                  placeholder="Terms, agreements or historical remarks"
                  value={tenantForm.notes}
                  onChange={(e) => setTenantForm({ ...tenantForm, notes: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowTenantModal(false)}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-sm"
                >
                  Save Tenant
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New Occupancy Lease Modal */}
      {showAssignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-lg w-full p-6">
            <h3 className="text-lg font-bold text-slate-900 mb-4">Assign Unit Lease to Tenant</h3>
            <form onSubmit={handleAssignTenant} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Select Tenant</label>
                  <select
                    required
                    value={assignForm.tenantId}
                    onChange={(e) => setAssignForm({ ...assignForm, tenantId: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                  >
                    <option value="">Select Tenant...</option>
                    {tenants.map(t => (
                      <option key={t._id} value={t._id}>{t.name} ({t.tenantCode})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Select Unit</label>
                  <select
                    required
                    value={assignForm.unitId}
                    onChange={(e) => setAssignForm({ ...assignForm, unitId: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                  >
                    <option value="">Select Unit...</option>
                    {units.map(u => (
                      <option key={u._id} value={u._id}>{u.unitName} ({u.unitCode})</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Monthly Rent Rate (₹)</label>
                  <input
                    type="number"
                    required
                    placeholder="e.g. 25000"
                    value={assignForm.monthlyRate}
                    onChange={(e) => setAssignForm({ ...assignForm, monthlyRate: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Security Deposit (₹)</label>
                  <input
                    type="number"
                    value={assignForm.depositHeld}
                    onChange={(e) => setAssignForm({ ...assignForm, depositHeld: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAssignModal(false)}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-sm"
                >
                  Create Lease
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Revise / Increase Rent Modal */}
      {showIncreaseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-lg w-full p-6">
            <h3 className="text-lg font-bold text-slate-900 mb-2">Revise Rent (Effective-Dated)</h3>
            <p className="text-xs text-slate-500 mb-4">
              Historical rent amounts will never be overwritten. Prior months will continue to calculate expected rent based on the historical rate.
            </p>
            <form onSubmit={handleIncreaseRent} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">New Monthly Rate (₹)</label>
                <input
                  type="number"
                  required
                  placeholder="e.g. 35000"
                  value={increaseForm.newRate}
                  onChange={(e) => setIncreaseForm({ ...increaseForm, newRate: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Effective From Date</label>
                <input
                  type="date"
                  required
                  value={increaseForm.effectiveFrom}
                  onChange={(e) => setIncreaseForm({ ...increaseForm, effectiveFrom: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Reason for Revision / Notice</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Annual 10% rent increment from April 2026"
                  value={increaseForm.reason}
                  onChange={(e) => setIncreaseForm({ ...increaseForm, reason: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowIncreaseModal(false)}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-sm"
                >
                  Apply Revision
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
