import 'server-only';
import Stripe from 'stripe';
import { processStripeEvent } from '@/lib/core/billing/webhook';

export const dynamic = 'force-dynamic';

/**
 * Webhook Stripe per gli account collegati dei coach (Connect).
 *
 * Non dipende da `BILLING_ENABLED` (che è del vecchio template e resta
 * spento): senza il segreto `STRIPE_CONNECT_WEBHOOK_SECRET` risponde 503 e non
 * fa niente. La firma si verifica sul corpo **grezzo**: riletto come JSON e
 * riscritto, non corrisponderebbe più.
 *
 * Risponde 200 quando l'evento è stato gestito, ignorato o già visto; 500 solo
 * se è un guasto da ripetere (Stripe lo riconsegna da solo).
 */
export async function POST(request: Request) {
  const secret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET?.trim();
  if (!secret) {
    console.error('[payments] STRIPE_CONNECT_WEBHOOK_SECRET non configurato');
    return new Response('Webhook non configurato', { status: 503 });
  }

  const signature = request.headers.get('stripe-signature');
  if (!signature) {
    return new Response('Firma mancante', { status: 400 });
  }

  const payload = await request.text();
  let event: Stripe.Event;
  try {
    event = Stripe.webhooks.constructEvent(payload, signature, secret);
  } catch {
    return new Response('Firma non valida', { status: 400 });
  }

  const outcome = await processStripeEvent(event);
  if (outcome === 'failed') {
    return new Response('Da ripetere', { status: 500 });
  }
  return Response.json({ received: true, outcome });
}
