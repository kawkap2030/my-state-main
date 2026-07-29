import React, { useState, useEffect } from 'react';
import { Save, RefreshCw, AlertCircle, MapPin, Hospital, Moon, Sun, Building2, Calculator } from 'lucide-react';
import invoke from '../../api/tauriApi';
import { useToast } from '../ui/Toast';
import { useAuth } from '../../context/AuthContext';
import Button from '../ui/Button';

const QuickTicketsEntry = ({ branchId, dispenseMonth }) => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedWeek, setSelectedWeek] = useState(1);
  const [isSupported, setIsSupported] = useState(false);
  const toast = useToast();
  const { user } = useAuth();

  const loadGridData = async () => {
    if (!branchId || !dispenseMonth) return;
    setLoading(true);
    try {
      const batchData = await invoke('get_tickets_batch_for_branch', {
        branchId: parseInt(branchId),
        dispenseMonth,
        weekNumber: selectedWeek
      });
      setData(batchData);
    } catch (err) {
      console.error('Error loading tickets:', err);
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadGridData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId, dispenseMonth, selectedWeek]);

  const handleInputChange = (rowIndex, field, value) => {
    const newData = [...data];
    newData[rowIndex][field] = parseInt(value) || 0;
    setData(newData);
  };

  const calculateTotals = () => {
    return data.reduce((acc, row) => ({
      morning_56b: acc.morning_56b + row.morning_56b,
      morning_56c: acc.morning_56c + row.morning_56c,
      evening_56b: acc.evening_56b + row.evening_56b,
      evening_56c: acc.evening_56c + row.evening_56c,
      morning_authority: acc.morning_authority + row.morning_authority,
      morning_students: acc.morning_students + row.morning_students,
      morning_infants: acc.morning_infants + row.morning_infants,
      evening_authority: acc.evening_authority + row.evening_authority,
      evening_students: acc.evening_students + row.evening_students,
      evening_infants: acc.evening_infants + row.evening_infants,
    }), {
      morning_56b: 0, morning_56c: 0, evening_56b: 0, evening_56c: 0,
      morning_authority: 0, morning_students: 0, morning_infants: 0,
      evening_authority: 0, evening_students: 0, evening_infants: 0,
    });
  };

  const handleSaveAll = async () => {
    setSaving(true);
    try {
      const payload = [];
      const todayStr = new Date().toISOString().substring(0, 10);

      for (const row of data) {
        if (isSupported) {
          const categories = [
            { field: 'morning_authority', cat: 'هيئة', period: 'صباحي' },
            { field: 'evening_authority', cat: 'هيئة', period: 'مسائي' },
            { field: 'morning_students', cat: 'طلاب', period: 'صباحي' },
            { field: 'evening_students', cat: 'طلاب', period: 'مسائي' },
            { field: 'morning_infants', cat: 'رضع', period: 'صباحي' },
            { field: 'evening_infants', cat: 'رضع', period: 'مسائي' },
          ];
          for (const c of categories) {
            const count = row[c.field];
            if (count > 0) {
              payload.push({
                branch_id: parseInt(row.branch_id),
                area_id: row.area_id,
                clinic_id: row.clinic_id,
                category: c.cat,
                period: c.period,
                ticket_56b_count: count,
                ticket_56c_count: 0,
                dispense_month: dispenseMonth,
                week_number: selectedWeek,
                is_supported_clinic: true,
                entry_date: todayStr
              });
            }
          }
        } else {
          if (row.morning_56b > 0 || row.morning_56c > 0) {
            payload.push({
              branch_id: parseInt(row.branch_id),
              area_id: row.area_id,
              clinic_id: row.clinic_id,
              category: 'عام',
              period: 'صباحي',
              ticket_56b_count: row.morning_56b,
              ticket_56c_count: row.morning_56c,
              dispense_month: dispenseMonth,
              week_number: selectedWeek,
              is_supported_clinic: false,
              entry_date: todayStr
            });
          }
          if (row.evening_56b > 0 || row.evening_56c > 0) {
            payload.push({
              branch_id: parseInt(row.branch_id),
              area_id: row.area_id,
              clinic_id: row.clinic_id,
              category: 'عام',
              period: 'مسائي',
              ticket_56b_count: row.evening_56b,
              ticket_56c_count: row.evening_56c,
              dispense_month: dispenseMonth,
              week_number: selectedWeek,
              is_supported_clinic: false,
              entry_date: todayStr
            });
          }
        }
      }

      if (payload.length > 0) {
        await invoke('save_medical_tickets_bulk', { data: payload });
        await invoke('log_frontend_action', {
          userId: user ? user.id : null,
          action: 'BATCH_UPDATE',
          tableName: 'medical_tickets',
          recordId: null,
          details: `الإدخال السريع للتذاكر - فرع ${branchId} - شهر ${dispenseMonth}`
        });
        toast.success(`تم حفظ ${payload.length} سجل بنجاح!`);
        loadGridData();
      } else {
        toast.info('لم يتم إدخال أي قيم جديدة');
      }
    } catch (err) {
      toast.error(`حدث خطأ: ${err}`);
    } finally {
      setSaving(false);
    }
  };

  const totals = calculateTotals();

  if (!branchId) {
    return (
      <div className="p-8 text-center opacity-60">
        <AlertCircle className="mx-auto mb-2" size={32} />
        <p>الرجاء تحديد الفرع أولاً</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-8 text-center">
        <RefreshCw className="animate-spin mx-auto" size={32} />
      </div>
    );
  }

  const groupedData = data.reduce((acc, row) => {
    const areaKey = row.area_name || 'بدون منطقة';
    if (!acc[areaKey]) acc[areaKey] = [];
    acc[areaKey].push(row);
    return acc;
  }, {});

  return (
    <div className="space-y-4 animate-slideUp" dir="rtl">
      {/* Header Controls */}
      <div className="flex flex-wrap justify-between items-center gap-4 bg-gradient-to-r from-indigo-50 to-purple-50 p-4 rounded-xl border border-indigo-200 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="font-black text-sm">الأسبوع:</span>
            {[1, 2, 3, 4].map(w => (
              <button
                key={w}
                onClick={() => setSelectedWeek(w)}
                className={`w-10 h-10 rounded-xl font-black text-sm transition-all ${
                  selectedWeek === w ? 'bg-indigo-600 text-white shadow-lg' : 'bg-white border border-indigo-200 text-indigo-600 hover:bg-indigo-50'
                }`}
              >
                {w}
              </button>
            ))}
          </div>
          <div className="h-8 w-px bg-indigo-200" />
          <div className="flex items-center gap-2">
            <span className="font-black text-sm">النوع:</span>
            <div className="flex p-1 bg-white rounded-xl border border-indigo-200">
              <button
                onClick={() => setIsSupported(false)}
                className={`px-4 py-2 rounded-lg text-xs font-bold ${!isSupported ? 'bg-blue-600 text-white' : 'text-blue-600'}`}
              >
                مجاني (56ب/56ج)
              </button>
              <button
                onClick={() => setIsSupported(true)}
                className={`px-4 py-2 rounded-lg text-xs font-bold ${isSupported ? 'bg-emerald-600 text-white' : 'text-emerald-600'}`}
              >
                مدعوم
              </button>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button onClick={loadGridData} variant="secondary" icon={RefreshCw} disabled={saving}>تحديث</Button>
          <Button onClick={handleSaveAll} variant="success" icon={Save} loading={saving}>حفظ الكل</Button>
        </div>
      </div>

      {/* Free Tickets View */}
      {!isSupported && (
        <div className="overflow-x-auto rounded-xl border border-[var(--color-border)] shadow-inner">
          <table className="w-full text-right text-xs">
            <thead className="bg-[var(--color-bg-card)] sticky top-0 z-10 font-black">
              <tr>
                <th className="p-3 border-b border-[var(--color-border)] min-w-[180px]">المنطقة / العيادة</th>
                <th className="p-3 border-b border-[var(--color-border)] bg-amber-50 text-center" colSpan="2">صباحي</th>
                <th className="p-3 border-b border-[var(--color-border)] bg-indigo-50 text-center" colSpan="2">مسائي</th>
              </tr>
              <tr>
                <th className="p-2 border-b border-[var(--color-border)]"></th>
                <th className="p-2 border-b border-[var(--color-border)] text-center bg-amber-50/50">56ب</th>
                <th className="p-2 border-b border-[var(--color-border)] text-center bg-amber-50/50">56ج</th>
                <th className="p-2 border-b border-[var(--color-border)] text-center bg-indigo-50/50">56ب</th>
                <th className="p-2 border-b border-[var(--color-border)] text-center bg-indigo-50/50">56ج</th>
              </tr>
            </thead>
            <tbody className="bg-[var(--color-bg)]">
              {Object.entries(groupedData).map(([areaName, clinics]) => (
                <React.Fragment key={areaName}>
                  <tr className="bg-gradient-to-r from-slate-100 to-slate-50">
                    <td colSpan="5" className="p-3 font-black text-slate-700 flex items-center gap-2">
                      <MapPin size={16} className="text-amber-500" />{areaName}
                    </td>
                  </tr>
                  {clinics.map((row) => (
                    <tr key={row.clinic_id} className="hover:bg-[var(--color-bg-card)] transition-colors border-b border-[var(--color-border)]">
                      <td className="p-3 font-bold flex items-center gap-2 text-sm">
                        <Hospital size={14} className="text-[var(--color-primary)]" />{row.clinic_name}
                      </td>
                      <td className="p-1"><input type="number" value={row.morning_56b} onChange={e => handleInputChange(data.indexOf(row), 'morning_56b', e.target.value)} className="w-full p-2 border border-[var(--color-border)] rounded bg-transparent focus:bg-white text-center font-black" min="0" /></td>
                      <td className="p-1"><input type="number" value={row.morning_56c} onChange={e => handleInputChange(data.indexOf(row), 'morning_56c', e.target.value)} className="w-full p-2 border border-[var(--color-border)] rounded bg-transparent focus:bg-white text-center font-black" min="0" /></td>
                      <td className="p-1"><input type="number" value={row.evening_56b} onChange={e => handleInputChange(data.indexOf(row), 'evening_56b', e.target.value)} className="w-full p-2 border border-[var(--color-border)] rounded bg-transparent focus:bg-white text-center font-black" min="0" /></td>
                      <td className="p-1"><input type="number" value={row.evening_56c} onChange={e => handleInputChange(data.indexOf(row), 'evening_56c', e.target.value)} className="w-full p-2 border border-[var(--color-border)] rounded bg-transparent focus:bg-white text-center font-black" min="0" /></td>
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
            <tfoot className="bg-indigo-600 text-white font-black">
              <tr>
                <td className="p-3 border-t border-indigo-400 flex items-center gap-2"><Calculator size={16} /> الإجمالي</td>
                <td className="p-3 border-t border-indigo-400 text-center">{totals.morning_56b}</td>
                <td className="p-3 border-t border-indigo-400 text-center">{totals.morning_56c}</td>
                <td className="p-3 border-t border-indigo-400 text-center">{totals.evening_56b}</td>
                <td className="p-3 border-t border-indigo-400 text-center">{totals.evening_56c}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Supported Tickets View */}
      {isSupported && (
        <div className="overflow-x-auto rounded-xl border border-[var(--color-border)] shadow-inner">
          <table className="w-full text-right text-xs">
            <thead className="bg-[var(--color-bg-card)] sticky top-0 z-10 font-black">
              <tr>
                <th className="p-3 border-b border-[var(--color-border)] min-w-[180px]">المنطقة / العيادة</th>
                <th className="p-3 border-b border-[var(--color-border)] bg-blue-50 text-center" colSpan="3">صباحي</th>
                <th className="p-3 border-b border-[var(--color-border)] bg-emerald-50 text-center" colSpan="3">مسائي</th>
              </tr>
              <tr>
                <th className="p-2 border-b border-[var(--color-border)]"></th>
                <th className="p-2 border-b border-[var(--color-border)] text-center bg-blue-50/50">هيئة</th>
                <th className="p-2 border-b border-[var(--color-border)] text-center bg-blue-50/50">طلاب</th>
                <th className="p-2 border-b border-[var(--color-border)] text-center bg-blue-50/50">رضع</th>
                <th className="p-2 border-b border-[var(--color-border)] text-center bg-emerald-50/50">هيئة</th>
                <th className="p-2 border-b border-[var(--color-border)] text-center bg-emerald-50/50">طلاب</th>
                <th className="p-2 border-b border-[var(--color-border)] text-center bg-emerald-50/50">رضع</th>
              </tr>
            </thead>
            <tbody className="bg-[var(--color-bg)]">
              {Object.entries(groupedData).map(([areaName, clinics]) => (
                <React.Fragment key={areaName}>
                  <tr className="bg-gradient-to-r from-slate-100 to-slate-50">
                    <td colSpan="7" className="p-3 font-black text-slate-700 flex items-center gap-2">
                      <MapPin size={16} className="text-amber-500" />{areaName}
                    </td>
                  </tr>
                  {clinics.map((row) => (
                    <tr key={row.clinic_id} className="hover:bg-[var(--color-bg-card)] transition-colors border-b border-[var(--color-border)]">
                      <td className="p-3 font-bold flex items-center gap-2 text-sm">
                        <Hospital size={14} className="text-[var(--color-primary)]" />{row.clinic_name}
                      </td>
                      <td className="p-1"><input type="number" value={row.morning_authority} onChange={e => handleInputChange(data.indexOf(row), 'morning_authority', e.target.value)} className="w-full p-2 border border-[var(--color-border)] rounded bg-transparent focus:bg-white text-center font-black" min="0" /></td>
                      <td className="p-1"><input type="number" value={row.morning_students} onChange={e => handleInputChange(data.indexOf(row), 'morning_students', e.target.value)} className="w-full p-2 border border-[var(--color-border)] rounded bg-transparent focus:bg-white text-center font-black" min="0" /></td>
                      <td className="p-1"><input type="number" value={row.morning_infants} onChange={e => handleInputChange(data.indexOf(row), 'morning_infants', e.target.value)} className="w-full p-2 border border-[var(--color-border)] rounded bg-transparent focus:bg-white text-center font-black" min="0" /></td>
                      <td className="p-1"><input type="number" value={row.evening_authority} onChange={e => handleInputChange(data.indexOf(row), 'evening_authority', e.target.value)} className="w-full p-2 border border-[var(--color-border)] rounded bg-transparent focus:bg-white text-center font-black" min="0" /></td>
                      <td className="p-1"><input type="number" value={row.evening_students} onChange={e => handleInputChange(data.indexOf(row), 'evening_students', e.target.value)} className="w-full p-2 border border-[var(--color-border)] rounded bg-transparent focus:bg-white text-center font-black" min="0" /></td>
                      <td className="p-1"><input type="number" value={row.evening_infants} onChange={e => handleInputChange(data.indexOf(row), 'evening_infants', e.target.value)} className="w-full p-2 border border-[var(--color-border)] rounded bg-transparent focus:bg-white text-center font-black" min="0" /></td>
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
            <tfoot className="bg-emerald-600 text-white font-black">
              <tr>
                <td className="p-3 border-t border-emerald-400 flex items-center gap-2"><Calculator size={16} /> الإجمالي</td>
                <td className="p-3 border-t border-emerald-400 text-center">{totals.morning_authority}</td>
                <td className="p-3 border-t border-emerald-400 text-center">{totals.morning_students}</td>
                <td className="p-3 border-t border-emerald-400 text-center">{totals.morning_infants}</td>
                <td className="p-3 border-t border-emerald-400 text-center">{totals.evening_authority}</td>
                <td className="p-3 border-t border-emerald-400 text-center">{totals.evening_students}</td>
                <td className="p-3 border-t border-emerald-400 text-center">{totals.evening_infants}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-blue-50 p-4 rounded-xl border border-blue-200">
          <p className="text-xs text-blue-600 font-bold mb-1">إجمالي 56ب</p>
          <p className="text-xl font-black text-blue-700">{totals.morning_56b + totals.evening_56b}</p>
        </div>
        <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-200">
          <p className="text-xs text-emerald-600 font-bold mb-1">إجمالي 56ج</p>
          <p className="text-xl font-black text-emerald-700">{totals.morning_56c + totals.evening_56c}</p>
        </div>
        <div className="bg-amber-50 p-4 rounded-xl border border-amber-200">
          <p className="text-xs text-amber-600 font-bold mb-1">عدد العيادات</p>
          <p className="text-xl font-black text-amber-700">{data.length}</p>
        </div>
        <div className="bg-purple-50 p-4 rounded-xl border border-purple-200">
          <p className="text-xs text-purple-600 font-bold mb-1">المناطق</p>
          <p className="text-xl font-black text-purple-700">{Object.keys(groupedData).length}</p>
        </div>
      </div>
    </div>
  );
};

export default QuickTicketsEntry;
