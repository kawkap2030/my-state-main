import React, { useState } from 'react';
import PageHeader from '../../components/ui/PageHeader';
import Breadcrumb from '../../components/ui/Breadcrumb';
import QuickTicketsEntry from '../../components/forms/QuickTicketsEntry';
import HierarchySelector from '../../components/common/HierarchySelector';
import PrintableTable from '../../components/common/PrintableTable';
import { ClipboardList, Building2 } from 'lucide-react';

const QuickTicketsPage = () => {
  const currentMonth = new Date().toISOString().substring(0, 7);
  const [hierarchy, setHierarchy] = useState({
    branchId: "",
    areaId: "",
    clinicId: "",
    dispenseMonth: currentMonth,
  });

  return (
    <PrintableTable title="إدخال سريع للتذاكر الطبية" subtitle={hierarchy.dispenseMonth ? `شهر ${hierarchy.dispenseMonth}` : ''}>
    <div className="space-y-6 animate-fadeIn">
      <Breadcrumb
        items={[
          { label: 'العمليات اليومية' },
          { label: 'إدخال سريع للتذاكر الطبية' },
        ]}
      />

      <PageHeader
        title="إدخال سريع للتذاكر الطبية"
        icon={ClipboardList}
        description="إدخال تذاكر طبية لجميع عيادات الفرع في جدول واحد دفعة واحدة"
      />

      <div className="bg-[var(--color-bg-card)] p-6 rounded-xl border border-[var(--color-border)] shadow-sm">
        <div className="flex items-center gap-2 text-sm font-bold text-[var(--color-primary)] mb-4">
          <Building2 size={18} />
          <span>تحديد الفرع</span>
        </div>
        <HierarchySelector
          onSelectionChange={(data) => setHierarchy({ ...hierarchy, ...data })}
          initialBranch={hierarchy.branchId}
          initialArea={hierarchy.areaId}
          initialClinic={hierarchy.clinicId}
          initialMonth={hierarchy.dispenseMonth}
          compact={true}
        />
      </div>

      <div className="mt-8">
        <QuickTicketsEntry 
          branchId={hierarchy.branchId} 
          dispenseMonth={hierarchy.dispenseMonth}
        />
      </div>
    </div>
    </PrintableTable>
  );
};

export default QuickTicketsPage;
