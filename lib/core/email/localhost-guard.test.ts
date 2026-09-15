import { test } from 'node:test';
import assert from 'node:assert/strict';
import { containsLocalhostLink, replaceLocalhostLinks } from './localhost-guard';

test('riconosce un link a localhost con porta', () => {
  assert.equal(
    containsLocalhostLink('<a href="http://localhost:3000/dashboard">Apri</a>'),
    true
  );
});

test('riconosce un link a 127.0.0.1 senza porta', () => {
  assert.equal(containsLocalhostLink('vedi http://127.0.0.1/x'), true);
});

test('non segnala un link al dominio vero', () => {
  assert.equal(
    containsLocalhostLink('<a href="https://www.kaipaicoaching.com/dashboard">Apri</a>'),
    false
  );
});

test('sostituisce il link a localhost col dominio canonico, preservando il percorso', () => {
  const out = replaceLocalhostLinks(
    'http://localhost:3000/dashboard/appointments/270#session-compass'
  );
  assert.equal(
    out,
    'https://www.kaipaicoaching.com/dashboard/appointments/270#session-compass'
  );
});

test('sostituisce più occorrenze nello stesso testo (html + eventuale ripetizione)', () => {
  const out = replaceLocalhostLinks(
    'http://localhost:3000/a e anche http://localhost:3000/b'
  );
  assert.equal(
    out,
    'https://www.kaipaicoaching.com/a e anche https://www.kaipaicoaching.com/b'
  );
});

test('due chiamate consecutive restituiscono lo stesso risultato (niente stato residuo fra chiamate)', () => {
  const html = '<a href="http://localhost:4000/x">Apri</a>';
  assert.equal(containsLocalhostLink(html), true);
  // Se il regex condividesse `lastIndex` fra chiamate, questa seconda
  // valutazione sullo stesso input potrebbe restituire un falso negativo.
  assert.equal(containsLocalhostLink(html), true);
});
