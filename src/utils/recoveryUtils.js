// ─── Shared recovery-code helpers ──────────────────────────────────────────
// Copy + export a one-time recovery code. Used by the LoginPage (first-run
// setup + forgot-password flow) and the UserManagementPage (create/recreate).
// The code is never logged or persisted — the user copies it or saves it to
// a file they choose.
import { saveFileWithDialog } from './exportHelpers';

/**
 * Copy a recovery code to the clipboard with a legacy fallback.
 * @param {string} code
 * @param {(msg: string, type?: 'success'|'error') => void} notify
 */
export const copyRecoveryCode = async (code, notify) => {
  try {
    await navigator.clipboard.writeText(code);
    notify('تم نسخ رمز الاسترداد', 'success');
  } catch {
    const ta = document.createElement('textarea');
    ta.value = code;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      notify('تم نسخ رمز الاسترداد', 'success');
    } catch {
      notify('تعذر النسخ — انسخ الرمز يدوياً', 'error');
    }
    document.body.removeChild(ta);
  }
};

/**
 * Export the recovery code to a plain-text file the user chooses.
 * In Tauri the native Save dialog (show_save_dialog) is opened so the user
 * picks the location — never a silent download. Falls back to a browser
 * download in plain web/dev mode. Returns true when a file was saved,
 * false when the user cancelled.
 * @param {string} code
 * @param {string} username
 * @param {(msg: string, type?: 'success'|'error') => void} notify
 * @returns {Promise<boolean>}
 */
export const exportRecoveryCode = async (code, username, notify) => {
  const text = [
    'رمز استرداد كلمة المرور — منظومة إحصائيات الأدوية',
    '──────────────────────────────────────────',
    '',
    `اسم المستخدم: ${username || 'admin'}`,
    `رمز الاسترداد: ${code}`,
    '',
    'احفظ هذا الملف في مكان آمن. يُستخدم الرمز مرة واحدة',
    'لاستعادة الوصول إلى الحساب إذا نسيت كلمة المرور.',
    'بعد استخدامه يُبطَل تلقائياً ويُصدَر رمز جديد.',
    '',
    `تاريخ الإنشاء: ${new Date().toLocaleString('ar-EG')}`,
  ].join('\n');

  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const saved = await saveFileWithDialog(
    blob,
    `recovery-${username || 'admin'}.txt`,
    'Text File',
    'txt',
  );
  if (saved) {
    notify('تم تصدير رمز الاسترداد إلى ملف نصي', 'success');
  }
  return saved;
};

/**
 * Build the standard warning text shown when a recovery code is displayed.
 * @returns {string}
 */
export const RECOVERY_WARNING = 'احفظ رمز الاسترداد في مكان آمن. يمكن استخدامه لاستعادة الوصول إلى حساب المدير إذا نسيت كلمة المرور. فقدان رمز الاسترداد قد يمنع استعادة الحساب.';
