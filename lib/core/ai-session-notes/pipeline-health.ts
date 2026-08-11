import 'server-only';
import { and, desc, eq, lte, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  sessionAiNotes,
  sessionAiProcessingJobs,
} from '@/lib/db/schema';

/**
 * Lo stato di salute della pipeline, in una domanda sola: **c'è qualcosa di
 * fermo?**
 *
 * Nasce da una sera passata a ricostruire a mano, da quattro tabelle diverse,
 * perché una trascrizione non arrivava. Le informazioni c'erano tutte — job,
 * sessioni, sveglie, registrazioni — ma sparse, e nessuna diceva da sola se
 * il sistema stesse lavorando o fosse bloccato. Un cruscotto che mostra
 * conteggi non risponde a quella domanda: risponde questo.
 *
 * La regola che conta è una: **un job pronto e mai tentato è la firma di un
 * worker che non gira.** Non è lentezza — un job in lavorazione ha
 * `attempt_count` maggiore di zero e un `locked_by`. Zero tentativi dopo
 * minuti significa che nessuno l'ha nemmeno guardato.
 */

import {
  STUCK_SESSION_MINUTES,
  assessPipeline,
  type PipelineHealth,
} from './pipeline-health-policy';

export * from './pipeline-health-policy';

export async function getPipelineHealth(
  now: Date = new Date()
): Promise<PipelineHealth> {
  const [jobs] = await db
    .select({
      readyJobs: sql<number>`count(*)::int`,
      untouchedJobs: sql<number>`count(*) filter (where ${sessionAiProcessingJobs.attemptCount} = 0)::int`,
      oldestReadySeconds: sql<
        number | null
      >`extract(epoch from (${now.toISOString()}::timestamptz - min(${sessionAiProcessingJobs.availableAfter})))::int`,
    })
    .from(sessionAiProcessingJobs)
    .where(
      and(
        eq(sessionAiProcessingJobs.status, 'queued'),
        lte(sessionAiProcessingJobs.availableAfter, now)
      )
    );

  const [sessions] = await db
    .select({
      stuck: sql<number>`count(*) filter (
        where ${sessionAiNotes.updatedDate} < ${now.toISOString()}::timestamptz - (${STUCK_SESSION_MINUTES} * interval '1 minute')
      )::int`,
    })
    .from(sessionAiNotes)
    .where(eq(sessionAiNotes.status, 'processing'));

  const [lastActivity] = await db
    .select({ at: sessionAiProcessingJobs.updatedDate })
    .from(sessionAiProcessingJobs)
    .orderBy(desc(sessionAiProcessingJobs.updatedDate))
    .limit(1);

  const oldestReadyMinutes =
    jobs?.oldestReadySeconds === null || jobs?.oldestReadySeconds === undefined
      ? null
      : Math.max(0, Math.floor(Number(jobs.oldestReadySeconds) / 60));

  const numbers = {
    readyJobs: Number(jobs?.readyJobs ?? 0),
    untouchedJobs: Number(jobs?.untouchedJobs ?? 0),
    oldestReadyMinutes,
    stuckSessions: Number(sessions?.stuck ?? 0),
    lastJobActivityAt: lastActivity?.at ?? null,
  };

  return { ...numbers, ...assessPipeline(numbers) };
}
