import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import {
  CheckCircle2, XCircle, AlertTriangle, Info,
  RotateCcw, Bell, BellRing, X
} from 'lucide-react';

// ─── Context ──────────────────────────────────────────────────────────
const SmartNotificationContext = createContext();

// ─── Constants ────────────────────────────────────────────────────────
const MAX_HISTORY = 200;
const DEDUP_WINDOW_MS = 5000; // Group identical notifications within 5s
const DEFAULT_DURATION = 4000;
const UNDO_TIMEOUT = 8000; // Undo action expires after 8s

let idCounter = 0;
const nextId = () => `notif_${++idCounter}_${Date.now()}`;

// ─── The Icons Map ───────────────────────────────────────────────────
const ICONS = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
  progress: Info,
};

// ─── Provider ─────────────────────────────────────────────────────────
export const SmartNotificationProvider = ({ children }) => {
  // ── State ───────────────────────────────────────────────────────────
  const [visibleToasts, setVisibleToasts] = useState([]);  // Currently visible
  const [history, setHistory] = useState([]);               // Full history log
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  // Undo stack
  const undoStackRef = useRef([]);

  // Dedup tracking refs (for grouping)
  const lastDedupRef = useRef(new Map());

  // ── Dismiss ───────────────────────────────────────────────────────
  const dismissNotification = useCallback((id) => {
    setVisibleToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // ── Core: Add Notification ─────────────────────────────────────────
  const addNotification = useCallback((
    type = 'info',
    message,
    options = {}
  ) => {
    const {
      duration = DEFAULT_DURATION,
      dedupKey = null,
      persistInHistory = true,
      undo = null,            // { label: string, handler: () => Promise<void> }
      actions = [],           // [{ label: string, icon: LucideIcon, handler: () => void }]
      critical = false,       // Bypasses dedup, always shows
      progress = null,        // 0-100 for progress toasts
    } = options;

    const id = nextId();

    // ── Dedup Logic ─────────────────────────────────────────────────
    if (dedupKey && !critical) {
      const now = Date.now();
      const last = lastDedupRef.current.get(dedupKey);
      if (last && (now - last.timestamp < DEDUP_WINDOW_MS)) {
        // Update existing toast instead of creating new
        setVisibleToasts(prev => prev.map(t =>
          t.id === last.id
            ? { ...t, message, type, count: (t.count || 1) + 1, progress }
            : t
        ));
        lastDedupRef.current.set(dedupKey, { id: last.id, timestamp: now });
        return last.id; // Return existing id
      }
      lastDedupRef.current.set(dedupKey, { id, timestamp: now });
    }

    // ── Build Notification Object ─────────────────────────────────
    const notification = {
      id,
      type,
      message,
      timestamp: Date.now(),
      duration,
      undo,
      actions,
      critical,
      progress,
      count: 1,
    };

    // ── Add to visible toasts ─────────────────────────────────────
    setVisibleToasts(prev => [...prev, notification]);

    // ── Add to undo stack ─────────────────────────────────────────
    if (undo) {
      // Clean expired entries first to prevent memory accumulation
      const now = Date.now();
      undoStackRef.current = undoStackRef.current.filter(a => a.expiresAt > now);
      undoStackRef.current.push({
        id,
        label: undo.label,
        handler: undo.handler,
        expiresAt: now + UNDO_TIMEOUT,
      });
    }

    // ── Persist in history ───────────────────────────────────────
    if (persistInHistory) {
      const historyEntry = {
        id,
        type,
        message,
        timestamp: Date.now(),
        read: false,
      };
      setHistory(prev => [historyEntry, ...prev].slice(0, MAX_HISTORY));
      setUnreadCount(prev => prev + 1);
    }

    // ── Auto-Dismiss ─────────────────────────────────────────────
    if (duration > 0 && !undo) {
      setTimeout(() => {
        dismissNotification(id);
      }, duration);
    } else if (undo) {
      // Undo-capable toasts: use max(duration, UNDO_TIMEOUT) if duration > 0,
      // otherwise use UNDO_TIMEOUT (never stay forever even with duration=0)
      const effectiveDuration = duration > 0 ? Math.max(duration, UNDO_TIMEOUT) : UNDO_TIMEOUT;
      setTimeout(() => {
        dismissNotification(id);
      }, effectiveDuration);
    }

    return id;
  }, [dismissNotification]);

  // ── Mark History as Read ──────────────────────────────────────────
  const markHistoryRead = useCallback((id) => {
    setHistory(prev => prev.map(h =>
      h.id === id ? { ...h, read: true } : h
    ));
    setUnreadCount(prev => Math.max(0, prev - 1));
  }, []);

  const markAllRead = useCallback(() => {
    setHistory(prev => prev.map(h => ({ ...h, read: true })));
    setUnreadCount(0);
  }, []);

  // ── Undo Action ──────────────────────────────────────────────────
  const undoLastAction = useCallback(async () => {
    const stack = undoStackRef.current;
    if (stack.length === 0) return false;

    const action = stack.pop();
    if (Date.now() > action.expiresAt) return false; // Expired

    try {
      await action.handler();
      addNotification('success', `تم التراجع عن: ${action.label}`, {
        duration: 3000,
        dedupKey: null,
        persistInHistory: true,
      });
      return true;
    } catch (err) {
      addNotification('error', `فشل التراجع: ${err.message || err}`, {
        duration: 4000,
        persistInHistory: true,
      });
      return false;
    }
  }, [addNotification]);

  // ── Live Undo Check (for future UI use) ───────────────────────
  const getCanUndo = useCallback(() => {
    const now = Date.now();
    // Clean expired on check
    undoStackRef.current = undoStackRef.current.filter(a => a.expiresAt > now);
    return undoStackRef.current.length > 0;
  }, []);

  // ── Clear History ────────────────────────────────────────────────
  const clearHistory = useCallback(() => {
    setHistory([]);
    setUnreadCount(0);
    undoStackRef.current = [];
  }, []);

  // ── Backward-Compatible API ──────────────────────────────────────
  const success = useCallback((msg, options = {}) =>
    addNotification('success', msg, options), [addNotification]);

  const error = useCallback((msg, options = {}) =>
    addNotification('error', msg, { duration: 6000, ...options }), [addNotification]);

  const warning = useCallback((msg, options = {}) =>
    addNotification('warning', msg, options), [addNotification]);

  const info = useCallback((msg, options = {}) =>
    addNotification('info', msg, options), [addNotification]);

  // ── Context Value ─────────────────────────────────────────────────
  const toastObj = React.useMemo(() => ({ success, error, warning, info }), [success, error, warning, info]);

  const value = React.useMemo(() => ({
    // Core
    addNotification,
    dismissNotification,
    visibleToasts,

    // History
    history,
    unreadCount,
    isHistoryOpen,
    setIsHistoryOpen,
    markHistoryRead,
    markAllRead,
    clearHistory,

    // Undo
    undoLastAction,
    getCanUndo,

    // Backward-compatible (useToast)
    success,
    error,
    warning,
    info,
    toast: toastObj,
  }), [
    addNotification, dismissNotification, visibleToasts,
    history, unreadCount, isHistoryOpen, setIsHistoryOpen,
    markHistoryRead, markAllRead, clearHistory,
    undoLastAction, getCanUndo,
    success, error, warning, info, toastObj
  ]);

  return (
    <SmartNotificationContext.Provider value={value}>
      {children}
    </SmartNotificationContext.Provider>
  );
};

// ── Hook ──────────────────────────────────────────────────────────────
export const useSmartNotification = () => {
  const context = useContext(SmartNotificationContext);
  if (!context) throw new Error('useSmartNotification must be used within SmartNotificationProvider');
  return context;
};
