import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
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
import { SupportFaq, type SupportFaqGroup } from '@/components/support-faq';

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
 * Supporto: tutte le domande frequenti del sito in una pagina, con la ricerca
 * e il pulsante per scriverci in cima. Le risposte sono le stesse delle pagine
 * pubbliche (stessi moduli), non una copia da tenere allineata.
 */
export default async function SupportoPage() {
  const user = await getUser();
  if (!user) notFound();
  const t = await getTranslations('Support');

  const roles = await getUserRoles(user.id);
  const mine = roles.map((r) => ROLE_GROUP[r]).find(Boolean);
  const ordered = mine
    ? [...GROUPS.filter((g) => g.key === mine), ...GROUPS.filter((g) => g.key !== mine)]
    : GROUPS;

  // Al browser arrivano solo dati semplici: testi e collegamenti.
  const groups: SupportFaqGroup[] = ordered.map((group) => ({
    key: group.key,
    label: t(group.key),
    isMine: group.key === mine,
    items: group.faq.map((faq) => ({
      q: faq.q,
      a: faq.a,
      ...(faq.link ? { link: { href: faq.link.href, label: faq.link.label } } : {}),
    })),
  }));

  return (
    <section className="mx-auto w-full max-w-3xl p-6">
      <h1 className="text-2xl font-semibold text-gray-900">{t('title')}</h1>
      <p className="mt-1 text-gray-600">{t('intro')}</p>
      <SupportFaq groups={groups} />
    </section>
  );
}
