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
} from '@/lib/db/schema';
import { InMemoryAudioStorage } from './audio-storage';
import type {
  SpeechToTextProvider,
  TranscriptionInput,
  TranscriptionResult,
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
  storageDownload: ReturnType<typeof mock.method>;
  sttInputs: TranscriptionInput[];
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
  const storageDownload = mock.method(
    storage,
    'download',
    storage.download.bind(storage)
  );
  const sttInputs: TranscriptionInput[] = [];
  const speechToTextProvider: SpeechToTextProvider = {
    async transcribe(
      input: TranscriptionInput
    ): Promise<TranscriptionResult> {
      sttInputs.push(input);
      if (params.sttFailure) throw params.sttFailure;
      return {
        providerOperationId: 'injected-operation-1',
        model: 'nova-3',
        segments: [{
          startMs: 125,
          endMs: 1_750,
          text: '  Testo grezzo, invariato!  ',
          confidence: 0.91,
          providerSegmentId: `${PHYSICAL_RECORDING_ID}:raw-1`,
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
    storageDownload,
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

test('transcription worker uses explicit dependencies and persists the raw transcript', async () => {
  const harness = createHarness();

  const result = await processingModule.processAiNotesBatch(
    { workerId: WORKER_ID, limit: 1 },
    harness.dependencies
  );

  assert.deepEqual(result, {
    claimed: 1,
    completed: 1,
    failed: 0,
    cancelled: 0,
  });
  assert.equal(harness.db.claimCount, 1);
  assert.equal(harness.storageInspect.mock.callCount(), 1);
  assert.equal(harness.storageInspect.mock.calls[0]?.arguments[0], OBJECT_KEY);
  assert.equal(harness.storageDownload.mock.callCount(), 1);
  assert.equal(harness.storageDownload.mock.calls[0]?.arguments[0], OBJECT_KEY);
  assert.equal(harness.sttInputs.length, 1);
  assert.ok(
    Buffer.from(harness.sttInputs[0]!.audio).equals(AUDIO)
  );
  assert.equal(harness.db.transcripts.length, 1);
  assert.equal(
    harness.db.transcripts[0]!.text,
    '  Testo grezzo, invariato!  '
  );
  assert.equal(
    harness.db.transcripts[0]!.provider,
    PROVIDER_NAME
  );
  assert.equal(
    harness.db.transcripts[0]!.providerModel,
    'nova-3'
  );
  assert.equal(harness.db.job.status, 'completed');
  assert.equal(
    harness.db.job.providerOperationId,
    'injected-operation-1'
  );
  assertFixedDate(harness.db.job.startedAt);
  assert.equal(harness.db.job.lockedAt, null);
  assertFixedDate(harness.db.job.completedAt);
  assertFixedDate(harness.db.job.updatedDate);
  assertFixedDate(harness.db.transcripts[0]!.createdDate);
  assertFixedDate(harness.db.transcripts[0]!.updatedDate);
  assert.ok(harness.clock.calls >= 3);
  assert.ok(
    harness.db.claimDates.some(
      (date) => date.getTime() === FIXED_NOW.getTime()
    )
  );
  assertNoProductionFallbacks();
});

test('storage failure skips STT and persists the existing sanitized retry state', async () => {
  const harness = createHarness({
    storageFailure: new Error(
      'private storage credential must never be persisted'
    ),
  });

  const result = await processingModule.processAiNotesBatch(
    { workerId: WORKER_ID, limit: 1 },
    harness.dependencies
  );

  assert.deepEqual(result, {
    claimed: 1,
    completed: 0,
    failed: 1,
    cancelled: 0,
  });
  assert.equal(harness.storageInspect.mock.callCount(), 1);
  assert.equal(harness.storageDownload.mock.callCount(), 0);
  assert.equal(harness.sttInputs.length, 0);
  assert.equal(harness.db.transcripts.length, 0);
  assert.equal(harness.db.job.status, 'queued');
  assert.equal(harness.db.job.attemptCount, 1);
  assert.equal(harness.db.job.errorCode, 'PROCESSING_FAILED');
  assert.equal(
    harness.db.job.errorMessageSanitized,
    'Elaborazione non completata.'
  );
  assert.equal(
    harness.db.job.availableAfter.toISOString(),
    '2026-07-31T08:31:00.000Z'
  );
  assert.equal(harness.db.job.completedAt, null);
  assertFixedDate(harness.db.job.updatedDate);
  assertNoProductionFallbacks();
});

test('STT failure persists the existing terminal failure without a transcript', async () => {
  const providerError = new AiNotesProcessingError(
    'PROVIDER_TIMEOUT',
    'Provider STT non ha risposto in tempo.'
  );
  const harness = createHarness({
    maxAttempts: 1,
    sttFailure: providerError,
  });

  const result = await processingModule.processAiNotesBatch(
    { workerId: WORKER_ID, limit: 1 },
    harness.dependencies
  );

  assert.deepEqual(result, {
    claimed: 1,
    completed: 0,
    failed: 1,
    cancelled: 0,
  });
  assert.equal(harness.storageDownload.mock.callCount(), 1);
  assert.equal(harness.sttInputs.length, 1);
  assert.equal(harness.db.transcripts.length, 0);
  assert.equal(harness.db.job.status, 'failed');
  assert.equal(harness.db.job.attemptCount, 1);
  assert.equal(harness.db.job.errorCode, 'PROVIDER_TIMEOUT');
  assert.equal(
    harness.db.job.errorMessageSanitized,
    'Provider STT non ha risposto in tempo.'
  );
  assertFixedDate(harness.db.job.availableAfter);
  assertFixedDate(harness.db.job.completedAt);
  assertFixedDate(harness.db.job.updatedDate);
  assertNoProductionFallbacks();
});

test('processing the same transcription job again does not call STT or duplicate raw segments', async () => {
  const harness = createHarness();

  await processingModule.processAiNotesBatch(
    { workerId: WORKER_ID, limit: 1 },
    harness.dependencies
  );
  harness.db.requeueSameJob();
  const retryResult = await processingModule.processAiNotesBatch(
    { workerId: WORKER_ID, limit: 1 },
    harness.dependencies
  );

  assert.deepEqual(retryResult, {
    claimed: 1,
    completed: 1,
    failed: 0,
    cancelled: 0,
  });
  assert.equal(harness.db.claimCount, 2);
  assert.equal(harness.db.job.attemptCount, 2);
  assert.equal(harness.sttInputs.length, 1);
  assert.equal(harness.storageInspect.mock.callCount(), 1);
  assert.equal(harness.storageDownload.mock.callCount(), 1);
  assert.equal(harness.db.transcripts.length, 1);
  assert.equal(
    harness.db.transcripts[0]!.text,
    '  Testo grezzo, invariato!  '
  );
  assertNoProductionFallbacks();
});
