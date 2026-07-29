import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// ═══════════════════════════════════════════════════════════════════════════
// Splash screen lifecycle:
//   1. index.html shows the splash immediately (zero JS wait)
//   2. React loads, renders <App/> into #root
//   3. Tauri backend sends 'splash:progress' events during setup
//   4. Tauri backend sends 'splash:complete' when fully ready
//   5. We hide the splash screen only after 'splash:complete' is received
//      OR after a fallback timeout (for non-Tauri / browser dev mode)
// ═══════════════════════════════════════════════════════════════════════════

const isTauri =
  typeof window !== 'undefined' &&
  (window.__TAURI__ || window.__TAURI_INTERNALS__);

const hideSplash = () => {
  if (typeof window.__hideSplash === 'function') {
    window.__hideSplash();
  } else {
    const splash = document.getElementById('splash-screen');
    if (splash) {
      splash.classList.add('hidden');
      setTimeout(() => {
        if (splash.parentNode) splash.parentNode.removeChild(splash);
      }, 600);
    }
  }
};

// ── Render React immediately ────────────────────────────────────────
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// ── Hide splash when Tauri backend is ready (or fallback timeout) ───
if (isTauri) {
  // Get the Tauri event API (v2: __TAURI__.event or __TAURI_INTERNALS__)
  const tauriEvent = window.__TAURI__?.event || window.__TAURI_INTERNALS__?.event;
  
  if (tauriEvent) {
    try {
      tauriEvent.listen('splash:complete', () => {
        // Small delay so the "done ✓" status is visible to the user
        setTimeout(hideSplash, 300);
      });
    } catch (_) {
      // Event listener failed, fallback to timeout
      setTimeout(hideSplash, 5000);
    }
  } else {
    // Event API not available in this version
    setTimeout(hideSplash, 4000);
  }

  // Absolute fallback: hide splash after 12s no matter what
  setTimeout(hideSplash, 12000);
} else {
  // Browser dev mode – give Vite a moment then hide
  setTimeout(hideSplash, 2000);
}
