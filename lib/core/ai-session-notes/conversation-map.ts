/**
 * La mappa della conversazione: chi ha parlato, quando, per quanto.
 *
 * Modulo puro. Traduce i segmenti della timeline in percentuali, così il
 * disegno è responsivo senza calcoli nel componente e verificabile senza
 * renderizzare nulla.
 *
 * Esiste perché la quota di parola è il dato più utile che il coach abbia su
 * sé stesso, e oggi è un numero solo: «29%». Come forma dice qualcosa che il
 * numero non dice — *quando* l'atleta si è aperto.
 */

export type ConversationRole = 'coach' | 'athlete';

export type ConversationSegmentInput = {
  startMs: number;
  endMs: number;
  role: ConversationRole;
  /** Serve solo a riconoscere le domande; non viene mai mostrato. */
  text?: string;
};

export type ConversationMomentInput = {
  atMs: number;
  label: string;
};

export type ConversationBlock = {
  startPercent: number;
  widthPercent: number;
  startMs: number;
  endMs: number;
};

export type ConversationLane = {
  role: ConversationRole;
  blocks: ConversationBlock[];
  speakingMs: number;
  sharePercent: number;
};

export type ConversationMoment = {
  atPercent: number;
  atMs: number;
  label: string;
};

/**
 * Le tre risposte che un coach cerca guardando una sessione.
 *
 * Sono conteggi su dati che abbiamo già, non stime: un coach smette di
 * fidarsi di tutto il resto se becca una volta sola un numero inventato.
 */
export type ConversationInsight = {
  /** Interventi del coach e quanti contenevano una domanda. */
  coachTurns: number;
  coachQuestionTurns: number;
  /** Durata media di un intervento, in secondi. */
  coachAverageTurnSec: number;
  athleteAverageTurnSec: number;
  /**
   * Se gli interventi dell'atleta si sono allungati nella seconda metà.
   *
   * È il segno che la sessione ha funzionato: risposte corte che diventano
   * lunghe vogliono dire che si è aperto. `null` quando i turni sono troppo
   * pochi perché il confronto significhi qualcosa.
   */
  athleteOpenedUp: boolean | null;
  athleteFirstHalfSec: number;
  athleteSecondHalfSec: number;
};

export type ConversationMap = {
  durationMs: number;
  lanes: ConversationLane[];
  moments: ConversationMoment[];
  /** Chi ha parlato di più. `null` quando la differenza è sotto i 2 punti. */
  dominantRole: ConversationRole | null;
  insight: ConversationInsight;
};

/**
 * Blocchi separati da meno di questo non si distinguono a schermo e
 * trasformano una corsia in rumore: si fondono.
 */
const MERGE_THRESHOLD_MS = 1_500;

function mergeBlocks(
  segments: ConversationSegmentInput[],
  durationMs: number
): { blocks: ConversationBlock[]; speakingMs: number } {
  const ordered = segments
    .filter((s) => s.endMs > s.startMs)
    .sort((a, b) => a.startMs - b.startMs);

  const merged: Array<{ start: number; end: number }> = [];
  for (const segment of ordered) {
    const last = merged[merged.length - 1];
    if (last && segment.startMs - last.end <= MERGE_THRESHOLD_MS) {
      last.end = Math.max(last.end, segment.endMs);
      continue;
    }
    merged.push({ start: segment.startMs, end: segment.endMs });
  }

  const speakingMs = merged.reduce(
    (total, block) => total + (block.end - block.start),
    0
  );
  const blocks = merged.map((block) => ({
    startMs: block.start,
    endMs: block.end,
    startPercent: durationMs > 0 ? (block.start / durationMs) * 100 : 0,
    widthPercent:
      durationMs > 0 ? ((block.end - block.start) / durationMs) * 100 : 0,
  }));
  return { blocks, speakingMs };
}

export function buildConversationMap(input: {
  segments: ConversationSegmentInput[];
  moments?: ConversationMomentInput[];
  /** Durata della sessione; se assente si usa l'ultimo istante parlato. */
  durationMs?: number;
}): ConversationMap {
  const lastMs = input.segments.reduce(
    (max, segment) => Math.max(max, segment.endMs),
    0
  );
  const durationMs = Math.max(input.durationMs ?? 0, lastMs);

  const lanes: ConversationLane[] = (['coach', 'athlete'] as const).map(
    (role) => {
      const { blocks, speakingMs } = mergeBlocks(
        input.segments.filter((segment) => segment.role === role),
        durationMs
      );
      return { role, blocks, speakingMs, sharePercent: 0 };
    }
  );

  // La quota è sul tempo parlato, non sulla durata: le pause non appartengono
  // a nessuno dei due e gonfiarle a favore di uno falserebbe il confronto.
  const totalSpeaking = lanes.reduce((total, lane) => total + lane.speakingMs, 0);
  for (const lane of lanes) {
    lane.sharePercent =
      totalSpeaking > 0 ? Math.round((lane.speakingMs / totalSpeaking) * 100) : 0;
  }

  const coach = lanes[0].sharePercent;
  const athlete = lanes[1].sharePercent;
  const dominantRole =
    Math.abs(coach - athlete) < 2 ? null : coach > athlete ? 'coach' : 'athlete';

  const moments: ConversationMoment[] = (input.moments ?? [])
    .filter((moment) => moment.atMs >= 0 && moment.atMs <= durationMs)
    .sort((a, b) => a.atMs - b.atMs)
    .map((moment) => ({
      atMs: moment.atMs,
      label: moment.label,
      atPercent: durationMs > 0 ? (moment.atMs / durationMs) * 100 : 0,
    }));

  return {
    durationMs,
    lanes,
    moments,
    dominantRole,
    insight: buildInsight(input.segments, durationMs),
  };
}

/** Una domanda si riconosce dal punto interrogativo: nessuna euristica fine. */
function isQuestion(text: string | undefined): boolean {
  return typeof text === 'string' && text.includes('?');
}

function averageSeconds(segments: ConversationSegmentInput[]): number {
  if (segments.length === 0) return 0;
  const total = segments.reduce((sum, s) => sum + (s.endMs - s.startMs), 0);
  return Math.round(total / segments.length / 1000);
}

/**
 * Sotto questa soglia il confronto fra prima e seconda metà non significa
 * nulla: due turni per metà possono ribaltarsi per caso.
 */
const MIN_TURNS_FOR_OPENING = 6;

function buildInsight(
  segments: ConversationSegmentInput[],
  durationMs: number
): ConversationInsight {
  const coach = segments.filter((s) => s.role === 'coach');
  const athlete = segments.filter((s) => s.role === 'athlete');
  const midpoint = durationMs / 2;
  const first = athlete.filter((s) => s.startMs < midpoint);
  const second = athlete.filter((s) => s.startMs >= midpoint);
  const firstSec = averageSeconds(first);
  const secondSec = averageSeconds(second);

  return {
    coachTurns: coach.length,
    coachQuestionTurns: coach.filter((s) => isQuestion(s.text)).length,
    coachAverageTurnSec: averageSeconds(coach),
    athleteAverageTurnSec: averageSeconds(athlete),
    athleteOpenedUp:
      athlete.length < MIN_TURNS_FOR_OPENING ||
      first.length === 0 ||
      second.length === 0
        ? null
        : secondSec > firstSec,
    athleteFirstHalfSec: firstSec,
    athleteSecondHalfSec: secondSec,
  };
}
