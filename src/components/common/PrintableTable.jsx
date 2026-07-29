import React from 'react';
import useReportSignatures from '../../hooks/useReportSignatures';
import useExportPresets from '../../hooks/useExportPresets';

/**
 * PrintableTable — Professional print-optimized wrapper.
 *
 * Adds print header (org name, report title, month, hierarchy level),
 * smart signature footer (preparer / reviewer / director), and
 * hooks into the unified print CSS system.
 *
 * Wrap any table content with this component for print-ready output.
 * Only visible in @media print. Hidden on screen.
 *
 * Features:
 *   - Reads data-print-* attributes from <html> for dynamic styling
 *   - Page counter via CSS @page @bottom-center
 *   - Dynamic hierarchy label from context
 *   - Print button that opens unified PrintPreviewModal
 *   - Uses saved report signatures (preparer/manager names) from DB
 *
 * @param {string} title       - Report title
 * @param {string} subtitle    - Optional subtitle (e.g. month, branch)
 * @param {string} orgName     - Organization name (default from app)
 * @param {boolean} showSignatures - Show signature fields (default: true)
 * @param {string} hierarchyLabel - Hierarchy context (e.g. "فرع: القاهرة")
 * @param {React.ReactNode} children - Table content to wrap
 */
const PrintableTable = ({
  title = 'تقرير',
  subtitle = '',
  orgName = 'الهيئة العامة للتأمين الصحي',
  showSignatures = true,
  hierarchyLabel = '',
  children,
}) => {
  const { signatures } = useReportSignatures();
  const { presets } = useExportPresets();
  // Prefer default preset from export_presets (multi-preset system), fall back to report_signatures
  const defaultPreset = presets.find(p => p.is_default);
  const effectiveSignatures = {
    preparerName: defaultPreset?.preparer_name || signatures.preparerName || '',
    managerName: defaultPreset?.manager_name || signatures.managerName || '',
    approvalNumber: defaultPreset?.approval_number || signatures.approvalNumber || '',
  };
  return (
    <>
      {/* ── Print Header — only shows in @media print ── */}
      <div className="only-print print-header" style={{ breakInside: 'avoid', marginBottom: '16px' }}>
        <div style={{ textAlign: 'center', borderBottom: '2px solid #000', paddingBottom: '8px', marginBottom: '8px' }}>
          <h1 style={{ fontSize: '16px', fontWeight: 900, margin: '0 0 2px', color: '#000' }}>
            {orgName}
          </h1>
          <h2 style={{ fontSize: '14px', fontWeight: 700, margin: '0 0 2px', color: '#000' }}>
            {title}
          </h2>
          {subtitle && (
            <p style={{ fontSize: '10px', color: '#475569', margin: '2px 0' }}>
              {subtitle}
            </p>
          )}
          {hierarchyLabel && (
            <p style={{ fontSize: '9px', color: '#64748b', margin: '2px 0' }}>
              {hierarchyLabel}
            </p>
          )}
          <p style={{ fontSize: '9px', color: '#94a3b8', margin: '2px 0' }}>
            تاريخ الطباعة: {new Date().toLocaleDateString('ar-EG')}
          </p>
        </div>
      </div>

      {/* ── Table Content ── */}
      <div className="print-content">
        {children}
      </div>

      {/* ── Print Footer — Smart Signatures ── */}
      {showSignatures && (
        <>
        <div
          className="only-print print-footer-signatures print-footer-unified"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            textAlign: 'center',
            marginTop: '24px',
            paddingTop: '12px',
            borderTop: '2px solid #94a3b8',
            breakInside: 'avoid',
            pageBreakInside: 'avoid',
          }}
        >
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: '10px', fontWeight: 700, textDecoration: 'underline', color: '#475569', marginBottom: '24px' }}>
              مُعد التقرير
            </p>
            <p style={{ fontSize: '9px', color: '#475569', fontWeight: 600 }}>
              الاسم: {effectiveSignatures.preparerName || '...........................'}
            </p>
            <p style={{ fontSize: '9px', color: '#94a3b8' }}>التوقيع: ..........................</p>
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: '10px', fontWeight: 700, textDecoration: 'underline', color: '#475569', marginBottom: '24px' }}>
              مدير الصيدلية / الإدارة
            </p>
            <p style={{ fontSize: '9px', color: '#475569', fontWeight: 600 }}>
              الاسم: {effectiveSignatures.managerName || '...........................'}
            </p>
            <p style={{ fontSize: '9px', color: '#94a3b8' }}>التوقيع: ..........................</p>
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: '10px', fontWeight: 700, textDecoration: 'underline', color: '#475569', marginBottom: '24px' }}>
              رقم الاعتماد
            </p>
            <p style={{ fontSize: '9px', color: '#475569', fontWeight: 600 }}>
              {effectiveSignatures.approvalNumber || '...........................'}
            </p>
            <p style={{ fontSize: '9px', color: '#475569', fontWeight: 600, marginTop: '12px' }}>
              التاريخ: {new Date().toLocaleDateString('ar-EG')}
            </p>
          </div>
        </div>
        {/* Stamp line — full width below the 3 columns */}
        <div className="only-print" style={{ textAlign: 'center', marginTop: '16px', paddingTop: '8px', borderTop: '1px dashed #cbd5e1' }}>
          <p style={{ fontSize: '9px', color: '#94a3b8' }}>
            ختم الإدارة: ........................................................
          </p>
        </div>
        </>
      )}
    </>
  );
};

export default PrintableTable;
