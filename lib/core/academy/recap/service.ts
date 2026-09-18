import 'server-only';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  academyCourses,
  academyCourseModules,
  academySessionConfidenceRatings,
  academySessionRecaps,
  academySessions,
  users,
  type AcademyConfidenceTiming,
  type AcademyRecapStatus,
} from '@/lib/db/schema';
import { assertAdmin } from '@/lib/core/features';
import { assertInstructorOrAdmin } from '../instructors';
import { isSessionParticipant } from '../sessions';
import { generateValidatedAcademyRecap, AcademyRecapGenerationError } from './provider';
import { openAiAcademyRecapProviderFromEnvironment } from './openai-provider';
import { validateAcademyRecapContent, type AcademyRecapContent } from './contract';

export type AcademyRecapRecord = {
  id: number;
  sessionId: number;
  courseId: number;
  transcriptText: string;
  status: AcademyRecapStatus;
  content: AcademyRecapContent | null;
  errorMessage: string | null;
  generatedAt: Date | null;
  editedAt: Date | null;
};

function toRecord(row: typeof academySessionRecaps.$inferSelect): AcademyRecapRecord {
  return {
    id: row.id,
    sessionId: row.sessionId,
    courseId: row.courseId,
    transcriptText: row.transcriptText,
    status: row.status as AcademyRecapStatus,
    content: (row.content as AcademyRecapContent | null) ?? null,
    errorMessage: row.errorMessage,
    generatedAt: row.generatedAt,
    editedAt: row.editedAt,
  };
}

/**
 * Chi può vedere il recap di questa sessione: il partecipante invitato a
 * *questa* sessione (non a un'altra dello stesso corso), il docente che la
 * tiene, o l'admin. Restituisce `null` — non un errore — quando l'utente
 * non ha alcun diritto: il chiamante decide se trattarlo come 404.
 */
async function assertCanViewSession(actorUserId: number, sessionId: number): Promise<void> {
  const [session] = await db
    .select({ instructorUserId: academySessions.instructorUserId })
    .from(academySessions)
    .where(eq(academySessions.id, sessionId))
    .limit(1);
  if (!session) throw new Error('NOT_FOUND');

  if (session.instructorUserId === actorUserId) return;
  if (await isSessionParticipant(actorUserId, sessionId)) return;
  try {
    await assertAdmin(actorUserId);
    return;
  } catch {
    throw new Error('FORBIDDEN');
  }
}

/** Vista sola lettura — usata sia dalla pagina sessione sia dal corso del partecipante. */
export async function getRecapForSession(
  actorUserId: number,
  sessionId: number
): Promise<AcademyRecapRecord | null> {
  await assertCanViewSession(actorUserId, sessionId);
  const [row] = await db
    .select()
    .from(academySessionRecaps)
    .where(eq(academySessionRecaps.sessionId, sessionId))
    .limit(1);
  return row ? toRecord(row) : null;
}

export type AcademyRecapWithSessionMeta = {
  recap: AcademyRecapRecord;
  courseTitle: string;
  moduleTitle: string;
  instructorName: string;
  scheduledFor: Date;
};

/** Recap più i metadati di sessione necessari a costruire il PDF — la route di download non ha già in mano la pagina. */
export async function getRecapForPdf(
  actorUserId: number,
  sessionId: number
): Promise<AcademyRecapWithSessionMeta | null> {
  await assertCanViewSession(actorUserId, sessionId);
  const [row] = await db
    .select({
      recap: academySessionRecaps,
      courseTitle: academyCourses.title,
      moduleTitle: academyCourseModules.title,
      instructorName: users.name,
      instructorLastName: users.lastName,
      instructorEmail: users.email,
      scheduledFor: academySessions.scheduledFor,
    })
    .from(academySessionRecaps)
    .innerJoin(academySessions, eq(academySessions.id, academySessionRecaps.sessionId))
    .innerJoin(academyCourses, eq(academyCourses.id, academySessions.courseId))
    .innerJoin(academyCourseModules, eq(academyCourseModules.id, academySessions.moduleId))
    .innerJoin(users, eq(users.id, academySessions.instructorUserId))
    .where(eq(academySessionRecaps.sessionId, sessionId))
    .limit(1);
  if (!row) return null;

  return {
    recap: toRecord(row.recap),
    courseTitle: row.courseTitle,
    moduleTitle: row.moduleTitle,
    instructorName: [row.instructorName, row.instructorLastName].filter(Boolean).join(' ') || row.instructorEmail,
    scheduledFor: row.scheduledFor,
  };
}

