import React, { useState, useEffect, useCallback } from 'react';
import logo from '../../assets/logo.png';import {
  Sun, Moon, Info, BookOpen,
  Settings, Building2, MapPin, Hospital, ChevronDown,
  Lock, Compass, LogOut, Search, Command,
  Bell, BellRing, FileSignature, Database, Sparkles
} from 'lucide-react';
import invoke from '../../api/tauriApi';
import { useToast } from '../ui/Toast';
import designerImg from '../../assets/Ahmed.jpeg';
import kawkabIcon from '/kawkab.png';
import { useNavigate } from 'react-router-dom';
import { useGlobalApp } from '../../context/useGlobalApp';
import { useAuth } from '../../context/AuthContext';
import { useSmartNotification } from '../../context/SmartNotificationContext';

const Navbar = ({ onOpenCommandPalette, onOpenGlobalSearch }) => {
  const { theme, toggleTheme, workspaceMode, setWorkspaceMode, lockedLevel, isIsolationExceptionActive, setIsTourOpen } = useGlobalApp();
  const { user, logout } = useAuth();
  const { unreadCount, setIsHistoryOpen } = useSmartNotification();
  const [showUserMenu, setShowUserMenu] = useState(false);
    const [backupLoading, setBackupLoading] = useState(false);
  const [backupCount, setBackupCount] = useState(0);
  const [smartSuggestion, setSmartSuggestion] = useState(null);
  const navigate = useNavigate();
  const toast = useToast();

  // Load backup count + smart check on mount
  const loadBackupInfo = useCallback(async () => {
    try {
      const files = await invoke('get_backup_files');
      setBackupCount(Array.isArray(files) ? files.length : 0);

      // Smart backup: compare DB size vs latest backup size
      if (Array.isArray(files) && files.length > 0) {
        const dbSize = await invoke('get_db_size'); // MB
        const latestBackupKB = files[0]?.size || 0; // KB
        const latestBackupMB = latestBackupKB / 1024;
        const diffMB = Math.abs(dbSize - latestBackupMB);
        // If DB grew more than 2MB or 15% since last backup, suggest
        const threshold = Math.max(2, latestBackupMB * 0.15);
        if (diffMB > threshold && dbSize > latestBackupMB) {
          setSmartSuggestion({ dbSize: dbSize.toFixed(1), backupSize: latestBackupMB.toFixed(1), diff: diffMB.toFixed(1) });
        } else {
          setSmartSuggestion(null);
        }
      }
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    loadBackupInfo();
    const interval = setInterval(loadBackupInfo, 60000); // refresh every 60s
    return () => clearInterval(interval);
  }, [loadBackupInfo]);

  const handleQuickBackup = async () => {
    setBackupLoading(true);
    try {
      const filename = await invoke('auto_backup', { maxBackups: 30 });
      toast.success(`✅ تم إنشاء نسخة احتياطية: ${filename}`);
      setSmartSuggestion(null);
      loadBackupInfo();
    } catch (err) {
      toast.error('فشل إنشاء النسخة الاحتياطية: ' + err);
    } finally {
      setBackupLoading(false);
    }
  };
  const workspaceOptions = [
    { value: 'branches', level: 'branch', label: 'تجميعي فروع', icon: Building2 },
    { value: 'areas', level: 'area', label: 'تجميعي مناطق', icon: MapPin },
    { value: 'clinics', level: 'clinic', label: 'تفصيلي عيادات', icon: Hospital },
  ];

  const currentMode = workspaceOptions.find(opt => opt.value === workspaceMode);

  return (
    <header
      // relative (not sticky): the wrapper in AppLayout is sticky, and sticky
      // can only travel within its parent's box — the header itself is short.
      // relative also anchors the absolutely-positioned TopScrollbar strip.
      className="relative flex items-center justify-between px-6 py-3 transition-all duration-300"
      style={{
        background: 'var(--color-glass)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--color-border)',
      }}
      dir="rtl"
      data-tauri-drag-region
    >
      {/* Right: Logo, Search & Workspace Switcher */}
      <div className="flex items-center gap-4">
        {/* Global Search Button (Ctrl+Shift+F) */}
        <button
          onClick={onOpenGlobalSearch}
          className="p-3 rounded-2xl hover:bg-indigo-50 hover:text-indigo-600 text-[var(--color-text-muted)] transition-all cursor-pointer group relative"
          title="البحث العام في النظام (Ctrl+Shift+F)"
          data-tour-id="global-search-btn"
        >
          <Search size={22} className="group-hover:scale-110 transition-transform" />
          {/* Shortcut badge */}
          <kbd
            className="hidden sm:inline-flex absolute -bottom-1 -left-1 items-center gap-0.5 px-1 py-0.5 rounded text-[8px] font-black leading-none"
            style={{ background: 'var(--color-bg)', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}
          >
            <Command size={8} />F
          </kbd>
        </button>

        <div className="flex items-center gap-4" data-tauri-drag-region>
          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-white backdrop-blur-sm p-1.5 shadow-lg border border-[var(--color-border)] flex items-center justify-center overflow-hidden transition-transform hover:scale-105 shrink-0">
            <img src={logo} alt="Logo" className="w-full h-full object-contain transform scale-105" />
          </div>
          <div className="hidden sm:block" data-tauri-drag-region>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-black text-[var(--color-primary)] leading-none tracking-tight">منظومة إحصائيات الأدوية</h1>
              <div className="relative w-11 h-11 sm:w-13 sm:h-13 rounded-xl overflow-hidden bg-white shadow-md flex items-center justify-center p-1 border border-[var(--color-border)] transition-transform hover:scale-105 shrink-0">
                <img src={kawkabIcon} alt="كوكب" className="w-full h-full object-contain" />
              </div>
            </div>
            <p className="text-xs font-extrabold text-[var(--color-text-muted)] opacity-80 mt-1">والمستلزمات الطبية — الهيئة العامة للتأمين الصحي</p>
          </div>
        </div>

        <div className="w-[1px] h-9 bg-[var(--color-border)] mx-1 opacity-50 hidden md:block"></div>

        <div className="hidden md:flex items-center p-1.5 rounded-2xl bg-[var(--color-bg)] border border-[var(--color-border)] shadow-sm" data-tour-id="workspace-selector">
          {workspaceOptions.map((opt) => {
            const isDisabled = lockedLevel && lockedLevel !== opt.level && !isIsolationExceptionActive;
            const Icon = opt.icon;
            return (
              <button
                key={opt.value}
                onClick={() => !isDisabled && setWorkspaceMode(opt.value)}
                disabled={isDisabled}
                title={isDisabled ? `هذا الشهر مقفل على مستوى ${lockedLevel === 'branch' ? 'الفرع' : lockedLevel === 'area' ? 'المنطقة' : 'العيادة'}` : ''}
                className={`flex items-center gap-2.5 px-5 py-2.5 rounded-xl text-xs font-black transition-all duration-200 ${
                  workspaceMode === opt.value 
                    ? 'bg-[var(--color-primary)] text-white shadow-md scale-[1.02]' 
                    : 'text-[var(--color-text-muted)] hover:bg-[var(--color-border)] hover:text-[var(--color-primary)]'
                } ${isDisabled ? 'opacity-30 cursor-not-allowed grayscale' : 'cursor-pointer'}`}
              >
                <Icon size={18} />
                <span>{opt.label}</span>
              </button>
            );
          })}
        </div>
        {/* Mobile View / Compact */}
        <div className="md:hidden">
           {currentMode && (
             <button className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--color-primary)] text-white text-xs font-extrabold shadow-md">
               {React.createElement(currentMode.icon, { size: 18 })}
               <span>{currentMode.label}</span>
             </button>
           )}
        </div>
      </div>

      {/* Left: Actions & Profiles */}
      <div className="flex items-center gap-2 md:gap-3">
        {/* Command Palette (Ctrl+K) */}
        <button
          onClick={onOpenCommandPalette}
          className="p-3 rounded-2xl hover:bg-purple-50 hover:text-purple-600 text-[var(--color-text-muted)] transition-all cursor-pointer group relative"
          title="فتح التنقل السريع (Ctrl+K)"
          data-tour-id="command-palette-btn"
        >
          <Search size={22} className="group-hover:scale-110 transition-transform" />
          {/* Shortcut badge - hidden on small screens */}
          <kbd
            className="hidden sm:inline-flex absolute -bottom-1 -left-1 items-center gap-0.5 px-1 py-0.5 rounded text-[8px] font-black leading-none"
            style={{ background: 'var(--color-bg)', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}
          >
            <Command size={8} />K
          </kbd>
        </button>

        {/* Month Lock Manager */}
        <button 
          onClick={() => navigate('/master-data/locks')}
          className="p-3 rounded-2xl hover:bg-amber-50 hover:text-amber-600 text-[var(--color-text-muted)] transition-all cursor-pointer group"
          title="إدارة أقفال الأشهر"
          data-tour-id="lock-manager"
        >
          <Lock size={22} className="group-hover:scale-110 transition-transform" />
        </button>

        {/* Notification Center Bell */}
        <button
          onClick={() => setIsHistoryOpen(true)}
          className="relative p-3 rounded-2xl hover:bg-amber-50 hover:text-amber-600 text-[var(--color-text-muted)] transition-all cursor-pointer group"
          title="سجل الإشعارات"
        >
          {unreadCount > 0 ? (
            <>
              <BellRing size={22} className="group-hover:scale-110 transition-transform" />
              <span
                className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[20px] h-[20px] px-1 rounded-full text-[10px] font-black leading-none"
                style={{
                  background: 'var(--color-danger)',
                  color: '#fff',
                  border: '2px solid var(--color-glass)',
                  boxShadow: '0 2px 6px rgba(220,38,38,0.4)',
                  animation: 'fadeIn 0.3s ease',
                }}
              >
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            </>
          ) : (
            <Bell size={22} className="group-hover:scale-110 transition-transform" />
          )}
        </button>

        {/* Start Tour */}
        <button 
          onClick={() => setIsTourOpen(true)}
          className="p-3 rounded-2xl hover:bg-cyan-50 hover:text-cyan-600 text-[var(--color-text-muted)] transition-all cursor-pointer group"
          title="جولة تعريفية بالمميزات"
          data-tour-id="tour-btn"
        >
          <Compass size={22} className="group-hover:animate-spin-once" />
        </button>

        {/* User Manual */}
        <button 
          onClick={() => navigate('/help/user-guide')}
          className="p-3 rounded-2xl hover:bg-[var(--color-border)] text-[var(--color-text-muted)] transition-all cursor-pointer"
          title="دليل المستخدم"
        >
          <BookOpen size={22} />
        </button>

        {/* Quick Backup + Counter + Smart Suggestion */}
        <div className="relative group">
          <button 
            onClick={handleQuickBackup}
            disabled={backupLoading}
            className={`p-3 rounded-2xl transition-all cursor-pointer disabled:opacity-50 flex items-center gap-2 ${smartSuggestion ? 'bg-amber-50 hover:bg-amber-100 text-amber-600 animate-pulse' : 'hover:bg-emerald-50 hover:text-emerald-600 text-[var(--color-text-muted)]'}`}
            title={smartSuggestion ? `⚠️ قاعدة البيانات كبرت ${smartSuggestion.diff} MB منذ آخر نسخة — اضغط للنسخ` : `نسخة احتياطية سريعة (${backupCount} نسخة محفوظة)`}
          >
            <Database size={22} className={backupLoading ? 'animate-spin' : 'group-hover:scale-110 transition-transform'} />
            <span className="text-[11px] font-black min-w-[20px] text-center rounded-full px-1.5 py-0.5 leading-none"
              style={{ background: 'var(--color-border)', color: 'var(--color-text-muted)' }}
            >{backupCount}</span>
            {smartSuggestion && <Sparkles size={16} className="text-amber-500 animate-bounce" />}
          </button>
          {/* Smart suggestion tooltip */}
          {smartSuggestion && (
            <div className="absolute left-0 top-full mt-2 w-56 bg-amber-50 border border-amber-200 rounded-xl shadow-lg p-3 text-xs animate-slideUp z-50" dir="rtl">
              <p className="font-black text-amber-700 mb-1">⚠️ اقتراح نسخ ذكي</p>
              <p className="text-amber-600">قاعدة البيانات: {smartSuggestion.dbSize} MB</p>
              <p className="text-amber-600">آخر نسخة: {smartSuggestion.backupSize} MB</p>
              <p className="text-amber-800 font-bold mt-1">الفرق: +{smartSuggestion.diff} MB</p>
            </div>
          )}
        </div>
        <button 
          onClick={() => navigate('/help/about-designer')}
          className="p-3 rounded-2xl hover:bg-[var(--color-border)] text-[var(--color-text-muted)] transition-all cursor-pointer"
          title="عن المصمم"
        >
          <Info size={22} />
        </button>

        {/* Theme Toggle */}
        <button 
          onClick={toggleTheme}
          className="relative p-3 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all cursor-pointer active:scale-90 group"
          data-tour-id="theme-toggle"
          title={theme === 'light' ? 'الوضع الداكن' : 'الوضع الفاتح'}
          style={{
            background: theme === 'light'
              ? 'var(--color-bg)'
              : 'linear-gradient(135deg, #1e293b, #0f172a)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-primary)',
          }}
        >
          {/* Animated background glow */}
          <div
            className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"
            style={{
              background: theme === 'light'
                ? 'radial-gradient(circle at center, rgba(8,145,178,0.08) 0%, transparent 70%)'
                : 'radial-gradient(circle at center, rgba(34,211,238,0.12) 0%, transparent 70%)',
            }}
          />
          {/* Icon with 360° rotation on theme change */}
          <div
            className="relative transition-all duration-500 ease-out"
            style={{ transform: theme === 'dark' ? 'rotate(360deg)' : 'rotate(0deg)' }}
          >
            {theme === 'light' ? (
              <Moon size={22} className="group-hover:scale-110 transition-transform" />
            ) : (
              <Sun size={22} className="group-hover:scale-110 transition-transform" />
            )}
          </div>
        </button>

        <div className="w-[1px] h-9 bg-[var(--color-border)] mx-1 opacity-50"></div>

        <div className="relative">
          <button 
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex items-center gap-2.5 p-1.5 rounded-2xl hover:bg-[var(--color-border)] transition-all cursor-pointer group" 
            data-tour-id="user-profile"
          >
            <div className="relative w-11 h-11 rounded-full overflow-hidden shadow-md ring-2 ring-transparent group-hover:ring-[var(--color-primary-light)] transition-all group shrink-0">
              {/* Gradient ring background for the avatar */}
              <div className="absolute -inset-1.5 rounded-full bg-gradient-to-br from-cyan-400 via-emerald-300 to-cyan-500 opacity-40 blur-[2px] group-hover:opacity-60 transition-all duration-300" />
              <div className="relative w-full h-full rounded-full overflow-hidden border border-white/60">
                <img src={designerImg} alt="أحمد كوكب" className="w-full h-full object-cover" />
              </div>
            </div>
            <div className="hidden lg:block text-right">
               <p className="text-xs font-black text-[var(--color-text)]">{user?.username || 'مدير النظام'}</p>
               <p className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-tighter">{user?.role || 'Administrator'}</p>
            </div>
            <ChevronDown size={14} className="text-[var(--color-text-muted)] mr-0.5" />
          </button>

          {showUserMenu && (
            <div className="absolute left-0 top-full mt-2 w-48 bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl shadow-xl overflow-hidden animate-slideUp">
              <button
                onClick={() => {
                  logout();
                  navigate('/login');
                }}
                className="w-full flex items-center gap-3 px-4 py-3 text-red-500 hover:bg-red-50 transition-colors text-xs font-bold text-right"
              >
                <LogOut size={16} />
                <span>تسجيل الخروج</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default React.memo(Navbar);
