import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import MonthIsolationWidget from '../components/dashboard/MonthIsolationWidget';
import invoke from '../api/tauriApi';

vi.mock('../context/useGlobalApp', () => ({
  useGlobalApp: () => ({
    workspaceMode: 'branches',
    setWorkspaceMode: vi.fn(),
    lockedLevel: 'branch',
    setLockedLevel: vi.fn(),
  }),
}));

vi.mock('../components/ui/Toast', () => ({
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  }),
}));

vi.mock('../context/useSmartNotification', () => ({
  useSmartNotification: () => ({
    addNotification: vi.fn(),
  }),
}));

describe('MonthIsolationWidget Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders correctly and locks level change when month has data', async () => {
    invoke.mockImplementation((cmd) => {
      if (cmd === 'get_month_isolation_rule') return Promise.resolve('branch');
      if (cmd === 'check_month_data_exists') return Promise.resolve(true);
      return Promise.resolve(null);
    });

    render(<MonthIsolationWidget branchId={1} dispenseMonth="2026-08" />);

    await waitFor(() => {
      expect(screen.getByText('نظام العزل الثلاثي (مركزي)')).toBeInTheDocument();
      expect(screen.getByText(/لا يمكن تغيير مستوى الإدخال لهذا الشهر بسبب وجود بيانات مسجلة بالفعل/i)).toBeInTheDocument();
    });

    // Forced unlock button should be displayed
    expect(screen.getByText('إلغاء القفل إجبارياً')).toBeInTheDocument();
  });

  it('allows changing level when month has no data', async () => {
    invoke.mockImplementation((cmd) => {
      if (cmd === 'get_month_isolation_rule') return Promise.resolve('branch');
      if (cmd === 'check_month_data_exists') return Promise.resolve(false);
      return Promise.resolve(null);
    });

    render(<MonthIsolationWidget branchId={1} dispenseMonth="2026-08" />);

    await waitFor(() => {
      expect(screen.getByText(/تغيير مستوى العزل/i)).toBeInTheDocument();
    });
  });
});
