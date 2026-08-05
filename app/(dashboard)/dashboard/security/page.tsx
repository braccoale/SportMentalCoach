import { redirect } from 'next/navigation';

export default function LegacySecurityPage() {
  redirect('/dashboard/settings?section=password');
}
