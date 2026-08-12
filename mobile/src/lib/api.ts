import { API_BASE_URL } from './config';
import { accessToken } from './auth';

/**
 * Il client verso l'API KaiPai.
 *
 * Una funzione sola, perché l'app fa tre chiamate in tutto. Allega il token
 * della sessione a ogni richiesta: il server accetta sia il cookie del
 * browser sia questo (vedi `lib/auth/api-user.ts`), quindi le rotte sono le
 * stesse per web e app e non c'è un secondo insieme di regole da tenere
 * allineato.
 */
async function request<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const token = await accessToken();
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });

  const payload = (await response.json().catch(() => null)) as
    | (T & { error?: string })
    | null;

  if (!response.ok) {
    throw new ApiError(payload?.error ?? 'request_failed', response.status);
  }
  if (!payload) throw new ApiError('empty_response', response.status);
  return payload;
}

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number
  ) {
    super(code);
    this.name = 'ApiError';
  }
}

export type UpcomingSession = {
  bookingId: number;
  scheduledFor: string | null;
  durationMin: number;
  title: string;
  /** `pending` è una richiesta che il coach non ha ancora accettato. */
  status: string;
  viewerIsCoach: boolean;
  otherName: string;
};

export function fetchSessions() {
  return request<{ sessions: UpcomingSession[]; past: UpcomingSession[] }>(
    '/api/mobile/sessions'
  );
}

export type RoomCredentials = {
  token: string;
  url: string;
  room: string;
  otherName: string;
  viewerIsCoach: boolean;
  /** Identità LiveKit del coach: serve a riconoscerlo nella sala d'attesa. */
  coachIdentity: string;
};

export function fetchRoomCredentials(bookingId: number) {
  return request<RoomCredentials>(`/api/video/${bookingId}/token`, {
    method: 'POST',
  });
}

/**
 * Gli Appunti AI, visti dall'app.
 *
 * Stesse rotte del web: sono le uniche a decidere chi può cosa, e un secondo
 * insieme di regole per l'app sarebbe un secondo insieme da tenere allineato.
 * L'app ne usa il minimo — sapere a che punto è, e rispondere al consenso —
 * perché la lettura del riepilogo resta dove c'è lo spazio per leggerlo.
 */
export type AiNotesConsent = {
  participantRole: 'coach' | 'athlete';
  status: string;
  isCurrentUser: boolean;
};

export type AiNotesSession = {
  id: number;
  bookingId: number;
  status: string;
  viewerRole: 'coach' | 'athlete';
  consents: AiNotesConsent[];
};

export function fetchAiNotes(bookingId: number) {
  return request<{ session: AiNotesSession | null }>(
    `/api/appointments/${bookingId}/ai-session-notes`
  );
}

export function startAiNotes(bookingId: number) {
  return request<{ session: AiNotesSession }>('/api/ai-session-notes/start', {
    method: 'POST',
    body: JSON.stringify({ appointmentId: bookingId }),
  });
}

export function respondToAiNotesConsent(
  sessionId: number,
  decision: 'accepted' | 'rejected' | 'revoked'
) {
  return request<{ session: AiNotesSession }>(
    `/api/ai-session-notes/${sessionId}/consent`,
    { method: 'POST', body: JSON.stringify({ decision }) }
  );
}

export type AppointmentOptions = {
  athletes: { userId: number; name: string }[];
  services: { id: number; title: string; durationMin: number }[];
};

/** Atleti e servizi fra cui scegliere per un nuovo appuntamento. */
export function newAppointmentOptions() {
  return request<AppointmentOptions>('/api/mobile/new-appointment');
}

export function createAppointment(input: {
  clientUserId: number;
  serviceId: number;
  durationMin?: number;
  scheduledFor: string;
}) {
  return request<{ ok: true; bookingId: number }>('/api/mobile/new-appointment', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/** Il coach risponde a una richiesta, dal telefono. */
export function decideBooking(bookingId: number, accept: boolean) {
  return request<{ ok: true }>(`/api/mobile/bookings/${bookingId}`, {
    method: 'POST',
    body: JSON.stringify({ action: accept ? 'accept' : 'decline' }),
  });
}

/** Le azioni su una prenotazione: annulla, sposta, collegamento per l'atleta. */
export function cancelBooking(bookingId: number) {
  return request<{ ok: true }>(`/api/mobile/bookings/${bookingId}`, {
    method: 'POST',
    body: JSON.stringify({ action: 'cancel' }),
  });
}

export function rescheduleBooking(
  bookingId: number,
  scheduledFor: string,
  durationMin?: number
) {
  return request<{ ok: true }>(`/api/mobile/bookings/${bookingId}`, {
    method: 'POST',
    body: JSON.stringify({ action: 'reschedule', scheduledFor, durationMin }),
  });
}

export function athleteCallLink(bookingId: number) {
  return request<{ url: string }>(`/api/mobile/bookings/${bookingId}`, {
    method: 'POST',
    body: JSON.stringify({ action: 'athlete-link' }),
  });
}

export function saveClosingNote(sessionId: number, note: string) {
  return request<{ saved: boolean }>(
    `/api/ai-session-notes/${sessionId}/closing-note`,
    { method: 'POST', body: JSON.stringify({ note }) }
  );
}

export function closeAiNotes(sessionId: number) {
  return request<unknown>(`/api/ai-session-notes/${sessionId}/close`, {
    method: 'POST',
  });
}

export function createGuestInvite(bookingId: number) {
  return request<{ url: string; expiresAt: string }>(
    `/api/video/${bookingId}/guest-invite`,
    { method: 'POST' }
  );
}

/** Motivi di rifiuto che vale la pena raccontare invece di dire «errore». */
export const ROOM_ERROR_TEXT: Record<string, string> = {
  too_early: 'La stanza apre pochi minuti prima dell’orario della sessione.',
  past: 'Questa sessione è terminata.',
  closed: 'Questa sessione non è più aperta.',
  unauthorized: 'Non fai parte di questa sessione.',
  guardian_required: 'Manca l’autorizzazione del genitore o tutore.',
  not_configured: 'Le videochiamate non sono configurate.',
};
