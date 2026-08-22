import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Clock, Plus, Trash2, Play, ToggleLeft, ToggleRight,
  FileText, Calendar, FolderOpen, ChevronDown, ExternalLink,
  RefreshCw, AlertCircle, CheckCircle, XCircle, History,
  Search, Settings, Save, X, CheckSquare, Square,
  Printer, FolderSearch
} from 'lucide-react';
import { invoke } from '../../api/tauriApi';
import {
  prepareScheduledReport,
  saveScheduledReport,
  cancelScheduledReport,
} from '../../utils/scheduledReportRunner';
import { useSmartNotification } from '../../context/SmartNotificationContext';
import { extractSignaturesFromPresets } from '../../hooks/useReportSignatures';
import PageHeader from '../../components/ui/PageHeader';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Modal from '../../components/ui/Modal';
import Toast from '../../components/ui/Toast';

// ── Simple date formatter (matching the app's Arabic locale) ─────────
const formatDate = (dateStr) => {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('ar-EG', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return dateStr; }
};

// ── Shared paper builder ────────────────────────────────────────────────
// Builds the FULL report paper as one HTML string — header with the
// authority's title, meta line, main table, comparison table, signatures
// and page-number footer. The SAME markup is used for the on-screen preview
// (rendered in the confirm modal) and for the print iframe, so what you see
// before saving is exactly what gets printed.

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const buildPaperHTML = (data, sigs = {}, pageFooter = 'صفحة 1 / 1') => {
  const rows = Array.isArray(data?.rows) ? data.rows : [];
  const comparison = Array.isArray(data?.comparison) ? data.comparison : [];
  const title = data?.title || 'تقرير مجدول';
  const scheduleName = data?.schedule?.name || '';
  const hierarchy = [data?.branch_name, data?.area_name, data?.clinic_name].filter(Boolean).join(' - ') || 'جميع النطاقات';

  const rowsHtml = rows.length > 0
    ? rows.map(([label, value], i) =>
        `<tr><td style="padding:6px 10px;border:1px solid #e2e8f0;text-align:center">${i + 1}</td><td style="padding:6px 10px;border:1px solid #e2e8f0">${esc(label)}</td><td style="padding:6px 10px;border:1px solid #e2e8f0;font-weight:700">${esc(value)}</td></tr>`
      ).join('')
    : '<tr><td colspan="3" style="padding:16px;border:1px solid #e2e8f0;text-align:center;color:#64748b">لا توجد بيانات لهذه الفترة</td></tr>';

  let comparisonHtml = '';
  if (comparison.length > 0) {
    comparisonHtml = `
      <h3 style="font-size:13px;margin:20px 0 8px;color:#1e293b">مقارنة بالفترة السابقة</h3>
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead><tr style="background:#f1f5f9">
          <th style="padding:6px 10px;border:1px solid #e2e8f0">البند</th>
          <th style="padding:6px 10px;border:1px solid #e2e8f0">الفترة الحالية</th>
          <th style="padding:6px 10px;border:1px solid #e2e8f0">الفترة السابقة</th>
          <th style="padding:6px 10px;border:1px solid #e2e8f0">نسبة التغير</th>
        </tr></thead>
        <tbody>${comparison.map(c =>
          `<tr><td style="padding:6px 10px;border:1px solid #e2e8f0">${esc(c.label)}</td><td style="padding:6px 10px;border:1px solid #e2e8f0;font-weight:700">${esc(c.current)}</td><td style="padding:6px 10px;border:1px solid #e2e8f0">${esc(c.previous)}</td><td style="padding:6px 10px;border:1px solid #e2e8f0">${esc(c.change_pct)}</td></tr>`
        ).join('')}</tbody>
      </table>`;
  }

  const sigCell = (name, role) =>
    `<div style="flex:1;min-width:0;text-align:center"><p style="font-weight:700;margin:0 0 4px">${esc(name) || '.........................'}</p><p style="margin:0;font-size:11px;color:#64748b">${role}</p><p style="margin:8px 0 0;font-size:10px;color:#94a3b8">التوقيع: ..................</p></div>`;

  const signaturesHtml = (sigs.preparerName || sigs.managerName || sigs.approvalNumber)
    ? `<div class="print-footer-signatures" style="display:flex;justify-content:space-between;gap:12px;margin-top:28px;padding-top:14px;border-top:1px solid #cbd5e1">
        ${sigCell(sigs.preparerName, 'مُعد التقرير')}
        ${sigCell(sigs.managerName, 'مدير الصيدلية / الإدارة')}
        ${sigCell(sigs.approvalNumber, 'رقم الاعتماد')}
      </div>`
    : '';

  return `
    <div style="font-family:'Segoe UI',Tahoma,Arial,sans-serif;color:#0f172a;line-height:1.5">
      <div style="border-bottom:3px solid #0891b2;padding-bottom:10px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:flex-start">
        <div>
          <p style="font-size:10px;font-weight:700;color:#64748b;margin:0 0 2px">الهيئة العامة للتأمين الصحي</p>
          <h1 style="font-size:18px;font-weight:900;color:#0e7490;margin:0 0 2px">${esc(title)}</h1>
          <p style="font-size:10px;color:#94a3b8;margin:0">${esc(hierarchy)} | تاريخ الطباعة: ${new Date().toLocaleDateString('ar-EG')}</p>
        </div>
        <div style="width:50px;height:50px;background:linear-gradient(135deg,#ecfeff,#e0f2fe);border-radius:12px;display:flex;align-items:center;justify-content:center;color:#0891b2;font-weight:900;font-size:14px;flex-shrink:0">HIA</div>
      </div>
      ${scheduleName ? `<p style="font-size:10px;font-weight:600;color:#334155;margin:0 0 10px">تقرير مجدول — ${esc(scheduleName)}</p>` : ''}
      <div style="display:flex;flex-wrap:wrap;gap:8px 16px;margin:0 0 14px;font-size:12px;color:#334155">
        <span>📅 الفترة: <b>${esc(data?.month || '—')}</b></span>
        <span>🕐 التوليد: <b>${esc(data?.timestamp || '—')}</b></span>
        <span>🏢 النطاق: <b>${esc(hierarchy)}</b></span>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead><tr style="background:#0891b2;color:#ffffff">
          <th style="padding:6px 10px;border:1px solid #0891b2">#</th>
          <th style="padding:6px 10px;border:1px solid #0891b2">البند</th>
          <th style="padding:6px 10px;border:1px solid #0891b2">القيمة</th>
        </tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
      ${comparisonHtml}
      ${signaturesHtml}
      <div class="paper-page-number" style="text-align:center;margin-top:16px;font-size:9px;color:#94a3b8;font-weight:700">${esc(pageFooter)}</div>
    </div>`;
};

