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

export default function App() {
  const [user, setUser] = useState(null);
  const [currentTab, setCurrentTab] = useState('dashboard');
  const [isInitialized, setIsInitialized] = useState(true);
  const [authChecking, setAuthChecking] = useState(true);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [partitionPropertyFilter, setPartitionPropertyFilter] = useState('');
  const [partitionSearch, setPartitionSearch] = useState('');

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
      {/* Consolidated Sidebar with Masters Toggle Accordion */}
      <Sidebar
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        user={user}
        onLogout={handleLogout}
        onOpenProfile={() => setShowProfileModal(true)}
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
        <div className="p-4 sm:p-8 max-w-7xl w-full mx-auto pb-24">
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
