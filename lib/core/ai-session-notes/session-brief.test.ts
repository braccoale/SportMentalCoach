import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_BRIEF_BOOKMARKS,
  MAX_BRIEF_GOALS,
  MAX_EXCERPT_CHARS,
  MAX_EXCERPT_TURNS,
  MAX_SUMMARY_CHARS,
  buildSessionBrief,
  excerptAt,
  buildTranscriptTurns,
  selectBriefBookmarks,
  selectBriefGoals,
  trimToLength,
} from './session-brief';
import type { StoredJourneyGoal } from './journey-goals';

function goal(overrides: Partial<StoredJourneyGoal> = {}): StoredJourneyGoal {
  return {
    id: 1,
    title: 'Gestire la pressione nei finali',
    isPrimary: false,
    status: 'in_corso',
    themeKey: null,
    position: 0,
    updatedAt: new Date('2026-08-01T10:00:00Z'),
    ...overrides,
  };
}

const EMPTY = {
  goals: [],
  pointsToRevisit: [],
  lastSession: null,
  bookmarks: [],
  sessionCount: 0,
};

test("l'obiettivo primario viene per primo, poi la posizione scelta dal coach", () => {
  const selected = selectBriefGoals([
    goal({ id: 1, position: 0, title: 'Terzo' }),
    goal({ id: 2, position: 5, title: 'Primario', isPrimary: true }),
    goal({ id: 3, position: 1, title: 'Secondo' }),
  ]);
  assert.deepEqual(
    selected.map((g) => g.title),
    ['Primario', 'Terzo', 'Secondo']
  );
});

test('gli obiettivi si fermano a tre: oltre non è più una sintesi', () => {
  const many = Array.from({ length: 8 }, (_, i) => goal({ id: i, position: i }));
  assert.equal(selectBriefGoals(many).length, MAX_BRIEF_GOALS);
});

test("lo stato dell'obiettivo arriva al client già in italiano", () => {
  const [selected] = selectBriefGoals([goal({ status: 'da_riprendere' })]);
  assert.equal(selected.statusLabel, 'Da riprendere');
});

test('i segnalibri con una nota valgono più di quelli muti', () => {
  const selected = selectBriefBookmarks([
    { id: 1, atMs: 60_000, note: null },
    { id: 2, atMs: 600_000, note: 'Qui si è bloccato' },
    { id: 3, atMs: 120_000, note: null },
  ]);
  assert.equal(selected[0].id, 2, 'il segnalibro annotato viene per primo');
  assert.deepEqual(
    selected.slice(1).map((b) => b.id),
    [1, 3],
    'fra i muti resta l’ordine della seduta'
  );
});

test('il minuto si arrotonda per difetto e non va mai sotto zero', () => {
  const selected = selectBriefBookmarks([
    { id: 1, atMs: 119_999, note: null },
    { id: 2, atMs: -5, note: null },
  ]);
  const byId = new Map(selected.map((b) => [b.id, b.minute]));
  assert.equal(byId.get(1), 1);
  assert.equal(byId.get(2), 0);
});

test('i segmenti consecutivi della stessa persona diventano una battuta sola', () => {
  const turns = buildTranscriptTurns([
    { startedAtMs: 1_573_000, endedAtMs: 1_575_000, text: 'ultimamente ti 6', speaker: 'coach' },
    { startedAtMs: 1_575_000, endedAtMs: 1_576_000, text: 'messo', speaker: 'coach' },
    { startedAtMs: 1_576_000, endedAtMs: 1_580_000, text: 'ad ascoltare di più', speaker: 'coach' },
    { startedAtMs: 1_587_000, endedAtMs: 1_589_000, text: 'A volte.', speaker: 'athlete' },
  ]);
  assert.equal(turns.length, 2, 'tre frammenti del coach sono una battuta sola');
  assert.equal(turns[0].text, 'ultimamente ti 6 messo ad ascoltare di più');
  assert.equal(turns[1].speaker, 'athlete');
});

