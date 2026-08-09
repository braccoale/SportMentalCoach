import 'server-only';
import { and, desc, eq, isNull, lt, ne, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { countExpiredSessions } from './stuck-sessions';
import { createProductionAiSessionNotesDependencies } from './dependencies';
import {
  sessionAiNotes,
  sessionAiProcessingJobs,
  sessionAiReports,
  sessionAudioRecordings,
  sessionTranscriptSegments,
} from '@/lib/db/schema';

/**
 * Fotografia dello stato della pipeline Appunti AI.
 *
 * Perché esiste. La pipeline è una catena lunga — consenso, registrazione,
 * egress, coda, trascrizione, report — e finora l'unico modo di sapere se
 * stesse funzionando era interrogare il database a mano. Quattro job fermi in
 * coda per ore non hanno prodotto nessun segnale: né un errore, né un allarme,
 * niente. Un sistema che si guasta in silenzio è peggio di uno che si guasta.
 *
 * Sola lettura, aggregata: nessun contenuto di sessione, nessuna trascrizione,
 * nessun nome. Solo conteggi e stati, perché questa pagina serve a capire se la
 * meccanica gira, non a leggere cosa si sono detti coach e atleta.
 */

/** Oltre questa soglia un job in coda è considerato fermo, non in attesa. */
export const STUCK_JOB_MINUTES = 15;

/** Una sessione ancora `active` dopo tante ore non si chiuderà più da sola. */
export const ORPHAN_SESSION_HOURS = 6;

export type QueueCount = { label: string; count: number };

export type StuckJob = {
  id: number;
  jobType: string;
  status: string;
  attemptCount: number;
  maxAttempts: number;
  createdAt: Date;
  lockedBy: string | null;
  errorCode: string | null;
};

export type AiPipelineHealth = {
  jobsByStatus: QueueCount[];
  sessionsByStatus: QueueCount[];
  recordingsByStatus: QueueCount[];
  reportsByStatus: QueueCount[];
  stuckJobs: StuckJob[];
  orphanSessions: number;
  transcriptSegments: number;
  transcribedSessions: number;
  lastSegmentAt: Date | null;
  lastReportAt: Date | null;
  /** Configurazione letta a runtime: dice se il provider è davvero acceso. */
  sttProvider: string;
  sttApiKeyConfigured: boolean;
  /**
   * Sessioni oltre la loro scadenza, adesso.
   *
   * È il numero che deve valere zero. Se non vale zero, o la rete di
   * sicurezza non sta girando o c'è uno stato che nessuno chiude: in entrambi
   * i casi c'è un coach che guarda una rotellina.
   */
  expiredSessions: number;
  /**
   * L'indirizzo a cui il provider deve richiamarci, senza il token.
   *
   * Una variabile d'ambiente sbagliata qui non si vede da nessuna parte
   * finché non è una seduta vera a scoprirlo — ed è esattamente come è andata.
   */
  callbackOrigin: string | null;
  callbackConfigured: boolean;
};

/** L'origine della callback, senza token: diagnostica, non un segreto. */
function callbackDiagnostics(): {
  callbackOrigin: string | null;
  callbackConfigured: boolean;
} {
  const base = process.env.AI_NOTES_CALLBACK_BASE_URL?.trim();
  if (!base) return { callbackOrigin: null, callbackConfigured: false };
  try {
    const url = new URL(base);
    // Il provider deve poterci raggiungere da internet: http o un indirizzo
    // locale non arriveranno mai, e vanno detti subito.
    const reachable =
      url.protocol === 'https:' &&
      !['localhost', '127.0.0.1', '0.0.0.0'].includes(url.hostname);
    return { callbackOrigin: url.origin, callbackConfigured: reachable };
  } catch {
    return { callbackOrigin: base.slice(0, 60), callbackConfigured: false };
  }
}

export async function getAiPipelineHealth(): Promise<AiPipelineHealth> {
  const expired = await countExpiredSessions(
    createProductionAiSessionNotesDependencies()
  );
  const stuckBefore = new Date(Date.now() - STUCK_JOB_MINUTES * 60_000);
  const orphanBefore = new Date(Date.now() - ORPHAN_SESSION_HOURS * 3_600_000);

  const [
    jobs,
    sessions,
    recordings,
    reports,
    stuck,
    orphans,
    segments,
    lastReport,
  ] = await Promise.all([
    db
      .select({
        label: sessionAiProcessingJobs.status,
        count: sql<number>`count(*)::int`,
      })
      .from(sessionAiProcessingJobs)
      .groupBy(sessionAiProcessingJobs.status),

    db
      .select({
        label: sessionAiNotes.status,
        count: sql<number>`count(*)::int`,
      })
      .from(sessionAiNotes)
      .groupBy(sessionAiNotes.status),

    db
      .select({
        label: sessionAudioRecordings.status,
        count: sql<number>`count(*)::int`,
      })
      .from(sessionAudioRecordings)
      .groupBy(sessionAudioRecordings.status),

    db
      .select({
        label: sessionAiReports.status,
        count: sql<number>`count(*)::int`,
      })
      .from(sessionAiReports)
      .groupBy(sessionAiReports.status),

    // Fermi, non in attesa: in coda o presi in carico da troppo tempo.
    db
      .select({
        id: sessionAiProcessingJobs.id,
        jobType: sessionAiProcessingJobs.jobType,
        status: sessionAiProcessingJobs.status,
        attemptCount: sessionAiProcessingJobs.attemptCount,
        maxAttempts: sessionAiProcessingJobs.maxAttempts,
        createdAt: sessionAiProcessingJobs.createdDate,
        lockedBy: sessionAiProcessingJobs.lockedBy,
        errorCode: sessionAiProcessingJobs.errorCode,
      })
      .from(sessionAiProcessingJobs)
      .where(
        and(
          sql`${sessionAiProcessingJobs.status} in ('queued', 'processing')`,
          lt(sessionAiProcessingJobs.createdDate, stuckBefore)
        )
      )
      .orderBy(sessionAiProcessingJobs.id)
      .limit(20),

    db
      .select({ count: sql<number>`count(*)::int` })
      .from(sessionAiNotes)
      .where(
        and(
          eq(sessionAiNotes.status, 'active'),
          lt(sessionAiNotes.createdDate, orphanBefore)
        )
      ),

    db
      .select({
        total: sql<number>`count(*)::int`,
        sessions: sql<number>`count(distinct ${sessionTranscriptSegments.sessionAiNotesId})::int`,
        last: sql<Date | null>`max(${sessionTranscriptSegments.createdDate})`,
      })
      .from(sessionTranscriptSegments),

    db
      .select({ createdAt: sessionAiReports.createdDate })
      .from(sessionAiReports)
      .orderBy(desc(sessionAiReports.createdDate))
      .limit(1),
  ]);

  const provider = process.env.AI_NOTES_STT_PROVIDER?.trim() || 'disabled';

  return {
    jobsByStatus: jobs,
    sessionsByStatus: sessions,
    recordingsByStatus: recordings,
    reportsByStatus: reports,
    stuckJobs: stuck,
    orphanSessions: orphans[0]?.count ?? 0,
    transcriptSegments: segments[0]?.total ?? 0,
    transcribedSessions: segments[0]?.sessions ?? 0,
    lastSegmentAt: segments[0]?.last ?? null,
    lastReportAt: lastReport[0]?.createdAt ?? null,
    sttProvider: provider,
    // Mai il valore: solo se c'è. Un segreto non si mostra nemmeno all'admin.
    sttApiKeyConfigured: Boolean(process.env.DEEPGRAM_API_KEY?.trim()),
    expiredSessions: expired,
    ...callbackDiagnostics(),
  };
}

/**
 * Registrazioni rimaste in `starting`: l'egress è partito ma non è mai arrivata
 * la conferma. Sono la causa più comune di una sessione che non produce audio.
 */
export async function getStalledRecordings(): Promise<
  { id: number; sessionId: number; egressId: string | null; createdAt: Date }[]
> {
  return db
    .select({
      id: sessionAudioRecordings.id,
      sessionId: sessionAudioRecordings.sessionAiNotesId,
      egressId: sessionAudioRecordings.livekitEgressId,
      createdAt: sessionAudioRecordings.createdDate,
    })
    .from(sessionAudioRecordings)
    .where(
      and(
        sql`${sessionAudioRecordings.status} in ('pending', 'starting', 'stopping')`,
        isNull(sessionAudioRecordings.deletedAt),
        ne(sessionAudioRecordings.status, 'recorded')
      )
    )
    .orderBy(sessionAudioRecordings.id)
    .limit(20);
}
