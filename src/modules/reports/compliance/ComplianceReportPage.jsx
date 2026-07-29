import React, { useState, useMemo } from 'react';
import PageHeader from '../../../components/ui/PageHeader';
import Breadcrumb from '../../../components/ui/Breadcrumb';
import Card from '../../../components/ui/Card';
import Button from '../../../components/ui/Button';
import ExportMenu from '../../../components/ui/ExportMenu';
import PrintableTable from '../../../components/common/PrintableTable';
import { useToast } from '../../../components/ui/Toast';
import invoke from '../../../api/tauriApi';
import { exportMultiSheetExcel, exportToWord, exportToPDF } from '../../../utils/exportUtils';
import {
  ClipboardCheck, Search, CheckCircle2, XCircle, AlertCircle,
  Building2, Activity, Pill, Syringe, Ticket, Layers, CalendarDays
} from 'lucide-react';

// Score badge
const ScoreBadge = ({ score }) => {
  if (score === 5)
    return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">مكتمل</span>;
  if (score === 0)
    return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">لا يوجد إدخال</span>;
  return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">جزئي ({score}/5)</span>;
};

// Check/X icon
const Check = ({ v }) => v
  ? <CheckCircle2 size={14} className="text-emerald-500 mx-auto" />
  : <XCircle size={14} className="text-red-400 mx-auto" />;

// Progress bar
const ProgressBar = ({ pct, color = 'var(--color-primary)' }) => (
  <div className="flex items-center gap-2">
    <div className="flex-1 h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-700"
        style={{ width: `${Math.min(pct, 100)}%`, background: color }}
      />
    </div>
    <span className="text-[10px] font-black w-10 text-left" style={{ color }}>{pct.toFixed(0)}%</span>
  </div>
);

