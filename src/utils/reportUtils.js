/**
 * Build the full hierarchy label chain (فرع | منطقة | عيادة) for print
 * headers and the print preview, honoring the active workspace mode.
 *
 * Used by both ExportMenuInner (preview header) and the pages' print-only
 * PrintableTable blocks so the printed header always matches the preview.
 *
 * @param {string} workspaceMode   - 'branches' | 'areas' | 'clinics'
 * @param {Object} hierarchyNames  - { branch, area, clinic } from useGlobalApp
 * @returns {string} e.g. "فرع: سوهاج | منطقة: جرجا | عيادة: النور"
 */
export const buildHierarchyLabel = (workspaceMode, hierarchyNames = {}) => {
  const parts = [];
  if (hierarchyNames.branch) parts.push(`فرع: ${hierarchyNames.branch}`);
  if (hierarchyNames.area && (workspaceMode === 'areas' || workspaceMode === 'clinics')) parts.push(`منطقة: ${hierarchyNames.area}`);
  if (hierarchyNames.clinic && workspaceMode === 'clinics') parts.push(`عيادة: ${hierarchyNames.clinic}`);
  return parts.length > 0 ? parts.join(' | ') : 'جميع الفروع';
};

/**
 * Utility function to aggregate report records by specific keys (like item ID and price).
 * 
 * @param {Array} data - The raw records from the database.
 * @param {Array} matchKeys - Keys to identify unique groups (e.g. ['drug_id', 'unit_price']).
 * @param {Array} aggregateKeys - Numeric keys to sum up (e.g. ['quantity', 'cases_count', 'total_cost']).
 * @returns {Array} - Aggregated records.
 */
export const aggregateRecordsByPrice = (data, matchKeys, aggregateKeys) => {
  if (!data || !Array.isArray(data) || data.length === 0) return [];

  const map = new Map();

  data.forEach(item => {
    // Generate a unique key for grouping
    const keyParts = matchKeys.map(k => {
      let val = item[k];
      
      // Smart Rounding for prices/costs to handle floating point issues
      if (typeof val === 'number') {
        // If it looks like a price or cost field, round to 2 decimal places
        if (k.toLowerCase().includes('price') || k.toLowerCase().includes('cost') || k.toLowerCase().includes('value')) {
          return parseFloat(val.toFixed(2));
        }
      }
      return val;
    });
    
    const key = keyParts.join('|');

    if (map.has(key)) {
      const existing = map.get(key);
      aggregateKeys.forEach(ak => {
        // Handle potentially missing fields or strings that look like numbers
        const currentVal = parseFloat(item[ak]) || 0;
        const existingVal = parseFloat(existing[ak]) || 0;
        existing[ak] = existingVal + currentVal;
      });
    } else {
      // Create a shallow copy to avoid mutating the original data
      map.set(key, { ...item });
    }
  });

  return Array.from(map.values());
};
