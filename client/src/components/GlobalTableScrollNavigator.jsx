import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  ChevronLeft, 
  ChevronRight, 
  ChevronsLeft, 
  ChevronsRight, 
  MoveHorizontal, 
  Minimize2, 
  Maximize2 
} from 'lucide-react';

/**
 * GlobalTableScrollNavigator
 * 
 * Provides universal on-screen horizontal navigation for wide tables across all views and modals.
 * Features:
 * 1. Screen-Edge Floating Chevrons (Mid-screen Left & Right buttons, pinned at eye level over the active table).
 * 2. Floating Bottom Center Control Pill (First, Left, Interactive Scrubber/Percentage, Right, Last).
 * 3. Mouse Click-and-Drag Pan on tables (smooth grab-to-scroll).
 * 4. Keyboard Shortcuts (Alt + Left / Alt + Right).
 */
export default function GlobalTableScrollNavigator() {
  const [hasOverflow, setHasOverflow] = useState(false);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [scrollWidth, setScrollWidth] = useState(0);
  const [clientWidth, setClientWidth] = useState(0);
  const [tablePosition, setTablePosition] = useState({
    left: 0,
    right: 0,
    centerY: 0,
    centerX: 0,
    isVisible: false
  });
  const [isMinimized, setIsMinimized] = useState(() => {
    return localStorage.getItem('property_table_nav_minimized') === 'true';
  });

  const activeElementRef = useRef(null);
  const isDraggingRef = useRef(false);
  const dragStartXRef = useRef(0);
  const dragStartScrollLeftRef = useRef(0);
  const hasMovedRef = useRef(false);

  // Find the primary scrollable table or container currently visible
  const findScrollableContainer = useCallback(() => {
    // 1. Check for active modals first (e.g. ReportDrilldownModal, BatchModal)
    const activeModal = document.querySelector('[role="dialog"], .fixed.inset-0:not(.pointer-events-none)');
    if (activeModal) {
      const modalScrollable = activeModal.querySelector('.overflow-x-auto, [data-table-scroll]');
      if (modalScrollable && modalScrollable.scrollWidth > modalScrollable.clientWidth + 10) {
        return modalScrollable;
      }
    }

    // 2. If user recently interacted with a container that is still connected and has overflow, keep it
    if (activeElementRef.current && 
        document.body.contains(activeElementRef.current) && 
        activeElementRef.current.scrollWidth > activeElementRef.current.clientWidth + 10) {
      const r = activeElementRef.current.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && r.bottom > 80 && r.top < window.innerHeight - 80) {
        return activeElementRef.current;
      }
    }

    // 3. Scan main view for horizontal scroll containers with a table
    const candidates = Array.from(document.querySelectorAll('main .overflow-x-auto, main [data-table-scroll], .overflow-x-auto, [data-table-scroll]'));
    
    // Filter to only those with genuine horizontal overflow and visible in viewport
    const overflowCandidates = candidates.filter(el => {
      if (el.scrollWidth <= el.clientWidth + 10) return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && rect.bottom > 80 && rect.top < window.innerHeight - 80;
    });

    if (overflowCandidates.length > 0) {
      // Pick the largest candidate in view
      overflowCandidates.sort((a, b) => {
        const areaA = a.clientWidth * a.clientHeight;
        const areaB = b.clientWidth * b.clientHeight;
        return areaB - areaA;
      });
      return overflowCandidates[0];
    }

    // 4. Fallback: check any table parent with overflow
    const tables = Array.from(document.querySelectorAll('table'));
    for (const table of tables) {
      const parent = table.parentElement;
      if (parent && parent.scrollWidth > parent.clientWidth + 10) {
        const r = parent.getBoundingClientRect();
        if (r.width > 0 && r.height > 0 && r.bottom > 80 && r.top < window.innerHeight - 80) {
          return parent;
        }
      }
    }

    return null;
  }, []);

  // Sync state and compute geometric position
  const updateScrollState = useCallback(() => {
    const container = findScrollableContainer();
    if (!container) {
      activeElementRef.current = null;
      setHasOverflow(false);
      return;
    }

    activeElementRef.current = container;
    const currentScrollLeft = container.scrollLeft;
    const currentScrollWidth = container.scrollWidth;
    const currentClientWidth = container.clientWidth;
    const overflowExists = currentScrollWidth > currentClientWidth + 10;

    const rect = container.getBoundingClientRect();
    const visibleTop = Math.max(70, rect.top);
    const visibleBottom = Math.min(window.innerHeight - 70, rect.bottom);
    const isVisible = rect.width > 0 && rect.height > 0 && visibleBottom > visibleTop;

    const centerY = (visibleTop + visibleBottom) / 2;
    const centerX = (Math.max(rect.left, 0) + Math.min(rect.right, window.innerWidth)) / 2;

    setTablePosition({
      left: rect.left,
      right: rect.right,
      centerY,
      centerX,
      isVisible
    });

    setHasOverflow(overflowExists);
    setScrollLeft(currentScrollLeft);
    setScrollWidth(currentScrollWidth);
    setClientWidth(currentClientWidth);
  }, [findScrollableContainer]);

  useEffect(() => {
    updateScrollState();

    const handleContainerScroll = () => {
      if (activeElementRef.current) {
        setScrollLeft(activeElementRef.current.scrollLeft);
        setScrollWidth(activeElementRef.current.scrollWidth);
        setClientWidth(activeElementRef.current.clientWidth);
      }
    };

    // Any vertical scroll (on main or window) shifts the table position
    const handleAnyScroll = () => {
      if (activeElementRef.current) {
        const rect = activeElementRef.current.getBoundingClientRect();
        const visibleTop = Math.max(70, rect.top);
        const visibleBottom = Math.min(window.innerHeight - 70, rect.bottom);
        const isVisible = rect.width > 0 && rect.height > 0 && visibleBottom > visibleTop;
        const centerY = (visibleTop + visibleBottom) / 2;
        const centerX = (Math.max(rect.left, 0) + Math.min(rect.right, window.innerWidth)) / 2;

        setTablePosition({
          left: rect.left,
          right: rect.right,
          centerY,
          centerX,
          isVisible
        });
      } else {
        updateScrollState();
      }
    };

    let boundContainer = activeElementRef.current;
    if (boundContainer) {
      boundContainer.addEventListener('scroll', handleContainerScroll, { passive: true });
    }

    // Switch focus when user moves cursor over another scrollable container
    const handlePointerOver = (e) => {
      const scrollable = e.target.closest('.overflow-x-auto, [data-table-scroll]');
      if (scrollable && scrollable.scrollWidth > scrollable.clientWidth + 10) {
        if (activeElementRef.current !== scrollable) {
          if (boundContainer) {
            boundContainer.removeEventListener('scroll', handleContainerScroll);
          }
          activeElementRef.current = scrollable;
          boundContainer = scrollable;
          boundContainer.addEventListener('scroll', handleContainerScroll, { passive: true });
          updateScrollState();
        }
      }
    };

    // Keyboard shortcuts (Alt + ArrowLeft / Alt + ArrowRight)
    const handleKeyDown = (e) => {
      if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        if (activeElementRef.current && hasOverflow) {
          e.preventDefault();
          const amount = Math.max(300, Math.floor(activeElementRef.current.clientWidth * 0.5));
          activeElementRef.current.scrollBy({
            left: e.key === 'ArrowLeft' ? -amount : amount,
            behavior: 'smooth'
          });
        }
      }
    };

    // Drag-to-scroll (pan) on tables
    const handleMouseDown = (e) => {
      if (e.button !== 0) return;
      if (e.target.closest('input, textarea, select, button, a, [role="button"], .cursor-col-resize, label')) {
        return;
      }

      const container = e.target.closest('.overflow-x-auto, [data-table-scroll]');
      if (!container || container.scrollWidth <= container.clientWidth + 10) return;

      isDraggingRef.current = true;
      hasMovedRef.current = false;
      dragStartXRef.current = e.pageX;
      dragStartScrollLeftRef.current = container.scrollLeft;
      activeElementRef.current = container;
    };

    const handleMouseMove = (e) => {
      if (!isDraggingRef.current || !activeElementRef.current) return;
      const deltaX = e.pageX - dragStartXRef.current;
      if (Math.abs(deltaX) > 4) {
        hasMovedRef.current = true;
        activeElementRef.current.scrollLeft = dragStartScrollLeftRef.current - deltaX;
        activeElementRef.current.style.cursor = 'grabbing';
        activeElementRef.current.style.userSelect = 'none';
      }
    };

    const handleMouseUp = () => {
      if (isDraggingRef.current) {
        isDraggingRef.current = false;
        if (activeElementRef.current) {
          activeElementRef.current.style.cursor = '';
          activeElementRef.current.style.userSelect = '';
        }
      }
    };

    // Watch for DOM changes (navigation, filters, expanding rows, data loaded)
    const observer = new MutationObserver(() => {
      updateScrollState();
      if (activeElementRef.current && activeElementRef.current !== boundContainer) {
        if (boundContainer) {
          boundContainer.removeEventListener('scroll', handleContainerScroll);
        }
        boundContainer = activeElementRef.current;
        boundContainer.addEventListener('scroll', handleContainerScroll, { passive: true });
      }
    });

    observer.observe(document.body, { childList: true, subtree: true, attributes: false });
    window.addEventListener('resize', updateScrollState, { passive: true });
    window.addEventListener('hashchange', updateScrollState, { passive: true });
    document.addEventListener('scroll', handleAnyScroll, { capture: true, passive: true });
    document.addEventListener('pointerover', handlePointerOver, { passive: true });
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    const intervalId = setInterval(updateScrollState, 1500);

    return () => {
      clearInterval(intervalId);
      observer.disconnect();
      window.removeEventListener('resize', updateScrollState);
      window.removeEventListener('hashchange', updateScrollState);
      document.removeEventListener('scroll', handleAnyScroll, { capture: true });
      document.removeEventListener('pointerover', handlePointerOver);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      if (boundContainer) {
        boundContainer.removeEventListener('scroll', handleContainerScroll);
      }
    };
  }, [updateScrollState, hasOverflow]);

  if (!hasOverflow || !tablePosition.isVisible) {
    return null;
  }

  const maxScroll = Math.max(0, scrollWidth - clientWidth);
  const canScrollLeft = scrollLeft > 2;
  const canScrollRight = scrollLeft < maxScroll - 5;
  const scrollPercentage = maxScroll > 0 ? Math.min(100, Math.max(0, Math.round((scrollLeft / maxScroll) * 100))) : 0;

  const handleScroll = (amount, behavior = 'smooth') => {
    if (!activeElementRef.current) return;
    activeElementRef.current.scrollBy({ left: amount, behavior });
  };

  const handleScrollTo = (leftPos, behavior = 'smooth') => {
    if (!activeElementRef.current) return;
    activeElementRef.current.scrollTo({ left: leftPos, behavior });
  };

  const stepAmount = Math.max(300, Math.floor(clientWidth * 0.65));

  const handleScrubberClick = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clickX / rect.width));
    handleScrollTo(ratio * maxScroll);
  };

  const toggleMinimized = () => {
    setIsMinimized(prev => {
      const next = !prev;
      localStorage.setItem('property_table_nav_minimized', String(next));
      return next;
    });
  };

  // Safe horizontal positions avoiding sidebar and screen edges
  const leftEdgePos = Math.max(12, tablePosition.left + 12);
  const rightEdgePos = Math.max(leftEdgePos + 60, Math.min(window.innerWidth - 56, tablePosition.right - 56));
  const bottomPillPos = Math.max(200, Math.min(window.innerWidth - 200, tablePosition.centerX));

  return (
    <>
      {/* 1. Floating Left Chevron Button (Pinned at eye level over table) */}
      {canScrollLeft && (
        <div 
          className="fixed z-40 animate-in fade-in zoom-in-75 duration-150 pointer-events-auto"
          style={{ 
            left: `${leftEdgePos}px`, 
            top: `${tablePosition.centerY}px`,
            transform: 'translateY(-50%)'
          }}
        >
          <button
            type="button"
            onClick={() => handleScroll(-stepAmount)}
            className="group flex items-center justify-center w-11 h-11 rounded-full bg-slate-900/90 hover:bg-slate-950 text-white hover:text-teal-400 border border-slate-700/80 shadow-2xl backdrop-blur-md transition-all hover:scale-110 active:scale-95 cursor-pointer ring-2 ring-teal-500/40 hover:ring-teal-400 select-none"
            title="Scroll Table Left (◀)"
            aria-label="Scroll Table Left"
          >
            <ChevronLeft className="w-6 h-6 transition-transform group-hover:-translate-x-0.5" />
          </button>
        </div>
      )}

      {/* 2. Floating Right Chevron Button (Pinned at eye level over table) */}
      {canScrollRight && (
        <div 
          className="fixed z-40 animate-in fade-in zoom-in-75 duration-150 pointer-events-auto"
          style={{ 
            left: `${rightEdgePos}px`, 
            top: `${tablePosition.centerY}px`,
            transform: 'translateY(-50%)'
          }}
        >
          <button
            type="button"
            onClick={() => handleScroll(stepAmount)}
            className="group flex items-center justify-center w-11 h-11 rounded-full bg-slate-900/90 hover:bg-slate-950 text-white hover:text-teal-400 border border-slate-700/80 shadow-2xl backdrop-blur-md transition-all hover:scale-110 active:scale-95 cursor-pointer ring-2 ring-teal-500/40 hover:ring-teal-400 select-none"
            title="Scroll Table Right (▶)"
            aria-label="Scroll Table Right"
          >
            <ChevronRight className="w-6 h-6 transition-transform group-hover:translate-x-0.5" />
          </button>
        </div>
      )}

      {/* 3. Floating Bottom Control Bar */}
      <div 
        className="fixed bottom-5 z-40 select-none transition-all duration-200 pointer-events-auto"
        style={{
          left: `${bottomPillPos}px`,
          transform: 'translateX(-50%)'
        }}
      >
        {isMinimized ? (
          /* Minimized Compact Icon Button */
          <button
            type="button"
            onClick={toggleMinimized}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-900/90 text-white hover:text-teal-400 border border-slate-700/80 shadow-xl backdrop-blur-md text-xs font-bold transition-all hover:scale-105 active:scale-95 cursor-pointer"
            title="Expand Table Scroll Controls"
          >
            <MoveHorizontal className="w-3.5 h-3.5 text-teal-400" />
            <span>Scroll ({scrollPercentage}%)</span>
            <Maximize2 className="w-3 h-3 text-slate-400 ml-0.5" />
          </button>
        ) : (
          /* Full Expanded Controller Pill */
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-2xl bg-slate-950/90 text-white border border-slate-700/80 shadow-2xl backdrop-blur-md text-xs font-semibold">
            {/* Jump to Extreme Start */}
            <button
              type="button"
              onClick={() => handleScrollTo(0)}
              disabled={!canScrollLeft}
              className={`flex items-center gap-1 px-2 py-1 rounded-xl transition-all cursor-pointer ${
                canScrollLeft 
                  ? 'hover:bg-slate-800 text-slate-200 hover:text-white active:scale-95' 
                  : 'opacity-30 cursor-not-allowed text-slate-500'
              }`}
              title="Jump to First Column (Start)"
            >
              <ChevronsLeft className="w-4 h-4 text-teal-400" />
              <span className="hidden sm:inline text-[11px] font-bold">Start</span>
            </button>

            {/* Scroll Left Button */}
            <button
              type="button"
              onClick={() => handleScroll(-stepAmount)}
              disabled={!canScrollLeft}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-xl transition-all cursor-pointer font-bold ${
                canScrollLeft 
                  ? 'bg-slate-800 hover:bg-slate-700 text-white active:scale-95 shadow-xs' 
                  : 'opacity-30 cursor-not-allowed bg-slate-900 text-slate-500'
              }`}
              title="Scroll Left (◀)"
            >
              <ChevronLeft className="w-4 h-4 text-teal-400" />
              <span>Left</span>
            </button>

            {/* Interactive Progress Track & Scrubber */}
            <div 
              onClick={handleScrubberClick}
              className="flex items-center gap-2 px-2 py-1 rounded-xl bg-slate-900/90 border border-slate-800 cursor-pointer group"
              title="Click or drag to jump across columns"
            >
              <div className="w-20 sm:w-28 h-2 bg-slate-800 rounded-full overflow-hidden relative border border-slate-700/50">
                <div 
                  className="h-full bg-gradient-to-r from-teal-500 to-emerald-400 rounded-full transition-all duration-75"
                  style={{ width: `${Math.max(5, scrollPercentage)}%` }}
                />
              </div>
              <span className="text-[10px] font-mono font-extrabold text-teal-400 min-w-[34px] text-right">
                {scrollPercentage}%
              </span>
            </div>

            {/* Scroll Right Button */}
            <button
              type="button"
              onClick={() => handleScroll(stepAmount)}
              disabled={!canScrollRight}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-xl transition-all cursor-pointer font-bold ${
                canScrollRight 
                  ? 'bg-slate-800 hover:bg-slate-700 text-white active:scale-95 shadow-xs' 
                  : 'opacity-30 cursor-not-allowed bg-slate-900 text-slate-500'
              }`}
              title="Scroll Right (▶)"
            >
              <span>Right</span>
              <ChevronRight className="w-4 h-4 text-teal-400" />
            </button>

            {/* Jump to Extreme End */}
            <button
              type="button"
              onClick={() => handleScrollTo(scrollWidth)}
              disabled={!canScrollRight}
              className={`flex items-center gap-1 px-2 py-1 rounded-xl transition-all cursor-pointer ${
                canScrollRight 
                  ? 'hover:bg-slate-800 text-slate-200 hover:text-white active:scale-95' 
                  : 'opacity-30 cursor-not-allowed text-slate-500'
              }`}
              title="Jump to Last Column (End)"
            >
              <span className="hidden sm:inline text-[11px] font-bold">End</span>
              <ChevronsRight className="w-4 h-4 text-teal-400" />
            </button>

            {/* Minimize Pill Button */}
            <div className="border-l border-slate-800 pl-1 ml-0.5">
              <button
                type="button"
                onClick={toggleMinimized}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer"
                title="Minimize scroll bar"
              >
                <Minimize2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
