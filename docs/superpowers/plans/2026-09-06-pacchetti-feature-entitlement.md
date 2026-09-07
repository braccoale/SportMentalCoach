# Pacchetti come feature entitlement per organizzazione — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collegare un pacchetto (Starter/Academy/Elite, o quelli futuri) a un insieme di feature reali, assegnabile a un'organizzazione, con un pannello admin che decide quali feature appartengono a ciascun pacchetto.

**Architecture:** Tre tabelle additive (`packages`, `package_features`, `organization_packages`). La valutazione di accesso (`getFeatureAccess`) resta quella esistente per l'entitlement diretta dell'utente, e in più — solo se quella non basta — controlla a lettura se una delle organizzazioni dell'utente ha un pacchetto attivo che include la feature, riusando la stessa funzione pura `evaluateFeatureEntitlement` già testata. Nessuna riga viene sincronizzata: il pacchetto dell'organizzazione è l'unica fonte di verità.

**Tech Stack:** Next.js 15 / React 19, Drizzle ORM, PostgreSQL su Supabase, `node:test` via `tsx --test`.

**Spec di riferimento:** `docs/superpowers/specs/2026-09-06-pacchetti-feature-entitlement-design.md`

## Global Constraints

- **Il database di sviluppo è il database di produzione.** Nessuna migrazione va eseguita senza aver letto l'SQL generato e senza conferma esplicita dell'utente (skill `database-migrations`).
- **Migrazioni additive.** Nessun `DROP`/`DELETE` distruttivo; i vincoli `CHECK` si estendono con `DROP CONSTRAINT` + `ADD CONSTRAINT`, mai riscrivendo una migrazione già applicata.
- **Un solo pacchetto attivo (o sospeso) per organizzazione alla volta** — invariante mantenuta dal codice applicativo (le funzioni di scrittura chiudono la riga corrente prima di aprirne una nuova) e rinforzata da un indice unico parziale sul database per lo stato `active`.
- **Niente limiti d'uso a livello di pacchetto-organizzazione** — solo `active`/`expired`/`suspended`.
- **Niente Stripe, niente checkout self-serve, niente UI lato club/coach in questo piano.**
- **Ogni modulo puro (`lib/core/**/*.ts` senza `server-only`) ha il suo `.test.ts` accanto, wired in `npm test`.**
- **Ogni azione admin che scrive dati passa da `requireRole('admin')` nella action, `assertAdmin` nel modulo `lib/core`, e una riga in `admin_audit_events` via `recordAdminAudit`** — lo stesso schema già usato da `updateAiNotesEntitlementAction`.
- **Nessuna nuova UI legge `packages`/`package_features`/`organization_packages` lato client**: RLS abilitata, nessuna concessione a `anon`/`authenticated`, accesso solo dal server dopo il controllo di ruolo.

---

### Task 1: Schema — tre tabelle nuove ed estensione degli enum di audit

**Files:**
- Modify: `lib/db/schema.ts`
- Modify: `lib/core/admin/admin-audit-policy.ts`

**Interfaces:**
- Produces: `packages`, `packageFeatures`, `organizationPackages` (tabelle Drizzle), `PACKAGE_STATUSES`, `PackageStatus`, `ORGANIZATION_PACKAGE_STATUSES`, `OrganizationPackageStatus`, e i tipi `Package`/`NewPackage`/`PackageFeature`/`NewPackageFeature`/`OrganizationPackage`/`NewOrganizationPackage`. `ADMIN_AUDIT_ACTIONS` esteso con `package_created`, `package_features_updated`, `organization_package_assigned`, `organization_package_revoked`, `organization_member_added`. `ADMIN_AUDIT_SUBJECTS` esteso con `package`, `organization`.

- [ ] **Step 1: Aggiungere le tre tabelle in `lib/db/schema.ts`**

Inserire il blocco seguente subito **prima** della riga `export const AI_SESSION_NOTE_STATUSES = [` (la sezione che segue `userFeatureEntitlements`):

```ts
// ---------------------------------------------------------------------------
// Pacchetti: un pacchetto acquistato da un'organizzazione porta con sé un
// insieme di feature. Vedi
// docs/superpowers/specs/2026-09-06-pacchetti-feature-entitlement-design.md.
// ---------------------------------------------------------------------------

export const PACKAGE_STATUSES = ['active', 'archived'] as const;
export type PackageStatus = (typeof PACKAGE_STATUSES)[number];

export const packages = pgTable(
  'packages',
  {
    id: serial('id').primaryKey(),
    key: varchar('key', { length: 60 }).notNull(),
    name: varchar('name', { length: 120 }).notNull(),
    status: varchar('status', { length: 20 }).notNull().default('active'),
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
    unique('packages_key_unique').on(table.key),
    check(
      'packages_status_check',
      sql`${table.status} in ('active', 'archived')`
    ),
  ]
);

export const packageFeatures = pgTable(
  'package_features',
  {
    id: serial('id').primaryKey(),
    packageId: integer('package_id')
      .notNull()
      .references(() => packages.id, { onDelete: 'cascade' }),
    featureCode: varchar('feature_code', { length: 80 }).notNull(),
    createdDate: timestamp('createddate', { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdBy: integer('createdby').references(() => users.id, {
      onDelete: 'set null',
    }),
  },
  (table) => [
    unique('package_features_package_feature_unique').on(
      table.packageId,
      table.featureCode
    ),
  ]
);

export const ORGANIZATION_PACKAGE_STATUSES = [
  'active',
  'expired',
  'suspended',
] as const;
export type OrganizationPackageStatus =
  (typeof ORGANIZATION_PACKAGE_STATUSES)[number];

export const organizationPackages = pgTable(
  'organization_packages',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    packageId: integer('package_id')
      .notNull()
      .references(() => packages.id),
    status: varchar('status', { length: 20 }).notNull().default('active'),
    startsAt: timestamp('starts_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
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
    uniqueIndex('organization_packages_one_active_idx')
      .on(table.organizationId)
      .where(sql`${table.status} = 'active'`),
    index('organization_packages_org_status_idx').on(
      table.organizationId,
      table.status
    ),
    check(
      'organization_packages_status_check',
      sql`${table.status} in ('active', 'expired', 'suspended')`
    ),
    check(
      'organization_packages_window_check',
      sql`${table.expiresAt} is null or ${table.startsAt} is null or ${table.expiresAt} > ${table.startsAt}`
    ),
  ]
);

export type Package = typeof packages.$inferSelect;
export type NewPackage = typeof packages.$inferInsert;
export type PackageFeature = typeof packageFeatures.$inferSelect;
export type NewPackageFeature = typeof packageFeatures.$inferInsert;
export type OrganizationPackage = typeof organizationPackages.$inferSelect;
export type NewOrganizationPackage = typeof organizationPackages.$inferInsert;
```

`unique`, `check`, `uniqueIndex`, `index` e `sql` sono già importati in cima al file (usati da `userFeatureEntitlements` e `sessionAiNotes` poco sopra) — non serve aggiungere import.

- [ ] **Step 2: Estendere `ADMIN_AUDIT_ACTIONS` e `ADMIN_AUDIT_SUBJECTS`**

In `lib/db/schema.ts`, trovare:

