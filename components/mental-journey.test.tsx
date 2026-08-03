import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  FollowThroughSection,
  MentalJourneyEmptyState,
  MentalJourneyView,
  PointsToRevisitSection,
  RecurringThemesSection,
} from './mental-journey';
import type {
  FollowThroughItem,
  MentalJourney,
  MentalJourneyEntry,
} from '@/lib/core/ai-session-notes/mental-journey';

function entry(overrides: Partial<MentalJourneyEntry> = {}): MentalJourneyEntry {
  return {
    sessionId: 1,
    bookingId: 101,
    reportId: 1001,
    reportVersion: 1,
    sessionDate: '2026-08-01T09:00:00.000Z',
    approvedAt: '2026-08-02T10:00:00.000Z',
    coachName: 'Giulia Rossi',
    summary: 'Emerge una tensione pre-gara riferita dall’atleta.',
    themes: ['Attivazione pre-gara'],
    emergingResource: 'Costanza negli allenamenti',
    commitments: [
      {
        commitmentId: 7,
        title: 'Provare una routine di attivazione',
        owner: 'athlete',
        status: 'pending',
        dueDate: '2026-08-10',
        isOverdue: true,
      },
    ],
    compassHref: '/dashboard/appointments/101',
    ...overrides,
  };
}

function journey(overrides: Partial<MentalJourney> = {}): MentalJourney {
  return {
    athleteUserId: 20,
    summary: {
      firstSessionDate: '2026-07-01T09:00:00.000Z',
      lastSessionDate: '2026-08-01T09:00:00.000Z',
      approvedSessionCount: 2,
      commitments: { total: 3, completed: 1, inProgress: 1, pending: 1, skipped: 0 },
      completionRate: null,
    },
    timeline: [entry()],
    recurringThemes: [],
    followThrough: [],
    pointsToRevisit: [],
    ...overrides,
  };
}

test('lo stato vuoto è esplicito e invita al primo report approvato', () => {
  const html = renderToStaticMarkup(<MentalJourneyEmptyState athleteName="Marco" />);
  assert.match(html, /Il percorso inizia dal primo report approvato/);
  assert.match(html, /Con Marco/);
  assert.doesNotMatch(html, /Sessioni approvate/);
});

test('senza sessioni approvate la vista mostra lo stato vuoto, non la timeline', () => {
  const html = renderToStaticMarkup(
    <MentalJourneyView journey={journey({ timeline: [] })} athleteName="Marco" />
  );
  assert.match(html, /Il percorso inizia dal primo report approvato/);
  assert.doesNotMatch(html, /La storia del percorso/);
});

test('la sintesi mostra i conteggi e tace sulla percentuale quando è null', () => {
  const html = renderToStaticMarkup(
    <MentalJourneyView journey={journey()} athleteName="Marco" />
  );
  assert.match(html, /Il percorso di Marco/);
  assert.match(html, /Dal 1 luglio 2026 al 1 agosto 2026/);
  assert.match(html, /Sessioni approvate/);
  assert.match(html, /Ancora pochi impegni per una lettura d’insieme/);
  assert.doesNotMatch(html, /% degli impegni/);
});

test('mostra la percentuale solo quando il dominio la fornisce', () => {
  const html = renderToStaticMarkup(
    <MentalJourneyView
      journey={journey({
        summary: {
          ...journey().summary,
          commitments: { total: 10, completed: 8, inProgress: 1, pending: 1, skipped: 0 },
          completionRate: 80,
        },
      })}
      athleteName={null}
    />
  );
  assert.match(html, /80% degli impegni risulta completato/);
});

test('la card di sessione porta data, coach, sintesi, temi, risorsa e link al Compass', () => {
  const html = renderToStaticMarkup(
    <MentalJourneyView journey={journey()} athleteName="Marco" />
  );

  assert.match(html, /1 agosto 2026/);
  assert.match(html, /con Giulia Rossi/);
  assert.match(html, /Emerge una tensione pre-gara/);
  assert.match(html, /Attivazione pre-gara/);
  assert.match(html, /Risorsa emersa/);
  assert.match(html, /Apri il Session Compass/);
  assert.match(html, /href="\/dashboard\/appointments\/101"/);
});

