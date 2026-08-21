import 'server-only';
import { sendEventEmail } from '@/lib/core/email';
import { isEmailEnabled } from '@/lib/core/flags';
import { notify } from './index';
import { buildEmailIdempotencyKey, scopeForInvitation } from './idempotency';

/**
 * Typed entry points for notification flows that need a stable, explicit
 * payload. The report event is wired to the coach approval; invitations and
 * auth security alerts remain available to their respective entry points.
 *
 * They exist so those flows land as a one-line call with the channels, the
 * preferences, the template and the deduplication already correct — rather than
 * each growing its own ad-hoc email.
 */

/**
 * Il riepilogo di una seduta è pronto e aspetta l'approvazione del coach.
 *
 * Va al **coach**, non all'atleta: `notifyAiReportReady` è l'altra metà, e
 * parte solo dopo, quando il coach condivide. Fra le due c'è il passaggio che
 * finora non avvisava nessuno.
 *
 * Nessuno scope esplicito: l'evento ha un gemello in-app, e ogni riepilogo
 * generato crea la propria riga — quindi una rigenerazione avvisa di nuovo,
 * che è corretto, mentre un ritentativo dello stesso lavoro no, perché la
 * transizione a `ready_for_review` avviene una volta sola per job completato.
 */
export async function notifyAiReportAwaitingReview(input: {
  coachUserId: number;
  bookingId: number;
  athleteName?: string | null;
  serviceTitle?: string | null;
}): Promise<void> {
  await notify('ai_report_awaiting_review', input.coachUserId, {
    bookingId: input.bookingId,
    athleteName: input.athleteName,
    serviceTitle: input.serviceTitle,
  });
}

/** Il report approvato dal coach è ora visibile all’atleta. */
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
