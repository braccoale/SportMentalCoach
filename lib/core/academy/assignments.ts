import 'server-only';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  academyCourses,
  academyCourseModules,
  academyCourseAssignments,
  users,
  type AcademyAssignmentStatus,
} from '@/lib/db/schema';
import { assertAdmin } from '@/lib/core/features';
import { isEligibleCoach } from './coaches';

export type CourseAssignment = {
  assignmentId: number;
  userId: number;
  displayName: string;
  status: AcademyAssignmentStatus;
};

export async function listAssignments(
  actorUserId: number,
  courseId: number
): Promise<CourseAssignment[]> {
  await assertAdmin(actorUserId);
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
  return rows.map((row) => ({
    assignmentId: row.assignmentId,
    userId: row.userId,
    displayName: [row.name, row.lastName].filter(Boolean).join(' ') || row.email,
    status: row.status as AcademyAssignmentStatus,
  }));
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
