import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import type { DbOrTx } from '@/lib/db/drizzle';
import {
  sessionAiAuditEvents,
  sessionAiConsents,
  sessionAiNotes,
  sessionAiProcessingJobs,
  sessionAudioRecordings,
  sessionParticipantRecordings,
  sessionTranscriptSegments,
  sessionTranscriptionRequests,
} from '@/lib/db/schema';
import { InMemoryAudioStorage } from './audio-storage';
import type {
  SpeechToTextProvider,
  TranscriptionResult,
  TranscriptionSubmission,
  TranscriptionSubmitInput,
} from './providers';
import type {
  AiSessionNotesDependencies,
  Clock,
} from './dependencies';
import { InMemoryLiveKitSessionControl } from './livekit-session-control';
import { AiNotesProcessingError } from './processing-policy';

const FIXED_NOW = new Date('2026-07-31T08:30:00.000Z');
const SESSION_ID = 301;
const PARTICIPANT_RECORDING_ID = 401;
const PHYSICAL_RECORDING_ID = 501;
const REQUESTED_BY = 601;
const OBJECT_KEY =
  `audio-recordings/${SESSION_ID}/coach/injected-audio.ogg`;
const WORKER_ID = 'test-transcription-worker';
const PROVIDER_NAME = 'injected-stt';
const AUDIO = Buffer.from('injected ogg bytes');

process.env.AI_NOTES_STT_MODEL = 'nova-3';
// Senza un'origine per la callback il worker non puo' consegnare nulla: e'
// una configurazione obbligatoria, e il test la dichiara invece di ereditarla
// dall'ambiente di chi esegue.
process.env.AI_NOTES_CALLBACK_BASE_URL = 'https://app.invalid';

type MutableDependencyModule = typeof import('./dependencies');
type MutableDatabaseModule = typeof import('@/lib/db/drizzle');
type ProcessingModule = typeof import('./processing');

function moduleExports<T extends object>(
  value: unknown,
  expectedKey: PropertyKey
): T {
  if (
    value &&
    typeof value === 'object' &&
    expectedKey in value
  ) {
    return value as T;
  }
  if (
    value &&
    typeof value === 'object' &&
    'default' in value &&
    value.default &&
    typeof value.default === 'object'
  ) {
    return value.default as T;
  }
  return value as T;
}

const dependencyModule = moduleExports<MutableDependencyModule>(
  require('./dependencies.ts'),
  'createProductionAiSessionNotesDependencies'
);
const databaseModule = moduleExports<MutableDatabaseModule>(
  require('@/lib/db/drizzle'),
  'db'
);

let productionFactoryCalls = 0;
function productionFallbackMustNotBeUsed(): never {
  productionFactoryCalls += 1;
  throw new Error('PRODUCTION_TRANSCRIPTION_DEPENDENCY_USED');
}

const productionSelect = mock.method(
  databaseModule.db,
  'select',
  productionFallbackMustNotBeUsed
);
const productionInsert = mock.method(
  databaseModule.db,
  'insert',
  productionFallbackMustNotBeUsed
);
const productionUpdate = mock.method(
  databaseModule.db,
  'update',
  productionFallbackMustNotBeUsed
);
const productionDelete = mock.method(
  databaseModule.db,
  'delete',
  productionFallbackMustNotBeUsed
);
const productionExecute = mock.method(
  databaseModule.db,
  'execute',
  productionFallbackMustNotBeUsed
);
const productionTransaction = mock.method(
  databaseModule.db,
  'transaction',
  productionFallbackMustNotBeUsed
);
const blockedNetwork = mock.method(
  globalThis,
  'fetch',
  async (): Promise<Response> => {
    throw new Error('NETWORK_ACCESS_BLOCKED');
  }
);

const processingModule = moduleExports<ProcessingModule>(
  require('./processing.ts'),
  'processAiNotesBatch'
);

