import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import Input from '../components/ui/Input';

describe('Input Component', () => {
  // ─── 1. Basic rendering ─────────────────────────────────────────────────
  it('renders an input element by default', () => {
    render(<Input placeholder="أدخل النص" />);
    expect(screen.getByPlaceholderText('أدخل النص')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('أدخل النص').tagName).toBe('INPUT');
  });

  // ─── 2. Label ───────────────────────────────────────────────────────────
  it('renders the label text when provided', () => {
    render(<Input label="اسم المستخدم" />);
    expect(screen.getByText('اسم المستخدم')).toBeInTheDocument();
  });

  it('does not render a label when not provided', () => {
    const { container } = render(<Input placeholder="بدون عنوان" />);
    const labels = container.querySelectorAll('.field-label');
    expect(labels.length).toBe(0);
  });

  // ─── 3. Textarea variant ────────────────────────────────────────────────
  it('renders a textarea when type is "textarea"', () => {
    render(<Input type="textarea" placeholder="أدخل الملاحظات" />);
    const el = screen.getByPlaceholderText('أدخل الملاحظات');
    expect(el.tagName).toBe('TEXTAREA');
  });

  // ─── 4. Error state ─────────────────────────────────────────────────────
  it('shows error message when error prop is provided', () => {
    render(<Input error="هذا الحقل مطلوب" />);
    expect(screen.getByText('هذا الحقل مطلوب')).toBeInTheDocument();
  });

  it('does not show error message when error prop is not provided', () => {
    render(<Input placeholder="بدون خطأ" />);
    // No error message should appear on the page
    const errorText = screen.queryByText(/مطلوب|خطأ/);
    expect(errorText).not.toBeInTheDocument();
  });

  // ─── 5. Value and onChange ──────────────────────────────────────────────
  it('displays the provided value and responds to changes', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(
      <Input value="نص تجريبي" onChange={handleChange} placeholder="اكتب هنا" />
    );
    const input = screen.getByPlaceholderText('اكتب هنا');
    expect(input).toHaveValue('نص تجريبي');
    
    await user.type(input, '!');
    expect(handleChange).toHaveBeenCalled();
  });

  // ─── 6. Disabled state ──────────────────────────────────────────────────
  it('disables the input when disabled prop is true', () => {
    render(<Input disabled placeholder="معطل" />);
    expect(screen.getByPlaceholderText('معطل')).toBeDisabled();
  });

  // ─── 7. Custom className ────────────────────────────────────────────────
  it('applies custom className to the wrapper', () => {
    const { container } = render(
      <Input className="wrapper-class" inputClassName="input-class" placeholder="اختبار" />
    );
    // The wrapper div gets className
    const wrapper = container.querySelector('.wrapper-class');
    expect(wrapper).toBeInTheDocument();
  });

  it('applies inputClassName to the input element', () => {
    render(<Input inputClassName="my-input-class" placeholder="اختبار" />);
    const input = screen.getByPlaceholderText('اختبار');
    expect(input.className).toContain('my-input-class');
  });

  // ─── 8. Required attribute ──────────────────────────────────────────────
  it('passes required attribute to the input', () => {
    render(<Input required placeholder="مطلوب" />);
    expect(screen.getByPlaceholderText('مطلوب')).toBeRequired();
  });
});
