import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { EmotionalTrendChart, SessionMetricGauges } from './charts';
import type { EmotionalTrendPoint } from '@/lib/core/ai-session-notes/session-compass-contract';

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
    <SessionMetricGauges
      metrics={[{
        id: 'metric-1',
        key: 'confidence',
        value: 3,
        confidence: 'medium',
        evidence: point('1', 75_000, 'coach').evidence,
      }]}
      participation={null}
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

  assert.match(html, /Grafico dei segnali narrativi in punti discreti/);
  assert.match(html, /emotion-trend-evidence/);
  assert.match(html, /00:20.*Passaggio del coach/);
  assert.match(html, /Estratto 2/);
  assert.match(html, /Punti reali della conversazione, non una curva/);
});

test('l’andamento emotivo ricade sulla timeline per punti troppo vicini o duplicati', () => {
  const html = renderToStaticMarkup(
    <EmotionalTrendChart
      points={[point('1', 0), point('2', 5_000), point('3', 10_000)]}
      onOpenEvidence={() => undefined}
    />
  );

  assert.match(html, /non sono sufficienti o abbastanza distribuiti/);
  assert.match(html, /00:05/);
  assert.doesNotMatch(html, /Grafico dei segnali narrativi in punti discreti/);
});
