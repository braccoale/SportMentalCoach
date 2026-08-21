/**
 * Riapre una seduta finita in `report_failed` con la trascrizione intatta.
 *
 * Non è uno strumento di manutenzione ordinaria: è la correzione di uno stato
 * terminale sbagliato, e per questo chiede di essere invocata a mano, su una
 * sessione precisa, e lascia traccia nel registro come riapertura e non come
 * avanzamento automatico.
 *
 * Rifiuta tutto il resto di proposito. Una sessione senza segmenti non ha
 * niente da riprendere; una in `transcription_failed` non ha materiale; una
 * già viva non va toccata. In tutti questi casi non fa nulla e lo dice.
 *
 *   npm run ai-notes:reopen -- 72
 *   npm run ai-notes:reopen -- 72 --apply
 *
 * Senza `--apply` si limita a raccontare che cosa farebbe.
 */
import dotenv from 'dotenv';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { sessionAiNotes, sessionTranscriptSegments } from '@/lib/db/schema';
import { advanceAiNotesSessionStatus } from '@/lib/core/ai-session-notes/session-status';
import {
  enqueueNormalizationIfReady,
  requeueFailedReportJob,
} from '@/lib/core/ai-session-notes/processing';

dotenv.config({ path: '.env.local', override: true });
dotenv.config();

async function main() {
  const sessionId = Number(process.argv[2]);
  const apply = process.argv.includes('--apply');
  if (!Number.isInteger(sessionId) || sessionId <= 0) {
    console.error('Uso: reopen-ai-notes-session.ts <sessionId> [--apply]');
    process.exitCode = 1;
    return;
  }

  const [session] = await db
    .select({
      id: sessionAiNotes.id,
      bookingId: sessionAiNotes.bookingId,
      status: sessionAiNotes.status,
      errorCode: sessionAiNotes.errorCode,
      requestedBy: sessionAiNotes.requestedBy,
    })
    .from(sessionAiNotes)
    .where(eq(sessionAiNotes.id, sessionId))
    .limit(1);

  if (!session) {
    console.error(`Sessione ${sessionId} inesistente.`);
    process.exitCode = 1;
    return;
  }
  /*
   * `processing` e' ammesso oltre a `report_failed`, ed e' il caso di una
   * sessione riaperta da una versione precedente di questo script: tornava
   * viva ma senza risvegliare il job del riepilogo, e restava ferma li'.
   * Rilanciarlo deve poterla sbloccare invece di rifiutarsi.
   */
  const riapribile =
    session.status === 'report_failed' || session.status === 'processing';
  if (!riapribile) {
    console.error(
      `Sessione ${sessionId} in stato ${session.status}: si riapre solo report_failed.`
    );
    process.exitCode = 1;
    return;
  }

  const [{ segmenti }] = (await db
    .select({ segmenti: sql<number>`count(*)::int` })
    .from(sessionTranscriptSegments)
    .where(eq(sessionTranscriptSegments.sessionAiNotesId, sessionId))) as [
    { segmenti: number },
  ];

  if (!segmenti) {
    console.error(
      `Sessione ${sessionId} senza segmenti di trascrizione: non c'è nulla da riprendere.`
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    JSON.stringify({
      sessione: sessionId,
      prenotazione: session.bookingId,
      stato: session.status,
      motivo: session.errorCode,
      segmenti,
      apply,
    })
  );

  if (!apply) {
    console.log('Prova a vuoto: rilanciare con --apply per riaprire davvero.');
    return;
  }

  const riaperta =
    session.status === 'processing'
      ? true
      : await advanceAiNotesSessionStatus({
          sessionId,
          nextStatus: 'processing',
          actorUserId: session.requestedBy,
          auditMetadata: {
            automatic: false,
            reopened: true,
            reason:
              'recupero manuale: trascrizione presente, riepilogo mai generato',
          },
        });
  if (!riaperta) {
    console.error('Riapertura rifiutata dalla macchina a stati.');
    process.exitCode = 1;
    return;
  }

  /*
   * Dipendenze minime, non quelle di produzione.
   *
   * `enqueueNormalizationIfReady` legge il database e l'orologio, e nient'
   * altro. La fabbrica di produzione costruisce invece anche la
   * configurazione dell'audio: fuori da Vercel le chiavi S3 non ci sono, e la
   * riapertura moriva a metà — sessione gia' tornata in `processing`, lavoro
   * mai accodato. Che e' il modo piu' rapido per lasciare una sessione in
   * balia della scadenza.
   */
  const accodata = await enqueueNormalizationIfReady(sessionId, {
    db,
    clock: { now: () => new Date() },
  } as unknown as Parameters<typeof enqueueNormalizationIfReady>[1]);

  /*
   * Il pezzo che mancava. Quando la normalizzazione e' gia' fatta — cioe'
   * ogni volta che la sessione e' morta *dopo* la trascrizione, che e' il caso
   * per cui questo script esiste — non c'era nulla da accodare e la sessione
   * restava viva e ferma. Il riepilogo si risveglia dal job che c'e' gia':
   * un secondo job con la stessa chiave di idempotenza non puo' esistere.
   */
  const riepilogo = accodata
    ? null
    : await requeueFailedReportJob({
        sessionId,
        actorUserId: session.requestedBy,
      });

  console.log(
    JSON.stringify({
      riaperta,
      normalizzazioneAccodata: accodata,
      riepilogoRimessoInCoda: riepilogo,
    })
  );
  if (!accodata && riepilogo === null) {
    console.error(
      'Nessun lavoro accodato: il worker la rivaluterà, ma vale la pena guardare perché.'
    );
  }
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
