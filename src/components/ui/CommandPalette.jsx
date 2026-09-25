import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  Search, LayoutDashboard, Building2, MapPin, Hospital, Pill, Layers,
  Syringe, Scale, Lock, Database, ShoppingCart, ShieldCheck, DollarSign,
  ClipboardList, Landmark, FileBarChart, BarChart3, TrendingUp, PieChart,
  FileWarning, CheckSquare, LayoutGrid, ClipboardCheck, HelpCircle,
  BookOpen, Info, User, Repeat
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════════════
// All application routes — used for fast search & navigation
// ═══════════════════════════════════════════════════════════════════════════
const ALL_ROUTES = [
  // ── Dashboard ──────────────────────────────────────────────────────────
  { id: 'dashboard',          path: '/',                                          label: 'لوحة المعلومات',         category: 'الرئيسية',       icon: LayoutDashboard },

  // ── Master Data ─────────────────────────────────────────────────────────
  { id: 'branches',           path: '/master-data/hierarchy/branches',            label: 'الفروع',                 category: 'البيانات الأساسية', icon: Building2,   role: 'admin' },
  { id: 'areas',              path: '/master-data/hierarchy/areas',               label: 'المناطق',                category: 'البيانات الأساسية', icon: MapPin,      role: 'admin' },
  { id: 'clinics',            path: '/master-data/hierarchy/clinics',             label: 'العيادات',               category: 'البيانات الأساسية', icon: Hospital,    role: 'admin' },
  { id: 'drugs',              path: '/master-data/drugs',                         label: 'إدارة الأدوية',          category: 'البيانات الأساسية', icon: Pill,        role: 'admin' },
  { id: 'drug-groups',        path: '/master-data/drug-groups',                   label: 'المجموعات الدوائية',     category: 'البيانات الأساسية', icon: Layers,      role: 'admin' },
  { id: 'insulin-mgmt',       path: '/master-data/insulin',                       label: 'إدارة الإنسولين',        category: 'البيانات الأساسية', icon: Syringe,     role: 'admin' },
  { id: 'supplies-mgmt',      path: '/master-data/supplies',                      label: 'إدارة المستلزمات',       category: 'البيانات الأساسية', icon: Layers,      role: 'admin' },
  { id: 'judicial-setup',     path: '/master-data/judicial-setup',                label: 'أحكام المحكمة',          category: 'البيانات الأساسية', icon: Scale,       role: 'admin' },
  { id: 'locks',              path: '/master-data/locks',                         label: 'الإقفال الشهري',         category: 'البيانات الأساسية', icon: Lock,        role: 'admin' },
  { id: 'data-management',    path: '/master-data/data-management',               label: 'النسخ الاحتياطي',        category: 'البيانات الأساسية', icon: Database,    role: 'admin' },

  // ── Transactions ────────────────────────────────────────────────────────
  { id: 'drug-dispensing',    path: '/transactions/drug-dispensing',              label: 'صرف الأدوية (تفصيلي)',   category: 'عمليات الصرف',    icon: ShoppingCart,    role: 'data_entry' },
  { id: 'free-drugs',         path: '/transactions/free-drugs',                   label: 'المنصرف (أدوية مجانية)', category: 'عمليات الصرف',    icon: ShieldCheck,     role: 'data_entry' },
  { id: 'supported-drugs',    path: '/transactions/supported-drugs',              label: 'المنصرف (أدوية مدعمة)',  category: 'عمليات الصرف',    icon: DollarSign,      role: 'data_entry' },
  { id: 'supplies-totals',    path: '/transactions/supplies',                     label: 'المنصرف (مستلزمات)',     category: 'عمليات الصرف',    icon: Layers,          role: 'data_entry' },
  { id: 'insulin-dispensing', path: '/transactions/insulin-dispensing',           label: 'صرف الإنسولين',          category: 'عمليات الصرف',    icon: Syringe,         role: 'data_entry' },
  { id: 'medical-tickets',    path: '/transactions/medical-tickets',              label: 'التذاكر الطبية',         category: 'عمليات الصرف',    icon: ClipboardList,   role: 'data_entry' },
  { id: 'judicial-dispensing',path: '/transactions/judicial-dispensing',          label: 'أحكام المحكمة',          category: 'عمليات الصرف',    icon: Landmark,        role: 'data_entry' },
  { id: 'group-costs',        path: '/transactions/group-costs',                  label: 'تكلفة المجموعات',        category: 'عمليات الصرف',    icon: DollarSign,      role: 'data_entry' },
  { id: 'quick-tickets',      path: '/transactions/quick-tickets',                label: 'إدخال سريع للتذاكر',     category: 'عمليات الصرف',    icon: ClipboardList,   role: 'data_entry' },

  // ── Reports ─────────────────────────────────────────────────────────────
  { id: 'analytical',         path: '/reports/analytical',                        label: 'التحليل الإحصائي العام',  category: 'التقارير',         icon: BarChart3 },
  { id: 'financial',          path: '/reports/financial',                         label: 'التقارير المالية',       category: 'التقارير',         icon: TrendingUp },
  { id: 'comparison',         path: '/reports/comparison',                        label: 'المقارنة الذكية',        category: 'التقارير',         icon: PieChart },
  { id: 'cost-analysis',      path: '/reports/cost-analysis',                     label: 'تحليل التكلفة',          category: 'التقارير',         icon: DollarSign },
  { id: 'executive',          path: '/reports/executive',                         label: 'التقرير التنفيذي',       category: 'التقارير',         icon: ClipboardList },
  { id: 'demographic',        path: '/reports/demographic',                       label: 'تحليل الفئات',           category: 'التقارير',         icon: PieChart },
  { id: 'anomaly',            path: '/reports/anomaly',                           label: 'رصد الانحرافات',         category: 'التقارير',         icon: FileWarning },
  { id: 'reconciliation',     path: '/reports/reconciliation',                    label: 'الإجماليات الموحدة',     category: 'التقارير',         icon: Scale },
  { id: 'data-quality',       path: '/reports/data-quality',                      label: 'جودة البيانات',          category: 'التقارير',         icon: CheckSquare },
  { id: 'pivot',              path: '/reports/pivot',                             label: 'التقارير المحورية',      category: 'التقارير',         icon: LayoutGrid },
  { id: 'judicial-analytics', path: '/reports/judicial-analytics',                label: 'تحليل الأحكام',          category: 'التقارير',         icon: Scale },
  { id: 'compliance',         path: '/reports/compliance',                        label: 'تقرير الامتثال',         category: 'التقارير',         icon: ClipboardCheck },
  { id: 'temporal',           path: '/reports/temporal',                          label: 'التحليل الزمني',         category: 'التقارير',         icon: BarChart3 },

  // ── Specialized Reports ─────────────────────────────────────────────────
  { id: 'r-drugs',            path: '/reports/specialized/drugs',                 label: 'تقرير الأدوية التفصيلي',  category: 'تقارير متخصصة',    icon: Pill },
  { id: 'r-insulin',          path: '/reports/specialized/insulin',               label: 'تقرير صرف الإنسولين',    category: 'تقارير متخصصة',    icon: Syringe },
  { id: 'r-tickets',          path: '/reports/specialized/tickets',               label: 'تقرير التذاكر الطبية',   category: 'تقارير متخصصة',    icon: ClipboardList },
  { id: 'r-judicial',         path: '/reports/specialized/judicial',              label: 'تقرير الأحكام',          category: 'تقارير متخصصة',    icon: Landmark },
  { id: 'r-supplies',         path: '/reports/specialized/supplies',              label: 'تقرير المستلزمات',       category: 'تقارير متخصصة',    icon: Layers },
  { id: 'r-free-drugs',       path: '/reports/specialized/free-drugs',            label: 'تقرير الأدوية المجانية',category: 'تقارير متخصصة',    icon: ShieldCheck },
  { id: 'r-supported-drugs',  path: '/reports/specialized/supported-drugs',       label: 'تقرير الأدوية المدعمة',  category: 'تقارير متخصصة',    icon: DollarSign },
  { id: 'r-drug-groups',      path: '/reports/specialized/drug-groups',           label: 'المجموعات الدوائية',     category: 'تقارير متخصصة',    icon: LayoutGrid },

  // ── Admin ───────────────────────────────────────────────────────────────
  { id: 'audit-log',          path: '/admin/audit-log',                           label: 'سجل التدقيق',            category: 'الإدارة',          icon: ClipboardCheck, role: 'admin' },
  { id: 'user-management',    path: '/admin/user-management',                     label: 'إدارة المستخدمين',       category: 'الإدارة',          icon: User,           role: 'admin' },

  // ── Help ────────────────────────────────────────────────────────────────
  { id: 'user-guide',         path: '/help/user-guide',                           label: 'دليل المستخدم',          category: 'المساعدة',          icon: BookOpen },
  { id: 'about-designer',     path: '/help/about-designer',                       label: 'نبذة عن المصمم',         category: 'المساعدة',          icon: Info },
];

