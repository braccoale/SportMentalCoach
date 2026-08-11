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
  viewerIsCoach: boolean;
  otherName: string;
};

export function fetchSessions() {
  return request<{ sessions: UpcomingSession[] }>('/api/mobile/sessions');
}

export type RoomCredentials = {
  token: string;
  url: string;
  room: string;
  otherName: string;
  viewerIsCoach: boolean;
};

export function fetchRoomCredentials(bookingId: number) {
  return request<RoomCredentials>(`/api/video/${bookingId}/token`, {
    method: 'POST',
  });
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
