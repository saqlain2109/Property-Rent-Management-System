import React, { useState, useEffect, useRef } from 'react';
import { 
  Columns3, Filter, Table, SlidersHorizontal, 
  Download, Bookmark, RotateCcw, X, Plus, Trash2, 
  ChevronRight, Check, ArrowUpDown, ChevronDown
} from 'lucide-react';

export default function ApexToolbar({
  search,
  searchValue,
  searchPlaceholder = 'Search...',
  onSearchChange,
  rowsPerPage,
  onRowsPerPageChange,
  availableRowsOptions = [5, 10, 25, 50, 100, 'All'],
  columns = [],
  visibleColumns = [],
  onChangeVisibleColumns,
  onVisibleColumnsChange,
  columnWidths,
  onResetWidths,
  isHeaderSticky = true,
  onToggleHeaderSticky,
  filters,
  activeFilters,
  onFiltersChange,
  onExport,
  onExportExcel,
  storageKey = 'default_grid',
  storageKeyPrefix,
  activeViewName,
  activeViewId,
  onViewChange,
  onSaveView,
  onLoadView,
  primaryAction,
  filterSuggestions = {} // { [columnId]: ['Value1', 'Value2'] }
}) {
  const currentSearch = search !== undefined ? search : (searchValue !== undefined ? searchValue : '');
  const currentFilters = activeFilters !== undefined ? activeFilters : (filters !== undefined ? filters : []);
  const currentStorageKey = storageKeyPrefix || storageKey || 'default_grid';
  const currentActiveView = activeViewName || activeViewId || null;
  const triggerExport = onExport || onExportExcel;

  const setVisibleCols = (cols) => {
    onChangeVisibleColumns?.(cols);
    onVisibleColumnsChange?.(cols);
  };

  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const [activeSubMenu, setActiveSubMenu] = useState(null); // 'columns' | 'filter' | 'report'
  const [savedViews, setSavedViews] = useState([]);
  const [newViewName, setNewViewName] = useState('');
  const [showSaveViewInput, setShowSaveViewInput] = useState(false);

  // Filter Builder Dialog state
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [filterDraft, setFilterDraft] = useState([]);
  const [manualInputMap, setManualInputMap] = useState({});

  // Load Saved Views from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(`views_${currentStorageKey}`);
      if (saved) setSavedViews(JSON.parse(saved));
    } catch (e) {}
  }, [currentStorageKey]);

  // Close menus on click outside
  const menuRef = useRef(null);
  useEffect(() => {
    function handleClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setShowActionsMenu(false);
        setActiveSubMenu(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleToggleColumn = (colId) => {
    let next;
    if (visibleColumns.includes(colId)) {
      if (visibleColumns.length <= 1) return; // Prevent hiding everything
      next = visibleColumns.filter(c => c !== colId);
    } else {
      next = [...visibleColumns, colId];
    }
    setVisibleCols(next);
    try {
      localStorage.setItem(`cols_${currentStorageKey}`, JSON.stringify(next));
    } catch (e) {}
  };

  const handleSaveView = (e) => {
    e?.preventDefault();
    if (!newViewName.trim()) return;
    const newView = {
      id: 'view_' + Date.now(),
      name: newViewName.trim(),
      visibleColumns,
      filters: currentFilters,
      rowsPerPage,
      search: currentSearch,
      isHeaderSticky,
      createdAt: new Date().toISOString()
    };
    const updated = [...savedViews, newView];
    setSavedViews(updated);
    try {
      localStorage.setItem(`views_${currentStorageKey}`, JSON.stringify(updated));
    } catch (e) {}
    onViewChange?.(newView.id);
    onSaveView?.(newView);
    setNewViewName('');
    setShowSaveViewInput(false);
    setShowActionsMenu(false);
    setActiveSubMenu(null);
  };

  const handleApplySavedView = (view) => {
    setVisibleCols(view.visibleColumns);
    onFiltersChange?.(view.filters || []);
    if (view.rowsPerPage) onRowsPerPageChange?.(view.rowsPerPage);
    if (view.search !== undefined) onSearchChange?.(view.search);
    if (view.isHeaderSticky !== undefined && onToggleHeaderSticky) {
      onToggleHeaderSticky(view.isHeaderSticky);
    }
    onViewChange?.(view.id);
    onLoadView?.(view);
    setShowActionsMenu(false);
    setActiveSubMenu(null);
  };

  const handleDeleteSavedView = (viewId, e) => {
    e.stopPropagation();
    const updated = savedViews.filter(v => v.id !== viewId);
    setSavedViews(updated);
    try {
      localStorage.setItem(`views_${currentStorageKey}`, JSON.stringify(updated));
    } catch (e) {}
    if (currentActiveView === viewId) onViewChange?.(null);
  };

  const handleResetToDefault = () => {
    const defaultCols = columns.filter(c => c.defaultVisible !== false).map(c => c.id);
    setVisibleCols(defaultCols);
    try {
      localStorage.setItem(`cols_${currentStorageKey}`, JSON.stringify(defaultCols));
    } catch (e) {}
    onFiltersChange?.([]);
    onRowsPerPageChange?.(10);
    onSearchChange?.('');
    onResetWidths?.();
    onViewChange?.(null);
    setShowActionsMenu(false);
    setActiveSubMenu(null);
  };

  const openFilterModal = () => {
    const firstCol = columns.find(c => c.id !== 'actions') || columns[0];
    setFilterDraft(currentFilters.length > 0 ? [...currentFilters] : [{
      id: 'f_' + Date.now(),
      columnId: firstCol?.id || '',
      operator: 'contains',
      value: ''
    }]);
    setManualInputMap({});
    setShowFilterModal(true);
    setShowActionsMenu(false);
    setActiveSubMenu(null);
  };

  const handleApplyFilters = () => {
    const valid = filterDraft.filter(f => {
      if (!f.columnId) return false;
      if (f.operator === 'is_empty' || f.operator === 'is_not_empty') return true;
      return f.value !== undefined && f.value !== null && String(f.value).trim() !== '';
    });
    onFiltersChange?.(valid);
    setShowFilterModal(false);
  };

  const filterableColumns = columns.filter(c => c.id !== 'actions');

  return (
    <div className="space-y-3">
      {/* Top Toolbar Container */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200 shadow-xs select-none">
        {/* Left Side: Search, Rows dropdown, Actions Menu */}
        <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[280px]">
          {/* Search Box */}
          <div className="relative flex-1 sm:max-w-xs min-w-[160px]">
            <input
              type="text"
              placeholder={searchPlaceholder || 'Search...'}
              value={currentSearch}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full pl-3.5 pr-8 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-white focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 transition-all font-medium text-slate-800 placeholder:text-slate-400"
            />
            {currentSearch && (
              <button 
                onClick={() => onSearchChange('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Rows Selector */}
          <div className="flex items-center gap-1.5 text-xs text-slate-600 font-semibold bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5">
            <span className="text-slate-400 font-normal">Rows</span>
            <select
              value={rowsPerPage}
              onChange={(e) => {
                const val = e.target.value === 'All' ? 'All' : Number(e.target.value);
                onRowsPerPageChange(val);
              }}
              className="bg-transparent text-xs font-bold text-slate-800 focus:outline-none cursor-pointer"
            >
              {availableRowsOptions.map(opt => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </div>

          {/* Actions Menu Dropdown (Oracle APEX Style) */}
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => {
                setShowActionsMenu(!showActionsMenu);
                setActiveSubMenu(null);
              }}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-all ${
                showActionsMenu 
                  ? 'bg-slate-900 text-white border-slate-900 shadow-xs' 
                  : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-teal-600" />
              <span>Actions</span>
              <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform ${showActionsMenu ? 'rotate-180' : ''}`} />
            </button>

            {/* APEX Context Menu */}
            {showActionsMenu && (
              <div className="absolute left-0 top-full mt-1.5 w-64 max-w-[calc(100vw-2rem)] bg-white rounded-2xl shadow-xl border border-slate-200 py-1.5 z-40 animate-in fade-in zoom-in-95 duration-100">
                {/* 1. Columns Submenu Trigger */}
                <button
                  type="button"
                  onClick={() => setActiveSubMenu(activeSubMenu === 'columns' ? null : 'columns')}
                  className={`w-full px-3.5 py-2 text-left text-xs font-semibold flex items-center justify-between hover:bg-slate-50 transition-colors ${
                    activeSubMenu === 'columns' ? 'bg-teal-50 text-teal-800' : 'text-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Columns3 className="w-4 h-4 text-slate-400" />
                    <span>Columns ({visibleColumns.length}/{columns.length})</span>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                </button>

                {/* Columns Selection Flyout */}
                {activeSubMenu === 'columns' && (
                  <div className="px-3 py-2 border-t border-b border-slate-100 bg-slate-50/70 max-h-56 overflow-y-auto space-y-1">
                    {columns.map(col => {
                      const isVisible = visibleColumns.includes(col.id);
                      return (
                        <label
                          key={col.id}
                          className="flex items-center gap-2 py-1 px-1.5 rounded-lg hover:bg-white text-xs font-medium text-slate-700 cursor-pointer select-none"
                        >
                          <input
                            type="checkbox"
                            checked={isVisible}
                            onChange={() => handleToggleColumn(col.id)}
                            className="w-3.5 h-3.5 rounded text-teal-600 focus:ring-teal-500 border-slate-300"
                          />
                          <span className={isVisible ? 'text-slate-900 font-semibold' : 'text-slate-400 line-through'}>
                            {col.label}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}

                {/* 2. Filter Builder Trigger */}
                <button
                  type="button"
                  onClick={openFilterModal}
                  className="w-full px-3.5 py-2 text-left text-xs font-semibold flex items-center justify-between hover:bg-slate-50 text-slate-700 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Filter className="w-4 h-4 text-slate-400" />
                    <span>Filter</span>
                  </div>
                  {currentFilters.length > 0 && (
                    <span className="bg-teal-100 text-teal-800 px-1.5 py-0.5 rounded-full text-[10px] font-bold">
                      {currentFilters.length} active
                    </span>
                  )}
                </button>

                {/* 3. Freeze Header Column Toggle */}
                <button
                  type="button"
                  onClick={() => onToggleHeaderSticky?.(!isHeaderSticky)}
                  className="w-full px-3.5 py-2 text-left text-xs font-semibold flex items-center justify-between hover:bg-slate-50 text-slate-700 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Table className="w-4 h-4 text-slate-400" />
                    <span>Freeze Header Row</span>
                  </div>
                  {isHeaderSticky ? (
                    <span className="text-[10px] font-bold text-teal-600 bg-teal-50 px-2 py-0.5 rounded-full">Frozen</span>
                  ) : (
                    <span className="text-[10px] text-slate-400">Normal</span>
                  )}
                </button>

                <div className="my-1 border-t border-slate-100"></div>

                {/* 4. Report / Saved Views Submenu Trigger */}
                <button
                  type="button"
                  onClick={() => setActiveSubMenu(activeSubMenu === 'report' ? null : 'report')}
                  className={`w-full px-3.5 py-2 text-left text-xs font-semibold flex items-center justify-between hover:bg-slate-50 transition-colors ${
                    activeSubMenu === 'report' ? 'bg-teal-50 text-teal-800' : 'text-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Bookmark className="w-4 h-4 text-slate-400" />
                    <span>Report / Views</span>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                </button>

                {/* Report / Save View Flyout */}
                {activeSubMenu === 'report' && (
                  <div className="px-3 py-2 border-t border-b border-slate-100 bg-slate-50/70 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">Saved Views</span>
                      {!showSaveViewInput && (
                        <button
                          type="button"
                          onClick={() => setShowSaveViewInput(true)}
                          className="text-[11px] font-bold text-teal-600 hover:text-teal-700 flex items-center gap-1"
                        >
                          <Plus className="w-3 h-3" /> Save View
                        </button>
                      )}
                    </div>

                    {/* New View Name Input */}
                    {showSaveViewInput && (
                      <form onSubmit={handleSaveView} className="space-y-1.5 pt-1">
                        <input
                          type="text"
                          required
                          placeholder="e.g. Active High Value"
                          value={newViewName}
                          onChange={(e) => setNewViewName(e.target.value)}
                          className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-1 focus:ring-teal-500 font-medium"
                          autoFocus
                        />
                        <div className="flex justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setShowSaveViewInput(false)}
                            className="px-2 py-0.5 text-[11px] font-semibold text-slate-500 hover:text-slate-800"
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            className="px-2.5 py-0.5 text-[11px] font-bold bg-teal-600 text-white rounded-md hover:bg-teal-700"
                          >
                            Save
                          </button>
                        </div>
                      </form>
                    )}

                    {/* List of saved views */}
                    <div className="max-h-36 overflow-y-auto space-y-1 pt-1">
                      {savedViews.length === 0 ? (
                        <p className="text-[11px] text-slate-400 italic">No custom views saved yet.</p>
                      ) : (
                        savedViews.map(view => (
                          <div
                            key={view.id}
                            onClick={() => handleApplySavedView(view)}
                            className={`flex items-center justify-between p-1.5 rounded-lg text-xs cursor-pointer transition-colors ${
                              currentActiveView === view.id ? 'bg-teal-600 text-white font-bold' : 'hover:bg-white text-slate-700'
                            }`}
                          >
                            <span className="truncate pr-2">{view.name}</span>
                            <button
                              type="button"
                              onClick={(e) => handleDeleteSavedView(view.id, e)}
                              className={`p-1 rounded hover:bg-rose-100 hover:text-rose-600 ${
                                currentActiveView === view.id ? 'text-teal-200' : 'text-slate-400'
                              }`}
                              title="Delete view"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}

                {/* 5. Download Filtered Data */}
                <button
                  type="button"
                  onClick={() => {
                    triggerExport?.();
                    setShowActionsMenu(false);
                    setActiveSubMenu(null);
                  }}
                  className="w-full px-3.5 py-2 text-left text-xs font-semibold flex items-center gap-2 hover:bg-slate-50 text-slate-700 transition-colors"
                >
                  <Download className="w-4 h-4 text-slate-400" />
                  <span>Download / Export Filtered</span>
                </button>

                <div className="my-1 border-t border-slate-100"></div>

                {/* 6. Reset to Default */}
                <button
                  type="button"
                  onClick={handleResetToDefault}
                  className="w-full px-3.5 py-2 text-left text-xs font-semibold flex items-center gap-2 hover:bg-rose-50 text-rose-600 transition-colors"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>Reset All (Columns & Filters)</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Quick Action & Active Views indicator */}
        <div className="flex items-center gap-2">
          {onResetWidths && (
            <button
              type="button"
              onClick={onResetWidths}
              className="hidden lg:flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 text-xs font-bold transition-all"
              title="Reset column widths"
            >
              <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
              <span>Reset Widths</span>
            </button>
          )}

          {onExport && (
            <button
              type="button"
              onClick={onExport}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition-all shadow-xs"
              title="Export filtered records"
            >
              <Download className="w-3.5 h-3.5 text-teal-600" />
              <span className="hidden sm:inline">Download</span>
            </button>
          )}

          {primaryAction}
        </div>
      </div>

      {/* Filter Badges Bar (Shows active filters with one-click remove) */}
      {currentFilters.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 px-1">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1">
            <Filter className="w-3 h-3 text-teal-600" />
            Applied Filters:
          </span>
          {currentFilters.map(f => {
            const col = columns.find(c => c.id === f.columnId);
            const isUnary = f.operator === 'is_empty' || f.operator === 'is_not_empty';
            const operatorLabels = {
              contains: 'contains',
              does_not_contain: 'does not contain',
              equals: '=',
              not_equals: '≠',
              starts_with: 'starts with',
              ends_with: 'ends with',
              greater_than: '>',
              greater_than_or_equal: '≥',
              less_than: '<',
              less_than_or_equal: '≤',
              is_empty: 'is empty',
              is_not_empty: 'is not empty'
            };
            return (
              <span
                key={f.id}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-teal-50 border border-teal-200 text-teal-900 text-xs font-semibold animate-in fade-in"
              >
                <span className="text-teal-700 font-bold">{col?.label || f.columnId}</span>
                <span className="text-teal-600 font-mono text-[11px]">{operatorLabels[f.operator] || f.operator}</span>
                {!isUnary && (
                  <span className="bg-white px-1.5 py-0.2 rounded text-slate-800 font-bold border border-teal-200/60">
                    "{f.value}"
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => onFiltersChange(currentFilters.filter(item => item.id !== f.id))}
                  className="p-0.5 rounded hover:bg-teal-200/50 text-teal-700"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            );
          })}
          <button
            type="button"
            onClick={() => onFiltersChange([])}
            className="text-xs text-rose-600 hover:text-rose-800 font-bold underline px-1"
          >
            Clear All
          </button>
        </div>
      )}

      {/* APEX-style Filter Modal with Value Dropdown & Condition Builder */}
      {showFilterModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white w-full max-w-xl max-h-[90vh] rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150 flex flex-col">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-teal-600" />
                <h3 className="font-extrabold text-slate-900 text-sm">Filter Criteria Builder</h3>
              </div>
              <button
                onClick={() => setShowFilterModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-3 max-h-96 overflow-y-auto">
              {filterDraft.map((f, idx) => {
                const suggestions = filterSuggestions[f.columnId] || [];
                const isUnary = f.operator === 'is_empty' || f.operator === 'is_not_empty';
                const isManual = manualInputMap[f.id] || suggestions.length === 0;

                return (
                  <div key={f.id} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                    {/* Column Picker */}
                    <select
                      value={f.columnId}
                      onChange={(e) => {
                        const updated = [...filterDraft];
                        updated[idx].columnId = e.target.value;
                        updated[idx].value = ''; // Reset value when column changes
                        setFilterDraft(updated);
                        // Reset manual mode if suggestions exist for the new column
                        const newSuggestions = filterSuggestions[e.target.value] || [];
                        setManualInputMap(prev => ({ ...prev, [f.id]: newSuggestions.length === 0 }));
                      }}
                      className="w-full sm:w-1/3 px-2 py-1.5 text-xs rounded-lg border border-slate-300 bg-white font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-500"
                    >
                      {filterableColumns.map(col => (
                        <option key={col.id} value={col.id}>{col.label}</option>
                      ))}
                    </select>

                    {/* Operator */}
                    <select
                      value={f.operator}
                      onChange={(e) => {
                        const updated = [...filterDraft];
                        updated[idx].operator = e.target.value;
                        setFilterDraft(updated);
                      }}
                      className="w-full sm:w-1/4 px-2 py-1.5 text-xs rounded-lg border border-slate-300 bg-white font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-teal-500"
                    >
                      <option value="contains">contains</option>
                      <option value="does_not_contain">does not contain</option>
                      <option value="equals">=</option>
                      <option value="not_equals">≠</option>
                      <option value="starts_with">starts with</option>
                      <option value="ends_with">ends with</option>
                      <option value="greater_than">&gt;</option>
                      <option value="greater_than_or_equal">≥</option>
                      <option value="less_than">&lt;</option>
                      <option value="less_than_or_equal">≤</option>
                      <option value="is_empty">is empty / null</option>
                      <option value="is_not_empty">is not empty / filled</option>
                    </select>

                    {/* Value Field with Dropdown (Suggestions) OR Free Text Input */}
                    <div className="flex-1 relative">
                      {isUnary ? (
                        <div className="px-2.5 py-1.5 text-xs rounded-lg bg-slate-100 text-slate-400 italic font-medium">
                          (No value needed)
                        </div>
                      ) : !isManual ? (
                        <div className="flex items-center gap-1">
                          <select
                            value={suggestions.includes(f.value) ? f.value : (f.value ? '__custom__' : '')}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val === '__custom__') {
                                setManualInputMap(prev => ({ ...prev, [f.id]: true }));
                              } else {
                                const updated = [...filterDraft];
                                updated[idx].value = val;
                                setFilterDraft(updated);
                              }
                            }}
                            className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-500"
                          >
                            <option value="">-- Choose from existing values ({suggestions.length}) --</option>
                            {suggestions.map((val, i) => (
                              <option key={i} value={val}>{val}</option>
                            ))}
                            <option value="__custom__">✏️ Type custom text...</option>
                          </select>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            list={`suggestions_${f.columnId}`}
                            placeholder="Type value..."
                            value={f.value}
                            onChange={(e) => {
                              const updated = [...filterDraft];
                              updated[idx].value = e.target.value;
                              setFilterDraft(updated);
                            }}
                            className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-500"
                            autoFocus={isManual && suggestions.length > 0}
                          />
                          {suggestions.length > 0 && (
                            <>
                              <datalist id={`suggestions_${f.columnId}`}>
                                {suggestions.map((val, i) => (
                                  <option key={i} value={val} />
                                ))}
                              </datalist>
                              <button
                                type="button"
                                onClick={() => setManualInputMap(prev => ({ ...prev, [f.id]: false }))}
                                className="px-2 py-1 text-[10px] font-bold text-teal-700 bg-teal-50 hover:bg-teal-100 rounded border border-teal-200 shrink-0"
                                title="Switch back to dropdown list"
                              >
                                List
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Delete row */}
                    <button
                      type="button"
                      onClick={() => {
                        if (filterDraft.length <= 1) {
                          setFilterDraft([{ id: 'f_' + Date.now(), columnId: filterableColumns[0]?.id || '', operator: 'contains', value: '' }]);
                        } else {
                          setFilterDraft(filterDraft.filter((_, i) => i !== idx));
                        }
                      }}
                      className="self-end sm:self-center p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                      title="Remove filter rule"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}

              <button
                type="button"
                onClick={() => setFilterDraft([...filterDraft, {
                  id: 'f_' + Date.now(),
                  columnId: filterableColumns[0]?.id || '',
                  operator: 'contains',
                  value: ''
                }])}
                className="flex items-center gap-1.5 text-xs font-bold text-teal-600 hover:text-teal-800 pt-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Expression Row</span>
              </button>
            </div>

            <div className="p-3 border-t border-slate-200 flex justify-end gap-2 bg-slate-50">
              <button
                type="button"
                onClick={() => setShowFilterModal(false)}
                className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-200 rounded-xl"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleApplyFilters}
                className="px-4 py-1.5 text-xs font-bold bg-slate-900 text-white rounded-xl hover:bg-slate-800 shadow-xs"
              >
                Apply Filters
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
