/**
 * Global Navigation & Drilldown History Manager
 * Captures source screens when drilling down and restores them on Back / Update / Browser Back
 */

const STACK_KEY = 'app_navigation_drilldown_stack';

export function getDrilldownStack() {
  try {
    const raw = sessionStorage.getItem(STACK_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveDrilldownStack(stack) {
  try {
    sessionStorage.setItem(STACK_KEY, JSON.stringify(stack));
  } catch {}
}

/**
 * Record a drilldown step from one screen to another
 * @param {string} fromTab Source tab (e.g. 'contracts', 'reports_all_income', 'monthly')
 * @param {object} options Additional context (label, returnState, targetTab)
 */
export function pushDrilldown(fromTab, options = {}) {
  const stack = getDrilldownStack();
  const entry = {
    id: Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    fromTab,
    fromHash: window.location.hash || `#/${fromTab}`,
    targetTab: options.targetTab || '',
    label: options.label || `Back to ${formatTabLabel(fromTab)}`,
    returnState: options.returnState || {}
  };
  stack.push(entry);
  saveDrilldownStack(stack);
  return entry;
}

/**
 * Peek at the current active drilldown context (without removing it)
 */
export function peekDrilldown() {
  const stack = getDrilldownStack();
  return stack.length > 0 ? stack[stack.length - 1] : null;
}

/**
 * Pop and execute return navigation to the previous screen.
 * Restores return state (e.g. contracts_target_no) and navigates to the fromTab.
 * @returns {object|null} The popped drilldown entry, or null if no drilldown active
 */
export function popAndReturnDrilldown() {
  const stack = getDrilldownStack();
  if (stack.length === 0) return null;

  const entry = stack.pop();
  saveDrilldownStack(stack);

  // Restore any state keys
  if (entry.returnState) {
    if (entry.returnState.contractId) {
      localStorage.setItem('contracts_target_id', entry.returnState.contractId);
    }
    if (entry.returnState.contractNo) {
      localStorage.setItem('contracts_target_no', entry.returnState.contractNo);
    }
    if (entry.returnState.selectedMonth) {
      localStorage.setItem('payments_selected_month', entry.returnState.selectedMonth);
    }
    if (entry.returnState.propFilter) {
      localStorage.setItem('payments_prop_filter', entry.returnState.propFilter);
    }
    if (entry.returnState.propertyFilter) {
      localStorage.setItem('property_filter', entry.returnState.propertyFilter);
    }
  }

  // Navigate to fromTab
  const targetTab = entry.fromTab || 'dashboard';
  navigateToTab(targetTab);

  return entry;
}

/**
 * Programmatic cross-tab navigation helper.
 * Solves stale modal history state, fires custom events, and ensures instant tab mounting.
 */
export function navigateToTab(tab, returnState = {}) {
  if (!tab) return;
  localStorage.setItem('property_mgmt_active_tab', tab);

  const targetHash = `#/${tab}`;
  if (window.location.hash !== targetHash) {
    window.history.pushState({ tab }, '', targetHash);
  } else {
    window.history.replaceState({ tab }, '', targetHash);
  }

  // Notify App.jsx immediately
  window.dispatchEvent(new CustomEvent('app_navigate_tab', { detail: { tab, returnState } }));
  window.dispatchEvent(new CustomEvent('app_check_edit_request'));
}

/**
 * Clear all drilldown navigation history
 */
export function clearDrilldownStack() {
  sessionStorage.removeItem(STACK_KEY);
}

export function formatTabLabel(tab) {
  if (!tab) return 'Previous Screen';
  if (tab === 'contracts') return 'Lease Contracts';
  if (tab === 'reports_all_income') return 'All Income Report';
  if (tab === 'monthly') return 'Property Monthly Report';
  if (tab === 'ledger_reports') return 'Tenant Ledger';
  if (tab === 'dashboard') return 'Dashboard';
  if (tab === 'payments') return 'Rent & Payments';
  if (tab === 'properties') return 'Properties';
  if (tab === 'partitions') return 'Partitions';
  if (tab === 'tenants') return 'Tenants';
  if (tab === 'expenses') return 'Expenses';
  if (tab === 'lease_contract_report') return 'Lease Contract Report';
  if (tab === 'month_wise_report') return 'Month-Wise Report';
  if (tab.startsWith('reports_')) {
    return tab.replace('reports_', '').split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') + ' Report';
  }
  return tab.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}
