import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Ban, Lock, RotateCcw } from 'lucide-react';
import { requireRole } from '@/lib/core/auth';
import { getAiSessionDetail } from '@/lib/core/admin/ai-console';
import {
  PIPELINE_PHASE_LABEL,
  PIPELINE_STATE_LABEL,
  STUCK_RULE,
} from '@/lib/core/admin/ai-console-policy';
import { formatEur } from '@/lib/core/admin/ai-cost';
import { formatDateTime } from '@/lib/core/format';
import { ActionForm } from '@/components/action-form';
import { Button } from '@/components/ui/button';
import { retryAiSessionAction } from '../actions';

export const dynamic = 'force-dynamic';

/**
 * Il dettaglio di una seduta della pipeline.
 *
 * L'ordine è quello dell'ispezione, non quello del modello dati, ed è il
 * medesimo che la skill `ai-session-notes` prescrive a chi indaga a mano:
 * **prima il registro di audit** — che è dove sta la verità quando la riga
 * del job e quella della seduta dicono cose diverse — poi i job, poi le
 * registrazioni. Chi apre questa pagina sta cercando la causa; il modello
 * dati non è la causa.
 *
 * Nessun contenuto: identificativi, tempi, stati, codici e i messaggi già
 * ripuliti dei fornitori. Il messaggio di un egress fallito è testo di
 * infrastruttura — nessun contenuto di seduta, nessun segreto — ed è la
 * differenza fra leggere la causa e indovinarla: per questo c'è.
 */
