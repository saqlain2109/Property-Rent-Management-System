import React, { useState, useEffect } from 'react';
import API from '../services/api';
import { formatCurrency, formatMonthYear } from '../utils/formatters';
import { BookOpen, CheckCircle2, TrendingUp, TrendingDown, Minus } from 'lucide-react';

export default function LedgerView() {
  const [ledger, setLedger] = useState([]);
  const [loading, setLoading] = useState(true);

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
      <div className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-sm">
        <h3 className="font-bold text-slate-800 text-sm mb-4">Full Account Summary</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-[11px] text-slate-400 uppercase tracking-wide">
                <th className="pb-3 font-semibold">Month</th>
                <th className="pb-3 font-semibold text-right">Starting Balance</th>
                <th className="pb-3 font-semibold text-right text-emerald-600">Rent Received</th>
                <th className="pb-3 font-semibold text-right text-rose-600">Expenses</th>
                <th className="pb-3 font-semibold text-right">Net</th>
                <th className="pb-3 font-semibold text-right">Closing Balance</th>
                <th className="pb-3 font-semibold text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {ledger.map((m) => (
                <tr key={m.monthYear} className="hover:bg-slate-50/60">
                  <td className="py-4 font-bold text-slate-900 text-xs">{formatMonthYear(m.monthYear)}</td>
                  <td className="py-4 text-right text-slate-600 text-xs font-medium">{formatCurrency(m.openingBalance)}</td>
                  <td className="py-4 text-right text-emerald-600 text-xs font-semibold">{formatCurrency(m.totalIncomeReceived)}</td>
                  <td className="py-4 text-right text-rose-600 text-xs font-semibold">{formatCurrency(m.totalExpensesPaid)}</td>
                  <td className="py-4 text-right text-xs font-bold">
                    <span className={m.netCashFlow >= 0 ? 'text-emerald-600' : 'text-rose-600'}>
                      {formatCurrency(m.netCashFlow)}
                    </span>
                  </td>
                  <td className="py-4 text-right text-slate-900 text-xs font-extrabold">{formatCurrency(m.closingBalance)}</td>
                  <td className="py-4 text-center">
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-800 bg-emerald-100 px-2.5 py-1 rounded-full">
                      <CheckCircle2 className="w-3 h-3" /> Verified
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
