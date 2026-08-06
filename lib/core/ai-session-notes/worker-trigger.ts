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

function workerOrigins(): string[] {
  const origins = [
    /*
     * Prima scelta: l'alias diretto e stabile del progetto Vercel, per esempio
     * https://sport-mental-coach-arge.vercel.app. Non passa dal redirect
     * kaipaicoaching.com -> www.kaipaicoaching.com che può eliminare
     * l'Authorization header prima di raggiungere la rotta protetta.
     */
    process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim()
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL.trim()}`
      : null,
    getAppBaseUrl(),
    process.env.VERCEL_URL?.trim() ? `https://${process.env.VERCEL_URL.trim()}` : null,
  ].filter((value): value is string => Boolean(value));

  return [...new Set(origins)];
}

export async function triggerAiNotesWorker(
  fetcher: typeof fetch = fetch
): Promise<WorkerTriggerOutcome> {
  const secret = process.env.CRON_SECRET?.trim();
  const origins = workerOrigins();
  if (!secret || origins.length === 0) return 'skipped';

  for (const origin of origins) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TRIGGER_TIMEOUT_MS);
    try {
      const response = await fetcher(
        `${origin}/api/internal/ai-notes/process?mode=async`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${secret}` },
          // Non inoltrare mai il segreto attraverso redirect fra domini.
          redirect: 'manual',
          signal: controller.signal,
        }
      );
      if (response.ok) return 'triggered';
    } catch {
      // Prova l'origine successiva; il webhook resta sempre best effort.
    } finally {
      clearTimeout(timer);
    }
  }

  return 'failed';
}
