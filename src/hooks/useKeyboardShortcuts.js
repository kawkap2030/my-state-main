import { useEffect } from 'react';

/**
 * Custom Hook: useKeyboardShortcuts
 * 
 * Registers global keyboard shortcuts and automatically cleans up on unmount.
 * 
 * @param {Array} shortcuts - Array of { key, ctrl, alt, shift, handler, description }
 * @param {boolean} enabled - Whether shortcuts are active (default: true)
 * 
 * @example
 * useKeyboardShortcuts([
 *   { key: 'n', alt: true, handler: () => focusFirstInput(), description: 'سجل جديد' },
 *   { key: 'p', ctrl: true, handler: () => window.print(), description: 'طباعة' },
 *   { key: 'Escape', handler: () => cancelEdit(), description: 'إلغاء التعديل' },
 *   { key: 'Enter', ctrl: true, handler: () => saveRecord(), description: 'حفظ' },
 * ]);
 */
const useKeyboardShortcuts = (shortcuts = [], enabled = true) => {
  useEffect(() => {
    if (!enabled || shortcuts.length === 0) return;

    const handleKeyDown = (e) => {
      // Don't trigger shortcuts when typing in inputs/textareas (unless it's Escape)
      const tagName = e.target.tagName.toLowerCase();
      const isInputFocused = tagName === 'input' || tagName === 'textarea' || tagName === 'select';

      for (const shortcut of shortcuts) {
        const keyMatch = e.key === shortcut.key || e.key.toLowerCase() === shortcut.key?.toLowerCase();
        const ctrlMatch = !!shortcut.ctrl === (e.ctrlKey || e.metaKey);
        const altMatch = !!shortcut.alt === e.altKey;
        const shiftMatch = !!shortcut.shift === e.shiftKey;

        if (keyMatch && ctrlMatch && altMatch && shiftMatch) {
          // Allow Escape and Ctrl+P even in inputs
          const alwaysAllow = shortcut.key === 'Escape' || (shortcut.ctrl && shortcut.key === 'p');
          
          if (isInputFocused && !alwaysAllow && !shortcut.allowInInput) {
            continue;
          }

          e.preventDefault();
          e.stopPropagation();
          shortcut.handler(e);
          return;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [shortcuts, enabled]);
};

export default useKeyboardShortcuts;
