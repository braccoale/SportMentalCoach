import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  BadgeCheck,
  Globe,
  Award,
  Briefcase,
  Users,
  Video,
  Star,
  CalendarClock,
  CalendarCheck,
  CalendarDays,
  CheckCircle2,
  ShieldCheck,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { getVerticalConfig, findTaxonomyItem, t } from '@/lib/core/config';
import { getCoachBySlug } from '@/lib/core/listings';
import {
  getApprovedCoachAvailabilityBySlug,
  describeAvailability,
  getBookableDays,
  getCoachBusyIntervalsByProviderIds,
} from '@/lib/core/availability';
import { getReviewSummary, getCoachReviews } from '@/lib/core/reviews';
import { getCompletedSessionCount } from '@/lib/core/bookings';
import {
  formatPrice,
  formatMinutesOfDay,
  formatDateTime,
  formatDate,
  WEEKDAY_LABELS,
} from '@/lib/core/format';
import { getUser } from '@/lib/db/queries';
import { getAllSports, getAllSpecialties } from '@/lib/core/taxonomies';
import { hasRole } from '@/lib/core/auth';
import { SHOW_COACH_HOURLY_RATE } from '@/lib/core/flags';
import { CoachAvatar, CertifiedBadge } from '@/components/coach-visuals';
import { CoachExperienceStats } from '@/components/coach-experience-stats';
import { RatingStars } from '@/components/rating-stars';
import { VideoEmbed } from '@/components/video-embed';
import {
  TrustAndSafeguarding,
  MarketplaceFaq,
  CancellationPolicy,
} from '@/components/trust-sections';
import { BookingRequest } from './booking-request';

export const dynamic = 'force-dynamic';

/**
 * Converts a YouTube/Vimeo URL to a safe embed URL plus the provider name, or
 * null (link fallback).
 *
 * YouTube embeds use `youtube-nocookie.com`, which skips the tracking cookies
 * the standard domain sets. That alone isn't enough — Google still sees the
 * IP — so the embed is additionally click-to-load via `VideoEmbed`.
 */
function toEmbed(url: string): { src: string; provider: string } | null {
  const yt = (id: string) => ({
    src: `https://www.youtube-nocookie.com/embed/${id}`,
    provider: 'YouTube',
  });
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\.|^m\./, '');
    if (host === 'youtu.be') {
      const id = u.pathname.slice(1);
      return id ? yt(id) : null;
    }
    if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
      if (u.pathname.startsWith('/embed/')) {
        return yt(u.pathname.replace('/embed/', ''));
      }
      const v = u.searchParams.get('v');
      return v ? yt(v) : null;
    }
    if (host === 'vimeo.com') {
      const id = u.pathname.split('/').filter(Boolean)[0];
      return id && /^\d+$/.test(id)
        ? { src: `https://player.vimeo.com/video/${id}`, provider: 'Vimeo' }
        : null;
    }
    return null;
  } catch {
    return null;
  }
}

