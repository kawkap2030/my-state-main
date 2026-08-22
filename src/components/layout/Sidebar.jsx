import React, { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Building2, MapPin, Hospital,
  Syringe, Pill, Scale, BarChart3, ChevronDown,
  PanelRightClose, PanelRightOpen, Layers, 
  ClipboardList, ShoppingCart, TrendingUp, PieChart, Landmark, DollarSign,
  ShieldCheck, LayoutGrid, Database, FileBarChart, ListFilter, Lock,
  HelpCircle, BookOpen, Info, ClipboardCheck, FileWarning, CheckSquare, Users,
  Gauge, Clock, Search, X
} from 'lucide-react';
import logo from '../../assets/logo.png';
import { useAuth, hasPermission } from '../../context/AuthContext';
import { preloadRoute } from '../../router/preloadUtils';

const menuGroups = [
  {
    key: 'master',
    title: 'البيانات الأساسية والإدارة',
    icon: Database,
    requiredRole: 'admin',
    items: [
      { to: '/master-data/hierarchy/branches', label: 'الفروع', icon: Building2 },
      { to: '/master-data/hierarchy/areas', label: 'المناطق', icon: MapPin },
      { to: '/master-data/hierarchy/clinics', label: 'العيادات', icon: Hospital },
      { to: '/master-data/drugs', label: 'إدارة الأدوية', icon: Pill },
      { to: '/master-data/drug-groups', label: 'إدارة المجموعات الدوائية', icon: Layers },
      { to: '/master-data/insulin', label: 'إدارة الإنسولين', icon: Syringe },
      { to: '/master-data/supplies', label: 'إدارة المستلزمات', icon: Layers },
      { to: '/master-data/judicial-setup', label: 'إدارة أحكام المحكمة', icon: Scale },
      { to: '/master-data/locks', label: 'إدارة الإقفال الشهري', icon: Lock },
      { to: '/master-data/data-management', label: 'إدارة البيانات والنسخ الاحتياطي', icon: Database },
    ],
  },
  {
    key: 'transactions-drugs',
    title: 'صرف الأدوية والمستلزمات',
    icon: ShoppingCart,
    requiredRole: 'data_entry',
    items: [
      { to: '/transactions/drug-dispensing', label: 'صرف الأدوية (التفصيلي)', icon: ShoppingCart },
      { to: '/transactions/free-drugs', label: 'المنصرف الشهري (أدوية مجانية)', icon: ShieldCheck },
      { to: '/transactions/supported-drugs', label: 'المنصرف الشهري (أدوية مدعمة/تجارية)', icon: DollarSign },
      { to: '/transactions/supplies', label: 'المنصرف الشهري (مستلزمات طبية)', icon: Layers },
      { to: '/transactions/insulin-dispensing', label: 'صرف الإنسولين', icon: Syringe },
      { to: '/transactions/group-costs', label: 'تكلفة المجموعات الدوائية', icon: DollarSign },
    ],
  },
  {
    key: 'transactions-tickets',
    title: 'التذاكر والأحكام والفروع',
    icon: ClipboardList,
    requiredRole: 'data_entry',
    items: [
      { to: '/transactions/medical-tickets', label: 'التذاكر الطبية', icon: ClipboardList },
      { to: '/transactions/quick-tickets', label: 'إدخال سريع للتذاكر', icon: ClipboardList },
      { to: '/transactions/judicial-dispensing', label: 'أحكام المحكمة', icon: Landmark },
      { to: '/transactions/branch-batch-summary', label: 'ملخص الفروع (دفعة واحدة)', icon: Building2 },
    ],
  },
  {
    key: 'reports-drugs',
    title: 'تقارير الأدوية والمستلزمات',
    icon: Pill,
    requiredRole: 'viewer',
    items: [
      { to: '/reports/specialized/drugs', label: 'تقرير الأدوية التفصيلي', icon: Pill },
      { to: '/reports/specialized/free-drugs', label: 'تقرير الأدوية المجانية', icon: ShieldCheck },
      { to: '/reports/specialized/supported-drugs', label: 'تقرير الأدوية المدعمة', icon: DollarSign },
      { to: '/reports/specialized/drug-groups', label: 'المجموعات الدوائية', icon: LayoutGrid },
      { to: '/reports/specialized/insulin', label: 'تقرير صرف الإنسولين', icon: Syringe },
      { to: '/reports/specialized/supplies', label: 'تقرير المستلزمات الطبية', icon: Layers },
    ],
  },
  {
    key: 'reports-tickets',
    title: 'تقارير التذاكر والأحكام',
    icon: ClipboardList,
    requiredRole: 'viewer',
    items: [
      { to: '/reports/specialized/tickets', label: 'تقرير التذاكر الطبية', icon: ClipboardList },
      { to: '/reports/specialized/judicial', label: 'تقرير الأحكام القضائية', icon: Landmark },
      { to: '/reports/judicial-analytics', label: 'تحليل الأحكام القضائية', icon: Scale },
    ],
  },
  {
    key: 'reports-financial',
    title: 'التقارير المالية والإحصائية',
    icon: TrendingUp,
    requiredRole: 'viewer',
    items: [
      { to: '/reports/analytical', label: 'التحليل الإحصائي العام', icon: BarChart3 },
      { to: '/reports/financial', label: 'الرقابة والتقارير المالية', icon: TrendingUp },
      { to: '/reports/cost-analysis', label: 'تحليل التكلفة الشامل', icon: DollarSign },
      { to: '/reports/executive', label: 'التقرير التنفيذي الشامل', icon: ClipboardList },
      { to: '/reports/comparison', label: 'نظام المقارنة الذكي', icon: PieChart },
      { to: '/reports/demographic', label: 'تحليل الفئات المستهدفة', icon: PieChart },
    ],
  },
  {
    key: 'reports-advanced',
    title: 'التقارير المتقدمة والجودة',
    icon: FileBarChart,
    requiredRole: 'viewer',
    items: [
      { to: '/reports/temporal-hub', label: 'مركز التحليل الزمني الشامل', icon: BarChart3 },
      { to: '/reports/pivot', label: 'التقارير المحورية الديناميكية', icon: LayoutGrid },
      { to: '/reports/anomaly', label: 'رصد الانحرافات', icon: FileWarning },
      { to: '/reports/reconciliation', label: 'الإجماليات الموحدة', icon: Scale },
      { to: '/reports/data-quality', label: 'جودة البيانات', icon: CheckSquare },
      { to: '/reports/compliance', label: 'تقرير الامتثال بالإدخال', icon: ClipboardCheck },
    ],
  },
  {
    key: 'admin',
    title: 'الإدارة المتقدمة والأمان',
    icon: ShieldCheck,
    requiredRole: 'admin',
    items: [
      { to: '/admin/audit-log', label: 'سجل التدقيق', icon: ClipboardCheck },
      { to: '/admin/user-management', label: 'إدارة المستخدمين', icon: Users },
      { to: '/admin/system-performance', label: 'أداء النظام', icon: Gauge },
      { to: '/admin/scheduled-reports', label: 'التقارير المجدولة', icon: Clock },
    ],
  },
  {
    key: 'help',
    title: 'المساعدة والدعم',
    icon: HelpCircle,
    requiredRole: 'viewer',
    items: [
      { to: '/help/user-guide', label: 'دليل المستخدم', icon: BookOpen },
      { to: '/help/about-designer', label: 'نبذة عن المصمم', icon: Info },
    ],
  },
];

