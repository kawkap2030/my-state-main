import React, { useState } from 'react';
import { Printer, X, LayoutTemplate, Type } from 'lucide-react';
import { executePrint } from '../../utils/exportUtils';

const PrintSettingsModal = ({ isOpen, onClose }) => {
  const [orientation, setOrientation] = useState('landscape');
  const [fontSize, setFontSize] = useState('md');

  if (!isOpen) return null;

  const handlePrint = () => {
    executePrint({ orientation, fontSize });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)' }}>
      <div className="bg-[var(--color-bg-card)] rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-fadeIn" dir="rtl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--color-border)]">
          <h3 className="font-bold flex items-center gap-2 text-lg text-[var(--color-text)]">
            <Printer className="text-purple-600" size={20} />
            إعدادات الطباعة المتقدمة
          </h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition-colors cursor-pointer">
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Orientation Settings */}
          <div>
            <label className="flex items-center gap-2 text-sm font-bold text-slate-600 dark:text-slate-400 mb-3">
              <LayoutTemplate size={16} /> اتجاه الورقة (Page Orientation)
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button 
                onClick={() => setOrientation('landscape')}
                className={`p-3 rounded-xl border-2 transition-all font-bold text-sm flex flex-col items-center gap-2 cursor-pointer ${
                  orientation === 'landscape' 
                    ? 'border-purple-600 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400' 
                    : 'border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                }`}
              >
                <div className="w-8 h-6 border-2 border-current rounded-sm"></div>
                أفقي (عرضي)
              </button>
              <button 
                onClick={() => setOrientation('portrait')}
                className={`p-3 rounded-xl border-2 transition-all font-bold text-sm flex flex-col items-center gap-2 cursor-pointer ${
                  orientation === 'portrait' 
                    ? 'border-purple-600 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400' 
                    : 'border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                }`}
              >
                <div className="w-6 h-8 border-2 border-current rounded-sm"></div>
                رأسي (طولي)
              </button>
            </div>
          </div>

          {/* Font Size Settings */}
          <div>
            <label className="flex items-center gap-2 text-sm font-bold text-slate-600 dark:text-slate-400 mb-3">
              <Type size={16} /> حجم الخط للبيانات
            </label>
            <div className="grid grid-cols-3 gap-3">
              <button 
                onClick={() => setFontSize('sm')}
                className={`p-2 rounded-xl border-2 transition-all font-bold text-xs cursor-pointer ${
                  fontSize === 'sm' 
                    ? 'border-purple-600 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400' 
                    : 'border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                }`}
              >
                صغير جداً
              </button>
              <button 
                onClick={() => setFontSize('md')}
                className={`p-2 rounded-xl border-2 transition-all font-bold text-sm cursor-pointer ${
                  fontSize === 'md' 
                    ? 'border-purple-600 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400' 
                    : 'border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                }`}
              >
                متوسط (افتراضي)
              </button>
              <button 
                onClick={() => setFontSize('lg')}
                className={`p-2 rounded-xl border-2 transition-all font-bold text-base cursor-pointer ${
                  fontSize === 'lg' 
                    ? 'border-purple-600 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400' 
                    : 'border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                }`}
              >
                كبير
              </button>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-[var(--color-bg)] border-t border-[var(--color-border)] flex justify-end gap-3">
          <button 
            onClick={onClose} 
            className="px-6 py-2 rounded-xl font-bold text-slate-600 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
          >
            إلغاء
          </button>
          <button 
            onClick={handlePrint} 
            className="px-8 py-2 rounded-xl font-bold bg-purple-600 hover:bg-purple-700 text-white shadow-lg shadow-purple-200 dark:shadow-none flex items-center gap-2 transition-colors cursor-pointer"
          >
            <Printer size={18} /> طباعة الآن
          </button>
        </div>
      </div>
    </div>
  );
};

export default PrintSettingsModal;
