import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import type { AiConsoleRow } from '@/lib/core/admin/ai-console';
import {
  AI_CONSOLE_PAGE_SIZE,
  AI_CONSOLE_PHASES,
  AI_CONSOLE_STATES,
  PIPELINE_PHASE_LABEL,
  PIPELINE_STATE_LABEL,
  STUCK_RULE,
  aiConsolePageCount,
  aiConsoleQueryString,
  type AiConsoleFilters,
  type PipelineState,
} from '@/lib/core/admin/ai-console-policy';
import { formatEur } from '@/lib/core/admin/ai-cost';
import { formatDateTime } from '@/lib/core/format';
import { EmptyBlock } from '@/components/admin/control-room';

/**
 * La tabella operativa della pipeline.
 *
 * **Nessun contenuto di seduta.** Le colonne sono identificativi, tempi,
 * stati, codici e conteggi: il coach compare con il nome perché è un
 * professionista sulla propria seduta, l'atleta resta un numero. Chi ha
 * bisogno di leggere una trascrizione non lo fa da qui.
 *
 * La paginazione è del server: `LIMIT`/`OFFSET` nella query, e i filtri
 * viaggiano nell'indirizzo. Una tabella che carica tutto e filtra nel
 * browser funziona benissimo con quaranta righe ed è ingestibile con
 * quarantamila — che è il punto in cui questa console comincia a servire.
 */

const STATE_STYLE: Record<PipelineState, string> = {
  completato: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  in_corso: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
  in_coda: 'bg-sky-50 text-sky-700 ring-sky-200',
  in_seduta: 'bg-violet-50 text-violet-700 ring-violet-200',
  bloccato: 'bg-red-50 text-red-700 ring-red-200',
  fallito: 'bg-red-50 text-red-700 ring-red-200',
  rifiutato: 'bg-gray-100 text-gray-600 ring-gray-200',
  annullato: 'bg-gray-100 text-gray-600 ring-gray-200',
};

function minutesLabel(seconds: number | null): string {
  if (seconds === null) return '—';
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest === 0 ? `${minutes}′` : `${minutes}′ ${rest}s`;
}

