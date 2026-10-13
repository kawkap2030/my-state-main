import React, { useState, useMemo, useRef } from 'react';
import PageHeader from '../../../components/ui/PageHeader';
import Breadcrumb from '../../../components/ui/Breadcrumb';
import HierarchySelector from '../../../components/common/HierarchySelector';
import Card from '../../../components/ui/Card';
import Button from '../../../components/ui/Button';
import { useToast } from '../../../components/ui/Toast';
import invoke from '../../../api/tauriApi';
import ExportMenu from '../../../components/ui/ExportMenu';
import useReportPrintShortcut from '../../../hooks/useReportPrintShortcut';
import PrintableTable from '../../../components/common/PrintableTable';
import { exportMultiSheetExcel, exportToWord, exportToPDF } from '../../../utils/exportUtils';
import {
  AlertTriangle, Search, Download, Printer, ListFilter,
  TrendingUp, BarChart2, Ticket, Activity, ShieldAlert,
  Info, CheckCircle, ChevronUp
} from 'lucide-react';

// ─── Severity badge helper ───────────────────────────────────────────────────
const SeverityBadge = ({ pct }) => {
  if (pct >= 300)
    return <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">خطر حرج</span>;
  if (pct >= 200)
    return <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">تنبيه عالي</span>;
  return <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">مراقبة</span>;
};

