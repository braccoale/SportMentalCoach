import 'server-only';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  academyCourseAssignments,
  academyCourseModules,
  academyCourses,
  academySessionParticipants,
  academySessions,
  providerProfiles,
  users,
  type AcademySession,
  type AcademySessionMode,
} from '@/lib/db/schema';
import { assertAdmin } from '@/lib/core/features';
import { getCoachBusyIntervalsByProviderIds } from '@/lib/core/availability';
import { assertCourseMember, assertInstructorOrAdmin, assertIsInstructor } from './instructors';

/** Oltre questo numero, una sessione di gruppo non si può creare: non ancora provata a questa scala. */
const MAX_GROUP_PARTICIPANTS = 8;

function displayName(row: { name: string | null; lastName: string | null; email: string }): string {
  return [row.name, row.lastName].filter(Boolean).join(' ') || row.email;
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Chi, fra i coach coinvolti, ha già un impegno che si sovrappone al nuovo
 * orario — sia una `bookings` (come provider: ogni coach ha il proprio
 * calendario coach↔atleta) sia un'altra `academy_sessions` (come docente o
 * come partecipante). Le due tabelle non si toccano a vicenda nello schema,
 * quindi il controllo deve interrogarle entrambe esplicitamente: è
 * esattamente il controllo bidirezionale che manca al resto della
 * piattaforma (vedi la spec) e che qui va costruito da zero.
 */
async function findConflictingUserIds(
  userIds: number[],
  scheduledFor: Date,
  durationMin: number
): Promise<Set<number>> {
  const newStart = scheduledFor.getTime();
  const newEnd = newStart + durationMin * 60_000;
  const conflicting = new Set<number>();

  const providerRows = await db
    .select({ userId: providerProfiles.userId, providerId: providerProfiles.id })
    .from(providerProfiles)
    .where(inArray(providerProfiles.userId, userIds));
  const providerIdByUserId = new Map(providerRows.map((r) => [r.userId, r.providerId]));
  const busyByProvider = await getCoachBusyIntervalsByProviderIds([...providerIdByUserId.values()]);
  for (const [userId, providerId] of providerIdByUserId) {
    for (const interval of busyByProvider.get(providerId) ?? []) {
      const start = interval.scheduledFor.getTime();
      const end = start + interval.durationMin * 60_000;
      if (overlaps(newStart, newEnd, start, end)) conflicting.add(userId);
    }
  }

  const instructorSessions = await db
    .select({
      userId: academySessions.instructorUserId,
      scheduledFor: academySessions.scheduledFor,
      durationMin: academySessions.durationMin,
    })
    .from(academySessions)
    .where(and(inArray(academySessions.instructorUserId, userIds), eq(academySessions.status, 'scheduled')));

  const participantSessions = await db
    .select({
      userId: academyCourseAssignments.userId,
      scheduledFor: academySessions.scheduledFor,
      durationMin: academySessions.durationMin,
    })
    .from(academySessionParticipants)
    .innerJoin(academySessions, eq(academySessions.id, academySessionParticipants.sessionId))
    .innerJoin(academyCourseAssignments, eq(academyCourseAssignments.id, academySessionParticipants.assignmentId))
    .where(and(inArray(academyCourseAssignments.userId, userIds), eq(academySessions.status, 'scheduled')));

  for (const row of [...instructorSessions, ...participantSessions]) {
    const start = row.scheduledFor.getTime();
    const end = start + row.durationMin * 60_000;
    if (overlaps(newStart, newEnd, start, end)) conflicting.add(row.userId);
  }

  return conflicting;
}

export type CreateSessionParams = {
  actorUserId: number;
  instructorUserId: number;
  courseId: number;
  moduleId: number;
  mode: AcademySessionMode;
  scheduledFor: Date;
  durationMin: number;
  participantAssignmentIds: number[];
  description?: string | null;
};

/**
 * Crea una sessione Academy. `actorUserId` è chi preme il bottone (l'admin,
 * o il docente stesso); `instructorUserId` è chi la terrà — normalmente
 * coincidono, ma l'admin può crearla per conto di un docente nominato.
 */
