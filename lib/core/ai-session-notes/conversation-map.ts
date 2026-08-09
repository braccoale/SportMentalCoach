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

export type ConversationMap = {
  durationMs: number;
  lanes: ConversationLane[];
  moments: ConversationMoment[];
  /** Chi ha parlato di più. `null` quando la differenza è sotto i 2 punti. */
  dominantRole: ConversationRole | null;
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

  return { durationMs, lanes, moments, dominantRole };
}
