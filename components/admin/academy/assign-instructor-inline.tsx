'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import type { ActionState } from '@/lib/auth/middleware';

type EligibleCoach = { userId: number; displayName: string; email: string };

/**
 * Step inline nel flusso "Pianifica sessione": nomina il docente senza
 * lasciare la tab Sessioni. `nominateInstructorAction` fa `revalidatePath`
 * sulla stessa pagina, quindi dopo il successo il server re-renderizza il
 * pannello con `instructors` non vuoto e mostra direttamente il form di
 * creazione sessione — il docente appena nominato è l'unica opzione del
 * suo `<select>`, quindi risulta già preselezionato.
 */
export function AssignInstructorInline({
  action,
  courseId,
  coaches,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  courseId: number;
  coaches: EligibleCoach[];
}) {
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(action, {});

  if (coaches.length === 0) {
    return (
      <p className="text-xs text-gray-400">
        Nessun coach approvato disponibile da nominare docente.
      </p>
    );
  }

  return (
    <form action={formAction} className="mx-auto flex max-w-sm flex-col gap-2">
      <input type="hidden" name="courseId" value={courseId} />
      <select
        name="userId"
        required
        disabled={isPending}
        className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm disabled:opacity-60"
      >
        {coaches.map((coach) => (
          <option key={coach.userId} value={coach.userId}>
            {coach.displayName} ({coach.email})
          </option>
        ))}
      </select>
      <Button type="submit" disabled={isPending}>
        {isPending ? 'Assegnazione…' : 'Assegna e continua'}
      </Button>
      {state?.error && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}
      {state?.success && <p className="text-sm text-green-600">{state.success}</p>}
    </form>
  );
}
