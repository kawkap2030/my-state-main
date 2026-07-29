import { useState, useEffect, useCallback } from 'react';
import invoke from '../api/tauriApi';
import { useAuth } from '../context/AuthContext';

/**
 * useReportSignatures — Manage digital signatures for reports.
 *
 * Features:
 *   - Loads saved signatures from DB on mount
 *   - Provides save function that persists to DB
 *   - Auto-fills preparer name from current user (if empty)
 *   - Uses current user as preparer default
 */
const useReportSignatures = () => {
  const { user } = useAuth();
  const [signatures, setSignatures] = useState({
    preparerName: '',
    managerName: '',
    approvalNumber: '',
    updatedAt: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // ── Load signatures from DB ─────────────────────────────────────────
  const loadSignatures = useCallback(async () => {
    setLoading(true);
    try {
      const data = await invoke('get_report_signatures');
      setSignatures({
        preparerName: data.preparer_name || '',
        managerName: data.manager_name || '',
        approvalNumber: data.approval_number || '',
        updatedAt: data.updated_at || '',
      });
    } catch (err) {
      console.warn('Failed to load report signatures:', err);
      // Use defaults on failure
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSignatures();
  }, [loadSignatures]);

  // ── Auto-fill preparer from current user ────────────────────────────
  const getDefaultPreparer = useCallback(() => {
    return signatures.preparerName || user?.username || '';
  }, [signatures.preparerName, user]);

  // ── Save signatures to DB ───────────────────────────────────────────
  const saveSignatures = useCallback(async (data) => {
    setSaving(true);
    try {
      const result = await invoke('save_report_signatures', {
        preparerName: data.preparerName || '',
        managerName: data.managerName || '',
        approvalNumber: data.approvalNumber || '',
      });
      setSignatures({
        preparerName: result.preparer_name || '',
        managerName: result.manager_name || '',
        approvalNumber: result.approval_number || '',
        updatedAt: result.updated_at || '',
      });
      return true;
    } catch (err) {
      console.error('Failed to save report signatures:', err);
      throw err;
    } finally {
      setSaving(false);
    }
  }, []);

  // ── Clear all signatures ────────────────────────────────────────────
  const clearSignatures = useCallback(async () => {
    try {
      await invoke('save_report_signatures', {
        preparerName: '',
        managerName: '',
        approvalNumber: '',
      });
      setSignatures({
        preparerName: '',
        managerName: '',
        approvalNumber: '',
        updatedAt: new Date().toISOString(),
      });
      return true;
    } catch (err) {
      console.error('Failed to clear signatures:', err);
      throw err;
    }
  }, []);

  return {
    signatures,
    loading,
    saving,
    loadSignatures,
    saveSignatures,
    clearSignatures,
    getDefaultPreparer,
  };
};

export default useReportSignatures;
