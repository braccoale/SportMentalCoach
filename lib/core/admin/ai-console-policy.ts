/**
 * Come si legge una seduta nella console della pipeline AI.
 *
 * Due domande, e sono diverse: **a che punto è** (la fase) e **come sta
 * andando** (lo stato). Tenerle insieme è ciò che ha reso illeggibile la
 * prima versione del cruscotto: `processing` risponde alla prima e non alla
 * seconda, ed è lo stesso valore che porta addosso una seduta che sta
 * lavorando bene e una ferma da un'ora.
 *
 * La regola di «bloccato» **non nasce qui**. Nasce in
 * `ai-session-notes/session-deadlines.ts`, che è la stessa regola con cui la
 * pipeline decide di chiudere d'ufficio una seduta scaduta. Una seconda
 * soglia, definita per l'amministrazione, avrebbe prodotto la cosa peggiore:
 * una console che dice «bloccata» su una seduta che il sistema considera
 * sana, o viceversa. Con 155 moduli in `lib/core/` la regola che serve di
 * solito esiste già.
 *
 * Modulo puro: nessun I/O, nessun database, `now` sempre passato.
 */

import type { AiSessionNoteStatus } from '@/lib/db/schema';
import {
  ACTIVE_WORK_MINUTES,
  NO_ACTIVE_WORK_MINUTES,
  processingDeadlineVerdict,
} from '@/lib/core/ai-session-notes/session-deadlines';

/** Le soglie in chiaro, per il tooltip: la regola si spiega, non si subisce. */
export const STUCK_RULE = {
  senzaLavoroAttivoMinuti: NO_ACTIVE_WORK_MINUTES,
  conLavoroAttivoMinuti: ACTIVE_WORK_MINUTES,
} as const;

export type PipelineState =
  | 'in_corso'
  | 'in_coda'
  | 'bloccato'
  | 'completato'
  | 'fallito'
  | 'rifiutato'
  | 'annullato'
  | 'in_seduta';

export type PipelinePhase =
  | 'consenso'
  | 'seduta'
  | 'trascrizione'
  | 'normalizzazione'
  | 'riepilogo'
  | 'nessun_lavoro'
  | 'revisione_coach'
  | 'condiviso'
  | 'chiusa';

export const PIPELINE_STATE_LABEL: Record<PipelineState, string> = {
  in_corso: 'In lavorazione',
  in_coda: 'In coda',
  bloccato: 'Bloccata',
  completato: 'Completata',
  fallito: 'Fallita',
  rifiutato: 'Consenso rifiutato',
  annullato: 'Annullata',
  in_seduta: 'Seduta in corso',
};

export const PIPELINE_PHASE_LABEL: Record<PipelinePhase, string> = {
  consenso: 'Attesa consenso',
  seduta: 'Seduta',
  trascrizione: 'Trascrizione',
  normalizzazione: 'Normalizzazione',
  riepilogo: 'Riepilogo',
  nessun_lavoro: 'Nessun lavoro accodato',
  revisione_coach: 'Attesa del coach',
  condiviso: 'Condivisa',
  chiusa: 'Chiusa',
};

const TERMINAL_FAILURE: readonly AiSessionNoteStatus[] = [
  'transcription_failed',
  'report_failed',
];

const TERMINAL_SUCCESS: readonly AiSessionNoteStatus[] = [
  'ready_for_review',
  'approved',
  'shared',
];

/**
 * Il lavoro vivo di una seduta, ridotto a ciò che serve per capire dov'è.
 *
 * `neverAttempted` è il segnale che vale più di tutti: un job pronto con zero
 * tentativi non è lento, è **mai guardato da nessuno**.
 */
export type PipelineJobSummary = {
  jobType: 'transcription' | 'transcript_normalization' | 'report_generation';
  status: 'queued' | 'processing' | 'awaiting_provider' | 'completed' | 'failed' | 'cancelled';
  attemptCount: number;
};

const ACTIVE_JOB_STATUSES = ['queued', 'processing', 'awaiting_provider'];

/** L'ordine in cui il lavoro attraversa la pipeline: la fase è l'ultima viva. */
const PHASE_BY_JOB: Record<PipelineJobSummary['jobType'], PipelinePhase> = {
  transcription: 'trascrizione',
  transcript_normalization: 'normalizzazione',
  report_generation: 'riepilogo',
};

export type PipelineClassification = {
  state: PipelineState;
  phase: PipelinePhase;
  /** Vero quando la seduta ha superato la scadenza della pipeline. */
  stuck: boolean;
  /** Perché è bloccata, quando lo è: si mostra nel dettaglio. */
  stuckReason: 'no_active_work' | 'work_too_slow' | null;
};

