import React, { useState, useEffect, useRef } from 'react';
import { Columns3, Check, ArrowUp, ArrowDown, RotateCcw } from 'lucide-react';

export default function ColumnManager({
  columns,          // array of { id, label, defaultVisible?: boolean }
  visibleColumns,   // array of string IDs
  onChangeVisible,  // fn(newArrayOfIds)
  storageKey        // optional key for localStorage persistence
}) {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const toggleColumn = (id) => {
    let next;
    if (visibleColumns.includes(id)) {
      if (visibleColumns.length <= 1) return; // keep at least 1 column
      next = visibleColumns.filter(c => c !== id);
    } else {
      next = [...visibleColumns, id];
    }
    onChangeVisible(next);
    if (storageKey) {
      localStorage.setItem(`cols_${storageKey}`, JSON.stringify(next));
    }
  };

  const moveColumn = (index, direction) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= visibleColumns.length) return;
    const next = [...visibleColumns];
    const [moved] = next.splice(index, 1);
    next.splice(targetIndex, 0, moved);
    onChangeVisible(next);
    if (storageKey) {
      localStorage.setItem(`cols_${storageKey}`, JSON.stringify(next));
    }
  };

  const resetColumns = () => {
    const defaultIds = columns.map(c => c.id);
    onChangeVisible(defaultIds);
    if (storageKey) {
      localStorage.removeItem(`cols_${storageKey}`);
    }
  };

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors shadow-sm"
        title="Customize which columns are visible and their order"
      >
        <Columns3 className="w-3.5 h-3.5 text-slate-500" />
        <span>Columns</span>
        <span className="ml-1 text-[10px] px-1.5 py-0.2 bg-slate-100 text-slate-600 rounded-full font-bold">
          {visibleColumns.length}/{columns.length}
        </span>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-64 bg-white rounded-2xl shadow-xl border border-slate-200 p-3 z-30 animate-scaleUp">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
            <p className="text-xs font-bold text-slate-800">Manage Columns</p>
            <button
              onClick={resetColumns}
              className="text-[11px] text-emerald-600 hover:text-emerald-700 font-semibold flex items-center gap-1"
              title="Reset to default"
            >
              <RotateCcw className="w-3 h-3" /> Reset
            </button>
          </div>

          <p className="text-[10px] text-slate-400 mb-2">Check to show/hide. Use arrows to reorder.</p>

          <div className="space-y-1.5 max-h-60 overflow-y-auto">
            {columns.map((col) => {
              const isVis = visibleColumns.includes(col.id);
              const visIndex = visibleColumns.indexOf(col.id);
              return (
                <div
                  key={col.id}
                  className="flex items-center justify-between p-1.5 rounded-lg hover:bg-slate-50 text-xs"
                >
                  <label className="flex items-center gap-2 cursor-pointer select-none flex-1 truncate">
                    <input
                      type="checkbox"
                      checked={isVis}
                      onChange={() => toggleColumn(col.id)}
                      className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 w-3.5 h-3.5 cursor-pointer"
                    />
                    <span className={`truncate ${isVis ? 'font-semibold text-slate-800' : 'text-slate-400'}`}>
                      {col.label}
                    </span>
                  </label>

                  {isVis && (
                    <div className="flex items-center gap-0.5 ml-2">
                      <button
                        onClick={() => moveColumn(visIndex, -1)}
                        disabled={visIndex === 0}
                        className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-20 transition-colors"
                        title="Move column left"
                      >
                        <ArrowUp className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => moveColumn(visIndex, 1)}
                        disabled={visIndex === visibleColumns.length - 1}
                        className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-20 transition-colors"
                        title="Move column right"
                      >
                        <ArrowDown className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
