import { AthleteBillingStatus } from '@/components/athlete-billing-status';
import { StateChip, type SessionKind } from '@/components/session-states';
import {
  formatEuroCents,
  formatLongDateRome,
  type CoachAthleteBillingDetail,
} from '@/lib/core/billing';
import { formatDateTime } from '@/lib/core/format';

const KIND: Record<
  CoachAthleteBillingDetail['singles'][number]['state'],
  { kind: SessionKind; label: string }
> = {
  available: { kind: 'toPlan', label: 'Da pianificare' },
  planned: { kind: 'planned', label: 'Pianificata' },
  used: { kind: 'done', label: 'Fatta' },
  expired: { kind: 'expired', label: 'Scaduta' },
};

/**
 * «Abbonamento e sedute» nella scheda di un atleta del coach: lo stesso stato
 * della lista (piano, barra, segnalazioni) più da quando è abbonato e lo storico
 * delle sedute acquistate a parte. Non compare per chi non ha niente.
 */
export function AthleteSubscriptionPanel({
  detail,
  now,
}: {
  detail: CoachAthleteBillingDetail;
  now: Date;
}) {
  if (!detail.billing && detail.singles.length === 0) return null;

  return (
    <div className="mt-4 rounded-2xl border border-gray-200/70 bg-white p-4">
      <h2 className="text-sm font-bold text-gray-900">Abbonamento e sedute</h2>
      {detail.subscription && (
        <p className="mt-1 text-sm text-gray-500">
          {detail.subscription.planName} ·{' '}
          {formatEuroCents(detail.subscription.monthlyPriceCents)} al mese
          {detail.subscription.subscribedAt
            ? ` · abbonato dal ${formatLongDateRome(detail.subscription.subscribedAt)}`
            : ''}
        </p>
      )}

      {detail.billing && <AthleteBillingStatus billing={detail.billing} now={now} />}

      {detail.singles.length > 0 && (
        <div className="mt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Sessioni singole acquistate
          </h3>
          <ul className="mt-2 flex flex-col divide-y divide-gray-100 rounded-xl border border-gray-100">
            {detail.singles.map((single) => {
              const meta = KIND[single.state];
              const when = single.scheduledFor
                ? formatDateTime(single.scheduledFor)
                : null;
              return (
                <li
                  key={single.id}
                  className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-3 py-2 text-sm"
                >
                  <span className="text-gray-700">
                    Acquistata il {formatLongDateRome(single.grantedAt)} ·{' '}
                    {formatEuroCents(single.priceCents)}
                    {single.kind === 'extra' ? ' · extra al piano' : ''}
                    <span className="block text-xs text-gray-500">
                      {single.state === 'planned' && when
                        ? `Pianificata ${when}`
                        : single.state === 'used' && when
                          ? `Fatta ${when}`
                          : single.state === 'expired'
                            ? `Scaduta il ${formatLongDateRome(single.expiresAt)}`
                            : `Da pianificare · scade il ${formatLongDateRome(single.expiresAt)}`}
                    </span>
                  </span>
                  <StateChip
                    kind={meta.kind}
                    label={meta.label}
                    tooltip={
                      single.state === 'available'
                        ? 'Pagata e ancora da prenotare: l’atleta può usarla fino alla scadenza.'
                        : single.state === 'planned'
                          ? 'L’atleta ha già fissato questa seduta.'
                          : single.state === 'used'
                            ? 'Seduta svolta.'
                            : 'Non è stata usata entro la scadenza.'
                    }
                  />
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
