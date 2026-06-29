import { requireRole } from '@/lib/core/auth';

export default async function AthleteDashboardPage() {
  await requireRole('athlete');

  return (
    <section className="p-6">
      <h1 className="text-2xl font-semibold text-gray-900">Athlete dashboard</h1>
      <p className="mt-2 text-gray-500">
        Placeholder — your bookings and coaches will appear here.
      </p>
    </section>
  );
}
