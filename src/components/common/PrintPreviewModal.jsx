/**
 * PrintPreviewModal — Unified print preview and settings modal.
 *
 * Merges the old PrintPreviewModal and PrintSettingsModal into one
 * comprehensive modal with:
 *   - Orientation (portrait / landscape)
 *   - Font size (small / medium / large)
 *   - Margin presets (standard / narrow / wide)
 *   - Page numbering toggle
 *   - Signatures toggle
 *   - Zoom slider
 *   - Live preview of the report content
 */
import React, { useState, useRef, useEffect } from 'react';
import {
  X, Printer, ZoomIn, ZoomOut, LayoutTemplate,
  Type, AlignLeft, Hash, Signature, ChevronDown,
  Monitor, Smartphone, FileDown, Edit3, User, ShieldCheck,
  Save, Bookmark, Star, Check, Trash2, Plus
} from 'lucide-react';
import { executePrint } from '../../utils/exportPrint';
import { exportToPDF } from '../../utils/exportPdf';
import { useToast } from '../ui/Toast';
import useExportPresets from '../../hooks/useExportPresets';
import { extractSignaturesFromPresets } from '../../hooks/useReportSignatures';
import invoke from '../../api/tauriApi';

const MARGIN_PRESETS = {
  narrow: { top: 5, bottom: 5, left: 5, right: 5, label: 'ضيق', desc: '5 مم' },
  standard: { top: 10, bottom: 10, left: 8, right: 8, label: 'قياسي', desc: '10 مم' },
  wide: { top: 15, bottom: 15, left: 12, right: 12, label: 'واسع', desc: '15 مم' },
};

