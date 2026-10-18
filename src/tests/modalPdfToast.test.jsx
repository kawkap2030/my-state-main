import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Controllable PDF engine outcome only; the REAL PrintPreviewModal is rendered.
const { toastSuccess, toastError, pdfMock } = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  pdfMock: vi.fn(),
}));

vi.mock('../utils/exportPdf', () => ({ exportToPDF: (...a) => pdfMock(...a) }));
vi.mock('../components/ui/Toast', () => ({
  useToast: () => ({
    success: (...a) => toastSuccess(...a),
    error: (...a) => toastError(...a),
    warning: vi.fn(),
    info: vi.fn(),
  }),
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

import PrintPreviewModal from '../components/common/PrintPreviewModal';

describe('PrintPreviewModal PDF button (D9.1)', () => {
  beforeEach(() => {
    toastSuccess.mockReset();
    toastError.mockReset();
    pdfMock.mockReset();
  });

  const renderModal = () =>
    render(
      <PrintPreviewModal
        isOpen
        onClose={() => {}}
        title="T"
        exportData={[{ a: 'x' }]}
        exportColumns={[{ header: 'H', accessor: 'a' }]}
      />
    );

  it('save true -> success toast', async () => {
    pdfMock.mockResolvedValue(true);
    renderModal();
    fireEvent.click(screen.getByTitle('تنزيل PDF'));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledTimes(1));
    expect(toastError).not.toHaveBeenCalled();
  });

  it('dialog cancel (false) -> silent, no success and no error', async () => {
    pdfMock.mockResolvedValue(false);
    renderModal();
    fireEvent.click(screen.getByTitle('تنزيل PDF'));
    await waitFor(() => expect(pdfMock).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 50));
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(toastError).not.toHaveBeenCalled();
  });

  it('unknown result (undefined) -> silent', async () => {
    pdfMock.mockResolvedValue(undefined);
    renderModal();
    fireEvent.click(screen.getByTitle('تنزيل PDF'));
    await waitFor(() => expect(pdfMock).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 50));
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(toastError).not.toHaveBeenCalled();
  });

  it('real failure -> error toast preserved, no success', async () => {
    pdfMock.mockRejectedValue(new Error('pdf engine failed'));
    renderModal();
    fireEvent.click(screen.getByTitle('تنزيل PDF'));
    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    expect(toastSuccess).not.toHaveBeenCalled();
  });
});
