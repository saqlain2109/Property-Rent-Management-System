import React, { useState, useEffect } from 'react';
import API from '../services/api';
import * as XLSX from 'xlsx';
import SearchableSelect from '../components/SearchableSelect';
import { Layers, Plus, Search, Download, Edit, Trash2, RotateCcw, ArrowUpDown } from 'lucide-react';
import { formatCurrency, formatDate } from '../utils/formatters';
import ColumnManager, { getHeaderDragProps, useResizableColumns, ResizeHandle } from '../components/ColumnManager';

const PARTITIONS_COLUMNS_DEF = [
  { id: 'property', label: 'Main Property' },
  { id: 'partition', label: 'Sub Unit (Partition)' },
  { id: 'area', label: 'Area (Sq Ft)' },
  { id: 'floor', label: 'Floor / Details' },
  { id: 'status', label: 'Status' },
  { id: 'tenant', label: 'Current Tenant' },
  { id: 'rent', label: 'Monthly Rent' },
  { id: 'notes', label: 'Remarks / Notes' },
  { id: 'createdAt', label: 'Created Date', defaultVisible: false },
  { id: 'updatedAt', label: 'Modified Date', defaultVisible: false },
  { id: 'actions', label: 'Actions' },
];

const DEFAULT_PARTITIONS_COLS = ['property', 'partition', 'floor', 'status', 'tenant', 'rent', 'actions'];

// Screen-fitting default column widths to guarantee zero horizontal scroll by default!
const DEFAULT_PARTITIONS_COLUMN_WIDTHS = {
  property: 160,
  partition: 160,
  floor: 80,
  status: 90,
  tenant: 150,
  rent: 95,
  actions: 100,
  area: 90,
  notes: 140
};

