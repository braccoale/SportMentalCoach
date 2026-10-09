/**
 * La traccia consigliata per il video di presentazione del coach: tre passaggi
 * per circa un minuto, e qualche consiglio pratico. È un aiuto, non un obbligo:
 * il coach dice ciò che vuole e il video può durare fino al tetto di
 * `coach-video-upload`.
 *
 * Modulo puro: lo leggono il componente del video (profilo e wizard) e i test.
 */

export type VideoGuideStep = {
  n: number;
  title: string;
  /** Quanto, a grandi linee, ci si dovrebbe fermare su questo passaggio. */
  seconds: number;
  hint: string;
};

export const VIDEO_GUIDE_STEPS: VideoGuideStep[] = [
  {
    n: 1,
    title: 'Chi sei e quali atleti segui',
    seconds: 15,
    hint: 'Il tuo nome, di cosa ti occupi e con che atleti lavori (sport e livello).',
  },
  {
    n: 2,
    title: 'Come aiuti gli atleti',
    seconds: 30,
    hint: 'Il tuo metodo in parole semplici: su quali difficoltà lavori e come si svolge una seduta.',
  },
  {
    n: 3,
    title: 'Perché scegliere te',
    seconds: 15,
    hint: 'Ciò che ti distingue, e un invito a prenotare la prima seduta.',
  },
];

export const VIDEO_GUIDE_TOTAL_SECONDS = VIDEO_GUIDE_STEPS.reduce((sum, s) => sum + s.seconds, 0);

export const VIDEO_GUIDE_TIPS: string[] = [
  'Un minuto basta: parla come faresti con un atleta, senza leggere.',
  'Luce davanti a te (una finestra va benissimo), mai alle spalle.',
  'Fotocamera all’altezza degli occhi e sfondo ordinato.',
  'Un posto silenzioso: l’audio conta più dell’immagine.',
];

/**
 * Il passaggio in corso dopo `elapsedSec` secondi di registrazione, per
 * evidenziarlo mentre si parla. Oltre la traccia resta l’ultimo.
 */
export function activeGuideStep(elapsedSec: number): number {
  if (!Number.isFinite(elapsedSec) || elapsedSec < 0) return 1;
  let end = 0;
  for (const step of VIDEO_GUIDE_STEPS) {
    end += step.seconds;
    if (elapsedSec < end) return step.n;
  }
  return VIDEO_GUIDE_STEPS[VIDEO_GUIDE_STEPS.length - 1].n;
}
