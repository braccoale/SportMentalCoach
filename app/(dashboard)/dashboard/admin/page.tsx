import { Suspense } from 'react';
import Link from 'next/link';
import { RefreshCw } from 'lucide-react';
import { requireRole } from '@/lib/core/auth';
import {
  adminPeriodRange,
  resolveAdminPeriod,
  type AdminPeriod,
} from '@/lib/core/admin/period';
import { getAdminOverview } from '@/lib/core/admin/overview';
import { formatEur } from '@/lib/core/admin/ai-cost';
import { formatDateTime } from '@/lib/core/format';
import {
  AttentionPanel,
  EmptyBlock,
  ErrorBlock,
  KpiCard,
  KpiSkeleton,
  PeriodSelector,
  PipelineFunnel,
  SectionHeader,
  ServiceHealthPanel,
} from '@/components/admin/control-room';
import {
  OutcomeDistributionChart,
  SessionsTrendChart,
} from '@/components/admin/overview-charts';

export const dynamic = 'force-dynamic';

/**
 * La Control Room: la pagina che risponde a «sta funzionando, e cosa devo
 * fare adesso».
 *
 * L'ordine dei blocchi è la risposta, e non è negoziabile: prima **cosa
 * richiede un intervento**, poi **se i servizi stanno reggendo**, poi i
 * numeri, e solo alla fine i due grafici. Il cruscotto precedente cominciava
 * dai numeri, ed è per questo che il 16 agosto era tutto verde mentre un'ora
 * di seduta era già persa: i numeri c'erano tutti, e nessuno diceva che
 * c'era un problema.
 *
 * Il periodo è un collegamento, non uno stato del browser: si incolla in
 * chat e chi lo apre vede la stessa cosa.
 */
export default async function AdminControlRoomPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string }>;
}) {
  await requireRole('admin');
  const { periodo } = await searchParams;
  const period = adminPeriodRange(resolveAdminPeriod(periodo));

  return (
    <section className="p-4 lg:p-0">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-gray-950">
            Admin Control Room
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-gray-600">
            Che cosa richiede un intervento, come stanno i servizi, e come è
            andato il periodo. Nessun contenuto di seduta compare in questa
            console: identificativi, stati e conteggi.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PeriodSelector current={period.key} basePath="/dashboard/admin" />
          <Link
            href={`/dashboard/admin?periodo=${period.key}&t=${Date.now()}`}
            prefetch={false}
            className="inline-flex h-9 items-center gap-2 rounded-full border border-gray-300 bg-white px-3.5 text-sm font-semibold text-gray-800 hover:bg-gray-50"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Aggiorna
          </Link>
        </div>
      </header>

      <Suspense fallback={<OverviewSkeleton />}>
        <OverviewBody period={period} />
      </Suspense>
    </section>
  );
}

