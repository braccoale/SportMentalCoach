import { and, desc, eq, or } from 'drizzle-orm';
import { getApiUser } from '@/lib/auth/api-user';
import { db } from '@/lib/db/drizzle';
import {
  bookings,
  profiles,
  providerProfiles,
  services,
  users,
  sessionAiNotes,
} from '@/lib/db/schema';
import { canShowAiSessionReport } from '@/lib/core/ai-session-notes/report-visibility';
import { getSessionCompass } from '@/lib/core/ai-session-notes/session-compass';
import { sessionCompassDependencies } from '@/lib/core/ai-session-notes/session-compass-runtime';

/**
 * Una seduta passata, come serve su un telefono.
 *
 * Non e' il Session Compass in miniatura. Sul telefono quella schermata si
 * apre in un momento solo e molto preciso — i due minuti prima della sessione
 * successiva, spesso in piedi — e la domanda e' una: «cosa ci siamo detti
 * l'ultima volta, e cosa gli avevo lasciato da fare?».
 *
 * Quindi tre cose: la sintesi, i temi emersi, e gli impegni presi. Trascrizione,
 * mappa della conversazione, grafici, confronto fra sedute e validazione
 * restano sul web, dove si leggono da fermi. Approvare un report clinico
 * scorrendo un telefono e' un modo di approvarlo senza leggerlo.
 */
const MAX_THEMES = 3;
const MAX_MOMENTS = 4;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ bookingId: string }> }
) {
  const user = await getApiUser(request);
  if (!user) {
    return Response.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const { bookingId } = await params;
  const id = Number(bookingId);
  if (!Number.isInteger(id)) {
    return Response.json({ error: 'invalid_booking' }, { status: 400 });
  }

  const [row] = await db
    .select({
      id: bookings.id,
      status: bookings.status,
      scheduledFor: bookings.scheduledFor,
      durationMin: bookings.durationMin,
      serviceTitle: services.title,
      serviceDurationMin: services.durationMin,
      sessionStartedAt: bookings.sessionStartedAt,
      sessionEndedAt: bookings.sessionEndedAt,
      clientId: bookings.clientId,
      coachUserId: providerProfiles.userId,
      coachName: profiles.displayName,
      coachAvatar: profiles.avatarUrl,
      clientName: users.name,
      clientLastName: users.lastName,
      clientEmail: users.email,
    })
    .from(bookings)
    .innerJoin(providerProfiles, eq(bookings.providerId, providerProfiles.id))
    .innerJoin(users, eq(bookings.clientId, users.id))
    .leftJoin(profiles, eq(profiles.userId, providerProfiles.userId))
    .leftJoin(services, eq(bookings.serviceId, services.id))
    .where(
      and(
        eq(bookings.id, id),
        // Solo chi partecipa alla seduta. Il controllo sta qui e non nel
        // client: un identificativo scritto a mano non deve bastare a leggere
        // il resoconto di una conversazione altrui.
        or(eq(bookings.clientId, user.id), eq(providerProfiles.userId, user.id))
      )
    )
    .limit(1);

  if (!row) {
    return Response.json({ error: 'not_found' }, { status: 404 });
  }

  const viewerIsCoach = row.coachUserId === user.id;
  const clientName =
    [row.clientName, row.clientLastName].filter(Boolean).join(' ').trim() ||
    row.clientEmail;

  const detail = {
    bookingId: row.id,
    status: row.status,
    scheduledFor: row.scheduledFor?.toISOString() ?? null,
    title: row.serviceTitle ?? 'Sessione di mental coaching',
    viewerIsCoach,
    otherName: viewerIsCoach ? clientName : row.coachName ?? 'Coach',
    otherAvatarUrl: viewerIsCoach ? null : row.coachAvatar,
    actualMinutes:
      row.sessionStartedAt && row.sessionEndedAt
        ? Math.max(
            1,
            Math.round(
              (row.sessionEndedAt.getTime() - row.sessionStartedAt.getTime()) /
                60_000
            )
          )
        : null,
  };

  const [notes] = await db
    .select({ id: sessionAiNotes.id, status: sessionAiNotes.status })
    .from(sessionAiNotes)
    .where(eq(sessionAiNotes.bookingId, id))
    .orderBy(desc(sessionAiNotes.createdDate))
    .limit(1);

  /*
   * Il riepilogo lo vede solo il coach.
   *
   * E` la stessa regola del web (`canShowAiSessionReport`), applicata qui e non
   * dedotta: un resoconto interpretativo di una seduta non e` materiale che
   * l'atleta debba leggere per conto suo.
   */
  const maySeeReport = canShowAiSessionReport({
    viewerRole: viewerIsCoach ? 'coach' : 'athlete',
    aiNotesEnabled: Boolean(notes),
    hasAiNotesSession: Boolean(notes),
  });

  if (!maySeeReport || !notes) {
    return Response.json({ ...detail, notes: null, report: null });
  }

  let report = null;
  try {
    const compass = await getSessionCompass(
      { sessionId: notes.id, actorUserId: user.id },
      sessionCompassDependencies()
    );
    const document = compass?.document ?? null;
    if (document) {
      const overview = document.sessionOverview;
      report = {
        // «Se leggi solo questo, hai fatto il tuo lavoro.»
        summary: overview.summary,
        themes: overview.themes.slice(0, MAX_THEMES).map((theme) => theme.text),
        /*
         * Chi ha parlato, e quanto.
         *
         * E` il dato che si legge in un'occhiata e che dice qualcosa di vero
         * sulla seduta: una in cui il coach ha parlato per due terzi del tempo
         * e` andata diversamente da una in cui l'atleta si e` preso lo spazio.
         * Non e` un giudizio — e` una misura, e serve al coach su di se`.
         */
        participation: overview.conversationParticipation
          ? {
              athleteSharePercent:
                overview.conversationParticipation.athleteSharePercent,
              athleteTurns: overview.conversationParticipation.athleteTurns,
              coachTurns: overview.conversationParticipation.coachTurns,
            }
          : null,
        /*
         * L'andamento emotivo lungo la seduta: dove si e` aperto un varco e
         * dove si e` chiuso. Su un telefono e` l'unica cosa che vale un
         * grafico, perche' e` una forma — si guarda, non si legge.
         */
        emotionalTrend: (overview.emotionalTrend ?? []).map((point) => ({
          value: point.value,
          label: point.label,
        })),
        /*
         * I momenti che il riepilogo ha marcato: sono la cosa piu` vicina a
         * «cosa e` successo davvero», e stanno in poche righe.
         */
        keyMoments: document.keyMoments.slice(0, MAX_MOMENTS).map((moment) => ({
          title: moment.title,
          explanation: moment.explanation,
          speaker: moment.speaker,
        })),
        // L'unica parte operativa: cosa era stato deciso di fare.
        commitments: document.commitments.map((commitment) => ({
          text: commitment.text,
          owner: commitment.owner,
          status: commitment.status,
          dueDate: commitment.dueDate,
        })),
        /*
         * Se non e` ancora validato va detto.
         *
         * Un testo generato letto come definitivo e` peggio che non averlo: e`
         * una bozza che il coach non ha ancora confermato, e sul telefono non
         * c'e` il contesto per accorgersene da soli.
         */
        approved: compass?.isApproved === true,
        stale: compass?.isStale === true,
      };
    }
  } catch {
    // Il riepilogo e` un di piu`: se non si riesce a leggerlo, la scheda della
    // seduta resta utile. Meglio senza che una schermata che non si apre.
    report = null;
  }

  return Response.json({ ...detail, notes: notes.status, report });
}
