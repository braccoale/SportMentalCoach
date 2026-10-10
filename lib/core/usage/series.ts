/**
 * Le serie per giorno e i confronti della pagina «Utilizzo»: giorni senza dati
 * riempiti a zero, tendenza fra due periodi, percentuali del percorso.
 *
 * Modulo puro, senza `server-only` e senza `Intl` per i nomi dei mesi: i
 * formati con `Intl` cambiano fra il computer e i runner con ICU ridotta, e
 * una data nei grafici non deve dipendere da dove gira il codice.
 */

const MONTHS = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'] as const;

/** Oggi a Roma, `YYYY-MM-DD`: è così che chi guarda la pagina ragiona. */
export function romeToday(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Rome',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Gli ultimi `count` giorni, dal più vecchio a `endDay` compreso. */
export function lastDays(count: number, endDay: string): string[] {
  const [y, m, d] = endDay.split('-').map(Number);
  const end = Date.UTC(y, m - 1, d);
  return Array.from({ length: count }, (_, i) => new Date(end - (count - 1 - i) * 86_400_000).toISOString().slice(0, 10));
}

/** «9 ott»: l'etichetta corta di un giorno `YYYY-MM-DD`. */
export function shortDay(day: string): string {
  const [, m, d] = day.split('-').map(Number);
  return `${d} ${MONTHS[m - 1] ?? ''}`.trim();
}

/** Una serie continua: un punto per ogni giorno, con zero dove non c'è niente. */
export function fillSeries<K extends string>(
  rows: ({ day: string } & Record<K, number>)[],
  days: string[],
  keys: K[]
): ({ day: string } & Record<K, number>)[] {
  const byDay = new Map(rows.map((r) => [r.day, r]));
  return days.map((day) => {
    const found = byDay.get(day);
    const point = { day } as { day: string } & Record<K, number>;
    for (const key of keys) point[key] = (found?.[key] ?? 0) as ({ day: string } & Record<K, number>)[K];
    return point;
  });
}

export type Trend = { current: number; previous: number; percent: number | null };

/**
 * Gli ultimi `window` giorni contro i `window` precedenti. Con zero prima non
 * c'è una percentuale da dire (`null`): «+100%» da zero sarebbe un numero vero
 * e senza significato.
 */
export function trend(values: number[], window = 7): Trend {
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  const current = sum(values.slice(-window));
  const previous = sum(values.slice(-window * 2, -window));
  return {
    current,
    previous,
    percent: previous > 0 ? Math.round(((current - previous) / previous) * 100) : null,
  };
}

export type FunnelRow = {
  event: string;
  users: number;
  /** Quanti, di quelli del passo prima, sono arrivati qui (%); `null` per il primo passo. */
  fromPrevious: number | null;
  /** Quanti, di quelli del primo passo, sono arrivati qui (%). */
  fromFirst: number | null;
};

/** Le percentuali del percorso. Un passo senza persone nel passo prima non ha percentuale. */
export function funnelRates(steps: { event: string; users: number }[]): FunnelRow[] {
  const first = steps[0]?.users ?? 0;
  const pct = (a: number, b: number) => (b > 0 ? Math.min(100, Math.round((a / b) * 100)) : null);
  return steps.map((step, i) => ({
    event: step.event,
    users: step.users,
    fromPrevious: i === 0 ? null : pct(step.users, steps[i - 1].users),
    fromFirst: i === 0 ? null : pct(step.users, first),
  }));
}

/**
 * Dove cade un valore sulla scala di un indicatore, da 0 a 100: le tre fasce
 * (buono, da migliorare, scarso) occupano la parte della barra che le soglie
 * dicono, e oltre la soglia «scarso» ancora metà della sua ampiezza.
 */
export function gaugePosition(value: number, thresholds: [number, number]): number {
  const [good, poor] = thresholds;
  const max = poor * 1.5;
  return Math.max(0, Math.min(100, (value / max) * 100));
}

/** Le larghezze (%) delle tre fasce della barra, coerenti con `gaugePosition`. */
export function gaugeZones(thresholds: [number, number]): [number, number, number] {
  const [good, poor] = thresholds;
  const max = poor * 1.5;
  const a = (good / max) * 100;
  const b = ((poor - good) / max) * 100;
  return [a, b, 100 - a - b];
}
