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
    sharedAt: null,
    approvedAt: '2026-08-02T10:00:00.000Z',
    coachName: 'Giulia Rossi',
    summary: 'Emerge una tensione pre-gara riferita dall’atleta.',
    focus: 'Attivazione pre-gara',
    themes: ['Attivazione pre-gara'],
    emergingResource: 'Costanza negli allenamenti',
    keyMoments: [],
    nextSessionPrep: [],
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
    throughLine: null,
    isApproved: true,
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
      draftSessionCount: 0,
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
  // Il titolo sta deliberatamente su due righe, come nel disegno: si
  // verificano le due parti, non la stringa contigua.
  assert.match(html, /Il percorso di/);
  assert.match(html, /Marco/);
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
  assert.match(html, /Apri il riepilogo sessione/);
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
  // Il riferimento alla seduta e' un rimando, non un sottotitolo: trattino
  // lungo e non punto mediano.
  assert.match(html, /Coach — sessione/);
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
          fromDraft: false,
          sourceLabel: 'Dal report del 1 agosto',
          sessionId: 1,
          bookingId: 101,
        },
        {
          id: 'commitment:7',
          text: 'Provare una routine di attivazione',
          source: 'missed_commitment',
          fromDraft: false,
          sourceLabel: 'Impegno non completato — dalla sessione del 1 agosto',
          sessionId: 1,
          bookingId: 101,
        },
      ]}
    />
  );

  assert.match(html, /Dal report del 1 agosto/);
  assert.match(html, /Impegno non completato — dalla sessione del 1 agosto/);
  // Non più «report già approvati»: il percorso legge anche le bozze
  // (`JOURNEY_REPORT_STATUSES`), quindi quella frase affermava una cosa falsa
  // proprio nel punto in cui i punti diventano il piano della seduta.
  assert.match(html, /riepiloghi delle sedute/);
  assert.doesNotMatch(html, /già approvati/);
  assert.doesNotMatch(html, /Da validare/);
});

test('un punto preso da una bozza lo dichiara sulla riga della fonte', () => {
  const html = renderToStaticMarkup(
    <PointsToRevisitSection
      points={[
        {
          id: 'prep:1:prep-1',
          text: 'Riprendere la frase sul gruppo.',
          source: 'next_session_prep',
          fromDraft: true,
          sourceLabel: 'Dal report del 1 agosto',
          sessionId: 1,
          bookingId: 101,
        },
      ]}
    />
  );

  assert.match(html, /Da validare/);
  assert.match(html, /non hai ancora validato/);
});

/*
 * Il pulsante «Preparati», nella scheda della prossima call, punta all'ancora
 * di questa sezione. Se la sezione sparisce quando non ci sono spunti, quel
 * pulsante apre una pagina in cima e sembra non aver fatto niente — la stessa
 * forma di errore gia' pagata con `#session-compass`.
 */
test('senza spunti la sezione resta se le si da un messaggio, e dice perche', () => {
  const muta = renderToStaticMarkup(<PointsToRevisitSection points={[]} />);
  assert.equal(muta, '', 'dove è una voce fra le altre, vuota sparisce');

  const html = renderToStaticMarkup(
    <PointsToRevisitSection
      points={[]}
      heading="Da portare in questa seduta"
      intro="Ricavato dalle sedute precedenti."
      emptyMessage="Niente da riprendere, per ora. Gli spunti nascono dai riepiloghi delle sedute precedenti."
    />
  );

  assert.match(html, /id="mental-journey-revisit"/);
  assert.match(html, /Da portare in questa seduta/);
  assert.match(html, /Niente da riprendere/);
  // Vuota, la sezione non promette un contenuto che non ha.
  assert.doesNotMatch(html, /Ricavato dalle sedute precedenti/);
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
