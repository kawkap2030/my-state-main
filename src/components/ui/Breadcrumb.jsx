import React from 'react';
import { ChevronLeft, Home } from 'lucide-react';
import { Link } from 'react-router-dom';

const Breadcrumb = ({ items = [] }) => {
  return (
    <nav className="flex items-center gap-2 text-sm mb-6" dir="rtl" aria-label="Breadcrumb">
      <Link 
        to="/" 
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all duration-200 hover:bg-primary/10 hover:text-primary !text-slate-500 font-bold"
        title="العودة للرئيسية"
      >
        <Home size={16} />
        <span>الرئيسية</span>
      </Link>
      
      {items.length > 0 && <ChevronLeft size={14} className="text-slate-300 mx-1" />}

      {items.map((item, i) => (
        <React.Fragment key={i}>
          {i > 0 && <ChevronLeft size={14} className="text-slate-300 mx-1" />}
          {item.to ? (
            <Link
              to={item.to}
              className="font-medium transition-colors duration-200 cursor-pointer"
              style={{ color: 'var(--color-text-muted)' }}
              onMouseEnter={e => { e.currentTarget.style.color = 'var(--color-primary)'; }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--color-text-muted)'; }}
            >
              {item.label}
            </Link>
          ) : (
            <span className="font-bold px-2 py-1 rounded-md bg-slate-100 text-slate-800 border border-slate-200 text-xs">
              {item.label}
            </span>
          )}
        </React.Fragment>
      ))}
    </nav>
  );
};

export default Breadcrumb;
