import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { formatRomeDateValue } from '@/lib/core/format';
import { getPipelineHealth } from '@/lib/core/ai-session-notes/pipeline-health';
import { readAiCostRates, estimateAiCost, type AiCostEstimate } from './ai-cost';
import {
  assessService,
  concentrationHint,
  type ServiceCause,
  type ServiceVerdict,
} from './service-health';
import { describeCause } from './service-causes';
import { buildAttentionItems, type AttentionItem } from './attention';
import { type AdminPeriod, type PeriodGranularity } from './period';
import { getUpcomingAgenda } from './agenda';
import type { UpcomingAgenda } from './upcoming';
import { ACTIVE_DEFINITION, TOTAL_DEFINITION } from './activity';

/**
 * I numeri della Control Room, letti una volta sola.
 *
 * Tutto quello che c'è qui dentro è **aggregato nel database**. Nessuna
 * lettura di elenchi seguita da un conteggio in memoria: la pagina
 * amministrazione precedente caricava ogni atleta, ogni coach e ogni
 * prenotazione per mostrare quattro numeri, e con qualche decina di righe
 * funzionava benissimo. Con qualche migliaio è la stessa pagina che impiega
 * due minuti — cosa che questo repository ha già misurato, e che sta scritta
 * nei tempi di attesa di `e2e/happy-path.mjs`.
 *
 * Nessun contenuto di seduta esce da qui: conteggi, stati, durate, codici.
 * La console amministrativa non legge trascrizioni, riepiloghi o note.
 */

/**
 * Il giorno di calendario a Roma di un `timestamp` senza fuso.
 *
 * Le colonne di `bookings` sono `timestamp` (senza fuso) e contengono istanti
 * UTC: la doppia conversione è obbligatoria e non è una precauzione. Con il
 * solo `AT TIME ZONE 'Europe/Rome'` Postgres interpreterebbe il valore come
 * se fosse già ora di Roma, spostando ogni seduta di due ore e cambiando
 * giorno a tutte quelle prima delle 02:00.
 */
const romeDay = (column: unknown) =>
  sql<string>`to_char(((${column} AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Rome')::date, 'YYYY-MM-DD')`;

/**
 * Un istante, consegnato al database nella forma che la colonna si aspetta.
 *
 * Non e' pedanteria di tipi: `db.execute` con `sql` grezzo non passa dal
 * mappatore di Drizzle, e postgres.js **non sa serializzare un `Date`** in un
 * parametro senza un tipo dichiarato — solleva `ERR_INVALID_ARG_TYPE` alla
 * prima esecuzione, cosa che nessun typecheck vede.
 *
 * Due forme perche' ci sono due famiglie di colonne, ed e' una distinzione
 * che costa un'ora di sedute se la si sbaglia: `session_ai_notes` e le
 * tabelle della pipeline usano `timestamptz`; `bookings` e
 * `video_session_events` usano `timestamp` **senza fuso**, dove pero' i valori
 * scritti sono istanti UTC. Confrontarli con un `timestamptz` li farebbe
 * reinterpretare nel fuso della sessione, spostando ogni confine di due ore.
 */
const tz = (at: Date) => sql`${at.toISOString()}::timestamptz`;

/** Lo stesso istante per una colonna `timestamp` senza fuso: orologio UTC. */
const naive = (at: Date) =>
  sql`${at.toISOString().replace('T', ' ').replace('Z', '')}::timestamp`;

/**
 * Il mese di calendario a Roma di un `timestamp` senza fuso.
 *
 * Stessa doppia conversione di `romeDay`, e per la stessa ragione: una seduta
 * del primo agosto all'una di notte e' di agosto, non di luglio.
 */
const romeMonth = (column: unknown) =>
  sql<string>`to_char(((${column} AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Rome')::date, 'YYYY-MM')`;

export type AdminKpi = {
  key: string;
  label: string;
  value: number;
  /** Cosa conta esattamente: nessuna card ambigua. */
  description: string;
  /** Il periodo a cui il numero si riferisce, scritto per esteso. */
  scope: string;
  href: string | null;
  delta: { percent: number; direction: 'up' | 'down' | 'flat' } | null;
  tone: 'neutro' | 'attenzione' | 'critico';
};

export type PipelineFunnelStep = {
  key: string;
  label: string;
  value: number;
  note: string;
};

export type SessionsBucket = {
  /** `YYYY-MM-DD` a granularita' giorno, `YYYY-MM` a granularita' mese. */
  bucket: string;
  completate: number;
  annullate: number;
};

export type AdminOverview = {
  kpis: AdminKpi[];
  services: ServiceVerdict[];
  attention: AttentionItem[];
  sessionsSeries: SessionsBucket[];
  seriesGranularity: PeriodGranularity;
  /** Che cosa c'e' davanti: la domanda che il periodo, all'indietro, non poteva fare. */
  upcoming: UpcomingAgenda;
  funnel: PipelineFunnelStep[];
  outcomes: { label: string; count: number }[];
  coachActivity: { coachName: string; providerId: number; sessions: number }[];
  cost: AiCostEstimate;
  costConfigured: boolean;
  generatedAt: Date;
};

type Counts = Record<string, number>;

async function scalarRow(query: Promise<Counts[]>): Promise<Counts> {
  const rows = await query;
  return rows[0] ?? {};
}

