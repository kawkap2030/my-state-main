import React, { useState } from "react";
import { useLocation } from "react-router-dom";
import PageHeader from "../../../components/ui/PageHeader";
import Breadcrumb from "../../../components/ui/Breadcrumb";
import HierarchySelector from "../../../components/common/HierarchySelector";
import MonthlyDispensedForm from "../../../components/forms/MonthlyDispensedForm";
import BranchMonthlyGridEntry from "../../../components/forms/BranchMonthlyGridEntry";
import ExcelImportWizard from "../../../components/common/ExcelImportWizard";
import PrintableTable from '../../../components/common/PrintableTable';
import { useGlobalApp } from '../../../context/useGlobalApp';
import { buildHierarchyLabel } from '../../../utils/reportUtils';
import { FileText, LayoutGrid, FileEdit, FileSpreadsheet } from "lucide-react";

const MonthlyTotalsPage = () => {
  const location = useLocation();
  const { workspaceMode, hierarchyNames } = useGlobalApp();
  const [hierarchy, setHierarchy] = useState({
    branchId: location.state?.branchId || "",
    areaId: location.state?.areaId || "",
    clinicId: location.state?.clinicId || "",
    dispenseMonth:
      location.state?.dispenseMonth || new Date().toISOString().substring(0, 7),
  });

  const [entryMode, setEntryMode] = useState("single"); // 'single' | 'grid' | 'excel'

  return (
    <PrintableTable title="إجمالي المنصرف الشهري" subtitle={hierarchy.dispenseMonth ? `شهر ${hierarchy.dispenseMonth}` : ''} hierarchyLabel={buildHierarchyLabel(workspaceMode, hierarchyNames)}>
    <div className="space-y-6 animate-fadeIn">
      <Breadcrumb
        items={[
          { label: "العمليات اليومية" },
          { label: "المنصرف الشهري (إجمالي)" },
        ]}
      />

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <PageHeader
          title="إجمالي المنصرف الشهري"
          icon={FileText}
          description="إدخال القيم الإجمالية للمنصرف الشهري (مجاني، مدعم، مستلزمات) لكل عيادة."
        />
        
        <div className="flex bg-[var(--color-bg-card)] p-1 rounded-xl border border-[var(--color-border)] self-start md:self-auto flex-wrap gap-1">
          <button
            onClick={() => setEntryMode('single')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${entryMode === 'single' ? 'bg-[var(--color-primary)] text-white shadow-md' : 'text-[var(--color-text-muted)] hover:bg-[var(--color-border)]'}`}
          >
            <FileEdit size={14} /> إدخال فردي
          </button>
          <button
            onClick={() => setEntryMode('grid')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${entryMode === 'grid' ? 'bg-[var(--color-primary)] text-white shadow-md' : 'text-[var(--color-text-muted)] hover:bg-[var(--color-border)]'}`}
          >
            <LayoutGrid size={14} /> إدخال شبكي مجمع
          </button>
          <button
            onClick={() => setEntryMode('excel')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${entryMode === 'excel' ? 'bg-[var(--color-primary)] text-white shadow-md' : 'text-[var(--color-text-muted)] hover:bg-[var(--color-border)]'}`}
          >
            <FileSpreadsheet size={14} /> استيراد من Excel
          </button>
        </div>
      </div>

      <HierarchySelector
        onSelectionChange={(data) => setHierarchy(prev => ({ ...prev, ...data }))}
        initialBranch={hierarchy.branchId}
        initialArea={hierarchy.areaId}
        initialClinic={hierarchy.clinicId}
        initialMonth={hierarchy.dispenseMonth}
      />

      <div className="mt-8">
        {entryMode === 'single' ? (
          <MonthlyDispensedForm hierarchy={hierarchy} />
        ) : entryMode === 'grid' ? (
          <BranchMonthlyGridEntry branchId={hierarchy.branchId} dispenseMonth={hierarchy.dispenseMonth} />
        ) : (
          <div className="neu-card p-6">
            <h3 className="text-lg font-black mb-4 text-[var(--color-text)] flex items-center gap-2">
              <FileSpreadsheet size={20} className="text-[var(--color-primary)]" />
              استيراد إجماليات المنصرف الشهري من Excel
            </h3>
            <ExcelImportWizard
              importType="monthly_drugs"
              hierarchyContext={hierarchy}
              onImportComplete={() => {
                // Refresh logic if needed, or user can switch views
              }}
            />
          </div>
        )}
      </div>
    </div>
    </PrintableTable>
  );
};

export default MonthlyTotalsPage;
