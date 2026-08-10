'use client';

import { useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

// Read at build time; empty when Supabase Realtime is not configured.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Broadcasts a content-free "I opened the room" nudge to the other
 * participant's personal call channel, so their app can show an incoming-call
 * popup with the join link. Either participant can start the call; the second
 * to arrive gets the popup (whoever is already in the room suppresses it).
 * Best-effort: renders nothing and does nothing when realtime is not
 * configured. Fires once on mount (entering the video page = starting/joining).
 */
export function StartCallSignal({
  bookingId,
  counterpartUserId,
  fromName,
  serviceTitle,
  scheduledFor,
}: {
  bookingId: number;
  counterpartUserId: number;
  fromName: string;
  serviceTitle: string | null;
  scheduledFor: string | null;
}) {
  /*
   * Il telefono dell'altro, anche con l'app chiusa.
   *
   * Il broadcast qui sotto raggiunge solo chi ha KaiPai aperto in questo
   * momento; la notifica push e' l'unico canale che attraversa un'app chiusa.
   * Sono due strade separate di proposito: se Supabase Realtime non e'
   * configurato il popup non parte, ma lo squillo deve partire lo stesso.
   */
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/video/${bookingId}/ring`, {
      method: 'POST',
      signal: controller.signal,
    }).catch(() => {
      // Best effort: chi entra in stanza non deve vedere un errore perche'
      // il servizio push non ha risposto.
    });
    return () => controller.abort();
  }, [bookingId]);

  useEffect(() => {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return;
    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const channel = client.channel(`calls-user-${counterpartUserId}`);

    channel.subscribe((status) => {
      if (status !== 'SUBSCRIBED') return;
      channel.send({
        type: 'broadcast',
        event: 'call-started',
        payload: {
          bookingId,
          fromName,
          serviceTitle,
          scheduledFor,
          startedAt: Date.now(),
        },
      });
    });

    return () => {
      client.removeChannel(channel);
    };
  }, [bookingId, counterpartUserId, fromName, serviceTitle, scheduledFor]);

  return null;
}
