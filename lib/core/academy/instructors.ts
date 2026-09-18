import 'server-only';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  academyCourseAssignments,
  academyCourseInstructors,
  academyCourseModules,
  academyCourses,
  academySessions,
  profiles,
  userRoles,
  users,
  type AcademyCourseStatus,
} from '@/lib/db/schema';
import { assertAdmin } from '@/lib/core/features';
import { isEligibleCoach } from './coaches';
import { courseTotalHours } from './course-hours';

export type CourseInstructor = {
  userId: number;
  displayName: string;
  email: string;
  avatarUrl: string | null;
};

async function isAdmin(userId: number): Promise<boolean> {
  const [row] = await db
    .select({ id: userRoles.id })
    .from(userRoles)
    .where(and(eq(userRoles.userId, userId), eq(userRoles.roleKey, 'admin')))
    .limit(1);
  return Boolean(row);
}

/** Vero solo se `userId` è nominato docente di questo corso — usata anche da `assignments.ts` per impedire che un docente sia anche partecipante dello stesso corso. */
export async function isInstructorOf(userId: number, courseId: number): Promise<boolean> {
  const [row] = await db
    .select({ id: academyCourseInstructors.id })
    .from(academyCourseInstructors)
    .where(and(eq(academyCourseInstructors.courseId, courseId), eq(academyCourseInstructors.userId, userId)))
    .limit(1);
  return Boolean(row);
}

async function isParticipantOf(userId: number, courseId: number): Promise<boolean> {
  const [row] = await db
    .select({ id: academyCourseAssignments.id })
    .from(academyCourseAssignments)
    .where(and(eq(academyCourseAssignments.courseId, courseId), eq(academyCourseAssignments.userId, userId)))
    .limit(1);
  return Boolean(row);
}

/**
 * L'admin vede e gestisce tutto; un docente vede e gestisce solo i propri
 * corsi. Usata ovunque la vista "chi può operare qui" non sia riservata al
 * solo admin — moduli, materiali, partecipanti, sessioni di un corso.
 */
export async function assertInstructorOrAdmin(actorUserId: number, courseId: number): Promise<void> {
  if (await isAdmin(actorUserId)) return;
  if (await isInstructorOf(actorUserId, courseId)) return;
  throw new Error('FORBIDDEN');
}

/**
 * Vero per chiunque abbia un motivo legittimo di leggere questo corso —
 * admin, docente o partecipante assegnato. Usata dalla pagina Panoramica e
 * da tutto ciò che deve funzionare anche per il coach partecipante, non
 * solo per chi lo gestisce.
 */
export async function assertCourseMember(actorUserId: number, courseId: number): Promise<void> {
  if (await isAdmin(actorUserId)) return;
  if (await isInstructorOf(actorUserId, courseId)) return;
  if (await isParticipantOf(actorUserId, courseId)) return;
  throw new Error('FORBIDDEN');
}

/** Vero per admin o docente del corso — usata per decidere cosa filtrare, non per bloccare l'accesso. */
export async function isInstructorOrAdminBool(userId: number, courseId: number): Promise<boolean> {
  if (await isAdmin(userId)) return true;
  return isInstructorOf(userId, courseId);
}

/**
 * Vero solo se `userId` è davvero nominato docente di questo corso — a
 * differenza di `assertInstructorOrAdmin`, un admin non nominato non basta:
 * serve a validare *chi terrà* una sessione, non chi ha il permesso di
 * crearla.
 */
export async function assertIsInstructor(userId: number, courseId: number): Promise<void> {
  if (await isInstructorOf(userId, courseId)) return;
  throw new Error('Il docente indicato non è nominato per questo corso.');
}

export type InstructorCourse = {
  courseId: number;
  title: string;
  edition: string | null;
  level: string | null;
  heroImageKey: string | null;
  status: AcademyCourseStatus;
  moduleCount: number;
  totalHours: number;
  sessionCount: number;
  participantCount: number;
};

/**
 * I corsi che un coach insegna — la sua vista "Corsi che tieni", mai
 * `assertAdmin`. `sessionCount` conta solo le sessioni non annullate: serve
 * a decidere se mostrare il richiamo "crea la prima sessione".
 */
