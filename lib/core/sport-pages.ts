/**
 * Le pagine «Mental coach per lo sport X»: quali sport ne hanno una e come si
 * chiamano.
 *
 * La regola che le governa è una sola: una pagina esiste solo se c'è abbastanza
 * da mostrare. Con un solo coach una pagina per sport sarebbe la stessa pagina
 * ripetuta tredici volte con un nome diverso — esattamente ciò che i motori di
 * ricerca chiamano pagine «porta» e puniscono. Per questo la soglia è di due
 * coach approvati, e le pagine nascono da sole man mano che l'elenco cresce.
 *
 * Modulo puro, senza `server-only`: lo leggono la pagina, la sitemap e i test.
 */

/** Quanti coach approvati servono perché uno sport abbia la sua pagina. */
export const MIN_COACHES_FOR_SPORT_PAGE = 2;

/**
 * Lo sport con l'articolo, come si dice in italiano («il calcio», «la
 * pallavolo»): serve a scrivere «Mental coach per il calcio» senza errori di
 * grammatica. Uno sport che non è qui (e «altro», che non è uno sport) non ha
 * una pagina: meglio nessuna pagina che un titolo storpiato.
 */
export const SPORT_PHRASES: Record<string, string> = {
  football: 'il calcio',
  basketball: 'il basket',
  volleyball: 'la pallavolo',
  tennis: 'il tennis',
  swimming: 'il nuoto',
  athletics: 'l’atletica',
  cycling: 'il ciclismo',
  martial_arts: 'le arti marziali',
  golf: 'il golf',
  skiing: 'lo sci',
  rugby: 'il rugby',
  motorsport: 'gli sport motoristici',
  crossfit: 'il crossfit',
  curling: 'il curling',
};

/** L'indirizzo dello sport: l'etichetta in minuscolo, senza accenti né spazi («Arti marziali» → «arti-marziali»). */
export function sportSlug(label: string): string {
  return label
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export type SportPage = {
  key: string;
  label: string;
  slug: string;
  /** «il calcio», «la pallavolo». */
  phrase: string;
  coachCount: number;
};

/**
 * Gli sport che hanno una pagina: attivi, con la loro frase e con almeno
 * `MIN_COACHES_FOR_SPORT_PAGE` coach fra quelli dati (ogni voce è l'elenco
 * degli sport di un coach approvato).
 */
export function eligibleSportPages(
  sports: { key: string; label: string }[],
  coachCategories: (string[] | null)[]
): SportPage[] {
  const counts = new Map<string, number>();
  for (const list of coachCategories) {
    for (const key of new Set(list ?? [])) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return sports
    .filter((s) => SPORT_PHRASES[s.key] && (counts.get(s.key) ?? 0) >= MIN_COACHES_FOR_SPORT_PAGE)
    .map((s) => ({
      key: s.key,
      label: s.label,
      slug: sportSlug(s.label),
      phrase: SPORT_PHRASES[s.key],
      coachCount: counts.get(s.key) ?? 0,
    }));
}

/** La pagina di uno sport dal suo indirizzo, o `null` se non esiste (sport sconosciuto o con troppo pochi coach). */
export function findSportPage(pages: SportPage[], slug: string): SportPage | null {
  return pages.find((p) => p.slug === slug) ?? null;
}
