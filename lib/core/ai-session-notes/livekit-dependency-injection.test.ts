import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import type { WebhookEvent } from 'livekit-server-sdk';
import type { DbOrTx } from '@/lib/db/drizzle';
import {
  bookings,
  providerProfiles,
  sessionAiAuditEvents,
  sessionAiConsents,
  sessionAiNotes,
  sessionAudioRecordings,
  userFeatureEntitlements,
} from '@/lib/db/schema';
import { InMemoryAudioStorage } from './audio-storage';
import type { AiSessionNotesDependencies } from './dependencies';
import {
  InMemoryLiveKitSessionControl,
  ProductionLiveKitSessionControl,
  type LiveKitParticipantSnapshot,
} from './livekit-session-control';
import type {
  SpeechToTextProvider,
  TranscriptionInput,
  TranscriptionResult,
} from './providers';

const FIXED_NOW = new Date('2026-07-30T10:00:00.000Z');
const BOOKING_ID = 41;
const SESSION_ID = 101;
const COACH_USER_ID = 501;
const ATHLETE_USER_ID = 502;
const ROOM_NAME = `booking-${BOOKING_ID}`;
const COACH_TRACK_SID = 'TR_COACH_MIC';
const ATHLETE_TRACK_SID = 'TR_ATHLETE_MIC';
const AUDIO_BUCKET = 'ai-notes-test';

process.env.SUPABASE_URL = 'https://testproject.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.NEXT_PUBLIC_LIVEKIT_URL = 'wss://livekit.invalid';
process.env.LIVEKIT_API_KEY = 'test-livekit-key';
process.env.LIVEKIT_API_SECRET = 'test-livekit-secret';
process.env.AI_NOTES_AUDIO_S3_ENDPOINT =
  'https://testproject.storage.supabase.co/storage/v1/s3';
process.env.AI_NOTES_AUDIO_S3_REGION = 'eu-test-1';
process.env.AI_NOTES_AUDIO_S3_ACCESS_KEY = 'test-s3-key';
process.env.AI_NOTES_AUDIO_S3_SECRET_KEY = 'test-s3-secret';
process.env.AI_NOTES_AUDIO_BUCKET = AUDIO_BUCKET;

type MutableDependencyModule = typeof import('./dependencies');
type MutableDatabaseModule = typeof import('@/lib/db/drizzle');
type MutableCryptoModule = typeof import('node:crypto');

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
const cryptoModule = moduleExports<MutableCryptoModule>(
  require('node:crypto'),
  'randomUUID'
);

let productionFactoryCallCount = 0;

function productionDependenciesMustNotBeUsed(): never {
  productionFactoryCallCount += 1;
  throw new Error('PRODUCTION_LIVEKIT_MUST_NOT_BE_USED');
}

function productionDatabaseMustNotBeUsed(): never {
  throw new Error('PRODUCTION_DATABASE_MUST_NOT_BE_USED');
}

const productionListParticipants = mock.method(
  ProductionLiveKitSessionControl.prototype,
  'listParticipants',
  productionDependenciesMustNotBeUsed
);
const productionStartTrackEgress = mock.method(
  ProductionLiveKitSessionControl.prototype,
  'startTrackEgress',
  productionDependenciesMustNotBeUsed
);
const productionStopEgress = mock.method(
  ProductionLiveKitSessionControl.prototype,
  'stopEgress',
  productionDependenciesMustNotBeUsed
);
const productionSelect = mock.method(
  databaseModule.db,
  'select',
  productionDatabaseMustNotBeUsed
);
const productionInsert = mock.method(
  databaseModule.db,
  'insert',
  productionDatabaseMustNotBeUsed
);
const productionUpdate = mock.method(
  databaseModule.db,
  'update',
  productionDatabaseMustNotBeUsed
);
const productionTransaction = mock.method(
  databaseModule.db,
  'transaction',
  productionDatabaseMustNotBeUsed
);

const deterministicUuid = mock.method(
  cryptoModule,
  'randomUUID',
  () => '00000000-0000-4000-8000-000000000001'
);

