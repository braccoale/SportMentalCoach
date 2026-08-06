'use client';

import { useSyncExternalStore } from 'react';
import { COMPACT_MEDIA_QUERY } from '@/lib/core/video/capabilities';

/**
 * Safari < 14 non conosce `addEventListener`/`removeEventListener` su
 * `MediaQueryList` ed espone solo le API deprecate `addListener`/
 * `removeListener`. Senza questo controllo, `subscribe` lancia e
 * `useSyncExternalStore` porta giù l'intera rotta video con un error
 * boundary — proprio sui browser mobile che questo lavoro deve coprire.
 */
type LegacyMediaQueryList = MediaQueryList & {
  addListener?: (listener: (event: MediaQueryListEvent) => void) => void;
  removeListener?: (listener: (event: MediaQueryListEvent) => void) => void;
};

let mediaQueryList: MediaQueryList | null = null;

function getMediaQueryList(): MediaQueryList {
  if (!mediaQueryList) {
    mediaQueryList = window.matchMedia(COMPACT_MEDIA_QUERY);
  }
  return mediaQueryList;
}

function subscribe(onChange: () => void): () => void {
  const query = getMediaQueryList() as LegacyMediaQueryList;
  if (typeof query.addEventListener === 'function') {
    query.addEventListener('change', onChange);
    return () => query.removeEventListener?.('change', onChange);
  }
  query.addListener?.(onChange);
  return () => query.removeListener?.(onChange);
}

function getSnapshot(): boolean {
  return getMediaQueryList().matches;
}

/**
 * `true` su schermo stretto o puntatore touch, `false` altrimenti, `null`
 * finché non lo sappiamo (render lato server e primo render client).
 *
 * Il `null` non è pigrizia: consente a chi lo usa di mostrare uno scheletro
 * neutro invece del layout desktop, evitando il salto visivo di un frame che
 * su mobile si nota eccome. Basato su `matchMedia`, quindi reagisce da solo
 * alla rotazione del dispositivo a metà pre-join.
 */
export function useIsCompact(): boolean | null {
  return useSyncExternalStore(
    subscribe,
    getSnapshot,
    () => null as boolean | null
  );
}

/**
 * Lettura immediata, fuori da React.
 *
 * Serve dove la risposta va data una volta sola e subito — la configurazione
 * della `Room` LiveKit, decisa alla creazione e mai più: aspettare il primo
 * effetto significherebbe ricreare la stanza a chiamata avviata. Lato server
 * risponde `false`, che è anche il valore giusto per un rendering senza
 * schermo.
 */
export function readIsCompact(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return getMediaQueryList().matches;
}
