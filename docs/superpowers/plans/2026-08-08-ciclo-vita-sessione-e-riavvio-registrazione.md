# Ciclo di vita della sessione e riavvio della registrazione — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Una riconnessione — di uno o entrambi i partecipanti, una o più volte — non deve far perdere un solo minuto di sessione registrata.

**Architecture:** Si disaccoppia «il file audio è pronto» da «la sessione è finita». Oggi due percorsi distinti portano la sessione a `processing` appena il primo egress si chiude, il che disattiva per sempre il riavvio della registrazione. Dopo questo piano l'unico modo di chiudere una sessione è una nuova funzione di dominio `closeAiNotesSession`, invocata da tre soli chiamanti: l'azione esplicita del coach, `room_finished` di LiveKit, e uno spazzino di sicurezza.

**Tech Stack:** Next.js App Router, TypeScript strict, Drizzle ORM su PostgreSQL/Supabase, LiveKit server SDK, test con `node:test` + `tsx --test`.

**Spec di riferimento:** `docs/superpowers/specs/2026-08-08-pipeline-trascrizione-ai-affidabilita-design.md`, sezione 1.

## Global Constraints

- TypeScript strict. Nessun `any`, nessun cast non necessario.
- Ogni funzione di dominio accetta un `executor: DbOrTx = db` come ultimo parametro, seguendo il modello di `lib/core/ai-session-notes/recording.ts`.
- Le funzioni che toccano LiveKit ricevono `LiveKitSessionControl` per iniezione, mai istanziato dentro. Modello: `AiSessionNotesDependencies` in `lib/core/ai-session-notes/dependencies.ts`.
- I moduli sotto `lib/core/ai-session-notes/` che toccano il database iniziano con `import 'server-only';`.
- Ogni cambiamento di stato della sessione scrive un evento in `session_ai_audit_events`.
- Commenti e messaggi utente in italiano. I messaggi d'errore verso l'esterno non espongono mai dettagli interni.
- I nuovi file di test puri vanno aggiunti allo script `test` in `package.json`; quelli che usano l'iniezione di dipendenze vanno in `test:ai-notes:testability`.
- Soglia del fermo di sicurezza: variabile esistente `AI_NOTES_AUDIO_SAFETY_TIMEOUT_MINUTES` (default 180).
- Motivi di chiusura ammessi, esatti: `coach_closed`, `room_finished`, `closed_by_timeout`.

---

## File Structure

**Creati:**
- `lib/core/ai-session-notes/session-close.ts` — l'unico percorso che porta una sessione ad `processing`. Registra il motivo. Responsabilità singola.
- `lib/core/ai-session-notes/session-close.test.ts` — test puri sulla politica di chiusura.
- `app/api/ai-session-notes/[id]/close/route.ts` — endpoint dell'azione del coach.

**Modificati:**
- `lib/core/ai-session-notes/livekit-webhook.ts` — rimozione dell'avanzamento prematuro; `room_finished` chiude; `participant_left` ferma solo le tracce di chi esce.
- `lib/core/ai-session-notes/processing.ts` — rimozione del secondo avanzamento prematuro.
- `lib/core/ai-session-notes/recording.ts` — nuova `stopAiNotesRecordingsByParticipant`.
- `lib/core/ai-session-notes/maintenance.ts` — spazzino del fermo di sicurezza.
- `components/ai-session-notes-control.tsx` — azione *Termina sessione*, distinta dallo stop.
- `lib/core/ai-session-notes/livekit-dependency-injection.test.ts` — scenario di riconnessione.
- `package.json` — registrazione dei nuovi test.

**Perché un modulo nuovo e non una funzione dentro `recording.ts`:** `recording.ts` è già a 851 righe e governa le tracce, non il ciclo di vita della sessione. La chiusura è una responsabilità diversa con tre chiamanti diversi; tenerla separata rende ovvio, leggendo, che esiste un solo percorso di chiusura.

---

### Task 1: La funzione di chiusura della sessione

**Files:**
- Create: `lib/core/ai-session-notes/session-close.ts`
- Create: `lib/core/ai-session-notes/session-close.test.ts`
- Modify: `package.json` (script `test`)

**Interfaces:**
- Consumes: `advanceAiNotesSessionStatus` da `./session-status`, `stopAiNotesRecordings` da `./recording`, `LiveKitSessionControl` da `./livekit-session-control`, `db`/`DbOrTx` da `@/lib/db/drizzle`.
- Produces:
  - `export type AiNotesCloseReason = 'coach_closed' | 'room_finished' | 'closed_by_timeout'`
  - `export function isClosableSessionStatus(status: string): boolean`
  - `export async function closeAiNotesSession(params: { sessionId: number; reason: AiNotesCloseReason; actorUserId?: number | null; enforceCoach?: boolean }, liveKit: LiveKitSessionControl, executor?: DbOrTx): Promise<boolean>` — `true` se questa chiamata ha effettivamente chiuso la sessione, `false` se era già chiusa.

- [ ] **Step 1: Scrivi il test che fallisce**

Crea `lib/core/ai-session-notes/session-close.test.ts`:

