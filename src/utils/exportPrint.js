/**
 * Print Helper Engine
 * Provides utility functions for printing reports with custom settings.
 *
 * Features:
 *   - Orientation (portrait / landscape)
 *   - Font size (small / medium / large)
 *   - Margin presets (narrow / standard / wide)
 *   - Page numbering
 *   - Signature footer
 *   - data-print-* attributes on <html> for CSS targeting
 */

const MARGIN_VALUES = {
  narrow: '5mm 5mm',
  standard: '10mm 8mm',
  wide: '15mm 12mm',
};

/**
 * Generate @page and @media print CSS based on settings.
 */
const buildPrintCSS = (settings = {}) => {
  const orientation = settings.orientation || 'landscape';
  const fontSize = settings.fontSize || 'md';
  const margins = settings.margins || 'standard';
  const showPageNumbers = settings.showPageNumbers !== false;
  const showSignatures = settings.showSignatures !== false;
  const marginValue = MARGIN_VALUES[margins] || MARGIN_VALUES.standard;

  const fontSizeMap = {
    sm: { size: '10px', padding: '4px 6px' },
    md: { size: '12px', padding: '8px 10px' },
    lg: { size: '14px', padding: '10px 14px' },
  };
  const fs = fontSizeMap[fontSize] || fontSizeMap.md;

  let css = `
    @media print {
      @page {
        size: A4 ${orientation} !important;
        margin: ${marginValue} !important;
      }

      html, body {
        margin: 0 !important;
        padding: 0 !important;
      }

      html, body, #root, .print-preview-container, .print-preview-content {
        page-break-before: avoid !important;
        break-before: avoid !important;
        orphans: 3 !important;
        widows: 3 !important;
      }
      body::before, body::after,
      #root::before, #root::after {
        display: none !important;
        content: none !important;
        height: 0 !important;
      }
      body > div:first-child, #root > div:first-child {
        page-break-before: avoid !important;
        break-before: avoid !important;
      }

      html, body, #root, .print-content, .print-content * {
        background: #ffffff !important;
        background-color: #ffffff !important;
        color: #000000 !important;
        border-color: #000000 !important;
      }

      table th, table td {
        font-size: ${fs.size} !important;
        padding: ${fs.padding} !important;
      }

      .no-print {
        display: none !important;
        height: 0 !important;
        width: 0 !important;
        visibility: hidden !important;
        opacity: 0 !important;
        position: absolute !important;
        top: -9999px !important;
      }

      .only-print {
        display: block !important;
        visibility: visible !important;
      }
      .print-only-flex {
        display: flex !important;
      }

      thead { display: table-header-group !important; }
      tfoot { display: table-footer-group !important; }

      tr {
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }

      .neu-card, .card, [class*="bg-card"] {
        background: #ffffff !important;
        border: 1px solid #cbd5e1 !important;
        box-shadow: none !important;
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }

      .print-footer-signatures {
        display: flex !important;
        flex-direction: row !important;
        flex-wrap: nowrap !important;
        justify-content: space-between !important;
        width: 100% !important;
      }
      .print-footer-signatures > div {
        flex: 1 1 0 !important;
        max-width: 33.333% !important;
        min-width: 0 !important;
        box-sizing: border-box !important;
        text-align: center !important;
      }
      .print-footer-signatures > div > p {
        white-space: nowrap !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
      }

      .print-preview-container {
        position: static !important;
        width: 100% !important;
        height: auto !important;
      }
      .print-preview-content {
        transform: none !important;
        position: static !important;
        width: 100% !important;
        height: auto !important;
        box-shadow: none !important;
        border-radius: 0 !important;
        padding: 0 !important;
      }
      .print-preview-toolbar,
      .print-preview-sidebar {
        display: none !important;
      }
    }
  `;

  // NOTE: Modal-print structural rules (body[data-print-from-modal] ...) now
  // live in index.css (always loaded). The dynamic injection here carries only
  // per-settings rules (@page size, page numbers, hide signatures) because
  // injected <style> elements were unreliable in the Tauri WebView2.

  if (showPageNumbers) {
    css += `
      @media print {
        @page {
          @bottom-center {
            content: counter(page) " / " counter(pages);
            font-size: 9px;
            font-weight: 700;
            color: #64748b;
            font-family: "Segoe UI", Tahoma, Arial, sans-serif;
          }
        }
      }
    `;
  }

  if (!showSignatures) {
    css += `
      @media print {
        .print-footer-signatures {
          display: none !important;
        }
      }
    `;
  }

  return css;
};

