import React, { useState, useEffect, useRef } from 'react';
import { Hospital, Building2, MapPin, Plus, Loader2, Trash2, Upload, FileText, Copy } from 'lucide-react';
import invoke from '../../../api/tauriApi';
import Breadcrumb from '../../../components/ui/Breadcrumb';
import PageHeader from '../../../components/ui/PageHeader';
import Table from '../../../components/ui/Table';
import Button from '../../../components/ui/Button';
import Modal from '../../../components/ui/Modal';
import Input from '../../../components/ui/Input';
import Select from '../../../components/ui/Select';
import AutoComplete from '../../../components/ui/AutoComplete';
import { useToast } from '../../../components/ui/Toast';

const ClinicsPage = () => {
  const [clinics, setClinics] = useState([]);
  const [branches, setBranches] = useState([]);
  const [areas, setAreas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [name, setName] = useState('');
  const [areaId, setAreaId] = useState('');
  const [filterBranch, setFilterBranch] = useState('');
  const [filterArea, setFilterArea] = useState('');
  const [saving, setSaving] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);

  // Bulk Import Modal
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [bulkBranchId, setBulkBranchId] = useState('');
  const [bulkAreaId, setBulkAreaId] = useState('');
  const [bulkAreasList, setBulkAreasList] = useState([]);
  const [bulkSaving, setBulkSaving] = useState(false);
  const fileInputRef = useRef(null);

  const toast = useToast();

  useEffect(() => {
    invoke('get_branches').then(setBranches).catch(() => toast.error('فشل تحميل الفروع'));
    setLoading(false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (filterBranch) {
      invoke('get_areas', { branchId: parseInt(filterBranch) }).then(setAreas).catch(() => {});
      setFilterArea(''); setClinics([]);
    } else { setAreas([]); setFilterArea(''); setClinics([]); }
    setSelectedIds([]);
  }, [filterBranch]);

  useEffect(() => {
    if (filterArea) {
      setLoading(true);
      invoke('get_clinics', { areaId: parseInt(filterArea) }).then(setClinics).catch(() => toast.error('فشل تحميل العيادات')).finally(() => setLoading(false));
    } else { setClinics([]); setLoading(false); }
    setSelectedIds([]);
  }, [filterArea]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (bulkBranchId) {
      invoke('get_areas', { branchId: parseInt(bulkBranchId) }).then(setBulkAreasList).catch(() => setBulkAreasList([]));
    } else {
      setBulkAreasList([]);
    }
  }, [bulkBranchId]);

  const openAdd = () => { setEditItem(null); setName(''); setAreaId(filterArea); setModalOpen(true); };
  const openEdit = (item) => { setEditItem(item); setName(item.name); setAreaId(item.area_id || filterArea); setModalOpen(true); };

  const handleSave = async () => {
    if (!name.trim() || !areaId) { toast.warning('يرجى ملء جميع الحقول'); return; }
    setSaving(true);
    try {
      if (editItem) {
        await invoke('update_clinic', { id: editItem.id, name: name.trim(), areaId: parseInt(areaId) });
        toast.success('تم تحديث العيادة');
      } else {
        await invoke('add_clinic', { name: name.trim(), areaId: parseInt(areaId) });
        toast.success('تم إضافة العيادة');
      }
      setModalOpen(false);
      invoke('get_clinics', { areaId: parseInt(filterArea) }).then(setClinics);
    } catch (e) { toast.error(e.toString()); } finally { setSaving(false); }
  };

  const handleDelete = async (item) => {
    if (!confirm(`هل أنت متأكد من حذف العيادة "${item.name}"؟`)) return;
    try { 
      await invoke('delete_clinic', { id: item.id }); 
      toast.success('تم حذف العيادة'); 
      invoke('get_clinics', { areaId: parseInt(filterArea) }).then(setClinics); 
    } catch (e) { 
      toast.error(e.toString()); 
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!confirm(`هل أنت متأكد من حذف ${selectedIds.length} عيادة؟ سيتم حذف العيادات غير المستخدمة فقط.`)) return;
    
    setLoading(true);
    try {
      const result = await invoke('bulk_delete_clinics', { ids: selectedIds });
      const { deleted, skipped } = result;
      
      let msg = `تم حذف ${deleted} عيادة بنجاح.`;
      if (skipped > 0) msg += ` تم تخطي ${skipped} عيادة لوجود سجلات مرتبطة بها.`;
      
      toast.info(msg);
      setSelectedIds([]);
      invoke('get_clinics', { areaId: parseInt(filterArea) }).then(setClinics);
    } catch (err) {
      toast.error(`فشل الحذف الجماعي: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  // ─── Bulk Import ──────────────────────────────────
  const handleOpenBulk = () => {
    setBulkText('');
    setBulkBranchId(filterBranch || '');
    setBulkAreaId(filterArea || '');
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
        console.error(err);
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
    if (!bulkAreaId) {
      toast.warning('يرجى اختيار المنطقة');
      return;
    }
    if (!bulkText.trim()) {
      toast.warning('يرجى إدخال أسماء العيادات');
      return;
    }
    const names = bulkText.split('\n').map(n => n.trim()).filter(n => n.length > 0);
    if (names.length === 0) {
      toast.warning('لم يتم العثور على أسماء صالحة');
      return;
    }
    setBulkSaving(true);
    try {
      const result = await invoke('bulk_add_clinics', { names, areaId: parseInt(bulkAreaId) });
      const { added, skipped } = result;
      let msg = `تم إضافة ${added} عيادة بنجاح.`;
      if (skipped > 0) msg += ` وتم تخطي ${skipped} عيادة لأنها موجودة مسبقاً.`;
      
      toast.success(msg);
      setShowBulkModal(false);
      if (filterBranch === bulkBranchId && filterArea === bulkAreaId) {
        invoke('get_clinics', { areaId: parseInt(filterArea) }).then(setClinics);
      } else {
        setFilterBranch(bulkBranchId);
        setFilterArea(bulkAreaId);
      }
    } catch (err) {
      toast.error(`فشل الإضافة الجماعية: ${err}`);
    } finally {
      setBulkSaving(false);
    }
  };

  const columns = [
    { header: '#', accessor: 'id' },
    { header: 'اسم العيادة', accessor: 'name' },
  ];

  return (
    <div dir="rtl">
      <Breadcrumb items={[{ label: 'الرئيسية', to: '/' }, { label: 'الهيكل التنظيمي' }, { label: 'العيادات' }]} />
      <PageHeader title="إدارة العيادات" description="إضافة وتعديل وحذف العيادات" icon={Hospital}
        actions={
          <div className="flex gap-2">
            {selectedIds.length > 0 && (
              <Button variant="danger" icon={Trash2} onClick={handleBulkDelete}>حذف المحدد ({selectedIds.length})</Button>
            )}
            <Button variant="ghost" icon={Upload} onClick={handleOpenBulk}
              style={{ border: '1px solid var(--color-primary)', color: 'var(--color-primary)' }}>
              إدخال جماعي
            </Button>
            {filterArea && <Button variant="cta" icon={Plus} onClick={openAdd}>إضافة عيادة</Button>}
          </div>
        }
      />
      <div className="flex gap-4 flex-wrap mb-6">
        <div style={{ minWidth: '200px' }}>
          <AutoComplete label="الفرع" icon={Building2} value={filterBranch} onChange={(val) => setFilterBranch(val)}
            options={branches} placeholder="اختر الفرع..." />
        </div>
        {filterBranch && (
          <div style={{ minWidth: '200px' }}>
            <AutoComplete label="المنطقة" icon={MapPin} value={filterArea} onChange={(val) => setFilterArea(val)}
              options={areas} placeholder="اختر المنطقة..." />
          </div>
        )}
      </div>
      {!filterArea ? (
        <div className="neu-card p-10 text-center"><p style={{ color: 'var(--color-text-muted)' }}>اختر الفرع والمنطقة لعرض العيادات</p></div>
      ) : loading ? (
        <div className="flex justify-center py-16"><Loader2 size={32} className="animate-spin" style={{ color: 'var(--color-primary)' }} /></div>
      ) : (
        <Table columns={columns} data={clinics} onEdit={openEdit} onDelete={handleDelete} 
          selectedIds={selectedIds} onSelectionChange={setSelectedIds}
          emptyMessage="لا توجد عيادات لهذه المنطقة" />
      )}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editItem ? 'تعديل العيادة' : 'إضافة عيادة جديدة'}>
        <div className="space-y-5">
          <AutoComplete label="المنطقة" icon={MapPin} value={areaId} onChange={(val) => setAreaId(val)}
            options={areas} placeholder="اختر المنطقة..." />
          <Input label="اسم العيادة" icon={Hospital} value={name} onChange={e => setName(e.target.value)} placeholder="أدخل اسم العيادة" style={{ textAlign: 'right' }} />
          <Button variant="cta" loading={saving} onClick={handleSave}>{editItem ? 'تحديث' : 'إضافة'}</Button>
        </div>
      </Modal>

      {/* Bulk Import Modal */}
      <Modal 
        isOpen={showBulkModal} 
        onClose={() => setShowBulkModal(false)} 
        title="إدخال جماعي للعيادات"
        wide
      >
        <div className="space-y-4">
          <div className="p-3 rounded-xl text-sm" style={{ background: 'var(--color-bg)', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}>
            💡 الصق أسماء العيادات (كل اسم في سطر) أو استورد من ملف (نصي أو Excel). سيتم إضافتها للمنطقة المختارة.
          </div>

          <div className="flex gap-4 flex-wrap">
            <div className="flex-1" style={{ minWidth: '180px' }}>
              <AutoComplete 
                label="الفرع *" icon={Building2}
                options={branches}
                value={bulkBranchId}
                onChange={(val) => { setBulkBranchId(val); setBulkAreaId(''); }}
                placeholder="اختر الفرع..."
              />
            </div>
            <div className="flex-1" style={{ minWidth: '180px' }}>
              <AutoComplete 
                label="المنطقة *" icon={MapPin}
                options={bulkAreasList}
                value={bulkAreaId}
                onChange={(val) => setBulkAreaId(val)}
                placeholder="اختر المنطقة..."
                disabled={!bulkBranchId}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold mb-2 uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
              أسماء العيادات (كل اسم في سطر) *
            </label>
            <textarea
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              placeholder={"عيادة 1\nعيادة 2\nعيادة 3\n..."}
              rows={6}
              className="neu-input w-full"
              style={{ resize: 'vertical', minHeight: '100px', maxHeight: '200px', textAlign: 'right', fontFamily: 'inherit' }}
            />
            {bulkText.trim() && (
              <p className="text-xs mt-1 font-bold" style={{ color: 'var(--color-primary)' }}>
                سيتم إضافة {bulkPreviewCount} عيادة
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
            <Button variant="cta" onClick={handleBulkSave} loading={bulkSaving} className="flex-1" icon={Upload}>
              إضافة {bulkPreviewCount > 0 ? `(${bulkPreviewCount})` : ''} عيادة
            </Button>
            <Button variant="ghost" onClick={() => setShowBulkModal(false)} className="flex-1">إلغاء</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};


export default ClinicsPage;
