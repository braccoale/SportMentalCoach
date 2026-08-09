import 'server-only';
import { normalizedCallbackBase } from './transcription-dispatch';
import {
  interpretProbeResponse,
  type CallbackProbeResult,
} from './callback-probe-policy';
import { logPipeline } from './pipeline-log';

/**
 * Prova che il provider possa davvero richiamarci.
 *
 * L'indirizzo di callback è l'unico pezzo della pipeline che non possiamo
 * verificare da soli durante il lavoro: lo diamo a Deepgram e speriamo. Un
 * valore sbagliato è rimasto invisibile per giorni — l'host senza `https://`,
 * l'indirizzo che ne usciva non assoluto, ogni consegna rifiutata con un
 * errore che non nominava il campo.
 *
 * Questa prova bussa al nostro stesso endpoint con un token che non esiste.
 * La risposta attesa è un 404 prodotto dalla nostra applicazione: significa
 * che l'indirizzo è pubblico, che nessuna protezione lo blocca e che nessun
 * redirect lo devia. Qualunque altra cosa — un 401 di protezione, un 3xx, una
 * pagina di errore, un timeout — significa che il provider non ci arriverà.
 *
 * Costa tre secondi e si esegue quando si vuole, invece di scoprirlo con una
 * seduta vera.
 */

/** Ben formato ma impossibile: nessuna richiesta reale userà mai zeri. */
const IMPOSSIBLE_TOKEN = '0'.repeat(64);

const PROBE_TIMEOUT_MS = 8_000;


export type { CallbackProbeResult };

export async function probeCallbackEndpoint(
  fetcher: typeof fetch = fetch
): Promise<CallbackProbeResult> {
  const raw = process.env.AI_NOTES_CALLBACK_BASE_URL?.trim();
  if (!raw) {
    return {
      reachable: false,
      origin: null,
      detail:
        'AI_NOTES_CALLBACK_BASE_URL non è configurata: nessuna trascrizione asincrona può funzionare.',
    };
  }

  let origin: string;
  try {
    origin = normalizedCallbackBase(raw);
  } catch {
    return {
      reachable: false,
      origin: raw.slice(0, 60),
      detail:
        'Il valore configurato non è un indirizzo https valido. Deve essere del tipo https://dominio.it',
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const response = await fetcher(
      `${origin}/api/internal/ai-notes/stt-callback/${IMPOSSIBLE_TOKEN}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ probe: true }),
        // Un redirect non va seguito: il provider non lo seguirebbe, e
        // seguirlo qui darebbe un esito ottimista e falso.
        redirect: 'manual',
        signal: controller.signal,
      }
    );
    const result = interpretProbeResponse(origin, response.status);
    logPipeline({
      phase: 'transcription_callback',
      outcome: result.reachable ? 'ok' : 'failed',
      detail: { prova: true, origine: origin, stato: response.status },
    });
    return result;
  } catch (error) {
    const aborted = error instanceof DOMException && error.name === 'AbortError';
    logPipeline({
      phase: 'transcription_callback',
      outcome: 'failed',
      errorCode: aborted ? 'PROBE_TIMEOUT' : 'PROBE_FAILED',
      detail: { prova: true, origine: origin },
    });
    return {
      reachable: false,
      origin,
      detail: aborted
        ? 'Nessuna risposta entro otto secondi: l’indirizzo non è raggiungibile da internet.'
        : 'La richiesta non è arrivata a destinazione: controlla il dominio.',
    };
  } finally {
    clearTimeout(timer);
  }
}
