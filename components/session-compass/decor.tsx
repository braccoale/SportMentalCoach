/**
 * Ornamenti disegnati per le sezioni chiare.
 *
 * SVG e non immagini: si adattano a qualunque larghezza, non sgranano su
 * schermi densi, non aggiungono file da ospitare e seguono la palette del
 * prodotto invece di portarne una propria.
 *
 * Stanno sempre sotto al contenuto e non intercettano il mouse: un ornamento
 * che ruba un clic smette di essere un ornamento.
 */

/** Onde morbide: accompagna i passaggi di una conversazione. */
export function WaveDecor({ className = '' }: { className?: string }) {
  return (
    <svg
      className={`pointer-events-none select-none ${className}`}
      viewBox="0 0 320 420"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="kp-decor-wave" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#c4b5fd" />
          <stop offset="55%" stopColor="#8b5cf6" />
          <stop offset="100%" stopColor="#f59e0b" />
        </linearGradient>
      </defs>
      <rect width="320" height="420" fill="#17152a" />
      {[0, 1, 2, 3, 4, 5, 6].map((index) => (
        <path
          key={index}
          d={`M-20 ${120 + index * 34} C 60 ${60 + index * 30}, 150 ${250 + index * 20}, 340 ${140 + index * 32}`}
          fill="none"
          stroke="url(#kp-decor-wave)"
          strokeWidth={index % 2 === 0 ? 2.5 : 1.2}
          opacity={0.75 - index * 0.08}
          strokeLinecap="round"
        />
      ))}
    </svg>
  );
}

/** Rete di punti: accompagna ciò che è stato messo in relazione. */
export function NetworkDecor({ className = '' }: { className?: string }) {
  const nodes = [
    [24, 40], [72, 18], [118, 58], [58, 96], [104, 124],
    [150, 92], [22, 132], [140, 26], [86, 160], [156, 150],
  ] as const;
  return (
    <svg
      className={`pointer-events-none select-none ${className}`}
      viewBox="0 0 180 180"
      aria-hidden="true"
      focusable="false"
    >
      <g stroke="#a78bfa" strokeWidth="0.7" opacity="0.45">
        {nodes.map(([x1, y1], index) =>
          nodes.slice(index + 1).map(([x2, y2]) => {
            const distance = Math.hypot(x2 - x1, y2 - y1);
            // Solo i punti vicini si collegano: una rete tutta connessa
            // diventa una macchia, non una rete.
            return distance < 62 ? (
              <line key={`${x1}-${y1}-${x2}-${y2}`} x1={x1} y1={y1} x2={x2} y2={y2} />
            ) : null;
          })
        )}
      </g>
      {nodes.map(([x, y], index) => (
        <circle
          key={`${x}-${y}`}
          cx={x}
          cy={y}
          r={index % 3 === 0 ? 3 : 1.8}
          fill="#8b5cf6"
          opacity={index % 3 === 0 ? 0.55 : 0.35}
        />
      ))}
    </svg>
  );
}

/** Sfera in orbita: accompagna l'intestazione di una sessione. */
export function OrbitDecor({ className = '' }: { className?: string }) {
  return (
    <svg
      className={`pointer-events-none select-none ${className}`}
      viewBox="0 0 220 120"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <radialGradient id="kp-orbit-core" cx="38%" cy="32%" r="70%">
          <stop offset="0%" stopColor="#ede9fe" />
          <stop offset="45%" stopColor="#a78bfa" />
          <stop offset="100%" stopColor="#6d28d9" />
        </radialGradient>
        <linearGradient id="kp-orbit-ring" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor="#c4b5fd" stopOpacity="0.15" />
          <stop offset="50%" stopColor="#8b5cf6" stopOpacity="0.75" />
          <stop offset="100%" stopColor="#c4b5fd" stopOpacity="0.15" />
        </linearGradient>
      </defs>

      {/* Tre ellissi inclinate diversamente: bastano a leggere una sfera in
          orbita senza disegnarla in prospettiva. */}
      {[-18, 8, 32].map((angle, index) => (
        <ellipse
          key={angle}
          cx="150"
          cy="60"
          rx={62 - index * 6}
          ry={22 + index * 5}
          fill="none"
          stroke="url(#kp-orbit-ring)"
          strokeWidth={index === 1 ? 1.4 : 0.9}
          transform={`rotate(${angle} 150 60)`}
        />
      ))}

      {[[92, 44], [206, 74], [118, 88], [188, 34]].map(([cx, cy], index) => (
        <circle
          key={`${cx}-${cy}`}
          cx={cx}
          cy={cy}
          r={index % 2 === 0 ? 2.2 : 1.4}
          fill="#8b5cf6"
          opacity={0.55}
        />
      ))}

      <circle cx="152" cy="58" r="20" fill="url(#kp-orbit-core)" />
      <circle cx="152" cy="58" r="28" fill="#8b5cf6" opacity="0.12" />
    </svg>
  );
}
