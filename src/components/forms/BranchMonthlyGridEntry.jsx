import React, { useState, useEffect } from 'react';
import { Save, RefreshCw, AlertCircle, Building2, MapPin, Hospital } from 'lucide-react';
import invoke from '../../api/tauriApi';
import { useToast } from '../ui/Toast';
import { useAuth } from '../../context/AuthContext';
import Button from '../ui/Button';

const BranchMonthlyGridEntry = ({ branchId, dispenseMonth }) => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const { user } = useAuth();

  const loadGridData = async () => {
    if (!branchId || !dispenseMonth) return;
    setLoading(true);
    try {
      // Fetch areas and clinics
      const areas = await invoke('get_areas', { branchId: parseInt(branchId) });
      let allEntities = [];

      for (const area of areas) {
        // Add area as a row (if they want to enter data at Area level)
        allEntities.push({
          type: 'area',
          id: area.id,
          name: area.name,
          area_id: area.id,
          clinic_id: null,
          branch_id: branchId
        });

        // Fetch clinics for area
        const clinics = await invoke('get_clinics', { areaId: area.id });
        for (const clinic of clinics) {
          allEntities.push({
            type: 'clinic',
            id: clinic.id,
            name: clinic.name,
            area_id: area.id,
            clinic_id: clinic.id,
            branch_id: branchId
          });
        }
      }

      // Fetch existing data from BOTH split tables (no combined table).
      const [freeData, supportedData] = await Promise.all([
        invoke('get_all_free_monthly_drugs_dispensed', {
          branchId: parseInt(branchId),
          areaId: null,
          clinicId: null,
          dispenseMonth
        }),
        invoke('get_all_supported_monthly_drugs_dispensed', {
          branchId: parseInt(branchId),
          areaId: null,
          clinicId: null,
          dispenseMonth
        }),
      ]);

      const keyOf = (d) => `${d.area_id || 0}|${d.clinic_id || 0}`;
      const freeByKey = new Map(freeData.map((d) => [keyOf(d), d]));
      const supportedByKey = new Map(supportedData.map((d) => [keyOf(d), d]));

      // Merge
      const gridRows = allEntities.map(entity => {
        const f = freeByKey.get(keyOf(entity));
        const s = supportedByKey.get(keyOf(entity));
        return {
          ...entity,
          freeRecordId: f?.id || null,
          supportedRecordId: s?.id || null,
          drugs_free_authority: f?.drugs_free_authority || 0,
          drugs_free_students: f?.drugs_free_students || 0,
          drugs_free_infants: f?.drugs_free_infants || 0,
          drugs_free_breadwinner_women: f?.drugs_free_breadwinner_women || 0,
          drugs_supported_authority_value: s?.drugs_supported_authority_value || 0,
          drugs_supported_authority_patient_share: s?.drugs_supported_authority_patient_share || 0,
          drugs_supported_students_value: s?.drugs_supported_students_value || 0,
          drugs_supported_students_patient_share: s?.drugs_supported_students_patient_share || 0,
          drugs_supported_infants_value: s?.drugs_supported_infants_value || 0,
          drugs_supported_infants_patient_share: s?.drugs_supported_infants_patient_share || 0,
        };
      });

      setData(gridRows);
    } catch (err) {
      toast.error('فشل تحميل بيانات الشبكة');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadGridData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId, dispenseMonth]);

  const handleInputChange = (rowIndex, field, value) => {
    const newData = [...data];
    newData[rowIndex][field] = value;
    setData(newData);
  };

  const handleSaveAll = async () => {
    setSaving(true);
    let successCount = 0;
    const errors = [];

    // Free and Supported are two INDEPENDENT tables, and each row is treated
    // independently too: a failure of one type (or one row) is collected and
    // reported WITHOUT aborting the remaining rows/types.
    try {
      for (const row of data) {
        // Skip if all values are 0 and no record exists on either side
        const freeSum = (parseFloat(row.drugs_free_authority) || 0) + (parseFloat(row.drugs_free_students) || 0) + (parseFloat(row.drugs_free_infants) || 0) + (parseFloat(row.drugs_free_breadwinner_women) || 0);
        const supSum = (parseFloat(row.drugs_supported_authority_value) || 0) + (parseFloat(row.drugs_supported_authority_patient_share) || 0) + (parseFloat(row.drugs_supported_students_value) || 0) + (parseFloat(row.drugs_supported_students_patient_share) || 0) + (parseFloat(row.drugs_supported_infants_value) || 0) + (parseFloat(row.drugs_supported_infants_patient_share) || 0);

        if (freeSum === 0 && supSum === 0 && !row.freeRecordId && !row.supportedRecordId) continue;

        if (freeSum > 0 || row.freeRecordId) {
          const freePayload = {
            clinic_id: row.clinic_id,
            area_id: row.area_id,
            branch_id: parseInt(row.branch_id),
            dispense_month: dispenseMonth,
            drugs_free_authority: parseFloat(row.drugs_free_authority) || 0,
            drugs_free_students: parseFloat(row.drugs_free_students) || 0,
            drugs_free_infants: parseFloat(row.drugs_free_infants) || 0,
            drugs_free_breadwinner_women: parseFloat(row.drugs_free_breadwinner_women) || 0,
            notes: ''
          };
          // Existing row => explicit Update; otherwise strict Create (rejected if the key exists).
          if (row.freeRecordId) freePayload.id = row.freeRecordId;
          try {
            await invoke('save_free_monthly_drugs_dispensed', {
              data: freePayload,
              isCreate: !row.freeRecordId,
            });
            successCount++;
          } catch (err) {
            errors.push(`مجاني - ${row.name}: ${err}`);
          }
        }

        if (supSum > 0 || row.supportedRecordId) {
          const supportedPayload = {
            clinic_id: row.clinic_id,
            area_id: row.area_id,
            branch_id: parseInt(row.branch_id),
            dispense_month: dispenseMonth,
            drugs_supported_authority_value: parseFloat(row.drugs_supported_authority_value) || 0,
            drugs_supported_authority_patient_share: parseFloat(row.drugs_supported_authority_patient_share) || 0,
            drugs_supported_students_value: parseFloat(row.drugs_supported_students_value) || 0,
            drugs_supported_students_patient_share: parseFloat(row.drugs_supported_students_patient_share) || 0,
            drugs_supported_infants_value: parseFloat(row.drugs_supported_infants_value) || 0,
            drugs_supported_infants_patient_share: parseFloat(row.drugs_supported_infants_patient_share) || 0,
            notes: ''
          };
          // Existing row => explicit Update; otherwise strict Create (rejected if the key exists).
          if (row.supportedRecordId) supportedPayload.id = row.supportedRecordId;
          try {
            await invoke('save_supported_monthly_drugs_dispensed', {
              data: supportedPayload,
              isCreate: !row.supportedRecordId,
            });
            successCount++;
          } catch (err) {
            errors.push(`مدعم - ${row.name}: ${err}`);
          }
        }
      }

      await invoke('log_frontend_action', {
        userId: user ? user.id : null,
        action: 'BULK_UPDATE',
        tableName: 'monthly_free_drugs_dispensed',
        recordId: null,
        details: `تم حفظ ${successCount} سجلات من الإدخال الشبكي (مجاني + مدعم) لفرع ${branchId}`
      });

      if (errors.length === 0) {
        toast.success(`تم حفظ ${successCount} سجلات بنجاح`);
      } else if (successCount > 0) {
        toast.success(`تم حفظ ${successCount} سجلات، مع فشل أخرى: ${errors[0]}`);
      } else {
        toast.error(`فشل الحفظ: ${errors[0]}`);
        errors.slice(1).forEach((err) => toast.error(err));
      }
      await loadGridData();
    } catch (err) {
      toast.error(`حدث خطأ أثناء الحفظ: ${err}`);
    } finally {
      setSaving(false);
    }
  };

  if (!branchId) return <div className="p-8 text-center opacity-60">الرجاء تحديد الفرع أولاً</div>;
  if (loading) return <div className="p-8 text-center flex justify-center"><RefreshCw className="animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center bg-[var(--color-bg-card)] p-4 rounded-xl border border-[var(--color-border)] shadow-sm">
        <div className="flex items-center gap-2 text-sm font-bold text-[var(--color-primary)]">
          <AlertCircle size={18} />
          <span>الإدخال الشبكي: يمكنك تعديل قيم جميع الجهات في نفس الوقت</span>
        </div>
        <Button onClick={handleSaveAll} variant="success" icon={Save} loading={saving}>
          حفظ الكل
        </Button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-[var(--color-border)]">
        <table className="w-full text-right text-xs">
          <thead className="bg-[var(--color-bg-card)] text-[var(--color-text-muted)] sticky top-0 z-10 font-black">
            <tr>
              <th className="p-3 border-b border-[var(--color-border)] min-w-[150px]">الجهة</th>
              <th className="p-3 border-b border-[var(--color-border)] bg-[var(--color-accent-cyan-bg)]">هيئة (مجاني)</th>
              <th className="p-3 border-b border-[var(--color-border)] bg-[var(--color-accent-cyan-bg)]">طلاب (مجاني)</th>
              <th className="p-3 border-b border-[var(--color-border)] bg-[var(--color-accent-cyan-bg)]">رضع (مجاني)</th>
              <th className="p-3 border-b border-[var(--color-border)] bg-[var(--color-accent-cyan-bg)]">مرأة (مجاني)</th>
              <th className="p-3 border-b border-[var(--color-border)] bg-[var(--color-accent-emerald-bg)]">هيئة (مدعم - قيمة)</th>
              <th className="p-3 border-b border-[var(--color-border)] bg-[var(--color-accent-emerald-bg)]">هيئة (مدعم - مساهمة)</th>
              <th className="p-3 border-b border-[var(--color-border)] bg-[var(--color-accent-emerald-bg)]">طلاب (مدعم - قيمة)</th>
              <th className="p-3 border-b border-[var(--color-border)] bg-[var(--color-accent-emerald-bg)]">طلاب (مدعم - مساهمة)</th>
              <th className="p-3 border-b border-[var(--color-border)] bg-[var(--color-accent-emerald-bg)]">رضع (مدعم - قيمة)</th>
              <th className="p-3 border-b border-[var(--color-border)] bg-[var(--color-accent-emerald-bg)]">رضع (مدعم - مساهمة)</th>
            </tr>
          </thead>
          <tbody className="bg-[var(--color-bg)]">
            {data.map((row, idx) => (
              <tr key={`${row.type}-${row.id}`} className="hover:bg-[var(--color-bg-card)] transition-colors border-b border-[var(--color-border)]">
                <td className="p-3 font-bold flex items-center gap-2">
                  {row.type === 'area' ? <MapPin size={14} className="text-amber-500" /> : <Hospital size={14} className="text-[var(--color-primary)] mr-4" />}
                  {row.name}
                </td>
                <td className="p-1">
                  <input type="number" value={row.drugs_free_authority} onChange={e => handleInputChange(idx, 'drugs_free_authority', e.target.value)} className="w-full p-2 border border-[var(--color-border)] rounded bg-transparent text-[var(--color-text)] focus:bg-[var(--color-bg-card)]" />
                </td>
                <td className="p-1">
                  <input type="number" value={row.drugs_free_students} onChange={e => handleInputChange(idx, 'drugs_free_students', e.target.value)} className="w-full p-2 border border-[var(--color-border)] rounded bg-transparent text-[var(--color-text)] focus:bg-[var(--color-bg-card)]" />
                </td>
                <td className="p-1">
                  <input type="number" value={row.drugs_free_infants} onChange={e => handleInputChange(idx, 'drugs_free_infants', e.target.value)} className="w-full p-2 border border-[var(--color-border)] rounded bg-transparent text-[var(--color-text)] focus:bg-[var(--color-bg-card)]" />
                </td>
                <td className="p-1">
                  <input type="number" value={row.drugs_free_breadwinner_women} onChange={e => handleInputChange(idx, 'drugs_free_breadwinner_women', e.target.value)} className="w-full p-2 border border-[var(--color-border)] rounded bg-transparent text-[var(--color-text)] focus:bg-[var(--color-bg-card)]" />
                </td>
                <td className="p-1">
                  <input type="number" value={row.drugs_supported_authority_value} onChange={e => handleInputChange(idx, 'drugs_supported_authority_value', e.target.value)} className="w-full p-2 border border-[var(--color-border)] rounded bg-transparent text-[var(--color-text)] focus:bg-[var(--color-bg-card)]" />
                </td>
                <td className="p-1">
                  <input type="number" value={row.drugs_supported_authority_patient_share} onChange={e => handleInputChange(idx, 'drugs_supported_authority_patient_share', e.target.value)} className="w-full p-2 border border-[var(--color-border)] rounded bg-transparent text-[var(--color-text)] focus:bg-[var(--color-bg-card)]" />
                </td>
                <td className="p-1">
                  <input type="number" value={row.drugs_supported_students_value} onChange={e => handleInputChange(idx, 'drugs_supported_students_value', e.target.value)} className="w-full p-2 border border-[var(--color-border)] rounded bg-transparent text-[var(--color-text)] focus:bg-[var(--color-bg-card)]" />
                </td>
                <td className="p-1">
                  <input type="number" value={row.drugs_supported_students_patient_share} onChange={e => handleInputChange(idx, 'drugs_supported_students_patient_share', e.target.value)} className="w-full p-2 border border-[var(--color-border)] rounded bg-transparent text-[var(--color-text)] focus:bg-[var(--color-bg-card)]" />
                </td>
                <td className="p-1">
                  <input type="number" value={row.drugs_supported_infants_value} onChange={e => handleInputChange(idx, 'drugs_supported_infants_value', e.target.value)} className="w-full p-2 border border-[var(--color-border)] rounded bg-transparent text-[var(--color-text)] focus:bg-[var(--color-bg-card)]" />
                </td>
                <td className="p-1">
                  <input type="number" value={row.drugs_supported_infants_patient_share} onChange={e => handleInputChange(idx, 'drugs_supported_infants_patient_share', e.target.value)} className="w-full p-2 border border-[var(--color-border)] rounded bg-transparent text-[var(--color-text)] focus:bg-[var(--color-bg-card)]" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default BranchMonthlyGridEntry;
