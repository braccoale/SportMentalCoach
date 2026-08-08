# Copertura della sessione e feedback al coach — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A sessione finita il coach capisce, in italiano chiaro e senza aprire un database, quanta parte della seduta è stata registrata, cosa manca e perché.

**Architecture:** Una funzione di dominio pura calcola la copertura confrontando la finestra della sessione con gli intervalli effettivamente registrati e trascritti. Un modulo separato traduce quella struttura in frasi. Una card nel workspace post-sessione la mostra. Nessuna delle tre parti conosce le altre due oltre l'interfaccia.

**Tech Stack:** TypeScript strict, Drizzle ORM, React Server Components, test con `node:test`.

**Spec di riferimento:** `docs/superpowers/specs/2026-08-08-pipeline-trascrizione-ai-affidabilita-design.md`, sezione 4.

**Dipendenze:** va eseguito **dopo i Piani 1 e 2**. Legge i motivi di chiusura introdotti dal Piano 1 (`closeReason`) e gli stati delle richieste introdotti dal Piano 2 (`session_transcription_requests`).

## Global Constraints

- TypeScript strict. Nessun `any`.
- `buildSessionCoverage` è **pura**: riceve dati semplici, non tocca database né rete. È la condizione che la rende testabile su casi costruiti.
- Il livello di presentazione non contiene query; il livello dati non contiene testo destinato all'utente.
- Il coach non legge mai un codice d'errore. Nessuna stringa tecnica raggiunge l'interfaccia.
- Le percentuali si arrotondano all'intero. Le durate si esprimono in `Xh YYm` o `Ym`.
- Commenti e testo in italiano.

---

## File Structure

**Creati:**
- `lib/core/ai-session-notes/session-coverage.ts` — il modello, puro.
- `lib/core/ai-session-notes/session-coverage.test.ts` — test sui casi.
- `lib/core/ai-session-notes/session-coverage-loader.ts` — la lettura dal database.
- `lib/core/ai-session-notes/session-coverage-text.ts` — la traduzione in italiano.
- `lib/core/ai-session-notes/session-coverage-text.test.ts` — test sulle frasi.
- `components/session-compass/coverage-card.tsx` — la card.

**Modificati:**
- `lib/core/ai-session-notes/archive-indicator.ts` — arricchimento dell'indicatore sintetico.
- `app/(dashboard)/dashboard/appointments/[id]/page.tsx` — innesto della card.
- `package.json` — registrazione dei test.

**Perché quattro moduli e non uno:** il modello è puro e vale la pena poterlo testare senza database; la lettura cambia quando cambia lo schema; il testo cambia quando cambia il tono del prodotto. Sono tre ritmi di cambiamento diversi, e tenerli separati evita che una modifica al testo richieda di rieseguire i test del database.

---

### Task 1: Il modello di copertura

**Files:**
- Create: `lib/core/ai-session-notes/session-coverage.ts`
- Create: `lib/core/ai-session-notes/session-coverage.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: nulla.
- Produces:

```typescript
export type CoverageCloseReason =
  | 'coach_closed' | 'room_finished' | 'closed_by_timeout' | 'unknown';

export type CoverageGapCause =
  | 'participant_left' | 'track_unpublished'
  | 'unverified_participant' | 'recording_failed' | 'unknown';

export type CoverageSegmentInput = {
  participantRole: 'coach' | 'athlete';
  startedAt: Date | null;
  endedAt: Date | null;
  status: string;
  stopReason: string | null;
  errorCode: string | null;
  transcriptionState: 'done' | 'pending' | 'failed' | 'not_requested';
};

export type SessionCoverageInput = {
  sessionStartedAt: Date | null;
  sessionEndedAt: Date | null;
  closeReason: CoverageCloseReason;
  segments: CoverageSegmentInput[];
  now: Date;
};

export type CoverageGap = {
  startMs: number;
  durationMs: number;
  cause: CoverageGapCause;
};

export type SessionCoverage = {
  state: 'completa' | 'con_interruzioni' | 'in_corso' | 'parziale' | 'fallita';
  closeReason: CoverageCloseReason;
  sessionDurationMs: number;
  recordedDurationMs: number;
  coveragePercent: number;
  gaps: CoverageGap[];
  transcription: {
    done: number; pending: number; failed: number; total: number;
  };
};

export function buildSessionCoverage(input: SessionCoverageInput): SessionCoverage;
```

- [ ] **Step 1: Scrivi i test che falliscono**

Crea `lib/core/ai-session-notes/session-coverage.test.ts`:

```typescript
import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSessionCoverage } from './session-coverage';

