import React, { useState, useEffect } from 'react';
import API from '../services/api';
import { formatCurrency } from '../utils/formatters';
import SearchableSelect from '../components/SearchableSelect';
import { Building2, Plus, Search, Home, ChevronRight, CheckCircle2, AlertCircle, Edit, Trash2 } from 'lucide-react';

export default function PropertiesView() {
  const [properties, setProperties] = useState([]);
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedProperty, setSelectedProperty] = useState(null);
  const [search, setSearch] = useState('');
  
  // Modals
  const [showPropModal, setShowPropModal] = useState(false);
  const [editingProperty, setEditingProperty] = useState(null);
  const [showUnitModal, setShowUnitModal] = useState(false);
  const [editingUnit, setEditingUnit] = useState(null);

  // Form states
  const [propForm, setPropForm] = useState({
    propertyCode: '',
    name: '',
    propertyType: 'Commercial Godown',
    address: '',
    ownerOrResponsiblePerson: 'Owner',
    description: ''
  });

  const [tenantsList, setTenantsList] = useState([]);

  const [unitForm, setUnitForm] = useState({
    unitCode: '',
    propertyId: '',
    unitName: '',
    unitType: 'Room',
    floor: '',
    notes: '',
    // Quick Tenant Link
    tenantMode: 'existing', // 'existing', 'new', 'vacant'
    tenantId: '',
    newTenantName: '',
    tenantPhone: '',
    monthlyRate: '',
    startDate: new Date().toISOString().split('T')[0]
  });

  const fetchData = async () => {
    try {
      setLoading(true);
      const [pRes, uRes, tRes] = await Promise.all([
        API.get('/properties'),
        API.get('/units'),
        API.get('/tenants')
      ]);
      if (pRes.data.success) setProperties(pRes.data.data);
      if (uRes.data.success) setUnits(uRes.data.data);
      if (tRes.data.success) setTenantsList(tRes.data.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Save / Update Property
  const handleSaveProperty = async (e) => {
    e.preventDefault();
    try {
      if (editingProperty) {
        const res = await API.put(`/properties/${editingProperty._id}`, propForm);
        if (res.data.success) {
          setShowPropModal(false);
          setEditingProperty(null);
          fetchData();
        }
      } else {
        const res = await API.post('/properties', propForm);
        if (res.data.success) {
          setShowPropModal(false);
          setPropForm({ propertyCode: '', name: '', propertyType: 'Commercial Godown', address: '', ownerOrResponsiblePerson: 'Owner', description: '' });
          fetchData();
        }
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to save property');
    }
  };

  // Delete Property
  const handleDeleteProperty = async (propId, e) => {
    e.stopPropagation();
    if (!window.confirm('Are you sure you want to delete this property?')) return;
    try {
      const res = await API.delete(`/properties/${propId}`);
      if (res.data.success) {
        if (selectedProperty?._id === propId) setSelectedProperty(null);
        fetchData();
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to delete property');
    }
  };

  // Open Edit Property Modal
  const openEditProperty = (prop, e) => {
    e.stopPropagation();
    setEditingProperty(prop);
    setPropForm({
      propertyCode: prop.propertyCode || '',
      name: prop.name || '',
      propertyType: prop.propertyType || 'Commercial Godown',
      address: prop.address || '',
      ownerOrResponsiblePerson: prop.ownerOrResponsiblePerson || 'Owner',
      description: prop.description || ''
    });
    setShowPropModal(true);
  };

  // Save / Update Unit
  const handleSaveUnit = async (e) => {
    e.preventDefault();
    try {
      if (editingUnit) {
        const res = await API.put(`/units/${editingUnit._id}`, unitForm);
        if (res.data.success) {
          setShowUnitModal(false);
          setEditingUnit(null);
          fetchData();
        }
      } else {
        const res = await API.post('/units', unitForm);
        if (res.data.success) {
          setShowUnitModal(false);
          setUnitForm({ unitCode: '', propertyId: '', unitName: '', unitType: 'Room', floor: '', notes: '' });
          fetchData();
        }
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to save unit');
    }
  };

  // Open Edit Unit Modal
  const openEditUnit = (unit) => {
    setEditingUnit(unit);
    setUnitForm({
      unitCode: unit.unitCode || '',
      propertyId: unit.propertyId?._id || unit.propertyId || '',
      unitName: unit.unitName || '',
      unitType: unit.unitType || 'Room',
      floor: unit.floor || '',
      notes: unit.notes || '',
      tenantMode: unit.currentTenant ? 'existing' : 'vacant',
      tenantId: unit.currentTenant?._id || '',
      newTenantName: '',
      tenantPhone: '',
      monthlyRate: unit.currentRentAgreement?.monthlyRate || '',
      startDate: new Date().toISOString().split('T')[0]
    });
    setShowUnitModal(true);
  };

  // Delete Unit
  const handleDeleteUnit = async (unitId) => {
    if (!window.confirm('Are you sure you want to delete this unit?')) return;
    try {
      const res = await API.delete(`/units/${unitId}`);
      if (res.data.success) {
        fetchData();
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to delete unit');
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
          <h2 className="text-xl font-bold text-slate-900">Properties & Partitions Master</h2>
          <p className="text-sm text-slate-500">Manage real estate assets, partitioned units, and edit details</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setEditingUnit(null);
              setUnitForm({
                unitCode: '',
                propertyId: selectedProperty?._id || (properties[0]?._id || ''),
                unitName: '',
                unitType: 'Room',
                floor: '',
                notes: '',
                tenantMode: 'vacant',
                tenantId: '',
                newTenantName: '',
                tenantPhone: '',
                monthlyRate: '',
                startDate: new Date().toISOString().split('T')[0]
              });
              setShowUnitModal(true);
            }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-semibold transition-colors"
          >
            <Plus className="w-4 h-4 text-emerald-600" />
            <span>Add Partition / Unit</span>
          </button>
          <button
            onClick={() => {
              setEditingProperty(null);
              setPropForm({ propertyCode: '', name: '', propertyType: 'Commercial Godown', address: '', ownerOrResponsiblePerson: 'Owner', description: '' });
              setShowPropModal(true);
            }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>Add Property</span>
          </button>
        </div>
      </div>

      {/* Main Grid: Left side Property cards, Right side Partition units */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Properties Column */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider">
              Properties ({filteredProperties.length})
            </h3>
            {selectedProperty && (
              <button
                onClick={() => setSelectedProperty(null)}
                className="text-xs text-emerald-600 hover:underline font-semibold"
              >
                Show All Units
              </button>
            )}
          </div>

          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
            <input
              type="text"
              placeholder="Search properties..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 text-xs rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
            {filteredProperties.map((p) => {
              const isSelected = selectedProperty?._id === p._id;
              return (
                <div
                  key={p._id}
                  onClick={() => setSelectedProperty(isSelected ? null : p)}
                  className={`p-4 rounded-xl border cursor-pointer transition-all ${
                    isSelected
                      ? 'border-emerald-500 bg-emerald-50/40 shadow-sm'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs">
                        <Building2 className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-900 text-sm">{p.name}</h4>
                        <span className="text-[11px] font-mono text-slate-400">{p.propertyCode}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={(e) => openEditProperty(p, e)}
                        title="Edit Property"
                        className="p-1.5 text-slate-400 hover:text-emerald-700 hover:bg-slate-100 rounded-lg transition-colors"
                      >
                        <Edit className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => handleDeleteProperty(p._id, e)}
                        title="Delete Property"
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between text-xs text-slate-500 border-t border-slate-100 pt-2.5">
                    <span>{p.propertyType}</span>
                    <span className="font-semibold text-slate-700">{p.unitCount || 0} Units</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Partition Units Table Column */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100">
            <div>
              <h3 className="font-bold text-slate-900 text-base">
                {selectedProperty ? `${selectedProperty.name} Units` : 'All Partitioned Units'}
              </h3>
              <p className="text-xs text-slate-400">
                {displayedUnits.length} total units registered
              </p>
            </div>
          </div>

          <div className="overflow-x-auto mt-4">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 text-slate-400 uppercase font-semibold">
                  <th className="pb-3">Unit Code & Name</th>
                  <th className="pb-3">Type</th>
                  <th className="pb-3">Current Tenant</th>
                  <th className="pb-3">Monthly Rate</th>
                  <th className="pb-3">Status</th>
                  <th className="pb-3 text-right">Actions</th>
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
                    <td className="py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                        u.occupancyStatus === 'Occupied'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}>
                        {u.occupancyStatus}
                      </span>
                    </td>
                    <td className="py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openEditUnit(u)}
                          title="Edit Unit"
                          className="p-1.5 text-slate-400 hover:text-emerald-700 hover:bg-slate-100 rounded-lg transition-colors"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteUnit(u._id)}
                          title="Delete Unit"
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
      </div>

      {/* Create / Edit Property Modal */}
      {showPropModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-lg w-full p-6">
            <h3 className="text-lg font-bold text-slate-900 mb-4">
              {editingProperty ? 'Edit Property Master' : 'Create New Property'}
            </h3>
            <form onSubmit={handleSaveProperty} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Property Code <span className="text-slate-400 font-normal">(Auto-generated)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Auto-generated from name"
                    value={propForm.propertyCode}
                    readOnly={!editingProperty}
                    onChange={(e) => setPropForm({ ...propForm, propertyCode: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 text-slate-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Property Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Byculla Club"
                    value={propForm.name}
                    onChange={(e) => {
                      const name = e.target.value;
                      const clean = name.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 6);
                      setPropForm(prev => ({
                        ...prev,
                        name,
                        propertyCode: editingProperty ? prev.propertyCode : (clean ? `PROP-${clean}` : '')
                      }));
                    }}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-semibold text-slate-800"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Property Type</label>
                  <select
                    value={propForm.propertyType}
                    onChange={(e) => setPropForm({ ...propForm, propertyType: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                  >
                    <option value="Commercial Godown">Commercial Godown</option>
                    <option value="Commercial Office">Commercial Office</option>
                    <option value="Residential Apartment">Residential Apartment</option>
                    <option value="Garage">Garage</option>
                    <option value="Room">Room</option>
                    <option value="PG Property">PG Property</option>
                    <option value="Mixed Use">Mixed Use</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Responsible Person</label>
                  <input
                    type="text"
                    value={propForm.ownerOrResponsiblePerson}
                    onChange={(e) => setPropForm({ ...propForm, ownerOrResponsiblePerson: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Address</label>
                <input
                  type="text"
                  placeholder="Address details"
                  value={propForm.address}
                  onChange={(e) => setPropForm({ ...propForm, address: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Description / Notes</label>
                <textarea
                  rows="2"
                  value={propForm.description}
                  onChange={(e) => setPropForm({ ...propForm, description: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setShowPropModal(false);
                    setEditingProperty(null);
                  }}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-sm"
                >
                  {editingProperty ? 'Save Changes' : 'Create Property'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create / Edit Unit Modal */}
      {showUnitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-lg w-full p-6">
            <h3 className="text-lg font-bold text-slate-900 mb-4">
              {editingUnit ? 'Edit Unit Master' : 'Add New Partition / Unit'}
            </h3>
            <form onSubmit={handleSaveUnit} className="space-y-4">
              <div>
                <SearchableSelect
                  label="Parent Property"
                  required
                  placeholder="Select Property..."
                  options={properties.map(p => ({
                    value: p._id,
                    label: p.name,
                    subtext: p.propertyCode,
                    badge: p.propertyType
                  }))}
                  value={unitForm.propertyId}
                  onChange={(pId) => setUnitForm(prev => ({ ...prev, propertyId: pId }))}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Unit Code <span className="text-slate-400 font-normal">(Auto-generated)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Auto-generated"
                    value={unitForm.unitCode}
                    readOnly={!editingUnit}
                    onChange={(e) => setUnitForm({ ...unitForm, unitCode: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 text-slate-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Unit Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Ground Floor Shop"
                    value={unitForm.unitName}
                    onChange={(e) => {
                      const name = e.target.value;
                      const clean = name.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 6);
                      setUnitForm(prev => ({
                        ...prev,
                        unitName: name,
                        unitCode: editingUnit ? prev.unitCode : (clean ? `U-${clean}` : '')
                      }));
                    }}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-semibold text-slate-800"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Unit Type</label>
                  <input
                    type="text"
                    placeholder="e.g. Room, Godown, Shop"
                    value={unitForm.unitType}
                    onChange={(e) => setUnitForm({ ...unitForm, unitType: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Floor</label>
                  <input
                    type="text"
                    placeholder="e.g. Ground / 1st Floor"
                    value={unitForm.floor}
                    onChange={(e) => setUnitForm({ ...unitForm, floor: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              {/* Direct Tenant & Rent Rate Section */}
              <div className="p-3.5 bg-emerald-50/50 rounded-xl border border-emerald-100 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-emerald-950 flex items-center gap-1.5">
                    <span>Tenant & Monthly Rent (Single-Step)</span>
                  </label>
                  <div className="flex items-center gap-2 text-[11px]">
                    <label className="flex items-center gap-1 cursor-pointer">
                      <input
                        type="radio"
                        name="tenantMode"
                        value="vacant"
                        checked={unitForm.tenantMode === 'vacant'}
                        onChange={() => setUnitForm({ ...unitForm, tenantMode: 'vacant', tenantId: '', monthlyRate: '' })}
                        className="text-emerald-600 focus:ring-emerald-500"
                      />
                      <span>Vacant (No Tenant)</span>
                    </label>
                    <label className="flex items-center gap-1 cursor-pointer">
                      <input
                        type="radio"
                        name="tenantMode"
                        value="existing"
                        checked={unitForm.tenantMode === 'existing'}
                        onChange={() => setUnitForm({ ...unitForm, tenantMode: 'existing' })}
                        className="text-emerald-600 focus:ring-emerald-500"
                      />
                      <span>Select Tenant</span>
                    </label>
                    <label className="flex items-center gap-1 cursor-pointer">
                      <input
                        type="radio"
                        name="tenantMode"
                        value="new"
                        checked={unitForm.tenantMode === 'new'}
                        onChange={() => setUnitForm({ ...unitForm, tenantMode: 'new', tenantId: '' })}
                        className="text-emerald-600 focus:ring-emerald-500"
                      />
                      <span>+ New Tenant</span>
                    </label>
                  </div>
                </div>

                {unitForm.tenantMode === 'existing' && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <SearchableSelect
                        label="Select Tenant"
                        placeholder="Choose Tenant..."
                        options={tenantsList.map(t => ({
                          value: t._id,
                          label: t.name,
                          subtext: t.tenantCode,
                          badge: t.activeAssignment ? 'Occupied Elsewhere' : 'Available',
                          badgeColor: t.activeAssignment ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                        }))}
                        value={unitForm.tenantId}
                        onChange={(tId) => setUnitForm(prev => ({ ...prev, tenantId: tId }))}
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Monthly Rent (₹)</label>
                      <input
                        type="number"
                        placeholder="e.g. 25000"
                        value={unitForm.monthlyRate}
                        onChange={(e) => setUnitForm({ ...unitForm, monthlyRate: e.target.value })}
                        className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-semibold"
                      />
                    </div>
                  </div>
                )}

                {unitForm.tenantMode === 'new' && (
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">New Tenant Name</label>
                      <input
                        type="text"
                        placeholder="e.g. Ramesh Kumar"
                        value={unitForm.newTenantName}
                        onChange={(e) => setUnitForm({ ...unitForm, newTenantName: e.target.value })}
                        className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Phone Number</label>
                      <input
                        type="text"
                        placeholder="e.g. 9876543210"
                        value={unitForm.tenantPhone}
                        onChange={(e) => setUnitForm({ ...unitForm, tenantPhone: e.target.value })}
                        className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Monthly Rent (₹)</label>
                      <input
                        type="number"
                        placeholder="e.g. 25000"
                        value={unitForm.monthlyRate}
                        onChange={(e) => setUnitForm({ ...unitForm, monthlyRate: e.target.value })}
                        className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-semibold"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Notes / Terms</label>
                <textarea
                  rows="2"
                  value={unitForm.notes}
                  onChange={(e) => setUnitForm({ ...unitForm, notes: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setShowUnitModal(false);
                    setEditingUnit(null);
                  }}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-sm"
                >
                  {editingUnit ? 'Save Changes' : 'Create Unit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
