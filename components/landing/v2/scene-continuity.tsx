'use client';

import { useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';
import { SceneCard } from './card';
import { setDayMode } from './smooth-scroll';
import { DEMO_COMPASS, DEMO_JOURNEY } from './demo-compass';

gsap.registerPlugin(ScrollTrigger, useGSAP);

/**
 * Scena 5 — la continuità.
 *
 * L'argomento che nessuno degli otto strumenti della scena 2 può reggere: non
 * che cosa è successo in una seduta, ma che cosa lega quattro sedute fra loro.
 *
 * Sta qui e non prima perché ha senso solo dopo aver visto un compass: un
 * grafico di quattro punti, mostrato a chi non sa ancora che cosa sia un
 * punto, è decorazione.
 *
 * Non è pinnata. Dopo due sezioni bloccate, una scena che scorre normalmente
 * è un sollievo, e questa è anche la penultima: la pagina deve iniziare a
 * lasciar andare.
 */

const DATE_FORMAT = new Intl.DateTimeFormat('it-IT', {
  day: '2-digit',
  month: 'short',
});

function shortDate(value: string | null): string {
  if (!value) return '—';
  return DATE_FORMAT.format(new Date(`${value}T12:00:00Z`));
}

export function SceneContinuity() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();

      mm.add('(prefers-reduced-motion: no-preference)', () => {
        const section = root.current;
        if (!section) return;

        /* Siamo già in luce da due sezioni. Questo trigger esiste solo per il
           caso in cui si atterri qui direttamente — un link con l'ancora, un
           ricaricamento a metà pagina — e la barra in alto non abbia mai
           saputo che è giorno. */
        ScrollTrigger.create({
          trigger: section,
          start: 'top 80%',
          end: 'bottom top',
          onToggle: (self) => {
            if (self.isActive) setDayMode(true);
          },
        });

        gsap.to('[data-spine]', {
          strokeDashoffset: 0,
          ease: 'none',
          scrollTrigger: {
            trigger: '[data-timeline]',
            start: 'top 78%',
            end: 'bottom 65%',
            scrub: 0.6,
          },
        });

        gsap.fromTo(
          '[data-stop]',
          { autoAlpha: 0, y: 26 },
          {
            autoAlpha: 1,
            y: 0,
            duration: 0.6,
            stagger: 0.12,
            ease: 'power2.out',
            scrollTrigger: { trigger: '[data-timeline]', start: 'top 72%' },
          },
        );

        gsap.fromTo(
          '[data-next]',
          { autoAlpha: 0, y: 34 },
          {
            autoAlpha: 1,
            y: 0,
            duration: 0.8,
            ease: 'power3.out',
            scrollTrigger: { trigger: '[data-next]', start: 'top 85%' },
          },
        );
      });
    },
    { scope: root },
  );

  return (
    <section
      ref={root}
      className="kp2-lit kp2-season kp2-ground relative overflow-hidden py-24 sm:py-32"
    >
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <p className="kp2-eyebrow text-kp-red">La continuità</p>
        <h2 className="kp2-display kp2-fg mt-4 max-w-3xl text-[clamp(2rem,4.6vw,3.8rem)]">
          La seduta di lunedì
          <br />
          sa già che cosa è successo a gennaio.
        </h2>
        <p className="kp2-mid mt-6 max-w-xl text-base leading-relaxed">
          Ogni report approvato entra nel percorso mentale dell’atleta. Quello
          che torna, torna visibile: i temi ricorrenti, gli impegni rimasti
          aperti, il filo che lega una seduta alla precedente.
        </p>

        <div data-timeline className="relative mt-20">
          {/* La spina dorsale del percorso. Orizzontale da tablet in su,
              perché quattro tappe in fila si leggono come una progressione;
              su telefono sparisce e restano le quattro schede, che è quello
              che una colonna sa fare bene. */}
          <svg
            aria-hidden
            viewBox="0 0 1000 2"
            preserveAspectRatio="none"
            className="absolute left-0 top-[7px] hidden h-px w-full md:block"
          >
            <line x1="0" y1="1" x2="1000" y2="1" stroke="var(--kp2-line)" strokeWidth="2" />
            <line
              data-spine
              className="kp2-draw"
              x1="0"
              y1="1"
              x2="1000"
              y2="1"
              stroke="var(--color-kp-red)"
              strokeWidth="2"
              pathLength={1}
              strokeDasharray="1"
              strokeDashoffset="1"
            />
          </svg>

          <ol className="grid gap-10 md:grid-cols-4 md:gap-6">
            {DEMO_JOURNEY.map((entry, index) => (
              <li key={entry.sessionId} data-stop className="kp2-anim relative md:pt-10">
                <span
                  aria-hidden
                  className="absolute left-0 top-1 hidden h-3.5 w-3.5 rounded-full border-2 border-kp-red md:block"
                  style={{ backgroundColor: 'var(--kp2-ground)' }}
                />

                <div className="flex items-baseline gap-3">
                  <span className="kp2-num text-sm text-kp-red">
                    Seduta {entry.sessionId}
                  </span>
                  <span className="kp2-num kp2-low text-xs">
                    {shortDate(entry.sessionDate)}
                  </span>
                </div>

                <h3 className="kp2-display kp2-fg mt-3 text-lg leading-snug">
                  {entry.focus}
                </h3>
                <p className="kp2-mid mt-2 text-sm leading-relaxed">
                  {entry.summary}
                </p>

                <div className="mt-4 flex flex-wrap gap-1.5">
                  {entry.themes.map((theme) => (
                    <span
                      key={theme}
                      className="kp2-mid rounded-full px-2.5 py-1 text-[11px] [background-color:var(--kp2-line)]"
                    >
                      {theme}
                    </span>
                  ))}
                </div>

                {/* Due sole metriche per tappa, e sempre le stesse: quattro
                    piccoli grafici con sei serie ciascuno sarebbero sei serie
                    illeggibili quattro volte. */}
                <div className="mt-5 space-y-2">
                  <MiniTrack
                    label="Concentrazione"
                    value={entry.concentration}
                    color="#2563eb"
                  />
                  <MiniTrack
                    label="Gestione emotiva"
                    value={entry.emotionalManagement}
                    color="#059669"
                  />
                </div>
              </li>
            ))}
          </ol>
        </div>

        <div data-next className="kp2-anim mt-20 max-w-2xl">
          <SceneCard>
            <div className="p-7 sm:p-8">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <p className="kp2-display kp2-fg text-xl">Prossima seduta</p>
                <p className="kp2-num kp2-low text-sm">lunedì 16 marzo · 17:00</p>
              </div>

              <p className="kp2-eyebrow kp2-low mt-8">Da dove ripartite</p>
              <ul className="mt-4 space-y-3">
                {DEMO_COMPASS.nextSessionPrep.map((item) => (
                  <li key={item.id} className="flex items-start gap-3">
                    <span
                      aria-hidden
                      className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-kp-red"
                    />
                    <p className="kp2-mid text-sm leading-relaxed">{item.text}</p>
                  </li>
                ))}
              </ul>
            </div>
          </SceneCard>
        </div>
      </div>
    </section>
  );
}

function MiniTrack({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="kp2-low text-[11px]">{label}</span>
        <span className="kp2-num kp2-low text-[11px]">{value}/5</span>
      </div>
      <div className="kp2-meter mt-1 h-1">
        <span
          className="kp2-meter-fill block h-full"
          style={{ width: `${(value / 5) * 100}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}
