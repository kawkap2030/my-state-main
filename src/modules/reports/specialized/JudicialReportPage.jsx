import React, { useState, useMemo } from 'react';
import PageHeader from '../../../components/ui/PageHeader';
import Breadcrumb from '../../../components/ui/Breadcrumb';
import HierarchySelector from '../../../components/common/HierarchySelector';
import Card from '../../../components/ui/Card';
import Button from '../../../components/ui/Button';
import Table from '../../../components/ui/Table';
import ExportMenu from '../../../components/ui/ExportMenu';
import { useToast } from '../../../components/ui/Toast';
import { useGlobalApp } from '../../../context/useGlobalApp';
import invoke from '../../../api/tauriApi';
import { 
  Landmark, Search, Scale, 
  Users, DollarSign, AlertTriangle, FileText,
  BarChart3, BarChart as BarChartIcon, TrendingUp
} from 'lucide-react';
import { 
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend,
  Cell
} from 'recharts';
import { exportMultiSheetExcel, exportToWord, exportToPDF } from '../../../utils/exportUtils';
import PrintableTable from '../../../components/common/PrintableTable';
import { buildHierarchyLabel } from '../../../utils/reportUtils';
import { toPng } from 'html-to-image';

const JudicialReportPage = () => {
  const toast = useToast();
  const { activeHierarchy, workspaceMode, hierarchyNames } = useGlobalApp();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState([]);
  const [hierarchy, setHierarchy] = useState({ 
    branchId: activeHierarchy.branchId || '', 
    areaId: activeHierarchy.areaId || '', 
    clinicId: activeHierarchy.clinicId || '', 
    dispenseMonth: activeHierarchy.dispenseMonth || new Date().toISOString().substring(0, 7) 
  });
  const chartRef = React.useRef(null);

  const handleFetch = async () => {
    if (!hierarchy.branchId) {
      setData([]);
      return;
    }
    setLoading(true);
    try {
      const records = await invoke('get_judicial_dispensed', {
        branchId: parseInt(hierarchy.branchId),
        areaId: hierarchy.areaId ? parseInt(hierarchy.areaId) : null,
        clinicId: hierarchy.clinicId ? parseInt(hierarchy.clinicId) : null,
        dispenseMonth: hierarchy.dispenseMonth
      });
      setData(records);
    } catch (err) {
      toast.error(`خطأ: ${err}`);
    } finally {
      setLoading(false);
    }
  };

   
  React.useEffect(() => {
    handleFetch();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hierarchy.branchId, hierarchy.areaId, hierarchy.clinicId, hierarchy.dispenseMonth]);

  const stats = useMemo(() => {
    let total = 0;
    let patients = new Set();
    data.forEach(r => {
      total += r.monthly_cost;
      patients.add(r.patient_id);
    });
    return { totalCost: total, patientCount: patients.size };
  }, [data]);

  const columns = [
    { 
      header: 'اسم المريض والتشخيص', 
      render: (row) => (
        <div className="flex flex-col">
          <span className="font-bold text-[var(--color-text)]">{row.patient_name || 'مريض رقم ' + row.patient_id}</span>
          <span className="text-[10px] text-[var(--color-text-muted)] truncate max-w-[200px]" title={row.diagnosis}>{row.diagnosis}</span>
        </div>
      )
    },
    { header: 'الدواء المنصرف', render: (row) => <span className="text-[var(--color-text)] font-medium">{row.medicine_name}</span> },
    { header: 'الجرعة', render: (row) => <span className="font-mono text-[var(--color-text-muted)]">{row.monthly_dose} {row.unit}</span> },
    { 
      header: 'التكلفة الشهرية', 
      render: (row) => (
        <span className="font-black text-[var(--color-danger)]">
          {row.monthly_cost.toLocaleString()} ج.م
        </span>
      )
    }
  ];

  const exportColumns = [
    { header: 'اسم المريض', exportAccessor: (r) => r.patient_name || 'مريض رقم ' + r.patient_id },
    { header: 'التشخيص', exportAccessor: (r) => r.diagnosis },
    { header: 'الدواء المنصرف', exportAccessor: (r) => r.medicine_name },
    { header: 'الجرعة', exportAccessor: (r) => `${r.monthly_dose} ${r.unit}` },
    { header: 'التكلفة الشهرية', exportAccessor: (r) => r.monthly_cost },
  ];

  const chartData = useMemo(() => {
    const medMap = {};
    data.forEach(r => {
      medMap[r.medicine_name] = (medMap[r.medicine_name] || 0) + r.monthly_cost;
    });
    return Object.entries(medMap)
      .map(([name, cost]) => ({ name, cost }))
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 8);
  }, [data]);

  const handlePremiumExport = async (type, { data, options }) => {
    try {
      let chartImage = null;
      if (chartRef.current) chartImage = await toPng(chartRef.current, { quality: 0.85, pixelRatio: 1, backgroundColor: '#ffffff' });
      const enrichedOptions = { ...options, chartImage };
      if (type === 'excel') {
        const sheetsData = { 'تحليل الأحكام': { data: data, columns: exportColumns, options: enrichedOptions } };
        const globalOptions = {
          fileName: 'judicial_premium_report',
          title: 'تقرير الأحكام القضائية',
          summaryData: {
            headers: ['الإحصائية', 'القيمة'],
            rows: [['إجمالي التكلفة', `${stats.totalCost.toLocaleString()} ج.م`], ['عدد الحالات', stats.patientCount]]
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
          { indicator: 'عدد الحالات', val: stats.patientCount },
        ],
        columns: [
          { header: 'المؤشر', accessor: 'indicator' },
          { header: 'القيمة', accessor: 'val' },
        ],
        title: 'ملخص التقرير',
      };
      const multiTables = [summaryTable, { data, columns: exportColumns, title: 'تفاصيل الأحكام القضائية' }];
      const wordPdfOptions = { ...enrichedOptions, tables: multiTables };
      if (type === 'word') { await exportToWord(data, exportColumns, wordPdfOptions); toast.success('تم تصدير Word بنجاح'); return true; }
      if (type === 'pdf') { await exportToPDF(data, exportColumns, wordPdfOptions); toast.success('تم تصدير PDF بنجاح'); return true; }
      return false;
    } catch (err) { console.error(err); return false; }
  };

  return (
    <PrintableTable title="تقرير الأحكام القضائية" subtitle={hierarchy.dispenseMonth ? `شهر ${hierarchy.dispenseMonth}` : ''} hierarchyLabel={buildHierarchyLabel(workspaceMode, hierarchyNames)}>
      <div className="space-y-6 animate-fadeIn pb-20">
      <Breadcrumb items={[{ label: 'التقارير' }, { label: 'تقرير الأحكام القضائية' }]} />
      
      <PageHeader 
        title="تقرير الأحكام القضائية" 
        icon={Landmark} 
        description="متابعة مالية دقيقة لمنصرف الأدوية الصادر بها أحكام قضائية وتكلفة كل مريض."
        actions={<ExportMenu data={data} columns={exportColumns} onCustomExport={handlePremiumExport} options={{ title: 'تقرير الأحكام القضائية', fileName: 'judicial_report' }} />}
      />

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
        </div>
      </Card>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="p-8 bg-gradient-to-br from-rose-700 to-rose-900 text-white border-none shadow-2xl relative overflow-hidden group">
          <Scale className="absolute -right-6 -bottom-6 opacity-10 group-hover:scale-110 transition-transform duration-500" size={150} />
          <p className="text-xs opacity-60 mb-2 font-bold uppercase tracking-widest">إجمالي تكلفة الأحكام</p>
          <h2 className="text-5xl font-black">{stats.totalCost.toLocaleString()} <span className="text-lg">ج.م</span></h2>
        </Card>
        <Card className="p-8 bg-[var(--color-bg-card)] border-none shadow-md flex items-center justify-between">
           <div>
              <p className="text-xs text-[var(--color-text-muted)] mb-2 font-bold uppercase tracking-widest">عدد المرضى المستفيدين</p>
              <h2 className="text-5xl font-black text-[var(--color-text)]">{stats.patientCount} <span className="text-lg opacity-20">حالة</span></h2>
           </div>
           <div className="w-16 h-16 rounded-full bg-[var(--color-danger-bg)] flex items-center justify-center text-[var(--color-danger)]"><Users size={32} /></div>
        </Card>
      </div>

      {/* Table Section */}
      <Card className="p-0 overflow-hidden shadow-2xl border-none">
        <Table columns={columns} data={data} loading={loading} />
        {data.length === 0 && !loading && (
          <div className="p-32 text-center text-slate-300 italic">بانتظار اختيار المعايير وتوليد بيانات الأحكام...</div>
        )}
      </Card>

      {/* Charts Section */}
      {data.length > 0 && (
        <Card className="p-6 mt-6 shadow-xl border-none no-print">
          <div className="h-[400px] w-full" dir="ltr" ref={chartRef}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ bottom: 60 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" opacity={0.5} />
                <XAxis dataKey="name" angle={-45} textAnchor="end" height={60} tick={{ fontSize: 10 }} />
                <YAxis />
                <RechartsTooltip />
                <Bar dataKey="cost" name="التكلفة" radius={[4, 4, 0, 0]} fill="#be123c" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

    </div>
    </PrintableTable>
  );
};

export default JudicialReportPage;