type JobStatus = 'queued' | 'processing' | 'completed' | 'failed';

type FakeJob = {
  id: number;
  sessionId: number;
  participantRecordingId: number;
  jobType: 'transcription';
  status: JobStatus;
  provider: string;
  providerOperationId: string | null;
  attemptCount: number;
  maxAttempts: number;
  availableAfter: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  lockedAt: Date | null;
  lockedBy: string | null;
  errorCode: string | null;
  errorMessageSanitized: string | null;
  updatedDate: Date | null;
  idempotencyKey: string;
  requestedBy: number;
};

type FakeRecording = {
  id: number;
  participantRecordingId: number;
  order: number;
  userId: number;
  role: 'coach';
  status: 'recorded';
  objectKey: string;
  mimeType: 'audio/ogg';
  sizeBytes: number;
  checksum: string | null;
};

type TranscriptRow = Record<string, unknown> & {
  physicalRecordingId: number;
  provider: string;
  providerModel: string;
  text: string;
};

function selectionKeys(selection: unknown): string[] {
  return selection && typeof selection === 'object'
    ? Object.keys(selection)
    : [];
}

const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

/**
 * Raccoglie gli istanti passati come parametri alla query di claim.
 *
 * Il driver postgres-js esegue i template `sql` grezzi via `unsafe`, che non
 * serializza gli oggetti Date: il codice di produzione passa quindi stringhe
 * ISO con cast a timestamptz. Questo fake deve riconoscere la stessa forma,
 * altrimenti accetterebbe una scrittura che il database reale rifiuta.
 */
function collectDates(
  value: unknown,
  dates: Date[] = [],
  seen: Set<object> = new Set()
): Date[] {
  if (value instanceof Date) {
    dates.push(value);
    return dates;
  }
  if (typeof value === 'string' && ISO_TIMESTAMP.test(value)) {
    dates.push(new Date(value));
    return dates;
  }
  if (!value || typeof value !== 'object' || seen.has(value)) {
    return dates;
  }
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    collectDates(Reflect.get(value, key), dates, seen);
  }
  return dates;
}

class FakeSelectQuery implements PromiseLike<unknown> {
  private source: unknown;
  private limitValue: number | null = null;

  constructor(
    private readonly executor: FakeDbExecutor,
    private readonly selection: unknown
  ) {}

  from(source: unknown): this {
    this.source = source;
    return this;
  }

  where(_condition: unknown): this {
    return this;
  }

  orderBy(..._expressions: unknown[]): this {
    return this;
  }

  limit(value: number): this {
    this.limitValue = value;
    return this;
  }

  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?:
      | ((value: unknown) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?:
      | ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
      | null
  ): Promise<TResult1 | TResult2> {
    const rows = this.executor.selectRows(
      this.source,
      selectionKeys(this.selection)
    );
    const result =
      this.limitValue === null ? rows : rows.slice(0, this.limitValue);
    return Promise.resolve(result).then(onfulfilled, onrejected);
  }
}

type InsertInput =
  | Record<string, unknown>
  | Array<Record<string, unknown>>;

class FakeInsertQuery implements PromiseLike<unknown> {
  private input: InsertInput = {};

  constructor(
    private readonly executor: FakeDbExecutor,
    private readonly target: unknown
  ) {}

  values(input: InsertInput): this {
    this.input = input;
    return this;
  }

  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?:
      | ((value: unknown) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?:
      | ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
      | null
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(
      this.executor.insertRows(this.target, this.input)
    ).then(onfulfilled, onrejected);
  }
}

class FakeUpdateQuery implements PromiseLike<unknown> {
  private patch: Record<string, unknown> = {};
  private returningKeys: string[] = [];

  constructor(
    private readonly executor: FakeDbExecutor,
    private readonly target: unknown
  ) {}

  set(patch: Record<string, unknown>): this {
    this.patch = patch;
    return this;
  }

