'use client';

import { useActionState, useCallback, useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { createClient, type RealtimeChannel } from '@supabase/supabase-js';
import { Button } from '@/components/ui/button';
import { formatDateTime } from '@/lib/core/format';
import { sendMessageAction } from './actions';
import type { ActionState } from '@/lib/auth/middleware';

export type SerializedMessage = {
  id: number;
  senderId: number;
  senderName: string | null;
  senderEmail: string;
  body: string;
  createdAt: string; // ISO
};

// Read at build time; empty when Supabase Realtime is not configured.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export function ChatPanel({
  bookingId,
  currentUserId,
  initialMessages,
}: {
  bookingId: number;
  currentUserId: number;
  initialMessages: SerializedMessage[];
}) {
  const [messages, setMessages] = useState<SerializedMessage[]>(initialMessages);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    sendMessageAction,
    {}
  );
  const formRef = useRef<HTMLFormElement>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const realtimeEnabled = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

  // Re-fetch through the participant-guarded server endpoint. Realtime never
  // carries message content — it only triggers this authenticated fetch.
  const refetch = useCallback(async () => {
    try {
      const res = await fetch(`/api/chat/${bookingId}/messages`, {
        cache: 'no-store',
      });
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.messages)) setMessages(data.messages);
    } catch {
      // best-effort; the server-rendered list remains valid
    }
  }, [bookingId]);

  // Optional realtime subscription (Supabase Broadcast — a content-free nudge).
  useEffect(() => {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return;
    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const channel = client.channel(`chat-${bookingId}`, {
      config: { broadcast: { self: false } },
    });
    channel
      .on('broadcast', { event: 'new-message' }, () => {
        refetch();
      })
      .subscribe();
    channelRef.current = channel;
    return () => {
      client.removeChannel(channel);
      channelRef.current = null;
    };
  }, [bookingId, refetch]);

  // After a successful send: clear, refetch our own list, and nudge the peer.
  useEffect(() => {
    if (state?.success) {
      formRef.current?.reset();
      refetch();
      channelRef.current?.send({
        type: 'broadcast',
        event: 'new-message',
        payload: {},
      });
    }
  }, [state, refetch]);

  return (
    <>
      <div className="mt-6 flex flex-col gap-3 rounded-lg border border-gray-200 p-4">
        {messages.length === 0 ? (
          <p className="text-sm text-gray-500">
            Nessun messaggio. Inizia la conversazione.
          </p>
        ) : (
          messages.map((m) => {
            const mine = m.senderId === currentUserId;
            return (
              <div
                key={m.id}
                className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                  mine
                    ? 'self-end bg-orange-500 text-white'
                    : 'self-start bg-gray-100 text-gray-800'
                }`}
              >
                <p className="whitespace-pre-line">{m.body}</p>
                <p
                  className={`mt-1 text-[11px] ${
                    mine ? 'text-orange-100' : 'text-gray-400'
                  }`}
                >
                  {mine ? 'Tu' : m.senderName ?? m.senderEmail} ·{' '}
                  {formatDateTime(new Date(m.createdAt))}
                </p>
              </div>
            );
          })
        )}
      </div>

      <form ref={formRef} action={formAction} className="mt-4 flex flex-col gap-2">
        <input type="hidden" name="bookingId" value={bookingId} />
        <textarea
          name="body"
          rows={3}
          required
          maxLength={4000}
          placeholder="Scrivi un messaggio…"
          className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
        />
        {state?.error && <p className="text-sm text-red-500">{state.error}</p>}
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={pending} className="rounded-full">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Invia'}
          </Button>
          <span className="text-xs text-gray-400">
            {realtimeEnabled
              ? 'Aggiornamento in tempo reale attivo.'
              : 'Aggiorna la pagina per vedere i nuovi messaggi.'}
          </span>
        </div>
      </form>
    </>
  );
}
