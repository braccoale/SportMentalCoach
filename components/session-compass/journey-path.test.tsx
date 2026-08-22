import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import type { JourneyStage } from '@/lib/core/ai-session-notes/journey-stages';
import { JourneyPath } from './journey-path';

test('evidenzia in rosso lo stato da validare nella card', () => {
  const stages: JourneyStage[] = [
    stage({ sessionId: 1, isApproved: true, isCurrent: false }),
    stage({ sessionId: 2, isApproved: false, isCurrent: true }),
  ];

  const html = renderToStaticMarkup(
    <JourneyPath
      stages={stages}
      totalSessions={2}
      allSessionsHref="/dashboard/coach/athletes/7"
      now={new Date('2026-08-22T12:00:00.000Z')}
    />
  );

  assert.match(
    html,
    /class="mt-2 inline-flex items-center gap-1 text-\[11px\] font-semibold text-kp-red"[^>]*>.*?Da validare<\/p>/s
  );
  assert.match(
    html,
    /class="text-xs font-medium text-gray-500">Da validare<\/span>/
  );
});

function stage(
  overrides: Pick<JourneyStage, 'sessionId' | 'isApproved' | 'isCurrent'>
): JourneyStage {
  return {
    bookingId: 100 + overrides.sessionId,
    isShared: false,
    kind: overrides.isCurrent ? 'focus_attuale' : 'strategia',
    category: 'awareness',
    title: overrides.isCurrent ? 'Focus attuale' : 'Prima consapevolezza',
    description: 'Descrizione sintetica della seduta.',
    sessionDate: `2026-08-${String(10 + overrides.sessionId).padStart(2, '0')}T10:00:00.000Z`,
    href: `/dashboard/appointments/${100 + overrides.sessionId}`,
    sourceMomentId: `moment-${overrides.sessionId}`,
    relevance: 2,
    isPlanned: false,
    ticksToNext: [],
    ...overrides,
  };
}
