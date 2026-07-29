import React, { useState, useCallback } from "react";
import { useLocation, Link } from "react-router-dom";
import HierarchySelector from "../../../components/common/HierarchySelector";
import {
  DollarSign,
  Home,
  Pill,
  Building2,
  GraduationCap,
  Baby,
  Save,
  Loader2,
  FileText,
  BarChart3,
  ToggleLeft,
  ToggleRight,
  Lock,
} from "lucide-react";
import Card from "../../../components/ui/Card";
import { useToast } from "../../../components/ui/Toast";
import invoke from "../../../api/tauriApi";
import MonthlyHistoryTable from "../../../components/common/MonthlyHistoryTable";

import { useGlobalApp } from "../../../context/useGlobalApp";

import PrintableTable from '../../../components/common/PrintableTable';

const SupportedDrugsTotalsPage = () => {
  const location = useLocation();
  const toast = useToast();
  const { activeHierarchy, isIsolationExceptionActive, setIsIsolationExceptionActive, lockedLevel, setWorkspaceMode } = useGlobalApp();
  
  // Cleanup exception on unmount
  React.useEffect(() => {
    return () => setIsIsolationExceptionActive(false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [hierarchy, setHierarchy] = useState({
    level: location.state?.clinicId || activeHierarchy.clinicId
      ? "clinic"
      : location.state?.areaId || activeHierarchy.areaId
        ? "area"
        : "branch",
    branchId: location.state?.branchId || activeHierarchy.branchId || "",
    areaId: location.state?.areaId || activeHierarchy.areaId || "",
    clinicId: location.state?.clinicId || activeHierarchy.clinicId || "",
    dispenseMonth:
      location.state?.dispenseMonth || activeHierarchy.dispenseMonth || new Date().toISOString().substring(0, 7),
  });
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const handleEditRecord = (record) => {
    setHierarchy({
      level: record.clinic_id ? "clinic" : record.area_id ? "area" : "branch",
      branchId: record.branch_id?.toString() || "",
      areaId: record.area_id?.toString() || "",
      clinicId: record.clinic_id?.toString() || "",
      dispenseMonth: record.dispense_month || "",
    });
    setFormData({
      drugs_supported_authority_value: record.drugs_supported_authority_value || 0,
      drugs_supported_authority_patient_share: record.drugs_supported_authority_patient_share || 0,
      drugs_supported_students_value: record.drugs_supported_students_value || 0,
      drugs_supported_students_patient_share: record.drugs_supported_students_patient_share || 0,
      drugs_supported_infants_value: record.drugs_supported_infants_value || 0,
      drugs_supported_infants_patient_share: record.drugs_supported_infants_patient_share || 0,
      notes: record.notes || "",
    });
    setCurrentId(record.id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleCancelEdit = () => {
    setHierarchy((prev) => ({
      ...prev,
      branchId: "",
      areaId: "",
      clinicId: "",
    }));
  };

  const [currentId, setCurrentId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    drugs_supported_authority_value: 0,
    drugs_supported_authority_patient_share: 0,
    drugs_supported_students_value: 0,
    drugs_supported_students_patient_share: 0,
    drugs_supported_infants_value: 0,
    drugs_supported_infants_patient_share: 0,
    notes: "",
  });

  // Fetch existing data when hierarchy changes
  const fetchData = useCallback(async () => {
    if (!hierarchy?.branchId || !hierarchy?.dispenseMonth) {
      setFormData({
        drugs_supported_authority_value: 0,
        drugs_supported_authority_patient_share: 0,
        drugs_supported_students_value: 0,
        drugs_supported_students_patient_share: 0,
        drugs_supported_infants_value: 0,
        drugs_supported_infants_patient_share: 0,
        notes: "",
      });
      setCurrentId(null);
      return;
    }

    // Prevent fetching if hierarchy is incomplete for current level
    if (hierarchy.level === "area" && !hierarchy.areaId) {
      setFormData({
        drugs_supported_authority_value: 0,
        drugs_supported_authority_patient_share: 0,
        drugs_supported_students_value: 0,
        drugs_supported_students_patient_share: 0,
        drugs_supported_infants_value: 0,
        drugs_supported_infants_patient_share: 0,
        notes: "",
      });
      setCurrentId(null);
      return;
    }
    if (hierarchy.level === "clinic" && !hierarchy.clinicId) {
      setFormData({
        drugs_supported_authority_value: 0,
        drugs_supported_authority_patient_share: 0,
        drugs_supported_students_value: 0,
        drugs_supported_students_patient_share: 0,
        drugs_supported_infants_value: 0,
        drugs_supported_infants_patient_share: 0,
        notes: "",
      });
      setCurrentId(null);
      return;
    }

    setLoading(true);
    try {
      const data = await invoke("get_monthly_drugs_dispensed", {
        branchId: parseInt(hierarchy.branchId),
        areaId: hierarchy.areaId ? parseInt(hierarchy.areaId) : null,
        clinicId: hierarchy.clinicId ? parseInt(hierarchy.clinicId) : null,
        dispenseMonth: hierarchy.dispenseMonth,
      });
      if (data) {
        // Only set the ID, don't populate the form automatically to avoid confusion when browsing
        setCurrentId(data.id);
      } else {
        setCurrentId(null);
      }
    } catch (e) {
      console.error(e);
      toast.error("فشل في جلب البيانات المسجلة");
    } finally {
      setLoading(false);
    }
  }, [
    hierarchy?.branchId,
    hierarchy?.areaId,
    hierarchy?.clinicId,
    hierarchy?.dispenseMonth,
    hierarchy?.level,
  ]);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  // Compute authority share (value - patient share)
  const getAuthorityShare = (valueKey, shareKey) => {
    const v = parseFloat(formData[valueKey]) || 0;
    const s = parseFloat(formData[shareKey]) || 0;
    return (v - s).toLocaleString(undefined, { maximumFractionDigits: 4 });
  };

  const totalAmount = (() => {
    const v1 = parseFloat(formData.drugs_supported_authority_value) || 0;
    const v2 = parseFloat(formData.drugs_supported_students_value) || 0;
    const v3 = parseFloat(formData.drugs_supported_infants_value) || 0;
    return (v1 + v2 + v3).toLocaleString(undefined, {
      maximumFractionDigits: 4,
    });
  })();

  const handleSave = async () => {
    if (!hierarchy?.branchId) {
      toast.warning("يرجى اختيار الفرع أولاً");
      return;
    }
    if (hierarchy.level === "area" && !hierarchy.areaId) {
      toast.warning("يرجى اختيار المنطقة أولاً للتمكن من الحفظ");
      return;
    }
    if (hierarchy.level === "clinic" && !hierarchy.clinicId) {
      toast.warning("يرجى اختيار العيادة أولاً للتمكن من الحفظ");
      return;
    }

    setSaving(true);
    try {
      await invoke("save_monthly_drugs_dispensed", {
        data: {
          id: currentId,
          clinic_id: hierarchy.clinicId ? parseInt(hierarchy.clinicId) : null,
          area_id: hierarchy.areaId ? parseInt(hierarchy.areaId) : null,
          branch_id: parseInt(hierarchy.branchId),
          dispense_month: hierarchy.dispenseMonth,
          // Free drugs fields - keep existing or zero
          drugs_free_authority: 0,
          drugs_free_students: 0,
          drugs_free_infants: 0,
          drugs_free_breadwinner_women: 0,
          // Supported drugs fields
          drugs_supported_authority_value:
            parseFloat(formData.drugs_supported_authority_value) || 0,
          drugs_supported_authority_patient_share:
            parseFloat(formData.drugs_supported_authority_patient_share) || 0,
          drugs_supported_students_value:
            parseFloat(formData.drugs_supported_students_value) || 0,
          drugs_supported_students_patient_share:
            parseFloat(formData.drugs_supported_students_patient_share) || 0,
          drugs_supported_infants_value:
            parseFloat(formData.drugs_supported_infants_value) || 0,
          drugs_supported_infants_patient_share:
            parseFloat(formData.drugs_supported_infants_patient_share) || 0,
          notes: formData.notes,
        },
      });
      toast.success("تم حفظ البيانات بنجاح");
      setFormData({
        drugs_supported_authority_value: 0,
        drugs_supported_authority_patient_share: 0,
        drugs_supported_students_value: 0,
        drugs_supported_students_patient_share: 0,
        drugs_supported_infants_value: 0,
        drugs_supported_infants_patient_share: 0,
        notes: "",
      });
      setCurrentId(null);
      setRefreshTrigger((prev) => prev + 1);
    } catch (error) {
      toast.error(`خطأ: ${error}`);
    } finally {
      setSaving(false);
    }
  };

  const categories = [
    {
      key: "authority",
      label: "هيئة (مدعوم)",
      icon: Building2,
      color: "var(--color-primary)",
      valueName: "drugs_supported_authority_value",
      shareName: "drugs_supported_authority_patient_share",
    },
    {
      key: "students",
      label: "طلاب (مدعوم)",
      icon: GraduationCap,
      color: "var(--color-info)",
      valueName: "drugs_supported_students_value",
      shareName: "drugs_supported_students_patient_share",
    },
    {
      key: "infants",
      label: "رضيع (مدعوم)",
      icon: Baby,
      color: "var(--color-success)",
      valueName: "drugs_supported_infants_value",
      shareName: "drugs_supported_infants_patient_share",
    },
  ];

  return (
    <PrintableTable title="صرف الأدوية المدعمة الشهري" subtitle={hierarchy.dispenseMonth ? `شهر ${hierarchy.dispenseMonth}` : ''}>
    <div className="space-y-6 animate-fadeIn pb-20">
      <div className="no-print space-y-6">
        {/* Premium Header Banner */}
        <div className="bg-gradient-to-r from-[var(--color-success)] to-[var(--color-success)]/80 text-white p-6 rounded-3xl shadow-xl flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="bg-white/20 p-3 rounded-2xl backdrop-blur-sm">
              <Pill size={32} className="text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-black">صرف الأدوية المدعمة الشهري</h1>
              <p className="text-emerald-100 text-xs font-bold opacity-80 uppercase tracking-widest">
                إدخال بيانات صرف الأدوية المدعمة بتقسيمات الهيئة والطلاب والرضيع
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/"
              className="flex items-center gap-2 px-5 py-2.5 bg-white text-[var(--color-success)] rounded-xl font-black text-sm hover:bg-emerald-50 transition-all shadow-lg"
            >
              <BarChart3 size={18} /> التقارير
            </Link>
          </div>
        </div>

        {/* ═══════ Add New Supported Drug Record ═══════ */}
        <Card className="p-0 overflow-hidden border-none shadow-xl">
          {/* Section Header */}
          <div className="bg-[var(--color-success)] text-white p-4 flex items-center gap-3">
            <DollarSign size={20} />
            <h3 className="text-base font-black">
              إضافة سجل صرف أدوية مدعمة جديد
            </h3>
          </div>

          <div className="p-6 md:p-8 space-y-6" dir="rtl">
            {/* Isolation Exception Toggle */}
            {lockedLevel && (lockedLevel === 'branch' || lockedLevel === 'area') && (
              <div className="flex items-center justify-between p-3 px-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl animate-in slide-in-from-top-2 duration-300">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-800 text-amber-600 dark:text-amber-400">
                    <Lock size={18} />
                  </div>
                  <div>
                    <p className="text-sm font-black text-amber-900 dark:text-amber-100 leading-tight">استثناء نظام العزل</p>
                    <p className="text-[10px] text-amber-700 dark:text-amber-400 font-bold">تفعيل الإدخال كعيادة رغم قفل الشهر للجهة</p>
                  </div>
                </div>
                <button 
                  onClick={() => {
                    const next = !isIsolationExceptionActive;
                    setIsIsolationExceptionActive(next);
                    if (next) {
                      setWorkspaceMode('clinics');
                    } else if (lockedLevel) {
                      const mode = lockedLevel === 'branch' ? 'branches' : lockedLevel === 'area' ? 'areas' : 'clinics';
                      setWorkspaceMode(mode);
                      setHierarchy(prev => ({
                        ...prev,
                        areaId: lockedLevel === 'branch' ? '' : prev.areaId,
                        clinicId: (lockedLevel === 'branch' || lockedLevel === 'area') ? '' : prev.clinicId
                      }));
                    }
                  }}
                  className={`p-1 rounded-full transition-all duration-300 ${isIsolationExceptionActive ? 'text-emerald-500' : 'text-slate-400'}`}
                >
                  {isIsolationExceptionActive ? <ToggleRight size={40} /> : <ToggleLeft size={40} />}
                </button>
              </div>
            )}

            {/* Hierarchy Selectors */}
            <HierarchySelector
              onSelectionChange={(data) =>
                setHierarchy({ ...hierarchy, ...data })
              }
              initialBranch={hierarchy.branchId}
              initialArea={hierarchy.areaId}
              initialClinic={hierarchy.clinicId}
              initialMonth={hierarchy.dispenseMonth}
              compact={true}
            />

            {/* Divider */}
            <div className="w-full h-[1px] bg-[var(--color-border)]"></div>

            {loading ? (
              <div className="flex flex-col items-center justify-center p-12 space-y-4 text-[var(--color-text-muted)]">
                <Loader2
                  size={40}
                  className="animate-spin text-[var(--color-success)]"
                />
                <p className="font-bold animate-pulse">
                  جاري جلب البيانات السابقة...
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Section Title */}
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-[var(--color-success-bg)] text-[var(--color-success)] shadow-sm border border-[var(--color-success)]/20">
                    <DollarSign size={22} />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-[var(--color-text)]">
                      تقسيمات الصرف (الأدوية المدعمة)
                    </h3>
                  </div>
                </div>

                {/* Category Cards */}
                <div className="space-y-6">
                  {categories.map(
                    ({ key, label, icon: _Icon, color, valueName, shareName }) => (
                      <div
                        key={key}
                        className="bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] shadow-sm overflow-hidden"
                      >
                        {/* Card Header */}
                        <div
                          className="px-5 py-3 border-b border-[var(--color-border)] flex items-center gap-2"
                          style={{ backgroundColor: `${color}10` }}
                        >
                          <_Icon size={18} style={{ color }} />
                          <span className="text-sm font-black" style={{ color }}>
                            {label}
                          </span>
                        </div>

                        {/* Card Body - 3 columns */}
                        <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-4">
                          {/* قيمة الدواء */}
                          <div className="space-y-2">
                            <label className="text-xs font-bold text-[var(--color-text-muted)] text-right block">
                              قيمة الدواء
                            </label>
                            <input
                              type="number"
                              step="0.01"
                              placeholder="0"
                              value={formData[valueName] || ""}
                              onChange={(e) =>
                                handleChange(valueName, e.target.value)
                              }
                              className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] outline-none p-3 rounded-xl text-base font-bold text-center text-[var(--color-text)] focus:ring-2 focus:ring-[var(--color-success)]/20 focus:border-[var(--color-success)] transition-all"
                            />
                          </div>

                          {/* ما يتحمله المريض */}
                          <div className="space-y-2">
                            <label className="text-xs font-bold text-[var(--color-text-muted)] text-right block">
                              ما يتحمله المريض
                            </label>
                            <input
                              type="number"
                              step="0.01"
                              placeholder="0"
                              value={formData[shareName] || ""}
                              onChange={(e) =>
                                handleChange(shareName, e.target.value)
                              }
                              className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] outline-none p-3 rounded-xl text-base font-bold text-center text-[var(--color-text)] focus:ring-2 focus:ring-[var(--color-warning)]/20 focus:border-[var(--color-warning)] transition-all"
                            />
                          </div>

                          {/* ما تتحمله الهيئة (calculated, readonly) */}
                          <div className="space-y-2">
                            <label className="text-xs font-bold text-[var(--color-text-muted)] text-right block">
                              ما تتحمله الهيئة
                            </label>
                            <input
                              type="text"
                              value={getAuthorityShare(valueName, shareName)}
                              readOnly
                              className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] outline-none p-3 rounded-xl text-base font-bold text-center text-[var(--color-success)] opacity-70 cursor-not-allowed"
                            />
                          </div>
                        </div>
                      </div>
                    )
                  )}
                </div>

                {/* Notes */}
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-xs font-bold text-[var(--color-text-muted)]">
                    <FileText size={14} />
                    <span>ملاحظات</span>
                  </label>
                  <textarea
                    rows="3"
                    className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] outline-none p-4 rounded-xl text-sm font-medium text-right text-[var(--color-text)] focus:ring-2 focus:ring-[var(--color-success)]/20 transition-all resize-none"
                    placeholder="أدخل أي ملاحظات إضافية هنا..."
                    value={formData.notes}
                    onChange={(e) => handleChange("notes", e.target.value)}
                  />
                </div>

                {/* Total + Save */}
                <div className="bg-gradient-to-r from-[var(--color-success)] to-[var(--color-success)]/80 text-white rounded-2xl p-5 text-center shadow-lg">
                  <span className="text-3xl font-black block">{totalAmount}</span>
                  <span className="text-xs font-bold opacity-70">
                    إجمالي المنصرف (جنيه)
                  </span>
                </div>

                <button
                  onClick={handleSave}
                  disabled={saving || !hierarchy?.branchId}
                  className={`w-full flex items-center justify-center gap-3 py-4 rounded-2xl font-black text-base transition-all duration-300 shadow-lg ${
                    saving || !hierarchy?.branchId
                      ? "bg-[var(--color-bg)] text-[var(--color-text-muted)] cursor-not-allowed border border-[var(--color-border)]"
                      : "bg-gradient-to-r from-[var(--color-success)] to-emerald-500 text-white hover:shadow-xl hover:-translate-y-1 hover:shadow-emerald-500/50 shadow-emerald-500/30 active:translate-y-0 active:scale-[0.98]"
                  }`}
                >
                  {saving ? (
                    <Loader2 size={22} className="animate-spin" />
                  ) : (
                    <Save size={22} />
                  )}
                  <span>{saving ? "جاري الحفظ..." : "✓ حفظ سجل الصرف"}</span>
                </button>
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* ═══════ History Table Section ═══════ */}
      <MonthlyHistoryTable
        mode="supported"
        refreshTrigger={refreshTrigger}
        onEdit={handleEditRecord}
        onRefresh={handleCancelEdit}
      />
    </div>
    </PrintableTable>
  );
};

export default SupportedDrugsTotalsPage;
