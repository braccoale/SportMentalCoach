import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { Bell, KeyRound, Languages, Lock } from 'lucide-react';
import { getUser } from '@/lib/db/queries';
import {
  getChannelPreferences,
  getConfigurableEventsByCategory,
} from '@/lib/core/notifications';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ActionForm } from '@/components/action-form';
import { SecuritySettings } from '@/components/security-settings';
import { ENABLED_LOCALES, LOCALE_DEFINITIONS } from '@/lib/i18n/locales';
import { saveNotificationPreferencesAction } from '../notifications/actions';
import { saveLocalePreferenceAction } from './actions';

export const dynamic = 'force-dynamic';

type SettingsSection = 'notifications' | 'language' | 'password';

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string }>;
}) {
  const [user, requestedParams, locale, languageT] = await Promise.all([
    getUser(),
    searchParams,
    getLocale(),
    getTranslations('LanguageSettings'),
  ]);
  if (!user) notFound();

  const sections = [
    {
      key: 'notifications',
      label: 'Notifiche',
      description: 'App ed email',
      icon: Bell,
    },
    {
      key: 'language',
      label: languageT('navigationLabel'),
      description: languageT('navigationDescription'),
      icon: Languages,
    },
    {
      key: 'password',
      label: 'Password',
      description: 'Accesso e account',
      icon: KeyRound,
    },
  ] as const;

  const requestedSection = requestedParams.section;
  const activeSection: SettingsSection =
    requestedSection === 'password' || requestedSection === 'language'
      ? requestedSection
      : 'notifications';

  const prefs =
    activeSection === 'notifications'
      ? await getChannelPreferences(user.id)
      : null;
  const groups =
    activeSection === 'notifications'
      ? getConfigurableEventsByCategory()
      : null;

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:py-10">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-red-600">
          Il tuo account
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-gray-950">Impostazioni</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500">
          Gestisci come ricevere gli avvisi e proteggi l&apos;accesso al tuo account.
        </p>
      </div>

      <div className="mt-8 grid gap-6 md:grid-cols-[220px_minmax(0,1fr)] md:items-start">
        <nav
          aria-label="Sezioni impostazioni"
          className="grid grid-cols-2 gap-2 rounded-2xl border border-gray-200 bg-white p-2 shadow-sm md:sticky md:top-6 md:grid-cols-1"
        >
          {sections.map((section) => {
            const active = section.key === activeSection;
            return (
              <Link
                key={section.key}
                href={`/dashboard/settings?section=${section.key}`}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors',
                  active
                    ? 'bg-red-50 text-red-700'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-950'
                )}
              >
                <span
                  className={cn(
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                    active ? 'bg-white text-red-600 shadow-sm' : 'bg-gray-100'
                  )}
                >
                  <section.icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{section.label}</span>
                  <span className="hidden text-xs text-gray-400 sm:block">
                    {section.description}
                  </span>
                </span>
              </Link>
            );
          })}
        </nav>

        <div className="min-w-0">
          {activeSection === 'notifications' && prefs && groups ? (
            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
              <h2 className="text-xl font-semibold text-gray-950">Notifiche</h2>
              <p className="mt-1 text-sm leading-6 text-gray-500">
                Scegli come essere avvisato per ogni evento: nell&apos;app, via email,
                in entrambi i modi o in nessuno.
              </p>

              <ActionForm
                action={saveNotificationPreferencesAction}
                className="mt-6"
              >
                <div className="flex flex-col gap-4">
                  {groups.map((group) => (
                    <section
                      key={group.category}
                      className="rounded-xl border border-gray-200"
                    >
                      <header className="border-b border-gray-100 p-4">
                        <h3 className="text-sm font-semibold text-gray-900">
                          {group.title}
                        </h3>
                        <p className="mt-0.5 text-xs text-gray-500">
                          {group.description}
                        </p>
                      </header>

                      <div className="flex items-center justify-end gap-6 px-4 pb-1 pt-3">
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

                <Button type="submit" className="mt-5 rounded-full">
                  Salva preferenze
                </Button>
              </ActionForm>
            </div>
          ) : activeSection === 'language' ? (
            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
              <h2 className="text-xl font-semibold text-gray-950">
                {languageT('title')}
              </h2>
              <p className="mt-1 text-sm leading-6 text-gray-500">
                {languageT('description')}
              </p>

              <ActionForm
                action={saveLocalePreferenceAction}
                className="mt-6 max-w-xl"
              >
                <label
                  htmlFor="locale"
                  className="block text-sm font-medium text-gray-700"
                >
                  {languageT('fieldLabel')}
                </label>
                <select
                  id="locale"
                  name="locale"
                  defaultValue={locale}
                  className="mt-2 h-11 w-full rounded-xl border border-gray-300 bg-white px-3 text-sm text-gray-950 outline-none transition focus:border-red-500 focus:ring-2 focus:ring-red-100"
                >
                  {ENABLED_LOCALES.map((enabledLocale) => (
                    <option key={enabledLocale} value={enabledLocale}>
                      {LOCALE_DEFINITIONS[enabledLocale].nativeLabel}
                    </option>
                  ))}
                </select>
                <p className="mt-2 text-xs leading-5 text-gray-500">
                  {languageT('rolloutNote')}
                </p>

                <Button type="submit" className="mt-5 rounded-full">
                  {languageT('save')}
                </Button>
              </ActionForm>
            </div>
          ) : (
            <div>
              <div className="mb-5">
                <h2 className="text-xl font-semibold text-gray-950">Password</h2>
                <p className="mt-1 text-sm leading-6 text-gray-500">
                  Aggiorna la password o gestisci l&apos;eliminazione del tuo account.
                </p>
              </div>
              <SecuritySettings />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
