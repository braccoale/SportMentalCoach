import type {
  SessionMetric,
  SessionMetricKey,
} from '@/lib/core/ai-session-notes/session-compass-contract';

export const METRIC_META: Record<
  SessionMetricKey,
  { label: string; shortLabel: string; color: string; higherIsBetter: boolean }
> = {
  energy: { label: 'Energia', shortLabel: 'Energia', color: '#f59e0b', higherIsBetter: true },
  motivation: { label: 'Motivazione', shortLabel: 'Motivazione', color: '#ec4899', higherIsBetter: true },
  concentration: { label: 'Concentrazione', shortLabel: 'Focus', color: '#2563eb', higherIsBetter: true },
  emotional_management: { label: 'Gestione emotiva', shortLabel: 'Gestione emotiva', color: '#059669', higherIsBetter: true },
  confidence: { label: 'Fiducia', shortLabel: 'Fiducia', color: '#7c3aed', higherIsBetter: true },
  pre_competition_anxiety: { label: 'Ansia pre-gara', shortLabel: 'Ansia pre-gara', color: '#e11d48', higherIsBetter: false },
};

export type MetricDelta = {
  key: SessionMetricKey;
  label: string;
  current: number;
  previous: number;
  delta: number;
  direction: 'improved' | 'stable' | 'attention';
};

export function compareSessionMetrics(
  current: readonly SessionMetric[],
  previous: readonly { key: SessionMetricKey; value: number }[]
): MetricDelta[] {
  const previousByKey = new Map(previous.map((metric) => [metric.key, metric.value]));
  return current.flatMap((metric) => {
    const previousValue = previousByKey.get(metric.key);
    if (previousValue === undefined) return [];
    const delta = metric.value - previousValue;
    const favorableDelta = METRIC_META[metric.key].higherIsBetter ? delta : -delta;
    return [{
      key: metric.key,
      label: METRIC_META[metric.key].label,
      current: metric.value,
      previous: previousValue,
      delta,
      direction: favorableDelta >= 1 ? 'improved' : favorableDelta <= -1 ? 'attention' : 'stable',
    }];
  });
}

/**
 * Frase di confronto per una scala ordinale 1–5: mai percentuali, mai
 * variazioni continue. "Punto" è l'unica unità che la scala consente.
 */
export function metricDeltaSentence(delta: MetricDelta): string {
  if (delta.delta === 0) return `${delta.label}: stabile a ${delta.current}/5`;
  const points = Math.abs(delta.delta) === 1 ? '1 punto' : `${Math.abs(delta.delta)} punti`;
  const direction = delta.delta > 0 ? 'aumentata' : 'diminuita';
  return `${delta.label}: da ${delta.previous}/5 a ${delta.current}/5 · ${direction} di ${points}`;
}

export function metricValueLabel(value: number): string {
  if (value <= 1) return 'Molto basso';
  if (value === 2) return 'Basso';
  if (value === 3) return 'Intermedio';
  if (value === 4) return 'Alto';
  return 'Molto alto';
}

export function buildMetricTrendNarrative(
  sessions: readonly { metrics: readonly { key: SessionMetricKey; value: number }[] }[]
): string | null {
  const observations = (Object.keys(METRIC_META) as SessionMetricKey[]).flatMap((key) => {
    const values = sessions.flatMap((session) => {
      const metric = session.metrics.find((item) => item.key === key);
      return metric ? [metric.value] : [];
    });
    if (values.length < 2) return [];
    const delta = values.at(-1)! - values[0];
    const favorableDelta = METRIC_META[key].higherIsBetter ? delta : -delta;
    return [{ key, count: values.length, favorableDelta }];
  });
  if (!observations.length) return null;

  const moving = observations
    .filter((item) => Math.abs(item.favorableDelta) >= 1)
    .sort((left, right) => Math.abs(right.favorableDelta) - Math.abs(left.favorableDelta));
  const stable = observations.filter((item) => Math.abs(item.favorableDelta) < 1);
  const parts: string[] = moving.slice(0, 2).map((item) =>
    `${METRIC_META[item.key].label.toLocaleLowerCase('it')} ${item.favorableDelta > 0 ? 'in miglioramento' : 'da monitorare'}`
  );
  if (stable.length) {
    parts.push(`${stable.slice(0, 2).map((item) => METRIC_META[item.key].label.toLocaleLowerCase('it')).join(' e ')} ${stable.length === 1 ? 'stabile' : 'stabili'}`);
  }
  if (!parts.length) return null;
  const maxCount = Math.max(...observations.map((item) => item.count));
  return `Su ${maxCount} sessioni confrontabili: ${parts.join('; ')}. La lettura usa esclusivamente le stime con evidenza presenti nei report.`;
}
