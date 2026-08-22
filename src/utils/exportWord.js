/**
 * Word Export Engine (.doc)
 * Generates a Word-compatible HTML document with full Arabic support.
 * Supports both single-table (backward compatible) and multi-table exports.
 */
import { buildDataMatrix, timestamp, saveFileWithDialog, LOGO_BASE64 } from './exportHelpers';

const buildTableHtml = (tableData, tableColumns, tableTitle = null) => {
  const { headers, rows } = buildDataMatrix(tableData, tableColumns);
  const tableRows = rows.map((r, idx) => {
    if (r.isGroupHeader) {
      return `<tr style="background-color: #e2e8f0; font-weight: bold;"><td colspan="${headers.length}">${r.groupName}</td></tr>`;
    }
    const cells = r.map(c => `<td>${c}</td>`).join('');
    return `<tr class="${idx % 2 === 0 ? 'even' : ''}">${cells}</tr>`;
  }).join('\n');

  const titleHtml = tableTitle
    ? `<h3 style="color: #0891b2; font-size: 14pt; margin: 20px 0 10px 0;">${tableTitle}</h3>`
    : '';

  return `
    ${titleHtml}
    <table class="data-table">
      <thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
      <tbody>${tableRows}</tbody>
    </table>
  `;
};

export const exportToWord = (data, columns, options = {}) => {
  const {
    title = 'تقرير',
    fileName = 'report',
    hierarchyLabel = '',
    monthLabel = '',
    subtitle = '',
    periodLabel = '',
    startMonth = '',
    endMonth = '',
    signatures = {},
    tables = null,
  } = options;

  const periodText = periodLabel || (startMonth && endMonth ? `الفترة من: ${startMonth} إلى: ${endMonth}` : subtitle);

  // Digital signatures: real names from DB, or dots as fallback
  const sigPreparer = signatures?.preparerName || '';
  const sigManager = signatures?.managerName || '';
  const sigApproval = signatures?.approvalNumber || '';

  const tablesHtml = tables
    ? tables.map(t => buildTableHtml(t.data, t.columns, t.title)).join('\n')
    : buildTableHtml(data, columns);

  const chartHtml = options.chartImage
    ? `
    <div style="text-align: center; margin: 20px 0; page-break-inside: avoid;">
      <h3 style="color: #0891b2; font-size: 14pt; margin-bottom: 10px;">الرسم البياني التحليلي</h3>
      <img src="${options.chartImage}" width="650" style="width: 650px; height: auto; border: 1px solid #e2e8f0; border-radius: 8px;" />
    </div>
  `
    : '';

  const html = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
    <head>
      <meta charset="UTF-8">
      <style>
        @page Section1 { size: 841.9pt 595.3pt; mso-page-orientation: landscape; margin: 1.0cm; }
        div.Section1 { page: Section1; }
        body { font-family: 'Segoe UI', Tahoma, Arial, sans-serif; direction: rtl; text-align: right; }
        .header-table { width: 100%; border-bottom: 2px solid #0891b2; margin-bottom: 20px; }
        .report-title { color: #0891b2; font-size: 20pt; font-weight: bold; }
        table.data-table { border-collapse: collapse; width: 100%; font-size: 10pt; margin-bottom: 20px; }
        table.data-table th { background-color: #0891b2; color: white; padding: 10px; border: 1px solid #0e7490; }
        table.data-table td { padding: 8px; border: 1px solid #cbd5e1; text-align: center; }
        table.data-table tr.even td { background-color: #f8fafc; }
        .footer-branding { margin-top: 50px; text-align: center; font-size: 9pt; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 10px; }
      </style>
    </head>
    <body>
      <div class="Section1">
        <table class="header-table">
          <tr>
            <td style="text-align: right; width: 80%;">
              <div style="color: #64748b; font-size: 10pt; font-weight: bold;">جمهورية مصر العربية - الهيئة العامة للتأمين الصحي</div>
              <div class="report-title">${title}</div>
              <div style="color: #475569; font-size: 9.5pt; font-weight: bold; margin-top: 4px;">
                ${periodText ? `${periodText} | ` : ''}${monthLabel ? `شهر البيانات: ${monthLabel} | ` : ''}${hierarchyLabel ? `نطاق التقرير: ${hierarchyLabel} | ` : ''}تاريخ التصدير: ${new Date().toLocaleDateString('ar-EG')}
              </div>
            </td>
            <td style="text-align: left; width: 20%;"><img src="${LOGO_BASE64}" width="80" height="80" /></td>
          </tr>
        </table>

        ${tablesHtml}

        ${chartHtml}

        <!-- Signature titles (always visible) -->
        <table style="width: 100%; margin-top: 50px; border: none;">
          <tr>
            <td style="width: 33%; text-align: center; font-weight: bold; text-decoration: underline; font-size: 11pt;">مُعد التقرير</td>
            <td style="width: 33%; text-align: center; font-weight: bold; text-decoration: underline; font-size: 11pt;">مدير الصيدلية / الإدارة</td>
            <td style="width: 33%; text-align: center; font-weight: bold; text-decoration: underline; font-size: 11pt;">رقم الاعتماد / خاتم الإدارة</td>
          </tr>
          <tr>
            <td style="text-align: center; font-weight: bold; color: #0f172a; font-size: 10pt; padding-top: 6px;">الاسم: ${sigPreparer || '...........................'}</td>
            <td style="text-align: center; font-weight: bold; color: #0f172a; font-size: 10pt; padding-top: 6px;">الاسم: ${sigManager || '...........................'}</td>
            <td style="text-align: center; font-weight: bold; color: #0f172a; font-size: 10pt; padding-top: 6px;">رقم: ${sigApproval || '...........................'}</td>
          </tr>
          <tr>
            <td style="text-align: center; color: #94a3b8; font-size: 9pt; padding-top: 6px;">التوقيع: .....................</td>
            <td style="text-align: center; color: #94a3b8; font-size: 9pt; padding-top: 6px;">التوقيع: .....................</td>
            <td style="text-align: center; color: #94a3b8; font-size: 9pt; padding-top: 6px;">التوقيع: .....................</td>
          </tr>
          <tr>
            <td colspan="3" style="text-align: center; padding-top: 12px; border-top: 1px dashed #cbd5e1;">
              <span style="font-size: 9pt; color: #475569; font-weight: bold;">ختم الإدارة: ........................................................</span>
            </td>
          </tr>
        </table>

        <div class="footer-branding">جميع الحقوق محفوظة © ${new Date().getFullYear()} | منظومة إحصائيات الأدوية والمستلزمات الطبية</div>
      </div>
    </body>
    </html>
  `;

  const blob = new Blob(['\ufeff', html], { type: 'application/msword;charset=utf-8' });
  saveFileWithDialog(blob, `${fileName}_${timestamp()}.doc`, 'Word Files (*.doc)', 'doc');
};
