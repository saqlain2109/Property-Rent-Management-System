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
  X, Download, RotateCcw, ChevronLeft, ChevronRight, ArrowUpDown, AlertCircle, Receipt, Check, Eye, Sparkles,
  Trash2, ExternalLink, RefreshCw, Split, CheckCircle2
} from 'lucide-react';
import PaymentEditModal from '../components/PaymentEditModal';
import { pushDrilldown, navigateToTab } from '../utils/navigationHistory';

const CONTRACTS_COLUMNS_DEF = [
  { id: 'property', label: 'Property' },
  { id: 'subUnit', label: 'Sub-Property / Partition' },
  { id: 'tenant', label: 'Tenant' },
  { id: 'contractNo', label: 'Contract No', defaultVisible: true },
  { id: 'contractType', label: 'Contract Type' },
  { id: 'monthlyRent', label: 'Rent Per Month' },
  { id: 'annualRent', label: 'Rent Per Annum' },
  { id: 'depositHeld', label: 'Deposit' },
  { id: 'loanAmount', label: 'Loan Amount' },
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
  'depositHeld', 'loanAmount', 'startDate', 'endDate', 'status', 'notes', 'actions'
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
  loanAmount: 110,
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
  { id: 'receiptDate', label: 'Receipt Date', defaultVisible: true },
  { id: 'accountingMonth', label: 'Accounting Month', defaultVisible: true },
  { id: 'contractNo', label: 'Contract #', defaultVisible: false },
  { id: 'contractType', label: 'Contract Type', defaultVisible: false },
  { id: 'property', label: 'Property', defaultVisible: false },
  { id: 'unit', label: 'Sub-Property / Partition', defaultVisible: false },
  { id: 'tenant', label: 'Tenant', defaultVisible: false },
  { id: 'status', label: 'Status', defaultVisible: true },
  { id: 'monthlyRentExpected', label: 'Monthly Rent (₹)', defaultVisible: true },
  { id: 'monthsCovered', label: 'Month Paid For', defaultVisible: true },
  { id: 'rentAmount', label: 'Rent Amount Paid (₹)', defaultVisible: false },
  { id: 'depositAmount', label: 'Deposit Amount (₹)', defaultVisible: false },
  { id: 'totalAmount', label: 'Total Amount Paid (₹)', defaultVisible: true },
  { id: 'outstanding', label: 'Outstanding Amount (₹)', defaultVisible: true },
  { id: 'adjustmentAmount', label: 'Adjustment (+/-) (₹)', defaultVisible: true },
  { id: 'adjustedOutstanding', label: 'Net Adjusted Outstanding (₹)', defaultVisible: true },
  { id: 'adjustmentDescription', label: 'Adjustment Reason', defaultVisible: false },
  { id: 'paidUpTo', label: 'Paid Up To', defaultVisible: true },
  { id: 'loanAmount', label: 'Loan Amount (₹)', defaultVisible: false },
  { id: 'comments', label: 'Notes / Comments', defaultVisible: true },
  { id: 'isReversed', label: 'Reversal Status', defaultVisible: false },
  { id: 'reversalReason', label: 'Reversal Reason', defaultVisible: false },
  { id: 'reversalDate', label: 'Reversal Date', defaultVisible: false },
  { id: 'createdAt', label: 'Created Date', defaultVisible: false },
  { id: 'updatedAt', label: 'Modified Date', defaultVisible: false },
  { id: 'actions', label: 'Action', defaultVisible: true },
];

const DEFAULT_CONTRACT_RECEIPTS_COLS = [
  'receiptNumber',
  'receiptDate',
  'accountingMonth',
  'monthsCovered',
  'status',
  'monthlyRentExpected',
  'totalAmount',
  'outstanding',
  'adjustmentAmount',
  'adjustedOutstanding',
  'paidUpTo',
  'comments',
  'actions'
];

const DEFAULT_CONTRACT_RECEIPTS_COLUMN_WIDTHS = {
  receiptNumber: 130,
  receiptDate: 110,
  accountingMonth: 140,
  contractNo: 120,
  contractType: 120,
  property: 150,
  unit: 140,
  tenant: 150,
  status: 95,
  monthlyRentExpected: 130,
  monthsCovered: 160,
  rentAmount: 130,
  depositAmount: 120,
  totalAmount: 140,
  outstanding: 140,
  adjustmentAmount: 130,
  adjustedOutstanding: 150,
  adjustmentDescription: 180,
  paidUpTo: 110,
  loanAmount: 120,
  comments: 180,
  isReversed: 120,
  reversalReason: 150,
  reversalDate: 120,
  createdAt: 120,
  updatedAt: 120,
  actions: 175
};

