import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getUser } from '@/lib/db/queries';
import {
  getEmailPreferences,
  NOTIFICATION_TYPES,
  NOTIFICATION_TYPE_LABELS,
} from '@/lib/core/notifications';
import { Button } from '@/components/ui/button';
import { ActionForm } from '@/components/action-form';
import { saveNotificationPreferencesAction } from '../actions';

export const dynamic = 'force-dynamic';

export default async function NotificationPreferencesPage() {
  const user = await getUser();
  if (!user) {
    notFound();
  }

  const prefs = await getEmailPreferences(user.id);

  return (
    <section className="mx-auto w-full max-w-2xl p-6">
      <Link
        href="/dashboard/notifications"
        className="text-sm text-gray-500 hover:text-gray-900"
      >
        ← Notifiche
      </Link>

      <h1 className="mt-3 text-2xl font-semibold text-gray-900">
        Preferenze notifiche
      </h1>
      <p className="mt-1 text-sm text-gray-500">
        Scegli per quali eventi ricevere un’email. Le notifiche in-app restano
        sempre attive.
      </p>

      <ActionForm
        action={saveNotificationPreferencesAction}
        className="mt-6 rounded-lg border border-gray-200 p-4"
      >
        <h2 className="text-sm font-medium text-gray-700">Email</h2>
        <ul className="mt-3 flex flex-col divide-y divide-gray-100">
          {NOTIFICATION_TYPES.map((type) => (
            <li
              key={type}
              className="flex items-center justify-between py-3"
            >
              <span className="text-sm text-gray-800">
                {NOTIFICATION_TYPE_LABELS[type]}
              </span>
              <label className="inline-flex items-center gap-2 text-sm text-gray-600">
                <input
                  type="checkbox"
                  name={type}
                  defaultChecked={prefs[type]}
                  className="h-4 w-4 accent-red-600"
                />
                Email
              </label>
            </li>
          ))}
        </ul>

        <div className="mt-4">
          <Button type="submit" className="rounded-full">
            Salva preferenze
          </Button>
        </div>
      </ActionForm>
    </section>
  );
}
