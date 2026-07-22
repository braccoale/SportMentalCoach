import 'server-only';
import webpush from 'web-push';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { pushSubscriptions } from '@/lib/db/schema';

/** Web Push is active only when the VAPID env vars are present. */
export function isPushConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY &&
      process.env.VAPID_PRIVATE_KEY
  );
}

let configured = false;
function ensureVapid() {
  if (configured || !isPushConfigured()) return;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:info@kaipai.com',
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  );
  configured = true;
}

export type PushSubscriptionInput = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

/** Stores (or refreshes) a browser's push subscription for a user. */
export async function saveSubscription(
  userId: number,
  sub: PushSubscriptionInput
): Promise<void> {
  await db
    .insert(pushSubscriptions)
    .values({
      userId,
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
      createdBy: userId,
    })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: {
        userId,
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
        updatedAt: new Date(),
        updatedBy: userId,
      },
    });
}

/**
 * Removes a subscription by endpoint. Internal use only — the endpoint alone
 * identifies the row, so this must never be driven directly by request input.
 * Used when the push service reports a subscription as gone.
 */
async function removeSubscription(endpoint: string): Promise<void> {
  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
}

/**
 * Removes one of *this user's* subscriptions (unsubscribe from the UI). Scoped
 * to the owner so a signed-in user can't disable push on someone else's device
 * by posting their endpoint.
 */
export async function removeUserSubscription(
  userId: number,
  endpoint: string
): Promise<void> {
  await db
    .delete(pushSubscriptions)
    .where(
      and(
        eq(pushSubscriptions.userId, userId),
        eq(pushSubscriptions.endpoint, endpoint)
      )
    );
}

export type PushPayload = {
  title: string;
  body?: string;
  url?: string;
  tag?: string;
};

/**
 * Sends a Web Push to all of a user's subscribed devices. Best-effort: prunes
 * subscriptions the push service reports as gone (404/410). Never throws.
 */
export async function sendPushToUser(
  userId: number,
  payload: PushPayload
): Promise<void> {
  if (!isPushConfigured()) return;
  ensureVapid();

  const subs = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId));
  if (subs.length === 0) return;

  const body = JSON.stringify(payload);
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body
        );
      } catch (err: unknown) {
        const code = (err as { statusCode?: number })?.statusCode;
        if (code === 404 || code === 410) {
          // Subscription no longer valid — drop it.
          await removeSubscription(s.endpoint).catch(() => {});
        } else {
          console.error('[push] send failed:', code, err);
        }
      }
    })
  );
}
