import React, { useState, useMemo, useRef } from 'react';
import PageHeader from '../../../components/ui/PageHeader';
import Breadcrumb from '../../../components/ui/Breadcrumb';
import HierarchySelector from '../../../components/common/HierarchySelector';
import Card from '../../../components/ui/Card';
import Button from '../../../components/ui/Button';
import { useToast } from '../../../components/ui/Toast';
import invoke from '../../../api/tauriApi';
import ExportMenu from '../../../components/ui/ExportMenu';
import PrintableTable from '../../../components/common/PrintableTable';
import useReportPrintShortcut from '../../../hooks/useReportPrintShortcut';
import { useGlobalApp } from '../../../context/useGlobalApp';
import { exportToWord, exportToPDF, exportMultiSheetExcel } from '../../../utils/exportUtils';
import { toPng } from 'html-to-image';
import { 
  PieChart as ChartIcon, Search, DollarSign, Users, TrendingUp, 
  Pill, Heart, Download, AlertCircle, Info, Calendar, ListFilter
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell, Legend, AreaChart, Area
} from 'recharts';

const COLORS = ['#0891b2', '#7c3aed', '#059669', '#d97706'];

const COLUMN_DEFS = [
  { id: 'month', label: 'الشهر' },
  { id: 'free_auth', label: 'هيئة - مجاني' },
  { id: 'sup_auth', label: 'هيئة - مدعم' },
  { id: 'share_auth', label: 'هيئة - حصة المريض' },
  { id: 'free_stud', label: 'طلاب - مجاني' },
  { id: 'sup_stud', label: 'طلاب - مدعم' },
  { id: 'share_stud', label: 'طلاب - حصة المريض' },
  { id: 'free_inf', label: 'رضع - مجاني' },
  { id: 'sup_inf', label: 'رضع - مدعم' },
  { id: 'share_inf', label: 'رضع - حصة المريض' },
  { id: 'free_wom', label: 'معيلات - مجاني' },
  { id: 'total', label: 'الإجمالي الكلي' },
];

