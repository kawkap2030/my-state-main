/**
 * Advanced PDF Export Engine (.pdf)
 *
 * Uses jsPDF + jspdf-autotable for native multi-page PDF generation with:
 *   - Multi-page tables with automatic page breaks
 *   - Arabic text support via embedded Amiri font
 *   - Header with logo, title, and org name on every page
 *   - Footer with page numbers on every page
 *   - Signature section on the last page
 *   - Chart image embedding
 *   - Custom orientation, margins, and font sizes
 *   - Backward-compatible with existing exportToPDF() API
 */
import { saveFileWithDialog, buildDataMatrix, timestamp, LOGO_BASE64, DESIGNER_BASE64 } from './exportHelpers';
import invoke from '../api/tauriApi';

/**
 * Load jsPDF library dynamically with robust fallback.
 * Tries multiple import patterns for compatibility with jsPDF v2/v3/v4.
 */
const getJsPDF = async () => {
  let mod;
  let autoTableModule;
  try {
    mod = await import('jspdf');
    autoTableModule = await import('jspdf-autotable');
  } catch (e) {
    throw new Error(`تعذر تحميل مكتبة PDF: ${e.message || 'فشل الاتصال بالخادم'}`);
  }
  const JsPDF = mod.jsPDF || mod.default;
  if (!JsPDF) {
    throw new Error('لم يتم العثور على مكتبة jsPDF - قد يكون هناك تعارض في الإصدار');
  }
  
  // Explicitly register autoTable on the jsPDF constructor.
  // jspdf-autotable v5 tries to find window.jsPDF to auto-register,
  // but in ES module environments (Vite dynamic import) window.jsPDF
  // is undefined, so we must register manually.
  try {
    if (autoTableModule && typeof autoTableModule.applyPlugin === 'function') {
      autoTableModule.applyPlugin(JsPDF);
    }
  } catch (pluginErr) {
    console.warn('[PDF] autoTable plugin registration failed:', pluginErr);
  }
  
  return JsPDF;
};

// ─── Font Registration ───────────────────────────────────────────────
// Amiri is an open-source Arabic font that handles Arabic script properly.
// We embed the font as base64 to avoid runtime fetch() issues in Tauri WebView.
// Only Amiri-Regular.ttf is available (no bold variant), so 'normal' weight only.
let amiriAvailable = false;

const registerAmiriFont = async (doc) => {
  try {
    const { AMIRI_FONT_BASE64 } = await import('../assets/amiriFontBase64');
    doc.addFileToVFS('Amiri-Regular.ttf', AMIRI_FONT_BASE64);
    
    // jsPDF v4 addFont signature:
    //   addFont(postScriptName, fontName, fontStyle, fontWeight, encoding)
    // Try with explicit fontWeight and Identity-H encoding for Arabic Unicode support
    try {
      doc.addFont('Amiri-Regular.ttf', 'Amiri', 'normal', 400, 'Identity-H');
    } catch (_) {
      // Fallback: try without fontWeight/encoding (older jsPDF versions)
      try { doc.addFont('Amiri-Regular.ttf', 'Amiri', 'normal'); } catch (_) {}
    }
    
    // Verify the font can ACTUALLY be used by calling setFont and then
    // checking the active font via doc.getFont().  jsPDF v4's setFont()
    // does NOT throw on failure — it console.warns and falls back to
    // 'times'.  A try/catch around setFont would never catch the failure,
    // so we must inspect the internal font state instead.
    const fontList = doc.getFontList();
    if (fontList && fontList['Amiri']) {
      // setFont never throws in jsPDF v4; we check the active font after
      doc.setFont('Amiri', 'normal');
      const activeFont = typeof doc.getFont === 'function' ? doc.getFont() : null;
      const activeFontName = activeFont && activeFont.fontName ? activeFont.fontName.toLowerCase() : '';
      if (activeFontName === 'amiri') {
        amiriAvailable = true;
        console.log('[PDF] Amiri font verified via getFont(): active font is Amiri');
      } else {
        console.warn('[PDF] Amiri found in getFontList but getFont() reports "' +
          activeFontName + '"; falling back to Helvetica');
        amiriAvailable = false;
      }
    } else {
      console.warn('[PDF] Amiri font not found in fontList after registration. Available fonts:',
        Object.keys(fontList || {}).join(', '));
      amiriAvailable = false;
    }
    return amiriAvailable;
  } catch (err) {
    console.warn('[PDF] Failed to register Amiri font, falling back to Helvetica:', err);
    amiriAvailable = false;
    return false;
  }
};

