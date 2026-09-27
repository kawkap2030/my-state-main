import { useMemo } from 'react';
import useKeyboardShortcuts from './useKeyboardShortcuts';

/**
 * useReportPrintShortcut — unified Ctrl+P → PrintPreviewModal for reports.
 *
 * A thin, reusable wrapper over the existing useKeyboardShortcuts hook that
 * wires Ctrl+P to the SAME imperative openPrintPreview() API exposed by the
 * toolbar ExportMenu (forwardRef). No new print path is created here: the
 * preview/printing pipeline stays entirely inside
 * ExportMenu → ExportMenuInner → PrintPreviewModal, so ExportMenu Print and
 * Ctrl+P are structurally identical (same data, same columns, same options,
 * same fromModal executePrint).
 *
 * Requirements covered:
 *   - Native WebView2 print is prevented (useKeyboardShortcuts calls
 *     preventDefault + stopPropagation on match).
 *   - No double print, no listener accumulation (useKeyboardShortcuts
 *     attaches one keydown listener and removes it on unmount).
 *   - No direct window.print()/executePrint() call from here.
 *   - Empty-data guard kept inside ExportMenuInner.handlePrintClick — exactly
 *     the same behavior as clicking "طباعة التقرير".
 *
 * @param {React.MutableRefObject} exportMenuRef - ref attached to <ExportMenu>
 * @param {boolean} enabled - whether the shortcut is active (default: true)
 */
const useReportPrintShortcut = (exportMenuRef, enabled = true) => {
  const shortcuts = useMemo(() => [
    {
      key: 'p',
      ctrl: true,
      handler: () => exportMenuRef.current?.openPrintPreview(),
      description: 'معاينة الطباعة',
    },
  ], [exportMenuRef]);

  useKeyboardShortcuts(shortcuts, enabled);
};

export default useReportPrintShortcut;