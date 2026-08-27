/**
 * La timeline della seduta: la regola, senza il database.
 *
 * **Perché questo file non importa `@/lib/db/drizzle`.** Fino al 2026-08-26 le
 * funzioni pure e quelle che leggono il database vivevano insieme qui. Il
 * risultato: `timeline.test.ts` — che verifica solo ordinamento, normalizzazione
 * e fingerprint, cioè tre funzioni pure — tirava dentro il client Postgres al
 * solo caricamento del modulo, e senza `POSTGRES_URL` moriva prima di eseguire
 * un test. In locale non si vedeva, perché `.env.local` c'è sempre. Alla prima
 * corsa della CI, che un `.env` non ce l'ha, sono saltati sei test.
 *
 * La convenzione era già in questa cartella: `coach-bookmarks.ts` accanto a
 * `coach-bookmarks-store.ts`. Ora la segue anche la timeline.
 */
import { createHash } from 'node:crypto';

export type TimelineSource = { id: number; participantRecordingId: number; participantUserId: number | null; participantRole: 'coach' | 'athlete'; participantSequence: number; startMs: number; endMs: number; text: string; provider: string | null; model: string | null };
export type TimelineSegment = TimelineSource & { globalSequence: number; normalizedText: string; flags: Record<string, boolean> };
export function normalizeTranscriptText(value: string): string { return value.replace(/\r\n?/g, '\n').replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/[\u2013\u2014]/g, '-').replace(/\s+/g, ' ').trim(); }
export function sourceFingerprint(sources: TimelineSource[]): string { return createHash('sha256').update(sources.slice().sort((a,b) => a.id-b.id).map(s => [s.id,s.participantSequence,s.startMs,s.endMs,s.text,s.provider,s.model].join('|')).join('\n')).digest('hex'); }
export function buildTimeline(sources: TimelineSource[]): { segments: TimelineSegment[]; statistics: Record<string, number>; fingerprint: string } {
  const valid = sources.flatMap(source => { const normalizedText = normalizeTranscriptText(source.text); if (!normalizedText || source.endMs < source.startMs || source.startMs < 0) return []; const flags: Record<string, boolean> = {}; if (source.endMs === source.startMs) flags.duration_zero = true; return [{...source, normalizedText, flags}]; });
  valid.sort((a,b) => a.startMs-b.startMs || a.endMs-b.endMs || a.participantRole.localeCompare(b.participantRole) || a.id-b.id);
  let previousEnd=0, overlap=0, gaps=0; const durations={coach:0,athlete:0}; const counts={coach:0,athlete:0};
  const segments = valid.map((source,globalSequence) => { if(globalSequence && source.startMs<previousEnd) { source.flags.overlaps_previous=true; overlap += Math.min(previousEnd,source.endMs)-source.startMs; } if(globalSequence && source.startMs-previousEnd>=5000) {source.flags.large_gap_before=true; gaps += source.startMs-previousEnd;} previousEnd=Math.max(previousEnd,source.endMs); durations[source.participantRole]+=source.endMs-source.startMs; counts[source.participantRole]++; return {...source,globalSequence}; });
  const total=durations.coach+durations.athlete;
  return {segments,fingerprint:sourceFingerprint(sources),statistics:{total_timeline_duration_ms:segments.length?previousEnd-segments[0].startMs:0,coach_speaking_duration_ms:durations.coach,athlete_speaking_duration_ms:durations.athlete,coach_segment_count:counts.coach,athlete_segment_count:counts.athlete,coach_percentage:total?durations.coach/total:0,athlete_percentage:total?durations.athlete/total:0,silence_gap_duration_ms:gaps,overlap_duration_ms:overlap,first_timestamp_ms:segments[0]?.startMs??0,last_timestamp_ms:segments.at(-1)?.endMs??0,source_segment_count:sources.length,normalized_segment_count:segments.length}};
}

/**
 * Impronta del contenuto della timeline.
 *
 * Risponde a una domanda sola: la trascrizione è cambiata? È deliberatamente
 * indipendente dagli id delle righe, che cambiano a ogni ricostruzione anche
 * quando il parlato è identico — usarli farebbe rigenerare il riepilogo a
 * vuoto ogni volta — e dalla versione del contratto del report, che riguarda
 * la validità di una bozza e non il contenuto.
 */
export function timelineRowsFingerprint(
  rows: readonly {
    startMs: number;
    endMs: number;
    participantRole: string;
    normalizedText: string;
  }[]
): string {
  const payload = rows
    .slice()
    .sort(
      (left, right) =>
        left.startMs - right.startMs ||
        left.endMs - right.endMs ||
        left.participantRole.localeCompare(right.participantRole) ||
        left.normalizedText.localeCompare(right.normalizedText)
    )
    .map((row) =>
      [row.startMs, row.endMs, row.participantRole, row.normalizedText].join('|')
    )
    .join('\n');
  return createHash('sha256').update(payload).digest('hex');
}