export function classifyPipelineSession(input: {
  status: AiSessionNoteStatus;
  /** Ultimo momento in cui qualcosa si è mosso su questa seduta. */
  lastProgressAt: Date;
  jobs: readonly PipelineJobSummary[];
  now: Date;
}): PipelineClassification {
  const activeJobs = input.jobs.filter((job) =>
    ACTIVE_JOB_STATUSES.includes(job.status)
  );

  if (TERMINAL_FAILURE.includes(input.status)) {
    return { state: 'fallito', phase: 'chiusa', stuck: false, stuckReason: null };
  }
  if (input.status === 'consent_rejected') {
    return { state: 'rifiutato', phase: 'chiusa', stuck: false, stuckReason: null };
  }
  if (input.status === 'cancelled') {
    return { state: 'annullato', phase: 'chiusa', stuck: false, stuckReason: null };
  }
  if (TERMINAL_SUCCESS.includes(input.status)) {
    return {
      state: 'completato',
      phase: input.status === 'ready_for_review' ? 'revisione_coach' : 'condiviso',
      stuck: false,
      stuckReason: null,
    };
  }
  if (input.status === 'waiting_for_consent') {
    return { state: 'in_corso', phase: 'consenso', stuck: false, stuckReason: null };
  }
  if (input.status === 'active') {
    return { state: 'in_seduta', phase: 'seduta', stuck: false, stuckReason: null };
  }

  // Da qui in poi: `processing`. È l'unico stato in cui la scadenza ha senso,
  // perché è l'unico in cui il sistema si è preso un impegno.
  const verdict = processingDeadlineVerdict({
    lastProgressAt: input.lastProgressAt,
    activeJobCount: activeJobs.length,
    now: input.now,
  });

  const phase = pipelinePhaseFromJobs(activeJobs);

  if (verdict.expired) {
    return {
      state: 'bloccato',
      phase,
      stuck: true,
      stuckReason: verdict.reason,
    };
  }

  const tuttiMaiTentati =
    activeJobs.length > 0 &&
    activeJobs.every(
      (job) => job.status === 'queued' && job.attemptCount === 0
    );

  return {
    state: tuttiMaiTentati ? 'in_coda' : 'in_corso',
    phase,
    stuck: false,
    stuckReason: null,
  };
}

/**
 * La fase più avanzata fra i lavori ancora vivi.
 *
 * Senza lavoro vivo la fase è `nessun_lavoro`, che è un'informazione e non un
 * vuoto: una seduta in `processing` senza niente accodato è la firma esatta
 * del difetto che ha lasciato la seduta del 16 agosto ferma con 592 segmenti
 * di trascrizione già in tabella.
 */
export function pipelinePhaseFromJobs(
  activeJobs: readonly PipelineJobSummary[]
): PipelinePhase {
  if (activeJobs.some((job) => job.jobType === 'report_generation')) {
    return PHASE_BY_JOB.report_generation;
  }
  if (activeJobs.some((job) => job.jobType === 'transcript_normalization')) {
    return PHASE_BY_JOB.transcript_normalization;
  }
  if (activeJobs.some((job) => job.jobType === 'transcription')) {
    return PHASE_BY_JOB.transcription;
  }
  return 'nessun_lavoro';
}

/* ── Filtri della tabella operativa ─────────────────────────────────────── */

export const AI_CONSOLE_PAGE_SIZE = 25;
export const AI_CONSOLE_MAX_PAGE = 400;

export const AI_CONSOLE_STATES: readonly PipelineState[] = [
  'in_seduta',
  'in_corso',
  'in_coda',
  'bloccato',
  'completato',
  'fallito',
  'rifiutato',
  'annullato',
];

export const AI_CONSOLE_PHASES: readonly PipelinePhase[] = [
  'consenso',
  'seduta',
  'trascrizione',
  'normalizzazione',
  'riepilogo',
  'nessun_lavoro',
  'revisione_coach',
  'condiviso',
  'chiusa',
];

export type AiConsoleFilters = {
  stato: PipelineState | null;
  fase: PipelinePhase | null;
  /** `provider_profiles.id`, non lo user id: è la chiave della prenotazione. */
  coachProviderId: number | null;
  /** Codice d'errore esatto, dal set chiuso che il database contiene. */
  errore: string | null;
  /** `YYYY-MM-DD`, giorno di calendario a Roma. */
  da: string | null;
  a: string | null;
  page: number;
};

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
/** Come i codici in `AiNotesErrorCode`: maiuscole, cifre e trattino basso. */
const ERROR_CODE = /^[A-Z][A-Z0-9_]{1,79}$/;

