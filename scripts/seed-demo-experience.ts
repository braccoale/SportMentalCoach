import { createHash } from 'node:crypto';
import {
  createClient,
  type SupabaseClient,
  type User as AuthUser,
} from '@supabase/supabase-js';
import { and, eq } from 'drizzle-orm';
import dotenv from 'dotenv';
import {
  SESSION_COMPASS_REPORT_KIND,
  SESSION_COMPASS_SCHEMA_VERSION,
  type CompassEvidence,
  type CompassSourceSegment,
  type SessionCompassReport,
  validateSessionCompassReport,
} from '@/lib/core/ai-session-notes/session-compass-contract';
import { db, client } from '@/lib/db/drizzle';
import {
  athleteJourneyGoals,
  athleteJourneyGoalSessions,
  bookings,
  clientProfiles,
  coachAvailability,
  messages,
  notifications,
  profiles,
  providerProfiles,
  reviews,
  roles,
  services,
  sessionAiAuditEvents,
  sessionAiCommitments,
  sessionAiConsents,
  sessionAiNotes,
  sessionAiReports,
  sessionCoachBookmarks,
  sessionParticipantRecordings,
  sessionTranscriptSegments,
  sessionTranscriptTimelineSegments,
  teamMembers,
  teams,
  userFeatureEntitlements,
  userOnboarding,
  userRoles,
  users,
} from '@/lib/db/schema';

dotenv.config();
dotenv.config({ path: '.env.local', override: true });

const DEMO_PASSWORD_ENV = 'KAIPAI_DEMO_PASSWORD';
const INTERACTIVE_EMAILS = [
  'coachdemo@kaipaicoaching.com',
  'atletademo@kaipaicoaching.com',
] as const;

type DemoAthlete = {
  key: string;
  email: string;
  firstName: string;
  lastName: string;
  avatarUrl: string;
  sport: string;
  sportLabel: string;
  level: string;
  city: string;
  birthDate: string;
  goals: string;
  performanceContext: string;
  errorMoment: string;
  resource: string;
  openConcern: string;
  support: string;
  sessions: number;
  review: string;
};

const COACH = {
  email: INTERACTIVE_EMAILS[0],
  firstName: 'Alessandro',
  lastName: 'Riva',
  displayName: 'Alessandro Riva',
  avatarUrl: '/demo/coach-alessandro-riva.png',
} as const;

const ATHLETES: readonly DemoAthlete[] = [
  {
    key: 'giulia',
    email: INTERACTIVE_EMAILS[1],
    firstName: 'Giulia',
    lastName: 'Martini',
    avatarUrl: '/demo/athlete-giulia-martini.png',
    sport: 'football',
    sportLabel: 'calcio',
    level: 'semi_pro',
    city: 'Bologna',
    birthDate: '2002-04-18',
    goals:
      'Restare presente dopo un errore, rendere stabile la routine di reset e comunicare con maggiore sicurezza in squadra.',
    performanceContext: 'gli ultimi venti minuti della partita di domenica',
    errorMoment: 'un passaggio sbagliato che ha avviato il contropiede avversario',
    resource: 'Prima della ripresa del gioco ho respirato lentamente e sono tornata sulla posizione da coprire.',
    openConcern: 'Non ho ancora parlato con l’allenatore: temo che interpreti il silenzio come poca concentrazione.',
    support: 'Quando le compagne mi richiamano con una parola semplice torno nella partita più in fretta.',
    sessions: 4,
    review:
      'Il percorso mi ha dato strumenti concreti da usare in partita. Ora riconosco prima quando sto restando sull’errore.',
  },
  {
    key: 'lorenzo',
    email: 'demo.lorenzo@kaipaicoaching.com',
    firstName: 'Lorenzo',
    lastName: 'Conti',
    avatarUrl: '/demo/athlete-lorenzo-conti.png',
    sport: 'tennis',
    sportLabel: 'tennis',
    level: 'pro',
    city: 'Firenze',
    birthDate: '1997-11-03',
    goals:
      'Ridurre il dialogo interno negativo, recuperare rapidamente dopo i doppi falli e gestire i punti importanti.',
    performanceContext: 'il tie-break del torneo di sabato',
    errorMoment: 'un doppio fallo sul cinque pari',
    resource: 'Al cambio campo ho rallentato il respiro e ho ritrovato il ritmo sulla prima di servizio.',
    openConcern: 'Nei punti importanti cerco il colpo perfetto e smetto di fidarmi della scelta più semplice.',
    support: 'La frase breve concordata con il preparatore mi riporta subito al piano partita.',
    sessions: 3,
    review:
      'Sessioni molto pratiche: le routine sono entrate negli allenamenti e nei tie-break riesco a ripartire con più ordine.',
  },
  {
    key: 'elena',
    email: 'demo.elena@kaipaicoaching.com',
    firstName: 'Elena',
    lastName: 'Ferri',
    avatarUrl: '/demo/athlete-elena-ferri.png',
    sport: 'curling',
    sportLabel: 'curling',
    level: 'amateur',
    city: 'Verona',
    birthDate: '1994-07-22',
    goals:
      'Mantenere lucidità nelle ultime end, comunicare con precisione la lettura del ghiaccio e fidarsi della scelta concordata.',
    performanceContext: 'l’ottava end della partita di qualificazione',
    errorMoment: 'una stone rimasta corta dopo una chiamata importante',
    resource: 'Ho pulito la suola, guardato di nuovo la linea e riportato l’attenzione sulla velocità della stone successiva.',
    openConcern: 'Quando il ghiaccio cambia temo di insistere troppo sulla mia lettura e di confondere la squadra.',
    support: 'Il confronto breve con la skip mi aiuta a lasciare il tiro precedente e condividere una scelta chiara.',
    sessions: 3,
    review:
      'Ora affronto le end decisive con una routine chiara e comunico meglio con la squadra, anche dopo un tiro impreciso.',
  },
  {
    key: 'sofia',
    email: 'demo.sofia@kaipaicoaching.com',
    firstName: 'Sofia',
    lastName: 'Bianchi',
    avatarUrl: '/demo/athlete-sofia-bianchi.png',
    sport: 'martial_arts',
    sportLabel: 'karate',
    level: 'semi_pro',
    city: 'Torino',
    birthDate: '2005-02-11',
    goals:
      'Gestire l’attesa prima del kumite, scegliere con decisione il primo attacco e recuperare subito dopo una penalità.',
    performanceContext: 'la semifinale di kumite del torneo regionale',
    errorMoment: 'un richiamo arbitrale ricevuto nei primi secondi',
    resource: 'Ho sentito l’appoggio dei piedi sul tatami e sono tornata alla distanza preparata in allenamento.',
    openConcern: 'Quando l’avversaria parte forte tendo ad arretrare e ad aspettare troppo prima di scegliere.',
    support: 'Una sola indicazione del maestro tra i punti mi aiuta più di molte correzioni insieme.',
    sessions: 3,
    review:
      'Il percorso mi ha aiutata a entrare sul tatami con un piano semplice e a non farmi definire dal primo errore.',
  },
  {
    key: 'marco',
    email: 'demo.marco@kaipaicoaching.com',
    firstName: 'Marco',
    lastName: 'De Santis',
    avatarUrl: '/demo/athlete-marco-de-santis.png',
    sport: 'skiing',
    sportLabel: 'sci alpino',
    level: 'pro',
    city: 'Trento',
    birthDate: '1998-12-06',
    goals:
      'Restare aggressivo dopo un intermedio lento, rendere stabile la routine al cancelletto e fidarsi della ricognizione.',
    performanceContext: 'la seconda manche dello slalom di domenica',
    errorMoment: 'un ingresso arretrato sul muro dopo il primo intermedio',
    resource: 'Al cancelletto ho richiamato due parole tecniche e visualizzato soltanto le prime tre porte.',
    openConcern: 'Quando vedo un tempo alto all’intermedio provo a recuperare tutto nelle porte successive.',
    support: 'Il confronto essenziale con l’allenatore dopo la ricognizione mi aiuta a non aggiungere dubbi prima della partenza.',
    sessions: 3,
    review:
      'Ho imparato a preparare la manche senza riempirmi di istruzioni e a ripartire dal gesto successivo quando perdo tempo.',
  },
] as const;

