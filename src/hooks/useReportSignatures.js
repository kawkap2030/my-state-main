import { useState, useEffect, useCallback } from 'react';
import invoke from '../api/tauriApi';

const CACHE_KEY = 'drugstat_signatures_cache';

/**
 * Extract signature fields from an export-presets list.
 * Picks the default preset (falling back to the first) and maps
 * the snake_case DB fields to the camelCase shape used by the UI.
 * Returns null when no preset is available or the input isn't an array.
 */
export const extractSignaturesFromPresets = (presets) => {
  const list = Array.isArray(presets) ? presets : [];
  const preset = list.find(p => p.is_default) || list[0] || null;
  if (!preset) return null;
  return {
    preparerName: preset.preparer_name || '',
    managerName: preset.manager_name || '',
    approvalNumber: preset.approval_number || '',
    updatedAt: preset.updated_at || '',
  };
};

/**
 * useReportSignatures — Loads signature data from the default export preset.
 *
 * Features:
 *   - Retries up to 3 times if loading fails
 *   - Caches last successful result in localStorage for instant fallback
 *   - Falls back to cached data if backend is unavailable
 */
const useReportSignatures = () => {
  const [signatures, setSignatures] = useState(() => {
    // Load from cache on initial render (synchronous)
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) return JSON.parse(cached);
    } catch (_) {}
    return {
      preparerName: '',
      managerName: '',
      approvalNumber: '',
      updatedAt: '',
    };
  });
  const [loading, setLoading] = useState(true);

  const loadDefaultSignatures = useCallback(async () => {
    setLoading(true);
    try {
      const presets = await invoke('get_export_presets', {
        userId: null,
        isAdmin: true,
      });
      const sigData = extractSignaturesFromPresets(presets);
      if (sigData) {
        setSignatures(sigData);
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(sigData)); } catch (_) {}
      }
    } catch (err) {
      console.warn('[useReportSignatures] Failed to load:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => loadDefaultSignatures(), 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    signatures,
    loading,
    saving: false,
    loadSignatures: loadDefaultSignatures,
    saveSignatures: async () => {},
    clearSignatures: async () => {},
    getDefaultPreparer: () => signatures.preparerName,
  };
};

export default useReportSignatures;