export async function getAdminOverview(
  period: AdminPeriod
): Promise<AdminOverview> {
  const { from, to, previousFrom, previousTo } = period;
  const todayRome = formatRomeDateValue(to);

  /*
   * Una sola andata e ritorno, e una sola scansione per tabella.
   *
   * Due difetti, misurati e corretti in quest'ordine.
   *
   * Il primo: sedici letture in parallelo con `Promise.all` **hanno piantato
   * la pagina**. postgres.js accoda più istruzioni sulla stessa connessione e
   * il pooler in modalità transazione di Supabase si blocca con più statement
   * in volo — sta scritto in lib/db/drizzle.ts, ed è esattamente quello che è
   * successo. Non era lentezza: nessuna delle query, da sola, superava i
   * 50 ms.
   *
   * Il secondo: riunirle in una SELECT sola con trenta sottoquery scalari ha
   * sbloccato la pagina e l'ha portata a venti secondi, perché ogni
   * sottoquery rifaceva la sua scansione — otto passate su `bookings`, sette
   * su `session_ai_notes`. Qui ogni tabella è letta **una volta**, in una
   * CTE che calcola tutti i suoi conteggi in una passata, e le CTE si
   * incrociano alla fine: sono tutte a riga singola, quindi il prodotto
   * cartesiano è una riga.
   */
  const [totals, byDay, causeRows, coachActivityRows] = await Promise.all([
    scalarRow(
      db.execute(sql`
        WITH
        /*
         * I conti demo non entrano in nessuno di questi numeri.
         *
         * Sono insiemi minuscoli — una manciata di account sintetici — quindi
         * stanno in tre CTE riusate da tutte le altre, invece di ripetere le
         * stesse due JOIN su ogni conteggio. Ogni CTE tiene cosi' il proprio
         * filtro sulla finestra, che e' quello indicizzato: escludere la demo
         * non costa una scansione in piu'.
         *
         * IN / NOT IN su sottoquery e' sicuro qui perche' le colonne
         * confrontate sono chiavi primarie e non possono essere NULL.
         *
         * Una prenotazione e' demo se lo e' **una delle due parti**: e' la
         * stessa regola della vista landing_stats (migrazione 0055).
         */
        utenti_demo AS (SELECT id FROM users WHERE is_demo),
        coach_demo AS (
          SELECT pp.id FROM provider_profiles pp
          WHERE pp.user_id IN (SELECT id FROM utenti_demo)
        ),
        sedute_demo AS (
          SELECT n.id FROM session_ai_notes n
          JOIN bookings b ON b.id = n.booking_id
          WHERE b.client_id IN (SELECT id FROM utenti_demo)
             OR b.provider_id IN (SELECT id FROM coach_demo)
        ),
        prenotazioni AS (
          SELECT
            count(*) FILTER (WHERE status = 'completed')::int AS completate,
            count(*) FILTER (WHERE status = 'cancelled')::int AS annullate,
            count(*) FILTER (WHERE status = 'declined')::int AS rifiutate,
            count(*) FILTER (WHERE status = 'expired')::int AS scadute,
            count(DISTINCT provider_id) FILTER (
              WHERE status IN ('accepted', 'completed')
                AND coalesce(session_started_at, scheduled_for) >= ${naive(from)}
                AND coalesce(session_started_at, scheduled_for) < ${naive(to)}
            )::int AS coach_attivi,
            count(DISTINCT client_id) FILTER (
              WHERE status IN ('accepted', 'completed')
                AND coalesce(session_started_at, scheduled_for) >= ${naive(from)}
                AND coalesce(session_started_at, scheduled_for) < ${naive(to)}
            )::int AS atleti_attivi
          FROM bookings
          WHERE coalesce(session_started_at, scheduled_for, requested_at) >= ${naive(from)}
            AND coalesce(session_started_at, scheduled_for, requested_at) < ${naive(to)}
            AND client_id NOT IN (SELECT id FROM utenti_demo)
            AND provider_id NOT IN (SELECT id FROM coach_demo)
        ),
        prenotazioni_prima AS (
          SELECT count(*) FILTER (WHERE status = 'completed')::int AS completate_prima
          FROM bookings
          WHERE coalesce(session_started_at, scheduled_for, requested_at) >= ${naive(previousFrom)}
            AND coalesce(session_started_at, scheduled_for, requested_at) < ${naive(previousTo)}
            AND client_id NOT IN (SELECT id FROM utenti_demo)
            AND provider_id NOT IN (SELECT id FROM coach_demo)
        ),
        oggi AS (
          SELECT count(*)::int AS previste
          FROM bookings
          WHERE scheduled_for IS NOT NULL
            AND status IN ('accepted', 'requested', 'completed')
            AND ${romeDay(sql`scheduled_for`)} = ${todayRome}
            AND client_id NOT IN (SELECT id FROM utenti_demo)
            AND provider_id NOT IN (SELECT id FROM coach_demo)
        ),
        popolazione AS (
          SELECT
            count(*)::int AS coach_totali,
            count(*) FILTER (WHERE status = 'pending')::int AS coach_da_approvare,
            count(*) FILTER (WHERE status = 'approved')::int AS coach_approvati
          FROM provider_profiles
          WHERE id NOT IN (SELECT id FROM coach_demo)
        ),
        atleti AS (
          SELECT count(*)::int AS atleti_totali
          FROM users u
          JOIN user_roles ur ON ur.user_id = u.id AND ur.role_key = 'athlete'
          WHERE u.deleted_at IS NULL AND u.is_demo = false
        ),
        sedute AS (
          SELECT
            count(*)::int AS ai_totali,
            count(*) FILTER (WHERE status IN ('ready_for_review', 'approved', 'shared'))::int AS ai_concluse,
            count(*) FILTER (WHERE status = 'transcription_failed')::int AS ai_trascrizione_fallita,
            count(*) FILTER (WHERE status = 'report_failed')::int AS ai_report_fallito,
            count(*) FILTER (WHERE status = 'consent_rejected')::int AS ai_rifiutate,
            count(*) FILTER (WHERE status = 'cancelled')::int AS ai_annullate,
            count(*) FILTER (WHERE status IN ('waiting_for_consent', 'active', 'processing'))::int AS ai_in_lavorazione
          FROM session_ai_notes
          WHERE createddate >= ${tz(from)} AND createddate < ${tz(to)}
            AND id NOT IN (SELECT id FROM sedute_demo)
        ),
        registrazioni AS (
          SELECT
            count(*) FILTER (WHERE status = 'recorded')::int AS reg_registrate,
            count(*) FILTER (WHERE status IN ('failed', 'deletion_failed'))::int AS reg_fallite,
            count(DISTINCT session_ai_notes_id) FILTER (WHERE status = 'recorded')::int AS reg_sedute_con_audio,
            coalesce(sum(duration_seconds) FILTER (WHERE status = 'recorded'), 0)::int AS reg_secondi
          FROM session_audio_recordings
          WHERE createddate >= ${tz(from)} AND createddate < ${tz(to)}
            AND session_ai_notes_id NOT IN (SELECT id FROM sedute_demo)
        ),
        trascritti AS (
          SELECT count(DISTINCT session_ai_notes_id)::int AS sedute_trascritte
          FROM session_transcript_segments
          WHERE createddate >= ${tz(from)} AND createddate < ${tz(to)}
            AND session_ai_notes_id NOT IN (SELECT id FROM sedute_demo)
        ),
        riepiloghi AS (
          SELECT
            count(*) FILTER (WHERE status IN ('ready_for_review', 'approved', 'shared'))::int AS rep_generati,
            count(*) FILTER (WHERE approved_at IS NOT NULL)::int AS rep_approvati,
            count(*) FILTER (WHERE status = 'failed')::int AS rep_falliti,
            count(DISTINCT session_ai_notes_id) FILTER (
              WHERE status IN ('ready_for_review', 'approved', 'shared')
            )::int AS rep_sedute
          FROM session_ai_reports
          WHERE createddate >= ${tz(from)} AND createddate < ${tz(to)}
            AND session_ai_notes_id NOT IN (SELECT id FROM sedute_demo)
        ),
        consegne AS (
          SELECT
            count(*) FILTER (WHERE status = 'sent')::int AS email_inviate,
            count(*) FILTER (WHERE status = 'failed')::int AS email_fallite
          FROM notification_email_deliveries
          WHERE created_at >= ${tz(from)} AND created_at < ${tz(to)}
            AND (
              recipient_user_id IS NULL
              OR recipient_user_id NOT IN (SELECT id FROM utenti_demo)
            )
        ),
        video AS (
          /*
           * Sedute, non eventi.
           *
           * La prima versione contava eventi: «60 fallimenti su 159», dove il
           * 159 sommava stanze aperte, partecipanti entrati e tracce
           * pubblicate — cioe' volume di attivita', non operazioni riuscite.
           * Aritmeticamente vero, semanticamente falso: una seduta che si
           * riconnette tre volte gonfiava il denominatore e migliorava il
           * rapporto.
           *
           * Il denominatore giusto e' la seduta: ottantuno errori di
           * dispositivo concentrati su otto sedute sono un problema piccolo e
           * localizzato, e con il conteggio a eventi sembravano un'emergenza.
           */
          SELECT
            count(DISTINCT booking_id)::int AS video_sedute,
            count(DISTINCT booking_id) FILTER (
              WHERE event_type LIKE '%error%' OR event_type = 'participant_connection_aborted'
            )::int AS video_sedute_con_problemi
          FROM video_session_events
          WHERE occurred_at >= ${naive(from)} AND occurred_at < ${naive(to)}
            AND booking_id NOT IN (
              SELECT b.id FROM bookings b
              WHERE b.client_id IN (SELECT id FROM utenti_demo)
                 OR b.provider_id IN (SELECT id FROM coach_demo)
            )
        ),
        tutori AS (
          /*
           * Minori con prenotazioni attive e nessuna autorizzazione
           * confermata. Senza data di nascita non si conta: un account senza
           * data non e' «probabilmente minorenne», e' ignoto, e contarlo qui
           * manderebbe a controllare persone maggiorenni finche' nessuno
           * guarda piu' il pannello.
           */
          SELECT count(DISTINCT b.client_id)::int AS minori_senza_autorizzazione
          FROM bookings b
          JOIN client_profiles cp ON cp.user_id = b.client_id
          LEFT JOIN athlete_guardians ag ON ag.athlete_user_id = b.client_id
          WHERE b.status IN ('requested', 'accepted')
            AND cp.birth_date IS NOT NULL
            AND cp.birth_date > (CURRENT_DATE - INTERVAL '18 years')
            AND (ag.id IS NULL OR ag.status <> 'confirmed')
            AND b.client_id NOT IN (SELECT id FROM utenti_demo)
            AND b.provider_id NOT IN (SELECT id FROM coach_demo)
        )
        SELECT *
        FROM popolazione, atleti, prenotazioni, prenotazioni_prima, oggi,
             sedute, registrazioni, trascritti, riepiloghi, consegne, video,
             tutori
      `) as unknown as Promise<Counts[]>
    ),

    db.execute(sql`
      SELECT
        ${
          period.granularity === 'mese'
            ? romeMonth(sql`coalesce(session_started_at, scheduled_for, requested_at)`)
            : romeDay(sql`coalesce(session_started_at, scheduled_for, requested_at)`)
        } AS bucket,
        count(*) FILTER (WHERE status = 'completed')::int AS completate,
        count(*) FILTER (WHERE status IN ('cancelled', 'declined', 'expired'))::int AS annullate
      FROM bookings
      WHERE coalesce(session_started_at, scheduled_for, requested_at) >= ${naive(from)}
        AND coalesce(session_started_at, scheduled_for, requested_at) < ${naive(to)}
        AND client_id NOT IN (SELECT id FROM users WHERE is_demo)
        AND provider_id NOT IN (
          SELECT pp.id FROM provider_profiles pp
          WHERE pp.user_id IN (SELECT id FROM users WHERE is_demo)
        )
      GROUP BY 1
      ORDER BY 1
    `) as unknown as Promise<
      { bucket: string; completate: number; annullate: number }[]
    >,

    /*
     * Le cause, tutte in una lettura sola.
     *
     * Cinque `GROUP BY` su cinque tabelle diverse, uniti da `UNION ALL`: come
     * cinque query separate sarebbero cinque istruzioni in piu' in volo, e il
     * pooler in modalita' transazione si e' gia' piantato una volta per
     * quello. Le liste dei conti demo sono minuscole e si ripetono qui invece
     * di essere passate, perche' una CTE non attraversa due istruzioni.
     */
    db.execute(sql`
      WITH utenti_demo AS (SELECT id FROM users WHERE is_demo),
      coach_demo AS (
        SELECT pp.id FROM provider_profiles pp
        WHERE pp.user_id IN (SELECT id FROM utenti_demo)
      ),
      sedute_demo AS (
        SELECT n.id FROM session_ai_notes n
        JOIN bookings b ON b.id = n.booking_id
        WHERE b.client_id IN (SELECT id FROM utenti_demo)
           OR b.provider_id IN (SELECT id FROM coach_demo)
      )
      SELECT 'videochiamate'::text AS servizio, v.event_type AS codice,
             count(DISTINCT v.booking_id)::int AS conteggio
      FROM video_session_events v
      WHERE v.occurred_at >= ${naive(from)} AND v.occurred_at < ${naive(to)}
        AND (v.event_type LIKE '%error%' OR v.event_type = 'participant_connection_aborted')
        AND v.booking_id NOT IN (
          SELECT b.id FROM bookings b
          WHERE b.client_id IN (SELECT id FROM utenti_demo)
             OR b.provider_id IN (SELECT id FROM coach_demo)
        )
      GROUP BY 1, 2

      UNION ALL
      -- Quanti coach diversi sono coinvolti: e' la differenza fra «la
      -- postazione di una persona» e «la piattaforma», e non si ricava da
      -- nessun conteggio di eventi.
      SELECT 'videochiamate_coach', 'coach',
             count(DISTINCT b.provider_id)::int
      FROM video_session_events v
      JOIN bookings b ON b.id = v.booking_id
      WHERE v.occurred_at >= ${naive(from)} AND v.occurred_at < ${naive(to)}
        AND (v.event_type LIKE '%error%' OR v.event_type = 'participant_connection_aborted')
        AND b.client_id NOT IN (SELECT id FROM utenti_demo)
        AND b.provider_id NOT IN (SELECT id FROM coach_demo)

      UNION ALL
      SELECT 'registrazioni', coalesce(r.error_code, 'SENZA_CODICE'), count(*)::int
      FROM session_audio_recordings r
      WHERE r.createddate >= ${tz(from)} AND r.createddate < ${tz(to)}
        AND r.status IN ('failed', 'deletion_failed')
        AND r.session_ai_notes_id NOT IN (SELECT id FROM sedute_demo)
      GROUP BY 1, 2

      UNION ALL
      SELECT 'trascrizione', coalesce(n.error_code, 'SENZA_CODICE'), count(*)::int
      FROM session_ai_notes n
      WHERE n.createddate >= ${tz(from)} AND n.createddate < ${tz(to)}
        AND n.status = 'transcription_failed'
        AND n.id NOT IN (SELECT id FROM sedute_demo)
      GROUP BY 1, 2

      UNION ALL
      SELECT 'riepiloghi', coalesce(n.error_code, 'SENZA_CODICE'), count(*)::int
      FROM session_ai_notes n
      WHERE n.createddate >= ${tz(from)} AND n.createddate < ${tz(to)}
        AND n.status = 'report_failed'
        AND n.id NOT IN (SELECT id FROM sedute_demo)
      GROUP BY 1, 2

      UNION ALL
      SELECT 'email', d.template_key, count(*)::int
      FROM notification_email_deliveries d
      WHERE d.created_at >= ${tz(from)} AND d.created_at < ${tz(to)}
        AND d.status = 'failed'
        AND (
          d.recipient_user_id IS NULL
          OR d.recipient_user_id NOT IN (SELECT id FROM utenti_demo)
        )
      GROUP BY 1, 2

      ORDER BY 1, 3 DESC
    `) as unknown as Promise<
      { servizio: string; codice: string; conteggio: number }[]
    >,

    db.execute(sql`
      SELECT
        b.provider_id::int AS provider_id,
        coalesce(
          nullif(trim(p.display_name), ''),
          nullif(trim(concat(coalesce(u.name, ''), ' ', coalesce(u.last_name, ''))), ''),
          u.email
        ) AS coach_name,
        count(*)::int AS sessions
      FROM bookings b
      JOIN provider_profiles pp ON pp.id = b.provider_id
      JOIN users u ON u.id = pp.user_id
      LEFT JOIN profiles p ON p.user_id = pp.user_id
      JOIN users atleta ON atleta.id = b.client_id
      WHERE b.status IN ('accepted', 'completed')
        AND coalesce(b.session_started_at, b.scheduled_for) >= ${naive(from)}
        AND coalesce(b.session_started_at, b.scheduled_for) < ${naive(to)}
        AND u.is_demo = false
        AND atleta.is_demo = false
      GROUP BY 1, 2
      ORDER BY 3 DESC, 2 ASC
      LIMIT 8
    `) as unknown as Promise<
      { provider_id: number; coach_name: string; sessions: number }[]
    >,
  ]);

  // Dopo, e non insieme: `getPipelineHealth` fa tre letture per conto suo, e
  // sommarle alle tre di sopra riporterebbe il pooler dove si era piantato.
  const pipeline = await getPipelineHealth(to);

  /*
   * L'agenda guarda avanti, quindi **non dipende dal periodo**: cambiare da
   * sette a trenta giorni non cambia cosa c'e' domani. Tenerla legata al
   * selettore avrebbe prodotto un numero che si muove senza motivo, cioe' il
   * modo piu' rapido per smettere di fidarsene.
   */
  const upcoming = await getUpcomingAgenda(to);

  /*
   * Le stesse forme di prima, ricavate dall'unica riga: il resto della
   * funzione non si accorge del cambio, e i nomi restano quelli che si
   * leggono nelle card.
   */
  const people = totals;
  const active = totals;
  const bookingsNow = totals;
  const bookingsBefore = { completate: Number(totals.completate_prima ?? 0) };
  const today = totals;
  const guardians = totals;
  const aiSessions = {
    totali: Number(totals.ai_totali ?? 0),
    concluse: Number(totals.ai_concluse ?? 0),
    trascrizione_fallita: Number(totals.ai_trascrizione_fallita ?? 0),
    report_fallito: Number(totals.ai_report_fallito ?? 0),
    rifiutate: Number(totals.ai_rifiutate ?? 0),
    annullate: Number(totals.ai_annullate ?? 0),
    in_lavorazione: Number(totals.ai_in_lavorazione ?? 0),
  };
  const recordings = {
    registrate: Number(totals.reg_registrate ?? 0),
    fallite: Number(totals.reg_fallite ?? 0),
    sedute_con_audio: Number(totals.reg_sedute_con_audio ?? 0),
    secondi: Number(totals.reg_secondi ?? 0),
  };
  const transcripts = {
    sedute_trascritte: Number(totals.sedute_trascritte ?? 0),
  };
  const reports = {
    generati: Number(totals.rep_generati ?? 0),
    approvati: Number(totals.rep_approvati ?? 0),
    falliti: Number(totals.rep_falliti ?? 0),
    sedute: Number(totals.rep_sedute ?? 0),
  };
  const email = {
    inviate: Number(totals.email_inviate ?? 0),
    fallite: Number(totals.email_fallite ?? 0),
  };
  const video = {
    sedute: Number(totals.video_sedute ?? 0),
    problemi: Number(totals.video_sedute_con_problemi ?? 0),
  };

  /** Le cause raggruppate per servizio, gia' descritte e ordinate. */
  const causesByService = new Map<string, ServiceCause[]>();
  for (const row of causeRows) {
    const count = Number(row.conteggio);
    if (count <= 0) continue;
    const described = describeCause(row.servizio, row.codice);
    const list = causesByService.get(row.servizio) ?? [];
    list.push({ code: row.codice, count, ...described });
    causesByService.set(row.servizio, list);
  }
  const coachCoinvolti =
    causesByService.get('videochiamate_coach')?.[0]?.count ?? 0;

  const audioMinutes = Math.round(Number(recordings.secondi ?? 0) / 60);
  const rates = readAiCostRates(process.env);
  const cost = estimateAiCost(
    {
      audioMinutes,
      reportsGenerated: Number(reports.generati ?? 0),
      sessionsWithReport: Number(reports.sedute ?? 0),
    },
    rates
  );

  const kpis = buildKpis({
    period,
    people,
    active,
    bookingsNow,
    bookingsBefore,
    today,
    upcoming,
    transcripts,
    aiSessions,
    pipeline,
  });

  const services = buildServices({
    video,
    causes: causesByService,
    coachCoinvolti,
    recordings,
    transcripts,
    aiSessions,
    reports,
    email,
    pipeline,
  });

  const attention = buildAttentionItems({
    coachDaApprovare: Number(people.coach_da_approvare ?? 0),
    trascrizioniFallite: Number(aiSessions.trascrizione_fallita ?? 0),
    reportFalliti: Number(aiSessions.report_fallito ?? 0),
    jobMaiPresi: pipeline.untouchedJobs,
    attesaMassimaMinuti: pipeline.oldestReadyMinutes,
    sessioniFerme: pipeline.stuckSessions,
    registrazioniFallite: Number(recordings.fallite ?? 0),
    minoriSenzaAutorizzazione: Number(
      guardians.minori_senza_autorizzazione ?? 0
    ),
    emailFallite: Number(email.fallite ?? 0),
    costoOltreSoglia:
      cost.overThreshold && cost.totalEur !== null && cost.threshold !== null
        ? { stimato: cost.totalEur, soglia: cost.threshold }
        : null,
  });

  return {
    kpis,
    services,
    attention,
    sessionsSeries: byDay.map((row) => ({
      bucket: row.bucket,
      completate: Number(row.completate),
      annullate: Number(row.annullate),
    })),
    seriesGranularity: period.granularity,
    upcoming,
    funnel: [
      {
        key: 'sedute',
        label: 'Sedute con Appunti AI',
        value: Number(aiSessions.totali ?? 0),
        note: 'Sedute per cui la funzione è stata avviata nel periodo.',
      },
      {
        key: 'audio',
        label: 'Con audio archiviato',
        value: Number(recordings.sedute_con_audio ?? 0),
        note: 'Almeno una registrazione arrivata a `recorded`.',
      },
      {
        key: 'trascrizione',
        label: 'Con trascrizione',
        value: Number(transcripts.sedute_trascritte ?? 0),
        note: 'Almeno un segmento di trascrizione salvato.',
      },
      {
        key: 'report',
        label: 'Con riepilogo generato',
        value: Number(reports.sedute ?? 0),
        note: 'Il riepilogo è arrivato in revisione o oltre.',
      },
      {
        key: 'approvato',
        label: 'Approvato dal coach',
        value: Number(reports.approvati ?? 0),
        note: 'L’apertura non è tracciata: qui c’è solo l’approvazione, che lo è.',
      },
    ],
    outcomes: [
      { label: 'Concluse', count: Number(aiSessions.concluse ?? 0) },
      { label: 'In lavorazione', count: Number(aiSessions.in_lavorazione ?? 0) },
      {
        label: 'Trascrizione fallita',
        count: Number(aiSessions.trascrizione_fallita ?? 0),
      },
      {
        label: 'Riepilogo fallito',
        count: Number(aiSessions.report_fallito ?? 0),
      },
      { label: 'Consenso rifiutato', count: Number(aiSessions.rifiutate ?? 0) },
      { label: 'Annullate', count: Number(aiSessions.annullate ?? 0) },
    ].filter((row) => row.count > 0),
    coachActivity: coachActivityRows.map((row) => ({
      providerId: Number(row.provider_id),
      coachName: row.coach_name,
      sessions: Number(row.sessions),
    })),
    cost,
    costConfigured: rates.sttPerMinute !== null || rates.reportEach !== null,
    generatedAt: to,
  };
}

