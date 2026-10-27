import React, { useState, useEffect, useMemo } from 'react';
import API from '../services/api';
import * as XLSX from 'xlsx';
import { formatCurrency, formatDate, formatMonthYear } from '../utils/formatters';
import SearchableSelect from '../components/SearchableSelect';
import ApexToolbar from '../components/ApexToolbar';
import { useModalBackHandler } from '../utils/useModalBackHandler';
import { getHeaderDragProps, useResizableColumns, ResizeHandle, useFrozenColumns, getFrozenColumnStyle } from '../components/ColumnManager';
import { cycleThreeStateSort, evaluateFilterRule, sortDataRows, extractUniqueValues } from '../utils/tableUtils';
import {
  FileText, Plus, Search, Calendar, TrendingUp, Edit2, LogOut, History,
  X, Download, RotateCcw, ChevronLeft, ChevronRight, ArrowUpDown, AlertCircle, Receipt, Check, Eye
} from 'lucide-react';

const CONTRACTS_COLUMNS_DEF = [
  { id: 'property', label: 'Property' },
  { id: 'subUnit', label: 'Sub-Property / Partition' },
  { id: 'tenant', label: 'Tenant' },
  { id: 'contractNo', label: 'Contract No', defaultVisible: true },
  { id: 'contractType', label: 'Contract Type' },
  { id: 'monthlyRent', label: 'Rent Per Month' },
  { id: 'annualRent', label: 'Rent Per Annum' },
  { id: 'depositHeld', label: 'Deposit' },
  { id: 'startDate', label: 'Start Date' },
  { id: 'endDate', label: 'End Date' },
  { id: 'status', label: 'Contract Status' },
  { id: 'notes', label: 'Comments / Notes' },
  { id: 'actions', label: 'Edit' },
  // Preserved secondary columns available in Column Manager
  { id: 'assignmentCode', label: 'Contract Code', defaultVisible: false },
  { id: 'rentType', label: 'Rent Frequency', defaultVisible: false },
  { id: 'currentRate', label: 'Contract Rent', defaultVisible: false },
  { id: 'totalReceived', label: 'Received', defaultVisible: false },
  { id: 'outstanding', label: 'Outstanding', defaultVisible: false },
  { id: 'history', label: 'Rate History', defaultVisible: false },
  { id: 'createdAt', label: 'Created Date', defaultVisible: false },
  { id: 'updatedAt', label: 'Modified Date', defaultVisible: false },
  { id: 'tenantPhone', label: 'Tenant Phone', defaultVisible: false },
  { id: 'tenantEmail', label: 'Tenant Email', defaultVisible: false },
  { id: 'tenantCode', label: 'Tenant Code', defaultVisible: false },
  { id: 'propertyCode', label: 'Property Code', defaultVisible: false },
  { id: 'unitCode', label: 'Unit Code', defaultVisible: false },
  { id: 'subUnitArea', label: 'Partition Area (Sq Ft)', defaultVisible: false },
  { id: 'floor', label: 'Floor / Location', defaultVisible: false },
];

const DEFAULT_CONTRACTS_COLS = [
  'property', 'subUnit', 'tenant', 'contractNo', 'contractType', 'monthlyRent', 'annualRent',
  'depositHeld', 'startDate', 'endDate', 'status', 'notes', 'actions'
];

