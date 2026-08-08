/**
 * Renderizza le email su file, senza database e senza inviare nulla.
 *
 *   pnpm email:preview
 *
 * Scrive in `tmp/email-preview/`: un .html e un .txt per evento, più un
 * indice. Serve a controllare a occhio l'impaginazione e, soprattutto, a
 * verificare che la parte testuale sia leggibile quanto quella HTML.
 *
 * Usa i template predefiniti in codice e dati finti realistici, compresi i
 * casi limite che contano: appuntamento senza orario proposto, atleta senza
 * sport, prenotazione senza servizio associato.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { DEFAULT_EMAIL_TEMPLATES } from '@/lib/core/email/default-templates';
import { wrapEmailHtml, wrapEmailText } from '@/lib/core/email/layout';
import {
  renderTemplate,
  splitParagraphs,
  type TemplateContext,
} from '@/lib/core/email/render';
import {
  buildBookingCard,
  buildCalendarAction,
  type BookingEmailData,
} from '@/lib/core/email/booking-context';
import { roleLabelIt } from '@/lib/core/email/format';
import {
  NOTIFICATION_EVENTS,
  NOTIFICATION_EVENT_KEYS,
  type NotificationEventKey,
} from '@/lib/core/notifications/catalog';

const OUT_DIR = 'tmp/email-preview';
const BASE_URL = 'https://www.kaipaicoaching.com';

/**
 * Origine usata solo per risolvere il logo nell'anteprima: punta alla cartella
 * `public/` locale, così lo screenshot mostra l'immagine vera invece di un
 * riquadro rotto. Nelle email reali resta `BASE_URL`.
 */
const ASSET_BASE = `file://${resolve('public').replace(/\\/g, '/')}`;

/** Dati finti ma plausibili, con Europe/Rome esplicito. */
const bookingData: BookingEmailData = {
  bookingId: 128,
  status: 'accepted',
  requestedAt: new Date('2026-08-04T10:18:00Z'), // 12:18 a Roma
  scheduledFor: new Date('2026-08-05T16:00:00Z'), // 18:00 a Roma
  serviceTitle: 'Conoscitiva',
  durationMin: 40,
  note: 'Vorrei lavorare sulla gestione della pressione prima delle partite importanti.',
  athlete: {
    userId: 1,
    displayName: 'Alessandro Bracco',
    sport: 'Calcio',
    goals: 'Migliorare la concentrazione sotto pressione',
  },
  coach: { userId: 2, displayName: 'Marco Rossi' },
};

/** Stesso appuntamento senza i dati opzionali: la card deve reggere. */
const minimalData: BookingEmailData = {
  ...bookingData,
  scheduledFor: null,
  serviceTitle: null,
  durationMin: null,
  note: null,
  athlete: { ...bookingData.athlete, sport: null, goals: null },
};

function contextFor(
  eventKey: NotificationEventKey,
  data: BookingEmailData,
  recipientRole: 'athlete' | 'coach'
): TemplateContext {
  const counterpart = recipientRole === 'coach' ? data.athlete : data.coach;
  const actorRole = eventKey === 'booking_requested' ? 'athlete' : 'coach';
  const actor = actorRole === 'coach' ? data.coach : data.athlete;

  return {
    recipient: {
      firstName: recipientRole === 'coach' ? 'Marco' : 'Alessandro',
      fullName: recipientRole === 'coach' ? 'Marco Rossi' : 'Alessandro Bracco',
    },
    session: {
      label: data.serviceTitle ? `una sessione ${data.serviceTitle}` : 'una sessione',
    },
    coach: { fullName: data.coach.displayName ?? undefined },
    athlete: { fullName: data.athlete.displayName ?? undefined },
    counterpart: { fullName: counterpart.displayName ?? undefined },
    actor: {
      fullName: actor.displayName ?? undefined,
      role: roleLabelIt(actorRole) ?? undefined,
    },
    sender: { fullName: data.coach.displayName ?? undefined },
    inviter: { name: 'Alessandro Bracco' },
    review: { rating: 5 },
    security: {
      event: 'accesso da un nuovo dispositivo (Chrome su Windows, Milano)',
      occurredAt: 'lunedì 4 agosto 2026, alle 12:18',
    },
  };
}

