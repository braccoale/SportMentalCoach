import 'server-only';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { sessionAiNotes, sessionAudioRecordings } from '@/lib/db/schema';
import { logPipeline } from './pipeline-log';
import { decideRecordingRetry } from './recording-retry-policy';
import { startAiNotesRecordingSystem } from './recording';
import type { LiveKitSessionControl } from './livekit-session-control';

/**
 * Riprende le registrazioni interrotte mentre la seduta è ancora in corso.
 *
 * L'avvio di una registrazione può fallire per ragioni che passano da sole:
 * la stanza sta ancora salendo, il provider è momentaneamente al limite, la
 * rete torna dopo un minuto. Finora un fallimento del genere era definitivo —
 * due tentativi a tre secondi di distanza e poi silenzio — e una seduta da
 * cinquantasei minuti è finita con sette minuti di voce del coach.
 *
 * Questa passata gira insieme al resto del worker, ogni pochi minuti, e
 * riprova finché ha senso riprovare. La decisione su *quando* sta nel modulo
 * puro accanto; qui c'è solo il lavoro sporco: chi è candidato, la stanza è
 * ancora viva, e la chiamata di riavvio.
 */

/** Solo sedute ancora in corso: a seduta chiusa non c'è nulla da riprendere. */
const LIVE_SESSION_STATUSES = ['active'] as const;

/**
 * Le tracce ferme che varrebbe la pena riprendere.
 *
 * Separata dal resto perché è l'unico pezzo che parla SQL: si può interrogare
 * da sola, in sola lettura, per vedere cosa il worker troverebbe senza far
 * partire nessuna registrazione.
 */
export async function findResumeCandidates(limit: number) {
  /*
   * Candidati: una traccia fallita, in una seduta ancora attiva, per un ruolo
   * che in questo momento non sta registrando.
   *
   * L'ultima condizione è quella che conta: se il ruolo ha già una
   * registrazione in corso, il fallimento di prima è stato superato e
   * riprovare aprirebbe un doppione sopra l'audio buono.
   */
  const candidates = await db
    .select({
      sessionId: sessionAudioRecordings.sessionAiNotesId,
      role: sessionAudioRecordings.participantRole,
      identity: sessionAudioRecordings.livekitParticipantIdentity,
      trackSid: sessionAudioRecordings.livekitTrackSid,
      roomName: sessionAudioRecordings.livekitRoomName,
      failedAttempts: sql<number>`count(*)::int`,
      lastFailureAt: sql<Date>`max(${sessionAudioRecordings.endedAt})`,
    })
    .from(sessionAudioRecordings)
    .innerJoin(
      sessionAiNotes,
      eq(sessionAiNotes.id, sessionAudioRecordings.sessionAiNotesId)
    )
    .where(
      and(
        eq(sessionAudioRecordings.status, 'failed'),
        inArray(sessionAiNotes.status, [...LIVE_SESSION_STATUSES]),
        sql`not exists (
          select 1 from ${sessionAudioRecordings} busy
          where busy.session_ai_notes_id = ${sessionAudioRecordings.sessionAiNotesId}
            and busy.participant_role = ${sessionAudioRecordings.participantRole}
            and busy.status in ('pending','starting','recording','stopping','recorded')
        )`
      )
    )
    .groupBy(
      sessionAudioRecordings.sessionAiNotesId,
      sessionAudioRecordings.participantRole,
      sessionAudioRecordings.livekitParticipantIdentity,
      sessionAudioRecordings.livekitTrackSid,
      sessionAudioRecordings.livekitRoomName
    )
    .limit(limit);

  return candidates;
}

export async function resumeInterruptedRecordings(
  params: { limit: number; now?: Date },
  dependencies: { liveKit: LiveKitSessionControl }
): Promise<{ retried: number; skipped: number }> {
  const now = params.now ?? new Date();
  const candidates = await findResumeCandidates(params.limit);

  let retried = 0;
  let skipped = 0;

  for (const candidate of candidates) {
    try {
      // La traccia c'è ancora? Se il partecipante ha chiuso o ha tolto il
      // microfono non si riprova: produrrebbe lo stesso fallimento e una riga
      // di registro che non racconta niente.
      let trackStillLive = false;
      try {
        const participants = await dependencies.liveKit.listParticipants(
          candidate.roomName
        );
        trackStillLive = participants.some(
          (participant) =>
            participant.identity === candidate.identity &&
            participant.tracks.some(
              (track) =>
                track.sid === candidate.trackSid && track.type === 'audio'
            )
        );
      } catch {
        // Stanza non raggiungibile: non è una prova che la traccia sia morta,
        // ma non è nemmeno il momento di riprovare.
        trackStillLive = false;
      }

      const decision = decideRecordingRetry({
        failedAttempts: candidate.failedAttempts,
        lastFailureAt: candidate.lastFailureAt ?? now,
        now,
        trackStillLive,
      });

      if (!decision.retry) {
        skipped += 1;
        logPipeline({
          phase: 'recording_resume',
          outcome: 'skipped',
          sessionId: candidate.sessionId,
          detail: { motivo: decision.reason, ruolo: candidate.role },
        });
        continue;
      }

      await startAiNotesRecordingSystem(
        { sessionId: candidate.sessionId },
        dependencies.liveKit
      );
      retried += 1;
      logPipeline({
        phase: 'recording_resume',
        outcome: 'ok',
        sessionId: candidate.sessionId,
        detail: { tentativo: decision.attempt, ruolo: candidate.role },
      });
    } catch (error) {
      // Una seduta che non riparte non deve impedire alle altre di ripartire:
      // è esattamente l'errore che ha tenuto ferma la coda dei riepiloghi.
      skipped += 1;
      logPipeline({
        phase: 'recording_resume',
        outcome: 'failed',
        sessionId: candidate.sessionId,
        detail: {
          ruolo: candidate.role,
          errore: error instanceof Error ? error.message.slice(0, 120) : 'sconosciuto',
        },
      });
    }
  }

  return { retried, skipped };
}