```typescript
import assert from 'node:assert/strict';
import test from 'node:test';
import { isClosableSessionStatus } from './session-close';

test('una sessione attiva è chiudibile', () => {
  assert.equal(isClosableSessionStatus('active'), true);
});

test('una sessione in attesa di consenso è chiudibile', () => {
  assert.equal(isClosableSessionStatus('waiting_for_consent'), true);
});

test('una sessione già in trattamento non si richiude', () => {
  assert.equal(isClosableSessionStatus('processing'), false);
});

test('una sessione annullata non si chiude', () => {
  assert.equal(isClosableSessionStatus('cancelled'), false);
});

test('uno stato sconosciuto non è chiudibile', () => {
  assert.equal(isClosableSessionStatus('qualcosa_di_nuovo'), false);
});
```

- [ ] **Step 2: Esegui il test e verifica che fallisca**

Run: `npx tsx --test lib/core/ai-session-notes/session-close.test.ts`
Expected: FAIL — `Cannot find module './session-close'`

- [ ] **Step 3: Scrivi l'implementazione minima**

Crea `lib/core/ai-session-notes/session-close.ts`:

```typescript
import 'server-only';
import { eq, sql } from 'drizzle-orm';
import { db, type DbOrTx } from '@/lib/db/drizzle';
import { sessionAiNotes } from '@/lib/db/schema';
import { advanceAiNotesSessionStatus } from './session-status';
import { stopAiNotesRecordings } from './recording';
import { AiNotesDomainError } from './state-machine';
import type { LiveKitSessionControl } from './livekit-session-control';

/**
 * Motivo per cui una sessione ha smesso di registrare.
 *
 * Non è decorazione: è ciò che permette al coach di sapere, a sessione
 * finita, se la registrazione si è chiusa perché l'ha decisa lui o perché è
 * scattato un limite.
 */
export type AiNotesCloseReason =
  | 'coach_closed'
  | 'room_finished'
  | 'closed_by_timeout';

/**
 * Solo una sessione ancora aperta può essere chiusa.
 *
 * `processing` e gli stati successivi hanno già smesso di registrare: una
 * seconda chiusura non deve né fallire né riscrivere il motivo della prima.
 */
export function isClosableSessionStatus(status: string): boolean {
  return status === 'active' || status === 'waiting_for_consent';
}
```

- [ ] **Step 4: Esegui il test e verifica che passi**

Run: `npx tsx --test lib/core/ai-session-notes/session-close.test.ts`
Expected: PASS — 5 test superati.

- [ ] **Step 5: Aggiungi il test allo script `test` di `package.json`**

Nello script `"test"`, subito dopo `lib/core/ai-session-notes/state-machine.test.ts`, inserisci:

```
lib/core/ai-session-notes/session-close.test.ts
```

Run: `npm test`
Expected: PASS, con i 5 test nuovi inclusi.

- [ ] **Step 6: Implementa `closeAiNotesSession`**

Aggiungi in fondo a `lib/core/ai-session-notes/session-close.ts`:

```typescript
/**
 * L'unico percorso che porta una sessione a `processing`.
 *
 * Prima esistevano due avanzamenti impliciti — alla chiusura del primo
 * egress e al completamento delle trascrizioni — e nessuno dei due
 * corrispondeva alla fine della sessione. Bastava una disconnessione perché
 * la sessione risultasse conclusa mentre coach e atleta stavano ancora
 * parlando, e da lì la registrazione non ripartiva più.
 *
 * Ferma le tracce ancora aperte e poi chiude. L'ordine conta: chiudere per
 * prima cosa lascerebbe egress vivi su una sessione che nessuno sorveglia
 * più.
 */
export async function closeAiNotesSession(
  params: {
    sessionId: number;
    reason: AiNotesCloseReason;
    actorUserId?: number | null;
    enforceCoach?: boolean;
  },
  liveKit: LiveKitSessionControl,
  executor: DbOrTx = db
): Promise<boolean> {
  const [session] = await executor
    .select({
      id: sessionAiNotes.id,
      status: sessionAiNotes.status,
      requestedBy: sessionAiNotes.requestedBy,
    })
    .from(sessionAiNotes)
    .where(eq(sessionAiNotes.id, params.sessionId))
    .limit(1);
  if (!session) {
    if (params.enforceCoach) {
      throw new AiNotesDomainError('NOT_FOUND', 'Sessione AI non trovata.');
    }
    return false;
  }
  if (!isClosableSessionStatus(session.status)) return false;

  const actorUserId = params.actorUserId ?? session.requestedBy;

  await stopAiNotesRecordings(
    {
      sessionId: params.sessionId,
      actorUserId: params.actorUserId,
      reason: params.reason,
      enforceCoach: params.enforceCoach,
    },
    liveKit,
    executor
  );

  const closed = await advanceAiNotesSessionStatus({
    sessionId: params.sessionId,
    nextStatus: 'processing',
    actorUserId,
    executor,
  });
  if (!closed) return false;

  // Il motivo vive nei metadata e non in una colonna nuova: è un'etichetta
  // descrittiva, non un valore su cui interroghiamo o vincoliamo.
  //
  // Nessun evento di audit viene scritto qui: `advanceAiNotesSessionStatus`
  // ne registra già uno per la transizione. Aggiungerne un secondo
  // produrrebbe due righe per lo stesso fatto, e un registro che conta due
  // volte è peggio di uno scarno.
  await executor
    .update(sessionAiNotes)
    .set({
      metadata: sql`${sessionAiNotes.metadata} || ${JSON.stringify({
        closeReason: params.reason,
      })}::jsonb`,
      updatedDate: new Date(),
      updatedBy: actorUserId,
    })
    .where(eq(sessionAiNotes.id, params.sessionId));

  return true;
}
```

