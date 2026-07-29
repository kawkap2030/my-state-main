import React, { useState, useMemo, useRef } from 'react';
import PageHeader from '../../../components/ui/PageHeader';
import Breadcrumb from '../../../components/ui/Breadcrumb';
import HierarchySelector from '../../../components/common/HierarchySelector';
import Card from '../../../components/ui/Card';
import Button from '../../../components/ui/Button';
import PrintableTable from '../../../components/common/PrintableTable';
import { useToast } from '../../../components/ui/Toast';
import invoke from '../../../api/tauriApi';
import ExportMenu from '../../../components/ui/ExportMenu';
import { exportToWord, exportToPDF, exportMultiSheetExcel } from '../../../utils/exportUtils';
import { toPng } from 'html-to-image';
import { 
  ClipboardList, Search, DollarSign, Users, TrendingUp, 
  Pill, Syringe, Layers, FileText, Sparkles, Scale,
  Download, Printer, AlertTriangle, Info, ArrowUpRight, ListFilter
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend
} from 'recharts';

const COLORS = [
  '#0891b2', // Cyan
  '#7c3aed', // Purple
  '#059669', // Emerald
  '#d97706', // Amber
  '#dc2626', // Red
  '#2563eb'  // Blue
];

const ExecutiveReportPage = () => {
  const toast = useToast();
  const [hierarchy, setHierarchy] = useState({
    branchId: '', areaId: '', clinicId: '',
    dispenseMonth: new Date().toISOString().substring(0, 7)
  });
  
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showColPicker, setShowColPicker] = useState(false);
  const [visibleCols, setVisibleCols] = useState({
    item: true,
    cases: true,
    cost: true
  });
  
  const printAreaRef = useRef(null);
  const pieChartRef = useRef(null);
  const barChartRef = useRef(null);
  const [costPieImage, setCostPieImage] = useState(null);
  const [comparisonBarImage, setComparisonBarImage] = useState(null);

  React.useEffect(() => {
    if (data) {
      setCostPieImage(null);
      setComparisonBarImage(null);
      const timer = setTimeout(async () => {
        try {
          if (pieChartRef.current) {
            const el = pieChartRef.current.querySelector('.recharts-wrapper');
            if (el) {
              const img = await toPng(el, { quality: 1.0, pixelRatio: 2, backgroundColor: '#ffffff' });
              setCostPieImage(img);
            }
          }
          if (barChartRef.current) {
            const el = barChartRef.current.querySelector('.recharts-wrapper');
            if (el) {
              const img = await toPng(el, { quality: 1.0, pixelRatio: 2, backgroundColor: '#ffffff' });
              setComparisonBarImage(img);
            }
          }
        } catch (e) {
          console.error('Failed to capture print charts:', e);
        }
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [data]);

  const handleGenerate = async () => {
    if (!hierarchy.branchId) {
      toast.warning('يرجى اختيار الفرع على الأقل');
      return;
    }
    setLoading(true);
    try {
      const result = await invoke('get_executive_report_summary', {
        branchId: hierarchy.branchId ? parseInt(hierarchy.branchId) : null,
        areaId: hierarchy.areaId ? parseInt(hierarchy.areaId) : null,
        clinicId: hierarchy.clinicId ? parseInt(hierarchy.clinicId) : null,
        dispenseMonth: hierarchy.dispenseMonth
      });
      setData(result);
      toast.success('تم تحميل التقرير التنفيذي بنجاح');
    } catch (err) {
      console.error(err);
      toast.error(`فشل في تحميل التقرير: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  // --- Calculate smart dynamic insights ---
  const insights = useMemo(() => {
    if (!data) return [];
    const list = [];
    
    // Total budget check
    if (data.total_cost > 100000) {
      list.push({
        type: 'warning',
        text: `تنبيه مالي: حجم الإنفاق الكلي مرتفع جداً (${data.total_cost.toLocaleString()} ج.م)، يرجى مراجعة مسببات الصرف الكثيف.`
      });
    } else {
      list.push({
        type: 'success',
        text: 'مؤشر مالي: النفقات الكلية مستقرة وضمن المعدلات الاعتيادية المعتمدة للهيئة.'
      });
    }

    // Drug vs Insulin comparison
    if (data.drug_cost > data.insulin_cost * 2) {
      list.push({
        type: 'info',
        text: `المنصرف الدوائي العام يلتهم الحصة الأكبر من الميزانية (${((data.drug_cost / data.total_cost) * 100).toFixed(1)}%) مقارنة بـالأنسولين.`
      });
    }

    // Judicial cost alert
    if (data.judicial_cost > data.total_cost * 0.15) {
      list.push({
        type: 'warning',
        text: `ملاحظة رقابية: الأحكام القضائية تشكل نسبة حرجة تتجاوز 15% من إجمالي الإنفاق بمبلغ قدره (${data.judicial_cost.toLocaleString()} ج.م).`
      });
    }

    // Patient contribution ratio
    const patientShareRatio = data.total_cost > 0 ? (data.patient_share / data.total_cost) * 100 : 0;
    list.push({
      type: 'info',
      text: `نسبة مساهمة المرضى (المنصرف التجاري المدعم) بلغت ${patientShareRatio.toFixed(1)}% من التكلفة الكلية لتغطية هذا الشهر.`
    });

    // Top item driver
    if (data.top_drugs && data.top_drugs.length > 0) {
      list.push({
        type: 'success',
        text: `الصنف الأعلى استهلاكاً هذا الشهر هو "${data.top_drugs[0].name}" بتكلفة قدرها (${data.top_drugs[0].cost.toLocaleString()} ج.م).`
      });
    }

    return list;
  }, [data]);

  // --- Prepare data for charts ---
  const costPieData = useMemo(() => {
    if (!data) return [];
    return [
      { name: 'أدوية تفصيلية', value: data.drug_cost },
      { name: 'أنسولين', value: data.insulin_cost },
      { name: 'مستلزمات طبية', value: data.supply_cost },
      { name: 'أحكام قضائية', value: data.judicial_cost },
    ].filter(item => item.value > 0);
  }, [data]);

  // Premium Export Handler
  const handlePremiumExport = async (type, { options }) => {
    if (!data) return false;
    try {
      // 1. Prepare Executive Summary sheet rows and columns
      const exportColumns = [];
      if (visibleCols.item) exportColumns.push({ header: 'البند المالي الإحصائي', accessor: 'item' });
      if (visibleCols.cases) exportColumns.push({ header: 'الحالات / العدد', accessor: 'cases' });
      if (visibleCols.cost) exportColumns.push({ header: 'التكلفة والمنصرف المالي', accessor: 'cost' });

      const summaryRows = [];
      const addRow = (itemLabel, casesVal, costVal) => {
        const row = {};
        if (visibleCols.item) row.item = itemLabel;
        if (visibleCols.cases) row.cases = casesVal;
        if (visibleCols.cost) row.cost = costVal;
        summaryRows.push(row);
      };
      
      addRow('منصرف الأدوية التفصيلي', `${data.drug_cases.toLocaleString()}`, `${data.drug_cost.toLocaleString()} ج.م`);
      addRow('منصرف الأنسولين', `${data.insulin_cases.toLocaleString()}`, `${data.insulin_cost.toLocaleString()} ج.م`);
      addRow('المستلزمات الطبية', '--', `${data.supply_cost.toLocaleString()} ج.م`);
      addRow('صرف الأحكام القضائية', `${data.judicial_cases.toLocaleString()}`, `${data.judicial_cost.toLocaleString()} ج.م`);
      addRow('إجمالي الأدوية المجانية (مساهمة الهيئة الكاملة)', '--', `${data.free_drugs_cost.toLocaleString()} ج.م`);
      addRow('إجمالي الأدوية المدعمة (قيمة مشاركة الهيئة)', '--', `${data.supported_drugs_cost.toLocaleString()} ج.م`);
      addRow('إجمالي المبالغ المحصلة (حصة المريض)', '--', `${data.patient_share.toLocaleString()} ج.م`);
      addRow('تذاكر طبية 56ب', `${data.tickets_56b.toLocaleString()} تذكرة`, '--');
      addRow('تذاكر طبية 56ج', `${data.tickets_56c.toLocaleString()} تذكرة`, '--');
      addRow('المجموع الكلي للإنفاق', `${data.total_cases.toLocaleString()}`, `${data.total_cost.toLocaleString()} ج.م`);

      // Use pre-captured chart image
      const chartImage = costPieImage;

      const exportOptions = {
        ...options,
        title: 'ملخص التقرير التنفيذي الموحد',
        fileName: 'executive_summary_report',
        chartImage
      };

      // 2. Prepare Detailed tables rows and columns
      const topDrugsCols = [
        { header: 'اسم الصنف الدوائي', accessor: 'name' },
        { header: 'الكمية المنصرفة', accessor: 'quantity' },
        { header: 'عدد الحالات', accessor: 'cases' },
        { header: 'التكلفة الإجمالية', accessor: 'cost' }
      ];
      const topDrugsRows = (data.top_drugs || []).map(d => ({
        name: d.name,
        quantity: d.quantity.toLocaleString(),
        cases: d.cases.toLocaleString(),
        cost: `${d.cost.toLocaleString()} ج.م`
      }));

      const topInsulinCols = [
        { header: 'نوع الإنسولين', accessor: 'name' },
        { header: 'الكمية المنصرفة', accessor: 'quantity' },
        { header: 'عدد الحالات', accessor: 'cases' },
        { header: 'التكلفة الإجمالية', accessor: 'cost' }
      ];
      const topInsulinRows = (data.top_insulin || []).map(ins => ({
        name: ins.name,
        quantity: ins.quantity.toLocaleString(),
        cases: ins.cases.toLocaleString(),
        cost: `${ins.cost.toLocaleString()} ج.م`
      }));

      // Excel Premium multi-sheet export
      if (type === 'excel') {
        const sheetsData = {
          'الملخص المالي': { data: summaryRows, columns: exportColumns, options: exportOptions }
        };
        if (topDrugsRows.length > 0) {
          sheetsData['الأدوية الأكثر استهلاكاً'] = { data: topDrugsRows, columns: topDrugsCols, options: exportOptions };
        }
        if (topInsulinRows.length > 0) {
          sheetsData['الإنسولين الأكثر استهلاكاً'] = { data: topInsulinRows, columns: topInsulinCols, options: exportOptions };
        }
        await exportMultiSheetExcel(sheetsData, {
          fileName: 'executive_summary_report',
          title: 'التقرير التنفيذي الشامل والمفصل',
          chartImage
        });
        return true;
      }

      // Word & PDF: Build a unified flat data containing all sections
      const combinedColumns = [
        { header: 'البيان الإحصائي / البند', accessor: 'label' },
        { header: 'الحالات / العدد', accessor: 'cases' },
        { header: 'الكمية المنصرفة', accessor: 'quantity' },
        { header: 'التكلفة والمنصرف المالي', accessor: 'cost' }
      ];

      const combinedRows = [];

      // Add Summary Section
      combinedRows.push({ label: '═══ الملخص المالي الإحصائي ═══', cases: '', quantity: '', cost: '' });
      summaryRows.forEach(row => {
        combinedRows.push({
          label: row.item || '',
          cases: row.cases || '',
          quantity: '--',
          cost: row.cost || ''
        });
      });

      // Add Drugs Section
      if (topDrugsRows.length > 0) {
        combinedRows.push({ label: '', cases: '', quantity: '', cost: '' });
        combinedRows.push({ label: '═══ الأدوية الأكثر استهلاكاً وكلفة (أهم 5 أصناف) ═══', cases: '', quantity: '', cost: '' });
        topDrugsRows.forEach(row => {
          combinedRows.push({
            label: row.name,
            cases: row.cases,
            quantity: row.quantity,
            cost: row.cost
          });
        });
      }

      // Add Insulin Section
      if (topInsulinRows.length > 0) {
        combinedRows.push({ label: '', cases: '', quantity: '', cost: '' });
        combinedRows.push({ label: '═══ أنواع الإنسولين الأكثر استهلاكاً وكلفة (أهم 5 أصناف) ═══', cases: '', quantity: '', cost: '' });
        topInsulinRows.forEach(row => {
          combinedRows.push({
            label: row.name,
            cases: row.cases,
            quantity: row.quantity,
            cost: row.cost
          });
        });
      }

      const unifiedOptions = {
        ...exportOptions,
        title: 'التقرير التنفيذي الشامل والمفصل',
        subtitle: `نطاق التقرير: التقرير التنفيذي العام والتحليلي للأدوية والإنسولين`
      };

      if (type === 'word') {
        exportToWord(combinedRows, combinedColumns, unifiedOptions);
        return true;
      }
      if (type === 'pdf') {
        await exportToPDF(combinedRows, combinedColumns, unifiedOptions);
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
    <div className="space-y-6 animate-fadeIn pb-20 dir-rtl" dir="rtl">
      <Breadcrumb items={[{ label: 'التقارير' }, { label: 'التقرير التنفيذي الموحد' }]} />
      
      <PageHeader 
        title="التقرير التنفيذي الموحد" 
        icon={ClipboardList} 
        description="تقرير قيادي شامل يجمع كافة مؤشرات الأداء المالي والعددي والتذاكر الطبية في مستند موحد."
        actions={
          data && (
            <ExportMenu
              data={data}
              columns={[]}
              onCustomExport={handlePremiumExport}
              options={{
                title: 'التقرير التنفيذي الموحد',
                fileName: 'executive_summary_report'
              }}
            />
          )
        }
      />

      {/* Hierarchy Selector filter */}
      <Card className="p-6 no-print space-y-6">
        <div className="w-full">
          <HierarchySelector 
            onSelectionChange={(d) => setHierarchy({ ...hierarchy, ...d })}
            initialBranch={hierarchy.branchId}
            initialArea={hierarchy.areaId}
            initialClinic={hierarchy.clinicId}
            initialMonth={hierarchy.dispenseMonth}
          />
        </div>
        
        <div className="flex justify-end pt-4 border-t border-slate-100 dark:border-slate-800">
          <Button 
            variant="primary" 
            icon={Search} 
            onClick={handleGenerate} 
            loading={loading} 
            className="h-11 px-16 shadow-lg shadow-primary/10 rounded-xl"
          >
            توليد التقرير الموحد
          </Button>
        </div>
      </Card>

      {/* Main Report Content */}
      {data ? (
        <PrintableTable
          title="التقرير التنفيذي الموحد"
          subtitle={`شهر المنصرف: ${hierarchy.dispenseMonth}`}
        >
          <div ref={printAreaRef} className="space-y-6 print:p-8">
          
          {/* Executive Summary stats grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6 print-stats-grid">
            <Card className="p-6 bg-[var(--color-primary-dark)] text-white border-none shadow-2xl relative overflow-hidden group">
              <div className="absolute -right-4 -bottom-4 opacity-10 group-hover:scale-110 transition-transform duration-500 no-print">
                <DollarSign size={100} />
              </div>
              <span className="text-[10px] font-bold opacity-60">التكلفة الكلية للمنصرف</span>
              <h2 className="text-3xl font-black mt-2">{data.total_cost.toLocaleString()} <span className="text-xs font-normal opacity-70">ج.م</span></h2>
              <div className="mt-4 flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400"></div>
                <span className="text-[10px] opacity-75">أدوية + أنسولين + مستلزمات + أحكام</span>
              </div>
            </Card>

            <Card className="p-5 border border-[var(--color-border)] shadow-sm">
              <div className="flex justify-between items-start">
                <span className="text-[10px] font-bold text-[var(--color-text-muted)]">إجمالي الحالات والزيارات</span>
                <Users size={16} className="text-cyan-500" />
              </div>
              <h2 className="text-2xl font-black text-[var(--color-text)] mt-2">{data.total_cases.toLocaleString()} <span className="text-xs font-normal opacity-50">حالة</span></h2>
              <p className="text-[9px] text-[var(--color-text-muted)] mt-4">تشمل مرضى العيادات والأحكام والأنسولين</p>
            </Card>

            <Card className="p-5 border border-[var(--color-border)] shadow-sm">
              <div className="flex justify-between items-start">
                <span className="text-[10px] font-bold text-[var(--color-text-muted)]">متوسط تكلفة الحالة</span>
                <TrendingUp size={16} className="text-emerald-500" />
              </div>
              <h2 className="text-2xl font-black text-[var(--color-text)] mt-2">
                {(data.total_cases > 0 ? (data.total_cost / data.total_cases) : 0).toFixed(1)} <span className="text-xs font-normal opacity-50">ج.م/حالة</span>
              </h2>
              <p className="text-[9px] text-[var(--color-text-muted)] mt-4">إجمالي النفقات موزعة على إجمالي الحالات</p>
            </Card>

            <Card className="p-5 border border-[var(--color-border)] shadow-sm">
              <div className="flex justify-between items-start">
                <span className="text-[10px] font-bold text-[var(--color-text-muted)]">المبالغ المحصلة (المريض)</span>
                <DollarSign size={16} className="text-amber-500" />
              </div>
              <h2 className="text-2xl font-black text-[var(--color-text)] mt-2">{data.patient_share.toLocaleString()} <span className="text-xs font-normal opacity-50">ج.م</span></h2>
              <p className="text-[9px] text-[var(--color-text-muted)] mt-4">مساهمة المرضى في الأدوية المدعمة</p>
            </Card>

            <Card className="p-5 border border-[var(--color-border)] shadow-sm">
              <div className="flex justify-between items-start">
                <span className="text-[10px] font-bold text-[var(--color-text-muted)]">إجمالي التذاكر الطبية</span>
                <FileText size={16} className="text-purple-500" />
              </div>
              <h2 className="text-2xl font-black text-[var(--color-text)] mt-2">{(data.tickets_56b + data.tickets_56c).toLocaleString()} <span className="text-xs font-normal opacity-50">تذكرة</span></h2>
              <p className="text-[9px] text-[var(--color-text-muted)] mt-4">تذاكر 56ب: {data.tickets_56b} | 56ج: {data.tickets_56c}</p>
            </Card>
          </div>

          {/* Smart AI / Business Insights */}
          <div className="no-print space-y-3">
            <h3 className="text-sm font-bold flex items-center gap-2 text-[var(--color-text)]">
              <Sparkles size={16} className="text-yellow-500" />
              ركن التحليلات التلقائية والذكاء الإداري
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {insights.map((insight, idx) => (
                <div 
                  key={idx} 
                  className={`p-4 rounded-xl flex items-start gap-3 border transition-colors
                    ${insight.type === 'warning' ? 'bg-amber-50/20 border-amber-500/20 text-amber-600 dark:text-amber-400' : 
                      insight.type === 'success' ? 'bg-emerald-50/20 border-emerald-500/20 text-emerald-600 dark:text-emerald-400' : 
                      'bg-cyan-50/20 border-cyan-500/20 text-cyan-600 dark:text-cyan-400'}`}
                >
                  <div className="mt-0.5">
                    {insight.type === 'warning' ? <AlertTriangle size={16} /> : 
                     insight.type === 'success' ? <Info size={16} /> : <ArrowUpRight size={16} />}
                  </div>
                  <p className="text-xs font-bold leading-relaxed">{insight.text}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Charts section */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 print-stack-grids">
            {/* Pie Chart of cost breakdown */}
            <Card className="p-6">
              <h3 className="text-sm font-bold text-[var(--color-text)] mb-6">توزيع تكلفة المنصرف حسب البند الرئيسي</h3>
              <div ref={pieChartRef} className="h-[250px] flex items-center justify-center no-print-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={costPieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                      isAnimationActive={false}
                    >
                      {costPieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      formatter={(value) => `${parseFloat(value).toLocaleString()} ج.م`}
                      contentStyle={{ direction: 'rtl', textAlign: 'right' }}
                    />
                    <Legend verticalAlign="bottom" height={36} formatter={(value) => <span className="text-xs font-bold text-[var(--color-text-muted)]">{value}</span>} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              {costPieImage && (
                <div className="only-print w-full flex justify-center items-center">
                  <img src={costPieImage} alt="توزيع تكلفة المنصرف" className="max-h-[250px] object-contain mx-auto" />
                </div>
              )}
            </Card>

            {/* Bar Chart of unit comparisons */}
            <Card className="p-6">
              <h3 className="text-sm font-bold text-[var(--color-text)] mb-6">
                {hierarchy.clinicId ? 'المنحنى التاريخي لتكلفة العيادة المختارة (آخر 6 أشهر)' : 
                 hierarchy.areaId ? 'المقارنة الإحصائية لتكلفة عيادات المنطقة المختارة' : 
                 hierarchy.branchId ? 'المقارنة الإحصائية لتكلفة مناطق الفرع المختار' : 'مقارنة فروع التأمين الصحي'}
              </h3>
              <div ref={barChartRef} className="h-[250px] no-print-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.comparisons}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fontWeight: 'bold' }} stroke="var(--color-text-muted)" />
                    <YAxis tick={{ fontSize: 10 }} stroke="var(--color-text-muted)" />
                    <Tooltip 
                      formatter={(value) => `${parseFloat(value).toLocaleString()} ج.م`}
                      contentStyle={{ direction: 'rtl', textAlign: 'right' }}
                    />
                    <Bar dataKey="cost" name="التكلفة الإجمالية" radius={[6, 6, 0, 0]} isAnimationActive={false}>
                      {data.comparisons.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {comparisonBarImage && (
                <div className="only-print w-full flex justify-center items-center">
                  <img src={comparisonBarImage} alt="مقارنة التكلفة" className="max-h-[250px] object-contain mx-auto" />
                </div>
              )}
            </Card>
          </div>

          {/* Top Dispensed Items Lists */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 print-stack-grids">
            {/* Top 5 Drugs Card */}
            <Card className="p-6 overflow-hidden">
              <div className="flex items-center gap-2 mb-4 border-b pb-3 border-slate-100 dark:border-slate-800">
                <Pill size={18} className="text-cyan-500" />
                <h3 className="text-sm font-black text-[var(--color-text)]">الأدوية الـ 5 الأكثر استهلاكاً وكلفة</h3>
              </div>
              {data.top_drugs && data.top_drugs.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-right text-xs">
                    <thead>
                      <tr className="border-b border-slate-100 dark:border-slate-800 text-[var(--color-text-muted)] font-black">
                        <th className="py-2">اسم الصنف الدوائي</th>
                        <th className="py-2 text-center">الكمية</th>
                        <th className="py-2 text-center">الحالات</th>
                        <th className="py-2 text-left">التكلفة</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.top_drugs.map((drug, idx) => (
                        <tr key={idx} className="border-b border-slate-50 dark:border-slate-900/50 hover:bg-slate-50/50 dark:hover:bg-slate-900/20">
                          <td className="py-3 font-bold text-[var(--color-text)]">{drug.name}</td>
                          <td className="py-3 text-center font-mono font-bold text-[var(--color-text-muted)]">{drug.quantity.toLocaleString()}</td>
                          <td className="py-3 text-center font-mono font-bold text-[var(--color-text-muted)]">{drug.cases.toLocaleString()}</td>
                          <td className="py-3 text-left font-mono font-black text-red-500">{drug.cost.toLocaleString()} ج.م</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="py-8 text-center text-xs text-[var(--color-text-muted)]">لا توجد بيانات للأدوية في هذه الفترة</div>
              )}
            </Card>

            {/* Top 5 Insulin Card */}
            <Card className="p-6 overflow-hidden">
              <div className="flex items-center gap-2 mb-4 border-b pb-3 border-slate-100 dark:border-slate-800">
                <Syringe size={18} className="text-purple-500" />
                <h3 className="text-sm font-black text-[var(--color-text)]">أنواع الإنسولين الـ 5 الأكثر استهلاكاً وكلفة</h3>
              </div>
              {data.top_insulin && data.top_insulin.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-right text-xs">
                    <thead>
                      <tr className="border-b border-slate-100 dark:border-slate-800 text-[var(--color-text-muted)] font-black">
                        <th className="py-2">نوع الإنسولين</th>
                        <th className="py-2 text-center">الكمية</th>
                        <th className="py-2 text-center">الحالات</th>
                        <th className="py-2 text-left">التكلفة</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.top_insulin.map((ins, idx) => (
                        <tr key={idx} className="border-b border-slate-50 dark:border-slate-900/50 hover:bg-slate-50/50 dark:hover:bg-slate-900/20">
                          <td className="py-3 font-bold text-[var(--color-text)]">{ins.name}</td>
                          <td className="py-3 text-center font-mono font-bold text-[var(--color-text-muted)]">{ins.quantity.toLocaleString()}</td>
                          <td className="py-3 text-center font-mono font-bold text-[var(--color-text-muted)]">{ins.cases.toLocaleString()}</td>
                          <td className="py-3 text-left font-mono font-black text-red-500">{ins.cost.toLocaleString()} ج.م</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="py-8 text-center text-xs text-[var(--color-text-muted)]">لا توجد بيانات للإنسولين في هذه الفترة</div>
              )}
            </Card>
          </div>

          {/* Printable detailed cost breakdown table */}
          <Card className="p-0 overflow-hidden border border-[var(--color-border)] shadow-sm">
            <div className="bg-slate-50 dark:bg-slate-900/50 p-4 border-b border-[var(--color-border)] flex items-center justify-between">
              <h3 className="text-xs font-black text-[var(--color-text)]">جدول تفاصيل البنود المالية للتقرير التنفيذي</h3>
              
              <div className="flex items-center gap-4">
                <span className="text-[10px] text-[var(--color-text-muted)] no-print">شهر المنصرف: {hierarchy.dispenseMonth}</span>
                
                {/* Column Picker */}
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
                    <div className="absolute right-0 mt-2 w-48 bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-xl shadow-xl p-3 z-50 grid grid-cols-1 gap-2">
                      <div className="text-[9px] font-bold text-[var(--color-text-muted)] border-b pb-1.5 mb-1 flex justify-between items-center">
                        <span>أعمدة الجدول</span>
                      </div>
                      <label className="flex items-center gap-2 text-[10px] font-bold text-[var(--color-text)] cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 p-1 rounded-lg">
                        <input 
                          type="checkbox"
                          checked={visibleCols.item}
                          onChange={() => setVisibleCols({ ...visibleCols, item: !visibleCols.item })}
                          className="rounded text-primary focus:ring-primary h-3.5 w-3.5"
                        />
                        <span>البند المالي</span>
                      </label>
                      <label className="flex items-center gap-2 text-[10px] font-bold text-[var(--color-text)] cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 p-1 rounded-lg">
                        <input 
                          type="checkbox"
                          checked={visibleCols.cases}
                          onChange={() => setVisibleCols({ ...visibleCols, cases: !visibleCols.cases })}
                          className="rounded text-primary focus:ring-primary h-3.5 w-3.5"
                        />
                        <span>الحالات / العدد</span>
                      </label>
                      <label className="flex items-center gap-2 text-[10px] font-bold text-[var(--color-text)] cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 p-1 rounded-lg">
                        <input 
                          type="checkbox"
                          checked={visibleCols.cost}
                          onChange={() => setVisibleCols({ ...visibleCols, cost: !visibleCols.cost })}
                          className="rounded text-primary focus:ring-primary h-3.5 w-3.5"
                        />
                        <span>التكلفة</span>
                      </label>
                    </div>
                  )}
                </div>
              </div>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead>
                  <tr className="bg-slate-100/50 dark:bg-slate-900/20 text-[var(--color-text-muted)] font-black border-b border-[var(--color-border)]">
                    {visibleCols.item && <th className="p-3">البند المالي الإحصائي</th>}
                    {visibleCols.cases && <th className="p-3 text-center">الحالات / العدد</th>}
                    {visibleCols.cost && <th className="p-3 text-left">التكلفة والمنصرف المالي</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)] text-[var(--color-text)]">
                  <tr>
                    {visibleCols.item && <td className="p-3 font-bold">منصرف الأدوية التفصيلي</td>}
                    {visibleCols.cases && <td className="p-3 text-center font-mono font-bold">{data.drug_cases.toLocaleString()}</td>}
                    {visibleCols.cost && <td className="p-3 text-left font-mono font-bold text-emerald-600">{data.drug_cost.toLocaleString()} ج.م</td>}
                  </tr>
                  <tr>
                    {visibleCols.item && <td className="p-3 font-bold">منصرف الأنسولين</td>}
                    {visibleCols.cases && <td className="p-3 text-center font-mono font-bold">{data.insulin_cases.toLocaleString()}</td>}
                    {visibleCols.cost && <td className="p-3 text-left font-mono font-bold text-emerald-600">{data.insulin_cost.toLocaleString()} ج.م</td>}
                  </tr>
                  <tr>
                    {visibleCols.item && <td className="p-3 font-bold">المستلزمات الطبية</td>}
                    {visibleCols.cases && <td className="p-3 text-center font-mono">--</td>}
                    {visibleCols.cost && <td className="p-3 text-left font-mono font-bold text-emerald-600">{data.supply_cost.toLocaleString()} ج.م</td>}
                  </tr>
                  <tr>
                    {visibleCols.item && <td className="p-3 font-bold">صرف الأحكام القضائية</td>}
                    {visibleCols.cases && <td className="p-3 text-center font-mono font-bold">{data.judicial_cases.toLocaleString()}</td>}
                    {visibleCols.cost && <td className="p-3 text-left font-mono font-bold text-emerald-600">{data.judicial_cost.toLocaleString()} ج.م</td>}
                  </tr>
                  <tr className="bg-slate-50/50 dark:bg-slate-900/10">
                    {visibleCols.item && <td className="p-3 font-bold text-indigo-600 dark:text-indigo-400">إجمالي الأدوية المجانية (مساهمة الهيئة الكاملة)</td>}
                    {visibleCols.cases && <td className="p-3 text-center font-mono">--</td>}
                    {visibleCols.cost && <td className="p-3 text-left font-mono font-bold text-indigo-600 dark:text-indigo-400">{data.free_drugs_cost.toLocaleString()} ج.م</td>}
                  </tr>
                  <tr className="bg-slate-50/50 dark:bg-slate-900/10">
                    {visibleCols.item && <td className="p-3 font-bold text-indigo-600 dark:text-indigo-400">إجمالي الأدوية المدعمة (قيمة مشاركة الهيئة)</td>}
                    {visibleCols.cases && <td className="p-3 text-center font-mono">--</td>}
                    {visibleCols.cost && <td className="p-3 text-left font-mono font-bold text-indigo-600 dark:text-indigo-400">{data.supported_drugs_cost.toLocaleString()} ج.م</td>}
                  </tr>
                  <tr className="bg-slate-50/50 dark:bg-slate-900/10">
                    {visibleCols.item && <td className="p-3 font-bold text-amber-600 dark:text-amber-400">إجمالي المبالغ المحصلة (حصة المريض)</td>}
                    {visibleCols.cases && <td className="p-3 text-center font-mono">--</td>}
                    {visibleCols.cost && <td className="p-3 text-left font-mono font-bold text-amber-600 dark:text-amber-400">{data.patient_share.toLocaleString()} ج.م</td>}
                  </tr>
                  <tr className="bg-slate-100/50 dark:bg-slate-900/30 font-black text-sm border-t-2 border-slate-200 dark:border-slate-700">
                    {visibleCols.item && <td className="p-3 text-[var(--color-primary)]">المجموع الكلي للإنفاق</td>}
                    {visibleCols.cases && <td className="p-3 text-center font-mono text-[var(--color-primary)]">{data.total_cases.toLocaleString()}</td>}
                    {visibleCols.cost && <td className="p-3 text-left font-mono text-[var(--color-primary)]">{data.total_cost.toLocaleString()} ج.م</td>}
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>
        </div>
        </PrintableTable>
      ) : (
        <Card className="p-16 text-center text-slate-400 dark:text-slate-600 space-y-4">
          <ClipboardList size={48} className="mx-auto opacity-30 animate-pulse text-[var(--color-primary)]" />
          <div className="space-y-2">
            <h3 className="text-base font-bold text-[var(--color-text)]">لم يتم توليد التقرير بعد</h3>
            <p className="text-xs text-[var(--color-text-muted)] max-w-md mx-auto leading-relaxed">
              يرجى اختيار نطاق التصفية من لوحة التحكم أعلاه (الفرع على الأقل) وتحديد شهر الاستعلام، ثم اضغط على زر "توليد التقرير الموحد" لعرض النتائج.
            </p>
          </div>
        </Card>
      )}
    </div>
  );
};

export default ExecutiveReportPage;
