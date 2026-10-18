import React, { useState, useMemo, useEffect } from 'react';
import PageHeader from '../../../components/ui/PageHeader';
import Breadcrumb from '../../../components/ui/Breadcrumb';
import HierarchySelector from '../../../components/common/HierarchySelector';
import Card from '../../../components/ui/Card';
import Button from '../../../components/ui/Button';
import ExportMenu from '../../../components/ui/ExportMenu';
import useReportPrintShortcut from '../../../hooks/useReportPrintShortcut';
import PrintableTable from '../../../components/common/PrintableTable';
import { useToast } from '../../../components/ui/Toast';
import invoke from '../../../api/tauriApi';
import { useGlobalApp } from '../../../context/useGlobalApp';
import { buildHierarchyLabel } from '../../../utils/reportUtils';
import html2canvas from 'html2canvas';
import { exportMultiSheetExcel, exportToWord, exportToPDF } from '../../../utils/exportUtils';
import { useRef } from 'react';
import {
  DollarSign, Search, TrendingUp, Award,
  BarChart3, Filter, Pill, ArrowUpDown
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell, LabelList,
  PieChart, Pie, Legend, LineChart, Line
} from 'recharts';

// ── Time Filter Presets ──────────────────────────────────────
const getMonthStr = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const now = new Date();
const currentMonth = getMonthStr(now);
const getMonthsBack = (n) => {
  const arr = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    arr.push(getMonthStr(d));
  }
  return arr;
};
const getYearMonths = (year) => Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);
const getQuarter = (q, year = now.getFullYear()) => {
  const start = (q - 1) * 3;
  return Array.from({ length: 3 }, (_, i) => `${year}-${String(start + i + 1).padStart(2, '0')}`);
};

const TIME_PRESETS = [
  { key: 'current', label: 'الشهر الحالي', months: [currentMonth] },
  { key: 'prev', label: 'الشهر السابق', months: getMonthsBack(2).slice(1) },
  { key: 'last3', label: 'آخر 3 أشهر', months: getMonthsBack(3) },
  { key: 'last6', label: 'آخر 6 أشهر', months: getMonthsBack(6) },
  { key: 'last9', label: 'آخر 9 أشهر', months: getMonthsBack(9) },
  { key: 'last12', label: 'آخر 12 شهر', months: getMonthsBack(12) },
  { key: 'thisYear', label: 'السنة الحالية', months: getYearMonths(now.getFullYear()) },
  { key: 'prevYear', label: 'السنة السابقة', months: getYearMonths(now.getFullYear() - 1) },
  { key: 'q1', label: 'الربع الأول', months: getQuarter(1) },
  { key: 'q2', label: 'الربع الثاني', months: getQuarter(2) },
  { key: 'q3', label: 'الربع الثالث', months: getQuarter(3) },
  { key: 'q4', label: 'الربع الرابع', months: getQuarter(4) },
  { key: 'custom', label: 'فترة مخصصة (من-إلى)', months: [] },
];

const COLORS = [
  'var(--color-dash-1)', 
  'var(--color-dash-5)', 
  'var(--color-dash-3)', 
  'var(--color-dash-4)', 
  'var(--color-dash-6)', 
  'var(--color-dash-7)', 
  'var(--color-dash-2)'
];