// ─── Helper: Draw Page Header ────────────────────────────────────────
const drawHeader = (doc, title, subtitle, hierarchyLabel, monthLabel, pageWidth, marginLeft) => {
  const headerY = 10;

  // Top accent line
  doc.setDrawColor(8, 145, 178);
  doc.setLineWidth(1.5);
  doc.line(marginLeft, headerY, pageWidth - marginLeft, headerY);

  // Logo (left side in RTL = right side visually)
  try {
    doc.addImage(LOGO_BASE64, 'PNG', pageWidth - marginLeft - 14, headerY + 2, 12, 12);
  } catch (e) {
    // Logo failed to load, skip
  }

  // Title & subtitle — only 'normal' weight (Amiri-Regular has no bold variant)
  doc.setFont(amiriAvailable ? 'Amiri' : 'helvetica', 'normal');
  doc.setFontSize(14);
  doc.setTextColor(8, 145, 178);
  doc.text(title, pageWidth - marginLeft - 28, headerY + 7, { align: 'right' });

  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  if (subtitle) {
    doc.text(subtitle, pageWidth - marginLeft - 28, headerY + 13, { align: 'right' });
  }
  const metaLine = [
    hierarchyLabel ? `النطاق: ${hierarchyLabel}` : '',
    monthLabel ? `شهر البيانات: ${monthLabel}` : '',
  ].filter(Boolean).join(' | ');
  if (metaLine) {
    doc.text(metaLine, pageWidth - marginLeft - 28, headerY + (subtitle ? 18 : 14), { align: 'right' });
  }

  // Bottom accent line
  doc.setDrawColor(8, 145, 178);
  doc.setLineWidth(0.3);
  doc.line(marginLeft, headerY + 19, pageWidth - marginLeft, headerY + 19);

  return headerY + 22; // Y position to start content below header
};

// ─── Helper: Draw Page Footer (single source of truth) ────────────────
const drawFooter = (doc, pageNum, totalPages, pageWidth, marginLeft, pageHeight, footerText) => {
  const footerY = pageHeight - 8;

  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.3);
  doc.line(marginLeft, footerY - 3, pageWidth - marginLeft, footerY - 3);

  doc.setFont(amiriAvailable ? 'Amiri' : 'helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184);

  // Page number (center)
  doc.text(`صفحة ${pageNum} من ${totalPages}`, pageWidth / 2, footerY, { align: 'center' });

  // Footer text (left side in RTL = right visually)
  if (footerText) {
    doc.text(footerText, marginLeft, footerY, { align: 'left' });
  }

  // Date (right side in RTL = left visually)
  const dateStr = new Date().toLocaleDateString('ar-SA', {
    year: 'numeric', month: 'short', day: 'numeric'
  });
  doc.text(dateStr, pageWidth - marginLeft, footerY, { align: 'right' });
};

