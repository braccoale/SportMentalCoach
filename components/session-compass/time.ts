/** Timestamp reale della timeline, senza arrotondarlo al solo minuto. */
export function formatTranscriptTimestamp(startMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(startMs / 1_000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
