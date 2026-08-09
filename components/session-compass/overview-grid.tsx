'use client';

import { Button } from '@/components/ui/button';
import type { MentalJourney, MentalJourneyEntry } from '@/lib/core/ai-session-notes/mental-journey';
import type {
  CompassEvidence,
  SessionCompassReport,
} from '@/lib/core/ai-session-notes/session-compass-contract';
import { AthleteJourneySidebar } from './athlete-journey-sidebar';
import { AthleteProgressCharts, EmotionalTrendChart } from './charts';
import { SessionHeroInsight } from './hero-insight';
import { ConversationMapBand } from './conversation-map';
import type { ConversationMap } from '@/lib/core/ai-session-notes/conversation-map';
import { JourneyNarrative } from './journey-narrative';
import { SessionContinuityCard } from './journey-panel';
import { orderSessionMetrics, SessionIndicators, SessionMetricsStrip } from './session-indicators';
import { NextSessionActions } from './next-session-actions';
import { RecurringThemesPanel } from './recurring-themes-panel';
import { formatTranscriptTimestamp } from './time';
import { TranscriptPreview } from './transcript-preview';
import { SPEAKER_LABEL, type CompassTranscriptSegment } from './types';
import { EvidenceReference, SectionHeading, Surface, evidenceKey } from './ui';

const MAX_PRIMARY_EVIDENCE = 2;
const MAX_VISIBLE_MOMENTS = 2;

/**
 * Panoramica come workspace, non come documento.
 *
 * Griglia a 12 colonne su desktop: percorso atleta a sinistra (sempre
 * visibile), area operativa a destra con card di peso diverso. Sotto `xl` la
 * timeline collassa sopra il contenuto e la griglia degrada a una colonna.
 */
