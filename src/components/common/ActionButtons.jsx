import React from 'react';
import { Eye, Edit3, Trash2, Lock } from 'lucide-react';

/**
 * ActionButtons - Unified table row action buttons
 * 
 * Replaces ~20 lines of duplicated action button markup per row.
 * Handles locked state automatically.
 * 
 * @param {Function} onView - View handler (optional)
 * @param {Function} onEdit - Edit handler (optional)
 * @param {Function} onDelete - Delete handler (optional)
 * @param {boolean} isLocked - Whether record is locked (disables edit/delete)
 * @param {number} size - Icon size (default: 14)
 */
const ActionButtons = ({ 
  onView, 
  onEdit, 
  onDelete, 
  isLocked = false, 
  size = 14 
}) => {
  return (
    <div className="flex items-center justify-center gap-1">
      {onView && (
        <button 
          onClick={onView} 
          className="p-2 rounded-lg text-[var(--color-primary)] hover:bg-[var(--color-primary)] hover:text-white transition-all" 
          title="عرض"
        >
          <Eye size={size} />
        </button>
      )}
      
      {onEdit && (
        <button 
          onClick={isLocked ? undefined : onEdit}
          disabled={isLocked}
          className={`p-2 rounded-lg transition-all ${
            isLocked 
              ? 'text-slate-300 dark:text-slate-600 cursor-not-allowed opacity-50' 
              : 'text-amber-500 hover:bg-amber-500 hover:text-white'
          }`} 
          title={isLocked ? "السجل مقفل (4 أشهر)" : "تعديل"}
        >
          {isLocked ? <Lock size={size} /> : <Edit3 size={size} />}
        </button>
      )}
      
      {onDelete && (
        <button 
          onClick={isLocked ? undefined : onDelete}
          disabled={isLocked}
          className={`p-2 rounded-lg transition-all ${
            isLocked 
              ? 'text-slate-300 dark:text-slate-600 cursor-not-allowed opacity-50' 
              : 'text-red-500 hover:bg-red-500 hover:text-white'
          }`} 
          title={isLocked ? "السجل مقفل (4 أشهر)" : "حذف"}
        >
          <Trash2 size={size} />
        </button>
      )}
    </div>
  );
};

export default ActionButtons;
