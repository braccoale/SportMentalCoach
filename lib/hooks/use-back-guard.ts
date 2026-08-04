'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Intercetta il tasto Indietro mentre l'utente è in videochiamata.
 *
 * Il problema. Su Android il tasto (o la gesture) Indietro è una navigazione
 * del browser come un'altra: fa tornare alla pagina precedente, la stanza video
 * viene smontata e la connessione WebRTC si chiude. La chiamata cade senza
 * chiedere niente, e succede spesso per sbaglio — quel tasto è a un millimetro
 * dai controlli della chiamata.
 *
 * La tecnica. Non esiste un modo di "annullare" un Indietro: quando l'evento
 * `popstate` arriva la navigazione è già avvenuta. Si può però metterci davanti
 * una voce di cronologia sacrificale: entrando in chiamata ne aggiungiamo una,
 * così il primo Indietro consuma quella invece di uscire dalla pagina. A quel
 * punto la rimettiamo e mostriamo la conferma.
 *
 * Il limite, dichiarato. La protezione è a un livello: se l'utente preme
 * Indietro ripetutamente e in fretta può uscire lo stesso, perché rimettere la
 * voce richiede un attimo. Copre il tocco accidentale, che è il caso reale, non
 * la volontà ostinata di uscire — e va bene così: bloccare del tutto l'Indietro
 * sarebbe sbagliato quanto il problema che risolve.
 */
export function useBackGuard(enabled: boolean): {
  /** True quando l'utente ha premuto Indietro e attende la conferma. */
  confirming: boolean;
  /** Resta nella pagina: rimette la voce sacrificale e chiude la conferma. */
  stay: () => void;
  /** Esce davvero: smonta la guardia ed esegue `onLeave`. */
  leave: (onLeave: () => void) => void;
} {
  const [confirming, setConfirming] = useState(false);
  // Letta dentro il listener di popstate, che vive per tutta la chiamata:
  // un ref evita di riagganciare il listener a ogni cambio di stato.
  const armedRef = useRef(false);

  const pushSentinel = useCallback(() => {
    if (typeof window === 'undefined') return;
    window.history.pushState({ kaipaiCallGuard: true }, '');
    armedRef.current = true;
  }, []);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    pushSentinel();

    function onPopState() {
      if (!armedRef.current) return;
      armedRef.current = false;
      // Rimette subito la voce: senza, il prossimo Indietro uscirebbe davvero
      // mentre la conferma è ancora aperta.
      pushSentinel();
      setConfirming(true);
    }

    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('popstate', onPopState);
      armedRef.current = false;
    };
  }, [enabled, pushSentinel]);

  const stay = useCallback(() => {
    setConfirming(false);
    if (!armedRef.current) pushSentinel();
  }, [pushSentinel]);

  const leave = useCallback((onLeave: () => void) => {
    armedRef.current = false;
    setConfirming(false);
    onLeave();
  }, []);

  return { confirming, stay, leave };
}
