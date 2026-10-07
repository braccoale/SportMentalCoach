import 'server-only';
import { and, eq, gt, lte } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { planSubscriptions } from '@/lib/db/schema';
import { notifySubscriptionEvent } from './billing-events-notify';
import {
  RENEWAL_REMINDER_DAYS,
  isRenewalReminderDue,
} from './billing-events-content';

/**
 * Il promemoria prima del rinnovo, per l'atleta. Lo lancia il cron orario dei
 * promemoria: ogni corsa guarda gli abbonamenti vivi il cui periodo finisce nei
 * prossimi `RENEWAL_REMINDER_DAYS` giorni e che si rinnoveranno davvero.
 *
 * La finestra è larga apposta: selezionare di più è innocuo (il registro delle
 * consegne rifiuta il secondo invio per la stessa chiave: abbonamento e fine
 * periodo), selezionare di meno perderebbe un promemoria in silenzio. La chiave
 * porta la fine del periodo, quindi il ciclo successivo ne ha uno nuovo.
 */
export type RenewalReminderRunResult = { considered: number; due: number };

export async function sendRenewalReminders(
  now: Date = new Date()
): Promise<RenewalReminderRunResult> {
  const horizon = new Date(
    now.getTime() + RENEWAL_REMINDER_DAYS * 24 * 60 * 60 * 1000
  );
  const rows = await db
    .select({
      id: planSubscriptions.id,
      status: planSubscriptions.status,
      cancelAtPeriodEnd: planSubscriptions.cancelAtPeriodEnd,
      currentPeriodEnd: planSubscriptions.currentPeriodEnd,
    })
    .from(planSubscriptions)
    .where(
      and(
        eq(planSubscriptions.status, 'active'),
        eq(planSubscriptions.cancelAtPeriodEnd, false),
        gt(planSubscriptions.currentPeriodEnd, now),
        lte(planSubscriptions.currentPeriodEnd, horizon)
      )
    );

  let due = 0;
  for (const row of rows) {
    if (!isRenewalReminderDue({ ...row, now }) || !row.currentPeriodEnd) continue;
    due += 1;
    await notifySubscriptionEvent({
      event: 'renewal_reminder',
      subscriptionId: row.id,
      scope: `sub${row.id}-p${row.currentPeriodEnd.getTime()}`,
      roles: ['athlete'],
    });
  }
  return { considered: rows.length, due };
}
