import React, { useState, useEffect } from 'react';
import API from '../services/api';
import * as XLSX from 'xlsx';
import { 
  Building2, Plus, Search, Download, Edit, Trash2,
  ChevronDown, ChevronUp, Layers, ExternalLink, ArrowRight, RotateCcw, ArrowUpDown
} from 'lucide-react';
import { formatCurrency, formatDate } from '../utils/formatters';
import ColumnManager, { getHeaderDragProps, useResizableColumns, ResizeHandle } from '../components/ColumnManager';

const PROPERTIES_COLUMNS_DEF = [
  { id: 'details', label: 'Property' },
  { id: 'type', label: 'Property Type' },
  { id: 'area', label: 'Total Area (Sq Ft)' },
  { id: 'ownership', label: 'Ownership %' },
  { id: 'partitions', label: 'Partitions' },
  { id: 'address', label: 'Full Address' },
  { id: 'createdAt', label: 'Created Date', defaultVisible: false },
  { id: 'updatedAt', label: 'Modified Date', defaultVisible: false },
  { id: 'actions', label: 'Actions' },
];

const DEFAULT_PROPERTIES_COLS = ['details', 'type', 'partitions', 'address', 'actions'];

// Screen-fitting default column widths to guarantee zero horizontal scroll by default!
const DEFAULT_PROPERTIES_COLUMN_WIDTHS = {
  details: 180,
  type: 130,
  partitions: 100,
  address: 220,
  actions: 120,
  area: 110,
  ownership: 95
};

