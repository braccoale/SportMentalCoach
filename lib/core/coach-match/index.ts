import 'server-only';
import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { providerProfiles, profiles, services, users } from '@/lib/db/schema';
import { findTaxonomyItem, getVerticalConfig } from '@/lib/core/config';
import { SHOW_COACH_HOURLY_RATE } from '@/lib/core/flags';
import { normalizeMatchAnswers, type MatchAnswers } from './answers';
import { runCoachMatch, type MatchResult } from './match';
import { openAiCoachAffinityFromEnvironment } from './openai-provider';
import type { MatchCandidate } from './scoring';

async function loadCandidates(): Promise<MatchCandidate[]> {
  const rows = await db
    .select({
      providerId: providerProfiles.id,
      slug: providerProfiles.slug,
      displayName: profiles.displayName,
      headline: providerProfiles.headline,
      description: providerProfiles.description,
      avatarUrl: profiles.avatarUrl,
      categories: providerProfiles.categories,
      specialties: providerProfiles.specialties,
      athleteLevels: providerProfiles.athleteLevels,
      currency: providerProfiles.currency,
      yearsExperience: providerProfiles.yearsExperience,
    })
    .from(providerProfiles)
    .innerJoin(users, eq(users.id, providerProfiles.userId))
    .leftJoin(profiles, eq(profiles.userId, providerProfiles.userId))
    .where(
      and(
        eq(providerProfiles.status, 'approved'),
        isNotNull(providerProfiles.slug),
        eq(users.isDemo, false)
      )
    );
  if (rows.length === 0) return [];

  const serviceRows = await db
    .select({ providerId: services.providerId, price: services.price })
    .from(services)
    .where(
      and(
        inArray(
          services.providerId,
          rows.map((r) => r.providerId)
        ),
        eq(services.isActive, true),
        eq(services.isIntro, false)
      )
    );
  const minPrice = new Map<number, number>();
  for (const s of serviceRows) {
    if (s.price == null || s.price <= 0) continue;
    const current = minPrice.get(s.providerId);
    if (current == null || s.price < current) minPrice.set(s.providerId, s.price);
  }

  return rows.map((r) => ({
    providerId: r.providerId,
    slug: r.slug as string,
    displayName: r.displayName,
    headline: r.headline,
    description: r.description,
    avatarUrl: r.avatarUrl,
    categories: r.categories ?? [],
    specialties: r.specialties ?? [],
    athleteLevels: r.athleteLevels ?? [],
    minPriceCents: minPrice.get(r.providerId) ?? null,
    currency: r.currency,
    yearsExperience: r.yearsExperience,
  }));
}

/**
 * Abbina le risposte ai coach approvati. Il testo libero e le risposte non
 * vengono salvati né scritti nei log: se il provider fallisce si registra
 * solo il messaggio dell'errore, mai il contenuto.
 */
export async function matchCoaches(rawAnswers: unknown): Promise<MatchResult> {
  const normalized: MatchAnswers = normalizeMatchAnswers(rawAnswers);
  // Finché i prezzi non sono pubblici non si filtra per un dato che l'atleta non vede.
  const answers: MatchAnswers = SHOW_COACH_HOURLY_RATE
    ? normalized
    : { ...normalized, budgetMaxCents: null };
  const config = getVerticalConfig();
  const label = (items: { key: string; label: string }[]) => (key: string) =>
    findTaxonomyItem(items, key)?.label ?? key;
  const candidates = await loadCandidates();
  return runCoachMatch(
    SHOW_COACH_HOURLY_RATE ? candidates : candidates.map((c) => ({ ...c, minPriceCents: null })),
    answers,
    {
      provider: openAiCoachAffinityFromEnvironment(),
      specialtyLabel: label(config.taxonomies.specialties),
      sportLabel: label(config.taxonomies.categories),
      onProviderFailure: (error) =>
        console.error(
          '[coach-match] provider non disponibile:',
          error instanceof Error ? error.message : 'errore'
        ),
    }
  );
}
