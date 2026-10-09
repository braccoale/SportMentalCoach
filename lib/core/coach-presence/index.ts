/**
 * Chi è online fra i coach, per il bollino «Online» sulla foto nell'elenco.
 *
 * «Online» qui vuol dire una cosa precisa: il coach ha la sua area di KaiPai
 * aperta in questo momento. Non vuol dire «risponde subito» né «è libero per
 * una chiamata». La presenza è effimera e non si salva da nessuna parte: i
 * coach la segnalano su un canale Supabase Realtime (Presence) mentre l'area è
 * aperta, e sparisce da sola quando chiudono la scheda o cade la connessione.
 * Niente colonne, niente scritture sul database, niente migrazioni.
 *
 * Modulo puro, senza `server-only`: lo leggono i componenti nel browser e i test.
 */
export const COACH_PRESENCE_CHANNEL = 'coach-presence';

/** La chiave con cui un coach compare nello stato di presenza. */
export function coachPresenceKey(providerId: number): string {
  return `coach-${providerId}`;
}

type PresenceMeta = { providerId?: unknown };

/**
 * Dallo stato di presenza di Supabase (`{ chiave: [meta, …] }`) gli id dei
 * coach online. Si fida del contenuto dichiarato nel `meta`, non della sola
 * chiave, e scarta tutto ciò che non è un id intero positivo (gli spettatori
 * dell'elenco non tracciano, ma uno stato strano non deve rompere l'elenco).
 */
export function onlineProviderIds(state: Record<string, unknown>): Set<number> {
  const ids = new Set<number>();
  for (const metas of Object.values(state ?? {})) {
    if (!Array.isArray(metas)) continue;
    for (const meta of metas as PresenceMeta[]) {
      const id = meta?.providerId;
      if (typeof id === 'number' && Number.isInteger(id) && id > 0) ids.add(id);
    }
  }
  return ids;
}

/** Due insiemi uguali? Serve a non riscrivere lo stato (e rifare il rendering) quando non è cambiato niente. */
export function sameIds(a: ReadonlySet<number>, b: ReadonlySet<number>): boolean {
  if (a.size !== b.size) return false;
  for (const id of a) if (!b.has(id)) return false;
  return true;
}
