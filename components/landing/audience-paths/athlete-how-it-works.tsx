import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowRight,
  BadgeCheck,
  CalendarCheck,
  Search,
  TrendingUp,
} from 'lucide-react';
import { DEMO_ATHLETE, DEMO_JOURNEY } from '@/components/landing/v2/demo-compass';
import { AUDIENCE_CARDS } from './audience-cards';
import { audiencePhotoName } from './morph-navigation';
import { AUDIENCE_PRIMARY_CTA } from './audience-page-hero';

/**
 * La prima schermata di /atleti: niente hero, subito «come funziona» in tre
 * passi, ognuno con la sua schermata.
 *
 * Le tre schede sono interfaccia disegnata in codice, non screenshot, e non
 * dicono niente che il prodotto non faccia:
 * - il coach è un esempio dichiarato, senza valutazione né recensioni (una
 *   valutazione inventata sarebbe una recensione finta);
 * - la prenotazione è una richiesta che il coach conferma, e solo in
 *   videochiamata — nessuna modalità «dal vivo»;
 * - il percorso è `DEMO_JOURNEY`, la demo nella forma vera del prodotto
 *   (un'atleta inventata e dichiarata tale), non dati di un atleta reale.
 *
 * La foto di sfondo è quella della card «Atleti» e porta lo stesso nome di
 * transizione: è l'arrivo del morph dalla home.
 */
const STEPS = [
  {
    n: '01',
    t: 'Trova il coach',
    b: 'Sfoglia i mental coach per sport, specialità, livello e lingua.',
    caption: 'Coach approvati dal team KaiPai',
    icon: Search,
  },
  {
    n: '02',
    t: 'Chiedi il primo incontro',
    b: 'Scegli giorno e orario: il coach conferma, e la seduta è in videochiamata.',
    caption: 'Nulla è dovuto finché il coach non conferma',
    icon: CalendarCheck,
  },
  {
    n: '03',
    t: 'Fai progressi',
    b: 'Obiettivi, temi e andamento restano in una pagina tua, seduta dopo seduta.',
    caption: 'Il tuo percorso, sempre sotto gli occhi',
    icon: TrendingUp,
  },
] as const;

const MONTHS = ['GEN', 'FEB', 'MAR', 'APR', 'MAG', 'GIU', 'LUG', 'AGO', 'SET', 'OTT', 'NOV', 'DIC'];

function shortDate(iso: string | null): string {
  if (!iso) return '';
  const [, m, d] = iso.split('-');
  return `${Number(d)} ${MONTHS[Number(m) - 1]}`;
}

/** Media delle due metriche della demo, sulla scala 1–5 del Compass. */
function demoLevel(entry: (typeof DEMO_JOURNEY)[number]): number {
  return (entry.concentration + entry.emotionalManagement) / 2;
}

