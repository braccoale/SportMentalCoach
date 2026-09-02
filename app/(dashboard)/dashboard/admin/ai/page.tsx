import { Suspense } from 'react';
import Link from 'next/link';
import { RefreshCw, Settings2 } from 'lucide-react';
import { requireRole } from '@/lib/core/auth';
import {
  adminPeriodRange,
  resolveAdminPeriod,
  type AdminPeriod,
} from '@/lib/core/admin/period';
import {
  getAiConsoleCoaches,
  getAiConsoleErrorCodes,
  getAiConsoleKpis,
  getAiConsolePage,
} from '@/lib/core/admin/ai-console';
import {
  parseAiConsoleFilters,
  type AiConsoleFilters,
} from '@/lib/core/admin/ai-console-policy';
import { formatEur } from '@/lib/core/admin/ai-cost';
import {
  ErrorBlock,
  PeriodSelector,
  SectionHeader,
} from '@/components/admin/control-room';
import {
  AiConsoleFiltersForm,
  AiConsoleTable,
} from '@/components/admin/ai-console-table';

export const dynamic = 'force-dynamic';

/**
 * AI e trascrizioni: la console della pipeline.
 *
 * È la sezione per cui questa Control Room esiste. La pipeline è una catena
 * lunga — consenso, registrazione, egress, coda, trascrizione, riepilogo — i
 * cui guasti sono silenziosi: nessun errore, nessun allarme, solo un coach
 * che apre una seduta e non trova niente. Fino a oggi l'unico modo di seguirla
 * era interrogare quattro tabelle a mano.
 *
 * **Cosa non si vede da qui, per progetto:** trascrizioni, riepiloghi, note
 * del coach, audio. Questa console segue la meccanica, non le persone.
 */
export default async function AiConsolePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireRole('admin');
  const params = await searchParams;
  const period = adminPeriodRange(resolveAdminPeriod(params.periodo));
  const filters = parseAiConsoleFilters(params);

  return (
    <section className="p-4 lg:p-0">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-gray-950">
            AI e trascrizioni
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-gray-600">
            Ogni seduta con Appunti AI, la fase in cui si trova e perché si è
            fermata. Solo dati tecnici: nessuna trascrizione, nessun riepilogo,
            nessun nome di atleta compare in questa pagina.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PeriodSelector current={period.key} basePath="/dashboard/admin/ai" />
          <Link
            href={`/dashboard/admin/ai?periodo=${period.key}&t=${Date.now()}`}
            prefetch={false}
            className="inline-flex h-9 items-center gap-2 rounded-full border border-gray-300 bg-white px-3.5 text-sm font-semibold text-gray-800 hover:bg-gray-50"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Aggiorna
          </Link>
          <Link
            href="/dashboard/admin/ai-notes"
            className="inline-flex h-9 items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-3.5 text-sm font-semibold text-violet-700 hover:bg-violet-100"
          >
            <Settings2 className="h-4 w-4" aria-hidden="true" />
            Configurazione e worker
          </Link>
        </div>
      </header>

      <Suspense fallback={<ConsoleSkeleton />}>
        <ConsoleBody period={period} filters={filters} />
      </Suspense>
    </section>
  );
}

