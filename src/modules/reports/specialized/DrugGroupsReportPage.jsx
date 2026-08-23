import React, { useState, useMemo, useEffect } from 'react';
import PageHeader from '../../../components/ui/PageHeader';
import Breadcrumb from '../../../components/ui/Breadcrumb';
import HierarchySelector from '../../../components/common/HierarchySelector';
import Card from '../../../components/ui/Card';
import Button from '../../../components/ui/Button';
import Table from '../../../components/ui/Table';
import ExportMenu from '../../../components/ui/ExportMenu';
import { useToast } from '../../../components/ui/Toast';
import invoke from '../../../api/tauriApi';
import { useGlobalApp } from '../../../context/useGlobalApp';
import { exportMultiSheetExcel, exportToWord, exportToPDF } from '../../../utils/exportUtils';
import { toPng } from 'html-to-image';
import { 
  Package, Search, LayoutGrid, 
  DollarSign, BarChart3, TrendingUp, Filter,
  Layers, ArrowUpRight, ArrowDownRight,
  BarChart as BarChartIcon, LineChart as LineChartIcon, PieChart as PieChartIcon, AlertCircle
} from 'lucide-react';
import { 
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend,
  PieChart, Pie, Cell, LineChart, Line 
} from 'recharts';
import PrintableTable from '../../../components/common/PrintableTable';
import { aggregateRecordsByPrice, buildHierarchyLabel } from '../../../utils/reportUtils';

