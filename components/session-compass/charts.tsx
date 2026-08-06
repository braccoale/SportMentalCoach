'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  PolarAngleAxis,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { MentalJourney } from '@/lib/core/ai-session-notes/mental-journey';
import type {
  EmotionalTrendPoint,
  ConversationParticipation,
  ConversationTone,
  SessionCompassReport,
  SessionMetric,
  SessionMetricKey,
} from '@/lib/core/ai-session-notes/session-compass-contract';
import { METRIC_META, buildMetricTrendNarrative, metricValueLabel } from './metric-model';
import { formatTranscriptTimestamp } from './time';

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

const TONE_LABEL: Record<ConversationTone['key'], string> = {
  enthusiastic: 'Entusiasta',
  open: 'Aperto',
  reflective: 'Riflessivo',
  hesitant: 'Esitante',
  guarded: 'Cauto',
  frustrated: 'Frustrato',
  neutral: 'Neutro',
};

function formatTalkTime(milliseconds: number): string {
  const seconds = Math.round(milliseconds / 1000);
  if (seconds < 60) return `${seconds} sec`;
  return `${Math.floor(seconds / 60)} min`;
}

function evidenceLevel(value: SessionMetric['confidence']): string {
  if (value === 'high') return 'forte';
  if (value === 'medium') return 'moderata';
  return 'debole';
}

function evidenceOrigin(speaker: 'coach' | 'athlete'): string {
  return speaker === 'athlete' ? 'Dichiarazione atleta' : 'Passaggio del coach';
}

const MIN_EMOTIONAL_POINT_GAP_MS = 15_000;
const MIN_EMOTIONAL_TIMELINE_SPAN_MS = 60_000;

function hasReliableEmotionalDistribution(points: readonly EmotionalTrendPoint[]): boolean {
  if (points.length < 3) return false;
  const ordered = [...points].sort((left, right) => left.evidence.startMs - right.evidence.startMs);
  const timestamps = ordered.map((point) => point.evidence.startMs);
  if (new Set(timestamps).size < 3) return false;
  if (timestamps.at(-1)! - timestamps[0]! < MIN_EMOTIONAL_TIMELINE_SPAN_MS) return false;
  return timestamps.every((timestamp, index) => index === 0 || timestamp - timestamps[index - 1]! >= MIN_EMOTIONAL_POINT_GAP_MS);
}

function EmotionalPointTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload?: { timestamp: string; speaker: string; label: string; quote: string } }>;
}) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  return (
    <div className="max-w-72 rounded-lg border border-violet-200 bg-white p-3 text-sm shadow-lg">
      <p className="font-bold text-violet-800">{point.timestamp} · {point.speaker}</p>
      <p className="mt-1 font-semibold text-gray-900">{point.label}</p>
      <p className="mt-1 italic leading-5 text-gray-700">«{point.quote}»</p>
    </div>
  );
}

/**
 * La striscia sintetica riprende i gauge richiesti senza trasformare le
 * metriche in diagnosi. Ogni metrica AI resta apribile sulla sua evidenza.
 */
