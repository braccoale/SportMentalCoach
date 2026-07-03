import Link from 'next/link';
import { Sparkles, Heart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getVerticalConfig, t } from '@/lib/core/config';
import {
  getCoachDiscovery,
  type DiscoveryFilters,
  type DiscoverySort,
} from '@/lib/core/listings';
import { getUser } from '@/lib/db/queries';
import { getFavoriteProviderIds } from '@/lib/core/favorites';
import { SHOW_UPCOMING_FEATURES } from '@/lib/core/flags';
import { getActiveSports, getActiveSpecialties } from '@/lib/core/taxonomies';
import { CoachCard } from '@/components/coach-card';
import { CoachesFilterForm } from '@/components/coaches-filter-form';

export const dynamic = 'force-dynamic';

const LANGUAGES = ['Italiano', 'Inglese', 'Spagnolo', 'Francese', 'Tedesco'];
const SORTS: { value: DiscoverySort; label: string }[] = [
  { value: 'recommended', label: 'Consigliati' },
  { value: 'rating', label: 'Valutazione' },
  { value: 'price', label: 'Prezzo crescente' },
  { value: 'experience', label: 'Esperienza' },
];

type SearchParams = {
  sport?: string;
  specialty?: string;
  level?: string;
  language?: string;
  certified?: string;
  sort?: string;
  fav?: string;
};

const fieldCls =
  'rounded-md border border-gray-300 bg-white px-3 py-2 text-sm';

