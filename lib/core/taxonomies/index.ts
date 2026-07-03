import 'server-only';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { sports, specialties } from '@/lib/db/schema';
import type { TaxonomyItem } from '@/lib/core/config/types';

/**
 * DB-backed taxonomy master data (anagrafiche). Sports and specialties live
 * in the `sports` / `specialties` tables with an `active` flag:
 *  - pickers and filters offer ACTIVE rows only;
 *  - labels resolve from ALL rows, so profiles that reference a key that was
 *    later deactivated keep rendering correctly.
 * Rows are returned in `TaxonomyItem` shape ({ key, label }) so existing UI
 * helpers (`findTaxonomyItem`) keep working unchanged.
 */

/** Active sports, ordered, for filters and profile editors. */
export async function getActiveSports(): Promise<TaxonomyItem[]> {
  return db
    .select({ key: sports.key, label: sports.label })
    .from(sports)
    .where(eq(sports.active, true))
    .orderBy(asc(sports.sortOrder), asc(sports.label));
}

/** Active specialties, ordered, for filters and profile editors. */
export async function getActiveSpecialties(): Promise<TaxonomyItem[]> {
  return db
    .select({ key: specialties.key, label: specialties.label })
    .from(specialties)
    .where(eq(specialties.active, true))
    .orderBy(asc(specialties.sortOrder), asc(specialties.label));
}

/** All sports (including inactive) — for label resolution only. */
export async function getAllSports(): Promise<TaxonomyItem[]> {
  return db
    .select({ key: sports.key, label: sports.label })
    .from(sports)
    .orderBy(asc(sports.sortOrder), asc(sports.label));
}

/** All specialties (including inactive) — for label resolution only. */
export async function getAllSpecialties(): Promise<TaxonomyItem[]> {
  return db
    .select({ key: specialties.key, label: specialties.label })
    .from(specialties)
    .orderBy(asc(specialties.sortOrder), asc(specialties.label));
}
