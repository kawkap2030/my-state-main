import React, { useState, useEffect } from 'react';
import { Save, RefreshCw, AlertCircle, MapPin, Hospital, Moon, Sun } from 'lucide-react';
import invoke from '../../api/tauriApi';
import { useToast } from '../ui/Toast';
import { useAuth } from '../../context/AuthContext';
import Button from '../ui/Button';

const MedicalTicketsGridEntry = ({ branchId, areaId, dispenseMonth }) => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
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
        // Find existing morning & evening records for this clinic
        const clinicRecords = existingTickets.filter(t => t.clinic_id === clinic.id);
        const morningRec = clinicRecords.find(t => t.period === 'صباحي' || t.period === 'الصباحية');
        const eveningRec = clinicRecords.find(t => t.period === 'مسائي' || t.period === 'المسائية');

        return {
          id: clinic.id,
          name: clinic.name,
          area_id: parseInt(areaId),
          clinic_id: clinic.id,
          branch_id: parseInt(branchId),
          morning_56b: morningRec ? morningRec.ticket_56b_count : '',
          morning_56c: morningRec ? morningRec.ticket_56c_count : '',
          evening_56b: eveningRec ? eveningRec.ticket_56b_count : '',
          evening_56c: eveningRec ? eveningRec.ticket_56c_count : ''
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

  const handleSaveAll = async () => {
    setSaving(true);
    try {
      const payload = [];
      const todayStr = new Date().toISOString().substring(0, 10);

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
            is_supported_clinic: false,
            entry_date: todayStr
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
            is_supported_clinic: false,
            entry_date: todayStr
          });
        }
      }

      if (payload.length > 0) {
        await invoke('save_medical_tickets_bulk', { data: payload });
        
        await invoke('log_frontend_action', {
          userId: user ? user.id : null,
          action: 'BULK_UPDATE',
          tableName: 'medical_tickets',
          recordId: null,
          details: `تم الإدخال الشبكي السريع لتذاكر منطقة ${areaId} لشهر ${dispenseMonth}`
        });

        toast.success('تم حفظ التذاكر الطبية للعيادات بنجاح!');
        // Reload data to reflect in UI
        await loadGridData();
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

  if (!areaId) return <div className="p-8 text-center opacity-60">الرجاء تحديد المنطقة لفتح الإدخال السريع للعيادات</div>;
  if (loading) return <div className="p-8 text-center flex justify-center"><RefreshCw className="animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4 animate-slideUp">
      <div className="flex justify-between items-center bg-indigo-50/50 p-4 rounded-xl border border-indigo-100 shadow-sm" dir="rtl">
        <div className="flex items-center gap-2 text-sm font-bold text-indigo-700">
          <AlertCircle size={18} />
          <span>الجدول الشبكي السريع: أدخل التذاكر لجميع عيادات المنطقة للشهر الحالي واضغط حفظ لحفظها دفعة واحدة.</span>
        </div>
        <Button onClick={handleSaveAll} variant="primary" icon={Save} loading={saving}>
          حفظ جميع العيادات
        </Button>
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
                  <input type="number" placeholder="0" value={row.morning_56b} onChange={e => handleInputChange(idx, 'morning_56b', e.target.value)} className="w-full p-2 border border-[var(--color-border)] rounded bg-transparent focus:bg-white text-center font-black" />
                </td>
                <td className="p-1">
                  <input type="number" placeholder="0" value={row.morning_56c} onChange={e => handleInputChange(idx, 'morning_56c', e.target.value)} className="w-full p-2 border border-[var(--color-border)] rounded bg-transparent focus:bg-white text-center font-black" />
                </td>
                <td className="p-1">
                  <input type="number" placeholder="0" value={row.evening_56b} onChange={e => handleInputChange(idx, 'evening_56b', e.target.value)} className="w-full p-2 border border-[var(--color-border)] rounded bg-transparent focus:bg-white text-center font-black" />
                </td>
                <td className="p-1">
                  <input type="number" placeholder="0" value={row.evening_56c} onChange={e => handleInputChange(idx, 'evening_56c', e.target.value)} className="w-full p-2 border border-[var(--color-border)] rounded bg-transparent focus:bg-white text-center font-black" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default MedicalTicketsGridEntry;
