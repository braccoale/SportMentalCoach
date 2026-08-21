'use client';

import { useRef } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';
import { LiveStats } from './live-stats';
import type { LandingStats } from '@/lib/db/schema';

gsap.registerPlugin(ScrollTrigger, useGSAP);

/**
 * Scena 4 — «ecco KaiPai».
 *
 * Fin qui abbiamo raccontato il problema. Qui compare la piattaforma, e il
 * percorso si legge in quattro parole. L'unico movimento è la linea che si
 * disegna scorrendo: è il terzo momento della pagina e deve restare leggero,
 * perché due scene pesanti di fila si pagano in scorrevolezza.
 */

const STEPS = [
  { n: '01', t: 'Trova il professionista', b: 'Coach selezionati e certificati.' },
  { n: '02', t: 'Prenota', b: 'Scegli l’orario. Nessuna telefonata.' },
  { n: '03', t: 'Allenati', b: 'In videochiamata, ovunque tu sia.' },
  { n: '04', t: 'Costruisci il percorso', b: 'Ogni sessione lascia una traccia.' },
] as const;

export function SceneProduct({ stats }: { stats: LandingStats }) {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      gsap.matchMedia().add('(prefers-reduced-motion: no-preference)', () => {
        // La linea si disegna mentre la sezione attraversa lo schermo. Non
        // nasconde contenuto: se non parte, i quattro passi si leggono uguale.
        gsap.fromTo(
          '[data-track]',
          { scaleX: 0 },
          {
            scaleX: 1,
            ease: 'none',
            scrollTrigger: {
              trigger: root.current,
              start: 'top 65%',
              end: 'bottom 75%',
              scrub: 0.5,
            },
          },
        );
      });
    },
    { scope: root },
  );

  return (
    <section
      ref={root}
      id="prodotto"
      aria-label="Ecco KaiPai"
      className="relative overflow-hidden bg-kp-ink py-24 sm:py-32"
    >
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="max-w-3xl">
          <p className="kp-eyebrow text-kp-red">Ecco KaiPai</p>
          <h2 className="kp-display mt-5 text-[clamp(2rem,5.2vw,4.2rem)] font-bold leading-[0.98] tracking-tight text-kp-hi">
            Un coach della mente,
            <br />a portata di schermo.
          </h2>
        </div>

        {/* Il percorso: quattro parole su una linea, non quattro riquadri */}
        <div className="relative mt-20">
          <div
            aria-hidden
            className="absolute left-0 right-0 top-[7px] hidden h-px bg-kp-line lg:block"
          />
          <div
            data-track
            aria-hidden
            className="absolute left-0 right-0 top-[7px] hidden h-px origin-left bg-kp-red lg:block"
          />

          <ol className="grid gap-12 lg:grid-cols-4 lg:gap-8">
            {STEPS.map((s) => (
              <li key={s.n} className="relative lg:pt-10">
                <span
                  aria-hidden
                  className="absolute left-0 top-1 hidden h-3.5 w-3.5 rounded-full border-2 border-kp-red bg-kp-ink lg:block"
                />
                <span className="font-mono text-sm text-kp-red lg:hidden">
                  {s.n}
                </span>
                <h3 className="kp-display mt-2 text-xl font-semibold leading-tight tracking-tight text-kp-hi lg:mt-0 lg:text-2xl">
                  {s.t}
                </h3>
                <p className="mt-2 max-w-xs text-base leading-relaxed text-kp-mid">
                  {s.b}
                </p>
              </li>
            ))}
          </ol>
        </div>

        {/*
         * Qui andrebbe lo screenshot reale della sessione in videochiamata,
         * ed è l'asset che manca di più a questa pagina: è l'unico punto in
         * cui si potrebbe vedere il prodotto invece di leggerlo.
         *
         * Il riquadro 16:9 c'è stato, riempito con `kaipai-vc-bg.jpg`, ed è
         * stato tolto: quel file è un gradiente rosso con il logo sopra, non
         * una schermata. Un rettangolo che non mostra il prodotto occupa lo
         * spazio del prodotto e non lo racconta — meglio il vuoto, finché non
         * arriva uno screenshot vero (1600px di larghezza, 2×).
         */}
        {/* I numeri reali del database, nelle loro schede.
            Le avevo riscritte come pura tipografia perché il brief chiedeva di
            togliere le card: scelta ribaltata su richiesta, e ci sta — queste
            sono quattro dati misurati, non quattro finte funzionalità, e a
            questa scala si leggono come una striscia di numeri. */}
        <div className="mt-16">
          <LiveStats stats={stats} />
        </div>

        <div className="mt-12">
          <Link
            href="/coaches"
            className="kp-cta group inline-flex items-center gap-2 rounded-full px-8 py-4 font-semibold text-white"
          >
            Trova il tuo coach
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </div>
      </div>
    </section>
  );
}
