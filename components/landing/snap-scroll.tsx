'use client';

import { useEffect } from 'react';

/**
 * Apple-style section snapping. Turns the document into a mandatory y-snap
 * scroller while the landing is mounted (each `.kp-snap` section is a snap
 * point), so one scroll gesture advances to the next section. Route-scoped:
 * the styles are restored on unmount. Disabled for reduced-motion users.
 */
export function SnapScroll() {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const el = document.documentElement;
    const prevSnap = el.style.scrollSnapType;
    const prevBehavior = el.style.scrollBehavior;
    el.style.scrollSnapType = 'y mandatory';
    el.style.scrollBehavior = 'smooth';
    return () => {
      el.style.scrollSnapType = prevSnap;
      el.style.scrollBehavior = prevBehavior;
    };
  }, []);
  return null;
}
