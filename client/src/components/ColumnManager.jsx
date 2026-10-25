import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Columns3, Check, ArrowLeft, ArrowRight, ArrowUp, ArrowDown, 
  RotateCcw, GripVertical, MoveHorizontal, Eye, EyeOff,
  Filter, Search, X, ArrowUpDown, ChevronDown
} from 'lucide-react';

/**
 * Reorders columns array by moving an item from sourceId to targetId
 */
export function reorderColumnList(visibleColumns, sourceId, targetId, storageKey, onChangeVisible) {
  if (!sourceId || !targetId || sourceId === targetId) return;
  const sourceIndex = visibleColumns.indexOf(sourceId);
  const targetIndex = visibleColumns.indexOf(targetId);
  if (sourceIndex === -1 || targetIndex === -1) return;

  const next = [...visibleColumns];
  const [moved] = next.splice(sourceIndex, 1);
  next.splice(targetIndex, 0, moved);

  onChangeVisible(next);
  if (storageKey) {
    try {
      localStorage.setItem(`cols_${storageKey}`, JSON.stringify(next));
    } catch (e) {}
  }
}

/**
 * Helper to make any table header (<th>) draggable left & right across the table
 */
export function getHeaderDragProps(colId, visibleColumns, onChangeVisible, storageKey) {
  return {
    draggable: true,
    style: { cursor: 'grab' },
    title: 'Drag column left or right to reorder',
    onDragStart: (e) => {
      e.dataTransfer.setData('text/table-column-id', colId);
      e.dataTransfer.effectAllowed = 'move';
      e.currentTarget.style.opacity = '0.4';
    },
    onDragEnd: (e) => {
      e.currentTarget.style.opacity = '1';
      document.querySelectorAll('.col-drag-over-active').forEach(el => {
        el.classList.remove('col-drag-over-active', 'border-l-4', 'border-emerald-500', 'bg-emerald-50/50');
      });
    },
    onDragOver: (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      e.currentTarget.classList.add('col-drag-over-active', 'border-l-4', 'border-emerald-500', 'bg-emerald-50/50');
    },
    onDragLeave: (e) => {
      e.currentTarget.classList.remove('col-drag-over-active', 'border-l-4', 'border-emerald-500', 'bg-emerald-50/50');
    },
    onDrop: (e) => {
      e.preventDefault();
      e.currentTarget.classList.remove('col-drag-over-active', 'border-l-4', 'border-emerald-500', 'bg-emerald-50/50');
      const sourceId = e.dataTransfer.getData('text/table-column-id');
      if (sourceId && sourceId !== colId) {
        reorderColumnList(visibleColumns, sourceId, colId, storageKey, onChangeVisible);
      }
    }
  };
}

/**
 * Hook to manage customizable table column widths with localStorage persistence.
 * Fits within 100% table width by default (preventing horizontal scrollbars)
 * while letting user drag-resize columns if needed.
 */
