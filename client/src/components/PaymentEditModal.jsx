import React, { useState, useEffect, useRef } from 'react';
import API from '../services/api';
import { formatCurrency, formatDate, formatMonthYear } from '../utils/formatters';
import { useModalBackHandler } from '../utils/useModalBackHandler';
import { 
  ChevronLeft, Check, Plus, X, CheckCircle2, 
  AlertCircle, ExternalLink, RefreshCw, Trash2 
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
  const activeMonth = propSelectedMonth || (receipt?.accountingMonth) || (receipt?.receiptDate ? String(receipt.receiptDate).slice(0, 7) : '') || getCurrentMonthYear();

  useModalBackHandler(isOpen, onClose);

  const [modalLoading, setModalLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Lists
  const [tenantsList, setTenantsList] = useState(propTenants || []);
  const [assignmentsList, setAssignmentsList] = useState(propAssignments || []);

  // Form State
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
    receiptDate: new Date().toISOString().split('T')[0],
    accountingMonth: activeMonth,
    totalAmount: '',
    referenceNumber: '',
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

  // Sync selected months, total amount and dynamic comments
  const syncPaymentState = (newSelectedMap, tenantId, unitId) => {
    setSelectedMonthsMap(newSelectedMap);

    const total = Object.values(newSelectedMap).reduce((s, v) => s + Number(v || 0), 0);
    const activeMonths = Object.keys(newSelectedMap).sort();

    let autoComment = '';
    if (activeMonths.length > 0) {
      autoComment = `Rent collection for ${activeMonths.map(formatMonthYear).join(', ')}`;
    }

    setPaymentForm(prev => {
      const updated = {
        ...prev,
        totalAmount: String(total),
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

        // Case 1: Editing an existing receipt (via receiptId or receipt object)
        const targetReceiptId = receiptId || receipt?._id || receipt?.receiptId;
        if (targetReceiptId) {
          let recData = receipt;

          // If receipt lacks allocations or full details, fetch it directly
          if (!recData || !recData.allocations || !recData.unitId || !recData.totalAmount) {
            try {
              const recRes = await API.get(`/payments/${targetReceiptId}`);
              if (recRes.data.success) {
                recData = recRes.data.data;
              }
            } catch (err) {
              console.warn('Could not fetch single receipt via /payments/:id, using fallback receipt prop', err);
            }
          }

          const tenantObj = recData?.tenantId || recData?.tenant;
          const unitObj = recData?.unitId || recData?.unit;
          const tenantId = tenantObj?._id || (typeof tenantObj === 'string' ? tenantObj : null);
          const unitId = unitObj?._id || (typeof unitObj === 'string' ? unitObj : null);
          const monthlyRate = unitObj?.monthlyRentExpected || recData?.monthlyRentExpected || 22000;
          const propName = unitObj?.propertyId?.name || recData?.property?.name || 'Property';
          const partName = unitObj?.subUnitPartition || unitObj?.unitName || recData?.partitionName || 'Unit';

          setSelectedTenantInfo({
            tenantId,
            initialTenantId: tenantId,
            unitId,
            receiptNumber: recData?.receiptNumber || '',
            tenantName: tenantObj?.name || 'Tenant',
            tenantPhone: tenantObj?.phone || '',
            propertyName: propName,
            partitionName: partName,
            monthlyRate,
            contractStartDate: recData?.contractStartDate || null,
            contractEndDate: recData?.contractEndDate || null
          });

          // Fetch detailed ledger to get unpaid months
          let unpaid = [];
          if (unitId) {
            try {
              const ledgerQuery = tenantId ? `tenantId=${tenantId}&unitId=${unitId}` : `unitId=${unitId}`;
              const ledgerRes = await API.get(`/payments/tenant-unit-ledger?${ledgerQuery}&upToMonthYear=${activeMonth}`);
              const ledger = ledgerRes.data?.data;
              const breakdown = ledger?.monthsBreakdown || [];
              unpaid = breakdown.filter(m => m.status === 'Unpaid' || m.status === 'Partially Paid');
            } catch (lErr) {
              console.warn('Could not load tenant-unit-ledger:', lErr);
            }
          }

          const initialMap = {};
          if (recData?.allocations && recData.allocations.length > 0) {
            recData.allocations.forEach(a => {
              initialMap[a.rentMonthYear] = a.allocatedAmount;
              if (!unpaid.some(u => u.monthYear === a.rentMonthYear)) {
                unpaid.push({
                  monthYear: a.rentMonthYear,
                  outstandingAmount: 0,
                  expectedRate: a.allocatedAmount || monthlyRate,
                  isAdvance: a.rentMonthYear > activeMonth
                });
              }
            });
          } else if (recData?.rentMonthYear) {
            initialMap[recData.rentMonthYear] = recData.allocatedAmount || recData.totalAmount || recData.receiptTotalAmount || 0;
            if (!unpaid.some(u => u.monthYear === recData.rentMonthYear)) {
              unpaid.push({
                monthYear: recData.rentMonthYear,
                outstandingAmount: 0,
                expectedRate: initialMap[recData.rentMonthYear],
                isAdvance: recData.rentMonthYear > activeMonth
              });
            }
          }

          unpaid.sort((a, b) => a.monthYear.localeCompare(b.monthYear));
          setUnpaidMonthsList(unpaid);

          const activeContract = recData?.contractNo || resolveContractForTargetMonth(tenantId, unitId, activeMonth, curAssignments) || '';
          const receiptDateStr = recData?.receiptDate ? new Date(recData.receiptDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
          const recTotal = recData?.totalAmount ?? recData?.receiptTotalAmount ?? 0;

          setPaymentForm({
            status: recData?.status || 'Rented',
            tenantId: tenantId || '',
            unitId: unitId || '',
            contractNo: activeContract,
            receiptDate: receiptDateStr,
            accountingMonth: recData?.accountingMonth || activeMonth,
            totalAmount: String(recTotal),
            referenceNumber: recData?.referenceNumber || '',
            comments: recData?.comments || `Rent payment for ${formatMonthYear(activeMonth)}`,
            adjustmentAmount: String(recData?.adjustmentAmount || 0),
            adjustmentDescription: recData?.adjustmentDescription || ''
          });

          setSelectedMonthsMap(initialMap);
        } else if (item) {
          // Case 2: Opening for a row item (Fast Payment recording from sheet)
          const tenantId = item.tenant?._id;
          const unitId = item.unit?._id;
          const monthlyRate = item.monthlyRentExpected || item.unit?.monthlyRentExpected || item.monthsBreakdown?.[0]?.expectedRate || 22000;

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

          let unpaid = [];
          try {
            const ledgerRes = await API.get(`/payments/tenant-unit-ledger?tenantId=${tenantId}&unitId=${unitId}&upToMonthYear=${activeMonth}`);
            const breakdown = ledgerRes.data?.data?.monthsBreakdown || item.monthsBreakdown || [];
            unpaid = breakdown.filter(m => m.status === 'Unpaid' || m.status === 'Partially Paid');
          } catch (err) {
            console.error('Failed to load ledger for item:', err);
          }

          if (activeMonth && !unpaid.some(u => u.monthYear === activeMonth)) {
            unpaid.push({
              monthYear: activeMonth,
              outstandingAmount: 0,
              expectedRate: monthlyRate,
              isAdvance: false
            });
          }
          unpaid.sort((a, b) => a.monthYear.localeCompare(b.monthYear));
          setUnpaidMonthsList(unpaid);

          const defaultAmt = monthlyRate;
          const initialMap = { [activeMonth]: defaultAmt };
          const activeContract = resolveContractForTargetMonth(tenantId, unitId, activeMonth, curAssignments) || item.contractNo || '';
          const receiptDate = new Date().toISOString().split('T')[0];

          setPaymentForm({
            status: item.tenant ? 'Rented' : 'Vacant',
            tenantId: tenantId || '',
            unitId: unitId || '',
            contractNo: activeContract,
            receiptDate,
            accountingMonth: activeMonth,
            totalAmount: String(defaultAmt),
            referenceNumber: '',
            comments: `Rent collection for ${formatMonthYear(activeMonth)}`,
            adjustmentAmount: '0',
            adjustmentDescription: ''
          });

          setSelectedMonthsMap(initialMap);
        }
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
  const handleStatusChange = async (newStatus) => {
    if (newStatus === 'Vacant') {
      setPaymentForm(prev => ({
        ...prev,
        status: 'Vacant',
        tenantId: '',
        contractNo: '',
        comments: `Unit marked vacant for ${formatMonthYear(activeMonth)}`
      }));
      setSelectedMonthsMap({});
      setUnpaidMonthsList([]);
    } else {
      const restoredTenantId = selectedTenantInfo?.initialTenantId || (tenantsList.length > 0 ? tenantsList[0]._id : '');
      const matchedContract = resolveContractForTargetMonth(restoredTenantId, selectedTenantInfo?.unitId, activeMonth);

      setPaymentForm(prev => ({
        ...prev,
        status: 'Rented',
        tenantId: restoredTenantId,
        contractNo: matchedContract,
        comments: `Rent collection for ${formatMonthYear(activeMonth)}`
      }));

      if (restoredTenantId && selectedTenantInfo?.unitId) {
        try {
          const lRes = await API.get(`/payments/tenant-unit-ledger?tenantId=${restoredTenantId}&unitId=${selectedTenantInfo.unitId}&upToMonthYear=${activeMonth}`);
          const breakdown = lRes.data?.data?.monthsBreakdown || [];
          const unpaid = breakdown.filter(m => m.status === 'Unpaid' || m.status === 'Partially Paid');
          setUnpaidMonthsList(unpaid);
          const targetMonthData = breakdown.find(m => m.monthYear === activeMonth);
          const defaultAmt = targetMonthData?.outstandingAmount || targetMonthData?.expectedRate || selectedTenantInfo?.monthlyRate || 22000;
          syncPaymentState(defaultAmt > 0 ? { [activeMonth]: defaultAmt } : {}, restoredTenantId, selectedTenantInfo.unitId);
        } catch (err) {
          console.error('Error fetching ledger for restored tenant:', err);
        }
      }
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

    const total = Object.values(updated).reduce((s, v) => s + Number(v || 0), 0);
    setPaymentForm(f => ({
      ...f,
      totalAmount: String(total)
    }));
  };

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
    } else {
      // Auto-allocate entered amount to earliest unpaid month or active month
      const targetMonth = unpaidMonthsList.length > 0 ? unpaidMonthsList[0].monthYear : activeMonth;
      setSelectedMonthsMap({ [targetMonth]: enteredNum });
    }
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
        isAdvance: true
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
    setUnpaidMonthsList(prev => prev.filter(m => m.monthYear !== monthYear));
    const updated = { ...selectedMonthsMap };
    delete updated[monthYear];
    syncPaymentState(updated);
  };

  // Delete existing receipt and reset to 0
  const handleDeleteExistingReceipt = async () => {
    const rId = targetReceiptId;
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

    const enteredTotal = Number(paymentForm.totalAmount) || 0;

    // SCENARIO: User wants to make amount paid zero / remove payment
    if (enteredTotal === 0) {
      try {
        setSubmitting(true);
        setErrorMsg('');

        if (targetReceiptId) {
          try {
            await API.delete(`/payments/${targetReceiptId}`);
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
        allocatedAmount: Number(paymentForm.totalAmount) || 0,
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
          allocatedAmount: enteredTotal,
          contractNo: matchedContract,
          notes: `Rent collection for ${formatMonthYear(fallbackMonth)}`
        }];
      } else {
        alert('Please enter a valid amount paid.');
        return;
      }
    }

    const totalAllocated = allocations.reduce((s, a) => s + a.allocatedAmount, 0);

    // Auto-balance if there is any minor rounding/difference so user is never blocked
    if (allocations.length > 0 && Math.abs(enteredTotal - totalAllocated) > 0.01) {
      allocations[allocations.length - 1].allocatedAmount += (enteredTotal - totalAllocated);
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
        receiptDate: paymentForm.receiptDate,
        accountingMonth: paymentForm.accountingMonth || activeMonth,
        totalAmount: enteredTotal,
        referenceNumber: paymentForm.referenceNumber || '',
        comments: paymentForm.comments || '',
        adjustmentAmount: Number(paymentForm.adjustmentAmount) || 0,
        adjustmentDescription: paymentForm.adjustmentDescription || '',
        allocations
      };

      const targetReceiptId = receiptId || receipt?._id || receipt?.receiptId;
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
      }
      onClose();
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

  const targetReceiptId = receiptId || receipt?._id || receipt?.receiptId;
  const isEditing = Boolean(targetReceiptId);

  return (
    <div className="fixed inset-0 z-50 bg-slate-50 flex flex-col w-screen h-screen overflow-hidden animate-fadeIn">
      {/* FULL SCREEN HEADER */}
      <div className="flex items-center justify-between px-5 py-2.5 border-b border-slate-200 shrink-0 bg-white shadow-xs">
        <div className="flex items-center gap-4">
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
            disabled={submitting || (paymentForm.status !== 'Vacant' && (paymentForm.totalAmount === '' || Number(paymentForm.totalAmount) < 0 || (!isEditing && Number(paymentForm.totalAmount) === 0)))}
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
            <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs space-y-2.5">
              <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
                <div className="flex items-center gap-2">
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
                      setSelectedTenantInfo(prev => ({
                        ...prev,
                        tenantId: newTenantId,
                        tenantName: chosenTenant?.name || prev?.tenantName,
                        tenantPhone: chosenTenant?.phone || ''
                      }));
                      if (newTenantId && selectedTenantInfo?.unitId) {
                        try {
                          const lRes = await API.get(`/payments/tenant-unit-ledger?tenantId=${newTenantId}&unitId=${selectedTenantInfo.unitId}&upToMonthYear=${activeMonth}`);
                          const breakdown = lRes.data?.data?.monthsBreakdown || [];
                          const unpaid = breakdown.filter(m => m.status === 'Unpaid' || m.status === 'Partially Paid');
                          setUnpaidMonthsList(unpaid);
                          const targetMonthData = breakdown.find(m => m.monthYear === activeMonth);
                          const defaultAmt = targetMonthData?.outstandingAmount || targetMonthData?.expectedRate || selectedTenantInfo?.monthlyRate || 0;
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
                          onChange={(e) => setPaymentForm(f => ({ ...f, contractNo: e.target.value }))}
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

              {/* DATES: PAYMENT DATE & REFERENCE NUMBER */}
              <div className="grid grid-cols-2 gap-2.5 pt-1">
                <div>
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
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Reference / Cheque No
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. UTR / Cheque / Cash"
                    value={paymentForm.referenceNumber || ''}
                    onChange={(e) => setPaymentForm(f => ({ ...f, referenceNumber: e.target.value }))}
                    className="w-full px-2.5 py-1.5 rounded-xl border border-slate-300 text-xs font-semibold text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400 shadow-2xs"
                  />
                </div>
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
            <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs space-y-2.5">
              <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                  <span className="text-xs font-black text-slate-900 uppercase tracking-wider">
                    Rent & Payment Calculation
                  </span>
                </div>
                <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                  Month: {formatMonthYear(activeMonth)}
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

              {/* AMOUNT PAID (₹) & QUICK 1-CLICK BUTTONS */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-black text-slate-800 uppercase tracking-wider">
                    Amount Paid (₹) <span className="text-rose-500">*</span>
                  </label>
                  <span className="text-[10px] text-slate-400">Total collection amount</span>
                </div>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-slate-400 font-bold text-sm">₹</span>
                  <input
                    type="number"
                    required
                    value={paymentForm.totalAmount}
                    onChange={(e) => handleTotalAmountChange(e.target.value)}
                    placeholder="e.g. 22000"
                    className="w-full pl-7 pr-3 py-1.5 rounded-xl border-2 border-emerald-400 bg-white text-sm font-extrabold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-400 font-mono shadow-2xs"
                  />
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
                  const rem = m.outstandingAmount > 0 ? m.outstandingAmount : (m.expectedRate || selectedTenantInfo?.monthlyRate || 0);
                  return sum + Number(rem);
                }, 0) || selectedTenantInfo?.calculatedOutstanding || 0;

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
                          Calculated month-by-month as on date
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
            <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs space-y-2 flex flex-col">
              <div className="flex items-center justify-between pb-2.5 border-b border-slate-100 shrink-0">
                <div className="flex items-center gap-2">
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
                    >
                      <Plus className="w-3 h-3" />
                      <span>Add Advance Month</span>
                    </button>
                    {unpaidMonthsList.length > 0 && (
                      <button
                        type="button"
                        onClick={selectAllUnpaid}
                        className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
                        title="Select All Unpaid Months"
                      >
                        Select All
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* INLINE ADVANCE MONTH PICKER (When user clicks "+ Add Advance Month") */}
              {showAddAdvancePicker && (
                <div className="p-2.5 bg-purple-50/70 border border-purple-200 rounded-xl space-y-2 shrink-0">
                  <div className="flex items-center justify-between text-[11px] font-bold text-purple-900">
                    <span>Select Future / Advance Month</span>
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
                      Add Month Paid For
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
                    <span>No past dues found. Click &quot;Add Advance Month&quot; to record upcoming rent.</span>
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
                              {m.outstandingAmount > 0 ? (
                                <>Due: <strong className="text-rose-600">{formatCurrency(m.outstandingAmount)}</strong></>
                              ) : (
                                <>Expected: <strong className="text-slate-600">{formatCurrency(m.expectedRate || selectedTenantInfo?.monthlyRate || 0)}</strong></>
                              )}
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
                          {isFutureOrAdvance && (
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
                  const enteredTot = Number(paymentForm.totalAmount) || 0;
                  const diff = Math.abs(enteredTot - totalAlloc);
                  const isMatch = diff < 0.01;

                  return (
                    <div className={`p-2.5 rounded-xl border text-xs ${
                      isMatch
                        ? 'bg-emerald-50/80 border-emerald-300 text-emerald-900'
                        : 'bg-amber-50/80 border-amber-300 text-amber-900'
                    }`}>
                      <div className="flex items-center justify-between font-bold">
                        <span>Allocated: {formatCurrency(totalAlloc)}</span>
                        <span>Total Paid: {formatCurrency(enteredTot)}</span>
                      </div>
                      <div className="text-[10px] mt-1 flex items-center justify-between">
                        {isMatch ? (
                          <span className="text-emerald-700 font-extrabold flex items-center gap-1">
                            <Check className="w-3 h-3" /> Allocations match receipt total
                          </span>
                        ) : (
                          <span className="text-amber-800 font-extrabold">
                            Difference: {formatCurrency(diff)} ({enteredTot > totalAlloc ? 'under-allocated' : 'over-allocated'})
                          </span>
                        )}
                        <span className="font-mono text-slate-500">
                          {activeMonths.length} Month(s)
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