const INIZIO = new Date('2026-08-07T14:00:00.000Z');
const FINE = new Date('2026-08-07T16:00:00.000Z');

function segmento(
  minutoInizio: number,
  minutoFine: number,
  extra: Partial<Parameters<typeof buildSessionCoverage>[0]['segments'][number]> = {}
) {
  return {
    participantRole: 'coach' as const,
    startedAt: new Date(INIZIO.getTime() + minutoInizio * 60_000),
    endedAt: new Date(INIZIO.getTime() + minutoFine * 60_000),
    status: 'recorded',
    stopReason: null,
    errorCode: null,
    transcriptionState: 'done' as const,
    ...extra,
  };
}

test('una sessione registrata per intero è completa', () => {
  const coverage = buildSessionCoverage({
    sessionStartedAt: INIZIO,
    sessionEndedAt: FINE,
    closeReason: 'coach_closed',
    segments: [
      segmento(0, 120),
      segmento(0, 120, { participantRole: 'athlete' }),
    ],
    now: FINE,
  });

  assert.equal(coverage.state, 'completa');
  assert.equal(coverage.coveragePercent, 100);
  assert.deepEqual(coverage.gaps, []);
});

test('una disconnessione produce un buco con la sua causa', () => {
  const coverage = buildSessionCoverage({
    sessionStartedAt: INIZIO,
    sessionEndedAt: FINE,
    closeReason: 'coach_closed',
    segments: [
      segmento(0, 60, { stopReason: 'participant_left' }),
      segmento(0, 60, { participantRole: 'athlete', stopReason: 'participant_left' }),
      segmento(67, 120),
      segmento(67, 120, { participantRole: 'athlete' }),
    ],
    now: FINE,
  });

  assert.equal(coverage.state, 'con_interruzioni');
  assert.equal(coverage.gaps.length, 1);
  assert.equal(coverage.gaps[0].durationMs, 7 * 60_000);
  assert.equal(coverage.gaps[0].cause, 'participant_left');
  assert.equal(coverage.coveragePercent, 94);
});

test('se uno solo resta collegato non c e buco', () => {
  const coverage = buildSessionCoverage({
    sessionStartedAt: INIZIO,
    sessionEndedAt: FINE,
    closeReason: 'coach_closed',
    segments: [
      segmento(0, 120),
      segmento(0, 50, { participantRole: 'athlete', stopReason: 'participant_left' }),
      segmento(55, 120, { participantRole: 'athlete' }),
    ],
    now: FINE,
  });

  assert.deepEqual(
    coverage.gaps,
    [],
    'il coach copriva quei cinque minuti: la sessione è stata sentita'
  );
  assert.equal(coverage.state, 'completa');
});

test('una trascrizione ancora in corso rende lo stato in_corso', () => {
  const coverage = buildSessionCoverage({
    sessionStartedAt: INIZIO,
    sessionEndedAt: FINE,
    closeReason: 'coach_closed',
    segments: [
      segmento(0, 120),
      segmento(0, 120, { participantRole: 'athlete', transcriptionState: 'pending' }),
    ],
    now: FINE,
  });

  assert.equal(coverage.state, 'in_corso');
  assert.equal(coverage.transcription.pending, 1);
  assert.equal(coverage.transcription.done, 1);
});

test('una trascrizione fallita rende lo stato parziale', () => {
  const coverage = buildSessionCoverage({
    sessionStartedAt: INIZIO,
    sessionEndedAt: FINE,
    closeReason: 'coach_closed',
    segments: [
      segmento(0, 120),
      segmento(0, 120, { participantRole: 'athlete', transcriptionState: 'failed' }),
    ],
    now: FINE,
  });

  assert.equal(coverage.state, 'parziale');
  assert.equal(coverage.transcription.failed, 1);
});

test('senza alcuna registrazione la copertura è fallita', () => {
  const coverage = buildSessionCoverage({
    sessionStartedAt: INIZIO,
    sessionEndedAt: FINE,
    closeReason: 'closed_by_timeout',
    segments: [],
    now: FINE,
  });

  assert.equal(coverage.state, 'fallita');
  assert.equal(coverage.coveragePercent, 0);
});

