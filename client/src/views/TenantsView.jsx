import React, { useState, useEffect, useMemo } from 'react';
import API from '../services/api';
import * as XLSX from 'xlsx';
import { formatCurrency, formatDate } from '../utils/formatters';
import SearchableSelect from '../components/SearchableSelect';
import ApexToolbar from '../components/ApexToolbar';
import { getHeaderDragProps, useResizableColumns, ResizeHandle, useFrozenColumns, getFrozenColumnStyle } from '../components/ColumnManager';
import { cycleThreeStateSort, evaluateFilterRule, sortDataRows, extractUniqueValues } from '../utils/tableUtils';
import { Users, Plus, Search, Download, TrendingUp, Edit, Trash2, LogOut, RotateCcw, FileText, ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react';

const TENANTS_COLUMNS_DEF = [
  { id: 'tenant', label: 'Tenant Details' },
  { id: 'property', label: 'Property & Sub Unit (Partition)' },
  { id: 'startDate', label: 'Start Date' },
  { id: 'endDate', label: 'End Date' },
  { id: 'rentType', label: 'Rent Frequency' },
  { id: 'monthlyRate', label: 'Contract Rent' },
  { id: 'deposit', label: 'Deposit' },
  { id: 'termsNotes', label: 'Terms / Notes' },
  { id: 'status', label: 'Status' },
  { id: 'createdAt', label: 'Created Date', defaultVisible: false },
  { id: 'updatedAt', label: 'Modified Date', defaultVisible: false },
  { id: 'actions', label: 'Actions' },
];

const DEFAULT_TENANTS_COLS = ['tenant', 'property', 'startDate', 'endDate', 'rentType', 'monthlyRate', 'deposit', 'status', 'actions'];

// Screen-fitting default column widths with sufficient space for actions buttons
const DEFAULT_TENANTS_COLUMN_WIDTHS = {
  tenant: 180,
  property: 170,
  startDate: 105,
  endDate: 100,
  monthlyRate: 110,
  rentType: 100,
  deposit: 95,
  termsNotes: 140,
  status: 90,
  actions: 235
};

const changeRentType = (form, setForm, rentType) => {
  let rentAmount = form.rentAmount;
  if (rentAmount !== '' && form.rentType !== rentType) {
    const amount = Number(rentAmount);
    rentAmount = form.rentType === 'Monthly Fixed'
      ? String(Math.round(amount * 1200) / 100)
      : String(Math.round(amount / 12 * 100) / 100);
  }
  setForm({ ...form, rentType, rentAmount });
};

export default function TenantsView({ onDataChanged }) {
  const [tenants, setTenants] = useState([]);
  const [properties, setProperties] = useState([]);
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [propertyFilter, setPropertyFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: null, direction: null });
  const [isHeaderSticky, setIsHeaderSticky] = useState(true);
  const [frozenColumnCount, setFrozenColumnCount] = useFrozenColumns('tenants_freeze_v1', 0);
  const [activeFilters, setActiveFilters] = useState([]);
  const [activeViewId, setActiveViewId] = useState(null);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [currentPage, setCurrentPage] = useState(1);

  // Suggestions for APEX filter builder dropdown
  const filterSuggestions = useMemo(() => {
    return {
      tenant: extractUniqueValues(tenants, t => t.name),
      property: extractUniqueValues(tenants, t => {
        const p = t.activeUnit?.propertyId?.name || t.activeAssignment?.unitId?.propertyId?.name || '';
        const u = t.activeUnit?.subUnitPartition || t.activeUnit?.unitName || t.activeAssignment?.unitId?.subUnitPartition || t.activeAssignment?.unitId?.unitName || '';
        if (!p && !u) return '';
        return p && u ? `${p} - ${u}` : (p || u);
      }),
      rentType: ['Monthly Fixed', 'Annual Fixed'],
      status: ['Active', 'Inactive'],
      startDate: extractUniqueValues(tenants, t => t.activeAssignment?.startDate ? formatDate(t.activeAssignment.startDate) : ''),
      endDate: extractUniqueValues(tenants, t => t.activeAssignment?.endDate ? formatDate(t.activeAssignment.endDate) : 'Ongoing')
    };
  }, [tenants]);

  const handleHeaderSort = (colId) => {
    if (colId === 'actions') return;
    setSortConfig(prev => cycleThreeStateSort(prev, colId));
  };

  const [visibleColumns, setVisibleColumns] = useState(() => {
    const saved = localStorage.getItem('cols_tenants_v2');
    if (!saved) return DEFAULT_TENANTS_COLS;
    try {
      const allowed = TENANTS_COLUMNS_DEF.map((column) => column.id);
      const savedColumns = JSON.parse(saved).filter((column) => allowed.includes(column));
      return savedColumns.length > 0 ? savedColumns : DEFAULT_TENANTS_COLS;
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
  const [attachContract, setAttachContract] = useState(false);
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
    rentType: 'Monthly Fixed',
    rentAmount: '',
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
      const willAttachContract = editingTenant ? Boolean(form.unitId) : attachContract;

      const payload = {
        name: form.name.trim(),
        phone: form.phone.trim(),
        tenantType: form.tenantType || 'Individual',
        notes: form.notes,
        ...(willAttachContract && form.unitId ? {
          unitId: form.unitId,
          rentType: form.rentType,
          rentAmount: form.rentAmount !== '' ? Number(form.rentAmount) : undefined,
          depositHeld: Number(form.depositHeld) || 0,
          startDate: form.startDate || new Date().toISOString().split('T')[0],
          endDate: form.endDate || null,
          terms: form.terms || ''
        } : {})
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
    setAttachContract(false);
    setForm({
      name: '',
      phone: '',
      tenantType: 'Individual',
      unitId: '',
      startDate: new Date().toISOString().split('T')[0],
      endDate: '',
      rentType: 'Monthly Fixed',
      rentAmount: '',
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

    setAttachContract(Boolean(activeUnit || assignment));
    setForm({
      name: t.name || '',
      phone: t.phone || '',
      tenantType: t.tenantType || 'Individual',
      unitId: activeUnit?._id || '',
      startDate: assignment?.startDate ? new Date(assignment.startDate).toISOString().split('T')[0] : '',
      endDate: assignment?.endDate ? new Date(assignment.endDate).toISOString().split('T')[0] : '',
      rentType: agreement?.rentType || 'Monthly Fixed',
      rentAmount: agreement
        ? String(agreement.rentType === 'Annual Fixed'
          ? (agreement.annualRate || agreement.monthlyRate * 12)
          : agreement.monthlyRate)
        : '',
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

  const filteredTenants = useMemo(() => {
    return tenants.filter(t => {
      const active = t.activeAssignment;
      const tName = t.name || '';
      const phone = t.phone || '';
      const propName = t.activeUnit?.propertyId?.name || active?.unitId?.propertyId?.name || '';
      const unitName = t.activeUnit?.subUnitPartition || t.activeUnit?.unitName || active?.unitId?.unitName || '';
      const status = active ? 'Active' : 'Inactive';
      const rentType = t.currentRentAgreement?.rentType || 'Monthly Fixed';
      const rentAmount = String(
        t.currentRentAgreement?.rentType === 'Annual Fixed'
          ? (t.currentRentAgreement?.annualRate || (t.currentRentAgreement?.monthlyRate || 0) * 12)
          : (t.currentRentAgreement?.monthlyRate || '')
      );
      const deposit = String(active?.depositHeld || 0);
      const termsNotes = t.currentRentAgreement?.terms || t.notes || '';
      const sDate = active?.startDate ? formatDate(active.startDate) : '';
      const eDate = active?.endDate ? formatDate(active.endDate) : 'Ongoing';

      // 1. Text Search Box
      const matchesSearch = !search ||
        tName.toLowerCase().includes(search.toLowerCase()) ||
        phone.includes(search) ||
        propName.toLowerCase().includes(search.toLowerCase()) ||
        unitName.toLowerCase().includes(search.toLowerCase()) ||
        rentAmount.includes(search);

      // 2. Property Quick Filter
      const tenantPropertyId = t.activeUnit?.propertyId?._id || t.activeUnit?.propertyId || active?.unitId?.propertyId?._id || active?.unitId?.propertyId || '';
      const matchesProperty = !propertyFilter || String(tenantPropertyId) === propertyFilter;

      // 3. Status Quick Filter
      const matchesStatus = !statusFilter || (statusFilter === 'active' ? !!active : !active);

      if (!matchesSearch || !matchesProperty || !matchesStatus) return false;

      // 4. APEX Filters
      for (const f of activeFilters) {
        let fieldVal = '';
        if (f.columnId === 'tenant') fieldVal = tName;
        else if (f.columnId === 'property') fieldVal = propName && unitName ? `${propName} - ${unitName}` : (propName || unitName);
        else if (f.columnId === 'startDate') fieldVal = sDate;
        else if (f.columnId === 'endDate') fieldVal = eDate;
        else if (f.columnId === 'rentType') fieldVal = rentType;
        else if (f.columnId === 'monthlyRate') fieldVal = rentAmount;
        else if (f.columnId === 'deposit') fieldVal = deposit;
        else if (f.columnId === 'termsNotes') fieldVal = termsNotes;
        else if (f.columnId === 'status') fieldVal = status;
        else if (f.columnId === 'createdAt') fieldVal = t.createdAt ? formatDate(t.createdAt) : '';
        else if (f.columnId === 'updatedAt') fieldVal = t.updatedAt ? formatDate(t.updatedAt) : '';

        if (!evaluateFilterRule(fieldVal, f.operator, f.value)) return false;
      }

      return true;
    });
  }, [tenants, search, propertyFilter, statusFilter, activeFilters]);

  const sortedTenants = useMemo(() => {
    return sortDataRows(filteredTenants, sortConfig, {
      tenant: t => t.name,
      property: t => `${t.activeUnit?.propertyId?.name || t.activeAssignment?.unitId?.propertyId?.name || ''} ${t.activeUnit?.subUnitPartition || t.activeUnit?.unitName || ''}`,
      startDate: t => t.activeAssignment?.startDate,
      endDate: t => t.activeAssignment?.endDate,
      rentType: t => t.currentRentAgreement?.rentType || 'Monthly Fixed',
      monthlyRate: t => t.currentRentAgreement?.monthlyRate || 0,
      deposit: t => t.activeAssignment?.depositHeld || 0,
      termsNotes: t => t.currentRentAgreement?.terms || t.notes || '',
      status: t => t.activeAssignment ? 'Active' : 'Inactive',
      createdAt: t => t.createdAt,
      updatedAt: t => t.updatedAt
    });
  }, [filteredTenants, sortConfig]);

  // Export ONLY the filtered tenants
  const exportToExcel = () => {
    try {
      const rows = sortedTenants.map((t, idx) => ({
        'Sr No': idx + 1,
        'Tenant Name': t.name,
        'Contact Phone': t.phone || '',
        'Property': t.activeUnit?.propertyId?.name || t.activeAssignment?.unitId?.propertyId?.name || 'Unassigned',
        'Sub Unit (Partition)': t.activeUnit ? (t.activeUnit.subUnitPartition || t.activeUnit.unitName) : 'None',
        'Start Date': t.activeAssignment ? formatDate(t.activeAssignment.startDate) : '',
        'End Date': t.activeAssignment?.endDate ? formatDate(t.activeAssignment.endDate) : 'Ongoing (Blank)',
        'Rent Frequency': t.currentRentAgreement?.rentType || 'Monthly Fixed',
        'Contract Rent (₹)': t.currentRentAgreement
          ? (t.currentRentAgreement.rentType === 'Annual Fixed'
            ? t.currentRentAgreement.annualRate || (t.currentRentAgreement.monthlyRate || 0) * 12
            : t.currentRentAgreement.monthlyRate || 0)
          : 0,
        'Security Deposit (₹)': t.activeAssignment ? (t.activeAssignment.depositHeld || 0) : 0,
        'Terms / Notes': t.currentRentAgreement?.terms || t.notes || '',
        'Status': t.activeAssignment ? 'Active Lease' : 'Vacated / Inactive',
        'Created Date': t.createdAt ? formatDate(t.createdAt) : '',
        'Modified Date': t.updatedAt ? formatDate(t.updatedAt) : ''
      }));

      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Tenants');
      XLSX.writeFile(wb, `Tenants_Filtered_${new Date().toISOString().split('T')[0]}.xlsx`);
    } catch (err) {
      console.error('Failed to export tenants to Excel:', err);
    }
  };

  // Pagination Slice
  const totalItems = sortedTenants.length;
  const isAllRows = rowsPerPage === 'All';
  const effectivePageSize = isAllRows ? totalItems || 1 : Number(rowsPerPage);
  const totalPages = Math.ceil(totalItems / effectivePageSize) || 1;

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(1);
  }, [totalPages, currentPage]);

  const paginatedTenants = useMemo(() => {
    if (isAllRows) return sortedTenants;
    const startIndex = (currentPage - 1) * effectivePageSize;
    return sortedTenants.slice(startIndex, startIndex + effectivePageSize);
  }, [sortedTenants, isAllRows, currentPage, effectivePageSize]);

  return (
    <div className="space-y-2">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-white p-3 sm:p-3.5 rounded-2xl shadow-2xs border border-slate-200">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold shrink-0">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-extrabold text-slate-900 leading-tight">Tenants</h2>
          </div>
        </div>

        {/* Quick Filters */}
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <SearchableSelect
            className="w-full sm:w-52"
            value={propertyFilter}
            onChange={(val) => { setPropertyFilter(val); setCurrentPage(1); }}
            placeholder="All Properties"
            searchPlaceholder="Search properties..."
            options={properties.map((property) => ({ value: property._id, label: property.name }))}
          />
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl shrink-0">
            <button
              onClick={() => { setStatusFilter(''); setCurrentPage(1); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                !statusFilter ? 'bg-white text-emerald-700 shadow-xs' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              All ({tenants.length})
            </button>
            <button
              onClick={() => { setStatusFilter('active'); setCurrentPage(1); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                statusFilter === 'active' ? 'bg-white text-emerald-700 shadow-xs' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              Active
            </button>
            <button
              onClick={() => { setStatusFilter('inactive'); setCurrentPage(1); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                statusFilter === 'inactive' ? 'bg-white text-emerald-700 shadow-xs' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              Inactive
            </button>
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
        columns={TENANTS_COLUMNS_DEF}
        defaultColumns={DEFAULT_TENANTS_COLS}
        visibleColumns={visibleColumns}
        onChangeVisibleColumns={(cols) => {
          setVisibleColumns(cols);
          try { localStorage.setItem('cols_tenants_v2', JSON.stringify(cols)); } catch(e){}
        }}
        columnWidths={columnWidths}
        onResetWidths={resetColumnWidths}
        sortConfig={sortConfig}
        onSortChange={setSortConfig}
        isHeaderSticky={isHeaderSticky}
        onToggleHeaderSticky={setIsHeaderSticky}
        frozenColumnCount={frozenColumnCount}
        onFrozenColumnCountChange={setFrozenColumnCount}
        filters={activeFilters}
        onFiltersChange={(flts) => { setActiveFilters(flts); setCurrentPage(1); }}
        filterSuggestions={filterSuggestions}
        onExport={exportToExcel}
        storageKey="tenants_v2"
        activeViewName={activeViewId}
        onViewChange={setActiveViewId}
        primaryAction={
          <button
            onClick={openCreateTenant}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-sm active:scale-95 shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Register Tenant</span>
          </button>
        }
      />

      {/* Excel Table Grid */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden flex flex-col">
        {/* Mobile Swipe Cue */}
        <div className="sm:hidden px-3 py-1.5 bg-emerald-50 border-b border-emerald-100 text-[11px] text-emerald-800 font-medium flex items-center justify-between">
          <span>Swipe horizontally to view all columns</span>
          <span>→</span>
        </div>

        <div className="overflow-x-auto max-h-[70vh] overflow-y-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
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
            <thead className={isHeaderSticky ? 'sticky top-0 z-20 shadow-xs' : ''}>
              <tr className="bg-slate-100/90 text-slate-700 font-bold border-b border-slate-200 select-none">
                {visibleColumns.map((colId, colIndex) => {
                  const def = TENANTS_COLUMNS_DEF.find(c => c.id === colId);
                  if (!def) return null;
                  const width = columnWidths[colId] || DEFAULT_TENANTS_COLUMN_WIDTHS[colId] || 100;
                  const frozenStyle = getFrozenColumnStyle(colIndex, frozenColumnCount, visibleColumns, columnWidths, true);
                  let alignClass = 'text-left';
                  if (colId === 'status' || colId === 'rentType' || colId === 'createdAt' || colId === 'updatedAt') alignClass = 'text-center';
                  if (['monthlyRate', 'deposit'].includes(colId)) alignClass = 'text-right';
                  if (colId === 'actions') alignClass = 'text-center';

                  return (
                    <th 
                      key={colId} 
                      {...getHeaderDragProps(colId, visibleColumns, setVisibleColumns, 'tenants_v2')}
                      style={{ ...frozenStyle, width: `${Math.max(width, 45)}px`, minWidth: `${Math.max(width, 45)}px` }}
                      className={`py-2 pl-2.5 pr-6 border-r border-slate-300 relative group select-none whitespace-normal break-words leading-tight ${alignClass} ${frozenStyle.backgroundColor ? '' : 'bg-slate-100'}`}
                    >
                      <div className={`flex items-center gap-1 w-full ${
                        alignClass === 'text-right' ? 'justify-end' : alignClass === 'text-center' ? 'justify-center' : 'justify-start'
                      }`}>
                        {colId === 'actions' ? (
                          <span className="text-xs font-bold text-slate-700 break-words leading-tight">{def.label}</span>
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
                <tr><td colSpan={visibleColumns.length} className="py-8 text-center text-slate-400">Loading tenants...</td></tr>
              ) : filteredTenants.length === 0 ? (
                <tr>
                  <td colSpan={visibleColumns.length} className="py-8 text-center text-slate-400">
                    No tenants found matching your filters.
                  </td>
                </tr>
              ) : (
                paginatedTenants.map((t) => (
                  <tr key={t._id} className="hover:bg-emerald-50/30 transition-colors">
                    {visibleColumns.map((colId, colIndex) => {
                      const frozenStyle = getFrozenColumnStyle(colIndex, frozenColumnCount, visibleColumns, columnWidths, false);
                      if (colId === 'tenant') {
                        return (
                          <td key={colId} style={frozenStyle} className="py-3.5 px-4 border-r border-slate-200">
                            <span className="font-bold text-slate-900 text-xs block">{t.name}</span>
                            <span className="text-[11px] text-slate-500">{t.phone || 'No phone number'}</span>
                          </td>
                        );
                      }
                      if (colId === 'property') {
                        return (
                          <td key={colId} style={frozenStyle} className="py-3.5 px-4 border-r border-slate-200">
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
                          <td key={colId} style={frozenStyle} className="py-3.5 px-4 border-r border-slate-200 font-mono text-slate-700">
                            {t.activeAssignment ? formatDate(t.activeAssignment.startDate) : '—'}
                          </td>
                        );
                      }
                      if (colId === 'endDate') {
                        return (
                          <td key={colId} style={frozenStyle} className="py-3.5 px-4 border-r border-slate-200 font-mono text-slate-700">
                            {t.activeAssignment?.endDate ? formatDate(t.activeAssignment.endDate) : <span className="text-slate-400 italic">Blank</span>}
                          </td>
                        );
                      }
                      if (colId === 'monthlyRate') {
                        return (
                          <td key={colId} style={frozenStyle} className="py-3.5 px-4 border-r border-slate-200 text-right font-mono font-bold text-slate-900">
                            {t.currentRentAgreement
                              ? formatCurrency(t.currentRentAgreement.rentType === 'Annual Fixed'
                                ? t.currentRentAgreement.annualRate || t.currentRentAgreement.monthlyRate * 12
                                : t.currentRentAgreement.monthlyRate)
                              : '—'}
                          </td>
                        );
                      }
                      if (colId === 'rentType') {
                        return (
                          <td key={colId} style={frozenStyle} className="py-3.5 px-4 border-r border-slate-200 text-center text-slate-700">
                            {t.currentRentAgreement?.rentType === 'Annual Fixed' ? 'Annual' : t.currentRentAgreement ? 'Monthly' : '—'}
                          </td>
                        );
                      }
                      if (colId === 'createdAt' || colId === 'updatedAt') {
                        return (
                          <td key={colId} style={frozenStyle} className="py-3.5 px-4 border-r border-slate-200 text-slate-600 whitespace-nowrap">
                            {t[colId] ? formatDate(t[colId]) : '—'}
                          </td>
                        );
                      }
                      if (colId === 'deposit') {
                        return (
                          <td key={colId} style={frozenStyle} className="py-3.5 px-4 border-r border-slate-200 text-right font-mono text-slate-700">
                            {t.activeAssignment?.depositHeld ? formatCurrency(t.activeAssignment.depositHeld) : '—'}
                          </td>
                        );
                      }
                      if (colId === 'termsNotes') {
                        return (
                          <td key={colId} style={frozenStyle} className="py-3.5 px-4 border-r border-slate-200 text-slate-600 max-w-xs truncate">
                            {t.currentRentAgreement?.terms || t.notes || '—'}
                          </td>
                        );
                      }
                      if (colId === 'status') {
                        return (
                          <td key={colId} style={frozenStyle} className="py-3.5 px-4 border-r border-slate-200 text-center">
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
                          <td key={colId} style={frozenStyle} className="py-3.5 px-4 border-r border-slate-200 font-mono text-slate-700 text-xs">
                            {t.phone || '—'}
                          </td>
                        );
                      }
                      if (colId === 'actions') {
                        return (
                          <td key={colId} style={frozenStyle} className="py-3.5 px-4 text-right">
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

        {/* Pagination Footer */}
        {totalItems > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 bg-slate-50/80 border-t border-slate-200 text-xs text-slate-500 font-semibold select-none">
            <div className="flex items-center gap-2">
              <span>
                Showing {isAllRows ? 'all' : Math.min((currentPage - 1) * effectivePageSize + 1, totalItems)} to{' '}
                {isAllRows ? totalItems : Math.min(currentPage * effectivePageSize, totalItems)} of {totalItems} tenants
              </span>
              {activeFilters.length > 0 && (
                <span className="text-teal-700 font-bold bg-teal-50 px-2 py-0.5 rounded-full border border-teal-200">
                  (Filtered from {tenants.length} total)
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

              {/* Optional Lease Contract Creation Toggle */}
              {!editingTenant && (
                <div className="flex items-center justify-between p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 hover:bg-slate-50 transition-colors">
                  <div className="flex items-center gap-2.5">
                    <div className={`p-2 rounded-lg ${attachContract ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'}`}>
                      <FileText className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-xs font-bold text-slate-800 block">Create Lease Contract Now? (Optional)</span>
                      <span className="text-[11px] text-slate-500 block">Enable to assign this tenant to a vacant unit and start tenancy immediately</span>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={attachContract}
                      onChange={(e) => {
                        setAttachContract(e.target.checked);
                        if (!e.target.checked) {
                          setForm(f => ({ ...f, unitId: '', rentAmount: '' }));
                        }
                      }}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
                  </label>
                </div>
              )}

              {/* Sub-Unit Lease Section (Visible if editing or if contract toggle is ON) */}
              {(editingTenant || attachContract) && (
                <div className="p-4 bg-emerald-50/40 rounded-xl border border-emerald-100 space-y-3.5 animate-fadeIn">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-emerald-950 uppercase tracking-wide">
                      Lease Contract & Unit Details
                    </h4>
                    <span className="text-[10px] font-semibold text-emerald-800 bg-emerald-100/80 px-2 py-0.5 rounded">
                      Creates active contract
                    </span>
                  </div>

                  <div>
                    <SearchableSelect
                      label="Vacant Unit *"
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
                        ? 'Select the property & vacant partition to start the lease agreement.'
                        : 'No vacant units available. Add a property and unit in the Masters panel first.'}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">Rent Frequency *</label>
                      <select
                        value={form.rentType}
                        onChange={(e) => changeRentType(form, setForm, e.target.value)}
                        className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      >
                        <option value="Monthly Fixed">Monthly</option>
                        <option value="Annual Fixed">Annual</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                        {form.rentType === 'Annual Fixed' ? 'Annual Rent (₹) *' : 'Monthly Rent (₹) *'}
                      </label>
                      <input
                        type="number"
                        required={!!form.unitId}
                        min="0"
                        step="0.01"
                        placeholder={form.rentType === 'Annual Fixed' ? 'e.g. 264000' : 'e.g. 22000'}
                        value={form.rentAmount}
                        onChange={(e) => setForm({ ...form, rentAmount: e.target.value })}
                        className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-semibold"
                      />
                      {form.rentType === 'Annual Fixed' && (
                        <p className="mt-1 text-[10px] text-slate-500">
                          Rent ledger accrues {formatCurrency((Number(form.rentAmount) || 0) / 12)} per month.
                        </p>
                      )}
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">Security Deposit (₹)</label>
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
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">Start Date *</label>
                      <input
                        type="date"
                        required={!!form.unitId}
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
              )}

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
