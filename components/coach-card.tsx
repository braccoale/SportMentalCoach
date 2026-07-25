import Link from 'next/link';
import { Globe, Users, Clock, ArrowRight, BadgeCheck } from 'lucide-react';
import { getVerticalConfig, findTaxonomyItem } from '@/lib/core/config';
import type { TaxonomyItem } from '@/lib/core/config/types';
import { formatPrice, formatTotalHours } from '@/lib/core/format';
import type { DiscoveryCoach } from '@/lib/core/listings';
import { CertifiedBadge } from '@/components/coach-visuals';
import { RatingStars } from '@/components/rating-stars';
import { FavoriteButton } from '@/components/favorite-button';
import { GaugeRing, gaugeProgress } from '@/components/coach-experience-stats';
import { SHOW_COACH_HOURLY_RATE } from '@/lib/core/flags';

export function CoachCard({
  coach,
  loggedIn,
  sportsList,
}: {
  coach: DiscoveryCoach;
  loggedIn: boolean;
  /** DB taxonomy rows for label resolution; falls back to the static config. */
  sportsList?: TaxonomyItem[];
}) {
  const config = getVerticalConfig();
  const sportSource = sportsList ?? config.taxonomies.categories;
  const sportLabels = (coach.categories ?? [])
    .slice(0, 3)
    .map((k) => findTaxonomyItem(sportSource, k)?.label ?? k);
  const name = coach.displayName ?? 'Coach';

  return (
    <div className="relative flex overflow-hidden rounded-3xl border border-gray-200/80 bg-white shadow-md ring-1 ring-black/[0.03] transition hover:-translate-y-0.5 hover:border-red-200 hover:shadow-xl">
      <div className="absolute right-4 top-4 z-10">
        <FavoriteButton
          providerId={coach.providerId}
          initial={coach.isFavorite}
          loggedIn={loggedIn}
        />
      </div>

      {/* Photo panel. The image is absolutely positioned so it never adds to the
          card's height: the card height is driven only by the text content, and
          a tall/portrait photo simply stretches (object-cover) to fill and crop
          — the card stays the same size for everyone. */}
      <div className="relative hidden w-[26%] shrink-0 overflow-hidden bg-gray-900 sm:block">
        {coach.avatarUrl ? (
          <img
            src={coach.avatarUrl}
            alt={name}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-100 text-4xl font-semibold text-gray-300">
            {name.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-white/70 via-transparent to-transparent" />
      </div>

      <Link
        href={`/coaches/${coach.slug}`}
        className="flex flex-1 flex-col justify-between gap-3 p-4"
      >
        <div>
          <div className="min-w-0 pr-10">
            <div className="flex items-center gap-2">
              <h3 className="truncate text-xl font-bold tracking-tight text-gray-950">
                {name}
              </h3>
              <CertifiedBadge
                certified={coach.certified}
                title={
                  coach.certified
                    ? 'Certificato KaiPai Academy'
                    : 'Coach non certificato'
                }
              />
            </div>
            <div className="mt-1">
              {coach.rating.count > 0 ? (
                <span className="flex items-center gap-1.5 text-sm text-gray-700">
                  <RatingStars value={coach.rating.average ?? 0} />
                  <span className="font-medium">{coach.rating.average}</span>
                  <span className="text-gray-400">({coach.rating.count})</span>
                </span>
              ) : (
                <span className="text-sm text-gray-400">Nuovo coach</span>
              )}
            </div>
          </div>

          {/* Reserved one-line slot so cards with/without a headline stay the
              same height. */}
          <p className="mt-2 line-clamp-1 min-h-5 text-sm text-gray-600">
            {coach.headline || ' '}
          </p>

          {/* Reserved slot for the certified pill — kept even when absent so
              certified and non-certified cards line up to the same height. */}
          <div className="mt-2 min-h-[1.75rem]">
            {coach.certified && (
              <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-600">
                <BadgeCheck className="h-3.5 w-3.5" />
                Certificato KaiPai
              </span>
            )}
          </div>

          <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-gray-100 pt-2.5 text-sm text-gray-600">
            {sportLabels.length > 0 && <span>{sportLabels.join(' · ')}</span>}
            {coach.languages && coach.languages.length > 0 && (
              <>
                {sportLabels.length > 0 && (
                  <span className="h-4 w-px bg-gray-200" />
                )}
                <span className="inline-flex items-center gap-1.5">
                  <Globe className="h-4 w-4 text-gray-400" />
                  {coach.languages.join(', ')}
                </span>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-gray-100 pt-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-4">
            {coach.athletesCount > 0 && (
              <>
                <div className="flex items-center gap-2">
                  <div className="relative flex h-8 w-8 shrink-0 items-center justify-center">
                    <GaugeRing
                      progress={gaugeProgress(coach.athletesCount, 20)}
                      className="stroke-blue-500"
                      size={32}
                    />
                    <Users className="absolute h-3.5 w-3.5 text-blue-500" />
                  </div>
                  <span className="text-sm font-medium text-gray-700">
                    {coach.athletesCount}{' '}
                    {coach.athletesCount === 1 ? 'atleta' : 'atleti'}
                  </span>
                </div>
                {coach.totalMinutes > 0 && (
                  <div className="flex items-center gap-2">
                    <div className="relative flex h-8 w-8 shrink-0 items-center justify-center">
                      <GaugeRing
                        progress={gaugeProgress(coach.totalMinutes, 600)}
                        className="stroke-sky-500"
                        size={32}
                      />
                      <Clock className="absolute h-3.5 w-3.5 text-sky-500" />
                    </div>
                    <span className="text-sm font-medium text-gray-700">
                      {formatTotalHours(coach.totalMinutes)}
                    </span>
                  </div>
                )}
              </>
            )}
            {SHOW_COACH_HOURLY_RATE && coach.hourlyRate != null && (
              <span className="text-gray-700">
                <span className="text-gray-400">da </span>
                <span className="font-semibold text-gray-900">
                  {formatPrice(coach.hourlyRate, coach.currency)}
                </span>
                <span className="text-gray-400"> / h</span>
              </span>
            )}
          </div>

          <div className="flex sm:justify-end">
            <span className="inline-flex items-center gap-2 whitespace-nowrap rounded-full bg-green-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-700">
              Prenota un incontro <ArrowRight className="h-4 w-4" />
            </span>
          </div>
        </div>
      </Link>
    </div>
  );
}
