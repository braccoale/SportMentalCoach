import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SESSION_COMPASS_SCHEMA_VERSION,
  validateSessionCompassReport,
  type CompassSourceSegment,
} from './session-compass-contract';
import {
  FakeSessionCompassReportProvider,
  SessionCompassGenerationError,
  assembleSessionCompassReport,
  generateValidatedSessionCompassReport,
  type RawCompassContent,
  type SessionCompassGenerationInput,
} from './session-compass-provider';
import {
  OpenAiSessionCompassError,
  OpenAiSessionCompassReportProvider,
  effectiveSessionCompassPromptVersion,
  type OpenAiCompassClient,
  type OpenAiCompassRequest,
} from './openai-session-compass-provider';

test('la revisione prompt delle metriche è stabile e non si duplica', () => {
  assert.equal(effectiveSessionCompassPromptVersion('compass-v1'), 'compass-v1:metrics-v2');
  assert.equal(effectiveSessionCompassPromptVersion('compass-v1:metrics-v2'), 'compass-v1:metrics-v2');
  assert.equal(effectiveSessionCompassPromptVersion('  '), '');
});

const SEGMENTS: CompassSourceSegment[] = [
  {
    transcriptSegmentId: 1,
    startMs: 0,
    endMs: 4_000,
    speaker: 'coach',
    text: 'Come ti sei sentito nell’ultima gara?',
  },
  {
    transcriptSegmentId: 2,
    startMs: 61_000,
    endMs: 70_000,
    speaker: 'athlete',
    text: 'Ho avuto la testa altrove per tutta la prima parte.',
  },
];

function input(
  overrides: Partial<SessionCompassGenerationInput> = {}
): SessionCompassGenerationInput {
  return {
    sessionId: '9',
    language: 'it',
    promptVersion: 'compass-v1',
    generatedAt: '2026-08-01T09:00:00.000Z',
    sourceFingerprint: 'fingerprint-a',
    segments: SEGMENTS,
    context: {
      coachName: 'Giulia Rossi',
      coachRole: 'Mental coach sportivo',
      athleteSport: 'Atletica',
      pathGoal: 'Gestire l’attivazione in gara',
      previousApprovedReports: [],
    },
    ...overrides,
  };
}

const CONTENT: RawCompassContent = {
  sessionOverview: {
    summary: 'Emerge un tema di attenzione durante la gara.',
    summaryEvidence: [{ transcriptSegmentId: 2, quote: 'la testa altrove' }],
    themes: [
      { text: 'Attenzione in gara', evidence: { transcriptSegmentId: 2, quote: 'testa altrove' } },
    ],
    emergingResource: null,
  },
  keyMoments: [
    {
      title: 'L’atleta descrive la prima parte',
      explanation: 'L’atleta riferisce una difficoltà di attenzione.',
      speaker: 'athlete',
      evidence: { transcriptSegmentId: 2, quote: 'prima parte' },
    },
  ],
  commitments: [
    {
      text: 'Annotare i momenti di distrazione',
      owner: 'athlete',
      dueDate: null,
      evidence: { transcriptSegmentId: 2, quote: 'testa altrove' },
    },
  ],
  nextSessionPrep: [
    {
      text: 'Verificare come è andata l’osservazione.',
      origin: 'commitment',
      evidence: { transcriptSegmentId: 2, quote: 'prima parte' },
    },
  ],
};

test('monta un documento valido dal contenuto grezzo del modello', () => {
  const report = assembleSessionCompassReport(CONTENT, input(), {
    providerName: 'fake',
    modelName: 'fake-compass-v1',
  });

  assert.deepEqual(
    validateSessionCompassReport(report, {
      sessionId: '9',
      sourceFingerprint: 'fingerprint-a',
      segments: SEGMENTS,
    }),
    []
  );
  assert.equal(report.schemaVersion, SESSION_COMPASS_SCHEMA_VERSION);
  assert.equal(report.commitments[0].status, 'pending');
  assert.equal(report.commitments[0].id, 'commitment-1');
  assert.equal(report.sessionOverview.summaryEvidence[0].minute, 1);
  assert.equal(report.coachNote, null);
});

