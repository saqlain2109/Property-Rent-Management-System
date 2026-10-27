import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { 
  Columns3, Filter, Table, SlidersHorizontal, 
  Download, Bookmark, RotateCcw, X, Plus, Trash2, 
  ChevronLeft, ChevronRight, Check, ArrowUpDown, ChevronDown,
  Search, Pin, Star
} from 'lucide-react';
import { useAppFontSize, useTableAutoWrap, APP_FONT_SIZES } from './ColumnManager';

export default function ApexToolbar({
  search,
  searchValue,
  searchPlaceholder = 'Search...',
  onSearchChange,
  rowsPerPage,
  onRowsPerPageChange,
  availableRowsOptions = [5, 10, 25, 50, 100, 'All'],
  columns = [],
  defaultColumns,
  visibleColumns = [],
  onChangeVisibleColumns,
  onVisibleColumnsChange,
  columnWidths,
  onResetWidths,
  onSetColumnWidths,
  sortConfig,
  onSortChange,
  isHeaderSticky = true,
  onToggleHeaderSticky,
  frozenColumnCount = 0,
  frozenCount,
  onFrozenColumnCountChange,
  onFrozenCountChange,
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
  const triggerExport = onExport || onExportExcel;

  const { fontSize, setFontSize, cycleFontSize } = useAppFontSize();
  const { autoWrap, setAutoWrap, toggleAutoWrap } = useTableAutoWrap();

  // Frozen column count normalized across prop variants
  const effectiveFrozenCount = frozenColumnCount !== undefined && frozenColumnCount !== null
    ? frozenColumnCount
    : (frozenCount !== undefined && frozenCount !== null ? frozenCount : 0);

  const handleFrozenColumnChange = onFrozenColumnCountChange || onFrozenCountChange;

  const setVisibleCols = (cols) => {
    onChangeVisibleColumns?.(cols);
    onVisibleColumnsChange?.(cols);
  };

  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const [activeSubMenu, setActiveSubMenu] = useState(null); // 'columns' | 'filter' | 'freeze' | 'report'
  const [savedViews, setSavedViews] = useState([]);
  const [newViewName, setNewViewName] = useState('');
  const [showSaveViewInput, setShowSaveViewInput] = useState(false);
  const [showViewsDropdown, setShowViewsDropdown] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);

  // Column Selector Dialog State
  const [showColumnSelectorModal, setShowColumnSelectorModal] = useState(false);
  const [columnSelectorDraft, setColumnSelectorDraft] = useState([]);
  const [columnSearchQuery, setColumnSearchQuery] = useState('');

  const openColumnSelectorModal = () => {
    setColumnSelectorDraft([...visibleColumns]);
    setColumnSearchQuery('');
    setShowColumnSelectorModal(true);
    setShowActionsMenu(false);
    setActiveSubMenu(null);
  };

  const handleApplyColumnSelector = () => {
    if (columnSelectorDraft.length === 0) {
      alert('Please select at least one column.');
      return;
    }
    setVisibleCols(columnSelectorDraft);
    try {
      localStorage.setItem(`cols_${currentStorageKey}`, JSON.stringify(columnSelectorDraft));
    } catch (e) {}
    setShowColumnSelectorModal(false);
  };

  // Freeze Columns Dialog State
  const [showFreezeColumnsModal, setShowFreezeColumnsModal] = useState(false);
  const openFreezeColumnsModal = () => {
    setShowFreezeColumnsModal(true);
    setShowActionsMenu(false);
    setActiveSubMenu(null);
  };

  // Report Views & Default Setup Dialog State
  const [showReportsViewsModal, setShowReportsViewsModal] = useState(false);
  const [reportsModalTab, setReportsModalTab] = useState('list'); // 'list' | 'create'

  const openReportsViewsModal = (tab = 'list') => {
    setReportsModalTab(tab);
    setReportModalName('');
    setReportModalColumns(visibleColumns.length > 0 ? [...visibleColumns] : columns.map(c => c.id));
    setReportModalSetDefault(false);
    setReportModalIncludeFilters(true);
    setShowReportsViewsModal(true);
    setShowActionsMenu(false);
    setShowViewsDropdown(false);
    setActiveSubMenu(null);
  };

  // Dedicated Create Report View Modal State (with full Column Selector & Set Default View)
  const [showCreateReportModal, setShowCreateReportModal] = useState(false);
  const [reportModalName, setReportModalName] = useState('');
  const [reportModalColumns, setReportModalColumns] = useState([]);
  const [reportModalSetDefault, setReportModalSetDefault] = useState(false);
  const [reportModalIncludeFilters, setReportModalIncludeFilters] = useState(true);

  const openCreateReportModal = () => {
    openReportsViewsModal('create');
  };

  const toggleReportModalColumn = (colId) => {
    if (reportModalColumns.includes(colId)) {
      if (reportModalColumns.length <= 1) return; // Keep at least one column
      setReportModalColumns(reportModalColumns.filter(c => c !== colId));
    } else {
      setReportModalColumns([...reportModalColumns, colId]);
    }
  };

  const selectAllReportModalColumns = () => {
    setReportModalColumns(columns.map(c => c.id));
  };

  const deselectAllReportModalColumns = () => {
    const firstCol = columns.find(c => c.defaultVisible !== false) || columns[0];
    setReportModalColumns(firstCol ? [firstCol.id] : []);
  };

  // Designated Default View ID stored in localStorage ('default' or custom view ID)
  const defaultViewKey = `default_view_${currentStorageKey}`;
  const [designatedDefaultViewId, setDesignatedDefaultViewId] = useState(() => {
    try {
      return localStorage.getItem(defaultViewKey) || 'default';
    } catch (e) {
      return 'default';
    }
  });

  // Active view management with local persistence
  const [internalActiveViewId, setInternalActiveViewId] = useState(() => {
    try {
      const savedActive = localStorage.getItem(`active_view_${currentStorageKey}`);
      const savedDefault = localStorage.getItem(defaultViewKey);
      return savedActive || savedDefault || 'default';
    } catch (e) {
      return 'default';
    }
  });

  const effectiveActiveViewId = (activeViewId !== undefined && activeViewId !== null)
    ? activeViewId
    : ((activeViewName !== undefined && activeViewName !== null) ? activeViewName : internalActiveViewId);

  useEffect(() => {
    if (activeViewId !== undefined && activeViewId !== null) {
      setInternalActiveViewId(activeViewId);
    } else if (activeViewName !== undefined && activeViewName !== null) {
      setInternalActiveViewId(activeViewName);
    }
  }, [activeViewId, activeViewName]);

  const currentViewObj = savedViews.find(v => v.id === effectiveActiveViewId);
  const isCustomViewActive = Boolean(currentViewObj && effectiveActiveViewId !== 'default');
  const activeViewLabel = isCustomViewActive ? currentViewObj.name : 'Default View';

  // Filter Builder Dialog state
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [filterDraft, setFilterDraft] = useState([]);
  const [manualInputMap, setManualInputMap] = useState({});

  // Load Saved Views & Designated Default View from localStorage on mount and auto-apply default
  const hasLoadedDefaultViewRef = useRef(false);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(`views_${currentStorageKey}`);
      let parsedViews = [];
      if (saved) {
        parsedViews = JSON.parse(saved);
        setSavedViews(parsedViews);
      }
      const def = localStorage.getItem(defaultViewKey);
      if (def) {
        setDesignatedDefaultViewId(def);
        if (!hasLoadedDefaultViewRef.current) {
          hasLoadedDefaultViewRef.current = true;
          if (def !== 'default') {
            const defView = parsedViews.find(v => v.id === def);
            if (defView && defView.visibleColumns?.length > 0) {
              setVisibleCols(defView.visibleColumns);
              if (defView.filters?.length > 0 && onFiltersChange) onFiltersChange(defView.filters);
              if (defView.rowsPerPage && onRowsPerPageChange) onRowsPerPageChange(defView.rowsPerPage);
              setInternalActiveViewId(def);
              onViewChange?.(def);
            }
          }
        }
      }
    } catch (e) {}
  }, [currentStorageKey, defaultViewKey]);

  // Set / designate which view is the Default View
  const handleSetDesignatedDefault = (viewId, e) => {
    e?.stopPropagation();
    try {
      localStorage.setItem(defaultViewKey, viewId);
    } catch (err) {}
    setDesignatedDefaultViewId(viewId);
  };

  const handleSaveReportSubmit = (e) => {
    e?.preventDefault();
    const trimmed = reportModalName.trim();
    if (!trimmed) return;
    if (reportModalColumns.length === 0) {
      alert('Please select at least one column for this report.');
      return;
    }

    const newViewId = 'view_' + Date.now();
    const newView = {
      id: newViewId,
      name: trimmed,
      visibleColumns: reportModalColumns,
      filters: reportModalIncludeFilters ? currentFilters : [],
      rowsPerPage,
      search: currentSearch,
      sortConfig: sortConfig || null,
      columnWidths: columnWidths || null,
      isHeaderSticky,
      createdAt: new Date().toISOString()
    };

    const updated = [...savedViews, newView];
    setSavedViews(updated);

    try {
      localStorage.setItem(`views_${currentStorageKey}`, JSON.stringify(updated));
      localStorage.setItem(`active_view_${currentStorageKey}`, newViewId);
      localStorage.setItem(`cols_${currentStorageKey}`, JSON.stringify(reportModalColumns));
    } catch (err) {}

    if (reportModalSetDefault) {
      try {
        localStorage.setItem(defaultViewKey, newViewId);
      } catch (err) {}
      setDesignatedDefaultViewId(newViewId);
    }

    setVisibleCols(reportModalColumns);
    setInternalActiveViewId(newViewId);
    onViewChange?.(newViewId);
    onSaveView?.(newView);

    setShowCreateReportModal(false);
  };

  // Close menus on click outside
  const menuRef = useRef(null);
  const viewsDropdownRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setShowActionsMenu(false);
        setActiveSubMenu(null);
      }
      if (viewsDropdownRef.current && !viewsDropdownRef.current.contains(event.target)) {
        setShowViewsDropdown(false);
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

  const handleSaveViewSubmit = (e) => {
    e?.preventDefault();
    if (!newViewName.trim()) return;
    const newView = {
      id: 'view_' + Date.now(),
      name: newViewName.trim(),
      visibleColumns,
      filters: currentFilters,
      rowsPerPage,
      search: currentSearch,
      sortConfig: sortConfig || null,
      columnWidths: columnWidths || null,
      isHeaderSticky,
      createdAt: new Date().toISOString()
    };
    const updated = [...savedViews, newView];
    setSavedViews(updated);
    try {
      localStorage.setItem(`views_${currentStorageKey}`, JSON.stringify(updated));
      localStorage.setItem(`active_view_${currentStorageKey}`, newView.id);
    } catch (e) {}
    setInternalActiveViewId(newView.id);
    onViewChange?.(newView.id);
    onSaveView?.(newView);
    setNewViewName('');
    setShowSaveModal(false);
    setShowSaveViewInput(false);
    setShowViewsDropdown(false);
    setShowActionsMenu(false);
    setActiveSubMenu(null);
  };

  const handleApplySavedView = (view) => {
    if (view.visibleColumns) {
      setVisibleCols(view.visibleColumns);
      try {
        localStorage.setItem(`cols_${currentStorageKey}`, JSON.stringify(view.visibleColumns));
      } catch (e) {}
    }
    if (view.filters) onFiltersChange?.(view.filters || []);
    if (view.rowsPerPage) onRowsPerPageChange?.(view.rowsPerPage);
    if (view.search !== undefined) onSearchChange?.(view.search);
    if (view.sortConfig && onSortChange) onSortChange(view.sortConfig);
    if (view.columnWidths && onSetColumnWidths) onSetColumnWidths(view.columnWidths);
    if (view.isHeaderSticky !== undefined && onToggleHeaderSticky) {
      onToggleHeaderSticky(view.isHeaderSticky);
    }
    setInternalActiveViewId(view.id);
    try {
      localStorage.setItem(`active_view_${currentStorageKey}`, view.id);
    } catch (e) {}
    onViewChange?.(view.id);
    onLoadView?.(view);
    setShowViewsDropdown(false);
    setShowActionsMenu(false);
    setActiveSubMenu(null);
  };

  const handleUpdateCurrentView = () => {
    if (!currentViewObj) return;
    const updated = savedViews.map(v => {
      if (v.id === currentViewObj.id) {
        return {
          ...v,
          visibleColumns,
          filters: currentFilters,
          rowsPerPage,
          search: currentSearch,
          sortConfig: sortConfig || null,
          columnWidths: columnWidths || null,
          isHeaderSticky,
          updatedAt: new Date().toISOString()
        };
      }
      return v;
    });
    setSavedViews(updated);
    try {
      localStorage.setItem(`views_${currentStorageKey}`, JSON.stringify(updated));
    } catch (e) {}
    setShowViewsDropdown(false);
  };

  const handleDeleteSavedView = (viewId, e) => {
    e?.stopPropagation();
    const updated = savedViews.filter(v => v.id !== viewId);
    setSavedViews(updated);
    try {
      localStorage.setItem(`views_${currentStorageKey}`, JSON.stringify(updated));
    } catch (e) {}
    if (effectiveActiveViewId === viewId) {
      handleResetToDefault();
    }
  };

  const handleResetToDefault = () => {
    const defaultCols = defaultColumns || columns.filter(c => c.defaultVisible !== false).map(c => c.id);
    setVisibleCols(defaultCols);
    try {
      localStorage.setItem(`cols_${currentStorageKey}`, JSON.stringify(defaultCols));
      localStorage.setItem(`active_view_${currentStorageKey}`, 'default');
    } catch (e) {}
    onFiltersChange?.([]);
    onRowsPerPageChange?.(10);
    onSearchChange?.('');
    onResetWidths?.();
    if (onSortChange) onSortChange({ key: null, direction: null });
    setInternalActiveViewId('default');
    onViewChange?.('default');
    setShowViewsDropdown(false);
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

  const handleToolbarScroll = (direction, e) => {
    let current = e?.currentTarget;
    let target = null;
    while (current && current !== document.body) {
      target = current.parentElement?.querySelector('.overflow-x-auto, [data-table-scroll]');
      if (target && target.scrollWidth > target.clientWidth + 10) break;
      current = current.parentElement;
    }
    if (!target || target.scrollWidth <= target.clientWidth + 10) {
      target = document.querySelector('main .overflow-x-auto, main [data-table-scroll], .overflow-x-auto');
    }
    if (target) {
      const scrollAmount = Math.max(300, Math.floor(target.clientWidth * 0.65));
      target.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
    }
  };

  const filterableColumns = columns.filter(c => c.id !== 'actions');

  return (
    <div className="space-y-2 relative z-50">
      {/* Top Toolbar Container - Aligned cleanly in One Single Line */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-white p-2 rounded-2xl border border-slate-200 shadow-xs select-none relative z-50 w-full min-w-0">
        {/* Left Side: Search, Rows dropdown, Actions Menu, Views, Wrap, Download */}
        <div className="flex flex-wrap items-center gap-2 relative z-50">
          {/* Search Box */}
          <div className="relative min-w-[150px] max-w-[220px]">
            <input
              type="text"
              placeholder={searchPlaceholder || 'Search...'}
              value={currentSearch}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full pl-3 pr-7 py-1.5 text-xs rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-white focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 transition-all font-medium text-slate-800 placeholder:text-slate-400"
            />
            {currentSearch && (
              <button 
                onClick={() => onSearchChange('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Rows Selector */}
          <div className="flex items-center gap-1.5 text-xs text-slate-600 font-semibold bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 shrink-0">
            <span className="text-slate-400 font-normal">Rows</span>
            <select
              value={rowsPerPage || 25}
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

          {/* Actions Menu Dropdown */}
          <div className="relative z-[100]" ref={menuRef}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowActionsMenu(prev => !prev);
                setShowViewsDropdown(false);
              }}
              onMouseDown={(e) => e.stopPropagation()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all bg-[#0f172a] hover:bg-[#1e293b] active:scale-95 text-white border border-[#0f172a] shadow-xs cursor-pointer select-none shrink-0"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-teal-400" />
              <span>Actions</span>
              <ChevronDown className={`w-3.5 h-3.5 text-slate-300 transition-transform duration-150 ${showActionsMenu ? 'rotate-180' : ''}`} />
            </button>

            {/* APEX Context Menu Dropdown */}
            {showActionsMenu && (
              <div 
                onMouseDown={(e) => e.stopPropagation()}
                className="absolute left-0 top-full mt-2 w-72 max-w-[calc(100vw-2rem)] bg-white rounded-2xl shadow-2xl border border-slate-200 py-1.5 z-[100] text-slate-700 animate-in fade-in zoom-in-95 duration-100"
              >
                {/* 1. Columns Dialog Trigger */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    openColumnSelectorModal();
                  }}
                  className="w-full px-4 py-2 text-left text-xs font-semibold flex items-center justify-between hover:bg-slate-50 text-slate-700 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <Columns3 className="w-4 h-4 text-slate-500 shrink-0" />
                    <span>Columns ({visibleColumns.length}/{columns.length})</span>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                </button>

                {/* 2. Filter Builder Trigger */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    openFilterModal();
                  }}
                  className="w-full px-4 py-2 text-left text-xs font-semibold flex items-center justify-between hover:bg-slate-50 text-slate-700 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <Filter className="w-4 h-4 text-slate-500 shrink-0" />
                    <span>Filter</span>
                  </div>
                  {currentFilters.length > 0 && (
                    <span className="bg-teal-100 text-teal-800 px-2 py-0.5 rounded-full text-[10px] font-bold">
                      {currentFilters.length} active
                    </span>
                  )}
                </button>

                {/* 3. Freeze Header Row Toggle */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleHeaderSticky?.(!isHeaderSticky);
                  }}
                  className="w-full px-4 py-2 text-left text-xs font-semibold flex items-center justify-between hover:bg-slate-50 text-slate-700 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <Table className="w-4 h-4 text-slate-500 shrink-0" />
                    <span>Freeze Header Row</span>
                  </div>
                  {isHeaderSticky ? (
                    <span className="text-[11px] font-bold text-teal-700 bg-teal-50 border border-teal-200/80 px-2 py-0.5 rounded-full">
                      Frozen
                    </span>
                  ) : (
                    <span className="text-[11px] text-slate-400">Normal</span>
                  )}
                </button>

                {/* 4. Freeze Columns Dialog Trigger */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    openFreezeColumnsModal();
                  }}
                  className="w-full px-4 py-2 text-left text-xs font-semibold flex items-center justify-between hover:bg-slate-50 text-slate-700 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <Pin className="w-4 h-4 text-slate-500 shrink-0" />
                    <span>Freeze Columns</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {effectiveFrozenCount > 0 ? (
                      <span className="text-[11px] font-bold text-teal-700 bg-teal-50 border border-teal-200/80 px-2 py-0.5 rounded-full">
                        {effectiveFrozenCount} Col{effectiveFrozenCount > 1 ? 's' : ''}
                      </span>
                    ) : (
                      <span className="text-[11px] text-slate-400">None</span>
                    )}
                    <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                  </div>
                </button>

                {/* 5. Report / Views Dialog Trigger */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    openReportsViewsModal('list');
                  }}
                  className="w-full px-4 py-2 text-left text-xs font-semibold flex items-center justify-between hover:bg-slate-50 text-slate-700 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <Bookmark className="w-4 h-4 text-slate-500 shrink-0" />
                    <span>Report / Views</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {savedViews.length > 0 && (
                      <span className="text-[11px] font-bold text-teal-700 bg-teal-50 border border-teal-200/80 px-2 py-0.5 rounded-full">
                        {savedViews.length + 1}
                      </span>
                    )}
                    <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                  </div>
                </button>

                {/* 6. Download Filtered Data */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    triggerExport?.();
                    setShowActionsMenu(false);
                  }}
                  className="w-full px-4 py-2 text-left text-xs font-semibold flex items-center gap-2.5 hover:bg-slate-50 text-slate-700 transition-colors cursor-pointer"
                >
                  <Download className="w-4 h-4 text-slate-500 shrink-0" />
                  <span>Download / Export Filtered</span>
                </button>

                {/* 7. Auto-Wrap Data Toggle */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleAutoWrap();
                  }}
                  className="w-full px-4 py-2 text-left text-xs font-semibold flex items-center justify-between hover:bg-slate-50 text-slate-700 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="w-4 h-4 text-slate-500 font-black flex items-center justify-center font-mono text-[13px]">↵</span>
                    <span>Auto-Wrap Long Data</span>
                  </div>
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                    autoWrap ? 'text-teal-700 bg-teal-50 border border-teal-200/80' : 'text-slate-400 bg-slate-100'
                  }`}>
                    {autoWrap ? 'Enabled' : 'Disabled'}
                  </span>
                </button>

                {/* 8. Font Size Options - Direct Selection of ALL font sizes in Actions */}
                <div className="border-t border-slate-100 pt-1.5 mt-1 px-1">
                  <div className="px-3 py-1 flex items-center justify-between text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                    <div className="flex items-center gap-1.5">
                      <span className="w-3.5 h-3.5 text-slate-500 font-extrabold flex items-center justify-center">A</span>
                      <span>Font Size</span>
                    </div>
                    <span className="text-teal-700 bg-teal-50 border border-teal-200/80 px-1.5 py-0.5 rounded capitalize font-bold text-[10px]">
                      {fontSize}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-1 px-1 py-1">
                    {[
                      { id: 'xs', label: 'Extra Small' },
                      { id: 'compact', label: 'Compact' },
                      { id: 'normal', label: 'Normal' },
                      { id: 'medium', label: 'Medium' },
                      { id: 'comfortable', label: 'Comfortable' },
                      { id: 'large', label: 'Large' },
                      { id: 'xl', label: 'Extra Large' },
                    ].map(sizeOpt => (
                      <button
                        key={sizeOpt.id}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setFontSize(sizeOpt.id);
                        }}
                        className={`flex items-center justify-between px-2 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                          fontSize === sizeOpt.id
                            ? 'bg-teal-50 text-teal-900 border border-teal-300 font-bold shadow-2xs'
                            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                        }`}
                      >
                        <span className="truncate">{sizeOpt.label}</span>
                        {fontSize === sizeOpt.id && <Check className="w-3 h-3 text-teal-600 shrink-0" />}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="my-1 border-t border-slate-100"></div>

                {/* 9. Reset All (Columns & Filters) */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleResetToDefault();
                  }}
                  className="w-full px-4 py-2 text-left text-xs font-semibold flex items-center gap-2.5 hover:bg-rose-50 text-rose-600 transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-4 h-4 text-rose-500 shrink-0" />
                  <span>Reset All (Columns & Filters)</span>
                </button>
              </div>
            )}
          </div>

          {/* Saved Views / Reports Dropdown (Oracle APEX Interactive Report Style) */}
          <div className="relative shrink-0 z-40" ref={viewsDropdownRef}>
            <button
              type="button"
              onClick={() => {
                setShowViewsDropdown(!showViewsDropdown);
                setShowActionsMenu(false);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all shadow-xs ${
                showViewsDropdown
                  ? 'bg-teal-900 text-white border-teal-900'
                  : isCustomViewActive
                    ? 'bg-teal-50 hover:bg-teal-100 text-teal-900 border-teal-300'
                    : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
              }`}
              title="Switch report views or save custom views"
            >
              <div className="flex items-center gap-1.5 min-w-0">
                {isCustomViewActive ? (
                  <Bookmark className="w-3.5 h-3.5 text-teal-600 fill-teal-600 shrink-0" />
                ) : (
                  <span className="text-amber-500 text-xs leading-none shrink-0">⭐️</span>
                )}
                <span className="max-w-[110px] sm:max-w-[150px] truncate">
                  {activeViewLabel}
                </span>
                {designatedDefaultViewId === effectiveActiveViewId && (
                  <span className="text-[9px] bg-amber-100 text-amber-800 font-extrabold px-1 rounded-sm uppercase tracking-wide hidden sm:inline">
                    Default
                  </span>
                )}
              </div>
              <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform ${showViewsDropdown ? 'rotate-180' : ''}`} />
            </button>

            {/* Views Dropdown Popover */}
            {showViewsDropdown && (
              <div className="absolute left-0 top-full mt-1.5 w-80 max-w-[calc(100vw-2rem)] bg-white rounded-2xl shadow-xl border border-slate-200 py-2 z-40 animate-in fade-in zoom-in-95 duration-100">
                {/* Header */}
                <div className="px-3.5 pb-2 border-b border-slate-100 flex items-center justify-between">
                  <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Reports & Views</span>
                  <button
                    type="button"
                    onClick={openCreateReportModal}
                    className="text-[11px] font-bold text-teal-600 hover:text-teal-700 flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3 h-3" /> Create Report
                  </button>
                </div>

                {/* Option to Select Default View */}
                <div className="mx-2.5 my-2 p-2 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between gap-2 shadow-2xs">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-amber-500 text-xs shrink-0">⭐️</span>
                    <span className="text-[11px] font-extrabold text-slate-700 truncate">Default View:</span>
                  </div>
                  <select
                    value={designatedDefaultViewId}
                    onChange={(e) => handleSetDesignatedDefault(e.target.value)}
                    className="text-xs font-bold bg-white text-teal-900 border border-slate-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-teal-500 cursor-pointer max-w-[155px] truncate"
                    title="Choose which view loads automatically as your startup default view"
                  >
                    <option value="default">Default View (System)</option>
                    {savedViews.map(v => (
                      <option key={v.id} value={v.id}>{v.name}</option>
                    ))}
                  </select>
                </div>

                {/* Standard Default View Row */}
                <div className="p-1.5">
                  <div
                    onClick={handleResetToDefault}
                    className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs cursor-pointer transition-colors ${
                      (!effectiveActiveViewId || effectiveActiveViewId === 'default')
                        ? 'bg-teal-50 text-teal-900 font-bold border border-teal-200/80 shadow-xs'
                        : 'hover:bg-slate-50 text-slate-700 font-medium'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0 pr-2">
                      <span className="text-amber-500 text-sm leading-none shrink-0">⭐️</span>
                      <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-slate-900">Default View</span>
                          {designatedDefaultViewId === 'default' && (
                            <span className="text-[9px] bg-amber-100 text-amber-800 font-extrabold px-1.5 py-0.2 rounded uppercase tracking-wider">
                              Default View
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-slate-400 font-normal">Original system columns & list</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {(!effectiveActiveViewId || effectiveActiveViewId === 'default') && (
                        <Check className="w-3.5 h-3.5 text-teal-600" />
                      )}
                      <button
                        type="button"
                        onClick={(e) => handleSetDesignatedDefault('default', e)}
                        className={`px-2 py-0.5 rounded-lg text-[10px] font-bold transition-all border ${
                          designatedDefaultViewId === 'default'
                            ? 'bg-amber-100 text-amber-900 border-amber-300'
                            : 'bg-white hover:bg-slate-100 text-slate-500 border-slate-200'
                        }`}
                        title={designatedDefaultViewId === 'default' ? 'Currently your startup default view' : 'Set as default startup view'}
                      >
                        {designatedDefaultViewId === 'default' ? '★ Default' : 'Set Default'}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Saved Custom Views Section */}
                <div className="px-3.5 pt-2 pb-1 text-[10px] font-extrabold text-slate-400 uppercase tracking-wider border-t border-slate-100 flex items-center justify-between">
                  <span>Custom Saved Views ({savedViews.length})</span>
                </div>

                <div className="px-1.5 max-h-48 overflow-y-auto space-y-1">
                  {savedViews.length === 0 ? (
                    <div className="px-3 py-3 text-center text-xs text-slate-400 italic">
                      No custom views saved yet.
                      <div className="text-[10px] text-slate-400 font-normal mt-0.5">Customize columns/filters and click Save View.</div>
                    </div>
                  ) : (
                    savedViews.map(view => {
                      const isCurrent = effectiveActiveViewId === view.id;
                      const isDefault = designatedDefaultViewId === view.id;
                      const colCount = view.visibleColumns?.length || 0;
                      const filterCount = view.filters?.length || 0;
                      return (
                        <div
                          key={view.id}
                          onClick={() => handleApplySavedView(view)}
                          className={`group flex items-center justify-between px-3 py-2 rounded-xl text-xs cursor-pointer transition-colors ${
                            isCurrent
                              ? 'bg-teal-50 text-teal-900 font-bold border border-teal-200/80 shadow-xs'
                              : 'hover:bg-slate-50 text-slate-700 font-medium'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0 pr-2">
                            <Bookmark className={`w-3.5 h-3.5 shrink-0 ${isCurrent ? 'text-teal-600 fill-teal-600' : 'text-slate-400'}`} />
                            <div className="flex flex-col min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="truncate font-semibold text-slate-900">{view.name}</span>
                                {isDefault && (
                                  <span className="text-[9px] bg-amber-100 text-amber-800 font-extrabold px-1.5 py-0.2 rounded uppercase tracking-wider shrink-0">
                                    Default View
                                  </span>
                                )}
                              </div>
                              <span className="text-[10px] text-slate-400 font-normal">
                                {colCount} cols {filterCount > 0 ? `• ${filterCount} filters` : ''}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {isCurrent && <Check className="w-3.5 h-3.5 text-teal-600 mr-0.5" />}
                            <button
                              type="button"
                              onClick={(e) => handleSetDesignatedDefault(view.id, e)}
                              className={`px-2 py-0.5 rounded-lg text-[10px] font-bold transition-all border ${
                                isDefault
                                  ? 'bg-amber-100 text-amber-900 border-amber-300'
                                  : 'bg-white hover:bg-slate-100 text-slate-500 border-slate-200'
                              }`}
                              title={isDefault ? 'Currently your startup default view' : 'Set as default startup view'}
                            >
                              {isDefault ? '★ Default' : 'Set Default'}
                            </button>
                            <button
                              type="button"
                              onClick={(e) => handleDeleteSavedView(view.id, e)}
                              className="p-1 rounded-lg hover:bg-rose-100 hover:text-rose-600 text-slate-300 opacity-60 group-hover:opacity-100 transition-opacity"
                              title="Delete view"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Footer Actions */}
                <div className="mt-1 pt-1.5 border-t border-slate-100 px-1.5 space-y-1">
                  {isCustomViewActive && (
                    <button
                      type="button"
                      onClick={handleUpdateCurrentView}
                      className="w-full px-3 py-1.5 rounded-xl text-left text-xs font-semibold text-teal-700 hover:bg-teal-50 flex items-center gap-2 transition-colors"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span className="truncate">Update "{activeViewLabel}" with current settings</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={openCreateReportModal}
                    className="w-full px-3 py-1.5 rounded-xl text-left text-xs font-bold text-teal-700 hover:bg-teal-50 flex items-center gap-2 transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Create & Save Report View...</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Quick Action (e.g. Filters) & Download in one clean line */}
        <div className="flex flex-wrap items-center gap-2">
          {primaryAction}

          {/* On-Screen Horizontal Scroll Buttons */}
          <div className="flex items-center bg-slate-50 border border-slate-200 rounded-xl p-0.5 text-xs text-slate-700 shadow-2xs">
            <button
              type="button"
              onClick={(e) => handleToolbarScroll('left', e)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg hover:bg-white hover:text-teal-700 text-slate-600 font-bold transition-all cursor-pointer shadow-2xs active:scale-95"
              title="Scroll Table Left (◀)"
            >
              <ChevronLeft className="w-3.5 h-3.5 text-teal-600" />
              <span className="hidden md:inline">Left</span>
            </button>
            <div className="w-[1px] h-3.5 bg-slate-200 mx-0.5"></div>
            <button
              type="button"
              onClick={(e) => handleToolbarScroll('right', e)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg hover:bg-white hover:text-teal-700 text-slate-600 font-bold transition-all cursor-pointer shadow-2xs active:scale-95"
              title="Scroll Table Right (▶)"
            >
              <span className="hidden md:inline">Right</span>
              <ChevronRight className="w-3.5 h-3.5 text-teal-600" />
            </button>
          </div>

          {(onExport || onExportExcel) && (
            <button
              type="button"
              onClick={triggerExport}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition-all shadow-xs cursor-pointer shrink-0"
              title="Export filtered records"
            >
              <Download className="w-3.5 h-3.5 text-teal-600" />
              <span className="hidden sm:inline">Download</span>
            </button>
          )}
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
      {showFilterModal && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[99999] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
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
        </div>,
        document.body
      )}

      {/* 1. Dedicated Column Selector Modal */}
      {showColumnSelectorModal && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl max-h-[90vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-teal-100 text-teal-700 flex items-center justify-center font-bold">
                  <Columns3 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Select Columns</h3>
                  <p className="text-[11px] text-slate-500">
                    {columnSelectorDraft.length} of {columns.length} columns selected
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowColumnSelectorModal(false)}
                className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Search & Bulk Selection Toolbar */}
            <div className="p-3.5 bg-slate-50/60 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search columns..."
                  value={columnSearchQuery}
                  onChange={(e) => setColumnSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-7 py-1.5 text-xs rounded-xl border border-slate-200 bg-white font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
                {columnSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setColumnSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2 text-xs shrink-0">
                <button
                  type="button"
                  onClick={() => setColumnSelectorDraft(columns.map(c => c.id))}
                  className="px-2.5 py-1 rounded-lg bg-teal-50 hover:bg-teal-100 text-teal-800 font-bold border border-teal-200/60 transition-colors cursor-pointer"
                >
                  Select All
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const firstCol = columns.find(c => c.defaultVisible !== false) || columns[0];
                    setColumnSelectorDraft(firstCol ? [firstCol.id] : []);
                  }}
                  className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold transition-colors cursor-pointer"
                >
                  Clear All
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const defaultCols = defaultColumns || columns.filter(c => c.defaultVisible !== false).map(c => c.id);
                    setColumnSelectorDraft(defaultCols);
                  }}
                  className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold transition-colors cursor-pointer"
                >
                  Reset Default
                </button>
              </div>
            </div>

            {/* Columns Grid Checklist */}
            <div className="p-4 overflow-y-auto max-h-[55vh] flex-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {columns
                  .filter(col => !columnSearchQuery || col.label.toLowerCase().includes(columnSearchQuery.toLowerCase()))
                  .map(col => {
                    const isSelected = columnSelectorDraft.includes(col.id);
                    return (
                      <label
                        key={col.id}
                        className={`flex items-center justify-between p-2.5 rounded-xl border transition-all cursor-pointer select-none text-xs ${
                          isSelected
                            ? 'bg-teal-50/50 border-teal-300 shadow-2xs font-bold text-slate-900'
                            : 'bg-white border-slate-200 text-slate-400 hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {
                              if (isSelected) {
                                if (columnSelectorDraft.length <= 1) return; // Keep at least one
                                setColumnSelectorDraft(columnSelectorDraft.filter(id => id !== col.id));
                              } else {
                                setColumnSelectorDraft([...columnSelectorDraft, col.id]);
                              }
                            }}
                            className="w-4 h-4 rounded text-teal-600 focus:ring-teal-500 border-slate-300 cursor-pointer shrink-0"
                          />
                          <span className="truncate">{col.label}</span>
                        </div>
                        <span className={`text-[10px] uppercase font-mono px-1.5 py-0.5 rounded ${
                          isSelected ? 'bg-teal-100 text-teal-800' : 'bg-slate-100 text-slate-400'
                        }`}>
                          {isSelected ? 'Visible' : 'Hidden'}
                        </span>
                      </label>
                    );
                  })}
              </div>
            </div>

            {/* Footer */}
            <div className="p-3.5 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
              <span className="text-xs text-slate-500 font-medium">
                {columnSelectorDraft.length} column{columnSelectorDraft.length !== 1 ? 's' : ''} will be displayed
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowColumnSelectorModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 rounded-xl hover:bg-slate-200 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleApplyColumnSelector}
                  className="px-4 py-2 text-xs font-bold bg-[#0f172a] hover:bg-[#1e293b] text-white rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5 text-teal-400" />
                  <span>Apply Columns</span>
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* 2. Dedicated Freeze Columns Modal */}
      {showFreezeColumnsModal && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden flex flex-col animate-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-teal-100 text-teal-700 flex items-center justify-center font-bold">
                  <Pin className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Freeze Columns</h3>
                  <p className="text-[11px] text-slate-500">Lock left-most columns during horizontal scroll</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowFreezeColumnsModal(false)}
                className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Options List */}
            <div className="p-4 space-y-2">
              {/* Option 0 */}
              <button
                type="button"
                onClick={() => {
                  handleFrozenColumnChange?.(0);
                  setShowFreezeColumnsModal(false);
                }}
                className={`w-full p-3 rounded-xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                  effectiveFrozenCount === 0
                    ? 'bg-teal-50 border-teal-300 shadow-2xs text-teal-950 font-bold'
                    : 'border-slate-200 hover:bg-slate-50 text-slate-700 font-medium'
                }`}
              >
                <div>
                  <div className="text-xs font-bold text-slate-900">None (0 Columns)</div>
                  <div className="text-[11px] text-slate-500">Scroll all columns freely without sticky freezing</div>
                </div>
                {effectiveFrozenCount === 0 && <Check className="w-4 h-4 text-teal-600 shrink-0" />}
              </button>

              {/* Options 1 to 4 */}
              {[1, 2, 3, 4].map(num => {
                if (num > visibleColumns.length) return null;
                const lockedLabels = visibleColumns.slice(0, num).map(colId => {
                  return columns.find(c => c.id === colId)?.label || colId;
                }).join(', ');

                const isSelected = effectiveFrozenCount === num;
                return (
                  <button
                    key={num}
                    type="button"
                    onClick={() => {
                      handleFrozenColumnChange?.(num);
                      setShowFreezeColumnsModal(false);
                    }}
                    className={`w-full p-3 rounded-xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-teal-50 border-teal-300 shadow-2xs text-teal-950 font-bold'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-700 font-medium'
                    }`}
                  >
                    <div className="min-w-0 pr-2">
                      <div className="text-xs font-bold text-slate-900">
                        Freeze {num} Column{num > 1 ? 's' : ''}
                      </div>
                      <div className="text-[11px] text-slate-500 truncate" title={lockedLabels}>
                        Locks: <span className="font-semibold text-slate-700">{lockedLabels}</span>
                      </div>
                    </div>
                    {isSelected && <Check className="w-4 h-4 text-teal-600 shrink-0" />}
                  </button>
                );
              })}
            </div>

            {/* Footer */}
            <div className="p-3.5 border-t border-slate-100 bg-slate-50 flex items-center justify-end">
              <button
                type="button"
                onClick={() => setShowFreezeColumnsModal(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 rounded-xl hover:bg-slate-200 transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* 3. Dedicated Reports & Views Manager Modal (with Default View Selector & Create Report Tab) */}
      {(showReportsViewsModal || showCreateReportModal) && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl max-h-[90vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-teal-100 text-teal-700 flex items-center justify-center font-bold">
                  <Bookmark className="w-4 h-4 fill-teal-700" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Reports & Views Manager</h3>
                  <p className="text-[11px] text-slate-500">Manage saved views, set your startup default, or create new reports</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowReportsViewsModal(false);
                  setShowCreateReportModal(false);
                }}
                className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Tab Navigation */}
            <div className="flex items-center gap-1 px-5 pt-3 border-b border-slate-100 bg-slate-50/50">
              <button
                type="button"
                onClick={() => {
                  setReportsModalTab('list');
                  setShowCreateReportModal(false);
                  setShowReportsViewsModal(true);
                }}
                className={`px-4 py-2 text-xs font-bold rounded-t-xl transition-all cursor-pointer flex items-center gap-1.5 ${
                  reportsModalTab === 'list' && !showCreateReportModal
                    ? 'bg-white text-teal-700 border-t border-l border-r border-slate-200 shadow-2xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <Bookmark className="w-3.5 h-3.5" />
                <span>Saved Reports ({savedViews.length + 1})</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setReportsModalTab('create');
                  setReportModalName('');
                  setReportModalColumns(visibleColumns.length > 0 ? [...visibleColumns] : columns.map(c => c.id));
                  setReportModalSetDefault(false);
                  setReportModalIncludeFilters(true);
                }}
                className={`px-4 py-2 text-xs font-bold rounded-t-xl transition-all cursor-pointer flex items-center gap-1.5 ${
                  reportsModalTab === 'create' || showCreateReportModal
                    ? 'bg-white text-teal-700 border-t border-l border-r border-slate-200 shadow-2xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Create Report</span>
              </button>
            </div>

            {/* TAB 1: LIST OF SAVED VIEWS + DEFAULT VIEW SELECTOR */}
            {reportsModalTab === 'list' && !showCreateReportModal && (
              <div className="p-5 overflow-y-auto space-y-4 flex-1">
                {/* Default Startup View Card */}
                <div className="p-3.5 bg-gradient-to-r from-amber-50/60 to-teal-50/60 rounded-2xl border border-amber-200/80 shadow-2xs space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Star className="w-4 h-4 text-amber-500 fill-amber-400" />
                      <span className="text-xs font-extrabold text-slate-800 uppercase tracking-wide">
                        Startup Default View:
                      </span>
                    </div>
                    <select
                      value={designatedDefaultViewId}
                      onChange={(e) => handleSetDesignatedDefault(e.target.value)}
                      className="bg-white px-3 py-1.5 text-xs font-bold text-teal-900 border border-amber-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-400 shadow-2xs cursor-pointer max-w-[220px] truncate"
                    >
                      <option value="default">⭐️ System Default View</option>
                      {savedViews.map(v => (
                        <option key={v.id} value={v.id}>⭐️ {v.name}</option>
                      ))}
                    </select>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    The chosen report view will automatically load when you open this screen.
                  </p>
                </div>

                {/* Views List Table */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-600 px-1">
                    <span>Available Report Views</span>
                    <button
                      type="button"
                      onClick={() => {
                        setReportsModalTab('create');
                        setReportModalName('');
                        setReportModalColumns(visibleColumns.length > 0 ? [...visibleColumns] : columns.map(c => c.id));
                        setReportModalSetDefault(false);
                        setReportModalIncludeFilters(true);
                      }}
                      className="text-teal-700 hover:text-teal-900 font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3 h-3" /> New Report
                    </button>
                  </div>

                  {/* System Default View Row */}
                  <div
                    className={`p-3 rounded-xl border flex items-center justify-between gap-3 transition-all ${
                      effectiveActiveViewId === 'default'
                        ? 'bg-teal-50/60 border-teal-300 shadow-2xs'
                        : 'bg-white border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="min-w-0 flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center font-bold text-xs shrink-0">
                        ⭐️
                      </div>
                      <div>
                        <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                          <span>Default View (System)</span>
                          {designatedDefaultViewId === 'default' && (
                            <span className="text-[9px] bg-amber-100 text-amber-800 font-extrabold px-1.5 py-0.5 rounded-full uppercase tracking-wider">
                              Startup Default
                            </span>
                          )}
                          {effectiveActiveViewId === 'default' && (
                            <span className="text-[9px] bg-teal-100 text-teal-800 font-bold px-1.5 py-0.5 rounded-full">
                              Active Now
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          Standard initial system layout with all default columns
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={(e) => handleSetDesignatedDefault('default', e)}
                        className={`px-2.5 py-1 text-xs rounded-lg font-bold flex items-center gap-1 border transition-all cursor-pointer ${
                          designatedDefaultViewId === 'default'
                            ? 'bg-amber-100 text-amber-800 border-amber-300'
                            : 'bg-white hover:bg-amber-50 text-slate-600 border-slate-200'
                        }`}
                        title="Make this your startup default view"
                      >
                        <Star className={`w-3 h-3 ${designatedDefaultViewId === 'default' ? 'fill-amber-400 text-amber-600' : 'text-slate-400'}`} />
                        <span className="hidden sm:inline">Set Default</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          handleResetToDefault();
                          setShowReportsViewsModal(false);
                          setShowCreateReportModal(false);
                        }}
                        className="px-3 py-1 text-xs rounded-lg font-bold bg-[#0f172a] hover:bg-[#1e293b] text-white transition-all cursor-pointer"
                      >
                        Apply
                      </button>
                    </div>
                  </div>

                  {/* Custom Saved Views */}
                  {savedViews.map(view => {
                    const isCurrent = effectiveActiveViewId === view.id;
                    const isDefault = designatedDefaultViewId === view.id;
                    const colCount = view.visibleColumns?.length || 0;
                    const filterCount = view.filters?.length || 0;

                    return (
                      <div
                        key={view.id}
                        className={`p-3 rounded-xl border flex items-center justify-between gap-3 transition-all ${
                          isCurrent
                            ? 'bg-teal-50/60 border-teal-300 shadow-2xs'
                            : 'bg-white border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <div className="min-w-0 flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-lg bg-teal-100 text-teal-700 flex items-center justify-center font-bold text-xs shrink-0">
                            <Bookmark className="w-3.5 h-3.5 fill-teal-700" />
                          </div>
                          <div>
                            <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                              <span className="truncate">{view.name}</span>
                              {isDefault && (
                                <span className="text-[9px] bg-amber-100 text-amber-800 font-extrabold px-1.5 py-0.5 rounded-full uppercase tracking-wider shrink-0">
                                  Startup Default
                                </span>
                              )}
                              {isCurrent && (
                                <span className="text-[9px] bg-teal-100 text-teal-800 font-bold px-1.5 py-0.5 rounded-full shrink-0">
                                  Active Now
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500 flex items-center gap-2">
                              <span>{colCount} columns visible</span>
                              {filterCount > 0 && (
                                <>
                                  <span>•</span>
                                  <span className="text-teal-700 font-semibold">{filterCount} filter{filterCount > 1 ? 's' : ''}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={(e) => handleSetDesignatedDefault(view.id, e)}
                            className={`px-2.5 py-1 text-xs rounded-lg font-bold flex items-center gap-1 border transition-all cursor-pointer ${
                              isDefault
                                ? 'bg-amber-100 text-amber-800 border-amber-300'
                                : 'bg-white hover:bg-amber-50 text-slate-600 border-slate-200'
                            }`}
                            title="Make this your startup default view"
                          >
                            <Star className={`w-3 h-3 ${isDefault ? 'fill-amber-400 text-amber-600' : 'text-slate-400'}`} />
                            <span className="hidden sm:inline">Set Default</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              handleApplySavedView(view);
                              setShowReportsViewsModal(false);
                              setShowCreateReportModal(false);
                            }}
                            className="px-3 py-1 text-xs rounded-lg font-bold bg-[#0f172a] hover:bg-[#1e293b] text-white transition-all cursor-pointer"
                          >
                            Apply
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleDeleteSavedView(view.id, e)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                            title="Delete saved report"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* TAB 2: CREATE REPORT FORM */}
            {(reportsModalTab === 'create' || showCreateReportModal) && (
              <form onSubmit={(e) => { handleSaveReportSubmit(e); setShowReportsViewsModal(false); setShowCreateReportModal(false); }} className="p-5 overflow-y-auto space-y-4 flex-1">
                {/* Report Name Input */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Report Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    autoFocus
                    placeholder="e.g. Monthly Rent Collection, Active Leases Report"
                    value={reportModalName}
                    onChange={(e) => setReportModalName(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-500 font-medium text-slate-800 placeholder:text-slate-400"
                  />
                </div>

                {/* Column Selection Section */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-700">
                      Select Columns for this Report ({reportModalColumns.length} of {columns.length} selected)
                    </label>
                    <div className="flex items-center gap-2 text-xs">
                      <button
                        type="button"
                        onClick={selectAllReportModalColumns}
                        className="text-teal-700 hover:text-teal-900 font-bold cursor-pointer"
                      >
                        Select All
                      </button>
                      <span className="text-slate-300">|</span>
                      <button
                        type="button"
                        onClick={deselectAllReportModalColumns}
                        className="text-slate-500 hover:text-slate-800 font-semibold cursor-pointer"
                      >
                        Clear
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-52 overflow-y-auto p-2 bg-slate-50/70 rounded-xl border border-slate-200">
                    {columns.map(col => {
                      const isSelected = reportModalColumns.includes(col.id);
                      return (
                        <label
                          key={col.id}
                          className={`flex items-center gap-2.5 p-2 rounded-lg border transition-all cursor-pointer select-none text-xs ${
                            isSelected
                              ? 'bg-white border-teal-300 shadow-2xs font-semibold text-slate-900'
                              : 'bg-slate-100/50 border-slate-200 text-slate-400'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleReportModalColumn(col.id)}
                            className="w-4 h-4 rounded text-teal-600 focus:ring-teal-500 border-slate-300 cursor-pointer shrink-0"
                          />
                          <span className="truncate">{col.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* Options: Set as Default View & Include Filters */}
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2 text-xs">
                  <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-800 select-none">
                    <input
                      type="checkbox"
                      checked={reportModalSetDefault}
                      onChange={(e) => setReportModalSetDefault(e.target.checked)}
                      className="w-4 h-4 rounded text-amber-500 focus:ring-amber-400 border-slate-300 cursor-pointer"
                    />
                    <span className="flex items-center gap-1.5">
                      <span>⭐️ Set as Default View</span>
                      <span className="text-[10px] text-slate-500 font-normal">(Automatically load this report view by default)</span>
                    </span>
                  </label>

                  {currentFilters.length > 0 && (
                    <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-700 select-none pt-1 border-t border-slate-200/80">
                      <input
                        type="checkbox"
                        checked={reportModalIncludeFilters}
                        onChange={(e) => setReportModalIncludeFilters(e.target.checked)}
                        className="w-4 h-4 rounded text-teal-600 focus:ring-teal-500 border-slate-300 cursor-pointer"
                      />
                      <span>Include current {currentFilters.length} active filter(s) in this report</span>
                    </label>
                  )}
                </div>

                {/* Modal Footer */}
                <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => {
                      setReportsModalTab('list');
                      setShowCreateReportModal(false);
                      setShowReportsViewsModal(true);
                    }}
                    className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
                  >
                    Back to List
                  </button>
                  <button
                    type="submit"
                    disabled={!reportModalName.trim() || reportModalColumns.length === 0}
                    className="px-4 py-2 text-xs font-bold bg-[#0f172a] hover:bg-[#1e293b] text-white rounded-xl shadow-xs transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5 text-teal-400" />
                    <span>Save Report & Apply</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
