import React, { useState, useEffect, useMemo } from "react";
import { Scale, RefreshCw, CheckCircle, TrendingUp, Layers, ChevronDown, ChevronLeft, Loader2, Pill, Ticket } from "lucide-react";
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
import { useGlobalApp } from "../../context/useGlobalApp";
import { buildHierarchyLabel } from "../../utils/reportUtils";

const CATEGORY_LABELS = {
  drugs: { label: "الأدوية", color: "bg-cyan-100 text-cyan-700", icon: "💊" },
  supplies: { label: "المستلزمات", color: "bg-violet-100 text-violet-700", icon: "🩹" },
  insulin: { label: "الإنسولين", color: "bg-amber-100 text-amber-700", icon: "💉" },
  judicial: { label: "الأحكام القضائية", color: "bg-rose-100 text-rose-700", icon: "⚖️" },
  tickets: { label: "التذاكر الطبية", color: "bg-emerald-100 text-emerald-700", icon: "🎫" },
  summary: { label: "الإجمالي الكلي", color: "bg-slate-200 text-slate-900", icon: "🎯" },
};

const ReconciliationPage = () => {
  const { workspaceMode, hierarchyNames } = useGlobalApp();
  const [hierarchy, setHierarchy] = useState({
    branchId: "",
    dispenseMonth: new Date().toISOString().substring(0, 7),
  });
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showPrintPreview, setShowPrintPreview] = useState(false);
  const [activeCategory, setActiveCategory] = useState("all");
  const [expandedCategory, setExpandedCategory] = useState(null); // category/group name expanded
  const [detailsData, setDetailsData] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const toast = useToast();

  // Group data by category (for filter tabs and export)
  const groupedData = useMemo(() => {
    if (!data || data.length === 0) return { byCategory: {} };
    
    const byCategory = {};
    
    data.forEach(row => {
      const cat = row.category || 'other';
      if (!byCategory[cat]) byCategory[cat] = [];
      byCategory[cat].push(row);
    });
    
    return { byCategory };
  }, [data]);

  // Filter by active category
  const filteredData = useMemo(() => {
    if (activeCategory === "all") return data;
    return groupedData.byCategory[activeCategory] || [];
  }, [data, activeCategory, groupedData]);

  // Statistics — the redesigned report is a single-source breakdown (all
  // INFO rows), so "differences" no longer exist. Meaningful stats instead:
  // total rows, single-source rows, total value, expandable categories,
  // and the total ticket count (56ب + 56ج) kept separate from money.
  const stats = useMemo(() => {
    if (!data || data.length === 0) {
      return { total: 0, info: 0, totalValue: 0, expandable: 0, ticketsCount: 0 };
    }
    const info = data.filter(r => r.status === "INFO").length;
    // Total value across all source rows — exclude the summary row because
    // it already sums every source (counting it would double-count), and
    // the tickets row because it carries a COUNT, not a monetary value.
    const valueRows = data.filter(r => r.category !== 'summary' && r.category !== 'tickets');
    const totalValue = valueRows.reduce(
      (s, r) => s + (r.detailed_total || 0) + (r.monthly_total || 0), 0
    );
    // Expandable rows: drug categories + insulin groups (have category_name)
    const expandable = data.filter(r => r.category_name).length;
    // Total ticket count (56ب + 56ج) — a COUNT, never money
    const ticketsCount = data
      .filter(r => r.category === 'tickets')
      .reduce((s, r) => s + (parseFloat(r.detailed_total) || 0), 0);

    return { total: data.length, info, totalValue, expandable, ticketsCount };
  }, [data]);

  // Category breakdown
  const categoryBreakdown = useMemo(() => {
    if (!data || data.length === 0) return [];
    return Object.keys(groupedData.byCategory).map(cat => ({
      key: cat,
      label: CATEGORY_LABELS[cat]?.label || cat,
      icon: CATEGORY_LABELS[cat]?.icon || "📊",
      count: groupedData.byCategory[cat].length,
      total: groupedData.byCategory[cat].reduce((s, r) => s + (r.detailed_total || 0) + (r.monthly_total || 0), 0),
    }));
  }, [data, groupedData]);

  // Handle custom multi-sheet export
  const handleCustomExport = async (type, { data: exportData, columns: _columns }) => {
    if (type === 'excel') {
      const chain = buildHierarchyLabel(workspaceMode, hierarchyNames);
      const hierarchyLabel = [chain, `شهر: ${hierarchy.dispenseMonth}`].filter(Boolean).join(' | ');
      
      // Single-source rows (INFO) — every row the redesigned report returns
      const infoRows = data.filter(r => r.status === 'INFO');

      // Sheet: Full Report
      const sheetsData = {
        'الإجماليات الموحدة': {
          data: exportData,
          columns: [
            { header: "البند", accessor: "name" },
            { header: "التصنيف", accessor: (r) => CATEGORY_LABELS[r.category]?.label || r.category },
            { header: "العدد", accessor: (r) => r.category === "tickets" ? Math.round(parseFloat(r.detailed_total || 0)).toLocaleString(undefined, { maximumFractionDigits: 0 }) : "—" },
            { header: "القيمة الإجمالية", accessor: (r) => r.category === "tickets" ? "—" : (((r.detailed_total || 0) + (r.monthly_total || 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || "0.00") },
            { header: "المصدر", accessor: () => "مصدر واحد" },
          ],
          options: { title: 'تقرير الإجماليات الموحدة', hierarchyLabel },
        },
        'مصادر منفردة': {
          data: infoRows,
          columns: [
            { header: "البند", accessor: "name" },
            { header: "العدد", accessor: (r) => r.category === "tickets" ? Math.round(parseFloat(r.detailed_total || 0)).toLocaleString(undefined, { maximumFractionDigits: 0 }) : "—" },
            { header: "القيمة الإجمالية", accessor: (r) => r.category === "tickets" ? "—" : ((r.detailed_total || 0) + (r.monthly_total || 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) },
          ],
          options: { title: 'مصادر منفردة', hierarchyLabel },
        },
      };

      await exportMultiSheetExcel(sheetsData, {
        fileName: `totals_${hierarchy.dispenseMonth}`,
        title: 'تقرير الإجماليات الموحدة',
        summaryData: {
          headers: ['البند', 'القيمة'],
          rows: [
            ['إجمالي البنود', data.length.toString()],
            ['مصادر منفردة', stats.info.toString()],
            ['فئات قابلة للتوسيع', stats.expandable.toString()],
            ['إجمالي عدد التذاكر', Math.round(stats.ticketsCount).toString()],
            ['إجمالي القيمة', stats.totalValue.toLocaleString(undefined, { maximumFractionDigits: 2 })],
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
    { header: "العدد", accessor: (row) => row.category === "tickets" ? Math.round(parseFloat(row.detailed_total || 0)).toLocaleString(undefined, { maximumFractionDigits: 0 }) : "—" },
    { header: "القيمة الإجمالية", accessor: (row) => row.category === "tickets" ? "—" : (((row.detailed_total || 0) + (row.monthly_total || 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || "0.00") },
    { header: "المصدر", accessor: () => "مصدر واحد" },
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
      toast.error(`خطأ في جلب تقرير الإجماليات الموحدة: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  // A row is expandable when the backend marks it with a structured
  // category_name field (no fragile display-name parsing). Drug category
  // rows AND insulin group rows (مجاني/مدعم) are expandable.
  // The key is qualified by category so a drug category and an insulin
  // group sharing a name can never collide in the expansion state.
  const getExpandableKey = (row) => {
    if (row.category !== "drugs" && row.category !== "insulin") return null;
    if (!row.category_name) return null;
    return `${row.category}::${row.category_name}`;
  };

  // Guard against out-of-order responses when rapidly switching categories:
  // only the latest requested category may apply its fetch result.
  const detailsRequestRef = React.useRef(null);

  // Toggle the expanded sub-table for a drug category / insulin group row
  const toggleDetails = async (row) => {
    const expandKey = getExpandableKey(row);
    if (!expandKey) return;
    const rawName = row.category_name; // backend param: category (drugs) or group (insulin)
    if (expandedCategory === expandKey) {
      detailsRequestRef.current = null;
      setExpandedCategory(null);
      setDetailsData(null);
      setDetailsLoading(false);
      return;
    }
    setExpandedCategory(expandKey);
    setDetailsLoading(true);
    setDetailsData(null);
    detailsRequestRef.current = expandKey;
    try {
      const isInsulin = row.category === "insulin";
      const res = await invoke(
        isInsulin ? "get_reconciliation_insulin_details" : "get_reconciliation_drug_details",
        isInsulin
          ? { branchId: parseInt(hierarchy.branchId), dispenseMonth: hierarchy.dispenseMonth, group: rawName }
          : { branchId: parseInt(hierarchy.branchId), dispenseMonth: hierarchy.dispenseMonth, category: rawName }
      );
      // Ignore stale responses — a newer category was requested meanwhile
      if (detailsRequestRef.current !== expandKey) return;
      setDetailsData(res);
    } catch (err) {
      if (detailsRequestRef.current !== expandKey) return;
      toast.error(`خطأ في جلب التفاصيل: ${err}`);
      setExpandedCategory(null);
      setDetailsData(null);
    } finally {
      if (detailsRequestRef.current === expandKey) {
        setDetailsLoading(false);
      }
    }
  };

  // Close expanded sub-table whenever the filter or data changes
  useEffect(() => {
    detailsRequestRef.current = null;
    setExpandedCategory(null);
    setDetailsData(null);
    setDetailsLoading(false);
  }, [activeCategory, data]);

  useEffect(() => {
    if (hierarchy.branchId && hierarchy.dispenseMonth) {
      loadReport();
    } else {
      setData([]);
    }
  }, [hierarchy.branchId, hierarchy.dispenseMonth]); // eslint-disable-line react-hooks/exhaustive-deps

  const fmt = (n) => parseFloat(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Ticket rows carry a COUNT (not money) — they get a dedicated 'العدد'
  // column so the count never masquerades as a monetary value.
  const isTicketRow = (row) => row.category === "tickets";
  const ticketCount = (row) =>
    isTicketRow(row)
      ? Math.round(parseFloat(row.detailed_total || 0)).toLocaleString(undefined, { maximumFractionDigits: 0 })
      : "—";

  return (
    <div className="space-y-6 animate-fadeIn">
      <Breadcrumb
        items={[
          { label: "التقارير" },
          { label: "تقرير الإجماليات الموحدة" },
        ]}
      />

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <PageHeader
          title="تقرير الإجماليات الموحدة"
          icon={Scale}
          description="كشف توزيع مصادر البيانات حسب الفئات — كل فئة تُعرض منفصلة بذاتها (التفصيلي بالتصنيف الدوائي، والشهري بفئات التمويل) دون مقارنة غير صحيحة بين مجموعات مختلفة."
        />
        <div className="flex gap-2 flex-wrap">
          <Button onClick={loadReport} variant="outline" icon={RefreshCw} loading={loading}>
            تحديث البيانات
          </Button>
          <Button onClick={() => setShowPrintPreview(true)} variant="outline" icon={Scale} disabled={data.length === 0}>
            معاينة الطباعة
          </Button>
          <ExportMenu 
            data={data} 
            columns={exportColumns} 
            options={{ 
              title: 'تقرير الإجماليات الموحدة', 
              fileName: 'totals_report',
              hierarchyLabel: [buildHierarchyLabel(workspaceMode, hierarchyNames), `شهر: ${hierarchy.dispenseMonth}`].filter(Boolean).join(' | ')
            }} 
            onCustomExport={handleCustomExport}
          />
        </div>
      </div>

      <HierarchySelector
        onSelectionChange={(data) => setHierarchy(prev => ({ ...prev, ...data }))}
        initialBranch={hierarchy.branchId}
        initialMonth={hierarchy.dispenseMonth}
        compact
      />

      {/* Stats Overview Cards */}
      {data.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
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
                <p className="text-xs text-emerald-600 font-bold mb-1">مصدر واحد ✓</p>
                <p className="text-3xl font-black text-emerald-700">{stats.info}</p>
                <p className="text-[10px] text-emerald-600 mt-1">عُرضت منفصلة بذاتها</p>
              </div>
              <CheckCircle className="text-emerald-500 opacity-30" size={40} />
            </div>
          </Card>
          
          <Card className="p-5 bg-gradient-to-br from-rose-50 to-red-50 border-rose-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-rose-600 font-bold mb-1">إجمالي القيمة</p>
                <p className="text-2xl font-black text-rose-700">{fmt(stats.totalValue)}</p>
                <p className="text-[10px] text-rose-600 mt-1">جنيه مصري — مجموع كل المصادر</p>
              </div>
              <TrendingUp className="text-rose-500 opacity-30" size={40} />
            </div>
          </Card>
          
          <Card className="p-5 bg-gradient-to-br from-amber-50 to-orange-50 border-amber-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-amber-600 font-bold mb-1">فئات قابلة للتوسيع</p>
                <p className="text-3xl font-black text-amber-700">{stats.expandable}</p>
                <p className="text-[10px] text-amber-600 mt-1">تصنيفات ومجموعات تفصيلية</p>
              </div>
              <ChevronDown className="text-amber-500 opacity-30" size={40} />
            </div>
          </Card>

          <Card className="p-5 bg-gradient-to-br from-teal-50 to-emerald-50 border-teal-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-teal-600 font-bold mb-1">إجمالي عدد التذاكر</p>
                <p className="text-3xl font-black text-teal-700">{Math.round(stats.ticketsCount).toLocaleString()}</p>
                <p className="text-[10px] text-teal-600 mt-1">56ب + 56ج — عدد وليس قيمة مالية</p>
              </div>
              <Ticket className="text-teal-500 opacity-30" size={40} />
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
            <p className="font-bold">الرجاء تحديد الفرع والشهر لعرض تقرير الإجماليات الموحدة</p>
          </div>
        </Card>
      ) : (
        <PrintableTable
          title={`تقرير الإجماليات الموحدة - ${hierarchy.dispenseMonth}`}
          subtitle={`شهر: ${hierarchy.dispenseMonth} | إجمالي البنود: ${stats.total} | مصدر واحد: ${stats.info} | إجمالي القيمة: ${fmt(stats.totalValue)}`}
          hierarchyLabel={buildHierarchyLabel(workspaceMode, hierarchyNames)}
          showSignatures={true}
        >
        <Card className="p-6">
          <div className="overflow-x-auto rounded-xl border border-[var(--color-border)]">
            <table className="w-full text-right text-sm">
              <thead className="bg-[var(--color-bg-card)] text-[var(--color-text-muted)] font-black">
                <tr>
                  <th className="p-4 border-b border-[var(--color-border)]">التصنيف</th>
                  <th className="p-4 border-b border-[var(--color-border)]">البند</th>
                  <th className="p-4 border-b border-[var(--color-border)] text-center">العدد</th>
                  <th className="p-4 border-b border-[var(--color-border)] text-center">القيمة الإجمالية</th>
                  <th className="p-4 border-b border-[var(--color-border)] text-center">المصدر</th>
                </tr>
              </thead>
              <tbody className="bg-[var(--color-bg)]">
                {filteredData.map((row, idx) => {
                  const cat = CATEGORY_LABELS[row.category] || { label: row.category, color: "bg-gray-100 text-gray-700", icon: "•" };
                  const expandKey = getExpandableKey(row);
                  const isExpanded = expandKey && expandedCategory === expandKey;
                  return (
                    <React.Fragment key={idx}>
                      <tr className="hover:bg-[var(--color-bg-card)] transition-colors border-b border-[var(--color-border)]">
                        <td className="p-4">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-black ${cat.color}`}>
                            {cat.icon} {cat.label}
                          </span>
                        </td>
                        <td className="p-4 font-bold text-[var(--color-text)]">
                          <div className="flex items-center gap-2">
                            {expandKey && (
                              <button
                                onClick={() => toggleDetails(row)}
                                className={`shrink-0 p-1.5 rounded-lg border transition-all flex items-center gap-1 text-[10px] font-black ${
                                  isExpanded
                                    ? 'bg-cyan-600 text-white border-transparent shadow-md'
                                    : 'bg-[var(--color-bg-card)] text-[var(--color-primary)] border-[var(--color-border)] hover:bg-cyan-50'
                                }`}
                                title={isExpanded ? 'إخفاء التفاصيل' : 'عرض التفاصيل'}
                              >
                                {isExpanded ? <ChevronDown size={14} /> : <ChevronLeft size={14} />}
                              </button>
                            )}
                            <span>{row.name}</span>
                          </div>
                        </td>
                        <td className="p-4 font-mono text-center font-black text-[var(--color-text)]">
                          {ticketCount(row)}
                        </td>
                        <td className="p-4 font-mono text-center font-black text-[var(--color-text)]">
                          {isTicketRow(row) ? '—' : fmt((row.detailed_total || 0) + (row.monthly_total || 0))}
                        </td>
                        <td className="p-4 text-center">
                          <div className="inline-flex items-center gap-1 px-3 py-1 bg-emerald-50 text-emerald-600 rounded-full text-xs font-bold" title="بيانات من مصدر واحد موحّد">
                            <CheckCircle size={14} /> مصدر واحد
                          </div>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="bg-cyan-50/50 dark:bg-cyan-950/10">
                          <td colSpan={5} className="p-0">
                            <div className="p-4 pr-14">
                              {detailsLoading ? (
                                <div className="flex items-center justify-center gap-3 py-6 text-[var(--color-text-muted)]">
                                  <Loader2 size={20} className="animate-spin text-[var(--color-primary)]" />
                                  <span className="text-xs font-bold">جاري تحميل التفاصيل...</span>
                                </div>
                              ) : detailsData && detailsData.length > 0 ? (
                                <div className="rounded-xl border border-cyan-200/60 overflow-hidden">
                                  <table className="w-full text-right text-xs">
                                    <thead className="bg-[var(--color-bg-card)] text-[var(--color-text-muted)] font-black">
                                      <tr>
                                        <th className="p-3 border-b border-[var(--color-border)]">الصنف</th>
                                        <th className="p-3 border-b border-[var(--color-border)] text-center">الوحدة</th>
                                        <th className="p-3 border-b border-[var(--color-border)] text-center">الكمية</th>
                                        <th className="p-3 border-b border-[var(--color-border)] text-center">عدد الحالات</th>
                                        <th className="p-3 border-b border-[var(--color-border)] text-center">سعر الوحدة</th>
                                        <th className="p-3 border-b border-[var(--color-border)] text-center">القيمة الإجمالية</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-[var(--color-border)]">
                                      {detailsData.map((d, di) => (
                                        <tr key={di} className="hover:bg-white/60 dark:hover:bg-slate-900/20 transition-colors">
                                          <td className="p-3 font-bold text-[var(--color-text)]">
                                            <span className="inline-flex items-center gap-1.5">
                                              <Pill size={12} className="text-[var(--color-primary)] shrink-0" />
                                              {d.drug_name}
                                            </span>
                                          </td>
                                          <td className="p-3 text-center font-mono text-[var(--color-text-muted)]">{d.unit || '—'}</td>
                                          <td className="p-3 text-center font-mono">{Number(d.quantity).toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                                          <td className="p-3 text-center font-mono">{d.cases_count}</td>
                                          <td className="p-3 text-center font-mono">{fmt(d.unit_price)}</td>
                                          <td className="p-3 text-center font-mono font-black text-[var(--color-text)]">{fmt(d.total_cost)}</td>
                                        </tr>
                                      ))}
                                      <tr className="bg-[var(--color-bg-card)]">
                                        <td colSpan={5} className="p-3 text-left font-black text-[var(--color-text-muted)]">إجمالي المجموعة</td>
                                        <td className="p-3 text-center font-mono font-black text-[var(--color-primary)]">
                                          {fmt(detailsData.reduce((s, d) => s + (parseFloat(d.total_cost) || 0), 0))}
                                        </td>
                                      </tr>
                                    </tbody>
                                  </table>
                                </div>
                              ) : (
                                <div className="py-6 text-center text-xs font-bold text-[var(--color-text-muted)]">
                                  لا توجد بيانات تفصيلية في هذه المجموعة
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
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
        title="تقرير الإجماليات الموحدة"
        subtitle={`شهر ${hierarchy.dispenseMonth}`}
        hierarchyLabel={buildHierarchyLabel(workspaceMode, hierarchyNames)}
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
                <th className="p-3 border border-slate-300 text-center">العدد</th>
                <th className="p-3 border border-slate-300 text-center">القيمة الإجمالية</th>
                <th className="p-3 border border-slate-300 text-center">المصدر</th>
              </tr>
            </thead>
            <tbody>
              {filteredData.map((row, idx) => (
                <tr key={idx} className={idx % 2 === 0 ? 'bg-slate-50' : 'bg-white'}>
                  <td className="p-3 border border-slate-200 font-bold text-[10px]">
                    {CATEGORY_LABELS[row.category]?.label || row.category}
                  </td>
                  <td className="p-3 border border-slate-200 font-bold">{row.name}</td>
                  <td className="p-3 border border-slate-200 text-center font-mono font-black">
                    {ticketCount(row)}
                  </td>
                  <td className="p-3 border border-slate-200 text-center font-mono font-black">
                    {isTicketRow(row) ? '—' : fmt((row.detailed_total || 0) + (row.monthly_total || 0))}
                  </td>
                  <td className="p-3 border border-slate-200 text-center">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700">✓ مصدر واحد</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Summary Box */}
        <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <div className="bg-gradient-to-br from-cyan-50 to-blue-50 p-3 rounded-xl border border-cyan-200 text-center">
            <p className="text-[10px] text-cyan-600 font-bold">إجمالي البنود</p>
            <p className="text-xl font-black text-cyan-700">{stats.total}</p>
          </div>
          <div className="bg-gradient-to-br from-emerald-50 to-green-50 p-3 rounded-xl border border-emerald-200 text-center">
            <p className="text-[10px] text-emerald-600 font-bold">مصدر واحد</p>
            <p className="text-xl font-black text-emerald-700">{stats.info}</p>
          </div>
          <div className="bg-gradient-to-br from-rose-50 to-red-50 p-3 rounded-xl border border-rose-200 text-center">
            <p className="text-[10px] text-rose-600 font-bold">إجمالي القيمة</p>
            <p className="text-base font-black text-rose-700">{fmt(stats.totalValue)}</p>
          </div>
          <div className="bg-gradient-to-br from-amber-50 to-orange-50 p-3 rounded-xl border border-amber-200 text-center">
            <p className="text-[10px] text-amber-600 font-bold">قابل للتوسيع</p>
            <p className="text-xl font-black text-amber-700">{stats.expandable}</p>
          </div>
          <div className="bg-gradient-to-br from-teal-50 to-emerald-50 p-3 rounded-xl border border-teal-200 text-center">
            <p className="text-[10px] text-teal-600 font-bold">عدد التذاكر</p>
            <p className="text-xl font-black text-teal-700">{Math.round(stats.ticketsCount).toLocaleString()}</p>
          </div>
        </div>
      </PrintPreviewModal>
    </div>
  );
};

export default ReconciliationPage;
