# Academy (corsi per coach) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an Academy subsystem — courses made of modules, admin-managed, assigned to individual coaches — with an admin config+monitoring page, a read-only coach progress tab, and a completed-course badge on the public coach profile.

**Architecture:** Five additive tables (`academy_courses` → `academy_course_modules` → `academy_module_attachments`; `academy_course_assignments` → `academy_module_completions`), two pure `lib/core/academy` modules (`course-hours.ts`, `assignment-progress.ts`) with their own tests, and two DB-facing orchestration modules (`courses.ts`, `assignments.ts`) that reuse the pure logic so the total-hours figure and the assignment-completion state are computed the same way everywhere they appear (admin monitoring, coach tab, public badge). The admin course-detail page carries both configuration (modules, status, assignment) and monitoring (who's assigned, their per-module progress, mark-complete) — the "one page, two sections" the spec calls for lives at the per-course level, with the top-level `/dashboard/admin/academy` page as the course index.

**Tech Stack:** Next.js 15 / React 19 server components, Drizzle ORM (`postgres-js` driver), `tsx --test` + `node:assert/strict` for pure-logic tests, Tailwind CSS 4, lucide-react icons.

## Global Constraints

- The database is production — `.env.local`, Preview and Production are the same Supabase project (see `database-migrations` skill). The migration is generated and shown before it is ever run; `npm run db:migrate` is a separate, explicitly-confirmed final task, not bundled into any other step.
- Audit columns follow the house style already used by `packages`/`features`/`system_config`: `createddate`/`createdby`/`updateddate`/`updatedby` (no underscore), FK to `users.id` with `onDelete: 'set null'`.
- Closed sets (`status` columns) are enforced with a Postgres `CHECK`, not only in TypeScript.
- Decimal hours use `real`, not `numeric` — `numeric` is not used anywhere in this schema and returns as a string from the Postgres driver; `real` (already used for `confidence` in `session_transcript_segments`) returns a plain JS `number`.
- Only `admin` can create/configure/assign/complete anything in this phase; the coach view is read-only.
- No admin test account exists locally (`lib/auth/demo-login.ts` has only `coachdemo@`/`atletademo@`). Admin-page verification is `npx tsc --noEmit` + `next build` + render-with-fake-data screenshot, never a real admin session — say so explicitly when reporting status.
- Spec: `docs/superpowers/specs/2026-09-17-academy-corsi-design.md`.

---

### Task 1: Schema — five new tables, extended audit enums

**Files:**
- Modify: `lib/db/schema.ts` (append near the end, after `systemConfig`, and edit `ADMIN_AUDIT_ACTIONS`/`ADMIN_AUDIT_SUBJECTS` around line 3333–3364)
- Modify: `lib/core/admin/admin-audit-policy.ts` (extend `ADMIN_AUDIT_ACTION_LABEL`)

**Interfaces:**
- Produces: `academyCourses`, `academyCourseModules`, `academyModuleAttachments`, `academyCourseAssignments`, `academyModuleCompletions` tables; `ACADEMY_COURSE_STATUSES`, `AcademyCourseStatus`, `ACADEMY_ASSIGNMENT_STATUSES`, `AcademyAssignmentStatus` types; `AcademyCourse`, `NewAcademyCourse`, `AcademyCourseModule`, `NewAcademyCourseModule`, `AcademyModuleAttachment`, `NewAcademyModuleAttachment`, `AcademyCourseAssignment`, `NewAcademyCourseAssignment`, `AcademyModuleCompletion`, `NewAcademyModuleCompletion` — all consumed by Tasks 5, 6, 8, 12, 13.

- [ ] **Step 1: Append the five tables to `lib/db/schema.ts`**

Add this block after the `systemConfig` export (end of file, after line ~3461 `export type NewSystemConfig = ...`):

```ts
export const ACADEMY_COURSE_STATUSES = ['draft', 'active', 'cancelled'] as const;
export type AcademyCourseStatus = (typeof ACADEMY_COURSE_STATUSES)[number];

/**
 * Un corso dell'Academy — moduli, ore e stato vivono qui. Le ore totali non
 * sono una colonna: si calcolano sempre da `academyCourseModules` via
 * `courseTotalHours` (lib/core/academy/course-hours.ts), così il numero
 * mostrato all'admin, al coach e sul badge pubblico non può disallinearsi.
 */
export const academyCourses = pgTable(
  'academy_courses',
  {
    id: serial('id').primaryKey(),
    title: varchar('title', { length: 200 }).notNull(),
    description: text('description'),
    status: varchar('status', { length: 20 }).notNull().default('draft'),
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
      'academy_courses_status_check',
      sql`${table.status} in ('draft', 'active', 'cancelled')`
    ),
  ]
);

export type AcademyCourse = typeof academyCourses.$inferSelect;
export type NewAcademyCourse = typeof academyCourses.$inferInsert;

export const academyCourseModules = pgTable(
  'academy_course_modules',
  {
    id: serial('id').primaryKey(),
    courseId: integer('course_id')
      .notNull()
      .references(() => academyCourses.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 200 }).notNull(),
    description: text('description'),
    hours: real('hours').notNull().default(0),
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
    index('academy_course_modules_course_idx').on(
      table.courseId,
      table.sortOrder
    ),
    check('academy_course_modules_hours_check', sql`${table.hours} >= 0`),
  ]
);

export type AcademyCourseModule = typeof academyCourseModules.$inferSelect;
export type NewAcademyCourseModule = typeof academyCourseModules.$inferInsert;

/**
 * File allegati a un modulo (slide, PDF). Solo la chiave dell'oggetto è
 * salvata qui — il file vive nel bucket privato (pattern `storePrivateFile`),
 * servito da una route autorizzata che non fa parte di questa prima fase.
 */
export const academyModuleAttachments = pgTable(
  'academy_module_attachments',
  {
    id: serial('id').primaryKey(),
    moduleId: integer('module_id')
      .notNull()
      .references(() => academyCourseModules.id, { onDelete: 'cascade' }),
    fileName: varchar('file_name', { length: 255 }).notNull(),
    storageKey: text('storage_key').notNull(),
    contentType: varchar('content_type', { length: 100 }).notNull(),
    fileSizeBytes: integer('file_size_bytes').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    createdDate: timestamp('createddate', { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdBy: integer('createdby').references(() => users.id, {
      onDelete: 'set null',
    }),
  },
  (table) => [
    index('academy_module_attachments_module_idx').on(table.moduleId),
  ]
);

export type AcademyModuleAttachment =
  typeof academyModuleAttachments.$inferSelect;
export type NewAcademyModuleAttachment =
  typeof academyModuleAttachments.$inferInsert;

export const ACADEMY_ASSIGNMENT_STATUSES = [
  'assigned',
  'in_progress',
  'completed',
] as const;
export type AcademyAssignmentStatus =
  (typeof ACADEMY_ASSIGNMENT_STATUSES)[number];

/**
 * Un corso assegnato a un coach dall'admin — mai auto-iscrizione. `status`
 * non è mai scritto a mano: è sempre `computeAssignmentStatus`
 * (lib/core/academy/assignment-progress.ts) applicato ai moduli del corso e
 * ai completamenti registrati.
 */
export const academyCourseAssignments = pgTable(
  'academy_course_assignments',
  {
    id: serial('id').primaryKey(),
    courseId: integer('course_id')
      .notNull()
      .references(() => academyCourses.id, { onDelete: 'cascade' }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: varchar('status', { length: 20 }).notNull().default('assigned'),
    assignedDate: timestamp('assigned_date', { withTimezone: true })
      .notNull()
      .defaultNow(),
    assignedBy: integer('assigned_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    completedDate: timestamp('completed_date', { withTimezone: true }),
  },
  (table) => [
    unique('academy_course_assignments_course_user_unique').on(
      table.courseId,
      table.userId
    ),
    index('academy_course_assignments_user_idx').on(table.userId),
    check(
      'academy_course_assignments_status_check',
      sql`${table.status} in ('assigned', 'in_progress', 'completed')`
    ),
  ]
);

export type AcademyCourseAssignment =
  typeof academyCourseAssignments.$inferSelect;
export type NewAcademyCourseAssignment =
  typeof academyCourseAssignments.$inferInsert;

export const academyModuleCompletions = pgTable(
  'academy_module_completions',
  {
    id: serial('id').primaryKey(),
    assignmentId: integer('assignment_id')
      .notNull()
      .references(() => academyCourseAssignments.id, { onDelete: 'cascade' }),
    moduleId: integer('module_id')
      .notNull()
      .references(() => academyCourseModules.id, { onDelete: 'cascade' }),
    completedDate: timestamp('completed_date', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique('academy_module_completions_assignment_module_unique').on(
      table.assignmentId,
      table.moduleId
    ),
  ]
);

export type AcademyModuleCompletion =
  typeof academyModuleCompletions.$inferSelect;
export type NewAcademyModuleCompletion =
  typeof academyModuleCompletions.$inferInsert;
```

- [ ] **Step 2: Extend `ADMIN_AUDIT_ACTIONS` and `ADMIN_AUDIT_SUBJECTS`**

In `lib/db/schema.ts`, find `export const ADMIN_AUDIT_ACTIONS = [` (around line 3333) and add six entries right before the closing `] as const;`:

```ts
  'academy_course_created',
  'academy_course_status_changed',
  'academy_module_saved',
  'academy_course_assigned',
  'academy_course_assignment_revoked',
  'academy_module_completed',
```

Find `export const ADMIN_AUDIT_SUBJECTS = [` (a few lines below) and add one entry before its closing `] as const;`:

```ts
  'academy_course',
```

- [ ] **Step 3: Add labels in `lib/core/admin/admin-audit-policy.ts`**

In `ADMIN_AUDIT_ACTION_LABEL`, add six entries (any position, grouped at the end is fine):

```ts
  academy_course_created: 'Corso Academy creato',
  academy_course_status_changed: 'Stato corso Academy cambiato',
  academy_module_saved: 'Modulo Academy salvato',
  academy_course_assigned: 'Corso Academy assegnato a un coach',
  academy_course_assignment_revoked: 'Assegnazione Academy revocata',
  academy_module_completed: 'Modulo Academy segnato completato',
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors (existing pre-task errors, if any, are unrelated — do not fix unrelated errors in this task).

- [ ] **Step 5: Commit**

```bash
git add lib/db/schema.ts lib/core/admin/admin-audit-policy.ts
git commit -m "feat(academy): add courses/modules/attachments/assignments/completions schema"
```

---

### Task 2: Generate and annotate the migration (do not run yet)

**Files:**
- Create (generated): `lib/db/migrations/0077_<auto-name>.sql`
- Modify: that same file, by hand, to add the top comment

**Interfaces:**
- Consumes: the schema from Task 1.
- Produces: a reviewed, not-yet-applied SQL migration. Task 15 is the only task that runs it.

- [ ] **Step 1: Generate**

Run: `npm run db:generate`
Expected: a new file `lib/db/migrations/0077_<something>.sql` and an updated `lib/db/migrations/meta/_journal.json` with `idx: 77`.

- [ ] **Step 2: Read the generated SQL in full**

Open the new file. Confirm it is purely additive: five `CREATE TABLE` statements, FK `ALTER TABLE ... ADD CONSTRAINT`, index creation, and the two `admin_audit_events` CHECK constraints being dropped and recreated with the longer list (same shape as `0061_pacchetti-organizzazioni.sql`). If `db:generate` produced anything else — a `DROP`, a rewritten existing table — stop and report it instead of proceeding; that would mean the schema diff picked up an unrelated drift.

- [ ] **Step 3: Add the "why" comment and lock down grants**

At the top of the generated file, before the first `CREATE TABLE`, add:

```sql
-- Academy: corsi di formazione per i coach, gestiti dall'admin (vedi
-- docs/superpowers/specs/2026-09-17-academy-corsi-design.md).
--
-- Nessun client legge queste tabelle direttamente: la configurazione
-- (/dashboard/admin/academy) e la lettura coach (/dashboard/coach/academy)
-- passano sempre dal server, dopo `requireRole('admin')` o
-- `requireRole('coach')`. Stessa postura di `packages`/`organization_packages`
-- (migrazione 0061): RLS abilitata, nessuna concessione a `anon`/`authenticated`.
```

At the end of the file (after the last statement), add — matching the `REVOKE`/`ENABLE ROW LEVEL SECURITY` block at the bottom of `0061_pacchetti-organizzazioni.sql`:

```sql
--> statement-breakpoint