export function SessionOverview({
  report,
  isApproved,
  journey,
  previousJourneyEntry,
  currentSessionId,
  currentSessionDate,
  transcript,
  transcriptLoaded,
  transcriptLoading,
  transcriptError,
  conversationMap,
  onLoadTranscript,
  onRetryTranscript,
  onOpenEvidence,
  onOpenTranscript,
  onOpenMoments,
  onOpenNotes,
}: {
  report: SessionCompassReport;
  isApproved: boolean;
  journey?: MentalJourney | null;
  previousJourneyEntry: MentalJourneyEntry | null;
  currentSessionId?: number;
  currentSessionDate?: string | null;
  transcript?: readonly CompassTranscriptSegment[];
  transcriptLoaded?: boolean;
  transcriptLoading?: boolean;
  transcriptError?: string | null;
  conversationMap?: ConversationMap | null;
  onLoadTranscript?: () => void;
  onRetryTranscript?: () => void;
  onOpenEvidence: (segmentId: number) => void;
  onOpenTranscript?: (sessionId: number, segmentId?: number) => void;
  onOpenMoments: () => void;
  onOpenNotes: () => void;
}) {
  const overview = report.sessionOverview;
  const sessionId = currentSessionId ?? Number(report.sessionId);
  const timeline = journey?.timeline ?? [];

  const supportingEvidence = [
    overview.themes[0]?.evidence,
    overview.emergingResource?.evidence ?? overview.summaryEvidence[0] ?? null,
    (report.nextSessionPrep[0] ?? report.commitments[0])?.evidence,
    ...overview.summaryEvidence,
  ].filter((item): item is CompassEvidence => Boolean(item));
  const primaryEvidence = Array.from(
    new Map(supportingEvidence.map((item) => [evidenceKey(item), item])).values()
  ).slice(0, MAX_PRIMARY_EVIDENCE);
  const primaryEvidenceKeys = new Set(primaryEvidence.map(evidenceKey));

  const hasThemes = (journey?.recurringThemes.length ?? 0) > 0 || overview.themes.length > 0;

  const journeySidebar = (
    <AthleteJourneySidebar
      timeline={timeline}
      currentSessionId={sessionId}
      currentSessionDate={currentSessionDate ?? null}
      currentFocus={overview.themes[0]?.text ?? null}
      currentIsApproved={isApproved}
      className="xl:sticky xl:top-4"
    />
  );

  return (
    <div className="min-w-0 space-y-4">
      {/* A tutta larghezza e prima di ogni altra cosa: e' l'unica superficie
          scura della pagina, ed e' quello che le da' il ruolo di punto
          focale senza bisogno di bordi o ombre. */}
      {conversationMap ? (
        <ConversationMapBand
          map={conversationMap}
          onSeek={
            onOpenTranscript
              ? () => onOpenTranscript(sessionId)
              : undefined
          }
        />
      ) : null}

      <div className="grid min-w-0 gap-4 xl:grid-cols-12">
      <div className="min-w-0 xl:col-span-3">{journeySidebar}</div>

      <div className="min-w-0 space-y-4 xl:col-span-9">
        <SessionHeroInsight
          report={report}
          isApproved={isApproved}
          primaryEvidence={primaryEvidence}
          onOpenEvidence={onOpenEvidence}
        />

        <SessionMetricsStrip
          metrics={overview.metrics ?? []}
          isApproved={isApproved}
          onOpenEvidence={onOpenEvidence}
          participation={overview.conversationParticipation}
          counts={{
            themes: overview.themes.length,
            actions: report.nextSessionPrep.length,
            moments: report.keyMoments.length,
            hasResource: Boolean(overview.emergingResource),
          }}
        />

        {previousJourneyEntry ? (
          <SessionContinuityCard report={report} previous={previousJourneyEntry} />
        ) : null}

        <div className="grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(16rem,0.8fr)]">
          <AthleteProgressCharts
            journey={journey ?? null}
            report={report}
            isApproved={isApproved}
            currentSessionId={sessionId}
            currentSessionDate={currentSessionDate ?? null}
          />
          {hasThemes ? (
            <RecurringThemesPanel
              recurringThemes={journey?.recurringThemes ?? []}
              sessionThemes={overview.themes}
              citedEvidenceKeys={primaryEvidenceKeys}
              onOpenEvidence={onOpenEvidence}
            />
          ) : null}
        </div>

        <JourneyNarrative
          report={report}
          previous={previousJourneyEntry}
          currentSessionDate={currentSessionDate ?? null}
        />

        <div className="grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)_minmax(15rem,0.85fr)]">
          <NextSessionActions
            items={report.nextSessionPrep}
            isApproved={isApproved}
            onOpenEvidence={onOpenEvidence}
            onOpenNotes={onOpenNotes}
          />
          {onOpenTranscript ? (
            <TranscriptPreview
              transcript={transcript ?? []}
              loaded={transcriptLoaded ?? false}
              loading={transcriptLoading ?? false}
              error={transcriptError ?? null}
              onLoad={() => onLoadTranscript?.()}
              onRetry={() => onRetryTranscript?.()}
              onOpenTranscript={(segmentId) => onOpenTranscript(sessionId, segmentId)}
            />
          ) : null}
          {report.keyMoments.length ? (
            <KeyMomentsSummary
              moments={report.keyMoments}
              citedEvidenceKeys={primaryEvidenceKeys}
              onOpenEvidence={onOpenEvidence}
              onOpenMoments={onOpenMoments}
            />
          ) : null}
        </div>

        {(overview.emotionalTrend?.length ?? 0) > 0 ? (
          <EmotionalTrendChart points={overview.emotionalTrend ?? []} onOpenEvidence={onOpenEvidence} />
        ) : null}

        {(overview.metrics?.length ?? 0) > 5 || overview.conversationTone ? (
          <SessionIndicators
            metrics={orderSessionMetrics(overview.metrics ?? []).slice(5)}
            tone={overview.conversationTone}
            isApproved={isApproved}
            onOpenEvidence={onOpenEvidence}
          />
        ) : null}
      </div>
      </div>
    </div>
  );
}

function KeyMomentsSummary({
  moments,
  citedEvidenceKeys,
  onOpenEvidence,
  onOpenMoments,
}: {
  moments: SessionCompassReport['keyMoments'];
  citedEvidenceKeys: ReadonlySet<string>;
  onOpenEvidence: (segmentId: number) => void;
  onOpenMoments: () => void;
}) {
  return (
    <Surface>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <SectionHeading eyebrow="Conversazione" title="Momenti chiave" />
        <Button type="button" variant="outline" size="sm" onClick={onOpenMoments}>
          Vedi tutti
        </Button>
      </div>
      <ol className="mt-4 divide-y divide-gray-100 rounded-xl border border-gray-100 bg-gray-50/50 px-3">
        {moments.slice(0, MAX_VISIBLE_MOMENTS).map((moment) => (
          <li key={moment.id} className="py-2.5">
            <p className="text-xs font-bold text-violet-700">{formatTranscriptTimestamp(moment.evidence.startMs)} <span className="ml-1 font-semibold text-gray-500">{SPEAKER_LABEL[moment.speaker]}</span></p>
            <p className="mt-1 line-clamp-1 text-sm font-bold leading-5 text-gray-950">{moment.title}</p>
            <EvidenceReference evidence={moment.evidence} alreadyCited={citedEvidenceKeys.has(evidenceKey(moment.evidence))} onOpenEvidence={onOpenEvidence} className="mt-0.5" />
          </li>
        ))}
      </ol>
    </Surface>
  );
}
