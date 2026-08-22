import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  JourneyKeyMoment,
  MentalJourneyEntry,
} from './mental-journey';
import type { KeyMomentCategory } from './session-compass-contract';
import {
  buildJourneyStages,
  JOURNEY_STAGE_KINDS,
  JOURNEY_STAGE_LABELS,
  MAX_JOURNEY_STAGES,
  MIN_JOURNEY_STAGES,
} from './journey-stages';

function moment(
  id: string,
  category: KeyMomentCategory | undefined,
  overrides: Partial<JourneyKeyMoment> = {}
): JourneyKeyMoment {
  return {
    id,
    title: `Momento ${id}`,
    explanation: 'Spiegazione.',
    minute: 10,
    speaker: 'athlete',
    transcriptSegmentId: 1,
    category,
    theme: null,
    relevance: 2,
    ...overrides,
  };
}

function entry(
  sessionId: number,
  sessionDate: string | null,
  keyMoments: JourneyKeyMoment[],
  overrides: Partial<MentalJourneyEntry> = {}
): MentalJourneyEntry {
  return {
    sessionId,
    bookingId: 100 + sessionId,
    reportId: 200 + sessionId,
    reportVersion: 1,
    sharedAt: null,
    sessionDate,
    approvedAt: '2026-08-01T10:00:00.000Z',
    coachName: 'Coach',
    summary: 'Sintesi della seduta.',
    focus: 'Perde focus dopo un errore',
    themes: [],
    emergingResource: null,
    keyMoments,
    nextSessionPrep: [],
    commitments: [],
    throughLine: null,
    isApproved: true,
    compassHref: `/dashboard/appointments/${100 + sessionId}`,
    ...overrides,
  };
}

/** La timeline della Mental Journey arriva dalla più recente alla più vecchia. */
function timelineOf(...entries: MentalJourneyEntry[]): MentalJourneyEntry[] {
  return [...entries].reverse();
}

test('la striscia si legge dal passato al presente, comunque arrivi la timeline', () => {
  const stages = buildJourneyStages(
    timelineOf(
      entry(1, '2026-05-12T10:00:00.000Z', [moment('a', 'goal')]),
      entry(2, '2026-05-26T10:00:00.000Z', [moment('b', 'awareness')]),
      entry(3, '2026-06-09T10:00:00.000Z', [moment('c', 'exercise')])
    )
  );

  assert.deepEqual(
    stages.map((stage) => stage.sessionId),
    [1, 2, 3]
  );
});

test('le otto categorie di momento diventano le quattro fasi del lavoro', () => {
  const cases: Array<[KeyMomentCategory, string]> = [
    ['goal', 'problema'],
    ['resistance', 'problema'],
    ['risk', 'problema'],
    ['awareness', 'strategia'],
    ['exercise', 'strategia'],
    ['commitment', 'applicazione'],
    ['follow_up', 'applicazione'],
    ['turning_point', 'progresso'],
  ];

  for (const [category, expected] of cases) {
    const stages = buildJourneyStages(
      timelineOf(
        entry(1, '2026-05-12T10:00:00.000Z', [moment('a', category)]),
        // Una seconda seduta serve a non far diventare la prima «focus attuale».
        entry(2, '2026-05-26T10:00:00.000Z', [moment('b', 'goal')])
      )
    );
    assert.equal(stages[0].kind, expected, category);
    assert.equal(stages[0].category, category);
  }
});

test("l'ultima tappa e sempre il focus attuale, qualunque cosa sia successa", () => {
  const stages = buildJourneyStages(
    timelineOf(
      entry(1, '2026-05-12T10:00:00.000Z', [moment('a', 'goal')]),
      entry(2, '2026-07-14T10:00:00.000Z', [moment('b', 'resistance')])
    )
  );

  assert.equal(stages[1].kind, 'focus_attuale');
  assert.equal(stages[1].isCurrent, true);
  assert.equal(stages[0].isCurrent, false);
});

