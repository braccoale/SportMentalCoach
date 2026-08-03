import { AiNotesDomainError } from './state-machine';

export function aiNotesErrorResponse(error: unknown): Response {
  if (!(error instanceof AiNotesDomainError)) {
    console.error('[AI session notes] unexpected server error', {
      name: error instanceof Error ? error.name : 'unknown',
    });
    return Response.json(
      { error: 'Errore interno durante la gestione di Appunti AI.' },
      { status: 500 }
    );
  }

  const status =
    error.code === 'NOT_FOUND'
      ? 404
      : error.code === 'FORBIDDEN' || error.code === 'NOT_ENTITLED'
        ? 403
        : error.code === 'VIDEO_NOT_CONFIGURED' ||
            error.code === 'STORAGE_NOT_CONFIGURED'
          ? 503
          : error.code === 'INVALID_ROOM' ||
              error.code === 'INVALID_CONSENT'
            ? 400
            : 409;
  return Response.json({ error: error.message, code: error.code }, { status });
}
