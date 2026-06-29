import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { getVerticalConfig, findTaxonomyItem, t } from '@/lib/core/config';
import { getApprovedCoaches } from '@/lib/core/listings';
import { formatPrice } from '@/lib/core/format';
import { CoachAvatar, CertifiedBadge } from '@/components/coach-visuals';

export const dynamic = 'force-dynamic';

type SearchParams = { sport?: string; specialty?: string };

export default async function CoachesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const config = getVerticalConfig();
  const { sport, specialty } = await searchParams;

  const coaches = await getApprovedCoaches({ sport, specialty });

  const { categories, specialties } = config.taxonomies;
  const labelFor = (items: typeof categories, key: string) =>
    findTaxonomyItem(items, key)?.label ?? key;

  return (
    <main className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">
          {t('listing.title', config)}
        </h1>
        <p className="mt-2 text-gray-500">{t('listing.subtitle', config)}</p>
      </header>

      {/* Filters — plain GET form, no client JS needed */}
      <form
        method="get"
        className="mb-8 flex flex-wrap items-end gap-4 rounded-xl border border-gray-200 bg-gray-50 p-4"
      >
        <div className="flex flex-col">
          <label htmlFor="sport" className="text-sm font-medium text-gray-700">
            {t('listing.filter.sport', config)}
          </label>
          <select
            id="sport"
            name="sport"
            defaultValue={sport ?? ''}
            className="mt-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
          >
            <option value="">—</option>
            {categories.map((item) => (
              <option key={item.key} value={item.key}>
                {item.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col">
          <label
            htmlFor="specialty"
            className="text-sm font-medium text-gray-700"
          >
            {t('listing.filter.specialty', config)}
          </label>
          <select
            id="specialty"
            name="specialty"
            defaultValue={specialty ?? ''}
            className="mt-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
          >
            <option value="">—</option>
            {specialties.map((item) => (
              <option key={item.key} value={item.key}>
                {item.label}
              </option>
            ))}
          </select>
        </div>

        <Button type="submit" className="rounded-md">
          Filtra
        </Button>
        {(sport || specialty) && (
          <Button asChild variant="outline" className="rounded-md">
            <Link href="/coaches">Azzera</Link>
          </Button>
        )}
      </form>

      {coaches.length === 0 ? (
        <p className="text-gray-500">{t('listing.empty', config)}</p>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {coaches.map((coach) => (
            <Card key={coach.slug} className="flex flex-col">
              <CardHeader>
                <div className="flex items-start gap-4">
                  <CoachAvatar
                    name={coach.displayName}
                    src={coach.avatarUrl}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <CardTitle className="truncate text-lg">
                        {coach.displayName ?? 'Coach'}
                      </CardTitle>
                      <CertifiedBadge
                        certified={coach.certified}
                        title={
                          coach.certified
                            ? t('coach.certified.yes', config)
                            : t('coach.certified.no', config)
                        }
                      />
                    </div>
                    {coach.headline && (
                      <p className="mt-1 text-sm text-muted-foreground">
                        {coach.headline}
                      </p>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-4">
                {coach.categories && coach.categories.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {coach.categories.map((key) => (
                      <span
                        key={key}
                        className="rounded-full bg-orange-50 px-2.5 py-0.5 text-xs font-medium text-orange-700"
                      >
                        {labelFor(categories, key)}
                      </span>
                    ))}
                  </div>
                )}
                {coach.specialties && coach.specialties.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {coach.specialties.map((key) => (
                      <span
                        key={key}
                        className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600"
                      >
                        {labelFor(specialties, key)}
                      </span>
                    ))}
                  </div>
                )}
                <div className="mt-auto flex items-center justify-between pt-2">
                  <span className="text-sm text-gray-500">
                    {coach.hourlyRate != null
                      ? `${formatPrice(coach.hourlyRate, coach.currency)} / h`
                      : ''}
                  </span>
                  <Button asChild variant="outline" className="rounded-full">
                    <Link href={`/coaches/${coach.slug}`}>Vedi profilo</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </main>
  );
}
