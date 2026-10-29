import React, { useState, useEffect } from 'react';
import API from '../services/api';
import { formatCurrency, formatMonthYear, formatDate } from '../utils/formatters';
import ColumnManager, { getHeaderDragProps, useResizableColumns, ResizeHandle, useFrozenColumns, getFrozenColumnStyle } from '../components/ColumnManager';
import ApexToolbar from '../components/ApexToolbar';
import { cycleThreeStateSort, evaluateFilterRule, sortDataRows } from '../utils/tableUtils';
import * as XLSX from 'xlsx';
import { pushDrilldown, navigateToTab } from '../utils/navigationHistory';
import { 
  BookOpen, CheckCircle2, TrendingUp, TrendingDown, Minus, 
  RotateCcw, RefreshCw, Eye, X, ArrowUpRight, Calendar, DollarSign,
  ArrowUp, ArrowDown, ArrowUpDown, Download
} from 'lucide-react';

const LEDGER_COLUMNS_DEF = [
  { id: 'month', label: 'Month', defaultVisible: true },
  { id: 'opening', label: 'Starting Balance', defaultVisible: true },
  { id: 'income', label: 'Rent Received', defaultVisible: true },
  { id: 'expenses', label: 'Expenses Paid', defaultVisible: true },
  { id: 'net', label: 'Net Cash Flow', defaultVisible: true },
  { id: 'closing', label: 'Closing Balance', defaultVisible: true },
  { id: 'status', label: 'Status', defaultVisible: true },
  { id: 'actions', label: 'Details', defaultVisible: true },
  { id: 'netMargin', label: 'Net Cash Margin %', defaultVisible: false },
  { id: 'expenseRatio', label: 'Expense to Income %', defaultVisible: false }
];

const DEFAULT_LEDGER_COLUMN_WIDTHS = {
  month: 110,
  opening: 125,
  income: 125,
  expenses: 120,
  net: 115,
  closing: 125,
  status: 90,
  actions: 90,
  netMargin: 110,
  expenseRatio: 110
};

