import React, { useState, useEffect, useRef } from 'react';
import PageHeader from '../../../components/ui/PageHeader';
import Breadcrumb from '../../../components/ui/Breadcrumb';
import Card from '../../../components/ui/Card';
import Button from '../../../components/ui/Button';
import Table from '../../../components/ui/Table';
import Modal from '../../../components/ui/Modal';
import Input from '../../../components/ui/Input';
import Select from '../../../components/ui/Select';
import { useToast } from '../../../components/ui/Toast';
import invoke from '../../../api/tauriApi';
import { Syringe, Layers, Box, Tag, Plus, Search, Upload, FileText, Copy, Hash, Trash2 } from 'lucide-react';

const InsulinManagementPage = () => {
  const [activeTab, setActiveTab] = useState('codes');
  const [, setLoading] = useState(false);
  const toast = useToast();

  const [codes, setCodes] = useState([]);
  const [categories, setCategories] = useState([]);
  const [types, setTypes] = useState([]);
  const [units, setUnits] = useState([]);

  // Single Add/Edit Modal
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState(null);
  const [formData, setFormData] = useState({});
  const [saving, setSaving] = useState(false);

  // Bulk Import Modal
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [bulkTypeId, setBulkTypeId] = useState('');
  const [bulkUnitId, setBulkUnitId] = useState('');
  const [bulkSaving, setBulkSaving] = useState(false);
  const fileInputRef = useRef(null);

  // Selection
  const [selectedIds, setSelectedIds] = useState([]);

  // Filtering
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');

  useEffect(() => {
    fetchData();
    setSelectedIds([]); // Clear selection when tab changes
    setFilterType('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const fetchData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'codes') {
        const [c, ts, us] = await Promise.all([
          invoke('get_insulin_codes'),
          invoke('get_insulin_types'),
          invoke('get_insulin_units')
        ]);
        setCodes(c);
        setTypes(ts);
        setUnits(us);
      } else if (activeTab === 'categories') {
        setCategories(await invoke('get_insulin_categories'));
      } else if (activeTab === 'types') {
        setTypes(await invoke('get_insulin_types'));
      } else if (activeTab === 'units') {
        setUnits(await invoke('get_insulin_units'));
      }
    } catch (err) {
      console.error(err);
      toast.error(`خطأ في تحميل البيانات: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  // ─── Single Add/Edit ──────────────────────────────
  const handleOpenAdd = () => {
    setEditId(null);
    setFormData({});
    setShowModal(true);
  };

  const handleOpenEdit = (item) => {
    setEditId(item.id);
    setFormData({ ...item });
    setShowModal(true);
  };

  const handleDelete = async (item) => {
    if (!window.confirm(`هل أنت متأكد من حذف "${item.name}"؟`)) return;
    try {
      let cmd;
      if (activeTab === 'codes') cmd = 'delete_insulin_code';
      else if (activeTab === 'categories') cmd = 'delete_insulin_category';
      else if (activeTab === 'types') cmd = 'delete_insulin_type';
      else cmd = 'delete_insulin_unit';

      await invoke(cmd, { id: item.id });
      toast.success('تم الحذف بنجاح');
      fetchData();
    } catch (err) {
      toast.error(err.toString());
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!window.confirm(`هل أنت متأكد من حذف ${selectedIds.length} عنصر؟ سيتم حذف العناصر غير المستخدمة فقط واستثناء العناصر المرتبطة بسجلات.`)) return;
    
    setLoading(true);
    try {
      let cmd;
      if (activeTab === 'codes') cmd = 'bulk_delete_insulin_codes';
      else if (activeTab === 'categories') cmd = 'bulk_delete_insulin_categories';
      else if (activeTab === 'types') cmd = 'bulk_delete_insulin_types';
      else cmd = 'bulk_delete_insulin_units';
      
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
    if (!formData.name || !formData.name.trim()) {
      toast.warning('يرجى إدخال الاسم');
      return;
    }
    setSaving(true);
    try {
      if (activeTab === 'codes') {
        if (!formData.type_id || !formData.unit_id) { 
          toast.warning('يرجى اختيار النوع والوحدة'); 
          setSaving(false); 
          return; 
        }
        const payload = {
          name: formData.name.trim(),
          typeId: parseInt(formData.type_id),
          unitId: parseInt(formData.unit_id),
          description: formData.description || null,
        };
        if (editId) {
          await invoke('update_insulin_code', { id: editId, ...payload });
        } else {
          await invoke('add_insulin_code', payload);
        }
      } else {
        const namePayload = { name: formData.name.trim() };
        let cmd = '';
        if (activeTab === 'categories') cmd = editId ? 'update_insulin_category' : 'add_insulin_category';
        else if (activeTab === 'types') cmd = editId ? 'update_insulin_type' : 'add_insulin_type';
        else cmd = editId ? 'update_insulin_unit' : 'add_insulin_unit';
        
        await invoke(cmd, editId ? { id: editId, ...namePayload } : namePayload);
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

  // ─── Bulk Import ──────────────────────────────────
  const handleOpenBulk = async () => {
    try {
      const [ts, us] = await Promise.all([
        invoke('get_insulin_types'),
        invoke('get_insulin_units')
      ]);
      setTypes(ts);
      setUnits(us);
    } catch (err) { /* ignore */ }
    setBulkText('');
    setBulkTypeId('');
    setBulkUnitId('');
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
            if (cell && isNaN(Number(cell))) {
              nameVal = cell;
              break;
            } else if (cell && !nameVal) {
              nameVal = cell;
            }
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
            if (cell && isNaN(Number(cell))) {
              nameVal = cell;
              break;
            } else if (cell && !nameVal) {
              nameVal = cell;
            }
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
    if (activeTab === 'codes') {
      if (!bulkTypeId || !bulkUnitId) {
        toast.warning('يرجى اختيار النوع والوحدة');
        return;
      }
    }
    if (!bulkText.trim()) {
      toast.warning(`يرجى إدخال أسماء ${activeTab === 'codes' ? 'أصناف الإنسولين' : 'العناصر'}`);
      return;
    }
    const names = bulkText.split('\n').map(n => n.trim()).filter(n => n.length > 0);
    if (names.length === 0) {
      toast.warning('لم يتم العثور على أسماء صالحة');
      return;
    }
    setBulkSaving(true);
    try {
      let result;
      if (activeTab === 'codes') {
        result = await invoke('bulk_add_insulin_codes', {
          names: names,
          typeId: parseInt(bulkTypeId),
          unitId: parseInt(bulkUnitId),
        });
      } else if (activeTab === 'categories') {
        result = await invoke('bulk_add_insulin_categories', { names });
      } else if (activeTab === 'types') {
        result = await invoke('bulk_add_insulin_types', { names });
      } else {
        result = await invoke('bulk_add_insulin_units', { names });
      }

      const { added, skipped } = result;
      let msg = `تم إضافة ${added} عنصر بنجاح.`;
      if (skipped > 0) msg += ` وتم تخطي ${skipped} عنصر لأنها موجودة مسبقاً.`;
      
      toast.success(msg);
      setShowBulkModal(false);
      fetchData();
    } catch (err) {
      toast.error(`فشل الإضافة الجماعية: ${err}`);
    } finally {
      setBulkSaving(false);
    }
  };

  // ─── Filtered Data ──────────────────────────────────
  const filteredCodes = codes.filter(c => {
    const matchSearch = !search || c.name?.toLowerCase().includes(search.toLowerCase());
    const selectedTypeName = types.find(t => t.id === parseInt(filterType))?.name;
    const matchType = !filterType || c.type_id === parseInt(filterType) || c.type === filterType || c.type === selectedTypeName;
    return matchSearch && matchType;
  });

  // ─── Table Columns ──────────────────────────────────
  const codeColumns = [
    { header: '#', accessor: 'id' },
    { header: 'اسم الصنف', accessor: 'name' },
    { header: 'النوع', render: (c) => c.type || types.find(t => t.id === c.type_id)?.name || '—' },
    { header: 'الوحدة', render: (c) => c.unit || units.find(u => u.id === c.unit_id)?.name || '—' },
    { header: 'ملاحظات', accessor: 'description' },
  ];
  
  const simpleColumns = [
    { header: '#', accessor: 'id' },
    { header: 'الاسم', accessor: 'name' },
  ];

  return (
    <div className="space-y-6 animate-fadeIn" dir="rtl">
      <Breadcrumb items={[{ label: 'البيانات الأساسية' }, { label: 'إدارة الإنسولين' }]} />
      
      <PageHeader 
        title="إدارة الإنسولين" 
        icon={Syringe} 
        description="تكويد أصناف الإنسولين، الفئات، الأنواع، والوحدات الخاصة بها."
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
              {activeTab === 'codes' ? 'إضافة صنف' : activeTab === 'categories' ? 'إضافة فئة' : activeTab === 'types' ? 'إضافة نوع' : 'إضافة وحدة'}
            </Button>
          </div>
        }
      />

      {/* Tabs */}
      <div className="flex gap-4 overflow-x-auto pb-2">
        <button className={`neu-tab ${activeTab === 'codes' ? 'active' : ''}`} onClick={() => { setActiveTab('codes'); setSearch(''); setFilterType(''); }}>
          <Hash size={18} />الأصناف
        </button>
        <button className={`neu-tab ${activeTab === 'categories' ? 'active' : ''}`} onClick={() => { setActiveTab('categories'); setSearch(''); setFilterType(''); }}>
          <Layers size={18} />الفئات (جهات الصرف)
        </button>
        <button className={`neu-tab ${activeTab === 'types' ? 'active' : ''}`} onClick={() => { setActiveTab('types'); setSearch(''); setFilterType(''); }}>
          <Tag size={18} />الأنواع
        </button>
        <button className={`neu-tab ${activeTab === 'units' ? 'active' : ''}`} onClick={() => { setActiveTab('units'); setSearch(''); setFilterType(''); }}>
          <Box size={18} />الوحدات
        </button>
      </div>

      {/* Search & Filter (Codes tab only) */}
      {activeTab === 'codes' && (
        <div className="flex gap-4 flex-wrap">
          <div className="flex-1" style={{ minWidth: '200px' }}>
            <Input 
              icon={Search} placeholder="بحث باسم الصنف..."
              value={search} onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div style={{ minWidth: '200px' }}>
            <Select
              icon={Tag}
              options={[{ value: '', label: 'جميع الأنواع' }, ...types.map(t => ({ value: t.id, label: t.name }))]}
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
            />
          </div>
        </div>
      )}

      {/* Data Table */}
      <Card className="p-0 overflow-hidden">
        {activeTab === 'codes' && (
          <Table 
            columns={codeColumns} 
            data={filteredCodes} 
            onEdit={handleOpenEdit}
            onDelete={handleDelete}
            selectedIds={selectedIds}
            onSelectionChange={setSelectedIds}
            emptyMessage="لا توجد أصناف مسجلة. أضف أصناف جديدة أو استخدم الإدخال الجماعي."
          />
        )}
        {activeTab === 'categories' && (
          <Table 
            columns={simpleColumns} 
            data={categories} 
            onEdit={handleOpenEdit}
            onDelete={handleDelete}
            selectedIds={selectedIds}
            onSelectionChange={setSelectedIds}
            emptyMessage="لا توجد فئات. أضف فئة جديدة."
          />
        )}
        {activeTab === 'types' && (
          <Table 
            columns={simpleColumns} 
            data={types} 
            onEdit={handleOpenEdit}
            onDelete={handleDelete}
            selectedIds={selectedIds}
            onSelectionChange={setSelectedIds}
            emptyMessage="لا توجد أنواع. أضف نوعاً جديداً."
          />
        )}
        {activeTab === 'units' && (
          <Table 
            columns={simpleColumns} 
            data={units} 
            onEdit={handleOpenEdit}
            onDelete={handleDelete}
            selectedIds={selectedIds}
            onSelectionChange={setSelectedIds}
            emptyMessage="لا توجد وحدات. أضف وحدة جديدة."
          />
        )}
      </Card>

      {/* ─── Single Add/Edit Modal ──────────────────── */}
      <Modal 
        isOpen={showModal} 
        onClose={() => setShowModal(false)} 
        title={editId ? `تعديل ${activeTab === 'codes' ? 'الصنف' : activeTab === 'categories' ? 'الفئة' : activeTab === 'types' ? 'النوع' : 'الوحدة'}` : `إضافة ${activeTab === 'codes' ? 'صنف جديد' : activeTab === 'categories' ? 'فئة جديدة' : activeTab === 'types' ? 'نوع جديد' : 'وحدة جديدة'}`}
      >
        <form onSubmit={handleSave} className="space-y-4">
          <Input 
            label="الاسم"
            value={formData.name || ''}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            required
            style={{ textAlign: 'right' }}
          />

          {activeTab === 'codes' && (
            <>
              <Select 
                label="النوع *"
                icon={Tag}
                options={types.map(t => ({ value: t.id, label: t.name }))}
                value={formData.type_id || ''}
                onChange={(e) => setFormData({ ...formData, type_id: e.target.value })}
                placeholder="اختر النوع..."
                required
              />
              <Select 
                label="الوحدة *"
                icon={Box}
                options={units.map(u => ({ value: u.id, label: u.name }))}
                value={formData.unit_id || ''}
                onChange={(e) => setFormData({ ...formData, unit_id: e.target.value })}
                placeholder="اختر الوحدة..."
                required
              />
              <Input 
                label="ملاحظات (اختياري)"
                value={formData.description || ''}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                style={{ textAlign: 'right' }}
              />
            </>
          )}

          <div className="flex gap-4 pt-4">
            <Button variant="primary" type="submit" loading={saving} className="flex-1">
              {editId ? 'تحديث' : 'إضافة'}
            </Button>
            <Button variant="ghost" type="button" onClick={() => setShowModal(false)} className="flex-1">إلغاء</Button>
          </div>
        </form>
      </Modal>

      {/* ─── Bulk Import Modal ───────────────────────── */}
      <Modal 
        isOpen={showBulkModal} 
        onClose={() => setShowBulkModal(false)} 
        title={`إدخال جماعي ${activeTab === 'codes' ? 'للأصناف' : activeTab === 'categories' ? 'للفئات' : activeTab === 'types' ? 'للأنواع' : 'للوحدات'}`}
        wide
      >
        <div className="space-y-4">
          <div className="p-3 rounded-xl text-sm" style={{ background: 'var(--color-bg)', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}>
            💡 الصق الأسماء (كل اسم في سطر) أو استورد من ملف (نصي أو Excel). {activeTab === 'codes' && 'سيتم إضافة الكل بنفس النوع والوحدة (التكرار يعتمد على الاسم + النوع + الوحدة).'}
          </div>

          {activeTab === 'codes' && (
            <div className="flex gap-4 flex-wrap">
              <div className="flex-1" style={{ minWidth: '180px' }}>
                <Select 
                  label="النوع *" icon={Tag}
                  options={types.map(t => ({ value: t.id, label: t.name }))}
                  value={bulkTypeId}
                  onChange={(e) => setBulkTypeId(e.target.value)}
                  placeholder="اختر النوع..."
                />
              </div>
              <div className="flex-1" style={{ minWidth: '180px' }}>
                <Select 
                  label="الوحدة *" icon={Box}
                  options={units.map(u => ({ value: u.id, label: u.name }))}
                  value={bulkUnitId}
                  onChange={(e) => setBulkUnitId(e.target.value)}
                  placeholder="اختر الوحدة..."
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold mb-2 uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
              الأسماء (كل اسم في سطر) *
            </label>
            <textarea
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              placeholder={"عنصر 1\nعنصر 2\nعنصر 3\n..."}
              rows={6}
              className="neu-input w-full"
              style={{ resize: 'vertical', minHeight: '100px', maxHeight: '200px', textAlign: 'right', fontFamily: 'inherit' }}
            />
            {bulkText.trim() && (
              <p className="text-xs mt-1 font-bold" style={{ color: 'var(--color-primary)' }}>
                سيتم إضافة {bulkPreviewCount} عنصر
              </p>
            )}
          </div>

          <div className="flex gap-2 flex-wrap">
            <input 
              ref={fileInputRef} type="file" accept=".txt,.csv,.xlsx,.xls" 
              onChange={handleFileImport} style={{ display: 'none' }} 
            />
            <Button variant="ghost" type="button" icon={FileText} onClick={() => fileInputRef.current?.click()}
              style={{ border: '1px dashed var(--color-border)', fontSize: '13px' }}>
              استيراد من ملف (TXT / CSV / Excel)
            </Button>
            <Button variant="ghost" type="button" icon={Copy} onClick={async () => {
              try {
                const text = await navigator.clipboard.readText();
                setBulkText(text);
                toast.success('تم اللصق من الحافظة');
              } catch { toast.error('فشل القراءة من الحافظة'); }
            }} style={{ border: '1px dashed var(--color-border)', fontSize: '13px' }}>
              لصق من الحافظة
            </Button>
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

export default InsulinManagementPage;