  where(_condition: unknown): this {
    return this;
  }

  returning(selection: unknown): this {
    this.returningKeys = selectionKeys(selection);
    return this;
  }

  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?:
      | ((value: unknown) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?:
      | ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
      | null
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(
      this.executor.updateRows(
        this.target,
        this.patch,
        this.returningKeys
      )
    ).then(onfulfilled, onrejected);
  }
}

class FakeDeleteQuery implements PromiseLike<unknown> {
  constructor(
    private readonly executor: FakeDbExecutor,
    private readonly target: unknown
  ) {}

  where(_condition: unknown): this {
    return this;
  }

  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?:
      | ((value: unknown) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?:
      | ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
      | null
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(
      this.executor.deleteRows(this.target)
    ).then(onfulfilled, onrejected);
  }
}

class FakeDbExecutor {
  readonly job: FakeJob;
  readonly recording: FakeRecording;
  readonly transcripts: TranscriptRow[] = [];
  readonly transcriptionRequests: Array<Record<string, unknown>> = [];
  readonly auditEvents: Array<Record<string, unknown>> = [];
  readonly claimDates: Date[] = [];
  claimCount = 0;

  constructor(maxAttempts: number) {
    this.job = {
      id: 201,
      sessionId: SESSION_ID,
      participantRecordingId: PARTICIPANT_RECORDING_ID,
      jobType: 'transcription',
      status: 'queued',
      provider: PROVIDER_NAME,
      providerOperationId: null,
      attemptCount: 0,
      maxAttempts,
      availableAfter: new Date(FIXED_NOW),
      startedAt: null,
      completedAt: null,
      lockedAt: null,
      lockedBy: null,
      errorCode: null,
      errorMessageSanitized: null,
      updatedDate: null,
      idempotencyKey: `transcription:${PARTICIPANT_RECORDING_ID}`,
      requestedBy: REQUESTED_BY,
    };
    this.recording = {
      id: PHYSICAL_RECORDING_ID,
      participantRecordingId: PARTICIPANT_RECORDING_ID,
      order: 0,
      userId: REQUESTED_BY,
      role: 'coach',
      status: 'recorded',
      objectKey: OBJECT_KEY,
      mimeType: 'audio/ogg',
      sizeBytes: AUDIO.byteLength,
      checksum: null,
    };
  }

  asDbOrTx(): DbOrTx {
    return this as unknown as DbOrTx;
  }

  select(selection: unknown): FakeSelectQuery {
    return new FakeSelectQuery(this, selection);
  }

  insert(target: unknown): FakeInsertQuery {
    return new FakeInsertQuery(this, target);
  }

  update(target: unknown): FakeUpdateQuery {
    return new FakeUpdateQuery(this, target);
  }

  delete(target: unknown): FakeDeleteQuery {
    return new FakeDeleteQuery(this, target);
  }

  async transaction<TResult>(
    callback: (transaction: DbOrTx) => Promise<TResult>
  ): Promise<TResult> {
    return callback(this.asDbOrTx());
  }

  async execute(query: unknown): Promise<Array<Record<string, unknown>>> {
    if (this.job.status === 'queued') {
      const dates = collectDates(query);
      this.claimDates.push(...dates);
      const claimedAt = dates[0];
      if (
        !claimedAt ||
        this.job.availableAfter.getTime() > claimedAt.getTime() ||
        this.job.attemptCount >= this.job.maxAttempts
      ) {
        return [];
      }
      this.claimCount += 1;
      this.job.status = 'processing';
      this.job.attemptCount += 1;
      this.job.startedAt ??= claimedAt;
      this.job.lockedAt = claimedAt;
      this.job.lockedBy = WORKER_ID;
      this.job.errorCode = null;
      this.job.errorMessageSanitized = null;
      this.job.updatedDate = claimedAt;
      return [{
        id: this.job.id,
        session_ai_notes_id: this.job.sessionId,
        participant_recording_id: this.job.participantRecordingId,
        job_type: this.job.jobType,
        status: this.job.status,
        provider: this.job.provider,
        attempt_count: this.job.attemptCount,
        max_attempts: this.job.maxAttempts,
        idempotency_key: this.job.idempotencyKey,
        requested_by: this.job.requestedBy,
      }];
    }
    if (
      this.job.status === 'processing' &&
      this.job.lockedBy === WORKER_ID
    ) {
      return [{
        id: this.job.id,
        session_ai_notes_id: this.job.sessionId,
        attempt_count: this.job.attemptCount,
        max_attempts: this.job.maxAttempts,
        requested_by: this.job.requestedBy,
      }];
    }
    return [];
  }

