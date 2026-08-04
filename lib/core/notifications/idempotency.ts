/**
 * Deterministic idempotency keys for outbound notification emails.
 *
 * The rule that matters: the key identifies the CONCRETE EVENT, never a time
 * window. "One email of this type per day" would silently swallow the second
 * chat message and the second appointment of the day — both of which are real,
 * distinct events that deserve their own email.
 *
 * Shape:
 *   v1:{eventKey}:{channel}:{recipientUserId}:{scope}
 *
 * `scope` identifies the thing that happened, in order of preference:
 *   1. `n{notificationId}` — the in-app notification this email mirrors. Every
 *      domain event creates its own row, so distinct events always differ.
 *   2. an explicit scope for events with no in-app twin or that fire on a
 *      schedule: `b{bookingId}`, `inv{invitationId}`, `rep{reportId}`.
 *
 * A retry of the same event rebuilds the same key, the insert into
 * `notification_email_deliveries` conflicts, and no second email goes out.
 */

export const IDEMPOTENCY_VERSION = 'v1';

export type EmailIdempotencyInput = {
  eventKey: string;
  /** Null for recipients that are not users yet (e.g. an invited coach). */
  recipientUserId: number | null;
  /** Set when the email mirrors an in-app notification. Preferred scope. */
  notificationId?: number | null;
  /**
   * Fallback scope for events without an in-app notification, or that repeat on
   * a schedule for the same subject (the two booking reminders each carry their
   * own eventKey, so `b{id}` stays unambiguous).
   */
  scope?: string | null;
  /** Disambiguates recipients with no user id (invitations by email). */
  recipientEmail?: string | null;
};

export function buildEmailIdempotencyKey(input: EmailIdempotencyInput): string {
  const recipient =
    input.recipientUserId != null
      ? `u${input.recipientUserId}`
      : `e${normaliseEmail(input.recipientEmail)}`;

  const scope =
    input.notificationId != null
      ? `n${input.notificationId}`
      : (input.scope ?? '').trim();

  if (!scope) {
    throw new Error(
      `Cannot build an idempotency key for "${input.eventKey}": no notification id and no explicit scope. ` +
        'Refusing to fall back to a time window, which would drop legitimate emails.'
    );
  }

  return [
    IDEMPOTENCY_VERSION,
    input.eventKey,
    'email',
    recipient,
    scope,
  ].join(':');
}

function normaliseEmail(email: string | null | undefined): string {
  if (!email) {
    throw new Error(
      'Cannot build an idempotency key: neither a recipient user id nor an email was provided.'
    );
  }
  return email.trim().toLowerCase();
}

/** Scope helpers, so call sites never hand-roll the prefixes. */
export const scopeForBooking = (bookingId: number) => `b${bookingId}`;
export const scopeForInvitation = (invitationId: number | string) =>
  `inv${invitationId}`;
export const scopeForReport = (reportId: number) => `rep${reportId}`;
