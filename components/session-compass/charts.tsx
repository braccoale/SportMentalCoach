'use client';

import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { MentalJourney } from '@/lib/core/ai-session-notes/mental-journey';
import type {
  EmotionalTrendPoint,
  SessionCompassReport,
  SessionMetric,
  SessionMetricKey,
} from '@/lib/core/ai-session-notes/session-compass-contract';
import { METRIC_META, buildMetricTrendNarrative, metricValueLabel } from './metric-model';

const EMOTION_LABEL: Record<number, string> = {
  [-2]: 'Tensione forte',
  [-1]: 'Tensione',
  0: 'Neutro',
  1: 'Risorsa',
  2: 'Slancio',
};

function formatShortDate(value: string | null): string {
  if (!value) return 'Senza data';
  return new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: 'short' }).format(new Date(value));
}

export function SessionMetricsChart({
  metrics,
  onOpenEvidence,
}: {
  metrics: readonly SessionMetric[];
  onOpenEvidence: (segmentId: number) => void;
}) {
  if (!metrics.length) return null;
  const data = metrics.map((metric) => ({
    key: metric.key,
    label: METRIC_META[metric.key].shortLabel,
    value: metric.value,
    confidence: metric.confidence,
    color: METRIC_META[metric.key].color,
  }));
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-6" aria-labelledby="session-metrics-title">
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-violet-600">Lettura strutturata</p>
      <div className="mt-1 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 id="session-metrics-title" className="text-base font-bold text-gray-950">Metriche della sessione</h3>
          <p className="mt-1 text-sm leading-6 text-gray-600">Stime AI operative su scala 1–5, sostenute da passaggi espliciti della conversazione.</p>
        </div>
        <span className="text-xs font-semibold text-gray-500">Non è una valutazione clinica</span>
      </div>
      <div className="mt-5 h-64" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 20, bottom: 4, left: 12 }}>
            <CartesianGrid stroke="#e5e7eb" horizontal={false} />
            <XAxis type="number" domain={[0, 5]} ticks={[1, 2, 3, 4, 5]} allowDecimals={false} />
            <YAxis type="category" dataKey="label" width={108} tick={{ fontSize: 12, fill: '#4b5563' }} />
            <Tooltip cursor={{ fill: '#f9fafb' }} formatter={(value) => [`${value}/5`, 'Stima AI']} />
            <Bar dataKey="value" radius={[0, 6, 6, 0]} isAnimationActive={false}>
              {data.map((item) => <Cell key={item.key} fill={item.color} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {metrics.map((metric) => (
          <li key={metric.id}>
            <button
              type="button"
              className="flex min-h-14 w-full items-center justify-between gap-3 rounded-xl border border-gray-200 px-3 text-left text-sm transition hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
              onClick={() => onOpenEvidence(metric.evidence.transcriptSegmentId)}
            >
              <span><span className="block font-semibold text-gray-900">{METRIC_META[metric.key].label}</span><span className="block text-xs text-gray-500">Confidenza {confidenceLabel(metric.confidence)}</span></span>
              <span className="text-right"><span className="block font-bold text-gray-950">{metric.value}/5</span><span className="block text-xs text-gray-500">{metricValueLabel(metric.value)}</span></span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function EmotionalTrendChart({
  points,
  onOpenEvidence,
}: {
  points: readonly EmotionalTrendPoint[];
  onOpenEvidence: (segmentId: number) => void;
}) {
  if (points.length < 2) return null;
  const data = points.map((point) => ({
    id: point.id,
    minute: point.evidence.minute,
    value: point.value,
    label: point.label,
    transcriptSegmentId: point.evidence.transcriptSegmentId,
  }));
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-6" aria-labelledby="emotion-trend-title">
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-violet-600">Durante la conversazione</p>
      <h3 id="emotion-trend-title" className="mt-1 text-base font-bold text-gray-950">Andamento emotivo stimato dall’AI</h3>
      <p className="mt-1 text-sm leading-6 text-gray-600">Rappresenta segnali riferiti nella conversazione, non uno stato psicologico misurato.</p>
      <div className="mt-5 h-64" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 10, right: 20, bottom: 4, left: 6 }}>
            <CartesianGrid stroke="#e5e7eb" vertical={false} />
            <XAxis dataKey="minute" tickFormatter={(value) => `${value}’`} tick={{ fontSize: 12 }} />
            <YAxis domain={[-2, 2]} ticks={[-2, -1, 0, 1, 2]} width={78} tickFormatter={(value) => EMOTION_LABEL[value] ?? String(value)} tick={{ fontSize: 10 }} />
            <Tooltip labelFormatter={(value) => `Minuto ${value}`} formatter={(value, _name, item) => [item.payload.label, EMOTION_LABEL[Number(value)] ?? 'Segnale']} />
            <Line type="monotone" dataKey="value" stroke="#7c3aed" strokeWidth={3} dot={{ r: 5, fill: '#7c3aed' }} activeDot={{ r: 7 }} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <ol className="mt-4 grid gap-2 sm:grid-cols-2">
        {points.map((point) => (
          <li key={point.id}>
            <button
              type="button"
              className="flex min-h-14 w-full items-start gap-3 rounded-xl border border-gray-200 p-3 text-left text-sm hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
              onClick={() => onOpenEvidence(point.evidence.transcriptSegmentId)}
            >
              <span className="shrink-0 font-bold text-violet-700">min {point.evidence.minute}</span>
              <span><span className="block font-semibold text-gray-900">{EMOTION_LABEL[point.value]}</span><span className="block leading-5 text-gray-600">{point.label}</span></span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function AthleteProgressCharts({
  journey,
  report,
  currentSessionId,
  currentSessionDate,
}: {
  journey: MentalJourney | null;
  report: SessionCompassReport;
  currentSessionId: number;
  currentSessionDate: string | null;
}) {
  const sessions = useMemo(() => {
    const historical = (journey?.timeline ?? [])
      .filter((entry) => entry.sessionId !== currentSessionId)
      .map((entry) => ({ id: entry.sessionId, date: entry.sessionDate, metrics: entry.metrics ?? [] }));
    return [...historical, {
      id: currentSessionId,
      date: currentSessionDate,
      metrics: report.sessionOverview.metrics ?? [],
    }].sort((left, right) => Date.parse(left.date ?? '') - Date.parse(right.date ?? ''));
  }, [currentSessionDate, currentSessionId, journey?.timeline, report.sessionOverview.metrics]);
  const availableKeys = useMemo(() => [...new Set(sessions.flatMap((session) => session.metrics.map((metric) => metric.key)))], [sessions]);
  const [selectedKeys, setSelectedKeys] = useState<SessionMetricKey[]>(() => availableKeys.slice(0, 4));
  const effectiveKeys = selectedKeys.filter((key) => availableKeys.includes(key));
  const visibleKeys = effectiveKeys.length ? effectiveKeys : availableKeys.slice(0, 4);
  const data: Array<{ date: string } & Partial<Record<SessionMetricKey, number>>> = sessions.map((session) => {
    const values = Object.fromEntries(
      session.metrics.map((metric) => [metric.key, metric.value])
    ) as Partial<Record<SessionMetricKey, number>>;
    return { date: formatShortDate(session.date), ...values };
  });
  const trendNarrative = buildMetricTrendNarrative(sessions);

  if (!availableKeys.length) {
    return <ThemeFrequencyChart journey={journey} />;
  }

  function toggle(key: SessionMetricKey) {
    setSelectedKeys((current) => current.includes(key)
      ? current.filter((item) => item !== key)
      : current.length >= 4 ? [...current.slice(1), key] : [...current, key]);
  }

  return (
    <section className="min-w-0 max-w-full overflow-hidden rounded-2xl border border-gray-200 bg-white p-5 sm:p-6" aria-labelledby="progress-chart-title">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-violet-600">Evoluzione nel tempo</p>
          <h3 id="progress-chart-title" className="mt-1 text-base font-bold text-gray-950">Metriche nei report approvati</h3>
          <p className="mt-1 text-sm leading-6 text-gray-600">Il grafico usa solo sessioni che contengono una stima strutturata con evidenza.</p>
        </div>
        <div className="flex flex-wrap gap-2" aria-label="Metriche mostrate nel grafico">
          {availableKeys.map((key) => {
            const active = visibleKeys.includes(key);
            return (
              <button
                key={key}
                type="button"
                aria-pressed={active}
                className={`min-h-10 rounded-full border px-3 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 ${active ? 'border-violet-300 bg-violet-50 text-violet-800' : 'border-gray-200 bg-white text-gray-600'}`}
                onClick={() => toggle(key)}
              >
                {METRIC_META[key].shortLabel}
              </button>
            );
          })}
        </div>
      </div>
      <div className="mt-5 h-80" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 18, bottom: 8, left: 0 }}>
            <CartesianGrid stroke="#e5e7eb" vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} />
            <YAxis domain={[1, 5]} ticks={[1, 2, 3, 4, 5]} allowDecimals={false} width={30} />
            <Tooltip formatter={(value, name) => [`${value}/5`, METRIC_META[name as SessionMetricKey]?.label ?? name]} />
            <Legend formatter={(value) => METRIC_META[value as SessionMetricKey]?.label ?? value} />
            {visibleKeys.map((key) => (
              <Line key={key} connectNulls={false} type="monotone" dataKey={key} stroke={METRIC_META[key].color} strokeWidth={2.5} dot={{ r: 4 }} activeDot={{ r: 6 }} isAnimationActive={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[34rem] text-sm">
          <caption className="sr-only">Valori delle metriche per sessione</caption>
          <thead><tr className="text-left text-xs text-gray-500"><th className="py-2">Sessione</th>{visibleKeys.map((key) => <th key={key} className="px-2 py-2">{METRIC_META[key].shortLabel}</th>)}</tr></thead>
          <tbody>{data.map((row, index) => <tr key={`${row.date}-${index}`} className="border-t border-gray-100"><th className="py-2 font-semibold text-gray-800">{row.date}</th>{visibleKeys.map((key) => <td key={key} className="px-2 py-2 text-gray-600">{typeof row[key] === 'number' ? `${row[key]}/5` : '—'}</td>)}</tr>)}</tbody>
        </table>
      </div>
      {trendNarrative ? (
        <p className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50/60 p-3 text-sm leading-6 text-emerald-950">
          {trendNarrative}
        </p>
      ) : null}
      <p className="mt-4 rounded-xl border border-violet-100 bg-violet-50/60 p-3 text-xs leading-5 text-violet-900">Stime AI non cliniche: confrontale con il contesto e con il tuo giudizio professionale.</p>
    </section>
  );
}

function ThemeFrequencyChart({ journey }: { journey: MentalJourney | null }) {
  const data = (journey?.recurringThemes ?? []).slice(0, 6).map((theme) => ({ name: theme.label, sessions: theme.occurrences }));
  if (!data.length) {
    return (
      <section className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-6">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-violet-600">Evoluzione nel tempo</p>
        <h3 className="mt-1 text-base font-bold text-gray-950">Grafici non ancora disponibili</h3>
        <p className="mt-3 rounded-xl border border-dashed border-gray-300 bg-gray-50 p-4 text-sm leading-6 text-gray-600">Servono almeno due report approvati con metriche o un tema ricorrente documentato. Puoi rigenerare le sessioni passate per aggiungere le nuove metriche.</p>
      </section>
    );
  }
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-6" aria-labelledby="theme-frequency-title">
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-violet-600">Dati storici già disponibili</p>
      <h3 id="theme-frequency-title" className="mt-1 text-base font-bold text-gray-950">Frequenza dei temi ricorrenti</h3>
      <p className="mt-1 text-sm leading-6 text-gray-600">In attesa delle metriche strutturate, il grafico mostra conteggi reali nei report approvati.</p>
      <div className="mt-5 h-64" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 20, bottom: 4, left: 18 }}>
            <CartesianGrid stroke="#e5e7eb" horizontal={false} />
            <XAxis type="number" allowDecimals={false} />
            <YAxis type="category" dataKey="name" width={118} tick={{ fontSize: 11 }} />
            <Tooltip formatter={(value) => [value, 'Sessioni']} />
            <Bar dataKey="sessions" fill="#7c3aed" radius={[0, 6, 6, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <ul className="sr-only">{data.map((item) => <li key={item.name}>{item.name}: {item.sessions} sessioni</li>)}</ul>
    </section>
  );
}

function confidenceLabel(value: SessionMetric['confidence']): string {
  if (value === 'high') return 'alta';
  if (value === 'medium') return 'media';
  return 'bassa';
}
