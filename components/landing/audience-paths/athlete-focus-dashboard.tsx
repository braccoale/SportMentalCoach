import type { ComponentType } from 'react';
import {
  ArrowRight,
  BarChart3,
  Brain,
  CalendarDays,
  ChevronRight,
  CirclePlus,
  ClipboardList,
  Crosshair,
  Target,
  TrendingUp,
  TriangleAlert,
  Zap,
} from 'lucide-react';
import { DEMO_ATHLETE, DEMO_JOURNEY } from '@/components/landing/v2/demo-compass';
import { JourneyProgressChart } from '@/components/session-compass/journey-progress';
import { buildJourneyProgress } from '@/lib/core/ai-session-notes/journey-progress';
import type { MentalJourneyEntry } from '@/lib/core/ai-session-notes/mental-journey';

/**
 * «Su cosa lavori» su /atleti: i quattro temi a parole, e sotto la scheda del
 * percorso per come la vede davvero un atleta.
 *
 * La scheda è una ricostruzione statica dei pannelli del prodotto
 * (`JourneyGoalsPanel`, `JourneyCommitmentsPanel`, `JourneyThemesPanel`) —
 * quelli veri hanno azioni server e dati di una persona. Tutto viene dalla
 * demo `DEMO_JOURNEY` (Giulia M., inventata e dichiarata tale): quattro
 * sedute, e i numeri di obiettivi e temi sono contati su quelle quattro, così
 * nessun pannello dice più sedute di quante ne mostri il grafico. Il grafico
 * è `JourneyProgressChart`, lo stesso del prodotto.
 */

type Icon = ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;

const FOCUS: { t: string; b: string; icon: Icon }[] = [
  {
    t: 'Concentrazione',
    b: 'Restare dentro la gara quando intorno succede di tutto: rumore, errori, un risultato che cambia.',
    icon: Target,
  },
  {
    t: 'Gestione della pressione',
    b: 'Trasformare l’ansia pre-gara in energia utile, invece di subirla.',
    icon: Zap,
  },
  {
    t: 'Motivazione',
    b: 'Ritrovare il perché nei momenti in cui allenarsi costa di più: un infortunio, una stagione storta.',
    icon: BarChart3,
  },
  {
    t: 'Routine pre-gara',
    b: 'Costruire un rituale tuo, che ti metta nella condizione giusta ogni volta che entri in campo.',
    icon: CalendarDays,
  },
];

const SESSIONS = DEMO_JOURNEY.length;

type GoalTone = 'improving' | 'ongoing' | 'resume';

const GOALS: { title: string; touched: boolean[]; tone: GoalTone; icon: Icon }[] = [
  {
    title: 'Costruire una routine breve di reset dopo l’errore',
    touched: [true, true, true, true],
    tone: 'improving',
    icon: Crosshair,
  },
  {
    title: 'Rendere utile il dialogo interno nei momenti di pressione',
    touched: [false, true, true, true],
    tone: 'ongoing',
    icon: Brain,
  },
  {
    title: 'Comunicare bisogni e segnali utili allo staff',
    touched: [false, false, false, false],
    tone: 'resume',
    icon: Zap,
  },
];

const GOAL_TONE: Record<GoalTone, { label: string; pill: string; tint: string; bg: string }> = {
  improving: {
    label: 'In miglioramento',
    pill: 'bg-green-50 text-green-700',
    tint: 'var(--color-jp-problema)',
    bg: 'bg-red-50',
  },
  ongoing: {
    label: 'In corso',
    pill: 'bg-violet-50 text-violet-700',
    tint: 'var(--color-jp-strategia)',
    bg: 'bg-violet-50',
  },
  resume: {
    label: 'Da riprendere',
    pill: 'bg-amber-50 text-amber-800',
    tint: 'var(--color-jp-focus)',
    bg: 'bg-amber-50',
  },
};

/** Gli impegni della demo: 4 chiusi, 2 aperti, nessuno saltato. */
const COMMITMENTS = { completed: 4, inProgress: 2, skipped: 0 };

