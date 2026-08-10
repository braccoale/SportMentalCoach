import 'server-only';
import { and, eq, gte, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { contactMessages } from '@/lib/db/schema';
import { LEGAL_CONTENT_HASH } from '@/lib/core/legal/content-hash.generated';
import { sendContactMessageEmail } from '@/lib/core/email';

export const CONTACT_LIMITS = {
  name: { min: 2, max: 120 },
  subject: { min: 2, max: 160 },
  message: { min: 10, max: 4000 },
  email: { max: 255 },
} as const;

/** Quanti messaggi accettiamo dallo stesso indirizzo in un'ora. */
const MAX_PER_EMAIL_PER_HOUR = 3;

export type ContactInput = {
  name: string;
  email: string;
  subject: string;
  message: string;
  privacyAccepted: boolean;
  /** Campo esca: i browser veri lo lasciano vuoto, i bot lo riempiono. */
  website?: string;
};

export type ContactResult =
  | { ok: true; emailStatus: 'sent' | 'skipped' | 'failed' }
  | { ok: false; error: string; field?: keyof ContactInput };

/**
 * Validazione minima ma seria: gli stessi limiti valgono nel form e qui, e il
 * server non si fida di quello che arriva. Non usiamo una libreria perche' le
 * regole sono quattro e vivono accanto alla tabella che le rispecchia.
 */
function validate(input: ContactInput): ContactResult | null {
  const name = input.name?.trim() ?? '';
  const email = input.email?.trim() ?? '';
  const subject = input.subject?.trim() ?? '';
  const message = input.message?.trim() ?? '';

  if (name.length < CONTACT_LIMITS.name.min || name.length > CONTACT_LIMITS.name.max) {
    return { ok: false, error: 'Inserisci il tuo nome.', field: 'name' };
  }
  // Volutamente permissiva: la validazione vera di un indirizzo e' scriverci.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > CONTACT_LIMITS.email.max) {
    return { ok: false, error: 'Inserisci un indirizzo email valido.', field: 'email' };
  }
  if (subject.length < CONTACT_LIMITS.subject.min || subject.length > CONTACT_LIMITS.subject.max) {
    return { ok: false, error: 'Inserisci un oggetto.', field: 'subject' };
  }
  if (message.length < CONTACT_LIMITS.message.min) {
    return {
      ok: false,
      error: 'Scrivi qualche riga in più: così possiamo risponderti davvero.',
      field: 'message',
    };
  }
  if (message.length > CONTACT_LIMITS.message.max) {
    return { ok: false, error: 'Il messaggio è troppo lungo.', field: 'message' };
  }
  if (!input.privacyAccepted) {
    return {
      ok: false,
      error: 'Per inviare il messaggio devi accettare l’Informativa Privacy.',
      field: 'privacyAccepted',
    };
  }
  return null;
}

/**
 * Registra un messaggio dal form contatti e avvisa la casella interna.
 *
 * L'ordine conta: prima la riga a database, poi la mail. Se il provider di
 * posta e' giu' il messaggio resta comunque nostro, e l'esito dell'invio
 * viene annotato sulla riga stessa — cosi- si sa quali richieste non hanno
 * generato un avviso e vanno recuperate a mano.
 */
export async function submitContactMessage(
  input: ContactInput
): Promise<ContactResult> {
  // Trappola per bot: rispondiamo "ok" senza scrivere nulla, cosi' chi la
  // compila non impara che e' stato scoperto.
  if (input.website && input.website.trim() !== '') {
    return { ok: true, emailStatus: 'skipped' };
  }

  const invalid = validate(input);
  if (invalid) return invalid;

  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  const subject = input.subject.trim();
  const message = input.message.trim();

  const [{ count } = { count: 0 }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(contactMessages)
    .where(
      and(
        eq(contactMessages.email, email),
        gte(contactMessages.createdAt, new Date(Date.now() - 60 * 60 * 1000))
      )
    );

  if (count >= MAX_PER_EMAIL_PER_HOUR) {
    return {
      ok: false,
      error:
        'Abbiamo già ricevuto i tuoi messaggi: ti rispondiamo al più presto. Riprova più tardi.',
    };
  }

  const [row] = await db
    .insert(contactMessages)
    .values({
      name,
      email,
      subject,
      message,
      privacyAccepted: true,
      privacyVersion: LEGAL_CONTENT_HASH,
    })
    .returning({ id: contactMessages.id });

  const sent = await sendContactMessageEmail({ name, email, subject, message });
  const emailStatus = sent.ok ? 'sent' : sent.skipped ? 'skipped' : 'failed';

  if (row) {
    await db
      .update(contactMessages)
      .set({ emailStatus })
      .where(eq(contactMessages.id, row.id));
  }

  return { ok: true, emailStatus };
}
