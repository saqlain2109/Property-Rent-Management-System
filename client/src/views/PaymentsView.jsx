import React, { useState, useEffect } from 'react';
import API from '../services/api';
import { formatCurrency, formatDate, formatMonthYear } from '../utils/formatters';
import ColumnManager, { getHeaderDragProps, useResizableColumns, ResizeHandle } from '../components/ColumnManager';
import * as XLSX from 'xlsx';
import { 
  Receipt, Plus, Search, AlertCircle, 
  RotateCcw, CheckCircle2, Eye, Sparkles, Clock, X,
  Edit2, Filter, Layers, ListFilter, Trash2,
  Calendar, ChevronLeft, ChevronRight, Download, Check,
  IndianRupee, ArrowRight, ChevronDown
} from 'lucide-react';

const RENT_SHEET_COLUMNS_DEF = [
  { id: 'index', label: '#', defaultVisible: true },
  { id: 'tenant', label: 'Tenant Details', defaultVisible: true },
  { id: 'property', label: 'Property', defaultVisible: true },
  { id: 'subUnit', label: 'Sub-Unit', defaultVisible: true },
  { id: 'monthlyRent', label: 'Monthly Rent', defaultVisible: true },
  { id: 'outstanding', label: 'Outstanding due', defaultVisible: true },
  { id: 'paidUpTo', label: 'Paid Up To', defaultVisible: true },
  { id: 'paidForMonth', label: 'Paid for Month', defaultVisible: true },
  { id: 'amount', label: 'Amount', defaultVisible: true },
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
  { id: 'totalAmount', label: 'Amount Paid', defaultVisible: true },
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
  totalAmount: 110,
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
  const [activeTab, setActiveTab] = useState('sheet'); // 'sheet' (Excel Grid) | 'receipts'
  
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
  
  const getCurrentMonthYear = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  };

  // Current Selected Rent Month for the Excel Grid (Defaults dynamically to current month)
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonthYear());
  const [customMonthInput, setCustomMonthInput] = useState('');
  
  // Data states
  const [outstandingData, setOutstandingData] = useState([]);
  const [receipts, setReceipts] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [units, setUnits] = useState([]);
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [selectedPropertyFilter, setSelectedPropertyFilter] = useState('');

  // Receipts Register Filters
  const [receiptSearch, setReceiptSearch] = useState('');
  const [receiptPropertyFilter, setReceiptPropertyFilter] = useState('');
  const [receiptModeFilter, setReceiptModeFilter] = useState('');
  const [receiptSelectedMonths, setReceiptSelectedMonths] = useState([]); // array of 'YYYY-MM'
  const [showReceiptMonthPicker, setShowReceiptMonthPicker] = useState(false);

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
    const expectedRate = monthData ? monthData.expectedRate : (item.unit?.monthlyRentExpected || 22000);
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
    const defaultRate = item.unit?.monthlyRentExpected || 22000;
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
      const currentDraft = rowDrafts[rowKey];
      // Ensure existing draft does not target an already paid month
      const payable = getPayableMonthsList(item, selectedMonth);
      const payableSet = new Set(payable.map(p => p.monthYear));
      const validMonths = (currentDraft.selectedMonths || []).filter(m => payableSet.has(m));
      if (validMonths.length > 0 && validMonths.length === (currentDraft.selectedMonths || []).length) {
        return currentDraft;
      }
      if (validMonths.length > 0) {
        return {
          ...currentDraft,
          selectedMonths: validMonths
        };
      }
    }

    const targetInfo = getNextTargetMonth(item, selectedMonth);

    return {
      amount: targetInfo.amount,
      selectedMonths: [targetInfo.targetMonth],
      paymentMode: 'Cash',
      referenceNumber: ''
    };
  };

  const updateRowDraft = (rowKey, patch) => {
    setRowDrafts(prev => ({
      ...prev,
      [rowKey]: {
        ...(prev[rowKey] || {}),
        ...patch
      }
    }));
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
        const defaultRate = item.unit?.monthlyRentExpected || 22000;
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
    // Prevent double submissions immediately
    if (savingRows[rowKey]) return;

    const draft = getRowDraft(item);
    const enteredTotal = Number(draft.amount);

    if (!enteredTotal || enteredTotal <= 0) {
      alert('Please enter a valid amount greater than 0.');
      return;
    }

    const months = draft.selectedMonths && draft.selectedMonths.length > 0 ? draft.selectedMonths : [selectedMonth];

    // Check if any selected month is already fully paid
    const alreadyPaidMonths = months.filter(m => {
      const md = item.monthsBreakdown?.find(b => b.monthYear === m);
      return md && md.allocatedAmount >= md.expectedRate && md.expectedRate > 0;
    });

    if (alreadyPaidMonths.length > 0) {
      const confirmExtra = window.confirm(
        `Rent for ${alreadyPaidMonths.map(formatMonthYear).join(', ')} is ALREADY fully paid.\n\nDo you really want to record an ADDITIONAL payment of ₹${enteredTotal.toLocaleString('en-IN')}?`
      );
      if (!confirmExtra) return;
    }

    // Set saving state immediately to lock the button against fast double-clicks
    setSavingRows(prev => ({ ...prev, [rowKey]: true }));

    const monthlyRate = item.unit?.monthlyRentExpected || item.monthsBreakdown?.[0]?.expectedRate || 22000;

    // Distribute entered amount across selected months
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

    const payload = {
      tenantId: item.tenant?._id,
      unitId: item.unit?._id,
      receiptDate: new Date().toISOString().split('T')[0],
      totalAmount: enteredTotal,
      paymentMode: draft.paymentMode || 'Cash',
      referenceNumber: draft.referenceNumber || '',
      bankName: '',
      comments: `Direct collection for ${months.map(formatMonthYear).join(', ')}`,
      allocations
    };

    try {
      const res = await API.post('/payments', payload);
      if (res.data.success) {
        setSavedFeedback(prev => ({ ...prev, [rowKey]: true }));
        setTimeout(() => {
          setSavedFeedback(prev => ({ ...prev, [rowKey]: false }));
        }, 2500);

        // Clear draft to reset row to fresh state
        setRowDrafts(prev => {
          const copy = { ...prev };
          delete copy[rowKey];
          return copy;
        });
        setOpenMonthPickerRow(null);

        // Refresh data
        await fetchData(selectedMonth);
      }
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
      const [outRes, recRes, tRes, uRes, pRes] = await Promise.all([
        API.get(`/payments/outstanding-summary?upToMonthYear=${targetMonth}`),
        API.get('/payments'),
        API.get('/tenants'),
        API.get('/units'),
        API.get('/properties')
      ]);
      if (outRes.data.success) setOutstandingData(outRes.data.data);
      if (recRes.data.success) setReceipts(recRes.data.data);
      if (tRes.data.success) setTenants(tRes.data.data);
      if (uRes.data.success) setUnits(uRes.data.data);
      if (pRes.data.success) setProperties(pRes.data.data);
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

  // Open Fast Payment Modal for a specific row / tenant
  const openFastPaymentModal = async (item) => {
    setEditingReceiptId(null);
    setModalLoading(true);
    setShowPaymentModal(true);

    const tenantId = item.tenant?._id;
    const unitId = item.unit?._id;
    const monthlyRate = item.unit?.monthlyRentExpected || item.monthsBreakdown?.[0]?.expectedRate || 22000;

    setSelectedTenantInfo({
      tenantId,
      unitId,
      tenantName: item.tenant?.name || 'Tenant',
      tenantPhone: item.tenant?.phone || '',
      propertyName: item.property?.name || '',
      partitionName: item.unit?.subUnitPartition || item.unit?.unitName || '',
      monthlyRate,
      paidTillMonth: item.paidTillMonth
    });

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
      unitId,
      tenantName: receipt.tenantId?.name || 'Tenant',
      tenantPhone: receipt.tenantId?.phone || '',
      propertyName: receipt.unitId?.propertyId?.name || '',
      partitionName: receipt.unitId?.subUnitPartition || receipt.unitId?.unitName || '',
      monthlyRate: receipt.unitId?.monthlyRentExpected || 22000
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
    const amt = earliest.outstandingAmount > 0 ? earliest.outstandingAmount : (earliest.expectedRate || selectedTenantInfo?.monthlyRate || 22000);
    syncPaymentState({ [earliest.monthYear]: amt }, advanceMonthsList);
  };

  // Quick Selection Helper: Select all unpaid months
  const selectAllUnpaid = () => {
    const fullMap = {};
    unpaidMonthsList.forEach(m => {
      fullMap[m.monthYear] = m.outstandingAmount > 0 ? m.outstandingAmount : (m.expectedRate || selectedTenantInfo?.monthlyRate || 22000);
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
    const updated = { ...selectedMonthsMap, [monthYear]: Number(newAmount) || 0 };
    syncPaymentState(updated, advanceMonthsList);
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
          fetchData(selectedMonth);
        }
      } else {
        const res = await API.post('/payments', payload);
        if (res.data.success) {
          setShowPaymentModal(false);
          alert('Payment recorded successfully!');
          fetchData(selectedMonth);
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

  // Excel Export of the Monthly Grid
  const exportSheetToExcel = () => {
    const exportRows = filteredOut.map((item, idx) => {
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
        'Amount Paid': paidThisMonth
      };
    });

    const ws = XLSX.utils.json_to_sheet(exportRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Rent_${selectedMonth}`);
    XLSX.writeFile(wb, `Rent_Collection_Sheet_${selectedMonth}.xlsx`);
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
      // 1. Search Query
      if (receiptSearch) {
        const q = receiptSearch.toLowerCase();
        const tenantMatch = r.tenantId?.name?.toLowerCase().includes(q) || r.tenantId?.phone?.includes(q);
        const propMatch = r.unitId?.propertyId?.name?.toLowerCase().includes(q);
        const unitMatch = (r.unitId?.subUnitPartition || r.unitId?.unitName || '').toLowerCase().includes(q);
        const refMatch = r.referenceNumber?.toLowerCase().includes(q);
        const notesMatch = r.comments?.toLowerCase().includes(q);
        const bankMatch = r.bankName?.toLowerCase().includes(q);
        const modeMatch = r.paymentMode?.toLowerCase().includes(q);
        if (!tenantMatch && !propMatch && !unitMatch && !refMatch && !notesMatch && !bankMatch && !modeMatch) {
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

      return true;
    });
  }, [receipts, receiptSearch, receiptPropertyFilter, receiptModeFilter, receiptSelectedMonths]);

  // Total collected in filtered receipts
  const totalFilteredReceiptsAmount = filteredReceipts.reduce((sum, r) => sum + (Number(r.totalAmount) || 0), 0);

  // Export Filtered Receipts to Excel
  const exportReceiptsToExcel = () => {
    const exportRows = filteredReceipts.map((r, idx) => ({
      '#': idx + 1,
      'Date': formatDate(r.receiptDate),
      'Tenant': r.tenantId?.name || '—',
      'Tenant Phone': r.tenantId?.phone || '—',
      'Property': r.unitId?.propertyId?.name || '—',
      'Sub-Unit': r.unitId?.subUnitPartition || r.unitId?.unitName || '—',
      'Rent Month(s)': r.monthsCovered || '—',
      'Amount Paid (₹)': Number(r.totalAmount) || 0,
      'Payment Mode': r.paymentMode || 'Cash',
      'Ref / UTR #': r.referenceNumber || '—',
      'Bank Name': r.bankName || '—',
      'Notes': r.comments || '—'
    }));

    const ws = XLSX.utils.json_to_sheet(exportRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Receipts_Register');
    XLSX.writeFile(wb, `Payment_Receipts_Register_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  // Filtered rows for Excel Grid, sorted by Property Master displayOrder
  const filteredOut = outstandingData.filter(d => {
    const matchesSearch = !search ||
      d.tenant?.name?.toLowerCase().includes(search.toLowerCase()) ||
      d.property?.name?.toLowerCase().includes(search.toLowerCase()) ||
      (d.unit?.subUnitPartition && d.unit.subUnitPartition.toLowerCase().includes(search.toLowerCase())) ||
      (d.unit?.unitName && d.unit.unitName.toLowerCase().includes(search.toLowerCase()));

    const matchesProp = !selectedPropertyFilter ||
      d.property?._id === selectedPropertyFilter ||
      d.property?.name === selectedPropertyFilter;

    return matchesSearch && matchesProp;
  }).sort((a, b) => {
    // Sort rows by Property Master displayOrder
    const orderA = a.property?.displayOrder ?? 9999;
    const orderB = b.property?.displayOrder ?? 9999;
    if (orderA !== orderB) return orderA - orderB;
    const nameA = a.property?.name || '';
    const nameB = b.property?.name || '';
    if (nameA.localeCompare(nameB) !== 0) return nameA.localeCompare(nameB);
    const unitA = a.unit?.subUnitPartition || a.unit?.unitName || '';
    const unitB = b.unit?.subUnitPartition || b.unit?.unitName || '';
    return unitA.localeCompare(unitB);
  });

  // Calculate summary metrics for selected month
  const totalExpectedSum = filteredOut.reduce((sum, item) => {
    const md = item.monthsBreakdown?.find(m => m.monthYear === selectedMonth);
    return sum + (md ? md.expectedRate : (item.unit?.monthlyRentExpected || 0));
  }, 0);

  const totalPaidSum = filteredOut.reduce((sum, item) => {
    const md = item.monthsBreakdown?.find(m => m.monthYear === selectedMonth);
    return sum + (md ? md.allocatedAmount : 0);
  }, 0);

  const totalOutstandingSum = filteredOut.reduce((sum, item) => {
    return sum + (item.totalOutstanding || 0);
  }, 0);

  const totalTableWidth = visibleSheetColumns.reduce((sum, colId) => {
    return sum + (columnWidths[colId] || DEFAULT_SHEET_COLUMN_WIDTHS[colId] || 120);
  }, 0);

  return (
    <div className="space-y-5">
      {/* Top Header Card */}
      <div className="bg-white p-5 sm:p-6 rounded-2xl shadow-sm border border-slate-200">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-extrabold text-slate-900">Monthly Rent & Payment Tracking</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              Direct editable grid for quick collection, multi-month payments, and instant ledger updates
            </p>
          </div>

          {/* Tab Selector */}
          <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl">
            <button
              onClick={() => setActiveTab('sheet')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
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
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
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

        {/* Top Month Selector & Quick Metrics Bar (replaces old dashboard cards) */}
        <div className="mt-5 pt-4 border-t border-slate-100 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
          {/* Active Month Controller */}
          <div className="flex items-center gap-2 bg-slate-50 p-1.5 rounded-2xl border border-slate-200 shadow-sm">
            <button
              onClick={handlePrevMonth}
              className="p-2 rounded-xl hover:bg-white text-slate-600 hover:text-slate-900 shadow-none hover:shadow-sm transition-all"
              title="Previous Month"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-2 px-3 py-1">
              <Calendar className="w-4 h-4 text-emerald-600 shrink-0" />
              <div className="text-left">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Active Month</span>
                <span className="text-sm font-extrabold text-slate-900">{formatMonthYear(selectedMonth)}</span>
              </div>
            </div>

            <button
              onClick={handleNextMonth}
              className="p-2 rounded-xl hover:bg-white text-slate-600 hover:text-slate-900 shadow-none hover:shadow-sm transition-all"
              title="Next Month"
            >
              <ChevronRight className="w-4 h-4" />
            </button>

            <div className="h-6 w-px bg-slate-200 mx-1" />

            {/* Direct Month Picker */}
            <input
              type="month"
              value={selectedMonth}
              onChange={handleSelectCustomMonth}
              className="text-xs font-semibold px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
              title="Jump to specific month and year"
            />

            <button
              onClick={() => setSelectedMonth(getCurrentMonthYear())}
              className="text-xs font-bold px-3 py-1.5 rounded-xl text-emerald-700 hover:bg-emerald-50 transition-colors"
            >
              Today
            </button>
          </div>

          {/* Compact Overview Badges */}
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 flex items-center gap-2">
              <span className="text-xs text-slate-500 font-medium">Tenancies:</span>
              <span className="text-xs font-bold text-slate-800">{filteredOut.length} units</span>
            </div>
            <div className="px-3.5 py-2 rounded-xl bg-blue-50/60 border border-blue-200/80 flex items-center gap-2">
              <span className="text-xs text-blue-600 font-medium">Expected:</span>
              <span className="text-xs font-bold text-blue-900 font-mono">{formatCurrency(totalExpectedSum)}</span>
            </div>
            <div className="px-3.5 py-2 rounded-xl bg-emerald-50/60 border border-emerald-200/80 flex items-center gap-2">
              <span className="text-xs text-emerald-600 font-medium">Collected:</span>
              <span className="text-xs font-bold text-emerald-800 font-mono">{formatCurrency(totalPaidSum)}</span>
            </div>
            <div className="px-3.5 py-2 rounded-xl bg-rose-50/60 border border-rose-200/80 flex items-center gap-2">
              <span className="text-xs text-rose-600 font-medium">Outstanding:</span>
              <span className="text-xs font-bold text-rose-700 font-mono">{formatCurrency(totalOutstandingSum)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* VIEW 1: EXCEL-TEMPLATE-STYLE GRID */}
      {activeTab === 'sheet' && (
        <div className="space-y-4">
          {/* Action & Filter Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm">
            {/* Search Input */}
            <div className="flex items-center gap-2.5 flex-1 bg-slate-50 px-3.5 py-2 rounded-xl border border-slate-200/80">
              <Search className="w-4 h-4 text-slate-400 shrink-0" />
              <input
                type="text"
                placeholder="Search tenant, property, or partition..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="flex-1 text-xs sm:text-sm bg-transparent border-none focus:outline-none text-slate-800 placeholder:text-slate-400"
              />
              {search && (
                <button onClick={() => setSearch('')} className="text-slate-400 hover:text-slate-600">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Filter Dropdowns */}
            <div className="flex items-center gap-2">
              <select
                value={selectedPropertyFilter}
                onChange={(e) => setSelectedPropertyFilter(e.target.value)}
                className="text-xs font-semibold px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400 cursor-pointer"
              >
                <option value="">All Properties</option>
                {properties.map(p => (
                  <option key={p._id} value={p._id}>{p.name}</option>
                ))}
              </select>

              {/* Excel Export Button */}
              <button
                onClick={exportSheetToExcel}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-all shadow-sm active:scale-95 shrink-0"
                title="Download Excel Sheet"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export Excel</span>
              </button>

              {/* Column Customizer */}
              <ColumnManager
                columns={RENT_SHEET_COLUMNS_DEF}
                visibleColumns={visibleSheetColumns}
                onChangeVisible={setVisibleSheetColumns}
                storageKey="payments_sheet_v5"
                onResetWidths={resetColumnWidths}
              />

              {/* Reset Column Widths */}
              <button
                type="button"
                onClick={resetColumnWidths}
                className="flex items-center gap-1.5 px-2.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-900 text-xs font-bold transition-all shadow-xs shrink-0"
                title="Reset all column widths to default"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span className="hidden xl:inline">Reset Widths</span>
              </button>
            </div>
          </div>

          {/* The Excel Grid Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            {loading ? (
              <div className="py-20 text-center text-slate-400 text-sm">Loading collection sheet for {formatMonthYear(selectedMonth)}...</div>
            ) : filteredOut.length === 0 ? (
              <div className="py-20 text-center text-slate-400 text-sm">No tenant records found matching your filters.</div>
            ) : (
              <div className="overflow-x-auto">
                <table
                  className="w-full text-left text-sm border-collapse table-fixed"
                  style={{ minWidth: `${totalTableWidth}px` }}
                >
                  <colgroup>
                    {visibleSheetColumns.map(colId => (
                      <col
                        key={colId}
                        style={{ width: `${columnWidths[colId] || DEFAULT_SHEET_COLUMN_WIDTHS[colId] || 120}px` }}
                      />
                    ))}
                  </colgroup>
                  <thead className="bg-slate-100/80 border-b border-slate-200 text-[11px] text-slate-600 uppercase tracking-wider font-extrabold select-none">
                    <tr>
                      {visibleSheetColumns.map((colId) => {
                        const dragProps = getHeaderDragProps(colId, visibleSheetColumns, setVisibleSheetColumns, 'payments_sheet_v5');
                        const width = columnWidths[colId] || DEFAULT_SHEET_COLUMN_WIDTHS[colId] || 120;
                        
                        let label = colId;
                        let align = 'text-left';
                        let extraClass = '';
                        
                        if (colId === 'index') { label = '#'; align = 'text-center'; }
                        else if (colId === 'tenant') { label = 'Tenant Details'; }
                        else if (colId === 'property') { label = 'Property'; }
                        else if (colId === 'subUnit') { label = 'Sub-Unit'; }
                        else if (colId === 'monthlyRent') { label = 'Monthly Rent'; align = 'text-right'; }
                        else if (colId === 'outstanding') { label = 'Outstanding'; align = 'text-right'; extraClass = 'bg-rose-50/50 text-rose-900'; }
                        else if (colId === 'paidUpTo') { label = 'Paid Up To'; align = 'text-center'; }
                        else if (colId === 'paidForMonth') { label = 'Month to Pay'; }
                        else if (colId === 'amount') { label = 'Amount'; }
                        else if (colId === 'tenantPhone') { label = 'Tenant Phone'; }
                        else if (colId === 'propertyType') { label = 'Property Type'; }
                        else if (colId === 'subUnitArea') { label = 'Area (Sq Ft)'; align = 'text-right'; }
                        else if (colId === 'floor') { label = 'Floor'; }
                        else if (colId === 'deposit') { label = 'Deposit'; align = 'text-right'; }
                        else if (colId === 'nextUnpaid') { label = 'Next Unpaid'; align = 'text-center'; }
                        else if (colId === 'totalCollected') { label = 'Lifetime Paid'; align = 'text-right'; }
                        else if (colId === 'actions') { label = 'Collection'; align = 'text-right'; }
                        else {
                          const colDef = RENT_SHEET_COLUMNS_DEF.find(c => c.id === colId);
                          if (colDef?.label) label = colDef.label;
                        }

                        return (
                          <th
                            key={colId}
                            {...dragProps}
                            style={{ width: `${width}px` }}
                            className={`px-3 py-3.5 border-r border-slate-200 relative group ${align} ${extraClass}`}
                          >
                            <span className="truncate block font-extrabold text-[11px] text-slate-700 pr-2">
                              {label}
                            </span>
                            <ResizeHandle colId={colId} onResizeStart={handleResizeStart} />
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredOut.map((item, idx) => {
                      const rowKey = getRowKey(item);
                      const draft = getRowDraft(item);
                      const monthData = item.monthsBreakdown?.find(m => m.monthYear === selectedMonth);
                      const expectedRate = monthData ? monthData.expectedRate : (item.unit?.monthlyRentExpected || 22000);
                      const paidThisMonth = monthData ? monthData.allocatedAmount : 0;
                      const outstandingTotal = item.totalOutstanding || 0;
                      const isFullyPaidThisMonth = paidThisMonth >= expectedRate && expectedRate > 0;
                      const isPartial = paidThisMonth > 0 && paidThisMonth < expectedRate;
                      
                      const matchedTenant = tenants.find(t => t._id === item.tenant?._id);
                      const matchedUnit = units.find(u => u._id === item.unit?._id);
                      const matchedProp = properties.find(p => p._id === item.property?._id || p._id === item.unit?.propertyId);

                      return (
                        <tr key={item.assignmentId || idx} className="hover:bg-slate-50/80 transition-colors">
                          {visibleSheetColumns.map((colId) => {
                            if (colId === 'index') {
                              return (
                                <td key={colId} className="px-4 py-3.5 border-r border-slate-100 text-center text-xs text-slate-400 font-mono">
                                  {idx + 1}
                                </td>
                              );
                            }
                            if (colId === 'tenant') {
                              return (
                                <td key={colId} className="px-4 py-3.5 border-r border-slate-100">
                                  <p className="font-bold text-slate-900 text-sm">{item.tenant?.name || 'Unknown'}</p>
                                  <p className="text-slate-400 text-xs mt-0.5">{item.tenant?.phone || '—'}</p>
                                </td>
                              );
                            }
                            if (colId === 'property') {
                              return (
                                <td key={colId} className="px-4 py-3.5 border-r border-slate-100">
                                  <div className="font-semibold text-slate-800 text-xs">
                                    {item.property?.name || '—'}
                                  </div>
                                </td>
                              );
                            }
                            if (colId === 'subUnit') {
                              return (
                                <td key={colId} className="px-4 py-3.5 border-r border-slate-100">
                                  <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-xs font-semibold">
                                    <Layers className="w-3 h-3 text-slate-400" />
                                    <span>{item.unit?.subUnitPartition || item.unit?.unitName || 'Partition'}</span>
                                  </div>
                                  {item.unit?.areaSqFt && <div className="text-[10px] text-slate-400 mt-0.5 font-normal">{item.unit.areaSqFt} sq ft</div>}
                                </td>
                              );
                            }
                            if (colId === 'monthlyRent') {
                              return (
                                <td key={colId} className="px-3 py-3.5 border-r border-slate-100 text-right font-semibold text-slate-700 text-xs font-mono">
                                  {formatCurrency(expectedRate)}
                                </td>
                              );
                            }
                            if (colId === 'outstanding') {
                              return (
                                <td key={colId} className="px-3 py-3.5 border-r border-slate-100 text-right font-extrabold text-xs">
                                  {outstandingTotal > 0 ? (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-black bg-rose-50 text-rose-700 border border-rose-200 font-mono">
                                      {formatCurrency(outstandingTotal)}
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 font-mono">
                                      ₹0 (Clear)
                                    </span>
                                  )}
                                </td>
                              );
                            }
                            if (colId === 'paidUpTo') {
                              return (
                                <td key={colId} className="px-4 py-3.5 border-r border-slate-100 text-center text-xs font-medium text-slate-600">
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
                                <td key={colId} className="px-3 py-3 border-r border-slate-100 relative">
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
                                <td key={colId} className="px-3 py-3 border-r border-slate-100">
                                  <div className="relative flex items-center">
                                    <span className="absolute left-2.5 text-slate-400 text-xs font-semibold">₹</span>
                                    <input
                                      type="number"
                                      value={draft.amount}
                                      disabled={savingRows[rowKey]}
                                      onChange={(e) => updateRowDraft(rowKey, { amount: e.target.value })}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleDirectSaveRow(item);
                                      }}
                                      className="w-full pl-6 pr-2 py-1.5 text-xs font-bold text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 font-mono shadow-xs disabled:bg-slate-100"
                                      placeholder="Amount ₹"
                                      title="Direct editable rent amount. Press Enter to Save."
                                    />
                                  </div>
                                </td>
                              );
                            }
                            if (colId === 'tenantPhone') {
                              return (
                                <td key={colId} className="px-4 py-3.5 border-r border-slate-100 text-xs text-slate-700">
                                  {item.tenant?.phone || matchedTenant?.phone || '—'}
                                </td>
                              );
                            }
                            if (colId === 'propertyType') {
                              return (
                                <td key={colId} className="px-4 py-3.5 border-r border-slate-100 text-xs text-slate-700">
                                  {matchedProp?.type || '—'}
                                </td>
                              );
                            }
                            if (colId === 'subUnitArea') {
                              return (
                                <td key={colId} className="px-4 py-3.5 border-r border-slate-100 text-right text-xs font-semibold text-slate-700">
                                  {matchedUnit?.areaSqFt ? `${matchedUnit.areaSqFt} sq ft` : (item.unit?.areaSqFt ? `${item.unit.areaSqFt} sq ft` : '—')}
                                </td>
                              );
                            }
                            if (colId === 'floor') {
                              return (
                                <td key={colId} className="px-4 py-3.5 border-r border-slate-100 text-xs text-slate-600">
                                  {matchedUnit?.floor || item.unit?.floor || '—'}
                                </td>
                              );
                            }
                            if (colId === 'deposit') {
                              return (
                                <td key={colId} className="px-4 py-3.5 border-r border-slate-100 text-right text-xs font-semibold text-slate-700">
                                  {matchedTenant?.securityDeposit ? formatCurrency(matchedTenant.securityDeposit) : '—'}
                                </td>
                              );
                            }
                            if (colId === 'nextUnpaid') {
                              return (
                                <td key={colId} className="px-4 py-3.5 border-r border-slate-100 text-center text-xs font-semibold text-rose-600">
                                  {item.nextUnpaidMonth && item.nextUnpaidMonth !== 'Up to date' ? formatMonthYear(item.nextUnpaidMonth) : 'Up to date'}
                                </td>
                              );
                            }
                            if (colId === 'totalCollected') {
                              return (
                                <td key={colId} className="px-4 py-3.5 border-r border-slate-100 text-right text-xs font-extrabold text-emerald-700">
                                  {formatCurrency(item.totalAllocated || 0)}
                                </td>
                              );
                            }
                            if (colId === 'createdAt' || colId === 'updatedAt') {
                              return (
                                <td key={colId} className="px-4 py-3.5 border-r border-slate-100 text-xs text-slate-600 whitespace-nowrap">
                                  {item[colId] ? formatDate(item[colId]) : '—'}
                                </td>
                              );
                            }
                             if (colId === 'actions') {
                              const hasEnteredAmount = Boolean(draft.amount && Number(draft.amount) > 0);
                              return (
                                <td key={colId} className="px-3 py-3 text-right">
                                  <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
                                    {/* Payment Mode Selector */}
                                    <select
                                      value={draft.paymentMode || 'Cash'}
                                      disabled={savingRows[rowKey]}
                                      onChange={(e) => updateRowDraft(rowKey, { paymentMode: e.target.value })}
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
                                      disabled={savingRows[rowKey] || (!hasEnteredAmount && !savedFeedback[rowKey])}
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
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* VIEW 2: RECEIPTS REGISTER */}
      {activeTab === 'receipts' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          {/* Header & Main Actions */}
          <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 className="font-extrabold text-slate-900 text-base">Issued Payment Receipts Register</h3>
              <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-2">
                <span>Showing <strong className="text-slate-800">{filteredReceipts.length}</strong> of {receipts.length} receipts</span>
                <span>•</span>
                <span>Total Collected: <strong className="text-emerald-700 font-extrabold">{formatCurrency(totalFilteredReceiptsAmount)}</strong></span>
              </p>
            </div>
            
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={exportReceiptsToExcel}
                disabled={filteredReceipts.length === 0}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 text-xs font-bold transition-all shadow-xs disabled:opacity-40"
                title="Download filtered receipts list as Excel (.xlsx)"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export to Excel</span>
              </button>

              <ColumnManager
                columns={RECEIPTS_COLUMNS_DEF}
                visibleColumns={visibleReceiptsColumns}
                onChangeVisible={setVisibleReceiptsColumns}
                storageKey="payments_receipts"
                onResetWidths={resetReceiptsWidths}
              />
              <button
                type="button"
                onClick={resetReceiptsWidths}
                className="flex items-center gap-1.5 px-2.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-900 text-xs font-bold transition-all shadow-xs"
                title="Reset column widths"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Reset Widths</span>
              </button>
            </div>
          </div>

          {/* Interactive Filters Bar (Search, Property, Mode, Multi-Month) */}
          <div className="p-3.5 bg-slate-50/80 border-b border-slate-200 flex flex-wrap items-center gap-3">
            {/* Search Input */}
            <div className="relative flex-1 min-w-[200px] sm:min-w-[240px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search tenant, property, partition, ref #, notes..."
                value={receiptSearch}
                onChange={(e) => setReceiptSearch(e.target.value)}
                className="w-full pl-9 pr-8 py-2 rounded-xl border border-slate-200 text-xs font-medium text-slate-800 bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 shadow-2xs"
              />
              {receiptSearch && (
                <button
                  type="button"
                  onClick={() => setReceiptSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Property Filter */}
            <select
              value={receiptPropertyFilter}
              onChange={(e) => setReceiptPropertyFilter(e.target.value)}
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
              onChange={(e) => setReceiptModeFilter(e.target.value)}
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
                          onClick={() => setReceiptSelectedMonths([])}
                          className="text-[11px] font-bold text-rose-600 hover:underline"
                        >
                          Clear
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setShowReceiptMonthPicker(false)}
                        className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
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
                        onClick={() => setReceiptSelectedMonths([])}
                        className="font-bold text-slate-500 hover:text-slate-800"
                      >
                        Show All
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Clear All Active Filters Button */}
            {(receiptSearch || receiptPropertyFilter || receiptModeFilter || receiptSelectedMonths.length > 0) && (
              <button
                type="button"
                onClick={() => {
                  setReceiptSearch('');
                  setReceiptPropertyFilter('');
                  setReceiptModeFilter('');
                  setReceiptSelectedMonths([]);
                }}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold text-rose-600 hover:bg-rose-50 border border-rose-200 transition-colors"
                title="Reset all search filters"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset Filters</span>
              </button>
            )}
          </div>

          {receipts.length === 0 ? (
            <div className="py-16 text-center text-slate-400 text-sm">No payment receipts found.</div>
          ) : (
            <div className="overflow-x-auto">
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
                <thead className="bg-slate-50 border-b border-slate-200 text-[11px] text-slate-500 uppercase tracking-wide font-extrabold select-none">
                  <tr>
                    {visibleReceiptsColumns.map(colId => {
                      const dragProps = getHeaderDragProps(colId, visibleReceiptsColumns, setVisibleReceiptsColumns, 'payments_receipts');
                      const width = receiptsWidths[colId] || DEFAULT_RECEIPTS_COLUMN_WIDTHS[colId] || 100;
                      let label = colId;
                      let align = 'text-left';
                      if (['totalAmount', 'actions'].includes(colId)) align = 'text-right';
                      if (colId === 'receiptDate') label = 'Date';
                      else if (colId === 'tenant') label = 'Tenant & Sub-Unit';
                      else if (colId === 'monthsCovered') label = 'Rent Month(s)';
                      else if (colId === 'totalAmount') label = 'Amount Paid';
                      else if (colId === 'paymentMode') label = 'Mode';
                      else if (colId === 'referenceNumber') label = 'Ref / UTR #';
                      else if (colId === 'bankName') label = 'Bank Name';
                      else if (colId === 'comments') label = 'Notes';
                      else if (colId === 'tenantPhone') label = 'Tenant Phone';
                      else if (colId === 'propertyName') label = 'Property';
                      else if (colId === 'subUnitName') label = 'Sub-Unit';
                      else if (colId === 'actions') label = 'Actions';
                      else {
                        const colDef = RECEIPTS_COLUMNS_DEF.find(c => c.id === colId);
                        if (colDef?.label) label = colDef.label;
                      }

                      return (
                        <th
                          key={colId}
                          {...dragProps}
                          style={{ width: `${width}px` }}
                          className={`px-4 py-3.5 border-r border-slate-200 relative group ${align}`}
                        >
                          <span className="truncate block pr-2 font-extrabold text-[11px] text-slate-700">{label}</span>
                          <ResizeHandle colId={colId} onResizeStart={handleReceiptsResizeStart} />
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredReceipts.length === 0 ? (
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
                          }}
                          className="text-xs font-bold text-emerald-600 hover:underline mt-1"
                        >
                          Reset Filters to view all {receipts.length} receipts
                        </button>
                      </td>
                    </tr>
                  ) : (
                    filteredReceipts.map(r => (
                    <tr key={r._id} className="hover:bg-slate-50/70 transition-colors">
                      {visibleReceiptsColumns.map(colId => {
                        if (colId === 'receiptDate') {
                          return (
                            <td key={colId} className="px-5 py-4 text-slate-600 text-xs">
                              {formatDate(r.receiptDate)}
                            </td>
                          );
                        }
                        if (colId === 'createdAt' || colId === 'updatedAt') {
                          return (
                            <td key={colId} className="px-5 py-4 text-slate-600 text-xs whitespace-nowrap">
                              {r[colId] ? formatDate(r[colId]) : '—'}
                            </td>
                          );
                        }
                        if (colId === 'tenant') {
                          return (
                            <td key={colId} className="px-5 py-4">
                              <p className="font-bold text-slate-800 text-xs">{r.tenantId?.name || '—'}</p>
                              <p className="text-slate-400 text-[11px]">
                                {r.unitId?.propertyId?.name} • {r.unitId?.subUnitPartition || r.unitId?.unitName || '—'}
                              </p>
                            </td>
                          );
                        }
                        if (colId === 'monthsCovered') {
                          return (
                            <td key={colId} className="px-5 py-4">
                              <span className="inline-flex px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 text-xs font-semibold">
                                {r.monthsCovered || '—'}
                              </span>
                            </td>
                          );
                        }
                        if (colId === 'totalAmount') {
                          return (
                            <td key={colId} className="px-5 py-4 text-right font-extrabold text-emerald-700 text-xs">
                              {formatCurrency(r.totalAmount)}
                            </td>
                          );
                        }
                        if (colId === 'paymentMode') {
                          return (
                            <td key={colId} className="px-5 py-4 text-slate-600 text-xs">
                              <span className="px-2 py-0.5 rounded-full bg-slate-100 font-semibold text-[11px]">
                                {r.paymentMode || 'Cash'}
                              </span>
                            </td>
                          );
                        }
                        if (colId === 'referenceNumber') {
                          return (
                            <td key={colId} className="px-5 py-4 text-slate-700 text-xs font-mono">
                              {r.referenceNumber || '—'}
                            </td>
                          );
                        }
                        if (colId === 'bankName') {
                          return (
                            <td key={colId} className="px-5 py-4 text-slate-700 text-xs">
                              {r.bankName || '—'}
                            </td>
                          );
                        }
                        if (colId === 'comments') {
                          return (
                            <td key={colId} className="px-5 py-4 text-slate-600 text-xs max-w-xs truncate" title={r.comments}>
                              {r.comments || '—'}
                            </td>
                          );
                        }
                        if (colId === 'tenantPhone') {
                          return (
                            <td key={colId} className="px-5 py-4 text-slate-600 text-xs">
                              {r.tenantId?.phone || '—'}
                            </td>
                          );
                        }
                        if (colId === 'propertyName') {
                          return (
                            <td key={colId} className="px-5 py-4 text-slate-800 font-semibold text-xs">
                              {r.unitId?.propertyId?.name || '—'}
                            </td>
                          );
                        }
                        if (colId === 'subUnitName') {
                          return (
                            <td key={colId} className="px-5 py-4 text-slate-700 text-xs">
                              {r.unitId?.subUnitPartition || r.unitId?.unitName || '—'}
                            </td>
                          );
                        }
                        if (colId === 'actions') {
                          return (
                            <td key={colId} className="px-5 py-4 text-right">
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
          )}
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
                {/* Monthly Rate & Paid Up To banner */}
                <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 flex items-center justify-between text-xs">
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
                            <span className="font-bold text-slate-800">{formatCurrency(a.amount)}</span>
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
                          onChange={(e) => setPaymentForm(f => ({ ...f, totalAmount: e.target.value }))}
                          placeholder="e.g. 22000"
                          className="w-full pl-7 pr-3 py-2 rounded-xl border border-slate-200 text-sm font-extrabold text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400"
                        />
                      </div>
                      <p className="text-[10px] text-slate-400 mt-0.5">Autofilled based on checked months</p>
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
    </div>
  );
}