test('lo stralcio restituisce lo scambio, non il frammento', () => {
  // Le battute vere della seduta 77, dove il difetto si e' visto: citare un
  // segmento solo produceva «ad ascoltare di più», che non dice niente.
  const segments = [
    { startedAtMs: 1_573_000, endedAtMs: 1_576_000, text: 'ultimamente ti 6 messo', speaker: 'coach' as const },
    { startedAtMs: 1_576_000, endedAtMs: 1_582_000, text: 'ad ascoltare di più quelli che sono I tuoi pensieri, o meglio ti è capitato?', speaker: 'coach' as const },
    { startedAtMs: 1_587_000, endedAtMs: 1_589_000, text: 'A volte.', speaker: 'athlete' as const },
    { startedAtMs: 1_590_000, endedAtMs: 1_591_000, text: 'E cosa senti?', speaker: 'coach' as const },
  ];
  const excerpt = excerptAt(segments, 1_578_042);
  assert.ok(excerpt.length >= 3, 'almeno domanda, risposta e rilancio');
  assert.match(excerpt[0].text, /ti è capitato\?/);
  assert.equal(excerpt[1].text, 'A volte.');
});

test('uno stralcio si ferma prima di diventare la trascrizione', () => {
  const segments = Array.from({ length: 40 }, (_, i) => ({
    startedAtMs: i * 20_000,
    endedAtMs: i * 20_000 + 1_000,
    text: `battuta ${i} `.repeat(20),
    speaker: (i % 2 === 0 ? 'coach' : 'athlete') as 'coach' | 'athlete',
  }));
  const excerpt = excerptAt(segments, 0);
  assert.ok(excerpt.length <= MAX_EXCERPT_TURNS);
  const chars = excerpt.reduce((sum, turn) => sum + turn.text.length, 0);
  assert.ok(chars <= MAX_EXCERPT_CHARS + excerpt[0].text.length);
});

test('un segnalibro caduto nel silenzio prende la battuta successiva, mai la precedente', () => {
  const excerpt = excerptAt(
    [
      { startedAtMs: 100_000, endedAtMs: 200_000, text: 'Prima', speaker: 'coach' },
      { startedAtMs: 600_000, endedAtMs: 700_000, text: 'Dopo', speaker: 'athlete' },
    ],
    500_000
  );
  assert.equal(excerpt[0].text, 'Dopo');
});

test('senza trascrizione lo stralcio resta vuoto, e non si inventa una frase', () => {
  const [bookmark] = selectBriefBookmarks([{ id: 1, atMs: 60_000, note: null }], []);
  assert.deepEqual(bookmark.turns, []);
});

test('i segnalibri si fermano a tre', () => {
  const many = Array.from({ length: 9 }, (_, i) => ({
    id: i,
    atMs: i * 60_000,
    note: null,
  }));
  assert.equal(selectBriefBookmarks(many).length, MAX_BRIEF_BOOKMARKS);
});

test('un testo lungo si taglia su un confine di parola, non a metà', () => {
  const text = 'parola '.repeat(80);
  const trimmed = trimToLength(text, MAX_SUMMARY_CHARS);
  assert.ok(trimmed.length <= MAX_SUMMARY_CHARS + 1, 'resta entro il limite');
  assert.ok(trimmed.endsWith('…'));
  assert.ok(!trimmed.includes('par…'), 'non spezza una parola a metà');
});

test('un testo corto non viene toccato né decorato', () => {
  assert.equal(trimToLength('  Sintesi   breve ', MAX_SUMMARY_CHARS), 'Sintesi breve');
});

test('il blocco «ultima seduta» non si disegna se non ha niente da dire', () => {
  const brief = buildSessionBrief({
    ...EMPTY,
    lastSession: {
      sessionId: 7,
      bookingId: 3,
      date: new Date('2026-08-20T17:00:00Z'),
      summary: '   ',
      coachNote: null,
    },
  });
  assert.equal(brief.lastSession, null);
  assert.equal(brief.hasContent, false);
});

test('un solo segnalibro basta a giustificare il blocco', () => {
  const brief = buildSessionBrief({
    ...EMPTY,
    lastSession: {
      sessionId: 7,
      bookingId: 3,
      date: null,
      summary: null,
      coachNote: null,
    },
    bookmarks: [{ id: 1, atMs: 300_000, note: 'Il punto di svolta' }],
  });
  assert.equal(brief.lastSession?.bookmarks.length, 1);
  assert.equal(brief.hasContent, true);
});

