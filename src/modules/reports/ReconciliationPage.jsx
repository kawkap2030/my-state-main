import React, { useState, useEffect, useMemo } from "react";
import { Scale, RefreshCw, CheckCircle, XCircle, AlertCircle, TrendingUp, BarChart3, Activity, Layers } from "lucide-react";
import invoke from "../../api/tauriApi";
import { useToast } from "../../components/ui/Toast";
import PageHeader from "../../components/ui/PageHeader";
import Breadcrumb from "../../components/ui/Breadcrumb";
import HierarchySelector from "../../components/common/HierarchySelector";
import Card from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import ExportMenu from "../../components/ui/ExportMenu";
import PrintPreviewModal from "../../components/common/PrintPreviewModal";
import PrintableTable from "../../components/common/PrintableTable";
import { exportMultiSheetExcel } from "../../utils/exportUtils";

const CATEGORY_LABELS = {
  drugs: { label: "الأدوية", color: "bg-cyan-100 text-cyan-700", icon: "💊" },
  supplies: { label: "المستلزمات", color: "bg-violet-100 text-violet-700", icon: "🩹" },
  insulin: { label: "الإنسولين", color: "bg-amber-100 text-amber-700", icon: "💉" },
  judicial: { label: "الأحكام القضائية", color: "bg-rose-100 text-rose-700", icon: "⚖️" },
  tickets: { label: "التذاكر الطبية", color: "bg-emerald-100 text-emerald-700", icon: "🎫" },
  summary: { label: "الإجمالي الكلي", color: "bg-slate-200 text-slate-900", icon: "🎯" },
};