export default async function CoachesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const config = getVerticalConfig();
  // Sports/specialties are DB master data (active rows only); levels stay
  // in the vertical config.
  const { levels } = config.taxonomies;
  const [categories, specialties] = await Promise.all([
    getActiveSports(),
    getActiveSpecialties(),
  ]);

  const sort: DiscoverySort = SORTS.some((s) => s.value === sp.sort)
    ? (sp.sort as DiscoverySort)
    : 'recommended';
  const filters: DiscoveryFilters = {
    sport: sp.sport || undefined,
    specialty: sp.specialty || undefined,
    level: sp.level || undefined,
    language: sp.language || undefined,
    certifiedOnly: sp.certified === '1',
    sort,
  };
  const onlyFav = sp.fav === '1';

  const user = await getUser();
  const loggedIn = !!user;
  const favoriteIds = user ? await getFavoriteProviderIds(user.id) : new Set<number>();

  let coaches = await getCoachDiscovery(filters, { favoriteIds });
  if (onlyFav && loggedIn) coaches = coaches.filter((c) => c.isFavorite);

  const anyFilter =
    !!filters.sport ||
    !!filters.specialty ||
    !!filters.level ||
    !!filters.language ||
    filters.certifiedOnly ||
    onlyFav;

  // Second-chance suggestions when filters yield nothing.
  const fallback =
    coaches.length === 0 && anyFilter
      ? (await getCoachDiscovery({}, { favoriteIds })).slice(0, 3)
      : [];

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Hero */}
      <header>
        <h1 className="text-3xl font-bold text-gray-900">
          {t('listing.title', config)}
        </h1>
        <p className="mt-1 text-gray-500">{t('listing.subtitle', config)}</p>
      </header>

      {/* AI matching — entry point hidden until the feature ships */}
      {SHOW_UPCOMING_FEATURES && (
        <div className="mt-5 flex flex-col items-start justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 sm:flex-row sm:items-center">
          <div className="flex items-start gap-3">
            <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
            <div>
              <p className="text-sm font-semibold text-gray-900">
                Non sai chi scegliere?
              </p>
              <p className="text-sm text-gray-600">
                Lascia che l’AI trovi il match perfetto in base ai tuoi obiettivi.
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

      {/* Filters — auto-apply on change, no submit button */}
      <CoachesFilterForm className="mt-5 flex flex-wrap items-end gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4">
        <Field label={t('listing.filter.sport', config)} name="sport" value={sp.sport} options={categories} />
        <Field
          label={t('listing.filter.specialty', config)}
          name="specialty"
          value={sp.specialty}
          options={specialties}
        />
        <Field label="Livello" name="level" value={sp.level} options={levels ?? []} />
        <div className="flex flex-col">
          <label htmlFor="language" className="text-xs font-medium text-gray-600">
            Lingua
          </label>
          <select id="language" name="language" defaultValue={sp.language ?? ''} className={`${fieldCls} mt-1`}>
            <option value="">Tutte</option>
            {LANGUAGES.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col">
          <label htmlFor="sort" className="text-xs font-medium text-gray-600">
            Ordina
          </label>
          <select id="sort" name="sort" defaultValue={sort} className={`${fieldCls} mt-1`}>
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm">
          <input type="checkbox" name="certified" value="1" defaultChecked={filters.certifiedOnly} className="accent-red-600" />
          Solo certificati
        </label>
        {loggedIn && (
          <label className="flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm">
            <input type="checkbox" name="fav" value="1" defaultChecked={onlyFav} className="accent-red-500" />
            <Heart className="h-3.5 w-3.5 text-red-500" /> Preferiti
          </label>
        )}
        {/* No submit button: filters auto-apply on change (JS). This submit
            is the no-JS fallback only. */}
        <noscript>
          <Button type="submit" className="rounded-md">
            Filtra
          </Button>
        </noscript>
        {anyFilter && (
          <Button asChild variant="outline" className="rounded-md">
            <Link href="/coaches">Azzera</Link>
          </Button>
        )}
        {SHOW_UPCOMING_FEATURES && (
          <span
            className="ml-auto inline-flex cursor-not-allowed items-center gap-1.5 self-center rounded-md px-2 py-1 text-xs text-gray-400"
            title="Presto disponibile"
          >
            Salva ricerca
            <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-400">
              Presto
            </span>
          </span>
        )}
      </CoachesFilterForm>

      {/* Results */}
      <div className="mt-6 flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {coaches.length}{' '}
          {coaches.length === 1 ? 'coach' : 'coach'} ·{' '}
          {sort === 'recommended'
            ? 'ordinati per rilevanza'
            : `ordinati per ${SORTS.find((s) => s.value === sort)?.label.toLowerCase()}`}
        </p>
      </div>

      {coaches.length === 0 ? (
        <NoResults anyFilter={anyFilter} fallback={fallback} loggedIn={loggedIn} categories={categories} />
      ) : (
        <div className="mt-4 grid gap-6 md:grid-cols-2">
          {coaches.map((coach) => (
            <CoachCard key={coach.slug} coach={coach} loggedIn={loggedIn} sportsList={categories} />
          ))}
        </div>
      )}
    </main>
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
      <select id={name} name={name} defaultValue={value ?? ''} className={`${fieldCls} mt-1`}>
        <option value="">Tutti</option>
        {options.map((o) => (
          <option key={o.key} value={o.key}>
            {o.label}
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
}: {
  anyFilter: boolean;
  fallback: Awaited<ReturnType<typeof getCoachDiscovery>>;
  loggedIn: boolean;
  categories: { key: string; label: string }[];
}) {
  if (!anyFilter) {
    return (
      <div className="mt-6 rounded-xl border border-dashed border-gray-300 p-10 text-center">
        <p className="text-gray-600">Nessun coach disponibile al momento.</p>
        <p className="mt-1 text-sm text-gray-400">Torna a trovarci a breve.</p>
      </div>
    );
  }
  return (
    <div className="mt-6">
      <div className="rounded-xl border border-dashed border-gray-300 p-8 text-center">
        <p className="font-medium text-gray-700">
          Nessun coach con questi filtri.
        </p>
        <p className="mt-1 text-sm text-gray-500">
          Prova a rimuovere qualche filtro per vedere più risultati.
        </p>
        <Button asChild className="mt-4 rounded-full">
          <Link href="/coaches">Azzera i filtri</Link>
        </Button>
      </div>
      {fallback.length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-medium text-gray-900">
            Forse ti interessano
          </h2>
          <div className="mt-4 grid gap-6 md:grid-cols-2">
            {fallback.map((coach) => (
              <CoachCard key={coach.slug} coach={coach} loggedIn={loggedIn} sportsList={categories} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
