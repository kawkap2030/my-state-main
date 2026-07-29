import React, { useState, useEffect, useRef } from 'react';
import PageHeader from '../../../components/ui/PageHeader';
import Breadcrumb from '../../../components/ui/Breadcrumb';
import Card from '../../../components/ui/Card';
import Button from '../../../components/ui/Button';
import Table from '../../../components/ui/Table';
import Modal from '../../../components/ui/Modal';
import Input from '../../../components/ui/Input';
import { useToast } from '../../../components/ui/Toast';
import invoke from '../../../api/tauriApi';
import { Pill, Plus, Search, Upload, FileText, Copy, Trash2 } from 'lucide-react';

const DrugGroupsManagementPage = () => {
  const [loading, setLoading] = useState(false);
  const toast = useToast();
  const [groups, setGroups] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState(null);
  const [formData, setFormData] = useState({ name: '', code: '', description: '' });
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  
  // Bulk Import State
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [bulkSaving, setBulkSaving] = useState(false);
  const fileInputRef = useRef(null);

  // Selection
  const [selectedIds, setSelectedIds] = useState([]);

  useEffect(() => {
    fetchData();
    setSelectedIds([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const g = await invoke('get_drug_groups');
      setGroups(g);
    } catch (err) {
      toast.error('خطأ في تحميل البيانات');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenAdd = () => {
    setEditId(null);
    setFormData({ name: '', code: '', description: '' });
    setShowModal(true);
  };

  const handleOpenEdit = (item) => {
    setEditId(item.id);
    setFormData({ 
        name: item.name, 
        code: item.code?.toString() || '', 
        description: item.description || '' 
    });
    setShowModal(true);
  };

  const handleDelete = async (item) => {
    if (!window.confirm(`هل أنت متأكد من حذف المجموعة "${item.name}"؟`)) return;
    try {
      await invoke('delete_drug_group_code', { id: item.id });
      toast.success('تم الحذف بنجاح');
      fetchData();
    } catch (err) {
      toast.error(err.toString());
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!window.confirm(`هل أنت متأكد من حذف ${selectedIds.length} مجموعة؟ سيتم حذف المجموعات غير المستخدمة فقط واستثناء المجموعات المرتبطة بسجلات.`)) return;
    
    setLoading(true);
    try {
      const result = await invoke('bulk_delete_drug_group_codes', { ids: selectedIds });
      const { deleted, skipped } = result;
      
      let msg = `تم حذف ${deleted} مجموعة بنجاح.`;
      if (skipped > 0) {
        msg += ` تم تخطي ${skipped} مجموعة لوجود سجلات مرتبطة بها.`;
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
    if (!formData.name.trim()) {
      toast.warning('يرجى إدخال اسم المجموعة');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: formData.name.trim(),
        code: formData.code ? parseInt(formData.code) : null,
        description: formData.description || null,
      };
      if (editId) {
        await invoke('update_drug_group_code', { id: editId, ...payload });
      } else {
        await invoke('add_drug_group_code', payload);
      }
      toast.success(editId ? 'تم التعديل بنجاح' : 'تمت الإضافة بنجاح');
      setShowModal(false);
      fetchData();
    } catch (err) {
      toast.error(`فشل الحفظ: ${err}`);
    } finally {
      setSaving(false);
    }
  };

  // Bulk Handlers
  const handleOpenBulk = () => {
    setBulkText('');
    setShowBulkModal(true);
  };

  const handleFileImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const ext = file.name.split('.').pop().toLowerCase();

    if (ext === 'xlsx' || ext === 'xls') {
      try {
        const XLSX = await import('xlsx');
        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });
        const names = [];
        for (const row of rows) {
          if (!row || row.length === 0) continue;
          let nameVal = '';
          for (let i = 0; i < row.length; i++) {
            const cell = (row[i] || '').toString().trim();
            if (cell && isNaN(Number(cell))) { nameVal = cell; break; }
            else if (cell && !nameVal) { nameVal = cell; }
          }
          if (nameVal) names.push(nameVal);
        }
        setBulkText(names.join('\n'));
        toast.success(`تم استيراد ${names.length} اسم من ملف Excel`);
      } catch (err) {
        toast.error('فشل قراءة ملف Excel');
      }
    } else {
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target.result;
        const lines = text.split('\n').map(line => {
          const parts = line.split(',');
          let nameVal = '';
          for (let i = 0; i < parts.length; i++) {
            const cell = (parts[i] || '').trim();
            if (cell && isNaN(Number(cell))) { nameVal = cell; break; }
            else if (cell && !nameVal) { nameVal = cell; }
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

  const handleBulkSave = async () => {
    if (!bulkText.trim()) {
      toast.warning('يرجى إدخال أسماء المجموعات');
      return;
    }
    const names = bulkText.split('\n').map(n => n.trim()).filter(n => n.length > 0);
    if (names.length === 0) {
      toast.warning('لم يتم العثور على أسماء صالحة');
      return;
    }
    setBulkSaving(true);
    try {
      const result = await invoke('bulk_add_drug_group_codes', { names });
      const { added, skipped } = result;
      let msg = `تم إضافة ${added} مجموعة بنجاح.`;
      if (skipped > 0) msg += ` وتم تخطي ${skipped} مجموعة موجودة مسبقاً.`;
      toast.success(msg);
      setShowBulkModal(false);
      fetchData();
    } catch (err) {
      toast.error(`فشل الإضافة الجماعية: ${err}`);
    } finally {
      setBulkSaving(false);
    }
  };

  const filteredGroups = groups.filter(g => 
    g.name.toLowerCase().includes(search.toLowerCase()) || 
    (g.code && g.code.toString().includes(search))
  );

  const columns = [
    { header: '#', accessor: 'id' },
    { header: 'الاسم', accessor: 'name' },
    { header: 'الرمز', accessor: 'code' },
    { header: 'ملاحظات', accessor: 'description' },
  ];

  return (
    <div className="space-y-6 animate-fadeIn" dir="rtl">
      <Breadcrumb items={[{ label: 'البيانات الأساسية' }, { label: 'إدارة المجموعات الدوائية' }]} />
      
      <PageHeader 
        title="إدارة المجموعات الدوائية" 
        icon={Pill} 
        description="تسجيل وإدارة المجموعات الدوائية الرئيسية (مثل: المجموعات العلاجية)."
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
              إضافة مجموعة
            </Button>
          </div>
        }
      />

      <div className="flex gap-4">
        <div className="flex-1">
          <Input 
            icon={Search} placeholder="بحث بالاسم أو الرمز..."
            value={search} onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <Card className="p-0 overflow-hidden">
        <Table 
          columns={columns} 
          data={filteredGroups} 
          onEdit={handleOpenEdit}
          onDelete={handleDelete}
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
          loading={loading}
          emptyMessage="لا توجد مجموعات مسجلة."
        />
      </Card>

      {/* Single Add/Edit Modal */}
      <Modal 
        isOpen={showModal} 
        onClose={() => setShowModal(false)} 
        title={editId ? 'تعديل مجموعة' : 'إضافة مجموعة جديدة'}
      >
        <form onSubmit={handleSave} className="space-y-4">
          <Input 
            label="اسم المجموعة"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            required
            style={{ textAlign: 'right' }}
          />
          <Input 
            label="الرمز (اختياري)"
            type="number"
            value={formData.code}
            onChange={(e) => setFormData({ ...formData, code: e.target.value })}
            style={{ textAlign: 'right' }}
          />
          <Input 
            label="وصف / ملاحظات"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            style={{ textAlign: 'right' }}
          />
          <div className="flex gap-4 pt-4">
            <Button variant="primary" type="submit" loading={saving} className="flex-1">
              {editId ? 'تحديث' : 'إضافة'}
            </Button>
            <Button variant="ghost" onClick={() => setShowModal(false)} className="flex-1">إلغاء</Button>
          </div>
        </form>
      </Modal>

      {/* Bulk Import Modal */}
      <Modal 
        isOpen={showBulkModal} 
        onClose={() => setShowBulkModal(false)} 
        title="إدخال جماعي للمجموعات الدوائية"
        wide
      >
        <div className="space-y-4">
          <div className="p-3 rounded-xl text-sm" style={{ background: 'var(--color-bg)', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}>
            💡 الصق أسماء المجموعات (كل اسم في سطر) أو استورد من ملف (نصي أو Excel).
          </div>

          <div>
            <label className="block text-xs font-bold mb-2 uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
              أسماء المجموعات (كل اسم في سطر) *
            </label>
            <textarea
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              placeholder={"مجموعة 1\nمجموعة 2\nمجموعة 3\n..."}
              rows={8}
              className="neu-input w-full"
              style={{ resize: 'vertical', minHeight: '150px', textAlign: 'right', fontFamily: 'inherit' }}
            />
          </div>

          <div className="flex gap-2 flex-wrap">
            <input 
              ref={fileInputRef} type="file" accept=".txt,.csv,.xlsx,.xls" 
              onChange={handleFileImport} style={{ display: 'none' }} 
            />
            <Button variant="ghost" icon={FileText} onClick={() => fileInputRef.current?.click()}
              style={{ border: '1px dashed var(--color-border)', fontSize: '13px' }}>
              استيراد من ملف (TXT / CSV / Excel)
            </Button>
            <Button variant="ghost" icon={Copy} onClick={async () => {
              try {
                const text = await navigator.clipboard.readText();
                setBulkText(text);
                toast.success('تم اللصق من الحافظة');
              } catch { toast.error('فشل القراءة من الحافظة'); }
            }} style={{ border: '1px dashed var(--color-border)', fontSize: '13px' }}>
              لصق من الحافظة
            </Button>
          </div>

          <div className="flex gap-4 pt-4" style={{ borderTop: '1px solid var(--color-border)' }}>
            <Button variant="primary" onClick={handleBulkSave} loading={bulkSaving} className="flex-1" icon={Upload}>
              حفظ الكل
            </Button>
            <Button variant="ghost" onClick={() => setShowBulkModal(false)} className="flex-1">إلغاء</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default DrugGroupsManagementPage;
