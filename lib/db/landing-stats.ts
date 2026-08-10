import 'server-only';
import { unstable_cache } from 'next/cache';
import { db } from './drizzle';
import { landingStats, type LandingStats } from './schema';

/** Quanto a lungo la home puo' mostrare gli stessi numeri (secondi). */
export const LANDING_STATS_TTL = 60;

/** Quando il DB non risponde la home deve comunque aprirsi: niente numeri. */
const EMPTY: LandingStats = {
  coaches: 0,
  athletes: 0,
  sessions: 0,
  coachingHours: 0,
};

/**
 * Numeri reali della piattaforma per la hero della landing.
 *
 * Letti dalla vista `landing_stats` (migrazione 0051), non calcolati qui:
 * la definizione di cosa conta come coach, atleta o ora di coaching sta nel
 * database ed e' una sola per tutto il prodotto.
 *
 * Il risultato e' in cache per un minuto. La home e' la pagina piu' visitata
 * del sito e questi totali cambiano di rado: senza cache ogni bot pagherebbe
 * quattro aggregazioni. Un minuto e' abbastanza "live" per numeri di questo
 * tipo e abbastanza lungo da rendere la pagina di fatto statica sotto carico.
 */
export const getLandingStats = unstable_cache(
  async (): Promise<LandingStats> => {
    try {
      const [row] = await db.select().from(landingStats).limit(1);
      return row ?? EMPTY;
    } catch (error) {
      console.error('[landing-stats] lettura fallita', error);
      return EMPTY;
    }
  },
  ['landing-stats'],
  { revalidate: LANDING_STATS_TTL, tags: ['landing-stats'] }
);
