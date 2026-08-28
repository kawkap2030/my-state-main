import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import PageHeader from '../../../components/ui/PageHeader';
import Breadcrumb from '../../../components/ui/Breadcrumb';
import HierarchySelector from '../../../components/common/HierarchySelector';
import Card from '../../../components/ui/Card';
import Button from '../../../components/ui/Button';
import Input from '../../../components/ui/Input';
import Select from '../../../components/ui/Select';
import AutoComplete from '../../../components/ui/AutoComplete';
import { useToast } from '../../../components/ui/Toast';
import invoke from '../../../api/tauriApi';
import { 
  Syringe, Hash, Save, History, Tag, Layers, 
  Trash2, Edit2, Search, BarChart3, Package, CheckCircle2, DollarSign, Lock, Unlock, AlertCircle, ShoppingCart, RotateCcw,  Printer, Users,
  Plus,
  Minus,
  ChevronDown
} from 'lucide-react';
import { useGlobalApp } from '../../../context/useGlobalApp';
import Pagination from '../../../components/ui/Pagination';
import ConfirmModal from '../../../components/ui/ConfirmModal';
import LockNotificationBanner from '../../../components/common/LockNotificationBanner';
import StatsBar from '../../../components/common/StatsBar';
import PrintableTable from '../../../components/common/PrintableTable';
import { buildHierarchyLabel } from '../../../utils/reportUtils';
import ExportMenu from '../../../components/ui/ExportMenu';
import { executePrint } from '../../../utils/exportPrint';
import useKeyboardShortcuts from '../../../hooks/useKeyboardShortcuts';
import useLockGuard from '../../../hooks/useLockGuard';

const isFreeType = (t) => {
  if (!t) return false;
  const s = String(t).trim();
  return s === 'مجاني' || s.includes('مجاني') || s.includes('مجان');
};

const isSubsidizedType = (t) => {
  if (!t) return false;
  const s = String(t).trim();
  return s === 'مدعم' || s.includes('مدعم') || s.includes('تجاري') || (!isFreeType(t) && s.length > 0);
};

