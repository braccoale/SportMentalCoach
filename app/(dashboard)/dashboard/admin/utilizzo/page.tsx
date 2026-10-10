import Link from 'next/link';
import { headers } from 'next/headers';
import { ArrowDownRight, ArrowUpRight, CheckCircle2, Eye, EyeOff, Minus, RefreshCw } from 'lucide-react';
import { requireRole } from '@/lib/core/auth';
import { recordAdminAudit } from '@/lib/core/admin/audit-log';
import { EmptyBlock, ErrorBlock } from '@/components/admin/control-room';
import {
  ActivityChart,
  CountBars,
  DailyBars,
  ReferrerChart,
  Sparkline,
  VisitsChart,
} from '@/components/admin/usage-charts';
import { formatDateTime } from '@/lib/core/format';
import { clientIpFromHeaders, isExcludedIp, rateVital, thresholdsFor, type VitalRating } from '@/lib/core/usage/catalog';
import { funnelRates, gaugePosition, gaugeZones, trend, type Trend } from '@/lib/core/usage/series';
import { getExcludedIps } from '@/lib/core/usage/server';
import { getExcludedIpRows, getUsageReport, type UsageReport } from '@/lib/core/usage/queries';
import {
  getSignupSources,
  getUserTimeline,
  getUsersOverview,
  type SignupSources,
  type TimelineEvent,
  type UsersOverview,
} from '@/lib/core/usage/queries-users';
import { excludeMyIpAction, removeExcludedIpAction } from './actions';

export const dynamic = 'force-dynamic';

const PERIODS = [7, 30, 90] as const;
const VIEWS = [
  { key: 'panoramica', label: 'Panoramica' },
  { key: 'utenti', label: 'Utenti' },
  { key: 'attivita', label: 'Attività utente' },
  { key: 'sezioni', label: 'Sezioni' },
  { key: 'problemi', label: 'Problemi' },
  { key: 'provenienza', label: 'Provenienza iscritti' },
] as const;
type ViewKey = (typeof VIEWS)[number]['key'];

const FUNNEL_LABEL: Record<string, string> = {
  signup_completed: 'Registrati',
  onboarding_completed: 'Guida di benvenuto completata',
  coach_profile_submitted: 'Profilo coach inviato',
  coach_profile_approved: 'Profilo coach approvato',
  booking_requested: 'Richiesta di seduta inviata',
  booking_accepted: 'Richiesta accettata',
  session_joined: 'Entrati in una seduta',
  booking_completed: 'Seduta conclusa',
  review_left: 'Recensione lasciata',
};
const FUNNEL_ORDER = Object.keys(FUNNEL_LABEL);

const BOOKING_LABEL: Record<string, string> = {
  booking_requested: 'Richieste',
  booking_accepted: 'Accettate',
  booking_declined: 'Rifiutate',
  booking_cancelled: 'Annullate',
  booking_completed: 'Concluse',
};

const REFERRER_LABEL: Record<string, string> = {
  diretto: 'Diretto',
  ricerca: 'Ricerca',
  social: 'Social',
  altro: 'Altri siti',
  interno: 'Interno',
};

const ERROR_KIND_LABEL: Record<string, string> = {
  offline: 'Senza rete',
  caricamento: 'Caricamento non riuscito',
  applicazione: 'Errore dell’applicazione',
  azione: 'Azione non riuscita',
  rete: 'Richiesta fallita',
  server: 'Errore del server',
};

const METRIC_LABEL: Record<string, string> = {
  LCP: 'Apertura',
  INP: 'Risposta ai clic',
  CLS: 'Stabilità',
  TTFB: 'Risposta del server',
  FCP: 'Primo contenuto',
};
const METRIC_ORDER = ['LCP', 'INP', 'TTFB', 'FCP', 'CLS'];

const RATING_TEXT: Record<VitalRating, string> = {
  good: 'text-emerald-700',
  'needs-improvement': 'text-amber-700',
  poor: 'text-red-700',
};

