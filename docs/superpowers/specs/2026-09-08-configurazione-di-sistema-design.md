# Configurazione di sistema (chiave/valore)

**Data:** 2026-09-08
**Stato:** implementato
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

1. ~~Durata sessione predefinita~~ — **escluso per intero dopo aver letto il
   codice**. Non solo `lib/core/sessions.ts`'s `FALLBACK_SESSION_DURATION_MIN`
   (modulo puro condiviso client/server, calcoli reattivi lato browser): anche
   `lib/core/services/validation.ts`'s `DEFAULT_SERVICE_DURATION_MIN` è
   intrecciata in `lib/core/bookings/conflict-query.ts`'s
   `effectiveBookingDurationMin`, un frammento SQL costruito una volta al
   caricamento del modulo e riusato in **17+ punti** (`bookings/index.ts`,
   `availability/index.ts`, `messages/index.ts`, `admin/index.ts`,
   `email/booking-context.ts`); e `lib/core/bookings/duration.ts`'s
   `DEFAULT_SESSION_DURATION_MIN` è anch'essa usata dentro `useState` di
   componenti client interattivi (`new-appointment-button.tsx`,
   `booking-request.tsx`). Nessuno dei 4 duplicati ha un sottoinsieme pulito
   e a basso rischio per un pilota — l'intera unificazione è rimandata a un
   giro futuro con un vero ridisegno.

   **Sostituita da: limite email del form contatti**
   (`CONTACT_MAX_MESSAGES_PER_EMAIL_PER_HOUR`, oggi 3) —
   `lib/core/contact/index.ts:16` `MAX_PER_EMAIL_PER_HOUR`, una costante
   privata usata in un solo punto, dentro una funzione già server-only e
   già asincrona. Nessuna complicazione nascosta trovata.
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

Al posto della durata sessione, esclusa per intero (vedi sopra):

1bis. **Limite messaggi form contatti**
   (`CONTACT_MAX_MESSAGES_PER_EMAIL_PER_HOUR`, oggi 3) —
   `lib/core/contact/index.ts`'s `MAX_PER_EMAIL_PER_HOUR`, privata e usata in
   un solo punto, dentro `submitContactMessage` (già `async`, il file ha
   `import 'server-only'` in cima).

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
primaria (stringa leggibile, es. `CANCELLATION_NOTICE_HOURS`), non un
id numerico — coerente con l'idea di "variabile con un nome", e rende le
migrazioni di seed leggibili senza dover prima leggere un id generato.

RLS abilitata, `REVOKE ALL` da `anon`/`authenticated` — stessa postura di
ogni altra tabella di quest'area (nessun client la legge direttamente, solo
il server dopo `requireRole('admin')` per la scrittura; la lettura per la
logica di business passa dall'helper qui sotto, lato server).

## Come lo legge il codice

`lib/core/system-config/index.ts` (nuovo modulo):

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

## Correzione dopo la revisione finale: due valori tornano costanti fisse

La revisione finale sull'intero branch ha trovato che `AI_NOTES_AUDIO_RETENTION_DAYS`
e `CANCELLATION_NOTICE_HOURS` sono entrambi interpolati in
`lib/core/legal/processors.ts`, un file incluso di proposito nell'hash dei
contenuti legali (`scripts/generate-legal-hash.mjs`): cambiare uno di quei
numeri deve cambiare l'hash, e un hash diverso forza la ri-accettazione dei
Termini per gli utenti. Renderli modificabili da un pannello admin senza
deploy rompeva silenziosamente questa garanzia — un admin poteva cambiare
cosa dicono i Termini senza che nessuno fosse ri-invitato ad accettarli.

