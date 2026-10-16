import React, { useState, useEffect } from 'react';
import API from '../services/api';
import { formatCurrency, formatMonthYear } from '../utils/formatters';
import ColumnManager, { getHeaderDragProps, useResizableColumns, ResizeHandle } from '../components/ColumnManager';
import { BookOpen, CheckCircle2, TrendingUp, TrendingDown, Minus, RotateCcw } from 'lucide-react';

const LEDGER_COLUMNS_DEF = [
  { id: 'month', label: 'Month', defaultVisible: true },
  { id: 'opening', label: 'Starting Balance', defaultVisible: true },
  { id: 'income', label: 'Rent Received', defaultVisible: true },
  { id: 'expenses', label: 'Expenses Paid', defaultVisible: true },
  { id: 'net', label: 'Net Cash Flow', defaultVisible: true },
  { id: 'closing', label: 'Closing Balance', defaultVisible: true },
  { id: 'status', label: 'Status', defaultVisible: true },
  { id: 'netMargin', label: 'Net Cash Margin %', defaultVisible: false },
  { id: 'expenseRatio', label: 'Expense to Income %', defaultVisible: false }
];

const DEFAULT_LEDGER_COLUMN_WIDTHS = {
  month: 100,
  opening: 120,
  income: 125,
  expenses: 115,
  net: 115,
  closing: 125,
  status: 90,
  netMargin: 110,
  expenseRatio: 110
};

export default function LedgerView() {
  const [ledger, setLedger] = useState([]);
  const [loading, setLoading] = useState(true);

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

  const fetchLedger = async () => {
    try {
      setLoading(true);
      const res = await API.get('/ledger');
      if (res.data.success) setLedger(res.data.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchLedger(); }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-7 h-7 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-5 sm:p-6 rounded-2xl shadow-sm border border-slate-200">
        <div className="flex items-center gap-3 mb-1">
          <BookOpen className="w-5 h-5 text-emerald-600" />
          <h2 className="text-xl font-extrabold text-slate-900">Monthly Account Book</h2>
        </div>
        <p className="text-sm text-slate-500">
          Simple formula: <span className="font-semibold text-slate-700">Opening Balance + Rent Received − Expenses = Closing Balance</span>. 
          Each month's closing balance becomes next month's opening balance.
        </p>
      </div>

      {/* Monthly Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {ledger.map((m) => (
          <div key={m.monthYear} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-extrabold text-slate-900 text-sm">{formatMonthYear(m.monthYear)}</span>
              <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                <CheckCircle2 className="w-3 h-3" /> Verified
              </span>
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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-bold text-slate-800 text-sm">Full Account Summary</h3>
          <div className="flex items-center gap-2">
            {hasCustomWidths && (
              <button
                onClick={resetColumnWidths}
                title="Reset column widths to default"
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-white border border-slate-300 hover:bg-slate-50 rounded-xl shadow-xs transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset Widths</span>
              </button>
            )}
            <ColumnManager
              columns={LEDGER_COLUMNS_DEF}
              visibleColumns={visibleColumns}
              onChangeVisible={setVisibleColumns}
              onResetWidths={resetColumnWidths}
              storageKey="ledger"
            />
          </div>
        </div>
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
            <thead>
              <tr className="border-b border-slate-200 text-[11px] text-slate-500 uppercase tracking-wide select-none">
                {visibleColumns.map((colId) => {
                  const dragProps = getHeaderDragProps(colId, visibleColumns, setVisibleColumns, 'ledger');
                  const colDef = LEDGER_COLUMNS_DEF.find(c => c.id === colId);
                  const width = columnWidths[colId] || DEFAULT_LEDGER_COLUMN_WIDTHS[colId] || 100;
                  
                  let alignClass = 'text-left';
                  if (colId === 'status') alignClass = 'text-center';
                  else if (['opening', 'income', 'expenses', 'net', 'closing', 'netMargin', 'expenseRatio'].includes(colId)) alignClass = 'text-right';

                  let colorClass = '';
                  if (colId === 'income') colorClass = 'text-emerald-600';
                  if (colId === 'expenses') colorClass = 'text-rose-600';

                  return (
                    <th
                      key={colId}
                      {...dragProps}
                      style={{ width: `${width}px` }}
                      className={`pb-3 font-semibold relative group ${alignClass} ${colorClass}`}
                    >
                      <span className="truncate block pr-2">{colDef?.label || colId}</span>
                      <ResizeHandle colId={colId} onResizeStart={handleResizeStart} />
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {ledger.map((m) => {
                const income = m.totalIncomeReceived || 0;
                const expenses = m.totalExpensesPaid || 0;
                const netMargin = income > 0 ? ((m.netCashFlow / income) * 100).toFixed(1) : '0.0';
                const expenseRatio = income > 0 ? ((expenses / income) * 100).toFixed(1) : '0.0';

                return (
                  <tr key={m.monthYear} className="hover:bg-slate-50/60">
                    {visibleColumns.map((colId) => {
                      if (colId === 'month') {
                        return <td key={colId} className="py-4 font-bold text-slate-900 text-xs">{formatMonthYear(m.monthYear)}</td>;
                      }
                      if (colId === 'opening') {
                        return <td key={colId} className="py-4 text-right text-slate-600 text-xs font-medium">{formatCurrency(m.openingBalance)}</td>;
                      }
                      if (colId === 'income') {
                        return <td key={colId} className="py-4 text-right text-emerald-600 text-xs font-semibold">{formatCurrency(m.totalIncomeReceived)}</td>;
                      }
                      if (colId === 'expenses') {
                        return <td key={colId} className="py-4 text-right text-rose-600 text-xs font-semibold">{formatCurrency(m.totalExpensesPaid)}</td>;
                      }
                      if (colId === 'net') {
                        return (
                          <td key={colId} className="py-4 text-right text-xs font-bold">
                            <span className={m.netCashFlow >= 0 ? 'text-emerald-600' : 'text-rose-600'}>
                              {formatCurrency(m.netCashFlow)}
                            </span>
                          </td>
                        );
                      }
                      if (colId === 'closing') {
                        return <td key={colId} className="py-4 text-right text-slate-900 text-xs font-extrabold">{formatCurrency(m.closingBalance)}</td>;
                      }
                      if (colId === 'status') {
                        return (
                          <td key={colId} className="py-4 text-center">
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-800 bg-emerald-100 px-2.5 py-1 rounded-full">
                              <CheckCircle2 className="w-3 h-3" /> Verified
                            </span>
                          </td>
                        );
                      }
                      if (colId === 'netMargin') {
                        return (
                          <td key={colId} className="py-4 text-right text-xs font-mono font-bold">
                            <span className={Number(netMargin) >= 0 ? 'text-emerald-600' : 'text-rose-600'}>
                              {Number(netMargin) >= 0 ? '+' : ''}{netMargin}%
                            </span>
                          </td>
                        );
                      }
                      if (colId === 'expenseRatio') {
                        return (
                          <td key={colId} className="py-4 text-right text-xs font-mono text-slate-600">
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
      </div>
    </div>
  );
}
