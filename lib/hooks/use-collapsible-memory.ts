'use client';

import { useCallback, useEffect, useRef, type SyntheticEvent } from 'react';

/**
 * Un `<details>` che ricorda se l'hai lasciato aperto o chiuso.
 *
 * La regola sta qui, e non copiata in ogni blocco richiudibile, perché i
 * dettagli che contano non si vedono guardando il markup: la chiave va
 * scritta e riletta con lo stesso nome, la scrittura può fallire (navigazione
 * privata, cookie di terze parti negati) e in quel caso non ricordare è
 * meglio che rompere l'apertura del blocco.
 *
 * Il ripristino scrive direttamente su `open` via ref invece di passare per
 * lo stato React: `open` è un attributo che il browser gestisce da solo, e
 * metterlo in React vorrebbe dire ri-renderizzare tutto il contenuto del
 * blocco per un valore che il browser sa già trattare. Il prezzo, dichiarato:
 * la lettura avviene dopo l'idratazione, quindi un blocco che avevi chiuso si
 * vede aperto per un fotogramma.
 *
 * La memoria è `localStorage`, cioè questo browser: nessuna riga in tabella,
 * nessuna chiamata di rete, e la scelta non ti segue su un altro computer. Se
 * un giorno dovrà, il posto giusto sono le preferenze utente, non questo file.
 */
export function useCollapsibleMemory(storageKey: string | null | undefined) {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    if (!storageKey || !ref.current) return;
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (stored === 'open' || stored === 'closed') {
        ref.current.open = stored === 'open';
      }
    } catch {
      // localStorage negato: si resta sul default del blocco.
    }
  }, [storageKey]);

  const onToggle = useCallback(
    (event: SyntheticEvent<HTMLDetailsElement>) => {
      if (!storageKey) return;
      try {
        window.localStorage.setItem(
          storageKey,
          event.currentTarget.open ? 'open' : 'closed'
        );
      } catch {
        // Come sopra: non ricordare è meglio che rompere l'apertura.
      }
    },
    [storageKey]
  );

  return { ref, onToggle };
}
