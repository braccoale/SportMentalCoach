import { redirect } from 'next/navigation';

export default function LegacyNotificationPreferencesPage() {
  redirect('/dashboard/settings?section=notifications');
}