// Print ONLY the preview paper (title, meta, rows, comparison, signatures) in
// a hidden iframe — the management page behind the modal must not print.
// The iframe carries the app's styles inline so Arabic text shapes correctly.
const printPreviewPaper = async (data, sigs = {}, orientation = 'portrait') => {
  if (!data) return;
  let finalSigs = sigs;
  if (!finalSigs || Object.keys(finalSigs).length === 0) {
    try {
      const presets = await invoke('get_export_presets', { userId: null, isAdmin: true });
      finalSigs = extractSignaturesFromPresets(presets) || {};
    } catch (_) {}
  }
  const paperHtml = buildPaperHTML(data, finalSigs);

  let inlineStyles = '';
  document.querySelectorAll('style').forEach((s) => { inlineStyles += `\n${s.innerHTML}`; });
  let stylesheetLinks = '';
  document.querySelectorAll('link[rel="stylesheet"]').forEach((l) => {
    if (l.href) stylesheetLinks += `<link rel="stylesheet" href="${l.href}">\n`;
  });

  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;top:0;left:-9999px;width:1024px;height:768px;border:0;';
  document.body.appendChild(frame);
  const frameDoc = frame.contentDocument;
  frameDoc.open();
  frameDoc.write(
    '<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8">' +
    stylesheetLinks +
    '<style>' +
    'html, body { margin: 0 !important; padding: 0 !important; background: #ffffff !important; }' +
    'body { font-family: "Segoe UI", Tahoma, Arial, sans-serif !important; padding: 16px !important; }' +
    inlineStyles +
    '@media print { html, body { padding: 0 !important; } .print-footer-signatures { page-break-inside: avoid !important; break-inside: avoid !important; } .paper-page-number { display: none !important; } }' +
    '@media print { @page { size: A4 ' + orientation + '; @bottom-center { content: counter(page) " / " counter(pages); font-size: 9px; font-weight: 700; color: #64748b; } } }' +
    '</style></head><body>' + paperHtml + '</body></html>'
  );
  frameDoc.close();

  let triggered = false;
  const cleanup = () => { triggered = true; setTimeout(() => frame.remove(), 500); };
  const triggerPrint = () => {
    if (triggered) return;
    triggered = true; // guard BEFORE print() — prevents a double dialog from the backstop timer
    try {
      frame.contentWindow.focus();
      frame.contentWindow.print();
    } catch (err) {
      console.warn('[ScheduledReports] print failed:', err);
      setTimeout(() => frame.remove(), 500);
    }
  };
  frame.contentWindow.addEventListener('afterprint', cleanup);
  frame.onload = triggerPrint;
  // Backstop in case onload never fires (mirrors exportPrint's pattern).
  setTimeout(triggerPrint, 1500);
};

// ═══════════════════════════════════════════════════════════════════════════
// Scheduled Reports Management Page
// ═══════════════════════════════════════════════════════════════════════════

const REPORT_TYPES = [
  { value: 'analytical', label: 'تحليلي إحصائي' },
  { value: 'financial', label: 'مالي' },
  { value: 'executive', label: 'تنفيذي' },
  { value: 'drugs', label: 'الأدوية' },
];

const SCHEDULE_TYPES = [
  { value: 'monthly', label: 'شهري' },
  { value: 'quarterly', label: 'ربع سنوي' },
  { value: 'yearly', label: 'سنوي' },
];

const INITIAL_FORM = {
  id: null,
  name: '',
  report_type: 'analytical',
  schedule_type: 'monthly',
  day_from: 1,
  day_to: 28,
  output_folder: '',
  branch_id: null,
  area_id: null,
  clinic_id: null,
  is_active: true,
};

