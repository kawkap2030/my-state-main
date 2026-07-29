/**
 * Export Engine — Unified Barrel
 *
 * This file re-exports all exports from the individual export modules
 * so that existing imports (import { exportToExcel } from '../utils/exportUtils')
 * continue to work without changes.
 *
 * For best performance, new code should import directly from the
 * individual modules:
 *   import { exportToExcel } from '../utils/exportExcel';
 *   import { exportToPDF } from '../utils/exportPdf';
 * This allows Vite to tree-shake unused imports and reduces bundle size.
 */

// Shared helpers
export {
  saveFileWithDialog,
  extractCellValue,
  extractTextFromReactElement,
  buildDataMatrix,
  timestamp,
  LOGO_BASE64,
  DESIGNER_BASE64,
} from './exportHelpers';

// Excel exports
export { exportToExcel, exportMultiSheetExcel } from './exportExcel';

// Word export
export { exportToWord } from './exportWord';

// PDF export
export { exportToPDF } from './exportPdf';

// Print helpers
export { executePrint, printReport } from './exportPrint';