const DemographicReportPage = () => {
  const toast = useToast();
  const { activeHierarchy } = useGlobalApp();
  const [hierarchy, setHierarchy] = useState({
    branchId: '', areaId: '', clinicId: ''
  });
  
  const [range, setRange] = useState({
    start: new Date(new Date().setMonth(new Date().getMonth() - 5)).toISOString().substring(0, 7), // 6 months range
    end: new Date().toISOString().substring(0, 7)
  });

  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showColPicker, setShowColPicker] = useState(false);
  const chartRef = useRef(null);
  const [chartImage, setChartImage] = useState(null);

  const exportMenuRef = useRef(null);
  useReportPrintShortcut(exportMenuRef);

  // Auto-capture chart image after data loads for print/export
  React.useEffect(() => {
    if (data.length > 0) {
      setChartImage(null);
      const timer = setTimeout(async () => {
        try {
          if (chartRef.current) {
            const el = chartRef.current.querySelector('.recharts-wrapper');
            if (el) {
              const img = await toPng(el, { quality: 0.85, pixelRatio: 1, backgroundColor: '#ffffff' });
              setChartImage(img);
            }
          }
        } catch (e) {
          console.error('Failed to capture demographic chart:', e);
        }
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [data]);

  const [visibleCols, setVisibleCols] = useState({
    month: true,
    free_auth: true,
    sup_auth: true,
    share_auth: true,
    free_stud: true,
    sup_stud: true,
    share_stud: true,
    free_inf: true,
    sup_inf: true,
    share_inf: true,
    free_wom: true,
    total: true,
  });

  const handleGenerate = async () => {
    if (!hierarchy.branchId) {
      toast.warning('يرجى اختيار الفرع على الأقل');
      return;
    }
    if (range.start.localeCompare(range.end) > 0) {
      toast.warning('تاريخ البدء يجب أن يكون مساوياً أو سابقاً لتاريخ الانتهاء');
      return;
    }
    
    setLoading(true);
    try {
      const result = await invoke('get_demographic_report', {
        branchId: hierarchy.branchId ? parseInt(hierarchy.branchId) : null,
        areaId: hierarchy.areaId ? parseInt(hierarchy.areaId) : null,
        clinicId: hierarchy.clinicId ? parseInt(hierarchy.clinicId) : null,
        startMonth: range.start,
        endMonth: range.end
      });
      setData(result || []);
      toast.success('تم تحميل تقرير الفئات الاجتماعية بنجاح');
    } catch (err) {
      console.error(err);
      toast.error(`فشل تحميل البيانات: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  // --- Calculate summary costs ---
  const summaries = useMemo(() => {
    let authorityFree = 0, authoritySup = 0, authorityShare = 0;
    let studentsFree = 0, studentsSup = 0, studentsShare = 0;
    let infantsFree = 0, infantsSup = 0, infantsShare = 0;
    let womenFree = 0;

    data.forEach(row => {
      authorityFree += row.free_authority;
      authoritySup += row.sup_authority_val;
      authorityShare += row.sup_authority_share;

      studentsFree += row.free_students;
      studentsSup += row.sup_students_val;
      studentsShare += row.sup_students_share;

      infantsFree += row.free_infants;
      infantsSup += row.sup_infants_val;
      infantsShare += row.sup_infants_share;

      womenFree += row.free_women;
    });

    const authorityTotal = authorityFree + authoritySup + authorityShare;
    const studentsTotal = studentsFree + studentsSup + studentsShare;
    const infantsTotal = infantsFree + infantsSup + infantsShare;
    const womenTotal = womenFree;

    const grandTotal = authorityTotal + studentsTotal + infantsTotal + womenTotal;
    const totalFree = authorityFree + studentsFree + infantsFree + womenFree;
    const totalSupported = authoritySup + studentsSup + infantsSup;
    const totalShare = authorityShare + studentsShare + infantsShare;

    return {
      authority: { free: authorityFree, sup: authoritySup, share: authorityShare, total: authorityTotal },
      students: { free: studentsFree, sup: studentsSup, share: studentsShare, total: studentsTotal },
      infants: { free: infantsFree, sup: infantsSup, share: infantsShare, total: infantsTotal },
      women: { free: womenFree, total: womenTotal },
      grandTotal,
      totalFree,
      totalSupported,
      totalShare
    };
  }, [data]);

  // --- Prepare data for area chart ---
  const chartData = useMemo(() => {
    return data.map(row => {
      const auth = row.free_authority + row.sup_authority_val + row.sup_authority_share;
      const stud = row.free_students + row.sup_students_val + row.sup_students_share;
      const inf = row.free_infants + row.sup_infants_val + row.sup_infants_share;
      const wom = row.free_women;
      return {
        month: row.month,
        'العاملين بالهيئة': auth,
        'الطلاب': stud,
        'الأطفال الرضع': inf,
        'المرأة المعيلة': wom
      };
    });
  }, [data]);

  const { summaryCols, summaryExportRows, exportColumns, exportRows, multiTables } = useMemo(() => {
    const cols = [];
    if (visibleCols.month) cols.push({ header: 'الشهر', accessor: 'month' });
    if (visibleCols.free_auth) cols.push({ header: 'هيئة - مجاني', accessor: 'free_auth' });
    if (visibleCols.sup_auth) cols.push({ header: 'هيئة - مدعم (هيئة)', accessor: 'sup_auth' });
    if (visibleCols.share_auth) cols.push({ header: 'هيئة - حصة المريض', accessor: 'share_auth' });
    if (visibleCols.free_stud) cols.push({ header: 'طلاب - مجاني', accessor: 'free_stud' });
    if (visibleCols.sup_stud) cols.push({ header: 'طلاب - مدعم (هيئة)', accessor: 'sup_stud' });
    if (visibleCols.share_stud) cols.push({ header: 'طلاب - حصة المريض', accessor: 'share_stud' });
    if (visibleCols.free_inf) cols.push({ header: 'رضع - مجاني', accessor: 'free_inf' });
    if (visibleCols.sup_inf) cols.push({ header: 'رضع - مدعم (هيئة)', accessor: 'sup_inf' });
    if (visibleCols.share_inf) cols.push({ header: 'رضع - حصة المريض', accessor: 'share_inf' });
    if (visibleCols.free_wom) cols.push({ header: 'معيلات - مجاني', accessor: 'free_wom' });
    if (visibleCols.total) cols.push({ header: 'إجمالي المنصرف المالي', accessor: 'total' });

    const rows = data.map(row => {
      const item = {};
      if (visibleCols.month) item.month = row.month;
      if (visibleCols.free_auth) item.free_auth = row.free_authority;
      if (visibleCols.sup_auth) item.sup_auth = row.sup_authority_val;
      if (visibleCols.share_auth) item.share_auth = row.sup_authority_share;
      if (visibleCols.free_stud) item.free_stud = row.free_students;
      if (visibleCols.sup_stud) item.sup_stud = row.sup_students_val;
      if (visibleCols.share_stud) item.share_stud = row.sup_students_share;
      if (visibleCols.free_inf) item.free_inf = row.free_infants;
      if (visibleCols.sup_inf) item.sup_inf = row.sup_infants_val;
      if (visibleCols.share_inf) item.share_inf = row.sup_infants_share;
      if (visibleCols.free_wom) item.free_wom = row.free_women;
      if (visibleCols.total) {
        const auth = row.free_authority + row.sup_authority_val + row.sup_authority_share;
        const stud = row.free_students + row.sup_students_val + row.sup_students_share;
        const inf = row.free_infants + row.sup_infants_val + row.sup_infants_share;
        const wom = row.free_women;
        item.total = auth + stud + inf + wom;
      }
      return item;
    });

    const sCols = [
      { header: 'الفئة الاجتماعية', accessor: 'category' },
      { header: 'إجمالي المجاني (ج.م)', accessor: 'free' },
      { header: 'إجمالي المدعم (ج.م)', accessor: 'sup' },
      { header: 'حصة المريض (ج.م)', accessor: 'share' },
      { header: 'الإجمالي الكلي (ج.م)', accessor: 'total' }
    ];
    const sRows = [
      { category: 'العاملين بالهيئة', free: summaries.authority.free.toLocaleString(), sup: summaries.authority.sup.toLocaleString(), share: summaries.authority.share.toLocaleString(), total: summaries.authority.total.toLocaleString() },
      { category: 'الطلاب', free: summaries.students.free.toLocaleString(), sup: summaries.students.sup.toLocaleString(), share: summaries.students.share.toLocaleString(), total: summaries.students.total.toLocaleString() },
      { category: 'الأطفال الرضع', free: summaries.infants.free.toLocaleString(), sup: summaries.infants.sup.toLocaleString(), share: summaries.infants.share.toLocaleString(), total: summaries.infants.total.toLocaleString() },
      { category: 'المرأة المعيلة', free: summaries.women.free.toLocaleString(), sup: '--', share: '--', total: summaries.women.total.toLocaleString() },
      { category: 'الإجمالي العام', free: summaries.totalFree.toLocaleString(), sup: summaries.totalSupported.toLocaleString(), share: summaries.totalShare.toLocaleString(), total: summaries.grandTotal.toLocaleString() }
    ];

    return {
      summaryCols: sCols,
      summaryExportRows: sRows,
      exportColumns: cols,
      exportRows: rows,
      multiTables: [
        { data: sRows, columns: sCols, title: 'ملخص الفئات الاجتماعية' },
        { data: rows, columns: cols, title: 'تفاصيل البيانات الشهرية' },
      ],
    };
  }, [data, visibleCols, summaries]);

  // Premium Export Handler
  const handlePremiumExport = async (type, { options }) => {
    if (data.length === 0) return false;
    try {
      // Use pre-captured chart image
      const exportOptions = {
        ...options,
        title: 'تقرير توزيع المنصرف حسب الفئات المستفيدة',
        fileName: 'demographic_dispense_report',
        chartImage,
        subtitle: ''
      };

      if (type === 'excel') {
        const sheetsData = {
          'ملخص الفئات الاجتماعية': { data: summaryExportRows, columns: summaryCols, options: exportOptions },
          'تفاصيل البيانات الشهرية': { data: exportRows, columns: exportColumns, options: exportOptions }
        };
        const excelSaved = await exportMultiSheetExcel(sheetsData, {
          fileName: 'demographic_dispense_report',
          title: 'تقرير توزيع المنصرف حسب الفئات المستفيدة',
          chartImage
        });
        return excelSaved === true ? true : 'cancelled';
      }
      // Word/PDF: mirror the Excel sheets as separate titled tables
      const wordPdfOptions = { ...exportOptions, tables: multiTables };
      if (type === 'word') {
        const wordSaved = await exportToWord(summaryExportRows, summaryCols, wordPdfOptions);
        return wordSaved === true ? true : 'cancelled';
      }
      if (type === 'pdf') {
        const pdfSaved = await exportToPDF(summaryExportRows, summaryCols, wordPdfOptions);
        return pdfSaved === true ? true : 'cancelled';
      }
      return false;
    } catch (e) {
      console.error(e);
      toast.error(`فشل التصدير: ${e.message || e}`);
      return false;
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn pb-20 dir-rtl" dir="rtl">
      <Breadcrumb items={[{ label: 'التقارير' }, { label: 'تحليل الفئات الاجتماعية المستهدفة' }]} />
      
      <PageHeader 
        title="تحليل الفئات الاجتماعية المستهدفة" 
        icon={ChartIcon} 
        description="تحليل تكلفة المنصرف الدوائي للفئات المستفيدة (العاملين بالهيئة، الطلاب، الأطفال الرضع، المرأة المعيلة)."
        actions={
          data.length > 0 && (
            <ExportMenu
              ref={exportMenuRef}
              data={data}
              columns={[]}
              onCustomExport={handlePremiumExport}
              options={{
                title: 'تقرير توزيع المنصرف حسب الفئات المستفيدة',
                fileName: 'demographic_dispense_report',
                subtitle: `الفترة: من ${range.start} إلى ${range.end}`,
                month: activeHierarchy?.dispenseMonth || '',
                tables: multiTables
              }}
            />
          )
        }
      />

      {/* Control panel & Filter */}
      <Card className="p-6 space-y-6 no-print">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-end">
          {/* Hierarchy */}
          <div className="lg:col-span-2">
            <HierarchySelector 
              onSelectionChange={(d) => setHierarchy(prev => ({ ...prev, ...d }))}
              initialBranch={hierarchy.branchId}
              initialArea={hierarchy.areaId}
              initialClinic={hierarchy.clinicId}
              hideMonth // Disable single month selection (page has its own date-range picker)
            />
          </div>
          
          {/* Date range picker */}
          <div className="grid grid-cols-2 gap-4 bg-[var(--color-bg-card)] border border-[var(--color-border)] p-3.5 rounded-2xl">
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-[var(--color-text-muted)] flex items-center gap-1.5">
                <Calendar size={12} className="text-[var(--color-primary)]" />
                من شهر
              </label>
              <input 
                type="month"
                className="bg-transparent border-none outline-none text-xs font-black text-[var(--color-text)] cursor-pointer"
                value={range.start}
                onChange={(e) => setRange({ ...range, start: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1.5 border-r pr-3 border-[var(--color-border)]">
              <label className="text-[10px] font-bold text-[var(--color-text-muted)] flex items-center gap-1.5">
                <Calendar size={12} className="text-[var(--color-primary)]" />
                إلى شهر
              </label>
              <input 
                type="month"
                className="bg-transparent border-none outline-none text-xs font-black text-[var(--color-text)] cursor-pointer"
                value={range.end}
                onChange={(e) => setRange({ ...range, end: e.target.value })}
              />
            </div>
          </div>
        </div>
        
        <div className="flex justify-end pt-4 border-t border-slate-100 dark:border-slate-800">
          <Button 
            variant="primary" 
            icon={Search} 
            onClick={handleGenerate} 
            loading={loading} 
            className="h-11 px-16 shadow-lg shadow-primary/10 rounded-xl"
          >
            توليد التقرير التحليلي
          </Button>
        </div>
      </Card>

      {/* Main Analysis Content */}
      {data.length > 0 ? (
        <PrintableTable title="تقرير الفئات المستهدفة والتركيبة الاجتماعية" subtitle={`الفترة: من ${range.start} إلى ${range.end}`}>
          <div className="space-y-6">
          
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <Card className="p-5 border border-[var(--color-border)] shadow-sm bg-gradient-to-br from-cyan-500/5 to-transparent">
              <span className="text-[10px] font-black text-cyan-600 dark:text-cyan-400 tracking-wide">تكلفة منصرف العاملين بالهيئة</span>
              <h2 className="text-2xl font-black text-[var(--color-text)] mt-2">{summaries.authority.total.toLocaleString()} <span className="text-xs font-normal opacity-50">ج.م</span></h2>
              <div className="text-[9px] text-[var(--color-text-muted)] mt-4 space-y-1">
                <div>المجاني: {summaries.authority.free.toLocaleString()} ج.م</div>
                <div>المدعم (الهيئة): {summaries.authority.sup.toLocaleString()} ج.م</div>
                <div>حصة المريض: {summaries.authority.share.toLocaleString()} ج.م</div>
              </div>
            </Card>

            <Card className="p-5 border border-[var(--color-border)] shadow-sm bg-gradient-to-br from-purple-500/5 to-transparent">
              <span className="text-[10px] font-black text-purple-600 dark:text-purple-400 tracking-wide">تكلفة منصرف الطلاب</span>
              <h2 className="text-2xl font-black text-[var(--color-text)] mt-2">{summaries.students.total.toLocaleString()} <span className="text-xs font-normal opacity-50">ج.م</span></h2>
              <div className="text-[9px] text-[var(--color-text-muted)] mt-4 space-y-1">
                <div>المجاني: {summaries.students.free.toLocaleString()} ج.م</div>
                <div>المدعم (الهيئة): {summaries.students.sup.toLocaleString()} ج.م</div>
                <div>حصة المريض: {summaries.students.share.toLocaleString()} ج.م</div>
              </div>
            </Card>

            <Card className="p-5 border border-[var(--color-border)] shadow-sm bg-gradient-to-br from-emerald-500/5 to-transparent">
              <span className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 tracking-wide">تكلفة منصرف الأطفال الرضع</span>
              <h2 className="text-2xl font-black text-[var(--color-text)] mt-2">{summaries.infants.total.toLocaleString()} <span className="text-xs font-normal opacity-50">ج.م</span></h2>
              <div className="text-[9px] text-[var(--color-text-muted)] mt-4 space-y-1">
                <div>المجاني: {summaries.infants.free.toLocaleString()} ج.م</div>
                <div>المدعم (الهيئة): {summaries.infants.sup.toLocaleString()} ج.م</div>
                <div>حصة المريض: {summaries.infants.share.toLocaleString()} ج.م</div>
              </div>
            </Card>

            <Card className="p-5 border border-[var(--color-border)] shadow-sm bg-gradient-to-br from-amber-500/5 to-transparent">
              <span className="text-[10px] font-black text-amber-600 dark:text-amber-400 tracking-wide">تكلفة منصرف المرأة المعيلة</span>
              <h2 className="text-2xl font-black text-[var(--color-text)] mt-2">{summaries.women.total.toLocaleString()} <span className="text-xs font-normal opacity-50">ج.م</span></h2>
              <div className="text-[9px] text-[var(--color-text-muted)] mt-4 space-y-1">
                <div>المجاني: {summaries.women.free.toLocaleString()} ج.م</div>
                <div className="text-slate-300 dark:text-slate-700">لا يوجد صرف مدعم حالياً</div>
                <div className="opacity-0">--</div>
              </div>
            </Card>
          </div>

          {/* Budget Share KPI Summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="p-5 flex items-center justify-between border border-[var(--color-border)] shadow-sm">
              <div className="space-y-1">
                <span className="text-[9px] font-bold text-[var(--color-text-muted)]">إجمالي مساهمة التأمين الصحي (المجاني)</span>
                <h3 className="text-xl font-black text-emerald-600">{summaries.totalFree.toLocaleString()} ج.م</h3>
              </div>
              <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/20 flex items-center justify-center text-emerald-600">
                <Heart size={20} />
              </div>
            </Card>

            <Card className="p-5 flex items-center justify-between border border-[var(--color-border)] shadow-sm">
              <div className="space-y-1">
                <span className="text-[9px] font-bold text-[var(--color-text-muted)]">إجمالي مساهمة التأمين الصحي (المدعم)</span>
                <h3 className="text-xl font-black text-indigo-600">{summaries.totalSupported.toLocaleString()} ج.م</h3>
              </div>
              <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/20 flex items-center justify-center text-indigo-600">
                <DollarSign size={20} />
              </div>
            </Card>

            <Card className="p-5 flex items-center justify-between border border-[var(--color-border)] shadow-sm">
              <div className="space-y-1">
                <span className="text-[9px] font-bold text-[var(--color-text-muted)]">إجمالي مساهمة المرضى (حصة المريض)</span>
                <h3 className="text-xl font-black text-amber-600">{summaries.totalShare.toLocaleString()} ج.م</h3>
              </div>
              <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/20 flex items-center justify-center text-amber-600">
                <Users size={20} />
              </div>
            </Card>
          </div>

          {/* Area Stacked Chart & Insights */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Chart */}
            <Card className="p-6 lg:col-span-2">
              <h3 className="text-sm font-bold text-[var(--color-text)] mb-6">المنحنى الزمني لتطور استهلاك الفئات</h3>
              <div ref={chartRef} className="h-[300px] no-print-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                    <XAxis dataKey="month" tick={{ fontSize: 10, fontWeight: 'bold' }} stroke="var(--color-text-muted)" />
                    <YAxis tick={{ fontSize: 10 }} stroke="var(--color-text-muted)" />
                    <Tooltip 
                      formatter={(value) => `${parseFloat(value).toLocaleString()} ج.م`}
                      contentStyle={{ direction: 'rtl', textAlign: 'right' }}
                    />
                    <Legend verticalAlign="bottom" height={36} formatter={(value) => <span className="text-xs font-bold text-[var(--color-text-muted)]">{value}</span>} />
                    <Area type="monotone" dataKey="العاملين بالهيئة" stackId="1" stroke="#0891b2" fill="#0891b2" fillOpacity={0.1} isAnimationActive={false} />
                    <Area type="monotone" dataKey="الطلاب" stackId="1" stroke="#7c3aed" fill="#7c3aed" fillOpacity={0.1} isAnimationActive={false} />
                    <Area type="monotone" dataKey="الأطفال الرضع" stackId="1" stroke="#059669" fill="#059669" fillOpacity={0.1} isAnimationActive={false} />
                    <Area type="monotone" dataKey="المرأة المعيلة" stackId="1" stroke="#d97706" fill="#d97706" fillOpacity={0.1} isAnimationActive={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              {chartImage && (
                <div className="only-print w-full flex justify-center items-center">
                  <img src={chartImage} alt="المنحنى الزمني للفئات" className="max-h-[300px] object-contain mx-auto" />
                </div>
              )}
            </Card>

            {/* Insights panel */}
            <Card className="p-6 space-y-6">
              <h3 className="text-sm font-bold text-[var(--color-text)] flex items-center gap-2 border-b pb-3 border-slate-100 dark:border-slate-800">
                <Info size={16} className="text-[var(--color-primary)]" />
                تحليل توزيع ميزانية الفئات
              </h3>
              <div className="space-y-4">
                <div className="flex gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-cyan-500 mt-2 shrink-0"></div>
                  <div>
                    <h4 className="text-xs font-bold text-[var(--color-text)]">شريحة العاملين بالهيئة</h4>
                    <p className="text-[10px] text-[var(--color-text-muted)] leading-relaxed mt-1">
                      تمثل {((summaries.authority.total / summaries.grandTotal) * 100).toFixed(1)}% من المنصرف الإجمالي. المنصرف المجاني يمثل {((summaries.authority.free / summaries.authority.total) * 100).toFixed(1)}% من كلفة الشريحة.
                    </p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-purple-500 mt-2 shrink-0"></div>
                  <div>
                    <h4 className="text-xs font-bold text-[var(--color-text)]">شريحة الطلاب</h4>
                    <p className="text-[10px] text-[var(--color-text-muted)] leading-relaxed mt-1">
                      تمثل {((summaries.students.total / summaries.grandTotal) * 100).toFixed(1)}% من الميزانية. معدل مشاركة الطالب في التكلفة (حصة المريض) بلغ {((summaries.students.share / summaries.students.total) * 100).toFixed(1)}%.
                    </p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-2 shrink-0"></div>
                  <div>
                    <h4 className="text-xs font-bold text-[var(--color-text)]">شريحة الأطفال الرضع</h4>
                    <p className="text-[10px] text-[var(--color-text-muted)] leading-relaxed mt-1">
                      تمثل {((summaries.infants.total / summaries.grandTotal) * 100).toFixed(1)}% من الإنفاق المجمع. قيمة المنصرف المجاني بلغت {summaries.infants.free.toLocaleString()} ج.م.
                    </p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-2 shrink-0"></div>
                  <div>
                    <h4 className="text-xs font-bold text-[var(--color-text)]">شريحة المرأة المعيلة</h4>
                    <p className="text-[10px] text-[var(--color-text-muted)] leading-relaxed mt-1">
                      تمثل {((summaries.women.total / summaries.grandTotal) * 100).toFixed(1)}% من ميزانية الصرف الكلية وتستفيد بنسبة 100% كعلاج مجاني كامل.
                    </p>
                  </div>
                </div>
              </div>
            </Card>
          </div>

          {/* Details Table */}
          <Card className="p-0 overflow-hidden border border-[var(--color-border)] shadow-sm">
            <div className="bg-slate-50 dark:bg-slate-900/50 p-4 border-b border-[var(--color-border)] flex items-center justify-between">
              <h3 className="text-xs font-black text-[var(--color-text)]">بيانات الصرف المجمعة للشرائح الاجتماعية</h3>
              
              <div className="flex items-center gap-4">
                <span className="text-[10px] text-[var(--color-text-muted)] no-print">الفترة: من {range.start} إلى {range.end}</span>
                
                {/* Columns Selector Popover */}
                <div className="relative no-print">
                  <Button 
                    variant="outline" 
                    icon={ListFilter} 
                    onClick={() => setShowColPicker(!showColPicker)}
                    className="h-8 text-[10px] font-bold p-2"
                  >
                    تعديل الأعمدة
                  </Button>
                  {showColPicker && (
                    <div className="absolute right-0 mt-2 w-64 bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl shadow-xl p-4 z-50 grid grid-cols-1 gap-2 max-h-80 overflow-y-auto">
                      <div className="text-[10px] font-bold text-[var(--color-text-muted)] border-b pb-1.5 mb-1.5 flex justify-between items-center">
                        <span>أعمدة جدول الفئات الاجتماعية</span>
                        <button 
                          onClick={() => {
                            const allSelected = Object.values(visibleCols).every(v => v);
                            const nextVal = !allSelected;
                            const updated = {};
                            Object.keys(visibleCols).forEach(k => { updated[k] = nextVal; });
                            setVisibleCols(updated);
                          }}
                          className="text-primary font-bold hover:underline"
                        >
                          {Object.values(visibleCols).every(v => v) ? 'إلغاء الكل' : 'تحديد الكل'}
                        </button>
                      </div>
                      {COLUMN_DEFS.map(col => (
                        <label key={col.id} className="flex items-center gap-2 text-[10px] font-bold text-[var(--color-text)] cursor-pointer hover:bg-slate-50/50 dark:hover:bg-slate-800 p-1.5 rounded-lg">
                          <input 
                            type="checkbox"
                            checked={visibleCols[col.id]}
                            onChange={() => setVisibleCols({ ...visibleCols, [col.id]: !visibleCols[col.id] })}
                            className="rounded text-primary focus:ring-primary h-3.5 w-3.5"
                          />
                          <span>{col.label}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead>
                  <tr className="bg-slate-100/50 dark:bg-slate-900/20 text-[var(--color-text-muted)] font-black border-b border-[var(--color-border)]">
                    {visibleCols.month && <th className="p-3">الشهر</th>}
                    {visibleCols.free_auth && <th className="p-3 text-center">هيئة - مجاني</th>}
                    {visibleCols.sup_auth && <th className="p-3 text-center">هيئة - مدعم</th>}
                    {visibleCols.share_auth && <th className="p-3 text-center">هيئة - حصة المريض</th>}
                    {visibleCols.free_stud && <th className="p-3 text-center">طلاب - مجاني</th>}
                    {visibleCols.sup_stud && <th className="p-3 text-center">طلاب - مدعم</th>}
                    {visibleCols.share_stud && <th className="p-3 text-center">طلاب - حصة المريض</th>}
                    {visibleCols.free_inf && <th className="p-3 text-center">رضع - مجاني</th>}
                    {visibleCols.sup_inf && <th className="p-3 text-center">رضع - مدعم</th>}
                    {visibleCols.share_inf && <th className="p-3 text-center">رضع - حصة المريض</th>}
                    {visibleCols.free_wom && <th className="p-3 text-center">معيلات - مجاني</th>}
                    {visibleCols.total && <th className="p-3 text-left">الإجمالي</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)] text-[var(--color-text)]">
                  {data.map((row, idx) => {
                    const auth = row.free_authority + row.sup_authority_val + row.sup_authority_share;
                    const stud = row.free_students + row.sup_students_val + row.sup_students_share;
                    const inf = row.free_infants + row.sup_infants_val + row.sup_infants_share;
                    const wom = row.free_women;
                    const monthTotal = auth + stud + inf + wom;
                    return (
                      <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/10">
                        {visibleCols.month && <td className="p-3 font-bold">{row.month}</td>}
                        {visibleCols.free_auth && <td className="p-3 text-center font-mono">{row.free_authority.toLocaleString()}</td>}
                        {visibleCols.sup_auth && <td className="p-3 text-center font-mono">{row.sup_authority_val.toLocaleString()}</td>}
                        {visibleCols.share_auth && <td className="p-3 text-center font-mono">{row.sup_authority_share.toLocaleString()}</td>}
                        {visibleCols.free_stud && <td className="p-3 text-center font-mono">{row.free_students.toLocaleString()}</td>}
                        {visibleCols.sup_stud && <td className="p-3 text-center font-mono">{row.sup_students_val.toLocaleString()}</td>}
                        {visibleCols.share_stud && <td className="p-3 text-center font-mono">{row.sup_students_share.toLocaleString()}</td>}
                        {visibleCols.free_inf && <td className="p-3 text-center font-mono">{row.free_infants.toLocaleString()}</td>}
                        {visibleCols.sup_inf && <td className="p-3 text-center font-mono">{row.sup_infants_val.toLocaleString()}</td>}
                        {visibleCols.share_inf && <td className="p-3 text-center font-mono">{row.sup_infants_share.toLocaleString()}</td>}
                        {visibleCols.free_wom && <td className="p-3 text-center font-mono">{row.free_women.toLocaleString()}</td>}
                        {visibleCols.total && <td className="p-3 text-left font-mono font-bold text-indigo-600 dark:text-indigo-400">{monthTotal.toLocaleString()}</td>}
                      </tr>
                    );
                  })}
                  <tr className="bg-slate-100/50 dark:bg-slate-900/30 font-black border-t-2 border-slate-200 dark:border-slate-700">
                    {visibleCols.month && <td className="p-3 text-[var(--color-primary)]">المجموع المالي العام</td>}
                    {visibleCols.free_auth && <td className="p-3 text-center font-mono text-[var(--color-primary)]">{summaries.authority.free.toLocaleString()} ج.م</td>}
                    {visibleCols.sup_auth && <td className="p-3 text-center font-mono text-[var(--color-primary)]">{summaries.authority.sup.toLocaleString()} ج.م</td>}
                    {visibleCols.share_auth && <td className="p-3 text-center font-mono text-[var(--color-primary)]">{summaries.authority.share.toLocaleString()} ج.م</td>}
                    {visibleCols.free_stud && <td className="p-3 text-center font-mono text-[var(--color-primary)]">{summaries.students.free.toLocaleString()} ج.م</td>}
                    {visibleCols.sup_stud && <td className="p-3 text-center font-mono text-[var(--color-primary)]">{summaries.students.sup.toLocaleString()} ج.م</td>}
                    {visibleCols.share_stud && <td className="p-3 text-center font-mono text-[var(--color-primary)]">{summaries.students.share.toLocaleString()} ج.م</td>}
                    {visibleCols.free_inf && <td className="p-3 text-center font-mono text-[var(--color-primary)]">{summaries.infants.free.toLocaleString()} ج.م</td>}
                    {visibleCols.sup_inf && <td className="p-3 text-center font-mono text-[var(--color-primary)]">{summaries.infants.sup.toLocaleString()} ج.م</td>}
                    {visibleCols.share_inf && <td className="p-3 text-center font-mono text-[var(--color-primary)]">{summaries.infants.share.toLocaleString()} ج.م</td>}
                    {visibleCols.free_wom && <td className="p-3 text-center font-mono text-[var(--color-primary)]">{summaries.women.free.toLocaleString()} ج.م</td>}
                    {visibleCols.total && <td className="p-3 text-left font-mono text-[var(--color-primary)]">{summaries.grandTotal.toLocaleString()} ج.م</td>}
                  </tr>
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        </PrintableTable>
      ) : (
        !loading && (
          <Card className="p-16 text-center text-slate-400 dark:text-slate-600 space-y-4">
            <AlertCircle size={48} className="mx-auto opacity-30 animate-pulse text-[var(--color-primary)]" />
            <div className="space-y-2">
              <h3 className="text-base font-bold text-[var(--color-text)]">لا توجد بيانات معروضة</h3>
              <p className="text-xs text-[var(--color-text-muted)] max-w-md mx-auto leading-relaxed">
                يرجى اختيار الفرع والفترة الزمنية (تاريخ البدء والانتهاء) من القائمة أعلاه، ثم اضغط على زر "توليد التقرير التحليلي" لعرض النتائج المجمعة والمؤشرات الرسومية.
              </p>
            </div>
          </Card>
        )
      )}
    </div>
  );
};

export default DemographicReportPage;
