import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SESSION_COMPASS_REPORT_KIND,
  SESSION_COMPASS_SCHEMA_VERSION,
  containsForbiddenClaim,
  minuteFromMs,
  indexSourceSegments,
  resolveEvidence,
  validateSessionCompassReport,
  type CompassSourceSegment,
  type SessionCompassReport,
} from './session-compass-contract';

const SEGMENTS: CompassSourceSegment[] = [
  {
    transcriptSegmentId: 11,
    startMs: 65_000,
    endMs: 72_000,
    speaker: 'athlete',
    text: 'Prima della gara sento il respiro corto e non riesco a concentrarmi.',
  },
  {
    transcriptSegmentId: 12,
    startMs: 130_000,
    endMs: 140_000,
    speaker: 'coach',
    text: 'Proviamo a fissare una routine di respirazione da qui a venerdì.',
  },
];

function evidence(segmentId: number, quote: string) {
  const segment = SEGMENTS.find((item) => item.transcriptSegmentId === segmentId)!;
  return {
    transcriptSegmentId: segmentId,
    startMs: segment.startMs,
    minute: minuteFromMs(segment.startMs),
    speaker: segment.speaker,
    quote,
  };
}

function report(overrides: Partial<SessionCompassReport> = {}): SessionCompassReport {
  return {
    schemaVersion: SESSION_COMPASS_SCHEMA_VERSION,
    reportKind: SESSION_COMPASS_REPORT_KIND,
    sessionId: '7',
    sourceFingerprint: 'fingerprint-a',
    language: 'it',
    sessionOverview: {
      summary: 'Emerge un tema di attivazione pre-gara riferito dall’atleta.',
      summaryEvidence: [evidence(11, 'sento il respiro corto')],
      themes: [
        { id: 'theme-1', text: 'Attivazione pre-gara', evidence: evidence(11, 'respiro corto') },
        { id: 'theme-2', text: 'Routine da costruire', evidence: evidence(12, 'routine di respirazione') },
      ],
      emergingResource: null,
    },
    keyMoments: [
      {
        id: 'moment-1',
        title: 'L’atleta descrive il pre-gara',
        explanation: 'L’atleta riferisce difficoltà di concentrazione.',
        speaker: 'athlete',
        evidence: evidence(11, 'non riesco a concentrarmi'),
      },
    ],
    commitments: [
      {
        id: 'commitment-1',
        text: 'Provare la routine di respirazione',
        owner: 'athlete',
        status: 'pending',
        dueDate: null,
        evidence: evidence(12, 'routine di respirazione'),
      },
    ],
    nextSessionPrep: [
      {
        id: 'prep-1',
        text: 'Verificare come è andata la routine.',
        origin: 'commitment',
        evidence: evidence(12, 'da qui a venerdì'),
      },
    ],
    coachNote: null,
    generation: {
      provider: 'fake',
      model: 'fake-compass-v1',
      promptVersion: 'compass-v1',
      contractVersion: SESSION_COMPASS_SCHEMA_VERSION,
      generatedAt: '2026-08-01T10:00:00.000Z',
    },
    ...overrides,
  };
}

const context = {
  sessionId: '7',
  sourceFingerprint: 'fingerprint-a',
  segments: SEGMENTS,
};

test('accetta un report i cui insight sono tutti ancorati al transcript', () => {
  assert.deepEqual(validateSessionCompassReport(report(), context), []);
});

test('accetta metriche e trend emotivo solo quando hanno valore ed evidenza validi', () => {
  const valid = report();
  valid.sessionOverview.metrics = [{
    id: 'metric-1',
    key: 'concentration',
    value: 2,
    confidence: 'high',
    evidence: evidence(11, 'non riesco a concentrarmi'),
  }];
  valid.sessionOverview.emotionalTrend = [
    { id: 'emotion-1', value: -1, label: 'Attivazione iniziale', evidence: evidence(11, 'respiro corto') },
    { id: 'emotion-2', value: 1, label: 'Direzione operativa', evidence: evidence(12, 'routine di respirazione') },
  ];
  assert.deepEqual(validateSessionCompassReport(valid, context), []);

  valid.sessionOverview.metrics[0].value = 6;
  valid.sessionOverview.emotionalTrend[0].value = -3;
  const codes = validateSessionCompassReport(valid, context).map((issue) => issue.code);
  assert.ok(codes.includes('INVALID_METRIC_VALUE'));
  assert.ok(codes.includes('INVALID_EMOTIONAL_VALUE'));
});

