/**
 * SystemPerformancePage — لوحة تحليل أداء النظام
 *
 * مؤشرات: حجم قاعدة البيانات، عدد السجلات لكل جدول،
 * سرعة الاستعلامات، عدد المستخدمين النشطين،
 * حالة سلامة قاعدة البيانات، حالة النسخ الاحتياطي.
 */
import React, { useState, useEffect, useMemo } from 'react';
import {
  Gauge, Database, HardDrive, Users, Activity,
  Clock, Shield, Server, RefreshCw, CheckCircle2,
  AlertTriangle, BarChart3, Table2, Archive, Zap,
  Loader2, Wifi, Info
} from 'lucide-react';
import invoke from '../../api/tauriApi';
import { useToast } from '../../components/ui/Toast';
import PageHeader from '../../components/ui/PageHeader';
import Breadcrumb from '../../components/ui/Breadcrumb';
import Card from '../../components/ui/Card';

const TABLES_ORDER = [
  'branches', 'areas', 'clinics', 'drug_categories', 'drugs',
  'supply_categories', 'supplies', 'insulin_codes', 'insulin_types',
  'insulin_categories', 'drug_units', 'insulin_units',
  'detailed_drug_dispensed', 'insulin_dispensed', 'drug_groups',
  'drug_group_codes', 'judicial_dispensed', 'judicial_patients',
  'judicial_medicines', 'judicial_patient_medicines', 'patient_pdfs',
  'monthly_drugs_dispensed', 'monthly_supplies_dispensed',
  'medical_tickets', 'users', 'audit_log',
  'dispensing_month_isolation', 'manual_locked_months',
];

const TABLE_LABELS = {
  branches: 'الفروع', areas: 'المناطق', clinics: 'العيادات',
  drug_categories: 'تصنيفات الأدوية', drugs: 'الأدوية',
  supply_categories: 'تصنيفات المستلزمات', supplies: 'المستلزمات',
  insulin_codes: 'أكواد الإنسولين', insulin_types: 'أنواع الإنسولين',
  insulin_categories: 'فئات الإنسولين', drug_units: 'وحدات الأدوية',
  insulin_units: 'وحدات الإنسولين',
  detailed_drug_dispensed: 'صرف الأدوية (تفصيلي)',
  insulin_dispensed: 'صرف الإنسولين',
  drug_groups: 'المجموعات الدوائية',
  drug_group_codes: 'أكواد المجموعات',
  judicial_dispensed: 'صرف الأحكام القضائية',
  judicial_patients: 'المرضى القضائيون',
  judicial_medicines: 'الأدوية القضائية',
  judicial_patient_medicines: 'أدوية المرضى القضائيين',
  patient_pdfs: 'ملفات المرضى',
  monthly_drugs_dispensed: 'المنصرف الشهري (أدوية)',
  monthly_supplies_dispensed: 'المنصرف الشهري (مستلزمات)',
  medical_tickets: 'التذاكر الطبية',
  users: 'المستخدمون',
  audit_log: 'سجل التدقيق',
  dispensing_month_isolation: 'عزل الشهر',
  manual_locked_months: 'الأشهر المقفلة',
};

const TABLE_GROUPS = [
  {
    key: 'master',
    label: 'البيانات الأساسية',
    color: 'bg-emerald-500',
    textColor: 'text-emerald-600 dark:text-emerald-400',
    bgColor: 'bg-emerald-50 dark:bg-emerald-950/20',
    tables: ['branches', 'areas', 'clinics', 'drug_categories', 'drugs',
             'supply_categories', 'supplies', 'insulin_codes', 'insulin_types',
             'insulin_categories', 'drug_units', 'insulin_units'],
  },
  {
    key: 'transactions',
    label: 'بيانات العمليات',
    color: 'bg-blue-500',
    textColor: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-50 dark:bg-blue-950/20',
    tables: ['detailed_drug_dispensed', 'insulin_dispensed', 'drug_groups',
             'drug_group_codes', 'judicial_dispensed', 'judicial_patients',
             'judicial_medicines', 'judicial_patient_medicines', 'patient_pdfs',
             'monthly_drugs_dispensed', 'monthly_supplies_dispensed', 'medical_tickets'],
  },
  {
    key: 'system',
    label: 'بيانات النظام',
    color: 'bg-purple-500',
    textColor: 'text-purple-600 dark:text-purple-400',
    bgColor: 'bg-purple-50 dark:bg-purple-950/20',
    tables: ['users', 'audit_log', 'dispensing_month_isolation', 'manual_locked_months'],
  },
];

