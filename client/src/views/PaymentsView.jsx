import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import API from '../services/api';
import { formatCurrency, formatDate, formatMonthYear } from '../utils/formatters';
import ColumnManager, { getHeaderDragProps, useResizableColumns, ResizeHandle, useFrozenColumns, getFrozenColumnStyle } from '../components/ColumnManager';
import ApexToolbar from '../components/ApexToolbar';
import { cycleThreeStateSort, evaluateFilterRule, sortDataRows, extractUniqueValues } from '../utils/tableUtils';
import * as XLSX from 'xlsx';
import { 
  Receipt, Plus, Search, AlertCircle, 
  RotateCcw, CheckCircle2, Eye, Sparkles, Clock, X,
  Edit2, Filter, Layers, ListFilter, Trash2,
  Calendar, ChevronLeft, ChevronRight, Download, Check,
  IndianRupee, ArrowRight, ChevronDown, ArrowUpDown, ArrowUp, ArrowDown, Building2
} from 'lucide-react';

const RENT_SHEET_COLUMNS_DEF = [
  { id: 'index', label: '#', defaultVisible: true },
  { id: 'tenant', label: 'Tenant Details', defaultVisible: true },
  { id: 'property', label: 'Property', defaultVisible: true },
  { id: 'subUnit', label: 'Sub-Unit', defaultVisible: true },
  { id: 'contractNo', label: 'Contract No', defaultVisible: true },
  { id: 'monthlyRent', label: 'Monthly Rent', defaultVisible: true },
  { id: 'outstanding', label: 'Outstanding due', defaultVisible: true },
  { id: 'paidUpTo', label: 'Paid Up To', defaultVisible: true },
  { id: 'paidForMonth', label: 'Paid for Month', defaultVisible: true },
  { id: 'amount', label: 'Amount Paid', defaultVisible: true },
  { id: 'actions', label: 'Actions', defaultVisible: true },
  { id: 'tenantPhone', label: 'Tenant Phone', defaultVisible: false },
  { id: 'propertyType', label: 'Property Type', defaultVisible: false },
  { id: 'subUnitArea', label: 'Partition Area (Sq Ft)', defaultVisible: false },
  { id: 'floor', label: 'Floor / Location', defaultVisible: false },
  { id: 'deposit', label: 'Security Deposit', defaultVisible: false },
  { id: 'nextUnpaid', label: 'Next Unpaid Month', defaultVisible: false },
  { id: 'totalCollected', label: 'Lifetime Paid', defaultVisible: false },
  { id: 'createdAt', label: 'Created Date', defaultVisible: false },
  { id: 'updatedAt', label: 'Modified Date', defaultVisible: false }
];

const RECEIPTS_COLUMNS_DEF = [
  { id: 'receiptDate', label: 'Date', defaultVisible: true },
  { id: 'tenant', label: 'Tenant & Sub-Unit', defaultVisible: true },
  { id: 'monthsCovered', label: 'Rent Month(s)', defaultVisible: true },
  { id: 'totalAmount', label: 'Total Amount Paid', defaultVisible: true },
  { id: 'paymentMode', label: 'Mode', defaultVisible: true },
  { id: 'referenceNumber', label: 'Ref / Cheque / UTR #', defaultVisible: false },
  { id: 'bankName', label: 'Bank Name', defaultVisible: false },
  { id: 'comments', label: 'Notes / Comments', defaultVisible: false },
  { id: 'tenantPhone', label: 'Tenant Phone', defaultVisible: false },
  { id: 'propertyName', label: 'Property Name', defaultVisible: false },
  { id: 'subUnitName', label: 'Sub-Unit Partition', defaultVisible: false },
  { id: 'createdAt', label: 'Created Date', defaultVisible: false },
  { id: 'updatedAt', label: 'Modified Date', defaultVisible: false },
  { id: 'actions', label: 'Actions', defaultVisible: true }
];

// Calibrated default column widths that provide comfortable space for inputs, dropdowns, and buttons without clipping!
const DEFAULT_SHEET_COLUMN_WIDTHS = {
  index: 45,
  tenant: 165,
  property: 130,
  subUnit: 120,
  contractNo: 125,
  monthlyRent: 110,
  outstanding: 125,
  paidUpTo: 105,
  paidForMonth: 150,
  amount: 115,
  actions: 205,
  tenantPhone: 115,
  propertyType: 110,
  subUnitArea: 95,
  floor: 85,
  deposit: 105,
  nextUnpaid: 110,
  totalCollected: 120,
  createdAt: 110,
  updatedAt: 110
};

