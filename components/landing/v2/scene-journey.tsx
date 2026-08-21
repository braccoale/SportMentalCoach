'use client';

import { useRef } from 'react';
import type { ReactNode } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';
import { CardDivider, SceneCard } from './card';
import { setDayMode } from './smooth-scroll';
import { METRIC_META } from '@/components/session-compass/metric-model';
import { DEMO_COMPASS, DEMO_JOURNEY } from './demo-compass';

gsap.registerPlugin(ScrollTrigger, useGSAP);

/**
 * Scena 3 — il percorso.
 *
 * Il cuore della pagina, e l'unico posto in cui lo scroll verticale muove
 * qualcosa in orizzontale: sei biglietti su un binario, dentro una sezione
 * bloccata.
 *
 * Qui succede anche l'alba. La luce non arriva a un'altezza fissa della
 * pagina, arriva al 52% del *percorso*: se si torna indietro, torna buio.
 * È l'unico modo in cui il passaggio significa qualcosa invece di essere una
 * transizione di fondo — il buio è il lavoro che si accumula, la luce è il
 * lavoro che si è sistemato da solo.
 *
 * La stagione la porta una classe (`.kp2-lit`) su questa sezione, non un
 * tween: le variabili di ruolo del foglio si ridefiniscono per tutto il
 * sottoalbero e il CSS interpola in novecento millisecondi. GSAP, in tutto
 * questo, muove soltanto una `x`.
 *
 * Su telefono il binario non esiste: `matchMedia` non crea nemmeno la
 * timeline e le sei tappe restano una colonna (le regole stanno in `v2.css`).
 * Sei riquadri larghi quanto lo schermo dietro tremila pixel di scroll
 * bloccato non sono una scena, sono una pagina che non risponde.
 */

type Step = {
  n: string;
  title: string;
  text: string;
  visual: ReactNode;
};

const STEPS: readonly Step[] = [
  {
    n: '01',
    title: 'Prepari la seduta',
    text: 'Il calendario e le disponibilità sono tue. L’atleta prenota lo slot che hai aperto: nessuna telefonata, nessun rimpallo di messaggi.',
    visual: <CalendarStrip />,
  },
  {
    n: '02',
    title: 'Entrate in sessione',
    text: 'La videochiamata è dentro la piattaforma. Un link solo, che è sempre lo stesso posto: non un’app in mezzo alla vostra ora.',
    visual: <CallTile />,
  },
  {
    n: '03',
    title: 'Segni i momenti',
    text: 'Quando succede qualcosa che conta lo marchi lì, mentre parlate. A fine seduta puoi lasciare una nota vocale a caldo, prima che sbiadisca.',
    visual: <BookmarkRow />,
  },
  {
    n: '04',
    title: 'KaiPai ascolta',
    text: 'Solo con il consenso di entrambi, chiesto prima e revocabile. La registrazione diventa trascrizione, la trascrizione diventa un report.',
    visual: <TranscriptPanel />,
  },
  {
    n: '05',
    title: 'Leggi il compass',
    text: 'Sintesi, temi emersi, momenti chiave, sei indicatori e gli impegni presi. Ogni riga è agganciata alla frase da cui viene: si verifica, non si crede.',
    visual: <MiniMeters />,
  },
  {
    n: '06',
    title: 'La prossima riparte da qui',
    text: 'Da dove eravate rimasti, che cosa è rimasto aperto, che cosa vale la pena riprendere. La seduta successiva non comincia da capo.',
    visual: <JourneySpark />,
  },
];

/** Oltre questa quota del percorso, è giorno. */
const DAWN = 0.52;

