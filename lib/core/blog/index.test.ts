import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  findArticle,
  indexableArticles,
  parseInline,
  readingMinutes,
  sortArticles,
  tableOfContents,
  type BlogArticle,
} from './index';
import { BLOG_ARTICLES } from './articles';

function article(over: Partial<BlogArticle>): BlogArticle {
  return {
    slug: 'a',
    title: 'A',
    seoTitle: 'A',
    description: 'd',
    publishedAt: '2026-01-01',
    author: { name: 'X', role: 'Y', href: '/chi-siamo' },
    image: { src: '/x.webp', alt: 'x', og: '/og/x.jpg' },
    related: { href: '/atleti', label: 'Atleti' },
    tags: [],
    blocks: [],
    reviewed: true,
    ...over,
  };
}

test('sortArticles: il più recente prima', () => {
  const out = sortArticles([
    article({ slug: 'old', publishedAt: '2026-01-01' }),
    article({ slug: 'new', publishedAt: '2026-09-01' }),
  ]);
  assert.deepEqual(out.map((a) => a.slug), ['new', 'old']);
});

test('indexableArticles: un articolo non revisionato non si indicizza', () => {
  const out = indexableArticles([
    article({ slug: 'bozza', reviewed: false }),
    article({ slug: 'ok', reviewed: true }),
  ]);
  assert.deepEqual(out.map((a) => a.slug), ['ok']);
});

test('findArticle: null se lo slug non esiste', () => {
  assert.equal(findArticle([article({})], 'nope'), null);
});

test('readingMinutes: almeno un minuto, poi 200 parole al minuto', () => {
  assert.equal(readingMinutes(article({ blocks: [] })), 1);
  const words = Array.from({ length: 401 }, () => 'parola').join(' ');
  assert.equal(readingMinutes(article({ blocks: [{ type: 'p', text: words }] })), 3);
});

test('tableOfContents: solo gli H2, con il loro id', () => {
  const toc = tableOfContents(
    article({
      blocks: [
        { type: 'h2', text: 'Uno', id: 'uno' },
        { type: 'p', text: 'x' },
        { type: 'h3', text: 'no' },
      ],
    })
  );
  assert.deepEqual(toc, [{ id: 'uno', text: 'Uno' }]);
});

test('parseInline: solo link interni diventano link', () => {
  assert.deepEqual(parseInline('vai [qui](/atleti) ora'), [
    { text: 'vai ' },
    { text: 'qui', href: '/atleti' },
    { text: ' ora' },
  ]);
  // Un link esterno resta testo.
  assert.deepEqual(parseInline('[x](https://esempio.it)'), [{ text: '[x](https://esempio.it)' }]);
});

test('gli articoli pubblicati hanno slug unici, id dei titoli unici e link interni validi', () => {
  const slugs = BLOG_ARTICLES.map((a) => a.slug);
  assert.equal(new Set(slugs).size, slugs.length);
  for (const a of BLOG_ARTICLES) {
    const ids = tableOfContents(a).map((t) => t.id);
    assert.equal(new Set(ids).size, ids.length, `${a.slug}: id dei titoli duplicati`);
    assert.ok(a.seoTitle.length <= 60, `${a.slug}: seoTitle oltre 60 caratteri`);
    assert.ok(a.description.length <= 160, `${a.slug}: description oltre 160 caratteri`);
    assert.match(a.publishedAt, /^\d{4}-\d{2}-\d{2}$/);
  }
});
