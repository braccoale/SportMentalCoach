import 'server-only';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  academyCourses,
  academyCourseModules,
  academyCourseAssignments,
  academyModuleCompletions,
  users,
  type AcademyAssignmentStatus,
} from '@/lib/db/schema';
import { assertAdmin } from '@/lib/core/features';
import { isEligibleCoach } from './coaches';
import { assertInstructorOrAdmin, isInstructorOf } from './instructors';
import { courseTotalHours } from './course-hours';

export type CourseAssignment = {
  assignmentId: number;
  userId: number;
  displayName: string;
  status: AcademyAssignmentStatus;
  completedModules: number;
  totalModules: number;
};

export async function listAssignments(
  actorUserId: number,
  courseId: number
): Promise<CourseAssignment[]> {
  await assertInstructorOrAdmin(actorUserId, courseId);
  const rows = await db
    .select({
      assignmentId: academyCourseAssignments.id,
      userId: academyCourseAssignments.userId,
      status: academyCourseAssignments.status,
      email: users.email,
      name: users.name,
      lastName: users.lastName,
    })
    .from(academyCourseAssignments)
    .innerJoin(users, eq(users.id, academyCourseAssignments.userId))
    .where(eq(academyCourseAssignments.courseId, courseId));

  const totalModules = (
    await db
      .select({ id: academyCourseModules.id })
      .from(academyCourseModules)
      .where(eq(academyCourseModules.courseId, courseId))
  ).length;

  const completions =
    rows.length === 0
      ? []
      : await db
          .select({ assignmentId: academyModuleCompletions.assignmentId })
          .from(academyModuleCompletions)
          .where(
            inArray(
              academyModuleCompletions.assignmentId,
              rows.map((r) => r.assignmentId)
            )
          );
  const completedByAssignment = new Map<number, number>();
  for (const row of completions) {
    completedByAssignment.set(row.assignmentId, (completedByAssignment.get(row.assignmentId) ?? 0) + 1);
  }

  return rows.map((row) => ({
    assignmentId: row.assignmentId,
    userId: row.userId,
    displayName: [row.name, row.lastName].filter(Boolean).join(' ') || row.email,
    status: row.status as AcademyAssignmentStatus,
    completedModules: completedByAssignment.get(row.assignmentId) ?? 0,
    totalModules,
  }));
}

export type UserModuleProgress = {
  moduleId: number;
  title: string;
  sortOrder: number;
  completed: boolean;
};

export type UserCourseProgress = {
  assignmentId: number;
  courseId: number;
  courseTitle: string;
  courseEdition: string | null;
  courseLevel: string | null;
  courseTotalHours: number;
  heroImageKey: string | null;
  status: AcademyAssignmentStatus;
  modules: UserModuleProgress[];
};

/**
 * La vista del coach sulle proprie assegnazioni — legge solo `userId`, mai
 * `assertAdmin`: ogni coach vede solo sé stesso, il chiamante passa già il
 * proprio id da `requireRole('coach')`. Solo i corsi `active` compaiono: un
 * corso tornato `draft`/`cancelled` sparisce dalla vista del coach pur
 * restando nella sua assegnazione.
 */