test('gli stati degli impegni usano etichette e toni coerenti', () => {
  const items: FollowThroughItem[] = [
    {
      commitmentId: 1,
      title: 'Impegno completato',
      owner: 'athlete',
      status: 'completed',
      dueDate: null,
      isOverdue: false,
      sessionId: 1,
      bookingId: 101,
      sessionDate: '2026-08-01T09:00:00.000Z',
    },
    {
      commitmentId: 2,
      title: 'Impegno in corso',
      owner: 'coach',
      status: 'in_progress',
      dueDate: null,
      isOverdue: false,
      sessionId: 1,
      bookingId: 101,
      sessionDate: null,
    },
    {
      commitmentId: 3,
      title: 'Impegno saltato',
      owner: 'athlete',
      status: 'skipped',
      dueDate: null,
      isOverdue: false,
      sessionId: 1,
      bookingId: 101,
      sessionDate: null,
    },
    {
      commitmentId: 4,
      title: 'Impegno in ritardo',
      owner: 'athlete',
      status: 'pending',
      dueDate: '2026-08-01',
      isOverdue: true,
      sessionId: 1,
      bookingId: 101,
      sessionDate: null,
    },
  ];
  const html = renderToStaticMarkup(<FollowThroughSection items={items} />);

  assert.match(html, /Completato/);
  assert.match(html, /emerald/);
  assert.match(html, /In corso/);
  assert.match(html, /blue/);
  assert.match(html, /Da riprendere/);
  assert.match(html, /amber/);
  assert.match(html, /Da fare/);
  assert.match(html, /in ritardo/);
  assert.match(html, /Coach · sessione/);
});

test('i temi ricorrenti usano una formulazione prudente, senza direzione', () => {
  const html = renderToStaticMarkup(
    <RecurringThemesSection
      themes={[
        {
          key: 'attivazione pre gara',
          label: 'Attivazione pre-gara',
          occurrences: 3,
          firstSeenAt: '2026-07-01T09:00:00.000Z',
          lastSeenAt: '2026-08-01T09:00:00.000Z',
          sessionIds: [1, 2, 3],
          description: 'Tema emerso in 3 sessioni',
        },
      ]}
    />
  );

  assert.match(html, /Tema emerso in 3 sessioni/);
  assert.doesNotMatch(html, /miglior|peggior|progress|punteggio|score/i);
});

test('ogni punto da riprendere dichiara la propria fonte', () => {
  const html = renderToStaticMarkup(
    <PointsToRevisitSection
      points={[
        {
          id: 'prep:1:prep-1',
          text: 'Verificare come è andata la routine.',
          source: 'next_session_prep',
          sourceLabel: 'Dal report del 1 agosto',
          sessionId: 1,
          bookingId: 101,
        },
        {
          id: 'commitment:7',
          text: 'Provare una routine di attivazione',
          source: 'missed_commitment',
          sourceLabel: 'Impegno non completato — dalla sessione del 1 agosto',
          sessionId: 1,
          bookingId: 101,
        },
      ]}
    />
  );

  assert.match(html, /Dal report del 1 agosto/);
  assert.match(html, /Impegno non completato — dalla sessione del 1 agosto/);
  assert.match(html, /report già approvati/);
});

test('la vista è dichiaratamente di sola lettura e senza valutazioni cliniche', () => {
  const html = renderToStaticMarkup(
    <MentalJourneyView journey={journey()} athleteName="Marco" />
  );
  assert.match(html, /riservata al coach e sola lettura/);
  assert.match(html, /Non contiene valutazioni cliniche/);
  assert.doesNotMatch(html, /<textarea|<select|type="submit"/);
});

test('le sezioni facoltative scompaiono quando non hanno contenuto', () => {
  const html = renderToStaticMarkup(
    <MentalJourneyView journey={journey()} athleteName="Marco" />
  );
  assert.doesNotMatch(html, /Temi ricorrenti/);
  assert.doesNotMatch(html, /Da riprendere<\/h2>/);
  assert.doesNotMatch(html, /Impegni in corso/);
});
