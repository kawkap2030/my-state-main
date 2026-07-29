/**
 * LockManagementPage — Interactive calendar for month lock management.
 *
 * Features:
 *   - Grid calendar showing up to 24 months (2 rows × 12 columns)
 *   - Color-coded lock status (green=open, red=manual-lock, amber=smart-lock)
 *   - Click a month to toggle lock (password-protected for unlocking)
 *   - Batch lock/unlock selected months
 *   - Smart lock timeline showing the 4-month rule
 *   - Lock legend
 *   - Month detail panel on selection
 */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Lock, Unlock, Calendar, AlertCircle, ShieldCheck,
  Info, ChevronLeft, ChevronRight, Plus, CheckCircle2,
  Clock, Ban, KeyRound, Loader2
} from 'lucide-react';
import invoke from '../../../api/tauriApi';
import { useToast } from '../../../components/ui/Toast';
import { useGlobalApp } from '../../../context/useGlobalApp';
import { isMonthLocked } from '../../../utils/dateUtils';
import Button from '../../../components/ui/Button';

// ── Arabic month names ─────────────────────────────────────────────────
const MONTH_NAMES = [
  'يناير', 'فبراير', 'مارس', 'أبريل',
  'مايو', 'يونيو', 'يوليو', 'أغسطس',
  'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
];

// ── Generate months from N months ago to N months ahead ──────────────
const generateMonthRange = (past = 12, future = 6) => {
  const now = new Date();
  const months = [];
  for (let i = -past; i <= future; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    months.push({
      key: `${year}-${String(month).padStart(2, '0')}`,
      year,
      month,
      monthName: MONTH_NAMES[month - 1],
      isFuture: i > 0,
      isCurrent: i === 0,
    });
  }
  return months;
};

