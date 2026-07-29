/**
 * Excel Export Engine (.xlsx)
 * Supports single-sheet and multi-sheet exports with full Arabic/right-to-left support.
 */
import { saveFileWithDialog, buildDataMatrix, timestamp, LOGO_BASE64 } from './exportHelpers';

const getExcelJS = async () => {
  const mod = await import('exceljs');
  return mod.default || mod;
};

// ═══════════════════════════════════════════════════════════════════════════
// SINGLE-SHEET EXCEL EXPORT
// ═══════════════════════════════════════════════════════════════════════════

export const exportToExcel = async (data, columns, options = {}) => {
  const ExcelJS = await getExcelJS();
  const { 
    title = 'تقرير', 
    fileName = 'report', 
    subtitle = '', 
    hierarchyLabel = '',
    footerSignatures = ['معد التقرير', 'مدير الصيدلية/الادارة', 'خاتم الإدارة'],
    signatures = {},
  } = options;

  // Use digital signatures from DB when available
  const sigPreparer = signatures?.preparerName || '';
  const sigManager = signatures?.managerName || '';
  const effectiveSignatures = sigPreparer
    ? [sigPreparer || '.........................', sigManager || '.........................', signatures?.approvalNumber || '.........................']
    : footerSignatures;
  const { headers, rows } = buildDataMatrix(data, columns);

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('التقرير', { views: [{ rightToLeft: true }] });

  let currentRow = 1;

  // Add Logo
  try {
    const logoId = workbook.addImage({ base64: LOGO_BASE64, extension: 'png' });
    worksheet.addImage(logoId, { tl: { col: 0, row: 0 }, ext: { width: 60, height: 60 } });
    currentRow = 5;
  } catch (e) {
    console.error('Failed to add logo to Excel', e);
  }

  // Title
  worksheet.mergeCells(currentRow, 1, currentRow, headers.length);
  const titleCell = worksheet.getCell(currentRow, 1);
  titleCell.value = title;
  titleCell.font = { name: 'Arial', size: 16, bold: true, color: { argb: 'FF0891B2' } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  currentRow++;

  // Subtitle
  worksheet.mergeCells(currentRow, 1, currentRow, headers.length);
  const egyptCell = worksheet.getCell(currentRow, 1);
  egyptCell.value = 'جمهورية مصر العربية - الهيئة العامة للتأمين الصحي';
  egyptCell.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FF64748B' } };
  egyptCell.alignment = { horizontal: 'center', vertical: 'middle' };
  currentRow++;

  if (subtitle) {
    worksheet.mergeCells(currentRow, 1, currentRow, headers.length);
    const subCell = worksheet.getCell(currentRow, 1);
    subCell.value = subtitle;
    subCell.font = { name: 'Arial', size: 12, color: { argb: 'FF475569' } };
    subCell.alignment = { horizontal: 'center', vertical: 'middle' };
    currentRow++;
  }

  if (hierarchyLabel) {
    worksheet.mergeCells(currentRow, 1, currentRow, headers.length);
    const hCell = worksheet.getCell(currentRow, 1);
    hCell.value = `النطاق: ${hierarchyLabel}`;
    hCell.font = { name: 'Arial', size: 10, color: { argb: 'FF64748B' } };
    hCell.alignment = { horizontal: 'center', vertical: 'middle' };
    currentRow++;
  }

  worksheet.mergeCells(currentRow, 1, currentRow, headers.length);
  const dateCell = worksheet.getCell(currentRow, 1);
  dateCell.value = `تاريخ التصدير: ${new Date().toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' })}`;
  dateCell.font = { name: 'Arial', size: 10, color: { argb: 'FF64748B' } };
  dateCell.alignment = { horizontal: 'center', vertical: 'middle' };
  currentRow += 2;

  // Table Headers
  const headerRow = worksheet.getRow(currentRow);
  headers.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    cell.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0891B2' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
  });
  currentRow++;

  // Data Rows
  let hasTotals = false;
  const totals = new Array(headers.length).fill(0);
  const isNumericCol = new Array(headers.length).fill(true);
  const hasValueCol = new Array(headers.length).fill(false);

  rows.forEach((r, idx) => {
    const rowObj = worksheet.getRow(currentRow);
    if (r.isGroupHeader) {
      worksheet.mergeCells(currentRow, 1, currentRow, headers.length);
      const cell = rowObj.getCell(1);
      cell.value = r.groupName;
      cell.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FF0F172A' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFCBD5E1' } };
      cell.alignment = { horizontal: 'right', vertical: 'middle' };
      cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    } else {
      r.forEach((val, i) => {
        const cell = rowObj.getCell(i + 1);
        const numStr = String(val).replace(/,/g, '').trim();
        const num = parseFloat(numStr);
        if (numStr !== '' && !isNaN(num)) {
          cell.value = num;
          hasValueCol[i] = true;
          totals[i] += num;
        } else {
          cell.value = val;
          if (val !== '' && val !== '-') isNumericCol[i] = false;
        }
        cell.font = { name: 'Arial', size: 10 };
        if (idx % 2 === 0) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
        }
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = { top: { style: 'thin', color: {argb:'FFCBD5E1'} }, left: { style: 'thin', color: {argb:'FFCBD5E1'} }, bottom: { style: 'thin', color: {argb:'FFCBD5E1'} }, right: { style: 'thin', color: {argb:'FFCBD5E1'} } };
      });
    }
    currentRow++;
  });

  // Totals Row
  for (let c = 1; c < headers.length; c++) {
    if (isNumericCol[c] && hasValueCol[c]) hasTotals = true;
  }

  if (hasTotals && rows.length > 0) {
    const totalRowObj = worksheet.getRow(currentRow);
    headers.forEach((_, i) => {
      const cell = totalRowObj.getCell(i + 1);
      if (i === 0) {
        cell.value = 'الإجمالي';
      } else if (isNumericCol[i] && hasValueCol[i]) {
        cell.value = totals[i];
        cell.numFmt = '#,##0.00';
      } else {
        cell.value = '';
      }
      cell.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FF0F172A' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = { top: { style: 'medium' }, left: { style: 'thin' }, bottom: { style: 'medium' }, right: { style: 'thin' } };
    });
    currentRow++;
  }

  // Chart Image
  if (options.chartImage) {
    try {
      const chartId = workbook.addImage({ base64: options.chartImage, extension: 'png' });
      worksheet.addImage(chartId, { tl: { col: 0, row: currentRow + 1 }, ext: { width: 500, height: 250 } });
      currentRow += 15;
    } catch (e) {
      console.error('Failed to add chart to Excel', e);
    }
  }

  currentRow += 3;

  // Signatures
  const sigRow = worksheet.getRow(currentRow);
  const sigTitleRow = worksheet.getRow(currentRow + 3);
  const sigLineRow = worksheet.getRow(currentRow + 4);
  {
    const sigSpan = Math.max(headers.length, 3);
    const col1 = 1, col2 = Math.floor(sigSpan / 2) + 1, col3 = sigSpan;
    sigRow.getCell(col1).value = effectiveSignatures[0];
    sigRow.getCell(col2).value = effectiveSignatures[1];
    sigRow.getCell(col3).value = effectiveSignatures[2];
    [col1, col2, col3].forEach(c => {
      sigRow.getCell(c).font = { name: 'Arial', size: 11, bold: true, underline: true };
      sigRow.getCell(c).alignment = { horizontal: 'center' };
      sigTitleRow.getCell(c).value = 'التوقيع';
      sigTitleRow.getCell(c).font = { name: 'Arial', size: 10, color: {argb:'FF94A3B8'} };
      sigTitleRow.getCell(c).alignment = { horizontal: 'center' };
      sigLineRow.getCell(c).value = '..............................';
      sigLineRow.getCell(c).font = { name: 'Arial', size: 10, color: {argb:'FF94A3B8'} };
      sigLineRow.getCell(c).alignment = { horizontal: 'center' };
    });
  }

  // Column widths
  worksheet.columns.forEach((column, i) => {
    if (i >= headers.length) { column.width = 20; return; }
    let maxLength = headers[i].length;
    rows.forEach(r => {
      if (r.isGroupHeader) return;
      const val = String(r[i] || '');
      if (val.length > maxLength) maxLength = val.length;
    });
    column.width = Math.min(Math.max(maxLength + 5, 15), 40);
  });

  // Branding Footer
  currentRow += 7;
  worksheet.mergeCells(currentRow, 1, currentRow, headers.length);
  const brandCell = worksheet.getCell(currentRow, 1);
  brandCell.value = `جميع الحقوق محفوظة © ${new Date().getFullYear()} | تصميم وتطوير ك/ أحمد علي أحمد كوكب`;
  brandCell.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FF94A3B8' } };
  brandCell.alignment = { horizontal: 'center' };

  const buffer = await workbook.xlsx.writeBuffer();
  await saveFileWithDialog(buffer, `${fileName}_${timestamp()}.xlsx`, 'Excel Files (*.xlsx)', 'xlsx');
};

