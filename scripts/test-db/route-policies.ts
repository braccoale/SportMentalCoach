/**
 * Le stesse regole, viste dalla porta da cui entra davvero un telefono.
 *
 * **Perché non bastano i controlli sullo store.** `policies.ts` chiama
 * `recordAttempt`, `closePath`, `setCommitmentPause` direttamente: dimostra che
 * il dominio e lo store sono giusti, ma salta esattamente lo strato che un
 * telefono attraversa per primo — la funzione esportata `POST`/`GET` di
 * `app/api/mobile/.../route.ts`, che estrae l'utente da `getApiUser`, legge il
 * corpo JSON, interpreta i parametri di rotta e traduce il rifiuto del dominio
 * in uno stato HTTP. Un bug lì (un parametro scambiato, un controllo di ruolo
 * dimenticato prima di chiamare lo store, un identificativo che finisce nella
 * risposta) non lo troverebbe nessuno dei test precedenti.
 *
 * **Come si impersona un'identità senza un progetto Supabase Auth vero.**
 * `getApiUser` normalmente convalida un JWT contro Supabase Auth — la parte
 * che qui non è in perimetro (è autenticazione, non autorizzazione: il
 * collaudo di questo incremento riguarda chi può fare cosa una volta
 * riconosciuto, non come lo si riconosce). Si sostituisce quella sola funzione
 * con `node:test`'s `mock.module`, così le rotte restano il codice vero e solo
 * il suo ingresso è impersonato — non un secondo sistema di autenticazione
 * costruito per l'occasione.
 *
 * **Dove gira.** Solo sul database di prova: stesso cancello a due controlli
 * di `policies.ts` (`assertTestDatabaseUrl` + il marcatore che il database deve
 * portare addosso).
 */
import { mock } from 'node:test';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { abort, connectToTestDatabase } from './connect';
import { makeCommitment, seedPilotScene } from './fixtures';

/*
 * Vedi la stessa nota in `policies.ts`: si stub `server-only` invece di
 * avviare il processo con `--conditions=react-server`, perché quella
 * condizione fa fallire l'importazione di qualunque modulo che tocchi
 * `next/navigation` (qui: la rotta di preparazione, tramite
 * `lib/core/auth/roles.ts`) con un errore di Node, non un rifiuto
 * applicativo.
 */
mock.module('server-only', { defaultExport: undefined, namedExports: {} });

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

/** Un identificativo utente qualunque: la funzione stub qui sotto ignora tutto il resto. */
type SyntheticUser = { id: number; name: string };

function root(relative: string): string {
  return pathToFileURL(`C:/Dati/SportMentalCoach/${relative}`).href;
}

