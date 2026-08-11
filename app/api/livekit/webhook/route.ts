import { after } from 'next/server';
import { WebhookReceiver } from 'livekit-server-sdk';
import {
  recordAiWorkerTrigger,
  recordLiveKitWebhookEvent,
} from '@/lib/core/video/technical-events-server';
import { triggerAiNotesWorker } from '@/lib/core/ai-session-notes/worker-trigger';
import { runAiNotesQueueInline } from '@/lib/core/ai-session-notes/queue-runner';
import {
  LiveKitWebhookError,
  processVerifiedLiveKitWebhook,
} from '@/lib/core/ai-session-notes/livekit-webhook';
import { createProductionAiSessionNotesDependencies } from '@/lib/core/ai-session-notes/dependencies';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  if (!apiKey || !apiSecret) {
    return Response.json(
      { error: 'LiveKit non configurato.' },
      { status: 503 }
    );
  }

  const body = await request.text();
  let event;
  try {
    const receiver = new WebhookReceiver(apiKey, apiSecret);
    event = await receiver.receive(
      body,
      request.headers.get('authorization') ?? undefined
    );
  } catch {
    return Response.json({ error: 'Webhook non valido.' }, { status: 401 });
  }

  try {
    const dependencies = createProductionAiSessionNotesDependencies();
    const result = await processVerifiedLiveKitWebhook(
      event,
      body,
      dependencies
    );
    await recordLiveKitWebhookEvent(event);

    // Gli eventi egress sono gli unici che accodano una trascrizione: solo lì
    // ha senso svegliare il worker. La sveglia parte dopo la risposta, così
    // LiveKit non attende, e un suo fallimento non invalida la consegna.
    if (!result.duplicate && (event.event ?? '').startsWith('egress_')) {
      after(async () => {
        /*
         * L'ordine qui è stato pagato caro.
         *
         * Prima si eseguiva l'intera coda in linea, poi si chiamava il worker,
         * poi si registrava l'esito. Il problema è che la corsa in linea è la
         * parte cara — drena tutta la coda dentro la risposta a un webhook — e
         * quando non finisce nel tempo residuo della funzione, Vercel uccide
         * il resto: niente chiamata al worker e **nessuna riga nel registro**.
         * Il guasto diventa così invisibile: sembra che la sveglia non sia mai
         * stata tentata, e non si distingue da un webhook mai arrivato.
         *
         * Ora prima parte la sveglia HTTP, che è economica e ottiene una
         * funzione tutta sua con il suo budget di tempo; l'esito si scrive
         * subito dopo; e solo alla fine, se resta tempo, si dà una mano in
         * linea. Se veniamo troncati, veniamo troncati sulla parte meno
         * importante — e comunque dopo aver lasciato traccia.
         */
        const outcome = await triggerAiNotesWorker(
          fetch,
          new URL(request.url).origin
        );
        if (outcome !== 'triggered') {
          console.warn('[LiveKit webhook] worker non svegliato', { outcome });
        }
        await recordAiWorkerTrigger(event, outcome).catch(() => {});

        // Rete di sicurezza per quando la sveglia HTTP non parte: qui la coda
        // avanza comunque, con quel che resta del tempo.
        if (outcome !== 'triggered') {
          await runAiNotesQueueInline();
        }
      });
    }

    return Response.json({
      received: true,
      duplicate: result.duplicate,
    });
  } catch (error) {
    const clientError =
      error instanceof LiveKitWebhookError &&
      ['MISSING_EVENT_ID', 'STALE_EVENT', 'REPLAY_MISMATCH'].includes(
        error.code
      );
    console.error('[LiveKit webhook] Processing rejected', {
      reason: error instanceof LiveKitWebhookError
        ? error.code
        : error instanceof Error
          ? error.name
          : 'unknown',
    });
    return Response.json(
      { error: clientError ? 'Webhook non valido.' : 'Webhook non elaborato.' },
      { status: clientError ? 400 : 500 }
    );
  }
}
