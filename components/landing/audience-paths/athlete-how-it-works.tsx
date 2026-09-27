import type { ComponentType, ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowRight,
  BadgeCheck,
  Gift,
  Search,
  TrendingUp,
} from 'lucide-react';
import { DEMO_ATHLETE } from '@/components/landing/v2/demo-compass';
import { JourneyProgressChart } from '@/components/session-compass/journey-progress';
import { buildJourneyProgress } from '@/lib/core/ai-session-notes/journey-progress';
import { INTRO_SESSION } from '@/lib/core/services/introduction';
import { AUDIENCE_CARDS } from './audience-cards';
import { DEMO_TIMELINE } from './athlete-focus-dashboard';
import { audiencePhotoName } from './morph-navigation';
import { AUDIENCE_PRIMARY_CTA } from './audience-page-hero';

/**
 * La prima schermata di /atleti: niente hero, subito «come funziona» in tre
 * card alte uguali — numero, titolo, descrizione e la schermata del passo.
 *
 * Non dicono niente che il prodotto non faccia:
 * - il coach è un esempio dichiarato, senza valutazione né recensioni (una
 *   valutazione inventata sarebbe una recensione finta);
 * - la prenotazione è una richiesta che il coach conferma, in videochiamata,
 *   e la prima è la sessione conoscitiva gratuita (`INTRO_SESSION`);
 * - il grafico è `JourneyProgressChart`, lo stesso del prodotto, calcolato da
 *   `buildJourneyProgress` sulla demo `DEMO_JOURNEY` (un'atleta inventata e
 *   dichiarata tale), mai su dati di un atleta reale.
 *
 * La foto di sfondo è quella della card «Atleti» e porta lo stesso nome di
 * transizione: è l'arrivo del morph dalla home.
 */
type Step = {
  n: string;
  t: string;
  b: string;
  caption: string;
  icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  screen: ReactNode;
};

const STEPS: Step[] = [
  {
    n: '1',
    t: 'Trova il coach',
    b: 'Sfoglia i mental coach per sport, specialità, livello e lingua.',
    caption: 'Scegli il tuo coach!',
    icon: Search,
    screen: <CoachScreen />,
  },
  {
    n: '2',
    t: 'Chiedi il primo incontro',
    b: 'Scegli giorno e orario: il coach conferma, e la seduta è in videochiamata.',
    caption: 'La prima sessione conoscitiva è GRATIS',
    icon: Gift,
    screen: <BookingScreen />,
  },
  {
    n: '3',
    t: 'Fai progressi',
    b: 'Obiettivi, temi e andamento restano in una pagina tua, seduta dopo seduta.',
    caption: 'Il tuo percorso, sempre sotto gli occhi',
    icon: TrendingUp,
    screen: <JourneyScreen />,
  },
];

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

      <div className="mx-auto w-full max-w-7xl px-5 pt-24 pb-14 sm:px-8 lg:pt-28">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="kp-eyebrow text-kp-red">Mental coaching per atleti · Come funziona</p>
            <h1 className="kp-display mt-4 max-w-3xl text-[clamp(1.9rem,3.6vw,3rem)] leading-[1.04] text-kp-hi">
              Scegli. Inizia. <span className="text-kp-red">Cresci.</span>
            </h1>
          </div>
          <Link href="/coaches" className={`${AUDIENCE_PRIMARY_CTA} w-fit shrink-0`}>
            Trova il tuo coach
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </div>

        {/* Tre card alte uguali: la griglia le stira, il contenuto va in
            colonna e la schermata del passo prende lo spazio che resta. */}
        <ol className="mt-10 grid gap-8 lg:grid-cols-3 lg:gap-8">
          {STEPS.map((step, i) => (
            <li key={step.n} className="relative flex flex-col">
              <div className="relative flex-1">
                {i === 0 ? <StackedCardBehind /> : null}
                <article className="relative flex h-full flex-col rounded-3xl bg-white p-6 text-kp2-dayhi shadow-[0_24px_60px_-24px_rgba(0,0,0,0.7)]">
                  <div className="flex items-start gap-4">
                    <span className="kp-display text-5xl leading-none text-kp-red">
                      {step.n}
                    </span>
                    <div>
                      <h2 className="font-display text-lg font-semibold">{step.t}</h2>
                      <p className="mt-1 text-sm leading-relaxed text-kp2-daymid">{step.b}</p>
                    </div>
                  </div>
                  <div className="mt-5 flex flex-1 flex-col border-t border-kp2-dayline pt-5">
                    {step.screen}
                  </div>
                </article>
                {i < STEPS.length - 1 ? (
                  <ArrowRight
                    aria-hidden
                    className="absolute -right-7 top-1/2 hidden h-5 w-5 -translate-y-1/2 text-kp-red lg:block"
                  />
                ) : null}
              </div>
              <p className="mt-5 flex items-center gap-3 text-sm font-semibold text-kp-hi">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/15">
                  <step.icon className="h-4 w-4 text-kp-red" aria-hidden />
                </span>
                {step.caption}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ── Le tre schermate ── */

function ExampleTag() {
  return (
    <span className="rounded-full bg-kp2-day2 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-kp2-daymid">
      Esempio
    </span>
  );
}

/** Un secondo profilo sfocato dietro la prima card: «ce ne sono altri». */
function StackedCardBehind() {
  return (
    <div
      aria-hidden
      className="absolute -left-4 -top-3 hidden h-full w-full rotate-[-4deg] rounded-3xl bg-white/45 blur-[2px] sm:block"
    >
      <div className="relative m-6 h-12 w-12 overflow-hidden rounded-full">
        <Image src="/coach-giulia.jpg" alt="" fill sizes="48px" className="object-cover" />
      </div>
    </div>
  );
}

function CoachScreen() {
  return (
    <div className="flex flex-1 flex-col">
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
      <Link
        href="/coaches"
        className="mt-auto flex w-full items-center justify-center gap-2 rounded-full bg-green-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-green-700"
      >
        Vedi i coach
        <ArrowRight className="h-4 w-4" aria-hidden />
      </Link>
    </div>
  );
}

function BookingScreen() {
  const days = ['Lun 12', 'Mar 13', 'Mer 14', 'Gio 15', 'Ven 16'];
  const times = ['09:00', '10:30', '14:00', '17:00'];
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex items-start justify-between gap-3">
        <p className="font-display font-semibold">Sessione conoscitiva</p>
        <ExampleTag />
      </div>
      <p className="mt-1 text-xs text-kp2-daymid">
        {INTRO_SESSION.durationMin} min · in videochiamata ·{' '}
        <span className="font-semibold text-kp-red">gratis</span>
      </p>
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
      <p className="mt-4 text-center text-[11px] text-kp2-daymid">
        Il coach conferma prima che la seduta sia fissata.
      </p>
      <Link
        href="/coaches"
        className="mt-auto flex w-full items-center justify-center gap-2 rounded-full bg-green-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-green-700"
      >
        Richiedi l’incontro
        <ArrowRight className="h-4 w-4" aria-hidden />
      </Link>
    </div>
  );
}

function JourneyScreen() {
  const progress = buildJourneyProgress(DEMO_TIMELINE);
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-display font-semibold">Progresso complessivo</p>
          <p className="text-xs text-kp2-daymid">
            {DEMO_ATHLETE.name} · {DEMO_ATHLETE.sport}
          </p>
        </div>
        <ExampleTag />
      </div>
      <div className="mt-4 flex-1">
        {progress ? <JourneyProgressChart progress={progress} /> : null}
      </div>
    </div>
  );
}