const PHASES = [
  {
    focus: 'Riconoscere il momento in cui l’attenzione si sposta dall’azione all’errore',
    technique: 'Dare un nome al passaggio e riportare l’attenzione al gesto immediatamente successivo.',
    obstacle: 'Nel momento me ne accorgo tardi, quando ho già ripassato l’errore più volte.',
    commitment: 'Annota tre episodi reali: che cosa è successo, qual è stato il primo pensiero e quanto è durato.',
    acceptance: 'Lo farò subito dopo l’allenamento, prima di tornare a casa.',
    nextStep: 'La prossima volta partiamo dai tre episodi e cerchiamo il primo segnale riconoscibile.',
    metrics: [2, 2, 2, 4, 3, 4],
  },
  {
    focus: 'Costruire una routine breve di reset dopo l’errore',
    technique: 'La sequenza sarà: espirazione lunga, parola chiave e sguardo sul riferimento del gesto successivo.',
    obstacle: 'Se la routine è lunga durante la prestazione non ricordo l’ordine dei passaggi.',
    commitment: 'Prova la routine di reset tre volte in allenamento, sempre dopo un errore reale.',
    acceptance: 'La scrivo sul telefono e la provo già nel prossimo allenamento.',
    nextStep: 'Verifichiamo quante prove sono riuscite e che cosa è cambiato nei secondi successivi.',
    metrics: [3, 3, 3, 4, 3, 3],
  },
  {
    focus: 'Rendere utile il dialogo interno nei momenti di pressione',
    technique: 'Sostituire il giudizio con una frase operativa breve, concreta e controllabile.',
    obstacle: 'Quando il punteggio conta la frase critica arriva prima di quella che ho preparato.',
    commitment: 'Usa la parola chiave in due simulazioni ad alta pressione e registra l’effetto sul gesto seguente.',
    acceptance: 'Chiedo al preparatore di creare due situazioni con punteggio e uso la frase ogni volta.',
    nextStep: 'Apriamo la prossima seduta confrontando la prima e la seconda simulazione.',
    metrics: [3, 4, 3, 4, 4, 3],
  },
  {
    focus: 'Portare la routine completa dalla prova alla competizione',
    technique: 'Agganciare la routine a un segnale visibile e usarla prima che il pensiero sull’errore prenda spazio.',
    obstacle: 'In gara tendo ad aspettare di essere già in difficoltà prima di usare quello che ho allenato.',
    commitment: 'Applica la routine al primo segnale concordato e annota quanto tempo serve per tornare al compito.',
    acceptance: 'La preparo nella borsa e la rileggo durante il riscaldamento.',
    nextStep: 'Nella prossima sessione ricostruiamo il primo episodio di gara minuto per minuto.',
    metrics: [4, 4, 4, 5, 4, 2],
  },
] as const;

type Phase = (typeof PHASES)[number];
type TranscriptDraft = Omit<CompassSourceSegment, 'transcriptSegmentId'>;

