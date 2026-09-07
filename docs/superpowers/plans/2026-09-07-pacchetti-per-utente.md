# Pacchetti per utente Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sostituire l'assegnazione di un pacchetto a un'organizzazione con l'assegnazione diretta a un utente, ed eliminare la sezione admin "Assegna a un'organizzazione" e tutto ciò che la sosteneva.

**Architecture:** `organization_packages` (vuota in produzione) viene eliminata e sostituita da `user_packages`, stessa forma ma su `user_id`. `getFeatureAccess` guadagna in semplicità: il percorso `team_members` → `organization_packages` → `package_features` diventa diretto, `user_packages` → `package_features`. Il modulo puro che decide allowed/denied (`evaluateFeatureEntitlement`, `composeFeatureAccess`) non cambia — non sa e non deve sapere da dove viene lo snapshot.

**Tech Stack:** Next.js 15 / React 19, Drizzle ORM, PostgreSQL su Supabase, `node:test` via `tsx --test`.

**Spec di riferimento:** `docs/superpowers/specs/2026-09-07-pacchetti-per-utente-design.md`
**Dipendenze:** `docs/superpowers/specs/2026-09-06-pacchetti-feature-entitlement-design.md` e `docs/superpowers/specs/2026-09-07-matrice-funzionalita-piani-design.md` (stesso branch, PR #71). Non tocca il catalogo `features` né la matrice.

## Global Constraints

- **Il database di sviluppo è il database di produzione.** Nessuna migrazione va eseguita senza aver letto l'SQL generato e senza conferma esplicita dell'utente. Questa migrazione contiene un `DROP TABLE` — va mostrato e confermato esplicitamente, non dato per scontato perché la tabella è vuota.
- **Un solo pacchetto attivo per utente alla volta** — stesso indice unico parziale già usato per `organization_packages`, ora su `user_packages(user_id) WHERE status = 'active'`.
- **`composeFeatureAccess`/`evaluateFeatureEntitlement`/`directResultIsFinal` non cambiano.** Sono generici rispetto a dove arriva lo snapshot — nessun task di questo piano li tocca.
- **`lib/core/organizations/` viene eliminato per intero.** `findUserByEmail` si sposta in `lib/core/features/packages.ts`.
- **Le tabelle `teams`/`team_members`/`organizations` non vengono toccate** — servono ancora al signup e ad altro codice del prodotto.
- **Ogni azione admin che scrive dati passa da `requireRole('admin')`, `assertAdmin`, e una riga in `admin_audit_events`** — pattern già stabilito, invariato.

---

### Task 1: Schema — `user_packages` sostituisce `organization_packages`

**Files:**
- Modify: `lib/db/schema.ts`
- Modify: `lib/core/admin/admin-audit-policy.ts`

**Interfaces:**
- Produces: `USER_PACKAGE_STATUSES`, `UserPackageStatus`, tabella `userPackages`, tipi `UserPackage`/`NewUserPackage`. `ADMIN_AUDIT_ACTIONS` con `user_package_assigned`/`user_package_revoked` al posto di `organization_package_assigned`/`organization_package_revoked`/`organization_member_added`. `ADMIN_AUDIT_SUBJECTS` senza `organization`.
- Rimuove: `ORGANIZATION_PACKAGE_STATUSES`, `OrganizationPackageStatus`, tabella `organizationPackages`, tipi `OrganizationPackage`/`NewOrganizationPackage`.

- [ ] **Step 1: Sostituire la tabella**

In `lib/db/schema.ts`, trovare:

```ts
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
```

e sostituirlo con:

```ts
export const USER_PACKAGE_STATUSES = [
  'active',
  'expired',
  'suspended',
] as const;
export type UserPackageStatus =
  (typeof USER_PACKAGE_STATUSES)[number];

export const userPackages = pgTable(
  'user_packages',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
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
    uniqueIndex('user_packages_one_active_idx')
      .on(table.userId)
      .where(sql`${table.status} = 'active'`),
    index('user_packages_user_status_idx').on(
      table.userId,
      table.status
    ),
    check(
      'user_packages_status_check',
      sql`${table.status} in ('active', 'expired', 'suspended')`
    ),
    check(
      'user_packages_window_check',
      sql`${table.expiresAt} is null or ${table.startsAt} is null or ${table.expiresAt} > ${table.startsAt}`
    ),
  ]
);
```

- [ ] **Step 2: Aggiornare i tipi esportati**

Trovare:

```ts
export type Package = typeof packages.$inferSelect;
export type NewPackage = typeof packages.$inferInsert;
export type Feature = typeof features.$inferSelect;
export type NewFeature = typeof features.$inferInsert;
export type PackageFeature = typeof packageFeatures.$inferSelect;
export type NewPackageFeature = typeof packageFeatures.$inferInsert;
export type OrganizationPackage = typeof organizationPackages.$inferSelect;
export type NewOrganizationPackage = typeof organizationPackages.$inferInsert;
```

sostituire con:

```ts
export type Package = typeof packages.$inferSelect;
export type NewPackage = typeof packages.$inferInsert;
export type Feature = typeof features.$inferSelect;
export type NewFeature = typeof features.$inferInsert;
export type PackageFeature = typeof packageFeatures.$inferSelect;
export type NewPackageFeature = typeof packageFeatures.$inferInsert;
export type UserPackage = typeof userPackages.$inferSelect;
export type NewUserPackage = typeof userPackages.$inferInsert;
```

- [ ] **Step 3: Rinominare le azioni di audit**

Trovare, dentro `ADMIN_AUDIT_ACTIONS`:

```ts
  'package_created',
  'package_features_updated',
  'organization_package_assigned',
  'organization_package_revoked',
  'organization_member_added',
] as const;
export type AdminAuditAction = (typeof ADMIN_AUDIT_ACTIONS)[number];
```

sostituire con:

```ts
  'package_created',
  'package_features_updated',
  'user_package_assigned',
  'user_package_revoked',
] as const;
export type AdminAuditAction = (typeof ADMIN_AUDIT_ACTIONS)[number];
```

Poi trovare `ADMIN_AUDIT_SUBJECTS`:

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

sostituire con:

```ts
export const ADMIN_AUDIT_SUBJECTS = [
  'provider_profile',
  'user',
  'ai_session',
  'feature',
  'configuration',
  'system',
  'package',
] as const;
```

Il `CHECK` inline dentro `pgTable('admin_audit_events', ...)` referenzia questi array via `sql` template — non va toccato a mano, Drizzle lo rigenera al prossimo `db:generate` (Task 2).

- [ ] **Step 4: Aggiornare le etichette in `lib/core/admin/admin-audit-policy.ts`**

Trovare:

```ts
  package_created: 'Pacchetto creato',
  package_features_updated: 'Feature del pacchetto aggiornate',
  organization_package_assigned: 'Pacchetto assegnato a organizzazione',
  organization_package_revoked: 'Pacchetto revocato a organizzazione',
  organization_member_added: 'Membro aggiunto a organizzazione',
};
```

sostituire con:

```ts
  package_created: 'Pacchetto creato',
  package_features_updated: 'Feature del pacchetto aggiornate',
  user_package_assigned: 'Pacchetto assegnato a un utente',
  user_package_revoked: 'Pacchetto revocato a un utente',
};
```

- [ ] **Step 5: Verificare che il progetto compili**

A questo punto molti altri file (che usano ancora `organizationPackages`, `OrganizationPackageStatus`, ecc.) risulteranno rotti — è atteso, li sistemano i task successivi.

Run: `npx tsc --noEmit`
Expected: errori nuovi nei file che i task successivi sistemano
(`lib/core/features/organization-grant.ts`, `lib/core/features/index.ts`,
`lib/core/features/packages.ts`, `lib/core/organizations/index.ts`,
`app/(dashboard)/dashboard/admin/packages/actions.ts`,
`app/(dashboard)/dashboard/admin/packages/page.tsx`) — nessun errore
altrove, e i due preesistenti scollegati (`components/push-setup.tsx`,
`lib/payments/stripe.ts`) restano.

- [ ] **Step 6: Commit**

```bash
git add lib/db/schema.ts lib/core/admin/admin-audit-policy.ts
git commit -m "$(cat <<'EOF'
feat(db): user_packages sostituisce organization_packages

Nessuna migrazione ancora eseguita. Molti file che consumano lo schema
sono ora rotti — li sistemano i task successivi di questo piano.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Migrazione — generare, rivedere, applicare (checkpoint umano, contiene un DROP)

**Files:**
- Create: `lib/db/migrations/00NN_pacchetti-per-utente.sql`
- Modify: `lib/db/migrations/meta/_journal.json`

**Interfaces:**
- Consumes: lo schema di Task 1.
- Produces: `user_packages` al posto di `organization_packages`, effettivamente sul database.

> **Non c'è staging, e questa migrazione contiene un `DROP TABLE`.**
> `organization_packages` è vuota in produzione (verificato: nessun
> pacchetto è mai stato assegnato prima d'ora), quindi il `DROP` non perde
> dati — ma va comunque mostrato e confermato esplicitamente, non eseguito
> perché "tanto è vuota".

- [ ] **Step 1: Generare la migrazione**

Run: `npx drizzle-kit generate --name=pacchetti-per-utente`
Expected: un nuovo file `lib/db/migrations/00NN_pacchetti-per-utente.sql`.

- [ ] **Step 2: Leggere l'SQL generato riga per riga**

Deve contenere **solo**:
- `DROP TABLE "organization_packages";` (o l'ordine equivalente che drizzle-kit sceglie — un `DROP TABLE`, non un `ALTER`/rename, perché per Postgres è una tabella diversa con una colonna diversa);
- `CREATE TABLE "user_packages" (...)` con `PRIMARY KEY`, `FOREIGN KEY` su `user_id`→`users.id` e `package_id`→`packages.id`, `UNIQUE`/indice parziale, `CHECK`;
- due `ALTER TABLE "admin_audit_events" DROP CONSTRAINT ... ADD CONSTRAINT ...` per i due `CHECK` (azioni e soggetti).

Se contiene qualunque cosa tocchi altre tabelle (`packages`, `package_features`, `features`, `organizations`/`teams`), **fermarsi** e segnalarlo.

- [ ] **Step 3: Aggiungere a mano RLS/REVOKE su `user_packages`**

In cima al blocco `CREATE TABLE "user_packages"`, aggiungere:

```sql
-- Un pacchetto appartiene a un utente, non più a un'organizzazione (vedi
-- docs/superpowers/specs/2026-09-07-pacchetti-per-utente-design.md).
-- Stessa postura delle altre tabelle di quest'area: nessun client la legge
-- direttamente, solo il server dopo `requireRole('admin')`.
```

In fondo al file, dopo l'ultimo statement generato, aggiungere:

```sql

