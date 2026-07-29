/**
 * LockNotificationBanner — Visual warning banner for locked months.
 *
 * Shows a prominent banner above transaction forms when the selected
 * dispense month is locked, preventing accidental edits.
 *
 * Usage:
 *   <LockNotificationBanner
 *     dispenseMonth="2026-03"
 *     isLocked={true}
 *     isManual={false}
 *     isSmart={true}
 *   />
 */
import React from 'react';
import { Lock, AlertTriangle, ShieldCheck, Info, Calendar } from 'lucide-react';

const LockNotificationBanner = ({
  dispenseMonth,
  isLocked,
  isManual = false,
  isSmart = false,
}) => {
  if (!isLocked) return null;

  const getVariant = () => {
    if (isManual) return 'manual';
    if (isSmart) return 'smart';
    return 'manual';
  };

  const variant = getVariant();

  const styles = {
    manual: {
      bg: 'bg-red-50 dark:bg-red-950/30',
      border: 'border-red-200 dark:border-red-800',
      iconBg: 'bg-red-100 dark:bg-red-900/50',
      iconColor: 'text-red-600 dark:text-red-400',
      title: 'text-red-800 dark:text-red-300',
      text: 'text-red-600 dark:text-red-400',
      badge: 'bg-red-600 text-white',
    },
    smart: {
      bg: 'bg-amber-50 dark:bg-amber-950/30',
      border: 'border-amber-200 dark:border-amber-800',
      iconBg: 'bg-amber-100 dark:bg-amber-900/50',
      iconColor: 'text-amber-600 dark:text-amber-400',
      title: 'text-amber-800 dark:text-amber-300',
      text: 'text-amber-600 dark:text-amber-400',
      badge: 'bg-amber-600 text-white',
    },
  };

  const s = styles[variant];

  const getTitle = () => {
    if (isManual) return 'هذا الشهر مقفل يدوياً 🔒';
    if (isSmart) return 'هذا الشهر مقفل تلقائياً ⏰';
    return 'هذا الشهر مقفل 🔒';
  };

  const getDescription = () => {
    if (isManual) {
      return 'قام المشرف بقفل هذا الشهر لمنع أي تعديلات. يمكن طلب فتح القفل من شاشة إدارة الأقفال أو من مشرف النظام.';
    }
    if (isSmart) {
      return 'مر على هذا الشهر 4 أشهر أو أكثر، وتم قفله تلقائياً حمايةً للبيانات. يمكن فتحه يدوياً من شاشة إدارة الأقفال بعد إدخال كلمة سر المدير.';
    }
    return 'هذا الشهر غير متاح للتعديل حالياً.';
  };

  return (
    <div
      className={`${s.bg} ${s.border} border-2 rounded-2xl p-4 mb-6 shadow-sm animate-slideUp`}
      dir="rtl"
      role="alert"
    >
      <div className="flex items-start gap-4">
        {/* Icon */}
        <div
          className={`${s.iconBg} ${s.iconColor} w-12 h-12 shrink-0 rounded-xl flex items-center justify-center shadow-sm`}
        >
          {isManual ? (
            <Lock size={24} strokeWidth={2.5} />
          ) : (
            <AlertTriangle size={24} strokeWidth={2.5} />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h3 className={`text-sm font-black ${s.title}`}>
              {getTitle()}
            </h3>
            <span
              className={`${s.badge} text-[9px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1`}
            >
              <Calendar size={10} />
              {dispenseMonth}
            </span>
            {isManual && (
              <span className="text-[9px] font-bold text-red-400 bg-red-100 dark:bg-red-900/40 px-2 py-0.5 rounded-full flex items-center gap-1">
                <ShieldCheck size={10} />
                إقفال يدوي
              </span>
            )}
            {isSmart && (
              <span className="text-[9px] font-bold text-amber-500 bg-amber-100 dark:bg-amber-900/40 px-2 py-0.5 rounded-full flex items-center gap-1">
                <Info size={10} />
                إقفال تلقائي (4 أشهر)
              </span>
            )}
          </div>
          <p className={`text-xs font-bold mt-2 leading-relaxed ${s.text}`}>
            {getDescription()}
          </p>
          <div className="flex items-center gap-2 mt-2 text-[10px] font-bold opacity-60">
            <Info size={12} className={s.text} />
            <span className={s.text}>
              إذا كنت تملك صلاحية المشرف، استخدم زر "المفتاح الرئيسي" أو اذهب إلى شاشة إدارة الأقفال.
            </span>
          </div>
        </div>

        {/* Separator */}
        <div className="w-px h-12 bg-current opacity-10 shrink-0 self-center hidden sm:block" />

        {/* Action hint */}
        <div className="hidden md:flex flex-col items-center justify-center shrink-0 px-2">
          <Lock size={16} className={`${s.iconColor} mb-1`} />
          <span className={`text-[9px] font-black ${s.text} whitespace-nowrap`}>
            غير قابل للتعديل
          </span>
        </div>
      </div>
    </div>
  );
};

export default LockNotificationBanner;
