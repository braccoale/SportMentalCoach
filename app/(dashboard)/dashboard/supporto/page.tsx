import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ChevronDown } from 'lucide-react';
import { getUser, getUserRoles } from '@/lib/core/auth';
import { HOME_FAQ } from '@/components/landing/home-faq';
import {
  ACADEMY_FAQ,
  ATHLETE_FAQ,
  COACH_FAQ,
  FAMILY_FAQ,
  TEAMS_FAQ,
} from '@/components/landing/audience-paths/audience-faqs';
import type { FaqItem } from '@/components/landing/audience-paths/audience-faq';
import { DemoRequestButton } from '@/components/landing/demo-request-button';

export const dynamic = 'force-dynamic';

type GroupKey = 'general' | 'athletes' | 'families' | 'coaches' | 'academy' | 'teams';

const GROUPS: { key: GroupKey; faq: readonly FaqItem[] }[] = [
  { key: 'general', faq: HOME_FAQ },
  { key: 'athletes', faq: ATHLETE_FAQ },
  { key: 'families', faq: FAMILY_FAQ },
  { key: 'coaches', faq: COACH_FAQ },
  { key: 'academy', faq: ACADEMY_FAQ },
  { key: 'teams', faq: TEAMS_FAQ },
];

/** Il gruppo che riguarda chi è entrato va in cima: è quello che cerca. */
const ROLE_GROUP: Partial<Record<string, GroupKey>> = {
  athlete: 'athletes',
  coach: 'coaches',
  club: 'teams',
};

/**
 * Supporto: tutte le domande frequenti del sito in una pagina, e in fondo il
 * modulo contatti per quello che non c'è. Le risposte sono le stesse delle
 * pagine pubbliche (stessi moduli), non una copia da tenere allineata.
 */
export default async function SupportoPage() {
  const user = await getUser();
  if (!user) notFound();
  const t = await getTranslations('Support');

  const roles = await getUserRoles(user.id);
  const mine = roles.map((r) => ROLE_GROUP[r]).find(Boolean);
  const groups = mine
    ? [...GROUPS.filter((g) => g.key === mine), ...GROUPS.filter((g) => g.key !== mine)]
    : GROUPS;

  return (
    <section className="mx-auto w-full max-w-3xl p-6">
      <h1 className="text-2xl font-semibold text-gray-900">{t('title')}</h1>
      <p className="mt-1 text-gray-600">{t('intro')}</p>

      <nav className="mt-5 flex flex-wrap gap-2" aria-label={t('title')}>
        {groups.map((g) => (
          <Link
            key={g.key}
            href={`#${g.key}`}
            className="rounded-full border border-gray-200 bg-white px-3 py-1 text-sm font-medium text-gray-700 transition-colors hover:border-gray-300 hover:text-gray-950"
          >
            {t(g.key)}
            {g.key === mine ? ` · ${t('forYou')}` : ''}
          </Link>
        ))}
      </nav>

      <div className="mt-8 flex flex-col gap-10">
        {groups.map((g) => (
          <div key={g.key} id={g.key} className="scroll-mt-24">
            <h2 className="text-lg font-semibold text-gray-900">{t(g.key)}</h2>
            <div className="mt-3 divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
              {g.faq.map((f) => (
                <details key={f.q} className="group px-4">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-left text-sm font-semibold text-gray-900 [&::-webkit-details-marker]:hidden">
                    {f.q}
                    <ChevronDown
                      className="h-4 w-4 shrink-0 text-gray-400 transition-transform group-open:rotate-180"
                      aria-hidden
                    />
                  </summary>
                  <p className="pb-4 text-sm leading-relaxed text-gray-600">
                    {f.a}
                    {f.link ? (
                      <>
                        {' '}
                        <Link href={f.link.href} className="font-semibold text-gray-900 underline">
                          {f.link.label}
                        </Link>
                      </>
                    ) : null}
                  </p>
                </details>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-12 flex flex-col items-start gap-4 rounded-xl border border-gray-200 bg-white p-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="font-semibold text-gray-900">{t('notFound')}</p>
        <DemoRequestButton label={t('contact')} />
      </div>
    </section>
  );
}
