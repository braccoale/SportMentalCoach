import { headers } from 'next/headers';
import { requireRole } from '@/lib/core/auth';
import { SectionHeader, EmptyBlock, ErrorBlock } from '@/components/admin/control-room';
import { formatDateTime } from '@/lib/core/format';
import { clientIpFromHeaders, isExcludedIp, rateVital, type VitalRating } from '@/lib/core/usage/catalog';
import { getExcludedIps } from '@/lib/core/usage/server';
import { getExcludedIpRows, getUsageReport, type UsageReport } from '@/lib/core/usage/queries';
import { excludeMyIpAction, removeExcludedIpAction } from './actions';

export const dynamic = 'force-dynamic';

const DAYS = 30;

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
  diretto: 'Diretto (link, segnalibro, app di messaggi)',
  ricerca: 'Motori di ricerca',
  social: 'Social',
  altro: 'Altri siti',
  interno: 'Navigazione interna',
};

const ERROR_KIND_LABEL: Record<string, string> = {
  offline: 'Senza rete',
  caricamento: 'Caricamento non riuscito',
  applicazione: 'Errore dell’applicazione',
  azione: 'Azione non riuscita',
  rete: 'Richiesta fallita',
};

const RATING_STYLE: Record<VitalRating, string> = {
  good: 'text-emerald-700',
  'needs-improvement': 'text-amber-700',
  poor: 'text-red-700',
};

const METRIC_LABEL: Record<string, string> = {
  LCP: 'Apertura (LCP)',
  INP: 'Risposta ai clic (INP)',
  CLS: 'Stabilità (CLS)',
  TTFB: 'Risposta del server (TTFB)',
  FCP: 'Primo contenuto (FCP)',
};

function formatValue(metric: string, value: number): string {
  if (metric === 'CLS') return value.toFixed(2).replace('.', ',');
  if (value >= 1000) return `${(value / 1000).toFixed(1).replace('.', ',')} s`;
  return `${Math.round(value)} ms`;
}

const fmtDay = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', timeZone: 'Europe/Rome' });

