import { redirect } from 'next/navigation';

export default function LegacyCoachSecurityPage() {
  redirect('/dashboard/settings?section=password');
}
