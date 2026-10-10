import React, { useState, useEffect } from 'react';
import API from '../services/api';
import { formatCurrency } from '../utils/formatters';
import { Building2, Plus, Search, Home, ChevronRight, CheckCircle2, AlertCircle } from 'lucide-react';

export default function PropertiesView() {
  const [properties, setProperties] = useState([]);
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedProperty, setSelectedProperty] = useState(null);
  const [search, setSearch] = useState('');
  const [showPropModal, setShowPropModal] = useState(false);
  const [showUnitModal, setShowUnitModal] = useState(false);

  // Form states
  const [propForm, setPropForm] = useState({
    propertyCode: '',
    name: '',
    propertyType: 'Commercial Godown',
    address: '',
    ownerOrResponsiblePerson: 'Owner',
    description: ''
  });

  const [unitForm, setUnitForm] = useState({
    unitCode: '',
    propertyId: '',
    unitName: '',
    unitType: 'Room',
    floor: '',
    notes: ''
  });

  const fetchData = async () => {
    try {
      setLoading(true);
      const [pRes, uRes] = await Promise.all([
        API.get('/properties'),
        API.get('/units')
      ]);
      if (pRes.data.success) setProperties(pRes.data.data);
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

  const handleCreateProperty = async (e) => {
    e.preventDefault();
    try {
      const res = await API.post('/properties', propForm);
      if (res.data.success) {
        setShowPropModal(false);
        setPropForm({ propertyCode: '', name: '', propertyType: 'Commercial Godown', address: '', ownerOrResponsiblePerson: 'Owner', description: '' });
        fetchData();
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to create property');
    }
  };

  const handleCreateUnit = async (e) => {
    e.preventDefault();
    try {
      const res = await API.post('/units', unitForm);
      if (res.data.success) {
        setShowUnitModal(false);
        setUnitForm({ unitCode: '', propertyId: '', unitName: '', unitType: 'Room', floor: '', notes: '' });
        fetchData();
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to create unit');
    }
  };

  const filteredProperties = properties.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.propertyCode.toLowerCase().includes(search.toLowerCase())
  );

  const displayedUnits = selectedProperty
    ? units.filter(u => u.propertyId?._id === selectedProperty._id || u.propertyId === selectedProperty._id)
    : units;

  return (
    <div className="space-y-6">
      {/* Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-200/80">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Properties & Partitions</h2>
          <p className="text-sm text-slate-500">Manage real estate assets, partitions, units, and active tenants</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowPropModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>Add Property</span>
          </button>
          <button
            onClick={() => {
              if (selectedProperty) setUnitForm(prev => ({ ...prev, propertyId: selectedProperty._id }));
              setShowUnitModal(true);
            }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>Add Unit</span>
          </button>
        </div>
      </div>

      {/* Main Grid: Property List on Left, Units on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Properties Column */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-800 text-base">Properties ({filteredProperties.length})</h3>
            {selectedProperty && (
              <button
                onClick={() => setSelectedProperty(null)}
                className="text-xs text-emerald-600 hover:underline font-semibold"
              >
                Clear Selection
              </button>
            )}
          </div>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search properties..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
            {filteredProperties.map(p => {
              const isSelected = selectedProperty?._id === p._id;
              return (
                <div
                  key={p._id}
                  onClick={() => setSelectedProperty(p)}
                  className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                    isSelected
                      ? 'border-emerald-600 bg-emerald-50/50 shadow-sm'
                      : 'border-slate-200/70 hover:border-slate-300 hover:bg-slate-50/50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-emerald-800 bg-emerald-100/70 px-2 py-0.5 rounded-md">
                      {p.propertyCode}
                    </span>
                    <span className="text-xs text-slate-400">{p.unitCount} units</span>
                  </div>
                  <h4 className="font-semibold text-slate-900 text-sm mt-2">{p.name}</h4>
                  <p className="text-xs text-slate-500 mt-0.5">{p.propertyType}</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Units Column */}
        <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-800 text-base">
                {selectedProperty ? `Units for ${selectedProperty.name}` : `All Partitions & Units (${displayedUnits.length})`}
              </h3>
              <p className="text-xs text-slate-500">Individual spaces with independent tenant occupancy and rates</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs text-slate-400 uppercase">
                  <th className="pb-3 font-semibold">Unit Code / Name</th>
                  <th className="pb-3 font-semibold">Type</th>
                  <th className="pb-3 font-semibold">Current Tenant</th>
                  <th className="pb-3 font-semibold">Monthly Rate</th>
                  <th className="pb-3 font-semibold text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {displayedUnits.map((u) => (
                  <tr key={u._id} className="hover:bg-slate-50/50">
                    <td className="py-3">
                      <span className="font-bold text-slate-900 text-xs block">{u.unitCode}</span>
                      <span className="text-xs text-slate-500">{u.unitName}</span>
                    </td>
                    <td className="py-3 text-xs text-slate-600">{u.unitType}</td>
                    <td className="py-3">
                      {u.currentTenant ? (
                        <div>
                          <span className="font-semibold text-slate-800 text-xs block">{u.currentTenant.name}</span>
                          <span className="text-[11px] text-slate-400">{u.currentTenant.tenantCode}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400 italic">Vacant</span>
                      )}
                    </td>
                    <td className="py-3 font-semibold text-slate-800 text-xs">
                      {u.currentRentAgreement ? formatCurrency(u.currentRentAgreement.monthlyRate) : 'N/A'}
                    </td>
                    <td className="py-3 text-right">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                        u.occupancyStatus === 'Occupied'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}>
                        {u.occupancyStatus}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Add Property Modal */}
      {showPropModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-lg w-full p-6">
            <h3 className="text-lg font-bold text-slate-900 mb-4">Create New Property</h3>
            <form onSubmit={handleCreateProperty} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Property Code</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. PROP-BYCULLA"
                    value={propForm.propertyCode}
                    onChange={(e) => setPropForm({ ...propForm, propertyCode: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Property Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Byculla Club"
                    value={propForm.name}
                    onChange={(e) => setPropForm({ ...propForm, name: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Property Type</label>
                <select
                  value={propForm.propertyType}
                  onChange={(e) => setPropForm({ ...propForm, propertyType: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                >
                  <option value="Commercial Godown">Commercial Godown</option>
                  <option value="Residential Apartment">Residential Apartment</option>
                  <option value="Commercial Office">Commercial Office</option>
                  <option value="Garage">Garage</option>
                  <option value="PG Facility">PG Facility</option>
                  <option value="Room">Room</option>
                  <option value="Mixed Use">Mixed Use</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Address / Location</label>
                <input
                  type="text"
                  placeholder="e.g. Byculla, Mumbai"
                  value={propForm.address}
                  onChange={(e) => setPropForm({ ...propForm, address: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowPropModal(false)}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-sm"
                >
                  Save Property
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Unit Modal */}
      {showUnitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-lg w-full p-6">
            <h3 className="text-lg font-bold text-slate-900 mb-4">Create New Unit / Partition</h3>
            <form onSubmit={handleCreateUnit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Parent Property</label>
                <select
                  required
                  value={unitForm.propertyId}
                  onChange={(e) => setUnitForm({ ...unitForm, propertyId: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                >
                  <option value="">Select Property...</option>
                  {properties.map(p => (
                    <option key={p._id} value={p._id}>{p.name} ({p.propertyCode})</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Unit Code</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. BY-01"
                    value={unitForm.unitCode}
                    onChange={(e) => setUnitForm({ ...unitForm, unitCode: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Unit Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Ground Floor Shop"
                    value={unitForm.unitName}
                    onChange={(e) => setUnitForm({ ...unitForm, unitName: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Unit Type</label>
                <select
                  value={unitForm.unitType}
                  onChange={(e) => setUnitForm({ ...unitForm, unitType: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                >
                  <option value="Room">Room</option>
                  <option value="Godown Partition">Godown Partition</option>
                  <option value="Shop / Salon">Shop / Salon</option>
                  <option value="Attic">Attic</option>
                  <option value="Flat">Flat</option>
                  <option value="PG Beds">PG Beds</option>
                  <option value="Garage Space">Garage Space</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowUnitModal(false)}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-sm"
                >
                  Save Unit
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