test('accetta conteggi conversazionali descrittivi e tono solo con evidenza dell’atleta', () => {
  const valid = report();
  valid.sessionOverview.conversationParticipation = {
    athleteTalkMs: 7_000,
    coachTalkMs: 10_000,
    athleteTurns: 1,
    coachTurns: 1,
    athleteSharePercent: 41,
  };
  valid.sessionOverview.conversationTone = {
    key: 'hesitant',
    description: 'L’atleta esprime esitazione rispetto alla gara.',
    confidence: 'medium',
    evidence: evidence(11, 'respiro corto'),
  };
  assert.deepEqual(validateSessionCompassReport(valid, context), []);

  valid.sessionOverview.conversationParticipation.athleteSharePercent = 101;
  valid.sessionOverview.conversationTone.evidence = evidence(12, 'routine di respirazione');
  const codes = validateSessionCompassReport(valid, context).map((issue) => issue.code);
  assert.ok(codes.includes('INVALID_CONVERSATION_PARTICIPATION'));
  assert.ok(codes.includes('CONVERSATION_TONE_REQUIRES_ATHLETE_EVIDENCE'));
});

test('rifiuta un insight senza evidenza', () => {
  const invalid = report();
  // @ts-expect-error verifica del comportamento a runtime con dati mancanti
  invalid.commitments[0].evidence = undefined;
  const codes = validateSessionCompassReport(invalid, context).map((issue) => issue.code);
  assert.ok(codes.includes('MISSING_EVIDENCE'));
});

test('rifiuta un estratto che non compare nel segmento citato', () => {
  const invalid = report();
  invalid.keyMoments[0].evidence.quote = 'una frase mai pronunciata';
  const codes = validateSessionCompassReport(invalid, context).map((issue) => issue.code);
  assert.ok(codes.includes('EVIDENCE_QUOTE_NOT_FOUND'));
});

test('rifiuta un riferimento a un segmento inesistente', () => {
  const invalid = report();
  invalid.sessionOverview.themes[0].evidence.transcriptSegmentId = 999;
  const codes = validateSessionCompassReport(invalid, context).map((issue) => issue.code);
  assert.ok(codes.includes('UNKNOWN_TRANSCRIPT_SEGMENT'));
});

test('rifiuta timestamp, minuto o speaker incoerenti con il segmento', () => {
  const invalid = report();
  invalid.sessionOverview.summaryEvidence[0].startMs = 1;
  invalid.sessionOverview.summaryEvidence[0].minute = 42;
  invalid.sessionOverview.summaryEvidence[0].speaker = 'coach';
  const codes = validateSessionCompassReport(invalid, context).map((issue) => issue.code);
  assert.ok(codes.includes('EVIDENCE_TIMESTAMP_MISMATCH'));
  assert.ok(codes.includes('EVIDENCE_MINUTE_MISMATCH'));
  assert.ok(codes.includes('EVIDENCE_SPEAKER_MISMATCH'));
});

test('rifiuta un linguaggio che presenta una causa come fatto', () => {
  const invalid = report();
  invalid.keyMoments[0].explanation = 'L’infortunio è causato dall’ansia pre-gara.';
  const codes = validateSessionCompassReport(invalid, context).map((issue) => issue.code);
  assert.ok(codes.includes('FORBIDDEN_CLAIM'));
  assert.equal(containsForbiddenClaim('possibile associazione da approfondire'), false);
});

test('rifiuta un fingerprint sorgente diverso da quello dell’intelligence', () => {
  const codes = validateSessionCompassReport(
    report({ sourceFingerprint: 'fingerprint-b' }),
    context
  ).map((issue) => issue.code);
  assert.ok(codes.includes('SOURCE_FINGERPRINT_MISMATCH'));
});

test('rifiuta più di tre momenti chiave o punti di preparazione', () => {
  const invalid = report({
    keyMoments: [1, 2, 3, 4].map((index) => ({
      id: `moment-${index}`,
      title: `Momento ${index}`,
      explanation: 'Emerge un passaggio significativo.',
      speaker: 'athlete' as const,
      evidence: evidence(11, 'respiro corto'),
    })),
  });
  const codes = validateSessionCompassReport(invalid, context).map((issue) => issue.code);
  assert.ok(codes.includes('TOO_MANY_KEY_MOMENTS'));
});

test('rifiuta un report senza nessun tema verificato', () => {
  const invalid = report({
    sessionOverview: { ...report().sessionOverview, themes: [] },
  });
  const codes = validateSessionCompassReport(invalid, context).map((issue) => issue.code);
  assert.ok(codes.includes('TOO_FEW_THEMES'));
});

test('accetta un report con un solo tema: e\' consegnabile e il coach lo rilegge', () => {
  const single = report();
  single.sessionOverview.themes = single.sessionOverview.themes.slice(0, 1);
  assert.deepEqual(validateSessionCompassReport(single, context), []);
});

/*
 * Trascrizione come arriva davvero: frammenti brevi, con un'interiezione
 * dell'altro parlante in mezzo. Una frase citata bene attraversa piu' segmenti.
 */
