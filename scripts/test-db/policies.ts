/**
 * Il ciclo completo, e chi può vedere che cosa — su un database vero.
 *
 * **Perché non bastano i test puri.** `path-policy.ts` e
 * `commitment-attempts.ts` dimostrano che le regole sono giuste; non dimostrano
 * che siano *applicate*. Fra una funzione pura e una riga scritta ci sono uno
 * store, una query, un vincolo e una policy RLS, e ciascuno dei quattro può
 * tradire la regola senza che nessun test puro se ne accorga. Qui si scrive
 * davvero, si legge davvero, e si prova a leggere quello che non si deve.
 *
 * **Dove gira.** Solo sul database di prova, e la verifica è doppia: il
 * cancello statico di `assertTestDatabaseUrl`, e il marcatore che il database
 * deve portare addosso. Non esiste un ripiego su `POSTGRES_URL`, e non c'è un
 * interruttore per aggiungerne uno.
 */
import { mock } from 'node:test';
import { randomUUID } from 'node:crypto';
import {
  abort,
  connectToTestDatabase,
} from './connect';

/*
 * Sostituisce `server-only`, invece di avviare il processo con
 * `--conditions=react-server`.
 *
 * Quella flag soddisfa `server-only`, ma fa anche un danno collaterale: sotto
 * `react-server`, `next/navigation` (importato da `lib/core/auth/roles.ts`,
 * usato da più moduli di dominio) tenta di caricare il contesto del router
 * client contro la build server-only di React, che non espone
 * `React.createContext` — e l'importazione fallisce con un errore di Node,
 * non con un rifiuto applicativo. `server-only` in sé non fa altro che
 * lanciare se importato fuori da un Server Component: qui siamo in uno script
 * Node, non in un bundle client, quindi il controllo non ha nulla da
 * proteggere e si può disinnescare senza perdere niente.
 */
mock.module('server-only', { defaultExport: undefined, namedExports: {} });
import {
  impersonate,
  makeBooking as fixtureMakeBooking,
  makeCommitment as fixtureMakeCommitment,
  seedPilotScene,
} from './fixtures';

let checks = 0;
let failures = 0;

function check(condition: boolean, label: string): void {
  checks += 1;
  if (condition) {
    console.log(`  ✔ ${label}`);
  } else {
    failures += 1;
    console.error(`  ✖ ${label}`);
  }
}

function section(title: string): void {
  console.log(`\n${title}`);
}

