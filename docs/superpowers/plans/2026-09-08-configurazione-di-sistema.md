# Configurazione di sistema (chiave/valore) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Costruire una tabella di configurazione a chiave/valore, un pannello admin per modificarla, e migrare 4 costanti di business reali (non ipotetiche) a leggerla, senza toccare percorsi di codice fragili o condivisi client/server.

**Architecture:** Una tabella `system_config` (chiave testuale, valore JSON tipizzato) letta tramite un piccolo modulo `lib/core/system-config/` con fallback e cache in-process di 60 secondi — ogni chiamante passa il valore hardcoded di oggi come fallback, così una riga mancante o un problema del DB non rompe nulla. Un pannello admin modifica solo i valori esistenti; una nuova chiave la aggiunge uno sviluppatore con una migrazione.

**Tech Stack:** Next.js 15 / React 19, Drizzle ORM, PostgreSQL su Supabase, `node:test` via `tsx --test`.

**Spec di riferimento:** `docs/superpowers/specs/2026-09-08-configurazione-di-sistema-design.md`

## Global Constraints

- **Il database di sviluppo è il database di produzione.** Nessuna migrazione va eseguita senza aver letto l'SQL generato e senza conferma esplicita dell'utente.
- **Additiva, nessun `DROP`.** Solo `CREATE TABLE` in questo lavoro.
- **Ogni lettura di configurazione ha un fallback obbligatorio** (il valore hardcoded di oggi) — una riga mancante o un errore del database non deve mai far fallire il chiamante.
- **Cache in-process di 60 secondi** su ogni chiave letta — una `Map` a livello di modulo, non un servizio esterno.
- **Nessun "aggiungi variabile" dal pannello admin** — solo modifica di righe esistenti. Una chiave nuova la aggiunge uno sviluppatore con una migrazione.
- **Ogni scrittura passa da `requireRole('admin')` a livello di route/action e da un controllo indipendente in `lib/core`** (pattern già in uso in `lib/core/features/index.ts` e `lib/core/ai-session-notes/index.ts`: query su `userRoles` con `roleKey = 'admin'`, `throw new Error('FORBIDDEN')` se assente).
- **Ogni scrittura registra un evento in `admin_audit_events`** con azione `configuration_changed` (già definita, mai usata finora) e soggetto `configuration` (già definito) — nessuna modifica allo schema di audit.
- **Nessun percorso di codice condiviso client/server o già ampiamente riusato viene toccato in questo lavoro** — è la ragione per cui la "durata sessione predefinita" non fa parte di questo piano (vedi spec, sezione "Cosa entra in questo giro").

---

### Task 1: Schema — tabella `system_config`

**Files:**
- Modify: `lib/db/schema.ts`

**Interfaces:**
- Produces: `SYSTEM_CONFIG_VALUE_TYPES`, `SystemConfigValueType`, tabella `systemConfig`, tipi `SystemConfig`/`NewSystemConfig` — consumati dal Task 3.

- [ ] **Step 1: Aggiungere la tabella in fondo a `lib/db/schema.ts`**

Il file termina oggi con:

```ts
export type AdminAuditEvent = typeof adminAuditEvents.$inferSelect;
export type NewAdminAuditEvent = typeof adminAuditEvents.$inferInsert;
```

Aggiungere subito dopo:

```ts

export const SYSTEM_CONFIG_VALUE_TYPES = ['number', 'string', 'boolean'] as const;
export type SystemConfigValueType = (typeof SYSTEM_CONFIG_VALUE_TYPES)[number];

export const systemConfig = pgTable(
  'system_config',
  {
    key: varchar('key', { length: 100 }).primaryKey(),
    value: jsonb('value').notNull(),
    valueType: varchar('value_type', { length: 20 }).notNull(),
    category: varchar('category', { length: 60 }).notNull(),
    label: varchar('label', { length: 200 }).notNull(),
    description: text('description'),
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
  },
  (table) => [
    check(
      'system_config_value_type_check',
      sql`${table.valueType} in ('number', 'string', 'boolean')`
    ),
    // jsonb_typeof() di Postgres restituisce esattamente 'number'/'string'/
    // 'boolean' — impedisce a livello di database una riga con valueType
    // 'number' ma un valore JSON booleano o stringa.
    check(
      'system_config_value_matches_type_check',
      sql`jsonb_typeof(${table.value}) = ${table.valueType}`
    ),
  ]
);

export type SystemConfig = typeof systemConfig.$inferSelect;
export type NewSystemConfig = typeof systemConfig.$inferInsert;
```

Tutti gli import usati (`pgTable`, `varchar`, `jsonb`, `text`, `timestamp`,
`integer`, `check`, `sql`) sono già importati in cima al file — nessuna
modifica agli import serve.

- [ ] **Step 2: Verificare che il progetto compili**

Run: `npx tsc --noEmit`
Expected: nessun errore nuovo.

- [ ] **Step 3: Commit**

```bash
git add lib/db/schema.ts
git commit -m "$(cat <<'EOF'
feat(db): schema per system_config

Tabella chiave/valore per costanti di business configurabili
dall'admin senza deploy. Nessuna migrazione ancora generata/applicata
(task successivo).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Migrazione — generare, rivedere, applicare (checkpoint umano)

**Files:**
- Create: `lib/db/migrations/00NN_configurazione-di-sistema.sql`
- Modify: `lib/db/migrations/meta/_journal.json`

**Interfaces:**
- Consumes: lo schema di Task 1.
- Produces: `system_config` sul database, con 4 righe seed pronte per i Task 4-7.

- [ ] **Step 1: Generare la migrazione**

Run: `npx drizzle-kit generate --name=configurazione-di-sistema`
Expected: un nuovo file `lib/db/migrations/00NN_configurazione-di-sistema.sql`
con un `CREATE TABLE "system_config" (...)`. Additiva, nessun `DROP` —
nessuna tabella preesistente ha un nome simile, quindi non è previsto il
prompt interattivo di disambiguazione rename incontrato sul ramo dei
pacchetti.

- [ ] **Step 2: Leggere l'SQL generato riga per riga**

Deve contenere **solo**: `CREATE TABLE "system_config" (...)` con
`PRIMARY KEY` su `key`, `FOREIGN KEY` su `createdby`/`updatedby` →
`users.id`, i due `CHECK`. Se contiene qualunque cosa tocchi altre tabelle,
fermarsi e segnalarlo.

- [ ] **Step 3: Aggiungere a mano RLS/REVOKE e il seed dei 4 valori pilota**

In cima al blocco `CREATE TABLE "system_config"`, aggiungere:

```sql
-- Costanti di business configurabili dall'admin senza deploy (vedi
-- docs/superpowers/specs/2026-09-08-configurazione-di-sistema-design.md).
-- Nessun client la legge direttamente: solo il server, tramite
-- lib/core/system-config/ per la lettura e requireRole('admin') per la scrittura.
```

In fondo al file, dopo l'ultimo statement generato, aggiungere prima il
`REVOKE`/RLS e poi il seed (in questo ordine: i permessi sulla tabella
esistono già quando le righe vengono inserite):

```sql

