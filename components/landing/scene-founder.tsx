'use client';

import { useRef } from 'react';
import { BookOpen } from 'lucide-react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';
import { ImageSlot } from './image-slot';

gsap.registerPlugin(ScrollTrigger, useGSAP);

const BOOK_URL =
  'https://www.amazon.it/Before-Storie-fatiche-successi-sentiero/dp/B0G3SWZWK7/';

const CHIPS = [
  'Certificato ACSI–CONI',
  'Autore',
  'Al fianco di atleti olimpici e calciatori pro',
];

/**
 * L'origine — Francesco Borrelli.
 *
 * Scena pinnata: la frase si scopre riga per riga con una maschera, poi si
 * rimpicciolisce e sale a fare da titolo mentre il blocco del fondatore entra
 * da sotto. È la stessa scena che si trasforma, non due sezioni in fila.
 *
 * **Perché la tipografia e non il ritratto.** `founder.jpg` è 229×321: una foto
 * da telefono. Pinnarla a tutto schermo significherebbe ingrandirla sei volte
 * e mostrarla sgranata proprio nel momento in cui si chiede fiducia. Resta
 * quindi alla sua misura reale, nitida, e a muoversi è la frase — che poi è
 * la cosa che vale la pena leggere.
 *
 * La maschera anima solo `transform` (`yPercent`), mai `top` o `height`: è ciò
 * che tiene l'effetto fluido anche invertendo la direzione dello scroll.
 *
 * Questa è la seconda scena pinnata della pagina, dopo «e la testa?». Sono
 * lontane fra loro di proposito: due pin consecutivi si pagano tutti insieme.
 */
export function SceneFounder() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      gsap.matchMedia().add(
        {
          motion: '(prefers-reduced-motion: no-preference)',
          desktop: '(min-width: 768px)',
        },
        (ctx) => {
          const { motion, desktop } = ctx.conditions as {
            motion: boolean;
            desktop: boolean;
          };
          if (!motion) return;

          const tl = gsap.timeline({
            defaults: { ease: 'none' },
            scrollTrigger: {
              trigger: root.current,
              start: 'top top',
              end: `+=${desktop ? 2000 : 1300}`,
              pin: true,
              scrub: 0.6,
              anticipatePin: 1,
            },
          });

          /*
           * Lo stato iniziale lo imposta GSAP, non una classe Tailwind.
           *
           * Con `translate-y-full` nel markup, GSAP leggeva quello spostamento
           * come `y` in pixel e poi animava `yPercent` a zero: le due proprietà
           * si sommano, quindi i 133px restavano e la citazione non compariva
           * mai — nessun errore, solo una scena vuota.
           *
           * `useGSAP` gira in `useLayoutEffect`, cioè prima che il browser
           * dipinga: non c'è un lampo di testo già visibile. E se il JavaScript
           * non parte affatto, nel markup non c'è alcuno spostamento — la
           * frase si legge, che è il modo giusto di fallire.
           */
          gsap.set('[data-line] span', { yPercent: 100 });

          // 1 · la frase si scopre riga per riga
          tl.to('[data-line="1"] span', { yPercent: 0, duration: 0.8 }, 0)
            .to('[data-line="2"] span', { yPercent: 0, duration: 0.8 }, 0.7)
            .fromTo(
              '[data-eyebrow]',
              { autoAlpha: 0 },
              { autoAlpha: 1, duration: 0.4 },
              0,
            );

          // 2 · la frase arretra e diventa il titolo del blocco
          tl.to(
            '[data-quote]',
            { scale: desktop ? 0.55 : 0.62, duration: 0.9 },
            1.6,
          );

          // 3 · il fondatore entra da sotto
          tl.fromTo(
            '[data-founder]',
            { autoAlpha: 0, yPercent: 10 },
            { autoAlpha: 1, yPercent: 0, duration: 0.8 },
            1.9,
          );

          /*
           * 4 · la pausa finale, ed è la parte che serve davvero.
           *
           * Prima il fondatore finiva di entrare esattamente quando il pin si
           * sganciava: la scena si componeva e nello stesso istante scorreva
           * via, quindi non esisteva un momento in cui la si potesse leggere
           * ferma. Questo tween vuoto tiene la composizione immobile per
           * l'ultimo quarto della corsa — il tempo di leggere chi è Francesco,
           * che è tutto il motivo per cui questa scena esiste.
           */
          tl.to({}, { duration: 0.9 }, 2.7);
        },
      );
    },
    { scope: root },
  );

  return (
    <section
      ref={root}
      id="origine"
      aria-label="L'origine di KaiPai"
      className="kp-scene-founder relative flex h-svh items-center overflow-hidden bg-kp-ink2 py-20"
    >
      <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">
        <p
          data-eyebrow
          className="kp-eyebrow text-kp-red opacity-0"
        >
          L&apos;origine
        </p>

        {/* La citazione. Ogni riga è una finestra con dentro il testo spinto
            fuori: scorrendo, il testo risale dentro la finestra. */}
        <blockquote
          data-quote
          className="kp-quote mt-6 origin-left"
        >
          <p
            data-line="1"
            className="kp-display overflow-hidden text-[clamp(1.8rem,5.4vw,4.4rem)] font-bold leading-[1.06] tracking-tight text-kp-hi"
          >
            <span className="block">
              «Non farti guidare dalla tua mente.
            </span>
          </p>
          <p
            data-line="2"
            className="kp-display overflow-hidden text-[clamp(1.8rem,5.4vw,4.4rem)] font-bold leading-[1.06] tracking-tight text-kp-red"
          >
            <span className="block">
              Impara a guidarla.»
            </span>
          </p>
        </blockquote>

        {/* Il blocco del fondatore, che entra dopo la frase */}
        <div
          data-founder
          className="kp-founder mt-10 grid gap-8 opacity-0 sm:grid-cols-[auto_1fr] sm:items-start sm:gap-10"
        >
          {/* Alla sua misura reale (229×321) e non oltre: ingrandirla la
              sgranerebbe. Serve un ritratto vero, almeno 1200px sul lato lungo. */}
          <ImageSlot
            src="/founder.jpg"
            position="center top"
            monogram="FB"
            label="Francesco Borrelli"
            className="h-[184px] w-[132px] shrink-0 rounded-lg border border-kp-line sm:h-[232px] sm:w-[166px]"
          />

          <div className="min-w-0">
            <p className="kp-display text-xl font-semibold text-kp-hi">
              Francesco Borrelli
            </p>
            <p className="mt-1 text-sm text-kp-mid">
              Fondatore · Ideatore del Metodo KaiPai
            </p>

            <p className="mt-5 max-w-xl text-base leading-relaxed text-kp-mid">
              Vengo dal diritto, dal giornalismo, dalla consulenza. Nel 2014 ho
              scoperto che la mente si allena — e ho cambiato strada. Da allora
              accompagno atleti verso Olimpiadi e Mondiali, e ragazzi dal settore
              giovanile all&apos;esordio tra i professionisti.{' '}
              <span className="text-kp-hi">
                La mente non va corretta, va guidata.
              </span>
            </p>

            <ul className="mt-6 flex flex-wrap gap-2">
              {CHIPS.map((c) => (
                <li
                  key={c}
                  className="rounded-full border border-kp-line px-3 py-1.5 text-sm text-kp-mid"
                >
                  {c}
                </li>
              ))}
            </ul>

            <a
              href={BOOK_URL}
              target="_blank"
              rel="noreferrer"
              className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-kp-hi underline-offset-8 transition-colors hover:text-kp-red hover:underline"
            >
              <BookOpen className="h-4 w-4" />
              Il libro di Francesco
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
