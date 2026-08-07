'use client';

import { MessagesSquare } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import type {
  ConversationParticipation,
  ConversationTone,
  SessionMetric,
} from '@/lib/core/ai-session-notes/session-compass-contract';
import { METRIC_META, metricValueLabel } from './metric-model';
import { SectionHeading, Surface } from './ui';

const SEGMENTS = [1, 2, 3, 4, 5] as const;
const VISIBLE_METRICS = 3;

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

/**
 * Scala ordinale, resa come tale.
 *
 * Cinque segmenti discreti e il valore esplicito N/5: nessun arco continuo,
 * nessuna percentuale. Una metrica senza evidenza non esiste nel report, e
 * quindi non compare — non viene mai resa come zero.
 */
export function SessionIndicators({
  metrics,
  tone,
  isApproved,
  onOpenEvidence,
  className = '',
}: {
  metrics: readonly SessionMetric[];
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
    <Surface className={className} ariaLabel="Indicatori della sessione">
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
    </Surface>
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

      <div
        className="mt-4 flex h-3 overflow-hidden rounded-full bg-gray-100"
        role="img"
        aria-label={`Quota di parola trascritta: atleta ${athleteShare}%, coach ${coachShare}%.`}
      >
        <span className="bg-sky-500" style={{ width: `${athleteShare}%` }} />
        <span className="bg-violet-400" style={{ width: `${coachShare}%` }} />
      </div>

      <dl className="mt-3 grid gap-3 sm:grid-cols-2">
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
