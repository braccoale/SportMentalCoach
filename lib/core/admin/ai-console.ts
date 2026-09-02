import 'server-only';
import { sql, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { romeDayValueToInstant } from './period';
import type { AdminPeriod } from './period';
import { readAiCostRates, estimateAiCost, type AiCostRates } from './ai-cost';
import {
  AI_CONSOLE_PAGE_SIZE,
  STUCK_RULE,
  aiConsoleOffset,
  classifyPipelineSession,
  retryAvailability,
  type AiConsoleFilters,
  type PipelineClassification,
  type PipelineJobSummary,
} from './ai-console-policy';

/**
 * La console della pipeline Appunti AI: elenco, dettaglio e numeri.
 *
 * **Che cosa non esce da qui, mai.** Nessun testo di trascrizione, nessun
 * riepilogo, nessuna nota del coach, nessun nome dell'atleta. Identificativi,
 * stati, tempi, durate, codici e conteggi. È la stessa regola di
 * `session-outcome-report.ts`, e vale di più su una pagina: il coach è un
 * professionista sulla propria seduta e si nomina; l'atleta resta un numero,
 * e quel numero basta a ritrovarlo in database quando serve davvero.
 *
 * **Come si legge una pagina.** Un unico giro di query con CTE, poi
 * `LIMIT`/`OFFSET`: niente elenco caricato in memoria e contato in
 * JavaScript, e niente una-query-per-riga. Le sottoletture sono ristrette
 * alle sole sedute della finestra, non all'intera tabella dei job.
 *
 * **Una duplicazione dichiarata.** Il filtro per stato deve vivere in SQL —
 * altrimenti la paginazione conta righe che poi vengono scartate — mentre lo
 * stato mostrato lo decide `classifyPipelineSession`, che è puro e provato.
 * Sono due espressioni della stessa regola, e per non farle divergere
 * **partono dagli stessi fatti** (`active_jobs`, `last_progress`) e dalle
 * stesse costanti (`STUCK_RULE`, che viene da `session-deadlines`). Un
 * cambiamento alla regola si fa in `session-deadlines` e si riflette in
 * entrambe.
 */

export type AiConsoleRow = {
  sessionId: number;
  bookingId: number;
  /** L'atleta resta un identificativo: vedi la regola in testa al modulo. */
  athleteUserId: number;
  coachName: string;
  coachProviderId: number;
  scheduledFor: Date | null;
  startedAt: Date | null;
  endedAt: Date | null;
  /** Durata dell'audio archiviato, in secondi. */
  audioSeconds: number;
  status: string;
  errorCode: string | null;
  provider: string | null;
  model: string | null;
  promptVersion: string | null;
  attempts: number;
  transcriptSegments: number;
  /** Tempo fra l'ingresso in elaborazione e l'ultimo movimento, in secondi. */
  processingSeconds: number | null;
  updatedAt: Date;
  costEur: number | null;
  classification: PipelineClassification;
};

type RawRow = {
  id: number;
  booking_id: number;
  athlete_user_id: number;
  coach_name: string;
  coach_provider_id: number;
  status: string;
  error_code: string | null;
  scheduled_for: Date | string | null;
  started_at: Date | string | null;
  ended_at: Date | string | null;
  processing_started_at: Date | string | null;
  updateddate: Date | string;
  last_progress: Date | string;
  active_jobs: number;
  untouched_jobs: number;
  attempts: number;
  active_report: boolean;
  active_normalization: boolean;
  active_transcription: boolean;
  job_provider: string | null;
  audio_seconds: number;
  transcript_segments: number;
  report_provider: string | null;
  report_model: string | null;
  report_prompt_version: string | null;
};

function toDate(value: Date | string | null): Date | null {
  if (value === null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Un istante per una colonna `timestamptz`, nella forma che il driver accetta.
 *
 * `db.execute` con `sql` grezzo non passa dal mappatore di Drizzle, e
 * postgres.js **non sa serializzare un `Date`** senza un tipo dichiarato:
 * solleva `ERR_INVALID_ARG_TYPE` alla prima esecuzione, cosa che nessun
 * typecheck vede. Tutte le tabelle della pipeline usano `timestamptz`, quindi
 * qui basta una forma sola — a differenza di `overview.ts`, che tocca anche
 * `bookings` e le sue colonne senza fuso.
 */
const tz = (at: Date) => sql`${at.toISOString()}::timestamptz`;

/**
 * La prenotazione appartiene a due persone vere.
 *
 * I conti demo sono account sintetici: seguirne la pipeline significa
 * amministrare sedute che nessuno ha tenuto. Una prenotazione e' demo se lo
 * e' **una delle due parti**, come nella vista landing_stats (migrazione
 * 0055) — non e' una regola nuova, e' quella.
 *
 * Frammento e non JOIN nel corpo delle query: entra come predicato dove
 * serve, senza cambiare la forma di nessuna SELECT, e resta una riga sola da
 * cambiare il giorno in cui la definizione di «conto vero» cambia.
 */
const realBooking = (bookingId: SQL) => sql`EXISTS (
  SELECT 1 FROM bookings b_vero
  JOIN users atleta_vero
    ON atleta_vero.id = b_vero.client_id AND atleta_vero.is_demo = false
  JOIN provider_profiles pp_vero ON pp_vero.id = b_vero.provider_id
  JOIN users coach_vero
    ON coach_vero.id = pp_vero.user_id AND coach_vero.is_demo = false
  WHERE b_vero.id = ${bookingId}
)`;

/** Lo stesso, per una tabella agganciata alla seduta e non alla prenotazione. */
const realSession = (sessionId: SQL) => sql`EXISTS (
  SELECT 1 FROM session_ai_notes n_vero
  WHERE n_vero.id = ${sessionId} AND ${realBooking(sql`n_vero.booking_id`)}
)`;

/**
 * I fatti da cui nascono sia il filtro SQL sia la classificazione mostrata.
 *
 * `last_progress` è il più recente fra l'aggiornamento della seduta e
 * l'ultimo movimento dei suoi job: la stessa definizione di `latestProgress`
 * in `stuck-sessions.ts`, che è la funzione con cui la pipeline decide
 * davvero di chiudere una seduta scaduta.
 */
const FACTS_CTE = sql`
  jobs AS (
    SELECT
      j.session_ai_notes_id AS session_id,
      count(*) FILTER (WHERE j.status IN ('queued', 'processing', 'awaiting_provider'))::int AS active_jobs,
      count(*) FILTER (WHERE j.status = 'queued' AND j.attempt_count = 0)::int AS untouched_jobs,
      coalesce(sum(j.attempt_count), 0)::int AS attempts,
      max(j.updateddate) AS last_job_at,
      bool_or(j.job_type = 'report_generation' AND j.status IN ('queued', 'processing', 'awaiting_provider')) AS active_report,
      bool_or(j.job_type = 'transcript_normalization' AND j.status IN ('queued', 'processing', 'awaiting_provider')) AS active_normalization,
      bool_or(j.job_type = 'transcription' AND j.status IN ('queued', 'processing', 'awaiting_provider')) AS active_transcription,
      (array_agg(j.provider ORDER BY j.id DESC) FILTER (WHERE j.provider <> 'disabled'))[1] AS job_provider
    FROM session_ai_processing_jobs j
    WHERE j.session_ai_notes_id IN (SELECT id FROM scope)
    GROUP BY 1
  ),
  audio AS (
    SELECT
      r.session_ai_notes_id AS session_id,
      coalesce(sum(r.duration_seconds) FILTER (WHERE r.status = 'recorded'), 0)::int AS audio_seconds
    FROM session_audio_recordings r
    WHERE r.session_ai_notes_id IN (SELECT id FROM scope)
    GROUP BY 1
  ),
  segments AS (
    SELECT s.session_ai_notes_id AS session_id, count(*)::int AS transcript_segments
    FROM session_transcript_segments s
    WHERE s.session_ai_notes_id IN (SELECT id FROM scope)
    GROUP BY 1
  ),
  reports AS (
    SELECT DISTINCT ON (rp.session_ai_notes_id)
      rp.session_ai_notes_id AS session_id,
      rp.generated_by_provider AS report_provider,
      rp.generated_by_model AS report_model,
      rp.prompt_version AS report_prompt_version
    FROM session_ai_reports rp
    WHERE rp.session_ai_notes_id IN (SELECT id FROM scope)
    ORDER BY rp.session_ai_notes_id, rp.report_version DESC
  )
`;

const ENRICHED_SELECT = sql`
  SELECT
    n.id,
    n.booking_id,
    b.client_id AS athlete_user_id,
    b.provider_id AS coach_provider_id,
    coalesce(
      nullif(trim(p.display_name), ''),
      nullif(trim(concat(coalesce(u.name, ''), ' ', coalesce(u.last_name, ''))), ''),
      u.email
    ) AS coach_name,
    n.status,
    n.error_code,
    b.scheduled_for,
    n.started_at,
    n.ended_at,
    n.processing_started_at,
    n.updateddate,
    greatest(n.updateddate, coalesce(jobs.last_job_at, n.updateddate)) AS last_progress,
    coalesce(jobs.active_jobs, 0) AS active_jobs,
    coalesce(jobs.untouched_jobs, 0) AS untouched_jobs,
    coalesce(jobs.attempts, 0) AS attempts,
    coalesce(jobs.active_report, false) AS active_report,
    coalesce(jobs.active_normalization, false) AS active_normalization,
    coalesce(jobs.active_transcription, false) AS active_transcription,
    jobs.job_provider,
    coalesce(audio.audio_seconds, 0) AS audio_seconds,
    coalesce(segments.transcript_segments, 0) AS transcript_segments,
    reports.report_provider,
    reports.report_model,
    reports.report_prompt_version
  FROM scope n
  JOIN bookings b ON b.id = n.booking_id
  JOIN provider_profiles pp ON pp.id = b.provider_id
  JOIN users u ON u.id = pp.user_id
  LEFT JOIN profiles p ON p.user_id = pp.user_id
  LEFT JOIN jobs ON jobs.session_id = n.id
  LEFT JOIN audio ON audio.session_id = n.id
  LEFT JOIN segments ON segments.session_id = n.id
  LEFT JOIN reports ON reports.session_id = n.id
`;

/**
 * La finestra di sedute su cui si lavora, prima di qualunque arricchimento.
 *
 * I filtri arrivano già validati da `parseAiConsoleFilters`: qui entrano solo
 * valori di insiemi chiusi, interi e giorni di calendario, e passano comunque
 * come parametri — mai concatenati.
 */
function scopeCte(filters: AiConsoleFilters, period: AdminPeriod): SQL {
  const conditions: SQL[] = [
    sql`n.createddate >= ${tz(
      filters.da ? (romeDayValueToInstant(filters.da) ?? period.from) : period.from
    )}`,
  ];

  const upperBound = filters.a
    ? romeDayValueToInstant(filters.a)
    : null;
  if (upperBound) {
    // Il giorno finale è compreso: il confine sta alla mezzanotte successiva.
    conditions.push(
      sql`n.createddate < ${tz(new Date(upperBound.getTime() + 24 * 3_600_000))}`
    );
  } else if (!filters.da) {
    conditions.push(sql`n.createddate < ${tz(period.to)}`);
  }

  if (filters.coachProviderId) {
    conditions.push(
      sql`n.booking_id IN (SELECT id FROM bookings WHERE provider_id = ${filters.coachProviderId})`
    );
  }
  if (filters.errore) {
    conditions.push(sql`n.error_code = ${filters.errore}`);
  }

  // Fuori dalla console i conti demo, e fuori anche dal conteggio totale:
  // filtrarli dopo la paginazione darebbe pagine di lunghezza variabile.
  conditions.push(realBooking(sql`n.booking_id`));

  return sql`scope AS (
    SELECT n.id, n.booking_id, n.status, n.error_code, n.started_at, n.ended_at,
           n.processing_started_at, n.updateddate
    FROM session_ai_notes n
    WHERE ${sql.join(conditions, sql` AND `)}
  )`;
}

/**
 * Il predicato dello stato, in SQL.
 *
 * Mirror di `classifyPipelineSession`, e per non divergere usa **gli stessi
 * fatti** calcolati nella CTE e **le stesse costanti** di `STUCK_RULE`. Sta
 * qui, accanto alla query, e non nel modulo puro, perché è la sola parte che
 * non si può provare senza un database: separarla la rende almeno evidente.
 */
function stateFilter(state: AiConsoleFilters['stato']): SQL | null {
  const senzaLavoro = STUCK_RULE.senzaLavoroAttivoMinuti;
  const conLavoro = STUCK_RULE.conLavoroAttivoMinuti;
  const scaduta = sql`(
    e.status = 'processing' AND (
      (e.active_jobs = 0 AND e.last_progress < now() - (${senzaLavoro} * interval '1 minute'))
      OR (e.active_jobs > 0 AND e.last_progress < now() - (${conLavoro} * interval '1 minute'))
    )
  )`;

  switch (state) {
    case null:
      return null;
    case 'in_seduta':
      return sql`e.status = 'active'`;
    case 'completato':
      return sql`e.status IN ('ready_for_review', 'approved', 'shared')`;
    case 'fallito':
      return sql`e.status IN ('transcription_failed', 'report_failed')`;
    case 'rifiutato':
      return sql`e.status = 'consent_rejected'`;
    case 'annullato':
      return sql`e.status = 'cancelled'`;
    case 'bloccato':
      return scaduta;
    case 'in_coda':
      return sql`e.status = 'processing' AND NOT ${scaduta}
        AND e.active_jobs > 0 AND e.active_jobs = e.untouched_jobs`;
    case 'in_corso':
      return sql`e.status IN ('waiting_for_consent', 'processing') AND NOT ${scaduta}
        AND NOT (e.status = 'processing' AND e.active_jobs > 0 AND e.active_jobs = e.untouched_jobs)`;
    default:
      return null;
  }
}

function phaseFilter(phase: AiConsoleFilters['fase']): SQL | null {
  switch (phase) {
    case null:
      return null;
    case 'consenso':
      return sql`e.status = 'waiting_for_consent'`;
    case 'seduta':
      return sql`e.status = 'active'`;
    case 'riepilogo':
      return sql`e.status = 'processing' AND e.active_report`;
    case 'normalizzazione':
      return sql`e.status = 'processing' AND e.active_normalization AND NOT e.active_report`;
    case 'trascrizione':
      return sql`e.status = 'processing' AND e.active_transcription AND NOT e.active_report AND NOT e.active_normalization`;
    case 'nessun_lavoro':
      return sql`e.status = 'processing' AND e.active_jobs = 0`;
    case 'revisione_coach':
      return sql`e.status = 'ready_for_review'`;
    case 'condiviso':
      return sql`e.status IN ('approved', 'shared')`;
    case 'chiusa':
      return sql`e.status IN ('transcription_failed', 'report_failed', 'consent_rejected', 'cancelled')`;
    default:
      return null;
  }
}

function jobsFromRow(row: RawRow): PipelineJobSummary[] {
  const jobs: PipelineJobSummary[] = [];
  const untouched = Number(row.untouched_jobs);
  const active = Number(row.active_jobs);
  const push = (jobType: PipelineJobSummary['jobType'], present: boolean) => {
    if (!present) return;
    jobs.push({
      jobType,
      // Se tutti i job attivi sono in coda e mai tentati, la riga lo dice: è
      // il fatto su cui `classifyPipelineSession` distingue coda da lavoro.
      status: untouched > 0 && untouched === active ? 'queued' : 'processing',
      attemptCount: untouched > 0 && untouched === active ? 0 : 1,
    });
  };
  push('transcription', row.active_transcription);
  push('transcript_normalization', row.active_normalization);
  push('report_generation', row.active_report);

  // Job attivi che non ricadono nei tre tipi noti (non dovrebbe accadere):
  // meglio contarli che far sembrare la seduta senza lavoro.
  while (jobs.length < active) {
    jobs.push({ jobType: 'transcription', status: 'processing', attemptCount: 1 });
  }
  return jobs;
}

function rowToConsoleRow(row: RawRow, rates: AiCostRates, now: Date): AiConsoleRow {
  const lastProgress = toDate(row.last_progress) ?? now;
  const processingStartedAt = toDate(row.processing_started_at);
  const audioSeconds = Number(row.audio_seconds ?? 0);

  const cost = estimateAiCost(
    {
      audioMinutes: audioSeconds / 60,
      reportsGenerated: row.report_model ? 1 : 0,
      sessionsWithReport: row.report_model ? 1 : 0,
    },
    rates
  );

  return {
    sessionId: Number(row.id),
    bookingId: Number(row.booking_id),
    athleteUserId: Number(row.athlete_user_id),
    coachName: row.coach_name,
    coachProviderId: Number(row.coach_provider_id),
    scheduledFor: toDate(row.scheduled_for),
    startedAt: toDate(row.started_at),
    endedAt: toDate(row.ended_at),
    audioSeconds,
    status: row.status,
    errorCode: row.error_code,
    provider: row.report_provider ?? row.job_provider,
    model: row.report_model,
    promptVersion: row.report_prompt_version,
    attempts: Number(row.attempts ?? 0),
    transcriptSegments: Number(row.transcript_segments ?? 0),
    processingSeconds: processingStartedAt
      ? Math.max(
          0,
          Math.round(
            (lastProgress.getTime() - processingStartedAt.getTime()) / 1000
          )
        )
      : null,
    updatedAt: toDate(row.updateddate) ?? now,
    costEur: cost.totalEur,
    classification: classifyPipelineSession({
      status: row.status as never,
      lastProgressAt: lastProgress,
      jobs: jobsFromRow(row),
      now,
    }),
  };
}

export async function getAiConsolePage(
  filters: AiConsoleFilters,
  period: AdminPeriod
): Promise<{ rows: AiConsoleRow[]; total: number; page: number }> {
  const scope = scopeCte(filters, period);
  const predicates = [stateFilter(filters.stato), phaseFilter(filters.fase)].filter(
    (predicate): predicate is SQL => predicate !== null
  );
  const where = predicates.length
    ? sql` WHERE ${sql.join(predicates, sql` AND `)}`
    : sql``;

  const now = new Date();
  const rates = readAiCostRates(process.env);

  const [rows, totals] = await Promise.all([
    db.execute(sql`
      WITH ${scope}, ${FACTS_CTE}, enriched AS (${ENRICHED_SELECT})
      SELECT e.* FROM enriched e${where}
      ORDER BY coalesce(e.ended_at, e.scheduled_for, e.updateddate) DESC, e.id DESC
      LIMIT ${AI_CONSOLE_PAGE_SIZE} OFFSET ${aiConsoleOffset(filters.page)}
    `) as unknown as RawRow[],
    db.execute(sql`
      WITH ${scope}, ${FACTS_CTE}, enriched AS (${ENRICHED_SELECT})
      SELECT count(*)::int AS total FROM enriched e${where}
    `) as unknown as { total: number }[],
  ]);

  return {
    rows: rows.map((row) => rowToConsoleRow(row, rates, now)),
    total: Number(totals[0]?.total ?? 0),
    page: filters.page,
  };
}

export type AiConsoleKpis = {
  audioMinutes: number;
  transcriptionsCompleted: number;
  transcriptionsFailed: number;
  reportsGenerated: number;
  reportsFailed: number;
  jobsQueued: number;
  jobsRunning: number;
  jobsStuck: number;
  /** Mediana del tempo di elaborazione, quando ci sono sedute concluse. */
  medianProcessingSeconds: number | null;
  cost: ReturnType<typeof estimateAiCost>;
  costConfigured: boolean;
};

export async function getAiConsoleKpis(
  period: AdminPeriod
): Promise<AiConsoleKpis> {
  const [audio, sessions, jobs, durations] = await Promise.all([
    db.execute(sql`
      SELECT coalesce(sum(duration_seconds) FILTER (WHERE status = 'recorded'), 0)::int AS secondi
      FROM session_audio_recordings
      WHERE createddate >= ${tz(period.from)} AND createddate < ${tz(period.to)}
        AND ${realSession(sql`session_ai_notes_id`)}
    `) as unknown as { secondi: number }[],

    db.execute(sql`
      SELECT
        count(*) FILTER (WHERE status IN ('ready_for_review', 'approved', 'shared'))::int AS trascritte,
        count(*) FILTER (WHERE status = 'transcription_failed')::int AS trascrizione_fallita,
        count(*) FILTER (WHERE status = 'report_failed')::int AS report_fallito
      FROM session_ai_notes
      WHERE createddate >= ${tz(period.from)} AND createddate < ${tz(period.to)}
        AND ${realBooking(sql`booking_id`)}
    `) as unknown as {
      trascritte: number;
      trascrizione_fallita: number;
      report_fallito: number;
    }[],

    /*
     * I job in coda e in corso sono di **adesso**, non del periodo: una coda
     * "degli ultimi 30 giorni" non vuol dire niente, perché la coda è uno
     * stato istantaneo. La differenza è dichiarata nell'interfaccia.
     */
    db.execute(sql`
      SELECT
        count(*) FILTER (WHERE status = 'queued')::int AS in_coda,
        count(*) FILTER (WHERE status IN ('processing', 'awaiting_provider'))::int AS in_corso,
        count(*) FILTER (
          WHERE status = 'queued'
            AND attempt_count = 0
            AND available_after < now() - (${STUCK_RULE.senzaLavoroAttivoMinuti} * interval '1 minute')
        )::int AS fermi
      FROM session_ai_processing_jobs
      WHERE ${realSession(sql`session_ai_notes_id`)}
    `) as unknown as { in_coda: number; in_corso: number; fermi: number }[],

    db.execute(sql`
      SELECT
        percentile_disc(0.5) WITHIN GROUP (
          ORDER BY extract(epoch FROM (processing_completed_at - processing_started_at))
        )::int AS mediana,
        count(*)::int AS campioni
      FROM session_ai_notes
      WHERE createddate >= ${tz(period.from)} AND createddate < ${tz(period.to)}
        AND processing_started_at IS NOT NULL
        AND processing_completed_at IS NOT NULL
        AND ${realBooking(sql`booking_id`)}
    `) as unknown as { mediana: number | null; campioni: number }[],
  ]);

  const [reports] = (await db.execute(sql`
    SELECT
      count(*) FILTER (WHERE status IN ('ready_for_review', 'approved', 'shared'))::int AS generati,
      count(*) FILTER (WHERE status = 'failed')::int AS falliti,
      count(DISTINCT session_ai_notes_id) FILTER (WHERE status IN ('ready_for_review', 'approved', 'shared'))::int AS sedute
    FROM session_ai_reports
    WHERE createddate >= ${tz(period.from)} AND createddate < ${tz(period.to)}
      AND ${realSession(sql`session_ai_notes_id`)}
  `)) as unknown as { generati: number; falliti: number; sedute: number }[];

  const audioMinutes = Math.round(Number(audio[0]?.secondi ?? 0) / 60);
  const rates = readAiCostRates(process.env);

  return {
    audioMinutes,
    transcriptionsCompleted: Number(sessions[0]?.trascritte ?? 0),
    transcriptionsFailed: Number(sessions[0]?.trascrizione_fallita ?? 0),
    reportsGenerated: Number(reports?.generati ?? 0),
    reportsFailed: Number(reports?.falliti ?? 0),
    jobsQueued: Number(jobs[0]?.in_coda ?? 0),
    jobsRunning: Number(jobs[0]?.in_corso ?? 0),
    jobsStuck: Number(jobs[0]?.fermi ?? 0),
    medianProcessingSeconds:
      durations[0]?.campioni && durations[0].campioni > 0
        ? Number(durations[0].mediana ?? 0)
        : null,
    cost: estimateAiCost(
      {
        audioMinutes,
        reportsGenerated: Number(reports?.generati ?? 0),
        sessionsWithReport: Number(reports?.sedute ?? 0),
      },
      rates
    ),
    costConfigured: rates.sttPerMinute !== null || rates.reportEach !== null,
  };
}

/** I coach che compaiono nella console, per il menu del filtro. */
export async function getAiConsoleCoaches(
  period: AdminPeriod
): Promise<{ providerId: number; name: string }[]> {
  const rows = (await db.execute(sql`
    SELECT DISTINCT
      b.provider_id::int AS provider_id,
      coalesce(
        nullif(trim(p.display_name), ''),
        nullif(trim(concat(coalesce(u.name, ''), ' ', coalesce(u.last_name, ''))), ''),
        u.email
      ) AS name
    FROM session_ai_notes n
    JOIN bookings b ON b.id = n.booking_id
    JOIN provider_profiles pp ON pp.id = b.provider_id
    JOIN users u ON u.id = pp.user_id
    LEFT JOIN profiles p ON p.user_id = pp.user_id
    JOIN users atleta ON atleta.id = b.client_id
    WHERE n.createddate >= ${tz(period.from)} AND n.createddate < ${tz(period.to)}
      AND u.is_demo = false
      AND atleta.is_demo = false
    ORDER BY 2
    LIMIT 100
  `)) as unknown as { provider_id: number; name: string }[];

  return rows.map((row) => ({
    providerId: Number(row.provider_id),
    name: row.name,
  }));
}

/** I codici d'errore effettivamente presenti, per il filtro. */
export async function getAiConsoleErrorCodes(
  period: AdminPeriod
): Promise<{ code: string; count: number }[]> {
  const rows = (await db.execute(sql`
    SELECT error_code AS code, count(*)::int AS count
    FROM session_ai_notes
    WHERE createddate >= ${tz(period.from)} AND createddate < ${tz(period.to)}
      AND error_code IS NOT NULL
      AND ${realBooking(sql`booking_id`)}
    GROUP BY 1
    ORDER BY 2 DESC
    LIMIT 30
  `)) as unknown as { code: string; count: number }[];

  return rows.map((row) => ({ code: row.code, count: Number(row.count) }));
}

/* ── Dettaglio di una singola seduta ────────────────────────────────────── */

export type AiSessionJob = {
  id: number;
  jobType: string;
  status: string;
  provider: string;
  attemptCount: number;
  maxAttempts: number;
  availableAfter: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  lockedBy: string | null;
  errorCode: string | null;
  /** Messaggio già ripulito dal fornitore: mai contenuto di seduta. */
  errorMessage: string | null;
  updatedAt: Date | null;
};

export type AiSessionRecording = {
  id: number;
  role: string;
  segment: number;
  status: string;
  durationSeconds: number | null;
  sizeBytes: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  egressId: string | null;
  startedAt: Date | null;
  endedAt: Date | null;
};

export type AiSessionAuditRow = {
  at: Date;
  eventType: string;
  previousStatus: string | null;
  newStatus: string | null;
  metadata: Record<string, unknown>;
};

export type AiSessionDetail = {
  row: AiConsoleRow;
  jobs: AiSessionJob[];
  recordings: AiSessionRecording[];
  audit: AiSessionAuditRow[];
  /**
   * L'identificativo tecnico da incollare in una segnalazione: non è un
   * segreto, e senza di lui ogni richiesta di supporto comincia con «quale
   * seduta?».
   */
  correlationId: string;
  /** Perché il riavvio è o non è disponibile. Deciso sul server. */
  retry: { allowed: boolean; reason: string };
};

export async function getAiSessionDetail(
  sessionId: number
): Promise<AiSessionDetail | null> {
  if (!Number.isInteger(sessionId) || sessionId <= 0) return null;

  const now = new Date();
  const rates = readAiCostRates(process.env);

  const scope = sql`scope AS (
    SELECT n.id, n.booking_id, n.status, n.error_code, n.started_at, n.ended_at,
           n.processing_started_at, n.updateddate
    FROM session_ai_notes n
    WHERE n.id = ${sessionId} AND ${realBooking(sql`n.booking_id`)}
  )`;

  const [rows, jobs, recordings, audit] = await Promise.all([
    db.execute(sql`
      WITH ${scope}, ${FACTS_CTE}, enriched AS (${ENRICHED_SELECT})
      SELECT e.* FROM enriched e
    `) as unknown as RawRow[],

    db.execute(sql`
      SELECT id, job_type, status, provider, attempt_count, max_attempts,
             available_after, started_at, completed_at, locked_by,
             error_code, error_message_sanitized, updateddate
      FROM session_ai_processing_jobs
      WHERE session_ai_notes_id = ${sessionId}
      ORDER BY id
    `) as unknown as Record<string, never>[],

    db.execute(sql`
      SELECT id, participant_role, segment_order, status, duration_seconds,
             size_bytes, error_code, error_message_sanitized,
             livekit_egress_id, started_at, ended_at
      FROM session_audio_recordings
      WHERE session_ai_notes_id = ${sessionId}
      ORDER BY participant_role, segment_order
    `) as unknown as Record<string, never>[],

    db.execute(sql`
      SELECT createddate, event_type, previous_status, new_status, event_metadata
      FROM session_ai_audit_events
      WHERE session_ai_notes_id = ${sessionId}
      ORDER BY createddate DESC, id DESC
      LIMIT 80
    `) as unknown as Record<string, never>[],
  ]);

  const raw = rows[0];
  if (!raw) return null;

  const row = rowToConsoleRow(raw, rates, now);
  const segments = row.transcriptSegments;

  return {
    row,
    jobs: jobs.map((job) => ({
      id: Number(job.id),
      jobType: String(job.job_type),
      status: String(job.status),
      provider: String(job.provider),
      attemptCount: Number(job.attempt_count),
      maxAttempts: Number(job.max_attempts),
      availableAfter: toDate(job.available_after),
      startedAt: toDate(job.started_at),
      completedAt: toDate(job.completed_at),
      lockedBy: job.locked_by ? String(job.locked_by) : null,
      errorCode: job.error_code ? String(job.error_code) : null,
      errorMessage: job.error_message_sanitized
        ? String(job.error_message_sanitized)
        : null,
      updatedAt: toDate(job.updateddate),
    })),
    recordings: recordings.map((recording) => ({
      id: Number(recording.id),
      role: String(recording.participant_role),
      segment: Number(recording.segment_order),
      status: String(recording.status),
      durationSeconds:
        recording.duration_seconds === null
          ? null
          : Number(recording.duration_seconds),
      sizeBytes:
        recording.size_bytes === null ? null : Number(recording.size_bytes),
      errorCode: recording.error_code ? String(recording.error_code) : null,
      errorMessage: recording.error_message_sanitized
        ? String(recording.error_message_sanitized)
        : null,
      egressId: recording.livekit_egress_id
        ? String(recording.livekit_egress_id)
        : null,
      startedAt: toDate(recording.started_at),
      endedAt: toDate(recording.ended_at),
    })),
    audit: audit.map((event) => ({
      at: toDate(event.createddate) ?? now,
      eventType: String(event.event_type),
      previousStatus: event.previous_status ? String(event.previous_status) : null,
      newStatus: event.new_status ? String(event.new_status) : null,
      metadata: (event.event_metadata ?? {}) as Record<string, unknown>,
    })),
    correlationId: `ai-notes/${row.sessionId}/booking-${row.bookingId}`,
    retry: retryAvailability(row.status, segments),
  };
}