export function AthleteHowItWorks() {
  const card = AUDIENCE_CARDS.find((c) => c.id === 'athletes')!;

  return (
    <section className="relative isolate overflow-hidden">
      <div
        data-aud-hero="athletes"
        className="absolute inset-0 -z-10"
        style={{ viewTransitionName: audiencePhotoName('athletes') }}
      >
        <Image
          src={card.image.src}
          alt={card.image.alt}
          fill
          priority
          sizes="100vw"
          className="object-cover"
          style={{ objectPosition: '70% 30%' }}
        />
        <div className="absolute inset-0 bg-kp-ink/80" />
        <div className="absolute inset-0 bg-gradient-to-b from-kp-ink/60 via-transparent to-kp-ink" />
      </div>

      <div className="mx-auto w-full max-w-7xl px-5 pt-24 pb-16 sm:px-8 lg:pt-28">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="kp-eyebrow text-kp-red">Mental coaching per atleti · Come funziona</p>
            <h1 className="kp-display mt-4 max-w-3xl text-[clamp(1.9rem,3.8vw,3.1rem)] leading-[1.04] text-kp-hi">
              {card.headlineLead}{' '}
              <span className="text-kp-red">{card.headlineEmphasis}</span>
            </h1>
          </div>
          <Link href="/coaches" className={`${AUDIENCE_PRIMARY_CTA} w-fit shrink-0`}>
            Trova il tuo coach
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </div>

        <ol className="mt-10 grid items-start gap-10 lg:grid-cols-3 lg:gap-8">
          {STEPS.map((step, i) => (
            <li key={step.n} className="relative">
              <span className="kp-display text-5xl leading-none text-kp-hi/25">
                {step.n}
              </span>
              <h2 className="mt-3 font-display text-xl font-semibold text-kp-hi">
                {step.t}
              </h2>
              <p className="mt-2 min-h-[3rem] text-sm leading-relaxed text-kp-mid">
                {step.b}
              </p>

              <div className="relative mt-5">
                {i === 0 ? <CoachCard /> : i === 1 ? <BookingCard /> : <JourneyCard />}
                {i < STEPS.length - 1 ? (
                  <ArrowRight
                    aria-hidden
                    className="absolute -right-7 top-1/2 hidden h-5 w-5 -translate-y-1/2 text-kp-red lg:block"
                  />
                ) : null}
              </div>

              {/* Su mobile la frase sta sotto il suo passo; su desktop in una
                  riga comune, così resta allineata anche se le schede hanno
                  altezze diverse. */}
              <StepCaption step={step} className="mt-5 lg:hidden" />
            </li>
          ))}
        </ol>
        <ul className="mt-8 hidden gap-8 lg:grid lg:grid-cols-3" aria-hidden>
          {STEPS.map((step) => (
            <li key={step.n}>
              <StepCaption step={step} />
            </li>
          ))}
        </ul>

      </div>
    </section>
  );
}

function StepCaption({
  step,
  className = '',
}: {
  step: (typeof STEPS)[number];
  className?: string;
}) {
  return (
    <p className={`flex items-center gap-3 text-sm text-kp-hi ${className}`}>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/15">
        <step.icon className="h-4 w-4 text-kp-red" aria-hidden />
      </span>
      {step.caption}
    </p>
  );
}

/* ── Le tre schermate ── */

const UI_CARD =
  'rounded-3xl bg-white p-5 text-kp2-dayhi shadow-[0_24px_60px_-24px_rgba(0,0,0,0.7)]';

function ExampleTag() {
  return (
    <span className="rounded-full bg-kp2-day2 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-kp2-daymid">
      Esempio
    </span>
  );
}

