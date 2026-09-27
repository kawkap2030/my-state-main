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
  TrendingUp, Calculator, 
  DollarSign, Wallet, CreditCard, ShieldCheck, Search
} from 'lucide-react';

const FinancialReportsPage = () => {
  const toast = useToast();
  const { workspaceMode, hierarchyNames } = useGlobalApp();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState([]);
  const [hierarchy, setHierarchy] = useState({ branchId: '', areaId: '', clinicId: '', dispenseMonth: new Date().toISOString().substring(0, 7) });
  // Ref to the toolbar ExportMenu — Ctrl+P opens the EXACT same PrintPreviewModal
  // that ExportMenu → "طباعة التقرير" opens (shared imperative API, no native
  // WebView2 print dialog, no window.print() path).
  const exportMenuRef = React.useRef(null);
  useReportPrintShortcut(exportMenuRef);

  const handleFetch = async () => {
    if (!hierarchy.branchId) {
      toast.warning('يرجى اختيار الفرع على الأقل');
      return;
    }
    setLoading(true);
    try {
      const result = await invoke('get_financial_report', {
        branchId: hierarchy.branchId ? parseInt(hierarchy.branchId) : null,
        areaId: hierarchy.areaId ? parseInt(hierarchy.areaId) : null,
        clinicId: hierarchy.clinicId ? parseInt(hierarchy.clinicId) : null,
        dispenseMonth: hierarchy.dispenseMonth
      });
      setData(result);
      toast.success('تم تحديث البيانات المالية');
    } catch (err) {
      console.error(err);
      toast.error(`فشل في تحميل التقرير: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  const exportColumns = [
    { header: 'البند المالي', exportAccessor: (r) => r.item },
    { header: 'القيمة المالية', exportAccessor: (r) => `${parseFloat(r.value).toLocaleString()} ج.م` },
  ];

  // --- Financial Calculations ---
  const financialStats = useMemo(() => {
    const stats = {
      patientShare: 0,
      freeDispensed: 0,
      supportedDispensed: 0,
      totalCosts: 0
    };

    data.forEach(row => {
      const val = parseFloat(row.value) || 0;
      if (row.item.includes('حصة المريض')) stats.patientShare = val;
      else if (row.item.includes('المجاني')) stats.freeDispensed = val;
      else if (row.item.includes('المدعم')) stats.supportedDispensed = val;
      else stats.totalCosts += val;
    });

    return stats;
  }, [data]);

  return (
    <div className="space-y-6 animate-fadeIn pb-20">
      <Breadcrumb items={[{ label: 'التقارير' }, { label: 'الرقابة والتقارير المالية' }]} />
      
      <PageHeader 
        title="الرقابة والتقارير المالية" 
        icon={TrendingUp} 
        description="تحليل التدفقات المالية، المبالغ المحصلة، وقيم الدعم الكلية للمنظومة."
        actions={
          <ExportMenu ref={exportMenuRef} data={data} columns={exportColumns} options={{ title: 'الرقابة والتقارير المالية', fileName: 'financial_report', subtitle: 'تحليل التدفقات المالية' }} />
        }
      />

      {/* Financial Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="p-6 bg-gradient-to-br from-emerald-600 to-emerald-700 text-white border-none shadow-lg relative overflow-hidden group">
          <div className="absolute -right-2 -bottom-2 opacity-10 group-hover:scale-110 transition-transform duration-500">
             <Wallet size={100} />
          </div>
          <div className="flex justify-between items-start mb-4 relative z-10">
            <div className="p-2 bg-white/20 rounded-lg"><CreditCard size={20} /></div>
            <span className="text-[10px] font-bold uppercase tracking-widest opacity-60">إجمالي المحصل (نقدي)</span>
          </div>
          <h2 className="text-3xl font-black relative z-10">{financialStats.patientShare.toLocaleString()} <span className="text-sm">ج.م</span></h2>
          <p className="text-[10px] mt-2 opacity-60 relative z-10">إجمالي مبالغ "حصة المريض" المسددة</p>
        </Card>

        <Card className="p-6 bg-[var(--color-bg-card)] border border-[var(--color-border)] shadow-sm">
          <div className="flex justify-between items-start mb-4">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-lg"><ShieldCheck size={20} /></div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--color-text-muted)]">إجمالي الدعم (الهيئة)</span>
          </div>
          <h2 className="text-3xl font-black text-[var(--color-text)]">{(financialStats.supportedDispensed + financialStats.freeDispensed).toLocaleString()} <span className="text-sm font-normal opacity-30">ج.م</span></h2>
          <p className="text-[10px] mt-2 text-[var(--color-text-muted)]">مجموع قيم المنصرف المجاني والمدعم</p>
        </Card>

        <Card className="p-6 bg-[var(--color-bg-card)] border border-[var(--color-border)] shadow-sm">
          <div className="flex justify-between items-start mb-4">
            <div className="p-2 bg-rose-50 text-rose-600 rounded-lg"><TrendingUp size={20} /></div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--color-text-muted)]">إجمالي تكلفة التشغيل</span>
          </div>
          <h2 className="text-3xl font-black text-[var(--color-text)]">{financialStats.totalCosts.toLocaleString()} <span className="text-sm font-normal opacity-30">ج.م</span></h2>
          <p className="text-[10px] mt-2 text-[var(--color-text-muted)]">تكاليف الأصناف الفعلية (أدوية/إنسولين/أحكام)</p>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1 p-6 space-y-4 shadow-sm border-none no-print">
          <h3 className="font-bold text-[var(--color-text)] border-b border-[var(--color-border)] pb-3 mb-4 flex items-center gap-2">
            <Calculator size={18} className="text-cyan-600" /> معايير التقرير المالي
          </h3>
          <HierarchySelector 
            compact
            onSelectionChange={(d) => setHierarchy(prev => ({ ...prev, ...d }))}
            initialBranch={hierarchy.branchId}
            initialArea={hierarchy.areaId}
            initialClinic={hierarchy.clinicId}
            initialMonth={hierarchy.dispenseMonth}
          />
          <Button variant="primary" className="w-full h-12 shadow-lg shadow-cyan-100" onClick={handleFetch} loading={loading}>
            تحديث البيانات المالية
          </Button>
          
          <div className="pt-4 mt-4 border-t border-slate-100">
             <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-500/10 text-amber-500 text-[10px] font-medium leading-relaxed">
                <span>⚠ تنبيه: يتم احتساب القيم المالية بناءً على سجلات الصرف الشهرية المعتمدة فقط.</span>
             </div>
          </div>
        </Card>

        <Card className="lg:col-span-2 p-0 overflow-hidden shadow-2xl border-none ring-1 ring-slate-100 print:shadow-none print:ring-0">
          <div className="bg-[var(--color-bg-card)] p-5 border-b border-[var(--color-border)] flex items-center justify-between print:hidden">
            <h3 className="font-black text-[var(--color-text)] flex items-center gap-2">
              <DollarSign size={20} className="text-emerald-600" /> 
              بنود الرقابة المالية
            </h3>
            <div className="flex items-center gap-4 text-[10px] font-bold text-slate-400 no-print">
               <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-emerald-500"></div> إيراد</div>
               <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-blue-500"></div> دعم</div>
               <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-rose-500"></div> مصروف</div>
            </div>
          </div>
          
          <div className="print:hidden">
             <Table 
               columns={[
                 { 
                   header: 'البند المالي', 
                   render: (row) => (
                      <div className="flex items-center gap-3">
                         <div className={`w-2 h-8 rounded-full ${row.item.includes('المحصل') ? 'bg-emerald-500' : row.item.includes('تكلفة') ? 'bg-rose-500' : 'bg-blue-500'}`}></div>
                         <span className="font-bold text-[var(--color-text)]">{row.item}</span>
                      </div>
                   )
                 },
                 { 
                   header: 'القيمة المالية', 
                   render: (row) => (
                     <div className="flex flex-col items-end">
                       <span className="font-black text-[var(--color-text)] text-lg">
                         {parseFloat(row.value).toLocaleString()} <span className="text-[10px] font-normal text-slate-400">ج.م</span>
                       </span>
                     </div>
                   )
                 }
               ]}
               data={data}
               loading={loading}
               actions={false}
             />
          </div>

          <div className="hidden print:block">
             <PrintableTable title="الرقابة والتقارير المالية" subtitle="تحليل التدفقات المالية" hierarchyLabel={buildHierarchyLabel(workspaceMode, hierarchyNames)}>
                <Table 
                   columns={[
                     { 
                       header: 'البند المالي', 
                       render: (row) => (
                          <div className="flex items-center gap-3">
                             <div className={`w-2 h-8 rounded-full ${row.item.includes('المحصل') ? 'bg-emerald-500' : row.item.includes('تكلفة') ? 'bg-rose-500' : 'bg-blue-500'}`}></div>
                             <span className="font-bold text-[var(--color-text)]">{row.item}</span>
                          </div>
                       )
                     },
                     { 
                       header: 'القيمة المالية', 
                       render: (row) => (
                         <div className="flex flex-col items-end">
                           <span className="font-black text-[var(--color-text)] text-lg">
                             {parseFloat(row.value).toLocaleString()} <span className="text-[10px] font-normal text-slate-400">ج.م</span>
                           </span>
                         </div>
                       )
                     }
                   ]}
                   data={data}
                   loading={loading}
                   actions={false}
                />
             </PrintableTable>
          </div>
          
          {data.length === 0 && !loading && (
            <div className="p-32 text-center flex flex-col items-center gap-4">
              <div className="w-20 h-20 rounded-full bg-slate-50 flex items-center justify-center text-slate-200">
                 <Calculator size={40} />
              </div>
              <p className="text-slate-400 italic font-medium">حدد المعايير واضغط تحديث لعرض التحليل المالي.</p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};

export default FinancialReportsPage;
