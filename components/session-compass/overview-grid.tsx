'use client';

import { Button } from '@/components/ui/button';
import type { MentalJourney, MentalJourneyEntry } from '@/lib/core/ai-session-notes/mental-journey';
import type {
  CompassEvidence,
  SessionCompassReport,
} from '@/lib/core/ai-session-notes/session-compass-contract';
import {
  AthleteProgressCharts,
  EmotionalTrendChart,
  hasComparableMetricTrend,
} from './charts';
import { SessionHeroInsight } from './hero-insight';
import { AthleteJourneySidebar } from './athlete-journey-sidebar';
import { ConversationMapBand } from './conversation-map';
import { MissedOpportunities } from './missed-opportunities';
import { SessionStoryCta } from './session-story';
import type { ConversationMap } from '@/lib/core/ai-session-notes/conversation-map';
import { JourneyNarrative } from './journey-narrative';
import { SessionContinuityCard } from './journey-panel';
import { orderSessionMetrics, SessionIndicators, SessionMetricsStrip } from './session-indicators';
import { NextSessionActions } from './next-session-actions';
import { RecurringThemesPanel } from './recurring-themes-panel';
import { formatTranscriptTimestamp } from './time';
import { SPEAKER_LABEL, type CompassTranscriptSegment } from './types';
import { EvidenceReference, SectionHeading, Surface, evidenceKey } from './ui';
import { CollapsibleSection } from './collapsible-section';

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
  conversationMap,
  onOpenEvidence,
  onOpenTranscript,
  onOpenNotes,
  onOpenStory,
}: {
  report: SessionCompassReport;
  isApproved: boolean;
  journey?: MentalJourney | null;
  previousJourneyEntry: MentalJourneyEntry | null;
  currentSessionId?: number;
  currentSessionDate?: string | null;
  conversationMap?: ConversationMap | null;
  onOpenEvidence: (segmentId: number) => void;
  onOpenTranscript?: (sessionId: number, segmentId?: number) => void;
  onOpenNotes: () => void;
  onOpenStory: () => void;
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

  // In ordine cronologico: la striscia di presenza si legge da sinistra.
  const journeySessionIds = [...(journey?.timeline ?? [])]
    .sort((a, b) => Date.parse(a.sessionDate ?? '') - Date.parse(b.sessionDate ?? ''))
    .map((entry) => entry.sessionId);

  // Storico per metrica, in ordine cronologico: e' cio' che alimenta le
  // sparkline dei riquadri. Solo sessioni approvate, come il grafico grande.
  const metricHistory = [...(journey?.timeline ?? [])]
    .sort((a, b) => Date.parse(a.sessionDate ?? '') - Date.parse(b.sessionDate ?? ''))
    .reduce<Record<string, number[]>>((history, entry) => {
      for (const metric of entry.metrics ?? []) {
        (history[metric.key] ??= []).push(metric.value);
      }
      return history;
    }, {});

  const hasTrend = hasComparableMetricTrend({
    journey: journey ?? null,
    report,
    isApproved,
    currentSessionId: sessionId,
  });

  /*
   * Con un tema solo, il pannello ripete il titolone.
   *
   * Il titolo della lettura AI è il primo tema: mostrarlo di nuovo poco sotto
   * sotto un'altra intestazione non aggiunge niente e fa sembrare la pagina
   * più piena di quanto sia. Da due temi in su torna a dire qualcosa, e con i
   * temi ricorrenti del percorso è utile comunque.
   */
  const hasThemes =
    (journey?.recurringThemes.length ?? 0) > 0 || overview.themes.length > 1;

  const journeySidebar = (
    <AthleteJourneySidebar
      timeline={journey?.timeline ?? []}
      currentSessionId={sessionId}
      currentSessionDate={currentSessionDate ?? null}
      currentFocus={overview.themes[0]?.text ?? null}
      currentIsApproved={isApproved}
      className="h-full"
    />
  );

  const themesPanel = hasThemes ? (
    <RecurringThemesPanel
      recurringThemes={journey?.recurringThemes ?? []}
      journeySessionIds={journeySessionIds}
      sessionThemes={overview.themes}
      citedEvidenceKeys={primaryEvidenceKeys}
      onOpenEvidence={onOpenEvidence}
      className="h-full"
    />
  ) : null;

  const nextActions = (
    <NextSessionActions
      items={report.nextSessionPrep}
      isApproved={isApproved}
      onOpenEvidence={onOpenEvidence}
      onOpenNotes={onOpenNotes}
      className="h-full"
    />
  );

  /**
   * Ogni blocco occupa la stessa larghezza della fascia: prima il contenuto
   * stava stretto in mezzo mentre la fascia andava da bordo a bordo, e quel
   * disallineamento era la ragione principale per cui la pagina non sembrava
   * composta. Le righe sono al massimo di due elementi, di pari altezza.
   */
  return (
    <div className="min-w-0 space-y-4">
      {conversationMap ? (
        <ConversationMapBand
          map={conversationMap}
          onSeek={
            onOpenTranscript ? () => onOpenTranscript(sessionId) : undefined
          }
        />
      ) : null}

      {/* Il percorso atleta sta accanto al solo eroe, non lungo tutta la
          pagina: e' un riferimento che si guarda leggendo la lettura AI, e
          sotto non avrebbe piu' nulla da accompagnare. */}
      <div className="grid min-w-0 items-stretch gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,3fr)] [&>*]:h-full">
        {journeySidebar}
        <Surface className="min-w-0">
          <SessionHeroInsight
            report={report}
            isApproved={isApproved}
            primaryEvidence={primaryEvidence}
            onOpenEvidence={onOpenEvidence}
          />
        </Surface>
      </div>

      {/* Subito sotto l'eroe: la sintesi dice cos'e' successo, il racconto
          come e' andata. Qui c'e' solo il richiamo — il racconto si legge
          nella sua tab, dove la pagina e' fatta per leggere. */}
      {report.story ? (
        <CollapsibleSection
          eyebrow="Com'è andata"
          title={report.story.title}
          hint="anteprima del racconto"
        >
          <SessionStoryCta story={report.story} onOpenStory={onOpenStory} />
        </CollapsibleSection>
      ) : null}

      <CollapsibleSection eyebrow="In sintesi" title="Indicatori e partecipazione">
        <SessionMetricsStrip
        metrics={overview.metrics ?? []}
        metricHistory={metricHistory}
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
      </CollapsibleSection>

      <CollapsibleSection
        eyebrow="Percorso"
        title="Filo logico del percorso"
        hint={previousJourneyEntry ? undefined : 'prima sessione analizzata'}
      >
        {previousJourneyEntry ? (
          <div className="grid min-w-0 items-stretch gap-4 xl:grid-cols-2 [&>*]:h-full">
            <SessionContinuityCard report={report} previous={previousJourneyEntry} />
            <JourneyNarrative
              report={report}
              previous={previousJourneyEntry}
              currentSessionDate={currentSessionDate ?? null}
            />
          </div>
        ) : (
          <JourneyNarrative
            report={report}
            previous={previousJourneyEntry}
            currentSessionDate={currentSessionDate ?? null}
          />
        )}
      </CollapsibleSection>

      {(report.missedOpportunities?.length ?? 0) > 0 ? (
        <CollapsibleSection
          eyebrow="Da riascoltare"
          title="Spunti rimasti aperti"
          hint={`${report.missedOpportunities?.length ?? 0}`}
        >
          <MissedOpportunities
            items={report.missedOpportunities ?? []}
            citedEvidenceKeys={primaryEvidenceKeys}
            onOpenEvidence={onOpenEvidence}
          />
        </CollapsibleSection>
      ) : null}

      {/* Temi e follow-up sono le due facce della stessa domanda: su cosa
          avete lavorato, e cosa ne resta da fare. Stanno affiancati. */}
      <div className="grid min-w-0 items-stretch gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] [&>*]:h-full">
        {themesPanel}
        {nextActions}
      </div>

      {hasTrend ? (
        <AthleteProgressCharts
          journey={journey ?? null}
          report={report}
          isApproved={isApproved}
          currentSessionId={sessionId}
          currentSessionDate={currentSessionDate ?? null}
        />
      ) : (
        <AthleteProgressCharts
          journey={journey ?? null}
          report={report}
          isApproved={isApproved}
          currentSessionId={sessionId}
          currentSessionDate={currentSessionDate ?? null}
        />
      )}

      {(overview.emotionalTrend?.length ?? 0) > 0 ||
      (overview.metrics?.length ?? 0) > 5 ||
      overview.conversationTone ? (
        <div className="grid min-w-0 items-stretch gap-4 xl:grid-cols-2 [&>*]:h-full">
          {(overview.emotionalTrend?.length ?? 0) > 0 ? (
            <EmotionalTrendChart
              points={overview.emotionalTrend ?? []}
              onOpenEvidence={onOpenEvidence}
            />
          ) : null}
          {(overview.metrics?.length ?? 0) > 5 || overview.conversationTone ? (
            <SessionIndicators
              metrics={orderSessionMetrics(overview.metrics ?? []).slice(5)}
              metricHistory={metricHistory}
              tone={overview.conversationTone}
              isApproved={isApproved}
              onOpenEvidence={onOpenEvidence}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );

}