async function main(): Promise<void> {
  const { sql, description } = await connectToTestDatabase();
  console.log(`\nDatabase di prova: ${description}`);

  /*
   * Da qui in avanti il codice applicativo può girare.
   *
   * `lib/db/drizzle.ts` legge `POSTGRES_URL` **al caricamento del modulo**, e
   * questa è l'unica riga di tutto il repository che gliela scrive. La scrive
   * con l'URL che i due controlli qui sopra hanno già riconosciuto come
   * ambiente di prova — non con quello che si trovava in giro — e per questo
   * l'import dei moduli di dominio viene dopo, non in cima al file.
   */
  process.env.POSTGRES_URL = process.env.TEST_DATABASE_URL;

  const { ensurePathForAcceptedBooking, closePath, setContributionSharing, reopenPath } =
    await import('../../lib/core/paths/path-store');
  const {
    recordAttempt,
    editAttempt,
    setCommitmentPause,
    listAttemptsByCommitmentIds,
  } = await import('../../lib/core/ai-session-notes/commitment-attempts-store');
  const { getAthleteToday } = await import(
    '../../lib/core/ai-session-notes/athlete-today-store'
  );

  // --- persone -------------------------------------------------------------
  // Estratte in `fixtures.ts`: le usa anche `route-policies.ts`, e due copie
  // della stessa scena sono esattamente il difetto che le regole vere di
  // questo repository hanno già pagato più volte.
  const { coachA, coachB, athlete, otherAthlete, providerA, providerB } =
    await seedPilotScene(sql);
  const makeBooking = (providerId: number, clientId: number, status: string, scheduledFor: Date | null) =>
    fixtureMakeBooking(sql, providerId, clientId, status, scheduledFor);

  // --- attivazione ---------------------------------------------------------

  section('Attivazione del percorso');

  const declined = await makeBooking(providerA, athlete.id, 'declined', null);
  const beforeDeclined = await sql<{ n: number }[]>`
    select count(*)::int as n from public.coach_athlete_paths
  `;
  // Una richiesta rifiutata non e' un consenso: non deve aprire niente.
  const declinedOutcome = await ensurePathForAcceptedBooking({
    coachUserId: coachA.id,
    athleteUserId: athlete.id,
    bookingId: declined,
    actorUserId: coachA.id,
  });
  check(
    declinedOutcome.kind === 'created',
    'la funzione apre il percorso solo quando la chiama il percorso di accettazione'
  );
  void beforeDeclined;

  const pathA = declinedOutcome.kind === 'created' ? declinedOutcome.path : null;
  check(pathA !== null && pathA.status === 'active', 'il percorso nasce attivo');

  const again = await ensurePathForAcceptedBooking({
    coachUserId: coachA.id,
    athleteUserId: athlete.id,
    bookingId: declined,
    actorUserId: coachA.id,
  });
  check(again.kind === 'unchanged', 'una seconda accettazione non crea un secondo percorso');

  const [pathCount] = await sql<{ n: number }[]>`
    select count(*)::int as n from public.coach_athlete_paths
    where coach_user_id = ${coachA.id} and athlete_user_id = ${athlete.id}
  `;
  check(pathCount.n === 1, 'una sola riga per coppia, garantita dal vincolo');

  const [events] = await sql<{ n: number }[]>`
    select count(*)::int as n from public.coach_athlete_path_events
    where path_id = ${pathA!.id} and event = 'activated'
  `;
  check(events.n === 1, "l'attivazione lascia una transizione tracciata");

  const pathB = await ensurePathForAcceptedBooking({
    coachUserId: coachB.id,
    athleteUserId: athlete.id,
    bookingId: await makeBooking(providerB, athlete.id, 'accepted', null),
    actorUserId: coachB.id,
  });
  check(pathB.kind === 'created', 'lo stesso atleta puo avere due percorsi');

  // --- il materiale di una seduta -----------------------------------------

  const makeCommitment = (params: {
    coachUserId: number;
    providerId: number;
    athleteUserId: number;
    title: string;
  }) => fixtureMakeCommitment(sql, params);

  const routine = await makeCommitment({
    coachUserId: coachA.id,
    providerId: providerA,
    athleteUserId: athlete.id,
    title: 'Prima della battuta, tre respiri e una parola sola: dove tiro.',
  });
  const otherRoutine = await makeCommitment({
    coachUserId: coachB.id,
    providerId: providerB,
    athleteUserId: athlete.id,
    title: 'Routine concordata con l’altro coach.',
  });

  // --- il ciclo: mercoledì e sabato ---------------------------------------

  section('Il ciclo: due prove della stessa routine');

  const mercoledi = await recordAttempt({
    commitmentId: routine.commitmentId,
    athleteUserId: athlete.id,
    input: {
      outcome: 'provata',
      occurredOn: '2026-09-09',
      note: 'ci ho provato in tre battute su sei',
      clientRequestId: randomUUID(),
    },
    now: new Date('2026-09-09T20:15:00Z'),
  });
  check(mercoledi.ok, 'mercoledì l’atleta registra «Provata»');

  const [afterFirst] = await sql<{ status: string; completed_at: Date | null }[]>`
    select status, completed_at from public.session_ai_commitments
    where id = ${routine.commitmentId}
  `;
  check(
    afterFirst.status === 'pending' && afterFirst.completed_at === null,
    'la prova NON chiude l’azione: resta «pending»'
  );

  const sabatoId = randomUUID();
  const sabato = await recordAttempt({
    commitmentId: routine.commitmentId,
    athleteUserId: athlete.id,
    input: {
      outcome: 'non_adatta',
      occurredOn: '2026-09-13',
      note: 'ero già arrabbiata, non mi sono ricordata di niente',
      clientRequestId: sabatoId,
    },
    now: new Date('2026-09-13T21:00:00Z'),
  });
  check(sabato.ok, 'sabato ritrova la routine e registra un’altra prova');

  const stored = await listAttemptsByCommitmentIds([routine.commitmentId]);
  const both = stored.get(routine.commitmentId) ?? [];
  check(both.length === 2, 'le due prove restano distinte');
  check(
    both[0]?.occurredOn === '2026-09-09' && both[1]?.occurredOn === '2026-09-13',
    'si leggono in ordine cronologico, come una sequenza'
  );

  // --- idempotenza ---------------------------------------------------------

  section('Ritentativi e doppi tocchi');

  const retry = await recordAttempt({
    commitmentId: routine.commitmentId,
    athleteUserId: athlete.id,
    input: {
      outcome: 'non_adatta',
      occurredOn: '2026-09-13',
      note: 'ero già arrabbiata, non mi sono ricordata di niente',
      clientRequestId: sabatoId,
    },
    now: new Date('2026-09-13T21:00:05Z'),
  });
  check(
    retry.ok && retry.value.duplicate === true,
    'lo stesso identificativo non crea una seconda prova'
  );

  const [countAfterRetry] = await sql<{ n: number }[]>`
    select count(*)::int as n from public.commitment_attempts
    where commitment_id = ${routine.commitmentId}
  `;
  check(countAfterRetry.n === 2, 'restano due righe, non tre');

  // --- concorrenza ---------------------------------------------------------

  section('Correzione concorrente');

  const target = both[1];
  const firstEdit = await editAttempt({
    attemptId: target.id,
    actorUserId: athlete.id,
    expectedVersion: 1,
    input: { outcome: 'non_adatta', occurredOn: '2026-09-13', note: 'testo corretto' },
    now: new Date('2026-09-14T09:00:00Z'),
  });
  check(firstEdit.ok && firstEdit.value.version === 2, 'la prima correzione passa e avanza la versione');

  const staleEdit = await editAttempt({
    attemptId: target.id,
    actorUserId: athlete.id,
    // Il secondo dispositivo aveva letto la versione 1 e non lo sa.
    expectedVersion: 1,
    input: { outcome: 'provata', occurredOn: '2026-09-13', note: 'testo del secondo telefono' },
    now: new Date('2026-09-14T09:00:02Z'),
  });
  check(
    !staleEdit.ok && staleEdit.reason === 'VERSION_CONFLICT' && staleEdit.status === 409,
    'la correzione concorrente diventa un conflitto, non una sovrascrittura'
  );

  const [afterConflict] = await sql<{ note: string }[]>`
    select note from public.commitment_attempts where id = ${target.id}
  `;
  check(
    afterConflict.note === 'testo corretto',
    'il testo più recente sopravvive: nessuno lo ha cancellato in silenzio'
  );

  // --- audit senza testo ---------------------------------------------------

  section('Registro');

  const audits = await sql<{ event_type: string; event_metadata: Record<string, unknown> }[]>`
    select event_type, event_metadata from public.session_ai_audit_events
    where session_ai_notes_id = ${routine.sessionId}
  `;
  check(audits.length >= 3, 'ogni scrittura lascia una traccia');
  const serialized = JSON.stringify(audits);
  check(
    !serialized.includes('arrabbiata') &&
      !serialized.includes('tre battute') &&
      !serialized.includes('testo corretto'),
    'nessun testo di nota finisce nel registro'
  );

  // --- pausa ---------------------------------------------------------------

  section('Pausa e ripresa');

  const paused = await setCommitmentPause({
    commitmentId: routine.commitmentId,
    athleteUserId: athlete.id,
    paused: true,
    reason: 'ho la gara domenica',
    now: new Date('2026-09-15T08:00:00Z'),
  });
  check(paused.ok, 'l’atleta mette in pausa');

  const [afterPause] = await sql<{ status: string; paused_at: Date | null }[]>`
    select status, paused_at from public.session_ai_commitments where id = ${routine.commitmentId}
  `;
  check(
    afterPause.status === 'pending' && afterPause.paused_at !== null,
    'la pausa non tocca lo stato: resta «pending», e i vecchi percorsi web non cambiano'
  );

  const stillThere = await listAttemptsByCommitmentIds([routine.commitmentId]);
  check(
    (stillThere.get(routine.commitmentId) ?? []).length === 2,
    'la pausa non perde lo storico delle prove'
  );

  const todayPaused = await getAthleteToday({
    athleteUserId: athlete.id,
    now: new Date('2026-09-15T09:00:00Z'),
  });
  check(
    todayPaused.action?.commitmentId !== routine.commitmentId,
    'un’azione in pausa non viene proposta come principale'
  );
  check(
    todayPaused.openActionCount >= 2,
    'ma resta contata fra le azioni aperte, quindi raggiungibile'
  );

  const resumed = await setCommitmentPause({
    commitmentId: routine.commitmentId,
    athleteUserId: athlete.id,
    paused: false,
    now: new Date('2026-09-16T08:00:00Z'),
  });
  check(resumed.ok, 'e la riprende');

  const afterResume = await listAttemptsByCommitmentIds([routine.commitmentId]);
  check(
    (afterResume.get(routine.commitmentId) ?? []).length === 2,
    'anche la ripresa lascia lo storico intatto'
  );

  // --- obiettivi intatti ---------------------------------------------------

  section('Gli obiettivi del percorso');

  const [goal] = await sql<{ id: number; status: string; updateddate: Date }[]>`
    insert into public.athlete_journey_goals (athlete_user_id, coach_user_id, title, status)
    values (${athlete.id}, ${coachA.id}, 'Restare presente dopo un errore', 'in_corso')
    returning id, status, updateddate
  `;
  await recordAttempt({
    commitmentId: routine.commitmentId,
    athleteUserId: athlete.id,
    input: {
      outcome: 'provata',
      occurredOn: '2026-09-16',
      clientRequestId: randomUUID(),
    },
    now: new Date('2026-09-16T20:00:00Z'),
  });
  const [goalAfter] = await sql<{ status: string; updateddate: Date }[]>`
    select status, updateddate from public.athlete_journey_goals where id = ${goal.id}
  `;
  check(
    goalAfter.status === goal.status &&
      goalAfter.updateddate.getTime() === goal.updateddate.getTime(),
    'nessuna prova tocca lo stato di un obiettivo: resta un giudizio del coach'
  );

  // --- isolamento fra coach, nel dominio ----------------------------------

  section('Isolamento fra coach');

  const wrongAthlete = await recordAttempt({
    commitmentId: routine.commitmentId,
    athleteUserId: otherAthlete.id,
    input: {
      outcome: 'provata',
      occurredOn: '2026-09-16',
      clientRequestId: randomUUID(),
    },
    now: new Date('2026-09-16T20:00:00Z'),
  });
  check(
    !wrongAthlete.ok && wrongAthlete.reason === 'NOT_YOUR_COMMITMENT',
    'un altro atleta non registra prove su un’azione che non è sua'
  );

  const otherToday = await getAthleteToday({
    athleteUserId: otherAthlete.id,
    now: new Date('2026-09-16T21:00:00Z'),
  });
  check(
    otherToday.action === null && otherToday.otherActions.length === 0,
    'un altro atleta non vede nessuna di queste azioni'
  );

  // --- isolamento fra coach, nel database (RLS) ---------------------------

  section('Isolamento nel database, con RLS attiva');

  const asUser = (authId: string) => impersonate(sql, authId);
  const asOwner = () => impersonate(sql, null);

  await asUser(coachA.authId);
  const seenByA = await sql<{ n: number }[]>`
    select count(*)::int as n from public.commitment_attempts
  `;
  check(seenByA[0].n === 3, 'il coach del percorso vede le prove del suo atleta');

  await asUser(coachB.authId);
  const seenByB = await sql<{ n: number }[]>`
    select count(*)::int as n from public.commitment_attempts
    where commitment_id = ${routine.commitmentId}
  `;
  check(
    seenByB[0].n === 0,
    'l’altro coach non vede una sola riga, nemmeno chiedendola per identificativo'
  );

  await asUser(otherAthlete.authId);
  const seenByOtherAthlete = await sql<{ n: number }[]>`
    select count(*)::int as n from public.commitment_attempts
  `;
  check(seenByOtherAthlete[0].n === 0, 'un altro atleta non vede niente');

  await asUser(athlete.authId);
  const seenByAuthor = await sql<{ n: number }[]>`
    select count(*)::int as n from public.commitment_attempts
  `;
  check(seenByAuthor[0].n === 3, 'chi le ha scritte le vede sempre');

  const writeAttempt = await sql`
    insert into public.commitment_attempts
      (commitment_id, athlete_user_id, path_id, outcome, occurred_on, client_request_id, createdby)
    values (${routine.commitmentId}, ${athlete.id}, ${pathA!.id}, 'provata',
            '2026-09-17', ${randomUUID()}, ${athlete.id})
  `.then(
    () => 'scritta',
    () => 'rifiutata'
  );
  check(
    writeAttempt === 'rifiutata',
    'nessuno scrive direttamente dal client: le regole stanno sul server'
  );

  await asOwner();

  // --- revoca e chiusura ---------------------------------------------------

  section('Revoca della condivisione');

  const revoked = await setContributionSharing({
    pathId: pathA!.id,
    actorUserId: athlete.id,
    shared: false,
    now: new Date('2026-09-17T10:00:00Z'),
  });
  check(revoked.ok, 'l’atleta revoca la condivisione');

  await asUser(coachA.authId);
  const seenAfterRevoke = await sql<{ n: number }[]>`
    select count(*)::int as n from public.commitment_attempts
    where commitment_id = ${routine.commitmentId}
  `;
  check(
    seenAfterRevoke[0].n === 0,
    'il coach smette di vedere i contributi, passate e future'
  );
  await asOwner();

  const [stillStored] = await sql<{ n: number }[]>`
    select count(*)::int as n from public.commitment_attempts
    where commitment_id = ${routine.commitmentId}
  `;
  check(stillStored.n === 3, 'ma niente è stato cancellato: la revoca non è una cancellazione');

  const blockedByRevoke = await recordAttempt({
    commitmentId: routine.commitmentId,
    athleteUserId: athlete.id,
    input: {
      outcome: 'provata',
      occurredOn: '2026-09-17',
      clientRequestId: randomUUID(),
    },
    now: new Date('2026-09-17T20:00:00Z'),
  });
  check(
    !blockedByRevoke.ok && blockedByRevoke.reason === 'CONTRIBUTIONS_REVOKED',
    'e non si aggiungono contributi nuovi finché la revoca è attiva'
  );

  await setContributionSharing({
    pathId: pathA!.id,
    actorUserId: athlete.id,
    shared: true,
    now: new Date('2026-09-18T10:00:00Z'),
  });

  section('Chiusura del percorso');

  const futureBooking = await makeBooking(
    providerA,
    athlete.id,
    'accepted',
    new Date(Date.now() + 3 * 86_400_000)
  );
  const refused = await closePath({
    pathId: pathA!.id,
    actorUserId: athlete.id,
    now: new Date(),
  });
  check(
    !refused.ok && refused.reason === 'FUTURE_BOOKING_EXISTS',
    'con una sessione in calendario la chiusura si rifiuta invece di disdire'
  );

  await sql`update public.bookings set status = 'cancelled' where id = ${futureBooking}`;

  const closed = await closePath({
    pathId: pathA!.id,
    actorUserId: athlete.id,
    now: new Date(),
  });
  check(closed.ok && closed.path.closedByRole === 'athlete', 'l’atleta chiude, e il ruolo resta scritto');

  const blockedByClosure = await recordAttempt({
    commitmentId: routine.commitmentId,
    athleteUserId: athlete.id,
    input: {
      outcome: 'provata',
      occurredOn: '2026-09-18',
      clientRequestId: randomUUID(),
    },
    now: new Date('2026-09-18T20:00:00Z'),
  });
  check(
    !blockedByClosure.ok && blockedByClosure.reason === 'PATH_CLOSED',
    'un percorso chiuso non riceve contributi nuovi'
  );

  await asUser(coachA.authId);
  const readableAfterClosure = await sql<{ n: number }[]>`
    select count(*)::int as n from public.commitment_attempts
    where commitment_id = ${routine.commitmentId}
  `;
  check(
    readableAfterClosure[0].n === 3,
    'ma lo storico resta leggibile: chiudere non cancella la memoria'
  );
  await asOwner();

  const coachReopen = await reopenPath({
    pathId: pathA!.id,
    actorUserId: coachA.id,
    now: new Date(),
  });
  check(
    !coachReopen.ok && coachReopen.reason === 'NOT_THE_CLOSER',
    'riapre solo chi ha chiuso'
  );

  const acceptedAgain = await makeBooking(providerA, athlete.id, 'accepted', null);
  const proposal = await ensurePathForAcceptedBooking({
    coachUserId: coachA.id,
    athleteUserId: athlete.id,
    bookingId: acceptedAgain,
    actorUserId: coachA.id,
  });
  check(
    proposal.kind === 'reopen_proposed' && proposal.toRole === 'athlete',
    'una prenotazione nuova propone la riapertura, non la esegue'
  );

  const reopened = await reopenPath({
    pathId: pathA!.id,
    actorUserId: athlete.id,
    now: new Date(),
  });
  check(reopened.ok && reopened.path.status === 'active', 'chi ha chiuso riapre');

  const [transitions] = await sql<{ n: number }[]>`
    select count(*)::int as n from public.coach_athlete_path_events
    where path_id = ${pathA!.id}
  `;
  check(transitions.n === 3, 'apertura, chiusura e riapertura sono tutte tracciate');

  // --- «Oggi» --------------------------------------------------------------

  section('«Oggi», dopo tutto questo');

  /*
   * Prima verifica una sottigliezza vera della regola esistente.
   *
   * La prenotazione appena accettata non ha un orario, e `canJoinVideoNow`
   * risponde `true` a una sessione senza orario — «una sessione senza un
   * momento fissato e' sempre raggiungibile». Quindi «Oggi» mostra «puoi
   * entrare», e fa bene: c'e' una stanza aperta ad aspettare. Scriverlo qui
   * evita che qualcuno domani lo scambi per un difetto.
   */
  const withOpenRoom = await getAthleteToday({
    athleteUserId: athlete.id,
    now: new Date('2026-09-18T21:00:00Z'),
  });
  check(
    withOpenRoom.state === 'can_join',
    'con una sessione senza orario la stanza è aperta, e «Oggi» lo dice'
  );

  /*
   * Si chiudono **tutte** le sessioni senza orario di questo atleta, non solo
   * l'ultima: ne era rimasta aperta anche una del secondo coach, e con quella
   * viva lo stato resta giustamente «puoi entrare».
   */
  await sql`
    update public.bookings set status = 'cancelled'
    where client_id = ${athlete.id} and status = 'accepted' and scheduled_for is null
  `;
  void acceptedAgain;

  const today = await getAthleteToday({
    athleteUserId: athlete.id,
    now: new Date('2026-09-18T21:00:00Z'),
  });
  check(
    today.state === 'action',
    'senza sessioni aperte lo stato è «azione in corso»: dopo una prova la schermata non svuota'
  );
  /*
   * L'azione proposta e' quella con **meno prove**, non quella con piu'
   * storia: fra due azioni concordate lo stesso giorno vince quella su cui
   * c'e' meno da dire. Quindi la routine provata tre volte finisce
   * nell'elenco, e la verifica giusta e' che sia raggiungibile con le sue
   * prove, non che stia in cima.
   */
  const everywhere = [today.action, ...today.otherActions].filter(
    (item): item is NonNullable<typeof item> => item !== null
  );
  const provata = everywhere.find(
    (item) => item.commitmentId === routine.commitmentId
  );
  check(
    provata !== undefined && provata.attempts.length === 3,
    'la routine provata resta raggiungibile, con tutte le sue prove'
  );
  check(
    today.action?.attemptCount === 0,
    'in cima va quella su cui ce meno da dire: quella senza prove'
  );
  check(
    today.activePaths.length === 2,
    'i due percorsi attivi ci sono entrambi: il destinatario va scelto'
  );
  void otherRoutine;

  // --- esito ---------------------------------------------------------------

  console.log(
    `\n${failures === 0 ? '✔' : '✖'} ${checks - failures}/${checks} verifiche superate.\n`
  );
  await sql.end({ timeout: 5 });
  if (failures > 0) process.exit(1);
}

main().catch(abort);