async function ConsoleBody({
  period,
  filters,
}: {
  period: AdminPeriod;
  filters: AiConsoleFilters;
}) {
  let kpis;
  let page;
  let coaches;
  let errorCodes;

  try {
    [kpis, page, coaches, errorCodes] = await Promise.all([
      getAiConsoleKpis(period),
      getAiConsolePage(filters, period),
      getAiConsoleCoaches(period),
      getAiConsoleErrorCodes(period),
    ]);
  } catch (error) {
    console.error('[admin] console AI non caricata', error);
    return (
      <div className="mt-6">
        <ErrorBlock
          title="La console non si è caricata"
          detail="Una delle letture non ha risposto. Il dettaglio è nei log del server."
          retryHref={`/dashboard/admin/ai?periodo=${period.key}`}
        />
      </div>
    );
  }

  return (
    <>
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Kpi
          label="Minuti audio"
          value={String(kpis.audioMinutes)}
          note="Archiviati nel periodo, dai secondi delle registrazioni riuscite."
        />
        <Kpi
          label="Sedute concluse"
          value={String(kpis.transcriptionsCompleted)}
          note="Arrivate almeno in revisione dal coach."
        />
        <Kpi
          label="Trascrizioni fallite"
          value={String(kpis.transcriptionsFailed)}
          note="Stato terminale: il materiale audio mancava o era inutilizzabile."
          tone={kpis.transcriptionsFailed > 0 ? 'critico' : 'neutro'}
        />
        <Kpi
          label="Riepiloghi generati"
          value={String(kpis.reportsGenerated)}
          note="Report arrivati in revisione o oltre, nel periodo."
        />
        <Kpi
          label="Riepiloghi falliti"
          value={String(kpis.reportsFailed)}
          note="Recuperabili: la trascrizione di solito è ancora in tabella."
          tone={kpis.reportsFailed > 0 ? 'attenzione' : 'neutro'}
        />
        <Kpi
          label="Job in coda"
          value={String(kpis.jobsQueued)}
          note="Adesso, non nel periodo: la coda è uno stato istantaneo."
        />
        <Kpi
          label="Job in corso"
          value={String(kpis.jobsRunning)}
          note="Adesso. Presi in carico o consegnati al fornitore."
        />
        <Kpi
          label="Job fermi"
          value={String(kpis.jobsStuck)}
          note="Pronti, mai tentati, in attesa da oltre la soglia: la firma di un worker che non gira."
          tone={kpis.jobsStuck > 0 ? 'critico' : 'neutro'}
        />
        <Kpi
          label="Elaborazione mediana"
          value={
            kpis.medianProcessingSeconds === null
              ? 'n.d.'
              : `${Math.round(kpis.medianProcessingSeconds / 60)}′`
          }
          note={
            kpis.medianProcessingSeconds === null
              ? 'Nessuna seduta conclusa nel periodo: senza campioni non si calcola una mediana.'
              : 'Mediana e non media: una seduta rimasta ore in coda sposterebbe la media e non la realtà.'
          }
        />
        <Kpi
          label="Costo stimato"
          value={
            kpis.costConfigured ? formatEur(kpis.cost.totalEur) : 'non conf.'
          }
          note={
            kpis.costConfigured
              ? `Stima sulle tariffe configurate${
                  kpis.cost.perSessionEur !== null
                    ? ` · ${formatEur(kpis.cost.perSessionEur)} per seduta`
                    : ''
                }. Non è una fattura.`
              : 'Il consumo fatturabile non è registrato: senza tariffe in AI_NOTES_COST_* un costo sarebbe inventato.'
          }
        />
      </div>

      <AiConsoleFiltersForm
        filters={filters}
        coaches={coaches}
        errorCodes={errorCodes}
        periodKey={period.key}
      />

      <div className="mt-4">
        <SectionHeader
          title="Sedute"
          subtitle="Ordinate dalla più recente. Apri il dettaglio per la cronologia delle fasi, i tentativi e gli errori normalizzati."
        />
        <div className="mt-3">
          <AiConsoleTable
            rows={page.rows}
            total={page.total}
            filters={filters}
            costConfigured={kpis.costConfigured}
            periodKey={period.key}
          />
        </div>
      </div>
    </>
  );
}

function Kpi({
  label,
  value,
  note,
  tone = 'neutro',
}: {
  label: string;
  value: string;
  note: string;
  tone?: 'neutro' | 'attenzione' | 'critico';
}) {
  return (
    <div
      className={`rounded-2xl border bg-white p-4 ${
        tone === 'critico'
          ? 'border-red-200 bg-red-50/40'
          : tone === 'attenzione'
            ? 'border-amber-200 bg-amber-50/40'
            : 'border-gray-200'
      }`}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
        {label}
      </p>
      <p
        className={`mt-1 text-2xl font-bold tabular-nums ${
          tone === 'critico' ? 'text-red-700' : 'text-gray-950'
        }`}
      >
        {value}
      </p>
      <p className="mt-1 text-[11px] leading-4 text-gray-500">{note}</p>
    </div>
  );
}

function ConsoleSkeleton() {
  return (
    <div className="mt-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 10 }).map((_, index) => (
          <div
            key={index}
            className="h-[104px] animate-pulse rounded-2xl border border-gray-200 bg-white"
          />
        ))}
      </div>
      <div className="mt-4 h-24 animate-pulse rounded-2xl border border-gray-200 bg-white" />
      <div className="mt-4 h-96 animate-pulse rounded-2xl border border-gray-200 bg-white" />
    </div>
  );
}
