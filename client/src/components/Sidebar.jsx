import React, { useEffect, useRef } from 'react';
import { 
  Building2, Users, Receipt, CreditCard, PieChart, 
  Bot, LogOut, ArrowUpDown, Database, FileSpreadsheet
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
    { id: 'dashboard', label: 'Dashboard', icon: PieChart },
    { id: 'properties', label: 'Properties & Units', icon: Building2 },
    { id: 'tenants', label: 'Tenants & Leases', icon: Users },
    { id: 'payments', label: 'Rent Payments', icon: Receipt },
    { id: 'pg', label: 'PG Management', icon: ArrowUpDown },
    { id: 'expenses', label: 'Expenses', icon: CreditCard },
    { id: 'ledger', label: 'Financial Ledger', icon: FileSpreadsheet },
    { id: 'reports', label: 'Reports & Export', icon: FileSpreadsheet },
    { id: 'chatbot', label: 'Smart Assistant', icon: Bot },
    { id: 'migration', label: 'Excel Migration', icon: Database },
  ];

  return (
    <aside 
      ref={sidebarRef}
      className="w-64 bg-slate-900 text-slate-300 flex flex-col shrink-0 border-r border-slate-800 select-none"
    >
      {/* Brand Header */}
      <div className="p-6 border-b border-slate-800 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center text-white shadow-lg shadow-emerald-500/20">
          <Building2 className="w-6 h-6" />
        </div>
        <div>
          <h1 className="font-bold text-white tracking-wide text-base">EstateLedger</h1>
          <p className="text-xs text-emerald-400 font-medium">Rent & Property OS</p>
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 px-3 py-6 space-y-1.5 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setCurrentTab(item.id)}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                isActive
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* User Footer Profile */}
      <div className="p-4 border-t border-slate-800 bg-slate-950/40">
        <div className="flex items-center justify-between mb-3 px-1">
          <div>
            <p className="text-sm font-semibold text-white truncate max-w-[140px]">{user?.name || 'Administrator'}</p>
            <p className="text-xs text-slate-400 capitalize">{user?.role || 'Admin'}</p>
          </div>
          <button
            onClick={onLogout}
            title="Sign Out"
            className="p-2 text-slate-400 hover:text-rose-400 hover:bg-slate-800/80 rounded-lg transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
        <div className="text-[10px] text-slate-500 text-center tracking-wider uppercase font-semibold">
          Financial Year 2026
        </div>
      </div>
    </aside>
  );
}
