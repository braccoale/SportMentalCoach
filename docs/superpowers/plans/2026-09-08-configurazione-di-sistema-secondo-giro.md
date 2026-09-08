# Configurazione di sistema, secondo giro Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrare a `system_config` gli 11 candidati verificati nel secondo giro (12 chiavi in tutto), senza mai rendere asincrona una funzione oggi pura.

**Architecture:** Il meccanismo (`system_config`, `lib/core/system-config/`, pannello admin) esiste già dal primo giro e non cambia. Ogni funzione oggi pura (nessun I/O, testabile con dati fissi) riceve un nuovo parametro opzionale con un default interno pari al valore di oggi — così i test esistenti continuano a passare senza modifiche. Solo il chiamante asincrono più vicino nella catena legge `getSystemConfigNumber` e passa il valore esplicitamente, sostituendo il default per l'uso reale.

**Tech Stack:** Next.js 15 / React 19, Drizzle ORM, PostgreSQL su Supabase, `node:test` via `tsx --test`.

**Spec di riferimento:** `docs/superpowers/specs/2026-09-08-configurazione-di-sistema-design.md`, sezione "Secondo giro (2026-09-08): 11 candidati aggiuntivi".

## Global Constraints

- **Il database di sviluppo è il database di produzione.** La migrazione di questo piano è additiva (solo `INSERT`, nessuna modifica di schema) ma va comunque mostrata per intero e confermata esplicitamente prima di essere applicata.
- **Nessuna funzione oggi pura diventa asincrona.** `assessLiveCoverage`, `assessRecordingCoverage`, `validateAvailabilitySchedule`, `summarizeGoalTrack`, `isSessionLive`, `buildTodaySessions`, `buildDaySessions` restano sincrone e senza I/O. Ognuna guadagna un parametro opzionale con un default interno pari al valore di oggi — i file di test esistenti non vanno modificati per questo piano, perché nessuna chiamata di test passa il nuovo parametro e tutte continuano a usare il default.
- **`getBookableDays`** (`lib/core/availability/index.ts`) non viene toccata: accetta già `opts.stepMinutes` con un default interno alla costante — quel default resta. Solo i chiamanti esterni cambiano.
- **Ogni chiave usa `getSystemConfigNumber(chiave, fallback)`** — stesso modulo, stessa cache di 60 secondi, stesso fallback obbligatorio già usato nel primo giro.
- **Le costanti sostituite restano nel codice come default dei nuovi parametri opzionali**, tranne dove esplicitamente indicato che la costante sparisce (Task 2, 3, 4, 5 — dove non c'è una funzione pura da preservare, solo una lettura diretta dentro una funzione già asincrona).

---

### Task 1: Migrazione — seed delle 12 righe (checkpoint umano)

**Files:**
- Create: `lib/db/migrations/00NN_configurazione-di-sistema-secondo-giro.sql`

**Interfaces:**
- Consumes: tabella `system_config` (esiste già, nessuna modifica di schema).
- Produces: 12 righe in `system_config`, consumate dai Task 2-11.

- [ ] **Step 1: Generare un file di migrazione vuoto**

Non c'è modifica di schema (`schema.ts` non cambia in questo piano), quindi
`drizzle-kit generate` normale non produrrebbe nulla. Usare il flag per una
migrazione SQL scritta a mano:

Run: `npx drizzle-kit generate --custom --name=configurazione-di-sistema-secondo-giro`
Expected: un file vuoto `lib/db/migrations/00NN_configurazione-di-sistema-secondo-giro.sql`
(il numero esatto dipende da quanti file esistono già — verificarlo con
`ls lib/db/migrations/*.sql | tail -5` prima di procedere).

- [ ] **Step 2: Scrivere il contenuto del file**

```sql
-- 12 valori di business aggiuntivi (secondo giro), verificati uno per uno
-- leggendo il codice reale prima di scrivere questa migrazione — vedi
-- docs/superpowers/specs/2026-09-08-configurazione-di-sistema-design.md,
-- sezione "Secondo giro". Additiva: solo INSERT, nessuna modifica di schema.
INSERT INTO "public"."system_config" ("key", "value", "value_type", "category", "label", "description") VALUES
  ('VIDEO_RING_THROTTLE_SECONDS', '60'::jsonb, 'number', 'videochiamata', 'Blocco ripetizione chiamata (secondi)', 'Ogni quanto la stessa persona può essere richiamata per la stessa sessione.'),
  ('GUARDIAN_INVITATION_TTL_HOURS', '72'::jsonb, 'number', 'minori', 'Validità invito tutore (ore)', 'Per quanto tempo resta valido un invito a un tutore prima di scadere.'),
  ('NOTIFICATION_REMINDER_WINDOW_TOLERANCE_MINUTES', '35'::jsonb, 'number', 'notifiche', 'Tolleranza finestra promemoria (minuti)', 'Deve restare sopra i 30 minuti (metà dell''intervallo di un''ora del cron dei promemoria, vedi .github/workflows/notification-reminders.yml): sotto quella soglia una prenotazione può cadere nel buco fra due esecuzioni e non ricevere il promemoria.'),
  ('NOTIFICATION_REMINDER_24H_LEAD_MINUTES', '1440'::jsonb, 'number', 'notifiche', 'Anticipo promemoria 24 ore (minuti)', 'Quanto prima della sessione parte il promemoria "24 ore".'),
  ('NOTIFICATION_REMINDER_1H_LEAD_MINUTES', '60'::jsonb, 'number', 'notifiche', 'Anticipo promemoria 1 ora (minuti)', 'Quanto prima della sessione parte il promemoria "1 ora".'),
  ('MOBILE_SESSION_HISTORY_DAYS', '120'::jsonb, 'number', 'mobile', 'Cronologia sessioni app (giorni)', 'Quanto indietro nel tempo l''app mostra le sessioni passate.'),
  ('AI_NOTES_LIVE_GAP_SECONDS', '90'::jsonb, 'number', 'ai_notes', 'Avviso voce non registrata (secondi)', 'Da quanto una voce può mancare dalla registrazione, a seduta in corso, prima che scatti l''avviso dal vivo.'),
  ('AI_NOTES_PARTIAL_COVERAGE_THRESHOLD', '0.9'::jsonb, 'number', 'ai_notes', 'Soglia copertura registrazione', 'Sotto questa quota (fra 0 e 1) una voce è considerata parzialmente registrata nel riepilogo finale.'),
  ('AVAILABILITY_MAX_SLOTS', '50'::jsonb, 'number', 'prenotazioni', 'Fasce di disponibilità massime', 'Quante fasce settimanali un coach può configurare al massimo.'),
  ('AI_NOTES_GOAL_STALE_AFTER_SESSIONS', '2'::jsonb, 'number', 'ai_notes', 'Obiettivo fermo dopo N sedute', 'Dopo quante sedute senza essere ripreso un obiettivo del percorso mentale viene segnalato come fermo.'),
  ('LIVE_SESSION_SILENCE_MINUTES', '2'::jsonb, 'number', 'videochiamata', 'Silenzio prima di considerare finita una sessione (minuti)', 'Da quanto il battito di presenza deve tacere prima che una sessione live sia considerata non più in corso.'),
  ('AVAILABILITY_BOOKING_START_STEP_MINUTES', '10'::jsonb, 'number', 'prenotazioni', 'Passo tra gli orari prenotabili (minuti)', 'La granularità degli orari di inizio proposti nel selettore di prenotazione.');
```

- [ ] **Step 3: Mostrare il file completo e ottenere conferma**

Incollare il contenuto integrale nella conversazione. Additiva (solo
`INSERT`), ma tocca comunque il database di produzione — non c'è staging.
Non proseguire senza una risposta affermativa esplicita.

- [ ] **Step 4: Applicare la migrazione**

Solo dopo la conferma. Run: `npm run db:migrate`
Expected: log di drizzle-kit che conferma l'applicazione, nessun errore.

- [ ] **Step 5: Verificare le 12 righe**

Run: uno script `tsx` temporaneo che fa
`db.select().from(systemConfig).where(inArray(systemConfig.key, [...12 chiavi...]))`
e stampa il risultato — verificare che tutte e 12 esistano con i valori
attesi, poi cancellare lo script.
Expected: 12 righe, valori corrispondenti allo Step 2.

- [ ] **Step 6: Commit**

```bash
git add lib/db/migrations
git commit -m "$(cat <<'EOF'
feat(db): semina i 12 valori del secondo giro di configurazione

Additiva: solo INSERT, nessuna modifica di schema.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Consumer — VIDEO_RING_THROTTLE_SECONDS

**Files:**
- Modify: `lib/core/video/ring.ts`

**Interfaces:**
- Consumes: `getSystemConfigNumber` da `@/lib/core/system-config` (esiste dal primo giro).

- [ ] **Step 1: Rimuovere la costante e aggiungere l'import**

Trovare:

```ts
import 'server-only';
import { getBookingChatContext } from '@/lib/core/messages';
import { isSessionJoinable } from '@/lib/core/sessions';
import { sendPushToUser } from '@/lib/core/push';
import { resolveDisplayName } from '@/lib/core/format';
```

sostituire con:

```ts
import 'server-only';
import { getBookingChatContext } from '@/lib/core/messages';
import { isSessionJoinable } from '@/lib/core/sessions';
import { sendPushToUser } from '@/lib/core/push';
import { resolveDisplayName } from '@/lib/core/format';
import { getSystemConfigNumber } from '@/lib/core/system-config';
```

Eliminare interamente questo blocco (poco più sotto nello stesso file):

```ts
/**
 * Ogni quanto una stessa persona può essere fatta squillare per la stessa
 * sessione. Entrare e uscire dalla stanza rimonta il componente che chiama
 * questa funzione, e senza un freno la seconda persona riceverebbe una raffica
 * di notifiche per una sola chiamata.
 */
export const RING_THROTTLE_MS = 60_000;
```

- [ ] **Step 2: Aggiornare il punto d'uso**

Trovare:

```ts
  const key = `${bookingId}:${targetUserId}`;
  const previous = lastRingAt.get(key);
  if (previous !== undefined && now - previous < RING_THROTTLE_MS) {
    return 'sent';
  }
  lastRingAt.set(key, now);
```

sostituire con:

```ts
  const key = `${bookingId}:${targetUserId}`;
  const previous = lastRingAt.get(key);
  if (previous !== undefined) {
    const throttleSeconds = await getSystemConfigNumber(
      'VIDEO_RING_THROTTLE_SECONDS',
      60
    );
    if (now - previous < throttleSeconds * 1000) {
      return 'sent';
    }
  }
  lastRingAt.set(key, now);
```

- [ ] **Step 3: Verificare che compili**

Run: `npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 4: Confermare l'assenza di un file di test dedicato**

`lib/core/video/ring.test.ts` non esiste (verificato prima di scrivere
questo piano) — nessun test da eseguire per questo modulo specifico.

- [ ] **Step 5: Commit**

```bash
git add lib/core/video/ring.ts
git commit -m "$(cat <<'EOF'
feat(video): il blocco ripetizione chiamata legge da system_config

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Consumer — GUARDIAN_INVITATION_TTL_HOURS

**Files:**
- Modify: `lib/core/guardians/index.ts`

**Interfaces:**
- Consumes: `getSystemConfigNumber` da `@/lib/core/system-config`.

- [ ] **Step 1: Rimuovere la costante e aggiungere l'import**

Trovare (fra gli import in cima al file):

```ts
import { hashGuardianToken, issueGuardianToken } from './tokens';
```

sostituire con:

```ts
import { hashGuardianToken, issueGuardianToken } from './tokens';
import { getSystemConfigNumber } from '@/lib/core/system-config';
```

Trovare:

```ts
const INVITATION_TTL_MS = 72 * 60 * 60 * 1000;
const INVITATION_COOLDOWN_MS = 60 * 1000;
```

sostituire con (solo `INVITATION_TTL_MS` sparisce, `INVITATION_COOLDOWN_MS`
non è un candidato di questo giro e resta invariata):

```ts
const INVITATION_COOLDOWN_MS = 60 * 1000;
```

- [ ] **Step 2: Aggiornare il punto d'uso**

Dentro `inviteGuardian`, trovare:

```ts
  const rawToken = issueGuardianToken();
  const tokenHash = hashGuardianToken(rawToken);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + INVITATION_TTL_MS);
