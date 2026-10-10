import React, { useState, useEffect } from 'react';
import API from '../services/api';
import { Database, Play, CheckCircle2, AlertTriangle, FileSpreadsheet } from 'lucide-react';

export default function MigrationView() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [migrationResult, setMigrationResult] = useState(null);

  const fetchStatus = async () => {
    try {
      const res = await API.get('/migration/status');
      if (res.data.success) {
        setStatus(res.data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const handleRunMigration = async (dryRun) => {
    try {
      setLoading(true);
      const res = await API.post('/migration/run', { dryRun });
      if (res.data.success) {
        setMigrationResult(res.data.summary);
        alert(res.data.message);
        fetchStatus();
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Migration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200/80">
        <h2 className="text-xl font-bold text-slate-900">Excel Migration & Data Management</h2>
        <p className="text-sm text-slate-500">
          Automated parsing, field normalization, duplicate prevention, and verified ledger synchronization from source Excel files.
        </p>
      </div>

      {/* Migration Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm">
          <p className="text-xs font-semibold text-slate-400 uppercase">Properties in DB</p>
          <p className="text-2xl font-bold text-slate-800 mt-1">{status?.counts?.properties || 0}</p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm">
          <p className="text-xs font-semibold text-slate-400 uppercase">Units in DB</p>
          <p className="text-2xl font-bold text-slate-800 mt-1">{status?.counts?.units || 0}</p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm">
          <p className="text-xs font-semibold text-slate-400 uppercase">Tenants in DB</p>
          <p className="text-2xl font-bold text-slate-800 mt-1">{status?.counts?.tenants || 0}</p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm">
          <p className="text-xs font-semibold text-slate-400 uppercase">Payment Receipts</p>
          <p className="text-2xl font-bold text-emerald-600 mt-1">{status?.counts?.receipts || 0}</p>
        </div>
      </div>

      {/* Migration Actions Box */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-6">
        <div>
          <h3 className="font-bold text-slate-800 text-base">Run Excel Migration</h3>
          <p className="text-xs text-slate-500 mt-1">
            Imports records from <code className="bg-slate-100 px-1 py-0.5 rounded font-mono">Rent Details 2026.xlsx</code>, <code className="bg-slate-100 px-1 py-0.5 rounded font-mono">Jan 26.xlsx</code>, <code className="bg-slate-100 px-1 py-0.5 rounded font-mono">Feb 26.xlsx</code>, and <code className="bg-slate-100 px-1 py-0.5 rounded font-mono">Mar 26.xlsx</code> into MongoDB with idempotency.
          </p>
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={() => handleRunMigration(true)}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm font-semibold transition-colors disabled:opacity-50"
          >
            <Play className="w-4 h-4 text-slate-500" />
            <span>Simulate Dry Run (Safe Test)</span>
          </button>
          <button
            onClick={() => handleRunMigration(false)}
            disabled={loading}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition-colors shadow-md shadow-emerald-600/20 disabled:opacity-50"
          >
            <Database className="w-4 h-4" />
            <span>{loading ? 'Processing...' : 'Run Full Verified Migration'}</span>
          </button>
        </div>

        {migrationResult && (
          <div className="mt-6 p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-2">
            <h4 className="font-bold text-slate-800 text-sm">Migration Execution Summary:</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-slate-600">
              <div>Properties Created/Updated: <strong className="text-slate-900">{migrationResult.propertiesCreated}</strong></div>
              <div>Units Created/Updated: <strong className="text-slate-900">{migrationResult.unitsCreated}</strong></div>
              <div>Tenants Created/Updated: <strong className="text-slate-900">{migrationResult.tenantsCreated}</strong></div>
              <div>Agreements / Effective Rates: <strong className="text-slate-900">{migrationResult.agreementsCreated}</strong></div>
              <div>Receipts Recorded: <strong className="text-emerald-700">{migrationResult.paymentsCreated}</strong></div>
              <div>Rent Month Allocations: <strong className="text-emerald-700">{migrationResult.allocationsCreated}</strong></div>
              <div>PG Monthly Settlements: <strong className="text-slate-900">{migrationResult.pgSettlementsCreated}</strong></div>
              <div>Property Expenses: <strong className="text-rose-700">{migrationResult.expensesCreated}</strong></div>
            </div>
          </div>
        )}
      </div>

      {/* Migration Audit Notes */}
      <div className="bg-amber-50/70 border border-amber-200 rounded-2xl p-6 text-xs text-amber-900 space-y-2">
        <div className="flex items-center gap-2 font-bold text-amber-900 text-sm">
          <AlertTriangle className="w-4 h-4 text-amber-600" />
          <span>Accounting Policy & Historical Adjustments Preserved</span>
        </div>
        <p>
          • <strong>Mahendra Bhai (65 No Godown):</strong> Marked as Vacant/Empty in active occupancy per source note ("Empty"). Past uncollected claims are flagged rather than assumed paid.
        </p>
        <p>
          • <strong>Amri Kids (Byculla Club):</strong> Rent split structure explicitly modeled: Total monthly rent ₹88,000 comprising ₹40,000 cheque and ₹48,000 cash portion.
        </p>
        <p>
          • <strong>Mar 2026 Private Charity / Zakat:</strong> Flagged in source worksheet notes as personal expenses (₹810,000 and ₹1,900,000). Preserved in historical cash flow difference with appropriate category flags.
        </p>
      </div>
    </div>
  );
}
