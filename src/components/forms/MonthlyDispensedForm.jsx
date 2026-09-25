import React, { useState } from 'react';
import { Gift, DollarSign, FileText, Save, Loader2, Building2, GraduationCap, Baby, Heart, Info } from 'lucide-react';
import invoke from '../../api/tauriApi';
import { useToast } from '../ui/Toast';
import { useGlobalApp } from '../../context/useGlobalApp';
import { useAuth } from '../../context/AuthContext';
import { Lock, RotateCcw } from 'lucide-react';
import useKeyboardShortcuts from '../../hooks/useKeyboardShortcuts';
import useLockGuard from '../../hooks/useLockGuard';

const EMPTY_FORM_DATA = {
  drugs_free_authority: 0,
  drugs_free_students: 0,
  drugs_free_infants: 0,
  drugs_free_breadwinner_women: 0,
  drugs_supported_authority_value: 0,
  drugs_supported_authority_patient_share: 0,
  drugs_supported_students_value: 0,
  drugs_supported_students_patient_share: 0,
  drugs_supported_infants_value: 0,
  drugs_supported_infants_patient_share: 0,
  notes: '',
};

const FREE_KEYS = [
  'drugs_free_authority',
  'drugs_free_students',
  'drugs_free_infants',
  'drugs_free_breadwinner_women',
];

const SUPPORTED_KEYS = [
  'drugs_supported_authority_value',
  'drugs_supported_authority_patient_share',
  'drugs_supported_students_value',
  'drugs_supported_students_patient_share',
  'drugs_supported_infants_value',
  'drugs_supported_infants_patient_share',
];

