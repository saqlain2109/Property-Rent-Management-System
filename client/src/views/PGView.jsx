import React, { useState, useEffect, useMemo } from 'react';
import API from '../services/api';
import * as XLSX from 'xlsx';
import { formatCurrency, formatDate, formatMonthYear } from '../utils/formatters';
import ApexToolbar from '../components/ApexToolbar';
import { getHeaderDragProps, useResizableColumns, ResizeHandle, useFrozenColumns, getFrozenColumnStyle } from '../components/ColumnManager';
import { cycleThreeStateSort, evaluateFilterRule, sortDataRows, extractUniqueValues } from '../utils/tableUtils';
import { Users, DollarSign, Calculator, Plus, CheckCircle2, Edit, RotateCcw, ArrowUpDown, ChevronLeft, ChevronRight, Download } from 'lucide-react';

const PG_COLUMNS_DEF = [
  { id: 'month', label: 'Month', defaultVisible: true },
  { id: 'gross', label: 'Gross Collection', defaultVisible: true },
  { id: 'altaf', label: 'Altaf Share', defaultVisible: true },
  { id: 'anand', label: 'Anand Share', defaultVisible: true },
  { id: 'bisleri', label: 'Bisleri Water', defaultVisible: true },
  { id: 'deductions', label: 'Total Deductions', defaultVisible: true },
  { id: 'net', label: 'Net Received by Owner', defaultVisible: true },
  { id: 'rehan', label: 'Rehan Share', defaultVisible: false },
  { id: 'actualBank', label: 'Actual Bank Received', defaultVisible: false },
  { id: 'difference', label: 'Bank vs Net Variance', defaultVisible: false },
  { id: 'notes', label: 'Notes / Remarks', defaultVisible: false },
  { id: 'createdAt', label: 'Created Date', defaultVisible: false },
  { id: 'updatedAt', label: 'Modified Date', defaultVisible: false },
  { id: 'actions', label: 'Actions', defaultVisible: true }
];

// Screen-fitting default column widths to guarantee zero horizontal scroll by default!
const DEFAULT_PG_COLUMN_WIDTHS = {
  month: 100,
  gross: 110,
  altaf: 95,
  anand: 95,
  bisleri: 95,
  deductions: 110,
  net: 130,
  actions: 85,
  rehan: 95,
  actualBank: 110,
  difference: 110,
  notes: 140,
  createdAt: 110,
  updatedAt: 110
};

