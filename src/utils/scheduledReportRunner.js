import { invoke } from '../api/tauriApi';
import { exportToPDF } from './exportPdf';
import { extractSignaturesFromPresets } from '../hooks/useReportSignatures';

// ═══════════════════════════════════════════════════════════════════════
// Scheduled Reports Runner
//
// Three-phase flow so the user can PREVIEW before committing:
//   1) prepareScheduledReport  — backend collects the aggregated summary
//      data (hierarchy + period filters + current-vs-previous comparison)
//      and creates a 'running' history entry. NO file is written yet.
//   2) saveScheduledReport     — render the PDF with the app's Arabic-aware
//      engine (embedded Amiri font), write it to the chosen output folder,
//      then tell the backend the run succeeded.
//   3) cancelScheduledReport   — user previewed but decided not to save;
//      the history entry is marked 'cancelled' and any stray PDF is removed.
// ═══════════════════════════════════════════════════════════════════════

/**
 * Load signature names (preparer/manager/approval) from the default export
 * preset so the generated PDF carries the same signatures as other reports.
 * Best-effort — returns {} when nothing is configured.
 */
const loadSignatures = async () => {
  try {
    const presets = await invoke('get_export_presets', { userId: null, isAdmin: true });
    return extractSignaturesFromPresets(presets) || {};
  } catch (_) {
    return {};
  }
};

/**
 * Phase 1 — collect the report data and open a 'running' history entry.
 * Returns the backend payload (rows, comparison, title, month, hierarchy
 * names, output_folder, filename_base, history_id). Nothing is written.
 *
 * @param {number|string} scheduleId
 * @param {string} [month] Optional reference month "YYYY-MM"; when omitted the
 *        backend defaults to the current month.
 */
export const prepareScheduledReport = async (scheduleId, month) => {
  const data = await invoke('run_scheduled_report_now', { scheduleId, month: month || null });
  if (!data) throw new Error('لم يتم استلام بيانات التقرير');
  return data;
};

/**
 * Phase 2 — render the PDF and write it into the chosen output folder,
 * then mark the run as successful (advances next_run / last_generated).
 * Call this only after the user confirmed from the preview.
 *
 * @param {Object} data                    - payload from prepareScheduledReport
 * @param {Object} [options]
 * @param {string} [options.outputFolder]  - override folder chosen at save time
 * @param {boolean} [options.openExplorer] - highlight the saved file (default true)
 */
export const saveScheduledReport = async (data, options = {}) => {
  const { outputFolder: outputOverride, orientation = 'portrait' } = options;
  const historyId = data?.history_id ?? null;
  try {
    const schedule = data?.schedule || {};
    const rows = Array.isArray(data?.rows) ? data.rows : [];
    const comparison = Array.isArray(data?.comparison) ? data.comparison : [];
    const title = data?.title || schedule.name || 'تقرير مجدول';
    const displayMonth = data?.month || '';
    const branch = data?.branch_name || '';
    const area = data?.area_name || '';
    const clinic = data?.clinic_name || '';
    const hierarchyLabel = [branch, area, clinic].filter(Boolean).join(' - ') || 'جميع النطاقات';
    const filenameBase = data?.filename_base || `scheduled_report_${Date.now()}`;

    // Use the folder chosen at save time, else the backend-resolved default
    // (falls back to Documents/DrugStats/Reports).
    const outputFolder = (outputOverride || data?.output_folder || schedule.output_folder || '')
      .replace(/[\\/]+$/, '');
    if (!outputFolder) {
      throw new Error('مجلد الإخراج غير محدد لهذا التقرير');
    }
    const filePath = `${outputFolder}\\${filenameBase}.pdf`;

    const signatures = await loadSignatures();

    // Main table + optional comparison table (current vs previous period).
    const tableData = rows.map(([label, value]) => ({ label, value }));
    const columns = [
      { header: 'البند', accessor: 'label' },
      { header: 'القيمة', accessor: 'value' },
    ];

    const tables = [{ data: tableData, columns, title: null }];
    if (comparison.length > 0) {
      const comparisonData = comparison.map(c => ({
        label: c.label,
        current: c.current,
        previous: c.previous,
        change: c.change_pct,
      }));
      tables.push({
        data: comparisonData,
        title: 'مقارنة بالفترة السابقة',
        columns: [
          { header: 'البند', accessor: 'label' },
          { header: 'الفترة الحالية', accessor: 'current' },
          { header: 'الفترة السابقة', accessor: 'previous' },
          { header: 'نسبة التغير', accessor: 'change' },
        ],
      });
    }

    const result = await exportToPDF([], [], {
      title,
      subtitle: `تقرير مجدول — ${schedule.name || ''}`.trim(),
      hierarchyLabel,
      monthLabel: displayMonth ? `شهر البيانات: ${displayMonth}` : '',
      fileName: filenameBase,
      orientation,
      showSignatures: true,
      signatures,
      tables,
      writeToPath: filePath, // silent write, no dialog
    });

    if (!result || !result.success) {
      throw new Error('فشل توليد ملف PDF');
    }

    // 3) Backend: mark success + advance next_run / last_generated
    await invoke('complete_scheduled_report', {
      scheduleId: schedule.id,
      historyId,
      filePath: result.filePath || filePath,
      fileSizeKb: result.fileSizeKb || 0,
    });

    return {
      success: true,
      filePath: result.filePath || filePath,
      message: `✅ تم إنشاء التقرير بنجاح: ${filenameBase}.pdf`,
    };
  } catch (err) {
    // Mark history as failed if we have a history id (best-effort)
    if (historyId != null) {
      try {
        await invoke('fail_scheduled_report', {
          historyId,
          errorMessage: String(err?.message || err),
        });
      } catch (_) {
        // never block the original error
      }
    }
    throw err;
  }
};

/**
 * Phase 3 — the user previewed the report but chose NOT to save it.
 * Removes any PDF that may already exist at filePath (protects against
 * accumulation), then marks the history entry as 'cancelled'.
 */
export const cancelScheduledReport = async (historyId, filePath) => {
  if (filePath) {
    try {
      await invoke('delete_file', { path: filePath });
    } catch (_) {
      // best-effort — file may not exist yet
    }
  }
  if (historyId == null) return;
  try {
    await invoke('cancel_scheduled_report', { historyId });
  } catch (_) {
    // best-effort — never block the caller
  }
};