const LockManagementPage = () => {
  const toast = useToast();
  const {
    manualLockedMonths,
    setManualLockedMonths,
    isMasterUnlocked,
    setIsMasterUnlocked,
  } = useGlobalApp();

  const [allMonths, setAllMonths] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(null);
  const [selectedMonth, setSelectedMonth] = useState(null);
  const [batchMode, setBatchMode] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState(new Set());

  // Generate 24 months (18 past + 6 future)
  const monthGrid = useMemo(() => generateMonthRange(18, 6), []);

  // Fetch months that have data from the backend
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const dataMonths = await invoke('get_months_with_data');
      setAllMonths(dataMonths);
    } catch (err) {
      toast.error('فشل في تحميل قائمة الأشهر');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ── Lock status helpers ────────────────────────────────────────────────

  const getSmartLock = useCallback((key) => isMonthLocked(key), []);

  const getEffectiveStatus = useCallback((key) => {
    if (isMasterUnlocked) return 'unlocked';
    const manual = manualLockedMonths[key];
    if (manual !== undefined) return manual ? 'locked-manual' : 'unlocked-manual';
    return getSmartLock(key) ? 'locked-smart' : 'unlocked';
  }, [isMasterUnlocked, manualLockedMonths, getSmartLock]);

  const isEffectivelyLocked = useCallback((key) => {
    const st = getEffectiveStatus(key);
    return st === 'locked-manual' || st === 'locked-smart';
  }, [getEffectiveStatus]);

  const getStatusLabel = useCallback((key) => {
    const st = getEffectiveStatus(key);
    const map = {
      'unlocked': 'مفتوح',
      'unlocked-manual': 'مفتوح (يدوي)',
      'locked-manual': 'مغلق (يدوي)',
      'locked-smart': 'مغلق (تلقائي)',
    };
    return map[st] || 'مفتوح';
  }, [getEffectiveStatus]);

  // ── Color & styling helpers ────────────────────────────────────────────

  const getStatusColors = useCallback((key) => {
    const st = getEffectiveStatus(key);
    const map = {
      'unlocked': {
        bg: 'bg-emerald-50 dark:bg-emerald-950/20',
        border: 'border-emerald-200 dark:border-emerald-900',
        hover: 'hover:bg-emerald-100 dark:hover:bg-emerald-900/40',
        icon: 'text-emerald-500',
        badge: 'bg-emerald-500',
        label: 'text-emerald-700 dark:text-emerald-400',
        dot: 'bg-emerald-500',
      },
      'unlocked-manual': {
        bg: 'bg-sky-50 dark:bg-sky-950/20',
        border: 'border-sky-200 dark:border-sky-900',
        hover: 'hover:bg-sky-100 dark:hover:bg-sky-900/40',
        icon: 'text-sky-500',
        badge: 'bg-sky-500',
        label: 'text-sky-700 dark:text-sky-400',
        dot: 'bg-sky-500',
      },
      'locked-manual': {
        bg: 'bg-red-50 dark:bg-red-950/30',
        border: 'border-red-200 dark:border-red-800',
        hover: 'hover:bg-red-100 dark:hover:bg-red-900/50',
        icon: 'text-red-500',
        badge: 'bg-red-600',
        label: 'text-red-700 dark:text-red-400',
        dot: 'bg-red-500',
      },
      'locked-smart': {
        bg: 'bg-amber-50 dark:bg-amber-950/30',
        border: 'border-amber-200 dark:border-amber-800',
        hover: 'hover:bg-amber-100 dark:hover:bg-amber-900/50',
        icon: 'text-amber-500',
        badge: 'bg-amber-600',
        label: 'text-amber-700 dark:text-amber-400',
        dot: 'bg-amber-500',
      },
    };
    return map[st] || map['unlocked'];
  }, [getEffectiveStatus]);

  // ── Batch selection ────────────────────────────────────────────────────

  const toggleBatchSelect = useCallback((key) => {
    setSelectedKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const clearBatch = useCallback(() => {
    setSelectedKeys(new Set());
    setBatchMode(false);
  }, []);

  // ── Toggle lock (with password protection) ─────────────────────────────

  const handleToggle = useCallback(async (key, currentlyLocked) => {
    // If unlocking, ask for password
    if (currentlyLocked && !isMasterUnlocked) {
      const pass = window.prompt('🔒 يرجى إدخال كلمة سر المدير لفتح قفل هذا الشهر:');
      if (pass !== 'admin123') {
        if (pass !== null) toast.error('❌ كلمة السر غير صحيحة!');
        return;
      }
    }

    setToggling(key);
    try {
      const newStatus = !currentlyLocked;
      await invoke('toggle_month_lock', { month: key, lock: newStatus });

      setManualLockedMonths(prev => ({ ...prev, [key]: newStatus }));

      toast.success(
        newStatus
          ? `🔒 تم قفل شهر ${key} بنجاح`
          : `🔓 تم فتح شهر ${key} بنجاح`
      );
    } catch (err) {
      toast.error(`❌ فشل تغيير حالة القفل: ${err}`);
    } finally {
      setToggling(null);
    }
  }, [isMasterUnlocked, setManualLockedMonths, toast]);

  // ── Batch toggle ──────────────────────────────────────────────────────

  const handleBatchToggle = useCallback(async (lockValue) => {
    if (selectedKeys.size === 0) {
      toast.warning('⚠ يرجى اختيار شهر واحد على الأقل');
      return;
    }

    // Confirm
    const action = lockValue ? 'قفل' : 'فتح';
    const count = selectedKeys.size;
    if (!window.confirm(`هل أنت متأكد من ${action} ${count} شهر؟`)) return;

    // Password for unlocking
    if (!lockValue && !isMasterUnlocked) {
      const pass = window.prompt('🔒 يرجى إدخال كلمة سر المدير لفتح الأقفال:');
      if (pass !== 'admin123') {
        if (pass !== null) toast.error('❌ كلمة السر غير صحيحة!');
        return;
      }
    }

    setLoading(true);
    let success = 0;
    let fail = 0;

    for (const key of selectedKeys) {
      try {
        await invoke('toggle_month_lock', { month: key, lock: lockValue });
        setManualLockedMonths(prev => ({ ...prev, [key]: lockValue }));
        success++;
      } catch {
        fail++;
      }
    }

    toast.success(
      `${lockValue ? '🔒' : '🔓'} ${action} ${success} شهر بنجاح`
      + (fail > 0 ? `, فشل ${fail} شهر` : '')
    );
    setLoading(false);
    clearBatch();
  }, [selectedKeys, isMasterUnlocked, setManualLockedMonths, toast, clearBatch]);

  // ── Master key unlock ──────────────────────────────────────────────────

  const handleMasterUnlock = useCallback(() => {
    if (!isMasterUnlocked) {
      const pass = window.prompt('🔐 يرجى إدخال كلمة سر المدير لتفعيل المفتاح الرئيسي:');
      if (pass !== 'admin123') {
        if (pass !== null) toast.error('❌ كلمة السر غير صحيحة!');
        return;
      }
    }
    setIsMasterUnlocked(prev => !prev);
    toast.success(
      isMasterUnlocked
        ? '🔒 تم إلغاء المفتاح الرئيسي'
        : '🔓 المفتاح الرئيسي مفعّل — جميع الأقفال مفتوحة مؤقتاً'
    );
  }, [isMasterUnlocked, setIsMasterUnlocked, toast]);

  // ── Group months by year ──────────────────────────────────────────────

  const monthsByYear = useMemo(() => {
    const map = {};
    monthGrid.forEach(m => {
      if (!map[m.year]) map[m.year] = [];
      map[m.year].push(m);
    });
    return Object.entries(map).sort(([a], [b]) => b - a);
  }, [monthGrid]);

  // ── Check if a month has data ─────────────────────────────────────────

  const hasData = useCallback((key) => allMonths.includes(key), [allMonths]);

  // ── Rendering ─────────────────────────────────────────────────────────

  return (
    <div className="p-6 md:p-8 space-y-6 animate-fadeIn" dir="rtl">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl shadow-sm bg-gradient-to-br from-amber-500/20 to-amber-600/10 text-amber-600 dark:text-amber-400">
            <Lock size={28} strokeWidth={2.5} />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight" style={{ color: 'var(--color-text)' }}>
              إدارة إقفال الأشهر
            </h1>
            <p className="text-xs font-bold mt-1 uppercase tracking-widest" style={{ color: 'var(--color-text-muted)' }}>
              Month Lock Management — {monthGrid[0]?.year} إلى {monthGrid[monthGrid.length - 1]?.year}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Master Key */}
          <button
            onClick={handleMasterUnlock}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs transition-all cursor-pointer ${
              isMasterUnlocked
                ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-500/30 animate-pulse'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700'
            }`}
            title={isMasterUnlocked ? 'المفتاح الرئيسي مفعّل — اضغط لإلغائه' : 'تفعيل المفتاح الرئيسي لفتح جميع الأقفال'}
          >
            <KeyRound size={16} />
            <span>{isMasterUnlocked ? 'مفتوح الكل' : 'مفتاح رئيسي'}</span>
          </button>

          {/* Batch mode toggle */}
          <button
            onClick={() => setBatchMode(prev => !prev)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs transition-all cursor-pointer ${
              batchMode
                ? 'bg-purple-600 text-white shadow-lg'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700'
            }`}
          >
            <CheckCircle2 size={16} />
            <span>{batchMode ? 'إنهاء التحديد' : 'تحديد متعدد'}</span>
          </button>
        </div>
      </div>

      {/* Info Banner */}
      <div
        className="p-4 rounded-2xl flex items-start gap-3 text-sm font-bold leading-relaxed shadow-sm"
        style={{
          background: 'var(--color-info-bg)',
          color: 'var(--color-info)',
          border: '1px solid var(--color-info)',
        }}
      >
        <AlertCircle size={20} className="shrink-0 mt-0.5" />
        <div>
          <p>
            انقر على أي شهر لفتح أو قفل البيانات فيه.{' '}
            <strong>الأشهر التي مر عليها 4 أشهر تُقفل تلقائياً</strong> (باللون البرتقالي).
            يمكن فتحها يدوياً بكلمة سر المدير.
          </p>
          <p className="text-[11px] opacity-80 mt-1 flex items-center gap-2">
            <ShieldCheck size={14} />
            المفتاح الرئيسي يفتح جميع الأقفال مؤقتاً بدون تغيير الإعدادات.
          </p>
        </div>
      </div>

      {/* ─── Calendar Grid ─── */}
      {loading && allMonths.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <Loader2 className="animate-spin" size={48} style={{ color: 'var(--color-primary)' }} />
          <span className="text-lg font-bold" style={{ color: 'var(--color-text-muted)' }}>
            جاري تحميل بيانات الأشهر...
          </span>
        </div>
      ) : (
        <div className="space-y-8">
          {monthsByYear.map(([year, months]) => (
            <div key={year}>
              <h2 className="text-lg font-black mb-4 flex items-center gap-2" style={{ color: 'var(--color-text)' }}>
                <Calendar size={20} style={{ color: 'var(--color-primary)' }} />
                {year}
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {months.map((m) => {
                  const status = getEffectiveStatus(m.key);
                  const colors = getStatusColors(m.key);
                  const locked = status === 'locked-manual' || status === 'locked-smart';
                  const isSelected = selectedKeys.has(m.key);
                  const hasDataFlag = hasData(m.key);
                  const isBatchSelectable = batchMode;

                  return (
                    <button
                      key={m.key}
                      onClick={() => {
                        if (isBatchSelectable) {
                          toggleBatchSelect(m.key);
                        } else {
                          setSelectedMonth(m.key === selectedMonth ? null : m.key);
                        }
                      }}
                      onDoubleClick={() => {
                        if (!batchMode) handleToggle(m.key, locked);
                      }}
                      className={`
                        relative flex flex-col items-center p-4 rounded-2xl border-2
                        transition-all duration-200 cursor-pointer
                        ${colors.bg} ${colors.border} ${colors.hover}
                        ${isSelected ? 'ring-2 ring-purple-500 ring-offset-2 ring-offset-transparent' : ''}
                        ${m.isFuture ? 'opacity-50' : ''}
                        ${toggling === m.key ? 'pointer-events-none opacity-60' : ''}
                        ${locked ? 'shadow-sm' : 'shadow-sm shadow-emerald-500/5'}
                      `}
                      style={{ minHeight: '100px' }}
                      title={
                        `${m.monthName} ${m.year}\n` +
                        `الحالة: ${getStatusLabel(m.key)}\n` +
                        (locked ? 'نقرة مزدوجة لفتح/قفل' : 'نقرة مزدوجة للتبديل') +
                        (hasDataFlag ? '\n✓ يحتوي على بيانات' : '')
                      }
                    >
                      {/* Status dot */}
                      <div className={`absolute top-2 right-2 w-2.5 h-2.5 rounded-full ${colors.dot}`} />

                      {/* Loading spinner */}
                      {toggling === m.key && (
                        <div className="absolute inset-0 flex items-center justify-center bg-white/50 dark:bg-slate-900/50 rounded-2xl">
                          <Loader2 size={20} className="animate-spin" style={{ color: 'var(--color-primary)' }} />
                        </div>
                      )}

                      {/* Batch selection check */}
                      {isBatchSelectable && (
                        <div className="absolute top-2 left-2">
                          <div
                            className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${
                              isSelected
                                ? 'bg-purple-600 border-purple-600 text-white'
                                : 'border-slate-300 dark:border-slate-600'
                            }`}
                          >
                            {isSelected && <CheckCircle2 size={14} />}
                          </div>
                        </div>
                      )}

                      {/* Month name & year */}
                      <span className="text-sm font-black mb-0.5" style={{ color: 'var(--color-text)' }}>
                        {m.monthName}
                      </span>
                      <span className="text-[10px] font-bold opacity-50" style={{ color: 'var(--color-text-muted)' }}>
                        {m.year}
                      </span>

                      {/* Key */}
                      <span className="text-[9px] font-mono font-bold mt-0.5 opacity-60" style={{ color: 'var(--color-text-muted)' }}>
                        {m.key}
                      </span>

                      {/* Status badge */}
                      <div
                        className={`mt-2 px-2 py-0.5 rounded-full text-[8px] font-black ${colors.badge} text-white inline-flex items-center gap-1`}
                      >
                        {locked ? <Lock size={8} /> : <Unlock size={8} />}
                        <span>{getStatusLabel(m.key)}</span>
                      </div>

                      {/* Data indicator */}
                      {hasDataFlag && (
                        <span className="absolute bottom-2 left-2 text-[8px] font-bold text-slate-400 dark:text-slate-500">
                          ✓
                        </span>
                      )}

                      {/* Current month indicator */}
                      {m.isCurrent && (
                        <span className="absolute -top-1.5 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full bg-cyan-600 text-white text-[7px] font-black shadow-lg">
                          الحالي
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ─── Selected Month Detail Panel ─── */}
      {selectedMonth && !batchMode && (
        <div
          className="rounded-2xl border-2 p-5 shadow-lg animate-slideUp"
          style={{
            background: 'var(--color-bg-card)',
            borderColor: 'var(--color-border)',
          }}
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-black flex items-center gap-2" style={{ color: 'var(--color-text)' }}>
              <Calendar size={18} style={{ color: 'var(--color-primary)' }} />
              تفاصيل شهر {selectedMonth}
            </h3>
            <span
              className="text-xs font-bold px-3 py-1 rounded-full"
              style={{
                background: getStatusColors(selectedMonth).badge,
                color: '#fff',
              }}
            >
              {getStatusLabel(selectedMonth)}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div className="p-3 rounded-xl" style={{ background: 'var(--color-bg)' }}>
              <p className="text-[10px] font-bold" style={{ color: 'var(--color-text-muted)' }}>الحالة</p>
              <p className="text-lg font-black" style={{ color: 'var(--color-text)' }}>
                {isEffectivelyLocked(selectedMonth) ? '🔒 مقفل' : '🔓 مفتوح'}
              </p>
            </div>
            <div className="p-3 rounded-xl" style={{ background: 'var(--color-bg)' }}>
              <p className="text-[10px] font-bold" style={{ color: 'var(--color-text-muted)' }}>نوع الإقفال</p>
              <p className="text-lg font-black" style={{ color: 'var(--color-text)' }}>
                {getEffectiveStatus(selectedMonth).includes('manual') ? 'يدوي' :
                 getEffectiveStatus(selectedMonth).includes('smart') ? 'تلقائي (4 شهور)' : '—'}
              </p>
            </div>
            <div className="p-3 rounded-xl" style={{ background: 'var(--color-bg)' }}>
              <p className="text-[10px] font-bold" style={{ color: 'var(--color-text-muted)' }}>بيانات مسجلة</p>
              <p className="text-lg font-black" style={{ color: 'var(--color-text)' }}>
                {hasData(selectedMonth) ? '✓ نعم' : '— لا'}
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              variant={isEffectivelyLocked(selectedMonth) ? 'primary' : 'danger'}
              onClick={() => handleToggle(selectedMonth, isEffectivelyLocked(selectedMonth))}
              loading={toggling === selectedMonth}
              icon={isEffectivelyLocked(selectedMonth) ? Unlock : Lock}
              className="h-10"
            >
              {isEffectivelyLocked(selectedMonth) ? '🔓 فتح القفل' : '🔒 قفل الشهر'}
            </Button>
            <Button variant="ghost" onClick={() => setSelectedMonth(null)} className="h-10">
              إغلاق
            </Button>
          </div>
        </div>
      )}

      {/* ─── Batch Actions Bar ─── */}
      {batchMode && (
        <div
          className="sticky bottom-6 rounded-2xl border-2 p-4 shadow-2xl flex items-center justify-between gap-4 animate-slideUp"
          style={{
            background: 'var(--color-bg-card)',
            borderColor: 'var(--color-border)',
          }}
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 size={18} className="text-purple-600" />
            <span className="text-sm font-bold" style={{ color: 'var(--color-text)' }}>
              تم اختيار {selectedKeys.size} شهر
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              size="sm"
              onClick={() => handleBatchToggle(true)}
              disabled={selectedKeys.size === 0}
              icon={Lock}
              className="h-9 text-xs"
            >
              قفل المحدد
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => handleBatchToggle(false)}
              disabled={selectedKeys.size === 0}
              icon={Unlock}
              className="h-9 text-xs"
            >
              فتح المحدد
            </Button>
            <Button variant="ghost" size="sm" onClick={clearBatch} className="h-9 text-xs">
              إلغاء
            </Button>
          </div>
        </div>
      )}

      {/* ─── Timeline Legend ─── */}
      <div
        className="rounded-2xl border p-5 space-y-3"
        style={{
          background: 'var(--color-bg-card)',
          borderColor: 'var(--color-border)',
        }}
      >
        <h3 className="text-sm font-black flex items-center gap-2" style={{ color: 'var(--color-text)' }}>
          <Info size={16} style={{ color: 'var(--color-primary)' }} />
          دليل الألوان والرموز
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { color: 'bg-emerald-500', label: 'مفتوح', desc: 'الشهر متاح للإدخال والتعديل' },
            { color: 'bg-sky-500', label: 'مفتوح (يدوي)', desc: 'تم فتحه يدوياً بعد الإقفال التلقائي' },
            { color: 'bg-amber-500', label: 'مغلق (تلقائي)', desc: 'مر 4 أشهر — أقفل تلقائياً' },
            { color: 'bg-red-500', label: 'مغلق (يدوي)', desc: 'أقفل يدوياً بواسطة المشرف' },
          ].map(item => (
            <div key={item.label} className="flex items-start gap-3 p-2 rounded-lg" style={{ background: 'var(--color-bg)' }}>
              <div className={`w-3 h-3 rounded-full mt-0.5 shrink-0 ${item.color}`} />
              <div>
                <p className="text-xs font-bold" style={{ color: 'var(--color-text)' }}>{item.label}</p>
                <p className="text-[9px]" style={{ color: 'var(--color-text-muted)' }}>{item.desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Smart lock timeline */}
        <div className="mt-4 pt-4 border-t" style={{ borderColor: 'var(--color-border)' }}>
          <h4 className="text-xs font-black mb-3 flex items-center gap-1.5" style={{ color: 'var(--color-text)' }}>
            <Clock size={14} className="text-amber-500" />
            خط الإقفال التلقائي (4 أشهر)
          </h4>
          <div className="relative h-8 rounded-xl overflow-hidden" style={{ background: 'var(--color-bg)' }}>
            <div
              className="absolute inset-y-0 left-0 rounded-xl flex items-center justify-center text-[8px] font-black text-white"
              style={{
                width: '66%',
                background: 'linear-gradient(90deg, #f59e0b, #d97706)',
              }}
            >
              <span>مقفل تلقائياً ← أشهر أقدم من 4</span>
            </div>
            <div className="absolute inset-y-0 right-0 flex items-center justify-center text-[8px] font-bold" style={{ width: '34%', color: 'var(--color-text-muted)', right: 0 }}>
              <span>مفتوح ← آخر 4 أشهر</span>
            </div>
          </div>
          <p className="text-[9px] mt-1" style={{ color: 'var(--color-text-muted)' }}>
            أي شهر مضى عليه 4 أشهر أو أكثر من تاريخ اليوم يُقفل تلقائياً. يمكن فتحه يدوياً من هنا.
          </p>
        </div>
      </div>

      {/* Empty state */}
      {!loading && allMonths.length === 0 && (
        <div className="text-center py-16" style={{ color: 'var(--color-text-muted)' }}>
          <Calendar size={64} className="mx-auto mb-4 opacity-20" />
          <p className="text-xl font-black">لا توجد أشهر مسجلة</p>
          <p className="text-sm font-bold mt-2">ابدأ بإدخال بيانات العمليات لتظهر الأشهر هنا.</p>
        </div>
      )}
    </div>
  );
};

export default LockManagementPage;
