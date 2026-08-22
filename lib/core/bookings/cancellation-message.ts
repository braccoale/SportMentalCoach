export const CANCELLATION_NOTE_MAX_LENGTH = 1000;
export const CANCELLATION_MESSAGE_TITLE = 'Appuntamento Annullato';

export type CancellationMessageResult =
  | { ok: true; body: string }
  | { ok: false; error: string };

/**
 * Costruisce il messaggio che resterà nella chat archiviata della sessione.
 * La validazione vive nel dominio, non soltanto nel textarea client.
 */
export function buildCancellationMessage(
  optionalNote: string | null | undefined
): CancellationMessageResult {
  const note = optionalNote?.trim() ?? '';
  if (note.length > CANCELLATION_NOTE_MAX_LENGTH) {
    return {
      ok: false,
      error: `Il messaggio può contenere al massimo ${CANCELLATION_NOTE_MAX_LENGTH} caratteri.`,
    };
  }

  return {
    ok: true,
    body: note
      ? `${CANCELLATION_MESSAGE_TITLE}\n\n${note}`
      : CANCELLATION_MESSAGE_TITLE,
  };
}
