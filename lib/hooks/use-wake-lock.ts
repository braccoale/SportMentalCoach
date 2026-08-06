'use client';

import { useEffect } from 'react';

/**
 * Screen Wake Lock: la richiesta viene rilasciata dal browser ogni volta che la
 * pagina passa in secondo piano, e non torna da sola. Va riagganciata al
 * rientro, altrimenti dura solo fino alla prima notifica che l'utente apre.
 */
type WakeLockSentinelLike = {
  released: boolean;
  release: () => Promise<void>;
  addEventListener: (type: 'release', listener: () => void) => void;
};

type WakeLockCapableNavigator = Navigator & {
  wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> };
};

/**
 * Tiene acceso lo schermo finché `active` è vero.
 *
 * Durante una videochiamata l'utente spesso non tocca lo schermo per minuti:
 * il telefono lo spegne, e con lo schermo spento il browser sospende la
 * cattura video. Chiedere il wake lock è il modo di evitarlo *prima* che
 * accada, invece di limitarsi a spiegare all'utente di non farlo accadere.
 *
 * Dove l'API non esiste (Safari iOS sotto la 16.4, WebView datati) la funzione
 * non fa nulla: resta l'avviso testuale, che è la ragione per cui i due
 * rimedi convivono.
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const wakeLock = (navigator as WakeLockCapableNavigator).wakeLock;
    if (!wakeLock) return;

    let sentinel: WakeLockSentinelLike | null = null;
    let cancelled = false;

    const acquire = async () => {
      if (cancelled || document.visibilityState !== 'visible') return;
      if (sentinel && !sentinel.released) return;
      try {
        sentinel = await wakeLock.request('screen');
        if (cancelled) {
          void sentinel.release().catch(() => {});
          return;
        }
        // Il rilascio può arrivare dal sistema (batteria bassa, cambio app):
        // azzerare il riferimento permette di riprovare al rientro.
        sentinel.addEventListener('release', () => {
          sentinel = null;
        });
      } catch {
        // Negato o non disponibile: l'avviso testuale resta l'unico rimedio.
        sentinel = null;
      }
    };

    const reacquire = () => {
      if (document.visibilityState === 'visible') void acquire();
    };

    void acquire();
    document.addEventListener('visibilitychange', reacquire);
    window.addEventListener('pageshow', reacquire);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', reacquire);
      window.removeEventListener('pageshow', reacquire);
      if (sentinel && !sentinel.released) {
        void sentinel.release().catch(() => {});
      }
      sentinel = null;
    };
  }, [active]);
}