async function OverviewBody({ period }: { period: AdminPeriod }) {
  let overview;
  try {
    overview = await getAdminOverview(period);
  } catch (error) {
    // Il messaggio vero resta nei log del server: al browser va un errore che
    // non racconta la forma del database a chi non deve conoscerla.
    console.error('[admin] panoramica non caricata', error);
    return (
      <div className="mt-6">
        <ErrorBlock
          title="La panoramica non si è caricata"
          detail="Una delle letture aggregate non ha risposto. Il dettaglio è nei log del server; le altre aree dell’amministrazione restano raggiungibili."
          retryHref={`/dashboard/admin?periodo=${period.key}`}
        />
      </div>
    );
  }

  return (
    <>
      <p className="mt-3 text-xs text-gray-500">
        Ultimo aggiornamento: {formatDateTime(overview.generatedAt)} · periodo{' '}
        {period.label.toLowerCase()} ({formatDateTime(period.from)} →{' '}
        {formatDateTime(period.to)})
      </p>

      <div className="mt-6">
        <SectionHeader
          title="Richiede attenzione"
          subtitle="Solo cose su cui si può agire. Una voce a zero non compare."
        />
        <div className="mt-3">
          <AttentionPanel items={overview.attention} />
        </div>
      </div>

      <div className="mt-8">
        <SectionHeader
          title="Salute della piattaforma"
          subtitle="«Operativo» richiede osservazioni nel periodo. Senza, la voce dice «Non monitorato» — che è la verità, non un guasto."
        />
        <div className="mt-3">
          <ServiceHealthPanel services={overview.services} />
        </div>
      </div>

      <div className="mt-8">
        <SectionHeader
          title="Numeri"
          subtitle="Ogni riquadro dichiara che cosa conta e su quale finestra. Cliccalo per aprire l’elenco corrispondente."
        />
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {overview.kpis.map((kpi) => (
            <KpiCard key={kpi.key} kpi={kpi} />
          ))}
        </div>
      </div>

      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-gray-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-gray-900">
            Andamento delle sedute
          </h3>
          <p className="mt-0.5 text-xs text-gray-500">
            Completate e annullate per giorno, ora di Roma.
          </p>
          <div className="mt-3">
            {overview.sessionsByDay.length === 0 ? (
              <EmptyBlock
                title="Nessuna seduta nel periodo"
                detail="Il grafico compare quando c’è almeno un giorno con attività."
              />
            ) : (
              <SessionsTrendChart data={overview.sessionsByDay} />
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-gray-900">
            Esiti della pipeline AI
          </h3>
          <p className="mt-0.5 text-xs text-gray-500">
            Come sono finite le sedute con Appunti AI aperte nel periodo.
          </p>
          <div className="mt-3">
            {overview.outcomes.length === 0 ? (
              <EmptyBlock
                title="Nessuna seduta con Appunti AI"
                detail="Non è un errore: nel periodo scelto la funzione non è stata avviata."
              />
            ) : (
              <OutcomeDistributionChart data={overview.outcomes} />
            )}
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-gray-200 bg-white p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">
                Imbuto della pipeline AI
              </h3>
              <p className="mt-0.5 text-xs text-gray-500">
                Dove le sedute si perdono fra la registrazione e il riepilogo.
              </p>
            </div>
            <Link
              href="/dashboard/admin/ai"
              className="shrink-0 text-xs font-semibold text-red-600 hover:text-red-700"
            >
              Apri la console →
            </Link>
          </div>
          <div className="mt-3">
            <PipelineFunnel steps={overview.funnel} />
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-gray-900">
            Attività dei coach
          </h3>
          <p className="mt-0.5 text-xs text-gray-500">
            Sedute confermate o concluse nel periodo. Non è una classifica: è
            un elenco per capire chi sta usando il prodotto.
          </p>
          <div className="mt-3">
            {overview.coachActivity.length === 0 ? (
              <EmptyBlock
                title="Nessuna attività nel periodo"
                detail="Nessun coach ha sedute confermate o concluse in questa finestra."
              />
            ) : (
              <ul className="flex flex-col gap-2">
                {overview.coachActivity.map((coach) => (
                  <li
                    key={coach.providerId}
                    className="flex items-center justify-between gap-3 text-sm"
                  >
                    <Link
                      href={`/dashboard/admin/coach#coach-${coach.providerId}`}
                      className="min-w-0 truncate text-gray-800 hover:text-red-600"
                    >
                      {coach.coachName}
                    </Link>
                    <span className="shrink-0 tabular-nums font-semibold text-gray-950">
                      {coach.sessions}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="mt-4 border-t border-gray-100 pt-3">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Spesa AI stimata
            </h4>
            {overview.costConfigured ? (
              <p className="mt-1 text-sm text-gray-800">
                {formatEur(overview.cost.totalEur)} nel periodo
                {overview.cost.perSessionEur !== null
                  ? ` · ${formatEur(overview.cost.perSessionEur)} per seduta`
                  : ''}
                .{' '}
                <span className="text-gray-500">
                  È una stima costruita sulle tariffe configurate, non una
                  fattura.
                </span>
              </p>
            ) : (
              <p className="mt-1 text-sm text-gray-500">
                Non configurata. Il consumo fatturabile non è registrato da
                nessuna parte in questo prodotto: senza tariffe dichiarate in
                <code className="mx-1 rounded bg-gray-100 px-1 py-0.5 text-[11px]">
                  AI_NOTES_COST_*
                </code>
                un costo sarebbe inventato, e qui non se ne inventano.
              </p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function OverviewSkeleton() {
  return (
    <div className="mt-6">
      <div className="h-20 animate-pulse rounded-2xl border border-gray-200 bg-white" />
      <div className="mt-8 h-64 animate-pulse rounded-2xl border border-gray-200 bg-white" />
      <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 10 }).map((_, index) => (
          <KpiSkeleton key={index} />
        ))}
      </div>
    </div>
  );
}