function CoachCard() {
  return (
    <div className="relative">
      {/* Un secondo profilo sfocato dietro: «ce ne sono altri», non da leggere. */}
      <div
        aria-hidden
        className="absolute -left-4 -top-3 hidden h-full w-full rotate-[-4deg] rounded-3xl bg-white/45 blur-[2px] sm:block"
      >
        <div className="relative m-5 h-12 w-12 overflow-hidden rounded-full">
          <Image src="/coach-giulia.jpg" alt="" fill sizes="48px" className="object-cover" />
        </div>
      </div>
      <div className={`relative ${UI_CARD}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-full">
              <Image src="/coach-marco.jpg" alt="" fill sizes="56px" className="object-cover" />
            </div>
            <div>
              <p className="flex items-center gap-1 font-display font-semibold">
                Marco R.
                <BadgeCheck className="h-4 w-4 text-kp-red" aria-label="Profilo approvato" />
              </p>
              <p className="text-xs text-kp2-daymid">Mental coach · Tennis</p>
            </div>
          </div>
          <ExampleTag />
        </div>
        <ul className="mt-4 flex flex-wrap gap-1.5">
          {['Pressione in gara', 'Concentrazione', 'Under 18'].map((b) => (
            <li
              key={b}
              className="rounded-full bg-kp2-day2 px-2.5 py-1 text-[11px] font-semibold text-kp2-dayhi"
            >
              {b}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm italic leading-relaxed text-kp2-daymid">
          “Aiuto i giovani atleti a esprimere il loro potenziale, in campo e fuori.”
        </p>
        <span className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-green-600 py-2.5 text-sm font-semibold text-white">
          Vedi profilo
          <ArrowRight className="h-4 w-4" aria-hidden />
        </span>
      </div>
    </div>
  );
}

function BookingCard() {
  const days = ['Lun 12', 'Mar 13', 'Mer 14', 'Gio 15', 'Ven 16'];
  const times = ['09:00', '10:30', '14:00', '17:00'];
  return (
    <div className={UI_CARD}>
      <div className="flex items-start justify-between gap-3">
        <p className="font-display font-semibold">Scegli giorno e orario</p>
        <ExampleTag />
      </div>
      <p className="mt-1 text-xs text-kp2-daymid">Seduta in videochiamata · 60 min</p>
      <ul className="mt-4 grid grid-cols-5 gap-1.5">
        {days.map((d) => (
          <li
            key={d}
            className={`rounded-xl py-2 text-center text-[11px] font-semibold ${
              d === 'Mar 13' ? 'bg-kp2-dayhi text-white' : 'bg-kp2-day2 text-kp2-dayhi'
            }`}
          >
            {d}
          </li>
        ))}
      </ul>
      <ul className="mt-2 grid grid-cols-4 gap-1.5">
        {times.map((t) => (
          <li
            key={t}
            className={`rounded-xl py-2 text-center text-xs font-semibold ${
              t === '10:30'
                ? 'bg-white text-kp2-dayhi ring-2 ring-kp-red'
                : 'bg-kp2-day2 text-kp2-dayhi'
            }`}
          >
            {t}
          </li>
        ))}
      </ul>
      <span className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-green-600 py-2.5 text-sm font-semibold text-white">
        Richiedi l’incontro
        <ArrowRight className="h-4 w-4" aria-hidden />
      </span>
      <p className="mt-3 text-center text-[11px] text-kp2-daymid">
        Il coach conferma prima che la seduta sia fissata.
      </p>
    </div>
  );
}

function JourneyCard() {
  const levels = DEMO_JOURNEY.map(demoLevel);
  // Linea sulla scala 1–5: x equidistanti, y invertita (5 in alto).
  const W = 240;
  const H = 70;
  const points = levels
    .map((v, i) => {
      const x = 8 + (i * (W - 16)) / (levels.length - 1);
      const y = 8 + ((5 - v) / 4) * (H - 16);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const last = DEMO_JOURNEY[DEMO_JOURNEY.length - 1];

  return (
    <div className={UI_CARD}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-display font-semibold">Il percorso</p>
          <p className="text-xs text-kp2-daymid">
            {DEMO_ATHLETE.name} · {DEMO_ATHLETE.sport}
          </p>
        </div>
        <ExampleTag />
      </div>

      <ol className="mt-4 flex items-center gap-1.5" aria-label="Sedute del percorso">
        {DEMO_JOURNEY.map((entry, i) => (
          <li key={entry.sessionId} className="flex flex-1 items-center gap-1.5">
            <span
              className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                i === DEMO_JOURNEY.length - 1 ? 'bg-kp-red' : 'bg-kp2-dayhi'
              }`}
            />
            {i < DEMO_JOURNEY.length - 1 ? <span className="h-px flex-1 bg-kp2-dayline" /> : null}
          </li>
        ))}
      </ol>
      <div className="mt-1 flex justify-between text-[10px] font-semibold text-kp2-daylow">
        {DEMO_JOURNEY.map((entry) => (
          <span key={entry.sessionId}>{shortDate(entry.sessionDate)}</span>
        ))}
      </div>

      <div className="mt-4 rounded-2xl bg-kp2-day2 p-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-kp2-daymid">
          Progresso complessivo
        </p>
        <svg viewBox={`0 0 ${W} ${H}`} className="mt-1 h-16 w-full" aria-hidden>
          <polyline
            points={points}
            fill="none"
            stroke="var(--color-kp-red)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <div className="flex justify-between text-[10px] text-kp2-daylow">
          <span>Basso</span>
          <span>Alto</span>
        </div>
      </div>

      <p className="mt-4 text-[11px] font-semibold uppercase tracking-wide text-kp2-daymid">
        Ultima seduta · {shortDate(last.sessionDate)}
      </p>
      <p className="mt-1 text-sm font-semibold">{last.focus}</p>
      <ul className="mt-2 flex flex-wrap gap-1.5">
        {last.themes.map((theme) => (
          <li
            key={theme}
            className="rounded-full bg-kp2-day2 px-2.5 py-1 text-[11px] font-semibold text-kp2-dayhi"
          >
            {theme}
          </li>
        ))}
      </ul>
    </div>
  );
}
