/**
 * Il blog di KaiPai: articoli scritti come dati, non come pagine.
 *
 * Un articolo è un elenco di blocchi (paragrafi, titoli, elenchi, un riquadro
 * di attenzione) più i metadati che servono alla pagina, alla sitemap e ai
 * dati strutturati. Tenerli qui, puri, vuol dire che le regole — quali
 * articoli si indicizzano, in che ordine escono, quanto si legge — si
 * verificano senza browser.
 *
 * **La revisione è una regola, non una nota.** Un articolo nasce `reviewed:
 * false`: si vede sul sito (per poterlo far leggere a chi lo deve validare) ma
 * esce `noindex` e resta fuori dalla sitemap. Diventa indicizzabile solo
 * quando qualcuno lo segna revisionato. Su un tema che tocca il benessere di
 * ragazzi, un testo non validato non deve finire su Google per distrazione.
 */

export type BlogBlock =
  | { type: 'p'; text: string }
  | { type: 'h2'; text: string; id: string }
  | { type: 'h3'; text: string }
  | { type: 'list'; items: string[] }
  | { type: 'callout'; title: string; text: string };

export type BlogFaq = { q: string; a: string };

export type BlogArticle = {
  slug: string;
  title: string;
  /** Titolo della scheda del browser (≤ 60 caratteri, parola chiave in testa). */
  seoTitle: string;
  description: string;
  /** Data di pubblicazione, `YYYY-MM-DD`. */
  publishedAt: string;
  updatedAt?: string;
  author: { name: string; role: string; href: string };
  image: { src: string; alt: string; og: string };
  /** La pagina del sito a cui l'articolo porta chi lo legge. */
  related: { href: string; label: string };
  tags: string[];
  blocks: BlogBlock[];
  faq?: BlogFaq[];
  /** Validato da chi ne risponde (Francesco): solo allora si indicizza. */
  reviewed: boolean;
};

/** Dal più recente al più vecchio; a parità di data, per titolo. */
export function sortArticles(articles: readonly BlogArticle[]): BlogArticle[] {
  return [...articles].sort(
    (a, b) => b.publishedAt.localeCompare(a.publishedAt) || a.title.localeCompare(b.title, 'it')
  );
}

/** Quelli che possono stare in sitemap e nei risultati di ricerca. */
export function indexableArticles(articles: readonly BlogArticle[]): BlogArticle[] {
  return sortArticles(articles.filter((a) => a.reviewed));
}

export function findArticle(
  articles: readonly BlogArticle[],
  slug: string
): BlogArticle | null {
  return articles.find((a) => a.slug === slug) ?? null;
}

const WORDS_PER_MINUTE = 200;

/** Minuti di lettura, arrotondati per eccesso, mai meno di uno. */
export function readingMinutes(article: BlogArticle): number {
  const text = article.blocks
    .map((b) => {
      switch (b.type) {
        case 'list':
          return b.items.join(' ');
        case 'callout':
          return `${b.title} ${b.text}`;
        default:
          return b.text;
      }
    })
    .join(' ');
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / WORDS_PER_MINUTE));
}

/** I titoli H2 dell'articolo, per l'indice in cima. */
export function tableOfContents(article: BlogArticle): { id: string; text: string }[] {
  return article.blocks.flatMap((b) => (b.type === 'h2' ? [{ id: b.id, text: b.text }] : []));
}

/**
 * I link dentro il testo sono scritti `[testo](/percorso)`. Solo percorsi
 * interni: un articolo non deve poter mandare fuori dal sito per un refuso.
 */
export type InlinePart = { text: string; href?: string };

export function parseInline(text: string): InlinePart[] {
  const parts: InlinePart[] = [];
  const re = /\[([^\]]+)\]\((\/[^)\s]*)\)/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index! > last) parts.push({ text: text.slice(last, m.index) });
    parts.push({ text: m[1], href: m[2] });
    last = m.index! + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}
