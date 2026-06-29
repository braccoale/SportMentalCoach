import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { getVerticalConfig, findTaxonomyItem, t } from '@/lib/core/config';
import { getCoachBySlug } from '@/lib/core/listings';
import { formatPrice } from '@/lib/core/format';
import { getUser } from '@/lib/db/queries';
import { hasRole } from '@/lib/core/auth';
import { CoachAvatar, CertifiedBadge } from '@/components/coach-visuals';
import { BookingRequest } from './booking-request';

export const dynamic = 'force-dynamic';

export default async function CoachDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const coach = await getCoachBySlug(slug);

  if (!coach) {
    notFound();
  }

  const user = await getUser();
  const isAthlete = user ? await hasRole(user.id, 'athlete') : false;
  const config = getVerticalConfig();
  const { categories, specialties } = config.taxonomies;
  const labelFor = (items: typeof categories, key: string) =>
    findTaxonomyItem(items, key)?.label ?? key;

  return (
    <main className="max-w-4xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-10">
      <Link
        href="/coaches"
        className="text-sm text-gray-500 hover:text-gray-900"
      >
        ← {t('listing.title', config)}
      </Link>

      <header className="mt-4 flex items-start gap-5">
        <CoachAvatar
          name={coach.displayName}
          src={coach.avatarUrl}
          className="size-24"
        />
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold text-gray-900">
            {coach.displayName ?? 'Coach'}
          </h1>
          <CertifiedBadge
            certified={coach.certified}
            title={
              coach.certified
                ? t('coach.certified.yes', config)
                : t('coach.certified.no', config)
            }
            withLabel
          />
          {coach.headline && (
            <p className="text-lg text-gray-600">{coach.headline}</p>
          )}
          {coach.hourlyRate != null && (
            <p className="text-sm text-gray-500">
              {t('provider.rate.label', config)}:{' '}
              {formatPrice(coach.hourlyRate, coach.currency)} / h
            </p>
          )}
        </div>
      </header>

      {(coach.bio || coach.description) && (
        <p className="mt-6 whitespace-pre-line text-gray-700">
          {coach.description ?? coach.bio}
        </p>
      )}

      {coach.categories && coach.categories.length > 0 && (
        <section className="mt-6">
          <h2 className="text-sm font-medium text-gray-700">
            {t('provider.sports.label', config)}
          </h2>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {coach.categories.map((key) => (
              <span
                key={key}
                className="rounded-full bg-orange-50 px-2.5 py-0.5 text-xs font-medium text-orange-700"
              >
                {labelFor(categories, key)}
              </span>
            ))}
          </div>
        </section>
      )}

      {coach.specialties && coach.specialties.length > 0 && (
        <section className="mt-6">
          <h2 className="text-sm font-medium text-gray-700">
            {t('provider.specialties.label', config)}
          </h2>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {coach.specialties.map((key) => (
              <span
                key={key}
                className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600"
              >
                {labelFor(specialties, key)}
              </span>
            ))}
          </div>
        </section>
      )}

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-gray-900">Servizi</h2>
        {coach.services.length === 0 ? (
          <p className="mt-2 text-gray-500">Nessun servizio disponibile.</p>
        ) : (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {coach.services.map((service) => (
              <Card key={service.id}>
                <CardHeader>
                  <CardTitle className="text-base">
                    {service.title ?? 'Servizio'}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {service.durationMin ? `${service.durationMin} min` : ''}
                    {service.durationMin && service.price != null ? ' · ' : ''}
                    {service.price != null
                      ? formatPrice(service.price, service.currency)
                      : ''}
                  </p>
                </CardHeader>
                {service.description && (
                  <CardContent>
                    <p className="text-sm text-gray-600">
                      {service.description}
                    </p>
                  </CardContent>
                )}
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Booking request — athletes only. */}
      <div className="mt-10 border-t border-gray-200 pt-6">
        <h2 className="mb-4 text-xl font-semibold text-gray-900">
          {t('booking.cta', config)}
        </h2>

        {!user ? (
          <div className="flex flex-col items-start gap-2">
            <p className="text-sm text-gray-600">
              Accedi come atleta per richiedere una sessione.
            </p>
            <Button asChild size="lg" className="rounded-full">
              <Link href={`/sign-in?redirect=/coaches/${slug}`}>
                {t('booking.cta', config)}
              </Link>
            </Button>
          </div>
        ) : isAthlete ? (
          <BookingRequest
            slug={slug}
            services={coach.services.map((s) => ({ id: s.id, title: s.title }))}
            ctaLabel={t('booking.cta', config)}
          />
        ) : (
          <p className="rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Solo gli atleti possono richiedere una sessione. Accedi con un
            account atleta per prenotare.
          </p>
        )}
      </div>
    </main>
  );
}
