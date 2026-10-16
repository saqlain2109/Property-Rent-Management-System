import React, { useState, useEffect } from 'react';
import API from '../services/api';
import { formatCurrency, formatMonthYear } from '../utils/formatters';
import ColumnManager, { getHeaderDragProps, useResizableColumns, ResizeHandle } from '../components/ColumnManager';
import { Users, DollarSign, Calculator, Plus, CheckCircle2, Edit, RotateCcw } from 'lucide-react';

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
  notes: 140
};

export default function PGView() {
  const [settlements, setSettlements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingSettlement, setEditingSettlement] = useState(null);

  const [visibleColumns, setVisibleColumns] = useState(() => {
    const saved = localStorage.getItem('cols_pg_settlements');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) {}
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

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-200/80">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Paying Guest (PG) Master & Settlement</h2>
          <p className="text-sm text-slate-500">
            Multi-occupant PG gross revenue tracking with operator deductions (Altaf, Anand, Bisleri water)
          </p>
        </div>
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
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          <span>New PG Monthly Settlement</span>
        </button>
      </div>

      {/* Settlements Table */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-bold text-slate-800 text-base">Historical PG Collections & Deductions</h3>
          <div className="flex items-center gap-2">
            <ColumnManager
              columns={PG_COLUMNS_DEF}
              visibleColumns={visibleColumns}
              onChangeVisible={setVisibleColumns}
              storageKey="pg_settlements"
              onResetWidths={resetColumnWidths}
            />
            <button
              type="button"
              onClick={resetColumnWidths}
              className="flex items-center gap-1.5 px-2.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-900 text-xs font-bold transition-all shadow-xs"
              title="Reset column widths"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Reset Widths</span>
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
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
            <thead>
              <tr className="border-b border-slate-200 text-slate-500 uppercase font-extrabold select-none">
                {visibleColumns.map((colId) => {
                  const dragProps = getHeaderDragProps(colId, visibleColumns, setVisibleColumns, 'pg_settlements');
                  const width = columnWidths[colId] || DEFAULT_PG_COLUMN_WIDTHS[colId] || 100;
                  let align = 'text-left';
                  if (colId === 'actions') align = 'text-right';
                  let label = colId;
                  if (colId === 'month') label = 'Month';
                  else if (colId === 'gross') label = 'Gross Collection';
                  else if (colId === 'altaf') label = 'Altaf Share';
                  else if (colId === 'anand') label = 'Anand Share';
                  else if (colId === 'bisleri') label = 'Bisleri Water';
                  else if (colId === 'deductions') label = 'Total Deductions';
                  else if (colId === 'net') label = 'Net Received by Owner';
                  else if (colId === 'rehan') label = 'Rehan Share';
                  else if (colId === 'actualBank') label = 'Actual Bank Received';
                  else if (colId === 'difference') label = 'Variance';
                  else if (colId === 'notes') label = 'Notes';
                  else if (colId === 'actions') label = 'Actions';
                  else {
                    const colDef = PG_COLUMNS_DEF.find(c => c.id === colId);
                    if (colDef) label = colDef.label;
                  }

                  return (
                    <th
                      key={colId}
                      {...dragProps}
                      style={{ width: `${width}px` }}
                      className={`pb-3 pr-2 border-r border-slate-100 relative group ${align}`}
                    >
                      <span className="truncate block pr-2">{label}</span>
                      <ResizeHandle colId={colId} onResizeStart={handleResizeStart} />
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {settlements.length === 0 ? (
                <tr>
                  <td colSpan={visibleColumns.length} className="py-8 text-center text-slate-400">
                    No PG settlements recorded yet.
                  </td>
                </tr>
              ) : (
                settlements.map((s) => {
                  const actualBank = s.actualBankReceived != null ? Number(s.actualBankReceived) : null;
                  const variance = actualBank != null ? actualBank - Number(s.netReceivedByOwner || 0) : null;

                  return (
                    <tr key={s._id} className="hover:bg-slate-50/50">
                      {visibleColumns.map((colId) => {
                        if (colId === 'month') {
                          return (
                            <td key={colId} className="py-3.5 font-bold text-slate-900 text-xs">
                              {formatMonthYear(s.monthYear)}
                            </td>
                          );
                        }
                        if (colId === 'gross') {
                          return (
                            <td key={colId} className="py-3.5 font-semibold text-slate-800 text-xs">
                              {formatCurrency(s.pgGrossCollection)}
                            </td>
                          );
                        }
                        if (colId === 'altaf') {
                          return (
                            <td key={colId} className="py-3.5 text-xs text-slate-600">
                              {formatCurrency(s.altafShare)}
                            </td>
                          );
                        }
                        if (colId === 'anand') {
                          return (
                            <td key={colId} className="py-3.5 text-xs text-slate-600">
                              {formatCurrency(s.anandShare)}
                            </td>
                          );
                        }
                        if (colId === 'bisleri') {
                          return (
                            <td key={colId} className="py-3.5 text-xs text-slate-600">
                              {formatCurrency(s.bisleriWaterShare)}
                            </td>
                          );
                        }
                        if (colId === 'deductions') {
                          return (
                            <td key={colId} className="py-3.5 text-xs font-semibold text-rose-600">
                              {formatCurrency(s.totalOperatorDeductions)}
                            </td>
                          );
                        }
                        if (colId === 'net') {
                          return (
                            <td key={colId} className="py-3.5 font-bold text-emerald-600 text-xs">
                              {formatCurrency(s.netReceivedByOwner)}
                            </td>
                          );
                        }
                        if (colId === 'rehan') {
                          return (
                            <td key={colId} className="py-3.5 text-xs text-slate-600">
                              {s.rehanShare ? formatCurrency(s.rehanShare) : '₹0'}
                            </td>
                          );
                        }
                        if (colId === 'actualBank') {
                          return (
                            <td key={colId} className="py-3.5 text-xs font-semibold text-slate-800">
                              {actualBank != null ? formatCurrency(actualBank) : '—'}
                            </td>
                          );
                        }
                        if (colId === 'difference') {
                          return (
                            <td key={colId} className="py-3.5 text-xs font-mono">
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
                            <td key={colId} className="py-3.5 text-xs text-slate-500 max-w-xs truncate" title={s.notes}>
                              {s.notes || '—'}
                            </td>
                          );
                        }
                        if (colId === 'actions') {
                          return (
                            <td key={colId} className="py-3.5 text-right">
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
