import React, { useState, useEffect, useMemo } from 'react';
import API from '../services/api';
import * as XLSX from 'xlsx';
import { formatCurrency, formatDate } from '../utils/formatters';
import SearchableSelect from '../components/SearchableSelect';
import ApexToolbar from '../components/ApexToolbar';
import { getHeaderDragProps, useResizableColumns, ResizeHandle } from '../components/ColumnManager';
import { cycleThreeStateSort, evaluateFilterRule, sortDataRows, extractUniqueValues } from '../utils/tableUtils';
import {
  FileText, Plus, Search, Calendar, TrendingUp, Edit2, LogOut, History,
  X, Download, RotateCcw, ChevronLeft, ChevronRight, ArrowUpDown, AlertCircle
} from 'lucide-react';

const CONTRACTS_COLUMNS_DEF = [
  { id: 'property', label: 'Property' },
  { id: 'subUnit', label: 'Sub-Property / Partition' },
  { id: 'tenant', label: 'Tenant' },
  { id: 'monthlyRent', label: 'Rent Per Month' },
  { id: 'annualRent', label: 'Rent Per Annum' },
  { id: 'depositHeld', label: 'Deposit' },
  { id: 'startDate', label: 'Start Date' },
  { id: 'endDate', label: 'End Date' },
  { id: 'status', label: 'Contract Status' },
  { id: 'notes', label: 'Comments / Notes' },
  { id: 'actions', label: 'Actions' },
  // Preserved secondary columns available in Column Manager
  { id: 'assignmentCode', label: 'Contract Code', defaultVisible: false },
  { id: 'rentType', label: 'Rent Frequency', defaultVisible: false },
  { id: 'currentRate', label: 'Contract Rent', defaultVisible: false },
  { id: 'totalReceived', label: 'Received', defaultVisible: false },
  { id: 'outstanding', label: 'Outstanding', defaultVisible: false },
  { id: 'history', label: 'Rate History', defaultVisible: false },
  { id: 'createdAt', label: 'Created Date', defaultVisible: false },
  { id: 'updatedAt', label: 'Modified Date', defaultVisible: false },
];

const DEFAULT_CONTRACTS_COLS = [
  'property', 'subUnit', 'tenant', 'monthlyRent', 'annualRent',
  'depositHeld', 'startDate', 'endDate', 'status', 'notes', 'actions'
];

const DEFAULT_CONTRACTS_COLUMN_WIDTHS = {
  property: 160,
  subUnit: 140,
  tenant: 150,
  monthlyRent: 120,
  annualRent: 125,
  depositHeld: 110,
  startDate: 110,
  endDate: 110,
  status: 110,
  notes: 190,
  actions: 140,
  assignmentCode: 120,
  rentType: 110,
  currentRate: 120,
  totalReceived: 110,
  outstanding: 110,
  history: 100,
  createdAt: 105,
  updatedAt: 105,
};

const getContractRentType = (contract) => (
  contract.currentAgreement?.rentType || 'Monthly Fixed'
);

const getContractRentAmount = (contract) => {
  const agreement = contract.currentAgreement;
  if (!agreement) return contract.currentMonthlyRate || 0;
  if (agreement.rentType === 'Annual Fixed') {
    return agreement.annualRate || agreement.monthlyRate * 12;
  }
  return agreement.monthlyRate || 0;
};

const isContractEndDatePast = (endDate) => (
  Boolean(endDate) && endDate.slice(0, 10) < new Date().toISOString().slice(0, 10)
);

const changeRentType = (form, setForm, nextRentType) => {
  let rentAmount = form.rentAmount;
  if (rentAmount !== '' && form.rentType !== nextRentType) {
    const amount = Number(rentAmount);
    if (form.rentType === 'Monthly Fixed' && nextRentType === 'Annual Fixed') {
      rentAmount = String(Math.round(amount * 1200) / 100);
    } else if (form.rentType === 'Annual Fixed' && nextRentType === 'Monthly Fixed') {
      rentAmount = String(Math.round(amount / 12 * 100) / 100);
    }
  }
  setForm({ ...form, rentType: nextRentType, rentAmount });
};

const getContractColumnWidth = (columnId, columnWidths) => Math.max(
  columnWidths[columnId] || DEFAULT_CONTRACTS_COLUMN_WIDTHS[columnId] || 100,
  columnId === 'actions' ? 220 : 0
);

