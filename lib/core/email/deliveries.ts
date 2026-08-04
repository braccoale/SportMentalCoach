import 'server-only';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { notificationEmailDeliveries } from '@/lib/db/schema';

/**
 * The delivery ledger: it is both the audit log of what KaiPai sent and the
 * lock that prevents sending it twice.
 *
 * The send path is always:
 *
 *   claimDelivery()  -> null  => someone already handled this event, stop
 *                    -> id    => this process owns the send
 *   ... send ...
 *   markDeliverySent() | markDeliveryFailed() | markDeliverySkipped()
 *
 * The claim is a single `INSERT ... ON CONFLICT DO NOTHING`: the unique index
 * on `idempotency_key` does the arbitration in the database, so two concurrent
 * workers (a request and a cron, or two cron runs) cannot both win.
 */

export type DeliveryClaim = {
  id: string;
  idempotencyKey: string;
};

export type ClaimDeliveryInput = {
  idempotencyKey: string;
  recipientEmail: string;
  recipientUserId: number | null;
  notificationId?: number | null;
  templateKey: string;
  templateVersion?: number | null;
};

/**
 * Reserves the right to send one email.
 *
 * Returns null when a row already exists for this key — the event was already
 * sent, is being sent, or was deliberately skipped. Never retried here on
 * purpose: a failed delivery keeps its row so the failure stays visible, and a
 * retry policy can be added later without changing the dedup contract.
 */
export async function claimDelivery(
  input: ClaimDeliveryInput
): Promise<DeliveryClaim | null> {
  const [row] = await db
    .insert(notificationEmailDeliveries)
    .values({
      idempotencyKey: input.idempotencyKey,
      recipientEmail: input.recipientEmail,
      recipientUserId: input.recipientUserId,
      notificationId: input.notificationId ?? null,
      templateKey: input.templateKey,
      templateVersion: input.templateVersion ?? null,
      status: 'queued',
      attemptCount: 1,
    })
    .onConflictDoNothing({
      target: notificationEmailDeliveries.idempotencyKey,
    })
    .returning({ id: notificationEmailDeliveries.id });

  if (!row) return null;
  return { id: row.id, idempotencyKey: input.idempotencyKey };
}

export async function markDeliverySent(
  deliveryId: string,
  providerMessageId: string | null
): Promise<void> {
  await db
    .update(notificationEmailDeliveries)
    .set({
      status: 'sent',
      providerMessageId,
      sentAt: new Date(),
      lastError: null,
      updatedAt: new Date(),
    })
    .where(eq(notificationEmailDeliveries.id, deliveryId));
}

export async function markDeliveryFailed(
  deliveryId: string,
  error: string
): Promise<void> {
  await db
    .update(notificationEmailDeliveries)
    .set({
      status: 'failed',
      // Bounded: provider errors and stack traces can be long, and this column
      // is read by humans debugging, not by machines.
      lastError: error.slice(0, 1000),
      updatedAt: new Date(),
    })
    .where(eq(notificationEmailDeliveries.id, deliveryId));
}

/**
 * The email was deliberately not sent (preference off, no address, email
 * globally disabled). Recorded rather than dropped so "why didn't I get it?"
 * has an answer, and so the key stays claimed and nothing retries later.
 */
export async function markDeliverySkipped(
  deliveryId: string,
  reason: string
): Promise<void> {
  await db
    .update(notificationEmailDeliveries)
    .set({
      status: 'skipped',
      lastError: reason.slice(0, 1000),
      updatedAt: new Date(),
    })
    .where(eq(notificationEmailDeliveries.id, deliveryId));
}

/** True when this exact event has already produced a sent email. */
export async function hasBeenSent(idempotencyKey: string): Promise<boolean> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notificationEmailDeliveries)
    .where(
      and(
        eq(notificationEmailDeliveries.idempotencyKey, idempotencyKey),
        eq(notificationEmailDeliveries.status, 'sent')
      )
    );
  return (row?.count ?? 0) > 0;
}
