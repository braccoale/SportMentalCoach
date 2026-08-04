import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEGAL_VERSION, LEGAL_CONTACT_EMAIL } from './processors';
import { LEGAL_CONTENT_HASH } from './content-hash.generated';

/**
 * Questi test non toccano il database: verificano gli invarianti che rendono
 * una prova di accettazione utilizzabile. Sono il tipo di dettaglio che si
 * rompe in silenzio — nessuno se ne accorge finché non serve dimostrare che
 * cosa un utente aveva davanti agli occhi.
 *
 * Non importano `acceptance.ts`: quel modulo è `server-only` e non si carica
 * nella suite standard. Qui contano le costanti che finiscono nella riga di
 * accettazione, e quelle sono pure.
 */

test('la versione dei documenti ha il formato di una data', () => {
  assert.match(LEGAL_VERSION, /^\d{4}-\d{2}-\d{2}$/);
});

test('l’hash del testo legale è uno SHA-256 completo', () => {
  // Senza l'hash si potrebbe provare solo "ha accettato la versione X", e
  // chiunque potrebbe sostenere che quel testo sia stato cambiato dopo.
  assert.match(LEGAL_CONTENT_HASH, /^[0-9a-f]{64}$/);
});

test('il contatto legale è sul dominio della piattaforma', () => {
  assert.ok(LEGAL_CONTACT_EMAIL.endsWith('@kaipaicoaching.com'));
});
