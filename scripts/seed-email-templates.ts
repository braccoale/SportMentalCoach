/**
 * Scrive i template email in `email_templates` a partire dai default in codice.
 *
 *   pnpm email:seed-templates              inserisce solo le chiavi mancanti
 *   pnpm email:seed-templates --publish    pubblica una nuova versione attiva
 *
 * Modalità normale (idempotente e non distruttiva): una chiave che ha già una
 * versione attiva viene saltata, perché quella riga può contenere copy che un
 * amministratore ha modificato.
 *
 * Modalità `--publish`: inserisce `versione massima + 1` e sposta `is_active`
 * su di essa, dentro una transazione per chiave. Lo storico non viene mai
 * sovrascritto né cancellato: le versioni precedenti restano consultabili e
 * ripristinabili rimettendo `is_active` dove serve.
 *
 * In entrambi i casi i template sono validati contro la whitelist delle
 * variabili dell'evento prima di essere scritti: un template che fallirebbe al
 * momento dell'invio non entra mai nel database.
 */

import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { emailTemplates } from '@/lib/db/schema';
import {
  DEFAULT_EMAIL_TEMPLATES,
  validateDefaultTemplates,
} from '@/lib/core/email/default-templates';
import { DEFAULT_LOCALE, invalidateTemplateCache } from '@/lib/core/email/templates';
import {
  NOTIFICATION_EVENTS,
  type NotificationEventKey,
} from '@/lib/core/notifications/catalog';

const publish = process.argv.includes('--publish');

async function main() {
  const problems = validateDefaultTemplates();
  if (problems.length > 0) {
    for (const p of problems) {
      console.error(
        `✗ "${p.key}" usa segnaposto non consentiti: ${p.unknown.join(', ')}`
      );
    }
    process.exit(1);
  }

  let inserted = 0;
  let published = 0;
  let skipped = 0;

  for (const [eventKey, tpl] of Object.entries(DEFAULT_EMAIL_TEMPLATES)) {
    const event = NOTIFICATION_EVENTS[eventKey as NotificationEventKey];

    const values = {
      key: tpl.key,
      category: tpl.category,
      eyebrow: tpl.eyebrow,
      subject: tpl.subject,
      title: tpl.title,
      htmlBody: tpl.htmlBody,
      textBody: tpl.textBody,
      outro: tpl.outro,
      variables: [...event.variables],
      locale: DEFAULT_LOCALE,
      isMandatory: event.mandatoryEmail,
    };

    const [active] = await db
      .select({ id: emailTemplates.id, version: emailTemplates.version })
      .from(emailTemplates)
      .where(
        and(
          eq(emailTemplates.key, tpl.key),
          eq(emailTemplates.locale, DEFAULT_LOCALE),
          eq(emailTemplates.isActive, true)
        )
      )
      .limit(1);

    if (!active) {
      await db.insert(emailTemplates).values({ ...values, isActive: true, version: 1 });
      console.log(`✓ ${tpl.key} — inserito (v1)`);
      inserted += 1;
      continue;
    }

    if (!publish) {
      console.log(`· ${tpl.key} — già presente (v${active.version}), saltato`);
      skipped += 1;
      continue;
    }

    // Nuova versione attiva. L'indice unico parziale ammette una sola riga
    // attiva per (key, locale): la vecchia va disattivata PRIMA di inserire,
    // e la transazione garantisce che non resti mai nessuna versione attiva.
    const [latest] = await db
      .select({ version: emailTemplates.version })
      .from(emailTemplates)
      .where(
        and(
          eq(emailTemplates.key, tpl.key),
          eq(emailTemplates.locale, DEFAULT_LOCALE)
        )
      )
      .orderBy(desc(emailTemplates.version))
      .limit(1);

    const nextVersion = (latest?.version ?? 0) + 1;

    await db.transaction(async (tx) => {
      await tx
        .update(emailTemplates)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(emailTemplates.id, active.id));

      await tx
        .insert(emailTemplates)
        .values({ ...values, isActive: true, version: nextVersion });
    });

    console.log(
      `✓ ${tpl.key} — pubblicata v${nextVersion} (v${active.version} archiviata)`
    );
    published += 1;
  }

  invalidateTemplateCache();

  console.log(
    `\nFatto: ${inserted} inseriti, ${published} pubblicati, ${skipped} saltati.`
  );
  if (!publish && skipped > 0) {
    console.log('Per pubblicare una nuova versione: --publish');
  }
  process.exit(0);
}

main().catch((error) => {
  console.error('Seed dei template email fallito:', error);
  process.exit(1);
});
