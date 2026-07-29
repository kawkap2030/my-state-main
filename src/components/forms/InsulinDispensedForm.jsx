import React, { useState } from 'react';
import { Syringe, BarChart3, Package, DollarSign, TrendingUp, Wallet, Users, Save, Loader2, Tag, Layers } from 'lucide-react';
import invoke from '../../api/tauriApi';

const InsulinDispensedForm = ({ hierarchy }) => {
  const [formData, setFormData] = useState({
    name: '', type_: '', unit: '', cases_count: 0, quantity: 0,
    price: 0, cost: 0, rate: 0, balance: 0, category: '', insulin_code_id: null,
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  const handleChange = (field, value) => setFormData(prev => ({ ...prev, [field]: value }));

  const handleSave = async () => {
    if (!hierarchy?.branchId) { setMessage({ type: 'error', text: 'يرجى اختيار الفرع أولاً' }); return; }
    if (!formData.name) { setMessage({ type: 'error', text: 'يرجى إدخال اسم الإنسولين' }); return; }
    setSaving(true); setMessage(null);
    try {
      await invoke('save_insulin_dispensed', {
        data: {
          id: null, name: formData.name, type_: formData.type_, unit: formData.unit,
          cases_count: parseInt(formData.cases_count) || 0, quantity: parseFloat(formData.quantity) || 0,
          price: parseFloat(formData.price) || 0, cost: parseFloat(formData.cost) || 0,
          rate: parseFloat(formData.rate) || 0, balance: parseFloat(formData.balance) || 0,
          category: formData.category, clinic_id: hierarchy.clinicId || 0, area_id: hierarchy.areaId || 0,
          dispense_month: hierarchy.dispenseMonth,
          insulin_code_id: formData.insulin_code_id ? parseInt(formData.insulin_code_id) : null,
        }
      });
      setMessage({ type: 'success', text: 'تم حفظ بيانات الإنسولين بنجاح' });
      setFormData({ name: '', type_: '', unit: '', cases_count: 0, quantity: 0, price: 0, cost: 0, rate: 0, balance: 0, category: '', insulin_code_id: null });
    } catch (error) {
      setMessage({ type: 'error', text: `خطأ: ${error}` });
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-8" dir="rtl">
      {message && <div className={message.type === 'success' ? 'alert-success' : 'alert-error'}>{message.text}</div>}

      {/* Insulin Info */}
      <section>
        <div className="section-title">
          <div className="section-icon" style={{ background: '#EFF6FF', color: '#2563EB' }}><Syringe size={24} /></div>
          <div>
            <h3 className="text-base font-bold" style={{ color: 'var(--color-text)' }}>بيانات الإنسولين</h3>
            <p className="text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>معلومات الصنف والتصنيف</p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { key: 'name', label: 'اسم الإنسولين', icon: Syringe, ph: 'مثال: Lantus' },
            { key: 'type_', label: 'النوع', icon: Tag, ph: 'مثال: طويل المفعول' },
            { key: 'unit', label: 'الوحدة', icon: Package, ph: 'مثال: قلم' },
            { key: 'category', label: 'التصنيف', icon: Layers, ph: 'مثال: أساسي' },
          ].map(({ key, label, icon: _Icon, ph }) => (
            <div key={key} className="neu-card p-5">
              <label className="field-label"><_Icon size={16} /><span>{label}</span></label>
              <input type="text" placeholder={ph} value={formData[key]} onChange={(e) => handleChange(key, e.target.value)} className="neu-input" style={{ textAlign: 'right' }} />
            </div>
          ))}
        </div>
      </section>

      {/* Quantities and Values */}
      <section>
        <div className="section-title">
          <div className="section-icon" style={{ background: '#ECFDF5', color: 'var(--color-cta)' }}><BarChart3 size={24} /></div>
          <div>
            <h3 className="text-base font-bold" style={{ color: 'var(--color-text)' }}>الكميات والقيم</h3>
            <p className="text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>البيانات الإحصائية والمالية</p>
          </div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            { key: 'cases_count', label: 'عدد الحالات', icon: Users, step: '1' },
            { key: 'quantity', label: 'الكمية', icon: Package, step: '0.01' },
            { key: 'price', label: 'السعر', icon: DollarSign, step: '0.01' },
            { key: 'cost', label: 'التكلفة', icon: DollarSign, step: '0.01' },
            { key: 'rate', label: 'المعدل', icon: TrendingUp, step: '0.01' },
            { key: 'balance', label: 'الرصيد', icon: Wallet, step: '0.01' },
          ].map(({ key, label, icon: _Icon, step }) => (
            <div key={key} className="neu-card p-5" style={{ borderBottom: '3px solid var(--color-cta)' }}>
              <label className="field-label"><_Icon size={16} /><span>{label}</span></label>
              <input type="number" step={step} placeholder="0" value={formData[key] || ''} onChange={(e) => handleChange(key, e.target.value)} className="neu-input" style={{ textAlign: 'center', fontWeight: 700, fontSize: '18px' }} />
            </div>
          ))}
        </div>
      </section>

      <button onClick={handleSave} disabled={saving} className="neu-btn-primary">
        {saving ? <Loader2 size={20} className="animate-spin" /> : <Save size={20} />}
        <span>{saving ? 'جاري الحفظ...' : 'حفظ بيانات الإنسولين'}</span>
      </button>
    </div>
  );
};

export default InsulinDispensedForm;