```ts
export const ADMIN_AUDIT_ACTIONS = [
  'coach_approved',
  'coach_rejected',
  'coach_verification_changed',
  'user_role_changed',
  'ai_notes_entitlement_granted',
  'ai_notes_entitlement_revoked',
  'ai_notes_session_reopened',
  'ai_notes_worker_run',
  'ai_notes_guidelines_saved',
  'ai_notes_callback_probed',
  'sensitive_content_accessed',
  'data_exported',
  'data_deleted',
  'configuration_changed',
] as const;
```

e sostituirlo con:

```ts
export const ADMIN_AUDIT_ACTIONS = [
  'coach_approved',
  'coach_rejected',
  'coach_verification_changed',
  'user_role_changed',
  'ai_notes_entitlement_granted',
  'ai_notes_entitlement_revoked',
  'ai_notes_session_reopened',
  'ai_notes_worker_run',
  'ai_notes_guidelines_saved',
  'ai_notes_callback_probed',
  'sensitive_content_accessed',
  'data_exported',
  'data_deleted',
  'configuration_changed',
  'package_created',
  'package_features_updated',
  'organization_package_assigned',
  'organization_package_revoked',
  'organization_member_added',
] as const;
```

Poi trovare:

```ts
export const ADMIN_AUDIT_SUBJECTS = [
  'provider_profile',
  'user',
  'ai_session',
  'feature',
  'configuration',
  'system',
] as const;
```

e sostituirlo con:

```ts
export const ADMIN_AUDIT_SUBJECTS = [
  'provider_profile',
  'user',
  'ai_session',
  'feature',
  'configuration',
  'system',
  'package',
  'organization',
] as const;
```

Anche il `CHECK` inline sulla tabella `adminAuditEvents` (poco più sotto nello stesso file, dentro l'array del `pgTable('admin_audit_events', ...)`) referenzia questi due array via `sql` template — non va toccato a mano: Drizzle lo rigenera dal contenuto aggiornato di `ADMIN_AUDIT_ACTIONS`/`ADMIN_AUDIT_SUBJECTS` al prossimo `db:generate` (Task 2).

- [ ] **Step 3: Aggiungere le etichette mancanti in `lib/core/admin/admin-audit-policy.ts`**

`ADMIN_AUDIT_ACTION_LABEL` è tipizzato `Record<AdminAuditAction, string>`: senza le nuove chiavi il progetto non compila. Trovare:

```ts
export const ADMIN_AUDIT_ACTION_LABEL: Record<AdminAuditAction, string> = {
  coach_approved: 'Coach approvato',
  coach_rejected: 'Coach rifiutato',
  coach_verification_changed: 'Verifica coach modificata',
  user_role_changed: 'Ruolo modificato',
  ai_notes_entitlement_granted: 'Appunti AI abilitati',
  ai_notes_entitlement_revoked: 'Appunti AI revocati',
  ai_notes_session_reopened: 'Seduta AI ripresa',
  ai_notes_worker_run: 'Worker AI eseguito a mano',
  ai_notes_guidelines_saved: 'Linee guida salvate',
  ai_notes_callback_probed: 'Indirizzo di callback verificato',
  sensitive_content_accessed: 'Accesso eccezionale a contenuti',
  data_exported: 'Dati esportati',
  data_deleted: 'Dati cancellati',
  configuration_changed: 'Configurazione modificata',
};
```

e sostituirlo con:

```ts
export const ADMIN_AUDIT_ACTION_LABEL: Record<AdminAuditAction, string> = {
  coach_approved: 'Coach approvato',
  coach_rejected: 'Coach rifiutato',
  coach_verification_changed: 'Verifica coach modificata',
  user_role_changed: 'Ruolo modificato',
  ai_notes_entitlement_granted: 'Appunti AI abilitati',
  ai_notes_entitlement_revoked: 'Appunti AI revocati',
  ai_notes_session_reopened: 'Seduta AI ripresa',
  ai_notes_worker_run: 'Worker AI eseguito a mano',
  ai_notes_guidelines_saved: 'Linee guida salvate',
  ai_notes_callback_probed: 'Indirizzo di callback verificato',
  sensitive_content_accessed: 'Accesso eccezionale a contenuti',
  data_exported: 'Dati esportati',
  data_deleted: 'Dati cancellati',
  configuration_changed: 'Configurazione modificata',
  package_created: 'Pacchetto creato',
  package_features_updated: 'Feature del pacchetto aggiornate',
  organization_package_assigned: 'Pacchetto assegnato a organizzazione',
  organization_package_revoked: 'Pacchetto revocato a organizzazione',
  organization_member_added: 'Membro aggiunto a organizzazione',
};
```

- [ ] **Step 4: Verificare che il progetto compili**

Run: `npx tsc --noEmit`
Expected: nessun errore. Se `admin-audit-policy.test.ts` verifica l'esaustività della mappa (controllare l'esistenza del test), farlo girare:

Run: `npx tsx --test lib/core/admin/admin-audit-policy.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/db/schema.ts lib/core/admin/admin-audit-policy.ts
git commit -m "$(cat <<'EOF'
feat(db): schema per pacchetti e assegnazione a organizzazione

Tre tabelle additive (packages, package_features, organization_packages)
e l'estensione degli enum di admin_audit_events per tracciare le nuove
azioni amministrative. Nessuna migrazione ancora eseguita.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Migrazione — generare, rivedere, applicare (checkpoint umano)

**Files:**
- Create: `lib/db/migrations/00NN_pacchetti-organizzazioni.sql` (il numero esatto lo assegna `drizzle-kit`)
- Modify: `lib/db/migrations/meta/_journal.json` (scritto automaticamente da `drizzle-kit generate`)

**Interfaces:**
- Consumes: lo schema di Task 1.
- Produces: le tre tabelle e i due `CHECK` estesi, effettivamente presenti sul database.

> **Non c'è staging.** `.env.local`, Preview e Production Vercel puntano allo stesso progetto Supabase. Non eseguire `npm run db:migrate` senza aver mostrato l'SQL generato e ottenuto conferma esplicita.

- [ ] **Step 1: Generare la migrazione**

Run: `npx drizzle-kit generate --name=pacchetti-organizzazioni`
Expected: un nuovo file `lib/db/migrations/00NN_pacchetti-organizzazioni.sql` e una nuova voce in `lib/db/migrations/meta/_journal.json` con `"tag": "00NN_pacchetti-organizzazioni"`.

- [ ] **Step 2: Leggere l'SQL generato riga per riga**

Aprire il file appena creato. Deve contenere **solo**:
- tre `CREATE TABLE` (`packages`, `package_features`, `organization_packages`) con le rispettive `PRIMARY KEY`, `FOREIGN KEY`, `UNIQUE`, `CHECK` e i due indici (`organization_packages_one_active_idx` parziale, `organization_packages_org_status_idx`);
- due blocchi `ALTER TABLE "admin_audit_events" DROP CONSTRAINT ... ADD CONSTRAINT ...` per `admin_audit_events_action_check` e `admin_audit_events_subject_type_check`.

Se invece l'SQL contiene un `DROP TABLE`/`CREATE TABLE` per `admin_audit_events` (ricreazione anziché `ALTER`), **fermarsi**: non eseguire nulla e segnalarlo — vorrebbe dire che drizzle-kit non ha riconosciuto la modifica del `CHECK` come additiva, e la migrazione va scritta a mano per quella parte (drop+add del solo vincolo, come in `lib/db/migrations/0031_ai-session-notes-client-grants-hardening.sql` per lo stile di riferimento).

- [ ] **Step 3: Aggiungere manualmente il commento, le concessioni e la RLS**

In cima al file generato, aggiungere:

```sql
-- Pacchetti: un pacchetto acquistato da un'organizzazione porta con sé un
-- insieme di feature reali (vedi docs/superpowers/specs/2026-09-06-pacchetti-feature-entitlement-design.md).
--
-- Nessun client legge queste tabelle direttamente: la valutazione delle
-- feature (`lib/core/features`) e il pannello admin (`/dashboard/admin/packages`)
-- passano sempre dal server, dopo `requireRole('admin')` o come parte del
-- calcolo a lettura di `getFeatureAccess`. Stessa postura di
-- `admin_audit_events` (migrazione 0060): RLS abilitata, nessuna concessione
-- a `anon`/`authenticated`.
```

In fondo al file (dopo l'ultimo statement generato), aggiungere:

```sql
REVOKE ALL ON "public"."packages" FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON "public"."package_features" FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON "public"."organization_packages" FROM anon, authenticated;--> statement-breakpoint

