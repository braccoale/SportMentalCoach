import type { Metadata } from 'next';
import './v2.css';

/**
 * Il guscio della landing sperimentale.
 *
 * I font e la classe `kp-root` arrivano già dal layout di `(marketing)`: qui
 * si aggiunge solo il foglio della v2 e l'unica cosa che questa rotta non può
 * permettersi di dimenticare — il `noindex`.
 *
 * Non è una precauzione teorica. Il branch, spinto, diventa una Preview
 * pubblica su un URL raggiungibile; una seconda home indicizzata con gli
 * stessi contenuti della prima è il modo classico di farsi male da soli con
 * due pagine che competono per la stessa query.
 */
export const metadata: Metadata = {
  title: 'KaiPai — Una sessione, dal prima al dopo',
  description:
    'Versione sperimentale della landing KaiPai per i mental coach: il percorso di una seduta, dal momento in cui finisce a quello in cui ricomincia.',
  robots: { index: false, follow: false, nocache: true },
};

export default function LandingV2Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {/*
        Senza JavaScript non gira GSAP, e quasi tutto funziona lo stesso: gli
        stati iniziali stanno nel markup a piena visibilità, ed è GSAP a
        nasconderli quando parte. Restano quattro cose che il CSS deve
        rimettere a posto da solo, e sono le stesse quattro che il blocco
        `prefers-reduced-motion` di `v2.css` rimette a posto per chi ha
        chiesto di non vedere movimento.
      */}
      <noscript>
        <style>{`
          .kp2-scene-pinned{height:auto!important;min-height:0!important;padding-block:5rem}
          .kp2-rail{flex-direction:column;align-items:center;width:100%!important;height:auto;gap:1.5rem;padding-inline:1.25rem}
          .kp2-rail>*{width:100%!important;max-width:34rem;flex:none!important}
          .kp2-report{height:auto!important}
          .kp2-captions{display:none}
          .kp2-draw{stroke-dashoffset:0!important}
        `}</style>
      </noscript>
      {children}
    </>
  );
}
