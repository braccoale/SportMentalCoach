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

function workerOrigins(preferredOrigin?: string): string[] {
  const origins = [
    /*
     * Prima di tutto l'origine della richiesta in corso, quando c'e'.
     *
     * E' l'unica che sappiamo raggiungibile: ci e' appena arrivata addosso
     * una richiesta da li'. Le altre sono ricostruite da variabili d'ambiente
     * che possono mancare — le variabili di sistema Vercel sono esposte solo
     * se il progetto lo prevede — o puntare a un dominio che redirige, e un
     * redirect qui vale come fallimento perche' non inoltriamo mai il segreto
     * attraverso un cambio di host.
     */
    preferredOrigin?.trim() || null,
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
  fetcher: typeof fetch = fetch,
  preferredOrigin?: string
): Promise<WorkerTriggerOutcome> {
  const secret = process.env.CRON_SECRET?.trim();
  const origins = workerOrigins(preferredOrigin);
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
