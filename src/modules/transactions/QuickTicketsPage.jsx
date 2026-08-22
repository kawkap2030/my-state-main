import React, { useState } from 'react';
import PageHeader from '../../components/ui/PageHeader';
import Breadcrumb from '../../components/ui/Breadcrumb';
import QuickTicketsEntry from '../../components/forms/QuickTicketsEntry';
import PrintableTable from '../../components/common/PrintableTable';
import { useGlobalApp } from '../../context/useGlobalApp';
import { buildHierarchyLabel } from '../../utils/reportUtils';
import { ClipboardList } from 'lucide-react';

const QuickTicketsPage = () => {
  const currentMonth = new Date().toISOString().substring(0, 7);
  const { workspaceMode, hierarchyNames } = useGlobalApp();
  const [dispenseMonth, setDispenseMonth] = useState(currentMonth);

  // The quick entry adapts to the current isolation level:
  //   branches → pick one branch or "الكل" (all branches as rows)
  //   areas    → pick a branch, all its areas become rows
  //   clinics  → pick branch + area, then one or more clinics as rows
  const level = workspaceMode === 'branches' ? 'branches'
    : workspaceMode === 'areas' ? 'areas' : 'clinics';

  return (
    <PrintableTable
      title="إدخال سريع للتذاكر الطبية"
      subtitle={dispenseMonth ? `شهر ${dispenseMonth}` : ''}
      hierarchyLabel={buildHierarchyLabel(workspaceMode, hierarchyNames)}
    >
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
          description="إدخال تذاكر طبية لجميع الجهات في جدول واحد دفعة واحدة حسب نطاق العمل (فروع / مناطق / عيادات)"
        />

        <QuickTicketsEntry
          level={level}
          dispenseMonth={dispenseMonth}
          onMonthChange={(e) => setDispenseMonth(e.target.value)}
        />
      </div>
    </PrintableTable>
  );
};

export default QuickTicketsPage;