export async function createSession(params: CreateSessionParams): Promise<AcademySession> {
  // Chi preme il bottone deve poter agire su questo corso...
  if (params.actorUserId !== params.instructorUserId) {
    await assertAdmin(params.actorUserId);
  }
  // ...ma chi terrà la sessione deve essere davvero un docente nominato,
  // anche quando è l'admin a crearla per suo conto.
  await assertIsInstructor(params.instructorUserId, params.courseId);

  if (!Number.isFinite(params.durationMin) || params.durationMin <= 0) {
    throw new Error('La durata deve essere maggiore di zero.');
  }
  if (params.scheduledFor.getTime() <= Date.now()) {
    throw new Error('La data della sessione deve essere nel futuro.');
  }

  const [course] = await db
    .select({ status: academyCourses.status })
    .from(academyCourses)
    .where(eq(academyCourses.id, params.courseId))
    .limit(1);
  if (!course) throw new Error('Corso non trovato.');
  if (course.status !== 'active') {
    throw new Error('Solo un corso attivo può avere sessioni pianificate.');
  }

  const uniqueParticipantIds = [...new Set(params.participantAssignmentIds)];
  if (params.mode === 'individual' && uniqueParticipantIds.length !== 1) {
    throw new Error('Una sessione individuale richiede esattamente un partecipante.');
  }
  if (params.mode === 'group' && uniqueParticipantIds.length < 2) {
    throw new Error('Una sessione di gruppo richiede almeno due partecipanti.');
  }
  if (uniqueParticipantIds.length > MAX_GROUP_PARTICIPANTS) {
    throw new Error(`Una sessione può avere al massimo ${MAX_GROUP_PARTICIPANTS} partecipanti.`);
  }

  const [module] = await db
    .select({ id: academyCourseModules.id })
    .from(academyCourseModules)
    .where(and(eq(academyCourseModules.id, params.moduleId), eq(academyCourseModules.courseId, params.courseId)))
    .limit(1);
  if (!module) throw new Error('Il modulo non appartiene a questo corso.');

  const participantAssignments = await db
    .select({ id: academyCourseAssignments.id, userId: academyCourseAssignments.userId })
    .from(academyCourseAssignments)
    .where(
      and(
        eq(academyCourseAssignments.courseId, params.courseId),
        inArray(academyCourseAssignments.id, uniqueParticipantIds)
      )
    );
  if (participantAssignments.length !== uniqueParticipantIds.length) {
    throw new Error('Uno o più partecipanti non sono assegnati a questo corso.');
  }
  if (participantAssignments.some((p) => p.userId === params.instructorUserId)) {
    throw new Error('Il docente non può essere anche partecipante della propria sessione.');
  }

  const involvedUserIds = [params.instructorUserId, ...participantAssignments.map((p) => p.userId)];
  const conflicting = await findConflictingUserIds(involvedUserIds, params.scheduledFor, params.durationMin);
  if (conflicting.size > 0) {
    const conflictingUsers = await db
      .select({ id: users.id, name: users.name, lastName: users.lastName, email: users.email })
      .from(users)
      .where(inArray(users.id, [...conflicting]));
    const label = conflictingUsers.map(displayName).join(', ');
    throw new Error(`Orario non disponibile per: ${label}.`);
  }

  return db.transaction(async (tx) => {
    const [session] = await tx
      .insert(academySessions)
      .values({
        courseId: params.courseId,
        moduleId: params.moduleId,
        instructorUserId: params.instructorUserId,
        mode: params.mode,
        scheduledFor: params.scheduledFor,
        durationMin: params.durationMin,
        description: params.description || null,
        createdBy: params.actorUserId,
        updatedBy: params.actorUserId,
      })
      .returning();

    await tx.insert(academySessionParticipants).values(
      participantAssignments.map((p) => ({
        sessionId: session.id,
        courseId: params.courseId,
        assignmentId: p.id,
        createdBy: params.actorUserId,
      }))
    );

    return session;
  });
}

