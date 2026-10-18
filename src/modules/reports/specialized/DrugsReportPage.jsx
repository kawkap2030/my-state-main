import React, { useState, useMemo, useEffect, useCallback } from 'react';
import PageHeader from '../../../components/ui/PageHeader';
import Breadcrumb from '../../../components/ui/Breadcrumb';
import HierarchySelector from '../../../components/common/HierarchySelector';
import Card from '../../../components/ui/Card';
import Button from '../../../components/ui/Button';
import Table from '../../../components/ui/Table';
import ExportMenu from '../../../components/ui/ExportMenu';
import useReportPrintShortcut from '../../../hooks/useReportPrintShortcut';
import { useToast } from '../../../components/ui/Toast';
import invoke from '../../../api/tauriApi';
import { useGlobalApp } from '../../../context/useGlobalApp';
import AutoComplete from '../../../components/ui/AutoComplete';
import { 
  Pill, Search, DollarSign, 
  Package, TrendingUp, AlertCircle, Filter, ChevronDown,
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

const DrugsReportPage = () => {
  const toast = useToast();
  const { workspaceMode, hierarchyNames } = useGlobalApp();
  const [loading, setLoading] = useState(false);
  const [viewType, setViewType] = useState('analytical'); // 'analytical' or 'administrative'
  const [data, setData] = useState([]);
  const [hierarchy, setHierarchy] = useState({ 
    branchId: '', areaId: '', clinicId: '', 
    dispenseMonth: new Date().toISOString().substring(0, 7) 
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [metaData, setMetaData] = useState({ drugs: [], categories: [], branches: [], areas: [], clinics: [] });
  const [chartType, setChartType] = useState('bar');
  const chartRef = React.useRef(null);
  // Ref to the toolbar ExportMenu — Ctrl+P opens the EXACT same PrintPreviewModal
  // that ExportMenu → "طباعة التقرير" opens (shared imperative API, no native
  // WebView2 print dialog, no window.print() path).
  const exportMenuRef = React.useRef(null);
  useReportPrintShortcut(exportMenuRef);

   
  useEffect(() => {
    loadMeta();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadMeta = async () => {
    try {
      const [drugs, cats, branches, areas, clinics] = await Promise.all([
        invoke('get_drugs'),
        invoke('get_drug_categories'),
        invoke('get_branches'),
        invoke('get_areas_all'),
        invoke('get_clinics_all')
      ]);
      setMetaData({ drugs, categories: cats, branches, areas, clinics });
    } catch (err) {
      console.error('Error loading metadata:', err);
      toast.error('خطأ في تحميل البيانات الأساسية');
    }
  };

  const handleFetch = async () => {
    if (!hierarchy.branchId) {
      toast.warning('يرجى اختيار الفرع على الأقل');
      return;
    }
    setLoading(true);
    try {
      const records = await invoke('get_detailed_drug_dispensed', {
        branchId: parseInt(hierarchy.branchId),
        areaId: hierarchy.areaId ? parseInt(hierarchy.areaId) : null,
        clinicId: hierarchy.clinicId ? parseInt(hierarchy.clinicId) : null,
        dispenseMonth: hierarchy.dispenseMonth
      });
      
      const mapped = records.map(r => {
        const drug = metaData.drugs?.find(d => d.id === r.drug_id);
        const cat = metaData.categories?.find(c => c.id === drug?.category_id);
        const branch = metaData.branches?.find(b => b.id === r.branch_id);
        const area = metaData.areas?.find(a => a.id === r.area_id);
        const clinic = metaData.clinics?.find(c => c.id === r.clinic_id);
        
        return {
          ...r,
          drugName: drug?.name || 'صنف غير معروف',
          categoryName: cat?.name || 'أخرى',
          category_id: cat?.id || 0,
          branchName: branch?.name || 'فرع مجمع',
          areaName: area?.name || 'منطقة مجمعة',
          clinicName: clinic?.name || 'عيادة مجمعة'
        };
      });
      
      setData(mapped);
      toast.success(`تم تحميل ${mapped.length} سجل بنجاح`);
    } catch (err) {
      toast.error(`خطأ: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  const { stats, filteredData, groupedData, insights } = useMemo(() => {
    const groupKeys = viewType === 'analytical' 
      ? ['drug_id', 'unit_price'] 
      : ['clinic_id', 'area_id', 'branch_id', 'drug_id', 'unit_price'];

    const aggregated = aggregateRecordsByPrice(
      data, 
      groupKeys, 
      ['quantity', 'cases_count', 'total_cost']
    );

    const filtered = aggregated.filter(r => {
      const matchesSearch = r.drugName.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = filterCategory === '' || r.category_id?.toString() === filterCategory.toString();
      return matchesSearch && matchesCategory;
    });

    const s = {
      totalCost: 0,
      totalQty: 0,
      totalItems: new Set(aggregated.map(r => r.drug_id)).size,
      topDrug: { name: '--', val: 0 }
    };

    aggregated.forEach(r => {
      s.totalCost += r.total_cost;
      s.totalQty += r.quantity;
      if (r.total_cost > s.topDrug.val) {
        s.topDrug = { name: r.drugName, val: r.total_cost };
      }
    });

    const ins = [];
    if (s.totalCost > 20000) ins.push({ type: 'warning', text: 'ميزانية الأدوية مرتفعة لهذا النطاق، يرجى مراجعة الصنف الأعلى صرفاً.' });
    if (s.totalItems > 50) ins.push({ type: 'info', text: 'تنوع كبير في الأصناف المنصرفة يعكس نشاطاً مكثفاً في العيادات.' });

    const finalGroupedData = [];
    
    if (viewType === 'analytical') {
      const groupedMap = new Map();
      filtered.forEach(item => {
        const cat = item.categoryName || 'أخرى';
        if (!groupedMap.has(cat)) groupedMap.set(cat, { items: [], total: 0 });
        groupedMap.get(cat).items.push(item);
        groupedMap.get(cat).total += item.total_cost;
      });

      [...groupedMap.entries()]
        .sort(([a], [b]) => a.localeCompare(b, 'ar'))
        .forEach(([categoryName, group]) => {
          finalGroupedData.push({
            isGroupHeader: true,
            groupName: categoryName,
            totalCost: group.total,
            id: `group-cat-${categoryName}`
          });
          finalGroupedData.push(...group.items.map(it => ({
            ...it,
            contribution: (it.total_cost / (s.totalCost || 1)) * 100
          })));
        });
    } else {
      const groupedMap = new Map();
      filtered.forEach(item => {
        const key = `${item.branchName} > ${item.areaName} > ${item.clinicName}`;
        if (!groupedMap.has(key)) groupedMap.set(key, { items: [], total: 0 });
        groupedMap.get(key).items.push(item);
        groupedMap.get(key).total += item.total_cost;
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
            contribution: (it.total_cost / (s.totalCost || 1)) * 100
          })));
        });
    }

    return { stats: s, filteredData: filtered, groupedData: finalGroupedData, insights: ins };
  }, [data, searchTerm, filterCategory, viewType]);

  const columns = [
    { 
      header: 'اسم الدواء', 
      render: (row) => (
        <span className="font-bold" style={{ color: 'var(--color-text)' }}>{row.drugName || 'صنف غير معروف'}</span>
      )
    },
    { 
      header: 'التصنيف', 
      render: (row) => (
        <span className="text-[11px] px-2.5 py-1 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-900 dark:text-emerald-200 rounded-lg font-black border border-emerald-200 dark:border-emerald-800">
          {row.categoryName || '--'}
        </span>
      )
    },
    { header: 'الكمية', render: (row) => <span className="font-mono">{row.quantity}</span> },
    { header: 'عدد الحالات', render: (row) => <span className="font-mono">{row.cases_count}</span> },
    { header: 'سعر الوحدة', render: (row) => <span className="text-slate-500">{(row.unit_price || 0).toLocaleString()} ج.م</span> },
    { 
      header: 'إجمالي التكلفة', 
      render: (row) => (
        <div className="flex flex-col gap-1 min-w-[120px]">
          <span className={`font-black ${(row.total_cost || 0) > 5000 ? 'text-rose-600' : 'text-emerald-600'}`}>
            {(row.total_cost || 0).toLocaleString()} ج.م
          </span>
          <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
            <div 
              className="h-full bg-emerald-500 rounded-full" 
              style={{ width: `${Math.min(row.contribution || 0, 100)}%` }}
            />
          </div>
          <span className="text-[10px] text-slate-400 font-bold">{row.contribution?.toFixed(1)}% من الإجمالي</span>
        </div>
      )
    }
  ];

  const exportColumns = [
    { header: 'اسم الدواء', exportAccessor: (r) => r.drugName || 'صنف غير معروف' },
    { header: 'التصنيف', exportAccessor: (r) => r.categoryName || '--' },
    { header: 'الكمية', exportAccessor: (r) => r.quantity },
    { header: 'عدد الحالات', exportAccessor: (r) => r.cases_count },
    { header: 'سعر الوحدة', exportAccessor: (r) => r.unit_price || 0 },
    { header: 'إجمالي التكلفة', exportAccessor: (r) => r.total_cost || 0 },
  ];

  // ── Collapse/Expand Groups ────────────────────────────────────────────
  const STORAGE_KEY = 'collapsed-drugs-report';
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
        const groupLabel = typeof item.groupName === 'string' ? item.groupName : '';
        currentGroupName = groupLabel;
        result.push({
          ...item,
          groupName: (
            <div className="flex items-center gap-2 w-full" style={{ direction: 'rtl' }}>
              <span className="w-1 h-5 rounded-full" style={{ background: 'var(--color-primary)' }} />
              <span>{groupLabel}</span>
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
          drugName: `── ${name} ──`,
          categoryName: '',
          quantity: '',
          cases_count: '',
          unit_price: '',
          total_cost: item.totalCost || 0,
        });
      } else {
        rows.push(item);
        grandTotal += (item.total_cost || 0);
      }
    }

    rows.push({
      drugName: '── الإجمالي العام ──',
      categoryName: '',
      quantity: filteredData.reduce((s, r) => s + (r.quantity || 0), 0),
      cases_count: filteredData.reduce((s, r) => s + (r.cases_count || 0), 0),
      unit_price: '',
      total_cost: grandTotal,
    });

    return rows;
  }, [groupedData, filteredData]);

  const topDrugsData = useMemo(() => {
    return [...filteredData]
      .sort((a, b) => b.total_cost - a.total_cost)
      .slice(0, 10);
  }, [filteredData]);

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
        const sheetsData = { 'التفاصيل': { data: data, columns: exportColumns, options: enrichedOptions } };
        const globalOptions = {
          fileName: 'drugs_premium_report',
          title: 'تقرير الأدوية التفصيلي',
          chartImage: chartImage,
          summaryData: {
            headers: ['الإحصائية', 'القيمة'],
            rows: [
              ['إجمالي التكلفة', `${stats.totalCost.toLocaleString()} ج.م`],
              ['عدد الأصناف المنصرفة', `${stats.totalItems} صنف`],
              ['إجمالي الكميات', `${stats.totalQty.toLocaleString()} وحدة`],
              ['الصنف الأكثر استهلاكاً', stats.topDrug.name]
            ]
          }
        };
        const excelSaved = await exportMultiSheetExcel(sheetsData, globalOptions);
        if (excelSaved === true) return true;
        return 'cancelled';
      }
      // Build multi-table data for Word/PDF: summary table + detail table
      const summaryTable = {
        data: [
          { indicator: 'إجمالي التكلفة', val: `${stats.totalCost.toLocaleString()} ج.م` },
          { indicator: 'عدد الأصناف', val: `${stats.totalItems} صنف` },
          { indicator: 'إجمالي الكميات', val: `${stats.totalQty.toLocaleString()} وحدة` },
          { indicator: 'الأكثر استهلاكاً', val: stats.topDrug.name },
        ],
        columns: [
          { header: 'المؤشر', accessor: 'indicator' },
          { header: 'القيمة', accessor: 'val' },
        ],
        title: 'ملخص التقرير',
      };
      const multiTables = [summaryTable, { data, columns: exportColumns, title: 'تفاصيل الصرف' }];
      const wordPdfOptions = { ...enrichedOptions, tables: multiTables };

      if (type === 'word') {
        const wordSaved = await exportToWord(data, exportColumns, wordPdfOptions);
        if (wordSaved === true) return true;
        return 'cancelled';
      }
      if (type === 'pdf') {
        const pdfSaved = await exportToPDF(data, exportColumns, wordPdfOptions);
        if (pdfSaved === true) return true;
        return 'cancelled';
      }
      return false;
    } catch (err) {
      console.error(err);
      return false;
    }
  };

  return (
    <PrintableTable title="تقرير الأدوية التفصيلي" subtitle={hierarchy.dispenseMonth ? `شهر ${hierarchy.dispenseMonth}` : ''} hierarchyLabel={buildHierarchyLabel(workspaceMode, hierarchyNames)}>
      <div className="space-y-6 animate-fadeIn pb-20">
      <Breadcrumb items={[{ label: 'التقارير' }, { label: 'تقرير الأدوية التفصيلي' }]} />
      
      <PageHeader 
        title="تقرير الأدوية التفصيلي" 
        icon={Pill} 
        description="تحليل شامل لكافة الأصناف المنصرفة، الكميات، والتكاليف التفصيلية."
        actions={
          <div className="flex items-center gap-3">
            <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl no-print">
               <button 
                 onClick={() => setViewType('analytical')} 
                 className={`px-4 py-2 rounded-lg text-xs font-black transition-all ${viewType === 'analytical' ? 'bg-white dark:bg-slate-700 shadow-sm text-primary' : 'text-slate-400'}`}
               >
                  تحليلي (بالأصناف)
               </button>
               <button 
                 onClick={() => setViewType('administrative')} 
                 className={`px-4 py-2 rounded-lg text-xs font-black transition-all ${viewType === 'administrative' ? 'bg-white dark:bg-slate-700 shadow-sm text-primary' : 'text-slate-400'}`}
               >
                  إداري (بالجهات)
               </button>
            </div>
            <ExportMenu 
              ref={exportMenuRef}
              data={exportData} 
              columns={exportColumns} 
              onCustomExport={handlePremiumExport}
              options={{ 
                title: `تقرير الأدوية - ${viewType === 'analytical' ? 'عرض تحليلي' : 'عرض إداري'}`, 
                fileName: 'drugs_report', 
                subtitle: 'تحليل شامل لكافة الأصناف المنصرفة' 
              }} 
            />
          </div>
        }
      />

      {/* Insights Section */}
      {insights.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 no-print">
          {insights.map((ins, i) => (
            <div key={i} className={`p-4 rounded-2xl flex items-center gap-3 border ${ins.type === 'warning' ? 'bg-rose-50 border-rose-100 text-rose-700' : 'bg-blue-50 border-blue-100 text-blue-700'}`}>
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
                 placeholder="بحث في الأسماء..."
                 className="w-full pr-10 pl-4 h-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-[var(--color-bg)] text-[var(--color-text)] focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                 value={searchTerm}
                 onChange={(e) => setSearchTerm(e.target.value)}
               />
            </div>
            
            <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
              <AutoComplete
                value={filterCategory}
                onChange={(val) => setFilterCategory(val ?? '')}
                options={metaData.categories || []}
                getOptionLabel={(c) => c.name}
                getOptionValue={(c) => String(c.id)}
                placeholder="كل التصنيفات"
                className="min-w-[160px]"
              />

              {/* Collapse All Button */}
              <button
                onClick={() => {
                  const names = [...new Set(groupedData.filter(d => d.isGroupHeader).map(d => typeof d.groupName === 'string' ? d.groupName : '').filter(Boolean))];
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

              {(searchTerm || filterCategory) && (
                <button 
                  onClick={() => {
                    setSearchTerm('');
                    setFilterCategory('');
                  }}
                  className="h-11 px-4 text-xs font-bold text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-xl transition-colors flex items-center gap-2"
                >
                  إلغاء الفلاتر
                </button>
              )}
            </div>
          </div>
          <Button 
            variant="primary" 
            icon={TrendingUp} 
            onClick={handleFetch} 
            loading={loading} 
            className="h-11 px-12 shadow-lg rounded-xl"
          >
            توليد التقرير
          </Button>
        </div>
      </Card>

      {/* Stats Dashboard */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="p-6 bg-[var(--color-primary-dark)] text-white border-none shadow-xl">
          <p className="text-[10px] opacity-50 mb-1 uppercase tracking-tighter">إجمالي التكلفة</p>
          <h2 className="text-3xl font-black text-emerald-400">{stats.totalCost.toLocaleString()} <span className="text-xs">ج.م</span></h2>
        </Card>
        <Card className="p-6 bg-[var(--color-bg-card)] border-none shadow-md">
          <p className="text-[10px] text-[var(--color-text-muted)] mb-1 uppercase tracking-tighter">عدد الأصناف</p>
          <h2 className="text-3xl font-black" style={{ color: 'var(--color-text)' }}>{stats.totalItems} <span className="text-xs">صنف</span></h2>
        </Card>
        <Card className="p-6 bg-[var(--color-bg-card)] border-none shadow-md">
          <p className="text-[10px] text-[var(--color-text-muted)] mb-1 uppercase tracking-tighter">إجمالي الكميات</p>
          <h2 className="text-3xl font-black" style={{ color: 'var(--color-text)' }}>{stats.totalQty.toLocaleString()} <span className="text-xs">وحدة</span></h2>
        </Card>
        <Card className="p-6 bg-[var(--color-bg-card)] border-none shadow-md">
          <p className="text-[10px] text-[var(--color-text-muted)] mb-1 uppercase tracking-tighter">الأكثر استهلاكاً</p>
          <h2 className="text-lg font-black truncate" style={{ color: 'var(--color-text)' }} title={stats.topDrug.name}>{stats.topDrug.name}</h2>
        </Card>
      </div>

      {/* Table Section */}
      <Card className="p-0 overflow-hidden shadow-2xl border-none">
        <Table 
          columns={columns} 
          data={displayData} 
          loading={loading}
        />
        {filteredData.length === 0 && !loading && (
          <div className="p-32 text-center text-slate-300 italic">بانتظار اختيار المعايير وتوليد البيانات...</div>
        )}
      </Card>

      {/* Charts Section */}
      {filteredData.length > 0 && (
        <Card className="p-6 mt-6 shadow-xl border-none no-print">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4 no-print">
            <h3 className="font-bold text-lg text-[var(--color-text)] flex items-center gap-2">
              <BarChart3 className="text-primary" size={24} />
              تحليل أعلى 10 أصناف (تكلفة)
            </h3>
            <div className="flex gap-2 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
               <button onClick={() => setChartType('bar')} className={`p-2 rounded-lg transition-all ${chartType === 'bar' ? 'bg-white dark:bg-slate-700 shadow-sm text-primary' : 'text-slate-400'}`}>
                  <BarChartIcon size={18} />
               </button>
               <button onClick={() => setChartType('line')} className={`p-2 rounded-lg transition-all ${chartType === 'line' ? 'bg-white dark:bg-slate-700 shadow-sm text-primary' : 'text-slate-400'}`}>
                  <LineChartIcon size={18} />
               </button>
            </div>
          </div>
          
          <div className="h-[400px] w-full" dir="ltr" ref={chartRef}>
            <ResponsiveContainer width="100%" height="100%">
              {chartType === 'bar' ? (
                <BarChart data={topDrugsData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" opacity={0.5} />
                  <XAxis dataKey="drugName" angle={-45} textAnchor="end" height={60} tick={{ fill: '#64748b', fontSize: 10, fontWeight: 600 }} />
                  <YAxis tick={{ fill: '#64748b', fontWeight: 600 }} />
                  <RechartsTooltip cursor={{ fill: '#f8fafc', opacity: 0.4 }} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                  <Bar dataKey="total_cost" name="التكلفة (ج.م)" radius={[4, 4, 0, 0]}>
                    {topDrugsData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={['#0891b2', '#0e7490', '#0d9488', '#0f766e', '#059669', '#10b981', '#3b82f6', '#2563eb', '#4f46e5', '#7c3aed'][index % 10]} />
                    ))}
                  </Bar>
                </BarChart>
              ) : (
                <LineChart data={topDrugsData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" opacity={0.5} />
                  <XAxis dataKey="drugName" angle={-45} textAnchor="end" height={60} tick={{ fill: '#64748b', fontSize: 10, fontWeight: 600 }} />
                  <YAxis tick={{ fill: '#64748b', fontWeight: 600 }} />
                  <RechartsTooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                  <Line type="monotone" dataKey="total_cost" name="التكلفة (ج.م)" stroke="#0891b2" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                </LineChart>
              )}
            </ResponsiveContainer>
          </div>
        </Card>
      )}

    </div>
    </PrintableTable>
  );
};

export default DrugsReportPage;
