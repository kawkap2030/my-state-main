import React, { useState, useMemo, useEffect } from 'react';
import PageHeader from '../../../components/ui/PageHeader';
import Breadcrumb from '../../../components/ui/Breadcrumb';
import Card from '../../../components/ui/Card';
import Button from '../../../components/ui/Button';
import ExportMenu from '../../../components/ui/ExportMenu';
import useReportPrintShortcut from '../../../hooks/useReportPrintShortcut';
import AutoComplete from '../../../components/ui/AutoComplete';
import HierarchySelector from '../../../components/common/HierarchySelector';
import Table from '../../../components/ui/Table';
import PrintableTable from '../../../components/common/PrintableTable';
import { 
  PieChart, GitCompare, Search, 
  MapPin, Pill, TrendingUp, Layers, ArrowRightLeft,
  Calendar, BarChart3, LineChart as LineIcon, Info,
  Syringe, LayoutGrid
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell, Legend,
  LineChart, Line
} from 'recharts';
import invoke from '../../../api/tauriApi';
import { useToast } from '../../../components/ui/Toast';
import { useGlobalApp } from '../../../context/useGlobalApp';
import { buildHierarchyLabel } from '../../../utils/reportUtils';
import html2canvas from 'html2canvas';
import { exportMultiSheetExcel, exportToWord, exportToPDF } from '../../../utils/exportUtils';

const COLORS = ['#0891b2', '#7c3aed', '#059669', '#d97706', '#dc2626', '#2563eb', '#db2777'];

