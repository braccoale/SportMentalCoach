'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { createClient } from '@supabase/supabase-js';
import { PhoneCall, Video, X } from 'lucide-react';
import { fetcher } from '@/lib/fetcher';
import type { User } from '@/lib/db/schema';

// Read at build time; empty when Supabase Realtime is not configured.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

type IncomingCall = {
  bookingId: number;
  fromName: string;
  serviceTitle: string | null;
  scheduledFor: string | null;
};

function fmtTime(iso: string | null): string | null {
  if (!iso) return null;
  return new Intl.DateTimeFormat('it-IT', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

/**
 * Global listener: subscribes to the current user's personal call channel and
 * shows an incoming-call popup when a coach starts a video session, so the
 * athlete can jump straight into the room. Ephemeral by design — it only fires
 * while the app is open (Supabase Broadcast). Renders nothing when realtime is
 * not configured or the user is logged out.
 */
export function IncomingCallListener() {
  const { data: user } = useSWR<User | null>('/api/user', fetcher);
  const pathname = usePathname();
  const [call, setCall] = useState<IncomingCall | null>(null);

  const userId = user?.id ?? null;

  useEffect(() => {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !userId) return;
    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const channel = client.channel(`calls-user-${userId}`, {
      config: { broadcast: { self: false } },
    });

    channel
      .on('broadcast', { event: 'call-started' }, ({ payload }) => {
        if (payload && typeof payload.bookingId === 'number') {
          setCall({
            bookingId: payload.bookingId,
            fromName: payload.fromName ?? 'Il tuo contatto',
            serviceTitle: payload.serviceTitle ?? null,
            scheduledFor: payload.scheduledFor ?? null,
          });
        }
      })
      .subscribe();

    return () => {
      client.removeChannel(channel);
    };
  }, [userId]);

  if (!call) return null;

  // Don't nag if the user is already in that call's room.
  if (pathname === `/dashboard/video/${call.bookingId}`) return null;

  const when = fmtTime(call.scheduledFor);

  return (
    <div
      className="fixed bottom-4 right-4 z-[100] w-[calc(100%-2rem)] max-w-sm"
      role="dialog"
      aria-modal="false"
      aria-label="Chiamata in arrivo"
    >
      <div className="overflow-hidden rounded-2xl border border-kp-line bg-kp-ink2 text-kp-hi shadow-2xl ring-1 ring-kp-red/40">
        <div className="flex items-start gap-3 p-4">
          <span className="mt-0.5 flex h-10 w-10 shrink-0 animate-pulse items-center justify-center rounded-full bg-kp-red text-white">
            <PhoneCall className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-kp-red2">
              Videochiamata in arrivo
            </p>
            <p className="mt-0.5 truncate font-display text-base font-semibold">
              {call.fromName} ti sta chiamando
            </p>
            <p className="mt-0.5 truncate text-sm text-kp-mid">
              {call.serviceTitle ?? 'Sessione di mental coaching'}
            </p>
            {when && (
              <p className="mt-0.5 text-xs text-kp-low">Sessione: {when}</p>
            )}
          </div>
          <button
            type="button"
            onClick={() => setCall(null)}
            aria-label="Ignora"
            className="rounded-full p-1.5 text-kp-mid transition-colors hover:bg-white/10 hover:text-kp-hi"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex gap-2 border-t border-kp-line p-3">
          <button
            type="button"
            onClick={() => setCall(null)}
            className="flex-1 rounded-full border border-kp-line px-4 py-2 text-sm font-medium text-kp-mid transition-colors hover:text-kp-hi"
          >
            Ignora
          </button>
          <Link
            href={`/dashboard/video/${call.bookingId}`}
            onClick={() => setCall(null)}
            className="flex flex-1 items-center justify-center gap-2 rounded-full bg-kp-red px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-kp-red2"
          >
            <Video className="h-4 w-4" />
            Partecipa
          </Link>
        </div>
      </div>
    </div>
  );
}
