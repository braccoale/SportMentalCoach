'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Deterministic Italian number formatting (thousands `.`, decimals `,`).
 * We do NOT use `toLocaleString` because Node (SSR) and the browser can ship
 * different ICU data, producing "1500" vs "1.500" — a hydration mismatch.
 */
function groupThousands(intStr: string) {
  return intStr.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}
function formatIt(n: number, decimals: number) {
  if (decimals > 0) {
    const [int, frac] = n.toFixed(decimals).split('.');
    return `${groupThousands(int)},${frac}`;
  }
  return groupThousands(String(Math.round(n)));
}

/**
 * Number that counts up when scrolled into view. Renders its FINAL value in the
 * SSR HTML (so no-JS users and crawlers see the real figure and hydration
 * matches), then animates from 0 on the client. Skips the animation for
 * reduced-motion users. Uses a plain IntersectionObserver — no framer-motion.
 */
export function CountUp({
  to,
  prefix = '',
  suffix = '',
  decimals = 0,
  duration = 1.4,
}: {
  to: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  duration?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  // First render (server + client) shows the final value → no mismatch, no-JS safe.
  const [val, setVal] = useState(to);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || !('IntersectionObserver' in window)) return; // keep final value

    let raf = 0;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        io.disconnect();
        const start = performance.now();
        const tick = (now: number) => {
          const p = Math.min((now - start) / (duration * 1000), 1);
          const eased = 1 - Math.pow(1 - p, 3);
          setVal(to * eased);
          if (p < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      },
      { rootMargin: '0px 0px -10% 0px' }
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [to, duration]);

  const display = formatIt(val, decimals);

  return (
    <span ref={ref} className="tabular-nums">
      {prefix}
      {display}
      {suffix}
    </span>
  );
}
