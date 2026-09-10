import assert from 'node:assert/strict';
import test from 'node:test';
import type { PathState } from '../paths/path-policy';
import {
  attemptAuditDetail,
  planAttempt,
  planAttemptEdit,
  planPause,
  planResume,
  romeCalendarDay,
  toAttemptViews,
  type AttemptRow,
  type CommitmentForAttempt,
} from './commitment-attempts';

const COACH = 10;
const ATHLETE = 20;
const OTHER_COACH = 11;
const OTHER_ATHLETE = 21;

/** Mercoledì 10 settembre 2026, sera: l'ora della settimana di Giulia. */
const NOW = new Date('2026-09-10T18:15:00Z');
const REQUEST_ID = '3f1a9c2e-5b7d-4c11-9a63-8d2e4f6b0c77';

function commitment(overrides: Partial<CommitmentForAttempt> = {}): CommitmentForAttempt {
  return {
    id: 500,
    sessionAiNotesId: 900,
    athleteUserId: ATHLETE,
    coachUserId: COACH,
    owner: 'athlete',
    status: 'pending',
    archivedAt: null,
    pausedAt: null,
    ...overrides,
  };
}

function path(overrides: Partial<PathState> = {}): PathState {
  return {
    id: 7,
    coachUserId: COACH,
    athleteUserId: ATHLETE,
    status: 'active',
    closedByRole: null,
    contributionsRevokedAt: null,
    ...overrides,
  };
}

function input(overrides: Record<string, unknown> = {}) {
  return {
    outcome: 'provata',
    occurredOn: '2026-09-10',
    clientRequestId: REQUEST_ID,
    ...overrides,
  };
}

function why(decision: { ok: boolean; reason?: string }): string {
  return decision.ok ? 'OK' : (decision.reason as string);
}

// --- registrare una prova --------------------------------------------------

test('una prova valida viene accettata e non porta con sé nessuno stato', () => {
  const decision = planAttempt({
    commitment: commitment(),
    path: path(),
    athleteUserId: ATHLETE,
    input: input({ note: '  ci ho provato in tre battute su sei  ' }),
    now: NOW,
  });
  assert.ok(decision.ok);
  assert.deepEqual(decision.value, {
    commitmentId: 500,
    athleteUserId: ATHLETE,
    pathId: 7,
    outcome: 'provata',
    note: 'ci ho provato in tre battute su sei',
    occurredOn: '2026-09-10',
    clientRequestId: REQUEST_ID,
  });
  // Il piano non contiene «status» né «completedAt»: registrare una prova non
  // è, e non deve diventare, un modo per chiudere l'azione.
  assert.equal('status' in decision.value, false);
  assert.equal('completedAt' in decision.value, false);
});

test('la nota è ammessa su tutti e tre gli esiti, non solo quando va male', () => {
  for (const outcome of ['provata', 'non_ancora', 'non_adatta'] as const) {
    const decision = planAttempt({
      commitment: commitment(),
      path: path(),
      athleteUserId: ATHLETE,
      input: input({ outcome, note: 'una riga' }),
      now: NOW,
    });
    assert.ok(decision.ok, outcome);
    assert.equal(decision.value.note, 'una riga');
    assert.equal(decision.value.outcome, outcome);
  }
});

test('una nota vuota o di soli spazi diventa assenza di nota', () => {
  for (const note of ['', '   ', undefined, null]) {
    const decision = planAttempt({
      commitment: commitment(),
      path: path(),
      athleteUserId: ATHLETE,
      input: input({ note }),
      now: NOW,
    });
    assert.ok(decision.ok);
    assert.equal(decision.value.note, null);
  }
});

test('la stessa azione accetta più prove: nessuna esclude le altre', () => {
  // È il caso della settimana di Giulia: mercoledì in allenamento, sabato in
  // partita. La regola pura non conosce «già provata» e non deve conoscerla.
  const mercoledi = planAttempt({
    commitment: commitment(),
    path: path(),
    athleteUserId: ATHLETE,
    input: input({ outcome: 'provata', occurredOn: '2026-09-09' }),
    now: NOW,
  });
  const sabato = planAttempt({
    commitment: commitment(),
    path: path(),
    athleteUserId: ATHLETE,
    input: input({
      outcome: 'non_adatta',
      occurredOn: '2026-09-10',
      clientRequestId: 'aa11bb22-cc33-4d44-9e55-ff6677889900',
    }),
    now: NOW,
  });
  assert.ok(mercoledi.ok && sabato.ok);
  assert.notEqual(mercoledi.value.clientRequestId, sabato.value.clientRequestId);
});

