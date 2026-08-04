'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Posizione dell'overlay Appunti AI dentro la stanza video.
 *
 * Non parte da `top-3`: quella riga è occupata dall'header della chiamata, e il
 * pannello finiva sopra il pulsante di uscita — praticamente inevitabile su
 * mobile, dove la larghezza dello schermo non lascia scampo. Parte quindi sotto
 * la barra, tenendo conto della safe area dei telefoni con notch.
 */
const OVERLAY_POSITION =
  'absolute left-3 z-20 top-[calc(3.75rem+env(safe-area-inset-top))]';

type AiNotesSession = {
  id: number;
  bookingId: number;
  status:
    | 'waiting_for_consent'
    | 'active'
    | 'processing'
    | 'ready_for_review'
    | 'approved'
    | 'shared'
    | 'consent_rejected'
    | 'cancelled'
    | 'transcription_failed'
    | 'report_failed';
  viewerRole: 'coach' | 'athlete';
  canCancel: boolean;
  consents: Array<{
    participantRole: string;
    status: string;
    isCurrentUser: boolean;
  }>;
};

type RecordingStatus = {
  state:
    | 'not_started'
    | 'starting'
    | 'recording'
    | 'stopping'
    | 'recorded'
    | 'failed'
    | 'deleted';
  participants: Array<{
    role: 'coach' | 'athlete';
    status: string;
    startedAt: string | null;
    endedAt: string | null;
    errorCode: string | null;
  }>;
};

function BetaBadge() {
  return (
    <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold tracking-wide text-violet-700">
      BETA
    </span>
  );
}

/**
 * Overlay comprimibile.
 *
 * Su schermo piccolo il pannello resta chiuso: si vede solo una pastiglia con
 * l'icona e il pallino di stato, che occupa pochi millimetri e non copre nulla.
 * Un tocco lo apre. Da `sm` in su c'è spazio, quindi è sempre aperto e il
 * pulsante di apertura sparisce.
 *
 * Lo stato è gestito in CSS e non con un media query in JavaScript: così al
 * primo render la dimensione è già quella giusta, senza sfarfallii.
 */
