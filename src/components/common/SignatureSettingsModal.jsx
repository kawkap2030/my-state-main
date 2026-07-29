import React, { useState } from 'react';
import {
  X, User, ShieldCheck, Hash, Save, Clock,
  FileSignature, RefreshCw
} from 'lucide-react';
import useReportSignatures from '../../hooks/useReportSignatures';
import useExportPresets from '../../hooks/useExportPresets';
import { useAuth } from '../../context/AuthContext';

const SignatureSettingsModal = ({ isOpen, onClose }) => {
  const { user } = useAuth();
  const { signatures, loading: _loading, saving, saveSignatures, clearSignatures, loadSignatures } = useReportSignatures();
  const { savePreset } = useExportPresets();

  const [form, setForm] = useState({
    preparerName: '',
    managerName: '',
    approvalNumber: '',
  });
  const [initialized, setInitialized] = useState(false);

  // Initialize form when modal opens
  React.useEffect(() => {
    if (isOpen && !initialized) {
      // Reload to get fresh data
      loadSignatures().then(() => {
        setInitialized(true);
      });
    }
    if (isOpen && signatures) {
      setForm({
        preparerName: signatures.preparerName || user?.username || '',
        managerName: signatures.managerName || '',
        approvalNumber: signatures.approvalNumber || '',
      });
    }
  }, [isOpen, signatures, user, initialized, loadSignatures]);

  // Reset initialized state when modal closes
  React.useEffect(() => {
    if (!isOpen) {
      setInitialized(false);
    }
  }, [isOpen]);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.preparerName.trim()) {
      return;
    }
    try {
      // Save to report_signatures (backward compat) + export_presets as default
      await saveSignatures(form);
      await savePreset({
        name: 'التوقيع الافتراضي',
        scope: 'public',
        orientation: 'landscape',
        marginPreset: 'standard',
        showPageNumbers: true,
        showSignatures: true,
        preparerName: form.preparerName,
        managerName: form.managerName,
        approvalNumber: form.approvalNumber,
        isDefault: true,
      });
      onClose();
    } catch (err) {
      console.error('Failed to save signatures:', err);
    }
  };

  const handleClear = async () => {
    try {
      await clearSignatures();
      setForm({ preparerName: '', managerName: '', approvalNumber: '' });
      onClose();
    } catch (err) {
      console.error('Failed to clear signatures:', err);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(15, 23, 42, 0.5)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="neu-card w-full max-w-lg overflow-hidden"
        style={{ animation: 'fadeIn 0.2s ease' }}
        onClick={e => e.stopPropagation()}
        dir="rtl"
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: '1px solid var(--color-border)' }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: 'var(--color-purple-bg)', color: 'var(--color-purple)' }}
            >
              <FileSignature size={20} />
            </div>
            <div>
              <h3 className="text-base font-bold" style={{ color: 'var(--color-text)' }}>
                التوقيع الرقمي للتقارير
              </h3>
              <p className="text-[10px] font-bold" style={{ color: 'var(--color-text-muted)' }}>
                يضاف تلقائياً إلى تقارير PDF والطباعة
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

        {/* Body */}
        <form onSubmit={handleSave} className="p-6 space-y-5">
          {/* Preparer Name */}
          <div>
            <label
              className="flex items-center gap-2 text-xs font-bold mb-2"
              style={{ color: 'var(--color-text-muted)' }}
            >
              <User size={14} />
              مُعد التقرير
            </label>
            <input
              type="text"
              value={form.preparerName}
              onChange={(e) => setForm({ ...form, preparerName: e.target.value })}
              placeholder="اسم الشخص المُعد للتقرير"
              className="neu-input w-full"
              style={{ textAlign: 'right' }}
              required
            />
            <p className="text-[10px] mt-1 font-medium" style={{ color: 'var(--color-text-muted)', opacity: 0.6 }}>
              {user?.username ? `المستخدم الحالي: ${user.username}` : ''}
            </p>
          </div>

          {/* Manager Name */}
          <div>
            <label
              className="flex items-center gap-2 text-xs font-bold mb-2"
              style={{ color: 'var(--color-text-muted)' }}
            >
              <ShieldCheck size={14} />
              مدير الصيدلية / الإدارة
            </label>
            <input
              type="text"
              value={form.managerName}
              onChange={(e) => setForm({ ...form, managerName: e.target.value })}
              placeholder="اسم مدير الصيدلية أو الإدارة المعنية"
              className="neu-input w-full"
              style={{ textAlign: 'right' }}
            />
          </div>

          {/* Approval Number */}
          <div>
            <label
              className="flex items-center gap-2 text-xs font-bold mb-2"
              style={{ color: 'var(--color-text-muted)' }}
            >
              <Hash size={14} />
              رقم الاعتماد
            </label>
            <input
              type="text"
              value={form.approvalNumber}
              onChange={(e) => setForm({ ...form, approvalNumber: e.target.value })}
              placeholder="رقم اعتماد التقرير (اختياري)"
              className="neu-input w-full"
              style={{ textAlign: 'right' }}
            />
          </div>

          {/* Preview */}
          <div
            className="p-4 rounded-2xl"
            style={{
              background: 'var(--color-bg)',
              border: '1px dashed var(--color-border)',
            }}
          >
            <h4 className="text-[11px] font-bold mb-3 flex items-center gap-1.5" style={{ color: 'var(--color-text-muted)' }}>
              <FileSignature size={12} />
              معاينة التوقيع في التقرير:
            </h4>
            <div className="flex justify-between text-center" style={{ gap: '8px' }}>
              <div className="flex-1 p-2 rounded-xl" style={{ background: 'var(--color-bg-card)' }}>
                <p className="text-[9px] font-bold" style={{ color: 'var(--color-text-muted)' }}>مُعد التقرير</p>
                <p className="text-xs font-bold mt-1" style={{ color: 'var(--color-text)' }}>
                  {form.preparerName || '...........................'}
                </p>
              </div>
              <div className="flex-1 p-2 rounded-xl" style={{ background: 'var(--color-bg-card)' }}>
                <p className="text-[9px] font-bold" style={{ color: 'var(--color-text-muted)' }}>مدير الصيدلية</p>
                <p className="text-xs font-bold mt-1" style={{ color: 'var(--color-text)' }}>
                  {form.managerName || '...........................'}
                </p>
              </div>
              <div className="flex-1 p-2 rounded-xl" style={{ background: 'var(--color-bg-card)' }}>
                <p className="text-[9px] font-bold" style={{ color: 'var(--color-text-muted)' }}>رقم الاعتماد</p>
                <p className="text-xs font-bold mt-1" style={{ color: 'var(--color-text)' }}>
                  {form.approvalNumber || '...........................'}
                </p>
              </div>
            </div>
            <p className="text-[9px] mt-2 font-medium" style={{ color: 'var(--color-text-muted)', opacity: 0.5 }}>
              آخر تحديث: {signatures.updatedAt ? new Date(signatures.updatedAt).toLocaleString('ar-SA') : 'لم يتم الحفظ بعد'}
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={saving || !form.preparerName.trim()}
              className="flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-bold text-sm transition-all cursor-pointer"
              style={{
                background: saving
                  ? 'var(--color-border)'
                  : 'linear-gradient(135deg, var(--color-purple), var(--color-purple-dark))',
                color: '#fff',
                boxShadow: saving
                  ? 'none'
                  : '0 4px 14px rgba(124, 58, 237, 0.3)',
                opacity: !form.preparerName.trim() ? 0.5 : 1,
              }}
            >
              {saving ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  جاري الحفظ...
                </>
              ) : (
                <>
                  <Save size={16} />
                  حفظ التوقيع
                </>
              )}
            </button>
            <button
              type="button"
              onClick={handleClear}
              className="px-4 py-3 rounded-xl font-bold text-xs transition-all cursor-pointer"
              style={{
                background: 'transparent',
                color: 'var(--color-danger)',
                border: '1px solid var(--color-danger)',
              }}
            >
              مسح
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-3 rounded-xl font-bold text-xs transition-all cursor-pointer"
              style={{
                background: 'var(--color-bg)',
                color: 'var(--color-text-muted)',
                border: '1px solid var(--color-border)',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-border)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'var(--color-bg)'; }}
            >
              إلغاء
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SignatureSettingsModal;