export async function listAssignmentsForUser(userId: number): Promise<UserCourseProgress[]> {
  const assignmentRows = await db
    .select({
      assignmentId: academyCourseAssignments.id,
      courseId: academyCourseAssignments.courseId,
      courseTitle: academyCourses.title,
      courseEdition: academyCourses.edition,
      courseLevel: academyCourses.level,
      heroImageKey: academyCourses.heroImageKey,
      status: academyCourseAssignments.status,
    })
    .from(academyCourseAssignments)
    .innerJoin(academyCourses, eq(academyCourses.id, academyCourseAssignments.courseId))
    .where(and(eq(academyCourseAssignments.userId, userId), eq(academyCourses.status, 'active')))
    .orderBy(asc(academyCourseAssignments.id));

  if (assignmentRows.length === 0) return [];

  const courseIds = [...new Set(assignmentRows.map((a) => a.courseId))];
  const moduleRows = await db
    .select({
      id: academyCourseModules.id,
      courseId: academyCourseModules.courseId,
      title: academyCourseModules.title,
      sortOrder: academyCourseModules.sortOrder,
      hours: academyCourseModules.hours,
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

  const completions = await db
    .select({
      assignmentId: academyModuleCompletions.assignmentId,
      moduleId: academyModuleCompletions.moduleId,
    })
    .from(academyModuleCompletions)
    .where(inArray(academyModuleCompletions.assignmentId, assignmentRows.map((a) => a.assignmentId)));

  const completedByAssignment = new Map<number, Set<number>>();
  for (const row of completions) {
    const set = completedByAssignment.get(row.assignmentId);
    if (set) set.add(row.moduleId);
    else completedByAssignment.set(row.assignmentId, new Set([row.moduleId]));
  }

  return assignmentRows.map((assignment) => {
    const completed = completedByAssignment.get(assignment.assignmentId) ?? new Set<number>();
    const modules = modulesByCourse.get(assignment.courseId) ?? [];
    return {
      assignmentId: assignment.assignmentId,
      courseId: assignment.courseId,
      courseTitle: assignment.courseTitle,
      courseEdition: assignment.courseEdition,
      courseLevel: assignment.courseLevel,
      courseTotalHours: courseTotalHours(modules),
      heroImageKey: assignment.heroImageKey,
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

/**
 * Assegna un corso a un coach partecipante. La prima assegnazione blocca il
 * programma nella stessa transazione: la riga del corso è bloccata con
 * `FOR UPDATE` prima di ricontrollare stato e moduli, così due admin che
 * assegnano lo stesso corso in parallelo non superano il controllo "ha
 * almeno un modulo" su una lettura sporca, e non lasciano
 * `structureLockedAt` indietro rispetto a un'assegnazione già scritta.
 *
 * Idempotente sul duplicato: assegnare due volte lo stesso coach allo
 * stesso corso non crea una seconda riga (`onConflictDoNothing`), coerente
 * con "gestire la ripetizione della richiesta senza creare duplicati".
 */
export async function assignCourseToUser(params: {
  actorUserId: number;
  courseId: number;
  userId: number;
}): Promise<void> {
  await assertAdmin(params.actorUserId);
  if (!(await isEligibleCoach(params.userId))) {
    throw new Error('Solo un coach con profilo approvato può essere assegnato a un corso.');
  }
  if (await isInstructorOf(params.userId, params.courseId)) {
    throw new Error(
      'Questo coach è già docente di questo corso e non può esserne anche partecipante.'
    );
  }

  await db.transaction(async (tx) => {
    const [course] = await tx
      .select({
        status: academyCourses.status,
        structureLockedAt: academyCourses.structureLockedAt,
      })
      .from(academyCourses)
      .where(eq(academyCourses.id, params.courseId))
      .for('update');
    if (!course) throw new Error('Corso non trovato.');
    if (course.status !== 'active') {
      throw new Error('Solo un corso attivo può essere assegnato.');
    }

    const [moduleRow] = await tx
      .select({ id: academyCourseModules.id })
      .from(academyCourseModules)
      .where(eq(academyCourseModules.courseId, params.courseId))
      .limit(1);
    if (!moduleRow) {
      throw new Error('Un corso senza moduli non può essere assegnato.');
    }

    await tx
      .insert(academyCourseAssignments)
      .values({
        courseId: params.courseId,
        userId: params.userId,
        assignedBy: params.actorUserId,
      })
      .onConflictDoNothing();

    if (course.structureLockedAt === null) {
      await tx
        .update(academyCourses)
        .set({ structureLockedAt: new Date() })
        .where(eq(academyCourses.id, params.courseId));
    }
  });
}

/**
 * Rimuove l'assegnazione di un coach dal corso — non tocca lo "sblocco" del
 * programma: resta bloccato finché esiste anche un solo altro partecipante
 * (o è già stato bloccato una volta, per design). Se questo coach è già
 * iscritto a una sessione del corso, il database rifiuta la cancellazione
 * (la chiave esterna composta di `academy_session_participants` non ha
 * `ON DELETE CASCADE` verso questa tabella): va prima tolto da quelle
 * sessioni, non è una cancellazione silenziosa a cascata. I completamenti
 * modulo dell'assegnazione, invece, vengono cancellati insieme ad essa.
 */
export async function removeAssignment(params: {
  actorUserId: number;
  courseId: number;
  userId: number;
}): Promise<void> {
  await assertAdmin(params.actorUserId);
  await db
    .delete(academyCourseAssignments)
    .where(
      and(eq(academyCourseAssignments.courseId, params.courseId), eq(academyCourseAssignments.userId, params.userId))
    );
}
