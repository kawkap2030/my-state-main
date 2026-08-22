import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { listen } from '@tauri-apps/api/event'
import './index.css'
import App from './App.jsx'

// ═══════════════════════════════════════════════════════════════════════════
// Splash screen lifecycle:
//   1. index.html shows the splash immediately (zero JS wait)
//   2. This module loads, renders <App/> into #root
//   3. index.html registers the real 'splash:complete' listener via the
//      event plugin and sends a `splash_listener_ready` handshake. The Rust
//      backend emits 'splash:progress' + 'splash:complete' only AFTER that
//      handshake, so the events can never be dropped for having no listener
//      (Tauri 2.10.x does not buffer events for webviews without listeners).
//   4. We hide the splash when React mounts — either via event or timeout
// ═══════════════════════════════════════════════════════════════════════════

const hideSplash = () => {
  if (typeof window.__hideSplash === 'function') {
    window.__hideSplash();
  } else {
    const splash = document.getElementById('splash-screen');
    if (splash) {
      splash.classList.add('hidden');
      setTimeout(() => {
        if (splash.parentNode) splash.parentNode.removeChild(splash);
      }, 900);
    }
  }
};

// ── Render React immediately ────────────────────────────────────────
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// ── Hide splash once React has rendered ─────────────────────────
// The splash screen is visible while Vite loads modules + React mounts.
// We only hide it after React has actually mounted AND (in Tauri) the
// backend finished setup — this prevents the white/login/splash flicker.
// index.html's maybeHideSplash() does the real coordination via the
// __markReactReady / __markBackendDone flags.
const isTauri =
  typeof window !== 'undefined' &&
  (window.__TAURI__ || window.__TAURI_INTERNALS__);

// Wait until #root actually contains app content before telling index.html
// that React is ready. AuthProvider gates its children behind a one-tick
// `loading` flag, so the DOM stays empty for a moment after the first
// commit — marking ready then would hide the splash before the login
// screen is painted. Polling guarantees the login is visible underneath
// before the splash starts fading.
const waitForAppReady = () => {
  const root = document.getElementById('root');
  if (root && root.children.length > 0) {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (typeof window.__markReactReady === 'function') {
          window.__markReactReady();
        }
      });
    });
  } else {
    setTimeout(waitForAppReady, 30);
  }
};
setTimeout(waitForAppReady, 0);

// Listen for the 'splash:complete' Tauri event using the official API.
// Tauri v2 has no `window.__TAURI_INTERNALS__.event` (v1/withGlobalTauri
// only); `listen()` registers through the event plugin via IPC, so the
// backend's emit is guaranteed to find a registered listener.
if (isTauri) {
  listen('splash:complete', () => {
    if (typeof window.__markBackendDone === 'function') {
      window.__markBackendDone();
    } else {
      setTimeout(hideSplash, 300);
    }
  }).catch(() => {});
}

// Fallback timeout: UI safety net for React readiness only — it must NOT
// declare the backend ready. backendReady is set exclusively by the real
// 'splash:complete' event from Rust, which the backend only emits after the
// listener-ready handshake guarantees a JS listener exists (Tauri 2.10.x
// drops events for webviews with no registered listener — no buffering).
// In browser mode there is no Rust backend, so hiding the splash here is safe.
setTimeout(() => {
  if (typeof window.__markReactReady === 'function') {
    window.__markReactReady();
  }
  if (!isTauri) {
    hideSplash();
  }
}, 1500);



