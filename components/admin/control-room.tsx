import Link from 'next/link';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  ChevronRight,
  CircleHelp,
  CircleSlash,
  Info,
  Minus,
  ShieldAlert,
} from 'lucide-react';
import type { AdminKpi, PipelineFunnelStep } from '@/lib/core/admin/overview';
import type { AttentionItem } from '@/lib/core/admin/attention';
import {
  countWithUnit,
  SERVICE_STATUS_LABEL,
  type ServiceStatus,
  type ServiceVerdict,
} from '@/lib/core/admin/service-health';
import { ADMIN_PERIODS, type AdminPeriodKey } from '@/lib/core/admin/period';
import { upcomingDayName, type UpcomingAgenda } from '@/lib/core/admin/upcoming';

/**
 * I mattoni della Control Room.
 *
 * Componenti server, senza stato: tutto quello che c'è qui dentro è già
 * deciso dal server prima di arrivare al browser. Il selettore di periodo è
 * fatto di collegamenti e non di uno stato React — così un periodo si può
 * incollare in chat, e la pagina si ricarica dal server con i dati giusti
 * invece di rifiltrarli in memoria.
 */

/* ── Intestazione di sezione ────────────────────────────────────────────── */

export function SectionHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
        {subtitle ? (
          <p className="mt-1 max-w-2xl text-sm text-gray-600">{subtitle}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

/* ── Selettore di periodo ───────────────────────────────────────────────── */

export function PeriodSelector({
  current,
  basePath,
}: {
  current: AdminPeriodKey;
  basePath: string;
}) {
  return (
    <div
      className="inline-flex rounded-full border border-gray-200 bg-white p-0.5"
      role="group"
      aria-label="Periodo dei dati"
    >
      {ADMIN_PERIODS.map((period) => (
        <Link
          key={period.key}
          href={`${basePath}?periodo=${period.key}`}
          aria-current={current === period.key ? 'true' : undefined}
          className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
            current === period.key
              ? 'bg-gray-900 text-white'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          {period.label}
        </Link>
      ))}
    </div>
  );
}

/* ── Card KPI ───────────────────────────────────────────────────────────── */

const TONE_RING: Record<AdminKpi['tone'], string> = {
  neutro: 'border-gray-200',
  attenzione: 'border-amber-200 bg-amber-50/40',
  critico: 'border-red-200 bg-red-50/40',
};

export function KpiCard({ kpi }: { kpi: AdminKpi }) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          {kpi.label}
        </p>
        <span
          title={kpi.description}
          className="shrink-0 text-gray-300 transition-colors group-hover:text-gray-400"
        >
          <CircleHelp className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="sr-only">{kpi.description}</span>
        </span>
      </div>
      <p
        className={`mt-1.5 text-3xl font-bold tabular-nums ${
          kpi.tone === 'critico' && kpi.value > 0
            ? 'text-red-700'
            : 'text-gray-950'
        }`}
      >
        {kpi.value}
      </p>
      <p className="mt-1 line-clamp-2 text-xs leading-4 text-gray-600">
        {kpi.description}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
          {kpi.scope}
        </span>
        {kpi.delta ? <DeltaChip delta={kpi.delta} /> : null}
      </div>
    </>
  );

  const className = `group flex h-full flex-col rounded-2xl border bg-white p-4 ${TONE_RING[kpi.tone]}`;

  if (!kpi.href) {
    return <div className={className}>{body}</div>;
  }

  return (
    <Link
      href={kpi.href}
      className={`${className} transition-shadow hover:shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500`}
    >
      {body}
      <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-red-600 opacity-0 transition-opacity group-hover:opacity-100">
        Apri l’elenco <ArrowRight className="h-3 w-3" aria-hidden="true" />
      </span>
    </Link>
  );
}

function DeltaChip({
  delta,
}: {
  delta: NonNullable<AdminKpi['delta']>;
}) {
  const Icon =
    delta.direction === 'up'
      ? ArrowUpRight
      : delta.direction === 'down'
        ? ArrowDownRight
        : Minus;
  return (
    <span
      title="Confronto con il periodo precedente di pari durata"
      className="inline-flex items-center gap-0.5 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-700"
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {delta.percent > 0 ? '+' : ''}
      {delta.percent}%
    </span>
  );
}

