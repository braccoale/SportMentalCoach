import 'server-only';
import { sendEventEmail } from '@/lib/core/email';
import { isEmailEnabled } from '@/lib/core/flags';
import { notify } from './index';
import { buildEmailIdempotencyKey, scopeForInvitation } from './idempotency';

/**
 * Typed entry points for the three events whose triggering flows are not wired
 * yet (report sharing, platform-sent invitations, auth security alerts).
 *
 * They exist so those flows land as a one-line call with the channels, the
 * preferences, the template and the deduplication already correct — rather than
 * each growing its own ad-hoc email.
 */

/** The athlete's session report has been shared with them. */
export async function notifyAiReportReady(input: {
  athleteUserId: number;
  bookingId: number;
  coachName?: string | null;
  sessionDate?: string;
}): Promise<void> {
  await notify('ai_report_ready', input.athleteUserId, {
    bookingId: input.bookingId,
    coachName: input.coachName,
    sessionDate: input.sessionDate,
  });
}

/**
 * Something security-relevant happened on the account (new device, password or
 * email change). Mandatory: the user cannot opt out, so this never consults the
 * preference table.
 */
export async function notifySecurityAlert(input: {
  userId: number;
  /** Plain Italian, shown verbatim to the user. */
  event: string;
  occurredAt?: Date;
  /** Distinguishes two alerts of the same kind for the same user. */
  scope: string;
}): Promise<void> {
  const occurredAt = input.occurredAt ?? new Date();
  await notify('security_alert', input.userId, {
    securityEvent: input.event,
    securityOccurredAt: new Intl.DateTimeFormat('it-IT', {
      dateStyle: 'long',
      timeStyle: 'short',
      timeZone: 'Europe/Rome',
    }).format(occurredAt),
    idempotencyScope: input.scope,
  });
}

/**
 * Platform-sent invitation. Email only: the recipient has no account yet, so
 * there is no in-app notification and the idempotency key is anchored to the
 * invitation itself plus the address.
 *
 * Mandatory — it carries the link the invitation is made of.
 */
export async function sendCoachInvitationEmail(input: {
  to: string;
  inviterName: string;
  invitationId: number | string;
  /** Absolute or app-relative invite URL. */
  inviteUrl: string;
  /** Set when the invited person already has an account. */
  recipientUserId?: number | null;
}): Promise<'sent' | 'duplicate' | 'skipped' | 'failed' | 'render_error'> {
  if (!isEmailEnabled()) return 'skipped';

  return sendEventEmail({
    eventKey: 'coach_invitation',
    to: input.to,
    recipientUserId: input.recipientUserId ?? null,
    idempotencyKey: buildEmailIdempotencyKey({
      eventKey: 'coach_invitation',
      recipientUserId: input.recipientUserId ?? null,
      recipientEmail: input.to,
      scope: scopeForInvitation(input.invitationId),
    }),
    context: {
      recipient: {
        firstName: input.to.split('@')[0],
        fullName: input.to.split('@')[0],
      },
      inviter: { name: input.inviterName },
    },
    actionUrl: input.inviteUrl,
  });
}
