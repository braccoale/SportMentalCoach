import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Lock } from 'lucide-react';
import { getUser } from '@/lib/db/queries';
import {
  getChannelPreferences,
  getConfigurableEventsByCategory,
} from '@/lib/core/notifications';
import { Button } from '@/components/ui/button';
import { ActionForm } from '@/components/action-form';
import { saveNotificationPreferencesAction } from '../actions';

export const dynamic = 'force-dynamic';

/**
 * Preferenze notifiche: due canali indipendenti per ogni evento.
 *
 * "App" è la campanellina, "Email" è la posta. Si possono tenere entrambi, uno
 * solo o nessuno dei due — sono scelte separate, non una gerarchia.
 *
 * Gli eventi sono raggruppati per categoria e mostrati con la loro etichetta
 * leggibile: le chiavi tecniche non compaiono mai. Le notifiche obbligatorie
 * appaiono spuntate e bloccate, con il motivo accanto, così la domanda "perché
 * non posso disattivarla?" trova risposta qui invece che in assistenza.
 */
export default async function NotificationPreferencesPage() {
  const user = await getUser();
  if (!user) {
    notFound();
  }

  const prefs = await getChannelPreferences(user.id);
  const groups = getConfigurableEventsByCategory();

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
        Scegli come vuoi essere avvisato per ogni evento: nella campanellina
        dell’app, via email, in entrambi i modi o in nessuno.
      </p>

      <ActionForm action={saveNotificationPreferencesAction} className="mt-6">
        <div className="flex flex-col gap-4">
          {groups.map((group) => (
            <section
              key={group.category}
              className="rounded-lg border border-gray-200"
            >
              <header className="border-b border-gray-100 p-4">
                <h2 className="text-sm font-semibold text-gray-900">
                  {group.title}
                </h2>
                <p className="mt-0.5 text-xs text-gray-500">
                  {group.description}
                </p>
              </header>

              {/* Intestazione delle colonne: una sola volta per gruppo, così le
                  righe restano leggibili senza ripetere le etichette. */}
              <div className="flex items-center justify-end gap-6 px-4 pt-3 pb-1">
                <span className="w-10 text-center text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                  App
                </span>
                <span className="w-10 text-center text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                  Email
                </span>
              </div>

              <ul className="flex flex-col divide-y divide-gray-100 px-4 pb-4">
                {group.events.map((event) => {
                  const locked = event.mandatoryEmail;
                  return (
                    <li
                      key={event.key}
                      className="flex items-start justify-between gap-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="text-sm text-gray-800">{event.label}</p>
                        {event.hint && (
                          <p className="mt-0.5 text-xs text-gray-500">
                            {event.hint}
                          </p>
                        )}
                        {locked && event.mandatoryReason && (
                          <p className="mt-1 flex items-start gap-1.5 text-xs text-gray-500">
                            <Lock className="mt-0.5 h-3 w-3 shrink-0" />
                            <span>{event.mandatoryReason}</span>
                          </p>
                        )}
                      </div>

                      <div className="flex shrink-0 items-center gap-6 pt-0.5">
                        {/* App. Assente per gli eventi che non hanno una
                            notifica in-app (es. l'invito a chi non ha ancora
                            un account): non c'è nulla da attivare. */}
                        <span className="flex w-10 justify-center">
                          {event.hasInApp ? (
                            <input
                              type="checkbox"
                              name={`in_app:${event.key}`}
                              defaultChecked={prefs[event.key].inApp}
                              disabled={locked}
                              aria-label={`${event.label} — notifica nell’app`}
                              className="h-4 w-4 accent-red-600 disabled:cursor-not-allowed disabled:opacity-60"
                            />
                          ) : (
                            <span
                              className="text-xs text-gray-300"
                              title="Questo avviso arriva solo via email"
                            >
                              —
                            </span>
                          )}
                        </span>

                        <span className="flex w-10 justify-center">
                          <input
                            type="checkbox"
                            name={`email:${event.key}`}
                            defaultChecked={prefs[event.key].email}
                            disabled={locked}
                            aria-label={`${event.label} — email`}
                            className="h-4 w-4 accent-red-600 disabled:cursor-not-allowed disabled:opacity-60"
                          />
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>

        <div className="mt-4">
          <Button type="submit" className="rounded-full">
            Salva preferenze
          </Button>
        </div>
      </ActionForm>
    </section>
  );
}
