import type { User } from '@/lib/db/schema';

/** User data shared with authenticated client navigation. */
export type SessionUser = User & {
  avatarUrl: string | null;
};
