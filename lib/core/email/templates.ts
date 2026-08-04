import 'server-only';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { emailTemplates } from '@/lib/db/schema';
import {
  DEFAULT_EMAIL_TEMPLATES,
  type DefaultEmailTemplate,
} from './default-templates';
import type { NotificationEventKey } from '@/lib/core/notifications/catalog';

export const DEFAULT_LOCALE = 'it-IT';

export type ResolvedTemplate = {
  key: string;
  locale: string;
  subject: string;
  /** Sopratitolo. Null sui template v1, che non avevano la colonna. */
  eyebrow: string | null;
  /** Titolo. Null sui v1: in quel caso vale l'oggetto. */
  title: string | null;
  /** Chiusura dopo la CTA. */
  outro: string | null;
  htmlBody: string;
  /** Null means "derive the text part from the HTML at render time". */
  textBody: string | null;
  /** Null when the copy came from the code fallback rather than the database. */
  version: number | null;
  source: 'database' | 'code';
  actionLabel: string | null;
};

/**
 * Small in-process cache. Templates change rarely (an admin edit, a new
 * version) but are read on every notification, and serverless instances are
 * short-lived, so a short TTL is enough to avoid a query per email without
 * making edits feel stuck.
 */
const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { at: number; value: ResolvedTemplate }>();

/** Drops the cache — called by the seed script and after an admin edit. */
export function invalidateTemplateCache(): void {
  cache.clear();
}

/**
 * Resolves the copy for an event.
 *
 * Order: the active database version for `(key, locale)` → the active version
 * for the default locale → the code default. The last step is what keeps this
 * backwards compatible: with an empty `email_templates` table every email still
 * goes out, with exactly the copy shipped in the repository.
 */
export async function resolveTemplate(
  eventKey: NotificationEventKey,
  locale: string = DEFAULT_LOCALE
): Promise<ResolvedTemplate> {
  const fallback = DEFAULT_EMAIL_TEMPLATES[eventKey];
  const templateKey = fallback.key;
  const cacheKey = `${templateKey}:${locale}`;

  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.value;
  }

  const resolved =
    (await loadActive(templateKey, locale, fallback)) ??
    (locale !== DEFAULT_LOCALE
      ? await loadActive(templateKey, DEFAULT_LOCALE, fallback)
      : null) ??
    toCodeTemplate(fallback, locale);

  cache.set(cacheKey, { at: Date.now(), value: resolved });
  return resolved;
}

async function loadActive(
  templateKey: string,
  locale: string,
  fallback: DefaultEmailTemplate
): Promise<ResolvedTemplate | null> {
  try {
    // A partial unique index guarantees at most one active row per (key, locale).
    const [row] = await db
      .select()
      .from(emailTemplates)
      .where(
        and(
          eq(emailTemplates.key, templateKey),
          eq(emailTemplates.locale, locale),
          eq(emailTemplates.isActive, true)
        )
      )
      .limit(1);

    if (!row) return null;

    return {
      key: row.key,
      locale: row.locale,
      subject: row.subject,
      eyebrow: row.eyebrow,
      title: row.title,
      outro: row.outro,
      htmlBody: row.htmlBody,
      textBody: row.textBody,
      version: row.version,
      source: 'database',
      // The CTA label is presentation, not content: it stays in code so a
      // template row can never point the button somewhere else.
      actionLabel: fallback.actionLabel,
    };
  } catch (error) {
    // A missing table (migration not applied yet) or a transient database
    // error must not stop the email: fall through to the code default.
    console.error(`[email] template lookup failed for "${templateKey}":`, error);
    return null;
  }
}

function toCodeTemplate(
  fallback: DefaultEmailTemplate,
  locale: string
): ResolvedTemplate {
  return {
    key: fallback.key,
    locale,
    subject: fallback.subject,
    eyebrow: fallback.eyebrow,
    title: fallback.title,
    outro: fallback.outro,
    htmlBody: fallback.htmlBody,
    textBody: fallback.textBody,
    version: null,
    source: 'code',
    actionLabel: fallback.actionLabel,
  };
}