export default async function CoachDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ richiesta?: string }>;
}) {
  const { slug } = await params;
  // After a booking request the user lands back here with ?richiesta=ok and
  // the booking box shows a clear confirmation instead of the form.
  const justRequested = (await searchParams).richiesta === 'ok';
  const coach = await getCoachBySlug(slug);
  if (!coach) {
    notFound();
  }

  const [
    user,
    availability,
    busyByProvider,
    reviewSummary,
    reviews,
    completedSessions,
  ] =
    await Promise.all([
      getUser(),
      getApprovedCoachAvailabilityBySlug(slug),
      getCoachBusyIntervalsByProviderIds([coach.providerId]),
      getReviewSummary(coach.providerId),
      getCoachReviews(coach.providerId, 12),
      getCompletedSessionCount(coach.providerId),
    ]);
  const isAthlete = user ? await hasRole(user.id, 'athlete') : false;

  const config = getVerticalConfig();
  const { levels } = config.taxonomies;
  // Labels resolve from ALL taxonomy rows (also inactive ones), so profiles
  // referencing a deactivated key keep rendering correctly.
  const [categories, specialties] = await Promise.all([
    getAllSports(),
    getAllSpecialties(),
  ]);
  const labelFor = (items: typeof categories, key: string) =>
    findTaxonomyItem(items, key)?.label ?? key;

  const embed = coach.videoUrl ? toEmbed(coach.videoUrl) : null;
  // Uploaded video files (not YouTube/Vimeo) are played inline via <video>.
  const uploadedVideo =
    coach.videoUrl && !embed &&
    (coach.videoUrl.startsWith('/uploads/') ||
      /\.(mp4|webm|mov|ogg)(\?|$)/i.test(coach.videoUrl))
      ? coach.videoUrl
      : null;
  const name = coach.displayName ?? 'Coach';
  const firstName = name.split(' ')[0];
  // Compact availability hint shown beside the date field in the form.
  const availabilityHint = describeAvailability(availability.slice(0, 3));
  // Concrete day+time options for the constrained booking picker.
  const bookableDays = getBookableDays(availability, {
    busyIntervals: busyByProvider.get(coach.providerId) ?? [],
  });
  const memberSince = new Intl.DateTimeFormat('it-IT', {
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Rome',
  }).format(coach.memberSince);
  const certTitle = coach.certified
    ? t('coach.certified.yes', config)
    : t('coach.certified.no', config);

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <Link
        href="/coaches"
        className="text-sm text-gray-500 hover:text-gray-900"
      >
        ← {t('listing.title', config)}
      </Link>

      {/* HERO — identity + proof + primary action */}
      <header className="mt-4 flex flex-col gap-7 sm:flex-row sm:items-start">
        <CoachAvatar
          name={name}
          src={coach.avatarUrl}
          className="size-36 sm:size-44 lg:size-52"
        />
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="text-3xl font-bold text-gray-900">{name}</h1>
            <CertifiedBadge certified={coach.certified} title={certTitle} />
          </div>
          {coach.headline && (
            <p className="mt-1 text-lg text-gray-600">{coach.headline}</p>
          )}

          {/* rating / new */}
          <div className="mt-2">
            {reviewSummary.count > 0 ? (
              <a
                href="#recensioni"
                className="inline-flex items-center gap-2 text-sm text-gray-700 transition hover:text-gray-900"
              >
                <RatingStars value={reviewSummary.average ?? 0} />
                <span className="font-medium">{reviewSummary.average}</span>
                <span className="text-gray-500">
                  ({reviewSummary.count}{' '}
                  {reviewSummary.count === 1 ? 'recensione' : 'recensioni'})
                </span>
              </a>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-700">
                <Star className="h-3.5 w-3.5" /> Nuovo su{' '}
                {t('brand.name', config)}
              </span>
            )}
          </div>

          {/* key facts */}
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-gray-600">
            {coach.identityVerified && (
              <span className="inline-flex items-center gap-1.5 font-medium text-emerald-700">
                <ShieldCheck className="h-4 w-4" /> Identità verificata
              </span>
            )}
            {completedSessions > 0 && (
              <span className="inline-flex items-center gap-1.5">
                <CalendarCheck className="h-4 w-4 text-gray-400" />
                {completedSessions} sessioni completate
              </span>
            )}
            {coach.yearsExperience != null && (
              <span className="inline-flex items-center gap-1.5">
                <Briefcase className="h-4 w-4 text-gray-400" />
                {coach.yearsExperience} anni di esperienza
              </span>
            )}
            {coach.languages && coach.languages.length > 0 && (
              <span className="inline-flex items-center gap-1.5">
                <Globe className="h-4 w-4 text-gray-400" />
                {coach.languages.join(', ')}
              </span>
            )}
          </div>

          {/* mobile CTA → scrolls to booking */}
          <Button
            asChild
            size="lg"
            className="mt-4 w-full rounded-full lg:hidden"
          >
            <a href="#prenota">{t('booking.cta', config)}</a>
          </Button>
        </div>
      </header>

      <CoachExperienceStats
        athletesCount={coach.athletesCount}
        totalMinutes={coach.totalMinutes}
      />

      <div className="mt-8 grid gap-8 lg:grid-cols-3">
        {/* BOOKING — first on mobile, sticky right on desktop */}
        <aside id="prenota" className="order-1 lg:order-2 lg:col-span-1">
          <div className="lg:sticky lg:top-6">
            <Card>
              {!justRequested && (
                <CardHeader>
                  <CardTitle className="text-lg">
                    Inizia il tuo percorso con {firstName}
                  </CardTitle>
                  {SHOW_COACH_HOURLY_RATE && coach.hourlyRate != null && (
                    <p className="text-sm text-muted-foreground">
                      a partire da{' '}
                      <span className="font-semibold text-gray-900">
                        {formatPrice(coach.hourlyRate, coach.currency)}
                      </span>{' '}
                      / h
                    </p>
                  )}
                </CardHeader>
              )}
              <CardContent className="flex flex-col gap-4">
                {justRequested ? (
                  /* ✔ Confirmation state — the moment of trust */
                  <div className="flex flex-col items-center gap-3 py-4 text-center">
                    <span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50">
                      <CheckCircle2 className="h-8 w-8 text-emerald-600" />
                    </span>
                    <p className="text-lg font-semibold text-gray-900">
                      Richiesta inviata a {firstName}!
                    </p>
                    <p className="text-sm leading-relaxed text-gray-600">
                      Riceve subito una notifica e di solito risponde entro 24
                      ore. Ti avvisiamo appena accetta.
                    </p>
                    <Button asChild variant="outline" className="mt-1 rounded-full">
                      <Link href="/dashboard/athlete">
                        Segui la richiesta in “Le tue sessioni”
                      </Link>
                    </Button>
                  </div>
                ) : !user ? (
                  <div className="flex flex-col gap-2.5">
                    <p className="text-sm leading-relaxed text-gray-600">
                      Ti serve solo un account gratuito — poi torni qui e
                      completi la richiesta.
                    </p>
                    <Button asChild size="lg" className="rounded-full">
                      <Link href={`/sign-in?redirect=/coaches/${slug}`}>
                        Inizia — è gratis
                      </Link>
                    </Button>
                  </div>
                ) : isAthlete ? (
                  <BookingRequest
                    slug={slug}
                    coachFirstName={firstName}
                    services={coach.services.map((s) => ({
                      id: s.id,
                      title: s.title,
                      durationMin: s.durationMin,
                    }))}
                    bookableDays={bookableDays}
                  />
                ) : (
                  <p className="rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-800">
                    Solo gli atleti possono richiedere una sessione.
                  </p>
                )}

                {!justRequested && (
                  <>
                    {/* Cosa succede adesso? — 4 rassicurazioni in 4 righe */}
                    <div className="border-t border-gray-100 pt-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                        Cosa succede adesso?
                      </p>
                      <ol className="mt-2 flex flex-col gap-1.5 text-xs text-gray-600">
                        {[
                          'Invii la richiesta',
                          `${firstName} la valuta`,
                          'Ricevi la conferma',
                          'Vi allenate online',
                        ].map((step, i) => (
                          <li key={step} className="flex items-center gap-2">
                            <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-red-50 text-[10px] font-semibold text-red-600">
                              {i + 1}
                            </span>
                            {step}
                          </li>
                        ))}
                      </ol>
                    </div>

                    <ul className="flex flex-col gap-1.5 border-t border-gray-100 pt-3 text-xs text-gray-500">
                      {coach.identityVerified && (
                        <li className="flex items-center gap-1.5 text-emerald-700">
                          <ShieldCheck className="h-3.5 w-3.5" /> Identità
                          verificata da KaiPai
                        </li>
                      )}
                      <li className="flex items-center gap-1.5">
                        <BadgeCheck className="h-3.5 w-3.5 text-gray-400" />
                        Nessun pagamento richiesto ora
                      </li>
                      <li className="flex items-center gap-1.5">
                        <BadgeCheck className="h-3.5 w-3.5 text-gray-400" />
                        Puoi annullare quando vuoi
                      </li>
                    </ul>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </aside>

        {/* CONTENT */}
        <div className="order-2 flex flex-col lg:order-1 lg:col-span-2">
          {/* Intro video */}
          {coach.videoUrl && (
            <section>
              <h2 className="flex items-center gap-2 text-xl font-semibold text-gray-900">
                <Video className="h-5 w-5 text-red-600" /> Presentazione
              </h2>
              {embed ? (
                <div className="mt-3">
                  <VideoEmbed
                    src={embed.src}
                    provider={embed.provider}
                    title={`Video di presentazione di ${name}`}
                  />
                </div>
              ) : uploadedVideo ? (
                <div className="mt-3 aspect-video overflow-hidden rounded-lg border border-gray-200 bg-black">
                  <video
                    src={uploadedVideo}
                    controls
                    preload="metadata"
                    className="h-full w-full object-contain"
                  />
                </div>
              ) : (
                <Button asChild variant="outline" className="mt-3 rounded-full">
                  <a href={coach.videoUrl} target="_blank" rel="noreferrer">
                    Guarda il video di presentazione
                  </a>
                </Button>
              )}
            </section>
          )}

          {/* About + philosophy */}
          {(coach.description || coach.bio) && (
            <section className="mt-10">
              <h2 className="text-xl font-semibold text-gray-900">
                Il mio approccio
              </h2>
              {coach.description && (
                <p className="mt-2 whitespace-pre-line text-gray-700">
                  {coach.description}
                </p>
              )}
              {coach.bio && coach.bio !== coach.description && (
                <p className="mt-3 whitespace-pre-line text-gray-600">
                  {coach.bio}
                </p>
              )}
            </section>
          )}

          {/* Credentials & verification — strongest, verified signals first */}
          <section className="mt-10">
            <h2 className="text-xl font-semibold text-gray-900">
              Credenziali e verifica
            </h2>
            <ul className="mt-3 flex flex-col gap-2 text-sm text-gray-700">
              {coach.identityVerified && (
                <li className="flex items-center gap-2 font-medium text-emerald-700">
                  <ShieldCheck className="h-4 w-4" /> Identità verificata dal
                  team {t('brand.name', config)}
                </li>
              )}
              {coach.certified && (
                <li className="flex items-center gap-2">
                  <Award className="h-4 w-4 text-red-600" /> {certTitle}
                </li>
              )}
              {completedSessions > 0 && (
                <li className="flex items-center gap-2">
                  <CalendarCheck className="h-4 w-4 text-gray-400" />
                  {completedSessions} sessioni completate su{' '}
                  {t('brand.name', config)}
                </li>
              )}
              <li className="flex items-center gap-2 text-gray-500">
                <CalendarDays className="h-4 w-4 text-gray-400" /> Su{' '}
                {t('brand.name', config)} da {memberSince}
              </li>
            </ul>

            {coach.certifications && coach.certifications.length > 0 && (
              <div className="mt-4">
                <p className="flex items-center gap-2 text-sm font-medium text-gray-700">
                  Certificazioni
                  {coach.certificationsVerified && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                      <BadgeCheck className="h-3.5 w-3.5" /> verificate
                    </span>
                  )}
                </p>
                <ul className="mt-2 flex flex-col gap-1.5 text-sm text-gray-700">
                  {coach.certifications.map((c) => (
                    <li key={c} className="flex items-center gap-2">
                      <BadgeCheck
                        className={
                          coach.certificationsVerified
                            ? 'h-4 w-4 text-emerald-500'
                            : 'h-4 w-4 text-gray-300'
                        }
                      />
                      {c}
                    </li>
                  ))}
                </ul>
                {!coach.certificationsVerified && (
                  <p className="mt-1 text-xs text-gray-400">
                    Certificazioni dichiarate dal coach, in attesa di verifica.
                  </p>
                )}
              </div>
            )}
          </section>

          {/* Experience */}
          {((coach.categories && coach.categories.length > 0) ||
            (coach.athleteLevels && coach.athleteLevels.length > 0)) && (
            <section className="mt-10">
              <h2 className="text-xl font-semibold text-gray-900">Esperienza</h2>
              {coach.categories && coach.categories.length > 0 && (
                <div className="mt-3">
                  <p className="text-sm font-medium text-gray-700">
                    {t('provider.sports.label', config)}
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {coach.categories.map((key) => (
                      <span
                        key={key}
                        className="rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-700"
                      >
                        {labelFor(categories, key)}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {coach.athleteLevels && coach.athleteLevels.length > 0 && (
                <div className="mt-4">
                  <p className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
                    <Users className="h-4 w-4 text-gray-400" /> Lavora con
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {coach.athleteLevels.map((key) => (
                      <span
                        key={key}
                        className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600"
                      >
                        {labelFor(levels ?? [], key)}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}

          {/* Specializations */}
          {coach.specialties && coach.specialties.length > 0 && (
            <section className="mt-10">
              <h2 className="text-xl font-semibold text-gray-900">
                {t('provider.specialties.label', config)}
              </h2>
              <div className="mt-3 flex flex-wrap gap-1.5">
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

          {/* Services */}
          <section className="mt-10">
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
                        {service.durationMin && service.price != null
                          ? ' · '
                          : ''}
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

          {/* Availability */}
          {availability.length > 0 && (
            <section className="mt-10">
              <h2 className="text-xl font-semibold text-gray-900">
                Disponibilità
              </h2>
              <ul className="mt-3 flex flex-wrap gap-2">
                {availability.map((slot) => (
                  <li
                    key={slot.id}
                    className="rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-700"
                  >
                    {WEEKDAY_LABELS[slot.weekday]}{' '}
                    {formatMinutesOfDay(slot.startMinute)}–
                    {formatMinutesOfDay(slot.endMinute)}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Reviews */}
          <section id="recensioni" className="mt-10 scroll-mt-24">
            <h2 className="text-xl font-semibold text-gray-900">Recensioni</h2>
            {reviewSummary.count === 0 ? (
              <div className="mt-3 rounded-lg border border-dashed border-gray-200 p-4">
                <p className="text-sm text-gray-600">
                  {name} non ha ancora recensioni verificate.
                </p>
                <ul className="mt-2 flex flex-col gap-1 text-sm text-gray-500">
                  {coach.identityVerified && (
                    <li className="flex items-center gap-1.5 text-emerald-700">
                      <ShieldCheck className="h-4 w-4" /> Identità già verificata
                      dal team {t('brand.name', config)}
                    </li>
                  )}
                  <li className="flex items-center gap-1.5">
                    <CalendarDays className="h-4 w-4 text-gray-400" /> Su{' '}
                    {t('brand.name', config)} da {memberSince}
                  </li>
                </ul>
                <p className="mt-2 text-sm text-gray-400">
                  Le recensioni sono lasciate solo dagli atleti dopo una sessione
                  completata.
                </p>
              </div>
            ) : (
              <>
                <div className="mt-2 flex items-center gap-2 text-sm text-gray-700">
                  <RatingStars value={reviewSummary.average ?? 0} />
                  <span className="font-medium">{reviewSummary.average}</span>
                  <span className="text-gray-500">
                    su {reviewSummary.count}{' '}
                    {reviewSummary.count === 1
                      ? 'recensione verificata'
                      : 'recensioni verificate'}
                  </span>
                </div>
                <ul className="mt-4 flex flex-col gap-4">
                  {reviews.map((r) => (
                    <li
                      key={r.id}
                      className="rounded-lg border border-gray-100 p-4"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-900">
                          {r.authorName}
                        </span>
                        <RatingStars value={r.rating} size="sm" />
                      </div>
                      {r.body && (
                        <p className="mt-1.5 text-sm text-gray-600">{r.body}</p>
                      )}
                      <p className="mt-1 flex items-center gap-1 text-xs text-gray-400">
                        {r.verified && (
                          <BadgeCheck className="h-3.5 w-3.5 text-red-600" />
                        )}
                        {r.verified ? 'Recensione verificata · ' : ''}
                        {formatDate(r.createdAt)}
                      </p>
                      {r.reply && (
                        <div className="mt-3 rounded-md border-l-2 border-red-200 bg-red-50/50 px-3 py-2">
                          <p className="text-xs font-medium text-gray-700">
                            Risposta di {name}
                          </p>
                          <p className="mt-0.5 text-sm text-gray-600">
                            {r.reply}
                          </p>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>

          {/* Trust / FAQ / Policy */}
          <TrustAndSafeguarding />
          <MarketplaceFaq />
          <CancellationPolicy />
        </div>
      </div>
    </main>
  );
}
