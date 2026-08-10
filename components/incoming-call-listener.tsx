'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import { PhoneCall, Video, X } from 'lucide-react';
import { fetcher } from '@/lib/fetcher';
import { startRingtone } from '@/lib/core/call-ringtone';
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

  // Whether the user is currently inside any video room. Kept in a ref so the
  // realtime handler (bound once) always reads the live value.
  const inVideoRoom = pathname?.startsWith('/dashboard/video/') ?? false;
  const inVideoRoomRef = useRef(inVideoRoom);
  inVideoRoomRef.current = inVideoRoom;

  useEffect(() => {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !userId) return;
    let cancelled = false;
    let cleanup: (() => void) | undefined;

    // Load the Supabase client lazily (code-split) so it isn't bundled into
    // every dashboard page — only fetched when we actually subscribe.
    import('@supabase/supabase-js').then(({ createClient }) => {
      if (cancelled) return;
      const client = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!);
      const channel = client.channel(`calls-user-${userId}`, {
        config: { broadcast: { self: false } },
      });

      channel
        .on('broadcast', { event: 'call-started' }, ({ payload }) => {
          if (!payload || typeof payload.bookingId !== 'number') return;
          // Ignore the peer's "I joined" broadcast while we're already in a
          // room (otherwise it lingers in state and re-pops when we return to
          // the dashboard), and ignore stale broadcasts.
          if (inVideoRoomRef.current) return;
          if (
            typeof payload.startedAt === 'number' &&
            Date.now() - payload.startedAt > 45_000
          ) {
            return;
          }
          setCall({
            bookingId: payload.bookingId,
            fromName: payload.fromName ?? 'Il tuo contatto',
            serviceTitle: payload.serviceTitle ?? null,
            scheduledFor: payload.scheduledFor ?? null,
          });
        })
        .subscribe();

      cleanup = () => {
        client.removeChannel(channel);
      };
    });

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [userId]);

  // Entering a video room dismisses any pending popup.
  useEffect(() => {
    if (inVideoRoom) setCall(null);
  }, [inVideoRoom]);

  // A ringing popup shouldn't hang forever — auto-dismiss after 45s.
  useEffect(() => {
    if (!call) return;
    const t = setTimeout(() => setCall(null), 45_000);
    return () => clearTimeout(t);
  }, [call]);

  /*
   * Suona finché il popup è a schermo.
   *
   * Legato al ciclo di vita del popup e non ai singoli pulsanti: qualunque
   * sia il motivo per cui sparisce — accettata, ignorata, scaduta, si entra
   * nella stanza — il suono si ferma con lui. Un modo solo per smettere
   * significa nessun modo per dimenticarsene.
   */
  useEffect(() => {
    if (!call) return;
    const ringtone = startRingtone();
    return () => ringtone.stop();
  }, [call]);

  if (!call || inVideoRoom) return null;

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
