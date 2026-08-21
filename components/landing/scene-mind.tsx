'use client';

import { useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';
import { ImageSlot } from './image-slot';

gsap.registerPlugin(ScrollTrigger, useGSAP);

/**
 * Scena 2 — «la testa è parte della prestazione».
 *
 * Il momento cinematografico principale della home. La sezione resta pinnata
 * mentre lo scroll fa avanzare una sola scena: quattro affermazioni si
 * sostituiscono, la fotografia si stringe e si raffredda, poi la domanda
 * ribalta il tono e il rosso entra.
 *
 * La tipografia è il soggetto, non la fotografia: gli asset disponibili non
 * reggono un full-bleed cinematografico (nessuno supera i 1610px), quindi
 * l'immagine fa da atmosfera dietro le parole invece di doverle sostenere.
 * Quando arriveranno scatti da 2560px basterà cambiare `src` negli slot.
 *
 * Tutto è legato allo scroll con `scrub`, così invertendo la direzione la
 * scena torna indietro esattamente come è venuta avanti.
 */

/** Le battute della scena, nell'ordine in cui lo scroll le rivela. */
const BEATS = [
  { id: 'fisico', text: 'ALLENIAMO IL FISICO.' },
  { id: 'tecnica', text: 'ALLENIAMO LA TECNICA.' },
  { id: 'tattica', text: 'ALLENIAMO LA TATTICA.' },
] as const;

export function SceneMind() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();

      /*
       * Reduced motion non è gestito qui: è gestito in CSS (`globals.css`,
       * blocco `.kp-scene-mind`). Provarlo da GSAP significava rimettere in
       * flusso cinque frasi posizionate in `absolute` con dei `set`, e la
       * prima versione lo faceva solo per tre di esse: le cinque righe si
       * impilavano una sopra l'altra, tutte a opacità 1 — un controllo
       * sull'opacità le dava per corrette mentre lo schermo era illeggibile.
       *
       * In CSS la scena statica è una scena vera, e vale anche senza JS.
       */
      mm.add(
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

          /*
           * Su mobile la corsa è più corta: 2600px di scroll bloccato su un
           * telefono si leggono come una pagina che non risponde. Meno strada,
           * stesse battute.
           */
          const run = desktop ? 2800 : 1700;

          const tl = gsap.timeline({
            defaults: { ease: 'none' },
            scrollTrigger: {
              trigger: root.current,
              start: 'top top',
              end: `+=${run}`,
              pin: true,
              scrub: 0.6,
              anticipatePin: 1,
            },
          });

          /*
           * Tempi assoluti, non posizioni relative.
           *
           * Con `>` ogni inserimento si riferisce alla fine del tween aggiunto
           * per ultimo. Mescolando battute e tween della fotografia — questi
           * ultimi inseriti a tempo assoluto — il `>` della domanda finiva per
           * puntare alla fine della vignettatura, non all'ultima battuta: "E LA
           * TESTA?" compariva sopra "ALLENIAMO LA TATTICA.", entrambe a schermo.
           *
           * Con i tempi espliciti la sequenza si legge qui sotto e non dipende
           * più dall'ordine in cui i tween vengono aggiunti.
           */
          const BEAT_SPAN = 1.6; // comparsa 0.6 · pausa 0.5 · uscita 0.5
          const PAUSE = 0.5; // il vuoto che fa atterrare la domanda
          const beatsEnd = BEATS.length * BEAT_SPAN;
          const qIn = beatsEnd + PAUSE;
          const qOut = qIn + 1.6;
          const aIn = qOut + 0.3;

          BEATS.forEach((b, i) => {
            const el = `[data-beat="${b.id}"]`;
            const at = i * BEAT_SPAN;
            tl.fromTo(
              el,
              { autoAlpha: 0, yPercent: 18 },
              { autoAlpha: 1, yPercent: 0, duration: 0.6 },
              at,
            ).to(
              el,
              { autoAlpha: 0, yPercent: -18, duration: 0.5 },
              at + 1.1,
            );
          });

          /*
           * L'escursione tonale della scena, che è ciò che la rende una scena
           * e non una sequenza di didascalie:
           *
           *   battute  → velo leggero, la fotografia si vede
           *   pausa    → quasi nero, il vuoto prima della domanda
           *   domanda  → si riapre, ed entra il rosso
           *
           * Prima il velo saliva a 0.8 e non scendeva mai davvero: tutta la
           * scena stava sullo stesso valore e il nero della pausa non si
           * distingueva dal resto. Un buio si nota solo dopo una luce.
           */
          tl.to('.kp-scene-photo', { scale: 1.16, duration: aIn + 0.6 }, 0)
            .fromTo('[data-cool]', { opacity: 0.1 }, { opacity: 0.45, duration: 1.6 }, 0.4)
            .to('[data-cool]', { opacity: 0.94, duration: 0.7 }, beatsEnd - 0.4)
            .to('[data-cool]', { opacity: 0.35, duration: 0.8 }, qIn);

          // Il ribaltamento. Il rosso non decora: segna il momento in cui la
          // domanda cambia argomento.
          tl.fromTo(
            '[data-turn="question"]',
            { autoAlpha: 0, scale: 0.94 },
            { autoAlpha: 1, scale: 1, duration: 0.7 },
            qIn,
          )
            .fromTo('[data-warm]', { opacity: 0 }, { opacity: 1, duration: 0.7 }, qIn)
            .to('[data-turn="question"]', { autoAlpha: 0, duration: 0.4 }, qOut)
            .fromTo(
              '[data-turn="answer"]',
              { autoAlpha: 0, yPercent: 14 },
              { autoAlpha: 1, yPercent: 0, duration: 0.6 },
              aIn,
            );
        },
      );
    },
    { scope: root },
  );

  return (
    <section
      ref={root}
      id="la-testa"
      aria-label="La testa è parte della prestazione"
      className="kp-scene-mind relative flex h-svh items-center justify-center overflow-hidden bg-kp-ink"
    >
      {/* Fotografia di atmosfera. Slot marcato: sostituire con uno scatto
          2560px (volto, concentrazione, pre-gara) senza toccare il layout. */}
      {/* `gym.jpg` era la scelta iniziale ed era sbagliata: contiene già del
          testo stampato ("TI FA VINCERE LA MENTE", "DISCIPLINA RESILIENZA")
          che finiva sotto la tipografia della scena, testo su testo. `stadio.jpg`
          non ha copy dentro e racconta la cosa giusta — una figura sola davanti
          a uno stadio vuoto, che è il pre-gara di cui parla la scena. */}
      {/* `20%` e non `center`: la foto è orizzontale (1599×984) e su un telefono
          il ritaglio in `cover` mostra solo il 28% della larghezza. Centrata,
          quella finestra cade sugli spalti vuoti e la figura sparisce. A 20%
          il soggetto resta inquadrato sul telefono, e su desktop la finestra è
          quasi tutta l'immagine, quindi non cambia nulla. */}
      <ImageSlot
        src="/stadio.jpg"
        position="20% 42%"
        placeholder="none"
        label="Atleta solo davanti allo stadio vuoto"
        className="absolute inset-0"
        imageClassName="kp-scene-photo will-change-transform"
      >
        {/* Scrim da sinistra: la tipografia è allineata a sinistra, la figura
            sta al centro-sinistra della foto. Senza questo il titolo cade sul
            soggetto e perde contrasto proprio dove va letto.

            Il velo pieno che stava qui sopra (`bg-kp-ink/45`) è stato tolto:
            sommato allo scrim e alla vignettatura portava la scena a 9/255 —
            la fotografia scelta con cura non si vedeva affatto. Il buio in
            questa scena deve arrivare dal `data-cool`, che è animato, non da
            un velo fisso che spegne anche i momenti che devono essere visti. */}
        <div className="absolute inset-0 bg-gradient-to-r from-kp-ink via-kp-ink/55 to-transparent" />

        {/* Letto del testo: una fascia scura alta quanto la riga, non un velo
            su tutta l'immagine. Liberata la fotografia, la parola finiva sopra
            il tabellone illuminato e perdeva contrasto proprio nel punto in cui
            va letta; il cielo con le torri faro e il prato restano visibili. */}
        <div
          className="absolute inset-x-0 top-1/2 h-[46%] -translate-y-1/2"
          style={{
            background:
              'linear-gradient(180deg, transparent 0%, rgba(5,5,7,.72) 38%, rgba(5,5,7,.72) 62%, transparent 100%)',
          }}
        />
        {/* Il freddo della prima metà */}
        <div
          data-cool
          className="absolute inset-0 opacity-0"
          style={{
            background:
              'linear-gradient(180deg, rgba(5,5,7,.20) 0%, rgba(5,5,7,.72) 100%)',
          }}
        />
        {/* Il rosso che entra al ribaltamento */}
        <div
          data-warm
          className="absolute inset-0 opacity-0"
          style={{
            background:
              'radial-gradient(ellipse at 50% 62%, rgba(225,29,42,.30), transparent 62%)',
          }}
        />
        <div className="kp-vignette absolute inset-0" />
      </ImageSlot>

      <div className="relative z-10 mx-auto w-full max-w-6xl px-5 sm:px-8">
        {/* Le battute vivono sovrapposte nello stesso punto: con reduced-motion
            tornano a impilarsi (`position: relative` via GSAP). */}
        <div className="kp-scene-stack relative flex min-h-[42svh] flex-col justify-center gap-4">
          {BEATS.map((b) => (
            <p
              key={b.id}
              data-beat={b.id}
              className="kp-display absolute inset-x-0 text-[clamp(2rem,7vw,5.5rem)] font-bold leading-[0.95] tracking-tight text-kp-hi opacity-0"
            >
              {b.text}
            </p>
          ))}

          <p
            data-turn="question"
            className="kp-display absolute inset-x-0 text-[clamp(2.6rem,9vw,7rem)] font-bold leading-[0.95] tracking-tight text-kp-red opacity-0"
          >
            E LA TESTA?
          </p>

          <p
            data-turn="answer"
            className="kp-display absolute inset-x-0 text-[clamp(2.2rem,7.5vw,6rem)] font-bold leading-[0.95] tracking-tight text-kp-hi opacity-0"
          >
            È ORA DI
            <br />
            ALLENARLA.
          </p>
        </div>
      </div>
    </section>
  );
}
