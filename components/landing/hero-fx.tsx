'use client';

import { createContext, useContext } from 'react';
import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  useReducedMotion,
  type MotionValue,
} from 'motion/react';

/**
 * Hero motion FX (Framer Motion):
 *  - <ParallaxGroup> tracks the pointer over the hero and exposes a
 *    normalized -1..1 position;
 *  - <ParallaxLayer depth={n}> children drift toward/away from the cursor
 *    with spring physics — positive depth follows the mouse, negative moves
 *    against it. Different depths per layer create the 3D feel.
 *  - <AnimatedHeadline> staggers the hero title in, word by word.
 * All effects are disabled for prefers-reduced-motion users.
 */

type Ctx = { x: MotionValue<number>; y: MotionValue<number> };
const ParallaxCtx = createContext<Ctx | null>(null);

export function ParallaxGroup({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const reduce = useReducedMotion();

  function onMove(e: React.PointerEvent<HTMLDivElement>) {
    if (reduce) return;
    const r = e.currentTarget.getBoundingClientRect();
    x.set(((e.clientX - r.left) / r.width) * 2 - 1);
    y.set(((e.clientY - r.top) / r.height) * 2 - 1);
  }

  return (
    <div
      className={className}
      onPointerMove={onMove}
      onPointerLeave={() => {
        x.set(0);
        y.set(0);
      }}
    >
      <ParallaxCtx.Provider value={{ x, y }}>{children}</ParallaxCtx.Provider>
    </div>
  );
}

export function ParallaxLayer({
  depth = 10,
  className,
  children,
}: {
  /** Max horizontal drift in px; vertical is 60% of it. Negative inverts. */
  depth?: number;
  className?: string;
  children: React.ReactNode;
}) {
  const ctx = useContext(ParallaxCtx);
  const zero = useMotionValue(0);
  const sx = useSpring(ctx?.x ?? zero, { stiffness: 55, damping: 16 });
  const sy = useSpring(ctx?.y ?? zero, { stiffness: 55, damping: 16 });
  const tx = useTransform(sx, (v) => v * depth);
  const ty = useTransform(sy, (v) => v * depth * 0.6);

  return (
    <motion.div style={{ x: tx, y: ty }} className={className}>
      {children}
    </motion.div>
  );
}

/** Hero title with a cinematic, word-by-word staggered entrance. */
export function AnimatedHeadline() {
  const reduce = useReducedMotion();
  const lines: { text: string; red?: boolean }[][] = [
    [{ text: 'Allena' }, { text: 'la' }, { text: 'mente.' }],
    [{ text: 'Cambia' }, { text: 'il' }, { text: 'gioco.', red: true }],
  ];

  let i = 0;
  return (
    <h1 className="kp-display text-[clamp(2rem,5.2vw,4.25rem)] uppercase text-kp-hi">
      {lines.map((words, li) => (
        <span key={li} className="block whitespace-nowrap">
          {words.map((w) => {
            const delay = 0.15 + i++ * 0.11;
            return (
              <motion.span
                key={w.text}
                className={`inline-block ${w.red ? 'text-kp-red' : ''}`}
                initial={
                  reduce ? false : { opacity: 0, y: 34, filter: 'blur(10px)' }
                }
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                transition={{ duration: 0.85, delay, ease: [0.16, 1, 0.3, 1] }}
              >
                {w.text}
                {' '}
              </motion.span>
            );
          })}
        </span>
      ))}
    </h1>
  );
}
