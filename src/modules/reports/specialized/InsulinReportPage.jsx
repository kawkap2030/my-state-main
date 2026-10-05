import React, { useState, useMemo, useEffect, useCallback } from 'react';
import PageHeader from '../../../components/ui/PageHeader';
import Breadcrumb from '../../../components/ui/Breadcrumb';
import HierarchySelector from '../../../components/common/HierarchySelector';
import Card from '../../../components/ui/Card';
import Button from '../../../components/ui/Button';
import Table from '../../../components/ui/Table';
import ExportMenu from '../../../components/ui/ExportMenu';
import useReportPrintShortcut from '../../../hooks/useReportPrintShortcut';
import AutoComplete from '../../../components/ui/AutoComplete';
import { useToast } from '../../../components/ui/Toast';
import { useGlobalApp } from '../../../context/useGlobalApp';
import invoke from '../../../api/tauriApi';
import { 
  Syringe, Search, Activity, 
  Users, TrendingUp, AlertCircle, Info, ChevronDown,
  Plus, Minus,
  BarChart3, BarChart as BarChartIcon, PieChart as PieChartIcon, LineChart as LineChartIcon
} from 'lucide-react';
import { 
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend,
  Cell, PieChart, Pie, LineChart, Line 
} from 'recharts';
import { aggregateRecordsByPrice, buildHierarchyLabel } from '../../../utils/reportUtils';
import { exportMultiSheetExcel, exportToWord, exportToPDF } from '../../../utils/exportUtils';
import PrintableTable from '../../../components/common/PrintableTable';
import { toPng } from 'html-to-image';