REVOKE ALL ON "public"."user_packages" FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON SEQUENCE "public"."user_packages_id_seq" FROM anon, authenticated;--> statement-breakpoint
ALTER TABLE "user_packages" ENABLE ROW LEVEL SECURITY;
```

- [ ] **Step 4: Mostrare l'SQL finale e ottenere conferma**

Incollare il contenuto completo del file nella conversazione, indicare
esplicitamente che contiene un `DROP TABLE organization_packages`, e
chiedere conferma prima di procedere allo Step 5. Non proseguire senza una
risposta affermativa.

- [ ] **Step 5: Applicare la migrazione**

Solo dopo la conferma. Run: `npm run db:migrate`
Expected: log di drizzle-kit che conferma l'applicazione, nessun errore.

- [ ] **Step 6: Commit**

```bash
git add lib/db/migrations
git commit -m "$(cat <<'EOF'
feat(db): applica user_packages, elimina organization_packages

organization_packages era vuota in produzione: nessun dato perso.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

(Il typecheck resta rotto come a fine Task 1 — i task successivi lo
sistemano. Non è un errore di questo task.)

---

### Task 3: `lib/core/features/package-grant.ts` sostituisce `organization-grant.ts`

**Files:**
- Create: `lib/core/features/package-grant.ts`
- Create: `lib/core/features/package-grant.test.ts`
- Delete: `lib/core/features/organization-grant.ts`
- Delete: `lib/core/features/organization-grant.test.ts`
- Modify: `package.json` (script `test`)

**Interfaces:**
- Produces: `buildPackageFeatureSnapshot(params): FeatureEntitlementSnapshot | null` — usata da Task 4. Sostituisce `buildOrganizationFeatureSnapshot` (stessa logica, `userPackage`/`UserPackageStatus` al posto di `organizationPackage`/`OrganizationPackageStatus`).

- [ ] **Step 1: Creare `lib/core/features/package-grant.ts`**

