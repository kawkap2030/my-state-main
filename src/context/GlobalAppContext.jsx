import React, { useState, useEffect, useCallback, useRef } from 'react';
import { isMonthLocked } from '../utils/dateUtils';
import invoke from '../api/tauriApi';
import { GlobalAppContext } from './AppContext';
import { useAuth } from './AuthContext';

export const GlobalAppProvider = ({ children }) => {
  let currentUser = null;
  try {
    const auth = useAuth();
    currentUser = auth?.user;
  } catch (_) {
    currentUser = null;
  }

  // ── Theme State with System Preference Detection ──────────────────────
  const getInitialTheme = () => {
    const saved = localStorage.getItem('theme');
    if (saved) return saved;
    // Detect system preference on first visit
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
    return 'light';
  };

  const [theme, setTheme] = useState(getInitialTheme);
  
  // Workspace Mode State: 'branches', 'areas', 'clinics'
  const [workspaceMode, setWorkspaceMode] = useState(() => localStorage.getItem('workspaceMode') || 'clinics');
  
  // Admin Master Unlock State
  const [isMasterUnlocked, setIsMasterUnlocked] = useState(false);

  // Manual Locked Months State
  const [manualLockedMonths, setManualLockedMonths] = useState({});

  // Month Isolation Lock State: 'branch', 'area', 'clinic', or null
  const [lockedLevel, setLockedLevel] = useState(null);

  // Exception for Monthly Totals to allow Clinic level on Branch/Area lock
  const [isIsolationExceptionActive, setIsIsolationExceptionActive] = useState(false);

  // ── Auto Lock Evaluation & Manual Lock Synchronization ──────────────────
  const reloadLocks = useCallback(async () => {
    try {
      const data = await invoke('get_manual_locked_months');
      const map = {};
      if (Array.isArray(data)) {
        data.forEach(([month, isLocked]) => {
          map[month] = isLocked;
        });
      }
      setManualLockedMonths(map);
      setIsMasterUnlocked(false);
    } catch (err) {
      console.error("Failed to load manual locks:", err);
    }
  }, []);

  const prevUserRef = useRef(currentUser);

  // Initial fetch on mount & re-evaluation on successful login / logout
  useEffect(() => {
    reloadLocks();
  }, [reloadLocks]);

  useEffect(() => {
    if (prevUserRef.current !== currentUser) {
      prevUserRef.current = currentUser;
      reloadLocks();
    }
  }, [currentUser, reloadLocks]);

  const checkIsMonthLocked = useCallback((monthStr) => {
    if (isMasterUnlocked) return false;
    
    // If manual rule exists, it takes priority over smart rule
    if (manualLockedMonths[monthStr] !== undefined) {
        return manualLockedMonths[monthStr];
    }

    // Default to smart rule (4 months)
    return isMonthLocked(monthStr);
  }, [isMasterUnlocked, manualLockedMonths]);

  // Active Working Context (Smart Persistence)
  const [activeHierarchy, setActiveHierarchy] = useState(() => {
    const saved = localStorage.getItem('activeHierarchy');
    return saved ? JSON.parse(saved) : {
      branchId: '',
      areaId: '',
      clinicId: '',
      dispenseMonth: new Date().toISOString().substring(0, 7)
    };
  });

  // Selected Hierarchy Info for Exports/Print
  const [hierarchyNames, setHierarchyNamesRaw] = useState({
    branch: '',
    area: '',
    clinic: ''
  });

  // Stable ref to avoid re-render loops when comparing previous values
  const hierarchyNamesRef = useRef(hierarchyNames);

  const setHierarchyNames = useCallback((newNames) => {
    const prev = hierarchyNamesRef.current;
    if (prev.branch !== newNames.branch || prev.area !== newNames.area || prev.clinic !== newNames.clinic) {
      hierarchyNamesRef.current = newNames;
      setHierarchyNamesRaw(newNames);
    }
  }, []);

  useEffect(() => {
    // Add transition class for smooth animation
    document.documentElement.classList.add('theme-transitioning');

    // Apply the theme
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);

    // Remove transition class after animation completes
    const timeout = setTimeout(() => {
      document.documentElement.classList.remove('theme-transitioning');
    }, 300);

    return () => clearTimeout(timeout);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('workspaceMode', workspaceMode);
  }, [workspaceMode]);

  useEffect(() => {
    localStorage.setItem('activeHierarchy', JSON.stringify(activeHierarchy));
  }, [activeHierarchy]);

  const toggleTheme = useCallback(() => setTheme(prev => prev === 'light' ? 'dark' : 'light'), []);

  const updateActiveHierarchy = useCallback((data) => {
    setActiveHierarchy(prev => {
      let changed = false;
      for (const key in data) {
        if (prev[key] !== data[key]) {
          changed = true;
          break;
        }
      }
      return changed ? { ...prev, ...data } : prev;
    });
  }, []);

  // ── Optional daily auto-backup (only if user enabled it) ─────
  useEffect(() => {
    const enabled = localStorage.getItem('dailyAutoBackup') === 'true';
    if (!enabled) return;
    const today = new Date().toISOString().slice(0, 10);
    const lastRun = localStorage.getItem('lastStartupBackup');
    if (lastRun === today) return;

    invoke('auto_backup', { maxBackups: 30 })
      .then((filename) => {
        console.log('[daily-backup] created:', filename);
        localStorage.setItem('lastStartupBackup', today);
      })
      .catch((err) => console.warn('[daily-backup] skipped:', err));
  }, []);

  // Missing months notification
  const [missingMonthsAlert, setMissingMonthsAlert] = useState([]);
  const [dismissedMissingMonths, setDismissedMissingMonths] = useState(() => 
    localStorage.getItem('dismissedMissingMonths') || ''
  );

  useEffect(() => {
    invoke('get_missing_months', { branchId: null })
      .then((months) => {
        if (Array.isArray(months) && months.length > 0) {
          // Check if user dismissed this alert today
          const today = new Date().toISOString().slice(0, 10);
          if (dismissedMissingMonths !== today) {
            setMissingMonthsAlert(months);
            // Also push to notification center via event
            try {
              const event = new CustomEvent('global:notification', {
                detail: {
                  type: 'warning',
                  message: `${months.length} شهور ناقصة: ${months.slice(0,3).join('، ')}${months.length > 3 ? '...' : ''}`,
                  options: { dedupKey: 'missing-months', persistInHistory: true, duration: 10000 }
                }
              });
              window.dispatchEvent(event);
            } catch (_) {}
          }
        }
      })
      .catch(() => {});
  }, [dismissedMissingMonths]);

  const dismissMissingMonths = useCallback(() => {
    setMissingMonthsAlert([]);
    const today = new Date().toISOString().slice(0, 10);
    localStorage.setItem('dismissedMissingMonths', today);
    setDismissedMissingMonths(today);
  }, []);

  // Tour State
  const [isTourOpen, setIsTourOpen] = useState(false);

  const value = React.useMemo(() => ({
    theme, 
    toggleTheme, 
    workspaceMode, 
    setWorkspaceMode,
    isMasterUnlocked,
    setIsMasterUnlocked,
    manualLockedMonths,
    setManualLockedMonths,
    checkIsMonthLocked,
    lockedLevel,
    setLockedLevel,
    hierarchyNames,
    setHierarchyNames,
    activeHierarchy,
    updateActiveHierarchy,
    isIsolationExceptionActive,
    setIsIsolationExceptionActive,
    isTourOpen,
    setIsTourOpen,
    missingMonthsAlert,
    dismissMissingMonths,
    reloadLocks
  }), [
    theme, workspaceMode, isMasterUnlocked, manualLockedMonths,
    lockedLevel, hierarchyNames, activeHierarchy,
    isIsolationExceptionActive, isTourOpen,
    missingMonthsAlert, dismissMissingMonths, checkIsMonthLocked,
    toggleTheme, updateActiveHierarchy, setHierarchyNames, reloadLocks
  ]);

  return (
    <GlobalAppContext.Provider value={value}>
      {children}
    </GlobalAppContext.Provider>
  );
};
