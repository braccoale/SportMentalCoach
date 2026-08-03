import { CalendarClock, CheckCircle2, Target } from 'lucide-react';
import Link from 'next/link';
import { ActionForm } from '@/components/action-form';
import { Button } from '@/components/ui/button';
import type { AthleteCommitmentView } from '@/lib/core/ai-session-notes/session-commitments';
import type { ActionState } from '@/lib/auth/middleware';

/**
 * "I tuoi prossimi passi": la sola parte del Session Compass che raggiunge
 * l'atleta. Riceve una proiezione già filtrata dal dominio, quindi non ha
 * accesso a citazioni, temi, momenti chiave o note del coach.
 */
export function AthleteNextSteps({
  commitments,
  action,
}: {
  commitments: AthleteCommitmentView[];
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
}) {
  if (!commitments.length) return null;

  const open = commitments.filter((item) => item.status === 'pending' || item.status === 'in_progress');
  const closed = commitments.filter((item) => item.status === 'completed' || item.status === 'skipped');

  return (
    <section
      id="prossimi-passi"
      className="rounded-3xl border border-violet-200 bg-white p-6 shadow-sm"
      aria-labelledby="athlete-next-steps-title"
    >
      <div className="flex items-start gap-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-violet-100">
          <Target className="h-5 w-5 text-violet-700" />
        </span>
        <div>
          <h2 id="athlete-next-steps-title" className="text-xl font-bold tracking-tight text-gray-950">
            I tuoi prossimi passi
          </h2>
          <p className="mt-1 text-sm text-gray-600">
            Le azioni concordate con il tuo coach nelle ultime sessioni.
          </p>
        </div>
      </div>

      <ul className="mt-5 space-y-3">
        {open.map((commitment) => (
          <CommitmentCard key={commitment.id} commitment={commitment} action={action} />
        ))}
      </ul>

      {closed.length ? (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-medium text-gray-600">
            Già gestiti ({closed.length})
          </summary>
          <ul className="mt-3 space-y-3">
            {closed.map((commitment) => (
              <CommitmentCard key={commitment.id} commitment={commitment} action={action} />
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}

function CommitmentCard({
  commitment,
  action,
}: {
  commitment: AthleteCommitmentView;
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
}) {
  const settled = commitment.status === 'completed' || commitment.status === 'skipped';
  return (
    <li className="rounded-2xl border border-gray-200 p-4">
      <p className="font-medium text-gray-950">{commitment.title}</p>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-600">
        {commitment.dueDate ? (
          <span className="inline-flex items-center gap-1 font-medium text-violet-800">
            <CalendarClock className="h-3.5 w-3.5" />
            Entro il {formatDay(commitment.dueDate)}
          </span>
        ) : (
          <span>Senza scadenza</span>
        )}
        <span>Con {commitment.coachName}</span>
        <Link href={`/dashboard/appointments/${commitment.bookingId}`} className="underline">
          Sessione {commitment.sessionDate ? `del ${formatDay(commitment.sessionDate)}` : 'di origine'}
        </Link>
      </div>

      {commitment.status === 'completed' ? (
        <p className="mt-3 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Completato
        </p>
      ) : null}
      {commitment.status === 'skipped' ? (
        <div className="mt-3">
          <p className="inline-flex rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-900">
            Non ci sono riuscito
          </p>
          {commitment.athleteNote ? (
            <p className="mt-2 text-sm text-gray-700">«{commitment.athleteNote}»</p>
          ) : null}
        </div>
      ) : null}

      {settled ? null : (
        <ActionForm className="mt-3" action={action}>
          <input type="hidden" name="commitmentId" value={commitment.id} />
          <label className="block">
            <span className="text-xs font-medium text-gray-600">
              Se non ci sei riuscito, puoi dirci perché (facoltativo)
            </span>
            <textarea
              name="note"
              rows={2}
              className="mt-1 w-full rounded-xl border border-gray-200 p-2 text-sm"
              placeholder="Cosa ti ha bloccato?"
            />
          </label>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button type="submit" name="status" value="completed" className="rounded-full">
              Completato
            </Button>
            <Button
              type="submit"
              name="status"
              value="skipped"
              variant="outline"
              className="rounded-full"
            >
              Non sono riuscito
            </Button>
          </div>
        </ActionForm>
      )}
    </li>
  );
}

function formatDay(value: string): string {
  const date = new Date(value.length === 10 ? `${value}T00:00:00Z` : value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('it-IT', {
        day: 'numeric',
        month: 'long',
        timeZone: 'Europe/Rome',
      }).format(date);
}