export default function PropertiesView({ onNavigateToPartitions, initialPropertyFilter = '', onDataChanged }) {
  const [properties, setProperties] = useState([]);
  const [units, setUnits] = useState([]);
  const [expandedPropertyId, setExpandedPropertyId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [propertyTypeFilter, setPropertyTypeFilter] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: 'createdAt', direction: 'desc' });

  const [visibleColumns, setVisibleColumns] = useState(() => {
    const saved = localStorage.getItem('cols_properties');
    if (!saved) return DEFAULT_PROPERTIES_COLS;
    try {
      const allowed = PROPERTIES_COLUMNS_DEF.map((column) => column.id);
      return JSON.parse(saved).filter((column) => allowed.includes(column));
    } catch {
      return DEFAULT_PROPERTIES_COLS;
    }
  });

  const {
    columnWidths,
    handleResizeStart,
    resetColumnWidths,
    hasCustomWidths
  } = useResizableColumns('properties', DEFAULT_PROPERTIES_COLUMN_WIDTHS);
  
  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingProperty, setEditingProperty] = useState(null);

  // Form state (city & ownerOrResponsiblePerson kept as hidden defaults sent via payload)
  const [form, setForm] = useState({
    name: '',
    propertyType: 'Commercial Godown',
    totalAreaSqFt: '',
    ownershipPercentage: '100',
    address: '',
    description: '',
    isSingleUnit: false,
    unitName: '',
    subUnitPartition: '',
    floor: 'Ground',
    monthlyRentExpected: ''
  });

  // Post-Creation Guidance Modal with 3-second lockout timer
  const [guidanceModal, setGuidanceModal] = useState(null); // { property, createdUnit, isSingleUnit }
  const [lockoutCountdown, setLockoutCountdown] = useState(3);

  // Countdown timer effect
  useEffect(() => {
    let timer;
    if (guidanceModal && lockoutCountdown > 0) {
      timer = setTimeout(() => {
        setLockoutCountdown(prev => prev - 1);
      }, 1000);
    }
    return () => clearTimeout(timer);
  }, [guidanceModal, lockoutCountdown]);

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

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...form,
        totalAreaSqFt: Number(form.totalAreaSqFt) || 0,
        ownershipPercentage: Number(form.ownershipPercentage) || 100,
        // keep legacy fields with sensible defaults
        ownerOrResponsiblePerson: form.ownerOrResponsiblePerson || 'Owner',
        city: form.city || '',
        createSingleUnit: Boolean(form.isSingleUnit),
        unitName: form.unitName || form.name,
        subUnitPartition: form.subUnitPartition || form.unitName || form.name,
        floor: form.floor || 'Ground',
        monthlyRentExpected: Number(form.monthlyRentExpected) || 0
      };

      if (editingProperty) {
        const res = await API.put(`/properties/${editingProperty._id}`, payload);
        if (res.data.success) {
          setShowModal(false);
          setEditingProperty(null);
          fetchData();
          onDataChanged?.();
        }
      } else {
        const res = await API.post('/properties', payload);
        if (res.data.success) {
          setShowModal(false);
          const savedProp = res.data.data;
          const createdUnit = res.data.createdUnit;

          // Open 3-second guidance modal
          setLockoutCountdown(3);
          setGuidanceModal({
            property: savedProp,
            createdUnit,
            isSingleUnit: Boolean(form.isSingleUnit)
          });

          setForm({
            name: '',
            propertyType: 'Commercial Godown',
            totalAreaSqFt: '',
            ownershipPercentage: '100',
            address: '',
            description: '',
            isSingleUnit: false,
            unitName: '',
            subUnitPartition: '',
            floor: 'Ground',
            monthlyRentExpected: ''
          });
          fetchData();
          onDataChanged?.();
        }
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to save property');
    }
  };

  const openCreate = () => {
    setEditingProperty(null);
    setForm({
      name: '',
      propertyType: 'Commercial Godown',
      totalAreaSqFt: '',
      ownershipPercentage: '100',
      address: '',
      description: '',
      isSingleUnit: false,
      unitName: '',
      subUnitPartition: '',
      floor: 'Ground',
      monthlyRentExpected: ''
    });
    setShowModal(true);
  };

  const openEdit = (p) => {
    setEditingProperty(p);
    setForm({
      name: p.name || '',
      propertyType: p.propertyType || 'Commercial Godown',
      totalAreaSqFt: p.totalAreaSqFt || '',
      ownershipPercentage: p.ownershipPercentage !== undefined ? String(p.ownershipPercentage) : '100',
      ownerOrResponsiblePerson: p.ownerOrResponsiblePerson || 'Owner',
      city: p.city || '',
      address: p.address || '',
      description: p.description || '',
      isSingleUnit: false,
      unitName: '',
      subUnitPartition: '',
      floor: 'Ground',
      monthlyRentExpected: ''
    });
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this property?')) return;
    try {
      const res = await API.delete(`/properties/${id}`);
      if (res.data.success) {
        fetchData();
        onDataChanged?.();
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to delete property');
    }
  };

  const exportToExcel = () => {
    const rows = filteredProperties.map((p, idx) => ({
      'Sr No': idx + 1,
      'Property Name': p.name,
      'Property Type': p.propertyType,
      'Total Area (Sq Ft)': p.totalAreaSqFt || 0,
      'Ownership (%)': `${p.ownershipPercentage || 100}%`,
      'Responsible Person': p.ownerOrResponsiblePerson || 'Owner',
      'Address': p.address || '',
      'Total Partitions': p.unitCount || 0,
      'Occupied Partitions': p.occupiedUnits || 0,
      'Vacant Partitions': (p.unitCount || 0) - (p.occupiedUnits || 0)
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Properties');
    XLSX.writeFile(wb, `Properties_Master_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const filteredProperties = properties.filter(p =>
    (!initialPropertyFilter || p._id === initialPropertyFilter) &&
    (!propertyTypeFilter || p.propertyType === propertyTypeFilter) &&
    ((p.name || '').toLowerCase().includes(search.toLowerCase()) ||
    (p.address || '').toLowerCase().includes(search.toLowerCase()))
  );
  const sortedProperties = [...filteredProperties].sort((a, b) => {
    const values = {
      details: a.name,
      type: a.propertyType,
      area: a.totalAreaSqFt,
      ownership: a.ownershipPercentage,
      partitions: a.unitCount,
      address: a.address,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
    };
    const left = values[sortConfig.key];
    const right = {
      details: b.name,
      type: b.propertyType,
      area: b.totalAreaSqFt,
      ownership: b.ownershipPercentage,
      partitions: b.unitCount,
      address: b.address,
      createdAt: b.createdAt,
      updatedAt: b.updatedAt,
    }[sortConfig.key];
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
            <Building2 className="w-5 h-5 text-emerald-600" />
            <span>Property Master</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Clear Excel-style grid showing property details, total area (sq ft), and percentage ownership
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <ColumnManager
            columns={PROPERTIES_COLUMNS_DEF}
            visibleColumns={visibleColumns}
            onChangeVisible={setVisibleColumns}
            storageKey="properties"
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
            <span>Add Property</span>
          </button>
        </div>
      </div>

      {/* Excel-Style Grid Card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Search & Stats Bar */}
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-50/50">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search properties by name or address..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <select
            value={propertyTypeFilter}
            onChange={(e) => setPropertyTypeFilter(e.target.value)}
            className="w-full sm:w-56 px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="">All property types</option>
            {['Commercial Godown', 'Residential Apartment', 'Commercial Office', 'Garage', 'PG Facility', 'Room', 'Mixed Use', 'Other'].map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
          <div className="flex items-center gap-4 text-xs text-slate-500">
            <span>Total Properties: <b className="text-slate-800">{filteredProperties.length}</b></span>
            <span>Total Area: <b className="text-slate-800">{filteredProperties.reduce((acc, p) => acc + (p.totalAreaSqFt || 0), 0).toLocaleString('en-IN')} sq ft</b></span>
          </div>
        </div>

        {/* Excel Table */}
        <div className="overflow-x-auto">
          <table
            className="w-full text-left text-xs border-collapse table-fixed"
            style={{ minWidth: `${visibleColumns.reduce((sum, colId) => sum + (columnWidths[colId] || DEFAULT_PROPERTIES_COLUMN_WIDTHS[colId] || 100), 0)}px` }}
          >
            <colgroup>
              {visibleColumns.map(colId => (
                <col
                  key={colId}
                  style={{ width: `${columnWidths[colId] || DEFAULT_PROPERTIES_COLUMN_WIDTHS[colId] || 100}px` }}
                />
              ))}
            </colgroup>
            <thead>
              <tr className="bg-slate-100/80 text-slate-700 font-bold border-b border-slate-200 select-none">
                {visibleColumns.map(colId => {
                  const def = PROPERTIES_COLUMNS_DEF.find(c => c.id === colId);
                  if (!def) return null;
                  const width = columnWidths[colId] || DEFAULT_PROPERTIES_COLUMN_WIDTHS[colId] || 100;
                  let alignClass = 'text-left';
                  if (['ownership', 'partitions'].includes(colId)) alignClass = 'text-center';
                  if (['area', 'actions'].includes(colId)) alignClass = 'text-right';

                  const isSortable = colId !== 'actions';
                  return (
                    <th 
                      key={colId} 
                      {...getHeaderDragProps(colId, visibleColumns, setVisibleColumns, 'properties')}
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
                <tr><td colSpan={visibleColumns.length} className="py-8 text-center text-slate-400">Loading properties...</td></tr>
              ) : filteredProperties.length === 0 ? (
                <tr>
                  <td colSpan={visibleColumns.length} className="py-8 text-center text-slate-400">
                    No properties found
                  </td>
                </tr>
              ) : (
                sortedProperties.map((p) => (
                  <React.Fragment key={p._id}>
                    <tr className="hover:bg-emerald-50/30 transition-colors">
                      {visibleColumns.map(colId => {
                        if (colId === 'details') {
                          return (
                            <td key={colId} className="py-3 px-4 border-r border-slate-200">
                              <div className="font-bold text-slate-900 text-sm">{p.name}</div>
                              {p.address && <div className="text-[11px] text-slate-400 truncate max-w-xs">{p.address}</div>}
                            </td>
                          );
                        }
                        if (colId === 'type') {
                          return (
                            <td key={colId} className="py-3 px-4 border-r border-slate-200 text-slate-700 font-medium">
                              {p.propertyType}
                            </td>
                          );
                        }
                        if (colId === 'area') {
                          return (
                            <td key={colId} className="py-3 px-4 border-r border-slate-200 text-right font-mono font-bold text-slate-800">
                              {p.totalAreaSqFt ? `${p.totalAreaSqFt.toLocaleString('en-IN')} sq ft` : '—'}
                            </td>
                          );
                        }
                        if (colId === 'ownership') {
                          return (
                            <td key={colId} className="py-3 px-4 border-r border-slate-200 text-center">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${
                                (p.ownershipPercentage || 100) === 100
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-blue-100 text-blue-800'
                              }`}>
                                {p.ownershipPercentage || 100}%
                              </span>
                            </td>
                          );
                        }
                        if (colId === 'partitions') {
                          const isExpanded = expandedPropertyId === p._id;
                          return (
                            <td key={colId} className="py-3 px-4 border-r border-slate-200 text-center">
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => setExpandedPropertyId(isExpanded ? null : p._id)}
                                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                                    isExpanded
                                      ? 'bg-emerald-600 text-white shadow-xs'
                                      : 'bg-slate-100 hover:bg-emerald-50 text-slate-800 hover:text-emerald-700'
                                  }`}
                                  title="Click to view partitions inline"
                                >
                                  <Layers className={`w-3.5 h-3.5 ${isExpanded ? 'text-white' : 'text-slate-500'}`} />
                                  <span>{p.unitCount || 0} Units</span>
                                  {isExpanded ? (
                                    <ChevronUp className="w-3.5 h-3.5" />
                                  ) : (
                                    <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                                  )}
                                </button>

                                {onNavigateToPartitions && (
                                  <button
                                    type="button"
                                    onClick={() => onNavigateToPartitions(p._id)}
                                    className="p-1 text-slate-400 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors cursor-pointer"
                                    title={`Open ${p.name} partitions in Property-Unit Master`}
                                  >
                                    <ExternalLink className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                              <div className="text-[10px] text-slate-400 mt-0.5">
                                {p.occupiedUnits || 0} occupied • {(p.unitCount || 0) - (p.occupiedUnits || 0)} vacant
                              </div>
                            </td>
                          );
                        }
                        if (colId === 'address') {
                          return (
                            <td key={colId} className="py-3 px-4 border-r border-slate-200 text-slate-600 text-xs">
                              {p.address || '—'}
                            </td>
                          );
                        }
                        if (colId === 'createdAt' || colId === 'updatedAt') {
                          return (
                            <td key={colId} className="py-3 px-4 border-r border-slate-200 text-slate-600 whitespace-nowrap">
                              {p[colId] ? formatDate(p[colId]) : '—'}
                            </td>
                          );
                        }
                        if (colId === 'actions') {
                          return (
                            <td key={colId} className="py-3 px-4 text-right">
                              <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
                                {onNavigateToPartitions && (
                                  <button
                                    type="button"
                                    onClick={() => onNavigateToPartitions(p._id)}
                                    className="p-1.5 text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors cursor-pointer shrink-0"
                                    title="Filter in Partitions Master"
                                  >
                                    <Layers className="w-4 h-4 text-emerald-600" />
                                  </button>
                                )}
                                <button
                                  onClick={() => openEdit(p)}
                                  className="p-1.5 text-slate-500 hover:text-emerald-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer shrink-0"
                                  title="Edit Property"
                                >
                                  <Edit className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleDelete(p._id)}
                                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer shrink-0"
                                  title="Delete Property"
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

                    {/* Inline Expandable Partitions Sub-Table */}
                    {expandedPropertyId === p._id && (
                      <tr className="bg-emerald-50/20 border-b-2 border-emerald-300">
                        <td colSpan={visibleColumns.length} className="p-3 pl-8">
                          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-3">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2">
                              <div className="flex items-center gap-2">
                                <Layers className="w-4 h-4 text-emerald-600" />
                                <h4 className="font-extrabold text-slate-900 text-xs">
                                  Partitions in {p.name} ({units.filter(u => (u.propertyId?._id || u.propertyId) === p._id).length} Total)
                                </h4>
                                <span className="text-[11px] text-slate-500">
                                  • {p.occupiedUnits || 0} Occupied, {(p.unitCount || 0) - (p.occupiedUnits || 0)} Vacant
                                </span>
                              </div>
                              {onNavigateToPartitions && (
                                <button
                                  type="button"
                                  onClick={() => onNavigateToPartitions(p._id)}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-xs cursor-pointer"
                                >
                                  <span>Open in Partitions Master (Filtered)</span>
                                  <ArrowRight className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>

                            {units.filter(u => (u.propertyId?._id || u.propertyId) === p._id).length === 0 ? (
                              <p className="text-xs text-slate-400 py-3 text-center">No partitions registered for this property yet.</p>
                            ) : (
                              <div className="overflow-x-auto">
                                <table className="w-full text-left text-xs border-collapse">
                                  <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200 text-[11px]">
                                    <tr>
                                      <th className="py-2 px-3">Sub-Unit (Partition)</th>
                                      <th className="py-2 px-3 text-right">Area (Sq Ft)</th>
                                      <th className="py-2 px-3">Floor</th>
                                      <th className="py-2 px-3">Current Tenant</th>
                                      <th className="py-2 px-3 text-right">Monthly Rent</th>
                                      <th className="py-2 px-3 text-center">Status</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100">
                                    {units
                                      .filter(u => (u.propertyId?._id || u.propertyId) === p._id)
                                      .map((u) => (
                                        <tr key={u._id} className="hover:bg-slate-50">
                                          <td className="py-2 px-3 font-bold text-slate-800">
                                            {u.subUnitPartition || u.unitName}
                                          </td>
                                          <td className="py-2 px-3 text-right font-mono font-semibold text-slate-700">
                                            {u.areaSqFt ? `${u.areaSqFt.toLocaleString('en-IN')} sq ft` : '—'}
                                          </td>
                                          <td className="py-2 px-3 text-slate-600">
                                            {u.floor || '—'}
                                          </td>
                                          <td className="py-2 px-3">
                                            {u.currentTenant ? (
                                              <div>
                                                <span className="font-semibold text-slate-900">{u.currentTenant.name}</span>
                                                {u.currentTenant.phone && (
                                                  <span className="text-slate-400 text-[10px] ml-1">({u.currentTenant.phone})</span>
                                                )}
                                              </div>
                                            ) : (
                                              <span className="text-slate-400 italic">None (Vacant)</span>
                                            )}
                                          </td>
                                          <td className="py-2 px-3 text-right font-mono font-bold text-slate-800">
                                            {u.currentRentAgreement?.monthlyRate
                                              ? formatCurrency(u.currentRentAgreement.monthlyRate)
                                              : (u.monthlyRentExpected ? formatCurrency(u.monthlyRentExpected) : '—')}
                                          </td>
                                          <td className="py-2 px-3 text-center">
                                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                              u.occupancyStatus === 'Occupied'
                                                ? 'bg-emerald-100 text-emerald-800'
                                                : 'bg-amber-100 text-amber-800'
                                            }`}>
                                              {u.occupancyStatus || 'Vacant'}
                                            </span>
                                          </td>
                                        </tr>
                                      ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
              )))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-scaleUp">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-lg w-full p-6">
            <h3 className="text-lg font-bold text-slate-900 mb-1">
              {editingProperty ? 'Edit Property' : 'Add New Property'}
            </h3>
            <p className="text-xs text-slate-400 mb-4">Fill in the property details below. Only the name is required.</p>
            <form onSubmit={handleSave} className="space-y-4">
              {/* Property Name */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Property Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Kotak Building, Shree Complex"
                  value={form.name}
                  onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-semibold"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Property Type */}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Property Type</label>
                  <select
                    value={form.propertyType}
                    onChange={(e) => setForm({ ...form, propertyType: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
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
                {/* Total Area */}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Total Area (Sq Ft)</label>
                  <input
                    type="number"
                    placeholder="e.g. 5000"
                    value={form.totalAreaSqFt}
                    onChange={(e) => setForm({ ...form, totalAreaSqFt: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-semibold"
                  />
                </div>
              </div>

              {/* Single Unit vs Multi-Partition Selection (Only when creating new property) */}
              {!editingProperty && (
                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-slate-800 block">
                        Is this property a Single Individual Unit?
                      </span>
                      <span className="text-[11px] text-slate-500">
                        (e.g., An individual Residential Flat, Single Shop, or Individual Godown)
                      </span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.isSingleUnit}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setForm(f => ({
                            ...f,
                            isSingleUnit: checked,
                            unitName: checked ? (f.unitName || `${f.name || 'Unit'}`) : '',
                            subUnitPartition: checked ? (f.subUnitPartition || f.unitName || `${f.name || 'Unit'}`) : ''
                          }));
                        }}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                    </label>
                  </div>

                  {form.isSingleUnit && (
                    <div className="pt-2.5 border-t border-slate-200/80 space-y-3 animate-fadeIn">
                      <div className="p-2.5 rounded-xl bg-emerald-50/70 border border-emerald-200 text-[11px] text-emerald-800 font-medium">
                        ✓ Primary unit will be auto-created for this property. You can directly attach tenants to it without creating partitions manually.
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                            Unit / Flat / Shop Name *
                          </label>
                          <input
                            type="text"
                            required={form.isSingleUnit}
                            placeholder="e.g. Flat 302, Shop 5, Godown A"
                            value={form.unitName}
                            onChange={(e) => setForm(f => ({
                              ...f,
                              unitName: e.target.value,
                              subUnitPartition: e.target.value
                            }))}
                            className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-semibold"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                            Floor / Level
                          </label>
                          <input
                            type="text"
                            placeholder="e.g. 3rd Floor, Ground"
                            value={form.floor}
                            onChange={(e) => setForm(f => ({ ...f, floor: e.target.value }))}
                            className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                          Expected Monthly Rent (₹) <span className="text-slate-400 font-normal">(optional)</span>
                        </label>
                        <input
                          type="number"
                          placeholder="e.g. 15000"
                          value={form.monthlyRentExpected}
                          onChange={(e) => setForm(f => ({ ...f, monthlyRentExpected: e.target.value }))}
                          className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-bold text-emerald-700"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Address */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Address <span className="text-slate-400 font-normal">(optional)</span></label>
                <input
                  type="text"
                  placeholder="e.g. Bhiwandi, Near NH8 Highway"
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Notes <span className="text-slate-400 font-normal">(optional)</span></label>
                <textarea
                  rows="2"
                  placeholder="Any additional info about this property..."
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
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
                  {editingProperty ? 'Save Changes' : 'Create Property'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CUSTOM POST-CREATION GUIDANCE POPUP WITH 3-SECOND LOCKOUT TIMER */}
      {guidanceModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-scaleUp">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-md w-full p-6 text-center space-y-4">
            <div className={`w-14 h-14 rounded-2xl mx-auto flex items-center justify-center ${
              guidanceModal.isSingleUnit ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'
            }`}>
              <Building2 className="w-7 h-7" />
            </div>

            <div>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide mb-2 ${
                guidanceModal.isSingleUnit ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'
              }`}>
                {guidanceModal.isSingleUnit ? 'Individual Single Unit Created' : 'Multi-Partition Complex Created'}
              </span>
              <h3 className="text-lg font-black text-slate-900">
                {guidanceModal.property?.name}
              </h3>
            </div>

            {guidanceModal.isSingleUnit ? (
              <div className="p-4 rounded-2xl bg-emerald-50/70 border border-emerald-200 text-xs text-emerald-950 space-y-1.5 text-left">
                <p className="font-bold text-emerald-900">
                  Unit auto-created successfully!
                </p>
                <p className="text-[11px] leading-relaxed text-emerald-800">
                  This property was registered as an individual single unit (<strong>{guidanceModal.createdUnit?.subUnitPartition || guidanceModal.createdUnit?.unitName || guidanceModal.property?.name}</strong>). It is ready for tenant assignments and rent collection directly.
                </p>
              </div>
            ) : (
              <div className="p-4 rounded-2xl bg-amber-50/80 border border-amber-200 text-xs text-amber-950 space-y-2 text-left">
                <p className="font-bold text-amber-900 flex items-center gap-1.5">
                  <span>Notice: Next Step for Partitions</span>
                </p>
                <p className="text-[11px] leading-relaxed text-amber-800">
                  You created this property as a multi-partition building / godown. If this property has multiple shops, rooms, or partition divisions, please add them in the <strong>Unit & Partitions Master</strong>.
                </p>
              </div>
            )}

            {/* Lockout Timer Notice & Action Buttons */}
            <div className="pt-2 space-y-2.5">
              {!guidanceModal.isSingleUnit && onNavigateToPartitions && (
                <button
                  type="button"
                  onClick={() => {
                    const propId = guidanceModal.property?._id;
                    setGuidanceModal(null);
                    onNavigateToPartitions(propId);
                  }}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold shadow-md shadow-blue-600/20 active:scale-95 transition-all"
                >
                  <span>Go to Unit Master & Add Partitions</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              )}

              <button
                type="button"
                disabled={lockoutCountdown > 0}
                onClick={() => setGuidanceModal(null)}
                className={`w-full py-2.5 rounded-xl text-xs font-bold transition-all ${
                  lockoutCountdown > 0
                    ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
                    : 'bg-slate-900 hover:bg-slate-800 text-white shadow-md active:scale-95'
                }`}
              >
                {lockoutCountdown > 0 ? (
                  <span>Please read details ({lockoutCountdown}s remaining)...</span>
                ) : (
                  <span>Understood & Close</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
