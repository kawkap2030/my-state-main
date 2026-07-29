import React from 'react';
import { Edit3, Trash2 } from 'lucide-react';

const Table = ({ 
  columns, 
  data = [], 
  onEdit, 
  onDelete, 
  emptyMessage = 'لا توجد بيانات', 
  rowClassName,
  selectedIds = [],
  onSelectionChange,
  isRowLocked,
  footer,
}) => {
  if (!data.length) {
    return (
      <div className="neu-card p-10 text-center">
        <p className="text-base font-medium" style={{ color: 'var(--color-text-muted)' }}>{emptyMessage}</p>
      </div>
    );
  }

  const allSelected = data.length > 0 && data.every(row => row.id && selectedIds.includes(row.id));
  const someSelected = selectedIds.length > 0 && !allSelected;

  const handleSelectAll = () => {
    if (allSelected) {
      onSelectionChange([]);
    } else {
      onSelectionChange(data.map(row => row.id).filter(id => id !== undefined));
    }
  };

  const handleSelectRow = (id) => {
    if (selectedIds.includes(id)) {
      onSelectionChange(selectedIds.filter(i => i !== id));
    } else {
      onSelectionChange([...selectedIds, id]);
    }
  };

  return (
    <div className="neu-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full" dir="rtl">
          <thead>
            <tr style={{ background: 'var(--color-bg)' }}>
              {onSelectionChange && (
                <th className="px-5 py-4 text-right no-print" style={{ width: '40px', borderBottom: '2px solid var(--color-border)' }}>
                  <input 
                    type="checkbox" 
                    className="neu-checkbox"
                    checked={allSelected}
                    ref={input => { if (input) input.indeterminate = someSelected; }}
                    onChange={handleSelectAll}
                  />
                </th>
              )}
              {columns.map((col, i) => (
                <th
                  key={i}
                  className={`px-5 py-4 text-right text-xs font-bold uppercase tracking-wider ${col.className || ''}`}
                  style={{ color: 'var(--color-text-muted)', borderBottom: '2px solid var(--color-border)' }}
                >
                  {col.header}
                </th>
              ))}
              {(onEdit || onDelete) && (
                <th
                  className="px-5 py-4 text-center text-xs font-bold uppercase tracking-wider no-print"
                  style={{ color: 'var(--color-text-muted)', borderBottom: '2px solid var(--color-border)', width: '120px' }}
                >
                  إجراءات
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {data.map((row, rowIdx) => {
              if (row.isGroupHeader) {
                return (
                  <tr
                    key={`group-${rowIdx}`}
                    style={{ background: 'var(--color-bg)', borderBottom: '2px solid var(--color-border)' }}
                  >
                    {onSelectionChange && <td />}
                    <td
                      colSpan={columns.length + ((onEdit || onDelete) ? 1 : 0)}
                      className="px-5 py-3 text-right text-sm font-bold"
                      style={{ color: 'var(--color-primary)' }}
                    >
                      <div className="flex justify-between items-center w-full">
                        <span>{row.groupName}</span>
                        {row.totalCost !== undefined && (
                          <span className="text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 px-3 py-1 rounded-lg">
                            الإجمالي: {row.totalCost.toLocaleString()} ج.م
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              }

              const isSelected = row.id && selectedIds.includes(row.id);

              return (
                <tr
                  key={row.id || rowIdx}
                  className={`transition-colors duration-150 ${rowClassName ? rowClassName(row) : ''} ${isSelected ? 'bg-primary/5' : ''}`}
                  style={{ 
                    borderBottom: '1px solid var(--color-border)',
                    backgroundColor: isSelected ? 'rgba(var(--color-primary-rgb), 0.05)' : 'transparent'
                  }}
                  onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--color-bg)'; }}
                  onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
                >
                  {onSelectionChange && (
                    <td className="px-5 py-4 no-print">
                      <input 
                        type="checkbox" 
                        className="neu-checkbox"
                        checked={isSelected || false}
                        onChange={() => handleSelectRow(row.id)}
                        onClick={e => e.stopPropagation()}
                      />
                    </td>
                  )}
                  {columns.map((col, colIdx) => {
                    let content;
                    if (col.cell) {
                      content = col.cell(col.accessor ? row[col.accessor] : row, row);
                    } else if (col.render) {
                      content = col.render(row);
                    } else {
                      content = row[col.accessor];
                    }
                    return (
                      <td key={colIdx} className={`px-5 py-4 text-sm font-medium ${col.className || ''}`} style={{ color: 'var(--color-text)' }}>
                        {content}
                      </td>
                    );
                  })}
                  {(onEdit || onDelete) && (
                    <td className="px-5 py-4 text-center no-print">
                      <div className="flex items-center justify-center gap-2">
                        {onEdit && (
                          <button
                            onClick={() => onEdit(row)}
                            disabled={isRowLocked && isRowLocked(row)}
                            className={`p-2 rounded-xl transition-all duration-200 ${isRowLocked && isRowLocked(row) ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}`}
                            style={{ color: 'var(--color-primary)', background: 'var(--color-bg)' }}
                            onMouseEnter={e => { if (!(isRowLocked && isRowLocked(row))) e.currentTarget.style.background = 'var(--color-info-bg)'; }}
                            onMouseLeave={e => { if (!(isRowLocked && isRowLocked(row))) e.currentTarget.style.background = 'var(--color-bg)'; }}
                            title={isRowLocked && isRowLocked(row) ? "السجل مقفل" : "تعديل"}
                          >
                            <Edit3 size={16} />
                          </button>
                        )}
                        {onDelete && (
                          <button
                            onClick={() => onDelete(row)}
                            disabled={isRowLocked && isRowLocked(row)}
                            className={`p-2 rounded-xl transition-all duration-200 ${isRowLocked && isRowLocked(row) ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}`}
                            style={{ color: 'var(--color-danger)', background: 'var(--color-bg)' }}
                            onMouseEnter={e => { if (!(isRowLocked && isRowLocked(row))) e.currentTarget.style.background = 'var(--color-danger-bg)'; }}
                            onMouseLeave={e => { if (!(isRowLocked && isRowLocked(row))) e.currentTarget.style.background = 'var(--color-bg)'; }}
                            title={isRowLocked && isRowLocked(row) ? "السجل مقفل" : "حذف"}
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
          {footer && (
            <tfoot className="print-table-footer">
              {footer}
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
};


export default Table;
