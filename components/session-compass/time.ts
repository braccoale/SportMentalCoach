/**
 * Timestamp reale della timeline, senza arrotondarlo al solo minuto.
 *
 * Oltre l'ora compare il campo delle ore. Senza, una seduta di un'ora e due
 * minuti si leggeva «61:57», che non è sbagliato ma va decifrato: chi guarda
 * deve dividere per sessanta a mente per capire quanto è durata. Le sedute
 * vere di questo prodotto durano un'ora, quindi è il caso normale, non
 * l'eccezione.
 */
export function formatTranscriptTimestamp(startMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(startMs / 1_000));
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}
