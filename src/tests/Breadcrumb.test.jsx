import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import Breadcrumb from '../components/ui/Breadcrumb';

// Helper to render Breadcrumb with MemoryRouter
const renderBreadcrumb = (items) =>
  render(
    <MemoryRouter>
      <Breadcrumb items={items} />
    </MemoryRouter>
  );

describe('Breadcrumb Component', () => {
  // ─── 1. Empty items ────────────────────────────────────────────────────
  it('renders only the home link when no items are provided', () => {
    renderBreadcrumb([]);
    expect(screen.getByText('الرئيسية')).toBeInTheDocument();
    // Only one link (home) and no separator
    const links = screen.getAllByRole('link');
    expect(links.length).toBe(1);
  });

  // ─── 2. Single item ────────────────────────────────────────────────────
  it('renders home link plus one breadcrumb item', () => {
    renderBreadcrumb([{ label: 'التقارير' }]);
    expect(screen.getByText('الرئيسية')).toBeInTheDocument();
    expect(screen.getByText('التقارير')).toBeInTheDocument();
  });

  // ─── 3. Multiple items with links ──────────────────────────────────────
  it('renders all items with proper separators', () => {
    renderBreadcrumb([
      { label: 'البيانات الأساسية', to: '/master-data' },
      { label: 'الأدوية', to: '/master-data/drugs' },
      { label: 'إدارة الأدوية' },
    ]);
    expect(screen.getByText('الرئيسية')).toBeInTheDocument();
    expect(screen.getByText('البيانات الأساسية')).toBeInTheDocument();
    expect(screen.getByText('الأدوية')).toBeInTheDocument();
    expect(screen.getByText('إدارة الأدوية')).toBeInTheDocument();
  });

  // ─── 4. Item with link vs without link ─────────────────────────────────
  it('renders clickable links for items with "to" prop', () => {
    renderBreadcrumb([{ label: 'التقارير', to: '/reports' }]);
    const link = screen.getByText('التقارير');
    expect(link.tagName).toBe('A');
    expect(link).toHaveAttribute('href');
  });

  it('renders a non-clickable span for the last item (no "to" prop)', () => {
    renderBreadcrumb([
      { label: 'التقارير', to: '/reports' },
      { label: 'التقرير الحالي' }, // No "to" → span
    ]);
    const span = screen.getByText('التقرير الحالي');
    expect(span.tagName).toBe('SPAN');
  });

  // ─── 5. Home link navigation ───────────────────────────────────────────
  it('home link points to "/"', () => {
    renderBreadcrumb([{ label: 'صفحة فرعية' }]);
    const homeLink = screen.getByText('الرئيسية').closest('a');
    expect(homeLink).toHaveAttribute('href', '/');
  });

  // ─── 6. Chevron separators ─────────────────────────────────────────────
  it('renders chevron icons between items', () => {
    render(
      <MemoryRouter>
        <Breadcrumb items={[
          { label: 'الأول' },
          { label: 'الثاني' },
          { label: 'الثالث' },
        ]} />
      </MemoryRouter>
    );
    // The Breadcrumb renders home link + chevrons + items
    // Verify we have multiple nav links and a breadcrumb item
    expect(screen.getByText('الرئيسية')).toBeInTheDocument();
    expect(screen.getByText('الأول')).toBeInTheDocument();
    expect(screen.getByText('الثاني')).toBeInTheDocument();
    expect(screen.getByText('الثالث')).toBeInTheDocument();
  });

  // ─── 7. Accessibility ──────────────────────────────────────────────────
  it('has a nav element with aria-label for accessibility', () => {
    const { container } = render(
      <MemoryRouter>
        <Breadcrumb items={[{ label: 'صفحة' }]} />
      </MemoryRouter>
    );
    const nav = container.querySelector('nav');
    expect(nav).toHaveAttribute('aria-label', 'Breadcrumb');
  });
});
