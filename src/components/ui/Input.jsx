import React from 'react';
import Tooltip from './Tooltip';

const Input = ({ label, icon: Icon, hint, error, type = 'text', className = '', inputClassName = '', ...props }) => {
  return (
    <div className={className}>
      {label && (
        <label className="field-label">
          {Icon && <Icon size={16} />}
          <span>{label}</span>
          {hint && <Tooltip text={hint} />}
        </label>
      )}
      {type === 'textarea' ? (
        <textarea
          className={`neu-input ${error ? 'border-red-400' : ''} ${inputClassName}`}
          style={{ textAlign: 'right', fontWeight: 500, fontSize: '15px', resize: 'vertical' }}
          {...props}
        />
      ) : (
        <input
          type={type}
          className={`neu-input ${error ? 'border-red-400' : ''} ${inputClassName}`}
          {...props}
        />
      )}
      {error && <p className="text-xs font-medium mt-1" style={{ color: 'var(--color-danger)' }}>{error}</p>}
    </div>
  );
};

export default Input;
