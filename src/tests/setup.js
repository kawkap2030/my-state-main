import '@testing-library/jest-dom';

// ─── Mock Tauri invoke ─────────────────────────────────────────────────────
// Since the app runs in Tauri, we mock the invoke function for all tests.
vi.mock('../api/tauriApi', () => ({
  default: vi.fn(async (_cmd, _args) => ({ success: true })),
  invoke: vi.fn(async (_cmd, _args) => ({ success: true })),
}));

// ─── Global localStorage clear between tests ──────────────────────────────
beforeEach(() => {
  localStorage.clear();
});

// ─── MatchMedia mock (for responsive components) ───────────────────────────
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});
