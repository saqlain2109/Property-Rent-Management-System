import React, { useState } from 'react';
import PropertiesView from './PropertiesView';
import TenantsView from './TenantsView';
import PGView from './PGView';
import { Building2, Users, Home } from 'lucide-react';

const TABS = [
  { id: 'properties', label: 'Properties & Units', icon: Building2, desc: 'Manage all your properties and their rooms/units' },
  { id: 'tenants', label: 'Tenants & Agreements', icon: Users, desc: 'Manage tenants, leases, and rent agreements' },
  { id: 'pg', label: 'PG Accounts', icon: Home, desc: 'Manage PG house monthly income records' },
];

export default function MasterManagerView() {
  const [activeTab, setActiveTab] = useState('properties');

  const currentTab = TABS.find(t => t.id === activeTab);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="bg-white p-5 sm:p-6 rounded-2xl shadow-sm border border-slate-200">
        <h2 className="text-xl font-extrabold text-slate-900">Records Manager</h2>
        <p className="text-sm text-slate-500 mt-0.5">
          {currentTab?.desc || 'Add, edit, and manage all your property and tenant records in one place'}
        </p>

        {/* Tab Pills */}
        <div className="flex flex-wrap items-center gap-2 mt-4">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                activeTab === id
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === 'properties' && <PropertiesView />}
        {activeTab === 'tenants' && <TenantsView />}
        {activeTab === 'pg' && <PGView />}
      </div>
    </div>
  );
}
