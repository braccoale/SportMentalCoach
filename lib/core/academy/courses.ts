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

const STRUCTURE_LOCKED_MESSAGE =
  'Programma bloccato: crea una nuova edizione per modificarlo.';

export type CourseSummary = {
  id: number;
  title: string;
  status: AcademyCourseStatus;
  edition: string | null;
  totalHours: number;
  structureLocked: boolean;
};

/**
 * Le ore totali si calcolano raggruppando tutti i moduli in memoria e
 * passandoli a `courseTotalHours`, non con una `SUM` SQL: così il numero
 * mostrato in questa lista è calcolato dalla stessa funzione usata dal
 * dettaglio corso, dalla vista del docente/partecipante e dal badge.
 */
export async function listCourses(actorUserId: number): Promise<CourseSummary[]> {
  await assertAdmin(actorUserId);

  const [courses, moduleRows] = await Promise.all([
    db
      .select({
        id: academyCourses.id,
        title: academyCourses.title,
        status: academyCourses.status,
        edition: academyCourses.edition,
        structureLockedAt: academyCourses.structureLockedAt,
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
    edition: course.edition,
    totalHours: courseTotalHours(hoursByCourseId.get(course.id) ?? []),
    structureLocked: course.structureLockedAt !== null,
  }));
}

export async function createCourse(params: {
  actorUserId: number;
  title: string;
  description: string | null;
  edition: string | null;
}): Promise<AcademyCourse> {
  await assertAdmin(params.actorUserId);
  const [created] = await db
    .insert(academyCourses)
    .values({
      title: params.title,
      description: params.description,
      edition: params.edition,
      createdBy: params.actorUserId,
      updatedBy: params.actorUserId,
    })
    .returning();
  return created;
}

/** Titolo e descrizione restano modificabili solo finché il programma non è bloccato. */
export async function updateCourse(params: {
  actorUserId: number;
  courseId: number;
  title: string;
  description: string | null;
  edition: string | null;
}): Promise<void> {
  await assertAdmin(params.actorUserId);
  await assertStructureUnlocked(params.courseId);

  await db
    .update(academyCourses)
    .set({
      title: params.title,
      description: params.description,
      edition: params.edition,
      updatedDate: new Date(),
      updatedBy: params.actorUserId,
    })
    .where(eq(academyCourses.id, params.courseId));
}

export async function updateCourseStatus(params: {
  actorUserId: number;
  courseId: number;
  status: AcademyCourseStatus;
}): Promise<void> {
  await assertAdmin(params.actorUserId);

  if (params.status === 'active') {
    const [moduleCount] = await db
      .select({ id: academyCourseModules.id })
      .from(academyCourseModules)
      .where(eq(academyCourseModules.courseId, params.courseId))
      .limit(1);
    if (!moduleCount) {
      throw new Error('Un corso senza moduli non può essere attivato.');
    }
  }

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
  edition: string | null;
  previousCourseId: number | null;
  structureLocked: boolean;
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
      edition: academyCourses.edition,
      previousCourseId: academyCourses.previousCourseId,
      structureLockedAt: academyCourses.structureLockedAt,
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
    edition: course.edition,
    previousCourseId: course.previousCourseId,
    structureLocked: course.structureLockedAt !== null,
    totalHours: courseTotalHours(modules),
    modules,
  };
}

async function assertStructureUnlocked(courseId: number): Promise<void> {
  const [course] = await db
    .select({ structureLockedAt: academyCourses.structureLockedAt })
    .from(academyCourses)
    .where(eq(academyCourses.id, courseId))
    .limit(1);
  if (!course) throw new Error('Corso non trovato.');
  if (course.structureLockedAt !== null) {
    throw new Error(STRUCTURE_LOCKED_MESSAGE);
  }
}

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
  await assertStructureUnlocked(params.courseId);

  const [module] = await db
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
  return module;
}

export async function updateModule(params: {
  actorUserId: number;
  moduleId: number;
  courseId: number;
  title: string;
  description: string | null;
  hours: number;
  sortOrder: number;
}): Promise<void> {
  await assertAdmin(params.actorUserId);
  if (!Number.isFinite(params.hours) || params.hours < 0) {
    throw new Error('Le ore del modulo devono essere un numero maggiore o uguale a zero.');
  }
  await assertStructureUnlocked(params.courseId);

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

export async function deleteModule(params: {
  actorUserId: number;
  moduleId: number;
  courseId: number;
}): Promise<void> {
  await assertAdmin(params.actorUserId);
  await assertStructureUnlocked(params.courseId);

  await db.delete(academyCourseModules).where(eq(academyCourseModules.id, params.moduleId));
}

/**
 * Copia programma e informazioni del corso in una nuova bozza collegata
 * all'edizione precedente. Non copia assegnazioni, docenti, sessioni,
 * materiali, progressi o completamenti — solo titolo, descrizione e moduli,
 * così la nuova edizione riparte davvero da zero sul lato partecipazione.
 */
export async function createNewEdition(params: {
  actorUserId: number;
  courseId: number;
  edition: string | null;
}): Promise<AcademyCourse> {
  await assertAdmin(params.actorUserId);

  return db.transaction(async (tx) => {
    const [source] = await tx
      .select({
        title: academyCourses.title,
        description: academyCourses.description,
      })
      .from(academyCourses)
      .where(eq(academyCourses.id, params.courseId))
      .limit(1);
    if (!source) throw new Error('Corso non trovato.');

    const sourceModules = await tx
      .select({
        title: academyCourseModules.title,
        description: academyCourseModules.description,
        hours: academyCourseModules.hours,
        sortOrder: academyCourseModules.sortOrder,
      })
      .from(academyCourseModules)
      .where(eq(academyCourseModules.courseId, params.courseId))
      .orderBy(asc(academyCourseModules.sortOrder), asc(academyCourseModules.id));

    const [created] = await tx
      .insert(academyCourses)
      .values({
        title: source.title,
        description: source.description,
        edition: params.edition,
        previousCourseId: params.courseId,
        createdBy: params.actorUserId,
        updatedBy: params.actorUserId,
      })
      .returning();

    if (sourceModules.length > 0) {
      await tx.insert(academyCourseModules).values(
        sourceModules.map((module) => ({
          courseId: created.id,
          title: module.title,
          description: module.description,
          hours: module.hours,
          sortOrder: module.sortOrder,
          createdBy: params.actorUserId,
          updatedBy: params.actorUserId,
        }))
      );
    }

    return created;
  });
}
