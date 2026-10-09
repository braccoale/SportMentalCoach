import type { Metadata } from 'next';
import { eq } from 'drizzle-orm';
import { CoachMatchWizard } from '@/components/coach-match-wizard';
import { getVerticalConfig } from '@/lib/core/config';
import { SHOW_COACH_HOURLY_RATE } from '@/lib/core/flags';
import { getActiveSports } from '@/lib/core/taxonomies';
import { db } from '@/lib/db/drizzle';
import { getUser } from '@/lib/db/queries';
import { clientProfiles } from '@/lib/db/schema';

export const dynamic = 'force-dynamic';

// Una pagina di servizio, con dati personali nel percorso: non va indicizzata.
export const metadata: Metadata = {
  title: 'Aiutami a scegliere il coach',
  robots: { index: false, follow: true },
};

export default async function CoachMatchPage() {
  const [sports, user] = await Promise.all([getActiveSports(), getUser()]);
  const { levels } = getVerticalConfig().taxonomies;

  // Chi ha già un profilo atleta non rivede le domande su sport e livello.
  let known: { sport: string | null; level: string | null } | null = null;
  if (user) {
    const [profile] = await db
      .select({ category: clientProfiles.category, level: clientProfiles.level })
      .from(clientProfiles)
      .where(eq(clientProfiles.userId, user.id))
      .limit(1);
    if (profile) known = { sport: profile.category, level: profile.level };
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6">
      <CoachMatchWizard
        sports={sports.map((s) => ({ key: s.key, label: s.label }))}
        levels={(levels ?? []).map((l) => ({ key: l.key, label: l.label }))}
        known={known}
        askBudget={SHOW_COACH_HOURLY_RATE}
      />
    </main>
  );
}