// Sidebar filter options with subheadings
const FILTER_OPTIONS = [
  { key: 'all', label: '📌 جميع الأقسام والصفحات' },
  { key: 'master', label: '🏢 البيانات الأساسية والإدارة', requiredRole: 'admin' },
  { key: 'transactions', label: '🛒 جميع عمليات الصرف والتذاكر', requiredRole: 'data_entry' },
  { key: 'transactions-drugs', label: '   └─ 💊 صرف الأدوية والمستلزمات', requiredRole: 'data_entry' },
  { key: 'transactions-tickets', label: '   └─ 📋 التذاكر والأحكام والفروع', requiredRole: 'data_entry' },
  { key: 'reports', label: '📊 جميع التقارير الإحصائية', requiredRole: 'viewer' },
  { key: 'reports-drugs', label: '   └─ 💊 تقارير الأدوية والمستلزمات', requiredRole: 'viewer' },
  { key: 'reports-tickets', label: '   └─ 📜 تقارير التذاكر والأحكام', requiredRole: 'viewer' },
  { key: 'reports-financial', label: '   └─ 📈 التقارير المالية والإحصائية', requiredRole: 'viewer' },
  { key: 'reports-advanced', label: '   └─ ⚡ التقارير المتقدمة والجودة', requiredRole: 'viewer' },
  { key: 'admin', label: '🛡️ الإدارة المتقدمة والأمان', requiredRole: 'admin' },
  { key: 'help', label: '❓ المساعدة والدعم', requiredRole: 'viewer' },
];