// ─── Helper: Draw Signatures (unified with stamp) ─────────────────────
const drawSignatures = (doc, pageWidth, marginLeft, startY, sigData = {}) => {
  const {
    preparerName = '',
    managerName = '',
    approvalNumber = '',
  } = sigData;

  const y = startY + 5;
  const colWidth = (pageWidth - marginLeft * 2) / 3;
  const dateStr = new Date().toLocaleDateString('ar-SA', {
    year: 'numeric', month: 'long', day: 'numeric'
  });

  // Only 'normal' weight (Amiri-Regular has no bold variant)
  doc.setFont(amiriAvailable ? 'Amiri' : 'helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);

  const c1x = marginLeft + colWidth * 0 + colWidth / 2;
  const c2x = marginLeft + colWidth * 1 + colWidth / 2;
  const c3x = marginLeft + colWidth * 2 + colWidth / 2;

  // ── ROW 1: TITLES (always stay, never replaced) ────────────────────
  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(0.5);
  doc.line(c1x - 15, y, c1x + 15, y);
  doc.line(c2x - 15, y, c2x + 15, y);
  doc.line(c3x - 15, y, c3x + 15, y);
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text('مُعد التقرير', c1x, y - 2, { align: 'center' });
  doc.text('مدير الصيدلية / الإدارة', c2x, y - 2, { align: 'center' });
  doc.text('رقم الاعتماد', c3x, y - 2, { align: 'center' });

  // ── ROW 2: REAL NAMES (replace dots, not titles) ───────────────────
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);
  doc.text(`الاسم: ${preparerName || '...........................'}`, c1x, y + 7, { align: 'center' });
  doc.text(`الاسم: ${managerName || '...........................'}`, c2x, y + 7, { align: 'center' });
  doc.text(`رقم: ${approvalNumber || '...........................'}`, c3x, y + 7, { align: 'center' });

  // ── ROW 3: SIGNATURE LINES ────────────────────────────────────────
  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184);
  doc.text('التوقيع: .........................', c1x, y + 14, { align: 'center' });
  doc.text('التوقيع: .........................', c2x, y + 14, { align: 'center' });
  doc.text(`التاريخ: ${dateStr}`, c3x, y + 14, { align: 'center' });

  // ── ROW 4: STAMP LINE (full width) ────────────────────────────────
  const stampY = y + 23;
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.3);
  doc.line(marginLeft + 10, stampY, pageWidth - marginLeft - 10, stampY);
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text(`ختم الإدارة: ........................................................`, pageWidth / 2, stampY + 5, { align: 'center' });

  // ── Designer credit at the bottom ─────────────────────────────────
  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184);
  const creditY = stampY + 18;
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  doc.line(marginLeft, creditY - 2, pageWidth - marginLeft, creditY - 2);
  doc.text(`جميع الحقوق محفوظة © ${new Date().getFullYear()} | منظومة إحصائيات الأدوية والمستلزمات الطبية`, pageWidth / 2, creditY + 5, { align: 'center' });
  doc.text('تصميم وإعداد وتطوير: ك/ أحمد علي أحمد كوكب', pageWidth / 2, creditY + 11, { align: 'center' });
};

// ─── Helper: Draw Chart Image ────────────────────────────────────────
const drawChart = (doc, chartImage, pageWidth, marginLeft, startY) => {
  if (!chartImage) return startY;
  try {
    const imgWidth = pageWidth - marginLeft * 2;
    const imgHeight = imgWidth * 0.35; // 2.85:1 aspect ratio
    doc.addImage(chartImage, 'PNG', marginLeft, startY, imgWidth, imgHeight, undefined, 'FAST');
    return startY + imgHeight + 5;
  } catch (e) {
    console.warn('Failed to embed chart image:', e);
    return startY;
  }
};

// ─── Helper: Apply footers to all pages (called once with final count) ──
const applyAllFooters = (doc, totalPages, pageWidth, marginLeft, pageHeight, footerText, showPageNumbers) => {
  if (!showPageNumbers) return;
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    drawFooter(doc, i, totalPages, pageWidth, marginLeft, pageHeight, footerText);
  }
};