const InsulinReportPage = () => {
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
  const [filterCategory, setFilterCategory] = useState('');
  const [filterType, setFilterType] = useState('');
  const [metaData, setMetaData] = useState({ categories: [], types: [], branches: [], areas: [], clinics: [] });
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
      const [cats, ts, branches, areas, clinics] = await Promise.all([
        invoke('get_insulin_categories'),
        invoke('get_insulin_types'),
        invoke('get_branches'),
        invoke('get_areas_all'),
        invoke('get_clinics_all')
      ]);
      setMetaData({ categories: cats, types: ts, branches, areas, clinics });
    } catch (err) {
      console.error('Failed to load metadata:', err);
    }
  };

  const handleFetch = async () => {
    if (!hierarchy.branchId) {
      setData([]);
      return;
    }
    setLoading(true);
    try {
      const records = await invoke('get_insulin_dispensed', {
        branchId: parseInt(hierarchy.branchId),
        areaId: hierarchy.areaId ? parseInt(hierarchy.areaId) : null,
        clinicId: hierarchy.clinicId ? parseInt(hierarchy.clinicId) : null,
        dispenseMonth: hierarchy.dispenseMonth
      });
      
      const mapped = records.map(r => {
        const branch = metaData.branches?.find(b => b.id === r.branch_id);
        const area = metaData.areas?.find(a => a.id === r.area_id);
        const clinic = metaData.clinics?.find(c => c.id === r.clinic_id);
        return {
          ...r,
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

  const { stats, filteredData, groupedData, insights } = useMemo(() => {
    // 1. Aggregation based on viewType
    const groupKeys = viewType === 'analytical' 
      ? ['insulin_code_id', 'price', 'category', 'type_'] 
      : ['clinic_id', 'area_id', 'branch_id', 'insulin_code_id', 'price'];

    const aggregated = aggregateRecordsByPrice(
      data, 
      groupKeys, 
      ['quantity', 'cases_count', 'cost']
    );

    // 2. Filtering
    const filtered = aggregated.filter(r => {
      const matchesSearch = r.name?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = filterCategory === '' || r.category === filterCategory;
      const matchesType = filterType === '' || r.type_ === filterType;
      return matchesSearch && matchesCategory && matchesType;
    });

    const s = {
      totalCost: 0,
      totalQty: 0,
      totalCases: 0,
      topInsulin: { name: '--', val: 0 }
    };

    aggregated.forEach(r => {
      s.totalCost += r.cost;
      s.totalQty += r.quantity;
      s.totalCases += r.cases_count;
      if (r.cost > s.topInsulin.val) {
        s.topInsulin = { name: r.name, val: r.cost };
      }
    });

    const ins = [];
    if (s.totalCases > 500) ins.push({ type: 'info', text: 'ملاحظة: كثافة عالية في عدد حالات مرضى السكري المسجلين هذا الشهر.' });
    if (s.totalCost > 15000) ins.push({ type: 'warning', text: 'تحذير: تجاوزت تكلفة الإنسولين الحد المعتاد لهذا النطاق.' });

    // 3. Grouping Logic
    const finalGroupedData = [];
    if (viewType === 'analytical') {
      const groupedMap = new Map();
      filtered.forEach(item => {
        const typeStr = item.type_ || 'أخرى';
        if (!groupedMap.has(typeStr)) groupedMap.set(typeStr, { items: [], total: 0 });
        groupedMap.get(typeStr).items.push(item);
        groupedMap.get(typeStr).total += item.cost;
      });

      [...groupedMap.entries()]
        .sort(([a], [b]) => a.localeCompare(b, 'ar'))
        .forEach(([typeName, group]) => {
          finalGroupedData.push({
            isGroupHeader: true,
            groupName: `تصنيف: ${typeName}`,
            totalCost: group.total,
            id: `group-type-${typeName}`
          });
          finalGroupedData.push(...group.items.map(it => ({
            ...it,
            contribution: (it.cost / (s.totalCost || 1)) * 100
          })));
        });
    } else {
      const groupedMap = new Map();
      filtered.forEach(item => {
        const key = `${item.branchName} > ${item.areaName} > ${item.clinicName}`;
        if (!groupedMap.has(key)) groupedMap.set(key, { items: [], total: 0 });
        groupedMap.get(key).items.push(item);
        groupedMap.get(key).total += item.cost;
      });

      [...groupedMap.entries()]
        .sort(([a], [b]) => a.localeCompare(b, 'ar'))
        .forEach(([locationLabel, group]) => {
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

    return { stats: s, filteredData: filtered, groupedData: finalGroupedData, insights: ins };
  }, [data, searchTerm, filterCategory, filterType, viewType]);

  const columns = [
    { 
      header: 'اسم الإنسولين', 
      render: (row) => <span className="font-bold text-[var(--color-text)]">{row.name}</span>
    },
    { 
      header: 'النوع', 
      render: (row) => (
        <span className="text-[10px] px-2 py-1 rounded-lg font-black border border-cyan-100 bg-cyan-50 text-cyan-700 whitespace-nowrap">
          {row.type_}
        </span>
      ) 
    },
    { 
      header: 'الفئة / الوحدة', 
      render: (row) => (
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] text-slate-500 font-bold">{row.category}</span>
          <span className="text-[9px] text-slate-400">{row.unit}</span>
        </div>
      ) 
    },
    { header: 'الحالات', render: (row) => <span className="font-mono font-black text-slate-700">{row.cases_count}</span> },
    { header: 'الكمية', render: (row) => <span className="font-mono font-bold">{row.quantity}</span> },
    { 
      header: 'سعر الوحدة', 
      render: (row) => <span className="font-mono text-slate-500">{(row.price || 0).toLocaleString()}</span> 
    },
    { 
      header: 'إجمالي التكلفة', 
      render: (row) => (
        <div className="flex flex-col gap-1 min-w-[120px]">
          <span className="font-black text-primary">
            {row.cost.toLocaleString()} ج.م
          </span>
          <div className="w-full bg-slate-100 dark:bg-slate-800 h-1 rounded-full overflow-hidden">
            <div 
              className="h-full bg-cyan-500 rounded-full" 
              style={{ width: `${Math.min(row.contribution || 0, 100)}%` }}
            />
          </div>
          <span className="text-[9px] text-slate-400 font-bold text-left">{row.contribution?.toFixed(1)}%</span>
        </div>
      )
    }
  ];

  const exportColumns = useMemo(() => ([
    { header: 'نوع الإنسولين', exportAccessor: (r) => r.name },
    { header: 'النوع', exportAccessor: (r) => r.type_ },
    { header: 'الفئة', exportAccessor: (r) => r.category },
    { header: 'الحالات', exportAccessor: (r) => r.cases_count },
    { header: 'الكمية', exportAccessor: (r) => r.quantity },
    { header: 'السعر', exportAccessor: (r) => r.price },
    { header: 'التكلفة', exportAccessor: (r) => r.cost },
  ]), []);

  // ── Collapse/Expand Groups ────────────────────────────────────────────
  const STORAGE_KEY = 'collapsed-insulin-report';
  const [collapsedGroups, setCollapsedGroups] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch { return new Set(); }
  });
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...collapsedGroups]));
  }, [collapsedGroups]);
  const toggleGroup = useCallback((name) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }, []);

  // Filter out items from collapsed groups
  const displayData = useMemo(() => {
    if (!groupedData || groupedData.length === 0) return [];
    const result = [];
    let currentGroupName = '';
    for (const item of groupedData) {
      if (item.isGroupHeader) {
        const groupLabel = typeof item.groupName === 'string' ? item.groupName.replace('تصنيف: ', '') : '';
        currentGroupName = groupLabel;
        result.push({
          ...item,
          groupName: (
            <div className="flex items-center gap-2 w-full" style={{ direction: 'rtl' }}>
              <span className="w-1 h-5 rounded-full" style={{ background: 'var(--color-primary)' }} />
              <span>{typeof item.groupName === 'string' ? item.groupName : ''}</span>
              <button
                onClick={(e) => { e.stopPropagation(); toggleGroup(groupLabel); }}
                className="mr-auto p-1 rounded-lg hover:bg-[var(--color-primary)]/20 transition-all cursor-pointer flex items-center gap-1"
                style={{ color: 'var(--color-primary)' }}
                title={collapsedGroups.has(groupLabel) ? 'إظهار' : 'إخفاء'}
                type="button"
              >
                {collapsedGroups.has(groupLabel) ? <Plus size={14} /> : <Minus size={14} />}
              </button>
            </div>
          ),
        });
      } else if (!collapsedGroups.has(currentGroupName)) {
        result.push({ ...item, _groupKey: currentGroupName });
      }
    }
    return result;
  }, [groupedData, collapsedGroups, toggleGroup]);

  // Prepare export-friendly data with group headers and totals
  const exportData = useMemo(() => {
    if (!groupedData || groupedData.length === 0) return [];
    const rows = [];
    let grandTotal = 0;

    for (const item of groupedData) {
      if (item.isGroupHeader) {
        const name = typeof item.groupName === 'string' ? item.groupName : '';
        rows.push({
          name: `── ${name} ──`,
          type_: '',
          category: '',
          unit: '',
          cases_count: '',
          quantity: '',
          price: '',
          cost: item.totalCost || 0,
        });
      } else {
        rows.push(item);
        grandTotal += (item.cost || 0);
      }
    }

    rows.push({
      name: '── الإجمالي العام ──',
      type_: '',
      category: '',
      unit: '',
      cases_count: filteredData.reduce((s, r) => s + (r.cases_count || 0), 0),
      quantity: filteredData.reduce((s, r) => s + (r.quantity || 0), 0),
      price: '',
      cost: grandTotal,
    });

    return rows;
  }, [groupedData, filteredData]);

  const chartData = useMemo(() => {
    const typeMap = {};
    filteredData.forEach(r => {
      const t = r.type_ || 'أخرى';
      typeMap[t] = (typeMap[t] || 0) + r.cost;
    });
    return Object.entries(typeMap).map(([name, cost]) => ({ name, cost }));
  }, [filteredData]);

  // Word/PDF: summary table + detail table (like the premium Excel export).
  // Kept outside handlePremiumExport because ExportMenu also reads
  // options.tables to build the print preview — otherwise the printed report
  // would show only the detail table while Word/PDF show both.
  const premiumTables = useMemo(() => ([
    {
      data: [
        { indicator: 'إجمالي التكلفة', val: `${stats.totalCost.toLocaleString()} ج.م` },
        { indicator: 'إجمالي الحالات', val: `${stats.totalCases.toLocaleString()} حالة` },
        { indicator: 'إجمالي الكميات', val: `${stats.totalQty.toLocaleString()} عبوة` },
        { indicator: 'النوع الأكثر طلباً', val: stats.topInsulin.name },
      ],
      columns: [
        { header: 'المؤشر', accessor: 'indicator' },
        { header: 'القيمة', accessor: 'val' },
      ],
      title: 'ملخص التقرير',
    },
    { data: exportData, columns: exportColumns, title: 'تفاصيل صرف الإنسولين' },
  ]), [stats, exportData, exportColumns]);

  const handlePremiumExport = async (type, { data, options }) => {
    try {
      let chartImage = null;
      if (chartRef.current) {
        try {
          chartImage = await toPng(chartRef.current, { quality: 0.85, pixelRatio: 1, backgroundColor: '#ffffff' });
        } catch (e) { console.error(e); }
      }
      const enrichedOptions = { ...options, chartImage };
      if (type === 'excel') {
        const sheetsData = { 'تحليل الإنسولين': { data: data, columns: exportColumns, options: enrichedOptions } };
        const globalOptions = {
          fileName: 'insulin_premium_report',
          title: 'تقرير صرف الإنسولين التفصيلي',
          chartImage: chartImage,
          summaryData: {
            headers: ['الإحصائية', 'القيمة'],
            rows: [
              ['إجمالي التكلفة', `${stats.totalCost.toLocaleString()} ج.م`],
              ['إجمالي الحالات', `${stats.totalCases.toLocaleString()} حالة`],
              ['إجمالي الكميات', `${stats.totalQty.toLocaleString()} عبوة`],
              ['النوع الأكثر طلباً', stats.topInsulin.name]
            ]
          }
        };
        await exportMultiSheetExcel(sheetsData, globalOptions);
        toast.success('تم تصدير ملف Excel بنجاح');
        return true;
      }
      const wordPdfOptions = { ...enrichedOptions, tables: premiumTables };
      if (type === 'word') { await exportToWord(data, exportColumns, wordPdfOptions); toast.success('تم تصدير ملف Word بنجاح'); return true; }
      if (type === 'pdf') { await exportToPDF(data, exportColumns, wordPdfOptions); toast.success('تم تصدير ملف PDF بنجاح'); return true; }
      return false;
    } catch (err) { console.error(err); return false; }
  };

  return (
    <PrintableTable title="تقرير صرف الإنسولين التفصيلي" subtitle={hierarchy.dispenseMonth ? `شهر ${hierarchy.dispenseMonth}` : ''} hierarchyLabel={buildHierarchyLabel(workspaceMode, hierarchyNames)}>
    <div className="space-y-6 animate-fadeIn pb-20">
      <Breadcrumb items={[{ label: 'التقارير' }, { label: 'تقرير صرف الإنسولين' }]} />
      
      <PageHeader 
        title="تقرير صرف الإنسولين التفصيلي" 
        icon={Syringe} 
        description="تحليل مالي وإحصائي مطابق لتقرير البايثون مع عرض سعر الوحدة وتصنيف الأنواع."
        actions={
          <div className="flex items-center gap-3">
            <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl no-print">
               <button onClick={() => setViewType('analytical')} className={`px-4 py-2 rounded-lg text-xs font-black transition-all ${viewType === 'analytical' ? 'bg-white dark:bg-slate-700 shadow-sm text-primary' : 'text-slate-400'}`}>تحليلي</button>
               <button onClick={() => setViewType('administrative')} className={`px-4 py-2 rounded-lg text-xs font-black transition-all ${viewType === 'administrative' ? 'bg-white dark:bg-slate-700 shadow-sm text-primary' : 'text-slate-400'}`}>إداري</button>
            </div>
            <ExportMenu 
              ref={exportMenuRef}
              data={exportData} 
              columns={exportColumns} 
              onCustomExport={handlePremiumExport}
              options={{ title: 'تقرير صرف الإنسولين التفصيلي', fileName: 'insulin_detailed_report', tables: premiumTables }} 
            />
          </div>
        }
      />

      {/* Insights */}
      {insights.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 no-print">
          {insights.map((ins, i) => (
            <div key={i} className={`p-4 rounded-2xl flex items-center gap-3 border ${ins.type === 'warning' ? 'bg-rose-50 border-rose-100 text-rose-700' : 'bg-cyan-50 border-cyan-100 text-cyan-700'}`}>
              <Info size={20} />
              <p className="text-xs font-bold">{ins.text}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filter Card */}
      <Card className="p-6 no-print space-y-6 shadow-sm border-slate-100">
        <div className="w-full">
          <HierarchySelector 
            onSelectionChange={(d) => setHierarchy(prev => ({ ...prev, ...d }))}
            initialBranch={hierarchy.branchId}
            initialArea={hierarchy.areaId}
            initialClinic={hierarchy.clinicId}
            initialMonth={hierarchy.dispenseMonth}
          />
        </div>
        
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 pt-4 border-t border-slate-100 dark:border-slate-800">
          <div className="flex flex-col md:flex-row gap-4 w-full md:w-auto flex-1 items-center">
            <div className="relative flex-1 max-w-md w-full">
               <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
               <input 
                 type="text" 
                 placeholder="بحث سريع..."
                 className="w-full pr-10 pl-4 h-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-[var(--color-bg)] text-[var(--color-text)] outline-none transition-all"
                 value={searchTerm}
                 onChange={(e) => setSearchTerm(e.target.value)}
               />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div style={{ minWidth: '160px' }}>
                <AutoComplete
                  value={filterType}
                  onChange={setFilterType}
                  options={metaData.types}
                  getOptionLabel={(t) => t.name}
                  getOptionValue={(t) => t.name}
                  placeholder="كل الأنواع"
                  label={null}
                />
              </div>
              <div style={{ minWidth: '160px' }}>
                <AutoComplete
                  value={filterCategory}
                  onChange={setFilterCategory}
                  options={metaData.categories}
                  getOptionLabel={(c) => c.name}
                  getOptionValue={(c) => c.name}
                  placeholder="كل التصنيفات"
                  label={null}
                />
              </div>
              {/* Collapse All Button */}
              <button
                onClick={() => {
                  const names = [...new Set(groupedData.filter(d => d.isGroupHeader).map(d => {
                    const n = typeof d.groupName === 'string' ? d.groupName.replace('تصنيف: ', '') : '';
                    return n;
                  }).filter(Boolean))];
                  const allCollapsed = names.every(n => collapsedGroups.has(n));
                  if (allCollapsed) {
                    setCollapsedGroups(new Set());
                  } else {
                    setCollapsedGroups(new Set(names));
                  }
                }}
                className={`h-11 px-3 rounded-xl border transition-all flex items-center gap-2 text-xs font-bold ${
                  collapsedGroups.size > 0
                    ? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)] border-[var(--color-primary)]/30'
                    : 'bg-[var(--color-bg)] text-[var(--color-text-muted)] border-slate-200 dark:border-slate-700 hover:bg-slate-50'
                }`}
                title={collapsedGroups.size > 0 ? 'فتح كل المجموعات' : 'طي كل المجموعات'}
              >
                {collapsedGroups.size > 0 ? (
                  <><ChevronDown size={14} /> فتح الكل</>
                ) : (
                  <><ChevronDown size={14} className="rotate-180" /> طي الكل</>
                )}
              </button>
            </div>
          </div>
        </div>
      </Card>

      {/* Stats Dashboard */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="p-6 bg-primary text-white border-none shadow-xl relative overflow-hidden group">
          <Activity className="absolute -right-4 -bottom-4 opacity-10 group-hover:scale-125 transition-transform duration-500" size={100} />
          <p className="text-[10px] opacity-60 mb-1 uppercase tracking-tighter">إجمالي التكلفة</p>
          <h2 className="text-3xl font-black">{stats.totalCost.toLocaleString()} <span className="text-xs">ج.م</span></h2>
        </Card>
        <Card className="p-6 bg-[var(--color-bg-card)] border-none shadow-md">
          <p className="text-[10px] text-[var(--color-text-muted)] mb-1 uppercase tracking-tighter">إجمالي الحالات</p>
          <h2 className="text-3xl font-black" style={{ color: 'var(--color-text)' }}>{stats.totalCases.toLocaleString()} <span className="text-xs">مريض</span></h2>
        </Card>
        <Card className="p-6 bg-[var(--color-bg-card)] border-none shadow-md">
          <p className="text-[10px] text-[var(--color-text-muted)] mb-1 uppercase tracking-tighter">إجمالي الكميات</p>
          <h2 className="text-3xl font-black" style={{ color: 'var(--color-text)' }}>{stats.totalQty.toLocaleString()} <span className="text-xs">عبوة</span></h2>
        </Card>
        <Card className="p-6 bg-[var(--color-bg-card)] border-none shadow-md">
          <p className="text-[10px] text-[var(--color-text-muted)] mb-1 uppercase tracking-tighter">النوع الأكثر طلباً</p>
          <h2 className="text-lg font-black truncate" style={{ color: 'var(--color-text)' }} title={stats.topInsulin.name}>{stats.topInsulin.name}</h2>
        </Card>
      </div>

      {/* Table Section */}          <Card className="p-0 overflow-hidden shadow-2xl border-none">
        <Table columns={columns} data={displayData} loading={loading} />
        {filteredData.length === 0 && !loading && (
          <div className="p-32 text-center text-slate-300 italic font-medium">بانتظار اختيار المعايير وتوليد البيانات...</div>
        )}
      </Card>

      {/* Charts Section */}
      {filteredData.length > 0 && (
        <Card className="p-6 mt-6 shadow-xl border-none no-print">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4 no-print">
            <h3 className="font-bold text-lg text-[var(--color-text)] flex items-center gap-2">
              <BarChart3 className="text-cyan-600" size={24} />
              تحليل تكلفة الأنواع
            </h3>
            <div className="flex gap-2 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
               <button onClick={() => setChartType('bar')} className={`p-2 rounded-lg transition-all ${chartType === 'bar' ? 'bg-white dark:bg-slate-700 shadow-sm text-cyan-600' : 'text-slate-400'}`}><BarChartIcon size={18} /></button>
               <button onClick={() => setChartType('pie')} className={`p-2 rounded-lg transition-all ${chartType === 'pie' ? 'bg-white dark:bg-slate-700 shadow-sm text-cyan-600' : 'text-slate-400'}`}><PieChartIcon size={18} /></button>
            </div>
          </div>
          <div className="h-[400px] w-full" dir="ltr" ref={chartRef}>
            <ResponsiveContainer width="100%" height="100%">
              {chartType === 'bar' ? (
                <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" opacity={0.5} />
                  <XAxis dataKey="name" angle={-45} textAnchor="end" height={60} tick={{ fill: '#64748b', fontSize: 10, fontWeight: 600 }} />
                  <YAxis tick={{ fill: '#64748b', fontWeight: 600 }} />
                  <RechartsTooltip cursor={{ fill: '#f8fafc', opacity: 0.4 }} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                  <Bar dataKey="cost" name="التكلفة (ج.م)" radius={[4, 4, 0, 0]}>
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={['#0891b2', '#0e7490', '#0d9488', '#0f766e', '#059669', '#10b981', '#3b82f6', '#2563eb'][index % 8]} />
                    ))}
                  </Bar>
                </BarChart>
              ) : (
                <PieChart>
                  <Pie data={chartData} cx="50%" cy="50%" labelLine={true} outerRadius={120} fill="#8884d8" dataKey="cost" nameKey="name" label>
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={['#0891b2', '#0e7490', '#0d9488', '#0f766e', '#059669', '#10b981', '#3b82f6', '#2563eb'][index % 8]} />
                    ))}
                  </Pie>
                  <RechartsTooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} formatter={(value) => [`${Number(value).toLocaleString()} ج.م`, 'التكلفة']} />
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

export default InsulinReportPage;