export default function LedgerView() {
  const [ledger, setLedger] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Month breakdown modal
  const [selectedMonth, setSelectedMonth] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [monthDetails, setMonthDetails] = useState(null);

  // APEX Toolbar, Search, Sort & Pagination States
  const [search, setSearch] = useState('');
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: null });
  const [isHeaderSticky, setIsHeaderSticky] = useState(true);
  const [frozenColumnCount, setFrozenColumnCount] = useFrozenColumns('ledger_freeze_v1', 0);
  const [activeViewId, setActiveViewId] = useState(null);
  const [ledgerFilters, setLedgerFilters] = useState([]);

  const handleSort = (colKey) => {
    setSortConfig(prev => cycleThreeStateSort(prev, colKey));
  };

  const handleExportExcel = () => {
    const exportRows = ledger.map(m => ({
      'Month': formatMonthYear(m.monthYear),
      'Starting Balance': m.openingBalance || 0,
      'Rent Received': m.totalIncomeReceived || 0,
      'Expenses Paid': m.totalExpensesPaid || 0,
      'Net Cash Flow': m.netCashFlow || 0,
      'Closing Balance': m.closingBalance || 0,
      'Status': 'Verified'
    }));

    const ws = XLSX.utils.json_to_sheet(exportRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Ledger_Account_Book');
    XLSX.writeFile(wb, `Account_Ledger_Book_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const [visibleColumns, setVisibleColumns] = useState(() => {
    const saved = localStorage.getItem('cols_ledger');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) {}
    }
    return LEDGER_COLUMNS_DEF.filter(c => c.defaultVisible !== false).map(c => c.id);
  });

  const {
    columnWidths,
    handleResizeStart,
    resetColumnWidths,
    hasCustomWidths
  } = useResizableColumns('ledger', DEFAULT_LEDGER_COLUMN_WIDTHS);

  const fetchLedger = async (isManual = false) => {
    try {
      if (isManual) setRefreshing(true);
      else setLoading(true);
      const res = await API.get('/ledger');
      if (res.data.success) setLedger(res.data.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Filtered & Sorted Ledger
  const filteredLedger = React.useMemo(() => {
    return ledger.filter(m => {
      const monthStr = formatMonthYear(m.monthYear).toLowerCase();
      const rawMonth = (m.monthYear || '').toLowerCase();
      const q = search.toLowerCase();

      const matchesSearch = !search || monthStr.includes(q) || rawMonth.includes(q);
      if (!matchesSearch) return false;

      // APEX Filters
      for (const f of ledgerFilters) {
        let val = '';
        if (f.columnId === 'month') val = formatMonthYear(m.monthYear);
        else if (f.columnId === 'opening') val = String(m.openingBalance || 0);
        else if (f.columnId === 'income') val = String(m.totalIncomeReceived || 0);
        else if (f.columnId === 'expenses') val = String(m.totalExpensesPaid || 0);
        else if (f.columnId === 'net') val = String(m.netCashFlow || 0);
        else if (f.columnId === 'closing') val = String(m.closingBalance || 0);
        else if (f.columnId === 'status') val = 'Verified';

        if (!evaluateFilterRule(val, f.operator, f.value)) return false;
      }

      return true;
    });
  }, [ledger, search, ledgerFilters]);

  const sortedLedger = React.useMemo(() => {
    return sortDataRows(filteredLedger, sortConfig, {
      month: m => m.monthYear || '',
      opening: m => Number(m.openingBalance) || 0,
      income: m => Number(m.totalIncomeReceived) || 0,
      expenses: m => Number(m.totalExpensesPaid) || 0,
      net: m => Number(m.netCashFlow) || 0,
      closing: m => Number(m.closingBalance) || 0,
      status: () => 'Verified'
    });
  }, [filteredLedger, sortConfig]);

  const isAllRows = rowsPerPage === 'All';
  const effectivePageSize = isAllRows ? sortedLedger.length || 1 : Number(rowsPerPage);
  const totalPages = Math.ceil(sortedLedger.length / effectivePageSize) || 1;
  const paginatedLedger = React.useMemo(() => {
    if (isAllRows) return sortedLedger;
    const start = (currentPage - 1) * effectivePageSize;
    return sortedLedger.slice(start, start + effectivePageSize);
  }, [sortedLedger, isAllRows, currentPage, effectivePageSize]);

  const handleOpenMonthDetails = async (monthYear) => {
    try {
      setSelectedMonth(monthYear);
      setDetailsLoading(true);
      const res = await API.get(`/ledger/month-details?month=${monthYear}`);
      if (res.data.success) {
        setMonthDetails(res.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setDetailsLoading(false);
    }
  };

  useEffect(() => { fetchLedger(); }, []);

  if (loading && ledger.length === 0) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-7 h-7 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-white p-3 sm:p-3.5 rounded-2xl shadow-2xs border border-slate-200">
        <div>
          <div className="flex items-center gap-3">
            <BookOpen className="w-5 h-5 text-emerald-600" />
            <h2 className="text-xl font-extrabold text-slate-900">Account Book (Ledger)</h2>
          </div>
        </div>
        <button
          onClick={() => fetchLedger(true)}
          disabled={refreshing}
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-50 hover:bg-emerald-50 text-slate-600 hover:text-emerald-700 border border-slate-200 text-xs font-semibold transition-all shrink-0 self-start sm:self-auto cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-emerald-600' : ''}`} />
          <span>{refreshing ? 'Updating...' : 'Refresh Live Book'}</span>
        </button>
      </div>

      {/* Monthly Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
        {ledger.map((m) => (
          <div 
            key={m.monthYear} 
            onClick={() => handleOpenMonthDetails(m.monthYear)}
            className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3 hover:border-emerald-300 hover:shadow-md transition-all cursor-pointer group"
          >
            <div className="flex items-center justify-between">
              <span className="font-extrabold text-slate-900 text-sm group-hover:text-emerald-700 transition-colors">
                {formatMonthYear(m.monthYear)}
              </span>
              <div className="flex items-center gap-1.5">
                <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                  <CheckCircle2 className="w-3 h-3" /> Verified
                </span>
                <span className="p-1 rounded-lg bg-slate-50 group-hover:bg-emerald-100/70 text-slate-400 group-hover:text-emerald-700 transition-colors">
                  <Eye className="w-3.5 h-3.5" />
                </span>
              </div>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between text-slate-500">
                <span>Starting Balance:</span>
                <span className="font-semibold text-slate-800">{formatCurrency(m.openingBalance)}</span>
              </div>
              <div className="flex justify-between text-emerald-600 font-semibold">
                <span className="flex items-center gap-1"><TrendingUp className="w-3 h-3" /> Rent Received:</span>
                <span>+ {formatCurrency(m.totalIncomeReceived)}</span>
              </div>
              <div className="flex justify-between text-rose-600 font-semibold">
                <span className="flex items-center gap-1"><TrendingDown className="w-3 h-3" /> Expenses Paid:</span>
                <span>− {formatCurrency(m.totalExpensesPaid)}</span>
              </div>
              <div className="flex justify-between text-slate-500 pt-1.5 border-t border-slate-100">
                <span className="flex items-center gap-1"><Minus className="w-3 h-3" /> Net:</span>
                <span className={`font-bold ${m.netCashFlow >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {m.netCashFlow >= 0 ? '+' : ''}{formatCurrency(m.netCashFlow)}
                </span>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-200 flex justify-between items-center">
              <span className="text-xs font-bold text-slate-600">Closing Balance:</span>
              <span className="text-sm font-extrabold text-slate-900">{formatCurrency(m.closingBalance)}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Ledger Table */}
      <div className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <div>
          <h3 className="font-bold text-slate-800 text-sm">Full Account Summary</h3>
          <p className="text-xs text-slate-400">Chronological carry-forward book across all operational months</p>
        </div>

        {/* APEX Toolbar for Ledger */}
        <ApexToolbar
          search={search}
          onSearchChange={(val) => { setSearch(val); setCurrentPage(1); }}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={(val) => { setRowsPerPage(val); setCurrentPage(1); }}
          availableRowsOptions={[5, 10, 25, 50, 100, 'All']}
          columns={LEDGER_COLUMNS_DEF}
          visibleColumns={visibleColumns}
          onChangeVisibleColumns={(cols) => {
            setVisibleColumns(cols);
            try { localStorage.setItem('cols_ledger', JSON.stringify(cols)); } catch(e){}
          }}
          columnWidths={columnWidths}
          onResetWidths={resetColumnWidths}
          sortConfig={sortConfig}
          onSortChange={setSortConfig}
          isHeaderSticky={isHeaderSticky}
          onToggleHeaderSticky={setIsHeaderSticky}
          frozenColumnCount={frozenColumnCount}
          onFrozenColumnCountChange={setFrozenColumnCount}
          activeViewName={activeViewId}
          onViewChange={setActiveViewId}
          filters={ledgerFilters}
          onFiltersChange={(flts) => { setLedgerFilters(flts); setCurrentPage(1); }}
          onExport={handleExportExcel}
          storageKey="ledger_v1"
        />
        <div className="overflow-x-auto">
          <table
            className="w-full text-left text-sm border-collapse table-fixed"
            style={{ minWidth: `${visibleColumns.reduce((sum, colId) => sum + (columnWidths[colId] || DEFAULT_LEDGER_COLUMN_WIDTHS[colId] || 100), 0)}px` }}
          >
            <colgroup>
              {visibleColumns.map((colId) => (
                <col
                  key={colId}
                  style={{ width: `${columnWidths[colId] || DEFAULT_LEDGER_COLUMN_WIDTHS[colId] || 100}px` }}
                />
              ))}
            </colgroup>
            <thead className={isHeaderSticky ? 'sticky top-0 z-20 shadow-xs' : ''}>
              <tr className="border-b border-slate-200 text-[11px] text-slate-700 uppercase tracking-wide select-none bg-slate-50">
                {visibleColumns.map((colId, colIndex) => {
                  const dragProps = getHeaderDragProps(colId, visibleColumns, setVisibleColumns, 'ledger');
                  const colDef = LEDGER_COLUMNS_DEF.find(c => c.id === colId);
                  const width = columnWidths[colId] || DEFAULT_LEDGER_COLUMN_WIDTHS[colId] || 100;
                  const frozenStyle = getFrozenColumnStyle(colIndex, frozenColumnCount, visibleColumns, columnWidths, true);
                  
                  let alignClass = 'text-left';
                  if (colId === 'status' || colId === 'actions') alignClass = 'text-center';
                  else if (['opening', 'income', 'expenses', 'net', 'closing', 'netMargin', 'expenseRatio'].includes(colId)) alignClass = 'text-right';

                  const isSortable = colId !== 'actions';
                  const isSorted = sortConfig.key === colId;

                  return (
                    <th
                      key={colId}
                      {...dragProps}
                      onClick={() => isSortable && handleSort(colId)}
                      style={{ ...frozenStyle, width: `${Math.max(width, 45)}px`, minWidth: `${Math.max(width, 45)}px` }}
                      className={`py-2.5 px-3 font-bold border-r border-slate-200 relative group whitespace-normal break-words leading-tight ${alignClass} ${frozenStyle.backgroundColor ? '' : 'bg-slate-50'} ${isSortable ? 'cursor-pointer hover:bg-slate-200/60 transition-colors' : ''}`}
                      title={isSortable ? `Sort by ${colDef?.label || colId}` : ''}
                    >
                      <div className={`flex items-center gap-1 ${alignClass === 'text-right' ? 'justify-end' : alignClass === 'text-center' ? 'justify-center' : 'justify-start'}`}>
                        <span className="break-words leading-tight">{colDef?.label || colId}</span>
                        {isSortable && (
                          <span className="shrink-0 text-slate-400">
                            {isSorted ? (
                              sortConfig.direction === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-emerald-600 font-bold" /> : <ArrowDown className="w-3.5 h-3.5 text-emerald-600 font-bold" />
                            ) : (
                              <ArrowUpDown className="w-3 h-3 opacity-0 group-hover:opacity-60" />
                            )}
                          </span>
                        )}
                      </div>
                      <ResizeHandle colId={colId} onResizeStart={handleResizeStart} />
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedLedger.map((m) => {
                const income = m.totalIncomeReceived || 0;
                const expenses = m.totalExpensesPaid || 0;
                const netMargin = income > 0 ? ((m.netCashFlow / income) * 100).toFixed(1) : '0.0';
                const expenseRatio = income > 0 ? ((expenses / income) * 100).toFixed(1) : '0.0';

                return (
                  <tr key={m.monthYear} className="hover:bg-slate-50/60">
                    {visibleColumns.map((colId, colIndex) => {
                      const frozenStyle = getFrozenColumnStyle(colIndex, frozenColumnCount, visibleColumns, columnWidths, false);
                      if (colId === 'month') {
                        return <td key={colId} style={frozenStyle} className="py-4 font-bold text-slate-900 text-xs">{formatMonthYear(m.monthYear)}</td>;
                      }
                      if (colId === 'opening') {
                        return <td key={colId} style={frozenStyle} className="py-4 text-right text-slate-600 text-xs font-medium">{formatCurrency(m.openingBalance)}</td>;
                      }
                      if (colId === 'income') {
                        return <td key={colId} style={frozenStyle} className="py-4 text-right text-emerald-600 text-xs font-semibold">{formatCurrency(m.totalIncomeReceived)}</td>;
                      }
                      if (colId === 'expenses') {
                        return <td key={colId} style={frozenStyle} className="py-4 text-right text-rose-600 text-xs font-semibold">{formatCurrency(m.totalExpensesPaid)}</td>;
                      }
                      if (colId === 'net') {
                        return (
                          <td key={colId} style={frozenStyle} className="py-4 text-right text-xs font-bold">
                            <span className={m.netCashFlow >= 0 ? 'text-emerald-600' : 'text-rose-600'}>
                              {formatCurrency(m.netCashFlow)}
                            </span>
                          </td>
                        );
                      }
                      if (colId === 'closing') {
                        return <td key={colId} style={frozenStyle} className="py-4 text-right text-slate-900 text-xs font-extrabold">{formatCurrency(m.closingBalance)}</td>;
                      }
                      if (colId === 'status') {
                        return (
                          <td key={colId} style={frozenStyle} className="py-4 text-center">
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-800 bg-emerald-100 px-2.5 py-1 rounded-full">
                              <CheckCircle2 className="w-3 h-3" /> Verified
                            </span>
                          </td>
                        );
                      }
                      if (colId === 'actions') {
                        return (
                          <td key={colId} style={frozenStyle} className="py-4 text-center">
                            <button
                              onClick={() => handleOpenMonthDetails(m.monthYear)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-emerald-100 text-slate-600 hover:text-emerald-700 text-xs font-semibold transition-colors"
                              title="Inspect month income & expenses"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>View</span>
                            </button>
                          </td>
                        );
                      }
                      if (colId === 'netMargin') {
                        return (
                          <td key={colId} style={frozenStyle} className="py-4 text-right text-xs font-mono font-bold">
                            <span className={Number(netMargin) >= 0 ? 'text-emerald-600' : 'text-rose-600'}>
                              {Number(netMargin) >= 0 ? '+' : ''}{netMargin}%
                            </span>
                          </td>
                        );
                      }
                      if (colId === 'expenseRatio') {
                        return (
                          <td key={colId} style={frozenStyle} className="py-4 text-right text-xs font-mono text-slate-600">
                            {expenseRatio}%
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

        {/* Pagination & Count Footer */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-5 py-3 border-t border-slate-200 bg-slate-50 text-xs font-bold text-slate-600 rounded-b-2xl">
          <div className="flex items-center gap-2">
            <span>
              Showing {sortedLedger.length === 0 ? 0 : isAllRows ? 1 : ((currentPage - 1) * effectivePageSize) + 1}
              - {isAllRows ? sortedLedger.length : Math.min(currentPage * effectivePageSize, sortedLedger.length)} of {sortedLedger.length} months
            </span>
            {sortConfig.key && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[11px] border border-emerald-200">
                Sorted by {sortConfig.key} ({sortConfig.direction?.toUpperCase()})
              </span>
            )}
          </div>
          {!isAllRows && totalPages > 1 && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(1)}
                className="px-2.5 py-1 rounded border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 transition-colors cursor-pointer"
              >
                «
              </button>
              <button
                type="button"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                className="px-2.5 py-1 rounded border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 transition-colors cursor-pointer"
              >
                Prev
              </button>
              <span className="px-3 py-1 text-slate-700">
                Page {currentPage} of {totalPages}
              </span>
              <button
                type="button"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                className="px-2.5 py-1 rounded border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 transition-colors cursor-pointer"
              >
                Next
              </button>
              <button
                type="button"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage(totalPages)}
                className="px-2.5 py-1 rounded border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 transition-colors cursor-pointer"
              >
                »
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Month Breakdown Modal */}
      {selectedMonth && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl border border-slate-200 max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-emerald-100 text-emerald-700">
                  <Calendar className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base">
                    Account Breakdown · {formatMonthYear(selectedMonth)}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Live itemized receipts and expenses for this month
                  </p>
                </div>
              </div>
              <button
                onClick={() => { setSelectedMonth(null); setMonthDetails(null); }}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-6">
              {detailsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="w-6 h-6 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : (
                <>
                  {/* Summary Bar */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="p-4 rounded-xl bg-emerald-50/80 border border-emerald-100 flex items-center justify-between">
                      <div>
                        <p className="text-xs font-semibold text-emerald-800">Total Rent Received</p>
                        <p className="text-xl font-extrabold text-emerald-700 mt-0.5">
                          {formatCurrency(monthDetails?.totalIncome || 0)}
                        </p>
                      </div>
                      <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-200/60 text-emerald-800">
                        {monthDetails?.receipts?.length || 0} payment(s)
                      </span>
                    </div>

                    <div className="p-4 rounded-xl bg-rose-50/80 border border-rose-100 flex items-center justify-between">
                      <div>
                        <p className="text-xs font-semibold text-rose-800">Total Expenses Paid</p>
                        <p className="text-xl font-extrabold text-rose-700 mt-0.5">
                          {formatCurrency(monthDetails?.totalExpenses || 0)}
                        </p>
                      </div>
                      <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-rose-200/60 text-rose-800">
                        {monthDetails?.expenses?.length || 0} expense(s)
                      </span>
                    </div>
                  </div>

                  {/* Expenses List */}
                  <div>
                    <h4 className="font-bold text-slate-900 text-sm mb-2.5 flex items-center gap-2">
                      <TrendingDown className="w-4 h-4 text-rose-500" />
                      <span>Expenses Paid in {formatMonthYear(selectedMonth)}</span>
                    </h4>
                    {(!monthDetails?.expenses || monthDetails.expenses.length === 0) ? (
                      <p className="text-xs text-slate-400 italic py-4 bg-slate-50 rounded-xl text-center">
                        No expenses recorded in {formatMonthYear(selectedMonth)}
                      </p>
                    ) : (
                      <div className="border border-slate-200 rounded-xl overflow-hidden">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
                            <tr>
                              <th className="py-2.5 px-3 font-semibold">Date</th>
                              <th className="py-2.5 px-3 font-semibold">Property</th>
                              <th className="py-2.5 px-3 font-semibold">Category</th>
                              <th className="py-2.5 px-3 font-semibold">Description</th>
                              <th className="py-2.5 px-3 font-semibold text-right">Amount</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {monthDetails.expenses.map((e) => (
                              <tr key={e._id} className="hover:bg-slate-50/60">
                                <td className="py-2.5 px-3 text-slate-500 whitespace-nowrap">{formatDate(e.expenseDate)}</td>
                                <td className="py-2.5 px-3 font-medium text-slate-800">{e.propertyId?.name || 'General'}</td>
                                <td className="py-2.5 px-3 text-slate-600">{e.category}</td>
                                <td className="py-2.5 px-3 text-slate-500 max-w-[200px] truncate">{e.description}</td>
                                <td className="py-2.5 px-3 text-right font-bold text-rose-600">{formatCurrency(e.amount)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {/* Rent Receipts List */}
                  <div>
                    <h4 className="font-bold text-slate-900 text-sm mb-2.5 flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-emerald-500" />
                      <span>Rent Payments in {formatMonthYear(selectedMonth)}</span>
                    </h4>
                    {(!monthDetails?.receipts || monthDetails.receipts.length === 0) ? (
                      <p className="text-xs text-slate-400 italic py-4 bg-slate-50 rounded-xl text-center">
                        No rent payments recorded in {formatMonthYear(selectedMonth)}
                      </p>
                    ) : (
                      <div className="border border-slate-200 rounded-xl overflow-hidden">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
                            <tr>
                              <th className="py-2.5 px-3 font-semibold">Receipt No</th>
                              <th className="py-2.5 px-3 font-semibold">Date</th>
                              <th className="py-2.5 px-3 font-semibold">Tenant</th>
                              <th className="py-2.5 px-3 font-semibold">Unit</th>
                              <th className="py-2.5 px-3 font-semibold text-right">Amount</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {monthDetails.receipts.map((r) => (
                              <tr 
                                key={r._id} 
                                onClick={() => {
                                  pushDrilldown('ledger_reports', {
                                    label: 'Tenant Ledger',
                                    targetTab: 'payments'
                                  });
                                  const m = r.accountingMonth || (r.receiptDate ? new Date(r.receiptDate).toISOString().slice(0, 7) : selectedMonth);
                                  if (m) localStorage.setItem('payments_selected_month', m);
                                  localStorage.setItem('payments_edit_receipt_id', String(r._id));
                                  localStorage.removeItem('payments_target_unit_id');
                                  setSelectedMonth(null);
                                  setMonthDetails(null);
                                  navigateToTab('payments');
                                }}
                                className="hover:bg-teal-50/70 cursor-pointer transition-colors group/lrow"
                                title="Click to edit payment in Edit Month / Payment screen"
                              >
                                <td className="py-2.5 px-3 font-mono font-semibold text-teal-800 group-hover/lrow:underline">{r.receiptNumber}</td>
                                <td className="py-2.5 px-3 text-slate-500 whitespace-nowrap">{formatDate(r.receiptDate)}</td>
                                <td className="py-2.5 px-3 font-medium text-slate-800">{r.tenantId?.name}</td>
                                <td className="py-2.5 px-3 text-slate-500">{r.unitId?.unitName}</td>
                                <td className="py-2.5 px-3 text-right font-bold text-emerald-600">{formatCurrency(r.totalAmount)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end">
              <button
                onClick={() => { setSelectedMonth(null); setMonthDetails(null); }}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
