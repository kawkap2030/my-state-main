import React, { useState } from 'react';
import logo from '../../assets/logo.png';
import { 
  Sun, Moon, User, Info, BookOpen, 
  Settings, Building2, MapPin, Hospital, ChevronDown,
  Lock, Compass, LogOut, Search, Command,
  Bell, BellRing, FileSignature
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useGlobalApp } from '../../context/useGlobalApp';
import { useAuth } from '../../context/AuthContext';
import { useSmartNotification } from '../../context/SmartNotificationContext';
import SignatureSettingsModal from '../common/SignatureSettingsModal';

const Navbar = ({ onOpenCommandPalette, onOpenGlobalSearch }) => {
  const { theme, toggleTheme, workspaceMode, setWorkspaceMode, lockedLevel, isIsolationExceptionActive, setIsTourOpen } = useGlobalApp();
  const { user, logout } = useAuth();
  const { unreadCount, setIsHistoryOpen } = useSmartNotification();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showSignatureSettings, setShowSignatureSettings] = useState(false);
  const navigate = useNavigate();

  const workspaceOptions = [
    { value: 'branches', level: 'branch', label: 'تجميعي فروع', icon: Building2 },
    { value: 'areas', level: 'area', label: 'تجميعي مناطق', icon: MapPin },
    { value: 'clinics', level: 'clinic', label: 'تفصيلي عيادات', icon: Hospital },
  ];

  const currentMode = workspaceOptions.find(opt => opt.value === workspaceMode);

  return (
    <header
      className="sticky top-0 z-30 flex items-center justify-between px-6 py-3 transition-all duration-300"
      style={{
        background: 'var(--color-glass)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--color-border)',
      }}
      dir="rtl"
      data-tauri-drag-region
    >
      {/* Global Search Button (Ctrl+Shift+F) */}
      <button
        onClick={onOpenGlobalSearch}
        className="p-2.5 rounded-xl hover:bg-indigo-50 hover:text-indigo-600 text-[var(--color-text-muted)] transition-all cursor-pointer group relative"
        title="البحث العام في النظام (Ctrl+Shift+F)"
        data-tour-id="global-search-btn"
      >
        <Search size={18} className="group-hover:scale-110 transition-transform" />
        {/* Shortcut badge */}
        <kbd
          className="hidden sm:inline-flex absolute -bottom-1 -left-1 items-center gap-0.5 px-1 py-0.5 rounded text-[8px] font-black leading-none"
          style={{ background: 'var(--color-bg)', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}
        >
          <Command size={8} />F
        </kbd>
      </button>

      {/* Right: Logo & Workspace Switcher */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-4 ml-4" data-tauri-drag-region>
          <div className="w-14 h-14 rounded-2xl bg-white backdrop-blur-sm p-1 shadow-md border border-[var(--color-border)] flex items-center justify-center overflow-hidden transition-transform hover:scale-105">
            <img src={logo} alt="Logo" className="w-full h-full object-contain" />
          </div>
          <div className="hidden sm:block" data-tauri-drag-region>
            <h1 className="text-xl font-black text-[var(--color-primary)] leading-none">إحصائياتي</h1>
            <p className="text-[11px] font-bold text-[var(--color-text-muted)] opacity-70 mt-1">My Stats Hub</p>
          </div>
        </div>

        <div className="w-[1px] h-8 bg-[var(--color-border)] mx-1 opacity-50 hidden md:block"></div>

        <div className="hidden md:flex items-center p-1 rounded-2xl bg-[var(--color-bg)] border border-[var(--color-border)] shadow-sm" data-tour-id="workspace-selector">
          {workspaceOptions.map((opt) => {
            const isDisabled = lockedLevel && lockedLevel !== opt.level && !isIsolationExceptionActive;
            const Icon = opt.icon;
            return (
              <button
                key={opt.value}
                onClick={() => !isDisabled && setWorkspaceMode(opt.value)}
                disabled={isDisabled}
                title={isDisabled ? `هذا الشهر مقفل على مستوى ${lockedLevel === 'branch' ? 'الفرع' : lockedLevel === 'area' ? 'المنطقة' : 'العيادة'}` : ''}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 ${
                  workspaceMode === opt.value 
                    ? 'bg-[var(--color-primary)] text-white shadow-md' 
                    : 'text-[var(--color-text-muted)] hover:bg-[var(--color-border)] hover:text-[var(--color-primary)]'
                } ${isDisabled ? 'opacity-30 cursor-not-allowed grayscale' : 'cursor-pointer'}`}
              >
                <Icon size={14} />
                <span>{opt.label}</span>
              </button>
            );
          })}
        </div>
        {/* Mobile View / Compact */}
        <div className="md:hidden">
           {currentMode && (
             <button className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--color-primary)] text-white text-xs font-bold shadow-md">
               {React.createElement(currentMode.icon, { size: 14 })}
               <span>{currentMode.label}</span>
             </button>
           )}
        </div>
      </div>

      {/* Left: Actions & Profiles */}
      <div className="flex items-center gap-2 md:gap-4">
        {/* Command Palette (Ctrl+K) */}
        <button
          onClick={onOpenCommandPalette}
          className="p-2.5 rounded-xl hover:bg-purple-50 hover:text-purple-600 text-[var(--color-text-muted)] transition-all cursor-pointer group relative"
          title="فتح التنقل السريع (Ctrl+K)"
          data-tour-id="command-palette-btn"
        >
          <Search size={18} className="group-hover:scale-110 transition-transform" />
          {/* Shortcut badge - hidden on small screens */}
          <kbd
            className="hidden sm:inline-flex absolute -bottom-1 -left-1 items-center gap-0.5 px-1 py-0.5 rounded text-[8px] font-black leading-none"
            style={{ background: 'var(--color-bg)', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}
          >
            <Command size={8} />K
          </kbd>
        </button>

        {/* Signature Settings */}
        <button 
          onClick={() => setShowSignatureSettings(true)}
          className="p-2.5 rounded-xl hover:bg-purple-50 hover:text-purple-600 text-[var(--color-text-muted)] transition-all cursor-pointer group"
          title="إعدادات التوقيع الرقمي"
        >
          <FileSignature size={18} className="group-hover:scale-110 transition-transform" />
        </button>

        {/* Month Lock Manager */}
        <button 
          onClick={() => navigate('/master-data/locks')}
          className="p-2.5 rounded-xl hover:bg-amber-50 hover:text-amber-600 text-[var(--color-text-muted)] transition-all cursor-pointer group"
          title="إدارة أقفال الأشهر"
          data-tour-id="lock-manager"
        >
          <Lock size={18} className="group-hover:scale-110 transition-transform" />
        </button>

        {/* Notification Center Bell */}
        <button
          onClick={() => setIsHistoryOpen(true)}
          className="relative p-2.5 rounded-xl hover:bg-amber-50 hover:text-amber-600 text-[var(--color-text-muted)] transition-all cursor-pointer group"
          title="سجل الإشعارات"
        >
          {unreadCount > 0 ? (
            <>
              <BellRing size={18} className="group-hover:scale-110 transition-transform" />
              <span
                className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[9px] font-black leading-none"
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
            <Bell size={18} className="group-hover:scale-110 transition-transform" />
          )}
        </button>

        {/* Start Tour */}
        <button 
          onClick={() => setIsTourOpen(true)}
          className="p-2.5 rounded-xl hover:bg-cyan-50 hover:text-cyan-600 text-[var(--color-text-muted)] transition-all cursor-pointer group"
          title="جولة تعريفية بالمميزات"
          data-tour-id="tour-btn"
        >
          <Compass size={18} className="group-hover:animate-spin-once" />
        </button>

        {/* User Manual */}
        <button 
          onClick={() => navigate('/help/user-guide')}
          className="p-2.5 rounded-xl hover:bg-[var(--color-border)] text-[var(--color-text-muted)] transition-all cursor-pointer"
          title="دليل المستخدم"
        >
          <BookOpen size={18} />
        </button>

        {/* Designer Info */}
        <button 
          onClick={() => navigate('/help/about-designer')}
          className="p-2.5 rounded-xl hover:bg-[var(--color-border)] text-[var(--color-text-muted)] transition-all cursor-pointer"
          title="عن المصمم"
        >
          <Info size={18} />
        </button>

        {/* Theme Toggle */}
        <button 
          onClick={toggleTheme}
          className="relative p-2.5 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-all cursor-pointer active:scale-90 group"
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
            className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"
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
              <Moon size={18} className="group-hover:scale-110 transition-transform" />
            ) : (
              <Sun size={18} className="group-hover:scale-110 transition-transform" />
            )}
          </div>
        </button>

        <div className="w-[1px] h-8 bg-[var(--color-border)] mx-1 opacity-50"></div>

        <div className="relative">
          <button 
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex items-center gap-2 p-1.5 rounded-2xl hover:bg-[var(--color-border)] transition-all cursor-pointer group" 
            data-tour-id="user-profile"
          >
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-primary-dark)] flex items-center justify-center text-white shadow-sm ring-2 ring-transparent group-hover:ring-[var(--color-primary-light)] transition-all">
              <User size={18} />
            </div>
            <div className="hidden lg:block text-right">
               <p className="text-[11px] font-black text-[var(--color-text)]">{user?.username || 'مدير النظام'}</p>
               <p className="text-[9px] font-bold text-[var(--color-text-muted)] uppercase tracking-tighter">{user?.role || 'Administrator'}</p>
            </div>
            <ChevronDown size={12} className="text-[var(--color-text-muted)] mr-1" />
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

      {/* Signature Settings Modal */}
      <SignatureSettingsModal
        isOpen={showSignatureSettings}
        onClose={() => setShowSignatureSettings(false)}
      />
    </header>
  );
};

export default React.memo(Navbar);
