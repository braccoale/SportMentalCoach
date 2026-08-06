import 'server-only';
import { getAppBaseUrl } from '@/lib/core/app-url';

/**
 * Sveglia il worker nel momento in cui un job entra in coda.
 *
 * L'informazione "l'audio è pronto" arriva già dal webhook LiveKit: usarla è
 * più rapido e più economico che interrogare periodicamente una coda quasi
 * sempre vuota. Il cron resta come rete di sicurezza per i casi in cui questa
 * chiamata non parta.
 *
 * È deliberatamente best effort: un fallimento qui non deve mai far fallire il
 * webhook, altrimenti LiveKit ritenterebbe una consegna già elaborata.
 */

export type WorkerTriggerOutcome = 'triggered' | 'skipped' | 'failed';

/** La chiamata è asincrona lato worker, quindi risponde in millisecondi. */
const TRIGGER_TIMEOUT_MS = 5_000;

function workerOrigin(): string | null {
  const configured = getAppBaseUrl();
  if (configured) return configured;

  /*
   * Il dominio stabile di produzione prima dell'URL del singolo deployment.
   *
   * `VERCEL_URL` punta al deployment specifico, che sta dietro la protezione
   * di Vercel: una richiesta lì riceve un 302 verso la pagina di accesso e non
   * raggiunge mai la rotta. Il worker non veniva svegliato e i job restavano
   * in coda fino al cron del giorno dopo — verificato dall'esterno, il
   * dominio del deployment risponde 302 mentre l'alias di produzione risponde
   * 404 (cioè la rotta c'è, e rifiuta perché manca il segreto).
   *
   * `VERCEL_PROJECT_PRODUCTION_URL` è quell'alias stabile, e non è protetto.
   */
  const productionUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (productionUrl) return `https://${productionUrl}`;

  const vercelUrl = process.env.VERCEL_URL?.trim();
  return vercelUrl ? `https://${vercelUrl}` : null;
}

export async function triggerAiNotesWorker(
  fetcher: typeof fetch = fetch
): Promise<WorkerTriggerOutcome> {
  const secret = process.env.CRON_SECRET?.trim();
  const origin = workerOrigin();
  if (!secret || !origin) return 'skipped';

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TRIGGER_TIMEOUT_MS);
  try {
    const response = await fetcher(
      `${origin}/api/internal/ai-notes/process?mode=async`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${secret}` },
        signal: controller.signal,
      }
    );
    return response.ok ? 'triggered' : 'failed';
  } catch {
    return 'failed';
  } finally {
    clearTimeout(timer);
  }
}