export function useResizableColumns(storageKey, defaultWidths) {
  const [columnWidths, setColumnWidths] = useState(() => {
    if (!storageKey) return defaultWidths;
    const saved = localStorage.getItem(`col_widths_${storageKey}`);
    if (saved) {
      try {
        return { ...defaultWidths, ...JSON.parse(saved) };
      } catch (e) {}
    }
    return defaultWidths;
  });

  const [hasCustomWidths, setHasCustomWidths] = useState(() => {
    if (!storageKey) return false;
    return Boolean(localStorage.getItem(`col_widths_${storageKey}`));
  });

  // Dynamically merge new default column widths (e.g. dynamic month columns in matrix reports)
  useEffect(() => {
    if (!defaultWidths) return;
    setColumnWidths(prev => {
      let changed = false;
      const next = { ...prev };
      let saved = {};
      if (storageKey) {
        try {
          const s = localStorage.getItem(`col_widths_${storageKey}`);
          if (s) saved = JSON.parse(s);
        } catch (e) {}
      }
      for (const k of Object.keys(defaultWidths)) {
        if (next[k] === undefined) {
          next[k] = saved[k] !== undefined ? saved[k] : defaultWidths[k];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [defaultWidths, storageKey]);

  const handleResizeStart = (colId, e) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startWidth = columnWidths[colId] || defaultWidths[colId] || 100;

    const onMouseMove = (moveEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const newWidth = Math.max(35, Math.round(startWidth + deltaX));
      setColumnWidths(prev => ({
        ...prev,
        [colId]: newWidth
      }));
      setHasCustomWidths(true);
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      setColumnWidths(current => {
        if (storageKey) {
          try {
            localStorage.setItem(`col_widths_${storageKey}`, JSON.stringify(current));
          } catch (err) {}
        }
        return current;
      });
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  const resetColumnWidths = () => {
    setColumnWidths(defaultWidths);
    setHasCustomWidths(false);
    if (storageKey) {
      try {
        localStorage.removeItem(`col_widths_${storageKey}`);
      } catch (e) {}
    }
  };

  return {
    columnWidths,
    setColumnWidths,
    handleResizeStart,
    resetColumnWidths,
    hasCustomWidths
  };
}

/**
 * Handle rendered on the right border of table headers (<th>)
 */
export function ResizeHandle({ colId, onResizeStart }) {
  return (
    <div
      onMouseDown={(e) => onResizeStart(colId, e)}
      onClick={(e) => e.stopPropagation()}
      className="absolute right-0 top-0 bottom-0 w-3.5 cursor-col-resize hover:bg-teal-500 active:bg-teal-600 transition-colors flex items-center justify-center select-none z-20 group/handle"
      title="Drag left/right to resize column width"
    >
      <div className="w-[2px] h-3.5 bg-slate-400/50 group-hover/handle:bg-white rounded-full pointer-events-none" />
    </div>
  );
}

export default function ColumnManager({
  columns,          // array of { id, label, defaultVisible?: boolean }
  visibleColumns,   // array of string IDs
  onChangeVisible,  // fn(newArrayOfIds)
  storageKey,       // optional key for localStorage persistence
  onResetWidths     // optional callback when user resets widths
}) {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef(null);
  
  // Drag-and-drop state for dropdown list items
  const [draggedId, setDraggedId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);

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
      if (visibleColumns.length <= 1) return; // Keep at least 1 column visible
      next = visibleColumns.filter(c => c !== id);
    } else {
      next = [...visibleColumns, id];
    }
    onChangeVisible(next);
    if (storageKey) {
      localStorage.setItem(`cols_${storageKey}`, JSON.stringify(next));
    }
  };

  // Move column left (up in list) or right (down in list)
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
    const defaultIds = columns
      .filter(c => c.defaultVisible !== false)
      .map(c => c.id);
    onChangeVisible(defaultIds);
    if (storageKey) {
      localStorage.removeItem(`cols_${storageKey}`);
      localStorage.removeItem(`col_widths_${storageKey}`);
    }
    if (onResetWidths) {
      onResetWidths();
    }
  };

  // Item Drag Handlers inside dropdown
  const onDragStart = (e, id) => {
    setDraggedId(id);
    e.dataTransfer.setData('text/plain', id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const onDragOver = (e, id) => {
    e.preventDefault();
    if (draggedId && draggedId !== id) {
      setDragOverId(id);
    }
  };

  const onDragLeave = (id) => {
    if (dragOverId === id) {
      setDragOverId(null);
    }
  };

  const onDrop = (e, targetId) => {
    e.preventDefault();
    setDragOverId(null);
    const sourceId = draggedId || e.dataTransfer.getData('text/plain');
    if (!sourceId || sourceId === targetId) return;

    reorderColumnList(visibleColumns, sourceId, targetId, storageKey, onChangeVisible);
    setDraggedId(null);
  };

  // Build the dynamic ordered columns list:
  // 1. Active visible columns in their exact current visible sequence!
  // 2. Inactive / hidden columns at the bottom
  const visibleColumnObjects = visibleColumns
    .map(id => columns.find(c => c.id === id))
    .filter(Boolean);

  const hiddenColumnObjects = columns.filter(c => !visibleColumns.includes(c.id));

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl border transition-all shadow-sm ${
          open 
            ? 'bg-emerald-50 border-emerald-300 text-emerald-800 ring-2 ring-emerald-200' 
            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
        }`}
        title="Customize which columns are visible, drag or switch them left/right"
      >
        <Columns3 className="w-3.5 h-3.5 text-emerald-600" />
        <span>Columns</span>
        <span className="ml-1 text-[10px] px-1.5 py-0.5 bg-emerald-100/80 text-emerald-800 rounded-full font-extrabold">
          {visibleColumns.length}/{columns.length}
        </span>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 bg-white rounded-2xl shadow-2xl border border-slate-200 p-3.5 z-40 animate-scaleUp">
          {/* Header */}
          <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-slate-100">
            <div>
              <p className="text-xs font-extrabold text-slate-900 flex items-center gap-1.5">
                <Columns3 className="w-4 h-4 text-emerald-600" />
                <span>Manage Columns</span>
              </p>
              <p className="text-[10px] text-slate-400 mt-0.5">
                Drag or use arrows to shift columns Left & Right
              </p>
            </div>

            <button
              onClick={resetColumns}
              className="text-[11px] text-emerald-600 hover:text-emerald-700 font-bold flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-emerald-50 transition-colors"
              title="Reset to default columns layout"
            >
              <RotateCcw className="w-3 h-3" /> Reset
            </button>
          </div>

          {/* Quick Guide Pill */}
          <div className="flex items-center justify-between px-2.5 py-1.5 mb-2.5 bg-slate-50 rounded-xl border border-slate-200/80 text-[10px] font-semibold text-slate-600">
            <span className="flex items-center gap-1 text-slate-500">
              <ArrowLeft className="w-3 h-3 text-emerald-600" /> Top = Left Column
            </span>
            <span className="text-slate-300">|</span>
            <span className="flex items-center gap-1 text-slate-500">
              Bottom = Right Column <ArrowRight className="w-3 h-3 text-emerald-600" />
            </span>
          </div>

          {/* SECTION 1: ACTIVE / VISIBLE COLUMNS (Draggable & Reorderable) */}
          <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
            <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 px-1">
              Active Columns In Table ({visibleColumnObjects.length})
            </p>

            {visibleColumnObjects.map((col, visIndex) => {
              const isFirst = visIndex === 0;
              const isLast = visIndex === visibleColumnObjects.length - 1;
              const isDraggingThis = draggedId === col.id;
              const isOverThis = dragOverId === col.id;

              return (
                <div
                  key={col.id}
                  draggable={true}
                  onDragStart={(e) => onDragStart(e, col.id)}
                  onDragOver={(e) => onDragOver(e, col.id)}
                  onDragLeave={() => onDragLeave(col.id)}
                  onDrop={(e) => onDrop(e, col.id)}
                  onDragEnd={() => {
                    setDraggedId(null);
                    setDragOverId(null);
                  }}
                  className={`group flex items-center justify-between p-2 rounded-xl text-xs transition-all border ${
                    isDraggingThis
                      ? 'opacity-40 bg-slate-100 border-dashed border-slate-400'
                      : isOverThis
                      ? 'bg-emerald-50 border-emerald-500 shadow-sm ring-1 ring-emerald-300 scale-[1.01]'
                      : 'bg-white hover:bg-slate-50 border-slate-100 hover:border-slate-200'
                  }`}
                >
                  {/* Drag Handle & Column Info */}
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span 
                      className="cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-600 p-0.5 rounded"
                      title="Drag to reposition left or right"
                    >
                      <GripVertical className="w-3.5 h-3.5" />
                    </span>

                    <input
                      type="checkbox"
                      checked={true}
                      onChange={() => toggleColumn(col.id)}
                      className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 w-3.5 h-3.5 cursor-pointer shrink-0"
                    />

                    {/* Column order pill & title */}
                    <span className="text-[10px] font-mono text-slate-400 font-bold shrink-0">
                      #{visIndex + 1}
                    </span>

                    <span className="font-semibold text-slate-800 truncate" title={col.label}>
                      {col.label}
                    </span>
                  </div>

                  {/* Left / Right (Up / Down) Shift Buttons */}
                  <div className="flex items-center gap-1 shrink-0 ml-1.5">
                    {/* Shift Left (Up in list) */}
                    <button
                      onClick={() => moveColumn(visIndex, -1)}
                      disabled={isFirst}
                      className="p-1 rounded-lg text-slate-400 hover:text-emerald-700 hover:bg-emerald-50 disabled:opacity-20 disabled:hover:bg-transparent disabled:hover:text-slate-400 transition-colors"
                      title="Shift Left in Table"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                    </button>

                    {/* Shift Right (Down in list) */}
                    <button
                      onClick={() => moveColumn(visIndex, 1)}
                      disabled={isLast}
                      className="p-1 rounded-lg text-slate-400 hover:text-emerald-700 hover:bg-emerald-50 disabled:opacity-20 disabled:hover:bg-transparent disabled:hover:text-slate-400 transition-colors"
                      title="Shift Right in Table"
                    >
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}

            {/* SECTION 2: HIDDEN / ADDITIONAL COLUMNS */}
            {hiddenColumnObjects.length > 0 && (
              <div className="pt-3 mt-2 border-t border-slate-100">
                <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 px-1 mb-1.5 flex items-center justify-between">
                  <span>Additional Columns ({hiddenColumnObjects.length})</span>
                  <span className="text-[9px] font-normal normal-case text-slate-400">Check to add</span>
                </p>

                <div className="space-y-1">
                  {hiddenColumnObjects.map((col) => (
                    <label
                      key={col.id}
                      className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-slate-50 text-xs cursor-pointer select-none border border-transparent hover:border-slate-200 transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={false}
                        onChange={() => toggleColumn(col.id)}
                        className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 w-3.5 h-3.5 cursor-pointer ml-1"
                      />
                      <span className="text-slate-500 hover:text-slate-800 truncate">
                        {col.label}
                      </span>
                      <span className="ml-auto text-[10px] text-emerald-600 font-bold opacity-0 group-hover:opacity-100">
                        + Add
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="mt-3 pt-2 border-t border-slate-100 text-center">
            <span className="text-[10px] text-slate-400">
              Tip: You can also drag column headers directly in the table!
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Hook to manage customizable frozen (sticky left) columns with localStorage persistence.
 * Gives full Excel-like column freeze functionality.
 */
export function useFrozenColumns(storageKey, defaultCount = 0) {
  const [frozenCount, setFrozenCount] = useState(() => {
    if (!storageKey) return defaultCount;
    try {
      const saved = localStorage.getItem(`freeze_${storageKey}`);
      return saved !== null ? Number(saved) : defaultCount;
    } catch {
      return defaultCount;
    }
  });

  const updateFrozenCount = (count) => {
    const num = Math.max(0, Number(count) || 0);
    setFrozenCount(num);
    if (storageKey) {
      try {
        localStorage.setItem(`freeze_${storageKey}`, String(num));
      } catch {}
    }
  };

  return [frozenCount, updateFrozenCount];
}

/**
 * Calculates cumulative left sticky position and border divider for frozen columns.
 */
export function getFrozenColumnStyle(colIndex, frozenCount, visibleColumns, columnWidths, isHeader = false) {
  if (colIndex >= frozenCount) return {};

  let leftOffset = 0;
  for (let i = 0; i < colIndex; i++) {
    const colId = visibleColumns[i];
    leftOffset += (columnWidths?.[colId] || 120);
  }

  const isLastFrozen = colIndex === frozenCount - 1;

  return {
    position: 'sticky',
    left: `${leftOffset}px`,
    top: isHeader ? 0 : undefined,
    zIndex: isHeader ? 50 : 15,
    backgroundColor: isHeader ? '#f1f5f9' : undefined,
    boxShadow: isLastFrozen ? '3px 0 6px -2px rgba(0, 0, 0, 0.12)' : undefined,
    borderRight: isLastFrozen ? '2px solid #94a3b8' : undefined
  };
}

/**
 * Available Universal Font Sizes across grids and forms
 */
export const APP_FONT_SIZES = ['xs', 'compact', 'normal', 'medium', 'comfortable', 'large', 'xl'];

/**
 * Hook for Universal Application Font Size with localStorage persistence
 */
export function useAppFontSize() {
  const [fontSize, setFontSizeState] = useState(() => {
    return localStorage.getItem('app_font_size') || 'normal';
  });

  const applyFontSizeClass = (size) => {
    if (typeof document === 'undefined') return;
    document.body.classList.remove(
      'font-xs', 'font-compact', 'font-normal', 'font-medium',
      'font-comfortable', 'font-large', 'font-xl'
    );
    document.body.classList.add(`font-${size || 'normal'}`);
  };

  useEffect(() => {
    applyFontSizeClass(fontSize);
  }, [fontSize]);

  const setFontSize = (size) => {
    setFontSizeState(size);
    try {
      localStorage.setItem('app_font_size', size);
    } catch (e) {}
    applyFontSizeClass(size);
  };

  const cycleFontSize = () => {
    const list = APP_FONT_SIZES;
    const nextIdx = (list.indexOf(fontSize) + 1) % list.length;
    setFontSize(list[nextIdx]);
  };

  return { fontSize, setFontSize, cycleFontSize, availableSizes: APP_FONT_SIZES };
}

/**
 * Hook for Grid Data Auto-Wrap with localStorage persistence
 */
export function useTableAutoWrap() {
  const [autoWrap, setAutoWrapState] = useState(() => {
    const saved = localStorage.getItem('app_grid_auto_wrap');
    return saved !== null ? saved === 'true' : false;
  });

  const applyAutoWrapClass = (enabled) => {
    if (typeof document === 'undefined') return;
    if (enabled) {
      document.body.classList.add('grid-auto-wrap');
    } else {
      document.body.classList.remove('grid-auto-wrap');
    }
  };

  useEffect(() => {
    applyAutoWrapClass(autoWrap);
  }, [autoWrap]);

  const setAutoWrap = (val) => {
    const next = typeof val === 'function' ? val(autoWrap) : Boolean(val);
    setAutoWrapState(next);
    try {
      localStorage.setItem('app_grid_auto_wrap', String(next));
    } catch (e) {}
    applyAutoWrapClass(next);
  };

  const toggleAutoWrap = () => setAutoWrap(prev => !prev);

  return { autoWrap, setAutoWrap, toggleAutoWrap };
}

/**
 * ColumnHeaderCell: Excel-style Header with Sort, Filter Popover, Resize Handle & Frozen Support
 */
export function ColumnHeaderCell({
  colId,
  label,
  align = 'left',
  width,
  minWidth = 45,
  maxWidth,
  isSortable = true,
  sortConfig,
  onSort,
  isFilterable = true,
  activeFilter,
  onApplyFilter,
  onClearFilter,
  uniqueValues = [],
  isDraggable = false,
  dragProps = {},
  isFrozen = false,
  frozenStyle = {},
  isHeaderSticky = true,
  onResizeStart,
  theme = 'dark',
  children,
  className = '',
  style = {}
}) {
  const [showFilter, setShowFilter] = useState(false);
  const [filterSearch, setFilterSearch] = useState('');
  const [selectedValues, setSelectedValues] = useState(() => {
    if (Array.isArray(activeFilter)) return activeFilter;
    if (typeof activeFilter === 'string' && activeFilter) return [activeFilter];
    return [];
  });
  const [textRule, setTextRule] = useState(() => {
    if (typeof activeFilter === 'string') return activeFilter;
    if (activeFilter?.value) return activeFilter.value;
    return '';
  });
  const popoverRef = useRef(null);

  useEffect(() => {
    if (Array.isArray(activeFilter)) {
      setSelectedValues(activeFilter);
    } else if (typeof activeFilter === 'string') {
      setTextRule(activeFilter);
      setSelectedValues(activeFilter ? [activeFilter] : []);
    } else if (activeFilter?.value) {
      setTextRule(activeFilter.value);
    } else {
      setSelectedValues([]);
      setTextRule('');
    }
  }, [activeFilter]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        setShowFilter(false);
      }
    }
    if (showFilter) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showFilter]);

  const hasActiveFilter = Boolean(
    (Array.isArray(activeFilter) && activeFilter.length > 0) ||
    (typeof activeFilter === 'string' && activeFilter.trim()) ||
    (activeFilter && activeFilter.value)
  );

  const isCurrentSorted = sortConfig?.key === colId;
  const sortDirection = isCurrentSorted ? sortConfig.direction : null;

  const handleHeaderClick = (e) => {
    if (isSortable && onSort) {
      onSort(colId);
    }
  };

  const toggleSelectValue = (val) => {
    setSelectedValues(prev => 
      prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val]
    );
  };

  const handleSelectAll = () => {
    setSelectedValues(uniqueValues.map(v => typeof v === 'object' ? v.value : v));
  };

  const handleClearSelected = () => {
    setSelectedValues([]);
    setTextRule('');
  };

  const handleApply = (e) => {
    e?.stopPropagation();
    if (uniqueValues.length > 0 && selectedValues.length > 0) {
      onApplyFilter?.(colId, selectedValues);
    } else if (textRule.trim()) {
      onApplyFilter?.(colId, { column: colId, operator: 'contains', value: textRule.trim() });
    } else {
      onClearFilter?.(colId);
    }
    setShowFilter(false);
  };

  const handleClear = (e) => {
    e?.stopPropagation();
    setSelectedValues([]);
    setTextRule('');
    onClearFilter?.(colId);
    setShowFilter(false);
  };

  const filteredUniqueValues = useMemo(() => {
    if (!filterSearch) return uniqueValues;
    const q = filterSearch.toLowerCase();
    return uniqueValues.filter(v => {
      const vLabel = typeof v === 'object' ? v.label : String(v);
      return vLabel.toLowerCase().includes(q);
    });
  }, [uniqueValues, filterSearch]);

  const effectiveWidth = width || minWidth;
  const isDark = theme === 'dark';

  return (
    <th
      {...(isDraggable ? dragProps : {})}
      onClick={handleHeaderClick}
      style={{
        width: `${effectiveWidth}px`,
        minWidth: `${minWidth}px`,
        maxWidth: maxWidth ? `${maxWidth}px` : undefined,
        ...(isHeaderSticky ? {
          position: 'sticky',
          top: 0,
          zIndex: (frozenStyle && frozenStyle.zIndex) ? Math.max(Number(frozenStyle.zIndex) || 0, 25) : 20
        } : {}),
        ...frozenStyle,
        ...style
      }}
      className={`relative group select-none py-2 px-2.5 transition-colors cursor-pointer ${
        isDark ? 'bg-slate-900 text-slate-100 hover:bg-slate-800' : 'bg-slate-100 text-slate-700 hover:bg-slate-200/80'
      } ${className}`}
      title={isSortable ? `Click to sort by ${label || colId}` : undefined}
    >
      <div className={`flex items-center gap-1.5 w-full ${
        align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-between'
      }`}>
        {/* Label & Sort Indicator */}
        <div className="flex items-center gap-1 min-w-0 max-w-full overflow-hidden">
          {children || (
            <span className="font-extrabold text-[11px] uppercase tracking-wider truncate">
              {label || colId}
            </span>
          )}

          {isSortable && (
            <span className="shrink-0 inline-flex items-center">
              {sortDirection === 'asc' ? (
                <ArrowUp className="w-3.5 h-3.5 text-teal-400 font-black animate-scaleUp" />
              ) : sortDirection === 'desc' ? (
                <ArrowDown className="w-3.5 h-3.5 text-teal-400 font-black animate-scaleUp" />
              ) : (
                <ArrowUpDown className="w-3 h-3 text-slate-400/60 opacity-0 group-hover:opacity-100 transition-opacity" />
              )}
            </span>
          )}
        </div>

        {/* Column-level Filter Icon */}
        {isFilterable && (onApplyFilter || onClearFilter) && (
          <div className="relative inline-flex items-center" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowFilter(prev => !prev);
              }}
              className={`p-1 rounded-md transition-all cursor-pointer ${
                hasActiveFilter
                  ? 'bg-teal-500 text-white shadow-xs ring-1 ring-teal-300'
                  : 'text-slate-400 hover:text-teal-400 hover:bg-slate-800/80 opacity-0 group-hover:opacity-100'
              }`}
              title={`Filter by ${label || colId}`}
            >
              <Filter className="w-3 h-3" />
            </button>

            {/* Filter Popover Dialog */}
            {showFilter && (
              <div
                ref={popoverRef}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
                className="absolute right-0 top-full mt-2 w-64 bg-white rounded-xl shadow-2xl border border-slate-200 p-3 z-50 text-slate-800 text-xs text-left animate-scaleUp normal-case font-normal"
              >
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
                  <span className="font-extrabold text-slate-900 flex items-center gap-1.5 truncate">
                    <Filter className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                    <span>Filter: {label || colId}</span>
                  </span>
                  {hasActiveFilter && (
                    <button
                      type="button"
                      onClick={handleClear}
                      className="text-[10px] text-rose-600 font-bold hover:underline"
                    >
                      Clear
                    </button>
                  )}
                </div>

                {/* Search / Text input */}
                <div className="relative mb-2">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-2 pointer-events-none" />
                  <input
                    type="text"
                    value={uniqueValues.length > 0 ? filterSearch : textRule}
                    onChange={(e) => {
                      if (uniqueValues.length > 0) {
                        setFilterSearch(e.target.value);
                      } else {
                        setTextRule(e.target.value);
                      }
                    }}
                    placeholder={uniqueValues.length > 0 ? "Search values..." : "Enter text to filter..."}
                    className="w-full pl-7 pr-2.5 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-teal-500 text-slate-900"
                    autoFocus
                  />
                </div>

                {/* Distinct Values Multi-Select List */}
                {uniqueValues.length > 0 && (
                  <>
                    <div className="flex items-center justify-between mb-1.5 text-[10px] font-bold text-slate-500">
                      <button
                        type="button"
                        onClick={handleSelectAll}
                        className="hover:text-teal-700 underline"
                      >
                        Select All
                      </button>
                      <button
                        type="button"
                        onClick={handleClearSelected}
                        className="hover:text-rose-700 underline"
                      >
                        Clear All
                      </button>
                    </div>

                    <div className="max-h-36 overflow-y-auto space-y-1 pr-1 border border-slate-100 rounded-lg p-1 bg-slate-50/50">
                      {filteredUniqueValues.length === 0 ? (
                        <p className="text-[11px] text-slate-400 p-2 text-center">No matching values</p>
                      ) : (
                        filteredUniqueValues.map((val, idx) => {
                          const vStr = typeof val === 'object' ? val.value : String(val);
                          const vLabel = typeof val === 'object' ? val.label : String(val);
                          const isChecked = selectedValues.includes(vStr);
                          return (
                            <label
                              key={idx}
                              className="flex items-center gap-2 p-1 rounded hover:bg-slate-100 cursor-pointer text-slate-700 text-[11px]"
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => toggleSelectValue(vStr)}
                                className="rounded border-slate-300 text-teal-600 focus:ring-teal-500 w-3 h-3 cursor-pointer"
                              />
                              <span className="truncate flex-1" title={vLabel}>{vLabel}</span>
                            </label>
                          );
                        })
                      )}
                    </div>
                  </>
                )}

                {/* Popover Action Buttons */}
                <div className="flex items-center justify-end gap-1.5 mt-2.5 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowFilter(false)}
                    className="px-2.5 py-1 text-[11px] font-semibold text-slate-500 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleApply}
                    className="px-3 py-1 text-[11px] font-bold bg-[#0f172a] hover:bg-slate-800 text-white rounded-lg transition-all shadow-xs cursor-pointer"
                  >
                    Apply Filter
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Resize Handle on Right Edge */}
      {onResizeStart && (
        <ResizeHandle colId={colId} onResizeStart={onResizeStart} />
      )}
    </th>
  );
}