const ComplianceReportPage = () => {
  const toast = useToast();
  const [month, setMonth] = useState(new Date().toISOString().substring(0, 7));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [filterScore, setFilterScore] = useState('all'); // 'all' | 'full' | 'partial' | 'none'
  const [searchTerm, setSearchTerm] = useState('');

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const result = await invoke('get_compliance_report', {
        dispenseMonth: month,
        branchId: null,
      });
      setData(result);
      toast.success('تم تحميل تقرير الامتثال بنجاح');
    } catch (err) {
      toast.error(`فشل: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  const filteredClinics = useMemo(() => {
    if (!data) return [];
    return data.missing_clinics.filter(c => {
      const matchScore =
        filterScore === 'all' ? true :
        filterScore === 'full' ? c.score === 5 :
        filterScore === 'partial' ? (c.score > 0 && c.score < 5) :
        filterScore === 'none' ? c.score === 0 : true;
      const matchSearch =
        !searchTerm ||
        c.clinic_name.includes(searchTerm) ||
        c.area_name.includes(searchTerm) ||
        c.branch_name.includes(searchTerm);
      return matchScore && matchSearch;
    });
  }, [data, filterScore, searchTerm]);

  const handlePremiumExport = async (type, { options }) => {
    if (!data) return false;
    const branchCols = [
      { header: 'الفرع', accessor: 'branch_name' },
      { header: 'إجمالي العيادات', accessor: 'total_clinics' },
      { header: 'أدوية تفصيلي', accessor: 'clinics_drugs' },
      { header: 'منصرف شهري', accessor: 'clinics_monthly' },
      { header: 'إنسولين', accessor: 'clinics_insulin' },
      { header: 'تذاكر', accessor: 'clinics_tickets' },
      { header: 'مستلزمات', accessor: 'clinics_supplies' },
      { header: 'نسبة الامتثال %', accessor: r => r.overall_pct.toFixed(1) },
    ];
    const clinicCols = [
      { header: 'العيادة', accessor: 'clinic_name' },
      { header: 'المنطقة', accessor: 'area_name' },
      { header: 'الفرع', accessor: 'branch_name' },
      { header: 'أدوية تفصيلي', accessor: r => r.has_drugs ? 'نعم' : 'لا' },
      { header: 'منصرف شهري', accessor: r => r.has_monthly ? 'نعم' : 'لا' },
      { header: 'إنسولين', accessor: r => r.has_insulin ? 'نعم' : 'لا' },
      { header: 'تذاكر', accessor: r => r.has_tickets ? 'نعم' : 'لا' },
      { header: 'مستلزمات', accessor: r => r.has_supplies ? 'نعم' : 'لا' },
      { header: 'الدرجة', accessor: 'score' },
    ];
    const exportOptions = {
      ...options,
      title: `تقرير الامتثال بالإدخال - ${month}`,
      fileName: `compliance_report_${month}`,
      subtitle: `شهر التقرير: ${month}`,
    };
    if (type === 'excel') {
      await exportMultiSheetExcel({
        'إحصاء الفروع': { data: data.branches, columns: branchCols, options: exportOptions },
        'تفاصيل العيادات': { data: data.missing_clinics, columns: clinicCols, options: exportOptions },
      }, { fileName: exportOptions.fileName, title: exportOptions.title });
      return true;
    }
    if (type === 'word') { exportToWord(data.missing_clinics, clinicCols, exportOptions); return true; }
    if (type === 'pdf') { await exportToPDF(data.missing_clinics, clinicCols, exportOptions); return true; }
    return false;
  };

  return (
    <div className="space-y-6 animate-fadeIn pb-20" dir="rtl">
      <Breadcrumb items={[{ label: 'التقارير' }, { label: 'تقرير الامتثال بالإدخال' }]} />

      <PageHeader
        title="تقرير الامتثال بالإدخال"
        icon={ClipboardCheck}
        description="يرصد هذا التقرير مدى التزام كل فرع وعيادة بإدخال بيانات الصرف الشهرية عبر جميع محاور البيانات."
        actions={
          data && (
            <ExportMenu
              data={data}
              columns={[]}
              onCustomExport={handlePremiumExport}
              options={{ title: `تقرير الامتثال - ${month}`, fileName: `compliance_${month}` }}
            />
          )
        }
      />

      {/* Filter Panel */}
      <Card className="p-6 no-print">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold text-[var(--color-text-muted)] flex items-center gap-1.5">
              <CalendarDays size={12} className="text-[var(--color-primary)]" />
              شهر التقرير
            </label>
            <input
              type="month"
              className="h-11 px-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-card)] text-[var(--color-text)] outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20 text-sm font-bold transition-all"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            />
          </div>
          <Button variant="primary" icon={Search} onClick={handleGenerate} loading={loading} className="h-11 px-16 rounded-2xl shadow-xl font-black">
            توليد تقرير الامتثال
          </Button>
        </div>
      </Card>

      {data && (
        <PrintableTable
          title={`تقرير الامتثال بالإدخال - ${month}`}
          subtitle={`إجمالي العيادات: ${data.total_clinics} | مكتملة: ${data.fully_compliant} | جزئية: ${data.partially_compliant} | لا يوجد: ${data.non_compliant}`}
        >
          <div className="space-y-6">

            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 no-print">
              <Card className="p-5 text-center border-t-4 border-t-slate-400">
                <p className="text-[10px] font-bold text-[var(--color-text-muted)] mb-1">إجمالي العيادات</p>
                <h2 className="text-3xl font-black text-[var(--color-text)]">{data.total_clinics}</h2>
              </Card>
              <Card className="p-5 text-center border-t-4 border-t-emerald-500">
                <p className="text-[10px] font-bold text-emerald-600 mb-1">مكتملة الإدخال</p>
                <h2 className="text-3xl font-black text-emerald-600">{data.fully_compliant}</h2>
                <p className="text-[9px] text-[var(--color-text-muted)] mt-1">
                  {data.total_clinics > 0 ? ((data.fully_compliant / data.total_clinics) * 100).toFixed(1) : 0}%
                </p>
              </Card>
              <Card className="p-5 text-center border-t-4 border-t-amber-500">
                <p className="text-[10px] font-bold text-amber-600 mb-1">إدخال جزئي</p>
                <h2 className="text-3xl font-black text-amber-600">{data.partially_compliant}</h2>
                <p className="text-[9px] text-[var(--color-text-muted)] mt-1">
                  {data.total_clinics > 0 ? ((data.partially_compliant / data.total_clinics) * 100).toFixed(1) : 0}%
                </p>
              </Card>
              <Card className="p-5 text-center border-t-4 border-t-red-500">
                <p className="text-[10px] font-bold text-red-600 mb-1">لا يوجد إدخال</p>
                <h2 className="text-3xl font-black text-red-600">{data.non_compliant}</h2>
                <p className="text-[9px] text-[var(--color-text-muted)] mt-1">
                  {data.total_clinics > 0 ? ((data.non_compliant / data.total_clinics) * 100).toFixed(1) : 0}%
                </p>
              </Card>
            </div>

            {/* Branch Summary */}
            {data.branches.length > 0 && (
              <Card className="p-0 overflow-hidden border border-[var(--color-border)] shadow-sm">
                <div className="p-4 bg-[var(--color-bg-card)] border-b border-[var(--color-border)] flex items-center gap-2">
                  <Building2 size={16} className="text-[var(--color-primary)]" />
                  <h3 className="text-xs font-black text-[var(--color-text)]">ملخص الامتثال على مستوى الفروع</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-right text-xs">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-900/20 text-[var(--color-text-muted)] font-black border-b border-[var(--color-border)]">
                        <th className="p-3">الفرع</th>
                        <th className="p-3 text-center">العيادات</th>
                        <th className="p-3 text-center"><Pill size={12} className="inline" /> أدوية</th>
                        <th className="p-3 text-center"><Activity size={12} className="inline" /> شهري</th>
                        <th className="p-3 text-center"><Syringe size={12} className="inline" /> إنسولين</th>
                        <th className="p-3 text-center"><Ticket size={12} className="inline" /> تذاكر</th>
                        <th className="p-3 text-center"><Layers size={12} className="inline" /> مستلزمات</th>
                        <th className="p-3 min-w-[160px]">نسبة الامتثال</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--color-border)] text-[var(--color-text)]">
                      {data.branches.map((b, i) => (
                        <tr key={i} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/10">
                          <td className="p-3 font-bold">{b.branch_name}</td>
                          <td className="p-3 text-center font-mono">{b.total_clinics}</td>
                          <td className="p-3 text-center font-mono">{b.clinics_drugs}</td>
                          <td className="p-3 text-center font-mono">{b.clinics_monthly}</td>
                          <td className="p-3 text-center font-mono">{b.clinics_insulin}</td>
                          <td className="p-3 text-center font-mono">{b.clinics_tickets}</td>
                          <td className="p-3 text-center font-mono">{b.clinics_supplies}</td>
                          <td className="p-3">
                            <ProgressBar
                              pct={b.overall_pct}
                              color={b.overall_pct >= 80 ? '#10b981' : b.overall_pct >= 40 ? '#f59e0b' : '#ef4444'}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}

            {/* Clinic Detail Table */}
            <Card className="p-0 overflow-hidden border border-[var(--color-border)] shadow-sm">
              <div className="p-4 bg-[var(--color-bg-card)] border-b border-[var(--color-border)] flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <ClipboardCheck size={16} className="text-[var(--color-primary)]" />
                  <h3 className="text-xs font-black text-[var(--color-text)]">تفاصيل الامتثال على مستوى العيادات</h3>
                  <span className="bg-[var(--color-primary)]/10 text-[var(--color-primary)] text-[9px] font-black px-2 py-0.5 rounded-full">{filteredClinics.length} عيادة</span>
                </div>
                {/* Filters */}
                <div className="flex flex-wrap items-center gap-2 no-print">
                  <input
                    type="text"
                    placeholder="ابحث بالاسم..."
                    className="h-8 px-3 text-xs rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] text-[var(--color-text)] outline-none"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                  {['all', 'full', 'partial', 'none'].map(f => (
                    <button
                      key={f}
                      onClick={() => setFilterScore(f)}
                      className={`h-8 px-3 text-[10px] font-black rounded-xl border transition-all ${filterScore === f
                        ? 'bg-[var(--color-primary)] text-white border-transparent'
                        : 'bg-[var(--color-bg-card)] text-[var(--color-text-muted)] border-[var(--color-border)] hover:bg-[var(--color-primary)]/10'
                      }`}
                    >
                      {f === 'all' ? 'الكل' : f === 'full' ? 'مكتمل' : f === 'partial' ? 'جزئي' : 'لا يوجد'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                <table className="w-full text-right text-xs">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-slate-50 dark:bg-slate-900/80 text-[var(--color-text-muted)] font-black border-b border-[var(--color-border)]">
                      <th className="p-3">العيادة</th>
                      <th className="p-3">المنطقة</th>
                      <th className="p-3">الفرع</th>
                      <th className="p-3 text-center"><Pill size={12} className="inline" /></th>
                      <th className="p-3 text-center"><Activity size={12} className="inline" /></th>
                      <th className="p-3 text-center"><Syringe size={12} className="inline" /></th>
                      <th className="p-3 text-center"><Ticket size={12} className="inline" /></th>
                      <th className="p-3 text-center"><Layers size={12} className="inline" /></th>
                      <th className="p-3 text-center">الحالة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border)] text-[var(--color-text)]">
                    {filteredClinics.map((c, i) => (
                      <tr
                        key={i}
                        className={`hover:bg-slate-50/50 dark:hover:bg-slate-900/10 ${
                          c.score === 0 ? 'bg-red-50/20 dark:bg-red-950/10' :
                          c.score < 5 ? 'bg-amber-50/10 dark:bg-amber-950/5' : ''
                        }`}
                      >
                        <td className="p-3 font-bold">{c.clinic_name}</td>
                        <td className="p-3 text-[var(--color-text-muted)]">{c.area_name}</td>
                        <td className="p-3 text-[var(--color-text-muted)]">{c.branch_name}</td>
                        <td className="p-3 text-center"><Check v={c.has_drugs} /></td>
                        <td className="p-3 text-center"><Check v={c.has_monthly} /></td>
                        <td className="p-3 text-center"><Check v={c.has_insulin} /></td>
                        <td className="p-3 text-center"><Check v={c.has_tickets} /></td>
                        <td className="p-3 text-center"><Check v={c.has_supplies} /></td>
                        <td className="p-3 text-center"><ScoreBadge score={c.score} /></td>
                      </tr>
                    ))}
                    {filteredClinics.length === 0 && (
                      <tr>
                        <td colSpan={9} className="p-12 text-center text-[var(--color-text-muted)]">
                          لا توجد نتائج مطابقة
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>

          </div>
        </PrintableTable>
      )}

      {!data && !loading && (
        <Card className="p-16 text-center space-y-4">
          <ClipboardCheck size={48} className="mx-auto opacity-20 text-[var(--color-primary)]" />
          <div>
            <h3 className="font-bold text-[var(--color-text)]">اختر الشهر وابدأ التحليل</h3>
            <p className="text-xs text-[var(--color-text-muted)] mt-1 max-w-md mx-auto">
              يتحقق هذا التقرير من مدى التزام كل عيادة بإدخال بيانات الصرف عبر محاور: الأدوية التفصيلية، المنصرف الشهري، الإنسولين، التذاكر الطبية، والمستلزمات.
            </p>
          </div>
        </Card>
      )}
    </div>
  );
};

export default ComplianceReportPage;
