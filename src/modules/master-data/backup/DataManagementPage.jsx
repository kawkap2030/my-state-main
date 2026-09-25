import React, { useState, useEffect, useRef } from 'react';
import { 
  Database, Trash2, RefreshCw, FolderOpen, Download, Upload,
  AlertTriangle, Calendar, Building2, CheckSquare, Square, 
  Check, ArrowRightLeft, ShieldAlert, Pill, Syringe, Layers, 
  FileText, Landmark, Clock, CheckCircle2, X, HardDrive,
  ShieldCheck, MessageSquare, Undo2, FileSpreadsheet, RotateCcw
} from 'lucide-react';
import invoke from '../../../api/tauriApi';
import { useToast } from '../../../components/ui/Toast';
import Button from '../../../components/ui/Button';

// Mapping table names to Arabic display names
const TABLE_ARABIC_NAMES = {
  branches: 'الفروع',
  areas: 'المناطق',
  clinics: 'العيادات',
  drug_categories: 'تصنيفات الأدوية',
  drugs: 'الأدوية',
  detailed_drug_dispensed: 'حركات صرف الأدوية التفصيلية',
  insulin_dispensed: 'حركات صرف الإنسولين',
  drug_groups: 'المجموعات الدوائية',
  insulin_codes: 'أكواد الإنسولين',
  insulin_types: 'أنواع الإنسولين',
  insulin_categories: 'تصنيفات الإنسولين',
  drug_group_codes: 'أكواد المجموعات الدوائية',
  insulin_units: 'وحدات الإنسولين',
  drug_units: 'وحدات الأدوية',
  judicial_patients: 'مرضى الأحكام القضائية',
  patient_pdfs: 'ملفات PDF للمرضى',
  judicial_medicines: 'أدوية الأحكام القضائية',
  judicial_patient_medicines: 'أدوية المرضى (الأحكام)',
  judicial_dispensed: 'منصرف الأحكام القضائية',
  monthly_free_drugs_dispensed: 'المنصرف الشهري (أدوية مجانية)',
  monthly_supported_drugs_dispensed: 'المنصرف الشهري (أدوية مدعمة)',
  supply_categories: 'تصنيفات المستلزمات',
  supplies: 'المستلزمات الطبية',
  monthly_supplies_dispensed: 'منصرف المستلزمات الشهري',
  medical_tickets: 'التذاكر الطبية',
  users: 'المستخدمين',
  audit_log: 'سجل المراجعة',
  dispensing_month_isolation: 'عزل شهور الصرف',
  manual_locked_months: 'الشهور المقفلة يدوياً'
};

