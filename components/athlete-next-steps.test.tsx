import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { AthleteNextSteps } from './athlete-next-steps';
import type { AthleteCommitmentView } from '@/lib/core/ai-session-notes/session-commitments';
import type { ActionState } from '@/lib/auth/middleware';

async function noopAction(): Promise<ActionState> {
  return {};
}

function commitment(overrides: Partial<AthleteCommitmentView> = {}): AthleteCommitmentView {
  return {
    id: 1,
    title: 'Provare una routine di attivazione',
    status: 'pending',
    dueDate: '2026-08-20',
    completedAt: null,
    athleteNote: null,
    coachName: 'Giulia Rossi',
    bookingId: 77,
    sessionDate: '2026-07-30T09:00:00.000Z',
    ...overrides,
  };
}

test('mostra testo, scadenza, coach e sessione di origine', () => {
  const html = renderToStaticMarkup(
    <AthleteNextSteps commitments={[commitment()]} action={noopAction} />
  );

  assert.match(html, /I tuoi prossimi passi/);
  assert.match(html, /Provare una routine di attivazione/);
  assert.match(html, /Entro il 20 agosto/);
  assert.match(html, /Con Giulia Rossi/);
  assert.match(html, /\/dashboard\/appointments\/77/);
  assert.match(html, /Sessione del 30 luglio/);
});

test('offre completato e non sono riuscito con nota facoltativa', () => {
  const html = renderToStaticMarkup(
    <AthleteNextSteps commitments={[commitment()]} action={noopAction} />
  );

  assert.match(html, /value="completed"/);
  assert.match(html, /value="skipped"/);
  assert.match(html, /name="note"/);
  assert.match(html, /facoltativo/);
});

test('mostra l’esito già dichiarato e nasconde le azioni', () => {
  const completed = renderToStaticMarkup(
    <AthleteNextSteps
      commitments={[commitment({ status: 'completed', completedAt: '2026-08-06T08:00:00.000Z' })]}
      action={noopAction}
    />
  );
  assert.match(completed, /Completato/);
  assert.doesNotMatch(completed, /name="note"/);

  const skipped = renderToStaticMarkup(
    <AthleteNextSteps
      commitments={[commitment({ status: 'skipped', athleteNote: 'Ho avuto una gara.' })]}
      action={noopAction}
    />
  );
  assert.match(skipped, /Non ci sono riuscito/);
  assert.match(skipped, /Ho avuto una gara\./);
  assert.doesNotMatch(skipped, /name="note"/);
});

test('gestisce un impegno senza scadenza', () => {
  const html = renderToStaticMarkup(
    <AthleteNextSteps commitments={[commitment({ dueDate: null })]} action={noopAction} />
  );
  assert.match(html, /Senza scadenza/);
});

test('non rende nulla quando l’atleta non ha impegni', () => {
  const html = renderToStaticMarkup(
    <AthleteNextSteps commitments={[]} action={noopAction} />
  );
  assert.equal(html, '');
});

test('la proiezione atleta non contiene contenuti riservati del Compass', () => {
  const html = renderToStaticMarkup(
    <AthleteNextSteps commitments={[commitment()]} action={noopAction} />
  );

  for (const forbidden of [
    /Momenti chiave/,
    /Sintesi della sessione/,
    /Nota del coach/,
    /Preparazione prossima sessione/,
    /Temi emersi/,
    /Trascrizione/,
  ]) {
    assert.doesNotMatch(html, forbidden);
  }
});
