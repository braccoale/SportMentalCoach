import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSharedReport, sharedReportHasContent } from './shared-report';
import type { SessionCompassReport } from './session-compass-contract';

const evidenza = {
  transcriptSegmentId: 7,
  startMs: 1000,
  endMs: 4000,
  minute: 0,
  speaker: 'athlete' as const,
  quote: 'Continuavo a rivedere l’errore',
};

function report(over: Partial<SessionCompassReport> = {}): SessionCompassReport {
  return {
    schemaVersion: '1.0',
    reportKind: 'session_compass_v1',
    sessionId: '42',
    sourceFingerprint: 'abc',
    language: 'it',
    sessionOverview: {
      summary: 'Avete lavorato sul recupero dopo l’errore.',
      summaryEvidence: [evidenza],
      themes: [
        { id: 't1', text: 'Riconoscere lo scivolamento dell’attenzione', evidence: evidenza },
        { id: 't2', text: 'Una routine breve di reset', evidence: evidenza },
      ],
      emergingResource: { id: 'r1', text: 'Il respiro lungo prima del servizio', evidence: evidenza },
      metrics: [
        { id: 'm1', key: 'confidence', value: 2, confidence: 'medium', evidence: evidenza },
      ],
      emotionalTrend: [{ id: 'e1', value: -1, label: 'Tensione', evidence: evidenza }],
      conversationTone: {
        key: 'hesitant',
        description: 'Poche parole sulle difficoltà',
        confidence: 'medium',
        evidence: evidenza,
      },
      conversationParticipation: {
        athleteTalkMs: 1, coachTalkMs: 1, athleteTurns: 1, coachTurns: 1, athleteSharePercent: 50,
      },
    },
    keyMoments: [
      {
        id: 'k1', title: 'Il punto di svolta', explanation: 'spiegazione',
        speaker: 'athlete', evidence: evidenza, category: 'turning_point', relevance: 3,
      },
    ],
    missedOpportunities: [
      { id: 'o1', text: 'Aveva accennato al padre', followUp: 'Che cosa intendevi?', evidence: evidenza },
    ],
    story: {
      title: 'Un gesto che già c’era',
      paragraphs: [
        { id: 'p1', text: 'La seduta si apre sul compito della volta prima.', evidence: evidenza },
        { id: 'p2', text: 'Il centro è il recupero dopo l’errore.', evidence: null },
      ],
      throughLine: 'Dal correggere al riconoscere.',
    },
    commitments: [
      { id: 'c1', text: 'Prova il respiro dopo il punto perso', owner: 'athlete', status: 'pending', dueDate: null, evidence: evidenza },
    ],
    nextSessionPrep: [
      { id: 'n1', text: 'Chiedere com’è andata', origin: 'commitment', evidence: evidenza },
    ],
    coachNote: 'Nota privata del coach: valutare il rapporto col padre.',
    generation: {
      provider: 'openai', model: 'gpt-5-mini', promptVersion: 'v1',
      contractVersion: '1.0', generatedAt: '2026-08-22T10:00:00.000Z',
    },
    ...over,
  };
}

const QUANDO = new Date('2026-08-22T12:00:00.000Z');

test('esce il racconto, la sintesi, i temi e la risorsa', () => {
  const s = buildSharedReport(report(), QUANDO);
  assert.equal(s.summary, 'Avete lavorato sul recupero dopo l’errore.');
  assert.deepEqual(s.themes, [
    'Riconoscere lo scivolamento dell’attenzione',
    'Una routine breve di reset',
  ]);
  assert.equal(s.emergingResource, 'Il respiro lungo prima del servizio');
  assert.equal(s.story?.title, 'Un gesto che già c’era');
  assert.equal(s.story?.paragraphs.length, 2);
  assert.equal(s.story?.throughLine, 'Dal correggere al riconoscere.');
  assert.equal(s.sharedAt, QUANDO.toISOString());
});

/**
 * Il test che conta. Non verifica che i campi esclusi siano assenti uno per
 * uno — verifica che **niente** di ciò che resta al coach compaia nel testo
 * consegnato, comunque sia annidato. Un campo nuovo che portasse con sé una
 * citazione fallirebbe qui senza che nessuno debba ricordarsene.
 */
test('nulla di ciò che resta al coach finisce nel testo condiviso', () => {
  const s = buildSharedReport(report(), QUANDO);
  const testo = JSON.stringify(s);

  for (const vietato of [
    'Continuavo a rivedere l’errore',   // citazione testuale
    'Aveva accennato al padre',          // occasione mancata
    'Che cosa intendevi?',               // domanda di follow-up
    'Poche parole sulle difficoltà',     // tono della conversazione
    'Il punto di svolta',                // momento chiave
    'Chiedere com’è andata',             // preparazione della prossima
    'Nota privata del coach',            // nota privata
    'hesitant',                          // chiave del tono
    'gpt-5-mini',                        // metadati di generazione
  ]) {
    assert.ok(
      !testo.includes(vietato),
      `«${vietato}» non deve arrivare all’atleta`
    );
  }

  // Nessun indicatore numerico, sotto nessuna forma.
  assert.ok(!testo.includes('confidence'));
  assert.ok(!testo.includes('emotionalTrend'));
  assert.ok(!testo.includes('transcriptSegmentId'));
});

test('un report senza racconto resta valido e senza story', () => {
  const s = buildSharedReport(report({ story: null }), QUANDO);
  assert.equal(s.story, null);
  assert.ok(sharedReportHasContent(s));
});

test('un report vuoto non ha niente da leggere', () => {
  const vuoto = buildSharedReport(
    report({
      story: null,
      sessionOverview: {
        summary: '   ',
        summaryEvidence: [],
        themes: [],
        emergingResource: null,
      },
    }),
    QUANDO
  );
  assert.equal(sharedReportHasContent(vuoto), false);
});
