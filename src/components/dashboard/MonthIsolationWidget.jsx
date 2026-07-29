import React, { useState, useEffect } from 'react';
import { Lock, Unlock, ShieldCheck, AlertCircle, Info, Calendar } from 'lucide-react';
import invoke from '../../api/tauriApi';
import { useGlobalApp } from '../../context/useGlobalApp';
import Card from '../ui/Card';
import { useToast } from '../ui/Toast';

const MonthIsolationWidget = ({ branchId, dispenseMonth }) => {
  const toast = useToast();
  const { workspaceMode, setWorkspaceMode, lockedLevel, setLockedLevel } = useGlobalApp();
  const [loading, setLoading] = useState(false);
  const [hasData, setHasData] = useState(false);

  const fetchStatus = async () => {
    if (!branchId || !dispenseMonth) return;
    try {
      const [level, dataExists] = await Promise.all([
        invoke('get_month_isolation_rule', {
          branchId: parseInt(branchId),
          dispenseMonth: dispenseMonth
        }),
        invoke('check_month_data_exists', {
          branchId: parseInt(branchId),
          dispenseMonth: dispenseMonth
        })
      ]);
      
      setLockedLevel(level);
      setHasData(dataExists);
      
      // If locked, sync the global workspace mode
      if (level) {
        const mode = level === 'branch' ? 'branches' : level === 'area' ? 'areas' : 'clinics';
        if (workspaceMode !== mode) {
          setWorkspaceMode(mode);
        }
      }
    } catch (err) {
      console.error('Failed to fetch isolation status:', err);
    }
  };

   
  useEffect(() => {
    fetchStatus();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId, dispenseMonth]);

  const handleSetLock = async (level) => {
    if (!branchId || !dispenseMonth) {
      toast.error('يرجى اختيار الفرع والتاريخ أولاً');
      return;
    }

    try {
      setLoading(true);
      await invoke('set_month_isolation_rule', {
        branchId: parseInt(branchId),
        dispenseMonth: dispenseMonth,
        isolationLevel: level
      });
      setLockedLevel(level);
      const mode = level === 'branch' ? 'branches' : level === 'area' ? 'areas' : 'clinics';
      setWorkspaceMode(mode);
      toast.success(`تم قفل إدخالات الشهر على مستوى ${level === 'branch' ? 'الفرع' : level === 'area' ? 'المنطقة' : 'العيادة'}`);
      fetchStatus();
    } catch (err) {
      toast.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteLock = async () => {
    if (!window.confirm('الإلغاء الإجباري سيسمح لك بتغيير مستوى الإدخال حتى مع وجود بيانات متعارضة مسبقاً. قد يؤدي ذلك لخلل في التقارير إذا لم تقم بمسح وتصحيح البيانات في المستويات الأخرى أولاً. هل أنت متأكد من رغبتك بالاستمرار؟')) {
      return;
    }
    
    try {
      setLoading(true);
      await invoke('clear_month_isolation_rule', {
        branchId: parseInt(branchId),
        dispenseMonth: dispenseMonth
      });
      setLockedLevel(null);
      toast.success('تم فتح العزل إجبارياً بنجاح، يمكنك الآن تغيير مستوى الإدخال.');
      fetchStatus();
    } catch (err) {
      toast.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (!branchId) return null;

  const modeLabels = {
    branch: 'الفرع (تجميعي)',
    area: 'المنطقة (تجميعية)',
    clinic: 'العيادة (تفصيلي)'
  };

  // Condition to allow changing level: lockedLevel exists BUT no data has been entered yet
  const canChangeLevel = lockedLevel && !hasData;

  return (
    <Card className={`border-t-4 transition-all duration-500 ${lockedLevel ? 'border-t-emerald-500 bg-emerald-50/10 dark:bg-emerald-500/5' : 'border-t-amber-500 bg-amber-50/10 dark:bg-amber-500/5'}`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-transform hover:scale-110 ${lockedLevel ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400' : 'bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400'}`}>
            {lockedLevel ? <Lock size={20} /> : <Unlock size={20} />}
          </div>
          <div>
            <h3 className="font-black text-slate-800 dark:text-slate-100 text-sm">نظام العزل الثلاثي (مركزي)</h3>
            <div className="flex items-center gap-1.5 mt-0.5">
              <Calendar size={10} className="text-slate-400" />
              <p className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">{dispenseMonth}</p>
            </div>
          </div>
        </div>
        
        {lockedLevel && (
          <div className="flex items-center gap-1 text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/40 px-2 py-1 rounded-md text-[10px] font-black animate-pulse">
            <ShieldCheck size={12} />
            <span>مؤمن</span>
          </div>
        )}
      </div>

      {(lockedLevel && !canChangeLevel) ? (
        <div className="space-y-3">
          <div className="p-3 rounded-xl bg-white dark:bg-slate-800/50 border border-emerald-100 dark:border-emerald-900/30 shadow-sm flex items-center justify-between">
             <div>
                <p className="text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">مستوى الإدخال الحالي:</p>
                <p className="text-lg font-black text-emerald-700 dark:text-emerald-400">{modeLabels[lockedLevel]}</p>
             </div>
             {lockedLevel && (
               <button 
                  onClick={handleDeleteLock}
                  disabled={loading}
                  className="text-[10px] font-bold text-red-500 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors shadow-sm border border-red-100 dark:border-red-900/30 whitespace-nowrap"
                  title="إلغاء التأمين إجبارياً للحالات الخاصة"
               >
                  إلغاء القفل إجبارياً
               </button>
             )}
          </div>
          <div className="flex items-start gap-2 text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed font-medium bg-slate-50 dark:bg-slate-900/30 p-2 rounded-lg">
            <Info size={14} className="shrink-0 mt-0.5 text-blue-500" />
            <p>لا يمكن تغيير مستوى الإدخال لهذا الشهر بسبب وجود بيانات مسجلة بالفعل، ويمكن استخدام الإلغاء الإجباري فقط في حالات تصحيح الأخطاء.</p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-xl bg-white/60 dark:bg-slate-800/40 p-3 border border-amber-100 dark:border-amber-900/30">
            <div className="flex items-center gap-2 text-amber-800 dark:text-amber-400 font-black text-xs mb-2">
              <AlertCircle size={14} />
              <span>{canChangeLevel ? 'تغيير مستوى العزل' : 'تجهيز الشهر'}</span>
            </div>
            <p className="text-[10px] text-amber-700 dark:text-amber-500 font-bold leading-relaxed mb-3">
              {canChangeLevel 
                ? 'لم يتم تسجيل بيانات بعد لهذا الشهر، يمكنك تغيير مستوى الإدخال الآن إذا أردت.' 
                : 'يرجى اختيار مستوى إدخال البيانات لهذا الشهر. بمجرد الاختيار أو البدء في الحفظ، سيتم تعميم هذا المستوى على كافة صفحات النظام.'}
            </p>
            
            <div className="grid grid-cols-3 gap-2">
              {['branch', 'area', 'clinic'].map(level => (
                <button 
                  key={level}
                  onClick={() => handleSetLock(level)}
                  disabled={loading || lockedLevel === level}
                  className={`py-2 px-1 text-[10px] font-black rounded-lg transition-all shadow-sm border ${
                    lockedLevel === level 
                    ? 'bg-amber-500 text-white border-amber-500' 
                    : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-amber-500 hover:text-amber-600 dark:hover:text-amber-400'
                  } disabled:opacity-50`}
                >
                  {level === 'branch' ? 'الفرع' : level === 'area' ? 'المنطقة' : 'العيادة'}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
};

export default MonthIsolationWidget;
