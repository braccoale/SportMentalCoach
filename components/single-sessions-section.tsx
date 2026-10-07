import Link from 'next/link';
import { BuySessionButton } from '@/components/buy-session-button';
import { NewAppointmentButton } from '@/app/(dashboard)/dashboard/athlete/new-appointment-button';
import type { RelationshipCoach } from '@/lib/core/bookings';
import { CoachAvatar } from '@/components/coach-visuals';
import {
  SessionStateLegend,
  StateChip,
  type SessionKind,
} from '@/components/session-states';
import { formatDateTime } from '@/lib/core/format';
import {
  formatEuroCents,
  formatLongDateRome,
  formatValidityDays,
  type AthleteSingleSession,
} from '@/lib/core/billing';

export type SingleSessionOffer = {
  coachUserId: number;
  coachName: string;
  coachSlug: string;
  priceLabel: string;
};

const KIND_OF_STATE: Record<AthleteSingleSession['state'], SessionKind> = {
  available: 'toPlan',
  planned: 'planned',
  used: 'done',
  expired: 'expired',
};

/**
 * Le sedute acquistate a parte, separate dall'abbonamento: ognuna con il suo
 * stato (da pianificare e scadenza, pianificata e data, fatta, scaduta), un
 * riepilogo con i numeri e, sotto, dove comprarne un'altra. Un abbonamento ha
 * le sue sedute del mese (scheda sopra); queste hanno una scadenza propria,
 * decisa dalla piattaforma, e non si rinnovano.
 */
export function SingleSessionsSection({
  sessions,
  offers,
  validityDays,
  coachesBySlug,
}: {
  sessions: AthleteSingleSession[];
  offers: SingleSessionOffer[];
  validityDays: number;
  /** I coach con cui l'atleta può prenotare, per aprire la finestra di prenotazione già sul coach giusto. */
  coachesBySlug: Record<string, RelationshipCoach>;
}) {
  if (sessions.length === 0 && offers.length === 0) return null;

  const count = (state: AthleteSingleSession['state']) =>
    sessions.filter((s) => s.state === state).length;
  const toPlan = count('available');
  const planned = count('planned');
  const used = count('used');
  const expired = count('expired');

  return (
    <section aria-labelledby="sedute-singole" className="flex flex-col gap-3">
      <div>
        <h3 id="sedute-singole" className="text-lg font-semibold tracking-tight text-gray-900">
          Sessioni singole
        </h3>
        <p className="mt-0.5 max-w-3xl text-sm text-gray-600">
          Le sedute acquistate a parte, senza rinnovo: valgono{' '}
          {formatValidityDays(validityDays)} dal pagamento.
        </p>
      </div>

      {sessions.length > 0 && (
        <SessionStateLegend
          items={[
            {
              kind: 'planned',
              count: planned,
              label: planned === 1 ? 'pianificata' : 'pianificate',
              tooltip:
                'Già prenotate (richieste o confermate), non ancora svolte. Se ne annulli una, torna da pianificare finché non scade.',
            },
            {
              kind: 'toPlan',
              count: toPlan,
              label: 'da pianificare',
              tooltip: `Pagate e ancora da prenotare. Si possono usare fino alla scadenza indicata, ${formatValidityDays(validityDays)} dopo il pagamento.`,
            },
            {
              kind: 'done',
              count: used,
              label: used === 1 ? 'fatta' : 'fatte',
              tooltip: 'Sedute già svolte.',
            },
            ...(expired > 0
              ? [
                  {
                    kind: 'expired' as const,
                    count: expired,
                    label: expired === 1 ? 'scaduta' : 'scadute',
                    tooltip:
                      'Non sono state usate entro la scadenza e non si possono più prenotare.',
                  },
                ]
              : []),
          ]}
        />
      )}

      {sessions.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-gray-300 px-4 py-5 text-sm text-gray-600">
          Non hai ancora acquistato sessioni singole. Quando ne compri una, la
          trovi qui con la scadenza e la data in cui l&apos;hai pianificata.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-gray-100 overflow-hidden rounded-2xl border border-gray-200 bg-white">
          {sessions.map((session) => {
            const when = session.scheduledFor
              ? formatDateTime(session.scheduledFor)
              : null;
            const expiry = formatLongDateRome(session.expiresAt);
            const detail =
              session.state === 'planned' && when
                ? `Pianificata ${when}`
                : session.state === 'used' && when
                  ? `Fatta ${when}`
                  : session.state === 'expired'
                    ? `Scaduta il ${expiry}`
                    : `Da pianificare · scade il ${expiry}`;
            const tooltip =
              session.state === 'planned'
                ? `Hai fissato questa seduta${when ? ` per ${when}` : ''}. Se la annulli torna da pianificare, finché non scade (${expiry}).`
                : session.state === 'used'
                  ? `Seduta svolta${when ? ` ${when}` : ''}.`
                  : session.state === 'expired'
                    ? `Non è stata usata entro la scadenza (${expiry}).`
                    : `Pagata e ancora da prenotare: puoi usarla fino al ${expiry}.`;
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
                    {detail}
                    {' · '}
                    {formatEuroCents(session.priceCents)}
                    {session.kind === 'extra' ? ' · extra al piano' : ''}
                    {' · '}
                    <a
                      href={`/api/payments/receipt?tipo=seduta&id=${session.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline underline-offset-2 hover:text-gray-900"
                    >
                      Ricevuta
                    </a>
                  </p>
                </div>
                <StateChip
                  kind={KIND_OF_STATE[session.state]}
                  label={
                    session.state === 'available'
                      ? 'Da pianificare'
                      : session.state === 'planned'
                        ? 'Pianificata'
                        : session.state === 'used'
                          ? 'Fatta'
                          : 'Scaduta'
                  }
                  tooltip={tooltip}
                />
                {session.state === 'available' &&
                  session.coachSlug &&
                  (coachesBySlug[session.coachSlug] ? (
                    // La finestra di prenotazione si apre qui, sul coach giusto.
                    <NewAppointmentButton
                      coaches={[coachesBySlug[session.coachSlug]]}
                      label="Prenota"
                      compact
                    />
                  ) : (
                    <Link
                      href={`/coaches/${session.coachSlug}`}
                      className="inline-flex h-9 items-center rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700"
                    >
                      Prenota
                    </Link>
                  ))}
              </li>
            );
          })}
        </ul>
      )}

      {offers.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {offers.map((offer) => (
            <div key={offer.coachUserId} className="w-full sm:w-64">
              {offers.length > 1 && (
                <p className="mb-1 truncate text-xs text-gray-500">
                  con {offer.coachName}
                </p>
              )}
              <BuySessionButton
                slug={offer.coachSlug}
                priceLabel={offer.priceLabel}
                label="Aggiungi una sessione"
                showPrice={false}
              />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
