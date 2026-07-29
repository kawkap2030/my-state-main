import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard, FileText, Syringe, ShoppingCart, Scale,
  Activity, ClipboardList, Layers, Landmark, ArrowRight,
  Building2, CalendarDays, AlertCircle, CheckCircle2,
  TrendingUp, Clock, BarChart4, Sparkles, RefreshCw,
  Calendar, History, DollarSign, CalendarX2, AlertTriangle,
  BarChart3, TrendingDown
} from 'lucide-react';
import { Link } from 'react-router-dom';
import Breadcrumb from '../../components/ui/Breadcrumb';
import StatCard from '../../components/dashboard/StatCard';
import DashboardChart from '../../components/dashboard/DashboardChart';
import QuickAccessClinic from '../../components/dashboard/QuickAccessClinic';
import MonthIsolationWidget from '../../components/dashboard/MonthIsolationWidget';
import PerformanceSummary from '../../components/dashboard/PerformanceSummary';
import Card from '../../components/ui/Card';
import invoke from '../../api/tauriApi';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Legend } from 'recharts';

const quickLinks = [
  { label: 'منصرف الأدوية (تفصيلي)', to: '/transactions/drug-dispensing', icon: ShoppingCart, color: 'var(--color-dash-5)' },
  { label: 'منصرف الأنسولين', to: '/transactions/insulin-dispensing', icon: Syringe, color: 'var(--color-dash-2)' },
  { label: 'المنصرف الشهري', to: '/transactions/monthly-totals', icon: FileText, color: 'var(--color-dash-1)' },
  { label: 'منصرف التذاكر الطبية', to: '/transactions/medical-tickets', icon: ClipboardList, color: 'var(--color-dash-3)' },
  { label: 'تكلفة المجموعات الدوائية', to: '/transactions/group-costs', icon: Layers, color: 'var(--color-dash-4)' },
  { label: 'منصرف الأحكام القضائية', to: '/transactions/judicial-dispensing', icon: Scale, color: 'var(--color-dash-6)' },
];

// Helper: get time-based greeting
const getGreeting = () => {
  const h = new Date().getHours();
  if (h < 12) return 'صباح الخير';
  if (h < 17) return 'مساء الخير';
  return 'مساء النور';
};

