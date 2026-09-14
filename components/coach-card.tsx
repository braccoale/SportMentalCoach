import Link from 'next/link';
import { Globe, Users, Clock, CalendarCheck, ArrowRight, BadgeCheck } from 'lucide-react';
import { getVerticalConfig, findTaxonomyItem } from '@/lib/core/config';
import type { TaxonomyItem } from '@/lib/core/config/types';
import { formatPrice, formatTotalHours } from '@/lib/core/format';
import type { DiscoveryCoach } from '@/lib/core/listings';
import type { BookableDay } from '@/lib/core/availability';
import { CertifiedBadge } from '@/components/coach-visuals';
import { RatingStars } from '@/components/rating-stars';
import { FavoriteButton } from '@/components/favorite-button';
import { CoachChatButton } from '@/components/coach-chat-button';
import { ShareCoachButton } from '@/components/share-coach-button';
import { IntroSessionButton } from '@/components/intro-session-button';
import { GaugeRing, gaugeProgress } from '@/components/coach-experience-stats';
import { SHOW_COACH_HOURLY_RATE } from '@/lib/core/flags';

function StatCell({
  icon: Icon,
  value,
  label,
  progress,
  colorClass,
}: {
  icon: typeof Users;
  value: string | number;
  label: string;
  progress: number;
  colorClass: string;
}) {
  return (
    <div className="flex flex-1 flex-col items-center gap-0.5 px-2 py-2 text-center">
      <div className="relative flex h-9 w-9 items-center justify-center">
        <GaugeRing progress={progress} className={colorClass} size={36} />
        <Icon className={`absolute h-3.5 w-3.5 ${colorClass.replace('stroke-', 'text-')}`} />
      </div>
      <span className="text-sm font-bold text-gray-900">{value}</span>
      <span className="text-[10px] font-medium uppercase tracking-wide text-gray-400">
        {label}
      </span>
    </div>
  );
}

export function CoachCard({
  coach,
  loggedIn,
  isAthlete,
  sportsList,
  bookableDays,
  introAlreadyUsed,
}: {
  coach: DiscoveryCoach;
  loggedIn: boolean;
  /** Se l'atleta ha già letto le condizioni: guida il bottone conoscitiva
   * (stesso identico componente della scheda coach) e le icone chat/condividi. */
  isAthlete: boolean;
  /** DB taxonomy rows for label resolution; falls back to the static config. */
  sportsList?: TaxonomyItem[];
  /** Calendario del coach, calcolato una volta per tutta la pagina — vedi
   * app/(marketplace)/coaches/page.tsx. */
  bookableDays: BookableDay[];
  introAlreadyUsed: boolean;
}) {
  const config = getVerticalConfig();
  const sportSource = sportsList ?? config.taxonomies.categories;
  const sportLabels = (coach.categories ?? [])
    .slice(0, 3)
    .map((k) => findTaxonomyItem(sportSource, k)?.label ?? k);
  const name = coach.displayName ?? 'Coach';
  const firstName = name.split(' ')[0];
  const primaryService = coach.services?.[0];

  return (
    <div className="relative flex overflow-hidden rounded-3xl border border-gray-200/80 bg-white shadow-md ring-1 ring-black/[0.03] transition hover:border-red-200 hover:shadow-xl">
      {/* Icone azione: fuori dal <Link> di sotto, sono bottoni veri (chat apre
          un form, condividi e conoscitiva aprono un dialog) — annidarli in un
          <a> sarebbe HTML non valido e il click aprirebbe anche la scheda. */}
      <div className="absolute right-4 top-4 z-10 flex items-center gap-2">
        <CoachChatButton slug={coach.slug} loggedIn={loggedIn} isAthlete={isAthlete} />
        <ShareCoachButton name={name} profilePath={`/coaches/${coach.slug}`} />
        <FavoriteButton
          providerId={coach.providerId}
          initial={coach.isFavorite}
          loggedIn={loggedIn}
          returnTo={`/coaches/${coach.slug}`}
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

      <div className="flex flex-1 flex-col justify-between gap-2.5 p-4">
        <Link href={`/coaches/${coach.slug}`} className="block">
          <div className="min-w-0 pr-28">
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
              same height. La pillola "Certificato" (quando c'è) va sulla
              stessa riga della frase, non in uno slot vuoto a parte sotto —
              era lei a lasciare la fascia bianca lamentata. */}
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="line-clamp-1 min-h-5 text-sm text-gray-600">
              {coach.headline || ' '}
            </p>
            {coach.certified && (
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-600">
                <BadgeCheck className="h-3.5 w-3.5" />
                Certificato KaiPai
              </span>
            )}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-gray-100 pt-2 text-sm text-gray-600">
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
        </Link>

        {coach.athletesCount > 0 && (
          <div className="flex divide-x divide-gray-100 rounded-xl border border-gray-100 bg-gray-50/60">
            <StatCell
              icon={Users}
              value={coach.athletesCount}
              label={coach.athletesCount === 1 ? 'Atleta' : 'Atleti'}
              progress={gaugeProgress(coach.athletesCount, 20)}
              colorClass="stroke-blue-500"
            />
            <StatCell
              icon={CalendarCheck}
              value={coach.completedSessions}
              label="Sessioni"
              progress={gaugeProgress(coach.completedSessions, 50)}
              colorClass="stroke-cyan-500"
            />
            <StatCell
              icon={Clock}
              value={formatTotalHours(coach.totalMinutes)}
              label="Erogate"
              progress={gaugeProgress(coach.totalMinutes, 600)}
              colorClass="stroke-sky-500"
            />
          </div>
        )}

        <div className="flex flex-col gap-2 border-t border-gray-100 pt-2.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm">
            {primaryService?.durationMin != null && primaryService?.price != null ? (
              <span className="text-gray-700">
                <span className="font-semibold text-gray-900">
                  {formatPrice(primaryService.price, primaryService.currency)}
                </span>
                <span className="text-gray-400"> / {primaryService.durationMin} min</span>
              </span>
            ) : (
              SHOW_COACH_HOURLY_RATE &&
              coach.hourlyRate != null && (
                <span className="text-gray-700">
                  <span className="text-gray-400">da </span>
                  <span className="font-semibold text-gray-900">
                    {formatPrice(coach.hourlyRate, coach.currency)}
                  </span>
                  <span className="text-gray-400"> / h</span>
                </span>
              )
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <IntroSessionButton
              slug={coach.slug}
              coachFirstName={firstName}
              loggedIn={loggedIn}
              isAthlete={isAthlete}
              bookableDays={bookableDays}
              alreadyUsed={introAlreadyUsed}
            />
            <Link
              href={`/coaches/${coach.slug}`}
              className="inline-flex items-center gap-2 whitespace-nowrap rounded-full bg-green-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-700"
            >
              Prenota un incontro <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
