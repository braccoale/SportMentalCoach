import { requireRole } from '@/lib/core/auth';

export default async function CoachDashboardPage() {
  await requireRole('coach');

  return (
    <section className="p-6">
      <h1 className="text-2xl font-semibold text-gray-900">Coach dashboard</h1>
      <p className="mt-2 text-gray-500">
        Placeholder — your profile, services and booking requests will appear
        here.
      </p>
    </section>
  );
}
