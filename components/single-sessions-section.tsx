import Link from 'next/link';
import { CalendarCheck, CalendarClock, CalendarX2, Ticket } from 'lucide-react';
import { BuySessionButton } from '@/components/buy-session-button';
import { CoachAvatar } from '@/components/coach-visuals';
import { formatDateTime } from '@/lib/core/format';
import {
  formatEuroCents,
  formatLongDateRome,
  type AthleteSingleSession,
} from '@/lib/core/billing';
import { cn } from '@/lib/utils';

export type SingleSessionOffer = {
  coachUserId: number;
  coachName: string;
  coachSlug: string;
  priceLabel: string;
};

const STATE = {
  available: {
    label: 'Da pianificare',
    icon: Ticket,
    tone: 'bg-emerald-100 text-emerald-800',
  },
  planned: {
    label: 'Pianificata',
    icon: CalendarClock,
    tone: 'bg-blue-100 text-blue-800',
  },
  used: { label: 'Fatta', icon: CalendarCheck, tone: 'bg-gray-100 text-gray-700' },
  expired: { label: 'Scaduta', icon: CalendarX2, tone: 'bg-amber-100 text-amber-800' },
} as const;

/**
 * Le sedute acquistate a parte, separate dall'abbonamento: ognuna con il suo
 * stato (da pianificare e scadenza, pianificata e data, fatta, scaduta) e,
 * sotto, dove comprarne un'altra. Un abbonamento ha le sue sedute del mese
 * (scheda sopra); queste hanno una scadenza propria e non si rinnovano.
 */
export function SingleSessionsSection({
  sessions,
  offers,
}: {
  sessions: AthleteSingleSession[];
  offers: SingleSessionOffer[];
}) {
  if (sessions.length === 0 && offers.length === 0) return null;

  const open = sessions.filter((s) => s.state === 'available').length;

  return (
    <section aria-labelledby="sedute-singole" className="flex flex-col gap-3">
      <div>
        <h3 id="sedute-singole" className="text-lg font-semibold tracking-tight text-gray-900">
          Sessioni singole
        </h3>
        <p className="mt-0.5 max-w-3xl text-sm text-gray-600">
          Le sedute che hai acquistato a parte, senza rinnovo: valgono 60 giorni
          dal pagamento e si usano dopo quelle del piano.
          {open > 0 && (
            <>
              {' '}
              <span className="font-medium text-gray-900">
                Ne hai {open} da pianificare.
              </span>
            </>
          )}
        </p>
      </div>

      {sessions.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-gray-300 px-4 py-5 text-sm text-gray-600">
          Non hai ancora acquistato sessioni singole. Quando ne compri una, la
          trovi qui con la scadenza e la data in cui l&apos;hai pianificata.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-gray-100 overflow-hidden rounded-2xl border border-gray-200 bg-white">
          {sessions.map((session) => {
            const meta = STATE[session.state];
            const Icon = meta.icon;
            return (
              <li
                key={session.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3"
              >
                <CoachAvatar
                  name={session.coachName}
                  src={session.coachAvatarUrl}
                  className="size-10 shrink-0"
                />
                <div className="min-w-0 flex-1 basis-56">
                  <p className="truncate font-medium text-gray-900">
                    Seduta con {session.coachName}
                  </p>
                  <p className="text-sm text-gray-600">
                    {session.state === 'planned' && session.scheduledFor
                      ? `Pianificata ${formatDateTime(session.scheduledFor)}`
                      : session.state === 'used' && session.scheduledFor
                        ? `Fatta ${formatDateTime(session.scheduledFor)}`
                        : session.state === 'expired'
                          ? `Scaduta il ${formatLongDateRome(session.expiresAt)}`
                          : `Scade il ${formatLongDateRome(session.expiresAt)}`}
                    {' · '}
                    {formatEuroCents(session.priceCents)}
                    {session.kind === 'extra' ? ' · extra al piano' : ''}
                  </p>
                </div>
                <span
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold',
                    meta.tone
                  )}
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden />
                  {meta.label}
                </span>
                {session.state === 'available' && session.coachSlug && (
                  <Link
                    href={`/coaches/${session.coachSlug}`}
                    className="inline-flex h-9 items-center rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700"
                  >
                    Prenota
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {offers.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {offers.map((offer) => (
            <div key={offer.coachUserId} className="w-full sm:w-72">
              <BuySessionButton
                slug={offer.coachSlug}
                priceLabel={offer.priceLabel}
                label={`Acquista una sessione con ${offer.coachName.split(' ')[0]}`}
              />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
