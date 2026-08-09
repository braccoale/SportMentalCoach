import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { AthleteProgressCharts, EmotionalTrendChart } from './charts';
import { SessionIndicators } from './session-indicators';
import type { MentalJourney } from '@/lib/core/ai-session-notes/mental-journey';
import type { EmotionalTrendPoint, SessionCompassReport } from '@/lib/core/ai-session-notes/session-compass-contract';

function point(
  id: string,
  startMs: number,
  speaker: 'coach' | 'athlete' = 'athlete'
): EmotionalTrendPoint {
  return {
    id,
    value: 1,
    label: `Segnale ${id}`,
    evidence: {
      transcriptSegmentId: Number(id.replace(/\D/g, '')) || 1,
      startMs,
      minute: Math.floor(startMs / 60_000),
      speaker,
      quote: `Estratto ${id}`,
    },
  };
}

test('un passaggio attribuito al coach non è presentato come osservazione del coach', () => {
  const html = renderToStaticMarkup(
    <SessionIndicators
      metrics={[{
        id: 'metric-1',
        key: 'confidence',
        value: 3,
        confidence: 'medium',
        evidence: point('1', 75_000, 'coach').evidence,
      }]}
      tone={null}
      isApproved={false}
      onOpenEvidence={() => undefined}
    />
  );

  assert.match(html, /Passaggio del coach/);
  assert.doesNotMatch(html, /Osservazione coach/);
});

test('l’andamento emotivo usa punti discreti ed espone un equivalente testuale', () => {
  const html = renderToStaticMarkup(
    <EmotionalTrendChart
      points={[point('1', 0), point('2', 20_000, 'coach'), point('3', 80_000)]}
      onOpenEvidence={() => undefined}
    />
  );

  assert.match(html, /Segnali narrativi/);
  assert.match(html, /00:20.*Passaggio del coach/);
  assert.match(html, /Estratto 2/);
  assert.match(html, /Passaggi documentati, non uno stato misurato/);
});

test('l’andamento emotivo ricade sulla timeline per punti troppo vicini o duplicati', () => {
  const html = renderToStaticMarkup(
    <EmotionalTrendChart
      points={[point('1', 0), point('2', 5_000), point('3', 10_000)]}
      onOpenEvidence={() => undefined}
    />
  );

  assert.match(html, /Segnali narrativi/);
  assert.match(html, /00:05/);
  assert.doesNotMatch(html, /Grafico dei segnali narrativi in punti discreti/);
});

test('i segnali narrativi mostrano inizialmente due passaggi e un controllo accessibile', () => {
  const html = renderToStaticMarkup(
    <EmotionalTrendChart
      points={[point('1', 0), point('2', 20_000), point('3', 80_000), point('4', 140_000)]}
      onOpenEvidence={() => undefined}
    />
  );

  assert.match(html, /Segnale 1/);
  assert.match(html, /Segnale 2/);
  assert.doesNotMatch(html, /Segnale 3/);
  assert.doesNotMatch(html, /Segnale 4/);
  assert.match(html, /Mostra tutti/);
  assert.match(html, /aria-expanded="false"/);
});

function trendJourney(values: number[]): MentalJourney {
  return {
    athleteUserId: 1,
    summary: { firstSessionDate: null, lastSessionDate: null, approvedSessionCount: values.length, commitments: { total: 0, completed: 0, inProgress: 0, pending: 0, skipped: 0 }, completionRate: null },
    timeline: values.map((value, index) => ({
      sessionId: index + 1,
      bookingId: index + 1,
      reportId: index + 1,
      reportVersion: 1,
      sessionDate: `2026-0${index + 5}-01T10:00:00.000Z`,
      approvedAt: `2026-0${index + 5}-01T11:00:00.000Z`,
      coachName: 'Coach',
      summary: '',
      focus: null,
      themes: [],
      emergingResource: null,
      metrics: [{ key: 'confidence', value, confidence: 'high', transcriptSegmentId: index + 1 }],
      keyMoments: [],
      nextSessionPrep: [],
      commitments: [],
      compassHref: '#',
    })),
    recurringThemes: [],
    followThrough: [],
    pointsToRevisit: [],
  };
}

const EMPTY_REPORT = { sessionOverview: { metrics: [] } } as unknown as SessionCompassReport;

test('il trend metrico appare solo con tre sessioni approvate confrontabili', () => {
  const html = renderToStaticMarkup(
    <AthleteProgressCharts
      journey={trendJourney([2, 3, 4])}
      report={EMPTY_REPORT}
      isApproved={false}
      currentSessionId={99}
      currentSessionDate="2026-08-01T10:00:00.000Z"
    />
  );

  assert.match(html, /Metriche nei report approvati/);
  assert.match(html, /Fiducia/);
  assert.match(html, /2\/5/);
  assert.match(html, /3\/5/);
  assert.match(html, /4\/5/);
  assert.match(html, /Andamento di Fiducia/);
  assert.doesNotMatch(html, /monotone/);
});

test('il trend metrico non appare con meno di tre punti reali', () => {
  const html = renderToStaticMarkup(
    <AthleteProgressCharts
      journey={trendJourney([2, 3])}
      report={EMPTY_REPORT}
      isApproved={false}
      currentSessionId={99}
      currentSessionDate="2026-08-01T10:00:00.000Z"
    />
  );

  // Senza dati non e' piu' una card ma una riga, e la frase segue
  // l'etichetta: cambia l'iniziale, non il messaggio.
  assert.match(html, /Evoluzione nel tempo/);
  assert.match(html, /trend sarà disponibile dopo altre sessioni approvate/);
  assert.doesNotMatch(html, /2\/5/);
});