test('decide il momento piu rilevante, e a parita il primo nel tempo', () => {
  const stages = buildJourneyStages(
    timelineOf(
      entry(1, '2026-05-12T10:00:00.000Z', [
        moment('tardi', 'turning_point', { relevance: 1, minute: 5 }),
        moment('deciso', 'exercise', { relevance: 3, minute: 30 }),
      ]),
      entry(2, '2026-05-26T10:00:00.000Z', [
        moment('primo', 'goal', { relevance: 2, minute: 4 }),
        moment('dopo', 'risk', { relevance: 2, minute: 22 }),
      ]),
      entry(3, '2026-06-09T10:00:00.000Z', [moment('c', 'goal')])
    )
  );

  assert.equal(stages[0].sourceMomentId, 'deciso');
  assert.equal(stages[0].kind, 'strategia');
  assert.equal(stages[1].sourceMomentId, 'primo');
});

test('una seduta senza momenti classificabili non diventa una tappa inventata', () => {
  const stages = buildJourneyStages(
    timelineOf(
      entry(1, '2026-05-12T10:00:00.000Z', [moment('a', 'goal')]),
      entry(2, '2026-05-26T10:00:00.000Z', []),
      entry(3, '2026-06-09T10:00:00.000Z', [moment('c', undefined)]),
      entry(4, '2026-06-23T10:00:00.000Z', [moment('d', 'commitment')])
    )
  );

  assert.deepEqual(
    stages.map((stage) => stage.sessionId),
    [1, 4]
  );
  for (const stage of stages) {
    assert.ok(stage.sourceMomentId, 'ogni tappa dichiara da dove viene');
  }
});

test('oltre il massimo restano gli estremi piu le tappe piu rilevanti', () => {
  const entries = Array.from({ length: 10 }, (_, index) =>
    entry(
      index + 1,
      `2026-05-${String(index + 1).padStart(2, '0')}T10:00:00.000Z`,
      [
        moment(`m${index + 1}`, 'goal', {
          // Le rilevanti stanno in mezzo, così si vede che gli estremi
          // sopravvivono per diritto e non per punteggio.
          relevance: index === 4 || index === 5 ? 3 : 1,
        }),
      ]
    )
  );

  const stages = buildJourneyStages(timelineOf(...entries));

  assert.equal(stages.length, MAX_JOURNEY_STAGES);
  assert.equal(stages[0].sessionId, 1, 'la prima seduta non si scarta mai');
  assert.equal(stages.at(-1)!.sessionId, 10, "ne l'ultima");
  const chosen = stages.map((stage) => stage.sessionId);
  assert.ok(chosen.includes(5) && chosen.includes(6));
  assert.deepEqual(chosen, [...chosen].sort((a, b) => a - b));
});

test('su un percorso lungo le tappe coprono tutto larco, non solo linizio', () => {
  // Cinquanta sedute, una ogni dieci giorni, con una «molto rilevante» ogni
  // sette: la forma che faceva scegliere cinque tappe tutte nel primo anno.
  const entries = Array.from({ length: 50 }, (_, index) =>
    entry(
      index + 1,
      new Date(Date.UTC(2024, 6, 1) + index * 10 * 86_400_000).toISOString(),
      [
        moment(`m${index + 1}`, 'goal', {
          relevance: index % 7 === 0 ? 3 : 1,
        }),
      ]
    )
  );

  const stages = buildJourneyStages(timelineOf(...entries));
  const chosen = stages.map((stage) => stage.sessionId);

  assert.equal(stages.length, MAX_JOURNEY_STAGES, 'mai cinquanta card in fila');
  assert.equal(chosen[0], 1);
  assert.equal(chosen.at(-1), 50);
  assert.ok(
    chosen.slice(1, -1).some((id) => id > 34),
    `nessuna tappa nell'ultimo terzo del percorso: ${chosen.join(', ')}`
  );
  assert.ok(
    chosen.slice(1, -1).some((id) => id < 17),
    `nessuna tappa nel primo terzo del percorso: ${chosen.join(', ')}`
  );
  assert.deepEqual(chosen, [...chosen].sort((a, b) => a - b));
});

