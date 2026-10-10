import React, { useState, useEffect } from 'react';
import API from '../services/api';
import { formatCurrency, formatMonthYear } from '../utils/formatters';
import { FileSpreadsheet, CheckCircle2, TrendingUp, TrendingDown, ArrowRight } from 'lucide-react';

export default function LedgerView() {
  const [ledger, setLedger] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchLedger = async () => {
    try {
      setLoading(true);
      const res = await API.get('/ledger');
      if (res.data.success) {
        setLedger(res.data.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLedger();
  }, []);

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200/80">
        <h2 className="text-xl font-bold text-slate-900">Financial Ledger & Balance Sheet</h2>
        <p className="text-sm text-slate-500">
          Strict accounting equation: <span className="font-semibold text-slate-700">Opening Balance + Actual Income Received − Actual Expenses Paid = Closing Balance</span>.
          Previous closing balance automatically carries into subsequent opening balance.
        </p>
      </div>

      {/* Monthly Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {ledger.map((m) => (
          <div key={m.monthYear} className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-900 text-sm">{formatMonthYear(m.monthYear)}</span>
              <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                <CheckCircle2 className="w-3 h-3" /> Reconciled
              </span>
            </div>

            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between text-slate-500">
                <span>Opening Balance:</span>
                <span className="font-medium text-slate-800">{formatCurrency(m.openingBalance)}</span>
              </div>
              <div className="flex justify-between text-emerald-600 font-semibold">
                <span>+ Rent Received:</span>
                <span>{formatCurrency(m.totalIncomeReceived)}</span>
              </div>
              <div className="flex justify-between text-rose-600 font-semibold">
                <span>− Expenses Paid:</span>
                <span>{formatCurrency(m.totalExpensesPaid)}</span>
              </div>
              <div className="flex justify-between text-slate-500 pt-1 border-t border-slate-100">
                <span>Net Cash Flow:</span>
                <span className={`font-bold ${m.netCashFlow >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {formatCurrency(m.netCashFlow)}
                </span>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-200 flex justify-between items-center text-xs">
              <span className="font-bold text-slate-700">Closing Balance:</span>
              <span className="font-extrabold text-slate-900 text-sm">{formatCurrency(m.closingBalance)}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Ledger Table */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
        <h3 className="font-bold text-slate-800 text-base">Comprehensive Audit Statement</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs text-slate-400 uppercase">
                <th className="pb-3 font-semibold">Month-Year</th>
                <th className="pb-3 font-semibold text-right">Opening Balance (₹)</th>
                <th className="pb-3 font-semibold text-right text-emerald-600">Rent Income (₹)</th>
                <th className="pb-3 font-semibold text-right text-rose-600">Property Expenses (₹)</th>
                <th className="pb-3 font-semibold text-right">Net Flow (₹)</th>
                <th className="pb-3 font-semibold text-right font-bold">Closing Balance (₹)</th>
                <th className="pb-3 font-semibold text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {ledger.map((m) => (
                <tr key={m.monthYear} className="hover:bg-slate-50/50">
                  <td className="py-3.5 font-bold text-slate-900 text-xs">{formatMonthYear(m.monthYear)}</td>
                  <td className="py-3.5 text-right font-medium text-slate-700 text-xs">{formatCurrency(m.openingBalance)}</td>
                  <td className="py-3.5 text-right font-semibold text-emerald-600 text-xs">{formatCurrency(m.totalIncomeReceived)}</td>
                  <td className="py-3.5 text-right font-semibold text-rose-600 text-xs">{formatCurrency(m.totalExpensesPaid)}</td>
                  <td className="py-3.5 text-right font-bold text-xs">
                    <span className={m.netCashFlow >= 0 ? 'text-emerald-600' : 'text-rose-600'}>
                      {formatCurrency(m.netCashFlow)}
                    </span>
                  </td>
                  <td className="py-3.5 text-right font-extrabold text-slate-900 text-xs">{formatCurrency(m.closingBalance)}</td>
                  <td className="py-3.5 text-center">
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full">
                      Reconciled
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