/** Quante delle quattro sedute demo toccano ogni tema: contato, non scritto. */
function themeBars() {
  const counts = new Map<string, number>();
  for (const entry of DEMO_JOURNEY) {
    for (const theme of entry.themes) counts.set(theme, (counts.get(theme) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([label, count]) => ({ label, percent: Math.round((count / SESSIONS) * 100) }));
}

/**
 * La demo nella forma che `buildJourneyProgress` si aspetta: le due metriche
 * di ogni seduta dimostrativa diventano gli indicatori del Compass. Tutto il
 * resto è vuoto perché il grafico non lo legge. La usa anche «come funziona».
 */
export const DEMO_TIMELINE: MentalJourneyEntry[] = DEMO_JOURNEY.map((entry) => ({
  sessionId: entry.sessionId,
  bookingId: 0,
  reportId: 0,
  reportVersion: 1,
  sessionDate: entry.sessionDate,
  approvedAt: entry.sessionDate ?? '',
  sharedAt: null,
  coachName: 'Marco R.',
  summary: entry.summary,
  focus: entry.focus,
  themes: [...entry.themes],
  emergingResource: null,
  throughLine: null,
  metrics: [
    { key: 'concentration', value: entry.concentration, confidence: 'medium', transcriptSegmentId: 0 },
    { key: 'emotional_management', value: entry.emotionalManagement, confidence: 'medium', transcriptSegmentId: 0 },
  ],
  keyMoments: [],
  nextSessionPrep: [],
  commitments: [],
  compassHref: '#',
  isApproved: true,
}));

const CARD =
  'rounded-3xl bg-white p-6 text-kp2-dayhi shadow-[0_24px_60px_-30px_rgba(5,5,7,0.35)] ring-1 ring-black/5';

export function AthleteFocusDashboard() {
  return (
    <section className="bg-kp-ink2 py-20 sm:py-24">
      <div className="mx-auto w-full max-w-7xl px-5 sm:px-8">
        <div className="grid gap-12 lg:grid-cols-[1fr_1.1fr] lg:items-center">
          <div>
            <p className="kp-eyebrow flex items-center gap-3 text-kp-red">
              <span className="h-px w-10 bg-kp-red" aria-hidden />
              Su cosa lavori
            </p>
            <h2 className="kp-display mt-5 text-[clamp(2rem,4.6vw,3.75rem)] leading-[1.02] text-kp-hi">
              Il fisico lo alleni ogni giorno.{' '}
              <span className="text-kp-red">La testa, quasi mai.</span>
            </h2>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-kp-mid">
              KaiPai ti aiuta a trasformare temi mentali in obiettivi concreti,
              azioni concordate e progressi visibili nel tempo.
            </p>
          </div>

          <ul className="divide-y divide-kp-line">
            {FOCUS.map((f) => (
              <li key={f.t} className="flex items-center gap-5 py-5">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-kp-red/10">
                  <f.icon className="h-5 w-5 text-kp-red" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="font-display text-lg font-semibold text-kp-hi">{f.t}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-kp-mid">{f.b}</p>
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 text-kp-mid" aria-hidden />
              </li>
            ))}
          </ul>
        </div>

        <p className="mt-14 text-xs font-semibold uppercase tracking-wider text-kp-mid">
          Esempio · il percorso di {DEMO_ATHLETE.name}, {DEMO_ATHLETE.sport.toLowerCase()}
        </p>
        <div className="mt-4 grid gap-5 lg:grid-cols-[1.05fr_1fr]">
          <GoalsCard />
          <div className="grid gap-5 sm:grid-cols-2">
            <ProgressCard />
            <CommitmentsCard />
            <ThemesCard />
          </div>
        </div>
      </div>
    </section>
  );
}

function CardHeader({ icon: Icon, title, action }: { icon: Icon; title: string; action?: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-50">
          <Icon className="h-5 w-5 text-kp-red" aria-hidden />
        </span>
        <h3 className="font-display text-base font-semibold">{title}</h3>
      </div>
      {action ? (
        <span className="flex items-center gap-1 whitespace-nowrap text-xs font-semibold text-kp-red">
          {action}
          <ChevronRight className="h-3.5 w-3.5" aria-hidden />
        </span>
      ) : null}
    </div>
  );
}

function GoalsCard() {
  return (
    <article className={`${CARD} flex flex-col`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-50">
            <Target className="h-5 w-5 text-kp-red" aria-hidden />
          </span>
          <div>
            <h3 className="font-display text-base font-semibold">Obiettivi del percorso</h3>
            <p className="mt-0.5 text-sm text-kp2-daymid">
              Trasforma i tuoi temi di lavoro in abitudini concrete, con il supporto del tuo coach.
            </p>
          </div>
        </div>
        <span className="hidden items-center gap-1 whitespace-nowrap text-xs font-semibold text-kp-red sm:flex">
          Aggiungi obiettivo
          <CirclePlus className="h-3.5 w-3.5" aria-hidden />
        </span>
      </div>

      <ul className="mt-5 flex flex-1 flex-col gap-3">
        {GOALS.map((goal) => {
          const tone = GOAL_TONE[goal.tone];
          const touched = goal.touched.filter(Boolean).length;
          return (
            <li
              key={goal.title}
              className="flex flex-1 items-center gap-3 rounded-2xl border border-kp2-dayline p-3 sm:p-4"
            >
              <span
                className={`hidden h-9 w-9 shrink-0 items-center justify-center rounded-full sm:flex ${tone.bg}`}
                style={{ color: tone.tint }}
              >
                <goal.icon className="h-4 w-4" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="min-w-0 flex-1 text-sm font-semibold text-kp2-dayhi">
                    {goal.title}
                  </p>
                  <span
                    className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${tone.pill}`}
                  >
                    {tone.label}
                  </span>
                </div>
                <p
                  className={`mt-1 flex items-center gap-1.5 text-xs ${
                    touched === 0 ? 'font-medium text-amber-700' : 'text-kp2-daymid'
                  }`}
                >
                  {touched === 0 ? (
                    <>
                      <TriangleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      Mai segnato nelle ultime {SESSIONS} sedute.
                    </>
                  ) : (
                    `Segnato in ${touched} sedute su ${SESSIONS} · l’ultima è la più recente.`
                  )}
                </p>
                <ol className="mt-2 flex items-center gap-1.5" aria-hidden>
                  {goal.touched.map((on, i) => (
                    <li
                      key={i}
                      className="size-3 rounded-full border"
                      style={{
                        borderColor: on ? tone.tint : '#d1d5db',
                        backgroundColor: on ? tone.tint : 'transparent',
                      }}
                    />
                  ))}
                </ol>
              </div>
            </li>
          );
        })}
      </ul>
    </article>
  );
}

function ProgressCard() {
  const progress = buildJourneyProgress(DEMO_TIMELINE);
  return (
    <article className={`${CARD} sm:col-span-2`}>
      <CardHeader icon={TrendingUp} title="Progresso complessivo" />
      <div className="mt-4">{progress ? <JourneyProgressChart progress={progress} /> : null}</div>
    </article>
  );
}

const RING_RADIUS = 42;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

function CommitmentsCard() {
  const total = COMMITMENTS.completed + COMMITMENTS.inProgress + COMMITMENTS.skipped;
  const rate = Math.round((COMMITMENTS.completed / total) * 100);
  const rows = [
    { label: 'Completate', count: COMMITMENTS.completed, dot: 'bg-green-600', text: 'text-green-700' },
    { label: 'In corso', count: COMMITMENTS.inProgress, dot: 'bg-amber-500', text: 'text-amber-600' },
    { label: 'Non completate', count: COMMITMENTS.skipped, dot: 'bg-kp-red', text: 'text-kp-red' },
  ];
  return (
    <article className={CARD}>
      <CardHeader icon={ClipboardList} title="Azioni concordate" />
      <div className="mt-5 flex items-center gap-4">
        <div className="relative size-20 shrink-0">
          <svg viewBox="0 0 100 100" className="size-full -rotate-90" aria-hidden>
            <circle cx="50" cy="50" r={RING_RADIUS} fill="none" stroke="#f3f4f6" strokeWidth="10" />
            <circle
              cx="50"
              cy="50"
              r={RING_RADIUS}
              fill="none"
              stroke="#16a34a"
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={`${(rate / 100) * RING_CIRCUMFERENCE} ${RING_CIRCUMFERENCE}`}
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-lg font-bold">
            {rate}%
          </span>
        </div>
        <dl className="min-w-0 flex-1 whitespace-nowrap text-xs">
          <div className="flex justify-between border-b border-kp2-dayline pb-1.5">
            <dt className="text-kp2-daymid">Totali</dt>
            <dd className="font-bold tabular-nums">{total}</dd>
          </div>
          {rows.map((row) => (
            <div key={row.label} className="flex items-center justify-between gap-2 pt-1.5">
              <dt className="flex items-center gap-1.5 text-kp2-daymid">
                <span className={`size-2 rounded-full ${row.dot}`} aria-hidden />
                {row.label}
              </dt>
              <dd className={`font-semibold tabular-nums ${row.text}`}>{row.count}</dd>
            </div>
          ))}
        </dl>
      </div>
    </article>
  );
}

function ThemesCard() {
  const tints = ['var(--color-jp-problema)', 'var(--color-jp-focus)'];
  return (
    <article className={CARD}>
      <CardHeader icon={BarChart3} title="Temi principali" />
      <ul className="mt-5 flex flex-col gap-4">
        {themeBars().map((bar, i) => (
          <li key={bar.label}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate text-kp2-dayhi">{bar.label}</span>
              <span className="tabular-nums text-kp2-daymid">{bar.percent}%</span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full rounded-full"
                style={{ width: `${bar.percent}%`, backgroundColor: tints[i % tints.length] }}
              />
            </div>
          </li>
        ))}
      </ul>
    </article>
  );
}