Decisione del titolare del prodotto: **tornano costanti fisse**, esattamente
come prima dei Task 5 e 6 di questo piano. Il meccanismo `system_config` in
sé, e gli altri due valori pilota (limite email contatti, trial AI Notes —
nessuno dei due è tracciato dall'hash legale), non sono toccati da questa
correzione. Il pilota di questo lavoro resta quindi a 2 valori reali, non 4.

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

## Secondo giro (2026-09-08): 11 candidati aggiuntivi, dopo aver riverificato tutti i 16 rimasti

Dei 16 candidati non ancora migrati dalla ricognizione originale, verificati
uno per uno leggendo il codice reale prima di scrivere qualunque task —
metà risultano avere lo stesso tipo di problema già incontrato nel primo
giro, l'altra metà sono puliti.

**Esclusi, con motivo verificato nel codice:**

- **I 5 di `lib/core/sessions.ts`** (`REQUEST_RESPONSE_WINDOW_HOURS`,
  `REQUEST_EXPIRY_GRACE_MINUTES`, `VIDEO_JOIN_LEAD_MINUTES`,
  `UPCOMING_GRACE_MINUTES`, `HEARTBEAT_STALE_MINUTES`) — usati dentro
  `canJoinVideoNow`/`isSessionUpcoming`, chiamate da componenti client
  (`components/calendar/booking-calendar.tsx`,
  `components/video-call-button.tsx`) per decisioni in tempo reale. Stesso
  problema della durata sessione già esclusa nel primo giro.
- **`INACTIVITY_MONTHS`, `POST_CLOSURE_RETENTION_MONTHS`,
  `TERMS_CHANGE_NOTICE_DAYS`** (`lib/core/legal/processors.ts`) — stesso
  file già causa del revert su ritenzione audio/preavviso cancellazione:
  incluso nell'hash dei contenuti legali, editabile da pannello romperebbe
  la garanzia di ri-accettazione dei Termini.
- **`MIN_SIGNUP_AGE`, `AGE_OF_MAJORITY`** (`lib/core/guardians/age.ts`) —
  ancorate a norme di legge italiane, non decisioni di prodotto.
- **`COMPASS_REGENERATE_MAX_ATTEMPTS`** — usata dentro un loop di retry in
  `components/session-compass-panel.tsx` (client).
- **`ANALYTICS_CONSENT_MAX_AGE_SECONDS`** — di fatto codice morto: il
  componente che gestisce davvero il cookie (`components/google-analytics.tsx`,
  client, `'use client'`) ha una propria costante locale duplicata
  (`ANALYTICS_COOKIE_MAX_AGE_SECONDS`, stesso valore) e non legge questa.
- **Formula di ranking "Consigliati"** (`lib/core/listings/index.ts`) —
  6-7 pesi numerici insieme, non un singolo valore. Rimandata: l'utente ha
  scelto di procedere solo con i candidati a valore singolo in questo giro.

**Entrano in questo giro, tutti verificati server-only, nessun chiamante
client della costante specifica:**

1. `AVAILABILITY_MAX_SLOTS` (oggi `MAX_AVAILABILITY_SLOTS`, 50) —
   `lib/core/availability/validation.ts:25`
2. `AVAILABILITY_BOOKING_START_STEP_MINUTES` (oggi
   `BOOKING_START_STEP_MINUTES`, 10) — `lib/core/availability/validation.ts:27`
3. `LIVE_SESSION_SILENCE_MINUTES` (oggi `LIVE_SESSION_SILENCE_MS = 2 * 60_000`,
   quindi 2 minuti — convertito in minuti per essere leggibile nel pannello,
   il codice moltiplica per 60\_000) — `lib/core/admin/live-session-state.ts:26`
4. `AI_NOTES_LIVE_GAP_SECONDS` (oggi `LIVE_GAP_SECONDS`, 90) —
   `lib/core/ai-session-notes/live-coverage.ts:30`. Il valore è calcolato
   server-side; i componenti client (`ai-session-notes-control.tsx`,
   `mobile/.../RecordingGapNotice.tsx`) ricevono solo il risultato, mai la
   soglia grezza.
5. `VIDEO_RING_THROTTLE_SECONDS` (oggi `RING_THROTTLE_MS = 60_000`, quindi
   60 secondi — convertito in secondi, il codice moltiplica per 1000) —
   `lib/core/video/ring.ts:29`
6. `AI_NOTES_GOAL_STALE_AFTER_SESSIONS` (oggi `GOAL_STALE_AFTER_SESSIONS`, 2) —
   `lib/core/ai-session-notes/journey-goals.ts:204`
7. `AI_NOTES_PARTIAL_COVERAGE_THRESHOLD` (oggi `PARTIAL_COVERAGE_THRESHOLD`,
   0.9 — un rapporto fra 0 e 1, non un conteggio) —
   `lib/core/ai-session-notes/recording-coverage.ts:25`. **Nota**: il
   pannello admin oggi ha `min={1}` su ogni campo numerico (aggiunto nel
   primo giro pensando solo a conteggi/limiti ≥ 1) — va tolto, perché
   bloccherebbe visivamente un valore come 0.9 pur senza impedirne il
   salvataggio reale (il form non usa la validazione nativa del browser).
   Il controllo vero resta lato server in `parseSystemConfigValue`
   (rifiuta solo valori ≤ 0, corretto per un rapporto).
8. `GUARDIAN_INVITATION_TTL_HOURS` (oggi `INVITATION_TTL_MS`, 72h —
   convertito in ore, il codice moltiplica per 3\_600\_000) —
   `lib/core/guardians/index.ts:38`
9. `NOTIFICATION_REMINDER_WINDOW_TOLERANCE_MINUTES` (oggi
   `WINDOW_TOLERANCE_MINUTES`, 35) — `lib/core/notifications/reminders.ts:42`.
   **Nota operativa**: deve restare ≥ dell'intervallo del cron dei
   promemoria, altrimenti una prenotazione può cadere fra due esecuzioni e
   non ricevere il promemoria — da scrivere nella descrizione mostrata nel
   pannello, non solo nel codice.
10. `NOTIFICATION_REMINDER_24H_LEAD_MINUTES` (oggi `24 * 60` dentro la
    mappa `WINDOWS`, quindi 1440) e
    `NOTIFICATION_REMINDER_1H_LEAD_MINUTES` (oggi `60`) —
    `lib/core/notifications/reminders.ts:32-33`
11. `MOBILE_SESSION_HISTORY_DAYS` (oggi `120 * 24 * 60 * 60 * 1000` ms,
    quindi 120 giorni — convertito in giorni, il codice moltiplica per
    86\_400\_000) — `app/api/mobile/sessions/route.ts:46`

12 chiavi totali (11 candidati, il decimo ne vale due). Stesso meccanismo
già esistente (`getSystemConfigNumber`, fallback obbligatorio, cache 60s) —
nessuna modifica allo schema `system_config` o al pannello admin oltre alla
rimozione del `min={1}` indiscriminato.
