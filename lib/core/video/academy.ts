import 'server-only';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  academyCourseAssignments,
  academyCourseModules,
  academyCourses,
  academySessionParticipants,
  academySessions,
  users,
} from '@/lib/db/schema';
import { isVideoConfigured } from '@/lib/core/flags';
import { isSessionJoinable, canJoinVideoNow } from '@/lib/core/sessions';
import { mintAccessToken } from './token';
import { createPreflightToken } from './index';

function displayName(row: { name: string | null; lastName: string | null; email: string }): string {
  return [row.name, row.lastName].filter(Boolean).join(' ') || row.email;
}

export type AcademyRoomTokenResult =
  | { ok: false; reason: 'unauthorized' }
  | { ok: false; reason: 'closed'; status: string; backHref: string }
  | { ok: false; reason: 'past'; backHref: string }
  | { ok: false; reason: 'too_early'; backHref: string; scheduledFor: string }
  | { ok: false; reason: 'not_configured'; backHref: string }
  | {
      ok: true;
      token: string;
      preflightToken: string;
      url: string;
      room: string;
      backHref: string;
      sessionId: number;
      courseId: number;
      courseTitle: string;
      moduleTitle: string;
      viewerIsInstructor: boolean;
      viewerName: string;
      instructorIdentity: string;
      instructorName: string;
      participantNames: string[];
      scheduledFor: string;
      durationMin: number;
    };

/**
 * Gemello di `createRoomToken` (lib/core/video/index.ts) ma per le sessioni
 * Academy, non le prenotazioni: partecipazione, stato e finestra di ingresso
 * si controllano allo stesso modo, ma qui non c'è un unico "altro
 * partecipante" — può esserci un docente e fino a 8 coach — e non c'è tutela
 * minori (i partecipanti sono sempre coach, mai atleti). Stanza propria
 * (`academy-session-<id>`), mai `booking-<id>`: le due sale non devono poter
 * mai collidere.
 */
export async function createAcademyRoomToken(
  sessionId: number,
  userId: number
): Promise<AcademyRoomTokenResult> {
  const backHref = '/dashboard/coach';

  const [session] = await db
    .select({
      id: academySessions.id,
      courseId: academySessions.courseId,
      courseTitle: academyCourses.title,
      moduleTitle: academyCourseModules.title,
      instructorUserId: academySessions.instructorUserId,
      instructorName: users.name,
      instructorLastName: users.lastName,
      instructorEmail: users.email,
      status: academySessions.status,
      scheduledFor: academySessions.scheduledFor,
      durationMin: academySessions.durationMin,
    })
    .from(academySessions)
    .innerJoin(academyCourses, eq(academyCourses.id, academySessions.courseId))
    .innerJoin(academyCourseModules, eq(academyCourseModules.id, academySessions.moduleId))
    .innerJoin(users, eq(users.id, academySessions.instructorUserId))
    .where(eq(academySessions.id, sessionId))
    .limit(1);

  if (!session) return { ok: false, reason: 'unauthorized' };

  const isInstructor = session.instructorUserId === userId;
  let isParticipant = false;
  if (!isInstructor) {
    const [row] = await db
      .select({ id: academySessionParticipants.id })
      .from(academySessionParticipants)
      .innerJoin(
        academyCourseAssignments,
        eq(academyCourseAssignments.id, academySessionParticipants.assignmentId)
      )
      .where(
        and(
          eq(academySessionParticipants.sessionId, sessionId),
          eq(academyCourseAssignments.userId, userId)
        )
      )
      .limit(1);
    isParticipant = Boolean(row);
  }
  if (!isInstructor && !isParticipant) return { ok: false, reason: 'unauthorized' };

  if (session.status !== 'scheduled') {
    return { ok: false, reason: 'closed', status: session.status, backHref };
  }
  if (!isSessionJoinable(session.scheduledFor, session.durationMin)) {
    return { ok: false, reason: 'past', backHref };
  }
  if (!canJoinVideoNow(session.scheduledFor, session.durationMin)) {
    return { ok: false, reason: 'too_early', backHref, scheduledFor: session.scheduledFor.toISOString() };
  }
  if (!isVideoConfigured()) {
    return { ok: false, reason: 'not_configured', backHref };
  }

  const [viewer] = await db
    .select({ name: users.name, lastName: users.lastName, email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const viewerName = viewer ? displayName(viewer) : 'Coach';

  const participantRows = await db
    .select({ name: users.name, lastName: users.lastName, email: users.email })
    .from(academySessionParticipants)
    .innerJoin(
      academyCourseAssignments,
      eq(academyCourseAssignments.id, academySessionParticipants.assignmentId)
    )
    .innerJoin(users, eq(users.id, academyCourseAssignments.userId))
    .where(eq(academySessionParticipants.sessionId, sessionId));

  const room = `academy-session-${sessionId}`;
  const token = await mintAccessToken({
    apiKey: process.env.LIVEKIT_API_KEY!,
    apiSecret: process.env.LIVEKIT_API_SECRET!,
    room,
    identity: `user-${userId}`,
    name: viewerName,
  });

  return {
    ok: true,
    token,
    preflightToken: await createPreflightToken(),
    url: process.env.NEXT_PUBLIC_LIVEKIT_URL!,
    room,
    backHref,
    sessionId: session.id,
    courseId: session.courseId,
    courseTitle: session.courseTitle,
    moduleTitle: session.moduleTitle,
    viewerIsInstructor: isInstructor,
    viewerName,
    instructorIdentity: `user-${session.instructorUserId}`,
    instructorName: displayName({
      name: session.instructorName,
      lastName: session.instructorLastName,
      email: session.instructorEmail,
    }),
    participantNames: participantRows.map(displayName),
    scheduledFor: session.scheduledFor.toISOString(),
    durationMin: session.durationMin,
  };
}