```ts
import type { UserPackageStatus } from '@/lib/db/schema';
import type { FeatureEntitlementSnapshot } from './policy';

const USER_PACKAGE_STATUS_TO_ENTITLEMENT_STATUS: Record<
  UserPackageStatus,
  FeatureEntitlementSnapshot['status']
> = {
  active: 'enabled',
  suspended: 'suspended',
  expired: 'expired',
};

/**
 * Traveste la riga corrente di `user_packages` da entitlement, così la
 * stessa `evaluateFeatureEntitlement` che decide per un'entitlement diretta
 * decide anche qui — la regola su scadenze e stati resta scritta una volta
 * sola.
 */
export function buildPackageFeatureSnapshot(params: {
  userPackage: {
    status: UserPackageStatus;
    startsAt: Date | null;
    expiresAt: Date | null;
  } | null;
  packageFeatureCodes: readonly string[];
  featureCode: string;
}): FeatureEntitlementSnapshot | null {
  if (!params.userPackage) return null;
  if (!params.packageFeatureCodes.includes(params.featureCode)) return null;

  return {
    status:
      USER_PACKAGE_STATUS_TO_ENTITLEMENT_STATUS[
        params.userPackage.status
      ],
    source: 'subscription',
    startsAt: params.userPackage.startsAt,
    expiresAt: params.userPackage.expiresAt,
    usageLimit: null,
    usageCount: 0,
  };
}
```

- [ ] **Step 2: Creare `lib/core/features/package-grant.test.ts`**

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPackageFeatureSnapshot } from './package-grant';
import { evaluateFeatureEntitlement } from './policy';

test('no user package means no grant', () => {
  const snapshot = buildPackageFeatureSnapshot({
    userPackage: null,
    packageFeatureCodes: ['AI_SESSION_NOTES'],
    featureCode: 'AI_SESSION_NOTES',
  });
  assert.equal(snapshot, null);
});

test('a package that does not include the feature grants nothing', () => {
  const snapshot = buildPackageFeatureSnapshot({
    userPackage: { status: 'active', startsAt: null, expiresAt: null },
    packageFeatureCodes: ['SOME_OTHER_FEATURE'],
    featureCode: 'AI_SESSION_NOTES',
  });
  assert.equal(snapshot, null);
});