Rimuovi `sessionAiAuditEvents` dagli import di questo file se non resta usato.

- [ ] **Step 7: Verifica che il progetto compili**

Run: `npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 8: Commit**

```bash
git add lib/core/ai-session-notes/session-close.ts lib/core/ai-session-notes/session-close.test.ts package.json
git commit -m "feat: percorso unico di chiusura della sessione AI"
```

---

### Task 2: Rimuovere i due avanzamenti prematuri

Questo è il cuore della correzione. Finché esistono, la sessione si chiude da sola a metà.

**Files:**
- Modify: `lib/core/ai-session-notes/livekit-webhook.ts` (ramo `EGRESS_COMPLETE` in `handleEgressEvent`)
- Modify: `lib/core/ai-session-notes/processing.ts` (`enqueueNormalizationIfReady`)

**Interfaces:**
- Consumes: nulla di nuovo.
- Produces: nessuna firma nuova. Cambia solo il comportamento: né `handleEgressEvent` né `enqueueNormalizationIfReady` modificano più lo stato della sessione.

- [ ] **Step 1: Scrivi il test che fallisce**

In `lib/core/ai-session-notes/livekit-dependency-injection.test.ts`, aggiungi in fondo:

```typescript
test('la chiusura di un egress non chiude la sessione', async () => {
  const harness = createHarness();
  await harness.startRecording();

  await harness.deliver(
    egressEvent({
      egressId: harness.coachEgressId,
      status: EgressStatus.EGRESS_COMPLETE,
    })
  );

  const session = await harness.session();
  assert.equal(
    session.status,
    'active',
    'la sessione deve restare registrabile finché non la si chiude esplicitamente'
  );
});
```

Nota per l'implementatore: `createHarness`, `egressEvent`, `harness.startRecording()`, `harness.deliver()`, `harness.session()` e `harness.coachEgressId` sono le utilità già presenti in questo file. Se i nomi differiscono, usa quelli esistenti — non introdurne di nuovi. Leggi il file prima di scrivere il test.

- [ ] **Step 2: Esegui il test e verifica che fallisca**

Run: `npm run test:ai-notes:testability`
Expected: FAIL — la sessione risulta `processing` invece di `active`.

- [ ] **Step 3: Rimuovi l'avanzamento nel webhook**

In `lib/core/ai-session-notes/livekit-webhook.ts`, dentro `handleEgressEvent`, il blocco `if (audioRecorded) { ... }` contiene oggi una chiamata ad `advanceAiNotesSessionStatus` verso `processing`, preceduta da un commento che spiega perché la fase di registrazione sarebbe conclusa. Elimina la chiamata **e** quel commento, e sostituiscili con:

```typescript
    if (audioRecorded) {
      if (recording.participantRecordingId) {
        await enqueueAiProcessingJob({
          sessionId: recording.sessionId,
          participantRecordingId: recording.participantRecordingId,
          jobType: 'transcription',
          idempotencyKey: `transcription:${recording.participantRecordingId}:${recording.id}`,
          metadata: { physicalRecordingId: recording.id },
          executor,
        });
      }
      // La chiusura di un egress dice che *quel file* è pronto, non che la
      // sessione sia finita: dopo una disconnessione i due sono la stessa
      // cosa solo in apparenza. Chi chiude la sessione è
      // `closeAiNotesSession`, e nessun altro.
      return;
    }
```

Rimuovi poi l'import ora inutilizzato di `advanceAiNotesSessionStatus` in cima al file, se non resta usato altrove.

- [ ] **Step 4: Rimuovi l'avanzamento nel trattamento**

In `lib/core/ai-session-notes/processing.ts`, dentro `enqueueNormalizationIfReady`, elimina il blocco `await advanceAiNotesSessionStatus({ ... nextStatus: 'processing' ... })` e il commento che lo precede, sostituendoli con:

```typescript
  // Nessun avanzamento di stato qui. Con una riconnessione entrambe le
  // trascrizioni possono completarsi mentre la sessione è ancora in corso:
  // chiuderla qui la renderebbe non più registrabile a metà seduta, che è
  // esattamente il difetto che questo lavoro elimina.

  return !queued.duplicate;
