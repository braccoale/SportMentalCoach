/**
 * Il contratto fra la landing e il prodotto.
 *
 * Una pagina di marketing può mostrare quello che vuole: è il punto in cui il
 * disallineamento con il prodotto non produce nessun errore e nessuno se ne
 * accorge, finché non se ne accorge un cliente. Questo test toglie quella
 * possibilità: il compass che il pubblico vede su /v2 passa dallo stesso
 * validatore che in produzione accetta o rifiuta l'output del modello.
 *
 * Se il contratto si stringe — un'evidenza obbligatoria in più, una frase che
 * diventa vietata — questo test diventa rosso prima che la pagina menta.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SESSION_METRIC_KEYS,
  validateSessionCompassReport,
} from '@/lib/core/ai-session-notes/session-compass-contract';
import {
  DEMO_COMPASS,
  DEMO_COMPASS_CONTEXT,
  DEMO_JOURNEY,
  DEMO_METRIC_ORDER,
  DEMO_SEGMENTS,
} from './demo-compass';

test('il compass della landing è un report valido secondo il contratto del prodotto', () => {
  const issues = validateSessionCompassReport(DEMO_COMPASS, DEMO_COMPASS_CONTEXT);
  assert.deepEqual(
    issues,
    [],
    `Il report demo non è valido:\n${issues
      .map((issue) => `  ${issue.code} @ ${issue.path} — ${issue.message}`)
      .join('\n')}`,
  );
});

test('ogni evidenza cita un segmento della trascrizione demo', () => {
  const known = new Set(DEMO_SEGMENTS.map((segment) => segment.transcriptSegmentId));
  const cited = [
    ...DEMO_COMPASS.sessionOverview.summaryEvidence,
    ...DEMO_COMPASS.sessionOverview.themes.map((theme) => theme.evidence),
    ...(DEMO_COMPASS.sessionOverview.metrics ?? []).map((metric) => metric.evidence),
    ...(DEMO_COMPASS.sessionOverview.emotionalTrend ?? []).map((point) => point.evidence),
    ...DEMO_COMPASS.keyMoments.map((moment) => moment.evidence),
    ...DEMO_COMPASS.commitments.map((commitment) => commitment.evidence),
    ...DEMO_COMPASS.nextSessionPrep.map((item) => item.evidence),
  ];

  assert.ok(cited.length > 0);
  for (const evidence of cited) {
    assert.ok(
      known.has(evidence.transcriptSegmentId),
      `Evidenza su un segmento inesistente: ${evidence.transcriptSegmentId}`,
    );
  }
});

test('la landing mostra tutte e sole le sei metriche del contratto', () => {
  const declared = (DEMO_COMPASS.sessionOverview.metrics ?? []).map((metric) => metric.key);

  assert.deepEqual([...DEMO_METRIC_ORDER].sort(), [...SESSION_METRIC_KEYS].sort());
  assert.deepEqual([...declared].sort(), [...DEMO_METRIC_ORDER].sort());
});

test('il percorso demo è cronologico e finisce sulla seduta del compass', () => {
  const dates = DEMO_JOURNEY.map((entry) => entry.sessionDate);
  assert.deepEqual(dates, [...dates].sort());

  const last = DEMO_JOURNEY.at(-1);
  assert.ok(last);
  assert.equal(last.sessionDate, '2026-03-09');

  const concentration = (DEMO_COMPASS.sessionOverview.metrics ?? []).find(
    (metric) => metric.key === 'concentration',
  );
  assert.ok(concentration);
  assert.equal(
    last.concentration,
    concentration.value,
    'L’ultimo punto del percorso deve coincidere con la metrica del compass mostrato accanto.',
  );
});