export function SessionMetricGauges({
  metrics,
  participation,
  tone,
  isApproved,
  onOpenEvidence,
}: {
  metrics: readonly SessionMetric[];
  participation: ConversationParticipation | null | undefined;
  tone: ConversationTone | null | undefined;
  isApproved: boolean;
  onOpenEvidence: (segmentId: number) => void;
}) {
  const [showAllMetrics, setShowAllMetrics] = useState(false);
  if (!metrics.length && !participation && !tone) return null;
  const visibleMetrics = showAllMetrics ? metrics : metrics.slice(0, 3);
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5" aria-label="Indicatori della sessione">
      <div className="max-w-3xl">
        <h3 className="text-lg font-bold text-gray-950">Segnali emersi dalla conversazione</h3>
        <p className="mt-1 text-sm leading-6 text-gray-600">Stime basate sul testo della trascrizione: non sono misure cliniche né autovalutazioni strutturate dell’atleta. Il coach le valida nel report.</p>
      </div>
      <div className="mt-4 grid gap-3 grid-cols-1 sm:grid-cols-3">
        {visibleMetrics.map((metric) => {
          const meta = METRIC_META[metric.key];
          return (
            <button
              key={metric.id}
              type="button"
              className="min-w-0 rounded-xl border border-gray-200 bg-gray-50/70 p-3 text-left transition hover:border-violet-300 hover:bg-violet-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
              onClick={() => onOpenEvidence(metric.evidence.transcriptSegmentId)}
              aria-label={`${meta.label}: ${metric.value} su 5. Vai all'evidenza nella trascrizione.`}
            >
              <p className="text-base font-semibold leading-6 text-gray-800">{meta.label}</p>
              <div className="relative mx-auto mt-2 h-20 w-20" aria-hidden="true">
                <ResponsiveContainer width="100%" height="100%">
                  <RadialBarChart
                    data={[{ value: metric.value * 20, fill: meta.color }]}
                    innerRadius="68%"
                    outerRadius="100%"
                    startAngle={90}
                    endAngle={-270}
                  >
                    <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
                    <RadialBar dataKey="value" background={{ fill: '#e5e7eb' }} cornerRadius={8} isAnimationActive={false} />
                  </RadialBarChart>
                </ResponsiveContainer>
                <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-gray-950">{metric.value}/5</span>
              </div>
              <p className="mt-1 text-center text-sm text-gray-600">{metricValueLabel(metric.value)}</p>
              <p className="mt-3 text-sm leading-5 text-gray-600">Evidenza {evidenceLevel(metric.confidence)} · {evidenceOrigin(metric.evidence.speaker)}</p>
              <p className="mt-1 text-sm font-semibold text-gray-700">{isApproved ? 'Validata nel report' : 'Da validare dal coach'}</p>
            </button>
          );
        })}
        {participation ? (
          <div className="min-w-0 rounded-xl border border-sky-100 bg-sky-50/60 p-3">
            <p className="truncate text-sm font-semibold text-sky-950">Parola atleta</p>
            <div className="relative mx-auto mt-2 h-20 w-20" aria-hidden="true">
              <ResponsiveContainer width="100%" height="100%">
                <RadialBarChart data={[{ value: participation.athleteSharePercent, fill: '#0ea5e9' }]} innerRadius="68%" outerRadius="100%" startAngle={90} endAngle={-270}>
                  <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
                  <RadialBar dataKey="value" background={{ fill: '#dbeafe' }} cornerRadius={8} isAnimationActive={false} />
                </RadialBarChart>
              </ResponsiveContainer>
              <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-sky-950">{participation.athleteSharePercent}%</span>
            </div>
            <p className="mt-1 text-center text-[11px] leading-4 text-sky-800">{formatTalkTime(participation.athleteTalkMs)} · {participation.athleteTurns} turni</p>
          </div>
        ) : null}
      </div>
      {metrics.length > 3 ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-4"
          aria-expanded={showAllMetrics}
          onClick={() => setShowAllMetrics((current) => !current)}
        >
          {showAllMetrics ? 'Mostra meno segnali' : `Vedi tutti i ${metrics.length} segnali`}
        </Button>
      ) : null}
      {participation || tone ? (
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {participation ? (
            <p className="rounded-xl border border-sky-100 bg-sky-50/50 p-3 text-xs leading-5 text-sky-950">
              <span className="font-semibold">Quota di parola trascritta.</span> Atleta {formatTalkTime(participation.athleteTalkMs)} in {participation.athleteTurns} turni; coach {formatTalkTime(participation.coachTalkMs)} in {participation.coachTurns} turni. Non misura da sola interesse, coinvolgimento o qualità della sessione.
            </p>
          ) : null}
          {tone ? (
            <button type="button" className="rounded-xl border border-violet-100 bg-violet-50/60 p-3 text-left text-xs leading-5 text-violet-950 transition hover:border-violet-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500" onClick={() => onOpenEvidence(tone.evidence.transcriptSegmentId)}>
              <span className="font-semibold">Tono nel testo: {TONE_LABEL[tone.key]}.</span> {tone.description} <span className="text-violet-700">Apri la citazione.</span>
              <span className="mt-1 block text-violet-800">Lettura delle parole, non dell'intonazione vocale.</span>
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
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
          <h3 id="session-metrics-title" className="text-base font-bold text-gray-950">Segnali emersi dalla conversazione</h3>
          <p className="mt-1 text-sm leading-6 text-gray-600">Stime AI su scala 1–5 basate sul testo: non sono misure cliniche né autovalutazioni strutturate e richiedono la validazione del coach.</p>
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
  const [showAllPoints, setShowAllPoints] = useState(false);
  if (!points.length) return null;
  const orderedPoints = [...points].sort((left, right) => left.evidence.startMs - right.evidence.startMs);
  const visiblePoints = showAllPoints ? orderedPoints : orderedPoints.slice(0, 3);
  const data = visiblePoints.map((point) => ({
    id: point.id,
    timestamp: formatTranscriptTimestamp(point.evidence.startMs),
    value: point.value,
    label: point.label,
    speaker: evidenceOrigin(point.evidence.speaker),
    quote: point.evidence.quote,
    transcriptSegmentId: point.evidence.transcriptSegmentId,
  }));
  if (!hasReliableEmotionalDistribution(visiblePoints)) {
    return (
      <section className="rounded-2xl border border-gray-200 bg-white p-6 sm:p-7" aria-labelledby="emotion-timeline-title">
        <p className="text-sm font-bold text-violet-700">Durante la conversazione</p>
        <h3 id="emotion-timeline-title" className="mt-1 text-xl font-bold text-gray-950">Segnali narrativi</h3>
        <p className="mt-2 text-base leading-7 text-gray-700">I dati non sono sufficienti o abbastanza distribuiti per un grafico affidabile. Mostriamo i passaggi documentati, non una misura psicologica.</p>
        <ol className="mt-5 space-y-3">
          {visiblePoints.map((point) => (
            <li key={point.id}>
              <button type="button" className="w-full rounded-xl border border-gray-200 bg-gray-50/70 p-4 text-left transition hover:border-violet-300 hover:bg-violet-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500" onClick={() => onOpenEvidence(point.evidence.transcriptSegmentId)}>
                <span className="text-sm font-bold text-violet-700">{formatTranscriptTimestamp(point.evidence.startMs)} · {evidenceOrigin(point.evidence.speaker)}</span>
                <span className="mt-1 block text-base font-semibold text-gray-950">{EMOTION_LABEL[point.value]}</span>
                <span className="mt-1 block text-base leading-7 text-gray-700">{point.label}</span>
                <span className="mt-2 block line-clamp-2 text-sm italic text-gray-600">«{point.evidence.quote}»</span>
              </button>
            </li>
          ))}
        </ol>
        {points.length > 3 ? (
          <Button type="button" variant="outline" size="sm" className="mt-4" aria-expanded={showAllPoints} onClick={() => setShowAllPoints((current) => !current)}>
            {showAllPoints ? 'Mostra meno' : 'Mostra tutti'}
          </Button>
        ) : null}
      </section>
    );
  }
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-6 sm:p-7" aria-labelledby="emotion-trend-title">
      <p className="text-sm font-bold text-violet-700">Durante la conversazione</p>
      <h3 id="emotion-trend-title" className="mt-1 text-xl font-bold text-gray-950">Andamento narrativo sostenuto da estratti</h3>
      <p id="emotion-trend-description" className="mt-2 text-base leading-7 text-gray-700">Punti reali della conversazione, non una curva né uno stato psicologico misurato. L’elenco accessibile riporta timestamp, speaker ed estratto per ogni punto.</p>
      <div className="mt-5 h-64" role="img" aria-label="Grafico dei segnali narrativi in punti discreti nel tempo" aria-describedby="emotion-trend-description emotion-trend-evidence">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 10, right: 20, bottom: 4, left: 6 }}>
            <CartesianGrid stroke="#e5e7eb" vertical={false} />
            <XAxis dataKey="timestamp" tick={{ fontSize: 12 }} />
            <YAxis domain={[-2, 2]} ticks={[-2, -1, 0, 1, 2]} width={78} tickFormatter={(value) => EMOTION_LABEL[value] ?? String(value)} tick={{ fontSize: 10 }} />
            <Tooltip content={<EmotionalPointTooltip />} />
            <Line type="linear" dataKey="value" stroke="transparent" dot={{ r: 6, fill: '#7c3aed', stroke: '#5b21b6', strokeWidth: 2 }} activeDot={{ r: 8, fill: '#7c3aed' }} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <ol id="emotion-trend-evidence" className="mt-5 grid gap-3 sm:grid-cols-2">
        {visiblePoints.map((point) => (
          <li key={point.id}>
            <button
              type="button"
              className="flex min-h-16 w-full items-start gap-3 rounded-xl border border-gray-200 p-4 text-left text-base hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
              onClick={() => onOpenEvidence(point.evidence.transcriptSegmentId)}
            >
              <span className="shrink-0 font-bold text-violet-700">{formatTranscriptTimestamp(point.evidence.startMs)}</span>
              <span><span className="block font-semibold text-gray-900">{EMOTION_LABEL[point.value]} · {evidenceOrigin(point.evidence.speaker)}</span><span className="block leading-6 text-gray-700">{point.label}</span><span className="mt-1 block line-clamp-2 text-sm italic text-gray-600">«{point.evidence.quote}»</span></span>
            </button>
          </li>
        ))}
      </ol>
      {points.length > 3 ? (
        <Button type="button" variant="outline" size="sm" className="mt-4" aria-expanded={showAllPoints} onClick={() => setShowAllPoints((current) => !current)}>
          {showAllPoints ? 'Mostra meno' : 'Mostra tutti'}
        </Button>
      ) : null}
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
