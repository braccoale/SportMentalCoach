/**
 * L'ordine dell'elenco dei coach quando conta anche la completezza del profilo.
 *
 * Oggi l'ordine di default (`activity`) guarda i minuti di coaching fatti e gli
 * atleti seguiti: un coach nuovo, anche con il profilo perfetto, finisce in
 * fondo perché non ha ancora sedute. Questo punteggio mescola due cose:
 *
 *  - l'**attività** (ore di coaching, atleti seguiti, valutazioni), che resta
 *    la base: un coach con molte sedute fatte e buone recensioni non deve
 *    essere scavalcato da un profilo solo ben compilato;
 *  - la **completezza** del profilo (`lib/core/coach-profile/completeness`).
 *
 * Il peso della completezza è un parametro di sistema (percentuale, 0–100),
 * modificabile dall'admin senza rilasciare codice: a 0 l'ordine torna quello
 * di sempre. Prudente di default: aiuta chi parte e fa da spareggio, non
 * ribalta chi lavora.
 *
 * Modulo puro.
 */

export const COMPLETENESS_WEIGHT_CONFIG_KEY = 'DISCOVERY_COMPLETENESS_WEIGHT';
export const DEFAULT_COMPLETENESS_WEIGHT = 20;

/** Un intero da 0 a 100; un valore non valido torna al predefinito. */
export function normalizeCompletenessWeight(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_COMPLETENESS_WEIGHT;
  }
  return Math.max(0, Math.min(100, Math.round(value)));
}

export type ActivityInput = {
  totalMinutes: number;
  athletesCount: number;
  ratingAverage: number | null;
  ratingCount: number;
};

/**
 * L'attività, da 0 a 100: fino a 60 punti dalle ore di coaching (si saturano a
 * 50 ore), fino a 25 dagli atleti seguiti (si saturano a 15), fino a 15 dalla
 * valutazione media, ma solo con almeno tre recensioni: una sola da cinque
 * stelle non basta a spostare l'ordine.
 */
export function activityScore(input: ActivityInput): number {
  const hours = Math.min(Math.max(input.totalMinutes, 0) / 60, 50);
  const athletes = Math.min(Math.max(input.athletesCount, 0), 15);
  const rating =
    input.ratingAverage != null && input.ratingCount >= 3
      ? Math.max(0, Math.min(input.ratingAverage, 5)) / 5
      : 0;
  return (hours / 50) * 60 + (athletes / 15) * 25 + rating * 15;
}

/** Il punteggio finale, da 0 a 100: `(1 - w) · attività + w · completezza`. */
export function discoveryRankScore(
  params: ActivityInput & { completeness: number },
  weightPercent: number
): number {
  const w = normalizeCompletenessWeight(weightPercent) / 100;
  const completeness = Math.max(0, Math.min(params.completeness, 100));
  return (1 - w) * activityScore(params) + w * completeness;
}
