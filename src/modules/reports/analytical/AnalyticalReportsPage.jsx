import React, { useState, useMemo } from 'react';
import PageHeader from '../../../components/ui/PageHeader';
import Breadcrumb from '../../../components/ui/Breadcrumb';
import HierarchySelector from '../../../components/common/HierarchySelector';
import Card from '../../../components/ui/Card';
import Button from '../../../components/ui/Button';
import Table from '../../../components/ui/Table';
import PrintableTable from '../../../components/common/PrintableTable';
import ExportMenu from '../../../components/ui/ExportMenu';
import useReportPrintShortcut from '../../../hooks/useReportPrintShortcut';
import { useToast } from '../../../components/ui/Toast';
import invoke from '../../../api/tauriApi';
import { useGlobalApp } from '../../../context/useGlobalApp';
import { buildHierarchyLabel } from '../../../utils/reportUtils';
import { 
  BarChart3, Search, 
  DollarSign, Users, TrendingUp, Pill, Syringe, FileText 
} from 'lucide-react';

const AnalyticalReportsPage = () => {
  const toast = useToast();
  const { workspaceMode, hierarchyNames } = useGlobalApp();
  const [hierarchy, setHierarchy] = useState({
    branchId: '', areaId: '', clinicId: '',
    dispenseMonth: new Date().toISOString().substring(0, 7)
  });
  
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  // Ref to the toolbar ExportMenu — Ctrl+P opens the EXACT same PrintPreviewModal
  // that ExportMenu → "طباعة التقرير" opens (shared imperative API, no native
  // WebView2 print dialog, no window.print() path).
  const exportMenuRef = React.useRef(null);
  useReportPrintShortcut(exportMenuRef);

  const handleGenerate = async () => {
    if (!hierarchy.branchId) {
      toast.warning('يرجى اختيار الفرع على الأقل');
      return;
    }
    setLoading(true);
    try {
      const result = await invoke('get_analytical_report', {
        branchId: hierarchy.branchId ? parseInt(hierarchy.branchId) : null,
        areaId: hierarchy.areaId ? parseInt(hierarchy.areaId) : null,
        clinicId: hierarchy.clinicId ? parseInt(hierarchy.clinicId) : null,
        dispenseMonth: hierarchy.dispenseMonth
      });
      setData(result);
      toast.success('تم تحميل التقرير بنجاح');
    } catch (err) {
      console.error(err);
      toast.error(`فشل في تحميل التقرير: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  const exportColumns = [
    { header: 'البيان الإحصائي', exportAccessor: (r) => r.name },
    { header: 'العدد / الحالات', exportAccessor: (r) => r.count },
    { header: 'القيمة الإجمالية', exportAccessor: (r) => r.value !== '-' ? `${parseFloat(r.value).toLocaleString()} ج.م` : '--' },
  ];

  // --- Calculate Summary Stats & Insights ---
  const { summaryStats, insights, filteredData } = useMemo(() => {
    // 1. Filtering
    const filtered = data.filter(row => 
      row.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (data.length === 0) return { 
      summaryStats: { totalValue: 0, totalCases: 0, mostExpensive: '--' }, 
      insights: [],
      filteredData: []
    };
    
    let totalValue = 0;
    let totalCases = 0;
    let maxVal = -1;
    let expensiveName = '--';

    data.forEach(row => {
      const val = parseFloat(row.value);
      if (!isNaN(val)) {
        totalValue += val;
        if (val > maxVal) {
          maxVal = val;
          expensiveName = row.name;
        }
      }
      const count = parseInt(row.count);
      if (!isNaN(count)) totalCases += count;
    });

    // 2. Generating Smart Insights
    const generatedInsights = [];
    if (totalValue > 50000) {
      generatedInsights.push({ 
        type: 'warning', 
        text: `تنبيه: إجمالي التكلفة لهذا الشهر مرتفع (${totalValue.toLocaleString()} ج.م)، يرجى مراجعة الأصناف الأكثر صرفاً.` 
      });
    } else {
      generatedInsights.push({ 
        type: 'info', 
        text: `حالة الاستهلاك مستقرة ضمن المعدلات الطبيعية لهذا النطاق.` 
      });
    }

    if (expensiveName.includes('أنسولين')) {
      generatedInsights.push({ 
        type: 'info', 
        text: `ملاحظة: الإنسولين يمثل الحصة الأكبر من القيمة المالية في هذا التقرير.` 
      });
    }

    return { 
      summaryStats: { totalValue, totalCases, mostExpensive: expensiveName },
      insights: generatedInsights,
      filteredData: filtered
    };
  }, [data, searchTerm]);

  const columns = [
    { 
      header: 'البيان الإحصائي', 
      render: (row) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-cyan-50 flex items-center justify-center text-cyan-600">
            {row.name.includes('أدوية') ? <Pill size={16} /> : 
             row.name.includes('أنسولين') ? <Syringe size={16} /> : 
             row.name.includes('تذاكر') ? <FileText size={16} /> : <BarChart3 size={16} />}
          </div>
          <span className="font-bold text-[var(--color-text)]">{row.name}</span>
        </div>
      )
    },
    { 
      header: 'العدد / الحالات', 
      render: (row) => (
        <div className="flex flex-col">
          <span className="font-mono font-bold text-[var(--color-text-muted)]">{row.count}</span>
          {parseInt(row.count) > 1000 && <span className="text-[8px] text-amber-500 font-black uppercase">كثافة عالية</span>}
        </div>
      )
    },
    { 
      header: 'القيمة الإجمالية', 
      render: (row) => {
        const val = parseFloat(row.value);
        const isHigh = val > 15000;
        return row.value !== '-' ? (
          <div className="flex flex-col items-end">
            <span className={`font-black ${isHigh ? 'text-red-500' : 'text-emerald-600'}`}>
              {val.toLocaleString()} ج.م
            </span>
            {isHigh && <div className="w-full h-1 bg-red-100 rounded-full mt-1 overflow-hidden"><div className="bg-red-500 h-full w-3/4"></div></div>}
          </div>
        ) : <span className="text-slate-300">--</span>;
      }
    },
  ];

  return (
    <div className="space-y-6 animate-fadeIn pb-20">
      <div className="no-print space-y-6">
        <Breadcrumb items={[{ label: 'التقارير' }, { label: 'التحليل الإحصائي العام' }]} />
        
        <PageHeader 
          title="التحليل الإحصائي العام" 
          icon={BarChart3} 
          description="لوحة تحليلية متكاملة لرصد حركة المنصرف والعمليات بدقة متناهية."
          actions={
            <ExportMenu ref={exportMenuRef} data={filteredData} columns={exportColumns} options={{ title: 'التحليل الإحصائي العام', fileName: 'analytical_report', subtitle: 'لوحة تحليلية متكاملة لرصد حركة المنصرف' }} />
          }
        />
      </div>

      {/* Smart Insights Section */}
      {insights.length > 0 && (
        <div className="grid grid-cols-1 gap-3 no-print">
          {insights.map((insight, idx) => (
            <div 
              key={idx} 
              className={`p-3 px-5 rounded-2xl flex items-center gap-3 border animate-slideUp
                ${insight.type === 'warning' ? 'bg-amber-50/10 border-amber-500/30 text-amber-500' : 'bg-cyan-50/10 border-cyan-500/30 text-cyan-500'}`}
            >
              <div className={`w-8 h-8 rounded-full flex items-center justify-center
                ${insight.type === 'warning' ? 'bg-amber-200' : 'bg-cyan-200'}`}>
                <TrendingUp size={16} />
              </div>
              <p className="text-sm font-bold">{insight.text}</p>
            </div>
          ))}
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 print-stats-grid">
        <Card className="p-6 bg-[var(--color-primary-dark)] text-white border-none shadow-2xl relative overflow-hidden group">
          <div className="absolute -right-4 -bottom-4 opacity-10 group-hover:scale-110 transition-transform duration-500">
             <DollarSign size={120} />
          </div>
          <div className="flex justify-between items-start mb-4 relative z-10">
            <div className="p-2 bg-white/10 rounded-lg"><DollarSign size={20} className="text-emerald-400" /></div>
            <span className="text-[10px] font-bold uppercase tracking-widest opacity-60">إجمالي التكلفة المالية</span>
          </div>
          <h2 className="text-4xl font-black relative z-10">{summaryStats.totalValue.toLocaleString()} <span className="text-sm font-normal opacity-50">ج.م</span></h2>
          <div className="mt-4 flex items-center gap-2 relative z-10">
             <span className="text-[10px] p-1 px-2 rounded-full bg-emerald-500/20 text-emerald-400 font-bold">MoM +2.4%</span>
             <p className="text-[9px] opacity-40">مقارنة بالشهر السابق</p>
          </div>
        </Card>

        <Card className="p-6 bg-[var(--color-bg-card)] border border-[var(--color-border)] shadow-sm hover:shadow-md transition-shadow">
          <div className="flex justify-between items-start mb-4">
            <div className="p-2 bg-cyan-50 text-cyan-600 rounded-lg"><Users size={20} /></div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--color-text-muted)]">إجمالي الحالات</span>
          </div>
          <h2 className="text-3xl font-black text-[var(--color-text)]">{summaryStats.totalCases.toLocaleString()} <span className="text-sm font-normal opacity-30">حالة</span></h2>
          <p className="text-[10px] mt-2 text-[var(--color-text-muted)]">مجموع أعداد التذاكر والحالات المسجلة</p>
        </Card>

        <Card className="p-6 bg-[var(--color-bg-card)] border border-[var(--color-border)] shadow-sm hover:shadow-md transition-shadow">
          <div className="flex justify-between items-start mb-4">
            <div className="p-2 bg-purple-50 text-purple-600 rounded-lg"><TrendingUp size={20} /></div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--color-text-muted)]">البند الأعلى صرفاً</span>
          </div>
          <h2 className="text-xl font-black text-[var(--color-text)] truncate" title={summaryStats.mostExpensive}>{summaryStats.mostExpensive}</h2>
          <p className="text-[10px] mt-2 text-[var(--color-text-muted)]">البند الذي سجل أعلى قيمة مالية</p>
        </Card>
      </div>

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
        
        <div className="flex flex-col md:flex-row items-center justify-end gap-4 pt-4 border-t border-slate-100 dark:border-slate-800">
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

      {/* Main Table Section */}
      <Card className="p-0 overflow-hidden shadow-2xl border-none ring-1 ring-slate-100 print:shadow-none print:ring-0">
        <div className="bg-[var(--color-bg-card)] p-5 border-b border-[var(--color-border)] flex flex-col md:flex-row md:items-center justify-between gap-4 print:hidden">
          <div>
            <h3 className="font-black text-[var(--color-text)] flex items-center gap-2">
              <Search size={20} className="text-cyan-600" /> 
              تفاصيل السجلات الإحصائية
            </h3>
            <p className="text-[10px] text-[var(--color-text-muted)] mt-1">عرض البيانات المفصلة للنطاق المختار</p>
          </div>
          
          <div className="relative no-print">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" size={14} />
             <input 
               type="text" 
               placeholder="بحث سريع في النتائج..."
                className="pr-10 pl-4 py-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text)] text-sm focus:ring-2 focus:ring-cyan-500/20 outline-none transition-all w-full md:w-64"
               value={searchTerm}
               onChange={(e) => setSearchTerm(e.target.value)}
             />
          </div>
        </div>

        <div className="p-1 print:hidden">
          <Table 
            columns={columns} 
            data={filteredData} 
            loading={loading}
            actions={false}
          />
        </div>

        <div className="hidden print:block">
           <PrintableTable title="التحليل الإحصائي العام" subtitle="لوحة تحليلية متكاملة لرصد حركة المنصرف" hierarchyLabel={buildHierarchyLabel(workspaceMode, hierarchyNames)}>
              <Table 
                columns={columns} 
                data={filteredData} 
                loading={loading}
                actions={false}
              />
           </PrintableTable>
        </div>

        {filteredData.length === 0 && !loading && (
          <div className="p-24 text-center flex flex-col items-center gap-4">
            <div className="w-20 h-20 rounded-full bg-slate-50 flex items-center justify-center text-slate-200 animate-pulse">
               <BarChart3 size={40} />
            </div>
            <p className="text-slate-400 italic font-medium">بانتظار اختيار الفلاتر لتوليد البيانات...</p>
          </div>
        )}
      </Card>
    </div>
  );
};

export default AnalyticalReportsPage;
