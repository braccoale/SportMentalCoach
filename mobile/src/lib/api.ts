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

  /*
   * Una richiesta che non torna deve diventare un errore, non un'attesa
   * infinita.
   *
   * `fetch` da solo non ha un tempo massimo: su una rete che non risponde —
   * il caso normale di un telefono, non l'eccezione — la promessa resta
   * appesa per sempre, e chi guarda vede una rotella che gira senza che
   * niente possa piu' cambiare. Meglio un errore con la possibilita` di
   * riprovare.
   */
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      signal: abort.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
    });
  } catch (cause) {
    throw new ApiError(
      abort.signal.aborted ? 'timeout' : 'network_unreachable',
      0,
      { cause }
    );
  } finally {
    clearTimeout(timer);
  }

  const payload = (await response.json().catch(() => null)) as
    | (T & { error?: string })
    | null;

  if (!response.ok) {
    throw new ApiError(payload?.error ?? 'request_failed', response.status);
  }
  if (!payload) throw new ApiError('empty_response', response.status);
  return payload;
}

/**
 * Oltre questo, la rete non sta rispondendo: si smette di aspettare.
 *
 * Quindici secondi sono lunghi per chi guarda ma corti per una rete mobile
 * lenta: sotto, si romperebbero richieste che sarebbero arrivate.
 */
const REQUEST_TIMEOUT_MS = 15_000;

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    options?: { cause?: unknown }
  ) {
    super(code, options);
    this.name = 'ApiError';
  }
}

export type UpcomingSession = {
  bookingId: number;
  scheduledFor: string | null;
  durationMin: number;
  title: string;
  /** `requested` è una richiesta che il coach non ha ancora accettato. */
  status: string;
  /** La stanza è aperta adesso? Lo decide il server, con la regola del web. */
  canJoinNow?: boolean;
  /** Durata reale, nota solo dopo che la sessione si e` svolta. */
  actualMinutes?: number | null;
  /** Stato del riepilogo AI, `null` quando la seduta non ne ha uno. */
  aiNotes?: string | null;
  /** Foto di chi si ha davanti: coach per l'atleta, atleta per il coach. */
  otherAvatarUrl?: string | null;
  /** Quando la seduta e' stata chiusa davvero, se lo e' stata. */
  endedAt?: string | null;
  viewerIsCoach: boolean;
  otherName: string;
};

export function fetchSessions() {
  return request<{ sessions: UpcomingSession[]; past: UpcomingSession[] }>(
    '/api/mobile/sessions'
  );
}

/**
 * Dice al server che qualcuno e` ancora in stanza.
 *
 * Da qui il server ricava quando la sessione e` cominciata davvero e quanto e`
 * durata — e, finche` i battiti arrivano, che la sessione non e` finita: chi
 * esce un momento la ritrova in cima all'elenco invece che nella cronologia.
 */
export function sendSessionHeartbeat(bookingId: number) {
  return request<{ ok: boolean }>(`/api/video/${bookingId}/heartbeat`, {
    method: 'POST',
  });
}

/**
 * Una seduta passata, come serve su un telefono: com'e` andata, e cosa resta
 * da fare. Il resto del Session Compass sta sul web, dove si legge da fermi.
 */
export type SessionDetail = {
  bookingId: number;
  status: string;
  scheduledFor: string | null;
  title: string;
  viewerIsCoach: boolean;
  otherName: string;
  otherAvatarUrl: string | null;
  actualMinutes: number | null;
  /** Stato degli appunti AI, `null` quando non erano attivi. */
  notes: string | null;
  report: {
    summary: string;
    themes: string[];
    commitments: {
      text: string;
      owner: string;
      status: string;
      dueDate: string | null;
    }[];
    /** Se il coach l'ha gia` confermato. Una bozza va letta come tale. */
    approved: boolean;
    stale: boolean;
  } | null;
};

export function fetchSessionDetail(bookingId: number) {
  return request<SessionDetail>(`/api/mobile/sessions/${bookingId}`);
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

/**
 * Un giorno in cui il coach lavora, con i suoi orari liberi.
 *
 * Li calcola il server dalla disponibilita` settimanale del coach, gia`
 * ripuliti degli appuntamenti presi ed espressi in ora italiana: sono
 * **esattamente** le stesse opzioni della dashboard web.
 */
/**
 * Un orario proponibile, gia` giudicato dal server.
 *
 * Il giudizio — libero, stretto, occupato — non lo rifa` l'app: lo calcola il
 * server con `slotPresentation`, la stessa funzione che disegna l'elenco sul
 * web. E` il modo di non far divergere di nuovo le due schermate.
 */
export type BookableSlot = {
  /** «HH:mm», ora italiana. */
  time: string;
  /** Cosa aggiungere accanto all'ora: «· Occupato», «· Solo 30 min», o nulla. */
  suffix: string;
  selectable: boolean;
  tone: 'free' | 'tight' | 'occupied';
  /** Durata a cui scendere scegliendo questo orario stretto, se serve. */
  fitsDurationMin: number | null;
};

export type BookableDay = {
  /** Giorno in ora italiana, «AAAA-MM-GG». */
  value: string;
  /** Come si legge: «Lunedì 27 lug». */
  label: string;
  slots: BookableSlot[];
};

export type AppointmentOptions = {
  athletes: { userId: number; name: string }[];
  services: { id: number; title: string; durationMin: number }[];
  bookableDays?: BookableDay[];
  /** Atleta → ultimo servizio usato con lui, se ancora offerto. */
  lastServiceByAthlete?: Record<number, number>;
  /** Le durate proponibili, decise dal server: una sola lista per web e app. */
  durationOptions?: number[];
  defaultDurationMin?: number;
};

/**
 * Atleti, servizi e orari prenotabili.
 *
 * La durata cambia quali orari sono proponibili — alle 10:30, con una sessione
 * alle 11, mezz'ora ci sta e quaranta minuti no — quindi si richiede l'elenco
 * quando cambia il servizio scelto.
 */
export function newAppointmentOptions(durationMin?: number) {
  const query = durationMin ? `?durationMin=${durationMin}` : '';
  return request<AppointmentOptions>(`/api/mobile/new-appointment${query}`);
}

export function createAppointment(input: {
  clientUserId: number;
  serviceId: number;
  durationMin?: number;
  scheduledFor?: string;
  startingNow?: boolean;
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