REVOKE ALL ON SEQUENCE "public"."packages_id_seq" FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON SEQUENCE "public"."package_features_id_seq" FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON SEQUENCE "public"."organization_packages_id_seq" FROM anon, authenticated;--> statement-breakpoint

ALTER TABLE "packages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "package_features" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "organization_packages" ENABLE ROW LEVEL SECURITY;
```

(Il separatore `--> statement-breakpoint` è quello che drizzle-kit usa già nel resto del file generato — mantenerlo fra ogni statement tranne l'ultimo.)

- [ ] **Step 4: Mostrare l'SQL finale e ottenere conferma**

Incollare il contenuto completo del file nella conversazione e chiedere esplicitamente conferma prima di procedere allo Step 5. Non proseguire senza una risposta affermativa.

- [ ] **Step 5: Applicare la migrazione**

Solo dopo la conferma. Run: `npm run db:migrate`
Expected: log di drizzle-kit che conferma l'applicazione della nuova migrazione, nessun errore.

- [ ] **Step 6: Verificare lo schema con un tipo generato**

Run: `npx tsc --noEmit`
Expected: nessun errore (conferma che i tipi Drizzle di Task 1 corrispondono a tabelle davvero esistenti).

- [ ] **Step 7: Commit**

```bash
git add lib/db/migrations
git commit -m "$(cat <<'EOF'
feat(db): applica la migrazione per pacchetti e organizzazioni

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Modulo puro — snapshot di entitlement da un pacchetto-organizzazione

**Files:**
- Create: `lib/core/features/organization-grant.ts`
- Test: `lib/core/features/organization-grant.test.ts`
- Modify: `package.json` (script `test`)

**Interfaces:**
- Consumes: `type FeatureEntitlementSnapshot` e `evaluateFeatureEntitlement` da `./policy`; `type OrganizationPackageStatus` da `@/lib/db/schema` (import di solo tipo, nessuna dipendenza a runtime dal database).
- Produces: `buildOrganizationFeatureSnapshot(params): FeatureEntitlementSnapshot | null`, usata da Task 4.

- [ ] **Step 1: Scrivere i test (falliscono: il modulo non esiste ancora)**

Creare `lib/core/features/organization-grant.test.ts`:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { buildOrganizationFeatureSnapshot } from './organization-grant';
import { evaluateFeatureEntitlement } from './policy';

test('no organization package means no grant', () => {
  const snapshot = buildOrganizationFeatureSnapshot({
    organizationPackage: null,
    packageFeatureCodes: ['AI_SESSION_NOTES'],
    featureCode: 'AI_SESSION_NOTES',
  });
  assert.equal(snapshot, null);
});

test('a package that does not include the feature grants nothing', () => {
  const snapshot = buildOrganizationFeatureSnapshot({
    organizationPackage: { status: 'active', startsAt: null, expiresAt: null },
    packageFeatureCodes: ['SOME_OTHER_FEATURE'],
    featureCode: 'AI_SESSION_NOTES',
  });
  assert.equal(snapshot, null);
});

test('an active package including the feature grants an enabled entitlement', () => {
  const snapshot = buildOrganizationFeatureSnapshot({
    organizationPackage: { status: 'active', startsAt: null, expiresAt: null },
    packageFeatureCodes: ['AI_SESSION_NOTES'],
    featureCode: 'AI_SESSION_NOTES',
  });
  assert.deepEqual(snapshot, {
    status: 'enabled',
    source: 'subscription',
    startsAt: null,
    expiresAt: null,
    usageLimit: null,
    usageCount: 0,
  });
  assert.equal(evaluateFeatureEntitlement(snapshot, new Date()).allowed, true);
});

test('a suspended package denies access with the suspended reason', () => {
  const snapshot = buildOrganizationFeatureSnapshot({
    organizationPackage: {
      status: 'suspended',
      startsAt: null,
      expiresAt: null,
    },
    packageFeatureCodes: ['AI_SESSION_NOTES'],
    featureCode: 'AI_SESSION_NOTES',
  });
  const result = evaluateFeatureEntitlement(snapshot, new Date());
  assert.equal(result.allowed, false);
  assert.equal(result.reason, 'suspended');
});

test('an active package past its expiry date still denies access', () => {
  const now = new Date('2026-09-06T00:00:00.000Z');
  const snapshot = buildOrganizationFeatureSnapshot({
    organizationPackage: {
      status: 'active',
      startsAt: null,
      expiresAt: new Date('2026-09-01T00:00:00.000Z'),
    },
    packageFeatureCodes: ['AI_SESSION_NOTES'],
    featureCode: 'AI_SESSION_NOTES',
  });
  const result = evaluateFeatureEntitlement(snapshot, now);
  assert.equal(result.allowed, false);
  assert.equal(result.reason, 'expired');
});
```

- [ ] **Step 2: Eseguire i test e verificare che falliscano**

Run: `npx tsx --test lib/core/features/organization-grant.test.ts`
Expected: FAIL — `Cannot find module './organization-grant'`.

- [ ] **Step 3: Implementare il modulo**

Creare `lib/core/features/organization-grant.ts`:

```ts
import type { OrganizationPackageStatus } from '@/lib/db/schema';
import type { FeatureEntitlementSnapshot } from './policy';

const ORG_PACKAGE_STATUS_TO_ENTITLEMENT_STATUS: Record<
  OrganizationPackageStatus,
  FeatureEntitlementSnapshot['status']
> = {
  active: 'enabled',
  suspended: 'suspended',
  expired: 'expired',
};

/**
 * Traveste la riga corrente di `organization_packages` da entitlement, così
 * la stessa `evaluateFeatureEntitlement` che decide per un'entitlement
 * diretta decide anche qui — la regola su scadenze e stati resta scritta
 * una volta sola.
 */
