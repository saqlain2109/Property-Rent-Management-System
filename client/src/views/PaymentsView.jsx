import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import API from '../services/api';
import { formatCurrency, formatDate, formatMonthYear } from '../utils/formatters';
import ColumnManager, { getHeaderDragProps, useResizableColumns, ResizeHandle, useFrozenColumns, getFrozenColumnStyle, ColumnHeaderCell, useTableAutoWrap } from '../components/ColumnManager';
import ApexToolbar from '../components/ApexToolbar';
import PaymentEditModal from '../components/PaymentEditModal';
import { peekDrilldown, popAndReturnDrilldown } from '../utils/navigationHistory';
import { cycleThreeStateSort, evaluateFilterRule, sortDataRows, extractUniqueValues } from '../utils/tableUtils';
import * as XLSX from 'xlsx';
import { useModalBackHandler } from '../utils/useModalBackHandler';
import { 
  Receipt, Plus, Search, AlertCircle, 
  RotateCcw, CheckCircle2, Eye, Sparkles, Clock, X,
  Edit2, Filter, Layers, ListFilter, Trash2,
  Calendar, ChevronLeft, ChevronRight, Download, Check,
  IndianRupee, ArrowRight, ChevronDown, ArrowUpDown, ArrowUp, ArrowDown, Building2,
  Tag, TrendingUp, Wallet
} from 'lucide-react';

const EXPENSE_CATEGORY_COLORS = {
  'Maintenance': 'bg-blue-100 text-blue-700 border-blue-200',
  'Electricity & Utilities': 'bg-yellow-100 text-yellow-800 border-yellow-200',
  'Repairs & Renovation': 'bg-orange-100 text-orange-700 border-orange-200',
  'Sweeper & Cleaning': 'bg-cyan-100 text-cyan-700 border-cyan-200',
  'Property Rent Paid': 'bg-purple-100 text-purple-700 border-purple-200',
  'Deposit Refund': 'bg-teal-100 text-teal-700 border-teal-200',
  'Water Charges': 'bg-sky-100 text-sky-700 border-sky-200',
  'Property Tax': 'bg-rose-100 text-rose-700 border-rose-200',
  'MOM': 'bg-emerald-100 text-emerald-800 border-emerald-200',
  'Miscellaneous': 'bg-slate-100 text-slate-700 border-slate-200',
  'Zakat': 'bg-amber-100 text-amber-800 border-amber-200',
  'Sadka': 'bg-lime-100 text-lime-800 border-lime-200',
  'Margaret': 'bg-fuchsia-100 text-fuchsia-800 border-fuchsia-200',
  'Other': 'bg-gray-100 text-gray-700 border-gray-200',
  'Repair': 'bg-orange-100 text-orange-700 border-orange-200',
  'Cleaning': 'bg-cyan-100 text-cyan-700 border-cyan-200',
  'Security': 'bg-indigo-100 text-indigo-700 border-indigo-200',
};

const RENT_SHEET_COLUMNS_DEF = [
  { id: 'index', label: '#', defaultVisible: true },
  { id: 'tenant', label: 'Tenant Details', defaultVisible: true },
  { id: 'status', label: 'Status', defaultVisible: true },
  { id: 'property', label: 'Property', defaultVisible: true },
  { id: 'subUnit', label: 'Sub-Unit', defaultVisible: true },
  { id: 'contractNo', label: 'Contract No', defaultVisible: true },
  { id: 'monthlyRent', label: 'Monthly Rent', defaultVisible: true },
  { id: 'outstanding', label: 'Outstanding due', defaultVisible: true },
  { id: 'paidUpTo', label: 'Paid Up To', defaultVisible: true },
  { id: 'accountingMonth', label: 'Accounting Month', defaultVisible: true },
  { id: 'receiptNumber', label: 'Receipt #', defaultVisible: true },
  { id: 'paidForMonth', label: 'Month Paid For', defaultVisible: true },
  { id: 'rentAmount', label: 'Rent Amount Paid', defaultVisible: true },
  { id: 'depositAmount', label: 'Deposit Amount', defaultVisible: true },
  { id: 'amount', label: 'Total Amount Paid', defaultVisible: true },
  { id: 'actions', label: 'Actions', defaultVisible: true },
  { id: 'adjustmentAmount', label: 'Adjustment Amount (₹)', defaultVisible: false },
  { id: 'adjustedOutstanding', label: 'Adjusted Outstanding (₹)', defaultVisible: false },
  { id: 'adjustmentDescription', label: 'Adjustment Reason', defaultVisible: false },
  { id: 'tenantCode', label: 'Tenant Code', defaultVisible: false },
  { id: 'tenantPhone', label: 'Tenant Phone', defaultVisible: false },
  { id: 'tenantEmail', label: 'Tenant Email', defaultVisible: false },
  { id: 'tenantAddress', label: 'Tenant Address', defaultVisible: false },
  { id: 'tenantType', label: 'Tenant Type', defaultVisible: false },
  { id: 'propertyCode', label: 'Property Code', defaultVisible: false },
  { id: 'propertyType', label: 'Property Type', defaultVisible: false },
  { id: 'propertyAddress', label: 'Property Address', defaultVisible: false },
  { id: 'city', label: 'City', defaultVisible: false },
  { id: 'unitCode', label: 'Unit Code', defaultVisible: false },
  { id: 'subUnitArea', label: 'Partition Area (Sq Ft)', defaultVisible: false },
  { id: 'floor', label: 'Floor / Location', defaultVisible: false },
  { id: 'unitType', label: 'Unit Type', defaultVisible: false },
  { id: 'occupancyStatus', label: 'Occupancy Status', defaultVisible: false },
  { id: 'contractStatus', label: 'Contract Status', defaultVisible: false },
  { id: 'contractType', label: 'Contract Type', defaultVisible: false },
  { id: 'contractStartDate', label: 'Contract Start Date', defaultVisible: false },
  { id: 'contractEndDate', label: 'Contract End Date', defaultVisible: false },
  { id: 'deposit', label: 'Security Deposit', defaultVisible: false },
  { id: 'nextUnpaid', label: 'Next Unpaid Month', defaultVisible: false },
  { id: 'totalCollected', label: 'Lifetime Paid', defaultVisible: false },
  { id: 'createdAt', label: 'Created Date', defaultVisible: false },
  { id: 'updatedAt', label: 'Modified Date', defaultVisible: false }
];

const RECEIPTS_COLUMNS_DEF = [
  { id: 'receiptDate', label: 'Date', defaultVisible: true },
  { id: 'receiptNumber', label: 'Receipt #', defaultVisible: true },
  { id: 'contractNo', label: 'Contract #', defaultVisible: true },
  { id: 'status', label: 'Status', defaultVisible: true },
  { id: 'tenant', label: 'Tenant & Sub-Unit', defaultVisible: true },
  { id: 'accountingMonth', label: 'Accounting Month', defaultVisible: true },
  { id: 'monthsCovered', label: 'Month Paid For', defaultVisible: true },
  { id: 'paidForMonth', label: 'Paid for Month', defaultVisible: false },
  { id: 'rentAmount', label: 'Rent Amount Paid', defaultVisible: true },
  { id: 'depositAmount', label: 'Deposit Amount', defaultVisible: true },
  { id: 'totalAmount', label: 'Total Amount Paid', defaultVisible: true },
  { id: 'adjustmentAmount', label: 'Adjustment Amount (₹)', defaultVisible: false },
  { id: 'adjustmentDescription', label: 'Adjustment Reason', defaultVisible: false },
  { id: 'comments', label: 'Notes / Comments', defaultVisible: false },
  { id: 'tenantCode', label: 'Tenant Code', defaultVisible: false },
  { id: 'tenantPhone', label: 'Tenant Phone', defaultVisible: false },
  { id: 'tenantEmail', label: 'Tenant Email', defaultVisible: false },
  { id: 'propertyName', label: 'Property Name', defaultVisible: false },
  { id: 'propertyCode', label: 'Property Code', defaultVisible: false },
  { id: 'propertyType', label: 'Property Type', defaultVisible: false },
  { id: 'subUnitName', label: 'Sub-Unit Partition', defaultVisible: false },
  { id: 'unitCode', label: 'Unit Code', defaultVisible: false },
  { id: 'subUnitArea', label: 'Partition Area (Sq Ft)', defaultVisible: false },
  { id: 'floor', label: 'Floor / Location', defaultVisible: false },
  { id: 'isReversed', label: 'Reversal Status', defaultVisible: false },
  { id: 'reversalReason', label: 'Reversal Reason', defaultVisible: false },
  { id: 'createdAt', label: 'Created Date', defaultVisible: false },
  { id: 'updatedAt', label: 'Modified Date', defaultVisible: false },
  { id: 'actions', label: 'Actions', defaultVisible: true }
];

// Calibrated default column widths that provide comfortable space for inputs, dropdowns, and buttons without clipping!
const DEFAULT_SHEET_COLUMN_WIDTHS = {
  index: 45,
  tenant: 165,
  status: 115,
  property: 130,
  subUnit: 120,
  contractNo: 125,
  monthlyRent: 110,
  outstanding: 125,
  paidUpTo: 105,
  accountingMonth: 140,
  receiptNumber: 130,
  paidForMonth: 150,
  rentAmount: 125,
  depositAmount: 115,
  amount: 125,
  actions: 235,
  adjustmentAmount: 130,
  adjustedOutstanding: 140,
  adjustmentDescription: 180,
  tenantCode: 110,
  tenantPhone: 115,
  tenantEmail: 150,
  tenantAddress: 180,
  tenantType: 120,
  propertyCode: 110,
  propertyType: 110,
  propertyAddress: 180,
  city: 100,
  unitCode: 100,
  subUnitArea: 110,
  floor: 85,
  unitType: 110,
  occupancyStatus: 110,
  contractStatus: 110,
  contractType: 110,
  contractStartDate: 120,
  contractEndDate: 120,
  deposit: 105,
  nextUnpaid: 110,
  totalCollected: 120,
  createdAt: 110,
  updatedAt: 110
};

const DEFAULT_RECEIPTS_COLUMN_WIDTHS = {
  receiptDate: 100,
  receiptNumber: 120,
  contractNo: 120,
  status: 95,
  status: 95,
  tenant: 180,
  accountingMonth: 140,
  monthsCovered: 150,
  paidForMonth: 150,
  rentAmount: 125,
  depositAmount: 115,
  totalAmount: 135,
  adjustmentAmount: 130,
  adjustmentDescription: 180,
  actions: 105,
  comments: 150,
  tenantCode: 110,
  tenantPhone: 110,
  tenantEmail: 150,
  propertyName: 130,
  propertyCode: 110,
  propertyType: 120,
  subUnitName: 110,
  unitCode: 100,
  subUnitArea: 110,
  floor: 85,
  isReversed: 110,
  reversalReason: 150,
  createdAt: 110,
  updatedAt: 110
};

const EXPENSE_SECTION_COLUMNS_DEF = [
  { id: 'index', label: '#', defaultVisible: true },
  { id: 'headType', label: 'Head Type', defaultVisible: true },
  { id: 'property', label: 'Property', defaultVisible: true },
  { id: 'unit', label: 'Partition (Unit)', defaultVisible: true },
  { id: 'category', label: 'Expense Head', defaultVisible: true },
  { id: 'description', label: 'Description', defaultVisible: true },
  { id: 'date', label: 'Date', defaultVisible: true },
  { id: 'amount', label: 'Amount (₹)', defaultVisible: true },
  { id: 'actions', label: 'Action', defaultVisible: true },
];

const DEFAULT_EXPENSE_SECTION_WIDTHS = {
  index: 55,
  headType: 110,
  property: 180,
  unit: 150,
  category: 160,
  description: 230,
  date: 125,
  amount: 130,
  actions: 90,
};

