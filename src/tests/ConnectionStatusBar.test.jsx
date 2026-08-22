import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ConnectionStatusBar from '../components/ui/ConnectionStatusBar';

// Mock the connection-status hook so we control dbError directly.
vi.mock('../hooks/useConnectionStatus', () => ({
  default: vi.fn(),
}));

import useConnectionStatus from '../hooks/useConnectionStatus';

const mockHook = useConnectionStatus;

describe('ConnectionStatusBar — Database health warning', () => {
  beforeEach(() => {
    mockHook.mockReset();
    // Default: healthy DB + connected backend
    mockHook.mockReturnValue({
      status: 'connected',
      isOnline: true,
      latency: 12,
      lastCheck: Date.now(),
      checkNow: vi.fn(),
      wasDisconnected: false,
      dismissReconnect: vi.fn(),
      dbError: null,
    });
  });

  // ─── 1. dbError set → persistent warning banner is shown ─────────────
  it('shows the persistent DB health warning when dbError is set', () => {
    mockHook.mockReturnValue({
      status: 'connected',
      isOnline: true,
      latency: 12,
      lastCheck: Date.now(),
      checkNow: vi.fn(),
      wasDisconnected: false,
      dismissReconnect: vi.fn(),
      dbError: 'تعذر التحقق من سلامة قاعدة البيانات. تم إيقاف العمليات التي قد تؤثر على البيانات حفاظًا عليها. لم يتم إنشاء قاعدة بيانات جديدة أو حذف البيانات الحالية.',
    });

    render(<ConnectionStatusBar />);

    expect(
      screen.getByText(/تعذر التحقق من سلامة قاعدة البيانات/)
    ).toBeInTheDocument();
    expect(screen.getByText('إعادة الفحص')).toBeInTheDocument();
  });

  // ─── 2. dbError null → NO warning banner (normal status bar) ─────────
  it('does not show the warning banner when the DB is healthy', () => {
    render(<ConnectionStatusBar />);

    expect(
      screen.queryByText(/تعذر التحقق من سلامة قاعدة البيانات/)
    ).not.toBeInTheDocument();
  });
});
