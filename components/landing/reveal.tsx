import type { CSSProperties, ReactNode } from 'react';

/**
 * Scroll-reveal wrapper. Renders its children fully into the SSR HTML (visible
 * to crawlers and no-JS users); the entrance is a pure CSS enhancement driven
 * by `RevealProvider`, which toggles `.kp-in` when the element scrolls in.
 * No framer-motion, so there is no `opacity:0` in the server output and no
 * hydration mismatch.
 */
export function Reveal({
  children,
  delay = 0,
  y = 24,
  className = '',
  style,
}: {
  children: ReactNode;
  delay?: number;
  y?: number | string;
  className?: string;
  style?: CSSProperties;
}) {
  const yVal = typeof y === 'number' ? `${y}px` : y;
  return (
    <div
      className={`kp-reveal ${className}`.trim()}
      style={
        {
          '--kp-delay': `${delay}s`,
          '--kp-y': yVal,
          ...style,
        } as CSSProperties
      }
    >
      {children}
    </div>
  );
}
