import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

// Backend + contexts fully stubbed; the REAL TemporalAnalysisHub and the
// REAL AutoComplete are rendered. No real network, no real DB.
vi.mock('../api/tauriApi', () => ({ default: vi.fn() }));
vi.mock('../components/ui/Toast', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }),
}));
vi.mock('../context/useGlobalApp', () => ({
  useGlobalApp: () => ({
    workspaceMode: 'branches',
    setWorkspaceMode: vi.fn(),
    lockedLevel: null,
    setLockedLevel: vi.fn(),
    setHierarchyNames: vi.fn(),
    hierarchyNames: {},
    activeHierarchy: { branchId: '', areaId: '', clinicId: '', dispenseMonth: '' },
    updateActiveHierarchy: vi.fn(),
    isIsolationExceptionActive: false,
  }),
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
vi.mock('../components/common/ExportMenuInner', () => ({ default: () => null }));
vi.mock('../components/common/PrintPreviewModal', () => ({ default: () => null }));
vi.mock('../components/common/MonthInput', () => ({
  default: ({ value, onChange, label }) => (
    <div>
      <span>{label}</span>
      <input aria-label={label} value={value || ''} onChange={(e) => onChange && onChange(e)} />
    </div>
  ),
}));
vi.mock('html2canvas', () => ({ default: vi.fn(async () => ({ toDataURL: () => '' })) }));

import TemporalAnalysisHub from '../modules/reports/temporal/TemporalAnalysisHub';
import invoke from '../api/tauriApi';

// jsdom lacks scrollIntoView (used by AutoComplete highlight effect).
if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}
// jsdom lacks ResizeObserver (used by the hub's top scroll-sync bar).
if (typeof ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

const DRUGS = [{ id: 1, name: 'صنف أ', category_id: 1 }];
const CATS = [{ id: 1, name: 'فئة أ' }];
const MONTH = '2026-09';

function mockBackend() {
  invoke.mockImplementation(async (cmd) => {
    switch (cmd) {
      case 'get_drugs': return DRUGS;
      case 'get_drug_categories': return CATS;
      case 'get_branches': return [{ id: 1, name: 'فرع أ' }];
      case 'get_detailed_drug_dispensed_range':
        return [{ drug_id: 1, quantity: 10, cases_count: 5, total_cost: 100, unit_price: 10, dispense_month: MONTH }];
      case 'get_insulin_dispensed_range':
        return [{ name: 'أنسولين أ', price: 50, category: 'مجاني', type_: 'x', quantity: 4, cases_count: 2, cost: 200 }];
      default: return [];
    }
  });
}

// The report-type AutoComplete shows the selected label when closed.
const reportBox = () => screen.getByDisplayValue('الأدوية التفصيلية');
const openReportList = () => {
  const box = reportBox();
  fireEvent.focus(box);
  fireEvent.click(box);
  fireEvent.change(box, { target: { value: '' } });
};
const pickReportOption = async (label) => {
  fireEvent.click(await screen.findByText(label, {}, { timeout: 5000 }));
};
const reportClearButton = (visibleLabel) => {
  const root = screen.getByDisplayValue(visibleLabel).closest('div.relative');
  return within(root).queryByTitle('مسح التحديد');
};

describe('TemporalAnalysisHub report-type clear (مسح)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBackend();
  });

  it('clear empties the visible box (no stale name), keeps it re-selectable', async () => {
    render(
      <MemoryRouter>
        <TemporalAnalysisHub />
      </MemoryRouter>
    );

    // Default report selected initially.
    expect(reportBox()).toBeInTheDocument();

    // Pick another report, then press مسح inside the SAME box (only X here).
    fireEvent.focus(reportBox());
    fireEvent.click(reportBox());
    fireEvent.change(reportBox(), { target: { value: '' } });
    await pickReportOption('صرف الإنسولين');
    expect(screen.getByDisplayValue('صرف الإنسولين')).toBeInTheDocument();

    fireEvent.click(screen.getByTitle('مسح التحديد'));

    // The name must disappear immediately and the box must stay usable:
    // no manual text deletion needed to open the list again.
    await waitFor(() => expect(screen.queryByDisplayValue('صرف الإنسولين')).toBeNull());
    const clearedBox = screen.getByPlaceholderText('اختر نوع التقرير الإحصائي...');
    expect(clearedBox.value).toBe('');
    expect(screen.queryByTitle('مسح التحديد')).toBeNull();
    fireEvent.click(clearedBox);
    await pickReportOption('صرف الإنسولين');
    expect(screen.getByDisplayValue('صرف الإنسولين')).toBeInTheDocument();
  }, 120000);

  it('clear after generating resets display and data, preserves month/hierarchy', async () => {
    render(
      <MemoryRouter>
        <TemporalAnalysisHub />
      </MemoryRouter>
    );

    // Pick a branch so generation is allowed.
    const branchBox = await screen.findByPlaceholderText('ابحث عن فرع...');
    fireEvent.focus(branchBox);
    fireEvent.click(branchBox);
    fireEvent.click(await screen.findByText('فرع أ', {}, { timeout: 5000 }));
    await waitFor(() => expect(screen.getByDisplayValue('فرع أ')).toBeInTheDocument());

    const monthValues = () =>
      Array.from(document.querySelectorAll('input[type="month"]')).map((i) => i.value);
    expect(monthValues().length).toBe(2);
    const monthsBefore = monthValues();

    // Generate the default (drugs) report.
    fireEvent.click(screen.getByText('توليد التحليل الزمني'));
    expect((await screen.findAllByText('صنف أ', {}, { timeout: 10000 })).length).toBeGreaterThan(0);

    // Switch to insulin and generate: old rows must vanish.
    openReportList();
    await pickReportOption('صرف الإنسولين');
    fireEvent.click(screen.getByText('توليد التحليل الزمني'));
    expect((await screen.findAllByText('أنسولين أ', {}, { timeout: 10000 })).length).toBeGreaterThan(0);
    expect(screen.queryByText('صنف أ')).not.toBeInTheDocument();

    // Press مسح: display empties, stale rows vanish, month + branch preserved.
    fireEvent.click(reportClearButton('صرف الإنسولين'));
    expect(screen.queryByDisplayValue('صرف الإنسولين')).toBeNull();
    expect(screen.queryByText('أنسولين أ')).toBeNull();
    expect(screen.queryByText('صنف أ')).not.toBeInTheDocument();
    expect(monthValues()).toEqual(monthsBefore);
    expect(screen.getByDisplayValue('فرع أ')).toBeInTheDocument();

    // Re-open the list WITHOUT typing anything and pick again: no manual
    // text deletion may be required.
    fireEvent.click(screen.getByPlaceholderText('اختر نوع التقرير الإحصائي...'));
    await pickReportOption('صرف الإنسولين');
    fireEvent.click(screen.getByText('توليد التحليل الزمني'));
    expect((await screen.findAllByText('أنسولين أ', {}, { timeout: 10000 })).length).toBeGreaterThan(0);

    // Repeat the clear: stale value must not return, box stays usable.
    fireEvent.click(reportClearButton('صرف الإنسولين'));
    expect(screen.queryByDisplayValue('صرف الإنسولين')).toBeNull();
    expect(screen.queryByText('أنسولين أ')).toBeNull();
    expect(monthValues()).toEqual(monthsBefore);
    fireEvent.click(screen.getByPlaceholderText('اختر نوع التقرير الإحصائي...'));
    await pickReportOption('صرف الإنسولين');
    expect(screen.getByDisplayValue('صرف الإنسولين')).toBeInTheDocument();
  }, 180000);
});