const Sidebar = ({ collapsed, onToggle }) => {
  const location = useLocation();
  const { user } = useAuth();
  const userRole = user?.role || 'viewer';

  const [filterKey, setFilterKey] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [openGroups, setOpenGroups] = useState(() => {
    const map = {};
    menuGroups.forEach(g => { map[g.key] = true; });
    return map;
  });

  // Filter groups based on user role
  const allowedGroups = menuGroups.filter(g => hasPermission(userRole, g.requiredRole));

  const toggleGroup = (key) => {
    setOpenGroups(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Filter groups based on dropdown selection and role permissions
  const visibleGroupsByFilter = filterKey === 'all'
    ? allowedGroups
    : filterKey === 'reports'
      ? allowedGroups.filter(g => g.key.startsWith('reports-'))
      : filterKey === 'transactions'
        ? allowedGroups.filter(g => g.key.startsWith('transactions-'))
        : allowedGroups.filter(g => g.key === filterKey);

  // Apply search query filtering across menu items
  const visibleGroups = visibleGroupsByFilter.map(group => {
    if (!searchQuery.trim()) return group;
    const query = searchQuery.trim().toLowerCase();
    const matchingItems = group.items.filter(item =>
      item.label.toLowerCase().includes(query)
    );
    return { ...group, items: matchingItems };
  }).filter(group => group.items.length > 0);

  // Check if any child of a group is active
  const isGroupActive = (group) => {
    return group.items.some(item => location.pathname === item.to || location.pathname.startsWith(item.to + '/'));
  };

  const linkClass = ({ isActive }) => `
    flex items-center ${collapsed ? 'justify-center' : 'gap-3'} px-3.5 py-2.5 rounded-xl cursor-pointer transition-all duration-200 text-xs font-bold relative group
    ${isActive
      ? 'bg-[var(--color-primary)] text-white shadow-md font-black'
      : 'text-[var(--color-text-muted)] hover:bg-[var(--color-bg)] hover:text-[var(--color-primary)]'
    }
  `;

  return (
    <aside
      className="fixed right-0 z-40 transition-all duration-300 flex flex-col border-l shadow-2xl"
      style={{
        top: 'var(--navbar-h, 80px)',
        height: 'calc(100% - var(--navbar-h, 80px))',
        width: collapsed ? '80px' : '280px',
        background: 'var(--color-sidebar-bg)',
        borderColor: 'var(--color-border)',
        boxShadow: '-8px 0 25px rgba(0,0,0,0.06)',
      }}
      dir="rtl"
    >
      {/* Brand Header */}
      <div className="flex items-center gap-3.5 px-5 py-6" data-tauri-drag-region>
        <div
          className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 bg-white shadow-md overflow-hidden border border-[var(--color-border)] p-1 transition-transform hover:scale-105"
        >
          <img src={logo} alt="Logo" className="w-full h-full object-contain" />
        </div>
        {!collapsed && (
          <div className="flex flex-col">
            <span className="text-base font-black tracking-tight leading-none" style={{ color: 'var(--color-text)' }}>منظومة إحصائيات الأدوية</span>
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-[var(--color-primary)] mt-1 opacity-90">والمستلزمات الطبية</span>
          </div>
        )}
      </div>

      {/* Dashboard - Always Pinned at Top */}
      <div className="px-3 mb-2">
        <NavLink
          to="/"
          end
          onMouseEnter={() => preloadRoute('/')}
          className={linkClass}
          title={collapsed ? 'لوحة المعلومات' : undefined}
        >
          {({ isActive }) => (
            <>
              <LayoutDashboard size={19} strokeWidth={isActive ? 2.5 : 2} className={isActive ? 'animate-pulse' : ''} />
              {!collapsed && <span className="text-xs font-black">لوحة المعلومات</span>}
            </>
          )}
        </NavLink>
      </div>

      {/* Section Filter Dropdown & Quick Search — only when sidebar is expanded */}
      {!collapsed && (
        <div className="px-3 space-y-2 mb-3" data-tour-id="sidebar-filter">
          {/* Quick Live Search */}
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all focus-within:ring-2 focus-within:ring-[var(--color-primary)]"
            style={{ background: 'var(--color-bg)', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}
          >
            <Search size={14} className="text-[var(--color-primary)] shrink-0" />
            <input
              type="text"
              placeholder="بحث سريع في القائمة..."
              className="flex-1 bg-transparent border-none outline-none text-xs font-bold text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] placeholder:opacity-60"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="text-[var(--color-text-muted)] hover:text-red-500 cursor-pointer">
                <X size={13} />
              </button>
            )}
          </div>

          {/* Category Dropdown */}
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all"
            style={{ background: 'var(--color-bg)', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}
          >
            <ListFilter size={14} className="text-[var(--color-primary)] shrink-0" />
            <select
              className="flex-1 bg-transparent border-none outline-none text-xs font-black cursor-pointer truncate"
              style={{ color: 'var(--color-text)' }}
              value={filterKey}
              onChange={(e) => setFilterKey(e.target.value)}
            >
              {FILTER_OPTIONS.map(opt => (
                <option key={opt.key} value={opt.key}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Separator */}
      <div className="mx-4 mb-2 h-[1px] opacity-30" style={{ background: 'var(--color-border)' }} />

      {/* Menu Groups */}
      <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-4 custom-scrollbar">
        {visibleGroups.map(group => {
          const groupActive = isGroupActive(group);
          const isExpanded = collapsed || openGroups[group.key] || searchQuery.trim().length > 0;
          return (
            <div key={group.key} className="transition-all duration-200" data-tour-id={`sidebar-group-${group.key}`}>
              {/* Group Header */}
              {!collapsed && (
                <button
                  onClick={() => toggleGroup(group.key)}
                  className={`flex items-center justify-between w-full px-3.5 py-2.5 rounded-2xl text-xs font-black tracking-wide cursor-pointer group transition-all duration-300 shadow-sm border overflow-hidden ${
                    groupActive 
                      ? 'bg-cyan-500/15 border-cyan-500/40 text-[var(--color-primary)] dark:bg-cyan-400/15 dark:border-cyan-400/40' 
                      : 'bg-white/80 dark:bg-slate-600/40 border-slate-200/80 dark:border-slate-500/50 text-slate-800 dark:text-slate-100 hover:border-cyan-400/50 hover:bg-cyan-50/50 dark:hover:bg-slate-500/40'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <div className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-105 ${
                      groupActive
                        ? 'bg-[var(--color-primary)] text-white shadow-xs'
                        : 'bg-cyan-500/10 text-[var(--color-primary)]'
                    }`}>
                      <group.icon size={16} />
                    </div>
                    <span className="text-[13px] font-black tracking-tight truncate min-w-0">{group.title}</span>
                    {groupActive && (
                      <span className="w-2 h-2 rounded-full bg-[var(--color-primary)] animate-pulse shrink-0" />
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 mr-1">
                    <span
                      className={`text-[10px] font-black px-2 py-0.5 rounded-full shrink-0 ${
                        groupActive
                          ? 'bg-[var(--color-primary)] text-white'
                          : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {group.items.length}
                    </span>
                    <ChevronDown
                      size={14}
                      className={`shrink-0 transition-transform duration-300 ${isExpanded ? '' : '-rotate-90'}`}
                    />
                  </div>
                </button>
              )}

              {/* Group Items */}
              {isExpanded && (
                <div className={`space-y-1.5 ${!collapsed ? 'mt-2 mr-3.5 border-r-2 pr-3 border-cyan-500/30 dark:border-cyan-500/20' : ''}`}
                >
                  {group.items.map(item => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      onMouseEnter={() => preloadRoute(item.to)}
                      className={linkClass}
                      title={collapsed ? item.label : undefined}
                    >
                      {({ isActive }) => (
                        <>
                          <item.icon size={16} strokeWidth={isActive ? 2.5 : 2} className="shrink-0 group-hover:scale-110 transition-transform" />
                          {!collapsed && <span className="text-[12px] font-extrabold truncate">{item.label}</span>}
                        </>
                      )}
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Collapse Toggle Footer */}
      <div className="p-3 mt-auto border-t border-[var(--color-border)] opacity-90">
        <button
          onClick={onToggle}
          className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl cursor-pointer transition-all duration-300 hover:bg-[var(--color-bg)] hover:shadow-sm"
          style={{ color: 'var(--color-text-muted)' }}
        >
          {collapsed ? <PanelRightOpen size={18} /> : <PanelRightClose size={18} />}
          {!collapsed && <span className="text-xs font-extrabold uppercase tracking-wider">طي القائمة الجانبية</span>}
        </button>
      </div>
    </aside>
  );
};

export default React.memo(Sidebar);

