import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import useConnectionStatus from '../hooks/useConnectionStatus';

vi.mock('../api/tauriApi', () => ({
  invoke: vi.fn(),
  default: vi.fn(),
}));

describe('useConnectionStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete window.__TAURI_INTERNALS__;
  });

  it('should initialize with disconnected when not in Tauri environment', () => {
    const { result } = renderHook(() => useConnectionStatus());
    expect(result.current.status).toBe('disconnected');
    expect(result.current.isOnline).toBe(false);
  });

  it('should initialize with checking in Tauri environment', () => {
    window.__TAURI_INTERNALS__ = {};
    const { result } = renderHook(() => useConnectionStatus());
    expect(result.current.status).toBe('checking');
  });
});
