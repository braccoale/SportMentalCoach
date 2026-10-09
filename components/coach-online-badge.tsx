'use client';

import { useSyncExternalStore } from 'react';
import {
  COACH_PRESENCE_CHANNEL,
  onlineProviderIds,
  sameIds,
} from '@/lib/core/coach-presence';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/*
 * Una sola connessione per pagina, condivisa da tutte le schede dell'elenco:
 * si apre quando compare il primo bollino e si chiude quando sparisce l'ultimo.
 * Chi guarda l'elenco ascolta soltanto, non segnala la propria presenza.
 */
const EMPTY: ReadonlySet<number> = new Set();
let current: ReadonlySet<number> = EMPTY;
const listeners = new Set<() => void>();
let teardown: (() => void) | null = null;
let cancelled = false;

function open() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return;
  cancelled = false;
  import('@supabase/supabase-js').then(({ createClient }) => {
    if (cancelled) return;
    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const channel = client.channel(COACH_PRESENCE_CHANNEL);
    channel
      .on('presence', { event: 'sync' }, () => {
        const next = onlineProviderIds(channel.presenceState());
        if (sameIds(current, next)) return;
        current = next;
        listeners.forEach((l) => l());
      })
      .subscribe();
    teardown = () => client.removeChannel(channel);
  });
}

function close() {
  cancelled = true;
  teardown?.();
  teardown = null;
  current = EMPTY;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) open();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) close();
  };
}

const getSnapshot = () => current;
const getServerSnapshot = () => EMPTY;

/**
 * Il bollino «Online» sulla foto del coach. Compare solo se il coach ha la sua
 * area aperta in questo momento; altrimenti non si vede niente (e non c'è mai
 * un bollino «Offline»: l'assenza non è un'informazione da mostrare).
 */
export function CoachOnlineBadge({ providerId }: { providerId: number }) {
  const online = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  if (!online.has(providerId)) return null;
  return (
    <span
      className="absolute left-3 top-3 z-10 inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white shadow-md"
      role="status"
    >
      <span className="h-2 w-2 rounded-full bg-white" aria-hidden />
      Online
    </span>
  );
}
