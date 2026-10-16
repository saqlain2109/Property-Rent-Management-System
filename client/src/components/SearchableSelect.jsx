import React, { useState, useRef, useEffect } from 'react';
import { Search, ChevronDown, Check, X } from 'lucide-react';

export default function SearchableSelect({
  options = [],
  value,
  onChange,
  placeholder = 'Select...',
  searchPlaceholder = 'Type to search...',
  disabled = false,
  className = '',
  required = false,
  label = '',
  // Optional key overrides for raw object arrays
  displayKey,
  secondaryKey,
  valueKey,
  badgeKey
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const dropdownRef = useRef(null);
  const inputRef = useRef(null);

  // Normalize options to standard schema
  const normalizedOptions = options.map((opt) => {
    if (typeof opt !== 'object' || opt === null) {
      return { value: opt, label: String(opt), subtext: '', badge: '', disabled: false };
    }
    const val = valueKey ? opt[valueKey] : (opt.value !== undefined ? opt.value : opt._id || opt.id);
    const lab = displayKey ? opt[displayKey] : (opt.label !== undefined ? opt.label : opt.name || opt.title);
    const sub = secondaryKey ? opt[secondaryKey] : (opt.subtext || '');
    const badge = badgeKey ? opt[badgeKey] : (opt.badge || (opt.occupancyStatus ? opt.occupancyStatus : ''));
    const badgeColor = opt.badgeColor || (
      badge === 'Occupied' ? 'bg-amber-100 text-amber-800' :
      badge === 'Vacant' ? 'bg-emerald-100 text-emerald-800' :
      badge === 'Active' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
    );
    const isDisabled = opt.disabled !== undefined ? opt.disabled : false;

    return {
      raw: opt,
      value: val,
      label: lab,
      subtext: sub,
      badge,
      badgeColor,
      disabled: isDisabled
    };
  });

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
    if (!isOpen) {
      setQuery('');
    }
  }, [isOpen]);

  const selectedOption = normalizedOptions.find((opt) => String(opt.value) === String(value));

  const filteredOptions = normalizedOptions.filter((opt) => {
    if (!query) return true;
    const q = query.toLowerCase();
    const l = (opt.label || '').toLowerCase();
    const s = (opt.subtext || '').toLowerCase();
    const b = (opt.badge || '').toLowerCase();
    return l.includes(q) || s.includes(q) || b.includes(q);
  });

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      {label && (
        <label className="block text-xs font-semibold text-slate-600 mb-1">
          {label} {required && <span className="text-rose-500">*</span>}
        </label>
      )}

      {/* Trigger Button */}
      <div
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`w-full flex items-center justify-between px-3 py-2 text-xs rounded-xl border transition-all cursor-pointer select-none ${
          disabled
            ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
            : isOpen
            ? 'border-emerald-500 ring-2 ring-emerald-500/20 bg-white'
            : 'border-slate-200 bg-white hover:border-slate-300 text-slate-800'
        }`}
      >
        <div className="flex items-center gap-2 truncate flex-1 min-w-0">
          {selectedOption ? (
            <div className="flex items-center gap-2 truncate">
              <span className="font-semibold text-slate-900 truncate">{selectedOption.label}</span>
              {selectedOption.badge && (
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-semibold shrink-0 ${
                    selectedOption.badgeColor || 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {selectedOption.badge}
                </span>
              )}
              {selectedOption.subtext && (
                <span className="text-slate-400 text-[11px] truncate">({selectedOption.subtext})</span>
              )}
            </div>
          ) : (
            <span className="text-slate-400">{placeholder}</span>
          )}
        </div>
        <ChevronDown className={`w-3.5 h-3.5 text-slate-400 shrink-0 ml-1 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </div>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute z-50 left-0 right-0 mt-1.5 bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden text-xs animate-in fade-in duration-150">
          {/* Search Box */}
          <div className="p-2 border-b border-slate-100 bg-slate-50/70 flex items-center gap-2">
            <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full bg-transparent border-none text-xs text-slate-800 focus:outline-none placeholder:text-slate-400"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="text-slate-400 hover:text-slate-600 p-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Options List */}
          <div className="max-h-56 overflow-y-auto divide-y divide-slate-50 p-1">
            {filteredOptions.length === 0 ? (
              <div className="p-3 text-center text-slate-400 text-xs">No results found</div>
            ) : (
              filteredOptions.map((opt) => {
                const isSelected = String(opt.value) === String(value);
                const isDisabled = !!opt.disabled;

                return (
                  <div
                    key={opt.value}
                    onClick={() => {
                      if (isDisabled) return;
                      onChange(opt.value, opt.raw);
                      setIsOpen(false);
                    }}
                    className={`flex items-center justify-between p-2 rounded-lg transition-colors ${
                      isDisabled
                        ? 'opacity-60 bg-slate-50/50 cursor-not-allowed'
                        : isSelected
                        ? 'bg-emerald-50 text-emerald-900 font-semibold cursor-pointer'
                        : 'hover:bg-slate-50 text-slate-700 cursor-pointer'
                    }`}
                  >
                    <div className="flex flex-col min-w-0 pr-2">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate">{opt.label}</span>
                        {opt.badge && (
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-semibold shrink-0 ${
                              opt.badgeColor || 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {opt.badge}
                          </span>
                        )}
                      </div>
                      {opt.subtext && (
                        <span className="text-[11px] text-slate-400 truncate mt-0.5">
                          {opt.subtext}
                        </span>
                      )}
                    </div>
                    {isSelected && <Check className="w-4 h-4 text-emerald-600 shrink-0" />}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
