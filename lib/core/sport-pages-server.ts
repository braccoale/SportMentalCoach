import 'server-only';
import { getApprovedCoaches } from '@/lib/core/listings';
import { getActiveSports } from '@/lib/core/taxonomies';
import { eligibleSportPages, type SportPage } from '@/lib/core/sport-pages';

/** Le pagine per sport che esistono oggi, dai coach approvati veri (mai dalla demo). */
export async function getSportPages(): Promise<SportPage[]> {
  const [sports, coaches] = await Promise.all([getActiveSports(), getApprovedCoaches()]);
  return eligibleSportPages(
    sports,
    coaches.map((c) => c.categories)
  );
}
