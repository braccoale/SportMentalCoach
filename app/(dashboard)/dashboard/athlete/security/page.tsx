import { redirect } from 'next/navigation';

export default function LegacyAthleteSecurityPage() {
  redirect('/dashboard/settings?section=password');
}