export type CourseSessionRow = {
  id: number;
  courseId: number;
  courseTitle: string;
  moduleId: number;
  moduleTitle: string;
  instructorUserId: number;
  instructorName: string;
  mode: AcademySessionMode;
  status: 'scheduled' | 'cancelled';
  scheduledFor: Date;
  durationMin: number;
  description: string | null;
  participants: { userId: number; displayName: string }[];
};

export async function listSessionsForCourse(
  actorUserId: number,
  courseId: number
): Promise<CourseSessionRow[]> {
  await assertCourseMember(actorUserId, courseId);

  const sessions = await db
    .select({
      id: academySessions.id,
      courseId: academySessions.courseId,
      courseTitle: academyCourses.title,
      moduleId: academySessions.moduleId,
      moduleTitle: academyCourseModules.title,
      instructorUserId: academySessions.instructorUserId,
      instructorName: users.name,
      instructorLastName: users.lastName,
      instructorEmail: users.email,
      mode: academySessions.mode,
      status: academySessions.status,
      scheduledFor: academySessions.scheduledFor,
      durationMin: academySessions.durationMin,
      description: academySessions.description,
    })
    .from(academySessions)
    .innerJoin(academyCourses, eq(academyCourses.id, academySessions.courseId))
    .innerJoin(academyCourseModules, eq(academyCourseModules.id, academySessions.moduleId))
    .innerJoin(users, eq(users.id, academySessions.instructorUserId))
    .where(eq(academySessions.courseId, courseId))
    .orderBy(academySessions.scheduledFor);

  if (sessions.length === 0) return [];

  const participantRows = await db
    .select({
      sessionId: academySessionParticipants.sessionId,
      userId: academyCourseAssignments.userId,
      name: users.name,
      lastName: users.lastName,
      email: users.email,
    })
    .from(academySessionParticipants)
    .innerJoin(academyCourseAssignments, eq(academyCourseAssignments.id, academySessionParticipants.assignmentId))
    .innerJoin(users, eq(users.id, academyCourseAssignments.userId))
    .where(
      inArray(
        academySessionParticipants.sessionId,
        sessions.map((s) => s.id)
      )
    );

  const participantsBySession = new Map<number, { userId: number; displayName: string }[]>();
  for (const row of participantRows) {
    const list = participantsBySession.get(row.sessionId) ?? [];
    list.push({ userId: row.userId, displayName: displayName(row) });
    participantsBySession.set(row.sessionId, list);
  }

  return sessions.map((session) => ({
    id: session.id,
    courseId: session.courseId,
    courseTitle: session.courseTitle,
    moduleId: session.moduleId,
    moduleTitle: session.moduleTitle,
    instructorUserId: session.instructorUserId,
    instructorName: displayName({
      name: session.instructorName,
      lastName: session.instructorLastName,
      email: session.instructorEmail,
    }),
    mode: session.mode as AcademySessionMode,
    status: session.status as 'scheduled' | 'cancelled',
    scheduledFor: session.scheduledFor,
    durationMin: session.durationMin,
    description: session.description,
    participants: participantsBySession.get(session.id) ?? [],
  }));
}

/**
 * Tutte le sessioni non annullate a cui un coach partecipa — come docente o
 * come partecipante — nel futuro o nel passato prossimo, per il suo
 * calendario. Nessun `assertInstructorOrAdmin`: legge solo le proprie
 * sessioni, la stessa postura di `listAssignmentsForUser`.
 */
export type UserSessionRow = CourseSessionRow & { asInstructor: boolean };

