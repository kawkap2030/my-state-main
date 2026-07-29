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

      /* Force no extra margins/padding on html/body that cause blank pages */
      html, body {
        margin: 0 !important;
        padding: 0 !important;
      }

      /* Prevent blank page at start */
      body > *:first-child {
        page-break-before: avoid !important;
        break-before: avoid !important;
      }

      /* Force white bg + black text for all print content */
      html, body, #root, .print-content, .print-content * {
        background: #ffffff !important;
        background-color: #ffffff !important;
        color: #000000 !important;
        border-color: #000000 !important;
      }

      /* Font size on table cells */
      table th, table td {
        font-size: ${fs.size} !important;
        padding: ${fs.padding} !important;
      }

      /* Hide screen-only UI */
      .no-print {
        display: none !important;
        height: 0 !important;
        width: 0 !important;
        visibility: hidden !important;
        opacity: 0 !important;
        position: absolute !important;
        top: -9999px !important;
      }

      /* Show print-only elements */
      .only-print {
        display: block !important;
        visibility: visible !important;
      }
      .print-only-flex {
        display: flex !important;
      }

      /* Table header repetition */
      thead {
        display: table-header-group !important;
      }
      tfoot {
        display: table-footer-group !important;
      }

      /* Prevent row/page break issues */
      tr {
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }

      /* Reset cards and containers */
      .neu-card, .card, [class*="bg-card"] {
        background: #ffffff !important;
        border: 1px solid #cbd5e1 !important;
        box-shadow: none !important;
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }

      /* ── Force signatures 3-column layout in print ── */
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
        /* NOT display:flex — children stack vertically by default (block) */
      }
      .print-footer-signatures > div > p {
        white-space: nowrap !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
      }

      /* ── Fix PrintPreviewModal fixed-position layout in print ── */
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

  /* Page numbering via CSS counter */
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

  /* Hide signatures if disabled */
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
 * Execute print with comprehensive settings.
 * Injects a temporary <style> block before window.print() and cleans up after.
 */
export const executePrint = (settings = {}) => {
  const style = document.createElement('style');
  style.id = 'print-temp-style';
  style.innerHTML = buildPrintCSS(settings);
  document.head.appendChild(style);

  // Small delay to let CSS apply
  setTimeout(() => {
    window.print();

    // Cleanup after print dialog closes
    setTimeout(() => {
      const el = document.getElementById('print-temp-style');
      if (el && document.head.contains(el)) {
        document.head.removeChild(el);
      }
      document.body.removeAttribute('data-print-active');
    }, 2000);
  }, 200);
};

/** Simple print trigger with no custom settings */
export const printReport = () => {
  window.print();
};
