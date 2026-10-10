import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import LoginModal from './components/LoginModal';
import Dashboard from './views/Dashboard';
import PropertiesView from './views/PropertiesView';
import TenantsView from './views/TenantsView';
import PaymentsView from './views/PaymentsView';
import PGView from './views/PGView';
import ExpensesView from './views/ExpensesView';
import LedgerView from './views/LedgerView';
import ReportsView from './views/ReportsView';
import ChatbotView from './views/ChatbotView';
import MigrationView from './views/MigrationView';
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
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      <Sidebar
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        user={user}
        onLogout={handleLogout}
      />

      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        <div className="p-8 max-w-7xl w-full mx-auto">
          {currentTab === 'dashboard' && <Dashboard />}
          {currentTab === 'properties' && <PropertiesView />}
          {currentTab === 'tenants' && <TenantsView />}
          {currentTab === 'payments' && <PaymentsView />}
          {currentTab === 'pg' && <PGView />}
          {currentTab === 'expenses' && <ExpensesView />}
          {currentTab === 'ledger' && <LedgerView />}
          {currentTab === 'reports' && <ReportsView />}
          {currentTab === 'chatbot' && <ChatbotView />}
          {currentTab === 'migration' && <MigrationView />}
        </div>
      </main>
    </div>
  );
}
