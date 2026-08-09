'use client';

import { CheckCheck, ListChecks, MessagesSquare, Sparkles, Target } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import type {
  ConversationParticipation,
  ConversationTone,
  SessionMetric,
} from '@/lib/core/ai-session-notes/session-compass-contract';
import { SESSION_METRIC_KEYS } from '@/lib/core/ai-session-notes/session-compass-contract';
import { METRIC_META, metricValueLabel } from './metric-model';
import {
  buildMetricTrend,
  metricTrendLabel,
  type MetricTrend,
} from '@/lib/core/ai-session-notes/metric-trend';
import { SectionHeading, Surface } from './ui';
import { PortraitDecor } from './decor';

const SEGMENTS = [1, 2, 3, 4, 5] as const;
const VISIBLE_METRICS = 3;
const METRICS_STRIP_LIMIT = 3;
const PRIMARY_METRIC_KEYS = ['confidence', 'pre_competition_anxiety', 'emotional_management'] as const;

const TONE_LABEL: Record<ConversationTone['key'], string> = {
  enthusiastic: 'Entusiasta',
  open: 'Aperto',
  reflective: 'Riflessivo',
  hesitant: 'Esitante',
  guarded: 'Cauto',
  frustrated: 'Frustrato',
  neutral: 'Neutro',
};

function evidenceLevel(value: SessionMetric['confidence']): string {
  if (value === 'high') return 'forte';
  if (value === 'medium') return 'moderata';
  return 'debole';
}

function evidenceOrigin(speaker: 'coach' | 'athlete'): string {
  return speaker === 'athlete' ? 'Dichiarazione atleta' : 'Passaggio del coach';
}

function formatTalkTime(milliseconds: number): string {
  const seconds = Math.round(milliseconds / 1000);
  if (seconds < 60) return `${seconds} sec`;
  return `${Math.floor(seconds / 60)} min`;
}

export function orderSessionMetrics(metrics: readonly SessionMetric[]): SessionMetric[] {
  return [...metrics].sort(
    (left, right) => SESSION_METRIC_KEYS.indexOf(left.key) - SESSION_METRIC_KEYS.indexOf(right.key)
  );
}

/**
 * Scala ordinale, resa come tale.
 *
 * Cinque segmenti discreti e il valore esplicito N/5: nessun arco continuo,
 * nessuna percentuale. Una metrica senza evidenza non esiste nel report, e
 * quindi non compare — non viene mai resa come zero.
 */
/**
 * Il mini grafico dell'andamento.
 *
 * Compare solo quando ci sono almeno tre sessioni con quella metrica: con
 * due punti una linea non e' una tendenza, e disegnarla suggerirebbe una
 * precisione che il dato non ha.
 */
function MetricSparkline({
  trend,
  color,
  label,
}: {
  trend: MetricTrend;
  color: string;
  label: string;
}) {
  return (
    <span className="mt-2 flex items-end justify-between gap-2">
      <span className="min-w-0 text-xs font-semibold text-gray-600">
        {metricTrendLabel(trend)}
      </span>
      <svg
        viewBox="0 0 100 40"
        preserveAspectRatio="none"
        className="h-8 w-20 shrink-0 overflow-visible"
        role="img"
        aria-label={`${label}: ${metricTrendLabel(trend).toLowerCase()} su ${trend.values.length} sessioni`}
      >
        <polyline
          points={trend.polyline
            .split(' ')
            .map((pair) => {
              const [x, y] = pair.split(',');
              return `${x},${(Number(y) * 0.4).toFixed(1)}`;
            })
            .join(' ')}
          fill="none"
          stroke={color}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </span>
  );
}

