import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useLocation } from "react-router-dom";
import PageHeader from "../../../components/ui/PageHeader";
import Breadcrumb from "../../../components/ui/Breadcrumb";
import HierarchySelector from "../../../components/common/HierarchySelector";
import Card from "../../../components/ui/Card";
import Button from "../../../components/ui/Button";
import Input from "../../../components/ui/Input";
import Select from "../../../components/ui/Select";
import AutoComplete from "../../../components/ui/AutoComplete";
import { useToast } from "../../../components/ui/Toast";
import invoke from "../../../api/tauriApi";
import {
  ShoppingCart,
  Pill,
  DollarSign,
  Hash,
  Save,
  History,
  Trash2,
  Edit2,
  Search,
  BarChart3,
  Package,
  CheckCircle2,
  Lock,
  Unlock,
  AlertCircle,
  X,
  Printer,
  Users,
  RotateCcw,
  Plus,
  Minus,
  ChevronDown,
} from "lucide-react";
import { useGlobalApp } from "../../../context/useGlobalApp";
import Pagination from "../../../components/ui/Pagination";
import ConfirmModal from "../../../components/ui/ConfirmModal";
import useKeyboardShortcuts from "../../../hooks/useKeyboardShortcuts";
import PrintableTable from "../../../components/common/PrintableTable";
import StatsBar from "../../../components/common/StatsBar";
import ExcelImportWizard from "../../../components/common/ExcelImportWizard";
import ExportMenu from "../../../components/ui/ExportMenu";
import { FileSpreadsheet } from "lucide-react";
import { useAuth } from "../../../context/AuthContext";