export default function PartitionsView({ initialPropertyFilter, initialSearch = '', onClearPropertyFilter, onDataChanged }) {
  const [units, setUnits] = useState([]);
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(initialSearch);
  const [selectedPropertyFilter, setSelectedPropertyFilter] = useState(initialPropertyFilter || '');
  const [occupancyFilter, setOccupancyFilter] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: 'createdAt', direction: 'desc' });

  const [visibleColumns, setVisibleColumns] = useState(() => {
    const saved = localStorage.getItem('cols_partitions');
    if (!saved) return DEFAULT_PARTITIONS_COLS;
    try {
      const allowed = PARTITIONS_COLUMNS_DEF.map((column) => column.id);
      return JSON.parse(saved).filter((column) => allowed.includes(column));
    } catch {
      return DEFAULT_PARTITIONS_COLS;
    }
  });

  const {
    columnWidths,
    handleResizeStart,
    resetColumnWidths,
    hasCustomWidths
  } = useResizableColumns('partitions', DEFAULT_PARTITIONS_COLUMN_WIDTHS);

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [editingUnit, setEditingUnit] = useState(null);

  // Form
  const [form, setForm] = useState({
    propertyId: '',
    subUnitPartition: '',
    areaSqFt: '',
    floor: '',
    unitType: 'Godown Partition',
    notes: ''
  });

  const fetchData = async () => {
    try {
      setLoading(true);
      const [uRes, pRes] = await Promise.all([
        API.get('/units'),
        API.get('/properties')
      ]);
      if (uRes.data.success) setUnits(uRes.data.data);
      if (pRes.data.success) setProperties(pRes.data.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (initialPropertyFilter !== undefined) {
      setSelectedPropertyFilter(initialPropertyFilter);
    }
    if (initialSearch !== undefined) {
      setSearch(initialSearch);
    }
  }, [initialPropertyFilter, initialSearch]);

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...form,
        subUnitPartition: form.subUnitPartition.trim(),
        unitName: form.subUnitPartition.trim(), // sync for backwards compatibility
        areaSqFt: Number(form.areaSqFt) || 0,
        occupancyStatus: form.occupancyStatus || 'Vacant'
      };

      if (editingUnit) {
        const res = await API.put(`/units/${editingUnit._id}`, payload);
        if (res.data.success) {
          setShowModal(false);
          setEditingUnit(null);
          fetchData();
          onDataChanged?.();
        }
      } else {
        const res = await API.post('/units', payload);
        if (res.data.success) {
          setShowModal(false);
          setForm({
            propertyId: properties[0]?._id || '',
            subUnitPartition: '',
            areaSqFt: '',
            floor: '',
            unitType: 'Godown Partition',
            occupancyStatus: 'Vacant',
            notes: ''
          });
          fetchData();
          onDataChanged?.();
        }
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to save partition');
    }
  };

  const openCreate = () => {
    setEditingUnit(null);
    setForm({
      propertyId: selectedPropertyFilter || properties[0]?._id || '',
      subUnitPartition: '',
      areaSqFt: '',
      floor: '',
      unitType: 'Godown Partition',
      occupancyStatus: 'Vacant',
      notes: ''
    });
    setShowModal(true);
  };

  const openEdit = (u) => {
    setEditingUnit(u);
    setForm({
      propertyId: u.propertyId?._id || u.propertyId || '',
      subUnitPartition: u.subUnitPartition || u.unitName || '',
      areaSqFt: u.areaSqFt || '',
      floor: u.floor || '',
      unitType: u.unitType || 'Godown Partition',
      occupancyStatus: u.occupancyStatus || 'Vacant',
      notes: u.notes || ''
    });
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this sub-unit/partition?')) return;
    try {
      const res = await API.delete(`/units/${id}`);
      if (res.data.success) {
        fetchData();
        onDataChanged?.();
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to delete sub-unit/partition');
    }
  };

  const exportToExcel = () => {
    const rows = filteredUnits.map((u, idx) => ({
      'Sr No': idx + 1,
      'Property': u.propertyId?.name || '',
      'Sub Unit (Partition)': u.subUnitPartition || u.unitName,
      'Partition Area (Sq Ft)': u.areaSqFt || 0,
      'Floor': u.floor || '',
      'Status': u.occupancyStatus,
      'Current Tenant': u.currentTenant ? u.currentTenant.name : 'Vacant',
      'Monthly Rent Rate': u.currentRentAgreement ? u.currentRentAgreement.monthlyRate : 0,
      'Notes': u.notes || ''
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Partitions');
    XLSX.writeFile(wb, `Partitions_Master_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const filteredUnits = units.filter(u => {
    const matchesProp = !selectedPropertyFilter || (u.propertyId?._id === selectedPropertyFilter || u.propertyId === selectedPropertyFilter);
    const matchesOccupancy = !occupancyFilter || (u.occupancyStatus || 'Vacant') === occupancyFilter;
    const q = search.toLowerCase();
    const matchesSearch = 
      (u.subUnitPartition || '').toLowerCase().includes(q) ||
      (u.unitName || '').toLowerCase().includes(q) ||
      (u.propertyId?.name || '').toLowerCase().includes(q) ||
      (u.currentTenant?.name || '').toLowerCase().includes(q);
    return matchesProp && matchesOccupancy && matchesSearch;
  });
  const sortedUnits = [...filteredUnits].sort((a, b) => {
    const getValue = (unit) => ({
      property: unit.propertyId?.name,
      partition: unit.subUnitPartition || unit.unitName,
      area: unit.areaSqFt,
      floor: unit.floor || unit.unitType,
      status: unit.occupancyStatus,
      tenant: unit.currentTenant?.name,
      rent: unit.currentRentAgreement?.monthlyRate ?? unit.monthlyRentExpected,
      notes: unit.notes,
      createdAt: unit.createdAt,
      updatedAt: unit.updatedAt,
    })[sortConfig.key];
    const left = getValue(a);
    const right = getValue(b);
    const comparison = typeof left === 'number' && typeof right === 'number'
      ? left - right
      : String(left || '').localeCompare(String(right || ''), undefined, { numeric: true, sensitivity: 'base' });
    return comparison * (sortConfig.direction === 'asc' ? 1 : -1);
  });

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
            <Layers className="w-5 h-5 text-emerald-600" />
            <span>Property-Unit (Partitions) Master</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Dedicated master for sub-units and partitions with individual area (sq ft) and occupancy status
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <ColumnManager
            columns={PARTITIONS_COLUMNS_DEF}
            visibleColumns={visibleColumns}
            onChangeVisible={setVisibleColumns}
            storageKey="partitions"
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
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>Add Sub Unit / Partition</span>
          </button>
        </div>
      </div>

      {/* Excel-Style Grid Card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Filters Bar */}
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-50/50">
          <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto flex-1">
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search partition name, tenant..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <select
              value={selectedPropertyFilter}
              onChange={(e) => setSelectedPropertyFilter(e.target.value)}
              className="w-full sm:w-60 px-3 py-1.5 text-xs rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium text-slate-700"
            >
              <option value="">All Properties ({properties.length})</option>
              {properties.map(p => (
                <option key={p._id} value={p._id}>{p.name}</option>
              ))}
            </select>
            <select
              value={occupancyFilter}
              onChange={(e) => setOccupancyFilter(e.target.value)}
              className="w-full sm:w-44 px-3 py-1.5 text-xs rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium text-slate-700"
            >
              <option value="">All statuses</option>
              <option value="Vacant">Vacant</option>
              <option value="Occupied">Occupied</option>
              <option value="Maintenance">Maintenance</option>
              <option value="Under Notice">Under Notice</option>
            </select>
          </div>
          <div className="flex items-center gap-4 text-xs text-slate-500">
            <span>Partitions: <b className="text-slate-800">{filteredUnits.length}</b></span>
            <span>Total Partition Area: <b className="text-slate-800">{filteredUnits.reduce((acc, u) => acc + (u.areaSqFt || 0), 0).toLocaleString('en-IN')} sq ft</b></span>
          </div>
        </div>

        {/* Active Property Filter Banner */}
        {selectedPropertyFilter && (
          <div className="flex items-center justify-between px-4 py-2.5 bg-emerald-50 border-b border-emerald-200 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-emerald-800">Filtered by Property:</span>
              <strong className="text-emerald-950 font-bold bg-emerald-200/70 px-2 py-0.5 rounded-md">
                {properties.find(p => p._id === selectedPropertyFilter)?.name || 'Selected Property'}
              </strong>
              <span className="text-emerald-700">({filteredUnits.length} partitions)</span>
            </div>
            <button
              onClick={() => {
                setSelectedPropertyFilter('');
                if (onClearPropertyFilter) onClearPropertyFilter();
              }}
              className="text-xs font-bold text-emerald-800 hover:text-emerald-950 underline px-2 py-1 rounded hover:bg-emerald-100 transition-colors cursor-pointer"
            >
              Clear Filter (Show All Properties)
            </button>
          </div>
        )}

        {/* Excel Table */}
        <div className="overflow-x-auto">
          <table
            className="w-full text-left text-xs border-collapse table-fixed"
            style={{ minWidth: `${visibleColumns.reduce((sum, colId) => sum + (columnWidths[colId] || DEFAULT_PARTITIONS_COLUMN_WIDTHS[colId] || 100), 0)}px` }}
          >
            <colgroup>
              {visibleColumns.map(colId => (
                <col
                  key={colId}
                  style={{ width: `${columnWidths[colId] || DEFAULT_PARTITIONS_COLUMN_WIDTHS[colId] || 100}px` }}
                />
              ))}
            </colgroup>
            <thead>
              <tr className="bg-slate-100/80 text-slate-700 font-bold border-b border-slate-200 select-none">
                {visibleColumns.map(colId => {
                  const def = PARTITIONS_COLUMNS_DEF.find(c => c.id === colId);
                  if (!def) return null;
                  const width = columnWidths[colId] || DEFAULT_PARTITIONS_COLUMN_WIDTHS[colId] || 100;
                  let alignClass = 'text-left';
                  if (colId === 'status') alignClass = 'text-center';
                  if (['area', 'rent', 'actions'].includes(colId)) alignClass = 'text-right';

                  const isSortable = colId !== 'actions';
                  return (
                    <th 
                      key={colId} 
                      {...getHeaderDragProps(colId, visibleColumns, setVisibleColumns, 'partitions')}
                      style={{ width: `${width}px` }}
                      className={`py-3 px-4 border-r border-slate-200 relative group ${alignClass}`}
                    >
                      <button
                        type="button"
                        disabled={!isSortable}
                        onClick={() => isSortable && setSortConfig((current) => ({
                          key: colId,
                          direction: current.key === colId
                            ? (current.direction === 'asc' ? 'desc' : 'asc')
                            : (colId === 'createdAt' ? 'desc' : 'asc')
                        }))}
                        className={`truncate flex items-center gap-1 pr-2 ${isSortable ? 'cursor-pointer hover:text-emerald-700' : 'cursor-default'}`}
                        title={isSortable ? `Sort by ${def.label}` : undefined}
                      >
                        <span>{def.label}</span>
                        {isSortable && <ArrowUpDown className={`w-3 h-3 shrink-0 ${sortConfig.key === colId ? 'text-emerald-600' : 'text-slate-400'}`} />}
                      </button>
                      <ResizeHandle colId={colId} onResizeStart={handleResizeStart} />
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr><td colSpan={visibleColumns.length} className="py-8 text-center text-slate-400">Loading units...</td></tr>
              ) : filteredUnits.length === 0 ? (
                <tr>
                  <td colSpan={visibleColumns.length} className="py-8 text-center text-slate-400">
                    No sub-units or partitions found
                  </td>
                </tr>
              ) : (
                sortedUnits.map((u) => (
                  <tr key={u._id} className="hover:bg-emerald-50/30 transition-colors">
                    {visibleColumns.map(colId => {
                      if (colId === 'property') {
                        return (
                          <td key={colId} className="py-3 px-4 border-r border-slate-200 font-semibold text-slate-900">
                            {u.propertyId?.name || '—'}
                          </td>
                        );
                      }
                      if (colId === 'partition') {
                        return (
                          <td key={colId} className="py-3 px-4 border-r border-slate-200">
                            <span className="font-bold text-slate-900 text-xs block">
                              {u.subUnitPartition || u.unitName}
                            </span>
                            {(u.areaSqFt || u.unitType) && (
                              <span className="text-[10px] text-slate-400">
                                {u.areaSqFt ? `${u.areaSqFt.toLocaleString('en-IN')} sq ft` : ''}{u.areaSqFt && u.unitType ? ' · ' : ''}{u.unitType || ''}
                              </span>
                            )}
                          </td>
                        );
                      }
                      if (colId === 'area') {
                        return (
                          <td key={colId} className="py-3 px-4 border-r border-slate-200 text-right font-mono font-bold text-slate-800">
                            {u.areaSqFt ? `${u.areaSqFt.toLocaleString('en-IN')} sq ft` : '—'}
                          </td>
                        );
                      }
                      if (colId === 'floor') {
                        return (
                          <td key={colId} className="py-3 px-4 border-r border-slate-200 text-slate-600">
                            {u.floor || u.unitType || '—'}
                          </td>
                        );
                      }
                      if (colId === 'status') {
                        return (
                          <td key={colId} className="py-3 px-4 border-r border-slate-200 text-center">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold ${
                              u.occupancyStatus === 'Occupied'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-emerald-100 text-emerald-800'
                            }`}>
                              {u.occupancyStatus || 'Vacant'}
                            </span>
                          </td>
                        );
                      }
                      if (colId === 'tenant') {
                        return (
                          <td key={colId} className="py-3 px-4 border-r border-slate-200">
                            {u.currentTenant ? (
                              <div>
                                <span className="font-bold text-slate-800 block">{u.currentTenant.name}</span>
                              </div>
                            ) : (
                              <span className="text-slate-400 italic">None (Vacant)</span>
                            )}
                          </td>
                        );
                      }
                      if (colId === 'rent') {
                        return (
                          <td key={colId} className="py-3 px-4 border-r border-slate-200 text-right font-mono font-bold text-slate-800">
                            {u.currentRentAgreement ? formatCurrency(u.currentRentAgreement.monthlyRate) : (u.monthlyRentExpected ? formatCurrency(u.monthlyRentExpected) : '—')}
                          </td>
                        );
                      }
                      if (colId === 'notes') {
                        return (
                          <td key={colId} className="py-3 px-4 border-r border-slate-200 text-slate-500 text-xs truncate max-w-xs">
                            {u.notes || '—'}
                          </td>
                        );
                      }
                      if (colId === 'createdAt' || colId === 'updatedAt') {
                        return (
                          <td key={colId} className="py-3 px-4 border-r border-slate-200 text-slate-600 whitespace-nowrap">
                            {formatDate(u[colId]) || '—'}
                          </td>
                        );
                      }
                      if (colId === 'actions') {
                        return (
                          <td key={colId} className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
                              <button
                                onClick={() => openEdit(u)}
                                className="p-1.5 text-slate-500 hover:text-emerald-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer shrink-0"
                                title="Edit Partition"
                              >
                                <Edit className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDelete(u._id)}
                                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer shrink-0"
                                title="Delete Partition"
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

      {/* Add / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-scaleUp">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-slate-900 mb-1">
              {editingUnit ? 'Edit Sub Unit / Partition' : 'Add New Sub Unit'}
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              {editingUnit ? 'Update the partition details below.' : 'Select the property first, then name the sub unit or partition.'}
            </p>
            <form onSubmit={handleSave} className="space-y-4">
              {/* Step 1: Choose Property */}
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="w-5 h-5 rounded-full bg-emerald-600 text-white text-[10px] font-bold flex items-center justify-center shrink-0">1</span>
                  <span className="text-xs font-semibold text-slate-700">Which property does this belong to?</span>
                </div>
                <SearchableSelect
                  label=""
                  required
                  placeholder="Select Property..."
                  options={properties.map(p => ({
                    value: p._id,
                    label: p.name,
                    subtext: `${p.totalAreaSqFt || 0} sq ft · ${p.propertyType || ''}`
                  }))}
                  value={form.propertyId}
                  onChange={(pId) => setForm(prev => ({ ...prev, propertyId: pId }))}
                />
              </div>

              {/* Step 2: Name the sub unit */}
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="w-5 h-5 rounded-full bg-emerald-600 text-white text-[10px] font-bold flex items-center justify-center shrink-0">2</span>
                  <span className="text-xs font-semibold text-slate-700">Name this sub unit / partition</span>
                </div>
                <input
                  type="text"
                  required
                  placeholder="e.g. Partition 1, Room 10, Water Wala Space"
                  value={form.subUnitPartition}
                  onChange={(e) => setForm({ ...form, subUnitPartition: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-semibold"
                />
              </div>

              {/* Area + Floor */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Area (Sq Ft) <span className="text-slate-400 font-normal">optional</span></label>
                  <input
                    type="number"
                    placeholder="e.g. 500"
                    value={form.areaSqFt}
                    onChange={(e) => setForm({ ...form, areaSqFt: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Floor <span className="text-slate-400 font-normal">optional</span></label>
                  <input
                    type="text"
                    placeholder="e.g. Ground / 1st Floor"
                    value={form.floor}
                    onChange={(e) => setForm({ ...form, floor: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              {/* Occupancy Status */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Status</label>
                <select
                  value={form.occupancyStatus || 'Vacant'}
                  onChange={(e) => setForm({ ...form, occupancyStatus: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-semibold bg-white"
                >
                  <option value="Vacant">Vacant (Available for Rent)</option>
                  <option value="Occupied">Occupied (Has Active Tenant)</option>
                  <option value="Maintenance">Under Maintenance</option>
                  <option value="Under Notice">Under Notice Period</option>
                </select>
              </div>

              {/* Remarks */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Remarks <span className="text-slate-400 font-normal">optional</span></label>
                <textarea
                  rows="2"
                  placeholder="Any notes about this partition..."
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-sm"
                >
                  {editingUnit ? 'Save Changes' : 'Add Sub Unit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
