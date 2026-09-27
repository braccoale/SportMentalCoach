/**
 * Gli sport per cui c'è almeno un coach approvato, nell'ordine della
 * tassonomia.
 *
 * Serve alle pagine pubbliche che collegano l'elenco filtrato per sport
 * (`/coaches?sport=…`): un collegamento a un elenco vuoto è una pagina
 * sottile per un motore di ricerca e una delusione per chi clicca. Modulo
 * puro: le due liste arrivano da chi chiama.
 */
export type SportItem = { key: string; label: string };

export function sportsCoveredByCoaches(
  sports: readonly SportItem[],
  coaches: readonly { categories: readonly string[] | null }[]
): SportItem[] {
  const covered = new Set(coaches.flatMap((coach) => coach.categories ?? []));
  return sports.filter((sport) => covered.has(sport.key));
}
