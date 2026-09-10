import assert from 'node:assert/strict';
import test from 'node:test';
import {
  pathsWithUpcomingSession,
  selectPendingRequest,
  selectPrincipalAction,
  selectTodayState,
  todayCopy,
  type TodayAction,
  type TodayInput,
} from './athlete-today';

/** Giovedì 10 settembre 2026, 18:15 italiane. */
const NOW = new Date('2026-09-10T16:15:00Z');

function action(overrides: Partial<TodayAction> = {}): TodayAction {
  return {
    commitmentId: 1,
    pathId: 7,
    title: 'Prima della battuta, tre respiri e una parola sola: dove tiro.',
    coachName: 'Marco',
    dueDate: null,
    agreedOn: new Date('2026-09-08T16:00:00Z'),
    pausedAt: null,
    pausedReason: null,
    attemptCount: 0,
    lastAttemptOn: null,
    ...overrides,
  };
}

function input(overrides: Partial<TodayInput> = {}): TodayInput {
  return {
    activePathCount: 1,
    knownPathCount: 1,
    closedPath: null,
    actions: [],
    nextBooking: null,
    requests: [],
    now: NOW,
    ...overrides,
  };
}

// --- i sette stati, e la loro esclusività ----------------------------------

test('i sette stati coprono i casi e nessuno si sovrappone', () => {
  const cases: Array<[string, TodayInput]> = [
    [
      'can_join',
      input({
        nextBooking: {
          bookingId: 1,
          pathId: 7,
          scheduledFor: new Date('2026-09-10T16:18:00Z'),
          durationMin: 40,
          coachName: 'Marco',
        },
        actions: [action()],
      }),
    ],
    [
      'session_soon',
      input({
        nextBooking: {
          bookingId: 1,
          pathId: 7,
          scheduledFor: new Date('2026-09-10T17:30:00Z'),
          durationMin: 40,
          coachName: 'Marco',
        },
        actions: [action()],
      }),
    ],
    ['action', input({ actions: [action()] })],
    [
      'awaiting_request',
      input({
        requests: [
          {
            bookingId: 5,
            coachName: 'Marco',
            requestedAt: new Date('2026-09-10T07:40:00Z'),
            scheduledFor: new Date('2026-09-15T16:00:00Z'),
            durationMin: 40,
          },
        ],
      }),
    ],
    ['no_action', input()],
    [
      'no_active_path',
      input({
        activePathCount: 0,
        knownPathCount: 1,
        closedPath: {
          pathId: 1,
          coachName: 'Marco',
          closedByRole: 'athlete',
          closedAt: new Date('2026-09-02T10:00:00Z'),
        },
      }),
    ],
    ['brand_new', input({ activePathCount: 0, knownPathCount: 0 })],
  ];

  for (const [expected, given] of cases) {
    assert.equal(selectTodayState(given).key, expected, expected);
  }
});

test('una sessione che sta per cominciare batte l’azione, che però non sparisce', () => {
  const state = selectTodayState(
    input({
      actions: [action()],
      nextBooking: {
        bookingId: 1,
        pathId: 7,
        scheduledFor: new Date('2026-09-10T17:30:00Z'),
        durationMin: 40,
        coachName: 'Marco',
      },
    })
  );
  assert.equal(state.key, 'session_soon');
  assert.equal(state.action?.commitmentId, 1);
  assert.equal(state.openActionCount, 1);
});

test('«Entra» usa la regola del server, non una soglia inventata', () => {
  // La stanza apre cinque minuti prima. A un'ora di distanza si è «fra poco»,
  // non «puoi entrare»: dire il contrario manderebbe qualcuno contro un
  // rifiuto del server.
  const booking = (minutesFromNow: number) => ({
    bookingId: 1,
    pathId: 7,
    scheduledFor: new Date(NOW.getTime() + minutesFromNow * 60_000),
    durationMin: 40,
    coachName: 'Marco',
  });
  assert.equal(selectTodayState(input({ nextBooking: booking(60) })).canJoinNow, false);
  assert.equal(selectTodayState(input({ nextBooking: booking(60) })).key, 'session_soon');
  assert.equal(selectTodayState(input({ nextBooking: booking(4) })).canJoinNow, true);
  assert.equal(selectTodayState(input({ nextBooking: booking(-10) })).canJoinNow, true);
  // Finita da un pezzo: la stanza è chiusa e non si è più «fra poco».
  assert.equal(selectTodayState(input({ nextBooking: booking(-120) })).canJoinNow, false);
});

test('una sessione lontana non fa scattare «fra poco»', () => {
  const state = selectTodayState(
    input({
      nextBooking: {
        bookingId: 1,
        pathId: 7,
        scheduledFor: new Date('2026-09-15T16:00:00Z'),
        durationMin: 40,
        coachName: 'Marco',
      },
    })
  );
  assert.equal(state.key, 'no_action');
});

