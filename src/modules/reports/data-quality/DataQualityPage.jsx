import React, { useState, useMemo } from 'react';
import PageHeader from '../../../components/ui/PageHeader';
import Breadcrumb from '../../../components/ui/Breadcrumb';
import Card from '../../../components/ui/Card';
import Button from '../../../components/ui/Button';
import { useToast } from '../../../components/ui/Toast';
import invoke from '../../../api/tauriApi';
import ExportMenu from '../../../components/ui/ExportMenu';
import useReportPrintShortcut from '../../../hooks/useReportPrintShortcut';
import { exportMultiSheetExcel, exportToWord, exportToPDF } from '../../../utils/exportUtils';
import PrintableTable from '../../../components/common/PrintableTable';
import {
  ShieldCheck, AlertTriangle, Lock, Unlock, RefreshCw,
  CheckCircle, XCircle, Activity, Database,
  Pill, Syringe, ClipboardList, Layers, Building2, Calendar
} from 'lucide-react';

const MONTH_LABELS = {
  '01': 'يناير', '02': 'فبراير', '03': 'مارس', '04': 'أبريل',
  '05': 'مايو', '06': 'يونيو', '07': 'يوليو', '08': 'أغسطس',
  '09': 'سبتمبر', '10': 'أكتوبر', '11': 'نوفمبر', '12': 'ديسمبر',
};

const formatMonth = (m) => {
  if (!m) return '-';
  const [y, mo] = m.split('-');
  return `${MONTH_LABELS[mo] || mo} ${y}`;
};

const pctColor = (pct) => {
  if (pct >= 80) return 'text-emerald-600 dark:text-emerald-400';
  if (pct >= 50) return 'text-amber-600 dark:text-amber-400';
  return 'text-red-600 dark:text-red-400';
};

const pctBg = (pct) => {
  if (pct >= 80) return 'bg-emerald-500';
  if (pct >= 50) return 'bg-amber-500';
  return 'bg-red-500';
};

// Shared column definitions — used by the custom Excel/Word/PDF export AND
// by the unified print preview (options.tables), so both show identical tables.
const monthCols = [
  { header: 'الشهر', accessor: 'month' },
  { header: 'الحالة', accessor: 'status' },
  { header: 'عيادات أدوية', accessor: 'drugs' },
  { header: 'عيادات إجماليات', accessor: 'monthly' },
  { header: 'عيادات إنسولين', accessor: 'insulin' },
  { header: 'عيادات تذاكر', accessor: 'tickets' },
  { header: 'عيادات مستلزمات', accessor: 'supplies' },
  { header: 'فروع نشطة', accessor: 'branches' },
  { header: 'نسبة الاكتمال %', accessor: 'pct' },
];

const missingCols = [
  { header: 'العيادة', accessor: 'clinic' },
  { header: 'المنطقة', accessor: 'area' },
  { header: 'الفرع', accessor: 'branch' },
  { header: 'آخر نشاط', accessor: 'last' },
];

