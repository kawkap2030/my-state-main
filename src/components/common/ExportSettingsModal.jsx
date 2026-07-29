import React, { useState, useEffect } from 'react';
import {
  X, FileSpreadsheet, FileText, FileType, Settings2,
  User, ShieldCheck, Hash, LayoutTemplate, Type, Maximize2,
  FileSignature, Save, Bookmark, Trash2, Star, Plus, Check, Globe
} from 'lucide-react';
import useReportSignatures from '../../hooks/useReportSignatures';
import useExportPresets from '../../hooks/useExportPresets';
import { useAuth } from '../../context/AuthContext';

const MARGIN_OPTIONS = [
  { value: 'narrow', label: 'ضيق', desc: 'هوامش 5مم — مساحة أكبر للبيانات' },
  { value: 'standard', label: 'قياسي', desc: 'هوامش 10مم — الإعداد الافتراضي' },
  { value: 'wide', label: 'واسع', desc: 'هوامش 15مم — مساحة للتذييلات' },
];

const ORIENTATION_OPTIONS = [
  { value: 'landscape', label: 'أفقي', icon: '▬', desc: '297×210مم — مناسب للجداول' },
  { value: 'portrait', label: 'رأسي', icon: '▮', desc: '210×297مم — مناسب للنصوص' },
];