test('un’azione in pausa accetta comunque una prova', () => {
  // Altrimenti «riprendi la routine» non potrebbe funzionare: la ripresa è un
  // gesto, ma provarla di nuovo deve restare possibile in ogni caso.
  const decision = planAttempt({
    commitment: commitment({ pausedAt: new Date('2026-09-08T09:00:00Z') }),
    path: path(),
    athleteUserId: ATHLETE,
    input: input(),
    now: NOW,
  });
  assert.ok(decision.ok);
});

test('un’azione chiusa dal coach o archiviata non accetta prove', () => {
  assert.equal(
    why(
      planAttempt({
        commitment: commitment({ status: 'completed' }),
        path: path(),
        athleteUserId: ATHLETE,
        input: input(),
        now: NOW,
      })
    ),
    'COMMITMENT_CLOSED'
  );
  assert.equal(
    why(
      planAttempt({
        commitment: commitment({ archivedAt: new Date() }),
        path: path(),
        athleteUserId: ATHLETE,
        input: input(),
        now: NOW,
      })
    ),
    'COMMITMENT_ARCHIVED'
  );
});

test('un’azione di un altro atleta, o del coach, non è provabile', () => {
  assert.equal(
    why(
      planAttempt({
        commitment: commitment({ athleteUserId: OTHER_ATHLETE }),
        path: path(),
        athleteUserId: ATHLETE,
        input: input(),
        now: NOW,
      })
    ),
    'NOT_YOUR_COMMITMENT'
  );
  assert.equal(
    why(
      planAttempt({
        commitment: commitment({ owner: 'coach' }),
        path: path(),
        athleteUserId: ATHLETE,
        input: input(),
        now: NOW,
      })
    ),
    'NOT_YOUR_COMMITMENT'
  );
});

test('un’azione di un altro percorso viene rifiutata, non riassegnata', () => {
  // L'isolamento fra coach: senza questo controllo, il testo di una prova su
  // un'azione concordata con un coach finirebbe sotto gli occhi dell'altro.
  assert.equal(
    why(
      planAttempt({
        commitment: commitment({ coachUserId: OTHER_COACH }),
        path: path(),
        athleteUserId: ATHLETE,
        input: input(),
        now: NOW,
      })
    ),
    'PATH_MISMATCH'
  );
});

test('percorso chiuso e condivisione revocata fermano le prove nuove', () => {
  assert.equal(
    why(
      planAttempt({
        commitment: commitment(),
        path: path({ status: 'closed', closedByRole: 'athlete' }),
        athleteUserId: ATHLETE,
        input: input(),
        now: NOW,
      })
    ),
    'PATH_CLOSED'
  );
  assert.equal(
    why(
      planAttempt({
        commitment: commitment(),
        path: path({ contributionsRevokedAt: new Date() }),
        athleteUserId: ATHLETE,
        input: input(),
        now: NOW,
      })
    ),
    'CONTRIBUTIONS_REVOKED'
  );
});

test('la data non può stare nel futuro né troppo indietro', () => {
  assert.equal(
    why(
      planAttempt({
        commitment: commitment(),
        path: path(),
        athleteUserId: ATHLETE,
        input: input({ occurredOn: '2026-09-11' }),
        now: NOW,
      })
    ),
    'FUTURE_DATE'
  );
  assert.equal(
    why(
      planAttempt({
        commitment: commitment(),
        path: path(),
        athleteUserId: ATHLETE,
        input: input({ occurredOn: '2026-07-01' }),
        now: NOW,
      })
    ),
    'TOO_OLD'
  );
  assert.equal(
    why(
      planAttempt({
        commitment: commitment(),
        path: path(),
        athleteUserId: ATHLETE,
        input: input({ occurredOn: '10/09/2026' }),
        now: NOW,
      })
    ),
    'INVALID_DATE'
  );
});

test('oggi è ammesso: è il caso normale', () => {
  const decision = planAttempt({
    commitment: commitment(),
    path: path(),
    athleteUserId: ATHLETE,
    input: input({ occurredOn: romeCalendarDay(NOW) }),
    now: NOW,
  });
  assert.ok(decision.ok);
});

test('un identificativo di richiesta assente o malformato viene rifiutato', () => {
  for (const clientRequestId of [undefined, '', 'abc', 12345]) {
    assert.equal(
      why(
        planAttempt({
          commitment: commitment(),
          path: path(),
          athleteUserId: ATHLETE,
          input: input({ clientRequestId }),
          now: NOW,
        })
      ),
      'INVALID_REQUEST_ID'
    );
  }
});

test('una nota oltre il limite viene rifiutata invece di essere troncata', () => {
  assert.equal(
    why(
      planAttempt({
        commitment: commitment(),
        path: path(),
        athleteUserId: ATHLETE,
        input: input({ note: 'x'.repeat(1001) }),
        now: NOW,
      })
    ),
    'NOTE_TOO_LONG'
  );
});

// --- correggere una prova --------------------------------------------------

