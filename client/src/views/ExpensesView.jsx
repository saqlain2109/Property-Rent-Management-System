import React, { useState, useEffect, useRef } from 'react';
import API from '../services/api';
import { formatCurrency, formatDate, formatMonthYear } from '../utils/formatters';
import ColumnManager, { getHeaderDragProps, useResizableColumns, ResizeHandle, useFrozenColumns, getFrozenColumnStyle } from '../components/ColumnManager';
import SearchableSelect from '../components/SearchableSelect';
import ApexToolbar from '../components/ApexToolbar';
import { cycleThreeStateSort, evaluateFilterRule, sortDataRows, extractUniqueValues } from '../utils/tableUtils';
import * as XLSX from 'xlsx';
import { 
  Plus, Search, RotateCcw, X, Edit2, Trash2, 
  Calendar, ChevronLeft, ChevronRight, Download, Check, 
  Layers, Receipt, IndianRupee, ArrowRight, Building, Building2,
  Sparkles, Filter, CheckCircle2, Clock, ArrowUp, ArrowDown, ArrowUpDown, SlidersHorizontal, Tag
} from 'lucide-react';

const DEFAULT_PROPERTY_HEADS = [
  'Maintenance',
  'Electricity & Utilities',
  'Repairs & Renovation',
  'Sweeper & Cleaning',
  'Property Rent Paid',
  'Deposit Refund',
  'Water Charges',
  'Property Tax'
];

const DEFAULT_COMMON_HEADS = [
  'MOM',
  'Margaret',
  'Islamic & Zakat',
  'Zakat',
  'Sadka',
  'Send to dubai',
  'IT Fees',
  'Donations',
  'Miscellaneous',
  'Miscellaneous exp',
  'Akbar',
  'Loan asgar Bhati',
  'Loan give to Gafoor',
  'Other'
];

const CATEGORY_OPTIONS = [
  ...DEFAULT_PROPERTY_HEADS,
  ...DEFAULT_COMMON_HEADS
];

const CATEGORY_COLORS = {
  'Maintenance': 'bg-blue-100 text-blue-700 border-blue-200',
  'Electricity & Utilities': 'bg-yellow-100 text-yellow-800 border-yellow-200',
  'Repairs & Renovation': 'bg-orange-100 text-orange-700 border-orange-200',
  'Sweeper & Cleaning': 'bg-cyan-100 text-cyan-700 border-cyan-200',
  'Property Rent Paid': 'bg-purple-100 text-purple-700 border-purple-200',
  'Deposit Refund': 'bg-teal-100 text-teal-700 border-teal-200',
  'Water Charges': 'bg-sky-100 text-sky-700 border-sky-200',
  'Property Tax': 'bg-rose-100 text-rose-700 border-rose-200',
  'MOM': 'bg-emerald-100 text-emerald-800 border-emerald-200',
  'Miscellaneous': 'bg-slate-100 text-slate-700 border-slate-200',
  'Zakat': 'bg-amber-100 text-amber-800 border-amber-200',
  'Sadka': 'bg-lime-100 text-lime-800 border-lime-200',
  'Margaret': 'bg-fuchsia-100 text-fuchsia-800 border-fuchsia-200',
  'Other': 'bg-gray-100 text-gray-700 border-gray-200',
  'Repair': 'bg-orange-100 text-orange-700 border-orange-200',
  'Cleaning': 'bg-cyan-100 text-cyan-700 border-cyan-200',
  'Security': 'bg-indigo-100 text-indigo-700 border-indigo-200',
};

const EXPENSES_SHEET_COLUMNS_DEF = [
  { id: 'index', label: '#', defaultVisible: true },
  { id: 'property', label: 'Property', defaultVisible: true },
  { id: 'category', label: 'Expense Type', defaultVisible: true },
  { id: 'description', label: 'What it was for', defaultVisible: true },
  { id: 'payee', label: 'Paid To / Vendor', defaultVisible: true },
  { id: 'paymentMode', label: 'Payment Mode', defaultVisible: true },
  { id: 'amount', label: 'Amount (₹)', defaultVisible: true },
  { id: 'createdAt', label: 'Created Date', defaultVisible: false },
  { id: 'updatedAt', label: 'Modified Date', defaultVisible: false },
  { id: 'actions', label: 'Actions', defaultVisible: true }
];

const DEFAULT_SHEET_COLUMN_WIDTHS = {
  index: 50,
  property: 160,
  category: 150,
  description: 240,
  payee: 150,
  paymentMode: 110,
  amount: 140,
  createdAt: 110,
  updatedAt: 110,
  actions: 110
};

const EXPENSES_REGISTER_COLUMNS_DEF = [
  { id: 'date', label: 'Month / Date', defaultVisible: true },
  { id: 'property', label: 'Property', defaultVisible: true },
  { id: 'category', label: 'Expense Type', defaultVisible: true },
  { id: 'description', label: 'What it was for', defaultVisible: true },
  { id: 'payee', label: 'Paid To / Mode', defaultVisible: true },
  { id: 'amount', label: 'Amount', defaultVisible: true },
  { id: 'createdAt', label: 'Created Date', defaultVisible: false },
  { id: 'updatedAt', label: 'Modified Date', defaultVisible: false },
  { id: 'actions', label: 'Action', defaultVisible: true }
];

const DEFAULT_REGISTER_COLUMN_WIDTHS = {
  date: 110,
  property: 150,
  category: 140,
  description: 230,
  payee: 140,
  amount: 120,
  createdAt: 110,
  updatedAt: 110,
  actions: 100
};