const DeviationBar = ({ pct, max }) => {
  const fill = Math.min((pct / max) * 100, 100);
  const color = pct >= 300 ? '#ef4444' : pct >= 200 ? '#f97316' : '#f59e0b';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${fill}%`, background: color }} />
      </div>
      <span className="text-[10px] font-black" style={{ color }}>{pct.toFixed(1)}%</span>
    </div>
  );
};

// ─── Column picker popover ────────────────────────────────────────────────────
const ColPicker = ({ cols, setCols, definitions, open, setOpen }) => (
  <div className="relative no-print">
    <Button variant="outline" icon={ListFilter} onClick={() => setOpen(!open)} className="h-8 text-[10px] font-bold px-2.5">
      تعديل الأعمدة
    </Button>
    {open && (
      <div className="absolute left-0 mt-2 w-52 bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-xl shadow-xl p-3 z-50 space-y-1.5">
        <div className="flex justify-between items-center text-[9px] font-bold text-[var(--color-text-muted)] border-b pb-1.5 mb-1">
          <span>الأعمدة المرئية</span>
          <button onClick={() => { const allOn = Object.values(cols).every(v => v); const next = {}; definitions.forEach(d => { next[d.id] = !allOn; }); setCols(next); }} className="text-[var(--color-primary)] hover:underline">
            {Object.values(cols).every(v => v) ? 'إلغاء الكل' : 'تحديد الكل'}
          </button>
        </div>
        {definitions.map(d => (
          <label key={d.id} className="flex items-center gap-2 text-[10px] font-bold text-[var(--color-text)] cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 px-1.5 py-1 rounded-lg">
            <input type="checkbox" checked={cols[d.id]} onChange={() => setCols({ ...cols, [d.id]: !cols[d.id] })} className="rounded h-3.5 w-3.5 text-[var(--color-primary)]" />
            {d.label}
          </label>
        ))}
      </div>
    )}
  </div>
);

// ─── Column definitions for each table ───────────────────────────────────────
const OUTLIER_COLS_DEF = [
  { id: 'clinic', label: 'العيادة' },
  { id: 'drug', label: 'الصنف الدوائي' },
  { id: 'actual', label: 'الكمية الفعلية' },
  { id: 'avg', label: 'المتوسط العام' },
  { id: 'dev', label: 'نسبة التجاوز' },
  { id: 'severity', label: 'مستوى الخطورة' },
];

const TICKET_COLS_DEF = [
  { id: 'clinic', label: 'العيادة' },
  { id: 'tickets', label: 'عدد التذاكر' },
  { id: 'cost', label: 'التكلفة الكلية' },
  { id: 'cpt', label: 'تكلفة التذكرة' },
  { id: 'avg_cpt', label: 'المتوسط العام' },
  { id: 'dev', label: 'نسبة التجاوز' },
];

const SURGE_COLS_DEF = [
  { id: 'drug', label: 'الصنف الدوائي' },
  { id: 'current', label: 'تكلفة الشهر الحالي' },
  { id: 'previous', label: 'تكلفة الشهر السابق' },
  { id: 'growth', label: 'نسبة النمو' },
];

// ─── Default visible columns ──────────────────────────────────────────────────
const defaultCols = (defs) => Object.fromEntries(defs.map(d => [d.id, true]));

// ─── Main Page ────────────────────────────────────────────────────────────────
const AnomalyDetectionPage = () => {
  const toast = useToast();

  const [hierarchy, setHierarchy] = useState({ branchId: '', areaId: '', clinicId: '' });
  const [month, setMonth] = useState(new Date().toISOString().substring(0, 7));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const [outlierCols, setOutlierCols] = useState(defaultCols(OUTLIER_COLS_DEF));
  const [ticketCols, setTicketCols] = useState(defaultCols(TICKET_COLS_DEF));
  const [surgeCols, setSurgeCols] = useState(defaultCols(SURGE_COLS_DEF));
  const [insulinCols, setInsulinCols] = useState(defaultCols(OUTLIER_COLS_DEF));
  const [supplyCols, setSupplyCols] = useState(defaultCols(OUTLIER_COLS_DEF));

  const [outlierColOpen, setOutlierColOpen] = useState(false);
  const [ticketColOpen, setTicketColOpen] = useState(false);
  const [surgeColOpen, setSurgeColOpen] = useState(false);
  const [insulinColOpen, setInsulinColOpen] = useState(false);
  const [supplyColOpen, setSupplyColOpen] = useState(false);
  const exportMenuRef = useRef(null);
  useReportPrintShortcut(exportMenuRef);

  const handleGenerate = async () => {
    if (!hierarchy.branchId) { toast.warning('يرجى اختيار الفرع على الأقل'); return; }
    setLoading(true);
    try {
      const result = await invoke('get_anomaly_report', {
        branchId: hierarchy.branchId ? parseInt(hierarchy.branchId) : null,
        areaId: hierarchy.areaId ? parseInt(hierarchy.areaId) : null,
        dispenseMonth: month,
      });
      setData(result);
      toast.success('تم تحميل تقرير رصد الانحرافات بنجاح');
    } catch (err) {
      toast.error(`فشل تحميل البيانات: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  // KPI summary counts
  const kpis = useMemo(() => {
    if (!data) return { outliers: 0, mismatches: 0, surges: 0, critical: 0, insulinOutliers: 0, supplyOutliers: 0 };
    const critical = data.clinic_outliers.filter(o => o.deviation_pct >= 300).length
      + data.insulin_outliers.filter(o => o.deviation_pct >= 300).length
      + data.supply_outliers.filter(o => o.deviation_pct >= 300).length;
    return {
      outliers: data.clinic_outliers.length,
      mismatches: data.ticket_mismatches.length,
      surges: data.surge_drugs.length,
      insulinOutliers: data.insulin_outliers.length,
      supplyOutliers: data.supply_outliers.length,
      critical,
    };
  }, [data]);

  const maxOutlierDev = useMemo(() => data ? Math.max(...data.clinic_outliers.map(o => o.deviation_pct), 1) : 1, [data]);
  const maxTicketDev = useMemo(() => data ? Math.max(...data.ticket_mismatches.map(t => t.deviation_pct), 1) : 1, [data]);
  const maxInsulinDev = useMemo(() => data ? Math.max(...data.insulin_outliers.map(o => o.deviation_pct), 1) : 1, [data]);
  const maxSupplyDev = useMemo(() => data ? Math.max(...data.supply_outliers.map(o => o.deviation_pct), 1) : 1, [data]);

  // Shared table builders — used by the custom Excel/Word/PDF export AND by
  // the unified print preview (options.tables), so both show identical tables
  // honoring the on-screen column toggles.
  const outRows = useMemo(() => {
    if (!data) return [];
    return data.clinic_outliers.map(o => {
      const r = {};
      if (outlierCols.clinic) r['العيادة'] = o.clinic_name;
      if (outlierCols.drug) r['الصنف الدوائي'] = o.drug_name;
      if (outlierCols.actual) r['الكمية الفعلية'] = o.actual_qty;
      if (outlierCols.avg) r['المتوسط العام'] = o.avg_qty.toFixed(1);
      if (outlierCols.dev) r['نسبة التجاوز %'] = o.deviation_pct.toFixed(1) + '%';
      if (outlierCols.severity) r['مستوى الخطورة'] = o.deviation_pct >= 300 ? 'خطر حرج' : o.deviation_pct >= 200 ? 'تنبيه عالي' : 'مراقبة';
      return r;
    });
  }, [data, outlierCols]);

  const tickRows = useMemo(() => {
    if (!data) return [];
    return data.ticket_mismatches.map(t => {
      const r = {};
      if (ticketCols.clinic) r['العيادة'] = t.clinic_name;
      if (ticketCols.tickets) r['عدد التذاكر'] = t.total_tickets;
      if (ticketCols.cost) r['التكلفة الكلية'] = t.total_cost.toLocaleString() + ' ج.م';
      if (ticketCols.cpt) r['تكلفة التذكرة'] = t.cost_per_ticket.toFixed(1) + ' ج.م';
      if (ticketCols.avg_cpt) r['المتوسط العام'] = t.avg_cost_per_ticket.toFixed(1) + ' ج.م';
      if (ticketCols.dev) r['نسبة التجاوز %'] = t.deviation_pct.toFixed(1) + '%';
      return r;
    });
  }, [data, ticketCols]);

  const surgeRows = useMemo(() => {
    if (!data) return [];
    return data.surge_drugs.map(s => {
      const r = {};
      if (surgeCols.drug) r['الصنف الدوائي'] = s.drug_name;
      if (surgeCols.current) r['تكلفة الشهر الحالي'] = s.current_cost.toLocaleString() + ' ج.م';
      if (surgeCols.previous) r['تكلفة الشهر السابق'] = s.previous_cost.toLocaleString() + ' ج.م';
      if (surgeCols.growth) r['نسبة النمو %'] = s.growth_pct.toFixed(1) + '%';
      return r;
    });
  }, [data, surgeCols]);

  const insulinRows = useMemo(() => {
    if (!data) return [];
    return data.insulin_outliers.map(o => {
      const r = {};
      if (insulinCols.clinic) r['العيادة'] = o.clinic_name;
      if (insulinCols.drug) r['الصنف الدوائي'] = o.drug_name;
      if (insulinCols.actual) r['الكمية الفعلية'] = o.actual_qty;
      if (insulinCols.avg) r['المتوسط العام'] = o.avg_qty.toFixed(1);
      if (insulinCols.dev) r['نسبة التجاوز %'] = o.deviation_pct.toFixed(1) + '%';
      if (insulinCols.severity) r['مستوى الخطورة'] = o.deviation_pct >= 300 ? 'خطر حرج' : o.deviation_pct >= 200 ? 'تنبيه عالي' : 'مراقبة';
      return r;
    });
  }, [data, insulinCols]);

  const supplyRows = useMemo(() => {
    if (!data) return [];
    return data.supply_outliers.map(o => {
      const r = {};
      if (supplyCols.clinic) r['العيادة'] = o.clinic_name;
      if (supplyCols.drug) r['الصنف الدوائي'] = o.drug_name;
      if (supplyCols.actual) r['الكمية الفعلية'] = o.actual_qty;
      if (supplyCols.avg) r['المتوسط العام'] = o.avg_qty.toFixed(1);
      if (supplyCols.dev) r['نسبة التجاوز %'] = o.deviation_pct.toFixed(1) + '%';
      if (supplyCols.severity) r['مستوى الخطورة'] = o.deviation_pct >= 300 ? 'خطر حرج' : o.deviation_pct >= 200 ? 'تنبيه عالي' : 'مراقبة';
      return r;
    });
  }, [data, supplyCols]);

  const outlierColsDef = useMemo(() => OUTLIER_COLS_DEF.filter(d => outlierCols[d.id]).map(d => ({
    header: d.label === 'نسبة التجاوز' ? 'نسبة التجاوز %' : d.label,
    accessor: d.label === 'نسبة التجاوز' ? 'نسبة التجاوز %' : d.label
  })), [outlierCols]);

  const ticketColsDef = useMemo(() => TICKET_COLS_DEF.filter(d => ticketCols[d.id]).map(d => ({
    header: d.label === 'نسبة التجاوز' ? 'نسبة التجاوز %' : d.label,
    accessor: d.label === 'نسبة التجاوز' ? 'نسبة التجاوز %' : d.label
  })), [ticketCols]);

  const surgeColsDef = useMemo(() => SURGE_COLS_DEF.filter(d => surgeCols[d.id]).map(d => ({
    header: d.label === 'نسبة التجاوز' ? 'نسبة النمو %' : d.label,
    accessor: d.label === 'نسبة التجاوز' ? 'نسبة النمو %' : d.label
  })), [surgeCols]);

  const insulinColsDef = useMemo(() => OUTLIER_COLS_DEF.filter(d => insulinCols[d.id]).map(d => ({
    header: d.label === 'نسبة التجاوز' ? 'نسبة التجاوز %' : d.label,
    accessor: d.label === 'نسبة التجاوز' ? 'نسبة التجاوز %' : d.label
  })), [insulinCols]);

  const supplyColsDef = useMemo(() => OUTLIER_COLS_DEF.filter(d => supplyCols[d.id]).map(d => ({
    header: d.label === 'نسبة التجاوز' ? 'نسبة التجاوز %' : d.label,
    accessor: d.label === 'نسبة التجاوز' ? 'نسبة التجاوز %' : d.label
  })), [supplyCols]);

  const previewTables = useMemo(() => {
    if (!data) return [];
    const tables = [];
    if (outRows.length > 0) tables.push({ data: outRows, columns: outlierColsDef, title: 'العيادات الشاذة استهلاكياً' });
    if (tickRows.length > 0) tables.push({ data: tickRows, columns: ticketColsDef, title: 'انحراف التذاكر' });
    if (surgeRows.length > 0) tables.push({ data: surgeRows, columns: surgeColsDef, title: 'أصناف النمو المفاجئ' });
    if (insulinRows.length > 0) tables.push({ data: insulinRows, columns: outlierColsDef, title: 'العيادات الشاذة في صرف الإنسولين' });
    if (supplyRows.length > 0) tables.push({ data: supplyRows, columns: outlierColsDef, title: 'العيادات الشاذة في استهلاك المستلزمات' });
    return tables;
  }, [data, outRows, tickRows, surgeRows, insulinRows, supplyRows, outlierColsDef, ticketColsDef, surgeColsDef]);

  const handlePremiumExport = async (type, { options }) => {
    if (!data) return false;
    try {
      if (type === 'excel') {
        const sheetsData = {};
        if (outRows.length > 0) {
          sheetsData['العيادات الشاذة استهلاكياً'] = { data: outRows, columns: outlierColsDef, options };
        }
        if (tickRows.length > 0) {
          sheetsData['انحراف التذاكر'] = { data: tickRows, columns: ticketColsDef, options };
        }
        if (surgeRows.length > 0) {
          sheetsData['أصناف النمو المفاجئ'] = { data: surgeRows, columns: surgeColsDef, options };
        }
        if (insulinRows.length > 0) {
          sheetsData['العيادات الشاذة في صرف الإنسولين'] = { data: insulinRows, columns: insulinColsDef, options };
        }
        if (supplyRows.length > 0) {
          sheetsData['العيادات الشاذة في استهلاك المستلزمات'] = { data: supplyRows, columns: supplyColsDef, options };
        }

        const globalOptions = {
          fileName: `anomaly_report_${month}`,
          title: `تقرير رصد الانحرافات والأنماط الشاذة - ${month}`,
          summaryData: {
            headers: ['المؤشر الإحصائي', 'القيمة المكتشفة'],
            rows: [
              ['شهر التحليل', month],
              ['عدد العيادات الشاذة استهلاكياً', `${kpis.outliers} حالة`],
              ['عدد انحرافات التذاكر/التكلفة', `${kpis.mismatches} عيادة`],
              ['عدد الأصناف ذات النمو المفاجئ', `${kpis.surges} صنف`],
              ['العيادات الشاذة في صرف الإنسولين', `${kpis.insulinOutliers} حالة`],
              ['العيادات الشاذة في استهلاك المستلزمات', `${kpis.supplyOutliers} حالة`],
              ['حالات الخطر الحرج المكتشفة', `${kpis.critical} حالة`]
            ]
          }
        };

        await exportMultiSheetExcel(sheetsData, globalOptions);
        return true;
      }

      // Word & PDF: reuse the same preview tables (identical rows/columns).
      const exportOptions = {
        ...options,
        title: `تقرير رصد الانحرافات والأنماط الشاذة - ${month}`,
        fileName: `anomaly_report_${month}`,
        subtitle: `إجمالي حالات التنبيه: ${kpis.outliers + kpis.mismatches + kpis.surges} حالة مكتشفة`,
      };
      // Guard: only pass tables when at least one sheet has data — an empty
      // array would render NO tables in the Word engine ([] is truthy).
      const wordPdfOptions = previewTables.length > 0
        ? { ...exportOptions, tables: previewTables }
        : exportOptions;

      if (type === 'word') {
        exportToWord(outRows, outlierColsDef, wordPdfOptions);
        return true;
      }
      if (type === 'pdf') {
        await exportToPDF(outRows, outlierColsDef, wordPdfOptions);
        return true;
      }

      return false;
    } catch (e) {
      console.error(e);
      toast.error(`فشل التصدير: ${e.message || e}`);
      return false;
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn pb-20" dir="rtl">
      <Breadcrumb items={[{ label: 'التقارير' }, { label: 'رصد الانحرافات والأنماط الشاذة' }]} />

      <PageHeader
        title="نظام رصد الانحرافات والأنماط الشاذة"
        icon={ShieldAlert}
        description="تقرير رقابي ذكي يكتشف العيادات الشاذة استهلاكياً، وانحراف تكلفة التذاكر، والنمو المفاجئ في استهلاك الأصناف."
        actions={
          data && (
            <ExportMenu
              ref={exportMenuRef}
              data={outRows}
              columns={outlierColsDef}
              onCustomExport={handlePremiumExport}
              options={{
                title: `تقرير رصد الانحرافات والأنماط الشاذة - ${month}`,
                fileName: `anomaly_report_${month}`,
                subtitle: `شهر التحليل: ${month}`,
                tables: previewTables
              }}
            />
          )
        }
      />

      {/* ── Filter Panel ──────────────────────────────────────────────────────── */}
      <Card className="p-6 space-y-6 no-print">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-end">
          <div className="lg:col-span-2">
            <HierarchySelector
              onSelectionChange={(d) => setHierarchy(prev => ({ ...prev, ...d }))}
              initialBranch={hierarchy.branchId}
              initialArea={hierarchy.areaId}
              initialClinic={hierarchy.clinicId}
              hideMonth
            />
          </div>
          <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] p-3.5 rounded-2xl flex flex-col gap-1.5">
            <label className="text-[10px] font-bold text-[var(--color-text-muted)]">شهر التحليل</label>
            <input
              type="month"
              className="bg-transparent border-none outline-none text-xs font-black text-[var(--color-text)] cursor-pointer"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            />
          </div>
        </div>
        <div className="flex justify-end pt-4 border-t border-slate-100 dark:border-slate-800">
          <Button variant="primary" icon={Search} onClick={handleGenerate} loading={loading} className="h-11 px-16 rounded-xl shadow-lg shadow-primary/10">
            تشغيل فحص الانحرافات
          </Button>
        </div>
      </Card>

      {/* ── Results ───────────────────────────────────────────────────────────── */}
      {data ? (
        <PrintableTable title={`تقرير رصد الانحرافات والأنماط الشاذة`} subtitle={`شهر التحليل: ${month}`}>
          <div className="space-y-6">

          {/* KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <Card className={`p-5 border shadow-sm ${kpis.critical > 0 ? 'border-red-300 dark:border-red-800 bg-red-50/30 dark:bg-red-950/10' : 'border-[var(--color-border)]'}`}>
              <div className="flex justify-between items-start">
                <span className="text-[9px] font-bold text-[var(--color-text-muted)] leading-tight">حالات خطر حرج</span>
                <AlertTriangle size={14} className="text-red-500 shrink-0" />
              </div>
              <h2 className="text-3xl font-black text-red-500 mt-2">{kpis.critical}</h2>
              <p className="text-[9px] text-[var(--color-text-muted)] mt-3">عيادات تجاوزت 3× الانحراف المعياري</p>
            </Card>

            <Card className="p-5 border border-[var(--color-border)] shadow-sm">
              <div className="flex justify-between items-start">
                <span className="text-[9px] font-bold text-[var(--color-text-muted)] leading-tight">عيادات شاذة استهلاكياً</span>
                <Activity size={14} className="text-orange-500 shrink-0" />
              </div>
              <h2 className="text-3xl font-black text-orange-500 mt-2">{kpis.outliers}</h2>
              <p className="text-[9px] text-[var(--color-text-muted)] mt-3">تجاوزت المتوسط + 2× الانحراف المعياري</p>
            </Card>

            <Card className="p-5 border border-[var(--color-border)] shadow-sm">
              <div className="flex justify-between items-start">
                <span className="text-[9px] font-bold text-[var(--color-text-muted)] leading-tight">انحراف التذاكر/التكلفة</span>
                <Ticket size={14} className="text-amber-500 shrink-0" />
              </div>
              <h2 className="text-3xl font-black text-amber-500 mt-2">{kpis.mismatches}</h2>
              <p className="text-[9px] text-[var(--color-text-muted)] mt-3">تكلفة تذكرة تفوق المتوسط بـ 80%+</p>
            </Card>

            <Card className="p-5 border border-[var(--color-border)] shadow-sm">
              <div className="flex justify-between items-start">
                <span className="text-[9px] font-bold text-[var(--color-text-muted)] leading-tight">أصناف ذات نمو مفاجئ</span>
                <TrendingUp size={14} className="text-purple-500 shrink-0" />
              </div>
              <h2 className="text-3xl font-black text-purple-500 mt-2">{kpis.surges}</h2>
              <p className="text-[9px] text-[var(--color-text-muted)] mt-3">نمو يتجاوز 150% مقارنة بالشهر السابق</p>
            </Card>

            <Card className="p-5 border border-[var(--color-border)] shadow-sm">
              <div className="flex justify-between items-start">
                <span className="text-[9px] font-bold text-[var(--color-text-muted)] leading-tight">انحراف صرف الإنسولين</span>
                <Activity size={14} className="text-blue-500 shrink-0" />
              </div>
              <h2 className="text-3xl font-black text-blue-500 mt-2">{kpis.insulinOutliers}</h2>
              <p className="text-[9px] text-[var(--color-text-muted)] mt-3">تجاوزت المتوسط + 2× الانحراف المعياري</p>
            </Card>

            <Card className="p-5 border border-[var(--color-border)] shadow-sm">
              <div className="flex justify-between items-start">
                <span className="text-[9px] font-bold text-[var(--color-text-muted)] leading-tight">انحراف المستلزمات الطبية</span>
                <Activity size={14} className="text-teal-500 shrink-0" />
              </div>
              <h2 className="text-3xl font-black text-teal-500 mt-2">{kpis.supplyOutliers}</h2>
              <p className="text-[9px] text-[var(--color-text-muted)] mt-3">تجاوزت المتوسط + 2× الانحراف المعياري</p>
            </Card>
          </div>

          {/* Alert banner if no issues */}
          {kpis.outliers === 0 && kpis.mismatches === 0 && kpis.surges === 0 && kpis.insulinOutliers === 0 && kpis.supplyOutliers === 0 && (
            <Card className="p-6 flex items-center gap-4 border border-emerald-300 dark:border-emerald-800 bg-emerald-50/20 dark:bg-emerald-950/10">
              <CheckCircle size={32} className="text-emerald-500 shrink-0" />
              <div>
                <h3 className="text-sm font-black text-emerald-600 dark:text-emerald-400">لم يتم رصد أي انحرافات مشبوهة</h3>
                <p className="text-xs text-[var(--color-text-muted)] mt-1">جميع مؤشرات الصرف لهذا الشهر ضمن الحدود الطبيعية المقبولة إحصائياً.</p>
              </div>
            </Card>
          )}

          {/* ══ Table 1: Clinic Outliers ══════════════════════════════════════ */}
          {data.clinic_outliers.length > 0 && (
            <Card className="p-0 overflow-hidden border border-[var(--color-border)] shadow-sm">
              <div className="bg-orange-50/50 dark:bg-orange-950/10 p-4 border-b border-[var(--color-border)] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Activity size={16} className="text-orange-500" />
                  <h3 className="text-xs font-black text-[var(--color-text)]">العيادات الشاذة استهلاكياً (أعلى من المتوسط + 2σ)</h3>
                  <span className="bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 text-[9px] font-black px-2 py-0.5 rounded-full">{data.clinic_outliers.length} حالة</span>
                </div>
                <ColPicker cols={outlierCols} setCols={setOutlierCols} definitions={OUTLIER_COLS_DEF} open={outlierColOpen} setOpen={setOutlierColOpen} />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-900/20 text-[var(--color-text-muted)] font-black border-b border-[var(--color-border)]">
                      {outlierCols.clinic && <th className="p-3">العيادة</th>}
                      {outlierCols.drug && <th className="p-3">الصنف الدوائي</th>}
                      {outlierCols.actual && <th className="p-3 text-center">الكمية الفعلية</th>}
                      {outlierCols.avg && <th className="p-3 text-center">المتوسط العام</th>}
                      {outlierCols.dev && <th className="p-3 min-w-[160px]">نسبة التجاوز</th>}
                      {outlierCols.severity && <th className="p-3 text-center">مستوى الخطورة</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border)] text-[var(--color-text)]">
                    {data.clinic_outliers.map((o, i) => (
                      <tr key={i} className={`hover:bg-slate-50/50 dark:hover:bg-slate-900/10 ${o.deviation_pct >= 300 ? 'bg-red-50/30 dark:bg-red-950/5' : ''}`}>
                        {outlierCols.clinic && <td className="p-3 font-bold">{o.clinic_name}</td>}
                        {outlierCols.drug && <td className="p-3 text-[var(--color-text-muted)]">{o.drug_name}</td>}
                        {outlierCols.actual && <td className="p-3 text-center font-mono font-black text-orange-600">{o.actual_qty.toLocaleString()}</td>}
                        {outlierCols.avg && <td className="p-3 text-center font-mono text-[var(--color-text-muted)]">{o.avg_qty.toFixed(1)}</td>}
                        {outlierCols.dev && <td className="p-3"><DeviationBar pct={o.deviation_pct} max={maxOutlierDev} /></td>}
                        {outlierCols.severity && <td className="p-3 text-center"><SeverityBadge pct={o.deviation_pct} /></td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* ══ Table 2: Ticket / Cost Mismatch ═══════════════════════════════ */}
          {data.ticket_mismatches.length > 0 && (
            <Card className="p-0 overflow-hidden border border-[var(--color-border)] shadow-sm">
              <div className="bg-amber-50/50 dark:bg-amber-950/10 p-4 border-b border-[var(--color-border)] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Ticket size={16} className="text-amber-500" />
                  <h3 className="text-xs font-black text-[var(--color-text)]">انحراف تكلفة التذكرة (تجاوزت المتوسط بأكثر من 80%)</h3>
                  <span className="bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-[9px] font-black px-2 py-0.5 rounded-full">{data.ticket_mismatches.length} عيادة</span>
                </div>
                <ColPicker cols={ticketCols} setCols={setTicketCols} definitions={TICKET_COLS_DEF} open={ticketColOpen} setOpen={setTicketColOpen} />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-900/20 text-[var(--color-text-muted)] font-black border-b border-[var(--color-border)]">
                      {ticketCols.clinic && <th className="p-3">العيادة</th>}
                      {ticketCols.tickets && <th className="p-3 text-center">عدد التذاكر</th>}
                      {ticketCols.cost && <th className="p-3 text-center">التكلفة الكلية</th>}
                      {ticketCols.cpt && <th className="p-3 text-center">تكلفة التذكرة</th>}
                      {ticketCols.avg_cpt && <th className="p-3 text-center">متوسط التكلفة العام</th>}
                      {ticketCols.dev && <th className="p-3 min-w-[160px]">نسبة التجاوز</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border)] text-[var(--color-text)]">
                    {data.ticket_mismatches.map((t, i) => (
                      <tr key={i} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/10">
                        {ticketCols.clinic && <td className="p-3 font-bold">{t.clinic_name}</td>}
                        {ticketCols.tickets && <td className="p-3 text-center font-mono">{t.total_tickets.toLocaleString()}</td>}
                        {ticketCols.cost && <td className="p-3 text-center font-mono font-black">{t.total_cost.toLocaleString()} ج.م</td>}
                        {ticketCols.cpt && <td className="p-3 text-center font-mono font-black text-red-500">{t.cost_per_ticket.toFixed(1)} ج.م</td>}
                        {ticketCols.avg_cpt && <td className="p-3 text-center font-mono text-[var(--color-text-muted)]">{t.avg_cost_per_ticket.toFixed(1)} ج.م</td>}
                        {ticketCols.dev && <td className="p-3"><DeviationBar pct={t.deviation_pct} max={maxTicketDev} /></td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* ══ Table 3: Surge Drugs ══════════════════════════════════════════ */}
          {data.surge_drugs.length > 0 && (
            <Card className="p-0 overflow-hidden border border-[var(--color-border)] shadow-sm">
              <div className="bg-purple-50/50 dark:bg-purple-950/10 p-4 border-b border-[var(--color-border)] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TrendingUp size={16} className="text-purple-500" />
                  <h3 className="text-xs font-black text-[var(--color-text)]">الأصناف ذات النمو المفاجئ (أكثر من 150% مقارنة بالشهر السابق)</h3>
                  <span className="bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 text-[9px] font-black px-2 py-0.5 rounded-full">{data.surge_drugs.length} صنف</span>
                </div>
                <ColPicker cols={surgeCols} setCols={setSurgeCols} definitions={SURGE_COLS_DEF} open={surgeColOpen} setOpen={setSurgeColOpen} />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-900/20 text-[var(--color-text-muted)] font-black border-b border-[var(--color-border)]">
                      {surgeCols.drug && <th className="p-3">الصنف الدوائي</th>}
                      {surgeCols.current && <th className="p-3 text-center">تكلفة الشهر الحالي</th>}
                      {surgeCols.previous && <th className="p-3 text-center">تكلفة الشهر السابق</th>}
                      {surgeCols.growth && <th className="p-3 text-center">نسبة النمو</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border)] text-[var(--color-text)]">
                    {data.surge_drugs.map((s, i) => (
                      <tr key={i} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/10">
                        {surgeCols.drug && <td className="p-3 font-bold">{s.drug_name}</td>}
                        {surgeCols.current && <td className="p-3 text-center font-mono font-black text-purple-600">{s.current_cost.toLocaleString()} ج.م</td>}
                        {surgeCols.previous && <td className="p-3 text-center font-mono text-[var(--color-text-muted)]">{s.previous_cost.toLocaleString()} ج.م</td>}
                        {surgeCols.growth && (
                          <td className="p-3 text-center">
                            <span className="inline-flex items-center gap-1 font-black text-red-600">
                              <ChevronUp size={12} />
                              {s.growth_pct.toFixed(1)}%
                            </span>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* ══ Table 4: Insulin Outliers ══════════════════════════════════════ */}
          {data.insulin_outliers.length > 0 && (
            <Card className="p-0 overflow-hidden border border-[var(--color-border)] shadow-sm">
              <div className="bg-blue-50/50 dark:bg-blue-950/10 p-4 border-b border-[var(--color-border)] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Activity size={16} className="text-blue-500" />
                  <h3 className="text-xs font-black text-[var(--color-text)]">العيادات الشاذة في صرف الإنسولين (أعلى من المتوسط + 2σ)</h3>
                  <span className="bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-[9px] font-black px-2 py-0.5 rounded-full">{data.insulin_outliers.length} حالة</span>
                </div>
                <ColPicker cols={insulinCols} setCols={setInsulinCols} definitions={OUTLIER_COLS_DEF} open={insulinColOpen} setOpen={setInsulinColOpen} />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-900/20 text-[var(--color-text-muted)] font-black border-b border-[var(--color-border)]">
                      {insulinCols.clinic && <th className="p-3">العيادة</th>}
                      {insulinCols.drug && <th className="p-3">صنف الإنسولين</th>}
                      {insulinCols.actual && <th className="p-3 text-center">الكمية الفعلية</th>}
                      {insulinCols.avg && <th className="p-3 text-center">المتوسط العام</th>}
                      {insulinCols.dev && <th className="p-3 min-w-[160px]">نسبة التجاوز</th>}
                      {insulinCols.severity && <th className="p-3 text-center">مستوى الخطورة</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border)] text-[var(--color-text)]">
                    {data.insulin_outliers.map((o, i) => (
                      <tr key={i} className={`hover:bg-slate-50/50 dark:hover:bg-slate-900/10 ${o.deviation_pct >= 300 ? 'bg-red-50/30 dark:bg-red-950/5' : ''}`}>
                        {insulinCols.clinic && <td className="p-3 font-bold">{o.clinic_name}</td>}
                        {insulinCols.drug && <td className="p-3 text-[var(--color-text-muted)]">{o.drug_name}</td>}
                        {insulinCols.actual && <td className="p-3 text-center font-mono font-black text-blue-600">{o.actual_qty.toLocaleString()}</td>}
                        {insulinCols.avg && <td className="p-3 text-center font-mono text-[var(--color-text-muted)]">{o.avg_qty.toFixed(1)}</td>}
                        {insulinCols.dev && <td className="p-3"><DeviationBar pct={o.deviation_pct} max={maxInsulinDev} /></td>}
                        {insulinCols.severity && <td className="p-3 text-center"><SeverityBadge pct={o.deviation_pct} /></td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* ══ Table 5: Supply Outliers ══════════════════════════════════════ */}
          {data.supply_outliers.length > 0 && (
            <Card className="p-0 overflow-hidden border border-[var(--color-border)] shadow-sm">
              <div className="bg-teal-50/50 dark:bg-teal-950/10 p-4 border-b border-[var(--color-border)] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Activity size={16} className="text-teal-500" />
                  <h3 className="text-xs font-black text-[var(--color-text)]">العيادات الشاذة في استهلاك المستلزمات (أعلى من المتوسط + 2σ)</h3>
                  <span className="bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400 text-[9px] font-black px-2 py-0.5 rounded-full">{data.supply_outliers.length} حالة</span>
                </div>
                <ColPicker cols={supplyCols} setCols={setSupplyCols} definitions={OUTLIER_COLS_DEF} open={supplyColOpen} setOpen={setSupplyColOpen} />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-900/20 text-[var(--color-text-muted)] font-black border-b border-[var(--color-border)]">
                      {supplyCols.clinic && <th className="p-3">العيادة</th>}
                      {supplyCols.drug && <th className="p-3">صنف المستلزم</th>}
                      {supplyCols.actual && <th className="p-3 text-center">الكمية الفعلية</th>}
                      {supplyCols.avg && <th className="p-3 text-center">المتوسط العام</th>}
                      {supplyCols.dev && <th className="p-3 min-w-[160px]">نسبة التجاوز</th>}
                      {supplyCols.severity && <th className="p-3 text-center">مستوى الخطورة</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border)] text-[var(--color-text)]">
                    {data.supply_outliers.map((o, i) => (
                      <tr key={i} className={`hover:bg-slate-50/50 dark:hover:bg-slate-900/10 ${o.deviation_pct >= 300 ? 'bg-red-50/30 dark:bg-red-950/5' : ''}`}>
                        {supplyCols.clinic && <td className="p-3 font-bold">{o.clinic_name}</td>}
                        {supplyCols.drug && <td className="p-3 text-[var(--color-text-muted)]">{o.drug_name}</td>}
                        {supplyCols.actual && <td className="p-3 text-center font-mono font-black text-teal-600">{o.actual_qty.toLocaleString()}</td>}
                        {supplyCols.avg && <td className="p-3 text-center font-mono text-[var(--color-text-muted)]">{o.avg_qty.toFixed(1)}</td>}
                        {supplyCols.dev && <td className="p-3"><DeviationBar pct={o.deviation_pct} max={maxSupplyDev} /></td>}
                        {supplyCols.severity && <td className="p-3 text-center"><SeverityBadge pct={o.deviation_pct} /></td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* Methodology note */}
          <Card className="p-4 border border-[var(--color-border)] bg-slate-50/30 dark:bg-slate-900/20 no-print">
            <div className="flex items-start gap-3">
              <Info size={16} className="text-[var(--color-primary)] mt-0.5 shrink-0" />
              <div className="space-y-1">
                <h4 className="text-xs font-black text-[var(--color-text)]">منهجية الكشف الإحصائي المتبعة</h4>
                <p className="text-[10px] text-[var(--color-text-muted)] leading-relaxed">
                  <strong>العيادات الشاذة:</strong> يُعدّ الاستهلاك شاذاً إذا تجاوز المتوسط + ضعفي الانحراف المعياري (μ + 2σ) مع وجود 3 عيادات على الأقل. ·
                  <strong> التذاكر/التكلفة:</strong> عيادات تكون تكلفة التذكرة لديها أعلى بـ 80%+ من المتوسط العام للتذاكر. ·
                  <strong> النمو المفاجئ:</strong> أصناف ارتفعت تكلفتها بأكثر من 150% مقارنة بالشهر السابق.
                </p>
              </div>
            </div>
          </Card>

        </div>
        </PrintableTable>
      ) : (
        <Card className="p-16 text-center space-y-4">
          <ShieldAlert size={48} className="mx-auto opacity-20 animate-pulse text-[var(--color-primary)]" />
          <div className="space-y-2">
            <h3 className="text-base font-bold text-[var(--color-text)]">لم يتم تشغيل فحص الانحرافات بعد</h3>
            <p className="text-xs text-[var(--color-text-muted)] max-w-md mx-auto leading-relaxed">
              اختر الفرع والشهر المطلوب تحليله ثم اضغط على "تشغيل فحص الانحرافات" لاستعراض الأنماط الشاذة والمشتبه بها في بيانات الصرف.
            </p>
          </div>
        </Card>
      )}
    </div>
  );
};

export default AnomalyDetectionPage;