test('la chiusura per timeout viene riportata', () => {
  const coverage = buildSessionCoverage({
    sessionStartedAt: INIZIO,
    sessionEndedAt: FINE,
    closeReason: 'closed_by_timeout',
    segments: [segmento(0, 120), segmento(0, 120, { participantRole: 'athlete' })],
    now: FINE,
  });

  assert.equal(coverage.closeReason, 'closed_by_timeout');
});
```

- [ ] **Step 2: Esegui e verifica che fallisca**

Run: `npx tsx --test lib/core/ai-session-notes/session-coverage.test.ts`
Expected: FAIL — modulo inesistente.

- [ ] **Step 3: Implementa**

Crea `lib/core/ai-session-notes/session-coverage.ts` con i tipi dichiarati sopra e questa logica:

1. **Finestra della sessione:** da `sessionStartedAt` a `sessionEndedAt ?? now`. Se `sessionStartedAt` è `null`, usa il primo `startedAt` fra i segmenti; se non ce n'è, la durata è 0.
2. **Intervalli coperti:** per ogni segmento con `startedAt` non nullo, l'intervallo `[startedAt, endedAt ?? now]`, espresso in millisecondi dall'inizio della sessione. **Unisci gli intervalli sovrapposti di tutti i partecipanti insieme**: un momento in cui almeno una traccia registrava è un momento coperto. Questo è ciò che rende vero il terzo test — se il coach continuava, quei minuti sono stati sentiti.
3. **Buchi:** i tratti scoperti della finestra, esclusi quelli più brevi di **5 secondi** (transizioni tecniche, non interruzioni percepibili). La causa si ricava dallo `stopReason` del segmento che termina immediatamente prima del buco, mappato così: `participant_left` → `participant_left`; `track_unpublished` → `track_unpublished`; `unverified_participant_joined` → `unverified_participant`; qualsiasi `errorCode` non nullo → `recording_failed`; altrimenti `unknown`.
4. **`coveragePercent`:** `recordedDurationMs / sessionDurationMs`, in percentuale, arrotondato all'intero; 0 se la durata della sessione è 0.
5. **Conteggi di trascrizione:** somma per `transcriptionState`, con `total` pari al numero di segmenti.
6. **Stato**, valutato in quest'ordine e con la prima condizione vera che vince:
   - `fallita` — nessun segmento, oppure `recordedDurationMs` uguale a 0;
   - `parziale` — almeno un `transcriptionState === 'failed'`;
   - `in_corso` — almeno un `transcriptionState === 'pending'`;
   - `con_interruzioni` — almeno un buco;
   - `completa` — nessuna delle precedenti.

- [ ] **Step 4: Esegui i test**

Run: `npx tsx --test lib/core/ai-session-notes/session-coverage.test.ts`
Expected: PASS — 7 test superati.

- [ ] **Step 5: Registra e committa**

Aggiungi `lib/core/ai-session-notes/session-coverage.test.ts` allo script `"test"` di `package.json`.

```bash
npm test
git add lib/core/ai-session-notes/session-coverage.ts lib/core/ai-session-notes/session-coverage.test.ts package.json
git commit -m "feat: modello di copertura della sessione"
```

---

### Task 2: La traduzione in italiano

**Files:**
- Create: `lib/core/ai-session-notes/session-coverage-text.ts`
- Create: `lib/core/ai-session-notes/session-coverage-text.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `SessionCoverage` (Task 1).
- Produces:
  - `export function formatDuration(ms: number): string` — `'2h 04m'`, `'7m'`, `'0m'`.
  - `export type CoverageMessage = { tone: 'sereno' | 'attenzione' | 'problema'; titolo: string; dettagli: string[] }`
  - `export function describeSessionCoverage(coverage: SessionCoverage): CoverageMessage`

- [ ] **Step 1: Scrivi i test**

```typescript
import assert from 'node:assert/strict';
import test from 'node:test';
import { describeSessionCoverage, formatDuration } from './session-coverage-text';

test('le durate si leggono in ore e minuti', () => {
  assert.equal(formatDuration(2 * 3_600_000 + 4 * 60_000), '2h 04m');
  assert.equal(formatDuration(7 * 60_000), '7m');
  assert.equal(formatDuration(0), '0m');
});

test('una sessione integra ha un tono sereno', () => {
  const message = describeSessionCoverage({
    state: 'completa',
    closeReason: 'coach_closed',
    sessionDurationMs: 3_600_000,
    recordedDurationMs: 3_600_000,
    coveragePercent: 100,
    gaps: [],
    transcription: { done: 2, pending: 0, failed: 0, total: 2 },
  });

  assert.equal(message.tone, 'sereno');
  assert.match(message.titolo, /registrata per intero/i);
});

test('un interruzione viene raccontata con durata e causa', () => {
  const message = describeSessionCoverage({
    state: 'con_interruzioni',
    closeReason: 'coach_closed',
    sessionDurationMs: 7_440_000,
    recordedDurationMs: 7_020_000,
    coveragePercent: 94,
    gaps: [{ startMs: 5_520_000, durationMs: 420_000, cause: 'participant_left' }],
    transcription: { done: 4, pending: 0, failed: 0, total: 4 },
  });

  assert.equal(message.tone, 'attenzione');
  assert.match(message.titolo, /94%/);
  assert.ok(message.dettagli.some((riga) => /7m/.test(riga)));
  assert.ok(message.dettagli.some((riga) => /disconnessione/i.test(riga)));
});

test('nessun messaggio contiene codici tecnici', () => {
  const message = describeSessionCoverage({
    state: 'parziale',
    closeReason: 'closed_by_timeout',
    sessionDurationMs: 3_600_000,
    recordedDurationMs: 1_800_000,
    coveragePercent: 50,
    gaps: [{ startMs: 1_800_000, durationMs: 1_800_000, cause: 'recording_failed' }],
    transcription: { done: 1, pending: 0, failed: 1, total: 2 },
  });

  const testo = [message.titolo, ...message.dettagli].join(' ');
  assert.equal(message.tone, 'problema');
  assert.doesNotMatch(testo, /EGRESS|participant_left|closed_by_timeout|_/);
});
```

