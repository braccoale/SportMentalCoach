import Link from 'next/link';
import { Globe, Users, Clock, CalendarCheck, ArrowRight, BadgeCheck, Briefcase } from 'lucide-react';
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
import { BookSessionDialog } from '@/components/book-session-dialog';
import { DEFAULT_SINGLE_SESSION_VALIDITY_DAYS } from '@/lib/core/billing/single-session';
import { SubscribeDialog } from '@/components/subscribe-dialog';
import type { BookableDay as CardBookableDay } from '@/lib/core/availability';
import { StatMedal } from '@/components/coach-experience-stats';
import { canSeeCoachPricing } from '@/lib/core/flags';
import { DEMO_READONLY_MESSAGE } from '@/lib/auth/demo-readonly';

function StatCell({
  icon,
  value,
  label,
  fromColor,
  toColor,
}: {
  icon: typeof Users;
  value: string | number;
  label: string;
  fromColor: string;
  toColor: string;
}) {
  return (
    <div className="flex flex-1 flex-col items-center gap-1 px-2 py-2 text-center">
      <StatMedal
        icon={icon}
        value={value}
        size={40}
        iconSize={11}
        valueClassName="text-[11px] font-bold"
        fromColor={fromColor}
        toColor={toColor}
      />
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
  isDemo = false,
  planOffers,
  singleSessionPriceLabel,
  singleSessionValidityDays,
  bookingAccess,
  viewerEmail,
}: {
  coach: DiscoveryCoach;
  loggedIn: boolean;
  /** Se l'atleta ha già letto le condizioni: guida il bottone conoscitiva
   * (stesso identico componente della scheda coach) e le icone chat/condividi. */
  isAthlete: boolean;
  /** DB taxonomy rows for label resolution; falls back to the static config. */
  sportsList?: TaxonomyItem[];
  /** Calendario del coach, se la pagina lo porta. L'elenco dei coach no: le
   * date si chiedono al server quando la finestra si apre. */
  bookableDays?: BookableDay[];
  introAlreadyUsed: boolean;
  /** Account demo: prenotazione e sessione conoscitiva restano visibili ma
   * disabilitate, invece di far scoprire il blocco server-side al submit. */
  isDemo?: boolean;
  /** Piani che questo atleta può acquistare da questo coach (vuoto = nessuna offerta). */
  planOffers?: Array<{
    id: number;
    name: string;
    description: string | null;
    isRecommended: boolean;
    sessionsPerMonth: number;
    monthlyPriceCents: number;
  }>;
  /** Il prezzo di una seduta singola, già formattato; assente se il coach non la vende. */
  singleSessionPriceLabel?: string | null;
  /** Per quanti giorni vale la seduta singola (parametro di sistema). */
  singleSessionValidityDays?: number;
  /**
   * Presente se l'atleta ha già pagato (abbonamento o seduta acquistata): il
   * pulsante diventa «Prenota una seduta · N rimaste» e apre il modulo con le
   * date che il server accetterebbe.
   */
  bookingAccess?: {
    /** Assenti nell'elenco: si chiedono all'apertura, `hasDays` dice se ce ne sono. */
    days?: CardBookableDay[];
    hasDays?: boolean;
    notice: string | null;
    remaining: number | null;
    total: number | null;
  } | null;
  /** Email di chi guarda la card, per il pilota chiuso del prezzo
   * (`canSeeCoachPricing`) — vedi lib/core/flags.ts. */
  viewerEmail?: string | null;
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
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
              {coach.rating.count > 0 ? (
                <span className="flex items-center gap-1.5 text-sm text-gray-700">
                  <RatingStars value={coach.rating.average ?? 0} />
                  <span className="font-medium">{coach.rating.average}</span>
                  <span className="text-gray-400">({coach.rating.count})</span>
                </span>
              ) : (
                <span className="text-sm text-gray-400">Nuovo coach</span>
              )}
              {/* Prezzo qui, non più in basso a sinistra: è un criterio di
                  scelta che si confronta subito, non dopo statistiche e
                  bottoni. Blu come le medaglie sotto, non rosso — sulla
                  piattaforma il rosso segnala un problema, non un prezzo. */}
              {canSeeCoachPricing({ viewerEmail, coachSlug: coach.slug }) &&
                (primaryService?.durationMin != null && primaryService?.price != null ? (
                  <span className="text-base font-bold text-blue-700">
                    {formatPrice(primaryService.price, primaryService.currency)}
                    <span className="text-sm font-medium text-blue-400">
                      {' '}
                      / {primaryService.durationMin} min
                    </span>
                  </span>
                ) : (
                  coach.hourlyRate != null && (
                    <span className="text-base font-bold text-blue-700">
                      {formatPrice(coach.hourlyRate, coach.currency)}
                      <span className="text-sm font-medium text-blue-400"> / h</span>
                    </span>
                  )
                ))}
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
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-semibold text-green-600">
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
              fromColor="#3b82f6"
              toColor="#1d4ed8"
            />
            <StatCell
              icon={CalendarCheck}
              value={coach.completedSessions}
              label="Sessioni"
              fromColor="#22d3ee"
              toColor="#0e7490"
            />
            <StatCell
              icon={Clock}
              value={formatTotalHours(coach.totalMinutes)}
              label="Erogate"
              fromColor="#38bdf8"
              toColor="#0369a1"
            />
          </div>
        )}

        <div className="flex flex-col gap-2 border-t border-gray-100 pt-2.5 sm:flex-row sm:items-center sm:justify-end">
          {coach.yearsExperience != null && (
            <span className="inline-flex items-center gap-1.5 text-xs text-gray-500 sm:mr-auto">
              <Briefcase className="h-3.5 w-3.5 text-gray-400" />
              {coach.yearsExperience}{' '}
              {coach.yearsExperience === 1 ? 'anno' : 'anni'} di esperienza
            </span>
          )}
          {/* sm:mr-auto sopra, non justify-between sul contenitore: con
              yearsExperience assente (coach nuovo) justify-between con un
              solo figlio lo appoggia a sinistra invece che a destra — i
              bottoni devono restare a destra sempre, indipendentemente. */}
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <IntroSessionButton
              slug={coach.slug}
              coachName={name}
              coachFirstName={firstName}
              coachAvatarUrl={coach.avatarUrl}
              coachHeadline={coach.headline}
              loggedIn={loggedIn}
              isAthlete={isAthlete}
              bookableDays={bookableDays}
              alreadyUsed={introAlreadyUsed}
              isDemo={isDemo}
            />
            {isDemo ? (
              <span
                className="inline-flex cursor-not-allowed items-center gap-2 whitespace-nowrap rounded-full bg-gray-200 px-4 py-2 text-sm font-semibold text-gray-500"
                title={DEMO_READONLY_MESSAGE}
              >
                Prenota un incontro <ArrowRight className="h-4 w-4" />
              </span>
            ) : bookingAccess ? (
              <BookSessionDialog
                slug={coach.slug}
                coachName={name}
                coachFirstName={firstName}
                coachAvatarUrl={coach.avatarUrl}
                coachHeadline={coach.headline}
                services={(coach.services ?? []).map((service) => ({
                  id: service.id,
                  title: service.title,
                  durationMin: service.durationMin,
                }))}
                bookableDays={bookingAccess.days}
                hasDays={bookingAccess.hasDays}
                notice={bookingAccess.notice}
                remaining={bookingAccess.remaining}
                total={bookingAccess.total}
                singlePriceLabel={singleSessionPriceLabel ?? null}
              />
            ) : planOffers && planOffers.length > 0 ? (
              // Con dei piani acquistabili il pulsante della scheda è
              // «Abbonati», che apre i percorsi: «Prenota un incontro» porta
              // allo stesso indirizzo di un clic sulla scheda, quindi qui
              // sarebbe un doppione. Chi non ha piani lo ritrova com'era.
              <SubscribeDialog
                slug={coach.slug}
                coachFirstName={firstName}
                // Al browser arrivano solo i campi che la scelta mostra: il resto
                // della riga (identificativi, date) resta sul server.
                plans={planOffers.map((plan) => ({
                  id: plan.id,
                  name: plan.name,
                  description: plan.description,
                  isRecommended: plan.isRecommended,
                  sessionsPerMonth: plan.sessionsPerMonth,
                  monthlyPriceCents: plan.monthlyPriceCents,
                }))}
                single={
                  singleSessionPriceLabel
                    ? {
                        priceLabel: singleSessionPriceLabel,
                        validityDays:
                          singleSessionValidityDays ??
                          DEFAULT_SINGLE_SESSION_VALIDITY_DAYS,
                      }
                    : null
                }
              />
            ) : (
              <Link
                href={`/coaches/${coach.slug}`}
                className="inline-flex items-center gap-2 whitespace-nowrap rounded-full bg-green-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-700"
              >
                Prenota un incontro <ArrowRight className="h-4 w-4" />
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
