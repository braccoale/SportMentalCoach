'use client';

import { useRef } from 'react';
import {
  motion,
  useScroll,
  useSpring,
  useTransform,
  useReducedMotion,
} from 'motion/react';

/**
 * Branded bottle for the "Pacchetti" section: enters tilted, straightens as
 * the section crosses the viewport centre, keeps drifting with the scroll —
 * plus a slow idle float and a red glow "seat". Decorative only (aria-hidden),
 * static for prefers-reduced-motion users.
 */
export function ScrollBottle({ className = '' }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'end start'],
  });
  const rotate = useSpring(
    useTransform(scrollYProgress, [0, 0.5, 1], [-18, -4, 12]),
    { stiffness: 55, damping: 16 }
  );
  const y = useSpring(useTransform(scrollYProgress, [0, 1], [56, -56]), {
    stiffness: 55,
    damping: 16,
  });

  return (
    <div ref={ref} className={className} aria-hidden>
      <motion.div
        style={reduce ? undefined : { rotate, y }}
        className="kp-float-slow"
      >
        <img
          src="/BorracciaKaiPai.png"
          alt=""
          width={75}
          height={166}
          className="w-[120px] drop-shadow-[0_24px_36px_rgba(225,29,42,0.28)]"
        />
        {/* red glow seat */}
        <div className="mx-auto -mt-3 h-5 w-20 rounded-full bg-kp-red/25 blur-xl" />
      </motion.div>
    </div>
  );
}
