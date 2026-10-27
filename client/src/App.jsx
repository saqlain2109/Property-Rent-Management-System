import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import LoginModal from './components/LoginModal';
import ProfileModal from './components/ProfileModal';
import FloatingChatbot from './components/FloatingChatbot';
import Dashboard from './views/Dashboard';
import PropertiesView from './views/PropertiesView';
import PartitionsView from './views/PartitionsView';
import TenantsView from './views/TenantsView';
import ContractsView from './views/ContractsView';
import PGView from './views/PGView';
import PaymentsView from './views/PaymentsView';
import ExpensesView from './views/ExpensesView';
import ExpenseHeadsMasterView from './views/ExpenseHeadsMasterView';
import LedgerReportsView from './views/LedgerReportsView';
import MonthWiseReportView from './views/MonthWiseReportView';
import API from './services/api';
import ErrorBoundary from './components/ErrorBoundary';
import GlobalTableScrollNavigator from './components/GlobalTableScrollNavigator';
import { Menu, Building2 } from 'lucide-react';
import { useAppFontSize, useTableAutoWrap, APP_FONT_SIZES } from './components/ColumnManager';
import { useModalBackHandler } from './utils/useModalBackHandler';

const VALID_TABS = [
  'dashboard',
  'properties',
  'partitions',
  'tenants',
  'contracts',
  'pg',
  'payments',
  'expenses',
  'expense_heads',
  'month_wise_report',
  'monthly',
  'ledger_reports'
];