export default function ContractsView() {
  const [contracts, setContracts] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [properties, setProperties] = useState([]);
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Column management & resizable widths with localStorage persistence
  const [visibleColumns, setVisibleColumns] = useState(() => {
    const saved = localStorage.getItem('cols_contracts_v2');
    if (!saved) return DEFAULT_CONTRACTS_COLS;
    try {
      const allowed = CONTRACTS_COLUMNS_DEF.map((c) => c.id);
      const savedColumns = JSON.parse(saved).filter((c) => allowed.includes(c));
      return savedColumns.length > 0 ? savedColumns : DEFAULT_CONTRACTS_COLS;
    } catch {
      return DEFAULT_CONTRACTS_COLS;
    }
  });

  const {
    columnWidths,
    handleResizeStart,
    resetColumnWidths
  } = useResizableColumns('contracts_v2', DEFAULT_CONTRACTS_COLUMN_WIDTHS);

  // Controls & Toolbar States (APEX Integration)
  const [search, setSearch] = useState('');
  const [propertyFilter, setPropertyFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('Active');
  const [isHeaderSticky, setIsHeaderSticky] = useState(true);
  const [activeFilters, setActiveFilters] = useState([]);
  const [activeViewId, setActiveViewId] = useState(null);
  const [sortConfig, setSortConfig] = useState({ key: 'property', direction: 'asc' });

  // Dynamic suggestions for APEX filter builder dropdown
  const filterSuggestions = useMemo(() => {
    return {
      property: extractUniqueValues(contracts, c => c.unitId?.propertyId?.name),
      subUnit: extractUniqueValues(contracts, c => c.unitId?.subUnitPartition || c.unitId?.unitName),
      tenant: extractUniqueValues(contracts, c => c.tenantId?.name),
      status: ['Active', 'Ended'],
      startDate: extractUniqueValues(contracts, c => c.startDate ? formatDate(c.startDate) : ''),
      endDate: extractUniqueValues(contracts, c => c.endDate ? formatDate(c.endDate) : 'Ongoing'),
      rentType: ['Monthly Fixed', 'Annual Fixed'],
      assignmentCode: extractUniqueValues(contracts, c => c.assignmentCode)
    };
  }, [contracts]);

  const handleHeaderSort = (colId) => {
    if (colId === 'actions') return;
    setSortConfig(prev => cycleThreeStateSort(prev, colId));
  };

  // Pagination State
  const [rowsPerPage, setRowsPerPage] = useState(10); // default 10 or 'All'
  const [currentPage, setCurrentPage] = useState(1);

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showReviseModal, setShowReviseModal] = useState(false);
  const [showVacateModal, setShowVacateModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [selectedContract, setSelectedContract] = useState(null);

  // Forms
  const [createForm, setCreateForm] = useState({
    tenantId: '',
    propertyId: '',
    unitId: '',
    startDate: '',
    endDate: '',
    status: 'Active',
    rentType: 'Monthly Fixed',
    rentAmount: '',
    depositHeld: 0,
    terms: '',
    notes: '',
  });

  const [editForm, setEditForm] = useState({
    tenantId: '',
    propertyId: '',
    unitId: '',
    startDate: '',
    endDate: '',
    status: 'Active',
    rentType: 'Monthly Fixed',
    rentAmount: '',
    depositHeld: 0,
    terms: '',
    notes: '',
  });

  const [reviseForm, setReviseForm] = useState({
    rentType: 'Monthly Fixed',
    rentAmount: '',
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

  const availableUnitsForEdit = units.filter(
    u => !editForm.propertyId || String(u.propertyId?._id || u.propertyId) === editForm.propertyId
  );

  // Active conflict check: exactly 1 active contract allowed per unit
  const activeConflictInCreate = useMemo(() => {
    if (!createForm.unitId || createForm.status !== 'Active') return null;
    return contracts.find(c => c.status === 'Active' && String(c.unitId?._id || c.unitId) === createForm.unitId);
  }, [contracts, createForm.unitId, createForm.status]);

  const activeConflictInEdit = useMemo(() => {
    if (!editForm.unitId || editForm.status !== 'Active' || !selectedContract) return null;
    return contracts.find(c => c.status === 'Active' && String(c.unitId?._id || c.unitId) === editForm.unitId && c._id !== selectedContract._id);
  }, [contracts, editForm.unitId, editForm.status, selectedContract]);

  const handleCreateContract = async (e) => {
    e.preventDefault();
    if (createForm.status === 'Active' && activeConflictInCreate) {
      alert(`Cannot activate contract: This sub-property already has an active contract (${activeConflictInCreate.assignmentCode}) with ${activeConflictInCreate.tenantId?.name}. Please end or vacate the current contract first, or save as 'Ended' for historical tracking.`);
      return;
    }
    try {
      setSubmitting(true);
      const res = await API.post('/assignments', {
        tenantId: createForm.tenantId,
        unitId: createForm.unitId,
        startDate: createForm.startDate || null,
        endDate: createForm.endDate || null,
        status: createForm.status,
        rentType: createForm.rentType,
        rentAmount: Number(createForm.rentAmount),
        depositHeld: Number(createForm.depositHeld) || 0,
        terms: createForm.terms,
        notes: createForm.notes,
      });
      if (res.data.success) {
        if (createForm.status === 'Active' && isContractEndDatePast(createForm.endDate)) setStatusFilter('Past');
        setShowCreateModal(false);
        setCreateForm({
          tenantId: '',
          propertyId: '',
          unitId: '',
          startDate: '',
          endDate: '',
          status: 'Active',
          rentType: 'Monthly Fixed',
          rentAmount: '',
          depositHeld: 0,
          terms: '',
          notes: '',
        });
        fetchData();
      }
    } catch (err) {
      alert(err.response?.data?.message || err.response?.data?.errors?.[0]?.msg || 'Failed to create contract.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditContract = async (e) => {
    e.preventDefault();
    if (!selectedContract) return;
    if (editForm.status === 'Active' && activeConflictInEdit) {
      alert(`Cannot activate contract: This sub-property already has an active contract (${activeConflictInEdit.assignmentCode}) with ${activeConflictInEdit.tenantId?.name}. Only 1 active contract is allowed per sub-property.`);
      return;
    }
    try {
      setSubmitting(true);
      const res = await API.put(`/assignments/${selectedContract._id}`, {
        tenantId: editForm.tenantId,
        unitId: editForm.unitId,
        propertyId: editForm.propertyId,
        startDate: editForm.startDate || null,
        endDate: editForm.endDate || null,
        status: editForm.status,
        rentType: editForm.rentType,
        rentAmount: Number(editForm.rentAmount),
        depositHeld: Number(editForm.depositHeld) || 0,
        terms: editForm.terms,
        notes: editForm.notes,
      });
      if (res.data.success) {
        setShowEditModal(false);
        setSelectedContract(null);
        fetchData();
      }
    } catch (err) {
      alert(err.response?.data?.message || err.response?.data?.errors?.[0]?.msg || 'Failed to update contract.');
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
        rentType: reviseForm.rentType,
        rentAmount: Number(reviseForm.rentAmount),
        effectiveFrom: reviseForm.effectiveFrom,
        reason: reviseForm.reason,
      });
      if (res.data.success) {
        setShowReviseModal(false);
        setSelectedContract(null);
        setReviseForm({
          rentType: 'Monthly Fixed',
          rentAmount: '',
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

  // Comprehensive Filter & Search Logic (including APEX Expression filters)
  const filteredContracts = useMemo(() => {
    return contracts.filter((c) => {
      const tName = c.tenantId?.name || '';
      const pName = c.unitId?.propertyId?.name || '';
      const uName = c.unitId?.subUnitPartition || c.unitId?.unitName || '';
      const code = c.assignmentCode || '';
      const rentType = getContractRentType(c);
      const rentAmount = String(getContractRentAmount(c));
      const sDate = c.startDate ? formatDate(c.startDate) : '';
      const eDate = c.endDate ? formatDate(c.endDate) : 'Ongoing';

      // 1. Text Search Box
      const matchesSearch =
        !search ||
        tName.toLowerCase().includes(search.toLowerCase()) ||
        pName.toLowerCase().includes(search.toLowerCase()) ||
        uName.toLowerCase().includes(search.toLowerCase()) ||
        code.toLowerCase().includes(search.toLowerCase()) ||
        rentAmount.includes(search);

      // 2. Property Dropdown Filter
      const matchesProp =
        !propertyFilter ||
        String(c.unitId?.propertyId?._id || c.unitId?.propertyId) === propertyFilter;

      // 3. Status Tab Filter (Active / Past / All)
      const matchesStatus =
        !statusFilter ||
        (statusFilter === 'Active' && c.status === 'Active') ||
        (statusFilter === 'Past' && c.status !== 'Active');

      if (!matchesSearch || !matchesProp || !matchesStatus) return false;

      // 4. Custom APEX Filters
      for (const f of activeFilters) {
        let fieldVal = '';
        if (f.columnId === 'property') fieldVal = pName;
        else if (f.columnId === 'subUnit') fieldVal = uName;
        else if (f.columnId === 'tenant') fieldVal = tName;
        else if (f.columnId === 'monthlyRent') fieldVal = String(c.currentAgreement?.monthlyRate || (c.currentAgreement?.rentType === 'Annual Fixed' ? Math.round((c.currentAgreement?.annualRate || 0) / 12) : getContractRentAmount(c)));
        else if (f.columnId === 'annualRent') fieldVal = String(c.currentAgreement?.annualRate || (c.currentAgreement?.monthlyRate ? c.currentAgreement.monthlyRate * 12 : 0));
        else if (f.columnId === 'depositHeld') fieldVal = String(c.depositHeld || 0);
        else if (f.columnId === 'startDate') fieldVal = sDate;
        else if (f.columnId === 'endDate') fieldVal = eDate;
        else if (f.columnId === 'status') fieldVal = c.status || '';
        else if (f.columnId === 'notes') fieldVal = c.notes || '';
        else if (f.columnId === 'assignmentCode') fieldVal = code;
        else if (f.columnId === 'rentType') fieldVal = rentType;
        else if (f.columnId === 'currentRate') fieldVal = rentAmount;
        else if (f.columnId === 'totalReceived') fieldVal = String(c.totalReceived || 0);
        else if (f.columnId === 'outstanding') fieldVal = String(c.outstandingBalance || 0);
        else if (f.columnId === 'createdAt') fieldVal = c.createdAt ? formatDate(c.createdAt) : '';
        else if (f.columnId === 'updatedAt') fieldVal = c.updatedAt ? formatDate(c.updatedAt) : '';

        if (!evaluateFilterRule(fieldVal, f.operator, f.value)) return false;
      }

      return true;
    });
  }, [contracts, search, propertyFilter, statusFilter, activeFilters]);

  // Sorted Contracts based on 3-state sortConfig
  const sortedContracts = useMemo(() => {
    return sortDataRows(filteredContracts, sortConfig, {
      property: c => (c.unitId?.propertyId?.displayOrder && c.unitId.propertyId.displayOrder > 0) ? c.unitId.propertyId.displayOrder : (c.unitId?.propertyId?.name || ''),
      subUnit: c => c.unitId?.subUnitPartition || c.unitId?.unitName || '',
      tenant: c => c.tenantId?.name || '',
      monthlyRent: c => c.currentAgreement?.monthlyRate || (c.currentAgreement?.rentType === 'Annual Fixed' ? Math.round((c.currentAgreement?.annualRate || 0) / 12) : getContractRentAmount(c)),
      annualRent: c => c.currentAgreement?.annualRate || (c.currentAgreement?.monthlyRate ? c.currentAgreement.monthlyRate * 12 : 0),
      depositHeld: c => c.depositHeld || 0,
      startDate: c => c.startDate,
      endDate: c => c.endDate,
      status: c => c.status || '',
      notes: c => c.notes || '',
      assignmentCode: c => c.assignmentCode,
      rentType: c => getContractRentType(c),
      currentRate: c => getContractRentAmount(c),
      totalReceived: c => c.totalReceived || 0,
      outstanding: c => c.outstandingBalance || 0,
      createdAt: c => c.createdAt,
      updatedAt: c => c.updatedAt
    });
  }, [filteredContracts, sortConfig]);

  // Pagination Slice
  const totalItems = sortedContracts.length;
  const isAllRows = rowsPerPage === 'All';
  const effectivePageSize = isAllRows ? totalItems || 1 : Number(rowsPerPage);
  const totalPages = Math.ceil(totalItems / effectivePageSize) || 1;

  // Keep currentPage within bounds when items change
  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(1);
  }, [totalPages, currentPage]);

  const paginatedContracts = useMemo(() => {
    if (isAllRows) return sortedContracts;
    const startIndex = (currentPage - 1) * effectivePageSize;
    return sortedContracts.slice(startIndex, startIndex + effectivePageSize);
  }, [sortedContracts, isAllRows, currentPage, effectivePageSize]);

  // Export ONLY the currently filtered data
  const exportToExcel = () => {
    try {
      const dataToExport = filteredContracts.map((c) => ({
        'Property': c.unitId?.propertyId?.name || '',
        'Sub Property / Partition': c.unitId?.subUnitPartition || c.unitId?.unitName || '',
        'Tenant': c.tenantId?.name || '',
        'Rent Per month': c.currentAgreement?.monthlyRate || (c.currentAgreement?.rentType === 'Annual Fixed' ? Math.round((c.currentAgreement?.annualRate || 0) / 12) : getContractRentAmount(c)),
        'Rent per Annum': c.currentAgreement?.annualRate || (c.currentAgreement?.monthlyRate ? c.currentAgreement.monthlyRate * 12 : 0),
        'Deposit': c.depositHeld || 0,
        'Start Date': c.startDate ? formatDate(c.startDate) : '',
        'End Date': c.endDate ? formatDate(c.endDate) : 'Ongoing',
        'Contract Status': c.status || 'Active',
        'Comments': c.notes || '',
        'Contract Code': c.assignmentCode || '',
        'Rent Frequency': getContractRentType(c),
        'Total Received (₹)': c.totalReceived || 0,
        'Outstanding Balance (₹)': c.outstandingBalance || 0
      }));

      const worksheet = XLSX.utils.json_to_sheet(dataToExport);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Contracts');
      XLSX.writeFile(workbook, `Contracts_Filtered_${new Date().toISOString().split('T')[0]}.xlsx`);
    } catch (err) {
      console.error('Failed to export contracts to Excel:', err);
    }
  };

  const totalActive = contracts.filter(c => c.status === 'Active').length;

  return (
    <div className="space-y-4">
      {/* Header View: Clean Title without Dashboard KPIs as requested */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 sm:p-5 rounded-2xl shadow-xs border border-slate-200">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center font-bold shrink-0">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-extrabold text-slate-900 leading-tight">Contracts & Leases</h2>
            <p className="text-xs text-slate-500">
              Clean lease agreement manager with monthly rent, start & end dates, rate revisions, and vacancy logs
            </p>
          </div>
        </div>

        {/* Quick Property & Status Filters */}
        <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 w-full sm:w-auto">
          <SearchableSelect
            className="w-full sm:w-52"
            value={propertyFilter}
            onChange={setPropertyFilter}
            placeholder="All Properties"
            searchPlaceholder="Filter property..."
            options={properties.map((p) => ({ value: p._id, label: p.name }))}
          />

          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl shrink-0 w-full sm:w-auto justify-between sm:justify-start">
            <button
              onClick={() => { setStatusFilter('Active'); setCurrentPage(1); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                statusFilter === 'Active' ? 'bg-white text-teal-700 shadow-xs' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              Active ({totalActive})
            </button>
            <button
              onClick={() => { setStatusFilter('Past'); setCurrentPage(1); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                statusFilter === 'Past' ? 'bg-white text-teal-700 shadow-xs' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              Past / Vacated
            </button>
            <button
              onClick={() => { setStatusFilter(''); setCurrentPage(1); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                !statusFilter ? 'bg-white text-teal-700 shadow-xs' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              All
            </button>
          </div>
        </div>
      </div>

      {/* Oracle APEX-Style Interactive Toolbar (Columns, Filter, Freeze Header, Save View, Download, Rows Per Page) */}
      <ApexToolbar
        search={search}
        onSearchChange={(val) => { setSearch(val); setCurrentPage(1); }}
        rowsPerPage={rowsPerPage}
        onRowsPerPageChange={(val) => { setRowsPerPage(val); setCurrentPage(1); }}
        availableRowsOptions={[5, 10, 25, 50, 100, 'All']}
        columns={CONTRACTS_COLUMNS_DEF}
        visibleColumns={visibleColumns}
        onChangeVisibleColumns={(cols) => {
          setVisibleColumns(cols);
          try { localStorage.setItem('cols_contracts_v2', JSON.stringify(cols)); } catch(e){}
        }}
        onResetWidths={resetColumnWidths}
        isHeaderSticky={isHeaderSticky}
        onToggleHeaderSticky={setIsHeaderSticky}
        filters={activeFilters}
        onFiltersChange={(flts) => { setActiveFilters(flts); setCurrentPage(1); }}
        filterSuggestions={filterSuggestions}
        onExport={exportToExcel}
        storageKey="contracts_v2"
        activeViewName={activeViewId}
        onViewChange={setActiveViewId}
        primaryAction={
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold transition-all shadow-sm active:scale-95 shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create Contract</span>
          </button>
        }
      />

      {/* Contracts Table with Sticky Header & APEX Drag-Resize Columns */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden flex flex-col">
        {/* Mobile Swipe Cue */}
        <div className="sm:hidden px-3 py-1.5 bg-teal-50 border-b border-teal-100 text-[11px] text-teal-800 font-medium flex items-center justify-between">
          <span>Swipe horizontally to view all columns</span>
          <span>→</span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-7 h-7 border-4 border-teal-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filteredContracts.length === 0 ? (
          <div className="py-16 text-center text-slate-400 text-sm">
            No contracts found matching your filters.
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[70vh] overflow-y-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
            <table
              className="w-full text-left text-xs border-collapse table-fixed"
              style={{ minWidth: `${visibleColumns.reduce((sum, colId) => sum + getContractColumnWidth(colId, columnWidths), 0)}px` }}
            >
              <colgroup>
                {visibleColumns.map((colId) => (
                  <col
                    key={colId}
                    style={{ width: `${getContractColumnWidth(colId, columnWidths)}px` }}
                  />
                ))}
              </colgroup>
              <thead className={isHeaderSticky ? 'sticky top-0 z-20 shadow-xs' : ''}>
                <tr className="bg-slate-100/95 backdrop-blur-xs text-slate-700 font-bold border-b border-slate-200 select-none">
                  {visibleColumns.map((colId) => {
                    const def = CONTRACTS_COLUMNS_DEF.find((c) => c.id === colId);
                    if (!def) return null;
                    const width = getContractColumnWidth(colId, columnWidths);
                    let alignClass = 'text-left';
                    if (['history', 'createdAt', 'updatedAt', 'status'].includes(colId)) alignClass = 'text-center';
                    if (['monthlyRent', 'annualRent', 'currentRate', 'depositHeld', 'totalReceived', 'outstanding'].includes(colId)) alignClass = 'text-right';
                    if (colId === 'actions') alignClass = 'text-center';

                    return (
                      <th
                        key={colId}
                        {...getHeaderDragProps(colId, visibleColumns, (cols) => {
                          setVisibleColumns(cols);
                          try { localStorage.setItem('cols_contracts_v2', JSON.stringify(cols)); } catch(e){}
                        }, 'contracts_v2')}
                        style={{ width: `${Math.max(width, 105)}px`, minWidth: `${Math.max(width, 105)}px` }}
                        className={`py-3 pl-3 pr-7 border-r border-slate-200 relative group bg-slate-100/95 whitespace-nowrap overflow-hidden select-none ${alignClass}`}
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
              <tbody className="divide-y divide-slate-100">
                {paginatedContracts.map((c) => {
                  const isVacated = c.status !== 'Active';
                  const rateCount = c.rateHistory?.length || 1;
                  return (
                    <tr
                      key={c._id}
                      className={`hover:bg-slate-50/70 transition-colors ${isVacated ? 'bg-slate-50/40 opacity-70' : ''}`}
                    >
                      {visibleColumns.map((colId) => {
                        if (colId === 'assignmentCode') {
                          return (
                            <td key={colId} className="py-3 px-3.5 border-r border-slate-200 whitespace-nowrap">
                              <span className="font-mono font-bold text-slate-800 text-xs block">
                                {c.assignmentCode}
                              </span>
                              <span className={`inline-block mt-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                !isVacated ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
                              }`}>
                                {c.status}
                              </span>
                            </td>
                          );
                        }

                        if (colId === 'property') {
                          return (
                            <td key={colId} className="py-3 px-3.5 border-r border-slate-200">
                              <span className="font-semibold text-slate-800 text-xs block truncate" title={c.unitId?.propertyId?.name}>
                                {c.unitId?.propertyId?.name || '—'}
                              </span>
                            </td>
                          );
                        }

                        if (colId === 'subUnit') {
                          return (
                            <td key={colId} className="py-3 px-3.5 border-r border-slate-200">
                              <span className="font-semibold text-teal-700 text-xs block truncate" title={c.unitId?.subUnitPartition || c.unitId?.unitName}>
                                {c.unitId?.subUnitPartition || c.unitId?.unitName || '—'}
                              </span>
                            </td>
                          );
                        }

                        if (colId === 'tenant') {
                          return (
                            <td key={colId} className="py-3 px-3.5 border-r border-slate-200">
                              <span className="font-bold text-slate-900 text-xs block truncate">
                                {c.tenantId?.name || '—'}
                              </span>
                              {c.tenantId?.phone && (
                                <span className="text-slate-500 text-[11px] block">{c.tenantId.phone}</span>
                              )}
                            </td>
                          );
                        }

                        if (colId === 'monthlyRent') {
                          const monthly = c.currentAgreement?.monthlyRate || (c.currentAgreement?.rentType === 'Annual Fixed' ? Math.round((c.currentAgreement?.annualRate || 0) / 12) : getContractRentAmount(c));
                          return (
                            <td key={colId} className="py-3 px-3.5 border-r border-slate-200 text-right whitespace-nowrap font-bold text-slate-900 font-mono">
                              {monthly ? formatCurrency(monthly) : '—'}
                            </td>
                          );
                        }

                        if (colId === 'annualRent') {
                          const annual = c.currentAgreement?.annualRate || (c.currentAgreement?.monthlyRate ? c.currentAgreement.monthlyRate * 12 : 0);
                          return (
                            <td key={colId} className="py-3 px-3.5 border-r border-slate-200 text-right whitespace-nowrap font-semibold text-slate-700 font-mono">
                              {annual ? formatCurrency(annual) : '—'}
                            </td>
                          );
                        }

                        if (colId === 'depositHeld') {
                          return (
                            <td key={colId} className="py-3 px-3.5 border-r border-slate-200 text-right whitespace-nowrap font-mono font-medium text-slate-700">
                              {c.depositHeld ? formatCurrency(c.depositHeld) : '—'}
                            </td>
                          );
                        }

                        if (colId === 'startDate') {
                          return (
                            <td key={colId} className="py-3 px-3.5 border-r border-slate-200 whitespace-nowrap">
                              <div className="flex items-center gap-1.5 text-slate-700 font-medium">
                                <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                <span>{formatDate(c.startDate)}</span>
                              </div>
                            </td>
                          );
                        }

                        if (colId === 'endDate') {
                          return (
                            <td key={colId} className="py-3 px-3.5 border-r border-slate-200 whitespace-nowrap">
                              {c.endDate ? (
                                <span className="text-slate-700 font-medium">{formatDate(c.endDate)}</span>
                              ) : (
                                <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                                  Ongoing
                                </span>
                              )}
                            </td>
                          );
                        }

                        if (colId === 'status') {
                          const isActive = c.status === 'Active';
                          return (
                            <td key={colId} className="py-3 px-3.5 border-r border-slate-200 text-center whitespace-nowrap">
                              <span className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                                isActive ? 'bg-emerald-100 text-emerald-800 border border-emerald-300/60' : 'bg-slate-100 text-slate-600 border border-slate-200'
                              }`}>
                                {c.status}
                              </span>
                            </td>
                          );
                        }

                        if (colId === 'notes') {
                          return (
                            <td key={colId} className="py-3 px-3.5 border-r border-slate-200 text-slate-600 text-xs max-w-xs truncate" title={c.notes}>
                              {c.notes || '—'}
                            </td>
                          );
                        }

                        if (colId === 'rentType') {
                          return (
                            <td key={colId} className="py-3 px-3.5 border-r border-slate-200 whitespace-nowrap">
                              <span className="inline-block px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-semibold text-[11px]">
                                {getContractRentType(c)}
                              </span>
                            </td>
                          );
                        }

                        if (colId === 'currentRate') {
                          return (
                            <td key={colId} className="py-3 px-3.5 border-r border-slate-200 text-right whitespace-nowrap font-bold text-slate-900">
                              {formatCurrency(getContractRentAmount(c))}
                              <span className="text-[10px] text-slate-400 font-normal block">
                                / {getContractRentType(c) === 'Annual Fixed' ? 'year' : 'month'}
                              </span>
                            </td>
                          );
                        }

                        if (colId === 'totalReceived') {
                          return (
                            <td key={colId} className="py-3 px-3.5 border-r border-slate-200 text-right whitespace-nowrap font-mono font-semibold text-emerald-700">
                              {formatCurrency(c.totalReceived || 0)}
                            </td>
                          );
                        }

                        if (colId === 'outstanding') {
                          return (
                            <td key={colId} className="py-3 px-3.5 border-r border-slate-200 text-right whitespace-nowrap font-mono font-bold">
                              <span className={c.outstandingBalance > 0 ? 'text-rose-600' : 'text-emerald-600'}>
                                {formatCurrency(c.outstandingBalance || 0)}
                              </span>
                            </td>
                          );
                        }

                        if (colId === 'history') {
                          return (
                            <td key={colId} className="py-3 px-3.5 border-r border-slate-200 text-center whitespace-nowrap">
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
                          );
                        }

                        if (colId === 'createdAt' || colId === 'updatedAt') {
                          return (
                            <td key={colId} className="py-3 px-3.5 border-r border-slate-200 text-center whitespace-nowrap text-slate-500 font-medium text-xs">
                              {formatDate(c[colId])}
                            </td>
                          );
                        }

                        if (colId === 'actions') {
                          return (
                            <td key={colId} className="py-3 px-3.5 text-center whitespace-nowrap">
                              <div className="flex items-center justify-center gap-1.5">
                                <button
                                  onClick={() => {
                                    setSelectedContract(c);
                                    const agreement = c.currentAgreement || {};
                                    const rentType = agreement.rentType || 'Monthly Fixed';
                                    setEditForm({
                                      tenantId: c.tenantId?._id || '',
                                      propertyId: c.unitId?.propertyId?._id || c.unitId?.propertyId || '',
                                      unitId: c.unitId?._id || '',
                                      startDate: c.startDate ? new Date(c.startDate).toISOString().slice(0, 10) : '',
                                      endDate: c.endDate ? new Date(c.endDate).toISOString().slice(0, 10) : '',
                                      status: c.status || 'Active',
                                      rentType,
                                      rentAmount: String(
                                        rentType === 'Annual Fixed'
                                          ? (agreement.annualRate || (agreement.monthlyRate || 0) * 12)
                                          : agreement.monthlyRate ?? c.currentMonthlyRate ?? ''
                                      ),
                                      depositHeld: c.depositHeld || 0,
                                      terms: agreement.terms || '',
                                      notes: c.notes || '',
                                    });
                                    setShowEditModal(true);
                                  }}
                                  className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] transition-colors inline-flex items-center gap-1"
                                  title="Edit Contract details"
                                >
                                  <Edit2 className="w-3 h-3" />
                                  Edit
                                </button>
                                {!isVacated && (
                                  <>
                                    <button
                                      onClick={() => {
                                        setSelectedContract(c);
                                        const agreement = c.currentAgreement || {};
                                        const rentType = agreement.rentType || 'Monthly Fixed';
                                        setReviseForm({
                                          rentType,
                                          rentAmount: String(getContractRentAmount(c)),
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
                          );
                        }

                        return null;
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Bottom Pagination Bar (APEX Style: 1 - 10 of 25) */}
        {!loading && filteredContracts.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 p-3 border-t border-slate-200 bg-slate-50/80 text-xs font-medium text-slate-600 select-none">
            <div>
              {isAllRows ? (
                <span>Showing all <strong className="text-slate-900">{totalItems}</strong> records</span>
              ) : (
                <span>
                  Showing <strong className="text-slate-900">{Math.min((currentPage - 1) * effectivePageSize + 1, totalItems)}</strong> to{' '}
                  <strong className="text-slate-900">{Math.min(currentPage * effectivePageSize, totalItems)}</strong> of{' '}
                  <strong className="text-slate-900">{totalItems}</strong> records
                </span>
              )}
            </div>

            {!isAllRows && totalPages > 1 && (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed text-slate-700 transition-colors"
                  title="Previous page"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="px-2 py-1 font-bold text-slate-800">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  type="button"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed text-slate-700 transition-colors"
                  title="Next page"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* MODAL 1: Create New Contract */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-2xl max-h-[90vh] rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150 flex flex-col">
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

            <form onSubmit={handleCreateContract} className="p-5 sm:p-6 space-y-4 overflow-y-auto">
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Sub-Property / Partition *</label>
                  <select
                    required
                    value={createForm.unitId}
                    onChange={(e) => setCreateForm({ ...createForm, unitId: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-teal-400"
                  >
                    <option value="">-- Choose Sub-Property --</option>
                    {availableUnitsForProperty.map(u => (
                      <option key={u._id} value={u._id}>
                        {u.subUnitPartition || u.unitName} {u.unitCode ? `(${u.unitCode})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Contract Status *</label>
                  <select
                    value={createForm.status}
                    onChange={(e) => setCreateForm({ ...createForm, status: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-white font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-400"
                  >
                    <option value="Active">Active</option>
                    <option value="Ended">Ended / Past</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Start Date <span className="text-slate-400 font-normal">(Optional)</span>
                  </label>
                  <input
                    type="date"
                    value={createForm.startDate}
                    onChange={(e) => setCreateForm({ ...createForm, startDate: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-400"
                  />
                  <p className="text-[10px] text-slate-400 mt-0.5">Commencement date</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    End Date <span className="text-slate-400 font-normal">(Optional)</span>
                  </label>
                  <input
                    type="date"
                    value={createForm.endDate}
                    onChange={(e) => setCreateForm({ ...createForm, endDate: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-400"
                  />
                  <p className="text-[10px] text-slate-400 mt-0.5">Leave blank if ongoing</p>
                </div>
              </div>

              {activeConflictInCreate && createForm.status === 'Active' && (
                <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl text-amber-900 text-xs flex items-start gap-2 animate-in fade-in">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Active Contract Conflict:</span> This sub-property already has an active contract ({activeConflictInCreate.assignmentCode}) with <strong>{activeConflictInCreate.tenantId?.name}</strong>. Only 1 active contract is permitted per sub-property. Set status to "Ended" if recording a past contract, or vacate the current tenant first.
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Rent Frequency *</label>
                  <select
                    value={createForm.rentType}
                    onChange={(e) => changeRentType(createForm, setCreateForm, e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-teal-400"
                  >
                    <option value="Monthly Fixed">Monthly Fixed</option>
                    <option value="Annual Fixed">Annual Fixed</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    {createForm.rentType === 'Annual Fixed' ? 'Annual Rent Rate (₹) *' : 'Monthly Rent Rate (₹) *'}
                  </label>
                  <input
                    type="number"
                    required
                    min="0"
                    placeholder={createForm.rentType === 'Annual Fixed' ? 'e.g. 108000' : 'e.g. 9000'}
                    value={createForm.rentAmount}
                    onChange={(e) => setCreateForm({ ...createForm, rentAmount: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 font-bold text-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-400"
                  />
                  <div className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
                    <span>{createForm.rentType === 'Annual Fixed' ? 'Monthly Equivalent:' : 'Annual Equivalent:'}</span>
                    <span className="font-bold text-slate-800">
                      {createForm.rentAmount
                        ? (createForm.rentType === 'Annual Fixed'
                            ? formatCurrency(Math.round(Number(createForm.rentAmount) / 12)) + ' / month'
                            : formatCurrency(Number(createForm.rentAmount) * 12) + ' / year')
                        : '—'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Comments / Notes</label>
                <textarea
                  rows="2"
                  placeholder="e.g. Rent increased from 20000 to 22000 in Jan 25, deposit details, etc."
                  value={createForm.notes}
                  onChange={(e) => setCreateForm({ ...createForm, notes: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-400"
                />
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
                  disabled={submitting || Boolean(activeConflictInCreate && createForm.status === 'Active')}
                  className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold shadow-md shadow-teal-600/20 disabled:opacity-50 cursor-pointer"
                >
                  {submitting ? 'Creating...' : 'Create Contract'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Edit Contract Modal (Clean Layout) */}
      {showEditModal && selectedContract && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-2xl max-h-[90vh] rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150 flex flex-col">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-slate-900 text-white">
                  <Edit2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base">Edit Contract</h3>
                  <p className="text-xs text-slate-500 font-mono">{selectedContract.assignmentCode}</p>
                </div>
              </div>
              <button
                onClick={() => { setShowEditModal(false); setSelectedContract(null); }}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleEditContract} className="p-5 sm:p-6 space-y-4 overflow-y-auto">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Tenant *</label>
                <select
                  required
                  value={editForm.tenantId}
                  onChange={(e) => setEditForm({ ...editForm, tenantId: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-teal-400"
                >
                  <option value="">-- Choose Tenant --</option>
                  {tenants.map(t => (
                    <option key={t._id} value={t._id}>{t.name} {t.phone ? `(${t.phone})` : ''}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Property *</label>
                  <select
                    required
                    value={editForm.propertyId}
                    onChange={(e) => setEditForm({ ...editForm, propertyId: e.target.value, unitId: '' })}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-teal-400"
                  >
                    <option value="">-- Choose Property --</option>
                    {properties.map(p => (
                      <option key={p._id} value={p._id}>{p.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Sub-Property / Partition *</label>
                  <select
                    required
                    value={editForm.unitId}
                    onChange={(e) => setEditForm({ ...editForm, unitId: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-teal-400"
                  >
                    <option value="">-- Choose Sub-Property --</option>
                    {availableUnitsForEdit.map(u => (
                      <option key={u._id} value={u._id}>
                        {u.subUnitPartition || u.unitName} {u.unitCode ? `(${u.unitCode})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Contract Status *</label>
                  <select
                    value={editForm.status}
                    onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-white font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-400"
                  >
                    <option value="Active">Active</option>
                    <option value="Ended">Ended / Past</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Start Date <span className="text-slate-400 font-normal">(Optional)</span>
                  </label>
                  <input
                    type="date"
                    value={editForm.startDate}
                    onChange={(e) => setEditForm({ ...editForm, startDate: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-400"
                  />
                  <p className="text-[10px] text-slate-400 mt-0.5">Commencement date</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    End Date <span className="text-slate-400 font-normal">(Optional)</span>
                  </label>
                  <input
                    type="date"
                    value={editForm.endDate}
                    onChange={(e) => setEditForm({ ...editForm, endDate: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-400"
                  />
                  <p className="text-[10px] text-slate-400 mt-0.5">Leave blank if ongoing</p>
                </div>
              </div>

              {activeConflictInEdit && editForm.status === 'Active' && (
                <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl text-amber-900 text-xs flex items-start gap-2 animate-in fade-in">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Active Contract Conflict:</span> This sub-property already has an active contract ({activeConflictInEdit.assignmentCode}) with <strong>{activeConflictInEdit.tenantId?.name}</strong>. Only 1 active contract is permitted per sub-property. Set status to "Ended" if recording a past contract, or vacate the current tenant first.
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Rent Frequency *</label>
                  <select
                    value={editForm.rentType}
                    onChange={(e) => changeRentType(editForm, setEditForm, e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-teal-400"
                  >
                    <option value="Monthly Fixed">Monthly Fixed</option>
                    <option value="Annual Fixed">Annual Fixed</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    {editForm.rentType === 'Annual Fixed' ? 'Annual Rent Rate (₹) *' : 'Monthly Rent Rate (₹) *'}
                  </label>
                  <input
                    type="number"
                    required
                    min="0"
                    value={editForm.rentAmount}
                    onChange={(e) => setEditForm({ ...editForm, rentAmount: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 font-bold text-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-400"
                  />
                  <div className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
                    <span>{editForm.rentType === 'Annual Fixed' ? 'Monthly Equivalent:' : 'Annual Equivalent:'}</span>
                    <span className="font-bold text-slate-800">
                      {editForm.rentAmount
                        ? (editForm.rentType === 'Annual Fixed'
                            ? formatCurrency(Math.round(Number(editForm.rentAmount) / 12)) + ' / month'
                            : formatCurrency(Number(editForm.rentAmount) * 12) + ' / year')
                        : '—'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Security Deposit Held (₹)</label>
                  <input
                    type="number"
                    min="0"
                    value={editForm.depositHeld}
                    onChange={(e) => setEditForm({ ...editForm, depositHeld: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-400"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Agreement Terms</label>
                  <input
                    type="text"
                    value={editForm.terms}
                    onChange={(e) => setEditForm({ ...editForm, terms: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-400"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Comments / Notes</label>
                <textarea
                  rows="2"
                  value={editForm.notes}
                  onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-400"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => { setShowEditModal(false); setSelectedContract(null); }}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || Boolean(activeConflictInEdit && editForm.status === 'Active')}
                  className="px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold shadow-md disabled:opacity-50 cursor-pointer"
                >
                  {submitting ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: Revise Rate */}
      {showReviseModal && selectedContract && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-teal-100 text-teal-700">
                  <TrendingUp className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base">Revise Rent Rate</h3>
                  <p className="text-xs text-slate-500 font-mono">{selectedContract.assignmentCode}</p>
                </div>
              </div>
              <button
                onClick={() => { setShowReviseModal(false); setSelectedContract(null); }}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleReviseRate} className="p-5 space-y-4">
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
                <p className="text-xs text-slate-500 font-medium">Tenant & Property</p>
                <p className="text-sm font-bold text-slate-800 mt-0.5">
                  {selectedContract.tenantId?.name} · {selectedContract.unitId?.propertyId?.name}
                </p>
                <p className="text-xs text-slate-600 mt-1">
                  Current: <strong className="text-slate-900">{formatCurrency(getContractRentAmount(selectedContract))}</strong> / {getContractRentType(selectedContract) === 'Annual Fixed' ? 'year' : 'month'}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">New Rent Type</label>
                  <select
                    value={reviseForm.rentType}
                    onChange={(e) => changeRentType(reviseForm, setReviseForm, e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-teal-400"
                  >
                    <option value="Monthly Fixed">Monthly Fixed</option>
                    <option value="Annual Fixed">Annual Fixed</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">New Rent Rate (₹) *</label>
                  <input
                    type="number"
                    required
                    min="0"
                    placeholder="e.g. 10000"
                    value={reviseForm.rentAmount}
                    onChange={(e) => setReviseForm({ ...reviseForm, rentAmount: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 font-bold text-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-400"
                  />
                </div>
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
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Reason for Revision *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Annual escalation, renewed lease"
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
                  {submitting ? 'Updating...' : 'Apply Revision'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: Vacate / End Tenancy */}
      {showVacateModal && selectedContract && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-rose-50">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-rose-100 text-rose-700">
                  <LogOut className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base">Vacate / End Tenancy</h3>
                  <p className="text-xs text-rose-600 font-mono">{selectedContract.assignmentCode}</p>
                </div>
              </div>
              <button
                onClick={() => { setShowVacateModal(false); setSelectedContract(null); }}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleVacateContract} className="p-5 space-y-4">
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
                <p className="text-xs text-slate-500 font-medium">Tenant & Property</p>
                <p className="text-sm font-bold text-slate-800 mt-0.5">
                  {selectedContract.tenantId?.name} · {selectedContract.unitId?.propertyId?.name}
                </p>
                <p className="text-xs text-slate-600 mt-1">
                  Security deposit held: <strong className="text-slate-900">{formatCurrency(selectedContract.depositHeld || 0)}</strong>
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Vacate / Exit Date *</label>
                <input
                  type="date"
                  required
                  value={vacateForm.endDate}
                  onChange={(e) => setVacateForm({ ...vacateForm, endDate: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-rose-400"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Security Deposit Refunded (₹)</label>
                <input
                  type="number"
                  min="0"
                  value={vacateForm.depositRefunded}
                  onChange={(e) => setVacateForm({ ...vacateForm, depositRefunded: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-rose-400"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Exit Remarks / Notes</label>
                <textarea
                  rows="2"
                  placeholder="e.g. Handed over keys, final electricity settled"
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

      {/* MODAL 5: Rate Revision History Timeline */}
      {showHistoryModal && selectedContract && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-xl max-h-[85vh] rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150 flex flex-col">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-slate-100 text-slate-700">
                  <History className="w-5 h-5 text-teal-600" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base">Rate Revision History</h3>
                  <p className="text-xs text-slate-500 font-mono">{selectedContract.assignmentCode}</p>
                </div>
              </div>
              <button
                onClick={() => { setShowHistoryModal(false); setSelectedContract(null); }}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 sm:p-6 overflow-y-auto space-y-4">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs">
                <p className="font-bold text-slate-800 text-sm">{selectedContract.tenantId?.name}</p>
                <p className="text-slate-600 mt-0.5">
                  {selectedContract.unitId?.propertyId?.name} · {selectedContract.unitId?.unitName}
                </p>
                <p className="text-slate-500 mt-1">
                  Start Date: <strong>{formatDate(selectedContract.startDate)}</strong>
                  {selectedContract.endDate && ` · Exit Date: ${formatDate(selectedContract.endDate)}`}
                </p>
              </div>

              <div>
                <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-2.5">
                  Historical Rates Timeline
                </h4>
                {selectedContract.rateHistory?.length === 0 ? (
                  <p className="text-xs text-slate-400 italic py-4 text-center">No revision history found.</p>
                ) : (
                  <div className="space-y-2.5">
                    {selectedContract.rateHistory.map((ag, idx) => (
                      <div
                        key={ag._id || idx}
                        className={`p-3.5 rounded-xl border text-xs flex items-center justify-between ${
                          ag.isCurrentRate
                            ? 'bg-teal-50/70 border-teal-200 ring-1 ring-teal-300'
                            : 'bg-white border-slate-200 text-slate-600'
                        }`}
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900 text-sm">
                              {formatCurrency(
                                ag.rentType === 'Annual Fixed'
                                  ? ag.annualRate || ag.monthlyRate * 12
                                  : ag.monthlyRate
                              )}
                            </span>
                            <span className="text-[10px] text-slate-500">
                              / {ag.rentType === 'Annual Fixed' ? 'year' : 'month'}
                            </span>
                            {ag.isCurrentRate && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-teal-600 text-white">
                                Current
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
                              {formatCurrency(
                                ag.rentType === 'Annual Fixed'
                                  ? ag.previousRate * 12
                                  : ag.previousRate
                              )}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              / {ag.rentType === 'Annual Fixed' ? 'year' : 'month'}
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
