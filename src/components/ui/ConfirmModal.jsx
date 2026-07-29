import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

/**
 * ConfirmModal - Professional delete/action confirmation modal
 * 
 * Replaces window.confirm with an app-styled modal that supports:
 * - Dark mode
 * - Custom message and details
 * - Destructive (red) and neutral variants
 * - Animated appearance
 * 
 * @param {boolean} isOpen - Whether the modal is visible
 * @param {Function} onConfirm - Called when user confirms
 * @param {Function} onCancel - Called when user cancels
 * @param {string} title - Modal title (default: 'تأكيد الحذف')
 * @param {string} message - Main confirmation message
 * @param {string} detail - Optional secondary detail text
 * @param {string} confirmText - Confirm button text (default: 'حذف')
 * @param {string} cancelText - Cancel button text (default: 'إلغاء')
 * @param {string} variant - 'danger' | 'warning' (default: 'danger')
 * @param {boolean} loading - Whether confirm action is in progress
 */
const ConfirmModal = ({ 
  isOpen, 
  onConfirm, 
  onCancel, 
  title = 'تأكيد الحذف',
  message = 'هل أنت متأكد من حذف هذا السجل؟',
  detail = '',
  confirmText = 'حذف',
  cancelText = 'إلغاء',
  variant = 'danger',
  loading = false
}) => {
  if (!isOpen) return null;

  const colors = variant === 'danger' 
    ? { 
        bg: 'var(--color-danger-bg)', 
        color: 'var(--color-danger)', 
        darkColor: 'var(--color-danger-dark)',
        iconBg: 'var(--color-danger-bg)'
      }
    : {
        bg: 'var(--color-warning-bg)',
        color: 'var(--color-warning)',
        darkColor: '#b45309',
        iconBg: 'var(--color-warning-bg)'
      };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(15, 23, 42, 0.5)', backdropFilter: 'blur(4px)' }}
      onClick={onCancel}
    >
      <div
        className="neu-card p-0 w-full max-w-md overflow-hidden"
        style={{ animation: 'fadeIn 0.15s ease' }}
        onClick={e => e.stopPropagation()}
        dir="rtl"
      >
        {/* Header with icon */}
        <div className="p-6 pb-4 flex items-start gap-4">
          <div 
            className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 mt-0.5"
            style={{ backgroundColor: colors.iconBg, color: colors.color }}
          >
            <AlertTriangle size={22} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-black text-[var(--color-text)] leading-tight">{title}</h3>
            <p className="text-sm font-bold text-[var(--color-text-muted)] mt-2 leading-relaxed">{message}</p>
            {detail && (
              <div 
                className="mt-3 p-3 rounded-xl text-xs font-bold border"
                style={{ 
                  backgroundColor: colors.bg, 
                  borderColor: `color-mix(in srgb, ${colors.color} 20%, transparent)`,
                  color: 'var(--color-text)' 
                }}
              >
                {detail}
              </div>
            )}
          </div>
          <button
            onClick={onCancel}
            className="p-1.5 rounded-lg text-[var(--color-text-muted)] hover:bg-[var(--color-bg)] transition-colors shrink-0"
          >
            <X size={16} />
          </button>
        </div>

        {/* Actions */}
        <div className="px-6 pb-6 flex items-center gap-3 justify-end">
          <button
            onClick={onCancel}
            disabled={loading}
            className="px-6 py-2.5 rounded-xl text-sm font-bold border border-[var(--color-border)] text-[var(--color-text)] hover:bg-[var(--color-bg)] transition-all disabled:opacity-50"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="px-6 py-2.5 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-50 flex items-center gap-2 shadow-lg"
            style={{ 
              background: `linear-gradient(135deg, ${colors.color}, ${colors.darkColor})`,
              boxShadow: `0 4px 14px color-mix(in srgb, ${colors.color} 30%, transparent)`
            }}
          >
            {loading && (
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmModal;
