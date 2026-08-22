import assert from 'node:assert/strict';
import test from 'node:test';
import { buildWelcomeEmailContent } from './welcome-content';

test('la mail al nuovo coach spiega tutti i passaggi e l’approvazione admin', () => {
  const content = buildWelcomeEmailContent({
    brand: 'KaiPai',
    name: 'Giulia',
    role: 'coach',
  });
  const copy = content.paragraphs.join(' ');

  assert.match(copy, /1\. Completa il profilo professionale/);
  assert.match(copy, /2\. Controlla la sezione Servizi/);
  assert.match(copy, /Sessione online/);
  assert.match(copy, /40 minuti/);
  assert.match(copy, /0 €/);
  assert.match(copy, /3\. .*Invia per la revisione/);
  assert.match(copy, /4\. L’amministratore di KaiPai/);
  assert.match(copy, /Fino all’approvazione, il profilo non sarà pubblico/);
  assert.equal(content.actionLabel, 'Completa profilo e servizi');
  assert.equal(content.actionPath, '/dashboard/coach');
});

test('la mail atleta conserva il suo percorso senza istruzioni da coach', () => {
  const content = buildWelcomeEmailContent({
    brand: 'KaiPai',
    name: 'Luca',
    role: 'athlete',
  });

  assert.equal(content.subject, 'Benvenuto su KaiPai, Luca');
  assert.equal(content.actionPath, '/dashboard');
  assert.doesNotMatch(content.paragraphs.join(' '), /amministratore/i);
});

test('la mail al minorenne spiega autorizzazione, blocchi e consenso AI facoltativo', () => {
  const content = buildWelcomeEmailContent({
    brand: 'KaiPai',
    name: 'Luca',
    role: 'athlete',
    guardianAuthorizationRequired: true,
  });
  const copy = content.paragraphs.join(' ');

  assert.match(content.subject, /serve l’autorizzazione di un genitore/);
  assert.match(copy, /1\. Apri la tua area atleta/);
  assert.match(copy, /2\. .*nome, cognome, rapporto con te ed email/);
  assert.match(copy, /3\. .*collegamento personale/);
  assert.match(copy, /valido per 72 ore/);
  assert.match(copy, /4\. .*responsabilità genitoriale o tutela/);
  assert.match(copy, /accettare Termini e Privacy/);
  assert.match(copy, /Fino alla conferma non potrai prenotare o partecipare/);
  assert.match(copy, /Appunti AI sono separati e facoltativi/);
  assert.match(copy, /senza registrazione/);
  assert.equal(content.actionLabel, 'Invita il genitore o tutore');
  assert.equal(content.actionPath, '/dashboard/athlete');
});