function render(
  eventKey: NotificationEventKey,
  data: BookingEmailData,
  recipientRole: 'athlete' | 'coach'
) {
  const event = NOTIFICATION_EVENTS[eventKey];
  const tpl = DEFAULT_EMAIL_TEMPLATES[eventKey];
  const ctx = contextFor(eventKey, data, recipientRole);
  const actionUrl = `${BASE_URL}/dashboard/appointments/${data.bookingId}`;
  const full = { ...ctx, actionUrl };

  const text = (s: string) => renderTemplate(s, full, event.variables, 'text');
  const html = (s: string) => renderTemplate(s, full, event.variables, 'html');

  const subject = text(tpl.subject);
  const eyebrow = text(tpl.eyebrow);
  const title = text(tpl.title);
  const bodyText = text(tpl.htmlBody);
  const bodyHtml = splitParagraphs(html(tpl.htmlBody))
    .map((p) => `<p style="margin:0 0 14px">${p}</p>`)
    .join('\n');
  const outroText = tpl.outro ? text(tpl.outro) : null;
  const outroHtml = tpl.outro
    ? splitParagraphs(html(tpl.outro))
        .map((p) => `<p style="margin:0 0 8px">${p}</p>`)
        .join('\n')
    : null;

  const card = buildBookingCard({
    eventKey,
    data,
    actorUserId: eventKey === 'booking_requested' ? data.athlete.userId : data.coach.userId,
    occurredAt: new Date('2026-08-04T12:02:00Z'),
    recipientRole,
  });

  const action = tpl.actionLabel
    ? { label: tpl.actionLabel, url: actionUrl }
    : null;

  // Il pulsante calendario compare solo dove il catalogo lo prevede e la
  // sessione e' futura: l'anteprima usa una data del 2026, quindi si vede.
  const secondaryAction = buildCalendarAction({
    eventKey,
    data,
    recipientRole,
  });

  return {
    subject,
    html: wrapEmailHtml({
      preview: splitParagraphs(bodyText)[0] ?? null,
      eyebrow,
      title,
      bodyHtml,
      card,
      outroHtml,
      action,
      secondaryAction,
      preferencesUrl: `${BASE_URL}/dashboard/notifications/preferences`,
      privacyUrl: `${BASE_URL}/privacy`,
      baseUrl: ASSET_BASE,
    }),
    text: wrapEmailText({
      eyebrow,
      title,
      bodyText,
      card,
      outroText,
      action,
      secondaryAction,
      preferencesUrl: `${BASE_URL}/dashboard/notifications/preferences`,
    }),
  };
}

/** Destinatario naturale di ogni evento, così la card mostra la controparte giusta. */
const RECIPIENT: Record<NotificationEventKey, 'athlete' | 'coach'> = {
  booking_requested: 'coach',
  booking_created_by_coach: 'athlete',
  call_started: 'athlete',
  booking_accepted: 'athlete',
  booking_declined: 'athlete',
  booking_cancelled: 'coach',
  booking_rescheduled: 'athlete',
  booking_completed: 'athlete',
  booking_reminder_24h: 'athlete',
  booking_reminder_1h: 'athlete',
  new_message: 'athlete',
  ai_report_ready: 'athlete',
  coach_invitation: 'athlete',
  athlete_registered: 'coach',
  provider_registered: 'coach',
  provider_review_requested: 'coach',
  provider_approved: 'coach',
  provider_rejected: 'coach',
  review_received: 'coach',
  security_alert: 'athlete',
};

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const index: string[] = [];

  for (const key of NOTIFICATION_EVENT_KEYS) {
    const out = render(key, bookingData, RECIPIENT[key]);
    await writeFile(`${OUT_DIR}/${key}.html`, out.html, 'utf8');
    await writeFile(
      `${OUT_DIR}/${key}.txt`,
      `Oggetto: ${out.subject}\n\n${out.text}`,
      'utf8'
    );
    index.push(
      `<li><a href="${key}.html">${key}</a> &nbsp;<code>${out.subject}</code> &nbsp;<a href="${key}.txt">testo</a></li>`
    );
    console.log(`✓ ${key} — "${out.subject}"`);
  }

  // Caso limite: richiesta senza orario proposto, senza servizio, senza sport.
  const edge = render('booking_requested', minimalData, 'coach');
  await writeFile(`${OUT_DIR}/_edge-minimal.html`, edge.html, 'utf8');
  await writeFile(`${OUT_DIR}/_edge-minimal.txt`, edge.text, 'utf8');
  index.push(
    '<li><a href="_edge-minimal.html">booking_requested — dati minimi</a> (nessun orario, servizio, sport o nota)</li>'
  );
  console.log('✓ caso limite dati minimi');

  await writeFile(
    `${OUT_DIR}/index.html`,
    `<!doctype html><meta charset="utf-8"><title>Anteprima email KaiPai</title>
<body style="font-family:system-ui;padding:32px;max-width:760px;margin:0 auto">
<h1>Anteprima email KaiPai</h1>
<ul style="line-height:2">${index.join('\n')}</ul>`,
    'utf8'
  );

  console.log(`\nScritte in ${OUT_DIR}/ — apri index.html`);
}

main().catch((error) => {
  console.error('Preview fallita:', error);
  process.exit(1);
});
