import React, { useState, useMemo, useEffect } from 'react';
import PageHeader from '../../../components/ui/PageHeader';
import Breadcrumb from '../../../components/ui/Breadcrumb';
import HierarchySelector from '../../../components/common/HierarchySelector';
import Card from '../../../components/ui/Card';
import Table from '../../../components/ui/Table';
import ExportMenu from '../../../components/ui/ExportMenu';
import useReportPrintShortcut from '../../../hooks/useReportPrintShortcut';
import { useToast } from '../../../components/ui/Toast';
import { useGlobalApp } from '../../../context/useGlobalApp';
import invoke from '../../../api/tauriApi';
import { 
  Heart, PieChart as PieChartIcon, BarChart3, TrendingUp, ShieldCheck,
  Building2, Users, Baby, Home, Layers, Info, Search
} from 'lucide-react';
import { 
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend,
  Cell, PieChart, Pie
} from 'recharts';
import { exportMultiSheetExcel, exportToWord, exportToPDF } from '../../../utils/exportUtils';
import PrintableTable from '../../../components/common/PrintableTable';
import { buildHierarchyLabel } from '../../../utils/reportUtils';
import { toPng } from 'html-to-image';

const FreeDrugsReportPage = () => {
  const toast = useToast();
  const { activeHierarchy, workspaceMode, hierarchyNames } = useGlobalApp();
  const [loading, setLoading] = useState(false);
  const [viewType, setViewType] = useState('analytical'); // 'analytical' or 'administrative'
  const [data, setData] = useState([]);
  const [hierarchy, setHierarchy] = useState({ 
    branchId: activeHierarchy.branchId || '', 
    areaId: activeHierarchy.areaId || '', 
    clinicId: activeHierarchy.clinicId || '', 
    dispenseMonth: activeHierarchy.dispenseMonth || new Date().toISOString().substring(0, 7) 
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [metaData, setMetaData] = useState({ branches: [], areas: [], clinics: [] });
  const [chartType, setChartType] = useState('pie');
  const chartRef = React.useRef(null);
  // Ref to the toolbar ExportMenu — Ctrl+P opens the EXACT same PrintPreviewModal
  // that ExportMenu → "طباعة التقرير" opens (shared imperative API, no native
  // WebView2 print dialog, no window.print() path).
  const exportMenuRef = React.useRef(null);
  useReportPrintShortcut(exportMenuRef);

  useEffect(() => {
    loadMeta();
  }, []);

  const loadMeta = async () => {
    try {
      const [branches, areas, clinics] = await Promise.all([
        invoke('get_branches'),
        invoke('get_areas_all'),
        invoke('get_clinics_all')
      ]);
      setMetaData({ branches, areas, clinics });
    } catch (err) {
      console.error(err);
    }
  };

  const handleFetch = async () => {
    if (!hierarchy.branchId) {
      setData([]);
      return;
    }
    setLoading(true);
    try {
      const result = await invoke('get_report_free_monthly_drugs_dispensed', {
        branchId: parseInt(hierarchy.branchId),
        areaId: hierarchy.areaId ? parseInt(hierarchy.areaId) : null,
        clinicId: hierarchy.clinicId ? parseInt(hierarchy.clinicId) : null,
        dispenseMonth: hierarchy.dispenseMonth
      });
      
      const mapped = (result || []).map(r => {
        const branch = metaData.branches?.find(b => b.id === r.branch_id);
        const area = metaData.areas?.find(a => a.id === r.area_id);
        const clinic = metaData.clinics?.find(c => c.id === r.clinic_id);
        const total = (r.drugs_free_authority || 0) + (r.drugs_free_students || 0) + (r.drugs_free_infants || 0) + (r.drugs_free_breadwinner_women || 0);
        
        return {
          ...r,
          total_free_value: total,
          branchName: branch?.name || 'فرع مجمع',
          areaName: area?.name || 'منطقة مجمعة',
          clinicName: clinic?.name || 'عيادة مجمعة'
        };
      });

      setData(mapped);
    } catch (err) { 
      toast.error(`خطأ: ${err}`); 
    } finally { 
      setLoading(false); 
    }
  };

   
  useEffect(() => {
    if (metaData.branches.length > 0) {
      handleFetch();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hierarchy.branchId, hierarchy.areaId, hierarchy.clinicId, hierarchy.dispenseMonth, metaData.branches]);

  const { stats, tableData, chartData, topLocations } = useMemo(() => {
    const s = {
      authority: 0,
      students: 0,
      infants: 0,
      women: 0,
      total: 0,
      entitiesCount: data.length
    };
    
    data.forEach(row => {
      s.authority += (row.drugs_free_authority || 0);
      s.students += (row.drugs_free_students || 0);
      s.infants += (row.drugs_free_infants || 0);
      s.women += (row.drugs_free_breadwinner_women || 0);
      s.total += (row.total_free_value || 0);
    });

    // 1. Analytical Table (Categories)
    const analyticalRows = [
      { category: 'فئة الهيئة', icon: ShieldCheck, value: s.authority, color: '#10b981', bg: 'bg-emerald-50' },
      { category: 'فئة الطلاب', icon: Users, value: s.students, color: '#3b82f6', bg: 'bg-blue-50' },
      { category: 'فئة الأطفال (الرضع)', icon: Baby, value: s.infants, color: '#f59e0b', bg: 'bg-amber-50' },
      { category: 'فئة المرأة المعيلة', icon: Home, value: s.women, color: '#ec4899', bg: 'bg-pink-50' },
    ].map(it => ({
        ...it,
        contribution: (it.value / (s.total || 1)) * 100
    }));

    // 2. Administrative Table (Locations)
    const administrativeRows = data.map((r, idx) => ({
      idx: idx + 1,
      location: r.clinicName,
      subLocation: `${r.branchName} / ${r.areaName}`,
      authority: r.drugs_free_authority,
      students: r.drugs_free_students,
      infants: r.drugs_free_infants,
      women: r.drugs_free_breadwinner_women,
      total: r.total_free_value,
      contribution: (r.total_free_value / (s.total || 1)) * 100
    }));

    const cData = [
      { name: 'الهيئة', value: s.authority, fill: '#10b981' },
      { name: 'الطلاب', value: s.students, fill: '#3b82f6' },
      { name: 'الأطفال', value: s.infants, fill: '#f59e0b' },
      { name: 'المرأة المعيلة', value: s.women, fill: '#ec4899' }
    ].filter(d => d.value > 0);

    const locMap = new Map();
    data.forEach(r => {
      const key = r.clinicName;
      locMap.set(key, (locMap.get(key) || 0) + r.total_free_value);
    });
    const topLocations = Array.from(locMap.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

    return { 
      stats: s, 
      tableData: viewType === 'analytical' ? analyticalRows : administrativeRows.filter(r => r.location.toLowerCase().includes(searchTerm.toLowerCase())),
      chartData: cData,
      topLocations
    };
  }, [data, viewType, searchTerm]);

  const analyticalColumns = [
    { 
      header: 'الفئة المستفيدة', 
      render: (row) => (
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${row.bg}`}>
            <row.icon size={18} style={{ color: row.color }} />
          </div>
          <span className="font-bold">{row.category}</span>
        </div>
      )
    },
    { header: 'قيمة المنصرف', render: (row) => <span className="font-mono text-lg font-bold">{row.value.toLocaleString()} ج.م</span> },
    { 
      header: 'المساهمة من الإجمالي', 
      render: (row) => (
        <div className="flex items-center gap-3 min-w-[150px]">
          <div className="flex-1 bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
            <div 
              className="h-full rounded-full transition-all duration-500" 
              style={{ width: `${row.contribution}%`, backgroundColor: row.color }}
            />
          </div>
          <span className="text-xs font-black" style={{ color: row.color }}>{row.contribution.toFixed(1)}%</span>
        </div>
      ) 
    }
  ];

  const administrativeColumns = [
    { header: '#', render: (r) => <span className="text-xs text-slate-400 font-bold">{r.idx}</span> },
    { 
      header: 'جهة الصرف', 
      render: (r) => (
        <div className="flex flex-col">
          <span className="font-bold text-slate-700 dark:text-slate-200">{r.location}</span>
          <span className="text-[10px] text-slate-400">{r.subLocation}</span>
        </div>
      ) 
    },
    { header: 'الهيئة', render: (r) => <span className="font-mono text-xs">{r.authority.toLocaleString()}</span> },
    { header: 'الطلاب', render: (r) => <span className="font-mono text-xs">{r.students.toLocaleString()}</span> },
    { header: 'الأطفال', render: (r) => <span className="font-mono text-xs">{r.infants.toLocaleString()}</span> },
    { header: 'المرأة المعيلة', render: (r) => <span className="font-mono text-xs">{r.women.toLocaleString()}</span> },
    { header: 'الإجمالي', render: (r) => <span className="font-black text-emerald-600">{r.total.toLocaleString()} ج.م</span> },
  ];

  const handlePremiumExport = async (type, { options }) => {
    try {
      let chartImage = null;
      if (chartRef.current) chartImage = await toPng(chartRef.current, { quality: 0.85, pixelRatio: 1, backgroundColor: '#ffffff' });
      const enrichedOptions = { ...options, chartImage };
      
      const cols = viewType === 'analytical' 
        ? [
            { header: 'الفئة', exportAccessor: (r) => r.category },
            { header: 'القيمة', exportAccessor: (r) => r.value }
          ]
        : [
            { header: 'الجهة', exportAccessor: (r) => r.location },
            { header: 'الهيئة', exportAccessor: (r) => r.authority },
            { header: 'الطلاب', exportAccessor: (r) => r.students },
            { header: 'الأطفال', exportAccessor: (r) => r.infants },
            { header: 'المرأة المعيلة', exportAccessor: (r) => r.women },
            { header: 'الإجمالي', exportAccessor: (r) => r.total }
          ];

      if (type === 'excel') {
        const sheetsData = { 'تحليل المجاني': { data: tableData, columns: cols, options: enrichedOptions } };
        const globalOptions = {
          fileName: 'free_drugs_premium_report',
          title: 'تقرير الأدوية المجانية',
          summaryData: {
            headers: ['البند', 'القيمة'],
            rows: [['إجمالي المجاني', `${stats.total.toLocaleString()} ج.م`], ['عدد الجهات', stats.entitiesCount]]
          },
          chartImage
        };
        const excelSaved = await exportMultiSheetExcel(sheetsData, globalOptions);
        if (excelSaved === true) return true;
        return 'cancelled';
      }
      // Word/PDF: summary table + detail table (like the premium Excel export)
      const summaryTable = {
        data: [
          { indicator: 'إجمالي المجاني', val: `${stats.total.toLocaleString()} ج.م` },
          { indicator: 'عدد الجهات', val: stats.entitiesCount },
        ],
        columns: [
          { header: 'المؤشر', accessor: 'indicator' },
          { header: 'القيمة', accessor: 'val' },
        ],
        title: 'ملخص التقرير',
      };
      const multiTables = [summaryTable, { data: tableData, columns: cols, title: 'تفاصيل الأدوية المجانية' }];
      const wordPdfOptions = { ...enrichedOptions, tables: multiTables };
      if (type === 'word') { const wordSaved = await exportToWord(tableData, cols, wordPdfOptions); if (wordSaved === true) return true; return 'cancelled'; }
      if (type === 'pdf') { const pdfSaved = await exportToPDF(tableData, cols, wordPdfOptions); if (pdfSaved === true) return true; return 'cancelled'; }
      return false;
    } catch (err) { console.error(err); return false; }
  };

  return (
    <PrintableTable title="تقرير الأدوية المجانية" subtitle={hierarchy.dispenseMonth ? `شهر ${hierarchy.dispenseMonth}` : ''} hierarchyLabel={buildHierarchyLabel(workspaceMode, hierarchyNames)}>
      <div className="space-y-6 animate-fadeIn pb-20">
      <Breadcrumb items={[{ label: 'التقارير' }, { label: 'تقرير الأدوية المجانية' }]} />
      
      <PageHeader 
        title="تقرير الأدوية المجانية" 
        icon={Heart} 
        description="تحليل مالي مفصل لمنصرف الأدوية المجاني (هيئة، طلاب، أطفال، امرأة معيلة)."
        actions={
          <div className="flex items-center gap-3">
             <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl no-print">
               <button onClick={() => setViewType('analytical')} className={`px-4 py-2 rounded-lg text-xs font-black transition-all ${viewType === 'analytical' ? 'bg-white dark:bg-slate-700 shadow-sm text-emerald-600' : 'text-slate-400'}`}>تحليلي (بالفئات)</button>
               <button onClick={() => setViewType('administrative')} className={`px-4 py-2 rounded-lg text-xs font-black transition-all ${viewType === 'administrative' ? 'bg-white dark:bg-slate-700 shadow-sm text-emerald-600' : 'text-slate-400'}`}>إداري (بالجهات)</button>
            </div>
            <ExportMenu ref={exportMenuRef} data={tableData} columns={viewType === 'analytical' ? analyticalColumns : administrativeColumns} onCustomExport={handlePremiumExport} options={{ title: 'تقرير الأدوية المجانية', fileName: 'free_drugs_report' }} />
          </div>
        }
      />

      {/* Filter Card */}
      <Card className="p-6 no-print space-y-4">
        <div className="w-full">
          <HierarchySelector 
            onSelectionChange={(d) => setHierarchy(prev => ({ ...prev, ...d }))}
            initialBranch={hierarchy.branchId}
            initialArea={hierarchy.areaId}
            initialClinic={hierarchy.clinicId}
            initialMonth={hierarchy.dispenseMonth}
          />
        </div>
        
        {viewType === 'administrative' && (
          <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
             <div className="relative max-w-md">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input 
                  type="text" 
                  placeholder="بحث عن اسم العيادة..."
                  className="w-full pr-10 pl-4 h-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-[var(--color-bg)] text-[var(--color-text)] focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all font-bold"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
             </div>
          </div>
        )}
      </Card>

      {/* Stats Dashboard */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="p-6 bg-emerald-600 text-white border-none shadow-xl flex items-center justify-between relative overflow-hidden md:col-span-2">
            <Heart className="absolute -right-6 -bottom-6 opacity-10" size={160} />
            <div>
                <p className="text-[12px] opacity-80 mb-1 uppercase tracking-wider font-bold">إجمالي المنصرف المجاني</p>
                <h2 className="text-5xl font-black">{stats.total.toLocaleString()} <span className="text-lg">ج.م</span></h2>
            </div>
            <div className="text-right">
                <TrendingUp size={48} className="opacity-20" />
            </div>
        </Card>
        <Card className="p-6 bg-white dark:bg-slate-900 border-none shadow-lg flex flex-col justify-center">
            <p className="text-[10px] text-slate-400 mb-1 uppercase tracking-wider font-bold">عدد الجهات المشمولة</p>
            <h2 className="text-4xl font-black text-slate-800 dark:text-white">{stats.entitiesCount}</h2>
            <div className="mt-2 text-xs text-emerald-500 font-bold flex items-center gap-1">
                <Building2 size={14} /> جهة صرف مسجلة
            </div>
        </Card>
      </div>

      {topLocations.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 no-print">
           <div className="md:col-span-1 bg-gradient-to-br from-slate-800 to-slate-900 p-4 rounded-2xl text-white flex flex-col justify-center">
              <TrendingUp size={24} className="text-emerald-400 mb-2" />
              <span className="text-[10px] font-bold opacity-60">الأعلى استهلاكاً</span>
              <span className="text-lg font-black mt-1">أعلى 5 عيادات</span>
           </div>
           {topLocations.map((loc, i) => (
             <Card key={i} className="p-4 border-none shadow-sm flex flex-col justify-between hover:scale-105 transition-transform cursor-default">
                <span className="text-[10px] font-bold text-slate-400 truncate">{loc.name}</span>
                <div className="flex items-end justify-between mt-1">
                   <span className="text-sm font-black text-emerald-600">{loc.value.toLocaleString()}</span>
                   <span className="text-[9px] font-bold text-slate-300">ج.م</span>
                </div>
             </Card>
           ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
         {/* Main Table Content */}
         <div className="lg:col-span-8">
            <Card className="p-0 overflow-hidden shadow-2xl border-none h-full">
               <Table 
                 columns={viewType === 'analytical' ? analyticalColumns : administrativeColumns} 
                 data={tableData} 
                 loading={loading} 
               />
               {data.length === 0 && !loading && (
                 <div className="p-32 text-center text-slate-300 italic font-medium">بانتظار اختيار المعايير وتوليد البيانات...</div>
               )}
            </Card>
         </div>

         {/* Charts & Insights */}
         <div className="lg:col-span-4 space-y-6">
            <Card className="p-6 shadow-xl border-none no-print">
              <h3 className="font-bold flex items-center gap-2 mb-6"><PieChartIcon className="text-emerald-600" size={20} /> توزيع الفئات</h3>
              <div className="h-[300px] w-full" dir="ltr" ref={chartRef}>
                <ResponsiveContainer width="100%" height="100%">
                  {chartType === 'bar' ? (
                    <BarChart data={chartData} layout="vertical" margin={{ left: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} opacity={0.1} />
                        <XAxis type="number" hide />
                        <YAxis dataKey="name" type="category" width={80} tick={{ fontSize: 10, fontWeight: 'bold' }} />
                        <RechartsTooltip />
                        <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                            {chartData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.fill} />)}
                        </Bar>
                    </BarChart>
                  ) : (
                    <PieChart>
                        <Pie data={chartData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} dataKey="value" nameKey="name" paddingAngle={5}>
                            {chartData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.fill} />)}
                        </Pie>
                        <RechartsTooltip />
                        <Legend iconType="circle" />
                    </PieChart>
                  )}
                </ResponsiveContainer>
              </div>
              <div className="mt-4 flex justify-center gap-4">
                 <button onClick={() => setChartType('pie')} className={`p-2 rounded-lg ${chartType === 'pie' ? 'bg-emerald-50 text-emerald-600' : 'text-slate-400'}`}><PieChartIcon size={18} /></button>
                 <button onClick={() => setChartType('bar')} className={`p-2 rounded-lg ${chartType === 'bar' ? 'bg-emerald-50 text-emerald-600' : 'text-slate-400'}`}><BarChart3 size={18} /></button>
              </div>
            </Card>

            <Card className="p-6 bg-slate-50 dark:bg-slate-800/50 border-none">
               <h4 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-4 flex items-center gap-2">
                 <Info size={14} /> ملاحظات ذكية
               </h4>
               <ul className="space-y-3">
                 <li className="text-xs font-bold text-slate-600 dark:text-slate-300 flex items-start gap-2">
                   <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1 shrink-0" />
                   فئة الهيئة تمثل الحصة الأكبر من المنصرف المجاني بنسبة {((stats.authority / (stats.total || 1)) * 100).toFixed(1)}%.
                 </li>
                 {stats.entitiesCount > 10 && (
                   <li className="text-xs font-bold text-slate-600 dark:text-slate-300 flex items-start gap-2">
                     <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1 shrink-0" />
                     يتم توزيع المنصرف على {stats.entitiesCount} جهة صرف مختلفة مما يعكس شمولية الخدمة.
                   </li>
                 )}
               </ul>
            </Card>
         </div>
      </div>

    </div>
    </PrintableTable>
  );
};

export default FreeDrugsReportPage;