const getContractReceiptFieldVal = (r, colId, c = null) => {
  if (!r) return '';
  switch (colId) {
    case 'index': return '';
    case 'receiptNumber': return r.receiptNumber || '';
    case 'receiptDate': return r.receiptDate ? formatDate(r.receiptDate) : '';
    case 'accountingMonth': {
      const m = r.accountingMonth || (r.receiptDate ? new Date(r.receiptDate).toISOString().slice(0, 7) : '');
      return m ? formatMonthYear(m) : '';
    }
    case 'contractNo': return r.contractNo || c?.contractNo || '';
    case 'contractType': return r.contractType || c?.contractType || 'Rent';
    case 'property': return r.unitId?.propertyId?.name || c?.unitId?.propertyId?.name || '';
    case 'unit': return r.unitId?.subUnitPartition || r.unitId?.unitName || c?.unitId?.subUnitPartition || c?.unitId?.unitName || '';
    case 'tenant': return r.tenantId?.name || c?.tenantId?.name || '';
    case 'status': return r.status || 'Rented';
    case 'monthlyRentExpected': return Number(r.monthlyRentExpected) || 0;
    case 'monthsCovered': {
      const rawM = r.monthsCovered || (r.allocations && r.allocations.map(a => a.rentMonthYear).join(', ')) || '';
      return rawM ? rawM.split(',').map(m => formatMonthYear(m.trim())).join(', ') : '';
    }
    case 'rentAmount': return Number(r.rentAmount !== undefined ? r.rentAmount : r.totalAmount) || 0;
    case 'depositAmount': return Number(r.depositAmount) || 0;
    case 'totalAmount': return Number(r.totalAmount) || 0;
    case 'outstanding': return Number(r.outstanding) || 0;
    case 'adjustmentAmount': return Number(r.adjustmentAmount) || 0;
    case 'adjustedOutstanding': return Number(r.adjustedOutstanding) || 0;
    case 'adjustmentDescription': return r.adjustmentDescription || '';
    case 'paidUpTo': return r.paidUpTo || '—';
    case 'loanAmount': return Number(r.loanAmount) || 0;
    case 'comments': return r.comments || '';
    case 'isReversed': return r.isReversed ? 'Reversed' : 'Active';
    case 'reversalReason': return r.reversalReason || '';
    case 'reversalDate': return r.reversalDate ? formatDate(r.reversalDate) : '';
    case 'createdAt': return r.createdAt ? formatDate(r.createdAt) : '';
    case 'updatedAt': return r.updatedAt ? formatDate(r.updatedAt) : '';
    default: return r[colId] != null ? String(r[colId]) : '';
  }
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
        if (!savedColumns.includes('loanAmount')) {
          const dIdx = savedColumns.indexOf('depositHeld');
          if (dIdx !== -1) savedColumns.splice(dIdx + 1, 0, 'loanAmount');
          else savedColumns.push('loanAmount');
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

  // Month Paid For & Amounts editor for receipts in Edit Lease Contract
  const [editingAllocReceipt, setEditingAllocReceipt] = useState(null);
  const [allocRows, setAllocRows] = useState([]);
  const [allocAccountingMonth, setAllocAccountingMonth] = useState('');
  const [allocSaving, setAllocSaving] = useState(false);
  const [allocError, setAllocError] = useState('');
  const [editingFullPaymentReceiptId, setEditingFullPaymentReceiptId] = useState(null);

  // Browser Back button navigation: dismiss open modals back to table
  useModalBackHandler(showCreateModal, () => setShowCreateModal(false));
  useModalBackHandler(showEditModal, () => setShowEditModal(false));
  useModalBackHandler(showReviseModal, () => setShowReviseModal(false));
  useModalBackHandler(showVacateModal, () => setShowVacateModal(false));
  useModalBackHandler(showHistoryModal, () => setShowHistoryModal(false));
  useModalBackHandler(Boolean(editingAllocReceipt), () => setEditingAllocReceipt(null));
  useModalBackHandler(Boolean(editingFullPaymentReceiptId), () => setEditingFullPaymentReceiptId(null));

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
    loanAmount: 0,
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
    loanAmount: 0,
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
  const [outstandingSummary, setOutstandingSummary] = useState([]);
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
      let parsed = JSON.parse(saved).filter(c => allowed.includes(c));
      if (parsed.length > 0) {
        ['outstanding', 'adjustedOutstanding', 'monthlyRentExpected', 'paidUpTo'].forEach(col => {
          if (!parsed.includes(col)) {
            const tIdx = parsed.indexOf('totalAmount');
            if (tIdx !== -1) parsed.splice(tIdx + 1, 0, col);
            else parsed.push(col);
          }
        });
        return parsed;
      }
      return DEFAULT_CONTRACT_RECEIPTS_COLS;
    } catch {
      return DEFAULT_CONTRACT_RECEIPTS_COLS;
    }
  });

  const {
    columnWidths: receiptColumnWidths,
    handleResizeStart: handleReceiptResizeStart,
    resetColumnWidths: resetReceiptColumnWidths
  } = useResizableColumns('contract_receipts', DEFAULT_CONTRACT_RECEIPTS_COLUMN_WIDTHS);

  const [receiptSaving, setReceiptSaving] = useState(false);

  const navigateToEditPayment = (r) => {
    // Capture drilldown context to return to this contract's Edit Lease Contract modal on update/back
    pushDrilldown('contracts', {
      label: `Rent Received (${selectedContract?.contractNo || r.contractNo || 'Contract'})`,
      returnState: {
        contractId: selectedContract?._id,
        contractNo: selectedContract?.contractNo || r.contractNo,
        modal: 'editContract'
      },
      targetTab: 'payments'
    });

    let targetMonth = r.accountingMonth || '';
    if (r.allocations && r.allocations.length > 0) {
      const sorted = [...r.allocations].map(a => a.rentMonthYear).filter(Boolean).sort();
      if (sorted.length > 0) targetMonth = sorted[sorted.length - 1];
    } else if (r.monthsCovered || r.monthPaidFor) {
      const raw = r.monthsCovered || r.monthPaidFor;
      const parts = raw.split(',').map(s => s.trim()).filter(Boolean);
      const valid = parts.filter(p => /^\d{4}-\d{2}$/.test(p)).sort();
      if (valid.length > 0) targetMonth = valid[valid.length - 1];
    }
    if (!targetMonth && r.receiptDate) {
      targetMonth = new Date(r.receiptDate).toISOString().slice(0, 7);
    }

    if (targetMonth) {
      localStorage.setItem('payments_selected_month', targetMonth);
    }
    localStorage.setItem('payments_edit_receipt_id', String(r._id));
    localStorage.removeItem('payments_target_unit_id');
    const tId = r.tenantId?._id || r.tenantId || selectedContract?.tenantId?._id || selectedContract?.tenantId;
    if (tId) {
      localStorage.setItem('payments_target_tenant_id', String(tId));
      localStorage.setItem('payments_tenant_filter', String(tId));
    }
    const pId = r.propertyId?._id || r.propertyId || r.unitId?.propertyId?._id || r.unitId?.propertyId || selectedContract?.unitId?.propertyId?._id || selectedContract?.unitId?.propertyId || selectedContract?.propertyId?._id || selectedContract?.propertyId;
    if (pId) {
      localStorage.setItem('payments_prop_filter', String(pId));
    }
    const contractNoStr = r.contractNo || selectedContract?.contractNo;
    if (contractNoStr) {
      localStorage.setItem('payments_target_contract_no', String(contractNoStr));
    }
    const expRent = Number(r.monthlyRentExpected ?? (selectedContract?.currentAgreement?.monthlyRate ?? selectedContract?.currentMonthlyRate ?? 0));
    if (expRent > 0) {
      localStorage.setItem('payments_target_monthly_rent', String(expRent));
    }
    navigateToTab('payments');
  };

  const handleReceiptHeaderSort = (colId) => {
    if (colId === 'actions') return;
    setReceiptSortConfig(prev => cycleThreeStateSort(prev, colId));
  };

  // Enriched contract receipts with live outstanding, adjusted outstanding, and contract attributes
  const enrichedContractReceipts = useMemo(() => {
    if (!selectedContract) return contractReceipts;
    const c = selectedContract;
    const cNo = (c.contractNo || '').trim().toLowerCase();
    const uId = String(c.unitId?._id || c.unitId || '');
    const tId = String(c.tenantId?._id || c.tenantId || '');

    const summary = outstandingSummary.find(s => {
      if (cNo && s.contractNo) return s.contractNo.toLowerCase() === cNo;
      const sUId = String(s.unit?._id || s.unit || '');
      const sTId = String(s.tenant?._id || s.tenant || '');
      return sUId === uId && sTId === tId;
    });

    const cMonthlyRate = Number(c.currentAgreement?.monthlyRate ?? c.currentMonthlyRate ?? summary?.monthlyRentExpected ?? c.unitId?.monthlyRentExpected ?? 0) || 0;
    const cTotalOut = Number(summary?.totalOutstanding || 0);

    return contractReceipts.map(r => {
      const monthlyRentExpected = Number(r.monthlyRentExpected ?? cMonthlyRate);
      const outstanding = Number(r.outstanding !== undefined ? r.outstanding : cTotalOut);
      const adjustmentAmount = Number(r.adjustmentAmount || 0);
      const adjustmentDescription = r.adjustmentDescription || '';
      const adjustedOutstanding = Number(r.adjustedOutstanding !== undefined ? r.adjustedOutstanding : Math.max(0, outstanding + adjustmentAmount));

      let paidUpTo = r.paidUpTo || '';
      if (!paidUpTo && summary?.paidTillMonth && summary.paidTillMonth !== 'None' && summary.paidTillMonth !== 'Vacant') {
        paidUpTo = formatMonthYear(summary.paidTillMonth);
      }
      if (!paidUpTo && (r.accountingMonth || r.monthPaidFor)) {
        const rawM = r.accountingMonth || r.monthPaidFor;
        const parts = rawM.split(',').map(s => s.trim()).filter(Boolean);
        const lastM = parts.sort()[parts.length - 1];
        if (lastM && /^\d{4}-\d{2}$/.test(lastM)) {
          paidUpTo = formatMonthYear(lastM);
        }
      }

      return {
        ...r,
        contractNo: r.contractNo || c.contractNo || '',
        contractType: c.contractType || r.contractType || summary?.contractType || 'Rent',
        monthlyRentExpected,
        outstanding,
        adjustmentAmount,
        adjustmentDescription,
        adjustedOutstanding,
        paidUpTo: paidUpTo || '—',
        loanAmount: Number(r.loanAmount !== undefined ? r.loanAmount : (c.loanAmount || 0))
      };
    });
  }, [contractReceipts, selectedContract, outstandingSummary]);

  const receiptFilterSuggestions = useMemo(() => {
    return {
      receiptNumber: extractUniqueValues(enrichedContractReceipts, r => r.receiptNumber),
      receiptDate: extractUniqueValues(enrichedContractReceipts, r => r.receiptDate ? formatDate(r.receiptDate) : ''),
      accountingMonth: extractUniqueValues(enrichedContractReceipts, r => {
        const m = r.accountingMonth || (r.receiptDate ? new Date(r.receiptDate).toISOString().slice(0, 7) : '');
        return m ? formatMonthYear(m) : '';
      }),
      contractType: ['Rent', 'Business'],
      monthsCovered: extractUniqueValues(enrichedContractReceipts, r => r.monthsCovered || (r.allocations && r.allocations.map(a => a.rentMonthYear).join(', ')) || ''),
      status: ['Rented', 'Vacant'],
      paidUpTo: extractUniqueValues(enrichedContractReceipts, r => r.paidUpTo),
      adjustmentDescription: extractUniqueValues(enrichedContractReceipts, r => r.adjustmentDescription),
      isReversed: ['Active', 'Reversed'],
      comments: extractUniqueValues(enrichedContractReceipts, r => r.comments)
    };
  }, [enrichedContractReceipts]);

  const processedContractReceipts = useMemo(() => {
    let rows = [...enrichedContractReceipts];

    // 1. Search Query
    if (receiptSearchQuery.trim()) {
      const q = receiptSearchQuery.toLowerCase().trim();
      rows = rows.filter(r => 
        (r.receiptNumber && r.receiptNumber.toLowerCase().includes(q)) ||
        ((r.status || 'Rented').toLowerCase().includes(q)) ||
        (r.comments && r.comments.toLowerCase().includes(q)) ||
        (r.monthsCovered && r.monthsCovered.toLowerCase().includes(q)) ||
        (r.adjustmentDescription && r.adjustmentDescription.toLowerCase().includes(q)) ||
        (r.paidUpTo && r.paidUpTo.toLowerCase().includes(q)) ||
        (r.allocations && r.allocations.some(a => a.rentMonthYear && a.rentMonthYear.toLowerCase().includes(q))) ||
        String(r.totalAmount || '').includes(q) ||
        String(r.outstanding || '').includes(q) ||
        String(r.adjustedOutstanding || '').includes(q)
      );
    }

    // 2. Active APEX Filters
    if (receiptActiveFilters.length > 0) {
      rows = rows.filter(r => {
        return receiptActiveFilters.every(flt => {
          const cellVal = getContractReceiptFieldVal(r, flt.column, selectedContract);
          return evaluateFilterRule(cellVal, flt.operator, flt.value);
        });
      });
    }

    // 3. Sorting
    if (receiptSortConfig.key) {
      rows = sortDataRows(rows, receiptSortConfig, (item, key) => {
        if (['totalAmount', 'rentAmount', 'depositAmount', 'adjustmentAmount', 'monthlyRentExpected', 'outstanding', 'adjustedOutstanding', 'loanAmount'].includes(key)) {
          return Number(getContractReceiptFieldVal(item, key, selectedContract)) || 0;
        }
        if (['receiptDate', 'createdAt', 'updatedAt', 'reversalDate'].includes(key)) {
          return item[key] ? new Date(item[key]).getTime() : 0;
        }
        if (key === 'accountingMonth') {
          return item.accountingMonth || (item.receiptDate ? new Date(item.receiptDate).toISOString().slice(0, 7) : '') || '';
        }
        if (key === 'monthsCovered') {
          return item.monthsCovered || (item.allocations && item.allocations.map(a => a.rentMonthYear).join(', ')) || '';
        }
        return getContractReceiptFieldVal(item, key, selectedContract);
      });
    }

    return rows;
  }, [enrichedContractReceipts, receiptSearchQuery, receiptActiveFilters, receiptSortConfig, selectedContract]);

  const paginatedContractReceipts = useMemo(() => {
    if (receiptRowsPerPage === 'All') return processedContractReceipts;
    const start = (receiptCurrentPage - 1) * Number(receiptRowsPerPage);
    return processedContractReceipts.slice(start, start + Number(receiptRowsPerPage));
  }, [processedContractReceipts, receiptRowsPerPage, receiptCurrentPage]);

  const exportContractReceiptsToExcel = () => {
    try {
      const exportCols = CONTRACT_RECEIPTS_COLUMNS_DEF.filter(c => c.id !== 'actions' && (receiptVisibleColumns.includes(c.id) || receiptVisibleColumns.length === 0));
      const dataToExport = processedContractReceipts.map((r, i) => {
        const row = { '#': i + 1 };
        exportCols.forEach(col => {
          const val = getContractReceiptFieldVal(r, col.id, selectedContract);
          row[col.label] = ['totalAmount', 'rentAmount', 'depositAmount', 'adjustmentAmount', 'monthlyRentExpected', 'outstanding', 'adjustedOutstanding', 'loanAmount'].includes(col.id)
            ? (Number(val) || 0)
            : val;
        });
        return row;
      });

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

  const fetchContractReceipts = async (contract) => {
    const c = contract || selectedContract;
    if (!c) return;
    setReceiptsLoading(true);
    try {
      const tId = c.tenantId?._id || c.tenantId || '';
      const uId = c.unitId?._id || c.unitId || '';
      const cNo = c.contractNo || '';
      const [res, oRes] = await Promise.all([
        API.get(`/payments?tenantId=${tId}&unitId=${uId}&contractNo=${encodeURIComponent(cNo)}`),
        API.get('/payments/outstanding-summary').catch(() => ({ data: { success: false } }))
      ]);
      if (oRes?.data?.success && oRes.data.data) {
        setOutstandingSummary(oRes.data.data);
      }
      const allReceipts = res.data?.data || [];

      const isContractMatch = (cNoStr, rNoStr) => {
        if (!cNoStr || !rNoStr) return false;
        const c1 = cNoStr.trim().toLowerCase();
        const r1 = rNoStr.trim().toLowerCase();
        if (c1 === r1) return true;
        if ((c1 === 'de-2025' || c1 === 'delhiery-2025') && (r1 === 'de-2025' || r1 === 'delhiery-2025')) return true;
        return false;
      };

      const matching = allReceipts.filter(r => {
        if (cNo && r.contractNo) {
          return isContractMatch(cNo, r.contractNo);
        }
        if (cNo && r.allocations && r.allocations.some(a => isContractMatch(cNo, a.contractNo))) {
          return true;
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
      loanAmount: c.loanAmount || 0,
      terms: agreement.terms || '',
      notes: c.notes || '',
    });
    setReceiptSearchQuery('');
    setShowEditModal(true);
    fetchContractReceipts(c);
  };

  // Get all contract calendar months between startDate and endDate
  const contractTermMonths = useMemo(() => {
    if (!selectedContract) return [];
    const startStr = selectedContract.startDate ? String(selectedContract.startDate).slice(0, 7) : '';
    const endStr = selectedContract.endDate ? String(selectedContract.endDate).slice(0, 7) : '';
    if (!startStr) return [];
    
    const months = [];
    let [curYear, curMonth] = startStr.split('-').map(Number);
    const targetEnd = endStr || `${curYear + 1}-${String(curMonth).padStart(2, '0')}`;
    const [endYear, endMonth] = targetEnd.split('-').map(Number);

    let safety = 0;
    while (safety < 36) {
      safety++;
      const ym = `${curYear}-${String(curMonth).padStart(2, '0')}`;
      months.push(ym);
      if (curYear === endYear && curMonth === endMonth) break;
      curMonth++;
      if (curMonth > 12) {
        curMonth = 1;
        curYear++;
      }
    }
    return months;
  }, [selectedContract]);

  const openEditAllocationsModal = async (r) => {
    setAllocError('');
    setAllocSaving(false);
    
    let freshReceipt = r;
    try {
      const res = await API.get(`/payments/${r._id}`);
      if (res.data?.success && res.data.data) {
        freshReceipt = res.data.data;
      }
    } catch (err) {
      console.warn('Could not fetch fresh single receipt, using row data:', err);
    }

    const acctMonth = freshReceipt.accountingMonth || (freshReceipt.receiptDate ? new Date(freshReceipt.receiptDate).toISOString().slice(0, 7) : '');
    setAllocAccountingMonth(acctMonth);

    let rows = [];
    if (freshReceipt.allocations && Array.isArray(freshReceipt.allocations) && freshReceipt.allocations.length > 0) {
      rows = freshReceipt.allocations.map(a => ({
        id: a._id || Math.random().toString(36).slice(2, 9),
        rentMonthYear: a.rentMonthYear,
        allocatedAmount: String(a.allocatedAmount !== undefined ? a.allocatedAmount : 0)
      }));
    } else if (freshReceipt.monthsCovered || freshReceipt.monthPaidFor) {
      const raw = freshReceipt.monthsCovered || freshReceipt.monthPaidFor;
      const parts = raw.split(',').map(s => s.trim()).filter(Boolean);
      const totalRent = freshReceipt.rentAmount !== undefined ? freshReceipt.rentAmount : (freshReceipt.totalAmount || 0);
      const splitAmt = parts.length > 0 ? Math.round(totalRent / parts.length) : totalRent;
      rows = parts.map((m, idx) => ({
        id: Math.random().toString(36).slice(2, 9),
        rentMonthYear: m,
        allocatedAmount: String(idx === parts.length - 1 ? (totalRent - splitAmt * (parts.length - 1)) : splitAmt)
      }));
    }

    if (rows.length === 0) {
      const defaultMonth = acctMonth || new Date().toISOString().slice(0, 7);
      const totalRent = freshReceipt.rentAmount !== undefined ? freshReceipt.rentAmount : (freshReceipt.totalAmount || 0);
      rows = [{
        id: Math.random().toString(36).slice(2, 9),
        rentMonthYear: defaultMonth,
        allocatedAmount: String(totalRent)
      }];
    }

    setAllocRows(rows);
    setEditingAllocReceipt(freshReceipt);
  };

  const handleAddAllocMonth = (monthToSet) => {
    const existingMonths = new Set(allocRows.map(r => r.rentMonthYear));
    let nextMonth = monthToSet || '';
    if (!nextMonth) {
      const availableContractMonth = contractTermMonths.find(m => !existingMonths.has(m));
      if (availableContractMonth) {
        nextMonth = availableContractMonth;
      } else if (allocRows.length > 0) {
        const lastM = allocRows[allocRows.length - 1].rentMonthYear;
        if (/^\d{4}-\d{2}$/.test(lastM)) {
          let [y, m] = lastM.split('-').map(Number);
          m++;
          if (m > 12) { m = 1; y++; }
          nextMonth = `${y}-${String(m).padStart(2, '0')}`;
        }
      } else {
        nextMonth = new Date().toISOString().slice(0, 7);
      }
    }

    const cMonthlyRate = Number(selectedContract?.currentAgreement?.monthlyRate ?? selectedContract?.currentMonthlyRate ?? selectedContract?.unitId?.monthlyRentExpected ?? 22000);
    setAllocRows(prev => [
      ...prev,
      {
        id: Math.random().toString(36).slice(2, 9),
        rentMonthYear: nextMonth,
        allocatedAmount: String(cMonthlyRate)
      }
    ]);
  };

  const handleRemoveAllocMonth = (id) => {
    if (allocRows.length <= 1) {
      setAllocError('At least one month paid for must be specified.');
      return;
    }
    setAllocRows(prev => prev.filter(r => r.id !== id));
  };

  const handleUpdateAllocMonth = (id, newMonth) => {
    setAllocRows(prev => prev.map(r => r.id === id ? { ...r, rentMonthYear: newMonth } : r));
  };

  const handleUpdateAllocAmount = (id, newAmt) => {
    setAllocRows(prev => prev.map(r => r.id === id ? { ...r, allocatedAmount: newAmt } : r));
  };

  const handleSplitEvenly = () => {
    if (allocRows.length === 0) return;
    const totalRent = Number(editingAllocReceipt?.rentAmount !== undefined ? editingAllocReceipt.rentAmount : (editingAllocReceipt?.totalAmount || 0));
    const splitAmt = Math.round(totalRent / allocRows.length);
    setAllocRows(prev => prev.map((r, idx) => ({
      ...r,
      allocatedAmount: String(idx === prev.length - 1 ? (totalRent - splitAmt * (prev.length - 1)) : splitAmt)
    })));
  };

  const handleFillContractRate = () => {
    const cMonthlyRate = Number(selectedContract?.currentAgreement?.monthlyRate ?? selectedContract?.currentMonthlyRate ?? selectedContract?.unitId?.monthlyRentExpected ?? 22000);
    setAllocRows(prev => prev.map(r => ({
      ...r,
      allocatedAmount: String(cMonthlyRate)
    })));
  };

  const handleSaveAllocations = async () => {
    if (allocRows.length === 0) {
      setAllocError('Please add at least one month paid for.');
      return;
    }
    for (const row of allocRows) {
      if (!row.rentMonthYear || !/^\d{4}-\d{2}$/.test(row.rentMonthYear)) {
        setAllocError('All months must be in valid YYYY-MM format.');
        return;
      }
      if (Number(row.allocatedAmount) < 0 || isNaN(Number(row.allocatedAmount))) {
        setAllocError('Amount for each month must be a valid positive number.');
        return;
      }
    }

    setAllocSaving(true);
    setAllocError('');

    try {
      const payloadAllocations = allocRows.map(row => ({
        rentMonthYear: row.rentMonthYear,
        allocatedAmount: Number(row.allocatedAmount) || 0,
        contractNo: selectedContract?.contractNo || editingAllocReceipt.contractNo || ''
      }));

      const totalAllocated = payloadAllocations.reduce((sum, a) => sum + a.allocatedAmount, 0);
      const depAmount = Number(editingAllocReceipt.depositAmount || 0);

      const payload = {
        allocations: payloadAllocations,
        rentAmount: totalAllocated,
        depositAmount: depAmount,
        totalAmount: totalAllocated + depAmount,
        accountingMonth: allocAccountingMonth || payloadAllocations[0]?.rentMonthYear,
        contractNo: selectedContract?.contractNo || editingAllocReceipt.contractNo || ''
      };

      const res = await API.put(`/payments/${editingAllocReceipt._id}`, payload);
      if (res.data?.success) {
        await fetchContractReceipts(selectedContract);
        fetchData();
        setEditingAllocReceipt(null);
      } else {
        setAllocError(res.data?.message || 'Failed to save month allocations');
      }
    } catch (err) {
      console.error('Failed to save allocations:', err);
      setAllocError(err.response?.data?.message || err.message || 'Error saving month allocations');
    } finally {
      setAllocSaving(false);
    }
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      const [cRes, tRes, pRes, uRes, oRes] = await Promise.all([
        API.get('/assignments'),
        API.get('/tenants'),
        API.get('/properties'),
        API.get('/units'),
        API.get('/payments/outstanding-summary').catch(() => ({ data: { success: false } }))
      ]);
      if (cRes.data.success) setContracts(cRes.data.data);
      if (tRes.data.success) setTenants(tRes.data.data);
      if (pRes.data.success) setProperties(pRes.data.data);
      if (uRes.data.success) setUnits(uRes.data.data);
      if (oRes?.data?.success) setOutstandingSummary(oRes.data.data || []);
    } catch (err) {
      console.error('Failed to load contracts data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Check incoming request to open specific contract (from drilldown return or cross-view navigation)
  useEffect(() => {
    const checkTargetContract = () => {
      if (contracts.length === 0) return;
      const targetContractId = localStorage.getItem('contracts_target_id');
      const targetContractNo = localStorage.getItem('contracts_target_no');
      if (targetContractId || targetContractNo) {
        localStorage.removeItem('contracts_target_id');
        localStorage.removeItem('contracts_target_no');
        const matched = contracts.find(c => 
          (targetContractId && String(c._id) === String(targetContractId)) ||
          (targetContractNo && (c.contractNo || '').trim().toLowerCase() === targetContractNo.trim().toLowerCase())
        );
        if (matched) {
          openEditModal(matched);
        }
      }
    };

    checkTargetContract();
    window.addEventListener('popstate', checkTargetContract);
    window.addEventListener('hashchange', checkTargetContract);
    window.addEventListener('app_check_edit_request', checkTargetContract);
    return () => {
      window.removeEventListener('popstate', checkTargetContract);
      window.removeEventListener('hashchange', checkTargetContract);
      window.removeEventListener('app_check_edit_request', checkTargetContract);
    };
  }, [contracts]);

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
      const isBusiness = createForm.contractType === 'Business';
      const numRent = (isBusiness && (!createForm.rentAmount || isNaN(Number(createForm.rentAmount)))) ? 0 : Number(createForm.rentAmount || 0);
      const res = await API.post('/assignments', {
        tenantId: createForm.tenantId,
        unitId: createForm.unitId,
        contractNo: createForm.contractNo?.trim() || undefined,
        startDate: createForm.startDate || null,
        endDate: createForm.endDate || null,
        status: finalStatus,
        contractType: createForm.contractType || 'Rent',
        rentType: createForm.rentType,
        rentAmount: numRent,
        depositHeld: Number(createForm.depositHeld) || 0,
        loanAmount: Number(createForm.loanAmount) || 0,
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
          loanAmount: 0,
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
      const isBusiness = editForm.contractType === 'Business';
      const numRent = (isBusiness && (!editForm.rentAmount || isNaN(Number(editForm.rentAmount)))) ? 0 : Number(editForm.rentAmount || 0);
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
        rentAmount: numRent,
        depositHeld: Number(editForm.depositHeld) || 0,
        loanAmount: Number(editForm.loanAmount) || 0,
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
        'Loan Amount': c.loanAmount || 0,
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
            <p className="text-xs text-slate-500 font-medium">Manage lease agreements, active rentals, and historical contracts</p>
          </div>
        </div>
      </div>

      {/* Oracle APEX-Style Interactive Toolbar (Columns, Filter, Freeze Header, Save View, Download, Rows Per Page) */}
      <ApexToolbar
        propertyFilter={
          <SearchableSelect
            className="w-44 sm:w-52 text-xs"
            value={propertyFilter}
            onChange={setPropertyFilter}
            placeholder="All Properties"
            searchPlaceholder="Filter property..."
            options={properties.map((p) => ({ value: p._id, label: p.name }))}
          />
        }
        statusFilter={
          <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-xl shrink-0">
            <button
              type="button"
              onClick={() => { setStatusFilter('Active'); setCurrentPage(1); }}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                statusFilter === 'Active' ? 'bg-white text-teal-700 shadow-xs' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              Active ({totalActive})
            </button>
            <button
              type="button"
              onClick={() => { setStatusFilter('Past'); setCurrentPage(1); }}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                statusFilter === 'Past' ? 'bg-white text-teal-700 shadow-xs' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              Past / Vacated
            </button>
            <button
              type="button"
              onClick={() => { setStatusFilter(''); setCurrentPage(1); }}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                !statusFilter ? 'bg-white text-teal-700 shadow-xs' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              All
            </button>
          </div>
        }
        kpiFilter={
          <div className="text-xs text-slate-600 bg-slate-100 font-semibold px-2.5 py-1 rounded-xl shrink-0">
            <b>{filteredContracts.length}</b> Contracts
          </div>
        }
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
                    if (['monthlyRent', 'annualRent', 'currentRate', 'depositHeld', 'loanAmount', 'totalReceived', 'outstanding'].includes(colId)) alignClass = 'text-right';
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
                          const isBusiness = c.contractType === 'Business';
                          const monthly = c.currentAgreement?.monthlyRate || (c.currentAgreement?.rentType === 'Annual Fixed' ? Math.round((c.currentAgreement?.annualRate || 0) / 12) : getContractRentAmount(c));
                          return (
                            <td key={colId} style={frozenStyle} className="py-3 px-3.5 border-r border-slate-200 text-right whitespace-nowrap font-bold text-slate-900 font-mono">
                              {monthly ? formatCurrency(monthly) : (isBusiness ? <span className="text-[11px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">₹0 (Business)</span> : '—')}
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

                        if (colId === 'loanAmount') {
                          return (
                            <td key={colId} style={frozenStyle} className="py-3 px-3.5 border-r border-slate-200 text-right whitespace-nowrap font-mono font-medium text-slate-700">
                              {c.loanAmount ? formatCurrency(c.loanAmount) : '—'}
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

              {createForm.contractType === 'Business' && (
                <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
                  <span><strong>Business Contract:</strong> Monthly rent is not compulsory (defaults to ₹0). Other business revenues and income generated from this business are recorded through Receipts.</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Rent Frequency {createForm.contractType === 'Business' ? '(Optional)' : '*'}
                  </label>
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
                    {createForm.contractType === 'Business'
                      ? 'Monthly Rent Rate (₹) (Optional — No rent for Business)'
                      : (createForm.rentType === 'Annual Fixed' ? 'Annual Rent Rate (₹) *' : 'Monthly Rent Rate (₹) *')}
                  </label>
                  <input
                    type="number"
                    required={createForm.contractType !== 'Business'}
                    min="0"
                    placeholder={createForm.contractType === 'Business' ? '₹0 (No rent required)' : (createForm.rentType === 'Annual Fixed' ? 'e.g. 108000' : 'e.g. 9000')}
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
                        : (createForm.contractType === 'Business' ? '₹0 (Business)' : '—')}
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Deposit Held (₹)</label>
                  <input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={createForm.depositHeld}
                    onChange={(e) => setCreateForm({ ...createForm, depositHeld: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-400 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Loan Amount (₹)</label>
                  <input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={createForm.loanAmount}
                    onChange={(e) => setCreateForm({ ...createForm, loanAmount: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-400 font-mono"
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

                  {editForm.contractType === 'Business' && (
                    <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
                      <span><strong>Business Contract:</strong> Monthly rent is not compulsory (defaults to ₹0). Other business revenues and income generated from this business are recorded through Receipts.</span>
                    </div>
                  )}

                  {/* Row 3: Rent Frequency, Rent Rate */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">
                        Rent Frequency {editForm.contractType === 'Business' ? '(Optional)' : '*'}
                      </label>
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
                        {editForm.contractType === 'Business'
                          ? 'Monthly Rent Rate (₹) (Optional — No rent for Business)'
                          : (editForm.rentType === 'Annual Fixed' ? 'Annual Rent Rate (₹) *' : 'Monthly Rent Rate (₹) *')}
                      </label>
                      <input
                        type="number"
                        required={editForm.contractType !== 'Business'}
                        min="0"
                        placeholder={editForm.contractType === 'Business' ? '₹0 (No rent required)' : ''}
                        value={editForm.rentAmount}
                        onChange={(e) => setEditForm({ ...editForm, rentAmount: e.target.value })}
                        className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 font-bold text-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-400 font-mono"
                      />
                      <div className="text-[10px] text-slate-500 mt-1 flex items-center justify-between">
                        <span>{editForm.rentType === 'Annual Fixed' ? 'Monthly:' : 'Annual:'}</span>
                        <span className="font-bold text-slate-800">
                          {editForm.rentAmount
                            ? (editForm.rentType === 'Annual Fixed'
                                ? formatCurrency(Math.round(Number(editForm.rentAmount) / 12)) + '/mo'
                                : formatCurrency(Number(editForm.rentAmount) * 12) + '/yr')
                            : (editForm.contractType === 'Business' ? '₹0 (Business)' : '—')}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Row 4: Security Deposit, Loan Amount, Agreement Terms */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Loan Amount (₹)</label>
                      <input
                        type="number"
                        min="0"
                        placeholder="0"
                        value={editForm.loanAmount}
                        onChange={(e) => setEditForm({ ...editForm, loanAmount: e.target.value })}
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
                  kpiFilter={
                    <div className="px-3 py-1 rounded-xl bg-emerald-50 border border-emerald-200 shadow-2xs text-right shrink-0 flex items-center gap-1.5">
                      <span className="text-[10px] text-emerald-800 font-semibold">Total Received:</span>
                      <span className="text-xs font-black text-emerald-800 font-mono">
                        {formatCurrency(contractReceipts.reduce((sum, r) => sum + (Number(r.totalAmount) || 0), 0))}
                      </span>
                    </div>
                  }
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
                  onResetWidths={resetReceiptColumnWidths}
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
                            const isAmount = ['totalAmount', 'rentAmount', 'depositAmount', 'monthlyRentExpected', 'adjustmentAmount', 'outstanding', 'adjustedOutstanding', 'loanAmount'].includes(colId);
                            const isCenter = ['contractType', 'paidUpTo', 'isReversed', 'status'].includes(colId);
                            const align = isActions || isCenter ? 'text-center' : isAmount ? 'text-right' : 'text-left';

                            const dragProps = getHeaderDragProps(
                              colId,
                              receiptVisibleColumns,
                              (cols) => {
                                setReceiptVisibleColumns(cols);
                                try { localStorage.setItem('cols_contract_receipts_v2', JSON.stringify(cols)); } catch(e){}
                              },
                              'contract_receipts_v2'
                            );

                            return (
                              <th
                                key={colId}
                                {...dragProps}
                                style={{
                                  ...dragProps.style,
                                  width: `${Math.max(width, 50)}px`,
                                  minWidth: `${Math.max(width, 50)}px`
                                }}
                                className={`py-2 pl-3 pr-6 border-r border-slate-300 relative group bg-slate-100 cursor-grab active:cursor-grabbing select-none ${align}`}
                              >
                                <div className={`flex items-center gap-1 w-full ${isActions || isCenter ? 'justify-center' : isAmount ? 'justify-end' : 'justify-start'}`}>
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
                                    <button
                                      type="button"
                                      onClick={() => navigateToEditPayment(r)}
                                      className="hover:underline hover:text-teal-600 cursor-pointer font-mono font-bold text-left"
                                      title="Click to edit in Edit Month / Payment screen"
                                    >
                                      {r.receiptNumber}
                                    </button>
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
                                    <button
                                      type="button"
                                      onClick={() => openEditAllocationsModal(r)}
                                      className="group inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-800 font-bold text-[11px] border border-blue-200/80 transition-all cursor-pointer shadow-2xs hover:shadow-xs"
                                      title="Click to edit and select months paid for and amounts for each month"
                                    >
                                      <span>{formatted}</span>
                                      <Edit2 className="w-3 h-3 text-blue-600 opacity-60 group-hover:opacity-100 transition-opacity" />
                                    </button>
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
                              
                              if (colId === 'contractNo') {
                                const cNo = r.contractNo || selectedContract?.contractNo || '';
                                return (
                                  <td key={colId} className="py-2 px-3 border-r border-slate-200 whitespace-nowrap font-mono text-[11px]">
                                    {cNo ? (
                                      <span className="inline-block px-2 py-0.5 rounded-lg bg-teal-50 text-teal-800 font-bold border border-teal-200/60">
                                        {cNo}
                                      </span>
                                    ) : <span className="text-slate-400">—</span>}
                                  </td>
                                );
                              }
                              if (colId === 'contractType') {
                                const isBiz = (r.contractType || selectedContract?.contractType || '').toLowerCase() === 'business';
                                return (
                                  <td key={colId} className="py-2 px-3 border-r border-slate-200 text-center whitespace-nowrap">
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold border ${
                                      isBiz ? 'bg-purple-50 text-purple-800 border-purple-200' : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                    }`}>
                                      {isBiz ? 'Business' : 'Rent'}
                                    </span>
                                  </td>
                                );
                              }
                              if (colId === 'property') {
                                return (
                                  <td key={colId} className="py-2 px-3 border-r border-slate-200 font-medium text-slate-900 whitespace-nowrap">
                                    {r.unitId?.propertyId?.name || selectedContract?.unitId?.propertyId?.name || '—'}
                                  </td>
                                );
                              }
                              if (colId === 'unit') {
                                return (
                                  <td key={colId} className="py-2 px-3 border-r border-slate-200 whitespace-nowrap font-medium text-slate-700">
                                    {r.unitId?.subUnitPartition || r.unitId?.unitName || selectedContract?.unitId?.subUnitPartition || selectedContract?.unitId?.unitName || '—'}
                                  </td>
                                );
                              }
                              if (colId === 'tenant') {
                                return (
                                  <td key={colId} className="py-2 px-3 border-r border-slate-200 whitespace-nowrap font-bold text-slate-900">
                                    {r.tenantId?.name || selectedContract?.tenantId?.name || '—'}
                                  </td>
                                );
                              }
                              if (colId === 'monthlyRentExpected') {
                                const num = Number(r.monthlyRentExpected) || 0;
                                return (
                                  <td key={colId} className="py-2 px-3 border-r border-slate-200 text-right font-mono font-bold text-slate-800 whitespace-nowrap">
                                    {num > 0 ? formatCurrency(num) : '—'}
                                  </td>
                                );
                              }
                              if (colId === 'rentAmount') {
                                const rVal = r.rentAmount !== undefined ? r.rentAmount : (r.totalAmount || 0);
                                return (
                                  <td key={colId} className="py-2 px-3 border-r border-slate-200 text-right font-mono font-bold text-emerald-800 whitespace-nowrap">
                                    {formatCurrency(rVal)}
                                  </td>
                                );
                              }
                              if (colId === 'depositAmount') {
                                const dVal = Number(r.depositAmount) || 0;
                                return (
                                  <td key={colId} className="py-2 px-3 border-r border-slate-200 text-right font-mono font-bold text-amber-800 whitespace-nowrap">
                                    {dVal > 0 ? formatCurrency(dVal) : '—'}
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
                              if (colId === 'outstanding') {
                                const outVal = Number(r.outstanding) || 0;
                                return (
                                  <td key={colId} className="py-2 px-3 border-r border-slate-200 text-right font-mono whitespace-nowrap">
                                    {outVal > 0 ? (
                                      <span className="font-extrabold text-rose-700">
                                        {formatCurrency(outVal)}
                                      </span>
                                    ) : (
                                      <span className="text-slate-400">₹0</span>
                                    )}
                                  </td>
                                );
                              }
                              if (colId === 'adjustmentAmount') {
                                const adj = Number(r.adjustmentAmount) || 0;
                                return (
                                  <td key={colId} className="py-2 px-3 border-r border-slate-200 text-right font-mono font-bold text-xs whitespace-nowrap">
                                    {adj !== 0 ? (
                                      <span className={adj > 0 ? 'text-emerald-700' : 'text-rose-600'}>
                                        {adj > 0 ? `+${formatCurrency(adj)}` : formatCurrency(adj)}
                                      </span>
                                    ) : '—'}
                                  </td>
                                );
                              }
                              if (colId === 'adjustedOutstanding') {
                                const adjOut = Number(r.adjustedOutstanding) || 0;
                                return (
                                  <td key={colId} className="py-2 px-3 border-r border-slate-200 text-right font-mono whitespace-nowrap">
                                    {adjOut > 0 ? (
                                      <span className="inline-block px-2 py-0.5 rounded-lg bg-rose-50 text-rose-800 font-extrabold text-[11px] border border-rose-200/60">
                                        {formatCurrency(adjOut)}
                                      </span>
                                    ) : (
                                      <span className="text-emerald-600 font-bold">₹0</span>
                                    )}
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
                              if (colId === 'paidUpTo') {
                                const val = r.paidUpTo && r.paidUpTo !== 'None' && r.paidUpTo !== 'Vacant' ? r.paidUpTo : '—';
                                return (
                                  <td key={colId} className="py-2 px-3 border-r border-slate-200 text-center whitespace-nowrap">
                                    {val !== '—' ? (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-teal-50 text-teal-800 font-bold text-[11px] border border-teal-200/60">
                                        {val}
                                      </span>
                                    ) : (
                                      <span className="text-slate-400">—</span>
                                    )}
                                  </td>
                                );
                              }
                              if (colId === 'loanAmount') {
                                const lVal = Number(r.loanAmount) || 0;
                                return (
                                  <td key={colId} className="py-2 px-3 border-r border-slate-200 text-right font-mono font-medium text-slate-800 whitespace-nowrap">
                                    {lVal > 0 ? formatCurrency(lVal) : '—'}
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
                              if (colId === 'isReversed') {
                                return (
                                  <td key={colId} className="py-2 px-3 border-r border-slate-200 text-center whitespace-nowrap">
                                    <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                      r.isReversed ? 'bg-rose-100 text-rose-800 border-rose-200' : 'bg-emerald-100 text-emerald-800 border-emerald-200'
                                    }`}>
                                      {r.isReversed ? 'Reversed' : 'Active'}
                                    </span>
                                  </td>
                                );
                              }
                              if (colId === 'reversalReason') {
                                return (
                                  <td key={colId} className="py-2 px-3 border-r border-slate-200 text-xs text-slate-600 max-w-xs truncate" title={r.reversalReason}>
                                    {r.reversalReason || '—'}
                                  </td>
                                );
                              }
                              if (colId === 'reversalDate') {
                                return (
                                  <td key={colId} className="py-2 px-3 border-r border-slate-200 text-xs text-slate-600 whitespace-nowrap">
                                    {r.reversalDate ? formatDate(r.reversalDate) : '—'}
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
                              if (colId === 'actions') {
                                return (
                                  <td key={colId} className="py-2 px-3 text-center whitespace-nowrap">
                                    <div className="flex items-center justify-center gap-1.5">
                                      <button
                                        type="button"
                                        onClick={() => openEditAllocationsModal(r)}
                                        className="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-[11px] transition-colors inline-flex items-center gap-1 border border-indigo-200/70 cursor-pointer shadow-2xs"
                                        title="Edit & select months paid for and amounts for each month"
                                      >
                                        <Calendar className="w-3 h-3 text-indigo-600" />
                                        <span>Months & Amounts</span>
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setEditingFullPaymentReceiptId(r._id)}
                                        className="px-2.5 py-1 rounded-lg bg-teal-50 hover:bg-teal-100 text-teal-700 font-bold text-[11px] transition-colors inline-flex items-center gap-1 border border-teal-200/60 cursor-pointer shadow-2xs"
                                        title="Edit payment receipt in Edit Month / Payment screen"
                                      >
                                        <Edit2 className="w-3 h-3 text-teal-600" />
                                        <span>Edit</span>
                                      </button>
                                    </div>
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

      {/* MODAL: EDIT MONTHS PAID FOR & AMOUNTS (UNDER LEASE CONTRACT) */}
      {editingAllocReceipt && (
        <div className="fixed inset-0 z-60 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden my-auto flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-indigo-700 to-indigo-900 px-5 py-4 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="p-2.5 rounded-xl bg-white/10 backdrop-blur-xs text-white shrink-0">
                  <Calendar className="w-5 h-5 text-indigo-200" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-extrabold text-base text-white">Edit Months Paid For & Amounts</h3>
                    <span className="px-2 py-0.5 rounded-md bg-white/20 text-indigo-100 font-mono font-bold text-xs">
                      {editingAllocReceipt.receiptNumber}
                    </span>
                  </div>
                  <p className="text-xs text-indigo-200 truncate mt-0.5">
                    Tenant: <strong className="text-white">{editingAllocReceipt.tenantId?.name || selectedContract?.tenantId?.name}</strong> • Contract: <strong className="text-white">{selectedContract?.contractNo || editingAllocReceipt.contractNo}</strong>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingAllocReceipt(null)}
                className="p-1.5 rounded-lg text-indigo-200 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-4 text-xs">
              {allocError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{allocError}</span>
                </div>
              )}

              {/* Financial Summary & Balance Banner */}
              {(() => {
                const totalAlloc = allocRows.reduce((sum, r) => sum + (Number(r.allocatedAmount) || 0), 0);
                const originalRent = Number(editingAllocReceipt.rentAmount !== undefined ? editingAllocReceipt.rentAmount : (editingAllocReceipt.totalAmount || 0));
                const diff = originalRent - totalAlloc;
                const isBalanced = Math.abs(diff) < 0.01;

                return (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
                    <div className="space-y-0.5">
                      <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">Receipt Rent Total</span>
                      <span className="text-base font-extrabold text-slate-900 font-mono">
                        {formatCurrency(originalRent)}
                      </span>
                    </div>

                    <div className="space-y-0.5">
                      <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">Total Allocated Across Months</span>
                      <span className="text-base font-extrabold text-indigo-700 font-mono">
                        {formatCurrency(totalAlloc)}
                      </span>
                    </div>

                    <div className="space-y-0.5">
                      <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">Allocation Status</span>
                      {isBalanced ? (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          Balanced
                        </span>
                      ) : diff > 0 ? (
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-amber-700">
                            {formatCurrency(diff)} unallocated
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              if (allocRows.length > 0) {
                                const lastId = allocRows[allocRows.length - 1].id;
                                setAllocRows(prev => prev.map(r => r.id === lastId ? { ...r, allocatedAmount: String((Number(r.allocatedAmount) || 0) + diff) } : r));
                              }
                            }}
                            className="px-1.5 py-0.5 rounded bg-amber-100 hover:bg-amber-200 text-amber-900 text-[10px] font-bold cursor-pointer"
                            title="Add remaining amount to last month"
                          >
                            + Add to Last
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-rose-700">
                            +{formatCurrency(-diff)} exceeds total
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingAllocReceipt(prev => ({
                                ...prev,
                                rentAmount: totalAlloc,
                                totalAmount: totalAlloc + (Number(prev?.depositAmount) || 0)
                              }));
                            }}
                            className="px-1.5 py-0.5 rounded bg-indigo-100 hover:bg-indigo-200 text-indigo-900 text-[10px] font-bold cursor-pointer"
                            title="Update receipt total rent to match allocated sum"
                          >
                            Sync Total
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* Quick Helper Tools */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 pb-1">
                <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-indigo-600" />
                  <span>Months Paid For ({allocRows.length}):</span>
                </span>

                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={handleSplitEvenly}
                    className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-[11px] transition-colors inline-flex items-center gap-1 cursor-pointer"
                    title="Split total rent evenly across all selected months"
                  >
                    <Split className="w-3 h-3 text-slate-500" />
                    <span>Split Evenly</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleFillContractRate}
                    className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-[11px] transition-colors inline-flex items-center gap-1 cursor-pointer"
                    title="Set amount for each month to contract's monthly rate"
                  >
                    <span>Fill Rate ({formatCurrency(Number(selectedContract?.currentAgreement?.monthlyRate ?? selectedContract?.currentMonthlyRate ?? selectedContract?.unitId?.monthlyRentExpected ?? 22000))})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleAddAllocMonth()}
                    className="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-[11px] transition-colors inline-flex items-center gap-1 border border-indigo-200/60 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Add Month</span>
                  </button>
                </div>
              </div>

              {/* Month-by-month rows */}
              <div className="space-y-2 border border-slate-200 rounded-xl p-3 bg-slate-50/50 max-h-60 overflow-y-auto">
                {allocRows.map((row, idx) => {
                  const mFormatted = /^\d{4}-\d{2}$/.test(row.rentMonthYear) ? formatMonthYear(row.rentMonthYear) : row.rentMonthYear;
                  return (
                    <div key={row.id} className="flex items-center gap-3 p-2 bg-white rounded-lg border border-slate-200 shadow-2xs hover:border-indigo-300 transition-colors">
                      <span className="text-slate-400 font-bold text-[11px] w-5 text-center shrink-0">
                        {idx + 1}.
                      </span>

                      {/* Month input / selector */}
                      <div className="flex-1 min-w-0">
                        <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-0.5">
                          Month Paid For
                        </label>
                        <div className="flex items-center gap-1.5">
                          <input
                            type="month"
                            value={row.rentMonthYear}
                            onChange={(e) => handleUpdateAllocMonth(row.id, e.target.value)}
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
                          />
                          <span className="text-[11px] font-bold text-indigo-800 bg-indigo-50 px-2 py-1 rounded-md border border-indigo-100 whitespace-nowrap shrink-0">
                            {mFormatted}
                          </span>
                        </div>
                      </div>

                      {/* Amount input */}
                      <div className="w-36 shrink-0">
                        <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-0.5">
                          Amount (₹)
                        </label>
                        <div className="relative">
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold">₹</span>
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={row.allocatedAmount}
                            onChange={(e) => handleUpdateAllocAmount(row.id, e.target.value)}
                            className="w-full pl-6 pr-2 py-1.5 rounded-lg border border-slate-200 text-xs font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white text-right"
                            placeholder="0"
                          />
                        </div>
                      </div>

                      {/* Delete row */}
                      <div className="pt-4 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleRemoveAllocMonth(row.id)}
                          disabled={allocRows.length <= 1}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors disabled:opacity-30 cursor-pointer"
                          title="Remove this month"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Contract Months Quick-Add Suggestions */}
              {contractTermMonths.length > 0 && (
                <div className="pt-1">
                  <span className="text-[11px] font-semibold text-slate-500 block mb-1.5">
                    Quick-Add Contract Term Month:
                  </span>
                  <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto">
                    {contractTermMonths.map(ym => {
                      const alreadyAdded = allocRows.some(r => r.rentMonthYear === ym);
                      return (
                        <button
                          key={ym}
                          type="button"
                          disabled={alreadyAdded}
                          onClick={() => handleAddAllocMonth(ym)}
                          className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition-all ${
                            alreadyAdded
                              ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed opacity-60'
                              : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 cursor-pointer hover:shadow-2xs'
                          }`}
                        >
                          {alreadyAdded ? '✓ ' : '+ '}{formatMonthYear(ym)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Accounting Month Field */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block">
                    Receipt Accounting Month
                  </label>
                  <p className="text-[11px] text-slate-500">
                    Primary accounting month when this payment was recorded in financial reports
                  </p>
                </div>
                <input
                  type="month"
                  value={allocAccountingMonth}
                  onChange={(e) => setAllocAccountingMonth(e.target.value)}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div className="bg-slate-50 px-5 py-3 border-t border-slate-200 flex items-center justify-between shrink-0">
              <button
                type="button"
                onClick={() => setEditingAllocReceipt(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-200 transition-colors cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={allocSaving}
                onClick={handleSaveAllocations}
                className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md shadow-indigo-600/20 disabled:opacity-50 transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>{allocSaving ? 'Saving...' : 'Save Months & Amounts'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FULL PAYMENT EDIT MODAL OVERLAY IN CONTRACTS VIEW */}
      {editingFullPaymentReceiptId && (
        <PaymentEditModal
          isOpen={Boolean(editingFullPaymentReceiptId)}
          onClose={() => setEditingFullPaymentReceiptId(null)}
          receiptId={editingFullPaymentReceiptId}
          tenants={tenants}
          assignments={contracts}
          backButtonLabel="Back to Contract"
          onSuccess={async () => {
            setEditingFullPaymentReceiptId(null);
            await fetchContractReceipts(selectedContract);
            fetchData();
          }}
        />
      )}
    </div>
  );
}
