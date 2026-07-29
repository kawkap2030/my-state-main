import React from 'react';
import {
  CheckCircle2, XCircle, AlertTriangle, Info,
  Bell, BellRing, RotateCcw, Trash2, Clock, X
} from 'lucide-react';
import { useSmartNotification } from '../../context/SmartNotificationContext';

const TYPE_META = {
  success: { icon: CheckCircle2, bg: 'var(--color-success-bg)', border: 'var(--color-success)', text: 'var(--color-success)' },
  error:   { icon: XCircle,       bg: 'var(--color-danger-bg)',  border: 'var(--color-danger)',  text: 'var(--color-danger)'  },
  warning: { icon: AlertTriangle, bg: 'var(--color-warning-bg)', border: 'var(--color-warning)', text: 'var(--color-warning)' },
  info:    { icon: Info,           bg: 'var(--color-info-bg)',    border: 'var(--color-info)',    text: 'var(--color-info)'    },
};

const formatTime = (ts) => {
  const d = new Date(ts);
  const now = new Date();
  const diffMs = now - d;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return 'الآن';
  if (diffMin < 60) return `منذ ${diffMin} دقيقة`;
  if (diffHour < 24) return `منذ ${diffHour} ساعة`;
  if (diffDay < 7) return `منذ ${diffDay} يوم`;
  return d.toLocaleDateString('ar-SA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};

const NotificationCenter = () => {
  const {
    history,
    unreadCount,
    isHistoryOpen,
    setIsHistoryOpen,
    markHistoryRead,
    markAllRead,
    clearHistory,
  } = useSmartNotification();

  if (!isHistoryOpen) return null;

  // Group history by date
  const grouped = history.reduce((acc, entry) => {
    const d = new Date(entry.timestamp);
    const key = d.toLocaleDateString('ar-SA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    if (!acc[key]) acc[key] = [];
    acc[key].push(entry);
    return acc;
  }, {});

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-[60]"
        style={{ background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(2px)' }}
        onClick={() => setIsHistoryOpen(false)}
      />

      {/* Centered Modal (was side panel) */}
      <div
        className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg max-h-[85vh] z-[70] flex flex-col"
        style={{
          background: 'var(--color-bg-card)',
          border: '1px solid var(--color-border)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
          borderRadius: '24px',
          animation: 'slideUpFade 0.3s ease',
        }}
        dir="rtl"
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 shrink-0"
          style={{ borderBottom: '1px solid var(--color-border)' }}
        >
          <div className="flex items-center gap-3">
            <BellRing size={20} style={{ color: 'var(--color-primary)' }} />
            <h3 className="text-base font-bold" style={{ color: 'var(--color-text)' }}>
              سجل الإشعارات
            </h3>
            {unreadCount > 0 && (
              <span
                className="badge badge-primary text-[10px] px-2 py-0.5"
                style={{ background: 'var(--color-primary)', color: '#fff', borderRadius: '999px', fontSize: '10px', fontWeight: 700, padding: '2px 8px' }}
              >
                {unreadCount}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {history.length > 0 && (
              <>
                <button
                  onClick={markAllRead}
                  className="px-3 py-1.5 rounded-xl text-[11px] font-bold cursor-pointer transition-all duration-200"
                  style={{
                    background: 'var(--color-bg)',
                    color: 'var(--color-text-muted)',
                    border: '1px solid var(--color-border)',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-border)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'var(--color-bg)'; }}
                >
                  قراءة الكل
                </button>
                <button
                  onClick={clearHistory}
                  className="p-1.5 rounded-xl cursor-pointer transition-all duration-200"
                  style={{ color: 'var(--color-danger)' }}
                  title="مسح الكل"
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-danger-bg)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <Trash2 size={16} />
                </button>
              </>
            )}
            <button
              onClick={() => setIsHistoryOpen(false)}
              className="p-1.5 rounded-xl cursor-pointer transition-all duration-200"
              style={{ color: 'var(--color-text-muted)' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-bg)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4">
          {history.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-16">
              <Bell size={48} style={{ color: 'var(--color-text-muted)', opacity: 0.3 }} />
              <p className="mt-4 text-sm font-bold" style={{ color: 'var(--color-text-muted)' }}>
                لا توجد إشعارات بعد
              </p>
              <p className="mt-1 text-xs" style={{ color: 'var(--color-text-muted)', opacity: 0.6 }}>
                الإشعارات الجديدة ستظهر هنا تلقائياً
              </p>
            </div>
          ) : (
            Object.entries(grouped).map(([dateLabel, entries]) => (
              <div key={dateLabel} className="mb-6">
                <p
                  className="text-[11px] font-bold mb-3 px-1"
                  style={{ color: 'var(--color-text-muted)', opacity: 0.6 }}
                >
                  {dateLabel}
                </p>
                <div className="flex flex-col gap-2">
                  {entries.map((entry) => {
                    const meta = TYPE_META[entry.type] || TYPE_META.info;
                    const Icon = meta.icon;
                    const isUnread = !entry.read;
                    return (
                      <button
                        key={entry.id}
                        onClick={() => markHistoryRead(entry.id)}
                        className="w-full text-right flex items-start gap-3 p-3 rounded-2xl transition-all duration-200 cursor-pointer"
                        style={{
                          background: isUnread ? 'var(--color-bg)' : 'transparent',
                          border: isUnread
                            ? `1px solid var(--color-border)`
                            : '1px solid transparent',
                        }}
                        onMouseEnter={e => {
                          e.currentTarget.style.background = 'var(--color-bg)';
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.background = isUnread ? 'var(--color-bg)' : 'transparent';
                        }}
                      >
                        {/* Type icon */}
                        <div
                          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                          style={{ background: meta.bg, color: meta.text }}
                        >
                          <Icon size={16} />
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <p
                            className="text-sm font-semibold leading-snug"
                            style={{
                              color: 'var(--color-text)',
                              fontWeight: isUnread ? 700 : 500,
                            }}
                          >
                            {entry.message}
                          </p>
                          <div className="flex items-center gap-1.5 mt-1.5">
                            <Clock size={10} style={{ color: 'var(--color-text-muted)', opacity: 0.5 }} />
                            <span
                              className="text-[10px] font-bold"
                              style={{ color: 'var(--color-text-muted)', opacity: 0.5 }}
                            >
                              {formatTime(entry.timestamp)}
                            </span>
                          </div>
                        </div>

                        {/* Unread dot */}
                        {isUnread && (
                          <div
                            className="w-2 h-2 rounded-full shrink-0 mt-2"
                            style={{ background: 'var(--color-primary)' }}
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        {history.length > 0 && (
          <div
            className="px-5 py-3 shrink-0 text-center"
            style={{ borderTop: '1px solid var(--color-border)' }}
          >
            <span className="text-[10px] font-bold" style={{ color: 'var(--color-text-muted)', opacity: 0.5 }}>
              إجمالي {history.length} إشعار
              {unreadCount > 0 && ` (${unreadCount} غير مقروء)`}
            </span>
          </div>
        )}
      </div>
    </>
  );
};

export default NotificationCenter;
