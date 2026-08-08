# Trascrizione asincrona via callback Deepgram — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** La durata di una sessione smette di essere un limite: una seduta di due ore si trascrive come una di venti minuti, e nessuna trascrizione si perde per un timeout.

**Architecture:** Il worker non aspetta più Deepgram. Genera una signed URL a scadenza breve, la consegna a Deepgram con un parametro `callback`, registra la richiesta e si ritira in circa un secondo senza mai toccare i byte dell'audio. Quando Deepgram ha finito, consegna i risultati a un endpoint dedicato che li ingerisce in modo idempotente e fa avanzare il job. Le richieste che non ricevono risposta vengono reinviate.

**Tech Stack:** Next.js App Router, TypeScript strict, Drizzle ORM su PostgreSQL/Supabase, Supabase Storage (signed URL), Deepgram Nova-3 pre-recorded API con `callback`, test con `node:test` + `tsx --test`.

**Spec di riferimento:** `docs/superpowers/specs/2026-08-08-pipeline-trascrizione-ai-affidabilita-design.md`, sezione 2.

**Dipendenza:** nessuna sul Piano 1. I due piani toccano file diversi e possono procedere in qualunque ordine, ma il Piano 1 va prima perché ferma una perdita di dati già in corso.

## Global Constraints

- TypeScript strict. Nessun `any`, nessun cast non necessario.
- I moduli sotto `lib/core/ai-session-notes/` che toccano il database iniziano con `import 'server-only';`.
- Le dipendenze esterne (storage, provider STT, orologio, LiveKit) arrivano sempre da `AiSessionNotesDependencies`, mai istanziate dentro la logica.
- **Nessun percorso sincrono di riserva.** La decisione della spec è esplicita: un secondo percorso esercitato di rado marcisce, e sarebbe comunque un ritorno allo stato rotto. `transcribe()` viene sostituito, non affiancato.
- Il modello STT resta vincolato a `nova-3`; lingua `it`. Provider e credenziali non arrivano mai dal browser.
- Nessun messaggio del provider viene mai propagato al chiamante esterno.
- Migrazione numero `0047`, con voce corrispondente in `lib/db/migrations/meta/_journal.json` (`idx` 47, `version` "7", `when` 1786713300000, `breakpoints` true).
- TTL della signed URL: **900 secondi** (15 minuti), rigenerata a ogni tentativo.
- Soglia di reimmissione di una richiesta senza risposta: **20 minuti**.
- Commenti e documentazione in italiano.

---

## File Structure

**Creati:**
- `lib/db/migrations/0047_stt-callback.sql` — tabella delle richieste, stato `awaiting_provider`, indice unico aggiornato.
- `lib/core/ai-session-notes/transcription-dispatch.ts` — invio delle richieste a Deepgram. Una responsabilità: consegnare e registrare.
- `lib/core/ai-session-notes/stt-callback.ts` — ingestione dei risultati. Una responsabilità: ricevere e far avanzare.
- `lib/core/ai-session-notes/stt-callback.test.ts` — test puri su parsing e idempotenza.
- `app/api/internal/ai-notes/stt-callback/[token]/route.ts` — endpoint HTTP, sottile.

**Modificati:**
- `lib/db/schema.ts` — tabella `sessionTranscriptionRequests`.
- `lib/db/migrations/meta/_journal.json` — voce della migrazione.
- `lib/core/ai-session-notes/providers.ts` — `submit()` e `parseDeepgramCallback()` al posto di `transcribe()`.
- `lib/core/ai-session-notes/providers.test.ts` — test aggiornati al nuovo contratto.
- `lib/core/ai-session-notes/audio-storage.ts` — `createSignedUrl` su `AudioStorage`.
- `lib/core/ai-session-notes/processing.ts` — il worker invia invece di attendere; recupero esteso.
- `.env.example` — `AI_NOTES_CALLBACK_BASE_URL`.
- `docs/ai-session-notes-phase-3a.md` — il nuovo flusso.
- `docs/legal/dpa-fornitori.md`, `docs/legal/registro-trattamenti.md` — Deepgram scarica da Supabase.
- `package.json` — registrazione dei nuovi test.

**Perché moduli separati e non tutto in `processing.ts`:** quel file è già a oltre 700 righe e governa la coda. Invio e ingestione sono due responsabilità con due chiamanti diversi (il worker e un endpoint HTTP) e due modi diversi di fallire. Tenerle separate mantiene ciascun file leggibile per intero.

---

### Task 1: Schema delle richieste di trascrizione

**Files:**
- Create: `lib/db/migrations/0047_stt-callback.sql`
- Modify: `lib/db/migrations/meta/_journal.json`
- Modify: `lib/db/schema.ts`

**Interfaces:**
- Consumes: `sessionAudioRecordings`, `sessionAiProcessingJobs`, `users` da `lib/db/schema.ts`.
- Produces: `export const sessionTranscriptionRequests` con colonne `id`, `physicalRecordingId`, `processingJobId`, `callbackToken`, `providerRequestId`, `provider`, `status`, `attempt`, `submittedAt`, `receivedAt`, `errorCode`, `createdDate`, `createdBy`, `updatedDate`, `updatedBy`.

- [ ] **Step 1: Scrivi la migrazione**

Crea `lib/db/migrations/0047_stt-callback.sql`:

```sql
-- Trascrizione asincrona: una riga per ogni invio di un segmento audio al
-- provider STT.
--
-- Prima il worker attendeva la risposta dentro l'invocazione della function,
-- con un tetto di 60 secondi: una sessione di due ore non stava in quel
-- budget e falliva sempre, esaurendo i tentativi. Ora l'invio e la risposta
-- sono due momenti distinti, e questa tabella è ciò che li tiene legati:
-- rende la consegna idempotente e rende possibile accorgersi di una
-- risposta che non è mai arrivata.
CREATE TABLE "session_transcription_requests" (
  "id" serial PRIMARY KEY NOT NULL,
  "physical_recording_id" integer NOT NULL,
  "processing_job_id" integer NOT NULL,
  "callback_token" varchar(64) NOT NULL,
  "provider_request_id" varchar(200),
  "provider" varchar(80) NOT NULL,
  "status" varchar(24) DEFAULT 'submitted' NOT NULL,
  "attempt" integer DEFAULT 1 NOT NULL,
  "submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
  "received_at" timestamp with time zone,
  "error_code" varchar(80),
  "createddate" timestamp with time zone DEFAULT now() NOT NULL,
  "createdby" integer,
  "updateddate" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedby" integer,
  CONSTRAINT "session_transcription_requests_token_unique"
    UNIQUE ("callback_token"),
  CONSTRAINT "session_transcription_requests_status_check"
    CHECK ("status" IN ('submitted', 'received', 'failed')),
  CONSTRAINT "session_transcription_requests_attempt_check"
    CHECK ("attempt" >= 1)
);--> statement-breakpoint

ALTER TABLE "session_transcription_requests"
  ADD CONSTRAINT "session_transcription_requests_physical_fk"
  FOREIGN KEY ("physical_recording_id")
  REFERENCES "public"."session_audio_recordings"("id")
  ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_transcription_requests"
  ADD CONSTRAINT "session_transcription_requests_job_fk"
  FOREIGN KEY ("processing_job_id")
  REFERENCES "public"."session_ai_processing_jobs"("id")
  ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_transcription_requests"
  ADD CONSTRAINT "session_transcription_requests_createdby_fk"
  FOREIGN KEY ("createdby") REFERENCES "public"."users"("id")
  ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_transcription_requests"
  ADD CONSTRAINT "session_transcription_requests_updatedby_fk"
  FOREIGN KEY ("updatedby") REFERENCES "public"."users"("id")
  ON DELETE set null ON UPDATE no action;--> statement-breakpoint

-- Una sola richiesta viva per segmento fisico: due invii contemporanei dello
-- stesso audio produrrebbero due trascrizioni dello stesso parlato.
CREATE UNIQUE INDEX "session_transcription_requests_live_unique"
  ON "session_transcription_requests" ("physical_recording_id")
  WHERE "status" = 'submitted';--> statement-breakpoint

CREATE INDEX "session_transcription_requests_stale_idx"
  ON "session_transcription_requests" ("status", "submitted_at");--> statement-breakpoint

-- `awaiting_provider`: il job ha consegnato il lavoro e attende la callback.
-- Non è né in coda né in esecuzione, e nessun worker deve riprenderlo.
ALTER TABLE "session_ai_processing_jobs"
  DROP CONSTRAINT IF EXISTS "session_ai_processing_jobs_status_check";--> statement-breakpoint
ALTER TABLE "session_ai_processing_jobs"
  ADD CONSTRAINT "session_ai_processing_jobs_status_check"
  CHECK ("status" IN ('queued', 'processing', 'awaiting_provider',
                      'completed', 'failed', 'cancelled'));--> statement-breakpoint

-- L'unicità del job attivo deve coprire anche l'attesa del provider: un
-- segmento nuovo prodotto da una riconnessione creerebbe altrimenti un
-- secondo job orchestratore in parallelo al primo.
DROP INDEX IF EXISTS "session_ai_processing_jobs_active_operation_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "session_ai_processing_jobs_active_operation_unique"
  ON "session_ai_processing_jobs" (
    "session_ai_notes_id",
    COALESCE("participant_recording_id", 0),
    "job_type"
  ) WHERE "status" IN ('queued', 'processing', 'awaiting_provider');
```

