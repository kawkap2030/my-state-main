import React, { useState, useEffect, useRef } from 'react';
import PageHeader from '../../../components/ui/PageHeader';
import Breadcrumb from '../../../components/ui/Breadcrumb';
import Card from '../../../components/ui/Card';
import Button from '../../../components/ui/Button';
import Table from '../../../components/ui/Table';
import Modal from '../../../components/ui/Modal';
import Input from '../../../components/ui/Input';
import Select from '../../../components/ui/Select';
import AutoComplete from '../../../components/ui/AutoComplete';
import { useToast } from '../../../components/ui/Toast';
import invoke from '../../../api/tauriApi';
import { Layers, Box, Plus, Search, Upload, FileText, Copy, Trash2 } from 'lucide-react';

const SuppliesManagementPage = () => {
  const [activeTab, setActiveTab] = useState('supplies');
  const [, setLoading] = useState(false);
  const toast = useToast();

  const [supplies, setSupplies] = useState([]);
  const [categories, setCategories] = useState([]);

  // Single Add/Edit Modal
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState(null);
  const [formData, setFormData] = useState({});
  const [saving, setSaving] = useState(false);

  // Bulk Import Modal
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [bulkCategoryId, setBulkCategoryId] = useState('');
  const [bulkUnit, setBulkUnit] = useState('');
  const [bulkSaving, setBulkSaving] = useState(false);
  const fileInputRef = useRef(null);

  // Selection
  const [selectedIds, setSelectedIds] = useState([]);

  // Filtering
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('');

  useEffect(() => { 
    fetchData(); 
    setSelectedIds([]); // Clear selection when tab changes
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'supplies') {
        const [s, c] = await Promise.all([invoke('get_supplies'), invoke('get_supply_categories')]);
        setSupplies(s);
        setCategories(c);
      } else {
        setCategories(await invoke('get_supply_categories'));
      }
    } catch (err) {
      console.error(err);
      toast.error(`خطأ في تحميل البيانات: ${err}`);
    } finally { setLoading(false); }
  };

  const handleOpenAdd = () => { setEditId(null); setFormData({}); setShowModal(true); };
  const handleOpenEdit = (item) => { setEditId(item.id); setFormData({ ...item }); setShowModal(true); };

  const handleDelete = async (item) => {
    if (!window.confirm(`هل أنت متأكد من حذف "${item.name}"؟`)) return;
    try {
      const cmd = activeTab === 'supplies' ? 'delete_supply' : 'delete_supply_category';
      await invoke(cmd, { id: item.id });
      toast.success('تم الحذف بنجاح');
      fetchData();
    } catch (err) { toast.error(err.toString()); }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!window.confirm(`هل أنت متأكد من حذف ${selectedIds.length} عنصر؟ سيتم حذف العناصر غير المستخدمة فقط واستثناء العناصر المرتبطة بسجلات.`)) return;
    
    setLoading(true);
    try {
      const cmd = activeTab === 'supplies' ? 'bulk_delete_supplies' : 'bulk_delete_supply_categories';
      
      const result = await invoke(cmd, { ids: selectedIds });
      const { deleted, skipped } = result;
      
      let msg = `تم حذف ${deleted} عنصر بنجاح.`;
      if (skipped > 0) {
        msg += ` تم تخطي ${skipped} عنصر لوجود سجلات مرتبطة بها.`;
      }
      
      toast.info(msg);
      setSelectedIds([]);
      fetchData();
    } catch (err) {
      toast.error(`فشل الحذف الجماعي: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!formData.name || !formData.name.trim()) { toast.warning('يرجى إدخال الاسم'); return; }
    setSaving(true);
    try {
      if (activeTab === 'supplies') {
        if (!formData.category_id) { toast.warning('يرجى اختيار التصنيف'); setSaving(false); return; }
        const payload = { name: formData.name.trim(), categoryId: parseInt(formData.category_id), unit: formData.unit || null, description: formData.description || null };
        if (editId) await invoke('update_supply', { id: editId, ...payload });
        else await invoke('add_supply', payload);
      } else {
        const payload = { name: formData.name.trim(), description: formData.description || null };
        if (editId) await invoke('update_supply_category', { id: editId, ...payload });
        else await invoke('add_supply_category', payload);
      }
      toast.success(editId ? 'تم التعديل بنجاح' : 'تمت الإضافة بنجاح');
      setShowModal(false);
      fetchData();
    } catch (err) { toast.error(`فشل الحفظ: ${err}`); }
    finally { setSaving(false); }
  };

  // ─── Bulk Import ──────────────────────────────────
  const handleOpenBulk = async () => {
    try { setCategories(await invoke('get_supply_categories')); } catch {}
    setBulkText(''); setBulkCategoryId(''); setBulkUnit(''); setShowBulkModal(true);
  };

  const handleFileImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const ext = file.name.split('.').pop().toLowerCase();
    if (ext === 'xlsx' || ext === 'xls') {
      try {
        const XLSX = await import('xlsx');
        const ab = await file.arrayBuffer();
        const wb = XLSX.read(ab, { type: 'array' });
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
        const names = [];
        for (const row of rows) {
          if (!row || row.length === 0) continue;
          let nameVal = '';
          for (let i = 0; i < row.length; i++) {
            const cell = (row[i] || '').toString().trim();
            if (cell && isNaN(Number(cell))) { nameVal = cell; break; }
            else if (cell && !nameVal) nameVal = cell;
          }
          if (nameVal) names.push(nameVal);
        }
        setBulkText(names.join('\n'));
        toast.success(`تم استيراد ${names.length} اسم من ملف Excel`);
      } catch { toast.error('فشل قراءة ملف Excel'); }
    } else {
      const reader = new FileReader();
      reader.onload = (event) => {
        const lines = event.target.result.split('\n').map(line => {
          const parts = line.split(',');
          let nameVal = '';
          for (let i = 0; i < parts.length; i++) {
            const cell = (parts[i] || '').trim();
            if (cell && isNaN(Number(cell))) { nameVal = cell; break; }
            else if (cell && !nameVal) nameVal = cell;
          }
          return nameVal;
        }).filter(n => n.length > 0);
        setBulkText(lines.join('\n'));
        toast.success(`تم استيراد ${lines.length} اسم من الملف`);
      };
      reader.readAsText(file);
    }
    e.target.value = '';
  };

  const bulkPreviewCount = bulkText.split('\n').map(n => n.trim()).filter(n => n.length > 0).length;

  const handleBulkSave = async () => {
    if (activeTab === 'supplies' && !bulkCategoryId) { toast.warning('يرجى اختيار التصنيف'); return; }
    if (!bulkText.trim()) { toast.warning('يرجى إدخال الأسماء'); return; }
    const names = bulkText.split('\n').map(n => n.trim()).filter(n => n.length > 0);
    if (names.length === 0) { toast.warning('لم يتم العثور على أسماء صالحة'); return; }
    setBulkSaving(true);
    try {
      let result;
      if (activeTab === 'supplies') {
        result = await invoke('bulk_add_supplies', { names, categoryId: parseInt(bulkCategoryId), unit: bulkUnit || null });
      } else {
        result = await invoke('bulk_add_supply_categories', { names });
      }
      const { added, skipped } = result;
      let msg = `تم إضافة ${added} عنصر بنجاح.`;
      if (skipped > 0) msg += ` وتم تخطي ${skipped} عنصر لأنها موجودة مسبقاً.`;
      toast.success(msg);
      setShowBulkModal(false);
      fetchData();
    } catch (err) { toast.error(`فشل الإضافة الجماعية: ${err}`); }
    finally { setBulkSaving(false); }
  };

  // ─── Filtered Data ──────────────────────────────────
  const filteredSupplies = supplies.filter(s => {
    const matchSearch = !search || s.name?.includes(search);
    const matchCategory = !filterCategory || s.category_id === parseInt(filterCategory);
    return matchSearch && matchCategory;
  });

  const supplyColumns = [
    { header: '#', accessor: 'id' },
    { header: 'اسم المستلزم', accessor: 'name' },
    { header: 'التصنيف', render: (s) => categories.find(c => c.id === s.category_id)?.name || '—' },
    { header: 'الوحدة', accessor: 'unit' },
  ];
  const simpleColumns = [
    { header: '#', accessor: 'id' },
    { header: 'الاسم', accessor: 'name' },
  ];

  return (
    <div className="space-y-6 animate-fadeIn" dir="rtl">
      <Breadcrumb items={[{ label: 'البيانات الأساسية' }, { label: 'إدارة المستلزمات' }]} />
      
      <PageHeader 
        title="إدارة المستلزمات" 
        icon={Layers} 
        description="تكويد المستلزمات الطبية وتصنيفاتها."
        actions={
          <div className="flex gap-2 flex-wrap">
            {selectedIds.length > 0 && (
              <Button variant="danger" icon={Trash2} onClick={handleBulkDelete}>
                حذف المحدد ({selectedIds.length})
              </Button>
            )}
            <Button variant="ghost" icon={Upload} onClick={handleOpenBulk}
              style={{ border: '1px solid var(--color-primary)', color: 'var(--color-primary)' }}>
              إدخال جماعي
            </Button>
            <Button variant="primary" icon={Plus} onClick={handleOpenAdd}>
              {activeTab === 'supplies' ? 'إضافة مستلزم' : 'إضافة تصنيف'}
            </Button>
          </div>
        }
      />

      {/* Tabs */}
      <div className="flex gap-4 overflow-x-auto pb-2">
        <button className={`neu-tab ${activeTab === 'supplies' ? 'active' : ''}`} onClick={() => { setActiveTab('supplies'); setSearch(''); setFilterCategory(''); }}>
          <Box size={18} />المستلزمات
        </button>
        <button className={`neu-tab ${activeTab === 'categories' ? 'active' : ''}`} onClick={() => { setActiveTab('categories'); setSearch(''); }}>
          <Layers size={18} />التصنيفات
        </button>
      </div>

      {/* Search & Filter (Supplies tab only) */}
      {activeTab === 'supplies' && (
        <div className="flex gap-4 flex-wrap">
          <div className="flex-1" style={{ minWidth: '200px' }}>
            <Input icon={Search} placeholder="بحث باسم المستلزم..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div style={{ minWidth: '200px' }}>
            <AutoComplete
              value={filterCategory}
              onChange={(val) => setFilterCategory(val != null && val !== '' ? String(val) : '')}
              options={categories}
              placeholder="كل التصنيفات"
              icon={Layers}
              label={null}
            />
          </div>
        </div>
      )}

      {/* Data Table */}
      <Card className="p-0 overflow-hidden">
        {activeTab === 'supplies' && (
          <Table columns={supplyColumns} data={filteredSupplies} onEdit={handleOpenEdit} onDelete={handleDelete}
            selectedIds={selectedIds} onSelectionChange={setSelectedIds}
            emptyMessage="لا توجد مستلزمات. أضف مستلزمات جديدة أو استخدم الإدخال الجماعي." />
        )}
        {activeTab === 'categories' && (
          <Table columns={simpleColumns} data={categories} onEdit={handleOpenEdit} onDelete={handleDelete}
            selectedIds={selectedIds} onSelectionChange={setSelectedIds}
            emptyMessage="لا توجد تصنيفات. أضف تصنيفاً جديداً." />
        )}
      </Card>

      {/* ─── Single Add/Edit Modal ──────────────────── */}
      <Modal 
        isOpen={showModal} onClose={() => setShowModal(false)} 
        title={editId ? `تعديل ${activeTab === 'supplies' ? 'المستلزم' : 'التصنيف'}` : `إضافة ${activeTab === 'supplies' ? 'مستلزم جديد' : 'تصنيف جديد'}`}
      >
        <form onSubmit={handleSave} className="space-y-4">
          <Input label="الاسم" value={formData.name || ''} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required style={{ textAlign: 'right' }} />
          {activeTab === 'supplies' && (
            <>
              <AutoComplete
                value={formData.category_id || ''}
                onChange={(val) => setFormData({ ...formData, category_id: val ? parseInt(val) : '' })}
                options={categories}
                label="التصنيف"
                icon={Layers}
                placeholder="ابحث عن تصنيف..."
              />
              <Input label="الوحدة" icon={Box} value={formData.unit || ''} onChange={(e) => setFormData({ ...formData, unit: e.target.value })} style={{ textAlign: 'right' }} />
              <Input label="ملاحظات (اختياري)" value={formData.description || ''} onChange={(e) => setFormData({ ...formData, description: e.target.value })} style={{ textAlign: 'right' }} />
            </>
          )}
          {activeTab === 'categories' && (
            <Input label="الوصف (اختياري)" value={formData.description || ''} onChange={(e) => setFormData({ ...formData, description: e.target.value })} style={{ textAlign: 'right' }} />
          )}
          <div className="flex gap-4 pt-4">
            <Button variant="primary" type="submit" loading={saving} className="flex-1">{editId ? 'تحديث' : 'إضافة'}</Button>
            <Button variant="ghost" type="button" onClick={() => setShowModal(false)} className="flex-1">إلغاء</Button>
          </div>
        </form>
      </Modal>

      {/* ─── Bulk Import Modal ───────────────────────── */}
      <Modal isOpen={showBulkModal} onClose={() => setShowBulkModal(false)}
        title={`إدخال جماعي ${activeTab === 'supplies' ? 'للمستلزمات' : 'للتصنيفات'}`} wide>
        <div className="space-y-4">
          <div className="p-3 rounded-xl text-sm" style={{ background: 'var(--color-bg)', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}>
            💡 الصق الأسماء (كل اسم في سطر) أو استورد من ملف (نصي أو Excel). {activeTab === 'supplies' && 'سيتم إضافة الكل بنفس التصنيف والوحدة.'}
          </div>

          {activeTab === 'supplies' && (
            <div className="flex gap-4 flex-wrap">
              <div className="flex-1" style={{ minWidth: '180px' }}>
                <Select label="التصنيف *" icon={Layers}
                  options={categories.map(c => ({ value: c.id, label: c.name }))}
                  value={bulkCategoryId} onChange={(e) => setBulkCategoryId(e.target.value)}
                  placeholder="اختر التصنيف..." />
              </div>
              <div className="flex-1" style={{ minWidth: '180px' }}>
                <Input label="الوحدة (اختياري)" icon={Box} value={bulkUnit} onChange={(e) => setBulkUnit(e.target.value)} placeholder="مثال: قطعة، بكرة..." style={{ textAlign: 'right' }} />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold mb-2 uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>الأسماء (كل اسم في سطر) *</label>
            <textarea value={bulkText} onChange={(e) => setBulkText(e.target.value)} placeholder={"عنصر 1\nعنصر 2\nعنصر 3\n..."} rows={6}
              className="neu-input w-full" style={{ resize: 'vertical', minHeight: '100px', maxHeight: '200px', textAlign: 'right', fontFamily: 'inherit' }} />
            {bulkText.trim() && <p className="text-xs mt-1 font-bold" style={{ color: 'var(--color-primary)' }}>سيتم إضافة {bulkPreviewCount} عنصر</p>}
          </div>

          <div className="flex gap-2 flex-wrap">
            <input ref={fileInputRef} type="file" accept=".txt,.csv,.xlsx,.xls" onChange={handleFileImport} style={{ display: 'none' }} />
            <Button variant="ghost" type="button" icon={FileText} onClick={() => fileInputRef.current?.click()}
              style={{ border: '1px dashed var(--color-border)', fontSize: '13px' }}>استيراد من ملف (TXT / CSV / Excel)</Button>
            <Button variant="ghost" type="button" icon={Copy} onClick={async () => {
              try { const text = await navigator.clipboard.readText(); setBulkText(text); toast.success('تم اللصق من الحافظة'); }
              catch { toast.error('فشل القراءة من الحافظة'); }
            }} style={{ border: '1px dashed var(--color-border)', fontSize: '13px' }}>لصق من الحافظة</Button>
          </div>

          <div className="flex gap-4 pt-2" style={{ borderTop: '1px solid var(--color-border)', paddingTop: '12px' }}>
            <Button variant="primary" type="button" onClick={handleBulkSave} loading={bulkSaving} className="flex-1" icon={Upload}>
              إضافة {bulkPreviewCount > 0 ? `(${bulkPreviewCount})` : ''} عنصر
            </Button>
            <Button variant="ghost" type="button" onClick={() => setShowBulkModal(false)} className="flex-1">إلغاء</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default SuppliesManagementPage;