const ExportSettingsModal = ({
  isOpen,
  onClose,
  exportType,         // 'excel' | 'word' | 'pdf'
  onConfirm,          // (settings) => Promise<void>
  title = 'تقرير',
  subtitle = '',
}) => {
  const { signatures } = useReportSignatures();
  const {
    presets,
    loading: _presetsLoading,
    saving: presetSaving,
    activePresetId,
    setActivePresetId,
    getPresetById,
    presetToSettings,
    savePreset,
    deletePreset,
    canDelete,
    _canChangeScope,
  } = useExportPresets();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  // ── Settings state ──────────────────────────────────────────────────
  const [orientation, setOrientation] = useState('landscape');
  const [marginPreset, setMarginPreset] = useState('standard');
  const [showPageNumbers, setShowPageNumbers] = useState(true);
  const [showSignatures, setShowSignatures] = useState(true);
  const [preparerName, setPreparerName] = useState('');
  const [managerName, setManagerName] = useState('');
  const [approvalNumber, setApprovalNumber] = useState('');
  const [exporting, setExporting] = useState(false);
  const [showSavePreset, setShowSavePreset] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');
  const [newPresetScope, setNewPresetScope] = useState('private');
  const [presetToast, setPresetToast] = useState('');

  // ── Load settings when modal opens ──────────────────────────────────
   
  useEffect(() => {
    if (!isOpen) return;
    // Try to load from the default preset first
    const defaultPreset = presets.find(p => p.is_default);
    if (defaultPreset) {
      const settings = presetToSettings(defaultPreset);
      if (settings) applySettings(settings);
    } else if (signatures) {
      setPreparerName(signatures.preparerName || user?.username || '');
      setManagerName(signatures.managerName || '');
      setApprovalNumber(signatures.approvalNumber || '');
    }
    setShowSavePreset(false);
    setNewPresetName('');
    setNewPresetScope('private');
    setPresetToast('');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // ── Apply a preset to all settings fields ───────────────────────────
  const applySettings = (settings) => {
    if (!settings) return;
    setOrientation(settings.orientation || 'landscape');
    setMarginPreset(settings.marginPreset || 'standard');
    setShowPageNumbers(settings.showPageNumbers !== false);
    setShowSignatures(settings.showSignatures !== false);
    setPreparerName(settings.signatures?.preparerName || user?.username || '');
    setManagerName(settings.signatures?.managerName || '');
    setApprovalNumber(settings.signatures?.approvalNumber || '');
  };

  // ── Load a preset when user selects from dropdown ──────────────────
  const handlePresetSelect = (presetId) => {
    const preset = getPresetById(presetId);
    if (preset) {
      const settings = presetToSettings(preset);
      applySettings(settings);
      setActivePresetId(presetId);
      setPresetToast(`تم تحميل: ${preset.name}`);
      setTimeout(() => setPresetToast(''), 2000);
    }
  };

  // ── Save current settings as a new preset ───────────────────────────
  const handleSavePreset = async () => {
    if (!newPresetName.trim()) return;
    try {
      await savePreset({
        name: newPresetName.trim(),
        scope: isAdmin ? newPresetScope : 'private',
        orientation,
        marginPreset,
        showPageNumbers,
        showSignatures,
        preparerName: preparerName || user?.username || '',
        managerName: managerName || '',
        approvalNumber: approvalNumber || '',
        isDefault: presets.length === 0,
      });
      setNewPresetName('');
      setShowSavePreset(false);
      setPresetToast('✅ تم حفظ الإعدادات كـ "' + newPresetName.trim() + '"');
      setTimeout(() => setPresetToast(''), 2500);
    } catch (err) {
      setPresetToast('❌ فشل الحفظ');
    }
  };

  if (!isOpen) return null;

  // ── Icons + meta per export type ────────────────────────────────────
  const TYPE_META = {
    excel: { icon: FileSpreadsheet, color: '#059669', bgColor: 'rgba(5,150,105,0.1)', label: 'Excel (.xlsx)' },
    word:  { icon: FileText, color: '#2563eb', bgColor: 'rgba(37,99,235,0.1)', label: 'Word (.doc)' },
    pdf:   { icon: FileType, color: '#dc2626', bgColor: 'rgba(220,38,38,0.1)', label: 'PDF (.pdf)' },
  };
  const meta = TYPE_META[exportType] || TYPE_META.pdf;
  const Icon = meta.icon;

  const handleConfirm = async () => {
    setExporting(true);
    try {
      await onConfirm({
        orientation,
        marginPreset,
        showPageNumbers,
        showSignatures,
        signatures: {
          preparerName: preparerName || user?.username || '',
          managerName: managerName || '',
          approvalNumber: approvalNumber || '',
        },
      });
      onClose();
    } catch (err) {
      // Error is handled by caller
      console.error('Export failed:', err);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[150] flex items-center justify-center p-4"
      style={{ background: 'rgba(15, 23, 42, 0.5)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="bg-[var(--color-bg-card)] rounded-2xl w-full max-w-xl overflow-hidden shadow-2xl"
        style={{ animation: 'fadeIn 0.2s ease', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
        onClick={e => e.stopPropagation()}
        dir="rtl"
      >
        {/* ═══ Header ═══ */}
        <div
          className="flex items-center justify-between px-6 py-4 shrink-0"
          style={{ borderBottom: '1px solid var(--color-border)' }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: meta.bgColor, color: meta.color }}
            >
              <Settings2 size={20} />
            </div>
            <div>
              <h3 className="text-base font-bold" style={{ color: 'var(--color-text)' }}>
                إعدادات التصدير
              </h3>
              <p className="text-[10px] font-bold" style={{ color: 'var(--color-text-muted)' }}>
                {title}{subtitle ? ` — ${subtitle}` : ''} ← {meta.label}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl cursor-pointer transition-colors"
            style={{ color: 'var(--color-text-muted)' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-bg)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
          >
            <X size={18} />
          </button>
        </div>

        {/* ═══ Body (Scrollable) ═══ */}
        <div className="overflow-y-auto p-6 space-y-5" style={{ flex: 1 }}>

          {/* ── Section: Presets ── */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="flex items-center gap-2 text-xs font-bold" style={{ color: 'var(--color-text-muted)' }}>
                <Bookmark size={14} />
                الإعدادات المحفوظة
              </h4>
              <div className="flex items-center gap-2">
                {isAdmin && (
                  <span
                    className="px-2 py-0.5 rounded-md text-[8px] font-bold"
                    style={{
                      background: 'var(--color-purple-bg)',
                      color: 'var(--color-purple)',
                      border: '1px solid var(--color-purple)',
                    }}
                  >
                    👑 مشرف
                  </span>
                )}
                <button
                  onClick={() => setShowSavePreset(!showSavePreset)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer"
                  style={{
                    background: showSavePreset ? 'var(--color-primary)' : 'var(--color-bg)',
                    color: showSavePreset ? '#fff' : 'var(--color-text-muted)',
                    border: '1px solid var(--color-border)',
                  }}
                >
                  <Plus size={12} />
                  <span>حفظ الإعدادات الحالية</span>
                </button>
              </div>
            </div>

            {/* Preset selector */}
            <div className="flex gap-2 flex-wrap mb-2">
              {presets.map(preset => {
                const isSharedPreset = preset.scope === 'public';
                const isMyPreset = preset.user_id === user?.id;
                const canDeleteThis = canDelete(preset);

                return (
                  <div key={preset.id} className="flex items-center gap-1">
                    <button
                      onClick={() => handlePresetSelect(preset.id)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                        activePresetId === preset.id
                          ? 'bg-[var(--color-primary)] text-white shadow-sm'
                          : 'border border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-bg)]'
                      }`}
                    >
                      {preset.is_default && <Star size={10} className="text-amber-400" />}
                      {isSharedPreset && !isMyPreset && (
                        <span
                          className="text-[8px] px-1 py-0.5 rounded"
                          style={{
                            background: 'rgba(124,58,237,0.15)',
                            color: 'var(--color-purple)',
                          }}
                        >
                          عام
                        </span>
                      )}
                      {isSharedPreset && isMyPreset && (
                        <span
                          className="text-[8px] px-1 py-0.5 rounded"
                          style={{
                            background: 'rgba(8,145,178,0.15)',
                            color: 'var(--color-primary)',
                          }}
                        >
                          عام
                        </span>
                      )}
                      <span>{preset.name}</span>
                      {preset.user_name && isSharedPreset && !isMyPreset && (
                        <span className="text-[8px] opacity-60" style={{ color: 'var(--color-text-muted)' }}>
                          {preset.user_name}
                        </span>
                      )}
                      {activePresetId === preset.id && <Check size={10} />}
                    </button>
                    {canDeleteThis && (
                      <button
                        onClick={async () => {
                          try {
                            await deletePreset(preset.id);
                            setPresetToast(`🗑️ تم حذف: ${preset.name}`);
                            setTimeout(() => setPresetToast(''), 2000);
                          } catch (err) {
                            setPresetToast('❌ فشل الحذف');
                          }
                        }}
                        className="p-1 rounded-md hover:bg-[var(--color-danger-bg)] transition-all cursor-pointer"
                        style={{ color: 'var(--color-danger)', opacity: 0.4 }}
                        title="حذف هذا الإعداد"
                      >
                        <Trash2 size={10} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Save new preset form */}
            {showSavePreset && (
              <div
                className="p-3 rounded-xl flex flex-col gap-2"
                style={{ background: 'var(--color-bg)', border: '1px dashed var(--color-border)' }}
              >
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newPresetName}
                    onChange={e => setNewPresetName(e.target.value)}
                    placeholder="اسم الإعداد الجديد..."
                    className="neu-input flex-1 text-sm"
                    style={{ textAlign: 'right', padding: '6px 10px', fontSize: '12px' }}
                    onKeyDown={e => e.key === 'Enter' && handleSavePreset()}
                    autoFocus
                  />
                  <button
                    onClick={handleSavePreset}
                    disabled={!newPresetName.trim() || presetSaving}
                    className="px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer"
                    style={{
                      background: newPresetName.trim() ? 'var(--color-primary)' : 'var(--color-border)',
                      color: '#fff',
                      opacity: newPresetName.trim() ? 1 : 0.5,
                    }}
                  >
                    {presetSaving ? 'جاري...' : 'حفظ'}
                  </button>
                </div>
                {/* Scope toggle for admins */}
                {isAdmin && (
                  <label className="flex items-center gap-2 text-[10px] font-bold cursor-pointer" style={{ color: 'var(--color-text-muted)' }}>
                    <input
                      type="checkbox"
                      defaultChecked={false}
                      onChange={e => setNewPresetScope(e.target.checked ? 'public' : 'private')}
                      className="rounded"
                      style={{ accentColor: 'var(--color-purple)' }}
                    />
                    <Globe size={12} />
                    <span>Preset عام — يراه جميع المستخدمين</span>
                  </label>
                )}
              </div>
            )}

            {/* Preset toast */}
            {presetToast && (
              <p className="text-[10px] font-bold mt-1 animate-fadeIn" style={{ color: 'var(--color-text-muted)' }}>
                {presetToast}
              </p>
            )}
          </div>

          {/* ── Section: التوقيعات ── */}
          <div>
            <h4 className="flex items-center gap-2 text-xs font-bold mb-3" style={{ color: 'var(--color-text-muted)' }}>
              <FileSignature size={14} />
              التوقيع الرقمي
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-[10px] font-bold mb-1" style={{ color: 'var(--color-text-muted)' }}>
                  <User size={12} className="inline ml-1" />
                  مُعد التقرير
                </label>
                <input
                  type="text"
                  value={preparerName}
                  onChange={e => setPreparerName(e.target.value)}
                  placeholder={user?.username || 'الاسم...'}
                  className="neu-input w-full text-sm"
                  style={{ textAlign: 'right', padding: '8px 12px' }}
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold mb-1" style={{ color: 'var(--color-text-muted)' }}>
                  <ShieldCheck size={12} className="inline ml-1" />
                  مدير الصيدلية
                </label>
                <input
                  type="text"
                  value={managerName}
                  onChange={e => setManagerName(e.target.value)}
                  placeholder="الاسم..."
                  className="neu-input w-full text-sm"
                  style={{ textAlign: 'right', padding: '8px 12px' }}
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold mb-1" style={{ color: 'var(--color-text-muted)' }}>
                  <Hash size={12} className="inline ml-1" />
                  رقم الاعتماد
                </label>
                <input
                  type="text"
                  value={approvalNumber}
                  onChange={e => setApprovalNumber(e.target.value)}
                  placeholder="اختياري..."
                  className="neu-input w-full text-sm"
                  style={{ textAlign: 'right', padding: '8px 12px' }}
                />
              </div>
            </div>
          </div>

          {/* ── Section: تنسيق الورقة ── */}
          <div>
            <h4 className="flex items-center gap-2 text-xs font-bold mb-3" style={{ color: 'var(--color-text-muted)' }}>
              <LayoutTemplate size={14} />
              تنسيق الورقة
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Orientation */}
              <div>
                <label className="block text-[10px] font-bold mb-2" style={{ color: 'var(--color-text-muted)' }}>
                  الاتجاه
                </label>
                <div className="flex gap-2">
                  {ORIENTATION_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setOrientation(opt.value)}
                      className={`flex-1 flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        orientation === opt.value
                          ? 'bg-[var(--color-primary)] text-white shadow-md'
                          : 'text-[var(--color-text-muted)] hover:bg-[var(--color-border)]'
                      }`}
                      title={opt.desc}
                    >
                      <span className="text-lg">{opt.icon}</span>
                      <span>{opt.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Margins */}
              <div>
                <label className="block text-[10px] font-bold mb-2" style={{ color: 'var(--color-text-muted)' }}>
                  <Maximize2 size={12} className="inline ml-1" />
                  الهوامش
                </label>
                <div className="flex gap-1.5">
                  {MARGIN_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setMarginPreset(opt.value)}
                      className={`flex-1 px-2 py-2.5 rounded-xl text-[10px] font-bold transition-all cursor-pointer ${
                        marginPreset === opt.value
                          ? 'bg-[var(--color-primary)] text-white shadow-md'
                          : 'text-[var(--color-text-muted)] hover:bg-[var(--color-border)]'
                      }`}
                      title={`${opt.label} — ${opt.desc}`}
                    >
                      <span className="block">{opt.label}</span>
                      <span className="block text-[8px] opacity-70">{opt.value === 'narrow' ? '5مم' : opt.value === 'standard' ? '10مم' : '15مم'}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ── Section: خيارات إضافية ── */}
          <div>
            <h4 className="flex items-center gap-2 text-xs font-bold mb-3" style={{ color: 'var(--color-text-muted)' }}>
              <Type size={14} />
              خيارات إضافية
            </h4>
            <div className="flex flex-wrap gap-3">
              {/* Page Numbers Toggle */}
              <button
                onClick={() => setShowPageNumbers(!showPageNumbers)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  showPageNumbers
                    ? 'bg-[var(--color-primary)] text-white shadow-sm'
                    : 'border border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-bg)]'
                }`}
              >
                <span>🔢</span>
                <span>ترقيم الصفحات</span>
              </button>

              {/* Signatures Toggle */}
              <button
                onClick={() => setShowSignatures(!showSignatures)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  showSignatures
                    ? 'bg-[var(--color-primary)] text-white shadow-sm'
                    : 'border border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-bg)]'
                }`}
              >
                <span>✍️</span>
                <span>التوقيعات</span>
              </button>
            </div>
          </div>

          {/* ── Preview Summary ── */}
          <div
            className="p-3 rounded-xl text-[10px] space-y-1"
            style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}
          >
            <p style={{ color: 'var(--color-text-muted)' }}>
              <span className="font-bold">ملخص الإعدادات:</span>
            </p>
            <p style={{ color: 'var(--color-text-muted)' }}>
              • الاتجاه: <strong>{orientation === 'landscape' ? 'أفقي' : 'رأسي'}</strong>
              {' | '}
              الهوامش: <strong>{MARGIN_OPTIONS.find(m => m.value === marginPreset)?.label}</strong>
              {' | '}
              {showPageNumbers ? '✓ ترقيم' : '✗ ترقيم'}
              {' | '}
              {showSignatures ? '✓ توقيعات' : '✗ توقيعات'}
            </p>
            {preparerName && (
              <p style={{ color: 'var(--color-text-muted)' }}>
                • المُعد: <strong>{preparerName}</strong>
                {managerName ? ` | المدير: ${managerName}` : ''}
                {approvalNumber ? ` | رقم الاعتماد: ${approvalNumber}` : ''}
              </p>
            )}
          </div>
        </div>

        {/* ═══ Footer ═══ */}
        <div
          className="flex items-center justify-between px-6 py-4 shrink-0 gap-3"
          style={{ borderTop: '1px solid var(--color-border)', background: 'var(--color-bg)' }}
        >
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl font-bold text-xs transition-all cursor-pointer"
            style={{
              background: 'transparent',
              color: 'var(--color-text-muted)',
              border: '1px solid var(--color-border)',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-border)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
          >
            إلغاء
          </button>
          <button
            onClick={handleConfirm}
            disabled={exporting}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-sm transition-all cursor-pointer"
            style={{
              background: exporting
                ? 'var(--color-border)'
                : `linear-gradient(135deg, ${meta.color}, ${meta.color}dd)`,
              color: '#fff',
              boxShadow: exporting ? 'none' : `0 4px 14px ${meta.color}44`,
              opacity: exporting ? 0.6 : 1,
            }}
          >
            {exporting ? (
              <>
                <div
                  className="w-4 h-4 border-2 rounded-full animate-spin"
                  style={{ borderColor: 'rgba(255,255,255,0.3)', borderTopColor: '#fff' }}
                />
                جاري التصدير...
              </>
            ) : (
              <>
                <Save size={16} />
                <span>تصدير {meta.label.split(' ')[0]}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ExportSettingsModal;