function Card({ title, children, hint }: { title: string; children: React.ReactNode; hint?: string }) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5">
      <h3 className="text-base font-semibold text-gray-900">{title}</h3>
      {hint ? <p className="mt-1 text-sm text-gray-500">{hint}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Num({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-gray-50 px-4 py-3">
      <p className="text-2xl font-semibold tabular-nums text-gray-950">{value}</p>
      <p className="mt-0.5 text-xs text-gray-500">{label}</p>
    </div>
  );
}

/**
 * Utilizzo: chi arriva, cosa fa, quanto ci mette una pagina ad aprirsi e quali
 * errori vede chi usa il sito.
 *
 * Risponde a tre domande concrete: qualcuno ha aperto la demo? È arrivata una
 * persona nuova oltre a quelle che porta Francesco? Ci sono rallentamenti o
 * messaggi d'errore per chi usa la piattaforma? Tutto aggregato: nessun
 * indirizzo IP, e chi sta nell'elenco delle esclusioni non compare mai.
 */
export default async function AdminUsagePage() {
  await requireRole('admin');
  const h = await headers();
  const myIp = clientIpFromHeaders((name) => h.get(name));

  let report: UsageReport | null = null;
  let failed = false;
  try {
    report = await getUsageReport(DAYS);
  } catch (error) {
    console.error('[usage] report non letto', error instanceof Error ? error.message : error);
    failed = true;
  }
  const excludedRows = await getExcludedIpRows().catch(() => []);
  const excluded = await getExcludedIps();
  const iAmExcluded = isExcludedIp(myIp, excluded);

  return (
    <section className="space-y-6 p-4 lg:p-0">
      <SectionHeader
        title="Utilizzo"
        subtitle={`Gli ultimi ${DAYS} giorni: chi arriva, cosa fa e come va il sito per chi lo usa. Nessun indirizzo IP, nessun cookie; le misure di tempi ed errori non portano con sé nessun utente.`}
      />

      <Card
        title="Il tuo traffico non si traccia"
        hint="Se ti connetti da un indirizzo in questo elenco, non lasci nessuna traccia: né visite, né tempi, né eventi. Aggiungi l'indirizzo da cui guardi questa pagina."
      >
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="rounded-lg bg-gray-100 px-3 py-1.5 font-mono text-xs text-gray-700">
            Il tuo indirizzo ora: {myIp ?? 'non rilevabile'}
          </span>
          {iAmExcluded ? (
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
              Escluso: non stai lasciando tracce
            </span>
          ) : (
            <form action={excludeMyIpAction} className="flex flex-wrap items-center gap-2">
              <input
                name="label"
                placeholder="Nome (es. Casa, Ufficio)"
                maxLength={80}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
              />
              <button
                type="submit"
                disabled={!myIp}
                className="inline-flex h-9 items-center rounded-full bg-green-600 px-4 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
              >
                Escludi il mio indirizzo
              </button>
            </form>
          )}
        </div>
        {excludedRows.length > 0 && (
          <ul className="mt-4 divide-y divide-gray-100 rounded-xl border border-gray-200 text-sm">
            {excludedRows.map((row) => (
              <li key={row.id} className="flex items-center justify-between gap-3 px-4 py-2">
                <span>
                  <span className="font-mono text-xs text-gray-700">{row.ip}</span>
                  {row.label ? <span className="ml-2 text-gray-500">{row.label}</span> : null}
                </span>
                <form action={removeExcludedIpAction}>
                  <input type="hidden" name="id" value={row.id} />
                  <button type="submit" className="text-xs text-gray-500 hover:text-gray-900 hover:underline">
                    Rimuovi
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-gray-500">
          Gli indirizzi IPv6 si confrontano per rete, perché cambiano di continuo. Se il tuo operatore ti cambia
          indirizzo, aggiungi quello nuovo.
        </p>
      </Card>

      {failed || !report ? (
        <ErrorBlock
          title="Non riesco a leggere i dati d'uso"
          detail="Se la migrazione 0100 non è ancora stata applicata, mancano le tabelle: finché non lo è, non si registra niente."
          retryHref="/dashboard/admin/utilizzo"
        />
      ) : (
        <Report report={report} />
      )}
    </section>
  );
}

function Report({ report }: { report: UsageReport }) {
  const funnel = FUNNEL_ORDER.map((event) => ({
    event,
    users: report.funnel.find((f) => f.event === event)?.users ?? 0,
  })).filter((f) => f.users > 0);
  const hasAnyData =
    report.visits.perDay.length > 0 ||
    report.demo.total > 0 ||
    report.perfRoutes.length > 0 ||
    report.errors.length > 0 ||
    funnel.length > 0;

  return (
    <>
      {report.trackingSince && (
        <p className="text-sm text-gray-500">
          Dati disponibili dal {formatDateTime(new Date(report.trackingSince))}: prima non si registrava niente.
        </p>
      )}
      {!hasAnyData && (
        <EmptyBlock
          title="Ancora nessun dato"
          detail="Le visite e le misure arrivano da chi apre il sito dopo il rilascio; gli eventi dai gesti degli utenti. Torna fra qualche ora."
        />
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card
          title="La demo"
          hint="Quante volte qualcuno ha aperto la demo da coach o da atleta (il tuo indirizzo escluso)."
        >
          <div className="grid grid-cols-3 gap-3">
            <Num label="aperture totali" value={report.demo.total} />
            {report.demo.byRole.slice(0, 2).map((r) => (
              <Num key={r.role} label={`demo ${r.role === 'coach' ? 'coach' : r.role === 'athlete' ? 'atleta' : r.role}`} value={r.n} />
            ))}
          </div>
          {report.demo.recent.length > 0 ? (
            <ul className="mt-4 divide-y divide-gray-100 text-sm">
              {report.demo.recent.map((r, i) => (
                <li key={`${r.at}-${i}`} className="flex justify-between gap-3 py-1.5">
                  <span>
                    Demo {r.role === 'coach' ? 'coach' : r.role === 'athlete' ? 'atleta' : r.role}
                    {r.device ? <span className="text-gray-400"> · {r.device === 'mobile' ? 'telefono' : r.device === 'tablet' ? 'tablet' : 'computer'}</span> : null}
                  </span>
                  <span className="text-gray-500">{formatDateTime(new Date(r.at))}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-gray-500">Nessuna apertura registrata.</p>
          )}
        </Card>

        <Card
          title="Persone nuove"
          hint="Gli iscritti più recenti (esclusi demo e amministratori) e i visitatori diversi del sito pubblico."
        >
          <div className="grid grid-cols-2 gap-3">
            <Num label={`visitatori diversi (${DAYS} giorni)`} value={report.visits.totalUniques} />
            <Num label="iscritti elencati sotto" value={report.newUsers.length} />
          </div>
          <ul className="mt-4 divide-y divide-gray-100 text-sm">
            {report.newUsers.map((u) => (
              <li key={u.id} className="flex justify-between gap-3 py-1.5">
                <span>
                  {u.roles}
                  {u.source === 'registrato' ? (
                    <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">dopo il tracciamento</span>
                  ) : null}
                </span>
                <span className="text-gray-500">{formatDateTime(new Date(u.createdAt))}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-gray-500">
            Il visitatore diverso si stima con un'impronta che cambia ogni giorno: la stessa persona che torna il
            giorno dopo conta di nuovo.
          </p>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Visite al sito pubblico" hint="Pagine viste e visitatori diversi per giorno.">
          {report.visits.perDay.length === 0 ? (
            <p className="text-sm text-gray-500">Nessuna visita registrata.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-gray-500">
                <tr>
                  <th className="py-1 font-medium">Giorno</th>
                  <th className="py-1 text-right font-medium">Visite</th>
                  <th className="py-1 text-right font-medium">Visitatori</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {report.visits.perDay.map((d) => (
                  <tr key={d.day}>
                    <td className="py-1.5">{fmtDay(d.day)}</td>
                    <td className="py-1.5 text-right tabular-nums">{d.views}</td>
                    <td className="py-1.5 text-right tabular-nums">{d.uniques}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card title="Da dove arrivano" hint="La categoria di provenienza, mai l'indirizzo.">
          {report.visits.byReferrer.length === 0 ? (
            <p className="text-sm text-gray-500">Nessuna visita registrata.</p>
          ) : (
            <ul className="divide-y divide-gray-100 text-sm">
              {report.visits.byReferrer.map((r) => (
                <li key={r.kind} className="flex justify-between gap-3 py-1.5">
                  <span>{REFERRER_LABEL[r.kind] ?? r.kind}</span>
                  <span className="tabular-nums text-gray-600">
                    {r.uniques} visitatori · {r.views} visite
                  </span>
                </li>
              ))}
            </ul>
          )}
          {report.visits.topRoutes.length > 0 && (
            <>
              <h4 className="mt-5 text-sm font-semibold text-gray-900">Le pagine più visitate</h4>
              <ul className="mt-2 divide-y divide-gray-100 text-sm">
                {report.visits.topRoutes.map((r) => (
                  <li key={r.route} className="flex justify-between gap-3 py-1.5">
                    <span className="font-mono text-xs">{r.route}</span>
                    <span className="tabular-nums text-gray-600">{r.views}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Il percorso" hint="Persone diverse che hanno fatto ogni passo negli ultimi 30 giorni (dal tracciamento in poi).">
          {funnel.length === 0 ? (
            <p className="text-sm text-gray-500">Ancora nessun passo registrato.</p>
          ) : (
            <ul className="divide-y divide-gray-100 text-sm">
              {funnel.map((f) => (
                <li key={f.event} className="flex justify-between gap-3 py-1.5">
                  <span>{FUNNEL_LABEL[f.event]}</span>
                  <span className="tabular-nums font-medium">{f.users}</span>
                </li>
              ))}
            </ul>
          )}
          {report.activeUsers.length > 0 && (
            <p className="mt-3 text-xs text-gray-500">
              Utenti attivi:{' '}
              {report.activeUsers.map((a) => `${a.users} (${a.role})`).join(', ')}.
            </p>
          )}
        </Card>

        <Card title="Prenotazioni" hint="Cosa è successo alle richieste di seduta negli ultimi 30 giorni.">
          {report.bookings.length === 0 ? (
            <p className="text-sm text-gray-500">Nessuna richiesta registrata.</p>
          ) : (
            <ul className="divide-y divide-gray-100 text-sm">
              {Object.keys(BOOKING_LABEL).map((event) => (
                <li key={event} className="flex justify-between gap-3 py-1.5">
                  <span>{BOOKING_LABEL[event]}</span>
                  <span className="tabular-nums font-medium">
                    {report.bookings.find((b) => b.event === event)?.n ?? 0}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {report.joinDenied.length > 0 && (
            <p className="mt-3 text-xs text-gray-500">
              Ingressi in seduta negati:{' '}
              {report.joinDenied.map((d) => `${d.n} per «${d.reason}»`).join(', ')}.
            </p>
          )}
        </Card>
      </div>

      <Card
        title="Quanto ci mette una pagina ad aprirsi"
        hint="Il valore tipico (mediana) e quello di chi sta peggio (95°). Verde, giallo e rosso seguono le soglie di Google. Con poche misure i valori sono rumorosi: guarda anche il numero."
      >
        {report.perfRoutes.length === 0 ? (
          <p className="text-sm text-gray-500">Ancora nessuna misura: arrivano da chi apre il sito dopo il rilascio.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-gray-500">
                <tr>
                  <th className="py-1 font-medium">Pagina</th>
                  <th className="py-1 font-medium">Misura</th>
                  <th className="py-1 text-right font-medium">Misure</th>
                  <th className="py-1 text-right font-medium">Tipico</th>
                  <th className="py-1 text-right font-medium">Il 75% sta sotto</th>
                  <th className="py-1 text-right font-medium">Peggiori</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {report.perfRoutes.map((p) => {
                  const rating = rateVital(p.metric, p.p75);
                  return (
                    <tr key={`${p.route}-${p.metric}`}>
                      <td className="py-1.5 font-mono text-xs">{p.route}</td>
                      <td className="py-1.5">{METRIC_LABEL[p.metric] ?? p.metric.replace('ready:', 'Pronto: ')}</td>
                      <td className="py-1.5 text-right tabular-nums">{p.n}</td>
                      <td className="py-1.5 text-right tabular-nums">{formatValue(p.metric, p.p50)}</td>
                      <td className={`py-1.5 text-right tabular-nums font-medium ${rating ? RATING_STYLE[rating] : ''}`}>
                        {formatValue(p.metric, p.p75)}
                      </td>
                      <td className="py-1.5 text-right tabular-nums">{formatValue(p.metric, p.p95)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card
        title="Errori visti da chi usa il sito"
        hint="Le schermate d'errore mostrate all'utente. Il codice è il nome dell'errore; l'identificativo (digest) si cerca nei log di Vercel."
      >
        {report.errors.length === 0 ? (
          <p className="text-sm text-gray-500">Nessun errore registrato.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-gray-500">
                <tr>
                  <th className="py-1 font-medium">Tipo</th>
                  <th className="py-1 font-medium">Codice</th>
                  <th className="py-1 font-medium">Pagina</th>
                  <th className="py-1 text-right font-medium">Volte</th>
                  <th className="py-1 text-right font-medium">Ultima</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {report.errors.map((e, i) => (
                  <tr key={`${e.kind}-${e.code}-${e.route}-${i}`}>
                    <td className="py-1.5">{ERROR_KIND_LABEL[e.kind] ?? e.kind}</td>
                    <td className="py-1.5 font-mono text-xs">{e.code ?? '—'}</td>
                    <td className="py-1.5 font-mono text-xs">{e.route}</td>
                    <td className="py-1.5 text-right tabular-nums">{e.n}</td>
                    <td className="py-1.5 text-right text-gray-500">{formatDateTime(new Date(e.lastAt))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