export function buildOrganizationFeatureSnapshot(params: {
  organizationPackage: {
    status: OrganizationPackageStatus;
    startsAt: Date | null;
    expiresAt: Date | null;
  } | null;
  packageFeatureCodes: readonly string[];
  featureCode: string;
}): FeatureEntitlementSnapshot | null {
  if (!params.organizationPackage) return null;
  if (!params.packageFeatureCodes.includes(params.featureCode)) return null;

  return {
    status:
      ORG_PACKAGE_STATUS_TO_ENTITLEMENT_STATUS[
        params.organizationPackage.status
      ],
    source: 'subscription',
    startsAt: params.organizationPackage.startsAt,
    expiresAt: params.organizationPackage.expiresAt,
    usageLimit: null,
    usageCount: 0,
  };
}
```

- [ ] **Step 4: Eseguire i test e verificare che passino**

Run: `npx tsx --test lib/core/features/organization-grant.test.ts`
Expected: PASS (5/5).

- [ ] **Step 5: Aggiungere il test a `npm test`**

In `package.json`, nello script `"test"`, trovare la sottostringa:

```
lib/core/features/policy.test.ts lib/core/ai-session-notes/state-machine.test.ts
```

e sostituirla con:

```
lib/core/features/policy.test.ts lib/core/features/organization-grant.test.ts lib/core/ai-session-notes/state-machine.test.ts
```

- [ ] **Step 6: Eseguire l'intera suite**

Run: `npm test`
Expected: PASS, nessuna regressione.

- [ ] **Step 7: Commit**

```bash
git add lib/core/features/organization-grant.ts lib/core/features/organization-grant.test.ts package.json
git commit -m "$(cat <<'EOF'
feat(features): snapshot di entitlement da un pacchetto-organizzazione

Modulo puro che traduce lo stato di organization_packages nello stesso
formato valutato da evaluateFeatureEntitlement, così la regola su
scadenze e stati non si duplica.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Estendere `getFeatureAccess` con il pacchetto dell'organizzazione

**Files:**
- Modify: `lib/core/features/index.ts`

**Interfaces:**
- Consumes: `buildOrganizationFeatureSnapshot` da `./organization-grant` (Task 3); tabelle `organizationPackages`, `packageFeatures`, `teamMembers` da `@/lib/db/schema`.
- Produces: `getFeatureAccess` con lo stesso tipo di ritorno di oggi (`Promise<FeatureAccessResult>`), ma che ora considera anche i pacchetti-organizzazione. `assertAdmin` diventa esportata, per essere riusata da Task 5 e Task 6.

- [ ] **Step 1: Esportare `assertAdmin`**

In `lib/core/features/index.ts`, trovare:

```ts
async function assertAdmin(actorUserId: number): Promise<void> {
```

e sostituirlo con:

```ts
export async function assertAdmin(actorUserId: number): Promise<void> {
```

- [ ] **Step 2: Estendere gli import**

Trovare:

```ts
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  profiles,
  sessionAiAuditEvents,
  userFeatureEntitlements,
  userRoles,
  users,
  type FeatureEntitlementSource,
  type FeatureEntitlementStatus,
} from '@/lib/db/schema';
import {
  evaluateFeatureEntitlement,
  type FeatureAccessResult,
  type FeatureCode,
} from './policy';
```

e sostituirlo con:

```ts
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  organizationPackages,
  packageFeatures,
  profiles,
  sessionAiAuditEvents,
  teamMembers,
  userFeatureEntitlements,
  userRoles,
  users,
  type FeatureEntitlementSource,
  type FeatureEntitlementStatus,
  type OrganizationPackageStatus,
} from '@/lib/db/schema';
import {
  evaluateFeatureEntitlement,
  type FeatureAccessResult,
  type FeatureCode,
  type FeatureEntitlementSnapshot,
} from './policy';
import { buildOrganizationFeatureSnapshot } from './organization-grant';
```

- [ ] **Step 3: Aggiungere il caricamento del pacchetto-organizzazione e comporlo in `getFeatureAccess`**

Trovare la funzione esistente:

```ts
export async function getFeatureAccess(
  userId: number,
  featureCode: FeatureCode,
  now = new Date()
): Promise<FeatureAccessResult> {
  const [entitlement] = await db
    .select({
      id: userFeatureEntitlements.id,
      status: userFeatureEntitlements.status,
      source: userFeatureEntitlements.source,
      startsAt: userFeatureEntitlements.startsAt,
      expiresAt: userFeatureEntitlements.expiresAt,
      usageLimit: userFeatureEntitlements.usageLimit,
      usageCount: userFeatureEntitlements.usageCount,
    })
    .from(userFeatureEntitlements)
    .where(
      and(
        eq(userFeatureEntitlements.userId, userId),
        eq(userFeatureEntitlements.featureCode, featureCode)
      )
    )
    .limit(1);

  return evaluateFeatureEntitlement(
    entitlement
      ? {
          ...entitlement,
          status: entitlement.status as FeatureEntitlementStatus,
          source: entitlement.source as FeatureEntitlementSource,
        }
      : null,
    now
  );
}
```

e sostituirla con:

```ts
async function loadOrganizationFeatureGrant(
  userId: number,
  featureCode: FeatureCode
): Promise<FeatureEntitlementSnapshot | null> {
  const [row] = await db
    .select({
      status: organizationPackages.status,
      startsAt: organizationPackages.startsAt,
      expiresAt: organizationPackages.expiresAt,
      featureCode: packageFeatures.featureCode,
    })
    .from(teamMembers)
    .innerJoin(
      organizationPackages,
      eq(organizationPackages.organizationId, teamMembers.teamId)
    )
    .innerJoin(
      packageFeatures,
      and(
        eq(packageFeatures.packageId, organizationPackages.packageId),
        eq(packageFeatures.featureCode, featureCode)
      )
    )
    .where(
      and(
        eq(teamMembers.userId, userId),
        inArray(organizationPackages.status, ['active', 'suspended'])
      )
    )
    .orderBy(asc(organizationPackages.organizationId))
    .limit(1);

  if (!row) return null;

  return buildOrganizationFeatureSnapshot({
    organizationPackage: {
      status: row.status as OrganizationPackageStatus,
      startsAt: row.startsAt,
      expiresAt: row.expiresAt,
    },
    packageFeatureCodes: [row.featureCode],
    featureCode,
  });
}

export async function getFeatureAccess(
  userId: number,
  featureCode: FeatureCode,
  now = new Date()
): Promise<FeatureAccessResult> {
  const [entitlement] = await db
    .select({
      id: userFeatureEntitlements.id,
      status: userFeatureEntitlements.status,
      source: userFeatureEntitlements.source,
      startsAt: userFeatureEntitlements.startsAt,
      expiresAt: userFeatureEntitlements.expiresAt,
      usageLimit: userFeatureEntitlements.usageLimit,
      usageCount: userFeatureEntitlements.usageCount,
    })
    .from(userFeatureEntitlements)
    .where(
      and(
        eq(userFeatureEntitlements.userId, userId),
        eq(userFeatureEntitlements.featureCode, featureCode)
      )
    )
    .limit(1);

  const directResult = evaluateFeatureEntitlement(
    entitlement
      ? {
          ...entitlement,
          status: entitlement.status as FeatureEntitlementStatus,
          source: entitlement.source as FeatureEntitlementSource,
        }
      : null,
    now
  );
  if (directResult.allowed) return directResult;

  const organizationGrant = await loadOrganizationFeatureGrant(
    userId,
    featureCode
  );
  if (organizationGrant) {
    const organizationResult = evaluateFeatureEntitlement(
      organizationGrant,
      now
    );
    if (organizationResult.allowed) return organizationResult;
  }

  return directResult;
}
```

