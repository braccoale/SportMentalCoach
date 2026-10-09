/**
 * Il genere dichiarato dell'atleta, usato per una cosa sola: scegliere
 * l'immagine in alto nella sua dashboard (`lib/core/athlete-hero`). Non entra
 * in nessuna regola di accesso, di prezzo o di abbinamento.
 *
 * Tre valori e basta, e «non specificare» è una risposta vera: chi la sceglie
 * vede un'immagine neutra, non una scelta fatta al suo posto. Il campo è
 * facoltativo ovunque lo si chieda, e un valore sconosciuto (un modulo
 * manomesso, una chiave vecchia) torna a `null` invece di essere salvato.
 *
 * Modulo puro, senza `server-only`: lo leggono anche i moduli di
 * registrazione nel browser.
 */
export const ATHLETE_GENDERS = ['male', 'female', 'undisclosed'] as const;
export type AthleteGender = (typeof ATHLETE_GENDERS)[number];

export const ATHLETE_GENDER_LABEL: Record<AthleteGender, string> = {
  male: 'Uomo',
  female: 'Donna',
  undisclosed: 'Preferisco non specificare',
};

/** Una stringa qualunque (da un modulo) in un valore ammesso, o `null`. */
export function normalizeGender(raw: unknown): AthleteGender | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim().toLowerCase();
  return (ATHLETE_GENDERS as readonly string[]).includes(value)
    ? (value as AthleteGender)
    : null;
}
