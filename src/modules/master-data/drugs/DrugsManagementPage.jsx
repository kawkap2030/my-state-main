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
import { useSmartNotification } from '../../../context/SmartNotificationContext';
import invoke from '../../../api/tauriApi';
import { Pill, Layers, Box, Plus, Search, Upload, FileText, Copy, Trash2 } from 'lucide-react';

const DrugsManagementPage = () => {
  const [activeTab, setActiveTab] = useState('drugs');
  const [, setLoading] = useState(false);
  const toast = useToast();
  const smartNotif = useSmartNotification();

  const [drugs, setDrugs] = useState([]);
  const [categories, setCategories] = useState([]);
  const [units, setUnits] = useState([]);

  // Single Add/Edit Modal
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState(null);
  const [formData, setFormData] = useState({});
  const [saving, setSaving] = useState(false);
  const [unitMode, setUnitMode] = useState('select'); // 'select' or 'manual'

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const fetchData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'drugs') {
        const [d, c, u] = await Promise.all([
          invoke('get_drugs'),
          invoke('get_drug_categories'),
          invoke('get_drug_units')
        ]);
        setDrugs(d);
        setCategories(c);
        setUnits(u);
      } else if (activeTab === 'categories') {
        setCategories(await invoke('get_drug_categories'));
      } else if (activeTab === 'units') {
        setUnits(await invoke('get_drug_units'));
      }
    } catch (err) {
      console.error(err);
      toast.error('خطأ في تحميل البيانات');
    } finally {
      setLoading(false);
    }
  };

  // ─── Single Add/Edit ──────────────────────────────
  const handleOpenAdd = () => {
    setEditId(null);
    setFormData({});
    setUnitMode('select');
    setShowModal(true);
  };

  const handleOpenEdit = (item) => {
    setEditId(item.id);
    setFormData({ ...item });
    // Check if the item's unit exists in our units list
    if (activeTab === 'drugs' && item.unit) {
      const unitExists = units.some(u => u.name === item.unit);
      setUnitMode(unitExists ? 'select' : 'manual');
    } else {
      setUnitMode('select');
    }
    setShowModal(true);
  };

  const handleDelete = async (item) => {
    if (!window.confirm(`هل أنت متأكد من حذف "${item.name}"؟`)) return;
    try {
      const cmd = activeTab === 'drugs' ? 'delete_drug' : activeTab === 'categories' ? 'delete_drug_category' : 'delete_drug_unit';
      await invoke(cmd, { id: item.id });

      // Use smart notification with undo capability
      smartNotif.success(`تم حذف "${item.name}" بنجاح`, {
        duration: 8000,
        dedupKey: `delete_${activeTab}_${item.id}`,
        undo: {
          label: `تراجع عن حذف "${item.name}"`,
          handler: async () => {
            if (activeTab === 'drugs') {
              await invoke('add_drug', {
                name: item.name,
                scientificName: item.scientific_name || null,
                categoryId: item.category_id ? parseInt(item.category_id) : null,
                unit: item.unit || null,
              });
            } else if (activeTab === 'categories') {
              await invoke('add_drug_category', { name: item.name });
            } else {
              await invoke('add_drug_unit', { name: item.name });
            }
            fetchData();
          },
        },
      });
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
      const cmd = activeTab === 'drugs' ? 'bulk_delete_drugs' : 
                  activeTab === 'categories' ? 'bulk_delete_drug_categories' : 
                  'bulk_delete_drug_units';
      
      const result = await invoke(cmd, { ids: selectedIds });
      const { deleted, skipped, skipped_names } = result;
      
      let msg = `تم حذف ${deleted} عنصر بنجاح.`;
      if (skipped > 0) {
        msg += ` تم تخطي ${skipped} عنصر لوجود سجلات مرتبطة بها.`;
        console.log('Skipped items:', skipped_names);
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
      if (activeTab === 'drugs') {
        if (!formData.category_id) { toast.warning('يرجى اختيار التصنيف'); setSaving(false); return; }
        const payload = {
          name: formData.name.trim(),
          scientificName: formData.scientific_name || null,
          categoryId: parseInt(formData.category_id),
          unit: formData.unit || null,
        };
        if (editId) {
          await invoke('update_drug', { id: editId, ...payload });
        } else {
          await invoke('add_drug', payload);
        }
      } else if (activeTab === 'categories') {
        if (editId) {
          await invoke('update_drug_category', { id: editId, name: formData.name.trim() });
        } else {
          await invoke('add_drug_category', { name: formData.name.trim() });
        }
      } else {
        if (editId) {
          await invoke('update_drug_unit', { id: editId, name: formData.name.trim() });
        } else {
          await invoke('add_drug_unit', { name: formData.name.trim() });
        }
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
    // Load categories and units if not already loaded
    try {
      const [c, u] = await Promise.all([
        invoke('get_drug_categories'),
        invoke('get_drug_units')
      ]);
      setCategories(c);
      setUnits(u);
    } catch (err) { /* ignore */ }
    setBulkText('');
    setBulkCategoryId('');
    setBulkUnit('');
    setShowBulkModal(true);
  };

  const handleFileImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const ext = file.name.split('.').pop().toLowerCase();

    if (ext === 'xlsx' || ext === 'xls') {
      // Excel file - use xlsx library
      try {
        const XLSX = await import('xlsx');
        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });
        
        // Find the first column that actually looks like names (not just numbers/IDs)
        const names = [];
        for (const row of rows) {
          if (!row || row.length === 0) continue;
          
          // Look for the first string cell in the row that isn't purely numeric
          let nameVal = '';
          for (let i = 0; i < row.length; i++) {
            const cell = (row[i] || '').toString().trim();
            if (cell && isNaN(Number(cell))) {
              nameVal = cell;
              break;
            } else if (cell && !nameVal) {
              // fallback to numeric if nothing else found, but keep looking
              nameVal = cell;
            }
          }
          
          if (nameVal) names.push(nameVal);
        }

        setBulkText(names.join('\n'));
        toast.success(`تم استيراد ${names.length} اسم من ملف Excel`);
      } catch (err) {
        console.error(err);
        toast.error('فشل قراءة ملف Excel');
      }
    } else {
      // Text/CSV file
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target.result;
        const lines = text.split('\n').map(line => {
          const parts = line.split(',');
          // Same logic: find first non-numeric part
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
    if (activeTab === 'drugs' && !bulkCategoryId) {
      toast.warning('يرجى اختيار التصنيف');
      return;
    }
    if (!bulkText.trim()) {
      toast.warning(`يرجى إدخال أسماء ${activeTab === 'drugs' ? 'الأدوية' : activeTab === 'categories' ? 'التصنيفات' : 'الوحدات'}`);
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
      if (activeTab === 'drugs') {
        result = await invoke('bulk_add_drugs', {
          names: names,
          categoryId: parseInt(bulkCategoryId),
          unit: bulkUnit || null,
        });
      } else if (activeTab === 'categories') {
        result = await invoke('bulk_add_drug_categories', { names });
      } else {
        result = await invoke('bulk_add_drug_units', { names });
      }

      // the backend now returns { added, skipped }
      const { added, skipped } = result;
      let msg = `تم إضافة ${added} عنصر بنجاح.`;
      if (skipped > 0) msg += ` وتم تخطي ${skipped} عنصر لأنها موجودة مسبقاً.`;
      
      toast.success(msg);
      setShowBulkModal(false);
      fetchData();
    } catch (err) {
      console.error('Bulk add error:', err);
      toast.error(`فشل الإضافة الجماعية: ${err}`);
    } finally {
      setBulkSaving(false);
    }
  };

  // ─── Filtered Data ──────────────────────────────────
  const filteredDrugs = drugs.filter(d => {
    const matchSearch = !search || d.name?.includes(search) || d.scientific_name?.includes(search);
    const matchCategory = !filterCategory || d.category_id === parseInt(filterCategory);
    return matchSearch && matchCategory;
  });

  // ─── Table Columns ──────────────────────────────────
  const drugColumns = [
    { header: '#', accessor: 'id' },
    { header: 'اسم الدواء', accessor: 'name' },
    { header: 'الاسم العلمي', accessor: 'scientific_name' },
    { header: 'التصنيف', render: (d) => categories.find(c => c.id === d.category_id)?.name || '—' },
    { header: 'الوحدة', accessor: 'unit' },
  ];
  const simpleColumns = [
    { header: '#', accessor: 'id' },
    { header: 'الاسم', accessor: 'name' },
  ];

  return (
    <div className="space-y-6 animate-fadeIn" dir="rtl">
      <Breadcrumb items={[{ label: 'البيانات الأساسية' }, { label: 'إدارة الأدوية' }]} />
      
      <PageHeader 
        title="إدارة الأدوية" 
        icon={Pill} 
        description="تكويد الأدوية، التصنيفات، والوحدات المستخدمة في المنصرف."
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
              {activeTab === 'drugs' ? 'إضافة دواء' : activeTab === 'categories' ? 'إضافة تصنيف' : 'إضافة وحدة'}
            </Button>
          </div>
        }
      />

      {/* Tabs */}
      <div className="flex gap-4 overflow-x-auto pb-2">
        {[
          { key: 'drugs', icon: Pill, label: 'الأدوية' },
          { key: 'categories', icon: Layers, label: 'التصنيفات' },
          { key: 'units', icon: Box, label: 'الوحدات' },
        ].map(tab => (
          <button 
            key={tab.key}
            className={`neu-tab ${activeTab === tab.key ? 'active' : ''}`}
            onClick={() => { setActiveTab(tab.key); setSearch(''); setFilterCategory(''); }}
          >
            <tab.icon size={18} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Search & Filter (Drugs tab only) */}
      {activeTab === 'drugs' && (
        <div className="flex gap-4 flex-wrap">
          <div className="flex-1" style={{ minWidth: '200px' }}>
            <Input 
              icon={Search} placeholder="بحث بالاسم أو الاسم العلمي..."
              value={search} onChange={(e) => setSearch(e.target.value)}
            />
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
        {activeTab === 'drugs' && (
          <Table 
            columns={drugColumns} 
            data={filteredDrugs} 
            onEdit={handleOpenEdit}
            onDelete={handleDelete}
            selectedIds={selectedIds}
            onSelectionChange={setSelectedIds}
            emptyMessage="لا توجد أدوية مسجلة. أضف أدوية جديدة أو استخدم الإدخال الجماعي."
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
            emptyMessage="لا توجد تصنيفات. أضف تصنيفًا جديدًا."
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
        title={editId ? `تعديل ${activeTab === 'drugs' ? 'الدواء' : activeTab === 'categories' ? 'التصنيف' : 'الوحدة'}` : `إضافة ${activeTab === 'drugs' ? 'دواء جديد' : activeTab === 'categories' ? 'تصنيف جديد' : 'وحدة جديدة'}`}
      >
        <form onSubmit={handleSave} className="space-y-4">
          <Input 
            label="الاسم"
            value={formData.name || ''}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            required
            style={{ textAlign: 'right' }}
          />

          {activeTab === 'drugs' && (
            <>
              <Input 
                label="الاسم العلمي (اختياري)"
                value={formData.scientific_name || ''}
                onChange={(e) => setFormData({ ...formData, scientific_name: e.target.value })}
                style={{ textAlign: 'right' }}
              />
              <AutoComplete
                value={formData.category_id || ''}
                onChange={(val) => setFormData({ ...formData, category_id: val ? parseInt(val) : '' })}
                options={categories}
                label="التصنيف"
                icon={Layers}
                placeholder="ابحث عن تصنيف..."
              />
              
              {/* Unit: Dropdown + Manual Input Toggle */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <label className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
                    الوحدة
                  </label>
                  <button 
                    type="button"
                    onClick={() => {
                      setUnitMode(unitMode === 'select' ? 'manual' : 'select');
                      if (unitMode === 'manual') setFormData({ ...formData, unit: '' });
                    }}
                    className="text-xs px-2 py-1 rounded-lg cursor-pointer transition-colors"
                    style={{ 
                      background: 'var(--color-bg)', 
                      color: 'var(--color-primary)', 
                      border: '1px solid var(--color-primary)',
                      fontSize: '10px'
                    }}
                  >
                    {unitMode === 'select' ? '✏️ كتابة يدوية' : '📋 اختيار من القائمة'}
                  </button>
                </div>
                {unitMode === 'select' ? (
                  <AutoComplete
                    value={formData.unit || ''}
                    onChange={(val) => setFormData({ ...formData, unit: val })}
                    options={units.map(u => ({ id: u.name, name: u.name }))}
                    getOptionLabel={(opt) => opt.name}
                    getOptionValue={(opt) => opt.name}
                    icon={Box}
                    placeholder="ابحث عن وحدة..."
                    label={null}
                  />
                ) : (
                  <Input 
                    icon={Box}
                    placeholder="اكتب اسم الوحدة (مثلاً: قرص، حقنة، مل)"
                    value={formData.unit || ''}
                    onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                    style={{ textAlign: 'right' }}
                  />
                )}
              </div>
            </>
          )}

          <div className="flex gap-4 pt-4">
            <Button variant="primary" type="submit" loading={saving} className="flex-1">
              {editId ? 'تحديث' : 'إضافة'}
            </Button>
            <Button variant="ghost" onClick={() => setShowModal(false)} className="flex-1">إلغاء</Button>
          </div>
        </form>
      </Modal>

      {/* ─── Bulk Import Modal ───────────────────────── */}
      <Modal 
        isOpen={showBulkModal} 
        onClose={() => setShowBulkModal(false)} 
        title={`إدخال جماعي ${activeTab === 'drugs' ? 'للأدوية' : activeTab === 'categories' ? 'للتصنيفات' : 'للوحدات'}`}
        wide
      >
        <div className="space-y-4">
          <div className="p-3 rounded-xl text-sm" style={{ background: 'var(--color-bg)', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}>
            💡 الصق الأسماء (كل اسم في سطر) أو استورد من ملف (نصي أو Excel). {activeTab === 'drugs' && 'سيتم إضافة الكل بنفس التصنيف والوحدة.'}
          </div>

          {activeTab === 'drugs' && (
            <div className="flex gap-4 flex-wrap">
              <div className="flex-1" style={{ minWidth: '180px' }}>
                <Select 
                  label="التصنيف *" icon={Layers}
                  options={categories.map(c => ({ value: c.id, label: c.name }))}
                  value={bulkCategoryId}
                  onChange={(e) => setBulkCategoryId(e.target.value)}
                  placeholder="اختر التصنيف..."
                />
              </div>
              <div className="flex-1" style={{ minWidth: '180px' }}>
                <Select 
                  label="الوحدة (اختياري)" icon={Box}
                  options={[{ value: '', label: 'بدون وحدة' }, ...units.map(u => ({ value: u.name, label: u.name }))]}
                  value={bulkUnit}
                  onChange={(e) => setBulkUnit(e.target.value)}
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

          <div className="flex gap-4 pt-2" style={{ borderTop: '1px solid var(--color-border)', paddingTop: '12px' }}>
            <Button variant="primary" onClick={handleBulkSave} loading={bulkSaving} className="flex-1" icon={Upload}>
              إضافة {bulkPreviewCount > 0 ? `(${bulkPreviewCount})` : ''} عنصر
            </Button>
            <Button variant="ghost" onClick={() => setShowBulkModal(false)} className="flex-1">إلغاء</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default DrugsManagementPage;