function buildKpis(input: {
  period: AdminPeriod;
  people: Counts;
  active: Counts;
  bookingsNow: Counts;
  bookingsBefore: Counts;
  today: Counts;
  upcoming: UpcomingAgenda;
  transcripts: Counts;
  aiSessions: Counts;
  pipeline: { untouchedJobs: number; stuckSessions: number };
}): AdminKpi[] {
  const { period } = input;
  // L'etichetta viene dal periodo, non dai giorni: «Ultimi 365 giorni» sarebbe
  // vero e illeggibile dove l'utente ha chiesto dodici mesi.
  const scope =
    period.key === 'oggi'
      ? 'Oggi (Europa/Roma)'
      : `Ultimi ${period.label.toLowerCase()}`;
  const sempre = 'Dall’inizio';

  const falliti =
    Number(input.aiSessions.trascrizione_fallita ?? 0) +
    Number(input.aiSessions.report_fallito ?? 0) +
    input.pipeline.stuckSessions;

  const delta = (current: number, previous: number) => {
    if (previous <= 0) return null;
    const percent = Math.round(((current - previous) / previous) * 100);
    return {
      percent,
      direction: (percent > 0 ? 'up' : percent < 0 ? 'down' : 'flat') as
        | 'up'
        | 'down'
        | 'flat',
    };
  };

  return [
    {
      key: 'coach-totali',
      label: 'Coach registrati',
      value: Number(input.people.coach_totali ?? 0),
      description: `Profili coach esistenti, in qualunque stato di revisione. ${TOTAL_DEFINITION}`,
      scope: sempre,
      href: '/dashboard/admin/coach',
      delta: null,
      tone: 'neutro',
    },
    {
      key: 'coach-attivi',
      label: 'Coach attivi',
      value: Number(input.active.coach_attivi ?? 0),
      description: ACTIVE_DEFINITION,
      scope,
      href: '/dashboard/admin/coach?stato=approved',
      delta: null,
      tone: 'neutro',
    },
    {
      key: 'coach-da-approvare',
      label: 'Coach da approvare',
      value: Number(input.people.coach_da_approvare ?? 0),
      description:
        'Profili inviati per la revisione e non ancora decisi. Finché sono qui non compaiono in vetrina.',
      scope: sempre,
      href: '/dashboard/admin/coach?stato=pending',
      delta: null,
      tone:
        Number(input.people.coach_da_approvare ?? 0) > 0 ? 'attenzione' : 'neutro',
    },
    {
      key: 'atleti-totali',
      label: 'Atleti registrati',
      value: Number(input.people.atleti_totali ?? 0),
      description: 'Account atleta attivi, esclusi quelli chiusi.',
      scope: sempre,
      href: '/dashboard/admin/utenti',
      delta: null,
      tone: 'neutro',
    },
    {
      key: 'atleti-attivi',
      label: 'Atleti attivi',
      value: Number(input.active.atleti_attivi ?? 0),
      description: ACTIVE_DEFINITION,
      scope,
      href: '/dashboard/admin/utenti',
      delta: null,
      tone: 'neutro',
    },
    {
      key: 'sessioni-oggi',
      label: 'Sedute oggi',
      value: Number(input.today.previste ?? 0),
      description:
        'Confermate, da confermare e già svolte nella giornata di oggi a Roma.',
      scope: 'Oggi (Europa/Roma)',
      href: '/dashboard/admin/sessioni',
      delta: null,
      tone: 'neutro',
    },
    /*
     * Domani accanto a oggi, e non dentro il periodo.
     *
     * E' la voce che mancava del tutto: il selettore copre solo l'indietro, e
     * nessuna delle tre finestre conteneva domani. Un'amministrazione che non
     * sa quante sedute ci sono domani non e' un'amministrazione.
     */
    {
      key: 'sessioni-domani',
      label: 'Sedute domani',
      value: input.upcoming.domani,
      description:
        'Confermate e da confermare per la giornata di domani. Non dipende dal periodo scelto: guarda avanti.',
      scope: 'Domani (Europa/Roma)',
      href: `/dashboard/admin/sessioni?giorno=${input.upcoming.days[1]?.day ?? ''}`,
      delta: null,
      tone: 'neutro',
    },
    {
      key: 'sessioni-completate',
      label: 'Sedute completate',
      value: Number(input.bookingsNow.completate ?? 0),
      description: 'Prenotazioni arrivate allo stato «completata» nel periodo.',
      scope,
      href: '/dashboard/admin/sessioni',
      delta: delta(
        Number(input.bookingsNow.completate ?? 0),
        Number(input.bookingsBefore.completate ?? 0)
      ),
      tone: 'neutro',
    },
    {
      key: 'sessioni-annullate',
      label: 'Sedute annullate o scadute',
      value:
        Number(input.bookingsNow.annullate ?? 0) +
        Number(input.bookingsNow.rifiutate ?? 0) +
        Number(input.bookingsNow.scadute ?? 0),
      description:
        'Annullate, rifiutate e scadute. Lo stato «no-show» non esiste nel modello dati: non viene inventato qui.',
      scope,
      href: '/dashboard/admin/sessioni',
      delta: null,
      tone: 'neutro',
    },
    {
      key: 'trascrizioni',
      label: 'Sedute trascritte',
      value: Number(input.transcripts.sedute_trascritte ?? 0),
      description: 'Sedute con almeno un segmento di trascrizione salvato.',
      scope,
      href: '/dashboard/admin/ai',
      delta: null,
      tone: 'neutro',
    },
    {
      key: 'ai-falliti',
      label: 'Processi AI falliti o fermi',
      value: falliti,
      description:
        'Trascrizioni e riepiloghi falliti nel periodo, più le sedute ferme oltre la scadenza in questo momento.',
      scope: `${scope} · le sedute ferme sono di adesso`,
      href: '/dashboard/admin/ai?stato=fallito',
      delta: null,
      tone: falliti > 0 ? 'critico' : 'neutro',
    },
  ];
}

