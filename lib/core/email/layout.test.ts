import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isEmptyCard,
  renderDetailsCardHtml,
  renderDetailsCardText,
  visibleRows,
  type DetailsCard,
} from './details-card';
import {
  displayName,
  formatDateTimeIt,
  formatDurationIt,
  roleLabelIt,
} from './format';
import { wrapEmailHtml, wrapEmailText, logoUrl, BRAND } from './layout';
import { DEFAULT_EMAIL_TEMPLATES } from './default-templates';

// --- Formattazione ----------------------------------------------------------

test('formatta data e ora in italiano nel fuso di Roma', () => {
  // 10:18 UTC in agosto = 12:18 a Roma (ora legale).
  const value = formatDateTimeIt(new Date('2026-08-04T10:18:00Z'));
  assert.equal(value, 'martedì 4 agosto 2026, alle 12:18');
});

test('applica l’ora solare quando serve', () => {
  // In gennaio Roma è UTC+1, non UTC+2.
  const value = formatDateTimeIt(new Date('2026-01-15T10:18:00Z'));
  assert.equal(value, 'giovedì 15 gennaio 2026, alle 11:18');
});

test('una data assente o non valida non produce testo', () => {
  assert.equal(formatDateTimeIt(null), null);
  assert.equal(formatDateTimeIt(undefined), null);
  assert.equal(formatDateTimeIt(new Date('non-una-data')), null);
});

test('formatta le durate in italiano', () => {
  assert.equal(formatDurationIt(40), '40 minuti');
  assert.equal(formatDurationIt(60), '1 ora');
  assert.equal(formatDurationIt(90), '1 ora e 30 minuti');
  assert.equal(formatDurationIt(0), null);
  assert.equal(formatDurationIt(null), null);
});

test('il nome visualizzato non è mai una stringa vuota', () => {
  assert.equal(
    displayName({ name: 'Alessandro', lastName: 'Bracco' }),
    'Alessandro Bracco'
  );
  assert.equal(displayName({ name: 'Marco', lastName: null }), 'Marco');
  // Nessun nome: la parte locale dell'indirizzo è meglio di "undefined".
  assert.equal(
    displayName({ name: null, lastName: null, email: 'mario.rossi@example.com' }),
    'mario.rossi'
  );
  assert.equal(displayName({ name: null, lastName: null, email: null }), null);
});

test('etichetta i ruoli in italiano', () => {
  assert.equal(roleLabelIt('athlete'), 'Atleta');
  assert.equal(roleLabelIt('coach'), 'Coach');
  assert.equal(roleLabelIt(null), null);
});

// --- Card dei dettagli ------------------------------------------------------

const fullCard: DetailsCard = {
  rows: [
    { label: 'Richiedente', value: 'Alessandro Bracco' },
    { label: 'Sport', value: null },
    { label: 'Obiettivo', value: '' },
    { label: 'Sessione proposta', value: 'mercoledì 5 agosto 2026, alle 18:00', emphasis: true },
  ],
};

test('omette le righe senza valore invece di stampare vuoti', () => {
  const rows = visibleRows(fullCard);
  assert.deepEqual(rows.map((r) => r.label), ['Richiedente', 'Sessione proposta']);

  const html = renderDetailsCardHtml(fullCard);
  assert.ok(html.includes('Richiedente'));
  assert.ok(!html.includes('Sport'));
  assert.ok(!html.includes('Obiettivo'));
  assert.ok(!html.includes('undefined'));
  assert.ok(!html.includes('null'));
});

test('una card senza righe visibili sparisce del tutto', () => {
  const empty: DetailsCard = {
    rows: [{ label: 'Sport', value: null }],
  };
  assert.equal(isEmptyCard(empty), true);
  assert.equal(renderDetailsCardHtml(empty), '');
  assert.equal(renderDetailsCardText(empty), '');
});

test('esegue l’escape dei valori nella card', () => {
  const card: DetailsCard = {
    rows: [{ label: 'Richiedente', value: '<img src=x onerror=alert(1)>' }],
  };
  const html = renderDetailsCardHtml(card);
  assert.ok(!html.includes('<img'));
  assert.ok(html.includes('&lt;img'));
});

test('la versione testo della card riporta gli stessi dati', () => {
  const text = renderDetailsCardText(fullCard);
  assert.ok(text.includes('Alessandro Bracco'));
  assert.ok(text.includes('mercoledì 5 agosto 2026, alle 18:00'));
  assert.ok(!text.includes('Sport'));
});

test('la citazione compare solo se c’è un testo', () => {
  const withQuote: DetailsCard = {
    rows: [{ label: 'Richiedente', value: 'Alessandro Bracco' }],
    quote: { text: 'Voglio gestire meglio la pressione.', attribution: 'Alessandro' },
  };
  assert.ok(renderDetailsCardHtml(withQuote).includes('gestire meglio'));
  assert.equal(
    renderDetailsCardHtml({ rows: withQuote.rows, quote: { text: '   ' } }).includes('«'),
    false
  );
});

// --- Layout -----------------------------------------------------------------