/**
 * Genera (o rigenera, sovrascrivendo) il recap da una trascrizione incollata
 * a mano — in questo MVP non esiste ancora una registrazione/trascrizione
 * automatica per le sessioni Academy (vedi `ai-session-notes` skill: quella
 * delle prenotazioni non si estende qui). Solo docente o admin.
 */
export async function generateRecap(params: {
  actorUserId: number;
  sessionId: number;
  courseId: number;
  transcriptText: string;
}): Promise<AcademyRecapRecord> {
  await assertInstructorOrAdmin(params.actorUserId, params.courseId);

  const transcriptText = params.transcriptText.trim();
  if (transcriptText.length < 20) {
    throw new Error('La trascrizione è troppo corta per generare un recap utile.');
  }

  const [session] = await db
    .select({
      courseTitle: academyCourses.title,
      moduleTitle: academyCourseModules.title,
    })
    .from(academySessions)
    .innerJoin(academyCourses, eq(academyCourses.id, academySessions.courseId))
    .innerJoin(academyCourseModules, eq(academyCourseModules.id, academySessions.moduleId))
    .where(and(eq(academySessions.id, params.sessionId), eq(academySessions.courseId, params.courseId)))
    .limit(1);
  if (!session) throw new Error('Sessione non trovata.');

  const generatedAt = new Date();
  let content: AcademyRecapContent | null = null;
  let status: AcademyRecapStatus = 'generated';
  let errorMessage: string | null = null;

  try {
    const provider = openAiAcademyRecapProviderFromEnvironment();
    content = await generateValidatedAcademyRecap(
      {
        sessionId: params.sessionId,
        courseTitle: session.courseTitle,
        moduleTitle: session.moduleTitle,
        transcriptText,
        generatedAt: generatedAt.toISOString(),
      },
      provider
    );
  } catch (error) {
    status = 'failed';
    errorMessage =
      error instanceof AcademyRecapGenerationError
        ? error.message
        : 'La generazione del recap non è riuscita.';
  }

  const [row] = await db
    .insert(academySessionRecaps)
    .values({
      sessionId: params.sessionId,
      courseId: params.courseId,
      transcriptText,
      status,
      content: content as Record<string, unknown> | null,
      errorMessage,
      generationProvider: content?.generation.provider ?? null,
      generationModel: content?.generation.model ?? null,
      generatedAt: content ? generatedAt : null,
      createdBy: params.actorUserId,
      updatedBy: params.actorUserId,
    })
    .onConflictDoUpdate({
      target: academySessionRecaps.sessionId,
      set: {
        transcriptText,
        status,
        content: content as Record<string, unknown> | null,
        errorMessage,
        generationProvider: content?.generation.provider ?? null,
        generationModel: content?.generation.model ?? null,
        generatedAt: content ? generatedAt : null,
        editedBy: null,
        editedAt: null,
        updatedDate: new Date(),
        updatedBy: params.actorUserId,
      },
    })
    .returning();

  return toRecord(row);
}

/**
 * Correzione manuale del contenuto già generato — non passa dal provider
 * AI. Prende le liste già spezzate riga per riga (stessa convenzione delle
 * altre form Academy, es. "cosa imparerai"), non un blob JSON: chi corregge
 * è un docente in un form, non uno sviluppatore. I metadati di generazione
 * originali restano — `status: 'edited'` e `editedBy/editedAt` bastano a
 * dire che una persona li ha poi corretti. Solo docente o admin, e solo su
 * un recap che esiste già.
 */