REVOKE ALL ON "public"."system_config" FROM anon, authenticated;--> statement-breakpoint
ALTER TABLE "system_config" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

INSERT INTO "public"."system_config" ("key", "value", "value_type", "category", "label", "description") VALUES
  ('CONTACT_MAX_MESSAGES_PER_EMAIL_PER_HOUR', '3'::jsonb, 'number', 'contatti', 'Limite messaggi per ora', 'Quanti messaggi accettiamo dallo stesso indirizzo email in un''ora, nel form contatti.'),
  ('AI_NOTES_AUDIO_RETENTION_DAYS', '7'::jsonb, 'number', 'ai_notes', 'Ritenzione audio (giorni)', 'Giorni di conservazione della registrazione audio grezza mostrati nella privacy policy. Non applica davvero la cancellazione: quella resta su una variabile d''ambiente separata.'),
  ('CANCELLATION_NOTICE_HOURS', '24'::jsonb, 'number', 'prenotazioni', 'Preavviso di cancellazione (ore)', 'Ore di preavviso indicate nei Termini per annullare una sessione senza che conti come mancata presentazione. Solo testo: nessun controllo lo applica oggi.'),
  ('AI_NOTES_ADMIN_TRIAL_DAYS', '30'::jsonb, 'number', 'ai_notes', 'Durata trial concesso da un admin (giorni)', 'Giorni di trial per gli Appunti AI quando un admin lo concede manualmente a un utente.');
```

- [ ] **Step 4: Mostrare l'SQL finale e ottenere conferma**

Incollare il contenuto completo del file nella conversazione e chiedere
conferma prima di procedere allo Step 5. Non proseguire senza una risposta
affermativa. Non contiene `DROP`, ma tocca comunque la produzione (nessuno
staging).

- [ ] **Step 5: Applicare la migrazione**

Solo dopo la conferma. Run: `npm run db:migrate`
Expected: log di drizzle-kit che conferma l'applicazione, nessun errore.

- [ ] **Step 6: Verificare le 4 righe**

Run: `npx tsx -e "import { db } from './lib/db/drizzle'; import { systemConfig } from './lib/db/schema'; db.select().from(systemConfig).then(rows => { console.log(rows); process.exit(0); });"`
Expected: 4 righe, una per chiave, con i valori dello Step 3.

- [ ] **Step 7: Commit**

```bash
git add lib/db/migrations
git commit -m "$(cat <<'EOF'
feat(db): applica system_config con i 4 valori pilota

Additiva: solo CREATE TABLE, nessun DROP.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `lib/core/system-config/` — lettura con cache, scrittura con controllo admin

> **Nota sul nome della cartella:** `lib/core/config/` esiste già su questo
> branch per un modulo non correlato (la configurazione "verticale" del
> marketplace: `getVerticalConfig`, `findTaxonomyItem`, `t`, usato da ~19
> file). Non riusarlo: questo lavoro vive in `lib/core/system-config/`, una
> cartella nuova. Se durante l'implementazione risultasse già occupata anche
> questa, fermarsi e segnalarlo invece di unire due moduli non correlati
> nello stesso file.

**Files:**
- Create: `lib/core/system-config/cache.ts`
- Create: `lib/core/system-config/cache.test.ts`
- Create: `lib/core/system-config/index.ts`
- Create: `lib/core/system-config/value-parsing.ts`
- Create: `lib/core/system-config/value-parsing.test.ts`
- Modify: `package.json` (script `test`)

**Interfaces:**
- Consumes: `systemConfig`, `SystemConfigValueType` da `@/lib/db/schema` (Task 1/2).
- Produces: `getSystemConfigNumber(key, fallback)`, `getSystemConfigString(key, fallback)`, `getSystemConfigBoolean(key, fallback)` (Promise-returning) — consumate dai Task 4-7. `listSystemConfig(actorUserId)`, `setSystemConfigValue(params)` — consumate dal Task 8.

- [ ] **Step 1: Scrivere la logica di cache, pura e testabile**

`lib/core/system-config/cache.ts`:

```ts
export type ConfigCacheEntry<T> = {
  value: T;
  expiresAt: number;
};

export const CONFIG_CACHE_TTL_MS = 60_000;

/** `now` è un parametro esplicito: niente `Date.now()` dentro una funzione pura. */
export function isCacheEntryValid<T>(
  entry: ConfigCacheEntry<T> | undefined,
  now: number
): entry is ConfigCacheEntry<T> {
  return entry !== undefined && entry.expiresAt > now;
}

export function makeCacheEntry<T>(
  value: T,
  now: number,
  ttlMs: number = CONFIG_CACHE_TTL_MS
): ConfigCacheEntry<T> {
  return { value, expiresAt: now + ttlMs };
}
```

- [ ] **Step 2: Test della cache**

`lib/core/system-config/cache.test.ts`:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CONFIG_CACHE_TTL_MS,
  isCacheEntryValid,
  makeCacheEntry,
} from './cache';

test('a missing entry is never valid', () => {
  assert.equal(isCacheEntryValid(undefined, 1000), false);
});

test('an entry within its TTL is valid', () => {
  const entry = makeCacheEntry('valore', 1000);
  assert.equal(isCacheEntryValid(entry, 1000 + CONFIG_CACHE_TTL_MS - 1), true);
});

