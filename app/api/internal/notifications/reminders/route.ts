import 'server-only';
import { timingSafeEqual } from 'node:crypto';
import { sendAllDueReminders } from '@/lib/core/notifications/reminders';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Invio dei promemoria appuntamento (24 ore e 1 ora prima).
 *
 * Invocata dal cron Vercel. Protetta da `CRON_SECRET` con lo stesso schema
 * della rotta AI Notes: senza segreto la rotta risponde 404, così dall'esterno
 * non è distinguibile da un percorso inesistente.
 *
 * L'esecuzione è idempotente: il ledger `notification_email_deliveries` rifiuta
 * un secondo invio per la stessa coppia (appuntamento, finestra), quindi una
 * corsa ripetuta o sovrapposta non produce email doppie.
 */
function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const header = request.headers.get('authorization') ?? '';
  const provided = header.startsWith('Bearer ') ? header.slice(7) : '';
  const expected = Buffer.from(secret);
  const actual = Buffer.from(provided);
  // Lunghezze diverse fanno fallire timingSafeEqual: confronta prima quelle.
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return new Response('Not found', { status: 404 });
  }

  try {
    const results = await sendAllDueReminders();
    return Response.json({ ok: true, results });
  } catch (error) {
    console.error('[reminders] run failed:', error);
    return Response.json(
      { ok: false, error: 'reminder_run_failed' },
      { status: 500 }
    );
  }
}

export const POST = GET;