const SystemPerformancePage = () => {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [dbSize, setDbSize] = useState(null);
  const [integrityResult, setIntegrityResult] = useState(null);
  const [backups, setBackups] = useState([]);
  const [users, setUsers] = useState([]);
  const [tableCounts, setTableCounts] = useState({});
  const [pingHistory, setPingHistory] = useState([]);
  const [showAllTables, setShowAllTables] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      // Parallel fetch of all performance indicators
      const [
        sizeResult,
        integrity,
        backupFiles,
        userList,
        summary,
      ] = await Promise.allSettled([
        invoke('get_db_size'),
        invoke('check_db_integrity'),
        invoke('get_backup_files'),
        invoke('get_users'),
        invoke('get_data_management_summary'),
      ]);

      if (sizeResult.status === 'fulfilled') setDbSize(sizeResult.value);
      if (integrity.status === 'fulfilled') setIntegrityResult(integrity.value);
      if (backupFiles.status === 'fulfilled') setBackups(backupFiles.value);
      if (userList.status === 'fulfilled') setUsers(userList.value);
      if (summary.status === 'fulfilled') {
        setTableCounts(summary.value.table_counts || {});
      }

      // Measure query speed
      const start = performance.now();
      await invoke('get_branches');
      const latency = Math.round(performance.now() - start);
      setPingHistory(prev => {
        const next = [...prev, latency];
        if (next.length > 10) next.shift();
        return next;
      });
    } catch (err) {
      toast.error(`فشل تحميل البيانات: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derived metrics ────────────────────────────────────────────────

  const avgLatency = useMemo(() => {
    if (pingHistory.length === 0) return 0;
    return Math.round(pingHistory.reduce((a, b) => a + b, 0) / pingHistory.length);
  }, [pingHistory]);

  const totalRecords = useMemo(() => {
    return Object.values(tableCounts).reduce((sum, count) => sum + count, 0);
  }, [tableCounts]);

  const transactionRecordCount = useMemo(() => {
    const txTables = TABLE_GROUPS.find(g => g.key === 'transactions')?.tables || [];
    return txTables.reduce((sum, t) => sum + (tableCounts[t] || 0), 0);
  }, [tableCounts]);

  const getLatencyLabel = (ms) => {
    if (ms === 0) return '—';
    if (ms < 50) return 'سريع جداً';
    if (ms < 150) return 'جيد';
    return 'بطيء';
  };

  // ── Rendering ──────────────────────────────────────────────────────

  const statCard = ({ title, value, unit, icon: _Icon, color, bgColor, desc }) => (
    <Card className={`p-5 ${bgColor || ''} border-none shadow-sm`}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={`p-2 rounded-xl ${color}`}>
            <_Icon size={18} className="text-white" />
          </div>
          <span className="text-xs font-bold" style={{ color: 'var(--color-text-muted)' }}>
            {title}
          </span>
        </div>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-3xl font-black" style={{ color: 'var(--color-text)' }}>
          {value ?? <Loader2 size={20} className="animate-spin inline" />}
        </span>
        {unit && <span className="text-xs font-bold" style={{ color: 'var(--color-text-muted)' }}>{unit}</span>}
      </div>
      {desc && <p className="text-[10px] font-medium mt-1" style={{ color: 'var(--color-text-muted)' }}>{desc}</p>}
    </Card>
  );

  return (
    <div className="space-y-6 animate-fadeIn pb-20" dir="rtl">
      <Breadcrumb items={[{ label: 'الإدارة' }, { label: 'أداء النظام' }]} />

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <PageHeader
          title="لوحة تحليل أداء النظام"
          icon={Gauge}
          description="مؤشرات الأداء الرئيسية: حجم قاعدة البيانات، سرعة الاستعلامات، سلامة البيانات، النشاط."
        />
        <button
          onClick={loadData}
          disabled={loading}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--color-bg-card)] border border-[var(--color-border)] text-sm font-bold hover:bg-[var(--color-bg)] transition-all cursor-pointer"
          style={{ color: 'var(--color-text)' }}
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          {loading ? 'جاري التحديث...' : 'تحديث'}
        </button>
      </div>

      {loading && Object.keys(tableCounts).length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <Loader2 size={48} className="animate-spin" style={{ color: 'var(--color-primary)' }} />
          <span className="text-lg font-bold" style={{ color: 'var(--color-text-muted)' }}>
            جاري تحميل مؤشرات الأداء...
          </span>
        </div>
      ) : (
        <div className="space-y-6">
          {/* ─── Key Metrics Row ─── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {statCard({
              title: 'حجم قاعدة البيانات',
              value: dbSize !== null ? dbSize.toFixed(2) : '—',
              unit: 'ميجابايت',
              icon: HardDrive,
              color: 'bg-gradient-to-br from-cyan-600 to-blue-600',
              desc: dbSize !== null
                ? (dbSize < 10 ? '✅ حجم مناسب' : dbSize < 50 ? '⚠️ حجم متوسط' : '🔴 حجم كبير')
                : 'جاري القياس...',
            })}
            {statCard({
              title: 'إجمالي السجلات',
              value: totalRecords.toLocaleString(),
              unit: 'سجل',
              icon: Database,
              color: 'bg-gradient-to-br from-emerald-600 to-green-600',
              desc: `${transactionRecordCount.toLocaleString()} سجل عمليات`,
            })}
            {statCard({
              title: 'سرعة الاستعلام',
              value: avgLatency || '—',
              unit: 'مث',
              icon: Zap,
              color: avgLatency < 50
                ? 'bg-gradient-to-br from-emerald-600 to-green-600'
                : avgLatency < 150
                  ? 'bg-gradient-to-br from-amber-600 to-orange-600'
                  : 'bg-gradient-to-br from-red-600 to-rose-600',
              desc: getLatencyLabel(avgLatency),
            })}
            {statCard({
              title: 'المستخدمون النشطون',
              value: users.length,
              unit: 'مستخدم',
              icon: Users,
              color: 'bg-gradient-to-br from-purple-600 to-violet-600',
              desc: users.filter(u => u.role === 'admin').length > 0
                ? `${users.filter(u => u.role === 'admin').length} مشرف`
                : 'لا يوجد مشرفين',
            })}
          </div>

          {/* ─── Integrity & Backups Row ─── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Database Integrity */}
            <Card className="p-5 border-none shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <Shield size={18} className="text-emerald-600" />
                <h3 className="text-sm font-black" style={{ color: 'var(--color-text)' }}>
                  سلامة قاعدة البيانات
                </h3>
              </div>
              {integrityResult !== null ? (
                <div className="flex items-center gap-3">
                  {integrityResult === 'ok' ? (
                    <>
                      <div className="p-2 rounded-full bg-emerald-100 dark:bg-emerald-900/40">
                        <CheckCircle2 size={28} className="text-emerald-600 dark:text-emerald-400" />
                      </div>
                      <div>
                        <p className="text-lg font-black text-emerald-600 dark:text-emerald-400">سليمة ✅</p>
                        <p className="text-[10px] font-bold" style={{ color: 'var(--color-text-muted)' }}>
                          فحص PRAGMA integrity_check — لا توجد أخطاء
                        </p>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="p-2 rounded-full bg-red-100 dark:bg-red-900/40">
                        <AlertTriangle size={28} className="text-red-600 dark:text-red-400" />
                      </div>
                      <div>
                        <p className="text-lg font-black text-red-600 dark:text-red-400">توجد مشاكل ⚠️</p>
                        <p className="text-[10px] font-bold" style={{ color: 'var(--color-text-muted)' }}>
                          {integrityResult}
                        </p>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <p className="text-sm font-bold" style={{ color: 'var(--color-text-muted)' }}>
                  لم يتم الفحص بعد
                </p>
              )}
            </Card>

            {/* Backup Summary */}
            <Card className="p-5 border-none shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <Archive size={18} className="text-amber-600" />
                <h3 className="text-sm font-black" style={{ color: 'var(--color-text)' }}>
                  حالة النسخ الاحتياطي
                </h3>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold" style={{ color: 'var(--color-text-muted)' }}>
                    عدد النسخ
                  </span>
                  <span className="text-xl font-black" style={{ color: 'var(--color-text)' }}>
                    {backups.length}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold" style={{ color: 'var(--color-text-muted)' }}>
                    آخر نسخة
                  </span>
                  <span className="text-xs font-bold" style={{ color: 'var(--color-text-muted)' }}>
                    {backups.length > 0
                      ? new Date(backups[0].date).toLocaleDateString('ar-EG')
                      : '—'}
                  </span>
                </div>
                {backups.length > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold" style={{ color: 'var(--color-text-muted)' }}>
                      إجمالي حجم النسخ
                    </span>
                    <span className="text-xs font-bold" style={{ color: 'var(--color-primary)' }}>
                      {backups.reduce((sum, b) => sum + (b.size || 0), 0).toFixed(0)} KB
                    </span>
                  </div>
                )}
                <div className="pt-2">
                  <div className="w-full" style={{ background: 'var(--color-bg)', borderRadius: '8px', height: '4px' }}>
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-amber-500 to-emerald-500"
                      style={{ width: `${Math.min(backups.length / 10 * 100, 100)}%` }}
                    />
                  </div>
                  <p className="text-[9px] font-bold mt-1" style={{ color: 'var(--color-text-muted)' }}>
                    يُنصح بالاحتفاظ بـ 5-10 نسخ احتياطية على الأقل
                  </p>
                </div>
              </div>
            </Card>
          </div>

          {/* ─── Ping History Chart ─── */}
          {pingHistory.length > 0 && (
            <Card className="p-5 border-none shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <Activity size={18} className="text-cyan-600" />
                <h3 className="text-sm font-black" style={{ color: 'var(--color-text)' }}>
                  زمن الاستجابة (آخر {pingHistory.length} قياسات)
                </h3>
              </div>
              <div className="flex items-end gap-2 h-20" dir="ltr">
                {pingHistory.map((ms, i) => {
                  const maxVal = Math.max(...pingHistory, 1);
                  const height = Math.max((ms / maxVal) * 100, 8);
                  const barColor = ms < 50 ? 'bg-emerald-500' : ms < 150 ? 'bg-amber-500' : 'bg-red-500';
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1">
                      <div
                        className={`w-full rounded-t-md transition-all ${barColor}`}
                        style={{ height: `${height}%`, minHeight: '4px' }}
                        title={`${ms}مث`}
                      />
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center justify-between mt-3">
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1 text-[9px] font-bold" style={{ color: 'var(--color-text-muted)' }}>
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    &lt; 50مث
                  </span>
                  <span className="flex items-center gap-1 text-[9px] font-bold" style={{ color: 'var(--color-text-muted)' }}>
                    <span className="w-2 h-2 rounded-full bg-amber-500" />
                    50-150مث
                  </span>
                  <span className="flex items-center gap-1 text-[9px] font-bold" style={{ color: 'var(--color-text-muted)' }}>
                    <span className="w-2 h-2 rounded-full bg-red-500" />
                    &gt; 150مث
                  </span>
                </div>
                <span className="text-[9px] font-bold" style={{ color: 'var(--color-text-muted)' }}>
                  المتوسط: {avgLatency}مث
                </span>
              </div>
            </Card>
          )}

          {/* ─── Table Record Counts ─── */}
          <Card className="p-5 border-none shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Table2 size={18} className="text-indigo-600" />
                <h3 className="text-sm font-black" style={{ color: 'var(--color-text)' }}>
                  عدد السجلات في الجداول
                </h3>
              </div>
              <button
                onClick={() => setShowAllTables(!showAllTables)}
                className="text-[10px] font-bold px-3 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                style={{ color: 'var(--color-primary)' }}
              >
                {showAllTables ? 'عرض المجموعات' : 'عرض الكل'}
              </button>
            </div>

            <div className="space-y-4">
              {TABLE_GROUPS.map((group) => {
                // In summary mode, only show grouped; in all mode, show individual
                const total = group.tables.reduce((sum, t) => sum + (tableCounts[t] || 0), 0);
                if (total === 0 && !showAllTables) return null;

                return (
                  <div key={group.key}>
                    {/* Group header */}
                    <div
                      className="flex items-center justify-between px-3 py-2 rounded-lg mb-2"
                      style={{ background: group.bgColor }}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${group.color}`} />
                        <span className={`text-xs font-black ${group.textColor}`}>
                          {group.label}
                        </span>
                      </div>
                      <span className={`text-xs font-black ${group.textColor}`}>
                        {total.toLocaleString()} سجل
                      </span>
                    </div>

                    {/* Individual tables */}
                    <div className="space-y-1 mr-4">
                      {(showAllTables ? group.tables : group.tables.filter(t => (tableCounts[t] || 0) > 0)).map((table) => (
                        <div
                          key={table}
                          className="flex items-center justify-between px-3 py-1.5 rounded-lg text-xs"
                          style={{ color: 'var(--color-text-muted)' }}
                        >
                          <span className="font-bold">{TABLE_LABELS[table] || table}</span>
                          <div className="flex items-center gap-2">
                            <div
                              className="h-1.5 rounded-full"
                              style={{
                                width: `${Math.min((tableCounts[table] || 0) / Math.max(totalRecords, 1) * 200, 100)}px`,
                                background: group.color
                                  .replace('bg-', '')
                                  .replace('emerald-500', '#10b981')
                                  .replace('blue-500', '#3b82f6')
                                  .replace('purple-500', '#8b5cf6'),
                              }}
                            />
                            <span className="font-black font-mono text-[10px] min-w-[40px] text-left" style={{ color: 'var(--color-text)' }}>
                              {(tableCounts[table] || 0).toLocaleString()}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            {totalRecords > 0 && (
              <div className="mt-4 pt-3 border-t" style={{ borderColor: 'var(--color-border)' }}>
                <div className="flex items-center justify-between px-3">
                  <span className="text-xs font-black" style={{ color: 'var(--color-text)' }}>
                    الإجمالي العام
                  </span>
                  <span className="text-base font-black" style={{ color: 'var(--color-primary)' }}>
                    {totalRecords.toLocaleString()} سجل
                  </span>
                </div>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
};

export default SystemPerformancePage;
