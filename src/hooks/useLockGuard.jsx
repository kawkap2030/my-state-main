/**
 * useLockGuard — Reusable hook for lock-aware operations.
 *
 * Checks whether a given dispense month is locked and provides
 * utility functions for guarded save/submit operations.
 *
 * Usage:
 *   const { isLocked, checkAndWarn, LockBanner } = useLockGuard(dispenseMonth);
 *
 *   // Show warning banner above the form:
 *   return (<><LockBanner /> <form>...</form></>);
 *
 *   // Guard a save operation:
 *   const handleSave = () => {
 *     if (checkAndWarn()) return; // Shows toast, blocks save
 *     // ... proceed with save
 *   };
 */
import { useCallback, useMemo } from 'react';
import { useGlobalApp } from '../context/useGlobalApp';
import { useToast } from '../components/ui/Toast';
import LockNotificationBanner from '../components/common/LockNotificationBanner';
import { isMonthLocked } from '../utils/dateUtils';

/**
 * Returns the lock status for a given dispense month.
 *
 * @param {string} dispenseMonth - The month to check (YYYY-MM format)
 * @param {object} [options]
 * @param {boolean} [options.checkBackend=true] - Also check the backend isolation rules
 * @param {string} [options.branchId] - Branch ID for isolation check
 * @returns {{ isLocked, isManual, isSmart, isLoading, statusLabel, checkAndWarn, LockBanner, guardSubmit }}
 */
const useLockGuard = (dispenseMonth, _options = {}) => {

  const {
    manualLockedMonths,
    isMasterUnlocked,
  } = useGlobalApp();
  const toast = useToast();

  // ── Compute lock status ────────────────────────────────────────────────
  const lockStatus = useMemo(() => {
    if (!dispenseMonth) {
      return { isLocked: false, isManual: false, isSmart: false };
    }

    // Master unlock bypasses all locks
    if (isMasterUnlocked) {
      return { isLocked: false, isManual: false, isSmart: false };
    }

    // Manual lock (from DB manual_locked_months table)
    const manual = manualLockedMonths[dispenseMonth];
    if (manual !== undefined) {
      return { isLocked: manual, isManual: true, isSmart: false };
    }

    // Smart lock (4-month rule)
    const smart = isMonthLocked(dispenseMonth);
    if (smart) {
      return { isLocked: true, isManual: false, isSmart: true };
    }

    return { isLocked: false, isManual: false, isSmart: false };
  }, [dispenseMonth, manualLockedMonths, isMasterUnlocked]);

  // ── Additional isolation level lock ────────────────────────────────────
  // (This is checked in the backend, not here)

  // ── Status label (Arabic) ──────────────────────────────────────────────
  const statusLabel = useMemo(() => {
    const { isLocked, isManual, isSmart } = lockStatus;
    if (!isLocked) return 'مفتوح';
    if (isManual) return 'مغلق يدوياً';
    if (isSmart) return 'مغلق تلقائياً';
    return 'مغلق';
  }, [lockStatus]);

  // ── Guard: show warning toast and return true if locked ────────────────
  const checkAndWarn = useCallback(() => {
    if (!lockStatus.isLocked) return false;

    const msg = lockStatus.isManual
      ? `شهر ${dispenseMonth} مقفل يدوياً. قم بفتح القفل من شاشة إدارة الأقفال.`
      : `شهر ${dispenseMonth} مقفل تلقائياً (مر عليه 4 أشهر). قم بفتح القفل من شاشة إدارة الأقفال.`;

    toast.warning(`🔒 ${msg}`);
    return true;
  }, [lockStatus, dispenseMonth, toast]);

  // ── Guard: wrap a save/submit operation ────────────────────────────────
  const guardSubmit = useCallback(async (actionFn) => {
    if (checkAndWarn()) return null;
    try {
      return await actionFn();
    } catch (err) {
      toast.error(`❌ ${err}`);
      return null;
    }
  }, [checkAndWarn, toast]);

  // ── LockNotificationBanner pre-configured ──────────────────────────────
  const LockBanner = useCallback(() => {
    if (!lockStatus.isLocked) return null;
    return (
      <LockNotificationBanner
        dispenseMonth={dispenseMonth}
        isLocked={lockStatus.isLocked}
        isManual={lockStatus.isManual}
        isSmart={lockStatus.isSmart}
      />
    );
  }, [lockStatus, dispenseMonth]);

  return {
    ...lockStatus,
    statusLabel,
    checkAndWarn,
    guardSubmit,
    LockBanner,
  };
};

export default useLockGuard;
