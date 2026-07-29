/**
 * useConnectionStatus — Monitors Tauri backend connection health.
 *
 * Periodically pings the backend via a lightweight command and reports
 * connection status. Automatically retries on failure with exponential
 * backoff.
 *
 * NEW: Detects when backend restarts after a crash and triggers auto-reload
 * to fix the "white screen after save crash" issue.
 *
 * Returns:
 *   status         — 'checking' | 'connected' | 'disconnected' | 'error'
 *   isOnline       — true when connected
 *   latency        — round-trip time in ms (0 if not connected)
 *   lastCheck      — timestamp of last successful check
 *   checkNow       — function to force an immediate check
 *   wasDisconnected— true if backend was previously disconnected (for showing reconnect banner)
 *   dismissReconnect — call to dismiss the reconnect banner
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { invoke } from '../api/tauriApi';

const NORMAL_INTERVAL = 30_000;       // 30s between healthy checks
const RETRY_BASE = 2_000;             // 2s initial retry
const RETRY_MAX = 30_000;             // 30s max retry
const LATENCY_SAMPLES = 3;            // samples for latency average
const DISCONNECT_GRACE_MS = 3000;     // wait 3s after reconnecting before auto-reload

// ── Detect Tauri runtime availability ─────────────────────────────────
const isTauri = () => !!(window.__TAURI_INTERNALS__);

// ── Lightweight health check ──────────────────────────────────────────
const pingBackend = async () => {
  const start = performance.now();
  await invoke('get_branches');
  return Math.round(performance.now() - start);
};

const useConnectionStatus = () => {
  // Detect Tauri availability at creation time to avoid setState in effect
  const isTauriRuntime = isTauri();

  const [status, setStatus] = useState(() => isTauriRuntime ? 'checking' : 'disconnected');
  const [latency, setLatency] = useState(0);
  const [lastCheck, setLastCheck] = useState(null);
  const [wasDisconnected, setWasDisconnected] = useState(false);
  const statusRef = useRef(isTauriRuntime ? 'checking' : 'disconnected');
  const wasDisconnectedRef = useRef(false);
  const wasEverConnectedRef = useRef(false); // ← NEW: prevents false reload on initial startup
  const retryCountRef = useRef(0);
  const timerRef = useRef(null);
  const latencySamplesRef = useRef([]);
  const autoReloadTimerRef = useRef(null);

  // Keep the ref in sync with state
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    wasDisconnectedRef.current = wasDisconnected;
  }, [wasDisconnected]);

  // ── Auto-reload on backend restart ────────────────────────────────
  // When we transition from 'disconnected' → 'connected', the backend
  // has been restarted. All Tauri IPC connections are stale.
  // Auto-reload the page to get a fresh connection.
  useEffect(() => {
    if (status === 'connected' && wasDisconnectedRef.current) {
      // Grace period: wait before reloading to let WebView settle
      autoReloadTimerRef.current = setTimeout(() => {
        console.log('[ConnectionStatus] Backend restarted — reloading page...');
        window.location.reload();
      }, DISCONNECT_GRACE_MS);

      return () => {
        if (autoReloadTimerRef.current) {
          clearTimeout(autoReloadTimerRef.current);
        }
      };
    }
  }, [status]);

  // ── Ref to hold check function (breaks circular dep for setTimeout) ─
  const checkRef = useRef(null);

  // ── Core check function with auto-schedule (stable — never recreated) ─
  const check = useCallback(async () => {
    try {
      const ms = await pingBackend();

      // Rolling latency average
      const samples = latencySamplesRef.current;
      samples.push(ms);
      if (samples.length > LATENCY_SAMPLES) samples.shift();
      const avg = Math.round(samples.reduce((a, b) => a + b, 0) / samples.length);

      // Detect reconnection AFTER having been previously connected
      // (wasEverConnectedRef prevents false trigger on slow initial startup)
      const wasDisco = statusRef.current === 'disconnected' || statusRef.current === 'error';
      if (wasDisco && wasEverConnectedRef.current) {
        console.log('[ConnectionStatus] Backend reconnected after disconnect');
        setWasDisconnected(true);
      }

      // Mark as ever-connected after first successful ping (after initial startup)
      wasEverConnectedRef.current = true;

      setLatency(avg);
      setLastCheck(Date.now());
      setStatus('connected');
      retryCountRef.current = 0;
    } catch {
      retryCountRef.current += 1;

      // Use ref to avoid depending on `status` (which would re-create check every time)
      if (statusRef.current === 'connected' || statusRef.current === 'checking') {
        setStatus('disconnected');
      } else {
        setStatus('error');
      }
    }

    // ── Schedule the next check based on retry count ────────────────
    const retries = retryCountRef.current;
    const delay = retries === 0
      ? NORMAL_INTERVAL
      : Math.min(RETRY_BASE * Math.pow(2, retries - 1), RETRY_MAX);

    timerRef.current = setTimeout(() => checkRef.current?.(), delay);
  }, []);  // stable — no dependencies on state

  // Sync ref with latest check function (stable — runs once after mount)
  useEffect(() => {
    checkRef.current = check;
  }, [check]);

  // ── Initial kick-off on mount ──────────────────────────────────────
  useEffect(() => {
    // If not Tauri, state is already initialized as 'disconnected' via lazy useState
    if (!isTauriRuntime) return;

    let mountTimer = null;
    if (statusRef.current === 'checking') {
      // Defer to next macrotask to satisfy react-hooks/set-state-in-effect
      // (check() internally calls setState after async operations)
      mountTimer = setTimeout(check, 0);
    }

    return () => {
      if (mountTimer) clearTimeout(mountTimer);
      if (timerRef.current) clearTimeout(timerRef.current);
      if (autoReloadTimerRef.current) clearTimeout(autoReloadTimerRef.current);
    };
  }, [check, isTauriRuntime]);  // only runs once (check is stable)

  // ── Force immediate check ──────────────────────────────────────────
  const checkNow = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (autoReloadTimerRef.current) clearTimeout(autoReloadTimerRef.current);
    retryCountRef.current = 0;
    setWasDisconnected(false);
    setStatus('checking');
    check();
  }, [check]);

  // ── Dismiss reconnect banner ────────────────────────────────────
  const dismissReconnect = useCallback(() => {
    setWasDisconnected(false);
    wasDisconnectedRef.current = false;
    if (autoReloadTimerRef.current) {
      clearTimeout(autoReloadTimerRef.current);
    }
  }, []);

  return {
    status,
    isOnline: status === 'connected',
    latency,
    lastCheck,
    checkNow,
    wasDisconnected,
    dismissReconnect,
  };
};

export default useConnectionStatus;
