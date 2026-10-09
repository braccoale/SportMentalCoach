import 'server-only';
import { getCoachExperienceStats } from '@/lib/core/bookings';
import { getProviderProfileByUser } from '@/lib/core/profiles';
import { getRatingSummaries } from '@/lib/core/reviews';
import { suggestRate, type RateSuggestion } from './index';

/**
 * Il suggerimento di tariffa per il coach che guarda la pagina dei servizi.
 * Legge solo i dati del coach stesso. Un guasto qui toglie il suggerimento, non
 * la pagina: chi chiama gestisce il `null`.
 */
export async function getRateSuggestionForCoach(userId: number): Promise<RateSuggestion | null> {
  const provider = await getProviderProfileByUser(userId);
  if (!provider) return null;

  const [stats, ratings] = await Promise.all([
    getCoachExperienceStats([provider.id]),
    getRatingSummaries([provider.id]),
  ]);
  const s = stats.get(provider.id) ?? { athletesCount: 0, totalMinutes: 0, completedSessions: 0 };
  const r = ratings.get(provider.id) ?? { count: 0, average: null };

  return suggestRate({
    yearsExperience: provider.yearsExperience,
    totalMinutes: s.totalMinutes,
    athletesCount: s.athletesCount,
    ratingAverage: r.average,
    ratingCount: r.count,
    certificationsCount: (provider.certifications ?? []).filter((c) => c.trim().length > 0).length,
    certificationsVerified: provider.certificationsVerified,
    athleteLevels: provider.athleteLevels ?? [],
  });
}
