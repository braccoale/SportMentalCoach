import 'server-only';
import { getVerticalConfig, t } from '@/lib/core/config';
import { getAppBaseUrl } from '@/lib/core/app-url';
import {
  NOTIFICATION_EVENTS,
  type NotificationEventKey,
} from '@/lib/core/notifications/catalog';
import {
  claimDelivery,
  markDeliveryFailed,
  markDeliverySent,
  markDeliverySkipped,
} from './deliveries';
import { BRAND, wrapEmailHtml, wrapEmailText } from './layout';
import type { DetailsCard } from './details-card';
import {
  renderTemplate,
  splitParagraphs,
  TemplateVariableError,
  escapeHtml,
  type TemplateContext,
} from './render';
import { DEFAULT_LOCALE, resolveTemplate } from './templates';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

export { escapeHtml };

// --- Sender configuration ---------------------------------------------------

/**
 * Sender identity. The dedicated `EMAIL_*` variables are authoritative;
 * `RESEND_FROM_EMAIL` stays supported as a fallback so existing deployments
 * keep working unchanged.
 *
 * Deliberately not `noreply@`: replies to KaiPai should reach a human. A
 * future `notifications@kaipaicoaching.com` only needs the env var changed.
 */
export function getEmailSender(): {
  from: string;
  replyTo: string | null;
  provider: string;
} | null {
  const address =
    process.env.EMAIL_FROM_ADDRESS?.trim() ||
    process.env.RESEND_FROM_EMAIL?.trim();
  if (!address) return null;

  const name = process.env.EMAIL_FROM_NAME?.trim() || BRAND.name;
  // Already formatted as `Name <address>`? Leave it alone.
  const from = address.includes('<') ? address : `${name} <${address}>`;

  return {
    from,
    replyTo: process.env.EMAIL_REPLY_TO?.trim() || address,
    provider: process.env.EMAIL_PROVIDER?.trim() || 'resend',
  };
}

// --- Transport --------------------------------------------------------------

export type SendResult =
  | { ok: true; messageId: string | null }
  | { ok: false; skipped: true; reason: string }
  | { ok: false; skipped: false; error: string };

/**
 * Low-level transport. Never throws: it reports what happened so the caller can
 * record it in the delivery ledger. Uses the Resend REST API via fetch, so
 * nothing about Resend is required at startup.
 */
