import { AlertTriangle, CheckCircle2, PlayCircle } from 'lucide-react';
import { ActionForm } from '@/components/action-form';
import { Button } from '@/components/ui/button';
import {
  STUCK_JOB_MINUTES,
  type AiPipelineHealth,
} from '@/lib/core/ai-session-notes/queue-health';
import {
  probeCallbackAction,
  runAiNotesWorkerAction,
} from '@/app/(dashboard)/dashboard/admin/ai-notes/actions';

function Counts({
  title,
  counts,
  empty = 'nessuno',
}: {
  title: string;
  counts: { label: string; count: number }[];
  empty?: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
        {title}
      </h3>
      {counts.length === 0 ? (
        <p className="mt-2 text-sm text-gray-400">{empty}</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-1">
          {counts.map((row) => (
            <li
              key={row.label}
              className="flex items-baseline justify-between gap-3 text-sm"
            >
              <span className="text-gray-600">{row.label}</span>
              <span className="font-semibold text-gray-900">{row.count}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function when(value: Date | null): string {
  return value ? value.toLocaleString('it-IT', { timeZone: 'Europe/Rome' }) : 'mai';
}

/**
 * Stato della pipeline Appunti AI, per l'amministratore.
 *
 * Mostra solo aggregati e stati tecnici: nessuna trascrizione, nessun contenuto
 * di sessione, nessun nome. Serve a rispondere a una domanda sola — la
 * meccanica sta girando? — che finora richiedeva di interrogare il database a
 * mano.
 */
export function AiPipelineHealthPanel({
  health,
}: {
  health: AiPipelineHealth;
}) {
  const providerReady =
    health.sttProvider === 'deepgram' && health.sttApiKeyConfigured;
  const hasStuck = health.stuckJobs.length > 0;
  const hasOrphans = health.orphanSessions > 0;

  return (
    <section className="mt-8" aria-labelledby="ai-pipeline-health">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2
            id="ai-pipeline-health"
            className="text-lg font-semibold text-gray-900"
          >
            Stato della pipeline
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-gray-600">
            Registrazione, coda, trascrizione e report. Solo conteggi tecnici:
            nessun contenuto delle sessioni compare qui.
          </p>
        </div>

        <ActionForm action={runAiNotesWorkerAction}>
          <Button type="submit" className="rounded-full">
            <PlayCircle className="mr-2 h-4 w-4" />
            Esegui il worker adesso
          </Button>
        </ActionForm>
      </div>

      {/* Configurazione del provider: la causa più banale di una coda ferma. */}
      <div
        className={`mt-4 flex items-start gap-2 rounded-xl border p-3 text-sm ${
          providerReady
            ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
            : 'border-amber-200 bg-amber-50 text-amber-900'
        }`}
      >
        {providerReady ? (
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
        ) : (
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        )}
        <p>
          Provider trascrizione: <strong>{health.sttProvider}</strong>
          {health.sttProvider === 'deepgram' &&
            (health.sttApiKeyConfigured
              ? ', chiave configurata'
              : ', chiave MANCANTE')}
          {health.sttProvider === 'disabled' &&
            ' — nessuna trascrizione verrà prodotta finché resta così.'}
        </p>
      </div>

      {/* L'indirizzo a cui il provider deve richiamarci. Un valore sbagliato
          qui non si vedeva da nessuna parte finche' non era una seduta vera a
          scoprirlo — ed e' esattamente com'e' andata. */}
      <div
        className={`mt-3 flex items-start gap-2 rounded-xl border p-3 text-sm ${
          health.callbackConfigured
            ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
            : 'border-amber-200 bg-amber-50 text-amber-900'
        }`}
      >
        {health.callbackConfigured ? (
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
        ) : (
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        )}
        <p className="flex-1">
          Indirizzo di callback:{' '}
          <strong>{health.callbackOrigin ?? 'non configurato'}</strong>
          {health.callbackConfigured
            ? ' — sembra valido. Provalo per esserne certo.'
            : ' — deve essere un indirizzo https pubblico, altrimenti le sedute lunghe non verranno mai trascritte.'}
        </p>
        {/* La forma dell'indirizzo non basta: solo bussando si scopre se una
            protezione o un redirect lo rendono irraggiungibile. */}
        <ActionForm action={probeCallbackAction}>
          <Button type="submit" variant="outline" size="sm" className="rounded-full">
            Prova la callback
          </Button>
        </ActionForm>
      </div>

      {/* Il numero che deve valere zero. */}
      <div
        className={`mt-3 flex items-start gap-2 rounded-xl border p-3 text-sm ${
          health.expiredSessions === 0
            ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
            : 'border-red-200 bg-red-50 text-red-900'
        }`}
      >
        {health.expiredSessions === 0 ? (
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
        ) : (
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        )}
        <p>
          {health.expiredSessions === 0
            ? 'Nessuna sessione oltre la propria scadenza.'
            : `${health.expiredSessions} ${
                health.expiredSessions === 1
                  ? 'sessione oltre la propria scadenza'
                  : 'sessioni oltre la propria scadenza'
              }: c’e’ un coach che sta guardando una rotellina.`}
        </p>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Counts title="Job in coda" counts={health.jobsByStatus} />
        <Counts title="Sessioni" counts={health.sessionsByStatus} />
        <Counts title="Registrazioni" counts={health.recordingsByStatus} />
        <Counts title="Report" counts={health.reportsByStatus} />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Trascrizioni prodotte
          </h3>
          <p className="mt-2 text-2xl font-semibold text-gray-900">
            {health.transcriptSegments}
          </p>
          <p className="text-xs text-gray-500">
            segmenti su {health.transcribedSessions}{' '}
            {health.transcribedSessions === 1 ? 'sessione' : 'sessioni'}
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Ultimo segmento
          </h3>
          <p className="mt-2 text-sm font-medium text-gray-900">
            {when(health.lastSegmentAt)}
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Ultimo report
          </h3>
          <p className="mt-2 text-sm font-medium text-gray-900">
            {when(health.lastReportAt)}
          </p>
        </div>
      </div>

      {(hasStuck || hasOrphans) && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-center gap-2 text-amber-900">
            <AlertTriangle className="h-4 w-4" />
            <h3 className="text-sm font-semibold">Da guardare</h3>
          </div>

          {hasOrphans && (
            <p className="mt-2 text-sm text-amber-900">
              {health.orphanSessions}{' '}
              {health.orphanSessions === 1
                ? 'sessione è rimasta'
                : 'sessioni sono rimaste'}{' '}
              in stato <code>active</code> da ore: la stanza si è chiusa senza
              che la sessione venisse terminata.
            </p>
          )}

          {hasStuck && (
            <>
              <p className="mt-2 text-sm text-amber-900">
                Job fermi da più di {STUCK_JOB_MINUTES} minuti. Un{' '}
                <code>attempt_count</code> a zero significa che il worker non li
                ha mai presi in carico.
              </p>
              <div className="mt-3 overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead className="text-left uppercase tracking-wide text-amber-800">
                    <tr>
                      <th className="py-1 pr-4">Job</th>
                      <th className="py-1 pr-4">Tipo</th>
                      <th className="py-1 pr-4">Stato</th>
                      <th className="py-1 pr-4">Tentativi</th>
                      <th className="py-1 pr-4">In coda dal</th>
                      <th className="py-1">Errore</th>
                    </tr>
                  </thead>
                  <tbody className="text-amber-900">
                    {health.stuckJobs.map((job) => (
                      <tr key={job.id}>
                        <td className="py-1 pr-4">#{job.id}</td>
                        <td className="py-1 pr-4">{job.jobType}</td>
                        <td className="py-1 pr-4">{job.status}</td>
                        <td className="py-1 pr-4">
                          {job.attemptCount} / {job.maxAttempts}
                        </td>
                        <td className="py-1 pr-4">{when(job.createdAt)}</td>
                        <td className="py-1">{job.errorCode ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
