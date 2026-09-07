# Matrice funzionalità × piani — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sostituire l'elenco a schede del pannello `/dashboard/admin/packages` con una matrice funzionalità×pacchetti (righe/colonne, celle sì/no o numeriche), sopra un catalogo `features` vero a database.

**Architecture:** Una tabella `features` nuova (il catalogo, seminata da un solo sviluppatore via migrazione) e una colonna `value` su `package_features` (già esistente da PR #71). Un modulo puro (`matrix-form.ts`) decide come leggere una sottomissione del form; un modulo server (`catalog.ts`) legge/scrive la matrice in una transazione sola. La sezione "assegna a organizzazione" resta, ma guadagna la vista del pacchetto corrente (prima viveva nelle schede che spariscono).

**Tech Stack:** Next.js 15 / React 19, Drizzle ORM, PostgreSQL su Supabase, `node:test` via `tsx --test`.

**Spec di riferimento:** `docs/superpowers/specs/2026-09-07-matrice-funzionalita-piani-design.md`
**Dipendenza:** `docs/superpowers/specs/2026-09-06-pacchetti-feature-entitlement-design.md` (PR #71, stesso branch)

## Global Constraints

- **Il database di sviluppo è il database di produzione.** Nessuna migrazione va eseguita senza aver letto l'SQL generato e senza conferma esplicita dell'utente.
- **Migrazioni additive.** `package_features` è oggi vuota in produzione, ma l'ordine delle istruzioni nella migrazione conta comunque: creare `features`, seminarla, **poi** aggiungere il vincolo di riferimento su `package_features.feature_code`.
- **Il catalogo `features` cresce solo via migrazione.** Nessuna funzione admin-facing per creare una nuova feature — l'admin configura, non inventa.
- **Un solo pulsante "Salva" per l'intera matrice**, non per cella e non per pacchetto.
- **`null` = illimitato** per una feature numerica — stessa convenzione di `userFeatureEntitlements.usageLimit`, non un nuovo sentinella tipo `-1`.
- **La sezione "assegna a organizzazione" non cambia di comportamento** — guadagna solo la vista del pacchetto corrente, che prima viveva nelle schede rimosse.
- **RLS abilitata, nessuna concessione a `anon`/`authenticated`** sulla nuova tabella `features`, come le tre tabelle di PR #71.
- **Ogni azione admin che scrive dati passa da `requireRole('admin')`, `assertAdmin`, e una riga in `admin_audit_events`** — pattern già stabilito.
- **Un modulo puro ha il suo `.test.ts` accanto, wired in `npm test`.**

---

### Task 1: Schema — tabella `features` e colonna `value` su `package_features`

**Files:**
- Modify: `lib/db/schema.ts`

**Interfaces:**
- Produces: `FEATURE_TYPES`, `FeatureType`, tabella `features`, tipi `Feature`/`NewFeature`. `packageFeatures` guadagna la colonna `value` e un riferimento di `featureCode` a `features.code`.

- [ ] **Step 1: Aggiungere la tabella `features`**

In `lib/db/schema.ts`, trovare:

```ts
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
```

e sostituirlo con:

```ts
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

// Il catalogo delle feature che il codice controlla davvero. Una riga
// nasce solo quando uno sviluppatore collega una funzionalità reale a un
// punto del codice (vedi docs/superpowers/specs/2026-09-07-matrice-funzionalita-piani-design.md)
// — l'admin, dalla matrice, decide solo quali pacchetti la includono.
export const FEATURE_TYPES = ['boolean', 'numeric'] as const;
export type FeatureType = (typeof FEATURE_TYPES)[number];

export const features = pgTable(
  'features',
  {
    id: serial('id').primaryKey(),
    code: varchar('code', { length: 80 }).notNull(),
    label: varchar('label', { length: 120 }).notNull(),
    description: text('description'),
    type: varchar('type', { length: 20 }).notNull().default('boolean'),
    sortOrder: integer('sort_order').notNull().default(0),
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
    unique('features_code_unique').on(table.code),
    check(
      'features_type_check',
      sql`${table.type} in ('boolean', 'numeric')`
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
    featureCode: varchar('feature_code', { length: 80 })
      .notNull()
      .references(() => features.code, { onDelete: 'cascade' }),
    // Assente (null) per una feature `boolean` — la riga stessa è
    // l'inclusione. Per una `numeric`, il limite; `null` = illimitato,
    // stessa convenzione di `userFeatureEntitlements.usageLimit`.
    value: integer('value'),
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
```

`text`, `check`, `unique` sono già importati in cima al file (usati da `profiles`/`packages` poco sopra) — non serve aggiungere import.

- [ ] **Step 2: Aggiungere i tipi esportati**

Trovare:

```ts
export type Package = typeof packages.$inferSelect;
export type NewPackage = typeof packages.$inferInsert;
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
export type OrganizationPackage = typeof organizationPackages.$inferSelect;
export type NewOrganizationPackage = typeof organizationPackages.$inferInsert;
```

- [ ] **Step 3: Verificare che il progetto compili**

Run: `npx tsc --noEmit`
Expected: nessun errore nuovo (i due preesistenti e scollegati in `components/push-setup.tsx` e `lib/payments/stripe.ts` restano).

- [ ] **Step 4: Commit**

```bash
git add lib/db/schema.ts
git commit -m "$(cat <<'EOF'
feat(db): catalogo features e colonna value su package_features

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Migrazione — generare, rivedere, seminare, applicare (checkpoint umano)

**Files:**
- Create: `lib/db/migrations/00NN_matrice-funzionalita-piani.sql` (il numero esatto lo assegna `drizzle-kit`)
- Modify: `lib/db/migrations/meta/_journal.json`

**Interfaces:**
- Consumes: lo schema di Task 1.
- Produces: la tabella `features` con la sola riga `AI_SESSION_NOTES`, e `package_features.value` più il vincolo di riferimento, effettivamente presenti sul database.

> **Non c'è staging.** Non eseguire `npm run db:migrate` senza aver mostrato l'SQL generato e ottenuto conferma esplicita.

- [ ] **Step 1: Generare la migrazione**

Run: `npx drizzle-kit generate --name=matrice-funzionalita-piani`
Expected: un nuovo file `lib/db/migrations/00NN_matrice-funzionalita-piani.sql`.

- [ ] **Step 2: Leggere l'SQL generato riga per riga**

Deve contenere **solo**:
- un `CREATE TABLE "features"` (con `PRIMARY KEY`, `UNIQUE` su `code`, `CHECK` sul tipo);
- `ALTER TABLE "package_features" ADD COLUMN "value" integer;`
- un `ALTER TABLE "package_features" ADD CONSTRAINT ... FOREIGN KEY ("feature_code") REFERENCES "public"."features"("code")`.

Se contiene un `DROP`/ricreazione di `package_features` invece di un `ALTER`, **fermarsi** e segnalarlo — la tabella ha già righe di schema note (nessun dato reale, ma la forma va rispettata comunque con `ALTER`).

- [ ] **Step 3: Aggiungere a mano il seed, l'ordine giusto, e RLS/REVOKE**

In cima al file generato, aggiungere:

```sql
-- Catalogo feature: una riga nasce solo quando uno sviluppatore collega una
-- funzionalità reale al codice (vedi
-- docs/superpowers/specs/2026-09-07-matrice-funzionalita-piani-design.md).
-- Nessun client la legge direttamente: stessa postura delle altre tabelle
-- di questa area (migrazione precedente, pacchetti/organizzazioni).
```

**Riordinare** le istruzioni generate in questa sequenza (usando gli statement che `drizzle-kit` ha già scritto, spostati se necessario):

1. `CREATE TABLE "features" (...)`
2. Il seed (aggiunto a mano — vedi sotto)
3. `ALTER TABLE "package_features" ADD COLUMN "value" integer;`
4. `ALTER TABLE "package_features" ADD CONSTRAINT ... FOREIGN KEY ("feature_code") REFERENCES "public"."features"("code") ...;`

Il seed da aggiungere fra il passo 1 e il passo 3 (subito dopo il `CREATE TABLE "features"`, prima di qualunque `ALTER TABLE "package_features"`):

```sql
INSERT INTO "features" ("code", "label", "description", "type", "sort_order")
VALUES (
  'AI_SESSION_NOTES',
  'Appunti AI',
  'Registrazione, trascrizione e riepilogo AI delle sedute.',
  'boolean',
  0
);--> statement-breakpoint
```

In fondo al file, dopo l'ultimo statement generato, aggiungere:

```sql

REVOKE ALL ON "public"."features" FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON SEQUENCE "public"."features_id_seq" FROM anon, authenticated;--> statement-breakpoint
ALTER TABLE "features" ENABLE ROW LEVEL SECURITY;
```

- [ ] **Step 4: Mostrare l'SQL finale e ottenere conferma**

Incollare il contenuto completo del file nella conversazione e chiedere
esplicitamente conferma prima di procedere allo Step 5. Non proseguire
senza una risposta affermativa.

- [ ] **Step 5: Applicare la migrazione**

Solo dopo la conferma. Run: `npm run db:migrate`
Expected: log di drizzle-kit che conferma l'applicazione, nessun errore.

- [ ] **Step 6: Verificare**

Run: `npx tsc --noEmit` — nessun errore nuovo.

- [ ] **Step 7: Commit**

```bash
git add lib/db/migrations
git commit -m "$(cat <<'EOF'
feat(db): applica la migrazione del catalogo features

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Modulo puro — come leggere una sottomissione della matrice

**Files:**
- Create: `lib/core/features/matrix-form.ts`
- Test: `lib/core/features/matrix-form.test.ts`
- Modify: `package.json` (script `test`)

**Interfaces:**
- Produces: `parseFeatureMatrixSubmission(params): { entries: FeatureMatrixEntryInput[] } | { error: string }`, usata da Task 6.

- [ ] **Step 1: Scrivere i test (falliscono: il modulo non esiste ancora)**

Creare `lib/core/features/matrix-form.test.ts`:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { parseFeatureMatrixSubmission } from './matrix-form';

const packages = [
  { id: 1, name: 'Starter' },
  { id: 2, name: 'Elite' },
];

test('a checked boolean cell becomes an entry with value null', () => {
  const features = [{ code: 'AI_SESSION_NOTES', label: 'Appunti AI', type: 'boolean' as const }];
  const fields = new Map([['cell_1_AI_SESSION_NOTES', 'on']]);
  const result = parseFeatureMatrixSubmission({
    packages,
    features,
    getField: (name) => fields.get(name) ?? null,
  });
  assert.deepEqual(result, {
    entries: [{ packageId: 1, featureCode: 'AI_SESSION_NOTES', value: null }],
  });
});

test('an unchecked boolean cell produces no entry', () => {
  const features = [{ code: 'AI_SESSION_NOTES', label: 'Appunti AI', type: 'boolean' as const }];
  const result = parseFeatureMatrixSubmission({
    packages: [{ id: 1, name: 'Starter' }],
    features,
    getField: () => null,
  });
  assert.deepEqual(result, { entries: [] });
});

test('a blank numeric cell means unlimited: an entry with value null', () => {
  const features = [{ code: 'AI_SEARCH_LIMIT', label: 'Ricerche AI', type: 'numeric' as const }];
  const result = parseFeatureMatrixSubmission({
    packages: [{ id: 1, name: 'Starter' }],
    features,
    getField: () => '',
  });
  assert.deepEqual(result, {
    entries: [{ packageId: 1, featureCode: 'AI_SEARCH_LIMIT', value: null }],
  });
});

test('a numeric cell with a value becomes an entry carrying that number', () => {
  const features = [{ code: 'AI_SEARCH_LIMIT', label: 'Ricerche AI', type: 'numeric' as const }];
  const fields = new Map([['cell_1_AI_SEARCH_LIMIT', '300']]);
  const result = parseFeatureMatrixSubmission({
    packages: [{ id: 1, name: 'Starter' }],
    features,
    getField: (name) => fields.get(name) ?? null,
  });
  assert.deepEqual(result, {
    entries: [{ packageId: 1, featureCode: 'AI_SEARCH_LIMIT', value: 300 }],
  });
});

test('a negative numeric value is rejected with a message naming the feature and package', () => {
  const features = [{ code: 'AI_SEARCH_LIMIT', label: 'Ricerche AI', type: 'numeric' as const }];
  const fields = new Map([['cell_1_AI_SEARCH_LIMIT', '-5']]);
  const result = parseFeatureMatrixSubmission({
    packages: [{ id: 1, name: 'Starter' }],
    features,
    getField: (name) => fields.get(name) ?? null,
  });
  assert.deepEqual(result, {
    error: 'Valore non valido per Ricerche AI — Starter.',
  });
});

test('a non-numeric value is rejected the same way', () => {
  const features = [{ code: 'AI_SEARCH_LIMIT', label: 'Ricerche AI', type: 'numeric' as const }];
  const fields = new Map([['cell_1_AI_SEARCH_LIMIT', 'abc']]);
  const result = parseFeatureMatrixSubmission({
    packages: [{ id: 1, name: 'Starter' }],
    features,
    getField: (name) => fields.get(name) ?? null,
  });
  assert.deepEqual(result, {
    error: 'Valore non valido per Ricerche AI — Starter.',
  });
});

test('every package × feature combination is visited, in order', () => {
  const features = [
    { code: 'F1', label: 'F1', type: 'boolean' as const },
    { code: 'F2', label: 'F2', type: 'boolean' as const },
  ];
  const fields = new Map([
    ['cell_1_F1', 'on'],
    ['cell_2_F2', 'on'],
  ]);
  const result = parseFeatureMatrixSubmission({
    packages,
    features,
    getField: (name) => fields.get(name) ?? null,
  });
  assert.deepEqual(result, {
    entries: [
      { packageId: 1, featureCode: 'F1', value: null },
      { packageId: 2, featureCode: 'F2', value: null },
    ],
  });
});
```

- [ ] **Step 2: Eseguire i test e verificare che falliscano**

Run: `npx tsx --test lib/core/features/matrix-form.test.ts`
Expected: FAIL — `Cannot find module './matrix-form'`.

- [ ] **Step 3: Implementare il modulo**

Creare `lib/core/features/matrix-form.ts`:

```ts
export type MatrixFeatureType = 'boolean' | 'numeric';

export type MatrixFeatureInput = {
  code: string;
  label: string;
  type: MatrixFeatureType;
};

export type MatrixPackageInput = {
  id: number;
  name: string;
};

export type FeatureMatrixEntryInput = {
  packageId: number;
  featureCode: string;
  value: number | null;
};

/**
 * Il nome del campo del form per una cella. Condiviso fra chi disegna la
 * matrice e chi la legge al salvataggio, così non può disallinearsi.
 */
export function matrixCellFieldName(packageId: number, featureCode: string): string {
  return `cell_${packageId}_${featureCode}`;
}

/**
 * Legge una sottomissione della matrice, una cella alla volta.
 *
 * Sì/no: la casella spuntata diventa una riga (`value: null`); non
 * spuntata, nessuna riga — stessa semantica di sempre per
 * `package_features`. Numerica: vuoto vuol dire illimitato (`value:
 * null`, non l'assenza della funzionalità — una feature numerica non si
 * esclude da questa matrice, si lascia senza limite); un numero intero
 * non negativo diventa il limite; qualunque altra cosa è un errore che
 * nomina la feature e il pacchetto, non il campo tecnico.
 */
export function parseFeatureMatrixSubmission(params: {
  packages: readonly MatrixPackageInput[];
  features: readonly MatrixFeatureInput[];
  getField: (fieldName: string) => string | null;
}): { entries: FeatureMatrixEntryInput[] } | { error: string } {
  const entries: FeatureMatrixEntryInput[] = [];

  for (const pkg of params.packages) {
    for (const feature of params.features) {
      const raw = params.getField(matrixCellFieldName(pkg.id, feature.code));

      if (feature.type === 'boolean') {
        if (raw === 'on') {
          entries.push({ packageId: pkg.id, featureCode: feature.code, value: null });
        }
        continue;
      }

      const trimmed = (raw ?? '').trim();
      if (trimmed === '') {
        entries.push({ packageId: pkg.id, featureCode: feature.code, value: null });
        continue;
      }

      const parsed = Number(trimmed);
      if (!Number.isInteger(parsed) || parsed < 0) {
        return { error: `Valore non valido per ${feature.label} — ${pkg.name}.` };
      }
      entries.push({ packageId: pkg.id, featureCode: feature.code, value: parsed });
    }
  }

  return { entries };
}
```

- [ ] **Step 4: Eseguire i test e verificare che passino**

Run: `npx tsx --test lib/core/features/matrix-form.test.ts`
Expected: PASS (7/7).

- [ ] **Step 5: Aggiungere il test a `npm test`**

In `package.json`, nello script `"test"`, trovare la sottostringa:

```
lib/core/features/compose-access.test.ts lib/core/ai-session-notes/state-machine.test.ts
```

e sostituirla con:

```
lib/core/features/compose-access.test.ts lib/core/features/matrix-form.test.ts lib/core/ai-session-notes/state-machine.test.ts
```

(Se questa sottostringa esatta non esiste — perché il fix finale di PR #71 non è ancora sul branch quando questo task viene eseguito — cercare invece `lib/core/features/organization-grant.test.ts` e aggiungere `lib/core/features/matrix-form.test.ts` subito dopo, nello stesso modo.)

- [ ] **Step 6: Eseguire l'intera suite**

Run: `npm test`
Expected: PASS, nessuna regressione.

- [ ] **Step 7: Commit**

```bash
git add lib/core/features/matrix-form.ts lib/core/features/matrix-form.test.ts package.json
git commit -m "$(cat <<'EOF'
feat(features): modulo puro per leggere una sottomissione della matrice

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: `lib/core/features/packages.ts` — adattare al catalogo, rimuovere il vecchio editor, aggiungere il pacchetto corrente

**Files:**
- Modify: `lib/core/features/packages.ts`

**Interfaces:**
- Produces: `PackageSummary` (sostituisce `PackageWithFeatures`), `getCurrentOrganizationPackage` (nuova) — consumate da Task 5 (`catalog.ts`) e Task 6 (pannello).
- Rimuove: `PackageWithFeatures`, `setPackageFeatures` (l'editor per-pacchetto sparisce, sostituito dalla matrice).

- [ ] **Step 1: Sostituire `PackageWithFeatures`/`listPackages` con `PackageSummary`**

Trovare:

```ts
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
```

sostituire con:

```ts
export type PackageSummary = {
  id: number;
  key: string;
  name: string;
  status: PackageStatus;
};

/** L'elenco dei pacchetti — per il selettore di assegnazione a un'organizzazione. */
export async function listPackages(
  actorUserId: number
): Promise<PackageSummary[]> {
  await assertAdmin(actorUserId);
  const rows = await db
    .select({
      id: packages.id,
      key: packages.key,
      name: packages.name,
      status: packages.status,
    })
    .from(packages)
    .orderBy(packages.id);
  return rows.map((row) => ({ ...row, status: row.status as PackageStatus }));
}
```

- [ ] **Step 2: Rimuovere `setPackageFeatures`**

Trovare ed eliminare interamente questo blocco (la matrice, in `catalog.ts`, lo sostituisce):

```ts
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

```

(Attenzione alla riga vuota finale: lasciare esattamente una riga vuota fra `assignPackageToOrganization` (il commento JSDoc che lo precede) e la funzione precedente, come nel resto del file.)

- [ ] **Step 3: Aggiungere `getCurrentOrganizationPackage`**

Trovare la fine del file (dopo `listOrganizationsForPackage`):

```ts
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

e aggiungere subito dopo:

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

- [ ] **Step 4: Verificare che compili**

Dopo Step 1 e Step 2, due import in cima al file potrebbero risultare
inutilizzati — verificare e rimuovere quelli che lo sono:
- `import type { FeatureCode } from './policy';` — usato solo da
  `PackageWithFeatures`/`setPackageFeatures`, entrambe rimosse.
- `packageFeatures` nell'import da `@/lib/db/schema` — usato solo dal
  vecchio `listPackages` (che ora non fa più il join) e da
  `setPackageFeatures` (rimossa). Nessun'altra funzione del file tocca
  `packageFeatures` — la matrice, in `catalog.ts`, se ne occupa ora.

Se `tsc`/il linter non segnala nulla, va bene comunque controllare a
occhio: un import rimasto e mai usato non fa fallire la build, ma è rumore.

Run: `npx tsc --noEmit`
Expected: nessun errore nuovo.

- [ ] **Step 5: Commit**

```bash
git add lib/core/features/packages.ts
git commit -m "$(cat <<'EOF'
refactor(features): PackageSummary sostituisce PackageWithFeatures

setPackageFeatures rimossa (la matrice in catalog.ts la sostituisce);
aggiunta getCurrentOrganizationPackage per la vista nella sezione di
assegnazione.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: `lib/core/features/catalog.ts` — catalogo e matrice

**Files:**
- Create: `lib/core/features/catalog.ts`

**Interfaces:**
- Consumes: `assertAdmin` da `./index`; `listPackages`, `type PackageSummary` da `./packages` (Task 4) — la matrice non riquery i pacchetti, riusa la stessa lettura del selettore di assegnazione.
- Produces: `listFeatures`, `getFeatureMatrix`, `setFeatureMatrix` — consumate da Task 6 (pannello e azione).

- [ ] **Step 1: Creare `lib/core/features/catalog.ts`**

```ts
import 'server-only';
import { asc } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { features, packageFeatures, type FeatureType } from '@/lib/db/schema';
import { assertAdmin } from './index';
import { listPackages, type PackageSummary } from './packages';
import type { FeatureCode } from './policy';

export type FeatureRow = {
  code: FeatureCode;
  label: string;
  description: string | null;
  type: FeatureType;
};

/** Il catalogo delle feature che il codice controlla davvero, in ordine di visualizzazione. */
export async function listFeatures(actorUserId: number): Promise<FeatureRow[]> {
  await assertAdmin(actorUserId);
  const rows = await db
    .select({
      code: features.code,
      label: features.label,
      description: features.description,
      type: features.type,
    })
    .from(features)
    .orderBy(asc(features.sortOrder), asc(features.id));
  return rows.map((row) => ({
    ...row,
    code: row.code as FeatureCode,
    type: row.type as FeatureType,
  }));
}

export type FeatureMatrixPackage = PackageSummary & {
  /** Chiave: codice feature. Assente = non inclusa. `null` = illimitata (solo numeriche). */
  cells: Record<string, number | null>;
};

export type FeatureMatrix = {
  features: FeatureRow[];
  packages: FeatureMatrixPackage[];
};

/**
 * Tutto quello che serve a disegnare la matrice: righe, colonne, celle.
 * I pacchetti vengono da `listPackages` (stessa lettura del selettore di
 * assegnazione, non una query duplicata).
 */
export async function getFeatureMatrix(actorUserId: number): Promise<FeatureMatrix> {
  await assertAdmin(actorUserId);

  const [featureRows, packageRows, cellRows] = await Promise.all([
    listFeatures(actorUserId),
    listPackages(actorUserId),
    db
      .select({
        packageId: packageFeatures.packageId,
        featureCode: packageFeatures.featureCode,
        value: packageFeatures.value,
      })
      .from(packageFeatures),
  ]);

  const cellsByPackage = new Map<number, Record<string, number | null>>();
  for (const cell of cellRows) {
    const entry = cellsByPackage.get(cell.packageId) ?? {};
    entry[cell.featureCode] = cell.value;
    cellsByPackage.set(cell.packageId, entry);
  }

  return {
    features: featureRows,
    packages: packageRows.map((pkg) => ({
      ...pkg,
      cells: cellsByPackage.get(pkg.id) ?? {},
    })),
  };
}

// `featureCode` è `string`, non `FeatureCode`: arriva da
// `parseFeatureMatrixSubmission` (lib/core/features/matrix-form.ts), un
// modulo puro deliberatamente scollegato dai tipi di `policy.ts`. È il
// vincolo di riferimento aggiunto in Task 1 — non questo tipo — a garantire
// che una riga non possa mai puntare a una feature inesistente.
export type FeatureMatrixEntry = {
  packageId: number;
  featureCode: string;
  value: number | null;
};

/**
 * Sostituisce l'intera matrice pacchetto×feature in una transazione sola:
 * una cella assente da `entries` non è inclusa in quel pacchetto. Un solo
 * pulsante "Salva" per l'intera griglia si traduce in una sola chiamata
 * qui, mai una per pacchetto.
 */
export async function setFeatureMatrix(params: {
  actorUserId: number;
  entries: FeatureMatrixEntry[];
}): Promise<void> {
  await assertAdmin(params.actorUserId);
  await db.transaction(async (tx) => {
    await tx.delete(packageFeatures);
    if (params.entries.length > 0) {
      await tx.insert(packageFeatures).values(
        params.entries.map((entry) => ({
          packageId: entry.packageId,
          featureCode: entry.featureCode,
          value: entry.value,
          createdBy: params.actorUserId,
        }))
      );
    }
  });
}
```

- [ ] **Step 2: Verificare che compili**

Run: `npx tsc --noEmit`
Expected: nessun errore nuovo.

- [ ] **Step 3: Commit**

```bash
git add lib/core/features/catalog.ts
git commit -m "$(cat <<'EOF'
feat(features): catalogo e matrice pacchetto×feature

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Pannello admin — la matrice, e il pacchetto corrente nella sezione organizzazioni

**Files:**
- Modify: `app/(dashboard)/dashboard/admin/packages/actions.ts`
- Modify: `app/(dashboard)/dashboard/admin/packages/page.tsx`

**Interfaces:**
- Consumes: `listFeatures`, `getFeatureMatrix`, `setFeatureMatrix` (Task 5); `PackageSummary`, `getCurrentOrganizationPackage` (Task 4); `parseFeatureMatrixSubmission`, `matrixCellFieldName` (Task 3).

- [ ] **Step 1: Sostituire `updatePackageFeaturesAction` con `updateFeatureMatrixAction`**

In `app/(dashboard)/dashboard/admin/packages/actions.ts`, trovare l'import:

```ts
import {
  assignPackageToOrganization,
  createPackage,
  revokeOrganizationPackage,
  setPackageFeatures,
} from '@/lib/core/features/packages';
import { FEATURE_CODES, type FeatureCode } from '@/lib/core/features';
```

sostituire con:

```ts
import {
  assignPackageToOrganization,
  createPackage,
  revokeOrganizationPackage,
} from '@/lib/core/features/packages';
import { getFeatureMatrix, setFeatureMatrix } from '@/lib/core/features/catalog';
import { parseFeatureMatrixSubmission } from '@/lib/core/features/matrix-form';
```

Poi trovare (subito sotto gli import, prima di `friendlyError`):

```ts
const KNOWN_FEATURE_CODES = Object.values(FEATURE_CODES) as FeatureCode[];

```

ed eliminare quella riga (non serve più: la matrice legge le feature dal
catalogo a database, non da una lista fissa).

Poi trovare l'intera funzione:

```ts
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
    return { error: friendlyError(error, 'Impossibile aggiornare le feature.') };
  }

  revalidatePath('/dashboard/admin/packages');
  return { success: 'Feature aggiornate.' };
}
```

sostituire con:

```ts
export async function updateFeatureMatrixAction(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  const admin = await requireRole('admin');
  const matrix = await getFeatureMatrix(admin.id);

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
```

- [ ] **Step 2: Verificare che compili**

Run: `npx tsc --noEmit`
Expected: nessun errore nuovo.

- [ ] **Step 3: Riscrivere la pagina**

Sostituire l'intero contenuto di
`app/(dashboard)/dashboard/admin/packages/page.tsx` con:

```tsx
import { requireRole } from '@/lib/core/auth';
import { getFeatureMatrix } from '@/lib/core/features/catalog';
import {
  getCurrentOrganizationPackage,
} from '@/lib/core/features/packages';
import { listOrganizationMembers, searchOrganizations } from '@/lib/core/organizations';
import { matrixCellFieldName } from '@/lib/core/features/matrix-form';
import { ActionForm } from '@/components/action-form';
import { Button } from '@/components/ui/button';
import {
  addOrganizationMemberAction,
  assignPackageToOrganizationAction,
  createPackageAction,
  revokeOrganizationPackageAction,
  updateFeatureMatrixAction,
} from './actions';

export const dynamic = 'force-dynamic';

export default async function AdminPackagesPage({
  searchParams,
}: {
  searchParams: Promise<{ orgQuery?: string }>;
}) {
  const admin = await requireRole('admin');
  const { orgQuery = '' } = await searchParams;

  const [matrix, organizationResults] = await Promise.all([
    getFeatureMatrix(admin.id),
    searchOrganizations(admin.id, orgQuery),
  ]);

  const organizationsWithDetail = await Promise.all(
    organizationResults.map(async (org) => ({
      ...org,
      members: await listOrganizationMembers(admin.id, org.id),
      currentPackage: await getCurrentOrganizationPackage(admin.id, org.id),
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
          <ActionForm action={updateFeatureMatrixAction} className="mt-4">
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse text-sm">
                <thead>
                  <tr>
                    <th className="border-b border-gray-200 px-3 py-2 text-left font-semibold text-gray-700">
                      Funzionalità
                    </th>
                    {matrix.packages.map((pkg) => (
                      <th
                        key={pkg.id}
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
                      <td className="px-3 py-2">
                        <div className="font-medium text-gray-900">{feature.label}</div>
                        {feature.description && (
                          <div className="text-xs text-gray-500">{feature.description}</div>
                        )}
                      </td>
                      {matrix.packages.map((pkg) => {
                        const fieldName = matrixCellFieldName(pkg.id, feature.code);
                        const currentValue = pkg.cells[feature.code];
                        const isIncluded = feature.code in pkg.cells;
                        return (
                          <td key={pkg.id} className="px-3 py-2 text-center">
                            {feature.type === 'boolean' ? (
                              <input
                                type="checkbox"
                                name={fieldName}
                                defaultChecked={isIncluded}
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
          {organizationsWithDetail.map((org) => (
            <li key={org.id} className="rounded-lg border border-gray-100 p-3">
              <p className="font-medium text-gray-900">
                {org.name} <span className="text-xs font-normal text-gray-400">({org.memberCount} membri)</span>
              </p>
              <p className="mt-1 text-xs text-gray-500">
                {org.members.map((m) => m.displayName).join(', ') || 'nessun membro'}
              </p>

              {org.currentPackage ? (
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-gray-50 px-3 py-2 text-sm">
                  <span>
                    Pacchetto attuale: <strong>{org.currentPackage.packageName}</strong> — {org.currentPackage.status}
                    {org.currentPackage.expiresAt
                      ? ` (scade ${org.currentPackage.expiresAt.toLocaleDateString('it-IT', { timeZone: 'Europe/Rome' })})`
                      : ''}
                  </span>
                  <ActionForm
                    action={revokeOrganizationPackageAction}
                    confirmTitle="Revocare il pacchetto?"
                    confirmMessage={`${org.name} perderà l'accesso alle feature di questo pacchetto per tutti i suoi membri.`}
                    confirmActionLabel="Revoca"
                  >
                    <input type="hidden" name="organizationId" value={org.id} />
                    <Button type="submit" variant="outline" className="h-8 px-3 text-xs">
                      Revoca
                    </Button>
                  </ActionForm>
                </div>
              ) : (
                <p className="mt-2 text-xs text-gray-400">Nessun pacchetto attivo.</p>
              )}

              <ActionForm
                action={assignPackageToOrganizationAction}
                className="mt-2 flex flex-wrap items-center gap-2"
                confirmTitle="Assegnare il pacchetto?"
                confirmMessage={`Se ${org.name} ha già un pacchetto attivo, verrà sostituito.`}
                confirmActionLabel="Assegna"
              >
                <input type="hidden" name="organizationId" value={org.id} />
                <select name="packageId" required className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm">
                  {matrix.packages.map((pkg) => (
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

Nota sul `defaultChecked`/`defaultValue` sopra: `isIncluded` e `currentValue`
leggono entrambi da `pkg.cells` — `feature.code in pkg.cells` è `true` sia
per una feature booleana inclusa sia per una numerica con un valore (anche
`null`, perché la chiave esiste comunque nell'oggetto).

- [ ] **Step 4: Verificare che compili**

Run: `npx tsc --noEmit`
Expected: nessun errore nuovo.

- [ ] **Step 5: Verificare senza una sessione admin vera**

Stessa procedura già stabilita per questo pannello — niente account admin
di prova, `npm run dev` prende un 307 dal middleware prima di compilare la
pagina.

1. Run: `npx next build` — deve completare senza errori sulla rotta
   `/dashboard/admin/packages`.
2. Se praticabile, un render statico con dati finti (una matrice con 2
   pacchetti e la riga `AI_SESSION_NOTES`, un'organizzazione con un
   pacchetto corrente e una senza) fotografato con Playwright, scritto in
   uno script temporaneo dentro il progetto (es. `tmp/render-matrix.tsx`,
   cancellato al termine — non fa parte della consegna). Se il costo di
   allestirlo per questa pagina è alto, fermarsi al build e dichiararlo
   esplicitamente nel report, senza sottintendere una verifica più ampia
   di quella fatta.

- [ ] **Step 6: Commit**

```bash
git add "app/(dashboard)/dashboard/admin/packages/actions.ts" "app/(dashboard)/dashboard/admin/packages/page.tsx"
git commit -m "$(cat <<'EOF'
feat(admin): matrice funzionalità×pacchetti sostituisce l'elenco a schede

La sezione "assegna a organizzazione" guadagna la vista del pacchetto
corrente, che prima viveva nelle schede rimosse.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Verifica finale

**Files:** nessuno (solo comandi)

- [ ] **Step 1: Suite completa**

Run: `npm test`
Expected: PASS, incluso `matrix-form.test.ts`.

- [ ] **Step 2: Typecheck completo**

Run: `npx tsc --noEmit`
Expected: nessun errore nuovo (i due preesistenti e scollegati restano).

- [ ] **Step 3: Rileggere lo spec e spuntare la copertura**

Confrontare `docs/superpowers/specs/2026-09-07-matrice-funzionalita-piani-design.md`
con quanto implementato: catalogo `features` a DB ✓, colonna `value` +
vincolo di riferimento ✓, seed della sola riga `AI_SESSION_NOTES` ✓,
matrice con un solo "Salva" ✓, nessun seed per i pacchetti (creabili dal
pannello) ✓, sezione organizzazione invariata nel comportamento (più la
vista del pacchetto corrente) ✓.

- [ ] **Step 4: Aggiornare lo stato dello spec**

In `docs/superpowers/specs/2026-09-07-matrice-funzionalita-piani-design.md`,
cambiare:

```
**Stato:** disegno approvato, da implementare
```

in:

```
**Stato:** implementato
```

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-09-07-matrice-funzionalita-piani-design.md
git commit -m "$(cat <<'EOF'
docs: segna come implementata la specifica sulla matrice

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```
