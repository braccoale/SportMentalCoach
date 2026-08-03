import { WebhookReceiver } from 'livekit-server-sdk';
import { recordLiveKitWebhookEvent } from '@/lib/core/video/technical-events-server';
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