// ═══════════════════════════════════════════════════════════════════════════
// MULTI-SHEET EXCEL EXPORT
// ═══════════════════════════════════════════════════════════════════════════

export const exportMultiSheetExcel = async (sheetsData, globalOptions = {}) => {
  const ExcelJS = await getExcelJS();
  const { 
    fileName = 'multi_report', 
    title = 'تقرير إحصائي مجمع',
    summaryData = null,
    chartImage = null,
    footerSignatures = ['معد التقرير', 'مدير الصيدلية/الادارة', 'خاتم الإدارة']
  } = globalOptions;

  const workbook = new ExcelJS.Workbook();
  
  // 1. Summary Sheet
  if (summaryData) {
    const sws = workbook.addWorksheet('الملخص الإحصائي', { views: [{ rightToLeft: true }] });
    try {
      const logoId = workbook.addImage({ base64: LOGO_BASE64, extension: 'png' });
      sws.addImage(logoId, { tl: { col: 0, row: 0 }, ext: { width: 55, height: 55 } });
    } catch (e) {}
    sws.mergeCells('B1:D1');
    const instCell = sws.getCell('B1');
    instCell.value = 'جمهورية مصر العربية - الهيئة العامة للتأمين الصحي';
    instCell.font = { bold: true, size: 10, color: { argb: 'FF64748B' } };
    sws.mergeCells('A2:D2');
    const titleCell = sws.getCell('A2');
    titleCell.value = title;
    titleCell.font = { name: 'Arial', size: 18, bold: true, color: { argb: 'FF0891B2' } };
    titleCell.alignment = { horizontal: 'center' };
    sws.mergeCells('A3:D3');
    const dateCell = sws.getCell('A3');
    dateCell.value = `تاريخ التصدير: ${new Date().toLocaleDateString('ar-EG')} | بواسطة: منظومة الصرف الإلكتروني`;
    dateCell.font = { size: 9, color: { argb: 'FF94A3B8' } };
    dateCell.alignment = { horizontal: 'center' };
    let currRow = 5;
    const { headers, rows } = summaryData;
    headers.forEach((h, i) => {
      const cell = sws.getCell(currRow, i + 1);
      cell.value = h;
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0891B2' } };
      cell.alignment = { horizontal: 'center' };
      cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    });
    currRow++;
    rows.forEach((r, idx) => {
      r.forEach((val, i) => {
        const cell = sws.getCell(currRow, i + 1);
        cell.value = val;
        cell.alignment = { horizontal: 'center' };
        if (idx % 2 === 0) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0FDF4' } };
        cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
      });
      currRow++;
    });
    sws.columns.forEach(col => { col.width = 30; });
    if (chartImage) {
      try {
        const chartId = workbook.addImage({ base64: chartImage, extension: 'png' });
        sws.addImage(chartId, { tl: { col: 0, row: currRow + 2 }, ext: { width: 500, height: 250 } });
      } catch (e) {}
    }
  }

  // 2. Individual Data Sheets
  for (const [sheetName, config] of Object.entries(sheetsData)) {
    const { data, columns, options = {} } = config;
    const { headers, rows } = buildDataMatrix(data, columns);
    const ws = workbook.addWorksheet(sheetName.substring(0, 30), { views: [{ rightToLeft: true }] });
    
    try {
      const logoId = workbook.addImage({ base64: LOGO_BASE64, extension: 'png' });
      ws.addImage(logoId, { tl: { col: 0, row: 0 }, ext: { width: 50, height: 50 } });
    } catch (e) {}

    ws.mergeCells(1, 2, 1, headers.length);
    const instCell = ws.getCell(1, 2);
    instCell.value = 'جمهورية مصر العربية - الهيئة العامة للتأمين الصحي';
    instCell.font = { bold: true, size: 9, color: { argb: 'FF64748B' } };

    ws.mergeCells(2, 1, 2, headers.length);
    const hCell = ws.getCell(2, 1);
    hCell.value = `${options.title || title} - ${sheetName}`;
    hCell.font = { bold: true, size: 14, color: { argb: 'FF0E7490' } };
    hCell.alignment = { horizontal: 'center' };

    ws.mergeCells(3, 1, 3, headers.length);
    const dCell = ws.getCell(3, 1);
    dCell.value = `نطاق التقرير: ${options.hierarchyLabel || ''} | تاريخ الطباعة: ${new Date().toLocaleDateString('ar-EG')}`;
    dCell.font = { size: 9, color: { argb: 'FF94A3B8' } };
    dCell.alignment = { horizontal: 'center' };

    let currentRow = 5;
    const hRow = ws.getRow(currentRow);
    headers.forEach((h, i) => {
      const cell = hRow.getCell(i + 1);
      cell.value = h;
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0891B2' } };
      cell.alignment = { horizontal: 'center' };
      cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    });
    currentRow++;

    rows.forEach((r, idx) => {
      const rowObj = ws.getRow(currentRow);
      if (r.isGroupHeader) {
        ws.mergeCells(currentRow, 1, currentRow, headers.length);
        const cell = rowObj.getCell(1);
        cell.value = r.groupName;
        cell.font = { bold: true };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
        cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
      } else {
        r.forEach((val, i) => {
          const cell = rowObj.getCell(i + 1);
          const num = parseFloat(String(val).replace(/,/g, ''));
          cell.value = isNaN(num) || String(val).includes('-') ? val : num;
          cell.alignment = { horizontal: 'center' };
          if (idx % 2 === 0) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
          cell.border = { top: { style: 'thin', color: {argb:'FFCBD5E1'} }, left: { style: 'thin', color: {argb:'FFCBD5E1'} }, bottom: { style: 'thin', color: {argb:'FFCBD5E1'} }, right: { style: 'thin', color: {argb:'FFCBD5E1'} } };
        });
      }
      currentRow++;
    });

    // Chart image per sheet
    const cImg = options.chartImage || chartImage;
    if (cImg) {
      try {
        const chartId = workbook.addImage({ base64: cImg, extension: 'png' });
        ws.addImage(chartId, { tl: { col: 0, row: currentRow + 2 }, ext: { width: 500, height: 250 } });
        currentRow += 15;
      } catch (e) {}
    }

    // Signatures
    currentRow += 3;
    const sigRow = ws.getRow(currentRow);
    const sigTitleRow = ws.getRow(currentRow + 3);
    const sigLineRow = ws.getRow(currentRow + 4);
    {
      const sigSpan = Math.max(headers.length, 3);
      const col1 = 1, col2 = Math.floor(sigSpan / 2) + 1, col3 = sigSpan;
      const sigs = options.footerSignatures || footerSignatures;
      sigRow.getCell(col1).value = sigs[0];
      sigRow.getCell(col2).value = sigs[1];
      sigRow.getCell(col3).value = sigs[2];
      [col1, col2, col3].forEach(c => {
        sigRow.getCell(c).font = { name: 'Arial', size: 11, bold: true, underline: true };
        sigRow.getCell(c).alignment = { horizontal: 'center' };
        sigTitleRow.getCell(c).value = 'التوقيع';
        sigTitleRow.getCell(c).font = { name: 'Arial', size: 10, color: { argb: 'FF94A3B8' } };
        sigTitleRow.getCell(c).alignment = { horizontal: 'center' };
        sigLineRow.getCell(c).value = '..............................';
        sigLineRow.getCell(c).font = { name: 'Arial', size: 10, color: { argb: 'FF94A3B8' } };
        sigLineRow.getCell(c).alignment = { horizontal: 'center' };
      });
    }

    // Branding footer
    currentRow += 5;
    ws.mergeCells(currentRow, 1, currentRow, headers.length);
    const brandCell = ws.getCell(currentRow, 1);
    brandCell.value = `جميع الحقوق محفوظة © ${new Date().getFullYear()} | تصميم وتطوير ك/ أحمد علي أحمد كوكب`;
    brandCell.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FF94A3B8' } };
    brandCell.alignment = { horizontal: 'center' };

    ws.columns.forEach((col, i) => {
      let maxLen = headers[i]?.length || 10;
      col.width = Math.min(Math.max(maxLen + 8, 15), 40);
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  await saveFileWithDialog(buffer, `${fileName}_${timestamp()}.xlsx`, 'Excel Files (*.xlsx)', 'xlsx');
};