type RawParams = Record<string, string | string[] | undefined>;

function single(raw: string | string[] | undefined): string | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/**
 * I filtri della query string, validati contro insiemi chiusi.
 *
 * Nessun valore arriva al database senza essere passato di qui: gli stati e
 * le fasi sono enumerazioni, il coach è un intero, l'errore deve avere la
 * forma di un codice e le date quella di un giorno. Un parametro storto viene
 * **ignorato**, non propagato e non fatto fallire — un indirizzo condiviso in
 * chat non deve produrre una pagina rotta.
 */
export function parseAiConsoleFilters(params: RawParams): AiConsoleFilters {
  const stato = single(params.stato);
  const fase = single(params.fase);
  const coach = Number(single(params.coach));
  const errore = single(params.errore);
  const da = single(params.da);
  const a = single(params.a);
  const page = Number(single(params.pagina));

  return {
    stato: AI_CONSOLE_STATES.includes(stato as PipelineState)
      ? (stato as PipelineState)
      : null,
    fase: AI_CONSOLE_PHASES.includes(fase as PipelinePhase)
      ? (fase as PipelinePhase)
      : null,
    coachProviderId:
      Number.isInteger(coach) && coach > 0 && coach < 2_147_483_647
        ? coach
        : null,
    errore: errore && ERROR_CODE.test(errore) ? errore : null,
    da: da && ISO_DAY.test(da) ? da : null,
    a: a && ISO_DAY.test(a) ? a : null,
    page:
      Number.isInteger(page) && page > 1
        ? Math.min(page, AI_CONSOLE_MAX_PAGE)
        : 1,
  };
}

/** L'indirizzo che rappresenta questi filtri: un link condivisibile. */
export function aiConsoleQueryString(
  filters: AiConsoleFilters,
  override: Partial<AiConsoleFilters> = {}
): string {
  const merged = { ...filters, ...override };
  const params = new URLSearchParams();
  if (merged.stato) params.set('stato', merged.stato);
  if (merged.fase) params.set('fase', merged.fase);
  if (merged.coachProviderId) params.set('coach', String(merged.coachProviderId));
  if (merged.errore) params.set('errore', merged.errore);
  if (merged.da) params.set('da', merged.da);
  if (merged.a) params.set('a', merged.a);
  if (merged.page > 1) params.set('pagina', String(merged.page));
  const query = params.toString();
  return query ? `?${query}` : '';
}

/** Quante righe saltare, dato il numero di pagina già validato. */
export function aiConsoleOffset(page: number): number {
  return (Math.max(1, page) - 1) * AI_CONSOLE_PAGE_SIZE;
}

export function aiConsolePageCount(total: number): number {
  return Math.max(1, Math.ceil(total / AI_CONSOLE_PAGE_SIZE));
}

/**
 * Se la seduta può essere ripresa, e perché no quando no.
 *
 * La regola è quella della macchina a stati, non una nuova: **l'unica**
 * transizione all'indietro è `report_failed → processing`, e richiede che la
 * trascrizione ci sia ancora. `transcription_failed` resta chiuso di
 * proposito — lì il materiale manca, e riaprire comprerebbe solo un secondo
 * giro di attesa.
 *
 * `processing` è ammesso perché è il caso di una seduta riaperta e rimasta
 * ferma senza risvegliare il job del riepilogo: rilanciare deve poterla
 * sbloccare, come fa `npm run ai-notes:reopen`.
 */
export function retryAvailability(
  status: string,
  transcriptSegments: number
): { allowed: boolean; reason: string } {
  if (status === 'transcription_failed') {
    return {
      allowed: false,
      reason:
        'La trascrizione non esiste: riaprire non produrrebbe nulla, solo un secondo giro di attesa. Stato terminale per scelta.',
    };
  }
  if (status !== 'report_failed' && status !== 'processing') {
    return {
      allowed: false,
      reason: `Si riprendono solo le sedute in «riepilogo fallito». Questa è in «${status}».`,
    };
  }
  if (transcriptSegments === 0) {
    return {
      allowed: false,
      reason:
        'Nessun segmento di trascrizione: non c’è niente da riprendere.',
    };
  }
  return {
    allowed: true,
    reason:
      'La trascrizione è ancora in tabella: la seduta torna in lavorazione e il riepilogo viene rimesso in coda.',
  };
}
