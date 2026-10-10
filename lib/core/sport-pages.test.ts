import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  MIN_COACHES_FOR_SPORT_PAGE,
  SPORT_PHRASES,
  eligibleSportPages,
  findSportPage,
  sportSlug,
} from './sport-pages';

const sports = [
  { key: 'football', label: 'Calcio' },
  { key: 'volleyball', label: 'Pallavolo' },
  { key: 'martial_arts', label: 'Arti marziali' },
  { key: 'other', label: 'Altro' },
];

describe('indirizzo dello sport', () => {
  it('minuscolo, senza accenti e con i trattini', () => {
    assert.equal(sportSlug('Calcio'), 'calcio');
    assert.equal(sportSlug('Arti marziali'), 'arti-marziali');
    assert.equal(sportSlug('Atlètica '), 'atletica');
  });
});

describe('quali sport hanno una pagina', () => {
  it('serve almeno la soglia di coach, e ogni coach conta una volta', () => {
    assert.equal(MIN_COACHES_FOR_SPORT_PAGE, 2);
    const pages = eligibleSportPages(sports, [['football'], ['football', 'football'], ['volleyball'], null]);
    assert.deepEqual(pages.map((p) => p.key), ['football']);
    assert.equal(pages[0].coachCount, 2);
    assert.equal(pages[0].phrase, 'il calcio');
    assert.equal(pages[0].slug, 'calcio');
  });
  it('«altro» e gli sport senza frase non hanno mai una pagina, anche con molti coach', () => {
    const many = Array.from({ length: 5 }, () => ['other', 'sport-sconosciuto']);
    assert.deepEqual(eligibleSportPages([...sports, { key: 'sport-sconosciuto', label: 'Boh' }], many), []);
  });
  it('senza coach non esce nessuna pagina', () => {
    assert.deepEqual(eligibleSportPages(sports, []), []);
  });
  it('ogni frase è una frase con l’articolo', () => {
    for (const phrase of Object.values(SPORT_PHRASES)) assert.match(phrase, /^(il|lo|la|l’|le|gli|i) ?/);
  });
});

describe('ricerca per indirizzo', () => {
  it('trova la pagina o niente', () => {
    const pages = eligibleSportPages(sports, [['football'], ['football']]);
    assert.equal(findSportPage(pages, 'calcio')?.key, 'football');
    assert.equal(findSportPage(pages, 'pallavolo'), null);
  });
});
