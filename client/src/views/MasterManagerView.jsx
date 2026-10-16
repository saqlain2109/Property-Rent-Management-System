import React, { useEffect, useState } from 'react';
import API from '../services/api';
import PropertiesView from './PropertiesView';
import PartitionsView from './PartitionsView';
import TenantsView from './TenantsView';
import PGView from './PGView';
import { Building2, ChevronDown, ChevronRight, FolderTree, Home, Layers, Users } from 'lucide-react';

export default function MasterManagerView() {
  const [activeTab, setActiveTab] = useState('properties');
  const [propertyFilterForPartitions, setPropertyFilterForPartitions] = useState('');
  const [propertyFilter, setPropertyFilter] = useState('');
  const [expandedProperties, setExpandedProperties] = useState({});
  const [properties, setProperties] = useState([]);
  const [units, setUnits] = useState([]);
  const [tenantCount, setTenantCount] = useState(0);
  const [partitionSearch, setPartitionSearch] = useState('');

  const refreshTree = async () => {
    try {
      const [propertyRes, unitRes, tenantRes] = await Promise.all([
        API.get('/properties'),
        API.get('/units'),
        API.get('/tenants'),
      ]);
      if (propertyRes.data.success) setProperties(propertyRes.data.data);
      if (unitRes.data.success) setUnits(unitRes.data.data);
      if (tenantRes.data.success) setTenantCount(tenantRes.data.data.length);
    } catch (error) {
      console.error('Could not load master navigation tree:', error);
    }
  };

  useEffect(() => {
    refreshTree();
  }, []);

  const openProperty = (propertyId) => {
    setActiveTab('properties');
    setPropertyFilter(propertyId);
    setPropertyFilterForPartitions('');
  };

  const openPartitions = (propertyId, unitName = '') => {
    setPropertyFilterForPartitions(propertyId);
    setPropertyFilter('');
    setActiveTab('partitions');
    setPartitionSearch(unitName);
  };

  const chooseSection = (tab) => {
    setActiveTab(tab);
    setPropertyFilter('');
    setPropertyFilterForPartitions('');
  };

  return (
    <div className="flex flex-col md:flex-row gap-5 min-h-[70vh]">
      <aside className="w-full md:w-64 shrink-0 bg-white rounded-2xl border border-slate-200 shadow-sm p-3 self-start">
        <div className="flex items-center gap-2 px-3 py-2 mb-2 text-sm font-extrabold text-slate-900">
          <FolderTree className="w-4 h-4 text-emerald-600" />
          Masters
        </div>
        <div className="space-y-1">
          <button
            type="button"
            onClick={() => setExpandedProperties((state) => ({ ...state, root: !state.root }))}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-left text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            {expandedProperties.root === false ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            <Building2 className="w-4 h-4 text-emerald-600" />
            Properties
            <span className="ml-auto text-xs text-slate-400">{properties.length}</span>
          </button>
          {expandedProperties.root !== false && (
            <div className="ml-3 border-l border-slate-200 pl-2">
              <button
                type="button"
                onClick={() => chooseSection('properties')}
                className={`w-full text-left px-3 py-1.5 rounded-lg text-xs font-semibold ${activeTab === 'properties' && !propertyFilter ? 'bg-emerald-50 text-emerald-800' : 'text-slate-500 hover:bg-slate-50'}`}
              >
                All properties
              </button>
              {properties.map((property) => {
                const propertyUnits = units.filter((unit) => (unit.propertyId?._id || unit.propertyId) === property._id);
                const isExpanded = expandedProperties[property._id] === true;
                return (
                  <div key={property._id} className="mt-1">
                    <div className="flex items-center">
                      <button
                        type="button"
                        onClick={() => setExpandedProperties((state) => ({ ...state, [property._id]: !isExpanded }))}
                        aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${property.name}`}
                        className="p-1 text-slate-400 hover:text-slate-700"
                      >
                        {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => openProperty(property._id)}
                        className={`flex-1 text-left px-2 py-1.5 rounded-lg text-xs font-semibold truncate ${activeTab === 'properties' && propertyFilter === property._id ? 'bg-emerald-50 text-emerald-800' : 'text-slate-700 hover:bg-slate-50'}`}
                      >
                        {property.name}
                      </button>
                    </div>
                    {isExpanded && (
                      <div className="ml-5 border-l border-slate-200 pl-2">
                        {propertyUnits.map((unit) => (
                          <button
                            type="button"
                            key={unit._id}
                            onClick={() => openPartitions(property._id, unit.subUnitPartition || unit.unitName || '')}
                            className="w-full flex items-center gap-2 text-left px-2 py-1.5 rounded-lg text-xs text-slate-500 hover:bg-slate-50 hover:text-slate-800"
                          >
                            <Layers className="w-3.5 h-3.5 shrink-0" />
                            <span className="truncate">{unit.subUnitPartition || unit.unitName}</span>
                            <span className={`ml-auto w-1.5 h-1.5 rounded-full ${unit.occupancyStatus === 'Occupied' ? 'bg-amber-400' : 'bg-emerald-400'}`} />
                          </button>
                        ))}
                        {propertyUnits.length === 0 && <p className="px-2 py-1.5 text-[11px] text-slate-400">No units yet</p>}
                        <button
                          type="button"
                          onClick={() => openPartitions(property._id)}
                          className="w-full text-left px-2 py-1.5 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-50 rounded-lg"
                        >
                          + Add / view units
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {[
            { id: 'tenants', label: 'Tenants', icon: Users, count: tenantCount },
            { id: 'pg', label: 'PG Settlements', icon: Home },
          ].map(({ id, label, icon: Icon, count }) => (
            <button
              key={id} type="button" onClick={() => chooseSection(id)}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-left text-sm font-semibold ${activeTab === id ? 'bg-emerald-50 text-emerald-800' : 'text-slate-600 hover:bg-slate-50'}`}
            >
              <Icon className="w-4 h-4" />
              {label}
              {count !== undefined && (
                <span className="ml-auto text-xs text-slate-400 font-normal">{count}</span>
              )}
            </button>
          ))}
        </div>
      </aside>

      <div className="flex-1 min-w-0">
        {activeTab === 'properties' && (
          <PropertiesView
            key={propertyFilter || 'all-properties'}
            initialPropertyFilter={propertyFilter}
            onNavigateToPartitions={openPartitions}
            onDataChanged={refreshTree}
          />
        )}
        {activeTab === 'partitions' && (
          <PartitionsView
            key={`${propertyFilterForPartitions}:${partitionSearch}`}
            initialPropertyFilter={propertyFilterForPartitions}
            initialSearch={partitionSearch}
            onClearPropertyFilter={() => {
              setPropertyFilterForPartitions('');
              setPartitionSearch('');
            }}
            onDataChanged={refreshTree}
          />
        )}
        {activeTab === 'tenants' && <TenantsView onDataChanged={refreshTree} />}
        {activeTab === 'pg' && <PGView />}
      </div>
    </div>
  );
}
