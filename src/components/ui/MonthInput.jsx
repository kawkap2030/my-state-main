/**
 * MonthInput — styled month picker that displays the full Arabic month name.
 *
 * Native <input type="month"> renders a narrow "2026-08" value and has a
 * fixed intrinsic min-width that overflows small boxes. This component
 * hides the native input and shows a friendly formatted box ("أغسطس 2026")
 * that always fits its container; clicking (or pressing Enter/Space) opens
 * the native month picker via showPicker().
 *
 * Usage:
 *   <MonthInput
 *     value={startMonth}
 *     onChange={(e) => setStartMonth(e.target.value)}
 *     label="من شهر"
 *   />
 */
import React, { useRef } from 'react';
import { Calendar, X } from 'lucide-react';

const ARABIC_MONTHS = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
];

const formatMonth = (value) => {
  if (!value) return '';
  const [year, month] = String(value).split('-');
  const idx = parseInt(month, 10) - 1;
  if (!year || idx < 0 || idx > 11) return String(value);
  return `${ARABIC_MONTHS[idx]} ${year}`;
};

const MonthInput = ({ value, onChange, label, placeholder = 'اختر الشهر', className = '', clearable = false }) => {
  const inputRef = useRef(null);

  const openPicker = () => {
    const el = inputRef.current;
    if (!el) return;
    if (typeof el.showPicker === 'function') {
      try { el.showPicker(); return; } catch (e) { /* fall through to native click */ }
    }
    el.focus();
    el.click();
  };

  const handleClear = (e) => {
    e.stopPropagation();
    if (onChange) {
      onChange({ target: { value: '' } });
    }
  };

  return (
    <div className={`relative ${className || 'w-full'}`} dir="rtl">
      {label && (
        <label
          className="block text-[10px] font-black text-[var(--color-text-muted)] mb-1.5 mr-1"
        >
          {label}
        </label>
      )}
      <div
        role="button"
        tabIndex={0}
        aria-label={label || 'اختيار الشهر'}
        onClick={openPicker}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openPicker();
          }
        }}
        className="flex items-center gap-2.5 w-full h-11 px-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-card)] text-[var(--color-text)] cursor-pointer hover:border-[var(--color-primary)] transition-all whitespace-nowrap overflow-hidden"
        title={formatMonth(value) || placeholder}
      >
        <Calendar size={16} className="text-[var(--color-primary)] shrink-0" />
        <span className={`text-sm font-bold truncate flex-1 ${value ? '' : 'text-[var(--color-text-muted)]'}`}>
          {formatMonth(value) || placeholder}
        </span>
        {clearable && value && (
          <button
            type="button"
            onClick={handleClear}
            className="shrink-0 p-1 rounded-lg hover:bg-red-50 hover:text-red-500 text-[var(--color-text-muted)] transition-all cursor-pointer"
            title="مسح التاريخ"
            tabIndex={-1}
          >
            <X size={14} />
          </button>
        )}
      </div>
      {/* Native input — visually hidden, drives the picker & keeps the value */}
      <input
        ref={inputRef}
        type="month"
        value={value || ''}
        onChange={onChange}
        className="absolute top-0 left-0 w-0 h-0 opacity-0 pointer-events-none"
        tabIndex={-1}
        aria-hidden="true"
      />
    </div>
  );
};

export default MonthInput;

