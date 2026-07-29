/**
 * Shared helpers for the Export Engine.
 * Extracted from the unified exportUtils.js to enable code-splitting.
 */
import { saveAs } from 'file-saver';
import { LOGO_BASE64, DESIGNER_BASE64 } from '../assets/imageConstants';
import invoke from '../api/tauriApi';

// ═══════════════════════════════════════════════════════════════════════════
// SAVE FILE (Tauri Native Dialog → Browser Fallback)
// ═══════════════════════════════════════════════════════════════════════════

export const saveFileWithDialog = async (bufferOrBlob, defaultFileName, extensionName, extension) => {
  const isTauri = typeof window !== 'undefined' && (!!window.__TAURI__ || !!window.__TAURI_INTERNALS__);

  if (isTauri) {
    try {
      const savePath = await invoke('show_save_dialog', {
        defaultName: defaultFileName,
        extensionName,
        extension,
      });

      if (!savePath) return false;

      let bytes;
      if (bufferOrBlob instanceof Blob) {
        const arrayBuffer = await bufferOrBlob.arrayBuffer();
        bytes = Array.from(new Uint8Array(arrayBuffer));
      } else if (bufferOrBlob instanceof ArrayBuffer) {
        bytes = Array.from(new Uint8Array(bufferOrBlob));
      } else if (bufferOrBlob instanceof Uint8Array) {
        bytes = Array.from(bufferOrBlob);
      } else {
        bytes = Array.from(new Uint8Array(bufferOrBlob));
      }

      await invoke('write_binary_file', { path: savePath, contents: bytes });
      return true;
    } catch (err) {
      console.warn('Tauri save dialog error, falling back to browser download:', err);
    }
  }

  const blob = bufferOrBlob instanceof Blob ? bufferOrBlob : new Blob([bufferOrBlob]);
  saveAs(blob, defaultFileName);
  return true;
};

// ═══════════════════════════════════════════════════════════════════════════
// CELL VALUE EXTRACTION
// ═══════════════════════════════════════════════════════════════════════════

/** Extracts plain text from table data using column definitions. */
export const extractCellValue = (row, col) => {
  if (col.exportAccessor) {
    return typeof col.exportAccessor === 'function'
      ? col.exportAccessor(row)
      : row[col.exportAccessor];
  }
  if (col.accessor && typeof col.accessor === 'string') {
    return row[col.accessor] ?? '';
  }
  if (typeof col.accessor === 'function') {
    return extractTextFromReactElement(col.accessor(row));
  }
  if (col.render) {
    return extractTextFromReactElement(col.render(row));
  }
  return '';
};

/** Recursively extracts plain text from React elements / JSX. */
export const extractTextFromReactElement = (element) => {
  if (element == null) return '';
  if (typeof element === 'string' || typeof element === 'number') return String(element);
  if (typeof element === 'boolean') return '';
  if (Array.isArray(element)) return element.map(extractTextFromReactElement).join(' ');
  if (element.props) {
    const { children } = element.props;
    if (children == null) return '';
    if (typeof children === 'string' || typeof children === 'number') return String(children);
    if (Array.isArray(children)) return children.map(extractTextFromReactElement).join(' ').trim();
    return extractTextFromReactElement(children);
  }
  return String(element);
};

/** Build plain data matrix: [ [header1, header2, ...], [val1, val2, ...], ... ] */
export const buildDataMatrix = (data, columns) => {
  const headers = columns.map(c => c.header || '');
  const rows = data.map(row => {
    if (row.isGroupHeader) {
      return { isGroupHeader: true, groupName: row.groupName || 'التصنيف' };
    }
    return columns.map(col => {
      const val = extractCellValue(row, col);
      return val != null ? String(val).replace(/\s+/g, ' ').trim() : '';
    });
  });
  return { headers, rows };
};

/** Generate a timestamp string for filenames */
export const timestamp = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Re-export constants for use by sub-modules */
export { LOGO_BASE64, DESIGNER_BASE64 };
