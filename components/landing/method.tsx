'use client';

import { useState } from 'react';
import { Eye, Waves, TrendingUp, Fingerprint } from 'lucide-react';
import { Reveal } from './reveal';

const MUSCLES = [
  {
    key: 'lucidita',
    name: 'Lucidità',
    icon: Eye,
    line: 'Restare nel presente.',
    body: 'Focus e attenzione, quando conta di più.',
    pos: { cx: 50, cy: 8 },
    label: { x: 50, y: -2, anchor: 'middle' as const },
  },
  {
    key: 'calma',
    name: 'Calma',
    icon: Waves,
    line: 'Freddezza nei momenti caldi.',
    body: 'Gestione della pressione, dell’ansia, delle emozioni.',
    pos: { cx: 92, cy: 50 },
    label: { x: 100, y: 52, anchor: 'end' as const },
  },
  {
    key: 'fiducia',
    name: 'Fiducia',
    icon: TrendingUp,
    line: 'Giocare senza paura.',
    body: 'Autostima e coraggio di sbagliare.',
    pos: { cx: 50, cy: 92 },
    label: { x: 50, y: 104, anchor: 'middle' as const },
  },
  {
    key: 'identita',
    name: 'Identità',
    icon: Fingerprint,
    line: 'Chi sei quando perdi.',
    body: 'Carattere e resilienza, dentro e fuori dal campo.',
    pos: { cx: 8, cy: 50 },
    label: { x: 0, y: 52, anchor: 'start' as const },
  },
];

export function MethodDiamond() {
  const [active, setActive] = useState<string | null>(null);
  const points = MUSCLES.map((m) => `${m.pos.cx},${m.pos.cy}`).join(' ');

  return (
    <div className="grid items-center gap-12 lg:grid-cols-2">
      {/* Radar / "Mappa Mentale" — fully rendered in the HTML, no motion hiding */}
      <Reveal className="order-2 lg:order-1">
        <div className="relative mx-auto aspect-square w-full max-w-md">
          <div className="kp-red-glow absolute inset-6 opacity-60" />
          <svg viewBox="-6 -8 112 118" className="relative h-full w-full">
            {[36, 24, 12].map((r) => (
              <polygon
                key={r}
                points={`50,${50 - r} ${50 + r},50 50,${50 + r} ${50 - r},50`}
                fill="none"
                stroke="rgba(255,255,255,0.06)"
                strokeWidth="0.4"
              />
            ))}
            {MUSCLES.map((m) => (
              <line
                key={m.key}
                x1="50"
                y1="50"
                x2={m.pos.cx}
                y2={m.pos.cy}
                stroke="rgba(255,255,255,0.08)"
                strokeWidth="0.4"
              />
            ))}
            <polygon
              points={points}
              fill="rgba(225,29,42,0.12)"
              stroke="#e11d2a"
              strokeWidth="0.8"
            />
            {MUSCLES.map((m) => (
              <g key={m.key}>
                <circle
                  cx={m.pos.cx}
                  cy={m.pos.cy}
                  r={active === m.key ? 3.4 : 2.4}
                  fill={active === m.key ? '#f5333f' : '#f4f4f6'}
                  style={{ transition: 'r 0.2s ease, fill 0.2s ease' }}
                />
                <text
                  x={m.label.x}
                  y={m.label.y}
                  textAnchor={m.label.anchor}
                  className="fill-kp-hi font-display"
                  style={{ fontSize: 6, fontWeight: 600 }}
                >
                  {m.name}
                </text>
              </g>
            ))}
            <circle cx="50" cy="50" r="1.6" fill="#5e5e6b" />
          </svg>
          <p className="kp-eyebrow mt-2 text-center text-kp-low">
            La tua Mappa Mentale
          </p>
        </div>
      </Reveal>

      {/* The four muscles */}
      <div className="order-1 space-y-3 lg:order-2">
        {MUSCLES.map((m, i) => (
          <Reveal key={m.key} delay={i * 0.08}>
            <button
              type="button"
              onMouseEnter={() => setActive(m.key)}
              onFocus={() => setActive(m.key)}
              onMouseLeave={() => setActive(null)}
              onBlur={() => setActive(null)}
              className="kp-card flex w-full items-start gap-4 rounded-2xl p-5 text-left"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-kp-red/10 text-kp-red">
                <m.icon className="h-5 w-5" />
              </span>
              <span>
                <span className="flex items-baseline gap-2">
                  <span className="font-display text-xl font-semibold text-kp-hi">
                    {m.name}
                  </span>
                  <span className="text-sm text-kp-red">— {m.line}</span>
                </span>
                <span className="mt-1 block text-sm text-kp-mid">{m.body}</span>
              </span>
            </button>
          </Reveal>
        ))}
        <Reveal delay={0.4}>
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-kp-line bg-kp-surface/40 p-5">
            <span className="kp-eyebrow text-kp-low">Il ciclo</span>
            <span className="font-display text-lg text-kp-hi">
              Misura <span className="text-kp-red">→</span> Alza{' '}
              <span className="text-kp-red">→</span> Ripeti
            </span>
            <span className="w-full text-sm text-kp-mid">
              La mente è un muscolo. Si allena ogni giorno — non si aggiusta una
              volta sola.
            </span>
          </div>
        </Reveal>
      </div>
    </div>
  );
}