export async function editRecapContent(params: {
  actorUserId: number;
  sessionId: number;
  courseId: number;
  keyConcepts: string[];
  toolsAndProtocols: string[];
  practicalCases: string[];
  openQuestions: string[];
  nextAction: string;
  topicsCovered: string[];
}): Promise<AcademyRecapRecord> {
  await assertInstructorOrAdmin(params.actorUserId, params.courseId);

  const [existing] = await db
    .select({ content: academySessionRecaps.content })
    .from(academySessionRecaps)
    .where(
      and(eq(academySessionRecaps.sessionId, params.sessionId), eq(academySessionRecaps.courseId, params.courseId))
    )
    .limit(1);
  if (!existing) throw new Error('Nessun recap da correggere: generane prima uno.');
  const existingContent = existing.content as AcademyRecapContent | null;

  const content: AcademyRecapContent = {
    schemaVersion: '1.0',
    keyConcepts: params.keyConcepts.slice(0, 5),
    toolsAndProtocols: params.toolsAndProtocols,
    practicalCases: params.practicalCases,
    openQuestions: params.openQuestions,
    nextAction: params.nextAction,
    topicsCovered: params.topicsCovered,
    generation: existingContent?.generation ?? {
      provider: 'manuale',
      model: 'manuale',
      generatedAt: new Date().toISOString(),
    },
  };
  const issues = validateAcademyRecapContent(content);
  if (issues.length > 0) {
    throw new Error(`Contenuto del recap non valido: ${issues.map((i) => i.message).join(' ')}`);
  }

  const [row] = await db
    .update(academySessionRecaps)
    .set({
      status: 'edited',
      content: content as unknown as Record<string, unknown>,
      errorMessage: null,
      editedBy: params.actorUserId,
      editedAt: new Date(),
      updatedDate: new Date(),
      updatedBy: params.actorUserId,
    })
    .where(
      and(eq(academySessionRecaps.sessionId, params.sessionId), eq(academySessionRecaps.courseId, params.courseId))
    )
    .returning();
  if (!row) throw new Error('Nessun recap da correggere: generane prima uno.');
  return toRecord(row);
}

/**
 * L'autovalutazione 1-5 di sicurezza del partecipante, prima o dopo la
 * sessione. Solo la persona stessa può scriverla — mai vista né valutata
 * dal docente in questo MVP: è per la crescita del singolo, non per
 * classificarlo agli occhi di qualcun altro.
 */
export async function setConfidenceRating(params: {
  actorUserId: number;
  sessionId: number;
  courseId: number;
  timing: AcademyConfidenceTiming;
  rating: number;
}): Promise<void> {
  if (!(await isSessionParticipant(params.actorUserId, params.sessionId))) {
    throw new Error('Solo un partecipante invitato a questa sessione può autovalutarsi.');
  }
  if (!Number.isInteger(params.rating) || params.rating < 1 || params.rating > 5) {
    throw new Error('La valutazione deve essere un numero intero tra 1 e 5.');
  }

  await db
    .insert(academySessionConfidenceRatings)
    .values({
      sessionId: params.sessionId,
      courseId: params.courseId,
      userId: params.actorUserId,
      timing: params.timing,
      rating: params.rating,
      createdBy: params.actorUserId,
      updatedBy: params.actorUserId,
    })
    .onConflictDoUpdate({
      target: [
        academySessionConfidenceRatings.sessionId,
        academySessionConfidenceRatings.userId,
        academySessionConfidenceRatings.timing,
      ],
      set: { rating: params.rating, updatedDate: new Date(), updatedBy: params.actorUserId },
    });
}

export type ConfidenceRatings = { before: number | null; after: number | null };

/** Le proprie valutazioni prima/dopo per questa sessione — mai quelle di qualcun altro. */
export async function getOwnConfidenceRatings(
  actorUserId: number,
  sessionId: number
): Promise<ConfidenceRatings> {
  const rows = await db
    .select({ timing: academySessionConfidenceRatings.timing, rating: academySessionConfidenceRatings.rating })
    .from(academySessionConfidenceRatings)
    .where(
      and(
        eq(academySessionConfidenceRatings.sessionId, sessionId),
        eq(academySessionConfidenceRatings.userId, actorUserId)
      )
    );
  const before = rows.find((r) => r.timing === 'before')?.rating ?? null;
  const after = rows.find((r) => r.timing === 'after')?.rating ?? null;
  return { before, after };
}
