import { requireRole } from '@/lib/core/auth';

export default async function AdminDashboardPage() {
  await requireRole('admin');

  return (
    <section className="p-6">
      <h1 className="text-2xl font-semibold text-gray-900">Admin dashboard</h1>
      <p className="mt-2 text-gray-500">
        Placeholder — coach approvals and platform management will appear here.
      </p>
    </section>
  );
}
