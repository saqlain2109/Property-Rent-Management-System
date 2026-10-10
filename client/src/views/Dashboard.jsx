import React, { useState, useEffect, useRef } from 'react';
import API from '../services/api';
import { formatCurrency, formatDate, formatMonthYear } from '../utils/formatters';
import { 
  Building, DoorOpen, Users, AlertCircle, ArrowUpRight, 
  ArrowDownRight, Wallet, Calendar, RefreshCw
} from 'lucide-react';
import { 
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid 
} from 'recharts';
import gsap from 'gsap';

export default function Dashboard() {
  const [targetMonth, setTargetMonth] = useState('2026-01');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [ledgerTrend, setLedgerTrend] = useState([]);
  const cardContainerRef = useRef(null);

  const fetchDashboard = async () => {
    try {
      setLoading(true);
      const res = await API.get(`/dashboard/summary?targetMonth=${targetMonth}`);
      if (res.data.success) {
        setData(res.data);
      }
      const ledgerRes = await API.get('/ledger');
      if (ledgerRes.data.success) {
        setLedgerTrend(ledgerRes.data.data);
      }
    } catch (err) {
      console.error('Failed to load dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, [targetMonth]);

  useEffect(() => {
    if (cardContainerRef.current && !loading) {
      gsap.fromTo(
        cardContainerRef.current.children,
        { opacity: 0, y: 15 },
        { opacity: 1, y: 0, duration: 0.4, stagger: 0.05, ease: 'power2.out' }
      );
    }
  }, [loading, data]);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <RefreshCw className="w-8 h-8 text-emerald-600 animate-spin" />
      </div>
    );
  }

  const stats = data?.stats || {};

  return (
    <div className="space-y-6">
      {/* Top Header Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-200/80">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Portfolio Overview</h2>
          <p className="text-sm text-slate-500">Live operational ledger calculated directly from database transactions</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5">
            <Calendar className="w-4 h-4 text-slate-500" />
            <select
              value={targetMonth}
              onChange={(e) => setTargetMonth(e.target.value)}
              className="bg-transparent text-sm font-semibold text-slate-700 focus:outline-none cursor-pointer"
            >
              <option value="2026-01">January 2026</option>
              <option value="2026-02">February 2026</option>
              <option value="2026-03">March 2026</option>
            </select>
          </div>
          <button
            onClick={fetchDashboard}
            title="Refresh statistics"
            className="p-2 text-slate-600 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl border border-slate-200 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div ref={cardContainerRef} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Properties */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Properties & Units</p>
            <p className="text-2xl font-bold text-slate-800 mt-1">
              {stats.totalProperties} <span className="text-sm font-normal text-slate-500">({stats.totalUnits} units)</span>
            </p>
            <p className="text-xs text-emerald-600 font-medium mt-1">
              {stats.occupiedUnits} Occupied • {stats.vacantUnits} Vacant
            </p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <Building className="w-6 h-6" />
          </div>
        </div>

        {/* Rent Collected */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Rent Collected ({formatMonthYear(targetMonth)})</p>
            <p className="text-2xl font-bold text-emerald-600 mt-1">
              {formatCurrency(stats.currentMonthCollected)}
            </p>
            <p className="text-xs text-slate-500 font-medium mt-1">
              Total Cash/Bank Inflow
            </p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <ArrowDownRight className="w-6 h-6" />
          </div>
        </div>

        {/* Expenses Paid */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Property Expenses</p>
            <p className="text-2xl font-bold text-rose-600 mt-1">
              {formatCurrency(stats.currentMonthExpenses)}
            </p>
            <p className="text-xs text-slate-500 font-medium mt-1">
              Outflow for {formatMonthYear(targetMonth)}
            </p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
            <ArrowUpRight className="w-6 h-6" />
          </div>
        </div>

        {/* Outstanding Rent */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Pending Rent</p>
            <p className="text-2xl font-bold text-amber-600 mt-1">
              {formatCurrency(stats.totalOutstandingRent)}
            </p>
            <p className="text-xs text-amber-600 font-medium mt-1">
              {stats.overdueTenantsCount} Tenant(s) pending
            </p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
            <AlertCircle className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Chart & Trend Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Income vs Expenses Bar Chart */}
        <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-slate-800 text-base">Monthly Cash Flow Comparison</h3>
              <p className="text-xs text-slate-500">Actual Rent Received vs Expenses Paid across 2026</p>
            </div>
            <div className="flex items-center gap-4 text-xs font-medium">
              <span className="flex items-center gap-1.5 text-emerald-600">
                <span className="w-3 h-3 rounded-sm bg-emerald-500 inline-block"></span> Income
              </span>
              <span className="flex items-center gap-1.5 text-rose-600">
                <span className="w-3 h-3 rounded-sm bg-rose-500 inline-block"></span> Expenses
              </span>
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={ledgerTrend} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="monthYear" tickFormatter={formatMonthYear} stroke="#94a3b8" fontSize={12} />
                <YAxis stroke="#94a3b8" fontSize={12} tickFormatter={(val) => `₹${(val / 1000).toFixed(0)}k`} />
                <Tooltip 
                  formatter={(val) => [formatCurrency(val)]}
                  labelFormatter={formatMonthYear}
                />
                <Bar dataKey="totalIncomeReceived" name="Income" fill="#10b981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="totalExpensesPaid" name="Expenses" fill="#f43f5e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Ledger Balance Card */}
        <div className="bg-gradient-to-br from-slate-900 to-slate-800 p-6 rounded-2xl shadow-sm text-white flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="p-2.5 rounded-xl bg-white/10 text-emerald-400">
                <Wallet className="w-5 h-5" />
              </span>
              <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 font-semibold uppercase tracking-wider">
                Reconciled
              </span>
            </div>
            <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Net Cash Flow ({formatMonthYear(targetMonth)})</p>
            <p className="text-3xl font-extrabold text-white mt-1">
              {formatCurrency(stats.netCashFlowMonth)}
            </p>
            <div className="mt-4 pt-4 border-t border-slate-700/60 space-y-2 text-sm">
              <div className="flex justify-between text-slate-300">
                <span>Total Expected Rent:</span>
                <span className="font-semibold text-white">{formatCurrency(stats.totalExpectedRent)}</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>Total Collected To-Date:</span>
                <span className="font-semibold text-emerald-400">{formatCurrency(stats.totalRentCollected)}</span>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-700/60 text-xs text-slate-400">
            Previous monthly balance carries seamlessly into current opening cash balance.
          </div>
        </div>
      </div>

      {/* Recent Activity Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Payment Receipts */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm">
          <h3 className="font-bold text-slate-800 text-base mb-4">Recent Rent Receipts</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs text-slate-400 uppercase">
                  <th className="pb-3 font-semibold">Tenant</th>
                  <th className="pb-3 font-semibold">Unit</th>
                  <th className="pb-3 font-semibold">Date</th>
                  <th className="pb-3 font-semibold text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data?.recentReceipts?.map((r) => (
                  <tr key={r._id} className="hover:bg-slate-50/60">
                    <td className="py-3 font-medium text-slate-800">{r.tenantId?.name}</td>
                    <td className="py-3 text-slate-500 text-xs">{r.unitId?.unitName}</td>
                    <td className="py-3 text-slate-500 text-xs">{formatDate(r.receiptDate)}</td>
                    <td className="py-3 text-right font-semibold text-emerald-600">{formatCurrency(r.totalAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Recent Expenses */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm">
          <h3 className="font-bold text-slate-800 text-base mb-4">Recent Expenses</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs text-slate-400 uppercase">
                  <th className="pb-3 font-semibold">Property / Category</th>
                  <th className="pb-3 font-semibold">Description</th>
                  <th className="pb-3 font-semibold">Date</th>
                  <th className="pb-3 font-semibold text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data?.recentExpenses?.map((e) => (
                  <tr key={e._id} className="hover:bg-slate-50/60">
                    <td className="py-3">
                      <p className="font-medium text-slate-800 text-xs">{e.propertyId?.name || 'General'}</p>
                      <p className="text-[11px] text-slate-400">{e.category}</p>
                    </td>
                    <td className="py-3 text-slate-600 text-xs max-w-[140px] truncate">{e.description}</td>
                    <td className="py-3 text-slate-500 text-xs">{formatDate(e.expenseDate)}</td>
                    <td className="py-3 text-right font-semibold text-rose-600">{formatCurrency(e.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
