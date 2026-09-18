'use client';

import { useActionState } from 'react';
import {
  startAcademyRecordingAction,
  declineAcademyRecordingAction,
} from '@/app/(dashboard)/dashboard/coach/academy/actions';
import type { ActionState } from '@/lib/auth/middleware';

const initialState: ActionState = {};

export type AcademyRecordingControlStatus =
  | 'undecided'
  | 'recording'
  | 'processing'
  | 'ready'
  | 'failed'
  | 'declined'
  | 'cancelled';

/**
 * Il consenso del docente a registrare la sessione — visibile solo a lui,
 * sopra la videoconferenza. Una volta dato, la registrazione (e poi la
 * trascrizione, e poi il recap) procedono da sole: qui c'è solo la scelta
 * iniziale, mai un pannello di controllo della pipeline.
 */
export function AcademyRecordingConsentControl({
  sessionId,
  courseId,
  initialStatus,
}: {
  sessionId: number;
  courseId: number;
  initialStatus: AcademyRecordingControlStatus;
}) {
  const [startState, startAction, startPending] = useActionState(startAcademyRecordingAction, initialState);
  const [declineState, declineAction, declinePending] = useActionState(declineAcademyRecordingAction, initialState);

  const status: AcademyRecordingControlStatus = startState.success
    ? 'recording'
    : declineState.success
      ? 'declined'
      : initialStatus;

  if (status === 'recording' || status === 'processing' || status === 'ready') {
    const label =
      status === 'recording'
        ? 'Registrazione e trascrizione attive'
        : status === 'processing'
          ? 'Trascrizione in corso…'
          : 'Recap pronto a fine sessione';
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white/80">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden="true" />
        {label}
      </span>
    );
  }

  if (status === 'failed') {
    return (
      <span className="text-xs font-medium text-white/80">
        Trascrizione non riuscita — puoi riprovare dalla pagina del corso.
      </span>
    );
  }

  if (status === 'declined' || status === 'cancelled') {
    return <span className="text-xs font-medium text-white/60">Sessione non registrata</span>;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="hidden text-xs text-white/70 sm:inline">Registrare e trascrivere con l&apos;AI?</span>
      <form action={startAction}>
        <input type="hidden" name="sessionId" value={sessionId} />
        <input type="hidden" name="courseId" value={courseId} />
        <button
          type="submit"
          disabled={startPending || declinePending}
          className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-gray-900 hover:bg-white/90 disabled:opacity-60"
        >
          {startPending ? 'Avvio…' : 'Sì, registra'}
        </button>
      </form>
      <form action={declineAction}>
        <input type="hidden" name="sessionId" value={sessionId} />
        <input type="hidden" name="courseId" value={courseId} />
        <button
          type="submit"
          disabled={startPending || declinePending}
          className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/80 hover:bg-white/20 disabled:opacity-60"
        >
          No, grazie
        </button>
      </form>
      {(startState.error || declineState.error) && (
        <span className="text-xs text-red-300">{startState.error || declineState.error}</span>
      )}
    </div>
  );
}