test('la nota del coach sopravvive anche senza sintesi dell’AI', () => {
  const brief = buildSessionBrief({
    ...EMPTY,
    lastSession: {
      sessionId: 7,
      bookingId: null,
      date: null,
      summary: null,
      coachNote: 'Tornare sul rapporto con il padre.',
    },
  });
  assert.equal(brief.lastSession?.coachNote, 'Tornare sul rapporto con il padre.');
  assert.equal(brief.hasContent, true);
});

test('senza niente da mostrare lo dice, invece di fingere contenuto', () => {
  const brief = buildSessionBrief(EMPTY);
  assert.deepEqual(brief.goals, []);
  assert.equal(brief.lastSession, null);
  assert.equal(brief.hasContent, false);
});

test('i due vuoti sono distinti: nessuna seduta, oppure niente da riprendere', () => {
  assert.equal(buildSessionBrief(EMPTY).emptyReason, 'no_sessions');
  assert.equal(
    buildSessionBrief({ ...EMPTY, sessionCount: 4 }).emptyReason,
    'nothing_to_carry'
  );
});

test('quando c’è contenuto non si dichiara nessun vuoto', () => {
  const brief = buildSessionBrief({ ...EMPTY, goals: [goal()], sessionCount: 1 });
  assert.equal(brief.hasContent, true);
  assert.equal(brief.emptyReason, null);
});

/**
 * La regola che questo sistema non può violare mai: **non inventa niente**.
 *
 * Non è un principio da commento. Ogni stringa che esce dalla sintesi deve
 * essere già presente fra gli ingressi — eventualmente accorciata, mai
 * riformulata, mai integrata. Se un giorno qualcuno aggiungesse qui una frase
 * di raccordo generata, o una parafrasi «più leggibile», questo test lo ferma:
 * il coach porta in seduta quello che legge, e una frase che nessuno ha detto
 * diventerebbe il piano di lavoro con una persona reale.
 */
test('nessun testo in uscita che non fosse già in ingresso', () => {
  const input = {
    goals: [goal({ id: 1, title: 'Gestire la pressione', isPrimary: true })],
    pointsToRevisit: [
      {
        id: 'commitment:3',
        text: 'Provare la routine pre-gara',
        source: 'open_commitment' as const,
        sourceLabel: 'Impegno ancora aperto',
        sessionId: 4,
        bookingId: 9,
        fromDraft: false,
      },
    ],
    lastSession: {
      sessionId: 4,
      bookingId: 9,
      date: new Date('2026-08-20T17:00:00Z'),
      summary: 'Ha raccontato la finale persa.',
      coachNote: 'Tornare sul rapporto con il padre.',
    },
    bookmarks: [{ id: 7, atMs: 300_000, note: 'Il punto di svolta' }],
    sessionCount: 4,
  };

  const brief = buildSessionBrief(input);

  const allowed = [
    input.goals[0].title,
    'In corso', // etichetta di stato, da una tabella chiusa nel codice
    input.pointsToRevisit[0].text,
    input.pointsToRevisit[0].sourceLabel,
    input.lastSession.summary,
    input.lastSession.coachNote,
    input.bookmarks[0].note,
  ];

  const produced = [
    ...brief.goals.flatMap((g) => [g.title, g.statusLabel]),
    brief.lastSession?.summary,
    brief.lastSession?.coachNote,
    ...(brief.lastSession?.bookmarks ?? []).flatMap((b) => [
      b.note,
      ...b.turns.map((t) => t.text),
    ]),
    ...brief.pointsToRevisit.flatMap((p) => [p.text, p.sourceLabel]),
  ].filter((value): value is string => typeof value === 'string');

  for (const text of produced) {
    const withoutEllipsis = text.replace(/…$/, '');
    assert.ok(
      allowed.some((source) => source.includes(withoutEllipsis)),
      `«${text}» non viene da nessun ingresso: la sintesi ha inventato del testo`
    );
  }
});

test('i punti da riprendere passano intatti: la regola resta di chi la scrive', () => {
  const points = [
    {
      id: 'theme:pressure',
      text: 'Pressione nei finali',
      source: 'recurring_theme' as const,
      sourceLabel: 'Tema emerso in 2 sessioni recenti',
      sessionId: 4,
      bookingId: 9,
      fromDraft: false,
    },
  ];
  const brief = buildSessionBrief({ ...EMPTY, pointsToRevisit: points });
  assert.deepEqual(brief.pointsToRevisit, points);
  assert.equal(brief.hasContent, true);
});
