import { useState, useEffect, useCallback, useRef } from 'react';
import invoke from '../api/tauriApi';
import { useAuth } from '../context/AuthContext';

/**
 * useExportPresets — Manage named export presets with user/scope support.
 *
 * Features:
 *   - User-specific presets (private) vs admin-shared presets (public)
 *   - Admin sees all presets; regular users see public + their own private
 *   - Save/load/delete preset bundles
 *   - Default preset detection
 */
const useExportPresets = () => {
  const { user } = useAuth();
  const userId = user?.id || null;
  const isAdmin = user?.role === 'admin';
  // ═══ Refs for loadPresets (stable reference, no cascade) ═══
  // loadPresets uses refs instead of closure variables so the
  // useCallback can have empty deps, preventing the cascade of
  // 10+ get_export_presets calls during startup.
  const userIdRef = useRef(userId);
  const isAdminRef = useRef(isAdmin);
  userIdRef.current = userId;
  isAdminRef.current = isAdmin;

  const [presets, setPresets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activePresetId, setActivePresetId] = useState(null);

  // ── Load presets (filtered by user_id + scope) ──────────────────────
  // NOTE: Empty deps — function reference is STABLE, never triggers re-run.
  // Uses refs for latest userId/isAdmin.
  const loadPresets = useCallback(async () => {
    setLoading(true);
    try {
      const data = await invoke('get_export_presets', {
        userId: userIdRef.current,
        isAdmin: isAdminRef.current,
      });
      setPresets(data);
      // Set active preset: prefer default, else first preset
      const defaultPreset = data.find(p => p.is_default);
      if (defaultPreset) {
        setActivePresetId(defaultPreset.id);
      } else if (data.length > 0) {
        setActivePresetId(data[0].id);
      }
    } catch (err) {
      console.warn('Failed to load export presets:', err);
    } finally {
      setLoading(false);
    }
  }, []); // <-- empty deps: STABLE reference, no cascade!

  useEffect(() => {
    loadPresets();
  }, [loadPresets]);

  // ── Get a preset by ID ──────────────────────────────────────────────
  const getPresetById = useCallback((id) => {
    return presets.find(p => p.id === id) || null;
  }, [presets]);

  // ── Get active preset ───────────────────────────────────────────────
  const getActivePreset = useCallback(() => {
    return presets.find(p => p.id === activePresetId) || presets[0] || null;
  }, [presets, activePresetId]);

  // ── Map DB preset → settings format ─────────────────────────────────
  const presetToSettings = useCallback((preset) => {
    if (!preset) return null;
    return {
      orientation: preset.orientation || 'landscape',
      marginPreset: preset.margin_preset || 'standard',
      showPageNumbers: Boolean(preset.show_page_numbers),
      showSignatures: Boolean(preset.show_signatures),
      signatures: {
        preparerName: preset.preparer_name || '',
        managerName: preset.manager_name || '',
        approvalNumber: preset.approval_number || '',
      },
    };
  }, []);

  // ── Check if current user can delete this preset ────────────────────
  const canDelete = useCallback((preset) => {
    if (!preset) return false;
    // Admin can delete any preset
    if (isAdmin) return true;
    // Users can delete their own presets
    if (userId && preset.user_id === userId) return true;
    // Legacy presets (user_id === null) are deletable by everyone (created before user tracking)
    if (preset.user_id === null || preset.user_id === undefined) return true;
    return false;
  }, [isAdmin, userId]);

  // ── Alias: canChangeScope always true for admins (scope logic in backend) ──
  const canChangeScope = isAdmin;

  // ── Save preset ─────────────────────────────────────────────────────
  const savePreset = useCallback(async (data) => {
    setSaving(true);
    try {
      const result = await invoke('save_export_preset', {
        name: data.name,
        userId: userId,
        scope: data.scope || 'private',
        orientation: data.orientation || 'landscape',
        marginPreset: data.marginPreset || 'standard',
        showPageNumbers: data.showPageNumbers !== false,
        showSignatures: data.showSignatures !== false,
        preparerName: data.preparerName || '',
        managerName: data.managerName || '',
        approvalNumber: data.approvalNumber || '',
        isDefault: data.isDefault || false,
        presetId: data.id || null,   // Pass preset ID for rename operations
      });
      await loadPresets();
      if (result.is_default) setActivePresetId(result.id);
      return result;
    } catch (err) {
      console.error('Failed to save export preset:', err);
      throw err;
    } finally {
      setSaving(false);
    }
  }, [userId, loadPresets]);

  // ── Delete preset ───────────────────────────────────────────────────
  const deletePreset = useCallback(async (id) => {
    try {
      await invoke('delete_export_preset', { id });
      await loadPresets();
      if (activePresetId === id) setActivePresetId(null);
    } catch (err) {
      console.error('Failed to delete export preset:', err);
      throw err;
    }
  }, [loadPresets, activePresetId]);

  // ── Set default preset ──────────────────────────────────────────────
  const setDefaultPreset = useCallback(async (id) => {
    try {
      await invoke('set_default_export_preset', { id });
      setActivePresetId(id);
      await loadPresets();
    } catch (err) {
      console.error('Failed to set default preset:', err);
      throw err;
    }
  }, [loadPresets]);

  // ── Reorder presets (drag & drop) ───────────────────────────────────
  const reorderPresets = useCallback(async (orderedIds) => {
    try {
      await invoke('reorder_export_presets', { orderedIds });
      // Reload to get updated timestamps/order
      await loadPresets();
    } catch (err) {
      console.error('Failed to reorder presets:', err);
      throw err;
    }
  }, [loadPresets]);

  return {
    presets,
    loading,
    saving,
    activePresetId,
    setActivePresetId,
    user: { id: userId, isAdmin },
    loadPresets,
    getPresetById,
    getActivePreset,
    presetToSettings,
    savePreset,
    deletePreset,
    setDefaultPreset,
    reorderPresets,
    canDelete,
    canChangeScope,
  };
};

export default useExportPresets;