// ─── MAIN EXPORT FUNCTION ────────────────────────────────────────────
export const exportToPDF = async (data, columns, options = {}) => {
  const {
    title = 'تقرير',
    subtitle = '',
    hierarchyLabel = '',
    monthLabel = '',
    fileName = 'report',
    orientation = 'landscape',
    marginPreset = 'standard',
    fontSize: fontSizeOption = 'md',
    showPageNumbers = true,
    showSignatures = true,
    chartImage = null,
    footerText = '',
    onProgress = null,
     signatures = {}, // { preparerName, managerName, approvalNumber }
     tables = null,
     writeToPath = null, // when set: write PDF silently to this path (no save dialog)
   } = options;

  // ── Build data matrix ──────────────────────────────────────────────
  const { headers, rows } = buildDataMatrix(data, columns);

  // ── Margins based on preset ────────────────────────────────────────
  const MARGIN_MAP = {
    narrow:  { top: 8, bottom: 15, left: 6, right: 6 },
    standard: { top: 12, bottom: 18, left: 8, right: 8 },
    wide:    { top: 16, bottom: 22, left: 12, right: 12 },
  };
  const margins = MARGIN_MAP[marginPreset] || MARGIN_MAP.standard;

  // ── Font size mapping ──────────────────────────────────────────────
  const FONT_SIZE_MAP = {
    sm: { body: 7, header: 8, title: 12 },
    md: { body: 8, header: 9, title: 14 },
    lg: { body: 10, header: 11, title: 16 },
  };
  const fontSizes = FONT_SIZE_MAP[fontSizeOption] || FONT_SIZE_MAP.md;

  // ── Create jsPDF instance ──────────────────────────────────────────
  const jsPDF = await getJsPDF();
  const doc = new jsPDF({ orientation, unit: 'mm', format: 'a4' });
  await registerAmiriFont(doc);

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // ── Draw header on first page & get content start Y ────────────────
  const contentStartY = drawHeader(doc, title, subtitle, hierarchyLabel, monthLabel, pageWidth, margins.left);    // ── Build table configs (single or multi-table) ────────────────────
  // When `tables` is provided, each entry is { data, columns, title }.
  // Otherwise we fall back to the single data/columns pair (backward compat).
  const tableConfigs = tables && tables.length > 0
    ? tables.map((t) => {
        const { headers: h, rows: r } = buildDataMatrix(t.data, t.columns);
        return { headers: h, rows: r, title: t.title || null };
      })
    : [{ headers, rows, title: null }];

  // ── Shared autoTable style objects ───────────────────────────────────
  const tableStyles = {
    font: amiriAvailable ? 'Amiri' : 'helvetica',
    lineColor: [203, 213, 225],
    lineWidth: 0.2,
    halign: 'center',
    valign: 'middle',
    fontSize: fontSizes.body,
    cellPadding: 2.5,
  };
  const headStyles = {
    fillColor: [8, 145, 178],
    textColor: [255, 255, 255],
    fontStyle: 'normal',
    halign: 'center',
    fontSize: fontSizes.header,
    cellPadding: 3,
  };
  const altRowStyles = { fillColor: [248, 250, 252] };

  // ── Generate tables sequentially ─────────────────────────────────────
  // Each table starts after the previous one. autoTable handles page
  // breaks automatically; didDrawPage re-draws the header on every page.
  //
  // CRITICAL: margin.top MUST equal contentStartY for ALL tables so that
  // on subsequent pages (where autoTable uses margin.top as the Y start)
  // the content does NOT overlap with the header drawn by didDrawPage.
  // header ends at ~32mm (contentStartY = headerY+22).
  let currentY = contentStartY;
  const consistentTopMargin = contentStartY; // matches header bottom
  tableConfigs.forEach((config, idx) => {
    const columnDefs = config.headers.map((h) => ({ header: h, dataKey: h }));
    const tableBody = config.rows.map((row) => {
      if (row.isGroupHeader) {
        return {
          isGroupHeader: true,
          content: row.groupName || 'التصنيف',
          colSpan: config.headers.length,
          styles: {
            fillColor: [226, 232, 240],
            textColor: [15, 23, 42],
            fontStyle: 'normal',
            halign: 'right',
            fontSize: fontSizes.body,
            cellPadding: 3,
          },
        };
      }
      const rowData = {};
      config.headers.forEach((h, i) => {
        rowData[h] = row[i] || '';
      });
      return rowData;
    });

    // If there's a title for this table, render it as a text line above
    if (config.title) {
      doc.setFont(amiriAvailable ? 'Amiri' : 'helvetica', 'normal');
      doc.setFontSize(fontSizes.header);
      doc.setTextColor(8, 145, 178);
      doc.text(config.title, pageWidth - margins.left, currentY, { align: 'right' });
      currentY += 8;
    }

    doc.autoTable({
      columns: columnDefs,
      body: tableBody,
      startY: idx === 0 ? contentStartY : currentY,
      margin: {
        top: consistentTopMargin, // Same for ALL tables — avoids header overlap on new pages
        bottom: margins.bottom + 10,
        left: margins.left,
        right: margins.right,
      },
      tableWidth: 'auto',
      styles: tableStyles,
      headStyles: headStyles,
      alternateRowStyles: altRowStyles,
      didDrawPage: () => {
        drawHeader(doc, title, subtitle, hierarchyLabel, monthLabel, pageWidth, margins.left);
      },
      didParseCell: (data) => {
        if (data.row?.raw?.isGroupHeader) {
          data.cell.styles.fillColor = [226, 232, 240];
          data.cell.styles.fontStyle = 'normal';
          data.cell.styles.halign = 'right';
          data.cell.colSpan = config.headers.length;
        }
      },
    });

    currentY = (doc.lastAutoTable?.finalY || currentY) + 10;
  });

  // ── Calculate chart dimensions if present ────────────────────────────
  const chartImgWidth = pageWidth - margins.left * 2;
  const chartImgHeight = chartImgWidth * 0.35; // 2.85:1 aspect ratio

  // ── Add chart image on its own page or after the table ────────────────
  if (chartImage) {
    const lastTableEndY = doc.lastAutoTable?.finalY || contentStartY + 20;
    const spaceAfterTable = pageHeight - margins.bottom - lastTableEndY;
    const neededSpace = chartImgHeight + 30; // chart + padding + signatures estimate

    if (spaceAfterTable < neededSpace) {
      // Not enough room — add a new page for chart + signatures
      doc.addPage();
      drawHeader(doc, title, subtitle, hierarchyLabel, monthLabel, pageWidth, margins.left);
      const newPageY = consistentTopMargin + 5;
      drawChart(doc, chartImage, pageWidth, margins.left, newPageY);
      if (showSignatures) {
        const sigY = newPageY + chartImgHeight + 10;
        if (sigY + 40 < pageHeight - margins.bottom) {
          drawSignatures(doc, pageWidth, margins.left, sigY, signatures);
        } else {
          // Still not enough room after chart — add yet another page for sigs
          doc.addPage();
          drawHeader(doc, title, subtitle, hierarchyLabel, monthLabel, pageWidth, margins.left);
          drawSignatures(doc, pageWidth, margins.left, consistentTopMargin + 6, signatures);
        }
      }
    } else {
      // Enough room on the last table page — place chart after table
      const lastPage = doc.internal.getNumberOfPages();
      doc.setPage(lastPage);
      const chartY = lastTableEndY + 5;
      drawChart(doc, chartImage, pageWidth, margins.left, chartY);
      if (showSignatures) {
        const sigY = chartY + chartImgHeight + 10;
        if (sigY + 40 < pageHeight - margins.bottom) {
          drawSignatures(doc, pageWidth, margins.left, sigY, signatures);
        } else {
          doc.addPage();
          drawHeader(doc, title, subtitle, hierarchyLabel, monthLabel, pageWidth, margins.left);
          drawSignatures(doc, pageWidth, margins.left, consistentTopMargin + 6, signatures);
        }
      }
    }
  } else if (showSignatures) {
    // No chart — just add signatures on the last page
    const lastTableEndY = doc.lastAutoTable?.finalY || contentStartY + 20;
    const lastPage = doc.internal.getNumberOfPages();
    doc.setPage(lastPage);
    if (lastTableEndY + 40 < pageHeight - margins.bottom) {
      drawSignatures(doc, pageWidth, margins.left, lastTableEndY + 5, signatures);
    } else {
      doc.addPage();
      drawHeader(doc, title, subtitle, hierarchyLabel, monthLabel, pageWidth, margins.left);
      drawSignatures(doc, pageWidth, margins.left, consistentTopMargin + 6, signatures);
    }
  }

  // ── FINAL step: apply footers to ALL pages (after all content placed) ──
  const totalPages = doc.internal.getNumberOfPages();
  applyAllFooters(doc, totalPages, pageWidth, margins.left, pageHeight, footerText, showPageNumbers);

  // ── Save the PDF ───────────────────────────────────────────────────
  try {
    const pdfBuffer = doc.output('arraybuffer');
    if (writeToPath) {
      // Silent write to a fixed path (used by scheduled reports) — no dialog.
      const bytes = Array.from(new Uint8Array(pdfBuffer));
      await invoke('write_binary_file', { path: writeToPath, contents: bytes });
      if (onProgress) onProgress(100);
      return { success: true, filePath: writeToPath, fileSizeKb: bytes.length / 1024 };
    }
    const success = await saveFileWithDialog(
      pdfBuffer,
      `${fileName}_${timestamp()}.pdf`,
      'PDF Files (*.pdf)',
      'pdf'
    );
    if (onProgress) onProgress(100);
    return success;
  } catch (error) {
    console.error('PDF generation failed:', error);
    throw new Error('حدث خطأ أثناء تصدير ملف الـ PDF');
  }
};
