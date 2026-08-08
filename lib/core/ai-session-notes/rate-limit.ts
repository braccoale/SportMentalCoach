import 'server-only';

const globalRateLimit = globalThis as unknown as {
  __aiNotesRecordingRateLimit?: Map<
    string,
    { count: number; resetAt: number }
  >;
};
const buckets =
  globalRateLimit.__aiNotesRecordingRateLimit ??
  new Map<string, { count: number; resetAt: number }>();
globalRateLimit.__aiNotesRecordingRateLimit = buckets;

/**
 * Per-authenticated-user abuse guard. Correctness and idempotency remain in
 * the database, so this best-effort process-local limiter is not a lock.
 */
export function allowRecordingMutation(
  userId: number,
  action: 'start' | 'stop' | 'close',
  now = Date.now()
): boolean {
  const key = `${userId}:${action}`;
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (current.count >= 10) return false;
  current.count += 1;
  return true;
}