const DEFAULT_CONTRACTS_COLUMN_WIDTHS = {
  property: 160,
  subUnit: 140,
  tenant: 150,
  contractNo: 130,
  contractType: 120,
  monthlyRent: 120,
  annualRent: 125,
  depositHeld: 110,
  startDate: 110,
  endDate: 110,
  status: 110,
  notes: 190,
  actions: 90,
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

const doContractDatesOverlap = (startA, endA, startB, endB) => {
  const sA = startA ? String(startA).slice(0, 10) : '0000-01-01';
  const eA = endA ? String(endA).slice(0, 10) : '9999-12-31';
  const sB = startB ? String(startB).slice(0, 10) : '0000-01-01';
  const eB = endB ? String(endB).slice(0, 10) : '9999-12-31';

  return sA <= eB && eA >= sB;
};

// Conflicting contract restriction removed as requested - contracts can be added/edited for any date
const findContractConflict = () => null;

const CONTRACT_RECEIPTS_COLUMNS_DEF = [
  { id: 'receiptNumber', label: 'Receipt #', defaultVisible: true },
  { id: 'receiptDate', label: 'Date', defaultVisible: true },
  { id: 'accountingMonth', label: 'Accounting Month', defaultVisible: true },
  { id: 'monthsCovered', label: 'Month Paid For', defaultVisible: true },
  { id: 'status', label: 'Status', defaultVisible: true },
  { id: 'comments', label: 'Comments', defaultVisible: true },
  { id: 'totalAmount', label: 'Amount Received (₹)', defaultVisible: true },
  { id: 'adjustmentAmount', label: 'Adjustment Amount (₹)', defaultVisible: false },
  { id: 'adjustmentDescription', label: 'Adjustment Reason', defaultVisible: false },
  { id: 'createdAt', label: 'Created Date', defaultVisible: false },
  { id: 'updatedAt', label: 'Modified Date', defaultVisible: false },
  { id: 'actions', label: 'Action', defaultVisible: true },
];

const DEFAULT_CONTRACT_RECEIPTS_COLS = [
  'receiptNumber', 'receiptDate', 'accountingMonth', 'monthsCovered', 'status', 'comments', 'totalAmount', 'actions'
];

const DEFAULT_CONTRACT_RECEIPTS_COLUMN_WIDTHS = {
  receiptNumber: 130,
  receiptDate: 110,
  accountingMonth: 140,
  monthsCovered: 160,
  status: 95,
  comments: 180,
  totalAmount: 140,
  actions: 90
};

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
  columnId === 'actions' ? 85 : 0
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
      if (savedColumns.length > 0) {
        if (!savedColumns.includes('contractNo')) {
          const tIdx = savedColumns.indexOf('tenant');
          if (tIdx !== -1) savedColumns.splice(tIdx + 1, 0, 'contractNo');
          else savedColumns.push('contractNo');
        }
        if (!savedColumns.includes('contractType')) {
          const tIdx = savedColumns.indexOf('contractNo');
          if (tIdx !== -1) savedColumns.splice(tIdx + 1, 0, 'contractType');
          else savedColumns.push('contractType');
        }
        return savedColumns;
      }
      return DEFAULT_CONTRACTS_COLS;
    } catch {
      return DEFAULT_CONTRACTS_COLS;
    }
  });

  const {
    columnWidths,
    handleResizeStart,
    resetColumnWidths
  } = useResizableColumns('contracts_v2', DEFAULT_CONTRACTS_COLUMN_WIDTHS);

  const [frozenColumnCount, setFrozenColumnCount] = useFrozenColumns('contracts_v2', 0);

  // Controls & Toolbar States (APEX Integration with localStorage persistence)
  const [search, setSearch] = useState(() => localStorage.getItem('contracts_search') || '');
  useEffect(() => { localStorage.setItem('contracts_search', search); }, [search]);

  const [propertyFilter, setPropertyFilter] = useState(() => localStorage.getItem('contracts_prop_filter') || '');
  useEffect(() => { localStorage.setItem('contracts_prop_filter', propertyFilter); }, [propertyFilter]);

  const [statusFilter, setStatusFilter] = useState(() => localStorage.getItem('contracts_status_filter') || 'Active');
  useEffect(() => { localStorage.setItem('contracts_status_filter', statusFilter); }, [statusFilter]);
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
      contractNo: extractUniqueValues(contracts, c => c.contractNo),
      contractType: ['Rent', 'Business'],
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
  const [rowsPerPage, setRowsPerPage] = useState(25); // default 25 or 'All'
  const [currentPage, setCurrentPage] = useState(1);

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showReviseModal, setShowReviseModal] = useState(false);
  const [showVacateModal, setShowVacateModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [selectedContract, setSelectedContract] = useState(null);

  // Browser Back button navigation: dismiss open modals back to table
  useModalBackHandler(showCreateModal, () => setShowCreateModal(false));
  useModalBackHandler(showEditModal, () => setShowEditModal(false));
  useModalBackHandler(showReviseModal, () => setShowReviseModal(false));
  useModalBackHandler(showVacateModal, () => setShowVacateModal(false));
  useModalBackHandler(showHistoryModal, () => setShowHistoryModal(false));

  // Forms
  const [createForm, setCreateForm] = useState({
    tenantId: '',
    propertyId: '',
    unitId: '',
    contractNo: '',
    contractType: 'Rent',
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
    contractNo: '',
    contractType: 'Rent',
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

  // Rent Receipts for selected contract in Full-Screen Edit Modal
  const [contractReceipts, setContractReceipts] = useState([]);
  const [receiptsLoading, setReceiptsLoading] = useState(false);
  const [receiptSearchQuery, setReceiptSearchQuery] = useState('');
  const [receiptSortConfig, setReceiptSortConfig] = useState({ key: 'receiptDate', direction: 'desc' });
  const [receiptActiveFilters, setReceiptActiveFilters] = useState([]);
  const [receiptRowsPerPage, setReceiptRowsPerPage] = useState(25);
  const [receiptCurrentPage, setReceiptCurrentPage] = useState(1);
  const [receiptVisibleColumns, setReceiptVisibleColumns] = useState(() => {
    const saved = localStorage.getItem('cols_contract_receipts_v2');
    if (!saved) return DEFAULT_CONTRACT_RECEIPTS_COLS;
    try {
      const allowed = CONTRACT_RECEIPTS_COLUMNS_DEF.map(c => c.id);
      const parsed = JSON.parse(saved).filter(c => allowed.includes(c));
      return parsed.length > 0 ? parsed : DEFAULT_CONTRACT_RECEIPTS_COLS;
    } catch {
      return DEFAULT_CONTRACT_RECEIPTS_COLS;
    }
  });

  const {
    columnWidths: receiptColumnWidths,
    handleResizeStart: handleReceiptResizeStart
  } = useResizableColumns('contract_receipts', DEFAULT_CONTRACT_RECEIPTS_COLUMN_WIDTHS);

  const [viewingReceipt, setViewingReceipt] = useState(null);
  useModalBackHandler(Boolean(viewingReceipt), () => setViewingReceipt(null));
  const [receiptEditForm, setReceiptEditForm] = useState({
    receiptDate: '',
    totalAmount: '',
    status: 'Rented',
    comments: ''
  });
  const [receiptSaving, setReceiptSaving] = useState(false);

  const handleReceiptHeaderSort = (colId) => {
    if (colId === 'actions') return;
    setReceiptSortConfig(prev => cycleThreeStateSort(prev, colId));
  };

  const receiptFilterSuggestions = useMemo(() => {
    return {
      receiptNumber: extractUniqueValues(contractReceipts, r => r.receiptNumber),
      receiptDate: extractUniqueValues(contractReceipts, r => r.receiptDate ? formatDate(r.receiptDate) : ''),
      monthsCovered: extractUniqueValues(contractReceipts, r => r.monthsCovered || (r.allocations && r.allocations.map(a => a.rentMonthYear).join(', ')) || ''),
      status: ['Rented', 'Vacant'],
      comments: extractUniqueValues(contractReceipts, r => r.comments)
    };
  }, [contractReceipts]);

  const processedContractReceipts = useMemo(() => {
    let rows = [...contractReceipts];

    // 1. Search Query
    if (receiptSearchQuery.trim()) {
      const q = receiptSearchQuery.toLowerCase().trim();
      rows = rows.filter(r => 
        (r.receiptNumber && r.receiptNumber.toLowerCase().includes(q)) ||
        ((r.status || 'Rented').toLowerCase().includes(q)) ||
        (r.comments && r.comments.toLowerCase().includes(q)) ||
        (r.monthsCovered && r.monthsCovered.toLowerCase().includes(q)) ||
        (r.allocations && r.allocations.some(a => a.rentMonthYear && a.rentMonthYear.toLowerCase().includes(q))) ||
        String(r.totalAmount || '').includes(q)
      );
    }

    // 2. Active APEX Filters
    if (receiptActiveFilters.length > 0) {
      rows = rows.filter(r => {
        return receiptActiveFilters.every(flt => {
          let cellVal = '';
          if (flt.column === 'receiptNumber') cellVal = r.receiptNumber;
          else if (flt.column === 'receiptDate') cellVal = r.receiptDate ? formatDate(r.receiptDate) : '';
          else if (flt.column === 'monthsCovered') cellVal = r.monthsCovered || (r.allocations && r.allocations.map(a => a.rentMonthYear).join(', ')) || '';
          else if (flt.column === 'status') cellVal = r.status || 'Rented';
          else if (flt.column === 'comments') cellVal = r.comments;
          else if (flt.column === 'totalAmount') cellVal = r.totalAmount;
          return evaluateFilterRule(cellVal, flt.operator, flt.value);
        });
      });
    }

    // 3. Sorting
    if (receiptSortConfig.key) {
      rows = sortDataRows(rows, receiptSortConfig, (item, key) => {
        if (key === 'totalAmount') return Number(item.totalAmount) || 0;
        if (key === 'receiptDate') return item.receiptDate ? new Date(item.receiptDate).getTime() : 0;
        if (key === 'monthsCovered') return item.monthsCovered || (item.allocations && item.allocations.map(a => a.rentMonthYear).join(', ')) || '';
        return item[key] || '';
      });
    }

    return rows;
  }, [contractReceipts, receiptSearchQuery, receiptActiveFilters, receiptSortConfig]);

  const paginatedContractReceipts = useMemo(() => {
    if (receiptRowsPerPage === 'All') return processedContractReceipts;
    const start = (receiptCurrentPage - 1) * Number(receiptRowsPerPage);
    return processedContractReceipts.slice(start, start + Number(receiptRowsPerPage));
  }, [processedContractReceipts, receiptRowsPerPage, receiptCurrentPage]);

  const exportContractReceiptsToExcel = () => {
    try {
      const dataToExport = processedContractReceipts.map((r, i) => ({
        '#': i + 1,
        'Receipt #': r.receiptNumber || '',
        'Date': r.receiptDate ? formatDate(r.receiptDate) : '',
        'Contract No': r.contractNo || selectedContract?.contractNo || '',
        'Month(s) Covered': r.monthsCovered || (r.allocations && r.allocations.map(a => a.rentMonthYear).join(', ')) || '',
        'Status': r.status || 'Rented',
        'Comments': r.comments || '',
        'Amount Received (₹)': Number(r.totalAmount) || 0
      }));

      const ws = XLSX.utils.json_to_sheet(dataToExport);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Rent Receipts');
      const cNo = selectedContract?.contractNo || 'Contract';
      XLSX.writeFile(wb, `Rent_Receipts_${cNo}.xlsx`);
    } catch (err) {
      console.error('Failed to export receipts to Excel:', err);
      alert('Failed to export Excel.');
    }
  };

  const openEditModal = async (c) => {
    setSelectedContract(c);
    const agreement = c.currentAgreement || {};
    const rentType = agreement.rentType || 'Monthly Fixed';
    setEditForm({
      tenantId: c.tenantId?._id || '',
      propertyId: c.unitId?.propertyId?._id || c.unitId?.propertyId || '',
      unitId: c.unitId?._id || '',
      contractNo: c.contractNo || '',
      startDate: c.startDate ? new Date(c.startDate).toISOString().slice(0, 10) : '',
      endDate: c.endDate ? new Date(c.endDate).toISOString().slice(0, 10) : '',
      status: c.status || 'Active',
      contractType: c.contractType || 'Rent',
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
    setReceiptSearchQuery('');
    setShowEditModal(true);

    // Fetch rent receipts for this contract
    setReceiptsLoading(true);
    try {
      const tId = c.tenantId?._id || c.tenantId || '';
      const uId = c.unitId?._id || c.unitId || '';
      const cNo = c.contractNo || '';
      const res = await API.get(`/payments?tenantId=${tId}&unitId=${uId}&contractNo=${encodeURIComponent(cNo)}`);
      const allReceipts = res.data?.data || [];

      const matching = allReceipts.filter(r => {
        if (cNo && r.contractNo) {
          return r.contractNo.toLowerCase() === cNo.toLowerCase();
        }
        if (c.startDate && r.receiptDate) {
          const rDate = new Date(r.receiptDate);
          if (new Date(c.startDate) > rDate) return false;
          if (c.endDate && new Date(c.endDate) < rDate) return false;
        }
        return true;
      });

      setContractReceipts(matching);
    } catch (err) {
      console.error('Failed to load contract receipts:', err);
      setContractReceipts([]);
    } finally {
      setReceiptsLoading(false);
    }
  };

  const openViewReceiptModal = (r) => {
    setViewingReceipt(r);
    setReceiptEditForm({
      receiptDate: r.receiptDate ? new Date(r.receiptDate).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
      totalAmount: String(r.totalAmount || 0),
      status: r.status || 'Rented',
      comments: r.comments || ''
    });
  };

  const handleSaveReceiptDetails = async (e) => {
    e.preventDefault();
    if (!viewingReceipt) return;
    try {
      setReceiptSaving(true);
      const payload = {
        receiptDate: receiptEditForm.receiptDate,
        totalAmount: Number(receiptEditForm.totalAmount),
        status: receiptEditForm.status || 'Rented',
        comments: receiptEditForm.comments,
        allocations: (viewingReceipt.allocations || []).map(a => ({
          rentMonthYear: a.rentMonthYear,
          allocatedAmount: a.allocatedAmount,
          notes: a.notes || ''
        }))
      };
      const res = await API.put(`/payments/${viewingReceipt._id}`, payload);
      if (res.data?.success) {
        setViewingReceipt(null);
        if (selectedContract) {
          const tId = selectedContract.tenantId?._id || selectedContract.tenantId || '';
          const uId = selectedContract.unitId?._id || selectedContract.unitId || '';
          const cNo = selectedContract.contractNo || '';
          const refreshRes = await API.get(`/payments?tenantId=${tId}&unitId=${uId}&contractNo=${encodeURIComponent(cNo)}`);
          const allR = refreshRes.data?.data || [];
          setContractReceipts(allR.filter(r => {
            if (cNo && r.contractNo) return r.contractNo.toLowerCase() === cNo.toLowerCase();
            return true;
          }));
        }
        fetchData();
      }
    } catch (err) {
      console.error('Failed to update receipt:', err);
      alert(err.response?.data?.message || 'Failed to update receipt');
    } finally {
      setReceiptSaving(false);
    }
  };

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

  // Date-range overlap conflict check: validate against existing contracts for this unit
  const conflictInCreate = useMemo(() => {
    return findContractConflict(contracts, createForm.unitId, createForm.startDate, createForm.endDate);
  }, [contracts, createForm.unitId, createForm.startDate, createForm.endDate]);

  const conflictInEdit = useMemo(() => {
    return findContractConflict(contracts, editForm.unitId, editForm.startDate, editForm.endDate, selectedContract?._id);
  }, [contracts, editForm.unitId, editForm.startDate, editForm.endDate, selectedContract]);

  const handleCreateContract = async (e) => {
    e.preventDefault();
    if (conflictInCreate) {
      const conflictNo = conflictInCreate.contractNo || conflictInCreate.assignmentCode;
      const tName = conflictInCreate.tenantId?.name || 'Unknown';
      const range = `${conflictInCreate.startDate ? formatDate(conflictInCreate.startDate) : 'Open Start'} to ${conflictInCreate.endDate ? formatDate(conflictInCreate.endDate) : 'Ongoing'}`;
      alert(`A contract already exists within this date range for this sub-property:\n• Contract No: ${conflictNo}\n• Tenant: ${tName}\n• Date Range: ${range}\n• Status: ${conflictInCreate.status}`);
      return;
    }
    const isPast = isContractEndDatePast(createForm.endDate);
    const finalStatus = isPast ? 'Ended' : createForm.status;

    try {
      setSubmitting(true);
      const res = await API.post('/assignments', {
        tenantId: createForm.tenantId,
        unitId: createForm.unitId,
        contractNo: createForm.contractNo?.trim() || undefined,
        startDate: createForm.startDate || null,
        endDate: createForm.endDate || null,
        status: finalStatus,
        contractType: createForm.contractType || 'Rent',
        rentType: createForm.rentType,
        rentAmount: Number(createForm.rentAmount),
        depositHeld: Number(createForm.depositHeld) || 0,
        terms: createForm.terms,
        notes: createForm.notes,
      });
      if (res.data.success) {
        if (finalStatus === 'Ended') setStatusFilter('Past');
        setShowCreateModal(false);
        setCreateForm({
          tenantId: '',
          propertyId: '',
          unitId: '',
          contractNo: '',
          contractType: 'Rent',
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
    if (conflictInEdit) {
      const conflictNo = conflictInEdit.contractNo || conflictInEdit.assignmentCode;
      const tName = conflictInEdit.tenantId?.name || 'Unknown';
      const range = `${conflictInEdit.startDate ? formatDate(conflictInEdit.startDate) : 'Open Start'} to ${conflictInEdit.endDate ? formatDate(conflictInEdit.endDate) : 'Ongoing'}`;
      alert(`A contract already exists within this date range for this sub-property:\n• Contract No: ${conflictNo}\n• Tenant: ${tName}\n• Date Range: ${range}\n• Status: ${conflictInEdit.status}`);
      return;
    }
    const isPast = isContractEndDatePast(editForm.endDate);
    const finalStatus = isPast ? 'Ended' : editForm.status;

    try {
      setSubmitting(true);
      const res = await API.put(`/assignments/${selectedContract._id}`, {
        tenantId: editForm.tenantId,
        unitId: editForm.unitId,
        propertyId: editForm.propertyId,
        contractNo: editForm.contractNo?.trim() || undefined,
        startDate: editForm.startDate || null,
        endDate: editForm.endDate || null,
        status: finalStatus,
        contractType: editForm.contractType || 'Rent',
        rentType: editForm.rentType,
        rentAmount: Number(editForm.rentAmount),
        depositHeld: Number(editForm.depositHeld) || 0,
        terms: editForm.terms,
        notes: editForm.notes,
      });
      if (res.data.success) {
        setShowEditModal(false);
        setSelectedContract(null);
        setContractReceipts([]);
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
      const contractNo = c.contractNo || '';
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
        contractNo.toLowerCase().includes(search.toLowerCase()) ||
        (c.contractType || 'Rent').toLowerCase().includes(search.toLowerCase()) ||
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
        else if (f.columnId === 'contractNo') fieldVal = contractNo;
        else if (f.columnId === 'contractType') fieldVal = c.contractType || 'Rent';
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
      contractNo: c => c.contractNo || '',
      contractType: c => c.contractType || 'Rent',
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
        'Contract No': c.contractNo || '',
        'Contract Type': c.contractType || 'Rent',
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
    <div className="space-y-2">
      {/* Header View: Clean Title without Dashboard KPIs as requested */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-white p-3 sm:p-3.5 rounded-2xl shadow-2xs border border-slate-200">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center font-bold shrink-0">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-extrabold text-slate-900 leading-tight">Lease Contract</h2>
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
        defaultColumns={DEFAULT_CONTRACTS_COLS}
        visibleColumns={visibleColumns}
        onChangeVisibleColumns={(cols) => {
          setVisibleColumns(cols);
          try { localStorage.setItem('cols_contracts_v2', JSON.stringify(cols)); } catch(e){}
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
        storageKey="contracts_v2"
        activeViewName={activeViewId}
        onViewChange={setActiveViewId}
        primaryAction={
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold transition-all shadow-sm active:scale-95 shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Lease Contract</span>
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
                  {visibleColumns.map((colId, colIndex) => {
                    const def = CONTRACTS_COLUMNS_DEF.find((c) => c.id === colId);
                    if (!def) return null;
                    const width = getContractColumnWidth(colId, columnWidths);
                    const frozenStyle = getFrozenColumnStyle(colIndex, frozenColumnCount, visibleColumns, columnWidths, true);
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
                        style={{ ...frozenStyle, width: `${Math.max(width, 45)}px`, minWidth: `${Math.max(width, 45)}px` }}
                        className={`py-2 pl-2.5 pr-6 border-r border-slate-300 relative group bg-slate-100 whitespace-normal break-words leading-tight select-none ${alignClass}`}
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
                              className="group/btn flex items-center gap-1 min-w-0 max-w-full text-xs font-bold text-slate-700 hover:text-slate-900 transition-colors text-left"
                              title={`Sort by ${def.label} (Click: Descending → Ascending → Clear)`}
                            >
                              <span className="break-words leading-tight">{def.label}</span>
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
                      {visibleColumns.map((colId, colIndex) => {
                        const frozenStyle = getFrozenColumnStyle(colIndex, frozenColumnCount, visibleColumns, columnWidths, false);

                        if (colId === 'assignmentCode') {
                          return (
                            <td key={colId} style={frozenStyle} className="py-3 px-3.5 border-r border-slate-200 whitespace-nowrap">
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
                            <td key={colId} style={frozenStyle} className="py-3 px-3.5 border-r border-slate-200">
                              <span className="font-semibold text-slate-800 text-xs block truncate" title={c.unitId?.propertyId?.name}>
                                {c.unitId?.propertyId?.name || '—'}
                              </span>
                            </td>
                          );
                        }

                        if (colId === 'subUnit') {
                          return (
                            <td key={colId} style={frozenStyle} className="py-3 px-3.5 border-r border-slate-200">
                              <span className="font-semibold text-teal-700 text-xs block truncate" title={c.unitId?.subUnitPartition || c.unitId?.unitName}>
                                {c.unitId?.subUnitPartition || c.unitId?.unitName || '—'}
                              </span>
                            </td>
                          );
                        }

                        if (colId === 'tenant') {
                          return (
                            <td key={colId} style={frozenStyle} className="py-3 px-3.5 border-r border-slate-200">
                              <span className="font-bold text-slate-900 text-xs block truncate">
                                {c.tenantId?.name || '—'}
                              </span>
                              {c.tenantId?.phone && (
                                <span className="text-slate-500 text-[11px] block">{c.tenantId.phone}</span>
                              )}
                            </td>
                          );
                        }

                        if (colId === 'contractNo') {
                          return (
                            <td key={colId} style={frozenStyle} className="py-3 px-3.5 border-r border-slate-200 whitespace-nowrap">
                              <span className="font-mono font-bold text-teal-800 bg-teal-50 border border-teal-200/60 px-2 py-0.5 rounded-md text-xs inline-block">
                                {c.contractNo || '—'}
                              </span>
                            </td>
                          );
                        }

                        if (colId === 'contractType') {
                          const isBiz = (c.contractType || 'Rent') === 'Business';
                          return (
                            <td key={colId} style={frozenStyle} className="py-3 px-3.5 border-r border-slate-200 text-center whitespace-nowrap">
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                                isBiz ? 'bg-purple-50 text-purple-700 border-purple-200' : 'bg-blue-50 text-blue-700 border-blue-200'
                              }`}>
                                {c.contractType || 'Rent'}
                              </span>
                            </td>
                          );
                        }

                        if (colId === 'monthlyRent') {
                          const monthly = c.currentAgreement?.monthlyRate || (c.currentAgreement?.rentType === 'Annual Fixed' ? Math.round((c.currentAgreement?.annualRate || 0) / 12) : getContractRentAmount(c));
                          return (
                            <td key={colId} style={frozenStyle} className="py-3 px-3.5 border-r border-slate-200 text-right whitespace-nowrap font-bold text-slate-900 font-mono">
                              {monthly ? formatCurrency(monthly) : '—'}
                            </td>
                          );
                        }

                        if (colId === 'annualRent') {
                          const annual = c.currentAgreement?.annualRate || (c.currentAgreement?.monthlyRate ? c.currentAgreement.monthlyRate * 12 : 0);
                          return (
                            <td key={colId} style={frozenStyle} className="py-3 px-3.5 border-r border-slate-200 text-right whitespace-nowrap font-semibold text-slate-700 font-mono">
                              {annual ? formatCurrency(annual) : '—'}
                            </td>
                          );
                        }

                        if (colId === 'depositHeld') {
                          return (
                            <td key={colId} style={frozenStyle} className="py-3 px-3.5 border-r border-slate-200 text-right whitespace-nowrap font-mono font-medium text-slate-700">
                              {c.depositHeld ? formatCurrency(c.depositHeld) : '—'}
                            </td>
                          );
                        }

                        if (colId === 'startDate') {
                          return (
                            <td key={colId} style={frozenStyle} className="py-3 px-3.5 border-r border-slate-200 whitespace-nowrap">
                              <div className="flex items-center gap-1.5 text-slate-700 font-medium">
                                <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                <span>{formatDate(c.startDate)}</span>
                              </div>
                            </td>
                          );
                        }

                        if (colId === 'endDate') {
                          return (
                            <td key={colId} style={frozenStyle} className="py-3 px-3.5 border-r border-slate-200 whitespace-nowrap">
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
                            <td key={colId} style={frozenStyle} className="py-3 px-3.5 border-r border-slate-200 text-center whitespace-nowrap">
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
                            <td key={colId} style={frozenStyle} className="py-3 px-3.5 border-r border-slate-200 text-slate-600 text-xs max-w-xs truncate" title={c.notes}>
                              {c.notes || '—'}
                            </td>
                          );
                        }

                        if (colId === 'rentType') {
                          return (
                            <td key={colId} style={frozenStyle} className="py-3 px-3.5 border-r border-slate-200 whitespace-nowrap">
                              <span className="inline-block px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-semibold text-[11px]">
                                {getContractRentType(c)}
                              </span>
                            </td>
                          );
                        }

                        if (colId === 'currentRate') {
                          return (
                            <td key={colId} style={frozenStyle} className="py-3 px-3.5 border-r border-slate-200 text-right whitespace-nowrap font-bold text-slate-900">
                              {formatCurrency(getContractRentAmount(c))}
                              <span className="text-[10px] text-slate-400 font-normal block">
                                / {getContractRentType(c) === 'Annual Fixed' ? 'year' : 'month'}
                              </span>
                            </td>
                          );
                        }

                        if (colId === 'totalReceived') {
                          return (
                            <td key={colId} style={frozenStyle} className="py-3 px-3.5 border-r border-slate-200 text-right whitespace-nowrap font-mono font-semibold text-emerald-700">
                              {formatCurrency(c.totalReceived || 0)}
                            </td>
                          );
                        }

                        if (colId === 'outstanding') {
                          return (
                            <td key={colId} style={frozenStyle} className="py-3 px-3.5 border-r border-slate-200 text-right whitespace-nowrap font-mono font-bold">
                              <span className={c.outstandingBalance > 0 ? 'text-rose-600' : 'text-emerald-600'}>
                                {formatCurrency(c.outstandingBalance || 0)}
                              </span>
                            </td>
                          );
                        }

                        if (colId === 'history') {
                          return (
                            <td key={colId} style={frozenStyle} className="py-3 px-3.5 border-r border-slate-200 text-center whitespace-nowrap">
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
                            <td key={colId} style={frozenStyle} className="py-3 px-3.5 border-r border-slate-200 text-center whitespace-nowrap text-slate-500 font-medium text-xs">
                              {formatDate(c[colId])}
                            </td>
                          );
                        }

                        if (colId === 'tenantPhone') {
                          return (
                            <td key={colId} style={frozenStyle} className="py-3 px-3.5 border-r border-slate-200 text-xs text-slate-700 whitespace-nowrap">
                              {c.tenantId?.phone || '—'}
                            </td>
                          );
                        }
                        if (colId === 'tenantEmail') {
                          return (
                            <td key={colId} style={frozenStyle} className="py-3 px-3.5 border-r border-slate-200 text-xs text-slate-600 truncate max-w-xs" title={c.tenantId?.email}>
                              {c.tenantId?.email || '—'}
                            </td>
                          );
                        }
                        if (colId === 'tenantCode') {
                          return (
                            <td key={colId} style={frozenStyle} className="py-3 px-3.5 border-r border-slate-200 font-mono text-xs text-slate-700">
                              {c.tenantId?.tenantCode || '—'}
                            </td>
                          );
                        }
                        if (colId === 'propertyCode') {
                          return (
                            <td key={colId} style={frozenStyle} className="py-3 px-3.5 border-r border-slate-200 font-mono text-xs text-slate-700">
                              {c.unitId?.propertyId?.propertyCode || '—'}
                            </td>
                          );
                        }
                        if (colId === 'unitCode') {
                          return (
                            <td key={colId} style={frozenStyle} className="py-3 px-3.5 border-r border-slate-200 font-mono text-xs text-slate-700">
                              {c.unitId?.unitCode || '—'}
                            </td>
                          );
                        }
                        if (colId === 'subUnitArea') {
                          return (
                            <td key={colId} style={frozenStyle} className="py-3 px-3.5 border-r border-slate-200 text-right text-xs text-slate-700">
                              {c.unitId?.areaSqFt ? `${c.unitId.areaSqFt} sq ft` : '—'}
                            </td>
                          );
                        }
                        if (colId === 'floor') {
                          return (
                            <td key={colId} style={frozenStyle} className="py-3 px-3.5 border-r border-slate-200 text-xs text-slate-600">
                              {c.unitId?.floor || '—'}
                            </td>
                          );
                        }
                        if (colId === 'actions') {
                          return (
                            <td key={colId} style={frozenStyle} className="py-2.5 px-3 text-center whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() => openEditModal(c)}
                                className="px-3 py-1.5 rounded-xl bg-teal-50 hover:bg-teal-100 text-teal-700 font-bold text-xs transition-colors inline-flex items-center gap-1.5 shadow-2xs border border-teal-200/60 hover:border-teal-300 cursor-pointer"
                                title="Edit Lease Contract & View Rent Received"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                                <span>Edit</span>
                              </button>
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
                  <h3 className="font-extrabold text-slate-900 text-base">New Lease Contract</h3>
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Contract No <span className="text-slate-400 font-normal">(Auto e.g. Snip-2026)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Snip-2026 (leave blank for auto)"
                    value={createForm.contractNo}
                    onChange={(e) => setCreateForm({ ...createForm, contractNo: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-400 font-mono"
                  />
                </div>
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

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Contract Type *</label>
                  <select
                    value={createForm.contractType || 'Rent'}
                    onChange={(e) => setCreateForm({ ...createForm, contractType: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-white font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-400"
                  >
                    <option value="Rent">Rent</option>
                    <option value="Business">Business</option>
                  </select>
                </div>

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
                    onChange={(e) => {
                      const val = e.target.value;
                      setCreateForm(prev => ({
                        ...prev,
                        endDate: val,
                        status: isContractEndDatePast(val) ? 'Ended' : prev.status
                      }));
                    }}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-400"
                  />
                  <p className="text-[10px] text-slate-400 mt-0.5">Leave blank if ongoing</p>
                </div>
              </div>

              {conflictInCreate && (
                <div className="p-3 bg-rose-50 border border-rose-300 rounded-xl text-rose-900 text-xs flex items-start gap-2.5 animate-in fade-in">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-rose-950">Conflicting Contract Detected:</span> A contract already exists within this date range for this sub-property:
                    <div className="mt-1.5 pl-2 border-l-2 border-rose-300 text-[11px] space-y-0.5 font-medium text-rose-900">
                      <div>• <strong>Contract No:</strong> {conflictInCreate.contractNo || conflictInCreate.assignmentCode}</div>
                      <div>• <strong>Tenant:</strong> {conflictInCreate.tenantId?.name || 'Unknown'}</div>
                      <div>• <strong>Date Range:</strong> {conflictInCreate.startDate ? formatDate(conflictInCreate.startDate) : 'Open Start'} to {conflictInCreate.endDate ? formatDate(conflictInCreate.endDate) : 'Ongoing'}</div>
                      <div>• <strong>Status:</strong> <span className="font-bold">{conflictInCreate.status}</span></div>
                    </div>
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
                  disabled={submitting || Boolean(conflictInCreate)}
                  className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold shadow-md shadow-teal-600/20 disabled:opacity-50 cursor-pointer"
                >
                  {submitting ? 'Creating...' : 'Create Contract'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Full-Screen Edit Lease Contract & Rent Received Register */}
      {showEditModal && selectedContract && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex flex-col w-screen h-screen overflow-hidden animate-in fade-in duration-150">
          <div className="bg-slate-100 w-full h-full flex flex-col overflow-hidden">
            
            {/* Top Bar: Clean header with title, contract info, and buttons in ONE single row */}
            <div className="bg-white border-b border-slate-200 px-5 sm:px-6 py-3 flex items-center justify-between shrink-0 shadow-xs z-20">
              <div className="flex items-center gap-3 min-w-0">
                <div className="p-2.5 rounded-xl bg-teal-600 text-white shadow-sm shadow-teal-600/30 shrink-0">
                  <FileText className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-extrabold text-slate-900 text-base sm:text-lg">Edit Lease Contract</h2>
                    <span className="px-2.5 py-0.5 rounded-lg bg-teal-100 text-teal-800 font-mono font-bold text-xs border border-teal-200">
                      {editForm.contractNo || selectedContract.contractNo || selectedContract.assignmentCode}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      editForm.status === 'Active' ? 'bg-emerald-100 text-emerald-800 border border-emerald-300/60' : 'bg-slate-100 text-slate-600 border border-slate-200'
                    }`}>
                      {editForm.status}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                      {editForm.contractType || 'Rent'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5 truncate">
                    <strong>{selectedContract.tenantId?.name || 'Tenant'}</strong> · {selectedContract.unitId?.propertyId?.name || 'Property'} ({selectedContract.unitId?.subUnitPartition || selectedContract.unitId?.unitName})
                  </p>
                </div>
              </div>

              {/* Action Buttons in ONE Single Row */}
              <div className="flex items-center gap-2.5 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setShowEditModal(false);
                    setSelectedContract(null);
                    setContractReceipts([]);
                  }}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-700 hover:text-slate-900 hover:bg-slate-100 border border-slate-300 bg-white transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <X className="w-4 h-4 text-slate-500" />
                  <span>Cancel / Close</span>
                </button>
                <button
                  type="submit"
                  form="editContractForm"
                  disabled={submitting || Boolean(conflictInEdit)}
                  className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold shadow-md shadow-teal-600/20 disabled:opacity-50 transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>{submitting ? 'Saving...' : 'Save Changes'}</span>
                </button>
              </div>
            </div>

            {/* Scrollable Body: Form Card + Rent Received Grid Card */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 max-w-7xl mx-auto w-full">
              
              {/* Conflict warning if any */}
              {conflictInEdit && (
                <div className="p-4 bg-rose-50 border border-rose-300 rounded-2xl text-rose-900 text-xs flex items-start gap-3 shadow-xs animate-in fade-in">
                  <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-rose-950">Conflicting Contract Detected:</span> A contract already exists within this date range for this sub-property:
                    <div className="mt-1.5 pl-2 border-l-2 border-rose-300 text-[11px] space-y-0.5 font-medium text-rose-900">
                      <div>• <strong>Contract No:</strong> {conflictInEdit.contractNo || conflictInEdit.assignmentCode}</div>
                      <div>• <strong>Tenant:</strong> {conflictInEdit.tenantId?.name || 'Unknown'}</div>
                      <div>• <strong>Date Range:</strong> {conflictInEdit.startDate ? formatDate(conflictInEdit.startDate) : 'Open Start'} to {conflictInEdit.endDate ? formatDate(conflictInEdit.endDate) : 'Ongoing'}</div>
                      <div>• <strong>Status:</strong> <span className="font-bold">{conflictInEdit.status}</span></div>
                    </div>
                  </div>
                </div>
              )}

              {/* CARD 1: Contract Details Form */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 sm:p-6">
                <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-100">
                  <Edit2 className="w-4 h-4 text-teal-600" />
                  <h3 className="text-sm font-bold text-slate-800">Contract & Tenancy Details</h3>
                </div>

                <form id="editContractForm" onSubmit={handleEditContract} className="space-y-4">
                  {/* Row 1: Tenant, Contract No, Property, Sub-Property */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Tenant *</label>
                      <select
                        required
                        value={editForm.tenantId}
                        onChange={(e) => setEditForm({ ...editForm, tenantId: e.target.value })}
                        className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-400"
                      >
                        <option value="">-- Choose Tenant --</option>
                        {tenants.map(t => (
                          <option key={t._id} value={t._id}>{t.name} {t.phone ? `(${t.phone})` : ''}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Contract No</label>
                      <input
                        type="text"
                        placeholder="e.g. Snip-2026"
                        value={editForm.contractNo}
                        onChange={(e) => setEditForm({ ...editForm, contractNo: e.target.value })}
                        className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-400 font-mono font-bold text-teal-800 bg-teal-50/30"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Property *</label>
                      <select
                        required
                        value={editForm.propertyId}
                        onChange={(e) => setEditForm({ ...editForm, propertyId: e.target.value, unitId: '' })}
                        className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-400"
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
                        className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-400"
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

                  {/* Row 2: Contract Type, Status, Start Date, End Date */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Contract Type *</label>
                      <select
                        value={editForm.contractType || 'Rent'}
                        onChange={(e) => setEditForm({ ...editForm, contractType: e.target.value })}
                        className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-400"
                      >
                        <option value="Rent">Rent</option>
                        <option value="Business">Business</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Contract Status *</label>
                      <select
                        value={editForm.status}
                        onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                        className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-400"
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
                        className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-400"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">
                        End Date <span className="text-slate-400 font-normal">(Optional)</span>
                      </label>
                      <input
                        type="date"
                        value={editForm.endDate}
                        onChange={(e) => {
                          const val = e.target.value;
                          setEditForm(prev => ({
                            ...prev,
                            endDate: val,
                            status: isContractEndDatePast(val) ? 'Ended' : prev.status
                          }));
                        }}
                        className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-400"
                      />
                    </div>
                  </div>

                  {/* Row 3: Rent Frequency, Rent Rate, Security Deposit, Agreement Terms */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Rent Frequency *</label>
                      <select
                        value={editForm.rentType}
                        onChange={(e) => changeRentType(editForm, setEditForm, e.target.value)}
                        className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-400"
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
                        className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 font-bold text-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-400"
                      />
                      <div className="text-[10px] text-slate-500 mt-1 flex items-center justify-between">
                        <span>{editForm.rentType === 'Annual Fixed' ? 'Monthly:' : 'Annual:'}</span>
                        <span className="font-bold text-slate-800">
                          {editForm.rentAmount
                            ? (editForm.rentType === 'Annual Fixed'
                                ? formatCurrency(Math.round(Number(editForm.rentAmount) / 12)) + '/mo'
                                : formatCurrency(Number(editForm.rentAmount) * 12) + '/yr')
                            : '—'}
                        </span>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Security Deposit Held (₹)</label>
                      <input
                        type="number"
                        min="0"
                        value={editForm.depositHeld}
                        onChange={(e) => setEditForm({ ...editForm, depositHeld: e.target.value })}
                        className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-400 font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Agreement Terms</label>
                      <input
                        type="text"
                        placeholder="e.g. 11 months, 10% annual escalation"
                        value={editForm.terms}
                        onChange={(e) => setEditForm({ ...editForm, terms: e.target.value })}
                        className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-400"
                      />
                    </div>
                  </div>

                  {/* Row 4: Notes */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Comments / Notes</label>
                    <textarea
                      rows="2"
                      placeholder="e.g. Rate revision details, deposit remarks, terms..."
                      value={editForm.notes}
                      onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-400"
                    />
                  </div>
                </form>
              </div>

              {/* CARD 2: Rent Received Under This Contract Grid Layout */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden flex flex-col">
                {/* Header & KPI Bar */}
                <div className="p-4 sm:p-5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-slate-50/80">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-xl bg-emerald-600 text-white shadow-xs">
                      <Receipt className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-slate-900 text-sm">Rent Received Under This Contract</h3>
                        <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-extrabold border border-emerald-200">
                          {processedContractReceipts.length} Receipt{processedContractReceipts.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500">
                        All payments allocated to contract <span className="font-mono font-bold text-slate-700">{editForm.contractNo || selectedContract.contractNo || selectedContract.assignmentCode}</span>
                      </p>
                    </div>
                  </div>

                  {/* Summary KPI Badges */}
                  <div className="flex items-center gap-2 sm:gap-3">
                    <div className="px-3.5 py-1.5 rounded-xl bg-white border border-slate-200 shadow-xs text-right">
                      <span className="text-[10px] text-slate-500 block leading-tight font-medium">Total Rent Received</span>
                      <span className="text-sm font-extrabold text-emerald-700 font-mono">
                        {formatCurrency(contractReceipts.reduce((sum, r) => sum + (Number(r.totalAmount) || 0), 0))}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Standard APEX Toolbar for Contract Receipts */}
                <ApexToolbar
                  search={receiptSearchQuery}
                  onSearchChange={(v) => { setReceiptSearchQuery(v); setReceiptCurrentPage(1); }}
                  rowsPerPage={receiptRowsPerPage}
                  onRowsPerPageChange={(v) => { setReceiptRowsPerPage(v); setReceiptCurrentPage(1); }}
                  availableRowsOptions={[5, 10, 25, 50, 100, 'All']}
                  columns={CONTRACT_RECEIPTS_COLUMNS_DEF}
                  defaultColumns={DEFAULT_CONTRACT_RECEIPTS_COLS}
                  visibleColumns={receiptVisibleColumns}
                  onChangeVisibleColumns={(cols) => {
                    setReceiptVisibleColumns(cols);
                    try { localStorage.setItem('cols_contract_receipts_v2', JSON.stringify(cols)); } catch(e){}
                  }}
                  columnWidths={receiptColumnWidths}
                  onResetWidths={() => {}}
                  sortConfig={receiptSortConfig}
                  onSortChange={setReceiptSortConfig}
                  filters={receiptActiveFilters}
                  onFiltersChange={(f) => { setReceiptActiveFilters(f); setReceiptCurrentPage(1); }}
                  filterSuggestions={receiptFilterSuggestions}
                  onExport={exportContractReceiptsToExcel}
                  storageKey="contract_receipts_v1"
                />

                {/* Receipts Table with Sorting & Filter Handles */}
                <div className="overflow-x-auto max-h-[50vh] overflow-y-auto">
                  {receiptsLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <div className="w-6 h-6 border-3 border-teal-500 border-t-transparent rounded-full animate-spin" />
                      <span className="text-xs text-slate-500 ml-2 font-medium">Loading rent receipts...</span>
                    </div>
                  ) : paginatedContractReceipts.length === 0 ? (
                    <div className="py-12 text-center text-slate-400 text-xs">
                      {contractReceipts.length === 0
                        ? 'No rent payments recorded under this contract yet.'
                        : 'No receipts match your search / filter criteria.'}
                    </div>
                  ) : (
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="sticky top-0 bg-slate-100 text-slate-700 font-bold border-b border-slate-200 z-10 select-none">
                        <tr>
                          {receiptVisibleColumns.map((colId) => {
                            const def = CONTRACT_RECEIPTS_COLUMNS_DEF.find(c => c.id === colId) || { id: colId, label: colId };
                            const width = receiptColumnWidths[colId] || DEFAULT_CONTRACT_RECEIPTS_COLUMN_WIDTHS[colId] || 120;
                            const isActions = colId === 'actions';
                            const isAmount = colId === 'totalAmount';
                            const align = isActions ? 'text-center' : isAmount ? 'text-right' : 'text-left';

                            return (
                              <th
                                key={colId}
                                style={{ width: `${Math.max(width, 50)}px`, minWidth: `${Math.max(width, 50)}px` }}
                                className={`py-2 pl-3 pr-6 border-r border-slate-300 relative group bg-slate-100 ${align}`}
                              >
                                <div className={`flex items-center gap-1 w-full ${isActions ? 'justify-center' : isAmount ? 'justify-end' : 'justify-start'}`}>
                                  {isActions ? (
                                    <span className="text-xs font-bold text-slate-700">{def.label}</span>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => handleReceiptHeaderSort(colId)}
                                      className="group/btn flex items-center gap-1 min-w-0 max-w-full text-xs font-bold text-slate-700 hover:text-slate-900 transition-colors text-left cursor-pointer"
                                      title={`Sort by ${def.label} (Click: Descending → Ascending → Clear)`}
                                    >
                                      <span className="truncate">{def.label}</span>
                                      <span className="inline-flex shrink-0 items-center justify-center w-3.5 h-3.5">
                                        {receiptSortConfig.key === colId ? (
                                          receiptSortConfig.direction === 'desc' ? (
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
                                <ResizeHandle colId={colId} onResizeStart={handleReceiptResizeStart} />
                              </th>
                            );
                          })}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {paginatedContractReceipts.map((r) => (
                          <tr key={r._id} className="hover:bg-slate-50/80 transition-colors">
                            {receiptVisibleColumns.map((colId) => {
                              if (colId === 'receiptNumber') {
                                return (
                                  <td key={colId} className="py-2 px-3 border-r border-slate-200 font-mono font-bold text-teal-800 whitespace-nowrap">
                                    {r.receiptNumber}
                                  </td>
                                );
                              }
                              if (colId === 'receiptDate') {
                                return (
                                  <td key={colId} className="py-2 px-3 border-r border-slate-200 whitespace-nowrap text-slate-700">
                                    {formatDate(r.receiptDate)}
                                  </td>
                                );
                              }
                              if (colId === 'accountingMonth') {
                                const acctM = r.accountingMonth || (r.receiptDate ? new Date(r.receiptDate).toISOString().slice(0, 7) : '');
                                return (
                                  <td key={colId} className="py-2 px-3 border-r border-slate-200 whitespace-nowrap text-xs font-semibold text-slate-800 text-center">
                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-teal-50 text-teal-800 border border-teal-200/60 font-bold text-[11px]">
                                      {acctM ? formatMonthYear(acctM) : '—'}
                                    </span>
                                  </td>
                                );
                              }
                              if (colId === 'monthsCovered') {
                                const rawM = r.monthsCovered || (r.allocations && r.allocations.map(a => a.rentMonthYear).join(', ')) || '';
                                const formatted = rawM ? rawM.split(',').map(m => formatMonthYear(m.trim())).join(', ') : '—';
                                return (
                                  <td key={colId} className="py-2 px-3 border-r border-slate-200 whitespace-nowrap">
                                    <span className="inline-block px-2 py-0.5 rounded-md bg-blue-50 text-blue-800 font-bold text-[11px] border border-blue-200">
                                      {formatted}
                                    </span>
                                  </td>
                                );
                              }
                              if (colId === 'status') {
                                const rStatus = r.status || 'Rented';
                                return (
                                  <td key={colId} className="py-2 px-3 border-r border-slate-200 whitespace-nowrap">
                                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                      rStatus === 'Vacant'
                                        ? 'bg-amber-50 text-amber-800 border border-amber-200'
                                        : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                    }`}>
                                      <span className={`w-1.5 h-1.5 rounded-full ${rStatus === 'Vacant' ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                                      {rStatus}
                                    </span>
                                  </td>
                                );
                              }
                              
                              if (colId === 'comments') {
                                return (
                                  <td key={colId} className="py-2 px-3 border-r border-slate-200 text-slate-600 text-[11px] max-w-xs truncate" title={r.comments}>
                                    {r.comments || '—'}
                                  </td>
                                );
                              }
                              if (colId === 'totalAmount') {
                                return (
                                  <td key={colId} className="py-2 px-3 border-r border-slate-200 text-right font-mono font-bold text-emerald-700 whitespace-nowrap">
                                    {formatCurrency(r.totalAmount || 0)}
                                  </td>
                                );
                              }
                              if (colId === 'actions') {
                                return (
                                  <td key={colId} className="py-2 px-3 text-center whitespace-nowrap">
                                    <button
                                      type="button"
                                      onClick={() => openViewReceiptModal(r)}
                                      className="px-2.5 py-1 rounded-lg bg-teal-50 hover:bg-teal-100 text-teal-700 font-bold text-[11px] transition-colors inline-flex items-center gap-1.5 border border-teal-200/60 cursor-pointer shadow-2xs"
                                      title="Edit Receipt Details"
                                    >
                                      <Edit2 className="w-3 h-3 text-teal-600" />
                                      <span>Edit</span>
                                    </button>
                                  </td>
                                );
                              }
                              if (colId === 'adjustmentAmount') {
                                const adj = Number(r.adjustmentAmount) || 0;
                                return (
                                  <td key={colId} className="py-2 px-3 border-r border-slate-200 text-right font-mono font-bold text-xs">
                                    {adj !== 0 ? (
                                      <span className={adj > 0 ? 'text-blue-700' : 'text-amber-700'}>
                                        {adj > 0 ? `+${formatCurrency(adj)}` : formatCurrency(adj)}
                                      </span>
                                    ) : '—'}
                                  </td>
                                );
                              }
                              if (colId === 'adjustmentDescription') {
                                return (
                                  <td key={colId} className="py-2 px-3 border-r border-slate-200 text-xs text-slate-600 max-w-xs truncate" title={r.adjustmentDescription}>
                                    {r.adjustmentDescription || '—'}
                                  </td>
                                );
                              }
                              if (colId === 'createdAt' || colId === 'updatedAt') {
                                return (
                                  <td key={colId} className="py-2 px-3 border-r border-slate-200 text-xs text-slate-600 whitespace-nowrap">
                                    {r[colId] ? formatDate(r[colId]) : '—'}
                                  </td>
                                );
                              }
                              return <td key={colId} className="py-2 px-3 border-r border-slate-200">—</td>;
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* Pagination Footer */}
                {processedContractReceipts.length > 0 && (
                  <div className="px-4 py-2.5 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs text-slate-600">
                    <span className="font-medium">
                      Showing{' '}
                      <strong>
                        {receiptRowsPerPage === 'All'
                          ? 1
                          : Math.min((receiptCurrentPage - 1) * Number(receiptRowsPerPage) + 1, processedContractReceipts.length)}
                      </strong>{' '}
                      to{' '}
                      <strong>
                        {receiptRowsPerPage === 'All'
                          ? processedContractReceipts.length
                          : Math.min(receiptCurrentPage * Number(receiptRowsPerPage), processedContractReceipts.length)}
                      </strong>{' '}
                      of <strong>{processedContractReceipts.length}</strong> receipts
                    </span>

                    {receiptRowsPerPage !== 'All' && Math.ceil(processedContractReceipts.length / Number(receiptRowsPerPage)) > 1 && (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setReceiptCurrentPage(p => Math.max(p - 1, 1))}
                          disabled={receiptCurrentPage === 1}
                          className="p-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
                        >
                          <ChevronLeft className="w-3.5 h-3.5" />
                        </button>
                        <span className="font-bold text-slate-700 px-2">
                          Page {receiptCurrentPage} of {Math.ceil(processedContractReceipts.length / Number(receiptRowsPerPage))}
                        </span>
                        <button
                          type="button"
                          onClick={() => setReceiptCurrentPage(p => Math.min(p + 1, Math.ceil(processedContractReceipts.length / Number(receiptRowsPerPage))))}
                          disabled={receiptCurrentPage >= Math.ceil(processedContractReceipts.length / Number(receiptRowsPerPage))}
                          className="p-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
                        >
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

            </div>
          </div>
        </div>
      )}

      {/* RECEIPT DETAIL / EDIT MODAL */}
      {viewingReceipt && (
        <div className="fixed inset-0 z-60 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150 flex flex-col">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-teal-600 text-white">
                  <Receipt className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Receipt Details</h3>
                  <p className="text-xs font-mono text-teal-800 font-bold">{viewingReceipt.receiptNumber}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setViewingReceipt(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveReceiptDetails} className="p-5 space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Receipt Date</label>
                  <input
                    type="date"
                    required
                    value={receiptEditForm.receiptDate}
                    onChange={(e) => setReceiptEditForm({ ...receiptEditForm, receiptDate: e.target.value })}
                    className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Amount (₹)</label>
                  <input
                    type="number"
                    required
                    min="0"
                    value={receiptEditForm.totalAmount}
                    onChange={(e) => setReceiptEditForm({ ...receiptEditForm, totalAmount: e.target.value })}
                    className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-200 font-bold text-emerald-700 focus:outline-none focus:ring-2 focus:ring-teal-400"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Status</label>
                  <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 rounded-xl">
                    <button
                      type="button"
                      onClick={() => setReceiptEditForm({ ...receiptEditForm, status: 'Rented' })}
                      className={`py-1.5 px-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        receiptEditForm.status !== 'Vacant'
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Rented
                    </button>
                    <button
                      type="button"
                      onClick={() => setReceiptEditForm({ ...receiptEditForm, status: 'Vacant' })}
                      className={`py-1.5 px-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        receiptEditForm.status === 'Vacant'
                          ? 'bg-amber-600 text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Vacant
                    </button>
                  </div>
                </div>
                
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Comments / Remarks</label>
                <textarea
                  rows="2"
                  value={receiptEditForm.comments}
                  onChange={(e) => setReceiptEditForm({ ...receiptEditForm, comments: e.target.value })}
                  className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-400"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setViewingReceipt(null)}
                  className="px-3.5 py-1.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={receiptSaving}
                  className="px-4 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold shadow-xs disabled:opacity-50 flex items-center gap-1 cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>{receiptSaving ? 'Saving...' : 'Save Receipt'}</span>
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
