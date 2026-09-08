# Configurazione di sistema (chiave/valore)

**Data:** 2026-09-08
**Stato:** disegno approvato, da implementare
**Dipendenze:** nessuna sui pacchetti (PR #71, branch/worktree separato). Ispirato a un
meccanismo analogo già esistente in un altro prodotto dell'utente (iPricer).

## Il problema

Diverse decisioni di business del prodotto sono oggi costanti scritte nel codice:
quanto dura una sessione se non specificato altrimenti, quanti giorni si conserva
l'audio di una seduta, quanto trial concede un admin per le AI Notes. Cambiarle
richiede un deploy. L'utente vuole spostarle in una tabella a database,
configurabile da un pannello admin — stesso concetto già usato in iPricer
(colonne Chiave/Valore JSON/Etichetta/Categoria/Descrizione/Pubblico/Aggiornato il).

Prima di disegnare qualunque schema, è stata fatta una ricognizione reale del
codice (non un elenco ipotetico) per trovare candidati concreti — vedi sotto.

## Ricognizione: candidati trovati nel codice

Elenco completo emerso dalla ricerca in `lib/core/` e `app/`, con citazione
`file:riga`. Non tutti entrano in questo giro (vedi "Cosa entra in questo giro"
più sotto) — l'elenco resta come riferimento per i giri successivi.

**Prenotazioni / cancellazione**
- `lib/core/sessions.ts:8` `REQUEST_RESPONSE_WINDOW_HOURS = 48`
- `lib/core/sessions.ts:21` `REQUEST_EXPIRY_GRACE_MINUTES = 10`
- `lib/core/sessions.ts:52` `VIDEO_JOIN_LEAD_MINUTES = 5`
- `lib/core/sessions.ts:112` `UPCOMING_GRACE_MINUTES = 15`
- `lib/core/sessions.ts:125` `HEARTBEAT_STALE_MINUTES = 5`
- `lib/core/legal/processors.ts:163` `CANCELLATION_NOTICE_HOURS = 24` — oggi solo
  mostrato nei Termini (`app/(marketplace)/terms/page.tsx:213`), non applicato
  da nessun controllo nel codice
- `lib/core/availability/validation.ts:25` `MAX_AVAILABILITY_SLOTS = 50`
- `lib/core/availability/validation.ts:27` `BOOKING_START_STEP_MINUTES = 10`
- `lib/core/services/validation.ts:6` `MAX_SERVICE_DURATION_MIN = 1440`
- `lib/core/bookings/duration.ts:16` `SESSION_DURATION_OPTIONS = [60,50,40,30,20,10]`
- **Duplicazione**: "sessione da 40 minuti" scritta 4 volte con 4 nomi diversi —
  `lib/core/sessions.ts:27` `FALLBACK_SESSION_DURATION_MIN`,
  `lib/core/services/validation.ts:7` `DEFAULT_SERVICE_DURATION_MIN`,
  `lib/core/bookings/duration.ts:21` `DEFAULT_SESSION_DURATION_MIN`,
  `lib/core/services/defaults.ts:11` (`DEFAULT_COACH_SERVICE.durationMin`)

**Videochiamata**
- `lib/core/admin/live-session-state.ts:26` `LIVE_SESSION_SILENCE_MS = 120000`
  (2 min) — soglia diversa da `HEARTBEAT_STALE_MINUTES` (5 min) sopra, per un
  giudizio concettualmente simile
- `lib/core/ai-session-notes/live-coverage.ts:30` `LIVE_GAP_SECONDS = 90`
- `lib/core/video/ring.ts:29` `RING_THROTTLE_MS = 60000`

**AI Notes**
- `app/(dashboard)/dashboard/admin/ai-notes/actions.ts:127` trial di 30 giorni
  concesso da un admin, scritto inline; ripetuto come testo ("Trial 30 gg") in
  `app/(dashboard)/dashboard/admin/ai-notes/page.tsx:146`
- `lib/core/legal/processors.ts:148` `AI_AUDIO_RETENTION_DAYS = 7` — dichiarato
  nella privacy policy, ma il valore *applicato davvero* viene da
  `AI_NOTES_AUDIO_RETENTION_DAYS` (env var, `lib/core/ai-session-notes/recording-config.ts:118-124`)
  — due fonti che possono disallinearsi silenziosamente
- `lib/core/ai-session-notes/journey-goals.ts:204` `GOAL_STALE_AFTER_SESSIONS = 2`
- `lib/core/ai-session-notes/recording-coverage.ts:25` `PARTIAL_COVERAGE_THRESHOLD = 0.9`
- `lib/core/ai-session-notes/compass-regenerate-retry.ts:21` `COMPASS_REGENERATE_MAX_ATTEMPTS = 3`

**Minori / legale**
- `lib/core/guardians/index.ts:38` `INVITATION_TTL_MS` (72 ore)
- `lib/core/legal/processors.ts:134` `INACTIVITY_MONTHS = 24`
- `lib/core/legal/processors.ts:137` `POST_CLOSURE_RETENTION_MONTHS = 36`
- `lib/core/legal/processors.ts:156` `TERMS_CHANGE_NOTICE_DAYS = 15`
- `lib/core/analytics-consent.ts:2` `ANALYTICS_CONSENT_MAX_AGE_SECONDS` (180 giorni)
- `lib/core/admin/overview.ts:330` età di maggiore età (18) riscritta in SQL
  invece di riusare `AGE_OF_MAJORITY` da `lib/core/guardians/age.ts:22`
- `lib/core/guardians/age.ts:19,22` `MIN_SIGNUP_AGE = 15`, `AGE_OF_MAJORITY = 18`
  — ancorate a norme di legge italiane, probabilmente NON vanno rese
  liberamente modificabili da un admin

**Notifiche**
- `lib/core/notifications/reminders.ts:32-33` lead time promemoria (24h e 1h)
- `lib/core/notifications/reminders.ts:42` `WINDOW_TOLERANCE_MINUTES = 35`

**Altro**
- `lib/core/listings/index.ts:322-329` formula di ranking "Consigliati"
  (peso recensioni/certificazione/video/ecc.)
- `app/api/mobile/sessions/route.ts:46` quanto indietro va la cronologia
  sessioni nell'app mobile (120 giorni)
- `lib/payments/stripe.ts:68` `trial_period_days: 14` (dormiente, billing non attivo)
- `lib/core/contact/index.ts:16` `MAX_PER_EMAIL_PER_HOUR = 3`

**Esclusi consapevolmente**: i template email (`email_templates` ha già un
sistema dedicato), i valori enum-like (stati, ruoli), le soglie puramente
tecniche/di resilienza (retry di code, TTL di URL firmati, timeout verso
provider esterni) — verificate una per una e confermate come infrastruttura,
non decisioni di business.

**Precedente interno degno di nota**: `lib/core/features/*` (limiti d'uso per
feature, `usageLimit`/`usageCount`) è già esattamente questo pattern, per un
altro dominio — un buon riferimento per la lettura via `lib/core`.

## Cosa entra in questo giro

Meccanismo generico + 4 valori pilota, scelti per essere i casi con più valore
reale (non i più semplici da spostare):

1. **Durata sessione predefinita** (`SESSION_DEFAULT_DURATION_MINUTES`, oggi 40) —
   unifica 3 dei 4 duplicati: `lib/core/services/validation.ts`,
   `lib/core/bookings/duration.ts`, `lib/core/services/defaults.ts` (tutti
   consumati lato server, o passabili come prop da un Server Component).
   `lib/core/sessions.ts`'s `FALLBACK_SESSION_DURATION_MIN` **resta invariata**:
   è dentro un modulo esplicitamente puro e condiviso client/server, usato
   per calcoli reattivi lato browser (es. "posso ancora entrare in
   chiamata?") — renderlo DB-backed richiederebbe un ridisegno (il valore
   dovrebbe arrivare come prop e propagarsi in ogni componente che oggi lo
   calcola da solo), sproporzionato per un fallback su dati vecchi/malformati
   raramente colpito. Decisione presa dopo aver letto il codice reale, non
   assunta in fase di spec.
2. **Ritenzione audio AI Notes, solo il testo della privacy policy**
   (`AI_NOTES_AUDIO_RETENTION_DAYS`, oggi 7) — **ridimensionato dopo aver
   letto il codice**: `getAudioRecordingConfig()` (che applica davvero la
   ritenzione) è sincrona ed è chiamata in 7+ punti della pipeline AI Notes,
   incluso un factory sincrono (`createProductionAiSessionNotesDependencies`)
   — renderla asincrona per un solo campo tocca la pipeline che il progetto
   documenta come la più fragile, dove ogni fallimento finora è nato da un
   cambiamento a un punto di giuntura come questo. Questo giro sposta a DB
   **solo** il numero mostrato nella privacy policy
   (`lib/core/legal/processors.ts:148`); l'enforcement vero resta sulla env
   var `AI_NOTES_AUDIO_RETENTION_DAYS` come oggi. Il rischio di
   disallineamento fra le due fonti **non è risolto**, solo ridotto (il
   numero mostrato può almeno essere corretto senza un deploy) — l'unione
   vera resta un lavoro a sé, con la sua analisi, quando si torna su quella
   pipeline con calma.
3. **Preavviso di cancellazione** (`CANCELLATION_NOTICE_HOURS`, oggi 24) —
   solo il numero si sposta a DB; il controllo che oggi non esiste nel codice
   resta un lavoro separato, fuori scope.
4. **Trial AI Notes concesso da un admin** (`AI_NOTES_ADMIN_TRIAL_DAYS`, oggi 30) —
   unifica il valore usato dalla server action e il testo del bottone.

Tutti gli altri candidati elencati sopra restano per un giro successivo.

## Lo schema

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
    createdDate: timestamp('createddate', { withTimezone: true }).notNull().defaultNow(),
    createdBy: integer('createdby').references(() => users.id, { onDelete: 'set null' }),
    updatedDate: timestamp('updateddate', { withTimezone: true }).notNull().defaultNow(),
    updatedBy: integer('updatedby').references(() => users.id, { onDelete: 'set null' }),
  },
  (table) => [
    check('system_config_value_type_check', sql`${table.valueType} in ('number', 'string', 'boolean')`),
    check('system_config_value_matches_type_check', sql`jsonb_typeof(${table.value}) = ${table.valueType}`),
  ]
);
```

Il secondo `CHECK` sfrutta il fatto che `jsonb_typeof()` di Postgres restituisce
esattamente le stringhe `'number'`/`'string'`/`'boolean'` — impedisce a livello
di database una riga con `valueType = 'number'` ma un valore JSON booleano o
stringa, senza bisogno di validarlo solo in TypeScript.

Niente colonna "Pubblico" (a differenza di iPricer): non c'è oggi un caso
d'uso di esporre questi valori fuori dal pannello admin. `key` è la chiave
primaria (stringa leggibile, es. `SESSION_DEFAULT_DURATION_MINUTES`), non un
id numerico — coerente con l'idea di "variabile con un nome", e rende le
migrazioni di seed leggibili senza dover prima leggere un id generato.

RLS abilitata, `REVOKE ALL` da `anon`/`authenticated` — stessa postura di
ogni altra tabella di quest'area (nessun client la legge direttamente, solo
il server dopo `requireRole('admin')` per la scrittura; la lettura per la
logica di business passa dall'helper qui sotto, lato server).

## Come lo legge il codice

`lib/core/config/index.ts` (nuovo modulo):

```ts
export async function getSystemConfigNumber(key: string, fallback: number): Promise<number>
export async function getSystemConfigString(key: string, fallback: string): Promise<string>
export async function getSystemConfigBoolean(key: string, fallback: boolean): Promise<boolean>
```

Ogni chiamata passa il valore hardcoded di oggi come `fallback`: se la riga
manca (prima del seed, o cancellata per errore) o il DB ha un problema
momentaneo, il chiamante ottiene lo stesso comportamento di oggi invece di un
errore. Una cache in-process con TTL di 60 secondi (una `Map` a livello di
modulo, chiave→{valore, scadenza}) evita una query ad ogni richiesta nei
percorsi più frequentati; un cambio dell'admin è visibile entro un minuto.

Questo modulo non è "puro" nel senso stretto usato altrove in `lib/core`
(fa I/O verso il database) — ma la logica di cache/scadenza sì, e viene
estratta e testata separatamente dalla parte che fa la query.

## Migrazione dei 4 valori pilota

Per ciascuno dei 4 casi: una riga seed in `system_config` (via migrazione),
poi il punto del codice che oggi usa la costante passa a
`getSystemConfigNumber('CHIAVE', valoreDiOggi)`. Il modulo con la costante
originale non viene necessariamente eliminato subito ovunque (es. i 4
duplicati della "durata 40 minuti" restano come nomi diversi nel codice fino
a che ogni punto non viene aggiornato) — dettaglio lasciato al piano di
implementazione, task per task.

Caso specifico — **ritenzione audio**: `lib/core/ai-session-notes/recording-config.ts`
**non viene toccato** in questo giro (vedi sopra, ridimensionato dopo la
lettura del codice). Solo `lib/core/legal/processors.ts:148`
(`AI_AUDIO_RETENTION_DAYS`, oggi una costante propria usata per il testo
della privacy policy) passa a leggere `getSystemConfigNumber('AI_NOTES_AUDIO_RETENTION_DAYS', 7)`.
La env var che applica davvero la ritenzione resta esattamente come oggi,
non viene letta da questo modulo, non viene toccata.

## Pannello admin

Pagina nuova, `/dashboard/admin/system-config`: un elenco (non una matrice
come i pacchetti — ogni riga è un valore indipendente, non una griglia).
Colonne: Chiave, Etichetta, Descrizione, Categoria, Valore. Un pulsante
"Modifica" per riga apre l'edit del solo valore (il controllo dipende da
`valueType`: input numerico, testo, o checkbox), con conferma prima di
salvare — stesso pattern (`ActionForm` con `confirmTitle`/`confirmMessage`)
già usato nel pannello pacchetti.

**Solo modifica dei valori esistenti — nessun "aggiungi variabile" dal
pannello.** Una nuova chiave la aggiunge uno sviluppatore con una migrazione
(seed), come già deciso per il catalogo funzionalità
(`docs/superpowers/specs/2026-09-07-matrice-funzionalita-piani-design.md`).
L'admin configura, non estende il catalogo.

## Audit

Ogni modifica passa da `recordAdminAudit` con l'azione `configuration_changed`
(già definita in `ADMIN_AUDIT_ACTIONS` dalla migrazione 0060, mai finora
emessa da nessuna azione reale — verificato con una ricerca nel codice) e
soggetto `configuration` (già presente in `ADMIN_AUDIT_SUBJECTS`). Nessuna
modifica allo schema di audit serve per questo lavoro.

## Cosa resta fuori, esplicitamente

- **Applicare davvero il preavviso di cancellazione.** Questo giro sposta solo
  il numero a DB; aggiungere il controllo che oggi non esiste nel codice
  (impedire o segnalare una cancellazione tardiva) è un lavoro a sé.
- **Gli altri ~15 candidati trovati nella ricognizione** (lead time promemoria,
  formula di ranking, soglie della pipeline AI Notes, ecc.) — restano
  candidati per un giro successivo, non decisi ora.
- **Nessuna colonna "Pubblico".**
- **Nessun modo di aggiungere una chiave dal pannello.**
- **`MIN_SIGNUP_AGE`/`AGE_OF_MAJORITY`** non entrano nemmeno come candidati
  futuri automatici: sono ancorati a norme di legge, non a una scelta di
  prodotto — un domani andrebbero discussi separatamente, non semplicemente
  aggiunti alla tabella.

## Rischi, detti prima

- **Una migrazione nuova** (schema `system_config` + seed dei 4 valori) —
  stesso rito delle precedenti: generare, leggere, mostrare, confermare,
  applicare. Additiva, nessun `DROP`.
- **La cache in-process** significa che un cambio dell'admin non è istantaneo
  (fino a 60 secondi di ritardo) — accettabile per valori di questo tipo
  (durate, giorni di ritenzione), da dire esplicitamente perché non è ovvio
  dal pannello.
- **La ritenzione audio resta disallineabile.** Il numero mostrato nella
  privacy policy ora viene da `system_config`; quello davvero applicato
  resta sulla env var. Le due fonti possono ancora divergere — questo giro
  riduce il rischio (il testo si corregge senza deploy) ma non lo elimina.
  L'unione vera è rimandata di proposito (vedi sopra).