export function SceneJourney() {
  const root = useRef<HTMLElement>(null);
  const rail = useRef<HTMLDivElement>(null);
  const counter = useRef<HTMLSpanElement>(null);
  const bar = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();

      mm.add(
        {
          motion: '(prefers-reduced-motion: no-preference)',
          wide: '(min-width: 768px)',
        },
        (context) => {
          const { motion, wide } = context.conditions as {
            motion: boolean;
            wide: boolean;
          };
          if (!motion) return;

          const track = rail.current;
          const section = root.current;
          if (!track || !section) return;

          /* Su telefono il binario è una colonna, e l'alba non può essere
             agganciata a una corsa orizzontale che non esiste. Si aggancia
             alla stessa quota del percorso — la quarta tappa — misurata sullo
             scorrimento della sezione. Senza questo, l'app restava notte fino
             al compass e poi la luce arrivava di colpo, al cambio di sezione:
             il passaggio che è il senso di tutta la pagina scompariva proprio
             sul dispositivo da cui la maggior parte della gente la guarda. */
          if (!wide) {
            ScrollTrigger.create({
              trigger: section,
              start: 'top top',
              end: 'bottom bottom',
              onUpdate: (self) => {
                const day = self.progress > DAWN;
                section.classList.toggle('kp2-lit', day);
                setDayMode(day);
              },
              onLeaveBack: () => {
                section.classList.remove('kp2-lit');
                setDayMode(false);
              },
            });

            gsap.utils.toArray<HTMLElement>('[data-step]').forEach((step) => {
              gsap.fromTo(
                step,
                { autoAlpha: 0, y: 26 },
                {
                  autoAlpha: 1,
                  y: 0,
                  duration: 0.6,
                  ease: 'power2.out',
                  scrollTrigger: { trigger: step, start: 'top 88%' },
                },
              );
            });
            return;
          }

          /* La corsa è la larghezza che sporge dallo schermo, misurata quando
             serve e rimisurata a ogni refresh: dipende dal testo, e il testo
             dipende dal font, che arriva dopo il primo layout. */
          const overflow = () => Math.max(0, track.scrollWidth - window.innerWidth);

          gsap.to(track, {
            x: () => -overflow(),
            ease: 'none',
            scrollTrigger: {
              trigger: section,
              start: 'top top',
              end: () => `+=${overflow() + window.innerHeight * 0.4}`,
              pin: true,
              scrub: 0.7,
              anticipatePin: 1,
              invalidateOnRefresh: true,
              onUpdate: (self) => {
                const step = Math.min(
                  STEPS.length,
                  Math.floor(self.progress * STEPS.length) + 1,
                );
                if (counter.current) {
                  counter.current.textContent = String(step).padStart(2, '0');
                }
                if (bar.current) {
                  bar.current.style.transform = `scaleX(${self.progress})`;
                }

                const day = self.progress > DAWN;
                section.classList.toggle('kp2-lit', day);
                setDayMode(day);
              },
              onLeaveBack: () => {
                section.classList.remove('kp2-lit');
                setDayMode(false);
              },
            },
          });

          /* La fotografia dietro scorre a un terzo della velocità dei
             biglietti. È tutta la profondità che serve: di più e il fondo
             diventa il soggetto. */
          gsap.to('[data-parallax]', {
            xPercent: -12,
            ease: 'none',
            scrollTrigger: {
              trigger: section,
              start: 'top top',
              end: () => `+=${overflow() + window.innerHeight * 0.4}`,
              scrub: 1,
              invalidateOnRefresh: true,
            },
          });
        },
      );
    },
    { scope: root },
  );

  return (
    <section
      ref={root}
      /* `metodo` non e` decorativo: l'hero riusato dalla home ha un link
         «Scopri il Metodo» che punta a `#metodo`, e su questa pagina quella
         sezione non esiste. Senza questo id il link non porta da nessuna
         parte — un pulsante che non fa niente e` peggio di un pulsante che
         manca. Qui atterra sul percorso, che e` il metodo raccontato. */
      id="metodo"
      className="kp2-scene-pinned kp2-season kp2-ground kp2-grain relative flex h-[100svh] flex-col justify-center overflow-hidden"
    >
      {/* La notte dietro i biglietti: serve al vetro, che senza qualcosa da
          sfocare è un rettangolo grigio. Esce di scena quando arriva la luce. */}
      <div
        data-parallax
        aria-hidden
        className="kp2-nightshot absolute inset-0 z-0 scale-110"
      >
        <img
          src="/stadio.jpg"
          alt=""
          width={1600}
          height={985}
          className="h-full w-full object-cover opacity-45 blur-[2px]"
        />
        <div className="absolute inset-0 bg-kp-ink/70" />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-7xl px-5 pt-24 sm:px-8 md:pt-0">
        <div className="flex items-end justify-between gap-6">
          <div>
            <p className="kp2-eyebrow text-kp-red">Il percorso</p>
            <h2 className="kp2-display kp2-fg mt-4 max-w-xl text-[clamp(1.8rem,4vw,3.2rem)]">
              Una seduta, dal prima al dopo.
            </h2>
          </div>

          <p className="kp2-num kp2-mid hidden shrink-0 text-sm md:block">
            <span ref={counter} className="kp2-fg text-2xl">
              01
            </span>
            <span className="mx-1">/</span>
            {String(STEPS.length).padStart(2, '0')}
          </p>
        </div>

        <div className="kp2-hair relative mt-6 hidden h-px w-full md:block">
          <div
            ref={bar}
            className="absolute inset-0 origin-left bg-kp-red"
            style={{ transform: 'scaleX(0)' }}
          />
        </div>
      </div>

      <div className="relative z-10 mt-8 md:mt-12">
        <div
          ref={rail}
          className="kp2-rail flex w-max items-stretch gap-5 px-5 sm:gap-6 sm:px-8 md:px-[8vw]"
        >
          {STEPS.map((step) => (
            <article
              key={step.n}
              data-step
              className="kp2-anim w-[min(78vw,25rem)] shrink-0"
            >
              <SceneCard className="h-full">
                <div className="flex h-full flex-col p-6 sm:p-7">
                  <p className="kp2-num text-sm text-kp-red">{step.n}</p>
                  <h3 className="kp2-display kp2-fg mt-3 text-2xl sm:text-[1.75rem]">
                    {step.title}
                  </h3>
                  {/* Un'altezza minima sul paragrafo allinea i fili delle sei
                      card senza incollarli in fondo. La versione precedente
                      spingeva il dettaglio a fondo card con `mt-auto`: siccome
                      le card si allungano tutte quanto la piu` alta, nelle
                      altre si apriva un vuoto in mezzo — e un vuoto in mezzo
                      si legge come un pezzo che non ha caricato. Adesso lo
                      spazio che avanza sta sotto, dove lo spazio e` respiro. */}
                  <p className="kp2-mid mt-3 min-h-[4.75rem] text-sm leading-relaxed">
                    {step.text}
                  </p>

                  <CardDivider className="mt-4" />
                  <div className="pt-5">{step.visual}</div>
                </div>
              </SceneCard>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── I sei dettagli ───────────────────────────────────────────────
   Sotto il filo, ogni card mostra un pezzo di prodotto invece di descriverlo.
   La differenza non e` decorativa: «segni i momenti» si capisce leggendo, ma
   «12:04 — qui cambia tono» sopra una riga di dialogo vero si capisce senza
   leggere, ed e` l'unica cosa che una card larga quattrocento pixel possa
   sperare di ottenere.

   Il contenuto arriva da `demo-compass.ts`, cioè dagli stessi dati che passano
   il validatore del prodotto. Nessuna metrica su dieci, nessun numero
   inventato: la scala e` 1–5 perché 1–5 e` quello che il compass produce. */

function Frame({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`kp2-card-line overflow-hidden rounded-xl p-3 ${className}`}>
      {children}
    </div>
  );
}

/** Una riga di trascrizione: chi parla, e che cosa. */
function Line({ who, text }: { who: 'coach' | 'athlete'; text: string }) {
  return (
    <p className="text-[11px] leading-snug">
      <span className={who === 'coach' ? 'text-kp-red' : 'kp2-fg font-medium'}>
        {who === 'coach' ? 'Coach' : 'Atleta'}:{' '}
      </span>
      <span className="kp2-mid">{text}</span>
    </p>
  );
}

/* 01 · Il calendario, con lo slot che l'atleta ha preso. */
function CalendarStrip() {
  const slots = ['09:00', '10:30', '17:00', '18:30'];
  return (
    <Frame>
      <div className="flex items-baseline justify-between">
        <p className="kp2-eyebrow kp2-mid">Giovedì 12</p>
        <p className="kp2-num kp2-low text-[10px]">4 slot aperti</p>
      </div>
      <div className="mt-3 grid grid-cols-4 gap-1.5">
        {slots.map((slot, index) => (
          <div
            key={slot}
            className={`kp2-num rounded-md px-1 py-2 text-center text-[11px] ${
              index === 2
                ? 'bg-kp-red font-semibold text-white'
                : 'kp2-mid [background-color:var(--kp2-line)]'
            }`}
          >
            {slot}
          </div>
        ))}
      </div>
      <p className="kp2-low mt-2.5 text-[10px]">Giulia M. ha prenotato le 17:00</p>
    </Frame>
  );
}

/* 02 · La videochiamata.
   È una schermata intera, non una composizione: arriva già con la propria
   barra di controlli, il riquadro del coach e l'orologio della sessione. Per
   questo qui sopra non ci va nient'altro — i controlli sovrapposti che c'erano
   prima si vedrebbero due volte, e due barre di controlli in una card larga
   quattrocento pixel sono il modo piu` rapido di far sembrare finto qualcosa
   che finto non sembrava.

   Il file servito e` il `.webp` da 1100px: l'originale e` un PNG da 1,8 MB, che
   per un dettaglio dentro una card e` un costo che nessuno vede e tutti
   pagano. Trentadue kilobyte contro milleottocento, stessa immagine. */
function CallTile() {
  return (
    <Frame className="!p-0">
      <img
        src="/videochiamata.webp"
        alt="Una seduta in videochiamata dentro KaiPai: l'atleta a schermo intero e il coach nel riquadro in alto"
        width={1100}
        height={733}
        className="block aspect-[3/2] w-full object-cover"
      />
    </Frame>
  );
}

/* 03 · I momenti marcati, sopra il dialogo da cui vengono. */
function BookmarkRow() {
  return (
    <Frame>
      <Line who="athlete" text="Continuavo a rivedere l’errore." />
      <div className="mt-2 flex items-center gap-2 rounded-md bg-kp-red/12 px-2 py-1.5">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-kp-red" />
        <span className="kp2-num text-[10px] text-kp-red">12:04</span>
        <span className="kp2-fg truncate text-[10px] font-medium">
          Qui cambia tono
        </span>
      </div>
      <div className="mt-2 flex items-center gap-2 px-2">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-kp-red/50" />
        <span className="kp2-num kp2-mid text-[10px]">31:20</span>
        <span className="kp2-mid truncate text-[10px]">Da riprendere</span>
      </div>
    </Frame>
  );
}

/* 04 · La trascrizione mentre arriva, e il consenso che la rende possibile. */
function TranscriptPanel() {
  const bars = [5, 9, 14, 8, 18, 24, 16, 11, 20, 28, 22, 13, 9, 17, 26, 19, 12, 8];
  return (
    <Frame>
      <div className="flex items-baseline justify-between">
        <p className="kp2-eyebrow kp2-mid">Trascrizione</p>
        <p className="kp2-num kp2-low text-[10px]">00:12:45</p>
      </div>

      <div className="mt-2.5 space-y-1.5">
        <Line who="athlete" text="Ho smesso di cercare la palla." />
        <Line who="coach" text="Che cosa succedeva nella tua testa?" />
      </div>

      <div className="mt-3 flex h-6 items-center gap-[2px]">
        {bars.map((height, index) => (
          <span
            key={index}
            className="w-full rounded-full bg-kp-red/60"
            style={{ height: `${height}px` }}
          />
        ))}
      </div>

      <p className="kp2-low mt-2 text-[10px]">Consenso di entrambi · revocabile</p>
    </Frame>
  );
}

/* 05 · Gli indicatori veri del compass, con la loro evidenza. */
function MiniMeters() {
  const chiavi = ['concentration', 'emotional_management', 'confidence'] as const;
  const righe = chiavi.map((key) => {
    const metrica = (DEMO_COMPASS.sessionOverview.metrics ?? []).find(
      (candidata) => candidata.key === key
    );
    return { key, value: metrica?.value ?? 0, meta: METRIC_META[key] };
  });

  return (
    <Frame>
      <p className="kp2-eyebrow kp2-mid">Indicatori · scala 1–5</p>
      <div className="mt-2.5 space-y-2">
        {righe.map((riga) => (
          <div key={riga.key}>
            <div className="flex items-baseline justify-between">
              <span className="kp2-mid text-[11px]">{riga.meta.shortLabel}</span>
              <span className="kp2-num kp2-fg text-[11px]">{riga.value}/5</span>
            </div>
            <div className="kp2-meter mt-1 h-1">
              <span
                className="kp2-meter-fill block h-full"
                style={{
                  width: `${(riga.value / 5) * 100}%`,
                  backgroundColor: riga.meta.color,
                }}
              />
            </div>
          </div>
        ))}
      </div>
      <p className="kp2-low mt-2.5 truncate text-[10px] italic">
        «Continuavo a rivedere l’errore» · min 3
      </p>
    </Frame>
  );
}

/* 06 · Il percorso, che è l'unica cosa che un grafico dice meglio di una
   frase: quattro sedute, e la direzione. */
function JourneySpark() {
  const larghezza = 300;
  const altezza = 44;
  const serie = [
    {
      key: 'concentrazione',
      color: METRIC_META.concentration.color,
      values: DEMO_JOURNEY.map((entry) => entry.concentration),
    },
    {
      key: 'gestione',
      color: METRIC_META.emotional_management.color,
      values: DEMO_JOURNEY.map((entry) => entry.emotionalManagement),
    },
  ];

  /* La scala è 1–5 e si mappa quella, non zero–massimo: altrimenti un percorso
     stabile sembrerebbe appiattito sul fondo, che è un'altra notizia. */
  const y = (value: number) => altezza - ((value - 1) / 4) * altezza;
  const x = (index: number, total: number) =>
    (index / Math.max(1, total - 1)) * larghezza;

  return (
    <Frame>
      <div className="flex items-baseline justify-between">
        <p className="kp2-eyebrow kp2-mid">Ultime 4 sedute</p>
        <p className="kp2-num kp2-low text-[10px]">gen → mar</p>
      </div>

      <svg
        viewBox={`0 -4 ${larghezza} ${altezza + 8}`}
        className="mt-2 h-16 w-full"
        fill="none"
        role="img"
        aria-label="Andamento di concentrazione e gestione emotiva nelle ultime quattro sedute"
      >
        {/* I due estremi della scala. Senza, una serie che oscilla fra 2 e 3
            sembra una linea rotta invece di un percorso stabile: il grafico
            deve dire *dove* stanno quei numeri, non solo che cambiano. */}
        {[0, altezza].map((y) => (
          <line
            key={y}
            x1="0"
            y1={y}
            x2={larghezza}
            y2={y}
            stroke="var(--kp2-line)"
            strokeWidth="1"
          />
        ))}

        {serie.map((linea) => (
          <g key={linea.key}>
            <polyline
              points={linea.values
                .map((value, index) => `${x(index, linea.values.length).toFixed(1)},${y(value).toFixed(1)}`)
                .join(' ')}
              stroke={linea.color}
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {linea.values.map((value, index) => (
              <circle
                key={index}
                cx={x(index, linea.values.length)}
                cy={y(value)}
                r="2.5"
                fill={linea.color}
              />
            ))}
          </g>
        ))}
      </svg>

      <div className="mt-1 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[10px]">
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: METRIC_META.concentration.color }}
          />
          <span className="kp2-mid">Concentrazione</span>
        </span>
        <span className="flex items-center gap-1.5 text-[10px]">
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: METRIC_META.emotional_management.color }}
          />
          <span className="kp2-mid">Gestione emotiva</span>
        </span>
      </div>
    </Frame>
  );
}
