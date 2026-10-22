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
import LedgerReportsView from './views/LedgerReportsView';
import API from './services/api';
import { Menu, Building2 } from 'lucide-react';

export default function App() {
  const [user, setUser] = useState(null);
  const [currentTab, setCurrentTab] = useState('dashboard');
  const [isInitialized, setIsInitialized] = useState(true);
  const [authChecking, setAuthChecking] = useState(true);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [partitionPropertyFilter, setPartitionPropertyFilter] = useState('');
  const [partitionSearch, setPartitionSearch] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const checkAuthStatus = async () => {
      try {
        const statusRes = await API.get('/auth/status');
        setIsInitialized(statusRes.data.isInitialized);

        const savedUser = localStorage.getItem('property_rent_user');
        const token = localStorage.getItem('property_rent_token');

        if (token && savedUser) {
          setUser(JSON.parse(savedUser));
        }
      } catch (err) {
        console.error('Auth verification error:', err);
      } finally {
        setAuthChecking(false);
      }
    };

    checkAuthStatus();
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('property_rent_token');
    localStorage.removeItem('property_rent_user');
    setUser(null);
  };

  if (authChecking) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-900 text-white">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-sm font-medium text-slate-400">Loading Property & Rent OS...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <LoginModal
        isSetupMode={!isInitialized}
        onLoginSuccess={(u) => {
          setUser(u);
          setIsInitialized(true);
        }}
      />
    );
  }

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden relative">
      {/* Consolidated Sidebar with Mobile Drawer support */}
      <Sidebar
        currentTab={currentTab}
        setCurrentTab={(tab) => {
          setCurrentTab(tab);
          setMobileMenuOpen(false);
        }}
        user={user}
        onLogout={handleLogout}
        onOpenProfile={() => setShowProfileModal(true)}
        isOpen={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
      />

      {/* Profile & Security Modal */}
      {showProfileModal && (
        <ProfileModal
          user={user}
          onUpdateUser={(updated) => setUser(updated)}
          onClose={() => setShowProfileModal(false)}
        />
      )}

      {/* Main Content View Area */}
      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* Mobile Top App Bar */}
        <div className="md:hidden flex items-center justify-between p-3.5 bg-slate-900 text-white border-b border-slate-800 shrink-0 sticky top-0 z-30 shadow-md">
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="p-2 rounded-xl bg-slate-800 text-slate-200 hover:text-white"
              title="Open Navigation Menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-teal-500 flex items-center justify-center text-white">
                <Building2 className="w-4 h-4" />
              </div>
              <span className="font-extrabold text-sm tracking-wide">Property Management</span>
            </div>
          </div>
          <span className="text-[11px] font-bold text-teal-400 capitalize px-2.5 py-1 rounded-full bg-slate-800 border border-slate-700">
            {currentTab.replace('_', ' ')}
          </span>
        </div>

        <div className="p-3 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto pb-24">
          {currentTab === 'dashboard' && <Dashboard />}

          {/* Master Views (rendered full-width, navigated via left sidebar toggle) */}
          {(currentTab === 'masters' || currentTab === 'properties') && (
            <PropertiesView
              onNavigateToPartitions={(propId) => {
                setPartitionPropertyFilter(propId);
                setPartitionSearch('');
                setCurrentTab('partitions');
              }}
            />
          )}

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

          {currentTab === 'ledger_reports' && <LedgerReportsView />}
        </div>
      </main>

      {/* Intelligent Floating Assistant Bot in Bottom-Left Corner */}
      <FloatingChatbot />
    </div>
  );
}
