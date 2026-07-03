'use client';

import { useEffect } from 'react';

/**
 * Single IntersectionObserver that reveals every `.kp-reveal` element as it
 * enters the viewport. Mounted once per page. Degrades safely:
 * - reduced-motion or no IntersectionObserver support → reveal everything at once
 * - JS disabled entirely → the marketing layout's <noscript> keeps content visible
 */
export function RevealProvider() {
  useEffect(() => {
    const els = Array.from(
      document.querySelectorAll<HTMLElement>('.kp-reveal')
    );
    if (els.length === 0) return;

    const reduce = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches;

    if (reduce || !('IntersectionObserver' in window)) {
      els.forEach((el) => el.classList.add('kp-in'));
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('kp-in');
            io.unobserve(entry.target);
          }
        }
      },
      { rootMargin: '0px 0px -12% 0px' }
    );

    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return null;
}
