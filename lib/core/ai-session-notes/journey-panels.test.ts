import assert from 'node:assert/strict';
import test from 'node:test';
import type { JourneySummary, RecurringTheme } from './mental-journey';
import { MIN_COMMITMENTS_FOR_RATE } from './mental-journey';
import {
  MAX_THEME_BARS,
  buildCommitmentBreakdown,
  buildThemeBars,
} from './journey-panels';

function summary(
  commitments: Partial<JourneySummary['commitments']>,
  completionRate: number | null = null
): JourneySummary {
  return {
    firstSessionDate: '2026-05-12T10:00:00.000Z',
    lastSessionDate: '2026-08-18T10:00:00.000Z',
    approvedSessionCount: 8,
    draftSessionCount: 0,
    commitments: {
      total: 0,
      completed: 0,
      inProgress: 0,
      pending: 0,
      skipped: 0,
      ...commitments,
    },
    completionRate,
  };
}

function theme(key: string, occurrences: number): RecurringTheme {
  return {
    key,
    label: `Tema ${key}`,
    occurrences,
    firstSeenAt: '2026-05-12T10:00:00.000Z',
    lastSeenAt: '2026-08-18T10:00:00.000Z',
    sessionIds: [],
    description: 'd',
  };
}

test('«in corso» tiene dentro anche cio che deve ancora cominciare', () => {
  const breakdown = buildCommitmentBreakdown(
    summary({ total: 17, completed: 12, inProgress: 3, pending: 1, skipped: 1 })
  );

  assert.deepEqual(
    breakdown.rows.map((row) => [row.label, row.count]),
    [
      ['Completate', 12],
      ['In corso', 4],
      ['Non completate', 1],
    ]
  );
});

test('un impegno lasciato cadere non si mescola con quelli aperti', () => {
  const breakdown = buildCommitmentBreakdown(
    summary({ total: 9, completed: 2, inProgress: 1, pending: 3, skipped: 3 })
  );

  const open = breakdown.rows.find((row) => row.key === 'inProgress')!;
  const dropped = breakdown.rows.find((row) => row.key === 'skipped')!;
  assert.equal(open.count, 4, 'in corso piu da iniziare');
  assert.equal(dropped.count, 3, 'solo gli abbandonati');
});

test('le righe coprono il totale senza contare niente due volte', () => {
  const breakdown = buildCommitmentBreakdown(
    summary({ total: 17, completed: 12, inProgress: 3, pending: 1, skipped: 1 })
  );
  const sum = breakdown.rows.reduce((total, row) => total + row.count, 0);
  assert.equal(sum, breakdown.total);
});

test('la quota si legge dal dominio, non si ricalcola', () => {
  // Sotto la soglia il dominio non produce una quota: il riquadro non deve
  // inventarne una propria dividendo i conteggi.
  const few = buildCommitmentBreakdown(
    summary({ total: 3, completed: 3 }, null)
  );
  assert.equal(few.completionRate, null);
  assert.ok(MIN_COMMITMENTS_FOR_RATE > 3);

  const enough = buildCommitmentBreakdown(
    summary({ total: 17, completed: 12, inProgress: 4, skipped: 1 }, 0.71)
  );
  assert.equal(enough.completionRate, 0.71);
});

test('la barra e la quota di sedute in cui il tema e emerso', () => {
  const bars = buildThemeBars([theme('a', 6), theme('b', 3)], 8);

  assert.equal(bars[0].percent, 75);
  assert.equal(bars[1].percent, 38);
  assert.ok(Math.abs(bars[0].fill - 0.75) < 1e-9);
});

test('la quota non supera il cento per cento', () => {
  // Un tema puo' comparire piu' volte della soglia di conteggio: la barra si
  // ferma comunque al pieno invece di sfondare il riquadro.
  const [bar] = buildThemeBars([theme('a', 12)], 8);
  assert.equal(bar.percent, 100);
  assert.equal(bar.fill, 1);
});

test('letichetta e un conteggio, mai una percentuale', () => {
  const bars = buildThemeBars([theme('a', 6), theme('b', 1)], 29);

  assert.equal(bars[0].countLabel, 'In 6 sedute su 29');
  assert.equal(bars[1].countLabel, 'In 1 seduta su 29');
  for (const bar of bars) assert.ok(!bar.countLabel.includes('%'));
});

test('i temi arrivano ordinati per frequenza e tagliati al massimo', () => {
  const bars = buildThemeBars(
    [theme('c', 2), theme('a', 9), theme('e', 1), theme('b', 5), theme('d', 4), theme('f', 3)],
    12
  );

  assert.equal(bars.length, MAX_THEME_BARS);
  assert.deepEqual(
    bars.map((bar) => bar.occurrences),
    [9, 5, 4, 3, 2]
  );
});

test('nessun tema, nessuna barra', () => {
  assert.deepEqual(buildThemeBars([], 12), []);
});

test('la quota resta in centesimi lungo tutta la catena', () => {
  // 12 su 17 sono il 71%. Il dominio consegna 71, non 0,71: chi disegna
  // l'anello deve dividere per cento, e questo test lo pianta.
  const breakdown = buildCommitmentBreakdown(
    summary({ total: 17, completed: 12, inProgress: 4, skipped: 1 }, 71)
  );

  assert.equal(breakdown.completionRate, 71);
  assert.ok(
    breakdown.completionRate! > 1,
    'una quota in centesimi, non una frazione'
  );
});