const ScheduledReportsPage = () => {
  const [reports, setReports] = useState([]);
  const [history, setHistory] = useState([]);
  const [branches, setBranches] = useState([]);
  const [areas, setAreas] = useState([]);
  const [clinics, setClinics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showHistory, setShowHistory] = useState(null);
  const [runningId, setRunningId] = useState(null);
  const [runMonthFor, setRunMonthFor] = useState(null); // schedule id waiting for month selection
  const [runMonth, setRunMonth] = useState('');
  const [preview, setPreview] = useState(null);   // { data, saving } for the confirm modal
  const [previewError, setPreviewError] = useState('');
  const [previewFolder, setPreviewFolder] = useState(''); // editable output folder
  const [previewSigs, setPreviewSigs] = useState({});  // signatures for the paper preview
  const paperSheetRef = useRef(null);
  const [paperPages, setPaperPages] = useState(1);
  const [previewOrientation, setPreviewOrientation] = useState('portrait'); // 'portrait' | 'landscape'
  const { addNotification } = useSmartNotification();
  const [form, setForm] = useState(INITIAL_FORM);
  const [toast, setToast] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterActive, setFilterActive] = useState('all'); // 'all', 'active', 'inactive'
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 });
  const [formErrors, setFormErrors] = useState({});
  const [saveStatus, setSaveStatus] = useState({ saving: false, success: null, message: '', error: null });

  // ── Helper to format hierarchy label for a report ──────────────────
  const getHierarchyLabel = (report) => {
    if (!report) return 'جميع الفروع والنطاقات';
    const b = branches.find(item => Number(item.id) === Number(report.branch_id));
    const a = areas.find(item => Number(item.id) === Number(report.area_id));
    const c = clinics.find(item => Number(item.id) === Number(report.clinic_id));
    const parts = [b?.name, a?.name, c?.name].filter(Boolean);
    return parts.length > 0 ? parts.join(' - ') : 'جميع الفروع / النطاقات';
  };

  // ── Selection helpers ───────────────────────────────────────────────
  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredReports.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredReports.map(r => r.id)));
    }
  };

  const clearSelection = () => setSelectedIds(new Set());

  // ── Batch operations ────────────────────────────────────────────────
  const batchToggle = async (activate) => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    setIsBatchProcessing(true);
    setBatchProgress({ current: 0, total: ids.length });
    let successCount = 0;
    let failCount = 0;
    for (let i = 0; i < ids.length; i++) {
      try {
        const updated = await invoke('toggle_scheduled_report', { id: ids[i], is_active: activate });
        setReports(prev => prev.map(r => Number(r.id) === Number(updated.id) ? updated : r));
        successCount++;
      } catch { failCount++; }
      setBatchProgress({ current: i + 1, total: ids.length });
    }
    setIsBatchProcessing(false);
    setSelectedIds(new Set());
    setToast({
      type: failCount === 0 ? 'success' : 'warning',
      message: activate
        ? `✅ تم تفعيل ${successCount} تقرير${failCount > 0 ? `، فشل ${failCount}` : ''}`
        : `⏸️ تم إيقاف ${successCount} تقرير${failCount > 0 ? `، فشل ${failCount}` : ''}`
    });
  };

  const batchDelete = async () => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    if (!window.confirm(`هل أنت متأكد من حذف ${ids.length} تقرير مجدول؟`)) return;
    setIsBatchProcessing(true);
    setBatchProgress({ current: 0, total: ids.length });
    let successCount = 0;
    let failCount = 0;
    for (let i = 0; i < ids.length; i++) {
      try {
        await invoke('delete_scheduled_report', { id: ids[i] });
        successCount++;
      } catch { failCount++; }
      setBatchProgress({ current: i + 1, total: ids.length });
    }
    setIsBatchProcessing(false);
    setReports(prev => prev.filter(r => !ids.map(Number).includes(Number(r.id))));
    setSelectedIds(new Set());
    setToast({
      type: failCount === 0 ? 'success' : 'warning',
      message: `🗑️ تم حذف ${successCount} تقرير${failCount > 0 ? `، فشل ${failCount}` : ''}`
    });
  };

  // ── Load initial data ───────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true);
    const [r, b, a, c] = await Promise.allSettled([
      invoke('get_scheduled_reports'),
      invoke('get_branches'),
      invoke('get_areas_all'),
      invoke('get_clinics_all'),
    ]);
    setReports(r.status === 'fulfilled' ? r.value || [] : []);
    setBranches(b.status === 'fulfilled' ? b.value || [] : []);
    setAreas(a.status === 'fulfilled' ? a.value || [] : []);
    setClinics(c.status === 'fulfilled' ? c.value || [] : []);
    if (r.status === 'rejected' || b.status === 'rejected' || a.status === 'rejected' || c.status === 'rejected') {
      const reasons = [r, b, a, c]
        .filter(x => x.status === 'rejected')
        .map(x => x.reason)
        .join(' | ');
      setToast({ type: 'error', message: `فشل تحميل جزء من البيانات: ${reasons}` });
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Estimate the printed page count from the rendered paper height
  useEffect(() => {
    const measure = () => {
      const sheet = paperSheetRef.current;
      if (!sheet) return;
      const contentH = sheet.scrollHeight;
      const pageH = previewOrientation === 'landscape'
        ? sheet.clientWidth / Math.sqrt(2)
        : sheet.clientWidth * Math.sqrt(2);
      setPaperPages(Math.max(1, Math.ceil(contentH / pageH)));
    };
    measure();
    let cancelled = false;
    if (document.fonts?.ready) {
      document.fonts.ready
        .then(() => { if (!cancelled) measure(); })
        .catch(() => {});
    }
    const t = setTimeout(() => { if (!cancelled) measure(); }, 350);
    return () => { cancelled = true; clearTimeout(t); };
  }, [preview?.data, previewSigs, previewOrientation]);

  // ── Filtered reports ────────────────────────────────────────────────
  const filteredReports = reports.filter(r => {
    const matchesSearch = !searchQuery ||
      r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.report_type.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = filterActive === 'all' ? true :
      filterActive === 'active' ? r.is_active :
      !r.is_active;
    return matchesSearch && matchesFilter;
  });

  // ── Open edit form ──────────────────────────────────────────────────
  const openEdit = (report) => {
    setForm({
      id: report.id,
      name: report.name || '',
      report_type: report.report_type || 'analytical',
      schedule_type: report.schedule_type || 'monthly',
      day_from: report.day_from ?? 1,
      day_to: report.day_to ?? 28,
      output_folder: report.output_folder || '',
      branch_id: report.branch_id != null ? Number(report.branch_id) : null,
      area_id: report.area_id != null ? Number(report.area_id) : null,
      clinic_id: report.clinic_id != null ? Number(report.clinic_id) : null,
      is_active: report.is_active ?? true,
    });
    setFormErrors({});
    setSaveStatus({ saving: false, success: null, message: '', error: null });
    setShowForm(true);
  };

  // ── Open create form ────────────────────────────────────────────────
  const openCreate = () => {
    setForm(INITIAL_FORM);
    setFormErrors({});
    setSaveStatus({ saving: false, success: null, message: '', error: null });
    setShowForm(true);
  };

  // ── Save schedule ───────────────────────────────────────────────────
  const handleSave = async () => {
    const errors = {};
    const nameStr = (form.name || '').trim();
    if (!nameStr) errors.name = 'الرجاء إدخال اسم التقرير';
    const from = form.day_from ?? 1;
    const to = form.day_to === 0 ? 31 : (form.day_to ?? 28);
    if (from > to) errors.range = 'نطاق الأيام غير صحيح — "من يوم" أكبر من "إلى يوم"';
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) {
      const msg = errors.range || 'يوجد حقول مطلوبة ناقصة — تحقق من نموذج التقرير';
      setSaveStatus({
        saving: false,
        success: false,
        message: msg,
        error: 'بيانات غير مكتملة',
      });
      setToast({ type: 'error', message: msg });
      return;
    }

    setSaveStatus({ saving: true, success: null, message: 'جاري حفظ بيانات التقرير المجدول...', error: null });

    try {
      const saved = await invoke('save_scheduled_report', {
        id: form.id ? Number(form.id) : null,
        name: nameStr,
        reportType: form.report_type,
        scheduleType: form.schedule_type,
        dayFrom: form.day_from,
        dayTo: form.day_to,
        outputFolder: (form.output_folder || '').trim(),
        branchId: form.branch_id != null && form.branch_id !== '' ? Number(form.branch_id) : null,
        areaId: form.area_id != null && form.area_id !== '' ? Number(form.area_id) : null,
        clinicId: form.clinic_id != null && form.clinic_id !== '' ? Number(form.clinic_id) : null,
        isActive: form.is_active,
      });

      setReports(prev => {
        const idx = prev.findIndex(r => Number(r.id) === Number(saved.id));
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = saved;
          return next;
        }
        return [...prev, saved];
      });

      const successMsg = form.id
        ? '✅ تم تحديث التقرير المجدول بنجاح'
        : '✅ تم إنشاء التقرير المجدول بنجاح — اضغط ▶ تشغيل الآن لتوليد المعاينة و PDF';

      setSaveStatus({
        saving: false,
        success: true,
        message: successMsg,
        error: null,
      });
      setToast({ type: 'success', message: successMsg });
      loadData();
    } catch (err) {
      const failMsg = `❌ فشل ${form.id ? 'تحديث' : 'إنشاء'} التقرير المجدول: ${err}`;
      setSaveStatus({
        saving: false,
        success: false,
        message: failMsg,
        error: String(err),
      });
      setToast({ type: 'error', message: failMsg });
    }
  };

  // ── Delete schedule ─────────────────────────────────────────────────
  const handleDelete = async (id) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا التقرير المجدول؟')) return;
    try {
      await invoke('delete_scheduled_report', { id });
      setReports(prev => prev.filter(r => r.id !== id));
      setToast({ type: 'success', message: '🗑️ تم حذف التقرير المجدول' });
    } catch (err) {
      setToast({ type: 'error', message: `❌ فشل الحذف: ${err}` });
    }
  };

  // ── Toggle active ───────────────────────────────────────────────────
  const handleToggle = async (id, is_active) => {
    try {
      const updated = await invoke('toggle_scheduled_report', { id, isActive: !is_active });
      setReports(prev => prev.map(r => r.id === updated.id ? updated : r));
      setToast({ type: 'success', message: !is_active ? '▶️ تم تفعيل التقرير' : '⏸️ تم إيقاف التقرير' });
    } catch (err) {
      setToast({ type: 'error', message: `❌ فشل التبديل: ${err}` });
    }
  };

  // ── Run now (preview first, then save or cancel) ───────────────────
  const openRunMonthPicker = (id) => {
    setRunMonth('');
    setRunMonthFor(id);
  };

  const handlePrepareReport = async (id, month) => {
    setRunningId(id);
    setRunMonthFor(null);
    try {
      // Load data + signatures in parallel so the paper preview shows the
      // signature names immediately (no empty-name flash when the modal opens).
      const [data, sigs] = await Promise.all([
        prepareScheduledReport(id, month || undefined),
        (async () => {
          try {
            const presets = await invoke('get_export_presets', { userId: null, isAdmin: true });
            return extractSignaturesFromPresets(presets) || {};
          } catch (_) {
            return {};
          }
        })(),
      ]);
      setPreviewSigs(sigs);
      setPreview({ data, saving: false });
      setPreviewError('');
      setPreviewFolder(data?.output_folder || data?.schedule?.output_folder || '');
    } catch (err) {
      addNotification('error', `❌ فشل تجهيز التقرير: ${err}`);
      setToast({ type: 'error', message: `❌ فشل تجهيز التقرير: ${err}` });
    } finally {
      setRunningId(null);
    }
  };

  // Confirm save from the preview — writes the PDF to the chosen output folder.
  const handleConfirmSave = async () => {
    if (!preview || preview.saving) return;
    setPreview({ ...preview, saving: true });
    setPreviewError('');
    try {
      const result = await saveScheduledReport(preview.data, {
        outputFolder: previewFolder.trim(),
        orientation: previewOrientation,
      });
      addNotification('success', result.message, {
        actions: [{
          label: 'فتح المجلد',
          handler: () => openFolder(result.filePath),
        }],
      });
      setToast({ type: 'success', message: result.message });
      setPreview(null);
      loadData(); // refresh to get updated state
    } catch (err) {
      addNotification('error', `❌ فشل حفظ التقرير: ${err}`);
      setPreviewError(String(err?.message || err));
      setPreview({ ...preview, saving: false });
    }
  };

  // Cancel from the preview — marks the history entry as cancelled and removes
  // any stray PDF. Guarded so the modal can't close mid-save.
  const handleCancelPreview = async () => {
    if (preview?.saving) return;
    const historyId = preview?.data?.history_id;
    // Use the folder the user actually chose (may differ from the schedule's)
    // so any stray PDF at the save-time location is removed too.
    const folder = (previewFolder.trim() || preview?.data?.output_folder || '').replace(/[\\/]+$/, '');
    const pendingFile = folder
      ? `${folder}\\${preview.data.filename_base || ''}.pdf`
      : null;
    setPreview(null);
    setPreviewError('');
    if (historyId != null) {
      await cancelScheduledReport(historyId, pendingFile);
      loadData();
    }
    addNotification('info', 'تم التراجع — لم يُحفظ أي ملف');
    setToast({ type: 'info', message: 'تم التراجع — لم يُحفظ أي ملف' });
  };

  // Pick an output folder with the native dialog.
  const handlePickFolder = async () => {
    try {
      const picked = await invoke('pick_folder');
      if (picked) setPreviewFolder(picked);
    } catch (_) {
      setToast({ type: 'info', message: 'أدخل مسار المجلد يدوياً' });
    }
  };

  // Print ONLY the preview paper (not the management page behind the modal).
  const handlePrintPreview = async () => {
    if (preview?.saving || !preview?.data) return;
    try {
      await printPreviewPaper(preview.data, previewSigs, previewOrientation);
    } catch (err) {
      setToast({ type: 'error', message: `❌ فشل الطباعة: ${err}` });
    }
  };

  // ── Show history ────────────────────────────────────────────────────
  const showReportHistory = async (scheduleId) => {
    try {
      const h = await invoke('get_report_history', { scheduleId });
      setHistory(h || []);
      setShowHistory(scheduleId);
    } catch (err) {
      setToast({ type: 'error', message: `❌ فشل تحميل السجل: ${err}` });
    }
  };

  const openFolder = (path) => {
    if (window.__TAURI__ && window.__TAURI__.shell) {
      window.__TAURI__.shell.open(path);
    } else {
      setToast({ type: 'info', message: 'يمكنك فتح المجلد من مستكشف الملفات: ' + path });
    }
  };

  // ── Translation helpers ─────────────────────────────────────────────
  const reportTypeLabel = (type) => {
    const t = REPORT_TYPES.find(r => r.value === type);
    return t ? t.label : type;
  };

  const scheduleTypeLabel = (type) => {
    const t = SCHEDULE_TYPES.find(s => s.value === type);
    return t ? t.label : type;
  };

  const statusBadge = (report) => {
    if (!report.is_active) {
      return <span className="px-2 py-1 rounded-lg text-[10px] font-black bg-gray-100 text-gray-500">متوقف</span>;
    }
    if (report.last_generated) {
      return <span className="px-2 py-1 rounded-lg text-[10px] font-black bg-green-100 text-green-700">نشط</span>;
    }
    return <span className="px-2 py-1 rounded-lg text-[10px] font-black bg-blue-100 text-blue-700">مجدول</span>;
  };

  const historyStatusIcon = (status) => {
    switch (status) {
      case 'success': return <CheckCircle size={16} className="text-green-500" />;
      case 'failed': return <XCircle size={16} className="text-red-500" />;
      case 'cancelled': return <AlertCircle size={16} className="text-gray-400" />;
      case 'running': return <RefreshCw size={16} className="text-blue-500 animate-spin" />;
      default: return <AlertCircle size={16} className="text-gray-400" />;
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="التقارير المجدولة"
        subtitle="قالب محفوظ لتوليد تقرير PDF يدوياً عند الطلب — أنشئ القالب ثم اضغط ▶ تشغيل الآن (لا يُنشأ أي ملف تلقائياً)"
        icon={Clock}
      >
        <Button variant="primary" onClick={openCreate} className="flex items-center gap-2">
          <Plus size={16} />
          <span>تقرير مجدول جديد</span>
        </Button>
      </PageHeader>

      {/* ── Search & Filter ─────────────────────────────────────────── */}
      <Card>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex-1 min-w-[200px] relative">
            <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" />
            <input
              type="text"
              placeholder="بحث في التقارير المجدولة..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pr-10 pl-4 py-2.5 rounded-xl border text-sm font-bold"
              style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)' }}
              dir="rtl"
            />
          </div>
          <div className="flex items-center gap-2">
            {['all', 'active', 'inactive'].map(f => (
              <button
                key={f}
                onClick={() => setFilterActive(f)}
                className={`px-3 py-2 rounded-xl text-xs font-black transition-all cursor-pointer ${
                  filterActive === f
                    ? 'bg-[var(--color-primary)] text-white shadow-md'
                    : 'text-[var(--color-text-muted)] hover:bg-[var(--color-bg)]'
                }`}
                style={filterActive !== f ? { border: '1px solid var(--color-border)' } : {}}
              >
                {f === 'all' ? 'الكل' : f === 'active' ? 'نشط' : 'متوقف'}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* ── Reports List ────────────────────────────────────────────── */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <RefreshCw size={32} className="text-[var(--color-primary)] animate-spin" />
        </div>
      ) : filteredReports.length === 0 ? (
        <Card>
          <div className="text-center py-16">
            <Clock size={48} className="mx-auto mb-4 text-[var(--color-text-muted)] opacity-30" />
            <p className="text-lg font-black text-[var(--color-text-muted)] mb-2">
              {searchQuery ? 'لا توجد نتائج للبحث' : 'لا توجد تقارير مجدولة'}
            </p>
            <p className="text-sm text-[var(--color-text-muted)] opacity-70 mb-2 max-w-md mx-auto leading-relaxed">
              {searchQuery ? 'جرب كلمات بحث أخرى' : 'التقرير المجدول هو قالب محفوظ لإنشاء ملف PDF عند الحاجة.'}
            </p>
            {!searchQuery && (
              <p className="text-xs text-[var(--color-text-muted)] opacity-60 mb-6 max-w-sm mx-auto leading-relaxed">
                اضغط "إنشاء تقرير مجدول" لحفظ قالب، ثم اضغط ▶ "تشغيل الآن" من القائمة لتوليد PDF يدوياً في
                مجلد الإخراج. لا يُنشأ أي ملف تلقائياً.
              </p>
            )}
            {!searchQuery && (
              <Button variant="primary" onClick={openCreate}>
                <Plus size={16} className="ml-2" />
                إنشاء تقرير مجدول
              </Button>
            )}
          </div>
        </Card>
      ) : (
        <>
          {/* Batch Actions Bar */}
          {selectedIds.size > 0 && (
            <div
              className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 rounded-2xl border shadow-lg sticky top-0 z-10"
              style={{
                background: 'var(--color-bg-card)',
                borderColor: 'var(--color-primary)',
                boxShadow: '0 4px 20px rgba(8,145,178,0.15)',
              }}
            >
              <div className="flex items-center gap-3">
                <CheckSquare size={18} style={{ color: 'var(--color-primary)' }} />
                <span className="text-sm font-black" style={{ color: 'var(--color-text)' }}>
                  تم اختيار {selectedIds.size}
                </span>
                <button
                  onClick={clearSelection}
                  className="text-[10px] font-bold px-2 py-1 rounded-lg cursor-pointer"
                  style={{ color: 'var(--color-text-muted)', background: 'var(--color-bg)' }}
                >
                  إلغاء التحديد
                </button>
              </div>
              <div className="flex items-center gap-2">
                {isBatchProcessing && (
                  <div className="flex items-center gap-2 text-xs font-bold" style={{ color: 'var(--color-text-muted)' }}>
                    <div className="w-24 h-1.5 rounded-full" style={{ background: 'var(--color-border)' }}>
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${(batchProgress.current / batchProgress.total) * 100}%`,
                          background: 'var(--color-primary)',
                          transition: 'width 0.3s ease',
                        }}
                      />
                    </div>
                    <span>{batchProgress.current}/{batchProgress.total}</span>
                  </div>
                )}
                <button
                  onClick={() => batchToggle(true)}
                  disabled={isBatchProcessing}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black transition-all cursor-pointer disabled:opacity-40 disabled:cursor-wait"
                  style={{
                    background: '#05966915',
                    color: '#059669',
                    border: '1px solid #05966930',
                  }}
                >
                  <ToggleRight size={14} />
                  تفعيل الكل
                </button>
                <button
                  onClick={() => batchToggle(false)}
                  disabled={isBatchProcessing}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black transition-all cursor-pointer disabled:opacity-40 disabled:cursor-wait"
                  style={{
                    background: '#d9770615',
                    color: '#d97706',
                    border: '1px solid #d9770630',
                  }}
                >
                  <ToggleLeft size={14} />
                  إيقاف الكل
                </button>
                <button
                  onClick={batchDelete}
                  disabled={isBatchProcessing}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black transition-all cursor-pointer disabled:opacity-40 disabled:cursor-wait"
                  style={{
                    background: '#dc262615',
                    color: '#dc2626',
                    border: '1px solid #dc262630',
                  }}
                >
                  <Trash2 size={14} />
                  حذف المحدد
                </button>
              </div>
            </div>
          )}

          <div className="grid gap-4">
            {/* Select All row */}
            {filteredReports.length > 0 && (
              <div className="flex items-center gap-3 px-1">
                <button
                  onClick={toggleSelectAll}
                  className="flex items-center gap-2 cursor-pointer"
                  style={{ color: 'var(--color-text-muted)' }}
                >
                  {selectedIds.size === filteredReports.length ? (
                    <CheckSquare size={18} style={{ color: 'var(--color-primary)' }} />
                  ) : (
                    <Square size={18} />
                  )}
                  <span className="text-[11px] font-bold">
                    {selectedIds.size === filteredReports.length
                      ? 'إلغاء تحديد الكل'
                      : `تحديد الكل (${filteredReports.length})`}
                  </span>
                </button>
              </div>
            )}

            {filteredReports.map(report => (
              <Card
                key={report.id}
                hoverable
                className={`transition-all duration-200 ${
                  selectedIds.has(report.id) ? 'ring-2 ring-[var(--color-primary)]' : ''
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  {/* Checkbox + Info */}
                  <div className="flex-1 min-w-[200px] flex items-start gap-3">
                    <button
                      onClick={() => toggleSelect(report.id)}
                      className="mt-2.5 shrink-0 cursor-pointer"
                      style={{ color: 'var(--color-text-muted)' }}
                    >
                      {selectedIds.has(report.id) ? (
                        <CheckSquare size={18} style={{ color: 'var(--color-primary)' }} />
                      ) : (
                        <Square size={18} />
                      )}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[var(--color-primary)] to-purple-600 flex items-center justify-center text-white shadow-md shrink-0">
                          <FileText size={18} />
                        </div>
                        <div>
                          <h3 className="text-sm font-black text-[var(--color-text)]">{report.name}</h3>
                          <div className="flex flex-wrap items-center gap-2 mt-1">
                            {statusBadge(report)}
                            <span className="text-[10px] font-bold text-[var(--color-text-muted)]">
                              {reportTypeLabel(report.report_type)}
                            </span>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-[var(--color-bg)] text-[var(--color-text-muted)]">
                              {scheduleTypeLabel(report.schedule_type)}
                            </span>
                            {report.is_active && report.next_run && (
                              <span className="text-[10px] font-bold text-amber-600 flex items-center gap-1">
                                <Calendar size={10} />
                                التشغيل القادم: {formatDate(report.next_run)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Detail rows */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 mt-3 text-[11px] font-bold text-[var(--color-text-muted)]">
                        <div>
                          <span className="opacity-60">أيام الفترة: </span>
                          <span>من {report.day_from ?? 1} إلى {report.day_to === 0 ? 'آخر يوم' : report.day_to ?? 28}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <FolderOpen size={12} className="shrink-0" />
                          <span className="truncate" title={report.output_folder}>
                            {report.output_folder || 'غير محدد'}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 font-black text-cyan-700">
                          <span className="opacity-75">🏢 النطاق: </span>
                          <span className="truncate" title={getHierarchyLabel(report)}>
                            {getHierarchyLabel(report)}
                          </span>
                        </div>
                        {report.last_generated && (
                          <div>
                            <span className="opacity-60">آخر تشغيل: </span>
                            <span>{formatDate(report.last_generated)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => handleToggle(report.id, report.is_active)}
                      className="p-2 rounded-xl hover:bg-[var(--color-bg)] text-[var(--color-text-muted)] transition-all cursor-pointer"
                      title={report.is_active ? 'إيقاف' : 'تفعيل'}
                    >
                      {report.is_active ? <ToggleRight size={18} className="text-green-500" /> : <ToggleLeft size={18} />}
                    </button>
                    <button
                      onClick={() => openRunMonthPicker(report.id)}
                      disabled={runningId === report.id}
                      className={`p-2 rounded-xl hover:bg-[var(--color-bg)] transition-all cursor-pointer ${runningId === report.id ? 'opacity-50 cursor-wait' : 'text-blue-500'}`}
                      title="تشغيل الآن"
                    >
                      <Play size={18} className={runningId === report.id ? 'animate-pulse' : ''} />
                    </button>
                    <button
                      onClick={() => showReportHistory(report.id)}
                      className="p-2 rounded-xl hover:bg-[var(--color-bg)] text-[var(--color-text-muted)] transition-all cursor-pointer"
                      title="سجل التشغيل"
                    >
                      <History size={18} />
                    </button>
                    <button
                      onClick={() => openEdit(report)}
                      className="p-2 rounded-xl hover:bg-[var(--color-bg)] text-[var(--color-text-muted)] transition-all cursor-pointer"
                      title="تعديل"
                    >
                      <Settings size={18} />
                    </button>
                    <button
                      onClick={() => handleDelete(report.id)}
                      className="p-2 rounded-xl hover:bg-red-50 text-red-400 hover:text-red-600 transition-all cursor-pointer"
                      title="حذف"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      {/* ── Create/Edit Modal ────────────────────────────────────────── */}
      <Modal
        isOpen={showForm}
        onClose={() => setShowForm(false)}
        title={form.id ? 'تعديل التقرير المجدول' : 'إنشاء تقرير مجدول جديد'}
        size="lg"
      >
        <div className="space-y-5 p-2">
          {/* Status Message Banner with Refresh & Retry Buttons */}
          {saveStatus.message && (
            <div className={`p-4 rounded-2xl border text-xs font-black transition-all flex flex-wrap items-center justify-between gap-3 ${
              saveStatus.saving
                ? 'bg-blue-50 border-blue-200 text-blue-800'
                : saveStatus.success
                ? 'bg-emerald-50 border-emerald-300 text-emerald-800 shadow-sm'
                : 'bg-rose-50 border-rose-300 text-rose-800 shadow-sm'
            }`}>
              <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                {saveStatus.saving && <RefreshCw size={16} className="animate-spin text-blue-600 shrink-0" />}
                {saveStatus.success && <CheckCircle size={18} className="text-emerald-600 shrink-0" />}
                {saveStatus.success === false && <XCircle size={18} className="text-rose-600 shrink-0" />}
                <span className="leading-relaxed">{saveStatus.message}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={loadData}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-[11px] font-black cursor-pointer transition-all bg-white border hover:bg-gray-50 text-gray-700 shadow-sm"
                  title="تحديث واستعادة بيانات القائمة"
                >
                  <RefreshCw size={13} />
                  تحديث البيانات
                </button>
                {saveStatus.success && (
                  <button
                    onClick={() => setShowForm(false)}
                    className="px-3 py-1.5 rounded-xl text-[11px] font-black cursor-pointer transition-all bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm"
                  >
                    تم والإغلاق
                  </button>
                )}
                {saveStatus.success === false && (
                  <button
                    onClick={handleSave}
                    className="px-3 py-1.5 rounded-xl text-[11px] font-black cursor-pointer transition-all bg-rose-600 text-white hover:bg-rose-700 shadow-sm"
                  >
                    إعادة المحاولة
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <label className="block text-xs font-black text-[var(--color-text)]">اسم التقرير *</label>
            <Input
              type="text"
              value={form.name}
              onChange={(e) => {
                setForm({ ...form, name: e.target.value });
                if (formErrors.name) setFormErrors({ ...formErrors, name: null });
              }}
              placeholder="مثال: التقرير التحليلي الشهري"
              error={formErrors.name || undefined}
            />
            <p className="text-[10px] text-[var(--color-text-muted)]">
              القالب يُحفظ هنا — ثم اضغط ▶ "تشغيل الآن" لتوليد ملف PDF يدوياً (لا يُنشأ شيء تلقائياً)
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="block text-xs font-black text-[var(--color-text)]">نوع التقرير</label>
              <Select
                options={REPORT_TYPES}
                value={form.report_type}
                onChange={(e) => setForm({ ...form, report_type: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <label className="block text-xs font-black text-[var(--color-text)]">الدورية</label>
              <Select
                options={SCHEDULE_TYPES}
                value={form.schedule_type}
                onChange={(e) => setForm({ ...form, schedule_type: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="block text-xs font-black text-[var(--color-text)]">من يوم</label>
              <Input
                type="number"
                min={1}
                max={31}
                value={form.day_from}
                onChange={(e) => setForm({ ...form, day_from: Math.max(1, Math.min(31, parseInt(e.target.value, 10) || 1)) })}
              />
            </div>
            <div className="space-y-2">
              <label className="block text-xs font-black text-[var(--color-text)]">إلى يوم</label>
              <Input
                type="number"
                min={0}
                max={31}
                value={form.day_to}
                onChange={(e) => {
                  const v = e.target.value === '' ? 28 : parseInt(e.target.value, 10);
                  setForm({ ...form, day_to: Number.isNaN(v) ? 28 : Math.max(0, Math.min(31, v)) });
                }}
              />
              <p className="text-[10px] text-[var(--color-text-muted)]">أدخل 0 لآخر يوم من الشهر</p>
            </div>
            <div className="space-y-2">
              <label className="block text-xs font-black text-[var(--color-text)]">مجلد الإخراج</label>
              <Input
                type="text"
                value={form.output_folder}
                onChange={(e) => setForm({ ...form, output_folder: e.target.value })}
                placeholder="اتركه فارغاً للاستخدام الافتراضي"
                dir="ltr"
              />
              <p className="text-[10px] text-[var(--color-text-muted)]">
                اختياري — عند تركه فارغاً يُحفظ الملف في: مستندات/DrugStats/Reports
              </p>
            </div>
          </div>

          {/* Prominent Hierarchy Section */}
          <div className="rounded-2xl p-4 border bg-[var(--color-bg)] space-y-3" style={{ borderColor: 'var(--color-border)' }}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="block text-xs font-black text-[var(--color-text)]">
                🏢 نطاق التقرير (الفرع / المنطقة / العيادة)
              </label>
              <span className="text-[10px] font-bold text-[var(--color-text-muted)]">
                حدد نطاق التقرير أو اتركه لجميع الفروع
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <label className="block text-[11px] font-bold text-[var(--color-text-muted)]">الفرع</label>
                <select
                  value={form.branch_id || ''}
                  onChange={(e) => {
                    const val = e.target.value ? parseInt(e.target.value, 10) : null;
                    setForm({ ...form, branch_id: val, area_id: null, clinic_id: null });
                  }}
                  className="w-full px-3 py-2 rounded-xl border text-xs font-bold"
                  style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg-card)', color: 'var(--color-text)' }}
                >
                  <option value="">جميع الفروع</option>
                  {branches.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="block text-[11px] font-bold text-[var(--color-text-muted)]">المنطقة</label>
                <select
                  value={form.area_id || ''}
                  onChange={(e) => {
                    const val = e.target.value ? parseInt(e.target.value, 10) : null;
                    setForm({ ...form, area_id: val, clinic_id: null });
                  }}
                  className="w-full px-3 py-2 rounded-xl border text-xs font-bold"
                  style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg-card)', color: 'var(--color-text)' }}
                >
                  <option value="">جميع المناطق</option>
                  {areas.filter(a => !form.branch_id || Number(a.branch_id) === Number(form.branch_id)).map(a => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="block text-[11px] font-bold text-[var(--color-text-muted)]">العيادة</label>
                <select
                  value={form.clinic_id || ''}
                  onChange={(e) => {
                    const val = e.target.value ? parseInt(e.target.value, 10) : null;
                    setForm({ ...form, clinic_id: val });
                  }}
                  className="w-full px-3 py-2 rounded-xl border text-xs font-bold"
                  style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg-card)', color: 'var(--color-text)' }}
                >
                  <option value="">جميع العيادات</option>
                  {clinics.filter(c => !form.area_id || Number(c.area_id) === Number(form.area_id)).map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4 pt-4 border-t" style={{ borderColor: 'var(--color-border)' }}>
            <Button
              variant="primary"
              onClick={handleSave}
              disabled={saveStatus.saving}
              className="flex items-center gap-2"
            >
              {saveStatus.saving ? (
                <>
                  <RefreshCw size={16} className="animate-spin" />
                  جاري الحفظ...
                </>
              ) : (
                <>
                  <Save size={16} />
                  {form.id ? 'تحديث التقرير' : 'إنشاء التقرير'}
                </>
              )}
            </Button>
            <Button variant="secondary" onClick={() => setShowForm(false)} disabled={saveStatus.saving}>
              إلغاء
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Run-now month picker Modal ──────────────────────────────── */}
      <Modal
        isOpen={runMonthFor !== null}
        onClose={() => setRunMonthFor(null)}
        title="تشغيل التقرير — تحديد شهر البيانات"
        size="md"
      >
        <div className="space-y-5 p-2">
          <p className="text-sm font-bold text-[var(--color-text-muted)] leading-relaxed">
            اختر الشهر الذي تُحسب منه بيانات هذا التقرير. اتركه فارغاً لاستخدام الشهر الحالي.
            <br />
            <span className="text-xs opacity-70">
              شهري ← الشهر المختار | ربع سنوي ← الربع الحاوي للشهر | سنوي ← سنة الشهر
            </span>
          </p>
          <div className="space-y-2">
            <label className="block text-xs font-black text-[var(--color-text)]">شهر البيانات (YYYY-MM)</label>
            <Input
              type="month"
              value={runMonth}
              onChange={(e) => setRunMonth(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-4 pt-4 border-t" style={{ borderColor: 'var(--color-border)' }}>
            <Button variant="primary" onClick={() => handlePrepareReport(runMonthFor, runMonth)} className="flex items-center gap-2">
              <Play size={16} />
              معاينة التقرير
            </Button>
            <Button variant="secondary" onClick={() => setRunMonthFor(null)}>
              إلغاء
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Preview & Confirm Modal ─────────────────────────────────── */}
      <Modal
        isOpen={preview !== null}
        onClose={handleCancelPreview}
        title="معاينة التقرير قبل الحفظ"
        maxWidthClass={previewOrientation === 'landscape' ? 'max-w-5xl' : 'max-w-3xl'}
      >
        {preview && (
          <div className="space-y-4 p-2">
            {/* Report meta */}
            <div
              className="rounded-2xl p-4 border"
              style={{ background: 'var(--color-bg)', borderColor: 'var(--color-border)' }}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <h3 className="text-base font-black" style={{ color: 'var(--color-text)' }}>
                    {preview.data?.title || 'تقرير مجدول'}
                  </h3>
                  <p className="text-[11px] font-bold text-[var(--color-text-muted)]">
                    {preview.data?.schedule?.name || ''}
                  </p>
                </div>
                <div className="text-left space-y-0.5 text-[10px] font-bold text-[var(--color-text-muted)]">
                  <p>📅 الفترة: {preview.data?.month || '—'}</p>
                  <p>🕐 التوليد: {preview.data?.timestamp || '—'}</p>
                  <p>🏢 النطاق: {[preview.data?.branch_name, preview.data?.area_name, preview.data?.clinic_name].filter(Boolean).join(' - ') || 'جميع النطاقات'}</p>
                </div>
              </div>
              {/* Editable output folder — chose a different destination at save time */}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-1.5 text-[10px] font-black" style={{ color: 'var(--color-text-muted)' }}>
                  <FolderSearch size={12} />
                  مجلد الإخراج:
                </label>
                <input
                  type="text"
                  value={previewFolder}
                  onChange={(e) => setPreviewFolder(e.target.value)}
                  dir="ltr"
                  placeholder="مستندات/DrugStats/Reports"
                  className="flex-1 min-w-[180px] px-3 py-1.5 rounded-lg border text-[11px] font-bold"
                  style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)' }}
                />
                <Button variant="secondary" onClick={handlePickFolder} className="flex items-center gap-1.5 !px-3 !py-1.5 text-[11px]">
                  <FolderSearch size={13} />
                  استعراض
                </Button>
              </div>
            </div>

            {/* Full paper preview — identical to the printed output */}
            <div className="overflow-hidden rounded-2xl border" style={{ borderColor: 'var(--color-border)' }}>
              <div className="px-4 py-2.5 text-[11px] font-black text-white flex items-center justify-between"
                style={{ background: 'linear-gradient(135deg, #0891b2, #0e7490)' }}>
                <span className="flex items-center gap-1.5">
                  <FileText size={13} />
                  معاينة الورقة — كما ستُطبع
                </span>
                <div className="flex items-center gap-1 bg-white/15 rounded-lg p-0.5">
                  <span className="text-[9px] opacity-80 font-bold tracking-wider px-1.5">A4</span>
                  <button
                    onClick={() => setPreviewOrientation('portrait')}
                    className={`px-2.5 py-1 rounded-md text-[9px] font-black transition-all cursor-pointer ${
                      previewOrientation === 'portrait'
                        ? 'bg-white text-[#0e7490] shadow'
                        : 'text-white/90 hover:bg-white/20'
                    }`}
                    title="اتجاه عمودي"
                  >
                    عمودي
                  </button>
                  <button
                    onClick={() => setPreviewOrientation('landscape')}
                    className={`px-2.5 py-1 rounded-md text-[9px] font-black transition-all cursor-pointer ${
                      previewOrientation === 'landscape'
                        ? 'bg-white text-[#0e7490] shadow'
                        : 'text-white/90 hover:bg-white/20'
                    }`}
                    title="اتجاه أفقي"
                  >
                    أفقي
                  </button>
                </div>
              </div>
              <div
                className="p-4 sm:p-6 flex justify-center"
                style={{ background: 'repeating-conic-gradient(#e2e8f0 0% 25%, #cbd5e1 0% 50%) 50% / 20px 20px' }}
              >
                <div
                  ref={paperSheetRef}
                  className={`w-full ${previewOrientation === 'landscape' ? 'max-w-[920px]' : 'max-w-[680px]'}`}
                  style={{
                    background: '#ffffff',
                    boxShadow: '0 25px 50px -12px rgba(0,0,0,0.35)',
                    borderRadius: '2px',
                    padding: '28px 32px',
                    // A4 page proportions so the sheet visually reads as a real
                    // page in the chosen orientation (content can still grow).
                    aspectRatio: previewOrientation === 'landscape' ? '297 / 210' : '210 / 297',
                  }}
                  dir="rtl"
                >
                  <div dangerouslySetInnerHTML={{ __html: buildPaperHTML(preview.data, previewSigs, `صفحة 1 / ${paperPages}`) }} />
                </div>
              </div>
            </div>

            {previewError && (
              <div className="text-xs font-black text-red-500 bg-red-50 rounded-xl px-4 py-2.5 border border-red-200">
                ❌ {previewError}
              </div>
            )}

            <p className="text-[11px] font-bold text-[var(--color-text-muted)] leading-relaxed">
              سيُحفظ الملف كـ PDF في مجلد الإخراج أعلاه. اضغط "حفظ التقرير" للمتابعة، أو "تراجع" لإلغاء دون إنشاء أي ملف.
            </p>

            <div className="flex items-center gap-3 pt-4 border-t" style={{ borderColor: 'var(--color-border)' }}>
              <Button
                variant="secondary"
                onClick={handlePrintPreview}
                disabled={preview.saving}
                className="flex items-center gap-2 px-6 py-3"
                title="طباعة المعاينة مباشرة"
              >
                <Printer size={16} />
                طباعة
              </Button>
              <Button
                variant="primary"
                onClick={handleConfirmSave}
                disabled={preview.saving}
                className="flex items-center gap-2 flex-1 justify-center py-3"
              >
                {preview.saving ? (
                  <>
                    <RefreshCw size={16} className="animate-spin" />
                    جاري الحفظ...
                  </>
                ) : (
                  <>
                    <Save size={16} />
                    💾 حفظ التقرير
                  </>
                )}
              </Button>
              <Button variant="secondary" onClick={handleCancelPreview} className="flex items-center gap-2 px-6 py-3">
                <X size={16} />
                تراجع
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── History Modal ────────────────────────────────────────────── */}
      <Modal
        isOpen={showHistory !== null}
        onClose={() => setShowHistory(null)}
        title="سجل تشغيل التقرير"
        size="lg"
      >
        {history.length === 0 ? (
          <div className="text-center py-12">
            <History size={40} className="mx-auto mb-3 text-[var(--color-text-muted)] opacity-30" />
            <p className="font-bold text-[var(--color-text-muted)]">لا يوجد سجل تشغيل بعد</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] font-black uppercase tracking-wider text-[var(--color-text-muted)] border-b"
                  style={{ borderColor: 'var(--color-border)' }}>
                  <th className="text-right py-3 px-3">#</th>
                  <th className="text-right py-3 px-3">الحالة</th>
                  <th className="text-right py-3 px-3">وقت التشغيل</th>
                  <th className="text-right py-3 px-3">الملف</th>
                  <th className="text-right py-3 px-3">الحجم</th>
                  <th className="text-right py-3 px-3">الخطأ</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h, idx) => (
                  <tr key={h.id} className="border-b text-xs font-bold"
                    style={{ borderColor: 'var(--color-border)' }}>
                    <td className="py-3 px-3 text-[var(--color-text-muted)]">{idx + 1}</td>
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2">
                        {historyStatusIcon(h.status)}
                        <span>
                          {h.status === 'success' ? 'نجاح'
                            : h.status === 'failed' ? 'فشل'
                            : h.status === 'cancelled' ? 'أُلغي'
                            : h.status === 'running' ? 'قيد التشغيل' : h.status}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-3 text-[var(--color-text-muted)]">{formatDate(h.generated_at)}</td>
                    <td className="py-3 px-3">
                      {h.file_path ? (
                        <div className="flex items-center gap-1">
                          <span className="truncate max-w-[200px] inline-block" title={h.file_path}>
                            {h.file_path.split('\\').pop() || h.file_path}
                          </span>
                          <button
                            onClick={() => openFolder(h.file_path)}
                            className="text-blue-500 hover:text-blue-700 transition-colors"
                            title="فتح المجلد"
                          >
                            <ExternalLink size={12} />
                          </button>
                        </div>
                      ) : (
                        <span className="text-[var(--color-text-muted)]">—</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-[var(--color-text-muted)]">
                      {h.file_size > 0 ? `${h.file_size.toFixed(1)} KB` : '—'}
                    </td>
                    <td className="py-3 px-3 text-red-500 max-w-[200px] truncate" title={h.error_message}>
                      {h.error_message || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex justify-end mt-4">
          <Button variant="secondary" onClick={() => setShowHistory(null)}>إغلاق</Button>
        </div>
      </Modal>

      {/* ── Toast ────────────────────────────────────────────────────── */}
      {toast && <Toast type={toast.type} message={toast.message} onClose={() => setToast(null)} />}
    </div>
  );
};

export default ScheduledReportsPage;
