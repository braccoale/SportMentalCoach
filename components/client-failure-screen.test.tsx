import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { ClientFailureScreen } from './client-failure-screen';

/**
 * Il markup servito alla prima passata, che è quello che una persona su una
 * rete lenta vede più a lungo: `navigator.onLine` si legge dopo il montaggio,
 * quindi qui la diagnosi è ancora quella senza il segnale di rete.
 */

function render(error: Error & { digest?: string }) {
  return renderToStaticMarkup(
    <ClientFailureScreen error={error} onRetry={() => {}} />
  );
}

function erroreDiCaricamento() {
  const error = new Error('Loading chunk 429 failed.') as Error & {
    digest?: string;
  };
  error.name = 'ChunkLoadError';
  return error;
}

test('la schermata non mostra più il testo di sistema di Next', () => {
  const html = render(erroreDiCaricamento());
  assert.doesNotMatch(html, /Application error/i);
  assert.doesNotMatch(html, /client-side exception/i);
  assert.doesNotMatch(html, /browser console/i);
  assert.doesNotMatch(html, /vercel\.app/i);
});

test('un caricamento mancato spiega le due cause e offre il gesto giusto', () => {
  const html = render(erroreDiCaricamento());
  assert.match(html, /Non siamo riusciti a caricare tutto/);
  assert.match(html, /connessione lenta/);
  assert.match(html, /aggiornamento/);
  assert.match(html, /Ricarica la pagina/);
});

test('si veste da sola: nessuna classe, solo stili in linea', () => {
  /*
   * Questa schermata compare proprio quando qualcosa non è arrivato dalla
   * rete, e il foglio di stile è una delle cose che può non essere arrivata.
   * Inoltre `global-error` rimpiazza il layout radice, quindi il CSS globale
   * non la raggiunge comunque.
   */
  const html = render(erroreDiCaricamento());
  assert.doesNotMatch(html, /class="/);
  assert.match(html, /style="/);
  assert.match(html, /background-color:#f9fafb/);
});

test('il codice per l’assistenza compare solo quando esiste', () => {
  const senza = render(erroreDiCaricamento());
  assert.doesNotMatch(senza, /Codice per l’assistenza/);

  const conDigest = new Error('boom') as Error & { digest?: string };
  conDigest.digest = 'a1b2c3d4';
  const html = render(conDigest);
  assert.match(html, /Codice per l’assistenza/);
  assert.match(html, /a1b2c3d4/);
});

test('c’è sempre una via d’uscita oltre al pulsante', () => {
  const html = render(erroreDiCaricamento());
  assert.match(html, /href="\/dashboard"/);
  assert.match(html, /Torna alla home/);
});

test('i bersagli sono comodi su un telefono, che è dove questa schermata compare', () => {
  const html = render(erroreDiCaricamento());
  // 44px è la soglia sotto cui un dito sbaglia.
  assert.equal(html.match(/min-height:44px/g)?.length, 2);
});