function atDaysFromNow(days: number, hour = 18): Date {
  const date = new Date();
  date.setUTCHours(hour, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + days);
  return date;
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function sourceFingerprint(segments: readonly CompassSourceSegment[]): string {
  const payload = segments
    .slice()
    .sort((left, right) => left.transcriptSegmentId - right.transcriptSegmentId)
    .map((segment) =>
      [
        segment.transcriptSegmentId,
        segment.startMs,
        segment.endMs,
        segment.speaker,
        segment.text,
      ].join('|')
    )
    .join('\n');
  return sha256(
    `${SESSION_COMPASS_REPORT_KIND}:${SESSION_COMPASS_SCHEMA_VERSION}\n${payload}`
  );
}

function transcriptFor(athlete: DemoAthlete, phase: Phase): TranscriptDraft[] {
  return [
    {
      startMs: 0,
      endMs: 38_000,
      speaker: 'coach',
      text: `Ripartiamo da ${phase.focus.toLocaleLowerCase('it')}. Quale momento ti è rimasto più addosso?`,
    },
    {
      startMs: 42_000,
      endMs: 96_000,
      speaker: 'athlete',
      text: `Durante ${athlete.performanceContext}, dopo ${athlete.errorMoment}, ho sentito che l’attenzione era rimasta lì.`,
    },
    {
      startMs: 180_000,
      endMs: 212_000,
      speaker: 'coach',
      text: 'Che cosa succedeva nella tua testa mentre la prestazione continuava?',
    },
    {
      startMs: 214_000,
      endMs: 268_000,
      speaker: 'athlete',
      text: 'Continuavo a rivedere l’errore e cercavo di correggere tutto insieme invece di scegliere una cosa sola.',
    },
    {
      startMs: 470_000,
      endMs: 522_000,
      speaker: 'athlete',
      text: athlete.resource,
    },
    {
      startMs: 690_000,
      endMs: 744_000,
      speaker: 'coach',
      text: phase.technique,
    },
    {
      startMs: 905_000,
      endMs: 958_000,
      speaker: 'athlete',
      text: phase.obstacle,
    },
    {
      startMs: 1_320_000,
      endMs: 1_380_000,
      speaker: 'athlete',
      text: athlete.openConcern,
    },
    {
      startMs: 1_680_000,
      endMs: 1_736_000,
      speaker: 'coach',
      text: phase.commitment,
    },
    {
      startMs: 1_742_000,
      endMs: 1_790_000,
      speaker: 'athlete',
      text: phase.acceptance,
    },
    {
      startMs: 2_100_000,
      endMs: 2_152_000,
      speaker: 'athlete',
      text: athlete.support,
    },
    {
      startMs: 2_400_000,
      endMs: 2_448_000,
      speaker: 'coach',
      text: phase.nextStep,
    },
  ];
}

function reportFor(params: {
  athlete: DemoAthlete;
  phase: Phase;
  phaseIndex: number;
  sessionId: number;
  sessionDate: Date;
  fingerprint: string;
  segments: readonly CompassSourceSegment[];
}): SessionCompassReport {
  const { athlete, phase, phaseIndex, sessionId, sessionDate, fingerprint, segments } =
    params;
  const byPosition = (position: number) => segments[position - 1];
  const evidence = (position: number, quote: string): CompassEvidence => {
    const segment = byPosition(position);
    if (!segment || !segment.text.includes(quote)) {
      throw new Error(`Evidenza demo non valida: sessione ${sessionId}, segmento ${position}`);
    }
    return {
      transcriptSegmentId: segment.transcriptSegmentId,
      startMs: segment.startMs,
      minute: Math.floor(segment.startMs / 60_000),
      speaker: segment.speaker,
      quote,
    };
  };
  const due = new Date(sessionDate);
  due.setUTCDate(due.getUTCDate() + 7);
  const metricKeys = [
    'concentration',
    'emotional_management',
    'confidence',
    'motivation',
    'energy',
    'pre_competition_anxiety',
  ] as const;
  const prefix = `${athlete.key}-s${phaseIndex + 1}`;
  const completed = phaseIndex < athlete.sessions - 1;

  const report: SessionCompassReport = {
    schemaVersion: SESSION_COMPASS_SCHEMA_VERSION,
    reportKind: SESSION_COMPASS_REPORT_KIND,
    sessionId: String(sessionId),
    sourceFingerprint: fingerprint,
    language: 'it',
    sessionOverview: {
      summary: `La seduta mette a fuoco “${phase.focus}”. ${athlete.firstName} collega il tema a un episodio recente della propria pratica sportiva, riconosce una risorsa già utilizzata e concorda una prova osservabile da portare nel prossimo allenamento.`,
      summaryEvidence: [
        evidence(4, 'Continuavo a rivedere l’errore'),
        evidence(5, athlete.resource),
      ],
      themes: [
        {
          id: `${prefix}-theme-focus`,
          text: phase.focus,
          evidence: evidence(4, 'cercavo di correggere tutto insieme'),
        },
        {
          id: `${prefix}-theme-resource`,
          text: 'Una risorsa concreta è già comparsa nella prestazione',
          evidence: evidence(5, athlete.resource),
        },
        {
          id: `${prefix}-theme-transfer`,
          text: 'Il passaggio decisivo è usare lo strumento prima che la difficoltà cresca',
          evidence: evidence(7, phase.obstacle),
        },
      ],
      emergingResource: {
        id: `${prefix}-resource-support`,
        text: 'Il contesto relazionale può sostenere il ritorno al compito',
        evidence: evidence(11, athlete.support),
      },
      metrics: metricKeys.map((key, index) => ({
        id: `${prefix}-metric-${key}`,
        key,
        value: phase.metrics[index] as 1 | 2 | 3 | 4 | 5,
        confidence: index < 4 ? ('high' as const) : ('medium' as const),
        evidence:
          index === 0
            ? evidence(4, 'Continuavo a rivedere l’errore')
            : index === 1
              ? evidence(5, athlete.resource)
              : index === 2
                ? evidence(8, athlete.openConcern)
                : index === 3
                  ? evidence(10, phase.acceptance)
                  : index === 4
                    ? evidence(2, athlete.errorMoment)
                    : evidence(7, phase.obstacle),
      })),
      emotionalTrend: [
        {
          id: `${prefix}-trend-1`,
          value: -1,
          label: 'Attivazione nel ricostruire il momento critico',
          evidence: evidence(2, athlete.errorMoment),
        },
        {
          id: `${prefix}-trend-2`,
          value: -2,
          label: 'Tensione nel descrivere il ciclo sull’errore',
          evidence: evidence(4, 'Continuavo a rivedere l’errore'),
        },
        {
          id: `${prefix}-trend-3`,
          value: 1,
          label: 'Apertura nel riconoscere una risorsa già disponibile',
          evidence: evidence(5, athlete.resource),
        },
        {
          id: `${prefix}-trend-4`,
          value: 2,
          label: 'Slancio nel definire una prova concreta',
          evidence: evidence(10, phase.acceptance),
        },
      ],
      conversationParticipation: {
        athleteTalkMs: 1_476_000,
        coachTalkMs: 684_000,
        athleteTurns: 20,
        coachTurns: 17,
        athleteSharePercent: 68,
      },
      conversationTone: {
        key: 'open',
        description:
          'Il linguaggio resta descrittivo e orientato a episodi concreti, anche quando emerge un dubbio sulla prestazione.',
        confidence: 'high',
        evidence: evidence(8, athlete.openConcern),
      },
    },
    keyMoments: [
      {
        id: `${prefix}-moment-loop`,
        title: 'L’errore continua mentre l’azione è già cambiata',
        explanation:
          'Il passaggio rende osservabile il problema: non l’errore in sé, ma il tempo in cui continua a occupare l’attenzione.',
        speaker: 'athlete',
        evidence: evidence(4, 'Continuavo a rivedere l’errore'),
        category: 'awareness',
        theme: phase.focus,
        relevance: 3,
      },
      {
        id: `${prefix}-moment-resource`,
        title: 'Una risorsa era già comparsa spontaneamente',
        explanation:
          'La seduta non introduce soltanto una tecnica nuova: riconosce e rende ripetibile qualcosa che ha già funzionato.',
        speaker: 'athlete',
        evidence: evidence(5, athlete.resource),
        category: 'turning_point',
        theme: 'Risorsa disponibile',
        relevance: 3,
      },
      {
        id: `${prefix}-moment-plan`,
        title: 'L’intenzione diventa una prova osservabile',
        explanation:
          'L’impegno ha un contesto e un comportamento verificabile, così la sessione successiva potrà partire da un fatto.',
        speaker: 'coach',
        evidence: evidence(9, phase.commitment),
        category: 'commitment',
        theme: 'Trasferimento in allenamento',
        relevance: 2,
      },
    ],
    missedOpportunities: [
      {
        id: `${prefix}-missed-open`,
        text: 'Il dubbio sul contesto sportivo è emerso, ma merita una domanda più precisa nella prossima seduta.',
        followUp: 'Che cosa temi possa accadere se resti sulla scelta più semplice nel momento importante?',
        evidence: evidence(8, athlete.openConcern),
      },
    ],
    story: {
      title: `Dall’episodio alla prova: ${phase.focus}`,
      paragraphs: [
        {
          id: `${prefix}-story-1`,
          text: `${athlete.firstName} apre con un episodio specifico e distingue ciò che è accaduto dal modo in cui l’attenzione è rimasta sull’errore.`,
          evidence: evidence(2, athlete.errorMoment),
        },
        {
          id: `${prefix}-story-2`,
          text: 'Il racconto individua un tentativo già riuscito e lo tratta come una risorsa da rendere intenzionale.',
          evidence: evidence(5, athlete.resource),
        },
        {
          id: `${prefix}-story-3`,
          text: 'La parte finale traduce l’insight in un compito breve, legato al normale allenamento.',
          evidence: evidence(9, phase.commitment),
        },
      ],
      throughLine:
        'Il percorso sta riducendo la distanza tra il riconoscere la difficoltà e scegliere il gesto successivo.',
    },
    commitments: [
      {
        id: `${prefix}-commitment-athlete`,
        text: phase.commitment,
        owner: 'athlete',
        status: completed ? 'done' : 'in_progress',
        dueDate: isoDate(due),
        evidence: evidence(9, phase.commitment),
      },
      {
        id: `${prefix}-commitment-coach`,
        text: phase.nextStep,
        owner: 'coach',
        status: completed ? 'done' : 'pending',
        dueDate: null,
        evidence: evidence(12, phase.nextStep),
      },
    ],
    nextSessionPrep: [
      {
        id: `${prefix}-prep-practice`,
        text: 'Partire da quante prove sono state fatte e da che cosa è cambiato subito dopo.',
        origin: 'commitment',
        evidence: evidence(9, phase.commitment),
      },
      {
        id: `${prefix}-prep-context`,
        text: 'Riprendere il dubbio emerso sul contesto sportivo senza anticipare una risposta.',
        origin: 'open_question',
        evidence: evidence(8, athlete.openConcern),
      },
      {
        id: `${prefix}-prep-support`,
        text: 'Verificare come trasformare il supporto esterno in un segnale concordato.',
        origin: 'theme',
        evidence: evidence(11, athlete.support),
      },
    ],
    coachNote: null,
    generation: {
      provider: 'kaipai_demo_seed',
      model: 'synthetic-fixture-v1',
      promptVersion: 'demo-experience-v1',
      contractVersion: SESSION_COMPASS_SCHEMA_VERSION,
      generatedAt: new Date(sessionDate.getTime() + 55 * 60_000).toISOString(),
    },
  };

  const issues = validateSessionCompassReport(report, {
    sessionId: String(sessionId),
    sourceFingerprint: fingerprint,
    segments,
  });
  if (issues.length) {
    throw new Error(
      `Session Compass demo non valido (${athlete.key}, fase ${phaseIndex + 1}): ${issues
        .map((issue) => `${issue.path}:${issue.code}`)
        .join(', ')}`
    );
  }
  return report;
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} non configurata.`);
  return value;
}

async function listAllAuthUsers(admin: SupabaseClient) {
  const result: AuthUser[] = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    result.push(...data.users);
    if (data.users.length < 1000) return result;
  }
}

async function ensureAuthUsers(
  password: string,
  resetExistingPasswords = false
): Promise<Map<string, string>> {
  const admin = createClient(
    requiredEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
  const known = new Map(
    (await listAllAuthUsers(admin)).map((user) => [user.email?.toLowerCase() ?? '', user])
  );
  const definitions = [
    { email: COACH.email, displayName: COACH.displayName, demoRole: 'coach', interactive: true },
    ...ATHLETES.map((athlete, index) => ({
      email: athlete.email,
      displayName: `${athlete.firstName} ${athlete.lastName}`,
      demoRole: 'athlete',
      interactive: index === 0,
    })),
  ];
  const ids = new Map<string, string>();

  for (const definition of definitions) {
    const key = definition.email.toLowerCase();
    const existing = known.get(key);
    const appMetadata = {
      kaipai_demo: true,
      demo_readonly: true,
      demo_role: definition.demoRole,
      interactive_demo: definition.interactive,
    };
    if (existing) {
      if (existing.app_metadata?.kaipai_demo !== true) {
        throw new Error(`STOP: ${definition.email} esiste in Auth ma non è marcato come demo.`);
      }
      const metadataUpdate = {
        email_confirm: true,
        app_metadata: { ...existing.app_metadata, ...appMetadata },
        user_metadata: {
          ...existing.user_metadata,
          display_name: definition.displayName,
        },
      };
      const { data, error } = await admin.auth.admin.updateUserById(
        existing.id,
        resetExistingPasswords
          ? { ...metadataUpdate, password }
          : metadataUpdate
      );
      if (error || !data.user) throw error ?? new Error(`Auth update fallito: ${definition.email}`);
      ids.set(key, data.user.id);
      continue;
    }

    const { data, error } = await admin.auth.admin.createUser({
      email: definition.email,
      password,
      email_confirm: true,
      app_metadata: appMetadata,
      user_metadata: { display_name: definition.displayName },
    });
    if (error || !data.user) throw error ?? new Error(`Auth create fallito: ${definition.email}`);
    ids.set(key, data.user.id);
  }
  return ids;
}

async function ensureAppUser(params: {
  authId: string;
  email: string;
  firstName: string;
  lastName: string;
  avatarUrl: string;
  bio: string;
  role: 'coach' | 'athlete';
}) {
  const [existing] = await db.select().from(users).where(eq(users.email, params.email)).limit(1);
  if (existing && existing.authId !== params.authId) {
    throw new Error(`STOP: ${params.email} esiste nel DB con una identità Auth diversa.`);
  }
  const [user] = await db
    .insert(users)
    .values({
      authId: params.authId,
      email: params.email,
      name: params.firstName,
      lastName: params.lastName,
      role: 'owner',
      isDemo: true,
    })
    .onConflictDoUpdate({
      target: users.email,
      set: {
        authId: params.authId,
        name: params.firstName,
        lastName: params.lastName,
        isDemo: true,
        deletedAt: null,
        updatedAt: new Date(),
      },
    })
    .returning();
  await db
    .insert(profiles)
    .values({
      userId: user.id,
      displayName: `${params.firstName} ${params.lastName}`,
      avatarUrl: params.avatarUrl,
      bio: params.bio,
      locale: 'it',
    })
    .onConflictDoUpdate({
      target: profiles.userId,
      set: {
        displayName: `${params.firstName} ${params.lastName}`,
        avatarUrl: params.avatarUrl,
        bio: params.bio,
        locale: 'it',
        updatedAt: new Date(),
      },
    });
  await db
    .insert(userRoles)
    .values({ userId: user.id, roleKey: params.role })
    .onConflictDoNothing();
  await db
    .insert(userOnboarding)
    .values({ userId: user.id, status: 'completed', step: 4, completedAt: new Date() })
    .onConflictDoUpdate({
      target: userOnboarding.userId,
      set: { status: 'completed', step: 4, completedAt: new Date(), updatedAt: new Date() },
    });

  const [membership] = await db
    .select({ id: teamMembers.id })
    .from(teamMembers)
    .where(eq(teamMembers.userId, user.id))
    .limit(1);
  if (!membership) {
    const [team] = await db
      .insert(teams)
      .values({ name: `Demo · ${params.firstName} ${params.lastName}` })
      .returning();
    await db.insert(teamMembers).values({ teamId: team.id, userId: user.id, role: 'owner' });
  }
  return user;
}

async function ensureBooking(params: {
  athleteId: number;
  providerId: number;
  serviceId: number;
  demoKey: string;
  status: 'completed' | 'accepted';
  scheduledFor: Date;
  note: string;
}) {
  const marker = `[DEMO:${params.demoKey}] ${params.note}`;
  const [existing] = await db
    .select()
    .from(bookings)
    .where(
      and(
        eq(bookings.clientId, params.athleteId),
        eq(bookings.providerId, params.providerId),
        eq(bookings.note, marker)
      )
    )
    .limit(1);
  const end = new Date(params.scheduledFor.getTime() + 52 * 60_000);
  const values = {
    clientId: params.athleteId,
    providerId: params.providerId,
    serviceId: params.serviceId,
    status: params.status,
    note: marker,
    scheduledFor: params.scheduledFor,
    durationMin: 60,
    requestedAt: new Date(params.scheduledFor.getTime() - 9 * 24 * 60 * 60_000),
    decidedAt: new Date(params.scheduledFor.getTime() - 8 * 24 * 60 * 60_000),
    completedAt: params.status === 'completed' ? end : null,
    sessionStartedAt: params.status === 'completed' ? params.scheduledFor : null,
    sessionEndedAt: params.status === 'completed' ? end : null,
  };
  if (existing) {
    const [updated] = await db.update(bookings).set(values).where(eq(bookings.id, existing.id)).returning();
    return updated;
  }
  const [created] = await db.insert(bookings).values(values).returning();
  return created;
}

async function ensureMessage(params: {
  bookingId: number;
  senderId: number;
  body: string;
  createdAt: Date;
}) {
  const [existing] = await db
    .select({ id: messages.id })
    .from(messages)
    .where(
      and(
        eq(messages.bookingId, params.bookingId),
        eq(messages.senderId, params.senderId),
        eq(messages.body, params.body)
      )
    )
    .limit(1);
  if (!existing) await db.insert(messages).values(params);
}

async function seedCompletedSession(params: {
  athlete: DemoAthlete;
  athleteId: number;
  coachId: number;
  providerId: number;
  serviceId: number;
  phaseIndex: number;
  scheduledFor: Date;
}) {
  const { athlete, athleteId, coachId, providerId, serviceId, phaseIndex, scheduledFor } =
    params;
  const phase = PHASES[phaseIndex];
  const demoKey = `${athlete.key}-session-${phaseIndex + 1}`;
  const booking = await ensureBooking({
    athleteId,
    providerId,
    serviceId,
    demoKey,
    status: 'completed',
    scheduledFor,
    note: phase.focus,
  });

  const [existingSession] = await db
    .select()
    .from(sessionAiNotes)
    .where(eq(sessionAiNotes.bookingId, booking.id))
    .limit(1);
  const sessionValues = {
    bookingId: booking.id,
    livekitRoomName: `booking-${booking.id}`,
    requestedBy: coachId,
    status: 'approved',
    consentRequired: true,
    startedAt: booking.sessionStartedAt,
    endedAt: booking.sessionEndedAt,
    processingStartedAt: new Date((booking.sessionEndedAt ?? scheduledFor).getTime() + 60_000),
    processingCompletedAt: new Date((booking.sessionEndedAt ?? scheduledFor).getTime() + 8 * 60_000),
    metadata: { demo: true, demoKey, synthetic: true },
    createdBy: coachId,
    updatedBy: coachId,
  };
  const [session] = existingSession
    ? await db.update(sessionAiNotes).set(sessionValues).where(eq(sessionAiNotes.id, existingSession.id)).returning()
    : await db.insert(sessionAiNotes).values(sessionValues).returning();

  const consentHash = sha256('KaiPai demo consent fixture v1');
  for (const [userId, participantRole] of [
    [coachId, 'coach'],
    [athleteId, 'athlete'],
  ] as const) {
    await db
      .insert(sessionAiConsents)
      .values({
        sessionAiNotesId: session.id,
        userId,
        participantRole,
        consentStatus: 'accepted',
        consentVersion: 'demo-v1',
        consentTextHash: consentHash,
        consentedAt: scheduledFor,
        ipMetadata: { demo: true },
        userAgentMetadata: { demo: true },
        createdBy: userId,
        updatedBy: userId,
      })
      .onConflictDoUpdate({
        target: [sessionAiConsents.sessionAiNotesId, sessionAiConsents.userId],
        set: { consentStatus: 'accepted', consentedAt: scheduledFor, updatedBy: userId },
      });
  }

  const recordingIds = new Map<'coach' | 'athlete', number>();
  for (const [userId, participantRole] of [
    [coachId, 'coach'],
    [athleteId, 'athlete'],
  ] as const) {
    const [recording] = await db
      .insert(sessionParticipantRecordings)
      .values({
        sessionAiNotesId: session.id,
        participantUserId: userId,
        participantRole,
        status: 'recorded',
        aggregateStartedAt: scheduledFor,
        aggregateEndedAt: booking.sessionEndedAt,
        aggregateDurationSeconds: 2_520,
        segmentCount: 1,
        metadata: { demo: true, synthetic: true },
        createdBy: userId,
        updatedBy: userId,
      })
      .onConflictDoUpdate({
        target: [
          sessionParticipantRecordings.sessionAiNotesId,
          sessionParticipantRecordings.participantUserId,
        ],
        set: {
          status: 'recorded',
          aggregateStartedAt: scheduledFor,
          aggregateEndedAt: booking.sessionEndedAt,
          aggregateDurationSeconds: 2_520,
          segmentCount: 1,
          updatedBy: userId,
        },
      })
      .returning();
    recordingIds.set(participantRole, recording.id);
  }

  const insertedSegments: CompassSourceSegment[] = [];
  const drafts = transcriptFor(athlete, phase);
  for (const [index, draft] of drafts.entries()) {
    const participantUserId = draft.speaker === 'coach' ? coachId : athleteId;
    const participantRecordingId = recordingIds.get(draft.speaker)!;
    const providerSegmentId = `demo-${demoKey}-${index + 1}`;
    const [existing] = await db
      .select()
      .from(sessionTranscriptSegments)
      .where(
        and(
          eq(sessionTranscriptSegments.sessionAiNotesId, session.id),
          eq(sessionTranscriptSegments.provider, 'kaipai_demo'),
          eq(sessionTranscriptSegments.providerSegmentId, providerSegmentId)
        )
      )
      .limit(1);
    const values = {
      sessionAiNotesId: session.id,
      participantRecordingId,
      participantUserId,
      speakerRole: draft.speaker,
      sequenceNumber: index,
      startedAtMs: draft.startMs,
      endedAtMs: draft.endMs,
      text: draft.text,
      isFinal: true,
      confidence: 0.97,
      provider: 'kaipai_demo',
      providerModel: 'synthetic-fixture-v1',
      providerSegmentId,
      normalizationStatus: 'normalized',
      metadata: { demo: true, synthetic: true },
      createdBy: coachId,
      updatedBy: coachId,
    };
    const [segment] = existing
      ? await db.update(sessionTranscriptSegments).set(values).where(eq(sessionTranscriptSegments.id, existing.id)).returning()
      : await db.insert(sessionTranscriptSegments).values(values).returning();
    await db
      .insert(sessionTranscriptTimelineSegments)
      .values({
        sessionAiNotesId: session.id,
        participantRecordingId,
        participantUserId,
        participantRole: draft.speaker,
        sourceTranscriptSegmentId: segment.id,
        globalSequence: index,
        participantSequence: drafts.slice(0, index + 1).filter((item) => item.speaker === draft.speaker).length - 1,
        startMs: draft.startMs,
        endMs: draft.endMs,
        normalizedText: draft.text,
        normalizationFlags: { syntheticDemo: true },
        sourceProvider: 'kaipai_demo',
        sourceModel: 'synthetic-fixture-v1',
        createdBy: coachId,
        updatedBy: coachId,
      })
      .onConflictDoUpdate({
        target: sessionTranscriptTimelineSegments.sourceTranscriptSegmentId,
        set: {
          globalSequence: index,
          startMs: draft.startMs,
          endMs: draft.endMs,
          normalizedText: draft.text,
          updatedBy: coachId,
        },
      });
    insertedSegments.push({
      transcriptSegmentId: segment.id,
      startMs: draft.startMs,
      endMs: draft.endMs,
      speaker: draft.speaker,
      text: draft.text,
    });
  }

  const fingerprint = sourceFingerprint(insertedSegments);
  const report = reportFor({
    athlete,
    phase,
    phaseIndex,
    sessionId: session.id,
    sessionDate: scheduledFor,
    fingerprint,
    segments: insertedSegments,
  });
  const reportValues = {
    sessionAiNotesId: session.id,
    reportKind: SESSION_COMPASS_REPORT_KIND,
    status: 'approved',
    reportVersion: 1,
    sourceFingerprint: fingerprint,
    generatedReportJson: report as unknown as Record<string, unknown>,
    coachEditedReportJson: null,
    privateCoachNotes: `Nota demo — ${athlete.firstName} ha risposto bene alle domande concrete. Riprendere il trasferimento nel ${athlete.sportLabel} senza aggiungere nuovi strumenti prima di verificare quello concordato.`,
    generatedByProvider: 'kaipai_demo_seed',
    generatedByModel: 'synthetic-fixture-v1',
    promptVersion: 'demo-experience-v1',
    approvedBy: coachId,
    approvedAt: new Date(scheduledFor.getTime() + 24 * 60 * 60_000),
    metadata: { demo: true, synthetic: true, demoKey },
    createdBy: coachId,
    updatedBy: coachId,
  };
  const [storedReport] = await db
    .insert(sessionAiReports)
    .values(reportValues)
    .onConflictDoUpdate({
      target: [
        sessionAiReports.sessionAiNotesId,
        sessionAiReports.reportKind,
        sessionAiReports.reportVersion,
      ],
      set: reportValues,
    })
    .returning();

  for (const [index, commitment] of report.commitments.entries()) {
    const source = insertedSegments.find(
      (segment) => segment.transcriptSegmentId === commitment.evidence.transcriptSegmentId
    )!;
    const status = commitment.status === 'done' ? 'completed' : commitment.status;
    const completedAt = status === 'completed' ? new Date(scheduledFor.getTime() + 5 * 24 * 60 * 60_000) : null;
    await db
      .insert(sessionAiCommitments)
      .values({
        sessionAiNotesId: session.id,
        sourceReportId: storedReport.id,
        sourceReportVersion: 1,
        athleteUserId: athleteId,
        coachUserId: coachId,
        commitmentKey: sha256(`${demoKey}:${commitment.id}:${index}`),
        title: commitment.text,
        owner: commitment.owner,
        status,
        dueDate: commitment.dueDate,
        completedAt,
        sourceTranscriptSegmentId: source.transcriptSegmentId,
        sourceTimestampMs: source.startMs,
        sourceExcerpt: commitment.evidence.quote,
        manuallyEdited: index === 0 && phaseIndex === athlete.sessions - 1,
        createdBy: coachId,
        updatedBy: coachId,
      })
      .onConflictDoUpdate({
        target: [sessionAiCommitments.sessionAiNotesId, sessionAiCommitments.commitmentKey],
        set: {
          title: commitment.text,
          status,
          dueDate: commitment.dueDate,
          completedAt,
          sourceTranscriptSegmentId: source.transcriptSegmentId,
          updatedBy: coachId,
        },
      });
  }

  for (const [atMs, note] of [
    [drafts[3].startMs, 'Qui cambia il modo in cui descrive l’errore.'],
    [drafts[7].startMs, 'Tema da riaprire senza anticipare la risposta.'],
  ] as const) {
    const [bookmark] = await db
      .select({ id: sessionCoachBookmarks.id })
      .from(sessionCoachBookmarks)
      .where(
        and(
          eq(sessionCoachBookmarks.sessionAiNotesId, session.id),
          eq(sessionCoachBookmarks.atMs, atMs)
        )
      )
      .limit(1);
    if (!bookmark) {
      await db.insert(sessionCoachBookmarks).values({
        sessionAiNotesId: session.id,
        atMs,
        note,
        createdBy: coachId,
        updatedBy: coachId,
      });
    }
  }

  for (const eventType of ['compass_report_generated', 'compass_report_approved'] as const) {
    const [event] = await db
      .select({ id: sessionAiAuditEvents.id })
      .from(sessionAiAuditEvents)
      .where(
        and(
          eq(sessionAiAuditEvents.sessionAiNotesId, session.id),
          eq(sessionAiAuditEvents.eventType, eventType)
        )
      )
      .limit(1);
    if (!event) {
      await db.insert(sessionAiAuditEvents).values({
        sessionAiNotesId: session.id,
        eventType,
        actorUserId: coachId,
        eventMetadata: { demo: true, synthetic: true, reportId: storedReport.id },
        createdBy: coachId,
        updatedBy: coachId,
      });
    }
  }
  return { booking, session, report: storedReport };
}

async function seedDatabase(authIds: Map<string, string>) {
  await db
    .insert(roles)
    .values([
      { key: 'coach', label: 'Coach' },
      { key: 'athlete', label: 'Athlete' },
    ])
    .onConflictDoNothing();

  const coach = await ensureAppUser({
    authId: authIds.get(COACH.email)!,
    email: COACH.email,
    firstName: COACH.firstName,
    lastName: COACH.lastName,
    avatarUrl: COACH.avatarUrl,
    bio:
      'Mental coach sportivo specializzato in gestione della pressione, routine di gara e continuità della prestazione. Profilo e dati interamente sintetici per la demo KaiPai.',
    role: 'coach',
  });
  const [provider] = await db
    .insert(providerProfiles)
    .values({
      userId: coach.id,
      slug: 'alessandro-riva-demo',
      headline: 'Mental coach per performance, focus e gestione della pressione',
      description:
        'Accompagno atleti individuali e di squadra nella costruzione di routine mentali semplici, verificabili e trasferibili in gara.',
      specialties: ['performance_anxiety', 'focus_concentration', 'pre_competition_routine', 'confidence'],
      categories: ['football', 'tennis', 'curling', 'martial_arts', 'skiing'],
      hourlyRate: 7500,
      currency: 'EUR',
      status: 'approved',
      isKaipaiCertified: true,
      yearsExperience: 11,
      coachSince: '2015-01-01',
      languages: ['Italiano', 'Inglese'],
      certifications: ['KaiPai Academy · Mental Coaching Sportivo', 'Master in Psicologia dello Sport'],
      athleteLevels: ['amateur', 'semi_pro', 'pro'],
      identityVerified: true,
      certificationsVerified: true,
      submittedAt: atDaysFromNow(-500),
      reviewedAt: atDaysFromNow(-495),
      createdBy: coach.id,
      updatedBy: coach.id,
    })
    .onConflictDoUpdate({
      target: providerProfiles.userId,
      set: {
        slug: 'alessandro-riva-demo',
        headline: 'Mental coach per performance, focus e gestione della pressione',
        description:
          'Accompagno atleti individuali e di squadra nella costruzione di routine mentali semplici, verificabili e trasferibili in gara.',
        specialties: ['performance_anxiety', 'focus_concentration', 'pre_competition_routine', 'confidence'],
        categories: ['football', 'tennis', 'curling', 'martial_arts', 'skiing'],
        hourlyRate: 7500,
        status: 'approved',
        isKaipaiCertified: true,
        yearsExperience: 11,
        coachSince: '2015-01-01',
        languages: ['Italiano', 'Inglese'],
        certifications: ['KaiPai Academy · Mental Coaching Sportivo', 'Master in Psicologia dello Sport'],
        athleteLevels: ['amateur', 'semi_pro', 'pro'],
        identityVerified: true,
        certificationsVerified: true,
        updatedBy: coach.id,
      },
    })
    .returning();

  const serviceDefinitions = [
    {
      title: 'Sessione individuale · Performance',
      description: '60 minuti su obiettivi, routine e trasferimento in allenamento.',
      durationMin: 60,
      price: 7500,
    },
    {
      title: 'Check-in pre-gara',
      description: '40 minuti per preparare focus, attivazione e piano mentale.',
      durationMin: 40,
      price: 5500,
    },
  ];
  const serviceIds: number[] = [];
  for (const definition of serviceDefinitions) {
    const [existing] = await db
      .select()
      .from(services)
      .where(and(eq(services.providerId, provider.id), eq(services.title, definition.title)))
      .limit(1);
    const [service] = existing
      ? await db.update(services).set({ ...definition, isActive: true }).where(eq(services.id, existing.id)).returning()
      : await db.insert(services).values({ providerId: provider.id, ...definition }).returning();
    serviceIds.push(service.id);
  }

  await db
    .insert(userFeatureEntitlements)
    .values({
      userId: coach.id,
      featureCode: 'AI_SESSION_NOTES',
      status: 'enabled',
      source: 'system',
      startsAt: atDaysFromNow(-500),
      metadata: { demo: true, readonly: true },
      createdBy: coach.id,
      updatedBy: coach.id,
    })
    .onConflictDoUpdate({
      target: [userFeatureEntitlements.userId, userFeatureEntitlements.featureCode],
      set: { status: 'enabled', source: 'system', metadata: { demo: true, readonly: true } },
    });
  await db
    .insert(coachAvailability)
    .values([
      { providerId: provider.id, weekday: 1, startMinute: 960, endMinute: 1200 },
      { providerId: provider.id, weekday: 3, startMinute: 960, endMinute: 1200 },
      { providerId: provider.id, weekday: 5, startMinute: 840, endMinute: 1080 },
    ])
    .onConflictDoNothing();

  const athleteRows = new Map<string, Awaited<ReturnType<typeof ensureAppUser>>>();
  const completedByAthlete = new Map<string, Awaited<ReturnType<typeof seedCompletedSession>>[]>();
  const offsets = [-104, -76, -48, -20];

  for (const athlete of ATHLETES) {
    const user = await ensureAppUser({
      authId: authIds.get(athlete.email)!,
      email: athlete.email,
      firstName: athlete.firstName,
      lastName: athlete.lastName,
      avatarUrl: athlete.avatarUrl,
      bio: `${athlete.firstName} pratica ${athlete.sportLabel}. Profilo e dati interamente sintetici per la demo KaiPai.`,
      role: 'athlete',
    });
    athleteRows.set(athlete.key, user);
    await db
      .insert(clientProfiles)
      .values({
        userId: user.id,
        category: athlete.sport,
        level: athlete.level,
        goals: athlete.goals,
        city: athlete.city,
        birthDate: athlete.birthDate,
        createdBy: user.id,
        updatedBy: user.id,
      })
      .onConflictDoUpdate({
        target: clientProfiles.userId,
        set: {
          category: athlete.sport,
          level: athlete.level,
          goals: athlete.goals,
          city: athlete.city,
          birthDate: athlete.birthDate,
          updatedBy: user.id,
        },
      });

    const journeyGoals = [
      { title: PHASES[1].focus, status: 'in_miglioramento', isPrimary: true, themeKey: 'routine-reset' },
      { title: PHASES[2].focus, status: 'in_corso', isPrimary: false, themeKey: 'dialogo-interno' },
      { title: 'Comunicare bisogni e segnali utili allo staff', status: 'da_riprendere', isPrimary: false, themeKey: 'supporto' },
    ] as const;
    // Gli id servono piu' sotto: gli agganci si scrivono quando le sedute
    // esistono, e le sedute nascono dopo gli obiettivi.
    const goalIds: number[] = [];
    for (const [position, goal] of journeyGoals.entries()) {
      const [existingGoal] = await db
        .select({ id: athleteJourneyGoals.id })
        .from(athleteJourneyGoals)
        .where(
          and(
            eq(athleteJourneyGoals.athleteUserId, user.id),
            eq(athleteJourneyGoals.coachUserId, coach.id),
            eq(athleteJourneyGoals.title, goal.title)
          )
        )
        .limit(1);
      if (existingGoal) {
        await db
          .update(athleteJourneyGoals)
          .set({ ...goal, position, updatedBy: coach.id })
          .where(eq(athleteJourneyGoals.id, existingGoal.id));
        goalIds.push(existingGoal.id);
      } else {
        const [createdGoal] = await db
          .insert(athleteJourneyGoals)
          .values({
            athleteUserId: user.id,
            coachUserId: coach.id,
            ...goal,
            position,
            createdBy: coach.id,
            updatedBy: coach.id,
          })
          .returning({ id: athleteJourneyGoals.id });
        goalIds.push(createdGoal.id);
      }
    }

    const completed = [];
    for (let phaseIndex = 0; phaseIndex < athlete.sessions; phaseIndex += 1) {
      completed.push(
        await seedCompletedSession({
          athlete,
          athleteId: user.id,
          coachId: coach.id,
          providerId: provider.id,
          serviceId: serviceIds[0],
          phaseIndex,
          scheduledFor: atDaysFromNow(offsets[phaseIndex], 17 + (phaseIndex % 2)),
        })
      );
    }
    completedByAthlete.set(athlete.key, completed);

    /**
     * Gli agganci fra obiettivo e seduta.
     *
     * Vanno scritti qui perche' prima le sedute non esistono. E vanno scritti
     * **esplicitamente**: finche' l'aggancio si deduceva dai temi bastava
     * seminare `themeKey`, ma quel meccanismo non ne ha mai prodotto uno solo
     * in produzione ed e' stato tolto. Senza queste righe la demo mostrerebbe
     * tre tracce di pallini spenti con «nessuna seduta agganciata» — su una
     * pagina che serve a far vedere il prodotto.
     *
     * La distribuzione non e' casuale, rispecchia lo stato dichiarato: il
     * primo obiettivo e' «in miglioramento» e attraversa tutto il percorso, il
     * secondo e' «in corso» e parte a meta', il terzo e' «da riprendere» e si
     * ferma all'inizio — che e' esattamente cio' che quella dicitura racconta.
     */
    const linksByGoal: ReadonlyArray<(index: number) => boolean> = [
      () => true,
      (index) => index >= Math.floor(completed.length / 2),
      (index) => index === 0,
    ];
    for (const [goalIndex, goalId] of goalIds.entries()) {
      const belongs = linksByGoal[goalIndex] ?? (() => false);
      const sessionIds = completed
        .filter((_, index) => belongs(index))
        .map((entry) => entry.session.id);
      if (sessionIds.length === 0) continue;

      await db
        .insert(athleteJourneyGoalSessions)
        .values(
          sessionIds.map((sessionAiNotesId) => ({
            goalId,
            sessionAiNotesId,
            source: 'coach',
            createdBy: coach.id,
          }))
        )
        .onConflictDoNothing();
    }

    const upcoming = await ensureBooking({
      athleteId: user.id,
      providerId: provider.id,
      serviceId: serviceIds[phaseIndexForUpcoming(athlete) % serviceIds.length],
      demoKey: `${athlete.key}-upcoming`,
      status: 'accepted',
      scheduledFor: atDaysFromNow(5 + ATHLETES.indexOf(athlete) * 4, 17),
      note: `Verifica e consolidamento · ${PHASES[Math.min(athlete.sessions, 3)].focus}`,
    });
    const chatStart = new Date(upcoming.scheduledFor!.getTime() - 3 * 24 * 60 * 60_000);
    await ensureMessage({
      bookingId: upcoming.id,
      senderId: coach.id,
      body: `Ciao ${athlete.firstName}, per la prossima sessione porta un episodio recente in cui hai usato la routine.`,
      createdAt: chatStart,
    });
    await ensureMessage({
      bookingId: upcoming.id,
      senderId: user.id,
      body: 'Perfetto, ne ho già segnato uno dopo l’ultimo allenamento.',
      createdAt: new Date(chatStart.getTime() + 14 * 60_000),
    });
    await ensureMessage({
      bookingId: upcoming.id,
      senderId: coach.id,
      body: 'Ottimo. Non serve preparare altro: partiremo da quello che è successo davvero.',
      createdAt: new Date(chatStart.getTime() + 20 * 60_000),
    });

    const latest = completed.at(-1)!;
    await db
      .insert(reviews)
      .values({
        providerId: provider.id,
        bookingId: latest.booking.id,
        authorId: user.id,
        rating: ATHLETES.indexOf(athlete) === 1 ? 4 : 5,
        body: athlete.review,
        reply: `Grazie ${athlete.firstName}. Continuiamo a verificare gli strumenti nei contesti reali, un passo alla volta.`,
        replyAt: new Date(latest.booking.completedAt!.getTime() + 2 * 24 * 60 * 60_000),
        createdAt: new Date(latest.booking.completedAt!.getTime() + 24 * 60 * 60_000),
      })
      .onConflictDoUpdate({
        target: reviews.bookingId,
        set: {
          rating: ATHLETES.indexOf(athlete) === 1 ? 4 : 5,
          body: athlete.review,
          reply: `Grazie ${athlete.firstName}. Continuiamo a verificare gli strumenti nei contesti reali, un passo alla volta.`,
        },
      });
  }

  await ensureNotification({
    userId: coach.id,
    type: 'booking_accepted',
    title: 'Prossime sessioni confermate',
    body: `Hai ${ATHLETES.length} sessioni demo in calendario con ${ATHLETES.map((athlete) => athlete.firstName).join(', ')}.`,
    marker: 'coach-upcoming',
  });
  await ensureNotification({
    userId: coach.id,
    type: 'ai_notes_ready',
    title: 'Session Compass aggiornati',
    body: `I percorsi dei ${ATHLETES.length} atleti includono trascrizioni, metriche, impegni e note.`,
    marker: 'coach-compass',
  });
  const mainAthlete = athleteRows.get('giulia')!;
  await ensureNotification({
    userId: mainAthlete.id,
    type: 'booking_accepted',
    title: 'Sessione confermata con Alessandro',
    body: 'Il prossimo incontro è già nel tuo calendario KaiPai.',
    marker: 'athlete-upcoming',
  });
  await ensureNotification({
    userId: mainAthlete.id,
    type: 'commitment_reminder',
    title: 'Routine di reset',
    body: 'Hai una prova da completare nel prossimo allenamento.',
    marker: 'athlete-commitment',
  });

  return {
    coach,
    provider,
    athleteRows,
    completedByAthlete,
    sessions: [...completedByAthlete.values()].reduce((sum, value) => sum + value.length, 0),
  };
}

function phaseIndexForUpcoming(athlete: DemoAthlete): number {
  return Math.min(athlete.sessions, PHASES.length - 1);
}

async function ensureNotification(params: {
  userId: number;
  type: string;
  title: string;
  body: string;
  marker: string;
}) {
  const [existing] = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, params.userId),
        eq(notifications.title, params.title)
      )
    )
    .limit(1);
  if (!existing) {
    await db.insert(notifications).values({
      userId: params.userId,
      type: params.type,
      title: params.title,
      body: params.body,
      data: { demo: true, marker: params.marker },
    });
    return;
  }
  await db
    .update(notifications)
    .set({ type: params.type, body: params.body, data: { demo: true, marker: params.marker } })
    .where(eq(notifications.id, existing.id));
}

async function verifySeed() {
  const expectedEmails = [COACH.email, ...ATHLETES.map((athlete) => athlete.email)];
  const allUsers = await Promise.all(
    expectedEmails.map(async (email) => {
      const [row] = await db
        .select({ id: users.id, email: users.email })
        .from(users)
        .where(eq(users.email, email))
        .limit(1);
      return row ?? null;
    })
  );
  if (allUsers.some((row) => row === null)) {
    throw new Error('Verifica fallita: almeno un utente demo applicativo è assente.');
  }
  const coach = allUsers[0]!;
  if (!coach) throw new Error('Verifica fallita: coach demo assente.');
  const [provider] = await db
    .select({ id: providerProfiles.id })
    .from(providerProfiles)
    .where(eq(providerProfiles.userId, coach.id))
    .limit(1);
  if (!provider) throw new Error('Verifica fallita: provider demo assente.');
  const sessionRows = await db
    .select({ id: sessionAiNotes.id })
    .from(sessionAiNotes)
    .innerJoin(bookings, eq(bookings.id, sessionAiNotes.bookingId))
    .where(eq(bookings.providerId, provider.id));
  const reportRows = await db
    .select({ id: sessionAiReports.id })
    .from(sessionAiReports)
    .innerJoin(sessionAiNotes, eq(sessionAiNotes.id, sessionAiReports.sessionAiNotesId))
    .innerJoin(bookings, eq(bookings.id, sessionAiNotes.bookingId))
    .where(eq(bookings.providerId, provider.id));
  const transcriptRows = await db
    .select({ id: sessionTranscriptTimelineSegments.id })
    .from(sessionTranscriptTimelineSegments)
    .innerJoin(sessionAiNotes, eq(sessionAiNotes.id, sessionTranscriptTimelineSegments.sessionAiNotesId))
    .innerJoin(bookings, eq(bookings.id, sessionAiNotes.bookingId))
    .where(eq(bookings.providerId, provider.id));
  const expectedSessions = ATHLETES.reduce((sum, athlete) => sum + athlete.sessions, 0);
  if (sessionRows.length !== expectedSessions || reportRows.length !== expectedSessions) {
    throw new Error(
      `Verifica fallita: attese ${expectedSessions} sessioni/report, trovate ${sessionRows.length}/${reportRows.length}.`
    );
  }
  if (transcriptRows.length !== expectedSessions * 12) {
    throw new Error(
      `Verifica fallita: attesi ${expectedSessions * 12} segmenti timeline, trovati ${transcriptRows.length}.`
    );
  }
  const bookingRows = await db
    .select({ id: bookings.id, status: bookings.status })
    .from(bookings)
    .where(eq(bookings.providerId, provider.id));
  const reviewRows = await db
    .select({ id: reviews.id })
    .from(reviews)
    .where(eq(reviews.providerId, provider.id));
  const goalCounts = await Promise.all(
    allUsers.slice(1).map((athlete) =>
      db
        .select({ id: athleteJourneyGoals.id })
        .from(athleteJourneyGoals)
        .where(
          and(
            eq(athleteJourneyGoals.athleteUserId, athlete!.id),
            eq(athleteJourneyGoals.coachUserId, coach.id)
          )
        )
    )
  );
  const messageCounts = await Promise.all(
    bookingRows
      .filter((booking) => booking.status === 'accepted')
      .map((booking) =>
        db
          .select({ id: messages.id })
          .from(messages)
          .where(eq(messages.bookingId, booking.id))
      )
  );
  const completedBookings = bookingRows.filter((booking) => booking.status === 'completed').length;
  const upcomingBookings = bookingRows.filter((booking) => booking.status === 'accepted').length;
  const goals = goalCounts.reduce((sum, rows) => sum + rows.length, 0);
  const chatMessages = messageCounts.reduce((sum, rows) => sum + rows.length, 0);
  if (
    completedBookings !== expectedSessions ||
    upcomingBookings !== ATHLETES.length ||
    reviewRows.length !== ATHLETES.length ||
    goals !== ATHLETES.length * 3 ||
    chatMessages !== ATHLETES.length * 3
  ) {
    throw new Error(
      `Verifica fallita sui contenuti: booking ${completedBookings}/${upcomingBookings}, recensioni ${reviewRows.length}, obiettivi ${goals}, messaggi ${chatMessages}.`
    );
  }

  const admin = createClient(
    requiredEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
  const authUsers = new Map(
    (await listAllAuthUsers(admin)).map((user) => [user.email?.toLowerCase() ?? '', user])
  );
  for (const email of expectedEmails) {
    const authUser = authUsers.get(email);
    if (
      !authUser ||
      authUser.app_metadata?.kaipai_demo !== true ||
      authUser.app_metadata?.demo_readonly !== true
    ) {
      throw new Error(`Verifica Auth fallita per ${email}.`);
    }
  }
  return {
    interactiveAccounts: [...INTERACTIVE_EMAILS],
    authIdentities: expectedEmails.length,
    syntheticSupportAthletes: ATHLETES.length - 1,
    athletes: ATHLETES.length,
    completedSessions: completedBookings,
    reports: reportRows.length,
    transcriptSegments: transcriptRows.length,
    upcomingSessions: upcomingBookings,
    journeyGoals: goals,
    chatMessages,
    reviews: reviewRows.length,
  };
}

/**
 * Valida tutto il contenuto prima di aprire una connessione in scrittura.
 * Gli id reali cambieranno nel DB, ma il contratto verifica gli stessi testi,
 * speaker, tempi, evidenze e metadati che verranno poi persistiti.
 */
function validateDataset(): number {
  let sessionId = 10_000;
  let transcriptSegmentId = 100_000;
  let reports = 0;
  for (const athlete of ATHLETES) {
    for (let phaseIndex = 0; phaseIndex < athlete.sessions; phaseIndex += 1) {
      const phase = PHASES[phaseIndex];
      const segments = transcriptFor(athlete, phase).map((segment) => ({
        ...segment,
        transcriptSegmentId: transcriptSegmentId++,
      }));
      const fingerprint = sourceFingerprint(segments);
      reportFor({
        athlete,
        phase,
        phaseIndex,
        sessionId: sessionId++,
        sessionDate: atDaysFromNow(-20 - phaseIndex * 28),
        fingerprint,
        segments,
      });
      reports += 1;
    }
  }
  return reports;
}

async function main() {
  const flags = new Set(process.argv.slice(2));
  const validatedReports = validateDataset();
  if (flags.has('--verify')) {
    console.log(JSON.stringify({ ...(await verifySeed()), validatedReports }, null, 2));
    return;
  }
  if (!flags.has('--apply')) {
    console.log(
      JSON.stringify(
        {
          mode: 'dry-run',
          productionWrite: false,
          interactiveAccounts: [...INTERACTIVE_EMAILS],
          authIdentities: 1 + ATHLETES.length,
          athletesVisibleToCoach: ATHLETES.length,
          completedSessions: ATHLETES.reduce((sum, athlete) => sum + athlete.sessions, 0),
          validatedReports,
          upcomingSessions: ATHLETES.length,
          transcriptSegments: ATHLETES.reduce((sum, athlete) => sum + athlete.sessions * 12, 0),
          note: `Per applicare: imposta ${DEMO_PASSWORD_ENV} e aggiungi --apply.`,
        },
        null,
        2
      )
    );
    return;
  }

  const password = requiredEnv(DEMO_PASSWORD_ENV);
  if (password.length < 16) {
    throw new Error(`${DEMO_PASSWORD_ENV} deve contenere almeno 16 caratteri.`);
  }
  const authIds = await ensureAuthUsers(password, flags.has('--reset-passwords'));
  const result = await seedDatabase(authIds);
  const verification = await verifySeed();
  console.log(
    JSON.stringify(
      {
        applied: true,
        coachUserId: result.coach.id,
        providerId: result.provider.id,
        ...verification,
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.end();
  });