const ComparisonReportsPage = () => {
  const toast = useToast();
  const { workspaceMode, hierarchyNames } = useGlobalApp();
  const [activeTab, setActiveTab] = useState('trend'); // 'trend' or 'entity'
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState([]);

  // Filters
  const [range, setRange] = useState({
    start: new Date(new Date().setMonth(new Date().getMonth() - 6)).toISOString().substring(0, 7),
    end: new Date().toISOString().substring(0, 7)
  });
  const [compType, setCompType] = useState('drug'); // 'drug', 'category', 'insulin', 'groups', 'overall_cost'
  const [selectedId, setSelectedId] = useState('');
  
  // Hierarchy
  const [hierarchy1, setHierarchy1] = useState({ branchId: '', areaId: '', clinicId: '' });
  const [hierarchy2, setHierarchy2] = useState({ branchId: '', areaId: '', clinicId: '' });

  const [drugsList, setDrugsList] = useState([]);
  const [categoriesList, setCategoriesList] = useState([]);
  const [insulinList, setInsulinList] = useState([]);
  const [groupsList, setGroupsList] = useState([]);
  const [hierarchyData, setHierarchyData] = useState({ branches: [], areas: [], clinics: [] });

  const chartRef = React.useRef(null);
  // Ref to the toolbar ExportMenu — Ctrl+P opens the EXACT same PrintPreviewModal
  // that ExportMenu → "طباعة التقرير" opens (shared imperative API, no native
  // WebView2 print dialog, no window.print() path).
  const exportMenuRef = React.useRef(null);
  useReportPrintShortcut(exportMenuRef);

  useEffect(() => {
    (async () => {
      try {
        const [d, c, i, g, b, a, cl] = await Promise.all([
          invoke('get_drugs'), 
          invoke('get_drug_categories'),
          invoke('get_insulin_codes'),
          invoke('get_drug_groups'),
          invoke('get_branches'),
          invoke('get_areas_all'),
          invoke('get_clinics_all') 
        ]);
        setDrugsList(d || []);
        setCategoriesList(c || []);
        setInsulinList(i || []);
        setGroupsList(g || []);
        setHierarchyData({ branches: b || [], areas: a || [], clinics: cl || [] });
      } catch (e) { console.error(e); }
    })();
  }, []);

  const getEntityName = (h) => {
    if (h.clinicId) return hierarchyData.clinics.find(x => String(x.id) === String(h.clinicId))?.name || 'عيادة';
    if (h.areaId) return hierarchyData.areas.find(x => String(x.id) === String(h.areaId))?.name || 'منطقة';
    if (h.branchId) return hierarchyData.branches.find(x => String(x.id) === String(h.branchId))?.name || 'فرع';
    return 'غير محدد';
  };

  const handleFetch = async () => {
    if (!hierarchy1.branchId) { toast.warning('يرجى اختيار الجهة الأولى'); return; }
    if (activeTab === 'entity' && !hierarchy2.branchId) { toast.warning('يرجى اختيار الجهة الثانية للمقارنة'); return; }
    if (compType !== 'overall_cost' && !selectedId) { toast.warning('يرجى اختيار الصنف للمقارنة'); return; }

    setLoading(true);
    try {
      const getParams = (h) => ({
        branchId: parseInt(h.branchId),
        areaId: h.areaId ? parseInt(h.areaId) : null,
        clinicId: h.clinicId ? parseInt(h.clinicId) : null,
        startMonth: range.start,
        endMonth: range.end,
        // Backend specific variations
        branch_id: parseInt(h.branchId),
        area_id: h.areaId ? parseInt(h.areaId) : null,
        clinic_id: h.clinicId ? parseInt(h.clinicId) : null,
      });

      const fetchByMode = async (h) => {
        const p = getParams(h);
        let records = [];
        let summary = { quantity: 0, cost: 0, cases: 0 };

        if (compType === 'drug' || compType === 'category') {
          records = await invoke('get_detailed_drug_dispensed_range', p);
          if (compType === 'drug') {
            records = records.filter(r => String(r.drug_id) === String(selectedId));
          } else {
            records = records.filter(r => {
              const drug = drugsList.find(d => String(d.id) === String(r.drug_id));
              return drug && String(drug.category_id) === String(selectedId);
            });
          }
          records.forEach(r => { 
            summary.quantity += (r.quantity || 0); 
            summary.cost += (r.total_cost || 0); 
            summary.cases += (r.cases_count || 0); 
          });
        } else if (compType === 'insulin') {
          records = await invoke('get_insulin_dispensed_range', p);
          records = records.filter(r => String(r.insulin_code_id) === String(selectedId));
          records.forEach(r => { 
            summary.quantity += (r.quantity || 0); 
            summary.cost += (r.cost || 0); 
            summary.cases += (r.cases_count || 0); 
          });
        } else if (compType === 'groups') {
          records = await invoke('get_drug_groups_report_range', p);
          records = records.filter(r => String(r.group_code_id) === String(selectedId));
          records.forEach(r => { 
            summary.cost += (r.cost || 0); 
            // summary.cases += (r.cases_count || 0); // Not available in groups struct
          });
        } else if (compType === 'overall_cost') {
          const months = [];
          let current = new Date(range.start);
          const end = new Date(range.end);
          while (current <= end) {
            months.push(current.toISOString().substring(0, 7));
            current.setMonth(current.getMonth() + 1);
          }
          
          if (activeTab === 'trend') {
            // Fetch month by month for trend
            const monthlyResults = await Promise.all(months.map(m => invoke('get_cost_breakdown_report', { ...p, months: [m] })));
            records = monthlyResults.map((res, i) => ({
              dispense_month: months[i],
              cost: res.reduce((s, r) => s + r.cost, 0)
            }));
          } else {
            const costData = await invoke('get_cost_breakdown_report', { ...p, months });
            summary.cost = costData.reduce((s, r) => s + r.cost, 0);
          }
        }

        return { records, summary };
      };

      if (activeTab === 'trend') {
        const { records } = await fetchByMode(hierarchy1);
        const monthlyData = {};
        
        records.forEach(r => {
          const m = r.dispense_month;
          if (!monthlyData[m]) monthlyData[m] = { month: m, quantity: 0, cost: 0, cases: 0 };
          monthlyData[m].quantity += (r.quantity || 0);
          monthlyData[m].cost += (r.total_cost || r.cost || 0);
          monthlyData[m].cases += (r.cases_count || 0);
        });
        const sorted = Object.values(monthlyData).sort((a, b) => a.month.localeCompare(b.month));
        setData(sorted);
      } else {
        const [res1, res2] = await Promise.all([fetchByMode(hierarchy1), fetchByMode(hierarchy2)]);
        const name1 = getEntityName(hierarchy1);
        const name2 = getEntityName(hierarchy2);
        
        setData([
          { label: name1, ...res1.summary },
          { label: name2, ...res2.summary }
        ]);
      }
      toast.success('تم تحديث بيانات المقارنة');
    } catch (err) {
      toast.error(`فشل المقارنة: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCustomExport = async (type, { data, columns, options }) => {
    if (type === 'print') return false; // Let ExportMenu handle print
    
    toast.info('جاري إعداد التقرير مع الرسم البياني...');
    let chartImage = null;
    
    try {
      if (chartRef.current) {
        const canvas = await html2canvas(chartRef.current, {
          scale: 2,
          useCORS: true,
          backgroundColor: '#ffffff'
        });
        chartImage = canvas.toDataURL('image/png');
      }
    } catch (err) {
      console.error('Failed to capture chart:', err);
    }

    const finalOptions = { ...options, chartImage };

    try {
      if (type === 'excel') {
        const totalVal1 = data.reduce((s, r) => s + (r.val1 || 0), 0);
        const totalVal2 = data.reduce((s, r) => s + (r.val2 || 0), 0);
        const sheetsData = {
          'مقارنة الفترات': { data, columns, options: finalOptions },
        };
        const periodLabel = options.subtitle || '';
        const excelSaved = await exportMultiSheetExcel(sheetsData, {
          fileName: finalOptions.fileName || 'comparison_report',
          title: finalOptions.title || 'تقرير المقارنة الزمنية',
          chartImage,
          summaryData: {
            headers: ['المؤشر', 'القيمة'],
            rows: [
              ['عدد العناصر', String(data.length)],
              ['إجمالي الفترة الأولى', `${totalVal1.toLocaleString()} ج.م`],
              ['إجمالي الفترة الثانية', `${totalVal2.toLocaleString()} ج.م`],
              ['الفترة', periodLabel],
            ],
          },
        });
        if (excelSaved === true) return true;
        return 'cancelled';
      } else if (type === 'word') {
        const wordSaved = await exportToWord(data, columns, finalOptions);
        if (wordSaved === true) return true;
        return 'cancelled';
      } else if (type === 'pdf') {
        const pdfSaved = await exportToPDF(data, columns, finalOptions);
        if (pdfSaved === true) return true;
        return 'cancelled';
      }
    } catch (err) {
      console.error('Export error:', err);
      toast.error(`فشل التصدير: ${err.message || err}`);
    }
    
    return false; // Unknown type — let ExportMenu decide
  };

  const columns = useMemo(() => {
    const isCostOnly = compType === 'groups' || compType === 'overall_cost';
    
    if (activeTab === 'trend') {
      const baseCols = [
        { header: 'الشهر', accessor: 'month' },
      ];
      if (!isCostOnly) {
        baseCols.push({ header: 'الكمية المنصرفة', render: (r) => <span className="font-mono font-bold">{r.quantity.toLocaleString()}</span> });
        baseCols.push({ header: 'عدد الحالات', render: (r) => <span className="font-mono text-slate-500">{r.cases.toLocaleString()}</span> });
      }
      baseCols.push({ header: 'التكلفة الإجمالية', render: (r) => <span className="font-black text-emerald-600">{r.cost.toLocaleString()} ج.م</span> });
      if (!isCostOnly) {
        baseCols.push({ header: 'متوسط سعر الحالة', render: (r) => <span className="text-xs text-slate-400">{(r.cost / (r.cases || 1)).toFixed(2)} ج.م</span> });
      }
      return baseCols;
    } else {
      const baseCols = [
        { header: 'الجهة', accessor: 'label' },
      ];
      if (!isCostOnly) {
        baseCols.push({ header: 'الكمية المنصرفة', render: (r) => <span className="font-mono font-bold">{r.quantity.toLocaleString()}</span> });
        baseCols.push({ header: 'عدد الحالات', render: (r) => <span className="font-mono text-slate-500">{r.cases.toLocaleString()}</span> });
      }
      baseCols.push({ header: 'التكلفة الإجمالية', render: (r) => <span className="font-black text-cyan-600">{r.cost.toLocaleString()} ج.م</span> });
      if (!isCostOnly) {
        baseCols.push({ header: 'متوسط سعر الحالة', render: (r) => <span className="text-xs text-slate-400">{(r.cost / (r.cases || 1)).toFixed(2)} ج.م</span> });
      }
      return baseCols;
    }
  }, [activeTab, compType]);

  const exportColumns = columns.map(c => ({
    header: c.header,
    exportAccessor: (r) => {
      if (c.accessor) return r[c.accessor];
      if (c.header === 'التكلفة الإجمالية') return r.cost;
      if (c.header === 'الكمية المنصرفة') return r.quantity;
      if (c.header === 'عدد الحالات') return r.cases;
      return '-';
    }
  }));

  const itemsList = useMemo(() => {
    switch (compType) {
      case 'drug': return drugsList;
      case 'category': return categoriesList;
      case 'insulin': return insulinList;
      case 'groups': return groupsList;
      default: return [];
    }
  }, [compType, drugsList, categoriesList, insulinList, groupsList]);

  const currentItemName = useMemo(() => {
    if (compType === 'overall_cost') return 'التكلفة الإجمالية للمنظومة';
    return itemsList.find(i => String(i.id) === String(selectedId))?.name || '';
  }, [itemsList, selectedId, compType]);

  return (
    <div className="space-y-6 animate-fadeIn pb-20">
      <Breadcrumb items={[{ label: 'التقارير' }, { label: 'نظام المقارنة الاحترافي' }]} />
      
      <PageHeader 
        title="نظام المقارنة الاحترافي" 
        icon={GitCompare} 
        description="أدوات تحليلية متقدمة للمقارنة بين الفترات الزمنية والجهات المختلفة بدقة عالية."
        actions={
          data.length > 0 && (
            <ExportMenu 
              ref={exportMenuRef}
              data={data} 
              columns={exportColumns} 
              onCustomExport={handleCustomExport}
              options={{ 
                title: `تقرير المقارنة - ${currentItemName}`, 
                fileName: 'comparison_report',
                subtitle: `${activeTab === 'trend' ? 'تحليل تطور زمني' : 'مقارنة بين جهتين'}`
              }} 
            />
          )
        }
      />

      {/* Main Switcher */}
      <div className="flex p-1 bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl w-fit no-print shadow-sm">
         <button onClick={() => { setActiveTab('trend'); setData([]); }}
            className={`px-8 py-3 rounded-xl text-sm font-black transition-all flex items-center gap-2 ${activeTab === 'trend' ? 'bg-[var(--color-primary)] shadow-lg text-white' : 'text-[var(--color-text-muted)] hover:text-[var(--color-primary)]'}`}>
            <LineIcon size={16} /> تحليل التطور الزمني
         </button>
         <button onClick={() => { setActiveTab('entity'); setData([]); }}
            className={`px-8 py-3 rounded-xl text-sm font-black transition-all flex items-center gap-2 ${activeTab === 'entity' ? 'bg-[var(--color-primary)] shadow-lg text-white' : 'text-[var(--color-text-muted)] hover:text-[var(--color-primary)]'}`}>
            <ArrowRightLeft size={16} /> مقارنة بين جهتين
         </button>
      </div>

      <Card className="p-6 border-none shadow-xl space-y-6 bg-[var(--color-bg-card)] no-print">
         <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Global Filters */}
            <div className="space-y-4">
               <h3 className="font-black text-sm text-[var(--color-primary)] flex items-center gap-2 uppercase tracking-widest">
                  <Calendar size={16} /> تحديد الفترة والصنف
               </h3>
               <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                     <label className="text-[10px] font-black text-[var(--color-text-muted)] uppercase mr-1">من شهر</label>
                     <input type="month" className="neu-input" value={range.start} onChange={e => setRange({...range, start: e.target.value})} />
                  </div>
                  <div className="space-y-1">
                     <label className="text-[10px] font-black text-[var(--color-text-muted)] uppercase mr-1">إلى شهر</label>
                     <input type="month" className="neu-input" value={range.end} onChange={e => setRange({...range, end: e.target.value})} />
                  </div>
               </div>
               
               <div className="flex flex-wrap gap-2">
                  <button onClick={() => { setCompType('drug'); setSelectedId(''); }}
                    className={`flex-1 min-w-[120px] py-3 rounded-xl text-[10px] font-black transition-all ${compType === 'drug' ? 'bg-[var(--color-primary)] text-white shadow-md' : 'bg-[var(--color-bg)] text-[var(--color-text-muted)]'}`}>
                    <Pill size={14} className="inline ml-1" /> أدوية
                  </button>
                  <button onClick={() => { setCompType('category'); setSelectedId(''); }}
                    className={`flex-1 min-w-[120px] py-3 rounded-xl text-[10px] font-black transition-all ${compType === 'category' ? 'bg-purple-600 text-white shadow-md' : 'bg-[var(--color-bg)] text-[var(--color-text-muted)]'}`}>
                    <Layers size={14} className="inline ml-1" /> تصنيفات
                  </button>
                  <button onClick={() => { setCompType('insulin'); setSelectedId(''); }}
                    className={`flex-1 min-w-[120px] py-3 rounded-xl text-[10px] font-black transition-all ${compType === 'insulin' ? 'bg-blue-600 text-white shadow-md' : 'bg-[var(--color-bg)] text-[var(--color-text-muted)]'}`}>
                    <Syringe size={14} className="inline ml-1" /> إنسولين
                  </button>
                  <button onClick={() => { setCompType('groups'); setSelectedId(''); }}
                    className={`flex-1 min-w-[120px] py-3 rounded-xl text-[10px] font-black transition-all ${compType === 'groups' ? 'bg-indigo-600 text-white shadow-md' : 'bg-[var(--color-bg)] text-[var(--color-text-muted)]'}`}>
                    <LayoutGrid size={14} className="inline ml-1" /> مجموعات
                  </button>
                  <button onClick={() => { setCompType('overall_cost'); setSelectedId('all'); }}
                    className={`flex-1 min-w-[120px] py-3 rounded-xl text-[10px] font-black transition-all ${compType === 'overall_cost' ? 'bg-cyan-600 text-white shadow-md' : 'bg-[var(--color-bg)] text-[var(--color-text-muted)]'}`}>
                    <TrendingUp size={14} className="inline ml-1" /> التكلفة الإجمالية
                  </button>
               </div>

               {compType !== 'overall_cost' && (
                 <AutoComplete
                   value={selectedId}
                   onChange={setSelectedId}
                   options={
                     compType === 'drug' ? drugsList : 
                     compType === 'category' ? categoriesList : 
                     compType === 'insulin' ? insulinList : groupsList
                   }
                   getOptionLabel={(i) => compType === 'insulin' && i.type ? `${i.name} (${i.type})` : i.name}
                   getOptionValue={(i) => String(i.id)}
                   placeholder={
                     compType === 'drug' ? 'ابحث عن دواء...' : 
                     compType === 'category' ? 'ابحث عن تصنيف...' : 
                     compType === 'insulin' ? 'ابحث عن إنسولين...' : 'ابحث عن مجموعة...'
                   }
                   label={null}
                 />
               )}
            </div>

            {/* Hierarchies */}
            <div className="space-y-4">
               <h3 className="font-black text-sm text-[var(--color-primary)] flex items-center gap-2 uppercase tracking-widest">
                  <MapPin size={16} /> تحديد النطاق الجغرافي
               </h3>
               <div className="flex flex-col gap-4">
                  <div className={`p-5 rounded-3xl border transition-all ${activeTab === 'entity' ? 'border-emerald-200 bg-emerald-50/5 shadow-inner' : 'border-[var(--color-border)]'}`}>
                     {activeTab === 'entity' && (
                        <div className="flex items-center gap-2 mb-4">
                           <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                           <p className="text-[11px] font-black text-emerald-600 uppercase">الجهة الأولى (أ)</p>
                        </div>
                     )}
                     {/* Force vertical layout for selectors inside these boxes by NOT using 'compact' or adding a wrapper if needed */}
                     <div className="hierarchy-comparison-wrapper">
                        <HierarchySelector compact onSelectionChange={d => setHierarchy1(prev => ({...prev, ...d}))} initialBranch={hierarchy1.branchId} hideMonth />
                     </div>
                  </div>
                  
                  {activeTab === 'entity' && (
                     <div className="p-5 rounded-3xl border border-blue-200 bg-blue-50/5 shadow-inner animate-slideDown transition-all">
                        <div className="flex items-center gap-2 mb-4">
                           <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                           <p className="text-[11px] font-black text-blue-600 uppercase">الجهة الثانية (ب)</p>
                        </div>
                        <div className="hierarchy-comparison-wrapper">
                           <HierarchySelector compact onSelectionChange={d => setHierarchy2(prev => ({...prev, ...d}))} initialBranch={hierarchy2.branchId} hideMonth />
                        </div>
                     </div>
                  )}
               </div>
            </div>
         </div>

         <div className="flex justify-center pt-4 border-t border-[var(--color-border)]">
            <Button variant="primary" icon={TrendingUp} onClick={handleFetch} loading={loading} className="px-20 h-14 rounded-2xl shadow-xl shadow-primary/20 font-black text-lg bg-[var(--color-primary)]">
               توليد تقرير المقارنة
            </Button>
         </div>
      </Card>

      {/* Analysis Results */}
      {data.length > 0 && (
        <div className="space-y-6 animate-slideUp">
           {/* Visual Section */}
           <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 no-print">
              <Card className="p-6 border-none shadow-lg">
                 <h3 className="font-black text-sm text-[var(--color-text)] mb-6 flex items-center gap-2">
                    <BarChart3 size={18} className="text-[var(--color-primary)]" />
                    تحليل التكاليف المقارن
                 </h3>
                 <div ref={chartRef} style={{ width: '100%', height: 300, background: '#ffffff', padding: '10px' }}>
                    <ResponsiveContainer>
                       {activeTab === 'trend' ? (
                          <LineChart data={data}>
                             <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
                             <XAxis dataKey="month" tick={{ fontSize: 10, fontWeight: 'bold' }} interval="preserveStartEnd" />
                             <YAxis hide />
                             <Tooltip contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 10px 15px rgba(0,0,0,0.1)' }} />
                             <Line type="monotone" dataKey="cost" stroke="var(--color-primary)" strokeWidth={4} dot={{ r: 6, fill: 'white', stroke: 'var(--color-primary)', strokeWidth: 2 }} />
                          </LineChart>
                       ) : (
                          <BarChart data={data}>
                             <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
                             <XAxis dataKey="label" tick={{ fontSize: 11, fontWeight: 'bold' }} interval={0} />
                             <YAxis hide />
                             <Tooltip cursor={{ fill: 'transparent' }} contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 10px 15px rgba(0,0,0,0.1)' }} />
                             <Bar dataKey="cost" radius={[8, 8, 0, 0]} barSize={50}>
                                {data.map((_, i) => <Cell key={i} fill={i === 0 ? '#10b981' : '#3b82f6'} />)}
                             </Bar>
                          </BarChart>
                       )}
                    </ResponsiveContainer>
                 </div>
              </Card>

              <Card className="p-8 border-none shadow-lg flex flex-col justify-center items-center text-center bg-gradient-to-br from-slate-800 to-slate-900 text-white relative overflow-hidden">
                 <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-3xl -mr-16 -mt-16" />
                 <Info size={40} className="mb-4 opacity-20" />
                 <h3 className="text-xs font-black opacity-50 uppercase tracking-[0.2em] mb-4">ملخص التحليل</h3>
                 <div className="space-y-6">
                    <div>
                       <p className="text-[10px] opacity-60">إجمالي التكلفة</p>
                       <h2 className="text-4xl font-black text-emerald-400">
                          {data.reduce((s, r) => s + r.cost, 0).toLocaleString()} <span className="text-sm">ج.م</span>
                       </h2>
                    </div>
                    <div className="flex gap-8">
                       {!(compType === 'groups' || compType === 'overall_cost') && (
                          <>
                             <div>
                                <p className="text-[10px] opacity-60">إجمالي الكمية</p>
                                <p className="text-xl font-bold">{data.reduce((s, r) => s + (r.quantity || 0), 0).toLocaleString()}</p>
                             </div>
                             <div>
                                <p className="text-[10px] opacity-60">إجمالي الحالات</p>
                                <p className="text-xl font-bold">{data.reduce((s, r) => s + (r.cases || 0), 0).toLocaleString()}</p>
                             </div>
                          </>
                       )}
                    </div>
                 </div>
              </Card>
           </div>

           {/* Detailed Table */}
           <Card className="p-0 overflow-hidden shadow-2xl border-none print:shadow-none">
              <div className="bg-[var(--color-bg)] px-6 py-4 border-b border-[var(--color-border)] flex items-center justify-between print:hidden">
                 <h3 className="font-black text-[var(--color-text)]">جدول المقارنة التفصيلي</h3>
                 <span className="badge badge-primary">{currentItemName}</span>
              </div>
              
              <div className="print:hidden">
                <Table 
                   columns={columns} 
                   data={data} 
                   loading={loading}
                   actions={false}
                />
              </div>

              <div className="hidden print:block">
                <PrintableTable
                   title={`تقرير المقارنة - ${currentItemName}`}
                   subtitle={`${activeTab === 'trend' ? 'تحليل تطور زمني' : 'مقارنة بين جهتين'}`}
                   hierarchyLabel={buildHierarchyLabel(workspaceMode, hierarchyNames)}
                >
                  <Table 
                     columns={columns} 
                     data={data} 
                     loading={loading}
                     actions={false}
                  />
                </PrintableTable>
              </div>
           </Card>
        </div>
      )}

      {data.length === 0 && !loading && (
        <Card className="p-32 flex flex-col items-center justify-center text-center opacity-30">
           <GitCompare size={64} className="mb-4 text-slate-300" />
           <p className="font-black text-slate-400">يرجى تحديد المعايير من الأعلى والضغط على "توليد تقرير المقارنة"</p>
        </Card>
      )}
    </div>
  );
};

export default ComparisonReportsPage;
