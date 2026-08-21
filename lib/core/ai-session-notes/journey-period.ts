/**
 * La finestra temporale del percorso.
 *
 * Un percorso di due anni non si legge tutto insieme: «com'è andata negli
 * ultimi tre mesi» è una domanda diversa da «dove siamo arrivati», e merita
 * una risposta diversa.
 *
 * Qui vive soltanto il vocabolario della finestra: quali periodi esistono,
 * come si chiamano, e da quale istante partono. Restringere il percorso è
 * un'altra cosa e sta in `mental-journey.ts`, accanto alle aggregazioni che
 * deve poter ricalcolare — questo modulo non importa nulla, così non può
 * chiudere un anello con quello.
 */

export const JOURNEY_PERIODS = ['tutto', '3m', '6m', '12m'] as const;
export type JourneyPeriod = (typeof JOURNEY_PERIODS)[number];

/** Il percorso intero: è la domanda con cui si apre la scheda. */
export const DEFAULT_JOURNEY_PERIOD: JourneyPeriod = 'tutto';

export const JOURNEY_PERIOD_LABELS: Record<JourneyPeriod, string> = {
  tutto: 'Tutto il percorso',
  '3m': 'Ultimi 3 mesi',
  '6m': 'Ultimi 6 mesi',
  '12m': 'Ultimo anno',
};

/** Come si legge la finestra dentro una frase: «Su 8 sedute negli ultimi 3 mesi». */
export const JOURNEY_PERIOD_PHRASES: Record<JourneyPeriod, string | null> = {
  tutto: null,
  '3m': 'negli ultimi 3 mesi',
  '6m': 'negli ultimi 6 mesi',
  '12m': "nell'ultimo anno",
};

const MONTHS_BACK: Record<Exclude<JourneyPeriod, 'tutto'>, number> = {
  '3m': 3,
  '6m': 6,
  '12m': 12,
};

/**
 * Un valore che non riconosciamo non è un errore da mostrare: è un parametro
 * nell'indirizzo, e chiunque può scriverci dentro qualsiasi cosa. Si torna al
 * percorso intero.
 */
export function parseJourneyPeriod(
  raw: string | string[] | undefined | null
): JourneyPeriod {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return JOURNEY_PERIODS.includes(value as JourneyPeriod)
    ? (value as JourneyPeriod)
    : DEFAULT_JOURNEY_PERIOD;
}

/**
 * Sottrae mesi restando dentro il mese di arrivo.
 *
 * Il 31 marzo meno un mese non è il 3 marzo — che è quello che farebbe
 * `setMonth` da solo, traboccando nel mese successivo. È il 28 febbraio: il
 * giorno si accorcia all'ultimo disponibile.
 */
function subtractMonths(from: Date, months: number): Date {
  const target = new Date(
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth() - months, 1)
  );
  const lastDayOfTarget = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)
  ).getUTCDate();
  target.setUTCDate(Math.min(from.getUTCDate(), lastDayOfTarget));
  target.setUTCHours(
    from.getUTCHours(),
    from.getUTCMinutes(),
    from.getUTCSeconds(),
    from.getUTCMilliseconds()
  );
  return target;
}

/** `null` significa «nessun limite»: il percorso intero. */
export function journeyPeriodSince(
  period: JourneyPeriod,
  now: Date
): Date | null {
  if (period === 'tutto') return null;
  return subtractMonths(now, MONTHS_BACK[period]);
}