export function SessionIndicators({
  metrics,
  metricHistory,
  tone,
  isApproved,
  onOpenEvidence,
  className = '',
}: {
  metrics: readonly SessionMetric[];
  /** Valori della stessa metrica nelle sessioni approvate, in ordine. */
  metricHistory?: Readonly<Record<string, readonly number[]>>;
  tone: ConversationTone | null | undefined;
  isApproved: boolean;
  onOpenEvidence: (segmentId: number) => void;
  className?: string;
}) {
  const [showAll, setShowAll] = useState(false);
  if (!metrics.length && !tone) return null;
  const visibleMetrics = showAll ? metrics : metrics.slice(0, VISIBLE_METRICS);
  const validation = isApproved ? 'Validata nel report' : 'Da validare dal coach';

  return (
    <Surface className={`relative overflow-hidden ${className}`} ariaLabel="Indicatori della sessione">
      {/* Rete di punti nell'angolo: accompagna cio' che e' stato messo in
          relazione. Sotto al contenuto e senza eventi. */}
      <PortraitDecor className="inset-y-0 right-0 hidden w-2/5 opacity-40 lg:block" />
      <div className="relative">
      <SectionHeading
        title="Segnali emersi dalla conversazione"
        description="Stime basate sul testo della trascrizione: non sono misure cliniche né autovalutazioni dell’atleta."
      />

      {visibleMetrics.length ? (
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visibleMetrics.map((metric) => {
            const meta = METRIC_META[metric.key];
            return (
              <li key={metric.id} className="min-w-0">
                <button
                  type="button"
                  className="h-full w-full min-w-0 rounded-xl border border-gray-200 bg-gray-50/70 p-3 text-left transition hover:border-violet-300 hover:bg-violet-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
                  onClick={() => onOpenEvidence(metric.evidence.transcriptSegmentId)}
                  aria-label={`${meta.label}: ${metric.value} su 5, ${metricValueLabel(metric.value).toLocaleLowerCase('it')}. Evidenza ${evidenceLevel(metric.confidence)}, ${evidenceOrigin(metric.evidence.speaker)}. ${validation}. Vai all’evidenza nella trascrizione.`}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="min-w-0 truncate text-sm font-bold text-gray-950">{meta.label}</p>
                    <p className="shrink-0 text-sm font-bold text-gray-950">{metric.value}/5</p>
                  </div>

                  <div className="mt-2 flex gap-1" aria-hidden="true">
                    {SEGMENTS.map((segment) => (
                      <span
                        key={segment}
                        className="h-2 flex-1 rounded-full"
                        style={{
                          backgroundColor: segment <= metric.value ? meta.color : '#e5e7eb',
                        }}
                      />
                    ))}
                  </div>

                  <p className="mt-2 text-sm text-gray-700">{metricValueLabel(metric.value)}</p>
                  <p className="mt-1 text-xs leading-5 text-gray-600">
                    Evidenza {evidenceLevel(metric.confidence)} · {evidenceOrigin(metric.evidence.speaker)}
                  </p>
                  <p className="mt-0.5 text-xs font-semibold text-gray-700">{validation}</p>
                  {(() => {
                    const history = metricHistory?.[metric.key] ?? [];
                    const trend = buildMetricTrend(
                      history.map((value, index) => ({ sessionId: index, value }))
                    );
                    return trend ? (
                      <MetricSparkline trend={trend} color={meta.color} label={meta.label} />
                    ) : null;
                  })()}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      {metrics.length > VISIBLE_METRICS ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-3"
          aria-expanded={showAll}
          onClick={() => setShowAll((current) => !current)}
        >
          {showAll ? 'Mostra meno segnali' : `Vedi tutti i ${metrics.length} segnali`}
        </Button>
      ) : null}

      {tone ? (
        <button
          type="button"
          className="mt-3 block w-full rounded-xl border border-violet-100 bg-violet-50/60 p-3 text-left text-xs leading-5 text-violet-950 transition hover:border-violet-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
          onClick={() => onOpenEvidence(tone.evidence.transcriptSegmentId)}
        >
          <span className="font-semibold">Tono nel testo: {TONE_LABEL[tone.key]}.</span> {tone.description}{' '}
          <span className="text-violet-700">Apri la citazione.</span>
          <span className="mt-1 block text-violet-800">Lettura delle parole, non dell’intonazione vocale.</span>
        </button>
      ) : null}
      </div>
    </Surface>
  );
}

/**
 * Fascia di lettura rapida: contiene soltanto segnali ordinali che esistono
 * davvero nel report. I cinque segmenti non sono una percentuale: rendono
 * visibile una scala discreta 1–5 e il valore resta sempre esplicito.
 */
export function SessionMetricsStrip({
  metrics,
  metricHistory,
  isApproved,
  onOpenEvidence,
  participation,
  counts,
}: {
  metrics: readonly SessionMetric[];
  metricHistory?: Readonly<Record<string, readonly number[]>>;
  isApproved: boolean;
  onOpenEvidence: (segmentId: number) => void;
  participation?: ConversationParticipation | null;
  counts?: SessionSummaryCounts;
}) {
  const orderedMetrics = orderSessionMetrics(metrics);
  const primaryMetrics = PRIMARY_METRIC_KEYS.flatMap((key) => orderedMetrics.filter((metric) => metric.key === key));
  const visibleMetrics = [...primaryMetrics, ...orderedMetrics.filter((metric) => !PRIMARY_METRIC_KEYS.includes(metric.key as typeof PRIMARY_METRIC_KEYS[number]))]
    .slice(0, METRICS_STRIP_LIMIT);
  const hasCounts = Boolean(counts && (counts.themes || counts.actions || counts.moments || counts.hasResource));
  if (!visibleMetrics.length && !participation && !hasCounts) return null;

  const validation = isApproved ? 'Validata dal coach' : 'Da validare dal coach';
  return (
    <section
      // Era l'unico blocco con sfondo sfumato e ombra: attirava l'occhio
      // piu' dell'eroe a 41px, e gli indicatori non sono la cosa piu'
      // importante della pagina.
      className="overflow-hidden rounded-2xl border border-gray-200/70 bg-white p-4 sm:p-5"
      aria-labelledby="session-metrics-strip-title"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-violet-700">In sintesi</p>
          <h3 id="session-metrics-strip-title" className="mt-1 text-lg font-black tracking-tight text-gray-950">Indicatori che contano ora</h3>
        </div>
        <p className="text-xs leading-5 text-gray-600">Scala ordinale 1–5 · non clinica</p>
      </div>

      <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,1fr)_12rem]">
      {visibleMetrics.length ? <ul className="grid gap-2 sm:grid-cols-3">
        {visibleMetrics.map((metric) => {
          const meta = METRIC_META[metric.key];
          const level = evidenceLevel(metric.confidence);
          const origin = evidenceOrigin(metric.evidence.speaker);
          return (
            <li key={metric.id} className="min-w-0">
              <button
                type="button"
                className="group flex min-h-[7.25rem] w-full flex-col rounded-xl border border-white/90 bg-white/90 p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-violet-200 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
                onClick={() => onOpenEvidence(metric.evidence.transcriptSegmentId)}
                aria-label={`${meta.label}: ${metric.value} su 5, ${metricValueLabel(metric.value).toLocaleLowerCase('it')}. Evidenza ${level}, ${origin}. ${validation}. Vai all'evidenza nella trascrizione.`}
              >
                <span className="flex w-full items-start justify-between gap-2">
                  <span className="line-clamp-2 text-sm font-bold leading-5 text-gray-950">{meta.label}</span>
                  <span className="shrink-0 rounded-lg px-1.5 py-0.5 text-sm font-black" style={{ color: meta.color, backgroundColor: `${meta.color}12` }}>
                    {metric.value}/5
                  </span>
                </span>
                <span className="mt-3 flex w-full gap-1" aria-hidden="true">
                  {SEGMENTS.map((segment) => (
                    <span
                      key={segment}
                      className="h-2 flex-1 rounded-full"
                      style={{ backgroundColor: segment <= metric.value ? meta.color : '#e5e7eb' }}
                    />
                  ))}
                </span>
                <span className="mt-2 text-xs font-semibold text-gray-700">{metricValueLabel(metric.value)}</span>
                <span className="mt-auto pt-2 text-[11px] leading-4 text-gray-500">Evidenza {level} · {origin}</span>
                {(() => {
                  const history = metricHistory?.[metric.key] ?? [];
                  const trend = buildMetricTrend(
                    history.map((value, index) => ({ sessionId: index, value }))
                  );
                  return trend ? (
                    <MetricSparkline trend={trend} color={meta.color} label={meta.label} />
                  ) : null;
                })()}
              </button>
            </li>
          );
        })}
      </ul> : null}

      {participation ? <ParticipationSnapshot participation={participation} /> : null}
      </div>

      {hasCounts && counts ? <SessionCountLine counts={counts} /> : null}

      {metrics.length > METRICS_STRIP_LIMIT ? (
        <p className="mt-3 text-xs leading-5 text-gray-600">Altri {metrics.length - METRICS_STRIP_LIMIT} segnali con evidenza disponibili nel dettaglio del report.</p>
      ) : null}
    </section>
  );
}

function ParticipationSnapshot({ participation }: { participation: ConversationParticipation }) {
  const athleteShare = participation.athleteSharePercent;
  const coachShare = 100 - athleteShare;
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-xl border border-sky-100 bg-white/80 p-3">
      <div
        className="grid h-16 w-16 shrink-0 place-items-center rounded-full"
        role="img"
        aria-label={`Quota di parola trascritta: atleta ${athleteShare}%, coach ${coachShare}%. Deriva dalla durata e dal conteggio degli interventi trascritti.`}
        style={{ background: `conic-gradient(#0ea5e9 0 ${athleteShare}%, #c4b5fd ${athleteShare}% 100%)` }}
      >
        <span className="grid h-12 w-12 place-items-center rounded-full bg-white text-center"><span><span className="block text-sm font-black text-sky-700">{athleteShare}%</span><span className="block text-[9px] font-bold uppercase tracking-wide text-gray-500">Atleta</span></span></span>
      </div>
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase tracking-wide text-sky-700">Partecipazione</p>
        <p className="mt-1 text-sm font-bold text-gray-950">Atleta {athleteShare} · Coach {coachShare}</p>
        <p className="mt-1 text-xs leading-5 text-gray-600">{participation.athleteTurns} turni atleta · {participation.coachTurns} coach</p>
      </div>
    </div>
  );
}

type SessionSummaryCounts = { themes: number; actions: number; moments: number; hasResource: boolean };

function SessionCountLine({ counts }: { counts: SessionSummaryCounts }) {
  const items = [
    counts.themes ? `${counts.themes} ${counts.themes === 1 ? 'tema' : 'temi'}` : null,
    counts.actions ? `${counts.actions} ${counts.actions === 1 ? 'azione' : 'azioni'}` : null,
    counts.moments ? `${counts.moments} ${counts.moments === 1 ? 'momento' : 'momenti'}` : null,
    counts.hasResource ? '1 risorsa' : null,
  ].filter((item): item is string => Boolean(item));
  if (!items.length) return null;
  return <p className="mt-3 border-t border-violet-100 pt-3 text-sm font-semibold text-gray-700">{items.join(' · ')}</p>;
}

/** Conteggi deterministici del report corrente: non usano stime AI o percentuali. */
export function SessionKpiCards({
  themeCount,
  actionCount,
  keyMomentCount,
  hasEmergingResource,
}: {
  themeCount: number;
  actionCount: number;
  keyMomentCount: number;
  hasEmergingResource: boolean;
}) {
  const items = [
    { label: 'Temi emersi', value: themeCount, icon: <Target className="h-4 w-4" />, tone: 'text-violet-700 bg-violet-50 border-violet-100' },
    { label: 'Azioni definite', value: actionCount, icon: <ListChecks className="h-4 w-4" />, tone: 'text-emerald-700 bg-emerald-50 border-emerald-100' },
    { label: 'Momenti chiave', value: keyMomentCount, icon: <Sparkles className="h-4 w-4" />, tone: 'text-amber-800 bg-amber-50 border-amber-100' },
    ...(hasEmergingResource ? [{ label: 'Risorsa emersa', value: 1, icon: <CheckCheck className="h-4 w-4" />, tone: 'text-sky-700 bg-sky-50 border-sky-100' }] : []),
  ].filter((item) => item.value > 0);

  if (!items.length) return null;

  return (
    <section aria-label="Conteggi della sessione" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className={`min-w-0 rounded-xl border p-3 shadow-sm ${item.tone}`}>
          <div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold">{item.label}</span>{item.icon}</div>
          <p className="mt-1 text-2xl font-black leading-none tabular-nums">{item.value}</p>
        </div>
      ))}
    </section>
  );
}

