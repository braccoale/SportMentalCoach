import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ChevronDown,
  Flag,
  Heart,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getVerticalConfig } from '@/lib/core/config';
import {
  getCoachDiscovery,
  type DiscoveryCoach,
  type DiscoveryFilters,
  type DiscoverySort,
} from '@/lib/core/listings';
import { getUser } from '@/lib/db/queries';
import { getFavoriteProviderIds } from '@/lib/core/favorites';
import { SHOW_UPCOMING_FEATURES } from '@/lib/core/flags';
import { getActiveSports, getActiveSpecialties } from '@/lib/core/taxonomies';
import { CoachCard } from '@/components/coach-card';
import { CoachesFilterForm } from '@/components/coaches-filter-form';
import {
  athleteNeeds,
  type AthleteNeed,
} from '@/lib/verticals/sport-mental-coach/athlete-needs';
import { cn } from '@/lib/utils';
import { JsonLd } from '@/components/json-ld';
import { breadcrumbJsonLd, coachListJsonLd } from '@/lib/core/seo';

export const dynamic = 'force-dynamic';

/**
 * Il canonical punta sempre a `/coaches`, senza parametri.
 *
 * Sport, specialita', livello, lingua e ordinamento generano un numero
 * enorme di URL che mostrano ritagli dello stesso elenco. Lasciarli
 * indicizzare separatamente sparpaglia il segnale su decine di pagine quasi
 * uguali; il canonical li fa convergere su una sola.
 */
export const metadata: Metadata = {
  title: 'Mental coach sportivi verificati — KaiPai',
  description:
    'Trova il mental coach giusto per il tuo sport e il tuo momento: profili verificati da KaiPai, filtrabili per sport, specialità, livello e lingua. Sessioni in videochiamata.',
  alternates: { canonical: '/coaches' },
  openGraph: {
    type: 'website',
    title: 'Mental coach sportivi verificati — KaiPai',
    description:
      'Profili verificati, filtrabili per sport, specialità, livello e lingua. Sessioni di coaching mentale in videochiamata.',
    url: '/coaches',
  },
};

const LANGUAGES = ['Italiano', 'Inglese', 'Spagnolo', 'Francese', 'Tedesco'];
const SORTS: { value: DiscoverySort; label: string }[] = [
  { value: 'activity', label: 'Ore e atleti seguiti' },
  { value: 'recommended', label: 'Consigliati' },
  { value: 'rating', label: 'Valutazione' },
  { value: 'price', label: 'Prezzo crescente' },
  { value: 'experience', label: 'Esperienza' },
];

type SearchParams = {
  sport?: string | string[];
  specialty?: string | string[];
  level?: string | string[];
  language?: string | string[];
  certified?: string | string[];
  sort?: string | string[];
  fav?: string | string[];
  need?: string | string[];
};

const fieldCls =
  'rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700';

