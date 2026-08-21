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
import { getSessionRecordingCoverage } from '@/lib/core/ai-session-notes/recording';
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
/**
 * Cosa fare la prossima volta: e' il motivo per cui questa scheda si apre dal
 * telefono, e sta in poche righe. Oltre le tre, si smette di leggerle.
 */
const MAX_PREP = 3;

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
    return Response.json({
      ...detail,
      aiNotesSessionId: null,
      notes: null,
      report: null,
    });
  }

  const coverage = await getSessionRecordingCoverage(notes.id);

  let report = null;
  try {
    const compass = await getSessionCompass(
      { sessionId: notes.id, actorUserId: user.id },
      sessionCompassDependencies()
    );
    const document = compass?.document ?? null;
    const tracked = compass?.trackedCommitments ?? [];
    if (!document) {
      console.error('[mobile/sessions] nessun documento nel compass', {
        bookingId: id,
        aiNotesSessionId: notes.id,
        aiNotesStatus: notes.status,
        compassStatus: compass?.status ?? null,
      });
    }
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
        /*
         * Su cosa è costruito questo riepilogo.
         *
         * «L'atleta ha parlato per l'83% del tempo» è un dato esatto e falso
         * quando per quarantotto minuti l'altra voce non è stata registrata —
         * ed è successo, nella seduta 181. Il web lo dichiara; il telefono no,
         * e mostrava proprio quella percentuale senza il suo avvertimento.
         */
        coverageNotice: coverage.hasGap ? coverage.notice : null,
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
         * Le stime sulla seduta: energia, motivazione, concentrazione e le
         * altre, su scala 1-5.
         *
         * Non sono misure cliniche e il livello di confidenza viaggia con
         * loro: una stima incerta letta come un dato certo e' peggio che non
         * averla, e sul telefono manca il contesto che sul web la circonda.
         */
        metrics: (overview.metrics ?? []).map((metric) => ({
          key: metric.key,
          value: metric.value,
          confidence: metric.confidence,
        })),
        /*
         * Come ha parlato l'atleta: un'etichetta linguistica, non un giudizio
         * sulla persona ne' una lettura della voce.
         */
        tone: overview.conversationTone
          ? {
              key: overview.conversationTone.key,
              description: overview.conversationTone.description,
              confidence: overview.conversationTone.confidence,
            }
          : null,
        /*
         * I momenti che il riepilogo ha marcato: sono la cosa piu` vicina a
         * «cosa e` successo davvero», e stanno in poche righe.
         */
        keyMoments: document.keyMoments.slice(0, MAX_MOMENTS).map((moment) => ({
          title: moment.title,
          explanation: moment.explanation,
          speaker: moment.speaker,
          /*
           * Il momento senza la sua frase e` un'affermazione da credere sulla
           * parola. Ogni insight del Compass nasce ancorato a un segmento di
           * trascrizione: il minuto e la citazione sono l'ancora, e sono
           * l'unica parte che si legge in tre secondi.
           */
          minute: moment.evidence?.minute ?? null,
          quote: moment.evidence?.quote ?? null,
        })),
        /*
         * Cosa preparare per la prossima seduta.
         *
         * E` la sezione piu` vicina al momento in cui questa scheda si apre —
         * i due minuti prima della sessione successiva — e mancava del tutto:
         * il report la conteneva e l'app la buttava via.
         */
        // `?? []` non e' pignoleria: i report gia' salvati sono JSON, e uno
        // scritto prima che questo campo esistesse non lo ha.
        prep: (document.nextSessionPrep ?? [])
          .slice(0, MAX_PREP)
          .map((item) => item.text),
        /*
         * Le domande rimaste in sospeso.
         *
         * Del passaggio mancato tengo solo `followUp`, cioe` la domanda da
         * rifare: il resto e` un giudizio sul lavoro del coach, e il corridoio
         * prima di una seduta non e` il posto per leggerlo.
         */
        followUps: (document.missedOpportunities ?? [])
          .slice(0, MAX_PREP)
          .map((missed) => missed.followUp),
        /*
         * Il filo che lega questa seduta alle precedenti: una riga sola del
         * racconto, l'unica che si legge stando in piedi. Il racconto per
         * esteso resta sul web.
         */
        throughLine: document.story?.throughLine ?? null,
        /*
         * La leva emersa: una riga, e a differenza dei temi dice qualcosa che
         * si puo` usare la volta dopo invece di qualcosa da sapere.
         */
        emergingResource: overview.emergingResource?.text ?? null,
        /*
         * Cio` che il coach ha scritto di suo pugno.
         *
         * L'AI non lo produce e non lo sovrascrive mai: e` la sola parte del
         * riepilogo di cui il coach e` l'autore, ed e` quella che rileggerebbe
         * per prima. Restava sul web per una dimenticanza, non per una scelta.
         */
        coachNote: document.coachNote ?? null,
        /*
         * L'unica parte operativa: cosa era stato deciso di fare.
         *
         * Quando il report e` approvato gli impegni vivono per conto loro, con
         * uno stato che si puo` cambiare: allora si mandano quelli, con il loro
         * identificativo, ed e` cio' che rende il segno di spunta possibile. In
         * bozza esistono solo dentro il documento e restano da leggere.
         */
        commitments:
          tracked.length > 0
            ? tracked.map((commitment) => ({
                trackedId: commitment.id,
                text: commitment.title,
                owner: commitment.owner,
                status: commitment.status,
                dueDate: commitment.dueDate,
              }))
            : document.commitments.map((commitment) => ({
                trackedId: null,
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
  } catch (error) {
    // Il riepilogo e` un di piu`: se non si riesce a leggerlo, la scheda della
    // seduta resta utile. Meglio senza che una schermata che non si apre.
    //
    // Ma silenzio non vuol dire assenza: senza questa riga, un riepilogo che
    // esiste e non si riesce a leggere diventava «per questa sessione non c'e'
    // un riepilogo», e nessun log diceva altrimenti.
    console.error('[mobile/sessions] compass non leggibile', {
      bookingId: id,
      aiNotesSessionId: notes.id,
      aiNotesStatus: notes.status,
      error,
    });
    report = null;
  }

  /*
   * L'identificativo degli appunti, non solo della prenotazione.
   *
   * Serve all'app per parlare con la rotta degli impegni, che e` quella del
   * web: senza, l'unica via sarebbe stata una rotta mobile gemella con dentro
   * la stessa regola scritta due volte.
   */
  return Response.json({
    ...detail,
    aiNotesSessionId: notes.id,
    notes: notes.status,
    report,
  });
}
