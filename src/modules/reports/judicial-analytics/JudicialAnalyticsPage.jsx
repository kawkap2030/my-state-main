import React, { useState } from 'react';
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
  Gavel, Users, DollarSign, TrendingDown, RefreshCw, Award,
  AlertCircle, Activity, Pill, ChevronRight, Calendar, BarChart3
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';

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

const fmt = (n) => new Intl.NumberFormat('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);

const COLORS = ['#6366f1', '#8b5cf6', '#a78bfa', '#c4b5fd', '#ddd6fe', '#ede9fe', '#f5f3ff',
  '#06b6d4', '#0ea5e9', '#38bdf8', '#67e8f9', '#a5f3fc', '#e0f2fe', '#f0f9ff'];

const JudicialAnalyticsPage = () => {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [startMonth, setStartMonth] = useState('');
  const [endMonth, setEndMonth] = useState('');
  const [tab, setTab] = useState('patients');
  // Ref to the toolbar ExportMenu — Ctrl+P opens the EXACT same PrintPreviewModal
  // that ExportMenu → "طباعة التقرير" opens (shared imperative API, no native
  // WebView2 print dialog, no window.print() path).
  const exportMenuRef = React.useRef(null);
  useReportPrintShortcut(exportMenuRef);

  const load = async () => {
    setLoading(true);
    try {
      const result = await invoke('get_judicial_analytics', {
        branchId: null,
        areaId: null,
        startMonth: startMonth || null,
        endMonth: endMonth || null,
      });
      setData(result);
    } catch (e) {
      toast.error(`فشل التحميل: ${e}`);
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePremiumExport = async (type, { options }) => {
    if (!data) return false;
    try {
      const patientCols = [
        { header: '#', accessor: 'rank' },
        { header: 'اسم المريض', accessor: 'name' },
        { header: 'التشخيص', accessor: 'diagnosis' },
        { header: 'إجمالي التكلفة', accessor: 'total_cost' },
        { header: 'شهور نشطة', accessor: 'months' },
        { header: 'متوسط شهري', accessor: 'avg' },
        { header: 'عدد الأدوية', accessor: 'meds' },
      ];
      const patientRows = data.top_patients.map((p, i) => ({
        rank: i + 1,
        name: p.patient_name,
        diagnosis: p.diagnosis,
        total_cost: fmt(p.total_cost),
        months: p.months_active,
        avg: fmt(p.avg_monthly_cost),
        meds: p.medicine_count,
      }));

      const diagCols = [
        { header: 'التشخيص', accessor: 'diag' },
        { header: 'عدد المرضى', accessor: 'count' },
        { header: 'إجمالي التكلفة', accessor: 'cost' },
        { header: 'متوسط تكلفة المريض', accessor: 'avg' },
      ];
      const diagRows = data.diagnosis_groups.map(d => ({
        diag: d.diagnosis,
        count: d.patient_count,
        cost: fmt(d.total_cost),
        avg: fmt(d.avg_cost_per_patient),
      }));

      const contCols = [
        { header: 'المريض', accessor: 'name' },
        { header: 'التشخيص', accessor: 'diag' },
        { header: 'شهور متوقعة', accessor: 'expected' },
        { header: 'شهور فعلية', accessor: 'actual' },
        { header: 'نسبة الاستمرارية', accessor: 'pct' },
        { header: 'آخر نشاط', accessor: 'last' },
      ];
      const contRows = data.continuity_issues.map(c => ({
        name: c.patient_name,
        diag: c.diagnosis,
        expected: c.expected_months,
        actual: c.actual_months,
        pct: `${c.continuity_pct.toFixed(0)}%`,
        last: formatMonth(c.last_active_month),
      }));

      const exportOptions = {
        ...options,
        title: 'تحليل الأحكام القضائية والمرضى',
        fileName: 'judicial_analytics',
        summaryData: {
          headers: ['المؤشر', 'القيمة'],
          rows: [
            ['إجمالي المرضى', `${data.total_patients} مريض`],
            ['إجمالي التكلفة', `${fmt(data.total_cost)} جنيه`],
            ['متوسط تكلفة المريض الشهرية', `${fmt(data.avg_cost_per_patient)} جنيه`],
            ['أغلى دواء', data.most_expensive_medicine || '-'],
          ]
        }
      };

      if (type === 'excel') {
        const excelSaved = await exportMultiSheetExcel({
          'كبار المرضى': { data: patientRows, columns: patientCols, options: exportOptions },
          'التشخيصات': { data: diagRows, columns: diagCols, options: exportOptions },
          'الاستمرارية': { data: contRows, columns: contCols, options: exportOptions },
        }, { fileName: 'judicial_analytics', title: 'تحليل الأحكام القضائية' });
        return excelSaved === true ? true : 'cancelled';
      }
      // Word/PDF: mirror the Excel sheets as separate titled tables
      const multiTables = [
        { data: patientRows, columns: patientCols, title: 'كبار المرضى' },
        { data: diagRows, columns: diagCols, title: 'التشخيصات' },
        { data: contRows, columns: contCols, title: 'الاستمرارية' },
      ];
      const wordPdfOptions = { ...exportOptions, tables: multiTables };
      if (type === 'word') { const wordSaved = await exportToWord(patientRows, patientCols, wordPdfOptions); return wordSaved === true ? true : 'cancelled'; }
      if (type === 'pdf') { const pdfSaved = await exportToPDF(patientRows, patientCols, wordPdfOptions); return pdfSaved === true ? true : 'cancelled'; }
      return false;
    } catch (e) {
      toast.error(`فشل التصدير: ${e.message || e}`);
      return false;
    }
  };

  const continuityColor = (pct) => {
    if (pct >= 90) return 'text-emerald-600 dark:text-emerald-400';
    if (pct >= 60) return 'text-amber-600 dark:text-amber-400';
    return 'text-red-600 dark:text-red-400';
  };

  return (
    <PrintableTable title="تحليل الأحكام القضائية والمرضى" subtitle={startMonth && endMonth ? `من ${formatMonth(startMonth)} إلى ${formatMonth(endMonth)}` : ''}>
    <div className="min-h-screen p-6 space-y-6" dir="rtl">
      <Breadcrumb items={[
        { label: 'التقارير', href: '/reports/analytical' },
        { label: 'تحليل الأحكام القضائية' }
      ]} />

      <PageHeader
        title="تحليل الأحكام القضائية والمرضى"
        description="تحليل شامل لمرضى الأحكام القضائية من حيث التكلفة والاستمرارية والتشخيصات"
        icon={Gavel}
        actions={
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <input type="month" value={startMonth} onChange={e => setStartMonth(e.target.value)}
                className="text-sm border border-[var(--color-border)] rounded-lg px-3 py-1.5 bg-[var(--color-bg)] text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30"
                placeholder="من شهر" />
              <span className="text-xs text-[var(--color-text-muted)] font-bold">إلى</span>
              <input type="month" value={endMonth} onChange={e => setEndMonth(e.target.value)}
                className="text-sm border border-[var(--color-border)] rounded-lg px-3 py-1.5 bg-[var(--color-bg)] text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30"
                placeholder="إلى شهر" />
            </div>
            <Button variant="primary" size="sm" onClick={load} disabled={loading}>
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
              <span>{loading ? 'جاري التحليل...' : 'تحليل'}</span>
            </Button>
            {data && <ExportMenu ref={exportMenuRef} data={data.top_patients || []} onCustomExport={handlePremiumExport} />}
          </div>
        }
      />

      {/* KPI Cards */}
      {data && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { icon: Users, label: 'إجمالي المرضى', value: `${data.total_patients}`, colorClass: 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400', valueClass: 'text-[var(--color-text)]' },
            { icon: DollarSign, label: 'إجمالي التكلفة', value: `${fmt(data.total_cost)} ج`, colorClass: 'bg-cyan-50 dark:bg-cyan-950/40 text-cyan-600 dark:text-cyan-400', valueClass: 'text-[var(--color-text)]' },
            { icon: Activity, label: 'متوسط شهري/مريض', value: `${fmt(data.avg_cost_per_patient)} ج`, colorClass: 'bg-violet-50 dark:bg-violet-950/40 text-violet-600 dark:text-violet-400', valueClass: 'text-[var(--color-text)]' },
            { icon: Pill, label: 'أغلى دواء', value: data.most_expensive_medicine || '-', colorClass: 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400', valueClass: 'text-[var(--color-text)] text-xs font-bold' },
          ].map((kpi, i) => (
            <Card key={i} className="p-5 text-center space-y-1">
              <div className="flex justify-center mb-2">
                <div className={`p-2.5 rounded-xl ${kpi.colorClass}`}>
                  <kpi.icon size={20} />
                </div>
              </div>
              <p className={`text-xl font-black truncate ${kpi.valueClass}`}>{kpi.value}</p>
              <p className="text-xs text-[var(--color-text-muted)] font-bold">{kpi.label}</p>
            </Card>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 border-b border-[var(--color-border)]">
        {[
          { key: 'patients', label: 'كبار المرضى', icon: Award },
          { key: 'diagnoses', label: 'تحليل التشخيصات', icon: BarChart3 },
          { key: 'continuity', label: 'انتظام العلاج', icon: TrendingDown },
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

      {/* Top Patients */}
      {tab === 'patients' && data && (
        <div className="space-y-4">
          {/* Top patients bar chart */}
          {data.top_patients.length > 0 && (
            <Card className="p-5">
              <h3 className="text-sm font-black text-[var(--color-text)] mb-4">أعلى 10 مرضى بالتكلفة الإجمالية</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.top_patients.slice(0, 10).map(p => ({
                    name: p.patient_name.length > 12 ? p.patient_name.slice(0, 12) + '...' : p.patient_name,
                    cost: p.total_cost,
                  }))} margin={{ top: 5, right: 20, bottom: 40, left: 20 }}>
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--color-text-muted)', fontFamily: 'inherit' }} angle={-30} textAnchor="end" interval={0} />
                    <YAxis tick={{ fontSize: 10, fill: 'var(--color-text-muted)', fontFamily: 'inherit' }} />
                    <Tooltip formatter={(v) => [fmt(v), 'التكلفة الإجمالية']} contentStyle={{ background: 'var(--color-card)', border: '1px solid var(--color-border)', borderRadius: '8px', direction: 'rtl', fontSize: '12px' }} />
                    <Bar dataKey="cost" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          )}

          {/* Top patients table */}
          <Card className="p-0 overflow-hidden">
            <div className="p-4 border-b border-[var(--color-border)]">
              <h3 className="text-sm font-black text-[var(--color-text)]">قائمة كبار المرضى ({data.top_patients.length})</h3>
            </div>
            {data.top_patients.length === 0 ? (
              <div className="p-12 text-center text-[var(--color-text-muted)]">
                <Gavel size={36} className="mx-auto mb-3 opacity-40" />
                <p className="text-sm font-bold">لا توجد بيانات أحكام قضائية للفترة المحددة</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg)]">
                      {['#', 'المريض', 'التشخيص', 'إجمالي التكلفة', 'شهور نشطة', 'متوسط شهري', 'عدد أدويته'].map(h => (
                        <th key={h} className="px-4 py-3 text-right text-xs font-black text-[var(--color-text-muted)]">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.top_patients.map((p, i) => (
                      <tr key={p.patient_id} className="border-b border-[var(--color-border)]/50 hover:bg-[var(--color-border)]/20 transition-colors">
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-black ${
                            i === 0 ? 'bg-amber-100 text-amber-700' :
                            i === 1 ? 'bg-slate-100 text-slate-600' :
                            i === 2 ? 'bg-orange-100 text-orange-700' :
                            'bg-[var(--color-bg)] text-[var(--color-text-muted)]'
                          }`}>{i + 1}</span>
                        </td>
                        <td className="px-4 py-3 font-bold text-[var(--color-text)]">{p.patient_name}</td>
                        <td className="px-4 py-3 text-[var(--color-text-muted)] text-xs max-w-32 truncate" title={p.diagnosis}>{p.diagnosis}</td>
                        <td className="px-4 py-3 font-black text-rose-600 dark:text-rose-400">{fmt(p.total_cost)}</td>
                        <td className="px-4 py-3 text-center">
                          <span className="inline-flex items-center gap-1 text-xs font-bold text-[var(--color-text-muted)]">
                            <Calendar size={10} />{p.months_active}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-[var(--color-text-muted)] text-xs">{fmt(p.avg_monthly_cost)}</td>
                        <td className="px-4 py-3 text-center">
                          <span className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 dark:text-indigo-400">
                            <Pill size={10} />{p.medicine_count}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* Diagnosis Groups */}
      {tab === 'diagnoses' && data && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {/* Pie Chart */}
          {data.diagnosis_groups.length > 0 && (
            <Card className="p-5">
              <h3 className="text-sm font-black text-[var(--color-text)] mb-4">توزيع التكلفة حسب التشخيص</h3>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={data.diagnosis_groups.slice(0, 8).map(d => ({ name: d.diagnosis, value: d.total_cost }))}
                      cx="50%" cy="50%" outerRadius={100} label={({ name, percent }) => `${name.slice(0, 14)}: ${(percent * 100).toFixed(0)}%`}
                      labelLine={false} fontSize={9}
                    >
                      {data.diagnosis_groups.slice(0, 8).map((_, idx) => (
                        <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => [fmt(v), 'التكلفة الإجمالية']} contentStyle={{ background: 'var(--color-card)', border: '1px solid var(--color-border)', borderRadius: '8px', direction: 'rtl', fontSize: '11px' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </Card>
          )}

          {/* Diagnosis table */}
          <Card className="p-0 overflow-hidden">
            <div className="p-4 border-b border-[var(--color-border)]">
              <h3 className="text-sm font-black text-[var(--color-text)]">مجموعات التشخيص ({data.diagnosis_groups.length})</h3>
            </div>
            {data.diagnosis_groups.length === 0 ? (
              <div className="p-12 text-center text-[var(--color-text-muted)]">
                <p className="text-sm font-bold">لا توجد بيانات</p>
              </div>
            ) : (
              <div className="overflow-x-auto max-h-72">
                <table className="w-full text-sm">
                  <thead className="sticky top-0">
                    <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg)]">
                      {['التشخيص', 'المرضى', 'إجمالي التكلفة', 'متوسط/مريض'].map(h => (
                        <th key={h} className="px-4 py-3 text-right text-xs font-black text-[var(--color-text-muted)]">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.diagnosis_groups.map((d, i) => (
                      <tr key={i} className="border-b border-[var(--color-border)]/50 hover:bg-[var(--color-border)]/20 transition-colors">
                        <td className="px-4 py-3 font-bold text-[var(--color-text)] max-w-40 truncate" title={d.diagnosis}>{d.diagnosis}</td>
                        <td className="px-4 py-3 text-center font-black text-indigo-600 dark:text-indigo-400">{d.patient_count}</td>
                        <td className="px-4 py-3 font-black text-rose-600 dark:text-rose-400">{fmt(d.total_cost)}</td>
                        <td className="px-4 py-3 text-[var(--color-text-muted)] text-xs">{fmt(d.avg_cost_per_patient)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* Continuity Issues */}
      {tab === 'continuity' && data && (
        <Card className="p-0 overflow-hidden">
          <div className="p-5 border-b border-[var(--color-border)] flex items-start gap-3">
            <AlertCircle size={18} className="text-amber-500 shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-black text-[var(--color-text)]">مرضى بانقطاع في الصرف الشهري</h3>
              <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                المرضى الذين لم يستلموا أدويتهم في كل شهر من تاريخ بدء علاجهم حتى آخر تسجيل. يُشير إلى احتمال انقطاع العلاج أو أخطاء في الإدخال.
              </p>
            </div>
          </div>

          {data.continuity_issues.length === 0 ? (
            <div className="p-16 text-center">
              <ChevronRight size={40} className="text-emerald-500 mx-auto mb-3" />
              <p className="text-sm font-black text-emerald-600 dark:text-emerald-400">جميع المرضى منتظمون في صرف أدويتهم</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg)]">
                    {['#', 'المريض', 'التشخيص', 'شهور متوقعة', 'شهور فعلية', 'شهور مفقودة', 'الانتظام', 'آخر نشاط'].map(h => (
                      <th key={h} className="px-4 py-3 text-right text-xs font-black text-[var(--color-text-muted)]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.continuity_issues.map((c, i) => (
                    <tr key={i} className="border-b border-[var(--color-border)]/50 hover:bg-[var(--color-border)]/20 transition-colors">
                      <td className="px-4 py-3 text-xs text-[var(--color-text-muted)]">{i + 1}</td>
                      <td className="px-4 py-3 font-bold text-[var(--color-text)]">{c.patient_name}</td>
                      <td className="px-4 py-3 text-xs text-[var(--color-text-muted)] max-w-32 truncate" title={c.diagnosis}>{c.diagnosis}</td>
                      <td className="px-4 py-3 text-center font-bold text-[var(--color-text)]">{c.expected_months}</td>
                      <td className="px-4 py-3 text-center font-bold text-emerald-600 dark:text-emerald-400">{c.actual_months}</td>
                      <td className="px-4 py-3 text-center font-black text-red-600 dark:text-red-400">{c.expected_months - c.actual_months}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-2 bg-[var(--color-border)] rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${c.continuity_pct >= 90 ? 'bg-emerald-500' : c.continuity_pct >= 60 ? 'bg-amber-500' : 'bg-red-500'}`}
                              style={{ width: `${Math.min(c.continuity_pct, 100)}%` }} />
                          </div>
                          <span className={`text-xs font-black ${continuityColor(c.continuity_pct)}`}>
                            {c.continuity_pct.toFixed(0)}%
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-amber-600 dark:text-amber-400 font-bold">
                        {formatMonth(c.last_active_month)}
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
          <Gavel size={40} className="mx-auto mb-3 text-[var(--color-text-muted)]" />
          <p className="text-sm font-bold text-[var(--color-text-muted)]">اضغط "تحليل" لتحميل بيانات الأحكام القضائية</p>
        </Card>
      )}
      {loading && (
        <Card className="p-16 text-center">
          <RefreshCw size={32} className="animate-spin mx-auto mb-3 text-[var(--color-primary)]" />
          <p className="text-sm font-bold text-[var(--color-text-muted)]">جاري تحليل بيانات الأحكام القضائية...</p>
        </Card>
      )}
    </div>
    </PrintableTable>
  );
};

export default JudicialAnalyticsPage;