function buildServices(input: {
  video: Counts;
  causes: Map<string, ServiceCause[]>;
  coachCoinvolti: number;
  recordings: Counts;
  transcripts: Counts;
  aiSessions: Counts;
  reports: Counts;
  email: Counts;
  pipeline: {
    verdict: 'ok' | 'idle' | 'stuck';
    message: string;
    untouchedJobs: number;
  };
}): ServiceVerdict[] {
  const livekitConfigured = Boolean(
    process.env.LIVEKIT_API_KEY?.trim() && process.env.LIVEKIT_API_SECRET?.trim()
  );
  const sttConfigured =
    (process.env.AI_NOTES_STT_PROVIDER?.trim() || 'disabled') !== 'disabled' &&
    Boolean(process.env.DEEPGRAM_API_KEY?.trim());
  const reportConfigured = Boolean(process.env.OPENAI_API_KEY?.trim());
  const emailConfigured =
    Boolean(process.env.RESEND_API_KEY?.trim()) &&
    process.env.EMAIL_NOTIFICATIONS_ENABLED !== 'false';
  const storageConfigured = Boolean(
    process.env.AI_NOTES_AUDIO_S3_ACCESS_KEY?.trim() &&
      process.env.AI_NOTES_AUDIO_S3_ENDPOINT?.trim()
  );

  const cause = (key: string) => input.causes.get(key) ?? [];

  const seduteVideo = Number(input.video.sedute ?? 0);
  const problemiVideo = Number(input.video.problemi ?? 0);

  /*
   * La coda non si giudica a conteggi.
   *
   * `assessPipeline` risponde già alla domanda, ed è testato: passargli i
   * numeri e poi rigiudicarli qui con un secondo criterio produrrebbe due
   * verdetti che possono contraddirsi — la cosa peggiore che un pannello di
   * stato possa fare. Qui si traduce soltanto.
   */
  const coda: ServiceVerdict = {
    key: 'coda',
    label: 'Coda di elaborazione',
    status:
      input.pipeline.verdict === 'stuck'
        ? 'errore'
        : input.pipeline.verdict === 'ok'
          ? 'operativo'
          : 'non_monitorato',
    message:
      input.pipeline.verdict === 'idle'
        ? 'Nessun lavoro in coda: non c’è abbastanza per dire che il worker sta girando.'
        : input.pipeline.message,
    measures:
      'Job pronti mai presi in carico e sedute ferme oltre la scadenza, in questo momento.',
    unit: 'job',
    unitOne: 'job',
    ok: null,
    failed: input.pipeline.untouchedJobs,
    causes: [],
    href: '/dashboard/admin/ai?stato=in_coda',
    hrefLabel: 'Apri la coda',
    action:
      input.pipeline.verdict === 'stuck'
        ? 'Esegui il worker a mano da Configurazione: se dopo resta fermo, il problema non è la sveglia ma il worker.'
        : null,
    expandable: true,
  };

  return [
    assessService({
      key: 'videochiamate',
      label: 'Videochiamate',
      configured: livekitConfigured,
      unconfiguredReason:
        'LiveKit non configurato in questo ambiente: nessun evento da leggere.',
      ok: Math.max(0, seduteVideo - problemiVideo),
      failed: problemiVideo,
      unit: 'sedute',
      unitOne: 'seduta',
      measures:
        'Sedute con attività video nel periodo, e quante di esse hanno avuto almeno un errore o una connessione interrotta. Si contano le sedute, non gli eventi: una seduta con dieci errori è una seduta.',
      causes: cause('videochiamate'),
      href: '/dashboard/admin/video-sessions',
      hrefLabel: 'Apri il registro tecnico',
      action:
        problemiVideo > 0
          ? concentrationHint({
              affected: problemiVideo,
              people: input.coachCoinvolti,
              peopleLabel: 'coach',
            })
          : null,
    }),
    assessService({
      key: 'registrazioni',
      label: 'Registrazioni audio',
      configured: storageConfigured,
      unconfiguredReason:
        'Archivio audio non configurato: la registrazione non può partire.',
      ok: Number(input.recordings.registrate ?? 0),
      failed: Number(input.recordings.fallite ?? 0),
      unit: 'tracce',
      unitOne: 'traccia',
      measures:
        'Tracce audio arrivate a «recorded» contro quelle fallite, nel periodo.',
      causes: cause('registrazioni'),
      href: '/dashboard/admin/ai?errore=registrazione',
      hrefLabel: 'Apri le sedute coinvolte',
      action:
        Number(input.recordings.fallite ?? 0) > 0
          ? 'Senza audio non c’è trascrizione: il messaggio del fornitore sta nel dettaglio della seduta.'
          : null,
    }),
    assessService({
      key: 'trascrizione',
      label: 'Trascrizione',
      configured: sttConfigured,
      unconfiguredReason:
        'Nessun fornitore di trascrizione configurato in questo ambiente.',
      ok: Number(input.transcripts.sedute_trascritte ?? 0),
      failed: Number(input.aiSessions.trascrizione_fallita ?? 0),
      unit: 'sedute',
      unitOne: 'seduta',
      measures:
        'Sedute con almeno un segmento trascritto contro quelle finite in «trascrizione fallita».',
      causes: cause('trascrizione'),
      href: '/dashboard/admin/ai?stato=trascrizione_fallita',
      hrefLabel: 'Apri le sedute fallite',
      action:
        Number(input.aiSessions.trascrizione_fallita ?? 0) > 0
          ? 'Stato terminale per scelta: qui il materiale manca, e riaprire comprerebbe solo un secondo giro di attesa.'
          : null,
    }),
    assessService({
      key: 'riepiloghi',
      label: 'Riepiloghi AI',
      configured: reportConfigured,
      unconfiguredReason:
        'Nessuna chiave OpenAI configurata: i riepiloghi non vengono generati qui.',
      ok: Number(input.reports.generati ?? 0),
      failed: Number(input.aiSessions.report_fallito ?? 0),
      unit: 'sedute',
      unitOne: 'seduta',
      measures:
        'Riepiloghi arrivati in revisione contro le sedute finite in «riepilogo fallito», nel periodo.',
      causes: cause('riepiloghi'),
      href: '/dashboard/admin/ai?stato=report_fallito',
      hrefLabel: 'Apri e riprendi',
      action:
        Number(input.aiSessions.report_fallito ?? 0) > 0
          ? 'Sono le uniche sedute recuperabili: la trascrizione di solito è ancora in tabella e il dettaglio ha il pulsante per riprenderle.'
          : null,
    }),
    assessService({
      key: 'email',
      label: 'Email e notifiche',
      configured: emailConfigured,
      unconfiguredReason:
        'Resend non configurato: le email non partono da questo ambiente.',
      ok: Number(input.email.inviate ?? 0),
      failed: Number(input.email.fallite ?? 0),
      unit: 'consegne',
      unitOne: 'consegna',
      measures: 'Consegne registrate in notification_email_deliveries.',
      causes: cause('email'),
      href: '/dashboard/admin/audit?vista=email',
      hrefLabel: 'Apri le consegne',
      action:
        Number(input.email.fallite ?? 0) > 0
          ? 'Una mail che non arriva non lascia traccia nella schermata che l’ha richiesta: si vede solo da qui.'
          : null,
    }),
    coda,
  ];
}
