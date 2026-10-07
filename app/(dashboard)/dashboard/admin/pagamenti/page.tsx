import { requireRole } from '@/lib/core/auth';
import { getAdminPaymentsOverview } from '@/lib/core/admin/payments-overview';
import {
  creditKindLabel,
  creditStatusLabel,
  creditStatusTone,
  isStaleIncomplete,
  subscriptionStatusLabel,
  subscriptionStatusTone,
  type Tone,
} from '@/lib/core/admin/payments-labels';
import { formatEuroCents } from '@/lib/core/billing/session-plan';
import { formatDateTime } from '@/lib/core/format';
import {
  EmptyBlock,
  ErrorBlock,
  SectionHeader,
} from '@/components/admin/control-room';

export const dynamic = 'force-dynamic';

const TONE: Record<Tone, string> = {
  ok: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  warn: 'bg-amber-50 text-amber-800 ring-amber-200',
  bad: 'bg-red-50 text-red-700 ring-red-200',
  neutral: 'bg-gray-100 text-gray-600 ring-gray-200',
};

function Pill({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${TONE[tone]}`}
    >
      {children}
    </span>
  );
}

function date(d: Date | null): string {
  return d ? formatDateTime(d) : '—';
}

/**
 * Pagamenti: la vista per il supporto. Abbonamenti, sedute acquistate e la
 * salute del canale con Stripe, in una pagina sola.
 *
 * Risponde a tre domande, in quest'ordine: «il canale con Stripe funziona?»
 * (eventi falliti, ultimo evento), «c'è qualcuno da chiamare?» (pagamenti in
 * ritardo) e «che cos'è successo a quell'atleta?» (le righe). Solo lettura: i
 * rimborsi e le correzioni si fanno dalla dashboard Stripe del coach, e questa
 * pagina non deve poter muovere denaro.
 */
export default async function AdminPaymentsPage() {
  await requireRole('admin');

  let data;
  try {
    data = await getAdminPaymentsOverview();
  } catch (error) {
    console.error('[admin] pagamenti non leggibili', error);
    return (
      <section className="p-4 lg:p-0">
        <SectionHeader title="Pagamenti" />
        <div className="mt-5">
          <ErrorBlock
            title="I pagamenti non sono leggibili"
            detail="La lettura dal database non è riuscita. Riprova fra poco."
            retryHref="/dashboard/admin/pagamenti"
          />
        </div>
      </section>
    );
  }

  const now = new Date();

  return (
    <section className="flex flex-col gap-8 p-4 lg:p-0">
      <SectionHeader
        title="Pagamenti"
        subtitle="Abbonamenti e sedute acquistate, e lo stato del collegamento con Stripe. Solo lettura: rimborsi e correzioni si fanno dalla dashboard Stripe del coach."
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Summary
          label="Eventi Stripe falliti"
          value={String(data.failedEventCount)}
          tone={data.failedEventCount > 0 ? 'bad' : 'ok'}
          hint="Negli ultimi 30 giorni. Stripe li ripete da solo; se restano, qualcosa non torna."
        />
        <Summary
          label="Pagamenti in ritardo"
          value={String(data.pastDueCount)}
          tone={data.pastDueCount > 0 ? 'bad' : 'ok'}
          hint="Abbonamenti il cui ultimo rinnovo non è stato incassato."
        />
        <Summary
          label="Ultimo evento ricevuto"
          value={data.lastEventAt ? formatDateTime(data.lastEventAt) : 'Nessuno'}
          tone="neutral"
          hint="Se è molto vecchio e c'è attività, il webhook potrebbe non arrivare."
        />
      </div>

      {data.failedEvents.length > 0 ? (
        <div>
          <h3 className="text-sm font-semibold text-gray-900">
            Eventi Stripe non elaborati
          </h3>
          <div className="mt-2 overflow-hidden rounded-2xl border border-red-200 bg-white">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="bg-red-50 text-xs uppercase tracking-wide text-red-700">
                  <tr>
                    <th scope="col" className="px-4 py-3">Ricevuto</th>
                    <th scope="col" className="px-4 py-3">Evento</th>
                    <th scope="col" className="px-4 py-3">Codice</th>
                    <th scope="col" className="px-4 py-3">Tentativi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.failedEvents.map((e) => (
                    <tr key={e.id}>
                      <td className="whitespace-nowrap px-4 py-3 text-gray-700">
                        {formatDateTime(e.receivedAt)}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-700">
                        {e.eventType}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-700">
                        {e.lastErrorCode ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-700">{e.attempts}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}

      <div>
        <h3 className="text-sm font-semibold text-gray-900">Abbonamenti</h3>
        <div className="mt-2">
          {data.subscriptions.length === 0 ? (
            <EmptyBlock
              title="Nessun abbonamento"
              detail="Quando un atleta ne attiva uno lo trovi qui, con lo stato e il prossimo rinnovo."
            />
          ) : (
            <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[860px] text-left text-sm">
                  <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                    <tr>
                      <th scope="col" className="px-4 py-3">Atleta</th>
                      <th scope="col" className="px-4 py-3">Coach</th>
                      <th scope="col" className="px-4 py-3">Piano</th>
                      <th scope="col" className="px-4 py-3">Stato</th>
                      <th scope="col" className="px-4 py-3">Sottoscritto</th>
                      <th scope="col" className="px-4 py-3">Fine periodo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.subscriptions.map((s) => (
                      <tr key={s.id} className="align-top">
                        <td className="px-4 py-3 font-medium text-gray-900">
                          {s.athleteName}
                        </td>
                        <td className="px-4 py-3 text-gray-700">{s.coachName}</td>
                        <td className="px-4 py-3 text-gray-700">
                          {s.planName}
                          <span className="block text-xs text-gray-500">
                            {formatEuroCents(s.monthlyPriceCents)} / mese
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <Pill
                            tone={subscriptionStatusTone(s.status, s.cancelAtPeriodEnd)}
                          >
                            {subscriptionStatusLabel(s.status, s.cancelAtPeriodEnd)}
                          </Pill>
                          {isStaleIncomplete(s.status, s.updatedAt, now) ? (
                            <span className="mt-1 block text-[11px] text-amber-700">
                              Checkout mai concluso: pagamento non arrivato?
                            </span>
                          ) : null}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-gray-700">
                          {date(s.subscribedAt)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-gray-700">
                          {date(s.currentPeriodEnd)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-gray-900">Sedute acquistate</h3>
        <div className="mt-2">
          {data.credits.length === 0 ? (
            <EmptyBlock
              title="Nessuna seduta acquistata"
              detail="Le sedute singole e quelle extra comprate dagli atleti compaiono qui, con la scadenza e la prenotazione collegata."
            />
          ) : (
            <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[860px] text-left text-sm">
                  <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                    <tr>
                      <th scope="col" className="px-4 py-3">Atleta</th>
                      <th scope="col" className="px-4 py-3">Coach</th>
                      <th scope="col" className="px-4 py-3">Tipo</th>
                      <th scope="col" className="px-4 py-3">Importo</th>
                      <th scope="col" className="px-4 py-3">Stato</th>
                      <th scope="col" className="px-4 py-3">Pagata il</th>
                      <th scope="col" className="px-4 py-3">Scade</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.credits.map((k) => (
                      <tr key={k.id} className="align-top">
                        <td className="px-4 py-3 font-medium text-gray-900">
                          {k.athleteName}
                        </td>
                        <td className="px-4 py-3 text-gray-700">{k.coachName}</td>
                        <td className="px-4 py-3 text-gray-700">
                          {creditKindLabel(k.kind)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-gray-700">
                          {formatEuroCents(k.priceCents)}
                        </td>
                        <td className="px-4 py-3">
                          <Pill tone={creditStatusTone(k.status)}>
                            {creditStatusLabel(k.status, k.bookingId)}
                          </Pill>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-gray-700">
                          {date(k.grantedAt)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-gray-700">
                          {date(k.expiresAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function Summary({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: string;
  tone: Tone;
  hint: string;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
        {label}
      </p>
      <p className="mt-2">
        <Pill tone={tone}>{value}</Pill>
      </p>
      <p className="mt-2 text-xs leading-snug text-gray-500">{hint}</p>
    </div>
  );
}
