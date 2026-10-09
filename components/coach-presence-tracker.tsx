'use client';

import { useEffect } from 'react';
import { COACH_PRESENCE_CHANNEL, coachPresenceKey } from '@/lib/core/coach-presence';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Segnala che il coach è online finché la sua area è aperta. Non mostra nulla.
 *
 * La presenza vive solo nel canale Realtime: niente database. Se la scheda si
 * chiude o la connessione cade, Supabase la toglie da solo. Senza Realtime
 * configurato non fa niente, come l'ascoltatore delle chiamate.
 */
export function CoachPresenceTracker({ providerId }: { providerId: number }) {
  useEffect(() => {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return;
    let cancelled = false;
    let cleanup: (() => void) | undefined;

    // Il client si carica solo qui (code-split): le altre pagine non lo pagano.
    import('@supabase/supabase-js').then(({ createClient }) => {
      if (cancelled) return;
      const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      const channel = client.channel(COACH_PRESENCE_CHANNEL, {
        config: { presence: { key: coachPresenceKey(providerId) } },
      });
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') void channel.track({ providerId, at: Date.now() });
      });
      cleanup = () => {
        void channel.untrack();
        client.removeChannel(channel);
      };
    });

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [providerId]);

  return null;
}
