import React, { useState } from 'react';
import { HelpCircle } from 'lucide-react';

const Tooltip = ({ text, position = 'top' }) => {
  const [visible, setVisible] = useState(false);
  
  const positionClasses = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    right: 'top-1/2 left-full -translate-y-1/2 mr-2',
    left: 'top-1/2 right-full -translate-y-1/2 ml-2'
  };

  return (
    <div 
      className="relative inline-block mr-1.5 align-middle cursor-help no-print"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onClick={() => setVisible(!visible)} // Support toggle on click/tap
    >
      <HelpCircle size={14} className="text-[var(--color-text-muted)] hover:text-[var(--color-primary)] transition-colors duration-200" />
      {visible && (
        <div className={`absolute z-50 w-56 p-2.5 text-[10px] font-black text-white bg-slate-800/95 backdrop-blur-sm rounded-xl shadow-xl transition-all duration-200 ${positionClasses[position]}`}>
          <div className="text-right leading-relaxed">
            {text}
          </div>
          {/* Arrow */}
          <div 
            className={`absolute w-2 h-2 bg-slate-800 rotate-45 ${
              position === 'top' ? 'top-full left-1/2 -translate-x-1/2 -mt-1' :
              position === 'bottom' ? 'bottom-full left-1/2 -translate-x-1/2 -mb-1' :
              position === 'right' ? 'right-full top-1/2 -translate-y-1/2 -mr-1' :
              'left-full top-1/2 -translate-y-1/2 -ml-1'
            }`}
          />
        </div>
      )}
    </div>
  );
};

export default Tooltip;
