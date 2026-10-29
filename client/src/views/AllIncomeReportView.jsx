import React, { useState, useEffect, useMemo } from 'react';
import API from '../services/api';
import * as XLSX from 'xlsx';
import { formatCurrency, formatDate, formatMonthYear } from '../utils/formatters';
import ApexToolbar from '../components/ApexToolbar';
import {
  getHeaderDragProps,
  useResizableColumns,
  ResizeHandle,
  useFrozenColumns,
  getFrozenColumnStyle
} from '../components/ColumnManager';
import { cycleThreeStateSort, evaluateFilterRule, sortDataRows, extractUniqueValues } from '../utils/tableUtils';
import { pushDrilldown, navigateToTab } from '../utils/navigationHistory';
import PaymentEditModal from '../components/PaymentEditModal';
import {
  Receipt,
  TrendingUp,
  Search,
  Calendar,
  CreditCard,
  Edit2,
  X,
  Check,
  Download,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  Building2,
  User,
  Hash,
  Layers,
  Phone,
  FileSpreadsheet,
  Filter,
  GripVertical,
  RotateCcw
} from 'lucide-react';

const ALL_INCOME_COLUMNS_DEF = [
  { id: 'index', label: '#', defaultVisible: true },
  { id: 'receiptDate', label: 'Receipt Date', defaultVisible: true },
  { id: 'accountingMonth', label: 'Accounting Month', defaultVisible: true },
  { id: 'receiptNumber', label: 'Receipt #', defaultVisible: true },
  { id: 'contractNo', label: 'Contract #', defaultVisible: true },
  { id: 'contractType', label: 'Contract Type', defaultVisible: true },
  { id: 'property', label: 'Property', defaultVisible: true },
  { id: 'propertyCode', label: 'Property Code', defaultVisible: false },
  { id: 'propertyType', label: 'Property Type', defaultVisible: false },
  { id: 'propertyAddress', label: 'Property Address', defaultVisible: false },
  { id: 'city', label: 'City', defaultVisible: false },
  { id: 'ownerOrResponsiblePerson', label: 'Property Owner', defaultVisible: false },
  { id: 'unit', label: 'Sub-Property / Partition', defaultVisible: true },
  { id: 'unitCode', label: 'Unit Code', defaultVisible: false },
  { id: 'subUnitArea', label: 'Partition Area (Sq Ft)', defaultVisible: false },
  { id: 'carpetAreaSqFt', label: 'Carpet Area (Sq Ft)', defaultVisible: false },
  { id: 'floor', label: 'Floor / Location', defaultVisible: false },
  { id: 'unitType', label: 'Unit Type', defaultVisible: false },
  { id: 'occupancyStatus', label: 'Occupancy Status', defaultVisible: false },
  { id: 'legacySheetCode', label: 'Legacy Sheet Code', defaultVisible: false },
  { id: 'tenant', label: 'Tenant', defaultVisible: true },
  { id: 'tenantCode', label: 'Tenant Code', defaultVisible: false },
  { id: 'phone', label: 'Phone', defaultVisible: false },
  { id: 'email', label: 'Email', defaultVisible: false },
  { id: 'tenantType', label: 'Tenant Type', defaultVisible: false },
  { id: 'idProofType', label: 'ID Proof Type', defaultVisible: false },
  { id: 'idProofNumber', label: 'ID Proof Number', defaultVisible: false },
  { id: 'tenantAddress', label: 'Tenant Address', defaultVisible: false },
  { id: 'emergencyContact', label: 'Emergency Contact', defaultVisible: false },
  { id: 'status', label: 'Status', defaultVisible: true },
  { id: 'monthlyRentExpected', label: 'Monthly Rent (₹)', defaultVisible: true },
  { id: 'monthsCovered', label: 'Month Paid For', defaultVisible: true },
  { id: 'rentAmount', label: 'Rent Amount Paid (₹)', defaultVisible: true },
  { id: 'depositAmount', label: 'Deposit Amount (₹)', defaultVisible: true },
  { id: 'totalAmount', label: 'Total Amount Paid (₹)', defaultVisible: true },
  { id: 'outstanding', label: 'Outstanding Due (₹)', defaultVisible: true },
  { id: 'adjustmentAmount', label: 'Adjustment (+/-) (₹)', defaultVisible: true },
  { id: 'adjustedOutstanding', label: 'Adjusted Outstanding (₹)', defaultVisible: true },
  { id: 'adjustmentDescription', label: 'Adjustment Reason', defaultVisible: false },
  { id: 'paidUpTo', label: 'Paid Up To', defaultVisible: true },
  { id: 'deposit', label: 'Security Deposit Held (₹)', defaultVisible: false },
  { id: 'loanAmount', label: 'Loan Amount (₹)', defaultVisible: true },
  { id: 'comments', label: 'Notes / Comments', defaultVisible: true },
  { id: 'isReversed', label: 'Reversal Status', defaultVisible: false },
  { id: 'reversalReason', label: 'Reversal Reason', defaultVisible: false },
  { id: 'reversalDate', label: 'Reversal Date', defaultVisible: false },
  { id: 'createdAt', label: 'Created Date', defaultVisible: false },
  { id: 'updatedAt', label: 'Modified Date', defaultVisible: false },
  { id: 'actions', label: 'Action', defaultVisible: true },
];

const DEFAULT_INCOME_COLS = [
  'index',
  'receiptDate',
  'accountingMonth',
  'receiptNumber',
  'contractNo',
  'contractType',
  'property',
  'unit',
  'tenant',
  'status',
  'monthlyRentExpected',
  'monthsCovered',
  'rentAmount',
  'depositAmount',
  'totalAmount',
  'outstanding',
  'adjustmentAmount',
  'adjustedOutstanding',
  'paidUpTo',
  'loanAmount',
  'comments',
  'actions'
];

const DEFAULT_INCOME_COLUMN_WIDTHS = {
  index: 50,
  receiptDate: 110,
  accountingMonth: 140,
  receiptNumber: 130,
  contractNo: 120,
  contractType: 120,
  property: 160,
  propertyCode: 120,
  propertyType: 140,
  propertyAddress: 180,
  city: 100,
  ownerOrResponsiblePerson: 130,
  unit: 140,
  unitCode: 110,
  subUnitArea: 130,
  carpetAreaSqFt: 130,
  floor: 110,
  unitType: 130,
  occupancyStatus: 120,
  legacySheetCode: 120,
  tenant: 150,
  tenantCode: 120,
  phone: 120,
  email: 160,
  tenantType: 120,
  idProofType: 120,
  idProofNumber: 130,
  tenantAddress: 180,
  emergencyContact: 150,
  status: 95,
  monthlyRentExpected: 130,
  monthsCovered: 150,
  rentAmount: 130,
  depositAmount: 120,
  totalAmount: 130,
  outstanding: 135,
  adjustmentAmount: 130,
  adjustedOutstanding: 140,
  adjustmentDescription: 180,
  paidUpTo: 110,
  deposit: 130,
  loanAmount: 120,
  comments: 180,
  isReversed: 120,
  reversalReason: 150,
  reversalDate: 120,
  createdAt: 120,
  updatedAt: 120,
  actions: 85
};