- [ ] **Step 2: Registra la migrazione nel journal**

In `lib/db/migrations/meta/_journal.json`, aggiungi come ultimo elemento dell'array `entries`:

```json
    {
      "idx": 47,
      "version": "7",
      "when": 1786713300000,
      "tag": "0047_stt-callback",
      "breakpoints": true
    }
```

Ricorda la virgola dopo la voce `0046`.

- [ ] **Step 3: Aggiungi la tabella allo schema Drizzle**

In `lib/db/schema.ts`, dopo `sessionAiProcessingJobs`, aggiungi:

```typescript
/**
 * Un invio di un segmento audio al provider STT.
 *
 * Esiste perché invio e risposta sono separati nel tempo: senza un registro,
 * una risposta che non arriva è indistinguibile da una che non è mai stata
 * chiesta, e la trascrizione si perde in silenzio.
 */
export const sessionTranscriptionRequests = pgTable(
  'session_transcription_requests',
  {
    id: serial('id').primaryKey(),
    physicalRecordingId: integer('physical_recording_id')
      .notNull()
      .references(() => sessionAudioRecordings.id, { onDelete: 'cascade' }),
    processingJobId: integer('processing_job_id')
      .notNull()
      .references(() => sessionAiProcessingJobs.id, { onDelete: 'cascade' }),
    callbackToken: varchar('callback_token', { length: 64 })
      .notNull()
      .unique(),
    providerRequestId: varchar('provider_request_id', { length: 200 }),
    provider: varchar('provider', { length: 80 }).notNull(),
    status: varchar('status', { length: 24 }).notNull().default('submitted'),
    attempt: integer('attempt').notNull().default(1),
    submittedAt: timestamp('submitted_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    receivedAt: timestamp('received_at', { withTimezone: true }),
    errorCode: varchar('error_code', { length: 80 }),
    createdDate: timestamp('createddate', { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdBy: integer('createdby').references(() => users.id, {
      onDelete: 'set null',
    }),
    updatedDate: timestamp('updateddate', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedBy: integer('updatedby').references(() => users.id, {
      onDelete: 'set null',
    }),
  }
);

export type TranscriptionRequestStatus =
  | 'submitted'
  | 'received'
  | 'failed';
```

Se nel file esiste un tipo unione degli stati dei job (per esempio `AiProcessingJobStatus`), aggiungi `'awaiting_provider'` a quell'unione.

- [ ] **Step 4: Verifica la compilazione**

Run: `npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 5: Applica la migrazione**

> **Attenzione:** secondo la memoria di progetto, `.env.local`, Preview e Production puntano allo **stesso** progetto Supabase. Questa migrazione colpisce la produzione. È additiva (una tabella nuova, due vincoli allargati) e non distrugge dati, ma esegui il comando consapevolmente.

Run: `npm run db:migrate`
Expected: la migrazione `0047_stt-callback` risulta applicata.

Verifica: `npm run test:ai-notes:schema`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/db/migrations/0047_stt-callback.sql lib/db/migrations/meta/_journal.json lib/db/schema.ts
git commit -m "feat: schema per le richieste di trascrizione asincrone"
```

---

### Task 2: Signed URL nello storage audio

**Files:**
- Modify: `lib/core/ai-session-notes/audio-storage.ts`

**Interfaces:**
- Consumes: `AudioRecordingConfig` da `./recording-config`.
- Produces: sull'interfaccia `AudioStorage`, il metodo `createSignedUrl(key: string, expiresInSeconds: number): Promise<string>`. Implementato sia da `createProductionAudioStorage` sia da `InMemoryAudioStorage`.

- [ ] **Step 1: Scrivi il test che fallisce**

Crea `lib/core/ai-session-notes/audio-storage.test.ts`:

```typescript
import assert from 'node:assert/strict';
import test from 'node:test';
import { InMemoryAudioStorage } from './audio-storage';

test('lo storage in memoria produce una URL firmata per un oggetto esistente', async () => {
  const storage = new InMemoryAudioStorage();
  storage.put('audio-recordings/1/coach/a.ogg', Buffer.from('audio'));

  const url = await storage.createSignedUrl(
    'audio-recordings/1/coach/a.ogg',
    900
  );

  assert.match(url, /^https:\/\//);
  assert.ok(url.includes('audio-recordings/1/coach/a.ogg'));
});

test('una URL firmata per un oggetto assente fallisce', async () => {
  const storage = new InMemoryAudioStorage();

  await assert.rejects(
    () => storage.createSignedUrl('audio-recordings/1/coach/manca.ogg', 900),
    /AUDIO_OBJECT_NOT_FOUND/
  );
});
```

- [ ] **Step 2: Esegui il test e verifica che fallisca**

Run: `npx tsx --test lib/core/ai-session-notes/audio-storage.test.ts`
Expected: FAIL — `createSignedUrl is not a function`.

- [ ] **Step 3: Implementa**

In `lib/core/ai-session-notes/audio-storage.ts`, aggiungi il metodo all'interfaccia:

```typescript
export interface AudioStorage {
  inspect(key: string): Promise<StoredAudioObject>;
  download(key: string): Promise<Buffer>;
  deleteAndVerify(key: string): Promise<void>;
  /**
   * URL temporanea per un consumatore esterno fidato.
   *
   * Serve a far scaricare l'audio al provider STT senza che il nostro
   * processo tenga il file in memoria: era il caricamento dei byte dentro
   * una function da sessanta secondi a rendere impossibili le sessioni
   * lunghe. La scadenza è breve e l'URL viene rigenerata a ogni tentativo.
   */
  createSignedUrl(key: string, expiresInSeconds: number): Promise<string>;
}
```

Aggiungi a `InMemoryAudioStorage`:

```typescript
  async createSignedUrl(key: string, expiresInSeconds: number): Promise<string> {
    if (!this.objects.has(key)) throw new Error('AUDIO_OBJECT_NOT_FOUND');
    return `https://storage.invalid/${key}?expires=${expiresInSeconds}`;
  }
