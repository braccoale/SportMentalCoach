import { LockKeyhole } from 'lucide-react';
import { getUser } from '@/lib/db/queries';
import { DemoReadonlyBoundary } from '@/components/demo-readonly-boundary';

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
          {children}
        </DemoReadonlyBoundary>
      </main>
    </div>
  );
}
