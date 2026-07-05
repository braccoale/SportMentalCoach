'use client';

import { useEffect, useRef } from 'react';

/**
 * Neural synapses over the hero brain: a small network of red neurons that
 * fire in waves synced with the 4.5s "breathing" rhythm, with connections
 * lighting up between active nodes. Canvas, ~zero cost (24 nodes), disabled
 * for prefers-reduced-motion.
 */

type Node = { x: number; y: number; phase: number; speed: number };

const NODE_COUNT = 24;
const LINK_DIST = 0.34; // as fraction of canvas size
const BREATH_MS = 4500; // keep in sync with kpBrainPulse

export function Synapses({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Nodes clustered toward the centre (gaussian-ish via averaging).
    const rand = () => (Math.random() + Math.random()) / 2;
    const nodes: Node[] = Array.from({ length: NODE_COUNT }, () => ({
      x: rand(),
      y: rand(),
      phase: Math.random() * Math.PI * 2,
      speed: 0.7 + Math.random() * 1.1,
    }));

    let raf = 0;
    let running = true;

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const { clientWidth: w, clientHeight: h } = canvas!;
      canvas!.width = w * dpr;
      canvas!.height = h * dpr;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    function draw(t: number) {
      if (!running) return;
      const w = canvas!.clientWidth;
      const h = canvas!.clientHeight;
      ctx!.clearRect(0, 0, w, h);

      // Global "breath": everything glows more on the inhale.
      const breath = 0.55 + 0.45 * Math.sin((t / BREATH_MS) * Math.PI * 2);

      // Per-node intensity (individual twinkle × global breath).
      const glow = nodes.map(
        (n) =>
          (0.35 + 0.65 * Math.abs(Math.sin(n.phase + (t / 1000) * n.speed))) *
          breath
      );

      // Links between nearby nodes, lit by the two endpoints.
      for (let a = 0; a < nodes.length; a++) {
        for (let b = a + 1; b < nodes.length; b++) {
          const dx = nodes[a].x - nodes[b].x;
          const dy = nodes[a].y - nodes[b].y;
          const d = Math.hypot(dx, dy);
          if (d > LINK_DIST) continue;
          const alpha = (1 - d / LINK_DIST) * 0.5 * glow[a] * glow[b];
          if (alpha < 0.02) continue;
          ctx!.strokeStyle = `rgba(245, 51, 63, ${alpha})`;
          ctx!.lineWidth = 1;
          ctx!.beginPath();
          ctx!.moveTo(nodes[a].x * w, nodes[a].y * h);
          ctx!.lineTo(nodes[b].x * w, nodes[b].y * h);
          ctx!.stroke();
        }
      }

      // Neurons.
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        const r = 1.2 + glow[i] * 2.4;
        ctx!.fillStyle = `rgba(255, 96, 105, ${0.35 + glow[i] * 0.65})`;
        ctx!.shadowColor = 'rgba(225, 29, 42, 0.9)';
        ctx!.shadowBlur = 6 + glow[i] * 10;
        ctx!.beginPath();
        ctx!.arc(n.x * w, n.y * h, r, 0, Math.PI * 2);
        ctx!.fill();
      }
      ctx!.shadowBlur = 0;

      raf = requestAnimationFrame(draw);
    }
    raf = requestAnimationFrame(draw);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return <canvas ref={canvasRef} className={className} aria-hidden />;
}
