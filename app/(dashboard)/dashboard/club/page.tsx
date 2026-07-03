import { requireRole } from '@/lib/core/auth';

export default async function ClubDashboardPage() {
  await requireRole('club');

  return (
    <section className="p-6">
      <h1 className="text-2xl font-semibold text-gray-900">Club dashboard</h1>
      <p className="mt-2 text-gray-500">
        Qui vedrai i tuoi atleti e i coach collegati al club. Sezione in preparazione.
      </p>
    </section>
  );
}