/**
 * Print the LIVE report page inside a hidden iframe.
 *
 * The report pages render their own print-ready content — statistics grids,
 * full data tables and the PrintableTable signature footer — which the modal's
 * scaled preview paper omits. Cloning just the preview paper is why the report
 * statistics vanished from the printed output (and why a blank first page
 * appeared). Here we clone the live page, strip the modal overlay, and let the
 * embedded print CSS lay everything out. The iframe document carries all
 * styles inline, so output stays reliable in the Tauri WebView2 engine without
 * depending on dynamic style injection or the modal's fixed overlay.
 *
 * @param {Object}   settings            - Print settings (orientation, margins, etc.)
 * @param {Function} [onDone]            - Callback AFTER print dialog closes
 */
const printModalContent = (settings, onDone) => {
  const source = document.getElementById('root');
  if (!source) {
    // Fall back to the legacy live-page path.
    executePrintLegacy(settings, onDone);
    return;
  }

  const clone = source.cloneNode(true);
  // The modal overlay must never print — drop it from the copy.
  clone.querySelectorAll('#print-preview-modal').forEach((el) => el.remove());

  // Pages (e.g. DetailedDrugDispensing) render TWO PrintableTable blocks — a
  // screen variant (print:hidden) and a print variant (hidden print:block).
  // Each block draws its own report header; keep only the LAST one so the
  // report prints a single header.
  const reportHeaders = clone.querySelectorAll('.print-header');
  for (let i = 0; i < reportHeaders.length - 1; i += 1) reportHeaders[i].remove();

  if (settings.showSignatures === false) {
    // Signatures disabled: drop every signature footer from the copy.
    clone.querySelectorAll('.print-footer-unified, .print-footer-signatures').forEach((el) => el.remove());
  } else {
    // Keep only the last signature footer (the print-variant block's own
    // footer) — duplicates would otherwise print the same names twice.
    const footers = clone.querySelectorAll('.print-footer-unified, .print-footer-signatures');
    for (let i = 0; i < footers.length - 1; i += 1) footers[i].remove();
    if (!clone.querySelector('.print-footer-unified, .print-footer-signatures')) {
      // Pages that do not wrap their content in a PrintableTable have no
      // signature footer of their own — carry the modal's rendered footer over
      // so the names always appear on the last printed page.
      const modalFooter = document.querySelector('#print-preview-modal .print-footer-signatures');
      if (modalFooter) clone.appendChild(modalFooter.cloneNode(true));
    }
  }

  // Carry the app's own styles into the print document so Tailwind/global
  // classes used by the report content keep their appearance on paper.
  let inlineStyles = '';
  let stylesheetLinks = '';
  document.querySelectorAll('style').forEach((s) => {
    inlineStyles += `\n${s.innerHTML}`;
  });
  document.querySelectorAll('link[rel="stylesheet"]').forEach((l) => {
    if (l.href) stylesheetLinks += `<link rel="stylesheet" href="${l.href}">\n`;
  });

  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  // Keep the frame off-screen but fully rendered — `visibility: hidden` and
  // 0-size frames have been known to suppress iframe printing in some WebView2
  // builds, and the report tables rely on Tailwind classes to look right.
  frame.style.cssText = 'position:fixed;top:0;left:-9999px;width:1024px;height:768px;border:0;';
  document.body.appendChild(frame);

  const frameDoc = frame.contentDocument;
  frameDoc.open();
  frameDoc.write(
    '<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8">' +
    stylesheetLinks +
    '<style>' +
    'html, body { margin: 0 !important; padding: 0 !important; background: #ffffff !important; }' +
    'body { font-family: "Segoe UI", Tahoma, Arial, sans-serif !important; }' +
    inlineStyles +
    buildPrintCSS(settings) +
    // Signature footers (the page's own PrintableTable footer, or the modal
    // footer carried over above) must stay together and fully visible.
    '@media print {' +
    '.print-footer-unified, .print-footer-signatures { display: flex !important; flex-direction: row !important; flex-wrap: nowrap !important; justify-content: space-between !important; width: 100% !important; visibility: visible !important; opacity: 1 !important; page-break-inside: avoid !important; break-inside: avoid !important; }' +
    '.print-footer-unified > div, .print-footer-signatures > div { flex: 1 1 0 !important; max-width: 33.333% !important; min-width: 0 !important; box-sizing: border-box !important; text-align: center !important; }' +
    '}' +
    '</style></head><body>' + clone.outerHTML + '</body></html>'
  );
  frameDoc.close();

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    setTimeout(() => frame.remove(), 200);
  };
  // Remove the frame only after the print dialog fully closes — WebView2's
  // print() can return before rendering, so a premature removal would blank it.
  frame.contentWindow.addEventListener('afterprint', cleanup);
  // Safety net in case afterprint never fires.
  setTimeout(cleanup, 10000);

  let triggered = false;
  const triggerPrint = () => {
    if (triggered) return;
    triggered = true;
    try {
      frame.contentWindow.focus();
      frame.contentWindow.print();
    } catch (err) {
      console.warn('[exportPrint] iframe print failed, falling back:', err);
      cleanup();
      executePrintLegacy(settings, onDone);
      return;
    }
    if (typeof onDone === 'function') {
      try { onDone(); } catch (_) {}
    }
  };

  // Give the iframe document time to parse, apply the copied stylesheets and
  // shape Arabic text; onload is more reliable than a blind timeout, with the
  // timeout only as a backstop (2s so external <link> CSS has time to apply).
  frame.onload = triggerPrint;
  setTimeout(triggerPrint, 2000);
};