- [ ] **Step 4: Verificare che compili**

Run: `npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 5: Verificare che la suite esistente passi ancora**

Run: `npx tsx --test lib/core/features/policy.test.ts lib/core/features/organization-grant.test.ts`
Expected: PASS. (`getFeatureAccess` tocca il database e non ha un test diretto in questo repo, coerente con lo stato attuale — `lib/core/features/index.ts` non compare in `npm test` neanche oggi.)

- [ ] **Step 6: Commit**

```bash
git add lib/core/features/index.ts
git commit -m "$(cat <<'EOF'
feat(features): getFeatureAccess considera anche il pacchetto dell'organizzazione

L'entitlement diretta resta la prima verifica; se non basta, si guarda
se una delle organizzazioni dell'utente ha un pacchetto attivo o
sospeso che include la feature. Nessuna riga sincronizzata: il
pacchetto dell'organizzazione resta l'unica fonte di verità.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Gestione pacchetti — CRUD e assegnazione a organizzazione

**Files:**
- Create: `lib/core/features/packages.ts`

**Interfaces:**
- Consumes: `assertAdmin` da `./index` (Task 4); `FEATURE_CODES`, `type FeatureCode` da `./policy`.
- Produces: `listPackages`, `createPackage`, `setPackageFeatures`, `assignPackageToOrganization`, `revokeOrganizationPackage`, `listOrganizationsForPackage` — consumate da Task 7 (pannello admin).

- [ ] **Step 1: Creare `lib/core/features/packages.ts`**

```ts
import 'server-only';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  organizationPackages,
  organizations,
  packageFeatures,
  packages,
  type OrganizationPackageStatus,
  type Package,
  type PackageStatus,
} from '@/lib/db/schema';
import { assertAdmin } from './index';
import type { FeatureCode } from './policy';

export type PackageWithFeatures = {
  id: number;
  key: string;
  name: string;
  status: PackageStatus;
  featureCodes: FeatureCode[];
};

/** Tutti i pacchetti, con le feature che ciascuno include. */
export async function listPackages(
  actorUserId: number
): Promise<PackageWithFeatures[]> {
  await assertAdmin(actorUserId);
  const rows = await db
    .select({
      id: packages.id,
      key: packages.key,
      name: packages.name,
      status: packages.status,
      featureCode: packageFeatures.featureCode,
    })
    .from(packages)
    .leftJoin(packageFeatures, eq(packageFeatures.packageId, packages.id))
    .orderBy(packages.id);

  const byId = new Map<number, PackageWithFeatures>();
  for (const row of rows) {
    let entry = byId.get(row.id);
    if (!entry) {
      entry = {
        id: row.id,
        key: row.key,
        name: row.name,
        status: row.status as PackageStatus,
        featureCodes: [],
      };
      byId.set(row.id, entry);
    }
    if (row.featureCode) entry.featureCodes.push(row.featureCode as FeatureCode);
  }
  return [...byId.values()];
}

export async function createPackage(params: {
  actorUserId: number;
  key: string;
  name: string;
}): Promise<Package> {
  await assertAdmin(params.actorUserId);
  const [created] = await db
    .insert(packages)
    .values({
      key: params.key,
      name: params.name,
      createdBy: params.actorUserId,
      updatedBy: params.actorUserId,
    })
    .returning();
  return created;
}

/** Sostituisce l'intero insieme di feature di un pacchetto. */
export async function setPackageFeatures(params: {
  actorUserId: number;
  packageId: number;
  featureCodes: FeatureCode[];
}): Promise<void> {
  await assertAdmin(params.actorUserId);
  await db.transaction(async (tx) => {
    await tx
      .delete(packageFeatures)
      .where(eq(packageFeatures.packageId, params.packageId));
    if (params.featureCodes.length > 0) {
      await tx.insert(packageFeatures).values(
        params.featureCodes.map((featureCode) => ({
          packageId: params.packageId,
          featureCode,
          createdBy: params.actorUserId,
        }))
      );
    }
  });
}

/**
 * Assegna un pacchetto a un'organizzazione. Chiude la riga corrente
 * (`active`/`suspended`) prima di aprirne una nuova, così l'indice unico
 * parziale su `status = 'active'` non viene mai violato e la storia dei
 * pacchetti precedenti resta leggibile.
 */
export async function assignPackageToOrganization(params: {
  actorUserId: number;
  organizationId: number;
  packageId: number;
  startsAt?: Date | null;
  expiresAt?: Date | null;
}): Promise<void> {
  await assertAdmin(params.actorUserId);
  await db.transaction(async (tx) => {
    await tx
      .update(organizationPackages)
      .set({
        status: 'expired',
        updatedDate: new Date(),
        updatedBy: params.actorUserId,
      })
      .where(
        and(
          eq(organizationPackages.organizationId, params.organizationId),
          inArray(organizationPackages.status, ['active', 'suspended'])
        )
      );
    await tx.insert(organizationPackages).values({
      organizationId: params.organizationId,
      packageId: params.packageId,
      status: 'active',
      startsAt: params.startsAt ?? null,
      expiresAt: params.expiresAt ?? null,
      createdBy: params.actorUserId,
      updatedBy: params.actorUserId,
    });
  });
}

/**
 * Revoca il pacchetto corrente di un'organizzazione (`active` o `suspended`
 * → `expired`). `false` se l'organizzazione non aveva un pacchetto corrente
 * da revocare.
 */
export async function revokeOrganizationPackage(params: {
  actorUserId: number;
  organizationId: number;
}): Promise<boolean> {
  await assertAdmin(params.actorUserId);
  const [updated] = await db
    .update(organizationPackages)
    .set({
      status: 'expired',
      updatedDate: new Date(),
      updatedBy: params.actorUserId,
    })
    .where(
      and(
        eq(organizationPackages.organizationId, params.organizationId),
        inArray(organizationPackages.status, ['active', 'suspended'])
      )
    )
    .returning({ id: organizationPackages.id });
  return Boolean(updated);
}

export type OrganizationPackageRow = {
  organizationId: number;
  organizationName: string;
  status: OrganizationPackageStatus;
  startsAt: Date | null;
  expiresAt: Date | null;
};

/** Le organizzazioni che hanno (o hanno avuto) questo pacchetto. */
export async function listOrganizationsForPackage(
  actorUserId: number,
  packageId: number
): Promise<OrganizationPackageRow[]> {
  await assertAdmin(actorUserId);
  const rows = await db
    .select({
      organizationId: organizationPackages.organizationId,
      organizationName: organizations.name,
      status: organizationPackages.status,
      startsAt: organizationPackages.startsAt,
      expiresAt: organizationPackages.expiresAt,
    })
    .from(organizationPackages)
    .innerJoin(
      organizations,
      eq(organizations.id, organizationPackages.organizationId)
    )
    .where(eq(organizationPackages.packageId, packageId))
    .orderBy(desc(organizationPackages.updatedDate));
  return rows.map((row) => ({
    ...row,
    status: row.status as OrganizationPackageStatus,
  }));
}
```