```

Elimina il parametro `requestedBy` da `enqueueNormalizationIfReady` **solo se** non resta usato nel corpo della funzione; se resta usato, lascialo. Aggiorna di conseguenza il chiamante in `processAiNotesBatch`.

- [ ] **Step 5: Esegui i test e verifica che passino**

Run: `npm run test:ai-notes:testability`
Expected: PASS, incluso il test nuovo.

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Verifica la compilazione**

Run: `npx tsc --noEmit`
Expected: nessun errore. Se compare un import inutilizzato, rimuovilo.

- [ ] **Step 7: Commit**

```bash
git add lib/core/ai-session-notes/livekit-webhook.ts lib/core/ai-session-notes/processing.ts lib/core/ai-session-notes/livekit-dependency-injection.test.ts
git commit -m "fix: la chiusura di un egress non chiude piu la sessione AI"
```

---

### Task 3: Chi esce ferma solo le proprie tracce

**Files:**
- Modify: `lib/core/ai-session-notes/recording.ts`
- Modify: `lib/core/ai-session-notes/livekit-webhook.ts` (ramo `participant_left`)

**Interfaces:**
- Consumes: `isRecordingStoppable` da `./recording-policy`.
- Produces: `export async function stopAiNotesRecordingsByParticipant(params: { sessionId: number; participantIdentity: string; reason: string }, liveKit: LiveKitSessionControl, executor?: DbOrTx): Promise<void>`

- [ ] **Step 1: Scrivi il test che fallisce**

In `lib/core/ai-session-notes/livekit-dependency-injection.test.ts`, aggiungi:

```typescript
test('se esce l atleta la traccia del coach continua a registrare', async () => {
  const harness = createHarness();
  await harness.startRecording();

  await harness.deliver({
    event: 'participant_left',
    id: 'evt-athlete-left',
    createdAt: nowSeconds(),
    room: { name: ROOM_NAME },
    participant: { identity: `user-${ATHLETE_USER_ID}` },
  } as unknown as WebhookEvent);

  const recordings = await harness.recordings();
  const coach = recordings.find((row) => row.participantRole === 'coach');
  const athlete = recordings.find((row) => row.participantRole === 'athlete');

  assert.equal(athlete?.status, 'stopping', 'la traccia di chi esce si ferma');
  assert.equal(
    coach?.status,
    'recording',
    'la traccia di chi resta non deve essere toccata'
  );
});
```

Nota: usa le utilità già presenti nel file (`harness.recordings()`, `nowSeconds()` o l'equivalente esistente). Leggi il file prima di scrivere.

- [ ] **Step 2: Esegui il test e verifica che fallisca**

Run: `npm run test:ai-notes:testability`
Expected: FAIL — anche la traccia del coach risulta `stopping`.

- [ ] **Step 3: Implementa `stopAiNotesRecordingsByParticipant`**

In `lib/core/ai-session-notes/recording.ts`, subito dopo `stopAiNotesRecordingByTrack`, aggiungi:

```typescript
/**
 * Ferma le sole tracce di un partecipante.
 *
 * Alla disconnessione di uno dei due si fermava l'intera sessione: se cadeva
 * l'atleta, spariva anche la registrazione del coach, che stava parlando e
 * non si era mosso. Un partecipante che esce porta via la propria traccia e
 * nient'altro.
 */
export async function stopAiNotesRecordingsByParticipant(
  params: {
    sessionId: number;
    participantIdentity: string;
    reason: string;
  },
  liveKit: LiveKitSessionControl,
  executor: DbOrTx = db
): Promise<void> {
  const context = await sessionContext(params.sessionId, executor);
  if (!context) return;

  const rows = await executor
    .select({
      id: sessionAudioRecordings.id,
      egressId: sessionAudioRecordings.livekitEgressId,
      status: sessionAudioRecordings.status,
    })
    .from(sessionAudioRecordings)
    .where(
      and(
        eq(sessionAudioRecordings.sessionAiNotesId, params.sessionId),
        eq(
          sessionAudioRecordings.livekitParticipantIdentity,
          params.participantIdentity
        ),
        inArray(sessionAudioRecordings.status, [
          'pending',
          'starting',
          'recording',
        ])
      )
    )
    .orderBy(asc(sessionAudioRecordings.id));

  for (const row of rows) {
    if (!isRecordingStoppable(row.status)) continue;
    const [claimed] = await executor
      .update(sessionAudioRecordings)
      .set({
        status: 'stopping',
        updatedDate: new Date(),
        updatedBy: context.requestedBy,
        metadata: sql`${sessionAudioRecordings.metadata} || ${JSON.stringify({
          stopReason: params.reason.slice(0, 80),
        })}::jsonb`,
      })
      .where(
        and(
          eq(sessionAudioRecordings.id, row.id),
          inArray(sessionAudioRecordings.status, [
            'pending',
            'starting',
            'recording',
          ])
        )
      )
      .returning({ id: sessionAudioRecordings.id });
    if (!claimed) continue;
    await auditRecording(executor, {
      sessionId: params.sessionId,
      eventType: 'recording_stop_requested',
      actorUserId: context.requestedBy,
      metadata: { recordingId: row.id, reason: params.reason.slice(0, 80) },
    });
    if (!row.egressId) continue;
    try {
      await liveKit.stopEgress(row.egressId);
    } catch {
      // Lo stato finale resta di competenza del webhook e della
      // riconciliazione.
    }
  }
}
```

- [ ] **Step 4: Separa `room_finished` da `participant_left` nel webhook**

In `lib/core/ai-session-notes/livekit-webhook.ts`, sostituisci l'intero blocco `if (eventName === 'room_finished' || (eventName === 'participant_left' && ...))` con due rami distinti:

```typescript
  if (eventName === 'room_finished') {
    // La stanza non esiste più: non può rientrare nessuno, e la sessione è
    // finita davvero.
    await closeAiNotesSession(
      { sessionId: session.id, reason: 'room_finished' },
      liveKit,
      executor
    );
    return;
  }
  if (
    eventName === 'participant_left' &&
    !!event.participant?.identity &&
    [
      `user-${session.coachUserId}`,
      `user-${session.athleteUserId}`,
    ].includes(event.participant.identity)
  ) {
    // Uscire non chiude la sessione: si può rientrare, e al rientro
    // `track_published` fa ripartire la registrazione con un segmento nuovo.
    await stopAiNotesRecordingsByParticipant(
      {
        sessionId: session.id,
        participantIdentity: event.participant.identity,
        reason: 'participant_left',
      },
      liveKit,
      executor
    );
    return;
  }
