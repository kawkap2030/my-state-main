import React, { useState } from 'react';
import { Pill, DollarSign, Hash, Save, Loader2 } from 'lucide-react';
import invoke from '../../api/tauriApi';

const DrugGroupsForm = ({ hierarchy }) => {
  const [formData, setFormData] = useState({ name: '', cost: 0, group_code_id: null });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  const handleChange = (field, value) => setFormData(prev => ({ ...prev, [field]: value }));

  const handleSave = async () => {
    if (!hierarchy?.branchId) { setMessage({ type: 'error', text: 'يرجى اختيار الفرع على الأقل' }); return; }
    if (!formData.name) { setMessage({ type: 'error', text: 'يرجى إدخال اسم المجموعة الدوائية' }); return; }
    setSaving(true); setMessage(null);
    try {
      await invoke('save_drug_group', {
        data: {
          id: null, name: formData.name, cost: parseFloat(formData.cost) || 0,
          clinic_id: hierarchy.clinicId ? parseInt(hierarchy.clinicId) : null,
          area_id: hierarchy.areaId ? parseInt(hierarchy.areaId) : null,
          branch_id: hierarchy.branchId ? parseInt(hierarchy.branchId) : null,
          dispense_month: hierarchy.dispenseMonth,
          group_code_id: formData.group_code_id ? parseInt(formData.group_code_id) : null,
        }
      });
      setMessage({ type: 'success', text: 'تم حفظ بيانات المجموعة الدوائية بنجاح' });
      setFormData({ name: '', cost: 0, group_code_id: null });
    } catch (error) {
      setMessage({ type: 'error', text: `خطأ: ${error}` });
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-8" dir="rtl">
      {message && <div className={message.type === 'success' ? 'alert-success' : 'alert-error'}>{message.text}</div>}

      <section>
        <div className="section-title">
          <div className="section-icon" style={{ background: '#F5F3FF', color: 'var(--color-purple)' }}><Pill size={24} /></div>
          <div>
            <h3 className="text-base font-bold" style={{ color: 'var(--color-text)' }}>تكلفة المجموعات الدوائية</h3>
            <p className="text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>تسجيل تكلفة المجموعة حسب العيادة والشهر</p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="neu-card p-5">
            <label className="field-label"><Pill size={16} /><span>اسم المجموعة الدوائية</span></label>
            <input type="text" placeholder="مثال: مضادات حيوية" value={formData.name} onChange={(e) => handleChange('name', e.target.value)} className="neu-input" style={{ textAlign: 'right' }} />
          </div>
          <div className="neu-card p-5" style={{ borderBottom: '3px solid var(--color-cta)' }}>
            <label className="field-label"><DollarSign size={16} /><span>التكلفة</span></label>
            <input type="number" step="0.01" placeholder="0.00" value={formData.cost || ''} onChange={(e) => handleChange('cost', e.target.value)} className="neu-input" style={{ textAlign: 'center', fontWeight: 700, fontSize: '18px' }} />
          </div>
          <div className="neu-card p-5">
            <label className="field-label"><Hash size={16} /><span>رمز المجموعة (اختياري)</span></label>
            <input type="number" placeholder="رقم الرمز" value={formData.group_code_id || ''} onChange={(e) => handleChange('group_code_id', e.target.value)} className="neu-input" style={{ textAlign: 'center', fontWeight: 700 }} />
          </div>
        </div>
      </section>

      <button onClick={handleSave} disabled={saving} className="neu-btn-purple">
        {saving ? <Loader2 size={20} className="animate-spin" /> : <Save size={20} />}
        <span>{saving ? 'جاري الحفظ...' : 'حفظ تكلفة المجموعة'}</span>
      </button>
    </div>
  );
};

export default DrugGroupsForm;
