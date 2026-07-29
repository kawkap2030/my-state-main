import { useState, useEffect, useCallback } from 'react';
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

  const [presets, setPresets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activePresetId, setActivePresetId] = useState(null);

  // ── Load presets (filtered by user_id + scope) ──────────────────────
  const loadPresets = useCallback(async () => {
    setLoading(true);
    try {
      const data = await invoke('get_export_presets', {
        userId,
        isAdmin,
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
  }, [userId, isAdmin]);

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
    // Admin can delete any preset; users can delete their own
    return isAdmin || (userId && preset.user_id === userId);
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
    canDelete,
    canChangeScope,
  };
};

export default useExportPresets;