const EVENT_LABEL: Record<string, { label: string; tone: 'auth' | 'good' | 'info' | 'warn' }> = {
  auth_sign_in: { label: 'Accesso', tone: 'auth' },
  auth_sign_out: { label: 'Uscita', tone: 'auth' },
  signup_completed: { label: 'Registrazione', tone: 'auth' },
  demo_opened: { label: 'Demo aperta', tone: 'info' },
  onboarding_step_completed: { label: 'Passo della guida', tone: 'info' },
  onboarding_completed: { label: 'Guida completata', tone: 'good' },
  coach_profile_submitted: { label: 'Profilo inviato', tone: 'good' },
  coach_profile_approved: { label: 'Profilo approvato', tone: 'good' },
  coach_profile_rejected: { label: 'Profilo rifiutato', tone: 'warn' },
  booking_requested: { label: 'Richiesta di seduta', tone: 'good' },
  booking_accepted: { label: 'Richiesta accettata', tone: 'good' },
  booking_declined: { label: 'Richiesta rifiutata', tone: 'warn' },
  booking_cancelled: { label: 'Seduta annullata', tone: 'warn' },
  booking_completed: { label: 'Seduta conclusa', tone: 'good' },
  session_joined: { label: 'Ingresso in seduta', tone: 'good' },
  coach_video_published: { label: 'Video pubblicato', tone: 'info' },
  coach_match_used: { label: 'Aiutami a scegliere', tone: 'info' },
  review_left: { label: 'Recensione', tone: 'good' },
};
const TONE_CLASS = {
  auth: 'bg-sky-50 text-sky-700',
  good: 'bg-emerald-50 text-emerald-700',
  info: 'bg-gray-100 text-gray-700',
  warn: 'bg-amber-50 text-amber-800',
} as const;

const roleLabel = (roles: string) =>
  roles
    .split(', ')
    .map((r) => (r === 'coach' ? 'Coach' : r === 'athlete' ? 'Atleta' : r === 'club' ? 'Club' : r))
    .join(', ');

function formatValue(metric: string, value: number): string {
  if (metric === 'CLS') return value.toFixed(2).replace('.', ',');
  if (value >= 1000) return `${(value / 1000).toFixed(1).replace('.', ',')} s`;
  return `${Math.round(value)} ms`;
}

const romeTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('it-IT', { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit', second: '2-digit' });
const romeDayTitle = (iso: string) =>
  new Date(iso).toLocaleDateString('it-IT', { timeZone: 'Europe/Rome', weekday: 'long', day: 'numeric', month: 'long' });
const romeDayKey = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Europe/Rome' });

function Card({ title, hint, children, className = '' }: { title: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-gray-200 bg-white p-5 ${className}`}>
      <h3 className="text-base font-semibold text-gray-900">{title}</h3>
      {hint ? <p className="mt-1 text-sm text-gray-500">{hint}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

const Empty = ({ children }: { children: React.ReactNode }) => (
  <p className="py-8 text-center text-sm text-gray-500">{children}</p>
);

function Delta({ t, goodWhenUp = true }: { t: Trend; goodWhenUp?: boolean }) {
  if (t.percent === null) return <span className="text-xs text-gray-400">{t.current > 0 ? 'nuovo' : '—'}</span>;
  const Icon = t.percent > 0 ? ArrowUpRight : t.percent < 0 ? ArrowDownRight : Minus;
  const good = t.percent === 0 ? null : t.percent > 0 === goodWhenUp;
  const tone = good === null ? 'text-gray-500 bg-gray-100' : good ? 'text-emerald-700 bg-emerald-50' : 'text-red-700 bg-red-50';
  return (
    <span title="Ultimi 7 giorni contro i 7 precedenti" className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone}`}>
      <Icon className="h-3 w-3" aria-hidden />
      {t.percent > 0 ? '+' : ''}
      {t.percent}%
    </span>
  );
}

function KpiTile({ label, value, note, delta, spark }: { label: string; value: React.ReactNode; note?: string; delta?: React.ReactNode; spark?: React.ReactNode }) {
  return (
    <div className="flex flex-col rounded-2xl border border-gray-200 bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <div className="mt-1.5 flex items-baseline gap-2">
        <p className="text-3xl font-bold tabular-nums text-gray-950">{value}</p>
        {delta}
      </div>
      {note ? <p className="mt-0.5 text-xs text-gray-500">{note}</p> : null}
      {spark ? <div className="mt-2">{spark}</div> : null}
    </div>
  );
}

function FunnelBars({ steps }: { steps: { event: string; users: number }[] }) {
  const rows = funnelRates(steps);
  const max = Math.max(1, ...rows.map((r) => r.users));
  return (
    <ul className="space-y-3">
      {rows.map((row) => (
        <li key={row.event}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="text-gray-800">{FUNNEL_LABEL[row.event]}</span>
            <span className="tabular-nums">
              <span className="font-semibold text-gray-950">{row.users}</span>
              {row.fromPrevious !== null && (
                <span className="ml-2 text-xs text-gray-500" title="Sul passo precedente">
                  {row.fromPrevious}%
                </span>
              )}
            </span>
          </div>
          <div className="mt-1 h-2.5 w-full overflow-hidden rounded-full bg-gray-100">
            <div className="h-full rounded-full bg-green-500" style={{ width: `${Math.max(2, (row.users / max) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function VitalBar({ metric, p50, p75, p95 }: { metric: string; p50: number; p75: number; p95: number }) {
  const thresholds = thresholdsFor(metric);
  const rating = rateVital(metric, p75);
  if (!thresholds) return <span className="tabular-nums text-sm">{formatValue(metric, p75)}</span>;
  const [a, b, c] = gaugeZones(thresholds);
  return (
    <div className="flex items-center gap-3">
      <div
        className="relative flex h-2.5 w-full min-w-[120px] overflow-hidden rounded-full"
        role="img"
        aria-label={`${formatValue(metric, p75)}: ${rating === 'good' ? 'buono' : rating === 'poor' ? 'scarso' : 'da migliorare'}`}
      >
        <div className="bg-emerald-200" style={{ width: `${a}%` }} />
        <div className="bg-amber-200" style={{ width: `${b}%` }} />
        <div className="bg-red-200" style={{ width: `${c}%` }} />
        <span className="absolute top-1/2 h-4 w-1 -translate-y-1/2 rounded-full bg-gray-900" style={{ left: `calc(${gaugePosition(p75, thresholds)}% - 2px)` }} title={`Il 75% sta sotto ${formatValue(metric, p75)}`} />
        <span className="absolute top-1/2 h-2 w-2 -translate-y-1/2 rounded-full border border-gray-500 bg-white" style={{ left: `calc(${gaugePosition(p50, thresholds)}% - 4px)` }} title={`Tipico ${formatValue(metric, p50)}`} />
        <span className="sr-only">Tipico {formatValue(metric, p50)}, peggiori {formatValue(metric, p95)}</span>
      </div>
      <span className={`w-14 shrink-0 text-right text-sm font-semibold tabular-nums ${rating ? RATING_TEXT[rating] : ''}`}>{formatValue(metric, p75)}</span>
    </div>
  );
}

const href = (view: ViewKey, days: number, extra = '') => `/dashboard/admin/utilizzo?vista=${view}&giorni=${days}${extra}`;

/**
 * Utilizzo e salute del sistema: chi arriva, cosa fa, quanto ci mette una
 * pagina ad aprirsi e quali errori vede chi usa il sito.
 *
 * Risponde a tre domande concrete: qualcuno ha aperto la demo? È arrivata una
 * persona nuova oltre a quelle che porta Francesco? Ci sono rallentamenti o
 * messaggi d'errore per chi usa la piattaforma? Sei schede, un solo periodo.
 * Gli indirizzi nell'elenco delle esclusioni non compaiono mai.
 */
export default async function AdminUsagePage({
  searchParams,
}: {
  searchParams: Promise<{ vista?: string; giorni?: string; utente?: string }>;
}) {
  const admin = await requireRole('admin');
  const sp = await searchParams;
  const view: ViewKey = VIEWS.some((v) => v.key === sp.vista) ? (sp.vista as ViewKey) : 'panoramica';
  const days = (PERIODS as readonly number[]).includes(Number(sp.giorni)) ? Number(sp.giorni) : 30;

  const h = await headers();
  const myIp = clientIpFromHeaders((name) => h.get(name));

  let report: UsageReport | null = null;
  let users: UsersOverview | null = null;
  let failed = false;
  try {
    [report, users] = await Promise.all([getUsageReport(days), getUsersOverview(days)]);
  } catch (error) {
    console.error('[usage] report non letto', error instanceof Error ? error.message : error);
    failed = true;
  }
  const excludedRows = await getExcludedIpRows().catch(() => []);
  const iAmExcluded = isExcludedIp(myIp, await getExcludedIps());

  // Le viste sulle persone si leggono solo quando servono, e chi guarda una persona viene registrato.
  let signups: SignupSources | null = null;
  let timeline: Awaited<ReturnType<typeof getUserTimeline>> = null;
  let selectedId: number | null = null;
  if (!failed && view === 'provenienza') signups = await getSignupSources(days).catch(() => null);
  if (!failed && view === 'attivita' && users) {
    selectedId = Number(sp.utente) || users.users.find((u) => u.events > 0)?.id || users.users[0]?.id || null;
    if (selectedId) {
      timeline = await getUserTimeline(selectedId).catch(() => null);
      if (timeline) {
        await recordAdminAudit({
          actor: { id: admin.id, email: admin.email },
          action: 'sensitive_content_accessed',
          subjectType: 'user',
          subjectId: selectedId,
          detail: { vista: 'utilizzo_attivita_utente' },
        });
      }
    }
  }

  return (
    <section className="space-y-5 p-4 lg:p-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-950">Utilizzo e salute del sistema</h1>
        {iAmExcluded ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700">
            <EyeOff className="h-3.5 w-3.5" aria-hidden /> Il tuo traffico non si traccia
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800">
            <Eye className="h-3.5 w-3.5" aria-hidden /> Stai lasciando tracce
          </span>
        )}
      </div>

      {!iAmExcluded && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="max-w-xl text-sm text-amber-900">
            Le tue visite da questo indirizzo ({myIp ?? 'non rilevabile'}) contano come visite vere e falsano i numeri. Escludilo: da lì non si registra più niente, nemmeno quando apri la demo.
          </p>
          <form action={excludeMyIpAction} className="flex flex-wrap items-center gap-2">
            <input name="label" placeholder="Nome (es. Casa)" maxLength={80} className="rounded-md border border-amber-300 bg-white px-3 py-1.5 text-sm" />
            <button type="submit" disabled={!myIp} className="inline-flex h-9 items-center rounded-full bg-green-600 px-4 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50">
              Escludi il mio indirizzo
            </button>
          </form>
        </div>
      )}

      {/* Il periodo: un modulo che ricarica la pagina, senza stato nel browser */}
      <form method="get" className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="vista" value={view} />
        <label className="text-xs text-gray-600">
          Periodo
          <select name="giorni" defaultValue={days} className="mt-1 block rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900">
            {PERIODS.map((p) => (
              <option key={p} value={p}>
                Ultimi {p} giorni
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="inline-flex h-10 items-center gap-2 rounded-full bg-green-600 px-5 text-sm font-semibold text-white hover:bg-green-700">
          <RefreshCw className="h-4 w-4" aria-hidden /> Aggiorna
        </button>
        <p className="pb-2 text-xs text-gray-500">Dati aggiornati alla richiesta · fuso orario Europe/Rome</p>
      </form>

      {failed || !report || !users ? (
        <ErrorBlock title="Non riesco a leggere i dati d'uso" detail="Se la migrazione 0100 non è ancora stata applicata, mancano le tabelle: finché non lo è, non si registra niente." retryHref="/dashboard/admin/utilizzo" />
      ) : (
        <>
          <Kpis report={report} users={users} days={days} />
          <p className="text-xs leading-5 text-gray-500">
            Si contano le pagine viste ogni volta che si apre una pagina pubblica. I numeri descrivono eventi osservati, non sessioni complete né tassi di errore completi. Gli amministratori, gli indirizzi esclusi e i robot (anche le anteprime dei social) non sono inclusi. Un errore del server compare solo se qualcuno ha incontrato la pagina rotta.
            {report.trackingSince ? ` Dati disponibili dal ${formatDateTime(new Date(report.trackingSince))}: prima non si registrava niente.` : ''}
          </p>

          <nav aria-label="Viste" className="flex flex-wrap gap-2">
            {VIEWS.map((v) => (
              <Link
                key={v.key}
                href={href(v.key, days)}
                aria-current={v.key === view ? 'page' : undefined}
                className={`rounded-lg border px-3.5 py-2 text-sm font-medium ${v.key === view ? 'border-green-600 bg-green-600 text-white' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'}`}
              >
                {v.label}
              </Link>
            ))}
          </nav>

          {view === 'panoramica' && <Overview report={report} />}
          {view === 'utenti' && <UsersTable users={users} days={days} />}
          {view === 'attivita' && <UserActivity users={users} selectedId={selectedId} timeline={timeline} days={days} />}
          {view === 'sezioni' && <Sections report={report} />}
          {view === 'problemi' && <Problems report={report} />}
          {view === 'provenienza' && <Sources report={report} signups={signups} />}
        </>
      )}

      <details className="rounded-2xl border border-gray-200 bg-white p-5">
        <summary className="cursor-pointer text-base font-semibold text-gray-900">Indirizzi esclusi dal tracciamento ({excludedRows.length})</summary>
        <p className="mt-2 text-sm text-gray-500">
          Chi si connette da questi indirizzi non lascia nessuna traccia: né visite, né tempi, né eventi. Gli indirizzi IPv6 si confrontano per rete, perché cambiano di continuo. Se l&apos;operatore ti cambia indirizzo, aggiungi quello nuovo. Un cambio può metterci fino a un minuto a valere ovunque.
        </p>
        {excludedRows.length === 0 ? (
          <p className="mt-3 text-sm text-gray-500">Nessun indirizzo escluso.</p>
        ) : (
          <ul className="mt-3 divide-y divide-gray-100 rounded-xl border border-gray-200 text-sm">
            {excludedRows.map((row) => (
              <li key={row.id} className="flex items-center justify-between gap-3 px-4 py-2">
                <span>
                  <span className="font-mono text-xs text-gray-700">{row.ip}</span>
                  {row.label ? <span className="ml-2 text-gray-500">{row.label}</span> : null}
                </span>
                <form action={removeExcludedIpAction}>
                  <input type="hidden" name="id" value={row.id} />
                  <button type="submit" className="text-xs text-gray-500 hover:text-gray-900 hover:underline">Rimuovi</button>
                </form>
              </li>
            ))}
          </ul>
        )}
        {iAmExcluded && (
          <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-emerald-700">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Questo indirizzo ({myIp}) è escluso.
          </p>
        )}
      </details>
    </section>
  );
}

function Kpis({ report, users, days }: { report: UsageReport; users: UsersOverview; days: number }) {
  const s = report.series;
  const sum = (key: 'uniques' | 'demo' | 'errors') => s.reduce((a, p) => a + p[key], 0);
  const errors = sum('errors');
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      <KpiTile label="Utenti attivi 7 giorni" value={users.active7} note="almeno un gesto registrato" delta={<Delta t={trend(s.map((p) => p.users))} />} />
      <KpiTile label="Visitatori" value={sum('uniques')} note="persone diverse al giorno, sommate" delta={<Delta t={trend(s.map((p) => p.uniques))} />} spark={<Sparkline data={s} dataKey="uniques" />} />
      <KpiTile label="Giorni attivi mediani" value={users.medianActiveDays} note={`per utente attivo, ultimi ${days} giorni`} />
      <KpiTile label="Demo aperte" value={sum('demo')} note={report.demo.byRole.map((r) => `${r.n} ${r.role === 'coach' ? 'coach' : r.role === 'athlete' ? 'atleta' : r.role}`).join(' · ') || 'nessuna ancora'} delta={<Delta t={trend(s.map((p) => p.demo))} />} spark={<Sparkline data={s} dataKey="demo" />} />
      <KpiTile label="Problemi visti" value={errors} note={errors === 0 ? 'nessuno: bene' : 'schermate d’errore, anche del server'} delta={<Delta t={trend(s.map((p) => p.errors))} goodWhenUp={false} />} spark={<Sparkline data={s} dataKey="errors" color="#b45309" />} />
    </div>
  );
}

function Overview({ report }: { report: UsageReport }) {
  const s = report.series;
  const hasVisits = s.some((p) => p.views > 0);
  const hasActivity = s.some((p) => p.events > 0);
  const funnelSteps = FUNNEL_ORDER.map((event) => ({ event, users: report.funnel.find((f) => f.event === event)?.users ?? 0 })).filter((f) => f.users > 0);
  const bookingBars = Object.keys(BOOKING_LABEL).map((event) => ({ label: BOOKING_LABEL[event], n: report.bookings.find((b) => b.event === event)?.n ?? 0 }));
  const hasBookings = bookingBars.some((b) => b.n > 0);
  const nothing = !hasVisits && !hasActivity && report.demo.recent.length === 0 && report.perfRoutes.length === 0 && report.errors.length === 0;
  return (
    <div className="space-y-4">
      {nothing && <EmptyBlock title="Ancora nessun dato" detail="Le visite e le misure arrivano da chi apre il sito dopo il rilascio; gli eventi dai gesti degli utenti. Torna fra qualche ora." />}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Utenti e azioni per giorno" hint="Le barre sono i gesti compiuti, la linea le persone con un account che hanno fatto qualcosa.">
          {hasActivity ? <ActivityChart data={s} /> : <Empty>Ancora nessun gesto registrato.</Empty>}
        </Card>
        <Card title="Visite al sito pubblico" hint="Le barre sono le pagine viste, la linea i visitatori diversi.">
          {hasVisits ? <VisitsChart data={s} /> : <Empty>Nessuna visita registrata nel periodo.</Empty>}
        </Card>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Il percorso" hint="Persone diverse che hanno fatto ogni passo; la percentuale è sul passo prima.">
          {funnelSteps.length === 0 ? <Empty>Ancora nessun passo registrato.</Empty> : <FunnelBars steps={funnelSteps} />}
        </Card>
        <Card title="Prenotazioni" hint="Cosa è successo alle richieste di seduta nel periodo.">
          {hasBookings ? <CountBars data={bookingBars} /> : <Empty>Nessuna richiesta registrata.</Empty>}
          {report.joinDenied.length > 0 && (
            <p className="mt-3 text-xs text-gray-500">Ingressi in seduta negati: {report.joinDenied.map((d) => `${d.n} per «${d.reason}»`).join(', ')}.</p>
          )}
        </Card>
      </div>
      <Card title="La demo" hint="Ogni apertura da un indirizzo non escluso.">
        {report.demo.recent.length === 0 ? (
          <Empty>Nessuna apertura registrata.</Empty>
        ) : (
          <ul className="divide-y divide-gray-100 text-sm">
            {report.demo.recent.map((r, i) => (
              <li key={`${r.at}-${i}`} className="flex items-center justify-between gap-3 py-2">
                <span className="flex items-center gap-2">
                  <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">{r.role === 'coach' ? 'Coach' : r.role === 'athlete' ? 'Atleta' : r.role}</span>
                  {r.device ? <span className="text-gray-500">{r.device === 'mobile' ? 'telefono' : r.device === 'tablet' ? 'tablet' : 'computer'}</span> : null}
                </span>
                <span className="text-gray-500">{formatDateTime(new Date(r.at))}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function UsersTable({ users, days }: { users: UsersOverview; days: number }) {
  return (
    <Card title="Utenti" hint={`Gli account veri (senza demo né amministratori) e cosa hanno fatto negli ultimi ${days} giorni. Il pallino verde: attivi negli ultimi 5 minuti.`}>
      {users.users.length === 0 ? (
        <Empty>Nessun utente.</Empty>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-gray-500">
              <tr>
                <th className="py-1.5 font-medium">Utente</th>
                <th className="py-1.5 font-medium">Ruolo</th>
                <th className="py-1.5 font-medium">Iscritto il</th>
                <th className="py-1.5 text-right font-medium">Gesti</th>
                <th className="py-1.5 text-right font-medium">Giorni attivi</th>
                <th className="py-1.5 text-right font-medium">Ultimo gesto</th>
                <th className="py-1.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.users.map((u) => (
                <tr key={u.id}>
                  <td className="py-2">
                    <span className="inline-flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${u.live ? 'bg-green-500' : 'bg-gray-200'}`} aria-label={u.live ? 'attivo ora' : undefined} />
                      {u.name}
                    </span>
                  </td>
                  <td className="py-2 text-gray-600">{roleLabel(u.roles)}</td>
                  <td className="py-2 text-gray-600">{formatDateTime(new Date(u.createdAt))}</td>
                  <td className="py-2 text-right tabular-nums">{u.events}</td>
                  <td className="py-2 text-right tabular-nums">{u.activeDays}</td>
                  <td className="py-2 text-right text-gray-500">{u.lastAt ? formatDateTime(new Date(u.lastAt)) : 'mai'}</td>
                  <td className="py-2 text-right">
                    <Link href={href('attivita', days, `&utente=${u.id}`)} className="text-xs font-medium text-green-700 hover:underline">Attività</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-xs text-gray-500">Chi non ha ancora nessun gesto registrato si è iscritto prima che cominciassimo a registrare: non significa che non usi la piattaforma.</p>
    </Card>
  );
}

const PROP_TEXT: Record<string, (v: string | number | boolean) => string | null> = {
  method: (v) => (v === 'google' ? 'con Google' : v === 'password' ? 'con password' : String(v)),
  by: (v) => (v === 'coach' ? 'richiesta dal coach' : v === 'athlete' ? 'richiesta dall’atleta' : String(v)),
  late: (v) => (v === true ? 'annullamento tardivo' : null),
  rating: (v) => `voto ${v}`,
  via: (v) => (v === 'wizard' ? 'dalla guida' : v === 'profile' ? 'dal profilo' : String(v)),
  role: () => null,
  reason: (v) => `motivo: ${v}`,
};

function eventDetail(e: TimelineEvent): string {
  const parts: string[] = [];
  if (e.outcome === 'denied') parts.push('negato');
  if (e.outcome === 'error') parts.push('errore');
  if (e.entityType === 'booking' && e.entityId) parts.push(`prenotazione n. ${e.entityId}`);
  if (e.entityType === 'provider_profile' && e.entityId) parts.push(`profilo n. ${e.entityId}`);
  for (const [k, v] of Object.entries(e.props ?? {})) {
    const text = PROP_TEXT[k] ? PROP_TEXT[k](v) : `${k.replace(/_/g, ' ')}: ${String(v)}`;
    if (text) parts.push(text);
  }
  return parts.join(' · ');
}

function UserActivity({ users, selectedId, timeline, days }: { users: UsersOverview; selectedId: number | null; timeline: Awaited<ReturnType<typeof getUserTimeline>>; days: number }) {
  const byDay = new Map<string, TimelineEvent[]>();
  for (const e of timeline?.events ?? []) byDay.set(romeDayKey(e.at), [...(byDay.get(romeDayKey(e.at)) ?? []), e]);
  return (
    <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
      <Card title="Utenti" hint="Il pallino verde: attivi negli ultimi 5 minuti.">
        <ul className="-mx-2 space-y-0.5">
          {users.users.map((u) => (
            <li key={u.id}>
              <Link
                href={href('attivita', days, `&utente=${u.id}`)}
                className={`flex items-start gap-2 rounded-lg px-2 py-2 text-sm ${u.id === selectedId ? 'bg-green-50' : 'hover:bg-gray-50'}`}
              >
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${u.live ? 'bg-green-500' : 'bg-gray-200'}`} />
                <span className="min-w-0">
                  <span className="block truncate font-medium text-gray-900">{u.name}</span>
                  <span className="block truncate text-xs text-gray-500">
                    {roleLabel(u.roles)} · {u.lastAt ? `ultimo gesto ${formatDateTime(new Date(u.lastAt))}` : 'nessun gesto'}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Card>
      <Card
        title={timeline ? `Attività di ${timeline.name}` : 'Attività utente'}
        hint="I gesti registrati, dal più recente. Consultare questa vista viene registrato nel registro dell'amministrazione."
      >
        {!timeline ? (
          <Empty>Scegli un utente dall&apos;elenco.</Empty>
        ) : timeline.events.length === 0 ? (
          <Empty>Nessun gesto registrato per questa persona: o non ha ancora fatto niente, o si è iscritta prima del tracciamento.</Empty>
        ) : (
          <div className="space-y-5">
            {[...byDay.entries()].map(([day, events]) => (
              <div key={day}>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{romeDayTitle(events[0].at)}</p>
                <ul className="mt-2 space-y-2">
                  {events.map((e, i) => {
                    const meta = EVENT_LABEL[e.event] ?? { label: e.event, tone: 'info' as const };
                    const tone = e.outcome !== 'ok' ? 'warn' : meta.tone;
                    return (
                      <li key={`${e.at}-${i}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                        <span className="w-16 shrink-0 font-mono text-xs text-gray-400">{romeTime(e.at)}</span>
                        <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${TONE_CLASS[tone]}`}>{meta.label}</span>
                        <span className="text-gray-700">{eventDetail(e)}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function perfByRoute(report: UsageReport) {
  const map = new Map<string, UsageReport['perfRoutes']>();
  for (const p of report.perfRoutes) map.set(p.route, [...(map.get(p.route) ?? []), p]);
  return [...map.entries()]
    .map(([route, items]) => ({
      route,
      items: items.sort((a, b) => (METRIC_ORDER.indexOf(a.metric) < 0 ? 99 : METRIC_ORDER.indexOf(a.metric)) - (METRIC_ORDER.indexOf(b.metric) < 0 ? 99 : METRIC_ORDER.indexOf(b.metric))),
      samples: Math.max(...items.map((i) => i.n)),
    }))
    .sort((a, b) => b.samples - a.samples);
}

function Sections({ report }: { report: UsageReport }) {
  const routes = perfByRoute(report).slice(0, 10);
  const maxViews = Math.max(1, ...report.visits.topRoutes.map((r) => r.views));
  return (
    <div className="space-y-4">
      <Card title="Le pagine più visitate" hint="Le pagine pubbliche, per numero di visite.">
        {report.visits.topRoutes.length === 0 ? (
          <Empty>Nessuna visita registrata.</Empty>
        ) : (
          <ul className="space-y-3 text-sm">
            {report.visits.topRoutes.map((r) => (
              <li key={r.route}>
                <div className="flex justify-between gap-3">
                  <span className="font-mono text-xs text-gray-700">{r.route}</span>
                  <span className="tabular-nums text-gray-600">{r.views} visite · {r.uniques} visitatori</span>
                </div>
                <div className="mt-1 h-2 w-full rounded-full bg-gray-100">
                  <div className="h-full rounded-full bg-green-400" style={{ width: `${(r.views / maxViews) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title="Quanto ci mette una pagina ad aprirsi" hint="Il segno scuro è il valore sotto cui sta il 75% delle persone, il cerchio è il tipico. Verde = buono, giallo = da migliorare, rosso = scarso (le soglie di Google). Con poche misure i valori sono rumorosi: guarda il numero.">
        {routes.length === 0 ? (
          <Empty>Ancora nessuna misura: arrivano da chi apre il sito dopo il rilascio.</Empty>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {routes.map((route) => (
              <div key={route.route} className="rounded-xl border border-gray-200 p-4">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="font-mono text-xs font-semibold text-gray-900">{route.route}</p>
                  <p className="text-xs text-gray-500">{route.samples} misure</p>
                </div>
                <ul className="mt-3 space-y-3">
                  {route.items.map((p) => (
                    <li key={p.metric}>
                      <p className="mb-1 text-xs text-gray-600">{METRIC_LABEL[p.metric] ?? p.metric.replace('ready:', 'Pronto: ')}</p>
                      <VitalBar metric={p.metric} p50={p.p50} p75={p.p75} p95={p.p95} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function Problems({ report }: { report: UsageReport }) {
  const s = report.series;
  const slow = perfByRoute(report)
    .flatMap((r) => r.items.filter((i) => rateVital(i.metric, i.p75) === 'poor').map((i) => ({ ...i })))
    .slice(0, 10);
  return (
    <div className="space-y-4">
      <Card title="Andamento dei problemi osservati" hint="Le schermate d'errore mostrate e gli errori del server, per giorno.">
        {s.some((p) => p.errors > 0) ? <DailyBars data={s.map((p) => ({ day: p.day, value: p.errors }))} label="Problemi" color="#dc2626" /> : <Empty>Nessun problema registrato nel periodo. Bene così.</Empty>}
      </Card>
      <Card title="Problemi per tipo e sezione" hint="Il codice è il nome dell'errore; l'identificativo si cerca nei log di Vercel.">
        {report.errors.length === 0 ? (
          <Empty>Nessun problema registrato.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-gray-500">
                <tr>
                  <th className="py-1.5 font-medium">Tipo</th>
                  <th className="py-1.5 font-medium">Codice</th>
                  <th className="py-1.5 font-medium">Sezione</th>
                  <th className="py-1.5 text-right font-medium">Eventi</th>
                  <th className="py-1.5 text-right font-medium">Ultima occorrenza</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {report.errors.map((e, i) => (
                  <tr key={`${e.kind}-${e.code}-${e.route}-${i}`}>
                    <td className="py-2">{ERROR_KIND_LABEL[e.kind] ?? e.kind}</td>
                    <td className="py-2 font-mono text-xs">{e.code ?? '—'}</td>
                    <td className="py-2 font-mono text-xs">{e.route}</td>
                    <td className="py-2 text-right tabular-nums">{e.n}</td>
                    <td className="py-2 text-right text-gray-500">{formatDateTime(new Date(e.lastAt))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Risposte lente" hint="Le pagine dove il 75% delle persone aspetta più della soglia «scarso» di Google.">
          {slow.length === 0 ? (
            <Empty>Nessuna pagina lenta rilevata.</Empty>
          ) : (
            <ul className="divide-y divide-gray-100 text-sm">
              {slow.map((p) => (
                <li key={`${p.route}-${p.metric}`} className="flex items-center justify-between gap-3 py-2">
                  <span><span className="font-mono text-xs">{p.route}</span> <span className="text-gray-500">· {METRIC_LABEL[p.metric] ?? p.metric}</span></span>
                  <span className="font-semibold tabular-nums text-red-700">{formatValue(p.metric, p.p75)} <span className="text-xs font-normal text-gray-500">({p.n})</span></span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Ingressi in seduta negati" hint="Chi ha provato a entrare e non ha potuto, con il motivo.">
          {report.joinDenied.length === 0 ? (
            <Empty>Nessun ingresso negato.</Empty>
          ) : (
            <ul className="divide-y divide-gray-100 text-sm">
              {report.joinDenied.map((d) => (
                <li key={d.reason} className="flex justify-between gap-3 py-2">
                  <span className="font-mono text-xs">{d.reason}</span>
                  <span className="tabular-nums font-semibold">{d.n}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      <p className="text-xs text-gray-500">Non ancora registrati: le risposte lente delle singole operazioni del database e i messaggi d&apos;errore delle azioni (per esempio un modulo respinto). Arrivano con il prossimo passo.</p>
    </div>
  );
}

function Sources({ report, signups }: { report: UsageReport; signups: SignupSources | null }) {
  const referrer = report.visits.byReferrer.map((r) => ({ label: REFERRER_LABEL[r.kind] ?? r.kind, uniques: r.uniques, views: r.views }));
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Da dove arrivano i visitatori" hint="Verde scuro i visitatori diversi, chiaro le visite. Si conserva la categoria, mai l'indirizzo di provenienza.">
          {referrer.length === 0 ? <Empty>Nessuna visita registrata.</Empty> : <ReferrerChart data={referrer} />}
        </Card>
        <Card title="Iscritti" hint="Chi si è iscritto nel periodo (esclusi demo e amministratori).">
          {!signups ? (
            <Empty>Non riesco a leggere gli iscritti.</Empty>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded-xl bg-gray-50 p-3"><p className="text-2xl font-bold tabular-nums">{signups.total}</p><p className="text-xs text-gray-500">iscritti</p></div>
                <div className="rounded-xl bg-gray-50 p-3"><p className="text-2xl font-bold tabular-nums">{signups.invited}</p><p className="text-xs text-gray-500">con un invito</p></div>
                <div className="rounded-xl bg-gray-50 p-3"><p className="text-2xl font-bold tabular-nums">{signups.total - signups.invited}</p><p className="text-xs text-gray-500">senza invito</p></div>
              </div>
              {signups.byRole.length > 0 && (
                <p className="mt-3 text-sm text-gray-600">{signups.byRole.map((r) => `${r.n} ${r.role === 'coach' ? 'coach' : r.role === 'athlete' ? 'atleti' : r.role}`).join(' · ')}</p>
              )}
              {signups.perDay.length > 0 ? (
                <div className="mt-4"><DailyBars data={signups.perDay.map((d) => ({ day: d.day, value: d.n }))} label="Iscritti" /></div>
              ) : (
                <p className="mt-4 text-sm text-gray-500">Nessuna iscrizione nel periodo.</p>
              )}
            </>
          )}
        </Card>
      </div>
      <p className="text-xs text-gray-500">La provenienza dei visitatori e gli iscritti non sono collegati fra loro: per non seguire le persone, non si lega una visita anonima a un account. Quindi non si può dire «questo iscritto è arrivato da Google»; si vede solo se è arrivato con un invito.</p>
    </div>
  );
}