- [ ] **Step 2: Verificare che compili**

Run: `npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 3: Commit**

```bash
git add lib/core/features/packages.ts
git commit -m "$(cat <<'EOF'
feat(features): CRUD pacchetti e assegnazione a organizzazione

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Organizzazioni — ricerca, membri, aggiunta membro

**Files:**
- Create: `lib/core/organizations/index.ts`

**Interfaces:**
- Consumes: `assertAdmin` da `@/lib/core/features` (Task 4).
- Produces: `searchOrganizations`, `listOrganizationMembers`, `addOrganizationMember`, `findUserByEmail` — consumate da Task 7.

- [ ] **Step 1: Creare `lib/core/organizations/index.ts`**

```ts
import 'server-only';
import { and, eq, ilike, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { organizations, teamMembers, users, type NewTeamMember } from '@/lib/db/schema';
import { assertAdmin } from '@/lib/core/features';

export type OrganizationSearchResult = {
  id: number;
  name: string;
  memberCount: number;
};

/** Organizzazioni il cui nome contiene `query` (case-insensitive). */
export async function searchOrganizations(
  actorUserId: number,
  query: string
): Promise<OrganizationSearchResult[]> {
  await assertAdmin(actorUserId);
  const trimmed = query.trim();
  const rows = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      memberCount: sql<number>`count(${teamMembers.id})::int`,
    })
    .from(organizations)
    .leftJoin(teamMembers, eq(teamMembers.teamId, organizations.id))
    .where(trimmed ? ilike(organizations.name, `%${trimmed}%`) : undefined)
    .groupBy(organizations.id)
    .orderBy(organizations.name)
    .limit(20);
  return rows;
}

export type OrganizationMember = {
  userId: number;
  email: string;
  displayName: string;
  role: string;
};

export async function listOrganizationMembers(
  actorUserId: number,
  organizationId: number
): Promise<OrganizationMember[]> {
  await assertAdmin(actorUserId);
  const rows = await db
    .select({
      userId: users.id,
      email: users.email,
      name: users.name,
      lastName: users.lastName,
      role: teamMembers.role,
    })
    .from(teamMembers)
    .innerJoin(users, eq(users.id, teamMembers.userId))
    .where(eq(teamMembers.teamId, organizationId));
  return rows.map((row) => ({
    userId: row.userId,
    email: row.email,
    displayName: [row.name, row.lastName].filter(Boolean).join(' ') || row.email,
    role: row.role,
  }));
}

/** `null` se nessun utente ha questa email — l'azione chiamante decide il messaggio. */
export async function findUserByEmail(
  actorUserId: number,
  email: string
): Promise<{ id: number; email: string } | null> {
  await assertAdmin(actorUserId);
  const [found] = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.email, email.trim().toLowerCase()))
    .limit(1);
  return found ?? null;
}

/** Idempotente: aggiungere due volte lo stesso membro non crea righe doppie. */
export async function addOrganizationMember(params: {
  actorUserId: number;
  organizationId: number;
  userId: number;
  role?: string;
}): Promise<void> {
  await assertAdmin(params.actorUserId);
  const [existing] = await db
    .select({ id: teamMembers.id })
    .from(teamMembers)
    .where(
      and(
        eq(teamMembers.userId, params.userId),
        eq(teamMembers.teamId, params.organizationId)
      )
    )
    .limit(1);
  if (existing) return;

  const newMember: NewTeamMember = {
    userId: params.userId,
    teamId: params.organizationId,
    role: params.role ?? 'member',
  };
  await db.insert(teamMembers).values(newMember);
}
```

- [ ] **Step 2: Verificare che compili**

Run: `npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 3: Commit**

```bash
git add lib/core/organizations/index.ts
git commit -m "$(cat <<'EOF'
feat(organizations): ricerca organizzazioni e gestione membri minimale

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Pannello admin — `/dashboard/admin/packages`

**Files:**
- Create: `app/(dashboard)/dashboard/admin/packages/page.tsx`
- Create: `app/(dashboard)/dashboard/admin/packages/actions.ts`
- Modify: `components/admin/admin-nav.tsx`

**Interfaces:**
- Consumes: `listPackages`, `createPackage`, `setPackageFeatures`, `assignPackageToOrganization`, `revokeOrganizationPackage`, `listOrganizationsForPackage` (Task 5); `searchOrganizations`, `listOrganizationMembers`, `addOrganizationMember`, `findUserByEmail` (Task 6); `FEATURE_CODES` (esistente); `ActionForm`, `ActionState`, `requireRole`, `recordAdminAudit` (esistenti).

- [ ] **Step 1: Creare le azioni server**

Creare `app/(dashboard)/dashboard/admin/packages/actions.ts`:

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/core/auth';
import {
  assignPackageToOrganization,
  createPackage,
  revokeOrganizationPackage,
  setPackageFeatures,
} from '@/lib/core/features/packages';
import { FEATURE_CODES, type FeatureCode } from '@/lib/core/features';
import {
  addOrganizationMember,
  findUserByEmail,
} from '@/lib/core/organizations';
import { recordAdminAudit } from '@/lib/core/admin/audit-log';
import type { ActionState } from '@/lib/auth/middleware';

const KNOWN_FEATURE_CODES = Object.values(FEATURE_CODES) as FeatureCode[];

export async function createPackageAction(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  const admin = await requireRole('admin');
  const key = String(formData.get('key') ?? '').trim();
  const name = String(formData.get('name') ?? '').trim();
  if (!key || !name) {
    return { error: 'Chiave e nome sono obbligatori.' };
  }

  try {
    const created = await createPackage({ actorUserId: admin.id, key, name });
    await recordAdminAudit({
      actor: { id: admin.id, email: admin.email },
      action: 'package_created',
      subjectType: 'package',
      subjectId: created.id,
      outcome: 'ok',
      detail: { chiave: key },
    });
  } catch (error) {
    await recordAdminAudit({
      actor: { id: admin.id, email: admin.email },
      action: 'package_created',
      subjectType: 'package',
      outcome: 'fallita',
      detail: { chiave: key },
    });
    return {
      error:
        error instanceof Error
          ? error.message
          : 'Impossibile creare il pacchetto.',
    };
  }

  revalidatePath('/dashboard/admin/packages');
  return { success: 'Pacchetto creato.' };
}

export async function updatePackageFeaturesAction(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  const admin = await requireRole('admin');
  const packageId = Number(formData.get('packageId'));
  if (!Number.isInteger(packageId) || packageId <= 0) {
    return { error: 'Pacchetto non valido.' };
  }
  const featureCodes = KNOWN_FEATURE_CODES.filter(
    (code) => formData.get(`feature_${code}`) === 'on'
  );

  try {
    await setPackageFeatures({ actorUserId: admin.id, packageId, featureCodes });
    await recordAdminAudit({
      actor: { id: admin.id, email: admin.email },
      action: 'package_features_updated',
      subjectType: 'package',
      subjectId: packageId,
      outcome: 'ok',
      detail: { conteggio: featureCodes.length },
    });
  } catch (error) {
    await recordAdminAudit({
      actor: { id: admin.id, email: admin.email },
      action: 'package_features_updated',
      subjectType: 'package',
      subjectId: packageId,
      outcome: 'fallita',
      detail: {},
    });
    return {
      error:
        error instanceof Error
          ? error.message
          : 'Impossibile aggiornare le feature.',
    };
  }

  revalidatePath('/dashboard/admin/packages');
  return { success: 'Feature aggiornate.' };
}