test('an entry past its TTL is not valid', () => {
  const entry = makeCacheEntry('valore', 1000);
  assert.equal(isCacheEntryValid(entry, 1000 + CONFIG_CACHE_TTL_MS), false);
});

test('a custom TTL is honoured', () => {
  const entry = makeCacheEntry(42, 1000, 5000);
  assert.equal(isCacheEntryValid(entry, 1000 + 4999), true);
  assert.equal(isCacheEntryValid(entry, 1000 + 5000), false);
});
```

- [ ] **Step 3: Eseguire i test e verificare che passino**

Run: `npx tsx --test lib/core/system-config/cache.test.ts`
Expected: PASS (4/4).

- [ ] **Step 4: Scrivere il parsing del valore scritto dall'admin, puro e testabile**

Il pannello admin (Task 8) invia sempre una stringa grezza da un form; questa
funzione decide se e come diventa un valore JSON coerente con `value_type`.
Estratta a parte per essere testabile senza toccare il database.

`lib/core/system-config/value-parsing.ts`:

```ts
import type { SystemConfigValueType } from '@/lib/db/schema';

export type ParsedSystemConfigValue =
  | { ok: true; value: number | string | boolean }
  | { ok: false; error: string };

export function parseSystemConfigValue(
  valueType: SystemConfigValueType,
  rawValue: string
): ParsedSystemConfigValue {
  if (valueType === 'number') {
    const parsed = Number(rawValue.trim());
    if (!Number.isFinite(parsed)) {
      return { ok: false, error: 'Il valore deve essere un numero.' };
    }
    return { ok: true, value: parsed };
  }

  if (valueType === 'boolean') {
    // Una checkbox non spuntata non compare affatto nel form: il chiamante
    // passa '' in quel caso, che deve leggersi come false, non come errore.
    return { ok: true, value: rawValue === 'true' || rawValue === 'on' };
  }

  return { ok: true, value: rawValue };
}
```

- [ ] **Step 5: Test del parsing**

`lib/core/system-config/value-parsing.test.ts`:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSystemConfigValue } from './value-parsing';

test('a valid number string parses to a number', () => {
  const result = parseSystemConfigValue('number', '42');
  assert.deepEqual(result, { ok: true, value: 42 });
});

test('a non-numeric string is rejected for a number field', () => {
  const result = parseSystemConfigValue('number', 'abc');
  assert.equal(result.ok, false);
});

test('an empty string is rejected for a number field', () => {
  const result = parseSystemConfigValue('number', '');
  assert.equal(result.ok, false);
});

test('a checked checkbox parses to true', () => {
  const result = parseSystemConfigValue('boolean', 'on');
  assert.deepEqual(result, { ok: true, value: true });
});

test('an unchecked checkbox (empty string) parses to false', () => {
  const result = parseSystemConfigValue('boolean', '');
  assert.deepEqual(result, { ok: true, value: false });
});

test('a string field keeps the raw value as-is', () => {
  const result = parseSystemConfigValue('string', '  con spazi  ');
  assert.deepEqual(result, { ok: true, value: '  con spazi  ' });
});
```

- [ ] **Step 6: Eseguire i test e verificare che passino**

Run: `npx tsx --test lib/core/system-config/value-parsing.test.ts`
Expected: PASS (6/6).

- [ ] **Step 7: Scrivere il modulo di lettura/scrittura**

`lib/core/system-config/index.ts`:

```ts
import 'server-only';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  systemConfig,
  userRoles,
  type SystemConfigValueType,
} from '@/lib/db/schema';
import { isCacheEntryValid, makeCacheEntry, type ConfigCacheEntry } from './cache';
import { parseSystemConfigValue } from './value-parsing';

const cache = new Map<string, ConfigCacheEntry<unknown>>();

/**
 * `undefined` se la riga manca o il database ha un problema — mai un errore
 * lanciato: ogni chiamante ha già il suo fallback pronto.
 */
async function readRawValue(key: string): Promise<unknown> {
  const now = Date.now();
  const cached = cache.get(key);
  if (isCacheEntryValid(cached, now)) return cached.value;

  try {
    const [row] = await db
      .select({ value: systemConfig.value })
      .from(systemConfig)
      .where(eq(systemConfig.key, key))
      .limit(1);
    if (!row) {
      cache.delete(key);
      return undefined;
    }
    cache.set(key, makeCacheEntry(row.value, now));
    return row.value;
  } catch {
    return undefined;
  }
}

export async function getSystemConfigNumber(
  key: string,
  fallback: number
): Promise<number> {
  const value = await readRawValue(key);
  return typeof value === 'number' ? value : fallback;
}

export async function getSystemConfigString(
  key: string,
  fallback: string
): Promise<string> {
  const value = await readRawValue(key);
  return typeof value === 'string' ? value : fallback;
}

export async function getSystemConfigBoolean(
  key: string,
  fallback: boolean
): Promise<boolean> {
  const value = await readRawValue(key);
  return typeof value === 'boolean' ? value : fallback;
}

async function assertAdmin(actorUserId: number): Promise<void> {
  const [admin] = await db
    .select({ id: userRoles.id })
    .from(userRoles)
    .where(
      and(eq(userRoles.userId, actorUserId), eq(userRoles.roleKey, 'admin'))
    )
    .limit(1);
  if (!admin) throw new Error('FORBIDDEN');
}

export type SystemConfigRow = {
  key: string;
  value: unknown;
  valueType: SystemConfigValueType;
  category: string;
  label: string;
  description: string | null;
  updatedDate: Date;
};

/** L'intero elenco, ordinato per categoria poi chiave — per il pannello admin. */
export async function listSystemConfig(
  actorUserId: number
): Promise<SystemConfigRow[]> {
  await assertAdmin(actorUserId);
  const rows = await db
    .select({
      key: systemConfig.key,
      value: systemConfig.value,
      valueType: systemConfig.valueType,
      category: systemConfig.category,
      label: systemConfig.label,
      description: systemConfig.description,
      updatedDate: systemConfig.updatedDate,
    })
    .from(systemConfig)
    .orderBy(asc(systemConfig.category), asc(systemConfig.key));
  return rows.map((row) => ({
    ...row,
    valueType: row.valueType as SystemConfigValueType,
  }));
}

export type SetSystemConfigResult =
  | { ok: true }
  | { ok: false; error: string };

export async function setSystemConfigValue(params: {
  actorUserId: number;
  key: string;
  valueType: SystemConfigValueType;
  rawValue: string;
}): Promise<SetSystemConfigResult> {
  await assertAdmin(params.actorUserId);

  const parsed = parseSystemConfigValue(params.valueType, params.rawValue);
  if (!parsed.ok) return parsed;

  const [updated] = await db
    .update(systemConfig)
    .set({
      value: parsed.value,
      updatedDate: new Date(),
      updatedBy: params.actorUserId,
    })
    .where(eq(systemConfig.key, params.key))
    .returning({ key: systemConfig.key });

  if (!updated) return { ok: false, error: 'Chiave non trovata.' };

  // Invalida subito per questo processo. Su serverless, un'altra istanza
  // vede il valore nuovo solo alla scadenza della sua cache (fino a 60s) —
  // limite noto e accettato, non un bug.
  cache.delete(params.key);
  return { ok: true };
}
```