```

Aggiungi la funzione di produzione, subito dopo `downloadAudioObject`:

```typescript
/** URL temporanea verso un oggetto privato; non viene mai esposta al browser. */
export async function createAudioObjectSignedUrl(
  config: AudioRecordingConfig,
  key: string,
  expiresInSeconds: number
): Promise<string> {
  splitObjectKey(key);
  const { data, error } = await storageClient(config)
    .storage.from(config.bucket)
    .createSignedUrl(key, expiresInSeconds);
  if (error || !data?.signedUrl) {
    throw new Error('AUDIO_OBJECT_SIGNED_URL_FAILED');
  }
  return data.signedUrl;
}
```

E collegala in `createProductionAudioStorage`:

```typescript
export function createProductionAudioStorage(config: AudioRecordingConfig): AudioStorage {
  return {
    inspect: (key) => inspectAudioObject(config, key),
    download: (key) => downloadAudioObject(config, key),
    deleteAndVerify: (key) => deleteAudioObjectAndVerify(config, key),
    createSignedUrl: (key, expiresInSeconds) =>
      createAudioObjectSignedUrl(config, key, expiresInSeconds),
  };
}
```

- [ ] **Step 4: Esegui il test e verifica che passi**

Run: `npx tsx --test lib/core/ai-session-notes/audio-storage.test.ts`
Expected: PASS — 2 test superati.

- [ ] **Step 5: Registra il test e compila**

Nello script `"test"` di `package.json` aggiungi `lib/core/ai-session-notes/audio-storage.test.ts`.

Run: `npm test`
Expected: PASS.

Run: `npx tsc --noEmit`
Expected: nessun errore. Se altre implementazioni di `AudioStorage` esistono nei test, aggiungi anche lì `createSignedUrl`.

- [ ] **Step 6: Commit**

```bash
git add lib/core/ai-session-notes/audio-storage.ts lib/core/ai-session-notes/audio-storage.test.ts package.json
git commit -m "feat: signed url a scadenza breve per lo storage audio"
```

---

### Task 3: Il provider invia invece di attendere

**Files:**
- Modify: `lib/core/ai-session-notes/providers.ts`
- Modify: `lib/core/ai-session-notes/providers.test.ts`

**Interfaces:**
- Consumes: `AiNotesProcessingError` da `./processing-policy`.
- Produces:
  - `export type TranscriptionSubmitInput = { audioUrl: string; callbackUrl: string; language: string; model: string }`
  - `export type TranscriptionSubmission = { providerRequestId: string }`
  - `export function parseDeepgramUtterances(payload: unknown, physicalSegmentId: number): TranscriptionResult` — pura, nessuna rete.
  - `export interface SpeechToTextProvider { submit(input: TranscriptionSubmitInput): Promise<TranscriptionSubmission>; parseCallback(payload: unknown, physicalSegmentId: number): TranscriptionResult }`
  - `transcribe()` **rimosso** dall'interfaccia e da tutte le implementazioni.

- [ ] **Step 1: Scrivi i test che falliscono**

In `lib/core/ai-session-notes/providers.test.ts`, sostituisci i test di `transcribe` con:

```typescript
test('il parsing della callback estrae le utterance', () => {
  const result = parseDeepgramUtterances(
    {
      metadata: { request_id: 'req-1' },
      results: {
        utterances: [
          { start: 1.5, end: 3.25, transcript: 'Ciao', confidence: 0.9 },
          { start: 4, end: 5, transcript: '   ', confidence: 0.8 },
          { start: 9, end: 8, transcript: 'invertito' },
        ],
      },
    },
    77
  );

  assert.equal(result.providerOperationId, 'req-1');
  assert.equal(result.segments.length, 1);
  assert.deepEqual(result.segments[0], {
    startMs: 1500,
    endMs: 3250,
    text: 'Ciao',
    confidence: 0.9,
    providerSegmentId: '77:0',
  });
});

test('una callback senza utterance viene rifiutata', () => {
  assert.throws(
    () => parseDeepgramUtterances({ results: {} }, 1),
    /PROVIDER_BAD_RESPONSE/
  );
});