export async function listSessionsForUser(userId: number): Promise<UserSessionRow[]> {
  const asInstructorRows = await db
    .select({
      id: academySessions.id,
      courseId: academySessions.courseId,
      courseTitle: academyCourses.title,
      moduleId: academySessions.moduleId,
      moduleTitle: academyCourseModules.title,
      instructorUserId: academySessions.instructorUserId,
      instructorName: users.name,
      instructorLastName: users.lastName,
      instructorEmail: users.email,
      mode: academySessions.mode,
      status: academySessions.status,
      scheduledFor: academySessions.scheduledFor,
      durationMin: academySessions.durationMin,
      description: academySessions.description,
    })
    .from(academySessions)
    .innerJoin(academyCourses, eq(academyCourses.id, academySessions.courseId))
    .innerJoin(academyCourseModules, eq(academyCourseModules.id, academySessions.moduleId))
    .innerJoin(users, eq(users.id, academySessions.instructorUserId))
    .where(eq(academySessions.instructorUserId, userId));

  const asParticipantRows = await db
    .select({
      id: academySessions.id,
      courseId: academySessions.courseId,
      courseTitle: academyCourses.title,
      moduleId: academySessions.moduleId,
      moduleTitle: academyCourseModules.title,
      instructorUserId: academySessions.instructorUserId,
      instructorName: users.name,
      instructorLastName: users.lastName,
      instructorEmail: users.email,
      mode: academySessions.mode,
      status: academySessions.status,
      scheduledFor: academySessions.scheduledFor,
      durationMin: academySessions.durationMin,
      description: academySessions.description,
    })
    .from(academySessionParticipants)
    .innerJoin(academySessions, eq(academySessions.id, academySessionParticipants.sessionId))
    .innerJoin(academyCourses, eq(academyCourses.id, academySessions.courseId))
    .innerJoin(academyCourseModules, eq(academyCourseModules.id, academySessions.moduleId))
    .innerJoin(users, eq(users.id, academySessions.instructorUserId))
    .innerJoin(academyCourseAssignments, eq(academyCourseAssignments.id, academySessionParticipants.assignmentId))
    .where(eq(academyCourseAssignments.userId, userId));

  const allIds = [...asInstructorRows.map((r) => r.id), ...asParticipantRows.map((r) => r.id)];
  const participantRows =
    allIds.length === 0
      ? []
      : await db
          .select({
            sessionId: academySessionParticipants.sessionId,
            userId: academyCourseAssignments.userId,
            name: users.name,
            lastName: users.lastName,
            email: users.email,
          })
          .from(academySessionParticipants)
          .innerJoin(
            academyCourseAssignments,
            eq(academyCourseAssignments.id, academySessionParticipants.assignmentId)
          )
          .innerJoin(users, eq(users.id, academyCourseAssignments.userId))
          .where(inArray(academySessionParticipants.sessionId, allIds));

  const participantsBySession = new Map<number, { userId: number; displayName: string }[]>();
  for (const row of participantRows) {
    const list = participantsBySession.get(row.sessionId) ?? [];
    list.push({ userId: row.userId, displayName: displayName(row) });
    participantsBySession.set(row.sessionId, list);
  }

  function toRow(session: (typeof asInstructorRows)[number], asInstructor: boolean): UserSessionRow {
    return {
      id: session.id,
      courseId: session.courseId,
      courseTitle: session.courseTitle,
      moduleId: session.moduleId,
      moduleTitle: session.moduleTitle,
      instructorUserId: session.instructorUserId,
      instructorName: displayName({
        name: session.instructorName,
        lastName: session.instructorLastName,
        email: session.instructorEmail,
      }),
      mode: session.mode as AcademySessionMode,
      status: session.status as 'scheduled' | 'cancelled',
      scheduledFor: session.scheduledFor,
      durationMin: session.durationMin,
      description: session.description,
      participants: participantsBySession.get(session.id) ?? [],
      asInstructor,
    };
  }

  const seen = new Set<number>();
  const rows: UserSessionRow[] = [];
  for (const session of asInstructorRows) {
    seen.add(session.id);
    rows.push(toRow(session, true));
  }
  for (const session of asParticipantRows) {
    if (seen.has(session.id)) continue;
    seen.add(session.id);
    rows.push(toRow(session, false));
  }

  return rows.sort((a, b) => a.scheduledFor.getTime() - b.scheduledFor.getTime());
}

export async function cancelSession(params: {
  actorUserId: number;
  courseId: number;
  sessionId: number;
}): Promise<void> {
  await assertInstructorOrAdmin(params.actorUserId, params.courseId);
  await db
    .update(academySessions)
    .set({ status: 'cancelled', updatedDate: new Date(), updatedBy: params.actorUserId })
    .where(and(eq(academySessions.id, params.sessionId), eq(academySessions.courseId, params.courseId)));
}
