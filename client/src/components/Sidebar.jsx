import React, { useEffect, useRef, useState } from 'react';
import { 
  LayoutDashboard, FolderTree, IndianRupee, Receipt, 
  BookOpen, LogOut, Building2, ChevronDown, ChevronRight,
  Layers, Users, Home
} from 'lucide-react';
import gsap from 'gsap';
import API from '../services/api';

export default function Sidebar({ currentTab, setCurrentTab, user, onLogout }) {
  const sidebarRef = useRef(null);
  const isMasterTab = ['masters', 'properties', 'partitions', 'tenants', 'pg'].includes(currentTab);
  const [mastersExpanded, setMastersExpanded] = useState(true);
  const [counts, setCounts] = useState({ properties: 0, units: 0, tenants: 0 });

  useEffect(() => {
    if (sidebarRef.current) {
      gsap.fromTo(sidebarRef.current,
        { x: -30, opacity: 0 },
        { x: 0, opacity: 1, duration: 0.5, ease: 'power2.out' }
      );
    }
  }, []);

  // Automatically keep masters expanded when user is inside any master tab
  useEffect(() => {
    if (isMasterTab) {
      setMastersExpanded(true);
    }
  }, [isMasterTab]);

  // Fetch counts for properties, partitions, and tenants
  useEffect(() => {
    const fetchCounts = async () => {
      try {
        const [pRes, uRes, tRes] = await Promise.all([
          API.get('/properties'),
          API.get('/units'),
          API.get('/tenants'),
        ]);
        setCounts({
          properties: pRes.data?.data?.length || 0,
          units: uRes.data?.data?.length || 0,
          tenants: tRes.data?.data?.length || 0,
        });
      } catch (e) {
        // quiet error
      }
    };
    fetchCounts();
  }, [currentTab]);

  const masterSubItems = [
    { id: 'properties', label: 'Properties', icon: Building2, count: counts.properties },
    { id: 'partitions', label: 'Partitions (Units)', icon: Layers, count: counts.units },
    { id: 'tenants',    label: 'Tenants', icon: Users, count: counts.tenants },
    { id: 'pg',         label: 'PG Settlements', icon: Home },
  ];

  return (
    <aside
      ref={sidebarRef}
      className="w-64 bg-slate-900 text-slate-300 flex flex-col shrink-0 border-r border-slate-800 select-none shadow-xl"
    >
      {/* Brand */}
      <div className="p-5 border-b border-slate-800/80 flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center text-white shadow-lg shadow-emerald-500/20 shrink-0">
          <Building2 className="w-5 h-5" />
        </div>
        <div>
          <h1 className="font-extrabold text-white tracking-wide text-base leading-tight">EstateLedger</h1>
          <p className="text-[11px] text-emerald-400 font-semibold tracking-wide">Property Manager</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {/* Home / Dashboard */}
        <button
          onClick={() => setCurrentTab('dashboard')}
          className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-left transition-all group ${
            currentTab === 'dashboard'
              ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg shadow-emerald-600/25'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <LayoutDashboard className={`w-4 h-4 shrink-0 ${currentTab === 'dashboard' ? 'text-white' : 'text-slate-500 group-hover:text-slate-300'}`} />
          <div className="min-w-0">
            <p className="text-xs font-bold truncate">Home</p>
            <p className={`text-[10px] leading-tight truncate ${currentTab === 'dashboard' ? 'text-emerald-100/70' : 'text-slate-600 group-hover:text-slate-500'}`}>Overview</p>
          </div>
        </button>

        {/* Masters Accordion Toggle */}
        <div className="pt-1 pb-0.5">
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
              <div className="min-w-0">
                <p className="text-xs font-bold truncate">Masters</p>
                <p className={`text-[10px] leading-tight truncate ${isMasterTab ? 'text-emerald-400' : 'text-slate-600 group-hover:text-slate-500'}`}>
                  Properties, Units & Tenants
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-[10px] bg-slate-700/60 text-slate-300 px-1.5 py-0.5 rounded-full font-medium">
                {counts.properties + counts.tenants > 0 ? `${counts.properties}P · ${counts.tenants}T` : '4'}
              </span>
              {mastersExpanded ? (
                <ChevronDown className="w-4 h-4 text-slate-400" />
              ) : (
                <ChevronRight className="w-4 h-4 text-slate-400" />
              )}
            </div>
          </button>

          {/* Sub-items list (Tree style under Masters) */}
          {mastersExpanded && (
            <div className="ml-4 pl-3 border-l-2 border-slate-800 my-1.5 space-y-1">
              {masterSubItems.map((sub) => {
                const isSubActive = currentTab === sub.id || (sub.id === 'properties' && currentTab === 'masters');
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
        </div>

        {/* Rent & Payments */}
        <button
          onClick={() => setCurrentTab('payments')}
          className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-left transition-all group ${
            currentTab === 'payments'
              ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg shadow-emerald-600/25'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <IndianRupee className={`w-4 h-4 shrink-0 ${currentTab === 'payments' ? 'text-white' : 'text-slate-500 group-hover:text-slate-300'}`} />
          <div className="min-w-0">
            <p className="text-xs font-bold truncate">Rent & Payments</p>
            <p className={`text-[10px] leading-tight truncate ${currentTab === 'payments' ? 'text-emerald-100/70' : 'text-slate-600 group-hover:text-slate-500'}`}>Track & Record Rent</p>
          </div>
        </button>

        {/* Expenses */}
        <button
          onClick={() => setCurrentTab('expenses')}
          className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-left transition-all group ${
            currentTab === 'expenses'
              ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg shadow-emerald-600/25'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <Receipt className={`w-4 h-4 shrink-0 ${currentTab === 'expenses' ? 'text-white' : 'text-slate-500 group-hover:text-slate-300'}`} />
          <div className="min-w-0">
            <p className="text-xs font-bold truncate">Expenses</p>
            <p className={`text-[10px] leading-tight truncate ${currentTab === 'expenses' ? 'text-emerald-100/70' : 'text-slate-600 group-hover:text-slate-500'}`}>Costs & Repairs</p>
          </div>
        </button>

        {/* Reports */}
        <button
          onClick={() => setCurrentTab('ledger_reports')}
          className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-left transition-all group ${
            currentTab === 'ledger_reports'
              ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg shadow-emerald-600/25'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <BookOpen className={`w-4 h-4 shrink-0 ${currentTab === 'ledger_reports' ? 'text-white' : 'text-slate-500 group-hover:text-slate-300'}`} />
          <div className="min-w-0">
            <p className="text-xs font-bold truncate">Reports</p>
            <p className={`text-[10px] leading-tight truncate ${currentTab === 'ledger_reports' ? 'text-emerald-100/70' : 'text-slate-600 group-hover:text-slate-500'}`}>Account Book & Export</p>
          </div>
        </button>
      </nav>

      {/* User Footer */}
      <div className="p-4 border-t border-slate-800 bg-slate-950/40">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-xs font-bold text-white truncate">{user?.name || 'Administrator'}</p>
            <p className="text-[10px] text-emerald-400 font-medium capitalize">{user?.role || 'Admin'}</p>
          </div>
          <button
            onClick={onLogout}
            title="Sign Out"
            className="p-2 text-slate-500 hover:text-rose-400 hover:bg-slate-800 rounded-xl transition-colors shrink-0"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
        <div className="text-[10px] text-slate-600 text-center tracking-widest uppercase font-semibold mt-2">
          FY 2026
        </div>
      </div>
    </aside>
  );
}
