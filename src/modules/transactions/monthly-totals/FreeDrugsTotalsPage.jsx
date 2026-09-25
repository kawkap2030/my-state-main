import React, { useState } from "react";
import { useLocation, Link } from "react-router-dom";
import PageHeader from "../../../components/ui/PageHeader";
import Breadcrumb from "../../../components/ui/Breadcrumb";
import HierarchySelector from "../../../components/common/HierarchySelector";
import MonthlyDispensedForm from "../../../components/forms/MonthlyDispensedForm";
import {
  Layers,
  MapPin,
  LayoutGrid,
  Home,
  Lock,
  Unlock,
  Gift,
  History,
  Pill,
  BarChart3,
} from "lucide-react";
import Card from "../../../components/ui/Card";
import MonthlyHistoryTable from "../../../components/common/MonthlyHistoryTable";
import { useGlobalApp } from "../../../context/useGlobalApp";
import { ToggleLeft, ToggleRight } from "lucide-react";
import { buildHierarchyLabel } from "../../../utils/reportUtils";

import PrintableTable from '../../../components/common/PrintableTable';

const FreeDrugsTotalsPage = () => {
  const location = useLocation();
  const { activeHierarchy, workspaceMode, hierarchyNames, isIsolationExceptionActive, setIsIsolationExceptionActive, lockedLevel, setWorkspaceMode } = useGlobalApp();
  
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
  const [editRecord, setEditRecord] = useState(null);

  const handleRefresh = () => {
    setRefreshTrigger((prev) => prev + 1);
    setEditRecord(null);
  };

  const handleEditRecord = (record) => {
    setHierarchy({
      level: record.clinic_id ? "clinic" : record.area_id ? "area" : "branch",
      branchId: record.branch_id?.toString() || "",
      areaId: record.area_id?.toString() || "",
      clinicId: record.clinic_id?.toString() || "",
      dispenseMonth: record.dispense_month || "",
    });
    setEditRecord(record);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleCancelEdit = () => {
    setHierarchy((prev) => ({
      ...prev,
      branchId: "",
      areaId: "",
      clinicId: "",
    }));
    setEditRecord(null);
  };

  return (
    <PrintableTable title="صرف الأدوية الشهري (مجاني)" subtitle={hierarchy.dispenseMonth ? `شهر ${hierarchy.dispenseMonth}` : ''} hierarchyLabel={buildHierarchyLabel(workspaceMode, hierarchyNames)}>
    <div className="space-y-6 animate-fadeIn pb-20">
      <div className="no-print space-y-6">
        {/* Premium Header Banner */}
        <div className="bg-gradient-to-r from-[var(--color-accent-cyan)] to-[var(--color-primary)] text-white p-6 rounded-3xl shadow-xl flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="bg-white/20 p-3 rounded-2xl backdrop-blur-sm">
              <Pill size={32} className="text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-black">صرف الأدوية الشهري</h1>
              <p className="text-cyan-100 text-xs font-bold opacity-80 uppercase tracking-widest">
                إدخال بيانات صرف الأدوية الشهرية بتقسيمات الهيئة والطلاب والرضع
                والمرأة المعيلة
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/reports/specialized/free-drugs"
              className="flex items-center gap-2 px-5 py-2.5 bg-white text-[var(--color-primary)] rounded-xl font-black text-sm hover:bg-cyan-50 transition-all shadow-lg"
            >
              <BarChart3 size={18} /> التقارير
            </Link>
          </div>
        </div>

        {/* ═══════ Add New Record Section ═══════ */}
        {/* NOTE: no overflow-hidden on the card — it would clip the AutoComplete
            dropdowns inside HierarchySelector (the list gets cut off mid-scroll). */}
        <Card className="p-0 border-none shadow-xl">
          {/* Section Header */}
          <div className="bg-[var(--color-primary)] text-white p-4 flex items-center gap-3 rounded-t-[20px]">
            <Gift size={20} />
            <h3 className="text-base font-black">إضافة سجل صرف أدوية جديد</h3>
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

            {/* Hierarchy Selectors - Vertical Stack */}
            <HierarchySelector
              onSelectionChange={(data) =>
                setHierarchy(prev => ({ ...prev, ...data }))
              }
              initialBranch={hierarchy.branchId}
              initialArea={hierarchy.areaId}
              initialClinic={hierarchy.clinicId}
              initialMonth={hierarchy.dispenseMonth}
              compact={true}
            />

            {/* Divider */}
            <div className="w-full h-[1px] bg-[var(--color-border)]"></div>

            {/* Form Content */}
            <MonthlyDispensedForm
              hierarchy={hierarchy}
              mode="free"
              onSuccess={handleRefresh}
              editRecord={editRecord}
              onCancelEdit={handleCancelEdit}
            />
          </div>
        </Card>
      </div>

      {/* ═══════ History Table Section ═══════ */}
      <MonthlyHistoryTable
        mode="free"
        refreshTrigger={refreshTrigger}
        onEdit={handleEditRecord}
        onRefresh={handleCancelEdit}
        hideDirectPrint
      />
    </div>
    </PrintableTable>
  );
};

export default FreeDrugsTotalsPage;
