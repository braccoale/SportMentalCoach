'use client';

import { useEffect, useState } from 'react';
import { ArrowUp } from 'lucide-react';

/**
 * Riporta in cima una pagina lunga.
 *
 * Compare solo dopo che si è sceso abbastanza da aver perso di vista
 * l'intestazione: prima non servirebbe, e un pulsante fisso che sta lì dal
 * primo istante è un ingombro permanente per un bisogno occasionale.
 *
 * Il riepilogo sessione è la pagina che lo rende necessario — panoramica,
 * racconto, percorso, indicatori, trascrizione — e tornare su per approvare o
 * cambiare scheda significava trascinare per parecchi schermi.
 */
export function BackToTop({
  /** Quanto scendere prima che compaia. */
  showAfterPx = 600,
  label = 'Torna in cima',
  tone = 'light',
}: {
  showAfterPx?: number;
  label?: string;
  /** `dark` per la landing, che ha fondo nero: un pulsante bianco vi stona. */
  tone?: 'light' | 'dark';
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > showAfterPx);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [showAfterPx]);

  function toTop() {
    // Chi ha chiesto meno animazioni non vuole nemmeno un volo di due secondi
    // lungo tutta la pagina: per loro il salto è immediato.
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /*
     * Dove c'è lo scorrimento fluido, il movimento glielo si chiede.
     *
     * Sulla landing Lenis muove la pagina a ogni frame: uno `scrollTo`
     * animato partirebbe in parallelo e i due si contenderebbero la stessa
     * posizione, con uno scatto o un rimbalzo. Se c'è, comanda lui.
     */
    const lenis = (
      window as unknown as {
        __lenis?: { scrollTo: (t: number, o?: { immediate?: boolean }) => void };
      }
    ).__lenis;
    if (lenis) {
      lenis.scrollTo(0, { immediate: reduce });
      return;
    }
    window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
  }

  const toneClass =
    tone === 'dark'
      ? 'border-white/15 bg-white/10 text-white backdrop-blur hover:bg-white/20 focus:ring-red-500'
      : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50 hover:text-gray-950 focus:ring-violet-500';

  return (
    <button
      type="button"
      onClick={toTop}
      aria-label={label}
      title={label}
      // Resta nel documento anche da nascosto: apparire e sparire dall'albero
      // farebbe saltare il focus di chi naviga da tastiera.
      aria-hidden={!visible}
      tabIndex={visible ? 0 : -1}
      className={`fixed bottom-6 right-6 z-50 flex h-11 w-11 items-center justify-center rounded-full border shadow-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 ${toneClass} ${
        visible
          ? 'pointer-events-auto translate-y-0 opacity-100'
          : 'pointer-events-none translate-y-2 opacity-0'
      }`}
    >
      <ArrowUp className="h-5 w-5" aria-hidden="true" />
    </button>
  );
}
