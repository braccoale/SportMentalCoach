'use server';

import { revalidatePath } from 'next/cache';
import { getUser } from '@/lib/db/queries';
import { toggleFavorite } from '@/lib/core/favorites';

export async function toggleFavoriteAction(
  providerId: number
): Promise<{ favorited: boolean }> {
  const user = await getUser();
  if (!user || !Number.isInteger(providerId)) {
    return { favorited: false };
  }
  const result = await toggleFavorite(user.id, providerId);
  revalidatePath('/coaches');
  return result;
}
