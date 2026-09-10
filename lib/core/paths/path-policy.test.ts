import assert from 'node:assert/strict';
import test from 'node:test';
import {
  activePathsInOrder,
  authorizeContributionRevocation,
  authorizeNewContribution,
  authorizePathClosure,
  authorizePathReopen,
  bookingActivatesPath,
  coachMayReadContributions,
  planPathActivation,
  recipientNeedsExplicitChoice,
  roleInPath,
  type PathState,
} from './path-policy';

const COACH = 10;
const ATHLETE = 20;
const OTHER = 30;

function path(overrides: Partial<PathState> = {}): PathState {
  return {
    id: 1,
    coachUserId: COACH,
    athleteUserId: ATHLETE,
    status: 'active',
    closedByRole: null,
    contributionsRevokedAt: null,
    ...overrides,
  };
}

function reason(decision: { allowed: boolean; reason?: string }): string {
  return decision.allowed ? 'ALLOWED' : (decision.reason as string);
}

// --- attivazione -----------------------------------------------------------

test('solo una prenotazione accettata apre un percorso', () => {
  assert.equal(bookingActivatesPath('accepted'), true);
  for (const status of ['requested', 'declined', 'expired', 'cancelled', 'completed']) {
    assert.equal(bookingActivatesPath(status), false, status);
  }
});

test('una prenotazione accettata senza percorso ne crea uno', () => {
  const decision = planPathActivation({
    existing: null,
    bookingStatus: 'accepted',
    coachUserId: COACH,
    athleteUserId: ATHLETE,
  });
  assert.deepEqual(decision, { allowed: true, outcome: { kind: 'create' } });
});

test('gli altri stati non creano niente, nemmeno «completed»', () => {
  // Una prenotazione storica completata non deve far nascere un percorso: è
  // esattamente il passato da cui questo modello vuole smettere di dedurre.
  for (const status of ['requested', 'declined', 'expired', 'cancelled', 'completed']) {
    const decision = planPathActivation({
      existing: null,
      bookingStatus: status,
      coachUserId: COACH,
      athleteUserId: ATHLETE,
    });
    assert.deepEqual(decision, { allowed: true, outcome: { kind: 'noop' } }, status);
  }
});

test('un percorso già attivo non viene toccato', () => {
  const decision = planPathActivation({
    existing: path(),
    bookingStatus: 'accepted',
    coachUserId: COACH,
    athleteUserId: ATHLETE,
  });
  assert.deepEqual(decision, { allowed: true, outcome: { kind: 'noop' } });
});

test('una prenotazione accettata NON riapre un percorso chiuso: lo propone', () => {
  const decision = planPathActivation({
    existing: path({ status: 'closed', closedByRole: 'athlete' }),
    bookingStatus: 'accepted',
    coachUserId: COACH,
    athleteUserId: ATHLETE,
  });
  assert.deepEqual(decision, {
    allowed: true,
    outcome: { kind: 'propose_reopen', toRole: 'athlete' },
  });
});

test('la proposta di riapertura va a chi aveva chiuso', () => {
  const decision = planPathActivation({
    existing: path({ status: 'closed', closedByRole: 'coach' }),
    bookingStatus: 'accepted',
    coachUserId: COACH,
    athleteUserId: ATHLETE,
  });
  assert.equal(
    decision.allowed && decision.outcome.kind === 'propose_reopen'
      ? decision.outcome.toRole
      : null,
    'coach'
  );
});

test('senza ruolo registrato la proposta va all’atleta, la parte protetta', () => {
  const decision = planPathActivation({
    existing: path({ status: 'closed', closedByRole: null }),
    bookingStatus: 'accepted',
    coachUserId: COACH,
    athleteUserId: ATHLETE,
  });
  assert.equal(
    decision.allowed && decision.outcome.kind === 'propose_reopen'
      ? decision.outcome.toRole
      : null,
    'athlete'
  );
});

test('coach e atleta non possono coincidere', () => {
  assert.equal(
    reason(
      planPathActivation({
        existing: null,
        bookingStatus: 'accepted',
        coachUserId: COACH,
        athleteUserId: COACH,
      })
    ),
    'SAME_PERSON'
  );
});

// --- chiusura --------------------------------------------------------------

test('entrambe le parti possono chiudere, e il ruolo resta scritto', () => {
  for (const [actor, role] of [
    [COACH, 'coach'],
    [ATHLETE, 'athlete'],
  ] as const) {
    const decision = authorizePathClosure({
      path: path(),
      actorUserId: actor,
      hasFutureAcceptedBooking: false,
    });
    assert.deepEqual(decision, { allowed: true, outcome: { closedByRole: role } });
  }
});

test('un estraneo non chiude niente', () => {
  assert.equal(
    reason(
      authorizePathClosure({
        path: path(),
        actorUserId: OTHER,
        hasFutureAcceptedBooking: false,
      })
    ),
    'NOT_A_PARTICIPANT'
  );
});

