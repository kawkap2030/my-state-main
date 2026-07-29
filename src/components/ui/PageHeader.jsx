import React from 'react';

const PageHeader = ({ title, description, icon: Icon, actions }) => {
  return (
    <div className="flex items-center justify-between flex-wrap gap-4 mb-8" dir="rtl">
      <div className="flex items-center gap-4">
        {Icon && (
          <div className="section-icon" style={{ background: 'var(--color-bg)', color: 'var(--color-primary)' }}>
            <Icon size={24} />
          </div>
        )}
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--color-text)' }}>{title}</h1>
          {description && <p className="text-xs font-medium mt-1" style={{ color: 'var(--color-text-muted)' }}>{description}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-3">{actions}</div>}
    </div>
  );
};

export default PageHeader;
