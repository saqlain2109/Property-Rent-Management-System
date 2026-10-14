import React, { useEffect, useRef } from 'react';
import { 
  LayoutDashboard, FolderOpen, IndianRupee, Receipt, 
  BookOpen, LogOut, Building2
} from 'lucide-react';
import gsap from 'gsap';

export default function Sidebar({ currentTab, setCurrentTab, user, onLogout }) {
  const sidebarRef = useRef(null);

  useEffect(() => {
    if (sidebarRef.current) {
      gsap.fromTo(sidebarRef.current,
        { x: -30, opacity: 0 },
        { x: 0, opacity: 1, duration: 0.5, ease: 'power2.out' }
      );
    }
  }, []);

  const navItems = [
    { id: 'dashboard',      label: 'Home',           icon: LayoutDashboard, desc: 'Overview' },
    { id: 'masters',        label: 'Records',        icon: FolderOpen,      desc: 'Properties & Tenants' },
    { id: 'payments',       label: 'Rent & Payments',icon: IndianRupee,     desc: 'Track & Record Rent' },
    { id: 'expenses',       label: 'Expenses',       icon: Receipt,         desc: 'Costs & Repairs' },
    { id: 'ledger_reports', label: 'Reports',        icon: BookOpen,        desc: 'Account Book & Export' },
  ];

  return (
    <aside
      ref={sidebarRef}
      className="w-60 bg-slate-900 text-slate-300 flex flex-col shrink-0 border-r border-slate-800 select-none shadow-xl"
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
      <nav className="flex-1 px-3 py-5 space-y-1 overflow-y-auto">
        {navItems.map(({ id, label, icon: Icon, desc }) => {
          const isActive = currentTab === id;
          return (
            <button
              key={id}
              onClick={() => setCurrentTab(id)}
              className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-2xl text-left transition-all group ${
                isActive
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg shadow-emerald-600/25'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Icon className={`w-4.5 h-4.5 shrink-0 ${isActive ? 'text-white' : 'text-slate-500 group-hover:text-slate-300'}`} style={{ width: '1.125rem', height: '1.125rem' }} />
              <div className="min-w-0">
                <p className="text-xs font-bold truncate">{label}</p>
                <p className={`text-[10px] leading-tight truncate ${isActive ? 'text-emerald-100/70' : 'text-slate-600 group-hover:text-slate-500'}`}>{desc}</p>
              </div>
            </button>
          );
        })}
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
