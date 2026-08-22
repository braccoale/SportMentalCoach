import 'server-only';
import { createHmac } from 'node:crypto';
import { and, desc, eq, isNotNull, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { WebhookEvent } from 'livekit-server-sdk';
import { db, type DbOrTx } from '@/lib/db/drizzle';
import {
  bookings,
  services,
  sessionAiNotes,
  videoSessionEvents,
} from '@/lib/db/schema';
import { getBookingChatContext } from '@/lib/core/messages';
import { notify } from '@/lib/core/notifications';
import { shouldAutoCompleteUnrecordedBooking } from '@/lib/core/bookings/auto-completion-policy';
import {
  parseBookingRoomName,
  participantTechnicalKind,
  sanitizeTechnicalEventDetails,
  technicalEventOccurredAt,
  type ClientVideoEventType,
} from './technical-events';

const participantEvents = alias(
  videoSessionEvents,
  'auto_completion_participant_events'
);
const bookingAiNotes = alias(sessionAiNotes, 'auto_completion_ai_notes');
const finishedRoomEvents = alias(
  videoSessionEvents,
  'history_room_finished_events'
);

function participantReference(identity: string | undefined): string | null {
  if (!identity) return null;
  const secret =
    process.env.AUTH_SECRET ?? process.env.LIVEKIT_API_SECRET ?? 'kaipai';
  return createHmac('sha256', secret)
    .update(identity)
    .digest('hex')
    .slice(0, 32);
}

function asOptionalString(value: unknown, maxLength = 80): string | null {
  if (value === undefined || value === null || value === '') return null;
  return String(value).slice(0, maxLength);
}

/**
 * Chiude amministrativamente una call non registrata quando LiveKit dichiara
 * terminata la stanza.
 *
 * Il controllo e' ripetuto anche nella UPDATE: se nel frattempo parte una
 * sessione AI o qualcuno completa manualmente la prenotazione, il webhook non
 * sovrascrive il nuovo stato e non duplica la notifica.
 */
export async function autoCompleteUnrecordedBookingFromRoomFinished(params: {
  bookingId: number;
  roomName: string;
  occurredAt: Date;
  executor?: DbOrTx;
  auditReason?: 'room_finished' | 'history_reconciliation';
  sendNotification?: boolean;
  notifyBookingCompleted?: (
    userId: number,
    payload: { bookingId: number }
  ) => Promise<unknown>;
}): Promise<boolean> {
  const executor = params.executor ?? db;
  const completed = await executor.transaction(async (tx) => {
    // Query SQL esplicita: nelle sottoquery correlate Drizzle puo' riusare il
    // nome della tabella esterna e cambiare involontariamente il significato
    // del conteggio. Gli alias PostgreSQL qui rendono la verifica univoca.
    const candidateRows = await tx.execute(sql`
      select
        b.id,
        b.status,
        b.client_id,
        b.session_started_at,
        (
          select count(distinct participant_event.participant_ref)::int
          from public.video_session_events as participant_event
          where participant_event.booking_id = b.id
            and participant_event.event_type = 'participant_joined'
            and participant_event.participant_kind = 'authenticated'
            and participant_event.participant_ref is not null
        ) as authenticated_participant_count,
        exists (
          select 1
          from public.session_ai_notes as ai_session
          where ai_session.booking_id = b.id
        ) as has_ai_notes_session
      from public.bookings as b
      where b.id = ${params.bookingId}
      limit 1
    `);
    const rawCandidate = candidateRows[0] as
      | {
          id: number;
          status: string;
          client_id: number;
          session_started_at: Date | null;
          authenticated_participant_count: number;
          has_ai_notes_session: boolean;
        }
      | undefined;
    const candidate = rawCandidate
      ? {
          id: Number(rawCandidate.id),
          status: rawCandidate.status,
          clientId: Number(rawCandidate.client_id),
          sessionStartedAt: rawCandidate.session_started_at,
          authenticatedParticipantCount: Number(
            rawCandidate.authenticated_participant_count
          ),
          hasAiNotesSession: rawCandidate.has_ai_notes_session,
        }
      : null;

    if (
      !candidate ||
      !shouldAutoCompleteUnrecordedBooking({
        status: candidate.status,
        sessionStartedAt: candidate.sessionStartedAt,
        authenticatedParticipantCount: Number(
          candidate.authenticatedParticipantCount
        ),
        hasAiNotesSession: candidate.hasAiNotesSession,
      })
    ) {
      return null;
    }

    const now = new Date();
    const updatedRows = await tx.execute(sql`
      update public.bookings as b
      set
        status = 'completed',
        completed_at = ${params.occurredAt.toISOString()}::timestamp,
        -- L'ultimo heartbeat e' piu' preciso del timeout della stanza.
        session_ended_at = coalesce(
          b.session_ended_at,
          ${params.occurredAt.toISOString()}::timestamp
        ),
        updated_at = ${now.toISOString()}::timestamp,
        updated_by = null
      where b.id = ${candidate.id}
        and b.status = 'accepted'
        and b.session_started_at is not null
        and not exists (
          select 1
          from public.session_ai_notes as ai_session
          where ai_session.booking_id = b.id
        )
        and (
          select count(distinct participant_event.participant_ref)
          from public.video_session_events as participant_event
          where participant_event.booking_id = b.id
            and participant_event.event_type = 'participant_joined'
            and participant_event.participant_kind = 'authenticated'
            and participant_event.participant_ref is not null
        ) >= 2
      returning b.id
    `);
    const updated = updatedRows[0];
    if (!updated) return null;

    await tx.insert(videoSessionEvents).values({
      bookingId: candidate.id,
      webhookId: null,
      source: 'server',
      eventType: 'booking_auto_completed',
      roomName: params.roomName,
      participantKind: 'service',
      details: sanitizeTechnicalEventDetails({
        reason: params.auditReason ?? 'room_finished',
      }),
      occurredAt: params.occurredAt,
    });

    return { clientId: candidate.clientId, bookingId: candidate.id };
  });

  if (!completed) return false;

  // Una riconciliazione dello storico non deve inviare oggi una notifica per
  // una seduta avvenuta giorni o mesi fa. Il cambio di stato e la relativa
  // traccia tecnica restano comunque atomici e verificabili.
  if (params.sendNotification === false) return true;

  // La chiusura resta valida anche se un canale di notifica e' momentaneamente
  // indisponibile; il webhook non deve essere ritentato su uno stato gia'
  // completato soltanto per un effetto secondario.
  const sendNotification =
    params.notifyBookingCompleted ??
    ((userId: number, payload: { bookingId: number }) =>
      notify('booking_completed', userId, payload));
  await sendNotification(completed.clientId, {
    bookingId: completed.bookingId,
  }).catch((error) => {
    console.error('[LiveKit webhook] notifica autocompletamento non inviata', {
      bookingId: completed.bookingId,
      reason: error instanceof Error ? error.name : 'unknown',
    });
  });
  return true;
}

export type HistoricalAutoCompletionCandidate = {
  bookingId: number;
  roomName: string;
  occurredAt: Date;
};

/**
 * Trova le sole prenotazioni storiche che avrebbero superato la stessa regola
 * applicata oggi dal webhook `room_finished`.
 *
 * La query non usa nomi, email o altri dati personali: restituisce soltanto
 * l'id tecnico della prenotazione e il riferimento della stanza necessario
 * alla traccia di audit.
 */
export async function findHistoricalAutoCompletionCandidates(params?: {
  executor?: DbOrTx;
  limit?: number;
}): Promise<HistoricalAutoCompletionCandidate[]> {
  const executor = params?.executor ?? db;
  const limit = Math.max(1, Math.min(params?.limit ?? 500, 2_000));

  const rows = await executor
    .select({
      bookingId: bookings.id,
      roomName: sql<string>`max(${finishedRoomEvents.roomName})`,
      occurredAt: sql<Date>`max(${finishedRoomEvents.occurredAt})`,
    })
    .from(bookings)
    .innerJoin(
      finishedRoomEvents,
      and(
        eq(finishedRoomEvents.bookingId, bookings.id),
        eq(finishedRoomEvents.eventType, 'room_finished')
      )
    )
    .where(
      and(
        eq(bookings.status, 'accepted'),
        isNotNull(bookings.sessionStartedAt),
        sql`not exists (
          select 1
          from public.session_ai_notes as auto_completion_ai_notes
          where ${bookingAiNotes.bookingId} = ${bookings.id}
        )`,
        sql`(
          select count(distinct ${participantEvents.participantRef})
          from public.video_session_events as auto_completion_participant_events
          where ${participantEvents.bookingId} = ${bookings.id}
            and ${participantEvents.eventType} = 'participant_joined'
            and ${participantEvents.participantKind} = 'authenticated'
            and ${participantEvents.participantRef} is not null
        ) >= 2`
      )
    )
    .groupBy(bookings.id)
    .orderBy(desc(sql`max(${finishedRoomEvents.occurredAt})`))
    .limit(limit);

  return rows.map((row) => ({
    bookingId: row.bookingId,
    roomName: row.roomName,
    occurredAt:
      row.occurredAt instanceof Date
        ? row.occurredAt
        : new Date(row.occurredAt),
  }));
}

/**
 * Riconcilia in modo idempotente lo storico. Di default fa soltanto una
 * preview; `repair: true` applica gli stessi controlli una seconda volta
 * dentro ogni transazione, cosi' una modifica concorrente non viene toccata.
 */
export async function reconcileHistoricalUnrecordedBookings(params?: {
  executor?: DbOrTx;
  repair?: boolean;
  limit?: number;
}): Promise<{ candidates: number; completed: number; bookingIds: number[] }> {
  const executor = params?.executor ?? db;
  const candidates = await findHistoricalAutoCompletionCandidates({
    executor,
    limit: params?.limit,
  });

  if (!params?.repair) {
    return {
      candidates: candidates.length,
      completed: 0,
      bookingIds: candidates.map((candidate) => candidate.bookingId),
    };
  }

  const completedIds: number[] = [];
  for (const candidate of candidates) {
    const completed = await autoCompleteUnrecordedBookingFromRoomFinished({
      ...candidate,
      executor,
      auditReason: 'history_reconciliation',
      sendNotification: false,
    });
    if (completed) completedIds.push(candidate.bookingId);
  }

  return {
    candidates: candidates.length,
    completed: completedIds.length,
    bookingIds: completedIds,
  };
}

/**
 * Persists a verified LiveKit webhook without names, raw identities, tokens,
 * metadata or media payloads. Events for non-booking rooms are intentionally
 * ignored (including the dedicated preflight rooms).
 */
export async function recordLiveKitWebhookEvent(
  event: WebhookEvent
): Promise<boolean> {
  const roomName =
    event.room?.name || event.egressInfo?.roomName || event.ingressInfo?.roomName;
  const bookingId = parseBookingRoomName(roomName ?? '');
  if (!bookingId || !event.event) return false;

  const booking = await db
    .select({ id: bookings.id })
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .limit(1);
  if (!booking[0]) return false;

  const participantIdentity = event.participant?.identity;
  const details = sanitizeTechnicalEventDetails({
    status: event.participant?.state,
    reason: event.participant?.disconnectReason,
  });

  await db
    .insert(videoSessionEvents)
    .values({
      bookingId,
      webhookId: event.id || null,
      source: 'livekit_webhook',
      eventType: event.event,
      roomName: roomName!,
      roomSid: asOptionalString(event.room?.sid),
      participantRef: participantReference(participantIdentity),
      participantKind: participantTechnicalKind(participantIdentity),
      participantSid: asOptionalString(event.participant?.sid),
      trackKind: asOptionalString(event.track?.type, 24),
      trackSource: asOptionalString(event.track?.source, 40),
      details,
      occurredAt: technicalEventOccurredAt(event.createdAt),
    })
    .onConflictDoNothing({ target: videoSessionEvents.webhookId });

  if (event.event === 'room_finished') {
    await autoCompleteUnrecordedBookingFromRoomFinished({
      bookingId,
      roomName: roomName!,
      occurredAt: technicalEventOccurredAt(event.createdAt),
    });
  }
  return true;
}

/**
 * Registra se il worker degli Appunti AI è stato svegliato, e con che esito.
 *
 * La sveglia parte dopo la risposta al webhook: se fallisce, l'unica traccia
 * era una riga di log, che su un piano senza conservazione dei log runtime
 * sparisce prima che qualcuno la cerchi. È esattamente com'è passata
 * inosservata per giorni una coda che non veniva mai svuotata — con la
 * trascrizione ferma e nessun segnale da nessuna parte. Qui l'esito resta
 * nella stessa traccia eventi in cui si legge il resto della sessione.
 */
export async function recordAiWorkerTrigger(
  event: WebhookEvent,
  outcome: string
): Promise<boolean> {
  const roomName =
    event.room?.name || event.egressInfo?.roomName || event.ingressInfo?.roomName;
  const bookingId = parseBookingRoomName(roomName ?? '');
  if (!bookingId) return false;

  await db.insert(videoSessionEvents).values({
    bookingId,
    webhookId: null,
    source: 'server',
    eventType: 'ai_worker_trigger',
    roomName: roomName!,
    participantKind: 'service',
    details: sanitizeTechnicalEventDetails({ outcome }),
    occurredAt: new Date(),
  });
  return true;
}

export async function recordClientVideoEvent(
  bookingId: number,
  userId: number,
  eventType: ClientVideoEventType,
  rawDetails: unknown
): Promise<boolean> {
  const context = await getBookingChatContext(bookingId, userId);
  if (!context || context.status !== 'accepted') return false;

  await db.insert(videoSessionEvents).values({
    bookingId,
    webhookId: null,
    source: 'client',
    eventType,
    roomName: `booking-${bookingId}`,
    participantRef: participantReference(`user-${userId}`),
    participantKind: 'authenticated',
    details: sanitizeTechnicalEventDetails(rawDetails),
    occurredAt: new Date(),
    createdBy: userId,
    updatedBy: userId,
  });
  return true;
}

export type VideoTechnicalEventItem = {
  id: number;
  bookingId: number;
  eventType: string;
  source: string;
  participantKind: string | null;
  trackKind: string | null;
  trackSource: string | null;
  details: Record<string, string | number | boolean | null>;
  occurredAt: Date;
  scheduledFor: Date | null;
  serviceTitle: string | null;
};

export async function getRecentVideoTechnicalEvents(
  limit = 250
): Promise<VideoTechnicalEventItem[]> {
  return db
    .select({
      id: videoSessionEvents.id,
      bookingId: videoSessionEvents.bookingId,
      eventType: videoSessionEvents.eventType,
      source: videoSessionEvents.source,
      participantKind: videoSessionEvents.participantKind,
      trackKind: videoSessionEvents.trackKind,
      trackSource: videoSessionEvents.trackSource,
      details: videoSessionEvents.details,
      occurredAt: videoSessionEvents.occurredAt,
      scheduledFor: bookings.scheduledFor,
      serviceTitle: services.title,
    })
    .from(videoSessionEvents)
    .innerJoin(bookings, eq(bookings.id, videoSessionEvents.bookingId))
    .leftJoin(services, eq(services.id, bookings.serviceId))
    .orderBy(desc(videoSessionEvents.occurredAt))
    .limit(Math.max(1, Math.min(500, limit)));
}