const DataQualityPage = () => {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState('');
  const [tab, setTab] = useState('months');
  // Ref to the toolbar ExportMenu — Ctrl+P opens the EXACT same PrintPreviewModal
  // that ExportMenu → "طباعة التقرير" opens (shared imperative API, no native
  // WebView2 print dialog, no window.print() path).
  const exportMenuRef = React.useRef(null);
  useReportPrintShortcut(exportMenuRef);

  const load = async () => {
    setLoading(true);
    try {
      const result = await invoke('get_data_quality_report', {
        referenceMonth: selectedMonth || null,
      });
      setData(result);
      if (!selectedMonth && result.months.length > 0) {
        setSelectedMonth(result.months[0].dispense_month);
      }
    } catch (e) {
      toast.error(`فشل تحميل البيانات: ${e}`);
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedMonthData = useMemo(() => {
    if (!data || !selectedMonth) return null;
    return data.months.find(m => m.dispense_month === selectedMonth) || null;
  }, [data, selectedMonth]);

  const monthRows = useMemo(() => {
    if (!data) return [];
    return data.months.map(m => ({
      month: formatMonth(m.dispense_month),
      status: m.is_locked ? 'مقفل' : 'مفتوح',
      drugs: `${m.clinics_with_drugs} / ${m.total_clinics}`,
      monthly: `${m.clinics_with_monthly} / ${m.total_clinics}`,
      insulin: `${m.clinics_with_insulin} / ${m.total_clinics}`,
      tickets: `${m.clinics_with_tickets} / ${m.total_clinics}`,
      supplies: `${m.clinics_with_supplies} / ${m.total_clinics}`,
      branches: `${m.branches_with_data} / ${m.total_branches}`,
      pct: `${m.completeness_pct.toFixed(1)}%`,
    }));
  }, [data]);

  const missingRows = useMemo(() => {
    if (!data) return [];
    return data.missing_clinics.map(c => ({
      clinic: c.clinic_name,
      area: c.area_name,
      branch: c.branch_name,
      last: formatMonth(c.last_active_month),
    }));
  }, [data]);

  const previewTables = useMemo(() => {
    if (!data) return undefined;
    return [
      { data: monthRows, columns: monthCols, title: 'جودة الشهور' },
      { data: missingRows, columns: missingCols, title: 'العيادات المفقودة' },
    ];
  }, [data, monthRows, missingRows]);

  const handlePremiumExport = async (type, { options }) => {
    if (!data) return false;
    try {
      const exportOptions = {
        ...options,
        title: 'تقرير جودة البيانات ومتابعة الإدخال الشهري',
        fileName: 'data_quality_report',
        summaryData: {
          headers: ['المؤشر', 'القيمة'],
          rows: [
            ['إجمالي الشهور بها بيانات', `${data.total_months_with_data} شهر`],
            ['الشهور المقفلة', `${data.total_months_locked} شهر`],
            ['متوسط نسبة الاكتمال', `${data.overall_completeness_pct.toFixed(1)}%`],
            ['عيادات تحتاج مراجعة', `${data.missing_clinics.length} عيادة`],
          ]
        }
      };

      if (type === 'excel') {
        const excelSaved = await exportMultiSheetExcel({
          'جودة الشهور': { data: monthRows, columns: monthCols, options: exportOptions },
          'العيادات المفقودة': { data: missingRows, columns: missingCols, options: exportOptions },
        }, { fileName: 'data_quality_report', title: 'تقرير جودة البيانات' });
        return excelSaved === true ? true : 'cancelled';
      }
      // Word/PDF: mirror the Excel sheets as separate titled tables
      const multiTables = [
        { data: monthRows, columns: monthCols, title: 'جودة الشهور' },
        { data: missingRows, columns: missingCols, title: 'العيادات المفقودة' },
      ];
      const wordPdfOptions = { ...exportOptions, tables: multiTables };
      if (type === 'word') { const wordSaved = await exportToWord(monthRows, monthCols, wordPdfOptions); return wordSaved === true ? true : 'cancelled'; }
      if (type === 'pdf') { const pdfSaved = await exportToPDF(monthRows, monthCols, wordPdfOptions); return pdfSaved === true ? true : 'cancelled'; }
      return false;
    } catch (e) {
      toast.error(`فشل التصدير: ${e.message || e}`);
      return false;
    }
  };

  return (
    <PrintableTable title="تقرير جودة البيانات" subtitle={selectedMonth ? formatMonth(selectedMonth) : ''}>
    <div className="min-h-screen p-6 space-y-6" dir="rtl">
      <Breadcrumb items={[
        { label: 'التقارير', href: '/reports/analytical' },
        { label: 'جودة البيانات والامتثال' }
      ]} />

      <PageHeader
        title="لوحة جودة البيانات والامتثال"
        description="مراقبة اكتمال الإدخال الشهري وكشف الشهور والعيادات الناقصة"
        icon={ShieldCheck}
        actions={
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
              <span>تحديث</span>
            </Button>
            {data && <ExportMenu ref={exportMenuRef} data={data.months || []} columns={monthCols} onCustomExport={handlePremiumExport} options={{ title: 'تقرير جودة البيانات', fileName: 'data_quality_report', subtitle: selectedMonth ? `شهر التقرير: ${formatMonth(selectedMonth)}` : '', month: selectedMonth || '', tables: previewTables }} />}
          </div>
        }
      />

      {/* KPI Cards */}
      {data && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { icon: Calendar, label: 'شهر بها بيانات', value: data.total_months_with_data, colorClass: 'bg-cyan-50 dark:bg-cyan-950/40 text-cyan-600 dark:text-cyan-400', valueClass: 'text-[var(--color-text)]' },
            { icon: Lock, label: 'شهر مقفل', value: data.total_months_locked, colorClass: 'bg-violet-50 dark:bg-violet-950/40 text-violet-600 dark:text-violet-400', valueClass: 'text-[var(--color-text)]' },
            { icon: Activity, label: 'متوسط الاكتمال', value: `${data.overall_completeness_pct.toFixed(1)}%`, colorClass: data.overall_completeness_pct >= 80 ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400' : data.overall_completeness_pct >= 50 ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400' : 'bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400', valueClass: pctColor(data.overall_completeness_pct) },
            { icon: AlertTriangle, label: 'عيادة تحتاج مراجعة', value: data.missing_clinics.length, colorClass: 'bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400', valueClass: 'text-red-600 dark:text-red-400' },
          ].map((kpi, i) => (
            <Card key={i} className="p-5 text-center space-y-1">
              <div className="flex justify-center mb-2">
                <div className={`p-2.5 rounded-xl ${kpi.colorClass}`}>
                  <kpi.icon size={20} />
                </div>
              </div>
              <p className={`text-2xl font-black ${kpi.valueClass}`}>{kpi.value}</p>
              <p className="text-xs text-[var(--color-text-muted)] font-bold">{kpi.label}</p>
            </Card>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 border-b border-[var(--color-border)]">
        {[
          { key: 'months', label: 'جودة الشهور', icon: Calendar },
          { key: 'missing', label: 'العيادات المفقودة', icon: AlertTriangle },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-black border-b-2 transition-all duration-200 -mb-px ${
              tab === t.key
                ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
            }`}
          >
            <t.icon size={15} />
            {t.label}
          </button>
        ))}
      </div>

      {/* Months Tab */}
      {tab === 'months' && data && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Months list */}
          <Card className="xl:col-span-1 p-4 space-y-2 max-h-[600px] overflow-y-auto custom-scrollbar">
            <h3 className="text-sm font-black text-[var(--color-text)] mb-3 sticky top-0 bg-[var(--color-card)] pb-2">
              قائمة الشهور ({data.months.length})
            </h3>
            {data.months.length === 0 && (
              <p className="text-sm text-[var(--color-text-muted)] text-center py-8">لا توجد بيانات مُدخلة بعد</p>
            )}
            {data.months.map(m => (
              <button
                key={m.dispense_month}
                onClick={() => setSelectedMonth(m.dispense_month)}
                className={`w-full flex items-center justify-between p-3 rounded-xl transition-all duration-200 text-right ${
                  selectedMonth === m.dispense_month
                    ? 'bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/30'
                    : 'hover:bg-[var(--color-border)]/50 border border-transparent'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  {m.is_locked
                    ? <Lock size={14} className="text-violet-500 shrink-0" />
                    : <Unlock size={14} className="text-emerald-500 shrink-0" />
                  }
                  <div>
                    <p className="text-sm font-black text-[var(--color-text)]">{formatMonth(m.dispense_month)}</p>
                    <p className={`text-xs font-bold ${pctColor(m.completeness_pct)}`}>
                      {m.completeness_pct.toFixed(0)}% اكتمال
                    </p>
                  </div>
                </div>
                <div className="w-16 h-2 bg-[var(--color-border)] rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${pctBg(m.completeness_pct)}`}
                    style={{ width: `${Math.min(m.completeness_pct, 100)}%` }} />
                </div>
              </button>
            ))}
          </Card>

          {/* Month Detail */}
          <Card className="xl:col-span-2 p-6">
            {selectedMonthData ? (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-black text-[var(--color-text)]">
                      {formatMonth(selectedMonthData.dispense_month)}
                    </h3>
                    <div className="flex items-center gap-2 mt-1">
                      {selectedMonthData.is_locked ? (
                        <span className="flex items-center gap-1 text-xs font-bold text-violet-600 dark:text-violet-400">
                          <Lock size={12} /> مقفل - لا يمكن التعديل
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                          <Unlock size={12} /> مفتوح - يمكن الإدخال والتعديل
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-center">
                    <p className={`text-4xl font-black ${pctColor(selectedMonthData.completeness_pct)}`}>
                      {selectedMonthData.completeness_pct.toFixed(0)}%
                    </p>
                    <p className="text-xs text-[var(--color-text-muted)] font-bold mt-1">نسبة الاكتمال</p>
                  </div>
                </div>

                <div className="w-full h-3 bg-[var(--color-border)] rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-700 ${pctBg(selectedMonthData.completeness_pct)}`}
                    style={{ width: `${Math.min(selectedMonthData.completeness_pct, 100)}%` }} />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'أدوية تفصيلية', count: selectedMonthData.clinics_with_drugs, icon: Pill, colorClass: 'bg-cyan-50 dark:bg-cyan-950/40 text-cyan-600 dark:text-cyan-400', barClass: 'bg-cyan-500' },
                    { label: 'إجماليات شهرية', count: selectedMonthData.clinics_with_monthly, icon: Database, colorClass: 'bg-violet-50 dark:bg-violet-950/40 text-violet-600 dark:text-violet-400', barClass: 'bg-violet-500' },
                    { label: 'إنسولين', count: selectedMonthData.clinics_with_insulin, icon: Syringe, colorClass: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400', barClass: 'bg-emerald-500' },
                    { label: 'تذاكر طبية', count: selectedMonthData.clinics_with_tickets, icon: ClipboardList, colorClass: 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400', barClass: 'bg-amber-500' },
                    { label: 'مستلزمات طبية', count: selectedMonthData.clinics_with_supplies, icon: Layers, colorClass: 'bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400', barClass: 'bg-rose-500' },
                    { label: 'فروع نشطة', count: selectedMonthData.branches_with_data, icon: Building2, colorClass: 'bg-slate-50 dark:bg-slate-950/40 text-slate-600 dark:text-slate-400', barClass: 'bg-slate-500', total: selectedMonthData.total_branches },
                  ].map(item => {
                    const total = item.total ?? selectedMonthData.total_clinics;
                    const pct = total > 0 ? (item.count / total) * 100 : 0;
                    return (
                      <div key={item.label} className="flex items-center gap-3 p-3 rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)]">
                        <div className={`p-2 rounded-lg shrink-0 ${item.colorClass}`}>
                          <item.icon size={16} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-[var(--color-text-muted)] font-bold truncate">{item.label}</p>
                          <p className="text-sm font-black text-[var(--color-text)]">
                            {item.count} <span className="text-xs font-normal text-[var(--color-text-muted)]">/ {total}</span>
                          </p>
                          <div className="w-full h-1.5 bg-[var(--color-border)] rounded-full mt-1 overflow-hidden">
                            <div className={`h-full rounded-full ${item.barClass}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-40 text-[var(--color-text-muted)]">
                <p className="text-sm font-bold">اختر شهراً لعرض التفاصيل</p>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* Missing Clinics Tab */}
      {tab === 'missing' && data && (
        <Card className="p-0 overflow-hidden">
          <div className="p-5 border-b border-[var(--color-border)] flex items-center gap-3">
            <AlertTriangle size={18} className="text-amber-500" />
            <div>
              <h3 className="text-sm font-black text-[var(--color-text)]">العيادات المفقودة في الشهر المحدد</h3>
              <p className="text-xs text-[var(--color-text-muted)]">
                عيادات كانت تُدخل بيانات في شهور سابقة ولم تُدخل في الشهر المرجعي:
                <strong className="text-[var(--color-primary)] mr-1">{formatMonth(selectedMonth)}</strong>
              </p>
            </div>
          </div>

          {data.missing_clinics.length === 0 ? (
            <div className="p-16 text-center">
              <CheckCircle size={40} className="text-emerald-500 mx-auto mb-3" />
              <p className="text-sm font-black text-emerald-600 dark:text-emerald-400">ممتاز! جميع العيادات النشطة أدخلت بياناتها</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg)]">
                    {['#', 'العيادة', 'المنطقة', 'الفرع', 'آخر نشاط', 'الحالة'].map(h => (
                      <th key={h} className="px-4 py-3 text-right text-xs font-black text-[var(--color-text-muted)]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.missing_clinics.map((c, i) => (
                    <tr key={i} className="border-b border-[var(--color-border)]/50 hover:bg-[var(--color-border)]/20 transition-colors">
                      <td className="px-4 py-3 text-xs text-[var(--color-text-muted)] font-mono">{i + 1}</td>
                      <td className="px-4 py-3 font-bold text-[var(--color-text)]">{c.clinic_name}</td>
                      <td className="px-4 py-3 text-[var(--color-text-muted)]">{c.area_name}</td>
                      <td className="px-4 py-3 text-[var(--color-text-muted)]">{c.branch_name}</td>
                      <td className="px-4 py-3">
                        <span className="text-xs font-bold text-amber-600 dark:text-amber-400">
                          {formatMonth(c.last_active_month)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400">
                          <XCircle size={10} />
                          بيانات ناقصة
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {!data && !loading && (
        <Card className="p-16 text-center">
          <Database size={40} className="mx-auto mb-3 text-[var(--color-text-muted)]" />
          <p className="text-sm font-bold text-[var(--color-text-muted)]">اضغط تحديث لتحميل تقرير جودة البيانات</p>
        </Card>
      )}
      {loading && (
        <Card className="p-16 text-center">
          <RefreshCw size={32} className="animate-spin mx-auto mb-3 text-[var(--color-primary)]" />
          <p className="text-sm font-bold text-[var(--color-text-muted)]">جاري تحليل بيانات النظام...</p>
        </Card>
      )}

    </div>
    </PrintableTable>
  );
};

export default DataQualityPage;