```

Aggiorna gli import in cima al file: aggiungi `closeAiNotesSession` da `./session-close` e `stopAiNotesRecordingsByParticipant` a quelli già importati da `./recording`.

- [ ] **Step 5: Esegui i test e verifica che passino**

Run: `npm run test:ai-notes:testability`
Expected: PASS.

- [ ] **Step 6: Verifica la compilazione**

Run: `npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 7: Commit**

```bash
git add lib/core/ai-session-notes/recording.ts lib/core/ai-session-notes/livekit-webhook.ts lib/core/ai-session-notes/livekit-dependency-injection.test.ts
git commit -m "fix: chi esce dalla call ferma solo le proprie tracce"
```

---

### Task 4: Il riavvio dopo la riconnessione, verificato end-to-end

Nessun codice nuovo: questo task dimostra che le tre correzioni precedenti producono davvero il comportamento voluto. Se fallisce, manca qualcosa nei task 1-3.

**Files:**
- Modify: `lib/core/ai-session-notes/livekit-dependency-injection.test.ts`

**Interfaces:**
- Consumes: tutto ciò che i task 1-3 hanno prodotto.
- Produces: nessuna firma nuova.

- [ ] **Step 1: Scrivi il test della sequenza completa**

```typescript
test('dopo una disconnessione di entrambi la registrazione riparte con un secondo segmento', async () => {
  const harness = createHarness();
  await harness.startRecording();

  // Entrambi cadono: le tracce si fermano, gli egress si chiudono.
  for (const identity of [`user-${COACH_USER_ID}`, `user-${ATHLETE_USER_ID}`]) {
    await harness.deliver({
      event: 'participant_left',
      id: `evt-left-${identity}`,
      createdAt: nowSeconds(),
      room: { name: ROOM_NAME },
      participant: { identity },
    } as unknown as WebhookEvent);
  }
  await harness.completeAllEgresses();

  assert.equal(
    (await harness.session()).status,
    'active',
    'una disconnessione non chiude la sessione'
  );

  // Rientrano e ripubblicano i microfoni.
  await harness.rejoinBothParticipants();
  await harness.deliver({
    event: 'track_published',
    id: 'evt-republished',
    createdAt: nowSeconds(),
    room: { name: ROOM_NAME },
    participant: { identity: `user-${COACH_USER_ID}` },
  } as unknown as WebhookEvent);

  const recordings = await harness.recordings();
  const coachSegments = recordings
    .filter((row) => row.participantRole === 'coach')
    .map((row) => row.segmentOrder)
    .sort();
  assert.deepEqual(
    coachSegments,
    [0, 1],
    'il rientro deve produrre un secondo segmento, non sovrascrivere il primo'
  );
});
```

Nota per l'implementatore: `harness.completeAllEgresses()` e `harness.rejoinBothParticipants()` probabilmente non esistono ancora. Aggiungile alle utilità del harness in questo stesso file: la prima consegna un evento `egress_ended` con `EgressStatus.EGRESS_COMPLETE` per ogni egress attivo; la seconda rimette coach e atleta nella lista partecipanti dell'`InMemoryLiveKitSessionControl` con le rispettive tracce microfono pubblicate. Segui esattamente il modo in cui il file costruisce già i partecipanti in `startRecording`.

- [ ] **Step 2: Esegui il test**

Run: `npm run test:ai-notes:testability`
Expected: PASS. Se fallisce sul secondo segmento, la causa più probabile è che `verifyRoomForTrackEgress` non veda entrambi i partecipanti con microfono: verifica che `rejoinBothParticipants` pubblichi le tracce di entrambi.

- [ ] **Step 3: Commit**

```bash
git add lib/core/ai-session-notes/livekit-dependency-injection.test.ts
git commit -m "test: riavvio della registrazione dopo la riconnessione di entrambi"
```

---

### Task 5: L'azione «Termina sessione» del coach

**Files:**
- Create: `app/api/ai-session-notes/[id]/close/route.ts`
- Modify: `components/ai-session-notes-control.tsx`

**Interfaces:**
- Consumes: `closeAiNotesSession` (Task 1), `getRecordingStatus` da `./recording`, `getUser` da `@/lib/db/queries`, `aiNotesErrorResponse` da `./http`, `allowRecordingMutation` da `./rate-limit`, `isEmptyRecordingMutationBody` da `./recording-policy`.
- Produces: `POST /api/ai-session-notes/:id/close` → `200 { recording: RecordingStatusView }` | `401` | `429` | `400` | errori di dominio via `aiNotesErrorResponse`.

- [ ] **Step 1: Crea l'endpoint**

Crea `app/api/ai-session-notes/[id]/close/route.ts`. È volutamente gemello di `recording/stop/route.ts`, con due sole differenze: chiama `closeAiNotesSession` e usa una chiave di rate limit propria.

