import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock ONLY the save dialog: true = saved, false = cancelled, undefined =
// unknown, throw = real failure. Everything else stays real, so the D1
// assertions below run through the actual exportToWord document builder.
const { saveMock } = vi.hoisted(() => ({ saveMock: vi.fn() }));

vi.mock('../utils/exportHelpers', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, saveFileWithDialog: (...args) => saveMock(...args) };
});

import { exportToWord } from '../utils/exportWord';
import { exportMultiSheetExcel } from '../utils/exportExcel';

const cols = [{ header: 'H', accessor: 'x' }];

describe('export save-result contract (D9.1)', () => {
  beforeEach(() => {
    saveMock.mockReset();
  });

  it('exportToWord propagates save success (true)', async () => {
    saveMock.mockResolvedValue(true);
    await expect(exportToWord([{ x: 'a' }], cols, { title: 'T' })).resolves.toBe(true);
  });

  it('exportToWord propagates dialog cancel (false)', async () => {
    saveMock.mockResolvedValue(false);
    await expect(exportToWord([{ x: 'a' }], cols, { title: 'T' })).resolves.toBe(false);
  });

  it('exportToWord propagates unknown result (undefined)', async () => {
    saveMock.mockResolvedValue(undefined);
    await expect(exportToWord([{ x: 'a' }], cols, { title: 'T' })).resolves.toBe(undefined);
  });

  it('exportToWord still throws on real save failure', async () => {
    saveMock.mockRejectedValue(new Error('disk full'));
    await expect(exportToWord([{ x: 'a' }], cols, { title: 'T' })).rejects.toThrow();
  });

  it('exportMultiSheetExcel propagates save success (true)', async () => {
    saveMock.mockResolvedValue(true);
    const sheets = { S: { data: [{ x: 'a' }], columns: cols, options: {} } };
    await expect(exportMultiSheetExcel(sheets, { fileName: 'f', title: 'T' })).resolves.toBe(true);
  });

  it('exportMultiSheetExcel propagates dialog cancel (false)', async () => {
    saveMock.mockResolvedValue(false);
    const sheets = { S: { data: [{ x: 'a' }], columns: cols, options: {} } };
    await expect(exportMultiSheetExcel(sheets, { fileName: 'f', title: 'T' })).resolves.toBe(false);
  });

  it('exportMultiSheetExcel still throws on real save failure', async () => {
    saveMock.mockRejectedValue(new Error('disk full'));
    const sheets = { S: { data: [{ x: 'a' }], columns: cols, options: {} } };
    await expect(exportMultiSheetExcel(sheets, { fileName: 'f', title: 'T' })).rejects.toThrow();
  });
});

describe('Word tables guard — D1 no-regression', () => {
  let captured;

  beforeEach(() => {
    captured = [];
    saveMock.mockReset();
    saveMock.mockImplementation(async (blob) => {
      captured.push(blob);
      return true;
    });
  });

  const htmlOf = async () => {
    expect(captured).toHaveLength(1);
    return captured[0].text();
  };
  const countTables = (html) => (html.match(/<table class="data-table">/g) || []).length;

  it('tables: [] falls back to the single table (never a blank body)', async () => {
    await exportToWord([{ x: 'fallback-row' }], cols, { title: 'T', tables: [] });
    const html = await htmlOf();
    expect(countTables(html)).toBe(1);
    expect(html).toContain('fallback-row');
  });

  it('tables: [T1, T2] renders both tables without loss or duplication', async () => {
    const T1 = { data: [{ x: 'one' }], columns: cols, title: 'T1 Title' };
    const T2 = { data: [{ x: 'two' }], columns: cols, title: 'T2 Title' };
    await exportToWord([], cols, { title: 'T', tables: [T1, T2] });
    const html = await htmlOf();
    expect(countTables(html)).toBe(2);
    expect(html).toContain('T1 Title');
    expect(html).toContain('T2 Title');
    expect(html.split('<td>one</td>').length - 1).toBe(1);
    expect(html.split('<td>two</td>').length - 1).toBe(1);
  });

  it('ordinary path without tables still renders the single table', async () => {
    await exportToWord([{ x: 'solo' }], cols, { title: 'T' });
    const html = await htmlOf();
    expect(countTables(html)).toBe(1);
    expect(html).toContain('solo');
  });
});
