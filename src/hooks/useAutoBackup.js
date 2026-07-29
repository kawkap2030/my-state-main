import { useCallback } from 'react';
import invoke from '../api/tauriApi';
import { useSmartNotification } from '../context/SmartNotificationContext';

/**
 * useAutoBackup — Call auto-backup before critical save operations.
 *
 * Usage:
 *   const { backupBeforeSave, triggerBackup } = useAutoBackup();
 *
 *   // Auto-backup then save:
 *   await backupBeforeSave(async () => {
 *     await invoke('save_monthly_drugs_dispensed', { ... });
 *   });
 *
 *   // Just backup (no save wrapper):
 *   await triggerBackup();
 */
export function useAutoBackup() {
  const { info, warning } = useSmartNotification();

  /**
   * Trigger an auto-backup now.  Returns the backup filename
   * or null if the backup failed.
   */
  const triggerBackup = useCallback(async () => {
    try {
      const filename = await invoke('auto_backup', { maxBackups: 30 });
      console.log('[auto-backup] created:', filename);
      return filename;
    } catch (err) {
      console.warn('[auto-backup] failed:', err);
      return null;
    }
  }, []);

  /**
   * Runs an auto-backup before executing `saveFn`.
   * Shows a toast and proceeds with the save even if the backup fails.
   */
  const backupBeforeSave = useCallback(
    async (saveFn, { showToast = true } = {}) => {
      const filename = await triggerBackup();
      if (filename && showToast) {
        info(`✅ تم إنشاء نسخة احتياطية تلقائية`, {
          duration: 3000,
          dedupKey: 'auto-backup',
          persistInHistory: false,
        });
      } else if (!filename && showToast) {
        warning('⚠️ تعذر إنشاء النسخة الاحتياطية — تم متابعة الحفظ', {
          duration: 3000,
          dedupKey: 'auto-backup-fail',
          persistInHistory: false,
        });
      }
      // Always proceed with the save operation
      return saveFn();
    },
    [triggerBackup, info, warning],
  );

  return { triggerBackup, backupBeforeSave };
}

export default useAutoBackup;
