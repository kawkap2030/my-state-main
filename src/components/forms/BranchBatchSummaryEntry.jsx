import React, { useState, useEffect } from 'react';
import { Save, RefreshCw, AlertCircle, Building2, Calculator } from 'lucide-react';
import invoke from '../../api/tauriApi';
import { useToast } from '../ui/Toast';
import { useAuth } from '../../context/AuthContext';
import Button from '../ui/Button';

const BranchBatchSummaryEntry = ({ dispenseMonth }) => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const { user } = useAuth();

  const loadData = async () => {
    if (!dispenseMonth) return;
    setLoading(true);
    try {
      const branches = await invoke('get_branches');
      const batchData = await invoke('get_branch_batch_summary', { dispenseMonth });
      
      // Merge branches with existing batch data
      const gridRows = branches.map(branch => {
        const existing = batchData.find(b => b.branch_id === branch.id);
        return {
          branch_id: branch.id,
          branch_name: branch.name,
          recordId: existing?.id || null,
          drugs_free_authority: existing?.drugs_free_authority || 0,
          drugs_free_students: existing?.drugs_free_students || 0,
          drugs_free_infants: existing?.drugs_free_infants || 0,
          drugs_free_breadwinner_women: existing?.drugs_free_breadwinner_women || 0,
          drugs_supported_authority_value: existing?.drugs_supported_authority_value || 0,
          drugs_supported_authority_patient_share: existing?.drugs_supported_authority_patient_share || 0,
          drugs_supported_students_value: existing?.drugs_supported_students_value || 0,
          drugs_supported_students_patient_share: existing?.drugs_supported_students_patient_share || 0,
          drugs_supported_infants_value: existing?.drugs_supported_infants_value || 0,
          drugs_supported_infants_patient_share: existing?.drugs_supported_infants_patient_share || 0,
        };
      });
      
      setData(gridRows);
    } catch (err) {
      toast.error('فشل تحميل بيانات الفروع');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispenseMonth]);

  const handleInputChange = (rowIndex, field, value) => {
    const newData = [...data];
    newData[rowIndex][field] = parseFloat(value) || 0;
    setData(newData);
  };

  const calculateTotals = () => {
    return data.reduce((acc, row) => ({
      drugs_free_authority: acc.drugs_free_authority + row.drugs_free_authority,
      drugs_free_students: acc.drugs_free_students + row.drugs_free_students,
      drugs_free_infants: acc.drugs_free_infants + row.drugs_free_infants,
      drugs_free_breadwinner_women: acc.drugs_free_breadwinner_women + row.drugs_free_breadwinner_women,
      drugs_supported_authority_value: acc.drugs_supported_authority_value + row.drugs_supported_authority_value,
      drugs_supported_authority_patient_share: acc.drugs_supported_authority_patient_share + row.drugs_supported_authority_patient_share,
      drugs_supported_students_value: acc.drugs_supported_students_value + row.drugs_supported_students_value,
      drugs_supported_students_patient_share: acc.drugs_supported_students_patient_share + row.drugs_supported_students_patient_share,
      drugs_supported_infants_value: acc.drugs_supported_infants_value + row.drugs_supported_infants_value,
      drugs_supported_infants_patient_share: acc.drugs_supported_infants_patient_share + row.drugs_supported_infants_patient_share,
    }), {
      drugs_free_authority: 0,
      drugs_free_students: 0,
      drugs_free_infants: 0,
      drugs_free_breadwinner_women: 0,
      drugs_supported_authority_value: 0,
      drugs_supported_authority_patient_share: 0,
      drugs_supported_students_value: 0,
      drugs_supported_students_patient_share: 0,
      drugs_supported_infants_value: 0,
      drugs_supported_infants_patient_share: 0,
    });
  };

  const handleSaveAll = async () => {
    setSaving(true);
    try {
      const items = data.map(row => ({
        branch_id: row.branch_id,
        drugs_free_authority: row.drugs_free_authority,
        drugs_free_students: row.drugs_free_students,
        drugs_free_infants: row.drugs_free_infants,
        drugs_free_breadwinner_women: row.drugs_free_breadwinner_women,
        drugs_supported_authority_value: row.drugs_supported_authority_value,
        drugs_supported_authority_patient_share: row.drugs_supported_authority_patient_share,
        drugs_supported_students_value: row.drugs_supported_students_value,
        drugs_supported_students_patient_share: row.drugs_supported_students_patient_share,
        drugs_supported_infants_value: row.drugs_supported_infants_value,
        drugs_supported_infants_patient_share: row.drugs_supported_infants_patient_share,
      }));

      const result = await invoke('save_branch_batch_summary', {
        items,
        dispenseMonth
      });

      await invoke('log_frontend_action', {
        userId: user ? user.id : null,
        action: 'BATCH_SAVE',
        tableName: 'monthly_drugs_dispensed',
        recordId: null,
        details: `تم حفظ ملخص الفروع دفعة واحدة - شهر ${dispenseMonth}`
      });

      if (result.skipped > 0) {
        toast.warning(`تم حفظ ${result.saved} فرع. تم تخطي ${result.skipped} فرع: ${result.skipped_branches.join(', ')}`);
      } else {
        toast.success(`تم حفظ ملخص ${result.saved} فرع بنجاح`);
      }
      
      loadData();
    } catch (err) {
      toast.error(`حدث خطأ أثناء الحفظ: ${err}`);
    } finally {
      setSaving(false);
    }
  };

  const totals = calculateTotals();

  if (!dispenseMonth) {
    return (
      <div className="p-8 text-center opacity-60">
        <AlertCircle className="mx-auto mb-2" size={32} />
        <p>الرجاء تحديد الشهر أولاً</p>
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

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex justify-between items-center bg-[var(--color-bg-card)] p-4 rounded-xl border border-[var(--color-border)] shadow-sm">
        <div className="flex items-center gap-2 text-sm font-bold text-[var(--color-primary)]">
          <AlertCircle size={18} />
          <span>إدخال ملخص الفروع دفعة واحدة - شهر {dispenseMonth}</span>
        </div>
        <div className="flex gap-2">
          <Button onClick={loadData} variant="secondary" icon={RefreshCw} disabled={saving}>
            تحديث
          </Button>
          <Button onClick={handleSaveAll} variant="success" icon={Save} loading={saving}>
            حفظ الكل
          </Button>
        </div>
      </div>

      {/* Grid */}
      <div className="overflow-x-auto rounded-xl border border-[var(--color-border)]">
        <table className="w-full text-right text-xs">
          <thead className="bg-[var(--color-bg-card)] text-[var(--color-text-muted)] sticky top-0 z-10 font-black">
            <tr>
              <th className="p-3 border-b border-[var(--color-border)] min-w-[180px]">الفرع</th>
              <th className="p-3 border-b border-[var(--color-border)] bg-blue-50/50">هيئة (مجاني)</th>
              <th className="p-3 border-b border-[var(--color-border)] bg-blue-50/50">طلاب (مجاني)</th>
              <th className="p-3 border-b border-[var(--color-border)] bg-blue-50/50">رضع (مجاني)</th>
              <th className="p-3 border-b border-[var(--color-border)] bg-blue-50/50">ربة بيت (مجاني)</th>
              <th className="p-3 border-b border-[var(--color-border)] bg-emerald-50/50">هيئة (مدعم - قيمة)</th>
              <th className="p-3 border-b border-[var(--color-border)] bg-emerald-50/50">هيئة (مدعم - مساهمة)</th>
              <th className="p-3 border-b border-[var(--color-border)] bg-emerald-50/50">طلاب (مدعم - قيمة)</th>
              <th className="p-3 border-b border-[var(--color-border)] bg-emerald-50/50">طلاب (مدعم - مساهمة)</th>
              <th className="p-3 border-b border-[var(--color-border)] bg-emerald-50/50">رضع (مدعم - قيمة)</th>
              <th className="p-3 border-b border-[var(--color-border)] bg-emerald-50/50">رضع (مدعم - مساهمة)</th>
            </tr>
          </thead>
          <tbody className="bg-[var(--color-bg)]">
            {data.map((row, idx) => (
              <tr 
                key={row.branch_id} 
                className="hover:bg-[var(--color-bg-card)] transition-colors border-b border-[var(--color-border)]"
              >
                <td className="p-3 font-bold flex items-center gap-2">
                  <Building2 size={16} className="text-[var(--color-primary)]" />
                  {row.branch_name}
                </td>
                {[
                  'drugs_free_authority',
                  'drugs_free_students',
                  'drugs_free_infants',
                  'drugs_free_breadwinner_women',
                  'drugs_supported_authority_value',
                  'drugs_supported_authority_patient_share',
                  'drugs_supported_students_value',
                  'drugs_supported_students_patient_share',
                  'drugs_supported_infants_value',
                  'drugs_supported_infants_patient_share',
                ].map(field => (
                  <td key={field} className="p-1">
                    <input
                      type="number"
                      value={row[field]}
                      onChange={e => handleInputChange(idx, field, e.target.value)}
                      className="w-full p-2 border border-[var(--color-border)] rounded bg-transparent focus:bg-white text-left"
                      min="0"
                      step="0.01"
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {/* Totals Row */}
          <tfoot className="bg-[var(--color-primary)] text-white font-black">
            <tr>
              <td className="p-3 border-t border-[var(--color-border)]">
                <span className="flex items-center gap-2">
                  <Calculator size={16} />
                  الإجمالي
                </span>
              </td>
              {[
                totals.drugs_free_authority,
                totals.drugs_free_students,
                totals.drugs_free_infants,
                totals.drugs_free_breadwinner_women,
                totals.drugs_supported_authority_value,
                totals.drugs_supported_authority_patient_share,
                totals.drugs_supported_students_value,
                totals.drugs_supported_students_patient_share,
                totals.drugs_supported_infants_value,
                totals.drugs_supported_infants_patient_share,
              ].map((val, idx) => (
                <td key={idx} className="p-3 border-t border-[var(--color-border)] text-center">
                  {val.toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-blue-50 p-4 rounded-xl border border-blue-200">
          <p className="text-xs text-blue-600 font-bold mb-1">إجمالي المجاني (هيئة)</p>
          <p className="text-xl font-black text-blue-700">{totals.drugs_free_authority.toLocaleString('ar-EG')}</p>
        </div>
        <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-200">
          <p className="text-xs text-emerald-600 font-bold mb-1">إجمالي المدعم (قيمة)</p>
          <p className="text-xl font-black text-emerald-700">
            {(totals.drugs_supported_authority_value + totals.drugs_supported_students_value + totals.drugs_supported_infants_value).toLocaleString('ar-EG')}
          </p>
        </div>
        <div className="bg-amber-50 p-4 rounded-xl border border-amber-200">
          <p className="text-xs text-amber-600 font-bold mb-1">إجمالي المساهمة</p>
          <p className="text-xl font-black text-amber-700">
            {(totals.drugs_supported_authority_patient_share + totals.drugs_supported_students_patient_share + totals.drugs_supported_infants_patient_share).toLocaleString('ar-EG')}
          </p>
        </div>
        <div className="bg-purple-50 p-4 rounded-xl border border-purple-200">
          <p className="text-xs text-purple-600 font-bold mb-1">عدد الفروع</p>
          <p className="text-xl font-black text-purple-700">{data.length}</p>
        </div>
      </div>
    </div>
  );
};

export default BranchBatchSummaryEntry;
