/**
 * Quanto vale la pena ritentare un "Rigenera bozza" fallito, dallo stesso
 * client che lo ha chiesto.
 *
 * La sessione 114 lo ha mostrato dal vero: il pulsante del coach fa una sola
 * chiamata sincrona, senza il retry automatico che la coda del worker applica
 * agli stessi errori (`processing-policy.ts`, `failureOutcome`) — lì un
 * generation_report fallito viene ritentato fino a `max_attempts` a
 * prescindere dal codice. Un tentativo in più non stava dentro i 45 s di
 * budget del provider più i 60 s della function: la generazione da sola
 * arriva già all'85-95% di quel budget. Ma un secondo tentativo *client-side*
 * — una nuova richiesta HTTP, con un nuovo budget tutto suo — costa solo un
 * altro clic che il coach non deve sapere di dover fare.
 *
 * Non ogni fallimento merita un altro giro: un problema di stato o di accesso
 * alla sessione non cambia ritentando. Solo gli esiti che descrivono un
 * fallimento del *tentativo* — non della richiesta — lo meritano, sullo
 * stesso principio della coda: qualunque errore del provider è ritentabile,
 * gli errori di accesso o di stato no.
 */
export const COMPASS_REGENERATE_MAX_ATTEMPTS = 3;

const RETRYABLE_STATUSES = new Set([
  422, // COMPASS_INVALID — il contenuto di questo tentativo non ha retto i controlli
  429, // COMPASS_RATE_LIMITED
  500, // errore non previsto
  502, // COMPASS_FAILED — il provider ha risposto male
  504, // COMPASS_TIMEOUT
]);

export function isRetryableCompassRegenerateStatus(status: number): boolean {
  return RETRYABLE_STATUSES.has(status);
}
