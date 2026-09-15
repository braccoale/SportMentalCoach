'use server';

import { getUser } from '@/lib/db/queries';
import { markTourSeen } from './state';
import { TOUR_CATALOG, type TourKey } from './catalog';

/**
 * Chiamata dal componente client alla chiusura di un tour (avanti fino in
 * fondo, o "Salta"). Fallisce in silenzio se l'utente non è più loggato —
 * non è un'azione critica, non deve mai rompere l'interfaccia sopra di lei.
 */
export async function markTourSeenAction(
  tourKey: TourKey,
  status: 'skipped' | 'completed'
): Promise<void> {
  if (!(tourKey in TOUR_CATALOG)) return;
  const user = await getUser();
  if (!user) return;
  await markTourSeen(user.id, tourKey, status);
}
