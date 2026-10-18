import React, { useState, useMemo, useEffect } from 'react';
import PageHeader from '../../../components/ui/PageHeader';
import Breadcrumb from '../../../components/ui/Breadcrumb';
import HierarchySelector from '../../../components/common/HierarchySelector';
import Card from '../../../components/ui/Card';
import Button from '../../../components/ui/Button';
import Table from '../../../components/ui/Table';
import ExportMenu from '../../../components/ui/ExportMenu';
import useReportPrintShortcut from '../../../hooks/useReportPrintShortcut';
import { useToast } from '../../../components/ui/Toast';
import { useGlobalApp } from '../../../context/useGlobalApp';
import invoke from '../../../api/tauriApi';
import AutoComplete from '../../../components/ui/AutoComplete';
import { 
  Layers, Search, Package, 
  DollarSign, BarChart3, TrendingUp, Filter, Info, AlertCircle, Building2,
  PieChart as PieChartIcon, BarChart as BarChartIcon
} from 'lucide-react';
import { 
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend,
  Cell, PieChart, Pie
} from 'recharts';
import { aggregateRecordsByPrice, buildHierarchyLabel } from '../../../utils/reportUtils';
import { exportMultiSheetExcel, exportToWord, exportToPDF } from '../../../utils/exportUtils';
import PrintableTable from '../../../components/common/PrintableTable';
import { toPng } from 'html-to-image';

