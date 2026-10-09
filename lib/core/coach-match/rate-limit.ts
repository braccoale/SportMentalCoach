/**
 * Limite di richieste per indirizzo, in memoria.
 *
 * L'endpoint del wizard è pubblico e ogni richiesta può costare una chiamata
 * a OpenAI. Su Vercel ogni istanza ha la sua memoria, quindi il limite è
 * «per istanza»: non è una barriera assoluta, ma ferma il ciclo che ripete la
 * stessa richiesta mille volte. Il testo è già limitato in lunghezza e, se il
 * provider non c'è, il wizard funziona comunque con il confronto lessicale.
 *
 * Modulo puro: il tempo lo passa il chiamante.
 */
export type RateLimiter = {
  /** true se la richiesta è ammessa (e viene contata). */
  allow(key: string, now: number): boolean;
};

export function createRateLimiter(max: number, windowMs: number): RateLimiter {
  const hits = new Map<string, number[]>();
  return {
    allow(key, now) {
      const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
      if (recent.length >= max) {
        hits.set(key, recent);
        return false;
      }
      recent.push(now);
      hits.set(key, recent);
      // Pulizia occasionale: la mappa non cresce senza fine.
      if (hits.size > 5000) {
        for (const [k, v] of hits) if (v.every((t) => now - t >= windowMs)) hits.delete(k);
      }
      return true;
    },
  };
}
