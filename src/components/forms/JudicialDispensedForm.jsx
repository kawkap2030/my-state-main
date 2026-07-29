import React, { useState } from 'react';
import { Scale, Stethoscope, Pill, Ruler, DollarSign, BarChart3, UserCheck, Save, Loader2 } from 'lucide-react';
import invoke from '../../api/tauriApi';

const JudicialDispensedForm = ({ hierarchy }) => {
  const [formData, setFormData] = useState({
    patient_id: '', diagnosis: '', medicine_name: '', unit: '',
    unit_price: 0, monthly_dose: 0,
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  const handleChange = (field, value) => setFormData(prev => ({ ...prev, [field]: value }));

  const calcCost = () => {
    const price = parseFloat(formData.unit_price) || 0;
    const dose = parseFloat(formData.monthly_dose) || 0;
    return (price * dose).toFixed(2);
  };

  const handleSave = async () => {
    if (!hierarchy?.areaId || !hierarchy?.clinicId) { setMessage({ type: 'error', text: 'يرجى اختيار المنطقة والعيادة أولاً' }); return; }
    if (!formData.patient_id || !formData.medicine_name) { setMessage({ type: 'error', text: 'يرجى إدخال رقم المريض واسم الدواء' }); return; }
    setSaving(true); setMessage(null);
    try {
      await invoke('save_judicial_dispensed', {
        data: {
          id: null, patient_id: parseInt(formData.patient_id), diagnosis: formData.diagnosis,
          medicine_name: formData.medicine_name, unit: formData.unit,
          unit_price: parseFloat(formData.unit_price) || 0,
          monthly_dose: parseFloat(formData.monthly_dose) || 0,
          monthly_cost: parseFloat(calcCost()),
          dispense_month: hierarchy.dispenseMonth,
          clinic_id: hierarchy.clinicId, area_id: hierarchy.areaId,
        }
      });
      setMessage({ type: 'success', text: 'تم حفظ بيانات أدوية الأحكام القضائية بنجاح' });
      setFormData({ patient_id: '', diagnosis: '', medicine_name: '', unit: '', unit_price: 0, monthly_dose: 0 });
    } catch (error) {
      setMessage({ type: 'error', text: `خطأ: ${error}` });
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-8" dir="rtl">
      {message && <div className={message.type === 'success' ? 'alert-success' : 'alert-error'}>{message.text}</div>}

      <section>
        <div className="section-title">
          <div className="section-icon" style={{ background: '#FEF2F2', color: 'var(--color-danger)' }}><Scale size={24} /></div>
          <div>
            <h3 className="text-base font-bold" style={{ color: 'var(--color-text)' }}>أدوية أحكام المحكمة</h3>
            <p className="text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>تسجيل الأدوية المصروفة بأحكام قضائية</p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="neu-card p-5">
            <label className="field-label"><UserCheck size={16} /><span>رقم المريض</span></label>
            <input type="number" placeholder="رقم المريض" value={formData.patient_id || ''} onChange={(e) => handleChange('patient_id', e.target.value)} className="neu-input" style={{ textAlign: 'center', fontWeight: 700 }} />
          </div>
          <div className="neu-card p-5">
            <label className="field-label"><Stethoscope size={16} /><span>التشخيص</span></label>
            <input type="text" placeholder="التشخيص" value={formData.diagnosis} onChange={(e) => handleChange('diagnosis', e.target.value)} className="neu-input" style={{ textAlign: 'right' }} />
          </div>
          <div className="neu-card p-5">
            <label className="field-label"><Pill size={16} /><span>اسم الدواء</span></label>
            <input type="text" placeholder="اسم الدواء" value={formData.medicine_name} onChange={(e) => handleChange('medicine_name', e.target.value)} className="neu-input" style={{ textAlign: 'right' }} />
          </div>
          <div className="neu-card p-5">
            <label className="field-label"><Ruler size={16} /><span>الوحدة</span></label>
            <input type="text" placeholder="مثال: حبة" value={formData.unit} onChange={(e) => handleChange('unit', e.target.value)} className="neu-input" style={{ textAlign: 'right' }} />
          </div>
          <div className="neu-card p-5" style={{ borderBottom: '3px solid var(--color-cta)' }}>
            <label className="field-label"><DollarSign size={16} /><span>سعر الوحدة</span></label>
            <input type="number" step="0.01" placeholder="0.00" value={formData.unit_price || ''} onChange={(e) => handleChange('unit_price', e.target.value)} className="neu-input" style={{ textAlign: 'center', fontWeight: 700, fontSize: '18px' }} />
          </div>
          <div className="neu-card p-5" style={{ borderBottom: '3px solid var(--color-warning)' }}>
            <label className="field-label"><BarChart3 size={16} /><span>الجرعة الشهرية</span></label>
            <input type="number" step="0.01" placeholder="0" value={formData.monthly_dose || ''} onChange={(e) => handleChange('monthly_dose', e.target.value)} className="neu-input" style={{ textAlign: 'center', fontWeight: 700, fontSize: '18px' }} />
          </div>
        </div>
      </section>

      {/* Auto-calculated cost */}
      <div className="neu-card p-6" style={{ background: 'linear-gradient(135deg, #ECFDF5, #F0FDFA)', borderRight: '4px solid var(--color-cta)' }}>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <span className="text-sm font-bold" style={{ color: 'var(--color-cta-dark)' }}>التكلفة الشهرية المحسوبة تلقائياً</span>
          <span className="text-3xl font-black" style={{ color: 'var(--color-cta-dark)' }}>
            {calcCost()} <span className="text-sm font-medium">د.ع</span>
          </span>
        </div>
      </div>

      <button onClick={handleSave} disabled={saving} className="neu-btn-danger">
        {saving ? <Loader2 size={20} className="animate-spin" /> : <Save size={20} />}
        <span>{saving ? 'جاري الحفظ...' : 'حفظ بيانات الحكم القضائي'}</span>
      </button>
    </div>
  );
};

export default JudicialDispensedForm;
