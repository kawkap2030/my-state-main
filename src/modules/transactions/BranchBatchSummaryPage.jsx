import React, { useState } from 'react';
import PageHeader from '../../components/ui/PageHeader';
import Breadcrumb from '../../components/ui/Breadcrumb';
import BranchBatchSummaryEntry from '../../components/forms/BranchBatchSummaryEntry';
import PrintableTable from '../../components/common/PrintableTable';
import { FileSpreadsheet, Calendar } from 'lucide-react';

const BranchBatchSummaryPage = () => {
  const currentMonth = new Date().toISOString().substring(0, 7);
  const [dispenseMonth, setDispenseMonth] = useState(currentMonth);

  return (
    <PrintableTable title="ملخص الفروع (دفعة واحدة)" subtitle={dispenseMonth ? `شهر ${dispenseMonth}` : ''}>
    <div className="space-y-6 animate-fadeIn">
      <Breadcrumb
        items={[
          { label: 'العمليات اليومية' },
          { label: 'ملخص الفروع (دفعة واحدة)' },
        ]}
      />

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <PageHeader
          title="إدخال ملخص الفروع دفعة واحدة"
          icon={FileSpreadsheet}
          description="إدخال ملخص المنصرف الشهري لجميع الفروع في جدول واحد"
        />
        
        <div className="flex items-center gap-3 bg-[var(--color-bg-card)] p-3 rounded-xl border border-[var(--color-border)]">
          <Calendar size={20} className="text-[var(--color-primary)]" />
          <label className="text-sm font-bold text-[var(--color-text-muted)]">الشهر:</label>
          <input
            type="month"
            value={dispenseMonth}
            onChange={e => setDispenseMonth(e.target.value)}
            className="px-3 py-2 border border-[var(--color-border)] rounded-lg bg-[var(--color-bg)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] font-bold"
          />
        </div>
      </div>

      <div className="mt-8">
        <BranchBatchSummaryEntry dispenseMonth={dispenseMonth} />
      </div>
    </div>
    </PrintableTable>
  );
};

export default BranchBatchSummaryPage;