export default function PGView() {
  const [settlements, setSettlements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingSettlement, setEditingSettlement] = useState(null);
  const [sortConfig, setSortConfig] = useState({ key: 'createdAt', direction: 'desc' });
  const [search, setSearch] = useState('');
  const [isHeaderSticky, setIsHeaderSticky] = useState(true);
  const [frozenColumnCount, setFrozenColumnCount] = useFrozenColumns('pg_freeze_v1', 0);
  const [activeFilters, setActiveFilters] = useState([]);
  const [activeViewId, setActiveViewId] = useState(null);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [currentPage, setCurrentPage] = useState(1);

  // Suggestions for APEX filter builder dropdown
  const filterSuggestions = useMemo(() => {
    return {
      month: extractUniqueValues(settlements, s => formatMonthYear(s.monthYear)),
      notes: extractUniqueValues(settlements, s => s.notes)
    };
  }, [settlements]);

  const handleHeaderSort = (colId) => {
    if (colId === 'actions') return;
    setSortConfig(prev => cycleThreeStateSort(prev, colId));
  };

  const [visibleColumns, setVisibleColumns] = useState(() => {
    const saved = localStorage.getItem('cols_pg_settlements');
    if (saved) {
      try {
        const allowed = PG_COLUMNS_DEF.map((column) => column.id);
        return JSON.parse(saved).filter((column) => allowed.includes(column));
      } catch (e) {}
    }
    return PG_COLUMNS_DEF.filter(c => c.defaultVisible !== false).map(c => c.id);
  });

  const {
    columnWidths,
    handleResizeStart,
    resetColumnWidths,
    hasCustomWidths
  } = useResizableColumns('pg_settlements', DEFAULT_PG_COLUMN_WIDTHS);

  const [form, setForm] = useState({
    monthYear: '2026-01',
    pgGrossCollection: '81050',
    altafShare: '22000',
    anandShare: '10000',
    bisleriWaterShare: '20250',
    rehanShare: '0',
    actualBankReceived: '',
    notes: ''
  });

  const fetchSettlements = async () => {
    try {
      setLoading(true);
      const res = await API.get('/pg-settlements');
      if (res.data.success) {
        setSettlements(res.data.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettlements();
  }, []);

  const handleSaveSettlement = async (e) => {
    e.preventDefault();
    try {
      const res = await API.post('/pg-settlements', form);
      if (res.data.success) {
        setShowModal(false);
        setEditingSettlement(null);
        alert('PG Settlement saved successfully!');
        fetchSettlements();
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to save settlement');
    }
  };

  const openEditSettlement = (s) => {
    setEditingSettlement(s);
    setForm({
      monthYear: s.monthYear || '2026-01',
      pgGrossCollection: String(s.pgGrossCollection || 0),
      altafShare: String(s.altafShare || 0),
      anandShare: String(s.anandShare || 0),
      bisleriWaterShare: String(s.bisleriWaterShare || 0),
      rehanShare: String(s.rehanShare || 0),
      actualBankReceived: String(s.actualBankReceived || s.netReceivedByOwner || ''),
      notes: s.notes || ''
    });
    setShowModal(true);
  };

  const calculatedDeductions = Number(form.altafShare || 0) + Number(form.anandShare || 0) + Number(form.bisleriWaterShare || 0) + Number(form.rehanShare || 0);
  const calculatedNet = Number(form.pgGrossCollection || 0) - calculatedDeductions;
  const filteredSettlements = useMemo(() => {
    return settlements.filter(s => {
      const monthStr = formatMonthYear(s.monthYear) || '';
      const grossStr = String(s.pgGrossCollection || 0);
      const netStr = String(s.netReceivedByOwner || 0);
      const notesStr = s.notes || '';
      const sDate = s.createdAt ? formatDate(s.createdAt) : '';
      const eDate = s.updatedAt ? formatDate(s.updatedAt) : '';

      // 1. Text Search Box
      const q = search.toLowerCase();
      const matchesSearch = !search ||
        monthStr.toLowerCase().includes(q) ||
        grossStr.includes(q) ||
        netStr.includes(q) ||
        notesStr.toLowerCase().includes(q);

      if (!matchesSearch) return false;

      // 2. APEX Filters
      for (const f of activeFilters) {
        let fieldVal = '';
        if (f.columnId === 'month') fieldVal = monthStr;
        else if (f.columnId === 'gross') fieldVal = grossStr;
        else if (f.columnId === 'altaf') fieldVal = String(s.altafShare || 0);
        else if (f.columnId === 'anand') fieldVal = String(s.anandShare || 0);
        else if (f.columnId === 'bisleri') fieldVal = String(s.bisleriWaterShare || 0);
        else if (f.columnId === 'deductions') fieldVal = String(s.totalOperatorDeductions || 0);
        else if (f.columnId === 'net') fieldVal = netStr;
        else if (f.columnId === 'rehan') fieldVal = String(s.rehanShare || 0);
        else if (f.columnId === 'actualBank') fieldVal = String(s.actualBankReceived || 0);
        else if (f.columnId === 'notes') fieldVal = notesStr;
        else if (f.columnId === 'createdAt') fieldVal = sDate;
        else if (f.columnId === 'updatedAt') fieldVal = eDate;

        if (!evaluateFilterRule(fieldVal, f.operator, f.value)) return false;
      }

      return true;
    });
  }, [settlements, search, activeFilters]);

  const sortedSettlements = useMemo(() => {
    return sortDataRows(filteredSettlements, sortConfig, {
      month: s => s.monthYear,
      gross: s => s.pgGrossCollection || 0,
      altaf: s => s.altafShare || 0,
      anand: s => s.anandShare || 0,
      bisleri: s => s.bisleriWaterShare || 0,
      deductions: s => s.totalOperatorDeductions || 0,
      net: s => s.netReceivedByOwner || 0,
      rehan: s => s.rehanShare || 0,
      actualBank: s => s.actualBankReceived || 0,
      difference: s => (s.actualBankReceived || 0) - (s.netReceivedByOwner || 0),
      notes: s => s.notes || '',
      createdAt: s => s.createdAt,
      updatedAt: s => s.updatedAt
    });
  }, [filteredSettlements, sortConfig]);

  // Export ONLY the filtered PG settlements
  const exportToExcel = () => {
    try {
      const rows = sortedSettlements.map((s, idx) => ({
        'Sr No': idx + 1,
        'Month': formatMonthYear(s.monthYear),
        'Gross Collection (₹)': s.pgGrossCollection || 0,
        'Altaf Share (₹)': s.altafShare || 0,
        'Anand Share (₹)': s.anandShare || 0,
        'Bisleri Water (₹)': s.bisleriWaterShare || 0,
        'Rehan Share (₹)': s.rehanShare || 0,
        'Total Deductions (₹)': s.totalOperatorDeductions || 0,
        'Net Received by Owner (₹)': s.netReceivedByOwner || 0,
        'Actual Bank Received (₹)': s.actualBankReceived != null ? s.actualBankReceived : '',
        'Bank Variance (₹)': s.actualBankReceived != null ? s.actualBankReceived - s.netReceivedByOwner : '',
        'Notes': s.notes || '',
        'Created Date': s.createdAt ? formatDate(s.createdAt) : '',
        'Modified Date': s.updatedAt ? formatDate(s.updatedAt) : ''
      }));

      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'PG_Settlements');
      XLSX.writeFile(wb, `PG_Settlements_Filtered_${new Date().toISOString().split('T')[0]}.xlsx`);
    } catch (err) {
      console.error('Failed to export PG settlements to Excel:', err);
    }
  };

  // Pagination Slice
  const totalItems = sortedSettlements.length;
  const isAllRows = rowsPerPage === 'All';
  const effectivePageSize = isAllRows ? totalItems || 1 : Number(rowsPerPage);
  const totalPages = Math.ceil(totalItems / effectivePageSize) || 1;

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(1);
  }, [totalPages, currentPage]);

  const paginatedSettlements = useMemo(() => {
    if (isAllRows) return sortedSettlements;
    const startIndex = (currentPage - 1) * effectivePageSize;
    return sortedSettlements.slice(startIndex, startIndex + effectivePageSize);
  }, [sortedSettlements, isAllRows, currentPage, effectivePageSize]);

  return (
    <div className="space-y-2">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-white p-3 sm:p-3.5 rounded-2xl shadow-2xs border border-slate-200">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold shrink-0">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-extrabold text-slate-900 leading-tight">PG Settlements</h2>
          </div>
        </div>

        <div className="text-xs text-slate-500 font-semibold px-2">
          <b>{filteredSettlements.length}</b> Monthly Records
        </div>
      </div>

      {/* Oracle APEX-Style Toolbar */}
      <ApexToolbar
        kpiFilter={
          <div className="text-xs text-slate-600 bg-slate-100 font-semibold px-2.5 py-1 rounded-xl shrink-0">
            <b>{filteredSettlements.length}</b> Monthly Records
          </div>
        }
        search={search}
        onSearchChange={(val) => { setSearch(val); setCurrentPage(1); }}
        rowsPerPage={rowsPerPage}
        onRowsPerPageChange={(val) => { setRowsPerPage(val); setCurrentPage(1); }}
        availableRowsOptions={[5, 10, 25, 50, 100, 'All']}
        columns={PG_COLUMNS_DEF}
        visibleColumns={visibleColumns}
        onChangeVisibleColumns={setVisibleColumns}
        onResetWidths={resetColumnWidths}
        isHeaderSticky={isHeaderSticky}
        onToggleHeaderSticky={setIsHeaderSticky}
        frozenColumnCount={frozenColumnCount}
        onFrozenColumnCountChange={setFrozenColumnCount}
        filters={activeFilters}
        onFiltersChange={(flts) => { setActiveFilters(flts); setCurrentPage(1); }}
        filterSuggestions={filterSuggestions}
        onExport={exportToExcel}
        storageKey="pg_settlements"
        activeViewName={activeViewId}
        onViewChange={setActiveViewId}
        primaryAction={
          <button
            onClick={() => {
              setEditingSettlement(null);
              setForm({
                monthYear: '2026-04',
                pgGrossCollection: '81050',
                altafShare: '22000',
                anandShare: '10000',
                bisleriWaterShare: '20250',
                rehanShare: '0',
                actualBankReceived: '',
                notes: ''
              });
              setShowModal(true);
            }}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-sm active:scale-95 shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New PG Settlement</span>
          </button>
        }
      />

      {/* Settlements Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden flex flex-col">
        <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
          <table
            className="w-full text-left text-xs border-collapse table-fixed"
            style={{ minWidth: `${visibleColumns.reduce((sum, colId) => sum + (columnWidths[colId] || DEFAULT_PG_COLUMN_WIDTHS[colId] || 100), 0)}px` }}
          >
            <colgroup>
              {visibleColumns.map(colId => (
                <col
                  key={colId}
                  style={{ width: `${columnWidths[colId] || DEFAULT_PG_COLUMN_WIDTHS[colId] || 100}px` }}
                />
              ))}
            </colgroup>
            <thead className={isHeaderSticky ? 'sticky top-0 z-20 shadow-xs' : ''}>
              <tr className="bg-slate-100/90 text-slate-700 font-bold border-b border-slate-200 select-none">
                {visibleColumns.map((colId, colIndex) => {
                  const width = columnWidths[colId] || DEFAULT_PG_COLUMN_WIDTHS[colId] || 100;
                  const frozenStyle = getFrozenColumnStyle(colIndex, frozenColumnCount, visibleColumns, columnWidths, true);
                  let align = 'text-left';
                  if (colId === 'month' || colId === 'createdAt' || colId === 'updatedAt') align = 'text-center';
                  if (colId === 'actions') align = 'text-right';
                  const colDef = PG_COLUMNS_DEF.find(c => c.id === colId);
                  const label = colDef?.label || colId;

                  const isSortable = colId !== 'actions';
                  return (
                    <th
                      key={colId}
                      {...getHeaderDragProps(colId, visibleColumns, setVisibleColumns, 'pg_settlements')}
                      style={{ ...frozenStyle, width: `${Math.max(width, 45)}px`, minWidth: `${Math.max(width, 45)}px` }}
                      className={`py-2 pl-2.5 pr-6 border-r border-slate-300 relative group select-none whitespace-normal break-words leading-tight ${align} ${frozenStyle.backgroundColor ? '' : 'bg-slate-100'}`}
                    >
                      <div className={`flex items-center gap-1 w-full ${
                        align === 'text-right' ? 'justify-end' : align === 'text-center' ? 'justify-center' : 'justify-start'
                      }`}>
                        {colId === 'actions' ? (
                          <span className="text-xs font-bold text-slate-700 break-words leading-tight">{label}</span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleHeaderSort(colId)}
                            className="group/btn flex items-center gap-1 min-w-0 max-w-full text-xs font-bold text-slate-700 hover:text-slate-900 transition-colors text-left"
                            title={`Sort by ${label} (Click: Descending → Ascending → Clear)`}
                          >
                            <span className="break-words leading-tight">{label}</span>
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
              {loading ? (
                <tr><td colSpan={visibleColumns.length} className="py-8 text-center text-slate-400">Loading settlements...</td></tr>
              ) : filteredSettlements.length === 0 ? (
                <tr>
                  <td colSpan={visibleColumns.length} className="py-8 text-center text-slate-400">
                    No PG settlements found matching your filters.
                  </td>
                </tr>
              ) : (
                paginatedSettlements.map((s) => {
                  const actualBank = s.actualBankReceived != null ? Number(s.actualBankReceived) : null;
                  const variance = actualBank != null ? actualBank - Number(s.netReceivedByOwner || 0) : null;

                  return (
                    <tr key={s._id} className="hover:bg-slate-50/50">
                      {visibleColumns.map((colId, colIndex) => {
                        const frozenStyle = getFrozenColumnStyle(colIndex, frozenColumnCount, visibleColumns, columnWidths, false);
                        if (colId === 'month') {
                          return (
                            <td key={colId} style={frozenStyle} className="py-3.5 px-3 border-r border-slate-100 font-bold text-slate-900 text-xs">
                              {formatMonthYear(s.monthYear)}
                            </td>
                          );
                        }
                        if (colId === 'gross') {
                          return (
                            <td key={colId} style={frozenStyle} className="py-3.5 px-3 border-r border-slate-100 font-semibold text-slate-800 text-xs">
                              {formatCurrency(s.pgGrossCollection)}
                            </td>
                          );
                        }
                        if (colId === 'altaf') {
                          return (
                            <td key={colId} style={frozenStyle} className="py-3.5 px-3 border-r border-slate-100 text-xs text-slate-600">
                              {formatCurrency(s.altafShare)}
                            </td>
                          );
                        }
                        if (colId === 'anand') {
                          return (
                            <td key={colId} style={frozenStyle} className="py-3.5 px-3 border-r border-slate-100 text-xs text-slate-600">
                              {formatCurrency(s.anandShare)}
                            </td>
                          );
                        }
                        if (colId === 'bisleri') {
                          return (
                            <td key={colId} style={frozenStyle} className="py-3.5 px-3 border-r border-slate-100 text-xs text-slate-600">
                              {formatCurrency(s.bisleriWaterShare)}
                            </td>
                          );
                        }
                        if (colId === 'deductions') {
                          return (
                            <td key={colId} style={frozenStyle} className="py-3.5 px-3 border-r border-slate-100 text-xs font-semibold text-rose-600">
                              {formatCurrency(s.totalOperatorDeductions)}
                            </td>
                          );
                        }
                        if (colId === 'net') {
                          return (
                            <td key={colId} style={frozenStyle} className="py-3.5 px-3 border-r border-slate-100 font-bold text-emerald-600 text-xs">
                              {formatCurrency(s.netReceivedByOwner)}
                            </td>
                          );
                        }
                        if (colId === 'rehan') {
                          return (
                            <td key={colId} style={frozenStyle} className="py-3.5 px-3 border-r border-slate-100 text-xs text-slate-600">
                              {s.rehanShare ? formatCurrency(s.rehanShare) : '₹0'}
                            </td>
                          );
                        }
                        if (colId === 'actualBank') {
                          return (
                            <td key={colId} style={frozenStyle} className="py-3.5 px-3 border-r border-slate-100 text-xs font-semibold text-slate-800">
                              {actualBank != null ? formatCurrency(actualBank) : '—'}
                            </td>
                          );
                        }
                        if (colId === 'difference') {
                          return (
                            <td key={colId} style={frozenStyle} className="py-3.5 px-3 border-r border-slate-100 text-xs font-mono">
                              {variance != null ? (
                                <span className={variance >= 0 ? 'text-emerald-600' : 'text-rose-600'}>
                                  {variance >= 0 ? '+' : ''}{formatCurrency(variance)}
                                </span>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </td>
                          );
                        }
                        if (colId === 'notes') {
                          return (
                            <td key={colId} style={frozenStyle} className="py-3.5 px-3 border-r border-slate-100 text-xs text-slate-500 max-w-xs truncate" title={s.notes}>
                              {s.notes || '—'}
                            </td>
                          );
                        }
                        if (colId === 'createdAt' || colId === 'updatedAt') {
                          return (
                            <td key={colId} style={frozenStyle} className="py-3.5 px-3 border-r border-slate-100 text-xs text-slate-600 whitespace-nowrap">
                              {s[colId] ? formatDate(s[colId]) : '—'}
                            </td>
                          );
                        }
                        if (colId === 'actions') {
                          return (
                            <td key={colId} style={frozenStyle} className="py-3.5 px-3 text-right">
                              <button
                                onClick={() => openEditSettlement(s)}
                                title="Edit Settlement"
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs text-slate-600 hover:text-emerald-700 hover:bg-slate-100 rounded-lg transition-colors border border-slate-200"
                              >
                                <Edit className="w-3.5 h-3.5" />
                                <span>Edit</span>
                              </button>
                            </td>
                          );
                        }
                        return null;
                      })}
                    </tr>
                  );
                })
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
                {isAllRows ? totalItems : Math.min(currentPage * effectivePageSize, totalItems)} of {totalItems} settlements
              </span>
              {activeFilters.length > 0 && (
                <span className="text-teal-700 font-bold bg-teal-50 px-2 py-0.5 rounded-full border border-teal-200">
                  (Filtered from {settlements.length} total)
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

      {/* New / Edit Settlement Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-lg w-full p-6">
            <h3 className="text-lg font-bold text-slate-900 mb-4">
              {editingSettlement ? 'Edit PG Monthly Settlement' : 'Record Monthly PG Settlement'}
            </h3>
            <form onSubmit={handleSaveSettlement} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Month-Year</label>
                  <input
                    type="month"
                    required
                    value={form.monthYear}
                    onChange={(e) => setForm({ ...form, monthYear: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Gross Collection (₹)</label>
                  <input
                    type="number"
                    required
                    value={form.pgGrossCollection}
                    onChange={(e) => setForm({ ...form, pgGrossCollection: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                <p className="text-xs font-bold text-slate-700 uppercase tracking-wider">Operator Deductions (Standard Splits)</p>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">Altaf Share (₹)</label>
                    <input
                      type="number"
                      value={form.altafShare}
                      onChange={(e) => setForm({ ...form, altafShare: e.target.value })}
                      className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">Anand Share (₹)</label>
                    <input
                      type="number"
                      value={form.anandShare}
                      onChange={(e) => setForm({ ...form, anandShare: e.target.value })}
                      className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">Bisleri Water (₹)</label>
                    <input
                      type="number"
                      value={form.bisleriWaterShare}
                      onChange={(e) => setForm({ ...form, bisleriWaterShare: e.target.value })}
                      className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white"
                    />
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-200 flex justify-between text-xs">
                  <span className="text-slate-500">Total Deductions:</span>
                  <span className="font-bold text-rose-600">{formatCurrency(calculatedDeductions)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-700 font-bold">Calculated Net to Owner:</span>
                  <span className="font-bold text-emerald-600">{formatCurrency(calculatedNet)}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Actual Bank Deposited (₹)</label>
                  <input
                    type="number"
                    placeholder="Defaults to Net"
                    value={form.actualBankReceived}
                    onChange={(e) => setForm({ ...form, actualBankReceived: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Notes / Remarks</label>
                  <input
                    type="text"
                    placeholder="Optional remarks"
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    setEditingSettlement(null);
                  }}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-sm"
                >
                  {editingSettlement ? 'Update Settlement' : 'Save Settlement'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