const baseLayout = {
  eyebrow: 'Nuova richiesta',
  title: 'Hai ricevuto una richiesta di sessione',
  bodyHtml: '<p>Alessandro Bracco ti ha inviato una richiesta.</p>',
  card: fullCard,
  action: { label: 'Apri la richiesta', url: 'https://www.kaipaicoaching.com/dashboard' },
  preferencesUrl: 'https://www.kaipaicoaching.com/dashboard/notifications/preferences',
  privacyUrl: 'https://www.kaipaicoaching.com/privacy',
  baseUrl: 'https://www.kaipaicoaching.com',
};

test('l’HTML contiene logo, marca, CTA e footer', () => {
  const html = wrapEmailHtml(baseLayout);
  assert.ok(html.includes(logoUrl('https://www.kaipaicoaching.com')));
  assert.ok(html.includes('alt="KaiPai"'));
  assert.ok(html.includes('Apri la richiesta'));
  assert.ok(html.includes('kaipaicoaching.com'));
  assert.ok(html.includes('info@kaipaicoaching.com'));
  assert.ok(html.includes('Preferenze notifiche'));
  assert.ok(html.includes('Il team KaiPai'));
});

test('la CTA porta sempre anche l’URL in chiaro', () => {
  const html = wrapEmailHtml(baseLayout);
  assert.ok(html.includes('Se il pulsante non funziona'));
  // L'indirizzo compare come testo, non solo dentro href.
  assert.ok(html.includes('>https://www.kaipaicoaching.com/dashboard</a>'));
});

test('la CTA usa il rosso profondo, non quello degli accenti', () => {
  const html = wrapEmailHtml(baseLayout);
  assert.ok(html.includes(`background:${BRAND.redDeep}`));
  // Il rosso chiaro resta sulla banda e sull'eyebrow.
  assert.ok(html.includes(`background:${BRAND.red}`));
});

test('l’azione secondaria è in outline, non un secondo pulsante pieno', () => {
  const html = wrapEmailHtml({
    ...baseLayout,
    secondaryAction: {
      label: 'Aggiungi a Google Calendar',
      url: 'https://calendar.google.com/calendar/render?x=1',
    },
  });
  assert.ok(html.includes('Aggiungi a Google Calendar'));
  assert.ok(html.includes(`border:1px solid ${BRAND.border}`));
});

test('è compatibile con i client email: tabelle, stili inline, niente script', () => {
  const html = wrapEmailHtml(baseLayout);
  assert.ok(html.includes('role="presentation"'));
  assert.ok(html.includes('max-width:600px'));
  assert.ok(!html.includes('<script'));
  assert.ok(!html.includes('<style'));
  assert.ok(!/<link\b/.test(html));
  assert.ok(!html.includes('flex'));
});

test('senza CTA non compare né pulsante né fallback', () => {
  const html = wrapEmailHtml({ ...baseLayout, action: null });
  assert.ok(!html.includes('Se il pulsante non funziona'));
});

test('la versione testo riporta titolo, card, CTA e footer', () => {
  const text = wrapEmailText({
    eyebrow: baseLayout.eyebrow,
    title: baseLayout.title,
    bodyText: 'Alessandro Bracco ti ha inviato una richiesta.',
    card: fullCard,
    outroText: 'Rispondi in fretta.',
    action: baseLayout.action,
    preferencesUrl: baseLayout.preferencesUrl,
  });
  assert.ok(text.includes('NUOVA RICHIESTA'));
  assert.ok(text.includes('Hai ricevuto una richiesta di sessione'));
  assert.ok(text.includes('Alessandro Bracco'));
  assert.ok(text.includes('https://www.kaipaicoaching.com/dashboard'));
  assert.ok(text.includes('Preferenze notifiche:'));
  assert.ok(!text.includes('<'));
});

// --- Template predefiniti ---------------------------------------------------

test('ogni template ha eyebrow, oggetto, titolo e corpo', () => {
  for (const [key, tpl] of Object.entries(DEFAULT_EMAIL_TEMPLATES)) {
    assert.ok(tpl.eyebrow.trim(), `${key}: eyebrow mancante`);
    assert.ok(tpl.subject.trim(), `${key}: oggetto mancante`);
    assert.ok(tpl.title.trim(), `${key}: titolo mancante`);
    assert.ok(tpl.htmlBody.trim(), `${key}: corpo mancante`);
    assert.ok(tpl.textBody.trim(), `${key}: versione testo mancante`);
  }
});

test('i template non contengono markup: la presentazione è nel layout', () => {
  for (const [key, tpl] of Object.entries(DEFAULT_EMAIL_TEMPLATES)) {
    for (const field of [tpl.subject, tpl.title, tpl.htmlBody, tpl.outro ?? '']) {
      assert.ok(!/<[a-z]/i.test(field), `${key}: markup nel contenuto`);
    }
  }
});

test('nessun template espone contenuti sensibili di chat o report', () => {
  const message = DEFAULT_EMAIL_TEMPLATES.new_message;
  assert.ok(message.outro?.includes('non viene riportato'));
  const report = DEFAULT_EMAIL_TEMPLATES.ai_report_ready;
  assert.ok(report.outro?.includes('riservato'));
  // Nessun segnaposto per il testo del messaggio o del report.
  for (const tpl of [message, report]) {
    assert.ok(!tpl.htmlBody.includes('preview'));
    assert.ok(!tpl.htmlBody.includes('body'));
  }
});
