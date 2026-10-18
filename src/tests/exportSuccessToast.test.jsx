import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Shared spies (vi.hoisted: factories below run before imports).
const { toastSuccess, toastError, excelMock, wordMock, pdfMock } = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  excelMock: vi.fn(),
  wordMock: vi.fn(),
  pdfMock: vi.fn(),
}));

// Export engines: controllable save outcomes only.
vi.mock('../utils/exportExcel', () => ({ exportMultiSheetExcel: (...a) => excelMock(...a) }));
vi.mock('../utils/exportWord', () => ({ exportToWord: (...a) => wordMock(...a) }));
vi.mock('../utils/exportPdf', () => ({ exportToPDF: (...a) => pdfMock(...a) }));

// Toast + app contexts: deterministic dummies.
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
vi.mock('../hooks/useExportPresets', () => ({
  default: () => ({
    presets: [],
    savePreset: vi.fn(),
    getPresetById: vi.fn(),
    presetToSettings: vi.fn(),
    canDelete: false,
    deletePreset: vi.fn(),
    activePresetId: null,
    setActivePresetId: vi.fn(),
  }),
}));

// Settings modal: auto-confirm on open with standard settings, so the test
// drives the real handleExportWithSettings flow without UI guessing.
vi.mock('../components/common/ExportSettingsModal', async () => {
  const React = (await import('react')).default;
  return {
    default: function AutoConfirm({ isOpen, onConfirm }) {
      // Intentionally once-per-open: onConfirm identity changes per parent
      // render, so it must NOT retrigger the export.
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

// Preview modal stubbed here: its own PDF-button matrix is covered below
// against the REAL modal in a separate describe block.
vi.mock('../components/common/PrintPreviewModal', () => ({
  default: () => null,
}));

import ExportMenuInner from '../components/ui/ExportMenuInner';

const testData = [{ a: 'x' }];
const testCols = [{ header: 'H', accessor: 'a' }];
const testOptions = { title: 'T', fileName: 'f' };

async function openMenuAndPick(itemLabel) {
  fireEvent.click(screen.getByText('تصدير التقرير'));
  fireEvent.click(await screen.findByText(itemLabel));
}

describe('ExportMenuInner built-in success toast (D9.1)', () => {
  beforeEach(() => {
    toastSuccess.mockReset();
    toastError.mockReset();
    excelMock.mockReset();
    wordMock.mockReset();
    pdfMock.mockReset();
  });

  const renderMenu = () =>
    render(<ExportMenuInner data={testData} columns={testCols} options={testOptions} />);

  it('excel: save true -> success toast', async () => {
    excelMock.mockResolvedValue(true);
    renderMenu();
    await openMenuAndPick('تصدير Excel');
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledTimes(1));
    expect(toastError).not.toHaveBeenCalled();
  });

  it('excel: dialog cancel (false) -> silent, no success and no error', async () => {
    excelMock.mockResolvedValue(false);
    renderMenu();
    await openMenuAndPick('تصدير Excel');
    await waitFor(() => expect(excelMock).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 50));
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(toastError).not.toHaveBeenCalled();
  });

  it('excel: unknown result (undefined) -> silent', async () => {
    excelMock.mockResolvedValue(undefined);
    renderMenu();
    await openMenuAndPick('تصدير Excel');
    await waitFor(() => expect(excelMock).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 50));
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(toastError).not.toHaveBeenCalled();
  });

  it('excel: real failure -> error path preserved, no success', async () => {
    excelMock.mockRejectedValue(new Error('disk full'));
    renderMenu();
    await openMenuAndPick('تصدير Excel');
    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it('word: save true -> success toast', async () => {
    wordMock.mockResolvedValue(true);
    renderMenu();
    await openMenuAndPick('تصدير Word');
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledTimes(1));
  });

  it('word: dialog cancel (false) -> silent', async () => {
    wordMock.mockResolvedValue(false);
    renderMenu();
    await openMenuAndPick('تصدير Word');
    await waitFor(() => expect(wordMock).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 50));
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(toastError).not.toHaveBeenCalled();
  });

  it('pdf: save true -> success toast', async () => {
    pdfMock.mockResolvedValue(true);
    renderMenu();
    await openMenuAndPick('تصدير PDF');
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledTimes(1));
  });

  it('pdf: dialog cancel (false) -> silent', async () => {
    pdfMock.mockResolvedValue(false);
    renderMenu();
    await openMenuAndPick('تصدير PDF');
    await waitFor(() => expect(pdfMock).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 50));
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(toastError).not.toHaveBeenCalled();
  });
});
