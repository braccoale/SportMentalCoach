/**
 * «Progresso complessivo»: l'andamento del percorso, una seduta alla volta.
 *
 * Il punto delicato di questo riquadro non è il disegno, è che cosa la linea
 * dichiara di misurare.
 *
 * Il Compass stima fino a sei indicatori per seduta, su scala 1–5 e sempre
 * ancorati a una frase. Una media fra indicatori diversi non è un «punteggio
 * psicologico» e non va presentata come tale: è il livello medio degli
 * indicatori *osservati in quella seduta*. Per questo il modulo porta con sé
 * quanti indicatori ha usato per ogni punto — senza quel numero la linea
 * prometterebbe una precisione che non ha.
 *
 * E per la stessa ragione, sotto tre punti non si disegna niente: due sedute
 * sono un segmento, non una tendenza. È la stessa soglia di `metric-trend.ts`,
 * e vale qui per lo stesso motivo.
 */

import { withReturnTo } from './return-to';
import type { MentalJourneyEntry } from './mental-journey';

export const MIN_PROGRESS_POINTS = 3;

/** La scala del Compass: 1 è il minimo osservabile, 5 il massimo. */
export const PROGRESS_SCALE_MIN = 1;
export const PROGRESS_SCALE_MAX = 5;

export type ProgressPoint = {
  sessionId: number;
  sessionDate: string | null;
  /** Media degli indicatori osservati, sulla scala 1–5. */
  value: number;
  /** Quanti indicatori l'hanno prodotta: 1 su 6 non è come 6 su 6. */
  metricCount: number;
  href: string;
};

export type JourneyProgress = {
  points: ProgressPoint[];
  /** Coordinate `0..100` pronte per un `polyline` SVG, asse y già invertito. */
  polyline: string;
  /** Lo stesso tracciato chiuso in basso, per l'area sotto la linea. */
  areaPath: string;
  /** Il minimo numero di indicatori dietro un punto: la fiducia più debole. */
  weakestMetricCount: number;
};

/**
 * `null` quando non c'è abbastanza per disegnare una linea onesta: meno di tre
 * sedute con almeno un indicatore. Il riquadro mostra allora il suo stato
 * vuoto invece di una linea fra due punti.
 */
export function buildJourneyProgress(
  timeline: readonly MentalJourneyEntry[]
): JourneyProgress | null {
  const points: ProgressPoint[] = [];

  for (const entry of [...timeline].sort(byDateAscending)) {
    // Solo materiale validato: un andamento costruito su stime che nessuno ha
    // ancora letto sarebbe una tendenza su una bozza.
    if (!entry.isApproved) continue;
    const metrics = entry.metrics ?? [];
    if (metrics.length === 0) continue;
    const total = metrics.reduce((sum, metric) => sum + metric.value, 0);
    points.push({
      sessionId: entry.sessionId,
      sessionDate: entry.sessionDate,
      value: total / metrics.length,
      metricCount: metrics.length,
      href: `${entry.compassHref}#session-compass`,
    });
  }

  if (points.length < MIN_PROGRESS_POINTS) return null;

  const span = PROGRESS_SCALE_MAX - PROGRESS_SCALE_MIN;
  const step = 100 / (points.length - 1);
  const coords = points.map((point, index) => {
    const x = index * step;
    // L'asse verticale dell'SVG cresce verso il basso: 5 deve stare in alto.
    const y = 100 - ((point.value - PROGRESS_SCALE_MIN) / span) * 100;
    return { x, y };
  });

  const polyline = coords
    .map(({ x, y }) => `${x.toFixed(1)},${y.toFixed(1)}`)
    .join(' ');

  return {
    points,
    polyline,
    areaPath: `M0,100 L${polyline.split(' ').join(' L')} L100,100 Z`,
    weakestMetricCount: Math.min(...points.map((point) => point.metricCount)),
  };
}

function byDateAscending(
  left: MentalJourneyEntry,
  right: MentalJourneyEntry
): number {
  const a = left.sessionDate ? Date.parse(left.sessionDate) : Number.MAX_SAFE_INTEGER;
  const b = right.sessionDate ? Date.parse(right.sessionDate) : Number.MAX_SAFE_INTEGER;
  return a - b;
}

/**
 * L'insight del percorso, preso da ciò che il Compass ha già scritto.
 *
 * `throughLine` è il filo che ogni riepilogo traccia fra la sua seduta e le
 * precedenti: è già un pensiero sul percorso, non sulla singola seduta, ed è
 * già stato approvato da un coach. Usarlo costa zero chiamate a un modello e
 * non introduce un secondo testo generato che nessuno ha validato.
 */
export type JourneyInsight = {
  text: string;
  sessionId: number;
  sessionDate: string | null;
  href: string;
};

export function latestJourneyInsight(
  timeline: readonly MentalJourneyEntry[],
  /** Dove riportare chi apre la seduta da qui. */
  backTo: string | null = null
): JourneyInsight | null {
  for (const entry of [...timeline].sort(byDateAscending).reverse()) {
    if (!entry.isApproved) continue;
    const text = entry.throughLine?.trim();
    if (text) {
      return {
        text,
        sessionId: entry.sessionId,
        sessionDate: entry.sessionDate,
        href: withReturnTo(`${entry.compassHref}#session-compass`, backTo),
      };
    }
  }
  return null;
}
