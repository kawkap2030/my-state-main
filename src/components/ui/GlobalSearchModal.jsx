/**
 * GlobalSearchModal — Ctrl+Shift+F search across ALL system content.
 *
 * Features:
 *   - Searches page names via searchablePages index
 *   - Searches ACTUAL DATA via Tauri API: drugs, branches, areas, clinics, supplies, insulin codes
 *   - Results grouped by type (الصفحات | الأدوية | الفروع | ...)
 *   - Each data item has a type badge and navigates to its management page
 *   - Debounced API calls (300ms) to avoid flooding
 *   - Keyboard navigation (↑↓→ Enter, Esc)
 *   - Highlight matching text
 *   - Empty state with search tips
 */
import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ArrowRight, Command, X, Loader2, Pill, Building2, MapPin, Hospital, Layers, Syringe } from 'lucide-react';
import { invoke } from '../../api/tauriApi';
import searchablePages from '../../utils/searchablePages';
import { useAuth, hasPermission } from '../../context/AuthContext';

// ── Data source config: how to fetch & where to link ────────────────
const DATA_SOURCES = [
  {
    key: 'drugs',
    label: 'الأدوية',
    icon: Pill,
    badge: 'دواء',
    badgeColor: '#10b981',
    invokeCmd: 'get_drugs',
    navPath: '/master-data/drugs',
    searchFields: ['name', 'scientific_name'],
  },
  {
    key: 'branches',
    label: 'الفروع',
    icon: Building2,
    badge: 'فرع',
    badgeColor: '#3b82f6',
    invokeCmd: 'get_branches',
    navPath: '/master-data/hierarchy/branches',
    searchFields: ['name'],
  },
  {
    key: 'areas',
    label: 'المناطق',
    icon: MapPin,
    badge: 'منطقة',
    badgeColor: '#8b5cf6',
    invokeCmd: 'get_areas',
    navPath: '/master-data/hierarchy/areas',
    searchFields: ['name'],
  },
  {
    key: 'clinics',
    label: 'العيادات',
    icon: Hospital,
    badge: 'عيادة',
    badgeColor: '#f59e0b',
    invokeCmd: 'get_clinics',
    navPath: '/master-data/hierarchy/clinics',
    searchFields: ['name'],
  },
  {
    key: 'supplies',
    label: 'المستلزمات',
    icon: Layers,
    badge: 'مستلزم',
    badgeColor: '#ef4444',
    invokeCmd: 'get_supplies',
    navPath: '/master-data/supplies',
    searchFields: ['name'],
  },
  {
    key: 'insulin_codes',
    label: 'الإنسولين',
    icon: Syringe,
    badge: 'إنسولين',
    badgeColor: '#ec4899',
    invokeCmd: 'get_insulin_codes',
    navPath: '/master-data/insulin',
    searchFields: ['name', 'type', 'category'],
  },
];

