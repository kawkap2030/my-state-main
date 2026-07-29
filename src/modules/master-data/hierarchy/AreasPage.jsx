import React, { useState, useEffect, useRef } from 'react';
import { MapPin, Building2, Plus, Loader2, Trash2, Upload, FileText, Copy } from 'lucide-react';
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

const AreasPage = () => {
  const [areas, setAreas] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [name, setName] = useState('');
  const [branchId, setBranchId] = useState('');
  const [filterBranch, setFilterBranch] = useState('');
  const [saving, setSaving] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);

  // Bulk Import Modal
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [bulkBranchId, setBulkBranchId] = useState('');
  const [bulkSaving, setBulkSaving] = useState(false);
  const fileInputRef = useRef(null);

  const toast = useToast();

  const fetchBranches = async () => {
    try { const data = await invoke('get_branches'); setBranches(data); } catch { toast.error('فشل تحميل الفروع'); }
  };

  const fetchAreas = async (bid) => {
    setLoading(true);
    try {
      const data = bid ? await invoke('get_areas', { branchId: parseInt(bid) }) : [];
      setAreas(data);
    } catch { toast.error('فشل تحميل المناطق'); } finally { setLoading(false); }
  };

  useEffect(() => { fetchBranches(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { 
    if (filterBranch) fetchAreas(filterBranch); 
    else { setAreas([]); setLoading(false); } 
    setSelectedIds([]);
  }, [filterBranch]); // eslint-disable-line react-hooks/exhaustive-deps

  const openAdd = () => { setEditItem(null); setName(''); setBranchId(filterBranch); setModalOpen(true); };
  const openEdit = (item) => { setEditItem(item); setName(item.name); setBranchId(item.branch_id || filterBranch); setModalOpen(true); };

  const handleSave = async () => {
    if (!name.trim() || !branchId) { toast.warning('يرجى ملء جميع الحقول'); return; }
    setSaving(true);
    try {
      if (editItem) {
        await invoke('update_area', { id: editItem.id, name: name.trim(), branchId: parseInt(branchId) });
        toast.success('تم تحديث المنطقة');
      } else {
        await invoke('add_area', { name: name.trim(), branchId: parseInt(branchId) });
        toast.success('تم إضافة المنطقة');
      }
      setModalOpen(false);
      fetchAreas(filterBranch);
    } catch (e) { toast.error(e.toString()); } finally { setSaving(false); }
  };

  const handleDelete = async (item) => {
    if (!confirm(`هل أنت متأكد من حذف المنطقة "${item.name}"؟`)) return;
    try { 
      await invoke('delete_area', { id: item.id }); 
      toast.success('تم حذف المنطقة'); 
      fetchAreas(filterBranch); 
    } catch (e) { 
      toast.error(e.toString()); 
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!confirm(`هل أنت متأكد من حذف ${selectedIds.length} منطقة؟ سيتم حذف المناطق غير المستخدمة فقط.`)) return;
    
    setLoading(true);
    try {
      const result = await invoke('bulk_delete_areas', { ids: selectedIds });
      const { deleted, skipped } = result;
      
      let msg = `تم حذف ${deleted} منطقة بنجاح.`;
      if (skipped > 0) msg += ` تم تخطي ${skipped} منطقة لوجود سجلات مرتبطة بها.`;
      
      toast.info(msg);
      setSelectedIds([]);
      fetchAreas(filterBranch);
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
    if (!bulkBranchId) {
      toast.warning('يرجى اختيار الفرع');
      return;
    }
    if (!bulkText.trim()) {
      toast.warning('يرجى إدخال أسماء المناطق');
      return;
    }
    const names = bulkText.split('\n').map(n => n.trim()).filter(n => n.length > 0);
    if (names.length === 0) {
      toast.warning('لم يتم العثور على أسماء صالحة');
      return;
    }
    setBulkSaving(true);
    try {
      const result = await invoke('bulk_add_areas', { names, branchId: parseInt(bulkBranchId) });
      const { added, skipped } = result;
      let msg = `تم إضافة ${added} منطقة بنجاح.`;
      if (skipped > 0) msg += ` وتم تخطي ${skipped} منطقة لأنها موجودة مسبقاً.`;
      
      toast.success(msg);
      setShowBulkModal(false);
      if (filterBranch === bulkBranchId) {
        fetchAreas(filterBranch);
      } else {
        setFilterBranch(bulkBranchId);
      }
    } catch (err) {
      toast.error(`فشل الإضافة الجماعية: ${err}`);
    } finally {
      setBulkSaving(false);
    }
  };

  const columns = [
    { header: '#', accessor: 'id' },
    { header: 'اسم المنطقة', accessor: 'name' },
  ];

  return (
    <div dir="rtl">
      <Breadcrumb items={[{ label: 'الرئيسية', to: '/' }, { label: 'الهيكل التنظيمي' }, { label: 'المناطق' }]} />
      <PageHeader title="إدارة المناطق" description="إضافة وتعديل وحذف المناطق" icon={MapPin}
        actions={
          <div className="flex gap-2">
            {selectedIds.length > 0 && (
              <Button variant="danger" icon={Trash2} onClick={handleBulkDelete}>حذف المحدد ({selectedIds.length})</Button>
            )}
            <Button variant="ghost" icon={Upload} onClick={handleOpenBulk}
              style={{ border: '1px solid var(--color-primary)', color: 'var(--color-primary)' }}>
              إدخال جماعي
            </Button>
            {filterBranch && <Button variant="cta" icon={Plus} onClick={openAdd}>إضافة منطقة</Button>}
          </div>
        }
      />
      <div className="mb-6" style={{ maxWidth: '300px' }}>
        <AutoComplete label="اختر الفرع" icon={Building2} value={filterBranch} onChange={(val) => setFilterBranch(val)}
          options={branches} placeholder="اختر الفرع لعرض مناطقه..."
        />
      </div>
      {!filterBranch ? (
        <div className="neu-card p-10 text-center"><p style={{ color: 'var(--color-text-muted)' }}>اختر فرعاً لعرض المناطق</p></div>
      ) : loading ? (
        <div className="flex justify-center py-16"><Loader2 size={32} className="animate-spin" style={{ color: 'var(--color-primary)' }} /></div>
      ) : (
        <Table columns={columns} data={areas} onEdit={openEdit} onDelete={handleDelete} 
          selectedIds={selectedIds} onSelectionChange={setSelectedIds}
          emptyMessage="لا توجد مناطق لهذا الفرع" />
      )}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editItem ? 'تعديل المنطقة' : 'إضافة منطقة جديدة'}>
        <div className="space-y-5">
          <AutoComplete label="الفرع" icon={Building2} value={branchId} onChange={(val) => setBranchId(val)}
            options={branches} placeholder="اختر الفرع..." />
          <Input label="اسم المنطقة" icon={MapPin} value={name} onChange={e => setName(e.target.value)} placeholder="أدخل اسم المنطقة" style={{ textAlign: 'right' }} />
          <Button variant="cta" loading={saving} onClick={handleSave}>{editItem ? 'تحديث' : 'إضافة'}</Button>
        </div>
      </Modal>

      {/* Bulk Import Modal */}
      <Modal 
        isOpen={showBulkModal} 
        onClose={() => setShowBulkModal(false)} 
        title="إدخال جماعي للمناطق"
        wide
      >
        <div className="space-y-4">
          <div className="p-3 rounded-xl text-sm" style={{ background: 'var(--color-bg)', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}>
            💡 الصق أسماء المناطق (كل اسم في سطر) أو استورد من ملف (نصي أو Excel). سيتم إضافتها للفرع المSelected.
          </div>

          <AutoComplete 
            label="الفرع *" icon={Building2}
            options={branches}
            value={bulkBranchId}
            onChange={(val) => setBulkBranchId(val)}
            placeholder="اختر الفرع..."
          />

          <div>
            <label className="block text-xs font-bold mb-2 uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
              أسماء المناطق (كل اسم في سطر) *
            </label>
            <textarea
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              placeholder={"منطقة 1\nمنطقة 2\nمنطقة 3\n..."}
              rows={6}
              className="neu-input w-full"
              style={{ resize: 'vertical', minHeight: '100px', maxHeight: '200px', textAlign: 'right', fontFamily: 'inherit' }}
            />
            {bulkText.trim() && (
              <p className="text-xs mt-1 font-bold" style={{ color: 'var(--color-primary)' }}>
                سيتم إضافة {bulkPreviewCount} منطقة
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
              إضافة {bulkPreviewCount > 0 ? `(${bulkPreviewCount})` : ''} منطقة
            </Button>
            <Button variant="ghost" onClick={() => setShowBulkModal(false)} className="flex-1">إلغاء</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};


export default AreasPage;