const InsulinDispensingPage = () => {
  const { activeHierarchy, hierarchyNames, workspaceMode, checkIsMonthLocked } = useGlobalApp();
  const toast = useToast();
  const location = useLocation();
  
  const [hierarchy, setHierarchy] = useState({
    branchId: location.state?.branchId || activeHierarchy.branchId || '',
    areaId: location.state?.areaId || activeHierarchy.areaId || '',
    clinicId: location.state?.clinicId || activeHierarchy.clinicId || '',
    dispenseMonth: location.state?.dispenseMonth || activeHierarchy.dispenseMonth || new Date().toISOString().substring(0, 7)
  });
  const { isLocked: monthLocked, LockBanner } = useLockGuard(hierarchy?.dispenseMonth);

  const [categories, setCategories] = useState([]);
  const [types, setTypes] = useState([]);
  const [codes, setCodes] = useState([]);
  const [filteredCodes, setFilteredCodes] = useState([]);
  const [history, setHistory] = useState([]);
  const [, setLoading] = useState(false);
  const [savingAll, setSavingAll] = useState(false);
  const [subList, setSubList] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterLockStatus, setFilterLockStatus] = useState('all');
  const [filterHighValue, setFilterHighValue] = useState(false);
  const [previousPrices, setPreviousPrices] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(50);
  const [editFormData, setEditFormData] = useState({
    quantity: '',
    casesCount: '',
    unitPrice: '',
    totalCost: '0.00'
  });

  // Form State
  const [formData, setFormData] = useState({
    categoryId: '',
    typeId: '',
    codeId: '',
    quantity: '',
    casesCount: '',
    unitPrice: '',
    totalCost: '0.00'
  });
  const [allMode, setAllMode] = useState(false);
  const ALL_CATEGORY_NAME = 'الكل';
  const individualCategories = useMemo(() => categories.filter(c => c.name.trim() !== ALL_CATEGORY_NAME), [categories]);

  // Funding categories visible depend on the selected type:
  // مجاني (free) => هيئة / طلاب / رضع / مرأة معيلة (all)
  // مدعم (commercial/supported) => هيئة / طلاب / رضع (exclude مرأة معيلة)
  const visibleCategories = useMemo(() => {
    if (!formData.typeId) return individualCategories;
    if (isSubsidizedType(formData.typeId)) {
      return individualCategories.filter(c => !String(c.name || '').trim().includes('معيل'));
    }
    return individualCategories;
  }, [individualCategories, formData.typeId]);

   
   
  useEffect(() => {
    loadMetaData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let filtered = [...codes];
    if (formData.typeId) filtered = filtered.filter(c => c.type === formData.typeId);
    setFilteredCodes(filtered.sort((a, b) => a.name.localeCompare(b.name, 'ar')));
  }, [formData.typeId, codes]);

  useEffect(() => {
    if (formData.codeId) {
      const selectedId = parseInt(formData.codeId);
      const insulinName = codes.find(c => c.id === selectedId)?.name;
      if (insulinName) {
        invoke('get_insulin_previous_prices', { name: insulinName })
          .then(data => {
            const unique = [...new Set(data.map(p => parseFloat(p).toFixed(2)))];
            setPreviousPrices(unique);
          })
          .catch(err => console.error('Failed to load insulin prices:', err));
      }
    } else {
      setPreviousPrices([]);
    }
  }, [formData.codeId, codes]);

  useKeyboardShortcuts([
    {
      key: 'p',
      ctrl: true,
      handler: () => executePrint({ orientation: 'landscape', fontSize: 'md', margins: 'standard', showPageNumbers: true, showSignatures: true }),
      description: 'طباعة'
    },
    {
      key: 'n',
      alt: true,
      handler: () => document.querySelector('[data-focus="first-input"]')?.focus(),
      description: 'سجل جديد'
    },
    {
      key: 'Escape',
      handler: () => {
        setEditingId(null);
        setAllMode(false);
        setFormData({
          typeId: '',
          codeId: '',
          casesCount: '',
          unitPrice: '',
          totalCost: '0.00'
        });
        toast.info("تم تفريغ الصناديق");
      },
      description: 'إلغاء التعديل / تفريغ'
    }
  ]);

   
  const loadMetaData = async () => {
    setLoading(true);
    try {
      const [cats, ts, cs] = await Promise.all([
        invoke('get_insulin_categories'),
        invoke('get_insulin_types'),
        invoke('get_insulin_codes')
      ]);
      setCategories(cats);
      setTypes(ts);
      setCodes(cs);
    } catch (err) {
      toast.error('خطأ في تحميل البيانات الأساسية');
    } finally {
      setLoading(false);
    }
  };

   
  const loadHistory = async () => {
    if (!hierarchy.branchId || !hierarchy.dispenseMonth) return;
    setLoading(true);
    try {
      const data = await invoke('get_insulin_dispensed', {
        branchId: parseInt(hierarchy.branchId),
        areaId: null,
        clinicId: null,
        dispenseMonth: hierarchy.dispenseMonth
      });
      
      const mapped = (data || []).map(item => ({
        ...item,
        priceFormatted: parseFloat(item.price).toFixed(2),
        quantityFormatted: parseFloat(item.quantity).toFixed(2)
      }));
      setHistory(mapped);
    } catch (err) {
      toast.error('فشل في تحميل سجل الصرف');
    } finally {
      setLoading(false);
    }
  };

   
   
  useEffect(() => {
    loadHistory();
  }, [hierarchy.branchId, hierarchy.areaId, hierarchy.clinicId, hierarchy.dispenseMonth]); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePriceSelection = (p) => {
    const price = parseFloat(p);
    const qty = parseFloat(formData.quantity || 0);
    setFormData({ ...formData, unitPrice: p, totalCost: (price * qty).toFixed(2) });
  };

  const runEntryCheck = useCallback(async (typeName, all, categoryId) => {
    if (!typeName) return { allowed: true, message: null };
    if (!all && !categoryId) return { allowed: true, message: null };
    try {
      const categoryName = all ? null : (categories.find(c => c.id === parseInt(categoryId))?.name || null);
      return await invoke('check_insulin_entry_allowed', {
        type_: typeName,
        branchId: parseInt(hierarchy.branchId),
        areaId: hierarchy.areaId ? parseInt(hierarchy.areaId) : null,
        clinicId: hierarchy.clinicId ? parseInt(hierarchy.clinicId) : null,
        dispenseMonth: hierarchy.dispenseMonth,
        allMode: all,
        category: categoryName
      });
    } catch (err) {
      return { allowed: true, message: null };
    }
  }, [categories, hierarchy.branchId, hierarchy.areaId, hierarchy.clinicId, hierarchy.dispenseMonth]);

  const handleCategorySelect = async (e) => {
    const val = e.target.value;
    if (!formData.typeId) {
      toast.warning('يرجى اختيار النوع (مجاني/مدعم) أولاً');
      return;
    }
    const result = await runEntryCheck(formData.typeId, false, val);
    if (!result.allowed) {
      toast.error(result.message || 'لا يمكن الإدخال');
      return;
    }
    setAllMode(false);
    setFormData({ ...formData, categoryId: val, codeId: '' });
  };

  const handleAllMode = async () => {
    const desired = !allMode;
    if (!formData.typeId) {
      toast.warning('يرجى اختيار النوع (مجاني/مدعم) أولاً');
      return;
    }
    const result = await runEntryCheck(formData.typeId, desired, null);
    if (!result.allowed) {
      toast.error(result.message || 'لا يمكن الإدخال');
      return;
    }
    setAllMode(desired);
    setFormData({ ...formData, categoryId: desired ? '' : formData.categoryId, codeId: '' });
  };

  const handleTypeSelect = async (e) => {
    const val = e.target.value;
    setFormData({ ...formData, typeId: val, categoryId: '', codeId: '' });
    setAllMode(false);
    setPreviousPrices([]);
  };

  const handleAddToSubList = (e) => {
    e.preventDefault();
    if (!formData.codeId || !formData.quantity || !formData.unitPrice || !formData.casesCount) {
      toast.warning('يرجى إكمال بيانات الصنف (بما في ذلك عدد الحالات)');
      return;
    }
    const selected = codes.find(c => c.id === parseInt(formData.codeId));
    if (!selected) return;

    const selectedCategory = allMode ? ALL_CATEGORY_NAME : (categories.find(c => c.id === parseInt(formData.categoryId))?.name || '--');
    const selectedType = formData.typeId || '--';

    // Duplicate Check: same item, same price, same category, same type
    const isDuplicate = subList.some(item => 
      (item.codeId === formData.codeId || item.insulin_code_id === selected.id || item.name === selected.name) && 
      item.category === selectedCategory &&
      (item.typeId === formData.typeId || item.type === selectedType) &&
      parseFloat(item.unitPrice).toFixed(2) === parseFloat(formData.unitPrice).toFixed(2)
    ) || history.some(item => 
      (item.insulin_code_id === selected.id || item.name === selected.name) && 
      item.category === selectedCategory &&
      item.type_ === selectedType &&
      parseFloat(item.price).toFixed(2) === parseFloat(formData.unitPrice).toFixed(2)
    );

    if (isDuplicate) {
      toast.error('يوجد ادخال سابق للصنف بنفس السعر يمكنك مراجعة الصنف والتعديل عليه');
      return;
    }

    setSubList([...subList, { 
      ...formData, 
      id: Date.now(), 
      name: selected.name, 
      type: selected.type, 
      category: selectedCategory,
      unit: selected.unit,
      insulin_code_id: selected.id,
      branchId: hierarchy.branchId,
      areaId: hierarchy.areaId,
      clinicId: hierarchy.clinicId
    }]);
    
    setFormData({
      categoryId: '',
      typeId: '',
      codeId: '',
      quantity: '',
      casesCount: '',
      unitPrice: '',
      totalCost: '0.00'
    });
    setAllMode(false);
  };

  const handleSaveAll = async () => {
    if (subList.length === 0) return;
    setSavingAll(true);
    let successCount = 0;
    let skipCount = 0;
    const failures = [];

    try {
      for (const item of subList) {
        try {
          const payload = {
            id: null,
            name: item.name,
            type_: item.type,
            unit: item.unit,
            cases_count: parseInt(item.casesCount),
            quantity: parseFloat(item.quantity),
            price: parseFloat(item.unitPrice),
            cost: parseFloat(item.totalCost),
            rate: 0, balance: 0,
            category: item.category,
            branch_id: parseInt(item.branchId),
            area_id: item.areaId ? parseInt(item.areaId) : null,
            clinic_id: item.clinicId ? parseInt(item.clinicId) : null,
            dispense_month: hierarchy.dispenseMonth,
            insulin_code_id: item.insulin_code_id
          };
          await invoke('save_insulin_dispensed', { data: payload });
          successCount++;
          item._saved = true;
        } catch (err) {
          if (String(err).includes("مكرر") || String(err).includes("بنفس السعر")) {
            skipCount++;
          } else {
            failures.push({ item, error: err });
          }
        }
      }

      if (failures.length === 0 && skipCount === 0) {
        toast.success(`تم حفظ ${successCount} سجلات بنجاح.`);
        setSubList([]);
      } else if (failures.length === 0) {
        toast.success(`تم حفظ ${successCount} سجلات وتخطي ${skipCount} سجلات مكررة.`);
        setSubList([]);
      } else {
        // Partial or total failure: keep unsaved items in the sub-list, drop only saved ones.
        const failedItems = subList.filter(it => !it._saved);
        let msg = `تم حفظ ${successCount} من ${subList.length} سجلات.\n`;
        if (failures.length > 0) {
          msg += 'سجلات لم يتم حفظها:\n' + failures.map(f => `- ${f.item.category} / ${f.item.name} / سعر ${f.item.unitPrice}: ${String(f.error)}`).join('\n');
        }
        if (skipCount > 0) msg += `\nتخطي ${skipCount} سجلات مكررة.`;
        if (successCount > 0) {
          toast.error(msg);
          setSubList(failedItems.length > 0 ? failedItems : []);
        } else {
          toast.error(msg);
        }
      }
      loadHistory();
    } catch (err) {
      toast.error('خطأ غير متوقع في الحفظ');
    } finally {
      setSavingAll(false);
    }
  };

  const handleDeleteSubItem = (id) => setSubList(subList.filter(item => item.id !== id));

  const handleDeleteHistory = async (id) => {
    setDeleteTarget(id);
  };

  const confirmDeleteHistory = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      await invoke('delete_insulin_dispensed', { id: deleteTarget });
      toast.success('تم حذف السجل بنجاح');
      loadHistory();
    } catch (err) {
      toast.error(`فشل الحذف: ${err}`);
    } finally {
      setDeleteLoading(false);
      setDeleteTarget(null);
    }
  };

  const startEdit = (reg) => {
    setEditingId(reg.id);
    setEditFormData({
      quantity: reg.quantity,
      casesCount: reg.cases_count,
      unitPrice: reg.price,
      totalCost: parseFloat(reg.cost).toFixed(2)
    });
  };

  const handleUpdateEdit = async (id, reg) => {
    try {
      const payload = {
        id,
        name: reg.name,
        type_: reg.type_,
        unit: reg.unit,
        cases_count: parseInt(editFormData.casesCount),
        quantity: parseFloat(editFormData.quantity),
        price: parseFloat(editFormData.unitPrice),
        cost: parseFloat(editFormData.totalCost),
        rate: reg.rate,
        balance: reg.balance,
        category: reg.category,
        branch_id: reg.branch_id,
        area_id: reg.area_id,
        clinic_id: reg.clinic_id,
        dispense_month: reg.dispense_month,
        insulin_code_id: reg.insulin_code_id
      };
      await invoke('save_insulin_dispensed', { data: payload });
      toast.success('تم تحديث السجل بنجاح');
      setEditingId(null);
      loadHistory();
    } catch (err) {
      toast.error(`فشل التحديث: ${err}`);
    }
  };

  const baselineAvgValue = useMemo(() => {
    if (history.length === 0) return 0;
    const total = history.reduce((sum, item) => sum + (parseFloat(item.cost) || 0), 0);
    return total / history.length;
  }, [history]);

  const displayHistory = useMemo(() => {
    return (history || [])
      .filter(item => {
        // Smart Hierarchy Filter (Local)
        if (hierarchy.areaId && item.area_id?.toString() !== hierarchy.areaId.toString()) return false;
        if (hierarchy.clinicId && item.clinic_id?.toString() !== hierarchy.clinicId.toString()) return false;

        // Lock Status Filter
        const isLocked = checkIsMonthLocked(item.dispense_month);
        if (filterLockStatus === 'locked' && !isLocked) return false;
        if (filterLockStatus === 'unlocked' && isLocked) return false;

        // High Value Filter
        if (filterHighValue) {
          if ((parseFloat(item.cost) || 0) <= baselineAvgValue * 2) return false;
        }

        const matchSearch = !searchTerm || 
          item.name.toLowerCase().includes(searchTerm.toLowerCase());
        const matchCategory = !filterCategory || item.category === filterCategory;
        const matchType = !filterType || item.type_ === filterType;
        return matchSearch && matchCategory && matchType;
      })
      .sort((a, b) => {
        const typeCmp = (a.type_ || '').localeCompare(b.type_ || '', 'ar');
        if (typeCmp !== 0) return typeCmp;
        return (a.name || '').localeCompare(b.name || '', 'ar');
      });
  }, [history, searchTerm, filterCategory, filterType, hierarchy.areaId, hierarchy.clinicId, filterLockStatus, filterHighValue, baselineAvgValue, checkIsMonthLocked]);

  const paginatedHistory = useMemo(() => {
    const startIndex = (currentPage - 1) * rowsPerPage;
    return displayHistory.slice(startIndex, startIndex + rowsPerPage);
  }, [displayHistory, currentPage, rowsPerPage]);

  // ── Collapse/Expand Groups ────────────────────────────────────────────
  const STORAGE_KEY = 'collapsed-insulin-dispensing';
  const [collapsedGroups, setCollapsedGroups] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch { return new Set(); }
  });
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...collapsedGroups]));
  }, [collapsedGroups]);
  const toggleGroup = useCallback((name) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }, []);

  const groupedRows = useMemo(() => {
    let prevType = '';
    const rows = [];
    // Count items per type
    const groupCounts = {};
    paginatedHistory.forEach(reg => {
      const key = reg.type_ || '';
      groupCounts[key] = (groupCounts[key] || 0) + 1;
    });
    paginatedHistory.forEach((reg) => {
      const currentType = reg.type_ || '';
      const isCollapsed = collapsedGroups.has(currentType);
      if (currentType && currentType !== prevType) {
        rows.push(
          <tr key={'type-' + currentType} className="bg-[var(--color-primary)]/10 border-y-2 border-[var(--color-primary)]/30">
            <td colSpan={6} className="px-4 py-2 font-bold text-xs" style={{ color: 'var(--color-primary)' }}>
              <div className="flex items-center gap-2">
                <div className="w-1 h-5 rounded-full" style={{ background: 'var(--color-primary)' }} />
                <span>{currentType}</span>
                <span className="text-[10px] opacity-50">(نوع)</span>
                <span className="text-[10px] opacity-70 mr-1 bg-[var(--color-primary)]/10 px-2 py-0.5 rounded-full font-mono" style={{ color: 'var(--color-primary)' }}>{groupCounts[currentType]}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); toggleGroup(currentType); }}
                  className="mr-auto p-1 rounded-lg hover:bg-[var(--color-primary)]/20 transition-all cursor-pointer"
                  style={{ color: 'var(--color-primary)' }}
                  title={isCollapsed ? 'إظهار الأصناف' : 'إخفاء الأصناف'}
                  type="button"
                >
                  {isCollapsed ? <Plus size={14} /> : <Minus size={14} />}
                </button>
              </div>
            </td>
          </tr>
        );
        prevType = currentType;
      }
      const isLocked = checkIsMonthLocked(reg.dispense_month);
      const isEditing = editingId === reg.id;
      rows.push(
        <tr key={reg.id}
          className={`hover:bg-slate-50/50 ${isCollapsed ? "group-collapsed" : "group-expanded"} ${isLocked ? "opacity-70 bg-slate-50/10" : ""} ${isEditing ? "bg-primary/5" : ""}`}
        >
          <td className="p-4">
            <div className="flex items-center gap-2">
              {isLocked && <Lock size={12} className="text-amber-500" />}
              <p className="font-bold text-[var(--color-text)]">{reg.name}</p>
            </div>
            <p className="text-[10px] text-[var(--color-text-muted)]">{reg.category} - {reg.type_}</p>
          </td>
          <td className="p-4 text-center font-mono font-medium">
            {isEditing ? (
              <input type="number" step="0.01" className="w-20 p-1 border rounded text-xs text-center font-bold bg-[var(--color-bg-card)]"
                value={editFormData.quantity}
                onChange={(e) => {
                  const q = e.target.value;
                  setEditFormData({ ...editFormData, quantity: q, totalCost: (parseFloat(q || 0) * parseFloat(editFormData.unitPrice || 0)).toFixed(2) });
                }}
              />
            ) : (
              <span>{reg.quantity} {reg.unit}</span>
            )}
          </td>
          <td className="p-4 text-center font-mono font-medium">
            {isEditing ? (
              <input type="number" className="w-16 p-1 border rounded text-xs text-center font-bold bg-[var(--color-bg-card)]"
                value={editFormData.casesCount}
                onChange={(e) => setEditFormData({ ...editFormData, casesCount: e.target.value })}
              />
            ) : (
              <span>{reg.cases_count}</span>
            )}
          </td>
          <td className="p-4 text-center text-sm text-slate-500">
            {isEditing ? (
              <input type="number" step="0.01" className="w-20 p-1 border rounded text-xs text-center font-bold bg-[var(--color-bg-card)]"
                value={editFormData.unitPrice}
                onChange={(e) => {
                  const p = e.target.value;
                  setEditFormData({ ...editFormData, unitPrice: p, totalCost: (parseFloat(editFormData.quantity || 0) * parseFloat(p || 0)).toFixed(2) });
                }}
              />
            ) : (
              <span>{parseFloat(reg.price || 0).toFixed(2)} ج.م</span>
            )}
          </td>
          <td className="p-4 text-center font-black text-emerald-600">
            {isEditing ? editFormData.totalCost : parseFloat(reg.cost || 0).toFixed(2)} ج.م
          </td>
          <td className="p-4 no-print">
            <div className="flex items-center justify-center gap-2">
              {isEditing ? (
                <>
                  <button onClick={() => handleUpdateEdit(reg.id, reg)} className="p-1 text-emerald-500 hover:bg-emerald-50 rounded transition-all"><Save size={18} /></button>
                  <button onClick={() => setEditingId(null)} className="p-1 text-slate-400 hover:bg-slate-50 rounded transition-all"><RotateCcw size={18} /></button>
                </>
              ) : (
                <>
                  <button disabled={isLocked} onClick={() => startEdit(reg)} className={`p-1.5 rounded transition-all ${isLocked ? "text-slate-200 cursor-not-allowed" : "text-blue-500 hover:bg-blue-50"}`} title="تعديل"><Edit2 size={18} /></button>
                  <button disabled={isLocked} onClick={() => handleDeleteHistory(reg.id)} className={`p-1.5 rounded transition-all ${isLocked ? "text-slate-200 cursor-not-allowed" : "text-red-500 hover:bg-red-50"}`} title="حذف"><Trash2 size={18} /></button>
                </>
              )}
            </div>
          </td>
        </tr>
      );
    });
    return rows;
  }, [paginatedHistory, checkIsMonthLocked, editingId, editFormData, collapsedGroups, toggleGroup]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalPages = Math.ceil(displayHistory.length / rowsPerPage);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterCategory, filterType, filterLockStatus, filterHighValue]);

  const stats = useMemo(() => {
    const calc = (data) => ({
      cost: data.reduce((sum, item) => sum + (parseFloat(item.cost) || 0), 0),
      qty: data.reduce((sum, item) => sum + (parseFloat(item.quantity) || 0), 0),
      cases: data.reduce((sum, item) => sum + (parseInt(item.cases_count) || 0), 0),
      count: data.length
    });
    const calcByType = (data) => {
      const subsidized = data.filter(i => isSubsidizedType(i.type_));
      const free = data.filter(i => isFreeType(i.type_));
      return {
        subsidized: calc(subsidized),
        free: calc(free),
      };
    };
    return {
      all: calc(history),
      filtered: calc(displayHistory),
      allByType: calcByType(history),
      filteredByType: calcByType(displayHistory),
    };
  }, [history, displayHistory]);

  const statsBarItems = useMemo(() => [
    {
      label: 'إجمالي التكلفة',
      value: stats.all.cost,
      filteredValue: stats.filtered.cost,
      type: 'currency',
      icon: DollarSign,
      color: 'var(--color-success)'
    },
    {
      label: 'المدعم — التكلفة',
      value: stats.allByType.subsidized.cost,
      filteredValue: stats.filteredByType.subsidized.cost,
      type: 'currency',
      icon: DollarSign,
      color: 'var(--color-primary)'
    },
    {
      label: 'المجاني — التكلفة',
      value: stats.allByType.free.cost,
      filteredValue: stats.filteredByType.free.cost,
      type: 'currency',
      icon: DollarSign,
      color: 'var(--color-info)'
    },
    {
      label: 'إجمالي الحالات',
      value: stats.all.cases,
      filteredValue: stats.filtered.cases,
      type: 'number',
      icon: Users,
      color: 'var(--color-warning)'
    },
    {
      label: 'المدعم — الكميات',
      value: stats.allByType.subsidized.qty,
      filteredValue: stats.filteredByType.subsidized.qty,
      type: 'number',
      icon: Hash,
      color: 'var(--color-primary)'
    },
    {
      label: 'المجاني — الكميات',
      value: stats.allByType.free.qty,
      filteredValue: stats.filteredByType.free.qty,
      type: 'number',
      icon: Hash,
      color: 'var(--color-info)'
    },
  ], [stats.all, stats.filtered, stats.allByType, stats.filteredByType]);

  const insulinExportColumns = [
    { header: "الصنف", accessor: "name" },
    { header: "الكمية", accessor: (r) => (r.quantity ?? 0).toString() },
    { header: "عدد الحالات", accessor: (r) => (r.cases_count ?? 0).toString() },
    { header: "سعر الوحدة", accessor: (r) => parseFloat(r.price || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) },
    { header: "القيمة", accessor: (r) => parseFloat(r.cost || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) },
  ];

  const insulinTables = useMemo(() => {
    const subsidized = displayHistory.filter(i => isSubsidizedType(i.type_));
    const free = displayHistory.filter(i => isFreeType(i.type_));
    const tables = [];
    if (subsidized.length > 0) tables.push({ data: subsidized, columns: insulinExportColumns, title: 'المدعم' });
    if (free.length > 0) tables.push({ data: free, columns: insulinExportColumns, title: 'المجاني' });
    return tables;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayHistory]);

  const handleCustomExport = useCallback(async (type, { data, columns: cols, options: exportOpts }) => {
    if (type === 'excel') {
      const { exportMultiSheetExcel } = await import('../../../utils/exportExcel');
      
      const subsidizedRecords = data.filter(i => isSubsidizedType(i.type_));
      const freeRecords = data.filter(i => isFreeType(i.type_));

      const sheetsData = {};
      
      if (subsidizedRecords.length > 0) {
        sheetsData['المدعم'] = {
          data: subsidizedRecords,
          columns: cols,
          options: {
            ...exportOpts,
            title: `${exportOpts.title || 'سجلات صرف الأنسولين'} (المدعم)`,
          }
        };
      }
      
      if (freeRecords.length > 0) {
        sheetsData['المجاني'] = {
          data: freeRecords,
          columns: cols,
          options: {
            ...exportOpts,
            title: `${exportOpts.title || 'سجلات صرف الأنسولين'} (المجاني)`,
          }
        };
      }

      if (Object.keys(sheetsData).length === 0 || (subsidizedRecords.length > 0 && freeRecords.length > 0)) {
        sheetsData['كافة السجلات'] = {
          data,
          columns: cols,
          options: exportOpts,
        };
      }

      const totalCost = data.reduce((sum, item) => sum + (parseFloat(item.cost) || 0), 0);
      const totalQty = data.reduce((sum, item) => sum + (parseFloat(item.quantity) || 0), 0);
      const totalCases = data.reduce((sum, item) => sum + (parseInt(item.cases_count) || 0), 0);
      
      const subCost = subsidizedRecords.reduce((sum, item) => sum + (parseFloat(item.cost) || 0), 0);
      const freeCost = freeRecords.reduce((sum, item) => sum + (parseFloat(item.cost) || 0), 0);

      const summaryRows = [
        ['إجمالي عدد السجلات', String(data.length)],
        ['إجمالي الكمية', totalQty.toLocaleString(undefined, { maximumFractionDigits: 2 })],
        ['إجمالي عدد الحالات', totalCases.toLocaleString()],
        ['إجمالي التكلفة', totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ج.م'],
      ];

      if (subsidizedRecords.length > 0) {
        summaryRows.push(['تكلفة المدعم', subCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ج.م']);
        summaryRows.push(['سجلات المدعم', String(subsidizedRecords.length)]);
      }
      if (freeRecords.length > 0) {
        summaryRows.push(['تكلفة المجاني', freeCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ج.م']);
        summaryRows.push(['سجلات المجاني', String(freeRecords.length)]);
      }

      if (exportOpts.hierarchyLabel) {
        summaryRows.push(['النطاق الإداري', exportOpts.hierarchyLabel]);
      }
      if (exportOpts.month || exportOpts.monthLabel) {
        summaryRows.push(['الشهر', exportOpts.month || exportOpts.monthLabel]);
      }

      await exportMultiSheetExcel(sheetsData, {
        fileName: exportOpts.fileName || `insulin_dispensing_${hierarchy.dispenseMonth}`,
        title: exportOpts.title || 'سجلات صرف الأنسولين',
        hierarchyLabel: exportOpts.hierarchyLabel,
        summaryData: {
          headers: ['البيان', 'القيمة'],
          rows: summaryRows,
        },
      });

      return true;
    }

    if (type === 'pdf') {
      const { exportToPDF } = await import('../../../utils/exportPdf');
      const subsidizedRecords = data.filter(i => isSubsidizedType(i.type_));
      const freeRecords = data.filter(i => isFreeType(i.type_));
      const tables = [];
      if (subsidizedRecords.length > 0) tables.push({ data: subsidizedRecords, columns: cols, title: 'المدعم' });
      if (freeRecords.length > 0) tables.push({ data: freeRecords, columns: cols, title: 'المجاني' });
      if (tables.length === 0) tables.push({ data, columns: cols, title: exportOpts.title || 'سجلات صرف الأنسولين' });
      await exportToPDF(data, cols, { ...exportOpts, tables });
      return true;
    }

    if (type === 'word') {
      const { exportToWord } = await import('../../../utils/exportWord');
      const subsidizedRecords = data.filter(i => isSubsidizedType(i.type_));
      const freeRecords = data.filter(i => isFreeType(i.type_));
      const tables = [];
      if (subsidizedRecords.length > 0) tables.push({ data: subsidizedRecords, columns: cols, title: 'المدعم' });
      if (freeRecords.length > 0) tables.push({ data: freeRecords, columns: cols, title: 'المجاني' });
      if (tables.length === 0) tables.push({ data, columns: cols, title: exportOpts.title || 'سجلات صرف الأنسولين' });
      await exportToWord(data, cols, { ...exportOpts, tables });
      return true;
    }

    return false;
  }, [hierarchy.dispenseMonth]);

  return (
    <>
      <div className="space-y-6 animate-fadeIn pb-20" dir="rtl">
        <div className="no-print space-y-6">
          <Breadcrumb items={[{ label: 'العمليات' }, { label: 'صرف الأنسولين' }]} />
          
          <PageHeader 
            title="صرف الأنسولين" 
            icon={Syringe} 
            description="تسجيل منصرف الأنسولين بالتفصيل لكل صنف."
          />

          <HierarchySelector 
            onSelectionChange={(data) => setHierarchy(prev => ({ ...prev, ...data }))}
            initialBranch={hierarchy.branchId}
            initialArea={hierarchy.areaId}
            initialClinic={hierarchy.clinicId}
            initialMonth={hierarchy.dispenseMonth}
          />

          {/* Lock Notification Banner */}
          <LockBanner />

          <div className="max-w-5xl mx-auto space-y-6">
            <Card className="p-6 h-full shadow-sm">
              <form onSubmit={handleAddToSubList} className="space-y-6">
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Select 
                          label={allMode ? 'الفئة (الكل)' : 'الفئة (هيئة/طلاب)'} icon={Layers}
                          options={visibleCategories.map(c => ({ value: c.id, label: c.name }))}
                          value={formData.categoryId}
                          onChange={handleCategorySelect}
                          required={!allMode}
                          data-focus="first-input"
                          disabled={monthLocked || allMode}
                        />
                        <div className="mt-2">
                          <button
                            type="button"
                            onClick={handleAllMode}
                            disabled={monthLocked}
                            className={`w-full px-4 py-2.5 rounded-xl text-sm font-bold border-2 border-dashed transition-all flex items-center justify-center gap-2 ${
                              allMode
                                ? 'bg-primary text-white border-primary shadow-sm'
                                : 'bg-[var(--color-bg-card)] text-primary border-primary/40 hover:bg-primary/5'
                            } disabled:opacity-50 disabled:cursor-not-allowed`}
                          >
                            <Layers size={14} /> {allMode ? 'وضع الكل مفعّل' : 'الكل'}
                          </button>
                        </div>
                      </div>
                      <Select 
                        label="النوع (مدعم/مجاني)" icon={Tag}
                        options={types.map(t => ({ value: t.name, label: t.name }))}
                        value={formData.typeId}
                        onChange={handleTypeSelect}
                        required
                        disabled={monthLocked}
                      />
                   </div>

                   <AutoComplete 
                      label="صنف الإنسولين" 
                      options={filteredCodes}
                      value={formData.codeId}
                      onChange={(val) => setFormData({ ...formData, codeId: val })}
                      placeholder="ابحث عن صنف إنسولين..."
                      disabled={monthLocked}
                   />

                   <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <Input 
                        label="الكمية" type="number" step="0.01" icon={Hash}
                        value={formData.quantity}
                        onChange={(e) => {
                           const q = e.target.value;
                           setFormData({ ...formData, quantity: q, totalCost: (parseFloat(q || 0) * parseFloat(formData.unitPrice || 0)).toFixed(2) });
                        }}
                        required
                        disabled={monthLocked}
                      />
                      <Input 
                        label="عدد الحالات" type="number" icon={Hash}
                        value={formData.casesCount}
                        onChange={(e) => setFormData({ ...formData, casesCount: e.target.value })}
                        required
                        disabled={monthLocked}
                      />
                      <div className="space-y-1">
                         <div className="flex items-center justify-between">
                            <label className="field-label mb-1"><DollarSign size={16}/><span>سعر الوحدة</span></label>
                             {previousPrices.length > 0 && (
                               <select 
                                 className="text-[10px] font-bold text-primary bg-primary/5 border-none outline-none rounded px-1 cursor-pointer"
                                 onChange={(e) => handlePriceSelection(e.target.value)}
                                 value=""
                                 disabled={monthLocked}
                               >
                                <option value="" disabled>أسعار سابقة...</option>
                                {previousPrices.map(p => <option key={p} value={p}>{p}</option>)}
                              </select>
                            )}
                         </div>
                         <Input 
                           type="number" step="0.01"
                           value={formData.unitPrice}
                           onChange={(e) => {
                              const p = e.target.value;
                              setFormData({ ...formData, unitPrice: p, totalCost: (parseFloat(formData.quantity || 0) * parseFloat(p || 0)).toFixed(2) });
                           }}
                           required
                           inputClassName="py-3"
                           disabled={monthLocked}
                         />
                      </div>
                   </div>

                   <div 
                      className="flex items-center justify-between p-4 rounded-2xl shadow-inner border"
                      style={{ 
                        backgroundColor: 'var(--color-accent-cyan-bg)',
                        borderColor: 'var(--color-accent-cyan)',
                        color: 'var(--color-accent-cyan)'
                      }}
                    >
                      <span className="text-sm font-bold">إجمالي التكلفة المتوقع:</span>
                      <span className="text-2xl font-black">{formData.totalCost} ج.م</span>
                   </div>

                   <Button 
                    variant="ghost" 
                    type="submit" 
                    icon={monthLocked ? Lock : Layers} 
                    disabled={monthLocked}
                    className="w-full py-4 text-lg border-2 border-dashed border-primary text-primary hover:bg-primary hover:text-white transition-all shadow-sm"
                  >
                    {monthLocked ? 'الشهر مقفل' : 'إضافة للقائمة الفرعية المؤقتة'}
                  </Button>
                </form>
              </Card>

            {subList.length > 0 && (
              <Card className="p-6 border-2 border-primary/30 bg-primary/5">
                <div className="flex items-center justify-between mb-4">
                   <h3 className="text-xl font-bold flex items-center gap-2 text-primary">
                     <ShoppingCart size={24} />
                     القائمة الفرعية المؤقتة (بانتظار الحفظ)
                   </h3>
                   <div className="bg-primary/10 text-primary px-3 py-1 rounded-full font-bold text-sm">
                     {subList.length} أصناف
                   </div>
                </div>
                
                <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-[var(--color-bg-card)]">
                  <table className="w-full text-right border-collapse">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800">
                        <th className="p-3 font-bold text-slate-600 dark:text-slate-400">التصنيف</th>
                        <th className="p-3 font-bold text-slate-600 dark:text-slate-400">الصنف</th>
                        <th className="p-3 font-bold text-slate-600 dark:text-slate-400">الكمية</th>
                        <th className="p-3 font-bold text-slate-600 dark:text-slate-400">الحالات</th>
                        <th className="p-3 font-bold text-slate-600 dark:text-slate-400">التكلفة</th>
                        <th className="p-3"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {subList.map(item => (
                        <tr key={item.id} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50/50 dark:hover:bg-slate-900/20">
                          <td className="p-3 text-sm text-slate-500 dark:text-slate-400">{item.category}</td>
                          <td className="p-3 font-bold text-primary">{item.name}</td>
                          <td className="p-3 font-bold text-[var(--color-text)]">{item.quantity}</td>
                          <td className="p-3 font-bold text-[var(--color-text)]">{item.casesCount}</td>
                          <td className="p-3 font-black" style={{ color: 'var(--color-success)' }}>{item.totalCost} ج.م</td>
                          <td className="p-3 text-left">
                            <button onClick={() => handleDeleteSubItem(item.id)} className="text-red-500 hover:text-white hover:bg-red-500 p-2 rounded-lg transition-all"><Trash2 size={16}/></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex justify-end gap-3 mt-6">
                   <Button onClick={() => setSubList([])} variant="ghost" className="text-red-500 hover:bg-red-50">
                     إلغاء الكل
                   </Button>
                   <Button 
                    variant="primary" 
                    icon={monthLocked ? Lock : Save} 
                    className="flex-1 py-4 rounded-2xl shadow-xl bg-indigo-600 hover:bg-indigo-700 border-none" 
                    loading={savingAll} 
                    disabled={monthLocked}
                    onClick={handleSaveAll}
                  >
                    {monthLocked ? 'الشهر مقفل' : '✓ اعتماد وحفظ قائمة الصرف'}
                  </Button>
                </div>
              </Card>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="no-print">
            <StatsBar stats={statsBarItems} accentColor="var(--color-primary)" />
          </div>

          <div className="bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] shadow-sm print:border-none print:shadow-none print:bg-transparent">
            <div className="print:hidden">
              <div className="no-print p-4 bg-[var(--color-bg-card)] border-b border-[var(--color-border)] flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-2 font-black text-slate-700 dark:text-slate-200">
                  <History size={18} className="text-primary" />
                  <span>سجلات صرف الأنسولين</span>
                  <ExportMenu 
                    data={displayHistory} 
                    columns={insulinExportColumns}
                    options={{ 
                      title: 'سجلات صرف الأنسولين', 
                      fileName: `insulin_dispensing_${hierarchy.dispenseMonth}`,
                      month: hierarchy.dispenseMonth,
                      hierarchyLabel: buildHierarchyLabel(workspaceMode, hierarchyNames),
                      tables: insulinTables,
                    }} 
                    onCustomExport={handleCustomExport}
                  />
                </div>

                <div className="flex items-center gap-2 flex-wrap justify-end">
                  <select
                    className="p-2 rounded-xl border border-[var(--color-border)] text-xs font-bold bg-[var(--color-bg-card)] text-[var(--color-text)] outline-none"
                    value={filterCategory}
                    onChange={(e) => setFilterCategory(e.target.value)}
                  >
                    <option value="">الفئة: الكل</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.name}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <select
                    className="p-2 rounded-xl border border-[var(--color-border)] text-xs font-bold bg-[var(--color-bg-card)] text-[var(--color-text)] outline-none"
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value)}
                  >
                    <option value="">النوع: الكل</option>
                    {types.map((t) => (
                      <option key={t.id} value={t.name}>
                        {t.name}
                      </option>
                    ))}
                  </select>

                  <div className="flex items-center gap-2 px-2 border-r border-l border-[var(--color-border)] mx-1">
                    <button
                      onClick={() =>
                        setFilterLockStatus((prev) =>
                          prev === "all"
                            ? "unlocked"
                            : prev === "unlocked"
                            ? "locked"
                            : "all",
                        )
                      }
                      className={`p-2 rounded-xl border transition-all flex items-center gap-2 text-xs font-bold ${
                        filterLockStatus === "locked"
                          ? "bg-amber-500 text-white border-transparent"
                          : filterLockStatus === "unlocked"
                          ? "bg-emerald-500 text-white border-transparent"
                          : "bg-[var(--color-bg)] text-[var(--color-text-muted)] border-[var(--color-border)] hover:bg-slate-50"
                      }`}
                      title={
                        filterLockStatus === "locked"
                          ? "عرض السجلات المقفلة فقط"
                          : filterLockStatus === "unlocked"
                          ? "عرض السجلات المفتوحة فقط"
                          : "كل الحالات"
                      }
                    >
                      {filterLockStatus === "locked" ? (
                        <Lock size={14} />
                      ) : (
                        <Unlock size={14} />
                      )}
                    </button>

                    <button
                      onClick={() => setFilterHighValue(!filterHighValue)}
                      className={`p-2 rounded-xl border transition-all flex items-center gap-2 text-xs font-bold ${
                        filterHighValue
                          ? "bg-red-500 text-white border-transparent shadow-lg shadow-red-500/20"
                          : "bg-[var(--color-bg)] text-[var(--color-text-muted)] border-[var(--color-border)] hover:bg-slate-50"
                      }`}
                      title="عرض السجلات ذات القيمة المرتفعة (تنبيه مالي)"
                    >
                      <AlertCircle size={14} />
                    </button>
                  </div>

                  {/* Collapse/Expand All Button */}
                  <button
                    onClick={() => {
                      const types = [...new Set(paginatedHistory.map(r => r.type_ || '').filter(Boolean))];
                      const allCollapsed = types.every(t => collapsedGroups.has(t));
                      if (allCollapsed) {
                        setCollapsedGroups(new Set());
                      } else {
                        setCollapsedGroups(new Set(types));
                      }
                    }}
                    className={`p-2 rounded-xl border transition-all flex items-center gap-2 text-xs font-bold ${
                      collapsedGroups.size > 0
                        ? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)] border-[var(--color-primary)]/30'
                        : 'bg-[var(--color-bg)] text-[var(--color-text-muted)] border-[var(--color-border)] hover:bg-slate-50'
                    }`}
                    title={collapsedGroups.size > 0 ? 'فتح كل المجموعات' : 'طي كل المجموعات'}
                  >
                    {collapsedGroups.size > 0 ? (
                      <><ChevronDown size={14} /> فتح الكل</>
                    ) : (
                      <><ChevronDown size={14} className="rotate-180" /> طي الكل</>
                    )}
                  </button>

                  <div className="relative">
                    <Search
                      size={14}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                    />
                    <input
                      type="text"
                      placeholder="بحث..."
                      className="p-2 pr-9 rounded-xl border border-[var(--color-border)] text-xs font-bold outline-none w-40 bg-[var(--color-bg-card)] text-[var(--color-text)]"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-right border-collapse">
                  <thead>
                    <tr className="bg-[var(--color-bg)] text-[var(--color-text-muted)] border-b border-[var(--color-border)]">
                      <th className="p-4 text-sm font-bold">الصنف</th>
                      <th className="p-4 text-sm font-bold text-center">
                        الكمية
                      </th>
                      <th className="p-4 text-sm font-bold text-center">
                        الحالات
                      </th>
                      <th className="p-4 text-sm font-bold text-center">
                        سعر الوحدة
                      </th>
                      <th className="p-4 text-sm font-bold text-center">
                        الإجمالي
                      </th>
                      <th className="p-4 text-center no-print"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border)]">
                    {groupedRows}
                  </tbody>
                  <tfoot className="print-table-footer">
                    <tr className="bg-[var(--color-bg-card)] border-t-2 border-[var(--color-border)] font-black text-[var(--color-text)]">
                      <td className="p-4 text-right">
                        المدعم ({stats.filteredByType.subsidized.count} سجل):
                      </td>
                      <td className="p-4 text-center text-primary">
                        {stats.filteredByType.subsidized.qty.toLocaleString()}
                      </td>
                      <td className="p-4 text-center text-amber-600">
                        {stats.filteredByType.subsidized.cases.toLocaleString()}
                      </td>
                      <td className="p-4"></td>
                      <td className="p-4 text-center text-[var(--color-success)]">
                        {stats.filteredByType.subsidized.cost.toLocaleString()} ج.م
                      </td>
                      <td className="p-4"></td>
                    </tr>
                    <tr className="bg-[var(--color-bg-card)] border-t border-[var(--color-border)] font-black text-[var(--color-text)]">
                      <td className="p-4 text-right">
                        المجاني ({stats.filteredByType.free.count} سجل):
                      </td>
                      <td className="p-4 text-center text-primary">
                        {stats.filteredByType.free.qty.toLocaleString()}
                      </td>
                      <td className="p-4 text-center text-amber-600">
                        {stats.filteredByType.free.cases.toLocaleString()}
                      </td>
                      <td className="p-4"></td>
                      <td className="p-4 text-center text-[var(--color-success)]">
                        {stats.filteredByType.free.cost.toLocaleString()} ج.م
                      </td>
                      <td className="p-4"></td>
                    </tr>
                    <tr className="bg-[var(--color-bg-card)] border-t-2 border-[var(--color-border)] font-black text-[var(--color-text)]">
                      <td className="p-4 text-right">
                        الإجمالي ({stats.filtered.count} سجل):
                      </td>
                      <td className="p-4 text-center text-primary">
                        {stats.filtered.qty.toLocaleString()}
                      </td>
                      <td className="p-4 text-center text-amber-600">
                        {stats.filtered.cases.toLocaleString()}
                      </td>
                      <td className="p-4"></td>
                      <td className="p-4 text-center text-[var(--color-success)]">
                        {stats.filtered.cost.toLocaleString()} ج.م
                      </td>
                      <td className="p-4"></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Full Print Version */}
            <div className="hidden print:block">
              <PrintableTable
                title="سجلات صرف الأنسولين"
                subtitle={`الشهر: ${hierarchy.dispenseMonth}`}
                hierarchyLabel={buildHierarchyLabel(workspaceMode, hierarchyNames)}
              >
                <table className="w-full text-right border-collapse border border-black text-[10px]">
                  <thead>
                    <tr className="bg-slate-50 border-b border-black">
                      <th className="p-2 border border-black">الصنف</th>
                      <th className="p-2 border border-black text-center">الكمية</th>
                      <th className="p-2 border border-black text-center">عدد الحالات</th>
                      <th className="p-2 border border-black text-center">سعر الوحدة</th>
                      <th className="p-2 border border-black text-center">القيمة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayHistory.map((reg) => (
                      <tr key={reg.id} className="border-b border-black">
                        <td className="p-2 border border-black font-bold">{reg.name}</td>
                        <td className="p-2 border border-black text-center">{reg.quantity} {reg.unit}</td>
                        <td className="p-2 border border-black text-center">{reg.cases_count}</td>
                        <td className="p-2 border border-black text-center">{parseFloat(reg.price || 0).toFixed(2)}</td>
                        <td className="p-2 border border-black text-center font-bold">{parseFloat(reg.cost || 0).toFixed(2)} ج.م</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="font-bold border-t border-black">
                      <td className="p-2 text-right">المدعم ({stats.filteredByType.subsidized.count} سجل):</td>
                      <td className="p-2 text-center border border-black">{stats.filteredByType.subsidized.qty.toLocaleString()}</td>
                      <td className="p-2 text-center border border-black">{stats.filteredByType.subsidized.cases.toLocaleString()}</td>
                      <td className="p-2 border border-black"></td>
                      <td className="p-2 text-center border border-black">{stats.filteredByType.subsidized.cost.toLocaleString()} ج.م</td>
                    </tr>
                    <tr className="font-bold border-t border-black">
                      <td className="p-2 text-right">المجاني ({stats.filteredByType.free.count} سجل):</td>
                      <td className="p-2 text-center border border-black">{stats.filteredByType.free.qty.toLocaleString()}</td>
                      <td className="p-2 text-center border border-black">{stats.filteredByType.free.cases.toLocaleString()}</td>
                      <td className="p-2 border border-black"></td>
                      <td className="p-2 text-center border border-black">{stats.filteredByType.free.cost.toLocaleString()} ج.م</td>
                    </tr>
                    <tr className="font-bold border-t-2 border-black bg-slate-50">
                      <td className="p-2 text-right">الإجمالي العام ({stats.filtered.count} سجل):</td>
                      <td className="p-2 text-center border border-black">{stats.filtered.qty.toLocaleString()}</td>
                      <td className="p-2 text-center border border-black">{stats.filtered.cases.toLocaleString()}</td>
                      <td className="p-2 border border-black"></td>
                      <td className="p-2 text-center border border-black">{stats.filtered.cost.toLocaleString()} ج.م</td>
                    </tr>
                  </tfoot>
                </table>
              </PrintableTable>
            </div>

            <div className="no-print">
              <Pagination 
                currentPage={currentPage}
                totalPages={totalPages}
                totalRecords={displayHistory.length}
                rowsPerPage={rowsPerPage}
                onPageChange={setCurrentPage}
                onRowsPerPageChange={setRowsPerPage}
              />
            </div>
          </div>
        </div>
      </div>

      <ConfirmModal
        isOpen={!!deleteTarget}
        onConfirm={confirmDeleteHistory}
        onCancel={() => setDeleteTarget(null)}
        title="تأكيد الحذف"
        message="هل أنت متأكد من حذف هذا السجل؟ لا يمكن التراجع عن هذا الإجراء."
        loading={deleteLoading}
      />
    </>
  );
};

export default InsulinDispensingPage;
