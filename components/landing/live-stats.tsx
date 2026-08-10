import { Clock, Users, UserCheck, Video } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { CountUp } from './count-up';
import type { LandingStats } from '@/lib/db/schema';

/** Circonferenza dell'anello (r = 24): serve a JS e CSS per disegnarlo. */
const ARC_LEN = 2 * Math.PI * 24;

type Item = {
  icon: LucideIcon;
  value: number;
  label: string;
  caption: string;
  suffix?: string;
  /** Quanto anello resta acceso: decorativo, dà ritmo alla fila. */
  fill: number;
};

/**
 * I numeri veri della piattaforma, al posto dei vecchi badge di rassicurazione.
 *
 * Un dato misurato convince più di una promessa: qui sotto la CTA della hero
 * si vede quanti coach e atleti ci sono davvero, quante sessioni sono state
 * fatte e quante ore di ascolto ci sono dentro. I valori arrivano dalla vista
 * `landing_stats` e non sono mai scritti a mano.
 *
 * Tutto è renderizzato lato server: l'HTML contiene già le cifre finali
 * (crawler e utenti senza JS le vedono), l'animazione è solo un di più.
 */
export function LiveStats({ stats }: { stats: LandingStats }) {
  const items: Item[] = [
    {
      icon: UserCheck,
      value: stats.coaches,
      label: 'Coach',
      caption: 'Guide certificate KaiPai',
      fill: 0.72,
    },
    {
      icon: Users,
      value: stats.athletes,
      label: 'Atleti',
      caption: 'Persone in percorso',
      fill: 0.8,
    },
    {
      icon: Video,
      value: stats.sessions,
      label: 'Sessioni',
      caption: 'Incontri portati a termine',
      fill: 0.66,
    },
    {
      icon: Clock,
      value: stats.coachingHours,
      label: 'Ore',
      caption: 'Di coaching, una accanto all’altra',
      suffix: 'h',
      fill: 0.86,
    },
  ];

  return (
    <div>
      {/* Il gradiente dell'anello vive una volta sola: quattro <defs> uguali
          significherebbero quattro id duplicati nel documento. */}
      <svg width="0" height="0" className="absolute" aria-hidden>
        <defs>
          <linearGradient id="kp-stat-arc" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#f5333f" />
            <stop offset="100%" stopColor="#e11d2a" stopOpacity="0.35" />
          </linearGradient>
        </defs>
      </svg>

      <div className="mb-3 flex items-center gap-2">
        <span className="kp-live-dot relative inline-flex h-1.5 w-1.5">
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-kp-red" />
        </span>
        <span className="kp-eyebrow text-[0.6rem] text-kp-low">
          In tempo reale su KaiPai
        </span>
      </div>

      {/* Niente <Reveal> sulle singole tessere: sono sopra la piega e un
          secondo blocco di stagger, sommato a quello del contenitore, le
          teneva invisibili per oltre un secondo dopo l'apertura. Il numero
          si vede subito, l'anello e il conteggio arrivano sopra. */}
      <div className="grid max-w-2xl grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {items.map((item, i) => (
          <StatTile key={item.label} item={item} index={i} />
        ))}
      </div>
    </div>
  );
}

function StatTile({ item, index }: { item: Item; index: number }) {
  const delay = `${0.15 + index * 0.08}s`;
  const Icon = item.icon;

  return (
    <div className="kp-stat kp-glass h-full rounded-2xl px-3.5 py-3.5 sm:px-4">
      <div className="flex items-center gap-3">
        <span className="relative inline-flex h-11 w-11 shrink-0 items-center justify-center">
          {/* alone rosso che ruota piano dietro l'anello */}
          <span
            className="kp-stat-orbit absolute inset-0 rounded-full"
            style={{ '--kp-gauge-delay': delay } as React.CSSProperties}
            aria-hidden
          />
          <svg
            className="absolute inset-0 h-full w-full -rotate-90"
            viewBox="0 0 56 56"
            fill="none"
            aria-hidden
          >
            <circle
              cx="28"
              cy="28"
              r="24"
              stroke="rgba(255,255,255,0.1)"
              strokeWidth="2"
            />
            <circle
              className="kp-gauge-arc"
              cx="28"
              cy="28"
              r="24"
              stroke="url(#kp-stat-arc)"
              strokeWidth="2"
              strokeLinecap="round"
              style={
                {
                  '--kp-gauge-len': ARC_LEN.toFixed(1),
                  '--kp-gauge-off': (ARC_LEN * (1 - item.fill)).toFixed(1),
                  '--kp-gauge-delay': delay,
                } as React.CSSProperties
              }
            />
          </svg>
          <Icon className="relative h-[1.15rem] w-[1.15rem] text-kp-red" />
        </span>

        <div className="min-w-0">
          <p className="font-display text-2xl font-bold leading-none text-kp-hi sm:text-[1.75rem]">
            <CountUp to={item.value} duration={1} />
            {item.suffix && (
              <span className="text-kp-red">{item.suffix}</span>
            )}
          </p>
          <p className="kp-eyebrow mt-1.5 text-[0.58rem] text-kp-mid">
            {item.label}
          </p>
        </div>
      </div>
      <p className="mt-3 text-[0.7rem] leading-snug text-kp-low">
        {item.caption}
      </p>
    </div>
  );
}