/**
 * La quota di parola è un conteggio sui segmenti trascritti, non una stima del
 * modello: sta in una card separata perché non condivide né la scala né il
 * grado di incertezza delle metriche interpretative.
 */
export function ConversationParticipationCard({
  participation,
  className = '',
}: {
  participation: ConversationParticipation | null | undefined;
  className?: string;
}) {
  if (!participation) return null;
  const athleteShare = participation.athleteSharePercent;
  const coachShare = 100 - athleteShare;
  const hasTurns = participation.athleteTurns > 0 || participation.coachTurns > 0;

  return (
    <Surface className={className} ariaLabel="Partecipazione alla conversazione">
      <SectionHeading
        eyebrow="Dato osservato"
        title="Partecipazione alla conversazione"
        description="Conteggio diretto sui segmenti trascritti, non una stima dell’AI."
      />

      <div className="mt-4 grid items-center gap-4 sm:grid-cols-[7rem_minmax(0,1fr)]">
        <div
          className="relative mx-auto grid h-24 w-24 place-items-center rounded-full"
          role="img"
          aria-label={`Quota di parola trascritta: atleta ${athleteShare}%, coach ${coachShare}%. Deriva dalla durata e dal conteggio degli interventi trascritti.`}
          style={{ background: `conic-gradient(#0ea5e9 0 ${athleteShare}%, #a78bfa ${athleteShare}% 100%)` }}
        >
          <span className="grid h-[4.55rem] w-[4.55rem] place-items-center rounded-full bg-white text-center">
            <span><span className="block text-xl font-black tabular-nums text-sky-700">{athleteShare}%</span><span className="block text-[10px] font-bold uppercase tracking-wide text-gray-500">Atleta</span></span>
          </span>
        </div>
        <div
          className="flex h-3 overflow-hidden rounded-full bg-gray-100"
          role="img"
          aria-label={`Barra divisa: atleta ${athleteShare}%, coach ${coachShare}%.`}
        >
          <span className="bg-sky-500" style={{ width: `${athleteShare}%` }} />
          <span className="bg-violet-400" style={{ width: `${coachShare}%` }} />
        </div>
      </div>

      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        <ParticipantRow
          dotClass="bg-sky-500"
          label="Atleta"
          share={athleteShare}
          talkMs={participation.athleteTalkMs}
          turns={hasTurns ? participation.athleteTurns : null}
        />
        <ParticipantRow
          dotClass="bg-violet-400"
          label="Coach"
          share={coachShare}
          talkMs={participation.coachTalkMs}
          turns={hasTurns ? participation.coachTurns : null}
        />
      </dl>

      <p className="mt-3 text-xs leading-5 text-gray-600">
        La quota di parola non misura da sola interesse, coinvolgimento o qualità della sessione.
      </p>
    </Surface>
  );
}

function ParticipantRow({
  dotClass,
  label,
  share,
  talkMs,
  turns,
}: {
  dotClass: string;
  label: string;
  share: number;
  talkMs: number;
  turns: number | null;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-gray-200 p-3">
      <dt className="flex items-center gap-2 text-sm font-bold text-gray-950">
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${dotClass}`} aria-hidden="true" />
        {label}
        <MessagesSquare className="ml-auto h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
      </dt>
      <dd className="mt-1 text-sm text-gray-700">
        {share}% del parlato · {formatTalkTime(talkMs)}
        {turns === null ? '' : ` · ${turns} turni`}
      </dd>
    </div>
  );
}
