import React, { useState, useEffect } from 'react';
import invoke from '../../api/tauriApi';
import { 
  Package, Tag, Layers, ArrowRight, Save, 
  Trash2, Plus, DollarSign, Calculator, Loader2, RotateCcw
} from 'lucide-react';
import Button from '../ui/Button';
import Card from '../ui/Card';
import Input from '../ui/Input';
import Select from '../ui/Select';
import AutoComplete from '../ui/AutoComplete';
import { useToast } from '../ui/Toast';
import { useGlobalApp } from '../../context/useGlobalApp';
import useKeyboardShortcuts from '../../hooks/useKeyboardShortcuts';
import { Lock } from 'lucide-react';

const DetailedSuppliesForm = ({ hierarchy, onSuccess, currentRecord, onCancelEdit }) => {
  const { checkIsMonthLocked } = useGlobalApp();
  const toast = useToast();
  const [mode, setMode] = useState('supply'); // 'supply' or 'category'
  const [categories, setCategories] = useState([]);
  const [supplies, setSupplies] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    supply_id: '',
    category_id: '',
    consumer_value: '',
    collective_entities_value: '',
    notes: ''
  });

  useEffect(() => {
    fetchMasterData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (currentRecord) {
      const isSupply = currentRecord.supply_id != null;
      setMode(isSupply ? 'supply' : 'category');
      setFormData({
        supply_id: currentRecord.supply_id?.toString() || '',
        category_id: currentRecord.category_id?.toString() || '',
        consumer_value: currentRecord.consumer_value?.toString() || '',
        collective_entities_value: currentRecord.collective_entities_value?.toString() || '',
        notes: currentRecord.notes || ''
      });
    } else {
      setFormData({
        supply_id: '',
        category_id: '',
        consumer_value: '',
        collective_entities_value: '',
        notes: ''
      });
    }
  }, [currentRecord]);

  const resetForm = () => {
    setFormData({
      supply_id: '',
      category_id: '',
      consumer_value: '',
      collective_entities_value: '',
      notes: ''
    });
    if (onCancelEdit) onCancelEdit();
    toast.info("تم تفريغ الصناديق");
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

  const fetchMasterData = async () => {
    setLoading(true);
    try {
      const [catList, supList] = await Promise.all([
        invoke('get_supply_categories'),
        invoke('get_supplies')
      ]);
      setCategories(catList);
      setSupplies(supList);
    } catch (error) {
      toast.error("فشل في تحميل بيانات المستلزمات");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (mode === 'supply' && !formData.supply_id) return toast.warning("يرجى اختيار المستلزم");
    if (mode === 'category' && !formData.category_id) return toast.warning("يرجى اختيار التصنيف");
    
    // Enforcement: If category has supplies, don't allow general entry
    if (mode === 'category') {
      const hasSupplies = supplies.some(s => s.category_id === parseInt(formData.category_id));
      if (hasSupplies) {
        return toast.error("لا يمكن الإدخال كإجمالي لهذا التصنيف لأنه يحتوي على مستلزمات تفصيلية. يرجى الإدخال لكل مستلزم على حدة.");
      }
    }
    
    setSaving(true);
    try {
      await invoke('save_detailed_supply_dispensed', {
        id: currentRecord ? currentRecord.id : null,
        clinicId: hierarchy.clinicId ? parseInt(hierarchy.clinicId) : null,
        areaId: hierarchy.areaId ? parseInt(hierarchy.areaId) : null,
        branchId: parseInt(hierarchy.branchId),
        supplyId: mode === 'supply' ? parseInt(formData.supply_id) : null,
        categoryId: mode === 'category' ? parseInt(formData.category_id) : null,
        consumerValue: parseFloat(formData.consumer_value || 0),
        collectiveEntitiesValue: parseFloat(formData.collective_entities_value || 0),
        dispenseMonth: hierarchy.dispenseMonth,
        notes: formData.notes
      });
      
      toast.success("تم حفظ السجل بنجاح");
      setFormData({
        supply_id: '',
        category_id: '',
        consumer_value: '',
        collective_entities_value: '',
        notes: ''
      });
      if (onCancelEdit) onCancelEdit(); // Clear edit mode if it was active
      if (onSuccess) onSuccess();
    } catch (error) {
      toast.error(`فشل الحفظ: ${error}`);
    } finally {
      setSaving(false);
    }
  };

  const totalValue = (parseFloat(formData.consumer_value || 0) + parseFloat(formData.collective_entities_value || 0)).toFixed(2);

  if (loading) return (
    <div className="flex items-center justify-center p-12">
      <Loader2 className="animate-spin text-blue-500" size={32} />
    </div>
  );

  return (
    <form onSubmit={handleSave} className="space-y-8 animate-fadeIn">
      {/* Mode Switcher */}
      <div className="bg-[var(--color-bg)] p-1.5 rounded-2xl flex items-center gap-2 max-w-sm border border-[var(--color-border)]">
        <button
          type="button"
          onClick={() => setMode('supply')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-black transition-all ${
            mode === 'supply' 
              ? 'bg-[var(--color-bg-card)] text-[var(--color-info)] shadow-sm' 
              : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
          }`}
        >
          <Package size={16} />
          صرف مستلزم
        </button>
        <button
          type="button"
          onClick={() => setMode('category')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-black transition-all ${
            mode === 'category' 
              ? 'bg-[var(--color-bg-card)] text-[var(--color-info)] shadow-sm' 
              : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
          }`}
        >
          <Tag size={16} />
          صرف تصنيف
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Selection Area */}
        <div className="space-y-6">
          {mode === 'supply' ? (
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block pr-2">المستلزم الطبي</label>
              <AutoComplete
                options={supplies}
                value={formData.supply_id}
                onChange={(val) => setFormData({ ...formData, supply_id: val })}
                placeholder="ابحث عن مستلزم..."
                getOptionLabel={(opt) => `${opt.name} (${categories.find(c => c.id === opt.category_id)?.name || '---'})`}
              />
            </div>
          ) : (
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block pr-2">تصنيف المستلزمات</label>
              <Select
                options={categories.map(c => ({ value: c.id, label: c.name }))}
                value={formData.category_id}
                onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
                placeholder="اختر التصنيف..."
                className="w-full"
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className={`text-[10px] font-black uppercase tracking-widest block pr-2 ${mode === 'supply' ? 'text-[var(--color-text-muted)]' : 'text-[var(--color-border)]'}`}>قيمة المستلزم</label>
              <div className="relative">
                <input
                  type="number"
                  step="0.01"
                  value={formData.consumer_value}
                  onChange={(e) => setFormData({ ...formData, consumer_value: e.target.value })}
                  placeholder="0.00"
                  disabled={mode !== 'supply'}
                  className={`w-full bg-[var(--color-bg)] border-none outline-none p-4 rounded-2xl text-xl font-black text-center text-[var(--color-text)] transition-all ${mode === 'supply' ? 'focus:ring-2 focus:ring-[var(--color-info)]/20' : 'opacity-50 cursor-not-allowed grayscale'}`}
                />
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[10px] font-bold text-[var(--color-text-muted)]">ج.م</span>
              </div>
            </div>
            <div className="space-y-2">
              <label className={`text-[10px] font-black uppercase tracking-widest block pr-2 ${mode === 'category' ? 'text-[var(--color-text-muted)]' : 'text-[var(--color-border)]'}`}>قيمة التصنيف</label>
              <div className="relative">
                <input
                  type="number"
                  step="0.01"
                  value={formData.collective_entities_value}
                  onChange={(e) => setFormData({ ...formData, collective_entities_value: e.target.value })}
                  placeholder="0.00"
                  disabled={mode !== 'category'}
                  className={`w-full bg-[var(--color-bg)] border-none outline-none p-4 rounded-2xl text-xl font-black text-center text-[var(--color-text)] transition-all ${mode === 'category' ? 'focus:ring-2 focus:ring-[var(--color-info)]/20' : 'opacity-50 cursor-not-allowed grayscale'}`}
                />
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[10px] font-bold text-[var(--color-text-muted)]">ج.م</span>
              </div>
            </div>
          </div>
        </div>

        {/* Notes & Total */}
        <div className="space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-[var(--color-text-muted)] uppercase tracking-widest block pr-2">ملاحظات إضافية</label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="w-full bg-[var(--color-bg)] border-none outline-none p-4 rounded-2xl text-sm font-bold text-[var(--color-text)] h-[100px] resize-none focus:ring-2 focus:ring-[var(--color-info)]/20 transition-all"
              placeholder="اكتب أي ملاحظات هنا..."
            />
          </div>

          <div className="bg-[var(--color-info)] rounded-3xl p-6 text-white shadow-lg shadow-[var(--color-info)]/20 relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform">
              <Calculator size={80} />
            </div>
            <div className="relative z-10">
              <div className="text-[10px] font-black uppercase tracking-widest opacity-80 mb-2">إجمالي السجل الحالي</div>
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-black">{totalValue}</span>
                <span className="text-xs font-bold opacity-80">جنيه مصري</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-end pt-4 gap-4">
        <Button 
          type="button" 
          variant="secondary" 
          onClick={resetForm}
          icon={RotateCcw}
          className="px-8 py-4 rounded-2xl text-lg border border-[var(--color-border)]"
        >
          تفريغ
        </Button>
        {currentRecord && (
          <Button 
            type="button" 
            variant="ghost" 
            onClick={onCancelEdit}
            className="px-8 py-4 rounded-2xl text-lg border border-amber-500 text-amber-600 hover:bg-amber-50"
          >
            إلغاء التعديل
          </Button>
        )}
        <Button 
          type="submit" 
          variant="primary" 
          loading={saving}
          icon={checkIsMonthLocked(hierarchy.dispenseMonth) ? Lock : Save}
          disabled={checkIsMonthLocked(hierarchy.dispenseMonth)}
          className={`px-12 py-4 rounded-2xl text-lg shadow-xl ${checkIsMonthLocked(hierarchy.dispenseMonth) ? 'opacity-50 grayscale' : (currentRecord ? 'shadow-amber-100 bg-amber-500 hover:bg-amber-600' : 'shadow-blue-100')}`}
        >
          {checkIsMonthLocked(hierarchy.dispenseMonth) ? 'الشهر مقفل' : (currentRecord ? 'تحديث السجل' : 'حفظ السجل')}
        </Button>
      </div>
    </form>
  );
};

export default DetailedSuppliesForm;