const DrugGroupsReportPage = () => {
  const toast = useToast();
  const { workspaceMode, hierarchyNames } = useGlobalApp();
  const [loading, setLoading] = useState(false);
  const [viewType, setViewType] = useState('analytical'); // 'analytical' or 'administrative'
  const [data, setData] = useState([]);
  const [chartType, setChartType] = useState('bar');
  const [hierarchy, setHierarchy] = useState({ 
    branchId: '', areaId: '', clinicId: '', 
    dispenseMonth: new Date().toISOString().substring(0, 7) 
  });
  const [metaData, setMetaData] = useState({ groups: [], branches: [], areas: [], clinics: [] });
  const chartRef = React.useRef(null);

  useEffect(() => {
    loadMeta();
  }, []);

  const loadMeta = async () => {
    try {
      const [groups, branches, areas, clinics] = await Promise.all([
        invoke('get_drug_groups'),
        invoke('get_branches'),
        invoke('get_areas_all'),
        invoke('get_clinics_all')
      ]);
      setMetaData({ groups, branches, areas, clinics });
    } catch (err) {
      console.error(err);
    }
  };

  const handleFetch = async () => {
    if (!hierarchy.branchId) {
      toast.warning('يرجى اختيار الفرع على الأقل');
      return;
    }
    setLoading(true);
    try {
      const records = await invoke('get_drug_groups_report', {
        branchId: parseInt(hierarchy.branchId),
        areaId: hierarchy.areaId ? parseInt(hierarchy.areaId) : null,
        clinicId: hierarchy.clinicId ? parseInt(hierarchy.clinicId) : null,
        dispenseMonth: hierarchy.dispenseMonth
      });
      
      const mapped = records.map(r => {
        const branch = metaData.branches?.find(b => b.id === r.branch_id);
        const area = metaData.areas?.find(a => a.id === r.area_id);
        const clinic = metaData.clinics?.find(c => c.id === r.clinic_id);
        const master = metaData.groups?.find(g => g.id === r.group_code_id);
        
        const branchName = branch?.name || 'فرع مجمع';
        const areaName = area?.name || 'منطقة مجمعة';
        const clinicName = clinic?.name || 'عيادة مجمعة';
        const locationName = r.clinic_id ? clinicName : r.area_id ? areaName : branchName;
        
        return {
          ...r,
          groupName: r.name || master?.name || 'مجموعة غير معروفة',
          branchName,
          areaName,
          clinicName,
          locationName,
        };
      });

      setData(mapped);
      toast.success('تم تحميل بيانات المجموعات بنجاح');
    } catch (err) {
      toast.error(`خطأ: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  const { stats, groupedData, insights } = useMemo(() => {
    // 1. Aggregation
    const groupKeys = viewType === 'analytical' 
      ? ['group_code_id', 'name'] 
      : ['clinic_id', 'area_id', 'branch_id', 'group_code_id'];

    const aggregated = aggregateRecordsByPrice(data, groupKeys, ['cost']);

    const s = {
      totalCost: 0,
      totalGroups: new Set(aggregated.map(r => r.group_code_id)).size,
      highest: { name: '--', val: 0 },
      lowest: { name: '--', val: Infinity }
    };

    aggregated.forEach(r => {
      s.totalCost += r.cost;
      if (r.cost > s.highest.val) s.highest = { name: r.groupName, val: r.cost };
      if (r.cost < s.lowest.val) s.lowest = { name: r.groupName, val: r.cost };
    });

    if (s.lowest.val === Infinity) s.lowest.val = 0;

    // 2. Grouping
    const finalGroupedData = [];
    if (viewType === 'analytical') {
      finalGroupedData.push(...aggregated.map(it => ({
        ...it,
        contribution: (it.cost / (s.totalCost || 1)) * 100
      })));
    } else {
      const groupedMap = new Map();
      aggregated.forEach(item => {
        const key = `${item.branchName} > ${item.areaName} > ${item.clinicName}`;
        if (!groupedMap.has(key)) groupedMap.set(key, { items: [], total: 0 });
        groupedMap.get(key).items.push(item);
        groupedMap.get(key).total += item.cost;
      });

      groupedMap.forEach((group, locationLabel) => {
        finalGroupedData.push({
          isGroupHeader: true,
          groupName: locationLabel,
          totalCost: group.total,
          id: `group-loc-${locationLabel}`
        });
        finalGroupedData.push(...group.items.map(it => ({
          ...it,
          contribution: (it.cost / (s.totalCost || 1)) * 100
        })));
      });
    }

    const ins = [];
    if (s.totalCost > 50000) ins.push({ type: 'warning', text: 'تكلفة المجموعات مرتفعة جداً لهذا الشهر.' });

    return { stats: s, groupedData: finalGroupedData, insights: ins };
  }, [data, viewType]);

  const columns = [
    { header: 'الشهر', render: (row) => <span className="text-xs">{row.dispense_month}</span> },
    { 
      header: 'الموقع', 
      render: (row) => <span className="text-xs font-bold">{row.locationName}</span>
    },
    { 
      header: 'اسم المجموعة', 
      render: (row) => (
        <div className="flex items-center gap-3">
           <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center text-purple-600">
              <LayoutGrid size={16} />
           </div>
           <span className="font-bold">{row.groupName}</span>
        </div>
      )
    },
    { 
      header: 'التكلفة', 
      render: (row) => (
        <div className="flex flex-col gap-1 min-w-[120px]">
          <span className="font-black text-purple-600">
            {row.cost.toLocaleString()} ج.م
          </span>
          <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
            <div 
              className="h-full bg-purple-500 rounded-full" 
              style={{ width: `${Math.min(row.contribution || 0, 100)}%` }}
            />
          </div>
        </div>
      )
    }
  ];

  const exportColumns = [
    { header: 'الشهر', exportAccessor: (r) => r.dispense_month },
    { header: 'الموقع', exportAccessor: (r) => r.locationName },
    { header: 'اسم المجموعة', exportAccessor: (r) => r.groupName },
    { header: 'التكلفة', exportAccessor: (r) => r.cost },
  ];

  const handlePremiumExport = async (type, { data, columns: _columns, options }) => {
    try {
      let chartImage = null;
      if (chartRef.current) chartImage = await toPng(chartRef.current, { quality: 0.85, pixelRatio: 1, backgroundColor: '#ffffff' });
      const enrichedOptions = { ...options, chartImage };
      if (type === 'excel') {
        const sheetsData = { 'تحليل المجموعات': { data: data, columns: exportColumns, options: enrichedOptions } };
        const globalOptions = {
          fileName: 'drug_groups_premium_report',
          title: 'تقرير المجموعات الدوائية',
          chartImage: chartImage,
          summaryData: {
            headers: ['الإحصائية', 'القيمة'],
            rows: [
              ['إجمالي التكلفة', `${stats.totalCost.toLocaleString()} ج.م`],
              ['أعلى مجموعة', stats.highest.name]
            ]
          }
        };
        await exportMultiSheetExcel(sheetsData, globalOptions);
        toast.success('تم تصدير Excel بنجاح');
        return true;
      }
      // Word/PDF: summary table + detail table (like the premium Excel export)
      const summaryTable = {
        data: [
          { indicator: 'إجمالي التكلفة', val: `${stats.totalCost.toLocaleString()} ج.م` },
          { indicator: 'أعلى مجموعة', val: stats.highest.name },
        ],
        columns: [
          { header: 'المؤشر', accessor: 'indicator' },
          { header: 'القيمة', accessor: 'val' },
        ],
        title: 'ملخص التقرير',
      };
      const multiTables = [summaryTable, { data, columns: exportColumns, title: 'تفاصيل المجموعات' }];
      const wordPdfOptions = { ...enrichedOptions, tables: multiTables };
      if (type === 'word') { await exportToWord(data, exportColumns, wordPdfOptions); toast.success('تم تصدير Word بنجاح'); return true; }
      if (type === 'pdf') { await exportToPDF(data, exportColumns, wordPdfOptions); toast.success('تم تصدير PDF بنجاح'); return true; }
      return false;
    } catch (err) { console.error(err); return false; }
  };

  return (
    <PrintableTable title="تقرير المجموعات الدوائية" subtitle={hierarchy.dispenseMonth ? `شهر ${hierarchy.dispenseMonth}` : ''} hierarchyLabel={buildHierarchyLabel(workspaceMode, hierarchyNames)}>
      <div className="space-y-6 animate-fadeIn pb-20">
      <Breadcrumb items={[{ label: 'التقارير' }, { label: 'تقرير المجموعات الدوائية' }]} />
      
      <PageHeader 
        title="تقرير المجموعات الدوائية" 
        icon={LayoutGrid} 
        description="تحليل مالي مفصل لتكاليف المجموعات الدوائية وتوزيعها."
        actions={
          <div className="flex items-center gap-3">
            <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl no-print">
               <button onClick={() => setViewType('analytical')} className={`px-4 py-2 rounded-lg text-xs font-black transition-all ${viewType === 'analytical' ? 'bg-white dark:bg-slate-700 shadow-sm text-primary' : 'text-slate-400'}`}>تحليلي</button>
               <button onClick={() => setViewType('administrative')} className={`px-4 py-2 rounded-lg text-xs font-black transition-all ${viewType === 'administrative' ? 'bg-white dark:bg-slate-700 shadow-sm text-primary' : 'text-slate-400'}`}>إداري</button>
            </div>
            <ExportMenu data={groupedData} columns={exportColumns} onCustomExport={handlePremiumExport} options={{ title: 'تقرير المجموعات الدوائية', fileName: 'drug_groups_report' }} />
          </div>
        }
      />

      {/* Insights */}
      {insights.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 no-print">
          {insights.map((ins, i) => (
            <div key={i} className={`p-4 rounded-2xl flex items-center gap-3 border ${ins.type === 'warning' ? 'bg-rose-50 border-rose-100 text-rose-700' : 'bg-purple-50 border-purple-100 text-purple-700'}`}>
              <AlertCircle size={20} />
              <p className="text-xs font-bold">{ins.text}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filter Card */}
      <Card className="p-6 no-print space-y-6">
        <div className="w-full">
          <HierarchySelector 
            onSelectionChange={(d) => setHierarchy(prev => ({ ...prev, ...d }))}
            initialBranch={hierarchy.branchId}
            initialMonth={hierarchy.dispenseMonth}
          />
        </div>
        <div className="flex justify-end pt-4 border-t border-slate-100 dark:border-slate-800">
          <Button variant="primary" icon={TrendingUp} onClick={handleFetch} loading={loading} className="h-11 px-16 shadow-lg rounded-xl">توليد التقرير</Button>
        </div>
      </Card>

      {/* Stats Dashboard */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="p-6 bg-purple-700 text-white border-none shadow-xl">
          <p className="text-[10px] opacity-60 mb-1 uppercase tracking-tighter">إجمالي التكلفة</p>
          <h2 className="text-3xl font-black">{stats.totalCost.toLocaleString()} <span className="text-xs">ج.م</span></h2>
        </Card>
        <Card className="p-6 bg-[var(--color-bg-card)] border-none shadow-md">
          <p className="text-[10px] text-[var(--color-text-muted)] mb-1 uppercase tracking-tighter">عدد المجموعات</p>
          <h2 className="text-3xl font-black">{stats.totalGroups}</h2>
        </Card>
        <Card className="p-6 bg-[var(--color-bg-card)] border-none shadow-md col-span-2">
          <p className="text-[10px] text-[var(--color-text-muted)] mb-1 uppercase tracking-tighter">أعلى مجموعة تكلفة</p>
          <h2 className="text-xl font-black truncate" title={stats.highest.name}>{stats.highest.name}</h2>
          <p className="text-xs font-bold text-purple-600">{stats.highest.val.toLocaleString()} ج.م</p>
        </Card>
      </div>

      {/* Table Section */}
      <Card className="p-0 overflow-hidden shadow-2xl border-none">
        <Table columns={columns} data={groupedData} loading={loading} />
        {data.length === 0 && !loading && (
          <div className="p-32 text-center text-slate-300 italic">بانتظار اختيار المعايير وتوليد البيانات...</div>
        )}
      </Card>

      {/* Charts Section */}
      {data.length > 0 && (
        <Card className="p-6 mt-6 shadow-xl border-none no-print">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
            <h3 className="font-bold text-lg flex items-center gap-2"><BarChart3 className="text-purple-600" size={24} /> تحليل التكاليف</h3>
            <div className="flex gap-2 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
               <button onClick={() => setChartType('bar')} className={`p-2 rounded-lg ${chartType === 'bar' ? 'bg-white shadow text-purple-600' : 'text-slate-400'}`}><BarChartIcon size={18} /></button>
               <button onClick={() => setChartType('pie')} className={`p-2 rounded-lg ${chartType === 'pie' ? 'bg-white shadow text-purple-600' : 'text-slate-400'}`}><PieChartIcon size={18} /></button>
            </div>
          </div>
          <div className="h-[400px] w-full" dir="ltr" ref={chartRef}>
            <ResponsiveContainer width="100%" height="100%">
              {chartType === 'bar' ? (
                <BarChart data={data.slice(0, 15)} margin={{ bottom: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" opacity={0.5} />
                  <XAxis dataKey="groupName" angle={-45} textAnchor="end" height={60} tick={{ fontSize: 10 }} />
                  <YAxis />
                  <RechartsTooltip contentStyle={{ borderRadius: '12px', border: 'none' }} />
                  <Bar dataKey="cost" name="التكلفة" radius={[4, 4, 0, 0]} fill="#8b5cf6" />
                </BarChart>
              ) : (
                <PieChart>
                  <Pie data={data.slice(0, 8)} cx="50%" cy="50%" outerRadius={120} dataKey="cost" nameKey="groupName" label>
                    {data.map((_, i) => <Cell key={i} fill={['#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ef4444'][i % 5]} />)}
                  </Pie>
                  <RechartsTooltip />
                  <Legend />
                </PieChart>
              )}
            </ResponsiveContainer>
          </div>
        </Card>
      )}

    </div>
    </PrintableTable>
  );
};

export default DrugGroupsReportPage;
