import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractVariables,
  htmlToText,
  renderTemplate,
  TemplateVariableError,
  validateTemplateVariables,
} from './render';
import {
  DEFAULT_EMAIL_TEMPLATES,
  validateDefaultTemplates,
} from './default-templates';
import { NOTIFICATION_EVENTS } from '@/lib/core/notifications/catalog';

const ALLOWED = ['recipient.firstName', 'booking.date', 'actionUrl'] as const;

test('sostituisce i segnaposto whitelistati', () => {
  const out = renderTemplate(
    'Ciao {{recipient.firstName}}, il {{ booking.date }}.',
    { recipient: { firstName: 'Marco' }, booking: { date: '5 agosto' } },
    ALLOWED
  );
  assert.equal(out, 'Ciao Marco, il 5 agosto.');
});

test('esegue l’escape dell’HTML nei valori interpolati', () => {
  const out = renderTemplate(
    'Ciao {{recipient.firstName}}',
    { recipient: { firstName: '<script>alert(1)</script>' } },
    ALLOWED
  );
  assert.ok(!out.includes('<script>'));
  assert.ok(out.includes('&lt;script&gt;'));
});

test('in modalità testo non esegue l’escape', () => {
  const out = renderTemplate(
    '{{recipient.firstName}}',
    { recipient: { firstName: 'Sara & Luca' } },
    ALLOWED,
    'text'
  );
  assert.equal(out, 'Sara & Luca');
});

test('rifiuta un segnaposto fuori whitelist', () => {
  assert.throws(
    () =>
      renderTemplate(
        '{{user.passwordHash}}',
        { user: { passwordHash: 'segreto' } },
        ALLOWED
      ),
    (error: unknown) =>
      error instanceof TemplateVariableError &&
      error.reason === 'not_whitelisted'
  );
});

test('fallisce invece di inviare un’email incompleta', () => {
  assert.throws(
    () => renderTemplate('Ciao {{recipient.firstName}}', {}, ALLOWED),
    (error: unknown) =>
      error instanceof TemplateVariableError && error.reason === 'missing_value'
  );
});

test('una stringa vuota conta come valore mancante', () => {
  assert.throws(
    () =>
      renderTemplate(
        'Ciao {{recipient.firstName}}',
        { recipient: { firstName: '' } },
        ALLOWED
      ),
    (error: unknown) =>
      error instanceof TemplateVariableError && error.reason === 'missing_value'
  );
});

test('non risolve proprietà del prototipo', () => {
  assert.throws(
    () => renderTemplate('{{recipient.constructor}}', { recipient: {} }, [
      'recipient.constructor',
    ]),
    (error: unknown) =>
      error instanceof TemplateVariableError && error.reason === 'missing_value'
  );
});

test('non interpreta condizioni, cicli o espressioni', () => {
  // Nessuna sintassi oltre {{path}}: tutto il resto resta testo letterale.
  const source = '{{#if x}}A{{/if}} {{ 1 + 1 }} {{recipient.firstName}}';
  const out = renderTemplate(
    source,
    { recipient: { firstName: 'Ada' } },
    ALLOWED
  );
  assert.equal(out, '{{#if x}}A{{/if}} {{ 1 + 1 }} Ada');
});

test('estrae e valida i segnaposto di un template', () => {
  assert.deepEqual(
    extractVariables('{{a.b}} {{a.b}} {{c}}').sort(),
    ['a.b', 'c']
  );
  const { valid, unknown } = validateTemplateVariables('{{c}}', ['a.b']);
  assert.equal(valid, false);
  assert.deepEqual(unknown, ['c']);
});

test('deriva una versione testuale leggibile dall’HTML', () => {
  const text = htmlToText('<p>Ciao</p><p>Sessione &amp; report</p>');
  assert.equal(text, 'Ciao\nSessione & report');
});

test('ogni template di default usa solo segnaposto consentiti', () => {
  assert.deepEqual(validateDefaultTemplates(), []);
});

test('le email admin distinguono registrazione e richiesta di revisione', () => {
  const context = { coach: { fullName: 'Emanuele Orlandi' } };
  const registered = renderTemplate(
    DEFAULT_EMAIL_TEMPLATES.provider_registered.subject,
    context,
    NOTIFICATION_EVENTS.provider_registered.variables,
    'text'
  );
  const submitted = renderTemplate(
    DEFAULT_EMAIL_TEMPLATES.provider_review_requested.subject,
    context,
    NOTIFICATION_EVENTS.provider_review_requested.variables,
    'text'
  );

  assert.match(registered, /si è registrato/);
  assert.match(submitted, /ha inviato/);
  assert.notEqual(registered, submitted);
});