const PrintPreviewModal = ({
  isOpen,
  onClose,
  title = 'معاينة التقرير',
  subtitle = '',
  hierarchyLabel = '',
  signatures = {}, // { preparerName, managerName, approvalNumber }
  children,
  onPrint,
  exportData = null,      // raw data array for PDF export (optional)
  exportColumns = null,   // [{header, accessor}] for PDF export (optional)
  tables = null,
}) => {
  const [orientation, setOrientation] = useState('landscape');
  const [fontSize, setFontSize] = useState('md');
  const [marginPreset, setMarginPreset] = useState('standard');
  const [showPageNumbers, setShowPageNumbers] = useState(true);
  const [showSignatures, setShowSignatures] = useState(true);
  const [zoom, setZoom] = useState(55);
  const [pdfExporting, setPdfExporting] = useState(false);
  const [showSignaturePanel, setShowSignaturePanel] = useState(false);
  const [localPreparerName, setLocalPreparerName] = useState('');
  const [localManagerName, setLocalManagerName] = useState('');
  const [localApprovalNumber, setLocalApprovalNumber] = useState('');
  const [sigSaving, setSigSaving] = useState(false);
  const [sigToast, setSigToast] = useState('');
  const [showSaveAsNew, setShowSaveAsNew] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');
  const previewRef = useRef(null);
  const toast = useToast();

  const {
    presets,
    savePreset: saveExportPreset,
    getPresetById,
    presetToSettings,
    canDelete,
    deletePreset,
    activePresetId,
    setActivePresetId,
  } = useExportPresets();

  // ── Load signatures into React state when modal opens ───────────────
  // This is the KEY fix: by storing in React state (not DOM manipulation),
  // React reconciliation preserves the names during re-renders.
  const [printSigs, setPrintSigs] = useState(null);

  useEffect(() => {
    if (!isOpen) {
      setPrintSigs(null);
      return;
    }

    let cancelled = false;
    const loadSigs = async () => {
      try {
        const presetsData = await Promise.race([
          invoke('get_export_presets', { userId: null, isAdmin: true }),
          new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 2000)),
        ]);
        if (cancelled) return;
        const sigs = extractSignaturesFromPresets(presetsData);
        if (sigs && (sigs.preparerName || sigs.managerName || sigs.approvalNumber)) {
          setPrintSigs(sigs);
        }
      } catch (_) {}
    };

    loadSigs();
    return () => { cancelled = true; };
  }, [isOpen]);

  const defaultPreset = presets.find(p => p.is_default);
  const mergedSignatures = {
    preparerName: printSigs?.preparerName || defaultPreset?.preparer_name || signatures.preparerName || '',
    managerName: printSigs?.managerName || defaultPreset?.manager_name || signatures.managerName || '',
    approvalNumber: printSigs?.approvalNumber || defaultPreset?.approval_number || signatures.approvalNumber || '',
  };

  // Sync local signature fields only when panel OPENS (not on every data change)
  useEffect(() => {
    if (showSignaturePanel) {
      setLocalPreparerName(mergedSignatures.preparerName);
      setLocalManagerName(mergedSignatures.managerName);
      setLocalApprovalNumber(mergedSignatures.approvalNumber);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showSignaturePanel]);



  // ── Save signature + preset from inline panel ────────────────────────
  const handleSignaturesInlineSave = async () => {
    if (!localPreparerName.trim()) return;
    setSigSaving(true);
    try {
      await saveExportPreset({
        name: 'التوقيع الافتراضي',
        scope: 'public',
        orientation,
        marginPreset,
        showPageNumbers,
        showSignatures,
        preparerName: localPreparerName,
        managerName: localManagerName,
        approvalNumber: localApprovalNumber,
        isDefault: true,
      });
      setSigToast('✅ تم حفظ التوقيع الرقمي');
      setTimeout(() => setSigToast(''), 2000);
    } catch (err) {
      setSigToast('❌ فشل الحفظ: ' + (err.message || err));
    } finally {
      setSigSaving(false);
    }
  };

  // ── Load a preset into the signature fields ──────────────────────────
  const handleInlinePresetSelect = (presetId) => {
    const preset = getPresetById(presetId);
    if (preset) {
      const settings = presetToSettings(preset);
      if (settings) {
        setLocalPreparerName(settings.signatures?.preparerName || '');
        setLocalManagerName(settings.signatures?.managerName || '');
        setLocalApprovalNumber(settings.signatures?.approvalNumber || '');
      }
      setActivePresetId(presetId);
      setSigToast(`تم تحميل: ${preset.name}`);
      setTimeout(() => setSigToast(''), 2000);
    }
  };

  // ── Save current signature as a NEW named preset ──────────────────────
  // NOTE: savePreset in useExportPresets already calls loadPresets() internally,
  // so we do NOT need a redundant loadPresets() call here.
  const handleSaveAsNewPreset = async () => {
    if (!newPresetName.trim() || !localPreparerName.trim()) return;
    setSigSaving(true);
    const savedName = newPresetName.trim();
    try {
      await saveExportPreset({
        name: savedName,
        scope: 'private',
        orientation,
        marginPreset,
        showPageNumbers,
        showSignatures,
        preparerName: localPreparerName,
        managerName: localManagerName,
        approvalNumber: localApprovalNumber,
        isDefault: false,
      });
      setNewPresetName('');
      setShowSaveAsNew(false);
      setSigToast(`✅ تم الحفظ كـ "${savedName}"`);
      setTimeout(() => setSigToast(''), 2000);
    } catch (err) {
      setSigToast('❌ فشل الحفظ');
    } finally {
      setSigSaving(false);
    }
  };

  if (!isOpen) return null;

  const margins = MARGIN_PRESETS[marginPreset];

  const handlePrint = () => {
    // Signatures are already in React state (loaded by useEffect when modal opens)
    // and rendered via mergedSignatures in JSX. No DOM manipulation needed.
    const printSettings = {
      orientation,
      fontSize,
      margins: marginPreset,
      showPageNumbers,
      showSignatures,
      fromModal: true,
    };

    if (onPrint) {
      onPrint(printSettings);
    } else {
      executePrint(printSettings, () => {
        onClose();
      });
    }
  };

  // Paper dimensions in mm based on orientation
  const paperWidth = orientation === 'landscape' ? 297 : 210;
  const paperHeight = orientation === 'landscape' ? 210 : 297;

  const previewStyle = {
    width: `${paperWidth}mm`,
    minHeight: `${paperHeight}mm`,
    transform: `scale(${zoom / 100})`,
    transformOrigin: 'top center',
    fontSize:
      fontSize === 'sm' ? '10px' :
      fontSize === 'lg' ? '14px' : '12px',
    background: '#ffffff',
    color: '#000000',
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
    borderRadius: '2px',
    padding: `${margins.top}mm ${margins.right}mm ${margins.bottom}mm ${margins.left}mm`,
    position: 'relative',
  };

  const iconBtnClass =
    'p-2 bg-slate-800 hover:bg-slate-700 rounded-lg transition-all cursor-pointer';
  const activeBtnClass =
    'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-lg';
  const inactiveBtnClass = 'text-slate-400 hover:text-white';

  return (
    <div
      id="print-preview-modal"
      className="fixed inset-0 z-[200] flex flex-col"
      style={{
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
        direction: 'rtl',
      }}
    >
      {/* ═══ Toolbar ═══ */}
      <div className="no-print flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: '#334155' }}>
        {/* Left: Title */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg">
            <Printer className="text-white" size={18} />
          </div>
          <div>
            <h2 className="text-base font-black text-white">{title}</h2>
            {subtitle && (
              <p className="text-[10px] text-slate-400">{subtitle}</p>
            )}
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-4">
          {/* 1. Orientation */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-slate-500 font-bold hidden lg:inline">الاتجاه</span>
            <div className="flex bg-slate-800/80 p-0.5 rounded-lg" style={{ border: '1px solid #334155' }}>
              {['landscape', 'portrait'].map((opt) => (
                <button
                  key={opt}
                  onClick={() => setOrientation(opt)}
                  className={`px-3 py-1.5 rounded-md text-[10px] font-bold transition-all cursor-pointer ${
                    orientation === opt ? activeBtnClass : inactiveBtnClass
                  }`}
                >
                  {opt === 'landscape' ? 'أفقي' : 'رأسي'}
                </button>
              ))}
            </div>
          </div>

          {/* 2. Font Size */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-slate-500 font-bold hidden lg:inline">الخط</span>
            <div className="flex bg-slate-800/80 p-0.5 rounded-lg" style={{ border: '1px solid #334155' }}>
              {[
                { key: 'sm', label: 'ص' },
                { key: 'md', label: 'م' },
                { key: 'lg', label: 'ك' },
              ].map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => setFontSize(opt.key)}
                  className={`px-2.5 py-1.5 rounded-md text-[10px] font-bold transition-all cursor-pointer ${
                    fontSize === opt.key ? activeBtnClass : inactiveBtnClass
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* 3. Margins */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-slate-500 font-bold hidden lg:inline">الهوامش</span>
            <div className="flex bg-slate-800/80 p-0.5 rounded-lg" style={{ border: '1px solid #334155' }}>
              {Object.entries(MARGIN_PRESETS).map(([key, val]) => (
                <button
                  key={key}
                  onClick={() => setMarginPreset(key)}
                  className={`px-2.5 py-1.5 rounded-md text-[10px] font-bold transition-all cursor-pointer ${
                    marginPreset === key ? activeBtnClass : inactiveBtnClass
                  }`}
                  title={val.desc}
                >
                  {val.label}
                </button>
              ))}
            </div>
          </div>

          {/* 4. Toggles */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowPageNumbers(!showPageNumbers)}
              className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1 ${
                showPageNumbers
                  ? 'bg-cyan-600/20 text-cyan-400 border border-cyan-700/50'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
              title="ترقيم الصفحات"
            >
              <Hash size={12} />
              <span className="hidden sm:inline">#</span>
            </button>
            <button
              onClick={() => setShowSignaturePanel(!showSignaturePanel)}
              className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1 ${
                showSignaturePanel
                  ? 'bg-purple-600/20 text-purple-400 border border-purple-700/50'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
              title="تعديل التوقيع الرقمي"
            >
              <Edit3 size={12} />
            </button>
            <button
              onClick={() => setShowSignatures(!showSignatures)}
              className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1 ${
                showSignatures
                  ? 'bg-cyan-600/20 text-cyan-400 border border-cyan-700/50'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
              title="التوقيعات"
            >
              <Signature size={12} />
            </button>
          </div>

          {/* 5. Zoom */}
          <div className="flex items-center gap-1">
            <button onClick={() => setZoom(Math.max(25, zoom - 10))} className={iconBtnClass}>
              <ZoomOut size={14} className="text-slate-400" />
            </button>
            <div className="bg-slate-800 px-2.5 py-1 rounded-lg text-[10px] font-bold text-cyan-400 min-w-[48px] text-center tabular-nums" style={{ border: '1px solid #334155' }}>
              {zoom}%
            </div>
            <button onClick={() => setZoom(Math.min(150, zoom + 10))} className={iconBtnClass}>
              <ZoomIn size={14} className="text-slate-400" />
            </button>
          </div>

          {/* 6. PDF Export Button */}
          <button
            onClick={async () => {
              if (pdfExporting) return;
              setPdfExporting(true);
              try {
                await exportToPDF(exportData, exportColumns, {
                  title,
                  subtitle,
                  hierarchyLabel,
                  orientation,
                  marginPreset,
                  fontSize,
                  showPageNumbers,
                  showSignatures,
                  signatures: mergedSignatures,
                  ...(tables && tables.length > 0 ? { tables } : {}),
                });
                toast.success('تم تصدير التقرير كـ PDF بنجاح ✅');
              } catch (err) {
                toast.error(`فشل تصدير PDF: ${err.message || err}`);
              } finally {
                setPdfExporting(false);
              }
            }}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-xs transition-all cursor-pointer ${
              pdfExporting ? 'opacity-60' : ''
            }`}
            style={{
              background: pdfExporting
                ? 'var(--color-border)'
                : 'linear-gradient(135deg, #dc2626, #b91c1c)',
              color: '#fff',
              boxShadow: pdfExporting ? 'none' : '0 4px 12px rgba(220,38,38,0.3)',
            }}
            disabled={pdfExporting}
            title="تنزيل PDF"
          >
            <FileDown size={16} className={pdfExporting ? 'animate-bounce' : ''} />
            <span>{pdfExporting ? 'جاري التصدير...' : 'PDF'}</span>
          </button>

          {/* Separator */}
          <div className="w-px h-6 bg-slate-700" />

          {/* 7. Print Button */}
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white rounded-xl font-bold text-xs shadow-lg shadow-cyan-500/25 transition-all cursor-pointer"
          >
            <Printer size={16} />
            <span>طباعة</span>
          </button>

          {/* 8. Close */}
          <button
            onClick={onClose}
            className="p-2 bg-slate-800 hover:bg-slate-700 rounded-xl transition-all cursor-pointer"
          >
            <X size={18} className="text-slate-400" />
          </button>
        </div>
      </div>

      {/* ═══ Preview Area ═══ */}
      <div
        className="flex-1 overflow-auto flex items-start justify-center py-8 px-4 print-preview-container"
        style={{
          background:
            'repeating-conic-gradient(#1a2332 0% 25%, #1e293b 0% 50%) 50% / 20px 20px',
        }}
      >
        <div ref={previewRef} style={previewStyle} className="print-preview-content">
          {/* Print Header */}
          <div
            className="mb-4"
            style={{
              borderBottom: '3px solid #0891b2',
              paddingBottom: '8px',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
              }}
            >
              <div>
                <p
                  style={{
                    fontSize: '9px',
                    fontWeight: 700,
                    color: '#64748b',
                    margin: '0 0 2px',
                  }}
                >
                  الهيئة العامة للتأمين الصحي
                </p>
                <h1
                  style={{
                    fontSize: '16px',
                    fontWeight: 900,
                    color: '#0e7490',
                    margin: '0 0 2px',
                  }}
                >
                  {title}
                </h1>
                <p
                  style={{
                    fontSize: '9px',
                    color: '#94a3b8',
                    margin: 0,
                  }}
                >
                  {hierarchyLabel}
                  {hierarchyLabel ? ' | ' : ''}
                  تاريخ الطباعة: {new Date().toLocaleDateString('ar-EG')}
                </p>
              </div>
              <div
                style={{
                  width: '50px',
                  height: '50px',
                  background: 'linear-gradient(135deg, #ecfeff, #e0f2fe)',
                  borderRadius: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#0891b2',
                  fontWeight: 900,
                  fontSize: '14px',
                }}
              >
                HIA
              </div>
            </div>
            {subtitle && (
              <p
                style={{
                  fontSize: '10px',
                  fontWeight: 600,
                  color: '#334155',
                  margin: '4px 0 0',
                }}
              >
                {subtitle}
              </p>
            )}
          </div>

          {/* Report Content */}
          {children || (
            <div
              style={{
                padding: '40px 20px',
                textAlign: 'center',
                color: '#94a3b8',
                fontSize: '12px',
              }}
            >
              <p>محتوى التقرير يظهر هنا في المعاينة الحية</p>
              <p style={{ fontSize: '10px', marginTop: '8px' }}>
                ستظهر الجداول والبيانات الفعلية عند الطباعة
              </p>
            </div>
          )}

          {/* Signatures (Smart Footer) */}
          {showSignatures && (
            <>
            <div
              className="print-footer-signatures"
              style={{
                marginTop: '24px',
                paddingTop: '12px',
                borderTop: '2px solid #cbd5e1',
                display: 'flex',
                justifyContent: 'space-between',
                textAlign: 'center',
                pageBreakInside: 'avoid',
                breakInside: 'avoid',
              }}
            >
              <div style={{ flex: 1 }}>
                <p
                  style={{
                    fontSize: '10px',
                    fontWeight: 700,
                    textDecoration: 'underline',
                    color: '#475569',
                    marginBottom: '24px',
                  }}
                >
                  مُعد التقرير
                </p>
                <p style={{ fontSize: '9px', color: '#475569', fontWeight: 600 }}>
                  الاسم: {mergedSignatures.preparerName || '...........................'}
                </p>
                <p style={{ fontSize: '9px', color: '#94a3b8' }}>
                  التوقيع: ..........................
                </p>
              </div>
              <div style={{ flex: 1 }}>
                <p
                  style={{
                    fontSize: '10px',
                    fontWeight: 700,
                    textDecoration: 'underline',
                    color: '#475569',
                    marginBottom: '24px',
                  }}
                >
                  مدير الصيدلية / الإدارة
                </p>
                <p style={{ fontSize: '9px', color: '#475569', fontWeight: 600 }}>
                  الاسم: {mergedSignatures.managerName || '...........................'}
                </p>
                <p style={{ fontSize: '9px', color: '#94a3b8' }}>
                  التوقيع: ..........................
                </p>
              </div>
              <div style={{ flex: 1 }}>
                <p
                  style={{
                    fontSize: '10px',
                    fontWeight: 700,
                    textDecoration: 'underline',
                    color: '#475569',
                    marginBottom: '24px',
                  }}
                >
                  رقم الاعتماد
                </p>
                <p style={{ fontSize: '9px', color: '#475569', fontWeight: 600 }}>
                  {mergedSignatures.approvalNumber || '...........................'}
                </p>
                <p style={{ fontSize: '9px', color: '#475569', fontWeight: 600, marginTop: '12px' }}>
                  التاريخ: {new Date().toLocaleDateString('ar-EG')}
                </p>
              </div>
            </div>
            {/* Stamp line — full width below the 3 columns */}
            <div style={{ textAlign: 'center', marginTop: '16px', paddingTop: '8px', borderTop: '1px dashed #cbd5e1' }}>
              <p style={{ fontSize: '9px', color: '#94a3b8' }}>
                ختم الإدارة: ........................................................
              </p>
            </div>
            </>
          )}

          {/* Page Number */}
          {showPageNumbers && (
            <div
              className="print-page-number"
              style={{
                position: 'absolute',
                bottom: '5mm',
                left: '50%',
                transform: 'translateX(-50%)',
                fontSize: '8px',
                color: '#94a3b8',
                fontWeight: 700,
              }}
            >
              1 / 1
            </div>
          )}
        </div>
      </div>

      {/* ═══ Bottom Info Bar ═══ */}
      <div
        className="no-print flex items-center justify-between px-6 py-2.5"
        style={{
          background: '#0f172a',
          borderTop: '1px solid #334155',
        }}
      >
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <div
              className={`w-5 h-3.5 rounded-sm border ${
                orientation === 'landscape' ? 'bg-cyan-500 border-cyan-400' : 'bg-slate-700 border-slate-600'
              }`}
            />
            <span className="text-[10px] text-slate-500 font-bold">
              A4 {orientation === 'landscape' ? 'أفقي' : 'رأسي'} ({paperWidth}×{paperHeight}مم)
            </span>
          </div>
          <div className="w-px h-4 bg-slate-800" />
          <span className="text-[10px] text-slate-500 font-bold">
            هامش: {margins.label} ({margins.top}مم)
          </span>
          <div className="w-px h-4 bg-slate-800" />
          <span className="text-[10px] text-slate-500 font-bold">
            {showPageNumbers ? '✓ ترقيم الصفحات' : '✗ ترقيم الصفحات'}
          </span>
          <div className="w-px h-4 bg-slate-800" />
          <span className="text-[10px] text-slate-500 font-bold">
            {showSignatures ? '✓ تذييل التوقيعات' : '✗ تذييل التوقيعات'}
          </span>
        </div>
      </div>

      {/* ═══ Signature Settings Panel (inline) ═══ */}
      {showSignaturePanel && (
        <div
          className="no-print"
          style={{
            background: '#0f172a',
            borderBottom: '1px solid #334155',
          }}
        >
          <div className="px-6 py-3 space-y-3">
            {/* Preset Selector */}
            {presets.length > 0 && (
              <div>
                <label className="flex items-center gap-1.5 text-[10px] font-bold mb-1.5" style={{ color: '#94a3b8' }}>
                  <Bookmark size={11} />
                  تحميل من الإعدادات المحفوظة
                </label>
                <div className="flex gap-1 flex-wrap">
                  {presets.map(preset => {
                    const canDeleteThis = canDelete(preset);
                    return (
                      <div key={preset.id} className="flex items-center gap-0.5">
                        <button
                          onClick={() => handleInlinePresetSelect(preset.id)}
                          className={`flex items-center gap-1 px-2 py-1 rounded-md text-[9px] font-bold transition-all cursor-pointer ${
                            activePresetId === preset.id
                              ? 'bg-cyan-600/30 text-cyan-400'
                              : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                          }`}
                        >
                          {preset.is_default && <Star size={8} className="text-amber-400" />}
                          {preset.name}
                        </button>
                        {canDeleteThis && (
                          <button
                            onClick={async () => {
                              try {
                                await deletePreset(preset.id);
                              } catch (_) {}
                            }}
                            className="p-0.5 rounded hover:bg-slate-700 transition-all"
                            style={{ color: '#ef4444', opacity: 0.5 }}
                          >
                            <Trash2 size={8} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Signature Fields */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-2 items-end">
              <div>
                <label className="block text-[9px] font-bold mb-1" style={{ color: '#94a3b8' }}>
                  <User size={10} className="inline ml-1" />
                  مُعد التقرير
                </label>
                <input
                  type="text"
                  value={localPreparerName}
                  onChange={e => setLocalPreparerName(e.target.value)}
                  placeholder="الاسم..."
                  className="w-full px-2.5 py-1.5 rounded-lg text-xs"
                  style={{
                    background: '#1e293b',
                    color: '#fff',
                    border: '1px solid #334155',
                    textAlign: 'right',
                  }}
                />
              </div>
              <div>
                <label className="block text-[9px] font-bold mb-1" style={{ color: '#94a3b8' }}>
                  <ShieldCheck size={10} className="inline ml-1" />
                  مدير الصيدلية
                </label>
                <input
                  type="text"
                  value={localManagerName}
                  onChange={e => setLocalManagerName(e.target.value)}
                  placeholder="الاسم..."
                  className="w-full px-2.5 py-1.5 rounded-lg text-xs"
                  style={{
                    background: '#1e293b',
                    color: '#fff',
                    border: '1px solid #334155',
                    textAlign: 'right',
                  }}
                />
              </div>
              <div>
                <label className="block text-[9px] font-bold mb-1" style={{ color: '#94a3b8' }}>
                  <Hash size={10} className="inline ml-1" />
                  رقم الاعتماد
                </label>
                <input
                  type="text"
                  value={localApprovalNumber}
                  onChange={e => setLocalApprovalNumber(e.target.value)}
                  placeholder="اختياري..."
                  className="w-full px-2.5 py-1.5 rounded-lg text-xs"
                  style={{
                    background: '#1e293b',
                    color: '#fff',
                    border: '1px solid #334155',
                    textAlign: 'right',
                  }}
                />
              </div>
              <div>
                <button
                  onClick={handleSignaturesInlineSave}
                  disabled={sigSaving || !localPreparerName.trim()}
                  className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer"
                  style={{
                    background: sigSaving || !localPreparerName.trim()
                      ? '#334155'
                      : 'linear-gradient(135deg, #7c3aed, #6d28d9)',
                    color: '#fff',
                    opacity: sigSaving || !localPreparerName.trim() ? 0.5 : 1,
                  }}
                >
                  {sigSaving ? (
                    <>
                      <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      جاري...
                    </>
                  ) : (
                    <>
                      <Save size={11} />
                      حفظ التوقيع
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Save as new preset button + form */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setShowSaveAsNew(!showSaveAsNew); setNewPresetName(''); }}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[9px] font-bold transition-all cursor-pointer"
                style={{
                  background: showSaveAsNew ? '#334155' : 'transparent',
                  color: '#94a3b8',
                  border: '1px dashed #475569',
                }}
              >
                <Plus size={10} />
                <span>حفظ كإعداد جديد</span>
              </button>
            </div>

            {showSaveAsNew && (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newPresetName}
                  onChange={e => setNewPresetName(e.target.value)}
                  placeholder="اسم الإعداد الجديد..."
                  className="flex-1 px-2.5 py-1.5 rounded-lg text-xs"
                  style={{
                    background: '#1e293b',
                    color: '#fff',
                    border: '1px solid #334155',
                    textAlign: 'right',
                  }}
                  onKeyDown={e => e.key === 'Enter' && handleSaveAsNewPreset()}
                  autoFocus
                />
                <button
                  onClick={handleSaveAsNewPreset}
                  disabled={sigSaving || !newPresetName.trim() || !localPreparerName.trim()}
                  className="px-3 py-1.5 rounded-lg text-[9px] font-bold transition-all cursor-pointer"
                  style={{
                    background: (sigSaving || !newPresetName.trim() || !localPreparerName.trim())
                      ? '#334155'
                      : 'linear-gradient(135deg, #7c3aed, #6d28d9)',
                    color: '#fff',
                    opacity: (sigSaving || !newPresetName.trim() || !localPreparerName.trim()) ? 0.5 : 1,
                  }}
                >
                  {sigSaving ? 'جاري...' : 'حفظ'}
                </button>
              </div>
            )}

            {sigToast && (
              <p className="text-[10px] font-bold animate-fadeIn" style={{ color: sigToast.includes('✅') || sigToast.includes('⭐') ? '#34d399' : '#f87171' }}>
                {sigToast}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default PrintPreviewModal;
