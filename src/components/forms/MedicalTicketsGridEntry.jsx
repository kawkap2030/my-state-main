import React, { useState, useEffect } from 'react';
import { Save, RefreshCw, AlertCircle, MapPin, Hospital, Moon, Sun } from 'lucide-react';
import invoke from '../../api/tauriApi';
import { useToast } from '../ui/Toast';
import { useAuth } from '../../context/AuthContext';
import Button from '../ui/Button';
import ConfirmModal from '../ui/ConfirmModal';
import ExportMenu from '../ui/ExportMenu';

const MedicalTicketsGridEntry = ({ branchId, areaId, dispenseMonth, isLocked }) => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pendingConflict, setPendingConflict] = useState(null);
  const toast = useToast();
  const { user } = useAuth();

  const loadGridData = async () => {
    if (!branchId || !areaId || !dispenseMonth) return;
    setLoading(true);
    try {
      // 1. Fetch clinics for area
      const clinics = await invoke('get_clinics', { areaId: parseInt(areaId) });
      
      // 2. Fetch existing tickets for this area and month
      const existingTickets = await invoke('get_medical_tickets_report', {
        branchId: parseInt(branchId),
        areaId: parseInt(areaId),
        clinicId: null,
        dispenseMonth
      });

      const gridRows = clinics.map(clinic => {
        // Find existing morning & evening records for this clinic.
        // This grid saves aggregate (عام) tickets to WEEK 1 (see handleSaveAll), so
        // only week-1 FREE rows feed the display — otherwise multi-week data or
        // supported rows would be double-counted into the عام totals. It still
        // SUMS across the four funding categories, matching what عام represents.
        const clinicRecords = existingTickets.filter(t =>
          t.clinic_id === clinic.id &&
          !t.is_supported_clinic &&
          (t.week_number || 1) === 1
        );
        const morningRecs = clinicRecords.filter(t => t.period === 'صباحي' || t.period === 'الصباحية');
        const eveningRecs = clinicRecords.filter(t => t.period === 'مسائي' || t.period === 'المسائية');
        const sumB = (recs) => recs.reduce((s, r) => s + (r.ticket_56b_count || 0), 0);
        const sumC = (recs) => recs.reduce((s, r) => s + (r.ticket_56c_count || 0), 0);

        return {
          id: clinic.id,
          name: clinic.name,
          area_id: parseInt(areaId),
          clinic_id: clinic.id,
          branch_id: parseInt(branchId),
          morning_56b: sumB(morningRecs) || '',
          morning_56c: sumC(morningRecs) || '',
          evening_56b: sumB(eveningRecs) || '',
          evening_56c: sumC(eveningRecs) || ''
        };
      });

      setData(gridRows);
    } catch (err) {
      toast.error('فشل تحميل البيانات');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadGridData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId, areaId, dispenseMonth]);

  const handleInputChange = (rowIndex, field, value) => {
    const newData = [...data];
    newData[rowIndex][field] = value;
    setData(newData);
  };

  // Runs the actual bulk save (used both directly and after the user
  // confirms overwriting an already-entered period).
  const performSave = async (payload) => {
    await invoke('save_medical_tickets_bulk', { data: payload });

    await invoke('log_frontend_action', {
      userId: user ? user.id : null,
      action: 'BULK_UPDATE',
      tableName: 'medical_tickets',
      recordId: null,
      details: `تم الإدخال الشبكي السريع لتذاكر منطقة ${areaId} لشهر ${dispenseMonth}`
    });

    toast.success('تم حفظ التذاكر الطبية للعيادات بنجاح!');
    await loadGridData();
  };

  const handleSaveAll = async () => {
    setSaving(true);
    try {
      const payload = [];

      for (const row of data) {
        // Skip if all fields are empty
        if (!row.morning_56b && !row.morning_56c && !row.evening_56b && !row.evening_56c) continue;

        // Morning Record
        if (row.morning_56b || row.morning_56c) {
          payload.push({
            branch_id: parseInt(row.branch_id),
            area_id: parseInt(row.area_id),
            clinic_id: parseInt(row.clinic_id),
            category: 'عام',
            period: 'صباحي',
            ticket_56b_count: parseInt(row.morning_56b) || 0,
            ticket_56c_count: parseInt(row.morning_56c) || 0,
            dispense_month: dispenseMonth,
            week_number: 1,
            is_supported_clinic: false
          });
        }

        // Evening Record
        if (row.evening_56b || row.evening_56c) {
          payload.push({
            branch_id: parseInt(row.branch_id),
            area_id: parseInt(row.area_id),
            clinic_id: parseInt(row.clinic_id),
            category: 'عام',
            period: 'مسائي',
            ticket_56b_count: parseInt(row.evening_56b) || 0,
            ticket_56c_count: parseInt(row.evening_56c) || 0,
            dispense_month: dispenseMonth,
            week_number: 1,
            is_supported_clinic: false
          });
        }
      }

      if (payload.length > 0) {
        // ── Duplicate-period guard ─────────────────────────────────────
        // If a period (month + scope + week + category) was already saved
        // — from the other tickets page or this one — with DIFFERENT values,
        // warn the user and ask for confirmation before overwriting.
        // Re-saving identical values is allowed silently (value-aware check
        // in Rust), while a real change requires explicit user consent.
        const alreadyExists = await invoke('check_medical_tickets_exist', { data: payload });
        const labels = [];
        if (Array.isArray(alreadyExists) && alreadyExists.length > 0) {
          alreadyExists.forEach(k => {
            const row = data.find(r => k.clinic_id ? r.clinic_id === k.clinic_id : null);
            const scope = row
              ? `عيادة ${row.name || k.clinic_id}`
              : (k.clinic_id ? `عيادة ${k.clinic_id}` : (k.area_id ? `منطقة ${k.area_id}` : `فرع ${k.branch_id}`));
            labels.push(`${k.period === 'مسائي' ? 'مسائي' : 'صباحي'} (${scope})`);
          });
        }

        // عام ↔ فئات replacement warning (free tickets only). Queried directly
        // from the backend so it can never be skipped by an unloaded state.
        const generalConflicts = await invoke('check_general_category_conflicts', { data: payload });
        const generalWarnings = [];
        if (Array.isArray(generalConflicts) && generalConflicts.length > 0) {
          generalConflicts.forEach(c => {
            const periodLabel = c.period === 'مسائي' ? 'مسائي' : c.period === 'موحد' ? 'شهري' : 'صباحي';
            if (c.category === 'عام') {
              generalWarnings.push(`سيتم استبدال بيانات الفئات (${c.existing_categories.join('، ')}) ببيانات عام — ${periodLabel} أسبوع ${c.week_number}`);
            } else {
              generalWarnings.push(`سيتم استبدال بيانات عام المدخلة سابقاً بفئة ${c.category} — ${periodLabel} أسبوع ${c.week_number}`);
            }
          });
        }

        if (labels.length > 0 || generalWarnings.length > 0) {
          setPendingConflict({ payload, labels, generalWarnings });
          return; // wait for the user's answer in the confirm modal
        }

        await performSave(payload);
      } else {
        toast.info('لم يتم إدخال أي قيم جديدة للحفظ');
      }
    } catch (err) {
      toast.error(`حدث خطأ أثناء الحفظ: ${err}`);
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const confirmOverwrite = async () => {
    if (!pendingConflict) return;
    const { payload } = pendingConflict;
    setSaving(true);
    try {
      await performSave(payload);
    } catch (err) {
      toast.error(`حدث خطأ أثناء الحفظ: ${err}`);
      console.error(err);
    } finally {
      setSaving(false);
      setPendingConflict(null);
    }
  };

  if (!areaId) return <div className="p-8 text-center opacity-60">الرجاء تحديد المنطقة لفتح الإدخال السريع للعيادات</div>;
  if (loading) return <div className="p-8 text-center flex justify-center"><RefreshCw className="animate-spin text-primary" /></div>;

  // ── Quick export (Excel/Word/PDF/print) — mirrors the visible grid ──────
  // Columns read the same flat fields the table shows; a totals row is
  // appended so exports carry a final 'الإجمالي' line like the quick entry.
  const exportColumns = [
    { header: 'العيادة', exportAccessor: (r) => r.isTotalRow ? 'الإجمالي' : (r.name || `عيادة ${r.clinic_id}`) },
    { header: 'صباحي 56ب', exportAccessor: (r) => parseInt(r.morning_56b) || 0 },
    { header: 'صباحي 56ج', exportAccessor: (r) => parseInt(r.morning_56c) || 0 },
    { header: 'مسائي 56ب', exportAccessor: (r) => parseInt(r.evening_56b) || 0 },
    { header: 'مسائي 56ج', exportAccessor: (r) => parseInt(r.evening_56c) || 0 },
  ];
  const exportData = data.length === 0 ? [] : [
    ...data,
    {
      isTotalRow: true,
      morning_56b: data.reduce((s, r) => s + (parseInt(r.morning_56b) || 0), 0),
      morning_56c: data.reduce((s, r) => s + (parseInt(r.morning_56c) || 0), 0),
      evening_56b: data.reduce((s, r) => s + (parseInt(r.evening_56b) || 0), 0),
      evening_56c: data.reduce((s, r) => s + (parseInt(r.evening_56c) || 0), 0),
    },
  ];
  const exportOptions = {
    title: `التذاكر الطبية المجانية (عام) — الإدخال الشبكي السريع`,
    fileName: `medical_tickets_grid_area${areaId}_${dispenseMonth}`,
    subtitle: `منطقة ${areaId} — الأسبوع 1 — شهر ${dispenseMonth}`,
    monthLabel: dispenseMonth,
  };

  return (
    <div className="space-y-4 animate-slideUp">
      <div className="flex flex-wrap justify-between items-center gap-3 bg-indigo-50/50 p-4 rounded-xl border border-indigo-100 shadow-sm" dir="rtl">
        <div className="flex items-center gap-2 text-sm font-bold text-indigo-700">
          <AlertCircle size={18} />
          <span>الجدول الشبكي السريع: أدخل التذاكر (عام) لجميع عيادات المنطقة للأسبوع 1 من الشهر الحالي واضغط حفظ لحفظها دفعة واحدة.</span>
        </div>
        <div className="flex items-center gap-2">
          <ExportMenu data={exportData} columns={exportColumns} options={exportOptions} disabled={saving || data.length === 0} />
          <Button onClick={handleSaveAll} variant="primary" icon={Save} loading={saving} disabled={isLocked}>
            حفظ جميع العيادات
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-[var(--color-border)] shadow-inner">
        <table className="w-full text-right text-xs" dir="rtl">
          <thead className="bg-[var(--color-bg-card)] text-[var(--color-text-muted)] sticky top-0 z-10 font-black">
            <tr>
              <th className="p-3 border-b border-[var(--color-border)] min-w-[200px]">العيادة</th>
              <th className="p-3 border-b border-[var(--color-border)] bg-amber-50/50 text-amber-700 text-center" colSpan="2">
                <div className="flex items-center justify-center gap-2"><Sun size={14}/> الفترة الصباحية</div>
              </th>
              <th className="p-3 border-b border-[var(--color-border)] bg-indigo-50/50 text-indigo-700 text-center" colSpan="2">
                <div className="flex items-center justify-center gap-2"><Moon size={14}/> الفترة المسائية</div>
              </th>
            </tr>
            <tr>
              <th className="p-2 border-b border-[var(--color-border)]"></th>
              <th className="p-2 border-b border-[var(--color-border)] text-center text-[10px]">56ب (مجاني)</th>
              <th className="p-2 border-b border-[var(--color-border)] text-center text-[10px]">56ج (مؤمن عليه)</th>
              <th className="p-2 border-b border-[var(--color-border)] text-center text-[10px]">56ب (مجاني)</th>
              <th className="p-2 border-b border-[var(--color-border)] text-center text-[10px]">56ج (مؤمن عليه)</th>
            </tr>
          </thead>
          <tbody className="bg-[var(--color-bg)]">
            {data.map((row, idx) => (
              <tr key={row.id} className="hover:bg-[var(--color-bg-card)] transition-colors border-b border-[var(--color-border)]">
                <td className="p-3 font-bold flex items-center gap-2 text-sm">
                  <Hospital size={16} className="text-[var(--color-primary)]" />
                  {row.name}
                </td>
                <td className="p-1">
                  <input type="number" placeholder="0" value={row.morning_56b} onChange={e => handleInputChange(idx, 'morning_56b', e.target.value)} disabled={isLocked} className="w-full p-2 border border-[var(--color-border)] rounded bg-transparent focus:bg-white text-center font-black disabled:opacity-50 disabled:cursor-not-allowed" />
                </td>
                <td className="p-1">
                  <input type="number" placeholder="0" value={row.morning_56c} onChange={e => handleInputChange(idx, 'morning_56c', e.target.value)} disabled={isLocked} className="w-full p-2 border border-[var(--color-border)] rounded bg-transparent focus:bg-white text-center font-black disabled:opacity-50 disabled:cursor-not-allowed" />
                </td>
                <td className="p-1">
                  <input type="number" placeholder="0" value={row.evening_56b} onChange={e => handleInputChange(idx, 'evening_56b', e.target.value)} disabled={isLocked} className="w-full p-2 border border-[var(--color-border)] rounded bg-transparent focus:bg-white text-center font-black disabled:opacity-50 disabled:cursor-not-allowed" />
                </td>
                <td className="p-1">
                  <input type="number" placeholder="0" value={row.evening_56c} onChange={e => handleInputChange(idx, 'evening_56c', e.target.value)} disabled={isLocked} className="w-full p-2 border border-[var(--color-border)] rounded bg-transparent focus:bg-white text-center font-black disabled:opacity-50 disabled:cursor-not-allowed" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Duplicate-period overwrite confirmation */}
      <ConfirmModal
        isOpen={!!pendingConflict}
        onConfirm={confirmOverwrite}
        onCancel={() => setPendingConflict(null)}
        title="تم إدخال الفترة من قبل"
        message={pendingConflict ? [
          pendingConflict.labels.length > 0
            ? `الفترات التالية مدخلة من قبل بقيم مختلفة: ${pendingConflict.labels.join('، ')}.`
            : '',
          pendingConflict.generalWarnings && pendingConflict.generalWarnings.length > 0
            ? `تنبيه: ${pendingConflict.generalWarnings.join(' — ')}.`
            : '',
        ].filter(Boolean).join(' ') : ''}
        detail="يمكنك الذهاب للتعديل إذا كنت تريد تغيير البيانات — هل تريد استبدال القيم الحالية؟"
        confirmText="استبدال البيانات"
        cancelText="إلغاء"
        variant="warning"
        loading={saving}
      />
    </div>
  );
};

export default MedicalTicketsGridEntry;