// --- la pausa --------------------------------------------------------------

test('un’azione in pausa non viene proposta, ma resta raggiungibile', () => {
  const state = selectTodayState(
    input({ actions: [action({ pausedAt: new Date('2026-09-09T10:00:00Z') })] })
  );
  assert.equal(state.key, 'no_action');
  assert.equal(state.action, null);
  // Non è sparita: è nell'elenco, ed è il conteggio che lo dice.
  assert.equal(state.openActionCount, 1);
  assert.equal(state.otherActions.length, 1);
});

test('con una in pausa e una attiva, viene proposta quella attiva', () => {
  const state = selectTodayState(
    input({
      actions: [
        action({ commitmentId: 1, pausedAt: new Date('2026-09-09T10:00:00Z') }),
        action({ commitmentId: 2 }),
      ],
    })
  );
  assert.equal(state.key, 'action');
  assert.equal(state.action?.commitmentId, 2);
  assert.deepEqual(state.otherActions.map((a) => a.commitmentId), [1]);
});

// --- «Per adesso è tutto» non esiste più -----------------------------------

test('dopo una prova la schermata resta sull’azione, non svuota', () => {
  // Il difetto della prima stesura: «Provata» chiudeva l'azione, e la
  // schermata successiva era «Per adesso è tutto» — dopo una sola interazione.
  const state = selectTodayState(
    input({ actions: [action({ attemptCount: 1, lastAttemptOn: '2026-09-09' })] })
  );
  assert.equal(state.key, 'action');
  assert.equal(state.action?.attemptCount, 1);
  assert.match(todayCopy(state).body, /provata 1 volta/);
});

test('il testo distingue una prova da più prove', () => {
  const uno = selectTodayState(input({ actions: [action({ attemptCount: 1 })] }));
  const due = selectTodayState(input({ actions: [action({ attemptCount: 2 })] }));
  assert.match(todayCopy(uno).body, /1 volta\./);
  assert.match(todayCopy(due).body, /2 volte\./);
  const zero = selectTodayState(input({ actions: [action()] }));
  assert.equal(todayCopy(zero).body, 'Concordata con Marco.');
});

// --- scelta con più azioni e più coach -------------------------------------

test('vince l’azione del percorso con una sessione vicina', () => {
  const chosen = selectPrincipalAction(
    [
      action({ commitmentId: 1, pathId: 7, agreedOn: new Date('2026-09-09T10:00:00Z') }),
      action({ commitmentId: 2, pathId: 8, agreedOn: new Date('2026-09-01T10:00:00Z') }),
    ],
    { pathsWithUpcomingSession: new Set([8]) }
  );
  assert.equal(chosen?.commitmentId, 2);
});

test('a parità, vince la più recente; poi quella con meno prove', () => {
  assert.equal(
    selectPrincipalAction([
      action({ commitmentId: 1, agreedOn: new Date('2026-09-01T10:00:00Z') }),
      action({ commitmentId: 2, agreedOn: new Date('2026-09-08T10:00:00Z') }),
    ])?.commitmentId,
    2
  );
  const same = new Date('2026-09-08T10:00:00Z');
  assert.equal(
    selectPrincipalAction([
      action({ commitmentId: 1, agreedOn: same, attemptCount: 3 }),
      action({ commitmentId: 2, agreedOn: same, attemptCount: 0 }),
    ])?.commitmentId,
    2
  );
});

test('l’ordine non cambia fra due letture identiche', () => {
  const same = new Date('2026-09-08T10:00:00Z');
  const actions = [
    action({ commitmentId: 5, agreedOn: same }),
    action({ commitmentId: 3, agreedOn: same }),
  ];
  assert.equal(selectPrincipalAction(actions)?.commitmentId, 3);
  assert.equal(selectPrincipalAction(actions.slice().reverse())?.commitmentId, 3);
});

test('il nome del coach è sempre disponibile: con due percorsi è l’unica disambiguazione', () => {
  const state = selectTodayState(
    input({
      activePathCount: 2,
      knownPathCount: 2,
      actions: [
        action({ commitmentId: 1, pathId: 7, coachName: 'Marco' }),
        action({ commitmentId: 2, pathId: 8, coachName: 'Elena' }),
      ],
    })
  );
  assert.ok(state.action?.coachName);
  assert.ok(state.otherActions.every((a) => a.coachName.length > 0));
});

// --- richieste in attesa ---------------------------------------------------