test('normalizza metriche, trend emotivo e metadati dei momenti senza inventare evidenze', () => {
  const report = assembleSessionCompassReport({
    ...CONTENT,
    sessionOverview: {
      ...CONTENT.sessionOverview,
      metrics: [
        { key: 'concentration', value: 2, confidence: 'high', evidence: { transcriptSegmentId: 2, quote: 'testa altrove' } },
        { key: 'concentration', value: 5, confidence: 'low', evidence: { transcriptSegmentId: 2, quote: 'prima parte' } },
        { key: 'confidence', value: 9, confidence: 'high', evidence: { transcriptSegmentId: 2, quote: 'prima parte' } },
      ],
      emotionalTrend: [
        { label: 'Secondo passaggio', value: 1, evidence: { transcriptSegmentId: 2, quote: 'prima parte' } },
        { label: 'Apertura', value: 0, evidence: { transcriptSegmentId: 1, quote: 'ultima gara' } },
      ],
    },
    keyMoments: [{
      title: 'L’atleta descrive la prima parte',
      explanation: 'L’atleta riferisce una difficoltà di attenzione.',
      speaker: 'athlete',
      evidence: { transcriptSegmentId: 2, quote: 'prima parte' },
      category: 'awareness',
      theme: 'Attenzione in gara',
      relevance: 3,
    }],
  }, input(), { providerName: 'fake', modelName: 'fake-compass-v1' });

  assert.deepEqual(report.sessionOverview.metrics?.map((metric) => [metric.key, metric.value]), [['concentration', 2]]);
  assert.deepEqual(report.sessionOverview.emotionalTrend?.map((point) => point.evidence.transcriptSegmentId), [1, 2]);
  assert.equal(report.keyMoments[0].category, 'awareness');
  assert.equal(report.keyMoments[0].theme, 'Attenzione in gara');
  assert.equal(report.keyMoments[0].relevance, 3);
});

test('omette gli insight privi di evidenza verificabile invece di inventarli', () => {
  const report = assembleSessionCompassReport(
    {
      ...CONTENT,
      keyMoments: [
        {
          title: 'Momento inventato',
          explanation: 'Nessuna evidenza reale.',
          speaker: 'athlete',
          evidence: { transcriptSegmentId: 2, quote: 'frase mai pronunciata' },
        },
      ],
      commitments: [
        {
          text: 'Impegno senza fonte',
          owner: 'athlete',
          dueDate: null,
          evidence: { transcriptSegmentId: 404, quote: 'testa altrove' },
        },
      ],
    },
    input(),
    { providerName: 'fake', modelName: 'fake-compass-v1' }
  );

  assert.equal(report.keyMoments.length, 0);
  assert.equal(report.commitments.length, 0);
  assert.equal(report.sessionOverview.themes.length, 1);
});

test('scarta i testi che presentano una causa come fatto', () => {
  const report = assembleSessionCompassReport(
    {
      ...CONTENT,
      keyMoments: [
        {
          title: 'Causa individuata',
          explanation: 'Il calo è causato dall’ansia.',
          speaker: 'athlete',
          evidence: { transcriptSegmentId: 2, quote: 'testa altrove' },
        },
      ],
    },
    input(),
    { providerName: 'fake', modelName: 'fake-compass-v1' }
  );
  assert.equal(report.keyMoments.length, 0);
});

test('tronca ai limiti di cardinalità del contratto', () => {
  const report = assembleSessionCompassReport(
    {
      ...CONTENT,
      keyMoments: [1, 2, 3, 4, 5].map((index) => ({
        title: `Momento ${index}`,
        explanation: 'L’atleta riferisce un passaggio della gara.',
        speaker: 'athlete',
        evidence: { transcriptSegmentId: 2, quote: 'testa altrove' },
      })),
      nextSessionPrep: [1, 2, 3, 4].map(() => ({
        text: 'Punto da verificare.',
        origin: 'theme',
        evidence: { transcriptSegmentId: 2, quote: 'prima parte' },
      })),
    },
    input(),
    { providerName: 'fake', modelName: 'fake-compass-v1' }
  );
  assert.equal(report.keyMoments.length, 3);
  assert.equal(report.nextSessionPrep.length, 3);
});

