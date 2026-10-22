import React, { useState, useEffect, useMemo } from 'react';
import API from '../services/api';
import * as XLSX from 'xlsx';
import SearchableSelect from '../components/SearchableSelect';
import ApexToolbar from '../components/ApexToolbar';
import { Layers, Plus, Search, Download, Edit, Trash2, RotateCcw, ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { formatCurrency, formatDate } from '../utils/formatters';
import { getHeaderDragProps, useResizableColumns, ResizeHandle } from '../components/ColumnManager';
import { cycleThreeStateSort, evaluateFilterRule, sortDataRows, extractUniqueValues } from '../utils/tableUtils';

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
  notes: 140,
  createdAt: 110,
  updatedAt: 110
};

export default function PartitionsView({ initialPropertyFilter, initialSearch = '', onClearPropertyFilter, onDataChanged }) {
  const [units, setUnits] = useState([]);
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(initialSearch);
  const [selectedPropertyFilter, setSelectedPropertyFilter] = useState(initialPropertyFilter || '');
  const [occupancyFilter, setOccupancyFilter] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: null, direction: null });
  const [isHeaderSticky, setIsHeaderSticky] = useState(true);
  const [activeFilters, setActiveFilters] = useState([]);
  const [activeViewId, setActiveViewId] = useState(null);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

  // Suggestions for APEX filter builder dropdown
  const filterSuggestions = useMemo(() => {
    return {
      property: extractUniqueValues(units, u => u.propertyId?.name),
      partition: extractUniqueValues(units, u => u.subUnitPartition || u.unitName),
      status: ['Vacant', 'Occupied', 'Maintenance', 'Under Notice'],
      tenant: extractUniqueValues(units, u => u.currentTenant?.name)
    };
  }, [units]);

  const handleHeaderSort = (colId) => {
    if (colId === 'actions') return;
    setSortConfig(prev => cycleThreeStateSort(prev, colId));
  };

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

  const filteredUnits = useMemo(() => {
    return units.filter(u => {
      const pName = u.propertyId?.name || '';
      const partName = u.subUnitPartition || u.unitName || '';
      const area = String(u.areaSqFt || 0);
      const floor = u.floor || u.unitType || '';
      const status = u.occupancyStatus || 'Vacant';
      const tenant = u.currentTenant?.name || '';
      const rent = String(u.currentRentAgreement?.monthlyRate ?? u.monthlyRentExpected ?? '');
      const notes = u.notes || '';
      const sDate = u.createdAt ? formatDate(u.createdAt) : '';
      const eDate = u.updatedAt ? formatDate(u.updatedAt) : '';

      // 1. Text Search Box
      const q = search.toLowerCase();
      const matchesSearch = !search ||
        partName.toLowerCase().includes(q) ||
        pName.toLowerCase().includes(q) ||
        tenant.toLowerCase().includes(q) ||
        rent.includes(q);

      // 2. Property & Status Quick Filters
      const matchesProp = !selectedPropertyFilter || (u.propertyId?._id === selectedPropertyFilter || u.propertyId === selectedPropertyFilter);
      const matchesOccupancy = !occupancyFilter || status === occupancyFilter;

      if (!matchesSearch || !matchesProp || !matchesOccupancy) return false;

      // 3. APEX Filters
      for (const f of activeFilters) {
        let fieldVal = '';
        if (f.columnId === 'property') fieldVal = pName;
        else if (f.columnId === 'partition') fieldVal = partName;
        else if (f.columnId === 'area') fieldVal = area;
        else if (f.columnId === 'floor') fieldVal = floor;
        else if (f.columnId === 'status') fieldVal = status;
        else if (f.columnId === 'tenant') fieldVal = tenant;
        else if (f.columnId === 'rent') fieldVal = rent;
        else if (f.columnId === 'notes') fieldVal = notes;
        else if (f.columnId === 'createdAt') fieldVal = sDate;
        else if (f.columnId === 'updatedAt') fieldVal = eDate;

        if (!evaluateFilterRule(fieldVal, f.operator, f.value)) return false;
      }

      return true;
    });
  }, [units, search, selectedPropertyFilter, occupancyFilter, activeFilters]);

  const sortedUnits = useMemo(() => {
    if (!sortConfig.key || !sortConfig.direction) {
      return [...filteredUnits].sort((a, b) => {
        const orderA = (a.propertyId?.displayOrder && a.propertyId.displayOrder > 0) ? a.propertyId.displayOrder : 9999;
        const orderB = (b.propertyId?.displayOrder && b.propertyId.displayOrder > 0) ? b.propertyId.displayOrder : 9999;
        if (orderA !== orderB) return orderA - orderB;
        const pNameA = a.propertyId?.name || '';
        const pNameB = b.propertyId?.name || '';
        if (pNameA.localeCompare(pNameB) !== 0) return pNameA.localeCompare(pNameB);
        const partA = a.subUnitPartition || a.unitName || '';
        const partB = b.subUnitPartition || b.unitName || '';
        return partA.localeCompare(partB);
      });
    }
    return sortDataRows(filteredUnits, sortConfig, {
      property: u => u.propertyId?.name,
      partition: u => u.subUnitPartition || u.unitName,
      area: u => u.areaSqFt || 0,
      floor: u => u.floor || u.unitType || '',
      status: u => u.occupancyStatus || 'Vacant',
      tenant: u => u.currentTenant?.name || '',
      rent: u => u.currentRentAgreement?.monthlyRate ?? u.monthlyRentExpected ?? 0,
      notes: u => u.notes || '',
      createdAt: u => u.createdAt,
      updatedAt: u => u.updatedAt
    });
  }, [filteredUnits, sortConfig]);

  // Export ONLY the filtered partitions
  const exportToExcel = () => {
    try {
      const rows = sortedUnits.map((u, idx) => ({
        'Sr No': idx + 1,
        'Property': u.propertyId?.name || '',
        'Sub Unit (Partition)': u.subUnitPartition || u.unitName,
        'Partition Area (Sq Ft)': u.areaSqFt || 0,
        'Floor': u.floor || '',
        'Status': u.occupancyStatus || 'Vacant',
        'Current Tenant': u.currentTenant ? u.currentTenant.name : 'Vacant',
        'Monthly Rent Rate (₹)': u.currentRentAgreement ? u.currentRentAgreement.monthlyRate : (u.monthlyRentExpected || 0),
        'Notes': u.notes || '',
        'Created Date': u.createdAt ? formatDate(u.createdAt) : '',
        'Modified Date': u.updatedAt ? formatDate(u.updatedAt) : ''
      }));

      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Partitions');
      XLSX.writeFile(wb, `Partitions_Filtered_${new Date().toISOString().split('T')[0]}.xlsx`);
    } catch (err) {
      console.error('Failed to export partitions to Excel:', err);
    }
  };

  // Pagination Slice
  const totalItems = sortedUnits.length;
  const isAllRows = rowsPerPage === 'All';
  const effectivePageSize = isAllRows ? totalItems || 1 : Number(rowsPerPage);
  const totalPages = Math.ceil(totalItems / effectivePageSize) || 1;

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(1);
  }, [totalPages, currentPage]);

  const paginatedUnits = useMemo(() => {
    if (isAllRows) return sortedUnits;
    const startIndex = (currentPage - 1) * effectivePageSize;
    return sortedUnits.slice(startIndex, startIndex + effectivePageSize);
  }, [sortedUnits, isAllRows, currentPage, effectivePageSize]);

  return (
    <div className="space-y-4">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 sm:p-5 rounded-2xl shadow-xs border border-slate-200">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold shrink-0">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-extrabold text-slate-900 leading-tight">Property-Unit (Partitions) Master</h2>
            <p className="text-xs text-slate-500">
              Dedicated master for sub-units and partitions with individual area (sq ft) and occupancy status
            </p>
          </div>
        </div>

        {/* Quick Filter Selects */}
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <select
            value={selectedPropertyFilter}
            onChange={(e) => { setSelectedPropertyFilter(e.target.value); setCurrentPage(1); }}
            className="w-full sm:w-52 px-3 py-1.5 text-xs rounded-xl border border-slate-200 bg-white font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="">All Properties ({properties.length})</option>
            {properties.map(p => (
              <option key={p._id} value={p._id}>{p.name}</option>
            ))}
          </select>
          <select
            value={occupancyFilter}
            onChange={(e) => { setOccupancyFilter(e.target.value); setCurrentPage(1); }}
            className="w-full sm:w-36 px-3 py-1.5 text-xs rounded-xl border border-slate-200 bg-white font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="">All statuses</option>
            <option value="Vacant">Vacant</option>
            <option value="Occupied">Occupied</option>
            <option value="Maintenance">Maintenance</option>
            <option value="Under Notice">Under Notice</option>
          </select>
          <div className="text-xs text-slate-500 font-medium px-2">
            <b>{filteredUnits.length}</b> Partitions
          </div>
        </div>
      </div>

      {/* Oracle APEX-Style Toolbar */}
      <ApexToolbar
        search={search}
        onSearchChange={(val) => { setSearch(val); setCurrentPage(1); }}
        rowsPerPage={rowsPerPage}
        onRowsPerPageChange={(val) => { setRowsPerPage(val); setCurrentPage(1); }}
        availableRowsOptions={[5, 10, 25, 50, 100, 'All']}
        columns={PARTITIONS_COLUMNS_DEF}
        visibleColumns={visibleColumns}
        onChangeVisibleColumns={(cols) => {
          setVisibleColumns(cols);
          try { localStorage.setItem('cols_partitions', JSON.stringify(cols)); } catch(e){}
        }}
        onResetWidths={resetColumnWidths}
        isHeaderSticky={isHeaderSticky}
        onToggleHeaderSticky={setIsHeaderSticky}
        filters={activeFilters}
        onFiltersChange={(flts) => { setActiveFilters(flts); setCurrentPage(1); }}
        filterSuggestions={filterSuggestions}
        onExport={exportToExcel}
        storageKey="partitions"
        activeViewName={activeViewId}
        onViewChange={setActiveViewId}
        primaryAction={
          <button
            onClick={openCreate}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-sm active:scale-95 shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Partition</span>
          </button>
        }
      />

      {/* Excel-Style Grid Card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden flex flex-col">
        {/* Mobile Swipe Cue */}
        <div className="sm:hidden px-3 py-1.5 bg-emerald-50 border-b border-emerald-100 text-[11px] text-emerald-800 font-medium flex items-center justify-between">
          <span>Swipe horizontally to view all columns</span>
          <span>→</span>
        </div>

        <div className="overflow-x-auto max-h-[70vh] overflow-y-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
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
            <thead className={isHeaderSticky ? 'sticky top-0 z-20 shadow-xs' : ''}>
              <tr className="bg-slate-100/90 text-slate-700 font-bold border-b border-slate-200 select-none">
                {visibleColumns.map(colId => {
                  const def = PARTITIONS_COLUMNS_DEF.find(c => c.id === colId);
                  if (!def) return null;
                  const width = columnWidths[colId] || DEFAULT_PARTITIONS_COLUMN_WIDTHS[colId] || 100;
                  let alignClass = 'text-left';
                  if (['status', 'createdAt', 'updatedAt'].includes(colId)) alignClass = 'text-center';
                  if (['area', 'rent', 'actions'].includes(colId)) alignClass = 'text-right';

                  const isSortable = colId !== 'actions';
                  return (
                    <th 
                      key={colId} 
                      {...getHeaderDragProps(colId, visibleColumns, setVisibleColumns, 'partitions')}
                      style={{ width: `${Math.max(width, 105)}px`, minWidth: `${Math.max(width, 105)}px` }}
                      className={`py-3 pl-3 pr-7 border-r border-slate-200 relative group bg-slate-100/95 select-none whitespace-nowrap overflow-hidden ${alignClass}`}
                    >
                      <div className={`flex items-center gap-1.5 w-full overflow-hidden ${
                        alignClass === 'text-right' ? 'justify-end' : alignClass === 'text-center' ? 'justify-center' : 'justify-start'
                      }`}>
                        {colId === 'actions' ? (
                          <span className="truncate text-xs font-bold text-slate-700">{def.label}</span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleHeaderSort(colId)}
                            className="group/btn flex items-center gap-1 min-w-0 max-w-full text-xs font-bold text-slate-700 hover:text-slate-900 transition-colors"
                            title={`Sort by ${def.label} (Click: Descending → Ascending → Clear)`}
                          >
                            <span className="truncate">{def.label}</span>
                            <span className="inline-flex shrink-0 items-center justify-center w-3.5 h-3.5">
                              {sortConfig.key === colId ? (
                                sortConfig.direction === 'desc' ? (
                                  <span className="text-teal-600 font-extrabold text-[13px] leading-none">↓</span>
                                ) : (
                                  <span className="text-teal-600 font-extrabold text-[13px] leading-none">↑</span>
                                )
                              ) : (
                                <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-0 group-hover/btn:opacity-100 transition-opacity" />
                              )}
                            </span>
                          </button>
                        )}
                      </div>
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
                    No sub-units or partitions found matching your filters.
                  </td>
                </tr>
              ) : (
                paginatedUnits.map((u) => (
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

        {/* Pagination Footer */}
        {totalItems > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 bg-slate-50/80 border-t border-slate-200 text-xs text-slate-500 font-semibold select-none">
            <div className="flex items-center gap-2">
              <span>
                Showing {isAllRows ? 'all' : Math.min((currentPage - 1) * effectivePageSize + 1, totalItems)} to{' '}
                {isAllRows ? totalItems : Math.min(currentPage * effectivePageSize, totalItems)} of {totalItems} partitions
              </span>
              {activeFilters.length > 0 && (
                <span className="text-teal-700 font-bold bg-teal-50 px-2 py-0.5 rounded-full border border-teal-200">
                  (Filtered from {units.length} total)
                </span>
              )}
            </div>

            {!isAllRows && totalPages > 1 && (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                  className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  title="Previous page"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-800 font-bold">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  type="button"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                  className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  title="Next page"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        )}
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
