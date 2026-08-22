import React, { useCallback, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * TopScrollbar
 * ------------
 * A full-window horizontal pan strip pinned directly under the sticky Navbar,
 * mirroring the native bottom browser scrollbar: it appears ONLY when some
 * element on the page actually has horizontal overflow, spans the whole
 * window (so it works everywhere on the page), and stays fixed at the top.
 */

/** Minimum real overflow (px) before the strip activates — avoids a dead,
    full-width thumb when an element overflows by a pixel or two. */
const MIN_OVERFLOW = 40;

/** Page direction is fixed by CSS (html { direction: rtl }) and never changes,
    so compute it once instead of on every scroll frame. RTL documents pan with
    NEGATIVE scrollLeft; LTR uses positive values. */
const IS_RTL =
  typeof document !== 'undefined' &&
  getComputedStyle(document.documentElement).direction === 'rtl';

/** Find the element with the LARGEST horizontal overflow on the page.
    NOTE: the document is checked first — overflowing content propagates to
    it (no ancestor clips), so any main/table overflow is already covered. */
const findOverflowTarget = (excludeEl) => {
  // 1. Document level first (wide tables expand the content column)
  const doc = document.documentElement;
  if (doc.scrollWidth - window.innerWidth > MIN_OVERFLOW) return doc;

  // 2. Any clipped scroll container — pick the one with the most overflow
  const selectors = [
    '.overflow-x-auto',
    '.overflow-auto',
    '[class*="overflow-x"]',
    '[class*="overflow-auto"]',
    '[style*="overflow"]',
    'table',
  ];
  const candidates = document.querySelectorAll(selectors.join(', '));
  let best = null;
  let bestDelta = MIN_OVERFLOW;
  for (const el of candidates) {
    if (el === excludeEl || excludeEl?.contains(el) || el.contains(excludeEl)) continue;
    const container = el.tagName === 'TABLE' ? el.parentElement : el;
    if (!container || container === excludeEl || excludeEl?.contains(container)) continue;
    if (container.clientWidth <= 0) continue;
    const delta = container.scrollWidth - container.clientWidth;
    if (delta > bestDelta) {
      bestDelta = delta;
      best = container;
    }
  }
  return best;
};

const TopScrollbar = () => {
  const wrapRef = useRef(null);
  const trackRef = useRef(null);
  const spacerRef = useRef(null);
  const spacerWidthRef = useRef(0);
  const spacerHeightRef = useRef(0);
  const syncingRef = useRef(false);
  const targetRef = useRef(null);
  const topOffsetRef = useRef(0);
  const location = useLocation();

  // Measure the height of the sticky host (the wrapper around Navbar) once —
  // it is constant while pinned, so we avoid forcing layout on every scroll.
  // Also publish it as --navbar-h so the fixed Sidebar starts below the toolbar.
  const measureTop = useCallback(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const host = wrap.parentElement;
    if (!host) return;
    const h = host.getBoundingClientRect().height;
    if (h > 0) {
      topOffsetRef.current = h;
      document.documentElement.style.setProperty('--navbar-h', `${h}px`);
    }
  }, []);

  const refresh = useCallback(({ rescale = true } = {}) => {
    const wrap = wrapRef.current;
    const track = trackRef.current;
    const spacer = spacerRef.current;
    if (!wrap || !track || !spacer) return;

    // Anchor the strip just below the sticky navbar header, in viewport
    // coordinates — the strip is position:fixed, so it spans the whole window.
    if (topOffsetRef.current > 0) {
      wrap.style.top = `${topOffsetRef.current}px`;
    }

    // The full-tree scan is expensive; run it only when the layout may have
    // changed (route change, resize, interval, mutations), not per scroll
    // frame — scroll only re-syncs the thumb against the cached target.
    if (rescale) {
      targetRef.current = findOverflowTarget(track);
    }
    const target = targetRef.current;

    const hasOverflow = !!target;
    wrap.classList.toggle('top-scrollbar-hidden', !hasOverflow);

    if (!hasOverflow) {
      if (spacerWidthRef.current !== 0) {
        spacerWidthRef.current = 0;
        spacer.style.width = '100%';
      }
      if (track.scrollLeft !== 0) {
        syncingRef.current = true;
        track.scrollLeft = 0;
        syncingRef.current = false;
      }
      return;
    }

    const isDoc = target === document.documentElement || target === document.body;
    const sw = target.scrollWidth;
    const cw = isDoc ? window.innerWidth : target.clientWidth;
    const maxTarget = sw - cw;

    // Spacer = track width + content range, so the thumb's travel distance is
    // exactly the real pan distance (and empty when there is nothing to pan).
    const spacerWidth = track.clientWidth + maxTarget;
    if (spacerWidthRef.current !== spacerWidth) {
      spacerWidthRef.current = spacerWidth;
      spacer.style.width = `${spacerWidth}px`;
    }

    // A DEFINITE height is required: a widened child with a percentage height
    // (height:100%) collapses to 0px inside this scroll container, and a
    // 0-height child contributes NO horizontal overflow — the strip then
    // rendered but could never actually pan. Sync from the wrapper's height
    // (10px strip; the wrapper has no scrollbar, unlike the track whose
    // clientHeight is eaten by its own 10px webkit scrollbar). The height is
    // cached in a ref so we don't force a reflow by reading offsetHeight on
    // every refresh tick — the wrapper's height is constant while pinned.
    if (spacerHeightRef.current !== wrap.clientHeight) {
      spacerHeightRef.current = wrap.clientHeight;
      spacer.style.height = `${wrap.clientHeight}px`;
    }

    // RTL: scrollLeft 0 = right edge, grows toward the left edge.
    const rawLeft = isDoc ? window.scrollX : target.scrollLeft;
    let ratio = 0;
    if (maxTarget > 0) {
      ratio = rawLeft <= 0 ? Math.abs(rawLeft) / maxTarget : rawLeft / maxTarget;
    }
    ratio = Math.min(1, Math.max(0, ratio));

    syncingRef.current = true;
    // Map: content right edge (ratio 0) -> strip right edge (scrollLeft 0).
    track.scrollLeft = maxTarget > 0 ? (1 - ratio) * maxTarget : 0;
    syncingRef.current = false;
  }, []);

  useEffect(() => {
    measureTop();
    const raf = requestAnimationFrame(refresh);

    let scrollRaf = 0;
    const onScroll = () => {
      if (scrollRaf) return;
      scrollRaf = requestAnimationFrame(() => {
        scrollRaf = 0;
        refresh({ rescale: false });
      });
    };
    const onResize = () => {
      measureTop();
      refresh();
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);
    document.addEventListener('scroll', onScroll, { passive: true, capture: true });

    const observer = new MutationObserver(() => {
      requestAnimationFrame(refresh);
    });
    observer.observe(document.body, { childList: true, subtree: true });

    const timer = setInterval(refresh, 1000);

    return () => {
      cancelAnimationFrame(raf);
      if (scrollRaf) cancelAnimationFrame(scrollRaf);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('scroll', onScroll, { capture: true });
      observer.disconnect();
      clearInterval(timer);
    };
  }, [refresh, measureTop]);

  useEffect(() => {
    const raf = requestAnimationFrame(refresh);
    return () => cancelAnimationFrame(raf);
  }, [location.pathname, refresh]);

  const handleStripScroll = () => {
    const track = trackRef.current;
    const target = targetRef.current;
    if (!track || !target || syncingRef.current) return;

    const isDoc = target === document.documentElement || target === document.body;
    const sw = target.scrollWidth;
    const cw = isDoc ? window.innerWidth : target.clientWidth;
    const maxTarget = sw - cw;
    if (maxTarget <= 0) return;

    // Spacer = track + maxTarget, so the strip's travel is exactly maxTarget.
    const stripRatio = maxTarget > 0 ? track.scrollLeft / maxTarget : 0;
    // Strip left edge (ratio 1) -> content left edge (ratio 0 in RTL).
    const contentRatio = 1 - stripRatio;

    syncingRef.current = true;
    if (isDoc) {
      // RTL documents scroll to NEGATIVE scrollLeft (0 = right edge, grows
      // toward −maxTarget when panning left); LTR uses positive values.
      const left = IS_RTL ? -(contentRatio * maxTarget) : contentRatio * maxTarget;
      window.scrollTo({ left, behavior: 'auto' });
    } else if (target.scrollLeft <= 0) {
      target.scrollLeft = -(contentRatio * maxTarget);
    } else {
      target.scrollLeft = contentRatio * maxTarget;
    }
    syncingRef.current = false;
  };

  return (
    <div
      ref={wrapRef}
      className="fixed left-0 right-0 h-2.5 z-[45] no-print top-scrollbar top-scrollbar-hidden"
      dir="ltr"
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
    >
      <div
        ref={trackRef}
        onScroll={handleStripScroll}
        role="scrollbar"
        aria-label="تمرير أفقي سريع"
        aria-orientation="horizontal"
        className="top-scrollbar-track h-full overflow-y-hidden cursor-pointer"
        style={{ overflowX: 'auto' }}
      >
        {/* Spacer drives the track's scrollable range (width = track + maxTarget).
            Its height is kept in sync with the track inside refresh() — a
            percentage height collapses to 0px for a widened child in this scroll
            container, which would leave the strip with no pan range at all. */}
        <div ref={spacerRef} style={{ width: '100%' }} />
      </div>
    </div>
  );
};

export default React.memo(TopScrollbar);