const allowedStorageRequests: string[] = [];
const blockedNetwork = mock.method(
  globalThis,
  'fetch',
  async (
    input: string | URL | Request,
    init?: RequestInit
  ): Promise<Response> => {
    const request = input instanceof Request ? input : null;
    const rawUrl =
      input instanceof Request
        ? input.url
        : input instanceof URL
          ? input.href
          : input;
    const url = new URL(rawUrl);
    const method = (
      init?.method ??
      request?.method ??
      'GET'
    ).toUpperCase();
    if (
      url.origin !== 'https://testproject.supabase.co' ||
      !url.pathname.startsWith('/storage/v1/bucket')
    ) {
      throw new Error(`UNEXPECTED_NETWORK_ACCESS:${method}:${url.href}`);
    }
    allowedStorageRequests.push(`${method} ${url.pathname}`);
    const bucket = {
      id: AUDIO_BUCKET,
      name: AUDIO_BUCKET,
      public: false,
      file_size_limit: 128 * 1024 * 1024,
      allowed_mime_types: ['audio/ogg'],
      created_at: FIXED_NOW.toISOString(),
      updated_at: FIXED_NOW.toISOString(),
    };
    const body =
      method === 'GET' && url.pathname === '/storage/v1/bucket'
        ? [bucket]
        : bucket;
    return Response.json(body);
  }
);

const webhookModule = moduleExports<typeof import('./livekit-webhook')>(
  require('./livekit-webhook.ts'),
  'processLiveKitWebhookEvent'
);

type RecordingRow = {
  id: number;
  sessionAiNotesId: number;
  bookingId: number;
  participantUserId: number;
  participantRole: 'coach' | 'athlete';
  livekitRoomName: string;
  livekitParticipantIdentity: string;
  livekitTrackSid: string;
  livekitEgressId: string | null;
  status: string;
  storageBucket: string;
  storageObjectKey: string;
  retentionUntil: Date;
  metadata: Record<string, unknown>;
  startedAt: Date | null;
  endedAt: Date | null;
  errorCode: string | null;
};

type FakeFixture = {
  sessionStatus?: string;
  recordings?: RecordingRow[];
};

type FakeOperation = {
  executor: 'injected';
  kind: 'select' | 'insert' | 'update' | 'transaction' | 'execute';
};

function selectionKeys(selection: unknown): string[] {
  return selection && typeof selection === 'object'
    ? Object.keys(selection)
    : [];
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

  innerJoin(_source: unknown, _condition: unknown): this {
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
    return this.resolve().then(onfulfilled, onrejected);
  }

  private async resolve(): Promise<unknown> {
    const rows = this.executor.selectRows(
      this.source,
      selectionKeys(this.selection)
    );
    return this.limitValue === null ? rows : rows.slice(0, this.limitValue);
  }
}

class FakeInsertQuery implements PromiseLike<unknown> {
  private input: Record<string, unknown> | null = null;
  private returningKeys: string[] = [];

  constructor(
    private readonly executor: FakeDbExecutor,
    private readonly target: unknown
  ) {}

  values(input: Record<string, unknown>): this {
    this.input = input;
    return this;
  }

  onConflictDoNothing(_config: unknown): this {
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
    return this.resolve().then(onfulfilled, onrejected);
  }

  private async resolve(): Promise<unknown> {
    return this.executor.insertRows(
      this.target,
      this.input ?? {},
      this.returningKeys
    );
  }
}

/**
 * Estrae i parametri numerici da una condizione Drizzle.
 *
 * Il fake ignorava del tutto le clausole `where`, e un `update` mirato a una
 * riga precisa finiva sulla prima riga utile: finché si fermavano tutte le
 * tracce insieme la differenza non si vedeva, ma un aggiornamento per id —
 * come fermare la traccia del solo partecipante uscito — colpiva la riga
 * sbagliata e il test non poteva accorgersene.
 */
