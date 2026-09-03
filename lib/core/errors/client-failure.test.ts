import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyClientFailure } from './client-failure';

test('senza rete lo si dice, invece di parlare di un errore', () => {
  const failure = classifyClientFailure({
    name: 'TypeError',
    message: 'Failed to fetch',
    online: false,
  });

  assert.equal(failure.kind, 'offline');
  assert.match(failure.title, /senza connessione/i);
  assert.equal(failure.reloadFixes, true);
  assert.equal(failure.dataIsSafe, true);
});

test('l’essere offline vince su qualunque altro segnale', () => {
  // Anche con un errore che sembra applicativo: se il telefono non ha rete,
  // quella e' la cosa che la persona puo' risolvere.
  const failure = classifyClientFailure({
    name: 'RangeError',
    message: 'invalid array length',
    online: false,
  });
  assert.equal(failure.kind, 'offline');
});

test('i cinque modi di dire «non ho caricato quel pezzo» sono lo stesso caso', () => {
  const varianti = [
    { name: 'ChunkLoadError', message: 'Loading chunk 429 failed.' },
    { name: 'Error', message: 'Failed to fetch dynamically imported module: /_next/x.js' },
    { name: 'Error', message: 'error loading dynamically imported module' },
    { name: 'Error', message: 'Importing a module script failed.' },
    { name: 'Error', message: 'Loading CSS chunk 12 failed.' },
    { name: 'TypeError', message: 'NetworkError when attempting to fetch resource.' },
  ];

  for (const variante of varianti) {
    const failure = classifyClientFailure({ ...variante, online: true });
    assert.equal(
      failure.kind,
      'caricamento',
      `${variante.message} non riconosciuto`
    );
    // Ricaricare risolve davvero: e' il gesto che va offerto per primo.
    assert.equal(failure.reloadFixes, true);
    assert.match(failure.actionLabel, /ricarica/i);
  }
});

test('il riconoscimento non dipende dalle maiuscole', () => {
  assert.equal(
    classifyClientFailure({ name: 'chunkloaderror', message: '' }).kind,
    'caricamento'
  );
});

test('il caricamento mancato dichiara entrambe le cause, senza fingere di sapere quale', () => {
  const failure = classifyClientFailure({
    name: 'ChunkLoadError',
    message: 'Loading chunk 3 failed.',
  });
  assert.match(failure.body, /connessione lenta/i);
  assert.match(failure.body, /aggiornamento/i);
});

test('un errore vero non scarica la colpa sulla connessione', () => {
  const failure = classifyClientFailure({
    name: 'TypeError',
    message: "Cannot read properties of undefined (reading 'map')",
    online: true,
  });

  assert.equal(failure.kind, 'applicazione');
  /*
   * Non basta che la parola «connessione» non compaia: la frase la nomina di
   * proposito, per **escluderla**. Quello che non deve esserci e' l'invito a
   * controllarla, cioe' la colpa spostata su chi legge.
   */
  assert.doesNotMatch(failure.body, /controlla la (tua )?connessione/i);
  assert.doesNotMatch(failure.body, /verifica la (tua )?rete/i);
  // Ricaricare non risolve un difetto nostro: il pulsante non deve prometterlo.
  assert.equal(failure.reloadFixes, false);
  // E non rassicuriamo su dati che non sappiamo dove siano finiti.
  assert.equal(failure.dataIsSafe, false);
});

test('il codice per il supporto passa solo quando c’è davvero', () => {
  assert.equal(
    classifyClientFailure({ message: 'boom', digest: '  ' }).digest,
    null
  );
  assert.equal(
    classifyClientFailure({ message: 'boom', digest: ' 1a2b3c ' }).digest,
    '1a2b3c'
  );
  assert.equal(classifyClientFailure({ message: 'boom' }).digest, null);
});

test('nessun messaggio nomina la console del browser o un dominio interno', () => {
  const casi = [
    classifyClientFailure({ online: false }),
    classifyClientFailure({ name: 'ChunkLoadError', message: 'Loading chunk 1 failed.' }),
    classifyClientFailure({ message: 'boom' }),
  ];

  for (const failure of casi) {
    const testo = `${failure.title} ${failure.body}`;
    assert.doesNotMatch(testo, /console/i, 'nessuno aprirà la console');
    assert.doesNotMatch(testo, /vercel|localhost|\.app\b/i);
    // In italiano, come il resto del prodotto.
    assert.doesNotMatch(testo, /application error|client-side/i);
  }
});

test('ogni caso dice cosa fare, e la frase non è vuota', () => {
  for (const failure of [
    classifyClientFailure({ online: false }),
    classifyClientFailure({ name: 'ChunkLoadError', message: 'x' }),
    classifyClientFailure({ message: 'boom' }),
  ]) {
    assert.ok(failure.title.length > 5);
    assert.ok(failure.body.length > 60);
    assert.ok(failure.actionLabel.length > 3);
  }
});

test('non promettiamo un tracciamento che non esiste', () => {
  /*
   * «L'errore e' gia' stato registrato» era la prima versione di questo
   * testo, ed era falsa: nel progetto non c'e' nessun raccoglitore di errori
   * client, e un'eccezione nel browser non arriva da nessuna parte. Una
   * rassicurazione falsa fa smettere di segnalare: la persona aspetta che ce
   * ne accorgiamo noi, e non succede.
   */
  const failure = classifyClientFailure({ message: 'boom', online: true });
  assert.doesNotMatch(failure.body, /registrat|tracciat|monitorat/i);
  // E chiede esplicitamente la segnalazione, dicendo perché serve.
  assert.match(failure.body, /segnala/i);
});

test('l’errore applicativo non attribuisce la colpa alla rete della persona', () => {
  const failure = classifyClientFailure({ message: 'boom', online: true });
  assert.match(failure.body, /Non è la tua connessione/i);
});