test('rifiuta un output il cui contesto di generazione non corrisponde', async () => {
  const provider = new FakeSessionCompassReportProvider({ content: CONTENT });
  const report = await provider.generateReport(input());
  const drifted = new FakeSessionCompassReportProvider({
    report: { ...report, sessionId: '999' },
  });

  await assert.rejects(
    () => generateValidatedSessionCompassReport(input(), drifted),
    (error: unknown) =>
      error instanceof SessionCompassGenerationError && error.code === 'METADATA_MISMATCH'
  );
});

test('propaga il codice del provider quando la generazione fallisce', async () => {
  const provider = new FakeSessionCompassReportProvider({
    content: CONTENT,
    rejection: new OpenAiSessionCompassError('RATE_LIMITED', 'limitato'),
  });
  await assert.rejects(
    () => generateValidatedSessionCompassReport(input(), provider),
    (error: unknown) =>
      error instanceof SessionCompassGenerationError &&
      error.code === 'PROVIDER_FAILED' &&
      error.providerErrorCode === 'RATE_LIMITED'
  );
});

test('l’adapter OpenAI invia schema strict e non memorizza la richiesta', async () => {
  let sent: OpenAiCompassRequest | undefined;
  const client: OpenAiCompassClient = {
    async create(request) {
      sent = request;
      return {
        output: [
          { type: 'message', content: [{ type: 'output_text', text: JSON.stringify(CONTENT) }] },
        ],
      };
    },
  };
  const provider = new OpenAiSessionCompassReportProvider({
    apiKey: 'test-key',
    model: 'gpt-5-mini',
    promptVersion: 'compass-v1',
    client,
  });

  const report = await provider.generateReport(input());

  assert.equal(sent?.store, false);
  assert.equal(sent?.reasoning.effort, 'minimal');
  assert.equal(sent?.text.verbosity, 'low');
  assert.equal(sent?.max_output_tokens, 4_000);
  assert.equal(sent?.text.format.strict, true);
  assert.equal(sent?.text.format.name, 'session_compass_v1');
  assert.match(sent?.instructions ?? '', /Non è visibile all'atleta|non è visibile all'atleta/i);
  assert.doesNotMatch(sent?.input ?? '', /test-key/);
  assert.equal(report.generation.provider, 'openai');
  assert.equal(report.generation.model, 'gpt-5-mini');
  assert.deepEqual(
    validateSessionCompassReport(report, {
      sessionId: '9',
      sourceFingerprint: 'fingerprint-a',
      segments: SEGMENTS,
    }),
    []
  );
});

test('l’adapter OpenAI rifiuta output non strutturato senza esporre il payload', async () => {
  const provider = new OpenAiSessionCompassReportProvider({
    apiKey: 'test-key',
    model: 'gpt-5-mini',
    promptVersion: 'compass-v1',
    client: {
      async create() {
        return { output: [{ type: 'message', content: [{ type: 'output_text', text: 'non-json' }] }] };
      },
    },
  });
  await assert.rejects(
    () => provider.generateReport(input()),
    (error: unknown) =>
      error instanceof OpenAiSessionCompassError && error.code === 'MALFORMED_OUTPUT'
  );
});

test('l’adapter OpenAI rifiuta una versione prompt diversa dalla configurazione', async () => {
  const provider = new OpenAiSessionCompassReportProvider({
    apiKey: 'test-key',
    model: 'gpt-5-mini',
    promptVersion: 'compass-v1',
    client: {
      async create() {
        throw new Error('non deve essere chiamato');
      },
    },
  });
  await assert.rejects(
    () => provider.generateReport(input({ promptVersion: 'compass-v2' })),
    (error: unknown) =>
      error instanceof OpenAiSessionCompassError && error.code === 'PROMPT_VERSION_MISMATCH'
  );
});
