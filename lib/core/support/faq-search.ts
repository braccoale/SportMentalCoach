/**
 * La ricerca nelle domande frequenti del Supporto.
 *
 * Regola unica e piccola: si ignorano maiuscole e accenti («perche» trova
 * «perché»), la ricerca si divide in parole, e una domanda risponde solo se
 * **tutte** le parole compaiono nella domanda, nella risposta o nel testo del
 * suo collegamento. Meno di due caratteri non filtrano niente: una lettera
 * sola farebbe sparire quasi tutto e non direbbe nulla a chi cerca.
 *
 * Modulo puro.
 */

export type SearchableFaq = {
  q: string;
  a: string;
  link?: { label: string } | null;
};

/** Minuscole, senza accenti, spazi ridotti: la forma in cui si confronta. */
export function normalizeForSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export const MIN_SEARCH_LENGTH = 2;

export function searchTerms(query: string): string[] {
  const normalized = normalizeForSearch(query);
  if (normalized.length < MIN_SEARCH_LENGTH) return [];
  return normalized.split(' ').filter(Boolean);
}

export function faqMatches(query: string, faq: SearchableFaq): boolean {
  const terms = searchTerms(query);
  if (terms.length === 0) return true;
  const haystack = normalizeForSearch(
    `${faq.q} ${faq.a} ${faq.link?.label ?? ''}`
  );
  return terms.every((term) => haystack.includes(term));
}

export function filterFaqs<T extends SearchableFaq>(query: string, faqs: readonly T[]): T[] {
  return faqs.filter((faq) => faqMatches(query, faq));
}
