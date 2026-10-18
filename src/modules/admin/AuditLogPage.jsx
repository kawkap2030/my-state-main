import React, { useState, useEffect, useMemo } from "react";
import { Shield, RefreshCw, Search, Download, Calendar, User, Activity, Database, TrendingUp, Eye, FileSpreadsheet } from "lucide-react";
import invoke from "../../api/tauriApi";
import { useToast } from "../../components/ui/Toast";
import PageHeader from "../../components/ui/PageHeader";
import Breadcrumb from "../../components/ui/Breadcrumb";
import Card from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import StatsBar from "../../components/common/StatsBar";
import ExportMenu from "../../components/ui/ExportMenu";
import { exportMultiSheetExcel } from "../../utils/exportUtils";

const ACTION_LABELS = {
  INSERT: { label: "إضافة", color: "bg-emerald-100 text-emerald-700", icon: "➕" },
  UPDATE: { label: "تعديل", color: "bg-blue-100 text-blue-700", icon: "✏️" },
  DELETE: { label: "حذف", color: "bg-red-100 text-red-700", icon: "🗑️" },
  BULK_UPDATE: { label: "إدخال مجمّع", color: "bg-violet-100 text-violet-700", icon: "📦" },
  LOGIN: { label: "تسجيل دخول", color: "bg-amber-100 text-amber-700", icon: "🔓" },
  EXPORT: { label: "تصدير", color: "bg-sky-100 text-sky-700", icon: "📤" },
};

const TABLE_LABELS = {
  monthly_free_drugs_dispensed: "إجماليات شهرية (أدوية مجانية)",
  monthly_supported_drugs_dispensed: "إجماليات شهرية (أدوية مدعمة)",
  monthly_supplies_dispensed: "إجماليات شهرية (مستلزمات)",
  detailed_drug_dispensed: "أدوية تفصيلية",
  medical_tickets: "تذاكر طبية",
  insulin_dispensed: "إنسولين",
  judicial_dispensed: "أحكام قضائية",
  drug_groups: "مجموعات دوائية",
  drug_group_codes: "أكواد المجموعات",
  users: "المستخدمون",
  branches: "الفروع",
  areas: "المناطق",
  clinics: "العيادات",
  drugs: "الأدوية",
  supplies: "المستلزمات",
  drug_categories: "تصنيفات الأدوية",
  supply_categories: "تصنيفات المستلزمات",
  insulin_codes: "أكواد الإنسولين",
  judicial_patients: "المرضى القضائيون",
  dispensing_month_isolation: "عزل الشهر",
  manual_locked_months: "الشهور المقفلة",
  patient_pdfs: "ملفات PDF للمرضى",
};

