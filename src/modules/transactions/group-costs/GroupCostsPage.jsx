import React, { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import PageHeader from "../../../components/ui/PageHeader";
import Breadcrumb from "../../../components/ui/Breadcrumb";
import HierarchySelector from "../../../components/common/HierarchySelector";
import Card from "../../../components/ui/Card";
import Button from "../../../components/ui/Button";
import Input from "../../../components/ui/Input";
import Select from "../../../components/ui/Select";
import AutoComplete from "../../../components/ui/AutoComplete";
import Table from "../../../components/ui/Table";
import { useToast } from "../../../components/ui/Toast";
import { useGlobalApp } from "../../../context/useGlobalApp";
import invoke from "../../../api/tauriApi";
import Modal from "../../../components/ui/Modal";
import {
  Pill,
  DollarSign,
  Save,
  History,
  LayoutGrid,
  ListPlus,
  Search,
  Download,
  ArrowRight,
  Lock,
  Unlock,
  AlertCircle,
  Printer,
  RotateCcw,
} from "lucide-react";
import Pagination from "../../../components/ui/Pagination";
import ConfirmModal from "../../../components/ui/ConfirmModal";
import useKeyboardShortcuts from "../../../hooks/useKeyboardShortcuts";
import PrintableTable from "../../../components/common/PrintableTable";
import { buildHierarchyLabel } from "../../../utils/reportUtils";
import StatsBar from "../../../components/common/StatsBar";
import ExportMenu from "../../../components/ui/ExportMenu";
import { executePrint } from "../../../utils/exportPrint";
import useLockGuard from "../../../hooks/useLockGuard";

const GroupCostsPage = () => {
  const { hierarchyNames, activeHierarchy, workspaceMode, checkIsMonthLocked } = useGlobalApp();
  const toast = useToast();
  const location = useLocation();
  const [hierarchy, setHierarchy] = useState({
    branchId: location.state?.branchId || activeHierarchy.branchId || "",
    areaId: location.state?.areaId || activeHierarchy.areaId || "",
    clinicId: location.state?.clinicId || activeHierarchy.clinicId || "",
    dispenseMonth:
      location.state?.dispenseMonth || activeHierarchy.dispenseMonth || new Date().toISOString().substring(0, 7),
  });

  const [groups, setGroups] = useState([]);
  const [history, setHistory] = useState([]);
  const [, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    id: null,
    groupId: "",
    cost: "",
  });

  const [isBulkMode, setIsBulkMode] = useState(false);
  const [bulkData, setBulkData] = useState([]);
  const [bulkSearch, setBulkSearch] = useState("");
  const [bulkLoading, setBulkLoading] = useState(false);

  // Pagination & Search State
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(50);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterGroup, setFilterGroup] = useState("");
  const [filterLockStatus, setFilterLockStatus] = useState("all");
  const [filterHighValue, setFilterHighValue] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const { isLocked, LockBanner } = useLockGuard(hierarchy.dispenseMonth);

  useKeyboardShortcuts([
    {
      key: "p",
      ctrl: true,
      handler: () => executePrint({ orientation: 'landscape', fontSize: 'md', margins: 'standard', showPageNumbers: true, showSignatures: true }),
      description: "طباعة",
    },
    {
      key: "Escape",
      handler: () => {
        setIsBulkMode(false);
        setFormData({ id: null, groupId: "", cost: "" });
      },
      description: "إلغاء التعديل أو الخروج من الإدخال الجماعي",
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
        if (formData.id) handleDelete({ id: formData.id });
      },
      description: "حذف السجل (أثناء التعديل)",
    },
  ]);

  useEffect(() => {
    loadMetaData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (hierarchy.branchId && !isBulkMode) {
      loadHistory();
    }
  }, [ // eslint-disable-line react-hooks/exhaustive-deps
    hierarchy.branchId,
    hierarchy.areaId,
    hierarchy.clinicId,
    hierarchy.dispenseMonth,
    isBulkMode,
  ]);

  
  const loadMetaData = async () => {
    setLoading(true);
    try {
      const g = await invoke("get_drug_groups");
      setGroups(g);
    } catch (err) {
      toast.error("خطأ في تحميل المجموعات");
    } finally {
      setLoading(false);
    }
  };

   
  const loadHistory = async () => {
    try {
      const records = await invoke("get_exact_drug_groups", {
        branchId: parseInt(hierarchy.branchId),
        areaId: hierarchy.areaId ? parseInt(hierarchy.areaId) : null,
        clinicId: hierarchy.clinicId ? parseInt(hierarchy.clinicId) : null,
        dispenseMonth: hierarchy.dispenseMonth,
      });
      // Map 'name' to 'groupName' to match our Table columns if needed, or just keep as name
      setHistory(records.map((r) => ({ ...r, groupName: r.name })));
    } catch (err) {
      console.error("Failed to load history", err);
    }
  };

  const baselineAvgValue = React.useMemo(() => {
    if (history.length === 0) return 0;
    const total = history.reduce((sum, item) => sum + (parseFloat(item.cost) || 0), 0);
    return total / history.length;
  }, [history]);

  const displayHistory = React.useMemo(() => {
    return history.filter((record) => {
      // Smart Hierarchy Filter (Local)
      if (hierarchy.areaId && record.area_id?.toString() !== hierarchy.areaId.toString()) return false;
      if (hierarchy.clinicId && record.clinic_id?.toString() !== hierarchy.clinicId.toString()) return false;

      // Lock Status Filter
      const isLocked = checkIsMonthLocked(record.dispense_month);
      if (filterLockStatus === 'locked' && !isLocked) return false;
      if (filterLockStatus === 'unlocked' && isLocked) return false;

      // High Value Filter
      if (filterHighValue) {
        if ((parseFloat(record.cost) || 0) <= baselineAvgValue * 2) return false;
      }

      const matchesSearch = record.groupName
        .toLowerCase()
        .includes(searchTerm.toLowerCase());
      const matchesGroup =
        !filterGroup || record.group_code_id?.toString() === filterGroup;
      return matchesSearch && matchesGroup;
    })
    .sort((a, b) => (a.groupName || '').localeCompare(b.groupName || '', 'ar'));
  }, [history, searchTerm, filterGroup, hierarchy.areaId, hierarchy.clinicId, filterLockStatus, filterHighValue, baselineAvgValue, checkIsMonthLocked]);

  const paginatedHistory = React.useMemo(() => {
    const startIndex = (currentPage - 1) * rowsPerPage;
    return displayHistory.slice(startIndex, startIndex + rowsPerPage);
  }, [displayHistory, currentPage, rowsPerPage]);

  const totalPages = Math.ceil(displayHistory.length / rowsPerPage);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterGroup, filterLockStatus, filterHighValue]);

  const statsBarItems = React.useMemo(() => [
    { label: "عدد المجموعات", value: history.length, filteredValue: displayHistory.length, icon: Pill, color: "var(--color-primary)" },
    { label: "إجمالي التكلفة", value: history.reduce((sum, r) => sum + parseFloat(r.cost || 0), 0), filteredValue: displayHistory.reduce((sum, r) => sum + parseFloat(r.cost || 0), 0), icon: DollarSign, color: "var(--color-success)", suffix: " ج.م" },
  ], [history, displayHistory]);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!hierarchy.branchId || !formData.groupId) {
      toast.warning("يرجى ملء جميع الحقول المطلوبة");
      return;
    }
    setSaving(true);
    try {
      const groupName = groups.find(
        (g) => g.id === parseInt(formData.groupId),
      )?.name;
      const payload = {
        id: formData.id,
        name: groupName,
        clinic_id: hierarchy.clinicId ? parseInt(hierarchy.clinicId) : null,
        area_id: hierarchy.areaId ? parseInt(hierarchy.areaId) : null,
        branch_id: hierarchy.branchId ? parseInt(hierarchy.branchId) : null,
        dispense_month: hierarchy.dispenseMonth,
        group_code_id: parseInt(formData.groupId),
        cost: parseFloat(formData.cost) || 0,
      };
      await invoke("save_drug_group_cost", { data: payload });
      toast.success("تم حفظ تكلفة المجموعة بنجاح");
      loadHistory();
      setFormData({ id: null, groupId: "", cost: "" });
    } catch (err) {
      toast.error(`فشل حفظ البيانات: ${err}`);
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (record) => {
    setIsBulkMode(false);
    setFormData({
      id: record.id,
      groupId: record.group_code_id ? String(record.group_code_id) : "",
      cost: String(record.cost),
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDelete = async (record) => {
    if (isLocked) {
      toast.error("هذا الشهر مقفل، لا يمكن حذف السجل");
      return;
    }
    setDeleteTarget(record);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      await invoke("delete_drug_group", { id: deleteTarget.id });
      toast.success("تم حذف السجل بنجاح");
      loadHistory();
    } catch (err) {
      toast.error(`فشل حذف السجل: ${err}`);
    } finally {
      setDeleteLoading(false);
      setDeleteTarget(null);
    }
  };

  const handleLoadBulk = async () => {
    if (!hierarchy.branchId) {
      toast.warning("يرجى اختيار الفرع على الأقل");
      return;
    }
    setBulkLoading(true);
    try {
      const [allCodes, existingRecords] = await Promise.all([
        invoke("get_drug_groups"),
        invoke("get_exact_drug_groups", {
          branchId: parseInt(hierarchy.branchId),
          areaId: hierarchy.areaId ? parseInt(hierarchy.areaId) : null,
          clinicId: hierarchy.clinicId ? parseInt(hierarchy.clinicId) : null,
          dispenseMonth: hierarchy.dispenseMonth,
        }),
      ]);

      if (!Array.isArray(allCodes) || allCodes.length === 0) {
        setBulkData([]);
        toast.info("لا توجد مجموعات مسجلة بعد");
        return;
      }

      const recordsList = Array.isArray(existingRecords) ? existingRecords : [];
      const initialBulk = allCodes.map((code) => {
        const existing = recordsList.find(
          (r) => r.group_code_id === code.id,
        );
        const costStr =
          existing?.cost !== undefined ? String(existing.cost) : "";
        return {
          ...code,
          existingId: existing?.id || null,
          cost: "", // Load empty as requested
          originalCost: costStr,
        };
      });
      setBulkData(initialBulk);
      toast.success("تم تحميل قائمة المجموعات بنجاح");
      // Focus first input after a short delay
      setTimeout(() => {
        const firstInput = document.querySelector('input[type="number"]');
        if (firstInput) firstInput.focus();
      }, 100);
    } catch (err) {
      toast.error("فشل تحميل البيانات");
    } finally {
      setBulkLoading(false);
    }
  };

  const handleResetBulk = () => {
    if (window.confirm("هل أنت متأكد من تفريغ جميع الحقول؟")) {
      setBulkData((prev) => prev.map((item) => ({ ...item, cost: "" })));
    }
  };

  const handleBulkSave = async () => {
    setSaving(true);
    try {
      const payload = bulkData
        .filter((item) => {
          const currentCost = parseFloat(item.cost) || 0;
          const origCost = parseFloat(item.originalCost) || 0;
          return currentCost > 0 && currentCost !== origCost;
        })
        .map((item) => ({
          id: item.existingId,
          name: item.name,
          cost: parseFloat(item.cost) || 0,
          clinic_id: hierarchy.clinicId ? parseInt(hierarchy.clinicId) : null,
          area_id: hierarchy.areaId ? parseInt(hierarchy.areaId) : null,
          branch_id: hierarchy.branchId ? parseInt(hierarchy.branchId) : null,
          dispense_month: hierarchy.dispenseMonth,
          group_code_id: item.id,
        }));

      if (payload.length === 0) {
        toast.info("لا توجد إدخالات أو تعديلات جديدة لحفظها");
        setSaving(false);
        return;
      }

      const result = await invoke("save_drug_group_costs_bulk", {
        data: payload,
      });

      if (result.skipped_names && result.skipped_names.length > 0) {
        toast.warning(
          `تم حفظ ${result.saved_count} بنجاح، وتخطي ${result.skipped_names.length} مجموعة وهي:\n${result.skipped_names.join(" ، ")}`,
          { duration: 8000 },
        );
      } else {
        toast.success(`تم حفظ ${result.saved_count} مجموعة بنجاح.`);
      }

      loadHistory();
      setIsBulkMode(false);
      setBulkData([]);
    } catch (err) {
      toast.error(`فشل الحفظ: ${err}`);
    } finally {
      setSaving(false);
    }
  };

  const filteredBulkData = bulkData.filter(
    (item) =>
      item.name.toLowerCase().includes(bulkSearch.toLowerCase()) ||
      (item.code && String(item.code).includes(bulkSearch)),
  );

  const renderHistoryTable = () => (
    <div className="space-y-4">
      <div className="no-print flex flex-col md:flex-row items-center justify-between gap-4 px-2">
        <div
          className="flex items-center gap-2 font-bold"
          style={{ color: "var(--color-primary)" }}
        >
          <History size={18} />
          <span>آخر التكاليف المسجلة</span>
          <ExportMenu 
            data={displayHistory} 
            columns={[
              { header: "الشهر", accessor: "dispense_month" },
              { 
                header: hierarchy.clinicId ? "العيادة" : hierarchy.areaId ? "المنطقة" : "الفرع", 
                accessor: () => hierarchy.clinicId ? (hierarchyNames.clinic || "") : hierarchy.areaId ? (hierarchyNames.area || "") : (hierarchyNames.branch || "")
              },
              { header: "اسم المجموعة", accessor: "groupName" },
              { header: "التكلفة", accessor: (r) => parseFloat(r.cost || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) },
            ]} 
            options={{ 
              title: 'تكاليف المجموعات', 
              fileName: `group_costs_${hierarchy.dispenseMonth}`,
              hierarchyLabel: `${hierarchy.clinicId ? "العيادة" : hierarchy.areaId ? "المنطقة" : "الفرع"}: ${hierarchy.clinicId ? (hierarchyNames.clinic || "") : hierarchy.areaId ? (hierarchyNames.area || "") : (hierarchyNames.branch || "")} | شهر: ${hierarchy.dispenseMonth}`
            }} 
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 justify-end w-full md:w-auto">
          <select
            className="p-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] text-xs font-bold outline-none text-[var(--color-text)] transition-all min-w-[140px]"
            value={filterGroup}
            onChange={(e) => setFilterGroup(e.target.value)}
          >
            <option value="">جميع المجموعات</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
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

          <div className="relative w-full md:w-48 flex gap-2 items-center">
            <div className="relative flex-1">
              <Search
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                size={14}
              />
              <input
                type="text"
                placeholder="بحث..."
                className="w-full pr-9 pl-4 py-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] text-xs outline-none transition-all font-bold text-[var(--color-text)]"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            {(searchTerm || filterGroup || filterLockStatus !== 'all' || filterHighValue) && (
              <button
                onClick={() => {
                  setSearchTerm("");
                  setFilterGroup("");
                  setFilterLockStatus("all");
                  setFilterHighValue(false);
                }}
                className="p-2 text-red-500 hover:bg-red-50 rounded-xl transition-all"
                title="إلغاء الفلترة"
              >
                <RotateCcw size={14} />
              </button>
            )}
          </div>
        </div>
      </div>
      
      <div className="no-print mb-4">
        <StatsBar stats={statsBarItems} accentColor="var(--color-primary)" />
      </div>

      <Card className="p-0 overflow-hidden shadow-sm border border-[var(--color-border)] print:border-none print:shadow-none">
        <div className="print:hidden">
          <Table
            columns={[
              { header: "الشهر", accessor: "dispense_month" },
              {
                header: hierarchy.clinicId ? "العيادة" : hierarchy.areaId ? "المنطقة" : "الفرع",
                render: () => hierarchy.clinicId ? (hierarchyNames.clinic || "") : hierarchy.areaId ? (hierarchyNames.area || "") : (hierarchyNames.branch || ""),
              },
              { header: "اسم المجموعة", accessor: "groupName" },
              {
                header: "التكلفة",
                accessor: "cost",
                render: (row) => (
                  <span className="font-bold text-emerald-600">
                    {parseFloat(row.cost || 0).toLocaleString()} ج.م
                  </span>
                ),
              },
            ]}
            data={paginatedHistory}
            loading={false}
            onEdit={!isLocked ? handleEdit : undefined}
            onDelete={!isLocked ? handleDelete : undefined}
            footer={
              <tr className="bg-[var(--color-bg-card)] border-t-2 border-[var(--color-border)] font-black text-[var(--color-text)]">
                <td colSpan="3" className="p-4 text-right">
                  الإجمالي المفلتر ({displayHistory.length} سجل):
                </td>
                <td className="p-4 text-emerald-600">
                  {displayHistory
                    .reduce((sum, r) => sum + parseFloat(r.cost || 0), 0)
                    .toLocaleString()}{" "}
                  ج.م
                </td>
              </tr>
            }
          />
        </div>

        {/* Print Only Version (Full Data) */}
        <div className="hidden print:block">
          <PrintableTable
            title="تقرير تكلفة المجموعات الدوائية"              subtitle={`الشهر: ${hierarchy.dispenseMonth}`}
              hierarchyLabel={buildHierarchyLabel(workspaceMode, hierarchyNames)}
          >
            <Table
              columns={[
                { header: "الشهر", accessor: "dispense_month" },
                {
                  header: hierarchy.clinicId ? "العيادة" : hierarchy.areaId ? "المنطقة" : "الفرع",
                  render: () => hierarchy.clinicId ? (hierarchyNames.clinic || "") : hierarchy.areaId ? (hierarchyNames.area || "") : (hierarchyNames.branch || ""),
                },
                { header: "اسم المجموعة", accessor: "groupName" },
                {
                  header: "التكلفة",
                  accessor: "cost",
                  render: (row) => (
                    <span className="font-bold">
                      {parseFloat(row.cost || 0).toLocaleString()} ج.م
                    </span>
                  ),
                },
              ]}
              data={displayHistory}
              footer={
                <tr className="font-black border-t-2 border-black">
                  <td colSpan="3" className="p-2 text-right">
                    الإجمالي العام:
                  </td>
                  <td className="p-2">
                    {displayHistory
                      .reduce((sum, r) => sum + parseFloat(r.cost || 0), 0)
                      .toLocaleString()}{" "}
                    ج.م
                  </td>
                </tr>
              }
            />
          </PrintableTable>
        </div>
        {displayHistory.length === 0 && (
          <div className="p-8 text-center text-sm italic opacity-50 no-print">
            لا توجد سجلات مطابقة للبحث.
          </div>
        )}
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
  );

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="no-print space-y-6">
        <Breadcrumb
          items={[{ label: "العمليات اليومية" }, { label: "تكلفة المجموعات" }]}
        />

        <PageHeader
          title="تكلفة المجموعات الدوائية"
          icon={Pill}
          description="تسجيل التكاليف المالية الإجمالية للمجموعات الدوائية المختلفة."
          actions={
            <Button
              variant="cta"
              icon={ListPlus}
              onClick={() => setIsBulkMode(true)}
            >
              الإدخال الجماعي
            </Button>
          }
        />

        <HierarchySelector
          onSelectionChange={(data) => setHierarchy(prev => ({ ...prev, ...data }))}
          initialBranch={hierarchy.branchId}
          initialArea={hierarchy.areaId}
          initialClinic={hierarchy.clinicId}
          initialMonth={hierarchy.dispenseMonth}
        />

        <LockBanner />
      </div>

      <div className="space-y-6 max-w-5xl mx-auto">
        <div className="no-print">
          <Card className="p-8">
            <form onSubmit={handleSave} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <AutoComplete
                label="المجموعة الدوائية"
                options={groups}
                value={formData.groupId}
                onChange={(val) =>
                  setFormData({ ...formData, groupId: val })
                }
                placeholder="ابحث عن مجموعة دوائية..."
                data-focus="first-input"
                disabled={isLocked}
              />
              <Input
                label="التكلفة الإجمالية"
                type="number"
                step="0.01"
                icon={DollarSign}
                value={formData.cost}
                onChange={(e) =>
                  setFormData({ ...formData, cost: e.target.value })
                }
                required
                disabled={isLocked}
              />
            </div>

            <div className="flex justify-center gap-4 pt-4">
              <Button
                variant="primary"
                type="submit"
                icon={isLocked ? Lock : Save}
                loading={saving}
                disabled={isLocked}
                className="px-12 py-3 text-lg"
              >
                {isLocked
                  ? "الشهر مقفل (4 أشهر)"
                  : formData.id
                    ? "تحديث التكلفة"
                    : "حفظ التكلفة"}
              </Button>
              {formData.id && (
                <Button
                  variant="secondary"
                  type="button"
                  onClick={() =>
                    setFormData({ id: null, groupId: "", cost: "" })
                  }
                  className="px-8 py-3"
                >
                  إلغاء التعديل
                </Button>
              )}
            </div>
          </form>
        </Card>
        </div>

        <div className="pt-4">{renderHistoryTable()}</div>
      </div>

      <Modal
        isOpen={isBulkMode}
        onClose={() => setIsBulkMode(false)}
        title="الإدخال الجماعي لتكلفة المجموعات"
        wide={true}
        maxWidthClass="max-w-4xl"
      >
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)]">
              <p className="text-[10px] font-bold text-[var(--color-text-muted)] mb-1 uppercase tracking-widest">
                الجهة المختارة
              </p>
              <div className="text-sm font-black text-[var(--color-primary)]">
                {hierarchy.clinicId
                  ? hierarchyNames.clinic || "العيادة"
                  : hierarchy.areaId
                    ? hierarchyNames.area || "المنطقة"
                    : hierarchyNames.branch || "الفرع"}
              </div>
            </div>
            <div className="p-4 rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)]">
              <p className="text-[10px] font-bold text-[var(--color-text-muted)] mb-1 uppercase tracking-widest">
                شهر الصرف
              </p>
              <div className="text-sm font-black text-[var(--color-primary)]">
                {hierarchy.dispenseMonth}
              </div>
            </div>
          </div>

          <div className="flex justify-center">
            <Button
              variant="cta"
              icon={Download}
              onClick={handleLoadBulk}
              loading={bulkLoading}
              className="px-12 py-3"
            >
              تحميل قائمة المجموعات
            </Button>
          </div>

          {bulkData.length > 0 && (
            <Card className="p-0 overflow-hidden border-none shadow-lg animate-slideUp">
              <div className="p-4 border-b border-[var(--color-border)] flex items-center justify-between bg-[var(--color-bg-card)]/50">
                <div className="flex items-center gap-2 font-black text-sm">
                  <LayoutGrid
                    size={18}
                    className="text-[var(--color-primary)]"
                  />
                  <span>قائمة المجموعات الدوائية</span>
                </div>
                <div className="relative w-64">
                  <Search
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                    size={16}
                  />
                  <input
                    type="text"
                    placeholder="بحث..."
                    className="w-full pr-10 pl-4 py-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] text-xs focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                    value={bulkSearch}
                    onChange={(e) => setBulkSearch(e.target.value)}
                  />
                </div>
              </div>

              <div className="overflow-x-auto" style={{ maxHeight: "400px" }}>
                <table className="w-full text-right border-collapse">
                  <thead className="sticky top-0 bg-[var(--color-bg)] z-10">
                    <tr className="text-[var(--color-text-muted)] text-[11px] font-black uppercase tracking-tighter border-b border-[var(--color-border)]">
                      <th className="p-3 w-12 text-center">#</th>
                      <th className="p-3 w-20">كود</th>
                      <th className="p-3">اسم المجموعة</th>
                      <th className="p-3 hidden md:table-cell">الوصف</th>
                      <th className="p-3 w-40 text-center">التكلفة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border)]">
                    {filteredBulkData.map((item, index) => (
                      <tr
                        key={item.id}
                        className="hover:bg-[var(--color-primary)]/5 transition-colors group"
                      >
                        <td className="p-3 text-center text-[var(--color-text-muted)] font-mono text-xs">
                          {index + 1}
                        </td>
                        <td className="p-3 font-bold text-[var(--color-text)] text-xs">
                          {item.code || "--"}
                        </td>
                        <td className="p-3">
                          <p className="font-bold text-sm text-[var(--color-text)]">
                            {item.name}
                          </p>
                        </td>
                        <td className="p-3 hidden md:table-cell">
                          <p className="text-[10px] text-[var(--color-text-muted)] max-w-xs">
                            {item.description || "--"}
                          </p>
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-2 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-1.5 focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary transition-all">
                            <input
                              type="number"
                              step="0.01"
                              className="w-full bg-transparent border-none outline-none text-left font-mono font-bold text-sm"
                              value={item.cost}
                              placeholder="0.00"
                              onChange={(e) => {
                                const newData = [...bulkData];
                                const targetIndex = bulkData.findIndex(
                                  (d) => d.id === item.id,
                                );
                                newData[targetIndex].cost = e.target.value;
                                setBulkData(newData);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  const inputs = Array.from(
                                    document.querySelectorAll(
                                      '.modal-content input[type="number"]',
                                    ),
                                  );
                                  const currentIndex = inputs.indexOf(e.target);
                                  if (currentIndex < inputs.length - 1) {
                                    inputs[currentIndex + 1].focus();
                                    inputs[currentIndex + 1].select();
                                  } else {
                                    handleBulkSave();
                                  }
                                }
                              }}
                            />
                            <span className="text-[10px] font-black text-slate-400 shrink-0">
                              ج.م
                            </span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="p-4 bg-[var(--color-bg)] flex justify-end gap-3 border-t border-[var(--color-border)]">
                <Button
                  variant="secondary"
                  icon={RotateCcw}
                  onClick={handleResetBulk}
                  className="px-6 py-2"
                >
                  تفريغ
                </Button>
                <Button
                  variant="primary"
                  icon={isLocked ? Lock : Save}
                  onClick={handleBulkSave}
                  loading={saving}
                  disabled={isLocked}
                  className="px-10 py-2 shadow-md"
                >
                  {isLocked ? "الشهر مقفل" : "حفظ"}
                </Button>
              </div>
            </Card>
          )}
        </div>
      </Modal>

      <ConfirmModal
        isOpen={!!deleteTarget}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
        title="تأكيد الحذف"
        message="هل أنت متأكد من حذف تكلفة هذه المجموعة؟"
        detail={deleteTarget ? deleteTarget.groupName : ""}
        loading={deleteLoading}
      />
    </div>
  );
};

export default GroupCostsPage;