function CollapsibleOverlay({
  label,
  tone,
  indicator,
  children,
}: {
  /** Testo letto dagli screen reader e mostrato accanto all'icona da `sm`. */
  label: string;
  tone: 'neutral' | 'active' | 'error';
  /** Pallino di stato, visibile anche quando il pannello è chiuso. */
  indicator?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  const toneClass =
    tone === 'error'
      ? 'border-red-300/40 bg-red-950/90'
      : tone === 'active'
        ? 'border-emerald-300/40 bg-emerald-950/90'
        : 'border-white/15 bg-black/75';

  return (
    <div className={`${OVERLAY_POSITION} max-w-[calc(100vw-1.5rem)] sm:max-w-sm`}>
      {/* Pastiglia: unico elemento visibile su mobile quando è chiuso. */}
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label={open ? `Chiudi ${label}` : `Apri ${label}`}
        className={`flex items-center gap-1.5 rounded-full border p-2 text-white shadow-xl backdrop-blur sm:hidden ${toneClass}`}
      >
        <Sparkles className="size-4 text-violet-300" aria-hidden="true" />
        {indicator}
        {open ? (
          <X className="size-3.5 opacity-70" aria-hidden="true" />
        ) : (
          <ChevronDown className="size-3.5 opacity-70" aria-hidden="true" />
        )}
      </button>

      <div
        className={`${open ? 'mt-2 block' : 'hidden'} rounded-xl border p-3 text-white shadow-xl backdrop-blur sm:mt-0 sm:block ${toneClass}`}
      >
        {children}
      </div>
    </div>
  );
}

export function AiSessionNotesControl({
  bookingId,
  canStart,
}: {
  bookingId: number;
  canStart: boolean;
}) {
  const [session, setSession] = useState<AiNotesSession | null>(null);
  const [recording, setRecording] = useState<RecordingStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mutationInFlight = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/appointments/${bookingId}/ai-session-notes`,
        { cache: 'no-store' }
      );
      if (!response.ok) return;
      const payload = (await response.json()) as {
        session: AiNotesSession | null;
      };
      setSession(payload.session);
      if (payload.session) {
        const recordingResponse = await fetch(
          `/api/ai-session-notes/${payload.session.id}/recording`,
          { cache: 'no-store' }
        );
        if (recordingResponse.ok) {
          const recordingPayload = (await recordingResponse.json()) as {
            recording: RecordingStatus;
          };
          setRecording(recordingPayload.recording);
        }
      } else {
        setRecording(null);
      }
    } catch {
      // Polling is best-effort; the next interval retries without disrupting
      // the video call.
    }
  }, [bookingId]);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(refresh, 3_000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  async function mutate(path: string, body?: object) {
    if (mutationInFlight.current) return;
    mutationInFlight.current = true;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(path, {
        method: 'POST',
        headers: body ? { 'content-type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        session?: AiNotesSession | null;
        recording?: RecordingStatus;
      } | null;
      if (!response.ok) {
        setError(payload?.error ?? 'Operazione non riuscita.');
        return;
      }
      if (payload && 'session' in payload) {
        setSession(payload.session ?? null);
      }
      if (payload?.recording) setRecording(payload.recording);
      await refresh();
    } catch {
      setError('Connessione non disponibile. Riprova.');
    } finally {
      mutationInFlight.current = false;
      setLoading(false);
    }
  }

  function start() {
    void mutate('/api/ai-session-notes/start', {
      appointmentId: bookingId,
    });
  }

  const terminal =
    session?.status === 'consent_rejected' ||
    session?.status === 'cancelled' ||
    session?.status === 'transcription_failed' ||
    session?.status === 'report_failed';
  const ownConsent = session?.consents.find(
    (consent) => consent.isCurrentUser
  );

  if (!session && !canStart) return null;

  if (!session || terminal) {
    return (
      <CollapsibleOverlay label="Appunti AI" tone="neutral">
        <div aria-busy={loading} className="flex items-center gap-2">
          <Sparkles className="size-4 shrink-0 text-violet-300" aria-hidden="true" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">
                {terminal ? 'Appunti AI non attivi' : 'Appunti AI'}
              </span>
              <BetaBadge />
            </div>
            {error && <p className="mt-1 text-xs text-red-300">{error}</p>}
          </div>
          {canStart && (
            <Button
              type="button"
              size="sm"
              className="ml-2 shrink-0 rounded-full bg-violet-600 hover:bg-violet-700"
              disabled={loading}
              onClick={start}
            >
              <Sparkles className="size-3.5" />
              {loading
                ? 'Attivazione…'
                : terminal
                  ? 'Nuova richiesta'
                  : 'Attiva appunti AI'}
            </Button>
          )}
        </div>
      </CollapsibleOverlay>
    );
  }

  if (session.status === 'waiting_for_consent') {
    return (
      // Il consenso non si comprime: richiede una decisione, e nasconderlo
      // dietro un'icona significherebbe bloccare la sessione senza spiegare
      // perché. Viene solo spostato sotto l'header e limitato in larghezza.
      <div
        className={`${OVERLAY_POSITION} w-[calc(100vw-1.5rem)] max-w-sm rounded-2xl border border-violet-200 bg-white p-4 text-gray-900 shadow-2xl`}
        role="dialog"
        aria-label="Consenso Appunti AI"
        aria-busy={loading}
      >
        <div className="flex items-center gap-2">
          <Sparkles className="size-5 text-violet-600" />
          <h2 className="font-semibold">Appunti AI della sessione</h2>
          <BetaBadge />
        </div>
        <p className="mt-2 text-sm leading-relaxed text-gray-600">
          L’Assistente AI potrà trascrivere la conversazione e preparare un
          riepilogo della sessione.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-gray-600">
          La funzione si attiverà soltanto se tutti i partecipanti accettano.
          In questa fase di test non verrà ancora avviata alcuna trascrizione
          reale.
        </p>

        {ownConsent?.status === 'pending' ? (
          <div className="mt-4 flex gap-2">
            <Button
              type="button"
              className="flex-1 rounded-full"
              disabled={loading}
              onClick={() =>
                void mutate(
                  `/api/ai-session-notes/${session.id}/consent`,
                  { decision: 'accepted' }
                )
              }
            >
              {loading ? 'Invio…' : 'Accetto'}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="flex-1 rounded-full"
              disabled={loading}
              onClick={() =>
                void mutate(
                  `/api/ai-session-notes/${session.id}/consent`,
                  { decision: 'rejected' }
                )
              }
            >
              {loading ? 'Invio…' : 'Non accetto'}
            </Button>
          </div>
        ) : (
          <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">
            In attesa del consenso di tutti i partecipanti
          </p>
        )}
        {session.canCancel && (
          <button
            type="button"
            className="mt-3 text-xs font-medium text-gray-500 underline"
            disabled={loading}
            onClick={() =>
              void mutate(`/api/ai-session-notes/${session.id}/cancel`)
            }
          >
            {loading ? 'Annullamento…' : 'Annulla richiesta'}
          </button>
        )}
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      </div>
    );
  }

  if (session.status === 'active') {
    const recordingLabel =
      recording?.state === 'recording'
        ? 'Registrazione audio attiva'
        : recording?.state === 'starting'
          ? 'Avvio registrazione audio…'
          : recording?.state === 'stopping'
            ? 'Arresto registrazione audio…'
            : recording?.state === 'recorded'
              ? 'Registrazione audio terminata'
              : recording?.state === 'failed'
                ? 'Errore registrazione audio'
                : recording?.state === 'deleted'
                  ? 'Audio eliminato'
                  : 'Registrazione audio non avviata';
    const activeRoles = recording
      ? [
          ...new Set(
            recording.participants
              .filter((participant) =>
                ['starting', 'recording', 'stopping'].includes(
                  participant.status
                )
              )
              .map((participant) =>
                participant.role === 'coach' ? 'coach' : 'atleta'
              )
          ),
        ]
      : [];
    // Il pallino resta visibile anche a pannello chiuso: "sta registrando" è
    // l'informazione che non può mai sparire, nemmeno su uno schermo piccolo.
    const dot = (
      <span
        className={`size-2 shrink-0 rounded-full ${
          recording?.state === 'recording'
            ? 'animate-pulse bg-red-400'
            : 'bg-amber-300'
        }`}
        aria-hidden="true"
      />
    );

    return (
      <CollapsibleOverlay
        label={recordingLabel}
        tone={recording?.state === 'failed' ? 'error' : 'active'}
        indicator={dot}
      >
        <div aria-busy={loading}>
        <div className="flex flex-wrap items-center gap-2">
          {dot}
          <span className="text-sm font-semibold">{recordingLabel}</span>
          <BetaBadge />
        </div>
        {activeRoles.length > 0 && (
          <p className="mt-1 text-xs text-emerald-100">
            Tracce microfono separate: {activeRoles.join(' e ')}.
          </p>
        )}
        <p className="mt-1 text-xs text-emerald-100">
          Puoi revocare il consenso in qualsiasi momento.
        </p>
        {session.viewerRole === 'coach' &&
          (recording?.state === 'not_started' ||
            recording?.state === 'failed') && (
            <button
              type="button"
              className="mt-2 mr-3 text-xs font-medium text-white underline"
              disabled={loading}
              onClick={() =>
                void mutate(
                  `/api/ai-session-notes/${session.id}/recording/start`
                )
              }
            >
              {loading ? 'Avvio…' : 'Riprova avvio registrazione'}
            </button>
          )}
        <button
          type="button"
          className="mt-2 text-xs font-medium text-white underline"
          disabled={loading}
          onClick={() =>
            void mutate(`/api/ai-session-notes/${session.id}/consent`, {
              decision: 'revoked',
            })
          }
        >
          {loading ? 'Revoca in corso…' : 'Revoca il mio consenso'}
        </button>
        {error && <p className="mt-1 text-xs text-red-300">{error}</p>}
        </div>
      </CollapsibleOverlay>
    );
  }

  return (
    <CollapsibleOverlay label="Appunti AI" tone="neutral">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Sparkles className="size-4 shrink-0 text-violet-300" aria-hidden="true" />
        <span>Appunti AI · {session.status.replaceAll('_', ' ')}</span>
        <BetaBadge />
      </div>
    </CollapsibleOverlay>
  );
}
