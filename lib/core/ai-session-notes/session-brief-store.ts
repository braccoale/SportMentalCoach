import 'server-only';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { sessionAiReports } from '@/lib/db/schema';
import { listCoachBookmarks } from './coach-bookmarks-store';
import { listJourneyGoals } from './journey-goals-store';
import {
  MentalJourneyError,
  getMentalJourney,
  type MentalJourney,
} from './mental-journey';
import { mentalJourneyDependencies } from './mental-journey-store';
import { buildSessionBrief, type SessionBrief } from './session-brief';

/**
 * Carica gli ingressi della sintesi pre-seduta e li passa alla regola pura.
 *
 * **Perché è una funzione sola, sul server.** Web e app mostrano la stessa
 * sintesi: se la composizione vivesse nella pagina, l'app ne avrebbe una
 * seconda, e le due diverrebbero diverse senza che nessun errore lo dica —
 * è già successo in questo prodotto con gli orari prenotabili e con lo stato
 * delle richieste. Qui il client riceve un esito, non degli ingredienti.
 *
 * **Perché è solo per il coach.** Le tre sorgenti nuove sono materiale suo: i
 * segnalibri che ha messo dal vivo, la nota libera che l'AI non tocca, gli
 * obiettivi che ha concordato. `listCoachBookmarks` rifiuta già chi non è il
 * coach di quella seduta, e `getMentalJourney` fa la sua autorizzazione: qui
 * non si aggiunge un terzo cancello, si usano i due che esistono.
 */
export async function getSessionBrief(params: {
  athleteUserId: number;
  coachUserId: number;
  /**
   * Il percorso, quando chi chiama lo ha già caricato per altro — è il caso
   * della pagina della seduta, che lo usa anche per il riepilogo. Passarlo
   * evita di costruirlo due volte nella stessa richiesta; l'autorizzazione
   * l'ha già fatta chi l'ha caricato, con la stessa funzione.
   */
  journey?: MentalJourney | null;
}): Promise<SessionBrief | null> {
  let journey: MentalJourney;
  if (params.journey !== undefined) {
    if (params.journey === null) return null;
    journey = params.journey;
  } else {
    try {
      journey = await getMentalJourney(
        { athleteUserId: params.athleteUserId, actorUserId: params.coachUserId },
        mentalJourneyDependencies()
      );
    } catch (error) {
      // Un percorso che non si può costruire non è un guasto da mostrare: è un
      // coach che non ha ancora niente da riprendere. Stessa scelta già presa
      // dalla pagina della seduta e dalla rotta dell'app.
      if (error instanceof MentalJourneyError) return null;
      throw error;
    }
  }

  const latest = journey.timeline[0] ?? null;

  const [goals, bookmarks, coachNote] = await Promise.all([
    listJourneyGoals({
      coachUserId: params.coachUserId,
      athleteUserId: params.athleteUserId,
    }),
    latest ? listCoachBookmarks(latest.sessionId, params.coachUserId) : [],
    latest ? loadCoachNote(latest.sessionId) : null,
  ]);

  return buildSessionBrief({
    goals,
    pointsToRevisit: journey.pointsToRevisit,
    lastSession: latest
      ? {
          sessionId: latest.sessionId,
          bookingId: latest.bookingId,
          date: latest.sessionDate ? new Date(latest.sessionDate) : null,
          summary: latest.summary,
          coachNote,
        }
      : null,
    bookmarks,
    // Distingue i due vuoti: un percorso senza sedute con riepilogo non è un
    // percorso che non ha lasciato niente in sospeso, e al coach vanno dette
    // due frasi diverse.
    sessionCount: journey.timeline.length,
  });
}

/**
 * La nota libera del coach sull'ultima seduta.
 *
 * Sta nel documento, non in una colonna a sé, e la versione che conta è
 * quella che il coach ha modificato: `coach_edited_report_json` quando esiste,
 * altrimenti quella generata. **Mai `shared_report_json`** — quella è ciò che
 * ha deciso di far leggere all'atleta, ed è una domanda diversa.
 *
 * Deliberatamente non passa da `MentalJourneyEntry`: quella forma la riceve
 * anche l'atleta sul proprio percorso, e la nota del coach non è sua.
 */
async function loadCoachNote(sessionId: number): Promise<string | null> {
  const [row] = await db
    .select({
      generated: sessionAiReports.generatedReportJson,
      coachEdited: sessionAiReports.coachEditedReportJson,
    })
    .from(sessionAiReports)
    .where(and(eq(sessionAiReports.sessionAiNotesId, sessionId)))
    .orderBy(desc(sessionAiReports.reportVersion))
    .limit(1);

  if (!row) return null;
  const document = row.coachEdited ?? row.generated;
  const note = (document as { coachNote?: unknown } | null)?.coachNote;
  return typeof note === 'string' && note.trim() ? note : null;
}
