import React, { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Building2, MapPin, Hospital, FileText,
  Syringe, Pill, Scale, BarChart3, ChevronDown,
  PanelRightClose, PanelRightOpen, Layers, 
  ClipboardList, ShoppingCart, TrendingUp, PieChart, Landmark, DollarSign,
  ShieldCheck, LayoutGrid, Database, Repeat, FileBarChart, ListFilter, Lock,
  HelpCircle, BookOpen, Info, AlertTriangle, ClipboardCheck, FileWarning, CheckSquare, Users,
  Gauge, Clock
} from 'lucide-react';
import logo from '../../assets/logo.png';
import { useAuth, hasPermission } from '../../context/AuthContext';

const menuGroups = [
  {
    key: 'master',
    title: 'البيانات الأساسية',
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
    key: 'transactions',
    title: 'عمليات الصرف',
    icon: Repeat,
    requiredRole: 'data_entry',
    items: [
      { to: '/transactions/drug-dispensing', label: 'صرف الأدوية (التفصيلي)', icon: ShoppingCart },
      { to: '/transactions/free-drugs', label: 'المنصرف الشهري (أدوية مجانية)', icon: ShieldCheck },
      { to: '/transactions/supported-drugs', label: 'المنصرف الشهري (أدوية مدعمة/تجارية)', icon: DollarSign },
      { to: '/transactions/supplies', label: 'المنصرف الشهري (مستلزمات طبية)', icon: Layers },
      { to: '/transactions/insulin-dispensing', label: 'صرف الإنسولين', icon: Syringe },
      { to: '/transactions/medical-tickets', label: 'التذاكر الطبية', icon: ClipboardList },
      { to: '/transactions/judicial-dispensing', label: 'أحكام المحكمة', icon: Landmark },
      { to: '/transactions/group-costs', label: 'تكلفة المجموعات الدوائية', icon: DollarSign },
      { to: '/transactions/branch-batch-summary', label: 'ملخص الفروع (دفعة واحدة)', icon: Building2 },
      { to: '/transactions/quick-tickets', label: 'إدخال سريع للتذاكر', icon: ClipboardList },
    ],
  },
  {
    key: 'reports',
    title: 'التقارير المتطورة',
    icon: FileBarChart,
    requiredRole: 'viewer',
    items: [
      { to: '/reports/analytical', label: 'التحليل الإحصائي العام', icon: BarChart3 },
      { to: '/reports/financial', label: 'الرقابة والتقارير المالية', icon: TrendingUp },
      { to: '/reports/comparison', label: 'نظام المقارنة الذكي', icon: PieChart },
      { to: '/reports/cost-analysis', label: 'تحليل التكلفة الشامل', icon: DollarSign },
      { to: '/reports/executive', label: 'التقرير التنفيذي الشامل', icon: ClipboardList },
      { to: '/reports/demographic', label: 'تحليل الفئات المستهدفة', icon: PieChart },
      { to: '/reports/anomaly', label: 'رصد الانحرافات', icon: FileWarning },
      { to: '/reports/reconciliation', label: 'المراجعة والمطابقة', icon: Scale },
      { to: '/reports/data-quality', label: 'جودة البيانات', icon: CheckSquare },
      { to: '/reports/pivot', label: 'التقارير المحورية الديناميكية', icon: LayoutGrid },
      { to: '/reports/judicial-analytics', label: 'تحليل الأحكام القضائية', icon: Scale },
      { to: '/reports/compliance', label: 'تقرير الامتثال بالإدخال', icon: ClipboardCheck },
      { to: '/reports/specialized/drugs', label: 'تقرير الأدوية التفصيلي', icon: Pill },
      { to: '/reports/specialized/insulin', label: 'تقرير صرف الإنسولين', icon: Syringe },
      { to: '/reports/specialized/tickets', label: 'تقرير التذاكر الطبية', icon: ClipboardList },
      { to: '/reports/specialized/judicial', label: 'تقرير الأحكام القضائية', icon: Landmark },
      { to: '/reports/specialized/supplies', label: 'تقرير المستلزمات الطبية', icon: Layers },
      { to: '/reports/specialized/free-drugs', label: 'تقرير الأدوية المجانية', icon: ShieldCheck },
      { to: '/reports/specialized/supported-drugs', label: 'تقرير الأدوية المدعمة', icon: DollarSign },
      { to: '/reports/specialized/drug-groups', label: 'المجموعات الدوائية', icon: LayoutGrid },
      { to: '/reports/temporal-hub', label: 'مركز التحليل الزمني الشامل', icon: BarChart3 },
    ],
  },
  {
    key: 'admin',
    title: 'الإدارة المتقدمة',
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

// Sidebar filter options
const FILTER_OPTIONS = [
  { key: 'all', label: 'الكل' },
  { key: 'master', label: 'الإدارة', requiredRole: 'admin' },
  { key: 'transactions', label: 'العمليات', requiredRole: 'data_entry' },
  { key: 'reports', label: 'التقارير', requiredRole: 'viewer' },
  { key: 'admin', label: 'الأمان', requiredRole: 'admin' },
  { key: 'help', label: 'المساعدة', requiredRole: 'viewer' },
];

import { preloadRoute } from '../../router/preloadUtils';

const Sidebar = ({ collapsed, onToggle }) => {
  const location = useLocation();
  const { user } = useAuth();
  const userRole = user?.role || 'viewer';

  // Filter groups based on user role
  const allowedGroups = menuGroups.filter(g => hasPermission(userRole, g.requiredRole));

  const [filterKey, setFilterKey] = useState('all');
  const [openGroups, setOpenGroups] = useState(() => {
    const map = {};
    menuGroups.forEach(g => { map[g.key] = true; });
    return map;
  });

  const toggleGroup = (key) => {
    setOpenGroups(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Filter groups based on dropdown selection and role permissions
  const visibleGroups = filterKey === 'all'
    ? allowedGroups
    : allowedGroups.filter(g => g.key === filterKey);

  // Check if any child of a group is active
  const isGroupActive = (group) => {
    return group.items.some(item => location.pathname === item.to || location.pathname.startsWith(item.to + '/'));
  };

  const linkClass = ({ isActive }) => `
    flex items-center ${collapsed ? 'justify-center' : 'gap-3'} px-4 py-3 rounded-xl cursor-pointer transition-all duration-300 text-sm font-bold
    ${isActive
      ? 'text-[var(--color-primary)] sidebar-active-glow'
      : 'text-[var(--color-text-muted)] hover:bg-[var(--color-bg)] hover:text-[var(--color-primary)]'
    }
  `;

  const linkStyle = (isActive) => isActive
    ? {
        background: 'transparent',
      }
    : {};

  return (
    <aside
      className="fixed top-0 right-0 h-full z-40 transition-all duration-300 flex flex-col border-l"
      style={{
        width: collapsed ? '80px' : '280px',
        background: 'var(--color-sidebar-bg)',
        borderColor: 'var(--color-border)',
        boxShadow: '-10px 0 30px rgba(0,0,0,0.05)',
      }}
      dir="rtl"
    >
      {/* Logo */}
      <div className="flex items-center gap-4 px-6 py-8" data-tauri-drag-region>
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 bg-white shadow-lg overflow-hidden border border-[var(--color-border)] p-1"
        >
          <img src={logo} alt="Logo" className="w-full h-full object-contain" />
        </div>
        {!collapsed && (
          <div className="flex flex-col">
            <span className="text-lg font-black tracking-tight leading-none" style={{ color: 'var(--color-text)' }}>إحصائياتي</span>
            <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--color-primary)] mt-1">Premium Stats</span>
          </div>
        )}
      </div>

      {/* Dashboard - Always Pinned at Top */}
      <div className="px-4 mb-2">
        <NavLink
          to="/"
          end
          onMouseEnter={() => preloadRoute('/')}
          className={linkClass}
          style={({ isActive }) => linkStyle(isActive)}
          title={collapsed ? 'لوحة المعلومات' : undefined}
        >
          {({ isActive }) => (
            <>
              <LayoutDashboard size={20} strokeWidth={isActive ? 2.5 : 2} />
              {!collapsed && <span>لوحة المعلومات</span>}
            </>
          )}
        </NavLink>
      </div>

      {/* Section Filter Dropdown - only when sidebar is expanded */}
      {!collapsed && (
        <div className="px-4 mb-3" data-tour-id="sidebar-filter">
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all"
            style={{ background: 'var(--color-bg)', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}
          >
            <ListFilter size={14} className="text-[var(--color-primary)] shrink-0" />
            <select
              className="flex-1 bg-transparent border-none outline-none text-xs font-black cursor-pointer"
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
      <nav className="flex-1 overflow-y-auto px-4 py-2 space-y-6 custom-scrollbar">
        {visibleGroups.map(group => {
          const groupActive = isGroupActive(group);
          return (
            <div key={group.key} data-tour-id={`sidebar-group-${group.key}`}>
              {/* Group Header - clickable to expand/collapse */}
              {!collapsed && (
                <button
                  onClick={() => toggleGroup(group.key)}
                  className="flex items-center justify-between w-full px-3 py-2.5 rounded-xl text-xs font-black tracking-wide cursor-pointer group transition-all duration-200"
                  style={{
                    color: groupActive ? 'var(--color-primary)' : 'var(--color-text-muted)',
                    background: openGroups[group.key] ? 'var(--color-bg)' : 'transparent',
                  }}
                >
                  <div className="flex items-center gap-2.5">
                    <group.icon size={16} className="opacity-70" />
                    <span className="opacity-90 group-hover:opacity-100 transition-opacity">{group.title}</span>
                    {groupActive && (
                      <div className="w-1.5 h-1.5 rounded-full bg-[var(--color-primary)] animate-pulse" />
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span
                      className="text-[9px] font-black px-1.5 py-0.5 rounded-md"
                      style={{ background: 'var(--color-border)', color: 'var(--color-text-muted)' }}
                    >
                      {group.items.length}
                    </span>
                    <ChevronDown
                      size={14}
                      className={`transition-transform duration-300 ${openGroups[group.key] ? '' : '-rotate-90'}`}
                    />
                  </div>
                </button>
              )}

              {/* Group Items - collapsible */}
              {(collapsed || openGroups[group.key]) && (
                <div className={`space-y-1 ${!collapsed ? 'mt-1 mr-2 border-r-2 pr-2' : ''}`}
                  style={!collapsed ? { borderColor: groupActive ? 'var(--color-primary)' : 'var(--color-border)' } : {}}
                >
                  {group.items.map(item => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      onMouseEnter={() => preloadRoute(item.to)}
                      className={linkClass}
                      style={({ isActive }) => linkStyle(isActive)}
                      title={collapsed ? item.label : undefined}
                    >
                      {({ isActive }) => (
                        <>
                          <item.icon size={18} strokeWidth={isActive ? 2.5 : 2} />
                          {!collapsed && <span className="text-[13px]">{item.label}</span>}
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

      {/* Collapse toggle */}
      <div className="p-4 mt-auto">
        <button
          onClick={onToggle}
          className="flex items-center justify-center gap-2 w-full py-3.5 rounded-2xl cursor-pointer transition-all duration-300 hover:shadow-inner"
          style={{ color: 'var(--color-text-muted)', background: 'var(--color-bg)' }}
        >
          {collapsed ? <PanelRightOpen size={20} /> : <PanelRightClose size={20} />}
          {!collapsed && <span className="text-xs font-black uppercase tracking-widest">طي القائمة</span>}
        </button>
      </div>
    </aside>
  );
};

export default React.memo(Sidebar);