REVOKE ALL ON "public"."academy_courses" FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON "public"."academy_course_modules" FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON "public"."academy_module_attachments" FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON "public"."academy_course_assignments" FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON "public"."academy_module_completions" FROM anon, authenticated;--> statement-breakpoint

REVOKE ALL ON SEQUENCE "public"."academy_courses_id_seq" FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON SEQUENCE "public"."academy_course_modules_id_seq" FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON SEQUENCE "public"."academy_module_attachments_id_seq" FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON SEQUENCE "public"."academy_course_assignments_id_seq" FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON SEQUENCE "public"."academy_module_completions_id_seq" FROM anon, authenticated;--> statement-breakpoint

ALTER TABLE "academy_courses" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "academy_course_modules" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "academy_module_attachments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "academy_course_assignments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "academy_module_completions" ENABLE ROW LEVEL SECURITY;
```

(Adjust table names in the `REVOKE`/`ENABLE` block only if `db:generate` produced different literal identifiers than expected — the schema in Task 1 names them exactly as above, so it should match.)

- [ ] **Step 4: Commit**

```bash
git add lib/db/migrations/0077_*.sql lib/db/migrations/meta/_journal.json
git commit -m "feat(academy): migration for courses/modules/attachments/assignments/completions"
```

**Do not run `npm run db:migrate` in this task.** That is Task 15, after everything else is built and reviewed — the target database is production (see Global Constraints).

---

### Task 3: Pure module — `courseTotalHours`

**Files:**
- Create: `lib/core/academy/course-hours.ts`
- Test: `lib/core/academy/course-hours.test.ts`

**Interfaces:**
- Produces: `CourseModuleHours` type, `courseTotalHours(modules: readonly CourseModuleHours[]): number` — consumed by Task 5 (`courses.ts`).

- [ ] **Step 1: Write the failing test**

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { courseTotalHours } from './course-hours';

test('sums module hours, including decimals', () => {
  assert.equal(
    courseTotalHours([{ hours: 1.5 }, { hours: 2 }, { hours: 3 }]),
    6.5
  );
});

test('a course with no modules has zero hours', () => {
  assert.equal(courseTotalHours([]), 0);
});

test('a non-finite hours value is treated as zero instead of poisoning the sum', () => {
  assert.equal(courseTotalHours([{ hours: 2 }, { hours: Number.NaN }]), 2);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test lib/core/academy/course-hours.test.ts`
Expected: FAIL — `Cannot find module './course-hours'` (file does not exist yet).

- [ ] **Step 3: Write the implementation**

```ts
export type CourseModuleHours = { hours: number };

/**
 * Le ore totali di un corso — sempre questa funzione, mai una colonna
 * separata: `academyCourses` non ha un campo "ore totali" apposta perché
 * possa disallinearsi dai moduli reali (vedi la spec).
 */
export function courseTotalHours(
  modules: readonly CourseModuleHours[]
): number {
  return modules.reduce(
    (sum, module) => sum + (Number.isFinite(module.hours) ? module.hours : 0),
    0
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test lib/core/academy/course-hours.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/core/academy/course-hours.ts lib/core/academy/course-hours.test.ts
git commit -m "feat(academy): pure courseTotalHours module"
```

---

### Task 4: Pure module — `computeAssignmentStatus`

**Files:**
- Create: `lib/core/academy/assignment-progress.ts`
- Test: `lib/core/academy/assignment-progress.test.ts`

**Interfaces:**
- Consumes: `AcademyAssignmentStatus` type from `@/lib/db/schema` (Task 1), import-type only.
- Produces: `computeAssignmentStatus(moduleIds: readonly number[], completedModuleIds: readonly number[]): AcademyAssignmentStatus` — consumed by Task 6 (`assignments.ts`, both `markModuleComplete` and `recomputeAssignmentStatuses`) and by Task 5 (`courses.ts`'s `createModule`, indirectly via Task 6's `recomputeAssignmentStatuses`).

- [ ] **Step 1: Write the failing test**

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { computeAssignmentStatus } from './assignment-progress';

test('a course with no modules is assigned, never completed', () => {
  assert.equal(computeAssignmentStatus([], []), 'assigned');
});

test('zero modules completed is assigned', () => {
  assert.equal(computeAssignmentStatus([1, 2, 3], []), 'assigned');
});

test('some but not all modules completed is in_progress', () => {
  assert.equal(computeAssignmentStatus([1, 2, 3], [1]), 'in_progress');
  assert.equal(computeAssignmentStatus([1, 2, 3], [1, 2]), 'in_progress');
});

test('every module completed is completed', () => {
  assert.equal(computeAssignmentStatus([1, 2, 3], [1, 2, 3]), 'completed');
});

test('completion ids not in the current module set do not count', () => {
  // Modulo 4 non fa più parte del corso (o non ne ha mai fatto parte):
  // completarlo non basta a completare i 3 moduli attuali.
  assert.equal(computeAssignmentStatus([1, 2, 3], [1, 2, 4]), 'in_progress');
});