const CostAnalysisPage = () => {
  const toast = useToast();
  const { workspaceMode, hierarchyNames } = useGlobalApp();
  const [activeTab, setActiveTab] = useState('breakdown');
  const [loading, setLoading] = useState(false);
  // Ref to the toolbar ExportMenu — Ctrl+P opens the EXACT same PrintPreviewModal
  // that ExportMenu → "طباعة التقرير" opens (shared imperative API, no native
  // WebView2 print dialog, no window.print() path).
  const exportMenuRef = useRef(null);
  useReportPrintShortcut(exportMenuRef);
  const [selectedTime, setSelectedTime] = useState('current');
  const [customRange, setCustomRange] = useState({ from: currentMonth, to: currentMonth });
  const [hierarchy, setHierarchy] = useState({ branchId: '', areaId: '', clinicId: '' });
  const chartRef = useRef(null);

  // Tab 1 data
  const [breakdownData, setBreakdownData] = useState([]);
  const [categoryFilter, setCategoryFilter] = useState('all');

  // Tab 2 data
  const [topData, setTopData] = useState([]);
  const [drugs, setDrugs] = useState([]);
  const [topLimit, setTopLimit] = useState(10);
  const [sortBy, setSortBy] = useState('cost');

  useEffect(() => {
    invoke('get_drugs').then(d => setDrugs(d || [])).catch(() => {});
  }, []);

  const selectedMonths = useMemo(() => {
    if (selectedTime === 'custom') {
      const start = new Date(customRange.from + '-01');
      const end = new Date(customRange.to + '-01');
      const arr = [];
      let cur = new Date(start);
      while (cur <= end) {
        arr.push(getMonthStr(cur));
        cur.setMonth(cur.getMonth() + 1);
      }
      return arr.length > 0 ? arr : [currentMonth];
    }
    return TIME_PRESETS.find(p => p.key === selectedTime)?.months || [currentMonth];
  }, [selectedTime, customRange]);

  const handleGenerate = async () => {
    if (!hierarchy.branchId) { toast.warning('يرجى اختيار الفرع أولاً'); return; }
    setLoading(true);
    try {
      const params = {
        branchId: parseInt(hierarchy.branchId),
        areaId: hierarchy.areaId ? parseInt(hierarchy.areaId) : null,
        clinicId: hierarchy.clinicId ? parseInt(hierarchy.clinicId) : null,
        months: selectedMonths,
      };

      if (activeTab === 'breakdown') {
        const res = await invoke('get_cost_breakdown_report', params);
        setBreakdownData(res || []);
        if (res?.length) toast.success('تم تحميل بيانات التكلفة بنجاح');
      } else {
        const res = await invoke('get_top_items_report', { ...params, limit: topLimit, sortBy });
        const enriched = (res || []).map(r => {
          const drug = drugs.find(d => d.id === r.drug_id);
          return { ...r, drugName: drug?.name || `صنف #${r.drug_id}` };
        });
        setTopData(enriched);
        if (enriched.length) toast.success(`تم تحميل أعلى ${enriched.length} صنف`);
      }
    } catch (err) { toast.error(`خطأ: ${err}`); }
    finally { setLoading(false); }
  };

  // ── Computed ──
  const totalCost = useMemo(() => breakdownData.reduce((s, r) => s + r.cost, 0), [breakdownData]);
  
  const aggregatedByCategory = useMemo(() => {
    const map = {};
    breakdownData.forEach(r => {
      if (!map[r.category]) map[r.category] = { category: r.category, cost: 0 };
      map[r.category].cost += r.cost;
    });
    return Object.values(map).sort((a, b) => b.cost - a.cost);
  }, [breakdownData]);

  const filteredBreakdown = useMemo(() => {
    if (categoryFilter === 'all') return aggregatedByCategory;
    return breakdownData
      .filter(r => r.category === categoryFilter)
      .sort((a, b) => a.month.localeCompare(b.month));
  }, [breakdownData, aggregatedByCategory, categoryFilter]);

  const categoryTotalCost = useMemo(() => {
    if (categoryFilter === 'all') return totalCost;
    return filteredBreakdown.reduce((s, r) => s + r.cost, 0);
  }, [filteredBreakdown, categoryFilter, totalCost]);

  const sortLabel = sortBy === 'cost' ? 'التكلفة' : sortBy === 'cases' ? 'الحالات' : 'الكمية';
  const sortAccessor = sortBy === 'cost' ? 'total_cost' : sortBy === 'cases' ? 'total_cases' : 'total_quantity';

  // ── Export columns ──
  const breakdownExportCols = categoryFilter === 'all' 
    ? [
        { header: 'التصنيف', exportAccessor: r => r.category },
        { header: 'التكلفة (ج.م)', exportAccessor: r => r.cost.toLocaleString() }
      ]
    : [
        { header: 'الشهر', exportAccessor: r => r.month },
        { header: 'التكلفة (ج.م)', exportAccessor: r => r.cost.toLocaleString() }
      ];

  const topExportCols = [
    { header: 'اسم الصنف', exportAccessor: r => r.drugName },
    { header: 'التكلفة', exportAccessor: r => r.total_cost.toLocaleString() },
    { header: 'الكمية', exportAccessor: r => r.total_quantity.toLocaleString() },
    { header: 'الحالات', exportAccessor: r => r.total_cases.toLocaleString() },
  ];

  const currentExportData = activeTab === 'breakdown' ? filteredBreakdown : topData;
  const currentExportCols = activeTab === 'breakdown' ? breakdownExportCols : topExportCols;
  const timeLabel = selectedTime === 'custom' ? `من ${customRange.from} إلى ${customRange.to}` : (TIME_PRESETS.find(p => p.key === selectedTime)?.label || '');

  const handleCustomExport = async (format, { data, columns, options }) => {
     // Let ExportMenu handle print natively (opens PrintSettingsModal)
     if (format === 'print') return false;

     let chartImage = null;
     if (chartRef.current) {
        try {
           const canvas = await html2canvas(chartRef.current, { scale: 2, backgroundColor: '#ffffff' });
           chartImage = canvas.toDataURL('image/png');
        } catch (err) {
           console.error('Failed to capture chart:', err);
        }
     }
      // Save outcome of whichever format branch runs (true = saved,
      // false/unknown = cancelled: silent, no built-in fallback export).
      let saved = false;
      if (format === 'excel') {
        // Build summary data for multi-sheet export
        const totalCost = data.reduce((s, r) => {
          const val = parseFloat(String(r.cost || r.total_cost || 0).replace(/,/g, ''));
          return s + (isNaN(val) ? 0 : val);
        }, 0);
        const sheetsData = {
          'التقرير الرئيسي': { data, columns, options: { ...options, chartImage } },
        };
        const summaryLabel = activeTab === 'breakdown' ? 'التكلفة حسب التصنيف' : 'أعلى الأصناف';
        saved = await exportMultiSheetExcel(sheetsData, {
          fileName: options.fileName || 'cost_analysis',
          title: options.title || 'تحليل التكلفة الشامل',
          chartImage,
          summaryData: {
            headers: ['المؤشر', 'القيمة'],
            rows: [
              ['عدد السجلات', String(data.length)],
              ['إجمالي التكلفة', `${totalCost.toLocaleString()} ج.م`],
              ['نوع التقرير', summaryLabel],
              ['النطاق الزمني', options.subtitle || ''],
            ],
          },
        });
     }
      else if (format === 'word') saved = await exportToWord(data, columns, { ...options, chartImage });
      else if (format === 'pdf') saved = await exportToPDF(data, columns, { ...options, chartImage });
      else return false; // Unknown format — let ExportMenu handle it

      return saved === true ? true : 'cancelled';
  };

  return (
    <div className="space-y-6 animate-fadeIn pb-20">
      <Breadcrumb items={[{ label: 'التقارير' }, { label: 'تحليل التكلفة الشامل' }]} />
      <PageHeader
        title="تحليل التكلفة الشامل"
        icon={DollarSign}
        description="تقرير تحليلي متقدم لعرض تكاليف المنصرف بجميع تصنيفاته وأعلى الأصناف استهلاكاً."
        actions={
          <ExportMenu ref={exportMenuRef} data={currentExportData} columns={currentExportCols}
            onCustomExport={handleCustomExport}
            options={{ title: 'تحليل التكلفة الشامل', fileName: 'cost_analysis', subtitle: `النطاق الزمني: ${timeLabel}` }} />
        }
      />

      {/* ── Filters Panel ── */}
      <Card className="p-6 space-y-5 no-print border-none shadow-lg">
        <div className="flex items-center gap-2 mb-1">
          <Filter size={16} className="text-cyan-600" />
          <h3 className="font-black text-[var(--color-text)] text-sm">الفلاتر والنطاق الزمني</h3>
        </div>

        <HierarchySelector compact onSelectionChange={d => setHierarchy(prev => ({ ...prev, ...d }))} initialBranch={hierarchy.branchId} />

        {/* Time Presets */}
        <div>
          <label className="field-label mb-2 block">النطاق الزمني</label>
          <div className="flex flex-wrap gap-2">
            {TIME_PRESETS.map(p => (
              <button key={p.key} onClick={() => setSelectedTime(p.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${selectedTime === p.key
                   ? 'bg-cyan-600 text-white border-cyan-600 shadow-md shadow-cyan-100'
                   : 'bg-[var(--color-bg-card)] text-[var(--color-text-muted)] border-[var(--color-border)] hover:border-cyan-300 hover:text-cyan-600'}`}>
                {p.label}
              </button>
            ))}
          </div>

          {selectedTime === 'custom' && (
             <div className="flex items-center gap-4 mt-4 p-4 bg-[var(--color-bg)] rounded-xl border border-[var(--color-border)] animate-fadeIn w-fit">
                <div>
                   <label className="text-[10px] font-bold text-[var(--color-text-muted)] block mb-1">من شهر</label>
                   <input type="month" value={customRange.from} onChange={e => setCustomRange({...customRange, from: e.target.value})} className="p-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] text-[var(--color-text)] text-sm font-bold outline-none" />
                </div>
                <div>
                   <label className="text-[10px] font-bold text-[var(--color-text-muted)] block mb-1">إلى شهر</label>
                   <input type="month" value={customRange.to} onChange={e => setCustomRange({...customRange, to: e.target.value})} className="p-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] text-[var(--color-text)] text-sm font-bold outline-none" />
                </div>
             </div>
          )}
        </div>

        {/* Tab Switcher + Generate */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
          <div className="flex p-1 bg-[var(--color-bg)] rounded-xl">
            <button onClick={() => setActiveTab('breakdown')}
              className={`px-6 py-2.5 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${activeTab === 'breakdown' ? 'bg-[var(--color-bg-card)] shadow text-cyan-700' : 'text-[var(--color-text-muted)]'}`}>
              <BarChart3 size={15} /> تكلفة الجهة
            </button>
            <button onClick={() => setActiveTab('top')}
              className={`px-6 py-2.5 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${activeTab === 'top' ? 'bg-[var(--color-bg-card)] shadow text-cyan-700' : 'text-[var(--color-text-muted)]'}`}>
              <Award size={15} /> أعلى الأصناف
            </button>
          </div>

          {activeTab === 'top' && (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-bold text-[var(--color-text-muted)]">أعلى:</span>
                {[5, 10, 20].map(n => (
                  <button key={n} onClick={() => setTopLimit(n)}
                    className={`w-8 h-8 rounded-lg text-xs font-black transition-all ${topLimit === n ? 'bg-cyan-600 text-white shadow' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                    {n}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-bold text-[var(--color-text-muted)]">ترتيب:</span>
                {[{ k: 'cost', l: 'تكلفة' }, { k: 'cases', l: 'حالات' }, { k: 'quantity', l: 'كمية' }].map(s => (
                  <button key={s.k} onClick={() => setSortBy(s.k)}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all ${sortBy === s.k ? 'bg-purple-600 text-white shadow' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                    {s.l}
                  </button>
                ))}
              </div>
            </div>
          )}

          <Button variant="primary" icon={Search} onClick={handleGenerate} loading={loading}
            className="px-10 py-3 rounded-xl shadow-lg shadow-cyan-100 bg-cyan-600">
            توليد التقرير
          </Button>
        </div>
      </Card>

      {/* ══════════ TAB 1: Cost Breakdown ══════════ */}
      {activeTab === 'breakdown' && breakdownData.length > 0 && (
        <div className="space-y-6 animate-slideUp">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="p-5 text-center bg-[var(--color-bg-card)] border-[var(--color-border)]">
              <p className="text-[10px] font-bold text-cyan-600 uppercase mb-1">إجمالي التكلفة الكلية</p>
              <h2 className="text-2xl font-black text-[var(--color-text)]">{totalCost.toLocaleString()}</h2>
              <p className="text-[10px] text-[var(--color-text-muted)]">جنيه مصري</p>
            </Card>
            <Card className="p-5 text-center bg-[var(--color-bg-card)] border-[var(--color-border)]">
              <p className="text-[10px] font-bold text-purple-600 uppercase mb-1">عدد التصنيفات</p>
              <h2 className="text-2xl font-black text-[var(--color-text)]">{breakdownData.length}</h2>
              <p className="text-[10px] text-slate-400">تصنيف نشط</p>
            </Card>
            <Card className="p-5 text-center bg-[var(--color-bg-card)] border-[var(--color-border)]">
              <p className="text-[10px] font-bold text-emerald-600 uppercase mb-1">أعلى تصنيف</p>
              <h2 className="text-lg font-black text-[var(--color-text)] truncate">{[...breakdownData].sort((a, b) => b.cost - a.cost)[0]?.category}</h2>
              <p className="text-[10px] text-slate-400">{[...breakdownData].sort((a, b) => b.cost - a.cost)[0]?.cost.toLocaleString()} ج.م</p>
            </Card>
            <Card className="p-5 text-center bg-[var(--color-bg-card)] border-[var(--color-border)]">
              <p className="text-[10px] font-bold text-amber-600 uppercase mb-1">الفترة الزمنية</p>
              <h2 className="text-lg font-black text-[var(--color-text)]">{timeLabel}</h2>
              <p className="text-[10px] text-slate-400">{selectedMonths.length} شهر</p>
            </Card>
          </div>

          {/* Category Filter */}
          <div className="flex gap-2 flex-wrap no-print">
            <button onClick={() => setCategoryFilter('all')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${categoryFilter === 'all' ? 'bg-cyan-600 text-white shadow' : 'bg-[var(--color-bg-card)] text-[var(--color-text-muted)] border border-[var(--color-border)]'}`}>
              الكل
            </button>
            {aggregatedByCategory.map((r, i) => (
              <button key={r.category} onClick={() => setCategoryFilter(r.category)}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${categoryFilter === r.category ? 'text-white shadow' : 'bg-[var(--color-bg-card)] text-[var(--color-text-muted)] border border-[var(--color-border)] hover:border-cyan-200'}`}
                style={categoryFilter === r.category ? { background: COLORS[i % COLORS.length] } : {}}>
                {r.category}
              </button>
            ))}
          </div>

          {/* Chart */}
          <Card className="p-6 border-none shadow-2xl no-print">
            <h3 className="font-black text-[var(--color-text)] mb-4 flex items-center gap-2">
              <BarChart3 size={18} className="text-cyan-600" />
              {categoryFilter === 'all' ? 'توزيع التكلفة حسب التصنيف' : `تحليل تكلفة ${categoryFilter} شهرياً`}
            </h3>
            <div ref={chartRef} style={{ width: '100%', height: 400, backgroundColor: '#ffffff', padding: '10px' }} dir="ltr">
              <ResponsiveContainer>
                {categoryFilter === 'all' ? (
                  <PieChart>
                    <Pie
                      data={filteredBreakdown.filter(d => d.cost > 0)}
                      cx="50%" cy="50%" innerRadius={80} outerRadius={130}
                      paddingAngle={5} dataKey="cost" nameKey="category"
                      label={({ name, percent }) => `${name} (${(percent * 100).toFixed(1)}%)`}
                    >
                      {filteredBreakdown.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v) => v.toLocaleString() + ' ج.م'} contentStyle={{ direction: 'rtl', borderRadius: 10 }} />
                    <Legend />
                  </PieChart>
                ) : (
                  <LineChart data={filteredBreakdown} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={v => v.toLocaleString()} tick={{ fontSize: 11 }} width={80} />
                    <Tooltip formatter={(v) => v.toLocaleString() + ' ج.م'} contentStyle={{ direction: 'rtl', borderRadius: 10 }} />
                    <Line type="monotone" dataKey="cost" stroke={COLORS[0]} strokeWidth={4} activeDot={{ r: 8 }} name="التكلفة" />
                  </LineChart>
                )}
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Table */}
          <Card className="p-0 overflow-hidden border-none shadow-2xl print:shadow-none">
            <div className="print:hidden">
              <table className="w-full" dir="rtl">
                <thead>
                  <tr style={{ background: 'linear-gradient(135deg, #0891b2, #0e7490)' }}>
                    <th className="px-6 py-4 text-right text-xs font-bold text-white tracking-wider">#</th>
                    <th className="px-6 py-4 text-right text-xs font-bold text-white tracking-wider">{categoryFilter === 'all' ? 'التصنيف' : 'الشهر'}</th>
                    <th className="px-6 py-4 text-center text-xs font-bold text-white tracking-wider">التكلفة (ج.م)</th>
                    <th className="px-6 py-4 text-center text-xs font-bold text-white tracking-wider">النسبة %</th>
                    <th className="px-6 py-4 text-center text-xs font-bold text-white tracking-wider no-print">شريط</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBreakdown.map((row, i) => {
                    const pct = categoryTotalCost > 0 ? ((row.cost / categoryTotalCost) * 100) : 0;
                    return (
                      <tr key={categoryFilter === 'all' ? row.category : row.month} className="border-b border-[var(--color-border)] hover:bg-[var(--color-bg)] transition-colors">
                        <td className="px-6 py-4 text-sm font-bold text-slate-400">{i + 1}</td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-3 h-3 rounded-full" style={{ background: COLORS[i % COLORS.length] }}></div>
                            <span className="font-bold text-[var(--color-text)]">{categoryFilter === 'all' ? row.category : row.month}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-center font-mono font-black text-[var(--color-text)] text-lg">{row.cost.toLocaleString()}</td>
                        <td className="px-6 py-4 text-center">
                          <span className="px-3 py-1 rounded-full text-xs font-black" style={{ background: `${COLORS[i % COLORS.length]}15`, color: COLORS[i % COLORS.length] }}>
                            {pct.toFixed(1)}%
                          </span>
                        </td>
                        <td className="px-6 py-4 no-print">
                          <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                            <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: COLORS[i % COLORS.length] }}></div>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ background: 'linear-gradient(135deg, #0f172a, #1e293b)' }}>
                    <td colSpan={2} className="px-6 py-4 text-right text-sm font-black text-white">الإجمالي</td>
                    <td className="px-6 py-4 text-center font-mono font-black text-cyan-300 text-xl">
                      {categoryTotalCost.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-center text-white font-black">100%</td>
                    <td className="no-print"></td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <div className="hidden print:block">
               <PrintableTable title="تحليل التكلفة الشامل" subtitle={`النطاق الزمني: ${timeLabel}`} hierarchyLabel={buildHierarchyLabel(workspaceMode, hierarchyNames)}>
                  <table className="w-full border-collapse" dir="rtl">
                    <thead>
                      <tr className="bg-slate-200 border-b-2 border-black">
                        <th className="px-4 py-2 text-right font-bold">#</th>
                        <th className="px-4 py-2 text-right font-bold">{categoryFilter === 'all' ? 'التصنيف' : 'الشهر'}</th>
                        <th className="px-4 py-2 text-center font-bold">التكلفة (ج.م)</th>
                        <th className="px-4 py-2 text-center font-bold">النسبة %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredBreakdown.map((row, i) => {
                        const pct = categoryTotalCost > 0 ? ((row.cost / categoryTotalCost) * 100) : 0;
                        return (
                          <tr key={categoryFilter === 'all' ? row.category : row.month} className="border-b border-gray-300">
                            <td className="px-4 py-2">{i + 1}</td>
                            <td className="px-4 py-2 font-bold">{categoryFilter === 'all' ? row.category : row.month}</td>
                            <td className="px-4 py-2 text-center">{row.cost.toLocaleString()}</td>
                            <td className="px-4 py-2 text-center">{pct.toFixed(1)}%</td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-black font-black">
                        <td colSpan={2} className="px-4 py-2 text-right">الإجمالي</td>
                        <td className="px-4 py-2 text-center">
                          {categoryTotalCost.toLocaleString()}
                        </td>
                        <td className="px-4 py-2 text-center">100%</td>
                      </tr>
                    </tfoot>
                  </table>
               </PrintableTable>
            </div>
          </Card>
        </div>
      )}

      {/* ══════════ TAB 2: Top Items ══════════ */}
      {activeTab === 'top' && topData.length > 0 && (
        <div className="space-y-6 animate-slideUp">
          {/* Chart */}
          <Card className="p-6 border-none shadow-2xl no-print">
            <h3 className="font-black text-[var(--color-text)] mb-4 flex items-center gap-2">
              <BarChart3 size={18} className="text-cyan-600" />
              أعلى {topData.length} صنف حسب {sortLabel}
            </h3>
            <div ref={chartRef} style={{ width: '100%', height: 400, backgroundColor: '#ffffff', padding: '10px' }} dir="ltr">
              <ResponsiveContainer>
                <BarChart data={topData} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis type="number" tickFormatter={v => v.toLocaleString()} style={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="drugName" width={160} tick={{ fontSize: 11, fontWeight: 700 }} />
                  <Tooltip
                    formatter={(val) => [val.toLocaleString(), sortLabel]}
                    contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', boxShadow: '0 10px 25px rgba(0,0,0,0.08)', direction: 'rtl' }}
                  />
                  <Bar dataKey={sortAccessor} radius={[0, 6, 6, 0]} barSize={24}>
                    {topData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    <LabelList dataKey={sortAccessor} position="right" formatter={v => v.toLocaleString()} style={{ fontSize: 10, fontWeight: 700, fill: '#475569' }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Table */}
          <Card className="p-0 overflow-hidden border-none shadow-2xl print:shadow-none">
            <div className="bg-[var(--color-bg)] px-6 py-3 border-b border-[var(--color-border)] print:hidden">
              <h3 className="font-black text-[var(--color-text)] text-sm flex items-center gap-2">
                <ArrowUpDown size={14} className="text-cyan-600" /> جدول أعلى {topData.length} صنف - مرتب حسب {sortLabel}
              </h3>
            </div>
            <div className="print:hidden">
               <table className="w-full" dir="rtl">
                 <thead>
                   <tr style={{ background: 'var(--color-bg)' }}>
                     <th className="px-5 py-3 text-right text-xs font-bold text-[var(--color-text-muted)]">#</th>
                     <th className="px-5 py-3 text-right text-xs font-bold text-[var(--color-text-muted)]">اسم الصنف</th>
                     <th className="px-5 py-3 text-center text-xs font-bold text-slate-500">التكلفة (ج.م)</th>
                     <th className="px-5 py-3 text-center text-xs font-bold text-slate-500">الكمية</th>
                     <th className="px-5 py-3 text-center text-xs font-bold text-slate-500">عدد الحالات</th>
                   </tr>
                 </thead>
                 <tbody>
                   {topData.map((row, i) => (
                     <tr key={row.drug_id} className="border-b border-[var(--color-border)] hover:bg-[var(--color-bg)] transition-colors">
                       <td className="px-5 py-3">
                         <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white font-black text-xs" style={{ background: COLORS[i % COLORS.length] }}>
                           {i + 1}
                         </div>
                       </td>
                       <td className="px-5 py-3 font-bold text-[var(--color-text)]">{row.drugName}</td>
                       <td className="px-5 py-3 text-center font-mono font-bold text-[var(--color-text)]">{row.total_cost.toLocaleString()}</td>
                       <td className="px-5 py-3 text-center font-mono text-slate-600">{row.total_quantity.toLocaleString()}</td>
                       <td className="px-5 py-3 text-center font-mono text-slate-600">{row.total_cases.toLocaleString()}</td>
                     </tr>
                   ))}
                 </tbody>
               </table>
            </div>

            <div className="hidden print:block">
               <PrintableTable title="أعلى الأصناف استهلاكاً" subtitle={`النطاق الزمني: ${timeLabel} | مرتب حسب: ${sortLabel}`} hierarchyLabel={buildHierarchyLabel(workspaceMode, hierarchyNames)}>
                 <table className="w-full border-collapse" dir="rtl">
                   <thead>
                     <tr className="bg-slate-200 border-b-2 border-black">
                       <th className="px-4 py-2 text-right font-bold">#</th>
                       <th className="px-4 py-2 text-right font-bold">اسم الصنف</th>
                       <th className="px-4 py-2 text-center font-bold">التكلفة (ج.م)</th>
                       <th className="px-4 py-2 text-center font-bold">الكمية</th>
                       <th className="px-4 py-2 text-center font-bold">عدد الحالات</th>
                     </tr>
                   </thead>
                   <tbody>
                     {topData.map((row, i) => (
                       <tr key={row.drug_id} className="border-b border-gray-300">
                         <td className="px-4 py-2">{i + 1}</td>
                         <td className="px-4 py-2 font-bold">{row.drugName}</td>
                         <td className="px-4 py-2 text-center">{row.total_cost.toLocaleString()}</td>
                         <td className="px-4 py-2 text-center">{row.total_quantity.toLocaleString()}</td>
                         <td className="px-4 py-2 text-center">{row.total_cases.toLocaleString()}</td>
                       </tr>
                     ))}
                   </tbody>
                 </table>
               </PrintableTable>
            </div>
          </Card>
        </div>
      )}

      {/* Empty State */}
      {((activeTab === 'breakdown' && !breakdownData.length) || (activeTab === 'top' && !topData.length)) && !loading && (
        <Card className="p-20 flex flex-col items-center justify-center text-center opacity-40">
          <DollarSign size={60} className="mb-4 text-slate-200" />
          <p className="font-bold text-[var(--color-text-muted)]">اختر الفرع والنطاق الزمني ثم اضغط "توليد التقرير" لعرض البيانات.</p>
        </Card>
      )}
    </div>
  );
};

export default CostAnalysisPage;
