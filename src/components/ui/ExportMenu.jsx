/**
 * ExportMenu — Lazy-Loading Facade
 *
 * This file replaces the original ExportMenu implementation.
 * It uses React.lazy() to defer loading the heavy export libraries
 * (exceljs, jspdf, html-to-image) until the user actually opens
 * the export dropdown.
 *
 * All 27+ consuming pages import from this path — they need NO changes.
 *
 * The lazy chunk (~1.5MB for jsPDF alone) is fetched on demand:
 *   • Before click: nothing loaded (just this tiny facade ~1KB)
 *   • After click: ExportMenuInner + exportExcel/Word/Pdf chunks load
 */
import React, { Suspense, lazy, useState, useCallback, useImperativeHandle } from 'react';
import { Download, ChevronDown } from 'lucide-react';

const ExportMenuInner = lazy(() => import('./ExportMenuInner'));

/**
 * Minimalistic placeholder shown while the export chunk is loading.
 * Matches the button dimensions so layout doesn't jump.
 */
const ExportLoadingFallback = () => (
  <div className="no-print inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold opacity-70"
    style={{
      background: 'var(--color-bg)',
      color: 'var(--color-text-muted)',
      border: '1px solid var(--color-border)',
    }}
  >
    <div className="w-4 h-4 border-2 rounded-full animate-spin"
      style={{ borderColor: 'var(--color-primary) transparent var(--color-primary) transparent' }}
    />
    <span>جاري التحميل...</span>
  </div>
);

/**
 * Facade component — same API as the original ExportMenu.
 * Renders a minimal placeholder until the user clicks, then shows
 * the full ExportMenuInner loaded via React.lazy().
 *
 * This approach means the ~1.5MB of export libraries are only
 * fetched on demand, not on page load.
 */
const ExportMenu = React.forwardRef(function ExportMenu(props, ref) {
  const [userClicked, setUserClicked] = useState(false);
  // Counter of external print-preview requests (e.g. Ctrl+P in a page hosting
  // a MonthlyHistoryTable). Each request re-opens the print preview modal.
  const [printRequest, setPrintRequest] = useState(0);

  // Imperative API so parents can open the EXACT same PrintPreviewModal that
  // ExportMenu → "طباعة التقرير" opens (same data, same columns, same props).
  useImperativeHandle(ref, () => ({
    openPrintPreview: () => {
      setUserClicked(true);
      setPrintRequest((n) => n + 1);
    },
  }), []);

  // Once the user has shown intent, never go back to the placeholder
  const handleClick = useCallback(() => {
    setUserClicked(true);
  }, []);

  // Only show the lazy-loaded component after the user has clicked
  if (!userClicked) {
    return (
      <div className="no-print" onClick={handleClick}>
        <button
          disabled={props.disabled || (!props.data || props.data.length === 0)}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all duration-300 cursor-pointer"
          style={{
            background: props.disabled ? 'var(--color-bg)' : 'var(--color-bg-card)',
            color: props.disabled ? 'var(--color-border)' : 'var(--color-text)',
            border: '1px solid var(--color-border)',
            boxShadow: 'var(--shadow-premium)',
            opacity: props.disabled || (!props.data || props.data.length === 0) ? 0.5 : 1,
            cursor: props.disabled || (!props.data || props.data.length === 0) ? 'not-allowed' : 'pointer',
          }}
        >
          <Download size={16} />
          <span>تصدير التقرير</span>
          <ChevronDown size={14} />
        </button>
      </div>
    );
  }

  return (
    <Suspense fallback={<ExportLoadingFallback />}>
      <ExportMenuInner {...props} printRequest={printRequest} />
    </Suspense>
  );
});

export default ExportMenu;