export async function listInstructorCourses(userId: number): Promise<InstructorCourse[]> {
  const rows = await db
    .select({
      courseId: academyCourses.id,
      title: academyCourses.title,
      edition: academyCourses.edition,
      level: academyCourses.level,
      heroImageKey: academyCourses.heroImageKey,
      status: academyCourses.status,
    })
    .from(academyCourseInstructors)
    .innerJoin(academyCourses, eq(academyCourses.id, academyCourseInstructors.courseId))
    .where(eq(academyCourseInstructors.userId, userId));

  if (rows.length === 0) return [];

  const courseIds = rows.map((r) => r.courseId);
  const [moduleRows, sessionRows, assignmentRows] = await Promise.all([
    db
      .select({ courseId: academyCourseModules.courseId, hours: academyCourseModules.hours })
      .from(academyCourseModules)
      .where(inArray(academyCourseModules.courseId, courseIds)),
    db
      .select({ courseId: academySessions.courseId })
      .from(academySessions)
      .where(
        and(
          inArray(academySessions.courseId, courseIds),
          eq(academySessions.instructorUserId, userId),
          eq(academySessions.status, 'scheduled')
        )
      ),
    db
      .select({ courseId: academyCourseAssignments.courseId })
      .from(academyCourseAssignments)
      .where(inArray(academyCourseAssignments.courseId, courseIds)),
  ]);
  const modulesByCourse = new Map<number, { hours: number }[]>();
  for (const row of moduleRows) {
    const list = modulesByCourse.get(row.courseId);
    if (list) list.push({ hours: row.hours });
    else modulesByCourse.set(row.courseId, [{ hours: row.hours }]);
  }
  const sessionCountByCourse = new Map<number, number>();
  for (const row of sessionRows) {
    sessionCountByCourse.set(row.courseId, (sessionCountByCourse.get(row.courseId) ?? 0) + 1);
  }
  const participantCountByCourse = new Map<number, number>();
  for (const row of assignmentRows) {
    participantCountByCourse.set(row.courseId, (participantCountByCourse.get(row.courseId) ?? 0) + 1);
  }

  return rows.map((row) => ({
    ...row,
    status: row.status as AcademyCourseStatus,
    moduleCount: modulesByCourse.get(row.courseId)?.length ?? 0,
    totalHours: courseTotalHours(modulesByCourse.get(row.courseId) ?? []),
    sessionCount: sessionCountByCourse.get(row.courseId) ?? 0,
    participantCount: participantCountByCourse.get(row.courseId) ?? 0,
  }));
}

export async function listInstructors(
  actorUserId: number,
  courseId: number
): Promise<CourseInstructor[]> {
  await assertCourseMember(actorUserId, courseId);
  const rows = await db
    .select({
      userId: academyCourseInstructors.userId,
      email: users.email,
      name: users.name,
      lastName: users.lastName,
      avatarUrl: profiles.avatarUrl,
    })
    .from(academyCourseInstructors)
    .innerJoin(users, eq(users.id, academyCourseInstructors.userId))
    .leftJoin(profiles, eq(profiles.userId, academyCourseInstructors.userId))
    .where(eq(academyCourseInstructors.courseId, courseId));
  return rows.map((row) => ({
    userId: row.userId,
    email: row.email,
    avatarUrl: row.avatarUrl,
    displayName: [row.name, row.lastName].filter(Boolean).join(' ') || row.email,
  }));
}

/**
 * Nomina è una relazione con il corso, non un ruolo globale: non rende un
 * coach docente ovunque, e non lo iscrive come partecipante. Idempotente —
 * nominare due volte lo stesso coach per lo stesso corso non duplica nulla.
 */
export async function nominateInstructor(params: {
  actorUserId: number;
  courseId: number;
  userId: number;
}): Promise<void> {
  await assertAdmin(params.actorUserId);
  if (!(await isEligibleCoach(params.userId))) {
    throw new Error('Solo un coach con profilo approvato può essere nominato docente.');
  }
  if (await isParticipantOf(params.userId, params.courseId)) {
    throw new Error(
      'Questo coach è già assegnato come partecipante a questo corso e non può esserne anche il docente.'
    );
  }

  await db
    .insert(academyCourseInstructors)
    .values({
      courseId: params.courseId,
      userId: params.userId,
      nominatedBy: params.actorUserId,
    })
    .onConflictDoNothing();
}

/**
 * Rimuove un docente da un corso. Se esiste già una sessione Academy
 * tenuta da questo docente per questo corso, il database rifiuta la
 * cancellazione (la chiave esterna composta di `academy_sessions` non ha
 * `ON DELETE CASCADE` verso questa tabella): va prima risolta quella
 * sessione, non è una cancellazione silenziosa a cascata.
 */
export async function removeInstructor(params: {
  actorUserId: number;
  courseId: number;
  userId: number;
}): Promise<void> {
  await assertAdmin(params.actorUserId);
  await db
    .delete(academyCourseInstructors)
    .where(
      and(
        eq(academyCourseInstructors.courseId, params.courseId),
        eq(academyCourseInstructors.userId, params.userId)
      )
    );
}
