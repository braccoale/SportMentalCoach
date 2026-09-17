import 'server-only';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  academyCourseInstructors,
  academyCourses,
  users,
  type AcademyCourseStatus,
} from '@/lib/db/schema';
import { assertAdmin } from '@/lib/core/features';
import { isEligibleCoach } from './coaches';

export type CourseInstructor = { userId: number; displayName: string; email: string };

export type InstructorCourse = {
  courseId: number;
  title: string;
  edition: string | null;
  status: AcademyCourseStatus;
};

/** I corsi che un coach insegna — la sua vista "Corsi che tieni", mai `assertAdmin`. */
export async function listInstructorCourses(userId: number): Promise<InstructorCourse[]> {
  const rows = await db
    .select({
      courseId: academyCourses.id,
      title: academyCourses.title,
      edition: academyCourses.edition,
      status: academyCourses.status,
    })
    .from(academyCourseInstructors)
    .innerJoin(academyCourses, eq(academyCourses.id, academyCourseInstructors.courseId))
    .where(eq(academyCourseInstructors.userId, userId));
  return rows.map((row) => ({ ...row, status: row.status as AcademyCourseStatus }));
}

export async function listInstructors(
  actorUserId: number,
  courseId: number
): Promise<CourseInstructor[]> {
  await assertAdmin(actorUserId);
  const rows = await db
    .select({
      userId: academyCourseInstructors.userId,
      email: users.email,
      name: users.name,
      lastName: users.lastName,
    })
    .from(academyCourseInstructors)
    .innerJoin(users, eq(users.id, academyCourseInstructors.userId))
    .where(eq(academyCourseInstructors.courseId, courseId));
  return rows.map((row) => ({
    userId: row.userId,
    email: row.email,
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

  await db
    .insert(academyCourseInstructors)
    .values({
      courseId: params.courseId,
      userId: params.userId,
      nominatedBy: params.actorUserId,
    })
    .onConflictDoNothing();
}
