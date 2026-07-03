import Link from 'next/link';
import { Sparkles, Globe, Briefcase } from 'lucide-react';
import { getVerticalConfig, findTaxonomyItem } from '@/lib/core/config';
import type { TaxonomyItem } from '@/lib/core/config/types';
import { formatPrice } from '@/lib/core/format';
import type { DiscoveryCoach } from '@/lib/core/listings';
import { CoachAvatar, CertifiedBadge } from '@/components/coach-visuals';
import { RatingStars } from '@/components/rating-stars';
import { FavoriteButton } from '@/components/favorite-button';
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
    <div className="relative flex flex-col rounded-2xl border border-gray-200/80 bg-white p-6 shadow-md ring-1 ring-black/[0.03] transition hover:-translate-y-0.5 hover:border-red-200 hover:shadow-xl">
      <div className="absolute right-3 top-3 z-10">
        <FavoriteButton
          providerId={coach.providerId}
          initial={coach.isFavorite}
          loggedIn={loggedIn}
        />
      </div>

      {coach.recommended && (
        <span className="mb-3 inline-flex w-fit items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-600">
          <Sparkles className="h-3 w-3" /> Consigliato
        </span>
      )}

      <Link href={`/coaches/${coach.slug}`} className="flex flex-1 flex-col">
        <div className="flex items-start gap-4 pr-9">
          <CoachAvatar name={name} src={coach.avatarUrl} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="truncate font-semibold text-gray-900">{name}</span>
              <CertifiedBadge
                certified={coach.certified}
                title={
                  coach.certified
                    ? 'Certificato Kai Pai Academy'
                    : 'Coach non certificato'
                }
              />
            </div>
            {coach.rating.count > 0 ? (
              <span className="mt-0.5 flex items-center gap-1.5 text-xs text-gray-600">
                <RatingStars value={coach.rating.average ?? 0} size="sm" />
                <span className="font-medium">{coach.rating.average}</span>
                <span className="text-gray-400">({coach.rating.count})</span>
              </span>
            ) : (
              <span className="text-xs text-gray-400">Nuovo coach</span>
            )}
          </div>
        </div>

        {coach.headline && (
          <p className="mt-3 line-clamp-2 text-sm text-gray-600">
            {coach.headline}
          </p>
        )}

        {coach.matchReasons.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {coach.matchReasons.map((reason, i) => (
              <span
                key={reason}
                className={
                  i === 0
                    ? 'rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-600'
                    : 'rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600'
                }
              >
                {reason}
              </span>
            ))}
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
          {sportLabels.length > 0 && <span>{sportLabels.join(' · ')}</span>}
          {coach.languages && coach.languages.length > 0 && (
            <span className="inline-flex items-center gap-1">
              <Globe className="h-3.5 w-3.5" /> {coach.languages.join(', ')}
            </span>
          )}
          {coach.yearsExperience != null && (
            <span className="inline-flex items-center gap-1">
              <Briefcase className="h-3.5 w-3.5" /> {coach.yearsExperience} anni
            </span>
          )}
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-4">
          {/* Hourly rate hidden via SHOW_COACH_HOURLY_RATE flag; the empty
              span keeps "Vedi profilo" aligned right when the price is off. */}
          {SHOW_COACH_HOURLY_RATE && coach.hourlyRate != null ? (
            <span className="text-sm text-gray-700">
              <span className="text-gray-400">da </span>
              <span className="font-semibold text-gray-900">
                {formatPrice(coach.hourlyRate, coach.currency)}
              </span>
              <span className="text-gray-400"> / h</span>
            </span>
          ) : (
            <span />
          )}
          <span className="text-sm font-medium text-red-600">
            Vedi profilo →
          </span>
        </div>
      </Link>
    </div>
  );
}