  selectRows(
    source: unknown,
    keys: string[]
  ): Array<Record<string, unknown>> {
    if (source === sessionAiNotes) {
      return [{
        id: SESSION_ID,
        requestedBy: REQUESTED_BY,
        status: 'active',
      }];
    }
    if (source === sessionAiConsents) {
      return [{ status: 'accepted' }, { status: 'accepted' }];
    }
    if (source === sessionAudioRecordings) {
      return [{ ...this.recording }];
    }
    if (source === sessionTranscriptSegments) {
      if (keys.length === 1 && keys[0] === 'id') {
        return this.transcripts.map((_row, index) => ({ id: index + 1 }));
      }
      return this.transcripts.map((row, index) => ({
        id: index + 1,
        ...row,
      }));
    }
    if (source === sessionTranscriptionRequests) {
      return this.transcriptionRequests.map((row, index) => ({
        id: index + 1,
        ...row,
      }));
    }
    if (source === sessionParticipantRecordings) {
      return [{ id: PARTICIPANT_RECORDING_ID }];
    }
    if (source === sessionAiProcessingJobs) {
      return [{
        participantId: PARTICIPANT_RECORDING_ID,
      }];
    }
    return [];
  }

  insertRows(target: unknown, input: InsertInput): Array<never> {
    const rows = Array.isArray(input) ? input : [input];
    if (target === sessionTranscriptSegments) {
      this.transcripts.push(
        ...rows.map((row) => row as TranscriptRow)
      );
    } else if (target === sessionTranscriptionRequests) {
      this.transcriptionRequests.push(...rows);
    } else if (target === sessionAiAuditEvents) {
      this.auditEvents.push(...rows);
    }
    return [];
  }

  updateRows(
    target: unknown,
    patch: Record<string, unknown>,
    returningKeys: string[]
  ): Array<Record<string, unknown>> {
    if (target !== sessionAiProcessingJobs) return [];
    const wasProcessing =
      this.job.status === 'processing' &&
      this.job.lockedBy === WORKER_ID;
    if (!wasProcessing) return [];
    Object.assign(this.job, patch);
    if (returningKeys.length === 0) return [];
    return [{
      id: this.job.id,
      sessionId: this.job.sessionId,
    }];
  }

  deleteRows(target: unknown): Array<never> {
    if (target === sessionTranscriptSegments) {
      this.transcripts.length = 0;
    }
    return [];
  }

  requeueSameJob(): void {
    this.job.status = 'queued';
    this.job.availableAfter = new Date(FIXED_NOW);
    this.job.completedAt = null;
    this.job.lockedAt = null;
    this.job.lockedBy = null;
  }
}

class FixedClock implements Clock {
  calls = 0;

  now(): Date {
    this.calls += 1;
    return new Date(FIXED_NOW);
  }
}

type Harness = {
  dependencies: AiSessionNotesDependencies;
  db: FakeDbExecutor;
  storage: InMemoryAudioStorage;
  storageInspect: ReturnType<typeof mock.method>;
  storageSignedUrl: ReturnType<typeof mock.method>;
  sttInputs: TranscriptionSubmitInput[];
  clock: FixedClock;
};

