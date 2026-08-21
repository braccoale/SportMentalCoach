'use client';

import { useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';
import { ImageSlot } from './image-slot';

gsap.registerPlugin(ScrollTrigger, useGSAP);

/**
 * Scena 3 — il Metodo KaiPai.
 *
 * Quattro pilastri, nessuna card. L'atleta resta protagonista in colonna
 * (via `position: sticky`, non un secondo pin: costa meno e non entra in
 * conflitto con la scena pinnata che precede) mentre le quattro dimensioni
 * si accendono una alla volta scorrendo.
 *
 * Il movimento qui è volutamente più leggero della scena 2: accende e spegne,
 * non pilota una timeline. Due momenti pinnati di seguito stancano.
 */

const PILLARS = [
  {
    n: '01',
    t: 'FOCUS',
    b: 'Restare sul punto quando tutto intorno chiede attenzione.',
  },
  {
    n: '02',
    t: 'FIDUCIA',
    b: 'Sapere di poterlo fare, anche la volta dopo un errore.',
  },
  {
    n: '03',
    t: 'GESTIONE EMOTIVA',
    b: 'La pressione non si elimina. Si impara a starci dentro.',
  },
  {
    n: '04',
    t: 'CONSAPEVOLEZZA',
    b: 'Riconoscere cosa succede nella tua testa, mentre succede.',
  },
] as const;

export function ScenePillars() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();

      mm.add('(prefers-reduced-motion: no-preference)', () => {
        const items = gsap.utils.toArray<HTMLElement>('[data-pillar]');
        const list = root.current?.querySelector('[data-pillars]');

        /*
         * L'attenuazione è un miglioramento, non il default. Senza JS — o con
         * reduced-motion, dove questo blocco non gira — nessun pilastro viene
         * spento e restano tutti leggibili. Se il default fosse "spento", una
         * pagina senza JS mostrerebbe quattro titoli grigi su nero.
         */
        list?.classList.add('kp-lit-list');

        items.forEach((el) => {
          ScrollTrigger.create({
            trigger: el,
            // Si accende quando entra nella metà alta dello schermo e resta
            // acceso finché non esce: leggere e "attivo" devono coincidere.
            start: 'top 72%',
            end: 'bottom 38%',
            toggleClass: { targets: el, className: 'is-live' },
          });
        });
      });
    },
    { scope: root },
  );

  return (
    <section
      ref={root}
      id="metodo"
      aria-label="Il Metodo KaiPai"
      className="relative bg-kp-ink2 py-24 sm:py-32"
    >
      <div className="mx-auto grid max-w-7xl gap-12 px-5 sm:px-8 lg:grid-cols-[0.85fr_1.15fr] lg:gap-20">
        {/* Colonna che resta: l'atleta è il soggetto, i pilastri lo attraversano */}
        <div className="lg:sticky lg:top-24 lg:self-start">
          <p className="kp-eyebrow text-kp-red">Il Metodo KaiPai</p>
          <h2 className="kp-display mt-5 text-[clamp(2rem,4.6vw,3.6rem)] font-bold leading-[0.98] tracking-tight text-kp-hi">
            La mente ha
            <br />
            quattro muscoli.
          </h2>
          <p className="mt-6 max-w-sm text-lg leading-relaxed text-kp-mid">
            Come il corpo, si allenano uno alla volta. È il cuore di ogni
            percorso KaiPai — dal primo incontro all&apos;ultima partita.
          </p>

          {/* Slot marcato — serve un ritratto verticale 2560px, sguardo
              concentrato. `atleta.png` è 456×595: regge solo a questa scala. */}
          {/* Più grande e senza velo: era un francobollo scuro in mezzo al
              nero, e la colonna che dovrebbe tenere il soggetto in scena non
              teneva niente. Il gradiente in basso è appena accennato, solo
              per agganciare l'immagine al fondo. */}
          <ImageSlot
            src="/atleta.png"
            position="center 18%"
            label="Atleta concentrato"
            className="mt-12 hidden aspect-[3/4] w-full max-w-sm rounded-lg lg:block"
          >
            <div className="absolute inset-x-0 bottom-0 h-1/4 bg-gradient-to-t from-kp-ink2 to-transparent" />
          </ImageSlot>
        </div>

        {/* I quattro pilastri come indice editoriale, non come griglia */}
        <ol data-pillars className="flex flex-col">
          {PILLARS.map((p) => (
            <li
              key={p.t}
              data-pillar
              className="kp-pillar group border-t border-kp-line py-10 last:border-b sm:py-14"
            >
              <div className="flex items-baseline gap-5 sm:gap-8">
                <span className="kp-pillar-n font-mono text-sm text-kp-mid">
                  {p.n}
                </span>
                <div className="min-w-0">
                  <h3 className="kp-display kp-pillar-t text-[clamp(1.6rem,4.2vw,3.2rem)] font-bold leading-[1.02] tracking-tight text-kp-hi">
                    {p.t}
                  </h3>
                  <p className="kp-pillar-b mt-3 max-w-md text-base leading-relaxed text-kp-mid sm:text-lg">
                    {p.b}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
