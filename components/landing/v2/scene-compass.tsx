'use client';

import { useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';
import { METRIC_META } from '@/components/session-compass/metric-model';
import { SESSION_METRIC_KEYS } from '@/lib/core/ai-session-notes/session-compass-contract';
import { setDayMode } from './smooth-scroll';
import { DEMO_ATHLETE, DEMO_COMPASS } from './demo-compass';

gsap.registerPlugin(ScrollTrigger, useGSAP);

/**
 * Scena 4 — il Session Compass.
 *
 * La versione precedente scriveva il report un blocco alla volta dentro un
 * pannello di altezza fissa. Sulla carta era il momento migliore della pagina;
 * a schermo era un rettangolo bianco quasi vuoto con dentro un paragrafo,
 * perché nell'istante in cui la sezione si aggancia c'è scritto solo il primo
 * blocco — ed è esattamente l'istante in cui la si guarda per la prima volta.
 * Il report è la cosa che dovrebbe far dire «voglio quello»: mostrarlo vuoto
 * era il modo più efficace di non ottenerlo.
 *
 * Adesso il report c'è tutto dal primo fotogramma, denso come è denso quello
 * vero, e lo scorrimento non lo costruisce: lo **illumina**, una zona alla
 * volta. Non esiste una posizione di scroll in cui la scena sia mezza vuota.
 *
 * Perché una riproduzione e non uno screenshot. Uno screenshot del compass
 * vero conterrebbe la seduta di una persona reale: quello che un atleta ha
 * detto in seduta non finisce su una pagina pubblica, nemmeno sfocato. Qui i
 * dati sono inventati ma la forma no — barre orizzontali su scala 1–5 con i
 * colori di `METRIC_META`, la linea dell'andamento da -2 a +2, le citazioni
 * con il minuto: la stessa grammatica che il coach vede in dashboard, con
 * dentro una seduta che non è mai esistita.
 */

const METRICS = SESSION_METRIC_KEYS.map((key) => {
  const metric = (DEMO_COMPASS.sessionOverview.metrics ?? []).find(
    (candidate) => candidate.key === key,
  );
  if (!metric) throw new Error(`Metrica demo mancante: ${key}`);
  return { ...metric, meta: METRIC_META[key] };
});

const TREND = DEMO_COMPASS.sessionOverview.emotionalTrend ?? [];

/** L'andamento, da -2..+2 alle coordinate di un riquadro. */
const TREND_GEOMETRY = (() => {
  const width = 320;
  const height = 76;
  const points = TREND.map((point, index) => ({
    x: (index / Math.max(1, TREND.length - 1)) * width,
    y: height - ((point.value + 2) / 4) * height,
  }));
  return {
    width,
    height,
    points,
    line: points
      .map(
        (point, index) =>
          `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`,
      )
      .join(' '),
  };
})();

/** Le zone che il riflettore attraversa, nell'ordine in cui si leggono. */
const BEATS = [
  {
    zone: 'sintesi',
    title: 'Che cosa è successo',
    text: 'La seduta in tre righe, con le frasi da cui viene.',
  },
  {
    zone: 'temi',
    title: 'Che cosa è emerso',
    text: 'I temi, ciascuno ancorato al minuto in cui è stato detto.',
  },
  {
    zone: 'segnali',
    title: 'Come si misura',
    text: 'Sei indicatori su scala 1–5. Mai senza evidenza, mai una diagnosi.',
  },
  {
    zone: 'andamento',
    title: 'Come è andata',
    text: 'L’andamento della conversazione lungo la seduta.',
  },
  {
    zone: 'impegni',
    title: 'Che cosa avete deciso',
    text: 'Gli impegni presi, con chi li ha presi e per quando.',
  },
] as const;

/**
 * Quanto è spenta una zona che non è quella illuminata.
 *
 * Non è una preferenza estetica: a 0.34 il riflettore funzionava ma il report
 * intero sembrava sbiadito, e le sei barre colorate — che sono la cosa da
 * guardare — perdevano il colore. Risolto il vuoto, avevo creato un pallore.
 * A 0.58 tutto resta leggibile e la zona attiva si stacca lo stesso.
 */
const DIM = 0.58;

export function SceneCompass() {
  const root = useRef<HTMLElement>(null);

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

          const section = root.current;
          if (!section) return;

          /* I due grafici si disegnano comunque, pinnati o no: sono la cosa
             che questa scena esiste per far vedere. */
          const drawCharts = (trigger: gsap.DOMTarget) => {
            gsap.fromTo(
              '[data-bar]',
              { scaleX: 0 },
              {
                scaleX: 1,
                duration: 0.7,
                stagger: 0.08,
                ease: 'power2.out',
                scrollTrigger: { trigger, start: 'top 70%' },
              },
            );
            gsap.to('[data-trend]', {
              strokeDashoffset: 0,
              duration: 1.1,
              ease: 'none',
              scrollTrigger: { trigger, start: 'top 70%' },
            });
            gsap.fromTo(
              '[data-check]',
              { scale: 0, autoAlpha: 0 },
              {
                scale: 1,
                autoAlpha: 1,
                duration: 0.35,
                stagger: 0.1,
                ease: 'back.out(2)',
                scrollTrigger: { trigger, start: 'top 65%' },
              },
            );
          };

          if (!wide) {
            /* Su telefono niente riflettore: le zone stanno tutte accese,
               perché scorrendo se ne vede una alla volta comunque. */
            gsap.set('[data-zone]', { autoAlpha: 1 });
            drawCharts(section);
            return;
          }

          drawCharts('[data-report]');

          /*
           * Il riflettore.
           *
           * Non costruisce niente e non nasconde niente: alza la zona attiva e
           * abbassa la precedente. Se lo scrub si ferma fra due battute si vede
           * comunque un report intero, con due zone a mezza forza — che è una
           * condizione onesta, non un rettangolo vuoto.
           */
          const timeline = gsap.timeline({
            defaults: { ease: 'power2.inOut' },
            scrollTrigger: {
              trigger: section,
              start: 'top top',
              end: '+=2600',
              pin: true,
              scrub: 0.7,
              anticipatePin: 1,
              invalidateOnRefresh: true,
              onToggle: (self) => {
                if (self.isActive) setDayMode(true);
              },
            },
          });

          BEATS.forEach((beat, index) => {
            const at = index * 1.1;
            timeline.to(`[data-zone="${beat.zone}"]`, { autoAlpha: 1, duration: 0.4 }, at);
            timeline.to(`[data-caption="${beat.zone}"]`, { autoAlpha: 1, duration: 0.35 }, at);

            const precedente = BEATS[index - 1];
            if (precedente) {
              timeline.to(
                `[data-zone="${precedente.zone}"]`,
                { autoAlpha: DIM, duration: 0.4 },
                at,
              );
              timeline.to(
                `[data-caption="${precedente.zone}"]`,
                { autoAlpha: 0, duration: 0.35 },
                at,
              );
            }
          });
        },
      );
    },
    { scope: root },
  );

  return (
    <section
      ref={root}
      className="kp2-lit kp2-season kp2-ground kp2-scene-pinned relative flex min-h-[100svh] items-center overflow-hidden"
    >
      <div className="mx-auto w-full max-w-7xl px-5 py-20 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="kp2-eyebrow text-kp-red">Dopo</p>
            <h2 className="kp2-display kp2-fg mt-4 text-[clamp(1.9rem,4.2vw,3.4rem)]">
              Il report c’è prima di te.
            </h2>
            <p className="kp2-mid mt-4 max-w-xl text-base leading-relaxed">
              Si chiama Session Compass. Non è un riassunto: ogni riga è
              agganciata al minuto della seduta in cui è stata detta, e si può
              aprire.
            </p>
          </div>

          {/* Le didascalie si scambiano con la zona illuminata. Senza
              movimento non servono: il report accanto si legge comunque. */}
          <div className="kp2-captions relative hidden h-20 w-72 shrink-0 md:block">
            {BEATS.map((beat, index) => (
              <div
                key={beat.zone}
                data-caption={beat.zone}
                className="absolute inset-0"
                style={{ opacity: index === 0 ? 1 : 0 }}
              >
                <p className="kp2-display kp2-fg text-lg">{beat.title}</p>
                <p className="kp2-mid mt-1.5 text-sm leading-snug">{beat.text}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Il report ─────────────────────────────────────────────────── */}
        <div data-report className="kp2-panel mt-10 overflow-hidden rounded-3xl">
          <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 sm:px-8">
            <div>
              <p className="kp2-display kp2-fg text-lg">{DEMO_ATHLETE.name}</p>
              <p className="kp2-low text-xs">{DEMO_ATHLETE.sport}</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="kp2-num kp2-low text-xs">
                Seduta {DEMO_ATHLETE.sessionNumber} · {DEMO_ATHLETE.durationLabel}
              </span>
              <span className="rounded-full bg-kp-red/12 px-2.5 py-1 text-[11px] font-semibold text-kp-red">
                Bozza da rivedere
              </span>
            </div>
          </div>
          <div className="kp2-card-line h-px w-full" />

          <div className="grid gap-x-10 gap-y-7 px-6 py-7 sm:px-8 lg:grid-cols-2">
            <div className="space-y-7">
              <div data-zone="sintesi" className="kp2-anim">
                <ZoneTitle>Sintesi della seduta</ZoneTitle>
                <p className="kp2-mid mt-2.5 text-sm leading-relaxed">
                  {DEMO_COMPASS.sessionOverview.summary}
                </p>
              </div>

              <div data-zone="temi" className="kp2-anim" style={{ opacity: DIM }}>
                <ZoneTitle>Temi emersi</ZoneTitle>
                <ul className="mt-2.5 space-y-2.5">
                  {DEMO_COMPASS.sessionOverview.themes.map((theme) => (
                    <li key={theme.id}>
                      <p className="kp2-fg text-sm font-medium leading-snug">
                        {theme.text}
                      </p>
                      <p className="kp2-low mt-0.5 text-xs italic">
                        «{theme.evidence.quote}» · min {theme.evidence.minute}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="space-y-7">
              {/* I segnali: barre orizzontali su scala 1–5, con i colori e le
                  etichette del compass vero. */}
              <div data-zone="segnali" className="kp2-anim" style={{ opacity: DIM }}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <ZoneTitle>Segnali emersi · scala 1–5</ZoneTitle>
                  <span className="kp2-low text-[11px]">
                    Non è una valutazione clinica
                  </span>
                </div>

                <div className="mt-3 space-y-2">
                  {METRICS.map((metric) => (
                    <div key={metric.id} className="flex items-center gap-3">
                      <span className="kp2-mid w-28 shrink-0 truncate text-xs">
                        {metric.meta.shortLabel}
                      </span>
                      <span className="relative h-3.5 flex-1 overflow-hidden rounded-md [background-color:var(--kp2-line)]">
                        {/* Le tacche da 1 a 5, come la griglia del grafico vero. */}
                        {[1, 2, 3, 4].map((tick) => (
                          <span
                            key={tick}
                            aria-hidden
                            className="absolute top-0 h-full w-px opacity-60 [background-color:var(--kp2-ground)]"
                            style={{ left: `${(tick / 5) * 100}%` }}
                          />
                        ))}
                        <span
                          data-bar
                          className="absolute inset-y-0 left-0 origin-left rounded-md"
                          style={{
                            width: `${(metric.value / 5) * 100}%`,
                            backgroundColor: metric.meta.color,
                          }}
                        />
                      </span>
                      <span className="kp2-num kp2-fg w-8 shrink-0 text-right text-xs font-semibold">
                        {metric.value}/5
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div data-zone="andamento" className="kp2-anim" style={{ opacity: DIM }}>
                <ZoneTitle>Andamento della conversazione</ZoneTitle>
                <svg
                  viewBox={`0 -6 ${TREND_GEOMETRY.width} ${TREND_GEOMETRY.height + 12}`}
                  className="mt-2 h-20 w-full"
                  fill="none"
                  role="img"
                  aria-label="Andamento qualitativo della conversazione lungo la seduta"
                >
                  <line
                    x1="0"
                    y1={TREND_GEOMETRY.height / 2}
                    x2={TREND_GEOMETRY.width}
                    y2={TREND_GEOMETRY.height / 2}
                    stroke="var(--kp2-line)"
                    strokeWidth="1"
                  />
                  <path
                    data-trend
                    className="kp2-draw"
                    d={TREND_GEOMETRY.line}
                    stroke="var(--color-kp-red)"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    pathLength={1}
                    strokeDasharray="1"
                    strokeDashoffset="1"
                  />
                  {TREND_GEOMETRY.points.map((point, index) => (
                    <circle
                      key={index}
                      cx={point.x}
                      cy={point.y}
                      r="3.5"
                      fill="var(--color-kp-red)"
                    />
                  ))}
                </svg>
                <p className="kp2-low mt-1 text-xs">
                  {TREND[1]?.label} · min {TREND[1]?.evidence.minute}
                </p>
              </div>

              <div data-zone="impegni" className="kp2-anim" style={{ opacity: DIM }}>
                <ZoneTitle>Impegni concordati</ZoneTitle>
                <ul className="mt-2.5 space-y-2.5">
                  {DEMO_COMPASS.commitments.map((commitment) => (
                    <li key={commitment.id} className="flex items-start gap-2.5">
                      <span
                        data-check
                        className="kp2-anim mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-kp-red text-[10px] font-bold text-white"
                      >
                        ✓
                      </span>
                      <div className="min-w-0">
                        <p className="kp2-mid text-sm leading-snug">
                          {commitment.text}
                        </p>
                        <p className="kp2-low mt-0.5 text-xs">
                          {commitment.owner === 'coach' ? 'Coach' : 'Atleta'}
                          {commitment.dueDate
                            ? ` · entro il ${commitment.dueDate}`
                            : ''}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>

        <p className="kp2-low mt-5 text-xs">
          Seduta e atleta di esempio: i dati sono inventati, ma passano dalla
          stessa validazione del prodotto.
        </p>
      </div>
    </section>
  );
}

function ZoneTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="kp2-eyebrow kp2-low">{children}</h3>;
}
