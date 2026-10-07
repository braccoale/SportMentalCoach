/**
 * L'esito di «Password dimenticata», come lo legge chi la chiede.
 *
 * Il sito risponde sempre «se l'email è registrata riceverai un link»: dire se
 * un indirizzo esiste permetterebbe di scoprire chi è iscritto. Ma questa
 * frase non può valere anche quando **la mail non parte**: l'invio è di
 * Supabase Auth, e quando le sue credenziali SMTP non sono valide risponde 500
 * (`535 Authentication credentials invalid`) — e l'utente aspettava una mail
 * che non sarebbe mai arrivata.
 *
 * Supabase risponde con successo anche per un indirizzo che non esiste, quindi
 * un errore qui è sempre del servizio (invio, limite di richieste), mai
 * dell'indirizzo: mostrarlo non rivela niente su chi è registrato.
 *
 * Modulo puro.
 */

export const PASSWORD_RESET_SENT_MESSAGE =
  'Se l’email è registrata riceverai un link per reimpostare la password. Controlla la posta (anche lo spam).';

export const PASSWORD_RESET_FAILED_MESSAGE =
  'Non siamo riusciti a inviare la mail. Riprova tra qualche minuto; se continua, scrivi al supporto.';

export type PasswordResetOutcome =
  | { ok: true; message: string }
  | { ok: false; message: string };

export function passwordResetOutcome(
  error: { status?: number; code?: string } | null | undefined
): PasswordResetOutcome {
  return error
    ? { ok: false, message: PASSWORD_RESET_FAILED_MESSAGE }
    : { ok: true, message: PASSWORD_RESET_SENT_MESSAGE };
}
