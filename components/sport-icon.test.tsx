import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { SportIcon, sportLabel } from './sport-icon';

test('il tooltip traduce la chiave dello sport e si può raggiungere da tastiera', () => {
  const html = renderToStaticMarkup(
    <SportIcon sportKey="martial_arts" className="h-4 w-4" />
  );

  assert.match(html, /aria-label="Sport: Arti marziali"/);
  assert.match(html, /tabindex="0"/);
  assert.match(html, /role="tooltip"[^>]*>Arti marziali/);
});

test('un nome più specifico sostituisce quello generico della tassonomia', () => {
  const html = renderToStaticMarkup(
    <SportIcon sportKey="martial_arts" label="Karate" />
  );

  assert.match(html, /aria-label="Sport: Karate"/);
  assert.match(html, /role="tooltip"[^>]*>Karate/);
});

test('una chiave futura resta leggibile anche prima di entrare in tassonomia', () => {
  assert.equal(sportLabel('beach_volleyball'), 'Beach volleyball');
  assert.equal(sportLabel(null), 'Sport non indicato');
});
