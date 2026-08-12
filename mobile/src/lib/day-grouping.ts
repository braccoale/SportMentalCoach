/**
 * A che giorno appartiene una sessione, e come si chiama quel giorno.
 *
 * Sta in un modulo a parte perché è l'unico pezzo dell'elenco che si può
 * sbagliare in silenzio: i confini fra ieri, oggi e domani dipendono dal fuso,
 * e una sessione delle 23:30 può finire nel giorno sbagliato senza che nessuno
 * se ne accorga guardando lo schermo. Qui non si importa React Native, quindi
 * si verifica con `node --test` senza un dispositivo.
 *
 * Il fuso è fissato a Roma di proposito: gli orari delle sessioni sono decisi
 * in Italia, e un atleta in trasferta non deve vedere la propria sessione
 * spostarsi di giorno perché il telefono ha cambiato fuso.
 */
const ZONE = 'Europe/Rome';

/** Chiave stabile e ordinabile del giorno: `2026-08-12`. */
export function dayKey(iso: string | null): string {
  if (!iso) return 'senza-data';
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZONE }).format(
    new Date(iso)
  );
}

/** «Oggi», «Domani», o «giovedì 14 agosto». */
export function dayTitle(iso: string | null, now: Date = new Date()): string {
  if (!iso) return 'Senza orario';
  const key = dayKey(iso);
  if (key === dayKey(now.toISOString())) return 'Oggi';
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  if (key === dayKey(tomorrow.toISOString())) return 'Domani';
  return new Intl.DateTimeFormat('it-IT', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: ZONE,
  }).format(new Date(iso));
}

/** Solo l'ora: la data la porta l'intestazione del giorno. */
export function timeLabel(iso: string | null): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('it-IT', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: ZONE,
  }).format(new Date(iso));
}

/**
 * «Fra 12 minuti», quando l'attesa è breve abbastanza da contare.
 *
 * Un orario dice *quando*; un conto alla rovescia dice *quanto manca*, che è
 * la domanda vera di chi apre l'app poco prima di una sessione. Oltre le due
 * ore la sottrazione non aiuta più e si torna all'orario.
 */
export function countdownLabel(iso: string | null, now: number): string | null {
  if (!iso) return null;
  const minutes = Math.round((new Date(iso).getTime() - now) / 60_000);
  if (minutes > 120) return null;
  if (minutes > 1) return `fra ${minutes} minuti`;
  if (minutes >= 0) return 'sta per iniziare';
  if (minutes > -90) return 'in corso';
  return null;
}