const ReconciliationPage = () => {
  const [hierarchy, setHierarchy] = useState({
    branchId: "",
    dispenseMonth: new Date().toISOString().substring(0, 7),
  });
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showPrintPreview, setShowPrintPreview] = useState(false);
  const [activeCategory, setActiveCategory] = useState("all");
  const toast = useToast();

  // Group data for multi-sheet export
  const groupedData = useMemo(() => {
    if (!data || data.length === 0) return { matching: [], mismatched: [], byCategory: {} };
    
    const matching = data.filter(row => row.status === "MATCH");
    const mismatched = data.filter(row => row.status === "MISMATCH");
    const byCategory = {};
    
    data.forEach(row => {
      const cat = row.category || 'other';
      if (!byCategory[cat]) byCategory[cat] = [];
      byCategory[cat].push(row);
    });
    
    return { matching, mismatched, byCategory };
  }, [data]);

  // Filter by active category
  const filteredData = useMemo(() => {
    if (activeCategory === "all") return data;
    if (activeCategory === "issues") return groupedData.mismatched;
    return groupedData.byCategory[activeCategory] || [];
  }, [data, activeCategory, groupedData]);

  // Statistics
  const stats = useMemo(() => {
    if (!data || data.length === 0) {
      return { total: 0, matching: 0, mismatched: 0, info: 0, totalDiff: 0, maxDiff: 0 };
    }
    const matching = data.filter(r => r.status === "MATCH").length;
    const mismatched = data.filter(r => r.status === "MISMATCH").length;
    const info = data.filter(r => r.status === "INFO").length;
    const totalDiff = data.reduce((s, r) => s + Math.abs(r.difference || 0), 0);
    const maxDiff = Math.max(...data.map(r => Math.abs(r.difference || 0)));
    
    return { total: data.length, matching, mismatched, info, totalDiff, maxDiff };
  }, [data]);

  // Category breakdown
  const categoryBreakdown = useMemo(() => {
    if (!data || data.length === 0) return [];
    return Object.keys(groupedData.byCategory).map(cat => ({
      key: cat,
      label: CATEGORY_LABELS[cat]?.label || cat,
      icon: CATEGORY_LABELS[cat]?.icon || "📊",
      count: groupedData.byCategory[cat].length,
      total: groupedData.byCategory[cat].reduce((s, r) => s + (r.monthly_total || 0), 0),
    }));
  }, [data, groupedData]);

  // Handle custom multi-sheet export
  const handleCustomExport = async (type, { data: exportData, columns: _columns }) => {
    if (type === 'excel') {
      const hierarchyLabel = hierarchy.branchId ? `الفرع: ${hierarchy.branchId} | شهر: ${hierarchy.dispenseMonth}` : '';
      
      // Sheet: Full Report
      const sheetsData = {
        'تقرير المطابقة الكامل': {
          data: exportData,
          columns: [
            { header: "البند", accessor: "name" },
            { header: "التصنيف", accessor: (r) => CATEGORY_LABELS[r.category]?.label || r.category },
            { header: "إجمالي التفصيلي", accessor: (r) => r.detailed_total?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || "0.00" },
            { header: "إجمالي الشهري", accessor: (r) => r.monthly_total?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || "0.00" },
            { header: "الفرق", accessor: (r) => r.difference?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || "0.00" },
            { header: "الحالة", accessor: (r) => r.status === "MATCH" ? "مطابق" : r.status === "MISMATCH" ? "يوجد فرق" : "معلومات" },
          ],
          options: { title: 'تقرير المراجعة والمطابقة', hierarchyLabel },
        },
        'البنود المطابقة': {
          data: groupedData.matching,
          columns: [
            { header: "البند", accessor: "name" },
            { header: "التفصيلي", accessor: (r) => r.detailed_total?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) },
            { header: "الشهري", accessor: (r) => r.monthly_total?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) },
          ],
          options: { title: 'البنود المطابقة', hierarchyLabel },
        },
        'البنود المختلفة': {
          data: groupedData.mismatched,
          columns: [
            { header: "البند", accessor: "name" },
            { header: "التفصيلي", accessor: (r) => r.detailed_total?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) },
            { header: "الشهري", accessor: (r) => r.monthly_total?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) },
            { header: "الفرق", accessor: (r) => r.difference?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) },
          ],
          options: { title: 'البنود التي يوجد فيها فرق', hierarchyLabel },
        },
      };

      await exportMultiSheetExcel(sheetsData, {
        fileName: `reconciliation_${hierarchy.dispenseMonth}`,
        title: 'تقرير المراجعة والمطابقة',
        summaryData: {
          headers: ['البند', 'القيمة'],
          rows: [
            ['إجمالي البنود', data.length.toString()],
            ['البنود المطابقة', groupedData.matching.length.toString()],
            ['البنود المختلفة', groupedData.mismatched.length.toString()],
            ['إجمالي الفروقات', stats.totalDiff.toLocaleString(undefined, { maximumFractionDigits: 2 })],
            ['أعلى فرق', stats.maxDiff.toLocaleString(undefined, { maximumFractionDigits: 2 })],
          ]
        }
      });
      return true;
    }
    return false;
  };

  // Export columns (for the main table view)
  const exportColumns = useMemo(() => [
    { header: "البند", accessor: "name" },
    { header: "التصنيف", accessor: (r) => CATEGORY_LABELS[r.category]?.label || r.category },
    { header: "إجمالي التفصيلي", accessor: (row) => row.detailed_total?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || "0.00" },
    { header: "إجمالي الشهري", accessor: (row) => row.monthly_total?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || "0.00" },
    { header: "الفرق", accessor: (row) => row.difference?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || "0.00" },
    { header: "الحالة", accessor: (row) => row.status === "MATCH" ? "مطابق" : row.status === "MISMATCH" ? "يوجد فرق" : "معلومات" },
  ], []);

  const loadReport = async () => {
    if (!hierarchy.branchId || !hierarchy.dispenseMonth) return;
    setLoading(true);
    try {
      const res = await invoke("get_reconciliation_report", {
        branchId: parseInt(hierarchy.branchId),
        dispenseMonth: hierarchy.dispenseMonth,
      });
      setData(res);
    } catch (err) {
      toast.error(`خطأ في جلب تقرير المطابقة: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (hierarchy.branchId && hierarchy.dispenseMonth) {
      loadReport();
    } else {
      setData([]);
    }
  }, [hierarchy.branchId, hierarchy.dispenseMonth]); // eslint-disable-line react-hooks/exhaustive-deps

  const fmt = (n) => parseFloat(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="space-y-6 animate-fadeIn">
      <Breadcrumb
        items={[
          { label: "التقارير" },
          { label: "المراجعة والمطابقة (Reconciliation)" },
        ]}
      />

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <PageHeader
          title="لوحة المراجعة والمطابقة"
          icon={Scale}
          description="مقارنة شاملة بين كل مصادر البيانات (أدوية، مستلزمات، إنسولين، أحكام، تذاكر) لاكتشاف الفروقات."
        />
        <div className="flex gap-2 flex-wrap">
          <Button onClick={loadReport} variant="outline" icon={RefreshCw} loading={loading}>
            تحديث المطابقة
          </Button>
          <Button onClick={() => setShowPrintPreview(true)} variant="outline" icon={Scale} disabled={data.length === 0}>
            معاينة الطباعة
          </Button>
          <ExportMenu 
            data={data} 
            columns={exportColumns} 
            options={{ 
              title: 'تقرير المراجعة والمطابقة', 
              fileName: 'reconciliation_report',
              hierarchyLabel: hierarchy.branchId ? `الفرع: ${hierarchy.branchId} | شهر: ${hierarchy.dispenseMonth}` : ''
            }} 
            onCustomExport={handleCustomExport}
          />
        </div>
      </div>

      <HierarchySelector
        onSelectionChange={(data) => setHierarchy({ ...hierarchy, ...data })}
        initialBranch={hierarchy.branchId}
        initialMonth={hierarchy.dispenseMonth}
        compact
      />

      {/* Stats Overview Cards */}
      {data.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="p-5 bg-gradient-to-br from-cyan-50 to-blue-50 border-cyan-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-cyan-600 font-bold mb-1">إجمالي البنود</p>
                <p className="text-3xl font-black text-cyan-700">{stats.total}</p>
              </div>
              <Layers className="text-cyan-500 opacity-30" size={40} />
            </div>
          </Card>
          
          <Card className="p-5 bg-gradient-to-br from-emerald-50 to-green-50 border-emerald-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-emerald-600 font-bold mb-1">مطابق ✓</p>
                <p className="text-3xl font-black text-emerald-700">{stats.matching}</p>
                <p className="text-[10px] text-emerald-600 mt-1">
                  {stats.total > 0 ? Math.round((stats.matching / stats.total) * 100) : 0}% من الإجمالي
                </p>
              </div>
              <CheckCircle className="text-emerald-500 opacity-30" size={40} />
            </div>
          </Card>
          
          <Card className="p-5 bg-gradient-to-br from-rose-50 to-red-50 border-rose-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-rose-600 font-bold mb-1">يوجد فرق ✗</p>
                <p className="text-3xl font-black text-rose-700">{stats.mismatched}</p>
                <p className="text-[10px] text-rose-600 mt-1">يحتاج مراجعة</p>
              </div>
              <XCircle className="text-rose-500 opacity-30" size={40} />
            </div>
          </Card>
          
          <Card className="p-5 bg-gradient-to-br from-amber-50 to-orange-50 border-amber-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-amber-600 font-bold mb-1">إجمالي الفروقات</p>
                <p className="text-2xl font-black text-amber-700">{fmt(stats.totalDiff)}</p>
                <p className="text-[10px] text-amber-600 mt-1">جنيه مصري</p>
              </div>
              <AlertCircle className="text-amber-500 opacity-30" size={40} />
            </div>
          </Card>
        </div>
      )}

      {/* Category Filter Tabs */}
      {data.length > 0 && (
        <Card className="p-3">
          <div className="flex flex-wrap items-center gap-2" dir="rtl">
            <span className="text-xs font-bold text-[var(--color-text-muted)] ml-2">عرض:</span>
            <button
              onClick={() => setActiveCategory("all")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeCategory === "all"
                  ? "bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-md"
                  : "bg-[var(--color-bg)] text-[var(--color-text)] border border-[var(--color-border)] hover:bg-cyan-50"
              }`}
            >
              🌐 الكل ({stats.total})
            </button>
            <button
              onClick={() => setActiveCategory("issues")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeCategory === "issues"
                  ? "bg-gradient-to-r from-rose-600 to-red-600 text-white shadow-md"
                  : "bg-[var(--color-bg)] text-[var(--color-text)] border border-[var(--color-border)] hover:bg-rose-50"
              }`}
            >
              ⚠️ الفروقات فقط ({stats.mismatched})
            </button>
            {categoryBreakdown.map(cat => (
              <button
                key={cat.key}
                onClick={() => setActiveCategory(cat.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  activeCategory === cat.key
                    ? "bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-md"
                    : "bg-[var(--color-bg)] text-[var(--color-text)] border border-[var(--color-border)] hover:bg-slate-50"
                }`}
              >
                {cat.icon} {cat.label} ({cat.count})
              </button>
            ))}
          </div>
        </Card>
      )}

      {/* Main Data Table */}
      {data.length === 0 && !loading ? (
        <Card className="p-6">
          <div className="text-center py-12 text-[var(--color-text-muted)]">
            <Scale size={48} className="mx-auto mb-4 opacity-30" />
            <p className="font-bold">الرجاء تحديد الفرع والشهر لعرض تقرير المطابقة</p>
          </div>
        </Card>
      ) : (
        <PrintableTable
          title={`تقرير المراجعة والمطابقة - ${hierarchy.dispenseMonth}`}
          subtitle={`شهر: ${hierarchy.dispenseMonth} | إجمالي البنود: ${stats.total} | مطابق: ${stats.matching} | يوجد فرق: ${stats.mismatched}`}
          showSignatures={true}
        >
        <Card className="p-6">
          <div className="overflow-x-auto rounded-xl border border-[var(--color-border)]">
            <table className="w-full text-right text-sm">
              <thead className="bg-[var(--color-bg-card)] text-[var(--color-text-muted)] font-black">
                <tr>
                  <th className="p-4 border-b border-[var(--color-border)]">التصنيف</th>
                  <th className="p-4 border-b border-[var(--color-border)]">البند</th>
                  <th className="p-4 border-b border-[var(--color-border)] text-center">إجمالي التفصيلي</th>
                  <th className="p-4 border-b border-[var(--color-border)] text-center">إجمالي الشهري</th>
                  <th className="p-4 border-b border-[var(--color-border)] text-center">الفرق</th>
                  <th className="p-4 border-b border-[var(--color-border)] text-center">الحالة</th>
                </tr>
              </thead>
              <tbody className="bg-[var(--color-bg)]">
                {filteredData.map((row, idx) => {
                  const cat = CATEGORY_LABELS[row.category] || { label: row.category, color: "bg-gray-100 text-gray-700", icon: "•" };
                  return (
                    <tr key={idx} className="hover:bg-[var(--color-bg-card)] transition-colors border-b border-[var(--color-border)]">
                      <td className="p-4">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-black ${cat.color}`}>
                          {cat.icon} {cat.label}
                        </span>
                      </td>
                      <td className="p-4 font-bold text-[var(--color-text)]">{row.name}</td>
                      <td className="p-4 font-mono text-center">{fmt(row.detailed_total)}</td>
                      <td className="p-4 font-mono text-center">{fmt(row.monthly_total)}</td>
                      <td className={`p-4 font-mono text-center font-bold ${
                        row.difference > 0 ? 'text-rose-500' : row.difference < 0 ? 'text-amber-500' : 'text-emerald-500'
                      }`}>
                        {row.difference !== 0 ? fmt(row.difference) : '—'}
                      </td>
                      <td className="p-4 text-center">
                        {row.status === "MATCH" ? (
                          <div className="inline-flex items-center gap-1 px-3 py-1 bg-emerald-50 text-emerald-600 rounded-full text-xs font-bold">
                            <CheckCircle size={14} /> مطابق
                          </div>
                        ) : row.status === "MISMATCH" ? (
                          <div className="inline-flex items-center gap-1 px-3 py-1 bg-rose-50 text-rose-600 rounded-full text-xs font-bold">
                            <XCircle size={14} /> يوجد فرق
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1 px-3 py-1 bg-slate-100 text-slate-600 rounded-full text-xs font-bold" title="مصدر بيانات واحد فقط - لا تتوفر بيانات للمقارنة">
                            <Activity size={14} /> مصدر واحد
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
        </PrintableTable>
      )}

      {/* Print Preview Modal */}
      <PrintPreviewModal
        isOpen={showPrintPreview}
        onClose={() => setShowPrintPreview(false)}
        title="تقرير المراجعة والمطابقة"
        subtitle={`شهر ${hierarchy.dispenseMonth}`}
        hierarchyLabel={hierarchy.branchId ? `الفرع: ${hierarchy.branchId}` : ''}
        exportData={filteredData}
        exportColumns={exportColumns}
      >
        {/* Print Content */}
        <div className="overflow-x-auto rounded-xl border-2 border-slate-300">
          <table className="w-full text-right text-xs" style={{ fontFamily: 'Arial, sans-serif' }}>
            <thead className="bg-gradient-to-r from-cyan-600 to-blue-600 text-white">
              <tr>
                <th className="p-3 border border-slate-300">التصنيف</th>
                <th className="p-3 border border-slate-300">البند</th>
                <th className="p-3 border border-slate-300 text-center">التفصيلي</th>
                <th className="p-3 border border-slate-300 text-center">الشهري</th>
                <th className="p-3 border border-slate-300 text-center">الفرق</th>
                <th className="p-3 border border-slate-300 text-center">الحالة</th>
              </tr>
            </thead>
            <tbody>
              {filteredData.map((row, idx) => (
                <tr key={idx} className={idx % 2 === 0 ? 'bg-slate-50' : 'bg-white'}>
                  <td className="p-3 border border-slate-200 font-bold text-[10px]">
                    {CATEGORY_LABELS[row.category]?.label || row.category}
                  </td>
                  <td className="p-3 border border-slate-200 font-bold">{row.name}</td>
                  <td className="p-3 border border-slate-200 text-center font-mono">{fmt(row.detailed_total)}</td>
                  <td className="p-3 border border-slate-200 text-center font-mono">{fmt(row.monthly_total)}</td>
                  <td className={`p-3 border border-slate-200 text-center font-mono font-bold ${
                    row.difference > 0 ? 'text-rose-600' : row.difference < 0 ? 'text-amber-600' : 'text-emerald-600'
                  }`}>
                    {row.difference !== 0 ? fmt(row.difference) : '—'}
                  </td>
                  <td className="p-3 border border-slate-200 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      row.status === "MATCH" ? 'bg-emerald-100 text-emerald-700' : 
                      row.status === "MISMATCH" ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600'
                    }`}>
                      {row.status === "MATCH" ? '✓ مطابق' : row.status === "MISMATCH" ? '✗ فرق' : 'معلومات'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Summary Box */}
        <div className="mt-6 grid grid-cols-4 gap-3">
          <div className="bg-gradient-to-br from-cyan-50 to-blue-50 p-3 rounded-xl border border-cyan-200 text-center">
            <p className="text-[10px] text-cyan-600 font-bold">إجمالي البنود</p>
            <p className="text-xl font-black text-cyan-700">{stats.total}</p>
          </div>
          <div className="bg-gradient-to-br from-emerald-50 to-green-50 p-3 rounded-xl border border-emerald-200 text-center">
            <p className="text-[10px] text-emerald-600 font-bold">مطابق</p>
            <p className="text-xl font-black text-emerald-700">{stats.matching}</p>
          </div>
          <div className="bg-gradient-to-br from-rose-50 to-red-50 p-3 rounded-xl border border-rose-200 text-center">
            <p className="text-[10px] text-rose-600 font-bold">فروقات</p>
            <p className="text-xl font-black text-rose-700">{stats.mismatched}</p>
          </div>
          <div className="bg-gradient-to-br from-amber-50 to-orange-50 p-3 rounded-xl border border-amber-200 text-center">
            <p className="text-[10px] text-amber-600 font-bold">إجمالي الفروقات</p>
            <p className="text-base font-black text-amber-700">{fmt(stats.totalDiff)}</p>
          </div>
        </div>
      </PrintPreviewModal>
    </div>
  );
};

export default ReconciliationPage;