export default function ExpensesView() {
  const [activeTab, setActiveTab] = useState(() => {
    return localStorage.getItem('expenses_active_tab') || 'sheet';
  });
  useEffect(() => {
    localStorage.setItem('expenses_active_tab', activeTab);
  }, [activeTab]);

  const getCurrentMonthYear = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  };

  const [selectedMonth, setSelectedMonth] = useState(() => {
    return localStorage.getItem('expenses_selected_month') || getCurrentMonthYear();
  });
  useEffect(() => {
    if (selectedMonth) localStorage.setItem('expenses_selected_month', selectedMonth);
  }, [selectedMonth]);

  const [expenses, setExpenses] = useState([]);
  const [categories, setCategories] = useState([]);
  const [properties, setProperties] = useState([]);
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(true);

  // New Category & Master Heads Modal states
  const [showAddCategoryModal, setShowAddCategoryModal] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryType, setNewCategoryType] = useState('Property');
  const [creatingCategory, setCreatingCategory] = useState(false);

  // Manage Expense Heads Master Modal states
  const [showManageHeadsModal, setShowManageHeadsModal] = useState(false);
  const [manageHeadsTab, setManageHeadsTab] = useState('Property'); // 'Property' | 'Common'
  const [newHeadName, setNewHeadName] = useState('');
  const [editingHeadId, setEditingHeadId] = useState(null);
  const [editingHeadName, setEditingHeadName] = useState('');
  const [headSaving, setHeadSaving] = useState(false);
  const [headError, setHeadError] = useState('');

  // Frozen Columns
  const [frozenSheetCount, setFrozenSheetCount] = useFrozenColumns('expenses_sheet_freeze_v1', 0);
  const [frozenRegisterCount, setFrozenRegisterCount] = useFrozenColumns('expenses_register_freeze_v1', 0);

  // Filters for Sheet and Register with localStorage persistence
  const [sheetSearch, setSheetSearch] = useState(() => localStorage.getItem('expenses_sheet_search') || '');
  useEffect(() => { localStorage.setItem('expenses_sheet_search', sheetSearch); }, [sheetSearch]);

  const [sheetPropFilter, setSheetPropFilter] = useState(() => localStorage.getItem('expenses_sheet_prop') || '');
  useEffect(() => { localStorage.setItem('expenses_sheet_prop', sheetPropFilter); }, [sheetPropFilter]);

  const [sheetCatFilter, setSheetCatFilter] = useState(() => localStorage.getItem('expenses_sheet_cat') || '');
  useEffect(() => { localStorage.setItem('expenses_sheet_cat', sheetCatFilter); }, [sheetCatFilter]);

  const [registerSearch, setRegisterSearch] = useState(() => localStorage.getItem('expenses_reg_search') || '');
  useEffect(() => { localStorage.setItem('expenses_reg_search', registerSearch); }, [registerSearch]);

  const [registerPropFilter, setRegisterPropFilter] = useState(() => localStorage.getItem('expenses_reg_prop') || '');
  useEffect(() => { localStorage.setItem('expenses_reg_prop', registerPropFilter); }, [registerPropFilter]);

  const [registerCatFilter, setRegisterCatFilter] = useState(() => localStorage.getItem('expenses_reg_cat') || '');
  useEffect(() => { localStorage.setItem('expenses_reg_cat', registerCatFilter); }, [registerCatFilter]);

  const [registerMonthFilter, setRegisterMonthFilter] = useState(() => localStorage.getItem('expenses_reg_month') || '');
  useEffect(() => { localStorage.setItem('expenses_reg_month', registerMonthFilter); }, [registerMonthFilter]);

  // Scope Filter: 'property' (Default: Property-specific maintenance) | 'other' (Other/Company Expenses) | 'all'
  const [expenseScope, setExpenseScope] = useState(() => {
    return localStorage.getItem('expenses_scope_filter') || 'property';
  });
  useEffect(() => {
    localStorage.setItem('expenses_scope_filter', expenseScope);
  }, [expenseScope]);

  // APEX Toolbar & Table States for Sheet
  const [sheetFilters, setSheetFilters] = useState([]);
  const [sheetSortConfig, setSheetSortConfig] = useState({ key: null, direction: null });
  const [isSheetHeaderSticky, setIsSheetHeaderSticky] = useState(true);
  const [sheetRowsPerPage, setSheetRowsPerPage] = useState('All');
  const [sheetCurrentPage, setSheetCurrentPage] = useState(1);
  const [sheetActiveViewId, setSheetActiveViewId] = useState(null);

  // APEX Toolbar & Table States for Register
  const [registerFilters, setRegisterFilters] = useState([]);
  const [registerSortConfig, setRegisterSortConfig] = useState({ key: 'date', direction: 'desc' });
  const [isRegisterHeaderSticky, setIsRegisterHeaderSticky] = useState(true);
  const [registerRowsPerPage, setRegisterRowsPerPage] = useState(25);
  const [registerCurrentPage, setRegisterCurrentPage] = useState(1);
  const [registerActiveViewId, setRegisterActiveViewId] = useState(null);

  const handleSheetHeaderSort = (colId) => {
    if (colId === 'actions') return;
    setSheetSortConfig(prev => cycleThreeStateSort(prev, colId));
  };

  const handleRegisterHeaderSort = (colId) => {
    if (colId === 'actions') return;
    setRegisterSortConfig(prev => cycleThreeStateSort(prev, colId));
  };

  // Modals & Inline Edit States
  const [showModal, setShowModal] = useState(false);
  const [editingExpenseId, setEditingExpenseId] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [entryByDate, setEntryByDate] = useState(false);

  // Fast Inline Row Draft for Sheet
  const [quickForm, setQuickForm] = useState({
    propertyId: '',
    unitId: '',
    category: 'Maintenance',
    description: '',
    vendorOrPayee: '',
    paymentMode: 'Cash',
    amount: ''
  });
  const [quickSaving, setQuickSaving] = useState(false);
  const [quickSaveSuccess, setQuickSaveSuccess] = useState(false);
  const quickAmountInputRef = useRef(null);

  // Inline Row Amount Edit inside Sheet Table
  const [editingRowAmount, setEditingRowAmount] = useState({}); // { [expenseId]: '4500' }
  const [savingRowId, setSavingRowId] = useState(null);

  // Column Resizing for Sheet
  const [visibleSheetColumns, setVisibleSheetColumns] = useState(() => {
    const saved = localStorage.getItem('cols_expenses_sheet_v1');
    if (saved) {
      try {
        const allowed = EXPENSES_SHEET_COLUMNS_DEF.map(c => c.id);
        return JSON.parse(saved).filter(c => allowed.includes(c));
      } catch (e) {}
    }
    return EXPENSES_SHEET_COLUMNS_DEF.filter(c => c.defaultVisible !== false).map(c => c.id);
  });

  const {
    columnWidths: sheetColumnWidths,
    handleResizeStart: handleSheetResizeStart,
    resetColumnWidths: resetSheetColumnWidths
  } = useResizableColumns('expenses_sheet_v1', DEFAULT_SHEET_COLUMN_WIDTHS);

  // Column Resizing for Register
  const [visibleRegisterColumns, setVisibleRegisterColumns] = useState(() => {
    const saved = localStorage.getItem('cols_expenses_register_v1');
    if (saved) {
      try {
        const allowed = EXPENSES_REGISTER_COLUMNS_DEF.map(c => c.id);
        return JSON.parse(saved).filter(c => allowed.includes(c));
      } catch (e) {}
    }
    return EXPENSES_REGISTER_COLUMNS_DEF.filter(c => c.defaultVisible !== false).map(c => c.id);
  });

  const {
    columnWidths: registerColumnWidths,
    handleResizeStart: handleRegisterResizeStart,
    resetColumnWidths: resetRegisterColumnWidths
  } = useResizableColumns('expenses_register_v1', DEFAULT_REGISTER_COLUMN_WIDTHS);

  // Add / Edit Modal Form State
  const [form, setForm] = useState({
    expenseMonth: getCurrentMonthYear(),
    expenseDate: new Date().toISOString().split('T')[0],
    propertyId: '',
    unitId: '',
    category: 'Maintenance',
    amount: '',
    description: '',
    vendorOrPayee: '',
    paymentMode: 'Cash',
  });

  const fetchData = async () => {
    try {
      setLoading(true);
      const [eRes, cRes, pRes, uRes] = await Promise.all([
        API.get('/expenses'),
        API.get('/expenses/categories'),
        API.get('/properties'),
        API.get('/units'),
      ]);
      if (eRes.data.success) setExpenses(eRes.data.data);
      if (cRes.data.success) setCategories(cRes.data.data);
      if (pRes.data.success) {
        const allProps = pRes.data.data;
        setProperties(allProps);
        const regularProps = allProps.filter(p => p.propertyCode !== 'PROP-COMMON' && p.propertyType !== 'General / Common');
        if (regularProps.length > 0) {
          setQuickForm(prev => prev.propertyId ? prev : ({ ...prev, propertyId: regularProps[0]._id, category: 'Maintenance' }));
          setForm(prev => prev.propertyId ? prev : ({ ...prev, propertyId: regularProps[0]._id, category: 'Maintenance' }));
        }
      }
      if (uRes.data.success) setUnits(uRes.data.data);
    } catch (err) {
      console.error('Failed to load expenses data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Separate Common vs Property Heads
  const commonCategories = React.useMemo(() => {
    const fromApi = categories
      .filter(c => typeof c === 'object' && c.headType === 'Common')
      .map(c => c.name);
    const set = new Set([...DEFAULT_COMMON_HEADS, ...fromApi]);
    return Array.from(set);
  }, [categories]);

  const propertyCategories = React.useMemo(() => {
    const fromApi = categories
      .filter(c => typeof c === 'object' && c.headType !== 'Common')
      .map(c => c.name);
    const set = new Set([...DEFAULT_PROPERTY_HEADS, ...fromApi]);
    return Array.from(set);
  }, [categories]);

  // Compute merged category names from defaults and DB
  const allCategoryNames = React.useMemo(() => {
    return Array.from(new Set([...propertyCategories, ...commonCategories]));
  }, [propertyCategories, commonCategories]);

  // Check if property is General Common (no income, only expenses)
  const isGeneralCommonProperty = (propId) => {
    if (propId === '__OTHER_EXPENSES__') return true;
    if (!propId) return false;
    const prop = properties.find(p => String(p._id) === String(propId));
    if (!prop) return false;
    return prop.propertyCode === 'PROP-COMMON' || 
           prop.name?.toLowerCase().includes('general common') || 
           prop.propertyType === 'General / Common';
  };

  // Helper to determine if an expense is an "Other Expense" (Non-property / Company cost like MOM, Zakat, Misc, Margaret)
  const isExpenseOther = (expense) => {
    if (!expense) return false;
    const propCode = expense.propertyId?.propertyCode || '';
    const propName = expense.propertyId?.name || '';
    const propType = expense.propertyId?.propertyType || '';
    if (propCode === 'PROP-COMMON' || propName.toLowerCase().includes('general common') || propType === 'General / Common') {
      return true;
    }
    const cat = (expense.category || '').toLowerCase();
    const commonLowerSet = new Set(commonCategories.map(c => c.toLowerCase()));
    if (commonLowerSet.has(cat)) return true;
    const knownOther = ['mom', 'margaret', 'zakat', 'sadka', 'islamic', 'send to dubai', 'it fees', 'donations', 'akbar', 'bhati', 'gafoor'];
    return knownOther.some(k => cat.includes(k));
  };

  const handleScopeChange = (newScope) => {
    setExpenseScope(newScope);
    const regularProps = properties.filter(p => p.propertyCode !== 'PROP-COMMON' && p.propertyType !== 'General / Common' && !p.name?.toLowerCase().includes('general common'));
    const commonProp = properties.find(p => p.propertyCode === 'PROP-COMMON' || p.propertyType === 'General / Common' || p.name?.toLowerCase().includes('general common'));
    
    if (newScope === 'other') {
      setQuickForm(prev => ({
        ...prev,
        propertyId: commonProp?._id || '__OTHER_EXPENSES__',
        unitId: '',
        category: commonCategories[0] || 'MOM'
      }));
    } else if (newScope === 'property' && regularProps.length > 0) {
      setQuickForm(prev => ({
        ...prev,
        propertyId: regularProps[0]._id,
        unitId: '',
        category: propertyCategories[0] || 'Maintenance'
      }));
    }
  };

  const handleQuickPropertyChange = (newPropId) => {
    const isCommon = isGeneralCommonProperty(newPropId);
    let nextCat = quickForm.category;
    if (isCommon && !commonCategories.includes(quickForm.category)) {
      nextCat = commonCategories[0] || 'MOM';
    } else if (!isCommon && !propertyCategories.includes(quickForm.category)) {
      nextCat = propertyCategories[0] || 'Maintenance';
    }
    setQuickForm(prev => ({ ...prev, propertyId: newPropId, unitId: '', category: nextCat }));
  };

  const handleModalPropertyChange = (newPropId) => {
    const isCommon = isGeneralCommonProperty(newPropId);
    let nextCat = form.category;
    if (isCommon && !commonCategories.includes(form.category)) {
      nextCat = commonCategories[0] || 'MOM';
    } else if (!isCommon && !propertyCategories.includes(form.category)) {
      nextCat = propertyCategories[0] || 'Maintenance';
    }
    setForm(prev => ({ ...prev, propertyId: newPropId, unitId: '', category: nextCat }));
  };

  // Handle creating new expense category on the fly
  const handleCreateCategory = async (name, explicitType) => {
    const catName = (name || newCategoryName).trim();
    if (!catName) return;
    const activePropId = showModal ? form.propertyId : quickForm.propertyId;
    const type = explicitType || newCategoryType || (isGeneralCommonProperty(activePropId) ? 'Common' : 'Property');
    try {
      setCreatingCategory(true);
      const res = await API.post('/expenses/categories', { name: catName, headType: type });
      if (res.data.success) {
        await fetchData();
        if (showModal) {
          setForm(f => ({ ...f, category: catName }));
        } else {
          setQuickForm(f => ({ ...f, category: catName }));
        }
        setShowAddCategoryModal(false);
        setNewCategoryName('');
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to create category');
    } finally {
      setCreatingCategory(false);
    }
  };

  // Manage Expense Heads Master actions
  const handleAddNewHead = async (e) => {
    if (e) e.preventDefault();
    const name = newHeadName.trim();
    if (!name) return;
    try {
      setHeadSaving(true);
      setHeadError('');
      const res = await API.post('/expenses/categories', {
        name,
        headType: manageHeadsTab
      });
      if (res.data.success) {
        setNewHeadName('');
        await fetchData();
      }
    } catch (err) {
      setHeadError(err.response?.data?.message || 'Failed to add head');
    } finally {
      setHeadSaving(false);
    }
  };

  const handleUpdateHead = async (catId) => {
    const name = editingHeadName.trim();
    if (!name) return;
    try {
      setHeadSaving(true);
      setHeadError('');
      const res = await API.put(`/expenses/categories/${catId}`, {
        name,
        headType: manageHeadsTab
      });
      if (res.data.success) {
        setEditingHeadId(null);
        setEditingHeadName('');
        await fetchData();
      }
    } catch (err) {
      setHeadError(err.response?.data?.message || 'Failed to update head');
    } finally {
      setHeadSaving(false);
    }
  };

  const handleDeleteHead = async (catId) => {
    if (!window.confirm('Are you sure you want to delete this expense head?')) return;
    try {
      setHeadSaving(true);
      setHeadError('');
      const res = await API.delete(`/expenses/categories/${catId}`);
      if (res.data.success) {
        await fetchData();
      }
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to delete head';
      setHeadError(msg);
      alert(msg);
    } finally {
      setHeadSaving(false);
    }
  };

  // Month Navigation Handlers (Same as PaymentsView)
  const handlePrevMonth = () => {
    const [y, m] = selectedMonth.split('-').map(Number);
    const d = new Date(y, m - 2, 1);
    const prev = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    setSelectedMonth(prev);
  };

  const handleNextMonth = () => {
    const [y, m] = selectedMonth.split('-').map(Number);
    const d = new Date(y, m, 1);
    const next = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    setSelectedMonth(next);
  };

  const handleSelectCustomMonth = (e) => {
    if (e.target.value) {
      setSelectedMonth(e.target.value);
    }
  };

  // Month-Specific Expenses for the Excel Grid
  const monthExpenses = React.useMemo(() => {
    return expenses.filter(e => {
      if (e.isReversed) return false;
      const expM = e.expenseMonth || (e.expenseDate ? e.expenseDate.slice(0, 7) : '');
      return expM === selectedMonth;
    });
  }, [expenses, selectedMonth]);

  const sheetFilterSuggestions = React.useMemo(() => {
    return {
      property: extractUniqueValues(monthExpenses, e => e.propertyId?.name || 'General (Common)'),
      category: extractUniqueValues(monthExpenses, e => e.category || 'Maintenance'),
      description: extractUniqueValues(monthExpenses, e => e.description),
      payee: extractUniqueValues(monthExpenses, e => e.vendorOrPayee),
      paymentMode: ['Cash', 'UPI', 'Bank Transfer', 'Cheque']
    };
  }, [monthExpenses]);

  const filteredMonthExpenses = React.useMemo(() => {
    return monthExpenses.filter(e => {
      const propName = e.propertyId?.name || 'General (Common)';
      const subUnitName = e.unitId?.subUnitPartition || e.unitId?.unitName || 'Entire Property';
      const cat = e.category || 'Maintenance';
      const desc = e.description || '';
      const payee = e.vendorOrPayee || '';
      const mode = e.paymentMode || 'Cash';
      const amt = String(e.amount || 0);

      const matchesSearch = !sheetSearch ||
        desc.toLowerCase().includes(sheetSearch.toLowerCase()) ||
        payee.toLowerCase().includes(sheetSearch.toLowerCase()) ||
        propName.toLowerCase().includes(sheetSearch.toLowerCase()) ||
        cat.toLowerCase().includes(sheetSearch.toLowerCase());

      const matchesProp = !sheetPropFilter || String(e.propertyId?._id || e.propertyId || '') === sheetPropFilter;
      const matchesCat = !sheetCatFilter || cat === sheetCatFilter;

      if (!matchesSearch || !matchesProp || !matchesCat) return false;

      // Expense Scope Filter: 'property' (Default: regular properties only) | 'other' (Other/Company Expenses) | 'all'
      if (expenseScope === 'property' && isExpenseOther(e)) return false;
      if (expenseScope === 'other' && !isExpenseOther(e)) return false;

      // APEX Filters
      for (const f of sheetFilters) {
        let fieldVal = '';
        if (f.columnId === 'property') fieldVal = `${propName} ${subUnitName}`;
        else if (f.columnId === 'category') fieldVal = cat;
        else if (f.columnId === 'description') fieldVal = desc;
        else if (f.columnId === 'payee') fieldVal = payee;
        else if (f.columnId === 'paymentMode') fieldVal = mode;
        else if (f.columnId === 'amount') fieldVal = amt;
        else if (f.columnId === 'createdAt') fieldVal = e.createdAt ? formatDate(e.createdAt) : '';
        else if (f.columnId === 'updatedAt') fieldVal = e.updatedAt ? formatDate(e.updatedAt) : '';

        if (!evaluateFilterRule(fieldVal, f.operator, f.value)) return false;
      }

      return true;
    });
  }, [monthExpenses, sheetSearch, sheetPropFilter, sheetCatFilter, sheetFilters, expenseScope]);

  // Sorted Month Expenses
  const sortedMonthExpenses = React.useMemo(() => {
    return sortDataRows(filteredMonthExpenses, sheetSortConfig, {
      index: (_, idx) => idx + 1,
      property: e => e.propertyId?.name || '',
      category: e => e.category || '',
      description: e => e.description || '',
      payee: e => e.vendorOrPayee || '',
      paymentMode: e => e.paymentMode || '',
      amount: e => Number(e.amount) || 0,
      createdAt: e => e.createdAt,
      updatedAt: e => e.updatedAt
    });
  }, [filteredMonthExpenses, sheetSortConfig]);

  // Sheet Pagination
  const totalSheetItems = sortedMonthExpenses.length;
  const isAllSheetRows = sheetRowsPerPage === 'All';
  const effectiveSheetPageSize = isAllSheetRows ? totalSheetItems || 1 : Number(sheetRowsPerPage);
  const totalSheetPages = Math.ceil(totalSheetItems / effectiveSheetPageSize) || 1;

  useEffect(() => {
    if (sheetCurrentPage > totalSheetPages) setSheetCurrentPage(1);
  }, [totalSheetPages, sheetCurrentPage]);

  const paginatedMonthExpenses = React.useMemo(() => {
    if (isAllSheetRows) return sortedMonthExpenses;
    const startIndex = (sheetCurrentPage - 1) * effectiveSheetPageSize;
    return sortedMonthExpenses.slice(startIndex, startIndex + effectiveSheetPageSize);
  }, [sortedMonthExpenses, isAllSheetRows, sheetCurrentPage, effectiveSheetPageSize]);

  const monthTotalSum = sortedMonthExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);

  // Fast Inline Expense Entry (Direct in the Sheet)
  const handleFastAddExpense = async (e) => {
    if (e) e.preventDefault();
    if (!quickForm.amount || Number(quickForm.amount) <= 0) {
      alert('Please enter a valid expense amount greater than 0.');
      quickAmountInputRef.current?.focus();
      return;
    }
    if (!quickForm.description.trim()) {
      alert('Please enter what this expense was for (Description).');
      return;
    }

    try {
      setQuickSaving(true);
      const commonProp = properties.find(p => p.propertyCode === 'PROP-COMMON' || p.propertyType === 'General / Common' || p.name?.toLowerCase().includes('general common'));
      let targetPropId = quickForm.propertyId;
      let targetUnitId = quickForm.unitId;
      if (targetPropId === '__OTHER_EXPENSES__' || !targetPropId) {
        targetPropId = commonProp?._id || null;
        targetUnitId = null;
      }

      const payload = {
        propertyId: targetPropId,
        unitId: targetUnitId || null,
        category: quickForm.category || 'Maintenance',
        description: quickForm.description.trim(),
        vendorOrPayee: quickForm.vendorOrPayee.trim(),
        paymentMode: quickForm.paymentMode || 'Cash',
        amount: Number(quickForm.amount),
        expenseMonth: selectedMonth,
        expenseDate: `${selectedMonth}-01`
      };

      const res = await API.post('/expenses', payload);
      if (res.data.success) {
        setQuickSaveSuccess(true);
        setTimeout(() => setQuickSaveSuccess(false), 2500);

        // Reset fast form inputs, keeping property & category ready for next entry
        setQuickForm(prev => ({
          ...prev,
          unitId: '',
          description: '',
          vendorOrPayee: '',
          amount: ''
        }));
        await fetchData();
        quickAmountInputRef.current?.focus();
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Could not save expense.');
    } finally {
      setQuickSaving(false);
    }
  };

  // Inline Row Amount Save in Excel Table
  const handleSaveInlineRowAmount = async (expenseId) => {
    const newAmtStr = editingRowAmount[expenseId];
    if (newAmtStr === undefined) return;
    const num = Number(newAmtStr);
    if (isNaN(num) || num <= 0) {
      alert('Please enter a valid amount.');
      return;
    }

    try {
      setSavingRowId(expenseId);
      const res = await API.put(`/expenses/${expenseId}`, { amount: num });
      if (res.data.success) {
        setEditingRowAmount(prev => {
          const updated = { ...prev };
          delete updated[expenseId];
          return updated;
        });
        await fetchData();
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Could not update amount.');
    } finally {
      setSavingRowId(null);
    }
  };

  // Export Month's Expense Sheet to Excel (.xlsx)
  const exportMonthExpensesToExcel = () => {
    if (sortedMonthExpenses.length === 0) {
      alert(`No expenses recorded for ${formatMonthYear(selectedMonth)} to export.`);
      return;
    }

    const exportRows = sortedMonthExpenses.map((e, idx) => ({
      'Sr. No.': idx + 1,
      'Month': formatMonthYear(selectedMonth),
      'Property': e.propertyId?.name || 'General / Common',
      'Partition': e.unitId?.subUnitPartition || e.unitId?.unitName || 'Entire Property',
      'Expense Type': e.category || 'Maintenance',
      'What it was for': e.description || '',
      'Paid To / Vendor': e.vendorOrPayee || '—',
      'Payment Mode': e.paymentMode || 'Cash',
      'Amount (₹)': e.amount || 0,
      'Created Date': e.createdAt ? formatDate(e.createdAt) : '',
      'Modified Date': e.updatedAt ? formatDate(e.updatedAt) : ''
    }));

    // Add Grand Total Row
    exportRows.push({
      'Sr. No.': '',
      'Month': '',
      'Property': '',
      'Partition': '',
      'Expense Type': '',
      'What it was for': 'TOTAL EXPENSES',
      'Paid To / Vendor': '',
      'Payment Mode': '',
      'Amount (₹)': monthTotalSum,
      'Created Date': '',
      'Modified Date': ''
    });

    const ws = XLSX.utils.json_to_sheet(exportRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Expenses_${selectedMonth}`);
    XLSX.writeFile(wb, `Property_Expenses_${selectedMonth}.xlsx`);
  };

  // Standard Modal Actions
  const resetForm = () => {
    setEditingExpenseId(null);
    setEntryByDate(false);
    setForm({
      expenseMonth: selectedMonth,
      expenseDate: new Date().toISOString().split('T')[0],
      propertyId: '',
      unitId: '',
      category: 'Maintenance',
      amount: '',
      description: '',
      vendorOrPayee: '',
      paymentMode: 'Cash',
    });
  };

  const handleOpenCreate = () => {
    resetForm();
    setShowModal(true);
  };

  const handleSaveModal = async (e) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      const categoryName = form.category.trim();
      const commonProp = properties.find(p => p.propertyCode === 'PROP-COMMON' || p.propertyType === 'General / Common' || p.name?.toLowerCase().includes('general common'));
      let targetPropId = form.propertyId;
      let targetUnitId = form.unitId;
      if (targetPropId === '__OTHER_EXPENSES__' || !targetPropId) {
        targetPropId = commonProp?._id || null;
        targetUnitId = null;
      }

      const payload = {
        ...form,
        propertyId: targetPropId,
        unitId: targetUnitId || null,
        category: categoryName,
        expenseMonth: !entryByDate ? form.expenseMonth : (form.expenseDate ? form.expenseDate.slice(0, 7) : form.expenseMonth),
        expenseDate: entryByDate ? form.expenseDate : `${form.expenseMonth}-01`
      };

      if (editingExpenseId) {
        const res = await API.put(`/expenses/${editingExpenseId}`, payload);
        if (res.data.success) {
          setShowModal(false);
          resetForm();
          fetchData();
        }
      } else {
        const res = await API.post('/expenses', payload);
        if (res.data.success) {
          setShowModal(false);
          resetForm();
          fetchData();
        }
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Could not save expense.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReverse = async (id) => {
    const reason = prompt('Why are you cancelling/reversing this expense?');
    if (!reason || !reason.trim()) return;
    try {
      await API.post(`/expenses/${id}/reverse`, { reversalReason: reason.trim() });
      fetchData();
    } catch (err) {
      alert(err.response?.data?.message || 'Could not reverse expense.');
    }
  };

  const handleDeleteExpense = async (id) => {
    if (!window.confirm('Are you sure you want to permanently delete this expense record?')) return;
    try {
      await API.delete(`/expenses/${id}`);
      fetchData();
    } catch (err) {
      alert(err.response?.data?.message || 'Could not delete expense.');
    }
  };

  // Register Filter Suggestions
  const registerFilterSuggestions = React.useMemo(() => {
    return {
      property: extractUniqueValues(expenses, e => e.propertyId?.name || 'General'),
      category: extractUniqueValues(expenses, e => e.category || 'Maintenance'),
      description: extractUniqueValues(expenses, e => e.description),
      payee: extractUniqueValues(expenses, e => e.vendorOrPayee),
      date: extractUniqueValues(expenses, e => e.expenseMonth ? formatMonthYear(e.expenseMonth) : formatDate(e.expenseDate))
    };
  }, [expenses]);

  // Full Register Filtered List
  const filteredRegister = React.useMemo(() => {
    return expenses.filter((e) => {
      const propName = e.propertyId?.name || 'General';
      const subUnitName = e.unitId?.subUnitPartition || e.unitId?.unitName || 'Entire Property';
      const cat = e.category || 'Maintenance';
      const desc = e.description || '';
      const payee = e.vendorOrPayee || '';
      const mode = e.paymentMode || 'Cash';
      const amt = String(e.amount || 0);
      const expM = e.expenseMonth || (e.expenseDate ? e.expenseDate.slice(0, 7) : '');
      const dateStr = e.expenseMonth ? formatMonthYear(e.expenseMonth) : (e.expenseDate ? formatDate(e.expenseDate) : '');

      const matchesSearch =
        !registerSearch ||
        desc.toLowerCase().includes(registerSearch.toLowerCase()) ||
        payee.toLowerCase().includes(registerSearch.toLowerCase()) ||
        propName.toLowerCase().includes(registerSearch.toLowerCase()) ||
        cat.toLowerCase().includes(registerSearch.toLowerCase());

      const matchesCategory = !registerCatFilter || cat === registerCatFilter;
      const matchesProp = !registerPropFilter || String(e.propertyId?._id || e.propertyId || '') === registerPropFilter;
      const matchesMonth = !registerMonthFilter || expM === registerMonthFilter;

      if (!matchesSearch || !matchesCategory || !matchesProp || !matchesMonth) return false;

      // Expense Scope Filter: 'property' (Default: regular properties only) | 'other' (Other/Company Expenses) | 'all'
      if (expenseScope === 'property' && isExpenseOther(e)) return false;
      if (expenseScope === 'other' && !isExpenseOther(e)) return false;

      // APEX Filters
      for (const f of registerFilters) {
        let fieldVal = '';
        if (f.columnId === 'date') fieldVal = dateStr;
        else if (f.columnId === 'property') fieldVal = `${propName} ${subUnitName}`;
        else if (f.columnId === 'category') fieldVal = cat;
        else if (f.columnId === 'description') fieldVal = desc;
        else if (f.columnId === 'payee') fieldVal = `${payee} ${mode}`;
        else if (f.columnId === 'amount') fieldVal = amt;
        else if (f.columnId === 'createdAt') fieldVal = e.createdAt ? formatDate(e.createdAt) : '';
        else if (f.columnId === 'updatedAt') fieldVal = e.updatedAt ? formatDate(e.updatedAt) : '';

        if (!evaluateFilterRule(fieldVal, f.operator, f.value)) return false;
      }

      return true;
    });
  }, [expenses, registerSearch, registerCatFilter, registerPropFilter, registerMonthFilter, registerFilters, expenseScope]);

  // Sorted Register
  const sortedRegister = React.useMemo(() => {
    return sortDataRows(filteredRegister, registerSortConfig, {
      date: e => e.expenseDate || e.expenseMonth || '',
      property: e => e.propertyId?.name || '',
      category: e => e.category || '',
      description: e => e.description || '',
      payee: e => e.vendorOrPayee || '',
      amount: e => Number(e.amount) || 0,
      createdAt: e => e.createdAt,
      updatedAt: e => e.updatedAt
    });
  }, [filteredRegister, registerSortConfig]);

  // Register Pagination
  const totalRegisterItems = sortedRegister.length;
  const isAllRegisterRows = registerRowsPerPage === 'All';
  const effectiveRegisterPageSize = isAllRegisterRows ? totalRegisterItems || 1 : Number(registerRowsPerPage);
  const totalRegisterPages = Math.ceil(totalRegisterItems / effectiveRegisterPageSize) || 1;

  useEffect(() => {
    if (registerCurrentPage > totalRegisterPages) setRegisterCurrentPage(1);
  }, [totalRegisterPages, registerCurrentPage]);

  const paginatedRegister = React.useMemo(() => {
    if (isAllRegisterRows) return sortedRegister;
    const startIndex = (registerCurrentPage - 1) * effectiveRegisterPageSize;
    return sortedRegister.slice(startIndex, startIndex + effectiveRegisterPageSize);
  }, [sortedRegister, isAllRegisterRows, registerCurrentPage, effectiveRegisterPageSize]);

  const totalRegisterShown = sortedRegister.reduce((s, e) => s + (e.isReversed ? 0 : e.amount), 0);

  // Export Register to Excel (.xlsx)
  const exportRegisterToExcel = () => {
    if (sortedRegister.length === 0) {
      alert('No expenses match the current filters to export.');
      return;
    }
    const exportRows = sortedRegister.map((e, idx) => ({
      '#': idx + 1,
      'Month / Date': e.expenseMonth ? formatMonthYear(e.expenseMonth) : formatDate(e.expenseDate),
      'Property': e.propertyId?.name || 'General',
      'Partition': e.unitId?.subUnitPartition || e.unitId?.unitName || 'Entire Property',
      'Expense Type': e.category || 'Maintenance',
      'What it was for': e.description || '',
      'Paid To / Payee': e.vendorOrPayee || '—',
      'Payment Mode': e.paymentMode || 'Cash',
      'Amount (₹)': Number(e.amount) || 0,
      'Created Date': e.createdAt ? formatDate(e.createdAt) : '',
      'Modified Date': e.updatedAt ? formatDate(e.updatedAt) : ''
    }));
    const ws = XLSX.utils.json_to_sheet(exportRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Expenses_Register');
    XLSX.writeFile(wb, `Expenses_Register_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };
  const allCategories = [...new Set([
    ...CATEGORY_OPTIONS,
    ...categories.map(c => (typeof c === 'string' ? c : c.name)).filter(Boolean)
  ])].sort((a, b) => a.localeCompare(b));

  const availableExpenseMonths = [...new Set(
    expenses.map(e => e.expenseMonth || (e.expenseDate ? e.expenseDate.slice(0, 7) : '')).filter(Boolean)
  )].sort().reverse();

  const totalSheetTableWidth = visibleSheetColumns.reduce((sum, colId) => {
    return sum + (sheetColumnWidths[colId] || DEFAULT_SHEET_COLUMN_WIDTHS[colId] || 120);
  }, 0);

  return (
    <div className="space-y-5">
      {/* Top Header Card */}
      <div className="bg-white p-5 sm:p-6 rounded-2xl shadow-sm border border-slate-200">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="p-2 bg-rose-50 text-rose-600 rounded-xl">
                <IndianRupee className="w-5 h-5" />
              </span>
              <div>
                <h2 className="text-xl font-extrabold text-slate-900">Expenses & Expense Sheet</h2>
                <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                  Excel-Style Monthly Expense Grid, Inline Fast Entry & Expense Register
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Tab Selector (Exact same as PaymentsView) */}
            <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl">
              <button
                onClick={() => setActiveTab('sheet')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                  activeTab === 'sheet'
                    ? 'bg-white text-emerald-700 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                Monthly Expense Grid
              </button>
              <button
                onClick={() => setActiveTab('register')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                  activeTab === 'register'
                    ? 'bg-white text-emerald-700 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Receipt className="w-3.5 h-3.5" />
                All Expenses Register ({expenses.length})
              </button>
            </div>

            <button
              onClick={() => setShowManageHeadsModal(true)}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition-all shadow-2xs active:scale-95 shrink-0 cursor-pointer"
              title="Manage Expense Heads (Property Heads vs Common Heads)"
            >
              <Tag className="w-3.5 h-3.5 text-emerald-600" />
              <span>Expense Heads Master</span>
            </button>

            <button
              onClick={handleOpenCreate}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-md shadow-emerald-600/20 active:scale-95 shrink-0 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Full Form</span>
            </button>
          </div>
        </div>

        {/* Top Month Selector & Quick Metrics Bar (Identical to PaymentsView) */}
        <div className="mt-5 pt-4 border-t border-slate-100 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
          {/* Active Month Controller */}
          <div className="flex items-center gap-2 bg-slate-50 p-1.5 rounded-2xl border border-slate-200 shadow-sm">
            <button
              onClick={handlePrevMonth}
              className="p-2 rounded-xl hover:bg-white text-slate-600 hover:text-slate-900 shadow-none hover:shadow-sm transition-all cursor-pointer"
              title="Previous Month"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-2 px-3 py-1">
              <Calendar className="w-4 h-4 text-emerald-600 shrink-0" />
              <div className="text-left">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Active Month</span>
                <span className="text-sm font-extrabold text-slate-900">{formatMonthYear(selectedMonth)}</span>
              </div>
            </div>

            <button
              onClick={handleNextMonth}
              className="p-2 rounded-xl hover:bg-white text-slate-600 hover:text-slate-900 shadow-none hover:shadow-sm transition-all cursor-pointer"
              title="Next Month"
            >
              <ChevronRight className="w-4 h-4" />
            </button>

            <div className="h-6 w-px bg-slate-200 mx-1" />

            {/* Direct Month Picker */}
            <input
              type="month"
              value={selectedMonth}
              onChange={handleSelectCustomMonth}
              className="text-xs font-semibold px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
              title="Jump to specific month and year"
            />

            <button
              onClick={() => setSelectedMonth(getCurrentMonthYear())}
              className="text-xs font-bold px-3 py-1.5 rounded-xl text-emerald-700 hover:bg-emerald-50 transition-colors cursor-pointer"
            >
              Today
            </button>
          </div>

          {/* Quick Metrics Badges for Active Month */}
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 flex items-center gap-2">
              <span className="text-xs text-slate-500 font-medium">Entries:</span>
              <span className="text-xs font-bold text-slate-800">{filteredMonthExpenses.length} records</span>
            </div>
            <div className="px-3.5 py-2 rounded-xl bg-rose-50/70 border border-rose-200/80 flex items-center gap-2">
              <span className="text-xs text-rose-600 font-medium">Month Total:</span>
              <span className="text-xs font-extrabold text-rose-700 font-mono">{formatCurrency(monthTotalSum)}</span>
            </div>
            <button
              onClick={exportMonthExpensesToExcel}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-all shadow-sm active:scale-95 cursor-pointer"
              title="Download Excel Sheet for this Month"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Excel</span>
            </button>
          </div>
        </div>

        {/* Scope Switcher: Property Expenses (General) vs Other Expenses (MOM, Zakat...) vs All Expenses */}
        <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Expense Scope:</span>
            <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-2xl border border-slate-200/80">
              <button
                type="button"
                onClick={() => handleScopeChange('property')}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  expenseScope === 'property'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                }`}
              >
                <Building2 className="w-3.5 h-3.5" />
                <span>Property Expenses (General)</span>
              </button>
              <button
                type="button"
                onClick={() => handleScopeChange('other')}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  expenseScope === 'other'
                    ? 'bg-purple-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>★ Other Expenses (MOM, Zakat, Misc, Margaret...)</span>
              </button>
              <button
                type="button"
                onClick={() => handleScopeChange('all')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  expenseScope === 'all'
                    ? 'bg-slate-800 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                }`}
              >
                <span>All Combined</span>
              </button>
            </div>
          </div>

          <div className="text-xs text-slate-500 font-medium">
            {expenseScope === 'property' && (
              <span className="text-emerald-700 font-semibold">Showing Property maintenance, electricity & repairs.</span>
            )}
            {expenseScope === 'other' && (
              <span className="text-purple-700 font-semibold">Showing Other / Company costs (MOM, Zakat, Margaret, Loans, Misc).</span>
            )}
            {expenseScope === 'all' && (
              <span className="text-slate-600 font-semibold">Showing all property and company expenses combined.</span>
            )}
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* VIEW 1: EXCEL-TEMPLATE-STYLE MONTHLY EXPENSE GRID */}
      {/* ======================================================== */}
      {activeTab === 'sheet' && (
        <div className="space-y-4">
          {/* FAST INLINE ROW ENTRY BAR (EXCEL FAST ENTRY) */}
          <div className="bg-white p-4 rounded-2xl border-2 border-emerald-500/30 shadow-md">
            <div className="flex items-center justify-between pb-2.5 mb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600">
                  <Sparkles className="w-4 h-4" />
                </span>
                <span className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">
                  Fast Excel Entry for {formatMonthYear(selectedMonth)}
                </span>
                <span className="text-[11px] text-slate-400 hidden sm:inline">
                  (Type amount and press Enter to save directly into sheet)
                </span>
              </div>
              {quickSaveSuccess && (
                <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 animate-fadeIn">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Saved to {formatMonthYear(selectedMonth)}!</span>
                </div>
              )}
            </div>

            <form onSubmit={handleFastAddExpense} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-end">
              {/* 1. Property Select */}
              <div className="lg:col-span-3">
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  1. Property / Account
                </label>
                <select
                  value={quickForm.propertyId}
                  onChange={(e) => handleQuickPropertyChange(e.target.value)}
                  className="w-full text-xs font-semibold px-3 py-2 rounded-xl border border-slate-300 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-2xs"
                >
                  <optgroup label="Properties (General Property Expenses)">
                    {properties
                      .filter(p => p.propertyCode !== 'PROP-COMMON' && p.propertyType !== 'General / Common' && !p.name?.toLowerCase().includes('general common'))
                      .map(p => (
                        <option key={p._id} value={p._id}>
                          {p.name} {p.propertyCode ? `(${p.propertyCode})` : ''}
                        </option>
                      ))}
                  </optgroup>
                  <optgroup label="Other / Common Expenses">
                    <option value="__OTHER_EXPENSES__">
                      ★ Other Expenses (MOM, Zakat, Misc, Margaret...)
                    </option>
                  </optgroup>
                </select>
              </div>

              {/* 1b. Sub-Unit / Partition Select */}
              <div className="lg:col-span-2">
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Partition (Optional)
                </label>
                <select
                  value={quickForm.unitId}
                  disabled={!quickForm.propertyId || isGeneralCommonProperty(quickForm.propertyId)}
                  onChange={(e) => setQuickForm({ ...quickForm, unitId: e.target.value })}
                  className="w-full text-xs font-semibold px-3 py-2 rounded-xl border border-slate-300 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-slate-100 disabled:text-slate-400 shadow-2xs"
                >
                  <option value="">Entire Property / Common</option>
                  {units
                    .filter(u => (u.propertyId?._id || u.propertyId) === quickForm.propertyId)
                    .map(u => (
                      <option key={u._id} value={u._id}>{u.subUnitPartition || u.unitName}</option>
                    ))
                  }
                </select>
              </div>

              {/* 2. Expense Category */}
              <div className="lg:col-span-2">
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-[11px] font-bold text-slate-600">
                    2. Expense Head
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowAddCategoryModal(true)}
                    className="text-[10px] font-bold text-emerald-600 hover:text-emerald-700 hover:underline flex items-center gap-0.5"
                    title="Add new custom category"
                  >
                    <Plus className="w-2.5 h-2.5" /> New
                  </button>
                </div>
                <select
                  value={quickForm.category}
                  onChange={(e) => {
                    if (e.target.value === '__add_new__') {
                      setShowAddCategoryModal(true);
                    } else {
                      setQuickForm({ ...quickForm, category: e.target.value });
                    }
                  }}
                  className="w-full text-xs font-semibold px-3 py-2 rounded-xl border border-slate-300 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-2xs"
                >
                  {isGeneralCommonProperty(quickForm.propertyId) ? (
                    commonCategories.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))
                  ) : (
                    propertyCategories.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))
                  )}
                  <option value="__add_new__" className="font-bold text-emerald-600">+ Add New Head...</option>
                </select>
              </div>

              {/* 3. Description / What it was for */}
              <div className="lg:col-span-2">
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  3. Description *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Electric bill, plumbing..."
                  value={quickForm.description}
                  onChange={(e) => setQuickForm({ ...quickForm, description: e.target.value })}
                  className="w-full text-xs px-3 py-2 rounded-xl border border-slate-300 bg-white text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-2xs"
                />
              </div>

              {/* 4. Payee / Paid to */}
              <div className="lg:col-span-1">
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  4. Payee
                </label>
                <input
                  type="text"
                  placeholder="Vendor"
                  value={quickForm.vendorOrPayee}
                  onChange={(e) => setQuickForm({ ...quickForm, vendorOrPayee: e.target.value })}
                  className="w-full text-xs px-3 py-2 rounded-xl border border-slate-300 bg-white text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-2xs"
                />
              </div>

              {/* 5. Amount & Save */}
              <div className="lg:col-span-2 flex items-center gap-2">
                <div className="flex-1 relative">
                  <label className="block text-[11px] font-bold text-rose-700 mb-1">
                    5. Amount (₹) *
                  </label>
                  <div className="relative flex items-center">
                    <span className="absolute left-2.5 text-slate-400 text-xs font-semibold">₹</span>
                    <input
                      ref={quickAmountInputRef}
                      type="number"
                      required
                      min="1"
                      step="any"
                      placeholder="Amount"
                      value={quickForm.amount}
                      onChange={(e) => setQuickForm({ ...quickForm, amount: e.target.value })}
                      className="w-full pl-6 pr-2 py-2 text-xs font-extrabold text-slate-900 bg-emerald-50/30 border border-emerald-400 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono shadow-xs"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={quickSaving}
                  className="mt-5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold transition-all shadow-md shadow-emerald-600/20 active:scale-95 shrink-0 disabled:opacity-60 cursor-pointer"
                  title="Add this expense to selected month"
                >
                  {quickSaving ? '...' : 'Add'}
                </button>
              </div>
            </form>
          </div>

          {/* APEX Interactive Toolbar for Sheet */}
          <ApexToolbar
            searchPlaceholder="Search this month's expenses by description, payee, or property..."
            searchValue={sheetSearch}
            onSearchChange={setSheetSearch}
            columns={EXPENSES_SHEET_COLUMNS_DEF}
            visibleColumns={visibleSheetColumns}
            onVisibleColumnsChange={setVisibleSheetColumns}
            columnWidths={sheetColumnWidths}
            onResetWidths={resetSheetColumnWidths}
            frozenCount={frozenSheetCount}
            onFrozenCountChange={setFrozenSheetCount}
            activeFilters={sheetFilters}
            onFiltersChange={setSheetFilters}
            filterSuggestions={sheetFilterSuggestions}
            rowsPerPage={sheetRowsPerPage}
            onRowsPerPageChange={setSheetRowsPerPage}
            isHeaderSticky={isSheetHeaderSticky}
            onToggleHeaderSticky={() => setIsSheetHeaderSticky(prev => !prev)}
            activeViewId={sheetActiveViewId}
            onSaveView={(view) => {
              setSheetActiveViewId(view.id);
            }}
            onLoadView={(view) => {
              setSheetActiveViewId(view.id);
              if (view.visibleColumns) setVisibleSheetColumns(view.visibleColumns);
              if (view.filters) setSheetFilters(view.filters);
              if (view.rowsPerPage) setSheetRowsPerPage(view.rowsPerPage);
              if (view.isHeaderSticky !== undefined) setIsSheetHeaderSticky(view.isHeaderSticky);
            }}
            onExportExcel={exportMonthExpensesToExcel}
            storageKeyPrefix="expenses_sheet_view"
          />

          {/* THE EXCEL SPREADSHEET TABLE */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            {loading ? (
              <div className="py-20 text-center text-slate-400 text-sm">Loading expense sheet for {formatMonthYear(selectedMonth)}...</div>
            ) : filteredMonthExpenses.length === 0 ? (
              <div className="py-20 text-center text-slate-400 text-sm">
                No expenses found for {formatMonthYear(selectedMonth)}. Use the Fast Excel Entry bar above to add expenses!
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table
                  className="w-full text-left text-sm border-collapse table-fixed"
                  style={{ minWidth: `${totalSheetTableWidth}px` }}
                >
                  <colgroup>
                    {visibleSheetColumns.map(colId => (
                      <col
                        key={colId}
                        style={{ width: `${sheetColumnWidths[colId] || DEFAULT_SHEET_COLUMN_WIDTHS[colId] || 120}px` }}
                      />
                    ))}
                  </colgroup>
                  <thead className={`border-b border-slate-200 text-[11px] text-slate-600 uppercase tracking-wider font-extrabold select-none ${
                    isSheetHeaderSticky ? 'sticky top-0 z-20 shadow-sm' : ''
                  }`}>
                    <tr>
                      {visibleSheetColumns.map((colId, colIdx) => {
                        const dragProps = getHeaderDragProps(colId, visibleSheetColumns, setVisibleSheetColumns, 'expenses_sheet_v1');
                        const width = sheetColumnWidths[colId] || DEFAULT_SHEET_COLUMN_WIDTHS[colId] || 120;
                        const frozenStyle = getFrozenColumnStyle(colIdx, frozenSheetCount, visibleSheetColumns, sheetColumnWidths, true);
                        let label = colId;
                        let align = 'text-left';

                        if (colId === 'index') { label = '#'; align = 'text-center'; }
                        else if (colId === 'property') { label = 'Property'; }
                        else if (colId === 'category') { label = 'Expense Type'; }
                        else if (colId === 'description') { label = 'What it was for'; }
                        else if (colId === 'payee') { label = 'Paid To / Vendor'; }
                        else if (colId === 'paymentMode') { label = 'Payment Mode'; }
                        else if (colId === 'amount') { label = 'Amount (₹)'; align = 'text-right'; }
                        else if (colId === 'createdAt') { label = 'Created Date'; }
                        else if (colId === 'updatedAt') { label = 'Modified Date'; }
                        else if (colId === 'actions') { label = 'Actions'; align = 'text-center'; }

                        const isSortable = colId !== 'actions';
                        const isSorted = sheetSortConfig.key === colId;
                        const sortDirection = isSorted ? sheetSortConfig.direction : null;

                        return (
                          <th
                            key={colId}
                            {...dragProps}
                            onClick={() => isSortable && handleSheetHeaderSort(colId)}
                            style={{ minWidth: `${Math.max(width, 95)}px`, width: `${Math.max(width, 95)}px`, ...frozenStyle }}
                            className={`py-3 pl-3 pr-7 border-r border-slate-200 relative group select-none whitespace-nowrap overflow-hidden ${align} ${
                              isSortable ? 'cursor-pointer hover:bg-slate-200/80 transition-colors' : ''
                            } ${frozenStyle.backgroundColor ? '' : 'bg-slate-100/95'}`}
                            title={isSortable ? `${label} (Click: 1st Desc, 2nd Asc, 3rd Off)` : label}
                          >
                            <div className={`flex items-center gap-1.5 w-full overflow-hidden ${align === 'text-right' ? 'justify-end' : align === 'text-center' ? 'justify-center' : 'justify-start'}`}>
                              <span className="truncate font-extrabold text-[11px] text-slate-700 tracking-wider">
                                {label}
                              </span>
                              {isSortable && (
                                <span className="shrink-0 flex items-center text-slate-400">
                                  {sortDirection === 'asc' ? (
                                    <ArrowUp className="w-3.5 h-3.5 text-emerald-600 font-bold" />
                                  ) : sortDirection === 'desc' ? (
                                    <ArrowDown className="w-3.5 h-3.5 text-emerald-600 font-bold" />
                                  ) : (
                                    <ArrowUpDown className="w-3 h-3 opacity-0 group-hover:opacity-60 text-slate-400 transition-opacity" />
                                  )}
                                </span>
                              )}
                            </div>
                            <ResizeHandle colId={colId} onResizeStart={handleSheetResizeStart} />
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {paginatedMonthExpenses.map((e, idx) => {
                      const isInlineEditing = editingRowAmount[e._id] !== undefined;
                      const rowNum = (isAllSheetRows ? 0 : (sheetCurrentPage - 1) * Number(sheetRowsPerPage)) + idx + 1;

                      return (
                        <tr key={e._id} className="hover:bg-slate-50/80 transition-colors group">
                          {visibleSheetColumns.map((colId, colIdx) => {
                            const frozenStyle = getFrozenColumnStyle(colIdx, frozenSheetCount, visibleSheetColumns, sheetColumnWidths, false);

                            if (colId === 'index') {
                              return (
                                <td key={colId} style={frozenStyle} className="px-3 py-3 border-r border-slate-100 text-center text-xs text-slate-400 font-mono">
                                  {rowNum}
                                </td>
                              );
                            }
                            if (colId === 'property') {
                              return (
                                <td key={colId} style={frozenStyle} className="px-3 py-3 border-r border-slate-100">
                                  <div className="font-bold text-slate-800 text-xs">
                                    {e.propertyId?.name || <span className="text-slate-400 italic font-normal">General Common</span>}
                                  </div>
                                  {e.propertyId && (
                                    <p className="text-[10px] text-slate-500 font-medium">
                                      {e.unitId?.subUnitPartition || e.unitId?.unitName || 'Entire Property'}
                                    </p>
                                  )}
                                </td>
                              );
                            }
                            if (colId === 'category') {
                              return (
                                <td key={colId} style={frozenStyle} className="px-3 py-3 border-r border-slate-100">
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold border ${CATEGORY_COLORS[e.category] || 'bg-slate-100 text-slate-700 border-slate-200'}`}>
                                    {e.category}
                                  </span>
                                </td>
                              );
                            }
                            if (colId === 'description') {
                              return (
                                <td key={colId} style={frozenStyle} className="px-3 py-3 border-r border-slate-100">
                                  <span className="text-xs font-semibold text-slate-800 block truncate" title={e.description}>
                                    {e.description}
                                  </span>
                                </td>
                              );
                            }
                            if (colId === 'payee') {
                              return (
                                <td key={colId} style={frozenStyle} className="px-3 py-3 border-r border-slate-100 text-xs text-slate-600">
                                  {e.vendorOrPayee || <span className="text-slate-400">—</span>}
                                </td>
                              );
                            }
                            if (colId === 'paymentMode') {
                              return (
                                <td key={colId} style={frozenStyle} className="px-3 py-3 border-r border-slate-100">
                                  <span className="inline-block px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-700">
                                    {e.paymentMode || 'Cash'}
                                  </span>
                                </td>
                              );
                            }
                            if (colId === 'amount') {
                              return (
                                <td key={colId} style={frozenStyle} className="px-3 py-3 border-r border-slate-100 text-right">
                                  {isInlineEditing ? (
                                    <div className="flex items-center gap-1 justify-end">
                                      <div className="relative">
                                        <span className="absolute left-2 text-slate-400 text-xs font-semibold">₹</span>
                                        <input
                                          type="number"
                                          autoFocus
                                          value={editingRowAmount[e._id]}
                                          onChange={(ev) => setEditingRowAmount({ ...editingRowAmount, [e._id]: ev.target.value })}
                                          onKeyDown={(ev) => {
                                            if (ev.key === 'Enter') handleSaveInlineRowAmount(e._id);
                                            if (ev.key === 'Escape') {
                                              setEditingRowAmount(prev => {
                                                const cp = { ...prev };
                                                delete cp[e._id];
                                                return cp;
                                              });
                                            }
                                          }}
                                          className="w-24 pl-5 pr-1 py-1 text-xs font-bold text-slate-900 border border-emerald-500 rounded bg-white font-mono"
                                        />
                                      </div>
                                      <button
                                        onClick={() => handleSaveInlineRowAmount(e._id)}
                                        disabled={savingRowId === e._id}
                                        className="p-1 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded cursor-pointer"
                                        title="Save Amount (Enter)"
                                      >
                                        <Check className="w-3.5 h-3.5" />
                                      </button>
                                      <button
                                        onClick={() => {
                                          setEditingRowAmount(prev => {
                                            const cp = { ...prev };
                                            delete cp[e._id];
                                            return cp;
                                          });
                                        }}
                                        className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded cursor-pointer"
                                        title="Cancel (Esc)"
                                      >
                                        <X className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  ) : (
                                    <div
                                      onClick={() => setEditingRowAmount({ ...editingRowAmount, [e._id]: String(e.amount) })}
                                      className="font-extrabold text-xs text-rose-600 font-mono cursor-pointer hover:bg-rose-50/60 px-2 py-1 rounded inline-block transition-colors"
                                      title="Click to edit amount directly"
                                    >
                                      {formatCurrency(e.amount)}
                                    </div>
                                  )}
                                </td>
                              );
                            }
                            if (colId === 'createdAt' || colId === 'updatedAt') {
                              return (
                                <td key={colId} style={frozenStyle} className="px-3 py-3 border-r border-slate-100 text-xs text-slate-600 whitespace-nowrap">
                                  {e[colId] ? formatDate(e[colId]) : '—'}
                                </td>
                              );
                            }
                            if (colId === 'actions') {
                              return (
                                <td key={colId} style={frozenStyle} className="px-3 py-3 text-center border-r border-slate-100">
                                  <div className="flex items-center justify-center gap-1.5">
                                    <button
                                      onClick={() => {
                                        setEditingExpenseId(e._id);
                                        const dStr = e.expenseDate ? new Date(e.expenseDate).toISOString().split('T')[0] : '';
                                        const mStr = e.expenseMonth || (dStr ? dStr.slice(0, 7) : selectedMonth);
                                        setEntryByDate(Boolean(dStr && !dStr.endsWith('-01')));
                                        setForm({
                                          expenseMonth: mStr,
                                          expenseDate: dStr,
                                          propertyId: e.propertyId?._id || e.propertyId || '',
                                          unitId: e.unitId?._id || e.unitId || '',
                                          category: e.category || 'Maintenance',
                                          amount: String(e.amount),
                                          description: e.description || '',
                                          vendorOrPayee: e.vendorOrPayee || '',
                                          paymentMode: e.paymentMode || 'Cash',
                                        });
                                        setShowModal(true);
                                      }}
                                      title="Edit details"
                                      className="p-1 text-slate-400 hover:text-emerald-700 hover:bg-slate-100 rounded transition-colors cursor-pointer"
                                    >
                                      <Edit2 className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      onClick={() => handleReverse(e._id)}
                                      title="Cancel/Reverse Expense"
                                      className="p-1 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded transition-colors cursor-pointer"
                                    >
                                      <RotateCcw className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      onClick={() => handleDeleteExpense(e._id)}
                                      title="Permanently Delete Expense"
                                      className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors cursor-pointer"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </td>
                              );
                            }
                            return null;
                          })}
                        </tr>
                      );
                    })}
                  </tbody>

                  {/* Excel Sheet Total Row */}
                  <tfoot className="bg-slate-100 border-t-2 border-slate-300 font-extrabold text-xs">
                    <tr>
                      {visibleSheetColumns.map((colId) => (
                        <td
                          key={colId}
                          className={`px-4 py-3.5 ${colId === 'amount' ? 'text-right font-mono text-sm text-rose-700' : colId === 'actions' ? 'text-center text-slate-400 font-normal text-[11px]' : 'text-slate-700'} font-extrabold`}
                        >
                          {colId === 'amount'
                            ? formatCurrency(monthTotalSum)
                            : colId === 'actions'
                              ? 'Excel Format'
                              : colId === visibleSheetColumns.find((column) => !['amount', 'actions'].includes(column))
                                ? `Total Expenses for ${formatMonthYear(selectedMonth)} (${filteredMonthExpenses.length} entries)`
                                : ''}
                        </td>
                      ))}
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            {/* Sheet Pagination Footer */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-5 py-3 border-t border-slate-200 bg-slate-50 text-xs font-bold text-slate-600 shrink-0">
              <div className="flex items-center gap-2">
                <span>
                  Showing {sortedMonthExpenses.length === 0 ? 0 : isAllSheetRows ? 1 : ((sheetCurrentPage - 1) * Number(sheetRowsPerPage)) + 1}
                  - {isAllSheetRows ? sortedMonthExpenses.length : Math.min(sheetCurrentPage * Number(sheetRowsPerPage), sortedMonthExpenses.length)} of {sortedMonthExpenses.length} entries
                </span>
                {sheetSortConfig.key && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[11px] border border-emerald-200">
                    Sorted: {sheetSortConfig.key} ({sheetSortConfig.direction?.toUpperCase()})
                  </span>
                )}
              </div>

              {!isAllSheetRows && totalSheetPages > 1 && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={sheetCurrentPage === 1}
                    onClick={() => setSheetCurrentPage(1)}
                    className="px-2.5 py-1 rounded border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    title="First Page"
                  >
                    «
                  </button>
                  <button
                    type="button"
                    disabled={sheetCurrentPage === 1}
                    onClick={() => setSheetCurrentPage(p => Math.max(1, p - 1))}
                    className="px-2.5 py-1 rounded border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Prev
                  </button>
                  <span className="px-3 py-1 text-slate-700">
                    Page {sheetCurrentPage} of {totalSheetPages}
                  </span>
                  <button
                    type="button"
                    disabled={sheetCurrentPage >= totalSheetPages}
                    onClick={() => setSheetCurrentPage(p => Math.min(totalSheetPages, p + 1))}
                    className="px-2.5 py-1 rounded border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Next
                  </button>
                  <button
                    type="button"
                    disabled={sheetCurrentPage >= totalSheetPages}
                    onClick={() => setSheetCurrentPage(totalSheetPages)}
                    className="px-2.5 py-1 rounded border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    title="Last Page"
                  >
                    »
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* VIEW 2: ALL EXPENSES REGISTER (HISTORICAL LOG) */}
      {/* ======================================================== */}
      {activeTab === 'register' && (
        <div className="space-y-4">
          {/* APEX Interactive Toolbar for Register */}
          <ApexToolbar
            searchPlaceholder="Search description, payee, or property..."
            searchValue={registerSearch}
            onSearchChange={setRegisterSearch}
            columns={EXPENSES_REGISTER_COLUMNS_DEF}
            visibleColumns={visibleRegisterColumns}
            onVisibleColumnsChange={setVisibleRegisterColumns}
            columnWidths={registerColumnWidths}
            onResetWidths={resetRegisterColumnWidths}
            frozenCount={frozenRegisterCount}
            onFrozenCountChange={setFrozenRegisterCount}
            activeFilters={registerFilters}
            onFiltersChange={setRegisterFilters}
            filterSuggestions={registerFilterSuggestions}
            rowsPerPage={registerRowsPerPage}
            onRowsPerPageChange={setRegisterRowsPerPage}
            isHeaderSticky={isRegisterHeaderSticky}
            onToggleHeaderSticky={() => setIsRegisterHeaderSticky(prev => !prev)}
            activeViewId={registerActiveViewId}
            onSaveView={(view) => {
              setRegisterActiveViewId(view.id);
            }}
            onLoadView={(view) => {
              setRegisterActiveViewId(view.id);
              if (view.visibleColumns) setVisibleRegisterColumns(view.visibleColumns);
              if (view.filters) setRegisterFilters(view.filters);
              if (view.rowsPerPage) setRegisterRowsPerPage(view.rowsPerPage);
              if (view.isHeaderSticky !== undefined) setIsRegisterHeaderSticky(view.isHeaderSticky);
            }}
            onExportExcel={exportRegisterToExcel}
            storageKeyPrefix="expenses_register_view"
          />

          {/* Historical Register Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            {loading ? (
              <div className="py-16 text-center text-slate-400 text-sm">Loading expenses...</div>
            ) : sortedRegister.length === 0 ? (
              <div className="py-16 text-center text-slate-400 text-xs">
                <p className="font-bold text-slate-700 text-sm mb-1">No expenses found matching the selected filters.</p>
                <button
                  type="button"
                  onClick={() => {
                    setRegisterSearch('');
                    setRegisterPropFilter('');
                    setRegisterCatFilter('');
                    setRegisterMonthFilter('');
                    setRegisterFilters([]);
                  }}
                  className="text-xs font-bold text-emerald-600 hover:underline mt-1 cursor-pointer"
                >
                  Reset Filters to view all {expenses.length} expenses
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table
                  className="w-full text-left text-sm border-collapse table-fixed"
                  style={{ minWidth: `${visibleRegisterColumns.reduce((sum, colId) => sum + (registerColumnWidths[colId] || DEFAULT_REGISTER_COLUMN_WIDTHS[colId] || 100), 0)}px` }}
                >
                  <colgroup>
                    {visibleRegisterColumns.map(colId => (
                      <col
                        key={colId}
                        style={{ width: `${registerColumnWidths[colId] || DEFAULT_REGISTER_COLUMN_WIDTHS[colId] || 100}px` }}
                      />
                    ))}
                  </colgroup>
                  <thead className={`border-b border-slate-200 ${
                    isRegisterHeaderSticky ? 'sticky top-0 z-20 shadow-sm' : ''
                  }`}>
                    <tr className="text-[11px] text-slate-500 uppercase tracking-wide font-extrabold select-none">
                      {visibleRegisterColumns.map((colId, colIdx) => {
                        const dragProps = getHeaderDragProps(colId, visibleRegisterColumns, setVisibleRegisterColumns, 'expenses_register_v1');
                        const width = registerColumnWidths[colId] || DEFAULT_REGISTER_COLUMN_WIDTHS[colId] || 100;
                        const frozenStyle = getFrozenColumnStyle(colIdx, frozenRegisterCount, visibleRegisterColumns, registerColumnWidths, true);
                        let label = colId;
                        let align = 'text-left';
                        if (colId === 'date') label = 'Month / Date';
                        else if (colId === 'property') label = 'Property';
                        else if (colId === 'category') label = 'Expense Type';
                        else if (colId === 'description') label = 'What it was for';
                        else if (colId === 'payee') label = 'Paid To / Method';
                        else if (colId === 'amount') { label = 'Amount'; align = 'text-right'; }
                        else if (colId === 'createdAt') label = 'Created Date';
                        else if (colId === 'updatedAt') label = 'Modified Date';
                        else if (colId === 'actions') { label = 'Action'; align = 'text-center'; }

                        const isSortable = colId !== 'actions';
                        const isSorted = registerSortConfig.key === colId;
                        const sortDirection = isSorted ? registerSortConfig.direction : null;

                        return (
                          <th
                            key={colId}
                            {...dragProps}
                            onClick={() => isSortable && handleRegisterHeaderSort(colId)}
                            style={{ minWidth: `${Math.max(width, 100)}px`, width: `${Math.max(width, 100)}px`, ...frozenStyle }}
                            className={`py-3 pl-3 pr-7 border-r border-slate-200 relative group select-none whitespace-nowrap overflow-hidden ${align} ${
                              isSortable ? 'cursor-pointer hover:bg-slate-200/80 transition-colors' : ''
                            } ${frozenStyle.backgroundColor ? '' : 'bg-slate-100/95'}`}
                            title={isSortable ? `${label} (Click: 1st Desc, 2nd Asc, 3rd Off)` : label}
                          >
                            <div className={`flex items-center gap-1.5 w-full overflow-hidden ${align === 'text-right' ? 'justify-end' : align === 'text-center' ? 'justify-center' : 'justify-start'}`}>
                              <span className="truncate font-extrabold text-[11px] text-slate-700 tracking-wider">
                                {label}
                              </span>
                              {isSortable && (
                                <span className="shrink-0 flex items-center text-slate-400">
                                  {sortDirection === 'asc' ? (
                                    <ArrowUp className="w-3.5 h-3.5 text-emerald-600 font-bold" />
                                  ) : sortDirection === 'desc' ? (
                                    <ArrowDown className="w-3.5 h-3.5 text-emerald-600 font-bold" />
                                  ) : (
                                    <ArrowUpDown className="w-3 h-3 opacity-0 group-hover:opacity-60 text-slate-400 transition-opacity" />
                                  )}
                                </span>
                              )}
                            </div>
                            <ResizeHandle colId={colId} onResizeStart={handleRegisterResizeStart} />
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {paginatedRegister.map((e) => (
                      <tr key={e._id} className={`hover:bg-slate-50/60 transition-colors group ${e.isReversed ? 'opacity-50' : ''}`}>
                        {visibleRegisterColumns.map((colId, colIdx) => {
                          const frozenStyle = getFrozenColumnStyle(colIdx, frozenRegisterCount, visibleRegisterColumns, registerColumnWidths, false);

                          if (colId === 'date') {
                            return (
                              <td key={colId} style={frozenStyle} className="px-5 py-3.5 text-xs text-slate-500 whitespace-nowrap border-r border-slate-100">
                                <span className="font-semibold text-slate-700 block">
                                  {e.expenseMonth ? formatMonthYear(e.expenseMonth) : formatDate(e.expenseDate)}
                                </span>
                                {e.expenseDate && e.expenseMonth && (
                                  <span className="text-[10px] text-slate-400 block">
                                    {formatDate(e.expenseDate)}
                                  </span>
                                )}
                              </td>
                            );
                          }
                          if (colId === 'property') {
                            return (
                              <td key={colId} style={frozenStyle} className="px-5 py-3.5 text-xs font-semibold text-slate-800 border-r border-slate-100">
                                <div>{e.propertyId?.name || <span className="text-slate-400 italic font-normal">General Common</span>}</div>
                                {e.propertyId && (
                                  <span className="text-[10px] text-slate-500 font-medium block">
                                    {e.unitId?.subUnitPartition || e.unitId?.unitName || 'Entire Property'}
                                  </span>
                                )}
                              </td>
                            );
                          }
                          if (colId === 'category') {
                            return (
                              <td key={colId} style={frozenStyle} className="px-5 py-3.5 border-r border-slate-100">
                                <span className={`px-2 py-0.5 rounded-md text-[11px] font-semibold border ${CATEGORY_COLORS[e.category] || 'bg-slate-100 text-slate-600'}`}>
                                  {e.category}
                                </span>
                              </td>
                            );
                          }
                          if (colId === 'description') {
                            return <td key={colId} style={frozenStyle} className="px-5 py-3.5 text-xs text-slate-700 max-w-xs border-r border-slate-100">{e.description}</td>;
                          }
                          if (colId === 'payee') {
                            return (
                              <td key={colId} style={frozenStyle} className="px-5 py-3.5 text-xs text-slate-500 border-r border-slate-100">
                                {e.vendorOrPayee || '—'}
                                <span className="ml-1 text-slate-300">·</span>
                                <span className="ml-1 text-slate-400">{e.paymentMode}</span>
                              </td>
                            );
                          }
                          if (colId === 'amount') {
                            return (
                              <td key={colId} style={frozenStyle} className="px-5 py-3.5 text-right font-bold text-rose-600 text-sm border-r border-slate-100">
                                {formatCurrency(e.amount)}
                              </td>
                            );
                          }
                          if (colId === 'createdAt' || colId === 'updatedAt') {
                            return (
                              <td key={colId} style={frozenStyle} className="px-5 py-3.5 text-xs text-slate-600 whitespace-nowrap border-r border-slate-100">
                                {e[colId] ? formatDate(e[colId]) : '—'}
                              </td>
                            );
                          }
                          if (colId === 'actions') {
                            return (
                              <td key={colId} style={frozenStyle} className="px-5 py-3.5 text-center border-r border-slate-100">
                                <div className="flex items-center justify-center gap-1.5 whitespace-nowrap">
                                  {!e.isReversed && (
                                    <>
                                      <button
                                        onClick={() => {
                                          setEditingExpenseId(e._id);
                                          const dStr = e.expenseDate ? new Date(e.expenseDate).toISOString().split('T')[0] : '';
                                          const mStr = e.expenseMonth || (dStr ? dStr.slice(0, 7) : getCurrentMonthYear());
                                          setEntryByDate(Boolean(dStr && !dStr.endsWith('-01')));
                                          setForm({
                                            expenseMonth: mStr,
                                            expenseDate: dStr,
                                            propertyId: e.propertyId?._id || e.propertyId || '',
                                            unitId: e.unitId?._id || e.unitId || '',
                                            category: e.category || 'Maintenance',
                                            amount: String(e.amount),
                                            description: e.description || '',
                                            vendorOrPayee: e.vendorOrPayee || '',
                                            paymentMode: e.paymentMode || 'Cash',
                                          });
                                          setShowModal(true);
                                        }}
                                        title="Edit Expense"
                                        className="p-1.5 text-slate-400 hover:text-emerald-700 hover:bg-slate-100 rounded-lg transition-colors shrink-0 cursor-pointer"
                                      >
                                        <Edit2 className="w-3.5 h-3.5" />
                                      </button>
                                      <button
                                        onClick={() => handleReverse(e._id)}
                                        title="Cancel/Reverse Expense"
                                        className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors shrink-0 cursor-pointer"
                                      >
                                        <RotateCcw className="w-3.5 h-3.5" />
                                      </button>
                                    </>
                                  )}
                                  <button
                                    onClick={() => handleDeleteExpense(e._id)}
                                    title="Permanently Delete Expense"
                                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </td>
                            );
                          }
                          return null;
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Register Pagination Footer */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-5 py-3 border-t border-slate-200 bg-slate-50 text-xs font-bold text-slate-600 shrink-0">
              <div className="flex items-center gap-2">
                <span>
                  Showing {sortedRegister.length === 0 ? 0 : isAllRegisterRows ? 1 : ((registerCurrentPage - 1) * Number(registerRowsPerPage)) + 1}
                  - {isAllRegisterRows ? sortedRegister.length : Math.min(registerCurrentPage * Number(registerRowsPerPage), sortedRegister.length)} of {sortedRegister.length} expenses
                </span>
                {registerSortConfig.key && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[11px] border border-emerald-200">
                    Sorted: {registerSortConfig.key} ({registerSortConfig.direction?.toUpperCase()})
                  </span>
                )}
              </div>

              {!isAllRegisterRows && totalRegisterPages > 1 && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={registerCurrentPage === 1}
                    onClick={() => setRegisterCurrentPage(1)}
                    className="px-2.5 py-1 rounded border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    title="First Page"
                  >
                    «
                  </button>
                  <button
                    type="button"
                    disabled={registerCurrentPage === 1}
                    onClick={() => setRegisterCurrentPage(p => Math.max(1, p - 1))}
                    className="px-2.5 py-1 rounded border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Prev
                  </button>
                  <span className="px-3 py-1 text-slate-700">
                    Page {registerCurrentPage} of {totalRegisterPages}
                  </span>
                  <button
                    type="button"
                    disabled={registerCurrentPage >= totalRegisterPages}
                    onClick={() => setRegisterCurrentPage(p => Math.min(totalRegisterPages, p + 1))}
                    className="px-2.5 py-1 rounded border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Next
                  </button>
                  <button
                    type="button"
                    disabled={registerCurrentPage >= totalRegisterPages}
                    onClick={() => setRegisterCurrentPage(totalRegisterPages)}
                    className="px-2.5 py-1 rounded border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    title="Last Page"
                  >
                    »
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* FULL FORM / EDIT MODAL */}
      {/* ======================================================== */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-scaleUp">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-lg font-extrabold text-slate-900">
                  {editingExpenseId ? 'Edit Expense' : 'Add New Expense'}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">Record a cost or payment made for a property</p>
              </div>
              <button onClick={() => { setShowModal(false); resetForm(); }} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveModal} className="space-y-4">
              {/* Row 1: Property + Sub-Unit Partition */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <SearchableSelect
                    label="Property / Account"
                    placeholder="Select Property or Other Expenses"
                    searchPlaceholder="Search properties or other expenses..."
                    options={[
                      ...properties
                        .filter(p => p.propertyCode !== 'PROP-COMMON' && p.propertyType !== 'General / Common' && !p.name?.toLowerCase().includes('general common'))
                        .map((property) => ({
                          value: property._id,
                          label: `${property.name} ${property.propertyCode ? `(${property.propertyCode})` : ''}`
                        })),
                      { value: '__OTHER_EXPENSES__', label: '★ Other Expenses (MOM, Zakat, Misc, Margaret...)' }
                    ]}
                    value={form.propertyId}
                    onChange={(propertyId) => handleModalPropertyChange(propertyId)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Sub-Unit / Partition (Optional)
                  </label>
                  <select
                    value={form.unitId}
                    disabled={!form.propertyId || isGeneralCommonProperty(form.propertyId)}
                    onChange={(e) => setForm({ ...form, unitId: e.target.value })}
                    className="w-full px-3 py-2.5 text-xs font-semibold rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white disabled:bg-slate-100 disabled:text-slate-400"
                  >
                    <option value="">Entire Property / Common Partition</option>
                    {units
                      .filter(u => (u.propertyId?._id || u.propertyId) === form.propertyId)
                      .map(u => (
                        <option key={u._id} value={u._id}>{u.subUnitPartition || u.unitName}</option>
                      ))
                    }
                  </select>
                </div>
              </div>

              {/* Row 1b: Expense Head / Category */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-slate-600">Expense Type / Head *</label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowManageHeadsModal(true)}
                      className="text-[11px] font-bold text-slate-500 hover:text-slate-700 underline flex items-center gap-0.5 cursor-pointer"
                    >
                      <Tag className="w-3 h-3 text-emerald-600" /> Manage Heads
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowAddCategoryModal(true)}
                      className="text-[11px] font-bold text-emerald-600 hover:text-emerald-700 hover:underline flex items-center gap-0.5 cursor-pointer"
                    >
                      <Plus className="w-3 h-3" /> + Add New Head
                    </button>
                  </div>
                </div>
                <select
                  value={form.category}
                  onChange={(e) => {
                    if (e.target.value === '__add_new__') {
                      setShowAddCategoryModal(true);
                    } else {
                      setForm({ ...form, category: e.target.value });
                    }
                  }}
                  className="w-full px-3 py-2.5 text-xs font-semibold rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white"
                >
                  {isGeneralCommonProperty(form.propertyId) ? (
                    commonCategories.map((category) => (
                      <option key={category} value={category}>{category}</option>
                    ))
                  ) : (
                    propertyCategories.map((category) => (
                      <option key={category} value={category}>{category}</option>
                    ))
                  )}
                  <option value="__add_new__">+ Add New Head...</option>
                </select>
              </div>

              {/* Row 2: Amount + Month / Date Assignment */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Amount (₹) *</label>
                  <input
                    type="number" required min="0" step="0.01" placeholder="e.g. 4500"
                    value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: e.target.value })}
                    className="w-full px-3 py-2.5 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-400 font-bold text-rose-600"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-slate-600">
                      {entryByDate ? 'Specific Date' : 'Assign to Month'} *
                    </label>
                    <button
                      type="button"
                      onClick={() => setEntryByDate(!entryByDate)}
                      className="text-[11px] font-semibold text-emerald-600 hover:text-emerald-700 underline cursor-pointer"
                    >
                      {entryByDate ? 'Assign by Month' : 'Specific Date?'}
                    </button>
                  </div>
                  {!entryByDate ? (
                    <input
                      type="month" required
                      value={form.expenseMonth}
                      onChange={(e) => setForm({ ...form, expenseMonth: e.target.value })}
                      className="w-full px-3 py-2.5 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-emerald-50/20 font-semibold text-slate-800"
                    />
                  ) : (
                    <input
                      type="date" required
                      value={form.expenseDate}
                      onChange={(e) => setForm({ ...form, expenseDate: e.target.value, expenseMonth: e.target.value.slice(0, 7) })}
                      className="w-full px-3 py-2.5 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                    />
                  )}
                </div>
              </div>

              {/* Row 3: Description */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">What was it for? *</label>
                <input
                  type="text" required placeholder="e.g. Water tank cleaning, electrician visit, plumbing"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full px-3 py-2.5 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                />
              </div>

              {/* Row 4: Payee + Mode */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Paid To <span className="text-slate-400 font-normal">(optional)</span></label>
                  <input
                    type="text" placeholder="e.g. Ramesh Painter"
                    value={form.vendorOrPayee}
                    onChange={(e) => setForm({ ...form, vendorOrPayee: e.target.value })}
                    className="w-full px-3 py-2.5 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Payment Method</label>
                  <select
                    value={form.paymentMode}
                    onChange={(e) => setForm({ ...form, paymentMode: e.target.value })}
                    className="w-full px-3 py-2.5 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white"
                  >
                    <option value="Cash">Cash</option>
                    <option value="Bank Transfer">Bank Transfer</option>
                    <option value="Cheque">Cheque</option>
                    <option value="UPI / GPay">UPI / GPay</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => { setShowModal(false); resetForm(); }}
                  className="px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2.5 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 rounded-xl shadow-md shadow-emerald-600/20 active:scale-95 cursor-pointer"
                >
                  {submitting ? 'Saving...' : editingExpenseId ? 'Update Expense' : 'Save Expense'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Manage Expense Heads Master Modal */}
      {showManageHeadsModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-scaleUp">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full p-6 max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
                  <Tag className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">Expense Heads Master</h3>
                  <p className="text-xs text-slate-500">Configure separate heads for Property vs Common expenses</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => { setShowManageHeadsModal(false); setEditingHeadId(null); setHeadError(''); }}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Error banner if any */}
            {headError && (
              <div className="mb-3 px-3.5 py-2 bg-rose-50 border border-rose-200 rounded-xl text-xs font-bold text-rose-700 flex items-center justify-between">
                <span>{headError}</span>
                <button onClick={() => setHeadError('')} className="text-rose-500 hover:text-rose-800">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Tabs: Property Heads vs Common Heads */}
            <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl mb-4">
              <button
                type="button"
                onClick={() => { setManageHeadsTab('Property'); setEditingHeadId(null); }}
                className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
                  manageHeadsTab === 'Property'
                    ? 'bg-white text-emerald-700 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Property Heads ({propertyCategories.length})
              </button>
              <button
                type="button"
                onClick={() => { setManageHeadsTab('Common'); setEditingHeadId(null); }}
                className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
                  manageHeadsTab === 'Common'
                    ? 'bg-white text-emerald-700 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Common Heads ({commonCategories.length})
              </button>
            </div>

            {/* Add New Head Input */}
            <form onSubmit={handleAddNewHead} className="flex gap-2 mb-4">
              <input
                type="text"
                placeholder={`Enter new ${manageHeadsTab} Head name...`}
                value={newHeadName}
                onChange={(e) => setNewHeadName(e.target.value)}
                className="flex-1 px-3.5 py-2 text-xs font-semibold rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <button
                type="submit"
                disabled={headSaving || !newHeadName.trim()}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-sm disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Head</span>
              </button>
            </form>

            {/* Heads List */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 divide-y divide-slate-100">
              {(manageHeadsTab === 'Property' ? propertyCategories : commonCategories).map(catName => {
                const dbCat = categories.find(c => (typeof c === 'object' ? c.name === catName : c === catName));
                const isEditing = editingHeadId === (dbCat?._id || catName);
                const isDefault = dbCat ? dbCat.isDefault : (DEFAULT_PROPERTY_HEADS.includes(catName) || DEFAULT_COMMON_HEADS.includes(catName));

                return (
                  <div key={catName} className="pt-2 flex items-center justify-between gap-3 text-xs">
                    {isEditing ? (
                      <div className="flex-1 flex items-center gap-2">
                        <input
                          type="text"
                          value={editingHeadName}
                          onChange={(e) => setEditingHeadName(e.target.value)}
                          className="flex-1 px-2.5 py-1 text-xs font-bold text-slate-800 border border-emerald-500 rounded-lg focus:outline-none"
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => handleUpdateHead(dbCat._id)}
                          disabled={headSaving || !editingHeadName.trim()}
                          className="p-1 text-emerald-600 hover:bg-emerald-50 rounded cursor-pointer"
                          title="Save"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => { setEditingHeadId(null); setEditingHeadName(''); }}
                          className="p-1 text-slate-400 hover:bg-slate-100 rounded cursor-pointer"
                          title="Cancel"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-2">
                          <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold border ${CATEGORY_COLORS[catName] || 'bg-slate-100 text-slate-700 border-slate-200'}`}>
                            {catName}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            {isDefault ? '(Standard)' : '(Custom)'}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          {dbCat && (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingHeadId(dbCat._id);
                                setEditingHeadName(catName);
                              }}
                              className="p-1.5 text-slate-400 hover:text-emerald-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                              title="Edit Head Name"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {dbCat && !isDefault && (
                            <button
                              type="button"
                              onClick={() => handleDeleteHead(dbCat._id)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                              title="Delete Head"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="pt-4 mt-3 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={() => { setShowManageHeadsModal(false); setEditingHeadId(null); setHeadError(''); }}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mini-Modal to Add New Custom Expense Head / Category */}
      {showAddCategoryModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-scaleUp">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-sm w-full p-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div>
                <h4 className="text-sm font-extrabold text-slate-900">Add New Expense Head</h4>
                <p className="text-[11px] text-slate-500">Will be saved to database for future entries</p>
              </div>
              <button
                type="button"
                onClick={() => { setShowAddCategoryModal(false); setNewCategoryName(''); }}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleCreateCategory();
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Category / Head Name *
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="e.g. Legal Fees, Municipal Tax, Margaret..."
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Head Scope
                </label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
                    <input
                      type="radio"
                      name="headScope"
                      checked={newCategoryType === 'Property'}
                      onChange={() => setNewCategoryType('Property')}
                    />
                    <span>Property Expense</span>
                  </label>
                  <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
                    <input
                      type="radio"
                      name="headScope"
                      checked={newCategoryType === 'Common'}
                      onChange={() => setNewCategoryType('Common')}
                    />
                    <span>Common (General)</span>
                  </label>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => { setShowAddCategoryModal(false); setNewCategoryName(''); }}
                  className="px-3.5 py-1.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingCategory || !newCategoryName.trim()}
                  className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm disabled:opacity-50 cursor-pointer"
                >
                  {creatingCategory ? 'Saving...' : 'Save & Select'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