```

sostituire con:

```ts
  const rawToken = issueGuardianToken();
  const tokenHash = hashGuardianToken(rawToken);
  const now = new Date();
  const invitationTtlHours = await getSystemConfigNumber(
    'GUARDIAN_INVITATION_TTL_HOURS',
    72
  );
  const expiresAt = new Date(
    now.getTime() + invitationTtlHours * 60 * 60 * 1000
  );
```

- [ ] **Step 3: Verificare che compili**

Run: `npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 4: Verificare i test del modulo**

`INVITATION_TTL_MS` non è referenziata da nessun file di test (verificato
prima di scrivere questo piano — nessuno la importa per nome).

Run: `npx tsx --test lib/core/guardians/*.test.ts`
Expected: PASS, nessuna regressione.

- [ ] **Step 5: Commit**

```bash
git add lib/core/guardians/index.ts
git commit -m "$(cat <<'EOF'
feat(guardians): la validità dell'invito tutore legge da system_config

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Consumer — le 3 chiavi di `reminders.ts`

**Files:**
- Modify: `lib/core/notifications/reminders.ts`

**Interfaces:**
- Consumes: `getSystemConfigNumber` da `@/lib/core/system-config`.

> **Nota operativa**: il cron dei promemoria gira ogni ora
> (`.github/workflows/notification-reminders.yml`, `cron: '0 * * * *'`).
> `NOTIFICATION_REMINDER_WINDOW_TOLERANCE_MINUTES` deve restare sopra i 30
> minuti (metà dell'intervallo), altrimenti una prenotazione può cadere nel
> buco fra due esecuzioni — già scritto nella descrizione della riga
> seminata al Task 1, non serve altro codice per questo.

- [ ] **Step 1: Aggiungere l'import**

Trovare:

```ts
import 'server-only';
import { and, between, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  bookings,
  providerProfiles,
  services,
  users,
} from '@/lib/db/schema';
import { notify } from './index';
import { scopeForBooking } from './idempotency';
```

sostituire con:

```ts
import 'server-only';
import { and, between, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  bookings,
  providerProfiles,
  services,
  users,
} from '@/lib/db/schema';
import { notify } from './index';
import { scopeForBooking } from './idempotency';
import { getSystemConfigNumber } from '@/lib/core/system-config';
```

- [ ] **Step 2: Aggiornare `sendDueReminders`**

Trovare:

```ts
export async function sendDueReminders(
  window: ReminderWindow,
  now: Date = new Date()
): Promise<ReminderRunResult> {
  const { event, leadMinutes } = WINDOWS[window];

  const target = new Date(now.getTime() + leadMinutes * 60_000);
  const from = new Date(target.getTime() - WINDOW_TOLERANCE_MINUTES * 60_000);
  const to = new Date(target.getTime() + WINDOW_TOLERANCE_MINUTES * 60_000);
```

sostituire con:

```ts
export async function sendDueReminders(
  window: ReminderWindow,
  now: Date = new Date()
): Promise<ReminderRunResult> {
  const { event } = WINDOWS[window];
  const leadMinutes = await getSystemConfigNumber(
    window === '24h'
      ? 'NOTIFICATION_REMINDER_24H_LEAD_MINUTES'
      : 'NOTIFICATION_REMINDER_1H_LEAD_MINUTES',
    WINDOWS[window].leadMinutes
  );
  const toleranceMinutes = await getSystemConfigNumber(
    'NOTIFICATION_REMINDER_WINDOW_TOLERANCE_MINUTES',
    WINDOW_TOLERANCE_MINUTES
  );

  const target = new Date(now.getTime() + leadMinutes * 60_000);
  const from = new Date(target.getTime() - toleranceMinutes * 60_000);
  const to = new Date(target.getTime() + toleranceMinutes * 60_000);
```

`WINDOWS` e `WINDOW_TOLERANCE_MINUTES` restano nel file esattamente come
sono oggi: `WINDOWS[window].leadMinutes` e `WINDOW_TOLERANCE_MINUTES` ora
servono solo come fallback espliciti passati a `getSystemConfigNumber`, non
più come valori usati direttamente.

- [ ] **Step 3: Verificare che compili**

Run: `npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 4: Verificare i test del modulo**

Nessun file di test copre `sendDueReminders` direttamente (verificato
prima di scrivere questo piano — `lib/core/notifications/` ha solo
`appointment-content.test.ts` e `idempotency.test.ts`, che non la
chiamano). `sendDueReminders` fa query reali contro il database, quindi
non è comunque testabile in isolamento con `node --test`.

Run: `npx tsx --test lib/core/notifications/appointment-content.test.ts lib/core/notifications/idempotency.test.ts`
Expected: PASS, nessuna regressione.

- [ ] **Step 5: Commit**

```bash
git add lib/core/notifications/reminders.ts
git commit -m "$(cat <<'EOF'
feat(notifiche): tolleranza e anticipo dei promemoria leggono da system_config

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Consumer — MOBILE_SESSION_HISTORY_DAYS

**Files:**
- Modify: `app/api/mobile/sessions/route.ts`

**Interfaces:**
- Consumes: `getSystemConfigNumber` da `@/lib/core/system-config`.

- [ ] **Step 1: Aggiungere l'import**

Trovare:

```ts
import {
  FALLBACK_SESSION_DURATION_MIN,
  canJoinVideoNow,
  isSessionUpcoming,
} from '@/lib/core/sessions';
```

sostituire con:

```ts
import {
  FALLBACK_SESSION_DURATION_MIN,
  canJoinVideoNow,
  isSessionUpcoming,
} from '@/lib/core/sessions';
import { getSystemConfigNumber } from '@/lib/core/system-config';
```

- [ ] **Step 2: Aggiornare il calcolo dell'orizzonte**

Trovare:

```ts
  // Quanto passato si porta dietro l'app. Non è lo storico completo — quello
  // sta sul web con i riepiloghi — ma «le ultime settimane», che è ciò che
  // serve per ricordarsi quando si è parlato l'ultima volta.
  const horizon = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000);
```

sostituire con:

```ts
  // Quanto passato si porta dietro l'app. Non è lo storico completo — quello
  // sta sul web con i riepiloghi — ma «le ultime settimane», che è ciò che
  // serve per ricordarsi quando si è parlato l'ultima volta.
  const historyDays = await getSystemConfigNumber(
    'MOBILE_SESSION_HISTORY_DAYS',
    120
  );
  const horizon = new Date(Date.now() - historyDays * 24 * 60 * 60 * 1000);
```

- [ ] **Step 3: Verificare che compili**

Run: `npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 4: Commit**

```bash
git add "app/api/mobile/sessions/route.ts"
git commit -m "$(cat <<'EOF'
feat(mobile): la cronologia sessioni dell'app legge da system_config

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Consumer — AI_NOTES_LIVE_GAP_SECONDS

**Files:**
- Modify: `lib/core/ai-session-notes/live-coverage.ts`
- Modify: `lib/core/ai-session-notes/recording.ts`

**Interfaces:**
- Produces: `assessLiveCoverage` guadagna un campo opzionale `liveGapSeconds` nel suo oggetto di input, default = 90 (invariato per chi non lo passa).
- Consumes: `getSystemConfigNumber` da `@/lib/core/system-config`.

- [ ] **Step 1: Aggiungere il parametro opzionale in `live-coverage.ts`**

Trovare:

```ts
export function assessLiveCoverage(input: {
  sessionStatus: string;
  sessionStartedAt: Date | null;
  recordings: readonly LiveRecordingRow[];
  now: Date;
}): LiveCoverageWarning {
```

sostituire con:

```ts
export function assessLiveCoverage(input: {
  sessionStatus: string;
  sessionStartedAt: Date | null;
  recordings: readonly LiveRecordingRow[];
  now: Date;
  liveGapSeconds?: number;
}): LiveCoverageWarning {
  const liveGapSeconds = input.liveGapSeconds ?? LIVE_GAP_SECONDS;
```

Trovare:

```ts
    if (sinceSeconds >= LIVE_GAP_SECONDS) {
```

sostituire con:

```ts
    if (sinceSeconds >= liveGapSeconds) {
```

La costante `LIVE_GAP_SECONDS` (riga 30) resta esattamente com'è — è ora il
default del nuovo parametro, oltre a restare usata in `live-coverage.test.ts`.

- [ ] **Step 2: Verificare la sintassi con un typecheck parziale**

Run: `npx tsc --noEmit`
Expected: in questo momento (prima dello Step 3) può comparire un errore
in `recording.ts` se quel file passa già argomenti che ora confliggono col
nuovo campo — non previsto, ma se compare, procedere comunque allo Step 3
che lo risolve.

- [ ] **Step 3: Aggiungere l'import e il calcolo in `recording.ts`**

Trovare (fra gli import in cima al file):

```ts
import 'server-only';
import {
  assessRecordingCoverage,
  type SessionCoverage,
} from './recording-coverage';
```

sostituire con:

```ts
import 'server-only';
import {
  assessRecordingCoverage,
  type SessionCoverage,
} from './recording-coverage';
import { getSystemConfigNumber } from '@/lib/core/system-config';
```

Dentro `getRecordingStatus`, trovare:

```ts
  const live = assessLiveCoverage({
    sessionStatus: session?.status ?? '',
    sessionStartedAt: session?.startedAt ?? null,
    recordings: participants.map((row) => ({
      role: row.role,
      status: row.status,
      endedAt: row.endedAt,
    })),
    now: new Date(),
  });
```

sostituire con:

```ts
  const liveGapSeconds = await getSystemConfigNumber(
    'AI_NOTES_LIVE_GAP_SECONDS',
    90
  );
  const live = assessLiveCoverage({
    sessionStatus: session?.status ?? '',
    sessionStartedAt: session?.startedAt ?? null,
    recordings: participants.map((row) => ({
      role: row.role,
      status: row.status,
      endedAt: row.endedAt,
    })),
    now: new Date(),
    liveGapSeconds,
  });
```

- [ ] **Step 4: Verificare che compili**

Run: `npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 5: Verificare i test**

Run: `npx tsx --test lib/core/ai-session-notes/live-coverage.test.ts`
Expected: PASS, invariati (nessuna chiamata di test passa `liveGapSeconds`,
tutte continuano a usare il default 90).

- [ ] **Step 6: Commit**

```bash
git add lib/core/ai-session-notes/live-coverage.ts lib/core/ai-session-notes/recording.ts
git commit -m "$(cat <<'EOF'
feat(ai-notes): la soglia dell'avviso voce non registrata legge da system_config

assessLiveCoverage resta pura e sincrona: guadagna un campo opzionale
con default 90 (invariato), il chiamante in recording.ts passa il
valore letto da system_config.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Consumer — AI_NOTES_PARTIAL_COVERAGE_THRESHOLD

**Files:**
- Modify: `lib/core/ai-session-notes/recording-coverage.ts`
- Modify: `lib/core/ai-session-notes/recording.ts`
- Modify: `lib/core/ai-session-notes/session-outcome-email.ts`

**Interfaces:**
- Produces: `assessRecordingCoverage` guadagna un campo opzionale `partialCoverageThreshold` nel suo oggetto di input, default = 0.9.
- Consumes: `getSystemConfigNumber` da `@/lib/core/system-config`.

- [ ] **Step 1: Aggiungere il parametro opzionale in `recording-coverage.ts`**

Trovare:

```ts
export function assessRecordingCoverage(input: {
  sessionSeconds: number;
  /** Solo i segmenti riusciti: quelli falliti non hanno registrato nulla. */
  recorded: { role: 'coach' | 'athlete'; seconds: number }[];
}): SessionCoverage {
  const sessionSeconds = Math.max(0, Math.round(input.sessionSeconds));
```

sostituire con:

```ts
export function assessRecordingCoverage(input: {
  sessionSeconds: number;
  /** Solo i segmenti riusciti: quelli falliti non hanno registrato nulla. */
  recorded: { role: 'coach' | 'athlete'; seconds: number }[];
  partialCoverageThreshold?: number;
}): SessionCoverage {
  const sessionSeconds = Math.max(0, Math.round(input.sessionSeconds));
  const partialCoverageThreshold =
    input.partialCoverageThreshold ?? PARTIAL_COVERAGE_THRESHOLD;
```

Trovare:

```ts
        complete: ratio >= PARTIAL_COVERAGE_THRESHOLD,
```

sostituire con:

```ts
        complete: ratio >= partialCoverageThreshold,
```

La costante `PARTIAL_COVERAGE_THRESHOLD` (riga 25) resta com'è — è ora il
default del nuovo parametro, oltre a restare usata in
`recording-coverage.test.ts`.

- [ ] **Step 2: Aggiungere l'import e il calcolo in `recording.ts`**

(`getSystemConfigNumber` è già importato da questo file al Task 6 — non
duplicare l'import se questo task viene eseguito dopo. Se eseguito da
solo/prima, aggiungerlo come nel Task 6 Step 3.)

Dentro `getSessionRecordingCoverage`, trovare:

```ts
  return assessRecordingCoverage({
    sessionSeconds: span > 0 ? span : longest,
    recorded: rows
      .filter(
        (row) =>
          row.status === 'recorded' &&
          (row.role === 'coach' || row.role === 'athlete')
      )
      .map((row) => ({
        role: row.role as 'coach' | 'athlete',
        seconds: Number(row.seconds ?? 0),
```

sostituire con (aggiungendo la lettura prima del `return` e il nuovo campo
alla chiamata — il resto dell'oggetto passato ad `assessRecordingCoverage`
non cambia):

```ts
  const partialCoverageThreshold = await getSystemConfigNumber(
    'AI_NOTES_PARTIAL_COVERAGE_THRESHOLD',
    0.9
  );
  return assessRecordingCoverage({
    sessionSeconds: span > 0 ? span : longest,
    partialCoverageThreshold,
    recorded: rows
      .filter(
        (row) =>
          row.status === 'recorded' &&
          (row.role === 'coach' || row.role === 'athlete')
      )
      .map((row) => ({
        role: row.role as 'coach' | 'athlete',
        seconds: Number(row.seconds ?? 0),
```

- [ ] **Step 3: Aggiungere l'import e il calcolo in `session-outcome-email.ts`**

Trovare la primissima riga del file:

```ts
import 'server-only';
```

sostituire con:

```ts
import 'server-only';
import { getSystemConfigNumber } from '@/lib/core/system-config';
```

Dentro `loadSnapshot`, trovare:

```ts
  const seconds = sessionSeconds(row.startedAt, row.endedAt);
  const coverage = assessRecordingCoverage({
    sessionSeconds: seconds,
    recorded: recordings
```

sostituire con:

```ts
  const seconds = sessionSeconds(row.startedAt, row.endedAt);
  const partialCoverageThreshold = await getSystemConfigNumber(
    'AI_NOTES_PARTIAL_COVERAGE_THRESHOLD',
    0.9
  );
  const coverage = assessRecordingCoverage({
    sessionSeconds: seconds,
    partialCoverageThreshold,
    recorded: recordings
```

- [ ] **Step 4: Verificare che compili**

Run: `npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 5: Verificare i test**

Run: `npx tsx --test lib/core/ai-session-notes/recording-coverage.test.ts`
Expected: PASS, invariati.

- [ ] **Step 6: Commit**

```bash
git add lib/core/ai-session-notes/recording-coverage.ts lib/core/ai-session-notes/recording.ts lib/core/ai-session-notes/session-outcome-email.ts
git commit -m "$(cat <<'EOF'
feat(ai-notes): la soglia di copertura registrazione legge da system_config

assessRecordingCoverage resta pura e sincrona: guadagna un campo
opzionale con default 0.9 (invariato), i due chiamanti reali
(recording.ts, session-outcome-email.ts) passano il valore letto da
system_config.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Consumer — AVAILABILITY_MAX_SLOTS

**Files:**
- Modify: `lib/core/availability/validation.ts`
- Modify: `lib/core/availability/index.ts`

**Interfaces:**
- Produces: `validateAvailabilitySchedule` guadagna un secondo parametro opzionale `maxSlots`, default = 50.
- Consumes: `getSystemConfigNumber` da `@/lib/core/system-config`.

- [ ] **Step 1: Aggiungere il parametro opzionale in `validation.ts`**

Trovare:

```ts
export function validateAvailabilitySchedule(
  input: unknown
): Result<{ slots: AvailabilityInput[] }> {
  if (!Array.isArray(input)) {
    return { ok: false, error: 'Disponibilità non valida.' };
  }
  if (input.length > MAX_AVAILABILITY_SLOTS) {
    return {
      ok: false,
      error: `Puoi configurare al massimo ${MAX_AVAILABILITY_SLOTS} fasce.`,
    };
  }
```

sostituire con:

```ts
export function validateAvailabilitySchedule(
  input: unknown,
  maxSlots: number = MAX_AVAILABILITY_SLOTS
): Result<{ slots: AvailabilityInput[] }> {
  if (!Array.isArray(input)) {
    return { ok: false, error: 'Disponibilità non valida.' };
  }
  if (input.length > maxSlots) {
    return {
      ok: false,
      error: `Puoi configurare al massimo ${maxSlots} fasce.`,
    };
  }
```

La costante `MAX_AVAILABILITY_SLOTS` (riga 25) resta com'è — è ora il
default del nuovo parametro.

- [ ] **Step 2: Aggiungere l'import in `index.ts`**

Trovare:

```ts
import { DEFAULT_SERVICE_DURATION_MIN } from '@/lib/core/services/validation';
import { effectiveBookingDurationMin } from '@/lib/core/bookings/conflict-query';
```

sostituire con:

```ts
import { DEFAULT_SERVICE_DURATION_MIN } from '@/lib/core/services/validation';
import { effectiveBookingDurationMin } from '@/lib/core/bookings/conflict-query';
import { getSystemConfigNumber } from '@/lib/core/system-config';
```

- [ ] **Step 3: Aggiornare i 3 chiamanti**

In `replaceCoachAvailability`, trovare:

```ts
export async function replaceCoachAvailability(
  userId: number,
  input: unknown
): Promise<Result> {
  const providerId = await resolveProviderId(userId);
  if (!providerId) return { ok: false, error: 'Profilo coach non trovato.' };

  const validated = validateAvailabilitySchedule(input);
  if (!validated.ok) return { ok: false, error: validated.error };
```

sostituire con:

```ts
export async function replaceCoachAvailability(
  userId: number,
  input: unknown
): Promise<Result> {
  const providerId = await resolveProviderId(userId);
  if (!providerId) return { ok: false, error: 'Profilo coach non trovato.' };

  const maxSlots = await getSystemConfigNumber('AVAILABILITY_MAX_SLOTS', 50);
  const validated = validateAvailabilitySchedule(input, maxSlots);
  if (!validated.ok) return { ok: false, error: validated.error };
```

In `addAvailabilitySlot`, trovare:

```ts
export async function addAvailabilitySlot(
  userId: number,
  input: AvailabilityInput
): Promise<Result> {
  const providerId = await resolveProviderId(userId);
  if (!providerId) return { ok: false, error: 'Profilo coach non trovato.' };

  return db.transaction(async (tx) => {
    // Availability writes for the same coach are serialized so simultaneous
    // requests cannot both pass the overlap check and then insert.
    await tx.execute(sql`select pg_advisory_xact_lock(${providerId})`);

    const current = await tx
      .select({
        weekday: coachAvailability.weekday,
        startMinute: coachAvailability.startMinute,
        endMinute: coachAvailability.endMinute,
      })
      .from(coachAvailability)
      .where(eq(coachAvailability.providerId, providerId));
    const validated = validateAvailabilitySchedule([...current, input]);
    if (!validated.ok) return { ok: false, error: validated.error };
```

sostituire con:

```ts
export async function addAvailabilitySlot(
  userId: number,
  input: AvailabilityInput
): Promise<Result> {
  const providerId = await resolveProviderId(userId);
  if (!providerId) return { ok: false, error: 'Profilo coach non trovato.' };

  const maxSlots = await getSystemConfigNumber('AVAILABILITY_MAX_SLOTS', 50);

  return db.transaction(async (tx) => {
    // Availability writes for the same coach are serialized so simultaneous
    // requests cannot both pass the overlap check and then insert.
    await tx.execute(sql`select pg_advisory_xact_lock(${providerId})`);

    const current = await tx
      .select({
        weekday: coachAvailability.weekday,
        startMinute: coachAvailability.startMinute,
        endMinute: coachAvailability.endMinute,
      })
      .from(coachAvailability)
      .where(eq(coachAvailability.providerId, providerId));
    const validated = validateAvailabilitySchedule([...current, input], maxSlots);
    if (!validated.ok) return { ok: false, error: validated.error };
```

In `updateAvailabilitySlot`, trovare:

```ts
export async function updateAvailabilitySlot(
  userId: number,
  slotId: number,
  input: AvailabilityInput
): Promise<Result> {
  const providerId = await resolveProviderId(userId);
  if (!providerId) return { ok: false, error: 'Profilo coach non trovato.' };

  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${providerId})`);
```

sostituire con:

```ts
export async function updateAvailabilitySlot(
  userId: number,
  slotId: number,
  input: AvailabilityInput
): Promise<Result> {
  const providerId = await resolveProviderId(userId);
  if (!providerId) return { ok: false, error: 'Profilo coach non trovato.' };

  const maxSlots = await getSystemConfigNumber('AVAILABILITY_MAX_SLOTS', 50);

  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${providerId})`);
```

e più sotto nella stessa funzione, trovare:

```ts
    const validated = validateAvailabilitySchedule([...otherSlots, input]);
    if (!validated.ok) return { ok: false, error: validated.error };
```

sostituire con:

```ts
    const validated = validateAvailabilitySchedule([...otherSlots, input], maxSlots);
    if (!validated.ok) return { ok: false, error: validated.error };
```

- [ ] **Step 4: Verificare che compili**

Run: `npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 5: Verificare i test**

Run: `npx tsx --test lib/core/availability/validation.test.ts`
Expected: PASS, invariati (nessuna chiamata di test passa `maxSlots`, tutte
continuano a usare il default 50).

- [ ] **Step 6: Commit**

```bash
git add lib/core/availability/validation.ts lib/core/availability/index.ts
git commit -m "$(cat <<'EOF'
feat(disponibilità): il numero massimo di fasce legge da system_config

validateAvailabilitySchedule resta pura e sincrona: guadagna un
parametro opzionale con default 50 (invariato), i 3 chiamanti reali
in lib/core/availability/index.ts passano il valore letto da
system_config.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Consumer — AI_NOTES_GOAL_STALE_AFTER_SESSIONS

**Files:**
- Modify: `lib/core/ai-session-notes/journey-goals.ts`
- Modify: `components/session-compass/journey-goals.tsx`

**Interfaces:**
- Produces: `summarizeGoalTrack` guadagna un secondo parametro opzionale `staleAfterSessions`, default = 2.
- Consumes: `getSystemConfigNumber` da `@/lib/core/system-config`.

- [ ] **Step 1: Aggiungere il parametro opzionale in `journey-goals.ts`**

Trovare:

```ts
export function summarizeGoalTrack(row: JourneyGoalRow): GoalTrackSummary {
  const totalCount = row.track.length;
```

sostituire con:

```ts
export function summarizeGoalTrack(
  row: JourneyGoalRow,
  staleAfterSessions: number = GOAL_STALE_AFTER_SESSIONS
): GoalTrackSummary {
  const totalCount = row.track.length;
```

Trovare:

```ts
    stale:
      totalCount > 0 &&
      (sessionsSinceLastTouch === null ||
        sessionsSinceLastTouch >= GOAL_STALE_AFTER_SESSIONS),
```

sostituire con:

```ts
    stale:
      totalCount > 0 &&
      (sessionsSinceLastTouch === null ||
        sessionsSinceLastTouch >= staleAfterSessions),
```

La costante `GOAL_STALE_AFTER_SESSIONS` (riga 204) resta com'è — è ora il
default del nuovo parametro.

- [ ] **Step 2: Aggiungere l'import e rendere async `JourneyGoalsPanel`**

Trovare (fra gli import in cima al file):

```ts
import {
  JOURNEY_GOAL_STATUSES,
  JOURNEY_GOAL_STATUS_LABELS,
  summarizeGoalTrack,
  type GoalTrackSummary,
  type JourneyGoalRow,
  type JourneyGoalSession,
  type JourneyGoalStatus,
} from '@/lib/core/ai-session-notes/journey-goals';
```

sostituire con:

```ts
import {
  JOURNEY_GOAL_STATUSES,
  JOURNEY_GOAL_STATUS_LABELS,
  summarizeGoalTrack,
  type GoalTrackSummary,
  type JourneyGoalRow,
  type JourneyGoalSession,
  type JourneyGoalStatus,
} from '@/lib/core/ai-session-notes/journey-goals';
import { getSystemConfigNumber } from '@/lib/core/system-config';
```

- [ ] **Step 3: Rendere `JourneyGoalsPanel` async e passare il valore in giù**

Trovare:

```ts
export function JourneyGoalsPanel({
  rows,
  athleteUserId,
  sessions,
  addGoalAction,
  setStatusAction,
  now = new Date(),
}: {
  rows: readonly JourneyGoalRow[];
  athleteUserId: number;
  /**
   * Le sedute su cui si puo' spuntare scrivendo un obiettivo nuovo. Arrivano
   * dall'esterno e non da `rows[0].track` perche' servono anche quando gli
   * obiettivi sono zero: e' proprio allora che il coach scrive il primo.
   */
  sessions: readonly JourneyGoalSession[];
  addGoalAction: (formData: FormData) => Promise<void>;
  setStatusAction: (formData: FormData) => Promise<void>;
  now?: Date;
}) {
  const axis = sessions;
```

sostituire con:

```ts
export async function JourneyGoalsPanel({
  rows,
  athleteUserId,
  sessions,
  addGoalAction,
  setStatusAction,
  now = new Date(),
}: {
  rows: readonly JourneyGoalRow[];
  athleteUserId: number;
  /**
   * Le sedute su cui si puo' spuntare scrivendo un obiettivo nuovo. Arrivano
   * dall'esterno e non da `rows[0].track` perche' servono anche quando gli
   * obiettivi sono zero: e' proprio allora che il coach scrive il primo.
   */
  sessions: readonly JourneyGoalSession[];
  addGoalAction: (formData: FormData) => Promise<void>;
  setStatusAction: (formData: FormData) => Promise<void>;
  now?: Date;
}) {
  const axis = sessions;
  const staleAfterSessions = await getSystemConfigNumber(
    'AI_NOTES_GOAL_STALE_AFTER_SESSIONS',
    2
  );
```

Trovare (dentro lo stesso componente, dove mappa `rows` su `GoalRow`):

```ts
        <ul className="mt-4 flex-1 divide-y divide-gray-100">
          {rows.map((row, index) => (
            <GoalRow
              key={row.id}
              row={row}
              index={index}
              athleteUserId={athleteUserId}
              setStatusAction={setStatusAction}
            />
          ))}
        </ul>
```

sostituire con:

```ts
        <ul className="mt-4 flex-1 divide-y divide-gray-100">
          {rows.map((row, index) => (
            <GoalRow
              key={row.id}
              row={row}
              index={index}
              athleteUserId={athleteUserId}
              setStatusAction={setStatusAction}
              staleAfterSessions={staleAfterSessions}
            />
          ))}
        </ul>
```

- [ ] **Step 4: Aggiornare `GoalRow` per accettare e usare il nuovo prop**

Trovare:

```ts
function GoalRow({
  row,
  index,
  athleteUserId,
  setStatusAction,
}: {
  row: JourneyGoalRow;
  index: number;
  athleteUserId: number;
  setStatusAction: (formData: FormData) => Promise<void>;
}) {
  const tint = TRACK_TINTS[index % TRACK_TINTS.length];
  const Icon = GOAL_ICONS[index % GOAL_ICONS.length];
  const summary = summarizeGoalTrack(row);
```

sostituire con:

```ts
function GoalRow({
  row,
  index,
  athleteUserId,
  setStatusAction,
  staleAfterSessions,
}: {
  row: JourneyGoalRow;
  index: number;
  athleteUserId: number;
  setStatusAction: (formData: FormData) => Promise<void>;
  staleAfterSessions: number;
}) {
  const tint = TRACK_TINTS[index % TRACK_TINTS.length];
  const Icon = GOAL_ICONS[index % GOAL_ICONS.length];
  const summary = summarizeGoalTrack(row, staleAfterSessions);
```

- [ ] **Step 5: Verificare che compili**

Run: `npx tsc --noEmit`
Expected: nessun errore. `JourneyGoalsPanel` è ora `async function`, ma è
usata come JSX diretto (`<JourneyGoalsPanel ... />`) dal suo unico
chiamante (`app/(dashboard)/dashboard/coach/athletes/[athleteId]/page.tsx`)
— Next.js risolve un Server Component asincrono senza bisogno di `await` al
punto di rendering, quindi nessun'altra modifica serve lì.

- [ ] **Step 6: Verificare i test**

Run: `npx tsx --test lib/core/ai-session-notes/journey-goals.test.ts`
Expected: PASS, invariati (nessuna chiamata di test passa
`staleAfterSessions`, tutte continuano a usare il default 2).

- [ ] **Step 7: Verificare con una build**

Run: `npx next build` (o `NEXT_SKIP_BUILD_TYPECHECK=1 npx next build` se
serve per l'errore preesistente scollegato in `components/push-setup.tsx`)
Expected: completa senza errori sulla rotta che mostra
`JourneyGoalsPanel`.

- [ ] **Step 8: Commit**

```bash
git add lib/core/ai-session-notes/journey-goals.ts components/session-compass/journey-goals.tsx
git commit -m "$(cat <<'EOF'
feat(ai-notes): quando un obiettivo è "fermo" legge da system_config

summarizeGoalTrack resta pura e sincrona: guadagna un parametro
opzionale con default 2 (invariato). JourneyGoalsPanel diventa un
Server Component asincrono (l'unico chiamante lo rende già come JSX
diretto, nessun'altra modifica serve), legge il valore una sola volta
e lo passa in giù fino a dove GoalRow chiama summarizeGoalTrack.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: Consumer — LIVE_SESSION_SILENCE_MINUTES

**Files:**
- Modify: `lib/core/admin/live-session-state.ts`
- Modify: `lib/core/admin/live-sessions.ts`
- Modify: `lib/core/admin/today-sessions.ts`
- Modify: `lib/core/admin/agenda.ts`
- Modify: `lib/core/admin/index.ts`

**Interfaces:**
- Produces: `isSessionLive` guadagna un terzo parametro opzionale `silenceMs`, default = 120000 (`2 * 60_000`). `buildTodaySessions`/`buildDaySessions` guadagnano un quarto parametro opzionale `liveSilenceMs`, passato a `isSessionLive`.
- Consumes: `getSystemConfigNumber` da `@/lib/core/system-config`.

- [ ] **Step 1: Aggiungere il parametro opzionale in `live-session-state.ts`**

Trovare:

```ts
export function isSessionLive(
  lastHeartbeatAt: Date | null,
  now: Date = new Date()
): boolean {
  if (!lastHeartbeatAt) return false;
  const silence = now.getTime() - lastHeartbeatAt.getTime();
  // Un battito dal futuro è un orologio sballato, non una sessione viva.
  return silence >= 0 && silence <= LIVE_SESSION_SILENCE_MS;
}
```

sostituire con:

```ts
export function isSessionLive(
  lastHeartbeatAt: Date | null,
  now: Date = new Date(),
  silenceMs: number = LIVE_SESSION_SILENCE_MS
): boolean {
  if (!lastHeartbeatAt) return false;
  const silence = now.getTime() - lastHeartbeatAt.getTime();
  // Un battito dal futuro è un orologio sballato, non una sessione viva.
  return silence >= 0 && silence <= silenceMs;
}
```

La costante `LIVE_SESSION_SILENCE_MS` (riga 26) resta com'è — è ora il
default del nuovo parametro.

- [ ] **Step 2: Aggiornare `live-sessions.ts` (lettura diretta, non passa da `isSessionLive`)**

Trovare:

```ts
import 'server-only';
import { and, eq, gt, inArray, isNotNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { bookings, providerProfiles, users } from '@/lib/db/schema';
import {
  LIVE_SESSION_SILENCE_MS,
  isSessionLive,
} from './live-session-state';
```

sostituire con:

```ts
import 'server-only';
import { and, eq, gt, inArray, isNotNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { bookings, providerProfiles, users } from '@/lib/db/schema';
import {
  LIVE_SESSION_SILENCE_MS,
  isSessionLive,
} from './live-session-state';
import { getSystemConfigNumber } from '@/lib/core/system-config';
```

Trovare:

```ts
export async function getLiveCoachProviderIds(
  now: Date = new Date()
): Promise<Set<number>> {
  const threshold = new Date(now.getTime() - LIVE_SESSION_SILENCE_MS);
```

sostituire con:

```ts
export async function getLiveCoachProviderIds(
  now: Date = new Date()
): Promise<Set<number>> {
  const silenceMinutes = await getSystemConfigNumber(
    'LIVE_SESSION_SILENCE_MINUTES',
    2
  );
  const threshold = new Date(now.getTime() - silenceMinutes * 60_000);
```

`LIVE_SESSION_SILENCE_MS` resta importata (serve ancora al re-export
`export { LIVE_SESSION_SILENCE_MS, isSessionLive };` poco sotto, invariato).

- [ ] **Step 3: Aggiungere il parametro opzionale in `today-sessions.ts`**

Trovare:

```ts
export function buildTodaySessions(
  rows: readonly AdminBookingRow[],
  now: Date = new Date()
): AdminTodaySession[] {
  return buildDaySessions(rows, formatRomeDateValue(now), now);
}
```

sostituire con:

```ts
export function buildTodaySessions(
  rows: readonly AdminBookingRow[],
  now: Date = new Date(),
  liveSilenceMs?: number
): AdminTodaySession[] {
  return buildDaySessions(rows, formatRomeDateValue(now), now, liveSilenceMs);
}
```

Trovare:

```ts
export function buildDaySessions(
  rows: readonly AdminBookingRow[],
  day: string,
  now: Date = new Date()
): AdminTodaySession[] {
  return rows
    .filter(
      (row) =>
        row.scheduledFor != null &&
        TODAY_STATUSES.includes(row.status) &&
        formatRomeDateValue(row.scheduledFor) === day
    )
    .sort((a, b) => a.scheduledFor!.getTime() - b.scheduledFor!.getTime())
    .map((row) => ({
      bookingId: row.id,
      scheduledFor: row.scheduledFor!,
      durationMin: row.durationMin,
      coachProviderId: row.providerId,
      coachName: row.coachName,
      athleteUserId: row.clientId,
      athleteName: athleteDisplayName(row),
      serviceTitle: row.serviceTitle,
      status: row.status,
      isLive: isSessionLive(row.sessionEndedAt, now),
    }));
}
```

sostituire con:

```ts
export function buildDaySessions(
  rows: readonly AdminBookingRow[],
  day: string,
  now: Date = new Date(),
  liveSilenceMs?: number
): AdminTodaySession[] {
  return rows
    .filter(
      (row) =>
        row.scheduledFor != null &&
        TODAY_STATUSES.includes(row.status) &&
        formatRomeDateValue(row.scheduledFor) === day
    )
    .sort((a, b) => a.scheduledFor!.getTime() - b.scheduledFor!.getTime())
    .map((row) => ({
      bookingId: row.id,
      scheduledFor: row.scheduledFor!,
      durationMin: row.durationMin,
      coachProviderId: row.providerId,
      coachName: row.coachName,
      athleteUserId: row.clientId,
      athleteName: athleteDisplayName(row),
      serviceTitle: row.serviceTitle,
      status: row.status,
      isLive: isSessionLive(row.sessionEndedAt, now, liveSilenceMs),
    }));
}
```

`isSessionLive` ignora `liveSilenceMs` quando è `undefined` — usa il
proprio default interno, esattamente come oggi.

- [ ] **Step 4: Aggiornare `agenda.ts`**

Trovare (fra gli import in cima al file):

```ts
import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { formatRomeDateValue } from '@/lib/core/format';
import { ageFromBirthDate, requiresGuardian } from '@/lib/core/guardians';
import { buildDaySessions, type AdminTodaySession } from './today-sessions';
```

sostituire con:

```ts
import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { formatRomeDateValue } from '@/lib/core/format';
import { ageFromBirthDate, requiresGuardian } from '@/lib/core/guardians';
import { buildDaySessions, type AdminTodaySession } from './today-sessions';
import { getSystemConfigNumber } from '@/lib/core/system-config';
```

Dentro `getAdminDaySessions`, trovare:

```ts
  return buildDaySessions(bookingRows, day, now);
}
```

sostituire con:

```ts
  const silenceMinutes = await getSystemConfigNumber(
    'LIVE_SESSION_SILENCE_MINUTES',
    2
  );
  return buildDaySessions(bookingRows, day, now, silenceMinutes * 60_000);
}
```

- [ ] **Step 5: Aggiornare `admin/index.ts`**

Trovare (fra gli import in cima al file, dopo gli altri import da
`@/lib/db/schema`):

```ts
import { buildTodaySessions, type AdminTodaySession } from './today-sessions';
```

sostituire con:

```ts
import { buildTodaySessions, type AdminTodaySession } from './today-sessions';
import { getSystemConfigNumber } from '@/lib/core/system-config';
```

Trovare:

```ts
export async function getAdminBookingsOverview(now: Date = new Date()): Promise<{
  rosters: Map<number, CoachRoster>;
  todaySessions: AdminTodaySession[];
}> {
  const rows = await getAdminBookingRows();
  return {
    rosters: buildCoachRosters(rows, now),
    todaySessions: buildTodaySessions(rows, now),
  };
}
```

sostituire con:

```ts
export async function getAdminBookingsOverview(now: Date = new Date()): Promise<{
  rosters: Map<number, CoachRoster>;
  todaySessions: AdminTodaySession[];
}> {
  const rows = await getAdminBookingRows();
  const silenceMinutes = await getSystemConfigNumber(
    'LIVE_SESSION_SILENCE_MINUTES',
    2
  );
  return {
    rosters: buildCoachRosters(rows, now),
    todaySessions: buildTodaySessions(rows, now, silenceMinutes * 60_000),
  };
}
```

- [ ] **Step 6: Verificare che compili**

Run: `npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 7: Verificare i test**

`lib/core/admin/live-session-state.test.ts` non esiste (verificato prima
di scrivere questo piano) — nessun test dedicato a `isSessionLive` da solo.

Run: `npx tsx --test lib/core/admin/today-sessions.test.ts`
Expected: PASS, invariati (nessuna chiamata di test passa
`liveSilenceMs`, tutte continuano a usare il default interno di
`isSessionLive`).

- [ ] **Step 8: Commit**

```bash
git add lib/core/admin/live-session-state.ts lib/core/admin/live-sessions.ts lib/core/admin/today-sessions.ts lib/core/admin/agenda.ts lib/core/admin/index.ts
git commit -m "$(cat <<'EOF'
feat(admin): la soglia di silenzio per una sessione "live" legge da system_config

isSessionLive, buildTodaySessions, buildDaySessions restano pure e
sincrone: guadagnano un parametro opzionale con default invariato. I
chiamanti asincroni (live-sessions.ts, agenda.ts, admin/index.ts)
passano il valore letto da system_config.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: Consumer — AVAILABILITY_BOOKING_START_STEP_MINUTES

**Files:**
- Modify: `app/api/mobile/new-appointment/route.ts`
- Modify: `app/(marketplace)/coaches/[slug]/page.tsx`
- Modify: `app/(dashboard)/dashboard/coach/page.tsx`
- Modify: `app/(dashboard)/dashboard/appointments/[id]/page.tsx`
- Modify: `lib/core/bookings/index.ts`

**Interfaces:**
- Consumes: `getSystemConfigNumber` da `@/lib/core/system-config`. `getBookableDays(slots, opts)` (già esistente, non modificata — accetta già `opts.stepMinutes`).

> **`lib/core/availability/index.ts` non viene toccato.** `getBookableDays`
> ha già `const step = opts.stepMinutes ?? BOOKING_START_STEP_MINUTES;` —
> quel default resta il fallback corretto per chi non passa nulla. Questo
> task aggiunge solo `stepMinutes` esplicito ai 7 punti di chiamata esterni.

- [ ] **Step 1: `app/api/mobile/new-appointment/route.ts`**

Trovare:

```ts
import {
  getBookableDays,
  getCoachAvailability,
  getCoachBusyIntervalsByProviderIds,
  parseRomeLocalDateTime,
} from '@/lib/core/availability';
```

sostituire con:

```ts
import {
  getBookableDays,
  getCoachAvailability,
  getCoachBusyIntervalsByProviderIds,
  parseRomeLocalDateTime,
} from '@/lib/core/availability';
import { getSystemConfigNumber } from '@/lib/core/system-config';
```

Dentro `GET`, trovare:

```ts
  const now = new Date();
  const days = dropPastStarts(
    getBookableDays(availability, {
      busyIntervals: busyIntervalsAt(busyByProvider.get(provider.id) ?? [], now),
    }),
    now
  );
```

sostituire con:

```ts
  const now = new Date();
  const stepMinutes = await getSystemConfigNumber(
    'AVAILABILITY_BOOKING_START_STEP_MINUTES',
    10
  );
  const days = dropPastStarts(
    getBookableDays(availability, {
      busyIntervals: busyIntervalsAt(busyByProvider.get(provider.id) ?? [], now),
      stepMinutes,
    }),
    now
  );
```

- [ ] **Step 2: `app/(marketplace)/coaches/[slug]/page.tsx`**

Trovare:

```ts
import { getVerticalConfig, findTaxonomyItem, t } from '@/lib/core/config';
import { getCoachBySlug } from '@/lib/core/listings';
import {
  getApprovedCoachAvailabilityBySlug,
  describeAvailability,
  getBookableDays,
  getCoachBusyIntervalsByProviderIds,
} from '@/lib/core/availability';
```

sostituire con:

```ts
import { getVerticalConfig, findTaxonomyItem, t } from '@/lib/core/config';
import { getCoachBySlug } from '@/lib/core/listings';
import {
  getApprovedCoachAvailabilityBySlug,
  describeAvailability,
  getBookableDays,
  getCoachBusyIntervalsByProviderIds,
} from '@/lib/core/availability';
import { getSystemConfigNumber } from '@/lib/core/system-config';
```

Dentro `CoachDetailPage`, trovare:

```ts
  // Concrete day+time options for the constrained booking picker.
  const bookableDays = getBookableDays(availability, {
    busyIntervals: busyByProvider.get(coach.providerId) ?? [],
  });
```

sostituire con:

```ts
  // Concrete day+time options for the constrained booking picker.
  const stepMinutes = await getSystemConfigNumber(
    'AVAILABILITY_BOOKING_START_STEP_MINUTES',
    10
  );
  const bookableDays = getBookableDays(availability, {
    busyIntervals: busyByProvider.get(coach.providerId) ?? [],
    stepMinutes,
  });
```

- [ ] **Step 3: `app/(dashboard)/dashboard/coach/page.tsx`**

Trovare:

```ts
import {
  getCoachAvailability,
  getBookableDays,
} from '@/lib/core/availability';
import { busyIntervalsAt } from '@/lib/core/availability/validation';
```

sostituire con:

```ts
import {
  getCoachAvailability,
  getBookableDays,
} from '@/lib/core/availability';
import { busyIntervalsAt } from '@/lib/core/availability/validation';
import { getSystemConfigNumber } from '@/lib/core/system-config';
```

Dentro `CoachDashboardPage`, trovare:

```ts
  // Same Rome-derived day/time options the athlete sees, so the coach can't
  // pick a slot their own availability would reject on submit.
  const bookableDays = getBookableDays(coachAvailability, {
```

sostituire con:

```ts
  // Same Rome-derived day/time options the athlete sees, so the coach can't
  // pick a slot their own availability would reject on submit.
  const stepMinutes = await getSystemConfigNumber(
    'AVAILABILITY_BOOKING_START_STEP_MINUTES',
    10
  );
  const bookableDays = getBookableDays(coachAvailability, {
    stepMinutes,
```

Nota: `stepMinutes` va aggiunto come primo campo dentro l'oggetto opts di
questa chiamata (quello che oggi contiene solo `busyIntervals: ...`), senza
rimuovere nient'altro.

Più sotto nella stessa funzione, trovare (la seconda chiamata a
`getBookableDays`, dentro la costruzione di `editDaysByBooking`):

```ts
  const editDaysByBooking = new Map<number, typeof bookableDays>(
    editableBusy.map((interval) => [
      interval.bookingId!,
      getBookableDays(coachAvailability, {
        busyIntervals: editableBusy,
        excludeBookingId: interval.bookingId,
      }),
    ])
  );
```

sostituire con:

```ts
  const editDaysByBooking = new Map<number, typeof bookableDays>(
    editableBusy.map((interval) => [
      interval.bookingId!,
      getBookableDays(coachAvailability, {
        busyIntervals: editableBusy,
        excludeBookingId: interval.bookingId,
        stepMinutes,
      }),
    ])
  );
```

(`stepMinutes` è già stato calcolato una sola volta più sopra nella stessa
funzione — questa seconda chiamata lo riusa, non lo ricalcola.)

- [ ] **Step 4: `app/(dashboard)/dashboard/appointments/[id]/page.tsx`**

Trovare (fra gli import in cima al file, vicino a dove sono importate le
altre utility di `lib/core`):

```ts
import { getSessionRecordingCoverage } from '@/lib/core/ai-session-notes/recording';
```

sostituire con:

```ts
import { getSessionRecordingCoverage } from '@/lib/core/ai-session-notes/recording';
import { getSystemConfigNumber } from '@/lib/core/system-config';
```

Dentro `AppointmentDetailPage`, trovare:

```ts
  const bookableDays = getBookableDays(availability, {
    busyIntervals: busyByProvider.get(booking.providerId) ?? [],
  });
```

sostituire con:

```ts
  const stepMinutes = await getSystemConfigNumber(
    'AVAILABILITY_BOOKING_START_STEP_MINUTES',
    10
  );
  const bookableDays = getBookableDays(availability, {
    busyIntervals: busyByProvider.get(booking.providerId) ?? [],
    stepMinutes,
  });
```

- [ ] **Step 5: `lib/core/bookings/index.ts`**

Trovare:

```ts
import {
  getCoachAvailabilityByProviderId,
  isWithinAvailability,
  describeAvailability,
  getBookableDays,
  getCoachBusyIntervalsByProviderIds,
  type BookableDay,
} from '@/lib/core/availability';
```

sostituire con:

```ts
import {
  getCoachAvailabilityByProviderId,
  isWithinAvailability,
  describeAvailability,
  getBookableDays,
  getCoachBusyIntervalsByProviderIds,
  type BookableDay,
} from '@/lib/core/availability';
import { getSystemConfigNumber } from '@/lib/core/system-config';
```

Dentro `getAthleteRelationshipCoaches`, trovare:

```ts
  // Un solo istante per tutti i coach della lista: due letture dell'orologio
  // potrebbero cadere a cavallo di un minuto e rendere la lista incoerente.
  const now = new Date();
```

sostituire con:

```ts
  // Un solo istante per tutti i coach della lista: due letture dell'orologio
  // potrebbero cadere a cavallo di un minuto e rendere la lista incoerente.
  const now = new Date();
  const stepMinutes = await getSystemConfigNumber(
    'AVAILABILITY_BOOKING_START_STEP_MINUTES',
    10
  );
```

Trovare:

```ts
      bookableDays: getBookableDays(availByProvider.get(c.id) ?? [], {
        busyIntervals: busyByProvider.get(c.id) ?? [],
      }),
```

sostituire con:

```ts
      bookableDays: getBookableDays(availByProvider.get(c.id) ?? [], {
        busyIntervals: busyByProvider.get(c.id) ?? [],
        stepMinutes,
      }),
```

Trovare:

```ts
            getBookableDays(availByProvider.get(c.id) ?? [], {
              busyIntervals: busyByProvider.get(c.id) ?? [],
              excludeBookingId: interval.bookingId,
            }),
```

sostituire con:

```ts
            getBookableDays(availByProvider.get(c.id) ?? [], {
              busyIntervals: busyByProvider.get(c.id) ?? [],
              excludeBookingId: interval.bookingId,
              stepMinutes,
            }),
```

- [ ] **Step 6: Verificare che compili**

Run: `npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 7: Verificare con una build**

Run: `npx next build` (o `NEXT_SKIP_BUILD_TYPECHECK=1 npx next build` se
serve)
Expected: completa senza errori sulle rotte toccate (coach detail,
dashboard coach, appuntamento, API mobile).

- [ ] **Step 8: Verificare i test dei moduli toccati**

Run: `npx tsx --test lib/core/bookings/*.test.ts`
Expected: PASS, nessuna regressione (nessun test chiama `getBookableDays`
assumendo un default diverso — la funzione stessa non è stata toccata).

- [ ] **Step 9: Commit**

```bash
git add "app/api/mobile/new-appointment/route.ts" "app/(marketplace)/coaches/[slug]/page.tsx" "app/(dashboard)/dashboard/coach/page.tsx" "app/(dashboard)/dashboard/appointments/[id]/page.tsx" lib/core/bookings/index.ts
git commit -m "$(cat <<'EOF'
feat(prenotazioni): il passo tra gli orari prenotabili legge da system_config

getBookableDays non cambia (accetta già opts.stepMinutes con un
default interno) — i 7 punti di chiamata esterni ora passano il
valore letto da system_config invece di ricadere sul default.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: Rimuovere il `min={1}` indiscriminato dal pannello admin

**Files:**
- Modify: `app/(dashboard)/dashboard/admin/system-config/page.tsx`

**Interfaces:**
- Nessuna nuova interfaccia — solo un aggiustamento del pannello esistente.

- [ ] **Step 1: Rimuovere l'attributo**

Trovare:

```tsx
                      ) : row.valueType === 'number' ? (
                        <input
                          type="number"
                          name="rawValue"
                          min={1}
                          defaultValue={typeof row.value === 'number' ? row.value : ''}
                          aria-label={row.label}
                          className="w-28 rounded-lg border border-gray-300 px-2 py-1 text-sm"
                        />
```

sostituire con:

```tsx
                      ) : row.valueType === 'number' ? (
                        <input
                          type="number"
                          name="rawValue"
                          defaultValue={typeof row.value === 'number' ? row.value : ''}
                          aria-label={row.label}
                          className="w-28 rounded-lg border border-gray-300 px-2 py-1 text-sm"
                        />
```

Il controllo vero resta lato server in
`lib/core/system-config/value-parsing.ts`'s `parseSystemConfigValue`, che
già rifiuta valori ≤ 0 — corretto per un rapporto come `0.9` quanto per un
conteggio come `3`.

- [ ] **Step 2: Verificare che compili**

Run: `npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 3: Commit**

```bash
git add "app/(dashboard)/dashboard/admin/system-config/page.tsx"
git commit -m "$(cat <<'EOF'
fix(admin): rimuove il min={1} indiscriminato dal pannello di sistema

Una delle nuove chiavi (AI_NOTES_PARTIAL_COVERAGE_THRESHOLD) è un
rapporto fra 0 e 1: min={1} lo mostrerebbe come "non valido" nel
browser pur essendo salvabile (il form non usa la validazione nativa).
Il controllo vero resta lato server in parseSystemConfigValue.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 13: Verifica finale

**Files:** nessuno (solo comandi)

- [ ] **Step 1: Suite completa**

Run: `npm test`
Expected: PASS, stesso numero di test di prima di questo piano (nessun
nuovo file di test aggiunto in questo giro — solo parametri opzionali con
default invariati sulle funzioni pure esistenti).

- [ ] **Step 2: Typecheck completo**

Run: `npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 3: Nessuna costante rimossa ancora referenziata**

Run: `grep -rln "RING_THROTTLE_MS\b\|INVITATION_TTL_MS\b" app lib --include="*.ts" --include="*.tsx"`
Expected: nessun risultato (le uniche due costanti rimosse per intero in
questo piano — Task 2 e Task 3 — non hanno bisogno di restare come default
di un parametro, a differenza delle altre 9 chiavi che restano come
default e quindi compaiono ancora nel codice, correttamente).

- [ ] **Step 4: Rileggere lo spec e spuntare la copertura**

Confrontare `docs/superpowers/specs/2026-09-08-configurazione-di-sistema-design.md`,
sezione "Secondo giro", con quanto implementato: tutti e 12 i valori
migrati ✓, nessuna funzione pura resa asincrona ✓, il `min={1}` rimosso ✓.

- [ ] **Step 5: Aggiornare lo stato dello spec**

In `docs/superpowers/specs/2026-09-08-configurazione-di-sistema-design.md`,
trovare la sezione "## Secondo giro (2026-09-08): 11 candidati aggiuntivi"
e aggiungere, subito sotto il titolo, una riga:

```
**Stato:** implementato
```

- [ ] **Step 6: Commit**

```bash
git add docs/superpowers/specs/2026-09-08-configurazione-di-sistema-design.md
git commit -m "$(cat <<'EOF'
docs: segna come implementato il secondo giro di configurazione di sistema

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```