export default function PaymentsView() {
  const [activeTab, setActiveTab] = useState(() => {
    return localStorage.getItem('payments_active_tab') || 'sheet';
  });
  useEffect(() => {
    localStorage.setItem('payments_active_tab', activeTab);
  }, [activeTab]);
  
  // Column Management States with localStorage persistence (v5 for clean layout)
  const [visibleSheetColumns, setVisibleSheetColumns] = useState(() => {
    const saved = localStorage.getItem('cols_payments_sheet_v6');
    if (saved) {
      try {
        const allowed = RENT_SHEET_COLUMNS_DEF.map((column) => column.id);
        const parsed = JSON.parse(saved).filter((column) => allowed.includes(column));
        if (!parsed.includes('receiptNumber')) {
          const idx = parsed.indexOf('accountingMonth');
          if (idx !== -1) parsed.splice(idx + 1, 0, 'receiptNumber');
          else parsed.push('receiptNumber');
        }
        return parsed;
      } catch (e) {}
    }
    return RENT_SHEET_COLUMNS_DEF.filter(c => c.defaultVisible !== false).map(c => c.id);
  });

  // User-configurable column widths with auto-persistence
  const {
    columnWidths,
    handleResizeStart,
    resetColumnWidths,
    hasCustomWidths
  } = useResizableColumns('payments_sheet_v6', DEFAULT_SHEET_COLUMN_WIDTHS);

  const {
    columnWidths: receiptsWidths,
    handleResizeStart: handleReceiptsResizeStart,
    resetColumnWidths: resetReceiptsWidths,
    hasCustomWidths: hasCustomReceiptsWidths
  } = useResizableColumns('payments_receipts_v6', DEFAULT_RECEIPTS_COLUMN_WIDTHS);

  const [visibleReceiptsColumns, setVisibleReceiptsColumns] = useState(() => {
    const saved = localStorage.getItem('cols_payments_receipts_v6');
    if (saved) {
      try {
        const allowed = RECEIPTS_COLUMNS_DEF.map((column) => column.id);
        return JSON.parse(saved).filter((column) => allowed.includes(column));
      } catch (e) {}
    }
    return RECEIPTS_COLUMNS_DEF.filter(c => c.defaultVisible !== false).map(c => c.id);
  });

  // Frozen Columns with persistence
  const [frozenSheetCount, setFrozenSheetCount] = useFrozenColumns('payments_sheet_v6', 0);
  const [frozenReceiptsCount, setFrozenReceiptsCount] = useFrozenColumns('payments_receipts_v6', 0);
  
  const getCurrentMonthYear = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  };

  // Current Selected Rent Month for the Excel Grid (Defaults dynamically to current month or saved)
  const [selectedMonth, setSelectedMonth] = useState(() => {
    return localStorage.getItem('payments_selected_month') || getCurrentMonthYear();
  });
  useEffect(() => {
    if (selectedMonth) localStorage.setItem('payments_selected_month', selectedMonth);
  }, [selectedMonth]);

  const [customMonthInput, setCustomMonthInput] = useState('');
  
  // Data states
  const [outstandingData, setOutstandingData] = useState([]);
  const [receipts, setReceipts] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [units, setUnits] = useState([]);
  const [properties, setProperties] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [monthExpenses, setMonthExpenses] = useState([]);
  const [expenseCategories, setExpenseCategories] = useState([]);
  const [prevMonthBalance, setPrevMonthBalance] = useState(0);
  const mastersLoadedRef = useRef(false);
  const [loading, setLoading] = useState(true);

  // Expense Modal and Expansion State
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [editingExpense, setEditingExpense] = useState(null);
  const [expenseForm, setExpenseForm] = useState({
    headType: 'Property',
    propertyId: '',
    unitId: '',
    category: '',
    amount: '',
    expenseMonth: '',
    expenseDate: '',
    description: ''
  });
  const [savingExpense, setSavingExpense] = useState(false);
  const [expandedPropertyExpenses, setExpandedPropertyExpenses] = useState({});
  const [expandedCommonExpenses, setExpandedCommonExpenses] = useState({});

  // Dedicated Lower Section Expense Table State
  const [expenseRowDrafts, setExpenseRowDrafts] = useState({});
  const [savingExpenseRows, setSavingExpenseRows] = useState({});
  const [savedExpenseFeedback, setSavedExpenseFeedback] = useState({});
  const [editingExpenseLineId, setEditingExpenseLineId] = useState(null);
  const [editingExpenseLineData, setEditingExpenseLineData] = useState({});
  const [expenseSectionPropFilter, setExpenseSectionPropFilter] = useState('');
  const [expenseSectionSearch, setExpenseSectionSearch] = useState('');

  // APEX Toolbar, Columns & View States for Expense Section
  const [visibleExpenseCols, setVisibleExpenseCols] = useState(() => {
    try {
      const saved = localStorage.getItem('cols_payments_expense_section_v1');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return EXPENSE_SECTION_COLUMNS_DEF.map(c => c.id);
  });

  const {
    columnWidths: expenseSectionWidths,
    handleResizeStart: handleExpenseSectionResizeStart,
    resetColumnWidths: resetExpenseSectionWidths,
  } = useResizableColumns('payments_expense_section_v1', DEFAULT_EXPENSE_SECTION_WIDTHS);

  const [frozenExpenseCount, setFrozenExpenseCount] = useFrozenColumns('payments_expense_section_freeze_v1', 0);
  const [isExpenseHeaderSticky, setIsExpenseHeaderSticky] = useState(true);

  const [expenseSectionSort, setExpenseSectionSort] = useState({ key: null, direction: null });
  const [expenseSectionFilters, setExpenseSectionFilters] = useState([]);
  const [expenseSectionColFilters, setExpenseSectionColFilters] = useState({});
  const [expenseSectionRowsPerPage, setExpenseSectionRowsPerPage] = useState('All');
  const [expenseSectionCurrentPage, setExpenseSectionCurrentPage] = useState(1);
  const [expenseSectionActiveViewId, setExpenseSectionActiveViewId] = useState(null);

  const { autoWrap } = useTableAutoWrap();

  // Clear expense drafts on month change
  useEffect(() => {
    setExpenseRowDrafts({});
    setEditingExpenseLineId(null);
    setEditingExpenseLineData({});
  }, [selectedMonth]);

  // Filters with localStorage persistence
  const [search, setSearch] = useState(() => {
    return localStorage.getItem('payments_search') || '';
  });
  useEffect(() => {
    localStorage.setItem('payments_search', search);
  }, [search]);

  const [selectedPropertyFilter, setSelectedPropertyFilter] = useState(() => {
    return localStorage.getItem('payments_prop_filter') || '';
  });
  useEffect(() => {
    localStorage.setItem('payments_prop_filter', selectedPropertyFilter);
  }, [selectedPropertyFilter]);

  const [selectedTenantFilter, setSelectedTenantFilter] = useState(() => {
    return localStorage.getItem('payments_tenant_filter') || '';
  });
  useEffect(() => {
    localStorage.setItem('payments_tenant_filter', selectedTenantFilter);
  }, [selectedTenantFilter]);

  // Receipts Register Filters
  const [receiptSearch, setReceiptSearch] = useState(() => {
    return localStorage.getItem('payments_receipt_search') || '';
  });
  useEffect(() => {
    localStorage.setItem('payments_receipt_search', receiptSearch);
  }, [receiptSearch]);

  const [receiptPropertyFilter, setReceiptPropertyFilter] = useState(() => {
    return localStorage.getItem('payments_receipt_prop_filter') || '';
  });
  useEffect(() => {
    localStorage.setItem('payments_receipt_prop_filter', receiptPropertyFilter);
  }, [receiptPropertyFilter]);

  const [receiptStatusFilter, setReceiptStatusFilter] = useState(() => {
    return localStorage.getItem('payments_receipt_status_filter') || '';
  });
  useEffect(() => {
    localStorage.setItem('payments_receipt_status_filter', receiptStatusFilter);
  }, [receiptStatusFilter]);

  const [receiptSelectedMonths, setReceiptSelectedMonths] = useState([]); // array of 'YYYY-MM'
  const [showReceiptMonthPicker, setShowReceiptMonthPicker] = useState(false);

  // Sheet Toolbar & Table State
  const [sheetFilters, setSheetFilters] = useState(() => {
    try {
      const saved = localStorage.getItem('payments_sheet_filters');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('payments_sheet_filters', JSON.stringify(sheetFilters));
    } catch (e) {}
  }, [sheetFilters]);
  const [sheetSortConfig, setSheetSortConfig] = useState({ key: null, direction: null });
  const [isSheetHeaderSticky, setIsSheetHeaderSticky] = useState(true);
  const [sheetRowsPerPage, setSheetRowsPerPage] = useState(25);
  const [sheetCurrentPage, setSheetCurrentPage] = useState(1);
  const [sheetActiveViewId, setSheetActiveViewId] = useState(null);

  // Receipts Toolbar & Table State
  const [receiptActiveFilters, setReceiptActiveFilters] = useState([]);
  const [receiptSortConfig, setReceiptSortConfig] = useState({ key: 'receiptDate', direction: 'desc' });
  const [isReceiptsHeaderSticky, setIsReceiptsHeaderSticky] = useState(true);
  const [receiptRowsPerPage, setReceiptRowsPerPage] = useState(25);
  const [receiptCurrentPage, setReceiptCurrentPage] = useState(1);
  const [receiptActiveViewId, setReceiptActiveViewId] = useState(null);

  const handleSheetHeaderSort = (colId) => {
    if (['actions', 'paidForMonth', 'amount', 'rentAmount', 'depositAmount'].includes(colId)) return;
    setSheetSortConfig(prev => cycleThreeStateSort(prev, colId));
  };

  const handleReceiptHeaderSort = (colId) => {
    if (colId === 'actions') return;
    setReceiptSortConfig(prev => cycleThreeStateSort(prev, colId));
  };

  // Locate existing receipt for a unit in a given accounting month (strictly ONE receipt per unit per accounting month)
  const receiptCoversMonthPaidFor = (r, m) => {
    if (!r || r.isReversed || !m) return false;
    if (r.allocations && Array.isArray(r.allocations) && r.allocations.length > 0) {
      if (r.allocations.some(a => a.rentMonthYear === m && Number(a.allocatedAmount ?? a.actualAllocated ?? 0) > 0)) {
        return true;
      }
    }
    if (r.monthPaidFor) {
      const list = String(r.monthPaidFor).split(',').map(s => s.trim());
      if (list.includes(m)) return true;
    }
    return false;
  };

  const receiptMatchesAccountingMonth = (r, m) => {
    if (!r || r.isReversed || !m) return false;
    const acctM = r.accountingMonth 
      ? String(r.accountingMonth).slice(0, 7) 
      : (r.receiptDate ? new Date(r.receiptDate).toISOString().slice(0, 7) : '');
    return acctM === m;
  };

  const isContractMatch = (c1, c2) => {
    if (!c1 || !c2) return false;
    const s1 = c1.trim().toLowerCase();
    const s2 = c2.trim().toLowerCase();
    if (s1 === s2) return true;
    if ((s1 === 'de-2025' || s1 === 'delhiery-2025') && (s2 === 'de-2025' || s2 === 'delhiery-2025')) return true;
    return false;
  };

  // Locate existing receipt for a unit in a given month (checks month paid for first, then accounting month)
  const findReceiptForUnitAndMonth = (item, targetMonth = selectedMonth) => {
    const unitIdStr = String(item?.unit?._id || item?.unitId?._id || item?.unitId || item?.unit || '');
    if (!unitIdStr) return null;
    const contractNoStr = String(item?.contractNo || '').trim().toLowerCase();
    const tenantIdStr = String(item?.tenant?._id || item?.tenantId?._id || item?.tenantId || item?.tenant || '');

    // 1. Priority 1: Match unit, contractNo, tenantId that covers targetMonth in monthPaidFor / allocations
    if (contractNoStr && tenantIdStr) {
      const exactCovered = receipts.find(r => 
        !r.isReversed &&
        String(r.unitId?._id || r.unitId || '') === unitIdStr &&
        String(r.tenantId?._id || r.tenantId || '') === tenantIdStr &&
        isContractMatch(r.contractNo, contractNoStr) &&
        receiptCoversMonthPaidFor(r, targetMonth)
      );
      if (exactCovered) return exactCovered;
    }

    // 2. Priority 2: Match unit, tenantId that covers targetMonth
    if (tenantIdStr) {
      const tenantCovered = receipts.find(r => 
        !r.isReversed &&
        String(r.unitId?._id || r.unitId || '') === unitIdStr &&
        String(r.tenantId?._id || r.tenantId || '') === tenantIdStr &&
        receiptCoversMonthPaidFor(r, targetMonth)
      );
      if (tenantCovered) return tenantCovered;
    }

    // 3. Priority 3: Match unit that covers targetMonth
    const unitCovered = receipts.find(r => 
      !r.isReversed &&
      String(r.unitId?._id || r.unitId || '') === unitIdStr &&
      receiptCoversMonthPaidFor(r, targetMonth)
    );
    if (unitCovered) return unitCovered;

    // 4. Priority 4: Match unit, contractNo, tenantId by accounting month
    if (contractNoStr && tenantIdStr) {
      const exactMatch = receipts.find(r => 
        receiptMatchesAccountingMonth(r, targetMonth) &&
        String(r.unitId?._id || r.unitId || '') === unitIdStr &&
        String(r.tenantId?._id || r.tenantId || '') === tenantIdStr &&
        isContractMatch(r.contractNo, contractNoStr)
      );
      if (exactMatch) return exactMatch;
    }

    // 5. Priority 5: Match unit, contractNo by accounting month
    if (contractNoStr) {
      const contractMatch = receipts.find(r => 
        receiptMatchesAccountingMonth(r, targetMonth) &&
        String(r.unitId?._id || r.unitId || '') === unitIdStr &&
        isContractMatch(r.contractNo, contractNoStr)
      );
      if (contractMatch) return contractMatch;
    }

    // 6. Priority 6: Match unit, tenantId by accounting month
    if (tenantIdStr) {
      const tenantMatch = receipts.find(r => 
        receiptMatchesAccountingMonth(r, targetMonth) &&
        String(r.unitId?._id || r.unitId || '') === unitIdStr &&
        String(r.tenantId?._id || r.tenantId || '') === tenantIdStr
      );
      if (tenantMatch) return tenantMatch;
    }

    // 7. Priority 7: Match unit by accounting month
    return receipts.find(r => 
      receiptMatchesAccountingMonth(r, targetMonth) &&
      String(r.unitId?._id || r.unitId || '') === unitIdStr
    ) || null;
  };

  // Resolve accurate month(s) paid for a unit/item from existing receipt or allocations
  const resolveSelectedMonthsForItem = (item, targetMonth = selectedMonth, existingReceipt = null) => {
    const rec = existingReceipt || findReceiptForUnitAndMonth(item, targetMonth);
    if (rec?.allocations && Array.isArray(rec.allocations) && rec.allocations.length > 0) {
      const positiveAllocMonths = rec.allocations
        .filter(a => Number(a.allocatedAmount ?? a.actualAllocated ?? 0) > 0 && a.rentMonthYear)
        .map(a => a.rentMonthYear);
      if (positiveAllocMonths.length > 0) {
        return [...new Set(positiveAllocMonths)];
      }
      const allAllocMonths = rec.allocations.filter(a => a.rentMonthYear).map(a => a.rentMonthYear);
      if (allAllocMonths.length > 0) {
        return [...new Set(allAllocMonths)];
      }
    }

    if (rec?.monthPaidFor) {
      const mList = String(rec.monthPaidFor).split(',').map(s => s.trim()).filter(Boolean);
      if (mList.length > 0) {
        return [...new Set(mList)];
      }
    }

    if (item?.monthPaidFor) {
      const mList = String(item.monthPaidFor).split(',').map(s => s.trim()).filter(Boolean);
      if (mList.length > 0) {
        return [...new Set(mList)];
      }
    }

    // If payment amount is zero or payment was removed, no month is paid for
    const paidAmt = Number(rec?.totalAmount ?? rec?.rentAmount ?? item?.rentAmountPaid ?? item?.actualPaidForMonth ?? 0);
    if (paidAmt === 0 && (!rec || Number(rec.totalAmount) === 0)) {
      return [];
    }

    return [targetMonth];
  };

  const sheetFilterSuggestions = React.useMemo(() => {
    return {
      accountingMonth: [formatMonthYear(selectedMonth)],
      receiptNumber: extractUniqueValues(outstandingData, d => findReceiptForUnitAndMonth(d, selectedMonth)?.receiptNumber || d.receiptNumber || 'None'),
      paidForMonth: extractUniqueValues(outstandingData, d => {
        const mList = resolveSelectedMonthsForItem(d, selectedMonth);
        return mList.length > 0 ? mList.map(m => formatMonthYear(m)).join(', ') : 'None';
      }),
      tenant: extractUniqueValues(outstandingData, d => d.tenant?.name),
      property: extractUniqueValues(outstandingData, d => d.property?.name),
      subUnit: extractUniqueValues(outstandingData, d => d.unit?.subUnitPartition || d.unit?.unitName),
      tenantPhone: extractUniqueValues(outstandingData, d => d.tenant?.phone),
      floor: extractUniqueValues(outstandingData, d => d.unit?.floor),
      paidUpTo: extractUniqueValues(outstandingData, d => d.paidTillMonth && d.paidTillMonth !== 'None' ? formatMonthYear(d.paidTillMonth) : 'None'),
      nextUnpaid: extractUniqueValues(outstandingData, d => d.nextUnpaidMonth && d.nextUnpaidMonth !== 'Up to date' ? formatMonthYear(d.nextUnpaidMonth) : 'Up to date')
    };
  }, [outstandingData]);

  const receiptFilterSuggestions = React.useMemo(() => {
    return {
      accountingMonth: extractUniqueValues(receipts, r => {
        const m = r.accountingMonth || (r.receiptDate ? new Date(r.receiptDate).toISOString().slice(0, 7) : '');
        return m ? formatMonthYear(m) : '';
      }),
      monthsCovered: extractUniqueValues(receipts, r => {
        const m = r.monthsCovered || r.paidForMonth || '';
        return m ? m.split(',').map(x => formatMonthYear(x.trim())).join(', ') : '';
      }),
      paidForMonth: extractUniqueValues(receipts, r => {
        const m = r.monthsCovered || r.paidForMonth || '';
        return m ? m.split(',').map(x => formatMonthYear(x.trim())).join(', ') : '';
      }),
      tenant: extractUniqueValues(receipts, r => r.tenantId?.name),
      propertyName: extractUniqueValues(receipts, r => r.unitId?.propertyId?.name),
      subUnitName: extractUniqueValues(receipts, r => r.unitId?.subUnitPartition || r.unitId?.unitName),
      status: ['Rented', 'Vacant'],
      receiptDate: extractUniqueValues(receipts, r => formatDate(r.receiptDate))
    };
  }, [receipts]);

  // Modals
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedLedgerModal, setSelectedLedgerModal] = useState(null);
  const [returnToLedgerModal, setReturnToLedgerModal] = useState(null);

  const handleClosePaymentModal = () => {
    setShowPaymentModal(false);
    setEditingReceiptId(null);
    setEditingReceiptObj(null);
    setPaymentModalItem(null);
    localStorage.removeItem('payments_target_tenant_id');
    localStorage.removeItem('payments_target_contract_no');
    localStorage.removeItem('payments_target_monthly_rent');
    if (returnToLedgerModal) {
      setSelectedLedgerModal(returnToLedgerModal);
      setReturnToLedgerModal(null);
    }
    const drilldown = peekDrilldown();
    if (drilldown) {
      popAndReturnDrilldown();
    }
  };

  // Browser Back button navigation: dismiss open modals back to the table
  // Note: showPaymentModal back navigation is handled inside PaymentEditModal itself
  useModalBackHandler(Boolean(selectedLedgerModal), () => setSelectedLedgerModal(null));
  useModalBackHandler(showExpenseModal, () => setShowExpenseModal(false));
  const [editingReceiptId, setEditingReceiptId] = useState(null);
  const [editingReceiptObj, setEditingReceiptObj] = useState(null);
  const [paymentModalItem, setPaymentModalItem] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);

  // Fast Payment Form State
  const [selectedTenantInfo, setSelectedTenantInfo] = useState(null);
  const [unpaidMonthsList, setUnpaidMonthsList] = useState([]);
  const [selectedMonthsMap, setSelectedMonthsMap] = useState({}); // { '2026-03': 22000, '2026-04': 22000 }
  const [showAddAdvancePicker, setShowAddAdvancePicker] = useState(false);
  const [advancePickerMonth, setAdvancePickerMonth] = useState('');
  
  const [paymentForm, setPaymentForm] = useState({
    status: 'Rented',
    tenantId: '',
    unitId: '',
    contractNo: '',
    receiptDate: new Date().toISOString().split('T')[0],
    totalAmount: '',
    comments: '',
    adjustmentAmount: '',
    adjustmentDescription: '',
  });

  // Direct Grid Entry State
  const [rowDrafts, setRowDrafts] = useState({});
  const [savingRows, setSavingRows] = useState({});
  const [deletingRowKey, setDeletingRowKey] = useState(null);
  const [savedFeedback, setSavedFeedback] = useState({});
  const [openMonthPickerRow, setOpenMonthPickerRow] = useState(null);
  const [monthPickerCoords, setMonthPickerCoords] = useState({ top: 0, left: 0 });

  // Clear drafts when selected month changes so default calculations or blanks apply fresh
  useEffect(() => {
    setRowDrafts({});
  }, [selectedMonth]);

  // Inline edit state for monthly rent rate
  const [editingRentUnitId, setEditingRentUnitId] = useState(null);
  const [editingRentValue, setEditingRentValue] = useState('');
  const [savingRentUnitId, setSavingRentUnitId] = useState(null);

  const getRowKey = (item) => item.assignmentId || `${item.tenant?._id}_${item.unit?._id}`;

  const getUpcomingMonths = (baseMonth, count = 3) => {
    if (!baseMonth) return [];
    const [y, m] = baseMonth.split('-').map(Number);
    const res = [];
    for (let i = 1; i <= count; i++) {
      const d = new Date(y, m - 1 + i, 1);
      res.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    return res;
  };

  // Intelligently determine which month should be targeted for payment in a row:
  // 1. If activeMonth (e.g. Oct 2026) is unpaid or partially paid -> target activeMonth!
  // 2. If activeMonth is already FULLY PAID:
  //    - If immediate prior month (e.g. Sep 2026) is unpaid -> target that pending month!
  //    - Otherwise -> target next upcoming month (e.g. Nov 2026 Advance)!
  // This ensures the row NEVER defaults to an already-paid month again, while keeping the user
  // free to record payments for any month (overdue or advance)!
  const getNextTargetMonth = (item, activeMonth) => {
    const monthData = item.monthsBreakdown?.find(m => m.monthYear === activeMonth);
    const expectedRate = (monthData && monthData.expectedRate > 0) ? monthData.expectedRate : (item.monthlyRentExpected || item.unit?.monthlyRentExpected || 0);
    const paidThisMonth = monthData ? monthData.allocatedAmount : 0;
    const isCurrentPaid = paidThisMonth >= expectedRate && expectedRate > 0;

    // Case 1: Active month is NOT fully paid
    if (!isCurrentPaid) {
      const remaining = Math.max(0, expectedRate - paidThisMonth);
      return {
        targetMonth: activeMonth,
        amount: remaining > 0 ? remaining : expectedRate,
        isAdvance: false,
        isOverdue: false,
        isCurrentPaid: false
      };
    }

    // Case 2: Active month IS fully paid.
    // If the tenant is paid up to activeMonth (or beyond), target the NEXT month (e.g. Nov 2026)!
    const [y, m] = activeMonth.split('-').map(Number);
    const prevDate = new Date(y, m - 2, 1);
    const prevMonthStr = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
    const prevMonthData = item.monthsBreakdown?.find(bm => bm.monthYear === prevMonthStr);
    
    // Only target immediate prior month if it was unpaid and rent is behind
    if (prevMonthData && (prevMonthData.status === 'Unpaid' || prevMonthData.status === 'Partially Paid') && item.paidTillMonth && item.paidTillMonth < activeMonth) {
      const remaining = prevMonthData.outstandingAmount > 0 ? prevMonthData.outstandingAmount : prevMonthData.expectedRate;
      return {
        targetMonth: prevMonthStr,
        amount: remaining || expectedRate,
        isAdvance: false,
        isOverdue: true,
        isCurrentPaid: true
      };
    }

    // Case 3: All recent rent is settled! Target the earliest upcoming unpaid month (e.g. Nov 2026 Advance)
    let curDate = new Date(y, m, 1); // 1 month ahead
    for (let i = 0; i < 12; i++) {
      const futureMonthStr = `${curDate.getFullYear()}-${String(curDate.getMonth() + 1).padStart(2, '0')}`;
      const futureData = item.monthsBreakdown?.find(bm => bm.monthYear === futureMonthStr);
      const futurePaid = futureData ? futureData.allocatedAmount : 0;
      const futureExp = futureData ? futureData.expectedRate : expectedRate;
      if (futurePaid < futureExp) {
        return {
          targetMonth: futureMonthStr,
          amount: Math.max(0, futureExp - futurePaid) || expectedRate,
          isAdvance: true,
          isOverdue: false,
          isCurrentPaid: true
        };
      }
      curDate.setMonth(curDate.getMonth() + 1);
    }

    // Default fallback: next month
    const nextDate = new Date(y, m, 1);
    const fallbackStr = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}`;
    return {
      targetMonth: fallbackStr,
      amount: expectedRate,
      isAdvance: true,
      isOverdue: false,
      isCurrentPaid: true
    };
  };

  // Get all payable months for a tenant:
  // 1. Accounting month as 1st month
  // 2. Followed by previous months in descending order (e.g., if accounting month is Dec '25 -> Nov '25, Oct '25, Sep '25...)
  // 3. Followed by upcoming advance months
  const getPayableMonthsList = (item, activeMonth, currentSelectedMonths = []) => {
    const defaultRate = item.monthlyRentExpected || item.unit?.monthlyRentExpected || 0;
    const list = [];

    // Parse activeMonth (YYYY-MM)
    const [actYearStr, actMonthStr] = (activeMonth || '').split('-');
    const actYear = parseInt(actYearStr, 10) || new Date().getFullYear();
    const actMonth = parseInt(actMonthStr, 10) || (new Date().getMonth() + 1);

    // 1. Active accounting month (1st month)
    const activeData = item.monthsBreakdown?.find(m => m.monthYear === activeMonth);
    const activePaid = activeData ? activeData.allocatedAmount : 0;
    const activeExpected = activeData ? activeData.expectedRate : defaultRate;
    const remainingActive = Math.max(0, activeExpected - activePaid);

    list.push({
      monthYear: activeMonth,
      dueAmount: remainingActive > 0 ? remainingActive : (activeExpected || defaultRate),
      type: 'current'
    });

    // 2. Previous months in descending order (e.g. if accounting month is Dec '25 -> Nov '25, Oct '25, Sep '25...)
    for (let i = 1; i <= 12; i++) {
      const d = new Date(actYear, actMonth - 1 - i, 1);
      const mStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const mData = item.monthsBreakdown?.find(b => b.monthYear === mStr);
      const paid = mData ? mData.allocatedAmount : 0;
      const exp = mData ? mData.expectedRate : defaultRate;
      const remaining = mData ? (mData.outstandingAmount > 0 ? mData.outstandingAmount : Math.max(0, exp - paid)) : defaultRate;

      list.push({
        monthYear: mStr,
        dueAmount: remaining > 0 ? remaining : defaultRate,
        type: 'past'
      });
    }

    // 3. Upcoming advance months (at least 2 months in future, showing 6 months in chronological order)
    const upcoming = getUpcomingMonths(activeMonth, 6);
    upcoming.forEach(mStr => {
      const fData = item.monthsBreakdown?.find(bm => bm.monthYear === mStr);
      const fPaid = fData ? fData.allocatedAmount : 0;
      const fExp = fData ? fData.expectedRate : defaultRate;
      list.push({
        monthYear: mStr,
        dueAmount: Math.max(0, fExp - fPaid) || defaultRate,
        type: 'advance'
      });
    });

    // 4. Any month in currentSelectedMonths not already in list
    currentSelectedMonths.forEach(mStr => {
      if (!list.some(x => x.monthYear === mStr)) {
        const isAdv = mStr > activeMonth;
        const isPast = mStr < activeMonth;
        list.push({
          monthYear: mStr,
          dueAmount: defaultRate,
          type: isAdv ? 'advance' : isPast ? 'past' : 'current'
        });
      }
    });

    // Deduplicate while preserving order: Accounting Month 1st, then past months (Nov 25, Oct 25, Sep 25...), then advance months
    const uniqueMap = new Map();
    list.forEach(mItem => {
      if (!uniqueMap.has(mItem.monthYear)) {
        uniqueMap.set(mItem.monthYear, mItem);
      }
    });

    return Array.from(uniqueMap.values());
  };

  const getRowDraft = (item) => {
    const rowKey = getRowKey(item);
    if (rowDrafts[rowKey]) {
      return rowDrafts[rowKey];
    }

    const monthData = item.monthsBreakdown?.find(m => m.monthYear === selectedMonth);

    // Direct check in receipts array for this unit and tenant for selectedMonth
    const directAllocated = receipts
      .filter(r => !r.isReversed &&
        (r.unitId?._id === item.unit?._id || r.unitId === item.unit?._id) &&
        (!item.tenant?._id || r.tenantId?._id === item.tenant?._id || r.tenantId === item.tenant?._id)
      )
      .reduce((sum, r) => {
        const alloc = r.allocations?.find(a => a.rentMonthYear === selectedMonth);
        return sum + (alloc ? Number(alloc.allocatedAmount || 0) : 0);
      }, 0);

    const existingReceipt = findReceiptForUnitAndMonth(item, selectedMonth);
    const existingTotal = (existingReceipt && !existingReceipt.isReversed && existingReceipt.totalAmount !== undefined && existingReceipt.status !== 'Vacant')
      ? Number(existingReceipt.totalAmount)
      : null;

    const paidThisMonth = existingTotal !== null
      ? existingTotal
      : (directAllocated > 0
          ? directAllocated
          : (monthData ? (monthData.actualAllocated ?? monthData.allocatedAmount ?? 0) : (item.actualPaidForMonth || 0)));

    const existingRent = (existingReceipt && !existingReceipt.isReversed && existingReceipt.rentAmount !== undefined && existingReceipt.status !== 'Vacant')
      ? Number(existingReceipt.rentAmount)
      : null;
    const existingDeposit = (existingReceipt && !existingReceipt.isReversed && existingReceipt.depositAmount !== undefined && existingReceipt.status !== 'Vacant')
      ? Number(existingReceipt.depositAmount)
      : 0;

    const defaultTotal = paidThisMonth > 0 ? String(paidThisMonth) : '0';
    const defaultDeposit = existingDeposit > 0 ? String(existingDeposit) : '0';
    const defaultRent = existingRent !== null
      ? String(existingRent)
      : (paidThisMonth > 0 ? String(paidThisMonth - existingDeposit) : '0');

    const rowStatus = existingReceipt?.status || item.status || (item.tenant ? 'Rented' : 'Vacant');
    const initialSelectedMonths = resolveSelectedMonthsForItem(item, selectedMonth, existingReceipt);

    return {
      status: rowStatus,
      rentAmount: rowStatus === 'Vacant' ? '0' : defaultRent,
      depositAmount: rowStatus === 'Vacant' ? '0' : defaultDeposit,
      amount: rowStatus === 'Vacant' ? '0' : defaultTotal,
      selectedMonths: initialSelectedMonths,
    };
  };

  const updateRowDraft = (rowKey, patch, item) => {
    setRowDrafts(prev => {
      const current = prev[rowKey] || (item ? getRowDraft(item) : {
        rentAmount: '',
        depositAmount: '0',
        amount: '',
        selectedMonths: [selectedMonth],
      });

      const merged = { ...current, ...patch };

      // If rentAmount changed directly, update amount (Total Amount Paid = rentAmount + depositAmount)
      if (patch.rentAmount !== undefined && patch.amount === undefined) {
        const rVal = patch.rentAmount === '' ? '' : Number(patch.rentAmount) || 0;
        const dVal = Number(merged.depositAmount) || 0;
        merged.amount = (patch.rentAmount === '' && (!merged.depositAmount || merged.depositAmount === '0'))
          ? ''
          : String((patch.rentAmount === '' ? 0 : rVal) + dVal);
      }
      // If depositAmount changed directly, update amount (Total Amount Paid = rentAmount + depositAmount)
      else if (patch.depositAmount !== undefined && patch.amount === undefined) {
        const rVal = Number(merged.rentAmount) || 0;
        const dVal = patch.depositAmount === '' ? '' : Number(patch.depositAmount) || 0;
        merged.amount = (merged.rentAmount === '' && patch.depositAmount === '')
          ? ''
          : String(rVal + (patch.depositAmount === '' ? 0 : dVal));
      }
      // If amount (Total Amount Paid) changed directly, default into rentAmount
      else if (patch.amount !== undefined && patch.rentAmount === undefined) {
        if (patch.amount === '') {
          merged.rentAmount = '';
        } else {
          const tVal = Number(patch.amount) || 0;
          const dVal = Number(merged.depositAmount) || 0;
          merged.rentAmount = String(Math.max(0, tVal - dVal));
        }
      }

      return {
        ...prev,
        [rowKey]: merged
      };
    });
  };

  const handleSaveRentRate = async (unitId) => {
    if (!unitId) return;
    const rateNum = Number(editingRentValue);
    if (isNaN(rateNum) || rateNum < 0) {
      alert('Please enter a valid monthly rent amount.');
      return;
    }
    try {
      setSavingRentUnitId(unitId);
      const res = await API.put(`/units/${unitId}`, {
        monthlyRentExpected: rateNum,
        monthlyRate: rateNum
      });
      if (res.data.success) {
        setEditingRentUnitId(null);
        await fetchData(selectedMonth, { silent: true });
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to update monthly rent rate.');
    } finally {
      setSavingRentUnitId(null);
    }
  };

  const handleToggleMonthForRow = (item, monthStr) => {
    const rowKey = getRowKey(item);
    const current = getRowDraft(item);
    const currentMonths = current.selectedMonths || [];
    let nextMonths;
    if (currentMonths.includes(monthStr)) {
      nextMonths = currentMonths.filter(m => m !== monthStr);
    } else {
      nextMonths = [...currentMonths, monthStr];
    }

    const payable = getPayableMonthsList(item, selectedMonth, nextMonths);
    const payableOrder = payable.map(p => p.monthYear);
    nextMonths.sort((a, b) => {
      const idxA = payableOrder.indexOf(a);
      const idxB = payableOrder.indexOf(b);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      return a.localeCompare(b);
    });

    let totalAmt = 0;
    nextMonths.forEach(m => {
      const pm = payable.find(p => p.monthYear === m);
      if (pm) {
        totalAmt += pm.dueAmount;
      } else {
        const md = item.monthsBreakdown?.find(b => b.monthYear === m);
        const defaultRate = item.monthlyRentExpected || item.unit?.monthlyRentExpected || 0;
        totalAmt += md ? (md.outstandingAmount || md.expectedRate || defaultRate) : defaultRate;
      }
    });

    const depNum = Number(current.depositAmount) || 0;
    updateRowDraft(rowKey, {
      ...current,
      selectedMonths: nextMonths,
      rentAmount: String(totalAmt),
      amount: String(totalAmt + depNum)
    }, item);
  };

  // Permanently delete payment receipt for a row on the collection screen
  const handleDeleteRowReceipt = async (item, receiptToDelete) => {
    const unitIdStr = String(item?.unit?._id || item?.unitId?._id || item?.unitId || item?.unit || '');
    const rowReceipts = receipts.filter(r => 
      !r.isReversed &&
      String(r.unitId?._id || r.unitId || '') === unitIdStr &&
      r.allocations?.some(a => a.rentMonthYear === selectedMonth)
    );

    const targetReceipt = receiptToDelete || rowReceipts[0];
    if (!targetReceipt) {
      alert('No payment record found for this month to delete.');
      return;
    }

    const totalAmt = rowReceipts.length > 0
      ? rowReceipts.reduce((sum, r) => sum + Number(r.totalAmount || 0), 0)
      : Number(targetReceipt.totalAmount || 0);
    const unitName = item.unit?.subUnitPartition || item.unit?.unitName || 'this unit';
    const tenantName = item.tenant?.name || 'this tenant';
    const confirmMsg = `Permanently delete payment record of ₹${Number(totalAmt).toLocaleString('en-IN')} for ${tenantName} (${unitName}) for ${formatMonthYear(selectedMonth)}? This cannot be undone.`;

    if (!window.confirm(confirmMsg)) return;

    const rowKey = getRowKey(item);
    try {
      setDeletingRowKey(rowKey);
      // Delete target receipt(s) for this month
      for (const r of (rowReceipts.length > 0 ? rowReceipts : [targetReceipt])) {
        await API.delete(`/payments/${r._id}/permanent`);
      }
      setRowDrafts(prev => {
        const copy = { ...prev };
        delete copy[rowKey];
        return copy;
      });
      await fetchData(selectedMonth, { silent: true });
    } catch (err) {
      alert(err.response?.data?.message || 'Error deleting payment receipt');
    } finally {
      setDeletingRowKey(null);
    }
  };

  // Change Status between Rented and Vacant directly on the collection screen irrespective of contract
  const handleRowStatusChange = async (item, newStatus) => {
    const rowKey = getRowKey(item);
    const isVacant = newStatus === 'Vacant';

    updateRowDraft(rowKey, { 
      status: newStatus,
      ...(isVacant ? { rentAmount: '0', depositAmount: '0', amount: '0', contractNo: '' } : {})
    }, item);

    const existingReceipt = findReceiptForUnitAndMonth(item, selectedMonth);
    const targetMonth = selectedMonth;
    const unitId = item.unit?._id || item.unitId;

    try {
      setSavingRows(prev => ({ ...prev, [rowKey]: true }));
      if (existingReceipt) {
        const prevRent = isVacant ? 0 : Number(existingReceipt.rentAmount ?? existingReceipt.totalAmount ?? 0);
        const prevDep = isVacant ? 0 : Number(existingReceipt.depositAmount || 0);
        const prevTot = isVacant ? 0 : Number(existingReceipt.totalAmount || 0);
        await API.put(`/payments/${existingReceipt._id}`, {
          status: newStatus,
          tenantId: isVacant ? null : (item.tenant?._id || item.tenantId || null),
          contractNo: isVacant ? '' : (item.contractNo || ''),
          rentAmount: prevRent,
          depositAmount: prevDep,
          totalAmount: prevTot,
          accountingMonth: targetMonth,
          allocations: [{
            rentMonthYear: targetMonth,
            allocatedAmount: prevRent,
            contractNo: isVacant ? '' : (item.contractNo || ''),
            notes: isVacant ? 'Unit marked as vacant' : `Rent collection for ${formatMonthYear(targetMonth)}`
          }]
        });
      } else {
        const expRent = isVacant ? 0 : (item.monthlyRentExpected || 0);
        await API.post('/payments', {
          unitId,
          tenantId: isVacant ? null : (item.tenant?._id || item.tenantId || null),
          contractNo: isVacant ? '' : (item.contractNo || ''),
          status: newStatus,
          receiptDate: `${targetMonth}-15`,
          accountingMonth: targetMonth,
          rentAmount: expRent,
          depositAmount: 0,
          totalAmount: expRent,
          allocations: [{
            rentMonthYear: targetMonth,
            allocatedAmount: expRent,
            contractNo: isVacant ? '' : (item.contractNo || ''),
            notes: isVacant ? 'Unit marked as vacant' : `Rent collection for ${formatMonthYear(targetMonth)}`
          }]
        });
      }

      setSavedFeedback(prev => ({ ...prev, [rowKey]: true }));
      setTimeout(() => setSavedFeedback(prev => ({ ...prev, [rowKey]: false })), 2000);
      await fetchData(selectedMonth, { silent: true });
    } catch (err) {
      alert(err.response?.data?.message || 'Error updating status');
    } finally {
      setSavingRows(prev => ({ ...prev, [rowKey]: false }));
    }
  };

  const handleDirectSaveRow = async (item) => {
    const rowKey = getRowKey(item);
    if (savingRows[rowKey]) return;

    const draft = getRowDraft(item);
    const enteredRaw = draft.amount;
    const enteredTotal = Number(enteredRaw);

    // Target month is strictly selectedMonth on the collection sheet
    const targetMonth = selectedMonth;

    // Check if an existing payment receipt already exists for this unit & month
    const existingReceipt = findReceiptForUnitAndMonth(item, targetMonth);

    // Case 1: Amount is explicitly set to 0 or cleared -> Set payment to 0 cleanly
    if (enteredRaw === '0' || (!isNaN(enteredTotal) && enteredTotal === 0) || (enteredRaw === '' && existingReceipt)) {
      try {
        setSavingRows(prev => ({ ...prev, [rowKey]: true }));
        const unitIdStr = String(item.unit?._id || item.unitId || '');
        const targetReceipts = receipts.filter(r => {
          if (r.isReversed) return false;
          if (String(r.unitId?._id || r.unitId || '') !== unitIdStr) return false;
          const rAcct = r.accountingMonth 
            ? String(r.accountingMonth).slice(0, 7) 
            : (r.receiptDate ? new Date(r.receiptDate).toISOString().slice(0, 7) : '');
          return rAcct === targetMonth;
        });

        const toDelete = targetReceipts.length > 0 ? targetReceipts : (existingReceipt ? [existingReceipt] : []);
        for (const r of toDelete) {
          try {
            await API.delete(`/payments/${r._id}`);
          } catch (e) {
            console.warn('Silent delete fallback:', e);
          }
        }

        setSavedFeedback(prev => ({ ...prev, [rowKey]: true }));
        setTimeout(() => setSavedFeedback(prev => ({ ...prev, [rowKey]: false })), 2500);
        setRowDrafts(prev => {
          const copy = { ...prev };
          delete copy[rowKey];
          return copy;
        });
        await fetchData(selectedMonth, { silent: true });
      } catch (err) {
        console.error('Error setting payment to 0:', err);
      } finally {
        setSavingRows(prev => ({ ...prev, [rowKey]: false }));
      }
      return;
    }

    if (isNaN(enteredTotal) || enteredTotal < 0) {
      alert('Please enter a valid amount (0 or greater).');
      return;
    }

    // Set saving state immediately to lock the button against fast double-clicks
    setSavingRows(prev => ({ ...prev, [rowKey]: true }));

    const monthlyRate = item.monthlyRentExpected || item.unit?.monthlyRentExpected || item.monthsBreakdown?.[0]?.expectedRate || 0;
    const matchingContracts = getMatchingContractsForRow(item, selectedMonth);
    const resolvedContractNo = draft.contractNo || item.contractNo || matchingContracts[0]?.contractNo || '';

    const currentMY = getCurrentMonthYear();
    const receiptDate = selectedMonth === currentMY 
      ? new Date().toISOString().split('T')[0] 
      : `${selectedMonth}-15`;

    const enteredDeposit = Number(draft.depositAmount) || 0;
    const enteredRent = draft.rentAmount !== undefined && draft.rentAmount !== ''
      ? Number(draft.rentAmount)
      : Math.max(0, enteredTotal - enteredDeposit);

    const targetMonths = (draft.selectedMonths && draft.selectedMonths.length > 0)
      ? draft.selectedMonths
      : resolveSelectedMonthsForItem(item, targetMonth, existingReceipt);

    let rem = enteredRent;
    const singleAllocation = targetMonths.map((m, idx) => {
      const allocated = (idx === targetMonths.length - 1)
        ? rem
        : Math.min(rem, monthlyRate);
      rem = Math.max(0, rem - allocated);
      return {
        rentMonthYear: m,
        allocatedAmount: allocated,
        contractNo: resolvedContractNo,
        notes: `Rent collection for ${formatMonthYear(m)}`
      };
    });

    try {
      if (existingReceipt) {
        // EDIT EXISTING RECORD IN PLACE - NEVER ADD TO RECORD (with fallback if 404)
        try {
          await API.put(`/payments/${existingReceipt._id}`, {
            rentAmount: enteredRent,
            depositAmount: enteredDeposit,
            totalAmount: enteredTotal,
            contractNo: resolvedContractNo || existingReceipt.contractNo,
            accountingMonth: targetMonth,
            monthPaidFor: targetMonths.join(', '),
            status: existingReceipt.status || (item.tenant ? 'Rented' : 'Vacant'),
            allocations: singleAllocation
          });
        } catch (putErr) {
          if (putErr.response?.status === 404) {
            await API.post('/payments', {
              tenantId: item.tenant?._id || null,
              unitId: item.unit?._id,
              contractNo: resolvedContractNo,
              receiptDate,
              accountingMonth: targetMonth,
              monthPaidFor: targetMonths.join(', '),
              rentAmount: enteredRent,
              depositAmount: enteredDeposit,
              totalAmount: enteredTotal,
              status: item.tenant ? 'Rented' : 'Vacant',
              comments: `Direct collection for ${formatMonthYear(targetMonth)}`,
              allocations: singleAllocation
            });
          } else {
            throw putErr;
          }
        }

        // Clean up any extra duplicate receipts for this exact unit and month to keep single-entry integrity
        const unitIdStr = String(item.unit?._id || item.unitId || '');
        const duplicates = receipts.filter(r => 
          !r.isReversed &&
          r._id.toString() !== existingReceipt._id.toString() &&
          String(r.unitId?._id || r.unitId || '') === unitIdStr &&
          r.allocations?.some(a => a.rentMonthYear === targetMonth)
        );
        for (const dup of duplicates) {
          try { await API.delete(`/payments/${dup._id}/permanent`); } catch(e){}
        }
      } else {
        // CREATE single entry record
        const payload = {
          tenantId: item.tenant?._id || null,
          unitId: item.unit?._id,
          contractNo: resolvedContractNo,
          receiptDate,
          accountingMonth: targetMonth,
          rentAmount: enteredRent,
          depositAmount: enteredDeposit,
          totalAmount: enteredTotal,
          status: item.tenant ? 'Rented' : 'Vacant',
          comments: `Direct collection for ${formatMonthYear(targetMonth)}`,
          allocations: singleAllocation
        };
        await API.post('/payments', payload);
      }

      setSavedFeedback(prev => ({ ...prev, [rowKey]: true }));
      setTimeout(() => setSavedFeedback(prev => ({ ...prev, [rowKey]: false })), 2500);

      // Clear draft to reset row to fresh state
      setRowDrafts(prev => {
        const copy = { ...prev };
        delete copy[rowKey];
        return copy;
      });
      setOpenMonthPickerRow(null);

      // Refresh data
      await fetchData(selectedMonth, { silent: true });
    } catch (err) {
      alert(err.response?.data?.message || 'Error saving payment.');
    } finally {
      setSavingRows(prev => ({ ...prev, [rowKey]: false }));
    }
  };

  // Fetch summary and records (fast, resilient, with background reload and master caching)
  const fetchData = async (targetMonth = selectedMonth, { silent = false } = {}) => {
    try {
      if (!silent) setLoading(true);

      const fetchMasters = !mastersLoadedRef.current || tenants.length === 0 || units.length === 0;

      const promises = [
        API.get(`/payments/outstanding-summary?upToMonthYear=${targetMonth}`),
        API.get('/payments'),
        API.get(`/expenses?month=${targetMonth}`),
        API.get(`/ledger?startMonth=${targetMonth}&endMonth=${targetMonth}`),
        API.get('/assignments')
      ];

      if (fetchMasters) {
        promises.push(
          API.get('/tenants'),
          API.get('/units'),
          API.get('/properties'),
          API.get('/expenses/categories')
        );
      }

      const results = await Promise.allSettled(promises);

      // Process month-dependent responses safely
      if (results[0].status === 'fulfilled' && results[0].value.data?.success) {
        setOutstandingData(results[0].value.data.data);
      }
      if (results[1].status === 'fulfilled' && results[1].value.data?.success) {
        setReceipts(results[1].value.data.data);
      }
      if (results[2].status === 'fulfilled' && results[2].value.data?.success) {
        setMonthExpenses(results[2].value.data.data || []);
      }
      if (results[3].status === 'fulfilled' && results[3].value.data?.success && results[3].value.data.data?.length > 0) {
        setPrevMonthBalance(results[3].value.data.data[0].openingBalance || 0);
      } else {
        setPrevMonthBalance(0);
      }
      if (results[4].status === 'fulfilled' && results[4].value.data?.success) {
        setAssignments(results[4].value.data.data || []);
      }

      // Process master lists if fetched
      if (fetchMasters && results.length >= 9) {
        if (results[5].status === 'fulfilled' && results[5].value.data?.success) {
          setTenants(results[5].value.data.data);
        }
        if (results[6].status === 'fulfilled' && results[6].value.data?.success) {
          setUnits(results[6].value.data.data);
        }
        if (results[7].status === 'fulfilled' && results[7].value.data?.success) {
          setProperties(results[7].value.data.data);
        }
        if (results[8].status === 'fulfilled' && results[8].value.data?.success) {
          setExpenseCategories(results[8].value.data.data || []);
        }
        mastersLoadedRef.current = true;
      }
    } catch (err) {
      console.error('Error fetching rent and payment data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData(selectedMonth, { silent: false });
  }, [selectedMonth]);

  // Navigate months
  const handlePrevMonth = () => {
    const [y, m] = selectedMonth.split('-').map(Number);
    const d = new Date(y, m - 2, 1);
    const prev = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    setSelectedMonth(prev);
  };

  const handleNextMonth = () => {
    const [y, m] = selectedMonth.split('-').map(Number);
    const d = new Date(y, m, 1);
    const next = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    setSelectedMonth(next);
  };

  const handleSelectCustomMonth = (e) => {
    if (e.target.value) {
      setSelectedMonth(e.target.value);
    }
  };

  // Helper to sync selected months, total amount and dynamic comments
  const syncPaymentState = (newSelectedMap, tenantId, unitId) => {
    setSelectedMonthsMap(newSelectedMap);

    const total = Object.values(newSelectedMap).reduce((s, v) => s + Number(v || 0), 0);
    const activeMonths = Object.keys(newSelectedMap).sort();

    let autoComment = '';
    if (activeMonths.length > 0) {
      autoComment = `Rent collection for ${activeMonths.map(formatMonthYear).join(', ')}`;
    }

    setPaymentForm(f => ({
      ...f,
      tenantId: tenantId !== undefined ? tenantId : f.tenantId,
      unitId: unitId !== undefined ? unitId : f.unitId,
      totalAmount: String(total),
      comments: autoComment || 'Rent payment'
    }));
  };

  // Get matching lease contracts for a tenant & partition active in accounting month
  const getMatchingContractsForRow = (item, monthToMatch = selectedMonth) => {
    const tId = String(item.tenant?._id || item.tenant || '');
    const uId = String(item.unit?._id || item.unit || '');
    if (!tId || !uId || !assignments || assignments.length === 0) {
      if (item.contractNo) {
        return [{ _id: item.assignmentId, contractNo: item.contractNo }];
      }
      return [];
    }

    const matches = assignments.filter(c => {
      const cTId = String(c.tenantId?._id || c.tenantId || '');
      const cUId = String(c.unitId?._id || c.unitId || '');
      if (cTId !== tId || cUId !== uId) return false;

      // Check date range: startDate <= monthToMatch && (!endDate || endDate >= monthToMatch)
      const sMonth = c.startDate ? c.startDate.slice(0, 7) : null;
      const eMonth = c.endDate ? c.endDate.slice(0, 7) : null;
      if (sMonth && sMonth > monthToMatch) return false;
      if (eMonth && eMonth < monthToMatch) return false;
      return true;
    });

    if (matches.length === 0 && item.contractNo) {
      return [{ _id: item.assignmentId, contractNo: item.contractNo }];
    }
    return matches;
  };

  // Open modal to add an expense (either Property or Other)
  const openAddExpenseModal = (headType = 'Property', defaultPropId = '') => {
    setEditingExpense(null);
    const normHeadType = headType === 'Common' ? 'Other' : headType;
    const firstCat = expenseCategories.find(c => c.headType === normHeadType || (normHeadType === 'Other' && c.headType === 'Common'))?.name || (normHeadType === 'Property' ? 'Repairs & Renovation' : 'Miscellaneous');
    const chosenPropId = normHeadType === 'Property' ? (defaultPropId || selectedPropertyFilter || properties[0]?._id || '') : '';
    setExpenseForm({
      headType: normHeadType,
      propertyId: chosenPropId,
      unitId: '',
      category: firstCat,
      amount: '',
      expenseMonth: selectedMonth,
      expenseDate: `${selectedMonth}-01`,
      description: ''
    });
    setShowExpenseModal(true);
  };

  // Open modal to edit an existing expense record
  const openEditExpenseModal = (exp) => {
    setEditingExpense(exp);
    const pId = exp.propertyId?._id || exp.propertyId || '';
    const uId = exp.unitId?._id || exp.unitId || '';
    const normHeadType = exp.headType ? (exp.headType === 'Common' ? 'Other' : exp.headType) : (pId ? 'Property' : 'Other');
    setExpenseForm({
      headType: normHeadType,
      propertyId: pId,
      unitId: uId,
      category: exp.category || '',
      amount: String(exp.amount || ''),
      expenseMonth: exp.expenseMonth || (exp.expenseDate ? exp.expenseDate.slice(0, 7) : selectedMonth),
      expenseDate: exp.expenseDate ? exp.expenseDate.slice(0, 10) : `${selectedMonth}-01`,
      description: exp.description || ''
    });
    setShowExpenseModal(true);
  };

  // Save (Create or Update) Expense
  const handleSaveExpense = async (e) => {
    e?.preventDefault();
    if (!expenseForm.category?.trim()) {
      alert('Please select an expense head/category.');
      return;
    }
    const amt = Number(expenseForm.amount);
    if (isNaN(amt) || amt <= 0) {
      alert('Please enter a valid expense amount.');
      return;
    }
    if (expenseForm.headType === 'Property' && !expenseForm.propertyId) {
      alert('Please select a property for this property-wise expense.');
      return;
    }

    try {
      setSavingExpense(true);
      const payload = {
        headType: expenseForm.headType === 'Common' ? 'Other' : expenseForm.headType,
        propertyId: expenseForm.headType === 'Property' ? expenseForm.propertyId : null,
        unitId: expenseForm.headType === 'Property' ? (expenseForm.unitId || null) : null,
        category: expenseForm.category.trim(),
        amount: amt,
        expenseMonth: expenseForm.expenseMonth || selectedMonth,
        expenseDate: expenseForm.expenseDate ? new Date(expenseForm.expenseDate) : new Date(`${selectedMonth}-01`),
        description: expenseForm.description?.trim() || ''
      };

      if (editingExpense) {
        await API.put(`/expenses/${editingExpense._id}`, payload);
      } else {
        await API.post('/expenses', payload);
      }
      setShowExpenseModal(false);
      await fetchData(selectedMonth, { silent: true });
    } catch (err) {
      alert(err.response?.data?.message || 'Error saving expense record.');
    } finally {
      setSavingExpense(false);
    }
  };

  // Delete / Reverse Expense Record
  const handleDeleteExpense = async (expId, categoryName, amount) => {
    if (!window.confirm(`Are you sure you want to remove the expense for ${categoryName || 'this item'} (₹${Number(amount || 0).toLocaleString('en-IN')})?`)) {
      return;
    }
    try {
      await API.post(`/expenses/${expId}/reverse`, {
        reversalReason: 'Reversed from Rents & Payments view'
      });
      await fetchData(selectedMonth, { silent: true });
    } catch (err) {
      alert(err.response?.data?.message || 'Error reversing expense.');
    }
  };

  // Auto-select contract number based on tenant, unit, and the target rent month
  const resolveContractForTargetMonth = (tId, uId, targetMonth) => {
    if (!tId || !uId || !assignments || assignments.length === 0) return '';
    const tStr = String(tId?._id || tId);
    const uStr = String(uId?._id || uId);
    const matches = assignments.filter(c => {
      const cTId = String(c.tenantId?._id || c.tenantId || '');
      const cUId = String(c.unitId?._id || c.unitId || '');
      if (cTId !== tStr || cUId !== uStr) return false;
      if (!targetMonth) return true;
      const sMonth = c.startDate ? c.startDate.slice(0, 7) : null;
      const eMonth = c.endDate ? c.endDate.slice(0, 7) : null;
      if (sMonth && sMonth > targetMonth) return false;
      if (eMonth && eMonth < targetMonth) return false;
      return true;
    });
    if (matches.length > 0) {
      return matches[0].contractNo || matches[0].assignmentCode || '';
    }
    return '';
  };

    // Open Fast Payment Modal for a specific row / tenant
  const openFastPaymentModal = (item) => {
    const existingReceipt = findReceiptForUnitAndMonth(item, selectedMonth);
    setEditingReceiptId(existingReceipt ? existingReceipt._id : null);
    setEditingReceiptObj(existingReceipt || null);
    setPaymentModalItem(item);
    setShowPaymentModal(true);
  };

  // Open Modal to Edit an Existing Receipt
  const openEditReceiptModal = (receipt, fromLedgerModal = null) => {
    if (fromLedgerModal) {
      setReturnToLedgerModal(fromLedgerModal);
      setSelectedLedgerModal(null);
    }
    setEditingReceiptId(receipt._id);
    setEditingReceiptObj(receipt);
    setPaymentModalItem(null);
    setShowPaymentModal(true);
  };

  // Auto-open Edit Month / Payment modal if navigated from reports (Property Monthly Report, Rent Report, All Income, etc.)
  useEffect(() => {
    const checkIncomingEditRequest = () => {
      // 1. ALWAYS apply incoming month and filters first
      const savedMonth = localStorage.getItem('payments_selected_month');
      if (savedMonth && savedMonth !== selectedMonth) {
        setSelectedMonth(savedMonth);
      }

      const savedPropFilter = localStorage.getItem('payments_prop_filter');
      if (savedPropFilter !== null && savedPropFilter !== selectedPropertyFilter) {
        setSelectedPropertyFilter(savedPropFilter);
      }

      const savedTenantFilter = localStorage.getItem('payments_target_tenant_id') || localStorage.getItem('payments_tenant_filter');
      if (savedTenantFilter && savedTenantFilter !== selectedTenantFilter) {
        setSelectedTenantFilter(savedTenantFilter);
      }

      // 2. Open edit receipt modal if a specific receipt edit was requested
      const targetReceiptId = localStorage.getItem('payments_edit_receipt_id');
      if (targetReceiptId) {
        localStorage.removeItem('payments_edit_receipt_id');
        localStorage.removeItem('payments_target_unit_id');
        setEditingReceiptId(targetReceiptId);
        const existingObj = (receipts || []).find(r => String(r._id) === String(targetReceiptId));
        setEditingReceiptObj(existingObj || null);
        setPaymentModalItem(null);
        setShowPaymentModal(true);
        return;
      }

      // 3. If already actively editing a receipt, protect it from being overridden by background data updates
      if (showPaymentModal && editingReceiptId) {
        return;
      }

      // 4. Open fast payment modal for a unit if requested
      const targetUnitId = localStorage.getItem('payments_target_unit_id');
      if (targetUnitId && outstandingData && outstandingData.length > 0) {
        localStorage.removeItem('payments_target_unit_id');
        const matched = outstandingData.find(d => String(d.unit?._id || d.unitId || '') === String(targetUnitId));
        if (matched) {
          openFastPaymentModal(matched);
        }
      }
    };

    checkIncomingEditRequest();
    window.addEventListener('hashchange', checkIncomingEditRequest);
    window.addEventListener('popstate', checkIncomingEditRequest);
    window.addEventListener('app_check_edit_request', checkIncomingEditRequest);
    return () => {
      window.removeEventListener('hashchange', checkIncomingEditRequest);
      window.removeEventListener('popstate', checkIncomingEditRequest);
      window.removeEventListener('app_check_edit_request', checkIncomingEditRequest);
    };
  }, [selectedMonth, outstandingData, showPaymentModal, editingReceiptId]);

  // Keep editingReceiptObj synchronized once receipts load asynchronously
  useEffect(() => {
    if (editingReceiptId && !editingReceiptObj && receipts && receipts.length > 0) {
      const matched = receipts.find(r => String(r._id) === String(editingReceiptId));
      if (matched) {
        setEditingReceiptObj(matched);
      }
    }
  }, [receipts, editingReceiptId, editingReceiptObj]);

  // Cancel / Reverse Receipt

  const handleReverseReceipt = async (id) => {
    const reason = prompt('Why are you cancelling this payment receipt?');
    if (!reason || !reason.trim()) return;
    try {
      await API.post(`/payments/${id}/reverse`, { reversalReason: reason.trim() });
      fetchData(selectedMonth, { silent: true });
    } catch (err) {
      alert(err.response?.data?.message || 'Could not cancel receipt.');
    }
  };

  // Delete Receipt
  const handleDeleteReceipt = async (id) => {
    if (!window.confirm('Permanently delete this payment receipt? This cannot be undone.')) return;
    try {
      await API.delete(`/payments/${id}`);
      fetchData(selectedMonth, { silent: true });
    } catch (err) {
      alert(err.response?.data?.message || 'Could not delete receipt.');
    }
  };

  // Distinct months present across all payment receipts for multi-month filtering
  const availableReceiptMonths = React.useMemo(() => {
    const monthSet = new Set();
    receipts.forEach(r => {
      if (r.receiptDate) {
        monthSet.add(r.receiptDate.slice(0, 7));
      }
      if (r.monthsCovered) {
        const matches = r.monthsCovered.match(/\d{4}-\d{2}/g);
        if (matches) {
          matches.forEach(m => monthSet.add(m));
        }
      }
    });
    return Array.from(monthSet).filter(m => /^\d{4}-\d{2}$/.test(m)).sort().reverse();
  }, [receipts]);

  // Filtered Receipts for Receipts Register
  const filteredReceipts = React.useMemo(() => {
    return receipts.filter(r => {
      const tenantName = r.tenantId?.name || '';
      const tenantPhone = r.tenantId?.phone || '';
      const propName = r.unitId?.propertyId?.name || '';
      const unitName = r.unitId?.subUnitPartition || r.unitId?.unitName || '';
      const notesMatch = r.comments || '';
            const statusMatch = r.status || 'Rented';
      const rDate = r.receiptDate ? formatDate(r.receiptDate) : '';
      const months = r.monthsCovered || '';
      const amount = String(r.totalAmount || 0);

      // 1. Search Query
      if (receiptSearch) {
        const q = receiptSearch.toLowerCase();
        const tMatch = tenantName.toLowerCase().includes(q) || tenantPhone.includes(q);
        const pMatch = propName.toLowerCase().includes(q);
        const uMatch = unitName.toLowerCase().includes(q);
        const rfMatch = refMatch.toLowerCase().includes(q);
        const nMatch = notesMatch.toLowerCase().includes(q);
        const sMatch = statusMatch.toLowerCase().includes(q);
        if (!tMatch && !pMatch && !uMatch && !rfMatch && !nMatch && !sMatch) {
          return false;
        }
      }

      // 2. Property Filter
      if (receiptPropertyFilter) {
        const pId = r.unitId?.propertyId?._id || r.unitId?.propertyId;
        if (pId !== receiptPropertyFilter) {
          return false;
        }
      }

      // 3. Status Filter
      if (receiptStatusFilter && (r.status || 'Rented') !== receiptStatusFilter) {
        return false;
      }

      // 4. Multi-Month Filter
      if (receiptSelectedMonths.length > 0) {
        const receiptMonth = r.receiptDate ? r.receiptDate.slice(0, 7) : '';
        const covered = r.monthsCovered || '';
        const matchesAnyMonth = receiptSelectedMonths.some(m => 
          receiptMonth === m || covered.includes(m)
        );
        if (!matchesAnyMonth) {
          return false;
        }
      }

      // 5. APEX Filters
      for (const f of receiptActiveFilters) {
        let fieldVal = '';
        if (f.columnId === 'receiptDate') fieldVal = rDate;
        else if (f.columnId === 'tenant') fieldVal = `${tenantName} ${propName} ${unitName}`;
        else if (f.columnId === 'accountingMonth') {
          const acctM = r.accountingMonth || (r.receiptDate ? new Date(r.receiptDate).toISOString().slice(0, 7) : '');
          fieldVal = `${acctM} ${formatMonthYear(acctM)}`;
        }
        else if (f.columnId === 'monthsCovered' || f.columnId === 'paidForMonth') fieldVal = months;
        else if (f.columnId === 'rentAmount') fieldVal = String(r.rentAmount !== undefined ? r.rentAmount : r.totalAmount || 0);
        else if (f.columnId === 'depositAmount') fieldVal = String(r.depositAmount || 0);
        else if (f.columnId === 'totalAmount') fieldVal = amount;
        else if (f.columnId === 'status') fieldVal = statusMatch;
                else if (f.columnId === 'comments') fieldVal = notesMatch;
        else if (f.columnId === 'tenantPhone') fieldVal = tenantPhone;
        else if (f.columnId === 'propertyName') fieldVal = propName;
        else if (f.columnId === 'subUnitName') fieldVal = unitName;
        else if (f.columnId === 'createdAt') fieldVal = r.createdAt ? formatDate(r.createdAt) : '';
        else if (f.columnId === 'updatedAt') fieldVal = r.updatedAt ? formatDate(r.updatedAt) : '';

        if (!evaluateFilterRule(fieldVal, f.operator, f.value)) return false;
      }

      return true;
    });
  }, [receipts, receiptSearch, receiptPropertyFilter, receiptStatusFilter, receiptSelectedMonths, receiptActiveFilters]);

  // Total collected in filtered receipts
  const totalFilteredReceiptsAmount = filteredReceipts.reduce((sum, r) => sum + (Number(r.totalAmount) || 0), 0);

  // Sorted Receipts for Receipts Register
  const sortedReceipts = React.useMemo(() => {
    return sortDataRows(filteredReceipts, receiptSortConfig, {
      receiptDate: r => r.receiptDate,
      receiptNumber: r => r.receiptNumber || '',
      tenant: r => r.tenantId?.name || '',
      accountingMonth: r => r.accountingMonth || (r.receiptDate ? new Date(r.receiptDate).toISOString().slice(0, 7) : '') || '',
      monthsCovered: r => r.monthsCovered || (r.allocations && r.allocations.map(a => a.rentMonthYear).join(', ')) || '',
      rentAmount: r => Number(r.rentAmount !== undefined ? r.rentAmount : r.totalAmount) || 0,
      depositAmount: r => Number(r.depositAmount) || 0,
      totalAmount: r => Number(r.totalAmount) || 0,
      status: r => r.status || 'Rented',
      comments: r => r.comments || '',
      tenantPhone: r => r.tenantId?.phone || '',
      propertyName: r => r.unitId?.propertyId?.name || '',
      subUnitName: r => r.unitId?.subUnitPartition || r.unitId?.unitName || '',
      createdAt: r => r.createdAt,
      updatedAt: r => r.updatedAt
    });
  }, [filteredReceipts, receiptSortConfig]);

  // Receipts Pagination Slice
  const totalReceiptItems = sortedReceipts.length;
  const isAllReceiptRows = receiptRowsPerPage === 'All';
  const effectiveReceiptPageSize = isAllReceiptRows ? totalReceiptItems || 1 : Number(receiptRowsPerPage);
  const totalReceiptPages = Math.ceil(totalReceiptItems / effectiveReceiptPageSize) || 1;

  useEffect(() => {
    if (receiptCurrentPage > totalReceiptPages) setReceiptCurrentPage(1);
  }, [totalReceiptPages, receiptCurrentPage]);

  const paginatedReceipts = React.useMemo(() => {
    if (isAllReceiptRows) return sortedReceipts;
    const startIndex = (receiptCurrentPage - 1) * effectiveReceiptPageSize;
    return sortedReceipts.slice(startIndex, startIndex + effectiveReceiptPageSize);
  }, [sortedReceipts, isAllReceiptRows, receiptCurrentPage, effectiveReceiptPageSize]);

  // Export Filtered Receipts to Excel
  const exportReceiptsToExcel = () => {
    const exportRows = sortedReceipts.map((r, idx) => ({
      '#': idx + 1,
      'Date': formatDate(r.receiptDate),
      'Accounting Month': r.accountingMonth ? formatMonthYear(r.accountingMonth) : (r.receiptDate ? formatMonthYear(new Date(r.receiptDate).toISOString().slice(0, 7)) : '—'),
      'Tenant': r.tenantId?.name || '—',
      'Tenant Phone': r.tenantId?.phone || '—',
      'Property': r.unitId?.propertyId?.name || '—',
      'Sub-Unit': r.unitId?.subUnitPartition || r.unitId?.unitName || '—',
      'Month Paid For': r.monthsCovered ? r.monthsCovered.split(',').map(m => formatMonthYear(m.trim())).join(', ') : '—',
      'Rent Amount Paid (₹)': r.rentAmount !== undefined ? Number(r.rentAmount) : Number(r.totalAmount || 0),
      'Deposit Amount (₹)': Number(r.depositAmount) || 0,
      'Total Amount Paid (₹)': Number(r.totalAmount) || 0,
      'Status': r.status || 'Rented',
      'Notes': r.comments || '—',
      'Created Date': r.createdAt ? formatDate(r.createdAt) : '',
      'Modified Date': r.updatedAt ? formatDate(r.updatedAt) : ''
    }));

    const ws = XLSX.utils.json_to_sheet(exportRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Receipts_Register');
    XLSX.writeFile(wb, `Payment_Receipts_Register_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  // Filtered rows for Excel Grid
  const filteredOut = React.useMemo(() => {
    return outstandingData.filter(d => {
      const tenantName = d.tenant?.name || '';
      const propName = d.property?.name || '';
      const unitName = d.unit?.subUnitPartition || d.unit?.unitName || '';
      const phone = d.tenant?.phone || '';
      const monthlyRate = String(d.monthsBreakdown?.find(m => m.monthYear === selectedMonth)?.expectedRate ?? (d.unit?.monthlyRentExpected || 0));
      const outstanding = String(d.totalOutstanding || 0);
      const paidUpTo = d.paidTillMonth && d.paidTillMonth !== 'None' ? formatMonthYear(d.paidTillMonth) : 'None';

      const receiptObj = findReceiptForUnitAndMonth(d, selectedMonth);
      const receiptNo = receiptObj?.receiptNumber || d.receiptNumber || '';

      const matchesSearch = !search ||
        tenantName.toLowerCase().includes(search.toLowerCase()) ||
        propName.toLowerCase().includes(search.toLowerCase()) ||
        unitName.toLowerCase().includes(search.toLowerCase()) ||
        receiptNo.toLowerCase().includes(search.toLowerCase()) ||
        phone.includes(search);

      const matchesProp = !selectedPropertyFilter ||
        d.property?._id === selectedPropertyFilter ||
        d.property?.name === selectedPropertyFilter;

      const matchesTenant = !selectedTenantFilter ||
        d.tenant?._id === selectedTenantFilter ||
        d.tenant?.name === selectedTenantFilter;

      if (!matchesSearch || !matchesProp || !matchesTenant) return false;

      // APEX filters
      for (const f of sheetFilters) {
        let fieldVal = '';
        if (f.columnId === 'tenant') fieldVal = tenantName;
        else if (f.columnId === 'property') fieldVal = propName;
        else if (f.columnId === 'subUnit') fieldVal = unitName;
        else if (f.columnId === 'accountingMonth') fieldVal = `${selectedMonth} ${formatMonthYear(selectedMonth)}`;
        else if (f.columnId === 'receiptNumber') fieldVal = receiptNo;
        else if (f.columnId === 'paidForMonth') {
          const mList = resolveSelectedMonthsForItem(d, selectedMonth);
          fieldVal = mList.map(m => `${m} ${formatMonthYear(m)}`).join(' ');
        }
        else if (f.columnId === 'monthlyRent') fieldVal = monthlyRate;
        else if (f.columnId === 'outstanding') fieldVal = outstanding;
        else if (f.columnId === 'paidUpTo') fieldVal = paidUpTo;
        else if (f.columnId === 'tenantPhone') fieldVal = phone;
        else if (f.columnId === 'floor') fieldVal = d.unit?.floor || '';
        else if (f.columnId === 'deposit') fieldVal = String(d.tenant?.securityDeposit || 0);
        else if (f.columnId === 'nextUnpaid') fieldVal = d.nextUnpaidMonth && d.nextUnpaidMonth !== 'Up to date' ? formatMonthYear(d.nextUnpaidMonth) : 'Up to date';
        else if (f.columnId === 'totalCollected') fieldVal = String(d.totalAllocated || 0);
        else if (f.columnId === 'createdAt') fieldVal = d.createdAt ? formatDate(d.createdAt) : '';
        else if (f.columnId === 'updatedAt') fieldVal = d.updatedAt ? formatDate(d.updatedAt) : '';

        if (!evaluateFilterRule(fieldVal, f.operator, f.value)) return false;
      }

      return true;
    });
  }, [outstandingData, search, selectedPropertyFilter, selectedTenantFilter, sheetFilters, selectedMonth]);

  const availableTenantsForFilter = React.useMemo(() => {
    let list = tenants || [];
    if (selectedPropertyFilter) {
      list = list.filter(t => {
        const pId = t.property?._id || t.property;
        return String(pId) === String(selectedPropertyFilter);
      });
    }
    return [...list].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [tenants, selectedPropertyFilter]);

  // Aggregate sums for Rent Collection Grid
  const totalExpectedSum = React.useMemo(() => {
    return filteredOut.reduce((sum, item) => {
      const monthData = item.monthsBreakdown?.find(m => m.monthYear === selectedMonth);
      return sum + (monthData ? monthData.expectedRate : (item.unit?.monthlyRentExpected || 0));
    }, 0);
  }, [filteredOut, selectedMonth]);

  const totalPaidSum = React.useMemo(() => {
    return filteredOut.reduce((sum, item) => {
      const monthData = item.monthsBreakdown?.find(m => m.monthYear === selectedMonth);
      const directAllocated = receipts
        .filter(r => !r.isReversed &&
          (r.unitId?._id === item.unit?._id || r.unitId === item.unit?._id) &&
          (!item.tenant?._id || r.tenantId?._id === item.tenant?._id || r.tenantId === item.tenant?._id)
        )
        .reduce((s, r) => {
          const alloc = r.allocations?.find(a => a.rentMonthYear === selectedMonth);
          return s + (alloc ? Number(alloc.allocatedAmount || 0) : 0);
        }, 0);

      const existingReceipt = findReceiptForUnitAndMonth(item, selectedMonth);
      const existingTotal = (existingReceipt && !existingReceipt.isReversed && existingReceipt.totalAmount !== undefined && existingReceipt.status !== 'Vacant')
        ? Number(existingReceipt.totalAmount)
        : null;

      const paid = existingTotal !== null
        ? existingTotal
        : (directAllocated > 0
            ? directAllocated
            : (monthData ? (monthData.actualAllocated ?? monthData.allocatedAmount ?? 0) : (item.actualPaidForMonth || 0)));

      return sum + paid;
    }, 0);
  }, [filteredOut, selectedMonth, receipts]);

  const totalRentSum = React.useMemo(() => {
    return filteredOut.reduce((sum, item) => {
      const existingReceipt = findReceiptForUnitAndMonth(item, selectedMonth);
      if (existingReceipt && !existingReceipt.isReversed && existingReceipt.status !== 'Vacant') {
        const rVal = existingReceipt.rentAmount !== undefined ? Number(existingReceipt.rentAmount) : Number(existingReceipt.totalAmount || 0);
        return sum + rVal;
      }
      const monthData = item.monthsBreakdown?.find(m => m.monthYear === selectedMonth);
      const paid = monthData ? (monthData.actualAllocated ?? monthData.allocatedAmount ?? 0) : (item.actualPaidForMonth || 0);
      return sum + paid;
    }, 0);
  }, [filteredOut, selectedMonth, receipts]);

  const totalDepositSum = React.useMemo(() => {
    return filteredOut.reduce((sum, item) => {
      const existingReceipt = findReceiptForUnitAndMonth(item, selectedMonth);
      if (existingReceipt && !existingReceipt.isReversed && existingReceipt.status !== 'Vacant') {
        return sum + (Number(existingReceipt.depositAmount) || 0);
      }
      return sum;
    }, 0);
  }, [filteredOut, selectedMonth, receipts]);

  const totalOutstandingSum = React.useMemo(() => {
    return filteredOut.reduce((sum, item) => sum + (item.totalOutstanding || 0), 0);
  }, [filteredOut]);

  // Month Expenses and Financial Calculations (Property-Wise, Common/General, Difference, Previous Balance, Cumulative)
  const filteredMonthExpenses = React.useMemo(() => {
    if (!selectedPropertyFilter) return monthExpenses;
    return monthExpenses.filter(e => {
      const pId = e.propertyId?._id || e.propertyId;
      return String(pId) === String(selectedPropertyFilter);
    });
  }, [monthExpenses, selectedPropertyFilter]);

  // 1. Property-wise Expenses (grouped by property)
  const propertyExpensesList = React.useMemo(() => {
    const map = {};
    filteredMonthExpenses.filter(e => e.propertyId).forEach(e => {
      const pid = String(e.propertyId?._id || e.propertyId);
      const propObj = properties.find(p => String(p._id) === pid);
      const propName = e.propertyId?.name || propObj?.name || 'Property Expense';
      if (!map[pid]) {
        map[pid] = {
          propertyId: pid,
          propertyName: propName,
          total: 0,
          categories: {},
          items: []
        };
      }
      map[pid].total += (e.amount || 0);
      const cat = e.category || 'General';
      map[pid].categories[cat] = (map[pid].categories[cat] || 0) + (e.amount || 0);
      map[pid].items.push(e);
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [filteredMonthExpenses, properties]);

  const totalPropertyExpenses = React.useMemo(() => {
    return propertyExpensesList.reduce((sum, p) => sum + p.total, 0);
  }, [propertyExpensesList]);

  // 2. Common / General Expenses (not tied to a specific property)
  const commonExpensesList = React.useMemo(() => {
    const map = {};
    filteredMonthExpenses.filter(e => !e.propertyId).forEach(e => {
      const cat = e.category || 'Miscellaneous';
      if (!map[cat]) {
        map[cat] = {
          category: cat,
          sum: 0,
          items: []
        };
      }
      map[cat].sum += (e.amount || 0);
      map[cat].items.push(e);
    });
    return Object.values(map).sort((a, b) => b.sum - a.sum);
  }, [filteredMonthExpenses]);

  const totalCommonExpenses = React.useMemo(() => {
    return commonExpensesList.reduce((sum, c) => sum + c.sum, 0);
  }, [commonExpensesList]);

  const activeTotalExpenses = React.useMemo(() => {
    return totalPropertyExpenses + totalCommonExpenses;
  }, [totalPropertyExpenses, totalCommonExpenses]);

  const monthDifference = React.useMemo(() => {
    return totalPaidSum - activeTotalExpenses;
  }, [totalPaidSum, activeTotalExpenses]);

  const monthCumulative = React.useMemo(() => {
    return (prevMonthBalance || 0) + monthDifference;
  }, [prevMonthBalance, monthDifference]);

  // Dedicated Lower Section Expense Helpers & Data
  const isGeneralCommonProperty = (propId) => {
    if (propId === '__COMMON__' || propId === '__OTHER_EXPENSES__') return true;
    if (!propId) return true;
    const prop = properties.find(p => String(p._id) === String(propId));
    if (!prop) return false;
    return prop.propertyCode === 'PROP-COMMON' || prop.propertyType === 'General / Common' || prop.name?.toLowerCase().includes('general common');
  };

  const isExpenseOther = (expense) => {
    if (!expense) return false;
    if (expense.headType === 'Other' || expense.headType === 'Common') return true;
    if (expense.headType === 'Property') return false;
    if (!expense.propertyId) return true;
    const pId = expense.propertyId?._id || expense.propertyId;
    return isGeneralCommonProperty(pId);
  };

  const propertyCategories = React.useMemo(() => {
    const cats = expenseCategories
      .filter(c => c.headType !== 'Common' && c.headType !== 'Other')
      .map(c => c.name);
    return cats.length > 0 ? cats : [
      'Maintenance',
      'Electricity & Utilities',
      'Repairs & Renovation',
      'Sweeper & Cleaning',
      'Property Rent Paid',
      'Deposit Refund',
      'Water Charges',
      'Property Tax',
      'Other'
    ];
  }, [expenseCategories]);

  const commonCategories = React.useMemo(() => {
    const cats = expenseCategories
      .filter(c => c.headType === 'Common' || c.headType === 'Other')
      .map(c => c.name);
    return cats.length > 0 ? cats : [
      'MOM',
      'Miscellaneous',
      'Zakat',
      'Sadka',
      'Margaret',
      'Other'
    ];
  }, [expenseCategories]);

  const orderedExpenseGridProperties = React.useMemo(() => {
    const regularProps = properties
      .filter(p => !isGeneralCommonProperty(p._id))
      .slice()
      .sort((a, b) => {
        const ordA = a.displayOrder !== undefined && a.displayOrder !== null ? a.displayOrder : 9999;
        const ordB = b.displayOrder !== undefined && b.displayOrder !== null ? b.displayOrder : 9999;
        if (ordA !== ordB) return ordA - ordB;
        return (a.name || '').localeCompare(b.name || '');
      });

    const commonProp = properties.find(p => isGeneralCommonProperty(p._id));
    const commonItem = commonProp || {
      _id: '__COMMON__',
      name: 'General & Common Expenses',
      propertyCode: 'PROP-COMMON',
      displayOrder: 99
    };

    return [...regularProps, commonItem];
  }, [properties]);

  const handleExpenseSectionSort = (colId) => {
    setExpenseSectionSort(prev => cycleThreeStateSort(prev, colId));
  };

  const handleApplyExpenseColFilter = (colId, ruleOrValues) => {
    setExpenseSectionColFilters(prev => ({ ...prev, [colId]: ruleOrValues }));
    setExpenseSectionCurrentPage(1);
  };

  const handleClearExpenseColFilter = (colId) => {
    setExpenseSectionColFilters(prev => {
      const next = { ...prev };
      delete next[colId];
      return next;
    });
  };

  const filteredExpenseProperties = React.useMemo(() => {
    let result = orderedExpenseGridProperties.filter(prop => {
      const propKey = String(prop._id || '__COMMON__');
      const isCommon = isGeneralCommonProperty(propKey);

      if (expenseSectionPropFilter) {
        if (expenseSectionPropFilter === '__COMMON__' && !isCommon) return false;
        if (expenseSectionPropFilter !== '__COMMON__' && propKey !== expenseSectionPropFilter) return false;
      }

      if (expenseSectionSearch?.trim()) {
        const q = expenseSectionSearch.trim().toLowerCase();
        const pName = (isCommon ? 'General & Common Expenses' : prop.name || '').toLowerCase();
        const pCode = (prop.propertyCode || '').toLowerCase();
        const matchesProp = pName.includes(q) || pCode.includes(q);

        const propExpenses = monthExpenses.filter(e => {
          if (isCommon) return isExpenseOther(e);
          return String(e.propertyId?._id || e.propertyId) === String(prop._id);
        });

        const matchesExpense = propExpenses.some(e =>
          (e.description || '').toLowerCase().includes(q) ||
          (e.category || '').toLowerCase().includes(q) ||
          (e.vendorOrPayee || '').toLowerCase().includes(q) ||
          String(e.amount || '').includes(q)
        );

        if (!matchesProp && !matchesExpense) return false;
      }

      // Column-level filters on property
      if (expenseSectionColFilters.property) {
        const pName = isCommon ? 'General & Common' : prop.name;
        const rule = expenseSectionColFilters.property;
        if (Array.isArray(rule) && rule.length > 0 && !rule.includes(pName)) return false;
        if (typeof rule === 'object' && rule.value && !pName.toLowerCase().includes(rule.value.toLowerCase())) return false;
      }

      if (expenseSectionColFilters.headType) {
        const hType = isCommon ? 'Common' : 'Property';
        const rule = expenseSectionColFilters.headType;
        if (Array.isArray(rule) && rule.length > 0 && !rule.includes(hType)) return false;
      }

      // Toolbar filters
      if (expenseSectionFilters && expenseSectionFilters.length > 0) {
        const propExpenses = monthExpenses.filter(e => {
          if (isCommon) return isExpenseOther(e);
          return String(e.propertyId?._id || e.propertyId) === String(prop._id);
        });
        const pTotal = propExpenses.reduce((s, e) => s + (e.amount || 0), 0);

        for (const flt of expenseSectionFilters) {
          if (flt.column === 'property') {
            const pName = isCommon ? 'General & Common' : prop.name;
            if (!evaluateFilterRule(pName, flt.operator, flt.value)) return false;
          } else if (flt.column === 'headType') {
            const hType = isCommon ? 'Common' : 'Property';
            if (!evaluateFilterRule(hType, flt.operator, flt.value)) return false;
          } else if (flt.column === 'amount') {
            if (!evaluateFilterRule(pTotal, flt.operator, flt.value)) return false;
          }
        }
      }

      return true;
    });

    // Sorting properties
    if (expenseSectionSort?.key) {
      const { key, direction } = expenseSectionSort;
      const mult = direction === 'desc' ? -1 : 1;
      result.sort((a, b) => {
        const aIsCommon = isGeneralCommonProperty(String(a._id || '__COMMON__'));
        const bIsCommon = isGeneralCommonProperty(String(b._id || '__COMMON__'));

        if (key === 'property') {
          const aName = aIsCommon ? 'General & Common' : a.name || '';
          const bName = bIsCommon ? 'General & Common' : b.name || '';
          return mult * aName.localeCompare(bName);
        }
        if (key === 'headType') {
          const aType = aIsCommon ? 'Common' : 'Property';
          const bType = bIsCommon ? 'Common' : 'Property';
          return mult * aType.localeCompare(bType);
        }
        if (key === 'index') {
          return mult * ((a.displayOrder || 0) - (b.displayOrder || 0));
        }
        if (key === 'amount') {
          const aExpenses = monthExpenses.filter(e => aIsCommon ? isExpenseOther(e) : String(e.propertyId?._id || e.propertyId) === String(a._id));
          const bExpenses = monthExpenses.filter(e => bIsCommon ? isExpenseOther(e) : String(e.propertyId?._id || e.propertyId) === String(b._id));
          const aTotal = aExpenses.reduce((s, e) => s + (e.amount || 0), 0);
          const bTotal = bExpenses.reduce((s, e) => s + (e.amount || 0), 0);
          return mult * (aTotal - bTotal);
        }
        return 0;
      });
    }

    return result;
  }, [orderedExpenseGridProperties, expenseSectionPropFilter, expenseSectionSearch, expenseSectionColFilters, expenseSectionFilters, expenseSectionSort, monthExpenses]);

  const isAllExpenseRows = expenseSectionRowsPerPage === 'All';
  const effectiveExpensePageSize = isAllExpenseRows ? filteredExpenseProperties.length || 1 : Number(expenseSectionRowsPerPage);
  const totalExpensePages = Math.ceil(filteredExpenseProperties.length / effectiveExpensePageSize) || 1;
  const paginatedExpenseProperties = React.useMemo(() => {
    if (isAllExpenseRows) return filteredExpenseProperties;
    const start = (expenseSectionCurrentPage - 1) * effectiveExpensePageSize;
    return filteredExpenseProperties.slice(start, start + effectiveExpensePageSize);
  }, [filteredExpenseProperties, isAllExpenseRows, expenseSectionCurrentPage, effectiveExpensePageSize]);

  const expenseColUniqueValues = React.useMemo(() => {
    const headTypes = ['Property', 'Common'];
    const propNames = Array.from(new Set(
      orderedExpenseGridProperties.map(p => isGeneralCommonProperty(String(p._id || '__COMMON__')) ? 'General & Common' : p.name)
    )).filter(Boolean).sort();
    
    const categories = Array.from(new Set(
      monthExpenses.map(e => e.category).concat(propertyCategories).concat(commonCategories)
    )).filter(Boolean).sort();

    const unitsList = Array.from(new Set(
      units.map(u => u.subUnitPartition || u.unitName).concat(['Entire Property', 'Common', 'N/A'])
    )).filter(Boolean).sort();

    return {
      headType: headTypes,
      property: propNames,
      category: categories,
      unit: unitsList
    };
  }, [orderedExpenseGridProperties, monthExpenses, propertyCategories, commonCategories, units]);

  const expenseFilterSuggestions = React.useMemo(() => ({
    headType: ['Property', 'Common'],
    property: orderedExpenseGridProperties.map(p => isGeneralCommonProperty(String(p._id || '__COMMON__')) ? 'General & Common' : p.name),
    category: Array.from(new Set(propertyCategories.concat(commonCategories))),
  }), [orderedExpenseGridProperties, propertyCategories, commonCategories]);

  const exportExpensesSectionToExcel = () => {
    try {
      const dataToExport = [];
      filteredExpenseProperties.forEach((prop, propIdx) => {
        const propKey = String(prop._id || '__COMMON__');
        const isCommon = isGeneralCommonProperty(propKey);
        const propExpenses = monthExpenses.filter(e => {
          if (isCommon) return isExpenseOther(e);
          return String(e.propertyId?._id || e.propertyId) === String(prop._id);
        });

        propExpenses.forEach((e, idx) => {
          dataToExport.push({
            '#': `${isCommon ? '★' : (prop.displayOrder || propIdx + 1)}.${idx + 1}`,
            'Head Type': isCommon ? 'Common' : 'Property',
            'Property': isCommon ? 'General & Common' : prop.name,
            'Partition (Unit)': e.unitId?.subUnitPartition || e.unitId?.unitName || (isCommon ? 'Common' : 'Entire Property'),
            'Expense Head': e.category || '',
            'Description': e.description || '',
            'Date': e.expenseDate ? String(e.expenseDate).substring(0, 10) : `${selectedMonth}-01`,
            'Amount': e.amount || 0
          });
        });
      });

      if (dataToExport.length === 0) {
        alert('No recorded expenses to export for this month.');
        return;
      }

      const ws = XLSX.utils.json_to_sheet(dataToExport);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Monthly Expenses');
      XLSX.writeFile(wb, `Monthly_Expenses_${selectedMonth}.xlsx`);
    } catch (err) {
      console.error('Export failed:', err);
    }
  };

  const totalExpenseTableWidth = React.useMemo(() => {
    return visibleExpenseCols.reduce((sum, colId) => {
      return sum + (expenseSectionWidths[colId] || DEFAULT_EXPENSE_SECTION_WIDTHS[colId] || 120);
    }, 0);
  }, [visibleExpenseCols, expenseSectionWidths]);

  const getExpenseRowDraft = (propKey) => {
    if (expenseRowDrafts[propKey]) return expenseRowDrafts[propKey];
    const isCommon = propKey === '__COMMON__' || isGeneralCommonProperty(propKey);
    const today = new Date().toISOString().split('T')[0];
    const defaultDate = (selectedMonth && today.startsWith(selectedMonth)) ? today : `${selectedMonth}-01`;
    return {
      unitId: '',
      category: isCommon ? (commonCategories[0] || 'MOM') : (propertyCategories[0] || 'Maintenance'),
      description: '',
      expenseDate: defaultDate,
      amount: ''
    };
  };

  const updateExpenseRowDraft = (propKey, patch) => {
    setExpenseRowDrafts(prev => {
      const current = prev[propKey] || getExpenseRowDraft(propKey);
      return {
        ...prev,
        [propKey]: {
          ...current,
          ...patch
        }
      };
    });
  };

  const handleSaveExpenseRow = async (prop) => {
    const propKey = String(prop._id || '__COMMON__');
    if (savingExpenseRows[propKey]) return;

    const draft = getExpenseRowDraft(propKey);
    const amountNum = Number(draft.amount);

    if (!amountNum || amountNum <= 0) {
      alert('Please enter a valid expense amount greater than 0.');
      return;
    }

    const isCommon = isGeneralCommonProperty(propKey);
    const targetPropId = isCommon ? null : prop._id;

    try {
      setSavingExpenseRows(prev => ({ ...prev, [propKey]: true }));
      const payload = {
        headType: isCommon ? 'Other' : 'Property',
        propertyId: targetPropId,
        unitId: (!isCommon && draft.unitId) ? draft.unitId : null,
        category: draft.category || (isCommon ? (commonCategories[0] || 'MOM') : (propertyCategories[0] || 'Maintenance')),
        description: draft.description?.trim() || '',
        amount: amountNum,
        expenseMonth: selectedMonth,
        expenseDate: draft.expenseDate ? new Date(draft.expenseDate) : new Date(`${selectedMonth}-01`)
      };

      await API.post('/expenses', payload);

      setExpenseRowDrafts(prev => ({
        ...prev,
        [propKey]: {
          ...draft,
          amount: '',
          description: '',
          unitId: ''
        }
      }));

      setSavedExpenseFeedback(prev => ({ ...prev, [propKey]: true }));
      setTimeout(() => {
        setSavedExpenseFeedback(prev => ({ ...prev, [propKey]: false }));
      }, 2500);

      await fetchData(selectedMonth, { silent: true });
    } catch (err) {
      alert(err.response?.data?.message || err.message || 'Failed to save expense');
    } finally {
      setSavingExpenseRows(prev => ({ ...prev, [propKey]: false }));
    }
  };

  const startEditingExpenseLine = (exp) => {
    setEditingExpenseLineId(exp._id);
    setEditingExpenseLineData({
      unitId: exp.unitId?._id || exp.unitId || '',
      category: exp.category || 'Maintenance',
      description: exp.description || '',
      expenseDate: exp.expenseDate ? String(exp.expenseDate).substring(0, 10) : `${selectedMonth}-01`,
      amount: String(exp.amount || '')
    });
  };

  const cancelEditingExpenseLine = () => {
    setEditingExpenseLineId(null);
    setEditingExpenseLineData({});
  };

  const handleSaveEditedExpenseLine = async (expId) => {
    const amt = Number(editingExpenseLineData.amount);
    if (!amt || amt <= 0) {
      alert('Please enter a valid amount greater than 0.');
      return;
    }

    try {
      await API.put(`/expenses/${expId}`, {
        unitId: editingExpenseLineData.unitId || null,
        category: editingExpenseLineData.category,
        description: editingExpenseLineData.description?.trim() || '',
        expenseDate: editingExpenseLineData.expenseDate ? new Date(editingExpenseLineData.expenseDate) : new Date(`${selectedMonth}-01`),
        amount: amt
      });
      setEditingExpenseLineId(null);
      setEditingExpenseLineData({});
      await fetchData(selectedMonth, { silent: true });
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to update expense');
    }
  };

  // Sorted rows for Sheet
  const sortedSheetRows = React.useMemo(() => {
    if (!sheetSortConfig.key || !sheetSortConfig.direction) {
      // Natural order: Property Master displayOrder, then property name, then unit name
      return [...filteredOut].sort((a, b) => {
        const orderA = (a.property?.displayOrder && a.property.displayOrder > 0) ? a.property.displayOrder : 9999;
        const orderB = (b.property?.displayOrder && b.property.displayOrder > 0) ? b.property.displayOrder : 9999;
        if (orderA !== orderB) return orderA - orderB;
        const nameA = a.property?.name || '';
        const nameB = b.property?.name || '';
        if (nameA.localeCompare(nameB) !== 0) return nameA.localeCompare(nameB);
        const unitA = a.unit?.subUnitPartition || a.unit?.unitName || '';
        const unitB = b.unit?.subUnitPartition || b.unit?.unitName || '';
        return unitA.localeCompare(unitB);
      });
    }

    return sortDataRows(filteredOut, sheetSortConfig, {
      index: (d, idx) => (d.property?.displayOrder && d.property.displayOrder > 0) ? d.property.displayOrder : idx,
      tenant: d => d.tenant?.name || '',
      property: d => (d.property?.displayOrder && d.property.displayOrder > 0) ? d.property.displayOrder : 9999,
      subUnit: d => d.unit?.subUnitPartition || d.unit?.unitName || '',
      monthlyRent: d => d.monthsBreakdown?.find(m => m.monthYear === selectedMonth)?.expectedRate ?? (d.unit?.monthlyRentExpected || 0),
      outstanding: d => d.totalOutstanding || 0,
      paidUpTo: d => d.paidTillMonth || '',
      receiptNumber: d => findReceiptForUnitAndMonth(d, selectedMonth)?.receiptNumber || d.receiptNumber || '',
      tenantPhone: d => d.tenant?.phone || '',
      propertyType: d => d.property?.type || '',
      subUnitArea: d => d.unit?.areaSqFt || 0,
      floor: d => d.unit?.floor || '',
      deposit: d => d.tenant?.securityDeposit || 0,
      nextUnpaid: d => d.nextUnpaidMonth || '',
      totalCollected: d => d.totalAllocated || 0,
      createdAt: d => d.createdAt,
      updatedAt: d => d.updatedAt
    });
  }, [filteredOut, sheetSortConfig, selectedMonth]);

  // Sheet Pagination Slice
  const totalSheetItems = sortedSheetRows.length;
  const isAllSheetRows = sheetRowsPerPage === 'All';
  const effectiveSheetPageSize = isAllSheetRows ? totalSheetItems || 1 : Number(sheetRowsPerPage);
  const totalSheetPages = Math.ceil(totalSheetItems / effectiveSheetPageSize) || 1;

  useEffect(() => {
    if (sheetCurrentPage > totalSheetPages) setSheetCurrentPage(1);
  }, [totalSheetPages, sheetCurrentPage]);

  const paginatedSheetRows = React.useMemo(() => {
    if (isAllSheetRows) return sortedSheetRows;
    const startIndex = (sheetCurrentPage - 1) * effectiveSheetPageSize;
    return sortedSheetRows.slice(startIndex, startIndex + effectiveSheetPageSize);
  }, [sortedSheetRows, isAllSheetRows, sheetCurrentPage, effectiveSheetPageSize]);

  // Sheet Keyboard & Cell Navigation
  const [selectedRowIndex, setSelectedRowIndex] = useState(null);
  const [selectedColIndex, setSelectedColIndex] = useState(null);
  const sheetTableContainerRef = useRef(null);
  const sheetRowRefs = useRef({});
  const sheetCellRefs = useRef({});

  useEffect(() => {
    if (selectedRowIndex !== null && selectedRowIndex >= paginatedSheetRows.length) {
      setSelectedRowIndex(paginatedSheetRows.length > 0 ? paginatedSheetRows.length - 1 : null);
    }
  }, [paginatedSheetRows.length, selectedRowIndex]);

  const focusCell = (rIdx, cIdx) => {
    requestAnimationFrame(() => {
      const key = `${rIdx}_${cIdx}`;
      const cellEl = sheetCellRefs.current[key];
      if (cellEl) {
        cellEl.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
        const inputEl = cellEl.querySelector('input, select, button');
        if (inputEl) {
          inputEl.focus({ preventScroll: true });
          if (inputEl.tagName === 'INPUT' && inputEl.type !== 'button') {
            inputEl.select?.();
          }
        } else {
          cellEl.focus?.({ preventScroll: true });
        }
      }
    });
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (activeTab !== 'sheet') return;
      if (showPaymentModal || selectedLedgerModal || showExpenseModal || openMonthPickerRow) return;
      if (selectedRowIndex === null) return;
      if (!paginatedSheetRows || paginatedSheetRows.length === 0) return;

      const key = e.key;
      if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(key)) return;

      const activeEl = document.activeElement;
      const isInput = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT');

      const tableContainer = sheetTableContainerRef.current;
      if (isInput && tableContainer && !tableContainer.contains(activeEl)) {
        return;
      }

      if (key === 'ArrowUp') {
        e.preventDefault();
        const nextRow = Math.max(0, selectedRowIndex - 1);
        setSelectedRowIndex(nextRow);
        focusCell(nextRow, selectedColIndex ?? 0);
      } else if (key === 'ArrowDown') {
        e.preventDefault();
        const nextRow = Math.min(paginatedSheetRows.length - 1, selectedRowIndex + 1);
        setSelectedRowIndex(nextRow);
        focusCell(nextRow, selectedColIndex ?? 0);
      } else if (key === 'ArrowLeft') {
        if (isInput && activeEl && activeEl.tagName === 'INPUT') {
          const atStart = activeEl.selectionStart === 0 && activeEl.selectionEnd === 0;
          const allSelected = activeEl.selectionStart === 0 && activeEl.selectionEnd === activeEl.value.length;
          if (!atStart && !allSelected) {
            return;
          }
        }
        e.preventDefault();
        const nextCol = Math.max(0, (selectedColIndex ?? 0) - 1);
        setSelectedColIndex(nextCol);
        focusCell(selectedRowIndex, nextCol);
      } else if (key === 'ArrowRight') {
        if (isInput && activeEl && activeEl.tagName === 'INPUT') {
          const atEnd = activeEl.selectionStart === activeEl.value.length && activeEl.selectionEnd === activeEl.value.length;
          const allSelected = activeEl.selectionStart === 0 && activeEl.selectionEnd === activeEl.value.length;
          if (!atEnd && !allSelected) {
            return;
          }
        }
        e.preventDefault();
        const nextCol = Math.min(visibleSheetColumns.length - 1, (selectedColIndex ?? 0) + 1);
        setSelectedColIndex(nextCol);
        focusCell(selectedRowIndex, nextCol);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTab, selectedRowIndex, selectedColIndex, paginatedSheetRows, visibleSheetColumns, showPaymentModal, selectedLedgerModal, showExpenseModal, openMonthPickerRow]);

  // Excel Export of the Monthly Grid
  const exportSheetToExcel = () => {
    const exportRows = sortedSheetRows.map((item, idx) => {
      const monthData = item.monthsBreakdown?.find(m => m.monthYear === selectedMonth);
      const monthlyExpected = monthData ? monthData.expectedRate : (item.unit?.monthlyRentExpected || 0);
      const paidThisMonth = monthData ? monthData.allocatedAmount : 0;
      const outstandingThroughMonth = item.totalOutstanding || 0;
      const selM = resolveSelectedMonthsForItem(item, selectedMonth);
      const monthPaidForText = selM.map(m => `${formatMonthYear(m)}${m > selectedMonth ? ' (Adv)' : m < selectedMonth ? ' (Due)' : ''}`).join(', ');

      return {
        '#': idx + 1,
        'Tenant Details': item.tenant?.name || 'Unknown',
        'Phone': item.tenant?.phone || '—',
        'Property': item.property?.name || '—',
        'Sub-Unit': item.unit?.subUnitPartition || item.unit?.unitName || '—',
        'Monthly Rent': monthlyExpected,
        'Outstanding due': outstandingThroughMonth,
        'Paid Up To': item.paidTillMonth && item.paidTillMonth !== 'None' ? formatMonthYear(item.paidTillMonth) : 'None',
        'Accounting Month': formatMonthYear(selectedMonth),
        'Month Paid For': monthPaidForText,
        'Rent Amount Paid': item.rentAmountPaid !== undefined ? item.rentAmountPaid : paidThisMonth,
        'Deposit Amount': item.depositAmount || 0,
        'Total Amount Paid': item.actualPaidForMonth !== undefined ? item.actualPaidForMonth : ((item.rentAmountPaid !== undefined ? Number(item.rentAmountPaid) : paidThisMonth) + (item.depositAmount || 0)),
        'Created Date': item.createdAt ? formatDate(item.createdAt) : '',
        'Modified Date': item.updatedAt ? formatDate(item.updatedAt) : ''
      };
    });

    const ws = XLSX.utils.json_to_sheet(exportRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Rent_${selectedMonth}`);
    XLSX.writeFile(wb, `Rent_Collection_Sheet_${selectedMonth}.xlsx`);
  };

  const totalTableWidth = visibleSheetColumns.reduce((sum, colId) => {
    return sum + (columnWidths[colId] || DEFAULT_SHEET_COLUMN_WIDTHS[colId] || 120);
  }, 0);

  return (
    <div className="space-y-2 w-full min-w-0">
      

      {/* VIEW 1: EXCEL-TEMPLATE-STYLE GRID */}
      {activeTab === 'sheet' && (
        <div className="space-y-2">
          {/* APEX Toolbar for Rent Sheet */}
          <ApexToolbar
            statusFilter={
              <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-xl shrink-0">
                <button
                  type="button"
                  onClick={() => setActiveTab('sheet')}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    activeTab === 'sheet'
                      ? 'bg-white text-emerald-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>Monthly Collection Grid</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('receipts')}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    activeTab === 'receipts'
                      ? 'bg-white text-emerald-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Receipt className="w-3.5 h-3.5" />
                  <span>Receipts Register ({receipts.length})</span>
                </button>
              </div>
            }
            monthFilter={
              <div className="flex items-center gap-1 bg-slate-50 p-0.5 rounded-xl border border-slate-200 shadow-2xs shrink-0">
                <button
                  type="button"
                  onClick={handlePrevMonth}
                  className="p-1 rounded-lg hover:bg-white text-slate-600 hover:text-slate-900 transition-all cursor-pointer"
                  title="Previous Month"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>

                <div className="flex items-center gap-1 px-1.5 py-0.5">
                  <Calendar className="w-3 h-3 text-emerald-600 shrink-0" />
                  <div className="text-left leading-none">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 block leading-tight">Month</span>
                    <span className="text-xs font-black text-slate-900 whitespace-nowrap leading-tight">{formatMonthYear(selectedMonth)}</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleNextMonth}
                  className="p-1 rounded-lg hover:bg-white text-slate-600 hover:text-slate-900 transition-all cursor-pointer"
                  title="Next Month"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>

                <div className="h-4 w-px bg-slate-200 mx-0.5" />

                <input
                  type="month"
                  value={selectedMonth}
                  onChange={handleSelectCustomMonth}
                  className="text-xs font-semibold px-1.5 py-0.5 rounded-lg border border-slate-200 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
                  title="Jump to specific month and year"
                />
              </div>
            }
            propertyFilter={
              <div className="flex items-center gap-1.5 shrink-0">
                <select
                  value={selectedPropertyFilter}
                  onChange={(e) => { setSelectedPropertyFilter(e.target.value); setSheetCurrentPage(1); }}
                  className="text-xs font-semibold px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400 cursor-pointer shrink-0"
                >
                  <option value="">All Properties</option>
                  {properties.map(p => (
                    <option key={p._id} value={p._id}>{p.name}</option>
                  ))}
                </select>
                <select
                  value={selectedTenantFilter}
                  onChange={(e) => { setSelectedTenantFilter(e.target.value); setSheetCurrentPage(1); }}
                  className="text-xs font-semibold px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400 cursor-pointer shrink-0"
                >
                  <option value="">All Tenants</option>
                  {availableTenantsForFilter.map(t => (
                    <option key={t._id} value={t._id}>{t.name}</option>
                  ))}
                </select>
              </div>
            }
            kpiFilter={
              <div className="flex items-center gap-1.5 flex-wrap shrink-0">
                <div className="px-2.5 py-1 rounded-xl bg-slate-50 border border-slate-200 flex items-center gap-1 text-xs">
                  <span className="text-slate-500 font-medium">Tenancies:</span>
                  <span className="font-bold text-slate-800">{filteredOut.length}</span>
                </div>
                <div className="px-2.5 py-1 rounded-xl bg-blue-50/70 border border-blue-200/80 flex items-center gap-1 text-xs">
                  <span className="text-blue-600 font-medium">Expected:</span>
                  <span className="font-bold text-blue-900 font-mono">{formatCurrency(totalExpectedSum)}</span>
                </div>
                <div className="px-2.5 py-1 rounded-xl bg-emerald-50/70 border border-emerald-200/80 flex items-center gap-1 text-xs">
                  <span className="text-emerald-600 font-medium">Collected:</span>
                  <span className="font-bold text-emerald-800 font-mono">{formatCurrency(totalPaidSum)}</span>
                </div>
                <div className="px-2.5 py-1 rounded-xl bg-rose-50/70 border border-rose-200/80 flex items-center gap-1 text-xs">
                  <span className="text-rose-600 font-medium">Outstanding:</span>
                  <span className="font-bold text-rose-700 font-mono">{formatCurrency(totalOutstandingSum)}</span>
                </div>
              </div>
            }
            search={search}
            onSearchChange={(val) => { setSearch(val); setSheetCurrentPage(1); }}
            rowsPerPage={sheetRowsPerPage}
            onRowsPerPageChange={(val) => { setSheetRowsPerPage(val); setSheetCurrentPage(1); }}
            availableRowsOptions={[5, 10, 25, 50, 100, 'All']}
            columns={RENT_SHEET_COLUMNS_DEF}
            visibleColumns={visibleSheetColumns}
            onChangeVisibleColumns={(cols) => {
              setVisibleSheetColumns(cols);
              try { localStorage.setItem('cols_payments_sheet_v6', JSON.stringify(cols)); } catch(e){}
            }}
            onResetWidths={resetColumnWidths}
            isHeaderSticky={isSheetHeaderSticky}
            onToggleHeaderSticky={setIsSheetHeaderSticky}
            frozenColumnCount={frozenSheetCount}
            onFrozenColumnCountChange={setFrozenSheetCount}
            filters={sheetFilters}
            onFiltersChange={(flts) => { setSheetFilters(flts); setSheetCurrentPage(1); }}
            filterSuggestions={sheetFilterSuggestions}
            onExport={exportSheetToExcel}
            storageKey="payments_sheet_v5"
            activeViewName={sheetActiveViewId}
            onViewChange={setSheetActiveViewId}
          />

          {/* The Excel Grid Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
            {/* Mobile Swipe Cue */}
            <div className="sm:hidden px-3 py-1.5 bg-emerald-50 border-b border-emerald-100 text-[11px] text-emerald-800 font-medium flex items-center justify-between">
              <span>Swipe horizontally to view all columns</span>
              <span>→</span>
            </div>

            {loading ? (
              <div className="py-20 text-center text-slate-400 text-sm">Loading collection sheet for {formatMonthYear(selectedMonth)}...</div>
            ) : sortedSheetRows.length === 0 ? (
              <div className="py-20 text-center text-slate-400 text-sm">No tenant records found matching your filters.</div>
            ) : (
              <div ref={sheetTableContainerRef} tabIndex={0} className="overflow-x-auto max-h-[70vh] overflow-y-auto outline-none" style={{ WebkitOverflowScrolling: 'touch' }}>
                <table
                  className="w-full text-left text-sm border-collapse table-fixed"
                  style={{ minWidth: `${visibleSheetColumns.reduce((sum, colId) => sum + (columnWidths[colId] || DEFAULT_SHEET_COLUMN_WIDTHS[colId] || 120), 0)}px` }}
                >
                  <colgroup>
                    {visibleSheetColumns.map(colId => (
                      <col
                        key={colId}
                        style={{ width: `${columnWidths[colId] || DEFAULT_SHEET_COLUMN_WIDTHS[colId] || 120}px` }}
                      />
                    ))}
                  </colgroup>
                  <thead className={`bg-slate-100/90 border-b border-slate-200 select-none ${isSheetHeaderSticky ? 'sticky top-0 z-20 shadow-xs' : ''}`}>
                    <tr className="text-[11px] text-slate-700 font-extrabold">
                      {visibleSheetColumns.map((colId, colIndex) => {
                        const dragProps = getHeaderDragProps(colId, visibleSheetColumns, setVisibleSheetColumns, 'payments_sheet_v6');
                        const width = columnWidths[colId] || DEFAULT_SHEET_COLUMN_WIDTHS[colId] || 120;
                        const frozenStyle = getFrozenColumnStyle(colIndex, frozenSheetCount, visibleSheetColumns, columnWidths, true);
                        
                        let label = colId;
                        let align = 'text-left';
                        let extraClass = '';
                        
                        if (colId === 'index') { label = '#'; align = 'text-center'; }
                        else if (colId === 'tenant') { label = 'Tenant Details'; }
                        else if (colId === 'property') { label = 'Property'; }
                        else if (colId === 'subUnit') { label = 'Sub-Unit'; }
                        else if (colId === 'contractNo') { label = 'Contract No'; }
                        else if (colId === 'monthlyRent') { label = 'Monthly Rent'; align = 'text-right'; }
                        else if (colId === 'outstanding') { label = 'Outstanding'; align = 'text-right'; extraClass = 'bg-rose-50/50 text-rose-900'; }
                        else if (colId === 'paidUpTo') { label = 'Paid Up To'; align = 'text-center'; }
                        else if (colId === 'accountingMonth') { label = 'Accounting Month'; align = 'text-center'; }
                        else if (colId === 'receiptNumber') { label = 'Receipt #'; align = 'text-center'; }
                        else if (colId === 'paidForMonth') { label = 'Month Paid For'; }
                        else if (colId === 'rentAmount') { label = 'Rent Amount Paid'; align = 'text-right'; }
                        else if (colId === 'depositAmount') { label = 'Deposit Amount'; align = 'text-right'; }
                        else if (colId === 'amount') { label = 'Total Amount Paid'; align = 'text-right'; }
                        else if (colId === 'tenantPhone') { label = 'Tenant Phone'; }
                        else if (colId === 'propertyType') { label = 'Property Type'; }
                        else if (colId === 'subUnitArea') { label = 'Area (Sq Ft)'; align = 'text-right'; }
                        else if (colId === 'floor') { label = 'Floor'; }
                        else if (colId === 'deposit') { label = 'Deposit'; align = 'text-right'; }
                        else if (colId === 'nextUnpaid') { label = 'Next Unpaid'; align = 'text-center'; }
                        else if (colId === 'totalCollected') { label = 'Lifetime Paid'; align = 'text-right'; }
                        else if (colId === 'createdAt') { label = 'Created Date'; align = 'text-center'; }
                        else if (colId === 'updatedAt') { label = 'Modified Date'; align = 'text-center'; }
                        else if (colId === 'actions') { label = 'Collection'; align = 'text-right'; }
                        else {
                          const colDef = RENT_SHEET_COLUMNS_DEF.find(c => c.id === colId);
                          if (colDef?.label) label = colDef.label;
                        }

                        const isSortable = !['actions', 'paidForMonth', 'amount', 'rentAmount', 'depositAmount'].includes(colId);

                        return (
                          <th
                            key={colId}
                            {...dragProps}
                            style={{ ...frozenStyle, width: `${Math.max(width, 45)}px`, minWidth: `${Math.max(width, 45)}px` }}
                            className={`py-2 pl-2.5 pr-6 border-r border-slate-300 relative group bg-slate-100 select-none whitespace-normal break-words leading-tight ${align} ${extraClass}`}
                          >
                            <div className={`flex items-center gap-1 w-full ${
                              align === 'text-right' ? 'justify-end' : align === 'text-center' ? 'justify-center' : 'justify-start'
                            }`}>
                              {!isSortable ? (
                                <span className="break-words leading-tight text-xs font-bold text-slate-700">{label}</span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleSheetHeaderSort(colId)}
                                  className="group/btn flex items-center gap-1 min-w-0 max-w-full text-xs font-bold text-slate-700 hover:text-slate-900 transition-colors text-left"
                                  title={`Sort by ${label} (Click: Descending → Ascending → Clear)`}
                                >
                                  <span className="break-words leading-tight">{label}</span>
                                  <span className="inline-flex shrink-0 items-center justify-center w-3.5 h-3.5">
                                    {sheetSortConfig.key === colId ? (
                                      sheetSortConfig.direction === 'desc' ? (
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
                    {paginatedSheetRows.map((item, idx) => {
                      const rowKey = getRowKey(item);
                      const draft = getRowDraft(item);
                      const monthData = item.monthsBreakdown?.find(m => m.monthYear === selectedMonth);
                      const expectedRate = (monthData && monthData.expectedRate > 0) ? monthData.expectedRate : (item.monthlyRentExpected || item.unit?.monthlyRentExpected || 0);
                      const paidThisMonth = monthData ? monthData.allocatedAmount : 0;
                      const outstandingTotal = item.totalOutstanding || 0;
                      
                      const isRowEditing = Boolean(rowDrafts[rowKey]);
                      const savedRent = (item.rentAmountPaid !== undefined ? Number(item.rentAmountPaid) : (item.actualPaidForMonth !== undefined ? Number(item.actualPaidForMonth) : paidThisMonth)) || 0;
                      const currentRent = draft.rentAmount !== undefined && draft.rentAmount !== ''
                        ? Number(draft.rentAmount)
                        : (draft.amount !== undefined && draft.amount !== ''
                            ? Math.max(0, Number(draft.amount) - (Number(draft.depositAmount) || 0))
                            : savedRent);
                      const rentDiff = isRowEditing ? (savedRent - (isNaN(currentRent) ? 0 : currentRent)) : 0;
                      const effectiveOutstanding = Math.max(0, outstandingTotal + rentDiff);

                      const isFullyPaidThisMonth = (isRowEditing ? currentRent : savedRent) >= expectedRate && expectedRate > 0;
                      const isPartial = (isRowEditing ? currentRent : savedRent) > 0 && (isRowEditing ? currentRent : savedRent) < expectedRate;
                      
                      const matchedTenant = tenants.find(t => t._id === item.tenant?._id);
                      const matchedUnit = units.find(u => u._id === item.unit?._id);
                      const matchedProp = properties.find(p => p._id === item.property?._id || p._id === item.unit?.propertyId);

                      const isRowSelected = selectedRowIndex === idx;

                      return (
                        <tr
                          key={item.assignmentId || idx}
                          ref={el => { if (el) sheetRowRefs.current[idx] = el; }}
                          onClick={() => {
                            setSelectedRowIndex(idx);
                            if (selectedColIndex === null) setSelectedColIndex(0);
                          }}
                          className={`transition-colors cursor-pointer ${
                            isRowSelected
                              ? 'border-y-2 border-blue-400 bg-blue-50/70 shadow-2xs'
                              : 'hover:bg-slate-50/80'
                          }`}
                        >
                          {visibleSheetColumns.map((colId, colIndex) => {
                            const frozenStyle = getFrozenColumnStyle(colIndex, frozenSheetCount, visibleSheetColumns, columnWidths, false);
                            const isCellSelected = isRowSelected && selectedColIndex === colIndex;
                            const isFrozen = colIndex < frozenSheetCount;
                            const cellNavProps = {
                              ref: el => { if (el) sheetCellRefs.current[`${idx}_${colIndex}`] = el; },
                              tabIndex: -1,
                              onClick: (e) => {
                                setSelectedRowIndex(idx);
                                setSelectedColIndex(colIndex);
                              }
                            };
                            const cellHighlightClass = isCellSelected
                              ? 'ring-2 ring-inset ring-blue-500 bg-blue-100/70 z-20'
                              : isRowSelected
                                ? (isFrozen ? 'bg-blue-50/95' : 'bg-blue-50/60')
                                : (isFrozen ? 'bg-white' : '');

                            const renderCellTd = (extraClass, children) => (
                              <td
                                key={colId}
                                {...cellNavProps}
                                style={frozenStyle}
                                className={`${extraClass} ${cellHighlightClass}`}
                              >
                                {children}
                              </td>
                            );

                            if (colId === 'index') {
                              return renderCellTd(
                                "px-4 py-3.5 border-r border-slate-100 text-center text-xs font-mono",
                                item.property?.displayOrder ? (
                                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-slate-100 font-bold text-slate-700 text-[11px]" title={`Property Order: ${item.property.displayOrder}`}>
                                    {item.property.displayOrder}
                                  </span>
                                ) : (
                                  <span className="text-slate-400">{idx + 1}</span>
                                )
                              );
                            }
                            if (colId === 'tenant') {
                              const existingReceiptForRow = findReceiptForUnitAndMonth(item, selectedMonth);
                              const rowStatus = draft.status || existingReceiptForRow?.status || item.status || (item.tenant ? 'Rented' : 'Vacant');
                              const isVacant = rowStatus === 'Vacant';
                              return renderCellTd(
                                "px-4 py-3.5 border-r border-slate-100",
                                isVacant ? (
                                  <div>
                                    <span className="text-amber-800 font-bold text-xs italic bg-amber-50 px-2.5 py-0.5 rounded-md border border-amber-200/70 inline-block">
                                      — (Vacant)
                                    </span>
                                    <p className="text-slate-400 text-[10px] mt-0.5 italic">No tenant assigned</p>
                                  </div>
                                ) : (
                                  <>
                                    <p className="font-bold text-slate-900 text-sm">{item.tenant?.name || 'Unknown'}</p>
                                    <p className="text-slate-400 text-xs mt-0.5">{item.tenant?.phone || '—'}</p>
                                  </>
                                )
                              );
                            }
                            if (colId === 'property') {
                              return renderCellTd(
                                "px-4 py-3.5 border-r border-slate-100",
                                <div className="font-semibold text-slate-800 text-xs">
                                  {item.property?.name || '—'}
                                </div>
                              );
                            }
                            if (colId === 'subUnit') {
                              return renderCellTd(
                                "px-4 py-3.5 border-r border-slate-100",
                                <>
                                  <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-xs font-semibold">
                                    <Layers className="w-3 h-3 text-slate-400" />
                                    <span>{item.unit?.subUnitPartition || item.unit?.unitName || 'Partition'}</span>
                                  </div>
                                  {item.unit?.areaSqFt && <div className="text-[10px] text-slate-400 mt-0.5 font-normal">{item.unit.areaSqFt} sq ft</div>}
                                </>
                              );
                            }
                            if (colId === 'status') {
                              const existingReceiptForRow = findReceiptForUnitAndMonth(item, selectedMonth);
                              const rowStatus = draft.status || existingReceiptForRow?.status || item.status || (item.tenant ? 'Rented' : 'Vacant');
                              return renderCellTd(
                                "px-2 py-2 border-r border-slate-100 text-xs",
                                <div className="relative inline-flex items-center">
                                  <select
                                    value={rowStatus}
                                    disabled={savingRows[rowKey]}
                                    onFocus={() => {
                                      setSelectedRowIndex(idx);
                                      setSelectedColIndex(colIndex);
                                    }}
                                    onChange={(e) => handleRowStatusChange(item, e.target.value)}
                                    className={`text-[11px] font-extrabold rounded-lg pl-2 pr-6 py-1 border transition-all cursor-pointer focus:outline-none focus:ring-2 appearance-none shadow-2xs ${
                                      rowStatus === 'Vacant'
                                        ? 'bg-amber-100/90 text-amber-900 border-amber-300 hover:bg-amber-200/80 focus:ring-amber-400'
                                        : 'bg-emerald-100/90 text-emerald-900 border-emerald-300 hover:bg-emerald-200/80 focus:ring-emerald-400'
                                    } ${savingRows[rowKey] ? 'opacity-50 cursor-wait' : ''}`}
                                    title="Change status between Rented and Vacant irrespective of contract"
                                  >
                                    <option value="Rented">● Rented</option>
                                    <option value="Vacant">● Vacant</option>
                                  </select>
                                  <ChevronDown className="w-3 h-3 absolute right-1.5 pointer-events-none opacity-60 text-slate-700" />
                                </div>
                              );
                            }
                            if (colId === 'contractNo') {
                              const existingReceiptForRow = findReceiptForUnitAndMonth(item, selectedMonth);
                              const rowStatus = draft.status || existingReceiptForRow?.status || item.status || (item.tenant ? 'Rented' : 'Vacant');
                              if (rowStatus === 'Vacant') {
                                return renderCellTd(
                                  "px-3 py-3.5 border-r border-slate-100 text-xs",
                                  <span className="text-amber-800/80 font-mono text-xs italic bg-amber-50 px-2 py-0.5 rounded border border-amber-200/60 inline-block">
                                    —
                                  </span>
                                );
                              }
                              const matchingContracts = getMatchingContractsForRow(item, selectedMonth);
                              const activeContractNo = draft.contractNo || item.contractNo || matchingContracts[0]?.contractNo;
                              return renderCellTd(
                                "px-3 py-3.5 border-r border-slate-100 text-xs",
                                matchingContracts.length > 1 ? (
                                  <select
                                    value={activeContractNo || ''}
                                    onFocus={() => {
                                      setSelectedRowIndex(idx);
                                      setSelectedColIndex(colIndex);
                                    }}
                                    onChange={(e) => updateRowDraft(rowKey, { contractNo: e.target.value }, item)}
                                    className="text-xs font-bold text-teal-800 bg-teal-50/80 border border-teal-300 rounded-lg py-1 px-1.5 focus:outline-none focus:ring-1 focus:ring-teal-500 cursor-pointer max-w-[130px]"
                                    title="Select Lease Contract valid for this period"
                                  >
                                    {matchingContracts.map(c => (
                                      <option key={c._id} value={c.contractNo || c.assignmentCode}>
                                        {c.contractNo || c.assignmentCode}
                                      </option>
                                    ))}
                                  </select>
                                ) : activeContractNo ? (
                                  <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-teal-50 text-teal-800 border border-teal-200/80 font-bold text-xs shadow-2xs font-mono">
                                    <span>{activeContractNo}</span>
                                  </div>
                                ) : (
                                  <span className="text-slate-400 text-[11px] italic">No active contract</span>
                                )
                              );
                            }
                            if (colId === 'monthlyRent') {
                              const isEditingThisRent = editingRentUnitId === item.unit?._id;
                              return renderCellTd(
                                "px-3 py-3.5 border-r border-slate-100 text-right font-semibold text-slate-700 text-xs font-mono",
                                isEditingThisRent ? (
                                  <div className="flex items-center justify-end gap-1">
                                    <span className="text-[11px] text-slate-400 font-bold">₹</span>
                                    <input
                                      type="number"
                                      autoFocus
                                      value={editingRentValue}
                                      onChange={(e) => setEditingRentValue(e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleSaveRentRate(item.unit?._id);
                                        if (e.key === 'Escape') setEditingRentUnitId(null);
                                      }}
                                      className="w-20 px-1.5 py-1 text-xs font-bold font-mono border border-emerald-400 rounded-md focus:outline-none focus:ring-1 focus:ring-emerald-500 bg-white"
                                    />
                                    <button
                                      type="button"
                                      disabled={savingRentUnitId === item.unit?._id}
                                      onClick={() => handleSaveRentRate(item.unit?._id)}
                                      className="p-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50"
                                      title="Save Rent Rate"
                                    >
                                      <Check className="w-3 h-3" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setEditingRentUnitId(null)}
                                      className="p-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-500"
                                      title="Cancel"
                                    >
                                      <X className="w-3 h-3" />
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex items-center justify-end gap-1.5 group">
                                    <span>{formatCurrency(expectedRate)}</span>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingRentUnitId(item.unit?._id);
                                        setEditingRentValue(String(expectedRate));
                                      }}
                                      className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-400 hover:text-emerald-600 transition-opacity"
                                      title="Click to edit expected monthly rent"
                                    >
                                      <Edit2 className="w-3 h-3" />
                                    </button>
                                  </div>
                                )
                              );
                            }
                            if (colId === 'outstanding') {
                              return renderCellTd(
                                "px-3 py-3.5 border-r border-slate-100 text-right font-extrabold text-xs",
                                effectiveOutstanding > 0 ? (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-black bg-rose-50 text-rose-700 border border-rose-200 font-mono">
                                    {formatCurrency(effectiveOutstanding)}
                                  </span>
                                ) : (
                                  <span className="font-semibold text-slate-700 text-xs font-mono">
                                    ₹0
                                  </span>
                                )
                              );
                            }
                            if (colId === 'paidUpTo') {
                              return renderCellTd(
                                "px-4 py-3.5 border-r border-slate-100 text-center text-xs font-medium text-slate-600",
                                item.paidTillMonth && item.paidTillMonth !== 'None' ? (
                                  <span className="text-slate-700 font-semibold">{formatMonthYear(item.paidTillMonth)}</span>
                                ) : (
                                  <span className="text-slate-400 italic">None</span>
                                )
                              );
                            }
                            if (colId === 'accountingMonth') {
                              return renderCellTd(
                                "px-3 py-3.5 border-r border-slate-100 text-center text-xs font-semibold text-slate-700 whitespace-nowrap",
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-teal-50 text-teal-800 border border-teal-200/60 font-bold">
                                  <Calendar className="w-3 h-3 text-teal-600" />
                                  {formatMonthYear(selectedMonth)}
                                </span>
                              );
                            }
                            if (colId === 'receiptNumber') {
                              const existingReceiptForRow = findReceiptForUnitAndMonth(item, selectedMonth);
                              const rNo = existingReceiptForRow?.receiptNumber || item.receiptNumber;
                              return renderCellTd(
                                "px-3 py-3.5 border-r border-slate-100 text-center text-xs font-mono font-bold whitespace-nowrap",
                                rNo ? (
                                  <button
                                    type="button"
                                    onClick={() => openFastPaymentModal(item)}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 hover:text-indigo-800 border border-indigo-200/80 cursor-pointer transition-colors shadow-2xs font-bold font-mono"
                                    title="Edit Month / Payment Details for this receipt"
                                  >
                                    <Receipt className="w-3 h-3 text-indigo-500" />
                                    <span>{rNo}</span>
                                  </button>
                                ) : (
                                  <span className="text-slate-400 text-xs italic">—</span>
                                )
                              );
                            }
                            if (colId === 'paidForMonth') {
                              const existingReceiptForRow = findReceiptForUnitAndMonth(item, selectedMonth);
                              const rowStatus = draft.status || existingReceiptForRow?.status || item.status || (item.tenant ? 'Rented' : 'Vacant');
                              const isVacant = rowStatus === 'Vacant';

                              if (isVacant) {
                                return renderCellTd(
                                  "px-3 py-3 border-r border-slate-100 text-center",
                                  <span className="text-amber-800/80 font-mono text-xs italic bg-amber-50 px-2 py-0.5 rounded border border-amber-200/60 inline-block">
                                    — (Vacant) —
                                  </span>
                                );
                              }

                              const selMonths = (draft.selectedMonths && draft.selectedMonths.length > 0)
                                ? draft.selectedMonths
                                : resolveSelectedMonthsForItem(item, selectedMonth, existingReceiptForRow);

                              return renderCellTd(
                                "px-3 py-3 border-r border-slate-100 relative",
                                <>
                                  <div className="flex items-center">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (openMonthPickerRow === rowKey) {
                                          setOpenMonthPickerRow(null);
                                        } else {
                                          const rect = e.currentTarget.getBoundingClientRect();
                                          const popoverWidth = 450;
                                          const popoverHeight = 360;
                                          
                                          // Smart Horizontal: fit within window with 16px margins
                                          let left = rect.left;
                                          if (left + popoverWidth > window.innerWidth - 16) {
                                            left = window.innerWidth - popoverWidth - 16;
                                          }
                                          if (left < 16) left = 16;

                                          // Smart Vertical: prefer below button, flip above if not enough space
                                          let top = rect.bottom + 6;
                                          if (top + popoverHeight > window.innerHeight - 16 && rect.top > popoverHeight + 16) {
                                            top = rect.top - popoverHeight - 6;
                                          }

                                          setMonthPickerCoords({ top, left });
                                          setOpenMonthPickerRow(rowKey);
                                        }
                                      }}
                                      className="w-full inline-flex items-center justify-between gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 bg-slate-50 hover:bg-white hover:border-emerald-500 hover:shadow-xs transition-all text-slate-800 group"
                                      title="Click to select or change payment month(s)"
                                    >
                                      <div className="flex items-center gap-1.5 truncate">
                                        <Calendar className="w-3.5 h-3.5 text-slate-400 group-hover:text-emerald-600 shrink-0" />
                                        <span className="truncate font-bold text-slate-800">
                                          {selMonths.length === 0 ? (
                                            <span className="text-slate-400 font-normal italic">— (None)</span>
                                          ) : (
                                            selMonths.map((m) => {
                                              const isAct = m === selectedMonth;
                                              const isAdv = m > selectedMonth;
                                              return `${formatMonthYear(m)}${isAdv ? ' (Adv)' : !isAct ? ' (Due)' : ''}`;
                                            }).join(', ')
                                          )}
                                        </span>
                                      </div>
                                      <ChevronDown className="w-3 h-3 text-slate-400 group-hover:text-slate-700 shrink-0 ml-1" />
                                    </button>
                                  </div>

                                  {/* Multi-Month Selection Popover */}
                                  {openMonthPickerRow === rowKey && typeof document !== 'undefined' && createPortal(
                                    (() => {
                                      const payableMonths = getPayableMonthsList(item, selectedMonth, selMonths);
                                      const currentMonths = payableMonths.filter(m => m.type === 'current');
                                      const pastMonths = payableMonths.filter(m => m.type === 'past').sort((a, b) => b.monthYear.localeCompare(a.monthYear));
                                      const advanceMonths = payableMonths.filter(m => m.type === 'advance').sort((a, b) => a.monthYear.localeCompare(b.monthYear));

                                      return (
                                        <div className="fixed inset-0 z-[99999] pointer-events-auto">
                                          {/* Click-away backdrop overlay to dismiss on outside click */}
                                          <div 
                                            className="fixed inset-0 bg-slate-900/15 backdrop-blur-[0.5px] cursor-default" 
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setOpenMonthPickerRow(null);
                                            }} 
                                          />

                                          <div
                                            onClick={(e) => e.stopPropagation()}
                                            style={{
                                              position: 'fixed',
                                              top: `${monthPickerCoords.top}px`,
                                              left: `${monthPickerCoords.left}px`,
                                            }}
                                            className="bg-white border border-slate-200 rounded-2xl shadow-2xl p-3 w-[450px] max-w-[calc(100vw-32px)] text-xs cursor-default text-left animate-in fade-in zoom-in-95 duration-150"
                                          >
                                            {/* Popover Header */}
                                            <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
                                              <div className="flex items-center gap-1.5">
                                                <Calendar className="w-3.5 h-3.5 text-emerald-600" />
                                                <span className="font-extrabold text-slate-900">Select Month(s) to Pay</span>
                                              </div>
                                              <button
                                                type="button"
                                                onClick={() => setOpenMonthPickerRow(null)}
                                                className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md p-1 transition-colors cursor-pointer"
                                                title="Close"
                                              >
                                                <X className="w-3.5 h-3.5" />
                                              </button>
                                            </div>

                                            {/* 2-Columns Side by Side Month Grid */}
                                            <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
                                              {/* 1. Accounting Month (1st) */}
                                              {currentMonths.length > 0 && (
                                                <div>
                                                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded block border border-emerald-200/60 mb-1">
                                                    Accounting Month
                                                  </span>
                                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                                                    {currentMonths.map(m => (
                                                      <label 
                                                        key={m.monthYear} 
                                                        className={`flex items-center justify-between gap-1.5 p-1.5 rounded-lg cursor-pointer border transition-all ${
                                                          selMonths.includes(m.monthYear)
                                                            ? 'bg-emerald-50/80 border-emerald-400 shadow-2xs'
                                                            : 'hover:bg-slate-50 border-slate-200/80'
                                                        }`}
                                                      >
                                                        <div className="flex items-center gap-1.5 min-w-0">
                                                          <input
                                                            type="checkbox"
                                                            checked={selMonths.includes(m.monthYear)}
                                                            onChange={() => handleToggleMonthForRow(item, m.monthYear)}
                                                            className="rounded text-emerald-600 focus:ring-emerald-500 w-3.5 h-3.5 cursor-pointer shrink-0"
                                                          />
                                                          <span className="text-slate-900 font-extrabold text-[11px] truncate">
                                                            {formatMonthYear(m.monthYear)}
                                                          </span>
                                                        </div>
                                                        <span className="text-[10px] font-black text-emerald-700 bg-emerald-100/90 px-1.5 py-0.5 rounded shrink-0">
                                                          ₹{Number(m.dueAmount || 0).toLocaleString('en-IN')}
                                                        </span>
                                                      </label>
                                                    ))}
                                                  </div>
                                                </div>
                                              )}

                                              {/* 2. Previous Month(s) - 2-Column Grid */}
                                              {pastMonths.length > 0 && (
                                                <div>
                                                  <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 bg-amber-50 px-2 py-0.5 rounded block border border-amber-200/60 mb-1">
                                                    Previous Month(s) ({pastMonths.length})
                                                  </span>
                                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                                                    {pastMonths.map(m => (
                                                      <label 
                                                        key={m.monthYear} 
                                                        className={`flex items-center justify-between gap-1.5 p-1.5 rounded-lg cursor-pointer border transition-all ${
                                                          selMonths.includes(m.monthYear)
                                                            ? 'bg-amber-50/80 border-amber-400 shadow-2xs'
                                                            : 'hover:bg-slate-50 border-slate-200/80'
                                                        }`}
                                                      >
                                                        <div className="flex items-center gap-1.5 min-w-0">
                                                          <input
                                                            type="checkbox"
                                                            checked={selMonths.includes(m.monthYear)}
                                                            onChange={() => handleToggleMonthForRow(item, m.monthYear)}
                                                            className="rounded text-amber-600 focus:ring-amber-500 w-3.5 h-3.5 cursor-pointer shrink-0"
                                                          />
                                                          <span className="text-slate-800 font-bold text-[11px] truncate">
                                                            {formatMonthYear(m.monthYear)}
                                                          </span>
                                                        </div>
                                                        <span className="text-[10px] font-extrabold text-amber-800 bg-amber-100/90 px-1.5 py-0.5 rounded shrink-0">
                                                          ₹{Number(m.dueAmount || 0).toLocaleString('en-IN')}
                                                        </span>
                                                      </label>
                                                    ))}
                                                  </div>
                                                </div>
                                              )}

                                              {/* 3. Advance Months - 2-Column Grid */}
                                              {advanceMonths.length > 0 && (
                                                <div>
                                                  <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700 bg-blue-50 px-2 py-0.5 rounded block border border-blue-200/60 mb-1">
                                                    Upcoming Month(s) (Advance)
                                                  </span>
                                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                                                    {advanceMonths.map(m => (
                                                      <label 
                                                        key={m.monthYear} 
                                                        className={`flex items-center justify-between gap-1.5 p-1.5 rounded-lg cursor-pointer border transition-all ${
                                                          selMonths.includes(m.monthYear)
                                                            ? 'bg-blue-50/80 border-blue-400 shadow-2xs'
                                                            : 'hover:bg-slate-50 border-slate-200/80'
                                                        }`}
                                                      >
                                                        <div className="flex items-center gap-1.5 min-w-0">
                                                          <input
                                                            type="checkbox"
                                                            checked={selMonths.includes(m.monthYear)}
                                                            onChange={() => handleToggleMonthForRow(item, m.monthYear)}
                                                            className="rounded text-blue-600 focus:ring-blue-500 w-3.5 h-3.5 cursor-pointer shrink-0"
                                                          />
                                                          <span className="text-slate-800 font-bold text-[11px] truncate">
                                                            {formatMonthYear(m.monthYear)}
                                                          </span>
                                                        </div>
                                                        <span className="text-[10px] font-extrabold text-blue-700 bg-blue-100/90 px-1.5 py-0.5 rounded shrink-0">
                                                          Adv
                                                        </span>
                                                      </label>
                                                    ))}
                                                  </div>
                                                </div>
                                              )}
                                            </div>

                                            {/* Popover Footer: Summary + Direct Save Action right inside the dropdown */}
                                            <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between gap-2 text-[11px]">
                                              <div className="flex flex-col leading-tight min-w-0">
                                                <span className="text-[10px] text-slate-400 font-bold uppercase">Selected Total</span>
                                                <span className="text-slate-800 font-black truncate">
                                                  {selMonths.length} mo • ₹{Number(draft.amount || 0).toLocaleString('en-IN')}
                                                </span>
                                              </div>

                                              <div className="flex items-center gap-1.5 shrink-0">
                                                <button
                                                  type="button"
                                                  onClick={() => setOpenMonthPickerRow(null)}
                                                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 text-xs transition-colors cursor-pointer"
                                                  title="Close month picker"
                                                >
                                                  Done
                                                </button>
                                                <button
                                                  type="button"
                                                  onClick={async () => {
                                                    setOpenMonthPickerRow(null);
                                                    await handleDirectSaveRow(item);
                                                  }}
                                                  disabled={savingRows[rowKey]}
                                                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs shadow-sm shadow-emerald-600/30 active:scale-95 transition-all cursor-pointer"
                                                  title="Save payment immediately without scrolling to the table end"
                                                >
                                                  {savingRows[rowKey] ? (
                                                    <span>Saving...</span>
                                                  ) : (
                                                    <>
                                                      <Check className="w-3.5 h-3.5" />
                                                      <span>Save Payment</span>
                                                    </>
                                                  )}
                                                </button>
                                              </div>
                                            </div>
                                          </div>
                                        </div>
                                      );
                                    })(),
                                    document.body
                                  )}
                                </>
                              );
                            }
                            if (colId === 'rentAmount') {
                              return renderCellTd(
                                "px-3 py-3 border-r border-slate-100",
                                <div className="relative flex items-center">
                                  <span className="absolute left-2.5 text-slate-400 text-xs font-semibold">₹</span>
                                  <input
                                    type="number"
                                    value={draft.rentAmount ?? ''}
                                    disabled={savingRows[rowKey]}
                                    onFocus={() => {
                                      setSelectedRowIndex(idx);
                                      setSelectedColIndex(colIndex);
                                    }}
                                    onChange={(e) => updateRowDraft(rowKey, { rentAmount: e.target.value }, item)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') handleDirectSaveRow(item);
                                    }}
                                    className="w-full pl-6 pr-2 py-1.5 text-xs font-extrabold text-emerald-800 bg-white border border-emerald-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono shadow-xs disabled:bg-slate-100 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                    placeholder="Rent ₹"
                                    title="Rent Amount Paid (Default). Press Enter to Save."
                                  />
                                </div>
                              );
                            }
                            if (colId === 'depositAmount') {
                              return renderCellTd(
                                "px-3 py-3 border-r border-slate-100",
                                <div className="relative flex items-center">
                                  <span className="absolute left-2.5 text-slate-400 text-xs font-semibold">₹</span>
                                  <input
                                    type="number"
                                    value={draft.depositAmount ?? ''}
                                    disabled={savingRows[rowKey]}
                                    onFocus={() => {
                                      setSelectedRowIndex(idx);
                                      setSelectedColIndex(colIndex);
                                    }}
                                    onChange={(e) => updateRowDraft(rowKey, { depositAmount: e.target.value }, item)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') handleDirectSaveRow(item);
                                    }}
                                    className="w-full pl-6 pr-2 py-1.5 text-xs font-bold text-amber-800 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono shadow-xs disabled:bg-slate-100 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                    placeholder="0"
                                    title="Deposit Amount. Press Enter to Save."
                                  />
                                </div>
                              );
                            }
                            if (colId === 'amount') {
                              return renderCellTd(
                                "px-3 py-3 border-r border-slate-100",
                                <div className="relative flex items-center">
                                  <span className="absolute left-2.5 text-slate-400 text-xs font-semibold">₹</span>
                                  <input
                                    type="number"
                                    value={draft.amount ?? ''}
                                    disabled={savingRows[rowKey]}
                                    onFocus={() => {
                                      setSelectedRowIndex(idx);
                                      setSelectedColIndex(colIndex);
                                    }}
                                    onChange={(e) => updateRowDraft(rowKey, { amount: e.target.value }, item)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') handleDirectSaveRow(item);
                                    }}
                                    className="w-full pl-6 pr-2 py-1.5 text-xs font-black text-slate-900 bg-teal-50/50 border border-teal-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 font-mono shadow-xs disabled:bg-slate-100 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                    placeholder="Total ₹"
                                    title="Total Amount Paid = Rent + Deposit. Press Enter to Save."
                                  />
                                </div>
                              );
                            }
                            if (colId === 'adjustmentAmount') {
                              const adj = item.adjustmentAmount || 0;
                              return renderCellTd(
                                "px-3 py-3.5 border-r border-slate-100 text-right text-xs font-mono font-bold",
                                adj !== 0 ? (
                                  <span className={adj > 0 ? 'text-blue-700' : 'text-amber-700'}>
                                    {adj > 0 ? `+${formatCurrency(adj)}` : `-${formatCurrency(Math.abs(adj))}`}
                                  </span>
                                ) : (
                                  <span className="text-slate-400">₹0</span>
                                )
                              );
                            }
                            if (colId === 'adjustedOutstanding') {
                              const netDue = Math.max(0, effectiveOutstanding + (Number(item.adjustmentAmount) || 0));
                              return renderCellTd(
                                "px-3 py-3.5 border-r border-slate-100 text-right text-xs font-mono font-black",
                                netDue > 0 ? (
                                  <span className="text-rose-700">{formatCurrency(netDue)}</span>
                                ) : (
                                  <span className="text-emerald-700">₹0</span>
                                )
                              );
                            }
                            if (colId === 'adjustmentDescription') {
                              return renderCellTd(
                                "px-3 py-3.5 border-r border-slate-100 text-xs text-slate-600 max-w-xs truncate",
                                item.adjustmentDescription || '—'
                              );
                            }
                            if (colId === 'contractStartDate') {
                              return renderCellTd(
                                "px-3 py-3.5 border-r border-slate-100 text-xs text-slate-600 whitespace-nowrap",
                                item.startDate ? formatDate(item.startDate) : '—'
                              );
                            }
                            if (colId === 'contractEndDate') {
                              return renderCellTd(
                                "px-3 py-3.5 border-r border-slate-100 text-xs text-slate-600 whitespace-nowrap",
                                item.endDate ? formatDate(item.endDate) : 'Ongoing'
                              );
                            }
                            if (colId === 'contractStatus') {
                              return renderCellTd(
                                "px-3 py-3.5 border-r border-slate-100 text-xs text-center",
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  item.contractStatus === 'Active' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                                }`}>
                                  {item.contractStatus || 'Active'}
                                </span>
                              );
                            }
                            if (colId === 'tenantPhone') {
                              return renderCellTd(
                                "px-4 py-3.5 border-r border-slate-100 text-xs text-slate-700",
                                item.tenant?.phone || matchedTenant?.phone || '—'
                              );
                            }
                            if (colId === 'propertyType') {
                              return renderCellTd(
                                "px-4 py-3.5 border-r border-slate-100 text-xs text-slate-700",
                                matchedProp?.type || '—'
                              );
                            }
                            if (colId === 'subUnitArea') {
                              return renderCellTd(
                                "px-4 py-3.5 border-r border-slate-100 text-right text-xs font-semibold text-slate-700",
                                matchedUnit?.areaSqFt ? `${matchedUnit.areaSqFt} sq ft` : (item.unit?.areaSqFt ? `${item.unit.areaSqFt} sq ft` : '—')
                              );
                            }
                            if (colId === 'floor') {
                              return renderCellTd(
                                "px-4 py-3.5 border-r border-slate-100 text-xs text-slate-600",
                                matchedUnit?.floor || item.unit?.floor || '—'
                              );
                            }
                            if (colId === 'deposit') {
                              return renderCellTd(
                                "px-4 py-3.5 border-r border-slate-100 text-right text-xs font-semibold text-slate-700",
                                matchedTenant?.securityDeposit ? formatCurrency(matchedTenant.securityDeposit) : '—'
                              );
                            }
                            if (colId === 'nextUnpaid') {
                              return renderCellTd(
                                "px-4 py-3.5 border-r border-slate-100 text-center text-xs font-semibold text-rose-600",
                                item.nextUnpaidMonth && item.nextUnpaidMonth !== 'Up to date' ? formatMonthYear(item.nextUnpaidMonth) : 'Up to date'
                              );
                            }
                            if (colId === 'totalCollected') {
                              return renderCellTd(
                                "px-4 py-3.5 border-r border-slate-100 text-right text-xs font-extrabold text-emerald-700",
                                formatCurrency(item.totalAllocated || 0)
                              );
                            }
                            if (colId === 'createdAt' || colId === 'updatedAt') {
                              return renderCellTd(
                                "px-4 py-3.5 border-r border-slate-100 text-xs text-slate-600 whitespace-nowrap",
                                item[colId] ? formatDate(item[colId]) : '—'
                              );
                            }
                            if (colId === 'tenantCode') {
                              return renderCellTd(
                                "px-4 py-3.5 border-r border-slate-100 font-mono text-xs text-slate-700",
                                item.tenant?.tenantCode || '—'
                              );
                            }
                            if (colId === 'tenantEmail') {
                              return renderCellTd(
                                "px-4 py-3.5 border-r border-slate-100 text-xs text-slate-600 truncate max-w-xs",
                                item.tenant?.email || '—'
                              );
                            }
                            if (colId === 'tenantAddress') {
                              return renderCellTd(
                                "px-4 py-3.5 border-r border-slate-100 text-xs text-slate-600 truncate max-w-xs",
                                item.tenant?.address || '—'
                              );
                            }
                            if (colId === 'tenantType') {
                              return renderCellTd(
                                "px-4 py-3.5 border-r border-slate-100 text-xs text-slate-700",
                                item.tenant?.tenantType || '—'
                              );
                            }
                            if (colId === 'propertyCode') {
                              return renderCellTd(
                                "px-4 py-3.5 border-r border-slate-100 font-mono text-xs text-slate-700",
                                item.property?.propertyCode || '—'
                              );
                            }
                            if (colId === 'propertyAddress') {
                              return renderCellTd(
                                "px-4 py-3.5 border-r border-slate-100 text-xs text-slate-600 truncate max-w-xs",
                                typeof item.property?.address === 'string' ? item.property.address : '—'
                              );
                            }
                            if (colId === 'city') {
                              return renderCellTd(
                                "px-4 py-3.5 border-r border-slate-100 text-xs text-slate-700",
                                item.property?.city || '—'
                              );
                            }
                            if (colId === 'unitCode') {
                              return renderCellTd(
                                "px-4 py-3.5 border-r border-slate-100 font-mono text-xs text-slate-700",
                                item.unit?.unitCode || '—'
                              );
                            }
                            if (colId === 'unitType') {
                              return renderCellTd(
                                "px-4 py-3.5 border-r border-slate-100 text-xs text-slate-700",
                                item.unit?.unitType || '—'
                              );
                            }
                            if (colId === 'occupancyStatus') {
                              return renderCellTd(
                                "px-4 py-3.5 border-r border-slate-100 text-xs text-center",
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">
                                  {item.unit?.occupancyStatus || 'Occupied'}
                                </span>
                              );
                            }
                            if (colId === 'contractType') {
                              return renderCellTd(
                                "px-4 py-3.5 border-r border-slate-100 text-xs text-slate-700",
                                item.contractType || 'Rent'
                              );
                            }
                            if (colId === 'actions') {
                              const hasEnteredAmount = draft.amount !== undefined && draft.amount !== '' && !isNaN(Number(draft.amount)) && Number(draft.amount) >= 0;
                              const existingReceiptForRow = findReceiptForUnitAndMonth(item, selectedMonth);
                              const canSaveRow = hasEnteredAmount || Boolean(existingReceiptForRow);
                              const isRowDeleting = deletingRowKey === rowKey;
                              return renderCellTd(
                                "px-3 py-3 text-right",
                                <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
                                  {/* 1-Click Direct Save Button */}
                                  <button
                                    type="button"
                                    onClick={() => handleDirectSaveRow(item)}
                                    disabled={savingRows[rowKey] || (!canSaveRow && !savedFeedback[rowKey])}
                                    className={`inline-flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm transition-all active:scale-95 shrink-0 ${
                                      savedFeedback[rowKey]
                                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                        : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/20'
                                    } ${savingRows[rowKey] ? 'opacity-70 cursor-wait' : ''}`}
                                    title={hasEnteredAmount ? "Save Payment (Enter)" : "Enter amount to save"}
                                  >
                                    {savingRows[rowKey] ? (
                                      <>
                                        <span className="animate-spin inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full" />
                                        <span>Saving...</span>
                                      </>
                                    ) : savedFeedback[rowKey] ? (
                                      <>
                                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                        <span>Saved ✓</span>
                                      </>
                                    ) : (
                                      <>
                                        <Check className="w-3.5 h-3.5" />
                                        <span>Save</span>
                                      </>
                                    )}
                                  </button>

                                  {/* Row Edit Button (Edits existing single entry record) */}
                                  <button
                                    type="button"
                                    onClick={() => openFastPaymentModal(item)}
                                    className="p-1.5 rounded-lg text-slate-500 hover:text-teal-700 hover:bg-teal-50 border border-slate-200 transition-colors shrink-0 shadow-2xs cursor-pointer"
                                    title={existingReceiptForRow ? "Edit Month / Payment Details" : "Add Month"}
                                  >
                                    <Edit2 className="w-3.5 h-3.5 text-teal-600" />
                                  </button>

                                  {/* Contract Ledger Eye Button */}
                                  <button
                                    type="button"
                                    onClick={() => setSelectedLedgerModal(item)}
                                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors shrink-0 cursor-pointer"
                                    title="View Contract Ledger & Receipts"
                                  >
                                    <Eye className="w-4 h-4" />
                                  </button>

                                  {/* Row Delete Button in Collection Screen Column */}
                                  <button
                                    type="button"
                                    disabled={!existingReceiptForRow || isRowDeleting}
                                    onClick={() => handleDeleteRowReceipt(item, existingReceiptForRow)}
                                    className={`p-1.5 rounded-lg border transition-all shrink-0 shadow-2xs cursor-pointer ${
                                      existingReceiptForRow
                                        ? 'text-rose-500 hover:text-rose-700 hover:bg-rose-50 border-rose-200'
                                        : 'text-slate-300 border-slate-200 opacity-30 cursor-not-allowed hover:bg-transparent'
                                    } ${isRowDeleting ? 'opacity-50 cursor-wait' : ''}`}
                                    title={
                                      existingReceiptForRow
                                        ? `Delete payment record of ₹${Number(existingReceiptForRow.totalAmount || 0).toLocaleString('en-IN')} for ${formatMonthYear(selectedMonth)}`
                                        : `No payment record for ${formatMonthYear(selectedMonth)} to delete`
                                    }
                                  >
                                    {isRowDeleting ? (
                                      <span className="animate-spin inline-block w-3.5 h-3.5 border-2 border-rose-500 border-t-transparent rounded-full" />
                                    ) : (
                                      <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                                    )}
                                  </button>
                                </div>
                              );
                            }
                            return null;
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                  {/* Financial Summary & Cash Flow Footer: Total Earning, Expenses, Difference, Previous Month Balance, Cumulative */}
                  <tfoot>
                    {/* 1. Total Earning Row */}
                    <tr className="bg-emerald-50/90 text-emerald-950 font-black text-xs border-t-2 border-emerald-400 select-none shadow-2xs">
                      {visibleSheetColumns.map((colId, colIndex) => {
                        const frozenStyle = getFrozenColumnStyle(colIndex, frozenSheetCount, visibleSheetColumns, columnWidths, false);
                        const width = columnWidths[colId] || DEFAULT_SHEET_COLUMN_WIDTHS[colId] || 120;
                        let content = null;
                        if (colId === 'index') content = <span className="font-mono text-emerald-700">Σ</span>;
                        else if (colId === 'tenant') content = <span>Total Earning ({formatMonthYear(selectedMonth)})</span>;
                        else if (colId === 'monthlyRent') content = <span title="Total Expected Rent">{formatCurrency(totalExpectedSum)}</span>;
                        else if (colId === 'outstanding') content = <span className="text-rose-700" title="Total Outstanding">{formatCurrency(totalOutstandingSum)}</span>;
                        else if (colId === 'rentAmount') {
                            content = (
                              <div className="text-right">
                                <span className="text-emerald-800 text-xs font-black block font-mono">
                                  {formatCurrency(totalRentSum)}
                                </span>
                                <span className="text-[10px] text-emerald-600 font-bold block">
                                  Rent Paid
                                </span>
                              </div>
                            );
                          }
                        else if (colId === 'depositAmount') {
                            content = (
                              <div className="text-right">
                                <span className="text-amber-800 text-xs font-black block font-mono">
                                  {formatCurrency(totalDepositSum)}
                                </span>
                                <span className="text-[10px] text-amber-600 font-bold block">
                                  Deposit
                                </span>
                              </div>
                            );
                          }
                        else if (colId === 'amount') {
                            content = (
                              <div className="text-right">
                                <span className="text-teal-950 text-xs font-black block font-mono">
                                  {formatCurrency(totalPaidSum)}
                                </span>
                                <span className="text-[10px] text-teal-700 font-bold block">
                                  Total Paid
                                </span>
                              </div>
                            );
                          }
                        else if (colId === 'actions') content = <span className="text-[10px] uppercase font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">Collected Rent</span>;

                        return (
                          <td
                            key={colId}
                            style={{ ...frozenStyle, width: `${width}px`, minWidth: `${width}px`, maxWidth: `${width}px` }}
                            className={`py-2.5 px-3 border-r border-emerald-200/60 ${
                              ['amount', 'rentAmount', 'depositAmount', 'monthlyRent', 'outstanding'].includes(colId) ? 'text-right font-mono' : colId === 'index' || colId === 'actions' ? 'text-center' : 'text-left'
                            }`}
                          >
                            {content}
                          </td>
                        );
                      })}
                    </tr>

                  </tfoot>
                </table>
              </div>
            )}

            {/* Sheet Pagination Footer */}
            {totalSheetItems > 0 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 bg-slate-50/80 border-t border-slate-200 text-xs text-slate-500 font-semibold select-none">
                <div className="flex items-center gap-2">
                  <span>
                    Showing {isAllSheetRows ? 'all' : Math.min((sheetCurrentPage - 1) * effectiveSheetPageSize + 1, totalSheetItems)} to{' '}
                    {isAllSheetRows ? totalSheetItems : Math.min(sheetCurrentPage * effectiveSheetPageSize, totalSheetItems)} of {totalSheetItems} units
                  </span>
                  {(sheetFilters.length > 0 || search || selectedPropertyFilter) && (
                    <span className="text-teal-700 font-bold bg-teal-50 px-2 py-0.5 rounded-full border border-teal-200">
                      (Filtered from {outstandingData.length} total)
                    </span>
                  )}
                </div>

                {!isAllSheetRows && totalSheetPages > 1 && (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={sheetCurrentPage <= 1}
                      onClick={() => setSheetCurrentPage(prev => Math.max(prev - 1, 1))}
                      className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      title="Previous page"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    <span className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-800 font-bold">
                      Page {sheetCurrentPage} of {totalSheetPages}
                    </span>
                    <button
                      type="button"
                      disabled={sheetCurrentPage >= totalSheetPages}
                      onClick={() => setSheetCurrentPage(prev => Math.min(prev + 1, totalSheetPages))}
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

          {/* ======================================================== */}
          {/* LOWER SECTION: DEDICATED MONTHLY EXPENSES TABLE          */}
          {/* ======================================================== */}
          <div className="space-y-2">
            {/* APEX Toolbar for Monthly Expense Section */}
            <ApexToolbar
              search={expenseSectionSearch}
              onSearchChange={(val) => { setExpenseSectionSearch(val); setExpenseSectionCurrentPage(1); }}
              rowsPerPage={expenseSectionRowsPerPage}
              onRowsPerPageChange={(val) => { setExpenseSectionRowsPerPage(val); setExpenseSectionCurrentPage(1); }}
              availableRowsOptions={[5, 10, 25, 50, 100, 'All']}
              columns={EXPENSE_SECTION_COLUMNS_DEF}
              visibleColumns={visibleExpenseCols}
              onChangeVisibleColumns={(cols) => {
                setVisibleExpenseCols(cols);
                try { localStorage.setItem('cols_payments_expense_section_v1', JSON.stringify(cols)); } catch(e){}
              }}
              onResetWidths={resetExpenseSectionWidths}
              isHeaderSticky={isExpenseHeaderSticky}
              onToggleHeaderSticky={setIsExpenseHeaderSticky}
              frozenColumnCount={frozenExpenseCount}
              onFrozenColumnCountChange={setFrozenExpenseCount}
              filters={expenseSectionFilters}
              onFiltersChange={(flts) => { setExpenseSectionFilters(flts); setExpenseSectionCurrentPage(1); }}
              filterSuggestions={expenseFilterSuggestions}
              onExport={exportExpensesSectionToExcel}
              storageKey="payments_expense_section_v1"
              activeViewName={expenseSectionActiveViewId}
              onViewChange={setExpenseSectionActiveViewId}
              propertyFilter={
                <select
                  value={expenseSectionPropFilter}
                  onChange={(e) => { setExpenseSectionPropFilter(e.target.value); setExpenseSectionCurrentPage(1); }}
                  className="text-xs font-semibold px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400 cursor-pointer shrink-0"
                >
                  <option value="">All Properties & Common</option>
                  {orderedExpenseGridProperties.map(p => (
                    <option key={p._id} value={p._id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              }
              primaryAction={
                <button
                  type="button"
                  onClick={() => openAddExpenseModal('Property')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-2xs transition-all cursor-pointer shrink-0"
                  title="Open Add Expense Dialog"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ Add Expense</span>
                </button>
              }
            />

            {/* The Fast Entry Table with Draggable, Resizable & Filterable Columns */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col relative z-10">
              <div className={`overflow-x-auto ${isExpenseHeaderSticky ? 'max-h-[600px] overflow-y-auto' : ''}`}>
                <table
                  className="w-full text-left text-sm border-collapse table-fixed"
                  style={{ minWidth: `${Math.max(totalExpenseTableWidth, 1000)}px` }}
                >
                  <colgroup>
                    {visibleExpenseCols.map(colId => (
                      <col
                        key={colId}
                        style={{ width: `${expenseSectionWidths[colId] || DEFAULT_EXPENSE_SECTION_WIDTHS[colId] || 120}px` }}
                      />
                    ))}
                  </colgroup>
                  <thead className={isExpenseHeaderSticky ? 'sticky top-0 z-20 shadow-sm bg-slate-100/95' : 'bg-slate-100/95'}>
                    <tr className="border-b border-slate-200 text-[11px] text-slate-700 uppercase font-extrabold tracking-wider select-none">
                      {visibleExpenseCols.map((colId, colIdx) => {
                        const colDef = EXPENSE_SECTION_COLUMNS_DEF.find(c => c.id === colId) || { label: colId };
                        const width = expenseSectionWidths[colId] || DEFAULT_EXPENSE_SECTION_WIDTHS[colId] || 120;
                        const isSortable = colId !== 'actions';
                        const isFilterable = colId !== 'actions';
                        const align = colId === 'amount' ? 'right' : (colId === 'index' || colId === 'actions') ? 'center' : 'left';
                        const dragProps = getHeaderDragProps(colId, visibleExpenseCols, setVisibleExpenseCols, 'payments_expense_section_v1');
                        const frozenStyle = getFrozenColumnStyle(colIdx, frozenExpenseCount, visibleExpenseCols, expenseSectionWidths, true);

                        return (
                          <ColumnHeaderCell
                            key={colId}
                            colId={colId}
                            label={colDef.label}
                            align={align}
                            width={width}
                            minWidth={45}
                            isSortable={isSortable}
                            sortConfig={expenseSectionSort}
                            onSort={handleExpenseSectionSort}
                            isFilterable={isFilterable}
                            activeFilter={expenseSectionColFilters[colId]}
                            onApplyFilter={handleApplyExpenseColFilter}
                            onClearFilter={handleClearExpenseColFilter}
                            uniqueValues={expenseColUniqueValues[colId] || []}
                            isDraggable={true}
                            dragProps={dragProps}
                            isFrozen={colIdx < frozenExpenseCount}
                            frozenStyle={frozenStyle}
                            isHeaderSticky={isExpenseHeaderSticky}
                            onResizeStart={handleExpenseSectionResizeStart}
                            theme="light"
                            className="border-r border-slate-300 font-extrabold text-[11px] text-slate-700 tracking-wider"
                          />
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {filteredExpenseProperties.length === 0 ? (
                      <tr>
                        <td colSpan={visibleExpenseCols.length} className="py-12 text-center text-slate-400 text-xs">
                          No matching properties or expenses found for {formatMonthYear(selectedMonth)}.
                        </td>
                      </tr>
                    ) : (
                      paginatedExpenseProperties.map((prop, propIdx) => {
                        const propKey = String(prop._id || '__COMMON__');
                        const isCommon = isGeneralCommonProperty(propKey);
                        const propUnits = units.filter(u => String(u.propertyId?._id || u.propertyId) === String(prop._id));

                        let recordedExpenses = monthExpenses.filter(e => {
                          if (isCommon) return isExpenseOther(e);
                          return String(e.propertyId?._id || e.propertyId) === String(prop._id);
                        });

                        // Column filters on recorded expenses
                        if (expenseSectionColFilters.category) {
                          const rule = expenseSectionColFilters.category;
                          if (Array.isArray(rule) && rule.length > 0) {
                            recordedExpenses = recordedExpenses.filter(e => rule.includes(e.category));
                          } else if (typeof rule === 'object' && rule.value) {
                            recordedExpenses = recordedExpenses.filter(e => (e.category || '').toLowerCase().includes(rule.value.toLowerCase()));
                          }
                        }
                        if (expenseSectionColFilters.description) {
                          const rule = expenseSectionColFilters.description;
                          if (typeof rule === 'object' && rule.value) {
                            recordedExpenses = recordedExpenses.filter(e => (e.description || '').toLowerCase().includes(rule.value.toLowerCase()));
                          }
                        }
                        if (expenseSectionColFilters.date) {
                          const rule = expenseSectionColFilters.date;
                          if (typeof rule === 'object' && rule.value) {
                            const q = rule.value.toLowerCase();
                            recordedExpenses = recordedExpenses.filter(e => String(e.expenseDate || '').toLowerCase().includes(q));
                          }
                        }
                        if (expenseSectionColFilters.unit) {
                          const rule = expenseSectionColFilters.unit;
                          if (Array.isArray(rule) && rule.length > 0) {
                            recordedExpenses = recordedExpenses.filter(e => {
                              const uName = e.unitId?.subUnitPartition || e.unitId?.unitName || (isCommon ? 'Common' : 'Entire Property');
                              return rule.includes(uName);
                            });
                          }
                        }

                        // Sorting recorded expenses within property
                        if (expenseSectionSort?.key) {
                          const { key, direction } = expenseSectionSort;
                          const mult = direction === 'desc' ? -1 : 1;
                          recordedExpenses.sort((a, b) => {
                            if (key === 'amount') return mult * ((a.amount || 0) - (b.amount || 0));
                            if (key === 'date') return mult * String(a.expenseDate || '').localeCompare(String(b.expenseDate || ''));
                            if (key === 'category') return mult * String(a.category || '').localeCompare(String(b.category || ''));
                            if (key === 'description') return mult * String(a.description || '').localeCompare(String(b.description || ''));
                            return 0;
                          });
                        }

                        const propTotal = recordedExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);
                        const draft = getExpenseRowDraft(propKey);
                        const isSaving = savingExpenseRows[propKey];
                        const isSaved = savedExpenseFeedback[propKey];

                        return (
                          <React.Fragment key={propKey}>
                            {/* 1. Recorded Expense Rows for this property */}
                            {recordedExpenses.map((re, lineIdx) => {
                              const isEditingThisLine = editingExpenseLineId === re._id;
                              const isAlt = lineIdx % 2 === 1;

                              if (isEditingThisLine) {
                                return (
                                  <tr key={re._id} className="bg-amber-50/80 ring-2 ring-amber-300 border-b border-amber-200 text-xs">
                                    {visibleExpenseCols.map((colId, colIdx) => {
                                      const frozenStyle = getFrozenColumnStyle(colIdx, frozenExpenseCount, visibleExpenseCols, expenseSectionWidths, false);
                                      const cellWrapClass = autoWrap ? 'whitespace-normal break-words leading-tight' : 'whitespace-nowrap truncate';

                                      if (colId === 'index') {
                                        return (
                                          <td key={colId} style={frozenStyle} className={`py-2 px-2.5 text-center font-mono font-bold text-slate-600 border-r border-amber-200 ${cellWrapClass}`}>
                                            {isCommon ? '★' : (prop.displayOrder || propIdx + 1)}.{lineIdx + 1}
                                          </td>
                                        );
                                      }
                                      if (colId === 'headType') {
                                        return (
                                          <td key={colId} style={frozenStyle} className={`py-2 px-2.5 border-r border-amber-200 ${cellWrapClass}`}>
                                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border ${isCommon ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                                              {isCommon ? <Tag className="w-2.5 h-2.5" /> : <Building2 className="w-2.5 h-2.5" />}
                                              {isCommon ? 'Common' : 'Property'}
                                            </span>
                                          </td>
                                        );
                                      }
                                      if (colId === 'property') {
                                        return (
                                          <td key={colId} style={frozenStyle} className={`py-2 px-2.5 border-r border-amber-200 font-bold text-slate-900 ${cellWrapClass}`}>
                                            {isCommon ? 'General & Common' : prop.name}
                                          </td>
                                        );
                                      }
                                      if (colId === 'unit') {
                                        return (
                                          <td key={colId} style={frozenStyle} className="py-2 px-2 border-r border-amber-200">
                                            {isCommon ? (
                                              <span className="text-slate-400 text-xs italic">N/A</span>
                                            ) : propUnits.length === 0 ? (
                                              <span className="text-slate-500 text-xs">Entire Property</span>
                                            ) : (
                                              <select
                                                value={editingExpenseLineData.unitId || ''}
                                                onChange={(e) => setEditingExpenseLineData(prev => ({ ...prev, unitId: e.target.value }))}
                                                className="text-xs font-semibold px-2 py-1 rounded border border-amber-300 bg-white text-slate-800 w-full focus:outline-none focus:ring-1 focus:ring-amber-500"
                                              >
                                                <option value="">Entire Property</option>
                                                {propUnits.map(u => (
                                                  <option key={u._id} value={u._id}>{u.subUnitPartition || u.unitName}</option>
                                                ))}
                                              </select>
                                            )}
                                          </td>
                                        );
                                      }
                                      if (colId === 'category') {
                                        return (
                                          <td key={colId} style={frozenStyle} className="py-2 px-2 border-r border-amber-200">
                                            <select
                                              value={editingExpenseLineData.category || ''}
                                              onChange={(e) => setEditingExpenseLineData(prev => ({ ...prev, category: e.target.value }))}
                                              className="text-xs font-semibold px-2 py-1 rounded border border-amber-300 bg-white text-slate-800 w-full focus:outline-none focus:ring-1 focus:ring-amber-500"
                                            >
                                              {(isCommon ? commonCategories : propertyCategories).map(cat => (
                                                <option key={cat} value={cat}>{cat}</option>
                                              ))}
                                            </select>
                                          </td>
                                        );
                                      }
                                      if (colId === 'description') {
                                        return (
                                          <td key={colId} style={frozenStyle} className="py-2 px-2 border-r border-amber-200">
                                            <input
                                              type="text"
                                              value={editingExpenseLineData.description || ''}
                                              onChange={(e) => setEditingExpenseLineData(prev => ({ ...prev, description: e.target.value }))}
                                              onKeyDown={(e) => { if (e.key === 'Enter') handleSaveEditedExpenseLine(re._id); }}
                                              className="text-xs px-2 py-1 rounded border border-amber-300 bg-white text-slate-800 w-full focus:outline-none focus:ring-1 focus:ring-amber-500"
                                              placeholder="Description"
                                            />
                                          </td>
                                        );
                                      }
                                      if (colId === 'date') {
                                        return (
                                          <td key={colId} style={frozenStyle} className="py-2 px-2 border-r border-amber-200">
                                            <input
                                              type="date"
                                              value={editingExpenseLineData.expenseDate || ''}
                                              onChange={(e) => setEditingExpenseLineData(prev => ({ ...prev, expenseDate: e.target.value }))}
                                              onKeyDown={(e) => { if (e.key === 'Enter') handleSaveEditedExpenseLine(re._id); }}
                                              className="text-xs px-2 py-1 rounded border border-amber-300 bg-white text-slate-800 w-full focus:outline-none focus:ring-1 focus:ring-amber-500"
                                            />
                                          </td>
                                        );
                                      }
                                      if (colId === 'amount') {
                                        return (
                                          <td key={colId} style={frozenStyle} className="py-2 px-2 border-r border-amber-200">
                                            <div className="relative flex items-center">
                                              <span className="absolute left-1.5 text-amber-600 text-xs font-semibold">₹</span>
                                              <input
                                                type="number"
                                                value={editingExpenseLineData.amount || ''}
                                                onChange={(e) => setEditingExpenseLineData(prev => ({ ...prev, amount: e.target.value }))}
                                                onKeyDown={(e) => { if (e.key === 'Enter') handleSaveEditedExpenseLine(re._id); }}
                                                className="w-full pl-4 pr-1.5 py-1 text-xs font-bold text-slate-900 bg-white border border-amber-300 rounded focus:outline-none focus:ring-1 focus:ring-amber-500 font-mono [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                                autoFocus
                                              />
                                            </div>
                                          </td>
                                        );
                                      }
                                      if (colId === 'actions') {
                                        return (
                                          <td key={colId} style={frozenStyle} className="py-2 px-2 text-center">
                                            <div className="flex items-center justify-center gap-1">
                                              <button
                                                type="button"
                                                onClick={() => handleSaveEditedExpenseLine(re._id)}
                                                className="p-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer shadow-2xs"
                                                title="Save Changes"
                                              >
                                                <Check className="w-3.5 h-3.5" />
                                              </button>
                                              <button
                                                type="button"
                                                onClick={cancelEditingExpenseLine}
                                                className="p-1 rounded bg-slate-200 hover:bg-slate-300 text-slate-700 cursor-pointer shadow-2xs"
                                                title="Cancel"
                                              >
                                                <X className="w-3.5 h-3.5" />
                                              </button>
                                            </div>
                                          </td>
                                        );
                                      }
                                      return null;
                                    })}
                                  </tr>
                                );
                              }

                              return (
                                <tr
                                  key={re._id}
                                  className={`border-b border-slate-200 hover:bg-amber-50/40 transition-colors ${
                                    isAlt ? 'bg-slate-50/60' : 'bg-white'
                                  }`}
                                >
                                  {visibleExpenseCols.map((colId, colIdx) => {
                                    const frozenStyle = getFrozenColumnStyle(colIdx, frozenExpenseCount, visibleExpenseCols, expenseSectionWidths, false);
                                    const cellWrapClass = autoWrap ? 'whitespace-normal break-words leading-tight' : 'whitespace-nowrap truncate';

                                    if (colId === 'index') {
                                      return (
                                        <td key={colId} style={frozenStyle} className={`py-2 px-2.5 text-center font-mono font-bold text-slate-600 border-r border-slate-200 text-xs ${cellWrapClass} ${frozenStyle.backgroundColor ? '' : (isAlt ? 'bg-slate-50/60' : 'bg-white')}`}>
                                          {isCommon ? '★' : (prop.displayOrder || propIdx + 1)}.{lineIdx + 1}
                                        </td>
                                      );
                                    }
                                    if (colId === 'headType') {
                                      return (
                                        <td key={colId} style={frozenStyle} className={`py-2 px-2.5 border-r border-slate-200 ${cellWrapClass} ${frozenStyle.backgroundColor ? '' : (isAlt ? 'bg-slate-50/60' : 'bg-white')}`}>
                                          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-[11px] font-bold border ${
                                            isCommon ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                          }`}>
                                            {isCommon ? <Tag className="w-3 h-3" /> : <Building2 className="w-3 h-3" />}
                                            {isCommon ? 'Common' : 'Property'}
                                          </span>
                                        </td>
                                      );
                                    }
                                    if (colId === 'property') {
                                      return (
                                        <td key={colId} style={frozenStyle} className={`py-2 px-2.5 border-r border-slate-200 ${frozenStyle.backgroundColor ? '' : (isAlt ? 'bg-slate-50/60' : 'bg-white')}`}>
                                          <div className={`font-bold text-slate-900 text-xs ${cellWrapClass}`} title={isCommon ? 'General & Common Expenses' : prop.name}>
                                            {isCommon ? 'General & Common' : prop.name}
                                          </div>
                                          <div className="text-[10px] text-slate-400 font-mono">
                                            {isCommon ? 'PROP-COMMON' : (prop.propertyCode || '—')}
                                          </div>
                                        </td>
                                      );
                                    }
                                    if (colId === 'unit') {
                                      return (
                                        <td key={colId} style={frozenStyle} className={`py-2 px-2.5 border-r border-slate-200 ${cellWrapClass} ${frozenStyle.backgroundColor ? '' : (isAlt ? 'bg-slate-50/60' : 'bg-white')}`}>
                                          <span className="text-xs font-semibold text-slate-700">
                                            {re.unitId?.subUnitPartition || re.unitId?.unitName || (isCommon ? 'Common' : 'Entire Property')}
                                          </span>
                                        </td>
                                      );
                                    }
                                    if (colId === 'category') {
                                      return (
                                        <td key={colId} style={frozenStyle} className={`py-2 px-2.5 border-r border-slate-200 ${cellWrapClass} ${frozenStyle.backgroundColor ? '' : (isAlt ? 'bg-slate-50/60' : 'bg-white')}`}>
                                          <span className={`inline-block px-2 py-0.5 rounded-md text-[11px] font-bold border ${
                                            EXPENSE_CATEGORY_COLORS[re.category] || 'bg-slate-100 text-slate-700 border-slate-200'
                                          }`}>
                                            {re.category}
                                          </span>
                                        </td>
                                      );
                                    }
                                    if (colId === 'description') {
                                      return (
                                        <td key={colId} style={frozenStyle} className={`py-2 px-2.5 border-r border-slate-200 ${cellWrapClass} ${frozenStyle.backgroundColor ? '' : (isAlt ? 'bg-slate-50/60' : 'bg-white')}`} title={re.description || '—'}>
                                          <span className="text-xs text-slate-700 block">
                                            {re.description || '—'}
                                          </span>
                                        </td>
                                      );
                                    }
                                    if (colId === 'date') {
                                      return (
                                        <td key={colId} style={frozenStyle} className={`py-2 px-2.5 border-r border-slate-200 ${cellWrapClass} text-xs text-slate-600 font-mono ${frozenStyle.backgroundColor ? '' : (isAlt ? 'bg-slate-50/60' : 'bg-white')}`}>
                                          {re.expenseDate ? String(re.expenseDate).substring(0, 10) : `${selectedMonth}-01`}
                                        </td>
                                      );
                                    }
                                    if (colId === 'amount') {
                                      return (
                                        <td key={colId} style={frozenStyle} className={`py-2 px-2.5 border-r border-slate-200 text-right ${cellWrapClass} ${frozenStyle.backgroundColor ? '' : (isAlt ? 'bg-slate-50/60' : 'bg-white')}`}>
                                          <span className="font-mono font-extrabold text-xs text-slate-900">
                                            ₹{(re.amount || 0).toLocaleString('en-IN')}
                                          </span>
                                        </td>
                                      );
                                    }
                                    if (colId === 'actions') {
                                      return (
                                        <td key={colId} style={frozenStyle} className={`py-2 px-2.5 text-center ${frozenStyle.backgroundColor ? '' : (isAlt ? 'bg-slate-50/60' : 'bg-white')}`}>
                                          <div className="flex items-center justify-center gap-1.5">
                                            <button
                                              type="button"
                                              onClick={() => startEditingExpenseLine(re)}
                                              className="p-1 rounded hover:bg-amber-100 text-slate-500 hover:text-amber-700 transition-colors cursor-pointer"
                                              title="Edit this expense line"
                                            >
                                              <Edit2 className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => handleDeleteExpense(re._id, re.category, re.amount)}
                                              className="p-1 rounded hover:bg-rose-100 text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                                              title="Delete / Reverse expense line"
                                            >
                                              <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                                            </button>
                                          </div>
                                        </td>
                                      );
                                    }
                                    return null;
                                  })}
                                </tr>
                              );
                            })}

                            {/* 2. Fast Inline Entry Row (+ Add Line) for this property */}
                            <tr className="border-b-2 border-slate-300 bg-emerald-50/20 hover:bg-emerald-50/40 transition-colors">
                              {visibleExpenseCols.map((colId, colIdx) => {
                                const frozenStyle = getFrozenColumnStyle(colIdx, frozenExpenseCount, visibleExpenseCols, expenseSectionWidths, false);
                                const cellWrapClass = autoWrap ? 'whitespace-normal break-words leading-tight' : 'whitespace-nowrap truncate';

                                if (colId === 'index') {
                                  return (
                                    <td key={colId} style={frozenStyle} className={`py-2 px-2.5 text-center font-mono font-bold text-emerald-700 border-r border-slate-200 text-xs ${cellWrapClass} ${frozenStyle.backgroundColor ? '' : 'bg-emerald-50/20'}`}>
                                      {isCommon ? '★' : (prop.displayOrder || propIdx + 1)}
                                      {recordedExpenses.length > 0 ? '.+' : ''}
                                    </td>
                                  );
                                }
                                if (colId === 'headType') {
                                  return (
                                    <td key={colId} style={frozenStyle} className={`py-2 px-2.5 border-r border-slate-200 ${cellWrapClass} ${frozenStyle.backgroundColor ? '' : 'bg-emerald-50/20'}`}>
                                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                                        isCommon ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                      }`}>
                                        {isCommon ? <Tag className="w-2.5 h-2.5" /> : <Building2 className="w-2.5 h-2.5" />}
                                        {isCommon ? 'Common' : 'Property'}
                                      </span>
                                    </td>
                                  );
                                }
                                if (colId === 'property') {
                                  return (
                                    <td key={colId} style={frozenStyle} className={`py-2 px-2.5 border-r border-slate-200 ${frozenStyle.backgroundColor ? '' : 'bg-emerald-50/20'}`}>
                                      <div className="flex items-center justify-between gap-1.5">
                                        <span className={`font-bold text-slate-900 text-xs ${cellWrapClass}`} title={isCommon ? 'General & Common Expenses' : prop.name}>
                                          {isCommon ? 'General & Common' : prop.name}
                                        </span>
                                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 shrink-0">
                                          + Add
                                        </span>
                                      </div>
                                      <div className="text-[10px] text-slate-400 font-mono truncate">
                                        {isCommon ? 'Common / Other' : (prop.propertyCode || '—')}
                                      </div>
                                    </td>
                                  );
                                }
                                if (colId === 'unit') {
                                  return (
                                    <td key={colId} style={frozenStyle} className={`py-2 px-2 border-r border-slate-200 ${frozenStyle.backgroundColor ? '' : 'bg-emerald-50/20'}`}>
                                      {isCommon ? (
                                        <span className="text-slate-400 text-xs italic">N/A (Common)</span>
                                      ) : propUnits.length === 0 ? (
                                        <span className="text-slate-500 text-xs font-medium">Entire Property</span>
                                      ) : (
                                        <select
                                          value={draft.unitId}
                                          onChange={(e) => updateExpenseRowDraft(propKey, { unitId: e.target.value })}
                                          className="text-xs font-semibold px-2 py-1 rounded border border-slate-300 bg-white text-slate-800 w-full focus:outline-none focus:ring-1 focus:ring-emerald-500 shadow-2xs"
                                        >
                                          <option value="">Entire Property</option>
                                          {propUnits.map(u => (
                                            <option key={u._id} value={u._id}>{u.subUnitPartition || u.unitName}</option>
                                          ))}
                                        </select>
                                      )}
                                    </td>
                                  );
                                }
                                if (colId === 'category') {
                                  return (
                                    <td key={colId} style={frozenStyle} className={`py-2 px-2 border-r border-slate-200 ${frozenStyle.backgroundColor ? '' : 'bg-emerald-50/20'}`}>
                                      <select
                                        value={draft.category}
                                        onChange={(e) => updateExpenseRowDraft(propKey, { category: e.target.value })}
                                        className="text-xs font-semibold px-2 py-1 rounded border border-slate-300 bg-white text-slate-800 w-full focus:outline-none focus:ring-1 focus:ring-emerald-500 shadow-2xs"
                                      >
                                        {(isCommon ? commonCategories : propertyCategories).map(cat => (
                                          <option key={cat} value={cat}>{cat}</option>
                                        ))}
                                      </select>
                                    </td>
                                  );
                                }
                                if (colId === 'description') {
                                  return (
                                    <td key={colId} style={frozenStyle} className={`py-2 px-2 border-r border-slate-200 ${frozenStyle.backgroundColor ? '' : 'bg-emerald-50/20'}`}>
                                      <input
                                        type="text"
                                        placeholder="Description / note"
                                        value={draft.description}
                                        onChange={(e) => updateExpenseRowDraft(propKey, { description: e.target.value })}
                                        onKeyDown={(e) => { if (e.key === 'Enter') handleSaveExpenseRow(prop); }}
                                        className="text-xs px-2.5 py-1 rounded border border-slate-300 bg-white text-slate-800 w-full placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500 shadow-2xs"
                                      />
                                    </td>
                                  );
                                }
                                if (colId === 'date') {
                                  return (
                                    <td key={colId} style={frozenStyle} className={`py-2 px-2 border-r border-slate-200 ${frozenStyle.backgroundColor ? '' : 'bg-emerald-50/20'}`}>
                                      <input
                                        type="date"
                                        value={draft.expenseDate}
                                        onChange={(e) => updateExpenseRowDraft(propKey, { expenseDate: e.target.value })}
                                        onKeyDown={(e) => { if (e.key === 'Enter') handleSaveExpenseRow(prop); }}
                                        className="text-xs px-2 py-1 rounded border border-slate-300 bg-white text-slate-800 w-full focus:outline-none focus:ring-1 focus:ring-emerald-500 shadow-2xs"
                                      />
                                    </td>
                                  );
                                }
                                if (colId === 'amount') {
                                  return (
                                    <td key={colId} style={frozenStyle} className={`py-2 px-2 border-r border-slate-200 ${frozenStyle.backgroundColor ? '' : 'bg-emerald-50/20'}`}>
                                      <div className="relative flex items-center">
                                        <span className="absolute left-2 text-slate-400 text-xs font-semibold">₹</span>
                                        <input
                                          type="number"
                                          placeholder="Amount"
                                          value={draft.amount}
                                          onChange={(e) => updateExpenseRowDraft(propKey, { amount: e.target.value })}
                                          onKeyDown={(e) => { if (e.key === 'Enter') handleSaveExpenseRow(prop); }}
                                          id={`expense-row-amount-${propKey}`}
                                          className="w-full pl-5 pr-2 py-1 text-xs font-bold text-slate-900 bg-white border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono shadow-2xs [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                        />
                                      </div>
                                    </td>
                                  );
                                }
                                if (colId === 'actions') {
                                  return (
                                    <td key={colId} style={frozenStyle} className={`py-2 px-2 text-center ${frozenStyle.backgroundColor ? '' : 'bg-emerald-50/20'}`}>
                                      <button
                                        type="button"
                                        disabled={isSaving}
                                        onClick={() => handleSaveExpenseRow(prop)}
                                        className="w-full flex items-center justify-center gap-1 px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs transition-all cursor-pointer disabled:opacity-50"
                                        title="Save this expense line"
                                      >
                                        {isSaving ? '...' : (isSaved ? <Check className="w-3.5 h-3.5 text-white" /> : '+ Add')}
                                      </button>
                                    </td>
                                  );
                                }
                                return null;
                              })}
                            </tr>

                            {/* Subtotal row if property has recorded expenses */}
                            {recordedExpenses.length > 0 && (
                              <tr className="bg-slate-50/80 text-slate-700 font-bold text-xs border-b-2 border-slate-300">
                                {visibleExpenseCols.map((colId, colIdx) => {
                                  const frozenStyle = getFrozenColumnStyle(colIdx, frozenExpenseCount, visibleExpenseCols, expenseSectionWidths, false);
                                  if (colId === 'amount') {
                                    return (
                                      <td key={colId} style={frozenStyle} className="py-1.5 px-3 text-right font-mono font-black text-rose-700 border-r border-slate-200">
                                        ₹{propTotal.toLocaleString('en-IN')}
                                      </td>
                                    );
                                  }
                                  if (colId === 'actions') {
                                    return (
                                      <td key={colId} style={frozenStyle} className="py-1.5 px-2 text-center text-[10px] text-slate-400 font-semibold">
                                        Subtotal
                                      </td>
                                    );
                                  }
                                  const amountIdx = visibleExpenseCols.indexOf('amount');
                                  const labelColIdx = amountIdx > 0 ? amountIdx - 1 : 0;
                                  if (colIdx === labelColIdx) {
                                    return (
                                      <td key={colId} style={frozenStyle} className="py-1.5 px-3 text-right border-r border-slate-200">
                                        <span className="text-slate-500 text-[11px] font-semibold">
                                          Total {isCommon ? 'Common Expenses' : prop.name} ({recordedExpenses.length} record{recordedExpenses.length === 1 ? '' : 's'}):
                                        </span>
                                      </td>
                                    );
                                  }
                                  return (
                                    <td key={colId} style={frozenStyle} className="py-1.5 px-2 border-r border-slate-200" />
                                  );
                                })}
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })
                    )}
                  </tbody>
                  <tfoot className="bg-slate-100 border-t-2 border-slate-300 text-xs font-bold select-none">
                    <tr>
                      {visibleExpenseCols.map((colId, colIdx) => {
                        const frozenStyle = getFrozenColumnStyle(colIdx, frozenExpenseCount, visibleExpenseCols, expenseSectionWidths, false);
                        if (colId === 'amount') {
                          return (
                            <td key={colId} style={frozenStyle} className="py-2.5 px-3 text-right font-mono font-black text-rose-700 text-sm border-r border-slate-200">
                              ₹{activeTotalExpenses.toLocaleString('en-IN')}
                            </td>
                          );
                        }
                        if (colId === 'actions') {
                          return (
                            <td key={colId} style={frozenStyle} className="py-2.5 px-2 text-center text-[10px] text-rose-700 uppercase font-black">
                              Total Paid
                            </td>
                          );
                        }
                        const amountIdx = visibleExpenseCols.indexOf('amount');
                        const labelColIdx = amountIdx > 0 ? amountIdx - 1 : 0;
                        if (colIdx === labelColIdx) {
                          return (
                            <td key={colId} style={frozenStyle} className="py-2.5 px-4 text-right border-r border-slate-200 uppercase tracking-wider text-slate-700 font-black">
                              Total Month Expenses ({formatMonthYear(selectedMonth)})
                            </td>
                          );
                        }
                        return (
                          <td key={colId} style={frozenStyle} className="py-2.5 px-2 border-r border-slate-200" />
                        );
                      })}
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Pagination Controls */}
              {totalExpensePages > 1 && (
                <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600">
                  <span className="font-medium">
                    Showing {((expenseSectionCurrentPage - 1) * (isAllExpenseRows ? filteredExpenseProperties.length : Number(expenseSectionRowsPerPage))) + 1} to {Math.min(expenseSectionCurrentPage * (isAllExpenseRows ? filteredExpenseProperties.length : Number(expenseSectionRowsPerPage)), filteredExpenseProperties.length)} of {filteredExpenseProperties.length} properties
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={expenseSectionCurrentPage <= 1}
                      onClick={() => setExpenseSectionCurrentPage(prev => Math.max(prev - 1, 1))}
                      className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      title="Previous page"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    <span className="font-bold px-2">
                      {expenseSectionCurrentPage} / {totalExpensePages}
                    </span>
                    <button
                      type="button"
                      disabled={expenseSectionCurrentPage >= totalExpensePages}
                      onClick={() => setExpenseSectionCurrentPage(prev => Math.min(prev + 1, totalExpensePages))}
                      className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      title="Next page"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ======================================================== */}
          {/* NET CASH FLOW & FINANCIAL RECONCILIATION CARD            */}
          {/* ======================================================== */}
          <div className="bg-gradient-to-br from-slate-900 via-slate-850 to-slate-950 rounded-2xl p-5 text-white shadow-lg border border-slate-800">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                  <TrendingUp className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-black tracking-wide uppercase text-slate-100">
                    Monthly Net Cash Flow & Reconciliation
                  </h4>
                  <p className="text-[11px] text-slate-400">
                    Accounting Month: {formatMonthYear(selectedMonth)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">Status:</span>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-black ${
                  monthDifference >= 0 ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                }`}>
                  {monthDifference >= 0 ? 'Net Surplus' : 'Net Deficit'}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {/* 1. Total Rent Collected */}
              <div className="bg-slate-800/80 rounded-xl p-3 border border-slate-700/60">
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center justify-between">
                  <span>Rent Collected</span>
                  <span className="text-emerald-400 text-xs">▲</span>
                </div>
                <div className="text-lg font-black font-mono text-emerald-400">
                  {formatCurrency(totalPaidSum)}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  Total earnings for {formatMonthYear(selectedMonth)}
                </div>
              </div>

              {/* 2. Total Expenses */}
              <div className="bg-slate-800/80 rounded-xl p-3 border border-slate-700/60">
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center justify-between">
                  <span>Total Expenses</span>
                  <span className="text-rose-400 text-xs">▼</span>
                </div>
                <div className="text-lg font-black font-mono text-rose-400">
                  {formatCurrency(activeTotalExpenses)}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5 truncate" title={`Property: ${formatCurrency(totalPropertyExpenses)} · Common: ${formatCurrency(totalCommonExpenses)}`}>
                  Prop: {formatCurrency(totalPropertyExpenses)} · Comm: {formatCurrency(totalCommonExpenses)}
                </div>
              </div>

              {/* 3. Net Difference */}
              <div className={`rounded-xl p-3 border ${
                monthDifference >= 0 
                  ? 'bg-emerald-950/40 border-emerald-700/60' 
                  : 'bg-rose-950/40 border-rose-700/60'
              }`}>
                <div className="text-[11px] font-bold uppercase tracking-wider mb-1 flex items-center justify-between text-slate-300">
                  <span>Net Difference</span>
                  <span className={monthDifference >= 0 ? 'text-emerald-400' : 'text-rose-400'}>Δ</span>
                </div>
                <div className={`text-lg font-black font-mono ${
                  monthDifference >= 0 ? 'text-emerald-300' : 'text-rose-300'
                }`}>
                  {monthDifference >= 0 ? `+ ${formatCurrency(monthDifference)}` : `- ${formatCurrency(Math.abs(monthDifference))}`}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  Earnings minus expenses
                </div>
              </div>

              {/* 4. Previous Month Balance */}
              <div className="bg-slate-800/80 rounded-xl p-3 border border-slate-700/60">
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center justify-between">
                  <span>Prev Month Balance</span>
                  <span className="text-amber-400 text-xs">⏮</span>
                </div>
                <div className="text-lg font-black font-mono text-amber-300">
                  {formatCurrency(prevMonthBalance)}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  Opening balance carried fwd
                </div>
              </div>

              {/* 5. Cumulative Balance */}
              <div className="bg-teal-950/50 rounded-xl p-3 border border-teal-700/60 col-span-2 sm:col-span-1">
                <div className="text-[11px] font-bold uppercase tracking-wider mb-1 flex items-center justify-between text-teal-300">
                  <span>Cumulative Balance</span>
                  <span className="text-teal-400">⚑</span>
                </div>
                <div className={`text-lg font-black font-mono ${
                  monthCumulative >= 0 ? 'text-teal-300' : 'text-rose-300'
                }`}>
                  {monthCumulative >= 0 ? formatCurrency(monthCumulative) : `- ${formatCurrency(Math.abs(monthCumulative))}`}
                </div>
                <div className="text-[10px] text-teal-400/80 mt-0.5">
                  Prev balance + difference
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 2: RECEIPTS REGISTER */}
      {activeTab === 'receipts' && (
        <div className="space-y-4">
          {/* APEX Toolbar for Receipts */}
          <ApexToolbar
            search={receiptSearch}
            onSearchChange={(val) => { setReceiptSearch(val); setReceiptCurrentPage(1); }}
            rowsPerPage={receiptRowsPerPage}
            onRowsPerPageChange={(val) => { setReceiptRowsPerPage(val); setReceiptCurrentPage(1); }}
            availableRowsOptions={[5, 10, 25, 50, 100, 'All']}
            columns={RECEIPTS_COLUMNS_DEF}
            visibleColumns={visibleReceiptsColumns}
            onChangeVisibleColumns={(cols) => {
              setVisibleReceiptsColumns(cols);
              try { localStorage.setItem('cols_payments_receipts_v6', JSON.stringify(cols)); } catch(e){}
            }}
            onResetWidths={resetReceiptsWidths}
            isHeaderSticky={isReceiptsHeaderSticky}
            onToggleHeaderSticky={setIsReceiptsHeaderSticky}
            frozenColumnCount={frozenReceiptsCount}
            onFrozenColumnCountChange={setFrozenReceiptsCount}
            filters={receiptActiveFilters}
            onFiltersChange={(flts) => { setReceiptActiveFilters(flts); setReceiptCurrentPage(1); }}
            filterSuggestions={receiptFilterSuggestions}
            onExport={exportReceiptsToExcel}
            storageKey="payments_receipts"
            activeViewName={receiptActiveViewId}
            onViewChange={setReceiptActiveViewId}
            propertyFilter={
              <select
                value={receiptPropertyFilter}
                onChange={(e) => { setReceiptPropertyFilter(e.target.value); setReceiptCurrentPage(1); }}
                className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-2xs cursor-pointer shrink-0"
              >
                <option value="">All Properties</option>
                {properties.map(p => (
                  <option key={p._id} value={p._id}>{p.name}</option>
                ))}
              </select>
            }
            statusFilter={
              <div className="flex items-center gap-1.5 shrink-0">
                <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-xl shrink-0">
                  <button
                    type="button"
                    onClick={() => setActiveTab('sheet')}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      activeTab === 'sheet'
                        ? 'bg-white text-emerald-700 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>Monthly Collection Grid</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('receipts')}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      activeTab === 'receipts'
                        ? 'bg-white text-emerald-700 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Receipt className="w-3.5 h-3.5" />
                    <span>Receipts Register ({receipts.length})</span>
                  </button>
                </div>
                <select
                  value={receiptStatusFilter}
                onChange={(e) => { setReceiptStatusFilter(e.target.value); setReceiptCurrentPage(1); }}
                className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-2xs cursor-pointer shrink-0"
              >
                <option value="">All Statuses</option>
                <option value="Rented">Rented</option>
                <option value="Vacant">Vacant</option>
              </select>
              </div>
            }
            monthFilter={
              <div className="relative shrink-0">
                <button
                  type="button"
                  onClick={() => setShowReceiptMonthPicker(prev => !prev)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all shadow-2xs cursor-pointer ${
                    receiptSelectedMonths.length > 0
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                        : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                    }`}
                  >
                    <Calendar className="w-3.5 h-3.5 text-emerald-600" />
                    <span>
                      {receiptSelectedMonths.length === 0
                        ? 'All Rent Months'
                        : receiptSelectedMonths.length === 1
                        ? formatMonthYear(receiptSelectedMonths[0])
                        : `${receiptSelectedMonths.length} Months Selected`}
                    </span>
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                  </button>

                  {showReceiptMonthPicker && (
                    <div className="absolute left-0 mt-2 z-40 w-72 bg-white rounded-2xl shadow-xl border border-slate-200 p-3 space-y-2.5 animate-scaleUp">
                      <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                        <span className="text-xs font-extrabold text-slate-800">Select Month(s)</span>
                        <div className="flex items-center gap-2">
                          {receiptSelectedMonths.length > 0 && (
                            <button
                              type="button"
                              onClick={() => { setReceiptSelectedMonths([]); setReceiptCurrentPage(1); }}
                              className="text-[11px] font-bold text-rose-600 hover:underline cursor-pointer"
                            >
                              Clear
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setShowReceiptMonthPicker(false)}
                            className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 hover:bg-emerald-200 cursor-pointer"
                          >
                            Done
                          </button>
                        </div>
                      </div>

                      <div className="max-h-56 overflow-y-auto space-y-1 pr-1">
                        {availableReceiptMonths.length === 0 ? (
                          <div className="py-4 text-center text-xs text-slate-400">No receipt months recorded yet</div>
                        ) : (
                          availableReceiptMonths.map(m => {
                            const isChecked = receiptSelectedMonths.includes(m);
                            return (
                              <label
                                key={m}
                                className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold cursor-pointer transition-colors ${
                                  isChecked
                                    ? 'bg-emerald-50 text-emerald-900 border border-emerald-200'
                                    : 'hover:bg-slate-50 text-slate-700 border border-transparent'
                                }`}
                              >
                                <span>{formatMonthYear(m)}</span>
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => {
                                    if (isChecked) {
                                      setReceiptSelectedMonths(receiptSelectedMonths.filter(x => x !== m));
                                    } else {
                                      setReceiptSelectedMonths([...receiptSelectedMonths, m]);
                                    }
                                    setReceiptCurrentPage(1);
                                  }}
                                  className="rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                                />
                              </label>
                            );
                          })
                        )}
                      </div>

                      {receiptSelectedMonths.length > 0 && (
                        <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
                          <span className="text-slate-500 font-medium">{receiptSelectedMonths.length} months active</span>
                          <button
                            type="button"
                            onClick={() => { setReceiptSelectedMonths([]); setReceiptCurrentPage(1); }}
                            className="font-bold text-slate-500 hover:text-slate-800 cursor-pointer"
                          >
                            Show All
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              }
            />

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">











          {receipts.length === 0 ? (
            <div className="py-16 text-center text-slate-400 text-sm">No payment receipts found.</div>
          ) : (
            <>
              {/* Mobile Swipe Cue */}
              <div className="sm:hidden px-3 py-1.5 bg-emerald-50 border-b border-emerald-100 text-[11px] text-emerald-800 font-medium flex items-center justify-between">
                <span>Swipe horizontally to view all columns</span>
                <span>→</span>
              </div>
              <div className="overflow-x-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
              <table
                className="w-full text-left text-sm border-collapse table-fixed"
                style={hasCustomReceiptsWidths ? { minWidth: `${visibleReceiptsColumns.reduce((sum, colId) => sum + (receiptsWidths[colId] || DEFAULT_RECEIPTS_COLUMN_WIDTHS[colId] || 100), 0)}px` } : undefined}
              >
                <colgroup>
                  {visibleReceiptsColumns.map(colId => (
                    <col
                      key={colId}
                      style={{ width: `${receiptsWidths[colId] || DEFAULT_RECEIPTS_COLUMN_WIDTHS[colId] || 100}px` }}
                    />
                  ))}
                </colgroup>
                <thead className={`border-b border-slate-200 text-[11px] text-slate-500 uppercase tracking-wide font-extrabold select-none ${
                  isReceiptsHeaderSticky ? 'sticky top-0 z-20 shadow-sm' : ''
                }`}>
                  <tr>
                    {visibleReceiptsColumns.map((colId, colIndex) => {
                      const dragProps = getHeaderDragProps(colId, visibleReceiptsColumns, setVisibleReceiptsColumns, 'payments_receipts_v6');
                      const width = receiptsWidths[colId] || DEFAULT_RECEIPTS_COLUMN_WIDTHS[colId] || 100;
                      const frozenStyle = getFrozenColumnStyle(colIndex, frozenReceiptsCount, visibleReceiptsColumns, receiptsWidths, true);
                      let label = colId;
                      let align = 'text-left';
                      if (['totalAmount', 'rentAmount', 'depositAmount', 'actions'].includes(colId)) align = 'text-right';
                      if (colId === 'receiptDate') label = 'Date';
                      else if (colId === 'tenant') label = 'Tenant & Sub-Unit';
                      else if (colId === 'accountingMonth') { label = 'Accounting Month'; align = 'text-center'; }
                      else if (colId === 'monthsCovered' || colId === 'paidForMonth') label = 'Month Paid For';
                      else if (colId === 'rentAmount') label = 'Rent Amount Paid';
                      else if (colId === 'depositAmount') label = 'Deposit Amount';
                      else if (colId === 'totalAmount') label = 'Total Amount Paid';
                      else if (colId === 'status') label = 'Status';
                      else if (colId === 'comments') label = 'Notes';
                      else if (colId === 'tenantPhone') label = 'Tenant Phone';
                      else if (colId === 'propertyName') label = 'Property';
                      else if (colId === 'subUnitName') label = 'Sub-Unit';
                      else if (colId === 'createdAt') label = 'Created Date';
                      else if (colId === 'updatedAt') label = 'Modified Date';
                      else if (colId === 'actions') label = 'Actions';
                      else {
                        const colDef = RECEIPTS_COLUMNS_DEF.find(c => c.id === colId);
                        if (colDef?.label) label = colDef.label;
                      }

                      const isSortable = colId !== 'actions';
                      const isSorted = receiptSortConfig.key === colId;
                      const sortDirection = isSorted ? receiptSortConfig.direction : null;

                      return (
                        <th
                          key={colId}
                          {...dragProps}
                          onClick={() => isSortable && handleReceiptHeaderSort(colId)}
                          style={{ ...frozenStyle, minWidth: `${Math.max(width, 45)}px`, width: `${Math.max(width, 45)}px` }}
                          className={`py-2 pl-2.5 pr-6 border-r border-slate-300 relative group bg-slate-100 select-none whitespace-normal break-words leading-tight ${align} ${
                            isSortable ? 'cursor-pointer hover:bg-slate-200/80 transition-colors' : ''
                          }`}
                          title={isSortable ? `${label} (Click: 1st Desc, 2nd Asc, 3rd Off)` : label}
                        >
                          <div className={`flex items-center gap-1 w-full ${align === 'text-right' ? 'justify-end' : 'justify-start'}`}>
                            <span className="break-words leading-tight font-extrabold text-[11px] text-slate-700 tracking-wider">
                              {label}
                            </span>
                            {isSortable && (
                              <span className="shrink-0 flex items-center text-slate-400">
                                {sortDirection === 'asc' ? (
                                  <ArrowUp className="w-3.5 h-3.5 text-emerald-600 font-bold" />
                                ) : sortDirection === 'desc' ? (
                                  <ArrowDown className="w-3.5 h-3.5 text-emerald-600 font-bold" />
                                ) : (
                                  <ArrowUpDown className="w-3 h-3 opacity-0 group-hover:opacity-60 text-slate-400 transition-opacity" />
                                )}
                              </span>
                            )}
                          </div>
                          <ResizeHandle colId={colId} onResizeStart={handleReceiptsResizeStart} />
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sortedReceipts.length === 0 ? (
                    <tr>
                      <td colSpan={visibleReceiptsColumns.length} className="py-16 text-center text-slate-400 text-xs">
                        <p className="font-bold text-slate-700 text-sm mb-1">No payment receipts found matching your active filters.</p>
                        <button
                          type="button"
                          onClick={() => {
                            setReceiptSearch('');
                            setReceiptPropertyFilter('');
                            setReceiptModeFilter('');
                            setReceiptSelectedMonths([]);
                            setReceiptActiveFilters([]);
                          }}
                          className="text-xs font-bold text-emerald-600 hover:underline mt-1"
                        >
                          Reset Filters to view all {receipts.length} receipts
                        </button>
                      </td>
                    </tr>
                  ) : (
                    paginatedReceipts.map(r => (
                    <tr key={r._id} className="hover:bg-slate-50/70 transition-colors">
                      {visibleReceiptsColumns.map((colId, colIndex) => {
                        const frozenStyle = getFrozenColumnStyle(colIndex, frozenReceiptsCount, visibleReceiptsColumns, receiptsWidths, false);

                        if (colId === 'receiptDate') {
                          return (
                            <td key={colId} style={frozenStyle} className="px-5 py-4 text-slate-600 text-xs">
                              {formatDate(r.receiptDate)}
                            </td>
                          );
                        }
                        if (colId === 'createdAt' || colId === 'updatedAt') {
                          return (
                            <td key={colId} style={frozenStyle} className="px-5 py-4 text-slate-600 text-xs whitespace-nowrap">
                              {r[colId] ? formatDate(r[colId]) : '—'}
                            </td>
                          );
                        }
                        if (colId === 'tenant') {
                          return (
                            <td key={colId} style={frozenStyle} className="px-5 py-4">
                              <p className="font-bold text-slate-800 text-xs">{r.tenantId?.name || '—'}</p>
                              <p className="text-slate-400 text-[11px]">
                                {r.unitId?.propertyId?.name} • {r.unitId?.subUnitPartition || r.unitId?.unitName || '—'}
                              </p>
                            </td>
                          );
                        }
                        if (colId === 'accountingMonth') {
                          const acctM = r.accountingMonth || (r.receiptDate ? new Date(r.receiptDate).toISOString().slice(0, 7) : '');
                          return (
                            <td key={colId} style={frozenStyle} className="px-5 py-4 text-xs font-semibold text-slate-800 whitespace-nowrap text-center">
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-teal-50 text-teal-800 border border-teal-200/60 font-bold">
                                <Calendar className="w-3 h-3 text-teal-600" />
                                {acctM ? formatMonthYear(acctM) : '—'}
                              </span>
                            </td>
                          );
                        }
                        if (colId === 'monthsCovered' || colId === 'paidForMonth') {
                          const rawM = r.monthsCovered || r.paidForMonth || '';
                          const formatted = rawM ? rawM.split(',').map(m => formatMonthYear(m.trim())).join(', ') : '—';
                          return (
                            <td key={colId} style={frozenStyle} className="px-5 py-4">
                              <span className="inline-flex px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 text-xs font-semibold">
                                {formatted}
                              </span>
                            </td>
                          );
                        }
                        if (colId === 'rentAmount') {
                          const rentVal = r.rentAmount !== undefined ? r.rentAmount : (r.totalAmount || 0);
                          return (
                            <td key={colId} style={frozenStyle} className="px-5 py-4 text-right font-bold text-emerald-800 text-xs font-mono">
                              {formatCurrency(rentVal)}
                            </td>
                          );
                        }
                        if (colId === 'depositAmount') {
                          const depVal = r.depositAmount || 0;
                          return (
                            <td key={colId} style={frozenStyle} className="px-5 py-4 text-right font-bold text-amber-800 text-xs font-mono">
                              {depVal > 0 ? formatCurrency(depVal) : '—'}
                            </td>
                          );
                        }
                        if (colId === 'totalAmount') {
                          return (
                            <td key={colId} style={frozenStyle} className="px-5 py-4 text-right font-extrabold text-emerald-700 text-xs">
                              <div className="flex items-center justify-end gap-1.5 group">
                                <span>{formatCurrency(r.totalAmount)}</span>
                                <button
                                  type="button"
                                  onClick={() => openEditReceiptModal(r)}
                                  className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-blue-600 rounded transition-opacity"
                                  title="Edit Receipt Amount"
                                >
                                  <Edit2 className="w-3 h-3" />
                                </button>
                              </div>
                            </td>
                          );
                        }
                        if (colId === 'status') {
                          const rStatus = r.status || 'Rented';
                          return (
                            <td key={colId} style={frozenStyle} className="px-5 py-4 border-r border-slate-100 text-xs">
                              <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-bold text-[11px] ${
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
                            <td key={colId} style={frozenStyle} className="px-5 py-4 text-slate-600 text-xs max-w-xs truncate" title={r.comments}>
                              {r.comments || '—'}
                            </td>
                          );
                        }
                        if (colId === 'tenantPhone') {
                          return (
                            <td key={colId} style={frozenStyle} className="px-4 py-4 text-slate-600 text-xs">
                              {r.tenantId?.phone || '—'}
                            </td>
                          );
                        }
                        if (colId === 'propertyName') {
                          return (
                            <td key={colId} style={frozenStyle} className="px-5 py-4 text-slate-800 font-semibold text-xs">
                              {r.unitId?.propertyId?.name || '—'}
                            </td>
                          );
                        }
                        if (colId === 'subUnitName') {
                          return (
                            <td key={colId} style={frozenStyle} className="px-5 py-4 text-slate-700 text-xs">
                              {r.unitId?.subUnitPartition || r.unitId?.unitName || '—'}
                            </td>
                          );
                        }
                        if (colId === 'receiptNumber') {
                          return (
                            <td key={colId} style={frozenStyle} className="px-5 py-4 font-mono font-bold text-teal-800 text-xs">
                              {r.receiptNumber || '—'}
                            </td>
                          );
                        }
                        if (colId === 'contractNo') {
                          return (
                            <td key={colId} style={frozenStyle} className="px-5 py-4 text-xs font-mono">
                              {r.contractNo ? (
                                <span className="px-2 py-0.5 rounded-lg bg-teal-50 text-teal-800 border border-teal-200/80 font-bold">
                                  {r.contractNo}
                                </span>
                              ) : '—'}
                            </td>
                          );
                        }
                        if (colId === 'adjustmentAmount') {
                          const adj = Number(r.adjustmentAmount) || 0;
                          return (
                            <td key={colId} style={frozenStyle} className="px-5 py-4 text-right font-mono font-bold text-xs">
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
                            <td key={colId} style={frozenStyle} className="px-5 py-4 text-xs text-slate-600 max-w-xs truncate" title={r.adjustmentDescription}>
                              {r.adjustmentDescription || '—'}
                            </td>
                          );
                        }
                        if (colId === 'tenantCode') {
                          return (
                            <td key={colId} style={frozenStyle} className="px-5 py-4 font-mono text-xs text-slate-700">
                              {r.tenantId?.tenantCode || '—'}
                            </td>
                          );
                        }
                        if (colId === 'tenantEmail') {
                          return (
                            <td key={colId} style={frozenStyle} className="px-5 py-4 text-xs text-slate-600 truncate max-w-xs" title={r.tenantId?.email}>
                              {r.tenantId?.email || '—'}
                            </td>
                          );
                        }
                        if (colId === 'propertyCode') {
                          return (
                            <td key={colId} style={frozenStyle} className="px-5 py-4 font-mono text-xs text-slate-700">
                              {r.unitId?.propertyId?.propertyCode || '—'}
                            </td>
                          );
                        }
                        if (colId === 'propertyType') {
                          return (
                            <td key={colId} style={frozenStyle} className="px-5 py-4 text-xs text-slate-700">
                              {r.unitId?.propertyId?.propertyType || '—'}
                            </td>
                          );
                        }
                        if (colId === 'unitCode') {
                          return (
                            <td key={colId} style={frozenStyle} className="px-5 py-4 font-mono text-xs text-slate-700">
                              {r.unitId?.unitCode || '—'}
                            </td>
                          );
                        }
                        if (colId === 'subUnitArea') {
                          return (
                            <td key={colId} style={frozenStyle} className="px-5 py-4 text-right text-xs text-slate-700">
                              {r.unitId?.areaSqFt ? `${r.unitId.areaSqFt} sq ft` : '—'}
                            </td>
                          );
                        }
                        if (colId === 'floor') {
                          return (
                            <td key={colId} style={frozenStyle} className="px-5 py-4 text-xs text-slate-600">
                              {r.unitId?.floor || '—'}
                            </td>
                          );
                        }
                        if (colId === 'isReversed') {
                          return (
                            <td key={colId} style={frozenStyle} className="px-5 py-4 text-center">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${r.isReversed ? 'bg-rose-100 text-rose-800 border-rose-200' : 'bg-emerald-100 text-emerald-800 border-emerald-200'}`}>
                                {r.isReversed ? 'Reversed' : 'Active'}
                              </span>
                            </td>
                          );
                        }
                        if (colId === 'reversalReason') {
                          return (
                            <td key={colId} style={frozenStyle} className="px-5 py-4 text-xs text-slate-600 max-w-xs truncate" title={r.reversalReason}>
                              {r.reversalReason || '—'}
                            </td>
                          );
                        }
                        if (colId === 'actions') {
                          return (
                            <td key={colId} style={frozenStyle} className="px-5 py-4 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  onClick={() => openEditReceiptModal(r)}
                                  className="p-1.5 text-slate-500 hover:text-emerald-700 rounded-lg hover:bg-emerald-50 transition-colors"
                                  title="Edit Payment Receipt"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => handleReverseReceipt(r._id)}
                                  className="p-1.5 text-slate-500 hover:text-amber-600 rounded-lg hover:bg-amber-50 transition-colors"
                                  title="Reverse / Cancel Payment"
                                >
                                  <RotateCcw className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => handleDeleteReceipt(r._id)}
                                  className="p-1.5 text-slate-500 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors"
                                  title="Delete Receipt"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          );
                        }
                        return null;
                      })}
                    </tr>
                  )))}
                </tbody>
              </table>
            </div>
          </>
          )}

          {/* Receipts Pagination Bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-5 py-3 border-t border-slate-200 bg-slate-50 text-xs font-bold text-slate-600 shrink-0">
            <div className="flex items-center gap-2">
              <span>
                Showing {sortedReceipts.length === 0 ? 0 : isAllReceiptRows ? 1 : ((receiptCurrentPage - 1) * Number(receiptRowsPerPage)) + 1}
                - {isAllReceiptRows ? sortedReceipts.length : Math.min(receiptCurrentPage * Number(receiptRowsPerPage), sortedReceipts.length)} of {sortedReceipts.length} receipts
              </span>
              {receiptSortConfig.key && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[11px] border border-emerald-200">
                  Sorted: {receiptSortConfig.key} ({receiptSortConfig.direction?.toUpperCase()})
                </span>
              )}
            </div>

            {!isAllReceiptRows && totalReceiptPages > 1 && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={receiptCurrentPage === 1}
                  onClick={() => setReceiptCurrentPage(1)}
                  className="px-2.5 py-1 rounded border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  title="First Page"
                >
                  «
                </button>
                <button
                  type="button"
                  disabled={receiptCurrentPage === 1}
                  onClick={() => setReceiptCurrentPage(p => Math.max(1, p - 1))}
                  className="px-2.5 py-1 rounded border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Prev
                </button>
                <span className="px-3 py-1 text-slate-700">
                  Page {receiptCurrentPage} of {totalReceiptPages}
                </span>
                <button
                  type="button"
                  disabled={receiptCurrentPage >= totalReceiptPages}
                  onClick={() => setReceiptCurrentPage(p => Math.min(totalReceiptPages, p + 1))}
                  className="px-2.5 py-1 rounded border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Next
                </button>
                <button
                  type="button"
                  disabled={receiptCurrentPage >= totalReceiptPages}
                  onClick={() => setReceiptCurrentPage(totalReceiptPages)}
                  className="px-2.5 py-1 rounded border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  title="Last Page"
                >
                  »
                </button>
              </div>
            )}
          </div>
        </div>
        </div>
      )}

      {/* FAST RECORD / EDIT PAYMENT FULL SCREEN MODAL */}
      {showPaymentModal && (
        <PaymentEditModal
          isOpen={showPaymentModal}
          onClose={handleClosePaymentModal}
          receiptId={editingReceiptId}
          receipt={editingReceiptObj}
          item={paymentModalItem}
          selectedMonth={selectedMonth}
          tenants={tenants}
          assignments={assignments}
          backButtonLabel={peekDrilldown()?.label || "Back to Rent & Payment"}
          onSuccess={async () => {
            const rowKey = paymentModalItem ? getRowKey(paymentModalItem) : null;
            if (rowKey) {
              setRowDrafts(prev => {
                const next = { ...prev };
                delete next[rowKey];
                return next;
              });
            } else {
              setRowDrafts({});
            }
            handleClosePaymentModal();
            await fetchData(selectedMonth, { silent: true });
          }}
        />
      )}

      {/* DETAILED LEDGER BREAKDOWN MODAL WITH RECEIPT REVERT & EDIT */}
      {selectedLedgerModal && (() => {
        const modalUnitIdStr = String(selectedLedgerModal.unit?._id || selectedLedgerModal.unitId || '');
        const modalTenantIdStr = String(selectedLedgerModal.tenant?._id || selectedLedgerModal.tenantId || '');
        const modalContractNo = String(selectedLedgerModal.contractNo || '').trim().toLowerCase();
        const contractStart = selectedLedgerModal.startDate ? new Date(selectedLedgerModal.startDate) : null;
        const contractEnd = selectedLedgerModal.endDate ? new Date(selectedLedgerModal.endDate) : null;

        // Show only transactions pertaining to this contract for this particular unit
        const tenantReceipts = receipts.filter(r => {
          if (r.isReversed) return false;
          const rUnitStr = String(r.unitId?._id || r.unitId || '');
          if (rUnitStr !== modalUnitIdStr) return false;

          const rContractNo = String(r.contractNo || '').trim().toLowerCase();
          if (modalContractNo && rContractNo) {
            return rContractNo === modalContractNo;
          }

          // If receipt has no explicit contract number, verify tenant and contract date bounds
          if (modalTenantIdStr) {
            const rTenantStr = String(r.tenantId?._id || r.tenantId || '');
            if (rTenantStr && rTenantStr !== modalTenantIdStr) return false;
          }

          if (contractStart) {
            const rDate = r.receiptDate ? new Date(r.receiptDate) : null;
            if (rDate && rDate < contractStart) return false;
            if (contractEnd && rDate && rDate > contractEnd) return false;
          }

          return true;
        });

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-scaleUp">
            <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-xl w-full p-6 max-h-[88vh] flex flex-col">
              <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-base font-extrabold text-slate-900">
                      {selectedLedgerModal.tenant?.name || 'Tenant'} — Contract Ledger
                    </h3>
                    {selectedLedgerModal.contractNo && (
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-800 border border-blue-200 font-mono">
                        Contract: {selectedLedgerModal.contractNo}
                      </span>
                    )}
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-teal-50 text-teal-800 border border-teal-200">
                      Active Month: {formatMonthYear(selectedMonth)}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-2">
                    <span>{selectedLedgerModal.property?.name} • {selectedLedgerModal.unit?.subUnitPartition || selectedLedgerModal.unit?.unitName}</span>
                    {selectedLedgerModal.startDate && (
                      <span className="text-slate-400">
                        ({formatDate(selectedLedgerModal.startDate)} to {selectedLedgerModal.endDate ? formatDate(selectedLedgerModal.endDate) : 'Ongoing'})
                      </span>
                    )}
                  </p>
                </div>
                <button onClick={() => setSelectedLedgerModal(null)} className="p-2 text-slate-400 hover:text-slate-600">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto my-4 pr-1 space-y-4">
                {/* Month-by-month table */}
                <div>
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-2">Month-By-Month Rent Status</span>
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                      <tr>
                        <th className="py-2.5 px-2">Month</th>
                        <th className="py-2.5 px-2 text-right">Expected</th>
                        <th className="py-2.5 px-2 text-right">Paid</th>
                        <th className="py-2.5 px-2 text-right">This Month Due</th>
                        <th className="py-2.5 px-2 text-right text-rose-700 bg-rose-50/50">Cumulative Due</th>
                        <th className="py-2.5 px-2 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(() => {
                        let runningDue = 0;
                        return selectedLedgerModal.monthsBreakdown?.map((m, i) => {
                          runningDue += (m.outstandingAmount || 0);
                          const cumDue = m.cumulativeOutstanding !== undefined ? m.cumulativeOutstanding : runningDue;
                          return (
                            <tr key={i} className="hover:bg-slate-50 transition-colors">
                              <td className="py-2.5 px-2 font-bold text-slate-800">{formatMonthYear(m.monthYear)}</td>
                              <td className="py-2.5 px-2 text-right text-slate-600">{formatCurrency(m.expectedRate)}</td>
                              <td className="py-2.5 px-2 text-right font-bold text-emerald-600">{formatCurrency(m.allocatedAmount)}</td>
                              <td className="py-2.5 px-2 text-right font-bold text-rose-600">{formatCurrency(m.outstandingAmount)}</td>
                              <td className="py-2.5 px-2 text-right font-black text-rose-700 bg-rose-50/40">
                                {formatCurrency(cumDue)}
                              </td>
                              <td className="py-2.5 px-2 text-center">
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  m.status === 'Fully Paid'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : m.status === 'Partially Paid'
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'bg-rose-100 text-rose-800'
                                }`}>
                                  {m.status === 'Fully Paid' ? '✓ Paid' : m.status === 'Partially Paid' ? 'Partial' : 'Due'}
                                </span>
                              </td>
                            </tr>
                          );
                        });
                      })()}
                    </tbody>
                  </table>
                </div>

                {/* Tenant Receipts with Edit & Revert */}
                {tenantReceipts.length > 0 && (
                  <div className="pt-3 border-t border-slate-100">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                        Payment Receipts ({tenantReceipts.length})
                      </span>
                      <span className="text-[10px] text-slate-400">Edit or cancel receipts below</span>
                    </div>

                    <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                      {tenantReceipts.map(r => (
                        <div key={r._id} className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200 bg-slate-50/80 text-xs">
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-slate-600 font-semibold">{formatDate(r.receiptDate)}</span>
                              <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-extrabold text-[10px]">
                                {formatCurrency(r.totalAmount)}
                              </span>
                              <span className="px-1.5 py-0.5 rounded bg-teal-50 text-teal-800 border border-teal-200 font-bold text-[10px]">
                                Acct Month: {formatMonthYear(r.accountingMonth || r.receiptDate?.slice(0, 7) || selectedMonth)}
                              </span>
                              <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200 font-medium text-[10px]">
                                Paid For: {r.monthsCovered ? r.monthsCovered.split(',').map(m => formatMonthYear(m.trim())).join(', ') : 'Rent'}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-500 mt-0.5">
Status: <span className="font-medium text-slate-700">{r.status || 'Rented'}</span>
                            </p>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                openEditReceiptModal(r, selectedLedgerModal);
                              }}
                              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-700 hover:text-emerald-700 hover:border-emerald-300 text-[11px] font-bold shadow-xs transition-all"
                              title="Edit Receipt"
                            >
                              <Edit2 className="w-3 h-3" />
                              <span>Edit</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleReverseReceipt(r._id)}
                              className="p-1 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-white transition-colors"
                              title="Reverse / Cancel Receipt"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                handleDeleteReceipt(r._id);
                                setSelectedLedgerModal(null);
                              }}
                              className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-white transition-colors"
                              title="Delete Receipt"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                <div className="text-xs">
                  Total Outstanding: <strong className="text-rose-600 font-extrabold text-sm">{formatCurrency(selectedLedgerModal.totalOutstanding || 0)}</strong>
                </div>
                <button
                  onClick={() => setSelectedLedgerModal(null)}
                  className="px-4 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ADD / EDIT EXPENSE MODAL */}
      {showExpenseModal && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-3 sm:p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2.5">
                <div className={`p-2 rounded-xl ${expenseForm.headType === 'Property' ? 'bg-amber-100 text-amber-800' : 'bg-purple-100 text-purple-800'}`}>
                  {expenseForm.headType === 'Property' ? <Building2 className="w-5 h-5" /> : <Receipt className="w-5 h-5" />}
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-sm sm:text-base">
                    {editingExpense ? 'Edit Expense Record' : `Add ${expenseForm.headType} Expense`}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Month: {formatMonthYear(expenseForm.expenseMonth || selectedMonth)}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowExpenseModal(false)}
                className="p-1.5 rounded-xl hover:bg-slate-200/60 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveExpense} className="p-5 space-y-4 overflow-y-auto flex-1">
              {/* Type Switcher (only for new expense) */}
              {!editingExpense && (
                <div>
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                    Expense Head type
                  </label>
                  <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-xl">
                    <button
                      type="button"
                      onClick={() => setExpenseForm(f => ({ ...f, headType: 'Property', propertyId: f.propertyId || properties[0]?._id || '' }))}
                      className={`py-1.5 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        expenseForm.headType === 'Property'
                          ? 'bg-amber-600 text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Property
                    </button>
                    <button
                      type="button"
                      onClick={() => setExpenseForm(f => ({ ...f, headType: 'Other', propertyId: '' }))}
                      className={`py-1.5 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        expenseForm.headType === 'Other' || expenseForm.headType === 'Common'
                          ? 'bg-purple-600 text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Other
                    </button>
                  </div>
                </div>
              )}

              {/* TWO COLUMN FORM LAYOUT */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {/* Col 1: Property Selector (if Property Expense) or Info */}
                {expenseForm.headType === 'Property' ? (
                  <div>
                    <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block mb-1">
                      Property *
                    </label>
                    <select
                      value={expenseForm.propertyId}
                      onChange={(e) => setExpenseForm(f => ({ ...f, propertyId: e.target.value, unitId: '' }))}
                      required
                      className="w-full px-3 py-2 text-xs font-bold rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 cursor-pointer shadow-2xs"
                    >
                      <option value="">Select Property...</option>
                      {properties.map(p => (
                        <option key={p._id} value={p._id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div>
                    <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block mb-1">
                      Expense Scope
                    </label>
                    <div className="w-full px-3 py-2 text-xs font-bold rounded-xl border border-dashed border-purple-200 bg-purple-50 text-purple-700">
                      General / Common Expense
                    </div>
                  </div>
                )}

                {/* Col 2: Sub-Unit Partition (if Property Expense) */}
                {expenseForm.headType === 'Property' ? (
                  <div>
                    <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block mb-1">
                      Sub-Unit / Partition (Optional)
                    </label>
                    <select
                      value={expenseForm.unitId || ''}
                      disabled={!expenseForm.propertyId}
                      onChange={(e) => setExpenseForm(f => ({ ...f, unitId: e.target.value }))}
                      className="w-full px-3 py-2 text-xs font-bold rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 cursor-pointer shadow-2xs disabled:bg-slate-100 disabled:text-slate-400"
                    >
                      <option value="">Entire Property / Common Partition</option>
                      {units
                        .filter(u => String(u.propertyId?._id || u.propertyId || '') === String(expenseForm.propertyId || ''))
                        .map(u => (
                          <option key={u._id} value={u._id}>{u.subUnitPartition || u.unitName}</option>
                        ))
                      }
                    </select>
                  </div>
                ) : (
                  <div>
                    <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block mb-1">
                      Sub-Unit
                    </label>
                    <div className="w-full px-3 py-2 text-xs text-slate-400 rounded-xl border border-dashed border-slate-200 bg-slate-50 flex items-center">
                      — None (General) —
                    </div>
                  </div>
                )}

                {/* Col 2: Expense Category / Head */}
                <div>
                  <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block mb-1">
                    Expense Head / Category *
                  </label>
                  <select
                    value={expenseForm.category}
                    onChange={(e) => setExpenseForm(f => ({ ...f, category: e.target.value }))}
                    required
                    className="w-full px-3 py-2 text-xs font-bold rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 cursor-pointer shadow-2xs"
                  >
                    <option value="">Select Category...</option>
                    {expenseCategories
                      .filter(c => !c.headType || c.headType === expenseForm.headType)
                      .map(c => (
                        <option key={c._id || c.name} value={c.name}>{c.name}</option>
                      ))}
                  </select>
                </div>

                {/* Col 1: Amount */}
                <div>
                  <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block mb-1">
                    Amount (₹) *
                  </label>
                  <input
                    type="number"
                    value={expenseForm.amount}
                    onChange={(e) => setExpenseForm(f => ({ ...f, amount: e.target.value }))}
                    placeholder="e.g. 5000"
                    required
                    min="1"
                    className="w-full px-3 py-2 text-xs font-bold rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 font-mono shadow-2xs"
                  />
                </div>

                {/* Col 2: Expense Date */}
                <div>
                  <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block mb-1">
                    Expense Date *
                  </label>
                  <input
                    type="date"
                    value={expenseForm.expenseDate}
                    onChange={(e) => {
                      const d = e.target.value;
                      setExpenseForm(f => ({
                        ...f,
                        expenseDate: d,
                        expenseMonth: d ? d.slice(0, 7) : f.expenseMonth
                      }));
                    }}
                    required
                    className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 cursor-pointer shadow-2xs"
                  />
                </div>

                {/* Full Width (2 cols): Description / Notes - NON-MANDATORY */}
                <div className="sm:col-span-2">
                  <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block mb-1">
                    Description / Details <span className="text-slate-400 font-normal lowercase">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={expenseForm.description}
                    onChange={(e) => setExpenseForm(f => ({ ...f, description: e.target.value }))}
                    placeholder="e.g. Repairs and property maintenance (optional)"
                    className="w-full px-3 py-2 text-xs font-medium rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 shadow-2xs"
                  />
                </div>
              </div>

              {/* Modal Buttons */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowExpenseModal(false)}
                  disabled={savingExpense}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingExpense}
                  className={`px-5 py-2 rounded-xl text-xs font-bold text-white shadow-xs transition-all cursor-pointer ${
                    expenseForm.headType === 'Property'
                      ? 'bg-amber-600 hover:bg-amber-700'
                      : 'bg-purple-600 hover:bg-purple-700'
                  }`}
                >
                  {savingExpense ? 'Saving...' : editingExpense ? 'Update Expense' : 'Save Expense'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