async function main(): Promise<void> {
  const { sql, description } = await connectToTestDatabase();
  console.log(`\nDatabase di prova: ${description}`);

  // Come in `policies.ts`: solo da qui in poi il codice applicativo può
  // girare, e gira contro il database che i due controlli sopra hanno già
  // riconosciuto come ambiente di prova.
  process.env.POSTGRES_URL = process.env.TEST_DATABASE_URL;

  /*
   * Il ruolo con cui gira tutto questo script, detto esplicitamente.
   *
   * `POSTGRES_URL` di prova punta all'utente `postgres` del contenitore, che
   * in PostgreSQL è superuser: bypassa RLS **sempre**, indipendentemente dalle
   * policy scritte nella migrazione. È lo stesso ruolo con cui, in produzione,
   * si connette Next.js tramite il pooler di Supabase — l'app non passa mai
   * per `anon`/`authenticated`. Quindi ogni isolamento dimostrato qui sotto
   * (un altro atleta non legge, un altro coach non scrive) è **applicativo**:
   * lo garantiscono `getApiUser` e le regole di dominio, non RLS. Le policy
   * RLS restano una difesa separata, verificata a parte in `policies.ts`,
   * contro l'accesso diretto via PostgREST con il JWT di un utente vero — un
   * percorso che questo script non attraversa.
   */
  const [{ role: dbRole, bypass: bypassRls }] = await sql<
    { role: string; bypass: boolean }[]
  >`select current_user as role, rolbypassrls as bypass from pg_roles where rolname = current_user`;
  console.log(
    `Ruolo di connessione: ${dbRole} (bypassa RLS: ${bypassRls ? 'sì — è il superuser del contenitore' : 'no'})`
  );

  /*
   * L'unico mock del collaudo, registrato una volta sola.
   *
   * `currentIdentity` è l'unica leva: cambiarla prima di ogni chiamata
   * impersona una persona diversa. Le rotte, importate dopo, catturano un
   * riferimento vivo a `getApiUser` — è per questo che una mutazione dopo
   * l'importazione basta, e non serve reimportare nulla fra un test e l'altro.
   */
  let currentIdentity: SyntheticUser | null = null;
  mock.module(root('lib/auth/api-user.ts'), {
    namedExports: { getApiUser: async () => currentIdentity },
  });

  const today = await import(root('app/api/mobile/today/route.ts'));
  const attempts = await import(
    root('app/api/mobile/commitments/[commitmentId]/attempts/route.ts')
  );
  const pause = await import(
    root('app/api/mobile/commitments/[commitmentId]/pause/route.ts')
  );
  const attemptById = await import(root('app/api/mobile/attempts/[attemptId]/route.ts'));
  const closeRoute = await import(root('app/api/mobile/paths/[pathId]/close/route.ts'));
  const reopenRoute = await import(root('app/api/mobile/paths/[pathId]/reopen/route.ts'));
  const sharingRoute = await import(root('app/api/mobile/paths/[pathId]/sharing/route.ts'));
  const prepRoute = await import(
    root('app/api/mobile/sessions/[bookingId]/prep/route.ts')
  );

  const { recordAthleteCommitmentOutcome } = await import(
    root('lib/core/ai-session-notes/session-commitments.ts')
  );
  const { createSessionCommitmentStore } = await import(
    root('lib/core/ai-session-notes/session-commitments-store.ts')
  );
  const store = createSessionCommitmentStore();

  // --- la scena --------------------------------------------------------------

  const { coachA, coachB, athlete, otherAthlete, providerA, providerB } =
    await seedPilotScene(sql);

  await sql`
    insert into public.coach_athlete_paths (coach_user_id, athlete_user_id, status)
    values (${coachA.id}, ${athlete.id}, 'active')
    returning id
  `;
  const [{ id: pathAId }] = await sql<{ id: number }[]>`
    select id from public.coach_athlete_paths
    where coach_user_id = ${coachA.id} and athlete_user_id = ${athlete.id}
  `;
  await sql`
    insert into public.coach_athlete_paths (coach_user_id, athlete_user_id, status)
    values (${coachB.id}, ${otherAthlete.id}, 'active')
  `;

  /*
   * L'entitlement AI_SESSION_NOTES, per il coach del percorso.
   *
   * `getSessionBrief` passa da `getMentalJourney`, che oltre alla relazione
   * richiede questa funzione attiva sull'attore. Senza questa riga la rotta di
   * preparazione risponde comunque 200 — ma con un foglio vuoto, perché
   * l'errore di autorizzazione del Mental Journey viene inghiottito e
   * convertito in "niente da mostrare" (la stessa scelta del web): un 200
   * vuoto avrebbe fatto sembrare superata una verifica che invece non aveva
   * ancora controllato niente.
   */
  await sql`
    insert into public.user_feature_entitlements (user_id, feature_code, status, source)
    values (${coachA.id}, 'AI_SESSION_NOTES', 'enabled', 'admin')
  `;

  const { romeCalendarDay } = await import(
    root('lib/core/ai-session-notes/commitment-attempts.ts')
  );
  /*
   * Le date della scena si calcolano rispetto a *oggi*, non a una data fissa
   * nel codice. La rotta HTTP usa `new Date()` vero — non il `now` esplicito
   * che `policies.ts` passa allo store — quindi un giorno futuro scritto a
   * mano (bene finché «oggi» era prima di quella data, un guasto silenzioso
   * il giorno dopo) sarebbe stato respinto come `FUTURE_DATE` non appena la
   * finestra reale lo avesse superato. Con giorni relativi, lo script resta
   * corretto per sempre.
   */
  const WED = romeCalendarDay(new Date(Date.now() - 2 * 86_400_000));
  const SAT = romeCalendarDay(new Date());

  const routine = await makeCommitment(sql, {
    coachUserId: coachA.id,
    providerId: providerA,
    athleteUserId: athlete.id,
    title: 'Prima della battuta, tre respiri e una parola sola: dove tiro.',
  });
  const foreignRoutine = await makeCommitment(sql, {
    coachUserId: coachB.id,
    providerId: providerB,
    athleteUserId: otherAthlete.id,
    title: 'Routine di un altro percorso, con un altro atleta.',
  });

  function req(url: string, init: RequestInit = {}): Request {
    return new Request(`http://x${url}`, init);
  }
  function jsonReq(url: string, body: unknown, method = 'POST'): Request {
    return new Request(`http://x${url}`, { method, body: JSON.stringify(body) });
  }
  function params(value: Record<string, string>) {
    return { params: Promise.resolve(value) };
  }
  const as = (user: SyntheticUser | null) => {
    currentIdentity = user;
  };

  // --- autenticazione: la porta si chiude a chi non si è presentato --------

  section('Nessuna identità, nessuna risposta');

  as(null);
  const anon1 = await today.GET(req('/api/mobile/today'));
  check(anon1.status === 401, 'GET /today senza identità → 401');

  const anon2 = await attempts.POST(
    jsonReq(`/api/mobile/commitments/${routine.commitmentId}/attempts`, {
      outcome: 'provata',
      occurredOn: WED,
      clientRequestId: randomUUID(),
    }),
    params({ commitmentId: String(routine.commitmentId) })
  );
  check(anon2.status === 401, 'POST .../attempts senza identità → 401');

  // --- il ciclo, attraverso la rotta vera -----------------------------------

  section('Il ciclo, attraverso la rotta HTTP');

  as({ id: athlete.id, name: 'Atleta' });

  const wed = await attempts.POST(
    jsonReq(`/api/mobile/commitments/${routine.commitmentId}/attempts`, {
      outcome: 'provata',
      occurredOn: WED,
      note: 'ci ho provato in tre battute su sei',
      clientRequestId: randomUUID(),
    }),
    params({ commitmentId: String(routine.commitmentId) })
  );
  check(wed.status === 200, 'mercoledì, dalla rotta HTTP: 200');
  const wedBody = await wed.json();
  check(wedBody.duplicate === false, 'non è un duplicato: è la prima prova');

  const satRequestId = randomUUID();
  const sat = await attempts.POST(
    jsonReq(`/api/mobile/commitments/${routine.commitmentId}/attempts`, {
      outcome: 'non_adatta',
      occurredOn: SAT,
      note: 'ero già arrabbiata',
      clientRequestId: satRequestId,
    }),
    params({ commitmentId: String(routine.commitmentId) })
  );
  check(sat.status === 200, 'sabato, dalla rotta HTTP: 200');

  const retry = await attempts.POST(
    jsonReq(`/api/mobile/commitments/${routine.commitmentId}/attempts`, {
      outcome: 'non_adatta',
      occurredOn: SAT,
      note: 'ero già arrabbiata',
      clientRequestId: satRequestId,
    }),
    params({ commitmentId: String(routine.commitmentId) })
  );
  check(retry.status === 200, 'il ritentativo con lo stesso id resta 200, non un errore');
  const retryBody = await retry.json();
  check(retryBody.duplicate === true, 'e la rotta lo segnala come duplicato');

  const today1 = await today.GET(req('/api/mobile/today'));
  const today1Body = await today1.json();
  const actionAfterCycle = [today1Body.action, ...today1Body.otherActions].find(
    (a: { commitmentId: number }) => a && a.commitmentId === routine.commitmentId
  );
  check(
    actionAfterCycle?.attempts?.length === 2,
    'GET /today, dalla stessa rotta, mostra le due prove distinte'
  );

  // --- atleta A non tocca le prove di B --------------------------------------

  section('Isolamento fra atleti, per identificativo indovinato');

  as({ id: otherAthlete.id, name: 'Altro atleta' });
  const crossWrite = await attempts.POST(
    jsonReq(`/api/mobile/commitments/${routine.commitmentId}/attempts`, {
      outcome: 'provata',
      occurredOn: SAT,
      clientRequestId: randomUUID(),
    }),
    params({ commitmentId: String(routine.commitmentId) })
  );
  check(
    crossWrite.status === 403,
    'un altro atleta non registra una prova sull’azione di un altro: 403'
  );

  const otherToday = await today.GET(req('/api/mobile/today'));
  const otherTodayBody = await otherToday.json();
  check(
    ![otherTodayBody.action, ...otherTodayBody.otherActions].some(
      (a: { commitmentId: number } | null) => a && a.commitmentId === routine.commitmentId
    ),
    'e /today non gliela mostra nemmeno di striscio'
  );

  // Con l'id di una prova vera, presa in prestito.
  const attemptRows = await sql<{ id: number; version: number }[]>`
    select id, version from public.commitment_attempts
    where commitment_id = ${routine.commitmentId} order by occurred_on
  `;
  const someoneElsesAttempt = attemptRows[0];
  const crossEdit = await attemptById.PATCH(
    jsonReq(
      `/api/mobile/attempts/${someoneElsesAttempt.id}`,
      { version: someoneElsesAttempt.version, outcome: 'provata', occurredOn: WED },
      'PATCH'
    ),
    params({ attemptId: String(someoneElsesAttempt.id) })
  );
  check(
    crossEdit.status === 403,
    'e non corregge una prova che ha scritto qualcun altro, nemmeno conoscendone l’id: 403'
  );

  const crossPause = await pause.POST(
    jsonReq(`/api/mobile/commitments/${routine.commitmentId}/pause`, { paused: true }),
    params({ commitmentId: String(routine.commitmentId) })
  );
  check(crossPause.status === 403, 'e non la mette nemmeno in pausa: 403');

  // --- un coach non entra da una rotta pensata per l'atleta ------------------

  section('Un coach non aggira le rotte dell’atleta');

  as({ id: coachA.id, name: 'Coach A' });
  const coachAsAthlete = await attempts.POST(
    jsonReq(`/api/mobile/commitments/${routine.commitmentId}/attempts`, {
      outcome: 'provata',
      occurredOn: SAT,
      clientRequestId: randomUUID(),
    }),
    params({ commitmentId: String(routine.commitmentId) })
  );
  check(
    coachAsAthlete.status === 403,
    'il coach del percorso non può registrare una prova al posto dell’atleta: 403'
  );

  const coachOnForeign = await pause.POST(
    jsonReq(`/api/mobile/commitments/${foreignRoutine.commitmentId}/pause`, { paused: true }),
    params({ commitmentId: String(foreignRoutine.commitmentId) })
  );
  check(
    coachOnForeign.status === 403,
    'e non tocca un’azione di un percorso che non è il suo: 403'
  );

  // --- il coach destinatario legge solo il proprio percorso ------------------

  section('Il coach destinatario legge solo il percorso autorizzato');

  as({ id: coachA.id, name: 'Coach A' });
  const prepAuthorized = await prepRoute.GET(
    req(`/api/mobile/sessions/${routine.bookingId}/prep`),
    params({ bookingId: String(routine.bookingId) })
  );
  check(prepAuthorized.status === 200, 'coach A, sulla propria seduta: 200');
  const prepAuthorizedBody = await prepAuthorized.json();
  const surfacedForA = (prepAuthorizedBody.sinceLastSession?.actions ?? []).find(
    (a: { commitmentId: number }) => a.commitmentId === routine.commitmentId
  );
  check(
    surfacedForA?.attempts?.length === 2,
    'e vede davvero le due prove nel blocco «Dall’ultimo incontro» — non solo un 200 vuoto'
  );

  as({ id: coachB.id, name: 'Coach B' });
  const prepForeign = await prepRoute.GET(
    req(`/api/mobile/sessions/${routine.bookingId}/prep`),
    params({ bookingId: String(routine.bookingId) })
  );
  // Il primo cancello della rotta non guarda la relazione: guarda se questa
  // *prenotazione* appartiene a chi chiede. Coach B non ne fa parte, quindi la
  // query non restituisce nemmeno una riga — è un 404, non un 403. È la scelta
  // più prudente delle due: non conferma nemmeno che quella prenotazione
  // esista, a chi non ne fa parte.
  check(
    prepForeign.status === 404,
    'coach B, sulla stessa identica seduta (id indovinato): 404 — la rotta non conferma nemmeno che esista, non un foglio vuoto'
  );

  // --- pausa e ripresa, attraverso la rotta ----------------------------------

  section('Pausa e ripresa, attraverso la rotta');

  as({ id: athlete.id, name: 'Atleta' });
  const pauseOk = await pause.POST(
    jsonReq(`/api/mobile/commitments/${routine.commitmentId}/pause`, {
      paused: true,
      reason: 'ho la gara domenica',
    }),
    params({ commitmentId: String(routine.commitmentId) })
  );
  check(pauseOk.status === 200, 'l’atleta mette in pausa dalla rotta: 200');

  const pauseTwice = await pause.POST(
    jsonReq(`/api/mobile/commitments/${routine.commitmentId}/pause`, { paused: true }),
    params({ commitmentId: String(routine.commitmentId) })
  );
  check(pauseTwice.status === 409, 'metterla in pausa una seconda volta: 409, non un successo silenzioso');

  const todayPaused = await today.GET(req('/api/mobile/today'));
  const todayPausedBody = await todayPaused.json();
  check(
    todayPausedBody.action?.commitmentId !== routine.commitmentId,
    'in pausa, /today non la propone più come azione principale'
  );

  const resumeOk = await pause.POST(
    jsonReq(`/api/mobile/commitments/${routine.commitmentId}/pause`, { paused: false }),
    params({ commitmentId: String(routine.commitmentId) })
  );
  check(resumeOk.status === 200, 'e la riprende dalla stessa rotta: 200');

  const resumeTwice = await pause.POST(
    jsonReq(`/api/mobile/commitments/${routine.commitmentId}/pause`, { paused: false }),
    params({ commitmentId: String(routine.commitmentId) })
  );
  check(resumeTwice.status === 409, 'riprenderla di nuovo: 409, non un successo silenzioso');

  // --- correzione concorrente, attraverso la rotta ---------------------------

  section('Correzione concorrente, attraverso la rotta');

  const target = attemptRows[1];
  const firstPatch = await attemptById.PATCH(
    jsonReq(
      `/api/mobile/attempts/${target.id}`,
      { version: target.version, outcome: 'non_adatta', occurredOn: SAT, note: 'corretto dal telefono uno' },
      'PATCH'
    ),
    params({ attemptId: String(target.id) })
  );
  check(firstPatch.status === 200, 'la prima correzione, dalla rotta: 200');

  const stalePatch = await attemptById.PATCH(
    jsonReq(
      `/api/mobile/attempts/${target.id}`,
      { version: target.version, outcome: 'provata', occurredOn: SAT, note: 'dal telefono due, in ritardo' },
      'PATCH'
    ),
    params({ attemptId: String(target.id) })
  );
  check(
    stalePatch.status === 409,
    'la seconda, con la versione ormai superata: 409, non una sovrascrittura'
  );

  // --- chiusura del percorso, attraverso la rotta -----------------------------

  section('Chiusura del percorso, attraverso la rotta');

  const closeOk = await closeRoute.POST(req('/'), params({ pathId: String(pathAId) }));
  check(closeOk.status === 200, 'l’atleta chiude il percorso dalla rotta: 200');

  const blockedAfterClose = await attempts.POST(
    jsonReq(`/api/mobile/commitments/${routine.commitmentId}/attempts`, {
      outcome: 'provata',
      occurredOn: SAT,
      clientRequestId: randomUUID(),
    }),
    params({ commitmentId: String(routine.commitmentId) })
  );
  check(
    blockedAfterClose.status === 409,
    'con il percorso chiuso, una prova nuova viene rifiutata: 409'
  );

  as({ id: coachA.id, name: 'Coach A' });
  const coachReopenAttempt = await reopenRoute.POST(req('/'), params({ pathId: String(pathAId) }));
  check(
    coachReopenAttempt.status === 403,
    'il coach non riapre un percorso che ha chiuso l’atleta: 403'
  );

  as({ id: athlete.id, name: 'Atleta' });
  const athleteReopen = await reopenRoute.POST(req('/'), params({ pathId: String(pathAId) }));
  check(athleteReopen.status === 200, 'chi ha chiuso, riapre: 200');

  // --- revoca della condivisione, attraverso la rotta -------------------------

  section('Revoca della condivisione, attraverso la rotta');

  const revokeOk = await sharingRoute.POST(
    jsonReq('/', { shared: false }),
    params({ pathId: String(pathAId) })
  );
  check(revokeOk.status === 200, 'l’atleta revoca dalla rotta: 200');

  as({ id: coachA.id, name: 'Coach A' });
  const revokeByCoach = await sharingRoute.POST(
    jsonReq('/', { shared: true }),
    params({ pathId: String(pathAId) })
  );
  check(
    revokeByCoach.status === 403,
    'il coach non può ripristinare la condivisione al posto dell’atleta: 403'
  );

  as({ id: athlete.id, name: 'Atleta' });
  await sharingRoute.POST(jsonReq('/', { shared: true }), params({ pathId: String(pathAId) }));

  // --- vecchi percorsi web non aggirano le nuove regole -----------------------

  section('I vecchi percorsi web non aggirano le nuove regole');

  // Il vecchio meccanismo del web («Fatto» / «Non riuscito» sulla dashboard
  // atleta) resta attivo: non lo si è tolto in questo incremento. Il punto da
  // verificare è che chiuderlo per quella strada preesistente non lasci
  // un'azione «chiusa ma ancora in pausa» — un'incoerenza che questo
  // incremento avrebbe introdotto aggiungendo le colonne di pausa senza
  // insegnare al vecchio percorso a pulirle.
  const pauseAgain = await pause.POST(
    jsonReq(`/api/mobile/commitments/${routine.commitmentId}/pause`, {
      paused: true,
      reason: 'test',
    }),
    params({ commitmentId: String(routine.commitmentId) })
  );
  check(pauseAgain.status === 200, 'la routine torna in pausa, in preparazione al controllo');

  await recordAthleteCommitmentOutcome({
    commitmentId: routine.commitmentId,
    actorUserId: athlete.id,
    status: 'completed',
    store,
    now: () => new Date(),
  });

  const [afterLegacyClose] = await sql<{
    status: string;
    paused_at: Date | null;
    paused_reason: string | null;
  }[]>`
    select status, paused_at, paused_reason from public.session_ai_commitments
    where id = ${routine.commitmentId}
  `;
  check(afterLegacyClose.status === 'completed', 'il vecchio percorso web chiude l’azione, come sempre');
  check(
    afterLegacyClose.paused_at === null && afterLegacyClose.paused_reason === null,
    'e la pausa viene ripulita: un’azione chiusa non è mai anche «in pausa» (difetto corretto in questo collaudo)'
  );

  const blockedByLegacyClosure = await attempts.POST(
    jsonReq(`/api/mobile/commitments/${routine.commitmentId}/attempts`, {
      outcome: 'provata',
      occurredOn: SAT,
      clientRequestId: randomUUID(),
    }),
    params({ commitmentId: String(routine.commitmentId) })
  );
  check(
    blockedByLegacyClosure.status === 409,
    'e la nuova rotta delle prove rispetta la chiusura decisa dal vecchio percorso: 409'
  );

  const resumeAfterLegacyClosure = await pause.POST(
    jsonReq(`/api/mobile/commitments/${routine.commitmentId}/pause`, { paused: false }),
    params({ commitmentId: String(routine.commitmentId) })
  );
  check(
    resumeAfterLegacyClosure.status === 409,
    'e non la si può nemmeno «riprendere»: è chiusa, non in pausa (409, non 200)'
  );

  // --- esito -------------------------------------------------------------

  console.log(
    `\n${failures === 0 ? '✔' : '✖'} ${checks - failures}/${checks} verifiche superate.\n`
  );
  await sql.end({ timeout: 5 });
  if (failures > 0) process.exit(1);
}

main().catch(abort);