function numericConditionParams(node: unknown, found: number[] = []): number[] {
  if (!node || typeof node !== 'object') return found;
  const value = node as Record<string, unknown>;
  if (value.constructor?.name === 'Param' && typeof value.value === 'number') {
    found.push(value.value);
    return found;
  }
  if (Array.isArray(value.queryChunks)) {
    for (const chunk of value.queryChunks) numericConditionParams(chunk, found);
  }
  return found;
}

class FakeUpdateQuery implements PromiseLike<unknown> {
  private patch: Record<string, unknown> = {};
  private returningKeys: string[] = [];
  private targetIds: number[] = [];

  constructor(
    private readonly executor: FakeDbExecutor,
    private readonly target: unknown
  ) {}

  set(patch: Record<string, unknown>): this {
    this.patch = patch;
    return this;
  }

  where(condition: unknown): this {
    this.targetIds = numericConditionParams(condition);
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
    return this.resolve().then(onfulfilled, onrejected);
  }

  private async resolve(): Promise<unknown> {
    return this.executor.updateRows(
      this.target,
      this.patch,
      this.returningKeys,
      this.targetIds
    );
  }
}

class FakeDbExecutor {
  readonly operations: FakeOperation[] = [];
  readonly auditEvents: Array<Record<string, unknown>> = [];
  readonly recordings: RecordingRow[];
  private nextRecordingId = 900;
  private readonly sessionStatus: string;