const FRAMMENTI: CompassSourceSegment[] = [
  { transcriptSegmentId: 21, startMs: 10_000, endMs: 12_000, speaker: 'athlete', text: 'Quando sbaglio un servizio' },
  { transcriptSegmentId: 22, startMs: 12_000, endMs: 13_000, speaker: 'coach', text: 'mh' },
  { transcriptSegmentId: 23, startMs: 13_000, endMs: 16_000, speaker: 'athlete', text: 'resto ancora su quel punto' },
  { transcriptSegmentId: 24, startMs: 16_000, endMs: 19_000, speaker: 'athlete', text: 'e perdo anche il successivo.' },
  ...Array.from({ length: 10 }, (_, index) => ({
    transcriptSegmentId: 30 + index,
    startMs: 20_000 + index * 1_000,
    endMs: 21_000 + index * 1_000,
    speaker: 'coach' as const,
    text: `intervento ${index}`,
  })),
];

test('resolveEvidence accetta una citazione fedele a cavallo di segmenti vicini dello stesso parlante', () => {
  const segments = indexSourceSegments(FRAMMENTI);
  const resolved = resolveEvidence(
    { transcriptSegmentId: 21, quote: 'Quando sbaglio un servizio resto ancora su quel punto' },
    segments
  );
  assert.ok(resolved);
  // Resta ancorata al segmento indicato, con il suo minuto e il suo parlante.
  assert.equal(resolved.transcriptSegmentId, 21);
  assert.equal(resolved.speaker, 'athlete');
  assert.equal(resolved.startMs, 10_000);
});

test('resolveEvidence tollera che il modello indichi l\'ultimo segmento invece del primo', () => {
  const segments = indexSourceSegments(FRAMMENTI);
  assert.ok(
    resolveEvidence(
      { transcriptSegmentId: 24, quote: 'resto ancora su quel punto e perdo anche il successivo' },
      segments
    )
  );
});

test('resolveEvidence non accetta parafrasi, ne\' testo di un altro parlante, ne\' segmenti lontani', () => {
  const segments = indexSourceSegments(FRAMMENTI);
  // Parafrasi: nessuna frase pronunciata contiene queste parole.
  assert.equal(
    resolveEvidence({ transcriptSegmentId: 21, quote: 'dopo un errore rimango bloccato sul punto perso' }, segments),
    null
  );
  // Testo del coach citato con il segmento dell'atleta.
  assert.equal(resolveEvidence({ transcriptSegmentId: 21, quote: 'mh resto ancora' }, segments), null);
  // Testo reale, ma a piu' di cinque segmenti da quello citato.
  assert.equal(resolveEvidence({ transcriptSegmentId: 21, quote: 'intervento 9' }, segments), null);
});

test('il validatore applica la stessa regola di resolveEvidence', () => {
  const spanning = report();
  spanning.sessionOverview.summaryEvidence = [
    {
      transcriptSegmentId: 21,
      startMs: 10_000,
      minute: minuteFromMs(10_000),
      speaker: 'athlete',
      quote: 'Quando sbaglio un servizio resto ancora su quel punto',
    },
  ];
  const codes = validateSessionCompassReport(spanning, {
    ...context,
    segments: [...SEGMENTS, ...FRAMMENTI],
  }).map((issue) => issue.code);
  assert.ok(!codes.includes('EVIDENCE_QUOTE_NOT_FOUND'));
});

test('rifiuta una scadenza che non è una data di calendario', () => {
  const invalid = report();
  invalid.commitments[0].dueDate = 'venerdì';
  const codes = validateSessionCompassReport(invalid, context).map((issue) => issue.code);
  assert.ok(codes.includes('INVALID_DUE_DATE'));
});

test('rifiuta id duplicati nel documento', () => {
  const invalid = report();
  invalid.commitments[0].id = 'theme-1';
  const codes = validateSessionCompassReport(invalid, context).map((issue) => issue.code);
  assert.ok(codes.includes('DUPLICATE_ID'));
});

test('resolveEvidence normalizza il minuto e rifiuta le citazioni non trovate', () => {
  const segments = indexSourceSegments(SEGMENTS);
  const resolved = resolveEvidence(
    { transcriptSegmentId: 11, quote: 'Sento   il RESPIRO corto' },
    segments
  );
  assert.equal(resolved?.minute, 1);
  assert.equal(resolved?.speaker, 'athlete');
  assert.equal(
    resolveEvidence({ transcriptSegmentId: 11, quote: 'mai detto' }, segments),
    null
  );
  assert.equal(
    resolveEvidence({ transcriptSegmentId: 404, quote: 'respiro corto' }, segments),
    null
  );
});