- [ ] **Step 8: Verificare che compili**

Run: `npx tsc --noEmit`
Expected: nessun errore nuovo.

- [ ] **Step 9: Aggiungere i nuovi test a `npm test`**

In `package.json`, nello script `"test"`, trovare una voce esistente di
`lib/core/features/` (es. `lib/core/features/policy.test.ts`) e aggiungere,
subito dopo, separati dallo stesso spazio usato dalle altre voci:

```
lib/core/system-config/cache.test.ts lib/core/system-config/value-parsing.test.ts
```

- [ ] **Step 10: Eseguire l'intera suite dei test nuovi**

Run: `npx tsx --test lib/core/system-config/cache.test.ts lib/core/system-config/value-parsing.test.ts`
Expected: PASS (10/10 totali).

- [ ] **Step 11: Commit**

```bash
git add lib/core/system-config package.json
git commit -m "$(cat <<'EOF'
feat(config): lib/core/system-config con cache, parsing e controllo admin

getSystemConfigNumber/String/Boolean: cache in-process di 60s, fallback
al valore di oggi se la riga manca o il database ha un problema —
nessun chiamante può rompersi per questo. listSystemConfig/
setSystemConfigValue per il pannello admin (task successivo),
protette da un controllo admin indipendente in lib/core.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Consumer — limite email del form contatti

**Files:**
- Modify: `lib/core/contact/index.ts`

**Interfaces:**
- Consumes: `getSystemConfigNumber` da `@/lib/core/system-config` (Task 3).

- [ ] **Step 1: Rimuovere la costante e aggiungere l'import**

Eliminare interamente queste due righe:

```ts
/** Quanti messaggi accettiamo dallo stesso indirizzo in un'ora. */
const MAX_PER_EMAIL_PER_HOUR = 3;
```

(la costante sparisce, sostituita dalla chiamata inline nello Step 2)

In cima al file, trovare:

```ts
import 'server-only';
import { and, eq, gte, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { contactMessages } from '@/lib/db/schema';
import { LEGAL_CONTENT_HASH } from '@/lib/core/legal/content-hash.generated';
import { sendContactMessageEmail } from '@/lib/core/email';
```

sostituire con:

```ts
import 'server-only';
import { and, eq, gte, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { contactMessages } from '@/lib/db/schema';
import { LEGAL_CONTENT_HASH } from '@/lib/core/legal/content-hash.generated';
import { sendContactMessageEmail } from '@/lib/core/email';
import { getSystemConfigNumber } from '@/lib/core/system-config';
```

- [ ] **Step 2: Aggiornare il punto d'uso**

Trovare:

```ts
  if (count >= MAX_PER_EMAIL_PER_HOUR) {
```

sostituire con:

```ts
  const maxPerEmailPerHour = await getSystemConfigNumber(
    'CONTACT_MAX_MESSAGES_PER_EMAIL_PER_HOUR',
    3
  );
  if (count >= maxPerEmailPerHour) {
```

- [ ] **Step 3: Verificare che compili**

Run: `npx tsc --noEmit`
Expected: nessun errore nuovo.

- [ ] **Step 4: Verificare i test esistenti del modulo**

Run: `npx tsx --test lib/core/contact/*.test.ts`
Expected: PASS, nessuna regressione (se non esistono test dedicati per
`submitContactMessage`, il comando non restituisce file — verificare con
`ls lib/core/contact/*.test.ts` prima di eseguirlo, e se non esiste alcun
file di test, saltare questo step e annotarlo nel report).

- [ ] **Step 5: Commit**

```bash
git add lib/core/contact/index.ts
git commit -m "$(cat <<'EOF'
feat(contact): il limite di messaggi orario legge da system_config

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Consumer — ritenzione audio, solo il testo della privacy policy

**Files:**
- Modify: `lib/core/legal/processors.ts`
- Modify: `app/(marketplace)/privacy/page.tsx`
- Modify: `app/(marketplace)/terms/page.tsx`

**Interfaces:**
- Consumes: `getSystemConfigNumber` da `@/lib/core/system-config` (Task 3).

> **Solo il testo mostrato cambia.** L'enforcement vero della ritenzione
> resta sulla env var `AI_NOTES_AUDIO_RETENTION_DAYS`, non toccata da questo
> task (vedi spec — `getAudioRecordingConfig()` è sincrona ed è chiamata in
> 7+ punti della pipeline AI Notes, troppo rischioso per questo giro).

- [ ] **Step 1: Rimuovere la costante da `lib/core/legal/processors.ts`**

Eliminare interamente questo blocco:

```ts
/**
 * Giorni di conservazione della registrazione audio grezza di una sessione,
 * quando gli Appunti AI sono attivi.
 *
 * Deve restare allineato ad `AI_NOTES_AUDIO_RETENTION_DAYS`: qui è il numero
 * dichiarato all'utente, là quello che il software applica. Se divergono,
 * l'informativa mente — ed è il tipo di divergenza che nessuno nota finché
 * qualcuno non chiede conto proprio di quel dato.
 */
export const AI_AUDIO_RETENTION_DAYS = 7;
```

(la costante sparisce: il numero mostrato ora arriva da `system_config`,
letto direttamente dalle pagine che lo mostrano — Step 2 e 3)

- [ ] **Step 2: Aggiornare `app/(marketplace)/privacy/page.tsx`**

Trovare:

```ts
import { LegalPage } from '../legal-layout';
import {
  AI_AUDIO_RETENTION_DAYS,
  SUB_PROCESSORS,
  LEGAL_LAST_UPDATED,
  INACTIVITY_MONTHS,
  POST_CLOSURE_RETENTION_MONTHS,
  LEGAL_CONTACT_EMAIL,
} from '@/lib/core/legal/processors';
import { MIN_SIGNUP_AGE } from '@/lib/core/guardians/age';

export const metadata = { title: 'Privacy Policy — KaiPai' };

export default function PrivacyPage() {
```

sostituire con:

```ts
import { LegalPage } from '../legal-layout';
import {
  SUB_PROCESSORS,
  LEGAL_LAST_UPDATED,
  INACTIVITY_MONTHS,
  POST_CLOSURE_RETENTION_MONTHS,
  LEGAL_CONTACT_EMAIL,
} from '@/lib/core/legal/processors';
import { MIN_SIGNUP_AGE } from '@/lib/core/guardians/age';
import { getSystemConfigNumber } from '@/lib/core/system-config';

export const metadata = { title: 'Privacy Policy — KaiPai' };

export default async function PrivacyPage() {
  const aiAudioRetentionDays = await getSystemConfigNumber(
    'AI_NOTES_AUDIO_RETENTION_DAYS',
    7
  );
```

Trovare (primo uso, la voce nell'elenco "Cosa viene conservato"):

```ts
          la <strong>registrazione audio grezza</strong>, in un archivio privato,
          per <strong>{AI_AUDIO_RETENTION_DAYS} giorni</strong>, dopodiché viene
          cancellata automaticamente. Serve solo a produrre la trascrizione;
```

sostituire con:

```ts
          la <strong>registrazione audio grezza</strong>, in un archivio privato,
          per <strong>{aiAudioRetentionDays} giorni</strong>, dopodiché viene
          cancellata automaticamente. Serve solo a produrre la trascrizione;
```

Trovare (secondo uso, nella tabella dei tempi di conservazione):

```ts
          <strong>Registrazione audio degli Appunti AI</strong>:{' '}
          {AI_AUDIO_RETENTION_DAYS} giorni dalla sessione, poi cancellata
          automaticamente. È il termine più breve di tutti perché l’audio serve
```

sostituire con:

```ts
          <strong>Registrazione audio degli Appunti AI</strong>:{' '}
          {aiAudioRetentionDays} giorni dalla sessione, poi cancellata
          automaticamente. È il termine più breve di tutti perché l’audio serve
```

- [ ] **Step 3: Aggiornare `app/(marketplace)/terms/page.tsx`**

Trovare:

```ts
import { LegalPage } from '../legal-layout';
import {
  AI_AUDIO_RETENTION_DAYS,
  LEGAL_LAST_UPDATED,
  INACTIVITY_MONTHS,
  TERMS_CHANGE_NOTICE_DAYS,
  CANCELLATION_NOTICE_HOURS,
  LEGAL_CONTACT_EMAIL,
} from '@/lib/core/legal/processors';
import { REQUEST_RESPONSE_WINDOW_HOURS } from '@/lib/core/sessions';
import { MIN_SIGNUP_AGE, AGE_OF_MAJORITY } from '@/lib/core/guardians/age';

export const metadata = { title: 'Termini e Condizioni — KaiPai' };

/** Inline link styling, matching the rest of the legal pages. */
const A = 'text-red-600 underline hover:text-red-700';

export default function TermsPage() {
```

sostituire con (`CANCELLATION_NOTICE_HOURS` resta per ora — la tocca il
Task 6, non questo):

```ts
import { LegalPage } from '../legal-layout';
import {
  LEGAL_LAST_UPDATED,
  INACTIVITY_MONTHS,
  TERMS_CHANGE_NOTICE_DAYS,
  CANCELLATION_NOTICE_HOURS,
  LEGAL_CONTACT_EMAIL,
} from '@/lib/core/legal/processors';
import { REQUEST_RESPONSE_WINDOW_HOURS } from '@/lib/core/sessions';
import { MIN_SIGNUP_AGE, AGE_OF_MAJORITY } from '@/lib/core/guardians/age';
import { getSystemConfigNumber } from '@/lib/core/system-config';

export const metadata = { title: 'Termini e Condizioni — KaiPai' };

/** Inline link styling, matching the rest of the legal pages. */
const A = 'text-red-600 underline hover:text-red-700';

export default async function TermsPage() {
  const aiAudioRetentionDays = await getSystemConfigNumber(
    'AI_NOTES_AUDIO_RETENTION_DAYS',
    7
  );
```

Trovare:

```ts
        Tempi di conservazione, fornitori coinvolti e diritti esercitabili sono
        descritti nell’Informativa Privacy. La registrazione audio grezza viene
        cancellata automaticamente decorsi {AI_AUDIO_RETENTION_DAYS} giorni.
```

sostituire con:

```ts
        Tempi di conservazione, fornitori coinvolti e diritti esercitabili sono
        descritti nell’Informativa Privacy. La registrazione audio grezza viene
        cancellata automaticamente decorsi {aiAudioRetentionDays} giorni.
```

- [ ] **Step 4: Verificare che compili**

Run: `npx tsc --noEmit`
Expected: nessun errore nuovo.

- [ ] **Step 5: Verificare con una build**

Run: `npx next build`
Expected: completa senza errori sulle rotte `/privacy` e `/terms` (se fallisce
per l'errore preesistente scollegato in `components/push-setup.tsx`, rilanciare
con `NEXT_SKIP_BUILD_TYPECHECK=1 npx next build` — stesso problema, non
introdotto da questo task, già documentato in `next.config.ts`).

- [ ] **Step 6: Commit**

```bash
git add lib/core/legal/processors.ts "app/(marketplace)/privacy/page.tsx" "app/(marketplace)/terms/page.tsx"
git commit -m "$(cat <<'EOF'
feat(legal): il numero di ritenzione audio nella privacy policy legge da system_config

Solo il testo mostrato. L'enforcement vero resta sulla env var
AI_NOTES_AUDIO_RETENTION_DAYS, non toccata — vedi lo spec per il
perché (getAudioRecordingConfig è sincrona, 7+ chiamanti nella
pipeline AI Notes).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Consumer — preavviso di cancellazione, solo testo

**Files:**
- Modify: `lib/core/legal/processors.ts`
- Modify: `app/(marketplace)/terms/page.tsx`

**Interfaces:**
- Consumes: `getSystemConfigNumber` da `@/lib/core/system-config` (Task 3).

> **Solo il numero mostrato si sposta.** Nessun controllo che impedisca o
> segnali una cancellazione tardiva esiste oggi nel codice, e questo task non
> lo aggiunge — resta un lavoro separato, fuori scope (vedi spec).

- [ ] **Step 1: Rimuovere la costante da `lib/core/legal/processors.ts`**

Eliminare interamente questo blocco:

```ts
/**
 * Hours of notice expected to cancel a session without it counting as a
 * no-show. No penalty attaches today (nothing is charged), but the coach has
 * still set the time aside, and the norm needs to exist before billing does.
 */
export const CANCELLATION_NOTICE_HOURS = 24;
```

- [ ] **Step 2: Aggiornare `app/(marketplace)/terms/page.tsx`**

Trovare (l'import, così come lo ha lasciato il Task 5 — `CANCELLATION_NOTICE_HOURS`
è ancora importata da `processors`):

```ts
import {
  LEGAL_LAST_UPDATED,
  INACTIVITY_MONTHS,
  TERMS_CHANGE_NOTICE_DAYS,
  CANCELLATION_NOTICE_HOURS,
  LEGAL_CONTACT_EMAIL,
} from '@/lib/core/legal/processors';
import { REQUEST_RESPONSE_WINDOW_HOURS } from '@/lib/core/sessions';
import { MIN_SIGNUP_AGE, AGE_OF_MAJORITY } from '@/lib/core/guardians/age';
import { getSystemConfigNumber } from '@/lib/core/system-config';

export const metadata = { title: 'Termini e Condizioni — KaiPai' };

/** Inline link styling, matching the rest of the legal pages. */
const A = 'text-red-600 underline hover:text-red-700';

export default async function TermsPage() {
  const aiAudioRetentionDays = await getSystemConfigNumber(
    'AI_NOTES_AUDIO_RETENTION_DAYS',
    7
  );
```

sostituire con:

```ts
import {
  LEGAL_LAST_UPDATED,
  INACTIVITY_MONTHS,
  TERMS_CHANGE_NOTICE_DAYS,
  LEGAL_CONTACT_EMAIL,
} from '@/lib/core/legal/processors';
import { REQUEST_RESPONSE_WINDOW_HOURS } from '@/lib/core/sessions';
import { MIN_SIGNUP_AGE, AGE_OF_MAJORITY } from '@/lib/core/guardians/age';
import { getSystemConfigNumber } from '@/lib/core/system-config';

export const metadata = { title: 'Termini e Condizioni — KaiPai' };

/** Inline link styling, matching the rest of the legal pages. */
const A = 'text-red-600 underline hover:text-red-700';

export default async function TermsPage() {
  const [aiAudioRetentionDays, cancellationNoticeHours] = await Promise.all([
    getSystemConfigNumber('AI_NOTES_AUDIO_RETENTION_DAYS', 7),
    getSystemConfigNumber('CANCELLATION_NOTICE_HOURS', 24),
  ]);
```

Trovare:

```ts
        Entrambe le parti possono annullare una Sessione fino al suo
        svolgimento. È buona norma farlo con almeno{' '}
        <strong>{CANCELLATION_NOTICE_HOURS} ore</strong> di preavviso: il tempo
```

sostituire con:

```ts
        Entrambe le parti possono annullare una Sessione fino al suo
        svolgimento. È buona norma farlo con almeno{' '}
        <strong>{cancellationNoticeHours} ore</strong> di preavviso: il tempo
```

- [ ] **Step 3: Verificare che compili**

Run: `npx tsc --noEmit`
Expected: nessun errore nuovo.

- [ ] **Step 4: Commit**

```bash
git add lib/core/legal/processors.ts "app/(marketplace)/terms/page.tsx"
git commit -m "$(cat <<'EOF'
feat(legal): il preavviso di cancellazione nei Termini legge da system_config

Solo il testo mostrato — nessun controllo di enforcement esiste oggi
nel codice, e questo task non lo aggiunge.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Consumer — trial AI Notes concesso da un admin

**Files:**
- Modify: `app/(dashboard)/dashboard/admin/ai-notes/actions.ts`
- Modify: `app/(dashboard)/dashboard/admin/ai-notes/page.tsx`

**Interfaces:**
- Consumes: `getSystemConfigNumber` da `@/lib/core/system-config` (Task 3).

- [ ] **Step 1: Aggiornare `actions.ts`**

Trovare:

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/core/auth';
import {
  FEATURE_CODES,
  revokeFeatureEntitlement,
  setFeatureEntitlement,
} from '@/lib/core/features';
import { createProductionAiSessionNotesDependencies } from '@/lib/core/ai-session-notes/dependencies';
```

sostituire con:

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/core/auth';
import {
  FEATURE_CODES,
  revokeFeatureEntitlement,
  setFeatureEntitlement,
} from '@/lib/core/features';
import { createProductionAiSessionNotesDependencies } from '@/lib/core/ai-session-notes/dependencies';
import { getSystemConfigNumber } from '@/lib/core/system-config';
```

Trovare:

```ts
    } else if (operation === 'trial') {
      const expiresAt = new Date();
      expiresAt.setUTCDate(expiresAt.getUTCDate() + 30);
      await setFeatureEntitlement({
```

sostituire con:

```ts
    } else if (operation === 'trial') {
      const trialDays = await getSystemConfigNumber(
        'AI_NOTES_ADMIN_TRIAL_DAYS',
        30
      );
      const expiresAt = new Date();
      expiresAt.setUTCDate(expiresAt.getUTCDate() + trialDays);
      await setFeatureEntitlement({
```

- [ ] **Step 2: Aggiornare `page.tsx`**

Trovare:

```ts
import Link from 'next/link';
import { requireRole } from '@/lib/core/auth';
import {
  FEATURE_CODES,
  getFeatureAdminUsers,
} from '@/lib/core/features';
import { ActionForm } from '@/components/action-form';
import { Button } from '@/components/ui/button';
import { updateAiNotesEntitlementAction } from './actions';
import { AiPipelineHealthPanel } from '@/components/admin/ai-pipeline-health';
import { getAiPipelineHealth } from '@/lib/core/ai-session-notes/queue-health';
import { getPipelineHealth } from '@/lib/core/ai-session-notes/pipeline-health';
import { HouseGuidelinesEditor } from '@/components/admin/house-guidelines-editor';
import { loadActiveHouseGuidelines } from '@/lib/core/ai-session-notes/house-guidelines';
```

sostituire con:

```ts
import Link from 'next/link';
import { requireRole } from '@/lib/core/auth';
import {
  FEATURE_CODES,
  getFeatureAdminUsers,
} from '@/lib/core/features';
import { ActionForm } from '@/components/action-form';
import { Button } from '@/components/ui/button';
import { updateAiNotesEntitlementAction } from './actions';
import { AiPipelineHealthPanel } from '@/components/admin/ai-pipeline-health';
import { getAiPipelineHealth } from '@/lib/core/ai-session-notes/queue-health';
import { getPipelineHealth } from '@/lib/core/ai-session-notes/pipeline-health';
import { HouseGuidelinesEditor } from '@/components/admin/house-guidelines-editor';
import { loadActiveHouseGuidelines } from '@/lib/core/ai-session-notes/house-guidelines';
import { getSystemConfigNumber } from '@/lib/core/system-config';
```

Trovare:

```ts
export default async function AiNotesAdminPage() {
  const admin = await requireRole('admin');
  const [users, health, guidelines, pipeline] = await Promise.all([
    getFeatureAdminUsers(admin.id, FEATURE_CODES.AI_SESSION_NOTES),
    getAiPipelineHealth(),
    loadActiveHouseGuidelines(),
    getPipelineHealth(),
  ]);
```

sostituire con:

```ts
export default async function AiNotesAdminPage() {
  const admin = await requireRole('admin');
  const [users, health, guidelines, pipeline, trialDays] = await Promise.all([
    getFeatureAdminUsers(admin.id, FEATURE_CODES.AI_SESSION_NOTES),
    getAiPipelineHealth(),
    loadActiveHouseGuidelines(),
    getPipelineHealth(),
    getSystemConfigNumber('AI_NOTES_ADMIN_TRIAL_DAYS', 30),
  ]);
```

Trovare:

```ts
                      <Button
                        type="submit"
                        size="sm"
                        variant="outline"
                        className="rounded-full"
                      >
                        Trial 30 gg
                      </Button>
```

sostituire con:

```ts
                      <Button
                        type="submit"
                        size="sm"
                        variant="outline"
                        className="rounded-full"
                      >
                        Trial {trialDays} gg
                      </Button>
```

- [ ] **Step 3: Verificare che compili**

Run: `npx tsc --noEmit`
Expected: nessun errore nuovo.

- [ ] **Step 4: Verificare con una build**

Run: `npx next build` (o `NEXT_SKIP_BUILD_TYPECHECK=1 npx next build` se
l'errore preesistente scollegato lo richiede, come nel Task 5)
Expected: completa senza errori sulla rotta `/dashboard/admin/ai-notes`.

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/dashboard/admin/ai-notes/actions.ts" "app/(dashboard)/dashboard/admin/ai-notes/page.tsx"
git commit -m "$(cat <<'EOF'
feat(ai-notes): il trial concesso da un admin legge da system_config

Il numero di giorni e il testo del bottone ("Trial N gg") ora sono la
stessa fonte — prima erano scritti a mano in due punti separati.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Pannello admin `/dashboard/admin/system-config`

**Files:**
- Create: `app/(dashboard)/dashboard/admin/system-config/actions.ts`
- Create: `app/(dashboard)/dashboard/admin/system-config/page.tsx`

**Interfaces:**
- Consumes: `listSystemConfig`, `setSystemConfigValue`, `SystemConfigRow` da `@/lib/core/system-config` (Task 3).

- [ ] **Step 1: Creare `actions.ts`**

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/core/auth';
import { setSystemConfigValue } from '@/lib/core/system-config';
import { recordAdminAudit } from '@/lib/core/admin/audit-log';
import type { ActionState } from '@/lib/auth/middleware';
import type { SystemConfigValueType } from '@/lib/db/schema';

export async function updateSystemConfigAction(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  const admin = await requireRole('admin');
  const key = String(formData.get('key') ?? '').trim();
  const valueType = String(formData.get('valueType') ?? '') as SystemConfigValueType;
  const rawValue =
    valueType === 'boolean'
      ? String(formData.get('rawValue') ?? '')
      : String(formData.get('rawValue') ?? '').trim();

  if (!key || !['number', 'string', 'boolean'].includes(valueType)) {
    return { error: 'Richiesta non valida.' };
  }

  const result = await setSystemConfigValue({
    actorUserId: admin.id,
    key,
    valueType,
    rawValue,
  });

  if (!result.ok) {
    await recordAdminAudit({
      actor: { id: admin.id, email: admin.email },
      action: 'configuration_changed',
      subjectType: 'configuration',
      outcome: 'fallita',
      detail: { chiave: key },
    });
    return { error: result.error };
  }

  await recordAdminAudit({
    actor: { id: admin.id, email: admin.email },
    action: 'configuration_changed',
    subjectType: 'configuration',
    outcome: 'ok',
    detail: { chiave: key },
  });

  revalidatePath('/dashboard/admin/system-config');
  return { success: `${key} aggiornata.` };
}
```

- [ ] **Step 2: Creare `page.tsx`**

```tsx
import { requireRole } from '@/lib/core/auth';
import { listSystemConfig } from '@/lib/core/system-config';
import { ActionForm } from '@/components/action-form';
import { Button } from '@/components/ui/button';
import { updateSystemConfigAction } from './actions';

export const dynamic = 'force-dynamic';

export default async function SystemConfigAdminPage() {
  const admin = await requireRole('admin');
  const rows = await listSystemConfig(admin.id);

  return (
    <section className="space-y-6 p-4 lg:p-0">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">
          Configurazione di sistema
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-gray-600">
          Costanti di business modificabili senza un deploy. Una nuova
          variabile la aggiunge uno sviluppatore con una migrazione — qui si
          modificano solo i valori esistenti. Un cambio può richiedere fino a
          60 secondi per essere effettivo ovunque.
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-gray-400">Nessuna variabile configurata.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3">Chiave</th>
                <th className="px-4 py-3">Etichetta</th>
                <th className="px-4 py-3">Categoria</th>
                <th className="px-4 py-3">Valore</th>
                <th className="px-4 py-3 text-right">Aggiornato il</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((row) => (
                <tr key={row.key}>
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">
                    {row.key}
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{row.label}</p>
                    {row.description && (
                      <p className="text-xs text-gray-500">{row.description}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{row.category}</td>
                  <td className="px-4 py-3">
                    <ActionForm
                      action={updateSystemConfigAction}
                      className="flex items-center gap-2"
                      confirmTitle="Salvare il nuovo valore?"
                      confirmMessage={`Cambia "${row.label}" per tutti, entro 60 secondi. Non è reversibile con un clic.`}
                      confirmActionLabel="Salva"
                    >
                      <input type="hidden" name="key" value={row.key} />
                      <input type="hidden" name="valueType" value={row.valueType} />
                      {row.valueType === 'boolean' ? (
                        <input
                          type="checkbox"
                          name="rawValue"
                          value="true"
                          defaultChecked={row.value === true}
                          aria-label={row.label}
                          className="size-4 rounded border-gray-300"
                        />
                      ) : row.valueType === 'number' ? (
                        <input
                          type="number"
                          name="rawValue"
                          defaultValue={typeof row.value === 'number' ? row.value : ''}
                          aria-label={row.label}
                          className="w-28 rounded-lg border border-gray-300 px-2 py-1 text-sm"
                        />
                      ) : (
                        <input
                          type="text"
                          name="rawValue"
                          defaultValue={typeof row.value === 'string' ? row.value : ''}
                          aria-label={row.label}
                          className="w-48 rounded-lg border border-gray-300 px-2 py-1 text-sm"
                        />
                      )}
                      <Button type="submit" size="sm" variant="outline">
                        Salva
                      </Button>
                    </ActionForm>
                  </td>
                  <td className="px-4 py-3 text-right text-xs text-gray-500">
                    {row.updatedDate.toLocaleDateString('it-IT')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 3: Verificare che compili**

Run: `npx tsc --noEmit`
Expected: nessun errore nuovo.

- [ ] **Step 4: Verificare senza una sessione admin vera**

Stessa procedura già stabilita per i pannelli admin di questo progetto
(nessun account admin di prova esiste): `next build` (con
`NEXT_SKIP_BUILD_TYPECHECK=1` se serve, come nei task precedenti) deve
completare senza errori sulla rotta `/dashboard/admin/system-config`. Se
praticabile, un render statico con dati finti — una riga numerica, una
booleana, una stringa, per verificare che i tre rami dell'input si vedano
tutti, anche se solo quello numerico ha dati reali in produzione — via
Playwright, poi ripulito per intero (`git status` vuoto). Se il costo di
allestirlo è alto, fermarsi al build e dichiararlo esplicitamente.

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/dashboard/admin/system-config"
git commit -m "$(cat <<'EOF'
feat(admin): pannello per la configurazione di sistema

Elenco, non una matrice: ogni riga è un valore indipendente. Solo
modifica di valori esistenti — una chiave nuova la aggiunge uno
sviluppatore con una migrazione.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Verifica finale

**Files:** nessuno (solo comandi)

- [ ] **Step 1: Suite completa**

Run: `npm test`
Expected: PASS, inclusi i 10 nuovi test (`cache.test.ts`,
`value-parsing.test.ts`).

- [ ] **Step 2: Typecheck completo**

Run: `npx tsc --noEmit`
Expected: nessun errore nuovo — solo i due preesistenti scollegati
(`components/push-setup.tsx`, `lib/payments/stripe.ts`), se presenti anche
su questo branch.

- [ ] **Step 3: Nessuna costante rimossa ancora referenziata**

Run: `grep -rln "MAX_PER_EMAIL_PER_HOUR\|AI_AUDIO_RETENTION_DAYS\|CANCELLATION_NOTICE_HOURS" app lib --include="*.ts" --include="*.tsx"`
Expected: nessun risultato (le tre costanti sono state rimosse nei Task
4/5/6 e sostituite da chiamate a `getSystemConfigNumber`).

- [ ] **Step 4: Rileggere lo spec e spuntare la copertura**

Confrontare `docs/superpowers/specs/2026-09-08-configurazione-di-sistema-design.md`
con quanto implementato: tabella `system_config` con i due `CHECK` ✓, modulo
`lib/core/system-config/` con cache e fallback ✓, 4 valori pilota migrati ✓
(limite contatti, testo ritenzione audio, testo preavviso cancellazione,
trial AI Notes), pannello admin con azione `configuration_changed` ✓,
nessun "aggiungi variabile" dal pannello ✓, durata sessione esclusa per
intero come deciso ✓.

- [ ] **Step 5: Aggiornare lo stato dello spec**

In `docs/superpowers/specs/2026-09-08-configurazione-di-sistema-design.md`,
cambiare:

```
**Stato:** disegno approvato, da implementare
```

in:

```
**Stato:** implementato
```

- [ ] **Step 6: Commit**

```bash
git add docs/superpowers/specs/2026-09-08-configurazione-di-sistema-design.md
git commit -m "$(cat <<'EOF'
docs: segna come implementata la specifica sulla configurazione di sistema

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```
