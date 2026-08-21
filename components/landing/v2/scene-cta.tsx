'use client';

import { useRef } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';
import { SceneCard, BeforeAfter } from './card';
import { setDayMode } from './smooth-scroll';

gsap.registerPlugin(ScrollTrigger, useGSAP);

/**
 * Scena 6 — la chiusura.
 *
 * La pagina finisce dove è cominciata: lo stesso lunedì sera, la stessa card.
 * Solo che adesso, dopo sei tappe e un report, la riga sotto «Dopo» è una cosa
 * che chi legge ha appena visto succedere invece di una promessa.
 *
 * Una sola azione. Il secondo pulsante che si aggiunge qui è sempre quello
 * che dimezza il primo.
 */
export function SceneCtaV2() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      gsap.matchMedia().add('(prefers-reduced-motion: no-preference)', () => {
        const section = root.current;
        if (!section) return;

        ScrollTrigger.create({
          trigger: section,
          start: 'top 80%',
          onEnter: () => setDayMode(true),
        });

        gsap.fromTo(
          '[data-rise]',
          { autoAlpha: 0, y: 40 },
          {
            autoAlpha: 1,
            y: 0,
            duration: 0.9,
            stagger: 0.12,
            ease: 'power3.out',
            scrollTrigger: { trigger: section, start: 'top 70%' },
          },
        );

        gsap.to('[data-halo]', {
          scale: 1.15,
          ease: 'none',
          scrollTrigger: {
            trigger: section,
            start: 'top bottom',
            end: 'bottom top',
            scrub: 1,
          },
        });
      });
    },
    { scope: root },
  );

  return (
    <section
      ref={root}
      className="kp2-lit kp2-season kp2-ground relative flex min-h-[92svh] items-center overflow-hidden"
    >
      <div
        data-halo
        aria-hidden
        className="absolute left-1/2 top-1/2 h-[46rem] w-[46rem] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          background:
            'radial-gradient(circle, rgba(225,29,42,.16), transparent 64%)',
        }}
      />

      <div className="relative z-10 mx-auto w-full max-w-7xl px-5 py-24 sm:px-8">
        <div className="grid gap-14 lg:grid-cols-[1.25fr_1fr] lg:items-center">
          <div>
            <p data-rise className="kp2-eyebrow kp2-anim text-kp-red">
              Lunedì · 21:40
            </p>
            <h2
              data-rise
              className="kp2-display kp2-fg kp2-anim mt-6 text-[clamp(2.4rem,6.4vw,5.4rem)]"
            >
              La sessione è finita.
              <br />
              Anche il lavoro.
            </h2>
            <p
              data-rise
              className="kp2-mid kp2-anim mt-8 max-w-lg text-lg leading-relaxed"
            >
              Chiudi il portatile. Il report è scritto, gli impegni sono
              tracciati, e la prossima seduta sa già da dove ripartire.
            </p>

            <div data-rise className="kp2-anim mt-10 flex flex-wrap items-center gap-x-8 gap-y-4">
              <Link
                href="/sign-up"
                className="kp2-cta group inline-flex items-center gap-2 rounded-full px-9 py-4 text-lg font-semibold text-white"
              >
                Inizia con KaiPai
                <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
              </Link>
              <Link
                href="/sign-in"
                className="kp2-mid text-base font-medium underline-offset-8 transition-opacity hover:opacity-70 hover:underline"
              >
                Ho già un account
              </Link>
            </div>
          </div>

          <div data-rise className="kp2-anim">
            <SceneCard className="p-7 sm:p-8">
              <BeforeAfter
                before="Appunti da scrivere, la sera, a memoria"
                after="Un percorso che si scrive da solo"
              />
            </SceneCard>
          </div>
        </div>
      </div>
    </section>
  );
}
