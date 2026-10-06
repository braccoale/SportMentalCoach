import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  faqMatches,
  filterFaqs,
  normalizeForSearch,
  searchTerms,
} from './faq-search';

const faq = {
  q: 'Come vengo pagato per le sedute?',
  a: 'Il pagamento avviene tramite carta e arriva direttamente a te.',
  link: { label: 'Vedi come funziona' },
};

describe('normalizeForSearch', () => {
  it('toglie accenti e maiuscole', () => {
    assert.equal(normalizeForSearch('  Perché   È così? '), 'perche e cosi?');
  });
});

describe('searchTerms', () => {
  it('una ricerca troppo corta o vuota non filtra', () => {
    assert.deepEqual(searchTerms(''), []);
    assert.deepEqual(searchTerms('  '), []);
    assert.deepEqual(searchTerms('a'), []);
  });
  it('divide in parole', () => {
    assert.deepEqual(searchTerms('Pagato  carta'), ['pagato', 'carta']);
  });
});

describe('faqMatches', () => {
  it('senza ricerca vale tutto', () => {
    assert.equal(faqMatches('', faq), true);
    assert.equal(faqMatches('x', faq), true);
  });

  it('trova nella domanda, nella risposta e nel collegamento', () => {
    assert.equal(faqMatches('sedute', faq), true);
    assert.equal(faqMatches('carta', faq), true);
    assert.equal(faqMatches('funziona', faq), true);
  });

  it('ignora accenti e maiuscole, anche dalla parte di chi cerca', () => {
    assert.equal(faqMatches('PAGAMENTO', faq), true);
    assert.equal(faqMatches('pagàto', faq), true);
  });

  it('tutte le parole devono comparire, in qualunque ordine', () => {
    assert.equal(faqMatches('carta sedute', faq), true);
    assert.equal(faqMatches('carta bonifico', faq), false);
  });

  it('un testo che non c\'è non trova niente', () => {
    assert.equal(faqMatches('astronauta', faq), false);
  });
});

describe('filterFaqs', () => {
  it('tiene solo le domande che rispondono', () => {
    const other = { q: 'Posso annullare?', a: 'Sì, quando vuoi.' };
    assert.deepEqual(filterFaqs('annullare', [faq, other]), [other]);
    assert.deepEqual(filterFaqs('', [faq, other]), [faq, other]);
  });
});
