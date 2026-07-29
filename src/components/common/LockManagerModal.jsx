import React, { useState, useEffect } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { Lock, Unlock, Loader2, AlertCircle, Calendar, CheckCircle2 } from 'lucide-react';
import invoke from '../../api/tauriApi';
import { useToast } from '../ui/Toast';
import { useGlobalApp } from '../../context/useGlobalApp';
import { isMonthLocked } from '../../utils/dateUtils';

const LockManagerModal = ({ isOpen, onClose }) => {
  const toast = useToast();
  const { manualLockedMonths, setManualLockedMonths, isMasterUnlocked } = useGlobalApp();
  const [months, setMonths] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(null);

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const loadData = async () => {
    setLoading(true);
    try {
      const dataMonths = await invoke('get_months_with_data');
      setMonths(dataMonths);
    } catch (err) {
      toast.error('فشل في تحميل قائمة الأشهر');
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (month, currentLocked) => {
    // If unlocking, ask for password (unless master is already unlocked)
    if (currentLocked && !isMasterUnlocked) {
      const pass = window.prompt('يرجى إدخال كلمة سر المدير لفتح قفل هذا الشهر:');
      if (pass !== 'admin123') {
        if (pass !== null) toast.error('كلمة السر غير صحيحة!');
        return;
      }
    }

    setToggling(month);
    try {
      const newStatus = !currentLocked;
      await invoke('toggle_month_lock', { month, lock: newStatus });
      
      // Update local state in context
      setManualLockedMonths(prev => ({
        ...prev,
        [month]: newStatus
      }));
      
      toast.success(newStatus ? `تم قفل شهر ${month} بنجاح` : `تم فتح شهر ${month} بنجاح`);
    } catch (err) {
      toast.error('فشل في تغيير حالة القفل');
    } finally {
      setToggling(null);
    }
  };

  const isSmartLocked = (monthStr) => isMonthLocked(monthStr);

  const getStatus = (month) => {
    const manual = manualLockedMonths[month];
    if (manual !== undefined) {
      return manual ? 'مغلق (يدوي)' : 'مفتوح (يدوي)';
    }
    return isSmartLocked(month) ? 'مغلق (تلقائي)' : 'مفتوح (تلقائي)';
  };

  const isLockedEffectively = (month) => {
    if (isMasterUnlocked) return false;
    const manual = manualLockedMonths[month];
    if (manual !== undefined) return manual;
    return isSmartLocked(month);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="إدارة أقفال الأشهر"
      icon={Lock}
    >
      <div className="space-y-4" dir="rtl">
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-3 text-amber-800 text-xs font-bold leading-relaxed shadow-sm">
          <AlertCircle size={18} className="shrink-0 mt-0.5" />
          <p>
            هنا يمكنك قفل أو فتح الأشهر بشكل يدوي. 
            الأشهر التي مر عليها 4 أشهر يتم قفلها تلقائياً ما لم يتم فتحها يدوياً هنا.
            <br />
            <span className="text-[10px] opacity-75">ملاحظة: "المفتاح الرئيسي" في الأسفل يفتح جميع الأشهر بغض النظر عن الإعدادات هنا.</span>
          </p>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-10 gap-3">
            <Loader2 className="animate-spin text-primary" size={32} />
            <span className="text-sm font-bold text-slate-400">جاري جلب البيانات...</span>
          </div>
        ) : months.length === 0 ? (
          <div className="text-center py-10 text-slate-400 font-bold">
            <Calendar size={48} className="mx-auto mb-3 opacity-20" />
            <p>لا توجد أشهر تحتوي على بيانات حالياً</p>
          </div>
        ) : (
          <div className="pr-2">
            <div className="grid gap-2">
              {months.map((month) => {
                const locked = isLockedEffectively(month);
                const statusLabel = getStatus(month);
                const isManual = manualLockedMonths[month] !== undefined;

                return (
                  <div 
                    key={month}
                    className={`flex items-center justify-between p-3 rounded-2xl border transition-all ${
                      locked 
                        ? 'bg-slate-50 border-slate-200 shadow-sm' 
                        : 'bg-emerald-50/30 border-emerald-100 shadow-sm shadow-emerald-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-xl ${locked ? 'bg-slate-200 text-slate-500' : 'bg-emerald-100 text-emerald-600'}`}>
                        <Calendar size={18} />
                      </div>
                      <div>
                        <div className="text-sm font-black text-slate-700">{month}</div>
                        <div className={`text-[10px] font-bold ${isManual ? 'text-primary' : 'text-slate-400'}`}>
                          {statusLabel}
                        </div>
                      </div>
                    </div>

                    <Button
                      size="sm"
                      variant={locked ? 'secondary' : 'ghost'}
                      className={`min-w-[100px] gap-2 ${locked ? 'hover:bg-emerald-500 hover:text-white' : 'text-red-500 hover:bg-red-50 border-red-100'}`}
                      onClick={() => handleToggle(month, locked)}
                      loading={toggling === month}
                      icon={locked ? Unlock : Lock}
                    >
                      {locked ? 'فتح القفل' : 'قفل الشهر'}
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="pt-4 border-t border-slate-100 flex justify-end">
          <Button variant="ghost" onClick={onClose} className="px-8">إغلاق</Button>
        </div>
      </div>
    </Modal>
  );
};

export default LockManagerModal;
