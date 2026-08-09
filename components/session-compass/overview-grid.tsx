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
import { ConversationMapBand } from './conversation-map';
import { MissedOpportunities } from './missed-opportunities';
import type { ConversationMap } from '@/lib/core/ai-session-notes/conversation-map';
import { JourneyNarrative } from './journey-narrative';
import { SessionContinuityCard } from './journey-panel';
import { orderSessionMetrics, SessionIndicators, SessionMetricsStrip } from './session-indicators';
import { NextSessionActions } from './next-session-actions';
import { RecurringThemesPanel } from './recurring-themes-panel';
import { formatTranscriptTimestamp } from './time';
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
  conversationMap,
  onOpenEvidence,
  onOpenTranscript,
  onOpenNotes,
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

  const hasTrend = hasComparableMetricTrend({
    journey: journey ?? null,
    report,
    isApproved,
    currentSessionId: sessionId,
  });

  const hasThemes = (journey?.recurringThemes.length ?? 0) > 0 || overview.themes.length > 0;

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

      {/* Niente colonna laterale: il percorso atleta ha una scheda sua, e
          qui occupava un terzo della larghezza restando alto duecento pixel
          su una pagina di quattromila. Il contenuto torna centrato e puo'
          respirare invece di stare compresso a destra. */}
      <div className="mx-auto min-w-0 max-w-5xl space-y-6">
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

        {/* Continuita' e filo logico si affiancano solo quando esistono
            entrambe. Accoppiarli sempre lasciava al filo logico meta'
            larghezza anche quando era da solo, e i suoi tre passaggi
            finivano incolonnati una parola per riga. */}
        {previousJourneyEntry ? (
          <div className="grid min-w-0 gap-4 xl:grid-cols-2">
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

        {/* Il trend si affianca ai temi solo quando c'e' davvero un grafico.
            Senza dati e' una frase di una riga, e messa in una colonna
            accanto a una card alta lasciava una voragine bianca: allora va
            a tutta larghezza, dove una riga sta bene. */}
        {hasTrend ? (
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
        ) : (
          <>
            {hasThemes ? (
              <RecurringThemesPanel
                recurringThemes={journey?.recurringThemes ?? []}
                sessionThemes={overview.themes}
                citedEvidenceKeys={primaryEvidenceKeys}
                onOpenEvidence={onOpenEvidence}
              />
            ) : null}
            <AthleteProgressCharts
              journey={journey ?? null}
              report={report}
              isApproved={isApproved}
              currentSessionId={sessionId}
              currentSessionDate={currentSessionDate ?? null}
            />
          </>
        )}

        {/* Trascrizione e momenti chiave hanno una scheda ciascuno, e i
            momenti sono gia' sulla mappa in cima come rombi cliccabili:
            tenerne qui una versione troncata faceva sembrare la Panoramica
            un indice di se' stessa. */}
        {/* Subito dopo la mappa: mentre il coach ha ancora in testa la forma
            della conversazione, gli si mostra dove non l'ha seguita. */}
        <MissedOpportunities
          items={report.missedOpportunities ?? []}
          citedEvidenceKeys={primaryEvidenceKeys}
          onOpenEvidence={onOpenEvidence}
        />

        <NextSessionActions
          items={report.nextSessionPrep}
          isApproved={isApproved}
          onOpenEvidence={onOpenEvidence}
          onOpenNotes={onOpenNotes}
        />

        {/* I due blocchi di segnali erano impilati a tutta larghezza uno
            sotto l'altro: due schermate per dire cose parenti. Affiancati
            occupano una riga sola e si leggono come un argomento solo. */}
        {(overview.emotionalTrend?.length ?? 0) > 0 ||
        (overview.metrics?.length ?? 0) > 5 ||
        overview.conversationTone ? (
          <div className="grid min-w-0 items-start gap-4 xl:grid-cols-2">
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
        ) : null}
      </div>
    </div>
  );
}
