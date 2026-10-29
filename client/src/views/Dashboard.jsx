import React, { useState, useEffect, useRef, useMemo } from 'react';
import API from '../services/api';
import { formatCurrency, formatDate, formatMonthYear } from '../utils/formatters';
import { 
  Building2, Home, Users, AlertTriangle, TrendingUp, 
  TrendingDown, Wallet, Calendar, RefreshCw, CheckCircle2,
  ArrowUpRight, Clock
} from 'lucide-react';
import { 
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend
} from 'recharts';
import gsap from 'gsap';
import { pushDrilldown, navigateToTab } from '../utils/navigationHistory';

const KpiCard = ({ label, value, sub, icon: Icon, color, bgColor, iconColor }) => (
  <div className={`bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-start gap-4`}>
    <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${bgColor}`}>
      <Icon className={`w-6 h-6 ${iconColor}`} />
    </div>
    <div className="min-w-0">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide leading-tight">{label}</p>
      <p className={`text-2xl font-extrabold mt-0.5 ${color}`}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5 leading-tight">{sub}</p>}
    </div>
  </div>
);

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl shadow-lg p-3 text-xs">
        <p className="font-bold text-slate-800 mb-1">{formatMonthYear(label)}</p>
        {payload.map((p, i) => (
          <p key={i} style={{ color: p.color }} className="font-semibold">
            {p.name}: {formatCurrency(p.value)}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

export default function Dashboard() {
  const getCurrentMonthYear = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  };

  const [targetMonth, setTargetMonth] = useState(getCurrentMonthYear());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [ledgerTrend, setLedgerTrend] = useState([]);
  const cardContainerRef = useRef(null);

  const availableMonths = useMemo(() => {
    const set = new Set(data?.availableMonths || []);
    // Ensure all 12 months for 2025, 2026, 2027 are available
    for (let y = 2025; y <= 2027; y++) {
      for (let m = 1; m <= 12; m++) {
        set.add(`${y}-${String(m).padStart(2, '0')}`);
      }
    }
    if (targetMonth) set.add(targetMonth);
    return Array.from(set).sort();
  }, [data?.availableMonths, targetMonth]);

  const fetchDashboard = async () => {
    try {
      setLoading(true);
      const res = await API.get(`/dashboard/summary?targetMonth=${targetMonth}`);
      if (res.data.success) setData(res.data);
      const ledgerRes = await API.get('/ledger');
      if (ledgerRes.data.success) setLedgerTrend(ledgerRes.data.data);
    } catch (err) {
      console.error('Dashboard load failed:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchDashboard(); }, [targetMonth]);

  useEffect(() => {
    if (cardContainerRef.current && !loading) {
      gsap.fromTo(
        cardContainerRef.current.children,
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.45, stagger: 0.07, ease: 'power2.out' }
      );
    }
  }, [loading, data]);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-3">
          <RefreshCw className="w-8 h-8 text-emerald-500 animate-spin mx-auto" />
          <p className="text-sm text-slate-500 font-medium">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  const stats = data?.stats || {};

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 sm:p-6 rounded-2xl shadow-sm border border-slate-200">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900">Dashboard</h2>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
            <Calendar className="w-4 h-4 text-slate-400" />
            <select
              value={targetMonth}
              onChange={(e) => setTargetMonth(e.target.value)}
              className="bg-transparent text-sm font-semibold text-slate-700 focus:outline-none cursor-pointer max-w-[170px]"
            >
              {availableMonths.map((m) => (
                <option key={m} value={m}>
                  {formatMonthYear(m)}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={fetchDashboard}
            title="Refresh"
            className="p-2 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl border border-slate-200 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* KPI Grid */}
      <div ref={cardContainerRef} className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard
          label="Properties & Units"
          value={`${stats.totalProperties || 0}`}
          sub={`${stats.totalUnits || 0} units · ${stats.occupiedUnits || 0} occupied · ${stats.vacantUnits || 0} empty`}
          icon={Building2}
          color="text-blue-700"
          bgColor="bg-blue-50"
          iconColor="text-blue-600"
        />
        <KpiCard
          label={`Rent Collected · ${formatMonthYear(targetMonth)}`}
          value={formatCurrency(stats.currentMonthCollected)}
          sub="Cash & bank payments received"
          icon={TrendingUp}
          color="text-emerald-700"
          bgColor="bg-emerald-50"
          iconColor="text-emerald-600"
        />
        <KpiCard
          label={`Expenses Paid · ${formatMonthYear(targetMonth)}`}
          value={formatCurrency(stats.currentMonthExpenses)}
          sub="Maintenance & property costs"
          icon={TrendingDown}
          color="text-rose-700"
          bgColor="bg-rose-50"
          iconColor="text-rose-600"
        />
        <KpiCard
          label={`Rent Still Pending · ${formatMonthYear(targetMonth)}`}
          value={formatCurrency(stats.totalOutstandingRent)}
          sub={`${stats.overdueTenantsCount || 0} tenant(s) have pending dues`}
          icon={AlertTriangle}
          color="text-amber-700"
          bgColor="bg-amber-50"
          iconColor="text-amber-600"
        />
      </div>

      {/* Chart + Balance Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chart */}
        <div className="lg:col-span-2 bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-start justify-between mb-5">
            <div>
              <h3 className="font-bold text-slate-800 text-sm">Monthly Money In vs Money Out</h3>
              <p className="text-xs text-slate-400 mt-0.5">Rent received vs expenses paid each month</p>
            </div>
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={ledgerTrend} margin={{ top: 5, right: 5, left: 0, bottom: 0 }} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="monthYear" tickFormatter={formatMonthYear} stroke="#94a3b8" fontSize={11} />
                <YAxis stroke="#94a3b8" fontSize={11} tickFormatter={(v) => `₹${(v/1000).toFixed(0)}k`} />
                <Tooltip content={<CustomTooltip />} />
                <Legend formatter={(v) => <span className="text-xs font-semibold text-slate-600">{v}</span>} />
                <Bar dataKey="totalIncomeReceived" name="Rent Received" fill="#10b981" radius={[5,5,0,0]} />
                <Bar dataKey="totalExpensesPaid" name="Expenses Paid" fill="#f43f5e" radius={[5,5,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Balance Card */}
        <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6 rounded-2xl shadow-sm text-white flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="p-2.5 rounded-xl bg-white/10">
                <Wallet className="w-5 h-5 text-emerald-400" />
              </div>
              <span className="text-[10px] uppercase tracking-widest px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 font-bold">
                Verified
              </span>
            </div>
            <p className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold">
              Net Cash · {formatMonthYear(targetMonth)}
            </p>
            <p className="text-3xl font-extrabold text-white mt-1">
              {formatCurrency(stats.netCashFlowMonth)}
            </p>

            <div className="mt-5 pt-4 border-t border-slate-700/60 space-y-2.5 text-sm">
              <div className="flex justify-between text-slate-400">
                <span>Expected Rent ({formatMonthYear(targetMonth)}):</span>
                <span className="font-semibold text-white">{formatCurrency(stats.totalExpectedRent)}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Total Collected (All Time):</span>
                <span className="font-semibold text-emerald-400">{formatCurrency(stats.totalRentCollected)}</span>
              </div>
            </div>
          </div>
          <p className="mt-6 text-[11px] text-slate-500 border-t border-slate-700/40 pt-3">
            Each month's ending balance carries over as next month's starting balance.
          </p>
        </div>
      </div>

      {/* Recent Activity Filtered by Month */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Payments */}
        <div className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              <h3 className="font-bold text-slate-800 text-sm">Rent Payments · {formatMonthYear(targetMonth)}</h3>
            </div>
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">
              {data?.recentReceipts?.length || 0} payment(s)
            </span>
          </div>
          {(!data?.recentReceipts || data.recentReceipts.length === 0) ? (
            <p className="text-xs text-slate-400 italic py-8 text-center">No rent payments recorded in {formatMonthYear(targetMonth)}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-[11px] text-slate-400 uppercase tracking-wide">
                    <th className="pb-2 font-semibold">Tenant</th>
                    <th className="pb-2 font-semibold">Unit</th>
                    <th className="pb-2 font-semibold">Date</th>
                    <th className="pb-2 font-semibold text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.recentReceipts.map((r) => (
                    <tr 
                      key={r._id} 
                      onClick={() => {
                        pushDrilldown('dashboard', {
                          label: 'Dashboard',
                          targetTab: 'payments'
                        });
                        const m = r.accountingMonth || (r.receiptDate ? new Date(r.receiptDate).toISOString().slice(0, 7) : '');
                        if (m) localStorage.setItem('payments_selected_month', m);
                        localStorage.setItem('payments_edit_receipt_id', String(r._id));
                        localStorage.removeItem('payments_target_unit_id');
                        navigateToTab('payments');
                      }}
                      className="hover:bg-teal-50/70 cursor-pointer transition-colors group/drow"
                      title="Click to edit in Edit Month / Payment screen"
                    >
                      <td className="py-3 font-semibold text-slate-800 text-xs group-hover/drow:text-teal-700">{r.tenantId?.name}</td>
                      <td className="py-3 text-slate-500 text-xs">{r.unitId?.unitName}</td>
                      <td className="py-3 text-slate-400 text-xs">{formatDate(r.receiptDate)}</td>
                      <td className="py-3 text-right font-bold text-emerald-600 text-xs group-hover/drow:underline">{formatCurrency(r.totalAmount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Recent Expenses */}
        <div className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-rose-400" />
              <h3 className="font-bold text-slate-800 text-sm">Expenses · {formatMonthYear(targetMonth)}</h3>
            </div>
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-100">
              {data?.recentExpenses?.length || 0} expense(s)
            </span>
          </div>
          {(!data?.recentExpenses || data.recentExpenses.length === 0) ? (
            <p className="text-xs text-slate-400 italic py-8 text-center">No expenses recorded in {formatMonthYear(targetMonth)}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-[11px] text-slate-400 uppercase tracking-wide">
                    <th className="pb-2 font-semibold">Property / Type</th>
                    <th className="pb-2 font-semibold">Details</th>
                    <th className="pb-2 font-semibold">Date</th>
                    <th className="pb-2 font-semibold text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.recentExpenses.map((e) => (
                    <tr key={e._id} className="hover:bg-slate-50/70">
                      <td className="py-3">
                        <p className="font-semibold text-slate-800 text-xs">{e.propertyId?.name || 'General'}</p>
                        <p className="text-[11px] text-slate-400">{e.category}</p>
                      </td>
                      <td className="py-3 text-slate-500 text-xs max-w-[130px] truncate">{e.description}</td>
                      <td className="py-3 text-slate-400 text-xs">{formatDate(e.expenseDate)}</td>
                      <td className="py-3 text-right font-bold text-rose-600 text-xs">{formatCurrency(e.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