function createHarness(params: {
  maxAttempts?: number;
  storageFailure?: Error;
  sttFailure?: Error;
} = {}): Harness {
  const db = new FakeDbExecutor(params.maxAttempts ?? 3);
  const storage = new InMemoryAudioStorage();
  storage.put(OBJECT_KEY, AUDIO);
  const originalInspect = storage.inspect.bind(storage);
  const storageInspect = mock.method(
    storage,
    'inspect',
    params.storageFailure
      ? async () => {
          throw params.storageFailure;
        }
      : originalInspect
  );
  // Il worker non scarica piu' l'audio: chiede una url firmata e la
  // consegna al provider. Se tornasse a scaricare, questo mock lo direbbe.
  const storageSignedUrl = mock.method(
    storage,
    'createSignedUrl',
    storage.createSignedUrl.bind(storage)
  );
  // Il worker non attende piu' la trascrizione: consegna il lavoro e si
  // ritira. Il finto provider registra cosa gli e' stato consegnato.
  const sttInputs: TranscriptionSubmitInput[] = [];
  const speechToTextProvider: SpeechToTextProvider = {
    async submit(
      input: TranscriptionSubmitInput
    ): Promise<TranscriptionSubmission> {
      sttInputs.push(input);
      if (params.sttFailure) throw params.sttFailure;
      return { providerRequestId: 'injected-request-1' };
    },
    parseCallback(
      _payload: unknown,
      physicalSegmentId: number
    ): TranscriptionResult {
      return {
        providerOperationId: 'injected-operation-1',
        model: 'nova-3',
        segments: [{
          startMs: 125,
          endMs: 1_750,
          text: '  Testo grezzo, invariato!  ',
          confidence: 0.91,
          providerSegmentId: `${physicalSegmentId}:raw-1`,
        }],
      };
    },
  };
  const clock = new FixedClock();
  const dependencies =
    dependencyModule.createTestAiSessionNotesDependencies(
      {
        db: db.asDbOrTx(),
        audioStorage: storage,
        speechToTextProvider,
        clock,
        liveKit: new InMemoryLiveKitSessionControl(),
      },
      {
        onProductionDependencyCreation:
          productionFallbackMustNotBeUsed,
      }
    );
  return {
    dependencies,
    db,
    storage,
    storageInspect,
    storageSignedUrl,
    sttInputs,
    clock,
  };
}

function assertFixedDate(value: unknown): void {
  assert.ok(value instanceof Date);
  assert.equal(value.toISOString(), FIXED_NOW.toISOString());
}

function assertNoProductionFallbacks(): void {
  assert.equal(productionSelect.mock.callCount(), 0);
  assert.equal(productionInsert.mock.callCount(), 0);
  assert.equal(productionUpdate.mock.callCount(), 0);
  assert.equal(productionDelete.mock.callCount(), 0);
  assert.equal(productionExecute.mock.callCount(), 0);
  assert.equal(productionTransaction.mock.callCount(), 0);
  assert.equal(productionFactoryCalls, 0);
  assert.equal(blockedNetwork.mock.callCount(), 0);
}

