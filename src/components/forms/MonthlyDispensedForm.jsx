import React, { useState } from 'react';
import { Gift, DollarSign, FileText, Save, Loader2, Building2, GraduationCap, Baby, Heart, Layers } from 'lucide-react';
import LockNotificationBanner from '../common/LockNotificationBanner';
import invoke from '../../api/tauriApi';
import { useToast } from '../ui/Toast';
import { useGlobalApp } from '../../context/useGlobalApp';
import { useAuth } from '../../context/AuthContext';
import { Lock, RotateCcw } from 'lucide-react';
import useKeyboardShortcuts from '../../hooks/useKeyboardShortcuts';

const MonthlyDispensedForm = ({ hierarchy, mode = 'all', onSuccess, editRecord, onCancelEdit }) => {
  const { checkIsMonthLocked, manualLockedMonths } = useGlobalApp();
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
    supplies_total_value: 0,
    notes: '',
  });
  const [currentId, setCurrentId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const { user } = useAuth();

  const fetchData = React.useCallback(async () => {
    if (!hierarchy?.branchId || !hierarchy?.dispenseMonth) {
      setFormData({
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
        supplies_total_value: 0,
        notes: '',
      });
      setCurrentId(null);
      return;
    }

    // Prevent fetching if hierarchy is incomplete for current level
    if (hierarchy.level === 'area' && !hierarchy.areaId) {
      setFormData({
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
        supplies_total_value: 0,
        notes: '',
      });
      setCurrentId(null);
      return;
    }
    if (hierarchy.level === 'clinic' && !hierarchy.clinicId) {
      setFormData({
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
        supplies_total_value: 0,
        notes: '',
      });
      setCurrentId(null);
      return;
    }

    setLoading(true);
    try {
      const data = await invoke('get_monthly_drugs_dispensed', {
        branchId: parseInt(hierarchy.branchId),
        areaId: hierarchy.areaId ? parseInt(hierarchy.areaId) : null,
        clinicId: hierarchy.clinicId ? parseInt(hierarchy.clinicId) : null,
        dispenseMonth: hierarchy.dispenseMonth
      });
      if (data) {
        // Only set currentId for reference, don't populate formData automatically
        setCurrentId(data.id);
      } else {
        setCurrentId(null);
      }
    } catch (e) {
      console.error(e);
      toast.error('فشل في جلب البيانات المسجلة');
    } finally {
      setLoading(false);
    }
  }, [hierarchy?.branchId, hierarchy?.areaId, hierarchy?.clinicId, hierarchy?.dispenseMonth, hierarchy?.level]);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

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
        supplies_total_value: editRecord.supplies_total_value || 0,
        notes: editRecord.notes || '',
      });
      setCurrentId(editRecord.id);
    } else {
      // Clear form when no record is being edited or when hierarchy changes (handled by the clear in fetchData start)
      setFormData({
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
        supplies_total_value: 0,
        notes: '',
      });
      setCurrentId(null);
    }
  }, [editRecord]);

  const resetForm = () => {
    setFormData({
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
      supplies_total_value: 0,
      notes: '',
    });
    setCurrentId(null);
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
    try {
      const payload = {
          id: currentId,
          clinic_id: hierarchy.clinicId ? parseInt(hierarchy.clinicId) : null,
          area_id: hierarchy.areaId ? parseInt(hierarchy.areaId) : null,
          branch_id: parseInt(hierarchy.branchId),
          dispense_month: hierarchy.dispenseMonth,
          ...formData,
          drugs_free_authority: parseFloat(formData.drugs_free_authority) || 0,
          drugs_free_students: parseFloat(formData.drugs_free_students) || 0,
          drugs_free_infants: parseFloat(formData.drugs_free_infants) || 0,
          drugs_free_breadwinner_women: parseFloat(formData.drugs_free_breadwinner_women) || 0,
          drugs_supported_authority_value: parseFloat(formData.drugs_supported_authority_value) || 0,
          drugs_supported_authority_patient_share: parseFloat(formData.drugs_supported_authority_patient_share) || 0,
          drugs_supported_students_value: parseFloat(formData.drugs_supported_students_value) || 0,
          drugs_supported_students_patient_share: parseFloat(formData.drugs_supported_students_patient_share) || 0,
          drugs_supported_infants_value: parseFloat(formData.drugs_supported_infants_value) || 0,
          drugs_supported_infants_patient_share: parseFloat(formData.drugs_supported_infants_patient_share) || 0,
      };

      const id = await invoke('save_monthly_drugs_dispensed', { data: payload });
      setCurrentId(id);

      await invoke('log_frontend_action', {
        userId: user ? user.id : null,
        action: currentId ? 'UPDATE' : 'INSERT',
        tableName: 'monthly_drugs_dispensed',
        recordId: id.toString(),
        details: `تم حفظ بيانات المنصرف الشهري لفرع ${hierarchy.branchId} شهر ${hierarchy.dispenseMonth}`
      });

      toast.success('تم حفظ البيانات بنجاح');
      setFormData({
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
        supplies_total_value: 0,
        notes: '',
      });
      setCurrentId(null);
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

  const monthLocked = hierarchy?.dispenseMonth ? checkIsMonthLocked(hierarchy.dispenseMonth) : false;
  const lockIsManual = monthLocked ? manualLockedMonths[hierarchy?.dispenseMonth] !== undefined : false;
  const lockIsSmart = monthLocked ? (manualLockedMonths[hierarchy?.dispenseMonth] === undefined) : false;

  return (
    <div className="space-y-6 animate-fadeIn" dir="rtl">

      {/* Lock Notification Banner */}
      {monthLocked && (
        <LockNotificationBanner
          dispenseMonth={hierarchy?.dispenseMonth}
          isLocked={true}
          isManual={lockIsManual}
          isSmart={lockIsSmart}
        />
      )}

      {/* Free Drugs Section */}
      {(mode === 'all' || mode === 'free') && (
        <section className="space-y-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2.5 rounded-xl bg-[var(--color-accent-cyan-bg)] text-[var(--color-accent-cyan)] shadow-sm border border-[var(--color-border)]">
              <Gift size={22} />
            </div>
            <div>
              <h3 className="text-lg font-black text-[var(--color-text)]">تقسيمات الصرف (الأدوية المجانية)</h3>
            </div>
          </div>
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
                    className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] outline-none p-3 rounded-xl text-base font-bold text-center text-[var(--color-text)] focus:ring-2 focus:ring-[var(--color-primary)]/20 focus:border-[var(--color-primary)] transition-all"
                  />
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-[var(--color-text-muted)]">جنيه</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Supported Drugs Section */}
      {(mode === 'all' || mode === 'supported') && (
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
                    className={`w-full bg-[var(--color-bg)] border outline-none p-3 rounded-xl text-base font-bold text-center text-[var(--color-text)] focus:ring-2 transition-all ${type === 'value' ? 'border-[var(--color-success)]/30 focus:ring-[var(--color-success)]/20 focus:border-[var(--color-success)]' : 'border-[var(--color-warning)]/30 focus:ring-[var(--color-warning)]/20 focus:border-[var(--color-warning)]'}`}
                  />
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-[var(--color-text-muted)]">ج.م</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Medical Supplies Section */}
      {(mode === 'all' || mode === 'supplies') && (
        <section className="space-y-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2.5 rounded-xl bg-[var(--color-info-bg)] text-[var(--color-info)] shadow-sm border border-[var(--color-info)]/20">
              <Layers size={22} />
            </div>
            <div>
              <h3 className="text-lg font-black text-[var(--color-text)]">المستلزمات الطبية</h3>
            </div>
          </div>
          <div className="max-w-md">
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-xs font-bold text-[var(--color-text-muted)]">
                <Layers size={14} />
                <span>إجمالي قيمة المستلزمات</span>
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={formData.supplies_total_value || ''}
                  onChange={(e) => handleChange('supplies_total_value', e.target.value)}
                  className="w-full bg-[var(--color-bg)] border border-[var(--color-info)]/30 outline-none p-3 rounded-xl text-xl font-black text-center text-[var(--color-info)] focus:ring-2 focus:ring-[var(--color-info)]/20 focus:border-[var(--color-info)] transition-all"
                />
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-[var(--color-text-muted)]">ج.م</span>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Notes */}
      <div className="space-y-2">
        <label className="flex items-center gap-2 text-xs font-bold text-[var(--color-text-muted)]">
          <FileText size={14} />
          <span>ملاحظات</span>
        </label>
        <textarea
          rows="3"
          className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] outline-none p-4 rounded-xl text-sm font-medium text-right text-[var(--color-text)] focus:ring-2 focus:ring-[var(--color-primary)]/20 focus:border-[var(--color-primary)] transition-all resize-none"
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
              if (mode === 'free') return key.startsWith('drugs_free');
              if (mode === 'supported') return key.startsWith('drugs_supported') && key.endsWith('value');
              if (mode === 'supplies') return key === 'supplies_total_value';
              return true;
            })
            .reduce((sum, [_, val]) => sum + (parseFloat(val) || 0), 0)
            .toLocaleString(undefined, { maximumFractionDigits: 4 })}
        </span>
        <span className="text-xs font-bold opacity-70 mt-1 block">إجمالي المنصرف (جنيه)</span>
      </div>

      <div className="flex gap-4">
        <button
          onClick={resetForm}
          className="flex-1 flex items-center justify-center gap-2 py-4 rounded-2xl font-black text-base transition-all bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-text)] hover:bg-slate-50"
        >
          <RotateCcw size={22} />
          <span>تفريغ الصناديق</span>
        </button>
        <button 
          onClick={handleSave} 
          disabled={saving || !hierarchy?.branchId || checkIsMonthLocked(hierarchy.dispenseMonth)} 
          className={`flex-[3] flex items-center justify-center gap-3 py-4 rounded-2xl font-black text-base transition-all duration-300 shadow-lg ${saving || !hierarchy?.branchId || checkIsMonthLocked(hierarchy.dispenseMonth) ? 'bg-[var(--color-bg)] text-[var(--color-text-muted)] cursor-not-allowed border border-[var(--color-border)]' : 'bg-gradient-to-r from-[var(--color-primary)] to-cyan-500 text-white hover:shadow-xl hover:-translate-y-1 hover:shadow-cyan-500/50 shadow-cyan-500/30 active:translate-y-0 active:scale-[0.98]'}`}
        >
          {saving ? <Loader2 size={22} className="animate-spin" /> : (checkIsMonthLocked(hierarchy.dispenseMonth) ? <Lock size={22} /> : <Save size={22} />)}
          <span>{saving ? 'جاري الحفظ...' : (checkIsMonthLocked(hierarchy.dispenseMonth) ? 'الشهر مقفل' : '✓ حفظ سجل الصرف')}</span>
        </button>
      </div>
    </div>
  );
};

export default MonthlyDispensedForm;
