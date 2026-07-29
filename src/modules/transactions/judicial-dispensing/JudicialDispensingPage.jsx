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
import Modal from "../../../components/ui/Modal";
import { useToast } from "../../../components/ui/Toast";
import invoke from "../../../api/tauriApi";
import {
  Scale,
  FileText,
  MapPin,
  Calendar,
  Search,
  Trash2,
  Edit2,
  History,
  Filter,
  Save,
  Building2,
  Lock,
  Unlock,
  ChevronDown,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Users,
  Pill,
  Eye,
  Info,
  Clock,
  ClipboardList,
  Edit3,
  Printer,
} from "lucide-react";
import { useGlobalApp } from "../../../context/useGlobalApp";
import Pagination from "../../../components/ui/Pagination";
import ConfirmModal from "../../../components/ui/ConfirmModal";
import useKeyboardShortcuts from "../../../hooks/useKeyboardShortcuts";
import PrintableTable from "../../../components/common/PrintableTable";
import StatsBar from "../../../components/common/StatsBar";
import ExportMenu from "../../../components/ui/ExportMenu";

const JudicialDispensingPage = () => {
  const { activeHierarchy, checkIsMonthLocked } = useGlobalApp();
  const toast = useToast();
  const location = useLocation();
  const [hierarchy, setHierarchy] = useState({
    branchId: location.state?.branchId || activeHierarchy.branchId || "",
    areaId: location.state?.areaId || activeHierarchy.areaId || "",
    clinicId: location.state?.clinicId || activeHierarchy.clinicId || "",
    dispenseMonth:
      location.state?.dispenseMonth || activeHierarchy.dispenseMonth || new Date().toISOString().substring(0, 7),
  });

  const [patients, setPatients] = useState([]);
  const [, setMedicines] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Pagination & Search State
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(50);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterPatient, setFilterPatient] = useState("");
  const [filterMedicine, setFilterMedicine] = useState("");
  const [filterLockStatus, setFilterLockStatus] = useState("all");
  const [filterHighValue, setFilterHighValue] = useState(false);

  const [formData, setFormData] = useState({
    patientId: "",
  });
  const [patientAuthorizedMedicines, setPatientAuthorizedMedicines] = useState(
    [],
  );
  const [loadingAuthorized, setLoadingAuthorized] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [editData, setEditData] = useState({ quantity: "", price: "" });
  const [dispenseQuantities, setDispenseQuantities] = useState({}); // { medicine_id: quantity }
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

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
        setShowEdit(false);
        setShowDetails(false);
      },
      description: "إلغاء التعديل أو إغلاق النافذة",
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
        if (showEdit && selectedRecord) handleDelete(selectedRecord.id);
      },
      description: "حذف السجل (أثناء التعديل)",
    },
  ]);   
  useEffect(() => {
    loadMetaData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  
  const loadMetaData = async () => {
    setLoading(true);
    try {
      const [ps, ms] = await Promise.all([
        invoke("get_judicial_patients"),
        invoke("get_judicial_medicines"),
      ]);
      setPatients(ps);
      setMedicines(ms);
    } catch (err) {
      toast.error("خطأ في تحميل البيانات الأساسية");
    } finally {
      setLoading(false);
    }
  };

  const handlePatientChange = async (val) => {
    const patientId = val;
    setFormData(prev => ({ ...prev, patientId }));
    setPatientAuthorizedMedicines([]);
    setDispenseQuantities({});
    if (!patientId) return;

    setLoadingAuthorized(true);
    try {
      const meds = await invoke("get_patient_medicines", {
        patientId: parseInt(patientId) || 0,
      });
      setPatientAuthorizedMedicines(meds || []);
    } catch (err) {
      console.error("Error fetching medicines:", err);
      toast.error(`فشل في تحميل أدوية المريض: ${err}`);
    } finally {
      setLoadingAuthorized(false);
    }
  };

  const loadHistory = async () => {
    if (!hierarchy.branchId || !hierarchy.dispenseMonth) return;
    setLoading(true);
    try {
      const data = await invoke("get_judicial_dispensed", {
        branchId: hierarchy.branchId ? parseInt(hierarchy.branchId) : null,
        areaId: null,
        clinicId: null,
        dispenseMonth: hierarchy.dispenseMonth,
      });
      // Map patient and medicine names for display
      const enriched = data.map((record) => ({
        ...record,
        patientName:
          patients.find((p) => p.id === record.patient_id)?.name ||
          "مريض غير معروف",
        medicineName: record.medicine_name,
        quantity: record.monthly_dose, // based on schema mapping
      }));
      setHistory(enriched);
    } catch (err) {
      console.error(err);
      toast.error("فشل في تحميل سجل الصرف القضائي");
    } finally {
      setLoading(false);
    }
  };

  const baselineAvgValue = React.useMemo(() => {
    if (history.length === 0) return 0;
    const total = history.reduce((sum, item) => sum + (parseFloat(item.monthly_cost) || 0), 0);
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
        if ((parseFloat(record.monthly_cost) || 0) <= baselineAvgValue * 2) return false;
      }

      const s = searchTerm.toLowerCase();
      const matchesSearch =
        !searchTerm ||
        record.patientName.toLowerCase().includes(s) ||
        record.medicineName.toLowerCase().includes(s) ||
        record.diagnosis.toLowerCase().includes(s);

      const matchesPatient =
        !filterPatient || record.patient_id?.toString() === filterPatient;
      const matchesMedicine =
        !filterMedicine || record.medicine_name === filterMedicine;

      return matchesSearch && matchesPatient && matchesMedicine;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history, searchTerm, filterPatient, filterMedicine, hierarchy.areaId, hierarchy.clinicId, filterLockStatus, filterHighValue, baselineAvgValue]);

  const paginatedHistory = React.useMemo(() => {
    const startIndex = (currentPage - 1) * rowsPerPage;
    return displayHistory.slice(startIndex, startIndex + rowsPerPage);
  }, [displayHistory, currentPage, rowsPerPage]);

  const totalPages = Math.ceil(displayHistory.length / rowsPerPage);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterPatient, filterMedicine, filterLockStatus, filterHighValue]);

  const statsBarItems = React.useMemo(
    () => [
      {
        label: "إجمالي السجلات",
        value: history.length,
        filteredValue: displayHistory.length,
        icon: ClipboardList,
        color: "var(--color-primary)",
      },
      {
        label: "إجمالي التكلفة",
        value: history.reduce(
          (sum, r) => sum + parseFloat(r.monthly_cost || 0),
          0,
        ),
        filteredValue: displayHistory.reduce(
          (sum, r) => sum + parseFloat(r.monthly_cost || 0),
          0,
        ),
        icon: Scale,
        color: "var(--color-success)",
        suffix: " ج.م",
      },
    ],
    [history, displayHistory],
  );

  const handleDelete = async (id) => {
    setDeleteTarget(id);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      await invoke("delete_judicial_dispensed", { id: deleteTarget });
      toast.success("تم حذف السجل بنجاح");
      loadHistory();
    } catch (err) {
      toast.error(`فشل في حذف السجل: ${err}`);
    } finally {
      setDeleteLoading(false);
      setDeleteTarget(null);
    }
  };

  const handleShowDetails = (record) => {
    setSelectedRecord(record);
    setShowDetails(true);
  };

  const handleEdit = (record) => {
    setSelectedRecord(record);
    setEditData({ quantity: record.quantity, price: record.unit_price });
    setShowEdit(true);
  };

  const handleSaveEdit = async () => {
    try {
      const payload = {
        ...selectedRecord,
        monthly_dose: parseFloat(editData.quantity),
        unit_price: parseFloat(editData.price),
        monthly_cost:
          parseFloat(editData.quantity) * parseFloat(editData.price),
      };

      // Remove display-only fields to match Rust struct
      const cleanPayload = { ...payload };
      delete cleanPayload.patientName;
      delete cleanPayload.medicineName;
      delete cleanPayload.quantity;
      delete cleanPayload.court_ruling_date;
      delete cleanPayload.treatment_start_date;
      delete cleanPayload.authorized_dose;

      await invoke("save_judicial_dispensed", { data: cleanPayload });
      toast.success("تم تعديل السجل بنجاح");
      setShowEdit(false);
      loadHistory();
    } catch (err) {
      toast.error(`فشل التعديل: ${err}`);
    }
  };

  useEffect(() => {
    loadHistory();
    // Also clear the entry form when hierarchy changes
    setFormData((prev) => ({ ...prev, patientId: "" }));
    setDispenseQuantities({});
    setPatientAuthorizedMedicines([]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    hierarchy.branchId,
    hierarchy.areaId,
    hierarchy.clinicId,
    hierarchy.dispenseMonth,
    patients,
  ]);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!hierarchy.branchId || !formData.patientId) {
      toast.warning("يرجى اختيار الفرع والمريض أولاً");
      return;
    }

    const entries = Object.entries(dispenseQuantities).filter(
      ([_, qty]) => parseFloat(qty) > 0,
    );

    if (entries.length === 0) {
      toast.warning("يرجى إدخال كمية لواحد على الأقل من الأدوية");
      return;
    }

    setSaving(true);
    try {
      const selectedPatient = patients.find(
        (p) => p.id === parseInt(formData.patientId),
      );

      for (const [medId, qty] of entries) {
        const authMed = patientAuthorizedMedicines.find(
          (m) => m.medicine_id === parseInt(medId),
        );

        const payload = {
          id: null,
          patient_id: parseInt(formData.patientId),
          diagnosis: selectedPatient?.diagnosis || "",
          medicine_name: authMed?.medicine_name || "",
          unit: authMed?.unit || "",
          unit_price: authMed?.unit_price || 0,
          monthly_dose: parseFloat(qty) || 0,
          monthly_cost: (parseFloat(qty) || 0) * (authMed?.unit_price || 0),
          dispense_month: hierarchy.dispenseMonth,
          branch_id: parseInt(hierarchy.branchId),
          area_id: hierarchy.areaId ? parseInt(hierarchy.areaId) || null : null,
          clinic_id: hierarchy.clinicId
            ? parseInt(hierarchy.clinicId) || null
            : null,
        };
        await invoke("save_judicial_dispensed", { data: payload });
      }

      toast.success("تم حفظ بيانات الصرف بنجاح");
      loadHistory();
      // Clear form
      setFormData((prev) => ({ ...prev, patientId: "" }));
      setDispenseQuantities({});
      setPatientAuthorizedMedicines([]);
    } catch (err) {
      toast.error(`فشل حفظ البيانات: ${err}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="no-print space-y-6">
        <Breadcrumb
          items={[
            { label: "العمليات اليومية" },
            { label: "صرف أحكام المحكمة" },
          ]}
        />

        <PageHeader
          title="صرف أحكام المحكمة"
          icon={Scale}
          description="تسجيل المنصرف للمرضى الحاصلين على أحكام قضائية."
        />

        <HierarchySelector
          onSelectionChange={(data) => setHierarchy({ ...hierarchy, ...data })}
          initialBranch={hierarchy.branchId}
          initialArea={hierarchy.areaId}
          initialClinic={hierarchy.clinicId}
          initialMonth={hierarchy.dispenseMonth}
        />
      </div>

      <div className="space-y-6">
        <div className="no-print">
          <Card className="p-6">
            <form onSubmit={handleSave} className="space-y-6">
              <AutoComplete
                label="المريض"
                icon={Users}
                options={patients}
                value={formData.patientId}
                onChange={handlePatientChange}
                placeholder="ابحث عن مريض..."
              />

              <div className="pt-4 border-t border-[var(--color-border)]">
                <div className="flex justify-between items-center mb-4">
                  <h4 className="text-sm font-bold flex items-center gap-2">
                    <Pill size={16} className="text-[var(--color-primary)]" />
                    الأدوية المعتمدة والكميات المصروفة
                  </h4>
                  {loadingAuthorized && (
                    <span className="text-[10px] animate-pulse">
                      جارٍ جلب الأدوية...
                    </span>
                  )}
                </div>

                {patientAuthorizedMedicines.length > 0 ? (
                  <div className="space-y-4">
                    {patientAuthorizedMedicines.map((med) => (
                      <div
                        key={med.medicine_id}
                        className="p-4 rounded-2xl bg-[var(--color-bg)] border border-[var(--color-border)] flex flex-col sm:flex-row sm:items-center gap-4 transition-all hover:border-[var(--color-primary)]"
                      >
                        <div className="flex-1">
                          <div className="font-bold text-sm text-[var(--color-primary)]">
                            {med.medicine_name}
                          </div>
                          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
                            <span className="text-[10px] text-[var(--color-text-muted)] font-bold">
                              الجرعة المعتمدة: {med.monthly_dose}
                            </span>
                            <span className="text-[10px] text-[var(--color-text-muted)] font-bold">
                              الوحدة: {med.unit}
                            </span>
                            <span className="text-[10px] text-[var(--color-success)] font-black">
                              السعر: {med.unit_price} ج.م
                            </span>
                          </div>
                        </div>
                        <div className="w-full sm:w-48">
                          <Input
                            placeholder="الكمية المصروفة"
                            type="number"
                            step="0.01"
                            value={dispenseQuantities[med.medicine_id] || ""}
                            onChange={(e) =>
                              setDispenseQuantities({
                                ...dispenseQuantities,
                                [med.medicine_id]: e.target.value,
                              })
                            }
                            inputClassName="text-center font-black text-lg"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : formData.patientId && !loadingAuthorized ? (
                  <div className="text-center py-10 bg-[var(--color-warning-bg)] rounded-3xl border border-dashed border-[var(--color-warning)]/30">
                    <p className="text-xs text-[var(--color-warning)] font-black">
                      لا توجد أدوية معتمدة لهذا المريض في الإعدادات.
                    </p>
                    <p className="text-[10px] text-[var(--color-text-muted)] mt-1 font-bold">
                      يرجى مراجعة صفحة "إعدادات أحكام المحكمة".
                    </p>
                  </div>
                ) : (
                  <div className="text-center py-10 bg-[var(--color-bg)] rounded-3xl border border-dashed border-[var(--color-border)] opacity-60">
                    <p className="text-xs font-black text-[var(--color-text-muted)]">
                      يرجى اختيار مريض لعرض الأدوية المصرح بها.
                    </p>
                  </div>
                )}
              </div>

              {(() => {
                const isLocked = checkIsMonthLocked(hierarchy.dispenseMonth);
                return (
                  <Button
                    variant="primary"
                    icon={isLocked ? Lock : Save}
                    loading={saving}
                    disabled={
                      isLocked || patientAuthorizedMedicines.length === 0
                    }
                    type="submit"
                    className="w-full py-4 text-lg"
                  >
                    {isLocked ? "الشهر مقفل" : "حفظ سجلات الصرف"}
                  </Button>
                );
              })()}
            </form>
          </Card>
        </div>

        <div className="space-y-4">
          <div className="no-print flex flex-col md:flex-row items-center justify-between gap-4 px-2">
            <div
              className="flex items-center gap-2 font-bold"
              style={{ color: "var(--color-primary)" }}
            >
              <History size={18} />
              <span>سجل المنصرف القضائي لهذا الشهر</span>
              <ExportMenu 
                data={history} 
                columns={[
                  { header: "الحكم", accessor: "judgment_number" },
                  { header: "الجهة", accessor: "court_name" },
                  { header: "المستفيد", accessor: "beneficiary_name" },
                  { header: "الدواء", accessor: "drug_name" },
                  { header: "الكمية", accessor: (r) => r.quantity?.toString() || "0" },
                  { header: "الإجمالي", accessor: (r) => parseFloat(r.total_cost || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) },
                ]} 
                options={{ 
                  title: 'سجل المنصرف القضائي', 
                  fileName: `judicial_${hierarchy.dispenseMonth}`,
                  hierarchyLabel: `الفرع: ${hierarchy.branchId} | شهر: ${hierarchy.dispenseMonth}`
                }} 
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 justify-end w-full md:w-auto">
              <select
                className="p-2 rounded-xl border border-[var(--color-border)] text-xs font-bold bg-[var(--color-bg-card)] text-[var(--color-text)] outline-none"
                value={filterPatient}
                onChange={(e) => setFilterPatient(e.target.value)}
              >
                <option value="">كل المرضى</option>
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <select
                className="p-2 rounded-xl border border-[var(--color-border)] text-xs font-bold bg-[var(--color-bg-card)] text-[var(--color-text)] outline-none"
                value={filterMedicine}
                onChange={(e) => setFilterMedicine(e.target.value)}
              >
                <option value="">كل الأدوية</option>
                {[...new Set(history.map((h) => h.medicine_name))].map((m) => (
                  <option key={m} value={m}>
                    {m}
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

          <div className="no-print mb-4">
            <StatsBar
              stats={statsBarItems}
              accentColor="var(--color-primary)"
            />
          </div>

          <div className="bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] shadow-xl overflow-hidden print:border-none print:shadow-none print:bg-transparent">
            <div className="print:hidden">
              <Table
                columns={[
                  { header: "المريض", accessor: "patientName" },
                  { header: "التشخيص", accessor: "diagnosis" },
                  { header: "الدواء", accessor: "medicineName" },
                  { header: "الوحدة", accessor: "unit" },
                  { header: "الكمية", accessor: "quantity" },
                  { header: "السعر", render: (r) => `${r.unit_price} ج.م` },
                  {
                    header: "الإجمالي",
                    render: (r) => `${r.monthly_cost} ج.م`,
                  },
                  {
                    header: "تفاصيل",
                    className: "no-print",
                    render: (r) => (
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={Eye}
                        onClick={() => handleShowDetails(r)}
                        className="text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10"
                      />
                    ),
                  },
                ]}
                data={paginatedHistory}
                loading={loading}
                onEdit={handleEdit}
                onDelete={handleDelete}
                isRowLocked={(r) =>
                  checkIsMonthLocked(r.dispense_month)
                }
                footer={
                  <tr className="bg-[var(--color-bg-card)] border-t-2 border-[var(--color-border)] font-black text-[var(--color-text)]">
                    <td colSpan="6" className="p-4 text-right">
                      الإجمالي المفلتر ({displayHistory.length} سجل):
                    </td>
                    <td className="p-4 text-[var(--color-success)] text-center">
                      {displayHistory
                        .reduce(
                          (sum, r) => sum + parseFloat(r.monthly_cost || 0),
                          0,
                        )
                        .toLocaleString()}{" "}
                      ج.م
                    </td>
                    <td colSpan="2"></td>
                  </tr>
                }
              />
            </div>

            {/* Print Only Version (Full Data) */}
            <div className="hidden print:block">
              <PrintableTable
                title="تقرير الصرف القضائي"
                subtitle={`الشهر: ${hierarchy.dispenseMonth} - الفرع: ${
                  activeHierarchy.branchName || "جميع الفروع"
                }`}
              >
                <Table
                  columns={[
                    { header: "المريض", accessor: "patientName" },
                    { header: "التشخيص", accessor: "diagnosis" },
                    { header: "الدواء", accessor: "medicineName" },
                    { header: "الوحدة", accessor: "unit" },
                    { header: "الكمية", accessor: "quantity" },
                    { header: "السعر", render: (r) => `${r.unit_price} ج.م` },
                    {
                      header: "الإجمالي",
                      render: (r) => `${r.monthly_cost} ج.م`,
                    },
                  ]}
                  data={displayHistory}
                  isRowLocked={(r) =>
                    checkIsMonthLocked(r.dispense_month)
                  }
                  footer={
                    <tr className="font-black border-t-2 border-black">
                      <td colSpan="6" className="p-2 text-right">
                        الإجمالي العام:
                      </td>
                      <td className="p-2 text-center">
                        {displayHistory
                          .reduce(
                            (sum, r) => sum + parseFloat(r.monthly_cost || 0),
                            0,
                          )
                          .toLocaleString()}{" "}
                        ج.م
                      </td>
                    </tr>
                  }
                />
              </PrintableTable>
            </div>
            {displayHistory.length === 0 && !loading && (
              <div className="p-8 text-center text-sm italic opacity-50 no-print">
                لا توجد سجلات مطابقة للبحث أو الفلترة.
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
          </div>
        </div>
      </div>

      {/* Details Modal */}
      <Modal
        isOpen={showDetails}
        onClose={() => setShowDetails(false)}
        title="تفاصيل السجل القضائي"
        icon={Info}
      >
        {selectedRecord && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-2xl bg-[var(--color-primary-bg)] border border-[var(--color-primary)]/10">
                <div className="text-[10px] text-[var(--color-primary)] font-bold mb-1 flex items-center gap-1">
                  <Users size={12} /> بيانات المريض
                </div>
                <div className="font-bold text-sm text-[var(--color-text)]">
                  {selectedRecord.patientName}
                </div>
                <div className="text-[11px] text-[var(--color-text-muted)] mt-1">
                  {selectedRecord.diagnosis}
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-[var(--color-accent-emerald-bg)] border border-[var(--color-success)]/10">
                <div className="text-[10px] text-[var(--color-success)] font-bold mb-1 flex items-center gap-1">
                  <Pill size={12} /> بيانات الدواء
                </div>
                <div className="font-bold text-sm text-[var(--color-text)]">
                  {selectedRecord.medicineName}
                </div>
                <div className="text-[11px] text-[var(--color-text-muted)] mt-1">
                  الوحدة: {selectedRecord.unit}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-3 rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] text-center shadow-sm">
                <div className="text-[10px] text-[var(--color-text-muted)] flex justify-center items-center gap-1 mb-1">
                  <Calendar size={12} /> تاريخ الحكم
                </div>
                <div className="font-black text-xs text-[var(--color-text)]">
                  {selectedRecord.court_ruling_date || "---"}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] text-center shadow-sm">
                <div className="text-[10px] text-[var(--color-text-muted)] flex justify-center items-center gap-1 mb-1">
                  <Clock size={12} /> تاريخ أول صرف
                </div>
                <div className="font-black text-xs text-[var(--color-text)]">
                  {selectedRecord.treatment_start_date || "---"}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] text-center border-b-4 border-b-[var(--color-primary)] shadow-sm">
                <div className="text-[10px] text-[var(--color-primary)] font-bold flex justify-center items-center gap-1 mb-1">
                  <ClipboardList size={12} /> الجرعة المعتمدة
                </div>
                <div className="font-black text-xs text-[var(--color-primary)]">
                  {selectedRecord.authorized_dose || "---"}
                </div>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-[var(--color-bg-card)] border border-[var(--color-border)] shadow-inner">
              <h4 className="text-xs font-black mb-3 text-[var(--color-text-muted)] uppercase tracking-widest">
                تفاصيل الصرف الفعلي
              </h4>
              <div className="space-y-3">
                <div className="flex justify-between text-xs">
                  <span className="text-[var(--color-text-muted)] font-bold">
                    الكمية المصروفة:
                  </span>
                  <span className="font-black text-[var(--color-text)]">
                    {selectedRecord.quantity}
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-[var(--color-text-muted)] font-bold">
                    سعر الوحدة:
                  </span>
                  <span className="font-black text-[var(--color-text)]">
                    {selectedRecord.unit_price} ج.م
                  </span>
                </div>
                <div className="border-t border-dashed border-[var(--color-border)] my-2"></div>
                <div className="flex justify-between text-sm">
                  <span className="font-black text-[var(--color-text)]">
                    الإجمالي:
                  </span>
                  <span className="font-black text-[var(--color-primary)] text-lg">
                    {selectedRecord.monthly_cost} ج.م
                  </span>
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <Button onClick={() => setShowDetails(false)}>إغلاق</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Edit Modal */}
      <Modal
        isOpen={showEdit}
        onClose={() => setShowEdit(false)}
        title="تعديل بيانات الصرف"
        icon={Edit3}
      >
        {selectedRecord && (
          <div className="space-y-6">
            <div className="p-4 rounded-2xl bg-[var(--color-primary-bg)] border border-[var(--color-primary)]/10 mb-4">
              <div className="font-black text-sm text-[var(--color-primary)]">
                {selectedRecord.patientName}
              </div>
              <div className="text-xs text-[var(--color-text-muted)] mt-1 font-bold">
                {selectedRecord.medicineName}
              </div>
            </div>

            <div className="space-y-4">
              <Input
                label="الكمية المصروفة"
                type="number"
                step="0.01"
                value={editData.quantity}
                onChange={(e) =>
                  setEditData({ ...editData, quantity: e.target.value })
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveEdit();
                }}
              />
              <Input
                label="سعر الوحدة"
                type="number"
                step="0.01"
                value={editData.price}
                onChange={(e) =>
                  setEditData({ ...editData, price: e.target.value })
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveEdit();
                }}
              />
            </div>

            <div className="p-4 rounded-2xl bg-[var(--color-bg)] border border-[var(--color-border)] flex justify-between items-center shadow-inner">
              <span className="text-sm font-black text-[var(--color-text)]">
                الإجمالي الجديد:
              </span>
              <span className="text-2xl font-black text-[var(--color-primary)]">
                {(
                  (parseFloat(editData.quantity) || 0) *
                  (parseFloat(editData.price) || 0)
                ).toLocaleString()}{" "}
                <span className="text-xs font-bold">ج.م</span>
              </span>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-[var(--color-border)]">
              <Button variant="ghost" onClick={() => setShowEdit(false)}>
                إلغاء
              </Button>
              <Button variant="primary" onClick={handleSaveEdit}>
                حفظ التعديلات
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmModal
        isOpen={!!deleteTarget}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
        title="تأكيد الحذف"
        message="هل أنت متأكد من حذف هذا السجل القضائي؟ لا يمكن التراجع."
        loading={deleteLoading}
      />
    </div>
  );
};

export default JudicialDispensingPage;
