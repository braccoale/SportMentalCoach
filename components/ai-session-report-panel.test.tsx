import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  AiSessionReportContent,
  AiSessionReportPanel,
} from './ai-session-report-panel';
import { canShowAiSessionReport } from '@/lib/core/ai-session-notes/report-visibility';
import {
  AI_SESSION_REPORT_SCHEMA_VERSION,
  type AiSessionReport,
} from '@/lib/core/ai-session-notes/session-report-contract';

function report(overrides: Partial<AiSessionReport> = {}): AiSessionReport {
  return {
    schemaVersion: AI_SESSION_REPORT_SCHEMA_VERSION,
    reportId: 'draft-1',
    sessionId: '44',
    conversationId: 'ai-session-44',
    language: 'it',
    status: 'draft',
    summary: { text: 'Sintesi verificabile.', sourceTurnIndexes: [1, 2] },
    themes: [{ id: 'theme-1', text: 'Preparazione', sourceTurnIndexes: [1] }],
    athleteStatements: [{ id: 'athlete-1', text: 'Mi sono sentito ansioso.', sourceTurnIndexes: [2] }],
    coachObservations: [{ id: 'coach-1', text: 'Da verificare con il coach.', sourceTurnIndexes: [1, 2] }],
    goals: [{ id: 'goal-1', text: 'Allenare la respirazione.', sourceTurnIndexes: [2] }],
    exercisesOrHomework: [{ id: 'exercise-1', text: 'Tenere un diario.', sourceTurnIndexes: [2] }],
    followUpQuestions: [{ id: 'follow-up-1', text: 'Come è andata?', rationale: 'Per la prossima sessione.', sourceTurnIndexes: [1] }],
    safetyFlags: [{ id: 'safety-1', category: 'medical', severity: 'medium', description: 'Da verificare con un professionista.', sourceTurnIndexes: [2], requiresHumanReview: true }],
    generation: {
      provider: 'fake',
      model: 'fake-model',
      promptVersion: 'mvp-v1',
      contractVersion: AI_SESSION_REPORT_SCHEMA_VERSION,
      generatedAt: '2026-07-31T10:00:00.000Z',
    },
    createdAt: '2026-07-31T10:00:00.000Z',
    ...overrides,
  };
}

test('renders the report as an explicitly reviewable Italian draft with evidence labels', () => {
  const html = renderToStaticMarkup(<AiSessionReportContent report={report()} />);

  assert.match(html, /Bozza AI — da verificare/);
  assert.match(html, /Sintesi/);
  assert.match(html, /Temi principali/);
  assert.match(html, /Cosa ha espresso l’atleta/);
  assert.match(html, /Osservazioni per il coach/);
  assert.match(html, /Obiettivi/);
  assert.match(html, /Esercizi o attività concordate/);
  assert.match(html, /Domande per la prossima sessione/);
  assert.match(html, /Riferimenti: interventi 1, 2/);
  assert.match(html, /Verifica umana necessaria/);
  assert.match(html, /richiedono verifica umana/);
});

test('omits empty optional report sections', () => {
  const html = renderToStaticMarkup(
    <AiSessionReportContent
      report={report({
        themes: [],
        athleteStatements: [],
        coachObservations: [],
        goals: [],
        exercisesOrHomework: [],
        followUpQuestions: [],
        safetyFlags: [],
      })}
    />
  );

  assert.match(html, /Sintesi/);
  assert.doesNotMatch(html, /Temi principali/);
  assert.doesNotMatch(html, /Segnalazioni da verificare/);
  assert.doesNotMatch(html, /Domande per la prossima sessione/);
});

test('renders the transcript loading state before the client fetch completes', () => {
  const html = renderToStaticMarkup(<AiSessionReportPanel sessionId={44} />);
  assert.match(html, /Trascrizione e report della sessione/);
  assert.match(html, /Caricamento trascrizione/);
});

test('shows the AI report panel only to an enabled coach with an AI Notes session', () => {
  assert.equal(
    canShowAiSessionReport({ viewerRole: 'coach', aiNotesEnabled: true, hasAiNotesSession: true }),
    true
  );
  assert.equal(
    canShowAiSessionReport({ viewerRole: 'coach', aiNotesEnabled: false, hasAiNotesSession: true }),
    false
  );
  assert.equal(
    canShowAiSessionReport({ viewerRole: 'athlete', aiNotesEnabled: true, hasAiNotesSession: true }),
    false
  );
});
