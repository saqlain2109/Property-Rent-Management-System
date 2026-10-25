import React, { useEffect, useRef, useState } from 'react';
import { 
  LayoutDashboard, FolderTree, IndianRupee, Receipt, 
  BookOpen, LogOut, Building2, ChevronDown, ChevronRight, ChevronLeft,
  Layers, Users, Home, UserCog, FileText, Tag, FileSpreadsheet, Download, Table,
  PanelLeftClose, PanelLeftOpen, TrendingUp, TrendingDown
} from 'lucide-react';
import gsap from 'gsap';
import API from '../services/api';

export default function Sidebar({ 
  currentTab, 
  setCurrentTab, 
  user, 
  onLogout, 
  onOpenProfile, 
  isOpen, 
  onClose,
  isCollapsed = false,
  onToggleCollapse
}) {
  const sidebarRef = useRef(null);
  const isMasterTab = ['masters', 'properties', 'partitions', 'tenants', 'contracts', 'expense_heads', 'pg'].includes(currentTab);
  const isReportsTab = ['ledger_reports', 'month_wise_report', 'monthly', 'reports_month_wise', 'reports_all_income', 'reports_all_expense', 'reports_matrix', 'reports_summary', 'reports_statement', 'reports_ledger', 'reports_export'].includes(currentTab);
  
  const [mastersExpanded, setMastersExpanded] = useState(true);
  const [reportsExpanded, setReportsExpanded] = useState(true);
  const [counts, setCounts] = useState({ properties: 0, units: 0, tenants: 0, contracts: 0, expenseHeads: 0 });

  // Floating submenu open states for collapsed mode
  const [showMastersFlyout, setShowMastersFlyout] = useState(false);
  const [showReportsFlyout, setShowReportsFlyout] = useState(false);

  const mastersFlyoutRef = useRef(null);
  const reportsFlyoutRef = useRef(null);

  useEffect(() => {
    if (sidebarRef.current) {
      gsap.fromTo(sidebarRef.current,
        { x: -30, opacity: 0 },
        { x: 0, opacity: 1, duration: 0.4, ease: 'power2.out' }
      );
    }
  }, []);

  // Close flyouts on outside click
  useEffect(() => {
    function handleClickOutside(event) {
      if (mastersFlyoutRef.current && !mastersFlyoutRef.current.contains(event.target)) {
        setShowMastersFlyout(false);
      }
      if (reportsFlyoutRef.current && !reportsFlyoutRef.current.contains(event.target)) {
        setShowReportsFlyout(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Automatically keep masters expanded when user is inside any master tab
  useEffect(() => {
    if (isMasterTab) {
      setMastersExpanded(true);
    }
  }, [isMasterTab]);

  // Automatically keep reports expanded when user is inside any report tab
  useEffect(() => {
    if (isReportsTab) {
      setReportsExpanded(true);
    }
  }, [isReportsTab]);

  // Fetch counts for properties, partitions, tenants, contracts, and expense heads
  useEffect(() => {
    const fetchCounts = async () => {
      try {
        const [pRes, uRes, tRes, cRes, catRes] = await Promise.all([
          API.get('/properties'),
          API.get('/units'),
          API.get('/tenants'),
          API.get('/assignments'),
          API.get('/expenses/categories'),
        ]);

        const allTenants = tRes.data?.data || [];
        const allContracts = cRes.data?.data || [];
        const activeTenants = allTenants.filter(t => t.activeAssignment || t.isActive).length;
        const activeContracts = allContracts.filter(c => c.status === 'Active').length;

        setCounts({
          properties: pRes.data?.data?.length || 0,
          units: uRes.data?.data?.length || 0,
          tenants: activeTenants || allTenants.length,
          contracts: activeContracts || allContracts.length,
          expenseHeads: catRes.data?.data?.length || 0,
        });
      } catch (e) {
        // quiet error
      }
    };
    fetchCounts();
  }, [currentTab]);

  const masterSubItems = [
    { id: 'properties',    label: 'Properties', icon: Building2, count: counts.properties },
    { id: 'partitions',    label: 'Partitions (Units)', icon: Layers, count: counts.units },
    { id: 'tenants',       label: 'Tenants', icon: Users, count: counts.tenants },
    { id: 'contracts',     label: 'Lease Contract', icon: FileText, count: counts.contracts },
    { id: 'expense_heads', label: 'Expense Heads', icon: Tag, count: counts.expenseHeads },
    { id: 'pg',            label: 'PG Settlements', icon: Home },
  ];

  const reportsSubItems = [
    { id: 'reports_month_wise', label: 'Month wise Report', icon: Table, badge: 'New' },
    { id: 'reports_all_income', label: 'All Income', icon: TrendingUp },
    { id: 'reports_all_expense', label: 'All Expense', icon: TrendingDown },
    { id: 'reports_matrix',     label: 'Property Monthly Matrix', icon: FileSpreadsheet, badge: 'Sheet 1' },
    { id: 'reports_ledger',     label: 'Account Book (Ledger)', icon: BookOpen },
    { id: 'reports_export',     label: 'Portfolio Workbook (Excel)', icon: Download },
  ];

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div 
          onClick={onClose}
          className="fixed inset-0 bg-slate-950/70 z-40 md:hidden backdrop-blur-xs transition-opacity"
        />
      )}

      <aside
        ref={sidebarRef}
        className={`fixed md:static inset-y-0 left-0 z-50 bg-slate-900 text-slate-300 flex flex-col shrink-0 border-r border-slate-800 select-none shadow-2xl md:shadow-xl transition-all duration-300 ease-in-out ${
          isCollapsed ? 'w-16' : 'w-64'
        } ${
          isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        {/* Brand & Collapse Toggle */}
        <div className={`p-3.5 border-b border-slate-800/80 flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'}`}>
          {!isCollapsed ? (
            <>
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center text-white shadow-lg shadow-emerald-500/20 shrink-0">
                  <Building2 className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h1 className="font-extrabold text-white tracking-wide text-sm leading-tight truncate">Property App</h1>
                  <p className="text-[10px] text-emerald-400 font-semibold tracking-wide truncate">Management System</p>
                </div>
              </div>
              {onToggleCollapse && (
                <button
                  type="button"
                  onClick={onToggleCollapse}
                  className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer shrink-0"
                  title="Collapse menu to increase screen view"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
              )}
            </>
          ) : (
            <button
              type="button"
              onClick={onToggleCollapse}
              className="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-600 hover:from-emerald-500 hover:to-teal-700 flex items-center justify-center text-white shadow-lg shadow-emerald-500/20 transition-all cursor-pointer group"
              title="Expand menu"
            >
              <ChevronRight className="w-5 h-5 transition-transform group-hover:scale-110" />
            </button>
          )}
        </div>

        {/* Navigation Menu */}
        <nav className="flex-1 p-2 space-y-1.5 overflow-y-auto overflow-x-hidden">
          {/* Dashboard */}
          <button
            onClick={() => setCurrentTab('dashboard')}
            title={isCollapsed ? 'Dashboard (Overview & KPIs)' : undefined}
            className={`w-full flex items-center ${isCollapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-3.5 py-2.5'} rounded-2xl text-left transition-all group ${
              currentTab === 'dashboard'
                ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg shadow-emerald-600/25'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <LayoutDashboard className={`w-4 h-4 shrink-0 ${currentTab === 'dashboard' ? 'text-white' : 'text-slate-500 group-hover:text-slate-300'}`} />
            {!isCollapsed && (
              <span className="text-xs font-bold truncate">Dashboard</span>
            )}
          </button>

          {/* Masters Tree Group */}
          <div className="pt-0.5 pb-0.5 relative" ref={mastersFlyoutRef}>
            {!isCollapsed ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setMastersExpanded(!mastersExpanded);
                    if (!isMasterTab) {
                      setCurrentTab('properties');
                    }
                  }}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-2xl text-left transition-all group ${
                    isMasterTab
                      ? 'bg-slate-800 text-white font-bold'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <FolderTree className={`w-4 h-4 shrink-0 ${isMasterTab ? 'text-emerald-400' : 'text-slate-500 group-hover:text-slate-300'}`} />
                    <span className="text-xs font-bold truncate">Masters</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[10px] bg-slate-700/60 text-slate-300 px-1.5 py-0.5 rounded-full font-medium">
                      6
                    </span>
                    {mastersExpanded ? (
                      <ChevronDown className="w-4 h-4 text-slate-400" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-slate-400" />
                    )}
                  </div>
                </button>

                {/* Sub-items list (Tree style) */}
                {mastersExpanded && (
                  <div className="ml-4 pl-3 border-l-2 border-slate-800 my-1.5 space-y-1">
                    {masterSubItems.map((sub) => {
                      const isSubActive = currentTab === sub.id;
                      const SubIcon = sub.icon;
                      return (
                        <button
                          key={sub.id}
                          type="button"
                          onClick={() => setCurrentTab(sub.id)}
                          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left text-xs transition-all ${
                            isSubActive
                              ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold shadow-md shadow-emerald-600/20'
                              : 'text-slate-400 hover:text-white hover:bg-slate-800/60 font-medium'
                          }`}
                        >
                          <SubIcon className={`w-3.5 h-3.5 shrink-0 ${isSubActive ? 'text-white' : 'text-slate-500'}`} />
                          <span className="truncate flex-1">{sub.label}</span>
                          {sub.count !== undefined && (
                            <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                              isSubActive ? 'bg-emerald-700/90 text-emerald-100' : 'bg-slate-800 text-slate-400'
                            }`}>
                              {sub.count}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </>
            ) : (
              /* Collapsed Masters Icon Button & Floating Submenu */
              <>
                <button
                  type="button"
                  onClick={() => setShowMastersFlyout(!showMastersFlyout)}
                  title="Masters (Properties, Units, Tenants, Contracts...)"
                  className={`w-full flex items-center justify-center px-2 py-2.5 rounded-2xl transition-all group ${
                    isMasterTab
                      ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg shadow-emerald-600/25'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                  }`}
                >
                  <FolderTree className={`w-4 h-4 shrink-0 ${isMasterTab ? 'text-white' : 'text-slate-500 group-hover:text-slate-300'}`} />
                </button>

                {showMastersFlyout && (
                  <div className="absolute left-full top-0 ml-2 w-52 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-2 z-50 space-y-1 animate-in fade-in zoom-in-95 duration-100">
                    <div className="px-3 py-1.5 text-[11px] font-extrabold text-slate-400 uppercase tracking-wider border-b border-slate-800">
                      Masters
                    </div>
                    {masterSubItems.map((sub) => {
                      const isSubActive = currentTab === sub.id;
                      const SubIcon = sub.icon;
                      return (
                        <button
                          key={sub.id}
                          type="button"
                          onClick={() => {
                            setCurrentTab(sub.id);
                            setShowMastersFlyout(false);
                          }}
                          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left text-xs transition-all ${
                            isSubActive
                              ? 'bg-emerald-600 text-white font-bold'
                              : 'text-slate-400 hover:text-white hover:bg-slate-800 font-medium'
                          }`}
                        >
                          <SubIcon className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate flex-1">{sub.label}</span>
                          {sub.count !== undefined && (
                            <span className="text-[10px] px-1.5 py-0.2 rounded-full font-bold bg-slate-800 text-slate-400">
                              {sub.count}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Rent & Payments */}
          <button
            onClick={() => setCurrentTab('payments')}
            title={isCollapsed ? 'Rent & Payments' : undefined}
            className={`w-full flex items-center ${isCollapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-3.5 py-2.5'} rounded-2xl text-left transition-all group ${
              currentTab === 'payments'
                ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg shadow-emerald-600/25'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <IndianRupee className={`w-4 h-4 shrink-0 ${currentTab === 'payments' ? 'text-white' : 'text-slate-500 group-hover:text-slate-300'}`} />
            {!isCollapsed && (
              <span className="text-xs font-bold truncate">Rent & Payments</span>
            )}
          </button>

          {/* Expenses */}
          <button
            onClick={() => setCurrentTab('expenses')}
            title={isCollapsed ? 'Expenses' : undefined}
            className={`w-full flex items-center ${isCollapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-3.5 py-2.5'} rounded-2xl text-left transition-all group ${
              currentTab === 'expenses'
                ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg shadow-emerald-600/25'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Receipt className={`w-4 h-4 shrink-0 ${currentTab === 'expenses' ? 'text-white' : 'text-slate-500 group-hover:text-slate-300'}`} />
            {!isCollapsed && (
              <span className="text-xs font-bold truncate">Expenses</span>
            )}
          </button>

          {/* Reports Group */}
          <div className="pt-0.5 pb-0.5 relative" ref={reportsFlyoutRef}>
            {!isCollapsed ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setReportsExpanded(!reportsExpanded);
                    if (!isReportsTab) {
                      setCurrentTab('reports_month_wise');
                    }
                  }}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-2xl text-left transition-all group ${
                    isReportsTab
                      ? 'bg-slate-800 text-white font-bold'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <BookOpen className={`w-4 h-4 shrink-0 ${isReportsTab ? 'text-emerald-400' : 'text-slate-500 group-hover:text-slate-300'}`} />
                    <span className="text-xs font-bold truncate">Reports</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[10px] bg-slate-700/60 text-slate-300 px-1.5 py-0.5 rounded-full font-medium">
                      4
                    </span>
                    {reportsExpanded ? (
                      <ChevronDown className="w-4 h-4 text-slate-400" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-slate-400" />
                    )}
                  </div>
                </button>

                {/* Sub-items list (Tree style) */}
                {reportsExpanded && (
                  <div className="ml-4 pl-3 border-l-2 border-slate-800 my-1.5 space-y-1">
                    {reportsSubItems.map((sub) => {
                      const isSubActive = currentTab === sub.id || 
                        (sub.id === 'reports_month_wise' && (currentTab === 'month_wise_report' || currentTab === 'monthly')) ||
                        (sub.id === 'reports_matrix' && currentTab === 'ledger_reports');
                      const SubIcon = sub.icon;
                      return (
                        <button
                          key={sub.id}
                          type="button"
                          onClick={() => setCurrentTab(sub.id)}
                          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left text-xs transition-all ${
                            isSubActive
                              ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold shadow-md shadow-emerald-600/20'
                              : 'text-slate-400 hover:text-white hover:bg-slate-800/60 font-medium'
                          }`}
                        >
                          <SubIcon className={`w-3.5 h-3.5 shrink-0 ${isSubActive ? 'text-white' : 'text-slate-500'}`} />
                          <span className="truncate flex-1">{sub.label}</span>
                          {sub.badge && (
                            <span className={`text-[9px] px-1.5 py-0.2 rounded font-black tracking-tight ${
                              isSubActive ? 'bg-emerald-700/90 text-emerald-100' : 'bg-slate-800 text-emerald-400'
                            }`}>
                              {sub.badge}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </>
            ) : (
              /* Collapsed Reports Icon Button & Floating Submenu */
              <>
                <button
                  type="button"
                  onClick={() => setShowReportsFlyout(!showReportsFlyout)}
                  title="Reports (Month wise, Property Matrix, Ledger, Export)"
                  className={`w-full flex items-center justify-center px-2 py-2.5 rounded-2xl transition-all group ${
                    isReportsTab
                      ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg shadow-emerald-600/25'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                  }`}
                >
                  <BookOpen className={`w-4 h-4 shrink-0 ${isReportsTab ? 'text-white' : 'text-slate-500 group-hover:text-slate-300'}`} />
                </button>

                {showReportsFlyout && (
                  <div className="absolute left-full top-0 ml-2 w-56 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-2 z-50 space-y-1 animate-in fade-in zoom-in-95 duration-100">
                    <div className="px-3 py-1.5 text-[11px] font-extrabold text-slate-400 uppercase tracking-wider border-b border-slate-800">
                      Reports
                    </div>
                    {reportsSubItems.map((sub) => {
                      const isSubActive = currentTab === sub.id || 
                        (sub.id === 'reports_month_wise' && (currentTab === 'month_wise_report' || currentTab === 'monthly')) ||
                        (sub.id === 'reports_matrix' && currentTab === 'ledger_reports');
                      const SubIcon = sub.icon;
                      return (
                        <button
                          key={sub.id}
                          type="button"
                          onClick={() => {
                            setCurrentTab(sub.id);
                            setShowReportsFlyout(false);
                          }}
                          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left text-xs transition-all ${
                            isSubActive
                              ? 'bg-emerald-600 text-white font-bold'
                              : 'text-slate-400 hover:text-white hover:bg-slate-800 font-medium'
                          }`}
                        >
                          <SubIcon className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate flex-1">{sub.label}</span>
                          {sub.badge && (
                            <span className="text-[9px] px-1.5 py-0.2 rounded font-black tracking-tight bg-slate-800 text-emerald-400">
                              {sub.badge}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        </nav>

        {/* User Footer */}
        <div className="p-3 border-t border-slate-800 bg-slate-950/40">
          {!isCollapsed ? (
            <div className="flex items-center justify-between gap-2">
              <button
                onClick={onOpenProfile}
                title="Edit Profile & Security Settings"
                className="flex items-center gap-2.5 min-w-0 text-left hover:opacity-80 transition-opacity flex-1 group"
              >
                <div className="w-8 h-8 rounded-xl bg-slate-800 group-hover:bg-emerald-600/20 text-slate-300 group-hover:text-emerald-400 flex items-center justify-center shrink-0 border border-slate-700 transition-colors">
                  <UserCog className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-white truncate group-hover:text-emerald-300 transition-colors">
                    {user?.name || user?.username || 'Administrator'}
                  </p>
                  <p className="text-[10px] text-emerald-400 font-medium capitalize truncate">
                    {user?.username ? `@${user.username}` : user?.role || 'Admin'}
                  </p>
                </div>
              </button>

              <button
                onClick={onLogout}
                title="Sign Out"
                className="p-2 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <button
                onClick={onOpenProfile}
                title={`Profile: ${user?.name || user?.username || 'Admin'}`}
                className="p-2 rounded-xl text-slate-400 hover:text-emerald-400 hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <UserCog className="w-4 h-4" />
              </button>
              <button
                onClick={onLogout}
                title="Sign Out"
                className="p-2 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