// Helper to extract formatted backend values for any column ID
const getIncomeFieldVal = (r, colId) => {
  if (!r) return '';
  switch (colId) {
    case 'index': return '';
    case 'receiptDate': return r.receiptDate ? formatDate(r.receiptDate) : '';
    case 'accountingMonth': {
      const m = r.accountingMonth || (r.receiptDate ? new Date(r.receiptDate).toISOString().slice(0, 7) : '');
      return m ? formatMonthYear(m) : '';
    }
    case 'receiptNumber': return r.receiptNumber || '';
    case 'contractNo': return r.contractNo || '';
    case 'contractType': return r.contractType || 'Rent';
    case 'property': return r.unitId?.propertyId?.name || '';
    case 'propertyCode': return r.unitId?.propertyId?.propertyCode || '';
    case 'propertyType': return r.unitId?.propertyId?.propertyType || '';
    case 'propertyAddress': return typeof r.unitId?.propertyId?.address === 'string' ? r.unitId.propertyId.address : '';
    case 'city': return r.unitId?.propertyId?.city || '';
    case 'ownerOrResponsiblePerson': return r.unitId?.propertyId?.ownerOrResponsiblePerson || '';
    case 'unit': return r.unitId?.subUnitPartition || r.unitId?.unitName || '';
    case 'unitCode': return r.unitId?.unitCode || '';
    case 'subUnitArea': return r.unitId?.areaSqFt ? `${r.unitId.areaSqFt} sq ft` : '';
    case 'carpetAreaSqFt': return r.unitId?.carpetAreaSqFt ? `${r.unitId.carpetAreaSqFt} sq ft` : '';
    case 'floor': return r.unitId?.floor || '';
    case 'unitType': return r.unitId?.unitType || '';
    case 'monthlyRentExpected': return Number(r.monthlyRentExpected ?? (r.unitId?.monthlyRentExpected || 0)) || 0;
    case 'occupancyStatus': return r.unitId?.occupancyStatus || '';
    case 'legacySheetCode': return r.unitId?.legacySheetCode || '';
    case 'tenant': return r.tenantId?.name || '';
    case 'tenantCode': return r.tenantId?.tenantCode || '';
    case 'phone': return r.tenantId?.phone || '';
    case 'email': return r.tenantId?.email || '';
    case 'tenantType': return r.tenantId?.tenantType || '';
    case 'idProofType': return r.tenantId?.idProofType || '';
    case 'idProofNumber': return r.tenantId?.idProofNumber || '';
    case 'tenantAddress': return r.tenantId?.address || '';
    case 'emergencyContact': return `${r.tenantId?.emergencyContactName || ''} ${r.tenantId?.emergencyContactPhone ? `(${r.tenantId.emergencyContactPhone})` : ''}`.trim();
    case 'deposit': return Number(r.deposit ?? (r.tenantId?.deposit || 0)) || 0;
    case 'monthsCovered': {
      const rawM = r.monthsCovered || (r.allocations && r.allocations.map(a => a.rentMonthYear).join(', ')) || '';
      return rawM ? rawM.split(',').map(m => formatMonthYear(m.trim())).join(', ') : '';
    }
    case 'status': return r.status || 'Rented';
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

export default function AllIncomeReportView() {
  const [receipts, setReceipts] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [properties, setProperties] = useState([]);
  const [units, setUnits] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);

  // APEX Toolbar & table state
  const [search, setSearch] = useState(() => localStorage.getItem('income_report_search') || '');
  useEffect(() => { localStorage.setItem('income_report_search', search); }, [search]);

  const [sortConfig, setSortConfig] = useState({ key: 'receiptDate', direction: 'desc' });
  const [activeFilters, setActiveFilters] = useState([]);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [currentPage, setCurrentPage] = useState(1);
  const [isHeaderSticky, setIsHeaderSticky] = useState(true);

  // Top Filter Panel State (From/To Accounting Month, Property, Sub-Property, Tenant)
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
  const [incomeFilters, setIncomeFilters] = useState(() => {
    try {
      const saved = localStorage.getItem('income_top_filters_v2');
      if (saved) return JSON.parse(saved);
    } catch {}
    return {
      fromAccountingMonth: '',
      toAccountingMonth: '',
      propertyId: '',
      unitId: '',
      tenantId: ''
    };
  });

  useEffect(() => {
    try {
      localStorage.setItem('income_top_filters_v2', JSON.stringify(incomeFilters));
    } catch {}
  }, [incomeFilters]);

  const clearAllFilters = () => {
    setIncomeFilters({
      fromAccountingMonth: '',
      toAccountingMonth: '',
      propertyId: '',
      unitId: '',
      tenantId: ''
    });
    setCurrentPage(1);
  };

  // Draggable top filter cards layout customization
  const DEFAULT_INCOME_FILTER_ORDER = useMemo(() => ['fromMonth', 'toMonth', 'property', 'partition', 'tenant'], []);
  const [filterCardsOrder, setFilterCardsOrder] = useState(() => {
    try {
      const saved = localStorage.getItem('income_filter_cards_order');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length === 5) {
          return parsed;
        }
      }
    } catch {}
    return ['fromMonth', 'toMonth', 'property', 'partition', 'tenant'];
  });

  const [draggedCardKey, setDraggedCardKey] = useState(null);
  const [dragOverCardKey, setDragOverCardKey] = useState(null);

  const handleCardDragStart = (e, cardKey) => {
    setDraggedCardKey(cardKey);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleCardDragOver = (e, cardKey) => {
    e.preventDefault();
    if (cardKey !== dragOverCardKey) {
      setDragOverCardKey(cardKey);
    }
  };

  const handleCardDrop = (e, targetCardKey) => {
    e.preventDefault();
    if (!draggedCardKey || draggedCardKey === targetCardKey) {
      setDraggedCardKey(null);
      setDragOverCardKey(null);
      return;
    }
    const current = [...filterCardsOrder];
    const fromIdx = current.indexOf(draggedCardKey);
    const toIdx = current.indexOf(targetCardKey);
    if (fromIdx !== -1 && toIdx !== -1) {
      current.splice(fromIdx, 1);
      current.splice(toIdx, 0, draggedCardKey);
      setFilterCardsOrder(current);
      try {
        localStorage.setItem('income_filter_cards_order', JSON.stringify(current));
      } catch {}
    }
    setDraggedCardKey(null);
    setDragOverCardKey(null);
  };

  const resetFilterCardsOrder = () => {
    setFilterCardsOrder(['fromMonth', 'toMonth', 'property', 'partition', 'tenant']);
    try {
      localStorage.removeItem('income_filter_cards_order');
    } catch {}
  };

  const activeCustomFilterCount = useMemo(() => {
    return [
      incomeFilters.fromAccountingMonth,
      incomeFilters.toAccountingMonth,
      incomeFilters.propertyId,
      incomeFilters.unitId,
      incomeFilters.tenantId
    ].filter(Boolean).length;
  }, [incomeFilters]);

  // Column management & widths
  const [visibleColumns, setVisibleColumns] = useState(() => {
    const saved = localStorage.getItem('cols_all_income_v2');
    if (!saved) return DEFAULT_INCOME_COLS;
    try {
      const allowed = ALL_INCOME_COLUMNS_DEF.map(c => c.id);
      let parsed = JSON.parse(saved).filter(c => allowed.includes(c));
      if (parsed.length > 0) {
        ['contractType', 'monthlyRentExpected', 'outstanding', 'adjustmentAmount', 'adjustedOutstanding', 'paidUpTo', 'loanAmount'].forEach(col => {
          if (!parsed.includes(col)) {
            const tIdx = parsed.indexOf('totalAmount');
            if (tIdx !== -1) parsed.splice(tIdx + 1, 0, col);
            else parsed.push(col);
          }
        });
        return parsed;
      }
      return DEFAULT_INCOME_COLS;
    } catch {
      return DEFAULT_INCOME_COLS;
    }
  });

  const {
    columnWidths,
    handleResizeStart,
    resetColumnWidths
  } = useResizableColumns('all_income_v2', DEFAULT_INCOME_COLUMN_WIDTHS);

  const [frozenColumnCount, setFrozenColumnCount] = useFrozenColumns('all_income_v2', 0);

  const [outstandingSummary, setOutstandingSummary] = useState([]);

  // Full Payment Edit Modal state (in-place)
  const [editingPaymentModalReceiptId, setEditingPaymentModalReceiptId] = useState(null);

  // Edit Receipt Modal
  const [editingReceipt, setEditingReceipt] = useState(null);
  const [editForm, setEditForm] = useState({
    receiptNumber: '',
    receiptDate: '',
    rentMonthYear: '',
    propertyId: '',
    unitId: '',
    tenantId: '',
    contractNo: '',
    customContractNo: '',
    isCustomContract: false,
    status: 'Rented',
    totalAmount: '',
    comments: ''
  });
  const [savingReceipt, setSavingReceipt] = useState(false);

  const fetchIncomeData = async () => {
    try {
      setLoading(true);
      const [pRes, tRes, propRes, uRes, aRes, oRes] = await Promise.all([
        API.get('/payments'),
        API.get('/tenants'),
        API.get('/properties'),
        API.get('/units'),
        API.get('/assignments'),
        API.get('/payments/outstanding-summary').catch(() => ({ data: { success: false } }))
      ]);
      if (pRes.data?.success) setReceipts(pRes.data.data || []);
      if (tRes.data?.success) setTenants(tRes.data.data || []);
      if (propRes.data?.success) setProperties(propRes.data.data || []);
      if (uRes.data?.success) setUnits(uRes.data.data || []);
      if (aRes.data?.success) setAssignments(aRes.data.data || []);
      if (oRes?.data?.success) setOutstandingSummary(oRes.data.data || []);
    } catch (err) {
      console.error('Failed to load income data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIncomeData();
  }, []);

  const handleHeaderSort = (colId) => {
    if (colId === 'actions' || colId === 'index') return;
    setSortConfig(prev => cycleThreeStateSort(prev, colId));
  };

  // Enriched receipts with full details from assignments & outstandingSummary
  const enrichedReceipts = useMemo(() => {
    const assignByContract = new Map();
    const assignByUnitTenant = new Map();
    assignments.forEach(a => {
      if (a.contractNo) assignByContract.set(String(a.contractNo).trim().toLowerCase(), a);
      if (a.assignmentCode) assignByContract.set(String(a.assignmentCode).trim().toLowerCase(), a);
      const uId = String(a.unitId?._id || a.unitId || '');
      const tId = String(a.tenantId?._id || a.tenantId || '');
      if (uId && tId) assignByUnitTenant.set(`${uId}_${tId}`, a);
    });

    const summaryByContract = new Map();
    const summaryByUnitTenant = new Map();
    outstandingSummary.forEach(s => {
      if (s.contractNo) summaryByContract.set(String(s.contractNo).trim().toLowerCase(), s);
      const uId = String(s.unit?._id || s.unit || '');
      const tId = String(s.tenant?._id || s.tenant || '');
      if (uId && tId) summaryByUnitTenant.set(`${uId}_${tId}`, s);
    });

    return receipts.map(r => {
      const uId = String(r.unitId?._id || r.unitId || '');
      const tId = String(r.tenantId?._id || r.tenantId || '');
      const cNo = (r.contractNo || '').trim().toLowerCase();

      const assign = (cNo ? assignByContract.get(cNo) : null) || (uId && tId ? assignByUnitTenant.get(`${uId}_${tId}`) : null);
      const summary = (cNo ? summaryByContract.get(cNo) : null) || (uId && tId ? summaryByUnitTenant.get(`${uId}_${tId}`) : null);

      const contractType = r.contractType || assign?.contractType || summary?.contractType || 'Rent';
      const monthlyRentExpected = Number(r.monthlyRentExpected ?? (summary?.monthlyRentExpected ?? (assign?.monthlyRent || assign?.rentAmount || r.unitId?.monthlyRentExpected || 0))) || 0;
      const outstanding = Number(r.outstanding !== undefined ? r.outstanding : (summary?.totalOutstanding || 0));
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

      const loanAmount = Number(r.loanAmount !== undefined ? r.loanAmount : (assign?.loanAmount || 0));

      return {
        ...r,
        contractType,
        monthlyRentExpected,
        outstanding,
        adjustmentAmount,
        adjustmentDescription,
        adjustedOutstanding,
        paidUpTo: paidUpTo || '—',
        loanAmount
      };
    });
  }, [receipts, assignments, outstandingSummary]);

  const filterSuggestions = useMemo(() => {
    return {
      accountingMonth: extractUniqueValues(enrichedReceipts, r => {
        const m = r.accountingMonth || (r.receiptDate ? new Date(r.receiptDate).toISOString().slice(0, 7) : '');
        return m ? formatMonthYear(m) : '';
      }),
      receiptNumber: extractUniqueValues(enrichedReceipts, r => r.receiptNumber),
      contractNo: extractUniqueValues(enrichedReceipts, r => r.contractNo),
      contractType: ['Rent', 'Business'],
      property: extractUniqueValues(enrichedReceipts, r => r.unitId?.propertyId?.name),
      propertyCode: extractUniqueValues(enrichedReceipts, r => r.unitId?.propertyId?.propertyCode),
      propertyType: extractUniqueValues(enrichedReceipts, r => r.unitId?.propertyId?.propertyType),
      city: extractUniqueValues(enrichedReceipts, r => r.unitId?.propertyId?.city),
      unit: extractUniqueValues(enrichedReceipts, r => r.unitId?.subUnitPartition || r.unitId?.unitName),
      unitCode: extractUniqueValues(enrichedReceipts, r => r.unitId?.unitCode),
      unitType: extractUniqueValues(enrichedReceipts, r => r.unitId?.unitType),
      floor: extractUniqueValues(enrichedReceipts, r => r.unitId?.floor),
      occupancyStatus: extractUniqueValues(enrichedReceipts, r => r.unitId?.occupancyStatus),
      tenant: extractUniqueValues(enrichedReceipts, r => r.tenantId?.name),
      tenantCode: extractUniqueValues(enrichedReceipts, r => r.tenantId?.tenantCode),
      phone: extractUniqueValues(enrichedReceipts, r => r.tenantId?.phone),
      email: extractUniqueValues(enrichedReceipts, r => r.tenantId?.email),
      tenantType: extractUniqueValues(enrichedReceipts, r => r.tenantId?.tenantType),
      status: ['Rented', 'Vacant'],
      monthsCovered: extractUniqueValues(enrichedReceipts, r => r.monthsCovered),
      paidUpTo: extractUniqueValues(enrichedReceipts, r => r.paidUpTo),
      adjustmentDescription: extractUniqueValues(enrichedReceipts, r => r.adjustmentDescription),
      isReversed: ['Active', 'Reversed'],
      comments: extractUniqueValues(enrichedReceipts, r => r.comments)
    };
  }, [enrichedReceipts]);

  // Available accounting months collected from receipts & default calendar years
  const availableAccountingMonths = useMemo(() => {
    const set = new Set();
    receipts.forEach(r => {
      const m = r.accountingMonth || (r.receiptDate ? new Date(r.receiptDate).toISOString().slice(0, 7) : '');
      if (m && /^\d{4}-\d{2}$/.test(m)) set.add(m);
    });
    ['2024', '2025', '2026'].forEach(yr => {
      for (let i = 1; i <= 12; i++) {
        set.add(`${yr}-${String(i).padStart(2, '0')}`);
      }
    });
    return Array.from(set).sort().reverse();
  }, [receipts]);

  // Unit options dynamically filtered by selected property (if property is chosen)
  const filterUnitOptions = useMemo(() => {
    if (!incomeFilters.propertyId) return units;
    return units.filter(u => String(u.propertyId?._id || u.propertyId) === String(incomeFilters.propertyId));
  }, [units, incomeFilters.propertyId]);

  // Filtering & Sorting
  const processedReceipts = useMemo(() => {
    let rows = [...enrichedReceipts];

    // 0. Custom Top Filter Panel (From/To Accounting Month, Property, Sub-Property/Partition, Tenant)
    if (incomeFilters.fromAccountingMonth) {
      rows = rows.filter(r => {
        const m = r.accountingMonth || (r.receiptDate ? new Date(r.receiptDate).toISOString().slice(0, 7) : '');
        return m >= incomeFilters.fromAccountingMonth;
      });
    }
    if (incomeFilters.toAccountingMonth) {
      rows = rows.filter(r => {
        const m = r.accountingMonth || (r.receiptDate ? new Date(r.receiptDate).toISOString().slice(0, 7) : '');
        return m <= incomeFilters.toAccountingMonth;
      });
    }
    if (incomeFilters.propertyId) {
      rows = rows.filter(r => {
        const pId = String(r.unitId?.propertyId?._id || r.unitId?.propertyId || '');
        return pId === String(incomeFilters.propertyId);
      });
    }
    if (incomeFilters.unitId) {
      rows = rows.filter(r => {
        const uId = String(r.unitId?._id || r.unitId || '');
        return uId === String(incomeFilters.unitId);
      });
    }
    if (incomeFilters.tenantId) {
      rows = rows.filter(r => {
        const tId = String(r.tenantId?._id || r.tenantId || '');
        return tId === String(incomeFilters.tenantId);
      });
    }

    // 1. Text Search across all visible data
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      rows = rows.filter(r => {
        const rNo = (r.receiptNumber || '').toLowerCase();
        const cNo = (r.contractNo || '').toLowerCase();
        const cType = (r.contractType || '').toLowerCase();
        const prop = (r.unitId?.propertyId?.name || '').toLowerCase();
        const unit = (r.unitId?.subUnitPartition || r.unitId?.unitName || '').toLowerCase();
        const ten = (r.tenantId?.name || '').toLowerCase();
        const phone = (r.tenantId?.phone || '').toLowerCase();
        const stat = (r.status || 'Rented').toLowerCase();
        const comm = (r.comments || '').toLowerCase();
        const months = (r.monthsCovered || '').toLowerCase();
        const amt = String(r.totalAmount || '');
        const ref = (r.referenceNumber || r.receiptNumber || '').toLowerCase();
        const adjDesc = (r.adjustmentDescription || '').toLowerCase();
        const pUpTo = (r.paidUpTo || '').toLowerCase();

        return (
          rNo.includes(q) ||
          cNo.includes(q) ||
          cType.includes(q) ||
          prop.includes(q) ||
          unit.includes(q) ||
          ten.includes(q) ||
          phone.includes(q) ||
          stat.includes(q) ||
          ref.includes(q) ||
          comm.includes(q) ||
          months.includes(q) ||
          amt.includes(q) ||
          adjDesc.includes(q) ||
          pUpTo.includes(q)
        );
      });
    }

    // 2. APEX Structured Filters (supports all backend columns)
    if (activeFilters.length > 0) {
      rows = rows.filter(r => {
        return activeFilters.every(flt => {
          const cellVal = getIncomeFieldVal(r, flt.column);
          return evaluateFilterRule(cellVal, flt.operator, flt.value);
        });
      });
    }

    // 3. Sorting (supports all backend columns)
    if (sortConfig.key) {
      rows = sortDataRows(rows, sortConfig, (item, key) => {
        if (['totalAmount', 'rentAmount', 'depositAmount', 'adjustmentAmount', 'deposit', 'monthlyRentExpected', 'outstanding', 'adjustedOutstanding', 'loanAmount'].includes(key)) {
          return Number(getIncomeFieldVal(item, key)) || 0;
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
        return getIncomeFieldVal(item, key);
      });
    }

    return rows;
  }, [enrichedReceipts, search, activeFilters, sortConfig, incomeFilters]);

  // Pagination
  const totalPages = rowsPerPage === 'All' ? 1 : Math.ceil(processedReceipts.length / Number(rowsPerPage));
  const paginatedReceipts = useMemo(() => {
    if (rowsPerPage === 'All') return processedReceipts;
    const start = (currentPage - 1) * Number(rowsPerPage);
    return processedReceipts.slice(start, start + Number(rowsPerPage));
  }, [processedReceipts, rowsPerPage, currentPage]);

  // Export to Excel with full backend columns support
  const exportToExcel = () => {
    try {
      const exportCols = ALL_INCOME_COLUMNS_DEF.filter(c => c.id !== 'actions' && (visibleColumns.includes(c.id) || visibleColumns.length === 0));
      const dataToExport = processedReceipts.map((r, i) => {
        const row = { '#': i + 1 };
        exportCols.forEach(col => {
          if (col.id === 'index') return;
          const val = getIncomeFieldVal(r, col.id);
          row[col.label] = ['totalAmount', 'rentAmount', 'depositAmount', 'adjustmentAmount', 'deposit', 'monthlyRentExpected', 'outstanding', 'adjustedOutstanding', 'loanAmount'].includes(col.id)
            ? (Number(val) || 0)
            : val;
        });
        return row;
      });

      const ws = XLSX.utils.json_to_sheet(dataToExport);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'All Income');
      XLSX.writeFile(wb, `All_Income_Report_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (err) {
      console.error('Failed to export income to Excel:', err);
      alert('Failed to export Excel.');
    }
  };

  // Navigate directly to Edit Month / Payment screen
  const navigateToEditPayment = (r) => {
    pushDrilldown('reports_all_income', {
      label: 'All Income Report',
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
    // Clear any unit target ID so openFastPaymentModal doesn't override the receipt
    localStorage.removeItem('payments_target_unit_id');

    const tId = r.tenantId?._id || r.tenantId;
    if (tId) {
      localStorage.setItem('payments_target_tenant_id', String(tId));
      localStorage.setItem('payments_tenant_filter', String(tId));
    }
    if (r.contractNo) {
      localStorage.setItem('payments_target_contract_no', String(r.contractNo));
    }
    if (r.monthlyRentExpected) {
      localStorage.setItem('payments_target_monthly_rent', String(r.monthlyRentExpected));
    }
    const pId = r.propertyId?._id || r.propertyId || r.unitId?.propertyId?._id || r.unitId?.propertyId;
    if (pId) {
      localStorage.setItem('payments_prop_filter', String(pId));
    }
    navigateToTab('payments');
  };

  // Open Edit Modal - Single-Value Form for full record editing
  const openEditReceiptModal = (r) => {
    setEditingReceipt(r);
    const allocMonth = r.allocations?.[0]?.rentMonthYear || (r.monthsCovered?.split(',')?.[0]?.trim()) || (r.receiptDate ? new Date(r.receiptDate).toISOString().slice(0, 7) : '');
    const propId = r.unitId?.propertyId?._id || r.unitId?.propertyId || '';
    const uId = r.unitId?._id || r.unitId || '';
    const tId = r.tenantId?._id || r.tenantId || '';
    const cNo = r.contractNo || r.allocations?.[0]?.contractNo || '';

    setEditForm({
      receiptNumber: r.receiptNumber || '',
      receiptDate: r.receiptDate ? new Date(r.receiptDate).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
      rentMonthYear: allocMonth,
      propertyId: propId,
      unitId: uId,
      tenantId: tId,
      contractNo: cNo,
      customContractNo: '',
      isCustomContract: false,
      status: r.status || 'Rented',
      rentAmount: String(r.rentAmount !== undefined ? r.rentAmount : r.totalAmount || 0),
      depositAmount: String(r.depositAmount || 0),
      totalAmount: String(r.totalAmount || 0),
      comments: r.comments || ''
    });
  };

  const availableUnitsForEdit = useMemo(() => {
    if (!editForm.propertyId) return units;
    return units.filter(u => String(u.propertyId?._id || u.propertyId) === String(editForm.propertyId));
  }, [units, editForm.propertyId]);

  // Dynamic contract options filtered strictly by date ranges, tenant, and unit
  const contractOptions = useMemo(() => {
    const targetMonth = editForm.rentMonthYear || (editForm.receiptDate ? editForm.receiptDate.slice(0, 7) : '');
    const tId = String(editForm.tenantId || '');
    const uId = String(editForm.unitId || '');

    // Match assignments for selected tenant / unit
    const relevantContracts = assignments.filter(c => {
      const cTId = String(c.tenantId?._id || c.tenantId || '');
      const cUId = String(c.unitId?._id || c.unitId || '');
      if (tId && cTId !== tId) return false;
      if (uId && cUId !== uId) return false;
      return true;
    });

    const validForDateRange = [];
    const otherPeriods = [];

    relevantContracts.forEach(c => {
      const sMonth = c.startDate ? c.startDate.slice(0, 7) : null;
      const eMonth = c.endDate ? c.endDate.slice(0, 7) : null;

      let inRange = true;
      if (targetMonth) {
        if (sMonth && sMonth > targetMonth) inRange = false;
        if (eMonth && eMonth < targetMonth) inRange = false;
      }

      if (inRange) {
        validForDateRange.push(c);
      } else {
        otherPeriods.push(c);
      }
    });

    return { validForDateRange, otherPeriods, allRelevant: relevantContracts };
  }, [assignments, editForm.tenantId, editForm.unitId, editForm.rentMonthYear, editForm.receiptDate]);

  const handleSaveReceipt = async (e) => {
    e.preventDefault();
    if (!editingReceipt) return;
    try {
      setSavingReceipt(true);
      const targetMonth = editForm.rentMonthYear || editForm.receiptDate.slice(0, 7);
      const depNum = Number(editForm.depositAmount) || 0;
      const rentNum = editForm.rentAmount !== undefined && editForm.rentAmount !== ''
        ? Number(editForm.rentAmount)
        : Math.max(0, (Number(editForm.totalAmount) || 0) - depNum);
      const totalNum = rentNum + depNum;
      const resolvedContractNo = editForm.status === 'Vacant' ? '' : (editForm.isCustomContract
        ? (editForm.customContractNo || editForm.contractNo) : editForm.contractNo);

      const payload = {
        receiptNumber: editForm.receiptNumber.trim(),
        receiptDate: editForm.receiptDate,
        status: editForm.status || 'Rented',
        rentAmount: rentNum,
        depositAmount: depNum,
        totalAmount: totalNum,
        contractNo: resolvedContractNo,
        tenantId: editForm.status === 'Vacant' ? null : (editForm.tenantId || undefined),
        unitId: editForm.unitId || undefined,
        comments: editForm.comments,
        allocations: [
          {
            rentMonthYear: targetMonth,
            allocatedAmount: rentNum,
            contractNo: resolvedContractNo,
            notes: editForm.comments || ''
          }
        ]
      };

      const res = await API.put(`/payments/${editingReceipt._id}`, payload);
      if (res.data?.success) {
        setEditingReceipt(null);
        fetchIncomeData();
      }
    } catch (err) {
      console.error('Failed to update receipt:', err);
      alert(err.response?.data?.message || 'Failed to update payment receipt.');
    } finally {
      setSavingReceipt(false);
    }
  };

  // Summary Metrics
  const totalIncome = useMemo(() => {
    return processedReceipts.reduce((sum, r) => sum + (Number(r.totalAmount) || 0), 0);
  }, [processedReceipts]);

  const grandTotalIncome = useMemo(() => {
    return receipts.reduce((sum, r) => sum + (Number(r.totalAmount) || 0), 0);
  }, [receipts]);

  return (
    <div className="space-y-3">
      {/* Top Header Line with Reports Section, Quick Totals, and Filter Button */}
      <div className="bg-white px-3.5 py-2.5 rounded-xl shadow-xs border border-slate-200">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Left: Reports Section */}
          <div className="flex items-start sm:items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center text-white shadow-xs shrink-0">
              <TrendingUp className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Reports Section</span>
                <span className="text-[9px] font-extrabold px-1.5 py-0.2 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                  {processedReceipts.length} Line{processedReceipts.length !== 1 ? 's' : ''}
                </span>
              </div>
              <h2 className="text-base font-black text-slate-900 tracking-tight leading-tight">All Income</h2>
            </div>
          </div>

          {/* Right: Total Income, Portfolio Grand Total, Filter Button */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200/80 shadow-2xs">
              <span className="text-[9px] text-emerald-700 font-black uppercase tracking-wider block">
                Total Income (Filtered)
              </span>
              <span className="text-xs sm:text-sm font-black text-emerald-800 font-mono">
                {formatCurrency(totalIncome)}
              </span>
            </div>

            <div className="px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 shadow-2xs">
              <span className="text-[9px] text-slate-500 font-black uppercase tracking-wider block">
                Portfolio Grand Total
              </span>
              <span className="text-xs sm:text-sm font-black text-slate-800 font-mono">
                {formatCurrency(grandTotalIncome)}
              </span>
            </div>

            {/* Filter Button */}
            <button
              type="button"
              onClick={() => setIsFilterPanelOpen(!isFilterPanelOpen)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black transition-all shadow-xs cursor-pointer ${
                isFilterPanelOpen || activeCustomFilterCount > 0
                  ? 'bg-emerald-600 text-white shadow-emerald-600/20 hover:bg-emerald-700'
                  : 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200'
              }`}
              title="Toggle Filter Options"
            >
              <Filter className="w-3.5 h-3.5" />
              <span>Filter</span>
              {activeCustomFilterCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-white text-emerald-800 text-[10px] font-black">
                  {activeCustomFilterCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Collapsible Filter Section */}
      {isFilterPanelOpen && (
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm animate-in fade-in duration-150">
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-emerald-600" />
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-800">
                Filter All Income Records
              </h3>
              {activeCustomFilterCount > 0 && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                  {activeCustomFilterCount} active filter{activeCustomFilterCount !== 1 ? 's' : ''}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={resetFilterCardsOrder}
                className="flex items-center gap-1 text-[11px] font-bold text-slate-600 hover:text-slate-800 px-2 py-1 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer border border-slate-200"
                title="Reset filter cards arrangement to default"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset Layout</span>
              </button>
              {activeCustomFilterCount > 0 && (
                <button
                  type="button"
                  onClick={clearAllFilters}
                  className="flex items-center gap-1 text-[11px] font-bold text-rose-600 hover:text-rose-700 px-2.5 py-1 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer border border-rose-200/60"
                  title="Reset all filters"
                >
                  <X className="w-3 h-3" />
                  <span>Reset Filters</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsFilterPanelOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                title="Close Filter Panel"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Draggable Filter Fields Grid: From Month, To Month, Property, Sub Property, Tenant */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {filterCardsOrder.map((cardKey) => {
              const isOver = dragOverCardKey === cardKey && draggedCardKey !== cardKey;
              const isDragging = draggedCardKey === cardKey;

              let label = '';
              let control = null;

              if (cardKey === 'fromMonth') {
                label = 'From Accounting Month';
                control = (
                  <select
                    value={incomeFilters.fromAccountingMonth}
                    onChange={(e) => {
                      setIncomeFilters(prev => ({ ...prev, fromAccountingMonth: e.target.value }));
                      setCurrentPage(1);
                    }}
                    className="w-full px-2 py-1 rounded-lg border border-slate-200 bg-slate-50 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  >
                    <option value="">Any Start Month</option>
                    {availableAccountingMonths.map(m => (
                      <option key={m} value={m}>
                        {formatMonthYear(m)} ({m})
                      </option>
                    ))}
                  </select>
                );
              } else if (cardKey === 'toMonth') {
                label = 'To Accounting Month';
                control = (
                  <select
                    value={incomeFilters.toAccountingMonth}
                    onChange={(e) => {
                      setIncomeFilters(prev => ({ ...prev, toAccountingMonth: e.target.value }));
                      setCurrentPage(1);
                    }}
                    className="w-full px-2 py-1 rounded-lg border border-slate-200 bg-slate-50 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  >
                    <option value="">Any End Month</option>
                    {availableAccountingMonths.map(m => (
                      <option key={m} value={m}>
                        {formatMonthYear(m)} ({m})
                      </option>
                    ))}
                  </select>
                );
              } else if (cardKey === 'property') {
                label = 'Property';
                control = (
                  <select
                    value={incomeFilters.propertyId}
                    onChange={(e) => {
                      const pId = e.target.value;
                      setIncomeFilters(prev => {
                        let newUnitId = prev.unitId;
                        if (newUnitId && pId) {
                          const u = units.find(u => String(u._id) === String(newUnitId));
                          if (u && String(u.propertyId?._id || u.propertyId) !== String(pId)) {
                            newUnitId = '';
                          }
                        }
                        return { ...prev, propertyId: pId, unitId: newUnitId };
                      });
                      setCurrentPage(1);
                    }}
                    className="w-full px-2 py-1 rounded-lg border border-slate-200 bg-slate-50 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 truncate"
                  >
                    <option value="">All Properties</option>
                    {properties.map(p => (
                      <option key={p._id} value={p._id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                );
              } else if (cardKey === 'partition') {
                label = 'Sub-Property / Partition';
                control = (
                  <select
                    value={incomeFilters.unitId}
                    onChange={(e) => {
                      setIncomeFilters(prev => ({ ...prev, unitId: e.target.value }));
                      setCurrentPage(1);
                    }}
                    className="w-full px-2 py-1 rounded-lg border border-slate-200 bg-slate-50 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 truncate"
                  >
                    <option value="">All Partitions</option>
                    {filterUnitOptions.map(u => (
                      <option key={u._id} value={u._id}>
                        {u.subUnitPartition || u.unitName} ({u.unitCode})
                      </option>
                    ))}
                  </select>
                );
              } else if (cardKey === 'tenant') {
                label = 'Tenant';
                control = (
                  <select
                    value={incomeFilters.tenantId}
                    onChange={(e) => {
                      setIncomeFilters(prev => ({ ...prev, tenantId: e.target.value }));
                      setCurrentPage(1);
                    }}
                    className="w-full px-2 py-1 rounded-lg border border-slate-200 bg-slate-50 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 truncate"
                  >
                    <option value="">All Tenants</option>
                    {tenants.map(t => (
                      <option key={t._id} value={t._id}>
                        {t.name} {t.tenantCode ? `(${t.tenantCode})` : ''}
                      </option>
                    ))}
                  </select>
                );
              }

              return (
                <div
                  key={cardKey}
                  draggable
                  onDragStart={(e) => handleCardDragStart(e, cardKey)}
                  onDragOver={(e) => handleCardDragOver(e, cardKey)}
                  onDragEnd={() => { setDraggedCardKey(null); setDragOverCardKey(null); }}
                  onDrop={(e) => handleCardDrop(e, cardKey)}
                  className={`p-2 rounded-xl border transition-all select-none ${
                    isOver
                      ? 'border-emerald-500 bg-emerald-50/80 shadow-sm ring-2 ring-emerald-400'
                      : isDragging
                      ? 'opacity-40 border-slate-300 bg-slate-50'
                      : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-2xs'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block truncate">
                      {label}
                    </label>
                    <span
                      className="cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-600 p-0.5 rounded hover:bg-slate-100"
                      title="Drag to rearrange filter position"
                    >
                      <GripVertical className="w-3.5 h-3.5" />
                    </span>
                  </div>
                  {control}
                </div>
              );
            })}
          </div>

          {/* Results Summary */}
          <div className="flex flex-wrap items-center justify-between gap-2 mt-3 pt-2.5 border-t border-slate-100 text-xs text-slate-500 font-medium">
            <div className="flex items-center gap-1.5">
              <span>Showing</span>
              <span className="font-extrabold text-slate-800">{processedReceipts.length}</span>
              <span>of</span>
              <span className="font-extrabold text-slate-800">{receipts.length}</span>
              <span>income receipts matching filter criteria</span>
              {activeCustomFilterCount > 0 && (
                <span className="text-emerald-700 font-bold ml-1">
                  (Filtered Total: {formatCurrency(totalIncome)})
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* APEX Interactive Toolbar */}
      <ApexToolbar
        kpiFilter={
          <div className="flex items-center gap-1.5 shrink-0 text-xs font-medium">
            <span className="font-extrabold text-slate-800">{processedReceipts.length}</span>
            <span className="text-slate-500">of</span>
            <span className="font-extrabold text-slate-800">{receipts.length}</span>
            <span className="text-slate-500">receipts</span>
            {activeCustomFilterCount > 0 && (
              <span className="text-emerald-700 font-bold ml-1">
                ({formatCurrency(totalIncome)})
              </span>
            )}
          </div>
        }
        search={search}
        onSearchChange={(v) => { setSearch(v); setCurrentPage(1); }}
        rowsPerPage={rowsPerPage}
        onRowsPerPageChange={(v) => { setRowsPerPage(v); setCurrentPage(1); }}
        availableRowsOptions={[10, 25, 50, 100, 'All']}
        columns={ALL_INCOME_COLUMNS_DEF}
        defaultColumns={DEFAULT_INCOME_COLS}
        visibleColumns={visibleColumns}
        onChangeVisibleColumns={(cols) => {
          setVisibleColumns(cols);
          try { localStorage.setItem('cols_all_income_v2', JSON.stringify(cols)); } catch(e){}
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
        onFiltersChange={(f) => { setActiveFilters(f); setCurrentPage(1); }}
        filterSuggestions={filterSuggestions}
        onExport={exportToExcel}
        storageKey="all_income_v1"
      />

      {/* Grid Container */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden flex flex-col">
        <div className="overflow-x-auto max-h-[68vh] overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-7 h-7 border-4 border-teal-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-xs text-slate-500 ml-3 font-medium">Loading all income records...</span>
            </div>
          ) : paginatedReceipts.length === 0 ? (
            <div className="py-20 text-center text-slate-400 text-xs">
              {receipts.length === 0
                ? 'No income records found in system.'
                : 'No income lines match your current search and filter settings.'}
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead className={`bg-slate-100 text-slate-700 font-bold border-b border-slate-300 select-none ${isHeaderSticky ? 'sticky top-0 z-20 shadow-xs' : ''}`}>
                <tr>
                  {visibleColumns.map((colId, colIndex) => {
                    const def = ALL_INCOME_COLUMNS_DEF.find(c => c.id === colId) || { id: colId, label: colId };
                    const width = columnWidths[colId] || DEFAULT_INCOME_COLUMN_WIDTHS[colId] || 120;
                    const frozenStyle = getFrozenColumnStyle(colIndex, frozenColumnCount, visibleColumns, columnWidths, true);

                    const isActions = colId === 'actions';
                    const isIndex = colId === 'index';
                    const isAmount = ['totalAmount', 'rentAmount', 'depositAmount', 'monthlyRentExpected', 'adjustmentAmount', 'deposit', 'outstanding', 'adjustedOutstanding', 'loanAmount'].includes(colId);
                    const isCenter = ['contractType', 'paidUpTo', 'isReversed', 'occupancyStatus', 'status'].includes(colId);
                    const align = isActions || isIndex || isCenter ? 'text-center' : isAmount ? 'text-right' : 'text-left';

                    return (
                      <th
                        key={colId}
                        {...getHeaderDragProps(colId, visibleColumns, (cols) => {
                          setVisibleColumns(cols);
                          try { localStorage.setItem('cols_all_income_v2', JSON.stringify(cols)); } catch(e){}
                        }, 'all_income_v2')}
                        style={{ ...frozenStyle, width: `${Math.max(width, 45)}px`, minWidth: `${Math.max(width, 45)}px` }}
                        className={`py-2.5 pl-3 pr-6 border-r border-slate-300 relative group bg-slate-100 ${align}`}
                      >
                        <div className={`flex items-center gap-1 w-full ${isActions || isIndex || isCenter ? 'justify-center' : isAmount ? 'justify-end' : 'justify-start'}`}>
                          {isActions || isIndex ? (
                            <span className="text-xs font-bold text-slate-700">{def.label}</span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleHeaderSort(colId)}
                              className="group/btn flex items-center gap-1 min-w-0 max-w-full text-xs font-bold text-slate-700 hover:text-slate-900 transition-colors text-left cursor-pointer"
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
                {paginatedReceipts.map((r, rowIndex) => {
                  const globalIndex = rowsPerPage === 'All' ? rowIndex + 1 : (currentPage - 1) * Number(rowsPerPage) + rowIndex + 1;

                  return (
                    <tr key={r._id} className="hover:bg-slate-50/80 transition-colors">
                      {visibleColumns.map((colId, colIndex) => {
                        const frozenStyle = getFrozenColumnStyle(colIndex, frozenColumnCount, visibleColumns, columnWidths, false);

                        if (colId === 'index') {
                          return (
                            <td key={colId} style={frozenStyle} className="py-2.5 px-3 border-r border-slate-200 text-center font-mono text-slate-400 whitespace-nowrap">
                              {globalIndex}
                            </td>
                          );
                        }

                        if (colId === 'receiptDate') {
                          return (
                            <td key={colId} style={frozenStyle} className="py-2.5 px-3 border-r border-slate-200 whitespace-nowrap text-slate-700">
                              {formatDate(r.receiptDate)}
                            </td>
                          );
                        }

                        if (colId === 'accountingMonth') {
                          const acctM = r.accountingMonth || (r.receiptDate ? new Date(r.receiptDate).toISOString().slice(0, 7) : '');
                          return (
                            <td key={colId} style={frozenStyle} className="py-2.5 px-3 border-r border-slate-200 whitespace-nowrap text-xs font-semibold text-slate-800 text-center">
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-teal-50 text-teal-800 border border-teal-200/60 font-bold">
                                <Calendar className="w-3 h-3 text-teal-600" />
                                {acctM ? formatMonthYear(acctM) : '—'}
                              </span>
                            </td>
                          );
                        }

                        if (colId === 'receiptNumber') {
                          return (
                            <td key={colId} style={frozenStyle} className="py-2.5 px-3 border-r border-slate-200 font-mono font-bold text-teal-800 whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() => setEditingPaymentModalReceiptId(r._id)}
                                className="hover:underline hover:text-teal-600 cursor-pointer font-mono font-bold text-left"
                                title="Click to edit receipt in Edit Month / Payment screen"
                              >
                                {r.receiptNumber}
                              </button>
                            </td>
                          );
                        }

                        if (colId === 'contractNo') {
                          return (
                            <td key={colId} style={frozenStyle} className="py-2.5 px-3 border-r border-slate-200 whitespace-nowrap">
                              {r.contractNo ? (
                                <span className="inline-block px-2 py-0.5 rounded-lg bg-teal-50 text-teal-800 font-mono font-bold text-[11px] border border-teal-200/60">
                                  {r.contractNo}
                                </span>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </td>
                          );
                        }

                        if (colId === 'contractType') {
                          const isBiz = (r.contractType || '').toLowerCase() === 'business';
                          return (
                            <td key={colId} style={frozenStyle} className="py-2.5 px-3 border-r border-slate-200 text-center whitespace-nowrap">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold border ${
                                isBiz
                                  ? 'bg-purple-50 text-purple-800 border-purple-200'
                                  : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                              }`}>
                                {isBiz ? 'Business' : 'Rent'}
                              </span>
                            </td>
                          );
                        }

                        if (colId === 'property') {
                          return (
                            <td key={colId} style={frozenStyle} className="py-2.5 px-3 border-r border-slate-200 font-medium text-slate-900 whitespace-nowrap">
                              {r.unitId?.propertyId?.name || '—'}
                            </td>
                          );
                        }

                        if (colId === 'unit') {
                          return (
                            <td key={colId} style={frozenStyle} className="py-2.5 px-3 border-r border-slate-200 whitespace-nowrap font-medium text-slate-700">
                              {r.unitId?.subUnitPartition || r.unitId?.unitName || '—'}
                            </td>
                          );
                        }

                        if (colId === 'tenant') {
                          return (
                            <td key={colId} style={frozenStyle} className="py-2.5 px-3 border-r border-slate-200 whitespace-nowrap font-bold text-slate-900">
                              {r.tenantId?.name || '—'}
                            </td>
                          );
                        }

                        if (colId === 'phone') {
                          return (
                            <td key={colId} style={frozenStyle} className="py-2.5 px-3 border-r border-slate-200 whitespace-nowrap font-mono text-slate-600">
                              {r.tenantId?.phone || '—'}
                            </td>
                          );
                        }

                        if (colId === 'monthsCovered') {
                          const rawM = r.monthsCovered || (r.allocations && r.allocations.map(a => a.rentMonthYear).join(', ')) || '';
                          const formatted = rawM ? rawM.split(',').map(m => formatMonthYear(m.trim())).join(', ') : '—';
                          return (
                            <td key={colId} style={frozenStyle} className="py-2.5 px-3 border-r border-slate-200 whitespace-nowrap">
                              <span className="inline-block px-2 py-0.5 rounded-md bg-blue-50 text-blue-800 font-bold text-[11px] border border-blue-200">
                                {formatted}
                              </span>
                            </td>
                          );
                        }

                        if (colId === 'status') {
                          const rStatus = r.status || 'Rented';
                          return (
                            <td key={colId} style={frozenStyle} className="py-2.5 px-3 border-r border-slate-200 whitespace-nowrap">
                              <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
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
                            <td key={colId} style={frozenStyle} className="py-2.5 px-3 border-r border-slate-200 text-slate-600 text-[11px] max-w-xs truncate" title={r.comments}>
                              {r.comments || '—'}
                            </td>
                          );
                        }

                        if (colId === 'rentAmount') {
                          const rVal = r.rentAmount !== undefined ? r.rentAmount : (r.totalAmount || 0);
                          return (
                            <td key={colId} style={frozenStyle} className="py-2.5 px-3 border-r border-slate-200 text-right font-mono font-bold text-emerald-800 whitespace-nowrap">
                              {formatCurrency(rVal)}
                            </td>
                          );
                        }

                        if (colId === 'depositAmount') {
                          const dVal = r.depositAmount || 0;
                          return (
                            <td key={colId} style={frozenStyle} className="py-2.5 px-3 border-r border-slate-200 text-right font-mono font-bold text-amber-800 whitespace-nowrap">
                              {dVal > 0 ? formatCurrency(dVal) : '—'}
                            </td>
                          );
                        }

                        if (colId === 'totalAmount') {
                          return (
                            <td key={colId} style={frozenStyle} className="py-2.5 px-3 border-r border-slate-200 text-right font-mono font-bold text-emerald-700 whitespace-nowrap">
                              {formatCurrency(r.totalAmount || 0)}
                            </td>
                          );
                        }

                        if (colId === 'actions') {
                          return (
                            <td key={colId} style={frozenStyle} className="py-2.5 px-3 text-center whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() => setEditingPaymentModalReceiptId(r._id)}
                                className="px-2.5 py-1 rounded-lg bg-teal-50 hover:bg-teal-100 text-teal-700 font-bold text-[11px] transition-colors inline-flex items-center gap-1.5 border border-teal-200/60 cursor-pointer shadow-2xs"
                                title="Edit in Edit Month / Payment screen"
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
                            <td key={colId} style={frozenStyle} className="py-2.5 px-3 border-r border-slate-200 text-right font-mono font-bold whitespace-nowrap">
                              {adj !== 0 ? (
                                <span className={adj > 0 ? 'text-emerald-700' : 'text-rose-600'}>
                                  {adj > 0 ? `+${formatCurrency(adj)}` : formatCurrency(adj)}
                                </span>
                              ) : '—'}
                            </td>
                          );
                        }

                        if (colId === 'isReversed') {
                          return (
                            <td key={colId} style={frozenStyle} className="py-2.5 px-3 border-r border-slate-200 text-center whitespace-nowrap">
                              <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                r.isReversed ? 'bg-rose-100 text-rose-800 border-rose-200' : 'bg-emerald-100 text-emerald-800 border-emerald-200'
                              }`}>
                                {r.isReversed ? 'Reversed' : 'Active'}
                              </span>
                            </td>
                          );
                        }

                        if (colId === 'occupancyStatus') {
                          const st = r.unitId?.occupancyStatus || 'Occupied';
                          return (
                            <td key={colId} style={frozenStyle} className="py-2.5 px-3 border-r border-slate-200 text-center whitespace-nowrap">
                              <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                                {st}
                              </span>
                            </td>
                          );
                        }

                        if (colId === 'monthlyRentExpected') {
                          const num = Number(r.monthlyRentExpected) || 0;
                          return (
                            <td key={colId} style={frozenStyle} className="py-2.5 px-3 border-r border-slate-200 text-right font-mono font-bold text-slate-800 whitespace-nowrap">
                              {num > 0 ? formatCurrency(num) : '—'}
                            </td>
                          );
                        }

                        if (colId === 'outstanding') {
                          const outVal = Number(r.outstanding) || 0;
                          return (
                            <td key={colId} style={frozenStyle} className="py-2.5 px-3 border-r border-slate-200 text-right font-mono whitespace-nowrap">
                              {outVal > 0 ? (
                                <span className="font-black text-rose-700">
                                  {formatCurrency(outVal)}
                                </span>
                              ) : (
                                <span className="text-slate-400">₹0</span>
                              )}
                            </td>
                          );
                        }

                        if (colId === 'adjustedOutstanding') {
                          const adjOut = Number(r.adjustedOutstanding) || 0;
                          return (
                            <td key={colId} style={frozenStyle} className="py-2.5 px-3 border-r border-slate-200 text-right font-mono whitespace-nowrap">
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
                            <td key={colId} style={frozenStyle} className="py-2.5 px-3 border-r border-slate-200 text-slate-600 text-[11px] max-w-xs truncate" title={r.adjustmentDescription}>
                              {r.adjustmentDescription || '—'}
                            </td>
                          );
                        }

                        if (colId === 'paidUpTo') {
                          const val = r.paidUpTo && r.paidUpTo !== 'None' && r.paidUpTo !== 'Vacant' ? r.paidUpTo : '—';
                          return (
                            <td key={colId} style={frozenStyle} className="py-2.5 px-3 border-r border-slate-200 text-center whitespace-nowrap">
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
                          const num = Number(r.loanAmount) || 0;
                          return (
                            <td key={colId} style={frozenStyle} className="py-2.5 px-3 border-r border-slate-200 text-right font-mono font-medium text-slate-800 whitespace-nowrap">
                              {num > 0 ? formatCurrency(num) : '—'}
                            </td>
                          );
                        }

                        if (colId === 'deposit') {
                          const num = Number(r.deposit ?? (r.tenantId?.deposit || 0)) || 0;
                          return (
                            <td key={colId} style={frozenStyle} className="py-2.5 px-3 border-r border-slate-200 text-right font-mono text-slate-700 whitespace-nowrap">
                              {num > 0 ? formatCurrency(num) : '—'}
                            </td>
                          );
                        }

                        const textVal = getIncomeFieldVal(r, colId);
                        return (
                          <td key={colId} style={frozenStyle} className="py-2.5 px-3 border-r border-slate-200 text-xs text-slate-700 whitespace-nowrap truncate max-w-xs" title={textVal}>
                            {textVal || '—'}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination Footer */}
        {processedReceipts.length > 0 && (
          <div className="px-4 py-3 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
            <span className="font-medium">
              Showing{' '}
              <strong>
                {rowsPerPage === 'All'
                  ? 1
                  : Math.min((currentPage - 1) * Number(rowsPerPage) + 1, processedReceipts.length)}
              </strong>{' '}
              to{' '}
              <strong>
                {rowsPerPage === 'All'
                  ? processedReceipts.length
                  : Math.min(currentPage * Number(rowsPerPage), processedReceipts.length)}
              </strong>{' '}
              of <strong>{processedReceipts.length}</strong> income records
            </span>

            {rowsPerPage !== 'All' && totalPages > 1 && (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
                  disabled={currentPage === 1}
                  className="p-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span className="font-bold text-slate-700 px-2">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))}
                  disabled={currentPage >= totalPages}
                  className="p-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* EDIT RECEIPT MODAL - Clean Single-Value Form (No Grid) */}
      {editingReceipt && (
        <div className="fixed inset-0 z-[99999] overflow-y-auto bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5">
          <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col my-auto max-h-[90vh] z-[100000] animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-4 sm:px-6 border-b border-slate-800 flex items-center justify-between bg-slate-900 text-white shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-teal-600 text-white shadow-xs">
                  <Receipt className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-extrabold text-white text-base">Edit Income Transaction</h3>
                    <span className="px-2.5 py-0.5 rounded-md bg-teal-500/20 text-teal-300 text-xs font-mono font-bold border border-teal-500/30">
                      {editForm.receiptNumber || editingReceipt.receiptNumber}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Single transaction form — updating receipt and monthly allocation
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingReceipt(null)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form Body */}
            <form onSubmit={handleSaveReceipt} className="flex-1 overflow-y-auto p-4 sm:p-5 bg-white">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                
                {/* COLUMN 1: OCCUPANCY & STATUS */}
                <div className="space-y-3 p-3.5 bg-slate-50/70 rounded-2xl border border-slate-200/80">
                  <span className="text-[11px] font-black uppercase tracking-wider text-slate-700 block pb-1 border-b border-slate-200">
                    Occupancy & Status
                  </span>

                  {/* Status Toggle */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Status</label>
                    <div className="grid grid-cols-2 gap-2 p-1 bg-slate-200/70 rounded-xl">
                      <button
                        type="button"
                        onClick={() => setEditForm(f => ({ ...f, status: 'Rented' }))}
                        className={`py-1.5 px-3 rounded-lg text-xs font-extrabold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                          editForm.status !== 'Vacant'
                            ? 'bg-emerald-600 text-white shadow-xs'
                            : 'text-slate-600 hover:text-slate-900 bg-transparent'
                        }`}
                      >
                        <span className={`w-2 h-2 rounded-full ${editForm.status !== 'Vacant' ? 'bg-white' : 'bg-emerald-500'}`} />
                        <span>Rented</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditForm(f => ({ ...f, status: 'Vacant', tenantId: '', contractNo: '', customContractNo: '' }))}
                        className={`py-1.5 px-3 rounded-lg text-xs font-extrabold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                          editForm.status === 'Vacant'
                            ? 'bg-amber-600 text-white shadow-xs'
                            : 'text-slate-600 hover:text-slate-900 bg-transparent'
                        }`}
                      >
                        <span className={`w-2 h-2 rounded-full ${editForm.status === 'Vacant' ? 'bg-white' : 'bg-amber-500'}`} />
                        <span>Vacant</span>
                      </button>
                    </div>
                  </div>

                  {/* Property */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Property</label>
                    <select
                      value={editForm.propertyId}
                      onChange={(e) => {
                        const newPropId = e.target.value;
                        const validUnits = units.filter(u => String(u.propertyId?._id || u.propertyId) === String(newPropId));
                        const newUnitId = validUnits.length > 0 ? validUnits[0]._id : '';
                        setEditForm({ ...editForm, propertyId: newPropId, unitId: newUnitId });
                      }}
                      className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-teal-400 font-medium"
                    >
                      <option value="">-- Choose Property --</option>
                      {properties.map(p => (
                        <option key={p._id} value={p._id}>{p.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Partition / Sub-Unit */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Sub-Property / Partition</label>
                    <select
                      value={editForm.unitId}
                      onChange={(e) => setEditForm({ ...editForm, unitId: e.target.value })}
                      className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-teal-400 font-medium"
                    >
                      <option value="">-- Choose Unit / Partition --</option>
                      {availableUnitsForEdit.map(u => (
                        <option key={u._id} value={u._id}>
                          {u.subUnitPartition || u.unitName}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Tenant */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Tenant</label>
                    {editForm.status === 'Vacant' ? (
                      <input
                        type="text"
                        disabled
                        value=""
                        placeholder="— (Blank - Unit is Vacant) —"
                        className="w-full px-3 py-1.5 text-xs rounded-xl border border-dashed border-amber-300 bg-amber-50/50 text-amber-800 font-bold"
                      />
                    ) : (
                      <select
                        value={editForm.tenantId}
                        onChange={(e) => setEditForm({ ...editForm, tenantId: e.target.value })}
                        className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-teal-400 font-medium"
                      >
                        <option value="">-- Choose Tenant --</option>
                        {tenants.map(t => (
                          <option key={t._id} value={t._id}>
                            {t.name} {t.phone ? `(${t.phone})` : ''}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  {/* Contract No */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Contract Number</label>
                    {editForm.status === 'Vacant' ? (
                      <input
                        type="text"
                        disabled
                        value=""
                        placeholder="— (Blank - No Contract) —"
                        className="w-full px-3 py-1.5 text-xs rounded-xl border border-dashed border-amber-300 bg-amber-50/50 text-amber-800 font-mono font-bold"
                      />
                    ) : editForm.isCustomContract ? (
                      <input
                        type="text"
                        placeholder="Type contract number..."
                        value={editForm.customContractNo}
                        onChange={(e) => setEditForm({ ...editForm, customContractNo: e.target.value })}
                        className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-400 font-mono"
                      />
                    ) : (
                      <select
                        value={editForm.contractNo}
                        onChange={(e) => setEditForm({ ...editForm, contractNo: e.target.value })}
                        className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-teal-400 font-mono font-medium"
                      >
                        <option value="">-- Choose Contract --</option>
                        {contractOptions.allRelevant.map(c => {
                          const cNo = c.contractNo || c.assignmentCode;
                          const sStr = c.startDate ? c.startDate.slice(0, 10) : 'Open';
                          const eStr = c.endDate ? c.endDate.slice(0, 10) : 'Ongoing';
                          return (
                            <option key={c._id} value={cNo}>
                              {cNo} ({sStr} to {eStr})
                            </option>
                          );
                        })}
                      </select>
                    )}
                  </div>
                </div>

                {/* COLUMN 2: FINANCIALS & DATES */}
                <div className="space-y-3 p-3.5 bg-slate-50/70 rounded-2xl border border-slate-200/80">
                  <span className="text-[11px] font-black uppercase tracking-wider text-slate-700 block pb-1 border-b border-slate-200">
                    Receipt Details & Financials
                  </span>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Receipt # <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={editForm.receiptNumber}
                      onChange={(e) => setEditForm({ ...editForm, receiptNumber: e.target.value })}
                      className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-400 font-mono font-bold text-teal-800"
                      placeholder="e.g. REC-2026-0001"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Payment Date <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="date"
                      required
                      value={editForm.receiptDate}
                      onChange={(e) => setEditForm({ ...editForm, receiptDate: e.target.value })}
                      className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-400"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Accounting Month <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="month"
                      required
                      value={editForm.rentMonthYear}
                      onChange={(e) => setEditForm({ ...editForm, rentMonthYear: e.target.value })}
                      className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-400 font-mono font-bold text-slate-800"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Rent Amount Paid (₹) <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={editForm.rentAmount ?? ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          setEditForm(f => ({
                            ...f,
                            rentAmount: val,
                            totalAmount: String((Number(val) || 0) + (Number(f.depositAmount) || 0))
                          }));
                        }}
                        className="w-full px-2.5 py-1.5 text-xs font-bold rounded-xl border border-emerald-300 text-emerald-800 focus:outline-none focus:ring-2 focus:ring-teal-400"
                        placeholder="e.g. 25000"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Deposit Amount (₹)
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={editForm.depositAmount ?? ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          setEditForm(f => ({
                            ...f,
                            depositAmount: val,
                            totalAmount: String((Number(f.rentAmount) || 0) + (Number(val) || 0))
                          }));
                        }}
                        className="w-full px-2.5 py-1.5 text-xs font-bold rounded-xl border border-slate-300 text-amber-800 focus:outline-none focus:ring-2 focus:ring-teal-400"
                        placeholder="0"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Total Amount Paid (₹) <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="number"
                      required
                      min="0"
                      value={editForm.totalAmount}
                      onChange={(e) => {
                        const val = e.target.value;
                        setEditForm(f => ({
                          ...f,
                          totalAmount: val,
                          rentAmount: String(Math.max(0, (Number(val) || 0) - (Number(f.depositAmount) || 0)))
                        }));
                      }}
                      className="w-full px-3 py-1.5 text-sm font-black rounded-xl border-2 border-teal-500 text-teal-900 bg-teal-50/30 focus:outline-none focus:ring-2 focus:ring-teal-400"
                      placeholder="Total amount"
                    />
                  </div>
                </div>

                {/* COLUMN 3: REFERENCES & COMMENTS */}
                <div className="space-y-3 p-3.5 bg-slate-50/70 rounded-2xl border border-slate-200/80">
                  <span className="text-[11px] font-black uppercase tracking-wider text-slate-700 block pb-1 border-b border-slate-200">
                    References & Notes
                  </span>

                  

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Notes / Comments</label>
                    <textarea
                      rows="4"
                      placeholder="Notes, remarks or collection details..."
                      value={editForm.comments}
                      onChange={(e) => setEditForm({ ...editForm, comments: e.target.value })}
                      className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-400"
                    />
                  </div>

                  <div className="p-3 bg-white rounded-xl border border-slate-200 text-xs text-slate-500">
                    <p className="font-semibold text-slate-700">Audit Status:</p>
                    <p className="text-[11px] mt-0.5">Payment mode & bank name are omitted. Occupancy is tracked by Status.</p>
                  </div>
                </div>

              </div>

              {/* Modal Footer */}
              <div className="flex items-center justify-end gap-2.5 pt-3 mt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setEditingReceipt(null)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingReceipt}
                  className="px-5 py-2 text-xs font-extrabold text-white bg-teal-600 hover:bg-teal-700 active:scale-95 transition-all rounded-xl shadow-md flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                >
                  {savingReceipt ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Saving Changes...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Update Receipt Record</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* FULL PAYMENT EDIT MODAL OVERLAY IN ALL INCOME REPORT */}
      {editingPaymentModalReceiptId && (
        <PaymentEditModal
          isOpen={Boolean(editingPaymentModalReceiptId)}
          onClose={() => setEditingPaymentModalReceiptId(null)}
          receiptId={editingPaymentModalReceiptId}
          tenants={tenants}
          assignments={assignments}
          backButtonLabel="Back to All Income Report"
          onSuccess={async () => {
            setEditingPaymentModalReceiptId(null);
            await fetchData();
          }}
        />
      )}
    </div>
  );
}