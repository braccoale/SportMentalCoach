import type { Metadata } from 'next';
import { CoachMatchWizard } from '@/components/coach-match-wizard';
import { getKnownAthleteProfile } from '@/lib/core/coach-match/known-profile';
import { getVerticalConfig } from '@/lib/core/config';
import { SHOW_COACH_HOURLY_RATE } from '@/lib/core/flags';
import { getActiveSports } from '@/lib/core/taxonomies';
import { getUser } from '@/lib/db/queries';

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
  const known = user ? await getKnownAthleteProfile(user.id) : null;

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
