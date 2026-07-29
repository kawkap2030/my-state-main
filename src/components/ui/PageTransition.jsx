import React, { useRef, useEffect, memo } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * PageTransition wraps route content with a fade-in animation
 * triggered on every route change.
 *
 * IMPORTANT: This component does NOT re-mount children on navigation.
 * It uses a ref + animation restart trick to replay the CSS animation
 * without unmounting, so lazy-loaded (React.lazy) components inside
 * Suspense boundaries are NOT re-fetched on every navigation.
 *
 * Print is automatically handled — index.css sets
 * animation: none !important on all elements during @media print.
 */
const PageTransition = ({ children }) => {
  const location = useLocation();
  const divRef = useRef(null);

  useEffect(() => {
    // Re-trigger CSS animation smoothly without blocking main thread.
    let rafId;
    if (divRef.current) {
      const el = divRef.current;
      el.style.animation = 'none';
      rafId = requestAnimationFrame(() => {
        if (divRef.current) {
          divRef.current.style.animation = 'fadeIn 0.25s ease-out';
        }
      });
    }
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [location.pathname, location.search]);

  return (
    <div
      ref={divRef}
      style={{
        animation: 'fadeIn 0.25s ease-out',
      }}
    >
      {children}
    </div>
  );
};

export default memo(PageTransition);

