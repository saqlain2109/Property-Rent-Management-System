import React, { useState, useEffect } from 'react';
import API from '../services/api';
import * as XLSX from 'xlsx';
import { formatCurrency, formatDate } from '../utils/formatters';
import SearchableSelect from '../components/SearchableSelect';
import ColumnManager, { getHeaderDragProps, useResizableColumns, ResizeHandle } from '../components/ColumnManager';
import { Users, Plus, Search, Download, TrendingUp, Edit, Trash2, LogOut, RotateCcw } from 'lucide-react';

const TENANTS_COLUMNS_DEF = [
  { id: 'tenant', label: 'Tenant Details' },
  { id: 'property', label: 'Property & Sub Unit (Partition)' },
  { id: 'startDate', label: 'Start Date' },
  { id: 'endDate', label: 'End Date' },
  { id: 'monthlyRate', label: 'Monthly Rent' },
  { id: 'deposit', label: 'Deposit' },
  { id: 'termsNotes', label: 'Terms / Notes' },
  { id: 'status', label: 'Status' },
  { id: 'actions', label: 'Actions' },
];

const DEFAULT_TENANTS_COLS = ['tenant', 'property', 'startDate', 'monthlyRate', 'deposit', 'status', 'actions'];

// Screen-fitting default column widths with sufficient space for actions buttons
const DEFAULT_TENANTS_COLUMN_WIDTHS = {
  tenant: 180,
  property: 170,
  startDate: 105,
  endDate: 100,
  monthlyRate: 110,
  deposit: 95,
  termsNotes: 140,
  status: 90,
  actions: 235
};

