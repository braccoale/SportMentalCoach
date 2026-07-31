'use client';

import { useSyncExternalStore } from 'react';
import { COMPACT_MEDIA_QUERY } from '@/lib/core/video/capabilities';

function subscribe(onChange: () => void): () => void {
  const query = window.matchMedia(COMPACT_MEDIA_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

function getSnapshot(): boolean {
  return window.matchMedia(COMPACT_MEDIA_QUERY).matches;
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
