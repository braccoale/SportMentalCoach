# Rigenerazione del Session Compass — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Il riepilogo AI riflette sempre l'intera trascrizione disponibile. Se la trascrizione si estende — ed è ciò che accade a ogni riconnessione — il Compass si rigenera invece di restare fermo alla porzione iniziale.

**Architecture:** La chiave di idempotenza del job `report_generation` viene legata al contenuto della timeline invece che alla sola sessione. Stessa timeline, nessun lavoro doppio; timeline estesa, un Compass nuovo. I report già approvati o condivisi non vengono sostituiti: la rigenerazione arriva come versione da rivedere.

**Tech Stack:** TypeScript strict, Drizzle ORM, `node:crypto` per il fingerprint, test con `node:test`.

**Spec di riferimento:** `docs/superpowers/specs/2026-08-08-pipeline-trascrizione-ai-affidabilita-design.md`, sezione 3.

**Dipendenza:** va eseguito **dopo il Piano 1**. Senza quello, l'estensione della timeline non avviene quasi mai e questo piano corregge un difetto che non si manifesta.

## Global Constraints

- TypeScript strict. Nessun `any`.
- `processing.ts` non deve importare `session-compass.ts`: quel modulo è caricato in modo pigro da `dependencies.ts` proprio per evitare un ciclo. Il fingerprint per la chiave del job va calcolato in `timeline.ts`, che `processing.ts` importa già.
- Commenti in italiano.

---

## File Structure

**Modificati:**
- `lib/core/ai-session-notes/timeline.ts` — `persistedTimelineFingerprint`.
- `lib/core/ai-session-notes/timeline.test.ts` — test del nuovo fingerprint.
- `lib/core/ai-session-notes/processing.ts` — chiave del job e query di recupero.
- `docs/ai-session-notes-phase-4b-session-compass.md` — la regola di rigenerazione.

---

### Task 1: Il fingerprint della timeline persistita

**Files:**
- Modify: `lib/core/ai-session-notes/timeline.ts`
- Modify: `lib/core/ai-session-notes/timeline.test.ts`

**Interfaces:**
- Consumes: `sessionTranscriptTimelineSegments` da `@/lib/db/schema`, `createHash` da `node:crypto`.
- Produces:
  - `export function timelineRowsFingerprint(rows: readonly { startMs: number; endMs: number; participantRole: string; normalizedText: string }[]): string` — pura.
  - `export async function persistedTimelineFingerprint(sessionId: number): Promise<string | null>` — `null` se la timeline è vuota.

**Perché un fingerprint nuovo e non `compassSourceFingerprint`:** quello include la versione dello schema del report, perché risponde alla domanda «questa bozza è ancora valida?». Qui la domanda è diversa — «la trascrizione è cambiata?» — e mescolare le due farebbe rigenerare il Compass a ogni cambio di contratto anche a trascrizione identica. Sono due concetti distinti che devono restare distinti.

- [ ] **Step 1: Scrivi il test che fallisce**

In `lib/core/ai-session-notes/timeline.test.ts`, aggiungi:

```typescript
test('lo stesso contenuto produce lo stesso fingerprint', () => {
  const rows = [
    { startMs: 0, endMs: 1000, participantRole: 'coach', normalizedText: 'Ciao' },
    { startMs: 1000, endMs: 2000, participantRole: 'athlete', normalizedText: 'Ciao' },
  ];
  assert.equal(timelineRowsFingerprint(rows), timelineRowsFingerprint(rows.slice()));
});

test('un segmento in piu cambia il fingerprint', () => {
  const base = [
    { startMs: 0, endMs: 1000, participantRole: 'coach', normalizedText: 'Ciao' },
  ];
  const esteso = [
    ...base,
    { startMs: 5000, endMs: 6000, participantRole: 'athlete', normalizedText: 'Eccomi' },
  ];
  assert.notEqual(timelineRowsFingerprint(base), timelineRowsFingerprint(esteso));
});

test('un testo diverso cambia il fingerprint', () => {
  assert.notEqual(
    timelineRowsFingerprint([
      { startMs: 0, endMs: 1, participantRole: 'coach', normalizedText: 'a' },
    ]),
    timelineRowsFingerprint([
      { startMs: 0, endMs: 1, participantRole: 'coach', normalizedText: 'b' },
    ])
  );
});

test('una timeline vuota ha comunque un fingerprint stabile', () => {
  assert.equal(timelineRowsFingerprint([]), timelineRowsFingerprint([]));
});
```

Aggiorna l'import in cima al file di test con `timelineRowsFingerprint`.