```typescript
import { getUser } from '@/lib/db/queries';
import { getRecordingStatus } from '@/lib/core/ai-session-notes/recording';
import { closeAiNotesSession } from '@/lib/core/ai-session-notes/session-close';
import { createProductionAiSessionNotesDependencies } from '@/lib/core/ai-session-notes/dependencies';
import { aiNotesErrorResponse } from '@/lib/core/ai-session-notes/http';
import { allowRecordingMutation } from '@/lib/core/ai-session-notes/rate-limit';
import { isEmptyRecordingMutationBody } from '@/lib/core/ai-session-notes/recording-policy';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUser();
  if (!user) {
    return Response.json({ error: 'Non autenticato.' }, { status: 401 });
  }
  if (!allowRecordingMutation(user.id, 'close')) {
    return Response.json(
      { error: 'Troppe richieste. Riprova tra un minuto.' },
      { status: 429 }
    );
  }
  const sessionId = Number((await params).id);
  if (!Number.isInteger(sessionId) || sessionId <= 0) {
    return Response.json({ error: 'Sessione non valida.' }, { status: 400 });
  }
  const raw = await request.text();
  if (!isEmptyRecordingMutationBody(raw)) {
    return Response.json(
      { error: 'La destinazione della registrazione è risolta dal server.' },
      { status: 400 }
    );
  }
  try {
    const dependencies = createProductionAiSessionNotesDependencies();
    await closeAiNotesSession(
      {
        sessionId,
        reason: 'coach_closed',
        actorUserId: user.id,
        enforceCoach: true,
      },
      dependencies.liveKit
    );
    return Response.json({
      recording: await getRecordingStatus(sessionId, user.id),
    });
  } catch (error) {
    return aiNotesErrorResponse(error);
  }
}
```

- [ ] **Step 2: Verifica che `allowRecordingMutation` accetti la chiave `'close'`**

Apri `lib/core/ai-session-notes/rate-limit.ts`. Se il secondo parametro è un'unione di stringhe letterali che non include `'close'`, aggiungilo all'unione. Se è un `string` generico, non serve alcuna modifica.

Run: `npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 3: Aggiungi l'azione nel pannello del coach**

Nel pannello **non esiste alcun comando di stop**: nel ramo
`session.status === 'active'` di `components/ai-session-notes-control.tsx` ci
sono solo *Avvia/Riprendi registrazione* e *Revoca il mio consenso*. *Fine
sessione* è quindi un comando nuovo, non la rietichettatura di uno esistente.

Poiché l'azione è irreversibile serve una conferma. Il componente non usa
alcuna libreria di dialog e vive come overlay sopra la videochiamata: una
conferma in linea a due tempi è coerente e non blocca la call come farebbe un
`window.confirm`.

Aggiungi lo stato locale accanto agli altri `useState` del componente:

```tsx
const [confirmingClose, setConfirmingClose] = useState(false);
```

Poi, dentro il ramo `session.status === 'active'`, subito **prima** del
pulsante *Revoca il mio consenso*, inserisci:

```tsx
{/* Chiudere la sessione è l'unico modo di fermare davvero la
    registrazione: la pausa la lascia riprendibile, e una disconnessione non
    la chiude più. Essendo irreversibile, chiede conferma in linea. */}
{session.viewerRole === 'coach' && (
  <div className="mt-2 mr-3 inline-block">
    {confirmingClose ? (
      <span className="text-xs text-emerald-100">
        La registrazione si chiude e non potrà essere ripresa. La
        videochiamata resta aperta.{' '}
        <button
          type="button"
          className="font-semibold text-white underline"
          disabled={loading}
          onClick={() => {
            setConfirmingClose(false);
            void mutate(`/api/ai-session-notes/${session.id}/close`);
          }}
        >
          {loading ? 'Chiusura…' : 'Conferma'}
        </button>{' '}
        <button
          type="button"
          className="text-white underline"
          disabled={loading}
          onClick={() => setConfirmingClose(false)}
        >
          Annulla
        </button>
      </span>
    ) : (
      <button
        type="button"
        className="text-xs font-medium text-white underline"
        disabled={loading}
        onClick={() => setConfirmingClose(true)}
      >
        Fine sessione
      </button>
    )}
  </div>
)}
```

Verifica che `useState` sia già importato in cima al file; se il componente
usa un import diverso da `react`, segui quello.

- [ ] **Step 4: Verifica manuale**

Run: `npm run dev`

Apri una sessione con Appunti AI attivi come coach. Attesa:
- Compare il comando *Fine sessione*, visibile solo al coach.
- Il primo clic mostra la conferma in linea, non chiude nulla.
- *Annulla* riporta il comando allo stato iniziale.
- *Conferma* chiude la registrazione; il microfono ripubblicato **non** la fa ripartire.
- La videochiamata resta attiva in entrambi i casi.
- *Riprendi registrazione* continua a funzionare finché la sessione non è chiusa.

- [ ] **Step 5: Commit**

```bash
git add app/api/ai-session-notes/\[id\]/close/route.ts components/ai-session-notes-control.tsx lib/core/ai-session-notes/rate-limit.ts
git commit -m "feat: azione termina sessione distinta dalla pausa"
```

---

### Task 6: Il fermo di sicurezza

Rete di sicurezza, non criterio primario: una sessione che il coach dimentica aperta non deve restare appesa a tempo indefinito.

**Files:**
- Modify: `lib/core/ai-session-notes/maintenance.ts`
- Modify: `app/api/internal/ai-notes/process/route.ts`
- Create: `lib/core/ai-session-notes/maintenance-safety-limit.test.ts`
- Modify: `package.json` (script `test`)

**Interfaces:**
- Consumes: `closeAiNotesSession` e `AiNotesCloseReason` (Task 1), `getAudioRecordingConfig` da `./recording-config`.
- Produces:
  - `export function isSessionPastSafetyLimit(params: { startedAt: Date | null; createdDate: Date; now: Date; safetyTimeoutMinutes: number }): boolean`
  - `export async function closeExpiredAiNotesSessions(liveKit: LiveKitSessionControl, params?: { now?: Date; limit?: number }): Promise<number>` — restituisce il numero di sessioni chiuse.

- [ ] **Step 1: Scrivi il test che fallisce**

Crea `lib/core/ai-session-notes/maintenance-safety-limit.test.ts`:

```typescript
import assert from 'node:assert/strict';
import test from 'node:test';
import { isSessionPastSafetyLimit } from './maintenance';