export function AiConsoleFiltersForm({
  filters,
  coaches,
  errorCodes,
  periodKey,
}: {
  filters: AiConsoleFilters;
  coaches: { providerId: number; name: string }[];
  errorCodes: { code: string; count: number }[];
  periodKey: string;
}) {
  return (
    <form
      method="get"
      action="/dashboard/admin/ai"
      className="mt-4 rounded-2xl border border-gray-200 bg-white p-3"
    >
      {/* Il periodo resta quello scelto in alto: un filtro non lo azzera. */}
      <input type="hidden" name="periodo" value={periodKey} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <Field label="Stato">
          <select name="stato" defaultValue={filters.stato ?? ''} className={selectClass}>
            <option value="">Tutti</option>
            {AI_CONSOLE_STATES.map((state) => (
              <option key={state} value={state}>
                {PIPELINE_STATE_LABEL[state]}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Fase">
          <select name="fase" defaultValue={filters.fase ?? ''} className={selectClass}>
            <option value="">Tutte</option>
            {AI_CONSOLE_PHASES.map((phase) => (
              <option key={phase} value={phase}>
                {PIPELINE_PHASE_LABEL[phase]}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Coach">
          <select
            name="coach"
            defaultValue={filters.coachProviderId ?? ''}
            className={selectClass}
          >
            <option value="">Tutti</option>
            {coaches.map((coach) => (
              <option key={coach.providerId} value={coach.providerId}>
                {coach.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Errore">
          <select
            name="errore"
            defaultValue={filters.errore ?? ''}
            className={selectClass}
          >
            <option value="">Tutti</option>
            {errorCodes.map((error) => (
              <option key={error.code} value={error.code}>
                {error.code} ({error.count})
              </option>
            ))}
          </select>
        </Field>

        <Field label="Dal giorno">
          <input
            type="date"
            name="da"
            defaultValue={filters.da ?? ''}
            className={selectClass}
          />
        </Field>

        <Field label="Al giorno">
          <input
            type="date"
            name="a"
            defaultValue={filters.a ?? ''}
            className={selectClass}
          />
        </Field>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="submit"
          className="rounded-full bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800"
        >
          Applica
        </button>
        <Link
          href={`/dashboard/admin/ai?periodo=${periodKey}`}
          className="rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Azzera
        </Link>
        <Link
          href={`/dashboard/admin/ai?periodo=${periodKey}&stato=bloccato`}
          className="rounded-full border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100"
        >
          Solo le bloccate
        </Link>
        <span className="text-xs text-gray-500">
          «Bloccata» = nessun progresso da {STUCK_RULE.senzaLavoroAttivoMinuti}{' '}
          minuti senza lavoro vivo, o da {STUCK_RULE.conLavoroAttivoMinuti} con
          lavoro in corso. È la stessa soglia con cui la pipeline chiude
          d’ufficio una seduta scaduta.
        </span>
      </div>
    </form>
  );
}

const selectClass =
  'h-9 w-full rounded-lg border border-gray-200 bg-white px-2.5 text-sm text-gray-900 outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100';

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block min-w-0">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
        {label}
      </span>
      <span className="mt-1 block">{children}</span>
    </label>
  );
}

export function AiConsoleTable({
  rows,
  total,
  filters,
  costConfigured,
  periodKey,
}: {
  rows: AiConsoleRow[];
  total: number;
  filters: AiConsoleFilters;
  costConfigured: boolean;
  periodKey: string;
}) {
  if (rows.length === 0) {
    return (
      <EmptyBlock
        title="Nessuna seduta con questi filtri"
        detail={
          filters.stato || filters.fase || filters.coachProviderId || filters.errore
            ? 'I filtri applicati non trovano nulla nel periodo scelto. Azzerali per vedere tutte le sedute della finestra.'
            : 'Nel periodo scelto la funzione Appunti AI non è stata avviata su nessuna seduta. Non è un errore.'
        }
      />
    );
  }

  const pages = aiConsolePageCount(total);
  const first = (filters.page - 1) * AI_CONSOLE_PAGE_SIZE + 1;
  const last = Math.min(filters.page * AI_CONSOLE_PAGE_SIZE, total);

  return (
    <div>
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1180px] text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th scope="col" className="px-3 py-3">Seduta</th>
                <th scope="col" className="px-3 py-3">Data</th>
                <th scope="col" className="px-3 py-3">Coach</th>
                <th scope="col" className="px-3 py-3">Audio</th>
                <th scope="col" className="px-3 py-3">Stato</th>
                <th scope="col" className="px-3 py-3">Fase</th>
                <th scope="col" className="px-3 py-3">Provider · modello</th>
                <th scope="col" className="px-3 py-3" title="Tentativi sommati su tutti i job della seduta">
                  Tent.
                </th>
                <th scope="col" className="px-3 py-3">Elaborazione</th>
                {costConfigured ? (
                  <th scope="col" className="px-3 py-3">Costo stimato</th>
                ) : null}
                <th scope="col" className="px-3 py-3">Errore</th>
                <th scope="col" className="px-3 py-3">Aggiornata</th>
                <th scope="col" className="px-3 py-3 text-right">Azioni</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((row) => (
                <tr key={row.sessionId} className="align-top hover:bg-gray-50/60">
                  <td className="px-3 py-3">
                    <Link
                      href={`/dashboard/admin/ai/${row.sessionId}`}
                      className="font-semibold text-gray-950 hover:text-red-600"
                    >
                      #{row.sessionId}
                    </Link>
                    <p className="text-[11px] text-gray-500">
                      prenotazione {row.bookingId} · atleta {row.athleteUserId}
                    </p>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-gray-700">
                    {row.scheduledFor
                      ? formatDateTime(row.scheduledFor)
                      : row.startedAt
                        ? formatDateTime(row.startedAt)
                        : '—'}
                  </td>
                  <td className="px-3 py-3 text-gray-800">{row.coachName}</td>
                  <td className="whitespace-nowrap px-3 py-3 tabular-nums text-gray-700">
                    {row.audioSeconds > 0
                      ? minutesLabel(row.audioSeconds)
                      : '—'}
                    <p className="text-[11px] text-gray-500">
                      {row.transcriptSegments} segm.
                    </p>
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${STATE_STYLE[row.classification.state]}`}
                    >
                      {PIPELINE_STATE_LABEL[row.classification.state]}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-gray-700">
                    {PIPELINE_PHASE_LABEL[row.classification.phase]}
                  </td>
                  <td className="px-3 py-3 text-gray-600">
                    {row.provider ?? '—'}
                    {row.model ? (
                      <p className="text-[11px] text-gray-500">{row.model}</p>
                    ) : null}
                    {row.promptVersion ? (
                      <p className="text-[11px] text-gray-400">
                        prompt {row.promptVersion}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-3 py-3 tabular-nums text-gray-700">
                    {row.attempts}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 tabular-nums text-gray-700">
                    {minutesLabel(row.processingSeconds)}
                  </td>
                  {costConfigured ? (
                    <td className="whitespace-nowrap px-3 py-3 tabular-nums text-gray-700">
                      {formatEur(row.costEur)}
                    </td>
                  ) : null}
                  <td className="px-3 py-3">
                    {row.errorCode ? (
                      <code className="rounded bg-red-50 px-1.5 py-0.5 text-[11px] font-semibold text-red-700">
                        {row.errorCode}
                      </code>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-gray-600">
                    {formatDateTime(row.updatedAt)}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <Link
                      href={`/dashboard/admin/ai/${row.sessionId}`}
                      className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-800 hover:bg-gray-50"
                    >
                      Dettaglio
                      <ArrowRight className="h-3 w-3" aria-hidden="true" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-gray-500">
          {first}–{last} di {total} · pagina {filters.page} di {pages}
        </p>
        <div className="flex gap-2">
          <PageLink
            filters={filters}
            periodKey={periodKey}
            page={filters.page - 1}
            disabled={filters.page <= 1}
            label="Precedente"
          />
          <PageLink
            filters={filters}
            periodKey={periodKey}
            page={filters.page + 1}
            disabled={filters.page >= pages}
            label="Successiva"
          />
        </div>
      </div>
    </div>
  );
}

function PageLink({
  filters,
  periodKey,
  page,
  disabled,
  label,
}: {
  filters: AiConsoleFilters;
  periodKey: string;
  page: number;
  disabled: boolean;
  label: string;
}) {
  if (disabled) {
    return (
      <span className="rounded-full border border-gray-200 bg-gray-50 px-3.5 py-1.5 text-sm font-medium text-gray-400">
        {label}
      </span>
    );
  }
  return (
    <Link
      href={`/dashboard/admin/ai${aiConsoleQueryString(filters, { page })}${
        aiConsoleQueryString(filters, { page }) ? '&' : '?'
      }periodo=${periodKey}`}
      className="rounded-full border border-gray-300 bg-white px-3.5 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
    >
      {label}
    </Link>
  );
}