test('con una sessione futura la chiusura si rifiuta invece di disdire', () => {
  const decision = authorizePathClosure({
    path: path(),
    actorUserId: ATHLETE,
    hasFutureAcceptedBooking: true,
  });
  assert.equal(reason(decision), 'FUTURE_BOOKING_EXISTS');
  assert.match(
    decision.allowed ? '' : decision.message,
    /sessione in calendario/
  );
});

test('un percorso già chiuso non si richiude', () => {
  assert.equal(
    reason(
      authorizePathClosure({
        path: path({ status: 'closed', closedByRole: 'coach' }),
        actorUserId: COACH,
        hasFutureAcceptedBooking: false,
      })
    ),
    'PATH_CLOSED'
  );
});

// --- riapertura ------------------------------------------------------------

test('riapre solo chi ha chiuso', () => {
  const closedByAthlete = path({ status: 'closed', closedByRole: 'athlete' });
  assert.equal(
    reason(authorizePathReopen({ path: closedByAthlete, actorUserId: ATHLETE })),
    'ALLOWED'
  );
  assert.equal(
    reason(authorizePathReopen({ path: closedByAthlete, actorUserId: COACH })),
    'NOT_THE_CLOSER'
  );
});

test('un percorso attivo non si riapre', () => {
  assert.equal(
    reason(authorizePathReopen({ path: path(), actorUserId: ATHLETE })),
    'PATH_ALREADY_ACTIVE'
  );
});

// --- i quattro livelli -----------------------------------------------------

test('A — un percorso chiuso non riceve contributi nuovi', () => {
  assert.equal(
    reason(
      authorizeNewContribution({
        path: path({ status: 'closed', closedByRole: 'athlete' }),
        athleteUserId: ATHLETE,
      })
    ),
    'PATH_CLOSED'
  );
});

test('A — la revoca ferma i contributi nuovi anche a percorso attivo', () => {
  assert.equal(
    reason(
      authorizeNewContribution({
        path: path({ contributionsRevokedAt: new Date('2026-09-01T10:00:00Z') }),
        athleteUserId: ATHLETE,
      })
    ),
    'CONTRIBUTIONS_REVOKED'
  );
});

test('A — solo l’atleta di quel percorso contribuisce', () => {
  assert.equal(
    reason(authorizeNewContribution({ path: path(), athleteUserId: OTHER })),
    'NOT_A_PARTICIPANT'
  );
  assert.equal(
    reason(authorizeNewContribution({ path: path(), athleteUserId: ATHLETE })),
    'ALLOWED'
  );
});

test('B — chiudere non toglie al coach lo storico già condiviso', () => {
  assert.equal(
    coachMayReadContributions({
      path: path({ status: 'closed', closedByRole: 'athlete' }),
      coachUserId: COACH,
    }),
    true
  );
});

test('B — la revoca sì, e solo quella', () => {
  assert.equal(
    coachMayReadContributions({
      path: path({ contributionsRevokedAt: new Date() }),
      coachUserId: COACH,
    }),
    false
  );
});

test('B — un altro coach non legge mai, comunque stia il percorso', () => {
  assert.equal(
    coachMayReadContributions({ path: path(), coachUserId: OTHER }),
    false
  );
});

test('C — la revoca è dell’atleta, non del coach', () => {
  assert.equal(
    reason(authorizeContributionRevocation({ path: path(), actorUserId: ATHLETE })),
    'ALLOWED'
  );
  assert.equal(
    reason(authorizeContributionRevocation({ path: path(), actorUserId: COACH })),
    'NOT_A_PARTICIPANT'
  );
});

// --- selezione del destinatario --------------------------------------------

test('l’ordine mette davanti il percorso con la sessione più vicina', () => {
  const paths = [
    path({ id: 1 }),
    path({ id: 2, coachUserId: 11 }),
    path({ id: 3, coachUserId: 12 }),
  ];
  const ordered = activePathsInOrder(paths, {
    nextSessionByPathId: new Map([
      [1, new Date('2026-09-20T10:00:00Z')],
      [2, new Date('2026-09-12T10:00:00Z')],
      [3, null],
    ]),
  });
  assert.deepEqual(ordered.map((p) => p.id), [2, 1, 3]);
});

test('chiusi e revocati non sono candidati a ricevere', () => {
  const ordered = activePathsInOrder([
    path({ id: 1, status: 'closed', closedByRole: 'coach' }),
    path({ id: 2, contributionsRevokedAt: new Date() }),
    path({ id: 3 }),
  ]);
  assert.deepEqual(ordered.map((p) => p.id), [3]);
});

test('con più di un percorso attivo la scelta del destinatario è obbligatoria', () => {
  assert.equal(recipientNeedsExplicitChoice(0), false);
  assert.equal(recipientNeedsExplicitChoice(1), false);
  assert.equal(recipientNeedsExplicitChoice(2), true);
});

test('roleInPath riconosce le due parti e nessun altro', () => {
  assert.equal(roleInPath(path(), COACH), 'coach');
  assert.equal(roleInPath(path(), ATHLETE), 'athlete');
  assert.equal(roleInPath(path(), OTHER), null);
});