const DEFAULT_RECEIPTS_COLUMN_WIDTHS = {
  receiptDate: 100,
  tenant: 180,
  monthsCovered: 140,
  totalAmount: 135,
  paymentMode: 90,
  actions: 105,
  referenceNumber: 120,
  bankName: 110,
  comments: 150,
  tenantPhone: 110,
  propertyName: 130,
  subUnitName: 110,
  createdAt: 110,
  updatedAt: 110
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
    const saved = localStorage.getItem('cols_payments_sheet_v5');
    if (saved) {
      try {
        const allowed = RENT_SHEET_COLUMNS_DEF.map((column) => column.id);
        return JSON.parse(saved).filter((column) => allowed.includes(column));
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
  } = useResizableColumns('payments_sheet_v5', DEFAULT_SHEET_COLUMN_WIDTHS);

  const {
    columnWidths: receiptsWidths,
    handleResizeStart: handleReceiptsResizeStart,
    resetColumnWidths: resetReceiptsWidths,
    hasCustomWidths: hasCustomReceiptsWidths
  } = useResizableColumns('payments_receipts', DEFAULT_RECEIPTS_COLUMN_WIDTHS);

  const [visibleReceiptsColumns, setVisibleReceiptsColumns] = useState(() => {
    const saved = localStorage.getItem('cols_payments_receipts');
    if (saved) {
      try {
        const allowed = RECEIPTS_COLUMNS_DEF.map((column) => column.id);
        return JSON.parse(saved).filter((column) => allowed.includes(column));
      } catch (e) {}
    }
    return RECEIPTS_COLUMNS_DEF.filter(c => c.defaultVisible !== false).map(c => c.id);
  });

  // Frozen Columns with persistence
  const [frozenSheetCount, setFrozenSheetCount] = useFrozenColumns('payments_sheet_v5', 0);
  const [frozenReceiptsCount, setFrozenReceiptsCount] = useFrozenColumns('payments_receipts', 0);
  
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
  const [loading, setLoading] = useState(true);

  // Expense Modal and Expansion State
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [editingExpense, setEditingExpense] = useState(null);
  const [expenseForm, setExpenseForm] = useState({
    headType: 'Property',
    propertyId: '',
    category: '',
    amount: '',
    expenseMonth: '',
    expenseDate: '',
    description: '',
    vendorOrPayee: '',
    paymentMode: 'Cash'
  });
  const [savingExpense, setSavingExpense] = useState(false);
  const [expandedPropertyExpenses, setExpandedPropertyExpenses] = useState({});
  const [expandedCommonExpenses, setExpandedCommonExpenses] = useState({});

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

  const [receiptModeFilter, setReceiptModeFilter] = useState(() => {
    return localStorage.getItem('payments_receipt_mode_filter') || '';
  });
  useEffect(() => {
    localStorage.setItem('payments_receipt_mode_filter', receiptModeFilter);
  }, [receiptModeFilter]);

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
    if (['actions', 'paidForMonth', 'amount'].includes(colId)) return;
    setSheetSortConfig(prev => cycleThreeStateSort(prev, colId));
  };

  const handleReceiptHeaderSort = (colId) => {
    if (colId === 'actions') return;
    setReceiptSortConfig(prev => cycleThreeStateSort(prev, colId));
  };

  const sheetFilterSuggestions = React.useMemo(() => {
    return {
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
      tenant: extractUniqueValues(receipts, r => r.tenantId?.name),
      propertyName: extractUniqueValues(receipts, r => r.unitId?.propertyId?.name),
      subUnitName: extractUniqueValues(receipts, r => r.unitId?.subUnitPartition || r.unitId?.unitName),
      paymentMode: ['Cash', 'UPI', 'Bank Transfer', 'Cheque'],
      bankName: extractUniqueValues(receipts, r => r.bankName),
      referenceNumber: extractUniqueValues(receipts, r => r.referenceNumber),
      monthsCovered: extractUniqueValues(receipts, r => r.monthsCovered),
      receiptDate: extractUniqueValues(receipts, r => formatDate(r.receiptDate))
    };
  }, [receipts]);

  // Modals
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedLedgerModal, setSelectedLedgerModal] = useState(null);
  const [editingReceiptId, setEditingReceiptId] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);

  // Fast Payment Form State
  const [selectedTenantInfo, setSelectedTenantInfo] = useState(null);
  const [unpaidMonthsList, setUnpaidMonthsList] = useState([]);
  const [selectedMonthsMap, setSelectedMonthsMap] = useState({}); // { '2026-03': 22000, '2026-04': 22000 }
  const [advanceMonthsList, setAdvanceMonthsList] = useState([]); // [ { monthYear: '2026-11', amount: 22000 } ]
  const [advanceMonthPicker, setAdvanceMonthPicker] = useState('');
  
  const [paymentForm, setPaymentForm] = useState({
    tenantId: '',
    unitId: '',
    receiptDate: new Date().toISOString().split('T')[0],
    totalAmount: '',
    paymentMode: 'Cash', // Default to Cash
    referenceNumber: '',
    bankName: '',
    comments: '',
  });

  // Direct Grid Entry State
  const [rowDrafts, setRowDrafts] = useState({});
  const [savingRows, setSavingRows] = useState({});
  const [savedFeedback, setSavedFeedback] = useState({});
  const [openMonthPickerRow, setOpenMonthPickerRow] = useState(null);

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

  // Get all payable months for a tenant (unpaid overdue months + active month if unpaid + upcoming advance months)
  // CRITICAL: NEVER include any month that is ALREADY FULLY PAID!
  const getPayableMonthsList = (item, activeMonth) => {
    const defaultRate = item.monthlyRentExpected || item.unit?.monthlyRentExpected || 0;
    const list = [];

    // 1. Past / overdue unpaid months (only status === 'Unpaid' or 'Partially Paid')
    const pastUnpaid = (item.monthsBreakdown || [])
      .filter(m => m.monthYear < activeMonth && (m.status === 'Unpaid' || m.status === 'Partially Paid'));
    
    pastUnpaid.forEach(m => {
      const remaining = m.outstandingAmount > 0 ? m.outstandingAmount : (m.expectedRate || defaultRate);
      if (remaining > 0) {
        list.push({
          monthYear: m.monthYear,
          dueAmount: remaining,
          type: 'overdue'
        });
      }
    });

    // 2. Active month (ONLY IF NOT FULLY PAID!)
    const activeData = item.monthsBreakdown?.find(m => m.monthYear === activeMonth);
    const activePaid = activeData ? activeData.allocatedAmount : 0;
    const activeExpected = activeData ? activeData.expectedRate : defaultRate;
    const isActivePaid = activePaid >= activeExpected && activeExpected > 0;

    if (!isActivePaid) {
      const remaining = Math.max(0, activeExpected - activePaid);
      list.push({
        monthYear: activeMonth,
        dueAmount: remaining > 0 ? remaining : activeExpected,
        type: activePaid > 0 ? 'partial' : 'current'
      });
    }

    // 3. Upcoming advance months (ONLY UNPAID ONES!)
    const upcoming = getUpcomingMonths(activeMonth, 6);
    upcoming.forEach(mStr => {
      const fData = item.monthsBreakdown?.find(bm => bm.monthYear === mStr);
      const fPaid = fData ? fData.allocatedAmount : 0;
      const fExp = fData ? fData.expectedRate : defaultRate;
      const isFPaid = fPaid >= fExp && fExp > 0;
      if (!isFPaid) {
        list.push({
          monthYear: mStr,
          dueAmount: Math.max(0, fExp - fPaid) || defaultRate,
          type: 'advance'
        });
      }
    });

    return list;
  };

  const getRowDraft = (item) => {
    const rowKey = getRowKey(item);
    if (rowDrafts[rowKey]) {
      return rowDrafts[rowKey];
    }

    const monthData = item.monthsBreakdown?.find(m => m.monthYear === selectedMonth);
    const paidThisMonth = monthData ? (monthData.actualAllocated ?? monthData.allocatedAmount ?? 0) : 0;

    // Amount Paid displays the actual collected amount for this month; if 0, leave blank for clean editing
    const defaultAmount = paidThisMonth > 0 ? paidThisMonth : '';

    return {
      amount: defaultAmount,
      selectedMonths: [selectedMonth],
      paymentMode: 'Cash',
      referenceNumber: ''
    };
  };

  const updateRowDraft = (rowKey, patch, item) => {
    setRowDrafts(prev => {
      const current = prev[rowKey] || (item ? getRowDraft(item) : {
        amount: '',
        selectedMonths: [selectedMonth],
        paymentMode: 'Cash',
        referenceNumber: ''
      });
      return {
        ...prev,
        [rowKey]: {
          ...current,
          ...patch
        }
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
        await fetchData(selectedMonth);
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
      if (currentMonths.length === 1) return; // keep at least 1 month
      nextMonths = currentMonths.filter(m => m !== monthStr);
    } else {
      nextMonths = [...currentMonths, monthStr].sort();
    }

    const payable = getPayableMonthsList(item, selectedMonth);
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

    updateRowDraft(rowKey, {
      ...current,
      selectedMonths: nextMonths,
      amount: totalAmt
    });
  };

  const handleDirectSaveRow = async (item) => {
    const rowKey = getRowKey(item);
    if (savingRows[rowKey]) return;

    const draft = getRowDraft(item);
    const enteredRaw = draft.amount;
    const enteredTotal = Number(enteredRaw);

    const months = draft.selectedMonths && draft.selectedMonths.length > 0 ? draft.selectedMonths : [selectedMonth];
    const isSingleMonthActive = months.length === 1 && months[0] === selectedMonth;
    const targetMonthForCheck = months[0] || selectedMonth;

    // Check if an existing payment receipt already exists for this unit covering target month
    const existingReceipt = receipts.find(r => 
      !r.isReversed &&
      (r.unitId?._id === item.unit?._id || r.unitId === item.unit?._id) &&
      r.allocations?.some(a => a.rentMonthYear === targetMonthForCheck)
    );

    // If entered amount is 0 or empty and an existing receipt exists, offer to remove it
    if ((enteredRaw === '' || isNaN(enteredTotal) || enteredTotal <= 0) && existingReceipt) {
      const confirmDelete = window.confirm(
        `Amount is set to 0. Do you want to remove the existing payment receipt of ₹${Number(existingReceipt.totalAmount).toLocaleString('en-IN')} for ${formatMonthYear(targetMonthForCheck)}?`
      );
      if (!confirmDelete) return;

      try {
        setSavingRows(prev => ({ ...prev, [rowKey]: true }));
        await API.delete(`/payments/${existingReceipt._id}/permanent`);
        setSavedFeedback(prev => ({ ...prev, [rowKey]: true }));
        setTimeout(() => setSavedFeedback(prev => ({ ...prev, [rowKey]: false })), 2500);
        setRowDrafts(prev => {
          const copy = { ...prev };
          delete copy[rowKey];
          return copy;
        });
        await fetchData(selectedMonth);
      } catch (err) {
        alert(err.response?.data?.message || 'Error removing payment');
      } finally {
        setSavingRows(prev => ({ ...prev, [rowKey]: false }));
      }
      return;
    }

    if (!enteredTotal || enteredTotal <= 0) {
      alert('Please enter a valid amount greater than 0.');
      return;
    }

    // Set saving state immediately to lock the button against fast double-clicks
    setSavingRows(prev => ({ ...prev, [rowKey]: true }));

    const monthlyRate = item.monthlyRentExpected || item.unit?.monthlyRentExpected || item.monthsBreakdown?.[0]?.expectedRate || 0;

    let remaining = enteredTotal;
    const allocations = months.map((m, idx) => {
      let allocated = 0;
      if (idx === months.length - 1) {
        allocated = remaining;
      } else {
        allocated = Math.min(remaining, monthlyRate);
        remaining -= allocated;
      }
      return {
        rentMonthYear: m,
        allocatedAmount: allocated,
        notes: `Rent for ${formatMonthYear(m)}`
      };
    });

    const matchingContracts = getMatchingContractsForRow(item, selectedMonth);
    const resolvedContractNo = draft.contractNo || item.contractNo || matchingContracts[0]?.contractNo || '';

    const currentMY = getCurrentMonthYear();
    const receiptDate = selectedMonth === currentMY 
      ? new Date().toISOString().split('T')[0] 
      : `${selectedMonth}-15`;

    try {
      if (existingReceipt && isSingleMonthActive) {
        // UPDATE existing receipt directly
        await API.put(`/payments/${existingReceipt._id}`, {
          totalAmount: enteredTotal,
          paymentMode: draft.paymentMode || existingReceipt.paymentMode || 'Cash',
          referenceNumber: draft.referenceNumber !== undefined ? draft.referenceNumber : (existingReceipt.referenceNumber || ''),
          contractNo: resolvedContractNo,
          allocations
        });
      } else {
        // CREATE new receipt
        const payload = {
          tenantId: item.tenant?._id,
          unitId: item.unit?._id,
          contractNo: resolvedContractNo,
          receiptDate,
          totalAmount: enteredTotal,
          paymentMode: draft.paymentMode || 'Cash',
          referenceNumber: draft.referenceNumber || '',
          bankName: '',
          comments: `Direct collection for ${months.map(formatMonthYear).join(', ')}`,
          allocations
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
      await fetchData(selectedMonth);
    } catch (err) {
      alert(err.response?.data?.message || 'Error saving payment.');
    } finally {
      setSavingRows(prev => ({ ...prev, [rowKey]: false }));
    }
  };

  // Fetch summary and records
  const fetchData = async (targetMonth = selectedMonth) => {
    try {
      setLoading(true);
      const [outRes, recRes, tRes, uRes, pRes, expRes, ledRes, assignRes, catRes] = await Promise.all([
        API.get(`/payments/outstanding-summary?upToMonthYear=${targetMonth}`),
        API.get('/payments'),
        API.get('/tenants'),
        API.get('/units'),
        API.get('/properties'),
        API.get(`/expenses?month=${targetMonth}`),
        API.get(`/ledger?startMonth=${targetMonth}&endMonth=${targetMonth}`),
        API.get('/assignments'),
        API.get('/expenses/categories')
      ]);
      if (outRes.data.success) setOutstandingData(outRes.data.data);
      if (recRes.data.success) setReceipts(recRes.data.data);
      if (tRes.data.success) setTenants(tRes.data.data);
      if (uRes.data.success) setUnits(uRes.data.data);
      if (pRes.data.success) setProperties(pRes.data.data);
      if (expRes.data?.success) setMonthExpenses(expRes.data.data || []);
      if (assignRes.data?.success) setAssignments(assignRes.data.data || []);
      if (catRes.data?.success) setExpenseCategories(catRes.data.data || []);
      if (ledRes.data?.success && ledRes.data.data?.length > 0) {
        setPrevMonthBalance(ledRes.data.data[0].openingBalance || 0);
      } else {
        setPrevMonthBalance(0);
      }
    } catch (err) {
      console.error('Error fetching rent and payment data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData(selectedMonth);
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

  // Helper to sync selected months, advance months, total amount and dynamic comments
  const syncPaymentState = (newSelectedMap, newAdvanceList, tenantId, unitId) => {
    setSelectedMonthsMap(newSelectedMap);
    setAdvanceMonthsList(newAdvanceList);

    const unpaidSum = Object.values(newSelectedMap).reduce((s, v) => s + Number(v || 0), 0);
    const advanceSum = newAdvanceList.reduce((s, a) => s + Number(a.amount || 0), 0);
    const total = unpaidSum + advanceSum;

    const activeMonths = Object.keys(newSelectedMap).sort();
    const advanceMonths = newAdvanceList.map(a => a.monthYear).sort();

    let autoComment = '';
    if (activeMonths.length > 0) {
      autoComment += `Rent collection for ${activeMonths.map(formatMonthYear).join(', ')}`;
    }
    if (advanceMonths.length > 0) {
      autoComment += (autoComment ? ' + ' : '') + `Advance for ${advanceMonths.map(formatMonthYear).join(', ')}`;
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
    setExpenseForm({
      headType: normHeadType,
      propertyId: normHeadType === 'Property' ? (defaultPropId || selectedPropertyFilter || properties[0]?._id || '') : '',
      category: firstCat,
      amount: '',
      expenseMonth: selectedMonth,
      expenseDate: `${selectedMonth}-01`,
      description: '',
      vendorOrPayee: '',
      paymentMode: 'Cash'
    });
    setShowExpenseModal(true);
  };

  // Open modal to edit an existing expense record
  const openEditExpenseModal = (exp) => {
    setEditingExpense(exp);
    const pId = exp.propertyId?._id || exp.propertyId || '';
    const normHeadType = exp.headType ? (exp.headType === 'Common' ? 'Other' : exp.headType) : (pId ? 'Property' : 'Other');
    setExpenseForm({
      headType: normHeadType,
      propertyId: pId,
      category: exp.category || '',
      amount: String(exp.amount || ''),
      expenseMonth: exp.expenseMonth || (exp.expenseDate ? exp.expenseDate.slice(0, 7) : selectedMonth),
      expenseDate: exp.expenseDate ? exp.expenseDate.slice(0, 10) : `${selectedMonth}-01`,
      description: exp.description || '',
      vendorOrPayee: exp.vendorOrPayee || '',
      paymentMode: exp.paymentMode || 'Cash'
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
        category: expenseForm.category.trim(),
        amount: amt,
        expenseMonth: expenseForm.expenseMonth || selectedMonth,
        expenseDate: expenseForm.expenseDate ? new Date(expenseForm.expenseDate) : new Date(`${selectedMonth}-01`),
        description: expenseForm.description?.trim() || `${expenseForm.category} expense`,
        vendorOrPayee: expenseForm.vendorOrPayee?.trim() || '',
        paymentMode: expenseForm.paymentMode || 'Cash'
      };

      if (editingExpense) {
        await API.put(`/expenses/${editingExpense._id}`, payload);
      } else {
        await API.post('/expenses', payload);
      }
      setShowExpenseModal(false);
      await fetchData(selectedMonth);
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
      await fetchData(selectedMonth);
    } catch (err) {
      alert(err.response?.data?.message || 'Error reversing expense.');
    }
  };

  // Open Fast Payment Modal for a specific row / tenant
  const openFastPaymentModal = async (item) => {
    setEditingReceiptId(null);
    setModalLoading(true);
    setShowPaymentModal(true);

    const tenantId = item.tenant?._id;
    const unitId = item.unit?._id;
    const monthlyRate = item.monthlyRentExpected || item.unit?.monthlyRentExpected || item.monthsBreakdown?.[0]?.expectedRate || 0;

    setSelectedTenantInfo({
      tenantId,
      initialTenantId: tenantId,
      assignmentId: item.assignmentId,
      unitId,
      tenantName: item.tenant?.name || 'Tenant',
      tenantPhone: item.tenant?.phone || '',
      propertyName: item.property?.name || '',
      partitionName: item.unit?.subUnitPartition || item.unit?.unitName || '',
      monthlyRate,
      paidTillMonth: item.paidTillMonth
    });
    setPaymentForm(f => ({ ...f, tenantId, unitId }));

    try {
      // Fetch detailed ledger to get unpaid and historical months
      const ledgerRes = await API.get(`/payments/tenant-unit-ledger?tenantId=${tenantId}&unitId=${unitId}&upToMonthYear=${selectedMonth}`);
      const ledger = ledgerRes.data?.data;
      const breakdown = ledger?.monthsBreakdown || item.monthsBreakdown || [];

      // Find unpaid or partially paid months
      const unpaid = breakdown.filter(m => m.status === 'Unpaid' || m.status === 'Partially Paid');
      setUnpaidMonthsList(unpaid);

      // SAFETY FIX (Point #2): Preselect ONLY the earliest single unpaid month (1 month) by default!
      const initialMap = {};
      if (unpaid.length > 0) {
        const earliest = unpaid[0];
        const amt = earliest.outstandingAmount > 0 ? earliest.outstandingAmount : (earliest.expectedRate || monthlyRate);
        initialMap[earliest.monthYear] = amt;
      } else {
        // If all prior months are clear, select 1 month advance
        const currentMonth = new Date().toISOString().slice(0, 7);
        initialMap[currentMonth] = monthlyRate;
      }

      syncPaymentState(initialMap, [], tenantId, unitId);
      const matchingContracts = getMatchingContractsForRow(item, selectedMonth);
      const activeContract = item.contractNo || matchingContracts[0]?.contractNo || '';
      setPaymentForm(f => ({ ...f, contractNo: activeContract }));
    } catch (err) {
      console.error('Failed to load tenant ledger:', err);
    } finally {
      setModalLoading(false);
    }
  };

  // Open Modal to Edit an Existing Receipt (Point #3)
  const openEditReceiptModal = async (receipt) => {
    setEditingReceiptId(receipt._id);
    setModalLoading(true);
    setShowPaymentModal(true);

    const tenantId = receipt.tenantId?._id || receipt.tenantId;
    const unitId = receipt.unitId?._id || receipt.unitId;

    setSelectedTenantInfo({
      tenantId,
      initialTenantId: tenantId,
      unitId,
      receiptNumber: receipt.receiptNumber,
      tenantName: receipt.tenantId?.name || 'Tenant',
      tenantPhone: receipt.tenantId?.phone || '',
      propertyName: receipt.unitId?.propertyId?.name || '',
      partitionName: receipt.unitId?.subUnitPartition || receipt.unitId?.unitName || '',
      monthlyRate: receipt.unitId?.monthlyRentExpected || 0
    });

    try {
      const ledgerRes = await API.get(`/payments/tenant-unit-ledger?tenantId=${tenantId}&unitId=${unitId}`);
      const ledger = ledgerRes.data?.data;
      const breakdown = ledger?.monthsBreakdown || [];
      const unpaid = breakdown.filter(m => m.status === 'Unpaid' || m.status === 'Partially Paid');
      setUnpaidMonthsList(unpaid);

      const initialMap = {};
      if (receipt.allocations && receipt.allocations.length > 0) {
        receipt.allocations.forEach(a => {
          initialMap[a.rentMonthYear] = a.allocatedAmount;
        });
      }

      setSelectedMonthsMap(initialMap);
      setAdvanceMonthsList([]);

      const activeMonths = Object.keys(initialMap).sort();
      const defaultComment = activeMonths.length > 0
        ? `Rent collection for ${activeMonths.map(formatMonthYear).join(', ')}`
        : 'Rent payment';

      setPaymentForm({
        tenantId,
        unitId,
        receiptDate: receipt.receiptDate ? new Date(receipt.receiptDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        totalAmount: String(receipt.totalAmount || 0),
        paymentMode: receipt.paymentMode || 'Cash',
        referenceNumber: receipt.referenceNumber || '',
        bankName: receipt.bankName || '',
        comments: receipt.comments || defaultComment
      });
    } catch (err) {
      console.error('Failed to load ledger for receipt edit:', err);
    } finally {
      setModalLoading(false);
    }
  };

  // Quick Selection Helper: Select only the earliest 1 month
  const selectEarliestOnly = () => {
    if (unpaidMonthsList.length === 0) return;
    const earliest = unpaidMonthsList[0];
    const amt = earliest.outstandingAmount > 0 ? earliest.outstandingAmount : (earliest.expectedRate || selectedTenantInfo?.monthlyRate || 0);
    syncPaymentState({ [earliest.monthYear]: amt }, advanceMonthsList);
  };

  // Quick Selection Helper: Select all unpaid months
  const selectAllUnpaid = () => {
    const fullMap = {};
    unpaidMonthsList.forEach(m => {
      fullMap[m.monthYear] = m.outstandingAmount > 0 ? m.outstandingAmount : (m.expectedRate || selectedTenantInfo?.monthlyRate || 0);
    });
    syncPaymentState(fullMap, advanceMonthsList);
  };

  // Quick Selection Helper: Clear selection
  const clearMonthSelection = () => {
    syncPaymentState({}, advanceMonthsList);
  };

  // Toggle selection of an unpaid month
  const toggleUnpaidMonth = (monthYear, defaultAmount) => {
    const updated = { ...selectedMonthsMap };
    if (updated[monthYear]) {
      delete updated[monthYear];
    } else {
      updated[monthYear] = defaultAmount;
    }
    syncPaymentState(updated, advanceMonthsList);
  };

  // Update amount allocated to a specific unpaid month
  const updateMonthAmount = (monthYear, newAmount) => {
    const val = newAmount === '' ? '' : (Number(newAmount) || 0);
    const updated = { ...selectedMonthsMap, [monthYear]: val };
    setSelectedMonthsMap(updated);

    const unpaidSum = Object.values(updated).reduce((s, v) => s + Number(v || 0), 0);
    const advanceSum = advanceMonthsList.reduce((s, a) => s + Number(a.amount || 0), 0);
    const total = unpaidSum + advanceSum;

    setPaymentForm(f => ({
      ...f,
      totalAmount: String(total)
    }));
  };

  // Handle direct typing in the Total Amount Paid field
  const handleTotalAmountChange = (newVal) => {
    setPaymentForm(f => ({ ...f, totalAmount: newVal }));

    if (newVal === '') return;
    const enteredNum = Number(newVal);
    if (isNaN(enteredNum) || enteredNum < 0) return;

    // Distribute enteredNum across active selected months so allocations always match
    const activeMonths = Object.keys(selectedMonthsMap).sort();
    if (activeMonths.length === 1) {
      setSelectedMonthsMap({ [activeMonths[0]]: enteredNum });
    } else if (activeMonths.length > 1) {
      let rem = enteredNum;
      const updated = {};
      const defaultRate = selectedTenantInfo?.monthlyRate || 22000;
      activeMonths.forEach((m, idx) => {
        if (idx === activeMonths.length - 1) {
          updated[m] = rem;
        } else {
          const alloc = Math.min(rem, defaultRate);
          updated[m] = alloc;
          rem = Math.max(0, rem - alloc);
        }
      });
      setSelectedMonthsMap(updated);
    } else if (advanceMonthsList.length === 1) {
      setAdvanceMonthsList([{ ...advanceMonthsList[0], amount: enteredNum }]);
    }
  };

  // Add an Advance Month
  const handleAddAdvanceMonth = () => {
    if (!advanceMonthPicker) return;
    if (selectedMonthsMap[advanceMonthPicker] || advanceMonthsList.some(a => a.monthYear === advanceMonthPicker)) {
      alert(`${formatMonthYear(advanceMonthPicker)} is already in the list.`);
      return;
    }

    const defaultRate = selectedTenantInfo?.monthlyRate || 22000;
    const updatedAdvance = [...advanceMonthsList, { monthYear: advanceMonthPicker, amount: defaultRate }];
    syncPaymentState(selectedMonthsMap, updatedAdvance);
    setAdvanceMonthPicker('');
  };

  // Remove an Advance Month
  const handleRemoveAdvanceMonth = (monthYear) => {
    const updatedAdvance = advanceMonthsList.filter(a => a.monthYear !== monthYear);
    syncPaymentState(selectedMonthsMap, updatedAdvance);
  };

  // Submit Payment (Handles both Create New and Update Existing)
  const handleSubmitPayment = async (e) => {
    e.preventDefault();
    const allocations = [];

    // Add selected unpaid months
    Object.entries(selectedMonthsMap).forEach(([monthYear, amt]) => {
      if (Number(amt) > 0) {
        allocations.push({
          rentMonthYear: monthYear,
          allocatedAmount: Number(amt),
          notes: `Rent for ${formatMonthYear(monthYear)}`
        });
      }
    });

    // Add advance months
    advanceMonthsList.forEach(a => {
      if (Number(a.amount) > 0) {
        allocations.push({
          rentMonthYear: a.monthYear,
          allocatedAmount: Number(a.amount),
          notes: `Advance rent for ${formatMonthYear(a.monthYear)}`
        });
      }
    });

    if (allocations.length === 0) {
      alert('Please select at least one month or advance month to allocate the payment.');
      return;
    }

    const totalAllocated = allocations.reduce((s, a) => s + a.allocatedAmount, 0);
    const enteredTotal = Number(paymentForm.totalAmount);

    if (Math.abs(enteredTotal - totalAllocated) > 0.01) {
      alert(`Total payment (₹${enteredTotal}) must equal sum of allocations (₹${totalAllocated}).`);
      return;
    }

    try {
      setSubmitting(true);
      const payload = {
        tenantId: paymentForm.tenantId,
        unitId: paymentForm.unitId,
        contractNo: paymentForm.contractNo || '',
        receiptDate: paymentForm.receiptDate,
        totalAmount: enteredTotal,
        paymentMode: paymentForm.paymentMode || 'Cash',
        referenceNumber: paymentForm.referenceNumber || '',
        bankName: paymentForm.bankName || '',
        comments: paymentForm.comments || '',
        allocations
      };

      if (editingReceiptId) {
        const res = await API.put(`/payments/${editingReceiptId}`, payload);
        if (res.data.success) {
          setShowPaymentModal(false);
          setEditingReceiptId(null);
          alert('Payment receipt updated successfully!');
          await fetchData(selectedMonth);
        }
      } else {
        if (selectedTenantInfo?.assignmentId && paymentForm.tenantId && paymentForm.tenantId !== selectedTenantInfo.initialTenantId) {
          try {
            await API.put(`/assignments/${selectedTenantInfo.assignmentId}`, {
              tenantId: paymentForm.tenantId
            });
          } catch(err) {
            console.error('Failed to update contract tenant:', err);
          }
        }
        const res = await API.post('/payments', payload);
        if (res.data.success) {
          setShowPaymentModal(false);
          alert('Payment recorded successfully!');
          await fetchData(selectedMonth);
        }
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Error processing payment. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // Cancel / Reverse Receipt
  const handleReverseReceipt = async (id) => {
    const reason = prompt('Why are you cancelling this payment receipt?');
    if (!reason || !reason.trim()) return;
    try {
      await API.post(`/payments/${id}/reverse`, { reversalReason: reason.trim() });
      fetchData(selectedMonth);
    } catch (err) {
      alert(err.response?.data?.message || 'Could not cancel receipt.');
    }
  };

  // Delete Receipt
  const handleDeleteReceipt = async (id) => {
    if (!window.confirm('Permanently delete this payment receipt? This cannot be undone.')) return;
    try {
      await API.delete(`/payments/${id}`);
      fetchData(selectedMonth);
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
      const refMatch = r.referenceNumber || '';
      const notesMatch = r.comments || '';
      const bankMatch = r.bankName || '';
      const modeMatch = r.paymentMode || 'Cash';
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
        const bMatch = bankMatch.toLowerCase().includes(q);
        const mMatch = modeMatch.toLowerCase().includes(q);
        if (!tMatch && !pMatch && !uMatch && !rfMatch && !nMatch && !bMatch && !mMatch) {
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

      // 3. Payment Mode Filter
      if (receiptModeFilter && r.paymentMode !== receiptModeFilter) {
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
        else if (f.columnId === 'monthsCovered') fieldVal = months;
        else if (f.columnId === 'totalAmount') fieldVal = amount;
        else if (f.columnId === 'paymentMode') fieldVal = modeMatch;
        else if (f.columnId === 'referenceNumber') fieldVal = refMatch;
        else if (f.columnId === 'bankName') fieldVal = bankMatch;
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
  }, [receipts, receiptSearch, receiptPropertyFilter, receiptModeFilter, receiptSelectedMonths, receiptActiveFilters]);

  // Total collected in filtered receipts
  const totalFilteredReceiptsAmount = filteredReceipts.reduce((sum, r) => sum + (Number(r.totalAmount) || 0), 0);

  // Sorted Receipts for Receipts Register
  const sortedReceipts = React.useMemo(() => {
    return sortDataRows(filteredReceipts, receiptSortConfig, {
      receiptDate: r => r.receiptDate,
      tenant: r => r.tenantId?.name || '',
      monthsCovered: r => r.monthsCovered || '',
      totalAmount: r => Number(r.totalAmount) || 0,
      paymentMode: r => r.paymentMode || '',
      referenceNumber: r => r.referenceNumber || '',
      bankName: r => r.bankName || '',
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
      'Tenant': r.tenantId?.name || '—',
      'Tenant Phone': r.tenantId?.phone || '—',
      'Property': r.unitId?.propertyId?.name || '—',
      'Sub-Unit': r.unitId?.subUnitPartition || r.unitId?.unitName || '—',
      'Rent Month(s)': r.monthsCovered || '—',
      'Total Amount Paid (₹)': Number(r.totalAmount) || 0,
      'Payment Mode': r.paymentMode || 'Cash',
      'Ref / UTR #': r.referenceNumber || '—',
      'Bank Name': r.bankName || '—',
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

      const matchesSearch = !search ||
        tenantName.toLowerCase().includes(search.toLowerCase()) ||
        propName.toLowerCase().includes(search.toLowerCase()) ||
        unitName.toLowerCase().includes(search.toLowerCase()) ||
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
      return sum + (monthData ? (monthData.actualAllocated ?? monthData.allocatedAmount ?? 0) : 0);
    }, 0);
  }, [filteredOut, selectedMonth]);

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

  // Excel Export of the Monthly Grid
  const exportSheetToExcel = () => {
    const exportRows = sortedSheetRows.map((item, idx) => {
      const monthData = item.monthsBreakdown?.find(m => m.monthYear === selectedMonth);
      const monthlyExpected = monthData ? monthData.expectedRate : (item.unit?.monthlyRentExpected || 0);
      const paidThisMonth = monthData ? monthData.allocatedAmount : 0;
      const outstandingThroughMonth = item.totalOutstanding || 0;

      return {
        '#': idx + 1,
        'Tenant Details': item.tenant?.name || 'Unknown',
        'Phone': item.tenant?.phone || '—',
        'Property': item.property?.name || '—',
        'Sub-Unit': item.unit?.subUnitPartition || item.unit?.unitName || '—',
        'Monthly Rent': monthlyExpected,
        'Outstanding due': outstandingThroughMonth,
        'Paid Up To': item.paidTillMonth && item.paidTillMonth !== 'None' ? formatMonthYear(item.paidTillMonth) : 'None',
        'Paid for Month': formatMonthYear(selectedMonth),
        'Total Amount Paid': paidThisMonth,
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
    <div className="space-y-2">
      {/* Top Header Card */}
      <div className="bg-white p-3 sm:p-3.5 rounded-2xl shadow-2xs border border-slate-200">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-xl font-extrabold text-slate-900">Rent & Payments</h2>
          </div>

          {/* Tab Selector */}
          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
            <button
              onClick={() => setActiveTab('sheet')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'sheet'
                  ? 'bg-white text-emerald-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              Monthly Collection Grid
            </button>
            <button
              onClick={() => setActiveTab('receipts')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'receipts'
                  ? 'bg-white text-emerald-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Receipt className="w-3.5 h-3.5" />
              Receipts Register ({receipts.length})
            </button>
          </div>
        </div>

        {/* Top Month Selector & Quick Metrics Bar - In One Clean Single Row from Active Month to Outstanding */}
        <div className="mt-2 pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
          {/* Active Month Controller (Today button removed as requested) */}
          <div className="flex items-center gap-1.5 bg-slate-50 p-1 rounded-2xl border border-slate-200 shadow-2xs">
            <button
              onClick={handlePrevMonth}
              className="p-1.5 rounded-xl hover:bg-white text-slate-600 hover:text-slate-900 transition-all cursor-pointer"
              title="Previous Month"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-1.5 px-2 py-0.5">
              <Calendar className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <div className="text-left">
                <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 block leading-tight">Active Month</span>
                <span className="text-xs font-black text-slate-900 leading-tight">{formatMonthYear(selectedMonth)}</span>
              </div>
            </div>

            <button
              onClick={handleNextMonth}
              className="p-1.5 rounded-xl hover:bg-white text-slate-600 hover:text-slate-900 transition-all cursor-pointer"
              title="Next Month"
            >
              <ChevronRight className="w-4 h-4" />
            </button>

            <div className="h-5 w-px bg-slate-200 mx-0.5" />

            {/* Direct Month Picker */}
            <input
              type="month"
              value={selectedMonth}
              onChange={handleSelectCustomMonth}
              className="text-xs font-semibold px-2 py-1 rounded-xl border border-slate-200 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
              title="Jump to specific month and year"
            />
          </div>

          {/* Compact Overview Badges (Tenancies, Expected, Collected, Outstanding) in the same single row */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center gap-1.5 shadow-2xs">
              <span className="text-xs text-slate-500 font-semibold">Tenancies:</span>
              <span className="text-xs font-black text-slate-800">{filteredOut.length} units</span>
            </div>
            <div className="px-3 py-1.5 rounded-xl bg-blue-50/70 border border-blue-200/80 flex items-center gap-1.5 shadow-2xs">
              <span className="text-xs text-blue-600 font-semibold">Expected:</span>
              <span className="text-xs font-black text-blue-900 font-mono">{formatCurrency(totalExpectedSum)}</span>
            </div>
            <div className="px-3 py-1.5 rounded-xl bg-emerald-50/70 border border-emerald-200/80 flex items-center gap-1.5 shadow-2xs">
              <span className="text-xs text-emerald-600 font-semibold">Collected:</span>
              <span className="text-xs font-black text-emerald-800 font-mono">{formatCurrency(totalPaidSum)}</span>
            </div>
            <div className="px-3 py-1.5 rounded-xl bg-rose-50/70 border border-rose-200/80 flex items-center gap-1.5 shadow-2xs">
              <span className="text-xs text-rose-600 font-semibold">Outstanding:</span>
              <span className="text-xs font-black text-rose-700 font-mono">{formatCurrency(totalOutstandingSum)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* VIEW 1: EXCEL-TEMPLATE-STYLE GRID */}
      {activeTab === 'sheet' && (
        <div className="space-y-2">
          {/* APEX Toolbar for Rent Sheet */}
          <ApexToolbar
            search={search}
            onSearchChange={(val) => { setSearch(val); setSheetCurrentPage(1); }}
            rowsPerPage={sheetRowsPerPage}
            onRowsPerPageChange={(val) => { setSheetRowsPerPage(val); setSheetCurrentPage(1); }}
            availableRowsOptions={[5, 10, 25, 50, 100, 'All']}
            columns={RENT_SHEET_COLUMNS_DEF}
            visibleColumns={visibleSheetColumns}
            onChangeVisibleColumns={(cols) => {
              setVisibleSheetColumns(cols);
              try { localStorage.setItem('cols_payments_sheet_v5', JSON.stringify(cols)); } catch(e){}
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
            primaryAction={
              <div className="flex items-center gap-2 shrink-0">
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
              <div className="overflow-x-auto max-h-[70vh] overflow-y-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
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
                        const dragProps = getHeaderDragProps(colId, visibleSheetColumns, setVisibleSheetColumns, 'payments_sheet_v5');
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
                        else if (colId === 'paidForMonth') { label = 'Month to Pay'; }
                        else if (colId === 'amount') { label = 'Amount Paid'; }
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

                        const isSortable = !['actions', 'paidForMonth', 'amount'].includes(colId);

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
                      const isFullyPaidThisMonth = paidThisMonth >= expectedRate && expectedRate > 0;
                      const isPartial = paidThisMonth > 0 && paidThisMonth < expectedRate;
                      
                      const matchedTenant = tenants.find(t => t._id === item.tenant?._id);
                      const matchedUnit = units.find(u => u._id === item.unit?._id);
                      const matchedProp = properties.find(p => p._id === item.property?._id || p._id === item.unit?.propertyId);

                      return (
                        <tr key={item.assignmentId || idx} className="hover:bg-slate-50/80 transition-colors">
                          {visibleSheetColumns.map((colId, colIndex) => {
                            const frozenStyle = getFrozenColumnStyle(colIndex, frozenSheetCount, visibleSheetColumns, columnWidths, false);

                            if (colId === 'index') {
                              return (
                                <td key={colId} style={frozenStyle} className="px-4 py-3.5 border-r border-slate-100 text-center text-xs font-mono">
                                  {item.property?.displayOrder ? (
                                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-slate-100 font-bold text-slate-700 text-[11px]" title={`Property Order: ${item.property.displayOrder}`}>
                                      {item.property.displayOrder}
                                    </span>
                                  ) : (
                                    <span className="text-slate-400">{idx + 1}</span>
                                  )}
                                </td>
                              );
                            }
                            if (colId === 'tenant') {
                              return (
                                <td key={colId} style={frozenStyle} className="px-4 py-3.5 border-r border-slate-100">
                                  <p className="font-bold text-slate-900 text-sm">{item.tenant?.name || 'Unknown'}</p>
                                  <p className="text-slate-400 text-xs mt-0.5">{item.tenant?.phone || '—'}</p>
                                </td>
                              );
                            }
                            if (colId === 'property') {
                              return (
                                <td key={colId} style={frozenStyle} className="px-4 py-3.5 border-r border-slate-100">
                                  <div className="font-semibold text-slate-800 text-xs">
                                    {item.property?.name || '—'}
                                  </div>
                                </td>
                              );
                            }
                            if (colId === 'subUnit') {
                              return (
                                <td key={colId} style={frozenStyle} className="px-4 py-3.5 border-r border-slate-100">
                                  <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-xs font-semibold">
                                    <Layers className="w-3 h-3 text-slate-400" />
                                    <span>{item.unit?.subUnitPartition || item.unit?.unitName || 'Partition'}</span>
                                  </div>
                                  {item.unit?.areaSqFt && <div className="text-[10px] text-slate-400 mt-0.5 font-normal">{item.unit.areaSqFt} sq ft</div>}
                                </td>
                              );
                            }
                            if (colId === 'contractNo') {
                              const matchingContracts = getMatchingContractsForRow(item, selectedMonth);
                              const activeContractNo = draft.contractNo || item.contractNo || matchingContracts[0]?.contractNo;
                              return (
                                <td key={colId} style={frozenStyle} className="px-3 py-3.5 border-r border-slate-100 text-xs">
                                  {matchingContracts.length > 1 ? (
                                    <select
                                      value={activeContractNo || ''}
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
                                  )}
                                </td>
                              );
                            }
                            if (colId === 'monthlyRent') {
                              const isEditingThisRent = editingRentUnitId === item.unit?._id;
                              return (
                                <td key={colId} style={frozenStyle} className="px-3 py-3.5 border-r border-slate-100 text-right font-semibold text-slate-700 text-xs font-mono">
                                  {isEditingThisRent ? (
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
                                  )}
                                </td>
                              );
                            }
                            if (colId === 'outstanding') {
                              return (
                                <td key={colId} style={frozenStyle} className="px-3 py-3.5 border-r border-slate-100 text-right font-extrabold text-xs">
                                  {outstandingTotal > 0 ? (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-black bg-rose-50 text-rose-700 border border-rose-200 font-mono">
                                      {formatCurrency(outstandingTotal)}
                                    </span>
                                  ) : (
                                    <span className="font-semibold text-slate-700 text-xs font-mono">
                                      ₹0
                                    </span>
                                  )}
                                </td>
                              );
                            }
                            if (colId === 'paidUpTo') {
                              return (
                                <td key={colId} style={frozenStyle} className="px-4 py-3.5 border-r border-slate-100 text-center text-xs font-medium text-slate-600">
                                  {item.paidTillMonth && item.paidTillMonth !== 'None' ? (
                                    <span className="text-slate-700 font-semibold">{formatMonthYear(item.paidTillMonth)}</span>
                                  ) : (
                                    <span className="text-slate-400 italic">None</span>
                                  )}
                                </td>
                              );
                            }
                            if (colId === 'paidForMonth') {
                              const selMonths = draft.selectedMonths && draft.selectedMonths.length > 0 ? draft.selectedMonths : [selectedMonth];
                              return (
                                <td key={colId} style={frozenStyle} className="px-3 py-3 border-r border-slate-100 relative">
                                  <div className="flex items-center">
                                    <button
                                      type="button"
                                      onClick={() => setOpenMonthPickerRow(openMonthPickerRow === rowKey ? null : rowKey)}
                                      className="w-full inline-flex items-center justify-between gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 bg-slate-50 hover:bg-white hover:border-emerald-500 hover:shadow-xs transition-all text-slate-800 group"
                                      title="Click to select or change payment month(s)"
                                    >
                                      <div className="flex items-center gap-1.5 truncate">
                                        <Calendar className="w-3.5 h-3.5 text-slate-400 group-hover:text-emerald-600 shrink-0" />
                                        <span className="truncate font-bold text-slate-800">
                                          {selMonths.map((m) => {
                                            const isAct = m === selectedMonth;
                                            const isAdv = m > selectedMonth;
                                            return `${formatMonthYear(m)}${isAdv ? ' (Adv)' : !isAct ? ' (Due)' : ''}`;
                                          }).join(', ')}
                                        </span>
                                      </div>
                                      <ChevronDown className="w-3 h-3 text-slate-400 group-hover:text-slate-700 shrink-0 ml-1" />
                                    </button>
                                  </div>

                                  {/* Multi-Month Selection Popover */}
                                  {openMonthPickerRow === rowKey && (() => {
                                    const payableMonths = getPayableMonthsList(item, selectedMonth);
                                    const dueMonths = payableMonths.filter(m => m.type !== 'advance');
                                    const advanceMonths = payableMonths.filter(m => m.type === 'advance');

                                    return (
                                      <div className="absolute top-12 left-2 z-30 bg-white border border-slate-200 rounded-2xl shadow-2xl p-3.5 min-w-[280px] text-xs">
                                        <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
                                          <span className="font-extrabold text-slate-800">Select Month(s) to Pay</span>
                                          <button
                                            type="button"
                                            onClick={() => setOpenMonthPickerRow(null)}
                                            className="text-slate-400 hover:text-slate-600 p-1"
                                          >
                                            <X className="w-3.5 h-3.5" />
                                          </button>
                                        </div>

                                        <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                                          {/* Due / Pending Months (if any) */}
                                          {dueMonths.length > 0 && (
                                            <div className="space-y-1">
                                              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block px-1">
                                                Due Month(s) ({dueMonths.length})
                                              </span>
                                              {dueMonths.map(m => (
                                                <label key={m.monthYear} className={`flex items-center justify-between gap-2 p-1.5 rounded-lg cursor-pointer border transition-all ${
                                                  (draft.selectedMonths || []).includes(m.monthYear)
                                                    ? 'bg-rose-50/70 border-rose-300'
                                                    : 'hover:bg-slate-50 border-slate-100'
                                                }`}>
                                                  <div className="flex items-center gap-2">
                                                    <input
                                                      type="checkbox"
                                                      checked={(draft.selectedMonths || []).includes(m.monthYear)}
                                                      onChange={() => handleToggleMonthForRow(item, m.monthYear)}
                                                      className="rounded text-rose-600 focus:ring-rose-500 w-3.5 h-3.5 cursor-pointer"
                                                    />
                                                    <span className="text-slate-800 font-semibold">{formatMonthYear(m.monthYear)}</span>
                                                    {m.type === 'current' && <span className="text-[10px] text-slate-500">(Active)</span>}
                                                  </div>
                                                  <span className="text-[10px] font-bold text-rose-700 bg-rose-100 px-1.5 py-0.5 rounded">
                                                    Due {formatCurrency(m.dueAmount)}
                                                  </span>
                                                </label>
                                              ))}
                                            </div>
                                          )}

                                          {/* Advance Months (Unpaid upcoming months) */}
                                          {advanceMonths.length > 0 && (
                                            <div className="space-y-1 pt-1">
                                              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block px-1">
                                                Upcoming Month(s) (Advance)
                                              </span>
                                              {advanceMonths.map(m => (
                                                <label key={m.monthYear} className={`flex items-center justify-between gap-2 p-1.5 rounded-lg cursor-pointer border transition-all ${
                                                  (draft.selectedMonths || []).includes(m.monthYear)
                                                    ? 'bg-blue-50/70 border-blue-300'
                                                    : 'hover:bg-slate-50 border-slate-100'
                                                }`}>
                                                  <div className="flex items-center gap-2">
                                                    <input
                                                      type="checkbox"
                                                      checked={(draft.selectedMonths || []).includes(m.monthYear)}
                                                      onChange={() => handleToggleMonthForRow(item, m.monthYear)}
                                                      className="rounded text-blue-600 focus:ring-blue-500 w-3.5 h-3.5 cursor-pointer"
                                                    />
                                                    <span className="text-slate-800 font-medium">{formatMonthYear(m.monthYear)}</span>
                                                  </div>
                                                  <span className="text-[10px] font-bold text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded">
                                                    Advance
                                                  </span>
                                                </label>
                                              ))}
                                            </div>
                                          )}
                                        </div>

                                        <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
                                          <span className="text-slate-600 font-bold">
                                            {(draft.selectedMonths || []).length} month(s) • ₹{Number(draft.amount || 0).toLocaleString('en-IN')}
                                          </span>
                                          <button
                                            type="button"
                                            onClick={() => setOpenMonthPickerRow(null)}
                                            className="px-3 py-1 rounded-lg bg-slate-900 text-white font-bold hover:bg-slate-800 shadow-sm"
                                          >
                                            Done
                                          </button>
                                        </div>
                                      </div>
                                    );
                                  })()}
                                </td>
                              );
                            }
                            if (colId === 'amount') {
                              return (
                                <td key={colId} style={frozenStyle} className="px-3 py-3 border-r border-slate-100">
                                  <div className="relative flex items-center">
                                    <span className="absolute left-2.5 text-slate-400 text-xs font-semibold">₹</span>
                                    <input
                                      type="number"
                                      value={draft.amount ?? ''}
                                      disabled={savingRows[rowKey]}
                                      onChange={(e) => updateRowDraft(rowKey, { amount: e.target.value }, item)}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleDirectSaveRow(item);
                                      }}
                                      className="w-full pl-6 pr-2 py-1.5 text-xs font-bold text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 font-mono shadow-xs disabled:bg-slate-100 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                      placeholder="Amount ₹"
                                      title="Direct editable rent amount. Type custom amount & press Enter to Save."
                                    />
                                  </div>
                                </td>
                              );
                            }
                            if (colId === 'tenantPhone') {
                              return (
                                <td key={colId} style={frozenStyle} className="px-4 py-3.5 border-r border-slate-100 text-xs text-slate-700">
                                  {item.tenant?.phone || matchedTenant?.phone || '—'}
                                </td>
                              );
                            }
                            if (colId === 'propertyType') {
                              return (
                                <td key={colId} style={frozenStyle} className="px-4 py-3.5 border-r border-slate-100 text-xs text-slate-700">
                                  {matchedProp?.type || '—'}
                                </td>
                              );
                            }
                            if (colId === 'subUnitArea') {
                              return (
                                <td key={colId} style={frozenStyle} className="px-4 py-3.5 border-r border-slate-100 text-right text-xs font-semibold text-slate-700">
                                  {matchedUnit?.areaSqFt ? `${matchedUnit.areaSqFt} sq ft` : (item.unit?.areaSqFt ? `${item.unit.areaSqFt} sq ft` : '—')}
                                </td>
                              );
                            }
                            if (colId === 'floor') {
                              return (
                                <td key={colId} style={frozenStyle} className="px-4 py-3.5 border-r border-slate-100 text-xs text-slate-600">
                                  {matchedUnit?.floor || item.unit?.floor || '—'}
                                </td>
                              );
                            }
                            if (colId === 'deposit') {
                              return (
                                <td key={colId} style={frozenStyle} className="px-4 py-3.5 border-r border-slate-100 text-right text-xs font-semibold text-slate-700">
                                  {matchedTenant?.securityDeposit ? formatCurrency(matchedTenant.securityDeposit) : '—'}
                                </td>
                              );
                            }
                            if (colId === 'nextUnpaid') {
                              return (
                                <td key={colId} style={frozenStyle} className="px-4 py-3.5 border-r border-slate-100 text-center text-xs font-semibold text-rose-600">
                                  {item.nextUnpaidMonth && item.nextUnpaidMonth !== 'Up to date' ? formatMonthYear(item.nextUnpaidMonth) : 'Up to date'}
                                </td>
                              );
                            }
                            if (colId === 'totalCollected') {
                              return (
                                <td key={colId} style={frozenStyle} className="px-4 py-3.5 border-r border-slate-100 text-right text-xs font-extrabold text-emerald-700">
                                  {formatCurrency(item.totalAllocated || 0)}
                                </td>
                              );
                            }
                            if (colId === 'createdAt' || colId === 'updatedAt') {
                              return (
                                <td key={colId} style={frozenStyle} className="px-4 py-3.5 border-r border-slate-100 text-xs text-slate-600 whitespace-nowrap">
                                  {item[colId] ? formatDate(item[colId]) : '—'}
                                </td>
                              );
                            }
                             if (colId === 'actions') {
                              const hasEnteredAmount = Boolean(draft.amount && Number(draft.amount) > 0);
                              const existingReceiptForRow = receipts.find(r => 
                                !r.isReversed &&
                                (r.unitId?._id === item.unit?._id || r.unitId === item.unit?._id) &&
                                r.allocations?.some(a => a.rentMonthYear === selectedMonth)
                              );
                              const canSaveRow = hasEnteredAmount || Boolean(existingReceiptForRow);
                              return (
                                <td key={colId} style={frozenStyle} className="px-3 py-3 text-right">
                                  <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
                                    {/* Payment Mode Selector */}
                                    <select
                                      value={draft.paymentMode || 'Cash'}
                                      disabled={savingRows[rowKey]}
                                      onChange={(e) => updateRowDraft(rowKey, { paymentMode: e.target.value }, item)}
                                      className="text-[11px] font-semibold py-1.5 px-2 rounded-lg border border-slate-200 bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer disabled:opacity-50 shrink-0 w-[72px]"
                                      title="Payment Mode"
                                    >
                                      <option value="Cash">Cash</option>
                                      <option value="UPI">UPI</option>
                                      <option value="Bank Transfer">Bank</option>
                                      <option value="Cheque">Cheque</option>
                                    </select>

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

                                    {/* Row Edit Button (Opens Fast Payment / Edit Details Modal) */}
                                    <button
                                      type="button"
                                      onClick={() => openFastPaymentModal(item)}
                                      className="p-1.5 rounded-lg text-slate-500 hover:text-teal-700 hover:bg-teal-50 border border-slate-200 transition-colors shrink-0 shadow-2xs cursor-pointer"
                                      title="Edit Rent Payment & Collection Details"
                                    >
                                      <Edit2 className="w-3.5 h-3.5 text-teal-600" />
                                    </button>

                                    {/* Ledger Eye Button */}
                                    <button
                                      type="button"
                                      onClick={() => setSelectedLedgerModal(item)}
                                      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors shrink-0"
                                      title="View Tenant Ledger & Receipts"
                                    >
                                      <Eye className="w-4 h-4" />
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
                        else if (colId === 'amount') {
                            content = (
                              <div className="text-right">
                                <span className="text-emerald-800 text-xs font-black block font-mono">
                                  {formatCurrency(totalPaidSum)}
                                </span>
                                <span className="text-[10px] text-emerald-600 font-bold block">
                                  Actual Collected
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
                              ['amount', 'monthlyRent', 'outstanding'].includes(colId) ? 'text-right font-mono' : colId === 'index' || colId === 'actions' ? 'text-center' : 'text-left'
                            }`}
                          >
                            {content}
                          </td>
                        );
                      })}
                    </tr>

                    {/* 2A. Property-Wise Expenses Header Divider */}
                    <tr className="bg-amber-100/70 text-amber-950 font-black text-xs border-t-2 border-amber-300 select-none">
                      {visibleSheetColumns.map((colId, colIndex) => {
                        const frozenStyle = getFrozenColumnStyle(colIndex, frozenSheetCount, visibleSheetColumns, columnWidths, false);
                        const width = columnWidths[colId] || DEFAULT_SHEET_COLUMN_WIDTHS[colId] || 120;
                        let content = null;
                        if (colId === 'index') content = <span className="font-mono text-amber-700">P</span>;
                        else if (colId === 'tenant') {
                          content = (
                            <div className="flex items-center justify-between gap-1.5 py-0.5">
                              <div className="flex items-center gap-1.5">
                                <Building2 className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                                <span className="uppercase tracking-wider text-[11px]">2A. Property-Wise Expenses ({propertyExpensesList.length} Properties)</span>
                              </div>
                              <button
                                type="button"
                                onClick={() => openAddExpenseModal('Property')}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-700 hover:bg-amber-800 text-white text-[11px] font-bold shadow-2xs transition-all cursor-pointer shrink-0"
                                title="Add New Property Expense"
                              >
                                <Plus className="w-3 h-3" />
                                <span>Add Expense</span>
                              </button>
                            </div>
                          );
                        } else if (colId === 'amount') {
                          content = <span className="font-mono font-bold text-amber-900">{formatCurrency(totalPropertyExpenses)}</span>;
                        }

                        return (
                          <td
                            key={colId}
                            style={{ ...frozenStyle, width: `${width}px`, minWidth: `${width}px`, maxWidth: `${width}px` }}
                            className={`py-2 px-3 border-r border-amber-200/70 ${colId === 'amount' ? 'text-right' : colId === 'index' ? 'text-center' : 'text-left'}`}
                          >
                            {content}
                          </td>
                        );
                      })}
                    </tr>

                    {/* Property-Wise Expense Rows */}
                    {propertyExpensesList.map((p, idx) => {
                      const isExpanded = !!expandedPropertyExpenses[p.propertyId];
                      const items = p.items || [];
                      const catSummary = Object.keys(p.categories).map(c => `${c}: ${formatCurrency(p.categories[c])}`).join(' · ');

                      return (
                        <React.Fragment key={`prop-exp-${p.propertyId}-${idx}`}>
                          <tr className="bg-white/95 hover:bg-amber-50/50 text-slate-800 text-xs border-b border-slate-100 transition-colors">
                            {visibleSheetColumns.map((colId, colIndex) => {
                              const frozenStyle = getFrozenColumnStyle(colIndex, frozenSheetCount, visibleSheetColumns, columnWidths, false);
                              const width = columnWidths[colId] || DEFAULT_SHEET_COLUMN_WIDTHS[colId] || 120;
                              let content = null;
                              if (colId === 'index') {
                                content = (
                                  <button
                                    type="button"
                                    onClick={() => setExpandedPropertyExpenses(prev => ({ ...prev, [p.propertyId]: !prev[p.propertyId] }))}
                                    className="p-1 rounded text-amber-700 hover:bg-amber-100 transition-colors cursor-pointer"
                                    title={isExpanded ? "Collapse items" : "Expand items"}
                                  >
                                    {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                                  </button>
                                );
                              } else if (colId === 'tenant') {
                                content = (
                                  <div 
                                    className="cursor-pointer"
                                    onClick={() => setExpandedPropertyExpenses(prev => ({ ...prev, [p.propertyId]: !prev[p.propertyId] }))}
                                  >
                                    <div className="flex items-center gap-1.5">
                                      <span className="font-bold text-slate-900 block">{p.propertyName}</span>
                                      <span className="text-[10px] bg-amber-50 text-amber-800 border border-amber-200 px-1.5 py-0.2 rounded-full font-bold">
                                        {items.length} {items.length === 1 ? 'record' : 'records'}
                                      </span>
                                    </div>
                                    <span className="text-[10px] text-slate-500 block truncate" title={catSummary}>
                                      {catSummary}
                                    </span>
                                  </div>
                                );
                              } else if (colId === 'amount') {
                                content = <span className="font-mono font-bold text-rose-600">{formatCurrency(p.total)}</span>;
                              } else if (colId === 'actions') {
                                content = (
                                  <div className="flex items-center justify-end gap-1.5">
                                    {items.length === 1 && (
                                      <button
                                        type="button"
                                        onClick={() => openEditExpenseModal(items[0])}
                                        className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white border border-slate-200 hover:border-amber-400 text-slate-700 hover:text-amber-800 text-[11px] font-bold shadow-2xs transition-all cursor-pointer"
                                        title="Edit Expense Record"
                                      >
                                        <Edit2 className="w-3 h-3 text-amber-600" />
                                        <span>Edit</span>
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => openAddExpenseModal('Property', p.propertyId)}
                                      className="flex items-center gap-0.5 px-2 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-800 text-[11px] font-bold shadow-2xs transition-all cursor-pointer"
                                      title="Add another expense for this property"
                                    >
                                      <Plus className="w-3 h-3 text-amber-700" />
                                      <span>Add</span>
                                    </button>
                                  </div>
                                );
                              }

                              return (
                                <td
                                  key={colId}
                                  style={{ ...frozenStyle, width: `${width}px`, minWidth: `${width}px`, maxWidth: `${width}px` }}
                                  className={`py-2 px-3 border-r border-slate-100 ${colId === 'amount' ? 'text-right' : colId === 'index' || colId === 'actions' ? 'text-center' : 'text-left'}`}
                                >
                                  {content}
                                </td>
                              );
                            })}
                          </tr>

                          {/* Expanded Expense Items for Property */}
                          {isExpanded && items.map((expItem, itemIdx) => (
                            <tr key={`prop-exp-item-${expItem._id || itemIdx}`} className="bg-amber-50/20 hover:bg-amber-50/50 text-[11px] border-b border-amber-100/60 transition-colors">
                              {visibleSheetColumns.map((colId, colIndex) => {
                                const frozenStyle = getFrozenColumnStyle(colIndex, frozenSheetCount, visibleSheetColumns, columnWidths, false);
                                const width = columnWidths[colId] || DEFAULT_SHEET_COLUMN_WIDTHS[colId] || 120;
                                let itemContent = null;
                                if (colId === 'index') itemContent = <span className="text-amber-400 pl-2">↳</span>;
                                else if (colId === 'tenant') {
                                  itemContent = (
                                    <div className="pl-4">
                                      <div className="flex items-center gap-1.5">
                                        <span className="font-bold text-slate-800">{expItem.category}</span>
                                        {expItem.vendorOrPayee && (
                                          <span className="text-slate-400 text-[10px]">· Payee: {expItem.vendorOrPayee}</span>
                                        )}
                                      </div>
                                      <span className="text-slate-500 text-[10px] block truncate">{expItem.description}</span>
                                    </div>
                                  );
                                } else if (colId === 'contractNo' || colId === 'property') {
                                  itemContent = <span className="text-slate-400 text-[10px]">{formatDate(expItem.expenseDate)}</span>;
                                } else if (colId === 'amount') {
                                  itemContent = <span className="font-mono font-bold text-rose-600">{formatCurrency(expItem.amount)}</span>;
                                } else if (colId === 'actions') {
                                  itemContent = (
                                    <div className="flex items-center justify-end gap-1.5">
                                      <button
                                        type="button"
                                        onClick={() => openEditExpenseModal(expItem)}
                                        className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white border border-slate-200 text-slate-700 hover:text-amber-800 hover:border-amber-300 text-[11px] font-bold shadow-2xs transition-all cursor-pointer"
                                        title="Edit Expense Record"
                                      >
                                        <Edit2 className="w-3 h-3 text-amber-600" />
                                        <span>Edit</span>
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteExpense(expItem._id, expItem.category, expItem.amount)}
                                        className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                                        title="Reverse / Remove Expense Record"
                                      >
                                        <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                                      </button>
                                    </div>
                                  );
                                }

                                return (
                                  <td
                                    key={colId}
                                    style={{ ...frozenStyle, width: `${width}px`, minWidth: `${width}px`, maxWidth: `${width}px` }}
                                    className={`py-1.5 px-3 border-r border-amber-100/60 ${colId === 'amount' ? 'text-right' : colId === 'index' || colId === 'actions' ? 'text-center' : 'text-left'}`}
                                  >
                                    {itemContent}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </React.Fragment>
                      );
                    })}

                    {propertyExpensesList.length === 0 && (
                      <tr className="bg-white text-slate-400 text-xs italic border-b border-slate-100">
                        {visibleSheetColumns.map((colId, colIndex) => {
                          const frozenStyle = getFrozenColumnStyle(colIndex, frozenSheetCount, visibleSheetColumns, columnWidths, false);
                          const width = columnWidths[colId] || DEFAULT_SHEET_COLUMN_WIDTHS[colId] || 120;
                          return (
                            <td
                              key={colId}
                              style={{ ...frozenStyle, width: `${width}px`, minWidth: `${width}px`, maxWidth: `${width}px` }}
                              className={`py-2 px-3 border-r border-slate-100 ${colId === 'amount' ? 'text-right font-mono' : 'text-left'}`}
                            >
                              {colId === 'tenant' ? `No property-specific expenses recorded for ${formatMonthYear(selectedMonth)}` : colId === 'amount' ? '₹0' : null}
                            </td>
                          );
                        })}
                      </tr>
                    )}

                    {/* Subtotal Property Expenses */}
                    <tr className="bg-amber-50/60 text-amber-950 font-bold text-xs border-b border-amber-200/80 select-none">
                      {visibleSheetColumns.map((colId, colIndex) => {
                        const frozenStyle = getFrozenColumnStyle(colIndex, frozenSheetCount, visibleSheetColumns, columnWidths, false);
                        const width = columnWidths[colId] || DEFAULT_SHEET_COLUMN_WIDTHS[colId] || 120;
                        let content = null;
                        if (colId === 'tenant') content = <span className="font-extrabold text-[11px] text-amber-900">Subtotal: Property-Wise Expenses</span>;
                        else if (colId === 'amount') content = <span className="font-mono font-black text-amber-950">{formatCurrency(totalPropertyExpenses)}</span>;

                        return (
                          <td
                            key={colId}
                            style={{ ...frozenStyle, width: `${width}px`, minWidth: `${width}px`, maxWidth: `${width}px` }}
                            className={`py-1.5 px-3 border-r border-amber-200/50 ${colId === 'amount' ? 'text-right' : 'text-left'}`}
                          >
                            {content}
                          </td>
                        );
                      })}
                    </tr>

                    {/* 2B. General & Common Expenses Header Divider */}
                    <tr className="bg-purple-100/70 text-purple-950 font-black text-xs border-t-2 border-purple-300 select-none">
                      {visibleSheetColumns.map((colId, colIndex) => {
                        const frozenStyle = getFrozenColumnStyle(colIndex, frozenSheetCount, visibleSheetColumns, columnWidths, false);
                        const width = columnWidths[colId] || DEFAULT_SHEET_COLUMN_WIDTHS[colId] || 120;
                        let content = null;
                        if (colId === 'index') content = <span className="font-mono text-purple-700">C</span>;
                        else if (colId === 'tenant') {
                          content = (
                            <div className="flex items-center justify-between gap-1.5 py-0.5">
                              <div className="flex items-center gap-1.5">
                                <Receipt className="w-3.5 h-3.5 text-purple-700 shrink-0" />
                                <span className="uppercase tracking-wider text-[11px]">2B. General & Common Expenses ({commonExpensesList.length} Categories)</span>
                              </div>
                              <button
                                type="button"
                                onClick={() => openAddExpenseModal('Common')}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-purple-700 hover:bg-purple-800 text-white text-[11px] font-bold shadow-2xs transition-all cursor-pointer shrink-0"
                                title="Add New Common Expense"
                              >
                                <Plus className="w-3 h-3" />
                                <span>Add Expense</span>
                              </button>
                            </div>
                          );
                        } else if (colId === 'amount') {
                          content = <span className="font-mono font-bold text-purple-900">{formatCurrency(totalCommonExpenses)}</span>;
                        }

                        return (
                          <td
                            key={colId}
                            style={{ ...frozenStyle, width: `${width}px`, minWidth: `${width}px`, maxWidth: `${width}px` }}
                            className={`py-2 px-3 border-r border-purple-200/70 ${colId === 'amount' ? 'text-right' : colId === 'index' ? 'text-center' : 'text-left'}`}
                          >
                            {content}
                          </td>
                        );
                      })}
                    </tr>

                    {/* Common Expense Rows */}
                    {commonExpensesList.map((cat, idx) => {
                      const isExpanded = !!expandedCommonExpenses[cat.category];
                      const items = cat.items || [];

                      return (
                        <React.Fragment key={`common-exp-${cat.category}-${idx}`}>
                          <tr className="bg-white/95 hover:bg-purple-50/50 text-slate-800 text-xs border-b border-slate-100 transition-colors">
                            {visibleSheetColumns.map((colId, colIndex) => {
                              const frozenStyle = getFrozenColumnStyle(colIndex, frozenSheetCount, visibleSheetColumns, columnWidths, false);
                              const width = columnWidths[colId] || DEFAULT_SHEET_COLUMN_WIDTHS[colId] || 120;
                              let content = null;
                              if (colId === 'index') {
                                content = (
                                  <button
                                    type="button"
                                    onClick={() => setExpandedCommonExpenses(prev => ({ ...prev, [cat.category]: !prev[cat.category] }))}
                                    className="p-1 rounded text-purple-700 hover:bg-purple-100 transition-colors cursor-pointer"
                                    title={isExpanded ? "Collapse items" : "Expand items"}
                                  >
                                    {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                                  </button>
                                );
                              } else if (colId === 'tenant') {
                                content = (
                                  <div 
                                    className="cursor-pointer"
                                    onClick={() => setExpandedCommonExpenses(prev => ({ ...prev, [cat.category]: !prev[cat.category] }))}
                                  >
                                    <div className="flex items-center gap-1.5">
                                      <span className="font-semibold text-slate-900">Common: {cat.category}</span>
                                      <span className="text-[10px] bg-purple-50 text-purple-800 border border-purple-200 px-1.5 py-0.2 rounded-full font-bold">
                                        {items.length} {items.length === 1 ? 'record' : 'records'}
                                      </span>
                                    </div>
                                  </div>
                                );
                              } else if (colId === 'amount') {
                                content = <span className="font-mono font-bold text-rose-600">{formatCurrency(cat.sum)}</span>;
                              } else if (colId === 'actions') {
                                content = (
                                  <div className="flex items-center justify-end gap-1.5">
                                    {items.length === 1 && (
                                      <button
                                        type="button"
                                        onClick={() => openEditExpenseModal(items[0])}
                                        className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white border border-slate-200 hover:border-purple-400 text-slate-700 hover:text-purple-800 text-[11px] font-bold shadow-2xs transition-all cursor-pointer"
                                        title="Edit Expense Record"
                                      >
                                        <Edit2 className="w-3 h-3 text-purple-600" />
                                        <span>Edit</span>
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => openAddExpenseModal('Common')}
                                      className="flex items-center gap-0.5 px-2 py-1 rounded-lg bg-purple-50 hover:bg-purple-100 border border-purple-200 text-purple-800 text-[11px] font-bold shadow-2xs transition-all cursor-pointer"
                                      title="Add another expense under this category"
                                    >
                                      <Plus className="w-3 h-3 text-purple-700" />
                                      <span>Add</span>
                                    </button>
                                  </div>
                                );
                              }

                              return (
                                <td
                                  key={colId}
                                  style={{ ...frozenStyle, width: `${width}px`, minWidth: `${width}px`, maxWidth: `${width}px` }}
                                  className={`py-2 px-3 border-r border-slate-100 ${colId === 'amount' ? 'text-right' : colId === 'index' || colId === 'actions' ? 'text-center' : 'text-left'}`}
                                >
                                  {content}
                                </td>
                              );
                            })}
                          </tr>

                          {/* Expanded Expense Items for Common Category */}
                          {isExpanded && items.map((expItem, itemIdx) => (
                            <tr key={`common-exp-item-${expItem._id || itemIdx}`} className="bg-purple-50/20 hover:bg-purple-50/50 text-[11px] border-b border-purple-100/60 transition-colors">
                              {visibleSheetColumns.map((colId, colIndex) => {
                                const frozenStyle = getFrozenColumnStyle(colIndex, frozenSheetCount, visibleSheetColumns, columnWidths, false);
                                const width = columnWidths[colId] || DEFAULT_SHEET_COLUMN_WIDTHS[colId] || 120;
                                let itemContent = null;
                                if (colId === 'index') itemContent = <span className="text-purple-400 pl-2">↳</span>;
                                else if (colId === 'tenant') {
                                  itemContent = (
                                    <div className="pl-4">
                                      <div className="flex items-center gap-1.5">
                                        <span className="font-bold text-slate-800">{expItem.description || expItem.category}</span>
                                        {expItem.vendorOrPayee && (
                                          <span className="text-slate-400 text-[10px]">· Payee: {expItem.vendorOrPayee}</span>
                                        )}
                                      </div>
                                    </div>
                                  );
                                } else if (colId === 'contractNo' || colId === 'property') {
                                  itemContent = <span className="text-slate-400 text-[10px]">{formatDate(expItem.expenseDate)}</span>;
                                } else if (colId === 'amount') {
                                  itemContent = <span className="font-mono font-bold text-rose-600">{formatCurrency(expItem.amount)}</span>;
                                } else if (colId === 'actions') {
                                  itemContent = (
                                    <div className="flex items-center justify-end gap-1.5">
                                      <button
                                        type="button"
                                        onClick={() => openEditExpenseModal(expItem)}
                                        className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white border border-slate-200 text-slate-700 hover:text-purple-800 hover:border-purple-300 text-[11px] font-bold shadow-2xs transition-all cursor-pointer"
                                        title="Edit Expense Record"
                                      >
                                        <Edit2 className="w-3 h-3 text-purple-600" />
                                        <span>Edit</span>
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteExpense(expItem._id, expItem.category, expItem.amount)}
                                        className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                                        title="Reverse / Remove Expense Record"
                                      >
                                        <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                                      </button>
                                    </div>
                                  );
                                }

                                return (
                                  <td
                                    key={colId}
                                    style={{ ...frozenStyle, width: `${width}px`, minWidth: `${width}px`, maxWidth: `${width}px` }}
                                    className={`py-1.5 px-3 border-r border-purple-100/60 ${colId === 'amount' ? 'text-right' : colId === 'index' || colId === 'actions' ? 'text-center' : 'text-left'}`}
                                  >
                                    {itemContent}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </React.Fragment>
                      );
                    })}

                    {commonExpensesList.length === 0 && (
                      <tr className="bg-white text-slate-400 text-xs italic border-b border-slate-100">
                        {visibleSheetColumns.map((colId, colIndex) => {
                          const frozenStyle = getFrozenColumnStyle(colIndex, frozenSheetCount, visibleSheetColumns, columnWidths, false);
                          const width = columnWidths[colId] || DEFAULT_SHEET_COLUMN_WIDTHS[colId] || 120;
                          return (
                            <td
                              key={colId}
                              style={{ ...frozenStyle, width: `${width}px`, minWidth: `${width}px`, maxWidth: `${width}px` }}
                              className={`py-2 px-3 border-r border-slate-100 ${colId === 'amount' ? 'text-right font-mono' : 'text-left'}`}
                            >
                              {colId === 'tenant' ? `No general or common expenses recorded for ${formatMonthYear(selectedMonth)}` : colId === 'amount' ? '₹0' : null}
                            </td>
                          );
                        })}
                      </tr>
                    )}

                    {/* Subtotal Common Expenses */}
                    <tr className="bg-purple-50/60 text-purple-950 font-bold text-xs border-b border-purple-200/80 select-none">
                      {visibleSheetColumns.map((colId, colIndex) => {
                        const frozenStyle = getFrozenColumnStyle(colIndex, frozenSheetCount, visibleSheetColumns, columnWidths, false);
                        const width = columnWidths[colId] || DEFAULT_SHEET_COLUMN_WIDTHS[colId] || 120;
                        let content = null;
                        if (colId === 'tenant') content = <span className="font-extrabold text-[11px] text-purple-900">Subtotal: General & Common Expenses</span>;
                        else if (colId === 'amount') content = <span className="font-mono font-black text-purple-950">{formatCurrency(totalCommonExpenses)}</span>;

                        return (
                          <td
                            key={colId}
                            style={{ ...frozenStyle, width: `${width}px`, minWidth: `${width}px`, maxWidth: `${width}px` }}
                            className={`py-1.5 px-3 border-r border-purple-200/50 ${colId === 'amount' ? 'text-right' : 'text-left'}`}
                          >
                            {content}
                          </td>
                        );
                      })}
                    </tr>

                    {/* 2C. Total Expenses Row (Combined: Property + Common) */}
                    <tr className="bg-rose-50/90 text-rose-950 font-black text-xs border-t-2 border-rose-300 select-none shadow-2xs">
                      {visibleSheetColumns.map((colId, colIndex) => {
                        const frozenStyle = getFrozenColumnStyle(colIndex, frozenSheetCount, visibleSheetColumns, columnWidths, false);
                        const width = columnWidths[colId] || DEFAULT_SHEET_COLUMN_WIDTHS[colId] || 120;
                        let content = null;
                        if (colId === 'index') content = <span className="font-mono text-rose-600">Σ</span>;
                        else if (colId === 'tenant') content = <span>Total Expenses ({formatMonthYear(selectedMonth)}: Property + Common)</span>;
                        else if (colId === 'amount') content = <span className="font-mono font-black text-rose-700">{formatCurrency(activeTotalExpenses)}</span>;
                        else if (colId === 'actions') content = <span className="text-[10px] uppercase font-bold text-rose-700 bg-rose-100 px-2 py-0.5 rounded-full">Total Paid</span>;

                        return (
                          <td
                            key={colId}
                            style={{ ...frozenStyle, width: `${width}px`, minWidth: `${width}px`, maxWidth: `${width}px` }}
                            className={`py-2.5 px-3 border-r border-rose-200/60 ${colId === 'amount' ? 'text-right' : colId === 'index' || colId === 'actions' ? 'text-center' : 'text-left'}`}
                          >
                            {content}
                          </td>
                        );
                      })}
                    </tr>

                    {/* 5. Difference Row (Total Earning - Total Expenses) */}
                    <tr className="bg-slate-900 text-white font-black text-xs border-t-2 border-slate-950 select-none shadow-md">
                      {visibleSheetColumns.map((colId, colIndex) => {
                        const frozenStyle = getFrozenColumnStyle(colIndex, frozenSheetCount, visibleSheetColumns, columnWidths, false);
                        const width = columnWidths[colId] || DEFAULT_SHEET_COLUMN_WIDTHS[colId] || 120;
                        let content = null;
                        if (colId === 'index') content = <span className="text-emerald-400 font-bold">Δ</span>;
                        else if (colId === 'tenant') content = <span className="uppercase tracking-wider">Difference (Earnings − Expenses)</span>;
                        else if (colId === 'amount') {
                          content = (
                            <span className={`inline-block px-2.5 py-0.5 rounded-md font-mono font-black ${
                              monthDifference >= 0 ? 'bg-emerald-500 text-slate-950' : 'bg-rose-500 text-white'
                            }`}>
                              {monthDifference >= 0 ? `+ ${formatCurrency(monthDifference)}` : `- ${formatCurrency(Math.abs(monthDifference))}`}
                            </span>
                          );
                        }

                        return (
                          <td
                            key={colId}
                            style={{ ...frozenStyle, width: `${width}px`, minWidth: `${width}px`, maxWidth: `${width}px` }}
                            className={`py-3 px-3 border-r border-slate-800 ${colId === 'amount' ? 'text-right' : colId === 'index' ? 'text-center' : 'text-left'}`}
                          >
                            {content}
                          </td>
                        );
                      })}
                    </tr>

                    {/* 6. Previous Month Balance Row */}
                    <tr className="bg-slate-800 text-slate-200 font-bold text-xs border-t border-slate-700 select-none">
                      {visibleSheetColumns.map((colId, colIndex) => {
                        const frozenStyle = getFrozenColumnStyle(colIndex, frozenSheetCount, visibleSheetColumns, columnWidths, false);
                        const width = columnWidths[colId] || DEFAULT_SHEET_COLUMN_WIDTHS[colId] || 120;
                        let content = null;
                        if (colId === 'index') content = <span className="text-slate-400">⏮</span>;
                        else if (colId === 'tenant') content = <span>Previous Month Balance</span>;
                        else if (colId === 'amount') content = <span className="font-mono font-bold text-amber-300">{formatCurrency(prevMonthBalance)}</span>;

                        return (
                          <td
                            key={colId}
                            style={{ ...frozenStyle, width: `${width}px`, minWidth: `${width}px`, maxWidth: `${width}px` }}
                            className={`py-2.5 px-3 border-r border-slate-700 ${colId === 'amount' ? 'text-right' : colId === 'index' ? 'text-center' : 'text-left'}`}
                          >
                            {content}
                          </td>
                        );
                      })}
                    </tr>

                    {/* 7. Cumulative Row (Previous Balance + Difference) */}
                    <tr className="bg-teal-950 text-white font-black text-xs border-t-2 border-teal-800 select-none shadow-md">
                      {visibleSheetColumns.map((colId, colIndex) => {
                        const frozenStyle = getFrozenColumnStyle(colIndex, frozenSheetCount, visibleSheetColumns, columnWidths, false);
                        const width = columnWidths[colId] || DEFAULT_SHEET_COLUMN_WIDTHS[colId] || 120;
                        let content = null;
                        if (colId === 'index') content = <span className="text-teal-400">⚑</span>;
                        else if (colId === 'tenant') content = <span className="uppercase tracking-wider">Cumulative (Prev Balance + Difference)</span>;
                        else if (colId === 'amount') {
                          content = (
                            <span className={`inline-block px-2.5 py-0.5 rounded-md font-mono font-black ${
                              monthCumulative >= 0 ? 'bg-teal-400 text-slate-950' : 'bg-rose-500 text-white'
                            }`}>
                              {monthCumulative >= 0 ? formatCurrency(monthCumulative) : `- ${formatCurrency(Math.abs(monthCumulative))}`}
                            </span>
                          );
                        }

                        return (
                          <td
                            key={colId}
                            style={{ ...frozenStyle, width: `${width}px`, minWidth: `${width}px`, maxWidth: `${width}px` }}
                            className={`py-3 px-3 border-r border-teal-900 ${colId === 'amount' ? 'text-right' : colId === 'index' ? 'text-center' : 'text-left'}`}
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
              try { localStorage.setItem('cols_payments_receipts', JSON.stringify(cols)); } catch(e){}
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
            primaryAction={
              <div className="flex flex-wrap items-center gap-2">
                {/* Property Filter */}
                <select
                  value={receiptPropertyFilter}
                  onChange={(e) => { setReceiptPropertyFilter(e.target.value); setReceiptCurrentPage(1); }}
                  className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-2xs cursor-pointer"
                >
                  <option value="">All Properties</option>
                  {properties.map(p => (
                    <option key={p._id} value={p._id}>{p.name}</option>
                  ))}
                </select>

                {/* Payment Mode Filter */}
                <select
                  value={receiptModeFilter}
                  onChange={(e) => { setReceiptModeFilter(e.target.value); setReceiptCurrentPage(1); }}
                  className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-2xs cursor-pointer"
                >
                  <option value="">All Payment Modes</option>
                  <option value="Cash">Cash</option>
                  <option value="Cheque">Cheque</option>
                  <option value="Bank Transfer">Bank Transfer</option>
                  <option value="UPI">UPI</option>
                  <option value="Other">Other</option>
                </select>

                {/* Multi-Month Selector with Popover */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowReceiptMonthPicker(prev => !prev)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-bold transition-all shadow-2xs cursor-pointer ${
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
                      const dragProps = getHeaderDragProps(colId, visibleReceiptsColumns, setVisibleReceiptsColumns, 'payments_receipts');
                      const width = receiptsWidths[colId] || DEFAULT_RECEIPTS_COLUMN_WIDTHS[colId] || 100;
                      const frozenStyle = getFrozenColumnStyle(colIndex, frozenReceiptsCount, visibleReceiptsColumns, receiptsWidths, true);
                      let label = colId;
                      let align = 'text-left';
                      if (['totalAmount', 'actions'].includes(colId)) align = 'text-right';
                      if (colId === 'receiptDate') label = 'Date';
                      else if (colId === 'tenant') label = 'Tenant & Sub-Unit';
                      else if (colId === 'monthsCovered') label = 'Rent Month(s)';
                      else if (colId === 'totalAmount') label = 'Total Amount Paid';
                      else if (colId === 'paymentMode') label = 'Mode';
                      else if (colId === 'referenceNumber') label = 'Ref / UTR #';
                      else if (colId === 'bankName') label = 'Bank Name';
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
                        if (colId === 'monthsCovered') {
                          return (
                            <td key={colId} style={frozenStyle} className="px-5 py-4">
                              <span className="inline-flex px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 text-xs font-semibold">
                                {r.monthsCovered || '—'}
                              </span>
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
                        if (colId === 'paymentMode') {
                          return (
                            <td key={colId} style={frozenStyle} className="px-5 py-4 text-slate-600 text-xs">
                              <span className="px-2 py-0.5 rounded-full bg-slate-100 font-semibold text-[11px]">
                                {r.paymentMode || 'Cash'}
                              </span>
                            </td>
                          );
                        }
                        if (colId === 'referenceNumber') {
                          return (
                            <td key={colId} style={frozenStyle} className="px-5 py-4 text-slate-700 text-xs font-mono">
                              {r.referenceNumber || '—'}
                            </td>
                          );
                        }
                        if (colId === 'bankName') {
                          return (
                            <td key={colId} style={frozenStyle} className="px-5 py-4 text-slate-700 text-xs">
                              {r.bankName || '—'}
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

      {/* FAST RECORD / EDIT PAYMENT MODAL */}
      {showPaymentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-3 sm:p-4 animate-scaleUp">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-xl w-full max-h-[92vh] flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-slate-100 shrink-0 bg-white">
              <div>
                <div className="flex items-center gap-2">
                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${
                    editingReceiptId ? 'bg-blue-100 text-blue-800 border border-blue-200' : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                  }`}>
                    {editingReceiptId ? 'Edit Receipt' : 'New Rent Receipt'}
                  </span>
                  <h3 className="text-lg font-black text-slate-900">
                    {editingReceiptId ? 'Edit Payment Receipt' : 'Record Rent Payment'}
                  </h3>
                </div>
                <p className="text-xs text-slate-500 mt-1 flex items-center gap-1.5 font-medium">
                  <strong className="text-slate-800">{selectedTenantInfo?.tenantName}</strong>
                  <span>•</span>
                  <span>{selectedTenantInfo?.propertyName}</span>
                  <span className="text-slate-400">({selectedTenantInfo?.partitionName})</span>
                </p>
              </div>
              <button
                onClick={() => {
                  setShowPaymentModal(false);
                  setEditingReceiptId(null);
                }}
                className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {modalLoading ? (
              <div className="py-20 text-center text-slate-400 text-sm">Loading tenant ledger details...</div>
            ) : (
              <form onSubmit={handleSubmitPayment} className="flex-1 overflow-y-auto p-5 space-y-5">
                {/* TENANT SELECTION & DETAILS */}
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                        <span>Tenant Name</span>
                        <span className="text-rose-500">*</span>
                      </label>
                      <span className="text-[11px] font-semibold text-slate-500">
                        {selectedTenantInfo?.propertyName} • {selectedTenantInfo?.partitionName}
                      </span>
                    </div>
                    <select
                      value={paymentForm.tenantId || ''}
                      onChange={async (e) => {
                        const newTenantId = e.target.value;
                        const chosenTenant = tenants.find(t => t._id === newTenantId);
                        setPaymentForm(f => ({ ...f, tenantId: newTenantId }));
                        setSelectedTenantInfo(prev => ({
                          ...prev,
                          tenantId: newTenantId,
                          tenantName: chosenTenant?.name || prev?.tenantName,
                          tenantPhone: chosenTenant?.phone || ''
                        }));
                        if (newTenantId && selectedTenantInfo?.unitId) {
                          try {
                            const lRes = await API.get(`/payments/tenant-unit-ledger?tenantId=${newTenantId}&unitId=${selectedTenantInfo.unitId}&upToMonthYear=${selectedMonth}`);
                            const breakdown = lRes.data?.data?.monthsBreakdown || [];
                            const unpaid = breakdown.filter(m => m.status === 'Unpaid' || m.status === 'Partially Paid');
                            setUnpaidMonthsList(unpaid);
                          } catch(err) {
                            console.error('Error fetching ledger for new tenant:', err);
                          }
                        }
                      }}
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-xs font-bold text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400 cursor-pointer shadow-2xs"
                    >
                      {tenants.map(t => (
                        <option key={t._id} value={t._id}>
                          {t.name} {t.tenantCode ? `(${t.tenantCode})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-200/60">
                    <div>
                      <span className="text-slate-500 font-medium">Monthly Rent:</span>{' '}
                      <strong className="text-slate-800 font-bold">{formatCurrency(selectedTenantInfo?.monthlyRate || 22000)}</strong>
                    </div>
                    <div>
                      <span className="text-slate-500 font-medium">Paid Up To:</span>{' '}
                      <strong className="text-emerald-700 font-bold">
                        {selectedTenantInfo?.paidTillMonth && selectedTenantInfo?.paidTillMonth !== 'None'
                          ? formatMonthYear(selectedTenantInfo?.paidTillMonth)
                          : 'No prior payments'}
                      </strong>
                    </div>
                  </div>
                </div>

                {/* SECTION 1: Unpaid Months Selection */}
                <div className="space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="text-xs font-black text-slate-800 uppercase tracking-wider block">
                        1. Select Due Month(s) to Settle {unpaidMonthsList.length > 0 && `(${unpaidMonthsList.length} Months Due)`}
                      </span>
                      <span className="text-[11px] text-slate-400">Checked months will be paid</span>
                    </div>

                    {unpaidMonthsList.length > 0 && (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={selectEarliestOnly}
                          className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 transition-all"
                          title="Preselect only the oldest unpaid month"
                        >
                          1 Month Only
                        </button>
                        <button
                          type="button"
                          onClick={selectAllUnpaid}
                          className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-all"
                          title="Select all outstanding months"
                        >
                          Select All
                        </button>
                        <button
                          type="button"
                          onClick={clearMonthSelection}
                          className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-slate-100 hover:bg-rose-50 text-slate-500 hover:text-rose-600 transition-all"
                          title="Clear all selected months"
                        >
                          Clear
                        </button>
                      </div>
                    )}
                  </div>

                  {unpaidMonthsList.length === 0 ? (
                    <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs text-emerald-800 flex items-center gap-2.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>All prior months are completely cleared! You can add an advance month below if paying ahead.</span>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-60 sm:max-h-64 overflow-y-auto pr-1">
                      {unpaidMonthsList.map(m => {
                        const isChecked = !!selectedMonthsMap[m.monthYear];
                        const amount = selectedMonthsMap[m.monthYear] ?? (m.outstandingAmount || m.expectedRate || selectedTenantInfo?.monthlyRate || 22000);

                        return (
                          <div
                            key={m.monthYear}
                            className={`flex items-center justify-between p-3 rounded-2xl border transition-all ${
                              isChecked
                                ? 'bg-emerald-50/70 border-emerald-300 shadow-xs'
                                : 'bg-white border-slate-200 hover:border-slate-300'
                            }`}
                          >
                            <label className="flex items-center gap-3 cursor-pointer flex-1">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => toggleUnpaidMonth(m.monthYear, m.outstandingAmount || m.expectedRate || selectedTenantInfo?.monthlyRate || 22000)}
                                className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500 cursor-pointer"
                              />
                              <div>
                                <p className="font-bold text-slate-800 text-xs">{formatMonthYear(m.monthYear)}</p>
                                <p className="text-[11px] text-slate-400">
                                  Expected: {formatCurrency(m.expectedRate)} • Due: <strong className="text-rose-600">{formatCurrency(m.outstandingAmount)}</strong>
                                </p>
                              </div>
                            </label>

                            {isChecked && (
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs text-slate-400 font-bold">₹</span>
                                <input
                                  type="number"
                                  value={amount}
                                  onChange={(e) => updateMonthAmount(m.monthYear, e.target.value)}
                                  className="w-24 px-2 py-1 rounded-xl border border-slate-200 text-xs font-bold text-slate-800 text-right focus:outline-none focus:ring-2 focus:ring-emerald-400"
                                />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* SECTION 2: Advance Months */}
                <div className="space-y-2 pt-2 border-t border-slate-100">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-black text-slate-800 uppercase tracking-wider">
                      2. Advance / Future Month Selection (Optional)
                    </label>
                    <span className="text-[11px] text-slate-400">e.g. Nov, Dec advance</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="month"
                      value={advanceMonthPicker}
                      onChange={(e) => setAdvanceMonthPicker(e.target.value)}
                      className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400 flex-1 cursor-pointer"
                    />
                    <button
                      type="button"
                      onClick={handleAddAdvanceMonth}
                      disabled={!advanceMonthPicker}
                      className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white text-xs font-bold transition-all shrink-0"
                    >
                      + Add Advance Month
                    </button>
                  </div>

                  {advanceMonthsList.length > 0 && (
                    <div className="space-y-2 pt-1">
                      {advanceMonthsList.map(a => (
                        <div key={a.monthYear} className="flex items-center justify-between p-2.5 bg-blue-50/60 border border-blue-200 rounded-xl text-xs">
                          <div className="flex items-center gap-2">
                            <span className="font-extrabold text-blue-900">{formatMonthYear(a.monthYear)}</span>
                            <span className="text-blue-600 font-semibold">(Advance)</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="flex items-center gap-1">
                              <span className="text-xs text-slate-400 font-bold">₹</span>
                              <input
                                type="number"
                                value={a.amount}
                                onChange={(e) => {
                                  const val = e.target.value === '' ? '' : (Number(e.target.value) || 0);
                                  const updated = advanceMonthsList.map(adv => adv.monthYear === a.monthYear ? { ...adv, amount: val } : adv);
                                  syncPaymentState(selectedMonthsMap, updated);
                                }}
                                className="w-24 px-2 py-1 rounded-xl border border-slate-200 text-xs font-bold text-slate-800 text-right focus:outline-none focus:ring-2 focus:ring-emerald-400"
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRemoveAdvanceMonth(a.monthYear)}
                              className="text-slate-400 hover:text-rose-600 p-1"
                              title="Remove"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* SECTION 3: Payment Details */}
                <div className="space-y-3 pt-2 border-t border-slate-100">
                  <label className="text-xs font-black text-slate-800 uppercase tracking-wider">
                    3. Payment Details & Mode
                  </label>

                  {/* Payment Mode Pills */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-700">
                      Payment Mode <span className="text-rose-500">*</span>
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {['Cash', 'UPI', 'Cheque', 'Bank Transfer'].map(mode => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => setPaymentForm(f => ({ ...f, paymentMode: mode }))}
                          className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all text-center ${
                            paymentForm.paymentMode === mode
                              ? 'bg-slate-900 border-slate-900 text-white shadow-sm'
                              : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                          }`}
                        >
                          {mode === 'Cash' ? '💵 Cash' : mode === 'UPI' ? '📱 UPI' : mode === 'Cheque' ? '📑 Cheque' : '🏦 Bank Transfer'}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    {/* Total Amount Autofilled */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Total Amount Paid (₹) <span className="text-rose-500">*</span>
                      </label>
                      <div className="relative">
                        <span className="absolute left-3 top-2.5 text-slate-400 font-bold text-xs">₹</span>
                        <input
                          type="number"
                          required
                          value={paymentForm.totalAmount}
                          onChange={(e) => handleTotalAmountChange(e.target.value)}
                          placeholder="e.g. 22000"
                          className="w-full pl-7 pr-3 py-2 rounded-xl border border-slate-200 text-sm font-extrabold text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400"
                        />
                      </div>
                      <p className="text-[10px] text-slate-400 mt-0.5">Editable: Type custom amount or select months above</p>
                    </div>

                    {/* Payment Date */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Payment Date <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="date"
                        required
                        value={paymentForm.receiptDate}
                        onChange={(e) => setPaymentForm(f => ({ ...f, receiptDate: e.target.value }))}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400"
                      />
                    </div>

                    {/* Reference / Cheque No */}
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Ref / Transaction / Cheque # (Optional)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. UPI Ref / Cheque No / Bank UTR"
                        value={paymentForm.referenceNumber}
                        onChange={(e) => setPaymentForm(f => ({ ...f, referenceNumber: e.target.value }))}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400"
                      />
                    </div>
                  </div>

                  {/* Notes / Comments with Auto-sync indicator */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-bold text-slate-700">
                        Notes / Comments
                      </label>
                      <span className="text-[10px] text-emerald-600 font-semibold bg-emerald-50 px-2 py-0.5 rounded">
                        Auto-synced with selection
                      </span>
                    </div>
                    <input
                      type="text"
                      placeholder="e.g. Rent collection for March 2026"
                      value={paymentForm.comments}
                      onChange={(e) => setPaymentForm(f => ({ ...f, comments: e.target.value }))}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-medium text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400"
                    />
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setShowPaymentModal(false);
                      setEditingReceiptId(null);
                    }}
                    className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting || Number(paymentForm.totalAmount) <= 0}
                    className={`px-6 py-2.5 rounded-xl text-white text-xs font-extrabold shadow-md active:scale-95 transition-all ${
                      editingReceiptId
                        ? 'bg-blue-600 hover:bg-blue-700 shadow-blue-600/20'
                        : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20'
                    } disabled:opacity-50`}
                  >
                    {submitting
                      ? 'Saving...'
                      : editingReceiptId
                      ? `Update Receipt ₹${Number(paymentForm.totalAmount || 0).toLocaleString('en-IN')}`
                      : `Confirm & Record ₹${Number(paymentForm.totalAmount || 0).toLocaleString('en-IN')} (${paymentForm.paymentMode})`}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* DETAILED LEDGER BREAKDOWN MODAL WITH RECEIPT REVERT & EDIT */}
      {selectedLedgerModal && (() => {
        const tenantReceipts = receipts.filter(r => 
          (r.tenantId?._id || r.tenantId) === selectedLedgerModal.tenant?._id &&
          (r.unitId?._id || r.unitId) === selectedLedgerModal.unit?._id
        );

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-scaleUp">
            <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-xl w-full p-6 max-h-[88vh] flex flex-col">
              <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">
                    {selectedLedgerModal.tenant?.name} — Ledger Breakdown
                  </h3>
                  <p className="text-xs text-slate-500">
                    {selectedLedgerModal.property?.name} • {selectedLedgerModal.unit?.subUnitPartition || selectedLedgerModal.unit?.unitName}
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
                            <div className="flex items-center gap-2">
                              <span className="text-slate-600">{formatDate(r.receiptDate)}</span>
                              <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-extrabold text-[10px]">
                                {formatCurrency(r.totalAmount)}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-500 mt-0.5">
                              {r.monthsCovered || 'Rent'} • <span className="font-medium text-slate-700">{r.paymentMode || 'Cash'}</span>
                            </p>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedLedgerModal(null);
                                openEditReceiptModal(r);
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
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
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

              {/* Property Selector (if Property Expense) */}
              {expenseForm.headType === 'Property' && (
                <div>
                  <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block mb-1">
                    Property *
                  </label>
                  <select
                    value={expenseForm.propertyId}
                    onChange={(e) => setExpenseForm(f => ({ ...f, propertyId: e.target.value }))}
                    required
                    className="w-full px-3 py-2 text-xs font-bold rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 cursor-pointer"
                  >
                    <option value="">Select Property...</option>
                    {properties.map(p => (
                      <option key={p._id} value={p._id}>{p.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Expense Category / Head */}
              <div>
                <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block mb-1">
                  Expense Head / Category *
                </label>
                <select
                  value={expenseForm.category}
                  onChange={(e) => setExpenseForm(f => ({ ...f, category: e.target.value }))}
                  required
                  className="w-full px-3 py-2 text-xs font-bold rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 cursor-pointer"
                >
                  <option value="">Select Category...</option>
                  {expenseCategories
                    .filter(c => !c.headType || c.headType === expenseForm.headType)
                    .map(c => (
                      <option key={c._id || c.name} value={c.name}>{c.name}</option>
                    ))}
                </select>
              </div>

              {/* Amount & Date */}
              <div className="grid grid-cols-2 gap-3">
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
                    className="w-full px-3 py-2 text-xs font-bold rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 font-mono"
                  />
                </div>
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
                    className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 cursor-pointer"
                  />
                </div>
              </div>

              {/* Description / Notes */}
              <div>
                <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block mb-1">
                  Description / Details *
                </label>
                <input
                  type="text"
                  value={expenseForm.description}
                  onChange={(e) => setExpenseForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="e.g. Repairs and property maintenance"
                  required
                  className="w-full px-3 py-2 text-xs font-medium rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              {/* Payee / Vendor & Payment Mode */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block mb-1">
                    Paid To / Vendor
                  </label>
                  <input
                    type="text"
                    value={expenseForm.vendorOrPayee}
                    onChange={(e) => setExpenseForm(f => ({ ...f, vendorOrPayee: e.target.value }))}
                    placeholder="Payee name"
                    className="w-full px-3 py-2 text-xs font-medium rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block mb-1">
                    Payment Mode
                  </label>
                  <select
                    value={expenseForm.paymentMode}
                    onChange={(e) => setExpenseForm(f => ({ ...f, paymentMode: e.target.value }))}
                    className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 cursor-pointer"
                  >
                    <option value="Cash">Cash</option>
                    <option value="Bank Transfer">Bank Transfer</option>
                    <option value="UPI">UPI</option>
                    <option value="Cheque">Cheque</option>
                  </select>
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