export default async function CoachesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const config = getVerticalConfig();
  const { levels } = config.taxonomies;
  const [categories, specialties] = await Promise.all([
    getActiveSports(),
    getActiveSpecialties(),
  ]);

  const selectedNeedIds = parseSelectedNeedIds(sp.need);
  const selectedNeeds = athleteNeeds.filter((need) =>
    selectedNeedIds.includes(need.id)
  );

  const sport = getSingleParam(sp.sport);
  const specialty = getSingleParam(sp.specialty);
  const level = getSingleParam(sp.level);
  const language = getSingleParam(sp.language);
  const certified = getSingleParam(sp.certified);
  const favorite = getSingleParam(sp.fav);
  const sortParam = getSingleParam(sp.sort);

  const sort: DiscoverySort = SORTS.some((s) => s.value === sortParam)
    ? (sortParam as DiscoverySort)
    : 'activity';
  const filters: DiscoveryFilters = {
    sport: sport || undefined,
    specialty: specialty || undefined,
    level: level || undefined,
    language: language || undefined,
    certifiedOnly: certified === '1',
    sort,
  };
  const onlyFav = favorite === '1';

  const user = await getUser();
  const loggedIn = !!user;
  const favoriteIds = user
    ? await getFavoriteProviderIds(user.id)
    : new Set<number>();

  let coaches = await getCoachDiscovery(filters, { favoriteIds });
  if (onlyFav && loggedIn) coaches = coaches.filter((c) => c.isFavorite);
  if (selectedNeeds.length > 0) {
    coaches = filterAndRankCoachesForNeeds(coaches, selectedNeeds);
  }

  const anyAdvancedFilter =
    !!filters.sport ||
    !!filters.specialty ||
    !!filters.level ||
    !!filters.language ||
    filters.certifiedOnly ||
    onlyFav;
  const hasActiveNeed = selectedNeeds.length > 0;
  const activeAdvancedFilterCount = [
    filters.sport,
    filters.specialty,
    filters.level,
    filters.language,
    filters.certifiedOnly ? 'certified' : undefined,
    onlyFav ? 'fav' : undefined,
  ].filter(Boolean).length;

  const fallback =
    coaches.length === 0 && (anyAdvancedFilter || hasActiveNeed)
      ? buildFallbackSuggestions(
        await getCoachDiscovery({}, { favoriteIds }),
          selectedNeeds
        ).slice(0, 3)
      : [];

  const resultsTitle =
    selectedNeeds.length === 1
      ? selectedNeeds[0].selectedTitle
      : selectedNeeds.length > 1
        ? 'Coach per il momento che stai vivendo'
        : 'Trova il supporto giusto per il tuo momento';
  const resultsSubtitle =
    selectedNeeds.length === 1
      ? selectedNeeds[0].selectedSubtitle
      : selectedNeeds.length > 1
        ? `Una selezione pensata per chi vuole lavorare su ${formatNeedLabels(selectedNeeds)}. I coach che vedi qui danno priorita ai bisogni che hai combinato.`
        : 'Parti da cio che vuoi migliorare oppure usa i filtri avanzati per affinare la ricerca.';

  const clearNeedHref = buildMarketplaceHref(sp, { need: undefined });
  const clearAdvancedFiltersHref = buildMarketplaceHref(sp, {
    sport: undefined,
    specialty: undefined,
    level: undefined,
    language: undefined,
    certified: undefined,
    sort: undefined,
    fav: undefined,
  });

  // L'`ItemList` descrive l'elenco completo, quindi viene emessa solo quando
  // l'elenco e' completo. Su una vista filtrata direbbe «questi sono i coach
  // di KaiPai» mentre il canonical rimanda a una pagina che ne mostra altri.
  const isCanonicalListing = !anyAdvancedFilter && !hasActiveNeed;

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <JsonLd
        nodes={[
          breadcrumbJsonLd([
            { name: 'Home', path: '/' },
            { name: 'Coach', path: '/coaches' },
          ]),
          ...(isCanonicalListing
            ? [
                coachListJsonLd(
                  coaches.map((c) => ({
                    slug: c.slug,
                    name: c.displayName ?? 'Coach',
                  }))
                ),
              ]
            : []),
        ]}
      />
      <header className="max-w-3xl">
        <h1 className="text-3xl font-bold tracking-tight text-gray-950 sm:text-4xl">
          Il mental coach giusto parte dal tuo momento, non da una lista.
        </h1>
        <p className="mt-3 text-base leading-7 text-gray-600 sm:text-lg">
          Scegli il tipo di supporto che stai cercando e lascia che KaiPai ti
          accompagni verso i coach piu adatti alla tua situazione sportiva.
        </p>
      </header>

      {SHOW_UPCOMING_FEATURES && (
        <div className="mt-6 flex flex-col items-start justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 sm:flex-row sm:items-center">
          <div className="flex items-start gap-3">
            <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
            <div>
              <p className="text-sm font-semibold text-gray-900">
                Non sai ancora da dove partire?
              </p>
              <p className="text-sm text-gray-600">
                Presto potrai ricevere un suggerimento guidato in base ai tuoi
                obiettivi e al tuo momento sportivo.
              </p>
            </div>
          </div>
          <span
            className="inline-flex cursor-not-allowed items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-medium text-gray-500 ring-1 ring-gray-200"
            aria-disabled
            title="Presto disponibile"
          >
            Trova il mio match
            <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-500">
              Presto
            </span>
          </span>
        </div>
      )}

      <section className="mt-8 rounded-[28px] border border-gray-200 bg-gradient-to-br from-white via-red-50/40 to-white p-5 shadow-sm sm:p-7">
        <div className="max-w-3xl">
          <h2 className="text-2xl font-semibold tracking-tight text-gray-950 sm:text-3xl">
            Parti da cio che vuoi migliorare.
          </h2>
          <p className="mt-3 text-sm leading-6 text-gray-600 sm:text-base">
            Parti dal tuo obiettivo mentale: ti aiutiamo a trovare il coach piu
            adatto al tuo momento sportivo.
          </p>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {athleteNeeds.map((need) => (
            <NeedCard
              key={need.id}
              need={need}
              href={buildMarketplaceHref(sp, {
                need: toggleNeedSelection(selectedNeedIds, need.id),
              })}
              selected={selectedNeedIds.includes(need.id)}
            />
          ))}
        </div>

        <div className="mt-5 flex flex-col gap-3 border-t border-gray-200 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-gray-600">
            Puoi combinare piu bisogni insieme, poi affinare la ricerca solo se
            serve.
          </p>
          {selectedNeeds.length > 0 ? (
            <Button asChild variant="outline" className="rounded-full">
              <Link href={clearNeedHref}>Voglio esplorare tutti i coach</Link>
            </Button>
          ) : null}
        </div>
      </section>

      <details
        className="group mt-6 rounded-2xl border border-gray-200 bg-white"
        open={anyAdvancedFilter}
      >
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4">
          <div>
            <p className="text-sm font-semibold text-gray-900">
              Filtri avanzati
            </p>
            <p className="mt-1 text-sm text-gray-500">
              Sport, specializzazioni, lingua, esperienza e preferiti.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {activeAdvancedFilterCount > 0 ? (
              <span className="inline-flex rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-600">
                {activeAdvancedFilterCount} attivi
              </span>
            ) : null}
            <ChevronDown className="h-5 w-5 text-gray-400 transition group-open:rotate-180" />
          </div>
        </summary>

        <div className="border-t border-gray-100 px-5 pb-5 pt-4">
          <CoachesFilterForm className="flex flex-wrap items-end gap-3">
            {selectedNeedIds.map((needId) => (
              <input key={needId} type="hidden" name="need" value={needId} />
            ))}

            <Field
              label="Sport"
              name="sport"
              value={sport}
              options={categories}
            />
            <Field
              label="Specializzazione"
              name="specialty"
              value={specialty}
              options={specialties}
            />
            <Field
              label="Livello"
              name="level"
              value={level}
              options={levels ?? []}
            />
            <div className="flex flex-col">
              <label
                htmlFor="language"
                className="text-xs font-medium text-gray-600"
              >
                Lingua
              </label>
              <select
                id="language"
                name="language"
                defaultValue={language ?? ''}
                className={`${fieldCls} mt-1`}
              >
                <option value="">Tutte</option>
                {LANGUAGES.map((language) => (
                  <option key={language} value={language}>
                    {language}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col">
              <label
                htmlFor="sort"
                className="text-xs font-medium text-gray-600"
              >
                Ordina
              </label>
              <select
                id="sort"
                name="sort"
                defaultValue={sort}
                className={`${fieldCls} mt-1`}
              >
                {SORTS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700">
              <input
                type="checkbox"
                name="certified"
                value="1"
                defaultChecked={filters.certifiedOnly}
                className="accent-red-600"
              />
              Solo coach certificati
            </label>
            {loggedIn ? (
              <label className="flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  name="fav"
                  value="1"
                  defaultChecked={onlyFav}
                  className="accent-red-500"
                />
                <Heart className="h-3.5 w-3.5 text-red-500" /> Solo preferiti
              </label>
            ) : null}

            <noscript>
              <Button type="submit" className="rounded-md">
                Aggiorna i risultati
              </Button>
            </noscript>

            {anyAdvancedFilter ? (
              <Button asChild variant="outline" className="rounded-full">
                <Link href={clearAdvancedFiltersHref}>
                  Azzera i filtri avanzati
                </Link>
              </Button>
            ) : null}
          </CoachesFilterForm>
        </div>
      </details>

      <section className="mt-8">
        <div className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-red-600">
            Coach selezionati per te
          </p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-gray-950 sm:text-3xl">
            {resultsTitle}
          </h2>
          <p className="mt-3 text-sm leading-6 text-gray-600 sm:text-base">
            {resultsSubtitle}
          </p>
        </div>

        <div className="mt-5 flex flex-col gap-2 border-t border-gray-200 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-gray-600">
            {coaches.length}{' '}
            {coaches.length === 1
              ? 'coach in linea con questo momento'
              : 'coach in linea con questo momento'}
          </p>
          <p className="text-sm text-gray-500">
            {sort === 'recommended'
              ? 'Ordinati per rilevanza e qualita del match'
              : `Ordinati per ${SORTS.find((item) => item.value === sort)?.label.toLowerCase()}`}
          </p>
        </div>

        {coaches.length === 0 ? (
          <NoResults
            anyFilter={anyAdvancedFilter || hasActiveNeed}
            fallback={fallback}
            loggedIn={loggedIn}
            categories={categories}
            selectedNeeds={selectedNeeds}
          />
        ) : (
          <div className="mt-5 flex flex-col gap-4">
            {coaches.map((coach) => (
              <CoachCard
                key={coach.slug}
                coach={coach}
                loggedIn={loggedIn}
                sportsList={categories}
              />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function NeedCard({
  need,
  href,
  selected,
}: {
  need: AthleteNeed;
  href: string;
  selected: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={selected ? 'true' : undefined}
      className={cn(
        'group relative flex min-h-[320px] h-full overflow-hidden rounded-[26px] border transition duration-300',
        selected
          ? 'border-green-300 shadow-xl shadow-green-200/70 ring-2 ring-green-200'
          : 'border-gray-200 shadow-sm hover:-translate-y-1 hover:border-red-200 hover:shadow-xl hover:shadow-red-100/70'
      )}
    >
      <div
        className="absolute inset-0 bg-cover bg-center transition duration-500 group-hover:scale-[1.035]"
        style={{
          backgroundImage: `url(${need.imageSrc})`,
          backgroundPosition: need.imagePosition ?? 'right top',
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/14 via-transparent to-transparent" />
      <div
        className={cn(
          'absolute inset-0 transition duration-300',
          selected ? 'bg-green-950/8' : 'bg-black/0 group-hover:bg-black/0'
        )}
      />

      <div className="relative flex h-full flex-1 flex-col p-5">
        <div className="flex items-start justify-start gap-4">
          {selected ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-green-200/70 bg-green-500 px-2.5 py-1 text-xs font-semibold text-white shadow-lg shadow-green-900/20">
              <Flag className="h-3.5 w-3.5" />
              Selezionato
            </span>
          ) : null}
        </div>
      </div>
      <span className="sr-only">
        {need.title}. {need.description}
      </span>
    </Link>
  );
}

function Field({
  label,
  name,
  value,
  options,
}: {
  label: string;
  name: string;
  value?: string;
  options: { key: string; label: string }[];
}) {
  return (
    <div className="flex flex-col">
      <label htmlFor={name} className="text-xs font-medium text-gray-600">
        {label}
      </label>
      <select
        id={name}
        name={name}
        defaultValue={value ?? ''}
        className={`${fieldCls} mt-1`}
      >
        <option value="">Tutti</option>
        {options.map((option) => (
          <option key={option.key} value={option.key}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function NoResults({
  anyFilter,
  fallback,
  loggedIn,
  categories,
  selectedNeeds,
}: {
  anyFilter: boolean;
  fallback: Awaited<ReturnType<typeof getCoachDiscovery>>;
  loggedIn: boolean;
  categories: { key: string; label: string }[];
  selectedNeeds: AthleteNeed[];
}) {
  if (!anyFilter) {
    return (
      <div className="mt-6 rounded-2xl border border-dashed border-gray-300 p-10 text-center">
        <p className="text-gray-700">Nessun coach disponibile al momento.</p>
        <p className="mt-1 text-sm text-gray-500">Torna a trovarci a breve.</p>
      </div>
    );
  }

  return (
    <div className="mt-6">
      <div className="rounded-2xl border border-dashed border-gray-300 p-8 text-center">
        <p className="font-medium text-gray-800">
          Non abbiamo trovato coach con questa combinazione.
        </p>
        <p className="mt-2 text-sm text-gray-500">
          {selectedNeeds.length > 0
            ? 'Prova a mantenere i bisogni selezionati e alleggerire i filtri avanzati, oppure esplora coach vicini a questo momento.'
            : 'Prova a rimuovere qualche filtro per vedere piu risultati.'}
        </p>
        <Button asChild className="mt-4 rounded-full">
          <Link href="/coaches">Riparti da tutti i coach</Link>
        </Button>
      </div>

      {fallback.length > 0 ? (
        <div className="mt-8">
          <h2 className="text-lg font-medium text-gray-900">
            {selectedNeeds.length > 0
              ? 'Coach vicini ai bisogni selezionati'
              : 'Forse ti interessano'}
          </h2>
          <div className="mt-4 flex flex-col gap-4">
            {fallback.map((coach) => (
              <CoachCard
                key={coach.slug}
                coach={coach}
                loggedIn={loggedIn}
                sportsList={categories}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function filterAndRankCoachesForNeeds(
  coaches: DiscoveryCoach[],
  needs: AthleteNeed[]
): DiscoveryCoach[] {
  return [...coaches]
    .filter((coach) => coachMatchesAnyNeed(coach, needs))
    .sort(
      (a, b) =>
        b.totalMinutes - a.totalMinutes ||
        b.athletesCount - a.athletesCount ||
        matchedNeedsCount(b, needs) - matchedNeedsCount(a, needs) ||
        totalNeedMatchCount(b, needs) - totalNeedMatchCount(a, needs)
    );
}

function buildFallbackSuggestions(
  coaches: DiscoveryCoach[],
  needs: AthleteNeed[]
): DiscoveryCoach[] {
  if (needs.length === 0) return coaches;
  return filterAndRankCoachesForNeeds(coaches, needs);
}

function coachMatchesAnyNeed(
  coach: DiscoveryCoach,
  needs: AthleteNeed[]
): boolean {
  return matchedNeedsCount(coach, needs) > 0;
}

function needMatchCount(coach: DiscoveryCoach, need: AthleteNeed): number {
  const specialties = coach.specialties ?? [];
  return need.specialtyKeys.filter((key) => specialties.includes(key)).length;
}

function matchedNeedsCount(coach: DiscoveryCoach, needs: AthleteNeed[]): number {
  return needs.filter((need) => needMatchCount(coach, need) > 0).length;
}

function totalNeedMatchCount(coach: DiscoveryCoach, needs: AthleteNeed[]): number {
  return needs.reduce((total, need) => total + needMatchCount(coach, need), 0);
}

function parseSelectedNeedIds(value: SearchParams['need']): AthleteNeed['id'][] {
  const ids = (Array.isArray(value) ? value : value ? [value] : [])
    .flatMap((item) => item.split(','))
    .map((item) => item.trim())
    .filter((item): item is AthleteNeed['id'] =>
      athleteNeeds.some((need) => need.id === item)
    );

  return [...new Set(ids)];
}

function getSingleParam(value?: string | string[]): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

function toggleNeedSelection(
  selectedNeedIds: AthleteNeed['id'][],
  needId: AthleteNeed['id']
): AthleteNeed['id'][] | undefined {
  if (selectedNeedIds.includes(needId)) {
    const next = selectedNeedIds.filter((id) => id !== needId);
    return next.length > 0 ? next : undefined;
  }

  return [...selectedNeedIds, needId];
}

function formatNeedLabels(needs: AthleteNeed[]): string {
  const labels = needs.map((need) => need.title.toLowerCase());
  if (labels.length <= 1) return labels[0] ?? '';
  if (labels.length === 2) return `${labels[0]} e ${labels[1]}`;
  return `${labels.slice(0, -1).join(', ')} e ${labels.at(-1)}`;
}

function buildMarketplaceHref(
  sp: SearchParams,
  updates: Partial<Record<keyof SearchParams, string | string[] | undefined>>
): string {
  const params = new URLSearchParams();
  const next: SearchParams = { ...sp, ...updates };

  (
    [
      'sport',
      'specialty',
      'level',
      'language',
      'certified',
      'sort',
      'fav',
      'need',
    ] as const
  ).forEach((key) => {
    const value = next[key];
    const values = Array.isArray(value) ? value : value ? [value] : [];

    if (key === 'need') {
      values.forEach((entry) => {
        if (entry) params.append(key, entry);
      });
      return;
    }

    const firstValue = values[0];
    if (firstValue) params.set(key, firstValue);
  });

  const query = params.toString();
  return query ? `/coaches?${query}` : '/coaches';
}