test('a module added after completion reopens the assignment', () => {
  // Prima: 2 moduli, entrambi completati -> completed.
  assert.equal(computeAssignmentStatus([1, 2], [1, 2]), 'completed');
  // Un modulo 3 si aggiunge al corso: lo stesso insieme di completamenti
  // non copre più tutti i moduli attuali -> torna in_progress.
  assert.equal(computeAssignmentStatus([1, 2, 3], [1, 2]), 'in_progress');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test lib/core/academy/assignment-progress.test.ts`
Expected: FAIL — `Cannot find module './assignment-progress'`.

- [ ] **Step 3: Write the implementation**

```ts
import type { AcademyAssignmentStatus } from '@/lib/db/schema';

export type { AcademyAssignmentStatus };

/**
 * Lo stato di un'assegnazione, sempre derivato — mai una bandiera scritta e
 * poi lasciata a sé stessa. Usata sia quando un modulo viene segnato
 * completato (`markModuleComplete`) sia quando un modulo nuovo si aggiunge a
 * un corso che aveva già assegnazioni `completed` (`createModule`): in
 * entrambi i casi lo stato si ricalcola da zero dai moduli attuali del corso
 * e dai completamenti registrati, non si aggiorna in modo incrementale.
 */
export function computeAssignmentStatus(
  moduleIds: readonly number[],
  completedModuleIds: readonly number[]
): AcademyAssignmentStatus {
  if (moduleIds.length === 0) return 'assigned';
  const completed = new Set(completedModuleIds);
  const completedCount = moduleIds.filter((id) => completed.has(id)).length;
  if (completedCount === 0) return 'assigned';
  if (completedCount === moduleIds.length) return 'completed';
  return 'in_progress';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test lib/core/academy/assignment-progress.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/core/academy/assignment-progress.ts lib/core/academy/assignment-progress.test.ts
git commit -m "feat(academy): pure computeAssignmentStatus module"
```

---

### Task 5: `lib/core/academy/courses.ts` — course and module orchestration

**Files:**
- Create: `lib/core/academy/courses.ts`

**Interfaces:**
- Consumes: `academyCourses`, `academyCourseModules`, `AcademyCourse`, `AcademyCourseModule`, `AcademyCourseStatus` from `@/lib/db/schema` (Task 1); `courseTotalHours` from `./course-hours` (Task 3); `assertAdmin` from `@/lib/core/features`; `recomputeAssignmentStatuses` from `./assignments` (Task 6 — written next, but referenced here; Task 6 must land before this file typechecks cleanly against a real DB, though both can be authored in either order since it's just an import).
- Produces: `CourseSummary`, `listCourses(actorUserId): Promise<CourseSummary[]>`, `createCourse(params): Promise<AcademyCourse>`, `updateCourseStatus(params): Promise<void>`, `CourseDetail`, `getCourseDetail(actorUserId, courseId): Promise<CourseDetail | null>`, `createModule(params): Promise<AcademyCourseModule>`, `updateModule(params): Promise<void>` — consumed by Task 8 (admin actions) and Task 10/11 (admin pages).

Note: this task and Task 6 reference each other (`courses.ts` calls `recomputeAssignmentStatuses` from `assignments.ts`, no reverse dependency). Write Task 6 first if your tool flags the missing import; the plan lists schema before both because both depend on it, not because of ordering between them.

- [ ] **Step 1: Write `lib/core/academy/courses.ts`**

```ts
import 'server-only';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  academyCourses,
  academyCourseModules,
  type AcademyCourse,
  type AcademyCourseModule,
  type AcademyCourseStatus,
} from '@/lib/db/schema';
import { assertAdmin } from '@/lib/core/features';
import { courseTotalHours } from './course-hours';
import { recomputeAssignmentStatuses } from './assignments';

export type CourseSummary = {
  id: number;
  title: string;
  status: AcademyCourseStatus;
  totalHours: number;
};

/**
 * Le ore totali si calcolano qui raggruppando tutti i moduli in memoria e
 * passandoli a `courseTotalHours`, non con una `SUM` SQL: così il numero
 * mostrato in questa lista è calcolato dalla stessa funzione usata da
 * `getCourseDetail`, dalla vista coach e dal badge pubblico.
 */
export async function listCourses(actorUserId: number): Promise<CourseSummary[]> {
  await assertAdmin(actorUserId);

  const [courses, moduleRows] = await Promise.all([
    db
      .select({
        id: academyCourses.id,
        title: academyCourses.title,
        status: academyCourses.status,
      })
      .from(academyCourses)
      .orderBy(academyCourses.id),
    db
      .select({
        courseId: academyCourseModules.courseId,
        hours: academyCourseModules.hours,
      })
      .from(academyCourseModules),
  ]);

  const hoursByCourseId = new Map<number, { hours: number }[]>();
  for (const row of moduleRows) {
    const list = hoursByCourseId.get(row.courseId);
    if (list) list.push({ hours: row.hours });
    else hoursByCourseId.set(row.courseId, [{ hours: row.hours }]);
  }

  return courses.map((course) => ({
    id: course.id,
    title: course.title,
    status: course.status as AcademyCourseStatus,
    totalHours: courseTotalHours(hoursByCourseId.get(course.id) ?? []),
  }));
}

export async function createCourse(params: {
  actorUserId: number;
  title: string;
  description: string | null;
}): Promise<AcademyCourse> {
  await assertAdmin(params.actorUserId);
  const [created] = await db
    .insert(academyCourses)
    .values({
      title: params.title,
      description: params.description,
      createdBy: params.actorUserId,
      updatedBy: params.actorUserId,
    })
    .returning();
  return created;
}

export async function updateCourseStatus(params: {
  actorUserId: number;
  courseId: number;
  status: AcademyCourseStatus;
}): Promise<void> {
  await assertAdmin(params.actorUserId);
  await db
    .update(academyCourses)
    .set({
      status: params.status,
      updatedDate: new Date(),
      updatedBy: params.actorUserId,
    })
    .where(eq(academyCourses.id, params.courseId));
}

export type CourseDetail = {
  id: number;
  title: string;
  description: string | null;
  status: AcademyCourseStatus;
  totalHours: number;
  modules: {
    id: number;
    title: string;
    description: string | null;
    hours: number;
    sortOrder: number;
  }[];
};

export async function getCourseDetail(
  actorUserId: number,
  courseId: number
): Promise<CourseDetail | null> {
  await assertAdmin(actorUserId);

  const [course] = await db
    .select({
      id: academyCourses.id,
      title: academyCourses.title,
      description: academyCourses.description,
      status: academyCourses.status,
    })
    .from(academyCourses)
    .where(eq(academyCourses.id, courseId))
    .limit(1);
  if (!course) return null;

  const modules = await db
    .select({
      id: academyCourseModules.id,
      title: academyCourseModules.title,
      description: academyCourseModules.description,
      hours: academyCourseModules.hours,
      sortOrder: academyCourseModules.sortOrder,
    })
    .from(academyCourseModules)
    .where(eq(academyCourseModules.courseId, courseId))
    .orderBy(asc(academyCourseModules.sortOrder), asc(academyCourseModules.id));

  return {
    id: course.id,
    title: course.title,
    description: course.description,
    status: course.status as AcademyCourseStatus,
    totalHours: courseTotalHours(modules),
    modules,
  };
}

/**
 * Un modulo nuovo su un corso già `completed` per qualcuno riapre
 * l'assegnazione: il nuovo modulo non è tra i completamenti registrati, e
 * `recomputeAssignmentStatuses` (lib/core/academy/assignments.ts) lo
 * riflette invece di lasciare uno stato "completato" che non lo è più.
 */
export async function createModule(params: {
  actorUserId: number;
  courseId: number;
  title: string;
  description: string | null;
  hours: number;
  sortOrder: number;
}): Promise<AcademyCourseModule> {
  await assertAdmin(params.actorUserId);
  if (!Number.isFinite(params.hours) || params.hours < 0) {
    throw new Error('Le ore del modulo devono essere un numero maggiore o uguale a zero.');
  }

  return db.transaction(async (tx) => {
    const [module] = await tx
      .insert(academyCourseModules)
      .values({
        courseId: params.courseId,
        title: params.title,
        description: params.description,
        hours: params.hours,
        sortOrder: params.sortOrder,
        createdBy: params.actorUserId,
        updatedBy: params.actorUserId,
      })
      .returning();

    await recomputeAssignmentStatuses(tx, params.courseId);

    return module;
  });
}

export async function updateModule(params: {
  actorUserId: number;
  moduleId: number;
  title: string;
  description: string | null;
  hours: number;
  sortOrder: number;
}): Promise<void> {
  await assertAdmin(params.actorUserId);
  if (!Number.isFinite(params.hours) || params.hours < 0) {
    throw new Error('Le ore del modulo devono essere un numero maggiore o uguale a zero.');
  }
  await db
    .update(academyCourseModules)
    .set({
      title: params.title,
      description: params.description,
      hours: params.hours,
      sortOrder: params.sortOrder,
      updatedDate: new Date(),
      updatedBy: params.actorUserId,
    })
    .where(eq(academyCourseModules.id, params.moduleId));
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: fails only if Task 6 has not been written yet (missing `./assignments` export). If so, proceed to Task 6 and return here — do not stub the import.

- [ ] **Step 3: Commit** (after Task 6 exists and typecheck is clean)

```bash
git add lib/core/academy/courses.ts
git commit -m "feat(academy): course and module orchestration"
```

---

### Task 6: `lib/core/academy/assignments.ts` — assignment, monitoring, progress, badges

**Files:**
- Create: `lib/core/academy/assignments.ts`

**Interfaces:**
- Consumes: `academyCourses`, `academyCourseAssignments`, `academyCourseModules`, `academyModuleCompletions`, `providerProfiles`, `users`, `AcademyAssignmentStatus` from `@/lib/db/schema` (Task 1); `computeAssignmentStatus` from `./assignment-progress` (Task 4); `assertAdmin` from `@/lib/core/features`; `db`, `type Transaction` from `@/lib/db/drizzle`.
- Produces: `CoachOption`, `listCoachUsers(actorUserId): Promise<CoachOption[]>`; `assignCourseToUser(params): Promise<void>`; `revokeAssignment(params): Promise<void>`; `recomputeAssignmentStatuses(tx: Transaction, courseId: number): Promise<void>` (consumed by Task 5's `createModule`); `markModuleComplete(params): Promise<void>`; `AssignmentModuleProgress`, `CourseAssignmentMonitorRow`, `listAssignmentsForCourse(actorUserId, courseId): Promise<CourseAssignmentMonitorRow[]>`; `UserCourseProgress`, `listAssignmentsForUser(userId): Promise<UserCourseProgress[]>`; `CourseBadge`, `listCompletedCourseBadges(userId): Promise<CourseBadge[]>` — consumed by Task 5 (`recomputeAssignmentStatuses`), Task 8 (admin actions), Task 11 (admin course detail page), Task 12 (coach page), Task 13 (public profile).

- [ ] **Step 1: Write `lib/core/academy/assignments.ts`**

```ts
import 'server-only';
import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';
import { db, type Transaction } from '@/lib/db/drizzle';
import {
  academyCourses,
  academyCourseAssignments,
  academyCourseModules,
  academyModuleCompletions,
  providerProfiles,
  users,
  type AcademyAssignmentStatus,
} from '@/lib/db/schema';
import { assertAdmin } from '@/lib/core/features';
import { computeAssignmentStatus } from './assignment-progress';

function displayName(row: { name: string | null; lastName: string | null; email: string }): string {
  return [row.name, row.lastName].filter(Boolean).join(' ') || row.email;
}

export type CoachOption = { userId: number; displayName: string; email: string };

/** I coach a cui un corso può essere assegnato: profilo approvato, non demo, non cancellato. */
export async function listCoachUsers(actorUserId: number): Promise<CoachOption[]> {
  await assertAdmin(actorUserId);
  const rows = await db
    .select({
      userId: users.id,
      email: users.email,
      name: users.name,
      lastName: users.lastName,
    })
    .from(providerProfiles)
    .innerJoin(users, eq(users.id, providerProfiles.userId))
    .where(
      and(
        eq(providerProfiles.status, 'approved'),
        isNull(users.deletedAt),
        eq(users.isDemo, false)
      )
    )
    .orderBy(asc(users.email));
  return rows.map((row) => ({
    userId: row.userId,
    email: row.email,
    displayName: displayName(row),
  }));
}

export async function assignCourseToUser(params: {
  actorUserId: number;
  courseId: number;
  userId: number;
}): Promise<void> {
  await assertAdmin(params.actorUserId);
  await db.insert(academyCourseAssignments).values({
    courseId: params.courseId,
    userId: params.userId,
    assignedBy: params.actorUserId,
  });
}

/**
 * Revoca cancellando la riga (cascata sui completamenti) — nessuno stato
 * `revoked` con conservazione della storia in questa prima fase (vedi la
 * spec, "Cosa resta fuori").
 */
export async function revokeAssignment(params: {
  actorUserId: number;
  assignmentId: number;
}): Promise<void> {
  await assertAdmin(params.actorUserId);
  await db
    .delete(academyCourseAssignments)
    .where(eq(academyCourseAssignments.id, params.assignmentId));
}

/**
 * Ricalcola lo stato di ogni assegnazione di un corso dai completamenti
 * registrati — mai una scrittura isolata dello stato. Chiamata dentro una
 * transazione sia da `markModuleComplete` (qui sotto) sia da `createModule`
 * (lib/core/academy/courses.ts) quando un modulo nuovo si aggiunge a un
 * corso che aveva già assegnazioni `completed`.
 */
export async function recomputeAssignmentStatuses(
  tx: Transaction,
  courseId: number
): Promise<void> {
  const modules = await tx
    .select({ id: academyCourseModules.id })
    .from(academyCourseModules)
    .where(eq(academyCourseModules.courseId, courseId));
  const moduleIds = modules.map((m) => m.id);

  const assignments = await tx
    .select({ id: academyCourseAssignments.id })
    .from(academyCourseAssignments)
    .where(eq(academyCourseAssignments.courseId, courseId));

  for (const assignment of assignments) {
    const completions = await tx
      .select({ moduleId: academyModuleCompletions.moduleId })
      .from(academyModuleCompletions)
      .where(eq(academyModuleCompletions.assignmentId, assignment.id));
    const status = computeAssignmentStatus(
      moduleIds,
      completions.map((c) => c.moduleId)
    );
    await tx
      .update(academyCourseAssignments)
      .set({
        status,
        completedDate: status === 'completed' ? new Date() : null,
      })
      .where(eq(academyCourseAssignments.id, assignment.id));
  }
}

export async function markModuleComplete(params: {
  actorUserId: number;
  assignmentId: number;
  moduleId: number;
}): Promise<void> {
  await assertAdmin(params.actorUserId);
  await db.transaction(async (tx) => {
    const [assignment] = await tx
      .select({ courseId: academyCourseAssignments.courseId })
      .from(academyCourseAssignments)
      .where(eq(academyCourseAssignments.id, params.assignmentId))
      .limit(1);
    if (!assignment) throw new Error('Assegnazione non trovata.');

    await tx
      .insert(academyModuleCompletions)
      .values({ assignmentId: params.assignmentId, moduleId: params.moduleId })
      .onConflictDoNothing();

    await recomputeAssignmentStatuses(tx, assignment.courseId);
  });
}

export type AssignmentModuleProgress = {
  moduleId: number;
  title: string;
  sortOrder: number;
  completed: boolean;
};

function attachModuleProgress<T extends { assignmentId: number }>(
  assignments: T[],
  modules: { id: number; title: string; sortOrder: number }[],
  completedByAssignment: Map<number, Set<number>>
): (T & { modules: AssignmentModuleProgress[] })[] {
  return assignments.map((assignment) => {
    const completed = completedByAssignment.get(assignment.assignmentId) ?? new Set<number>();
    return {
      ...assignment,
      modules: modules.map((module) => ({
        moduleId: module.id,
        title: module.title,
        sortOrder: module.sortOrder,
        completed: completed.has(module.id),
      })),
    };
  });
}

async function completedModuleIdsByAssignment(
  assignmentIds: number[]
): Promise<Map<number, Set<number>>> {
  if (assignmentIds.length === 0) return new Map();
  const rows = await db
    .select({
      assignmentId: academyModuleCompletions.assignmentId,
      moduleId: academyModuleCompletions.moduleId,
    })
    .from(academyModuleCompletions)
    .where(inArray(academyModuleCompletions.assignmentId, assignmentIds));
  const map = new Map<number, Set<number>>();
  for (const row of rows) {
    const set = map.get(row.assignmentId);
    if (set) set.add(row.moduleId);
    else map.set(row.assignmentId, new Set([row.moduleId]));
  }
  return map;
}

export type CourseAssignmentMonitorRow = {
  assignmentId: number;
  userId: number;
  displayName: string;
  status: AcademyAssignmentStatus;
  modules: AssignmentModuleProgress[];
};

/** Il monitoraggio admin: chi è assegnato a un corso, e il loro dettaglio per modulo. */
export async function listAssignmentsForCourse(
  actorUserId: number,
  courseId: number
): Promise<CourseAssignmentMonitorRow[]> {
  await assertAdmin(actorUserId);

  const modules = await db
    .select({
      id: academyCourseModules.id,
      title: academyCourseModules.title,
      sortOrder: academyCourseModules.sortOrder,
    })
    .from(academyCourseModules)
    .where(eq(academyCourseModules.courseId, courseId))
    .orderBy(asc(academyCourseModules.sortOrder), asc(academyCourseModules.id));

  const assignmentRows = await db
    .select({
      assignmentId: academyCourseAssignments.id,
      userId: academyCourseAssignments.userId,
      status: academyCourseAssignments.status,
      name: users.name,
      lastName: users.lastName,
      email: users.email,
    })
    .from(academyCourseAssignments)
    .innerJoin(users, eq(users.id, academyCourseAssignments.userId))
    .where(eq(academyCourseAssignments.courseId, courseId))
    .orderBy(asc(academyCourseAssignments.id));

  if (assignmentRows.length === 0) return [];

  const completedByAssignment = await completedModuleIdsByAssignment(
    assignmentRows.map((a) => a.assignmentId)
  );

  const assignments = assignmentRows.map((row) => ({
    assignmentId: row.assignmentId,
    userId: row.userId,
    displayName: displayName(row),
    status: row.status as AcademyAssignmentStatus,
  }));

  return attachModuleProgress(assignments, modules, completedByAssignment);
}

export type UserCourseProgress = {
  assignmentId: number;
  courseId: number;
  courseTitle: string;
  status: AcademyAssignmentStatus;
  modules: AssignmentModuleProgress[];
};

/**
 * La vista del coach sulle proprie assegnazioni — legge solo `userId`, mai
 * `assertAdmin`: ogni coach vede solo sé stesso, il chiamante passa già il
 * proprio id da `requireRole('coach')`. Solo i corsi `active` compaiono: un
 * corso tornato `draft`/`cancelled` sparisce dalla vista del coach pur
 * restando nella sua assegnazione (coerente con la spec).
 */
export async function listAssignmentsForUser(userId: number): Promise<UserCourseProgress[]> {
  const assignmentRows = await db
    .select({
      assignmentId: academyCourseAssignments.id,
      courseId: academyCourseAssignments.courseId,
      courseTitle: academyCourses.title,
      status: academyCourseAssignments.status,
    })
    .from(academyCourseAssignments)
    .innerJoin(academyCourses, eq(academyCourses.id, academyCourseAssignments.courseId))
    .where(
      and(
        eq(academyCourseAssignments.userId, userId),
        eq(academyCourses.status, 'active')
      )
    )
    .orderBy(asc(academyCourseAssignments.id));

  if (assignmentRows.length === 0) return [];

  const courseIds = [...new Set(assignmentRows.map((a) => a.courseId))];
  const moduleRows = await db
    .select({
      id: academyCourseModules.id,
      courseId: academyCourseModules.courseId,
      title: academyCourseModules.title,
      sortOrder: academyCourseModules.sortOrder,
    })
    .from(academyCourseModules)
    .where(inArray(academyCourseModules.courseId, courseIds))
    .orderBy(asc(academyCourseModules.sortOrder), asc(academyCourseModules.id));

  const modulesByCourse = new Map<number, typeof moduleRows>();
  for (const module of moduleRows) {
    const list = modulesByCourse.get(module.courseId);
    if (list) list.push(module);
    else modulesByCourse.set(module.courseId, [module]);
  }

  const completedByAssignment = await completedModuleIdsByAssignment(
    assignmentRows.map((a) => a.assignmentId)
  );

  return assignmentRows.map((assignment) => {
    const completed = completedByAssignment.get(assignment.assignmentId) ?? new Set<number>();
    const modules = modulesByCourse.get(assignment.courseId) ?? [];
    return {
      assignmentId: assignment.assignmentId,
      courseId: assignment.courseId,
      courseTitle: assignment.courseTitle,
      status: assignment.status as AcademyAssignmentStatus,
      modules: modules.map((module) => ({
        moduleId: module.id,
        title: module.title,
        sortOrder: module.sortOrder,
        completed: completed.has(module.id),
      })),
    };
  });
}

export type CourseBadge = {
  courseId: number;
  courseTitle: string;
  completedDate: Date | null;
};

/**
 * Corsi completati da un coach — letta dal profilo pubblico, quindi
 * intenzionalmente senza `assertAdmin`/controllo di ruolo: espone solo
 * titolo corso e data di completamento per un `userId` già pubblico
 * (il profilo del coach), niente di più sensibile.
 */
export async function listCompletedCourseBadges(userId: number): Promise<CourseBadge[]> {
  return db
    .select({
      courseId: academyCourseAssignments.courseId,
      courseTitle: academyCourses.title,
      completedDate: academyCourseAssignments.completedDate,
    })
    .from(academyCourseAssignments)
    .innerJoin(academyCourses, eq(academyCourses.id, academyCourseAssignments.courseId))
    .where(
      and(
        eq(academyCourseAssignments.userId, userId),
        eq(academyCourseAssignments.status, 'completed')
      )
    )
    .orderBy(desc(academyCourseAssignments.completedDate));
}
```

- [ ] **Step 2: Typecheck (together with Task 5)**

Run: `npx tsc --noEmit`
Expected: no errors from `lib/core/academy/`.

- [ ] **Step 3: Commit**

```bash
git add lib/core/academy/assignments.ts
git commit -m "feat(academy): assignment, monitoring, progress and badge orchestration"
```

---

### Task 7: Wire the two new test files into `npm test`

**Files:**
- Modify: `package.json` (the `"test"` script string, and `"test:academy"` convenience script — follow the existing `test:auto-completion`-style single-purpose scripts)

**Interfaces:**
- Consumes: `lib/core/academy/course-hours.test.ts`, `lib/core/academy/assignment-progress.test.ts` (Tasks 3–4).

- [ ] **Step 1: Append to the `test` script**

In `package.json`, at the very end of the `"test"` script's file list (after `...lib/core/ai-session-notes/athlete-today.test.ts`), add a trailing space then:

```
lib/core/academy/course-hours.test.ts lib/core/academy/assignment-progress.test.ts
```

- [ ] **Step 2: Add a convenience script**

Add a new entry near `"test:guardians"`:

```json
    "test:academy": "tsx --test lib/core/academy/course-hours.test.ts lib/core/academy/assignment-progress.test.ts",
```

- [ ] **Step 3: Run the full suite**

Run: `npm test`
Expected: PASS, including the 3 + 6 new tests from Tasks 3–4, no regressions in the ~70 pre-existing files.

- [ ] **Step 4: Commit**

```bash
git add package.json
git commit -m "test(academy): wire course-hours and assignment-progress into npm test"
```

---

### Task 8: Admin server actions

**Files:**
- Create: `app/(dashboard)/dashboard/admin/academy/actions.ts`

**Interfaces:**
- Consumes: `createCourse`, `updateCourseStatus`, `createModule` from `@/lib/core/academy/courses` (Task 5); `assignCourseToUser`, `revokeAssignment`, `markModuleComplete` from `@/lib/core/academy/assignments` (Task 6); `requireRole` from `@/lib/core/auth`; `recordAdminAudit` from `@/lib/core/admin/audit-log`; `ActionState` from `@/lib/auth/middleware`; `AcademyCourseStatus` from `@/lib/db/schema`.
- Produces: `createCourseAction`, `updateCourseStatusAction`, `createModuleAction`, `assignCourseAction`, `revokeAssignmentAction`, `markModuleCompleteAction` — all `(prev: ActionState, formData: FormData) => Promise<ActionState>`, consumed by Task 10 and Task 11.

- [ ] **Step 1: Write `app/(dashboard)/dashboard/admin/academy/actions.ts`**

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/core/auth';
import {
  createCourse,
  createModule,
  updateCourseStatus,
} from '@/lib/core/academy/courses';
import {
  assignCourseToUser,
  markModuleComplete,
  revokeAssignment,
} from '@/lib/core/academy/assignments';
import { recordAdminAudit } from '@/lib/core/admin/audit-log';
import type { ActionState } from '@/lib/auth/middleware';
import type { AcademyCourseStatus } from '@/lib/db/schema';

function friendlyError(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    if (error.message === 'FORBIDDEN') return 'Non autorizzato.';
    if (error.message.includes('academy_course_assignments_course_user_unique')) {
      return 'Questo coach ha già questo corso assegnato.';
    }
    if (error.message.startsWith('Le ore del modulo')) return error.message;
  }
  return fallback;
}

export async function createCourseAction(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  const admin = await requireRole('admin');
  const title = String(formData.get('title') ?? '').trim();
  const description = String(formData.get('description') ?? '').trim();
  if (!title) return { error: 'Il titolo è obbligatorio.' };

  try {
    const created = await createCourse({
      actorUserId: admin.id,
      title,
      description: description || null,
    });
    await recordAdminAudit({
      actor: { id: admin.id, email: admin.email },
      action: 'academy_course_created',
      subjectType: 'academy_course',
      subjectId: created.id,
      outcome: 'ok',
      detail: { titolo: title },
    });
  } catch (error) {
    await recordAdminAudit({
      actor: { id: admin.id, email: admin.email },
      action: 'academy_course_created',
      subjectType: 'academy_course',
      outcome: 'fallita',
      detail: { titolo: title },
    });
    return { error: friendlyError(error, 'Impossibile creare il corso.') };
  }

  revalidatePath('/dashboard/admin/academy');
  return { success: 'Corso creato.' };
}

export async function updateCourseStatusAction(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  const admin = await requireRole('admin');
  const courseId = Number(formData.get('courseId'));
  const status = String(formData.get('status') ?? '') as AcademyCourseStatus;
  if (!Number.isInteger(courseId) || courseId <= 0) {
    return { error: 'Corso non valido.' };
  }
  if (!['draft', 'active', 'cancelled'].includes(status)) {
    return { error: 'Stato non valido.' };
  }

  try {
    await updateCourseStatus({ actorUserId: admin.id, courseId, status });
    await recordAdminAudit({
      actor: { id: admin.id, email: admin.email },
      action: 'academy_course_status_changed',
      subjectType: 'academy_course',
      subjectId: courseId,
      outcome: 'ok',
      detail: { stato: status },
    });
  } catch (error) {
    await recordAdminAudit({
      actor: { id: admin.id, email: admin.email },
      action: 'academy_course_status_changed',
      subjectType: 'academy_course',
      subjectId: courseId,
      outcome: 'fallita',
      detail: { stato: status },
    });
    return { error: friendlyError(error, 'Impossibile cambiare stato.') };
  }

  revalidatePath(`/dashboard/admin/academy/${courseId}`);
  revalidatePath('/dashboard/admin/academy');
  return { success: 'Stato aggiornato.' };
}

export async function createModuleAction(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  const admin = await requireRole('admin');
  const courseId = Number(formData.get('courseId'));
  const title = String(formData.get('title') ?? '').trim();
  const description = String(formData.get('description') ?? '').trim();
  const hours = Number(formData.get('hours'));
  const sortOrder = Number(formData.get('sortOrder') ?? 0);
  if (!Number.isInteger(courseId) || courseId <= 0) {
    return { error: 'Corso non valido.' };
  }
  if (!title) return { error: 'Il titolo del modulo è obbligatorio.' };

  try {
    await createModule({
      actorUserId: admin.id,
      courseId,
      title,
      description: description || null,
      hours,
      sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0,
    });
    await recordAdminAudit({
      actor: { id: admin.id, email: admin.email },
      action: 'academy_module_saved',
      subjectType: 'academy_course',
      subjectId: courseId,
      outcome: 'ok',
      detail: { titolo: title, ore: hours },
    });
  } catch (error) {
    await recordAdminAudit({
      actor: { id: admin.id, email: admin.email },
      action: 'academy_module_saved',
      subjectType: 'academy_course',
      subjectId: courseId,
      outcome: 'fallita',
      detail: { titolo: title },
    });
    return { error: friendlyError(error, 'Impossibile creare il modulo.') };
  }

  revalidatePath(`/dashboard/admin/academy/${courseId}`);
  return { success: 'Modulo creato.' };
}

export async function assignCourseAction(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  const admin = await requireRole('admin');
  const courseId = Number(formData.get('courseId'));
  const userId = Number(formData.get('userId'));
  if (
    !Number.isInteger(courseId) || courseId <= 0 ||
    !Number.isInteger(userId) || userId <= 0
  ) {
    return { error: 'Corso o coach non valido.' };
  }

  try {
    await assignCourseToUser({ actorUserId: admin.id, courseId, userId });
    await recordAdminAudit({
      actor: { id: admin.id, email: admin.email },
      action: 'academy_course_assigned',
      subjectType: 'academy_course',
      subjectId: courseId,
      outcome: 'ok',
      detail: { coach: userId },
    });
  } catch (error) {
    await recordAdminAudit({
      actor: { id: admin.id, email: admin.email },
      action: 'academy_course_assigned',
      subjectType: 'academy_course',
      subjectId: courseId,
      outcome: 'fallita',
      detail: { coach: userId },
    });
    return { error: friendlyError(error, 'Impossibile assegnare il corso.') };
  }

  revalidatePath(`/dashboard/admin/academy/${courseId}`);
  return { success: 'Corso assegnato.' };
}

export async function revokeAssignmentAction(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  const admin = await requireRole('admin');
  const assignmentId = Number(formData.get('assignmentId'));
  const courseId = Number(formData.get('courseId'));
  if (!Number.isInteger(assignmentId) || assignmentId <= 0) {
    return { error: 'Assegnazione non valida.' };
  }

  try {
    await revokeAssignment({ actorUserId: admin.id, assignmentId });
    await recordAdminAudit({
      actor: { id: admin.id, email: admin.email },
      action: 'academy_course_assignment_revoked',
      subjectType: 'academy_course',
      subjectId: Number.isInteger(courseId) ? courseId : null,
      outcome: 'ok',
      detail: { assegnazione: assignmentId },
    });
  } catch (error) {
    await recordAdminAudit({
      actor: { id: admin.id, email: admin.email },
      action: 'academy_course_assignment_revoked',
      subjectType: 'academy_course',
      subjectId: Number.isInteger(courseId) ? courseId : null,
      outcome: 'fallita',
      detail: { assegnazione: assignmentId },
    });
    return { error: friendlyError(error, "Impossibile revocare l'assegnazione.") };
  }

  revalidatePath(`/dashboard/admin/academy/${courseId}`);
  return { success: 'Assegnazione revocata.' };
}

export async function markModuleCompleteAction(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  const admin = await requireRole('admin');
  const assignmentId = Number(formData.get('assignmentId'));
  const moduleId = Number(formData.get('moduleId'));
  const courseId = Number(formData.get('courseId'));
  if (
    !Number.isInteger(assignmentId) || assignmentId <= 0 ||
    !Number.isInteger(moduleId) || moduleId <= 0
  ) {
    return { error: 'Modulo o assegnazione non validi.' };
  }

  try {
    await markModuleComplete({ actorUserId: admin.id, assignmentId, moduleId });
    await recordAdminAudit({
      actor: { id: admin.id, email: admin.email },
      action: 'academy_module_completed',
      subjectType: 'academy_course',
      subjectId: Number.isInteger(courseId) ? courseId : null,
      outcome: 'ok',
      detail: { assegnazione: assignmentId, modulo: moduleId },
    });
  } catch (error) {
    await recordAdminAudit({
      actor: { id: admin.id, email: admin.email },
      action: 'academy_module_completed',
      subjectType: 'academy_course',
      subjectId: Number.isInteger(courseId) ? courseId : null,
      outcome: 'fallita',
      detail: { assegnazione: assignmentId, modulo: moduleId },
    });
    return { error: friendlyError(error, 'Impossibile segnare il modulo completato.') };
  }

  revalidatePath(`/dashboard/admin/academy/${courseId}`);
  return { success: 'Modulo segnato come completato.' };
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "app/(dashboard)/dashboard/admin/academy/actions.ts"
git commit -m "feat(academy): admin server actions"
```

---

### Task 9: Admin nav entry

**Files:**
- Modify: `components/admin/admin-nav.tsx`

**Interfaces:**
- Consumes: nothing new. Adds a static nav entry.

- [ ] **Step 1: Add the icon import and nav item**

In the `lucide-react` import block, add `GraduationCap` alphabetically:

```ts
import {
  Activity,
  BrainCircuit,
  CalendarClock,
  GraduationCap,
  LayoutDashboard,
  Package,
  Settings,
  ShieldCheck,
  Sliders,
  UserRound,
  Users,
} from 'lucide-react';
```

In the `items` array, insert between the `Pacchetti` entry and the `Parametri di sistema` entry:

```ts
    {
      href: '/dashboard/admin/academy',
      label: 'Academy',
      icon: GraduationCap,
    },
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/admin/admin-nav.tsx
git commit -m "feat(academy): add Academy entry to admin nav"
```

---

### Task 10: Admin course list page

**Files:**
- Create: `app/(dashboard)/dashboard/admin/academy/page.tsx`

**Interfaces:**
- Consumes: `listCourses` from `@/lib/core/academy/courses` (Task 5); `createCourseAction` from `./actions` (Task 8); `requireRole` from `@/lib/core/auth`; `ActionForm` from `@/components/action-form`; `Button` from `@/components/ui/button`.

- [ ] **Step 1: Write `app/(dashboard)/dashboard/admin/academy/page.tsx`**

```tsx
import Link from 'next/link';
import { requireRole } from '@/lib/core/auth';
import { listCourses } from '@/lib/core/academy/courses';
import { ActionForm } from '@/components/action-form';
import { Button } from '@/components/ui/button';
import { createCourseAction } from './actions';

export const dynamic = 'force-dynamic';

const STATUS_LABEL: Record<string, string> = {
  draft: 'Bozza',
  active: 'Attivo',
  cancelled: 'Annullato',
};

export default async function AdminAcademyPage() {
  const admin = await requireRole('admin');
  const courses = await listCourses(admin.id);

  return (
    <section className="space-y-8 p-4 lg:p-0">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Academy</h1>
        <p className="mt-1 max-w-2xl text-sm text-gray-600">
          Corsi di formazione per i coach: moduli, ore e assegnazioni.
        </p>
      </div>

      <div className="rounded-xl border border-gray-200 p-4">
        <h2 className="text-lg font-semibold text-gray-900">Nuovo corso</h2>
        <ActionForm action={createCourseAction} className="mt-3 flex flex-wrap gap-3">
          <input
            name="title"
            placeholder="titolo (es. Mastery Level)"
            required
            maxLength={200}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
          <input
            name="description"
            placeholder="descrizione (opzionale)"
            className="min-w-[16rem] flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
          <Button type="submit">Crea</Button>
        </ActionForm>
      </div>

      <div className="rounded-xl border border-gray-200 p-4">
        <h2 className="text-lg font-semibold text-gray-900">Corsi</h2>
        {courses.length === 0 ? (
          <p className="mt-3 text-sm text-gray-400">Nessun corso ancora — crealo qui sopra.</p>
        ) : (
          <ul className="mt-3 divide-y divide-gray-100">
            {courses.map((course) => (
              <li key={course.id} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <Link
                    href={`/dashboard/admin/academy/${course.id}`}
                    className="font-medium text-gray-900 hover:underline"
                  >
                    {course.title}
                  </Link>
                  <p className="text-xs text-gray-500">{course.totalHours} ore totali</p>
                </div>
                <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">
                  {STATUS_LABEL[course.status] ?? course.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "app/(dashboard)/dashboard/admin/academy/page.tsx"
git commit -m "feat(academy): admin course list page"
```

---

### Task 11: Admin course detail page (config + monitoring)

**Files:**
- Create: `app/(dashboard)/dashboard/admin/academy/[courseId]/page.tsx`

**Interfaces:**
- Consumes: `getCourseDetail` from `@/lib/core/academy/courses` (Task 5); `listAssignmentsForCourse`, `listCoachUsers` from `@/lib/core/academy/assignments` (Task 6); `createModuleAction`, `assignCourseAction`, `revokeAssignmentAction`, `markModuleCompleteAction`, `updateCourseStatusAction` from `../actions` (Task 8).

- [ ] **Step 1: Write `app/(dashboard)/dashboard/admin/academy/[courseId]/page.tsx`**

```tsx
import { notFound } from 'next/navigation';
import { CheckCircle2, Circle } from 'lucide-react';
import { requireRole } from '@/lib/core/auth';
import { getCourseDetail } from '@/lib/core/academy/courses';
import { listAssignmentsForCourse, listCoachUsers } from '@/lib/core/academy/assignments';
import { ActionForm } from '@/components/action-form';
import { Button } from '@/components/ui/button';
import {
  assignCourseAction,
  createModuleAction,
  markModuleCompleteAction,
  revokeAssignmentAction,
  updateCourseStatusAction,
} from '../actions';

export const dynamic = 'force-dynamic';

const STATUS_LABEL: Record<string, string> = {
  draft: 'Bozza',
  active: 'Attivo',
  cancelled: 'Annullato',
  assigned: 'Assegnato',
  in_progress: 'In corso',
  completed: 'Completato',
};

export default async function AdminAcademyCourseDetailPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const admin = await requireRole('admin');
  const { courseId: courseIdRaw } = await params;
  const courseId = Number(courseIdRaw);
  if (!Number.isInteger(courseId) || courseId <= 0) notFound();

  const course = await getCourseDetail(admin.id, courseId);
  if (!course) notFound();

  const [assignments, coaches] = await Promise.all([
    listAssignmentsForCourse(admin.id, courseId),
    listCoachUsers(admin.id),
  ]);
  const assignedUserIds = new Set(assignments.map((a) => a.userId));
  const availableCoaches = coaches.filter((c) => !assignedUserIds.has(c.userId));

  return (
    <section className="space-y-8 p-4 lg:p-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">{course.title}</h1>
          {course.description && (
            <p className="mt-1 max-w-2xl text-sm text-gray-600">{course.description}</p>
          )}
          <p className="mt-1 text-xs text-gray-500">{course.totalHours} ore totali</p>
        </div>
        <ActionForm action={updateCourseStatusAction} className="flex items-center gap-2">
          <input type="hidden" name="courseId" value={course.id} />
          <select
            name="status"
            defaultValue={course.status}
            className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
          >
            <option value="draft">Bozza</option>
            <option value="active">Attivo</option>
            <option value="cancelled">Annullato</option>
          </select>
          <Button type="submit" variant="outline" className="h-8 px-3 text-xs">
            Salva stato
          </Button>
        </ActionForm>
      </div>

      <div className="rounded-xl border border-gray-200 p-4">
        <h2 className="text-lg font-semibold text-gray-900">Moduli</h2>
        {course.modules.length === 0 ? (
          <p className="mt-3 text-sm text-gray-400">Nessun modulo ancora.</p>
        ) : (
          <ol className="mt-3 space-y-2">
            {course.modules.map((module, index) => (
              <li key={module.id} className="rounded-lg border border-gray-100 p-3">
                <p className="text-sm font-medium text-gray-900">
                  Modulo {index + 1} — {module.title}{' '}
                  <span className="font-normal text-gray-400">({module.hours} ore)</span>
                </p>
                {module.description && (
                  <p className="mt-1 text-xs text-gray-500">{module.description}</p>
                )}
              </li>
            ))}
          </ol>
        )}

        <ActionForm action={createModuleAction} className="mt-4 flex flex-wrap gap-3">
          <input type="hidden" name="courseId" value={course.id} />
          <input type="hidden" name="sortOrder" value={course.modules.length} />
          <input
            name="title"
            placeholder="titolo modulo"
            required
            maxLength={200}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
          <input
            name="description"
            placeholder="descrizione (opzionale)"
            className="min-w-[14rem] flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
          <input
            name="hours"
            type="number"
            min={0}
            step={0.5}
            placeholder="ore"
            required
            className="w-24 rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
          <Button type="submit">Aggiungi modulo</Button>
        </ActionForm>
      </div>

      <div className="rounded-xl border border-gray-200 p-4">
        <h2 className="text-lg font-semibold text-gray-900">Assegna a un coach</h2>
        {availableCoaches.length === 0 ? (
          <p className="mt-3 text-sm text-gray-400">
            Nessun coach disponibile da assegnare (tutti già assegnati, o nessun coach approvato).
          </p>
        ) : (
          <ActionForm action={assignCourseAction} className="mt-3 flex flex-wrap gap-3">
            <input type="hidden" name="courseId" value={course.id} />
            <select name="userId" required className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm">
              {availableCoaches.map((coach) => (
                <option key={coach.userId} value={coach.userId}>
                  {coach.displayName} ({coach.email})
                </option>
              ))}
            </select>
            <Button type="submit">Assegna</Button>
          </ActionForm>
        )}
      </div>

      <div className="rounded-xl border border-gray-200 p-4">
        <h2 className="text-lg font-semibold text-gray-900">Chi lo sta seguendo</h2>
        {assignments.length === 0 ? (
          <p className="mt-3 text-sm text-gray-400">Nessun coach assegnato a questo corso.</p>
        ) : (
          <div className="mt-3 space-y-4">
            {assignments.map((assignment) => (
              <div key={assignment.assignmentId} className="rounded-lg border border-gray-100 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium text-gray-900">
                    {assignment.displayName}{' '}
                    <span className="text-xs font-normal text-gray-400">
                      — {STATUS_LABEL[assignment.status] ?? assignment.status}
                    </span>
                  </p>
                  <ActionForm
                    action={revokeAssignmentAction}
                    confirmTitle="Revocare l'assegnazione?"
                    confirmMessage={`${assignment.displayName} perderà l'accesso a questo corso e ai suoi progressi.`}
                    confirmActionLabel="Revoca"
                  >
                    <input type="hidden" name="assignmentId" value={assignment.assignmentId} />
                    <input type="hidden" name="courseId" value={course.id} />
                    <Button type="submit" variant="outline" className="h-7 px-2 text-xs">
                      Revoca
                    </Button>
                  </ActionForm>
                </div>
                <ul className="mt-2 space-y-1">
                  {assignment.modules.map((module) => (
                    <li key={module.moduleId} className="flex items-center justify-between gap-2 text-sm">
                      <span className="flex items-center gap-1.5 text-gray-700">
                        {module.completed ? (
                          <CheckCircle2 className="h-4 w-4 text-green-600" aria-label="Completato" />
                        ) : (
                          <Circle className="h-4 w-4 text-gray-300" aria-label="Da completare" />
                        )}
                        {module.title}
                      </span>
                      {!module.completed && (
                        <ActionForm action={markModuleCompleteAction}>
                          <input type="hidden" name="assignmentId" value={assignment.assignmentId} />
                          <input type="hidden" name="moduleId" value={module.moduleId} />
                          <input type="hidden" name="courseId" value={course.id} />
                          <Button type="submit" variant="outline" className="h-6 px-2 text-[11px]">
                            Segna completato
                          </Button>
                        </ActionForm>
                      )}
                    </li>
                  ))}
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

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "app/(dashboard)/dashboard/admin/academy/[courseId]/page.tsx"
git commit -m "feat(academy): admin course detail page (modules, assignment, monitoring)"
```

---

### Task 12: Coach nav entry and read-only Academy tab

**Files:**
- Modify: `app/(dashboard)/dashboard/coach/coach-nav.tsx`
- Create: `app/(dashboard)/dashboard/coach/academy/page.tsx`

**Interfaces:**
- Consumes: `listAssignmentsForUser` from `@/lib/core/academy/assignments` (Task 6); `requireRole` from `@/lib/core/auth`.

- [ ] **Step 1: Add the tab to `coach-nav.tsx`**

Add `GraduationCap` to the `lucide-react` import, and add a `TABS` entry after `'Calendario'` and before `'Messaggi'` (order: dashboard, athletes, calendar, academy, messages, profile, services — academy sits with the coach's own work items, ahead of profile/services which are account settings):

```ts
import {
  LayoutDashboard,
  UserRound,
  Briefcase,
  CalendarDays,
  GraduationCap,
  MessageSquare,
  Users2,
} from 'lucide-react';
```

```ts
const TABS = [
  { href: '/dashboard/coach', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/dashboard/coach/athletes', label: 'I miei Atleti', icon: Users2 },
  { href: '/dashboard/coach/calendar', label: 'Calendario', icon: CalendarDays },
  { href: '/dashboard/coach/academy', label: 'Academy', icon: GraduationCap },
  { href: '/dashboard/coach/messages', label: 'Messaggi', icon: MessageSquare },
  { href: '/dashboard/coach/profile', label: 'Profilo', icon: UserRound },
  { href: '/dashboard/coach/services', label: 'Servizi', icon: Briefcase },
];
```

- [ ] **Step 2: Write `app/(dashboard)/dashboard/coach/academy/page.tsx`**

```tsx
import { CheckCircle2, Circle, GraduationCap } from 'lucide-react';
import { requireRole } from '@/lib/core/auth';
import { listAssignmentsForUser } from '@/lib/core/academy/assignments';

export const dynamic = 'force-dynamic';

export default async function CoachAcademyPage() {
  const coach = await requireRole('coach');
  const assignments = await listAssignmentsForUser(coach.id);

  if (assignments.length === 0) {
    return (
      <section className="p-4 lg:p-0">
        <div className="rounded-xl border border-dashed border-gray-300 p-8 text-center">
          <GraduationCap className="mx-auto h-8 w-8 text-gray-300" aria-hidden="true" />
          <h1 className="mt-3 text-lg font-semibold text-gray-900">Nessun corso assegnato</h1>
          <p className="mt-1 text-sm text-gray-500">
            L'Academy è gestita dall'amministrazione: quando ti verrà assegnato un corso di
            formazione, lo vedrai qui.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-6 p-4 lg:p-0">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Academy</h1>
        <p className="mt-1 text-sm text-gray-600">I corsi di formazione a te assegnati.</p>
      </div>

      {assignments.map((assignment) => {
        const completedCount = assignment.modules.filter((m) => m.completed).length;
        return (
          <div key={assignment.assignmentId} className="rounded-xl border border-gray-200 p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-gray-900">{assignment.courseTitle}</h2>
              <span className="text-xs font-medium text-gray-500">
                {completedCount}/{assignment.modules.length} moduli completati
              </span>
            </div>
            <ul className="mt-3 space-y-1.5">
              {assignment.modules.map((module, index) => (
                <li key={module.moduleId} className="flex items-center gap-2 text-sm text-gray-700">
                  {module.completed ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" aria-label="Completato" />
                  ) : (
                    <Circle className="h-4 w-4 shrink-0 text-gray-300" aria-label="Da completare" />
                  )}
                  Modulo {index + 1} — {module.title}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </section>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add "app/(dashboard)/dashboard/coach/coach-nav.tsx" "app/(dashboard)/dashboard/coach/academy/page.tsx"
git commit -m "feat(academy): coach nav entry and read-only progress tab"
```

---

### Task 13: Completed-course badge on the public coach profile

**Files:**
- Modify: `lib/core/listings/index.ts` (expose `userId` on `CoachDetail`, around lines 92–170)
- Modify: `app/(marketplace)/coaches/[slug]/page.tsx` (render the badge)

**Interfaces:**
- Consumes: `listCompletedCourseBadges` from `@/lib/core/academy/assignments` (Task 6).
- Produces: `CoachDetail.userId: number`, consumed by the profile page.

- [ ] **Step 1: Expose `userId` on `CoachDetail`**

In `lib/core/listings/index.ts`, find the `CoachDetail` type (around line 92):

```ts
export type CoachDetail = CoachListItem & {
  providerId: number;
```

Change to:

```ts
export type CoachDetail = CoachListItem & {
  providerId: number;
  userId: number;
```

In `getCoachBySlug`'s `db.select({ ... })` (around line 144–166), add the field:

```ts
      providerId: providerProfiles.id,
      userId: providerProfiles.userId,
      slug: providerProfiles.slug,
```

- [ ] **Step 2: Render the badge on the profile page**

In `app/(marketplace)/coaches/[slug]/page.tsx`, add the import near the other `@/lib/core/...` imports (after the `getCoachBySlug` import on line 18):

```ts
import { listCompletedCourseBadges } from '@/lib/core/academy/assignments';
```

At line 151 (inside the page component, not `generateMetadata`, which has its own unrelated `getCoachBySlug` call at line 74):

```ts
  const coach = await getCoachBySlug(slug, { viewerUserId: user?.id });
  if (!coach) {
    notFound();
  }
```

change to:

```ts
  const coach = await getCoachBySlug(slug, { viewerUserId: user?.id });
  if (!coach) {
    notFound();
  }
  const academyBadges = await listCompletedCourseBadges(coach.userId);
```

At lines 276–280:

```tsx
        <div className="col-span-2 row-start-2 min-w-0 sm:col-span-1 sm:col-start-2 sm:row-start-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="text-3xl font-bold text-gray-900">{name}</h1>
            <CertifiedBadge certified={coach.certified} title={certTitle} />
          </div>
```

change to:

```tsx
        <div className="col-span-2 row-start-2 min-w-0 sm:col-span-1 sm:col-start-2 sm:row-start-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="text-3xl font-bold text-gray-900">{name}</h1>
            <CertifiedBadge certified={coach.certified} title={certTitle} />
          </div>
          {academyBadges.length > 0 && (
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              {academyBadges.map((badge) => (
                <span
                  key={badge.courseId}
                  title={`Corso Academy completato: ${badge.courseTitle}`}
                  className="inline-flex items-center gap-1.5 rounded-full border border-green-200 bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700"
                >
                  <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
                  {badge.courseTitle}
                </span>
              ))}
            </div>
          )}
```

`BadgeCheck` is already imported at line 5 from `lucide-react` (used by the file for other icons) — no new icon import needed.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add lib/core/listings/index.ts "app/(marketplace)/coaches/[slug]/page.tsx"
git commit -m "feat(academy): completed-course badge on the public coach profile"
```

---

### Task 14: Verification pass (no admin session available locally)

**Files:** none created — this task only runs checks and reports results.

**Interfaces:** none.

- [ ] **Step 1: Full typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 2: Full test suite**

Run: `npm test`
Expected: PASS, all files including the two new Academy test files.

- [ ] **Step 3: Production build**

Run: `npx next build`
Expected: PASS — this compiles every new route (`/dashboard/admin/academy`, `/dashboard/admin/academy/[courseId]`, `/dashboard/coach/academy`) and validates server/client boundaries, per the `verificare-ui-dietro-login` project convention (no admin account exists locally, so a real session cannot be opened).

- [ ] **Step 4: Render + screenshot the admin course detail page with fake data**

Following the same technique already used in this project (see the `verificare-ui-dietro-login` memory): write a throwaway script under `tmp/` in the project root (so `@/` path aliases resolve), that does `renderToStaticMarkup` of the course-detail JSX with hand-built fake `CourseDetail`/`CourseAssignmentMonitorRow[]` data (no database), wraps it in an HTML shell loading Tailwind from the CDN, and screenshots it with Playwright (already in devDependencies). Do the same for the coach Academy tab (empty state + one assignment with mixed progress) and for the public-profile badge. Delete the throwaway script when done; it is not part of the codebase.

- [ ] **Step 5: Report the verification level honestly**

State explicitly, in whatever summary follows this task: "typecheck, test suite, build, and screenshots with fake data — not opened with a real admin or coach session, because no admin test account exists locally." Do not claim more than that.

---

### Task 15: Run the migration against the (production) database — explicit confirmation required

**Files:** none — this task only runs `npm run db:migrate`.

**This task is not automatic.** Per the `database-migrations` skill and the project's Global Constraints: `.env.local` points at the same Supabase project as production. Before running this task:

- [ ] **Step 1: State exactly what is about to run and where**

Tell the user: "About to run `npm run db:migrate`, which applies `lib/db/migrations/0077_<name>.sql` (five new additive tables, two extended CHECK constraints on `admin_audit_events`, RLS enabled with no `anon`/`authenticated` grants) against the Supabase project `POSTGRES_URL` currently points to — which is the same project as production." Show the migration file's contents one more time if it has been more than a few turns since Task 2.

- [ ] **Step 2: Wait for explicit confirmation from the user before proceeding.**

- [ ] **Step 3: Run the migration**

Run: `npm run db:migrate`
Expected: five `CREATE TABLE` statements applied, `admin_audit_events` CHECK constraints replaced, no errors.

- [ ] **Step 4: Confirm the app still typechecks against the live schema**

Run: `npx tsc --noEmit`
Expected: PASS (this was already true in Task 14, but the schema in the database and the schema in code should now agree — this step is the guard against a migration that silently didn't apply what the code expects).

- [ ] **Step 5: Report completion**

Tell the user the migration is live, and that admin/coach pages can now be exercised for real in Preview or Production — this is the point where they can actually create a course through the UI (their own admin session exists there, unlike locally).