export function KpiSkeleton() {
  return (
    <div className="h-[124px] animate-pulse rounded-2xl border border-gray-200 bg-white p-4">
      <div className="h-3 w-24 rounded bg-gray-100" />
      <div className="mt-3 h-7 w-12 rounded bg-gray-100" />
      <div className="mt-3 h-3 w-full rounded bg-gray-100" />
      <div className="mt-2 h-3 w-2/3 rounded bg-gray-100" />
    </div>
  );
}

/* ── Salute della piattaforma ───────────────────────────────────────────── */

const STATUS_STYLE: Record<ServiceStatus, string> = {
  operativo: 'bg-emerald-500',
  degradato: 'bg-amber-500',
  errore: 'bg-red-600',
  non_monitorato: 'bg-gray-300',
};

const STATUS_TEXT: Record<ServiceStatus, string> = {
  operativo: 'text-emerald-700',
  degradato: 'text-amber-700',
  errore: 'text-red-700',
  non_monitorato: 'text-gray-500',
};

export function ServiceHealthPanel({
  services,
}: {
  services: ServiceVerdict[];
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
      <ul className="divide-y divide-gray-100">
        {services.map((service) => (
          <li key={service.key}>
            <ServiceRow service={service} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Una voce di stato, apribile quando ha qualcosa da dire.
 *
 * La prima versione si fermava a «Degradato · 60 fallimenti su 159», e non
 * bastava: chi legge vuole sapere **quale** problema e **se deve
 * intervenire**, e un conteggio non risponde a nessuna delle due. Adesso la
 * riga si apre e mostra le cause con il loro peso, una lettura ricavata dai
 * dati e un collegamento a dove si guarda davvero.
 *
 * `<details>` nativo, come `CollapsiblePanel`: niente stato React, apertura da
 * tastiera gia' gestita dal browser, e il contenuto resta nel documento per
 * la ricerca della pagina. Le voci sane non si aprono — non c'e' niente
 * dentro, e un triangolino che apre il vuoto insegna a non premerlo.
 */
function ServiceRow({ service }: { service: ServiceVerdict }) {
  const testa = (
    <>
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <span
          className={`h-2.5 w-2.5 shrink-0 rounded-full ${STATUS_STYLE[service.status]}`}
          aria-hidden="true"
        />
        <span
          className="truncate text-sm font-medium text-gray-900"
          title={service.measures}
        >
          {service.label}
        </span>
        <span title={service.measures} className="shrink-0 text-gray-300">
          <CircleHelp className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="sr-only">{service.measures}</span>
        </span>
      </div>
      <div className="flex min-w-0 flex-[2] flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-3">
        <span
          className={`shrink-0 text-xs font-semibold uppercase tracking-wide ${STATUS_TEXT[service.status]}`}
        >
          {SERVICE_STATUS_LABEL[service.status]}
        </span>
        <span className="min-w-0 text-xs text-gray-600">{service.message}</span>
      </div>
    </>
  );

  if (!service.expandable) {
    return (
      <div className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
        {testa}
      </div>
    );
  }

  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none flex-col gap-1 px-4 py-3 hover:bg-gray-50 sm:flex-row sm:items-center sm:gap-4 [&::-webkit-details-marker]:hidden">
        {testa}
        <ChevronRight
          className="hidden h-4 w-4 shrink-0 text-gray-400 transition-transform group-open:rotate-90 sm:block"
          aria-hidden="true"
        />
      </summary>

      <div className="border-t border-gray-100 bg-gray-50/60 px-4 py-3">
        <p className="text-xs text-gray-500">{service.measures}</p>

        {service.causes.length > 0 ? (
          <ul className="mt-3 flex flex-col gap-2">
            {service.causes.map((cause) => (
              <li
                key={cause.code}
                className="rounded-xl border border-gray-200 bg-white p-3"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold text-gray-900">
                    {cause.label}
                  </span>
                  <span className="shrink-0 tabular-nums text-sm font-bold text-gray-950">
                    {countWithUnit(cause.count, service.unit, service.unitOne)}
                  </span>
                </div>
                <code className="mt-0.5 block text-[11px] text-gray-400">
                  {cause.code}
                </code>
                <p className="mt-1 text-xs leading-5 text-gray-600">
                  {cause.hint}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-xs text-gray-500">
            Nessuna causa registrata nel periodo: non c’è un elenco di errori
            dietro questo stato.
          </p>
        )}

        {service.action ? (
          <p className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>{service.action}</span>
          </p>
        ) : null}

        {service.href ? (
          <Link
            href={service.href}
            className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-gray-300 bg-white px-3.5 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500"
          >
            {service.hrefLabel ?? 'Apri'}
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        ) : null}
      </div>
    </details>
  );
}

/* ── Richiede attenzione ────────────────────────────────────────────────── */

const SEVERITY: Record<
  AttentionItem['severity'],
  { icon: typeof AlertTriangle; box: string; chip: string; label: string }
> = {
  critico: {
    icon: ShieldAlert,
    box: 'border-red-200 bg-red-50',
    chip: 'bg-red-600 text-white',
    label: 'Critico',
  },
  attenzione: {
    icon: AlertTriangle,
    box: 'border-amber-200 bg-amber-50',
    chip: 'bg-amber-500 text-white',
    label: 'Da sistemare',
  },
  informativo: {
    icon: Info,
    box: 'border-gray-200 bg-gray-50',
    chip: 'bg-gray-500 text-white',
    label: 'Informativo',
  },
};

export function AttentionPanel({ items }: { items: AttentionItem[] }) {
  if (items.length === 0) {
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
        <CircleSlash className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
        <div>
          <p className="text-sm font-semibold text-emerald-900">
            Niente che richieda un intervento
          </p>
          <p className="mt-1 text-sm text-emerald-800">
            Nessun coach in attesa, nessun processo fallito o fermo, nessuna
            autorizzazione mancante fra quelle che sappiamo osservare. Questo
            pannello resta vuoto finché non c’è qualcosa da fare — non è un
            certificato che tutto funzioni: per quello c’è «Salute della
            piattaforma» qui sotto.
          </p>
        </div>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {items.map((item) => {
        const severity = SEVERITY[item.severity];
        const Icon = severity.icon;
        return (
          <li key={item.key}>
            <div
              className={`flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-start ${severity.box}`}
            >
              <Icon
                className="h-5 w-5 shrink-0 text-gray-700"
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${severity.chip}`}
                  >
                    {severity.label}
                  </span>
                  <p className="text-sm font-semibold text-gray-950">
                    {item.title}
                  </p>
                </div>
                <p className="mt-1 text-sm text-gray-700">{item.detail}</p>
              </div>
              <Link
                href={item.href}
                className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-full border border-gray-300 bg-white px-3.5 py-2 text-sm font-semibold text-gray-900 transition-colors hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500"
              >
                {item.actionLabel}
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/* ── Imbuto della pipeline ──────────────────────────────────────────────── */

export function PipelineFunnel({ steps }: { steps: PipelineFunnelStep[] }) {
  const top = steps[0]?.value ?? 0;

  if (top === 0) {
    return (
      <EmptyBlock
        title="Nessuna seduta con Appunti AI nel periodo"
        detail="L’imbuto compare quando c’è almeno una seduta da seguire. Non è un errore: è un periodo senza registrazioni."
      />
    );
  }

  return (
    <ol className="flex flex-col gap-2">
      {steps.map((step, index) => {
        const share = top > 0 ? step.value / top : 0;
        const previous = index > 0 ? steps[index - 1].value : null;
        const lost = previous !== null ? previous - step.value : 0;
        return (
          <li key={step.key}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="font-medium text-gray-800" title={step.note}>
                {step.label}
              </span>
              <span className="shrink-0 tabular-nums font-semibold text-gray-950">
                {step.value}
                {lost > 0 ? (
                  <span className="ml-2 text-xs font-medium text-red-600">
                    −{lost}
                  </span>
                ) : null}
              </span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full rounded-full bg-red-500"
                style={{ width: `${Math.round(share * 100)}%` }}
              />
            </div>
            <p className="mt-1 text-[11px] leading-4 text-gray-500">
              {step.note}
            </p>
          </li>
        );
      })}
    </ol>
  );
}

/* ── Stati vuoti e di errore ────────────────────────────────────────────── */

export function EmptyBlock({
  title,
  detail,
}: {
  title: string;
  detail: string;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-6 text-center">
      <p className="text-sm font-semibold text-gray-800">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-gray-600">{detail}</p>
    </div>
  );
}

export function ErrorBlock({
  title,
  detail,
  retryHref,
}: {
  title: string;
  detail: string;
  retryHref: string;
}) {
  return (
    <div className="rounded-2xl border border-red-200 bg-red-50 p-5">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-red-900">{title}</p>
          <p className="mt-1 text-sm text-red-800">{detail}</p>
          <Link
            href={retryHref}
            className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-red-300 bg-white px-3.5 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"
          >
            Riprova
          </Link>
        </div>
      </div>
    </div>
  );
}

/* ── Prossimi giorni ────────────────────────────────────────────────────── */

/**
 * L'agenda in avanti.
 *
 * Il resto della panoramica guarda all'indietro per costruzione: il periodo
 * finisce ad «adesso». Questo blocco è l'unico che guarda avanti, e per
 * questo **non ha il selettore di periodo**: cambiare da sette a trenta
 * giorni non cambia cosa c'è domani, e legarlo al selettore avrebbe prodotto
 * un numero che si muove senza motivo.
 *
 * I giorni vuoti restano nella fila. Un'agenda che salta i giorni senza
 * sedute si legge come un calendario fitto: sette barre di cui cinque a zero
 * dicono «settimana scarica», cinque barre di fila dicono il contrario.
 */
export function UpcomingAgendaBlock({
  agenda,
  weekdayFor,
  dayNumberFor,
}: {
  agenda: UpcomingAgenda;
  /** Etichetta breve del giorno della settimana, risolta dal server. */
  weekdayFor: (day: string) => string;
  dayNumberFor: (day: string) => string;
}) {
  const massimo = Math.max(1, ...agenda.days.map((d) => d.totale));

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">
            Prossimi 7 giorni
          </h3>
          <p className="mt-0.5 text-xs text-gray-500">
            Confermate e da confermare. Non dipende dal periodo scelto sopra:
            questo blocco guarda avanti.
          </p>
        </div>
        <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-700">
          {agenda.totale} in totale
        </span>
      </div>

      {agenda.vuota ? (
        <p className="mt-4 rounded-xl border border-dashed border-gray-300 bg-gray-50 p-4 text-center text-sm text-gray-600">
          Nessuna seduta in agenda nei prossimi sette giorni. Non è un errore:
          è un calendario vuoto.
        </p>
      ) : (
        <ul className="mt-4 grid grid-cols-7 gap-1.5">
          {agenda.days.map((giorno) => {
            const nome = upcomingDayName(giorno.offset);
            const altezza = Math.round((giorno.totale / massimo) * 100);
            return (
              <li key={giorno.day}>
                <Link
                  href={`/dashboard/admin/sessioni?giorno=${giorno.day}`}
                  title={`${giorno.confermate} confermate · ${giorno.daConfermare} da confermare`}
                  className={`flex h-full flex-col items-center gap-1.5 rounded-xl border p-2 transition-colors hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500 ${
                    nome === 'oggi'
                      ? 'border-gray-900'
                      : giorno.totale === 0
                        ? 'border-gray-100'
                        : 'border-gray-200'
                  }`}
                >
                  <span
                    className={`text-[11px] font-semibold uppercase tracking-wide ${
                      nome === 'data' ? 'text-gray-500' : 'text-gray-900'
                    }`}
                  >
                    {nome === 'oggi'
                      ? 'Oggi'
                      : nome === 'domani'
                        ? 'Domani'
                        : weekdayFor(giorno.day)}
                  </span>
                  <span className="text-[11px] text-gray-400">
                    {dayNumberFor(giorno.day)}
                  </span>

                  <span
                    className="flex h-16 w-full items-end justify-center"
                    aria-hidden="true"
                  >
                    <span
                      className={`w-6 rounded-t ${
                        giorno.totale === 0 ? 'bg-gray-100' : 'bg-red-500'
                      }`}
                      style={{
                        height: giorno.totale === 0 ? '2px' : `${Math.max(8, altezza)}%`,
                      }}
                    />
                  </span>

                  <span
                    className={`text-lg font-bold tabular-nums ${
                      giorno.totale === 0 ? 'text-gray-300' : 'text-gray-950'
                    }`}
                  >
                    {giorno.totale}
                  </span>
                  {giorno.daConfermare > 0 ? (
                    <span className="rounded-full bg-amber-100 px-1.5 text-[10px] font-semibold text-amber-800">
                      {giorno.daConfermare} da conf.
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
