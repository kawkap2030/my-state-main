import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Save } from 'lucide-react';
import Button from '../components/ui/Button';

describe('Button Component', () => {
  // ─── 1. Basic rendering ─────────────────────────────────────────────────
  it('renders children text correctly', () => {
    render(<Button>حفظ البيانات</Button>);
    expect(screen.getByText('حفظ البيانات')).toBeInTheDocument();
  });

  // ─── 2. Variant classes ─────────────────────────────────────────────────
  it('applies the correct variant class for "primary" variant', () => {
    render(<Button variant="primary">Primary</Button>);
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('neu-btn-primary');
  });

  it('applies the correct variant class for "danger" variant', () => {
    render(<Button variant="danger">Danger</Button>);
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('neu-btn-danger');
  });

  it('applies the correct variant class for "ghost" variant', () => {
    render(<Button variant="ghost">Ghost</Button>);
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('neu-btn-ghost');
  });

  // ─── 3. Loading state ──────────────────────────────────────────────────
  it('shows a spinner and disables the button when loading is true', () => {
    render(<Button loading>تحميل...</Button>);
    const btn = screen.getByRole('button');
    expect(btn).toBeDisabled();
    // The Loader2 icon renders an SVG inside
    const spinner = btn.querySelector('svg.animate-spin');
    expect(spinner).toBeInTheDocument();
  });

  it('does not show children text when loading (only spinner + text)', () => {
    render(<Button loading>نص الزر</Button>);
    const btn = screen.getByRole('button');
    expect(btn).toBeDisabled();
    // Text should still be there as <span>{children}</span>
    expect(screen.getByText('نص الزر')).toBeInTheDocument();
  });

  // ─── 4. Disabled state ──────────────────────────────────────────────────
  it('disables the button when disabled prop is true', () => {
    render(<Button disabled>معطل</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('does not call onClick when disabled', () => {
    const handleClick = vi.fn();
    render(<Button disabled onClick={handleClick}>انقر</Button>);
    fireEvent.click(screen.getByRole('button'));
    expect(handleClick).not.toHaveBeenCalled();
  });

  // ─── 5. Icon rendering ──────────────────────────────────────────────────
  it('renders an icon when the icon prop is provided', () => {
    render(<Button icon={Save}>حفظ</Button>);
    const btn = screen.getByRole('button');
    // The icon renders inside an SVG element
    const icons = btn.querySelectorAll('svg');
    expect(icons.length).toBeGreaterThanOrEqual(1);
  });

  it('does not render an icon when icon prop is not provided', () => {
    render(<Button>بدون أيقونة</Button>);
    const btn = screen.getByRole('button');
    // Only the text span should exist
    expect(btn.querySelectorAll('svg').length).toBe(0);
  });

  // ─── 6. Click handler ───────────────────────────────────────────────────
  it('calls onClick handler when clicked', () => {
    const handleClick = vi.fn();
    render(<Button onClick={handleClick}>انقر هنا</Button>);
    fireEvent.click(screen.getByRole('button'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  // ─── 7. Custom className ────────────────────────────────────────────────
  it('merges custom className with variant class', () => {
    render(<Button className="my-custom-class">مخصص</Button>);
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('my-custom-class');
    expect(btn.className).toContain('neu-btn-primary'); // default variant
  });

  // ─── 8. Type attribute ──────────────────────────────────────────────────
  it('uses "button" as default type', () => {
    render(<Button>إرسال</Button>);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
  });

  it('allows overriding the type attribute', () => {
    render(<Button type="submit">إرسال</Button>);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'submit');
  });
});
