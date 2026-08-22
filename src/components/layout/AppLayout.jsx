/* eslint-disable react-refresh/only-export-components */
import React, { useState, useMemo, Suspense, lazy, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Navbar from './Navbar';
import Footer from './Footer';
import TopScrollbar from './TopScrollbar';
import designerImg from '../../assets/Ahmed.jpeg';

import { useGlobalApp } from '../../context/useGlobalApp';
import { useSmartNotification } from '../../context/SmartNotificationContext';
import PageTransition from '../ui/PageTransition';
import useKeyboardShortcuts from '../../hooks/useKeyboardShortcuts';
import { useAuth } from '../../context/AuthContext';
import RecoverySetupModal from '../ui/RecoverySetupModal';
import { CalendarX, X } from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════════════
// Lazy-loaded overlay/modals — not needed on initial paint, so they're
// loaded on-demand when the user actually interacts with them.
// ═══════════════════════════════════════════════════════════════════════════
const TourGuide = lazy(() => import('../ui/TourGuide'));
const CommandPalette = lazy(() => import('../ui/CommandPalette'));
const GlobalSearchModal = lazy(() => import('../ui/GlobalSearchModal'));
const NotificationCenter = lazy(() => import('../ui/NotificationCenter'));
// Rendered here (inside the auth-gated layout) so the connection/DB health
// checks only run once the user is authenticated — not during Splash, Login,
// or First Run.
const ConnectionStatusBar = lazy(() => import('../ui/ConnectionStatusBar'));

// Featherweight fallback for lazy overlay/modals — just a tiny inert box
// so the Suspense boundary has near-zero cost before the chunk arrives.
const OverlayFallback = () => null;

const tourSteps = [
  {
    target: '.topbar-sticky', 
    title: 'أهلاً بك في نظام إحصائياتي',
    content: 'هذه جولة شاملة للتعرف على واجهة النظام وأهم ميزاته وأقسامه. تم إضافة العديد من التحسينات الجديدة!',
  },
  {
    target: '[data-tour-id="workspace-selector"]',
    title: 'نطاق العمل (Workspace)',
    content: 'من هنا يمكنك تغيير نطاق العمل وعرض البيانات، سواء كنت تريد رؤية إحصائيات "فروع" شاملة، أو "مناطق"، أو تفصيلي "عيادات".',
  },
  {
    target: 'aside', 
    title: 'القائمة الجانبية',
    content: 'هذا هو الموجه الرئيسي للنظام. يمكنك التنقل بين كل الأقسام. استخدم Ctrl+K لفتح نافذة التنقل السريع (Command Palette)، أو Ctrl+Shift+F للبحث العام في النظام.',
  },
  {
    target: '[data-tour-id="sidebar-filter"]',
    title: 'تصفية القائمة الجانبية',
    content: 'إذا كانت القائمة طويلة، يمكنك استخدام هذه القائمة المنسدلة للتركيز على قسم معين مثل "البيانات الأساسية" أو "التقارير" فقط.',
  },
  {
    target: '[data-tour-id="sidebar-group-master"]',
    title: 'البيانات الأساسية',
    content: 'هذا القسم مخصص لإدارة تعريفات النظام الأساسية: الفروع، العيادات، الأدوية، المستلزمات، وإعدادات الأقفال مع تقويم تفاعلي.',
  },
  {
    target: '[data-tour-id="sidebar-group-transactions"]',
    title: 'عمليات الصرف',
    content: 'من هنا يتم إدخال وإدارة بيانات المنصرف الشهري للأدوية، الإنسولين، التذاكر الطبية، وأحكام المحكمة. حقول البحث تدعم الآن الإكمال التلقائي (AutoComplete) لتسريع الإدخال.',
  },
  {
    target: '[data-tour-id="sidebar-group-reports"]',
    title: 'التقارير المتطورة',
    content: 'جوهر النظام! تقارير تحليلية ومالية مع رسوم بيانية. التصدير يدعم الآن PDF احترافي مع توقيع رقمي، وإعدادات مسبقة قابلة للحفظ (Export Presets)، ومعاينة طباعة محسّنة.',
  },
  {
    target: '[data-tour-id="theme-toggle"]',
    title: 'الوضع الداكن/الفاتح',
    content: 'النظام يدعم التبديل السلس بين الوضعين الفاتح والداكن لراحة عينيك. يتم حفظ تفضيلك تلقائياً لاستخدامه في الزيارات القادمة.',
  },
  {
    target: '[data-tour-id="lock-manager"]',
    title: 'إدارة أقفال الأشهر',
    content: 'أداة محسّنة مع تقويم تفاعلي لعرض الأشهر المقفلة والمفتوحة، مع إقفال تلقائي حسب الشهر الحالي وإشعارات عند محاولة تعديل بيانات مقفلة.',
  },
  {
    target: '[data-tour-id="command-palette-btn"]',
    title: 'التنقل السريع (Ctrl+K)',
    content: 'اضغط Ctrl+K لفتح نافذة التنقل السريع والانتقال فوراً لأي صفحة في النظام دون الحاجة للتنقل عبر القوائم.',
  },
  {
    target: '[data-tour-id="global-search-btn"]',
    title: 'البحث العام (Ctrl+Shift+F)',
    content: 'اضغط Ctrl+Shift+F لفتح البحث العام في النظام. اكتب أي كلمة مفتاحية وابحث في جميع صفحات النظام لتعثر على ما تريد.',
  },
  {
    target: '[data-tour-id="user-profile"]',
    title: 'الملف الشخصي والإشعارات',
    content: 'يعرض حسابك الحالي مع نظام إشعارات ذكي يدعم التراجع عن الإجراءات (Undo)، تجميع الإشعارات المتكررة، وسجل كامل للإشعارات.',
  },
  {
    target: '[data-tour-id="tour-btn"]',
    title: 'نهاية الجولة',
    content: 'إذا احتجت لتذكر هذه المعلومات، يمكنك دائماً إعادة الجولة بالضغط على هذا الزر. نتمنى لك تجربة موفقة!',
  }
];

import { preloadRoute } from '../../router/preloadUtils';

// ── Priority route ordering for staggered preloading ────────────────
const PRIORITY_ROUTES = [
  { path: '/',                    delay: 2000  },  // Dashboard — likely first page
  { path: '/transactions/monthly-totals',  delay: 4000  },
  { path: '/transactions/drug-dispensing', delay: 5000  },
  { path: '/reports/analytical', delay: 6000  },
  { path: '/transactions/free-drugs',      delay: 8000  },
];

// ── Legacy recovery prompt gate ───────────────────────────────────────
// STRICT check: only an explicit `false` counts as a Legacy account (no
// recovery code). `undefined`/`null` (e.g. mock/browser mode) are never
// treated as Legacy. `dismissed` = the user chose "لاحقاً" this session.
export const shouldShowLegacyRecovery = (user, dismissed) =>
  user?.has_recovery_code === false && !dismissed;

const AppLayout = () => {
  const [collapsed, setCollapsed] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isGlobalSearchOpen, setIsGlobalSearchOpen] = useState(false);
  const { isTourOpen, setIsTourOpen, missingMonthsAlert, dismissMissingMonths } = useGlobalApp();
  const { addNotification } = useSmartNotification();
  const { user } = useAuth();

  // Legacy accounts (recovery_hash IS NULL → has_recovery_code === false)
  // get a one-time-per-session prompt to create a Recovery Code. Choosing
  // "لاحقاً" dismisses it for the current session only (state only — nothing
  // is persisted; it reappears on the next login if the account stays legacy).
  //
  // The modal stays OPEN once triggered until the user explicitly closes it.
  // Deriving `isOpen` directly from the gate on every render would be wrong:
  // completing the flow calls markRecoveryConfigured(), which flips
  // has_recovery_code to true mid-flow and would close the modal before the
  // one-time code display is ever seen. So we snapshot the gate once on mount
  // (AppLayout only renders when authenticated) and only close explicitly.
  const [legacyRecoveryDismissed, setLegacyRecoveryDismissed] = useState(false);
  const [legacyRecoveryOpen, setLegacyRecoveryOpen] = useState(
    () => shouldShowLegacyRecovery(user, legacyRecoveryDismissed),
  );

  const closeLegacyRecovery = () => {
    setLegacyRecoveryOpen(false);
    setLegacyRecoveryDismissed(true);
  };

  // Listen for global notification events
  useEffect(() => {
    const handler = (e) => {
      addNotification(e.detail.type, e.detail.message, e.detail.options);
    };
    window.addEventListener('global:notification', handler);
    return () => window.removeEventListener('global:notification', handler);
  }, [addNotification]);

  // ── Staggered preloading: load critical routes one-by-one ─────────
  // (instead of blasting 5 in parallel, which overloads Vite dev server)
  useEffect(() => {
    const timers = PRIORITY_ROUTES.map(({ path, delay }) =>
      setTimeout(() => {
        try { preloadRoute(path); } catch (_) {}
      }, delay)
    );
    return () => timers.forEach(clearTimeout);
  }, []);

  // ── Preload sidebar-visible pages on hover (future enhancement) ───
  // (detect hover on sidebar items / mouseover on links)

  // ── Register shortcuts ──────────────────────────────────────────────
  const appShortcuts = useMemo(() => [
    {
      key: 'k',
      ctrl: true,
      handler: () => setIsCommandPaletteOpen(prev => !prev),
      description: 'فتح نافذة التنقل السريع',
      allowInInput: true,
    },
    {
      key: 'F',
      ctrl: true,
      shift: true,
      handler: () => setIsGlobalSearchOpen(prev => !prev),
      description: 'فتح البحث العام في النظام (Ctrl+Shift+F)',
      allowInInput: true,
    },
  ], []);
  useKeyboardShortcuts(appShortcuts);

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--color-bg)', color: 'var(--color-text)' }}>
        {/* ─── 1. Full-width Top Toolbar ───
             Spans the ENTIRE app width (not just the content column) so every
             top icon — theme toggle, user profile, search — sits inside it.
             Sticky: stays pinned at the top while scrolling. The sidebar and
             content start below it. */}
        <div className="no-print sticky top-0 z-[45] topbar-sticky overflow-visible">
          <Navbar
            collapsed={collapsed}
            onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
            onOpenGlobalSearch={() => setIsGlobalSearchOpen(true)}
          />
          {/* Full-window horizontal pan strip. Rendered OUTSIDE the <header>
              on purpose: the header's backdrop-filter creates a containing
              block for fixed descendants, which would shrink the strip to the
              header's width. Here it is viewport-fixed like the native bottom
              scrollbar, and the wrapper's height = the header's. */}
          <TopScrollbar />
        </div>

        {/* ─── 2. Sidebar (fixed; starts below the full-width toolbar) ─── */}
        <div className="no-print">
          <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
        </div>

        <div
          className="flex-1 flex flex-col transition-all duration-300 print:!m-0 print:!block"
          style={{ marginRight: collapsed ? '72px' : '260px' }}
          dir="rtl"
        >

          {/* Global Missing Months Alert */}
          {missingMonthsAlert.length > 0 && (
            <div className="mx-6 md:mx-8 mt-4 no-print">
              <div className="flex items-center gap-3 p-3 rounded-2xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 animate-slideUp">
                <CalendarX size={18} className="text-amber-600 dark:text-amber-400 shrink-0" />
                <p className="text-xs font-bold text-amber-700 dark:text-amber-300 flex-1">
                  <span className="font-extrabold">{missingMonthsAlert.length}</span> شهر لم يتم إدخال بياناته بعد:
                  {' '}{missingMonthsAlert.slice(0, 4).join('، ')}
                  {missingMonthsAlert.length > 4 && ` +${missingMonthsAlert.length - 4} أخرى`}
                </p>
                <button
                  onClick={dismissMissingMonths}
                  className="text-amber-500 hover:text-amber-700 dark:hover:text-amber-300 p-1 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-800 transition-colors"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          )}

          <main className="flex-1 p-6 md:p-8 print:!p-0 print:!block">
            {/* PageTransition wraps Outlet for smooth route animations */}
            <PageTransition>
              <Outlet />
            </PageTransition>

            {/* ─── 3. Print Designer Footer (Bottom, print-only) ─── */}
            <div className="only-print designer-branding">
               <div className="flex items-center justify-between">
                  <div className="text-sm text-slate-400 font-bold">
                    جميع الحقوق محفوظة © {new Date().getFullYear()} | منظومة الصرف الإلكتروني المطورة
                  </div>
                  <div className="flex items-center gap-4">
                     <div className="text-right">
                        <p className="text-[10px] font-bold text-slate-400">تصميم وإعداد وتطوير</p>
                        <p className="text-sm font-black text-slate-800">ك/ أحمد علي أحمد كوكب</p>
                     </div>
                     <img src={designerImg} alt="Designer" className="w-12 h-12 rounded-lg border border-slate-100" />
                  </div>
               </div>
            </div>
          </main>

          <div className="no-print">
            <Footer />
          </div>
        </div>

        {/* Tour Guide Overlay (lazy) */}
        <Suspense fallback={<OverlayFallback />}>
          <TourGuide 
            steps={tourSteps} 
            isOpen={isTourOpen} 
            onClose={() => setIsTourOpen(false)} 
          />
        </Suspense>

        {/* Command Palette — Ctrl+K (lazy) */}
        <Suspense fallback={<OverlayFallback />}>
          <CommandPalette
            isOpen={isCommandPaletteOpen}
            onClose={() => setIsCommandPaletteOpen(false)}
          />
        </Suspense>

        {/* Global Search — Ctrl+Shift+F (lazy) */}
        <Suspense fallback={<OverlayFallback />}>
          <GlobalSearchModal
            isOpen={isGlobalSearchOpen}
            onClose={() => setIsGlobalSearchOpen(false)}
          />
        </Suspense>

        {/* Notification Center Panel (lazy) */}
        <Suspense fallback={<OverlayFallback />}>
          <NotificationCenter />
        </Suspense>

        {/* Connection Status Bar (lazy, auth-gated) — only active inside
            the authenticated layout, not on Splash/Login/First Run. */}
        <Suspense fallback={<OverlayFallback />}>
          <ConnectionStatusBar />
        </Suspense>

        {/* Legacy Recovery Setup prompt (session-only dismiss) */}
        <RecoverySetupModal
          isOpen={legacyRecoveryOpen}
          onClose={closeLegacyRecovery}
          legacyMode
        />

      </div>
  );
};

export default React.memo(AppLayout);
