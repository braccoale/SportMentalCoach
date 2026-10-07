'use client';

import { ArrowRight } from 'lucide-react';
import { SessionBookingForm } from '@/components/session-booking-form';
import { BuySessionButton } from '@/components/buy-session-button';
import { LazyBookingCalendar } from '@/components/lazy-booking-calendar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import type { BookableDay } from '@/lib/core/availability';

/**
 * «Prenota una seduta · 2 rimaste»: per l'atleta che ha già pagato (un
 * abbonamento o una seduta acquistata). Apre il modulo di prenotazione in una
 * finestra, senza passare dal profilo. Le date sono già quelle che il server
 * accetterebbe (`applyBookingCredits`): qui non si decide niente.
 *
 * Se le sedute sono finite e il coach vende una seduta singola, la finestra la
 * offre invece di un calendario vuoto che direbbe «il coach non è libero».
 */
export function BookSessionDialog({
  slug,
  coachName,
  coachFirstName,
  coachAvatarUrl,
  coachHeadline,
  services,
  bookableDays,
  hasDays,
  notice,
  remaining,
  total,
  singlePriceLabel,
}: {
  slug: string;
  coachName: string;
  coachFirstName: string;
  coachAvatarUrl: string | null;
  coachHeadline: string | null;
  services: { id: number; title: string | null; durationMin: number | null }[];
  /**
   * Le date, se la pagina le ha già. Se mancano (l'elenco dei coach non le
   * porta, pesano) si chiedono al server quando la finestra si apre, e
   * `hasDays` dice se ce ne sono per decidere cosa mostrare.
   */
  bookableDays?: BookableDay[];
  /** Ci sono date prenotabili? Serve quando `bookableDays` non c'è. */
  hasDays?: boolean;
  /** Perché le date sono poche o nessuna, già scritto dal server. */
  notice: string | null;
  /** Sedute ancora disponibili adesso (piano + extra); `null` se non si sa. */
  remaining: number | null;
  /** Sedute del piano + extra, per il confronto «N su M». */
  total: number | null;
  singlePriceLabel: string | null;
}) {
  const label =
    remaining === null
      ? 'Prenota una seduta'
      : `Prenota una seduta · ${remaining} ${remaining === 1 ? 'rimasta' : 'rimaste'}`;
  const form = (days: BookableDay[]) => (
    <SessionBookingForm
      slug={slug}
      coachName={coachName}
      coachFirstName={coachFirstName}
      coachAvatarUrl={coachAvatarUrl}
      coachHeadline={coachHeadline}
      services={services}
      bookableDays={days}
      remaining={remaining}
      total={total}
    />
  );
  const noDays = bookableDays ? bookableDays.length === 0 : hasDays === false;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-2 whitespace-nowrap rounded-full bg-green-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-700"
        >
          {label} <ArrowRight className="h-4 w-4" aria-hidden />
        </button>
      </DialogTrigger>
      <DialogContent className="max-h-[92dvh] max-w-4xl overflow-y-auto rounded-3xl p-6 sm:p-8">
        <DialogTitle className="pr-8 text-xl sm:text-3xl">
          Prenota una seduta con {coachFirstName}
        </DialogTitle>
        <DialogDescription>
          {remaining === null
            ? 'Scegli il giorno e l’ora che preferisci.'
            : remaining === 0
              ? 'Hai finito le sedute di questo periodo.'
              : `Ti ${remaining === 1 ? 'resta' : 'restano'} ${remaining} ${remaining === 1 ? 'seduta' : 'sedute'}. Scegli il giorno e l’ora che preferisci.`}
        </DialogDescription>

        {notice && (
          <p
            role="status"
            className="mt-4 rounded-md bg-blue-50 px-3 py-2 text-sm text-gray-700"
          >
            {notice}
          </p>
        )}

        {!noDays && (
          <div className="mt-4">
            {bookableDays ? (
              form(bookableDays)
            ) : (
              <LazyBookingCalendar slug={slug} kind="book">
                {({ days }) => form(days)}
              </LazyBookingCalendar>
            )}
          </div>
        )}

        {singlePriceLabel && (remaining === 0 || noDays) && (
          <div className="mt-4">
            <BuySessionButton slug={slug} priceLabel={singlePriceLabel} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