async function sendEmail(input: {
  to: string;
  subject: string;
  html: string;
  text: string;
  /**
   * Sovrascrive il reply-to del mittente. Serve al form contatti: chi riceve
   * la segnalazione deve poter premere "Rispondi" e scrivere alla persona,
   * non alla casella di sistema.
   */
  replyTo?: string | null;
}): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const sender = getEmailSender();

  if (!apiKey || !sender) {
    console.log(`[email] skipped (not configured): "${input.subject}"`);
    return { ok: false, skipped: true, reason: 'provider_not_configured' };
  }

  if (sender.provider !== 'resend') {
    console.error(`[email] unsupported EMAIL_PROVIDER "${sender.provider}"`);
    return {
      ok: false,
      skipped: true,
      reason: `unsupported_provider:${sender.provider}`,
    };
  }

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: sender.from,
        to: input.to,
        ...(() => {
          const replyTo = input.replyTo?.trim() || sender.replyTo;
          return replyTo ? { reply_to: replyTo } : {};
        })(),
        subject: input.subject,
        html: input.html,
        text: input.text,
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      const error = `${res.status}: ${detail.slice(0, 500)}`;
      console.error(`[email] failed to ${input.to} (${error})`);
      return { ok: false, skipped: false, error };
    }

    const payload = (await res.json().catch(() => null)) as {
      id?: string;
    } | null;
    console.log(`[email] sent to ${input.to}: "${input.subject}"`);
    return { ok: true, messageId: payload?.id ?? null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[email] failed to ${input.to}:`, error);
    return { ok: false, skipped: false, error: message };
  }
}

// --- Shared URLs used by the layout ----------------------------------------

function footerUrls(): { preferencesUrl: string | null; privacyUrl: string | null; baseUrl: string | null } {
  const baseUrl = getAppBaseUrl();
  return {
    baseUrl,
    preferencesUrl: baseUrl
      ? `${baseUrl}/dashboard/notifications/preferences`
      : null,
    privacyUrl: baseUrl ? `${baseUrl}/privacy` : null,
  };
}

function absoluteUrl(link: string | null | undefined): string | null {
  if (!link) return null;
  if (/^https?:\/\//i.test(link)) return link;
  const baseUrl = getAppBaseUrl();
  return baseUrl ? `${baseUrl}${link.startsWith('/') ? link : `/${link}`}` : null;
}

// --- Templated, idempotent event email --------------------------------------

export type EventEmailOutcome =
  | 'sent'
  | 'duplicate'
  | 'skipped'
  | 'failed'
  | 'render_error';

export type SendEventEmailInput = {
  eventKey: NotificationEventKey;
  to: string;
  recipientUserId: number | null;
  /** Set when this email mirrors an in-app notification. */
  notificationId?: number | null;
  /** Deterministic; see lib/core/notifications/idempotency.ts. */
  idempotencyKey: string;
  /** Values for the template's whitelisted placeholders. */
  context: TemplateContext;
  /** Where the call-to-action button points. Relative paths are resolved. */
  actionUrl?: string | null;
  /** Azione secondaria gia' pronta, es. "Aggiungi a Google Calendar". */
  secondaryAction?: { label: string; url: string } | null;
  /**
   * Structured details. Built in code from the event's data, so rows without a
   * value disappear instead of blocking the send (see `details-card.ts`).
   */
  card?: DetailsCard | null;
  locale?: string;
};

/**
 * Wraps prose paragraphs in the layout's styled tags. The database stores text;
 * the markup lives here, so a restyling never has to migrate stored content.
 */
function paragraphsToHtml(body: string, spacing = '0 0 14px'): string {
  return splitParagraphs(body)
    .map((p) => `<p style="margin:${spacing}">${p}</p>`)
    .join('\n');
}

/**
 * Sends one catalogued event email, exactly once.
 *
 * Guarantees:
 *   * idempotent — the delivery ledger arbitrates before anything is sent;
 *   * both parts — HTML and plain text always ship together;
 *   * fail closed — an unknown or missing placeholder aborts the send and is
 *     recorded, rather than delivering copy with holes in it;
 *   * never throws — notification email is best-effort and must not break the
 *     domain action that triggered it.
 */
export async function sendEventEmail(
  input: SendEventEmailInput
): Promise<EventEmailOutcome> {
  const event = NOTIFICATION_EVENTS[input.eventKey];
  const locale = input.locale ?? DEFAULT_LOCALE;
  const template = await resolveTemplate(input.eventKey, locale);

  const claim = await claimDelivery({
    idempotencyKey: input.idempotencyKey,
    recipientEmail: input.to,
    recipientUserId: input.recipientUserId,
    notificationId: input.notificationId ?? null,
    templateKey: template.key,
    templateVersion: template.version,
  });

  // Someone already owns this event: sent, in flight, or deliberately skipped.
  if (!claim) return 'duplicate';

  const actionUrl = absoluteUrl(input.actionUrl);
  const { preferencesUrl, privacyUrl, baseUrl } = footerUrls();

  // `actionUrl` is a whitelisted placeholder in its own right, so copy can
  // inline the link as well as use the button.
  const context: TemplateContext = {
    ...input.context,
    ...(actionUrl ? { actionUrl } : {}),
  };

  let subject: string;
  let eyebrow: string | null;
  let title: string;
  let bodyHtml: string;
  let bodyText: string;
  let outroHtml: string | null;
  let outroText: string | null;

  try {
    const text = (source: string) =>
      renderTemplate(source, context, event.variables, 'text');
    const html = (source: string) =>
      renderTemplate(source, context, event.variables, 'html');

    subject = text(template.subject);
    eyebrow = template.eyebrow ? text(template.eyebrow) : null;
    // v1 templates have no dedicated title: the subject doubles as one.
    title = template.title ? text(template.title) : subject;
    bodyHtml = paragraphsToHtml(html(template.htmlBody));
    bodyText = template.textBody ? text(template.textBody) : text(template.htmlBody);
    outroHtml = template.outro
      ? paragraphsToHtml(html(template.outro), '0 0 8px')
      : null;
    outroText = template.outro ? text(template.outro) : null;
  } catch (error) {
    const detail =
      error instanceof TemplateVariableError
        ? `${error.reason}: ${error.variable} (${error.message})`
        : error instanceof Error
          ? error.message
          : String(error);
    console.error(
      `[email] template render failed for "${template.key}" (${template.source} v${template.version ?? '-'}):`,
      detail
    );
    await markDeliveryFailed(claim.id, `render_error ${detail}`);
    return 'render_error';
  }

  const action =
    actionUrl && template.actionLabel
      ? { label: template.actionLabel, url: actionUrl }
      : null;

  const result = await sendEmail({
    to: input.to,
    subject,
    html: wrapEmailHtml({
      preview: splitParagraphs(bodyText)[0] ?? null,
      eyebrow,
      title,
      bodyHtml,
      card: input.card ?? null,
      outroHtml,
      action,
      secondaryAction: input.secondaryAction ?? null,
      preferencesUrl,
      privacyUrl,
      baseUrl,
    }),
    text: wrapEmailText({
      eyebrow,
      title,
      bodyText,
      card: input.card ?? null,
      outroText,
      action,
      secondaryAction: input.secondaryAction ?? null,
      preferencesUrl,
    }),
  });

  if (result.ok) {
    await markDeliverySent(claim.id, result.messageId);
    return 'sent';
  }
  if (result.skipped) {
    await markDeliverySkipped(claim.id, result.reason);
    return 'skipped';
  }
  await markDeliveryFailed(claim.id, result.error);
  return 'failed';
}

// --- Legacy helpers (kept for backwards compatibility) ----------------------

/**
 * Generic notification email built from a pre-rendered title/body. Retained for
 * call sites outside the event catalogue (e.g. guardian authorisation) and as
 * the last-resort path. Not idempotent by itself — callers that need
 * deduplication use `sendEventEmail`.
 */
export async function sendNotificationEmail(input: {
  to: string;
  title: string;
  body?: string | null;
  link?: string | null;
  actionLabel?: string | null;
}): Promise<SendResult> {
  const url = absoluteUrl(input.link);
  const { preferencesUrl, privacyUrl, baseUrl } = footerUrls();

  const bodyHtml = input.body
    ? splitParagraphs(input.body)
        .map(
          (paragraph) =>
            `<p style="margin:0 0 14px">${escapeHtml(paragraph).replaceAll('\n', '<br>')}</p>`
        )
        .join('\n')
    : '';
  const action = url
    ? { label: input.actionLabel?.trim() || `Apri ${BRAND.name}`, url }
    : null;

  return sendEmail({
    to: input.to,
    subject: input.title,
    html: wrapEmailHtml({
      preview: input.body ?? null,
      title: input.title,
      bodyHtml,
      action,
      preferencesUrl,
      privacyUrl,
      baseUrl,
    }),
    text: wrapEmailText({
      title: input.title,
      bodyText: input.body ?? '',
      action,
      preferencesUrl,
    }),
  });
}

/**
 * Welcome email after signup. Transactional: sent regardless of notification
 * preferences, because it is not a notification mirror.
 */
export async function sendWelcomeEmail(input: {
  to: string;
  name?: string | null;
  role?: 'athlete' | 'coach' | 'club' | null;
}): Promise<void> {
  const brand = t('brand.name', getVerticalConfig());
  const { preferencesUrl, privacyUrl, baseUrl } = footerUrls();
  const dashboardUrl = absoluteUrl('/dashboard');
  const name = input.name?.trim() || null;
  const greeting = name ? `Ciao ${name},` : 'Ciao,';
  const isCoach = input.role === 'coach';

  const paragraphs = [
    greeting,
    isCoach
      ? 'il tuo spazio coach su KaiPai è pronto. Completa il profilo, racconta il tuo approccio e invialo alla revisione: quando sarà approvato potrai incontrare atleti, organizzare le sessioni e far crescere il tuo lavoro.'
      : 'il tuo spazio KaiPai è pronto. Da qui puoi conoscere i coach, scegliere il percorso più adatto a te e allenare la mente con la stessa cura che dedichi al tuo sport.',
    isCoach
      ? 'Il tuo modo di fare coaching merita uno spazio chiaro e professionale.'
      : 'Ogni piccolo passo conta: quando vuoi, puoi iniziare dalla tua area.',
  ];

  const action = dashboardUrl
    ? { label: isCoach ? 'Vai alla tua area coach' : 'Scopri la tua area', url: dashboardUrl }
    : null;

  await sendEmail({
    to: input.to,
    subject: isCoach && name ? `Benvenuto tra i coach KaiPai, ${name}` : `Benvenuto su ${brand}${name ? `, ${name}` : ''}`,
    html: wrapEmailHtml({
      preview: 'Il tuo account è pronto.',
      eyebrow: 'Benvenuto',
      title: `Benvenuto su ${escapeHtml(brand)}`,
      bodyHtml: paragraphs
        .map((p) => `<p style="margin:0 0 14px">${escapeHtml(p)}</p>`)
        .join('\n'),
      action,
      preferencesUrl,
      privacyUrl,
      baseUrl,
    }),
    text: wrapEmailText({
      eyebrow: 'Benvenuto',
      title: `Benvenuto su ${brand}`,
      bodyText: paragraphs.join('\n\n'),
      action,
      preferencesUrl,
    }),
  });
}

/**
 * Casella di riferimento KaiPai: e' l'indirizzo pubblicato sul sito, quindi e'
 * anche il posto dove devono arrivare i messaggi del form contatti.
 */
export const CONTACT_INBOX_FALLBACK = 'info@kaipaicoaching.com';

/**
 * Indirizzo interno a cui arrivano i messaggi del form contatti.
 *
 * `CONTACT_INBOX_EMAIL` permette di dirottarli (per esempio su una casella di
 * staging) senza toccare il codice; in mancanza si usa la casella ufficiale.
 * Deliberatamente NON si ripiega sul reply-to del mittente di sistema: quello
 * serve alle notifiche di prodotto e potrebbe puntare altrove.
 */
export function getContactInbox(): string {
  return process.env.CONTACT_INBOX_EMAIL?.trim() || CONTACT_INBOX_FALLBACK;
}

/**
 * Notifica interna per un messaggio arrivato dal form contatti.
 *
 * Il reply-to punta a chi ha scritto: chi legge in casella preme "Rispondi" e
 * la conversazione parte, senza copiare indirizzi a mano. Non e' un'email di
 * notifica di prodotto, quindi non passa dalle preferenze utente: chi scrive
 * non ha nemmeno un account.
 */
export async function sendContactMessageEmail(input: {
  name: string;
  email: string;
  subject: string;
  message: string;
}): Promise<SendResult> {
  const to = getContactInbox();
  const { privacyUrl, baseUrl } = footerUrls();
  const title = `Nuovo messaggio: ${input.subject}`;
  const lines = [
    `Da: ${input.name} <${input.email}>`,
    `Oggetto: ${input.subject}`,
    '',
    input.message,
  ];

  const bodyHtml = [
    `<p style="margin:0 0 14px"><strong>${escapeHtml(input.name)}</strong> &lt;${escapeHtml(input.email)}&gt;</p>`,
    ...splitParagraphs(input.message).map(
      (paragraph) =>
        `<p style="margin:0 0 14px">${escapeHtml(paragraph).replaceAll('\n', '<br>')}</p>`
    ),
  ].join('\n');

  return sendEmail({
    to,
    replyTo: input.email,
    subject: title,
    html: wrapEmailHtml({
      preview: `${input.name}: ${input.subject}`,
      eyebrow: 'Form contatti',
      title: escapeHtml(title),
      bodyHtml,
      action: null,
      // Nessun link alle preferenze: non e' una notifica di prodotto.
      preferencesUrl: null,
      privacyUrl,
      baseUrl,
    }),
    text: wrapEmailText({
      eyebrow: 'Form contatti',
      title,
      bodyText: lines.join('\n'),
      action: null,
      preferencesUrl: null,
    }),
  });
}

/**
 * Il rapporto d'esito di una seduta, alla casella di servizio.
 *
 * Non e' posta di prodotto: nessun link alle preferenze, nessun invito
 * all'azione, nessuna traduzione. E' un log incolonnato dentro `<pre>`,
 * perche' chi lo apre lo legge come leggerebbe un terminale — e spesso lo
 * incolla da qualche parte.
 *
 * Il contenuto arriva gia' costruito da `session-outcome-report.ts`, che e'
 * anche il posto in cui e' scritta la regola su cosa non deve mai entrarci:
 * niente frasi della seduta, niente nome dell'atleta.
 */
export async function sendSessionOutcomeEmail(input: {
  to: string;
  subject: string;
  report: string;
}): Promise<SendResult> {
  const { privacyUrl, baseUrl } = footerUrls();
  return sendEmail({
    to: input.to,
    subject: input.subject,
    html: wrapEmailHtml({
      preview: input.subject,
      eyebrow: 'Appunti AI · esito seduta',
      title: escapeHtml(input.subject),
      bodyHtml: `<pre style="margin:0;padding:14px;background:#0f0f14;color:#e6e6ea;border-radius:8px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;line-height:1.55;white-space:pre-wrap;word-break:break-word">${escapeHtml(input.report)}</pre>`,
      action: null,
      preferencesUrl: null,
      privacyUrl,
      baseUrl,
    }),
    text: wrapEmailText({
      eyebrow: 'Appunti AI · esito seduta',
      title: input.subject,
      bodyText: input.report,
      action: null,
      preferencesUrl: null,
    }),
  });
}
