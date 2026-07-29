import React from 'react';
import { X } from 'lucide-react';

const Modal = ({ isOpen, onClose, title, children, wide, maxWidthClass }) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(22, 78, 99, 0.4)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className={`neu-card p-0 w-full ${maxWidthClass ? maxWidthClass : (wide ? 'max-w-2xl' : 'max-w-lg')}`}
        style={{ animation: 'fadeIn 0.2s ease', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 shrink-0" style={{ borderBottom: '1px solid var(--color-border)' }}>
          <h3 className="text-base font-bold" style={{ color: 'var(--color-text)' }}>{title}</h3>
          <button
            onClick={onClose}
            className="p-2 rounded-xl cursor-pointer transition-colors duration-200"
            style={{ color: 'var(--color-text-muted)' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-bg)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
          >
            <X size={18} />
          </button>
        </div>
        {/* Body - Scrollable */}
        <div className="p-6 overflow-y-auto min-h-0" style={{ flex: 1 }}>{children}</div>
      </div>
    </div>
  );
};

export default Modal;
