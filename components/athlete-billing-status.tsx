import { TriangleAlert } from 'lucide-react';
import {
  SessionStateBar,
  SessionStateLegend,
  type SessionSegment,
} from '@/components/session-states';
import {
  athleteBillingSignals,
  type CoachAthleteBilling,
} from '@/lib/core/billing/coach-athlete-status';
import { formatLongDateRome } from '@/lib/core/billing/subscription-status';
import { formatDate } from '@/lib/core/format';
import { cn } from '@/lib/utils';

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/**
 * Lo stato dell'abbonamento di un atleta nella lista del coach: il piano, la
 * barra delle sedute (fatte, pianificate, da pianificare, con gli stessi colori
 * dell'atleta), le sedute singole acquistate a parte e le segnalazioni che
 * chiedono attenzione. Non compare per chi non ha niente: la lista resta com'era.
 */
export function AthleteBillingStatus({
  billing,
  now,
}: {
  billing: CoachAthleteBilling;
  now: Date;
}) {
  const { plan, singles } = billing;
  const signals = athleteBillingSignals(billing, now);
  const usage = plan?.usage.known ? plan.usage : null;

  const segments: SessionSegment[] = usage
    ? [
        ...Array.from({ length: usage.done }, () => ({
          kind: 'done' as const,
          tooltip: 'Seduta fatta.',
        })),
        ...Array.from({ length: usage.booked }, () => ({
          kind: 'planned' as const,
          tooltip: 'Seduta pianificata: prenotata, non ancora svolta.',
        })),
        ...Array.from({ length: usage.remaining }, () => ({
          kind: 'toPlan' as const,
          tooltip: 'Seduta del piano ancora da pianificare.',
        })),
      ]
    : [];

  return (
    <div className="mt-2 flex flex-col gap-2 rounded-xl bg-gray-50 px-3 py-2.5">
      {plan && (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs text-gray-600">
            <span className="font-semibold text-gray-900">{plan.name}</span>
            {' · '}
            {plan.sessionsPerMonth}{' '}
            {plural(plan.sessionsPerMonth, 'seduta', 'sedute')} al mese
            {plan.periodEnd
              ? ` · ${plan.cancelAtPeriodEnd ? 'termina' : 'rinnovo'} il ${formatDate(plan.periodEnd)}`
              : ''}
          </p>
          {usage && segments.length > 0 && (
            <div className="grid items-center gap-x-4 gap-y-1.5 sm:grid-cols-[minmax(7rem,12rem)_1fr]">
              <SessionStateBar segments={segments} />
              <SessionStateLegend
                items={[
                  {
                    kind: 'done',
                    count: usage.done,
                    label: plural(usage.done, 'fatta', 'fatte'),
                    tooltip: 'Sedute del piano già svolte in questo periodo.',
                  },
                  {
                    kind: 'planned',
                    count: usage.booked,
                    label: plural(usage.booked, 'pianificata', 'pianificate'),
                    tooltip:
                      'Già prenotate (richieste o confermate), non ancora svolte.',
                  },
                  {
                    kind: 'toPlan',
                    count: usage.remaining,
                    label: 'da pianificare',
                    tooltip:
                      'Sedute del piano ancora da prenotare. Non si riportano al rinnovo.',
                  },
                ]}
              />
            </div>
          )}
        </div>
      )}

      {(singles.toPlan > 0 || singles.planned > 0) && (
        <p className="text-xs text-gray-600">
          <span className="font-semibold text-gray-900">
            Sessioni singole
          </span>
          {singles.planned > 0 &&
            ` · ${singles.planned} ${plural(singles.planned, 'pianificata', 'pianificate')}`}
          {singles.toPlan > 0 &&
            ` · ${singles.toPlan} da pianificare${
              singles.nextExpiry
                ? ` (scade il ${formatLongDateRome(singles.nextExpiry)})`
                : ''
            }`}
        </p>
      )}

      {signals.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {signals.map((signal) => (
            <li
              key={signal.code}
              title={signal.tooltip}
              className={cn(
                'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
                signal.tone === 'warn'
                  ? 'bg-amber-100 text-amber-900'
                  : 'bg-blue-50 text-blue-800'
              )}
            >
              {signal.tone === 'warn' && (
                <TriangleAlert className="h-3 w-3" aria-hidden />
              )}
              {signal.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