export async function assignPackageToOrganizationAction(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  const admin = await requireRole('admin');
  const organizationId = Number(formData.get('organizationId'));
  const packageId = Number(formData.get('packageId'));
  if (
    !Number.isInteger(organizationId) ||
    organizationId <= 0 ||
    !Number.isInteger(packageId) ||
    packageId <= 0
  ) {
    return { error: 'Organizzazione o pacchetto non validi.' };
  }
  const expiresAtRaw = String(formData.get('expiresAt') ?? '').trim();
  const expiresAt = expiresAtRaw ? new Date(expiresAtRaw) : null;

  try {
    await assignPackageToOrganization({
      actorUserId: admin.id,
      organizationId,
      packageId,
      startsAt: new Date(),
      expiresAt,
    });
    await recordAdminAudit({
      actor: { id: admin.id, email: admin.email },
      action: 'organization_package_assigned',
      subjectType: 'organization',
      subjectId: organizationId,
      outcome: 'ok',
      detail: { pacchetto: packageId },
    });
  } catch (error) {
    await recordAdminAudit({
      actor: { id: admin.id, email: admin.email },
      action: 'organization_package_assigned',
      subjectType: 'organization',
      subjectId: organizationId,
      outcome: 'fallita',
      detail: { pacchetto: packageId },
    });
    return {
      error:
        error instanceof Error
          ? error.message
          : 'Impossibile assegnare il pacchetto.',
    };
  }

  revalidatePath('/dashboard/admin/packages');
  return { success: 'Pacchetto assegnato.' };
}

export async function revokeOrganizationPackageAction(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  const admin = await requireRole('admin');
  const organizationId = Number(formData.get('organizationId'));
  if (!Number.isInteger(organizationId) || organizationId <= 0) {
    return { error: 'Organizzazione non valida.' };
  }

  const updated = await revokeOrganizationPackage({
    actorUserId: admin.id,
    organizationId,
  });
  await recordAdminAudit({
    actor: { id: admin.id, email: admin.email },
    action: 'organization_package_revoked',
    subjectType: 'organization',
    subjectId: organizationId,
    outcome: updated ? 'ok' : 'fallita',
    detail: {},
  });

  if (!updated) {
    return { error: 'Nessun pacchetto attivo da revocare per questa organizzazione.' };
  }
  revalidatePath('/dashboard/admin/packages');
  return { success: 'Pacchetto revocato.' };
}

export async function addOrganizationMemberAction(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  const admin = await requireRole('admin');
  const organizationId = Number(formData.get('organizationId'));
  const email = String(formData.get('email') ?? '').trim();
  if (!Number.isInteger(organizationId) || organizationId <= 0 || !email) {
    return { error: 'Organizzazione o email non validi.' };
  }

  const user = await findUserByEmail(admin.id, email);
  if (!user) {
    return { error: `Nessun utente con email ${email}.` };
  }

  await addOrganizationMember({
    actorUserId: admin.id,
    organizationId,
    userId: user.id,
  });
  await recordAdminAudit({
    actor: { id: admin.id, email: admin.email },
    action: 'organization_member_added',
    subjectType: 'organization',
    subjectId: organizationId,
    outcome: 'ok',
    detail: { utente: user.id },
  });

  revalidatePath('/dashboard/admin/packages');
  return { success: `${email} aggiunto all'organizzazione.` };
}
```

- [ ] **Step 2: Creare la pagina**

Creare `app/(dashboard)/dashboard/admin/packages/page.tsx`:

```tsx
import { requireRole } from '@/lib/core/auth';
import { FEATURE_CODES } from '@/lib/core/features';
import { listOrganizationsForPackage, listPackages } from '@/lib/core/features/packages';
import { listOrganizationMembers, searchOrganizations } from '@/lib/core/organizations';
import { ActionForm } from '@/components/action-form';
import { Button } from '@/components/ui/button';
import {
  addOrganizationMemberAction,
  assignPackageToOrganizationAction,
  createPackageAction,
  revokeOrganizationPackageAction,
  updatePackageFeaturesAction,
} from './actions';

export const dynamic = 'force-dynamic';

const FEATURE_LABEL: Record<string, string> = {
  AI_SESSION_NOTES: 'Appunti AI',
};

