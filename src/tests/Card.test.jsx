import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import Card from '../components/ui/Card';

describe('Card Component', () => {
  // ─── 1. Basic rendering ─────────────────────────────────────────────────
  it('renders children content correctly', () => {
    render(<Card>محتوى البطاقة</Card>);
    expect(screen.getByText('محتوى البطاقة')).toBeInTheDocument();
  });

  // ─── 2. Multiple children ───────────────────────────────────────────────
  it('renders multiple children elements', () => {
    render(
      <Card>
        <h3>عنوان</h3>
        <p>وصف البطاقة</p>
      </Card>
    );
    expect(screen.getByText('عنوان')).toBeInTheDocument();
    expect(screen.getByText('وصف البطاقة')).toBeInTheDocument();
  });

  // ─── 3. Custom className ────────────────────────────────────────────────
  it('applies custom className alongside the default neu-card class', () => {
    render(<Card className="my-custom-card">بطاقة مخصصة</Card>);
    const card = screen.getByText('بطاقة مخصصة').closest('div');
    expect(card.className).toContain('neu-card');
    expect(card.className).toContain('my-custom-card');
  });

  // ─── 4. Accent color ────────────────────────────────────────────────────
  it('applies accent border-bottom when accent prop is provided', () => {
    render(<Card accent="#dc2626">بطاقة مع لون تمييز</Card>);
    const card = screen.getByText('بطاقة مع لون تمييز').closest('div');
    expect(card.style.borderBottom).toBe('3px solid rgb(220, 38, 38)');
  });

  it('does not have accent style when accent prop is not provided', () => {
    render(<Card>بطاقة بدون تمييز</Card>);
    const card = screen.getByText('بطاقة بدون تمييز').closest('div');
    expect(card.style.borderBottom).toBe('');
  });

  // ─── 5. Custom style ────────────────────────────────────────────────────
  it('merges custom style with default styles', () => {
    render(
      <Card style={{ backgroundColor: '#f0f9ff', padding: '20px' }}>
        بطاقة بتنسيق مخصص
      </Card>
    );
    const card = screen.getByText('بطاقة بتنسيق مخصص').closest('div');
    expect(card.style.backgroundColor).toBe('rgb(240, 249, 255)');
    expect(card.style.padding).toBe('20px');
  });

  // ─── 6. Spread props ────────────────────────────────────────────────────
  it('passes additional props to the div element', () => {
    render(<Card data-testid="test-card" title="بطاقة اختبار">بطاقة</Card>);
    const card = screen.getByTestId('test-card');
    expect(card).toHaveAttribute('title', 'بطاقة اختبار');
  });

  // ─── 7. React.Fragment children ─────────────────────────────────────────
  it('renders Fragment children without extra wrapper', () => {
    render(
      <Card>
        <>محتوى 1</>
        <>محتوى 2</>
      </Card>
    );
    expect(screen.getByText(/محتوى 1/)).toBeInTheDocument();
    expect(screen.getByText(/محتوى 2/)).toBeInTheDocument();
  });

});