- [ ] **Step 2: Esegui e verifica che fallisca**

Run: `npx tsx --test lib/core/ai-session-notes/session-coverage-text.test.ts`
Expected: FAIL — modulo inesistente.

- [ ] **Step 3: Implementa**

Crea `lib/core/ai-session-notes/session-coverage-text.ts`. Requisiti esatti:

`formatDuration`: sotto l'ora, `'{m}m'` senza zero iniziale; da un'ora in su, `'{h}h {mm}m'` con i minuti a due cifre.

`describeSessionCoverage`, per stato:

| stato | tone | titolo |
|---|---|---|
| `completa` | `sereno` | `Sessione registrata per intero` |
| `con_interruzioni` | `attenzione` | `Sessione registrata al {percent}%` |
| `in_corso` | `attenzione` | `Trascrizione in corso` |
| `parziale` | `problema` | `Trascrizione non riuscita su una parte della sessione` |
| `fallita` | `problema` | `Sessione non registrata` |

`dettagli`, aggiunti quando pertinenti:

- Durata: `{registrato} registrati su {totale} di sessione.`
- Per ogni buco: `Un'interruzione di {durata} dopo {inizio} dall'inizio, per {causa}.` — cause in parole: `participant_left` → `una disconnessione`; `track_unpublished` → `un microfono disattivato`; `unverified_participant` → `l'ingresso di un partecipante non verificato`; `recording_failed` → `una registrazione non riuscita`; `unknown` → `una causa non registrata`.
- Se `transcription.pending > 0`: `{done} parti su {total} completate. Le altre sono in elaborazione, di solito richiede pochi minuti.`
- Se `transcription.failed > 0`: `Riproviamo automaticamente; se non si risolve, il riepilogo coprirà solo il resto.`
- Se `closeReason === 'closed_by_timeout'`: `La sessione è stata chiusa automaticamente dopo il limite di sicurezza: non risulta chiusa manualmente.`
- Se `state === 'completa'`: `Il riepilogo tiene conto di tutta la sessione.`
- Se `gaps.length > 0`: `Il riepilogo si basa sulle parti registrate.`

Quest'ultima coppia è la regola della spec — il riepilogo dichiara sempre la propria base — e non è opzionale.

- [ ] **Step 4: Esegui, registra, committa**

Run: `npx tsx --test lib/core/ai-session-notes/session-coverage-text.test.ts`
Expected: PASS — 4 test superati.

Aggiungi il file allo script `"test"` di `package.json`.

```bash
npm test
git add lib/core/ai-session-notes/session-coverage-text.ts lib/core/ai-session-notes/session-coverage-text.test.ts package.json
git commit -m "feat: descrizione in italiano della copertura di sessione"
```

---

### Task 3: La lettura dal database

**Files:**
- Create: `lib/core/ai-session-notes/session-coverage-loader.ts`

**Interfaces:**
- Consumes: `buildSessionCoverage` (Task 1), `sessionAiNotes`, `sessionAudioRecordings`, `sessionTranscriptSegments`, `sessionTranscriptionRequests` (Piano 2).
- Produces: `export async function loadSessionCoverage(sessionId: number, executor?: DbOrTx): Promise<SessionCoverage | null>` — `null` se la sessione non esiste.

- [ ] **Step 1: Implementa**

Il modulo deve:

1. Leggere da `sessionAiNotes`: `startedAt`, `endedAt`, `status`, `metadata`. Il motivo di chiusura si estrae da `metadata.closeReason`; se assente o non fra i tre valori ammessi, è `'unknown'`.
2. Leggere da `sessionAudioRecordings` tutti i segmenti della sessione: `participantRole`, `startedAt`, `endedAt`, `status`, `errorCode`, `metadata.stopReason`.
3. Per ciascun segmento determinare `transcriptionState`:
   - `'done'` se esiste almeno una riga in `sessionTranscriptSegments` con quel `physicalRecordingId`;
   - altrimenti `'pending'` se esiste una richiesta `submitted` in `sessionTranscriptionRequests`;
   - altrimenti `'failed'` se esiste una richiesta `failed`;
   - altrimenti `'not_requested'`.
4. Passare tutto a `buildSessionCoverage` con `now: new Date()`.

Usa **una query per tabella**, non una per segmento: la card viene renderizzata a ogni apertura del riepilogo e non deve costare N interrogazioni.

- [ ] **Step 2: Verifica**

Run: `npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 3: Commit**

```bash
git add lib/core/ai-session-notes/session-coverage-loader.ts
git commit -m "feat: lettura della copertura di sessione dal database"
```

---

### Task 4: La card nel workspace del coach

**Files:**
- Create: `components/session-compass/coverage-card.tsx`
- Modify: `app/(dashboard)/dashboard/appointments/[id]/page.tsx`

**Interfaces:**
- Consumes: `loadSessionCoverage` (Task 3), `describeSessionCoverage` (Task 2).
- Produces: `export function CoverageCard({ message }: { message: CoverageMessage })`.

- [ ] **Step 1: Crea la card**

Componente di presentazione puro: riceve un `CoverageMessage` già pronto e non chiama nulla. Rende `titolo` come intestazione e `dettagli` come elenco. Il `tone` governa solo l'aspetto:

- `sereno` — discreto, senza icona d'allarme, non deve attirare l'occhio;
- `attenzione` — evidenziato ma non allarmante;
- `problema` — in evidenza.

Segui le classi e lo stile degli altri componenti in `components/session-compass/`. Non introdurre una libreria nuova.

- [ ] **Step 2: Innesta la card nella pagina**

In `app/(dashboard)/dashboard/appointments/[id]/page.tsx`, per il coach, chiama `loadSessionCoverage`, passa il risultato a `describeSessionCoverage` e rendi la `CoverageCard` accanto al Session Compass. Se `loadSessionCoverage` restituisce `null`, non rendere nulla.

- [ ] **Step 3: Verifica manuale**

Run: `npm run dev`

Apri il riepilogo di una sessione conclusa come coach. Attesa:
- La card compare accanto al Compass.
- Una sessione integra la mostra discreta, con «Sessione registrata per intero».
- Nessun codice tecnico è visibile.

- [ ] **Step 4: Commit**

```bash
git add components/session-compass/coverage-card.tsx "app/(dashboard)/dashboard/appointments/[id]/page.tsx"
git commit -m "feat: card di copertura nel riepilogo di sessione"
```

---

### Task 5: L'indicatore in lista e la documentazione

**Files:**
- Modify: `lib/core/ai-session-notes/archive-indicator.ts`
- Modify: `docs/ai-session-notes-phase-2a.md`

- [ ] **Step 1: Arricchisci l'indicatore**

`buildAiSessionArchiveIndicator` va **esteso, non sostituito**: aggiungi un parametro opzionale con lo stato di copertura, e quando la copertura è `con_interruzioni`, `parziale` o `fallita` fallo emergere nell'etichetta della lista. Senza quel parametro il comportamento resta identico a oggi, così i chiamanti esistenti non cambiano.

Aggiungi i test corrispondenti nel file di test già presente per questo modulo, se esiste; altrimenti creane uno e registralo in `package.json`.

- [ ] **Step 2: Documenta**

In `docs/ai-session-notes-phase-2a.md`, aggiungi la sezione sulla copertura: cosa misura, come si ricavano le cause dei buchi, e la regola per cui il riepilogo dichiara sempre la propria base.

- [ ] **Step 3: Suite completa**

```bash
npm test
npm run test:ai-notes:testability
npx tsc --noEmit
npm run build
```

Tutti devono passare.

- [ ] **Step 4: Commit**

```bash
git add lib/core/ai-session-notes/archive-indicator.ts docs/
git commit -m "feat: la copertura emerge anche nell indicatore in lista"
```

---

## Nota sulla verifica

Il valore di questo piano si vede solo su dati veri. Dopo il deploy, apri il riepilogo della prossima sessione che ha avuto una disconnessione e leggi la card come la leggerebbe il coach: se una frase richiede di sapere come funziona il sistema per essere capita, va riscritta. È il criterio, non un dettaglio di rifinitura.