test('dentro la finestra vince la rilevanza, non la posizione', () => {
  const entries = Array.from({ length: 12 }, (_, index) =>
    entry(index + 1, `2026-05-${String(index + 1).padStart(2, '0')}T10:00:00.000Z`, [
      moment(`m${index + 1}`, 'goal', {
        // L'ultima seduta di ogni finestra è la più rilevante: se la scelta
        // guardasse la posizione invece della rilevanza, non uscirebbe mai.
        relevance: index === 3 || index === 8 ? 3 : 1,
      }),
    ])
  );

  const chosen = buildJourneyStages(timelineOf(...entries)).map(
    (stage) => stage.sessionId
  );

  assert.ok(chosen.includes(4), `manca la piu rilevante: ${chosen.join(', ')}`);
  assert.ok(chosen.includes(9), `manca la piu rilevante: ${chosen.join(', ')}`);
});

test('il limite si puo stringere senza cambiare la regola', () => {
  const entries = Array.from({ length: 8 }, (_, index) =>
    entry(index + 1, `2026-05-0${index + 1}T10:00:00.000Z`, [
      moment(`m${index + 1}`, 'goal'),
    ])
  );

  const stages = buildJourneyStages(timelineOf(...entries), { max: 3 });

  assert.equal(stages.length, 3);
  assert.equal(stages[0].sessionId, 1);
  assert.equal(stages[2].sessionId, 8);
});

test("la tappa punta al riepilogo, non alla testa dell'appuntamento", () => {
  const stages = buildJourneyStages(
    timelineOf(
      entry(1, '2026-05-12T10:00:00.000Z', [moment('a', 'goal')]),
      entry(2, '2026-05-26T10:00:00.000Z', [moment('b', 'goal')])
    )
  );

  assert.equal(stages[0].href, '/dashboard/appointments/101#session-compass');
});

test('la descrizione e il tema principale della seduta', () => {
  const stages = buildJourneyStages(
    timelineOf(
      entry(1, '2026-05-12T10:00:00.000Z', [moment('a', 'goal')], {
        focus: 'Succede soprattutto dopo errori tecnici',
      }),
      entry(2, '2026-05-26T10:00:00.000Z', [moment('b', 'goal')], {
        focus: null,
      })
    )
  );

  assert.equal(stages[0].description, 'Succede soprattutto dopo errori tecnici');
  assert.equal(stages[1].description, null);
});

test('le sedute fra due tappe diventano segni sulla linea', () => {
  const entries = Array.from({ length: 12 }, (_, index) =>
    entry(index + 1, `2026-05-${String(index + 1).padStart(2, '0')}T10:00:00.000Z`, [
      moment(`m${index + 1}`, 'goal'),
    ])
  );

  const stages = buildJourneyStages(timelineOf(...entries));
  const marked = stages.flatMap((stage) => stage.ticksToNext.map((t) => t.sessionId));
  const onCards = stages.map((stage) => stage.sessionId);

  // Nessuna seduta del percorso resta fuori: o è una card, o è un segno.
  assert.deepEqual(
    [...new Set([...marked, ...onCards])].sort((a, b) => a - b),
    entries.map((e) => e.sessionId)
  );
  // E nessuna compare due volte.
  assert.equal(marked.length, new Set(marked).size);
  for (const id of marked) assert.ok(!onCards.includes(id));
});

test("l'ultima tappa non ha segni dopo di se", () => {
  const entries = Array.from({ length: 9 }, (_, index) =>
    entry(index + 1, `2026-05-0${index + 1}T10:00:00.000Z`, [
      moment(`m${index + 1}`, 'goal'),
    ])
  );

  const stages = buildJourneyStages(timelineOf(...entries));
  assert.deepEqual(stages.at(-1)!.ticksToNext, []);
});