const stored = { id: 900, commitmentId: 500, athleteUserId: ATHLETE, version: 1, hiddenAt: null };

test('la correzione avanza la versione e non conserva il testo precedente', () => {
  const decision = planAttemptEdit({
    attempt: stored,
    actorUserId: ATHLETE,
    expectedVersion: 1,
    input: { outcome: 'non_adatta', note: 'testo nuovo', occurredOn: '2026-09-10' },
    now: NOW,
  });
  assert.ok(decision.ok);
  assert.equal(decision.value.expectedVersion, 1);
  assert.equal(decision.value.nextVersion, 2);
  // Nessun campo porta con sé il testo sostituito: la correzione lo rimpiazza.
  assert.deepEqual(Object.keys(decision.value).sort(), [
    'attemptId',
    'expectedVersion',
    'nextVersion',
    'note',
    'occurredOn',
    'outcome',
  ]);
});

test('una correzione concorrente diventa un conflitto, non una sovrascrittura', () => {
  // Due dispositivi aprono la versione 1; il primo salva e la porta a 2. Il
  // secondo arriva ancora con 1 e deve essere fermato.
  const decision = planAttemptEdit({
    attempt: { ...stored, version: 2 },
    actorUserId: ATHLETE,
    expectedVersion: 1,
    input: { outcome: 'provata', occurredOn: '2026-09-10' },
    now: NOW,
  });
  assert.equal(why(decision), 'VERSION_CONFLICT');
  assert.match(decision.ok ? '' : decision.message, /Ricaricala/);
});

test('una versione assente o non numerica è un conflitto, non un passaggio libero', () => {
  for (const expectedVersion of [undefined, null, '1', 1.5]) {
    assert.equal(
      why(
        planAttemptEdit({
          attempt: stored,
          actorUserId: ATHLETE,
          expectedVersion,
          input: { outcome: 'provata', occurredOn: '2026-09-10' },
          now: NOW,
        })
      ),
      'VERSION_CONFLICT'
    );
  }
});

test('si corregge solo ciò che si è scritto, e non ciò che è stato rimosso', () => {
  assert.equal(
    why(
      planAttemptEdit({
        attempt: stored,
        actorUserId: OTHER_ATHLETE,
        expectedVersion: 1,
        input: { outcome: 'provata', occurredOn: '2026-09-10' },
        now: NOW,
      })
    ),
    'NOT_YOUR_ATTEMPT'
  );
  assert.equal(
    why(
      planAttemptEdit({
        attempt: { ...stored, hiddenAt: new Date() },
        actorUserId: ATHLETE,
        expectedVersion: 1,
        input: { outcome: 'provata', occurredOn: '2026-09-10' },
        now: NOW,
      })
    ),
    'ATTEMPT_HIDDEN'
  );
});

test('non esiste un limite di tempo alla correzione', () => {
  // Il limite di 24 ore della prima stesura era arbitrario: chi si accorge dopo
  // tre giorni di aver scritto male una cosa che lo riguarda deve poterla
  // correggere. Il vincolo è che il percorso sia vivo, non che sia recente.
  const decision = planAttemptEdit({
    attempt: stored,
    actorUserId: ATHLETE,
    expectedVersion: 1,
    input: { outcome: 'provata', occurredOn: '2026-08-25' },
    now: new Date('2026-09-20T10:00:00Z'),
  });
  assert.ok(decision.ok);
});

// --- pausa e ripresa -------------------------------------------------------

test('la pausa non produce nessuno stato di chiusura', () => {
  const decision = planPause({
    commitment: commitment(),
    path: path(),
    athleteUserId: ATHLETE,
    reason: '  ho la gara domenica  ',
  });
  assert.ok(decision.ok);
  assert.deepEqual(decision.value, { commitmentId: 500, reason: 'ho la gara domenica' });
  // Nessun «status», nessun «completedAt», nessun «goalId»: la pausa non
  // conclude l'azione e non tocca l'obiettivo del percorso.
  assert.deepEqual(Object.keys(decision.value).sort(), ['commitmentId', 'reason']);
});

test('il motivo della pausa è facoltativo', () => {
  const decision = planPause({
    commitment: commitment(),
    path: path(),
    athleteUserId: ATHLETE,
  });
  assert.ok(decision.ok);
  assert.equal(decision.value.reason, null);
});

test('non si mette in pausa due volte, né si riprende ciò che non è in pausa', () => {
  assert.equal(
    why(
      planPause({
        commitment: commitment({ pausedAt: new Date() }),
        path: path(),
        athleteUserId: ATHLETE,
      })
    ),
    'ALREADY_PAUSED'
  );
  assert.equal(
    why(planResume({ commitment: commitment(), path: path(), athleteUserId: ATHLETE })),
    'NOT_PAUSED'
  );
});