test('una richiesta scaduta non è «in attesa»', () => {
  const scaduta = {
    bookingId: 5,
    coachName: 'Marco',
    requestedAt: new Date('2026-09-01T07:40:00Z'),
    scheduledFor: new Date('2026-09-02T16:00:00Z'),
    durationMin: 40,
  };
  assert.equal(selectPendingRequest([scaduta], NOW), null);
  assert.equal(selectTodayState(input({ requests: [scaduta] })).key, 'no_action');
});

test('fra più richieste vive si mostra la più vecchia', () => {
  const chosen = selectPendingRequest(
    [
      {
        bookingId: 6,
        coachName: 'Elena',
        requestedAt: new Date('2026-09-10T09:00:00Z'),
        scheduledFor: new Date('2026-09-16T16:00:00Z'),
        durationMin: 40,
      },
      {
        bookingId: 5,
        coachName: 'Marco',
        requestedAt: new Date('2026-09-10T07:40:00Z'),
        scheduledFor: new Date('2026-09-15T16:00:00Z'),
        durationMin: 40,
      },
    ],
    NOW
  );
  assert.equal(chosen?.bookingId, 5);
});

// --- finestra dei percorsi -------------------------------------------------

test('la finestra dei sette giorni ignora il passato e il troppo lontano', () => {
  const paths = pathsWithUpcomingSession(
    [
      { bookingId: 1, pathId: 7, scheduledFor: new Date('2026-09-12T16:00:00Z'), durationMin: 40, coachName: 'M' },
      { bookingId: 2, pathId: 8, scheduledFor: new Date('2026-09-30T16:00:00Z'), durationMin: 40, coachName: 'E' },
      { bookingId: 3, pathId: 9, scheduledFor: new Date('2026-09-01T16:00:00Z'), durationMin: 40, coachName: 'G' },
      { bookingId: 4, pathId: null, scheduledFor: new Date('2026-09-12T16:00:00Z'), durationMin: 40, coachName: 'X' },
    ],
    NOW
  );
  assert.deepEqual([...paths], [7]);
});

// --- i vuoti spiegano perché sono vuoti ------------------------------------

test('nessuno stato vuoto propone un esercizio inventato', () => {
  const vuoti: TodayInput[] = [
    input(),
    input({
      activePathCount: 0,
      knownPathCount: 1,
      closedPath: {
        pathId: 1,
        coachName: 'Marco',
        closedByRole: 'coach',
        closedAt: new Date('2026-09-02T10:00:00Z'),
      },
    }),
    input({ activePathCount: 0, knownPathCount: 0 }),
  ];
  for (const given of vuoti) {
    const copy = todayCopy(selectTodayState(given));
    assert.ok(copy.title.length > 0);
    // Il vuoto dice perché è vuoto: una frase sola, «Nessun elemento», non
    // basterebbe, e una proposta di esercizio sarebbe inventata.
    assert.ok(copy.body.length > 20, copy.body);
    for (const parola of ['respir', 'esercizi', 'prova a', 'visualizza']) {
      assert.equal(
        copy.body.toLowerCase().includes(parola),
        false,
        `«${parola}» in uno stato vuoto`
      );
    }
  }
});

test('il percorso chiuso dice chi l’ha chiuso e che lo storico resta', () => {
  const daMe = todayCopy(
    selectTodayState(
      input({
        activePathCount: 0,
        knownPathCount: 1,
        closedPath: {
          pathId: 1,
          coachName: 'Marco',
          closedByRole: 'athlete',
          closedAt: new Date('2026-09-02T10:00:00Z'),
        },
      })
    )
  );
  assert.match(daMe.body, /L’hai chiuso tu/);
  assert.match(daMe.body, /resta qui/);

  const dalCoach = todayCopy(
    selectTodayState(
      input({
        activePathCount: 0,
        knownPathCount: 1,
        closedPath: {
          pathId: 1,
          coachName: 'Marco',
          closedByRole: 'coach',
          closedAt: new Date('2026-09-02T10:00:00Z'),
        },
      })
    )
  );
  assert.match(dalCoach.body, /L’ha chiuso Marco/);
});

test('nessun testo promette una lettura o una risposta entro un momento preciso', () => {
  const stati: TodayInput[] = [
    input({ actions: [action()] }),
    input(),
    input({
      requests: [
        {
          bookingId: 5,
          coachName: 'Marco',
          requestedAt: new Date('2026-09-10T07:40:00Z'),
          scheduledFor: new Date('2026-09-15T16:00:00Z'),
          durationMin: 40,
        },
      ],
    }),
  ];
  for (const given of stati) {
    const copy = todayCopy(selectTodayState(given));
    const testo = `${copy.title} ${copy.body}`.toLowerCase();
    for (const promessa of ['leggerà', 'risponderà', 'entro', 'ti risponde']) {
      assert.equal(testo.includes(promessa), false, `«${promessa}» in «${testo}»`);
    }
  }
});
