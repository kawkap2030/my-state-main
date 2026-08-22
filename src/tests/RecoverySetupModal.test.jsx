import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import RecoverySetupModal from '../components/ui/RecoverySetupModal';
import { shouldShowLegacyRecovery } from '../components/layout/AppLayout';
import invoke from '../api/tauriApi';

// ─── Hoisted mocks shared between the module mock factories and tests ──
const { markRecoveryConfigured } = vi.hoisted(() => ({
  markRecoveryConfigured: vi.fn(),
}));

const { copyRecoveryCode, exportRecoveryCode } = vi.hoisted(() => ({
  copyRecoveryCode: vi.fn(),
  exportRecoveryCode: vi.fn(),
}));

// The component uses useAuth/useToast and the shared recovery helpers.
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: { username: 'admin', has_recovery_code: false },
    markRecoveryConfigured,
  }),
}));

vi.mock('../components/ui/Toast', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

vi.mock('../utils/recoveryUtils', () => ({
  copyRecoveryCode,
  exportRecoveryCode,
  RECOVERY_WARNING: 'احفظ رمز الاسترداد في مكان آمن.',
}));

const TEST_CODE = 'TEST-CODE-AAAA-BBBB-CCCC-DDDD';
const CURRENT_PASSWORD_PLACEHOLDER = /كلمة المرور الحالية/;

beforeEach(() => {
  // The global tauriApi mock (setup.js) is a vi.fn — reset calls + impl so
  // every test configures exactly the behavior it needs.
  invoke.mockReset();
  markRecoveryConfigured.mockClear();
  copyRecoveryCode.mockClear();
  exportRecoveryCode.mockClear();
});

const enterPasswordAndSubmit = (password = 'Pass1234') => {
  fireEvent.change(screen.getByPlaceholderText(CURRENT_PASSWORD_PLACEHOLDER), {
    target: { value: password },
  });
  fireEvent.click(screen.getByRole('button', { name: 'إنشاء رمز الاسترداد' }));
};

describe('RecoverySetupModal (Legacy mode)', () => {
  it('TEST 1: legacy mode displays the Recovery warning', () => {
    render(<RecoverySetupModal isOpen legacyMode onClose={vi.fn()} />);
    expect(screen.getByText(/حسابك لا يحتوي على رمز استرداد لكلمة المرور/)).toBeInTheDocument();
    expect(screen.getByText(/يُنصح بإنشاء رمز استرداد الآن/)).toBeInTheDocument();
  });

  it('TEST 2: "إنشاء رمز الاسترداد" action proceeds to password entry and calls create_recovery_code', async () => {
    invoke.mockResolvedValue(TEST_CODE);
    render(<RecoverySetupModal isOpen legacyMode onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'إنشاء رمز الاسترداد' })).toBeInTheDocument();

    enterPasswordAndSubmit();
    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('create_recovery_code', {
        username: 'admin',
        currentPassword: 'Pass1234',
      });
    });
  });

  it('TEST 3: wrong current password rejects and does not create a Recovery Code', async () => {
    invoke.mockRejectedValue('كلمة المرور الحالية غير صحيحة');
    render(<RecoverySetupModal isOpen legacyMode onClose={vi.fn()} />);

    enterPasswordAndSubmit('wrong-password');
    await screen.findByText(/كلمة المرور الحالية غير صحيحة/);
    expect(screen.queryByText(TEST_CODE)).not.toBeInTheDocument();
    expect(markRecoveryConfigured).not.toHaveBeenCalled();
  });

  it('TEST 4+6: correct current password creates and displays the Recovery Code once', async () => {
    invoke.mockResolvedValue(TEST_CODE);
    render(<RecoverySetupModal isOpen legacyMode onClose={vi.fn()} />);

    enterPasswordAndSubmit();
    const codeEl = await screen.findByText(TEST_CODE);
    expect(codeEl).toBeInTheDocument();
    expect(invoke).toHaveBeenCalledWith('create_recovery_code', {
      username: 'admin',
      currentPassword: 'Pass1234',
    });
  });

  it('TEST 5: markRecoveryConfigured is called after successful creation', async () => {
    invoke.mockResolvedValue(TEST_CODE);
    render(<RecoverySetupModal isOpen legacyMode onClose={vi.fn()} />);

    enterPasswordAndSubmit();
    await screen.findByText(TEST_CODE);
    expect(markRecoveryConfigured).toHaveBeenCalledTimes(1);
  });

  it('TEST 7: copy functionality remains available', async () => {
    invoke.mockResolvedValue(TEST_CODE);
    render(<RecoverySetupModal isOpen legacyMode onClose={vi.fn()} />);

    enterPasswordAndSubmit();
    await screen.findByText(TEST_CODE);
    fireEvent.click(screen.getByRole('button', { name: 'نسخ الرمز' }));
    expect(copyRecoveryCode).toHaveBeenCalledWith(TEST_CODE, expect.any(Function));
  });

  it('TEST 8: export TXT functionality remains available', async () => {
    invoke.mockResolvedValue(TEST_CODE);
    render(<RecoverySetupModal isOpen legacyMode onClose={vi.fn()} />);

    enterPasswordAndSubmit();
    await screen.findByText(TEST_CODE);
    fireEvent.click(screen.getByRole('button', { name: /تصدير/ }));
    expect(exportRecoveryCode).toHaveBeenCalledWith(TEST_CODE, 'admin', expect.any(Function));
  });

  it('TEST 9: "لاحقاً" dismisses the flow without calling recovery creation', () => {
    const onClose = vi.fn();
    render(<RecoverySetupModal isOpen legacyMode onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: 'لاحقاً' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(invoke).not.toHaveBeenCalled();
    expect(markRecoveryConfigured).not.toHaveBeenCalled();
    expect(screen.queryByText(TEST_CODE)).not.toBeInTheDocument();
  });
});

// ─── AppLayout gate: STRICT check (no falsy check) ─────────────────────
// Rendering the full AppLayout in jsdom requires mocking many heavy layout
// modules, so the session gate is exercised through the exported predicate
// used by AppLayout — same logic, no fragile render.
describe('shouldShowLegacyRecovery (AppLayout gate)', () => {
  it('Case A: has_recovery_code === true → modal does NOT appear', () => {
    expect(shouldShowLegacyRecovery({ has_recovery_code: true }, false)).toBe(false);
  });

  it('Case B: has_recovery_code === false → modal appears', () => {
    expect(shouldShowLegacyRecovery({ has_recovery_code: false }, false)).toBe(true);
  });

  it('Case C: has_recovery_code === undefined → modal does NOT appear', () => {
    expect(shouldShowLegacyRecovery({}, false)).toBe(false);
    expect(shouldShowLegacyRecovery({ has_recovery_code: undefined }, false)).toBe(false);
  });

  it('Case D: has_recovery_code === null → modal does NOT appear', () => {
    expect(shouldShowLegacyRecovery({ has_recovery_code: null }, false)).toBe(false);
  });

  it('Case E: legacy user chose "لاحقاً" → dismissed for the current session only', () => {
    expect(shouldShowLegacyRecovery({ has_recovery_code: false }, true)).toBe(false);
  });
});