// ═══════════════════════════════════════════════════════════════════════════
// Components
// ═══════════════════════════════════════════════════════════════════════════

/** Renders text with the search query highlighted */
const HighlightedText = ({ text, query }) => {
  if (!query?.trim()) return text;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escaped})`, 'gi');
  const parts = text.split(regex);
  return parts.map((part, i) =>
    i % 2 === 1
      ? <mark key={i} className="rounded px-0.5" style={{ background: 'var(--color-primary-light)', color: 'var(--color-primary)' }}>{part}</mark>
      : part
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════════════════════

const CommandPalette = ({ isOpen, onClose }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const userRole = user?.role || 'viewer';

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [animateIn, setAnimateIn] = useState(false);

  const inputRef = useRef(null);
  const listRef = useRef(null);

  // ── Animation ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (isOpen) {
      // Opening: fade/slide in after a tiny delay so transition takes effect
      const t = setTimeout(() => setAnimateIn(true), 10);
      return () => clearTimeout(t);
    } else {
      // Closing: animate out first, then remove from DOM (deferred to satisfy lint)
      const t = setTimeout(() => setAnimateIn(false), 0);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  // ── Focus input on open ─────────────────────────────────────────────────
  useEffect(() => {
    if (isOpen && inputRef.current) inputRef.current.focus();
  }, [isOpen]);

  // ── Reset state on open ─────────────────────────────────────────────────
  useEffect(() => {
    if (isOpen) {
      const t = setTimeout(() => { setSearchQuery(''); setSelectedIndex(0); }, 0);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  // ── Filter routes by permissions + search query ─────────────────────────
  const filteredRoutes = useMemo(() => {
    // First filter by role permissions — the userRole accounts for role hierarchy:
    // admin > data_entry > viewer
    const roleLevel = userRole === 'admin' ? 3 : userRole === 'data_entry' ? 2 : 1;
    const allowed = ALL_ROUTES.filter(r => {
      if (!r.role) return true;
      const reqLevel = r.role === 'admin' ? 3 : r.role === 'data_entry' ? 2 : 1;
      return roleLevel >= reqLevel;
    });

    if (!searchQuery.trim()) return allowed;
    const q = searchQuery.trim().toLowerCase();
    return allowed.filter(r =>
      r.label.toLowerCase().includes(q) ||
      r.path.toLowerCase().includes(q) ||
      r.category.toLowerCase().includes(q)
    );
  }, [searchQuery, userRole]);

  // ── Group by category ───────────────────────────────────────────────────
  const groupedRoutes = useMemo(() => {
    const groups = {};
    filteredRoutes.forEach(r => {
      if (!groups[r.category]) groups[r.category] = [];
      groups[r.category].push(r);
    });
    return groups;
  }, [filteredRoutes]);

  // ── Flat list for keyboard nav (categories + routes) ────────────────────
  const flatItems = useMemo(() => {
    return Object.entries(groupedRoutes).flatMap(([cat, routes]) => [
      { type: 'category', label: cat },
      ...routes.map(r => ({ type: 'route', ...r })),
    ]);
  }, [groupedRoutes]);

  // ROUTE-ONLY indices (skip category headers)
  const routeIndices = useMemo(() => {
    return flatItems.reduce((acc, item, idx) => {
      if (item.type === 'route') acc.push(idx);
      return acc;
    }, []);
  }, [flatItems]);

  const routeCount = routeIndices.length;

  // Clamp selectedIndex when results change
  useEffect(() => {
    if (selectedIndex >= routeCount) {
      const t = setTimeout(() => setSelectedIndex(Math.max(0, routeCount - 1)), 0);
      return () => clearTimeout(t);
    }
  }, [routeCount, selectedIndex]);

  // ── Navigation ──────────────────────────────────────────────────────────
  const goTo = useCallback((path) => {
    navigate(path);
    onClose();
  }, [navigate, onClose]);

  // ── Keyboard handling ───────────────────────────────────────────────────
  const handleKeyDown = useCallback((e) => {
    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        onClose();
        break;
      case 'ArrowDown':
        e.preventDefault();
        if (routeCount <= 0) return;
        setSelectedIndex(p => Math.min(p + 1, routeCount - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (routeCount <= 0) return;
        setSelectedIndex(p => Math.max(p - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (routeIndices.length > 0) {
          const flatIdx = routeIndices[selectedIndex];
          const selected = flatItems[flatIdx];
          if (selected && selected.type === 'route') goTo(selected.path);
        }
        break;
    }
  }, [routeCount, routeIndices, flatItems, selectedIndex, goTo, onClose]);

  // ── Auto-scroll selected into view ──────────────────────────────────────
  useEffect(() => {
    if (routeIndices.length > 0 && listRef.current) {
      const flatIdx = routeIndices[selectedIndex];
      const items = listRef.current.querySelectorAll('[data-cmd-item]');
      if (items[flatIdx]) items[flatIdx].scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex, routeIndices]);

  // ── Render ──────────────────────────────────────────────────────────────
  if (!isOpen && !animateIn) return null;

  const categories = Object.entries(groupedRoutes);
  const totalHits = filteredRoutes.length;

  const paletteStyle = {
    background: animateIn ? 'rgba(0, 0, 0, 0.5)' : 'rgba(0, 0, 0, 0)',
    backdropFilter: animateIn ? 'blur(8px)' : 'blur(0px)',
  };

  const cardStyle = {
    background: 'var(--color-bg-card)',
    borderColor: 'var(--color-border)',
    opacity: animateIn ? 1 : 0,
    transform: animateIn ? 'translateY(0) scale(1)' : 'translateY(-24px) scale(0.96)',
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-start justify-center pt-[15vh] transition-all duration-200 ease-out"
      style={paletteStyle}
      onClick={onClose}
      dir="rtl"
    >
      <div
        className="w-full max-w-xl mx-4 overflow-hidden rounded-2xl shadow-2xl border transition-all duration-200 ease-out"
        style={cardStyle}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Search ─────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 px-5 py-4 border-b" style={{ borderColor: 'var(--color-border)' }}>
          <Search size={20} className="shrink-0" style={{ color: 'var(--color-text-muted)' }} />
          <input
            ref={inputRef}
            type="text"
            value={searchQuery}
            onChange={e => { setSearchQuery(e.target.value); setSelectedIndex(0); }}
            onKeyDown={handleKeyDown}
            placeholder="ابحث عن صفحة... (مثل: أدوية، تقارير، فروع)"
            className="flex-1 bg-transparent border-none outline-none text-base font-bold placeholder:opacity-50 placeholder:font-normal"
            style={{ color: 'var(--color-text)' }}
            autoComplete="off"
            spellCheck={false}
          />
          <kbd
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-black shrink-0"
            style={{ background: 'var(--color-bg)', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}
          >
            <span>⌘</span>K
          </kbd>
        </div>

        {/* ── Results ────────────────────────────────────────────── */}
        <div ref={listRef} className="overflow-y-auto flex-1 p-2 custom-scrollbar" style={{ maxHeight: '50vh', minHeight: 0 }}>
          {totalHits === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Search size={36} className="mb-4 opacity-20" style={{ color: 'var(--color-text-muted)' }} />
              <p className="text-sm font-bold" style={{ color: 'var(--color-text-muted)' }}>
                لا توجد نتائج لـ "{searchQuery}"
              </p>
              <p className="text-[11px] opacity-50 mt-1" style={{ color: 'var(--color-text-muted)' }}>
                جرب كلمة أخرى مثل: أدوية، تقارير، فروع
              </p>
            </div>
          ) : (
            categories.map(([cat, routes]) => (
              <div key={cat} className="mb-2">
                {/* Category header */}
                <div
                  className="flex items-center gap-2 px-4 py-2 text-[11px] font-black tracking-wider"
                  style={{ color: 'var(--color-text-muted)' }}
                >
                  <span className="opacity-30">——</span>
                  <span className="opacity-70">{cat}</span>
                  <span
                    className="text-[9px] px-1.5 py-0.5 rounded-md"
                    style={{ background: 'var(--color-bg)', color: 'var(--color-text-muted)' }}
                  >
                    {routes.length}
                  </span>
                </div>

                {/* Route items */}
                {routes.map(route => {
                  // Find this route's position in the flat list to derive its selected-index
                  const flatIdx = flatItems.findIndex(
                    fi => fi.type === 'route' && fi.id === route.id
                  );
                  const actualIdx = routeIndices.indexOf(flatIdx);
                  const isSelected = actualIdx === selectedIndex;
                  const Icon = route.icon;

                  return (
                    <button
                      key={route.id}
                      data-cmd-item
                      onClick={() => goTo(route.path)}
                      onMouseEnter={() => setSelectedIndex(actualIdx)}
                      className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-right transition-all duration-100 cursor-pointer"
                      style={{
                        background: isSelected ? 'var(--color-primary-light)' : 'transparent',
                        color: isSelected ? 'var(--color-primary)' : 'var(--color-text)',
                      }}
                    >
                      <div
                        className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-colors duration-100"
                        style={{
                          background: isSelected ? 'var(--color-primary)' : 'var(--color-bg)',
                          color: isSelected ? '#fff' : 'var(--color-text-muted)',
                        }}
                      >
                        <Icon size={16} strokeWidth={isSelected ? 2.5 : 2} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-bold truncate">
                          <HighlightedText text={route.label} query={searchQuery} />
                        </div>
                        <div className="text-[10px] font-mono opacity-50 truncate" style={{ color: 'var(--color-text-muted)' }}>
                          {route.path}
                        </div>
                      </div>
                      <span
                        className="text-[9px] px-2 py-1 rounded-lg font-black shrink-0"
                        style={{
                          background: isSelected ? 'rgba(255,255,255,0.2)' : 'var(--color-bg)',
                          color: isSelected ? 'rgba(255,255,255,0.8)' : 'var(--color-text-muted)',
                          opacity: isSelected ? 1 : 0.5,
                        }}
                      >
                        {route.category === 'البيانات الأساسية' ? 'بيانات' :
                         route.category === 'عمليات الصرف' ? 'صرف' :
                         route.category === 'التقارير' ? 'تقارير' :
                         route.category === 'تقارير متخصصة' ? 'متخصص' :
                         route.category === 'الإدارة' ? 'إدارة' :
                         route.category === 'المساعدة' ? 'مساعدة' : ''}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))
          )}

          {/* Footer hints */}
          {totalHits > 0 && (
            <div
              className="flex items-center justify-between px-4 py-2.5 mt-1 rounded-xl text-[10px] font-bold"
              style={{ color: 'var(--color-text-muted)', background: 'var(--color-bg)' }}
            >
              <span>{totalHits} {totalHits === 1 ? 'نتيجة' : 'نتائج'}</span>
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 rounded text-[9px]" style={{ background: 'var(--color-border)' }}>↑</kbd>
                  <kbd className="px-1.5 py-0.5 rounded text-[9px]" style={{ background: 'var(--color-border)' }}>↓</kbd>
                  {' '}للتنقل
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 rounded text-[9px]" style={{ background: 'var(--color-border)' }}>⏎</kbd>
                  {' '}للذهاب
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 rounded text-[9px]" style={{ background: 'var(--color-border)' }}>⎋</kbd>
                  {' '}للإغلاق
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CommandPalette;