- [ ] **Step 2: Esegui e verifica che fallisca**

Run: `npx tsx --test lib/core/ai-session-notes/timeline.test.ts`
Expected: FAIL — `timelineRowsFingerprint` non esportata.

- [ ] **Step 3: Implementa**

In `lib/core/ai-session-notes/timeline.ts`, aggiungi:

```typescript
/**
 * Impronta del contenuto della timeline.
 *
 * Risponde a una domanda sola: la trascrizione è cambiata? È deliberatamente
 * indipendente dalla versione del contratto del report — quella riguarda la
 * validità di una bozza, non il contenuto — e dagli id delle righe, che
 * cambiano a ogni ricostruzione anche quando il parlato è identico. Senza
 * questa indipendenza il riepilogo si rigenererebbe a vuoto ogni volta.
 */
export function timelineRowsFingerprint(
  rows: readonly {
    startMs: number;
    endMs: number;
    participantRole: string;
    normalizedText: string;
  }[]
): string {
  const payload = rows
    .slice()
    .sort(
      (left, right) =>
        left.startMs - right.startMs ||
        left.endMs - right.endMs ||
        left.participantRole.localeCompare(right.participantRole) ||
        left.normalizedText.localeCompare(right.normalizedText)
    )
    .map((row) =>
      [row.startMs, row.endMs, row.participantRole, row.normalizedText].join('|')
    )
    .join('\n');
  return createHash('sha256').update(payload).digest('hex');
}

/** Fingerprint della timeline salvata; `null` se non ce n'è ancora una. */
export async function persistedTimelineFingerprint(
  sessionId: number
): Promise<string | null> {
  const rows = await db
    .select({
      startMs: sessionTranscriptTimelineSegments.startMs,
      endMs: sessionTranscriptTimelineSegments.endMs,
      participantRole: sessionTranscriptTimelineSegments.participantRole,
      normalizedText: sessionTranscriptTimelineSegments.normalizedText,
    })
    .from(sessionTranscriptTimelineSegments)
    .where(eq(sessionTranscriptTimelineSegments.sessionAiNotesId, sessionId));
  return rows.length ? timelineRowsFingerprint(rows) : null;
}
```

- [ ] **Step 4: Esegui e verifica che passi**

Run: `npx tsx --test lib/core/ai-session-notes/timeline.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/core/ai-session-notes/timeline.ts lib/core/ai-session-notes/timeline.test.ts
git commit -m "feat: fingerprint del contenuto della timeline"
```

---

### Task 2: La chiave del Compass segue il contenuto

**Files:**
- Modify: `lib/core/ai-session-notes/processing.ts`

**Interfaces:**
- Consumes: `persistedTimelineFingerprint` (Task 1).
- Produces: nessuna firma nuova. Cambia il comportamento di `enqueueSessionCompassIfReady` e `enqueueReadySessionCompassJobs`.

- [ ] **Step 1: Sostituisci `enqueueSessionCompassIfReady`**

```typescript
/**
 * Accoda la generazione del riepilogo, una volta per contenuto.
 *
 * La chiave era legata alla sola sessione: un riepilogo generato su una
 * trascrizione parziale non veniva mai rifatto quando arrivava il resto, e
 * il coach leggeva l'analisi di mezza seduta credendola completa. Legandola
 * al contenuto, una timeline invariata non produce lavoro e una timeline
 * estesa produce un riepilogo nuovo.
 */
export async function enqueueSessionCompassIfReady(
  sessionId: number,
  dependencies: AiSessionNotesDependencies
): Promise<boolean> {
  const fingerprint = await persistedTimelineFingerprint(sessionId);
  if (!fingerprint) return false;
  const queued = await enqueueAiProcessingJob({
    sessionId,
    jobType: 'report_generation',
    idempotencyKey: `session-compass:auto:${sessionId}:${fingerprint}`,
    availableAfter: dependencies.clock.now(),
    executor: dependencies.db,
  });
  return !queued.duplicate;
}
```

- [ ] **Step 2: Correggi la query di recupero**

`enqueueReadySessionCompassJobs` salta oggi le sessioni che hanno un job `report_generation` **qualsiasi**, il che annulla l'effetto del passo precedente. Sostituisci la query con una che cerca sessioni la cui timeline non ha ancora prodotto un riepilogo:

```typescript
export async function enqueueReadySessionCompassJobs(
  params: { limit: number },
  dependencies: AiSessionNotesDependencies
): Promise<number> {
  const limit = Math.max(1, Math.min(params.limit, 100));
  // Si selezionano le sessioni con una timeline; la decisione se accodare
  // spetta a `enqueueSessionCompassIfReady`, che confronta il fingerprint.
  // Filtrare qui sull'esistenza di un job qualsiasi reintrodurrebbe il
  // difetto: un riepilogo vecchio impedirebbe quello nuovo.
  const rows = (await dependencies.db.execute(sql`
    SELECT s.id
    FROM session_ai_notes s
    WHERE s.status IN ('processing', 'ready_for_review')
      AND EXISTS (
        SELECT 1 FROM session_transcript_timeline_segments t
        WHERE t.session_ai_notes_id = s.id
      )
    ORDER BY s.processing_started_at, s.id
    LIMIT ${limit}
  `)) as unknown as Array<{ id: number }>;
  let queued = 0;
  for (const row of rows) {
    if (await enqueueSessionCompassIfReady(row.id, dependencies)) queued += 1;
  }
  return queued;
}
```

Aggiungi l'import di `persistedTimelineFingerprint` da `./timeline`.

- [ ] **Step 3: Verifica**

Run: `npx tsc --noEmit`
Expected: nessun errore.

Run: `npm test && npm run test:ai-notes:testability`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add lib/core/ai-session-notes/processing.ts
git commit -m "fix: il riepilogo si rigenera quando la trascrizione si estende"
```

---

### Task 3: I report approvati non vengono sostituiti

**Files:**
- Modify: `lib/core/ai-session-notes/session-compass.ts`

**Interfaces:**
- Consumes: `ensureSessionCompassDraft`, `compassSourceFingerprint`, gli stati del report già definiti nel modulo.
- Produces: nessuna firma nuova.

- [ ] **Step 1: Leggi il comportamento attuale**

Apri `ensureSessionCompassDraft` (`lib/core/ai-session-notes/session-compass.ts`, dalla riga 258) e stabilisci cosa fa oggi quando esiste già un report con stato `approved` o `shared` e il fingerprint è cambiato. Annota il comportamento prima di modificarlo.

- [ ] **Step 2: Applica la regola**

Il requisito, esatto: quando la timeline cambia e il report più recente è `approved` o `shared`, la rigenerazione **non** lo sostituisce e **non** ne cambia lo stato. Produce una versione nuova, in stato di bozza da rivedere, lasciando intatta quella approvata.

Se il modulo versiona già i report (esiste `reportVersion` nel valore restituito da `ensureSessionCompassDraft`), la regola si realizza creando una versione nuova invece di aggiornare la riga esistente. Se il modulo sovrascrive, aggiungi la condizione che impedisce la sovrascrittura di un report `approved`/`shared`.

- [ ] **Step 3: Test**

Aggiungi in `lib/core/ai-session-notes/session-compass.test.ts` un test che:
1. genera un Compass e lo porta in stato `approved`;
2. cambia la timeline;
3. rigenera;
4. verifica che la versione approvata esista ancora e sia immutata, e che esista una versione nuova da rivedere.

Segui i finti store già presenti nel file.

Run: `npx tsx --test lib/core/ai-session-notes/session-compass.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add lib/core/ai-session-notes/session-compass.ts lib/core/ai-session-notes/session-compass.test.ts
git commit -m "feat: la rigenerazione non sostituisce un riepilogo approvato"
```

---

### Task 4: Documentazione

- [ ] **Step 1: Aggiorna `docs/ai-session-notes-phase-4b-session-compass.md`**

Deve risultare esplicito:
- Il riepilogo è accodato una volta per **contenuto** della timeline, non una volta per sessione.
- Una trascrizione che si estende — tipicamente dopo una riconnessione — produce un riepilogo nuovo.
- Un report `approved` o `shared` non viene mai sostituito: la rigenerazione arriva come versione da rivedere.
- Il fingerprint del contenuto (`timelineRowsFingerprint`) è distinto da `compassSourceFingerprint`, e perché.

- [ ] **Step 2: Suite completa e commit**

```bash
npm test && npm run test:ai-notes:testability && npx tsc --noEmit
git add docs/
git commit -m "docs: regola di rigenerazione del session compass"
```

---

## Nota per l'implementatore

Il Task 3 è volutamente meno prescrittivo degli altri: `session-compass.ts` è un modulo grande, e la forma esatta della correzione dipende da come versiona i report — cosa che va letta, non indovinata. Se dopo la lettura risulta che la regola richiede un cambiamento strutturale (per esempio una colonna di stato nuova), **fermati e segnalalo** invece di improvvisare: sarebbe materiale per una spec, non per questo piano.
