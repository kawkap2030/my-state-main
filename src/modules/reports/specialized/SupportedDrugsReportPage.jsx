import React, { useState, useMemo, useEffect } from 'react';
import PageHeader from '../../../components/ui/PageHeader';
import Breadcrumb from '../../../components/ui/Breadcrumb';
import HierarchySelector from '../../../components/common/HierarchySelector';
import Card from '../../../components/ui/Card';
import Table from '../../../components/ui/Table';
import ExportMenu from '../../../components/ui/ExportMenu';
import { useToast } from '../../../components/ui/Toast';
import { useGlobalApp } from '../../../context/useGlobalApp';
import invoke from '../../../api/tauriApi';
import { 
  DollarSign, PieChart as PieChartIcon, BarChart3, TrendingUp, ShieldCheck,
  Building2, Users, Baby, Layers, Info, Percent, Search
} from 'lucide-react';
import { 
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend,
  Cell, PieChart, Pie
} from 'recharts';
import { exportMultiSheetExcel, exportToWord, exportToPDF } from '../../../utils/exportUtils';
import PrintableTable from '../../../components/common/PrintableTable';
import { buildHierarchyLabel } from '../../../utils/reportUtils';
import { toPng } from 'html-to-image';

const SupportedDrugsReportPage = () => {
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
  const chartRef = React.useRef(null);

   
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
      const result = await invoke('get_report_monthly_drugs_dispensed', {
        branchId: parseInt(hierarchy.branchId),
        areaId: hierarchy.areaId ? parseInt(hierarchy.areaId) : null,
        clinicId: hierarchy.clinicId ? parseInt(hierarchy.clinicId) : null,
        dispenseMonth: hierarchy.dispenseMonth
      });
      
      const mapped = (result || []).map(r => {
        const branch = metaData.branches?.find(b => b.id === r.branch_id);
        const area = metaData.areas?.find(a => a.id === r.area_id);
        const clinic = metaData.clinics?.find(c => c.id === r.clinic_id);
        
        // Org Share calculations
        const authOrg = (r.drugs_supported_authority_value || 0) - (r.drugs_supported_authority_patient_share || 0);
        const studOrg = (r.drugs_supported_students_value || 0) - (r.drugs_supported_students_patient_share || 0);
        const infOrg = (r.drugs_supported_infants_value || 0) - (r.drugs_supported_infants_patient_share || 0);
        const totalValue = (r.drugs_supported_authority_value || 0) + (r.drugs_supported_students_value || 0) + (r.drugs_supported_infants_value || 0);
        const totalPatient = (r.drugs_supported_authority_patient_share || 0) + (r.drugs_supported_students_patient_share || 0) + (r.drugs_supported_infants_patient_share || 0);
        const totalOrg = authOrg + studOrg + infOrg;

        return {
          ...r,
          authOrg, studOrg, infOrg,
          totalValue, totalPatient, totalOrg,
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
      authValue: 0, authPatient: 0, authOrg: 0,
      studValue: 0, studPatient: 0, studOrg: 0,
      infValue: 0, infPatient: 0, infOrg: 0,
      totalValue: 0, totalPatient: 0, totalOrg: 0,
      entitiesCount: data.length
    };
    
    data.forEach(row => {
      s.authValue += (row.drugs_supported_authority_value || 0);
      s.authPatient += (row.drugs_supported_authority_patient_share || 0);
      s.authOrg += row.authOrg;

      s.studValue += (row.drugs_supported_students_value || 0);
      s.studPatient += (row.drugs_supported_students_patient_share || 0);
      s.studOrg += row.studOrg;

      s.infValue += (row.drugs_supported_infants_value || 0);
      s.infPatient += (row.drugs_supported_infants_patient_share || 0);
      s.infOrg += row.infOrg;

      s.totalValue += row.totalValue;
      s.totalPatient += row.totalPatient;
      s.totalOrg += row.totalOrg;
    });

    // 1. Analytical Table
    const analyticalRows = [
      { category: 'فئة الهيئة', total: s.authValue, patient: s.authPatient, org: s.authOrg, color: '#0ea5e9' },
      { category: 'فئة الطلاب', total: s.studValue, patient: s.studPatient, org: s.studOrg, color: '#6366f1' },
      { category: 'فئة الأطفال', total: s.infValue, patient: s.infPatient, org: s.infOrg, color: '#f59e0b' },
    ].map(it => ({
        ...it,
        orgContribution: (it.org / (s.totalOrg || 1)) * 100,
        patientSharePct: (it.patient / (it.total || 1)) * 100
    }));

    // 2. Administrative Table
    const administrativeRows = data.map((r, idx) => ({
      idx: idx + 1,
      location: r.clinicName,
      subLocation: `${r.branchName} / ${r.areaName}`,
      authOrg: r.authOrg,
      studOrg: r.studOrg,
      infOrg: r.infOrg,
      totalOrg: r.totalOrg,
      totalValue: r.totalValue,
      totalPatient: r.totalPatient,
      orgContribution: (r.totalOrg / (s.totalOrg || 1)) * 100
    }));

    const cData = [
      { name: 'تكلفة الهيئة (موظفين)', value: s.authOrg, fill: '#0ea5e9' },
      { name: 'تكلفة الهيئة (طلاب)', value: s.studOrg, fill: '#6366f1' },
      { name: 'تكلفة الهيئة (أطفال)', value: s.infOrg, fill: '#f59e0b' }
    ].filter(d => d.value > 0);

    const locMap = new Map();
    data.forEach(r => {
      const key = r.clinicName;
      locMap.set(key, (locMap.get(key) || 0) + r.totalOrg);
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
      header: 'الفئة', 
      render: (row) => <span className="font-bold text-slate-700 dark:text-slate-200">{row.category}</span>
    },
    { header: 'إجمالي القيمة', render: (row) => <span className="font-mono">{row.total.toLocaleString()}</span> },
    { header: 'حصة المريض', render: (row) => <span className="font-mono text-rose-500">{row.patient.toLocaleString()} ({row.patientSharePct.toFixed(0)}%)</span> },
    { header: 'حصة الهيئة', render: (row) => <span className="font-black text-sky-600">{row.org.toLocaleString()} ج.م</span> },
    { 
      header: 'المساهمة في عبء الهيئة', 
      render: (row) => (
        <div className="flex items-center gap-3 min-w-[120px]">
          <div className="flex-1 bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
            <div className="h-full bg-sky-500" style={{ width: `${row.orgContribution}%` }} />
          </div>
          <span className="text-[10px] font-black text-sky-600">{row.orgContribution.toFixed(1)}%</span>
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
    { 
      header: 'إجمالي القيمة', 
      render: (r) => (
        <div className="flex flex-col">
          <span className="font-bold text-slate-600 dark:text-slate-300">{r.totalValue.toLocaleString()}</span>
          <span className="text-[9px] text-slate-400 font-bold uppercase tracking-tighter">Total Dispensed</span>
        </div>
      ) 
    },
    { 
      header: 'حصة المريض', 
      render: (r) => (
        <div className="flex flex-col">
          <span className="font-bold text-rose-500">{(r.totalPatient || 0).toLocaleString()}</span>
          <span className="text-[9px] text-rose-300 font-bold uppercase tracking-tighter">Patient Share</span>
        </div>
      ) 
    },
    { 
      header: 'حصة الهيئة', 
      render: (r) => (
        <div className="flex flex-col">
          <span className="font-black text-sky-600">{(r.totalOrg || 0).toLocaleString()}</span>
          <span className="text-[9px] text-sky-300 font-bold uppercase tracking-tighter">Org Share</span>
        </div>
      ) 
    },
    { 
      header: 'تفاصيل حصة الهيئة', 
      render: (r) => (
        <div className="flex gap-3">
           <div className="flex flex-col items-center">
              <span className="text-[8px] text-slate-400 font-black mb-0.5">موظفين</span>
              <span className="px-1.5 py-0.5 rounded bg-sky-50 text-sky-700 font-bold text-[10px]">{r.authOrg.toLocaleString()}</span>
           </div>
           <div className="flex flex-col items-center">
              <span className="text-[8px] text-slate-400 font-black mb-0.5">طلاب</span>
              <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 font-bold text-[10px]">{r.studOrg.toLocaleString()}</span>
           </div>
           <div className="flex flex-col items-center">
              <span className="text-[8px] text-slate-400 font-black mb-0.5">أطفال</span>
              <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 font-bold text-[10px]">{r.infOrg.toLocaleString()}</span>
           </div>
        </div>
      ) 
    },
  ];

  const handlePremiumExport = async (type, { options }) => {
    try {
      let chartImage = null;
      if (chartRef.current) chartImage = await toPng(chartRef.current, { quality: 0.85, pixelRatio: 1, backgroundColor: '#ffffff' });
      const enrichedOptions = { ...options, chartImage };
      
      const cols = viewType === 'analytical' 
        ? [
            { header: 'الفئة', exportAccessor: (r) => r.category },
            { header: 'الإجمالي', exportAccessor: (r) => r.total },
            { header: 'حصة المريض', exportAccessor: (r) => r.patient },
            { header: 'حصة الهيئة', exportAccessor: (r) => r.org }
          ]
        : [
            { header: 'الجهة', exportAccessor: (r) => r.location },
            { header: 'إجمالي القيمة', exportAccessor: (r) => r.totalValue },
            { header: 'حصة المريض', exportAccessor: (r) => r.totalPatient },
            { header: 'تكلفة الهيئة (إجمالي)', exportAccessor: (r) => r.totalOrg },
            { header: 'حصة الهيئة (موظفين)', exportAccessor: (r) => r.authOrg },
            { header: 'حصة الهيئة (طلاب)', exportAccessor: (r) => r.studOrg },
            { header: 'حصة الهيئة (أطفال)', exportAccessor: (r) => r.infOrg }
          ];

      if (type === 'excel') {
        const sheetsData = { 'تحليل المدعم': { data: tableData, columns: cols, options: enrichedOptions } };
        const globalOptions = {
          fileName: 'supported_drugs_premium_report',
          title: 'تقرير الأدوية المدعمة',
          summaryData: {
            headers: ['البند', 'القيمة'],
            rows: [
              ['إجمالي قيمة المنصرف', `${stats.totalValue.toLocaleString()} ج.م`], 
              ['إجمالي حصة الهيئة', `${stats.totalOrg.toLocaleString()} ج.م`],
              ['إجمالي حصة المرضى', `${stats.totalPatient.toLocaleString()} ج.م`]
            ]
          },
          chartImage
        };
        await exportMultiSheetExcel(sheetsData, globalOptions);
        toast.success('تم تصدير Excel بنجاح');
        return true;
      }
      // Word/PDF: summary table + detail table (like the premium Excel export)
      const summaryTable = {
        data: [
          { indicator: 'إجمالي قيمة المنصرف', val: `${stats.totalValue.toLocaleString()} ج.م` },
          { indicator: 'إجمالي حصة الهيئة', val: `${stats.totalOrg.toLocaleString()} ج.م` },
          { indicator: 'إجمالي حصة المرضى', val: `${stats.totalPatient.toLocaleString()} ج.م` },
        ],
        columns: [
          { header: 'المؤشر', accessor: 'indicator' },
          { header: 'القيمة', accessor: 'val' },
        ],
        title: 'ملخص التقرير',
      };
      const multiTables = [summaryTable, { data: tableData, columns: cols, title: 'تفاصيل الأدوية المدعمة' }];
      const wordPdfOptions = { ...enrichedOptions, tables: multiTables };
      if (type === 'word') { await exportToWord(tableData, cols, wordPdfOptions); toast.success('تم تصدير Word بنجاح'); return true; }
      if (type === 'pdf') { await exportToPDF(tableData, cols, wordPdfOptions); toast.success('تم تصدير PDF بنجاح'); return true; }
      return false;
    } catch (err) { console.error(err); return false; }
  };

  return (
    <PrintableTable title="تقرير الأدوية المدعمة" subtitle={hierarchy.dispenseMonth ? `شهر ${hierarchy.dispenseMonth}` : ''} hierarchyLabel={buildHierarchyLabel(workspaceMode, hierarchyNames)}>
    <div className="space-y-6 animate-fadeIn pb-20">
      <Breadcrumb items={[{ label: 'التقارير' }, { label: 'تقرير الأدوية المدعمة' }]} />
      
      <PageHeader 
        title="تقرير الأدوية المدعمة" 
        icon={DollarSign} 
        description="تحليل مالي مفصل لمنصرف الأدوية المدعمة/التجارية وحصص المساهمة."
        actions={
          <div className="flex items-center gap-3">
             <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl no-print">
               <button onClick={() => setViewType('analytical')} className={`px-4 py-2 rounded-lg text-xs font-black transition-all ${viewType === 'analytical' ? 'bg-white dark:bg-slate-700 shadow-sm text-sky-600' : 'text-slate-400'}`}>تحليلي</button>
               <button onClick={() => setViewType('administrative')} className={`px-4 py-2 rounded-lg text-xs font-black transition-all ${viewType === 'administrative' ? 'bg-white dark:bg-slate-700 shadow-sm text-sky-600' : 'text-slate-400'}`}>إداري</button>
            </div>
            <ExportMenu data={tableData} columns={viewType === 'analytical' ? analyticalColumns : administrativeColumns} onCustomExport={handlePremiumExport} options={{ title: 'تقرير الأدوية المدعمة', fileName: 'supported_drugs_report' }} />
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
                  className="w-full pr-10 pl-4 h-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-[var(--color-bg)] text-[var(--color-text)] focus:ring-2 focus:ring-sky-500/20 outline-none transition-all font-bold"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
             </div>
          </div>
        )}
      </Card>

      {/* Stats Dashboard */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="p-6 bg-sky-700 text-white border-none shadow-xl flex items-center justify-between relative overflow-hidden md:col-span-2">
            <DollarSign className="absolute -right-6 -bottom-6 opacity-10" size={160} />
            <div>
                <p className="text-[12px] opacity-80 mb-1 uppercase tracking-wider font-bold">إجمالي تكلفة الهيئة (المدعم)</p>
                <h2 className="text-5xl font-black">{stats.totalOrg.toLocaleString()} <span className="text-lg">ج.م</span></h2>
                <p className="text-xs mt-2 opacity-60">من إجمالي منصرف بقيمة {stats.totalValue.toLocaleString()} ج.م</p>
            </div>
            <div className="text-right flex flex-col items-end">
                <Percent size={40} className="opacity-20 mb-2" />
                <span className="text-2xl font-black">{((stats.totalOrg / (stats.totalValue || 1)) * 100).toFixed(1)}%</span>
                <span className="text-[10px] opacity-60 uppercase">نسبة تحمل الهيئة</span>
            </div>
        </Card>
        <Card className="p-6 bg-white dark:bg-slate-900 border-none shadow-lg flex flex-col justify-center">
            <div className="space-y-4">
               <div>
                  <p className="text-[10px] text-slate-400 mb-1 uppercase font-bold">إجمالي حصة المرضى</p>
                  <h2 className="text-2xl font-black text-rose-500">{stats.totalPatient.toLocaleString()} ج.م</h2>
               </div>
               <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
                  <p className="text-[10px] text-slate-400 mb-1 uppercase font-bold">عدد جهات الصرف</p>
                  <h2 className="text-2xl font-black text-slate-800 dark:text-white">{stats.entitiesCount}</h2>
               </div>
            </div>
        </Card>
      </div>

      {topLocations.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 no-print">
           <div className="md:col-span-1 bg-gradient-to-br from-slate-800 to-slate-900 p-4 rounded-2xl text-white flex flex-col justify-center">
              <TrendingUp size={24} className="text-sky-400 mb-2" />
              <span className="text-[10px] font-bold opacity-60">الأعلى استهلاكاً</span>
              <span className="text-lg font-black mt-1">أعلى 5 عيادات</span>
           </div>
           {topLocations.map((loc, i) => (
             <Card key={i} className="p-4 border-none shadow-sm flex flex-col justify-between hover:scale-105 transition-transform cursor-default">
                <span className="text-[10px] font-bold text-slate-400 truncate">{loc.name}</span>
                <div className="flex items-end justify-between mt-1">
                   <span className="text-sm font-black text-sky-600">{loc.value.toLocaleString()}</span>
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
              <h3 className="font-bold flex items-center gap-2 mb-6"><PieChartIcon className="text-sky-600" size={20} /> توزيع عبء الهيئة</h3>
              <div className="h-[300px] w-full" dir="ltr" ref={chartRef}>
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ bottom: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} opacity={0.1} />
                        <XAxis dataKey="name" tick={{ fontSize: 10, fontWeight: 'bold' }} />
                        <YAxis hide />
                        <RechartsTooltip />
                        <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                            {chartData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.fill} />)}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-4 flex flex-col gap-2">
                 {chartData.map((item, i) => (
                   <div key={i} className="flex justify-between items-center text-xs">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.fill }} />
                        <span className="font-bold text-slate-500">{item.name}</span>
                      </div>
                      <span className="font-black">{(item.value / (stats.totalOrg || 1) * 100).toFixed(1)}%</span>
                   </div>
                 ))}
              </div>
            </Card>

            <Card className="p-6 bg-slate-50 dark:bg-slate-800/50 border-none">
               <h4 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-4 flex items-center gap-2">
                 <Info size={14} /> ملاحظات التكلفة
               </h4>
               <ul className="space-y-3 text-xs font-bold text-slate-600 dark:text-slate-300">
                 <li className="flex items-start gap-2">
                   <div className="w-1.5 h-1.5 rounded-full bg-sky-500 mt-1 shrink-0" />
                   متوسط نسبة تحمل الهيئة للأدوية المدعمة هو {((stats.totalOrg / (stats.totalValue || 1)) * 100).toFixed(1)}%.
                 </li>
                 <li className="flex items-start gap-2">
                   <div className="w-1.5 h-1.5 rounded-full bg-rose-500 mt-1 shrink-0" />
                   يساهم المرضى بمبلغ {stats.totalPatient.toLocaleString()} ج.م من إجمالي قيمة الدواء.
                 </li>
               </ul>
            </Card>
         </div>
      </div>

    </div>
    </PrintableTable>
  );
};

export default SupportedDrugsReportPage;
