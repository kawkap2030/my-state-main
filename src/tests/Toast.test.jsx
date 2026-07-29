import React from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import ToastProvider, { useToast } from '../components/ui/Toast';

// ─── Helper component to trigger toasts in tests ────────────────────────
const ToastTrigger = ({ type = 'success', message = 'رسالة ترحيبية', delay = 0 }) => {
  const toast = useToast();
  React.useEffect(() => {
    const timer = setTimeout(() => {
      if (type === 'success') toast.success(message);
      else if (type === 'error') toast.error(message);
      else if (type === 'warning') toast.warning(message);
      else toast.info(message);
    }, delay);
    return () => clearTimeout(timer);
  }, [type, message, delay, toast]);
  return null;
};

describe('Toast Component', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ─── 1. Success toast ──────────────────────────────────────────────────
  it('renders a success toast with the correct message', () => {
    render(
      <ToastProvider>
        <ToastTrigger type="success" message="تم الحفظ بنجاح" />
      </ToastProvider>
    );
    act(() => { vi.advanceTimersByTime(50); });
    expect(screen.getByText('تم الحفظ بنجاح')).toBeInTheDocument();
  });

  // ─── 2. Error toast ────────────────────────────────────────────────────
  it('renders an error toast with the correct message', () => {
    render(
      <ToastProvider>
        <ToastTrigger type="error" message="فشل في الحفظ" />
      </ToastProvider>
    );
    act(() => { vi.advanceTimersByTime(50); });
    expect(screen.getByText('فشل في الحفظ')).toBeInTheDocument();
  });

  // ─── 3. Warning toast ──────────────────────────────────────────────────
  it('renders a warning toast with the correct message', () => {
    render(
      <ToastProvider>
        <ToastTrigger type="warning" message="تحذير: البيانات لم تُحفظ" />
      </ToastProvider>
    );
    act(() => { vi.advanceTimersByTime(50); });
    expect(screen.getByText('تحذير: البيانات لم تُحفظ')).toBeInTheDocument();
  });

  // ─── 4. Info toast ─────────────────────────────────────────────────────
  it('renders an info toast with the correct message', () => {
    render(
      <ToastProvider>
        <ToastTrigger type="info" message="معلومات: تم التحديث" />
      </ToastProvider>
    );
    act(() => { vi.advanceTimersByTime(50); });
    expect(screen.getByText('معلومات: تم التحديث')).toBeInTheDocument();
  });

  // ─── 5. Auto-dismiss after duration ────────────────────────────────────
  it('auto-dismisses the toast after 4 seconds (default duration)', () => {
    render(
      <ToastProvider>
        <ToastTrigger type="success" message="ستختفي هذه الرسالة" />
      </ToastProvider>
    );
    act(() => { vi.advanceTimersByTime(50); });
    expect(screen.getByText('ستختفي هذه الرسالة')).toBeInTheDocument();

    // Advance time by 4 seconds (default duration)
    act(() => { vi.advanceTimersByTime(4000); });
    expect(screen.queryByText('ستختفي هذه الرسالة')).not.toBeInTheDocument();
  });

  // ─── 6. Manual dismiss via close button ────────────────────────────────
  it('removes the toast when the close button is clicked', () => {
    render(
      <ToastProvider>
        <ToastTrigger type="success" message="رسالة قابلة للإغلاق" />
      </ToastProvider>
    );
    act(() => { vi.advanceTimersByTime(50); });
    expect(screen.getByText('رسالة قابلة للإغلاق')).toBeInTheDocument();

    // Find and click the close button using data-testid
    const closeBtn = screen.getByTestId('toast-close');
    fireEvent.click(closeBtn);
    
    expect(screen.queryByText('رسالة قابلة للإغلاق')).not.toBeInTheDocument();
  });

  // ─── 7. Multiple toasts ────────────────────────────────────────────────
  it('renders multiple toasts simultaneously', () => {
    const MultiToast = () => {
      const toast = useToast();
      React.useEffect(() => {
        toast.success('الرسالة الأولى');
        toast.error('الرسالة الثانية');
        toast.info('الرسالة الثالثة');
      }, [toast]);
      return null;
    };
    
    render(
      <ToastProvider>
        <MultiToast />
      </ToastProvider>
    );
    
    // Advance timers to process all toasts
    act(() => { vi.advanceTimersByTime(100); });
    
    expect(screen.getByText('الرسالة الأولى')).toBeInTheDocument();
    expect(screen.getByText('الرسالة الثانية')).toBeInTheDocument();
    expect(screen.getByText('الرسالة الثالثة')).toBeInTheDocument();
  });

  // ─── 8. useToast throws outside provider ────────────────────────────────
  it('throws an error when useToast is used outside ToastProvider', () => {
    // Suppress console error for this expected error
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    
    const BadComponent = () => {
      useToast();
      return null;
    };
    
    expect(() => render(<BadComponent />)).toThrow(
      'useToast must be used within ToastProvider'
    );
    
    consoleSpy.mockRestore();
  });
});
