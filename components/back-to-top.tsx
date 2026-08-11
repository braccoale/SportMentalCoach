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
}: {
  showAfterPx?: number;
  label?: string;
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
    window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
  }

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
      className={`fixed bottom-6 right-6 z-50 flex h-11 w-11 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-700 shadow-lg transition-all duration-200 hover:bg-gray-50 hover:text-gray-950 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 ${
        visible
          ? 'pointer-events-auto translate-y-0 opacity-100'
          : 'pointer-events-none translate-y-2 opacity-0'
      }`}
    >
      <ArrowUp className="h-5 w-5" aria-hidden="true" />
    </button>
  );
}
