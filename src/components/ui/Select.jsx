import React from 'react';

const Select = ({ label, icon: Icon, options = [], placeholder = 'اختر...', error, className = '', ...props }) => {
  return (
    <div className={className}>
      {label && (
        <label className="field-label">
          {Icon && <Icon size={16} />}
          <span>{label}</span>
        </label>
      )}
      <select className={`neu-select ${error ? 'border-red-400' : ''}`} {...props}>
        <option value="">{placeholder}</option>
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      {error && <p className="text-xs font-medium mt-1" style={{ color: 'var(--color-danger)' }}>{error}</p>}
    </div>
  );
};

export default Select;