function getTabFromHash() {
  if (typeof window === 'undefined') return null;
  const raw = window.location.hash.replace(/^#\/?/, '').trim();
  if (!raw) return null;
  if (raw.startsWith('reports_')) return raw;
  if (VALID_TABS.includes(raw)) return raw;
  return null;
}

export default function App() {
  const { fontSize, setFontSize, cycleFontSize } = useAppFontSize();
  const { autoWrap, toggleAutoWrap } = useTableAutoWrap();
  // Synchronously initialize user from localStorage to eliminate any unauthenticated flash on navigation
  const [user, setUser] = useState(() => {
    try {
      const savedUser = localStorage.getItem('property_rent_user');
      const token = localStorage.getItem('property_rent_token');
      if (token && savedUser) {
        return JSON.parse(savedUser);
      }
    } catch (err) {
      console.error('Failed to parse saved user:', err);
    }
    return null;
  });

  const [currentTab, setCurrentTabState] = useState(() => {
    const fromHash = getTabFromHash();
    if (fromHash) return fromHash;
    return localStorage.getItem('property_mgmt_active_tab') || 'dashboard';
  });

  const setCurrentTab = (newTab, options = {}) => {
    const { replace = false } = options;
    if (!newTab) return;

    setCurrentTabState(newTab);
    localStorage.setItem('property_mgmt_active_tab', newTab);

    const targetHash = `#/${newTab}`;
    if (window.location.hash !== targetHash) {
      if (replace) {
        window.history.replaceState({ tab: newTab }, '', targetHash);
      } else {
        window.history.pushState({ tab: newTab }, '', targetHash);
      }
    }
  };

  const [isInitialized, setIsInitialized] = useState(true);
  const [authChecking, setAuthChecking] = useState(() => {
    const token = localStorage.getItem('property_rent_token');
    const savedUser = localStorage.getItem('property_rent_user');
    return !(token && savedUser);
  });
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [partitionPropertyFilter, setPartitionPropertyFilter] = useState('');
  const [partitionSearch, setPartitionSearch] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    return localStorage.getItem('property_sidebar_collapsed') === 'true';
  });

  // Modal back button dismissal for Profile Modal
  useModalBackHandler(showProfileModal, () => setShowProfileModal(false));

  const handleToggleSidebar = () => {
    setSidebarCollapsed(prev => {
      const next = !prev;
      localStorage.setItem('property_sidebar_collapsed', String(next));
      return next;
    });
  };

  useEffect(() => {
    const checkAuthStatus = async () => {
      try {
        const statusRes = await API.get('/auth/status');
        setIsInitialized(statusRes.data.isInitialized);

        const savedUser = localStorage.getItem('property_rent_user');
        const token = localStorage.getItem('property_rent_token');

        if (token && savedUser) {
          setUser(JSON.parse(savedUser));
        } else {
          setUser(null);
        }
      } catch (err) {
        console.error('Auth verification error:', err);
      } finally {
        setAuthChecking(false);
      }
    };

    checkAuthStatus();
  }, []);

  // Hash & Browser History Listener
  useEffect(() => {
    if (!user) return;

    // Anchor initial hash if missing
    const initialHashTab = getTabFromHash() || currentTab || 'dashboard';
    if (window.location.hash !== `#/${initialHashTab}`) {
      window.history.replaceState({ tab: initialHashTab, appRoot: true }, '', `#/${initialHashTab}`);
    }

    const handlePopState = (e) => {
      // If modal was dismissed via popstate, do not switch main tabs
      if (e.state && e.state.modalOpen) {
        return;
      }

      const tabFromHash = getTabFromHash();
      if (tabFromHash) {
        setCurrentTabState(tabFromHash);
        localStorage.setItem('property_mgmt_active_tab', tabFromHash);
      } else {
        // Root boundary protection: if user pressed back past the initial hash,
        // keep them inside the app on dashboard rather than exiting the application or logging out
        window.history.pushState({ tab: 'dashboard', appRoot: true }, '', '#/dashboard');
        setCurrentTabState('dashboard');
        localStorage.setItem('property_mgmt_active_tab', 'dashboard');
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [user]);

  const handleLoginSuccess = (userData) => {
    setUser(userData);
    const activeTab = getTabFromHash() || localStorage.getItem('property_mgmt_active_tab') || 'dashboard';
    window.history.replaceState({ tab: activeTab, appRoot: true }, '', `#/${activeTab}`);
  };

  const handleLogout = () => {
    localStorage.removeItem('property_rent_token');
    localStorage.removeItem('property_rent_user');
    setUser(null);
    window.history.replaceState(null, '', '#/');
  };

  const handleNavigateToPartitions = (propertyId = '', searchQuery = '') => {
    setPartitionPropertyFilter(propertyId);
    setPartitionSearch(searchQuery);
    setCurrentTab('partitions');
  };

  if (authChecking) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-900 text-slate-100">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-sm font-semibold tracking-wide text-slate-400">Loading system...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center p-4">
        <div className="w-full max-w-md">
          <div className="flex items-center justify-center gap-3 mb-8">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Building2 className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight">Property & Rent</h1>
              <p className="text-xs text-slate-400">Management Information System</p>
            </div>
          </div>
          <LoginModal
            isOpen={true}
            isInitialSetup={!isInitialized}
            isSetupMode={!isInitialized}
            onLoginSuccess={handleLoginSuccess}
            onSuccess={handleLoginSuccess}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-slate-100 overflow-hidden font-sans text-slate-800">
      {/* Dynamic Responsive Sidebar (Collapsible) */}
      <Sidebar
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        user={user}
        onLogout={handleLogout}
        onOpenProfile={() => setShowProfileModal(true)}
        isOpen={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        isCollapsed={sidebarCollapsed}
        onToggleCollapse={handleToggleSidebar}
      />

      {/* Main View Area */}
      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* Mobile Header Bar */}
        <div className="md:hidden flex items-center justify-between p-4 bg-slate-900 border-b border-slate-800 text-white shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="p-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2">
              <Building2 className="w-5 h-5 text-emerald-400" />
              <span className="font-bold text-sm tracking-tight">Property Management</span>
            </div>
          </div>
          <span className="text-[11px] font-bold text-teal-400 capitalize px-2.5 py-1 rounded-full bg-slate-800 border border-slate-700">
            {currentTab.replace(/_/g, ' ')}
          </span>
        </div>

        {/* Desktop Header Bar when Sidebar is Collapsed */}
        {sidebarCollapsed && (
          <div className="hidden md:flex items-center justify-between px-4 py-2 bg-white border-b border-slate-200 text-slate-700 shrink-0 shadow-2xs select-none">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleToggleSidebar}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all cursor-pointer shadow-2xs"
                title="Expand Left Menu"
              >
                <Menu className="w-4 h-4 text-emerald-600" />
                <span>Show Menu</span>
              </button>
              <div className="flex items-center gap-2 text-xs font-extrabold text-slate-800">
                <Building2 className="w-4 h-4 text-emerald-600" />
                <span className="capitalize">{currentTab === 'contracts' ? 'Lease Contract' : currentTab.replace(/_/g, ' ')}</span>
              </div>
            </div>

            {/* Quick Font Size Controls & Auto-Wrap */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-xl p-0.5 text-xs">
                <span className="text-[10px] text-slate-400 font-bold px-1.5 uppercase">Font:</span>
                <button
                  type="button"
                  onClick={() => {
                    const sizes = APP_FONT_SIZES;
                    const idx = sizes.indexOf(fontSize);
                    if (idx > 0) setFontSize(sizes[idx - 1]);
                  }}
                  disabled={fontSize === APP_FONT_SIZES[0]}
                  className="px-1.5 py-0.5 rounded text-slate-600 hover:text-slate-900 hover:bg-white disabled:opacity-25 font-black text-xs cursor-pointer"
                  title="Smaller Font (A-)"
                >
                  A-
                </button>
                <button
                  type="button"
                  onClick={cycleFontSize}
                  className="px-2 py-0.5 rounded bg-white border border-slate-200 text-[10px] font-black uppercase text-teal-800 tracking-wider shadow-2xs hover:bg-slate-50 cursor-pointer"
                  title={`Current font size: ${fontSize}. Click to cycle.`}
                >
                  {fontSize}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const sizes = APP_FONT_SIZES;
                    const idx = sizes.indexOf(fontSize);
                    if (idx < sizes.length - 1) setFontSize(sizes[idx + 1]);
                  }}
                  disabled={fontSize === APP_FONT_SIZES[APP_FONT_SIZES.length - 1]}
                  className="px-1.5 py-0.5 rounded text-slate-600 hover:text-slate-900 hover:bg-white disabled:opacity-25 font-black text-xs cursor-pointer"
                  title="Larger Font (A+)"
                >
                  A+
                </button>
              </div>

              <span className="text-[11px] text-slate-400 font-semibold hidden lg:inline">
                Screen view maximized
              </span>
            </div>
          </div>
        )}

        {/* Dynamic Content Views */}
        <div className="flex-1 p-2 sm:p-2.5 md:p-3 w-full max-w-[1920px] mx-auto transition-all duration-300">
          <ErrorBoundary>
          {currentTab === 'dashboard' && (
            <Dashboard
              onNavigateToPartitions={handleNavigateToPartitions}
              setCurrentTab={setCurrentTab}
            />
          )}

          {currentTab === 'properties' && <PropertiesView />}

          {currentTab === 'partitions' && (
            <PartitionsView
              initialPropertyFilter={partitionPropertyFilter}
              initialSearch={partitionSearch}
              onClearPropertyFilter={() => {
                setPartitionPropertyFilter('');
                setPartitionSearch('');
              }}
            />
          )}

          {currentTab === 'tenants' && <TenantsView />}

          {currentTab === 'contracts' && <ContractsView />}

          {currentTab === 'pg' && <PGView />}

          {currentTab === 'payments' && <PaymentsView />}

          {currentTab === 'expenses' && <ExpensesView />}

          {currentTab === 'expense_heads' && <ExpenseHeadsMasterView />}

          {(currentTab === 'month_wise_report' || currentTab === 'monthly') && (
            <MonthWiseReportView />
          )}

          {(currentTab === 'ledger_reports' || currentTab.startsWith('reports_')) && (
            <LedgerReportsView 
              activeReportId={currentTab} 
              onSelectReport={(reportTab) => setCurrentTab(reportTab)}
            />
          )}
          </ErrorBoundary>
        </div>
      </main>

      {/* Intelligent Floating Assistant Bot (Temporarily Hidden) */}
      {/* <FloatingChatbot /> */}

      {/* Global On-Screen Table Horizontal Scroll Navigator */}
      <GlobalTableScrollNavigator />
    </div>
  );
}