const SuppliesReportPage = () => {
  const toast = useToast();
  const { activeHierarchy, workspaceMode, hierarchyNames } = useGlobalApp();
  const [loading, setLoading] = useState(false);
  const [viewType, setViewType] = useState('analytical'); // 'analytical' or 'administrative'
  const [data, setData] = useState([]);
  const [hierarchy, setHierarchy] = useState({ 
    branchId: activeHierarchy.branchId || '', 
    areaId: activeHierarchy.areaId || '', 
    clinicId: activeHierarchy.clinicId || '', 
    dispenseMonth: activeHierarchy.dispenseMonth || new Date().toISOString().substring(0, 7),
    categoryId: '' // New category filter
  });
  const [metaData, setMetaData] = useState({ supplies: [], branches: [], areas: [], clinics: [] });
  const [chartType, setChartType] = useState('bar');
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
      const [supplies, branches, areas, clinics, supply_categories] = await Promise.all([
        invoke('get_supplies'),
        invoke('get_branches'),
        invoke('get_areas_all'),
        invoke('get_clinics_all'),
        invoke('get_supply_categories')
      ]);
      setMetaData({ supplies, branches, areas, clinics, categories: supply_categories });
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
      const records = await invoke('get_report_monthly_supplies_dispensed', {
        branchId: parseInt(hierarchy.branchId),
        areaId: hierarchy.areaId ? parseInt(hierarchy.areaId) : null,
        clinicId: hierarchy.clinicId ? parseInt(hierarchy.clinicId) : null,
        dispenseMonth: hierarchy.dispenseMonth,
        categoryId: hierarchy.categoryId ? parseInt(hierarchy.categoryId) : null
      });
      
      const mapped = records.map(r => {
        const branch = metaData.branches?.find(b => b.id === r.branch_id);
        const area = metaData.areas?.find(a => a.id === r.area_id);
        const clinic = metaData.clinics?.find(c => c.id === r.clinic_id);
        
        return {
          ...r,
          supplyName: r.item_name || 'مستلزم غير معروف',
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
    if (metaData.supplies.length > 0) {
      handleFetch();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hierarchy.branchId, hierarchy.areaId, hierarchy.clinicId, hierarchy.dispenseMonth, hierarchy.categoryId, metaData.supplies]);

  const { stats, groupedData, insights, topLocations } = useMemo(() => {
    // 1. Aggregation
    const groupKeys = viewType === 'analytical' 
      ? ['item_name'] 
      : ['clinic_id', 'area_id', 'branch_id', 'item_name'];

    const aggregated = aggregateRecordsByPrice(
      data,
      groupKeys,
      ['consumer_value', 'collective_entities_value']
    );

    const s = {
      totalValue: 0,
      count: new Set(aggregated.map(r => r.item_name)).size
    };

    aggregated.forEach(r => {
      r.totalValue = (r.consumer_value || 0) + (r.collective_entities_value || 0);
      s.totalValue += r.totalValue;
    });

    // 2. Grouping
    const finalGroupedData = [];
    if (viewType === 'analytical') {
      finalGroupedData.push(...aggregated.map(it => ({
        ...it,
        contribution: (it.totalValue / (s.totalValue || 1)) * 100
      })));
    } else {
      const groupedMap = new Map();
      aggregated.forEach(item => {
        const key = `${item.branchName} > ${item.areaName} > ${item.clinicName}`;
        if (!groupedMap.has(key)) groupedMap.set(key, { items: [], total: 0 });
        groupedMap.get(key).items.push(item);
        groupedMap.get(key).total += item.totalValue;
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
          contribution: (it.totalValue / (s.totalValue || 1)) * 100
        })));
      });
    }

    const ins = [];
    if (s.totalValue > 30000) ins.push({ type: 'warning', text: 'تكلفة المستلزمات الطبية تجاوزت الحدود المقررة لهذا النطاق.' });

    // 3. Top Locations Analysis
    const locMap = new Map();
    data.forEach(r => {
      const key = r.clinicName;
      const val = (r.consumer_value || 0) + (r.collective_entities_value || 0);
      locMap.set(key, (locMap.get(key) || 0) + val);
    });
    const topLocations = Array.from(locMap.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

    return { stats: s, groupedData: finalGroupedData, insights: ins, topLocations };
  }, [data, viewType]);

  const columns = [
    { 
      header: 'اسم المستلزم', 
      render: (row) => <span className="font-bold">{row.supplyName}</span> 
    },
    { header: 'قيمة المستهلك', render: (row) => <span className="font-mono">{row.consumer_value.toLocaleString()} ج.م</span> },
    { header: 'قيمة الجهات', render: (row) => <span className="font-mono">{row.collective_entities_value.toLocaleString()} ج.م</span> },
    { 
      header: 'إجمالي القيمة', 
      render: (row) => (
        <div className="flex flex-col gap-1 min-w-[120px]">
          <span className="font-black text-cyan-600">
            {row.totalValue.toLocaleString()} ج.م
          </span>
          <div className="w-full bg-slate-100 dark:bg-slate-800 h-1 rounded-full overflow-hidden">
            <div 
              className="h-full bg-cyan-500 rounded-full" 
              style={{ width: `${Math.min(row.contribution || 0, 100)}%` }}
            />
          </div>
        </div>
      )
    }
  ];

  const exportColumns = [
    { header: 'اسم المستلزم', exportAccessor: (r) => r.supplyName },
    { header: 'قيمة المستهلك', exportAccessor: (r) => r.consumer_value },
    { header: 'قيمة الجهات', exportAccessor: (r) => r.collective_entities_value },
    { header: 'الإجمالي', exportAccessor: (r) => r.totalValue },
  ];

  const handlePremiumExport = async (type, { data, options }) => {
    try {
      let chartImage = null;
      if (chartRef.current) chartImage = await toPng(chartRef.current, { quality: 0.85, pixelRatio: 1, backgroundColor: '#ffffff' });
      const enrichedOptions = { ...options, chartImage };
      if (type === 'excel') {
        const sheetsData = { 'تحليل المستلزمات': { data: data, columns: exportColumns, options: enrichedOptions } };
        const globalOptions = {
          fileName: 'supplies_premium_report',
          title: 'تقرير المستلزمات الطبية',
          summaryData: {
            headers: ['الإحصائية', 'القيمة'],
            rows: [['إجمالي القيمة', `${stats.totalValue.toLocaleString()} ج.م`], ['عدد البنود', stats.count]]
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
          { indicator: 'إجمالي القيمة', val: `${stats.totalValue.toLocaleString()} ج.م` },
          { indicator: 'عدد البنود', val: stats.count },
        ],
        columns: [
          { header: 'المؤشر', accessor: 'indicator' },
          { header: 'القيمة', accessor: 'val' },
        ],
        title: 'ملخص التقرير',
      };
      const multiTables = [summaryTable, { data, columns: exportColumns, title: 'تفاصيل المستلزمات الطبية' }];
      const wordPdfOptions = { ...enrichedOptions, tables: multiTables };
      if (type === 'word') { const wordSaved = await exportToWord(data, exportColumns, wordPdfOptions); if (wordSaved === true) return true; return 'cancelled'; }
      if (type === 'pdf') { const pdfSaved = await exportToPDF(data, exportColumns, wordPdfOptions); if (pdfSaved === true) return true; return 'cancelled'; }
      return false;
    } catch (err) { console.error(err); return false; }
  };

  return (
    <PrintableTable title="تقرير المستلزمات الطبية" subtitle={hierarchy.dispenseMonth ? `شهر ${hierarchy.dispenseMonth}` : ''} hierarchyLabel={buildHierarchyLabel(workspaceMode, hierarchyNames)}>
      <div className="space-y-6 animate-fadeIn pb-20">
      <Breadcrumb items={[{ label: 'التقارير' }, { label: 'تقرير المستلزمات الطبية' }]} />
      
      <PageHeader 
        title="تقرير المستلزمات الطبية" 
        icon={Layers} 
        description="تحليل مالي لقيم المستلزمات الطبية المنصرفة للعيادات والجهات."
        actions={
          <div className="flex items-center gap-3">
            <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl no-print">
               <button onClick={() => setViewType('analytical')} className={`px-4 py-2 rounded-lg text-xs font-black transition-all ${viewType === 'analytical' ? 'bg-white dark:bg-slate-700 shadow-sm text-primary' : 'text-slate-400'}`}>تحليلي</button>
               <button onClick={() => setViewType('administrative')} className={`px-4 py-2 rounded-lg text-xs font-black transition-all ${viewType === 'administrative' ? 'bg-white dark:bg-slate-700 shadow-sm text-primary' : 'text-slate-400'}`}>إداري</button>
            </div>
            <ExportMenu ref={exportMenuRef} data={groupedData} columns={exportColumns} onCustomExport={handlePremiumExport} options={{ title: 'تقرير المستلزمات الطبية', fileName: 'supplies_report' }} />
          </div>
        }
      />

      {/* Insights */}
      {insights.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 no-print">
          {insights.map((ins, i) => (
            <div key={i} className={`p-4 rounded-2xl flex items-center gap-3 border ${ins.type === 'warning' ? 'bg-rose-50 border-rose-100 text-rose-700' : 'bg-cyan-50 border-cyan-100 text-cyan-700'}`}>
              <AlertCircle size={20} />
              <p className="text-xs font-bold">{ins.text}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filter Card */}
      <Card className="p-6 no-print">
        <div className="w-full">
          <HierarchySelector 
            onSelectionChange={(d) => setHierarchy(prev => ({ ...prev, ...d }))}
            initialBranch={hierarchy.branchId}
            initialArea={hierarchy.areaId}
            initialClinic={hierarchy.clinicId}
            initialMonth={hierarchy.dispenseMonth}
          />
          <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Layers size={16} className="text-slate-400" />
              <span className="text-xs font-bold text-slate-500">تصفية حسب التصنيف:</span>
            </div>
            <AutoComplete
              value={hierarchy.categoryId}
              onChange={(val) => setHierarchy(prev => ({ ...prev, categoryId: val ?? '' }))}
              options={metaData.categories || []}
              getOptionLabel={(c) => c.name}
              getOptionValue={(c) => String(c.id)}
              placeholder="كافة التصنيفات"
              className="min-w-[180px]"
            />
            {hierarchy.categoryId && (
              <button 
                onClick={() => setHierarchy(prev => ({ ...prev, categoryId: '' }))}
                className="text-[10px] font-black text-rose-500 hover:underline"
              >
                إلغاء التصفية
              </button>
            )}
          </div>
        </div>
      </Card>

      {/* Stats Dashboard */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="p-6 bg-cyan-700 text-white border-none shadow-xl relative overflow-hidden">
          <Package className="absolute -right-6 -bottom-6 opacity-10" size={120} />
          <p className="text-[10px] opacity-60 mb-1 uppercase tracking-tighter">إجمالي القيمة</p>
          <h2 className="text-4xl font-black">{stats.totalValue.toLocaleString()} <span className="text-sm">ج.م</span></h2>
        </Card>
        <Card className="p-6 bg-[var(--color-bg-card)] border-none shadow-md">
          <p className="text-[10px] text-[var(--color-text-muted)] mb-1 uppercase tracking-tighter">عدد البنود المنصرفة</p>
          <h2 className="text-4xl font-black">{stats.count}</h2>
        </Card>
      </div>

      {topLocations.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 no-print">
           <div className="md:col-span-1 bg-gradient-to-br from-slate-800 to-slate-900 p-4 rounded-2xl text-white flex flex-col justify-center">
              <TrendingUp size={24} className="text-cyan-400 mb-2" />
              <span className="text-[10px] font-bold opacity-60">الأكثر استهلاكاً</span>
              <span className="text-lg font-black mt-1">أعلى 5 عيادات</span>
           </div>
           {topLocations.map((loc, i) => (
             <Card key={i} className="p-4 border-none shadow-sm flex flex-col justify-between hover:scale-105 transition-transform cursor-default">
                <span className="text-[10px] font-bold text-slate-400 truncate">{loc.name}</span>
                <div className="flex items-end justify-between mt-1">
                   <span className="text-sm font-black text-cyan-600">{loc.value.toLocaleString()}</span>
                   <span className="text-[9px] font-bold text-slate-300">ج.م</span>
                </div>
             </Card>
           ))}
        </div>
      )}

      {/* Table Section */}
      <Card className="p-0 overflow-hidden shadow-2xl border-none">
        <Table columns={columns} data={groupedData} loading={loading} />
        {data.length === 0 && !loading && (
          <div className="p-32 text-center text-slate-300 italic font-medium">بانتظار اختيار المعايير وتوليد البيانات...</div>
        )}
      </Card>

      {/* Charts Section */}
      {data.length > 0 && (
        <Card className="p-6 mt-6 shadow-xl border-none no-print">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
            <h3 className="font-bold text-lg flex items-center gap-2"><BarChart3 className="text-cyan-600" size={24} /> تحليل التوزيع</h3>
            <div className="flex gap-2 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
               <button onClick={() => setChartType('bar')} className={`p-2 rounded-lg ${chartType === 'bar' ? 'bg-white shadow text-cyan-600' : 'text-slate-400'}`} title="توزيع البنود"><BarChartIcon size={18} /></button>
               <button onClick={() => setChartType('location')} className={`p-2 rounded-lg ${chartType === 'location' ? 'bg-white shadow text-cyan-600' : 'text-slate-400'}`} title="توزيع العيادات"><Building2 size={18} /></button>
               <button onClick={() => setChartType('pie')} className={`p-2 rounded-lg ${chartType === 'pie' ? 'bg-white shadow text-cyan-600' : 'text-slate-400'}`} title="نسبة المساهمة"><PieChartIcon size={18} /></button>
            </div>
          </div>
          <div className="h-[400px] w-full" dir="ltr" ref={chartRef}>
            <ResponsiveContainer width="100%" height="100%">
              {chartType === 'bar' ? (
                <BarChart data={data.slice(0, 10)} margin={{ bottom: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" opacity={0.5} />
                  <XAxis dataKey="supplyName" angle={-45} textAnchor="end" height={60} tick={{ fontSize: 10 }} />
                  <YAxis />
                  <RechartsTooltip />
                  <Bar dataKey="totalValue" name="القيمة" radius={[4, 4, 0, 0]} fill="#0891b2" />
                </BarChart>
              ) : chartType === 'location' ? (
                <BarChart data={topLocations} margin={{ bottom: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" opacity={0.5} />
                  <XAxis dataKey="name" angle={-45} textAnchor="end" height={60} tick={{ fontSize: 10 }} />
                  <YAxis />
                  <RechartsTooltip />
                  <Bar dataKey="value" name="التكلفة" radius={[4, 4, 0, 0]} fill="#0d9488" />
                </BarChart>
              ) : (
                <PieChart>
                  <Pie data={data.slice(0, 8)} cx="50%" cy="50%" outerRadius={120} dataKey="totalValue" nameKey="supplyName" label>
                    {data.map((_, i) => <Cell key={i} fill={['#0891b2', '#0e7490', '#0d9488', '#0f766e', '#059669'][i % 5]} />)}
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

export default SuppliesReportPage;
