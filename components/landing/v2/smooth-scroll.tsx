'use client';

import { useEffect } from 'react';
import Lenis from 'lenis';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

/**
 * Lo scroll morbido, agganciato a ScrollTrigger.
 *
 * Il `SmoothScroll` della home non è riusabile qui, e la differenza è la
 * ragione per cui questo file esiste: quello fa girare Lenis in un
 * `requestAnimationFrame` suo e non avvisa nessuno. Su una pagina senza pin
 * non si nota; su una pagina con tre sezioni pinnate sì, perché ScrollTrigger
 * calcola le posizioni sullo scroll nativo mentre Lenis muove la pagina per
 * conto proprio, e i due si trovano su frame diversi. Il risultato è una
 * scena pinnata che vibra.
 *
 * Le tre righe che lo evitano sono note e sempre le stesse:
 *
 *   1. `lenis.on('scroll', ScrollTrigger.update)` — ScrollTrigger ricalcola
 *      quando si muove Lenis, non quando si muove il browser;
 *   2. Lenis avanzato dal ticker di GSAP invece che da un rAF proprio, così
 *      c'è un solo orologio;
 *   3. `lagSmoothing(0)`, perché la compensazione dei frame persi di GSAP
 *      farebbe saltare in avanti anche Lenis.
 *
 * Con `prefers-reduced-motion` Lenis non parte affatto: lo scroll nativo è
 * già la cosa giusta, e ScrollTrigger da solo funziona benissimo.
 */
export function SmoothScrollV2() {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const lenis = new Lenis({ duration: 1.05, smoothWheel: true });
    (window as unknown as { __lenis?: Lenis }).__lenis = lenis;

    lenis.on('scroll', ScrollTrigger.update);

    const advance = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(advance);
    gsap.ticker.lagSmoothing(0);

    /*
     * Le fotografie e i due font arrivano dopo il primo layout, e ogni scena
     * pinnata ha una lunghezza che dipende dall'altezza reale del contenuto.
     * Senza questo refresh la prima visita misura una pagina che non esiste
     * ancora — e lo si vede solo alla prima visita, che è esattamente quella
     * che conta.
     */
    const refresh = () => ScrollTrigger.refresh();
    document.fonts?.ready.then(refresh).catch(() => {});
    window.addEventListener('load', refresh);

    return () => {
      window.removeEventListener('load', refresh);
      gsap.ticker.remove(advance);
      gsap.ticker.lagSmoothing(500, 33);
      lenis.off('scroll', ScrollTrigger.update);
      delete (window as unknown as { __lenis?: Lenis }).__lenis;
      lenis.destroy();
    };
  }, []);

  return null;
}

/**
 * Il giorno e la notte della pagina.
 *
 * Chi decide la stagione non è un componente: sono due scene diverse — il
 * binario del percorso, quando supera metà corsa, e la zona in luce che lo
 * segue. Perché entrambe possano dirlo senza conoscersi, lo stato vive dove
 * lo può leggere il CSS di tutti: una classe sull'elemento `html`.
 *
 * Un contesto React sarebbe stato l'alternativa, e avrebbe fatto rirenderizzare
 * mezza pagina a ogni frame di scrub. Una classe non fa rirenderizzare niente.
 */
export function setDayMode(on: boolean): void {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('kp2-day', on);
}