const MonthlyDispensedForm = ({ hierarchy, mode = 'all', onSuccess, editRecord, onCancelEdit }) => {
  useGlobalApp();
  const { isLocked: monthLocked, LockBanner } = useLockGuard(hierarchy?.dispenseMonth);
  const [formData, setFormData] = useState({
    drugs_free_authority: 0,
    drugs_free_students: 0,
    drugs_free_infants: 0,
    drugs_free_breadwinner_women: 0,
    drugs_supported_authority_value: 0,
    drugs_supported_authority_patient_share: 0,
    drugs_supported_students_value: 0,
    drugs_supported_students_patient_share: 0,
    drugs_supported_infants_value: 0,
    drugs_supported_infants_patient_share: 0,
    notes: '',
  });
  const [freeId, setFreeId] = useState(null);
  const [supportedId, setSupportedId] = useState(null);
  const [freeExists, setFreeExists] = useState(false);
  const [supportedExists, setSupportedExists] = useState(false);
  // Create/Edit state is INDEPENDENT per type: editing Free must never imply
  // editing Supported (and vice versa) — the two are separate tables.
  const [freeEditing, setFreeEditing] = useState(false);
  const [supportedEditing, setSupportedEditing] = useState(false);
  // Only the combined page (mode 'all') uses the Free/Supported selector.
  // Separate pages force a single type via the mode prop.
  const [entryType, setEntryType] = useState('free');
  // Snapshot of the values currently loaded from the DB for the active type,
  // used to warn before switching away from unsaved edits.
  const [loadedSnapshot, setLoadedSnapshot] = useState({ type: null, fields: {}, notes: '' });
  const activeType = mode === 'all' ? entryType : mode;
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const { user } = useAuth();

  const fetchData = React.useCallback(async () => {
    if (!hierarchy?.branchId || !hierarchy?.dispenseMonth) {
      setFormData({ ...EMPTY_FORM_DATA });
      setFreeId(null);
      setSupportedId(null);
      setFreeExists(false);
      setSupportedExists(false);
      setLoadedSnapshot({ type: null, fields: {}, notes: '' });
      return;
    }

    // Prevent fetching if hierarchy is incomplete for current level
    if (hierarchy.level === 'area' && !hierarchy.areaId) {
      setFormData({ ...EMPTY_FORM_DATA });
      setFreeId(null);
      setSupportedId(null);
      setFreeExists(false);
      setSupportedExists(false);
      setLoadedSnapshot({ type: null, fields: {}, notes: '' });
      return;
    }
    if (hierarchy.level === 'clinic' && !hierarchy.clinicId) {
      setFormData({ ...EMPTY_FORM_DATA });
      setFreeId(null);
      setSupportedId(null);
      setFreeExists(false);
      setSupportedExists(false);
      setLoadedSnapshot({ type: null, fields: {}, notes: '' });
      return;
    }

    setLoading(true);
    try {
      const baseArgs = {
        branchId: parseInt(hierarchy.branchId),
        areaId: hierarchy.areaId ? parseInt(hierarchy.areaId) : null,
        clinicId: hierarchy.clinicId ? parseInt(hierarchy.clinicId) : null,
        dispenseMonth: hierarchy.dispenseMonth
      };
      const active = mode === 'all' ? entryType : mode;
      // Only the ACTIVE type is loaded per selection: "المجاني" reads only the
      // free table, "المدعم" reads only the supported table. The other type's
      // fields/ids are cleared so values never leak between the two independent
      // tables (there is no combined storage table anymore).
      let freeData = null;
      let supportedData = null;
      if (active === 'free') {
        freeData = await invoke('get_free_monthly_drugs_dispensed', baseArgs);
      } else {
        supportedData = await invoke('get_supported_monthly_drugs_dispensed', baseArgs);
      }
      setFreeId(active === 'free' ? (freeData?.id ?? null) : null);
      setSupportedId(active === 'supported' ? (supportedData?.id ?? null) : null);
      setFreeExists(active === 'free' && !!freeData?.id);
      setSupportedExists(active === 'supported' && !!supportedData?.id);
      setFormData({
        ...EMPTY_FORM_DATA,
        ...(active === 'free'
          ? {
              drugs_free_authority: freeData?.drugs_free_authority || 0,
              drugs_free_students: freeData?.drugs_free_students || 0,
              drugs_free_infants: freeData?.drugs_free_infants || 0,
              drugs_free_breadwinner_women: freeData?.drugs_free_breadwinner_women || 0,
            }
          : {
              drugs_supported_authority_value: supportedData?.drugs_supported_authority_value || 0,
              drugs_supported_authority_patient_share: supportedData?.drugs_supported_authority_patient_share || 0,
              drugs_supported_students_value: supportedData?.drugs_supported_students_value || 0,
              drugs_supported_students_patient_share: supportedData?.drugs_supported_students_patient_share || 0,
              drugs_supported_infants_value: supportedData?.drugs_supported_infants_value || 0,
              drugs_supported_infants_patient_share: supportedData?.drugs_supported_infants_patient_share || 0,
            }),
        notes: active === 'free' ? (freeData?.notes || '') : (supportedData?.notes || ''),
      });
      setLoadedSnapshot({
        type: active,
        fields: active === 'free'
          ? {
              drugs_free_authority: freeData?.drugs_free_authority || 0,
              drugs_free_students: freeData?.drugs_free_students || 0,
              drugs_free_infants: freeData?.drugs_free_infants || 0,
              drugs_free_breadwinner_women: freeData?.drugs_free_breadwinner_women || 0,
            }
          : {
              drugs_supported_authority_value: supportedData?.drugs_supported_authority_value || 0,
              drugs_supported_authority_patient_share: supportedData?.drugs_supported_authority_patient_share || 0,
              drugs_supported_students_value: supportedData?.drugs_supported_students_value || 0,
              drugs_supported_students_patient_share: supportedData?.drugs_supported_students_patient_share || 0,
              drugs_supported_infants_value: supportedData?.drugs_supported_infants_value || 0,
              drugs_supported_infants_patient_share: supportedData?.drugs_supported_infants_patient_share || 0,
            },
        notes: active === 'free' ? (freeData?.notes || '') : (supportedData?.notes || ''),
      });
    } catch (e) {
      console.error(e);
      toast.error('فشل في جلب البيانات المسجلة');
    } finally {
      setLoading(false);
    }
  }, [mode, entryType, hierarchy?.branchId, hierarchy?.areaId, hierarchy?.clinicId, hierarchy?.dispenseMonth, hierarchy?.level, toast]);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Selecting a different entity/month resets the form back to Create Mode.
  // An active editRecord (user pressed "تعديل") is the ONLY thing that keeps
  // Update Mode — so selecting an entity merely shows data for review while
  // saving stays a strict Create (duplicate-protected by the backend).
  React.useEffect(() => {
    if (editRecord) return;
    setFreeId(null);
    setSupportedId(null);
    setFreeExists(false);
    setSupportedExists(false);
    setFreeEditing(false);
    setSupportedEditing(false);
  }, [hierarchy?.branchId, hierarchy?.areaId, hierarchy?.clinicId, hierarchy?.dispenseMonth, editRecord]);

  // Handle Edit Mode
  React.useEffect(() => {
    if (editRecord) {
      setFormData({
        drugs_free_authority: editRecord.drugs_free_authority || 0,
        drugs_free_students: editRecord.drugs_free_students || 0,
        drugs_free_infants: editRecord.drugs_free_infants || 0,
        drugs_free_breadwinner_women: editRecord.drugs_free_breadwinner_women || 0,
        drugs_supported_authority_value: editRecord.drugs_supported_authority_value || 0,
        drugs_supported_authority_patient_share: editRecord.drugs_supported_authority_patient_share || 0,
        drugs_supported_students_value: editRecord.drugs_supported_students_value || 0,
        drugs_supported_students_patient_share: editRecord.drugs_supported_students_patient_share || 0,
        drugs_supported_infants_value: editRecord.drugs_supported_infants_value || 0,
        drugs_supported_infants_patient_share: editRecord.drugs_supported_infants_patient_share || 0,
        notes: editRecord.notes || '',
      });
      setFreeId(editRecord.freeId ?? (mode === 'free' ? editRecord.id : null));
      setSupportedId(editRecord.supId ?? (mode === 'supported' ? editRecord.id : null));
      setFreeExists(!!(editRecord.freeId ?? (mode === 'free' ? editRecord.id : null)));
      setSupportedExists(!!(editRecord.supId ?? (mode === 'supported' ? editRecord.id : null)));
      setFreeEditing(!!(editRecord.freeId ?? (mode === 'free' ? editRecord.id : null)));
      setSupportedEditing(!!(editRecord.supId ?? (mode === 'supported' ? editRecord.id : null)));
    } else {
      // Clear form when no record is being edited or when hierarchy changes (handled by the clear in fetchData start)
      setFormData({ ...EMPTY_FORM_DATA });
      setFreeId(null);
      setSupportedId(null);
      setFreeExists(false);
      setSupportedExists(false);
      setFreeEditing(false);
      setSupportedEditing(false);
      setLoadedSnapshot({ type: null, fields: {}, notes: '' });
    }
  }, [editRecord, mode]);

  const resetForm = () => {
    setFormData({ ...EMPTY_FORM_DATA });
    setFreeEditing(false);
    setSupportedEditing(false);
    setLoadedSnapshot({ type: null, fields: {}, notes: '' });
    if (onCancelEdit) onCancelEdit();
    toast.info("تم تفريغ بيانات الإدخال");
  };

  useKeyboardShortcuts([
    {
      key: 'Escape',
      handler: resetForm,
      description: 'تفريغ البيانات / إلغاء التعديل'
    },
    {
      key: 'r',
      alt: true,
      handler: resetForm,
      description: 'إعادة تعيين البيانات'
    }
  ]);

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const enterEditMode = async (type) => {
    await fetchData();
    if (type === 'free') setFreeEditing(true);
    else setSupportedEditing(true);
  };

  const activeKeys = activeType === 'free' ? FREE_KEYS : SUPPORTED_KEYS;
  const snapshotAligned = loadedSnapshot.type === activeType;
  const isDirty = snapshotAligned && (
    activeKeys.some((k) => (parseFloat(formData[k]) || 0) !== (parseFloat(loadedSnapshot.fields[k]) || 0)) ||
    (formData.notes || '') !== (loadedSnapshot.notes || '')
  );

  // Switching the selected type must never transfer values, record IDs, edit
  // state or existence flags between the Free and Supported tables. It asks
  // first when there are unsaved edits (never loses them silently), then clears
  // the per-type state and reloads only the newly selected type.
  const handleTypeSwitch = (next) => {
    if (next === activeType) return;
    if (isDirty) {
      const confirmed = window.confirm('لديك تعديلات غير محفوظة في نوع الإدخال الحالي وسيتم فقدانها عند التبديل. متابعة؟');
      if (!confirmed) return;
    }
    setFreeEditing(false);
    setSupportedEditing(false);
    setFreeId(null);
    setSupportedId(null);
    setFreeExists(false);
    setSupportedExists(false);
    setLoadedSnapshot({ type: null, fields: {}, notes: '' });
    setEntryType(next);
  };

  const handleSave = async () => {
    if (!hierarchy?.branchId) {
      toast.warning('يرجى اختيار الفرع أولاً');
      return;
    }
    if (hierarchy.level === 'area' && !hierarchy.areaId) {
      toast.warning('يرجى اختيار المنطقة أولاً للتمكن من الحفظ');
      return;
    }
    if (hierarchy.level === 'clinic' && !hierarchy.clinicId) {
      toast.warning('يرجى اختيار العيادة أولاً للتمكن من الحفظ');
      return;
    }

    setSaving(true);

    // Free and Supported are two INDEPENDENT tables. Each type is saved in its
    // own try/catch so a duplicate-Create rejection for one type (approved
    // backend message) NEVER blocks creation/update of the other type, and an
    // explicit edit of one type never touches an unedited existing type.
    // Per-type decision:
    //   - UPDATE : the record exists AND that type's edit mode is on.
    //   - SKIP   : the record exists, its edit mode is off, but the OTHER type
    //              is being edited → never write an untouched existing type.
    //   - Reject : the record exists and NEITHER type is being edited (pure
    //              Create intent) → send a strict Create so the backend rejects
    //              the duplicate with the approved message.
    //   - CREATE : no record exists and values were actually entered → strict
    //              Create (zero-value records are never created).
    const outcomes = {
      free: { ok: false, error: null },
      supported: { ok: false, error: null },
    };

    try {
      const base = {
        clinic_id: hierarchy.clinicId ? parseInt(hierarchy.clinicId) : null,
        area_id: hierarchy.areaId ? parseInt(hierarchy.areaId) : null,
        branch_id: parseInt(hierarchy.branchId),
        dispense_month: hierarchy.dispenseMonth,
      };

      const isActiveFree = activeType === 'free';
      const isActiveSupported = activeType === 'supported';

      // Only the type currently shown/selected is saved. Saving must NEVER
      // write the other type (free never touches supported and vice versa).
      if (isActiveFree) {
        const editingFree = freeEditing && !!freeId;
        const freeSum =
          (parseFloat(formData.drugs_free_authority) || 0) +
          (parseFloat(formData.drugs_free_students) || 0) +
          (parseFloat(formData.drugs_free_infants) || 0) +
          (parseFloat(formData.drugs_free_breadwinner_women) || 0);
        const freePayload = {
          ...base,
          drugs_free_authority: parseFloat(formData.drugs_free_authority) || 0,
          drugs_free_students: parseFloat(formData.drugs_free_students) || 0,
          drugs_free_infants: parseFloat(formData.drugs_free_infants) || 0,
          drugs_free_breadwinner_women: parseFloat(formData.drugs_free_breadwinner_women) || 0,
          notes: formData.notes,
        };
        try {
          if (editingFree) {
            await invoke('save_free_monthly_drugs_dispensed', {
              data: { ...freePayload, id: freeId },
              isCreate: false,
            });
            await invoke('log_frontend_action', {
              userId: user ? user.id : null,
              action: 'UPDATE',
              tableName: 'monthly_free_drugs_dispensed',
              recordId: freeId.toString(),
              details: `تم تعديل بيانات المنصرف المجاني الشهري لفرع ${hierarchy.branchId} شهر ${hierarchy.dispenseMonth}`
            });
            outcomes.free.ok = true;
          } else if (freeId) {
            if (freeEditing || supportedEditing) {
              // A per-type edit session is active → leave an existing unedited
              // type untouched (independent Free/Supported editing).
              outcomes.free.ok = true;
            } else {
              // Pure Create intent on an existing key → backend rejects it with
              // the approved duplicate message; Supported is NOT affected.
              await invoke('save_free_monthly_drugs_dispensed', {
                data: freePayload,
                isCreate: true,
              });
              outcomes.free.ok = true;
            }
          } else if (freeSum > 0) {
            const newId = await invoke('save_free_monthly_drugs_dispensed', {
              data: freePayload,
              isCreate: true,
            });
            await invoke('log_frontend_action', {
              userId: user ? user.id : null,
              action: 'INSERT',
              tableName: 'monthly_free_drugs_dispensed',
              recordId: newId.toString(),
              details: `تم حفظ بيانات المنصرف المجاني الشهري لفرع ${hierarchy.branchId} شهر ${hierarchy.dispenseMonth}`
            });
            outcomes.free.ok = true;
          } else {
            outcomes.free.ok = true; // nothing entered → nothing to create
          }
        } catch (e) {
          outcomes.free.error = e;
        }
      }

      if (isActiveSupported) {
        const editingSupported = supportedEditing && !!supportedId;
        const supportedSum =
          (parseFloat(formData.drugs_supported_authority_value) || 0) +
          (parseFloat(formData.drugs_supported_authority_patient_share) || 0) +
          (parseFloat(formData.drugs_supported_students_value) || 0) +
          (parseFloat(formData.drugs_supported_students_patient_share) || 0) +
          (parseFloat(formData.drugs_supported_infants_value) || 0) +
          (parseFloat(formData.drugs_supported_infants_patient_share) || 0);
        const supportedPayload = {
          ...base,
          drugs_supported_authority_value: parseFloat(formData.drugs_supported_authority_value) || 0,
          drugs_supported_authority_patient_share: parseFloat(formData.drugs_supported_authority_patient_share) || 0,
          drugs_supported_students_value: parseFloat(formData.drugs_supported_students_value) || 0,
          drugs_supported_students_patient_share: parseFloat(formData.drugs_supported_students_patient_share) || 0,
          drugs_supported_infants_value: parseFloat(formData.drugs_supported_infants_value) || 0,
          drugs_supported_infants_patient_share: parseFloat(formData.drugs_supported_infants_patient_share) || 0,
          notes: formData.notes,
        };
        try {
          if (editingSupported) {
            await invoke('save_supported_monthly_drugs_dispensed', {
              data: { ...supportedPayload, id: supportedId },
              isCreate: false,
            });
            await invoke('log_frontend_action', {
              userId: user ? user.id : null,
              action: 'UPDATE',
              tableName: 'monthly_supported_drugs_dispensed',
              recordId: supportedId.toString(),
              details: `تم تعديل بيانات المنصرف المدعم الشهري لفرع ${hierarchy.branchId} شهر ${hierarchy.dispenseMonth}`
            });
            outcomes.supported.ok = true;
          } else if (supportedId) {
            if (freeEditing || supportedEditing) {
              outcomes.supported.ok = true;
            } else {
              // Pure Create intent on an existing key → backend rejects it with
              // the approved duplicate message; Free is NOT affected.
              await invoke('save_supported_monthly_drugs_dispensed', {
                data: supportedPayload,
                isCreate: true,
              });
              outcomes.supported.ok = true;
            }
          } else if (supportedSum > 0) {
            const newId = await invoke('save_supported_monthly_drugs_dispensed', {
              data: supportedPayload,
              isCreate: true,
            });
            await invoke('log_frontend_action', {
              userId: user ? user.id : null,
              action: 'INSERT',
              tableName: 'monthly_supported_drugs_dispensed',
              recordId: newId.toString(),
              details: `تم حفظ بيانات المنصرف المدعم الشهري لفرع ${hierarchy.branchId} شهر ${hierarchy.dispenseMonth}`
            });
            outcomes.supported.ok = true;
          } else {
            outcomes.supported.ok = true; // nothing entered → nothing to create
          }
        } catch (e) {
          outcomes.supported.error = e;
        }
      }

      // Report each type's outcome independently.
      const errors = [outcomes.free.error, outcomes.supported.error].filter(Boolean);
      const savedCount = [outcomes.free.ok, outcomes.supported.ok].filter(Boolean).length;
      if (savedCount === 0 && errors.length === 0) {
        toast.warning('لم يتم إدخال أي بيانات جديدة');
      } else {
        if (savedCount > 0) toast.success('تم حفظ البيانات بنجاح');
        errors.forEach((err) => toast.error(`خطأ: ${err}`));
      }

      // Re-read the stored rows so the Create-mode banners reflect reality
      // (an existing record now points the user towards the explicit Update).
      await fetchData();
      if (onCancelEdit) onCancelEdit();
      if (onSuccess) onSuccess();
    } catch (error) {
      toast.error(`خطأ: ${error}`);
    } finally {
      setSaving(false);
    }
  };

  const freeFields = [
    { key: 'drugs_free_authority', label: 'منصرف الهيئة', icon: Building2 },
    { key: 'drugs_free_students', label: 'منصرف الطلاب', icon: GraduationCap },
    { key: 'drugs_free_infants', label: 'منصرف الرضع', icon: Baby },
    { key: 'drugs_free_breadwinner_women', label: 'منصرف المرأة المعيلة', icon: Heart },
  ];

  const supportedFields = [
    { key: 'drugs_supported_authority_value', label: 'قيمة الهيئة', type: 'value' },
    { key: 'drugs_supported_authority_patient_share', label: 'حصة المريض - هيئة', type: 'share' },
    { key: 'drugs_supported_students_value', label: 'قيمة الطلبة', type: 'value' },
    { key: 'drugs_supported_students_patient_share', label: 'حصة المريض - طلبة', type: 'share' },
    { key: 'drugs_supported_infants_value', label: 'قيمة الرضع', type: 'value' },
    { key: 'drugs_supported_infants_patient_share', label: 'حصة المريض - رضع', type: 'share' },
  ];

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-16 space-y-4 text-[var(--color-text-muted)]">
        <Loader2 size={40} className="animate-spin text-[var(--color-primary)]" />
        <p className="font-bold animate-pulse">جاري جلب البيانات السابقة...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn" dir="rtl">

      <LockBanner />

      {/* Free/Supported selector — combined page (mode 'all') only.
          Choosing a type shows that type's fields exclusively and hides the
          other type; no values/IDs/editing state are carried between them. */}
      {mode === 'all' && (
        <div className="flex bg-[var(--color-bg-card)] p-1 rounded-xl border border-[var(--color-border)] gap-1 w-fit flex-wrap">
          <button
            onClick={() => handleTypeSwitch('free')}
            disabled={saving || loading}
            className={`px-5 py-2.5 rounded-lg text-sm font-black transition-all flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed ${entryType === 'free' ? 'bg-[var(--color-accent-cyan)] text-white shadow-md' : 'text-[var(--color-text-muted)] hover:bg-[var(--color-border)]'}`}
          >
            <Gift size={16} />
            المجاني
          </button>
          <button
            onClick={() => handleTypeSwitch('supported')}
            disabled={saving || loading}
            className={`px-5 py-2.5 rounded-lg text-sm font-black transition-all flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed ${entryType === 'supported' ? 'bg-[var(--color-accent-emerald)] text-white shadow-md' : 'text-[var(--color-text-muted)] hover:bg-[var(--color-border)]'}`}
          >
            <DollarSign size={16} />
            المدعم
          </button>
        </div>
      )}

      {/* Free Drugs Section */}
      {((mode === 'all' && entryType === 'free') || mode === 'free') && (
        <section className="space-y-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2.5 rounded-xl bg-[var(--color-accent-cyan-bg)] text-[var(--color-accent-cyan)] shadow-sm border border-[var(--color-border)]">
              <Gift size={22} />
            </div>
            <div>
              <h3 className="text-lg font-black text-[var(--color-text)]">تقسيمات الصرف (الأدوية المجانية)</h3>
            </div>
          </div>
          {(!freeEditing && freeExists) && (
            <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-[var(--color-warning)]/10 border border-[var(--color-warning)]/40 text-sm font-bold text-[var(--color-text)]">
              <span className="flex items-center gap-2">
                <Info size={16} className="text-[var(--color-warning)]" />
                توجد بيانات مسجلة بالفعل، يمكنك الذهاب إلى التعديل.
              </span>
              <button
                onClick={() => enterEditMode('free')}
                className="px-4 py-1.5 rounded-lg bg-[var(--color-warning)] text-white text-xs font-black hover:brightness-110 transition-all"
              >
                الانتقال إلى التعديل
              </button>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {freeFields.map(({ key, label, icon: _Icon }) => (
              <div key={key} className="space-y-2">
                <label className="flex items-center gap-2 text-xs font-bold text-[var(--color-text-muted)]">
                  <_Icon size={14} />
                  <span>{label}</span>
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0"
                    value={formData[key] || ''}
                    onChange={(e) => handleChange(key, e.target.value)}
                    disabled={monthLocked}
                    className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] outline-none p-3 rounded-xl text-base font-bold text-center text-[var(--color-text)] focus:ring-2 focus:ring-[var(--color-primary)]/20 focus:border-[var(--color-primary)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-[var(--color-text-muted)]">جنيه</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Supported Drugs Section */}
      {((mode === 'all' && entryType === 'supported') || mode === 'supported') && (
        <section className="space-y-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2.5 rounded-xl bg-[var(--color-accent-emerald-bg)] text-[var(--color-accent-emerald)] shadow-sm border border-[var(--color-accent-emerald)]/20">
              <DollarSign size={22} />
            </div>
            <div>
              <h3 className="text-lg font-black text-[var(--color-text)]">الأدوية المدعّمة</h3>
              <p className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-widest">القيم المالية وحصص مشاركة المرضى</p>
            </div>
          </div>
          {(!supportedEditing && supportedExists) && (
            <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-[var(--color-warning)]/10 border border-[var(--color-warning)]/40 text-sm font-bold text-[var(--color-text)]">
              <span className="flex items-center gap-2">
                <Info size={16} className="text-[var(--color-warning)]" />
                توجد بيانات مسجلة بالفعل، يمكنك الذهاب إلى التعديل.
              </span>
              <button
                onClick={() => enterEditMode('supported')}
                className="px-4 py-1.5 rounded-lg bg-[var(--color-warning)] text-white text-xs font-black hover:brightness-110 transition-all"
              >
                الانتقال إلى التعديل
              </button>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {supportedFields.map(({ key, label, type }) => (
              <div key={key} className="space-y-2">
                <label className="flex items-center gap-2 text-xs font-bold text-[var(--color-text-muted)]">
                  <DollarSign size={14} />
                  <span>{label}</span>
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={formData[key] || ''}
                    onChange={(e) => handleChange(key, e.target.value)}
                    disabled={monthLocked}
                    className={`w-full bg-[var(--color-bg)] border outline-none p-3 rounded-xl text-base font-bold text-center text-[var(--color-text)] focus:ring-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed ${type === 'value' ? 'border-[var(--color-success)]/30 focus:ring-[var(--color-success)]/20 focus:border-[var(--color-success)]' : 'border-[var(--color-warning)]/30 focus:ring-[var(--color-warning)]/20 focus:border-[var(--color-warning)]'}`}
                  />
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-[var(--color-text-muted)]">ج.م</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Notes */}
      <div className="space-y-2">
        <label className="flex items-center gap-2 text-xs font-bold text-[var(--color-text-muted)]">
          <FileText size={14} />
          <span>ملاحظات</span>
        </label>          <textarea
            rows="3"
            disabled={monthLocked}
            className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] outline-none p-4 rounded-xl text-sm font-medium text-right text-[var(--color-text)] focus:ring-2 focus:ring-[var(--color-primary)]/20 focus:border-[var(--color-primary)] transition-all resize-y disabled:opacity-50 disabled:cursor-not-allowed"
            placeholder="أضف أي ملاحظات تتعلق بصرف هذا الشهر..."
            value={formData.notes}
            onChange={(e) => handleChange('notes', e.target.value)}
          />
      </div>

      {/* Total Display + Save Button */}
      <div className="bg-gradient-to-l from-[var(--color-success)] to-[var(--color-primary)] text-white rounded-2xl p-5 text-center shadow-lg">
        <span className="text-3xl font-black block">
          {Object.entries(formData)
            .filter(([key]) => {
              if (activeType === 'free') return key.startsWith('drugs_free');
              return key.startsWith('drugs_supported') && key.endsWith('value');
            })
            .reduce((sum, [_, val]) => sum + (parseFloat(val) || 0), 0)
            .toLocaleString(undefined, { maximumFractionDigits: 4 })}
        </span>
        <span className="text-xs font-bold opacity-70 mt-1 block">إجمالي المنصرف (جنيه)</span>
      </div>

      <div className="flex gap-4">
        <button
          onClick={resetForm}
          disabled={monthLocked}
          className="flex-1 flex items-center justify-center gap-2 py-4 rounded-2xl font-black text-base transition-all bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-text)] hover:bg-[var(--color-bg-card)] dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <RotateCcw size={22} />
          <span>تفريغ الصناديق</span>
        </button>
        <button 
          onClick={handleSave} 
          disabled={saving || !hierarchy?.branchId || monthLocked} 
          className={`flex-[3] flex items-center justify-center gap-3 py-4 rounded-2xl font-black text-base transition-all duration-300 shadow-lg ${saving || !hierarchy?.branchId || monthLocked ? 'bg-[var(--color-bg)] text-[var(--color-text-muted)] cursor-not-allowed border border-[var(--color-border)]' : 'bg-gradient-to-r from-[var(--color-primary)] to-cyan-500 text-white hover:shadow-xl hover:-translate-y-1 hover:shadow-cyan-500/50 shadow-cyan-500/30 active:translate-y-0 active:scale-[0.98]'}`}
        >
          {saving ? <Loader2 size={22} className="animate-spin" /> : (monthLocked ? <Lock size={22} /> : <Save size={22} />)}
          <span>{saving ? 'جاري الحفظ...' : (monthLocked ? 'الشهر مقفل' : ((activeType === 'free' ? freeEditing : supportedEditing) ? '✓ حفظ التعديلات' : '✓ حفظ سجل الصرف'))}</span>
        </button>
      </div>
    </div>
  );
};

export default MonthlyDispensedForm;