test('an active package including the feature grants an enabled entitlement', () => {
  const snapshot = buildPackageFeatureSnapshot({
    userPackage: { status: 'active', startsAt: null, expiresAt: null },
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
  const snapshot = buildPackageFeatureSnapshot({
    userPackage: {
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
  const snapshot = buildPackageFeatureSnapshot({
    userPackage: {
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

- [ ] **Step 3: Eseguire i nuovi test e verificare che passino**

Run: `npx tsx --test lib/core/features/package-grant.test.ts`
Expected: PASS (5/5).

- [ ] **Step 4: Eliminare i file vecchi**

```bash
rm lib/core/features/organization-grant.ts lib/core/features/organization-grant.test.ts
```

- [ ] **Step 5: Aggiornare `npm test`**

In `package.json`, nello script `"test"`, trovare la sottostringa:

```
lib/core/features/organization-grant.test.ts
```

e sostituirla con:

```
lib/core/features/package-grant.test.ts
```

(È una singola sostituzione di testo dentro la stringa lunga dello script
— non aggiunge né toglie altre voci.)

- [ ] **Step 6: Commit**

```bash
git add lib/core/features/package-grant.ts lib/core/features/package-grant.test.ts package.json
git rm lib/core/features/organization-grant.ts lib/core/features/organization-grant.test.ts
git commit -m "$(cat <<'EOF'
refactor(features): package-grant sostituisce organization-grant

Stessa logica, buildPackageFeatureSnapshot al posto di
buildOrganizationFeatureSnapshot — un pacchetto ora appartiene a un
utente, non più a un'organizzazione.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: `lib/core/features/index.ts` — `loadUserPackageGrants` sostituisce `loadOrganizationFeatureGrants`

**Files:**
- Modify: `lib/core/features/index.ts`

**Interfaces:**
- Consumes: `buildPackageFeatureSnapshot` da `./package-grant` (Task 3); tabella `userPackages` da `@/lib/db/schema` (Task 1/2).
- Produces: `getFeatureAccess` con la stessa firma di sempre — cambia solo da dove arriva lo snapshot di concessione.

- [ ] **Step 1: Sostituire import e la funzione di caricamento**

Trovare:

```ts
import 'server-only';
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
import { composeFeatureAccess, directResultIsFinal } from './compose-access';
import { stopAiNotesRecordingsForRequester } from '@/lib/core/ai-session-notes/recording';
import type { LiveKitSessionControl } from '@/lib/core/ai-session-notes/livekit-session-control';

export {
  FEATURE_CODES,
  evaluateFeatureEntitlement,
  type FeatureAccessReason,
  type FeatureAccessResult,
  type FeatureCode,
  type FeatureEntitlementSnapshot,
} from './policy';

async function loadOrganizationFeatureGrants(
  userId: number,
  featureCode: FeatureCode
): Promise<FeatureEntitlementSnapshot[]> {
  const rows = await db
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
    .orderBy(asc(organizationPackages.organizationId));

  const grants: FeatureEntitlementSnapshot[] = [];
  for (const row of rows) {
    const snapshot = buildOrganizationFeatureSnapshot({
      organizationPackage: {
        status: row.status as OrganizationPackageStatus,
        startsAt: row.startsAt,
        expiresAt: row.expiresAt,
      },
      packageFeatureCodes: [row.featureCode],
      featureCode,
    });
    if (snapshot) grants.push(snapshot);
  }
  return grants;
}
```

sostituire con:

```ts
import 'server-only';
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  packageFeatures,
  profiles,
  sessionAiAuditEvents,
  userFeatureEntitlements,
  userPackages,
  userRoles,
  users,
  type FeatureEntitlementSource,
  type FeatureEntitlementStatus,
  type UserPackageStatus,
} from '@/lib/db/schema';
import {
  evaluateFeatureEntitlement,
  type FeatureAccessResult,
  type FeatureCode,
  type FeatureEntitlementSnapshot,
} from './policy';
import { buildPackageFeatureSnapshot } from './package-grant';
import { composeFeatureAccess, directResultIsFinal } from './compose-access';
import { stopAiNotesRecordingsForRequester } from '@/lib/core/ai-session-notes/recording';
import type { LiveKitSessionControl } from '@/lib/core/ai-session-notes/livekit-session-control';

export {
  FEATURE_CODES,
  evaluateFeatureEntitlement,
  type FeatureAccessReason,
  type FeatureAccessResult,
  type FeatureCode,
  type FeatureEntitlementSnapshot,
} from './policy';

async function loadUserPackageGrants(
  userId: number,
  featureCode: FeatureCode
): Promise<FeatureEntitlementSnapshot[]> {
  const rows = await db
    .select({
      status: userPackages.status,
      startsAt: userPackages.startsAt,
      expiresAt: userPackages.expiresAt,
      featureCode: packageFeatures.featureCode,
    })
    .from(userPackages)
    .innerJoin(
      packageFeatures,
      and(
        eq(packageFeatures.packageId, userPackages.packageId),
        eq(packageFeatures.featureCode, featureCode)
      )
    )
    .where(
      and(
        eq(userPackages.userId, userId),
        inArray(userPackages.status, ['active', 'suspended'])
      )
    );

  const grants: FeatureEntitlementSnapshot[] = [];
  for (const row of rows) {
    const snapshot = buildPackageFeatureSnapshot({
      userPackage: {
        status: row.status as UserPackageStatus,
        startsAt: row.startsAt,
        expiresAt: row.expiresAt,
      },
      packageFeatureCodes: [row.featureCode],
      featureCode,
    });
    if (snapshot) grants.push(snapshot);
  }
  return grants;
}
```

Nota: `asc` resta nell'import da `drizzle-orm` — serve ancora più sotto in
`getFeatureAdminUsers` (`orderBy(asc(users.email))`), invariato.

- [ ] **Step 2: Aggiornare il corpo di `getFeatureAccess`**

Trovare:

```ts
  const organizationGrants = await loadOrganizationFeatureGrants(
    userId,
    featureCode
  );
  return composeFeatureAccess(directResult, organizationGrants, now);
```

sostituire con:

```ts
  const userPackageGrants = await loadUserPackageGrants(
    userId,
    featureCode
  );
  return composeFeatureAccess(directResult, userPackageGrants, now);
```

- [ ] **Step 3: Verificare che compili**

Run: `npx tsc --noEmit`
Expected: nessun errore nuovo in questo file. Restano gli errori attesi nei
file non ancora sistemati da questo piano (`lib/core/features/packages.ts`,
`lib/core/organizations/index.ts`,
`app/(dashboard)/dashboard/admin/packages/actions.ts`,
`app/(dashboard)/dashboard/admin/packages/page.tsx`) più i due preesistenti
scollegati.

- [ ] **Step 4: Verificare la suite delle feature**

Run: `npx tsx --test lib/core/features/policy.test.ts lib/core/features/compose-access.test.ts lib/core/features/package-grant.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/core/features/index.ts
git commit -m "$(cat <<'EOF'
feat(features): getFeatureAccess legge user_packages, non più organization_packages

Il percorso team_members → organization_packages → package_features
diventa diretto: user_packages → package_features. La logica di
composizione (composeFeatureAccess) non cambia.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: `lib/core/features/packages.ts` — assegnazione per utente, `listUsersForPackage`, `findUserByEmail`

**Files:**
- Modify: `lib/core/features/packages.ts`

**Interfaces:**
- Produces: `assignPackageToUser`, `revokeUserPackage`, `getCurrentUserPackage`, `CurrentUserPackage`, `listUsersForPackage`, `UserPackageRow`, `findUserByEmail` — consumate da Task 7.
- Rimuove: `assignPackageToOrganization`, `revokeOrganizationPackage`, `getCurrentOrganizationPackage`, `CurrentOrganizationPackage`.

- [ ] **Step 1: Sostituire l'import**

Trovare:

```ts
import 'server-only';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  organizationPackages,
  packages,
  type OrganizationPackageStatus,
  type Package,
  type PackageStatus,
} from '@/lib/db/schema';
import { assertAdmin } from './index';
```

sostituire con:

```ts
import 'server-only';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  packages,
  userPackages,
  users,
  type Package,
  type PackageStatus,
  type UserPackageStatus,
} from '@/lib/db/schema';
import { assertAdmin } from './index';
```

- [ ] **Step 2: Sostituire l'assegnazione e la revoca**

Trovare (dal commento JSDoc di `assignPackageToOrganization` fino alla
fine di `revokeOrganizationPackage`):

```ts
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
```

sostituire con:

```ts
/**
 * Assegna un pacchetto a un utente. Chiude la riga corrente
 * (`active`/`suspended`) prima di aprirne una nuova, così l'indice unico
 * parziale su `status = 'active'` non viene mai violato e la storia dei
 * pacchetti precedenti resta leggibile.
 */
export async function assignPackageToUser(params: {
  actorUserId: number;
  userId: number;
  packageId: number;
  startsAt?: Date | null;
  expiresAt?: Date | null;
}): Promise<void> {
  await assertAdmin(params.actorUserId);
  await db.transaction(async (tx) => {
    await tx
      .update(userPackages)
      .set({
        status: 'expired',
        updatedDate: new Date(),
        updatedBy: params.actorUserId,
      })
      .where(
        and(
          eq(userPackages.userId, params.userId),
          inArray(userPackages.status, ['active', 'suspended'])
        )
      );
    await tx.insert(userPackages).values({
      userId: params.userId,
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
 * Revoca il pacchetto corrente di un utente (`active` o `suspended` →
 * `expired`). `false` se l'utente non aveva un pacchetto corrente da
 * revocare.
 */
export async function revokeUserPackage(params: {
  actorUserId: number;
  userId: number;
}): Promise<boolean> {
  await assertAdmin(params.actorUserId);
  const [updated] = await db
    .update(userPackages)
    .set({
      status: 'expired',
      updatedDate: new Date(),
      updatedBy: params.actorUserId,
    })
    .where(
      and(
        eq(userPackages.userId, params.userId),
        inArray(userPackages.status, ['active', 'suspended'])
      )
    )
    .returning({ id: userPackages.id });
  return Boolean(updated);
}
```

- [ ] **Step 3: Sostituire il pacchetto corrente**

Trovare:

```ts
export type CurrentOrganizationPackage = {
  packageId: number;
  packageName: string;
  status: OrganizationPackageStatus;
  expiresAt: Date | null;
};

/**
 * Il pacchetto corrente (attivo o sospeso) di un'organizzazione, se c'è.
 * Sostituisce, nella pagina, la vista che prima viveva nelle schede
 * per-pacchetto — qui vive accanto a dove si assegna e si revoca.
 */
export async function getCurrentOrganizationPackage(
  actorUserId: number,
  organizationId: number
): Promise<CurrentOrganizationPackage | null> {
  await assertAdmin(actorUserId);
  const [row] = await db
    .select({
      packageId: organizationPackages.packageId,
      packageName: packages.name,
      status: organizationPackages.status,
      expiresAt: organizationPackages.expiresAt,
    })
    .from(organizationPackages)
    .innerJoin(packages, eq(packages.id, organizationPackages.packageId))
    .where(
      and(
        eq(organizationPackages.organizationId, organizationId),
        inArray(organizationPackages.status, ['active', 'suspended'])
      )
    )
    .limit(1);
  if (!row) return null;
  return { ...row, status: row.status as OrganizationPackageStatus };
}
```

sostituire con:

```ts
export type CurrentUserPackage = {
  packageId: number;
  packageName: string;
  status: UserPackageStatus;
  expiresAt: Date | null;
};

/** Il pacchetto corrente (attivo o sospeso) di un utente, se c'è. */
export async function getCurrentUserPackage(
  actorUserId: number,
  userId: number
): Promise<CurrentUserPackage | null> {
  await assertAdmin(actorUserId);
  const [row] = await db
    .select({
      packageId: userPackages.packageId,
      packageName: packages.name,
      status: userPackages.status,
      expiresAt: userPackages.expiresAt,
    })
    .from(userPackages)
    .innerJoin(packages, eq(packages.id, userPackages.packageId))
    .where(
      and(
        eq(userPackages.userId, userId),
        inArray(userPackages.status, ['active', 'suspended'])
      )
    )
    .limit(1);
  if (!row) return null;
  return { ...row, status: row.status as UserPackageStatus };
}

export type UserPackageRow = {
  userId: number;
  email: string;
  displayName: string;
  status: UserPackageStatus;
  expiresAt: Date | null;
};

/** Gli utenti che hanno (attivo o sospeso) questo pacchetto oggi. */
export async function listUsersForPackage(
  actorUserId: number,
  packageId: number
): Promise<UserPackageRow[]> {
  await assertAdmin(actorUserId);
  const rows = await db
    .select({
      userId: users.id,
      email: users.email,
      name: users.name,
      lastName: users.lastName,
      status: userPackages.status,
      expiresAt: userPackages.expiresAt,
    })
    .from(userPackages)
    .innerJoin(users, eq(users.id, userPackages.userId))
    .where(
      and(
        eq(userPackages.packageId, packageId),
        inArray(userPackages.status, ['active', 'suspended'])
      )
    )
    .orderBy(asc(users.email));
  return rows.map((row) => ({
    userId: row.userId,
    email: row.email,
    displayName: [row.name, row.lastName].filter(Boolean).join(' ') || row.email,
    status: row.status as UserPackageStatus,
    expiresAt: row.expiresAt,
  }));
}

/**
 * `null` se nessun utente ha questa email — l'azione chiamante decide il
 * messaggio. Spostata qui da `lib/core/organizations/` (rimosso): serve a
 * cercare l'utente a cui assegnare un pacchetto, non ha più senso in un
 * modulo dedicato alle organizzazioni.
 */
export async function findUserByEmail(
  actorUserId: number,
  email: string
): Promise<{ id: number; email: string } | null> {
  await assertAdmin(actorUserId);
  const [found] = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(
      and(
        eq(users.email, email.trim().toLowerCase()),
        isNull(users.deletedAt),
        eq(users.isDemo, false)
      )
    )
    .limit(1);
  return found ?? null;
}
```

- [ ] **Step 4: Verificare che compili**

Run: `npx tsc --noEmit`
Expected: nessun errore nuovo in questo file. Restano gli errori attesi in
`lib/core/organizations/index.ts`,
`app/(dashboard)/dashboard/admin/packages/actions.ts`,
`app/(dashboard)/dashboard/admin/packages/page.tsx`, più i due preesistenti
scollegati.

- [ ] **Step 5: Commit**

```bash
git add lib/core/features/packages.ts
git commit -m "$(cat <<'EOF'
feat(features): assegnazione pacchetto per utente

assignPackageToUser/revokeUserPackage/getCurrentUserPackage sostituiscono
le equivalenti per organizzazione. Nuova listUsersForPackage. findUserByEmail
si sposta qui da lib/core/organizations/ (rimosso nel prossimo task).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Eliminare `lib/core/organizations/`

**Files:**
- Delete: `lib/core/organizations/index.ts`

**Interfaces:**
- Rimuove: `searchOrganizations`, `OrganizationSearchResult`, `listOrganizationMembers`, `OrganizationMember`, `addOrganizationMember` (nessuna sostituta — questo concetto non esiste più), `findUserByEmail` (sostituita da quella in `lib/core/features/packages.ts`, Task 5).

- [ ] **Step 1: Confermare che nessun altro file lo importi ancora**

Run: `grep -rn "lib/core/organizations" app lib --include="*.ts" --include="*.tsx"`
Expected: solo `app/(dashboard)/dashboard/admin/packages/actions.ts` e
`page.tsx` (che il Task 7 sistema subito dopo). Se compare altrove,
fermarsi e segnalarlo — non è previsto da questo piano.

- [ ] **Step 2: Eliminare la cartella**

```bash
rm -rf lib/core/organizations
```

- [ ] **Step 3: Commit**

```bash
git add -A lib/core/organizations
git commit -m "$(cat <<'EOF'
refactor: rimuove lib/core/organizations

Non serve più: un pacchetto si assegna a un utente, non a
un'organizzazione. findUserByEmail è già stata spostata in
lib/core/features/packages.ts (task precedente).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

(`app/(dashboard)/dashboard/admin/packages/actions.ts` e `page.tsx`
restano rotti fino al Task 7 — atteso.)

---

### Task 7: Pannello admin — "Assegna a un utente" e "Chi ha ogni pacchetto"

**Files:**
- Modify: `app/(dashboard)/dashboard/admin/packages/actions.ts` (riscrittura completa)
- Modify: `app/(dashboard)/dashboard/admin/packages/page.tsx` (riscrittura completa)

**Interfaces:**
- Consumes: `assignPackageToUser`, `revokeUserPackage`, `getCurrentUserPackage`, `listUsersForPackage`, `findUserByEmail` (Task 5); `getFeatureMatrix`, `setFeatureMatrix` (esistenti, invariate); `parseFeatureMatrixSubmission`, `matrixCellFieldName` (esistenti, invariate).

- [ ] **Step 1: Riscrivere `actions.ts`**

Sostituire l'intero contenuto di
`app/(dashboard)/dashboard/admin/packages/actions.ts` con:

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/core/auth';
import {
  assignPackageToUser,
  createPackage,
  revokeUserPackage,
} from '@/lib/core/features/packages';
import {
  getFeatureMatrix,
  setFeatureMatrix,
  type FeatureMatrix,
} from '@/lib/core/features/catalog';
import { parseFeatureMatrixSubmission } from '@/lib/core/features/matrix-form';
import { recordAdminAudit } from '@/lib/core/admin/audit-log';
import { romeDayStartShifted, romeDayValueToInstant } from '@/lib/core/admin/period';
import type { ActionState } from '@/lib/auth/middleware';

/**
 * Un messaggio leggibile per l'admin, mai il testo grezzo di Postgres.
 * `FORBIDDEN` viene da `assertAdmin` (difesa in profondità: la route ha
 * già passato `requireRole('admin')`, ma la funzione di lib/core non si
 * fida).
 */
function friendlyError(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    if (error.message === 'FORBIDDEN') return 'Non autorizzato.';
    if (error.message.includes('packages_key_unique')) {
      return 'Chiave già in uso da un altro pacchetto.';
    }
    if (error.message.includes('user_packages_window_check')) {
      return "La scadenza deve essere successiva all'inizio.";
    }
  }
  return fallback;
}

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
    return { error: friendlyError(error, 'Impossibile creare il pacchetto.') };
  }

  revalidatePath('/dashboard/admin/packages');
  return { success: 'Pacchetto creato.' };
}

export async function updateFeatureMatrixAction(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  const admin = await requireRole('admin');

  let matrix: FeatureMatrix;
  try {
    matrix = await getFeatureMatrix(admin.id);
  } catch (error) {
    return { error: friendlyError(error, 'Impossibile leggere la matrice.') };
  }

  const parsed = parseFeatureMatrixSubmission({
    packages: matrix.packages,
    features: matrix.features,
    getField: (name) => {
      const value = formData.get(name);
      return value === null ? null : String(value);
    },
  });
  if ('error' in parsed) {
    return { error: parsed.error };
  }

  try {
    await setFeatureMatrix({ actorUserId: admin.id, entries: parsed.entries });
    await recordAdminAudit({
      actor: { id: admin.id, email: admin.email },
      action: 'package_features_updated',
      subjectType: 'package',
      outcome: 'ok',
      detail: { celle: parsed.entries.length },
    });
  } catch (error) {
    await recordAdminAudit({
      actor: { id: admin.id, email: admin.email },
      action: 'package_features_updated',
      subjectType: 'package',
      outcome: 'fallita',
      detail: {},
    });
    return { error: friendlyError(error, 'Impossibile salvare la matrice.') };
  }

  revalidatePath('/dashboard/admin/packages');
  return { success: 'Matrice salvata.' };
}

export async function assignPackageToUserAction(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  const admin = await requireRole('admin');
  const userId = Number(formData.get('userId'));
  const packageId = Number(formData.get('packageId'));
  if (
    !Number.isInteger(userId) ||
    userId <= 0 ||
    !Number.isInteger(packageId) ||
    packageId <= 0
  ) {
    return { error: 'Utente o pacchetto non validi.' };
  }

  const expiresAtRaw = String(formData.get('expiresAt') ?? '').trim();
  let expiresAt: Date | null = null;
  if (expiresAtRaw) {
    const chosenDay = romeDayValueToInstant(expiresAtRaw);
    if (!chosenDay) {
      return { error: 'Data di scadenza non valida.' };
    }
    // La scadenza copre l'intera giornata scelta, a Roma: l'istante
    // memorizzato è l'inizio del giorno *dopo*.
    expiresAt = romeDayStartShifted(chosenDay, 1);
  }

  const startsAt = new Date();
  if (expiresAt && expiresAt <= startsAt) {
    return { error: 'La data di scadenza deve essere nel futuro.' };
  }

  try {
    await assignPackageToUser({
      actorUserId: admin.id,
      userId,
      packageId,
      startsAt,
      expiresAt,
    });
    await recordAdminAudit({
      actor: { id: admin.id, email: admin.email },
      action: 'user_package_assigned',
      subjectType: 'user',
      subjectId: userId,
      outcome: 'ok',
      detail: { pacchetto: packageId },
    });
  } catch (error) {
    await recordAdminAudit({
      actor: { id: admin.id, email: admin.email },
      action: 'user_package_assigned',
      subjectType: 'user',
      subjectId: userId,
      outcome: 'fallita',
      detail: { pacchetto: packageId },
    });
    return { error: friendlyError(error, 'Impossibile assegnare il pacchetto.') };
  }

  revalidatePath('/dashboard/admin/packages');
  return { success: 'Pacchetto assegnato.' };
}

export async function revokeUserPackageAction(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  const admin = await requireRole('admin');
  const userId = Number(formData.get('userId'));
  if (!Number.isInteger(userId) || userId <= 0) {
    return { error: 'Utente non valido.' };
  }

  let updated: boolean;
  try {
    updated = await revokeUserPackage({
      actorUserId: admin.id,
      userId,
    });
  } catch (error) {
    await recordAdminAudit({
      actor: { id: admin.id, email: admin.email },
      action: 'user_package_revoked',
      subjectType: 'user',
      subjectId: userId,
      outcome: 'fallita',
      detail: {},
    });
    return { error: friendlyError(error, 'Impossibile revocare il pacchetto.') };
  }

  await recordAdminAudit({
    actor: { id: admin.id, email: admin.email },
    action: 'user_package_revoked',
    subjectType: 'user',
    subjectId: userId,
    outcome: updated ? 'ok' : 'fallita',
    detail: {},
  });

  if (!updated) {
    return { error: 'Nessun pacchetto attivo da revocare per questo utente.' };
  }
  revalidatePath('/dashboard/admin/packages');
  return { success: 'Pacchetto revocato.' };
}
```

La ricerca utente avviene via `searchParams` (uno `<form method="get">`,
come già faceva la ricerca organizzazione), non via `ActionForm` — la
pagina (Step 2) chiama `findUserByEmail` direttamente da un Server
Component, non tramite un'azione. `actions.ts` quindi non importa
`findUserByEmail` — solo `assignPackageToUser`, `createPackage`,
`revokeUserPackage`.

- [ ] **Step 2: Riscrivere `page.tsx`**

Sostituire l'intero contenuto di
`app/(dashboard)/dashboard/admin/packages/page.tsx` con:

```tsx
import { requireRole } from '@/lib/core/auth';
import { getFeatureMatrix } from '@/lib/core/features/catalog';
import {
  findUserByEmail,
  getCurrentUserPackage,
  listUsersForPackage,
} from '@/lib/core/features/packages';
import { matrixCellFieldName } from '@/lib/core/features/matrix-form';
import { romeDayStartShifted } from '@/lib/core/admin/period';
import { ActionForm } from '@/components/action-form';
import { Button } from '@/components/ui/button';
import {
  assignPackageToUserAction,
  createPackageAction,
  revokeUserPackageAction,
  updateFeatureMatrixAction,
} from './actions';

export const dynamic = 'force-dynamic';

export default async function AdminPackagesPage({
  searchParams,
}: {
  searchParams: Promise<{ userEmail?: string }>;
}) {
  const admin = await requireRole('admin');
  const { userEmail = '' } = await searchParams;

  const matrix = await getFeatureMatrix(admin.id);

  const foundUser = userEmail.trim()
    ? await findUserByEmail(admin.id, userEmail.trim())
    : null;
  const foundUserPackage = foundUser
    ? await getCurrentUserPackage(admin.id, foundUser.id)
    : null;

  const packagesWithUsers = await Promise.all(
    matrix.packages.map(async (pkg) => ({
      ...pkg,
      users: await listUsersForPackage(admin.id, pkg.id),
    }))
  );

  return (
    <section className="space-y-8 p-4 lg:p-0">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Pacchetti</h1>
        <p className="mt-1 max-w-2xl text-sm text-gray-600">
          Ogni pacchetto porta con sé un insieme di feature. Assegnarlo a
          un utente abilita quelle feature per il suo account.
        </p>
      </div>

      <div className="rounded-xl border border-gray-200 p-4">
        <h2 className="text-lg font-semibold text-gray-900">Nuovo pacchetto</h2>
        <ActionForm action={createPackageAction} className="mt-3 flex flex-wrap gap-3">
          <input
            name="key"
            placeholder="chiave (es. starter)"
            required
            maxLength={60}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
          <input
            name="name"
            placeholder="nome"
            required
            maxLength={120}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
          <Button type="submit">Crea</Button>
        </ActionForm>
      </div>

      <div className="rounded-xl border border-gray-200 p-4">
        <h2 className="text-lg font-semibold text-gray-900">Matrice funzionalità × pacchetti</h2>
        <p className="mt-1 text-sm text-gray-500">
          Per le funzionalità numeriche, campo vuoto = illimitato.
        </p>

        {matrix.packages.length === 0 ? (
          <p className="mt-3 text-sm text-gray-400">
            Nessun pacchetto ancora — crealo qui sopra prima di configurare la matrice.
          </p>
        ) : (
          <ActionForm
            action={updateFeatureMatrixAction}
            className="mt-4"
            confirmTitle="Salvare la matrice?"
            confirmMessage="Sostituisce l'intera configurazione: una casella non spuntata toglie quella funzionalità dal pacchetto per tutti gli utenti che lo hanno. Una cella numerica lasciata vuota vuol dire illimitata, non esclusa."
            confirmActionLabel="Salva"
          >
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse text-sm">
                <thead>
                  <tr>
                    <th scope="col" className="border-b border-gray-200 px-3 py-2 text-left font-semibold text-gray-700">
                      Funzionalità
                    </th>
                    {matrix.packages.map((pkg) => (
                      <th
                        key={pkg.id}
                        scope="col"
                        className="border-b border-gray-200 px-3 py-2 text-center font-semibold text-gray-700"
                      >
                        {pkg.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {matrix.features.map((feature) => (
                    <tr key={feature.code} className="border-b border-gray-100">
                      <th scope="row" className="px-3 py-2 text-left font-normal">
                        <div className="font-medium text-gray-900">{feature.label}</div>
                        {feature.description && (
                          <div className="text-xs text-gray-500">{feature.description}</div>
                        )}
                      </th>
                      {matrix.packages.map((pkg) => {
                        const fieldName = matrixCellFieldName(pkg.id, feature.code);
                        const currentValue = pkg.cells[feature.code];
                        const isIncluded = feature.code in pkg.cells;
                        const cellLabel = `${feature.label} — ${pkg.name}`;
                        return (
                          <td key={pkg.id} className="px-3 py-2 text-center">
                            {feature.type === 'boolean' ? (
                              <input
                                type="checkbox"
                                name={fieldName}
                                defaultChecked={isIncluded}
                                aria-label={cellLabel}
                                className="size-4 rounded border-gray-300"
                              />
                            ) : (
                              <input
                                type="number"
                                name={fieldName}
                                min={0}
                                step={1}
                                placeholder="illimitato"
                                defaultValue={currentValue ?? undefined}
                                aria-label={cellLabel}
                                className="w-24 rounded-lg border border-gray-300 px-2 py-1 text-center text-sm"
                              />
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Button type="submit" className="mt-4">Salva</Button>
          </ActionForm>
        )}
      </div>

      <div className="rounded-xl border border-gray-200 p-4">
        <h2 className="text-lg font-semibold text-gray-900">Assegna a un utente</h2>
        <form className="mt-3 flex flex-wrap gap-3" method="get">
          <input
            name="userEmail"
            type="email"
            defaultValue={userEmail}
            placeholder="email dell'utente"
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
          <Button type="submit" variant="outline">Cerca</Button>
        </form>

        {userEmail.trim() && !foundUser && (
          <p className="mt-3 text-sm text-gray-400">Nessun utente con questa email.</p>
        )}

        {foundUser && (
          <div className="mt-4 rounded-lg border border-gray-100 p-3">
            <p className="font-medium text-gray-900">{foundUser.email}</p>

            {foundUserPackage ? (
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-gray-50 px-3 py-2 text-sm">
                <span>
                  Pacchetto attuale: <strong>{foundUserPackage.packageName}</strong> — {foundUserPackage.status}
                  {foundUserPackage.expiresAt
                    ? // La scadenza salvata è l'inizio del giorno *dopo* l'ultimo
                      // giorno valido (assignPackageToUserAction) — un giorno
                      // indietro per mostrare il giorno che l'admin ha davvero
                      // scelto.
                      ` (scade ${romeDayStartShifted(foundUserPackage.expiresAt, -1).toLocaleDateString('it-IT', { timeZone: 'Europe/Rome' })})`
                    : ''}
                </span>
                <ActionForm
                  action={revokeUserPackageAction}
                  confirmTitle="Revocare il pacchetto?"
                  confirmMessage={`${foundUser.email} perderà l'accesso alle feature di questo pacchetto.`}
                  confirmActionLabel="Revoca"
                >
                  <input type="hidden" name="userId" value={foundUser.id} />
                  <Button type="submit" variant="outline" className="h-8 px-3 text-xs">
                    Revoca
                  </Button>
                </ActionForm>
              </div>
            ) : (
              <p className="mt-2 text-xs text-gray-400">Nessun pacchetto attivo.</p>
            )}

            <ActionForm
              action={assignPackageToUserAction}
              className="mt-2 flex flex-wrap items-center gap-2"
              confirmTitle="Assegnare il pacchetto?"
              confirmMessage={`Se ${foundUser.email} ha già un pacchetto attivo, verrà sostituito.`}
              confirmActionLabel="Assegna"
            >
              <input type="hidden" name="userId" value={foundUser.id} />
              <select name="packageId" required className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm">
                {matrix.packages.map((pkg) => (
                  <option key={pkg.id} value={pkg.id}>{pkg.name}</option>
                ))}
              </select>
              <input type="date" name="expiresAt" className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm" />
              <Button type="submit" className="h-8 px-3 text-xs">Assegna</Button>
            </ActionForm>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-gray-200 p-4">
        <h2 className="text-lg font-semibold text-gray-900">Chi ha ogni pacchetto</h2>
        {packagesWithUsers.length === 0 ? (
          <p className="mt-3 text-sm text-gray-400">Nessun pacchetto ancora.</p>
        ) : (
          <div className="mt-3 space-y-4">
            {packagesWithUsers.map((pkg) => (
              <div key={pkg.id}>
                <h3 className="text-sm font-semibold text-gray-700">{pkg.name}</h3>
                <ul className="mt-1 space-y-1 text-sm text-gray-600">
                  {pkg.users.length === 0 ? (
                    <li className="text-gray-400">Nessun utente ha questo pacchetto.</li>
                  ) : (
                    pkg.users.map((u) => (
                      <li key={u.userId}>
                        {u.displayName} <span className="text-xs text-gray-400">({u.email})</span> — {u.status}
                        {u.expiresAt
                          ? ` (scade ${romeDayStartShifted(u.expiresAt, -1).toLocaleDateString('it-IT', { timeZone: 'Europe/Rome' })})`
                          : ''}
                      </li>
                    ))
                  )}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Verificare che compili**

Run: `npx tsc --noEmit`
Expected: nessun errore nuovo — i due preesistenti scollegati restano, e
solo quelli.

- [ ] **Step 4: Verificare senza una sessione admin vera**

Stessa procedura già stabilita — niente account admin di prova.

1. Run: `npx next build` — deve completare senza errori sulla rotta
   `/dashboard/admin/packages`.
2. Se praticabile, un render statico con dati finti (un utente trovato con
   un pacchetto corrente, un utente non trovato, la sezione "chi ha ogni
   pacchetto" con almeno un pacchetto e uno zero-utenti) fotografato con
   Playwright, poi ripulito per intero. Se il costo di allestirlo è alto,
   fermarsi al build e dichiararlo esplicitamente nel report.

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/dashboard/admin/packages/actions.ts" "app/(dashboard)/dashboard/admin/packages/page.tsx"
git commit -m "$(cat <<'EOF'
feat(admin): assegna un pacchetto a un utente, non più a un'organizzazione

"Assegna a un'organizzazione" (ricerca per nome fra centinaia di
organizzazioni-fantasma create al signup) sparisce, sostituita da
"Assegna a un utente" (ricerca per email) e da una nuova sezione "Chi
ha ogni pacchetto" che elenca, senza cercare nulla, chi ha ciascun
pacchetto oggi.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Verifica finale

**Files:** nessuno (solo comandi)

- [ ] **Step 1: Suite completa**

Run: `npm test`
Expected: PASS, incluso `package-grant.test.ts` (`organization-grant.test.ts`
non esiste più).

- [ ] **Step 2: Typecheck completo**

Run: `npx tsc --noEmit`
Expected: nessun errore nuovo — solo i due preesistenti scollegati
(`components/push-setup.tsx`, `lib/payments/stripe.ts`).

- [ ] **Step 3: Nessun riferimento residuo**

Run: `grep -rln "organizationPackages\|OrganizationPackageStatus\|organization_package\|lib/core/organizations\|buildOrganizationFeatureSnapshot\|organization-grant" app lib --include="*.ts" --include="*.tsx"`
Expected: nessun risultato (a parte, se compare, `lib/core/config/types.ts`
— quel file usa "organization" nel senso generico di attore del
marketplace, non ha nulla a che fare con i pacchetti: non toccarlo).

- [ ] **Step 4: Rileggere lo spec e spuntare la copertura**

Confrontare `docs/superpowers/specs/2026-09-07-pacchetti-per-utente-design.md`
con quanto implementato: `user_packages` sostituisce `organization_packages`
✓, `getFeatureAccess` legge direttamente da `user_packages` ✓,
`lib/core/organizations/` eliminato ✓, pannello con "Assegna a un utente"
✓ e "Chi ha ogni pacchetto" ✓, tabelle `teams`/`team_members`/`organizations`
non toccate ✓.

- [ ] **Step 5: Aggiornare lo stato dello spec**

In `docs/superpowers/specs/2026-09-07-pacchetti-per-utente-design.md`,
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
git add docs/superpowers/specs/2026-09-07-pacchetti-per-utente-design.md
git commit -m "$(cat <<'EOF'
docs: segna come implementata la specifica sui pacchetti per utente

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```
