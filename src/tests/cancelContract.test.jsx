import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// CONTRACT-GAP PROOF (D9.2 audit): under the current ExportMenuInner contract,
// `if (handled)` treats every truthy custom-handler result as success, and
// every falsy result as "declined — run the built-in export instead".
// There is NO return value expressing "user cancelled: stay silent AND do
// not run a fallback export". These tests encode the DESIRED contract:
//   - 'cancelled' sentinel -> silent + no fallback  (FAILS today: toasts)
//   - false               -> fallback export runs   (PASSES today: documents
//     why handlers must never return a raw save-false)
const { toastSuccess, toastError, excelMock, customMock } = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  excelMock: vi.fn(),
  customMock: vi.fn(),
}));

vi.mock('../utils/exportExcel', () => ({ exportMultiSheetExcel: (...a) => excelMock(...a) }));
vi.mock('../utils/exportWord', () => ({ exportToWord: vi.fn() }));
vi.mock('../utils/exportPdf', () => ({ exportToPDF: vi.fn() }));
vi.mock('../components/ui/Toast', () => ({
  useToast: () => ({
    success: (...a) => toastSuccess(...a),
    error: (...a) => toastError(...a),
    warning: vi.fn(),
    info: vi.fn(),
  }),
}));
vi.mock('../context/useGlobalApp', () => ({
  useGlobalApp: () => ({ workspaceMode: 'branches', hierarchyNames: {}, activeHierarchy: {} }),
}));
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: { username: 'tester' } }),
}));
vi.mock('../hooks/useReportSignatures', () => ({
  default: () => ({ signatures: {} }),
}));
vi.mock('../components/common/ExportSettingsModal', async () => {
  const React = (await import('react')).default;
  return {
    default: function AutoConfirm({ isOpen, onConfirm }) {
      React.useEffect(() => {
        if (isOpen) {
          onConfirm({
            orientation: 'landscape',
            marginPreset: 'standard',
            showPageNumbers: true,
            showSignatures: false,
            signatures: {},
          });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [isOpen]);
      return null;
    },
  };
});
vi.mock('../components/common/PrintPreviewModal', () => ({
  default: () => null,
}));

import ExportMenuInner from '../components/ui/ExportMenuInner';

// Contract tests (D9.3): ExportMenuInner honors the save-result contract —
// 'cancelled' stays silent with NO fallback export, plain false still means
// "declined" (built-in fallback runs), and unknown results stay silent.
describe('custom-handler cancel contract (D9.3)', () => {
  beforeEach(() => {
    toastSuccess.mockReset();
    toastError.mockReset();
    excelMock.mockReset();
    customMock.mockReset();
  });

  const renderMenu = (handler) =>
    render(
      <ExportMenuInner
        data={[{ a: 'x' }]}
        columns={[{ header: 'H', accessor: 'a' }]}
        options={{ title: 'T', fileName: 'f' }}
        onCustomExport={handler}
      />
    );

  async function pickExcel() {
    fireEvent.click(screen.getByText('تصدير التقرير'));
    fireEvent.click(await screen.findByText('تصدير Excel'));
  }

  it("cancelled sentinel -> silent and NO fallback export", async () => {
    customMock.mockImplementation(async () => 'cancelled');
    renderMenu((...a) => customMock(...a));
    await pickExcel();
    await waitFor(() => expect(customMock).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 100));
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(toastError).not.toHaveBeenCalled();
    expect(excelMock).not.toHaveBeenCalled();
  });

  it('plain false still means "declined": built-in fallback export runs', async () => {
    customMock.mockResolvedValue(false);
    renderMenu((...a) => customMock(...a));
    await pickExcel();
    // Documents the trap: a save-cancel reported as false would re-export here.
    await waitFor(() => expect(excelMock).toHaveBeenCalled());
  });

  it('unknown result (undefined) -> silent, no fallback export', async () => {
    customMock.mockResolvedValue(undefined);
    renderMenu((...a) => customMock(...a));
    await pickExcel();
    await waitFor(() => expect(customMock).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 100));
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(toastError).not.toHaveBeenCalled();
    expect(excelMock).not.toHaveBeenCalled();
  });
});
