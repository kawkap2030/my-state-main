import React, { useEffect, useRef, useState } from 'react';
import { TrendingUp } from 'lucide-react';

/**
 * StatsBar - Unified statistics bar for dispensing pages
 * 
 * Displays key metrics in a horizontal bar above tables.
 * Supports dual counters: total (all data) + filtered (current view).
 * Includes count-up animation on mount/change.
 * 
 * @param {Array} stats - Array of stat objects:
 *   { label, value, filteredValue?, icon?, color?, prefix?, suffix? }
 * @param {string} accentColor - CSS variable for accent (e.g. 'var(--color-primary)')
 */

const AnimatedNumber = ({ value, suffix = '', prefix = '' }) => {
  const [display, setDisplay] = useState(0);
  const prevRef = useRef(0);
  const frameRef = useRef(null);

  useEffect(() => {
    const start = prevRef.current;
    const end = typeof value === 'number' ? value : parseFloat(value) || 0;
    const duration = 400; // ms
    const startTime = performance.now();

    const animate = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = start + (end - start) * eased;
      setDisplay(current);
      
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(animate);
      } else {
        prevRef.current = end;
      }
    };

    frameRef.current = requestAnimationFrame(animate);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [value]);

  const formatted = display % 1 === 0 
    ? Math.round(display).toLocaleString('en-US')
    : display.toLocaleString('en-US', { maximumFractionDigits: 2 });

  const staticFormatted = (typeof value === 'number' ? value : parseFloat(value) || 0).toLocaleString('en-US', { 
    maximumFractionDigits: (typeof value === 'number' ? value : parseFloat(value) || 0) % 1 === 0 ? 0 : 2 
  });

  return (
    <span className="tabular-nums">
      <span className="print:hidden">{prefix}{formatted}{suffix}</span>
      <span className="hidden print:inline">{prefix}{staticFormatted}{suffix}</span>
    </span>
  );
};

const StatsBar = ({ stats = [], accentColor = 'var(--color-primary)' }) => {
  if (stats.length === 0) return null;

  return (
    <div 
      className="flex flex-wrap items-stretch gap-3 p-4 rounded-2xl border shadow-sm transition-all"
      style={{ 
        backgroundColor: `color-mix(in srgb, ${accentColor} 5%, var(--color-bg-card))`,
        borderColor: `color-mix(in srgb, ${accentColor} 15%, var(--color-border))`,
      }}
      dir="rtl"
    >
      {/* Icon */}
      <div 
        className="flex items-center justify-center w-10 h-10 rounded-xl self-center shrink-0"
        style={{ 
          backgroundColor: `color-mix(in srgb, ${accentColor} 12%, transparent)`,
          color: accentColor 
        }}
      >
        <TrendingUp size={18} />
      </div>

      {/* Stats */}
      <div className="flex flex-wrap items-center gap-4 flex-1">
        {stats.map((stat, i) => {
          const StatIcon = stat.icon;
          const hasFiltered = stat.filteredValue !== undefined && stat.filteredValue !== stat.value;
          
          return (
            <React.Fragment key={i}>
              {i > 0 && (
                <div className="w-px h-10 self-center" style={{ backgroundColor: 'var(--color-border)' }} />
              )}
              <div className="flex items-center gap-3 px-2">
                {StatIcon && (
                  <div 
                    className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                    style={{ 
                      backgroundColor: `color-mix(in srgb, ${stat.color || accentColor} 10%, transparent)`,
                      color: stat.color || accentColor 
                    }}
                  >
                    <StatIcon size={14} />
                  </div>
                )}
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-wide leading-tight">
                    {stat.label}
                  </span>
                  <div className="flex items-baseline gap-2">
                    <span 
                      className="text-lg font-black leading-tight"
                      style={{ color: stat.color || accentColor }}
                    >
                      <AnimatedNumber 
                        value={hasFiltered ? stat.filteredValue : stat.value} 
                        suffix={stat.suffix || ''} 
                        prefix={stat.prefix || ''} 
                      />
                    </span>
                    {hasFiltered && (
                      <span className="text-[10px] font-bold text-[var(--color-text-muted)] leading-tight">
                        من <AnimatedNumber value={stat.value} suffix={stat.suffix || ''} />
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};

export default StatsBar;
