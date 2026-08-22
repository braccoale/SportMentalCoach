import { LockKeyhole } from 'lucide-react';
import { getUser } from '@/lib/db/queries';
import { DemoReadonlyBoundary } from '@/components/demo-readonly-boundary';
import { LegalUpdateNotice } from '@/components/legal-update-notice';
import { hasAcceptedCurrentTerms } from '@/lib/core/legal/acceptance';
import { acknowledgeLegalUpdate } from './legal-actions';

/**
 * Dashboard shell. The old template sidebar (role links / Dashboard /
 * Attività / Sicurezza) was removed: navigation lives in each area's tabs
 * (coach and athlete), while account settings live in the global user menu.
 * Content runs full width.
 */
export default async function DashboardLayout({
  children
}: {
  children: React.ReactNode;
}) {
  const user = await getUser();

  /*
   * L'impronta del testo legale accettato non coincide piu' con quella
   * corrente: i documenti sono cambiati dopo l'iscrizione.
   *
   * `hasAcceptedCurrentTerms` esisteva da tempo e non la chiamava nessuno: il
   * meccanismo per accorgersi di un aggiornamento era completo e scollegato,
   * quindi nessuno vedeva mai un avviso. I conti demo sono esclusi perche' sono
   * in sola lettura e non possono registrare l'accettazione.
   */
  const legalUpdatePending =
    user && !user.isDemo ? !(await hasAcceptedCurrentTerms(user.id)) : false;

  return (
    <div className="mx-auto min-h-[calc(100dvh-68px)] w-full max-w-7xl">
      <main className="p-0 lg:p-4">
        <DemoReadonlyBoundary enabled={Boolean(user?.isDemo)}>
          {user?.isDemo && (
            <div
              role="status"
              className="mx-4 mt-4 flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm font-medium text-violet-900 lg:mx-0 lg:mt-0 lg:mb-4"
            >
              <LockKeyhole className="h-4 w-4 shrink-0" aria-hidden="true" />
              Modalità demo in sola lettura: puoi esplorare tutti i dati, ma non modificarli.
            </div>
          )}
          {legalUpdatePending && (
            <LegalUpdateNotice action={acknowledgeLegalUpdate} />
          )}
          {children}
        </DemoReadonlyBoundary>
      </main>
    </div>
  );
}
