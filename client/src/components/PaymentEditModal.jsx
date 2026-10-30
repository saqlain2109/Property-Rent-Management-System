import React, { useState, useEffect, useRef } from 'react';
import API from '../services/api';
import { formatCurrency, formatDate, formatMonthYear } from '../utils/formatters';
import { useModalBackHandler } from '../utils/useModalBackHandler';
import { 
  ChevronLeft, Check, Plus, X, CheckCircle2, 
  AlertCircle, ExternalLink, RefreshCw, Trash2,
  RotateCcw, GripVertical
} from 'lucide-react';

const getCurrentMonthYear = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

export default function PaymentEditModal({
  isOpen,
  onClose,
  receiptId = null,
  receipt = null,
  item = null,
  selectedMonth: propSelectedMonth = '',
  tenants: propTenants = null,
  assignments: propAssignments = null,
  onSuccess,
  backButtonLabel = 'Back',
  onNavigateToPayments = null
}) {
  const activeMonth = (receipt?.accountingMonth) || (receipt?.receiptDate ? String(receipt.receiptDate).slice(0, 7) : '') || propSelectedMonth || getCurrentMonthYear();

  useModalBackHandler(isOpen, onClose);

  const [modalLoading, setModalLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Customizable Form Sections Layout
  const [columnOrder, setColumnOrder] = useState(() => {
    try {
      const saved = localStorage.getItem('payment_modal_column_order');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length === 3) return parsed;
      }
    } catch {}
    return ['occupancy', 'financials', 'dueMonths'];
  });

  const [draggedCol, setDraggedCol] = useState(null);
  const [dragOverCol, setDragOverCol] = useState(null);

  const handleColDragStart = (e, colId) => {
    setDraggedCol(colId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleColDragOver = (e, colId) => {
    e.preventDefault();
    if (colId !== dragOverCol) setDragOverCol(colId);
  };

  const handleColDrop = (e, targetColId) => {
    e.preventDefault();
    if (!draggedCol || draggedCol === targetColId) {
      setDraggedCol(null);
      setDragOverCol(null);
      return;
    }
    const current = [...columnOrder];
    const fromIdx = current.indexOf(draggedCol);
    const toIdx = current.indexOf(targetColId);
    if (fromIdx !== -1 && toIdx !== -1) {
      current.splice(fromIdx, 1);
      current.splice(toIdx, 0, draggedCol);
      setColumnOrder(current);
      try {
        localStorage.setItem('payment_modal_column_order', JSON.stringify(current));
      } catch {}
    }
    setDraggedCol(null);
    setDragOverCol(null);
  };

  const resetColumnOrder = () => {
    setColumnOrder(['occupancy', 'financials', 'dueMonths']);
    try {
      localStorage.removeItem('payment_modal_column_order');
    } catch {}
  };

  // Lists
  const [tenantsList, setTenantsList] = useState(propTenants || []);
  const [assignmentsList, setAssignmentsList] = useState(propAssignments || []);

  // Form State
  const [currentReceiptId, setCurrentReceiptId] = useState(null);
  const [selectedTenantInfo, setSelectedTenantInfo] = useState(null);
  const [unpaidMonthsList, setUnpaidMonthsList] = useState([]);
  const [selectedMonthsMap, setSelectedMonthsMap] = useState({});
  const [showAddAdvancePicker, setShowAddAdvancePicker] = useState(false);
  const [advancePickerMonth, setAdvancePickerMonth] = useState('');

  const [paymentForm, setPaymentForm] = useState({
    status: 'Rented',
    tenantId: '',
    unitId: '',
    contractNo: '',
    receiptNumber: '',
    receiptDate: new Date().toISOString().split('T')[0],
    accountingMonth: activeMonth,
    rentAmount: '',
    depositAmount: '',
    totalAmount: '',
    comments: '',
    adjustmentAmount: '',
    adjustmentDescription: ''
  });

  // Resolve contract number based on tenant, unit, and the target rent month
  const resolveContractForTargetMonth = (tId, uId, targetMonth, assList = assignmentsList) => {
    if (!tId || !uId || !assList || assList.length === 0) return '';
    const tStr = String(tId?._id || tId);
    const uStr = String(uId?._id || uId);
    const matches = assList.filter(c => {
      const cTId = String(c.tenantId?._id || c.tenantId || '');
      const cUId = String(c.unitId?._id || c.unitId || '');
      if (cTId !== tStr || cUId !== uStr) return false;
      if (!targetMonth) return true;
      const sMonth = c.startDate ? (typeof c.startDate === 'string' ? c.startDate.slice(0, 7) : new Date(c.startDate).toISOString().slice(0, 7)) : null;
      const eMonth = c.endDate ? (typeof c.endDate === 'string' ? c.endDate.slice(0, 7) : new Date(c.endDate).toISOString().slice(0, 7)) : null;
      if (sMonth && sMonth > targetMonth) return false;
      if (eMonth && eMonth < targetMonth) return false;
      return true;
    });
    if (matches.length > 0) {
      return matches[0].contractNo || matches[0].assignmentCode || '';
    }
    return '';
  };

  // Sync selected months, rent amount, deposit amount, total amount and dynamic comments
  const syncPaymentState = (newSelectedMap, tenantId, unitId) => {
    setSelectedMonthsMap(newSelectedMap);

    const rentTotal = Object.values(newSelectedMap).reduce((s, v) => s + Number(v || 0), 0);
    const activeMonths = Object.keys(newSelectedMap).sort();

    let autoComment = '';
    if (activeMonths.length > 0) {
      autoComment = `Rent collection for ${activeMonths.map(formatMonthYear).join(', ')}`;
    }

    setPaymentForm(prev => {
      const depNum = Number(prev.depositAmount) || 0;
      const combinedTotal = rentTotal + depNum;
      const updated = {
        ...prev,
        rentAmount: String(rentTotal),
        totalAmount: String(combinedTotal),
        comments: (!prev.comments || prev.comments.startsWith('Rent collection for') || prev.comments.startsWith('Rent payment for')) ? autoComment : prev.comments
      };
      if (tenantId !== undefined) updated.tenantId = tenantId;
      if (unitId !== undefined) updated.unitId = unitId;

      if (tenantId && unitId && !prev.contractNo) {
        const targetMonth = activeMonths[0] || activeMonth;
        const matched = resolveContractForTargetMonth(tenantId, unitId, targetMonth);
        if (matched) updated.contractNo = matched;
      }
      return updated;
    });
  };

  // Load initial dependencies & data whenever modal opens
  useEffect(() => {
    if (!isOpen) return;

    setErrorMsg('');
    setModalLoading(true);

    const init = async () => {
      try {
        let curTenants = propTenants;
        let curAssignments = propAssignments;

        // Fetch tenants if not passed
        if (!curTenants || curTenants.length === 0) {
          const tRes = await API.get('/tenants');
          if (tRes.data.success) {
            curTenants = tRes.data.data;
            setTenantsList(curTenants);
          }
        } else {
          setTenantsList(curTenants);
        }

        // Fetch assignments if not passed
        if (!curAssignments || curAssignments.length === 0) {
          const aRes = await API.get('/assignments');
          if (aRes.data.success) {
            curAssignments = aRes.data.data;
            setAssignmentsList(curAssignments);
          }
        } else {
          setAssignmentsList(curAssignments);
        }

        // Strict Single Receipt Lookup: Priority: receiptId prop > receipt prop
        let targetReceiptId = receiptId || receipt?._id || receipt?.receiptId || null;
        let recData = receipt || null;

        // If targetReceiptId exists, fetch single receipt first to guarantee full, fresh data
        if (targetReceiptId) {
          try {
            const recRes = await API.get(`/payments/${targetReceiptId}`);
            if (recRes.data?.success && recRes.data.data) {
              recData = recRes.data.data;
            }
          } catch (err) {
            console.warn('Could not fetch single receipt via /payments/:id, using fallback receipt prop', err);
          }
        }

        const initialUnitObj = recData?.unitId || item?.unit || receipt?.unitId || receipt?.unit;
        const initialUnitId = initialUnitObj?._id || (typeof initialUnitObj === 'string' ? initialUnitObj : null);

        // If targetReceiptId not passed directly, query payments for this unit and month
        if (!targetReceiptId && initialUnitId) {
          try {
            const checkRes = await API.get(`/payments?unitId=${initialUnitId}`);
            if (checkRes.data?.success && Array.isArray(checkRes.data.data)) {
              const matched = checkRes.data.data.find(r => 
                !r.isReversed &&
                (r.accountingMonth === activeMonth || 
                 (r.monthPaidFor && r.monthPaidFor.includes(activeMonth)) ||
                 r.allocations?.some(a => a.rentMonthYear === activeMonth))
              );
              if (matched) {
                targetReceiptId = matched._id;
                try {
                  const singleRes = await API.get(`/payments/${targetReceiptId}`);
                  if (singleRes.data?.success && singleRes.data.data) {
                    recData = singleRes.data.data;
                  } else {
                    recData = matched;
                  }
                } catch {
                  recData = matched;
                }
              }
            }
          } catch (cErr) {
            console.warn('Could not check existing receipt via API:', cErr);
          }
        }

        setCurrentReceiptId(targetReceiptId || null);

        const effectiveMonth = recData?.accountingMonth || activeMonth;

        // Resolve unit, tenant and contract identifiers with full fallback cascade
        const tenantObj = recData?.tenantId || recData?.tenant || item?.tenant || receipt?.tenantId || receipt?.tenant;
        const unitObj = recData?.unitId || recData?.unit || item?.unit || receipt?.unitId || receipt?.unit;
        let tenantId = tenantObj?._id || (typeof tenantObj === 'string' ? tenantObj : null);
        let unitId = unitObj?._id || (typeof unitObj === 'string' ? unitObj : null);

        const savedTargetTenant = localStorage.getItem('payments_target_tenant_id') || localStorage.getItem('payments_tenant_filter');
        if (!tenantId && savedTargetTenant) {
          tenantId = savedTargetTenant;
        }

        const savedTargetContract = localStorage.getItem('payments_target_contract_no');
        const resolvedContractNo = recData?.contractNo || item?.contractNo || receipt?.contractNo || savedTargetContract || '';

        // Fallback: match contractNo against assignments if tenantId or unitId is missing
        if ((!tenantId || !unitId) && resolvedContractNo && curAssignments && curAssignments.length > 0) {
          const matchedAss = curAssignments.find(a => (a.contractNo || '').trim().toLowerCase() === resolvedContractNo.trim().toLowerCase());
          if (matchedAss) {
            if (!tenantId) tenantId = matchedAss.tenantId?._id || (typeof matchedAss.tenantId === 'string' ? matchedAss.tenantId : null);
            if (!unitId) unitId = matchedAss.unitId?._id || (typeof matchedAss.unitId === 'string' ? matchedAss.unitId : null);
          }
        }

        // Active contract lookup
        const activeContract = resolvedContractNo || resolveContractForTargetMonth(tenantId, unitId, effectiveMonth, curAssignments) || '';

        // Find assignment object for contract details: prioritize exact activeContract
        let assignmentObj = null;
        if (activeContract) {
          assignmentObj = (curAssignments || []).find(a => 
            (a.contractNo || '').trim().toLowerCase() === activeContract.trim().toLowerCase()
          );
        }
        if (!assignmentObj && unitId && tenantId) {
          const tIdStr = String(tenantId?._id || tenantId);
          const uIdStr = String(unitId?._id || unitId);
          assignmentObj = (curAssignments || []).find(a => {
            if (String(a.unitId?._id || a.unitId) !== uIdStr || String(a.tenantId?._id || a.tenantId) !== tIdStr) return false;
            const sMonth = a.startDate ? (typeof a.startDate === 'string' ? a.startDate.slice(0, 7) : new Date(a.startDate).toISOString().slice(0, 7)) : null;
            const eMonth = a.endDate ? (typeof a.endDate === 'string' ? a.endDate.slice(0, 7) : new Date(a.endDate).toISOString().slice(0, 7)) : null;
            if (sMonth && sMonth > effectiveMonth) return false;
            if (eMonth && eMonth < effectiveMonth) return false;
            return true;
          }) || (curAssignments || []).find(a => 
            String(a.unitId?._id || a.unitId) === uIdStr && 
            String(a.tenantId?._id || a.tenantId) === tIdStr &&
            a.status === 'Active'
          ) || (curAssignments || []).find(a => 
            String(a.unitId?._id || a.unitId) === uIdStr && 
            String(a.tenantId?._id || a.tenantId) === tIdStr
          );
        }

        // If tenantId is still missing, recover from matched assignment
        if (!tenantId && assignmentObj?.tenantId) {
          tenantId = assignmentObj.tenantId?._id || (typeof assignmentObj.tenantId === 'string' ? assignmentObj.tenantId : null);
        }

        // Resolve tenant name and phone: check curTenants list
        const matchedTenant = (curTenants || []).find(t => String(t._id) === String(tenantId));
        const tenantName = (typeof tenantObj === 'object' && tenantObj?.name) 
          ? tenantObj.name 
          : (matchedTenant?.name || item?.tenant?.name || 'Tenant');
        const tenantPhone = (typeof tenantObj === 'object' && tenantObj?.phone) 
          ? tenantObj.phone 
          : (matchedTenant?.phone || '');

        const propName = recData?.unitId?.propertyId?.name || recData?.propertyId?.name || assignmentObj?.propertyId?.name || assignmentObj?.unitId?.propertyId?.name || item?.property?.name || unitObj?.propertyId?.name || receipt?.property?.name || 'Property';
        const partName = recData?.unitId?.subUnitPartition || recData?.unitId?.unitName || assignmentObj?.unitId?.subUnitPartition || assignmentObj?.unitId?.unitName || item?.unit?.subUnitPartition || item?.unit?.unitName || unitObj?.subUnitPartition || unitObj?.unitName || receipt?.partitionName || 'Unit';

        // Target month for determining rent rate (first preference: month paid for, else effective accounting month)
        const primaryPaidMonth = (recData?.monthPaidFor ? String(recData.monthPaidFor).split(',')[0].trim() : '') || effectiveMonth;

        // 1. Resolve contract rate from rateHistory or agreement
        let contractRate = null;
        if (assignmentObj?.rateHistory && Array.isArray(assignmentObj.rateHistory) && assignmentObj.rateHistory.length > 0) {
          const matchedHist = assignmentObj.rateHistory.find(r => {
            const sM = r.effectiveFrom ? (typeof r.effectiveFrom === 'string' ? r.effectiveFrom.slice(0, 7) : new Date(r.effectiveFrom).toISOString().slice(0, 7)) : '0000-00';
            const eM = r.effectiveTo ? (typeof r.effectiveTo === 'string' ? r.effectiveTo.slice(0, 7) : new Date(r.effectiveTo).toISOString().slice(0, 7)) : '9999-99';
            return primaryPaidMonth >= sM && primaryPaidMonth <= eM;
          });
          if (matchedHist && Number(matchedHist.monthlyRate) > 0) {
            contractRate = Number(matchedHist.monthlyRate);
          }
        }
        if (!contractRate && assignmentObj) {
          contractRate = Number(
            assignmentObj.currentAgreement?.monthlyRate ??
            assignmentObj.currentMonthlyRate ??
            assignmentObj.monthlyRent ??
            assignmentObj.rentAmount ??
            0
          ) || null;
        }

        // 2. Caller / report passed expected rate
        const savedTargetRent = Number(localStorage.getItem('payments_target_monthly_rent')) || null;
        const passedExpectedRate = savedTargetRent || Number(
          item?.monthlyRentExpected ??
          receipt?.monthlyRentExpected ??
          recData?.monthlyRentExpected ??
          0
        ) || null;

        // 3. Fallback unit base rate
        const fallbackUnitRate = Number(
          recData?.unitId?.monthlyRentExpected ??
          unitObj?.monthlyRentExpected ??
          assignmentObj?.unitId?.monthlyRentExpected ??
          22000
        ) || 22000;

        // Contract rate and passed rate take precedence over base unit rate
        let monthlyRate = contractRate || passedExpectedRate || (recData?.rentAmount && Number(recData.rentAmount) > 0 ? Number(recData.rentAmount) : null) || fallbackUnitRate;

        setSelectedTenantInfo({
          tenantId,
          initialTenantId: tenantId,
          unitId,
          assignmentId: assignmentObj?._id || null,
          receiptNumber: recData?.receiptNumber || '',
          tenantName,
          tenantPhone,
          propertyName: propName,
          partitionName: partName,
          monthlyRate,
          contractStartDate: recData?.contractStartDate || assignmentObj?.startDate || item?.startDate || null,
          contractEndDate: recData?.contractEndDate || assignmentObj?.endDate || item?.endDate || null,
          paidTillMonth: item?.paidTillMonth
        });

        // Determine recorded amounts: Rent Amount Paid, Deposit Amount, Total Amount Paid
        let recTotal = 0;
        let recDep = 0;
        let recRent = 0;

        if (recData && (recData._id || recData.totalAmount !== undefined)) {
          recTotal = Number(recData.totalAmount !== undefined ? recData.totalAmount : (recData.receiptTotalAmount || 0));
          recDep = recData.depositAmount !== undefined ? Number(recData.depositAmount) : 0;
          recRent = recData.rentAmount !== undefined ? Number(recData.rentAmount) : (recTotal - recDep);
        } else if (item && (item.rentAmountPaid !== undefined || item.actualPaidForMonth !== undefined)) {
          recRent = item.rentAmountPaid !== undefined ? Number(item.rentAmountPaid) : Number(item.actualPaidForMonth || 0);
          recDep = Number(item.depositAmount || 0);
          recTotal = recRent + recDep;
        } else {
          // Default for a new unrecorded month: full monthly rent in Rent Amount Paid
          recRent = monthlyRate;
          recDep = 0;
          recTotal = monthlyRate;
        }

        const receiptDateStr = recData?.receiptDate
          ? new Date(recData.receiptDate).toISOString().split('T')[0]
          : new Date().toISOString().split('T')[0];

        setPaymentForm({
          status: recData?.status || (tenantId ? 'Rented' : (item?.tenant ? 'Rented' : 'Vacant')),
          tenantId: tenantId || '',
          unitId: unitId || '',
          contractNo: activeContract,
          receiptNumber: recData?.receiptNumber || item?.receiptNumber || '',
          receiptDate: receiptDateStr,
          accountingMonth: effectiveMonth,
          rentAmount: String(recRent),
          depositAmount: String(recDep),
          totalAmount: String(recTotal),
          comments: recData?.comments || `Rent payment for ${formatMonthYear(effectiveMonth)}`,
          adjustmentAmount: String(recData?.adjustmentAmount || 0),
          adjustmentDescription: recData?.adjustmentDescription || ''
        });

        // 1. Build initialMap: priority to existing allocations on this receipt
        const initialMap = {};
        if (recData?.allocations && Array.isArray(recData.allocations) && recData.allocations.length > 0) {
          recData.allocations.forEach(a => {
            if (a.rentMonthYear) {
              initialMap[a.rentMonthYear] = Number(a.allocatedAmount !== undefined ? a.allocatedAmount : 0);
            }
          });
        } else if (recData?.monthPaidFor) {
          const mList = String(recData.monthPaidFor).split(',').map(s => s.trim()).filter(Boolean);
          if (mList.length === 1) {
            initialMap[mList[0]] = recRent;
          } else if (mList.length > 1) {
            const splitAmt = Math.round(recRent / mList.length);
            mList.forEach((m, idx) => {
              initialMap[m] = idx === mList.length - 1 ? (recRent - splitAmt * (mList.length - 1)) : splitAmt;
            });
          }
        }

        // If no prior allocations found, default to effectiveMonth only if rent paid is greater than 0
        if (Object.keys(initialMap).length === 0 && recRent > 0) {
          initialMap[effectiveMonth] = recRent;
        }

        setSelectedMonthsMap(initialMap);

        // 2. Fetch tenant-unit ledger to discover all payable/unpaid months
        let ledgerBreakdown = [];
        if (tenantId && unitId) {
          try {
            const lRes = await API.get(`/payments/tenant-unit-ledger?tenantId=${tenantId}&unitId=${unitId}`);
            if (lRes.data?.success && lRes.data.data) {
              if (Array.isArray(lRes.data.data.monthsBreakdown)) {
                ledgerBreakdown = lRes.data.data.monthsBreakdown;
              }
              if (lRes.data.data.paidTillMonth) {
                setSelectedTenantInfo(prev => ({
                  ...prev,
                  paidTillMonth: lRes.data.data.paidTillMonth || prev?.paidTillMonth
                }));
              }
            }
          } catch (lErr) {
            console.warn('Could not fetch tenant-unit ledger on modal open:', lErr);
          }
        }

        // Refine monthlyRate if ledger returned accurate expected rate for the target month
        const activeMonthDataForTarget = ledgerBreakdown.find(m => m.monthYear === primaryPaidMonth) || ledgerBreakdown.find(m => m.monthYear === effectiveMonth);
        if (activeMonthDataForTarget?.expectedRate && Number(activeMonthDataForTarget.expectedRate) > 0) {
          monthlyRate = Number(activeMonthDataForTarget.expectedRate);
          setSelectedTenantInfo(prev => ({
            ...prev,
            monthlyRate
          }));
        }

        // 3. Build unpaidMonthsList:
        // Include:
        // - All past months from ledger that are Unpaid or Partially Paid
        // - effectiveMonth
        // - Any months already allocated in initialMap
        const unpaidMap = new Map();

        // Add past unpaid / partially paid months from ledger
        ledgerBreakdown.forEach(m => {
          if (m.monthYear < effectiveMonth && (m.status === 'Unpaid' || m.status === 'Partially Paid')) {
            unpaidMap.set(m.monthYear, {
              monthYear: m.monthYear,
              outstandingAmount: m.outstandingAmount > 0 ? m.outstandingAmount : (m.expectedRate || monthlyRate),
              expectedRate: m.expectedRate || monthlyRate,
              isAdvance: false
            });
          }
        });

        // Add effectiveMonth
        const activeMonthData = ledgerBreakdown.find(m => m.monthYear === effectiveMonth) || activeMonthDataForTarget;
        const activeExp = activeMonthData?.expectedRate || monthlyRate;
        let activeOut = 0;
        if (initialMap[effectiveMonth] !== undefined) {
          activeOut = Math.max(0, activeExp - Number(initialMap[effectiveMonth] || 0));
        } else if (activeMonthData) {
          activeOut = activeMonthData.outstandingAmount > 0 ? activeMonthData.outstandingAmount : 0;
        } else {
          activeOut = Math.max(0, activeExp - recRent);
        }

        unpaidMap.set(effectiveMonth, {
          monthYear: effectiveMonth,
          outstandingAmount: activeOut,
          expectedRate: activeExp,
          isAdvance: false
        });

        // Add all months present in initialMap (e.g. future or past months selected on this receipt)
        Object.keys(initialMap).forEach(mYear => {
          if (!unpaidMap.has(mYear)) {
            const mData = ledgerBreakdown.find(b => b.monthYear === mYear);
            unpaidMap.set(mYear, {
              monthYear: mYear,
              outstandingAmount: mData ? mData.outstandingAmount : 0,
              expectedRate: mData ? mData.expectedRate : monthlyRate,
              isAdvance: mYear > effectiveMonth
            });
          }
        });

        const sortedUnpaidList = Array.from(unpaidMap.values()).sort((a, b) => String(a.monthYear || '').localeCompare(String(b.monthYear || '')));
        setUnpaidMonthsList(sortedUnpaidList);
      } catch (err) {
        console.error('Failed to initialize payment edit modal:', err);
        setErrorMsg(err.response?.data?.message || err.message || 'Failed to initialize payment details');
      } finally {
        setModalLoading(false);
      }
    };

    init();
  }, [isOpen, receiptId, receipt, item, activeMonth]);

  // Handle switching status between Rented and Vacant
  const handleStatusChange = (newStatus) => {
    if (newStatus === 'Vacant') {
      setPaymentForm(prev => ({
        ...prev,
        status: 'Vacant',
        tenantId: '',
        contractNo: '',
        rentAmount: '0',
        depositAmount: '0',
        totalAmount: '0',
        comments: `Unit marked vacant for ${formatMonthYear(activeMonth)}`
      }));
      setSelectedMonthsMap({ [activeMonth]: 0 });
      setUnpaidMonthsList([{
        monthYear: activeMonth,
        outstandingAmount: 0,
        expectedRate: 0,
        isAdvance: false
      }]);
    } else {
      const restoredTenantId = selectedTenantInfo?.initialTenantId || (tenantsList.length > 0 ? tenantsList[0]._id : '');
      const matchedContract = resolveContractForTargetMonth(restoredTenantId, selectedTenantInfo?.unitId, activeMonth);
      const monthlyRate = selectedTenantInfo?.monthlyRate || 22000;

      setPaymentForm(prev => ({
        ...prev,
        status: 'Rented',
        tenantId: restoredTenantId,
        contractNo: matchedContract,
        rentAmount: String(monthlyRate),
        depositAmount: '0',
        totalAmount: String(monthlyRate),
        comments: `Rent collection for ${formatMonthYear(activeMonth)}`
      }));
      setSelectedMonthsMap({ [activeMonth]: monthlyRate });
      setUnpaidMonthsList([{
        monthYear: activeMonth,
        outstandingAmount: 0,
        expectedRate: monthlyRate,
        isAdvance: false
      }]);
    }
  };

  // Quick Selection Helpers
  const selectEarliestOnly = () => {
    if (unpaidMonthsList.length === 0) return;
    const earliest = unpaidMonthsList[0];
    const amt = earliest.outstandingAmount > 0 ? earliest.outstandingAmount : (earliest.expectedRate || selectedTenantInfo?.monthlyRate || 0);
    syncPaymentState({ [earliest.monthYear]: amt });
  };

  const selectAllUnpaid = () => {
    const fullMap = {};
    unpaidMonthsList.forEach(m => {
      fullMap[m.monthYear] = m.outstandingAmount > 0 ? m.outstandingAmount : (m.expectedRate || selectedTenantInfo?.monthlyRate || 0);
    });
    syncPaymentState(fullMap);
  };

  const clearMonthSelection = () => {
    syncPaymentState({});
  };

  const toggleUnpaidMonth = (monthYear, defaultAmount) => {
    const updated = { ...selectedMonthsMap };
    if (updated[monthYear] !== undefined) {
      delete updated[monthYear];
    } else {
      updated[monthYear] = defaultAmount;
    }
    syncPaymentState(updated);
  };

  const updateMonthAmount = (monthYear, newAmount) => {
    const val = newAmount === '' ? '' : (Number(newAmount) || 0);
    const updated = { ...selectedMonthsMap, [monthYear]: val };
    setSelectedMonthsMap(updated);

    const rentTotal = Object.values(updated).reduce((s, v) => s + Number(v || 0), 0);
    setPaymentForm(f => {
      const depNum = Number(f.depositAmount) || 0;
      return {
        ...f,
        rentAmount: String(rentTotal),
        totalAmount: String(rentTotal + depNum)
      };
    });
  };

  // Helper to distribute rent amount across active selected months
  const distributeRentAcrossMonths = (enteredRentNum) => {
    if (isNaN(enteredRentNum) || enteredRentNum < 0) return;
    if (enteredRentNum === 0) {
      setSelectedMonthsMap({});
      return;
    }
    const activeMonths = Object.keys(selectedMonthsMap).sort();
    if (activeMonths.length === 1) {
      setSelectedMonthsMap({ [activeMonths[0]]: enteredRentNum });
    } else if (activeMonths.length > 1) {
      let rem = enteredRentNum;
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
    } else {
      const targetMonth = unpaidMonthsList.length > 0 ? unpaidMonthsList[0].monthYear : activeMonth;
      setSelectedMonthsMap({ [targetMonth]: enteredRentNum });
    }
  };

  // Handle changes to Rent Amount Paid
  const handleRentAmountChange = (newRentVal) => {
    const rentNum = newRentVal === '' ? 0 : Number(newRentVal);
    const depNum = Number(paymentForm.depositAmount) || 0;
    const calculatedTotal = (newRentVal === '' && (!paymentForm.depositAmount || paymentForm.depositAmount === '0'))
      ? ''
      : String((isNaN(rentNum) ? 0 : rentNum) + depNum);

    setPaymentForm(f => ({
      ...f,
      rentAmount: newRentVal,
      totalAmount: calculatedTotal
    }));

    if (newRentVal !== '' && !isNaN(rentNum)) {
      distributeRentAcrossMonths(rentNum);
    }
  };

  // Handle changes to Deposit Amount
  const handleDepositAmountChange = (newDepVal) => {
    const rentNum = Number(paymentForm.rentAmount) || 0;
    const depNum = newDepVal === '' ? 0 : Number(newDepVal);
    const calculatedTotal = (paymentForm.rentAmount === '' && newDepVal === '')
      ? ''
      : String(rentNum + (isNaN(depNum) ? 0 : depNum));

    setPaymentForm(f => ({
      ...f,
      depositAmount: newDepVal,
      totalAmount: calculatedTotal
    }));
  };

  // Handle changes to Total Amount Paid (defaults into Rent Amount Paid)
  const handleTotalAmountChange = (newVal) => {
    if (newVal === '') {
      setPaymentForm(f => ({
        ...f,
        totalAmount: '',
        rentAmount: ''
      }));
      distributeRentAcrossMonths(0);
      return;
    }
    const enteredNum = Number(newVal);
    if (isNaN(enteredNum) || enteredNum < 0) {
      setPaymentForm(f => ({ ...f, totalAmount: newVal }));
      return;
    }

    // By default, all payments received will come in Rent Amount Paid:
    const depNum = Number(paymentForm.depositAmount) || 0;
    const calculatedRent = Math.max(0, enteredNum - depNum);

    setPaymentForm(f => ({
      ...f,
      totalAmount: newVal,
      rentAmount: String(calculatedRent)
    }));

    distributeRentAcrossMonths(calculatedRent);
  };

  const handleAddAdvanceMonth = (monthStr) => {
    const targetMonth = monthStr || advancePickerMonth;
    if (!targetMonth) return;

    const defaultRate = selectedTenantInfo?.monthlyRate || 22000;

    if (!unpaidMonthsList.some(m => m.monthYear === targetMonth)) {
      const newMonthItem = {
        monthYear: targetMonth,
        outstandingAmount: 0,
        expectedRate: defaultRate,
        isAdvance: targetMonth > activeMonth
      };
      setUnpaidMonthsList(prev => [...prev, newMonthItem].sort((a, b) => a.monthYear.localeCompare(b.monthYear)));
    }

    const updated = {
      ...selectedMonthsMap,
      [targetMonth]: selectedMonthsMap[targetMonth] !== undefined ? selectedMonthsMap[targetMonth] : defaultRate
    };
    syncPaymentState(updated);
    setAdvancePickerMonth('');
    setShowAddAdvancePicker(false);
  };

  const handleRemoveMonthFromList = (monthYear) => {
    if (monthYear === activeMonth) return;
    setUnpaidMonthsList(prev => prev.filter(m => m.monthYear !== monthYear));
    const updated = { ...selectedMonthsMap };
    delete updated[monthYear];
    syncPaymentState(updated);
  };

  // Delete existing receipt and reset to 0
  const handleDeleteExistingReceipt = async () => {
    const rId = currentReceiptId || targetReceiptId;
    if (!rId) return;
    if (!window.confirm('Are you sure you want to delete this payment record and make the rent collected ₹0?')) {
      return;
    }
    try {
      setSubmitting(true);
      setErrorMsg('');
      try {
        await API.delete(`/payments/${rId}`);
      } catch (delErr) {
        console.warn('Receipt delete ignored if already gone:', delErr);
      }
      if (onPaymentSaved) await onPaymentSaved();
      if (onSuccess) await onSuccess();
      onClose();
    } catch (err) {
      console.error('Error removing payment:', err);
      if (onPaymentSaved) await onPaymentSaved();
      if (onSuccess) await onSuccess();
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  // Submit Payment (Save / Update)
  const handleSubmitPayment = async (e) => {
    if (e) e.preventDefault();

    if (paymentForm.status !== 'Vacant' && !paymentForm.tenantId) {
      alert('Please select a tenant when status is Rented.');
      return;
    }

    const enteredRent = Number(paymentForm.rentAmount) || 0;
    const enteredDeposit = Number(paymentForm.depositAmount) || 0;
    const enteredTotal = enteredRent + enteredDeposit;
    const activeReceiptId = currentReceiptId || receiptId || receipt?._id || receipt?.receiptId;

    // SCENARIO: User wants to make amount paid zero / remove payment
    if (enteredTotal === 0) {
      try {
        setSubmitting(true);
        setErrorMsg('');

        if (activeReceiptId) {
          try {
            await API.delete(`/payments/${activeReceiptId}`);
          } catch (delErr) {
            console.warn('Receipt delete ignored if already gone:', delErr);
          }
        }

        const unitId = paymentForm.unitId || selectedTenantInfo?.unitId;
        const targetMonth = paymentForm.accountingMonth || activeMonth;
        if (receipt?._id && receipt._id !== targetReceiptId) {
          try {
            await API.delete(`/payments/${receipt._id}`);
          } catch (e) {}
        }

        // Also check if any existing receipt for this unit & month is in the system and delete it
        if (unitId) {
          try {
            const checkRes = await API.get(`/payments?unitId=${unitId}`);
            if (checkRes.data?.success && Array.isArray(checkRes.data.data)) {
              const matched = checkRes.data.data.filter(r =>
                !r.isReversed &&
                (r.accountingMonth === targetMonth ||
                 (r.monthPaidFor && r.monthPaidFor.includes(targetMonth)) ||
                 r.allocations?.some(a => a.rentMonthYear === targetMonth))
              );
              for (const m of matched) {
                try {
                  await API.delete(`/payments/${m._id}`);
                } catch (e) {}
              }
            }
          } catch (e) {}
        }

        if (onPaymentSaved) await onPaymentSaved();
        if (onSuccess) await onSuccess();
        onClose();
        return;
      } catch (err) {
        console.error('Error setting payment to 0:', err);
        if (onPaymentSaved) await onPaymentSaved();
        if (onSuccess) await onSuccess();
        onClose();
        return;
      } finally {
        setSubmitting(false);
      }
    }

    const activeAllocations = Object.entries(selectedMonthsMap)
      .filter(([_, amt]) => Number(amt) >= 0)
      .map(([m, amt]) => {
        const matchedContract = resolveContractForTargetMonth(
          paymentForm.tenantId,
          paymentForm.unitId || selectedTenantInfo?.unitId,
          m
        ) || paymentForm.contractNo || '';

        return {
          rentMonthYear: m,
          allocatedAmount: Number(amt),
          contractNo: matchedContract,
          notes: `Monthly rent for ${formatMonthYear(m)}`
        };
      });

    let allocations = activeAllocations;

    if (paymentForm.status === 'Vacant' && allocations.length === 0) {
      allocations = [{
        rentMonthYear: activeMonth,
        allocatedAmount: 0,
        contractNo: '',
        notes: 'Vacant unit record'
      }];
    } else if (allocations.length === 0) {
      if (enteredTotal > 0) {
        const fallbackMonth = unpaidMonthsList.length > 0 ? unpaidMonthsList[0].monthYear : activeMonth;
        const matchedContract = resolveContractForTargetMonth(
          paymentForm.tenantId,
          paymentForm.unitId || selectedTenantInfo?.unitId,
          fallbackMonth
        ) || paymentForm.contractNo || '';

        allocations = [{
          rentMonthYear: fallbackMonth,
          allocatedAmount: enteredRent,
          contractNo: matchedContract,
          notes: enteredRent > 0 ? `Rent collection for ${formatMonthYear(fallbackMonth)}` : 'Security deposit'
        }];
      } else {
        alert('Please enter a valid amount paid.');
        return;
      }
    }

    const totalAllocated = allocations.reduce((s, a) => s + a.allocatedAmount, 0);

    // Auto-balance rent allocations against enteredRent so user is never blocked
    if (allocations.length > 0 && Math.abs(enteredRent - totalAllocated) > 0.01) {
      allocations[allocations.length - 1].allocatedAmount += (enteredRent - totalAllocated);
    }

    try {
      setSubmitting(true);
      setErrorMsg('');

      const isVacant = paymentForm.status === 'Vacant';
      const payload = {
        status: paymentForm.status || 'Rented',
        tenantId: isVacant ? null : paymentForm.tenantId,
        unitId: paymentForm.unitId || selectedTenantInfo?.unitId,
        contractNo: isVacant ? '' : (paymentForm.contractNo || ''),
        receiptNumber: paymentForm.receiptNumber !== undefined ? paymentForm.receiptNumber.trim() : undefined,
        receiptDate: paymentForm.receiptDate,
        accountingMonth: paymentForm.accountingMonth || activeMonth,
        monthPaidFor: allocations.map(a => a.rentMonthYear).join(', ') || paymentForm.accountingMonth || activeMonth,
        rentAmount: enteredRent,
        depositAmount: enteredDeposit,
        totalAmount: enteredTotal,
        comments: paymentForm.comments || '',
        adjustmentAmount: Number(paymentForm.adjustmentAmount) || 0,
        adjustmentDescription: paymentForm.adjustmentDescription || '',
        allocations
      };

      const targetReceiptId = currentReceiptId || receiptId || receipt?._id || receipt?.receiptId;
      let responseData;

      if (targetReceiptId) {
        try {
          const res = await API.put(`/payments/${targetReceiptId}`, payload);
          if (res.data?.success) {
            responseData = res.data.data;
          }
        } catch (putErr) {
          if (putErr.response?.status === 404) {
            const postRes = await API.post('/payments', payload);
            responseData = postRes.data?.data;
          } else {
            throw putErr;
          }
        }
      } else {
        if (!isVacant && selectedTenantInfo?.assignmentId && paymentForm.tenantId && paymentForm.tenantId !== selectedTenantInfo.initialTenantId) {
          try {
            await API.put(`/assignments/${selectedTenantInfo.assignmentId}`, {
              tenantId: paymentForm.tenantId
            });
          } catch(err) {
            console.error('Failed to update contract tenant:', err);
          }
        }
        const res = await API.post('/payments', payload);
        if (!res.data.success) {
          throw new Error(res.data.message || 'Failed to record payment');
        }
        responseData = res.data.data;
      }

      if (onSuccess) {
        await onSuccess(responseData);
      } else {
        onClose();
      }
    } catch (err) {
      console.error('Payment submit error:', err);
      const msg = err.response?.data?.message || err.message || 'Error processing payment. Please try again.';
      setErrorMsg(msg);
      alert(msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const targetReceiptId = currentReceiptId || receiptId || receipt?._id || receipt?.receiptId;
  const isEditing = Boolean(targetReceiptId);

  return (
    <div className="fixed inset-0 z-50 bg-slate-50 flex flex-col w-screen h-screen overflow-hidden animate-fadeIn">
      {/* FULL SCREEN HEADER */}
      <div className="flex items-center justify-between px-5 py-2.5 border-b border-slate-200 shrink-0 bg-white shadow-xs">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={resetColumnOrder}
            className="px-2.5 py-1.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer flex items-center gap-1"
            title="Reset form sections arrangement to default"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Layout</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold transition-all shadow-2xs cursor-pointer"
            title="Return to previous screen"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>{backButtonLabel}</span>
          </button>

          <div>
            <div className="flex items-center gap-2">
              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${
                isEditing ? 'bg-blue-100 text-blue-800 border border-blue-200' : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
              }`}>
                {isEditing ? 'Edit Month' : 'Add Month'}
              </span>
              <h3 className="text-base font-black text-slate-900">
                {isEditing ? 'Edit Month / Payment' : 'Add Month'}
              </h3>
            </div>
            <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-2 font-medium">
              <strong className="text-slate-800 text-sm">{paymentForm.status === 'Vacant' ? 'Vacant Unit' : (selectedTenantInfo?.tenantName || 'Tenant')}</strong>
              <span>•</span>
              <span>{selectedTenantInfo?.propertyName}</span>
              <span className="text-slate-400">({selectedTenantInfo?.partitionName})</span>
              {paymentForm.status !== 'Vacant' && selectedTenantInfo?.contractStartDate && (
                <>
                  <span>•</span>
                  <span className="text-slate-500">
                    Contract: {formatDate(selectedTenantInfo.contractStartDate)} to {selectedTenantInfo.contractEndDate ? formatDate(selectedTenantInfo.contractEndDate) : 'Ongoing'}
                  </span>
                </>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {onNavigateToPayments && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onNavigateToPayments(receipt || { _id: targetReceiptId, accountingMonth: paymentForm.accountingMonth || activeMonth });
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-teal-200 bg-teal-50 hover:bg-teal-100 text-teal-800 text-xs font-bold transition-all shadow-2xs cursor-pointer"
              title="Navigate directly to Rent and Payments collection sheet"
            >
              <ExternalLink className="w-3.5 h-3.5 text-teal-600" />
              <span>Open in Rent & Payments</span>
            </button>
          )}

          {isEditing && (
            <button
              type="button"
              disabled={submitting}
              onClick={handleDeleteExistingReceipt}
              className="px-3.5 py-1.5 rounded-xl border border-rose-200 text-xs font-bold text-rose-600 hover:text-rose-700 hover:bg-rose-50 transition-colors cursor-pointer flex items-center gap-1.5"
              title="Delete this payment receipt and reset month to ₹0"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete (Reset to ₹0)</span>
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleSubmitPayment}
            disabled={submitting || (paymentForm.status !== 'Vacant' && (paymentForm.totalAmount === '' || Number(paymentForm.totalAmount) < 0))}
            className={`px-5 py-1.5 rounded-xl text-white text-xs font-extrabold shadow-sm active:scale-95 transition-all cursor-pointer ${
              isEditing
                ? (Number(paymentForm.totalAmount || 0) === 0 ? 'bg-rose-600 hover:bg-rose-700 shadow-rose-600/20' : 'bg-blue-600 hover:bg-blue-700 shadow-blue-600/20')
                : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20'
            } disabled:opacity-50 flex items-center gap-2`}
          >
            <Check className="w-4 h-4" />
            <span>
              {submitting
                ? 'Saving...'
                : isEditing
                ? (Number(paymentForm.totalAmount || 0) === 0 ? 'Remove Payment (Set to ₹0)' : `Update Month ₹${Number(paymentForm.totalAmount || 0).toLocaleString('en-IN')}`)
                : (paymentForm.status === 'Vacant' ? `Record Vacant (₹${Number(paymentForm.totalAmount || 0).toLocaleString('en-IN')})` : `Save Month ₹${Number(paymentForm.totalAmount || 0).toLocaleString('en-IN')}`)}
            </span>
          </button>
        </div>
      </div>

      {modalLoading ? (
        <div className="flex-1 flex items-center justify-center text-slate-400 text-sm font-semibold">
          <span className="animate-spin inline-block w-5 h-5 border-2 border-emerald-600 border-t-transparent rounded-full mr-2" />
          Loading tenant ledger & contract details...
        </div>
      ) : (
        <form onSubmit={handleSubmitPayment} className="flex-1 overflow-y-auto p-3 lg:p-3.5 max-w-[1480px] w-full mx-auto">
          {errorMsg && (
            <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            
            {/* COLUMN 1: UNIT, STATUS, TENANT & CONTRACT DETAILS */}
            <div
              onDragOver={(e) => handleColDragOver(e, 'occupancy')}
              onDrop={(e) => handleColDrop(e, 'occupancy')}
              style={{ order: columnOrder.indexOf('occupancy') }}
              className={`bg-white p-3 rounded-xl border transition-all space-y-2.5 ${
                dragOverCol === 'occupancy' && draggedCol !== 'occupancy'
                  ? 'border-emerald-500 bg-emerald-50/50 shadow-md ring-2 ring-emerald-400'
                  : draggedCol === 'occupancy'
                  ? 'opacity-40 border-slate-300'
                  : 'border-slate-200 shadow-2xs'
              }`}
            >
              <div
                draggable
                onDragStart={(e) => handleColDragStart(e, 'occupancy')}
                onDragEnd={() => { setDraggedCol(null); setDragOverCol(null); }}
                className="flex items-center justify-between pb-2.5 border-b border-slate-100 cursor-grab active:cursor-grabbing select-none"
                title="Drag header to rearrange section"
              >
                <div className="flex items-center gap-2">
                  <span className="text-slate-400 hover:text-slate-700 p-0.5 rounded hover:bg-slate-100">
                    <GripVertical className="w-3.5 h-3.5" />
                  </span>
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                  <span className="text-xs font-black text-slate-900 uppercase tracking-wider">
                    Occupancy & Contract
                  </span>
                </div>
                <span className="text-[11px] font-bold text-slate-600 bg-slate-100 px-2.5 py-0.5 rounded-lg">
                  {selectedTenantInfo?.propertyName} • {selectedTenantInfo?.partitionName}
                </span>
              </div>

              {/* STATUS SELECTOR (RENTED vs VACANT) */}
              <div>
                <label className="text-xs font-black text-slate-800 uppercase tracking-wider block mb-1.5 flex items-center gap-1.5">
                  <span>Status</span>
                  <span className="text-rose-500">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl">
                  <button
                    type="button"
                    onClick={() => handleStatusChange('Rented')}
                    className={`py-1 px-2.5 rounded-lg text-xs font-extrabold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                      paymentForm.status !== 'Vacant'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900 bg-transparent'
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-full ${paymentForm.status !== 'Vacant' ? 'bg-white' : 'bg-emerald-500'}`} />
                    <span>Rented</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleStatusChange('Vacant')}
                    className={`py-1 px-2.5 rounded-lg text-xs font-extrabold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                      paymentForm.status === 'Vacant'
                        ? 'bg-amber-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900 bg-transparent'
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-full ${paymentForm.status === 'Vacant' ? 'bg-white' : 'bg-amber-500'}`} />
                    <span>Vacant</span>
                  </button>
                </div>
                
              </div>

              {/* TENANT NAME */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <span>Tenant Name</span>
                    {paymentForm.status !== 'Vacant' && <span className="text-rose-500">*</span>}
                  </label>
                  {paymentForm.status === 'Vacant' && (
                    <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                      Blank (Vacant)
                    </span>
                  )}
                </div>
                {paymentForm.status === 'Vacant' ? (
                  <input
                    type="text"
                    disabled
                    value=""
                    placeholder="— (Blank - Unit is Vacant) —"
                    className="w-full px-3 py-2 rounded-xl border border-dashed border-amber-300 bg-amber-50/50 text-xs font-bold text-amber-800 cursor-not-allowed shadow-2xs"
                  />
                ) : (
                  <select
                    value={paymentForm.tenantId || ''}
                    onChange={async (e) => {
                      const newTenantId = e.target.value;
                      const chosenTenant = tenantsList.find(t => t._id === newTenantId);
                      setPaymentForm(f => ({ ...f, tenantId: newTenantId }));

                      const chosenContract = assignmentsList.find(c => {
                        const cTId = String(c.tenantId?._id || c.tenantId || '');
                        const cUId = String(c.unitId?._id || c.unitId || '');
                        return cTId === String(newTenantId) && cUId === String(selectedTenantInfo?.unitId || '');
                      });
                      const chosenRate = Number(
                        chosenContract?.currentAgreement?.monthlyRate ??
                        chosenContract?.currentMonthlyRate ??
                        chosenContract?.monthlyRent ??
                        0
                      );

                      setSelectedTenantInfo(prev => ({
                        ...prev,
                        tenantId: newTenantId,
                        tenantName: chosenTenant?.name || prev?.tenantName,
                        tenantPhone: chosenTenant?.phone || '',
                        monthlyRate: chosenRate > 0 ? chosenRate : prev?.monthlyRate
                      }));
                      if (newTenantId && selectedTenantInfo?.unitId) {
                        try {
                          const lRes = await API.get(`/payments/tenant-unit-ledger?tenantId=${newTenantId}&unitId=${selectedTenantInfo.unitId}&upToMonthYear=${activeMonth}`);
                          const breakdown = lRes.data?.data?.monthsBreakdown || [];
                          const unpaidMap = new Map();
                          breakdown.forEach(m => {
                            if (m.monthYear < activeMonth && (m.status === 'Unpaid' || m.status === 'Partially Paid')) {
                              unpaidMap.set(m.monthYear, {
                                monthYear: m.monthYear,
                                outstandingAmount: m.outstandingAmount > 0 ? m.outstandingAmount : (m.expectedRate || chosenRate || selectedTenantInfo?.monthlyRate || 0),
                                expectedRate: m.expectedRate || chosenRate || selectedTenantInfo?.monthlyRate || 0,
                                isAdvance: false
                              });
                            }
                          });
                          const targetMonthData = breakdown.find(m => m.monthYear === activeMonth);
                          const defaultRate = targetMonthData?.expectedRate || (chosenRate > 0 ? chosenRate : null) || selectedTenantInfo?.monthlyRate || 22000;
                          setSelectedTenantInfo(prev => ({
                            ...prev,
                            monthlyRate: defaultRate
                          }));
                          unpaidMap.set(activeMonth, {
                            monthYear: activeMonth,
                            outstandingAmount: targetMonthData ? (targetMonthData.outstandingAmount > 0 ? targetMonthData.outstandingAmount : defaultRate) : defaultRate,
                            expectedRate: defaultRate,
                            isAdvance: false
                          });
                          setUnpaidMonthsList(Array.from(unpaidMap.values()).sort((a, b) => a.monthYear.localeCompare(b.monthYear)));
                          const defaultAmt = targetMonthData?.outstandingAmount || targetMonthData?.expectedRate || defaultRate || 0;
                          syncPaymentState(defaultAmt > 0 ? { [activeMonth]: defaultAmt } : {}, newTenantId, selectedTenantInfo.unitId);
                        } catch(err) {
                          console.error('Error fetching ledger for new tenant:', err);
                        }
                      }
                    }}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs font-bold text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400 cursor-pointer shadow-2xs"
                  >
                    <option value="">Select Tenant...</option>
                    {tenantsList.map(t => (
                      <option key={t._id} value={t._id}>
                        {t.name} {t.tenantCode ? `(${t.tenantCode})` : ''}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* CONTRACT NUMBER */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <span>Contract Number</span>
                    {paymentForm.status !== 'Vacant' && <span className="text-rose-500">*</span>}
                  </label>
                  {paymentForm.status !== 'Vacant' ? (
                    <span className="text-[10px] text-teal-700 font-bold bg-teal-50 px-2 py-0.5 rounded border border-teal-200">
                      Auto-selected by month
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                      Blank (No Contract)
                    </span>
                  )}
                </div>

                {paymentForm.status === 'Vacant' ? (
                  <input
                    type="text"
                    disabled
                    value=""
                    placeholder="— (Blank - No Contract) —"
                    className="w-full px-3 py-2 rounded-xl border border-dashed border-amber-300 bg-amber-50/50 text-xs font-mono font-bold text-amber-800 cursor-not-allowed shadow-2xs"
                  />
                ) : (() => {
                  const activeMonths = Object.keys(selectedMonthsMap).sort();
                  const currentTargetMonth = activeMonths[0] || activeMonth;
                  const matchingContracts = assignmentsList.filter(c => {
                    const cTId = String(c.tenantId?._id || c.tenantId || '');
                    const cUId = String(c.unitId?._id || c.unitId || '');
                    const selTId = String(paymentForm.tenantId || selectedTenantInfo?.tenantId || '');
                    const selUId = String(paymentForm.unitId || selectedTenantInfo?.unitId || '');
                    return cTId === selTId && cUId === selUId;
                  });

                  return (
                    <div className="space-y-1">
                      {matchingContracts.length > 0 ? (
                        <select
                          value={paymentForm.contractNo || ''}
                          onChange={(e) => {
                            const newContractNo = e.target.value;
                            setPaymentForm(f => ({ ...f, contractNo: newContractNo }));
                            const chosenContract = matchingContracts.find(c => (c.contractNo || c.assignmentCode) === newContractNo);
                            if (chosenContract) {
                              const newRate = Number(
                                chosenContract.currentAgreement?.monthlyRate ??
                                chosenContract.currentMonthlyRate ??
                                chosenContract.monthlyRent ??
                                chosenContract.rentAmount ??
                                0
                              );
                              if (newRate > 0) {
                                setSelectedTenantInfo(prev => ({ ...prev, monthlyRate: newRate }));
                              }
                            }
                          }}
                          className="w-full px-2.5 py-1.5 rounded-lg border border-teal-300 bg-teal-50/50 text-xs font-mono font-bold text-teal-900 focus:outline-none focus:ring-2 focus:ring-teal-500 cursor-pointer shadow-2xs"
                        >
                          {matchingContracts.map(c => {
                            const cNo = c.contractNo || c.assignmentCode;
                            const sStr = c.startDate ? c.startDate.slice(0, 10) : 'Open';
                            const eStr = c.endDate ? c.endDate.slice(0, 10) : 'Ongoing';
                            return (
                              <option key={c._id} value={cNo}>
                                {cNo} ({sStr} to {eStr}) [{c.status || 'Active'}]
                              </option>
                            );
                          })}
                        </select>
                      ) : (
                        <input
                          type="text"
                          placeholder="Contract No (e.g. SNIP-2026)"
                          value={paymentForm.contractNo || ''}
                          onChange={(e) => setPaymentForm(f => ({ ...f, contractNo: e.target.value }))}
                          className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono font-bold text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400 shadow-2xs"
                        />
                      )}
                      <p className="text-[10px] text-slate-400">
                        Selected for Month: <strong className="text-slate-700">{formatMonthYear(currentTargetMonth)}</strong>
                      </p>
                    </div>
                  );
                })()}
              </div>

              {/* RECEIPT NUMBER */}
              <div className="pt-1">
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Receipt Number
                </label>
                <input
                  type="text"
                  placeholder="Receipt # (e.g. REC-2026-00012 or Leave empty for auto)"
                  value={paymentForm.receiptNumber || ''}
                  onChange={(e) => setPaymentForm(f => ({ ...f, receiptNumber: e.target.value }))}
                  className="w-full px-2.5 py-1.5 rounded-xl border border-slate-300 text-xs font-mono font-bold text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400 shadow-2xs"
                />
              </div>

              {/* PAYMENT DATE */}
              <div className="pt-1">
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Payment Date <span className="text-rose-500">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={paymentForm.receiptDate}
                  onChange={(e) => setPaymentForm(f => ({ ...f, receiptDate: e.target.value }))}
                  className="w-full px-2.5 py-1.5 rounded-xl border border-slate-300 text-xs font-semibold text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400 cursor-pointer shadow-2xs"
                />
              </div>

              {/* COMMENTS / NOTES */}
              <div className="pt-1">
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Notes / Comments
                </label>
                <input
                  type="text"
                  placeholder="e.g. Rent payment for current month"
                  value={paymentForm.comments}
                  onChange={(e) => setPaymentForm(f => ({ ...f, comments: e.target.value }))}
                  className="w-full px-3 py-1.5 rounded-xl border border-slate-300 text-xs text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400 shadow-2xs"
                />
              </div>
            </div>

            {/* COLUMN 2: FINANCIALS, AMOUNT PAID & ADJUSTMENTS */}
            <div
              onDragOver={(e) => handleColDragOver(e, 'financials')}
              onDrop={(e) => handleColDrop(e, 'financials')}
              style={{ order: columnOrder.indexOf('financials') }}
              className={`bg-white p-3 rounded-xl border transition-all space-y-2.5 ${
                dragOverCol === 'financials' && draggedCol !== 'financials'
                  ? 'border-blue-500 bg-blue-50/50 shadow-md ring-2 ring-blue-400'
                  : draggedCol === 'financials'
                  ? 'opacity-40 border-slate-300'
                  : 'border-slate-200 shadow-2xs'
              }`}
            >
              <div
                draggable
                onDragStart={(e) => handleColDragStart(e, 'financials')}
                onDragEnd={() => { setDraggedCol(null); setDragOverCol(null); }}
                className="flex items-center justify-between pb-2.5 border-b border-slate-100 cursor-grab active:cursor-grabbing select-none"
                title="Drag header to rearrange section"
              >
                <div className="flex items-center gap-2">
                  <span className="text-slate-400 hover:text-slate-700 p-0.5 rounded hover:bg-slate-100">
                    <GripVertical className="w-3.5 h-3.5" />
                  </span>
                  <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                  <span className="text-xs font-black text-slate-900 uppercase tracking-wider">
                    Rent & Payment Calculation
                  </span>
                </div>
                <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                  Accounting Month: {formatMonthYear(activeMonth)}
                </span>
              </div>

              {/* MONTHLY RENT & PAID UP TO */}
              <div className="py-2 px-3 bg-slate-50 rounded-lg border border-slate-200/80 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                    Monthly Rent
                  </span>
                  <span className="text-base font-black text-slate-900 font-mono">
                    {formatCurrency(selectedTenantInfo?.monthlyRate || 22000)}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                    Paid Up To
                  </span>
                  <span className="text-xs font-black text-emerald-700 font-mono">
                    {selectedTenantInfo?.paidTillMonth && selectedTenantInfo?.paidTillMonth !== 'None'
                      ? formatMonthYear(selectedTenantInfo?.paidTillMonth)
                      : 'No prior payments'}
                  </span>
                </div>
              </div>

              {/* RENT AMOUNT PAID & DEPOSIT AMOUNT (TWO FIELDS) */}
              <div className="grid grid-cols-2 gap-2">
                {/* 1. Rent Amount Paid */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-black text-slate-800 uppercase tracking-wider">
                      Rent Amount Paid (₹) <span className="text-rose-500">*</span>
                    </label>
                  </div>
                  <div className="relative">
                    <span className="absolute left-2.5 top-2 text-slate-400 font-bold text-xs">₹</span>
                    <input
                      type="number"
                      value={paymentForm.rentAmount ?? ''}
                      onChange={(e) => handleRentAmountChange(e.target.value)}
                      placeholder="e.g. 22000"
                      className="w-full pl-6 pr-2 py-1.5 rounded-xl border-2 border-emerald-500 bg-white text-xs font-extrabold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-400 font-mono shadow-2xs"
                    />
                  </div>
                  <span className="text-[10px] text-emerald-700 font-medium block">
                    Default receiver of payments
                  </span>
                </div>

                {/* 2. Deposit Amount */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-black text-slate-800 uppercase tracking-wider">
                      Deposit Amount (₹)
                    </label>
                  </div>
                  <div className="relative">
                    <span className="absolute left-2.5 top-2 text-slate-400 font-bold text-xs">₹</span>
                    <input
                      type="number"
                      value={paymentForm.depositAmount ?? ''}
                      onChange={(e) => handleDepositAmountChange(e.target.value)}
                      placeholder="0"
                      className="w-full pl-6 pr-2 py-1.5 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-400 font-mono shadow-2xs"
                    />
                  </div>
                  <span className="text-[10px] text-slate-400 font-medium block">
                    Security / advance deposit
                  </span>
                </div>
              </div>

              {/* 3. Total Amount Paid (Total of Rent Amount Paid + Deposit Amount) */}
              <div className="p-2.5 rounded-xl bg-teal-50/60 border border-teal-200/80 space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-black text-teal-950 uppercase tracking-wider">
                    Total Amount Paid (₹) <span className="text-rose-500">*</span>
                  </label>
                  <span className="text-[10px] text-teal-700 font-bold font-mono">
                    Rent + Deposit
                  </span>
                </div>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-teal-600 font-bold text-sm">₹</span>
                  <input
                    type="number"
                    required
                    value={paymentForm.totalAmount ?? ''}
                    onChange={(e) => handleTotalAmountChange(e.target.value)}
                    placeholder="Total amount"
                    className="w-full pl-7 pr-3 py-1.5 rounded-xl border-2 border-teal-500 bg-white text-sm font-black text-teal-950 focus:outline-none focus:ring-2 focus:ring-teal-400 font-mono shadow-2xs"
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] font-mono text-slate-600 px-1">
                  <span>Rent: <b className="text-emerald-700">{formatCurrency(Number(paymentForm.rentAmount) || 0)}</b></span>
                  <span>+</span>
                  <span>Deposit: <b className="text-amber-700">{formatCurrency(Number(paymentForm.depositAmount) || 0)}</b></span>
                  <span>=</span>
                  <span>Total: <b className="text-teal-900 font-black">{formatCurrency(Number(paymentForm.totalAmount) || 0)}</b></span>
                </div>
                {paymentForm.status === 'Vacant' && (
                  <div className="pt-0.5">
                    <button
                      type="button"
                      onClick={() => handleTotalAmountChange('0')}
                      className="px-2.5 py-0.5 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-800 text-[11px] font-bold border border-amber-300 transition-all cursor-pointer"
                    >
                      ₹0 (Vacant)
                    </button>
                  </div>
                )}
              </div>

              {/* OUTSTANDING AMOUNT & ADJUSTMENTS */}
              {(() => {
                const calculatedOut = unpaidMonthsList.reduce((sum, m) => {
                  const expRate = (m.expectedRate && m.expectedRate > 0) ? m.expectedRate : (selectedTenantInfo?.monthlyRate || 0);
                  if (selectedMonthsMap[m.monthYear] !== undefined) {
                    const allocated = Number(selectedMonthsMap[m.monthYear]) || 0;
                    const balanceDiff = Math.max(0, expRate - allocated);
                    return sum + balanceDiff;
                  }
                  const rem = Number(m.outstandingAmount) || 0;
                  return sum + rem;
                }, 0);

                const adjNum = Number(paymentForm.adjustmentAmount) || 0;
                const netAdjustedOut = Math.max(0, calculatedOut + adjNum);

                return (
                  <div className="py-2 px-2.5 bg-rose-50/50 rounded-lg border border-rose-200/70 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-[10px] font-bold text-rose-800 uppercase tracking-wider block">
                          Outstanding Amount
                        </span>
                        <span className="text-[11px] text-slate-500">
                          {calculatedOut > 0 ? 'Balance difference + prior unpaid dues' : 'All selected dues cleared'}
                        </span>
                      </div>
                      <span className="text-sm font-black text-rose-700 font-mono">
                        {formatCurrency(calculatedOut)}
                      </span>
                    </div>

                    {/* Adjustment Outstanding Amount */}
                    <div className="pt-2 border-t border-rose-200/50 space-y-1">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-slate-700">
                          Adjustment Amount (+ / -)
                        </label>
                        <span className="text-[10px] text-slate-400">e.g. -1000 or +500</span>
                      </div>
                      <div className="relative">
                        <span className="absolute left-3 top-1.5 text-slate-400 font-bold text-xs">₹</span>
                        <input
                          type="number"
                          value={paymentForm.adjustmentAmount ?? ''}
                          onChange={(e) => setPaymentForm(f => ({ ...f, adjustmentAmount: e.target.value }))}
                          placeholder="Enter +/- adjustment"
                          className="w-full pl-7 pr-3 py-1.5 rounded-xl border border-slate-300 text-xs font-bold font-mono text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400"
                        />
                      </div>
                    </div>

                    {/* Net Adjusted Outstanding */}
                    <div className="flex items-center justify-between bg-white px-2.5 py-1.5 rounded-lg border border-rose-200">
                      <span className="text-xs font-extrabold text-slate-800">
                        Net Adjusted Outstanding:
                      </span>
                      <div className="text-right font-mono">
                        <span className="text-xs font-black text-rose-800">
                          {formatCurrency(netAdjustedOut)}
                        </span>
                        {adjNum !== 0 && (
                          <span className="text-[9px] text-slate-400 block font-normal">
                            ({formatCurrency(calculatedOut)} {adjNum > 0 ? `+ ₹${adjNum}` : `- ₹${Math.abs(adjNum)}`})
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Adjustment Reason */}
                    <div className="space-y-0.5">
                      <label className="text-[11px] font-bold text-slate-700 block">
                        Adjustment Reason
                      </label>
                      <input
                        type="text"
                        value={paymentForm.adjustmentDescription || ''}
                        onChange={(e) => setPaymentForm(f => ({ ...f, adjustmentDescription: e.target.value }))}
                        placeholder="e.g. Maintenance deduction, waiver"
                        className="w-full px-2.5 py-1.5 rounded-xl border border-slate-300 text-xs text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400"
                      />
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* COLUMN 3: DUE MONTHS TO SETTLE (PAST DUE & ADVANCE MONTHS UNIFIED) */}
            <div
              onDragOver={(e) => handleColDragOver(e, 'dueMonths')}
              onDrop={(e) => handleColDrop(e, 'dueMonths')}
              style={{ order: columnOrder.indexOf('dueMonths') }}
              className={`bg-white p-3 rounded-xl border transition-all space-y-2 flex flex-col ${
                dragOverCol === 'dueMonths' && draggedCol !== 'dueMonths'
                  ? 'border-purple-500 bg-purple-50/50 shadow-md ring-2 ring-purple-400'
                  : draggedCol === 'dueMonths'
                  ? 'opacity-40 border-slate-300'
                  : 'border-slate-200 shadow-2xs'
              }`}
            >
              <div
                draggable
                onDragStart={(e) => handleColDragStart(e, 'dueMonths')}
                onDragEnd={() => { setDraggedCol(null); setDragOverCol(null); }}
                className="flex items-center justify-between pb-2.5 border-b border-slate-100 shrink-0 cursor-grab active:cursor-grabbing select-none"
                title="Drag header to rearrange section"
              >
                <div className="flex items-center gap-2">
                  <span className="text-slate-400 hover:text-slate-700 p-0.5 rounded hover:bg-slate-100">
                    <GripVertical className="w-3.5 h-3.5" />
                  </span>
                  <div className="w-2.5 h-2.5 rounded-full bg-purple-500" />
                  <span className="text-xs font-black text-slate-900 uppercase tracking-wider">
                    Month Paid For
                  </span>
                </div>
                {paymentForm.status !== 'Vacant' && (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setShowAddAdvancePicker(prev => !prev)}
                      className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 flex items-center gap-1 cursor-pointer transition-all"
                      title="Select any month to add to Month Paid For"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Add Month Paid For</span>
                    </button>
                    {unpaidMonthsList.length > 1 && (
                      <button
                        type="button"
                        onClick={selectAllUnpaid}
                        className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
                        title="Select All Unpaid Months"
                      >
                        Select All
                      </button>
                    )}
                    {Object.keys(selectedMonthsMap).length > 0 && (
                      <button
                        type="button"
                        onClick={clearMonthSelection}
                        className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 cursor-pointer transition-all"
                        title="Deselect All Months (Set to ₹0)"
                      >
                        Deselect All
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* INLINE MONTH PICKER (When user clicks "+ Add Month Paid For") */}
              {showAddAdvancePicker && (
                <div className="p-2.5 bg-purple-50/70 border border-purple-200 rounded-xl space-y-2 shrink-0">
                  <div className="flex items-center justify-between text-[11px] font-bold text-purple-900">
                    <span>Select Any Month Paid For (Past / Future)</span>
                    <button
                      type="button"
                      onClick={() => setShowAddAdvancePicker(false)}
                      className="text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="month"
                      value={advancePickerMonth}
                      onChange={(e) => setAdvancePickerMonth(e.target.value)}
                      className="px-2.5 py-1 rounded-lg border border-purple-200 text-xs font-semibold text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-purple-400 flex-1 cursor-pointer"
                    />
                    <button
                      type="button"
                      onClick={() => handleAddAdvanceMonth(advancePickerMonth)}
                      disabled={!advancePickerMonth}
                      className="px-3 py-1 rounded-lg bg-purple-600 hover:bg-purple-700 disabled:opacity-40 text-white text-xs font-bold transition-all shrink-0 cursor-pointer"
                    >
                      Add Month
                    </button>
                  </div>
                </div>
              )}

              {/* DUE MONTHS LIST (PAST DUE & ADVANCE MONTHS IN SAME FIELD) */}
              {paymentForm.status === 'Vacant' ? (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 space-y-1">
                  <p className="font-extrabold flex items-center gap-1.5">
                    <span>Unit Marked as Vacant</span>
                  </p>
                  <p className="text-[11px] text-amber-700">
                    No tenant dues are allocated for this vacant period ({formatMonthYear(activeMonth)}).
                  </p>
                </div>
              ) : unpaidMonthsList.length === 0 ? (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>No pending dues found. Click &quot;Add Month Paid For&quot; to select any month.</span>
                  </div>
                </div>
              ) : (
                <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                  {unpaidMonthsList.map(m => {
                    const isChecked = selectedMonthsMap[m.monthYear] !== undefined;
                    const amount = selectedMonthsMap[m.monthYear] ?? (m.outstandingAmount || m.expectedRate || selectedTenantInfo?.monthlyRate || 22000);
                    const isFutureOrAdvance = m.isAdvance || m.monthYear > activeMonth;

                    return (
                      <div
                        key={m.monthYear}
                        className={`flex items-center justify-between p-2 rounded-xl border transition-all ${
                          isChecked
                            ? 'bg-emerald-50/70 border-emerald-300 shadow-2xs'
                            : 'bg-white border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <label className="flex items-center gap-2.5 cursor-pointer flex-1 min-w-0">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleUnpaidMonth(m.monthYear, m.outstandingAmount || m.expectedRate || selectedTenantInfo?.monthlyRate || 22000)}
                            className="w-3.5 h-3.5 text-emerald-600 rounded focus:ring-emerald-500 cursor-pointer shrink-0"
                          />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <p className="font-bold text-slate-800 text-xs">{formatMonthYear(m.monthYear)}</p>
                              {isFutureOrAdvance && (
                                <span className="text-[9px] font-extrabold uppercase tracking-wider bg-blue-100 text-blue-800 px-1.5 py-0.2 rounded">
                                  Advance
                                </span>
                              )}
                            </div>
                            <p className="text-[10px] text-slate-400">
                              Expected: <strong className="text-slate-600">{formatCurrency(m.expectedRate || selectedTenantInfo?.monthlyRate || 0)}</strong>
                              {isChecked && (() => {
                                const exp = (m.expectedRate && m.expectedRate > 0) ? m.expectedRate : (selectedTenantInfo?.monthlyRate || 0);
                                const curAlloc = Number(amount) || 0;
                                const bal = exp - curAlloc;
                                if (bal > 0) {
                                  return <> &bull; <span className="text-rose-600 font-bold">Balance: {formatCurrency(bal)}</span></>;
                                } else if (bal < 0) {
                                  return <> &bull; <span className="text-emerald-600 font-bold">Advance: +{formatCurrency(Math.abs(bal))}</span></>;
                                } else {
                                  return <> &bull; <span className="text-emerald-700 font-bold">Paid Full</span></>;
                                }
                              })()}
                            </p>
                          </div>
                        </label>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {isChecked && (
                            <div className="flex items-center gap-1">
                              <span className="text-[11px] text-slate-400 font-bold">₹</span>
                              <input
                                type="number"
                                value={amount}
                                onChange={(e) => updateMonthAmount(m.monthYear, e.target.value)}
                                className="w-20 px-2 py-0.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-800 text-right focus:outline-none focus:ring-1 focus:ring-emerald-400 font-mono"
                              />
                            </div>
                          )}
                          {m.monthYear !== activeMonth && (
                            <button
                              type="button"
                              onClick={() => handleRemoveMonthFromList(m.monthYear)}
                              className="text-slate-300 hover:text-rose-500 p-0.5 cursor-pointer transition-colors"
                              title="Remove from list"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* RECONCILIATION SUMMARY BOX */}
              <div className="mt-auto pt-2 border-t border-slate-100">
                {(() => {
                  const activeMonths = Object.keys(selectedMonthsMap);
                  const totalAlloc = activeMonths.reduce((s, m) => s + Number(selectedMonthsMap[m] || 0), 0);
                  const enteredRent = Number(paymentForm.rentAmount) || 0;
                  const enteredDep = Number(paymentForm.depositAmount) || 0;
                  const enteredTot = Number(paymentForm.totalAmount) || 0;
                  const diff = Math.abs(enteredRent - totalAlloc);
                  const isMatch = diff < 0.01;

                  return (
                    <div className={`p-2.5 rounded-xl border text-xs ${
                      isMatch
                        ? 'bg-emerald-50/80 border-emerald-300 text-emerald-900'
                        : 'bg-amber-50/80 border-amber-300 text-amber-900'
                    }`}>
                      <div className="flex items-center justify-between font-bold">
                        <span>Allocated Rent: {formatCurrency(totalAlloc)}</span>
                        <span>Rent Paid: {formatCurrency(enteredRent)}</span>
                      </div>
                      <div className="text-[10px] mt-1 flex items-center justify-between">
                        {isMatch ? (
                          <span className="text-emerald-700 font-extrabold flex items-center gap-1">
                            <Check className="w-3 h-3" /> Rent allocations match
                          </span>
                        ) : (
                          <span className="text-amber-800 font-extrabold">
                            Difference: {formatCurrency(diff)} ({enteredRent > totalAlloc ? 'under-allocated' : 'over-allocated'})
                          </span>
                        )}
                        <span className="font-mono text-slate-500">
                          Total: {formatCurrency(enteredTot)}{enteredDep > 0 ? ` (incl ₹${enteredDep} deposit)` : ''}
                        </span>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>

          </div>
        </form>
      )}
    </div>
  );
}
