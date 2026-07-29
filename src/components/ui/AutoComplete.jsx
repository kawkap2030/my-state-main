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
  getOptionLabel = (opt) => opt?.name || opt?.label || String(opt),
  getOptionValue = (opt) => opt?.id ?? opt?.value ?? opt,
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

  // ── Sync visual input with selected value ───────────────────────────────
  useEffect(() => {
    if (!isOpen) {
      setSearchQuery(selectedOption ? getOptionLabel(selectedOption) : '');
    }
  }, [selectedOption, isOpen, getOptionLabel]);

  // ── Reset highlighted index when filtered list changes ──────────────────
  useEffect(() => {
    setHighlightedIndex(0);
  }, [filteredOptions.length]);

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
      if (items[highlightedIndex]) {
        items[highlightedIndex].scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightedIndex, isOpen]);

  // ── Open dropdown and focus input ───────────────────────────────────────
  const open = useCallback(() => {
    if (disabled) return;
    setIsOpen(true);
    // Don't show the search value yet — it's set by the effect above
    // after the state update, which will clear the search query
    // Actually, the effect clears searchQuery when isOpen becomes false.
    // When isOpen becomes true, we should set searchQuery to what's
    // currently displayed in the input (which is the selected option label)
    setSearchQuery(selectedOption ? getOptionLabel(selectedOption) : '');
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
    if (!isOpen) setIsOpen(true);
    // If the input is cleared and matches no option, clear the value
    if (val === '' && value !== '') {
      // Don't immediately clear — user might be typing
      // Only clear on blur or explicit selection
    }
  }, [isOpen, value]);

  // ── Handle blur — restore label if no option selected ───────────────────
  const handleBlur = useCallback(() => {
    // Wait for click events to process before closing
    setTimeout(() => {
      if (!isOpen) {
        // Restore the selected label if nothing matched
        if (!selectedOption && value) {
          // Value set but no matching option found (e.g., initial load)
        }
      }
    }, 200);
  }, [isOpen, selectedOption, value]);

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
        className={`relative flex items-center rounded-xl border transition-all duration-200 cursor-text
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
          value={searchQuery}
          onChange={handleInputChange}
          onFocus={open}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          placeholder={hasValue ? '' : placeholder}
          disabled={disabled}
          className="flex-1 bg-transparent border-none outline-none text-sm font-bold py-3 pl-1"
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
            className="flex items-center gap-1 px-2 py-1 rounded-lg cursor-pointer transition-all duration-150 hover:bg-red-50 hover:text-red-500"
            style={{ color: 'var(--color-text-muted)' }}
            tabIndex={-1}
            type="button"
            title="مسح التحديد"
          >
            <X size={14} />
            <span className="text-[10px] font-bold hidden sm:inline">مسح</span>
          </button>
        )}

        {/* Chevron */}
        <button
          onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen); }}
          className="pl-3 pr-1 cursor-pointer"
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
          className="absolute top-full mt-1 left-0 right-0 z-[100] overflow-hidden rounded-xl border shadow-xl"
          style={{
            background: 'var(--color-bg-card)',
            borderColor: 'var(--color-border)',
            maxHeight: '260px',
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
              const isHighlighted = idx === highlightedIndex;
              const label = getOptionLabel(opt);

              return (
                <button
                  key={getOptionValue(opt)}
                  data-autocomplete-item
                  onClick={() => select(opt)}
                  onMouseEnter={() => setHighlightedIndex(idx)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-right transition-all duration-75 cursor-pointer"
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
                    className="w-2 h-2 rounded-full shrink-0 transition-all duration-75"
                    style={{
                      background: isSelected
                        ? 'var(--color-primary)'
                        : 'transparent',
                      border: isSelected
                        ? '2px solid var(--color-primary)'
                        : '2px solid var(--color-border)',
                    }}
                  />
                  <span className="text-sm font-bold truncate">
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