const DashboardPage = () => {
  const [branches, setBranches] = useState([]);
  const [selectedBranch, setSelectedBranch] = useState('');
  const [dispenseMonth, setDispenseMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  const [summary, setSummary] = useState({
    total_dispensed: 0,
    active_clinics: 0,
    tickets_count: 0,
    judicial_count: 0,
    authority_cost: 0,
  });

  const [prevSummary, setPrevSummary] = useState({
    total_dispensed: 0,
    active_clinics: 0,
    tickets_count: 0,
    judicial_count: 0,
    authority_cost: 0,
  });

  const [trendData, setTrendData] = useState([]);
  const [anomalies, setAnomalies] = useState(null);
  const [expandedAlert, setExpandedAlert] = useState(false);
  const [performanceMetrics, setPerformanceMetrics] = useState([]);
  const [perfLoading, setPerfLoading] = useState(true);
  const [hasMonthData, setHasMonthData] = useState(false);
  const [prevMonthHasData, setPrevMonthHasData] = useState(false);

  // New dashboard widgets
  const [ytdData, setYtdData] = useState(null); // { current, previous }
  const [missingMonths, setMissingMonths] = useState([]);
  const [recentActivity, setRecentActivity] = useState([]);
  const [staleWarning, setStaleWarning] = useState('');

  const calcTrend = (current, previous) => {
    if (!previous || previous === 0) return { dir: 'up', val: '-', pct: 0 };
    const diff = current - previous;
    const pct = (diff / previous) * 100;
    return {
      dir: diff >= 0 ? 'up' : 'down',
      val: `${Math.abs(pct).toFixed(1)}%`,
      pct,
    };
  };

  const calcProgress = (current, previous) => {
    if (!previous || previous === 0) return 50;
    const pct = (current / previous) * 100;
    return Math.min(Math.max(pct, 0), 100);
  };

  useEffect(() => {
    invoke('get_branches').then(setBranches).catch(console.error);
    invoke('get_latest_dispense_month')
      .then((val) => {
        if (val && typeof val === 'string' && val.includes('-')) {
          setDispenseMonth(val);
        }
      })
      .catch(console.error);
  }, []);

  // Fetch YTD, missing months, recent activity on mount/month change
  const currentYear = (dispenseMonth || '').split('-')[0] || new Date().getFullYear().toString();
  useEffect(() => {
    // YTD for current year
    invoke('get_ytd_summary', {
      branchId: selectedBranch ? parseInt(selectedBranch) : null,
      year: currentYear,
    }).then(setYtdData).catch(console.error);

    // Missing months
    invoke('get_missing_months', {
      branchId: selectedBranch ? parseInt(selectedBranch) : null,
    }).then(setMissingMonths).catch(console.error);

    // Recent activity
    invoke('get_recent_activity', { limit: 8 }).then(setRecentActivity).catch(console.error);

    // Stale data warning
    invoke('get_latest_dispense_month')
      .then((latest) => {
        if (latest && typeof latest === 'string' && latest.includes('-')) {
          const [ly, lm] = latest.split('-').map(Number);
          const now = new Date();
          const latestDate = new Date(ly, lm - 1);
          const diffMonths = (now.getFullYear() - latestDate.getFullYear()) * 12 + (now.getMonth() - latestDate.getMonth());
          if (diffMonths >= 2) {
            setStaleWarning(`آخر تحديث للبيانات: ${latest} — لم يتم إدخال بيانات منذ ${diffMonths} أشهر`);
          } else {
            setStaleWarning('');
          }
        }
      })
      .catch(() => setStaleWarning(''));
  }, [selectedBranch, currentYear]);

  useEffect(() => {
    if (!dispenseMonth || typeof dispenseMonth !== 'string') return;

    invoke('get_dashboard_summary', {
      branchId: selectedBranch ? parseInt(selectedBranch) : null,
      dispenseMonth,
    })
      .then((data) => {
        if (data) {
          setSummary({
            total_dispensed: data.total_dispensed ?? 0,
            active_clinics: data.active_clinics ?? 0,
            tickets_count: data.tickets_count ?? 0,
            judicial_count: data.judicial_count ?? 0,
            authority_cost: data.authority_cost ?? 0,
          });
        }
      })
      .catch(console.error);

    // Previous month calculation (outside if-block for scope)
    let prevMonthStr = '';
    const partsDate = dispenseMonth.split('-');
    if (partsDate.length >= 2) {
      let py = parseInt(partsDate[0]);
      let pm = parseInt(partsDate[1]);
      if (pm === 1) { pm = 12; py -= 1; } else { pm -= 1; }
      prevMonthStr = `${py}-${String(pm).padStart(2, '0')}`;

      invoke('get_dashboard_summary', {
        branchId: selectedBranch ? parseInt(selectedBranch) : null,
        dispenseMonth: prevMonthStr,
      })
        .then((data) => {
          if (data) {
            setPrevSummary({
              total_dispensed: data.total_dispensed ?? 0,
              active_clinics: data.active_clinics ?? 0,
              tickets_count: data.tickets_count ?? 0,
              judicial_count: data.judicial_count ?? 0,
              authority_cost: data.authority_cost ?? 0,
            });
          }
        })
        .catch(console.error);
    }

    // Trend
    const parts = dispenseMonth.split('-');
    if (parts.length < 2) return;
    const [year, month] = parts.map(Number);
    const monthsList = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(year, month - 1 - i, 1);
      monthsList.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }

    invoke('get_dashboard_trend', {
      branchId: selectedBranch ? parseInt(selectedBranch) : null,
      months: monthsList,
    })
      .then(setTrendData)
      .catch(console.error);

    // Performance metrics (real data, not mock)
    invoke('get_performance_metrics', {
      branchId: selectedBranch ? parseInt(selectedBranch) : null,
      dispenseMonth,
    })
      .then(setPerformanceMetrics)
      .catch(console.error)
      .finally(() => setPerfLoading(false));

    // Check if current month has data
    Promise.all([
      invoke('check_month_data_exists', {
        branchId: selectedBranch ? parseInt(selectedBranch) : null,
        dispenseMonth,
      }),
      invoke('check_month_data_exists', {
        branchId: selectedBranch ? parseInt(selectedBranch) : null,
        dispenseMonth: prevMonthStr || dispenseMonth,
      })
    ])
      .then(([current, previous]) => {
        setHasMonthData(!!current);
        setPrevMonthHasData(!!previous);
      })
      .catch(() => {
        setHasMonthData(true);
        setPrevMonthHasData(true);
      });

    // Anomalies
    invoke('get_anomaly_report', {
      branchId: selectedBranch ? parseInt(selectedBranch) : null,
      areaId: null,
      dispenseMonth,
    })
      .then((data) => {
        if (data) setAnomalies(data);
      })
      .catch(console.error);
  }, [selectedBranch, dispenseMonth]);

  const handleExportYtd = async () => {
    if (!ytdData?.current && ytdData?.current !== 0) return;
    try {
      const tables = ['detailed_drug_dispensed', 'monthly_drugs_dispensed', 'insulin_dispensed', 'monthly_supplies_dispensed', 'judicial_dispensed'];
      await invoke('export_to_excel', { tableNames: tables, customSavePath: null });
    } catch (err) {
      if (err !== 'CANCELLED' && !err?.includes('CANCELLED')) {
        console.error('Export YTD failed:', err);
      }
    }
  };

  const totalOutliers = anomalies?.clinic_outliers?.length || 0;
  const totalSurges = anomalies?.surge_drugs?.length || 0;
  const totalAlerts = totalOutliers + totalSurges;

  return (
    <div dir="rtl" className="animate-in fade-in duration-500 pb-10">
      <Breadcrumb items={[{ label: 'الرئيسية' }]} />

      {/* ── Header Section ─────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
        <div className="flex items-center gap-4">
          <div
            className="section-icon"
            style={{
              background: 'linear-gradient(135deg, var(--color-primary), var(--color-secondary))',
              color: 'white',
              boxShadow: '0 8px 24px rgba(8, 145, 178, 0.25)',
            }}
          >
            <LayoutDashboard size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight" style={{ color: 'var(--color-text)' }}>
              {getGreeting()} 👋
            </h1>
            <p className="text-sm font-medium" style={{ color: 'var(--color-text-muted)' }}>
              مرحباً بك في نظام إحصائيات الأدوية والمستلزمات الطبية
            </p>
          </div>
        </div>

        {/* Control Bar */}
        <div
          className="flex items-center gap-3 p-1.5 px-4 rounded-full shadow-sm border transition-colors duration-300"
          style={{
            background: 'var(--color-bg-card)',
            borderColor: 'var(--color-border)',
          }}
        >
          <div
            className="flex items-center gap-2 border-l pl-3 ml-1"
            style={{ borderColor: 'var(--color-border)' }}
          >
            <Building2 size={16} className="opacity-80" style={{ color: 'var(--color-primary)' }} />
            <select
              className="bg-transparent border-none outline-none text-xs font-black cursor-pointer p-1"
              style={{ color: 'var(--color-text)' }}
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value)}
            >
              <option value="">-- جميع الفروع --</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <div
            className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity relative"
            onClick={(e) => {
              const input = e.currentTarget.querySelector('input');
              if (input && input.showPicker) input.showPicker();
            }}
          >
            <CalendarDays size={16} className="opacity-80" style={{ color: 'var(--color-primary)' }} />
            <input
              type="month"
              className="bg-transparent border-none outline-none text-xs font-black cursor-pointer p-1"
              style={{ colorScheme: 'light dark', color: 'var(--color-text)' }}
              value={dispenseMonth}
              onChange={(e) => setDispenseMonth(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* ── Stale Data Warning ────────────────────────────────────────── */}
      {staleWarning && (
        <div className="flex items-center gap-3 p-4 mb-6 rounded-2xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 animate-slideUp">
          <AlertTriangle size={20} className="text-amber-600 dark:text-amber-400 shrink-0" />
          <p className="text-sm font-bold text-amber-700 dark:text-amber-300">
            {staleWarning}
          </p>
          <Link
            to="/transactions/monthly-totals"
            className="mr-auto text-[10px] font-bold text-amber-600 bg-amber-100 dark:bg-amber-800 px-3 py-1.5 rounded-lg hover:bg-amber-200 dark:hover:bg-amber-700 transition-colors no-underline"
          >
            إدخال بيانات
          </Link>
        </div>
      )}

      <div className="w-full h-px mb-8 opacity-50" style={{ background: 'var(--color-border)' }} />

      {/* ── Top Stats Grid ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-5 mb-8">
        <StatCard
          label="إجمالي المنصرف"
          value={(summary?.total_dispensed ?? 0).toLocaleString()}
          subValue="ج.م"
          trend={calcTrend(summary?.total_dispensed, prevSummary?.total_dispensed).dir}
          trendValue={calcTrend(summary?.total_dispensed, prevSummary?.total_dispensed).val}
          icon={BarChart4}
          color="var(--color-dash-1)"
          progress={calcProgress(summary?.total_dispensed, prevSummary?.total_dispensed || summary?.total_dispensed * 0.8)}
          progressLabel="مقارنة بالشهر السابق"
        />
        <StatCard
          label="تكلفة الهيئة"
          value={(summary?.authority_cost ?? 0).toLocaleString()}
          subValue="ج.م"
          trend={calcTrend(summary?.authority_cost, prevSummary?.authority_cost).dir}
          trendValue={calcTrend(summary?.authority_cost, prevSummary?.authority_cost).val}
          icon={Landmark}
          color="var(--color-dash-2)"
          badge="مباشر"
          progress={calcProgress(summary?.authority_cost, prevSummary?.authority_cost || summary?.authority_cost * 0.75)}
          progressLabel="من إجمالي المنصرف"
        />
        <StatCard
          label="العيادات النشطة"
          value={(summary?.active_clinics ?? 0).toLocaleString()}
          subValue="عيادة"
          trend={calcTrend(summary?.active_clinics, prevSummary?.active_clinics).dir}
          trendValue={calcTrend(summary?.active_clinics, prevSummary?.active_clinics).val}
          icon={Activity}
          color="var(--color-dash-3)"
        />
        <StatCard
          label="تذاكر طبية"
          value={(summary?.tickets_count ?? 0).toLocaleString()}
          subValue="تذكرة"
          trend={calcTrend(summary?.tickets_count, prevSummary?.tickets_count).dir}
          trendValue={calcTrend(summary?.tickets_count, prevSummary?.tickets_count).val}
          icon={ClipboardList}
          color="var(--color-dash-4)"
          badge={summary?.tickets_count > 0 ? `${Math.round(summary.tickets_count / (summary.active_clinics || 1))}/عيادة` : undefined}
        />
        <StatCard
          label="مرضى الأحكام"
          value={(summary?.judicial_count ?? 0).toLocaleString()}
          subValue="ملف"
          trend={calcTrend(summary?.judicial_count, prevSummary?.judicial_count).dir}
          trendValue={calcTrend(summary?.judicial_count, prevSummary?.judicial_count).val}
          icon={Scale}
          color="var(--color-dash-5)"
        />
        <StatCard
          label="إجمالي السنة (YTD)"
          value={ytdData?.current !== undefined ? ytdData.current.toLocaleString() : '...'}
          subValue="ج.م"
          trend={ytdData?.previous && ytdData?.current >= ytdData.previous ? 'up' : ytdData?.previous ? 'down' : undefined}
          trendValue={ytdData?.previous > 0 ? `${Math.abs(((ytdData.current - ytdData.previous) / ytdData.previous) * 100).toFixed(1)}%` : undefined}
          icon={DollarSign}
          color="var(--color-dash-6)"
          badge={`${currentYear} vs ${parseInt(currentYear)-1}`}
          progress={ytdData?.previous > 0 ? Math.min((ytdData.current / ytdData.previous) * 100, 100) : undefined}
          progressLabel="مقارنة بنفس الفترة من العام الماضي"
          onClick={handleExportYtd}
        />
      </div>

      {/* ── Main Content Grid ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-8">
        {/* Left Column: Widgets (3/12) */}
        <div className="lg:col-span-4 space-y-6">
          <MonthIsolationWidget branchId={selectedBranch} dispenseMonth={dispenseMonth} />
          <QuickAccessClinic branchId={selectedBranch} dispenseMonth={dispenseMonth} />

          {/* Smart Reminder — Dynamic */}
          <Card className="border-t-4 border-t-amber-500 overflow-hidden">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                <Sparkles size={18} />
              </div>
              <h3 className="text-sm font-bold" style={{ color: 'var(--color-text)' }}>
                تذكير ذكي
              </h3>
            </div>
            <div className="space-y-2">
              {hasMonthData ? (
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-900/30">
                  <CheckCircle2 size={14} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <p className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                    تم إدخال بيانات الشهر الحالي ✅ يمكنك مراجعة التقارير
                  </p>
                </div>
              ) : (
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-sky-50 dark:bg-sky-900/20 border border-sky-100 dark:border-sky-900/30">
                  <Clock size={14} className="text-sky-600 dark:text-sky-400 shrink-0" />
                  <p className="text-[10px] font-bold text-sky-700 dark:text-sky-300">
                    {(summary?.total_dispensed ?? 0) > 0 
                      ? 'تم إدخال بعض البيانات ولكن لم يكتمل الشهر بعد'
                      : 'لم يتم إدخال بيانات هذا الشهر بعد للفرع المحدد'}
                  </p>
                </div>
              )}
              <div className={`flex items-center gap-2 p-2.5 rounded-lg border ${prevMonthHasData ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-100 dark:border-emerald-900/30' : 'bg-slate-50 dark:bg-slate-900/20 border-slate-200 dark:border-slate-700'}`}>
                <Clock size={14} className={`shrink-0 ${prevMonthHasData ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`} />
                <p className={`text-[10px] font-bold ${prevMonthHasData ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-500 dark:text-slate-400'}`}>
                  {prevMonthHasData ? 'آخر تحديث للبيانات: الشهر السابق موجود ✅' : 'الشهر السابق: لا توجد بيانات مسجلة'}
                </p>
              </div>
            </div>
          </Card>
        </div>

        {/* Right Column: Chart (5/12) */}
        <div className="lg:col-span-8">
          <DashboardChart data={trendData} />
        </div>
      </div>

      {/* ── Year-over-Year Comparison Chart ──────────────────────────── */}
      {ytdData && (ytdData.current > 0 || ytdData.previous > 0) && (
        <div className="mb-8">
          <Card className="p-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-cyan-100 dark:bg-cyan-900/30 text-cyan-600 dark:text-cyan-400 flex items-center justify-center">
                  <BarChart3 size={18} />
                </div>
                <h3 className="text-sm font-bold" style={{ color: 'var(--color-text)' }}>
                  مقارنة سنوية: {parseInt(currentYear)-1} vs {currentYear}
                </h3>
              </div>
              <div className="flex items-center gap-4 text-xs font-bold">
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded-sm" style={{background: 'var(--color-dash-6)'}} />
                  {parseInt(currentYear)-1}
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded-sm" style={{background: 'var(--color-primary)'}} />
                  {currentYear}
                </span>
              </div>
            </div>
            <div style={{ width: '100%', height: 200 }}>
              <ResponsiveContainer>
                <BarChart data={[
                  { year: String(parseInt(currentYear)-1), value: ytdData.previous },
                  { year: currentYear, value: ytdData.current }
                ]}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
                  <XAxis dataKey="year" tick={{ fontSize: 11, fontWeight: 'bold' }} />
                  <YAxis hide />
                  <Tooltip 
                    formatter={(val) => `${val.toLocaleString()} ج.م`}
                    contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                  />
                  <Bar dataKey="value" radius={[8, 8, 0, 0]} barSize={60}>
                    <Cell fill="var(--color-dash-6)" />
                    <Cell fill="var(--color-primary)" />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            {ytdData.previous > 0 && (
              <div className="mt-4 flex items-center gap-2 text-xs font-bold" style={{color: 'var(--color-text-muted)'}}>
                {ytdData.current >= ytdData.previous ? (
                  <><TrendingUp size={14} className="text-emerald-500" /> زيادة بنسبة {((ytdData.current - ytdData.previous) / ytdData.previous * 100).toFixed(1)}% عن العام الماضي</>
                ) : (
                  <><TrendingDown size={14} className="text-red-500" /> انخفاض بنسبة {((ytdData.previous - ytdData.current) / ytdData.previous * 100).toFixed(1)}% عن العام الماضي</>
                )}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ── Performance Summary (بيانات حقيقية من API) ──────────────────────── */}
      <div className="mb-8">
        {perfLoading ? (
          <div className="flex items-center justify-center py-12 text-[var(--color-text-muted)]">
            <RefreshCw size={20} className="animate-spin ml-2" />
            <span className="text-xs font-bold">جاري تحميل بيانات الأداء...</span>
          </div>
        ) : (
          <PerformanceSummary metrics={performanceMetrics} />
        )}
      </div>

      {/* ── Quick Links ────────────────────────────────────────────────── */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
            <Layers size={18} />
          </div>
          <h2 className="text-lg font-bold" style={{ color: 'var(--color-text)' }}>
            وصول سريع للعمليات
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {quickLinks.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              state={{ dispenseMonth, branchId: selectedBranch }}
              className="no-underline group"
            >
              <Card className="hover:border-primary/30 transition-all duration-300">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform"
                      style={{
                        backgroundColor: `color-mix(in srgb, ${link.color}, transparent 85%)`,
                        color: link.color,
                      }}
                    >
                      <link.icon size={20} />
                    </div>
                    <span className="font-bold text-sm" style={{ color: 'var(--color-text)' }}>
                      {link.label}
                    </span>
                  </div>
                  <ArrowRight
                    size={16}
                    className="opacity-50 group-hover:text-primary transition-all group-hover:translate-x-[-4px]"
                    style={{ color: 'var(--color-text-muted)' }}
                  />
                </div>
              </Card>
            </Link>
          ))}
        </div>
      </div>

      {/* ── Missing Months + Recent Activity ──────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {/* Missing Months */}
        <Card className="border-t-4 border-t-amber-500 p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <CalendarX2 size={20} />
            </div>
            <div>
              <h4 className="font-bold text-sm" style={{ color: 'var(--color-text)' }}>الشهور الناقصة</h4>
              <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                {missingMonths.length > 0 ? `${missingMonths.length} شهر لم يتم إدخال بياناته` : 'جميع الشهور مكتملة ✅'}
              </p>
            </div>
          </div>

          {missingMonths.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {missingMonths.slice(0, 6).map((m) => {
                const [y, mo] = m.split('-');
                const monthNames = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
                const monthIdx = parseInt(mo) - 1;
                return (
                  <Link
                    key={m}
                    to="/transactions/monthly-totals"
                    state={{ dispenseMonth: m, branchId: selectedBranch }}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 text-[10px] font-bold text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors no-underline"
                  >
                    <Calendar size={12} />
                    {monthNames[monthIdx] || m} {y}
                  </Link>
                );
              })}
              {missingMonths.length > 6 && (
                <span className="text-[10px] font-bold text-slate-400 self-center">
                  +{missingMonths.length - 6} أخرى
                </span>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-4 opacity-60" style={{ color: 'var(--color-text-muted)' }}>
              <CheckCircle2 size={24} className="mb-1 text-emerald-500" />
              <p className="text-xs font-bold">جميع الشهور الـ12 الأخيرة مكتملة</p>
            </div>
          )}
        </Card>

        {/* Recent Activity */}
        <Card className="border-t-4 border-t-cyan-500 p-5 max-h-[220px] overflow-hidden flex flex-col">
          <div className="flex items-center gap-3 mb-3 shrink-0">
            <div className="w-10 h-10 rounded-xl bg-cyan-100 dark:bg-cyan-900/30 text-cyan-600 dark:text-cyan-400 flex items-center justify-center">
              <History size={20} />
            </div>
            <h4 className="font-bold text-sm" style={{ color: 'var(--color-text)' }}>آخر النشاطات</h4>
          </div>

          {recentActivity.length > 0 ? (
            <div className="flex-1 overflow-y-auto space-y-1.5">
              {recentActivity.slice(0, 6).map((act, i) => {
                const actionLabels = {
                  'إضافة': 'إضافة',
                  'تعديل': 'تعديل',
                  'حذف': 'حذف',
                };
                const label = actionLabels[act.action] || act.action;
                const isAdd = act.action === 'إضافة' || act.action === 'add';
                const isDelete = act.action === 'حذف' || act.action === 'delete';
                const color = isAdd ? 'text-emerald-600' : isDelete ? 'text-red-500' : 'text-amber-500';
                return (
                  <div key={i} className="flex items-start gap-2 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                    <span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${isAdd ? 'bg-emerald-500' : isDelete ? 'bg-red-500' : 'bg-amber-500'}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-bold truncate" style={{ color: 'var(--color-text)' }}>
                        <span className={color}>{label}</span>
                        {' '}{act.details || act.table_name}
                      </p>
                      <p className="text-[8px]" style={{ color: 'var(--color-text-muted)' }}>
                        {act.timestamp ? (() => {
                        // SQLite format: YYYY-MM-DD HH:MM:SS → ISO 8601
                        const iso = act.timestamp.includes('T') ? act.timestamp : act.timestamp.replace(' ', 'T') + 'Z';
                        try { return new Date(iso).toLocaleString('ar-EG'); } catch { return act.timestamp; }
                      })() : ''}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-4 opacity-60" style={{ color: 'var(--color-text-muted)' }}>
              <History size={24} className="mb-1" />
              <p className="text-xs font-bold">لا توجد نشاطات حديثة</p>
            </div>
          )}
        </Card>
      </div>

      {/* ── Insights & Alerts ──────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Anomaly Alerts */}
        <Card className="flex flex-col p-6 border-t-4 border-t-red-500 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-red-500/5 rounded-full -mr-10 -mt-10 blur-xl group-hover:bg-red-500/10 transition-colors" />

          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-500/10 text-red-600 flex items-center justify-center">
                <AlertCircle size={20} />
              </div>
              <div>
                <h4 className="font-bold text-sm" style={{ color: 'var(--color-text)' }}>
                  تنبيهات الانحرافات
                </h4>
                <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                  {totalOutliers} انحراف مسجل
                </p>
              </div>
            </div>
            {totalAlerts > 0 && (
              <span className="text-[10px] font-black px-2 py-1 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 animate-pulse">
                {totalAlerts} تنبيه
              </span>
            )}
          </div>

          <div className="flex-1 overflow-y-auto" style={{ maxHeight: expandedAlert ? '240px' : '120px' }}>
            {anomalies && anomalies.clinic_outliers?.length > 0 ? (
              <ul className="space-y-2">
                {anomalies.clinic_outliers.slice(0, 5).map((outlier, i) => (
                  <li key={i} className="flex items-start gap-2 p-2 rounded-lg bg-red-50/60 dark:bg-red-900/10 border border-red-100 dark:border-red-900/20">
                    <span className="w-2 h-2 rounded-full bg-red-500 mt-1.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-bold truncate" style={{ color: 'var(--color-text)' }}>
                        {outlier.clinic_name} — {outlier.drug_name}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] font-bold text-red-500">
                          {outlier.deviation_pct.toFixed(0)}% زيادة
                        </span>
                        <span className="text-[9px]" style={{ color: 'var(--color-text-muted)' }}>
                          (الكمية: {outlier.actual_qty})
                        </span>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="flex flex-col items-center justify-center h-full opacity-70" style={{ color: 'var(--color-text-muted)' }}>
                <CheckCircle2 size={28} className="mb-2 text-green-500" />
                <p className="text-xs font-bold">لا توجد انحرافات حرجة</p>
              </div>
            )}
          </div>

          {totalOutliers > 3 && (
            <button
              onClick={() => setExpandedAlert(!expandedAlert)}
              className="mt-2 text-[10px] font-bold text-primary hover:text-primary-dark transition-colors"
            >
              {expandedAlert ? 'عرض أقل ▲' : `عرض الكل (${totalOutliers}) ▼`}
            </button>
          )}
        </Card>

        {/* Surge Detection */}
        <Card className="flex flex-col p-6 border-t-4 border-t-purple-500 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/5 rounded-full -mr-10 -mt-10 blur-xl group-hover:bg-purple-500/10 transition-colors" />

          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-600 flex items-center justify-center">
                <TrendingUp size={20} />
              </div>
              <div>
                <h4 className="font-bold text-sm" style={{ color: 'var(--color-text)' }}>
                  نمو مفاجئ (Surges)
                </h4>
                <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                  {totalSurges} صنف بقفزة غير متوقعة
                </p>
              </div>
            </div>
            {totalSurges > 0 && (
              <span className="text-[10px] font-black px-2 py-1 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400">
                {totalSurges} صنف
              </span>
            )}
          </div>

          <div className="flex-1 overflow-y-auto" style={{ maxHeight: '120px' }}>
            {anomalies && anomalies.surge_drugs?.length > 0 ? (
              <ul className="space-y-2">
                {anomalies.surge_drugs.slice(0, 4).map((surge, i) => (
                  <li key={i} className="flex items-start gap-2 p-2 rounded-lg bg-purple-50/60 dark:bg-purple-900/10 border border-purple-100 dark:border-purple-900/20">
                    <span className="w-2 h-2 rounded-full bg-purple-500 mt-1.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-bold truncate" style={{ color: 'var(--color-text)' }}>
                        {surge.drug_name}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] font-bold text-purple-500">
                          {surge.growth_pct.toFixed(0)}% نمو
                        </span>
                        <span className="text-[9px]" style={{ color: 'var(--color-text-muted)' }}>
                          (التكلفة: {surge.current_cost?.toLocaleString() || surge.current_cost} ج.م)
                        </span>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="flex flex-col items-center justify-center h-full opacity-70" style={{ color: 'var(--color-text-muted)' }}>
                <CheckCircle2 size={28} className="mb-2 text-green-500" />
                <p className="text-xs font-bold">نمط الاستهلاك مستقر</p>
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
};

export default DashboardPage;