const DetailedDrugDispensingPage = () => {
  const toast = useToast();
  const location = useLocation();
  const { user } = useAuth();
  const { activeHierarchy, checkIsMonthLocked } = useGlobalApp();
  const [hierarchy, setHierarchy] = useState({
    branchId: location.state?.branchId || activeHierarchy.branchId || "",
    areaId: location.state?.areaId || activeHierarchy.areaId || "",
    clinicId: location.state?.clinicId || activeHierarchy.clinicId || "",
    dispenseMonth:
      location.state?.dispenseMonth || activeHierarchy.dispenseMonth || new Date().toISOString().substring(0, 7),
  });

  const [categories, setCategories] = useState([]);
  const [drugs, setDrugs] = useState([]);
  const [filteredDrugs, setFilteredDrugs] = useState([]);
  const [history, setHistory] = useState([]);
  const [, setLoading] = useState(false);
  const [savingAll, setSavingAll] = useState(false);
  const [subList, setSubList] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterLockStatus, setFilterLockStatus] = useState("all");
  const [filterHighValue, setFilterHighValue] = useState(false);
  const [previousPrices, setPreviousPrices] = useState([]);

  // Edit State
  const [editingId, setEditingId] = useState(null);
  const [editFormData, setEditFormData] = useState({});

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(50);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Form State
  const [entryMode, setEntryMode] = useState("manual"); // 'manual' | 'excel'
  const [formData, setFormData] = useState({
    categoryId: "",
    drugId: "",
    quantity: "",
    casesCount: "",
    unitPrice: "",
    totalCost: 0,
  });

  const resetForm = () => {
    setFormData({
      categoryId: formData.categoryId,
      drugId: "",
      quantity: "",
      casesCount: "",
      unitPrice: "",
      totalCost: 0,
    });
    setEditingId(null);
    toast.info("تم تصفير البيانات");
  };

  useKeyboardShortcuts([
    {
      key: "p",
      ctrl: true,
      handler: () => window.print(),
      description: "طباعة",
    },
    {
      key: "Escape",
      handler: () => {
        setEditingId(null);
        resetForm();
      },
      description: "إلغاء التعديل / تفريغ الخانات",
    },
    {
      key: "r",
      alt: true,
      handler: () => resetForm(),
      description: "تفريغ الخانات",
    },
    {
      key: "n",
      alt: true,
      handler: () =>
        document.querySelector('[data-focus="first-input"]')?.focus(),
      description: "سجل جديد",
    },
    {
      key: "Delete",
      ctrl: true,
      allowInInput: true,
      handler: () => {
        if (editingId) handleDeleteRecord(editingId);
      },
      description: "حذف السجل (أثناء التعديل)",
    },
  ]);

  useEffect(() => {
    loadMetaData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

   
  useEffect(() => {
    if (hierarchy.branchId && hierarchy.dispenseMonth && drugs.length > 0) {
      loadHistory();
    }
  }, [ // eslint-disable-line react-hooks/exhaustive-deps
    hierarchy.branchId,
    hierarchy.areaId,
    hierarchy.clinicId,
    hierarchy.dispenseMonth,
    drugs,
  ]);

  useEffect(() => {
    if (formData.categoryId) {
      setFilteredDrugs(
        drugs
          .filter((d) => d.category_id === parseInt(formData.categoryId))
          .sort((a, b) => a.name.localeCompare(b.name, 'ar')),
      );
    } else {
      setFilteredDrugs([]);
    }
  }, [formData.categoryId, drugs]);

  useEffect(() => {
    const q = parseFloat(formData.quantity) || 0;
    const p = parseFloat(formData.unitPrice) || 0;
    setFormData((prev) => ({ ...prev, totalCost: (q * p).toFixed(2) }));
  }, [formData.quantity, formData.unitPrice]);

   
  const loadMetaData = async () => {
    setLoading(true);
    try {
      const [cats, allDrugs] = await Promise.all([
        invoke("get_drug_categories"),
        invoke("get_drugs"),
      ]);
      setCategories(cats);
      setDrugs(allDrugs);
    } catch (err) {
      toast.error("خطأ في تحميل البيانات الأساسية");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (formData.drugId) {
      invoke("get_drug_previous_prices", { drugId: parseInt(formData.drugId) })
        .then((data) => {
          // Fuzzy grouping: round to 2 decimals and unique
          const uniquePrices = [
            ...new Set(data.map((p) => parseFloat(p).toFixed(2))),
          ];
          setPreviousPrices(uniquePrices);
        })
        .catch((err) => console.error("Failed to load prices:", err));
    } else {
      setPreviousPrices([]);
    }
  }, [formData.drugId]);

   
  const loadHistory = async () => {
    if (!hierarchy.branchId || !hierarchy.dispenseMonth) {
      setHistory([]);
      return;
    }
    try {
      const records = await invoke("get_detailed_drug_dispensed", {
        branchId: parseInt(hierarchy.branchId),
        areaId: null,
        clinicId: null,
        dispenseMonth: hierarchy.dispenseMonth,
      });

      const mappedHistory = records.map((reg) => {
        const drug = drugs.find((d) => String(d.id) === String(reg.drug_id));
        const category = categories.find(
          (c) => String(c.id) === String(drug?.category_id),
        );
        return {
          ...reg,
          drugName: drug ? drug.name : "صنف غير معروف",
          categoryName: category ? category.name : "بدون تصنيف",
          categoryId: category ? category.id : null,
          total_cost: reg.total_cost.toFixed(2),
        };
      });
      setHistory(mappedHistory);
    } catch (err) {
      console.error("Failed to load history:", err);
    }
  };

  const baselineAvgValue = useMemo(() => {
    if (history.length === 0) return 0;
    const total = history.reduce((sum, item) => sum + (parseFloat(item.total_cost) || 0), 0);
    return total / history.length;
  }, [history]);

  // --- Search Filtering ---
  const displayHistory = useMemo(() => {
    return history
      .filter((reg) => {
        // Smart Hierarchy Filter (Local)
        if (hierarchy.areaId && reg.area_id?.toString() !== hierarchy.areaId.toString()) return false;
        if (hierarchy.clinicId && reg.clinic_id?.toString() !== hierarchy.clinicId.toString()) return false;

        // Lock Status Filter
        const isLocked = checkIsMonthLocked(reg.dispense_month);
        if (filterLockStatus === 'locked' && !isLocked) return false;
        if (filterLockStatus === 'unlocked' && isLocked) return false;

        // High Value Filter
        if (filterHighValue) {
          if ((parseFloat(reg.total_cost) || 0) <= baselineAvgValue * 2) return false;
        }

        const matchesSearch = reg.drugName
          .toLowerCase()
          .includes(searchTerm.toLowerCase());
        const matchesCategory =
          filterCategory === "" ||
          reg.categoryId?.toString() === filterCategory.toString();
        return matchesSearch && matchesCategory;
      })
      .sort((a, b) => {
        const catCmp = (a.categoryName || '').localeCompare(b.categoryName || '', 'ar');
        if (catCmp !== 0) return catCmp;
        return (a.drugName || '').localeCompare(b.drugName || '', 'ar');
      });
  }, [history, searchTerm, filterCategory, hierarchy.areaId, hierarchy.clinicId, filterLockStatus, filterHighValue, baselineAvgValue, checkIsMonthLocked]);

  const paginatedHistory = useMemo(() => {
    const startIndex = (currentPage - 1) * rowsPerPage;
    return displayHistory.slice(startIndex, startIndex + rowsPerPage);
  }, [displayHistory, currentPage, rowsPerPage]);

  const groupedRows = useMemo(() => {
    let prevCat = '';
    const rows = [];
    // Count items per category
    const groupCounts = {};
    paginatedHistory.forEach(reg => {
      const key = reg.categoryName || '';
      groupCounts[key] = (groupCounts[key] || 0) + 1;
    });
    paginatedHistory.forEach((reg) => {
      const cat = reg.categoryName || '';
      const isCollapsed = collapsedGroups.has(cat);
      if (cat && cat !== prevCat) {
        rows.push(
          <tr key={'cat-' + cat} className="bg-[var(--color-primary)]/10 border-y-2 border-[var(--color-primary)]/30">
            <td colSpan={6} className="px-4 py-2 font-bold text-xs" style={{ color: 'var(--color-primary)' }}>
              <div className="flex items-center gap-2">
                <div className="w-1 h-5 rounded-full" style={{ background: 'var(--color-primary)' }} />
                <span>{cat}</span>
                <span className="text-[10px] opacity-50">(تصنيف)</span>
                <span className="text-[10px] opacity-70 mr-1 bg-[var(--color-primary)]/10 px-2 py-0.5 rounded-full font-mono" style={{ color: 'var(--color-primary)' }}>{groupCounts[cat]}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); toggleGroup(cat); }}
                  className="mr-auto p-1 rounded-lg hover:bg-[var(--color-primary)]/20 transition-all cursor-pointer"
                  style={{ color: 'var(--color-primary)' }}
                  title={isCollapsed ? 'إظهار الأدوية' : 'إخفاء الأدوية'}
                  type="button"
                >
                  {isCollapsed ? <Plus size={14} /> : <Minus size={14} />}
                </button>
              </div>
            </td>
          </tr>
        );
        prevCat = cat;
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
              <p className="font-bold text-[var(--color-text)]">{reg.drugName}</p>
            </div>
            <p className="text-[10px] text-[var(--color-text-muted)]">{reg.categoryName}</p>
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
              <span>{reg.quantity}</span>
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
              <span>{reg.unit_price} ج.م</span>
            )}
          </td>
          <td className="p-4 text-center font-black text-emerald-600">
            {isEditing ? editFormData.totalCost : reg.total_cost} ج.م
          </td>
          <td className="p-4 no-print">
            <div className="flex items-center justify-center gap-2">
              {isEditing ? (
                <>
                  <button onClick={() => handleUpdateEdit(reg.id)} className="p-1 text-emerald-500 hover:bg-emerald-50 rounded transition-all"><Save size={18} /></button>
                  <button onClick={() => setEditingId(null)} className="p-1 text-slate-400 hover:bg-slate-50 rounded transition-all"><X size={18} /></button>
                </>
              ) : (
                <>
                  <button disabled={isLocked} onClick={() => startEdit(reg)} className={`p-1.5 rounded transition-all ${isLocked ? "text-slate-200 cursor-not-allowed" : "text-blue-500 hover:bg-blue-50"}`} title="تعديل"><Edit2 size={18} /></button>
                  <button disabled={isLocked} onClick={() => handleDeleteRecord(reg.id)} className={`p-1.5 rounded transition-all ${isLocked ? "text-slate-200 cursor-not-allowed" : "text-red-500 hover:bg-red-50"}`} title="حذف"><Trash2 size={18} /></button>
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

  // ── Collapse/Expand Groups ────────────────────────────────────────────
  const STORAGE_KEY = 'collapsed-drug-dispensing';
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

  // Export columns for history table
  const exportColumns = useMemo(() => [
    { header: "الصنف", accessor: "drugName" },
    { header: "التصنيف", accessor: "categoryName" },
    { header: "الكمية", accessor: (row) => row.quantity?.toString() || "0" },
    { header: "عدد الحالات", accessor: (row) => row.cases_count?.toString() || "0" },
    { header: "سعر الوحدة", accessor: (row) => parseFloat(row.unit_price || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) },
    { header: "الإجمالي", accessor: (row) => parseFloat(row.total_cost || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) },
    { header: "الشهر", accessor: "dispense_month" },
  ], []);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterCategory, filterLockStatus, filterHighValue]);

  // --- Statistics for Dashboard ---
  const stats = useMemo(() => {
    const calc = (data) => ({
      totalCost: data.reduce((sum, item) => sum + parseFloat(item.total_cost || 0), 0),
      distinctDrugs: new Set(data.map((item) => item.drug_id)).size,
      totalQty: data.reduce((sum, item) => sum + (parseFloat(item.quantity) || 0), 0),
      totalCases: data.reduce((sum, item) => sum + (parseInt(item.cases_count) || 0), 0),
      count: data.length
    });
    
    return {
      all: calc(history),
      filtered: calc(displayHistory)
    };
  }, [history, displayHistory]);

  const statsBarItems = useMemo(
    () => [
      {
        label: "إجمالي التكلفة",
        value: stats.all.totalCost,
        filteredValue: stats.filtered.totalCost,
        icon: DollarSign,
        color: "var(--color-success)",
        suffix: " ج.م",
      },
      {
        label: "عدد الأصناف",
        value: stats.all.distinctDrugs,
        filteredValue: stats.filtered.distinctDrugs,
        icon: Package,
        color: "var(--color-primary)",
      },
      {
        label: "إجمالي الحالات",
        value: stats.all.totalCases,
        filteredValue: stats.filtered.totalCases,
        icon: Users,
        color: "var(--color-warning)",
      },
      {
        label: "إجمالي الكميات",
        value: stats.all.totalQty,
        filteredValue: stats.filtered.totalQty,
        icon: Hash,
        color: "var(--color-accent-cyan)",
      },
    ],
    [stats],
  );

  const handleAddToSubList = (e) => {
    e.preventDefault();
    if (!hierarchy.branchId) {
      toast.warning("يرجى اختيار الفرع");
      return;
    }
    if (!formData.drugId) {
      toast.warning("يرجى اختيار الدواء");
      return;
    }
    if (!formData.quantity || !formData.unitPrice) {
      toast.warning("يرجى إدخال الكمية وسعر الوحدة");
      return;
    }

    // Duplicate Check: same item, same price
    const isDuplicate =
      subList.some(
        (item) =>
          item.drugId === formData.drugId &&
          parseFloat(item.unitPrice).toFixed(2) ===
            parseFloat(formData.unitPrice).toFixed(2),
      ) ||
      history.some(
        (item) =>
          item.drug_id === parseInt(formData.drugId) &&
          parseFloat(item.unit_price).toFixed(2) ===
            parseFloat(formData.unitPrice).toFixed(2),
      );

    if (isDuplicate) {
      toast.error(
        "يوجد ادخال سابق للصنف بنفس السعر يمكنك مراجعة الصنف والتعديل عليه",
      );
      return;
    }

    const drugName = drugs.find(
      (d) => d.id === parseInt(formData.drugId),
    )?.name;
    const categoryName = categories.find(
      (c) => c.id === parseInt(formData.categoryId),
    )?.name;

    const newItem = {
      id: Date.now(),
      ...formData,
      drugName,
      categoryName,
    };

    setSubList([...subList, newItem]);

    setFormData({
      categoryId: formData.categoryId,
      drugId: "",
      quantity: "",
      casesCount: "",
      unitPrice: "",
      totalCost: 0,
    });
  };

  const handleCopyPreviousMonth = async () => {
    if (!hierarchy.branchId) {
      toast.warning("يرجى اختيار الفرع على الأقل");
      return;
    }
    
    // Calculate previous month
    const currentMonth = hierarchy.dispenseMonth;
    const [year, month] = currentMonth.split("-").map(Number);
    const d = new Date(year, month - 1, 1);
    d.setMonth(d.getMonth() - 1);
    const prevMonthStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

    try {
      const records = await invoke("get_detailed_drug_dispensed", {
        branchId: parseInt(hierarchy.branchId),
        areaId: null,
        clinicId: null,
        dispenseMonth: prevMonthStr,
      });

      // Local filtering to match exact selected hierarchy
      const filtered = records.filter(reg => {
        if (hierarchy.areaId && reg.area_id?.toString() !== hierarchy.areaId.toString()) return false;
        if (hierarchy.clinicId && reg.clinic_id?.toString() !== hierarchy.clinicId.toString()) return false;
        return true;
      });

      if (filtered.length === 0) {
        toast.info(`لا توجد بيانات للشهر السابق (${prevMonthStr}) لهذه الجهة`);
        return;
      }

      // Convert to subList format
      const newItems = [];
      let duplicateCount = 0;
      
      filtered.forEach(reg => {
        // Check if already in subList
        const isDuplicate = subList.some(item => 
          String(item.drugId) === String(reg.drug_id) && 
          parseFloat(item.unitPrice).toFixed(2) === parseFloat(reg.unit_price).toFixed(2)
        );
        
        if (!isDuplicate) {
          const drug = drugs.find((d) => String(d.id) === String(reg.drug_id));
          const category = categories.find((c) => String(c.id) === String(drug?.category_id));
          
          newItems.push({
            id: Date.now() + Math.random(),
            categoryId: category ? category.id : "",
            drugId: reg.drug_id,
            drugName: drug ? drug.name : "صنف غير معروف",
            categoryName: category ? category.name : "بدون تصنيف",
            quantity: reg.quantity, // copy previous quantity
            casesCount: reg.cases_count,
            unitPrice: reg.unit_price,
            totalCost: reg.total_cost,
          });
        } else {
          duplicateCount++;
        }
      });

      if (newItems.length > 0) {
        setSubList(prev => [...prev, ...newItems]);
        toast.success(`تم نسخ ${newItems.length} صنف من الشهر السابق بنجاح`);
      } else if (duplicateCount > 0) {
        toast.info("جميع الأصناف موجودة بالفعل في القائمة الحالية");
      }
      
    } catch (err) {
      toast.error(`خطأ أثناء النسخ: ${err}`);
    }
  };

  const handleSaveAll = async () => {
    if (subList.length === 0) return;
    setSavingAll(true);
    let errorCount = 0;
    let lastError = "";

    try {
      for (const item of subList) {
        try {
          const payload = {
            branchId: parseInt(hierarchy.branchId),
            areaId: hierarchy.areaId ? parseInt(hierarchy.areaId) : null,
            clinicId: hierarchy.clinicId ? parseInt(hierarchy.clinicId) : null,
            dispenseMonth: hierarchy.dispenseMonth,
            drugId: parseInt(item.drugId),
            quantity: parseFloat(item.quantity),
            casesCount: parseInt(item.casesCount),
            unitPrice: parseFloat(item.unitPrice),
            totalCost: parseFloat(item.totalCost),
          };
          await invoke("save_detailed_drug_dispensed", payload);
        } catch (err) {
          errorCount++;
          lastError = err;
        }
      }

      if (errorCount > 0) {
        if (errorCount === subList.length) {
          toast.error(`فشل الحفظ: ${lastError}`);
        } else {
          toast.warning(`تم حفظ البعض، وفشل ${errorCount} أصناف: ${lastError}`);
        }
      } else {
        toast.success("تم حفظ القائمة بالسجلات بنجاح!");
        
        await invoke('log_frontend_action', {
          userId: user ? user.id : null,
          action: 'BULK_UPDATE',
          tableName: 'detailed_drug_dispensed',
          recordId: null,
          details: `تم حفظ ${subList.length} سجلات صرف أدوية تفصيلية لفرع ${hierarchy.branchId} شهر ${hierarchy.dispenseMonth}`
        });

        setSubList([]);
        setFormData({
          categoryId: formData.categoryId,
          drugId: "",
          quantity: "",
          casesCount: "",
          unitPrice: "",
          totalCost: "0.00",
        });
      }

      await loadHistory();
    } catch (err) {
      toast.error("حدث خطأ غير متوقع.");
    } finally {
      setSavingAll(false);
    }
  };

  const handleDeleteRecord = async (id) => {
    setDeleteTarget(id);
  };

  const confirmDeleteRecord = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      await invoke("delete_detailed_drug_dispensed", { id: deleteTarget });
      
      await invoke('log_frontend_action', {
        userId: user ? user.id : null,
        action: 'DELETE',
        tableName: 'detailed_drug_dispensed',
        recordId: deleteTarget.toString(),
        details: `حذف سجل صرف دواء تفصيلي برقم ${deleteTarget}`
      });

      toast.success("تم حذف السجل");
      await loadHistory();
    } catch (err) {
      toast.error(`فشل الحذف: ${err}`);
    } finally {
      setDeleteLoading(false);
      setDeleteTarget(null);
    }
  };

  const startEdit = (record) => {
    setEditingId(record.id);
    setEditFormData({
      quantity: record.quantity,
      casesCount: record.cases_count,
      unitPrice: record.unit_price,
      totalCost: (record.quantity * record.unit_price).toFixed(2),
    });
  };

  const handleUpdateEdit = async (id) => {
    try {
      await invoke("update_detailed_drug_dispensed", {
        id,
        quantity: parseFloat(editFormData.quantity),
        casesCount: parseInt(editFormData.casesCount),
        unitPrice: parseFloat(editFormData.unitPrice),
        totalCost: parseFloat(editFormData.totalCost),
      });

      await invoke('log_frontend_action', {
        userId: user ? user.id : null,
        action: 'UPDATE',
        tableName: 'detailed_drug_dispensed',
        recordId: id.toString(),
        details: `تعديل سجل صرف دواء تفصيلي برقم ${id}: كمية=${editFormData.quantity}، حالات=${editFormData.casesCount}، سعر=${editFormData.unitPrice}`
      });

      toast.success("تم التعديل بنجاح");
      setEditingId(null);
      await loadHistory();
    } catch (err) {
      toast.error(`فشل التعديل: ${err}`);
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="no-print space-y-6">
        <Breadcrumb
          items={[
            { label: "عمليات الصرف" },
            { label: "صرف الأدوية (التفصيلي)" },
          ]}
        />

        <PageHeader
          title="صرف الأدوية (التفصيلي)"
          icon={ShoppingCart}
          description="تسجيل منصرف الأدوية بالتفصيل لكل صنف على حدة."
        />

        <HierarchySelector
          onSelectionChange={(data) => setHierarchy({ ...hierarchy, ...data })}
          initialBranch={hierarchy.branchId}
          initialArea={hierarchy.areaId}
          initialClinic={hierarchy.clinicId}
          initialMonth={hierarchy.dispenseMonth}
        />

        <div className="flex bg-[var(--color-bg-card)] p-1 rounded-xl border border-[var(--color-border)] self-start max-w-xs">
          <button
            onClick={() => setEntryMode('manual')}
            className={`flex-1 px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 ${entryMode === 'manual' ? 'bg-[var(--color-primary)] text-white shadow-md' : 'text-[var(--color-text-muted)] hover:bg-[var(--color-border)]'}`}
          >
            <ShoppingCart size={14} /> إدخال يدوي
          </button>
          <button
            onClick={() => setEntryMode('excel')}
            className={`flex-1 px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 ${entryMode === 'excel' ? 'bg-[var(--color-primary)] text-white shadow-md' : 'text-[var(--color-text-muted)] hover:bg-[var(--color-border)]'}`}
          >
            <FileSpreadsheet size={14} /> استيراد من Excel
          </button>
        </div>
      </div>

      <div className="no-print space-y-6 max-w-5xl mx-auto">
        {entryMode === 'excel' ? (
          <Card className="p-6 h-full shadow-sm">
            <h3 className="text-xl font-bold flex items-center gap-2 text-[var(--color-primary)] mb-6">
              <FileSpreadsheet size={24} />
              استيراد صرف الأدوية التفصيلي من Excel
            </h3>
            <ExcelImportWizard
              importType="detailed_drugs"
              hierarchyContext={hierarchy}
              onImportComplete={loadHistory}
            />
          </Card>
        ) : (
          <Card className="p-6 h-full shadow-sm">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold flex items-center gap-2 text-[var(--color-primary)]">
                <Pill size={24} />
                أدخل بيانات الصنف
              </h3>
              <Button
                variant="secondary"
                type="button"
                icon={History}
                onClick={handleCopyPreviousMonth}
                disabled={checkIsMonthLocked(hierarchy.dispenseMonth) || !hierarchy.branchId}
                className="text-xs px-4"
              >
                نسخ من الشهر السابق
              </Button>
            </div>
            <form onSubmit={handleAddToSubList} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Select
                  label="تصنيف الدواء"
                  options={categories.map((c) => ({
                    value: c.id,
                    label: c.name,
                  }))}
                  value={formData.categoryId}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      categoryId: e.target.value,
                      drugId: "",
                    })
                  }
                  required
                  data-focus="first-input"
                />
                <AutoComplete
                  label="الدواء"
                  options={filteredDrugs}
                  value={formData.drugId}
                  onChange={(val) =>
                    setFormData({ ...formData, drugId: val })
                  }
                  placeholder="ابحث عن دواء..."
                  disabled={!formData.categoryId}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Input
                  label="الكمية المنصرفة"
                  type="number"
                  step="0.01"
                  icon={Hash}
                  value={formData.quantity}
                  onChange={(e) =>
                    setFormData({ ...formData, quantity: e.target.value })
                  }
                  required
                />
                <Input
                  label="عدد الحالات"
                  type="number"
                  icon={Hash}
                  value={formData.casesCount}
                  onChange={(e) =>
                    setFormData({ ...formData, casesCount: e.target.value })
                  }
                  required
                />
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="field-label mb-0">
                      <DollarSign size={16} />
                      <span>سعر الوحدة</span>
                    </label>
                    {previousPrices.length > 0 && (
                      <select
                        className="text-[10px] font-bold text-primary bg-primary/5 border-none outline-none rounded px-1 cursor-pointer"
                        onChange={(e) => {
                          if (e.target.value) {
                            const p = parseFloat(e.target.value);
                            setFormData({
                              ...formData,
                              unitPrice: p,
                              totalCost: (
                                parseFloat(formData.quantity || 0) * p
                              ).toFixed(2),
                            });
                          }
                        }}
                        value=""
                      >
                        <option value="" disabled>
                          أسعار سابقة...
                        </option>
                        {previousPrices.map((price) => (
                          <option key={price} value={price}>
                            {price} ج.م
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.unitPrice}
                    onChange={(e) =>
                      setFormData({ ...formData, unitPrice: e.target.value })
                    }
                    required
                    inputClassName="py-3"
                  />
                </div>
              </div>

              <div
                className="flex items-center justify-between p-4 rounded-2xl shadow-inner border"
                style={{
                  backgroundColor: "var(--color-accent-cyan-bg)",
                  borderColor: "var(--color-accent-cyan)",
                  color: "var(--color-accent-cyan)",
                }}
              >
                <span className="text-sm font-bold">
                  إجمالي التكلفة المتوقع:
                </span>
                <span className="text-2xl font-black">
                  {formData.totalCost} ج.م
                </span>
              </div>

              <div className="flex gap-4">
                <Button
                  variant="secondary"
                  type="button"
                  icon={RotateCcw}
                  onClick={resetForm}
                  className="px-8"
                >
                  تفريغ
                </Button>
                <Button
                  variant="ghost"
                  type="submit"
                  icon={
                    checkIsMonthLocked(hierarchy.dispenseMonth)
                      ? Lock
                      : ShoppingCart
                  }
                  disabled={
                    checkIsMonthLocked(hierarchy.dispenseMonth)
                  }
                  className="flex-1 py-4 text-lg border-2 border-dashed border-primary text-primary hover:bg-primary hover:text-white transition-all shadow-sm"
                >
                  {checkIsMonthLocked(hierarchy.dispenseMonth)
                    ? "الشهر مقفل"
                    : "إضافة للقائمة الفرعية"}
                </Button>
              </div>
              </form>
            </Card>
        )}

        {/* Sub List Card */}
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
                    <th className="p-3 font-bold text-slate-600 dark:text-slate-400">
                      التصنيف
                    </th>
                    <th className="p-3 font-bold text-slate-600 dark:text-slate-400">
                      الدواء
                    </th>
                    <th className="p-3 font-bold text-slate-600 dark:text-slate-400">
                      الكمية
                    </th>
                    <th className="p-3 font-bold text-slate-600 dark:text-slate-400">
                      الحالات
                    </th>
                    <th className="p-3 font-bold text-slate-600 dark:text-slate-400">
                      التكلفة
                    </th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {subList.map((item) => (
                    <tr
                      key={item.id}
                      className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50/50 dark:hover:bg-slate-900/20"
                    >
                      <td className="p-3 text-sm text-slate-500 dark:text-slate-400">
                        {item.categoryName}
                      </td>
                      <td className="p-3 font-bold text-primary">
                        {item.drugName}
                      </td>
                      <td className="p-3 font-bold text-[var(--color-text)]">
                        {item.quantity}
                      </td>
                      <td className="p-3 font-bold text-[var(--color-text)]">
                        {item.casesCount}
                      </td>
                      <td
                        className="p-3 font-black"
                        style={{ color: "var(--color-success)" }}
                      >
                        {item.totalCost} ج.م
                      </td>
                      <td className="p-3 text-left">
                        <button
                          onClick={() =>
                            setSubList(subList.filter((s) => s.id !== item.id))
                          }
                          className="text-red-500 hover:text-white hover:bg-red-500 p-2 rounded-lg transition-all"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <Button
                onClick={() => setSubList([])}
                variant="ghost"
                className="text-red-500 hover:bg-red-50"
              >
                إلغاء الكل
              </Button>
              <Button
                variant="primary"
                icon={
                  checkIsMonthLocked(hierarchy.dispenseMonth)
                    ? Lock
                    : Save
                }
                className="flex-1 py-4 rounded-2xl shadow-xl"
                loading={savingAll}
                disabled={
                  checkIsMonthLocked(hierarchy.dispenseMonth)
                }
                onClick={handleSaveAll}
              >
                {checkIsMonthLocked(hierarchy.dispenseMonth)
                  ? "الشهر مقفل"
                  : "✓ اعتماد وحفظ قائمة الصرف"}
              </Button>
            </div>
          </Card>
        )}
      </div>

      {/* History Section */}
      <div className="space-y-4">
        <div className="no-print flex flex-col md:flex-row items-center justify-between gap-4 px-2">
          <div className="flex items-center gap-2 text-slate-700 font-bold text-lg">
            <History size={22} className="text-primary" />
            <span>سجلات الصرف المحفوظة</span>

            <ExportMenu 
              data={displayHistory} 
              columns={exportColumns} 
              options={{ 
                title: 'سجلات صرف الأدوية التفصيلية', 
                fileName: `drug_dispensing_${hierarchy.dispenseMonth}`
              }} 
            />
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto justify-end">
            <select
              className="p-2 rounded-xl border border-[var(--color-border)] text-xs font-bold bg-[var(--color-bg-card)] text-[var(--color-text)] outline-none"
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
            >
              <option value="">كل التصنيفات</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>

            {/* Smart Filters */}
            <div className="flex items-center gap-2 px-2 border-r border-l border-[var(--color-border)] mx-1">
              <button
                onClick={() => setFilterLockStatus(prev => prev === 'all' ? 'unlocked' : prev === 'unlocked' ? 'locked' : 'all')}
                className={`p-2 rounded-xl border transition-all flex items-center gap-2 text-xs font-bold ${
                  filterLockStatus === 'locked' ? 'bg-amber-500 text-white border-transparent' :
                  filterLockStatus === 'unlocked' ? 'bg-emerald-500 text-white border-transparent' :
                  'bg-[var(--color-bg)] text-[var(--color-text-muted)] border-[var(--color-border)] hover:bg-slate-50'
                }`}
                title={filterLockStatus === 'locked' ? 'عرض السجلات المقفلة فقط' : filterLockStatus === 'unlocked' ? 'عرض السجلات المفتوحة فقط' : 'كل الحالات'}
              >
                {filterLockStatus === 'locked' ? <Lock size={14} /> : <Unlock size={14} />}
              </button>

              <button
                onClick={() => setFilterHighValue(!filterHighValue)}
                className={`p-2 rounded-xl border transition-all flex items-center gap-2 text-xs font-bold ${
                  filterHighValue ? 'bg-red-500 text-white border-transparent shadow-lg shadow-red-500/20' :
                  'bg-[var(--color-bg)] text-[var(--color-text-muted)] border-[var(--color-border)] hover:bg-slate-50'
                }`}
                title="عرض السجلات ذات القيمة المرتفعة (تنبيه مالي)"
              >
                <AlertCircle size={14} />
              </button>
            </div>

            {/* Collapse/Expand All Button */}
            <button
              onClick={() => {
                const cats = [...new Set(paginatedHistory.map(r => r.categoryName || '').filter(Boolean))];
                const allCollapsed = cats.every(c => collapsedGroups.has(c));
                if (allCollapsed) {
                  setCollapsedGroups(new Set());
                } else {
                  setCollapsedGroups(new Set(cats));
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

            <div className="relative w-full md:w-64">
              <Search
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                size={14}
              />
              <input
                type="text"
                placeholder="ابحث باسم الدواء..."
                className="w-full pr-10 pl-4 py-2 rounded-xl border border-[var(--color-border)] outline-none text-xs transition-all bg-[var(--color-bg-card)] text-[var(--color-text)] font-bold"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="no-print mb-4">
          <StatsBar stats={statsBarItems} accentColor="var(--color-primary)" />
        </div>

        <Card className="p-0 overflow-hidden shadow-sm print:border-none print:shadow-none">
          {/* Paginated Version (Visible on Screen, Hidden on Print) */}
          <div className="print:hidden">
            <PrintableTable
              title="تقرير صرف الأدوية التفصيلي"
              subtitle={`الشهر: ${hierarchy.dispenseMonth}`}
            >
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
                  <tfoot>
                    <tr className="bg-[var(--color-bg-card)] border-t-2 border-[var(--color-border)] font-black text-[var(--color-text)]">
                      <td className="p-4 text-right">
                        الإجمالي المفلتر ({stats.filtered.count} سجل):
                      </td>
                      <td className="p-4 text-center text-primary">
                        {stats.filtered.totalQty.toLocaleString()}
                      </td>
                      <td className="p-4 text-center text-amber-600">
                        {stats.filtered.totalCases.toLocaleString()}
                      </td>
                      <td className="p-4"></td>
                      <td className="p-4 text-center text-[var(--color-success)]">
                        {stats.filtered.totalCost.toLocaleString()} ج.م
                      </td>
                      <td className="p-4"></td>
                    </tr>
                  </tfoot>
                </table>
                {displayHistory.length === 0 && (
                  <div className="p-12 text-center text-slate-400 text-sm italic no-print">
                    لا توجد سجلات مطابقة لهذا الاختيار والبحث.
                  </div>
                )}
              </div>
            </PrintableTable>
          </div>

          {/* Print Only Version (Full Data, Hidden on Screen) */}
          <div className="hidden print:block">
            <PrintableTable
              title="تقرير صرف الأدوية التفصيلي"
              subtitle={`الشهر: ${hierarchy.dispenseMonth} - الفرع: ${
                activeHierarchy.branchName || "جميع الفروع"
              }`}
            >
              <table className="w-full text-right border-collapse border border-black text-[10px]">
                <thead>
                  <tr className="bg-slate-50 border-b border-black">
                    <th className="p-2 border border-black">الصنف</th>
                    <th className="p-2 border border-black text-center">
                      التصنيف
                    </th>
                    <th className="p-2 border border-black text-center">
                      الكمية
                    </th>
                    <th className="p-2 border border-black text-center">
                      الحالات
                    </th>
                    <th className="p-2 border border-black text-center">
                      سعر الوحدة
                    </th>
                    <th className="p-2 border border-black text-center">
                      الإجمالي
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {displayHistory.map((reg) => (
                    <tr key={reg.id} className="border-b border-black">
                      <td className="p-2 border border-black font-bold">
                        {reg.drugName}
                      </td>
                      <td className="p-2 border border-black text-center">
                        {reg.categoryName}
                      </td>
                      <td className="p-2 border border-black text-center">
                        {reg.quantity}
                      </td>
                      <td className="p-2 border border-black text-center">
                        {reg.cases_count}
                      </td>
                      <td className="p-2 border border-black text-center">
                        {reg.unit_price}
                      </td>
                      <td className="p-2 border border-black text-center font-bold">
                        {reg.total_cost}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="font-bold border-t-2 border-black bg-slate-50">
                    <td colSpan={2} className="p-2 text-right">
                      الإجمالي العام:
                    </td>
                    <td className="p-2 text-center border border-black">
                      {stats.filtered.totalQty.toLocaleString()}
                    </td>
                    <td className="p-2 text-center border border-black">
                      {stats.filtered.totalCases.toLocaleString()}
                    </td>
                    <td className="p-2 border border-black"></td>
                    <td className="p-2 text-center border border-black">
                      {stats.filtered.totalCost.toLocaleString()} ج.m
                    </td>
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
        </Card>
      </div>

      <ConfirmModal
        isOpen={!!deleteTarget}
        onConfirm={confirmDeleteRecord}
        onCancel={() => setDeleteTarget(null)}
        title="تأكيد الحذف"
        message="هل أنت متأكد من حذف هذا السجل؟ لا يمكن التراجع."
        loading={deleteLoading}
      />
    </div>
  );
};

export default DetailedDrugDispensingPage;
