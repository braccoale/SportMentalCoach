import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { CollapsiblePanel } from './collapsible-panel';

/**
 * Il markup servito dal server è ciò che si vede arrivando sulla pagina: il
 * ripristino di una scelta precedente avviene dopo, sul client, e qui non c'è.
 */

test('un blocco pieno arriva aperto, uno vuoto arriva chiuso', () => {
  const pieno = renderToStaticMarkup(
    <CollapsiblePanel title="Coda di revisione" count={2}>
      <p>due profili</p>
    </CollapsiblePanel>
  );
  assert.match(pieno, /<details open/);

  const vuoto = renderToStaticMarkup(
    <CollapsiblePanel title="Coda di revisione" count={0} defaultOpen={false}>
      <p>Nessun profilo in attesa di revisione.</p>
    </CollapsiblePanel>
  );
  assert.doesNotMatch(vuoto, /<details open/);
});

test('il conteggio sta nell’intestazione, cioè si legge anche a blocco chiuso', () => {
  const html = renderToStaticMarkup(
    <CollapsiblePanel
      title="Prossimi appuntamenti"
      count={3}
      hint="il primo domani"
      defaultOpen={false}
    >
      <p>tre appuntamenti</p>
    </CollapsiblePanel>
  );

  const summary = html.slice(html.indexOf('<summary'), html.indexOf('</summary>'));
  assert.match(summary, /Prossimi appuntamenti/);
  assert.match(summary, />3</);
  assert.match(summary, /il primo domani/);
});
