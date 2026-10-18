import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

// Controllable backend + save outcomes only; the REAL AuditLogPage is rendered.
const { toastSuccess, toastError, invokeMock, excelMock } = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  invokeMock: vi.fn(),
  excelMock: vi.fn(),
}));

vi.mock('../api/tauriApi', () => ({ default: (...a) => invokeMock(...a) }));
vi.mock('../components/ui/Toast', () => ({
  useToast: () => ({
    success: (...a) => toastSuccess(...a),
    error: (...a) => toastError(...a),
    warning: vi.fn(),
    info: vi.fn(),
  }),
}));
vi.mock('../utils/exportUtils', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, exportMultiSheetExcel: (...a) => excelMock(...a) };
});

import AuditLogPage from '../modules/admin/AuditLogPage';

const sampleLogs = [
  {
    timestamp: '2026-09-01 10:00:00',
    username: 'admin',
    action: 'INSERT',
    table_name: 'drugs',
    record_id: '1',
    details: 'test entry',
  },
  {
    timestamp: '2026-09-02 11:00:00',
    username: 'admin',
    action: 'UPDATE',
    table_name: 'clinics',
    record_id: '2',
    details: 'test update',
  },
];

describe('AuditLogPage Excel export toast (D9.2)', () => {
  beforeEach(() => {
    toastSuccess.mockReset();
    toastError.mockReset();
    excelMock.mockReset();
    invokeMock.mockReset();
    invokeMock.mockResolvedValue(sampleLogs);
  });

  async function openPageAndExportExcel() {
    render(
      <MemoryRouter>
        <AuditLogPage />
      </MemoryRouter>
    );
    const btn = await screen.findByRole('button', { name: /Excel/ });
    fireEvent.click(btn);
    await waitFor(() => expect(excelMock).toHaveBeenCalled());
  }

  it('save true -> success toast', async () => {
    excelMock.mockResolvedValue(true);
    await openPageAndExportExcel();
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledTimes(1));
    expect(toastError).not.toHaveBeenCalled();
  });

  it('dialog cancel (false) -> silent, no success and no error', async () => {
    excelMock.mockResolvedValue(false);
    await openPageAndExportExcel();
    await new Promise((r) => setTimeout(r, 100));
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(toastError).not.toHaveBeenCalled();
  });

  it('real failure -> error toast preserved, no success', async () => {
    excelMock.mockRejectedValue(new Error('disk full'));
    await openPageAndExportExcel();
    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    expect(toastSuccess).not.toHaveBeenCalled();
  });
});
