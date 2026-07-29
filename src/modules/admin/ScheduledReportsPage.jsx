import React, { useState, useEffect, useCallback } from 'react';
import {
  Clock, Plus, Trash2, Play, ToggleLeft, ToggleRight,
  FileText, Calendar, FolderOpen, ChevronDown, ExternalLink,
  RefreshCw, AlertCircle, CheckCircle, XCircle, History,
  Download, Search, Settings, Save, X, CheckSquare, Square
} from 'lucide-react';
import { invoke } from '../../api/tauriApi';
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
  day_of_month: 1,
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
  const [form, setForm] = useState(INITIAL_FORM);
  const [toast, setToast] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterActive, setFilterActive] = useState('all'); // 'all', 'active', 'inactive'
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 });

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
        setReports(prev => prev.map(r => r.id === updated.id ? updated : r));
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
    setReports(prev => prev.filter(r => !ids.includes(r.id)));
    setSelectedIds(new Set());
    setToast({
      type: failCount === 0 ? 'success' : 'warning',
      message: `🗑️ تم حذف ${successCount} تقرير${failCount > 0 ? `، فشل ${failCount}` : ''}`
    });
  };

  // ── Load initial data ───────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [r, b, a, c] = await Promise.all([
        invoke('get_scheduled_reports'),
        invoke('get_branches'),
        invoke('get_areas'),
        invoke('get_clinics'),
      ]);
      setReports(r || []);
      setBranches(b || []);
      setAreas(a || []);
      setClinics(c || []);
    } catch (err) {
      setToast({ type: 'error', message: `فشل تحميل البيانات: ${err}` });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

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
      name: report.name,
      report_type: report.report_type,
      schedule_type: report.schedule_type,
      day_of_month: report.day_of_month,
      output_folder: report.output_folder,
      branch_id: report.branch_id,
      area_id: report.area_id,
      clinic_id: report.clinic_id,
      is_active: report.is_active,
    });
    setShowForm(true);
  };

  // ── Open create form ────────────────────────────────────────────────
  const openCreate = () => {
    setForm(INITIAL_FORM);
    setShowForm(true);
  };

  // ── Save schedule ───────────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.name.trim()) {
      setToast({ type: 'error', message: 'الرجاء إدخال اسم التقرير' });
      return;
    }
    if (!form.output_folder.trim()) {
      setToast({ type: 'error', message: 'الرجاء تحديد مجلد الإخراج' });
      return;
    }
    try {
      const saved = await invoke('save_scheduled_report', {
        id: form.id,
        name: form.name.trim(),
        report_type: form.report_type,
        schedule_type: form.schedule_type,
        day_of_month: form.day_of_month,
        output_folder: form.output_folder.trim(),
        branch_id: form.branch_id,
        area_id: form.area_id,
        clinic_id: form.clinic_id,
        is_active: form.is_active,
      });
      setReports(prev => {
        const idx = prev.findIndex(r => r.id === saved.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = saved;
          return next;
        }
        return [...prev, saved];
      });
      setToast({ type: 'success', message: form.id ? '✅ تم تحديث التقرير المجدول' : '✅ تم إنشاء التقرير المجدول' });
      setShowForm(false);
    } catch (err) {
      setToast({ type: 'error', message: `❌ فشل الحفظ: ${err}` });
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
      const updated = await invoke('toggle_scheduled_report', { id, is_active: !is_active });
      setReports(prev => prev.map(r => r.id === updated.id ? updated : r));
      setToast({ type: 'success', message: !is_active ? '▶️ تم تفعيل التقرير' : '⏸️ تم إيقاف التقرير' });
    } catch (err) {
      setToast({ type: 'error', message: `❌ فشل التبديل: ${err}` });
    }
  };

  // ── Run now ─────────────────────────────────────────────────────────
  const handleRunNow = async (id) => {
    setRunningId(id);
    try {
      const result = await invoke('run_scheduled_report_now', { scheduleId: id });
      setToast({
        type: result.success ? 'success' : 'error',
        message: result.message,
      });
      loadData(); // refresh to get updated state
    } catch (err) {
      setToast({ type: 'error', message: `❌ فشل التشغيل: ${err}` });
    } finally {
      setRunningId(null);
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
      case 'running': return <RefreshCw size={16} className="text-blue-500 animate-spin" />;
      default: return <AlertCircle size={16} className="text-gray-400" />;
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="التقارير المجدولة"
        subtitle="إدارة وإنشاء وتشغيل التقارير الدورية التلقائية (شهرية، ربع سنوية، سنوية)"
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
            <p className="text-sm text-[var(--color-text-muted)] opacity-70 mb-6">
              {searchQuery ? 'جرب كلمات بحث أخرى' : 'أنشئ أول تقرير مجدول لك الآن'}
            </p>
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
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 mt-3 text-[11px] font-bold text-[var(--color-text-muted)]">
                        <div>
                          <span className="opacity-60">اليوم من الشهر: </span>
                          <span>{report.day_of_month <= 0 ? 'آخر يوم' : report.day_of_month}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <FolderOpen size={12} className="shrink-0" />
                          <span className="truncate" title={report.output_folder}>
                            {report.output_folder || 'غير محدد'}
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
                      onClick={() => handleRunNow(report.id)}
                      disabled={runningId === report.id}
                      className={`p-2 rounded-xl hover:bg-[var(--color-bg)] transition-all cursor-pointer ${
                        runningId === report.id ? 'opacity-50 cursor-wait' : 'text-blue-500'
                      }`}
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
          <div className="space-y-2">
            <label className="block text-xs font-black text-[var(--color-text)]">اسم التقرير *</label>
            <Input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="مثال: التقرير التحليلي الشهري"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="block text-xs font-black text-[var(--color-text)]">نوع التقرير</label>
              <Select
                value={form.report_type}
                onChange={(e) => setForm({ ...form, report_type: e.target.value })}
              >
                {REPORT_TYPES.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <label className="block text-xs font-black text-[var(--color-text)]">الدورية</label>
              <Select
                value={form.schedule_type}
                onChange={(e) => setForm({ ...form, schedule_type: e.target.value })}
              >
                {SCHEDULE_TYPES.map(s => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="block text-xs font-black text-[var(--color-text)]">يوم من الشهر</label>
              <Input
                type="number"
                min={0}
                max={28}
                value={form.day_of_month}
                onChange={(e) => setForm({ ...form, day_of_month: parseInt(e.target.value) || 1 })}
              />
              <p className="text-[10px] text-[var(--color-text-muted)]">أدخل 0 لآخر يوم من الشهر</p>
            </div>
            <div className="space-y-2">
              <label className="block text-xs font-black text-[var(--color-text)]">مجلد الإخراج *</label>
              <Input
                type="text"
                value={form.output_folder}
                onChange={(e) => setForm({ ...form, output_folder: e.target.value })}
                placeholder="مثال: C:\Reports"
                dir="ltr"
              />
            </div>
          </div>

          {/* Hierarchy filters */}
          <details className="group">
            <summary className="flex items-center gap-2 text-xs font-black text-[var(--color-text-muted)] cursor-pointer hover:text-[var(--color-primary)] transition-colors">
              <ChevronDown size={14} className="group-open:rotate-180 transition-transform" />
              تصفية حسب التسلسل الهرمي (اختياري)
            </summary>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
              <div className="space-y-2">
                <label className="block text-xs font-bold text-[var(--color-text-muted)]">الفرع</label>
                <select
                  value={form.branch_id || ''}
                  onChange={(e) => setForm({ ...form, branch_id: e.target.value ? parseInt(e.target.value) : null })}
                  className="w-full px-3 py-2.5 rounded-xl border text-sm font-bold"
                  style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)' }}
                >
                  <option value="">جميع الفروع</option>
                  {branches.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="block text-xs font-bold text-[var(--color-text-muted)]">المنطقة</label>
                <select
                  value={form.area_id || ''}
                  onChange={(e) => setForm({ ...form, area_id: e.target.value ? parseInt(e.target.value) : null })}
                  className="w-full px-3 py-2.5 rounded-xl border text-sm font-bold"
                  style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)' }}
                >
                  <option value="">جميع المناطق</option>
                  {areas.filter(a => !form.branch_id || a.branch_id === form.branch_id).map(a => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="block text-xs font-bold text-[var(--color-text-muted)]">العيادة</label>
                <select
                  value={form.clinic_id || ''}
                  onChange={(e) => setForm({ ...form, clinic_id: e.target.value ? parseInt(e.target.value) : null })}
                  className="w-full px-3 py-2.5 rounded-xl border text-sm font-bold"
                  style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)' }}
                >
                  <option value="">جميع العيادات</option>
                  {clinics.filter(c => !form.area_id || c.area_id === form.area_id).map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </details>

          <div className="flex items-center gap-4 pt-4 border-t" style={{ borderColor: 'var(--color-border)' }}>
            <Button variant="primary" onClick={handleSave} className="flex items-center gap-2">
              <Save size={16} />
              {form.id ? 'تحديث' : 'إنشاء'}
            </Button>
            <Button variant="secondary" onClick={() => setShowForm(false)}>
              إلغاء
            </Button>
          </div>
        </div>
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
                          {h.status === 'success' ? 'نجاح' : h.status === 'failed' ? 'فشل' : h.status === 'running' ? 'قيد التشغيل' : h.status}
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
