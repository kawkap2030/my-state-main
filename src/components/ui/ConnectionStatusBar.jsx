/**
 * ConnectionStatusBar — Bottom bar showing Tauri backend connection status.
 *
 * States:
 *   checking     → yellow pulsing dot + "جاري التحقق..."
 *   connected    → green dot + latency in ms
 *   disconnected → red dot + "غير متصل" + retry button
 *   error        → red dot + "خطأ في الاتصال" + retry button
 *
 * Auto-hides when connected and stable.
 */
import React, { useState, useEffect } from 'react';
import { Wifi, WifiOff, Loader2, RefreshCw, Database, X, AlertTriangle } from 'lucide-react';
import useConnectionStatus from '../../hooks/useConnectionStatus';

const ConnectionStatusBar = () => {
  const { status, isOnline, latency, lastCheck, checkNow, wasDisconnected, dismissReconnect, dbError } = useConnectionStatus();
  const [visible, setVisible] = useState(true);
  const [dismissed, setDismissed] = useState(false);

  // Auto-hide after 5 seconds of stable connection
  useEffect(() => {
    if (isOnline && status === 'connected') {
      const timer = setTimeout(() => setVisible(false), 5000);
      return () => clearTimeout(timer);
    }
    const t = setTimeout(() => setVisible(true), 0);
    return () => clearTimeout(t);
  }, [isOnline, status, lastCheck]);

  // ── Database health warning: PERSISTENT, cannot be dismissed ─────────
  // Shown when the backend flagged an integrity/open failure at startup.
  // The app stays usable (read-only) but every write is refused, so the
  // banner must remain visible until the DB is healthy again.
  if (dbError) {
    return (
      <div
        className="fixed bottom-0 right-0 left-0 z-[100]"
        dir="rtl"
      >
        <div
          className="flex items-center justify-between gap-3 px-4 py-2.5 border-t border-red-500/50 backdrop-blur-md"
          style={{ background: 'rgba(127, 29, 29, 0.96)' }}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <AlertTriangle size={15} className="text-red-300 shrink-0 animate-pulse" />
            <span className="text-[11px] font-bold text-red-50 leading-relaxed">
              {dbError}
            </span>
          </div>
          <button
            onClick={checkNow}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-black transition-all cursor-pointer bg-red-500/25 hover:bg-red-500/40 text-red-100 shrink-0"
          >
            <RefreshCw size={12} />
            <span>إعادة الفحص</span>
          </button>
        </div>
      </div>
    );
  }

  // If user dismissed while online, keep hidden
  if (dismissed && isOnline) return null;

  const variant = (() => {
    switch (status) {
      case 'checking': return 'checking';
      case 'connected': return 'connected';
      case 'disconnected': return 'disconnected';
      case 'error': return 'error';
      default: return 'checking';
    }
  })();

  const styles = {
    checking: {
      border: 'border-amber-500/30',
      dot: 'bg-amber-400 animate-pulse',
      text: 'text-amber-700 dark:text-amber-400',
      icon: Loader2,
    },
    connected: {
      border: 'border-emerald-500/30',
      dot: 'bg-emerald-500',
      text: 'text-emerald-700 dark:text-emerald-400',
      icon: Wifi,
    },
    disconnected: {
      border: 'border-red-500/30',
      dot: 'bg-red-500 animate-pulse',
      text: 'text-red-700 dark:text-red-400',
      icon: WifiOff,
    },
    error: {
      border: 'border-red-500/40',
      dot: 'bg-red-500',
      text: 'text-red-700 dark:text-red-400',
      icon: WifiOff,
    },
  };

  const s = styles[variant];
  const Icon = s.icon;

  const getLabel = () => {
    switch (status) {
      case 'checking': return 'جاري التحقق من الاتصال بقاعدة البيانات...';
      case 'connected': return latency > 0 ? `متصل • زمن الاستجابة: ${latency}مث` : 'متصل';
      case 'disconnected': return 'غير متصل — تعذر الاتصال بقاعدة البيانات';
      case 'error': return 'خطأ في الاتصال — جاري إعادة المحاولة...';
      default: return 'جاري الاتصال...';
    }
  };

  return (
    <div
      className={`fixed bottom-0 right-0 left-0 z-50 transition-all duration-500 ease-in-out ${
        visible ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0'
      }`}
      dir="rtl"
    >
      <div
        className={`flex items-center justify-between px-4 py-1.5 border-t ${s.border} backdrop-blur-md`}
        style={{
          background: variant === 'connected'
            ? 'var(--color-success-bg)'
            : variant === 'checking'
              ? 'var(--color-warning-bg)'
              : 'var(--color-danger-bg)',
        }}
      >
        {/* Left: Status indicator */}
        <div className="flex items-center gap-2.5 min-w-0">
          {/* Animated dot */}
          <span className={`relative flex h-2.5 w-2.5 ${variant === 'checking' || variant === 'disconnected' ? 'animate-pulse' : ''}`}>
            <span
              className={`absolute inline-flex h-full w-full rounded-full ${s.dot} ${
                variant === 'checking' ? 'animate-ping opacity-75' : ''
              }`}
            />
            <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${s.dot}`} />
          </span>

          {/* Icon */}
          {variant !== 'connected' && (
            <Icon size={14} className={`${s.text} shrink-0 ${variant === 'checking' ? 'animate-spin' : ''}`} />
          )}
          {variant === 'connected' && (
            <Database size={14} className={`${s.text} shrink-0`} />
          )}

          {/* Message */}
          <span className={`text-[10px] font-bold truncate ${s.text}`}>
            {getLabel()}
          </span>

          {/* Latency (connected) */}
          {isOnline && latency > 0 && (
            <span
              className={`text-[8px] font-black px-1.5 py-0.5 rounded-full shrink-0 ${
                latency < 50
                  ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400'
                  : latency < 150
                    ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400'
                    : 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
              }`}
            >
              {latency}مث
            </span>
          )}
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-1.5">
          {!isOnline && (
            <button
              onClick={checkNow}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[9px] font-black transition-all cursor-pointer hover:bg-white/20"
              style={{ color: s.text }}
            >
              <RefreshCw size={12} className={variant === 'checking' ? 'animate-spin' : ''} />
              <span>إعادة المحاولة</span>
            </button>
          )}

          {wasDisconnected && isOnline && (
            <button
              onClick={dismissReconnect}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[9px] font-black transition-all cursor-pointer bg-amber-500/20 hover:bg-amber-500/30"
              style={{ color: '#f59e0b' }}
              title="تمت إعادة الاتصال بالخادم الخلفي. سيتم إعادة تحميل الصفحة تلقائياً خلال 3 ثوانٍ لإعادة التهيئة. اضغط للإلغاء."
            >
              <RefreshCw size={12} className="animate-spin" />
              <span>تمت إعادة الاتصال ✓</span>
            </button>
          )}

          <button
            onClick={() => setDismissed(true)}
            className="p-1 rounded hover:bg-black/5 transition-colors cursor-pointer"
            style={{ color: s.text, opacity: 0.6 }}
            title="إخفاء"
          >
            <X size={12} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConnectionStatusBar;
