import React, { useState } from "react";
import { useLocation, Link } from "react-router-dom";
import PageHeader from "../../../components/ui/PageHeader";
import Breadcrumb from "../../../components/ui/Breadcrumb";
import HierarchySelector from "../../../components/common/HierarchySelector";
import DetailedSuppliesForm from "../../../components/forms/DetailedSuppliesForm";
import {
  Layers,
  MapPin,
  LayoutGrid,
  Home,
  Lock,
  Unlock,
  ShoppingCart,
  History,
  Box,
} from "lucide-react";
import Card from "../../../components/ui/Card";
import MonthlyHistoryTable from "../../../components/common/MonthlyHistoryTable";
import { useGlobalApp } from "../../../context/useGlobalApp";
import { ToggleLeft, ToggleRight } from "lucide-react";

import PrintableTable from '../../../components/common/PrintableTable';

const SuppliesTotalsPage = () => {
  const location = useLocation();
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
  const [currentRecord, setCurrentRecord] = useState(null);

  const handleRefresh = () => {
    setRefreshTrigger((prev) => prev + 1);
    setCurrentRecord(null);
  };

  const handleEditRecord = (record) => {
    setHierarchy({
      level: record.clinic_id ? "clinic" : record.area_id ? "area" : "branch",
      branchId: record.branch_id?.toString() || "",
      areaId: record.area_id?.toString() || "",
      clinicId: record.clinic_id?.toString() || "",
      dispenseMonth: record.dispense_month || "",
    });
    setCurrentRecord(record);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleCancelEdit = () => {
    setHierarchy((prev) => ({
      ...prev,
      branchId: "",
      areaId: "",
      clinicId: "",
    }));
    setCurrentRecord(null);
  };

  return (
    <PrintableTable title="المنصرف الشهري (مستلزمات طبية)" subtitle={hierarchy.dispenseMonth ? `شهر ${hierarchy.dispenseMonth}` : ''}>
    <div className="space-y-6 animate-fadeIn pb-20">
      <div className="no-print space-y-6">
        {/* Premium Header Banner */}
        <div className="bg-gradient-to-r from-[var(--color-info)] to-[var(--color-info)]/80 text-white p-6 rounded-3xl shadow-xl flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="bg-white/20 p-3 rounded-2xl backdrop-blur-sm">
              <ShoppingCart size={32} className="text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-black">
                المنصرف الشهري (مستلزمات طبية)
              </h1>
              <p className="text-blue-100 text-xs font-bold opacity-80 uppercase tracking-widest">
                قسم المستلزمات
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/"
              className="flex items-center gap-2 px-5 py-2.5 bg-white text-[var(--color-info)] rounded-xl font-black text-sm hover:bg-blue-50 transition-all shadow-lg"
            >
              <Home size={18} /> العودة للرئيسية
            </Link>
            <div className="px-4 py-2 bg-black/10 rounded-xl border border-white/10 backdrop-blur-sm text-[10px] font-black uppercase tracking-tighter">
              Medical Supplies Module
            </div>
          </div>
        </div>

        {/* ═══════ Add New Record Section ═══════ */}
        <div className="space-y-6">
          {/* Hierarchy Section */}
          <Card className="p-6 border-t-4 border-t-[var(--color-info)] shadow-[var(--color-info)]/10 transition-all">
            <div className="flex items-center gap-3 mb-6 pb-4 border-b border-[var(--color-border)]">
              <div className="p-2.5 rounded-xl bg-[var(--color-bg)] text-[var(--color-text-muted)] shadow-sm border border-[var(--color-border)]">
                <MapPin size={20} />
              </div>
              <h3 className="text-lg font-black text-[var(--color-text)]">
                بيانات عملية الصرف
              </h3>
            </div>

            <div className="space-y-4">
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
                        // Restore locked level mode
                        const mode = lockedLevel === 'branch' ? 'branches' : lockedLevel === 'area' ? 'areas' : 'clinics';
                        setWorkspaceMode(mode);
                        // Also clear the hierarchy sub-levels locally to be safe
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

              <HierarchySelector
                onSelectionChange={(data) =>
                  setHierarchy({ ...hierarchy, ...data })
                }
                initialBranch={hierarchy.branchId}
                initialArea={hierarchy.areaId}
                initialClinic={hierarchy.clinicId}
                initialMonth={hierarchy.dispenseMonth}
                hideSearch={true}
                compact={true}
              />
            </div>
          </Card>

          {/* Main Content: Input Form */}
          <Card className="p-8 border-t-4 border-t-[var(--color-info)] transition-all">
            <div className="flex items-center gap-3 mb-8 pb-4 border-b border-[var(--color-border)]">
              <div className="p-2.5 rounded-xl bg-[var(--color-info-bg)] text-[var(--color-info)] shadow-sm border border-[var(--color-info)]/20">
                <LayoutGrid size={24} />
              </div>
              <div>
                <h3 className="text-xl font-black text-[var(--color-text)]">
                  المنصرف الشهري (مستلزمات طبية)
                </h3>
                <p className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-widest mt-1">
                  أدخل المنصرف التفصيلي للمستلزمات الطبية
                </p>
              </div>
            </div>

            <DetailedSuppliesForm
              hierarchy={hierarchy}
              onSuccess={handleRefresh}
              currentRecord={currentRecord}
              onCancelEdit={() => setCurrentRecord(null)}
            />
          </Card>
        </div>
      </div>

      {/* ═══════ History Table Section ═══════ */}
      <MonthlyHistoryTable
        mode="supplies"
        refreshTrigger={refreshTrigger}
        onEdit={handleEditRecord}
        onRefresh={handleCancelEdit}
      />
    </div>
    </PrintableTable>
  );
};

export default SuppliesTotalsPage;