test('il worker consegna il lavoro al provider e parcheggia il job', async () => {
  const harness = createHarness();

  const result = await processingModule.processAiNotesBatch(
    { workerId: WORKER_ID, limit: 1 },
    harness.dependencies
  );

  assert.deepEqual(result, {
    claimed: 1,
    completed: 0,
    parked: 1,
    failed: 0,
    cancelled: 0,
  });
  assert.equal(harness.db.claimCount, 1);

  // L'audio non passa mai da noi: al provider va una url firmata.
  assert.equal(harness.storageInspect.mock.callCount(), 1);
  assert.equal(harness.storageInspect.mock.calls[0]?.arguments[0], OBJECT_KEY);
  assert.equal(harness.storageSignedUrl.mock.callCount(), 1);
  assert.equal(harness.storageSignedUrl.mock.calls[0]?.arguments[0], OBJECT_KEY);
  assert.equal(harness.sttInputs.length, 1);
  assert.ok(harness.sttInputs[0]!.audioUrl.includes(OBJECT_KEY));
  assert.ok(
    harness.sttInputs[0]!.callbackUrl.includes(
      '/api/internal/ai-notes/stt-callback/'
    )
  );

  // Il job resta in attesa: lo risveglia la callback, non un altro worker.
  assert.equal(harness.db.job.status, 'awaiting_provider');
  assert.equal(harness.db.job.lockedBy, null);
  assert.equal(harness.db.job.completedAt, null);

  // La richiesta e' registrata: e' cio' che rende possibile accorgersi di
  // una risposta che non arrivera' mai.
  assert.equal(harness.db.transcriptionRequests.length, 1);
  assert.equal(
    harness.db.transcriptionRequests[0]!.providerRequestId,
    'injected-request-1'
  );
  assert.equal(harness.db.transcriptionRequests[0]!.status, 'submitted');
  assert.match(
    String(harness.db.transcriptionRequests[0]!.callbackToken),
    /^[0-9a-f]{64}$/
  );

  // Nessuna trascrizione viene scritta dal worker: quella e' compito della
  // callback.
  assert.equal(harness.db.transcripts.length, 0);
  assertNoProductionFallbacks();
});

test('un fallimento dello storage non consegna nulla al provider', async () => {
  const harness = createHarness({
    storageFailure: new Error(
      'private storage credential must never be persisted'
    ),
  });

  const result = await processingModule.processAiNotesBatch(
    { workerId: WORKER_ID, limit: 1 },
    harness.dependencies
  );

  assert.equal(result.failed, 1);
  assert.equal(result.parked, 0);
  assert.equal(harness.sttInputs.length, 0);
  assert.equal(harness.db.transcriptionRequests.length, 0);
  assert.equal(harness.db.transcripts.length, 0);
  assert.ok(
    !String(harness.db.job.errorMessageSanitized ?? '').includes('credential'),
    'il messaggio del provider non deve finire nel database'
  );
  assertNoProductionFallbacks();
});

test('un fallimento del provider non lascia una richiesta orfana', async () => {
  const harness = createHarness({
    sttFailure: new Error('provider exploded with a secret token inside'),
  });

  const result = await processingModule.processAiNotesBatch(
    { workerId: WORKER_ID, limit: 1 },
    harness.dependencies
  );

  assert.equal(result.failed, 1);
  assert.equal(result.parked, 0);
  // La riga si scrive solo dopo che il provider ha accettato: senza, il
  // recupero attenderebbe una risposta a una richiesta mai partita.
  assert.equal(harness.db.transcriptionRequests.length, 0);
  assert.equal(harness.db.transcripts.length, 0);
  assert.ok(
    !String(harness.db.job.errorMessageSanitized ?? '').includes('secret'),
    'il messaggio del provider non deve finire nel database'
  );
  assertNoProductionFallbacks();
});

test('rieseguire lo stesso job non consegna due volte lo stesso audio', async () => {
  const harness = createHarness();

  await processingModule.processAiNotesBatch(
    { workerId: WORKER_ID, limit: 1 },
    harness.dependencies
  );
  assert.equal(harness.sttInputs.length, 1);

  harness.db.requeueSameJob();
  const second = await processingModule.processAiNotesBatch(
    { workerId: WORKER_ID, limit: 1 },
    harness.dependencies
  );

  // Una richiesta e' gia' viva per quel segmento: consegnarlo di nuovo
  // significherebbe pagare e trascrivere due volte lo stesso parlato.
  assert.equal(harness.sttInputs.length, 1);
  assert.equal(harness.db.transcriptionRequests.length, 1);
  assert.equal(second.parked, 1);
  assertNoProductionFallbacks();
});
