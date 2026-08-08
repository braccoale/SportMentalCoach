/**
 * Copertura di una sessione: quanta parte è stata davvero registrata, cosa
 * manca e perché.
 *
 * Modulo puro. Riceve dati semplici e restituisce una struttura, mai testo:
 * la traduzione in italiano vive altrove, così una modifica al tono del
 * prodotto non tocca il calcolo e viceversa.
 *
 * Esiste perché un riepilogo AI presentato come completo quando copre l'ottanta
 * per cento della seduta è peggio di nessun riepilogo: è il fallimento
 * silenzioso che questo lavoro elimina.
 */

export type CoverageCloseReason =
  | 'coach_closed'
  | 'room_finished'
  | 'closed_by_timeout'
  | 'unknown';

export type CoverageGapCause =
  | 'participant_left'
  | 'track_unpublished'
  | 'unverified_participant'
  | 'recording_failed'
  | 'unknown';

export type CoverageTranscriptionState =
  | 'done'
  | 'pending'
  | 'failed'
  | 'not_requested';

export type CoverageSegmentInput = {
  participantRole: 'coach' | 'athlete';
  startedAt: Date | null;
  endedAt: Date | null;
  status: string;
  stopReason: string | null;
  errorCode: string | null;
  transcriptionState: CoverageTranscriptionState;
};

export type SessionCoverageInput = {
  sessionStartedAt: Date | null;
  sessionEndedAt: Date | null;
  closeReason: CoverageCloseReason;
  segments: CoverageSegmentInput[];
  now: Date;
};

export type CoverageGap = {
  /** Millisecondi dall'inizio della sessione. */
  startMs: number;
  durationMs: number;
  cause: CoverageGapCause;
};

export type SessionCoverageState =
  | 'completa'
  | 'con_interruzioni'
  | 'in_corso'
  | 'parziale'
  | 'fallita';

export type SessionCoverage = {
  state: SessionCoverageState;
  closeReason: CoverageCloseReason;
  sessionDurationMs: number;
  recordedDurationMs: number;
  coveragePercent: number;
  gaps: CoverageGap[];
  transcription: {
    done: number;
    pending: number;
    failed: number;
    total: number;
  };
};

/**
 * Sotto questa soglia un tratto scoperto è una transizione tecnica fra due
 * egress, non un'interruzione che il coach abbia percepito. Segnalarla
 * sarebbe rumore che rende sospetta anche una sessione integra.
 */
const MIN_PERCEIVABLE_GAP_MS = 5_000;

type Span = { start: number; end: number; segment: CoverageSegmentInput };

function gapCause(previous: CoverageSegmentInput | null): CoverageGapCause {
  if (!previous) return 'unknown';
  if (previous.errorCode) return 'recording_failed';
  switch (previous.stopReason) {
    case 'participant_left':
      return 'participant_left';
    case 'track_unpublished':
      return 'track_unpublished';
    case 'unverified_participant_joined':
      return 'unverified_participant';
    default:
      return previous.status === 'failed' ? 'recording_failed' : 'unknown';
  }
}

export function buildSessionCoverage(
  input: SessionCoverageInput
): SessionCoverage {
  const startedTimes = input.segments
    .map((segment) => segment.startedAt?.getTime())
    .filter((value): value is number => typeof value === 'number');

  const sessionStart =
    input.sessionStartedAt?.getTime() ??
    (startedTimes.length ? Math.min(...startedTimes) : null);
  const sessionEnd = (input.sessionEndedAt ?? input.now).getTime();
  const sessionDurationMs =
    sessionStart === null ? 0 : Math.max(0, sessionEnd - sessionStart);

  // Un momento in cui almeno una traccia registrava è un momento coperto: se
  // il coach continuava mentre l'atleta era caduto, la sessione è stata
  // comunque sentita. Gli intervalli di tutti i partecipanti si fondono.
  const spans: Span[] = input.segments.flatMap((segment) => {
    if (sessionStart === null || !segment.startedAt) return [];
    const start = Math.max(0, segment.startedAt.getTime() - sessionStart);
    const rawEnd = (segment.endedAt ?? input.now).getTime() - sessionStart;
    const end = Math.min(Math.max(start, rawEnd), sessionDurationMs);
    return [{ start, end, segment }];
  });
  spans.sort((left, right) => left.start - right.start || left.end - right.end);

  const merged: Span[] = [];
  for (const span of spans) {
    const last = merged[merged.length - 1];
    if (last && span.start <= last.end) {
      // Il segmento che chiude più tardi è quello che spiegherà il buco
      // successivo, perché è l'ultimo ad aver smesso di registrare.
      if (span.end > last.end) {
        last.end = span.end;
        last.segment = span.segment;
      }
      continue;
    }
    merged.push({ ...span });
  }

  const recordedDurationMs = merged.reduce(
    (total, span) => total + (span.end - span.start),
    0
  );

  const gaps: CoverageGap[] = [];
  let cursor = 0;
  let previousSegment: CoverageSegmentInput | null = null;
  for (const span of merged) {
    const gapMs = span.start - cursor;
    if (gapMs >= MIN_PERCEIVABLE_GAP_MS) {
      gaps.push({
        startMs: cursor,
        durationMs: gapMs,
        cause: gapCause(previousSegment),
      });
    }
    cursor = Math.max(cursor, span.end);
    previousSegment = span.segment;
  }
  const trailingGapMs = sessionDurationMs - cursor;
  if (merged.length > 0 && trailingGapMs >= MIN_PERCEIVABLE_GAP_MS) {
    gaps.push({
      startMs: cursor,
      durationMs: trailingGapMs,
      cause: gapCause(previousSegment),
    });
  }

  const transcription = {
    done: input.segments.filter((s) => s.transcriptionState === 'done').length,
    pending: input.segments.filter((s) => s.transcriptionState === 'pending')
      .length,
    failed: input.segments.filter((s) => s.transcriptionState === 'failed')
      .length,
    total: input.segments.length,
  };

  const coveragePercent =
    sessionDurationMs > 0
      ? Math.round((recordedDurationMs / sessionDurationMs) * 100)
      : 0;

  // L'ordine conta: un fallimento va dichiarato anche quando la copertura
  // audio è integra, e un'attesa va dichiarata prima di parlare di buchi.
  const state: SessionCoverageState =
    input.segments.length === 0 || recordedDurationMs === 0
      ? 'fallita'
      : transcription.failed > 0
        ? 'parziale'
        : transcription.pending > 0
          ? 'in_corso'
          : gaps.length > 0
            ? 'con_interruzioni'
            : 'completa';

  return {
    state,
    closeReason: input.closeReason,
    sessionDurationMs,
    recordedDurationMs,
    coveragePercent,
    gaps,
    transcription,
  };
}
