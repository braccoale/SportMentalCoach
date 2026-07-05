import { requireRole } from '@/lib/core/auth';
import { SecuritySettings } from '@/components/security-settings';

export default async function AthleteSecurityPage() {
  await requireRole('athlete');

  return (
    <section className="flex flex-col p-6">
      <SecuritySettings />
    </section>
  );
}
