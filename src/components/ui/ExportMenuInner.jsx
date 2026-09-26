import React, { useState, useRef, useEffect } from 'react';
import { 
  FileSpreadsheet, FileText, FileType, 
  Printer, ChevronDown, Download, X 
} from 'lucide-react';
// Import only what's needed — avoids bundling unused export libraries
import { exportMultiSheetExcel } from '../../utils/exportExcel';
import { exportToWord } from '../../utils/exportWord';
import { exportToPDF } from '../../utils/exportPdf';
import { useToast } from './Toast';
import { useGlobalApp } from '../../context/useGlobalApp';
import { useAuth } from '../../context/AuthContext';
import useReportSignatures from '../../hooks/useReportSignatures';
import PrintPreviewModal from '../common/PrintPreviewModal';
import ExportSettingsModal from '../common/ExportSettingsModal';
import { buildHierarchyLabel } from '../../utils/reportUtils';

/**
 * ExportMenuInner — Full export dropdown implementation.
 * 
 * Lazy-loaded via ExportMenu.jsx facade so that the heavy export
 * libraries (exceljs, jspdf, html-to-image) are only fetched when
 * the user actually opens the export menu.
 */
const ExportMenuInner = ({ data = [], columns = [], options = {}, disabled = false, onCustomExport = null, chartImage = null, printRequest = 0 }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [showPrintPreview, setShowPrintPreview] = useState(false);
  const [showExportSettings, setShowExportSettings] = useState(false);
  const [pendingExportType, setPendingExportType] = useState(null);
  const [exporting, setExporting] = useState(null);
  const menuRef = useRef(null);
  const toast = useToast();
  const { workspaceMode, hierarchyNames, activeHierarchy } = useGlobalApp();
  const { user } = useAuth();
  const { signatures } = useReportSignatures();

  const getDynamicHierarchyLabel = () => {
    if (options.hierarchyLabel) return options.hierarchyLabel;
    return buildHierarchyLabel(workspaceMode, hierarchyNames);
  };

  const buildDefaultSignatureData = () => ({
    preparerName: signatures?.preparerName || user?.username || '',
    managerName: signatures?.managerName || '',
    approvalNumber: signatures?.approvalNumber || '',
  });

  // Report data month — taken from page-provided options first, then the
  // globally-synced active hierarchy (HierarchySelector keeps it in sync).
  // Skip the global fallback when the page's subtitle already carries the
  // month/period (e.g. "شهر التقرير: 2026-06") to avoid header duplication.
  const sub = options.subtitle || '';
  const globalMonth = activeHierarchy?.dispenseMonth || '';
  const subtitleHasMonth = /(شهر|الفترة)/.test(sub) || (!!globalMonth && (sub.includes(globalMonth) || /\d{4}-\d{2}/.test(sub)));
  const monthLabel = options.month || options.dispenseMonth || (subtitleHasMonth ? '' : globalMonth);

  const finalOptions = {
    ...options,
    hierarchyLabel: getDynamicHierarchyLabel(),
    monthLabel,
    signatures: buildDefaultSignatureData(),
  };

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // ── Open export settings before proceeding ──────────────────────────
  const handleExportClick = (type) => {
    if (!data || data.length === 0) {
      toast.warning('لا توجد بيانات للتصدير. يرجى توليد التقرير أولاً.');
      setIsOpen(false);
      return;
    }

    if (type === 'print') {
      // Print goes directly to preview (no settings needed)
      setShowPrintPreview(true);
      setIsOpen(false);
      return;
    }

    // For Excel, Word, PDF — show settings modal first
    setPendingExportType(type);
    setShowExportSettings(true);
    setIsOpen(false);
  };

  // ── Execute export with settings from modal ──────────────────────────
  const handleExportWithSettings = async (settings) => {
    const type = pendingExportType;
    if (!type) return;

    setExporting(type);
    try {
      // Merge settings into finalOptions
      const enhancedOptions = {
        ...finalOptions,
        orientation: settings.orientation,
        marginPreset: settings.marginPreset,
        showPageNumbers: settings.showPageNumbers,
        showSignatures: settings.showSignatures,
        signatures: settings.signatures,
      };

      if (onCustomExport) {
        const handled = await onCustomExport(type, {
          data,
          columns,
          options: enhancedOptions,
        });
        if (handled) {
          toast.success(`تم تصدير ملف ${type === 'excel' ? 'Excel' : type === 'word' ? 'Word' : 'PDF'} بنجاح ✅`);
          setExporting(null);
          return;
        }
      }

      switch (type) {
        case 'excel': {
          // Use multi-sheet export as default — generates summary sheet + data sheet
          // Auto-generate a comprehensive summary from the data
          const summaryRows = [
            ['إجمالي عدد السجلات', String(data.length)],
          ];
          
          // Calculate total from all numeric columns
          let totalSum = 0;
          let foundNumeric = false;
          if (data.length > 0 && columns.length > 0) {
            columns.forEach((col) => {
              // Try to find the 'total' or 'cost' related column first
              const headerLower = (col.header || '').toLowerCase();
              const accessorStr = String(col.accessor || '').toLowerCase();
              const isTotalCol = headerLower.includes('total') || headerLower.includes('cost') || 
                                 headerLower.includes('price') || headerLower.includes('value') ||
                                 headerLower.includes('اجمالي') || headerLower.includes('إجمالي') ||
                                 headerLower.includes('تكلفة') || headerLower.includes('سعر') ||
                                 headerLower.includes('قيمة') ||
                                 accessorStr.includes('total') || accessorStr.includes('cost');
              
              if (isTotalCol) {
                const sum = data.reduce((acc, row) => {
                  const val = typeof col.exportAccessor === 'function'
                    ? col.exportAccessor(row)
                    : row[col.accessor];
                  const num = parseFloat(String(val || '0').replace(/,/g, ''));
                  return acc + (isNaN(num) ? 0 : num);
                }, 0);
                if (sum > 0) {
                  totalSum += sum;
                  foundNumeric = true;
                }
              }
            });
            
            // If no total column found, try the last numeric column
            if (!foundNumeric) {
              const lastCol = columns[columns.length - 1];
              const sum = data.reduce((acc, row) => {
                const val = typeof lastCol.exportAccessor === 'function'
                  ? lastCol.exportAccessor(row)
                  : row[lastCol.accessor];
                const num = parseFloat(String(val || '0').replace(/,/g, ''));
                return acc + (isNaN(num) ? 0 : num);
              }, 0);
              if (sum > 0) {
                totalSum = sum;
                foundNumeric = true;
              }
            }
          }
          
          if (foundNumeric) {
            summaryRows.push(['الإجمالي', totalSum.toLocaleString(undefined, { maximumFractionDigits: 2 })]);
          }
          if (enhancedOptions.subtitle) {
            summaryRows.push(['الفترة', enhancedOptions.subtitle]);
          }
          if (enhancedOptions.monthLabel) {
            summaryRows.push(['شهر البيانات', enhancedOptions.monthLabel]);
          }
          if (enhancedOptions.hierarchyLabel) {
            summaryRows.push(['النطاق', enhancedOptions.hierarchyLabel]);
          }

          const sheetsData = {
            'التقرير الرئيسي': {
              data,
              columns,
              options: enhancedOptions,
            },
          };

          await exportMultiSheetExcel(sheetsData, {
            fileName: enhancedOptions.fileName || 'report',
            title: enhancedOptions.title || 'تقرير',
            chartImage: chartImage || enhancedOptions.chartImage || null,
            summaryData: {
              headers: ['الإحصائية', 'القيمة'],
              rows: summaryRows,
            },
          });
          toast.success('تم تصدير ملف Excel بنجاح ✅');
          break;
        }
        case 'word':
          exportToWord(data, columns, {
            ...enhancedOptions,
            chartImage: chartImage || enhancedOptions.chartImage || null,
          });
          toast.success('تم تصدير ملف Word بنجاح ✅');
          break;
        case 'pdf':
          await exportToPDF(data, columns, {
            ...enhancedOptions,
            chartImage: chartImage || enhancedOptions.chartImage || null,
          });
          toast.success('تم تصدير ملف PDF بنجاح ✅');
          break;
        default:
          break;
      }
    } catch (err) {
      console.error('Export error:', err);
      toast.error(`فشل التصدير: ${err.message || err}`);
    } finally {
      setExporting(null);
      setPendingExportType(null);
    }
  };

  // ── Quick print (no settings needed) ─────────────────────────────────
  const handlePrintClick = () => {
    if (!data || data.length === 0) {
      toast.warning('لا توجد بيانات للطباعة. يرجى توليد التقرير أولاً.');
      setIsOpen(false);
      return;
    }
    setShowPrintPreview(true);
    setIsOpen(false);
  };

  // ── External print-preview request (Ctrl+P via ExportMenu's shared API) ──
  // Opens the exact same PrintPreviewModal the "طباعة التقرير" menu item
  // would open — same data, same columns, same props — so both paths render
  // the identical paper (never the live page). Non-MT consumers simply never
  // pass printRequest (defaults to 0), so the effect stays a no-op for them.
  useEffect(() => {
    if (printRequest > 0) handlePrintClick();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [printRequest]);

  const exportOptions = [
    {
      key: 'excel',
      label: 'تصدير Excel',
      desc: 'جداول بيانات .xlsx',
      icon: FileSpreadsheet,
      color: '#059669',
      bgColor: 'rgba(5, 150, 105, 0.08)',
      hoverBg: 'rgba(5, 150, 105, 0.15)',
    },
    {
      key: 'word',
      label: 'تصدير Word',
      desc: 'مستند .doc',
      icon: FileText,
      color: '#2563eb',
      bgColor: 'rgba(37, 99, 235, 0.08)',
      hoverBg: 'rgba(37, 99, 235, 0.15)',
    },
    {
      key: 'pdf',
      label: 'تصدير PDF',
      desc: 'ملف .pdf (يدعم العربية)',
      icon: FileType,
      color: '#dc2626',
      bgColor: 'rgba(220, 38, 38, 0.08)',
      hoverBg: 'rgba(220, 38, 38, 0.15)',
    },
    { type: 'divider' },
    {
      key: 'print',
      label: 'طباعة التقرير',
      desc: 'طباعة مباشرة',
      icon: Printer,
      color: '#475569',
      bgColor: 'rgba(71, 85, 105, 0.08)',
      hoverBg: 'rgba(71, 85, 105, 0.12)',
    },
  ];

  const isDisabled = disabled || (!data || data.length === 0);

  return (
    <div className="no-print">
      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setIsOpen(!isOpen)}
          disabled={isDisabled}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all duration-300 cursor-pointer"
          style={{
            background: isOpen
              ? 'linear-gradient(135deg, #0891b2, #0e7490)'
              : isDisabled
                ? 'var(--color-bg)'
                : 'var(--color-bg-card)',
            color: isOpen ? 'white' : isDisabled ? 'var(--color-border)' : 'var(--color-text)',
            border: `1px solid ${isOpen ? 'transparent' : 'var(--color-border)'}`,
            boxShadow: isOpen ? '0 8px 20px rgba(8,145,178,0.25)' : 'var(--shadow-premium)',
            opacity: isDisabled ? 0.5 : 1,
            cursor: isDisabled ? 'not-allowed' : 'pointer',
          }}
        >
          <Download size={16} />
          <span>تصدير التقرير</span>
          <ChevronDown
            size={14}
            className="transition-transform duration-300"
            style={{ transform: isOpen ? 'rotate(180deg)' : 'none' }}
          />
        </button>

        {isOpen && (
          <div
            className="absolute top-full mt-2 left-0 z-[100] w-72 max-w-[90vw] rounded-2xl overflow-hidden"
            style={{
              background: 'var(--color-bg-card)',
              border: '1px solid var(--color-border)',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(0,0,0,0.03)',
              animation: 'fadeIn 0.2s ease-out',
            }}
          >
            <div
              className="px-4 py-3 flex items-center justify-between"
              style={{ borderBottom: '1px solid var(--color-border)' }}
            >
              <span className="text-xs font-black uppercase tracking-widest" style={{ color: 'var(--color-text-muted)' }}>
                خيارات التصدير
              </span>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 rounded-lg hover:bg-[var(--color-bg)] transition-colors cursor-pointer"
                style={{ color: 'var(--color-text-muted)' }}
              >
                <X size={14} />
              </button>
            </div>

            <div className="p-2">
              {exportOptions.map((opt, i) => {
                if (opt.type === 'divider') {
                  return (
                    <div
                      key={`div-${i}`}
                      className="my-1 mx-2"
                      style={{ borderTop: '1px solid var(--color-border)' }}
                    />
                  );
                }
                const Icon = opt.icon;
                const isLoading = exporting === opt.key;
                return (
                  <button
                    key={opt.key}
                    onClick={() => opt.key === 'print' ? handlePrintClick() : handleExportClick(opt.key)}
                    disabled={isLoading}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 cursor-pointer group"
                    style={{
                      background: 'transparent',
                      border: 'none',
                      textAlign: 'right',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = opt.hoverBg; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-110"
                      style={{ background: opt.bgColor }}
                    >
                      {isLoading ? (
                        <div
                          className="w-4 h-4 border-2 rounded-full animate-spin"
                          style={{ borderColor: `${opt.color} transparent ${opt.color} transparent` }}
                        />
                      ) : (
                        <Icon size={18} style={{ color: opt.color }} />
                      )}
                    </div>
                    <div className="flex flex-col flex-1">
                      <span className="text-sm font-bold" style={{ color: 'var(--color-text)' }}>
                        {opt.label}
                      </span>
                      <span className="text-[10px] font-medium" style={{ color: 'var(--color-text-muted)' }}>
                        {opt.desc}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            <div
              className="px-4 py-2 text-center"
              style={{ borderTop: '1px solid var(--color-border)', background: 'var(--color-bg)' }}
            >
              <span className="text-[9px] font-bold" style={{ color: 'var(--color-text-muted)' }}>
                جميع الملفات المصدّرة تدعم اللغة العربية بالكامل
              </span>
            </div>
          </div>
        )}

        {/* Export Settings Modal (pre-export) */}
        <ExportSettingsModal
          isOpen={showExportSettings}
          onClose={() => { setShowExportSettings(false); setPendingExportType(null); }}
          exportType={pendingExportType}
          onConfirm={handleExportWithSettings}
          title={finalOptions.title || 'تقرير'}
          subtitle={finalOptions.subtitle || ''}
        />

        {/* Print Preview Modal */}
        <PrintPreviewModal
          isOpen={showPrintPreview}
          onClose={() => setShowPrintPreview(false)}
          title={finalOptions.title || 'تقرير'}
          subtitle={finalOptions.subtitle || ''}
          hierarchyLabel={finalOptions.hierarchyLabel || ''}
          signatures={finalOptions.signatures || {}}
          exportData={data}
          exportColumns={columns}
        >
          {/* Preview content — the actual data rendered as a table or multi-tables */}
          {finalOptions.tables && finalOptions.tables.length > 0 ? (
            <div style={{ fontSize: 'inherit' }} className="space-y-6">
              {finalOptions.tables.map((tbl, tblIdx) => (
                <div key={tblIdx} className="space-y-2">
                  {tbl.title && (
                    <h4 style={{ fontWeight: 800, fontSize: '1.1em', color: '#0891b2', margin: '12px 0 6px 0' }}>
                      {tbl.title}
                    </h4>
                  )}
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'inherit' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc', borderBottom: '2px solid #000' }}>
                        {tbl.columns.map((col, idx) => (
                          <th key={idx} style={{ padding: '8px 6px', border: '1px solid #ccc', textAlign: 'center', fontWeight: 700, fontSize: 'inherit' }}>
                            {col.header || col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {tbl.data.slice(0, 50).map((row, rowIdx) => (
                        <tr key={rowIdx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                          {tbl.columns.map((col, colIdx) => (
                            <td key={colIdx} style={{ padding: '6px 4px', border: '1px solid #e2e8f0', textAlign: 'center', fontSize: 'inherit' }}>
                              {col.render
                                ? col.render(row)
                                : col.exportAccessor
                                  ? (typeof col.exportAccessor === 'function' ? col.exportAccessor(row) : row[col.exportAccessor])
                                  : col.accessor
                                    ? (typeof col.accessor === 'function' ? col.accessor(row) : row[col.accessor])
                                    : '-'}
                            </td>
                          ))}
                        </tr>
                      ))}
                      {tbl.data.length > 50 && (
                        <tr>
                          <td colSpan={tbl.columns.length} style={{ padding: '12px', textAlign: 'center', color: '#94a3b8', fontSize: '10px', fontWeight: 700 }}>
                            ... وعرض {tbl.data.length - 50} صفاً إضافياً عند الطباعة
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          ) : data.length > 0 ? (
            <div style={{ fontSize: 'inherit' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'inherit' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '2px solid #000' }}>
                    {columns.map((col, idx) => (
                      <th key={idx} style={{ padding: '8px 6px', border: '1px solid #ccc', textAlign: 'center', fontWeight: 700, fontSize: 'inherit' }}>
                        {col.header || col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.slice(0, 50).map((row, rowIdx) => (
                    <tr key={rowIdx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                      {columns.map((col, colIdx) => (
                        <td key={colIdx} style={{ padding: '6px 4px', border: '1px solid #e2e8f0', textAlign: 'center', fontSize: 'inherit' }}>
                          {col.render
                            ? col.render(row)
                            : col.exportAccessor
                              ? (typeof col.exportAccessor === 'function' ? col.exportAccessor(row) : row[col.exportAccessor])
                              : col.accessor
                                ? (typeof col.accessor === 'function' ? col.accessor(row) : row[col.accessor])
                                : '-'}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {data.length > 50 && (
                    <tr>
                      <td colSpan={columns.length} style={{ padding: '12px', textAlign: 'center', color: '#94a3b8', fontSize: '10px', fontWeight: 700 }}>
                        ... وعرض {data.length - 50} صفاً إضافياً عند الطباعة
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          ) : null}
        </PrintPreviewModal>
      </div>
    </div>
  );
};

export default ExportMenuInner;