const NOW = new Date('2026-08-08T18:00:00.000Z');

test('una sessione iniziata da meno del limite non scade', () => {
  assert.equal(
    isSessionPastSafetyLimit({
      startedAt: new Date('2026-08-08T16:30:00.000Z'),
      createdDate: new Date('2026-08-08T16:00:00.000Z'),
      now: NOW,
      safetyTimeoutMinutes: 180,
    }),
    false
  );
});

test('una sessione di due ore e mezza non scade con il limite a 180 minuti', () => {
  assert.equal(
    isSessionPastSafetyLimit({
      startedAt: new Date('2026-08-08T15:30:00.000Z'),
      createdDate: new Date('2026-08-08T15:00:00.000Z'),
      now: NOW,
      safetyTimeoutMinutes: 180,
    }),
    false,
    'una seduta lunga ma legittima non deve essere troncata'
  );
});

test('una sessione oltre il limite scade', () => {
  assert.equal(
    isSessionPastSafetyLimit({
      startedAt: new Date('2026-08-08T14:00:00.000Z'),
      createdDate: new Date('2026-08-08T13:30:00.000Z'),
      now: NOW,
      safetyTimeoutMinutes: 180,
    }),
    true
  );
});

test('senza startedAt si usa la data di creazione', () => {
  assert.equal(
    isSessionPastSafetyLimit({
      startedAt: null,
      createdDate: new Date('2026-08-08T13:00:00.000Z'),
      now: NOW,
      safetyTimeoutMinutes: 180,
    }),
    true
  );
});
```

- [ ] **Step 2: Esegui il test e verifica che fallisca**

Run: `npx tsx --test lib/core/ai-session-notes/maintenance-safety-limit.test.ts`
Expected: FAIL — `isSessionPastSafetyLimit` non è esportata.

- [ ] **Step 3: Implementa la politica e lo spazzino**

In `lib/core/ai-session-notes/maintenance.ts`, aggiungi:

```typescript
/**
 * Se una sessione ha superato il limite oltre il quale non si chiuderà da
 * sola.
 *
 * Il riferimento è l'inizio effettivo, non la creazione della riga: fra la
 * richiesta e il primo consenso può passare del tempo, e conteggiarlo
 * accorcerebbe la seduta.
 */
export function isSessionPastSafetyLimit(params: {
  startedAt: Date | null;
  createdDate: Date;
  now: Date;
  safetyTimeoutMinutes: number;
}): boolean {
  const reference = params.startedAt ?? params.createdDate;
  const elapsedMinutes =
    (params.now.getTime() - reference.getTime()) / 60_000;
  return elapsedMinutes > params.safetyTimeoutMinutes;
}

/**
 * Chiude le sessioni rimaste aperte oltre il limite di sicurezza.
 *
 * La chiusura esplicita del coach è il criterio primario; questo esiste
 * perché un browser che si chiude o una distrazione non lascino una
 * registrazione viva per giorni. Il motivo `closed_by_timeout` viene mostrato
 * al coach: una chiusura d'ufficio non deve mai sembrare una chiusura
 * normale.
 */