export default async function AdminPackagesPage({
  searchParams,
}: {
  searchParams: Promise<{ orgQuery?: string }>;
}) {
  const admin = await requireRole('admin');
  const { orgQuery = '' } = await searchParams;

  const [packageList, organizationResults] = await Promise.all([
    listPackages(admin.id),
    searchOrganizations(admin.id, orgQuery),
  ]);

  const packagesWithOrganizations = await Promise.all(
    packageList.map(async (pkg) => ({
      ...pkg,
      organizations: await listOrganizationsForPackage(admin.id, pkg.id),
    }))
  );

  const organizationsWithMembers = await Promise.all(
    organizationResults.map(async (org) => ({
      ...org,
      members: await listOrganizationMembers(admin.id, org.id),
    }))
  );

  return (
    <section className="space-y-8 p-4 lg:p-0">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Pacchetti</h1>
        <p className="mt-1 max-w-2xl text-sm text-gray-600">
          Ogni pacchetto porta con sé un insieme di feature. Assegnarlo a
          un&apos;organizzazione abilita quelle feature per tutti i suoi
          membri.
        </p>
      </div>

      <div className="rounded-xl border border-gray-200 p-4">
        <h2 className="text-lg font-semibold text-gray-900">Nuovo pacchetto</h2>
        <ActionForm action={createPackageAction} className="mt-3 flex flex-wrap gap-3">
          <input
            name="key"
            placeholder="chiave (es. starter)"
            required
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
          <input
            name="name"
            placeholder="nome"
            required
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
          <Button type="submit">Crea</Button>
        </ActionForm>
      </div>

      <div className="space-y-6">
        {packagesWithOrganizations.map((pkg) => (
          <div key={pkg.id} className="rounded-xl border border-gray-200 p-4">
            <h2 className="text-lg font-semibold text-gray-900">
              {pkg.name} <span className="text-sm font-normal text-gray-400">({pkg.key})</span>
            </h2>

            <ActionForm action={updatePackageFeaturesAction} className="mt-3 flex flex-wrap items-center gap-4">
              <input type="hidden" name="packageId" value={pkg.id} />
              {Object.values(FEATURE_CODES).map((code) => (
                <label key={code} className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    name={`feature_${code}`}
                    defaultChecked={pkg.featureCodes.includes(code)}
                    className="size-4 rounded border-gray-300"
                  />
                  {FEATURE_LABEL[code] ?? code}
                </label>
              ))}
              <Button type="submit" variant="outline">Salva feature</Button>
            </ActionForm>

            <h3 className="mt-4 text-sm font-semibold text-gray-700">Organizzazioni</h3>
            <ul className="mt-2 space-y-1 text-sm text-gray-600">
              {pkg.organizations.length === 0 ? (
                <li className="text-gray-400">Nessuna organizzazione ha ancora questo pacchetto.</li>
              ) : (
                pkg.organizations.map((org) => (
                  <li key={org.organizationId} className="flex items-center justify-between gap-3">
                    <span>
                      {org.organizationName} — {org.status}
                      {org.expiresAt ? ` (scade ${org.expiresAt.toLocaleDateString('it-IT')})` : ''}
                    </span>
                    {org.status !== 'expired' && (
                      <ActionForm action={revokeOrganizationPackageAction}>
                        <input type="hidden" name="organizationId" value={org.organizationId} />
                        <Button type="submit" variant="outline" className="h-8 px-3 text-xs">
                          Revoca
                        </Button>
                      </ActionForm>
                    )}
                  </li>
                ))
              )}
            </ul>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-gray-200 p-4">
        <h2 className="text-lg font-semibold text-gray-900">Assegna a un&apos;organizzazione</h2>
        <form className="mt-3 flex flex-wrap gap-3" method="get">
          <input
            name="orgQuery"
            defaultValue={orgQuery}
            placeholder="cerca organizzazione per nome"
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
          <Button type="submit" variant="outline">Cerca</Button>
        </form>

        <ul className="mt-4 space-y-4">
          {organizationsWithMembers.map((org) => (
            <li key={org.id} className="rounded-lg border border-gray-100 p-3">
              <p className="font-medium text-gray-900">
                {org.name} <span className="text-xs font-normal text-gray-400">({org.memberCount} membri)</span>
              </p>
              <p className="mt-1 text-xs text-gray-500">
                {org.members.map((m) => m.displayName).join(', ') || 'nessun membro'}
              </p>

              <ActionForm action={assignPackageToOrganizationAction} className="mt-2 flex flex-wrap items-center gap-2">
                <input type="hidden" name="organizationId" value={org.id} />
                <select name="packageId" required className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm">
                  {packageList.map((pkg) => (
                    <option key={pkg.id} value={pkg.id}>{pkg.name}</option>
                  ))}
                </select>
                <input type="date" name="expiresAt" className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm" />
                <Button type="submit" className="h-8 px-3 text-xs">Assegna</Button>
              </ActionForm>

              <ActionForm action={addOrganizationMemberAction} className="mt-2 flex flex-wrap items-center gap-2">
                <input type="hidden" name="organizationId" value={org.id} />
                <input
                  name="email"
                  type="email"
                  placeholder="email del coach da aggiungere"
                  required
                  className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                />
                <Button type="submit" variant="outline" className="h-8 px-3 text-xs">
                  Aggiungi membro
                </Button>
              </ActionForm>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Aggiungere la voce di navigazione**

In `components/admin/admin-nav.tsx`, aggiungere `Package` all'import da `lucide-react`:

```ts
import {
  Activity,
  BrainCircuit,
  CalendarClock,
  LayoutDashboard,
  Package,
  ShieldCheck,
  Sliders,
  UserRound,
  Users,
} from 'lucide-react';
```

e aggiungere una voce all'array `items`, subito dopo quella per `/dashboard/admin/ai-notes`:

```ts
    {
      href: '/dashboard/admin/ai-notes',
      label: 'Configurazione',
      icon: Sliders,
    },
    {
      href: '/dashboard/admin/packages',
      label: 'Pacchetti',
      icon: Package,
    },
```

- [ ] **Step 4: Verificare che compili**

Run: `npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 5: Verificare la pagina senza una sessione admin vera**

**Non esiste un account admin di prova** (`lib/auth/demo-login.ts` ha solo
`coachdemo@`/`atletademo@`) e il database è quello di produzione. `npm run dev`
+ una richiesta a `/dashboard/admin/packages` prende un 307 dal middleware
prima ancora di compilare il modulo della pagina — non è una verifica.

Fare invece, in quest'ordine:

1. **`npx next build`** — compila davvero la rotta e valida i confini
   server/client (le `'use server'` actions, i tipi di `searchParams`). Se fallisce
   qui, il problema è reale anche se `tsc --noEmit` era pulito.
   Run: `npx next build`
   Expected: build completata senza errori sulla rotta
   `/dashboard/admin/packages` (va bene se altre rotte preesistenti hanno
   warning non correlati).

2. **Render + screenshot con dati finti.** Creare uno script temporaneo
   dentro il progetto (non fuori — altrimenti gli alias `@/` non risolvono),
   es. `tmp/render-packages-page.tsx`, che:
   - importa il componente della sezione principale (o ricostruisce
     staticamente il markup con `renderToStaticMarkup` usando dati finti che
     imitano la forma di `PackageWithFeatures[]`/`OrganizationSearchResult[]`
     con membri, così com'è già stato fatto per un'altra pagina admin);
   - scrive un file HTML che carica Tailwind da CDN;
   - lo fotografa con `playwright` (già in devDependencies) per un controllo
     visivo minimo (pacchetto creato, checkbox feature, elenco organizzazioni
     con pulsante "Assegna").
   Cancellare lo script temporaneo e lo screenshot al termine — sono solo
   per la verifica, non fanno parte della consegna.

3. Se il passo 2 risulta troppo costoso da allestire per questo componente
   (dipende da più funzioni server con `Promise.all`, non un singolo
   componente puro), è accettabile fermarsi al build (passo 1) — ma va
   dichiarato esplicitamente, non sottinteso.

**Dichiarare sempre, nel report, il livello di verifica raggiunto** — es.
"typecheck e build puliti; screenshot con dati finti fatto/non fatto; una
sessione admin vera non è stata aperta". Non affermare che la pagina
"funziona" se non è stata guardata a schermo in nessuna forma.

- [ ] **Step 6: Commit**

```bash
git add "app/(dashboard)/dashboard/admin/packages" components/admin/admin-nav.tsx
git commit -m "$(cat <<'EOF'
feat(admin): pannello per configurare pacchetti e assegnarli a un'organizzazione

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Verifica finale

**Files:** nessuno (solo comandi)

- [ ] **Step 1: Suite completa**

Run: `npm test`
Expected: PASS, incluso `organization-grant.test.ts`.

- [ ] **Step 2: Typecheck completo**

Run: `npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 3: Rileggere lo spec e spuntare la copertura**

Confrontare `docs/superpowers/specs/2026-09-06-pacchetti-feature-entitlement-design.md` con quanto implementato: tre tabelle ✓, valutazione a lettura ✓, un pacchetto attivo per organizzazione ✓, niente limiti d'uso a livello org ✓, pannello admin ✓, audit esteso ✓, niente Stripe/UI club-coach ✓.

- [ ] **Step 4: Aggiornare lo stato dello spec**

In `docs/superpowers/specs/2026-09-06-pacchetti-feature-entitlement-design.md`, cambiare la riga:

```
**Stato:** disegno approvato, da implementare
```

in:

```
**Stato:** implementato
```

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-09-06-pacchetti-feature-entitlement-design.md
git commit -m "$(cat <<'EOF'
docs: segna come implementata la specifica sui pacchetti

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```