const DataManagementPage = () => {
  const toast = useToast();
  const fileInputRef = useRef(null);
  const [activeTab, setActiveTab] = useState('backup');
  
  // States for backups
  const [backups, setBackups] = useState([]);
  const [selectedBackups, setSelectedBackups] = useState([]);
  const [backupLoading, setBackupLoading] = useState(false);
  const [backupsListLoading, setBackupsListLoading] = useState(true);
  const [backupNotes, setBackupNotes] = useState({});
  const [editingNote, setEditingNote] = useState(null);
  const [noteText, setNoteText] = useState('');
  
  // States for summary statistics
  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(true);

  // DB Info states
  const [dbSize, setDbSize] = useState(null);
  const [integrityResult, setIntegrityResult] = useState(null);
  const [integrityLoading, setIntegrityLoading] = useState(false);

  // States for clearing operations
  const [customTables, setCustomTables] = useState([]);
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [clearPayload, setClearPayload] = useState(null);
  const [clearingLoading, setClearingLoading] = useState(false);
  const [lastClearBackup, setLastClearBackup] = useState(null); // For quick undo
  
  // Pre-clear backup prompt
  const [showBackupPrompt, setShowBackupPrompt] = useState(false);
  const [pendingClearPayload, setPendingClearPayload] = useState(null);
  const [backupPromptLoading, setBackupPromptLoading] = useState(false);

  // Daily auto-backup toggle
  const [dailyBackupEnabled, setDailyBackupEnabled] = useState(() =>
    localStorage.getItem('dailyAutoBackup') === 'true'
  );

  // Restore confirmation modal states
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [restoreChecked, setRestoreChecked] = useState(false);
  const [pendingRestoreFile, setPendingRestoreFile] = useState(null);
  const [restoreLoading, setRestoreLoading] = useState(false);

  // Advanced Clear Inputs
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [clearScope, setClearScope] = useState('both');
  const [selectedClinics, setSelectedClinics] = useState([]);
  const [selectedInsulinTypes, setSelectedInsulinTypes] = useState([]);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  useEffect(() => {
    loadBackups();
    loadSummary();
    loadDbSize();
    loadBackupNotes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleToggleDailyBackup = () => {
    const next = !dailyBackupEnabled;
    setDailyBackupEnabled(next);
    localStorage.setItem('dailyAutoBackup', String(next));
    toast.info(next ? '✅ تم تفعيل النسخ الاحتياطي التلقائي اليومي' : '🚫 تم تعطيل النسخ الاحتياطي التلقائي اليومي');
  };

  const loadBackups = async () => {
    setBackupsListLoading(true);
    try {
      const data = await invoke('get_backup_files');
      setBackups(data);
    } catch (err) {
      toast.error('فشل في تحميل ملفات النسخ الاحتياطي: ' + err);
    } finally {
      setBackupsListLoading(false);
    }
  };

  const loadSummary = async () => {
    setSummaryLoading(true);
    try {
      const data = await invoke('get_data_management_summary');
      setSummary(data);
    } catch (err) {
      toast.error('فشل في جلب إحصائيات البيانات: ' + err);
    } finally {
      setSummaryLoading(false);
    }
  };

  const loadDbSize = async () => {
    try {
      const size = await invoke('get_db_size');
      setDbSize(size);
    } catch (err) {
      console.error('Failed to get DB size:', err);
    }
  };

  const loadBackupNotes = async () => {
    try {
      const notes = await invoke('get_backup_notes');
      setBackupNotes(notes);
    } catch (err) {
      console.error('Failed to load backup notes:', err);
    }
  };

  const handleCreateBackup = async () => {
    setBackupLoading(true);
    try {
      const filename = await invoke('create_backup');
      toast.success(`تم إنشاء النسخة الاحتياطية بنجاح: ${filename}`);
      loadBackups();
    } catch (err) {
      toast.error('خطأ في إنشاء النسخة الاحتياطية: ' + err);
    } finally {
      setBackupLoading(false);
    }
  };

  const handleAutoBackupWithRotation = async () => {
    setBackupLoading(true);
    try {
      const filename = await invoke('auto_backup_with_rotation', { maxBackups: 10 });
      toast.success(`تم إنشاء نسخة تلقائية مع تدوير النسخ القديمة: ${filename}`);
      loadBackups();
    } catch (err) {
      toast.error('خطأ في النسخ التلقائي: ' + err);
    } finally {
      setBackupLoading(false);
    }
  };

  const handleOpenFolder = async () => {
    try {
      await invoke('open_backups_folder');
    } catch (err) {
      toast.error('فشل في فتح مجلد النسخ الاحتياطية: ' + err);
    }
  };

  const handleImportBackup = async (e) => {
    const file = e?.target?.files?.[0];
    const sourcePath = file ? (file.path || file.name) : null;

    try {
      const filename = await invoke('import_backup', { sourcePath });
      toast.success(`تم استيراد وتدقيق النسخة الاحتياطية بنجاح: ${filename}`);
      loadBackups();
    } catch (err) {
      if (err !== 'تم إلغاء اختيار الملف') {
        toast.error('فشل في استيراد النسخة: ' + err);
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDeleteBackup = async (filename) => {
    if (!window.confirm(`هل أنت متأكد من حذف النسخة الاحتياطية: ${filename}؟`)) return;
    try {
      // Safety: create a backup before deleting, so user can restore if mistaken
      try {
        await invoke('auto_backup', { maxBackups: 30 });
      } catch (_) { /* backup failure must not block deletion */ }
      await invoke('delete_backup', { filename });
      toast.success('تم حذف النسخة الاحتياطية بنجاح');
      loadBackups();
    } catch (err) {
      toast.error('فشل في الحذف: ' + err);
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedBackups.length === 0) return;
    if (!window.confirm(`هل أنت متأكد من حذف ${selectedBackups.length} نسخة احتياطية؟`)) return;
    try {
      // Safety: create a backup before bulk deletion, so user can restore if mistaken
      try {
        await invoke('auto_backup', { maxBackups: 30 });
      } catch (_) { /* backup failure must not block deletion */ }
      const deleted = await invoke('delete_multiple_backups', { filenames: selectedBackups });
      toast.success(`تم حذف ${deleted} نسخة احتياطية بنجاح`);
      setSelectedBackups([]);
      loadBackups();
    } catch (err) {
      toast.error('فشل في حذف الملفات المحددة: ' + err);
    }
  };

  const triggerRestore = (filename) => {
    setPendingRestoreFile(filename);
    setRestoreChecked(false);
    setShowRestoreModal(true);
  };

  const executeRestore = async () => {
    if (!restoreChecked) {
      toast.error('يرجى الموافقة على تأكيد الاستعادة');
      return;
    }

    setRestoreLoading(true);
    setShowRestoreModal(false);
    try {
      await invoke('restore_backup', { filename: pendingRestoreFile });
      toast.success('تم استعادة النسخة الاحتياطية بنجاح ✅');
      setPendingRestoreFile(null);
      loadSummary();
      loadBackups();
      loadDbSize();
    } catch (err) {
      toast.error('خطأ في استعادة النسخة: ' + err);
    } finally {
      setRestoreLoading(false);
    }
  };

  const handleCheckIntegrity = async () => {
    setIntegrityLoading(true);
    setIntegrityResult(null);
    try {
      const result = await invoke('check_db_integrity');
      setIntegrityResult(result);
      if (result === 'ok') {
        toast.success('قاعدة البيانات سليمة ✅');
      } else {
        toast.error('تم اكتشاف مشاكل في قاعدة البيانات!');
      }
    } catch (err) {
      toast.error('فشل في فحص قاعدة البيانات: ' + err);
    } finally {
      setIntegrityLoading(false);
    }
  };

  const handleSaveNote = async (filename) => {
    try {
      await invoke('save_backup_note', { filename, note: noteText });
      setBackupNotes(prev => ({ ...prev, [filename]: noteText }));
      setEditingNote(null);
      setNoteText('');
      toast.success('تم حفظ الملاحظة بنجاح');
    } catch (err) {
      toast.error('فشل في حفظ الملاحظة: ' + err);
    }
  };

  const handleExportTable = async (tableName) => {
    try {
      const excelPath = await invoke('export_to_excel', { tableNames: [tableName], customSavePath: null });
      toast.success(`تم تصدير الجدول بنجاح: ${excelPath}`);
    } catch (err) {
      if (err !== 'CANCELLED' && !err?.includes('CANCELLED')) {
        toast.error('فشل في تصدير الجدول: ' + err);
      }
    }
  };

  const triggerClear = (payload) => {
    setPendingClearPayload(payload);
    setShowBackupPrompt(true);
  };

  // Called from the pre-clear backup prompt
  const handleBackupPromptChoice = async (createBackup) => {
    setShowBackupPrompt(false);

    if (createBackup) {
      setBackupPromptLoading(true);
      try {
        const filename = await invoke('auto_backup', { maxBackups: 30 });
        toast.success(`✅ تم إنشاء نسخة احتياطية: ${filename}`);
      } catch (err) {
        toast.warning('⚠️ تعذر إنشاء النسخة الاحتياطية — يمكنك المتابعة بدونها');
      } finally {
        setBackupPromptLoading(false);
      }
    }

    // Proceed to the confirmation modal
    setClearPayload(pendingClearPayload);
    setConfirmChecked(false);
    setShowConfirmModal(true);
    setPendingClearPayload(null);
  };

  const executeClear = async () => {
    if (!confirmChecked) {
      toast.error('يرجى الموافقة على تأكيد الحذف');
      return;
    }
    
    setClearingLoading(true);
    try {
      const response = await invoke('clear_data', {
        clearType: clearPayload.clearType,
        confirmText: 'تأكيد الحذف',
        selectedTables: clearPayload.selectedTables || null,
        advancedType: clearPayload.advancedType || null,
        selectedCategories: clearPayload.selectedCategories || null,
        clearScope: clearPayload.clearScope || null,
        selectedClinics: clearPayload.selectedClinics || null,
        selectedInsulinTypes: clearPayload.selectedInsulinTypes || null,
        startDate: clearPayload.startDate || null,
        endDate: clearPayload.endDate || null
      });
      
      // Extract auto-backup filename from response for quick undo
      const match = response.match(/نسخة احتياطية تلقائية: (.+)$/);
      if (match) {
        setLastClearBackup(match[1]);
      }
      
      toast.success(response);
      setShowConfirmModal(false);
      loadSummary();
      loadBackups();
      loadDbSize();
      
      // Reset selections
      setSelectedCategories([]);
      setSelectedClinics([]);
      setSelectedInsulinTypes([]);
      setCustomTables([]);
      setStartDate('');
      setEndDate('');
    } catch (err) {
      toast.error('فشل في تفريغ البيانات: ' + err);
    } finally {
      setClearingLoading(false);
    }
  };
  const handleExportBeforeClear = async () => {
    let tablesToExport = [];
    if (!clearPayload) return;
    
    switch (clearPayload.clearType) {
      case 'dispensing_only':
        tablesToExport = ['detailed_drug_dispensed', 'drug_groups', 'insulin_dispensed', 'judicial_dispensed', 'medical_tickets', 'monthly_free_drugs_dispensed', 'monthly_supported_drugs_dispensed', 'monthly_supplies_dispensed'];
        break;
      case 'all_data':
        tablesToExport = Object.keys(TABLE_ARABIC_NAMES);
        break;
      case 'custom':
        tablesToExport = clearPayload.selectedTables || [];
        break;
      case 'advanced':
        if (clearPayload.advancedType === 'categories') tablesToExport = ['detailed_drug_dispensed', 'drugs'];
        else if (clearPayload.advancedType === 'clinics' || clearPayload.advancedType === 'date_range') tablesToExport = ['detailed_drug_dispensed', 'insulin_dispensed', 'judicial_dispensed', 'drug_groups', 'medical_tickets', 'monthly_free_drugs_dispensed', 'monthly_supported_drugs_dispensed', 'monthly_supplies_dispensed', 'judicial_patients'];
        else if (clearPayload.advancedType === 'insulin_types') tablesToExport = ['insulin_dispensed'];
        break;
      default:
        break;
    }

    if (tablesToExport.length === 0) {
      toast.error('لا توجد بيانات قابلة للتصدير لهذا الإجراء');
      return;
    }

    toast.success(`جاري تصدير جداول البيانات إلى ملف إكسل واحد...`);
    try {
       await invoke('export_to_excel', { tableNames: tablesToExport, customSavePath: null });
      toast.success(`تم التصدير بنجاح!`);
    } catch (err) {
      if (err !== 'CANCELLED' && !err?.includes('CANCELLED')) {
        toast.error('فشل في التصدير: ' + err);
      }
    }
  };
  const handleQuickUndo = async () => {
    if (!lastClearBackup) return;
    const confirmed = window.confirm(`هل تريد استعادة النسخة الاحتياطية التي تم إنشاؤها قبل آخر عملية تفريغ؟\n\nملف النسخة: ${lastClearBackup}`);
    if (!confirmed) return;
    
    setBackupLoading(true);
    try {
      await invoke('restore_backup', { filename: lastClearBackup });
      toast.success('تم التراجع عن عملية التفريغ بنجاح ✅');
      setLastClearBackup(null);
      loadSummary();
      loadBackups();
      loadDbSize();
    } catch (err) {
      toast.error('فشل في التراجع: ' + err);
    } finally {
      setBackupLoading(false);
    }
  };

  const handleSelectBackup = (filename) => {
    setSelectedBackups(prev => 
      prev.includes(filename) ? prev.filter(f => f !== filename) : [...prev, filename]
    );
  };

  const handleSelectAllBackups = () => {
    if (selectedBackups.length === backups.length) {
      setSelectedBackups([]);
    } else {
      setSelectedBackups(backups.map(b => b.name));
    }
  };

  const toggleCustomTable = (table) => {
    setCustomTables(prev => 
      prev.includes(table) ? prev.filter(t => t !== table) : [...prev, table]
    );
  };

  return (
    <div className="p-6 md:p-8 space-y-6" dir="rtl" style={{ animation: 'fadeIn 0.3s ease-out' }}>
      
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-cyan-500/10 text-cyan-600 rounded-2xl shadow-sm">
            <Database size={28} strokeWidth={2.5} />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight" style={{ color: 'var(--color-text)' }}>
              إدارة البيانات والنسخ الاحتياطي
            </h1>
            <p className="text-xs font-bold mt-1 uppercase tracking-widest" style={{ color: 'var(--color-text-muted)' }}>
              Data & Backup Management
            </p>
          </div>
        </div>

        <div className="flex gap-2 flex-wrap">
          <Button
            onClick={() => {
              if (activeTab === 'backup') {
                loadBackups();
              } else {
                loadSummary();
              }
            }}
            variant="ghost"
            className="gap-2 text-xs font-bold"
            disabled={activeTab === 'backup' ? backupsListLoading : summaryLoading}
          >
            <RefreshCw size={14} className={(activeTab === 'backup' ? backupsListLoading : summaryLoading) ? 'animate-spin' : ''} />
            {activeTab === 'backup' ? 'تحديث قائمة النسخ' : 'تحديث البيانات'}
          </Button>
          <Button
            onClick={handleCreateBackup}
            variant="primary"
            className="gap-2 text-xs font-bold"
            disabled={backupLoading}
          >
            <FolderOpen size={14} />
            نسخة احتياطية فورية
          </Button>
        </div>
      </div>

      {/* DB Info Bar */}
      <div className="flex flex-wrap gap-3">
        <div className="neu-card px-4 py-3 flex items-center gap-3 bg-[var(--color-bg-card)]" style={{ borderRadius: '14px' }}>
          <HardDrive size={18} className="text-cyan-500" />
          <div>
            <span className="text-[10px] text-slate-400 font-bold block">حجم قاعدة البيانات</span>
            <span className="text-sm font-black" style={{ color: 'var(--color-text)' }}>
              {dbSize !== null ? `${dbSize.toFixed(2)} MB` : '...'}
            </span>
          </div>
        </div>

        <div className="neu-card px-4 py-3 flex items-center gap-3 bg-[var(--color-bg-card)]" style={{ borderRadius: '14px' }}>
          <Clock size={18} className={dailyBackupEnabled ? 'text-emerald-500' : 'text-slate-400'} />
          <div>
            <span className="text-[10px] text-slate-400 font-bold block">نسخ يومي تلقائي</span>
            <span className="text-sm font-black" style={{ color: 'var(--color-text)' }}>
              {dailyBackupEnabled ? 'مفعّل ✅' : 'معطّل'}
            </span>
          </div>
          <button
            onClick={handleToggleDailyBackup}
            className={`relative w-10 h-5 rounded-full transition-all duration-300 cursor-pointer ${dailyBackupEnabled ? 'bg-emerald-500' : 'bg-slate-300'}`}
          >
            <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all duration-300 ${dailyBackupEnabled ? 'left-[22px]' : 'left-0.5'}`} />
          </button>
        </div>

        <div className="neu-card px-4 py-3 flex items-center gap-3 bg-[var(--color-bg-card)]" style={{ borderRadius: '14px' }}>
          <ShieldCheck size={18} className={integrityResult === 'ok' ? 'text-emerald-500' : integrityResult ? 'text-red-500' : 'text-slate-400'} />
          <div>
            <span className="text-[10px] text-slate-400 font-bold block">سلامة القاعدة</span>
            <span className="text-sm font-black" style={{ color: 'var(--color-text)' }}>
              {integrityResult === 'ok' ? 'سليمة ✅' : integrityResult ? 'مشاكل ⚠️' : 'غير مفحوصة'}
            </span>
          </div>
          <Button
            size="xs"
            variant="ghost"
            className="text-[10px] mr-2"
            onClick={handleCheckIntegrity}
            disabled={integrityLoading}
          >
            {integrityLoading ? <RefreshCw size={12} className="animate-spin" /> : 'فحص'}
          </Button>
        </div>

        {lastClearBackup && (
          <div className="neu-card px-4 py-3 flex items-center gap-3 bg-amber-50 border-amber-200" style={{ borderRadius: '14px' }}>
            <Undo2 size={18} className="text-amber-600" />
            <div>
              <span className="text-[10px] text-amber-500 font-bold block">تراجع سريع متاح</span>
              <span className="text-xs font-black text-amber-700 font-mono">{lastClearBackup.substring(0, 30)}...</span>
            </div>
            <Button
              size="xs"
              variant="ghost"
              className="text-xs font-bold text-amber-700 border-amber-300 hover:bg-amber-100"
              onClick={handleQuickUndo}
            >
              <Undo2 size={12} className="ml-1" />
              تراجع
            </Button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[var(--color-border)] pb-1 gap-2 flex-wrap">
        <button
          onClick={() => setActiveTab('backup')}
          className={`neu-tab ${activeTab === 'backup' ? 'active' : ''}`}
        >
          <FolderOpen size={16} />
          النسخ الاحتياطي والاستعادة
        </button>
        <button
          onClick={() => setActiveTab('clear')}
          className={`neu-tab ${activeTab === 'clear' ? 'active' : ''}`}
        >
          <Trash2 size={16} />
          تفريغ البيانات العام
        </button>
        <button
          onClick={() => setActiveTab('advanced')}
          className={`neu-tab ${activeTab === 'advanced' ? 'active' : ''}`}
        >
          <ArrowRightLeft size={16} />
          التفريغ المتقدم الشرطي
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'backup' && (
        <div className="space-y-6">
          
          <div className="p-4 bg-cyan-50 border border-cyan-200 rounded-2xl flex items-start gap-4 text-cyan-800 text-sm font-bold shadow-sm max-w-5xl">
            <ShieldAlert size={24} className="shrink-0 mt-0.5" />
            <div>
              <p>
                نظام النسخ الاحتياطي التلقائي واليدوي يقوم بحفظ نسخة مضغوطة من قاعدة البيانات الحالية بصيغة الـ ZIP.
                <br />
                يمكنك استعادتها بأي وقت. عند الاستعادة، يتم تلقائياً حفظ نسخة احتياطية من الحالة الحالية للأمان.
              </p>
              <div className="mt-3 flex gap-2 flex-wrap">
                <Button size="sm" variant="secondary" className="text-xs" onClick={handleOpenFolder}>
                  <FolderOpen size={12} className="ml-1.5" />
                  فتح مجلد النسخ
                </Button>
                <Button size="sm" variant="secondary" className="text-xs" onClick={handleAutoBackupWithRotation} disabled={backupLoading}>
                  <RotateCcw size={12} className="ml-1.5" />
                  نسخ تلقائي مع تدوير (حد أقصى 10)
                </Button>
                <input ref={fileInputRef} type="file" accept=".zip" className="hidden" onChange={handleImportBackup} />
                <Button size="sm" variant="secondary" className="text-xs" onClick={() => handleImportBackup()}>
                  <Upload size={12} className="ml-1.5" />
                  استيراد نسخة خارجية (ZIP)
                </Button>
              </div>
            </div>
          </div>

          <div className="neu-card p-6 bg-[var(--color-bg-card)]">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-black" style={{ color: 'var(--color-text)' }}>قائمة النسخ الاحتياطية المتوفرة</h2>
              {selectedBackups.length > 0 && (
                <Button variant="danger" size="sm" className="gap-2 text-xs" onClick={handleDeleteSelected}>
                  <Trash2 size={14} />
                  حذف النسخ المحددة ({selectedBackups.length})
                </Button>
              )}
            </div>

            {backupsListLoading ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2">
                <RefreshCw className="animate-spin text-[var(--color-primary)]" size={32} />
                <span className="text-sm font-bold text-[var(--color-text-muted)]">جاري تحميل قائمة النسخ...</span>
              </div>
            ) : backups.length === 0 ? (
              <div className="text-center py-12 text-[var(--color-text-muted)]">
                <FolderOpen size={48} className="mx-auto mb-3 opacity-30" />
                <p className="font-bold">لا توجد نسخ احتياطية متوفرة حالياً</p>
                <p className="text-xs mt-1">اضغط على زر "نسخة احتياطية فورية" لإنشاء نسخة جديدة.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-right border-collapse">
                  <thead>
                    <tr className="border-b border-[var(--color-border)] text-slate-500 text-xs font-black">
                      <th className="py-3 px-3 w-10 text-center">
                        <input
                          type="checkbox"
                          className="rounded border-slate-300"
                          checked={selectedBackups.length === backups.length}
                          onChange={handleSelectAllBackups}
                        />
                      </th>
                      <th className="py-3 px-3">اسم ملف النسخة</th>
                      <th className="py-3 px-3 text-center">الحجم (KB)</th>
                      <th className="py-3 px-3 text-center">تاريخ الإنشاء</th>
                      <th className="py-3 px-3 text-center">ملاحظة</th>
                      <th className="py-3 px-3 text-center">الإجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border)] text-sm font-bold">
                    {backups.map(b => (
                      <tr key={b.name} className="hover:bg-[var(--color-border)]/20 transition-colors">
                        <td className="py-3 px-3 text-center">
                          <input
                            type="checkbox"
                            className="rounded border-slate-300"
                            checked={selectedBackups.includes(b.name)}
                            onChange={() => handleSelectBackup(b.name)}
                          />
                        </td>
                        <td className="py-3 px-3 text-slate-700 font-mono text-xs">{b.name}</td>
                        <td className="py-3 px-3 text-center text-slate-500">{b.size.toFixed(2)}</td>
                        <td className="py-3 px-3 text-center text-slate-500">{b.date}</td>
                        <td className="py-3 px-3 text-center">
                          {editingNote === b.name ? (
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                value={noteText}
                                onChange={(e) => setNoteText(e.target.value)}
                                placeholder="أدخل ملاحظة..."
                                className="neu-input text-xs py-1 px-2"
                                style={{ minWidth: '120px' }}
                                onKeyDown={(e) => e.key === 'Enter' && handleSaveNote(b.name)}
                              />
                              <button onClick={() => handleSaveNote(b.name)} className="text-emerald-600 hover:text-emerald-700 p-1">
                                <Check size={14} />
                              </button>
                              <button onClick={() => { setEditingNote(null); setNoteText(''); }} className="text-slate-400 hover:text-slate-600 p-1">
                                <X size={14} />
                              </button>
                            </div>
                          ) : (
                            <div 
                              className="flex items-center justify-center gap-1 cursor-pointer text-xs text-slate-400 hover:text-cyan-600"
                              onClick={() => { setEditingNote(b.name); setNoteText(backupNotes[b.name] || ''); }}
                            >
                              {backupNotes[b.name] ? (
                                <span className="text-cyan-600 font-bold">{backupNotes[b.name]}</span>
                              ) : (
                                <>
                                  <MessageSquare size={12} />
                                  <span>إضافة</span>
                                </>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-3">
                          <div className="flex items-center justify-center gap-2">
                            <Button
                              size="xs"
                              variant="secondary"
                              className="text-xs text-emerald-600 hover:bg-emerald-50"
                              onClick={() => triggerRestore(b.name)}
                            >
                              استعادة
                            </Button>
                            <Button
                              size="xs"
                              variant="ghost"
                              className="text-xs text-red-500 hover:bg-red-50"
                              onClick={() => handleDeleteBackup(b.name)}
                            >
                              حذف
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'clear' && (
        <div className="space-y-6">
          <div className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-4 text-red-800 text-sm font-bold shadow-sm max-w-4xl">
            <AlertTriangle size={24} className="shrink-0 mt-0.5 text-red-600" />
            <div>
              <p className="font-extrabold text-base">منطقة الخطر - تفريغ وحذف البيانات</p>
              <p className="mt-1 opacity-90">
                هذه العمليات تقوم بمسح دائم للبيانات من الجداول. يرجى الحذر التام قبل المتابعة.
                سيقوم النظام تلقائياً بإنشاء نسخة احتياطية من قاعدة البيانات وحفظها في مجلد النسخ للرجوع إليها مستقبلاً.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Quick Actions Card */}
            <div className="neu-card p-6 bg-[var(--color-bg-card)] lg:col-span-1 space-y-6">
              <h2 className="text-lg font-black text-slate-700">تفريغ سريع ومصنع</h2>
              
              <div className="space-y-4">
                <div className="p-4 rounded-xl border border-slate-200 space-y-2">
                  <h3 className="text-sm font-black text-slate-700">1. تفريغ جزئي (عمليات الصرف فقط)</h3>
                  <p className="text-xs text-slate-500 leading-relaxed font-bold">
                    يقوم بمسح حركات الصرف والعمليات الشهرية، الأنسولين، المستلزمات والتذاكر.
                    <strong className="text-slate-700 block mt-1">يحتفظ بـ: الفروع، المناطق، العيادات، الأدوية، وتصنيفات الأنسولين.</strong>
                  </p>
                  <Button
                    variant="danger"
                    size="sm"
                    className="w-full text-xs font-bold mt-2"
                    onClick={() => triggerClear({ clearType: 'dispensing_only' })}
                  >
                    تفريغ حركات الصرف
                  </Button>
                </div>

                <div className="p-4 rounded-xl border border-red-100 bg-red-50/20 space-y-2">
                  <h3 className="text-sm font-black text-red-600">2. تفريغ كلي (ضبط المصنع بالكامل)</h3>
                  <p className="text-xs text-slate-500 leading-relaxed font-bold">
                    يقوم بمسح كامل قاعدة البيانات وحذف جميع السجلات والهياكل التنظيمية والأدوية.
                    يعيد النظام كأنه تشغيل أول مرة مع الفرع الرئيسي الافتراضي فقط.
                  </p>
                  <Button
                    variant="danger"
                    size="sm"
                    className="w-full text-xs font-bold mt-2 bg-red-600 hover:bg-red-700"
                    onClick={() => triggerClear({ clearType: 'all_data' })}
                  >
                    تصفير النظام بالكامل
                  </Button>
                </div>
              </div>
            </div>

            {/* Table Statistics Card & Custom Clear */}
            <div className="neu-card p-6 bg-[var(--color-bg-card)] lg:col-span-2 space-y-4">
              <div className="flex justify-between items-center flex-wrap gap-2">
                <h2 className="text-lg font-black text-slate-700">سجلات جداول قاعدة البيانات والتفريغ المخصص</h2>
                <div className="flex gap-2">
                  {customTables.length > 0 && (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1 text-xs font-bold text-cyan-600"
                        onClick={async () => {
                          try {
                            await invoke('export_to_excel', { tableNames: customTables, customSavePath: null });
                            toast.success(`تم تصدير الجداول المحددة بنجاح!`);
                          } catch (err) {
                            if (err !== 'CANCELLED' && !err?.includes('CANCELLED')) {
                              toast.error('فشل التصدير: ' + err);
                            }
                          }
                        }}
                      >
                        <FileSpreadsheet size={14} />
                        تصدير إكسل ({customTables.length})
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        className="gap-2 text-xs font-bold"
                        onClick={() => triggerClear({ clearType: 'custom', selectedTables: customTables })}
                      >
                        تفريغ الجداول المحددة ({customTables.length})
                      </Button>
                    </>
                  )}
                </div>
              </div>

              {summaryLoading ? (
                <div className="flex flex-col items-center justify-center py-20 gap-2">
                  <RefreshCw className="animate-spin text-[var(--color-primary)]" size={32} />
                  <span className="text-sm font-bold text-[var(--color-text-muted)]">جاري جلب إحصائيات الجداول...</span>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[400px] overflow-y-auto pr-1">
                  {summary && Object.entries(summary.table_counts).map(([table, count]) => {
                    const arabicName = TABLE_ARABIC_NAMES[table] || table;
                    const isSelected = customTables.includes(table);
                    
                    return (
                      <div 
                        key={table}
                        className={`p-3 border rounded-xl flex items-center justify-between transition-all ${
                          isSelected 
                            ? 'border-red-500 bg-red-50/10' 
                            : 'border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-center gap-3 cursor-pointer flex-1" onClick={() => toggleCustomTable(table)}>
                          {isSelected ? (
                            <CheckSquare className="text-red-500" size={18} />
                          ) : (
                            <Square className="text-slate-300" size={18} />
                          )}
                          <div>
                            <div className="text-sm font-black text-slate-700">{arabicName}</div>
                            <div className="text-[10px] text-slate-400 font-mono">{table}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {count > 0 && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleExportTable(table); }}
                              className="text-slate-400 hover:text-cyan-600 p-1 transition-colors"
                              title="تصدير CSV"
                            >
                              <FileSpreadsheet size={14} />
                            </button>
                          )}
                          <span className={`text-sm font-extrabold px-2.5 py-1 rounded-lg ${count > 0 ? 'bg-slate-100 text-slate-700' : 'bg-slate-50 text-slate-400'}`}>
                            {count}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>
        </div>
      )}

      {activeTab === 'advanced' && (
        <div className="space-y-6">
          
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-4 text-amber-800 text-sm font-bold shadow-sm max-w-4xl">
            <AlertTriangle size={24} className="shrink-0 mt-0.5 text-amber-600" />
            <div>
              <p className="font-extrabold">التفريغ المتقدم المشرط (Selective Cleaning)</p>
              <p className="mt-1 opacity-90 text-xs">
                يمكنك هنا تنظيف وتفريغ سجلات صرف معينة بالاعتماد على الفلترة دون التأثير على بقية أجزاء النظام.
                سيتم حفظ نسخة احتياطية تلقائياً قبل الحذف.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-7xl">
            
            {/* Clear By Category */}
            <div className="neu-card p-5 bg-[var(--color-bg-card)] space-y-4">
              <div className="flex items-center gap-2 border-b pb-2 mb-2">
                <Pill className="text-cyan-500" size={20} />
                <h3 className="text-base font-black text-slate-700">تفريغ حسب تصنيفات الأدوية</h3>
              </div>
              
              <div className="space-y-3">
                <label className="field-label">اختر التصنيف الدوائي:</label>
                <div className="max-h-[140px] overflow-y-auto border rounded-xl p-3 space-y-2 bg-slate-50/50">
                  {summary?.categories.map(c => (
                    <label key={c.id} className="flex items-center gap-3 cursor-pointer text-sm font-bold">
                      <input
                        type="checkbox"
                        checked={selectedCategories.includes(c.id)}
                        onChange={() => {
                          setSelectedCategories(prev => 
                            prev.includes(c.id) ? prev.filter(id => id !== c.id) : [...prev, c.id]
                          );
                        }}
                        className="rounded border-slate-300"
                      />
                      <span className="text-slate-700">{c.name}</span>
                      <span className="text-[10px] text-slate-400 font-bold">
                        ({c.drugs_count} أدوية - {c.dispensed_count} صرف)
                      </span>
                    </label>
                  ))}
                </div>

                <div className="space-y-2">
                  <label className="field-label">نطاق المسح:</label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 text-xs font-bold cursor-pointer">
                      <input type="radio" name="clear_scope" checked={clearScope === 'records_only'} onChange={() => setClearScope('records_only')} />
                      سجلات الصرف فقط
                    </label>
                    <label className="flex items-center gap-2 text-xs font-bold cursor-pointer">
                      <input type="radio" name="clear_scope" checked={clearScope === 'drugs_only'} onChange={() => setClearScope('drugs_only')} />
                      الأدوية فقط
                    </label>
                    <label className="flex items-center gap-2 text-xs font-bold cursor-pointer">
                      <input type="radio" name="clear_scope" checked={clearScope === 'both'} onChange={() => setClearScope('both')} />
                      كلاهما معاً
                    </label>
                  </div>
                </div>

                <Button variant="danger" size="sm" className="w-full text-xs font-bold" disabled={selectedCategories.length === 0}
                  onClick={() => triggerClear({ clearType: 'advanced', advancedType: 'categories', selectedCategories, clearScope })}>
                  تفريغ التصنيفات المحددة
                </Button>
              </div>
            </div>

            {/* Clear By Clinic */}
            <div className="neu-card p-5 bg-[var(--color-bg-card)] space-y-4">
              <div className="flex items-center gap-2 border-b pb-2 mb-2">
                <Building2 className="text-cyan-500" size={20} />
                <h3 className="text-base font-black text-slate-700">تفريغ حسب العيادات</h3>
              </div>

              <div className="space-y-3">
                <label className="field-label">اختر العيادات للتفريغ (سيحذف كل ما يخصها):</label>
                <div className="max-h-[180px] overflow-y-auto border rounded-xl p-3 space-y-2 bg-slate-50/50">
                  {summary?.clinics.map(c => (
                    <label key={c.id} className="flex items-center gap-3 cursor-pointer text-sm font-bold">
                      <input
                        type="checkbox"
                        checked={selectedClinics.includes(c.id)}
                        onChange={() => {
                          setSelectedClinics(prev => prev.includes(c.id) ? prev.filter(id => id !== c.id) : [...prev, c.id]);
                        }}
                        className="rounded border-slate-300"
                      />
                      <span className="text-slate-700">{c.name}</span>
                      <span className="text-[10px] text-slate-400 font-bold">({c.area_name})</span>
                      <span className="text-[10px] text-slate-500 font-extrabold mr-auto bg-slate-100 px-1.5 py-0.5 rounded">{c.total_count} حركة</span>
                    </label>
                  ))}
                </div>
                <Button variant="danger" size="sm" className="w-full text-xs font-bold" disabled={selectedClinics.length === 0}
                  onClick={() => triggerClear({ clearType: 'advanced', advancedType: 'clinics', selectedClinics })}>
                  تفريغ العيادات المحددة
                </Button>
              </div>
            </div>

            {/* Clear By Insulin Type */}
            <div className="neu-card p-5 bg-[var(--color-bg-card)] space-y-4">
              <div className="flex items-center gap-2 border-b pb-2 mb-2">
                <Syringe className="text-cyan-500" size={20} />
                <h3 className="text-base font-black text-slate-700">تفريغ حسب أنواع الأنسولين</h3>
              </div>

              <div className="space-y-3">
                <label className="field-label">اختر أنواع الأنسولين المراد مسح سجلاتها:</label>
                <div className="max-h-[140px] overflow-y-auto border rounded-xl p-3 space-y-2 bg-slate-50/50">
                  {summary?.insulin_types.map(t => (
                    <label key={t.name} className="flex items-center gap-3 cursor-pointer text-sm font-bold">
                      <input
                        type="checkbox"
                        checked={selectedInsulinTypes.includes(t.name)}
                        onChange={() => {
                          setSelectedInsulinTypes(prev => prev.includes(t.name) ? prev.filter(n => n !== t.name) : [...prev, t.name]);
                        }}
                        className="rounded border-slate-300"
                      />
                      <span className="text-slate-700">{t.name}</span>
                      <span className="text-[10px] text-slate-400 font-bold mr-auto bg-slate-100 px-1.5 py-0.5 rounded">{t.insulin_count} حركة</span>
                    </label>
                  ))}
                </div>
                <Button variant="danger" size="sm" className="w-full text-xs font-bold" disabled={selectedInsulinTypes.length === 0}
                  onClick={() => triggerClear({ clearType: 'advanced', advancedType: 'insulin_types', selectedInsulinTypes })}>
                  تفريغ أنواع الأنسولين المحددة
                </Button>
              </div>
            </div>

            {/* Clear By Date Range */}
            <div className="neu-card p-5 bg-[var(--color-bg-card)] space-y-4">
              <div className="flex items-center gap-2 border-b pb-2 mb-2">
                <Clock className="text-cyan-500" size={20} />
                <h3 className="text-base font-black text-slate-700">تفريغ حسب فترة زمنية (شهور)</h3>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="field-label">من شهر (YYYY-MM):</label>
                    <input type="month" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="neu-input" />
                  </div>
                  <div>
                    <label className="field-label">إلى شهر (YYYY-MM):</label>
                    <input type="month" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="neu-input" />
                  </div>
                </div>
                <p className="text-[10px] text-slate-500 font-bold leading-relaxed">
                  * هذا الإجراء سيقوم بحذف كافة الحركات والصرف للشهور الواقعة ضمن الفترة المحددة بشكل كامل.
                </p>
                <Button variant="danger" size="sm" className="w-full text-xs font-bold" disabled={!startDate || !endDate}
                  onClick={() => triggerClear({ clearType: 'advanced', advancedType: 'date_range', startDate, endDate })}>
                  تفريغ الفترة الزمنية المحددة
                </Button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ── Pre-clear Backup Prompt ── */}
      {showBackupPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="neu-card p-6 bg-[var(--color-bg-card)] max-w-md w-full space-y-6 animate-slideUp relative">
            <button 
              onClick={() => { setShowBackupPrompt(false); setPendingClearPayload(null); }}
              className="absolute top-4 left-4 p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600"
            >
              <X size={18} />
            </button>

            <div className="flex items-center gap-3 text-amber-600">
              <ShieldAlert size={32} />
              <h3 className="text-lg font-black">إنشاء نسخة احتياطية؟</h3>
            </div>

            <p className="text-sm font-bold text-slate-600 leading-relaxed">
              أنت على وشك تنفيذ عملية <span className="text-red-500">مسح وحذف بيانات</span>.
              <br />
              هل ترغب في إنشاء <span className="text-amber-600">نسخة احتياطية</span> من قاعدة البيانات قبل المتابعة لضمان أمان بياناتك؟
            </p>

            {backupPromptLoading && (
              <div className="flex items-center gap-3 p-3 rounded-xl bg-amber-50 border border-amber-200">
                <RefreshCw size={18} className="animate-spin text-amber-600" />
                <span className="text-sm font-bold text-amber-700">جاري إنشاء النسخة الاحتياطية...</span>
              </div>
            )}

            <div className="space-y-3">
              <Button
                variant="primary"
                className="w-full text-sm font-bold bg-amber-600 hover:bg-amber-700 flex items-center justify-center gap-2"
                onClick={() => handleBackupPromptChoice(true)}
                disabled={backupPromptLoading}
                loading={backupPromptLoading}
              >
                <FolderOpen size={16} />
                نعم، إنشاء نسخة احتياطية والمتابعة
              </Button>

              <Button
                variant="danger"
                className="w-full text-sm font-bold flex items-center justify-center gap-2 border-2 border-red-200 bg-transparent text-red-600 hover:bg-red-50"
                onClick={() => handleBackupPromptChoice(false)}
                disabled={backupPromptLoading}
              >
                <Trash2 size={16} />
                لا، المتابعة بدون نسخة احتياطية
              </Button>

              <Button
                variant="ghost"
                className="w-full text-sm font-bold"
                onClick={() => { setShowBackupPrompt(false); setPendingClearPayload(null); }}
                disabled={backupPromptLoading}
              >
                إلغاء
              </Button>
            </div>

            <p className="text-[10px] text-slate-400 font-bold text-center">
              ملاحظة: حتى بدون النسخة اليدوية، يقوم النظام بإنشاء نسخة احتياطية تلقائية قبل المسح.
            </p>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="neu-card p-6 bg-[var(--color-bg-card)] max-w-md w-full space-y-5 animate-slideUp relative border border-red-500/30">
            <button 
              onClick={() => setShowConfirmModal(false)}
              className="absolute top-4 left-4 p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600"
            >
              <X size={18} />
            </button>

            <div className="flex items-center gap-3 text-red-600">
              <AlertTriangle size={32} />
              <h3 className="text-lg font-black">تحذير أمني هام!</h3>
            </div>

            <p className="text-sm font-bold text-slate-600 leading-relaxed">
              لقد اخترت إجراء تفريغ وحذف للبيانات. يرجى تأكيد رغبتك.
              <br />
              <span className="text-red-500 block mt-2 font-extrabold">هذه العملية غير قابلة للتراجع!</span>
              <span className="text-emerald-600 block mt-1 text-xs font-bold">ملاحظة: سيتم إنشاء نسخة احتياطية تلقائية قبل الحذف ويمكنك التراجع منها.</span>
            </p>

            <div className="space-y-2">
              <label
                className="flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all duration-200 select-none"
                style={{
                  borderColor: confirmChecked ? 'var(--color-danger)' : 'var(--color-border)',
                  background: confirmChecked ? 'rgba(239,68,68,0.05)' : 'transparent',
                }}
                onMouseEnter={e => { if (!confirmChecked) e.currentTarget.style.borderColor = 'var(--color-danger)'; }}
                onMouseLeave={e => { if (!confirmChecked) e.currentTarget.style.borderColor = 'var(--color-border)'; }}
              >
                <input
                  type="checkbox"
                  checked={confirmChecked}
                  onChange={(e) => setConfirmChecked(e.target.checked)}
                  className="w-5 h-5 rounded border-2 border-slate-300 text-red-600 focus:ring-red-500 focus:ring-2 cursor-pointer"
                />
                <span className="text-sm font-extrabold text-slate-700 cursor-pointer">
                  أنا متأكد، أرغب في <span className="text-red-600">مسح وحذف البيانات</span>
                </span>
              </label>
            </div>

            <div className="space-y-3">
              <Button
                variant="secondary"
                className="w-full text-sm font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300 flex items-center justify-center gap-2"
                onClick={handleExportBeforeClear}
              >
                <Download size={16} />
                تصدير البيانات المستهدفة كملف Excel للأرشفة
              </Button>

              <div className="flex gap-3">
                <Button
                  variant="danger"
                  className="flex-1 text-sm font-bold"
                  onClick={executeClear}
                  disabled={!confirmChecked || clearingLoading}
                  loading={clearingLoading}
                >
                  تأكيد ومسح البيانات
                </Button>
                <Button
                  variant="ghost"
                  className="flex-1 text-sm font-bold"
                  onClick={() => setShowConfirmModal(false)}
                >
                  إلغاء
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Restore Confirmation Modal ── */}
      {showRestoreModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="neu-card p-6 bg-[var(--color-bg-card)] max-w-md w-full space-y-5 animate-slideUp relative border border-amber-500/30">
            <button 
              onClick={() => { setShowRestoreModal(false); setRestoreChecked(false); setPendingRestoreFile(null); }}
              className="absolute top-4 left-4 p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600"
            >
              <X size={18} />
            </button>

            <div className="flex items-center gap-3 text-amber-600">
              <RotateCcw size={32} />
              <h3 className="text-lg font-black">تأكيد استعادة النسخة الاحتياطية</h3>
            </div>

            <p className="text-sm font-bold text-slate-600 leading-relaxed">
              أنت على وشك استعادة النسخة:
              <br />
              <span className="text-xs font-mono bg-slate-100 px-2 py-1 rounded block mt-1 break-all">{pendingRestoreFile}</span>
              <span className="text-red-500 block mt-3 font-extrabold">تنبيه: سيتم استبدال البيانات الحالية بالكامل!</span>
              <span className="text-emerald-600 block mt-1 text-xs font-bold">سيتم إنشاء نسخة احتياطية تلقائية من الوضع الحالي قبل الاستعادة للأمان.</span>
            </p>

            <div className="space-y-2">
              <label
                className="flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all duration-200 select-none"
                style={{
                  borderColor: restoreChecked ? 'var(--color-primary)' : 'var(--color-border)',
                  background: restoreChecked ? 'rgba(6,182,212,0.05)' : 'transparent',
                }}
                onMouseEnter={e => { if (!restoreChecked) e.currentTarget.style.borderColor = 'var(--color-primary)'; }}
                onMouseLeave={e => { if (!restoreChecked) e.currentTarget.style.borderColor = 'var(--color-border)'; }}
              >
                <input
                  type="checkbox"
                  checked={restoreChecked}
                  onChange={(e) => setRestoreChecked(e.target.checked)}
                  className="w-5 h-5 rounded border-2 border-slate-300 text-cyan-500 focus:ring-cyan-500 focus:ring-2 cursor-pointer"
                />
                <span className="text-sm font-extrabold text-slate-700 cursor-pointer">
                  أنا متأكد، أرغب في <span className="text-cyan-600">استعادة النسخة الاحتياطية</span>
                </span>
              </label>
            </div>

            <div className="flex gap-3">
              <Button
                variant="primary"
                className="flex-1 text-sm font-bold"
                onClick={executeRestore}
                disabled={!restoreChecked || restoreLoading}
                loading={restoreLoading}
              >
                <RotateCcw size={16} />
                تأكيد واستعادة النسخة
              </Button>
              <Button
                variant="ghost"
                className="flex-1 text-sm font-bold"
                onClick={() => { setShowRestoreModal(false); setRestoreChecked(false); setPendingRestoreFile(null); }}
              >
                إلغاء
              </Button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default DataManagementPage;