  constructor(fixture: FakeFixture = {}) {
    this.sessionStatus = fixture.sessionStatus ?? 'active';
    this.recordings = (fixture.recordings ?? []).map((row) => ({ ...row }));
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

  async transaction<TResult>(
    callback: (transaction: DbOrTx) => Promise<TResult>
  ): Promise<TResult> {
    this.record('transaction');
    return callback(this.asDbOrTx());
  }

  async execute(_query: unknown): Promise<Array<{ status: string }>> {
    this.record('execute');
    return [{ status: this.sessionStatus }];
  }

  selectRows(source: unknown, keys: string[]): Array<Record<string, unknown>> {
    this.record('select');
    if (source === sessionAiNotes) {
      if (keys.includes('sessionId')) {
        return [{
          sessionId: SESSION_ID,
          bookingId: BOOKING_ID,
          roomName: ROOM_NAME,
          requestedBy: COACH_USER_ID,
          sessionStatus: this.sessionStatus,
          bookingStatus: 'accepted',
          coachUserId: COACH_USER_ID,
          athleteUserId: ATHLETE_USER_ID,
        }];
      }
      return [{
        id: SESSION_ID,
        requestedBy: COACH_USER_ID,
        status: this.sessionStatus,
        coachUserId: COACH_USER_ID,
        athleteUserId: ATHLETE_USER_ID,
      }];
    }
    if (source === userFeatureEntitlements) {
      return [{
        id: 701,
        status: 'enabled',
        source: 'admin',
        startsAt: null,
        expiresAt: null,
        usageLimit: null,
        usageCount: 0,
      }];
    }
    if (source === sessionAiConsents) {
      return [
        { userId: COACH_USER_ID, status: 'accepted' },
        { userId: ATHLETE_USER_ID, status: 'accepted' },
      ];
    }
    if (source === sessionAudioRecordings) {
      if (keys.includes('role')) {
        return this.recordings.map((row) => ({
          role: row.participantRole,
          status: row.status,
          startedAt: row.startedAt,
          endedAt: row.endedAt,
          errorCode: row.errorCode,
        }));
      }
      return this.recordings.map((row) => ({
        id: row.id,
        egressId: row.livekitEgressId,
        status: row.status,
        identity: row.livekitParticipantIdentity,
      }));
    }
    if (source === bookings || source === providerProfiles) {
      throw new Error('UNEXPECTED_STANDALONE_JOIN_TABLE_SELECT');
    }
    throw new Error(`UNSUPPORTED_FAKE_SELECT:${keys.join(',')}`);
  }

  insertRows(
    target: unknown,
    input: Record<string, unknown>,
    returningKeys: string[]
  ): Array<Record<string, unknown>> {
    this.record('insert');
    if (target === sessionAiAuditEvents) {
      this.auditEvents.push({ ...input });
      return [];
    }
    if (target !== sessionAudioRecordings) {
      throw new Error('UNSUPPORTED_FAKE_INSERT');
    }
    const sessionId = Number(input.sessionAiNotesId);
    const trackSid = String(input.livekitTrackSid);
    const duplicate = this.recordings.some(
      (row) =>
        row.sessionAiNotesId === sessionId &&
        row.livekitTrackSid === trackSid
    );
    if (duplicate) return [];

    const row: RecordingRow = {
      id: this.nextRecordingId++,
      sessionAiNotesId: sessionId,
      bookingId: Number(input.bookingId),
      participantUserId: Number(input.participantUserId),
      participantRole: input.participantRole as 'coach' | 'athlete',
      livekitRoomName: String(input.livekitRoomName),
      livekitParticipantIdentity: String(
        input.livekitParticipantIdentity
      ),
      livekitTrackSid: trackSid,
      livekitEgressId: null,
      status: String(input.status),
      storageBucket: String(input.storageBucket),
      storageObjectKey: String(input.storageObjectKey),
      retentionUntil: input.retentionUntil as Date,
      metadata: input.metadata as Record<string, unknown>,
      startedAt: null,
      endedAt: null,
      errorCode: null,
    };
    this.recordings.push(row);
    if (returningKeys.length === 0) return [];
    return [{
      id: row.id,
      trackSid: row.livekitTrackSid,
      roomName: row.livekitRoomName,
      objectKey: row.storageObjectKey,
      participantRole: row.participantRole,
    }];
  }

  updateRows(
    target: unknown,
    patch: Record<string, unknown>,
    returningKeys: string[],
    targetIds: number[] = []
  ): Array<Record<string, unknown>> {
    this.record('update');
    if (target !== sessionAudioRecordings) {
      throw new Error('UNSUPPORTED_FAKE_UPDATE');
    }

    // Quando la condizione nomina una riga precisa si aggiorna quella, non la
    // prima disponibile.
    const addressed = this.recordings.find((candidate) =>
      targetIds.includes(candidate.id)
    );
    if (addressed) {
      return this.applyPatch(addressed, patch, returningKeys);
    }

    let row: RecordingRow | undefined;
    if (
      typeof patch.livekitEgressId === 'string' &&
      patch.status === undefined
    ) {
      row = this.recordings.find(
        (candidate) =>
          candidate.status === 'starting' &&
          candidate.livekitEgressId === null
      );
    } else if (patch.status === 'stopping') {
      row = this.recordings.find((candidate) =>
        ['pending', 'starting', 'recording'].includes(candidate.status)
      );
    } else {
      row = this.recordings[0];
    }
    if (!row) return [];
    return this.applyPatch(row, patch, returningKeys);
  }

  private applyPatch(
    row: RecordingRow,
    patch: Record<string, unknown>,
    returningKeys: string[]
  ): Array<Record<string, unknown>> {
    if (typeof patch.livekitEgressId === 'string') {
      row.livekitEgressId = patch.livekitEgressId;
    }
    if (typeof patch.status === 'string') row.status = patch.status;
    if (patch.startedAt instanceof Date) row.startedAt = patch.startedAt;
    if (patch.endedAt instanceof Date) row.endedAt = patch.endedAt;
    if (typeof patch.errorCode === 'string' || patch.errorCode === null) {
      row.errorCode = patch.errorCode;
    }
    return returningKeys.length > 0 ? [{ id: row.id }] : [];
  }

  assertOnlyInjectedOperations(): void {
    assert.ok(this.operations.length > 0);
    assert.ok(
      this.operations.every(
        (operation) => operation.executor === 'injected'
      )
    );
  }

  private record(kind: FakeOperation['kind']): void {
    this.operations.push({ executor: 'injected', kind });
  }
}

type TestHarness = {
  dependencies: AiSessionNotesDependencies;
  db: FakeDbExecutor;
  liveKit: InMemoryLiveKitSessionControl;
  listParticipantsCalls: string[];
  audioStorageCallCount(): number;
  sttInputs: TranscriptionInput[];
};

function acceptedRecording(params: {
  id: number;
  role: 'coach' | 'athlete';
  userId: number;
  trackSid: string;
  egressId: string;
  status?: string;
}): RecordingRow {
  return {
    id: params.id,
    sessionAiNotesId: SESSION_ID,
    bookingId: BOOKING_ID,
    participantUserId: params.userId,
    participantRole: params.role,
    livekitRoomName: ROOM_NAME,
    livekitParticipantIdentity: `user-${params.userId}`,
    livekitTrackSid: params.trackSid,
    livekitEgressId: params.egressId,
    status: params.status ?? 'recording',
    storageBucket: AUDIO_BUCKET,
    storageObjectKey:
      `audio-recordings/${SESSION_ID}/${params.role}/existing.ogg`,
    retentionUntil: new Date('2026-08-06T10:00:00.000Z'),
    metadata: {},
    startedAt: new Date('2026-07-30T09:55:00.000Z'),
    endedAt: null,
    errorCode: null,
  };
}

function validRoom(): LiveKitParticipantSnapshot[] {
  return [
    {
      identity: `user-${COACH_USER_ID}`,
      tracks: [{
        sid: COACH_TRACK_SID,
        type: 'audio',
        source: 'microphone',
      }],
    },
    {
      identity: `user-${ATHLETE_USER_ID}`,
      tracks: [{
        sid: ATHLETE_TRACK_SID,
        type: 'audio',
        source: 'microphone',
      }],
    },
  ];
}

function createHarness(params: {
  room?: LiveKitParticipantSnapshot[];
  recordings?: RecordingRow[];
} = {}): TestHarness {
  const db = new FakeDbExecutor({ recordings: params.recordings });
  const liveKit = new InMemoryLiveKitSessionControl(
    new Map([[ROOM_NAME, params.room ?? validRoom()]])
  );
  const originalListParticipants =
    liveKit.listParticipants.bind(liveKit);
  const listParticipantsCalls: string[] = [];
  mock.method(
    liveKit,
    'listParticipants',
    async (roomName: string) => {
      listParticipantsCalls.push(roomName);
      return originalListParticipants(roomName);
    }
  );

  const audioStorage = new InMemoryAudioStorage();
  const inspectAudio = mock.method(
    audioStorage,
    'inspect',
    audioStorage.inspect.bind(audioStorage)
  );
  const downloadAudio = mock.method(
    audioStorage,
    'download',
    audioStorage.download.bind(audioStorage)
  );
  const deleteAudio = mock.method(
    audioStorage,
    'deleteAndVerify',
    audioStorage.deleteAndVerify.bind(audioStorage)
  );

  const sttInputs: TranscriptionInput[] = [];
  const speechToTextProvider: SpeechToTextProvider = {
    async transcribe(
      input: TranscriptionInput
    ): Promise<TranscriptionResult> {
      sttInputs.push(input);
      throw new Error('STT_MUST_NOT_BE_USED');
    },
  };
  const dependencies =
    dependencyModule.createTestAiSessionNotesDependencies(
      {
        db: db.asDbOrTx(),
        audioStorage,
        speechToTextProvider,
        clock: { now: () => new Date(FIXED_NOW) },
        liveKit,
      },
      {
        onProductionDependencyCreation:
          productionDependenciesMustNotBeUsed,
      }
    );
  return {
    dependencies,
    db,
    liveKit,
    listParticipantsCalls,
    audioStorageCallCount: () =>
      inspectAudio.mock.callCount() +
      downloadAudio.mock.callCount() +
      deleteAudio.mock.callCount(),
    sttInputs,
  };
}

function event(
  name:
    | 'track_published'
    | 'track_unpublished'
    | 'participant_left',
  params: {
    trackSid?: string;
    participantIdentity?: string;
  } = {}
): WebhookEvent {
  return {
    id: `event-${name}`,
    event: name,
    createdAt: BigInt(FIXED_NOW.getTime()) * 1_000_000n,
    room: { name: ROOM_NAME },
    track: params.trackSid
      ? { sid: params.trackSid }
      : undefined,
    participant: params.participantIdentity
      ? { identity: params.participantIdentity }
      : undefined,
  } as WebhookEvent;
}

function assertNoProductionFallbacks(): void {
  assert.equal(productionFactoryCallCount, 0);
  assert.equal(productionListParticipants.mock.callCount(), 0);
  assert.equal(productionStartTrackEgress.mock.callCount(), 0);
  assert.equal(productionStopEgress.mock.callCount(), 0);
  assert.equal(productionSelect.mock.callCount(), 0);
  assert.equal(productionInsert.mock.callCount(), 0);
  assert.equal(productionUpdate.mock.callCount(), 0);
  assert.equal(productionTransaction.mock.callCount(), 0);
}

function assertUnusedNonLiveKitDependencies(harness: TestHarness): void {
  assert.equal(harness.audioStorageCallCount(), 0);
  assert.equal(harness.sttInputs.length, 0);
  assert.equal(
    harness.dependencies.clock.now().toISOString(),
    FIXED_NOW.toISOString()
  );
}

test('track_published uses the injected LiveKit control through the real start chain', async () => {
  const harness = createHarness({
    recordings: [acceptedRecording({
      id: 801,
      role: 'coach',
      userId: COACH_USER_ID,
      trackSid: COACH_TRACK_SID,
      egressId: 'existing-coach-egress',
    })],
  });

  await webhookModule.processLiveKitWebhookEvent(
    event('track_published', { trackSid: ATHLETE_TRACK_SID }),
    harness.dependencies
  );

  assert.deepEqual(harness.listParticipantsCalls, [ROOM_NAME]);
  assert.equal(harness.liveKit.starts.length, 1);
  assert.equal(harness.liveKit.starts[0]?.roomName, ROOM_NAME);
  assert.equal(harness.liveKit.starts[0]?.trackSid, ATHLETE_TRACK_SID);
  const athleteRecording = harness.db.recordings.find(
    (row) => row.livekitTrackSid === ATHLETE_TRACK_SID
  );
  assert.equal(athleteRecording?.livekitEgressId, 'test-egress-1');
  assert.equal(athleteRecording?.status, 'starting');
  assert.equal(
    harness.db.recordings.filter(
      (row) => row.livekitTrackSid === ATHLETE_TRACK_SID
    ).length,
    1
  );
  harness.db.assertOnlyInjectedOperations();
  assertUnusedNonLiveKitDependencies(harness);
  assertNoProductionFallbacks();
});

test('duplicate track_published preserves Track SID idempotency', async () => {
  const harness = createHarness({
    recordings: [acceptedRecording({
      id: 802,
      role: 'coach',
      userId: COACH_USER_ID,
      trackSid: COACH_TRACK_SID,
      egressId: 'existing-coach-egress',
    })],
  });
  const published = event('track_published', {
    trackSid: ATHLETE_TRACK_SID,
  });

  await webhookModule.processLiveKitWebhookEvent(
    published,
    harness.dependencies
  );
  await webhookModule.processLiveKitWebhookEvent(
    published,
    harness.dependencies
  );

  assert.equal(harness.liveKit.starts.length, 1);
  assert.equal(
    harness.db.recordings.filter(
      (row) => row.livekitTrackSid === ATHLETE_TRACK_SID
    ).length,
    1
  );
  assert.equal(
    harness.db.recordings.find(
      (row) => row.livekitTrackSid === ATHLETE_TRACK_SID
    )?.livekitEgressId,
    'test-egress-1'
  );
  harness.db.assertOnlyInjectedOperations();
  assertUnusedNonLiveKitDependencies(harness);
  assertNoProductionFallbacks();
});

test('track_published fails closed when an expected participant is absent', async () => {
  const harness = createHarness({
    room: [validRoom()[0]!],
  });

  await webhookModule.processLiveKitWebhookEvent(
    event('track_published', { trackSid: COACH_TRACK_SID }),
    harness.dependencies
  );

  assert.deepEqual(harness.listParticipantsCalls, [ROOM_NAME]);
  assert.equal(harness.liveKit.starts.length, 0);
  assert.equal(harness.db.recordings.length, 0);
  harness.db.assertOnlyInjectedOperations();
  assertUnusedNonLiveKitDependencies(harness);
  assertNoProductionFallbacks();
});

test('track_published fails closed when the expected track is not a microphone', async () => {
  const room = validRoom();
  room[1] = {
    identity: `user-${ATHLETE_USER_ID}`,
    tracks: [{
      sid: ATHLETE_TRACK_SID,
      type: 'audio',
      source: 'camera',
    }],
  };
  const harness = createHarness({ room });

  await webhookModule.processLiveKitWebhookEvent(
    event('track_published', { trackSid: ATHLETE_TRACK_SID }),
    harness.dependencies
  );

  assert.deepEqual(harness.listParticipantsCalls, [ROOM_NAME]);
  assert.equal(harness.liveKit.starts.length, 0);
  assert.equal(harness.db.recordings.length, 0);
  harness.db.assertOnlyInjectedOperations();
  assertUnusedNonLiveKitDependencies(harness);
  assertNoProductionFallbacks();
});

test('track_unpublished stops the matching Egress once and preserves stopping state', async () => {
  const harness = createHarness({
    recordings: [acceptedRecording({
      id: 803,
      role: 'athlete',
      userId: ATHLETE_USER_ID,
      trackSid: ATHLETE_TRACK_SID,
      egressId: 'egress-athlete-active',
    })],
  });
  const unpublished = event('track_unpublished', {
    trackSid: ATHLETE_TRACK_SID,
  });

  await webhookModule.processLiveKitWebhookEvent(
    unpublished,
    harness.dependencies
  );
  await webhookModule.processLiveKitWebhookEvent(
    unpublished,
    harness.dependencies
  );

  assert.deepEqual(harness.liveKit.stops, ['egress-athlete-active']);
  assert.equal(harness.db.recordings[0]?.status, 'stopping');
  harness.db.assertOnlyInjectedOperations();
  assertUnusedNonLiveKitDependencies(harness);
  assertNoProductionFallbacks();
});

test('participant_left ferma solo le tracce di chi esce, non quelle di chi resta', async () => {
  const harness = createHarness({
    recordings: [
      acceptedRecording({
        id: 804,
        role: 'coach',
        userId: COACH_USER_ID,
        trackSid: COACH_TRACK_SID,
        egressId: 'egress-coach-active',
      }),
      acceptedRecording({
        id: 805,
        role: 'athlete',
        userId: ATHLETE_USER_ID,
        trackSid: ATHLETE_TRACK_SID,
        egressId: 'egress-athlete-active',
      }),
    ],
  });

  await webhookModule.processLiveKitWebhookEvent(
    event('participant_left', {
      participantIdentity: `user-${ATHLETE_USER_ID}`,
    }),
    harness.dependencies
  );

  // Se cade l'atleta, il coach sta ancora parlando e non si e' mosso:
  // fermare anche la sua traccia significava perdere l'audio di chi era
  // rimasto in stanza.
  assert.deepEqual(harness.liveKit.stops, ['egress-athlete-active']);
  assert.deepEqual(
    harness.db.recordings.map((row) => [row.participantRole, row.status]),
    [
      ['coach', 'recording'],
      ['athlete', 'stopping'],
    ]
  );
  harness.db.assertOnlyInjectedOperations();
  assertUnusedNonLiveKitDependencies(harness);
  assertNoProductionFallbacks();
});

test.after(() => {
  assert.ok(allowedStorageRequests.length > 0);
  assert.equal(blockedNetwork.mock.callCount(), allowedStorageRequests.length);
  assert.ok(deterministicUuid.mock.callCount() > 0);
  assertNoProductionFallbacks();
});
