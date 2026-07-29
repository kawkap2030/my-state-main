import React from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

const Pagination = ({ 
  currentPage, 
  totalPages, 
  onPageChange, 
  rowsPerPage, 
  onRowsPerPageChange,
  totalRecords,
  rowsPerPageOptions = [10, 25, 50, 100]
}) => {
  if (totalPages <= 1 && totalRecords <= rowsPerPageOptions[0]) return null;

  const startRecord = (currentPage - 1) * rowsPerPage + 1;
  const endRecord = Math.min(currentPage * rowsPerPage, totalRecords);

  return (
    <div className="no-print flex flex-col md:flex-row items-center justify-between px-6 py-4 bg-[var(--color-bg-card)] border-t border-[var(--color-border)] gap-4" dir="rtl">
      {/* Records Info */}
      <div className="text-xs font-bold text-[var(--color-text-muted)]">
        عرض <span className="text-[var(--color-text)] font-black">{startRecord}</span> إلى <span className="text-[var(--color-text)] font-black">{endRecord}</span> من إجمالي <span className="text-[var(--color-primary)] font-black">{totalRecords}</span> سجل
      </div>

      {/* Controls */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1 ml-4">
          <span className="text-[10px] font-black text-[var(--color-text-muted)] uppercase tracking-widest ml-2">الصفوف:</span>
          <select 
            value={rowsPerPage} 
            onChange={(e) => onRowsPerPageChange(Number(e.target.value))}
            className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-2 py-1 text-xs font-black outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20"
          >
            {rowsPerPageOptions.map(opt => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-1">
          <button 
            onClick={() => onPageChange(1)} 
            disabled={currentPage === 1}
            className="p-2 rounded-xl border border-[var(--color-border)] hover:bg-[var(--color-bg)] disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            title="الصفحة الأولى"
          >
            <ChevronsRight size={16} />
          </button>
          <button 
            onClick={() => onPageChange(currentPage - 1)} 
            disabled={currentPage === 1}
            className="p-2 rounded-xl border border-[var(--color-border)] hover:bg-[var(--color-bg)] disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            title="السابق"
          >
            <ChevronRight size={16} />
          </button>

          <div className="flex items-center gap-1 px-4">
            <span className="text-xs font-black">صفحة</span>
            <input 
              type="number" 
              min="1" 
              max={totalPages} 
              value={currentPage}
              onChange={(e) => {
                const val = parseInt(e.target.value);
                if (val >= 1 && val <= totalPages) onPageChange(val);
              }}
              className="w-12 text-center bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg py-1 text-xs font-black outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20"
            />
            <span className="text-xs font-black text-[var(--color-text-muted)]">من {totalPages}</span>
          </div>

          <button 
            onClick={() => onPageChange(currentPage + 1)} 
            disabled={currentPage === totalPages}
            className="p-2 rounded-xl border border-[var(--color-border)] hover:bg-[var(--color-bg)] disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            title="التالي"
          >
            <ChevronLeft size={16} />
          </button>
          <button 
            onClick={() => onPageChange(totalPages)} 
            disabled={currentPage === totalPages}
            className="p-2 rounded-xl border border-[var(--color-border)] hover:bg-[var(--color-bg)] disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            title="الصفحة الأخيرة"
          >
            <ChevronsLeft size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default Pagination;
