export type ConfigCacheEntry<T> = {
  value: T;
  expiresAt: number;
};

export const CONFIG_CACHE_TTL_MS = 60_000;

/** `now` è un parametro esplicito: niente `Date.now()` dentro una funzione pura. */
export function isCacheEntryValid<T>(
  entry: ConfigCacheEntry<T> | undefined,
  now: number
): entry is ConfigCacheEntry<T> {
  return entry !== undefined && entry.expiresAt > now;
}

export function makeCacheEntry<T>(
  value: T,
  now: number,
  ttlMs: number = CONFIG_CACHE_TTL_MS
): ConfigCacheEntry<T> {
  return { value, expiresAt: now + ttlMs };
}
