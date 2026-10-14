import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import LoginModal from './components/LoginModal';
import FloatingChatbot from './components/FloatingChatbot';
import Dashboard from './views/Dashboard';
import MasterManagerView from './views/MasterManagerView';
import PaymentsView from './views/PaymentsView';
import ExpensesView from './views/ExpensesView';
import LedgerReportsView from './views/LedgerReportsView';
import API from './services/api';

export default function App() {
  const [user, setUser] = useState(null);
  const [currentTab, setCurrentTab] = useState('dashboard');
  const [isInitialized, setIsInitialized] = useState(true);
  const [authChecking, setAuthChecking] = useState(true);

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
      {/* Consolidated Sidebar */}
      <Sidebar
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        user={user}
        onLogout={handleLogout}
      />

      {/* Main Content View Area */}
      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        <div className="p-4 sm:p-8 max-w-7xl w-full mx-auto pb-24">
          {currentTab === 'dashboard' && <Dashboard />}
          {currentTab === 'masters' && <MasterManagerView />}
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
