/**
 * AutoComplete — Searchable dropdown with keyboard navigation.
 *
 * Replaces native <select> elements with a searchable input that
 * filters options in real-time. Supports RTL, loading, no-results,
 * keyboard navigation, and clear button.
 *
 * Usage:
 *   <AutoComplete
 *     value={selectedBranch}
 *     onChange={setSelectedBranch}
 *     options={branches}
 *     label="الفرع الرئيسي"
 *     icon={Building2}
 *     placeholder="ابحث عن فرع..."
 *   />
 */
import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Search, X, ChevronDown, Loader2 } from 'lucide-react';

// Stable module-level defaults: passing these as default props means their identity
// NEVER changes between renders. Inline defaults were recreated on every render,
// which made the selectedOption/filteredOptions memos and the searchQuery sync effect
// run on every render (constant input flicker — the "shaking" while selecting).
const DEFAULT_GET_LABEL = (opt) => opt?.name || opt?.label || String(opt);
const DEFAULT_GET_VALUE = (opt) => opt?.id ?? opt?.value ?? opt;

const AutoComplete = ({
  value,
  onChange,
  options = [],
  label,
  icon: Icon,
  placeholder = 'ابحث...',
  disabled = false,
  loading = false,
  error,
  noResultsText = 'لا توجد نتائج',
  getOptionLabel = DEFAULT_GET_LABEL,
  getOptionValue = DEFAULT_GET_VALUE,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const containerRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  // ── Find the selected option object ─────────────────────────────────────
  const selectedOption = useMemo(() => {
    if (value == null || value === '') return null;
    return options.find(opt => String(getOptionValue(opt)) === String(value)) || null;
  }, [value, options, getOptionValue]);

  // ── Filter options based on search ──────────────────────────────────────
  const filteredOptions = useMemo(() => {
    if (!searchQuery.trim()) return options;
    const q = searchQuery.trim().toLowerCase();
    return options.filter(opt => {
      const label = getOptionLabel(opt).toLowerCase();
      return label.includes(q);
    });
  }, [searchQuery, options, getOptionLabel]);

  // Clamp the highlighted index so a shrinking list (typing / async load) can
  // never leave the selection pointer outside the visible options.
  const safeHighlightedIndex = Math.min(highlightedIndex, Math.max(0, filteredOptions.length - 1));

  // The visible input text is DERIVED during render: while the dropdown is open
  // we show what the user typed (searchQuery); once closed we show the selected
  // option's label. No effect-based state sync here — effects that call setState
  // synchronously trigger cascading renders (the "shaking" while selecting).

  // ── Close on outside click ──────────────────────────────────────────────
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // ── Scroll highlighted item into view ───────────────────────────────────
  useEffect(() => {
    if (isOpen && listRef.current) {
      const items = listRef.current.querySelectorAll('[data-autocomplete-item]');
      if (items[safeHighlightedIndex]) {
        items[safeHighlightedIndex].scrollIntoView({ block: 'nearest' });
      }
    }
  }, [safeHighlightedIndex, isOpen]);

  // ── Open dropdown and focus input ───────────────────────────────────────
  const open = useCallback(() => {
    if (disabled) return;
    setIsOpen(true);
    // When the dropdown opens, seed the search box with the currently
    // displayed label so typing continues from the selected option.
    setSearchQuery(selectedOption ? getOptionLabel(selectedOption) : '');
    setHighlightedIndex(0);
  }, [disabled, selectedOption, getOptionLabel]);

  // ── Select an option ────────────────────────────────────────────────────
  const select = useCallback((opt) => {
    onChange(getOptionValue(opt));
    setIsOpen(false);
    setSearchQuery(getOptionLabel(opt));
    inputRef.current?.blur();
  }, [onChange, getOptionValue, getOptionLabel]);

  // ── Clear selection ─────────────────────────────────────────────────────
  const clear = useCallback((e) => {
    e.stopPropagation();
    onChange('');
    setSearchQuery('');
    setIsOpen(false);
    inputRef.current?.focus();
  }, [onChange]);

  // ── Keyboard handling ───────────────────────────────────────────────────
  const handleKeyDown = useCallback((e) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (!isOpen) { setIsOpen(true); return; }
        setHighlightedIndex(p => Math.min(p + 1, filteredOptions.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex(p => Math.max(p - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (isOpen && filteredOptions[highlightedIndex]) {
          select(filteredOptions[highlightedIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        inputRef.current?.blur();
        break;
    }
  }, [isOpen, filteredOptions, highlightedIndex, select]);

  // ── Handle input change (type to search) ────────────────────────────────
  const handleInputChange = useCallback((e) => {
    const val = e.target.value;
    setSearchQuery(val);
    setHighlightedIndex(0);
    if (!isOpen) setIsOpen(true);
  }, [isOpen]);

  // ── Handle blur — label restoration is handled by the derived input value ──
  const handleBlur = useCallback(() => {
    // No state changes needed: when closed, the input shows the selected option's
    // label via the derived value, and the placeholder when nothing is selected.
  }, []);

  // ── Highlight matching text for search ──────────────────────────────────
  const highlightMatch = (text, query) => {
    if (!query.trim()) return text;
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escaped})`, 'gi');
    const parts = text.split(regex);
    return parts.map((part, i) =>
      i % 2 === 1
        ? <mark key={i} className="rounded-sm px-0.5" style={{ background: 'var(--color-primary-light)', color: 'var(--color-primary)' }}>{part}</mark>
        : part
    );
  };

  const hasValue = value != null && value !== '';

  return (
    <div className="relative" ref={containerRef} dir="rtl">
      {/* Label */}
      {label && (
        <label className="field-label" onClick={open}>
          {Icon && <Icon size={16} />}
          <span>{label}</span>
        </label>
      )}

      {/* Input Area */}
      <div
        className={`relative flex items-center rounded-xl border transition-all duration-200 cursor-text overflow-hidden
          ${error ? 'border-red-400' : ''}
          ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
        `}
        style={{
          background: disabled ? 'var(--color-bg)' : 'var(--color-bg-card)',
          borderColor: isOpen ? 'var(--color-primary)' : 'var(--color-border)',
          boxShadow: isOpen ? '0 0 0 3px rgba(8,145,178,0.1)' : 'none',
          minHeight: '48px',
        }}
        onClick={() => {
          if (!disabled) {
            inputRef.current?.focus();
            open();
          }
        }}
      >
        {/* Search Icon */}
        <div className="pr-4 pl-2 flex items-center pointer-events-none">
          <Search size={16} className={hasValue ? 'text-[var(--color-primary)]' : 'text-[var(--color-text-muted)]'} />
        </div>

        {/* Input */}
        <input
          ref={inputRef}
          type="text"
          value={isOpen ? searchQuery : (selectedOption ? getOptionLabel(selectedOption) : '')}
          onChange={handleInputChange}
          onFocus={open}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          placeholder={hasValue ? '' : placeholder}
          disabled={disabled}
          title={selectedOption ? getOptionLabel(selectedOption) : ''}
          className="flex-1 min-w-0 bg-transparent border-none outline-none text-sm font-bold py-3 pl-1 truncate"
          style={{ color: 'var(--color-text)' }}
          autoComplete="off"
          spellCheck={false}
        />

        {/* Loading Spinner */}
        {loading && (
          <div className="pl-2">
            <Loader2 size={16} className="animate-spin" style={{ color: 'var(--color-text-muted)' }} />
          </div>
        )}

        {/* Clear Button */}
        {hasValue && !loading && (
          <button
            onClick={clear}
            className="flex items-center gap-1 px-2 py-1 rounded-lg cursor-pointer transition-all duration-150 hover:bg-red-50 hover:text-red-500 shrink-0"
            style={{ color: 'var(--color-text-muted)' }}
            tabIndex={-1}
            type="button"
            title="مسح التحديد"
          >
            <X size={14} className="shrink-0" />
            <span className="text-[10px] font-bold hidden sm:inline whitespace-nowrap">مسح</span>
          </button>
        )}

        {/* Chevron */}
        <button
          onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen); }}
          className="pl-3 pr-1 cursor-pointer shrink-0"
          style={{ color: 'var(--color-text-muted)' }}
          tabIndex={-1}
          type="button"
        >
          <ChevronDown
            size={16}
            className="transition-transform duration-200"
            style={{ transform: isOpen ? 'rotate(180deg)' : 'none' }}
          />
        </button>
      </div>

      {/* Error Message */}
      {error && (
        <p className="text-xs font-medium mt-1" style={{ color: 'var(--color-danger)' }}>
          {error}
        </p>
      )}

      {/* Dropdown */}
      {isOpen && (
        <div
          className="absolute top-full mt-1 left-0 right-0 z-[100] overflow-hidden rounded-xl border shadow-xl min-w-full"
          style={{
            background: 'var(--color-bg-card)',
            borderColor: 'var(--color-border)',
            maxHeight: '340px',
            display: 'flex',
            flexDirection: 'column',
            animation: 'fadeIn 0.12s ease-out',
          }}
        >
          <div ref={listRef} className="overflow-y-auto custom-scrollbar flex-1 py-1">
            {/* Loading state */}
            {loading && (
              <div className="flex items-center justify-center gap-2 py-8" style={{ color: 'var(--color-text-muted)' }}>
                <Loader2 size={18} className="animate-spin" />
                <span className="text-xs font-bold">جاري التحميل...</span>
              </div>
            )}

            {/* No results */}
            {!loading && filteredOptions.length === 0 && (
              <div className="flex flex-col items-center py-8 text-center">
                <Search size={24} className="mb-2 opacity-30" style={{ color: 'var(--color-text-muted)' }} />
                <p className="text-xs font-bold" style={{ color: 'var(--color-text-muted)' }}>
                  {noResultsText}
                </p>
                {searchQuery.trim() && (
                  <p className="text-[10px] opacity-50 mt-1" style={{ color: 'var(--color-text-muted)' }}>
                    لا توجد نتائج لـ "{searchQuery}"
                  </p>
                )}
              </div>
            )}

            {/* Options */}
            {!loading && filteredOptions.map((opt, idx) => {
              const isSelected = String(getOptionValue(opt)) === String(value);
              const isHighlighted = idx === safeHighlightedIndex;
              const label = getOptionLabel(opt);

              return (
                <button
                  key={getOptionValue(opt)}
                  data-autocomplete-item
                  onClick={() => select(opt)}
                  onMouseEnter={() => setHighlightedIndex(idx)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-right transition-all duration-75 cursor-pointer hover:bg-cyan-50/50 dark:hover:bg-slate-800/60"
                  title={label}
                  style={{
                    background: isHighlighted
                      ? 'var(--color-primary-light)'
                      : 'transparent',
                    color: isSelected
                      ? 'var(--color-primary)'
                      : isHighlighted
                        ? 'var(--color-primary)'
                        : 'var(--color-text)',
                  }}
                  type="button"
                >
                  <div
                    className="w-2 h-2 rounded-full shrink-0 transition-all duration-75 mt-1"
                    style={{
                      background: isSelected
                        ? 'var(--color-primary)'
                        : 'transparent',
                      border: isSelected
                        ? '2px solid var(--color-primary)'
                        : '2px solid var(--color-border)',
                    }}
                  />
                  <span className="text-sm font-bold leading-snug break-words text-right flex-1">
                    {searchQuery.trim() ? highlightMatch(label, searchQuery) : label}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Footer with count */}
          {!loading && filteredOptions.length > 0 && (
            <div
              className="px-4 py-1.5 text-[10px] font-bold shrink-0"
              style={{ color: 'var(--color-text-muted)', background: 'var(--color-bg)', borderTop: '1px solid var(--color-border)' }}
            >
              {filteredOptions.length} {filteredOptions.length === 1 ? 'نتيجة' : 'نتائج'}
              <span className="mr-3 opacity-60">↑↓ للتنقل · ⏎ للاختيار · ⎋ للإغلاق</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AutoComplete;
