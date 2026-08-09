/**
 * L'andamento di una metrica nel percorso.
 *
 * Modulo puro: la geometria della sparkline e il calcolo del delta sono
 * verificabili senza renderizzare nulla.
 *
 * Il delta è espresso in **punti sulla scala 1-5**, non in percentuale. Una
 * percentuale su una scala ordinale a cinque gradini è un numero che non
 * esiste: da 3 a 4 non è «+33%», è un gradino. Su un dato che per giunta è
 * una stima di un modello, la percentuale darebbe una precisione doppiamente
 * falsa.
 */

export type MetricTrendPoint = { sessionId: number; value: number };

export type MetricTrend = {
  /** Punti in ordine cronologico, incluso quello corrente. */
  values: number[];
  /** Differenza fra l'ultimo valore e il primo, in punti. */
  deltaPoints: number;
  direction: 'su' | 'giu' | 'stabile';
  /** Coordinate `0..100` pronte per un `polyline` SVG. */
  polyline: string;
};

/**
 * Sotto tre punti una linea non è una tendenza, è un segmento: non si
 * disegna. È la stessa soglia usata per il grafico grande.
 */
export const MIN_TREND_POINTS = 3;

export function buildMetricTrend(
  points: readonly MetricTrendPoint[]
): MetricTrend | null {
  const values = points.map((point) => point.value);
  if (values.length < MIN_TREND_POINTS) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  const step = 100 / (values.length - 1);

  const polyline = values
    .map((value, index) => {
      const x = index * step;
      // Una serie piatta finisce a metà altezza invece che sul bordo: senza
      // questo, "sempre 3 su 5" verrebbe disegnato come una linea a terra.
      const y = span === 0 ? 50 : 100 - ((value - min) / span) * 100;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  const deltaPoints = values[values.length - 1] - values[0];
  return {
    values,
    deltaPoints,
    direction: deltaPoints > 0 ? 'su' : deltaPoints < 0 ? 'giu' : 'stabile',
    polyline,
  };
}

/** «In crescita di 1 punto», «Stabile», «In calo di 2 punti». */
export function metricTrendLabel(trend: MetricTrend): string {
  const points = Math.abs(trend.deltaPoints);
  const unit = points === 1 ? 'punto' : 'punti';
  if (trend.direction === 'stabile') return 'Stabile nel percorso';
  return trend.direction === 'su'
    ? `In crescita di ${points} ${unit}`
    : `In calo di ${points} ${unit}`;
}
