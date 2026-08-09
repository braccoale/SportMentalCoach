import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizedCallbackBase } from './transcription-dispatch';

/*
 * Il prefisso mancante e' costato giorni di trascrizioni perse.
 *
 * La variabile conteneva l'host nudo — «progetto.vercel.app» — l'indirizzo
 * che ne usciva non era assoluto, e il provider rifiutava ogni consegna con
 * un errore che non diceva quale campo fosse sbagliato. Nessun test copriva
 * la costruzione di quell'indirizzo: era «una concatenazione di stringhe».
 */

test('un host senza prefisso viene corretto invece di far fallire tutto', () => {
  assert.equal(
    normalizedCallbackBase('sport-mental-coach-arge.vercel.app'),
    'https://sport-mental-coach-arge.vercel.app'
  );
});

test('la barra finale non produce un doppio separatore', () => {
  assert.equal(
    normalizedCallbackBase('https://www.kaipaicoaching.com/'),
    'https://www.kaipaicoaching.com'
  );
});

test('un percorso in coda non sopravvive: conta solo l’origine', () => {
  // Un valore incollato male non deve produrre un indirizzo storto in
  // silenzio: della base interessa l'origine, il resto lo mettiamo noi.
  assert.equal(
    normalizedCallbackBase('https://www.kaipaicoaching.com/api'),
    'https://www.kaipaicoaching.com'
  );
});

test('http non viene accettato: il provider non ci arriverebbe', () => {
  // Correggerlo in silenzio significherebbe riavere lo stesso guasto
  // travestito da configurazione valida.
  assert.throws(() => normalizedCallbackBase('http://esempio.it'), {
    code: 'PROVIDER_NOT_CONFIGURED',
  });
});

test('un valore senza senso fallisce subito, non alla prima seduta', () => {
  assert.throws(() => normalizedCallbackBase('non è un indirizzo'));
});