/**
 * Legacy print path — injects a temporary <style> into the live page and calls
 * window.print() on it. Used for direct page printing (Ctrl+P shortcuts and
 * pages that do not print through the preview modal).
 */
const executePrintLegacy = (settings = {}, onDone) => {
  const style = document.createElement('style');
  style.id = 'print-temp-style';
  style.innerHTML = buildPrintCSS(settings);
  document.head.appendChild(style);

  const fromModal = settings.fromModal === true;
  if (fromModal) {
    document.body.setAttribute('data-print-from-modal', 'true');
  }

  setTimeout(() => {
    window.print();

    if (typeof onDone === 'function') {
      try { onDone(); } catch (_) {}
    }

    const el = document.getElementById('print-temp-style');
    if (el && document.head.contains(el)) {
      document.head.removeChild(el);
    }
    document.body.removeAttribute('data-print-active');
    document.body.removeAttribute('data-print-from-modal');
  }, 200);
};

/**
 * Execute print with comprehensive settings.
 *
 * Printing through the preview modal renders a clean standalone copy of the
 * content in a hidden iframe (reliable in WebView2). Direct page printing uses
 * the legacy live-page path.
 *
 * @param {Object}   settings            - Print settings (orientation, margins, etc.)
 * @param {Function} [onDone]            - Callback AFTER print dialog closes
 */
export const executePrint = (settings = {}, onDone) => {
  if (settings.fromModal === true) {
    printModalContent(settings, onDone);
    return;
  }
  executePrintLegacy(settings, onDone);
};

/** Simple print trigger with no custom settings */
export const printReport = () => {
  window.print();
};
