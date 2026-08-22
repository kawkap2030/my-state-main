/* eslint-disable react-refresh/only-export-components */
import React from 'react';
import {
  CheckCircle2, XCircle, AlertTriangle, Info,
  RotateCcw, X, Bell
} from 'lucide-react';
import { useSmartNotification, SmartNotificationProvider } from '../../context/SmartNotificationContext';

// ─── Icons & Colors ──────────────────────────────────────────────────
const icons = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
};

const colors = {
  success: { bg: '#ECFDF5', border: '#A7F3D0', text: '#065F46', accent: '#059669' },
  error:   { bg: '#FEF2F2', border: '#FECACA', text: '#991B1B', accent: '#DC2626' },
  warning: { bg: '#FFFBEB', border: '#FDE68A', text: '#92400E', accent: '#D97706' },
  info:    { bg: '#EFF6FF', border: '#BFDBFE', text: '#1E40AF', accent: '#0284C7' },
  progress:{ bg: '#F5F3FF', border: '#DDD6FE', text: '#5B21B6', accent: '#7C3AED' },
};

// ─── Dark Mode Overrides ─────────────────────────────────────────────
const darkColors = {
  success: { bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.3)', text: '#34D399', accent: '#10B981' },
  error:   { bg: 'rgba(248,113,113,0.12)', border: 'rgba(248,113,113,0.3)', text: '#F87171', accent: '#F87171' },
  warning: { bg: 'rgba(251,191,36,0.12)',  border: 'rgba(251,191,36,0.3)',  text: '#FBBF24', accent: '#FBBF24' },
  info:    { bg: 'rgba(56,189,248,0.12)',  border: 'rgba(56,189,248,0.3)',  text: '#38BDF8', accent: '#38BDF8' },
  progress:{ bg: 'rgba(167,139,250,0.12)', border: 'rgba(167,139,250,0.3)', text: '#A78BFA', accent: '#A78BFA' },
};

// ─── NotificationToast ───────────────────────────────────────────────
const NotificationToast = ({ toast, onDismiss, isDark }) => {
  const Icon = icons[toast.type] || icons.info;
  const c = (isDark ? darkColors : colors)[toast.type] || colors.info;

  return (
    <div
      className="flex items-start gap-3 px-4 py-3.5 rounded-2xl shadow-lg"
      style={{
        background: c.bg,
        border: `1px solid ${c.border}`,
        color: c.text,
        minWidth: '320px',
        maxWidth: '420px',
        animation: 'slideUp 0.3s ease, fadeIn 0.3s ease',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Left accent bar */}
      <div
        className="absolute right-0 top-2 bottom-2 w-1 rounded-full"
        style={{ background: c.accent, opacity: 0.6 }}
      />

      {/* Icon */}
      <div className="shrink-0 mt-0.5">
        <Icon size={18} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold leading-snug">
          {toast.message}
          {toast.count > 1 && (
            <span
              className="mr-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold"
              style={{ background: c.accent + '22', color: c.accent }}
            >
              +{toast.count - 1}
            </span>
          )}
        </p>

        {/* Progress bar */}
        {toast.progress != null && (
          <div className="mt-2 h-1.5 rounded-full overflow-hidden" style={{ background: c.border, opacity: 0.5 }}>
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${Math.min(100, Math.max(0, toast.progress))}%`,
                background: `linear-gradient(90deg, ${c.accent}, ${c.accent}99)`,
              }}
            />
          </div>
        )}

        {/* Action buttons */}
        <div className="flex items-center gap-2 mt-2">
          {toast.undo && (
            <button
              onClick={async (e) => {
                e.stopPropagation();
                try {
                  await toast.undo.handler();
                  onDismiss(toast.id);
                } catch (err) {
                  console.error('Undo failed:', err);
                }
              }}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer"
              style={{
                background: c.accent + '15',
                color: c.accent,
                border: `1px solid ${c.accent}30`,
              }}
              onMouseEnter={e => { e.currentTarget.style.background = c.accent + '25'; }}
              onMouseLeave={e => { e.currentTarget.style.background = c.accent + '15'; }}
            >
              <RotateCcw size={12} />
              <span>{toast.undo.label || 'تراجع'}</span>
            </button>
          )}
          {toast.actions?.map((action, idx) => (
            <button
              key={idx}
              onClick={(e) => {
                e.stopPropagation();
                action.handler();
              }}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer"
              style={{
                background: c.accent + '15',
                color: c.accent,
                border: `1px solid ${c.accent}30`,
              }}
              onMouseEnter={e => { e.currentTarget.style.background = c.accent + '25'; }}
              onMouseLeave={e => { e.currentTarget.style.background = c.accent + '15'; }}
            >
              {action.icon && <action.icon size={12} />}
              <span>{action.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Close button */}
      <button
        data-testid="toast-close"
        onClick={(e) => { e.stopPropagation(); onDismiss(toast.id); }}
        className="shrink-0 p-1 rounded-lg cursor-pointer opacity-40 hover:opacity-100 transition-all"
        style={{ color: c.text }}
      >
        <X size={14} />
      </button>
    </div>
  );
};

// ─── ToastProvider ──────────────────────────────────────────────────
export const ToastProvider = ({ children }) => {
  return (
    <SmartNotificationProvider>
      {children}
      <ToastRenderer />
    </SmartNotificationProvider>
  );
};

// ─── ToastRenderer (renders visible toasts from SmartNotificationContext) ──
export const ToastRenderer = () => {
  const { visibleToasts, dismissNotification } = useSmartNotification();
  const [isDark, setIsDark] = React.useState(false);

  React.useEffect(() => {
    const checkDark = () => {
      setIsDark(document.documentElement.getAttribute('data-theme') === 'dark');
    };
    checkDark();
    const observer = new MutationObserver(checkDark);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  return (
    <div
      className="fixed bottom-6 left-6 z-[100] flex flex-col gap-3 pointer-events-none"
      style={{ maxWidth: '440px' }}
      dir="rtl"
    >
      {visibleToasts.map(t => (
        <div key={t.id} className="pointer-events-auto">
          <NotificationToast toast={t} onDismiss={dismissNotification} isDark={isDark} />
        </div>
      ))}
    </div>
  );
};

// ─── useToast Hook (Backward Compatible) ─────────────────────────────
export const useToast = () => {
  try {
    const { success, error, warning, info, toast } = useSmartNotification();
    return React.useMemo(() => ({
      success,
      error,
      warning,
      info,
      toast,
    }), [success, error, warning, info, toast]);
  } catch (e) {
    throw new Error('useToast must be used within ToastProvider');
  }
};

export default ToastProvider;
