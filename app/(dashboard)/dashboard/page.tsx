import Link from 'next/link';
import { redirect } from 'next/navigation';
import { LayoutDashboard, ArrowRight } from 'lucide-react';
import {
  getUser,
  getUserRoles,
  ROLE_PRIORITY,
  ROLE_DASHBOARDS,
} from '@/lib/core/auth';
import { getRoleLabel } from '@/lib/core/config';
import { Button } from '@/components/ui/button';

export const dynamic = 'force-dynamic';

/**
 * Dashboard home. Users with a single role never see this page: they are
 * sent straight to their own area. Multi-role users get a simple chooser.
 */
export default async function DashboardHomePage() {
  const user = await getUser();
  if (!user) {
    redirect('/sign-in');
  }

  const roles = await getUserRoles(user.id);
  const dashboardRoles = ROLE_PRIORITY.filter((r) => roles.includes(r));

  // Single role → straight to their area, no intermediate page.
  if (dashboardRoles.length === 1) {
    redirect(ROLE_DASHBOARDS[dashboardRoles[0]]);
  }

  // No marketplace role (edge case): guide the user to the marketplace.
  if (dashboardRoles.length === 0) {
    return (
      <section className="mx-auto w-full max-w-2xl p-6 lg:p-10">
        <h1 className="text-2xl font-semibold text-gray-900">
          Benvenuto su Kai Pai
        </h1>
        <p className="mt-2 text-gray-500">
          Il tuo account non ha ancora un ruolo attivo. Sfoglia i coach o
          contattaci per attivare il tuo spazio.
        </p>
        <Button asChild className="mt-6 rounded-full">
          <Link href="/coaches">Trova un coach</Link>
        </Button>
      </section>
    );
  }

  // Multiple roles → chooser.
  return (
    <section className="mx-auto w-full max-w-2xl p-6 lg:p-10">
      <h1 className="text-2xl font-semibold text-gray-900">I tuoi spazi</h1>
      <p className="mt-1 text-sm text-gray-500">
        Scegli l’area in cui vuoi entrare.
      </p>

      <ul className="mt-6 flex flex-col gap-3">
        {dashboardRoles.map((r) => (
          <li key={r}>
            <Link
              href={ROLE_DASHBOARDS[r]}
              className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-5 transition-colors hover:border-red-300"
            >
              <span className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-50 text-red-600">
                  <LayoutDashboard className="h-5 w-5" />
                </span>
                <span className="font-medium text-gray-900">
                  {getRoleLabel(r)}
                </span>
              </span>
              <ArrowRight className="h-4 w-4 text-gray-400" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