export async function closeExpiredAiNotesSessions(
  liveKit: LiveKitSessionControl,
  params?: { now?: Date; limit?: number }
): Promise<number> {
  const now = params?.now ?? new Date();
  const limit = Math.max(1, Math.min(params?.limit ?? 20, 100));
  const { safetyTimeoutMinutes } = getAudioRecordingConfig();

  const candidates = await db
    .select({
      id: sessionAiNotes.id,
      startedAt: sessionAiNotes.startedAt,
      createdDate: sessionAiNotes.createdDate,
    })
    .from(sessionAiNotes)
    .where(inArray(sessionAiNotes.status, ['active', 'waiting_for_consent']))
    .orderBy(asc(sessionAiNotes.id))
    .limit(limit);

  let closed = 0;
  for (const candidate of candidates) {
    if (
      !isSessionPastSafetyLimit({
        startedAt: candidate.startedAt,
        createdDate: candidate.createdDate,
        now,
        safetyTimeoutMinutes,
      })
    ) {
      continue;
    }
    const didClose = await closeAiNotesSession(
      { sessionId: candidate.id, reason: 'closed_by_timeout' },
      liveKit
    );
    if (didClose) closed += 1;
  }
  return closed;
}
```

Aggiungi in cima al file gli import mancanti: `asc` e `inArray` da `drizzle-orm`, `sessionAiNotes` da `@/lib/db/schema`, `closeAiNotesSession` da `./session-close`, e `LiveKitSessionControl` da `./livekit-session-control` (come import di tipo).

- [ ] **Step 4: Esegui il test e verifica che passi**

Run: `npx tsx --test lib/core/ai-session-notes/maintenance-safety-limit.test.ts`
Expected: PASS — 4 test superati.

- [ ] **Step 5: Registra il test e collega lo spazzino al worker**

Nello script `"test"` di `package.json`, subito dopo `lib/core/ai-session-notes/session-close.test.ts`, aggiungi:

```
lib/core/ai-session-notes/maintenance-safety-limit.test.ts
```

In `app/api/internal/ai-notes/process/route.ts`, dentro `drainQueue`, aggiungi la chiamata come primo passo e includila nel risultato:

```typescript
async function drainQueue(workerId: string, limit: number) {
  const dependencies = createProductionAiSessionNotesDependencies();
  // Prima di trattare la coda si chiudono le sessioni dimenticate aperte:
  // finché restano `active` continuano a registrare e a produrre audio che
  // nessuno ha chiesto.
  const expiredClosed = await closeExpiredAiNotesSessions(dependencies.liveKit);
  const recovered = await recoverStaleAiProcessingJobs({ limit });
  const compassJobsQueued = await enqueueReadySessionCompassJobs(
    { limit },
    dependencies
  );
  const processed = await processAiNotesBatch({ workerId, limit }, dependencies);
  return { expiredClosed, recovered, compassJobsQueued, ...processed };
}
```

Aggiungi l'import di `closeExpiredAiNotesSessions` da `@/lib/core/ai-session-notes/maintenance`.

- [ ] **Step 6: Esegui la suite completa**

Run: `npm test`
Expected: PASS.

Run: `npm run test:ai-notes:testability`
Expected: PASS.

Run: `npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 7: Commit**

```bash
git add lib/core/ai-session-notes/maintenance.ts lib/core/ai-session-notes/maintenance-safety-limit.test.ts app/api/internal/ai-notes/process/route.ts package.json
git commit -m "feat: fermo di sicurezza per le sessioni AI rimaste aperte"
```

---

### Task 7: Documentazione

**Files:**
- Modify: `docs/ai-session-notes-phase-2a.md` — è il documento che descrive la registrazione via LiveKit Track Egress e i suoi confini, quindi è lì che il ciclo di vita cambia.

**Interfaces:**
- Consumes: nulla.
- Produces: nulla.

- [ ] **Step 1: Documenta il nuovo ciclo di vita**

Aggiungi una sezione che copra esattamente questi punti:

- La sessione resta `active` finché non viene chiusa esplicitamente. La chiusura di un egress non la chiude.
- I tre soli percorsi di chiusura e i rispettivi motivi: `coach_closed`, `room_finished`, `closed_by_timeout`. La stanza vuota non è un criterio: è indistinguibile da una disconnessione in corso di recupero.
- Una disconnessione ferma solo le tracce di chi esce; al rientro `track_published` crea un segmento nuovo.
- *Riprendi registrazione* (pausa) e *Fine sessione* (chiusura) sono azioni distinte; chiudere la sessione non chiude la videochiamata.
- Quante che siano le interruzioni, i file audio restano separati ma producono **una sola** trascrizione, una sola timeline e un solo Session Compass. Gli audio non vengono mai concatenati: l'unificazione avviene sulla trascrizione, non sui byte.

Il progetto richiede l'aggiornamento della documentazione a ogni funzionalità rilevante (`CLAUDE.md`): questo task non è opzionale.

- [ ] **Step 2: Commit**

```bash
git add docs/
git commit -m "docs: ciclo di vita della sessione AI e riavvio dopo riconnessione"
```

---

## Verifica finale del piano

Al termine di tutti i task:

```bash
npm test
npm run test:ai-notes:testability
npx tsc --noEmit
npm run build
```

Tutti devono passare.

**Verifica in produzione, dopo il deploy:** apri una sessione di prova, disconnetti un partecipante, fallo rientrare, e controlla con `npm run ai-notes:diagnose` che esistano due segmenti fisici per quel partecipante con `segment_order` 0 e 1, e che la sessione sia rimasta `active` fino alla chiusura esplicita.

## Cosa questo piano NON copre

Rimandato ai piani successivi della stessa spec:

- **Piano 2 (sezione 2):** trascrizione asincrona via callback Deepgram. Finché non è fatto, le sessioni molto lunghe continuano a fallire in trascrizione — ma d'ora in poi vengono almeno *registrate* per intero.
- **Piano 3 (sezione 3):** rigenerazione del Session Compass sul fingerprint della timeline. Finché non è fatto, un riepilogo generato su una trascrizione parziale non si aggiorna quando arrivano i segmenti mancanti.
- **Piano 4 (sezione 4):** copertura della sessione e feedback al coach.