test('la ripresa funziona su un’azione in pausa', () => {
  const decision = planResume({
    commitment: commitment({ pausedAt: new Date('2026-09-08T09:00:00Z') }),
    path: path(),
    athleteUserId: ATHLETE,
  });
  assert.ok(decision.ok);
  assert.deepEqual(decision.value, { commitmentId: 500 });
});

test('pausa e ripresa rispettano percorso e proprietà, come le prove', () => {
  assert.equal(
    why(
      planPause({
        commitment: commitment(),
        path: path({ status: 'closed', closedByRole: 'coach' }),
        athleteUserId: ATHLETE,
      })
    ),
    'PATH_CLOSED'
  );
  assert.equal(
    why(
      planPause({
        commitment: commitment({ coachUserId: OTHER_COACH }),
        path: path(),
        athleteUserId: ATHLETE,
      })
    ),
    'PATH_MISMATCH'
  );
  assert.equal(
    why(
      planPause({
        commitment: commitment(),
        path: path(),
        athleteUserId: OTHER_ATHLETE,
      })
    ),
    'NOT_YOUR_COMMITMENT'
  );
});

test('un motivo troppo lungo viene rifiutato', () => {
  assert.equal(
    why(
      planPause({
        commitment: commitment(),
        path: path(),
        athleteUserId: ATHLETE,
        reason: 'x'.repeat(501),
      })
    ),
    'REASON_TOO_LONG'
  );
});

// --- audit -----------------------------------------------------------------

test('il registro non contiene il testo della nota, in nessun campo', () => {
  const segreto = 'mi sono arrabbiata e ho smesso di guardare dove tiravo';
  const detail = attemptAuditDetail({
    attemptId: 900,
    commitmentId: 500,
    pathId: 7,
    outcome: 'non_adatta',
    version: 2,
    note: segreto,
  });
  const serialized = JSON.stringify(detail);
  assert.equal(serialized.includes(segreto), false);
  assert.equal(serialized.includes('arrabbiata'), false);
  assert.equal(detail.hasNote, true);
  // Ogni valore è un identificativo, un numero, un'etichetta chiusa o un
  // booleano: nessuna stringa libera può entrare qui per distrazione.
  for (const [key, value] of Object.entries(detail)) {
    if (typeof value !== 'string') continue;
    assert.ok(
      ['provata', 'non_ancora', 'non_adatta'].includes(value),
      `${key} contiene testo libero`
    );
  }
});

test('senza nota il registro lo dice, e non finge che ce ne fosse una', () => {
  const detail = attemptAuditDetail({
    attemptId: 901,
    commitmentId: 500,
    pathId: 7,
    outcome: 'provata',
    version: 1,
    note: null,
  });
  assert.equal(detail.hasNote, false);
});

// --- lettura ---------------------------------------------------------------

function row(overrides: Partial<AttemptRow> = {}): AttemptRow {
  return {
    id: 1,
    outcome: 'provata',
    note: null,
    occurredOn: '2026-09-09',
    version: 1,
    editedAt: null,
    hiddenAt: null,
    createdDate: new Date('2026-09-09T20:00:00Z'),
    ...overrides,
  };
}

test('le prove si leggono in ordine cronologico, come una sequenza', () => {
  const views = toAttemptViews([
    row({ id: 2, occurredOn: '2026-09-13', outcome: 'non_adatta' }),
    row({ id: 1, occurredOn: '2026-09-09' }),
  ]);
  assert.deepEqual(views.map((v) => v.id), [1, 2]);
  assert.deepEqual(views.map((v) => v.outcomeLabel), [
    'Provata',
    'Non era adatta al momento',
  ]);
});

test('a parità di giorno decide l’ordine di scrittura', () => {
  const views = toAttemptViews([
    row({ id: 2, createdDate: new Date('2026-09-09T22:00:00Z') }),
    row({ id: 1, createdDate: new Date('2026-09-09T08:00:00Z') }),
  ]);
  assert.deepEqual(views.map((v) => v.id), [1, 2]);
});

test('le prove rimosse non arrivano a nessuno dei due', () => {
  const views = toAttemptViews([row({ id: 1 }), row({ id: 2, hiddenAt: new Date() })]);
  assert.deepEqual(views.map((v) => v.id), [1]);
});

test('una prova corretta si presenta come modificata', () => {
  const [view] = toAttemptViews([
    row({ version: 2, editedAt: new Date('2026-09-11T09:00:00Z') }),
  ]);
  assert.equal(view.edited, true);
  assert.equal(view.version, 2);
  assert.equal(toAttemptViews([row()])[0].edited, false);
});

test('un esito sconosciuto non viene mostrato invece di essere indovinato', () => {
  assert.deepEqual(toAttemptViews([row({ outcome: 'boh' })]), []);
});