test('submit consegna audio e callback e restituisce il request id', async () => {
  const calls: Array<{ url: string; body: string }> = [];
  const provider = new DeepgramNova3SpeechToTextProvider(
    'chiave',
    5_000,
    (async (url: string, init: RequestInit) => {
      calls.push({ url: String(url), body: String(init.body) });
      return new Response(JSON.stringify({ request_id: 'req-42' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as unknown as typeof fetch
  );

  const submission = await provider.submit({
    audioUrl: 'https://storage.invalid/a.ogg',
    callbackUrl: 'https://app.invalid/api/internal/ai-notes/stt-callback/tok',
    language: 'it',
    model: 'nova-3',
  });

  assert.equal(submission.providerRequestId, 'req-42');
  assert.ok(calls[0].url.includes('callback=https%3A%2F%2Fapp.invalid'));
  assert.ok(calls[0].url.includes('model=nova-3'));
  assert.deepEqual(JSON.parse(calls[0].body), {
    url: 'https://storage.invalid/a.ogg',
  });
});

test('submit senza request id fallisce', async () => {
  const provider = new DeepgramNova3SpeechToTextProvider(
    'chiave',
    5_000,
    (async () =>
      new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })) as unknown as typeof fetch
  );

  await assert.rejects(
    () =>
      provider.submit({
        audioUrl: 'https://storage.invalid/a.ogg',
        callbackUrl: 'https://app.invalid/cb',
        language: 'it',
        model: 'nova-3',
      }),
    /PROVIDER_BAD_RESPONSE/
  );
});
```

Aggiorna gli import in cima al file di test con `parseDeepgramUtterances`.

- [ ] **Step 2: Esegui i test e verifica che falliscano**

Run: `npx tsx --test lib/core/ai-session-notes/providers.test.ts`
Expected: FAIL — `parseDeepgramUtterances` non esportata, `submit` non esiste.

- [ ] **Step 3: Riscrivi il provider**

In `lib/core/ai-session-notes/providers.ts`, sostituisci i tipi e l'interfaccia:

```typescript
export type TranscriptionSegment = { startMs: number; endMs: number; text: string; confidence?: number; providerSegmentId: string };
export type TranscriptionResult = { providerOperationId?: string; model: string; segments: TranscriptionSegment[] };

export type TranscriptionSubmitInput = {
  audioUrl: string;
  callbackUrl: string;
  language: string;
  model: string;
};
export type TranscriptionSubmission = { providerRequestId: string };

/**
 * Il provider consegna il lavoro e se ne va; i risultati arrivano più tardi
 * sulla callback. Non esiste più un metodo che attende la trascrizione: era
 * quell'attesa, dentro una function con un tetto di sessanta secondi, a
 * rendere impossibili le sessioni lunghe.
 */
export interface SpeechToTextProvider {
  submit(input: TranscriptionSubmitInput): Promise<TranscriptionSubmission>;
  parseCallback(payload: unknown, physicalSegmentId: number): TranscriptionResult;
}
```

Estrai il parsing in una funzione pura — è la stessa logica di prima, ora condivisa fra provider e test:

```typescript
/**
 * Converte la risposta Deepgram in segmenti nostri.
 *
 * Pura e priva di rete: la callback la usa per ingerire, i test per
 * verificare, senza che nessuno dei due debba parlare con Deepgram.
 */
export function parseDeepgramUtterances(
  payload: unknown,
  physicalSegmentId: number
): TranscriptionResult {
  const value = payload as {
    metadata?: { request_id?: unknown };
    results?: { utterances?: unknown };
  };
  if (!Array.isArray(value.results?.utterances)) {
    throw new AiNotesProcessingError('PROVIDER_BAD_RESPONSE', 'Risposta STT priva di segmenti.');
  }
  const segments = value.results.utterances.flatMap((utterance, index) => {
    const row = utterance as Record<string, unknown>;
    const start = Number(row.start);
    const end = Number(row.end);
    const text = typeof row.transcript === 'string' ? row.transcript.trim() : '';
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start || !text) return [];
    const confidence = Number(row.confidence);
    return [{
      startMs: Math.round(start * 1000),
      endMs: Math.round(end * 1000),
      text,
      confidence: Number.isFinite(confidence) && confidence >= 0 && confidence <= 1 ? confidence : undefined,
      providerSegmentId: `${physicalSegmentId}:${index}`,
    }];
  });
  return {
    providerOperationId: typeof value.metadata?.request_id === 'string' ? value.metadata.request_id : undefined,
    model: process.env.AI_NOTES_STT_MODEL?.trim() || 'nova-3',
    segments,
  };
}
```

Sostituisci il corpo di `DeepgramNova3SpeechToTextProvider`:

```typescript
export class DeepgramNova3SpeechToTextProvider implements SpeechToTextProvider {
  constructor(private readonly apiKey: string, private readonly timeoutMs: number, private readonly fetcher: typeof fetch = fetch) {}

  async submit(input: TranscriptionSubmitInput): Promise<TranscriptionSubmission> {
    const query = new URLSearchParams({
      model: input.model,
      language: input.language,
      smart_format: 'true',
      utterances: 'true',
      punctuate: 'true',
      callback: input.callbackUrl,
    });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetcher(`https://api.deepgram.com/v1/listen?${query}`, {
        method: 'POST',
        headers: {
          Authorization: `Token ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: input.audioUrl }),
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new AiNotesProcessingError('PROVIDER_TIMEOUT', 'Provider STT non ha risposto in tempo.');
      }
      throw new AiNotesProcessingError('TRANSCRIPTION_FAILED', 'Richiesta STT non completata.');
    } finally { clearTimeout(timer); }

    if (response.status === 401 || response.status === 403) throw new AiNotesProcessingError('PROVIDER_AUTH_FAILED', 'Autorizzazione provider STT non valida.');
    if (response.status === 429) throw new AiNotesProcessingError('PROVIDER_RATE_LIMITED', 'Provider STT temporaneamente limitato.');
    if (!response.ok) throw new AiNotesProcessingError('TRANSCRIPTION_FAILED', 'Provider STT non ha accettato la richiesta.');

    let payload: unknown;
    try { payload = await response.json(); } catch { throw new AiNotesProcessingError('PROVIDER_BAD_RESPONSE', 'Risposta STT non valida.'); }
    const requestId = (payload as { request_id?: unknown }).request_id;
    if (typeof requestId !== 'string' || !requestId) {
      throw new AiNotesProcessingError('PROVIDER_BAD_RESPONSE', 'Risposta STT priva di identificativo.');
    }
    return { providerRequestId: requestId };
  }

  parseCallback(payload: unknown, physicalSegmentId: number): TranscriptionResult {
    return parseDeepgramUtterances(payload, physicalSegmentId);
  }
}
```

Aggiorna `DisabledSpeechToTextProvider` allo stesso contratto:

```typescript
export class DisabledSpeechToTextProvider implements SpeechToTextProvider {
  async submit(_input: TranscriptionSubmitInput): Promise<TranscriptionSubmission> {
    throw new AiNotesProcessingError('PROVIDER_NOT_CONFIGURED', 'Nessun provider Speech-to-Text è configurato.');
  }
  parseCallback(_payload: unknown, _physicalSegmentId: number): TranscriptionResult {
    throw new AiNotesProcessingError('PROVIDER_NOT_CONFIGURED', 'Nessun provider Speech-to-Text è configurato.');
  }
}
```

Rimuovi il tipo `TranscriptionInput`, ora inutilizzato.

- [ ] **Step 4: Esegui i test e verifica che passino**

Run: `npx tsx --test lib/core/ai-session-notes/providers.test.ts`
Expected: PASS.

- [ ] **Step 5: Compila**

Run: `npx tsc --noEmit`
Expected: errori attesi in `processing.ts` (usa ancora `transcribe`) e nei test del worker. Verranno risolti nel Task 4. Non correggerli qui, ma **annota** quali file segnala.

- [ ] **Step 6: Commit**

```bash
git add lib/core/ai-session-notes/providers.ts lib/core/ai-session-notes/providers.test.ts
git commit -m "feat: il provider STT consegna il lavoro invece di attenderlo"
```

---

### Task 4: Il worker invia e si ritira

**Files:**
- Create: `lib/core/ai-session-notes/transcription-dispatch.ts`
- Modify: `lib/core/ai-session-notes/processing.ts`
- Modify: `.env.example`

**Interfaces:**
- Consumes: `AiSessionNotesDependencies`, `sessionTranscriptionRequests` (Task 1), `AudioStorage.createSignedUrl` (Task 2), `SpeechToTextProvider.submit` (Task 3).
- Produces:
  - `export function sttCallbackUrl(token: string): string`
  - `export const SIGNED_URL_TTL_SECONDS = 900`
  - `export async function dispatchPendingTranscriptionRequests(job: { id: number; sessionAiNotesId: number; participantRecordingId: number; provider: string }, dependencies: AiSessionNotesDependencies): Promise<{ submitted: number; remaining: number }>` — `remaining` è il numero di segmenti ancora da inviare o in attesa.

- [ ] **Step 1: Aggiungi la variabile d'ambiente**

In `.env.example`, accanto alle altre variabili `AI_NOTES_`:

```
# URL pubblica dell'applicazione, usata per costruire la callback che
# Deepgram richiama a trascrizione conclusa. Deve essere raggiungibile da
# internet: in locale serve un tunnel, altrimenti i risultati non arrivano.
AI_NOTES_CALLBACK_BASE_URL=https://app.example.com
```

- [ ] **Step 2: Scrivi il modulo di invio**

Crea `lib/core/ai-session-notes/transcription-dispatch.ts`:

```typescript
import 'server-only';
import { randomBytes } from 'node:crypto';
import { and, asc, eq, inArray } from 'drizzle-orm';
import {
  sessionAudioRecordings,
  sessionTranscriptSegments,
  sessionTranscriptionRequests,
} from '@/lib/db/schema';
import { getAiNotesAudioMaxBytes } from './recording-config';
import { AiNotesProcessingError } from './processing-policy';
import type { AiSessionNotesDependencies } from './dependencies';

/**
 * Quindici minuti: Deepgram scarica subito dopo aver accettato la richiesta,
 * e una finestra più larga terrebbe l'audio raggiungibile senza motivo.
 */
export const SIGNED_URL_TTL_SECONDS = 900;

export function sttCallbackUrl(token: string): string {
  const base = process.env.AI_NOTES_CALLBACK_BASE_URL?.trim();
  if (!base) {
    throw new AiNotesProcessingError(
      'PROVIDER_NOT_CONFIGURED',
      'URL di callback non configurata.'
    );
  }
  return `${base.replace(/\/$/, '')}/api/internal/ai-notes/stt-callback/${token}`;
}

/**
 * Invia al provider tutti i segmenti del partecipante non ancora trascritti
 * e non già in attesa di risposta.
 *
 * Non scarica mai l'audio: consegna una URL firmata e lascia che sia il
 * provider a scaricare. È ciò che porta l'invocazione da decine di secondi a
 * circa uno, e che rende la durata della sessione irrilevante.
 */
export async function dispatchPendingTranscriptionRequests(
  job: {
    id: number;
    sessionAiNotesId: number;
    participantRecordingId: number;
    provider: string;
  },
  dependencies: AiSessionNotesDependencies
): Promise<{ submitted: number; remaining: number }> {
  const maxAudioBytes = getAiNotesAudioMaxBytes();
  const model = process.env.AI_NOTES_STT_MODEL?.trim() || 'nova-3';
  if (model !== 'nova-3') {
    throw new AiNotesProcessingError('INVALID_JOB', 'Modello STT non consentito.');
  }

  const rows = await dependencies.db
    .select({
      id: sessionAudioRecordings.id,
      status: sessionAudioRecordings.status,
      objectKey: sessionAudioRecordings.storageObjectKey,
      mimeType: sessionAudioRecordings.mimeType,
      sizeBytes: sessionAudioRecordings.sizeBytes,
      checksum: sessionAudioRecordings.checksum,
    })
    .from(sessionAudioRecordings)
    .where(
      and(
        eq(sessionAudioRecordings.sessionAiNotesId, job.sessionAiNotesId),
        eq(
          sessionAudioRecordings.participantRecordingId,
          job.participantRecordingId
        )
      )
    )
    .orderBy(asc(sessionAudioRecordings.segmentOrder), asc(sessionAudioRecordings.id));

  let submitted = 0;
  let remaining = 0;

  for (const row of rows) {
    const already = await dependencies.db
      .select({ id: sessionTranscriptSegments.id })
      .from(sessionTranscriptSegments)
      .where(
        and(
          eq(sessionTranscriptSegments.physicalRecordingId, row.id),
          eq(sessionTranscriptSegments.provider, job.provider)
        )
      )
      .limit(1);
    if (already.length) continue;

    const live = await dependencies.db
      .select({ id: sessionTranscriptionRequests.id })
      .from(sessionTranscriptionRequests)
      .where(
        and(
          eq(sessionTranscriptionRequests.physicalRecordingId, row.id),
          eq(sessionTranscriptionRequests.status, 'submitted')
        )
      )
      .limit(1);
    if (live.length) {
      remaining += 1;
      continue;
    }

    if (row.status !== 'recorded') {
      // Un segmento ancora aperto non è un errore: la sessione può essere in
      // corso. Si conta come mancante e si riproverà.
      remaining += 1;
      continue;
    }
    if (
      row.mimeType !== 'audio/ogg' ||
      row.sizeBytes === null ||
      row.sizeBytes <= 0 ||
      row.sizeBytes > maxAudioBytes
    ) {
      throw new AiNotesProcessingError('UNSUPPORTED_AUDIO', 'Formato o dimensione audio non supportati.');
    }

    const inspected = await dependencies.audioStorage.inspect(row.objectKey);
    if (!inspected.exists) {
      throw new AiNotesProcessingError('AUDIO_NOT_FOUND', 'File audio non trovato.');
    }
    if (
      inspected.sizeBytes !== row.sizeBytes ||
      (row.checksum && inspected.checksum && row.checksum !== inspected.checksum)
    ) {
      throw new AiNotesProcessingError('AUDIO_INTEGRITY_FAILED', 'Integrità file audio non verificata.');
    }

    const token = randomBytes(32).toString('hex');
    const audioUrl = await dependencies.audioStorage.createSignedUrl(
      row.objectKey,
      SIGNED_URL_TTL_SECONDS
    );

    const previous = await dependencies.db
      .select({ attempt: sessionTranscriptionRequests.attempt })
      .from(sessionTranscriptionRequests)
      .where(eq(sessionTranscriptionRequests.physicalRecordingId, row.id))
      .orderBy(asc(sessionTranscriptionRequests.id));
    const attempt = previous.length + 1;

    const submission = await dependencies.speechToTextProvider.submit({
      audioUrl,
      callbackUrl: sttCallbackUrl(token),
      language: 'it',
      model,
    });

    await dependencies.db.insert(sessionTranscriptionRequests).values({
      physicalRecordingId: row.id,
      processingJobId: job.id,
      callbackToken: token,
      providerRequestId: submission.providerRequestId,
      provider: job.provider,
      status: 'submitted',
      attempt,
      submittedAt: dependencies.clock.now(),
    });

    submitted += 1;
    remaining += 1;
  }

  return { submitted, remaining };
}
```

- [ ] **Step 3: Sostituisci `transcribeParticipantRecording` nel worker**

In `lib/core/ai-session-notes/processing.ts`, elimina `transcribeParticipantRecording` per intero e, dentro `processAiNotesBatch`, sostituisci il ramo `if (job.job_type === 'transcription')` con:

```typescript
      if (job.job_type === 'transcription') {
        if (!job.participant_recording_id) {
          throw new AiNotesProcessingError(
            'PARTICIPANT_RECORDING_NOT_FOUND',
            'Registrazione partecipante non trovata.'
          );
        }
        const dispatch = await dispatchPendingTranscriptionRequests(
          {
            id: job.id,
            sessionAiNotesId: job.session_ai_notes_id,
            participantRecordingId: job.participant_recording_id,
            provider: job.provider,
          },
          dependencies
        );
        if (dispatch.remaining === 0) {
          // Tutto già trascritto: nulla da attendere.
          if (await completeAiProcessingJob({ jobId: job.id, workerId: params.workerId }, dependencies)) {
            result.completed += 1;
            await enqueueNormalizationIfReady(job.session_ai_notes_id, dependencies);
          }
        } else {
          // Il lavoro è dal provider. Il job esce dalla coda senza essere
          // completato: lo risveglierà la callback.
          await parkAiProcessingJob(
            { jobId: job.id, workerId: params.workerId },
            dependencies
          );
          result.parked += 1;
        }
      } else if (job.job_type === 'report_generation') {
```

Aggiorna il tipo di ritorno di `processAiNotesBatch` aggiungendo `parked: number`, e inizializza `parked: 0` in `result`.

Aggiungi gli import: `dispatchPendingTranscriptionRequests` da `./transcription-dispatch`.

- [ ] **Step 4: Aggiungi `parkAiProcessingJob`**

In `lib/core/ai-session-notes/processing.ts`, accanto a `completeAiProcessingJob`:

```typescript
/**
 * Mette il job in attesa del provider.
 *
 * Non è né completato né fallito: il lavoro è stato consegnato e la risposta
 * arriverà su un altro percorso. Nessun worker deve riprenderlo nel
 * frattempo, ed è per questo che `awaiting_provider` è fuori dagli stati
 * claimabili.
 */
export async function parkAiProcessingJob(params: {
  jobId: number;
  workerId: string;
}, dependencies: AiSessionNotesDependencies): Promise<boolean> {
  const [updated] = await dependencies.db
    .update(sessionAiProcessingJobs)
    .set({
      status: 'awaiting_provider',
      lockedBy: null,
      lockedAt: null,
      updatedDate: dependencies.clock.now(),
    })
    .where(
      and(
        eq(sessionAiProcessingJobs.id, params.jobId),
        eq(sessionAiProcessingJobs.status, 'processing'),
        eq(sessionAiProcessingJobs.lockedBy, params.workerId)
      )
    )
    .returning({ id: sessionAiProcessingJobs.id });
  return Boolean(updated);
}
```

- [ ] **Step 5: Compila e correggi i test del worker**

Run: `npx tsc --noEmit`
Expected: errori in `lib/core/ai-session-notes/transcription-worker-dependency-injection.test.ts`, che implementa `SpeechToTextProvider` con `transcribe`. Aggiorna quella finta implementazione al nuovo contratto: `submit` restituisce un `providerRequestId` fisso, `parseCallback` delega a `parseDeepgramUtterances`. Aggiungi anche `createSignedUrl` a eventuali storage finti.

Ripeti finché `npx tsc --noEmit` non è pulito.

- [ ] **Step 6: Esegui i test**

Run: `npm run test:ai-notes:testability`
Expected: PASS. I test che verificavano la trascrizione sincrona vanno riscritti per verificare che il job finisca in `awaiting_provider` e che esista una riga in `session_transcription_requests`.

- [ ] **Step 7: Commit**

```bash
git add lib/core/ai-session-notes/transcription-dispatch.ts lib/core/ai-session-notes/processing.ts lib/core/ai-session-notes/transcription-worker-dependency-injection.test.ts .env.example
git commit -m "feat: il worker consegna la trascrizione e si ritira"
```

---

### Task 5: L'endpoint di callback

**Files:**
- Create: `lib/core/ai-session-notes/stt-callback.ts`
- Create: `lib/core/ai-session-notes/stt-callback.test.ts`
- Create: `app/api/internal/ai-notes/stt-callback/[token]/route.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `parseDeepgramUtterances` (Task 3), `sessionTranscriptionRequests` (Task 1), `enqueueNormalizationIfReady` e `completeAiProcessingJob` da `./processing`.
- Produces:
  - `export function isCallbackTokenWellFormed(token: string): boolean`
  - `export async function ingestTranscriptionCallback(params: { token: string; payload: unknown }, dependencies: AiSessionNotesDependencies): Promise<'ingested' | 'duplicate' | 'unknown'>`

- [ ] **Step 1: Scrivi il test che fallisce**

Crea `lib/core/ai-session-notes/stt-callback.test.ts`:

```typescript
import assert from 'node:assert/strict';
import test from 'node:test';
import { isCallbackTokenWellFormed } from './stt-callback';

test('un token valido è esadecimale di 64 caratteri', () => {
  assert.equal(isCallbackTokenWellFormed('a'.repeat(64)), true);
});

test('un token troppo corto è rifiutato', () => {
  assert.equal(isCallbackTokenWellFormed('abc'), false);
});

test('un token con caratteri non esadecimali è rifiutato', () => {
  assert.equal(isCallbackTokenWellFormed('z'.repeat(64)), false);
});

test('un percorso travestito da token è rifiutato', () => {
  assert.equal(isCallbackTokenWellFormed('../../etc/passwd'), false);
});
```

- [ ] **Step 2: Esegui e verifica che fallisca**

Run: `npx tsx --test lib/core/ai-session-notes/stt-callback.test.ts`
Expected: FAIL — modulo inesistente.

- [ ] **Step 3: Implementa l'ingestione**

Crea `lib/core/ai-session-notes/stt-callback.ts`:

```typescript
import 'server-only';
import { and, eq } from 'drizzle-orm';
import {
  sessionAiProcessingJobs,
  sessionAudioRecordings,
  sessionTranscriptSegments,
  sessionTranscriptionRequests,
} from '@/lib/db/schema';
import { parseDeepgramUtterances } from './providers';
import type { AiSessionNotesDependencies } from './dependencies';

/** Il token è generato da noi: 32 byte casuali in esadecimale. */
export function isCallbackTokenWellFormed(token: string): boolean {
  return /^[0-9a-f]{64}$/.test(token);
}

/**
 * Ingerisce i risultati di una trascrizione consegnati dal provider.
 *
 * Deve tollerare consegne ripetute: Deepgram ritenta fino a dieci volte se
 * non riceve un 2xx, e una seconda ingestione dello stesso audio
 * duplicherebbe il parlato. La riga della richiesta è il punto di
 * serializzazione: solo chi riesce a portarla da `submitted` a `received`
 * scrive i segmenti.
 */
export async function ingestTranscriptionCallback(
  params: { token: string; payload: unknown },
  dependencies: AiSessionNotesDependencies
): Promise<'ingested' | 'duplicate' | 'unknown'> {
  if (!isCallbackTokenWellFormed(params.token)) return 'unknown';

  const [request] = await dependencies.db
    .select({
      id: sessionTranscriptionRequests.id,
      status: sessionTranscriptionRequests.status,
      provider: sessionTranscriptionRequests.provider,
      providerRequestId: sessionTranscriptionRequests.providerRequestId,
      physicalRecordingId: sessionTranscriptionRequests.physicalRecordingId,
      jobId: sessionTranscriptionRequests.processingJobId,
    })
    .from(sessionTranscriptionRequests)
    .where(eq(sessionTranscriptionRequests.callbackToken, params.token))
    .limit(1);
  if (!request) return 'unknown';
  if (request.status !== 'submitted') return 'duplicate';

  // Il request_id nel payload deve corrispondere a quello che ci è stato
  // restituito all'invio: un token valido con un corpo altrui non passa.
  const deliveredRequestId = (params.payload as { metadata?: { request_id?: unknown } })
    ?.metadata?.request_id;
  if (
    request.providerRequestId &&
    typeof deliveredRequestId === 'string' &&
    deliveredRequestId !== request.providerRequestId
  ) {
    return 'unknown';
  }

  const [claimed] = await dependencies.db
    .update(sessionTranscriptionRequests)
    .set({
      status: 'received',
      receivedAt: dependencies.clock.now(),
      updatedDate: dependencies.clock.now(),
    })
    .where(
      and(
        eq(sessionTranscriptionRequests.id, request.id),
        eq(sessionTranscriptionRequests.status, 'submitted')
      )
    )
    .returning({ id: sessionTranscriptionRequests.id });
  if (!claimed) return 'duplicate';

  const [recording] = await dependencies.db
    .select({
      id: sessionAudioRecordings.id,
      sessionId: sessionAudioRecordings.sessionAiNotesId,
      participantRecordingId: sessionAudioRecordings.participantRecordingId,
      participantUserId: sessionAudioRecordings.participantUserId,
      participantRole: sessionAudioRecordings.participantRole,
      startedAt: sessionAudioRecordings.startedAt,
    })
    .from(sessionAudioRecordings)
    .where(eq(sessionAudioRecordings.id, request.physicalRecordingId))
    .limit(1);
  if (!recording) return 'unknown';

  const parsed = parseDeepgramUtterances(params.payload, recording.id);

  await dependencies.db.transaction(async (tx) => {
    // Sostituzione atomica per file fisico: una reimmissione non somma
    // testo a quello già presente.
    await tx
      .delete(sessionTranscriptSegments)
      .where(
        and(
          eq(sessionTranscriptSegments.physicalRecordingId, recording.id),
          eq(sessionTranscriptSegments.provider, request.provider)
        )
      );
    if (parsed.segments.length) {
      await tx.insert(sessionTranscriptSegments).values(
        parsed.segments.map((segment, index) => ({
          sessionAiNotesId: recording.sessionId,
          participantRecordingId: recording.participantRecordingId,
          physicalRecordingId: recording.id,
          participantUserId: recording.participantUserId,
          speakerRole: recording.participantRole,
          sequenceNumber: index,
          startedAtMs: segment.startMs,
          endedAtMs: segment.endMs,
          text: segment.text,
          confidence: segment.confidence ?? null,
          provider: request.provider,
          providerModel: parsed.model,
          providerSegmentId: segment.providerSegmentId,
        }))
      );
    }
  });

  return 'ingested';
}
```

> **Nota per l'implementatore:** i nomi esatti delle colonne di `sessionTranscriptSegments` vanno verificati in `lib/db/schema.ts` prima di scrivere l'insert. Il vecchio `transcribeParticipantRecording` in `processing.ts` (rimosso nel Task 4, recuperabile con `git show HEAD~1`) conteneva l'insert corretto: **copia da lì i nomi dei campi**, non inventarli.

- [ ] **Step 4: Fai avanzare il job dopo l'ingestione**

Aggiungi in fondo a `stt-callback.ts`:

```typescript
/**
 * Dopo l'ingestione, decide il destino del job.
 *
 * Non lo completa alla cieca: se nel frattempo è comparso un segmento nuovo —
 * ed è proprio ciò che produce una riconnessione — il job torna in coda
 * invece di chiudersi, così la corsa successiva lo invia. Si completa solo
 * quando non resta nulla da trascrivere.
 */
export async function advanceJobAfterCallback(
  jobId: number,
  dependencies: AiSessionNotesDependencies
): Promise<'completed' | 'requeued' | 'waiting'> {
  const [job] = await dependencies.db
    .select({
      id: sessionAiProcessingJobs.id,
      sessionId: sessionAiProcessingJobs.sessionAiNotesId,
      participantRecordingId: sessionAiProcessingJobs.participantRecordingId,
      status: sessionAiProcessingJobs.status,
      provider: sessionAiProcessingJobs.provider,
    })
    .from(sessionAiProcessingJobs)
    .where(eq(sessionAiProcessingJobs.id, jobId))
    .limit(1);
  if (!job || job.status !== 'awaiting_provider' || !job.participantRecordingId) {
    return 'waiting';
  }

  const pending = await dependencies.db
    .select({ id: sessionTranscriptionRequests.id })
    .from(sessionTranscriptionRequests)
    .where(
      and(
        eq(sessionTranscriptionRequests.processingJobId, jobId),
        eq(sessionTranscriptionRequests.status, 'submitted')
      )
    )
    .limit(1);
  if (pending.length) return 'waiting';

  const now = dependencies.clock.now();
  const untranscribed = await dependencies.db
    .select({ id: sessionAudioRecordings.id })
    .from(sessionAudioRecordings)
    .where(
      and(
        eq(sessionAudioRecordings.participantRecordingId, job.participantRecordingId),
        eq(sessionAudioRecordings.status, 'recorded')
      )
    );
  const transcribed = await dependencies.db
    .select({ physicalId: sessionTranscriptSegments.physicalRecordingId })
    .from(sessionTranscriptSegments)
    .where(eq(sessionTranscriptSegments.participantRecordingId, job.participantRecordingId));
  const missing = untranscribed.filter(
    (row) => !transcribed.some((segment) => segment.physicalId === row.id)
  );

  if (missing.length) {
    await dependencies.db
      .update(sessionAiProcessingJobs)
      .set({ status: 'queued', availableAfter: now, updatedDate: now })
      .where(eq(sessionAiProcessingJobs.id, jobId));
    return 'requeued';
  }

  await dependencies.db
    .update(sessionAiProcessingJobs)
    .set({ status: 'completed', completedAt: now, updatedDate: now })
    .where(eq(sessionAiProcessingJobs.id, jobId));
  return 'completed';
}
```

Poi, in `ingestTranscriptionCallback`, sostituisci `return 'ingested';` con:

```typescript
  await advanceJobAfterCallback(request.jobId, dependencies);
  return 'ingested';
```

E, quando `advanceJobAfterCallback` restituisce `'completed'`, chiama `enqueueNormalizationIfReady(recording.sessionId, dependencies)` — importala da `./processing`.

- [ ] **Step 5: Crea l'endpoint HTTP**

Crea `app/api/internal/ai-notes/stt-callback/[token]/route.ts`:

```typescript
import { after } from 'next/server';
import { ingestTranscriptionCallback } from '@/lib/core/ai-session-notes/stt-callback';
import { createProductionAiSessionNotesDependencies } from '@/lib/core/ai-session-notes/dependencies';
import { triggerAiNotesWorker } from '@/lib/core/ai-session-notes/worker-trigger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
/** L'ingestione è scrittura su database, non attesa di rete: bastano pochi secondi. */
export const maxDuration = 60;

/**
 * Riceve i risultati della trascrizione dal provider STT.
 *
 * Il token nel percorso è l'unica credenziale, ed è per singola richiesta:
 * l'header `dg-token` di Deepgram è un identificatore di chiave, non un
 * segreto, e non basterebbe. Un token sconosciuto riceve 404, così chi sonda
 * dall'esterno non distingue una richiesta inesistente da una già consumata.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: 'Payload non valido.' }, { status: 400 });
  }

  try {
    const dependencies = createProductionAiSessionNotesDependencies();
    const outcome = await ingestTranscriptionCallback(
      { token, payload },
      dependencies
    );
    if (outcome === 'unknown') {
      return Response.json({ error: 'Non trovato.' }, { status: 404 });
    }
    // Una consegna già vista risponde comunque 2xx: altrimenti il provider
    // continuerebbe a ritentare una consegna che abbiamo già trattato.
    if (outcome === 'ingested') {
      after(async () => {
        // Se restano segmenti da inviare il job è tornato in coda: va
        // risvegliato subito, non al prossimo cron.
        await triggerAiNotesWorker().catch(() => {});
      });
    }
    return Response.json({ received: true, duplicate: outcome === 'duplicate' });
  } catch (error) {
    // Un 5xx fa ritentare il provider, che è il comportamento voluto quando
    // il guasto è nostro.
    console.error('[stt-callback] ingestione non riuscita', error);
    return Response.json({ error: 'Non elaborato.' }, { status: 500 });
  }
}
```

- [ ] **Step 6: Esegui i test**

Run: `npx tsx --test lib/core/ai-session-notes/stt-callback.test.ts`
Expected: PASS — 4 test superati.

Aggiungi `lib/core/ai-session-notes/stt-callback.test.ts` allo script `"test"` di `package.json`.

Run: `npm test`
Expected: PASS.

Run: `npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 7: Commit**

```bash
git add lib/core/ai-session-notes/stt-callback.ts lib/core/ai-session-notes/stt-callback.test.ts app/api/internal/ai-notes/stt-callback package.json
git commit -m "feat: endpoint di callback per i risultati della trascrizione"
```

---

### Task 6: Nessuna trascrizione si perde

Il cuore del requisito «a prova di bomba»: se la callback non arriva, il sistema se ne accorge e reinvia.

**Files:**
- Modify: `lib/core/ai-session-notes/processing.ts`
- Create: `lib/core/ai-session-notes/transcription-recovery.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `sessionTranscriptionRequests` (Task 1).
- Produces:
  - `export const STALE_TRANSCRIPTION_REQUEST_MINUTES = 20`
  - `export function isTranscriptionRequestStale(params: { submittedAt: Date; now: Date; staleAfterMinutes: number }): boolean`
  - `export async function recoverStaleTranscriptionRequests(params: { limit: number }, dependencies: AiSessionNotesDependencies): Promise<number>`

- [ ] **Step 1: Scrivi il test che fallisce**

Crea `lib/core/ai-session-notes/transcription-recovery.test.ts`:

```typescript
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isTranscriptionRequestStale,
  STALE_TRANSCRIPTION_REQUEST_MINUTES,
} from './processing';

const NOW = new Date('2026-08-08T12:00:00.000Z');

test('la soglia di reimmissione è di venti minuti', () => {
  assert.equal(STALE_TRANSCRIPTION_REQUEST_MINUTES, 20);
});

test('una richiesta inviata da poco non è considerata persa', () => {
  assert.equal(
    isTranscriptionRequestStale({
      submittedAt: new Date('2026-08-08T11:55:00.000Z'),
      now: NOW,
      staleAfterMinutes: 20,
    }),
    false,
    'il provider potrebbe stare ancora trascrivendo un file lungo'
  );
});

test('una richiesta senza risposta oltre soglia è persa', () => {
  assert.equal(
    isTranscriptionRequestStale({
      submittedAt: new Date('2026-08-08T11:30:00.000Z'),
      now: NOW,
      staleAfterMinutes: 20,
    }),
    true
  );
});
```

- [ ] **Step 2: Esegui e verifica che fallisca**

Run: `npx tsx --test lib/core/ai-session-notes/transcription-recovery.test.ts`
Expected: FAIL — export inesistenti.

- [ ] **Step 3: Implementa il recupero**

In `lib/core/ai-session-notes/processing.ts`:

```typescript
/**
 * Oltre questo tempo senza risposta, una richiesta è considerata persa.
 *
 * Volutamente più larga della finestra di ritentativi del provider (dieci
 * tentativi a trenta secondi, circa cinque minuti) sommata al tempo di
 * trascrizione di un file lungo: reimmettere troppo presto significherebbe
 * pagare due volte la stessa trascrizione.
 */
export const STALE_TRANSCRIPTION_REQUEST_MINUTES = 20;

export function isTranscriptionRequestStale(params: {
  submittedAt: Date;
  now: Date;
  staleAfterMinutes: number;
}): boolean {
  const elapsedMinutes =
    (params.now.getTime() - params.submittedAt.getTime()) / 60_000;
  return elapsedMinutes > params.staleAfterMinutes;
}

/**
 * Rimette in coda i job le cui richieste non hanno mai ricevuto risposta.
 *
 * Il provider non conserva le trascrizioni: l'unico recupero possibile è
 * reinviare l'audio, che è ancora nostro per la durata della retention. La
 * richiesta persa viene marcata `failed` perché il conteggio dei tentativi
 * resti onesto, e il job torna `queued`.
 */
export async function recoverStaleTranscriptionRequests(
  params: { limit: number },
  dependencies: AiSessionNotesDependencies
): Promise<number> {
  const now = dependencies.clock.now();
  const limit = Math.max(1, Math.min(params.limit, 100));
  const rows = await dependencies.db
    .select({
      id: sessionTranscriptionRequests.id,
      jobId: sessionTranscriptionRequests.processingJobId,
      submittedAt: sessionTranscriptionRequests.submittedAt,
    })
    .from(sessionTranscriptionRequests)
    .where(eq(sessionTranscriptionRequests.status, 'submitted'))
    .orderBy(asc(sessionTranscriptionRequests.id))
    .limit(limit);

  let recovered = 0;
  for (const row of rows) {
    if (
      !isTranscriptionRequestStale({
        submittedAt: row.submittedAt,
        now,
        staleAfterMinutes: STALE_TRANSCRIPTION_REQUEST_MINUTES,
      })
    ) {
      continue;
    }
    const [claimed] = await dependencies.db
      .update(sessionTranscriptionRequests)
      .set({
        status: 'failed',
        errorCode: 'CALLBACK_NOT_RECEIVED',
        updatedDate: now,
      })
      .where(
        and(
          eq(sessionTranscriptionRequests.id, row.id),
          eq(sessionTranscriptionRequests.status, 'submitted')
        )
      )
      .returning({ id: sessionTranscriptionRequests.id });
    if (!claimed) continue;

    await dependencies.db
      .update(sessionAiProcessingJobs)
      .set({ status: 'queued', availableAfter: now, updatedDate: now })
      .where(
        and(
          eq(sessionAiProcessingJobs.id, row.jobId),
          eq(sessionAiProcessingJobs.status, 'awaiting_provider')
        )
      );
    recovered += 1;
  }
  return recovered;
}
```

Aggiungi l'import di `sessionTranscriptionRequests` da `@/lib/db/schema`.

- [ ] **Step 4: Collega il recupero al worker**

In `app/api/internal/ai-notes/process/route.ts`, dentro `drainQueue`, aggiungi la chiamata prima di `recoverStaleAiProcessingJobs` e includila nel risultato:

```typescript
  const staleRequests = await recoverStaleTranscriptionRequests(
    { limit },
    dependencies
  );
```

e nel `return`, aggiungi `staleRequests` fra i campi.

Aggiungi l'import di `recoverStaleTranscriptionRequests`.

- [ ] **Step 5: Esegui i test**

Run: `npx tsx --test lib/core/ai-session-notes/transcription-recovery.test.ts`
Expected: PASS — 3 test superati.

Aggiungi il file allo script `"test"` di `package.json`.

Run: `npm test`
Expected: PASS.

Run: `npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 6: Commit**

```bash
git add lib/core/ai-session-notes/processing.ts lib/core/ai-session-notes/transcription-recovery.test.ts app/api/internal/ai-notes/process/route.ts package.json
git commit -m "feat: reimmissione delle trascrizioni senza risposta"
```

---

### Task 7: Verifica end-to-end e documentazione

**Files:**
- Modify: `scripts/verify/ai-session-notes-processing-flow.ts`
- Modify: `docs/ai-session-notes-phase-3a.md`
- Modify: `docs/legal/dpa-fornitori.md`
- Modify: `docs/legal/registro-trattamenti.md`

**Interfaces:**
- Consumes: tutto ciò che i Task 1-6 hanno prodotto.
- Produces: nulla.

- [ ] **Step 1: Estendi lo script di verifica**

In `scripts/verify/ai-session-notes-processing-flow.ts`, aggiungi uno scenario che copra la sequenza completa: due segmenti fisici per un partecipante, invio di entrambi, callback consegnata due volte per il primo segmento (deve essere idempotente), callback per il secondo, e infine job `completed` con normalizzazione accodata. Segui la struttura degli scenari già presenti nel file.

Run: `npm run test:ai-notes:processing`
Expected: PASS.

- [ ] **Step 2: Aggiorna la documentazione tecnica**

In `docs/ai-session-notes-phase-3a.md`, sostituisci la descrizione del flusso sincrono. Deve risultare esplicito:

- Il worker consegna una signed URL con TTL 900 secondi e un parametro `callback`, e non scarica mai l'audio.
- Il job attende in `awaiting_provider`, stato non claimabile.
- La callback è autenticata da un token per singola richiesta nel percorso, non dall'header `dg-token`, che è un identificatore di chiave e non un segreto.
- L'ingestione è idempotente perché il provider ritenta fino a dieci volte a trenta secondi di distanza.
- Una richiesta senza risposta da oltre venti minuti viene reinviata; il provider non conserva le trascrizioni, quindi il reinvio è l'unico recupero possibile.
- La variabile `AI_NOTES_CALLBACK_BASE_URL` deve puntare a un host raggiungibile da internet.

- [ ] **Step 3: Aggiorna la documentazione legale**

In `docs/legal/dpa-fornitori.md` e `docs/legal/registro-trattamenti.md`, aggiorna la voce Deepgram: l'audio non viene più trasmesso dal nostro server al provider, ma scaricato dal provider tramite una URL firmata a scadenza breve verso lo storage Supabase. Destinatario e categoria di dati non cambiano; cambia il percorso di trasmissione.

- [ ] **Step 4: Suite completa**

```bash
npm test
npm run test:ai-notes:testability
npm run test:ai-notes:processing
npx tsc --noEmit
npm run build
```

Tutti devono passare.

- [ ] **Step 5: Commit**

```bash
git add scripts/verify docs/
git commit -m "docs: flusso di trascrizione asincrona e aggiornamento registri"
```

---

## Verifica in produzione

Dopo il deploy, con `AI_NOTES_CALLBACK_BASE_URL` configurata:

1. Registra una sessione di prova di almeno cinque minuti e chiudila.
2. `npm run ai-notes:diagnose-transcription` — attesa: righe in `session_transcription_requests` con `status = 'submitted'`, e job in `awaiting_provider`.
3. Attendi la callback. Attesa: `status = 'received'`, job `completed`, segmenti di trascrizione presenti.
4. Ripeti con una sessione lunga (oltre un'ora). **È questa la prova che il piano esiste per superare.**

## Rischio residuo

`AI_NOTES_CALLBACK_BASE_URL` deve essere raggiungibile da internet. In sviluppo locale serve un tunnel: senza, le trascrizioni non tornano mai e si recuperano solo per reimmissione, che fallirà a sua volta. Documentato al Task 7, Step 2.