export default function TenantsView({ onDataChanged }) {
  const [tenants, setTenants] = useState([]);
  const [properties, setProperties] = useState([]);
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [propertyFilter, setPropertyFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const [visibleColumns, setVisibleColumns] = useState(() => {
    const saved = localStorage.getItem('cols_tenants_v2');
    if (!saved) return DEFAULT_TENANTS_COLS;
    try {
      const allowed = TENANTS_COLUMNS_DEF.map((column) => column.id);
      return JSON.parse(saved).filter((column) => allowed.includes(column));
    } catch {
      return DEFAULT_TENANTS_COLS;
    }
  });

  const {
    columnWidths,
    handleResizeStart,
    resetColumnWidths,
    hasCustomWidths
  } = useResizableColumns('tenants_v2', DEFAULT_TENANTS_COLUMN_WIDTHS);
  
  // Modals
  const [showTenantModal, setShowTenantModal] = useState(false);
  const [editingTenant, setEditingTenant] = useState(null);
  const [showIncreaseModal, setShowIncreaseModal] = useState(false);
  const [showVacateModal, setShowVacateModal] = useState(false);

  // Tenant Form with integrated Property & Vacant Sub-unit selection
  // (email and tenantType are sent via payload defaults, not shown in form)
  const [form, setForm] = useState({
    name: '',
    phone: '',
    tenantType: 'Individual',
    // Lease details
    unitId: '',
    startDate: new Date().toISOString().split('T')[0],
    endDate: '', // initially blank
    monthlyRate: '',
    depositHeld: '0',
    terms: '',
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
      const [tRes, pRes, uRes] = await Promise.all([
        API.get('/tenants'),
        API.get('/properties'),
        API.get('/units')
      ]);
      if (tRes.data.success) setTenants(tRes.data.data);
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

  // If editing, keep this tenant's current unit selectable along with vacant units.
  const availableSubUnits = units.filter(u => {
    const isCurrentlyAssignedToThis = editingTenant && editingTenant.activeUnit?._id === u._id;
    return u.occupancyStatus === 'Vacant' || isCurrentlyAssignedToThis;
  });

  const handleSaveTenant = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...form,
        monthlyRate: form.monthlyRate !== '' ? Number(form.monthlyRate) : undefined,
        depositHeld: Number(form.depositHeld) || 0,
        endDate: form.endDate || null
      };

      if (editingTenant) {
        const res = await API.put(`/tenants/${editingTenant._id}`, payload);
        if (res.data.success) {
          setShowTenantModal(false);
          setEditingTenant(null);
          fetchData();
          onDataChanged?.();
        }
      } else {
        const res = await API.post('/tenants', payload);
        if (res.data.success) {
          setShowTenantModal(false);
          fetchData();
          onDataChanged?.();
        }
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to save tenant');
    }
  };

  const openCreateTenant = () => {
    setEditingTenant(null);
    setForm({
      name: '',
      phone: '',
      tenantType: 'Individual',
      unitId: '',
      startDate: new Date().toISOString().split('T')[0],
      endDate: '',
      monthlyRate: '',
      depositHeld: '0',
      terms: '',
      notes: ''
    });
    setShowTenantModal(true);
  };

  const openEditTenant = (t) => {
    setEditingTenant(t);
    const activeUnit = t.activeUnit;
    const agreement = t.currentRentAgreement;
    const assignment = t.activeAssignment;

    setForm({
      name: t.name || '',
      phone: t.phone || '',
      tenantType: t.tenantType || 'Individual',
      unitId: activeUnit?._id || '',
      startDate: assignment?.startDate ? new Date(assignment.startDate).toISOString().split('T')[0] : '',
      endDate: assignment?.endDate ? new Date(assignment.endDate).toISOString().split('T')[0] : '',
      monthlyRate: agreement?.monthlyRate ? String(agreement.monthlyRate) : '',
      depositHeld: assignment?.depositHeld ? String(assignment.depositHeld) : '0',
      terms: agreement?.terms || '',
      notes: t.notes || ''
    });
    setShowTenantModal(true);
  };

  const handleDeleteTenant = async (tenantId) => {
    if (!window.confirm('Are you sure you want to delete this tenant?')) return;
    try {
      const res = await API.delete(`/tenants/${tenantId}`);
      if (res.data.success) {
        fetchData();
        onDataChanged?.();
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to delete tenant');
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
        onDataChanged?.();
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to vacate tenant');
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
        onDataChanged?.();
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to revise rent');
    }
  };

  const exportToExcel = () => {
    const rows = filteredTenants.map((t, idx) => ({
      'Sr No': idx + 1,
      'Tenant Name': t.name,
      'Contact Phone': t.phone || '',
      'Property': t.activeUnit?.propertyId?.name || 'Unassigned',
      'Sub Unit (Partition)': t.activeUnit ? (t.activeUnit.subUnitPartition || t.activeUnit.unitName) : 'None',
      'Start Date': t.activeAssignment ? formatDate(t.activeAssignment.startDate) : '',
      'End Date': t.activeAssignment?.endDate ? formatDate(t.activeAssignment.endDate) : 'Ongoing (Blank)',
      'Monthly Rent': t.currentRentAgreement ? t.currentRentAgreement.monthlyRate : 0,
      'Security Deposit': t.activeAssignment ? (t.activeAssignment.depositHeld || 0) : 0,
      'Status': t.activeAssignment ? 'Active Lease' : 'Vacated / Inactive',
      'Terms & Conditions': t.currentRentAgreement?.terms || '',
      'Notes': t.notes || ''
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Tenants');
    XLSX.writeFile(wb, `Tenants_Master_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const filteredTenants = tenants.filter(t => {
    const matchesSearch =
      (t.name || '').toLowerCase().includes(search.toLowerCase()) ||
      (t.phone || '').toLowerCase().includes(search.toLowerCase()) ||
      (t.activeUnit?.subUnitPartition || t.activeUnit?.unitName || '').toLowerCase().includes(search.toLowerCase()) ||
      (t.activeUnit?.propertyId?.name || '').toLowerCase().includes(search.toLowerCase());
    const tenantPropertyId = t.activeUnit?.propertyId?._id || t.activeUnit?.propertyId || '';
    const matchesProperty = !propertyFilter || String(tenantPropertyId) === propertyFilter;
    const matchesStatus = !statusFilter || (statusFilter === 'active' ? !!t.activeAssignment : !t.activeAssignment);
    return matchesSearch && matchesProperty && matchesStatus;
  });

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
            <Users className="w-5 h-5 text-emerald-600" />
            <span>Tenant Master</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Excel-style grid with property & vacant sub-unit selection, dates, rent, deposit, terms, and notes
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <ColumnManager
            columns={TENANTS_COLUMNS_DEF}
            visibleColumns={visibleColumns}
            onChangeVisible={setVisibleColumns}
            storageKey="tenants_v2"
            onResetWidths={resetColumnWidths}
          />
          <button
            type="button"
            onClick={resetColumnWidths}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-900 text-xs font-bold transition-all shadow-xs"
            title="Reset column widths"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Reset Widths</span>
          </button>
          <button
            onClick={exportToExcel}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors"
          >
            <Download className="w-4 h-4 text-emerald-600" />
            <span>Export to Excel</span>
          </button>
          <button
            onClick={openCreateTenant}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>Register Tenant</span>
          </button>
        </div>
      </div>

      {/* Excel Table Grid */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Search Bar */}
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-50/50">
          <div className="relative w-full sm:flex-1 sm:max-w-xs">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search tenant, phone, property, unit..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <SearchableSelect
              className="w-full sm:w-52"
              value={propertyFilter}
              onChange={setPropertyFilter}
              placeholder="All Properties"
              searchPlaceholder="Search properties..."
              options={properties.map((property) => ({ value: property._id, label: property.name }))}
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="">All tenants</option>
              <option value="active">Currently renting</option>
              <option value="inactive">Not currently renting</option>
            </select>
            <span className="self-center text-xs text-slate-500 font-semibold whitespace-nowrap">{filteredTenants.length} tenants</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table
            className="w-full text-left text-xs border-collapse table-fixed"
            style={{ minWidth: `${visibleColumns.reduce((sum, colId) => sum + (columnWidths[colId] || DEFAULT_TENANTS_COLUMN_WIDTHS[colId] || 100), 0)}px` }}
          >
            <colgroup>
              {visibleColumns.map(colId => (
                <col
                  key={colId}
                  style={{ width: `${columnWidths[colId] || DEFAULT_TENANTS_COLUMN_WIDTHS[colId] || 100}px` }}
                />
              ))}
            </colgroup>
            <thead>
              <tr className="bg-slate-100/80 text-slate-700 font-bold border-b border-slate-200 select-none">
                {visibleColumns.map(colId => {
                  const def = TENANTS_COLUMNS_DEF.find(c => c.id === colId);
                  if (!def) return null;
                  const width = columnWidths[colId] || DEFAULT_TENANTS_COLUMN_WIDTHS[colId] || 100;
                  let alignClass = 'text-left';
                  if (colId === 'status') alignClass = 'text-center';
                  if (['monthlyRate', 'deposit', 'actions'].includes(colId)) alignClass = 'text-right';

                  return (
                    <th 
                      key={colId} 
                      {...getHeaderDragProps(colId, visibleColumns, setVisibleColumns, 'tenants_v2')}
                      style={{ width: `${width}px` }}
                      className={`py-3 px-4 border-r border-slate-200 relative group ${alignClass}`}
                    >
                      <span className="truncate block pr-2">{def.label}</span>
                      <ResizeHandle colId={colId} onResizeStart={handleResizeStart} />
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr><td colSpan={visibleColumns.length} className="py-8 text-center text-slate-400">Loading tenants...</td></tr>
              ) : filteredTenants.length === 0 ? (
                <tr>
                  <td colSpan={visibleColumns.length} className="py-8 text-center text-slate-400">
                    No tenants found
                  </td>
                </tr>
              ) : (
                filteredTenants.map((t) => (
                  <tr key={t._id} className="hover:bg-emerald-50/30 transition-colors">
                    {visibleColumns.map(colId => {
                      if (colId === 'tenant') {
                        return (
                          <td key={colId} className="py-3.5 px-4 border-r border-slate-200">
                            <span className="font-bold text-slate-900 text-xs block">{t.name}</span>
                            <span className="text-[11px] text-slate-500">{t.phone || 'No phone number'}</span>
                          </td>
                        );
                      }
                      if (colId === 'property') {
                        return (
                          <td key={colId} className="py-3.5 px-4 border-r border-slate-200">
                            {t.activeUnit ? (
                              <div>
                                <span className="font-bold text-slate-800 text-xs block">
                                  {t.activeUnit.subUnitPartition || t.activeUnit.unitName}
                                </span>
                                <span className="text-[11px] text-slate-500">{t.activeUnit.propertyId?.name}</span>
                              </div>
                            ) : (
                              <span className="text-xs text-slate-400 italic">No assigned partition</span>
                            )}
                          </td>
                        );
                      }
                      if (colId === 'startDate') {
                        return (
                          <td key={colId} className="py-3.5 px-4 border-r border-slate-200 font-mono text-slate-700">
                            {t.activeAssignment ? formatDate(t.activeAssignment.startDate) : '—'}
                          </td>
                        );
                      }
                      if (colId === 'endDate') {
                        return (
                          <td key={colId} className="py-3.5 px-4 border-r border-slate-200 font-mono text-slate-700">
                            {t.activeAssignment?.endDate ? formatDate(t.activeAssignment.endDate) : <span className="text-slate-400 italic">Blank</span>}
                          </td>
                        );
                      }
                      if (colId === 'monthlyRate') {
                        return (
                          <td key={colId} className="py-3.5 px-4 border-r border-slate-200 text-right font-mono font-bold text-slate-900">
                            {t.currentRentAgreement ? formatCurrency(t.currentRentAgreement.monthlyRate) : '—'}
                          </td>
                        );
                      }
                      if (colId === 'deposit') {
                        return (
                          <td key={colId} className="py-3.5 px-4 border-r border-slate-200 text-right font-mono text-slate-700">
                            {t.activeAssignment?.depositHeld ? formatCurrency(t.activeAssignment.depositHeld) : '—'}
                          </td>
                        );
                      }
                      if (colId === 'termsNotes') {
                        return (
                          <td key={colId} className="py-3.5 px-4 border-r border-slate-200 text-slate-600 max-w-xs truncate">
                            {t.currentRentAgreement?.terms || t.notes || '—'}
                          </td>
                        );
                      }
                      if (colId === 'status') {
                        return (
                          <td key={colId} className="py-3.5 px-4 border-r border-slate-200 text-center">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold whitespace-nowrap ${
                              t.activeAssignment
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-slate-100 text-slate-600'
                            }`}>
                              {t.activeAssignment ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                        );
                      }
                      if (colId === 'phone') {
                        return (
                          <td key={colId} className="py-3.5 px-4 border-r border-slate-200 font-mono text-slate-700 text-xs">
                            {t.phone || '—'}
                          </td>
                        );
                      }
                      if (colId === 'actions') {
                        return (
                          <td key={colId} className="py-3.5 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
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
                                    className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors border border-emerald-200 cursor-pointer shrink-0"
                                    title="Revise Rent Rate"
                                  >
                                    <TrendingUp className="w-3 h-3" />
                                    <span>Revise</span>
                                  </button>
                                  <button
                                    onClick={() => {
                                      setVacateForm({
                                        assignmentId: t.activeAssignment._id,
                                        tenantName: t.name,
                                        unitName: t.activeUnit?.subUnitPartition || t.activeUnit?.unitName || 'Partition',
                                        endDate: new Date().toISOString().split('T')[0],
                                        depositRefunded: String(t.activeAssignment.depositHeld || '0'),
                                        notes: ''
                                      });
                                      setShowVacateModal(true);
                                    }}
                                    className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-lg transition-colors border border-amber-200 cursor-pointer shrink-0"
                                    title="Vacate Tenant & Free Sub Unit"
                                  >
                                    <LogOut className="w-3 h-3" />
                                    <span>Vacate</span>
                                  </button>
                                </>
                              )}
                              <button
                                onClick={() => openEditTenant(t)}
                                className="p-1.5 text-slate-500 hover:text-emerald-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer shrink-0"
                                title="Edit Tenant"
                              >
                                <Edit className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteTenant(t._id)}
                                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer shrink-0"
                                title="Delete Tenant"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        );
                      }
                      return null;
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Tenant Modal */}
      {showTenantModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-scaleUp">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-xl w-full p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-slate-900 mb-1">
              {editingTenant ? 'Edit Tenant & Lease Details' : 'Register New Tenant'}
            </h3>
            <p className="text-xs text-slate-400 mb-4">Enter tenant details, then optionally assign them to a vacant unit.</p>
            <form onSubmit={handleSaveTenant} className="space-y-4">
              {/* Tenant Name + Phone */}
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Tenant Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Altaf Bhai / Delhiery Pvt Ltd"
                    value={form.name}
                    onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-semibold"
                  />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Phone Number <span className="text-slate-400 font-normal">(optional)</span></label>
                  <input
                    type="text"
                    placeholder="e.g. +91 9876543210"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              {/* Sub-Unit Lease Section */}
              <div className="p-4 bg-emerald-50/40 rounded-xl border border-emerald-100 space-y-3.5">
                <h4 className="text-xs font-bold text-emerald-950 uppercase tracking-wide">
                  Assign to a Unit <span className="font-normal normal-case text-emerald-700">(optional — leave blank to register without a lease)</span>
                </h4>

                <div>
                  <SearchableSelect
                    label="Vacant Unit"
                    placeholder={availableSubUnits.length ? 'Search property or unit...' : 'No vacant units available'}
                    searchPlaceholder="Type a property or unit name..."
                    options={availableSubUnits.map((unit) => ({
                      value: unit._id,
                      label: unit.subUnitPartition || unit.unitName,
                      subtext: `${unit.propertyId?.name || 'Property'}${unit.areaSqFt ? ` · ${unit.areaSqFt.toLocaleString('en-IN')} sq ft` : ''}`,
                    }))}
                    value={form.unitId}
                    onChange={(unitId) => setForm((prev) => ({ ...prev, unitId }))}
                  />
                  <p className="mt-1.5 text-[11px] text-emerald-800">
                    {availableSubUnits.length
                      ? 'Choose the property and unit together here. Leave blank to register the tenant without a lease.'
                      : 'No vacant units available. Add a property and unit in the Masters panel first.'}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">Monthly Rent Rate (₹) *</label>
                    <input
                      type="number"
                      required={!!form.unitId}
                      placeholder="e.g. 22000"
                      value={form.monthlyRate}
                      onChange={(e) => setForm({ ...form, monthlyRate: e.target.value })}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">Security Deposit Held (₹)</label>
                    <input
                      type="number"
                      placeholder="0"
                      value={form.depositHeld}
                      onChange={(e) => setForm({ ...form, depositHeld: e.target.value })}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">Start Date</label>
                    <input
                      type="date"
                      value={form.startDate}
                      onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      End Date <span className="text-slate-400 font-normal">(Leave blank if ongoing)</span>
                    </label>
                    <input
                      type="date"
                      value={form.endDate}
                      onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">Terms & Conditions</label>
                  <input
                    type="text"
                    placeholder="e.g. 11 months contract, 5% annual escalation"
                    value={form.terms}
                    onChange={(e) => setForm({ ...form, terms: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Notes <span className="text-slate-400 font-normal">(optional)</span></label>
                <textarea
                  rows="2"
                  placeholder="Additional tenant information..."
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowTenantModal(false)}
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

      {/* Revise Rent Modal */}
      {showIncreaseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-scaleUp">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-slate-900 mb-4">Revise Monthly Rent Rate</h3>
            <form onSubmit={handleIncreaseRent} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">New Monthly Rent Rate (₹)</label>
                <input
                  type="number"
                  required
                  placeholder="e.g. 24000"
                  value={increaseForm.newRate}
                  onChange={(e) => setIncreaseForm({ ...increaseForm, newRate: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-semibold"
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
                  placeholder="e.g. Annual contractual increment"
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
                  Save Revision
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
                <h3 className="text-lg font-bold text-slate-900">Vacate Tenant & Free Sub-Unit</h3>
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
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Remarks / Handover Notes</label>
                <textarea
                  rows="2"
                  placeholder="e.g. Keys handed over, dues settled"
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