test('i segni stanno dove cade il tempo, non a intervalli uguali', () => {
  // Fra la prima e l'ultima tappa: due sedute vicinissime all'inizio e una
  // dopo un mese di pausa. Se fossero equidistanti, la pausa sparirebbe.
  const stages = buildJourneyStages(
    timelineOf(
      entry(1, '2026-05-01T10:00:00.000Z', [moment('a', 'goal')]),
      entry(2, '2026-05-03T10:00:00.000Z', [moment('b', 'goal')]),
      entry(3, '2026-05-05T10:00:00.000Z', [moment('c', 'goal')]),
      entry(4, '2026-06-10T10:00:00.000Z', [moment('d', 'goal')])
    ),
    { max: 2 }
  );

  const ticks = stages[0].ticksToNext;
  assert.deepEqual(
    ticks.map((tick) => tick.sessionId),
    [2, 3]
  );
  assert.ok(ticks[0].fraction < 0.1, `troppo lontano: ${ticks[0].fraction}`);
  assert.ok(ticks[1].fraction < 0.15, `troppo lontano: ${ticks[1].fraction}`);
});

test('un segno non finisce mai sotto il pallino di una tappa', () => {
  const entries = Array.from({ length: 30 }, (_, index) =>
    entry(
      index + 1,
      new Date(Date.UTC(2026, 0, 1) + index * 3 * 86_400_000).toISOString(),
      [moment(`m${index + 1}`, 'goal')]
    )
  );

  for (const stage of buildJourneyStages(timelineOf(...entries))) {
    for (const tick of stage.ticksToNext) {
      assert.ok(
        tick.fraction >= 0.07 && tick.fraction <= 0.93,
        `segno a ridosso di una tappa: ${tick.fraction}`
      );
    }
  }
});

test('un percorso vuoto non produce una striscia', () => {
  assert.deepEqual(buildJourneyStages([]), []);
  assert.equal(MIN_JOURNEY_STAGES, 2);
});

test('ogni fase ha la sua etichetta nella legenda', () => {
  assert.equal(JOURNEY_STAGE_LABELS.problema, 'Problema');
  assert.equal(JOURNEY_STAGE_LABELS.focus_attuale, 'Focus attuale');
  assert.equal(JOURNEY_STAGE_LABELS.pianificata, 'Pianificata');
  // Nessuna fase senza etichetta: la legenda si costruisce da qui.
  for (const kind of JOURNEY_STAGE_KINDS) {
    assert.ok(JOURNEY_STAGE_LABELS[kind], kind);
  }
});

test('una seduta in agenda entra in coda e non si apre', () => {
  const stages = buildJourneyStages(
    timelineOf(
      entry(1, '2026-05-12T10:00:00.000Z', [moment('a', 'goal')]),
      entry(2, '2026-05-26T10:00:00.000Z', [moment('b', 'exercise')])
    ),
    {
      planned: [
        {
          bookingId: 900,
          scheduledFor: '2026-09-01T15:00:00.000Z',
          serviceTitle: 'Sessione Online',
        },
      ],
    }
  );

  const last = stages.at(-1)!;
  assert.equal(stages.length, 3);
  assert.equal(last.isPlanned, true);
  assert.equal(last.kind, 'pianificata');
  assert.equal(last.href, null, 'non c e ancora niente da aprire');
  assert.equal(last.isCurrent, false);
});

test("il focus attuale resta l'ultima seduta avvenuta, non quella in agenda", () => {
  const stages = buildJourneyStages(
    timelineOf(
      entry(1, '2026-05-12T10:00:00.000Z', [moment('a', 'goal')]),
      entry(2, '2026-05-26T10:00:00.000Z', [moment('b', 'exercise')])
    ),
    {
      planned: [
        { bookingId: 900, scheduledFor: '2026-09-01T15:00:00.000Z', serviceTitle: null },
      ],
    }
  );

  const current = stages.find((stage) => stage.isCurrent)!;
  assert.equal(current.sessionId, 2);
});

test('una sola seduta in agenda e nessun passato non e un percorso', () => {
  assert.deepEqual(
    buildJourneyStages([], {
      planned: [
        { bookingId: 900, scheduledFor: '2026-09-01T15:00:00.000Z', serviceTitle: null },
      ],
    }),
    []
  );
});