// Central CSV cell encoder (RFC 4180 + formula-injection guard).
// - Wraps fields containing , " newline in double quotes (inner quotes doubled).
// - Prefixes text starting with = + - @ (after leading spaces/control chars)
//   with a single quote, unless it is a plain number (e.g. -5 stays numeric).
const csvCell = (v) => {
  let s = v == null ? "" : String(v);
  if (s === "") return "";
  // First meaningful char: skip spaces/BOM/C0 controls — a trigger hiding
  // behind them still counts (checked via char codes, no control-regex).
  let i = 0;
  while (i < s.length) {
    const c = s.charCodeAt(i);
    if (c === 0xfeff || c <= 0x20) { i += 1; continue; }
    break;
  }
  const first = s.charAt(i);
  const trigger = first !== "" && "=+-@".indexOf(first) !== -1;
  const plainNum = /^[+-]?(\d+(\.\d+)?|\.\d+)$/.test(s.trim());
  if (trigger && !plainNum) s = "'" + s;
  if (/[",\n\r]/.test(s) || s.charAt(0) === "'") s = '"' + s.replace(/"/g, '""') + '"';
  return s;
};

const AuditLogPage = () => {
  const toast = useToast();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterAction, setFilterAction] = useState("");
  const [filterTable, setFilterTable] = useState("");
  const [filterUser, setFilterUser] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [limit, setLimit] = useState(500);

  const loadLogs = async () => {
    setLoading(true);
    try {
      const data = await invoke("get_audit_logs", { limit });
      setLogs(data);
    } catch (err) {
      toast.error(`خطأ في جلب سجل التدقيق: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadLogs(); }, [limit]); // eslint-disable-line react-hooks/exhaustive-deps

  // Get unique users from logs
  const uniqueUsers = useMemo(() => {
    const users = new Set();
    logs.forEach((l) => { if (l.username) users.add(l.username); });
    return Array.from(users).sort();
  }, [logs]);

  // Get unique table names actually present in logs
  const availableTables = useMemo(() => {
    const tables = new Set();
    logs.forEach((l) => { if (l.table_name) tables.add(l.table_name); });
    return Array.from(tables).sort();
  }, [logs]);

  // Filter logs by all criteria
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      if (filterAction && log.action !== filterAction) return false;
      if (filterTable && log.table_name !== filterTable) return false;
      if (filterUser && log.username !== filterUser) return false;
      if (dateFrom && log.timestamp && log.timestamp.substring(0, 10) < dateFrom) return false;
      if (dateTo && log.timestamp && log.timestamp.substring(0, 10) > dateTo) return false;
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        return (
          log.username?.toLowerCase().includes(term) ||
          log.details?.toLowerCase().includes(term) ||
          log.table_name?.toLowerCase().includes(term) ||
          log.action?.toLowerCase().includes(term) ||
          log.record_id?.toLowerCase().includes(term)
        );
      }
      return true;
    });
  }, [logs, filterAction, filterTable, filterUser, dateFrom, dateTo, searchTerm]);

  // Enhanced statistics
  const stats = useMemo(() => {
    const counts = {};
    const tableCounts = {};
    const userCounts = {};
    const dayCounts = {};
    let todayCount = 0;
    const today = new Date().toISOString().substring(0, 10);

    logs.forEach((l) => {
      counts[l.action] = (counts[l.action] || 0) + 1;
      tableCounts[l.table_name] = (tableCounts[l.table_name] || 0) + 1;
      if (l.username) userCounts[l.username] = (userCounts[l.username] || 0) + 1;
      const day = l.timestamp?.substring(0, 10);
      if (day) {
        dayCounts[day] = (dayCounts[day] || 0) + 1;
        if (day === today) todayCount++;
      }
    });

    return { counts, tableCounts, userCounts, dayCounts, todayCount };
  }, [logs]);

  // Top tables (most activity)
  const topTables = useMemo(() => {
    return Object.entries(stats.tableCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
  }, [stats.tableCounts]);

  // Last 7 days chart data
  const last7Days = useMemo(() => {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dayStr = d.toISOString().substring(0, 10);
      days.push({ day: dayStr, count: stats.dayCounts[dayStr] || 0 });
    }
    return days;
  }, [stats.dayCounts]);

  const handleExportCSV = () => {
    const headers = ["التوقيت", "المستخدم", "الإجراء", "الجدول", "رقم السجل", "التفاصيل"];
    const rows = filteredLogs.map((l) => [
      l.timestamp, l.username || "—", l.action,
      TABLE_LABELS[l.table_name] || l.table_name,
      l.record_id || "—",
      l.details || "",
    ]);
    const csvContent = "\uFEFF" + [headers, ...rows].map((r) => r.map(csvCell).join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `audit_log_${new Date().toISOString().substring(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Premium Excel export with multi-sheet breakdown
  const handleExportExcel = async () => {
    try {
      // Sheet 1: Full filtered logs
      const fullData = filteredLogs.map((log) => ({
        ...log,
        timestamp_fmt: log.timestamp?.replace("T", " ").substring(0, 19),
        action_label: ACTION_LABELS[log.action]?.label || log.action,
        table_label: TABLE_LABELS[log.table_name] || log.table_name,
      }));

      // Sheet 2: Statistics summary
      const summaryData = {
        headers: ["البند", "القيمة"],
        rows: [
          ["إجمالي السجلات", filteredLogs.length.toString()],
          ["عدد الإضافات", (stats.counts.INSERT || 0).toString()],
          ["عدد التعديلات", (stats.counts.UPDATE || 0).toString()],
          ["عدد الحذف", (stats.counts.DELETE || 0).toString()],
          ["عدد المجمّع", (stats.counts.BULK_UPDATE || 0).toString()],
          ["عدد تسجيلات الدخول", (stats.counts.LOGIN || 0).toString()],
          ["نشاط اليوم", stats.todayCount.toString()],
          ["الفترة من", dateFrom || "البداية"],
          ["الفترة إلى", dateTo || "اليوم"],
        ]
      };

      // Sheet 3: Top tables
      const tablesData = {
        headers: ["الجدول", "عدد العمليات"],
        rows: topTables.map(([t, c]) => [TABLE_LABELS[t] || t, c.toString()])
      };

      // Sheet 4: Activity by user
      const userData = {
        headers: ["المستخدم", "عدد العمليات"],
        rows: Object.entries(stats.userCounts)
          .sort((a, b) => b[1] - a[1])
          .map(([u, c]) => [u, c.toString()])
      };

      const sheetsData = {
        "كل السجلات": {
          data: fullData,
          columns: [
            { header: "التوقيت", accessor: "timestamp_fmt" },
            { header: "المستخدم", accessor: "username" },
            { header: "الإجراء", accessor: "action_label" },
            { header: "الجدول", accessor: "table_label" },
            { header: "رقم السجل", accessor: "record_id" },
            { header: "التفاصيل", accessor: "details" },
          ],
        },
        "الجداول الأكثر نشاطاً": {
          data: tablesData.rows.map(r => ({ name: r[0], count: r[1] })),
          columns: [
            { header: "الجدول", accessor: "name" },
            { header: "عدد العمليات", accessor: "count" },
          ],
        },
        "نشاط المستخدمين": {
          data: userData.rows.map(r => ({ name: r[0], count: r[1] })),
          columns: [
            { header: "المستخدم", accessor: "name" },
            { header: "عدد العمليات", accessor: "count" },
          ],
        },
      };

      // Success toast only on confirmed save: dialog cancel (false)
      // stays silent, real errors throw to the catch below.
      const excelSaved = await exportMultiSheetExcel(sheetsData, {
        fileName: `audit_log_${new Date().toISOString().substring(0, 10)}`,
        title: 'سجل التدقيق والمراجعة',
        summaryData,
      });
      if (excelSaved === true) toast.success('تم تصدير ملف Excel بنجاح ✅');
    } catch (err) {
      toast.error(`فشل التصدير: ${err.message || err}`);
    }
  };

  const handleResetFilters = () => {
    setSearchTerm("");
    setFilterAction("");
    setFilterTable("");
    setFilterUser("");
    setDateFrom("");
    setDateTo("");
  };

  const statsBarItems = [
    { label: "إجمالي السجلات", value: logs.length, icon: Shield, color: "var(--color-primary)" },
    { label: "إجراءات اليوم", value: stats.todayCount, icon: Activity, color: "#059669" },
    { label: "إضافات", value: stats.counts["INSERT"] || 0, color: "#10b981" },
    { label: "تعديلات", value: stats.counts["UPDATE"] || 0, color: "#3b82f6" },
    { label: "حذف", value: stats.counts["DELETE"] || 0, color: "#ef4444" },
    { label: "مجمّع", value: stats.counts["BULK_UPDATE"] || 0, color: "#7c3aed" },
  ];

  const maxDayCount = Math.max(...last7Days.map(d => d.count), 1);

  return (
    <div className="space-y-6 animate-fadeIn">
      <Breadcrumb items={[{ label: "الإدارة" }, { label: "سجل التدقيق" }]} />

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <PageHeader
          title="سجل التدقيق والمراجعة"
          icon={Shield}
          description="تتبع شامل لكل عمليات الإدخال والتعديل والحذف والتصدير على مستوى النظام."
        />
        <div className="flex gap-2 flex-wrap">
          <Button onClick={loadLogs} variant="outline" icon={RefreshCw} loading={loading}>تحديث</Button>
          <Button onClick={handleExportCSV} variant="secondary" icon={Download}>تصدير CSV</Button>
          <Button onClick={handleExportExcel} variant="primary" icon={FileSpreadsheet}>تصدير Excel متعدد</Button>
        </div>
      </div>

      <StatsBar stats={statsBarItems} accentColor="var(--color-primary)" />

      {/* Activity Chart - Last 7 Days */}
      <Card className="p-6">
        <h3 className="text-sm font-black mb-4 text-[var(--color-text)] flex items-center gap-2">
          <TrendingUp size={16} className="text-cyan-600" />
          نشاط آخر 7 أيام
        </h3>
        <div className="flex items-end gap-3 h-40 px-2" dir="ltr">
          {last7Days.map((d, i) => {
            const heightPct = (d.count / maxDayCount) * 100;
            const date = new Date(d.day);
            const dayName = ['أحد', 'إثن', 'ثلا', 'أرب', 'خمي', 'جمع', 'سبت'][date.getDay()];
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-2 group">
                <div className="text-xs font-bold text-cyan-600 opacity-0 group-hover:opacity-100 transition-opacity">
                  {d.count}
                </div>
                <div className="w-full flex items-end h-32">
                  <div
                    className="w-full bg-gradient-to-t from-cyan-600 to-cyan-400 rounded-t-lg transition-all hover:from-cyan-500 hover:to-cyan-300"
                    style={{ height: `${heightPct}%`, minHeight: d.count > 0 ? '8px' : '2px' }}
                  />
                </div>
                <div className="text-[10px] font-bold text-[var(--color-text-muted)]">{dayName}</div>
                <div className="text-[9px] text-[var(--color-text-muted)] opacity-60">
                  {d.day.substring(5)}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Top Tables and Users Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-5">
          <h3 className="text-sm font-black mb-3 text-[var(--color-text)] flex items-center gap-2">
            <Database size={16} className="text-violet-600" />
            أكثر الجداول نشاطاً
          </h3>
          <div className="space-y-2">
            {topTables.length === 0 ? (
              <p className="text-xs text-[var(--color-text-muted)] text-center py-4">لا توجد بيانات</p>
            ) : topTables.map(([t, c]) => {
              const max = topTables[0][1];
              return (
                <div key={t}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-bold text-[var(--color-text)]">
                      {TABLE_LABELS[t] || t}
                    </span>
                    <span className="text-[var(--color-text-muted)] font-mono">{c}</span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-violet-500 to-purple-500 rounded-full"
                      style={{ width: `${(c / max) * 100}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <Card className="p-5">
          <h3 className="text-sm font-black mb-3 text-[var(--color-text)] flex items-center gap-2">
            <User size={16} className="text-emerald-600" />
            أكثر المستخدمين نشاطاً
          </h3>
          <div className="space-y-2">
            {Object.keys(stats.userCounts).length === 0 ? (
              <p className="text-xs text-[var(--color-text-muted)] text-center py-4">لا توجد بيانات</p>
            ) : Object.entries(stats.userCounts)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 5)
              .map(([u, c]) => {
                const max = Math.max(...Object.values(stats.userCounts));
                return (
                  <div key={u}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-bold text-[var(--color-text)]">{u}</span>
                      <span className="text-[var(--color-text-muted)] font-mono">{c}</span>
                    </div>
                    <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-emerald-500 to-green-500 rounded-full"
                        style={{ width: `${(c / max) * 100}%` }}
                      />
                    </div>
                  </div>
                );
              })}
          </div>
        </Card>
      </div>

      {/* Filters Card */}
      <Card className="p-4">
        <div className="flex flex-wrap gap-3 items-center" dir="rtl">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input
              type="text"
              placeholder="بحث (مستخدم، تفاصيل، جدول، رقم سجل)..."
              className="w-full pr-9 pl-3 py-2 rounded-lg border border-[var(--color-border)] text-xs bg-[var(--color-bg-card)] text-[var(--color-text)] outline-none"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {/* Date Range */}
          <div className="flex items-center gap-1 bg-[var(--color-bg)] rounded-lg border border-[var(--color-border)] p-1">
            <Calendar size={12} className="text-slate-400 mx-1" />
            <input
              type="date"
              className="p-1 rounded text-xs bg-transparent text-[var(--color-text)] outline-none"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              title="من تاريخ"
            />
            <span className="text-xs text-[var(--color-text-muted)]">→</span>
            <input
              type="date"
              className="p-1 rounded text-xs bg-transparent text-[var(--color-text)] outline-none"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              title="إلى تاريخ"
            />
          </div>

          <select className="p-2 rounded-lg border border-[var(--color-border)] text-xs bg-[var(--color-bg-card)] text-[var(--color-text)] outline-none"
            value={filterAction} onChange={(e) => setFilterAction(e.target.value)}>
            <option value="">كل الإجراءات</option>
            {Object.entries(ACTION_LABELS).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
          </select>

          <select className="p-2 rounded-lg border border-[var(--color-border)] text-xs bg-[var(--color-bg-card)] text-[var(--color-text)] outline-none"
            value={filterTable} onChange={(e) => setFilterTable(e.target.value)}>
            <option value="">كل الجداول</option>
            {availableTables.map((t) => <option key={t} value={t}>{TABLE_LABELS[t] || t}</option>)}
          </select>

          {uniqueUsers.length > 0 && (
            <select className="p-2 rounded-lg border border-[var(--color-border)] text-xs bg-[var(--color-bg-card)] text-[var(--color-text)] outline-none"
              value={filterUser} onChange={(e) => setFilterUser(e.target.value)}>
              <option value="">كل المستخدمين</option>
              {uniqueUsers.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          )}

          <select className="p-2 rounded-lg border border-[var(--color-border)] text-xs bg-[var(--color-bg-card)] text-[var(--color-text)] outline-none"
            value={limit} onChange={(e) => setLimit(parseInt(e.target.value))}>
            <option value={100}>آخر 100</option>
            <option value={500}>آخر 500</option>
            <option value={1000}>آخر 1000</option>
            <option value={5000}>آخر 5000</option>
          </select>

          {(searchTerm || filterAction || filterTable || filterUser || dateFrom || dateTo) && (
            <Button onClick={handleResetFilters} variant="ghost" size="sm">إعادة تعيين</Button>
          )}
        </div>
      </Card>

      {/* Logs Table */}
      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs" dir="rtl">
            <thead className="bg-[var(--color-bg-card)] text-[var(--color-text-muted)] font-black border-b border-[var(--color-border)]">
              <tr>
                <th className="p-3">التوقيت</th>
                <th className="p-3">المستخدم</th>
                <th className="p-3 text-center">الإجراء</th>
                <th className="p-3">الجدول</th>
                <th className="p-3 text-center">رقم السجل</th>
                <th className="p-3">التفاصيل</th>
              </tr>
            </thead>
            <tbody className="bg-[var(--color-bg)] divide-y divide-[var(--color-border)]">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-10 text-center text-[var(--color-text-muted)]">لا توجد سجلات مطابقة</td>
                </tr>
              ) : filteredLogs.map((log) => {
                const actionInfo = ACTION_LABELS[log.action] || { label: log.action, color: "bg-gray-100 text-gray-700", icon: "•" };
                return (
                  <tr key={log.id} className="hover:bg-[var(--color-bg-card)] transition-colors">
                    <td className="p-3 font-mono text-[var(--color-text-muted)] whitespace-nowrap text-[10px]">
                      {log.timestamp?.replace("T", " ").substring(0, 19)}
                    </td>
                    <td className="p-3 font-bold text-[var(--color-text)]">
                      {log.username || <span className="opacity-40 italic text-[10px]">— غير معروف —</span>}
                    </td>
                    <td className="p-3 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-black ${actionInfo.color}`}>
                        {actionInfo.icon} {actionInfo.label}
                      </span>
                    </td>
                    <td className="p-3 text-[var(--color-text-muted)]">
                      {TABLE_LABELS[log.table_name] || <span className="font-mono text-[10px]">{log.table_name}</span>}
                    </td>
                    <td className="p-3 font-mono text-center text-[var(--color-text-muted)]">{log.record_id || "—"}</td>
                    <td className="p-3 text-[var(--color-text)] max-w-md" title={log.details || ""}>
                      <div className="truncate">{log.details || "—"}</div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="p-3 border-t border-[var(--color-border)] text-xs text-[var(--color-text-muted)] flex items-center justify-between" dir="rtl">
          <span>عرض {filteredLogs.length} من أصل {logs.length} سجل</span>
          <span className="text-[10px] opacity-60">آخر تحديث: {new Date().toLocaleTimeString('ar-EG')}</span>
        </div>
      </Card>
    </div>
  );
};

export default AuditLogPage;
