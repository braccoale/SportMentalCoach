import 'server-only';
import { timingSafeEqual } from 'node:crypto';
import { sendAllDueReminders } from '@/lib/core/notifications/reminders';
import { sendRenewalReminders } from '@/lib/core/billing/renewal-reminders';
import { syncCoachAccountsDue } from '@/lib/core/billing/account-sync';
import { cleanupUsageData } from '@/lib/core/usage/server';

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
    // Il promemoria di rinnovo dell'abbonamento passa dallo stesso cron: un
    // guasto qui non deve fermare i promemoria degli appuntamenti, né il
    // contrario.
    const renewals = await sendRenewalReminders().catch((error) => {
      console.error('[reminders] promemoria di rinnovo non riusciti:', error);
      return null;
    });
    // Lo stato di verifica dei coach su Stripe passa dallo stesso cron, con la
    // stessa regola: un guasto qui non ferma il resto.
    const accounts = await syncCoachAccountsDue().catch((error) => {
      console.error('[reminders] allineamento account coach non riuscito:', error);
      return null;
    });
    // La pulizia dei dati d'uso passa dallo stesso cron, una volta al giorno
    // (alle 3 UTC), con la stessa regola: un guasto qui non ferma il resto.
    const usageCleanup =
      new Date().getUTCHours() === 3
        ? await cleanupUsageData().catch((error) => {
            console.error('[reminders] pulizia dei dati d’uso non riuscita:', error);
            return null;
          })
        : null;
    return Response.json({ ok: true, results, renewals, accounts, usageCleanup });
  } catch (error) {
    console.error('[reminders] run failed:', error);
    return Response.json(
      { ok: false, error: 'reminder_run_failed' },
      { status: 500 }
    );
  }
}

export const POST = GET;