// ── Highlight matching text ─────────────────────────────────────────
const HighlightMatch = ({ text, query }) => {
  if (!query?.trim()) return <>{text}</>;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escaped})`, 'gi');
  const parts = String(text).split(regex);
  return parts.map((part, i) =>
    i % 2 === 1
      ? <mark key={i} className="rounded-sm px-0.5" style={{ background: 'var(--color-primary-light)', color: 'var(--color-primary)' }}>{part}</mark>
      : part
  );
};

// ── Search result item component ────────────────────────────────────
const SearchResultItem = ({
  icon: _Icon,
  iconBg,
  iconColor,
  label,
  sublabel,
  badge,
  badgeColor,
  isHighlighted,
  onSelect,
  onHover,
}) => (
  <button
    data-search-item
    onClick={onSelect}
    onMouseEnter={onHover}
    className="w-full flex items-center gap-3 px-5 py-3 text-right transition-all duration-75 cursor-pointer"
    style={{
      background: isHighlighted ? 'var(--color-primary-light)' : 'transparent',
      border: 'none',
    }}
  >
    {/* Icon */}
    <div
      className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
      style={{
        background: isHighlighted ? (iconBg || 'var(--color-primary)') : 'var(--color-bg)',
        color: isHighlighted ? '#fff' : (iconColor || 'var(--color-text-muted)'),
      }}
    >
      <_Icon size={16} />
    </div>

    {/* Text */}
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2">
        <span
          className="text-sm font-bold truncate"
          style={{ color: isHighlighted ? 'var(--color-primary)' : 'var(--color-text)' }}
        >
          {label}
        </span>
        {badge && (
          <span
            className="text-[8px] font-black px-1.5 py-0.5 rounded-full shrink-0"
            style={{ background: `${badgeColor}15`, color: badgeColor }}
          >
            {badge}
          </span>
        )}
      </div>
      {sublabel && (
        <p
          className="text-[11px] font-medium truncate mt-0.5"
          style={{ color: 'var(--color-text-muted)' }}
        >
          {sublabel}
        </p>
      )}
    </div>

    {/* Arrow */}
    <ArrowRight
      size={16}
      className="shrink-0 transition-all duration-75"
      style={{
        color: isHighlighted ? 'var(--color-primary)' : 'transparent',
        transform: isHighlighted ? 'translateX(-4px)' : 'none',
      }}
    />
  </button>
);

// ═════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═════════════════════════════════════════════════════════════════════

const GlobalSearchModal = ({ isOpen, onClose }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const userRole = user?.role || 'viewer';

  const [query, setQuery] = useState('');
  const [highlightedIdx, setHighlightedIdx] = useState(0);
  const [dataResults, setDataResults] = useState({});
  const [loadingSources, setLoadingSources] = useState({});
  const [errorSources, setErrorSources] = useState({});

  const inputRef = useRef(null);
  const listRef = useRef(null);
  const debounceRef = useRef(null);

  // ── Reset state on open ────────────────────────────────────────────
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setHighlightedIdx(0);
      setDataResults({});
      setLoadingSources({});
      setErrorSources({});
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [isOpen]);

  // ── Debounced data search via Tauri API ────────────────────────────
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const q = query.trim().toLowerCase();
    if (!q || q.length < 1) {
      setDataResults({});
      setLoadingSources({});
      setErrorSources({});
      return;
    }

    // For very short queries, only search pages (don't call APIs)
    if (q.length < 2) return;

    debounceRef.current = setTimeout(async () => {
      const results = {};
      const loading = {};
      const errors = {};

      // Fetch from all data sources in parallel
      const promises = DATA_SOURCES.map(async (source) => {
        loading[source.key] = true;
        setLoadingSources({ ...loading });

        try {
          const items = await invoke(source.invokeCmd);
          if (!Array.isArray(items)) {
            results[source.key] = [];
            return;
          }

          // Filter by query across search fields
          const filtered = items.filter(item => {
            return source.searchFields.some(field => {
              const val = item[field];
              return val && String(val).toLowerCase().includes(q);
            });
          });

          results[source.key] = filtered.slice(0, 20); // limit to 20 per source
        } catch (err) {
          errors[source.key] = true;
          results[source.key] = [];
        } finally {
          loading[source.key] = false;
          setLoadingSources({ ...loading });
          setDataResults({ ...results });
          setErrorSources({ ...errors });
        }
      });

      await Promise.allSettled(promises);
    }, 300); // 300ms debounce

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  // ── Filter pages by role + query ──────────────────────────────────
  const pageResults = useMemo(() => {
    const accessible = searchablePages.filter(p => hasPermission(userRole, p.role));
    if (!query.trim()) return accessible;

    const q = query.trim().toLowerCase();
    return accessible.filter(p => {
      const label = p.label.toLowerCase();
      const desc = p.desc.toLowerCase();
      const keywords = p.keywords.toLowerCase();
      const group = p.groupLabel.toLowerCase();
      return label.includes(q) || desc.includes(q) || keywords.includes(q) || group.includes(q);
    });
  }, [query, userRole]);

  // ── Build flat results list for keyboard navigation ────────────────
  const flatResults = useMemo(() => {
    const items = [];

    // Add page results
    pageResults.forEach(p => items.push({ type: 'page', ...p }));

    // Add data results
    DATA_SOURCES.forEach(source => {
      const data = dataResults[source.key];
      if (data && data.length > 0) {
        data.forEach(item => {
          items.push({
            type: 'data',
            sourceKey: source.key,
            label: item.name,
            sublabel: item.scientific_name || item.type || item.category || '',
            icon: source.icon,
            badge: source.badge,
            badgeColor: source.badgeColor,
            navPath: source.navPath,
            id: item.id,
          });
        });
      }
    });

    return items;
  }, [pageResults, dataResults]);

  // ── Navigate ──────────────────────────────────────────────────────
  const goTo = useCallback((item) => {
    if (item.type === 'page' || item.type === 'data') {
      navigate(item.navPath || item.path);
    }
    onClose();
  }, [navigate, onClose]);

  // ── Keyboard nav ──────────────────────────────────────────────────
  const handleKeyDown = useCallback((e) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIdx(p => Math.min(p + 1, flatResults.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIdx(p => Math.max(p - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (flatResults[highlightedIdx]) goTo(flatResults[highlightedIdx]);
        break;
      case 'Escape':
        e.preventDefault();
        onClose();
        break;
    }
  }, [flatResults, highlightedIdx, goTo, onClose]);

  // ── Scroll selected into view ─────────────────────────────────────
  useEffect(() => {
    if (listRef.current && flatResults.length > 0) {
      const items = listRef.current.querySelectorAll('[data-search-item]');
      if (items[highlightedIdx]) {
        items[highlightedIdx].scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightedIdx, flatResults.length]);

  // ── Reset highlighted when results change ─────────────────────────
  useEffect(() => {
    setHighlightedIdx(0);
  }, [query]);

  // ── Count total results ───────────────────────────────────────────
  const totalResults = useMemo(() => {
    return flatResults.length;
  }, [flatResults]);

  // ── Render groups ─────────────────────────────────────────────────
  const renderGroups = () => {
    const groups = [];

    // Pages group
    if (pageResults.length > 0) {
      groups.push({
        key: 'pages',
        label: 'الصفحات',
        dotColor: 'var(--color-primary)',
        items: pageResults.map(p => ({
          type: 'page',
          ...p,
          navPath: p.path,
          badge: null,
        })),
      });
    }

    // Data groups
    DATA_SOURCES.forEach(source => {
      const data = dataResults[source.key];
      const isLoading = loadingSources[source.key];
      if (data && data.length > 0) {
        groups.push({
          key: source.key,
          label: source.label,
          dotColor: source.badgeColor,
          items: data.map(item => ({
            type: 'data',
            sourceKey: source.key,
            label: item.name,
            sublabel: item.scientific_name || item.type || item.category || '',
            icon: source.icon,
            badge: source.badge,
            badgeColor: source.badgeColor,
            navPath: source.navPath,
            id: item.id,
          })),
        });
      } else if (isLoading && query.trim().length >= 2) {
        // Show loading state
        groups.push({
          key: `${source.key}_loading`,
          label: source.label,
          dotColor: source.badgeColor,
          items: [{ type: 'loading', sourceKey: source.key }],
        });
      }
    });

    if (groups.length === 0) return null;
    return groups;
  };

  const groups = useMemo(renderGroups, [pageResults, dataResults, loadingSources, query]);

  // ── Render ─────────────────────────────────────────────────────────
  if (!isOpen) return null;

  // Detect if any data source is loading
  const anyLoading = Object.values(loadingSources).some(Boolean);
  const anyError = Object.values(errorSources).some(Boolean);

  return (
    <div
      className="fixed inset-0 z-[300] flex flex-col items-center pt-[15vh] px-4"
      style={{
        background: 'rgba(15, 23, 42, 0.7)',
        backdropFilter: 'blur(8px)',
        animation: 'fadeIn 0.15s ease-out',
      }}
      dir="rtl"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-2xl rounded-2xl overflow-hidden shadow-2xl animate-slideUp"
        style={{
          background: 'var(--color-bg-card)',
          border: '1px solid var(--color-border)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Search Input ── */}
        <div
          className="flex items-center gap-3 px-5 py-4"
          style={{ borderBottom: '1px solid var(--color-border)' }}
        >
          <Search size={20} className="shrink-0" style={{ color: 'var(--color-primary)' }} />
          <input
            ref={inputRef}
            type="text"
            placeholder="ابحث في النظام بالكامل — صفحات، أدوية، فروع، عيادات..."
            className="flex-1 bg-transparent border-none outline-none text-base font-bold"
            style={{ color: 'var(--color-text)' }}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            autoComplete="off"
            spellCheck={false}
          />

          {/* Loading indicator */}
          {anyLoading && (
            <Loader2 size={18} className="animate-spin shrink-0" style={{ color: 'var(--color-text-muted)' }} />
          )}

          {/* Close button */}
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            style={{ color: 'var(--color-text-muted)' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* ── Results ── */}
        <div
          ref={listRef}
          className="overflow-y-auto"
          style={{ maxHeight: '55vh' }}
        >
          {query.trim() && query.trim().length < 2 ? (
            <div className="flex flex-col items-center py-12 text-center">
              <Search size={36} className="mb-3 opacity-20" style={{ color: 'var(--color-text-muted)' }} />
              <p className="text-sm font-bold" style={{ color: 'var(--color-text-muted)' }}>
                اكتب حرفين على الأقل للبحث
              </p>
              <p className="text-[11px] mt-1" style={{ color: 'var(--color-text-muted)', opacity: 0.6 }}>
                ابحث باسم صفحة، دواء، فرع، عيادة، أو مستلزم
              </p>
            </div>
          ) : !groups || groups.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-center">
              <Search size={48} className="mb-4 opacity-20" style={{ color: 'var(--color-text-muted)' }} />
              <p className="text-base font-bold" style={{ color: 'var(--color-text-muted)' }}>
                {query.trim()
                  ? `لا توجد نتائج لـ "${query.trim()}"`
                  : 'ابدأ بكتابة كلمة للبحث في النظام بالكامل'}
              </p>
              <p className="text-xs mt-2" style={{ color: 'var(--color-text-muted)', opacity: 0.6 }}>
                {query.trim()
                  ? 'جرب كلمات أخرى: اسم دواء، فرع، عيادة، أو اسم صفحة'
                  : 'مثال: باراسيتامول، فرع، عيادة الباطنية، تقارير'
                }
              </p>
            </div>
          ) : (
            <div className="py-2">
              {groups.map((group) => (
                <div key={group.key}>
                  {/* Group Header */}
                  <div
                    className="flex items-center gap-2 px-5 py-2 text-xs font-black uppercase tracking-widest"
                    style={{ color: 'var(--color-text-muted)', background: 'var(--color-bg)' }}
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ background: group.dotColor }}
                    />
                    <span>{group.label}</span>
                    {group.items[0]?.type !== 'loading' && (
                      <span
                        className="text-[9px] px-1.5 py-0.5 rounded-md"
                        style={{ background: 'var(--color-bg-card)', color: 'var(--color-text-muted)' }}
                      >
                        {group.items.length}
                      </span>
                    )}
                  </div>

                  {/* Group Items */}
                  {group.items.map((item, idxInGroup) => {
                    // Calculate flat index
                    let flatStart = 0;
                    for (const g of groups) {
                      if (g.key === group.key) break;
                      flatStart += g.items.length;
                    }
                    const flatIdx = flatStart + idxInGroup;
                    const isHighlighted = flatIdx === highlightedIdx;

                    // Loading placeholder
                    if (item.type === 'loading') {
                      return (
                        <div key={`loading-${item.sourceKey}`} className="flex items-center gap-3 px-5 py-4">
                          <Loader2 size={14} className="animate-spin" style={{ color: 'var(--color-text-muted)' }} />
                          <span className="text-xs font-bold" style={{ color: 'var(--color-text-muted)', opacity: 0.6 }}>
                            جاري تحميل {group.label}...
                          </span>
                        </div>
                      );
                    }

                    // Page result
                    if (item.type === 'page') {
                      const Icon = item.icon;
                      const isAdmin = item.role === 'admin';
                      const isDataEntry = item.role === 'data_entry';
                      return (
                        <SearchResultItem
                          key={item.path}
                          icon={Icon}
                          label={query.trim() ? <HighlightMatch text={item.label} query={query} /> : item.label}
                          sublabel={query.trim() ? <HighlightMatch text={item.desc} query={query} /> : item.desc}
                          badge={isAdmin ? 'مشرف' : isDataEntry ? 'إدخال' : null}
                          badgeColor={isAdmin ? 'var(--color-danger)' : isDataEntry ? 'var(--color-info)' : null}
                          isHighlighted={isHighlighted}
                          onSelect={() => goTo(item)}
                          onHover={() => setHighlightedIdx(flatIdx)}
                        />
                      );
                    }

                    // Data result (drug, branch, area, clinic, supply, insulin)
                    const Icon = item.icon || Search;
                    return (
                      <SearchResultItem
                        key={`${item.type}-${item.sourceKey}-${item.id}`}
                        icon={Icon}
                        iconBg={item.badgeColor}
                        iconColor={item.badgeColor}
                        label={query.trim() ? <HighlightMatch text={item.label} query={query} /> : item.label}
                        sublabel={query.trim() && item.sublabel ? <HighlightMatch text={item.sublabel} query={query} /> : item.sublabel}
                        badge={item.badge}
                        badgeColor={item.badgeColor}
                        isHighlighted={isHighlighted}
                        onSelect={() => goTo(item)}
                        onHover={() => setHighlightedIdx(flatIdx)}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Footer — keyboard hints + stats ── */}
        <div
          className="flex items-center justify-between px-5 py-2.5"
          style={{
            borderTop: '1px solid var(--color-border)',
            background: 'var(--color-bg)',
          }}
        >
          <div className="flex items-center gap-4">
            <span className="text-[10px] font-bold" style={{ color: 'var(--color-text-muted)' }}>
              {totalResults} {totalResults === 1 ? 'نتيجة' : (totalResults === 2 ? 'نتيجتان' : 'نتائج')}
            </span>
            {anyError && (
              <span className="text-[10px] font-bold" style={{ color: 'var(--color-warning)' }}>
                ⚠️ بعض المصادر غير متوفرة
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <kbd className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-black"
              style={{ background: 'var(--color-bg-card)', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}>
              <Command size={10} />F
            </kbd>
            <span className="text-[9px] font-bold" style={{ color: 'var(--color-text-muted)' }}>فتح</span>
            <kbd className="px-1.5 py-0.5 rounded text-[9px] font-black"
              style={{ background: 'var(--color-bg-card)', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}>
              ↑↓
            </kbd>
            <span className="text-[9px] font-bold" style={{ color: 'var(--color-text-muted)' }}>تنقل</span>
            <kbd className="px-1.5 py-0.5 rounded text-[9px] font-black"
              style={{ background: 'var(--color-bg-card)', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}>
              ⎋
            </kbd>
            <span className="text-[9px] font-bold" style={{ color: 'var(--color-text-muted)' }}>إغلاق</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GlobalSearchModal;