export default async function AiSessionDetailPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  await requireRole('admin');
  const { sessionId } = await params;
  const detail = await getAiSessionDetail(Number(sessionId));
  if (!detail) notFound();

  const { row, jobs, recordings, audit, retry } = detail;

  return (
    <section className="p-4 lg:p-0">
      <Link
        href="/dashboard/admin/ai"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Torna alla console
      </Link>

      <header className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-gray-950">
            Seduta AI #{row.sessionId}
          </h1>
          <p className="mt-1 text-sm text-gray-600">
            Prenotazione {row.bookingId} · coach {row.coachName} · atleta{' '}
            <span className="font-medium">#{row.athleteUserId}</span> (resta un
            identificativo: da qui non si leggono le persone)
          </p>
          <p className="mt-1 text-xs text-gray-500">
            Riferimento tecnico:{' '}
            <code className="rounded bg-gray-100 px-1.5 py-0.5">
              {detail.correlationId}
            </code>
          </p>
        </div>

        <div className="flex flex-col items-end gap-2">
          <span className="inline-flex rounded-full bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white">
            {PIPELINE_STATE_LABEL[row.classification.state]} ·{' '}
            {PIPELINE_PHASE_LABEL[row.classification.phase]}
          </span>
          {retry.allowed ? (
            <ActionForm
              action={retryAiSessionAction}
              confirmMessage={`Riportare la seduta #${row.sessionId} in lavorazione e rimettere in coda il riepilogo? L'operazione è idempotente e viene registrata nel log amministrativo.`}
              confirmTitle="Riprendi la seduta"
              confirmActionLabel="Riprendi"
            >
              <input type="hidden" name="sessionId" value={row.sessionId} />
              <Button type="submit" className="rounded-full">
                <RotateCcw className="mr-1.5 h-4 w-4" aria-hidden="true" />
                Riprendi la seduta
              </Button>
            </ActionForm>
          ) : (
            <div className="max-w-xs text-right">
              <Button
                type="button"
                disabled
                variant="outline"
                className="rounded-full"
              >
                <Lock className="mr-1.5 h-4 w-4" aria-hidden="true" />
                Ripresa non disponibile
              </Button>
              <p className="mt-1 text-[11px] leading-4 text-gray-500">
                {retry.reason}
              </p>
            </div>
          )}
        </div>
      </header>

      {row.classification.stuck ? (
        <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-semibold text-red-900">
            Questa seduta ha superato la scadenza della pipeline
          </p>
          <p className="mt-1 text-sm text-red-800">
            {row.classification.stuckReason === 'no_active_work'
              ? `Nessun lavoro vivo e nessun progresso da oltre ${STUCK_RULE.senzaLavoroAttivoMinuti} minuti: nessuno la farà avanzare da solo.`
              : `Lavoro ancora in corso ma fermo da oltre ${STUCK_RULE.conLavoroAttivoMinuti} minuti: la risposta del fornitore probabilmente non arriverà.`}
          </p>
        </div>
      ) : null}

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Fact label="Stato database" value={row.status} mono />
        <Fact label="Codice errore" value={row.errorCode ?? '—'} mono />
        <Fact
          label="Audio archiviato"
          value={
            row.audioSeconds > 0
              ? `${Math.round(row.audioSeconds / 60)}′ (${row.audioSeconds}s)`
              : 'nessuno'
          }
        />
        <Fact
          label="Segmenti trascritti"
          value={String(row.transcriptSegments)}
        />
        <Fact label="Provider" value={row.provider ?? '—'} />
        <Fact label="Modello" value={row.model ?? '—'} mono />
        <Fact label="Versione prompt" value={row.promptVersion ?? '—'} mono />
        <Fact
          label="Costo stimato"
          value={row.costEur === null ? 'non configurato' : formatEur(row.costEur)}
        />
      </div>

      {/* 1 — Il registro di audit: è dove sta la verità quando la riga del job
          e quella della seduta dicono cose diverse. */}
      <Block
        title="Cronologia delle fasi"
        subtitle="Dal registro di audit della seduta. È la prima cosa da leggere: il codice vero del fallimento sta qui, non sulla riga della seduta."
      >
        {audit.length === 0 ? (
          <Empty>Nessun evento registrato per questa seduta.</Empty>
        ) : (
          <ol className="relative ml-2 border-l border-gray-200">
            {audit.map((event, index) => (
              <li key={index} className="ml-4 py-2.5">
                <span
                  className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full bg-gray-300"
                  aria-hidden="true"
                />
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <code className="text-xs font-semibold text-gray-900">
                    {event.eventType}
                  </code>
                  <span className="text-xs text-gray-500">
                    {formatDateTime(event.at)}
                  </span>
                  {event.previousStatus || event.newStatus ? (
                    <span className="text-xs text-gray-600">
                      {event.previousStatus ?? '—'} → {event.newStatus ?? '—'}
                    </span>
                  ) : null}
                </div>
                {Object.keys(event.metadata).length > 0 ? (
                  <p className="mt-0.5 break-words text-[11px] leading-4 text-gray-500">
                    {Object.entries(event.metadata)
                      .map(([key, value]) => `${key}: ${String(value)}`)
                      .join(' · ')}
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </Block>

      {/* 2 — I job: tentativi, tempi, quale passo. */}
      <Block
        title="Lavori di elaborazione"
        subtitle="Tentativi, tempi e passo. Un job pronto con zero tentativi non è lento: non l’ha ancora guardato nessuno."
      >
        {jobs.length === 0 ? (
          <Empty>
            Nessun lavoro accodato per questa seduta. In stato «in
            lavorazione» è la firma esatta di una seduta che nessuno farà
            avanzare.
          </Empty>
        ) : (
          <Table
            head={[
              'ID',
              'Tipo',
              'Stato',
              'Provider',
              'Tentativi',
              'Disponibile da',
              'Avviato',
              'Concluso',
              'Preso da',
              'Errore',
            ]}
          >
            {jobs.map((job) => (
              <tr key={job.id}>
                <Td>{job.id}</Td>
                <Td mono>{job.jobType}</Td>
                <Td mono>{job.status}</Td>
                <Td>{job.provider}</Td>
                <Td>
                  {job.attemptCount}/{job.maxAttempts}
                </Td>
                <Td>{job.availableAfter ? formatDateTime(job.availableAfter) : '—'}</Td>
                <Td>{job.startedAt ? formatDateTime(job.startedAt) : '—'}</Td>
                <Td>{job.completedAt ? formatDateTime(job.completedAt) : '—'}</Td>
                <Td mono>{job.lockedBy ?? '—'}</Td>
                <Td>
                  {job.errorCode ? (
                    <>
                      <code className="rounded bg-red-50 px-1.5 py-0.5 text-[11px] font-semibold text-red-700">
                        {job.errorCode}
                      </code>
                      {job.errorMessage ? (
                        <p className="mt-0.5 max-w-xs break-words text-[11px] text-gray-500">
                          {job.errorMessage}
                        </p>
                      ) : null}
                    </>
                  ) : (
                    '—'
                  )}
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Block>

      {/* 3 — Le registrazioni: dimensioni ed errori per traccia. */}
      <Block
        title="Registrazioni audio"
        subtitle="Una riga per traccia e segmento. Il messaggio del fornitore è testo di infrastruttura: nessun contenuto di seduta, ed è la differenza fra leggere la causa e indovinarla."
      >
        {recordings.length === 0 ? (
          <Empty>
            Nessuna registrazione. Senza audio non c’è trascrizione: la causa è
            a monte della pipeline.
          </Empty>
        ) : (
          <Table
            head={[
              'ID',
              'Voce',
              'Segm.',
              'Stato',
              'Durata',
              'Dimensione',
              'Egress',
              'Errore',
            ]}
          >
            {recordings.map((recording) => (
              <tr key={recording.id}>
                <Td>{recording.id}</Td>
                <Td>{recording.role}</Td>
                <Td>{recording.segment}</Td>
                <Td mono>{recording.status}</Td>
                <Td>
                  {recording.durationSeconds === null
                    ? '—'
                    : `${Math.round(recording.durationSeconds / 60)}′`}
                </Td>
                <Td>
                  {recording.sizeBytes === null
                    ? '—'
                    : `${(recording.sizeBytes / 1_048_576).toFixed(1)} MB`}
                </Td>
                <Td mono>{recording.egressId ?? '—'}</Td>
                <Td>
                  {recording.errorCode ? (
                    <>
                      <code className="rounded bg-red-50 px-1.5 py-0.5 text-[11px] font-semibold text-red-700">
                        {recording.errorCode}
                      </code>
                      {recording.errorMessage ? (
                        <p className="mt-0.5 max-w-xs break-words text-[11px] text-gray-500">
                          {recording.errorMessage}
                        </p>
                      ) : null}
                    </>
                  ) : (
                    '—'
                  )}
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Block>

      <div className="mt-6 flex items-start gap-2.5 rounded-2xl border border-gray-200 bg-gray-50 p-4">
        <Ban className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
        <p className="text-xs leading-5 text-gray-600">
          <span className="font-semibold text-gray-800">
            Cosa non è possibile da qui, e perché.
          </span>{' '}
          Non si annulla una seduta in lavorazione: la macchina a stati non
          ammette <code>processing → cancelled</code>, e un pulsante che
          scrivesse quello stato a mano creerebbe una transizione che nessuno
          ha progettato. Una seduta ferma viene chiusa dalla scadenza, oppure
          ripresa con il pulsante qui sopra. Non si leggono trascrizione,
          riepilogo, note o audio: per quelli esiste il percorso autorizzato
          del coach sulla propria seduta, e questa console non lo scavalca.
        </p>
      </div>
    </section>
  );
}

function Block({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-6">
      <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
      <p className="mt-0.5 max-w-3xl text-sm text-gray-600">{subtitle}</p>
      <div className="mt-3 rounded-2xl border border-gray-200 bg-white p-4">
        {children}
      </div>
    </div>
  );
}

function Table({
  head,
  children,
}: {
  head: string[];
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[900px] text-left text-sm">
        <thead className="text-xs uppercase tracking-wide text-gray-500">
          <tr>
            {head.map((label) => (
              <th key={label} scope="col" className="pb-2 pr-4 font-semibold">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">{children}</tbody>
      </table>
    </div>
  );
}

function Td({
  children,
  mono = false,
}: {
  children: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <td
      className={`py-2.5 pr-4 align-top text-gray-700 ${
        mono ? 'font-mono text-xs' : ''
      }`}
    >
      {children}
    </td>
  );
}

function Fact({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-3.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
        {label}
      </p>
      <p
        className={`mt-1 break-words text-sm font-medium text-gray-900 ${
          mono ? 'font-mono text-xs' : ''
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-gray-500">{children}</p>;
}
