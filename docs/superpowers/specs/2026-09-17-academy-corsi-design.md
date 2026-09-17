# Academy: corsi per i coach, gestiti dall'admin

**Data:** 2026-09-17
**Stato:** approvato, in implementazione
**Dipendenze:** nessuna migrazione in sospeso su cui appoggiarsi. Segue lo
stesso stile di `packages`/`features`/`system_config` (audit
`createddate`/`createdby`/`updateddate`/`updatedby`, `check` per gli stati
chiusi) e `storePrivateFile` per gli allegati.

## Il problema

La piattaforma deve erogare anche corsi di formazione, non solo sessioni di
coaching. Oggi non esiste alcun concetto di "corso" nello schema: serve una
struttura che un admin possa usare per costruire un corso a moduli (es.
"Mastery Level", 10 ore totali, modulo 1 "Pitch di carriera" 2 ore, modulo 2
"Tematiche & Sicurezza" 3 ore, ...), allegare materiali per modulo, e
assegnare il corso a coach specifici.

## Decisioni prese (2026-09-17, Alessandro)

| domanda | scelta |
|---|---|
| chi fruisce dei corsi | il coach (non l'atleta, non un pubblico misto in questa fase) |
| chi crea/configura i corsi | solo l'admin, da una nuova voce di menu "Academy" |
| iscrizione | nessuna auto-iscrizione: l'admin assegna il corso a un coach specifico |
| ore totali del corso | calcolate, sempre = somma delle ore dei moduli — nessun campo separato che possa disallinearsi |
| avanzamento | tracciato per modulo, dentro l'assegnazione (non solo "assegnato/non assegnato") |
| allegati per modulo | più di uno per modulo (slide + PDF di approfondimento, ecc.) |
| accesso agli allegati | privato, stesso pattern di `storePrivateFile`/`chat-attachments` — non un URL pubblico permanente |
| stati del corso | `draft` / `active` / `cancelled`; solo `active` è visibile al coach assegnato (oltre che all'admin, sempre) |
| chi segna un modulo completato | **solo l'admin**, in questa prima fase — non il coach che lo sta seguendo |
| dove compaiono i badge | icona di modulo completato sulla card del coach nel monitoraggio admin; icona di corso completato sul profilo pubblico del coach |
| appuntamento video coach↔coach per erogare un modulo | **fuori scope qui** — oggi `bookings` collega solo coach↔atleta; è un'estensione del nucleo booking/video, disegnata a parte in un secondo momento |

## Lo schema nuovo

Cinque tabelle additive:

```
academy_courses
  └─ academy_course_modules (course_id)
        └─ academy_module_attachments (module_id)
  └─ academy_course_assignments (course_id, user_id = coach)
        └─ academy_module_completions (assignment_id, module_id)
```

```ts
export const ACADEMY_COURSE_STATUSES = ['draft', 'active', 'cancelled'] as const;

export const academyCourses = pgTable('academy_courses', {
  id: serial('id').primaryKey(),
  title: varchar('title', { length: 200 }).notNull(),
  description: text('description'),
  status: varchar('status', { length: 20 }).notNull().default('draft'),
  createdDate: timestamp('createddate', { withTimezone: true }).notNull().defaultNow(),
  createdBy: integer('createdby').references(() => users.id, { onDelete: 'set null' }),
  updatedDate: timestamp('updateddate', { withTimezone: true }).notNull().defaultNow(),
  updatedBy: integer('updatedby').references(() => users.id, { onDelete: 'set null' }),
}, (table) => [
  check('academy_courses_status_check', sql`${table.status} in ('draft', 'active', 'cancelled')`),
]);

export const academyCourseModules = pgTable('academy_course_modules', {
  id: serial('id').primaryKey(),
  courseId: integer('course_id').notNull().references(() => academyCourses.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 200 }).notNull(),
  description: text('description'),
  hours: real('hours').notNull().default(0),
  sortOrder: integer('sort_order').notNull().default(0),
  createdDate: timestamp('createddate', { withTimezone: true }).notNull().defaultNow(),
  createdBy: integer('createdby').references(() => users.id, { onDelete: 'set null' }),
  updatedDate: timestamp('updateddate', { withTimezone: true }).notNull().defaultNow(),
  updatedBy: integer('updatedby').references(() => users.id, { onDelete: 'set null' }),
}, (table) => [
  index('academy_course_modules_course_idx').on(table.courseId, table.sortOrder),
  check('academy_course_modules_hours_check', sql`${table.hours} >= 0`),
]);

export const academyModuleAttachments = pgTable('academy_module_attachments', {
  id: serial('id').primaryKey(),
  moduleId: integer('module_id').notNull().references(() => academyCourseModules.id, { onDelete: 'cascade' }),
  fileName: varchar('file_name', { length: 255 }).notNull(),
  storageKey: text('storage_key').notNull(),
  contentType: varchar('content_type', { length: 100 }).notNull(),
  fileSizeBytes: integer('file_size_bytes').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  createdDate: timestamp('createddate', { withTimezone: true }).notNull().defaultNow(),
  createdBy: integer('createdby').references(() => users.id, { onDelete: 'set null' }),
}, (table) => [
  index('academy_module_attachments_module_idx').on(table.moduleId),
]);

export const ACADEMY_ASSIGNMENT_STATUSES = ['assigned', 'in_progress', 'completed'] as const;

export const academyCourseAssignments = pgTable('academy_course_assignments', {
  id: serial('id').primaryKey(),
  courseId: integer('course_id').notNull().references(() => academyCourses.id, { onDelete: 'cascade' }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  status: varchar('status', { length: 20 }).notNull().default('assigned'),
  assignedDate: timestamp('assigned_date', { withTimezone: true }).notNull().defaultNow(),
  assignedBy: integer('assigned_by').references(() => users.id, { onDelete: 'set null' }),
  completedDate: timestamp('completed_date', { withTimezone: true }),
}, (table) => [
  unique('academy_course_assignments_course_user_unique').on(table.courseId, table.userId),
  index('academy_course_assignments_user_idx').on(table.userId),
  check('academy_course_assignments_status_check', sql`${table.status} in ('assigned', 'in_progress', 'completed')`),
]);

export const academyModuleCompletions = pgTable('academy_module_completions', {
  id: serial('id').primaryKey(),
  assignmentId: integer('assignment_id').notNull().references(() => academyCourseAssignments.id, { onDelete: 'cascade' }),
  moduleId: integer('module_id').notNull().references(() => academyCourseModules.id, { onDelete: 'cascade' }),
  completedDate: timestamp('completed_date', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique('academy_module_completions_assignment_module_unique').on(table.assignmentId, table.moduleId),
]);
```

`admin_audit_events` si estende, non si duplica: `ADMIN_AUDIT_ACTIONS` prende
`academy_course_created`, `academy_course_status_changed`,
`academy_module_saved`, `academy_course_assigned`,
`academy_course_assignment_revoked`, `academy_module_completed`;
`ADMIN_AUDIT_SUBJECTS` prende `academy_course`.

## La logica in `lib/core/academy/`

Funzioni pure + orchestrazione server, stesso taglio di
`lib/core/features/packages.ts`:

- `listCourses`, `createCourse`, `updateCourseStatus`
- `listModules`, `createModule`, `updateModule` — `hours` validato >= 0;
  `createModule` su un corso con assegnazioni `completed` le riporta a
  `in_progress`, perché il nuovo modulo non è tra i completamenti registrati
- `courseTotalHours(modules)` — funzione pura, somma le ore; usata sia
  nell'admin sia (in futuro) nella vista coach
- `assignCourseToUser`, `revokeAssignment`
- `markModuleComplete` (solo admin) — scrive `academy_module_completions`, e
  se tutti i moduli del corso risultano completati porta l'assegnazione a
  `completed` con `completedDate`; altrimenti la porta a `in_progress` al
  primo modulo segnato
- `listAssignmentsForCourse` — per il monitoraggio admin: coach iscritti a
  un corso, il loro modulo corrente, quali moduli hanno completato
- `listAssignmentsForUser` — per la vista del coach: solo le proprie
  assegnazioni, con lo stesso dettaglio per modulo
- `listCompletedCourseBadges(userId)` — corsi con assegnazione `completed`
  per un coach, usato dal profilo pubblico

Ogni funzione con logica non banale (soprattutto `courseTotalHours` e il
calcolo dello stato dell'assegnazione da completamenti) ha il suo
`.test.ts` accanto, wired in `npm test`.

## Il pannello admin — `/dashboard/admin/academy`

Una pagina, due sezioni:

- **Configurazione**: lista corsi con stato e ore totali calcolate;
  creazione corso (titolo, descrizione) → nasce in `draft`; dettaglio corso
  con moduli (titolo, descrizione, ore, ordine) e cambio stato del corso;
  assegnazione corso a un coach (ricerca/selezione utente con ruolo coach).
- **Monitoraggio**: per ogni corso `active`, l'elenco dei coach assegnati
  come card — nome, modulo corrente, icona per ogni modulo completato,
  pulsante "segna modulo completato" (azione admin, scrive
  `markModuleComplete`). Quando l'ultimo modulo viene segnato,
  l'assegnazione passa a `completed` e la card lo riflette.

Voce di menu "Academy" nella `AdminNav`, tra "Pacchetti" e "Parametri di
sistema".

## Il tab del coach — `/dashboard/coach/academy`

Voce "Academy" nella `coach-nav` esistente. Mostra solo le assegnazioni
dell'utente corrente (`listAssignmentsForUser`): il/i corso/i assegnato/i,
l'elenco dei moduli con quali sono completati e quali no. Nessuna azione
del coach in questa fase — è una vista di sola lettura, dato che è l'admin a
segnare il completamento. Se il coach non ha corsi assegnati, uno stato
vuoto spiega che l'Academy è gestita dall'admin e non c'è ancora nulla da
seguire.

## Il badge sul profilo pubblico del coach

`app/(marketplace)/coaches/[slug]/page.tsx` mostra, tra le informazioni del
coach, un'icona per ogni corso con assegnazione `completed`
(`listCompletedCourseBadges`) — una forma leggera di certificazione visibile
agli atleti. Nessuna icona se non ci sono corsi completati (niente sezione
vuota).

Esplicitamente **fuori scope in questa prima implementazione**:

- Upload/servizio degli allegati (`academy_module_attachments` esiste nello
  schema; la UI di upload e la route autorizzata di download arrivano dopo).
- L'appuntamento video coach↔coach per erogare un modulo: oggi `bookings`
  collega solo coach↔atleta. È un'estensione del nucleo booking/video —
  nuovo tipo di prenotazione, disponibilità, sala video — che va disegnata
  a parte caricando le skill `booking-scheduling` e `realtime-video-calls`,
  non infilata qui come dettaglio. Finché non esiste, il completamento di
  un modulo resta una decisione manuale dell'admin.
- Il coach che segna da sé un modulo completato (per ora solo l'admin può).
- Revoca di un'assegnazione con conservazione della storia (`status`
  aggiuntivo tipo `revoked`): per ora si revoca cancellando la riga
  dell'assegnazione, che cascata sui completamenti. Se in futuro serve
  conservare la storia di una revoca, è una migrazione additiva separata.

## Cosa lo tiene in piedi (test)

| test | cosa fissa |
|---|---|
| `course-hours.test.ts` | `courseTotalHours` somma correttamente moduli con ore decimali (es. 1.5 + 2) e ignora moduli senza ore |
| `assignment-progress.test.ts` | `computeAssignmentStatus` (usata da `markModuleComplete` e da `createModule`) resta `assigned` a zero completamenti, passa a `in_progress` al primo modulo, a `completed` solo quando tutti i moduli attuali risultano completati, e torna a `in_progress` se l'insieme dei moduli cresce dopo un completamento |

## Rischi, detti prima

- **La migrazione tocca `admin_audit_events`**, che ha un trigger che
  rifiuta UPDATE/DELETE: estendere i due CHECK richiede drop + ricrea con
  la lista più lunga, additivo nella sostanza.
- **Nessun account admin di prova esiste in locale**: la UI si verifica con
  `npx tsc --noEmit`, `next build`, e render + screenshot con dati finti
  (vedi `verificare-ui-dietro-login`) — non con una sessione admin vera.
- **La migrazione gira contro il database di produzione** (non esiste
  staging): viene generata e mostrata prima di essere eseguita, ed eseguita
  solo dopo conferma esplicita.

## Cosa resta fuori

- L'appuntamento video coach↔coach (estensione del nucleo booking/video —
  spec separata).
- Il coach che segna da sé un modulo completato.
- Upload e download degli allegati.
- Corsi per atleti o pubblico misto.
- Iscrizione libera o legata a pacchetti/entitlement.
- Stato "revocato" con conservazione della storia sull'assegnazione.
