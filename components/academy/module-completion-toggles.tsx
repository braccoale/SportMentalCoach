'use client';

import { ActionForm } from '@/components/action-form';
import type { ActionState } from '@/lib/auth/middleware';

type ActionFn = (state: ActionState, formData: FormData) => Promise<ActionState>;

export type ModuleCompletionState = {
  moduleId: number;
  title: string;
  sortOrder: number;
  completed: boolean;
};

/**
 * Un pallino per modulo, pieno se completato — la correzione umana su un
 * completamento automatico (da presenza) o su uno mai arrivato. Ogni pallino
 * è la sua form: cliccarlo manda l'opposto di `completed`, quindi è sempre
 * un solo tocco per accendere o spegnere.
 */
export function ModuleCompletionToggles({
  courseId,
  assignmentId,
  modules,
  action,
}: {
  courseId: number;
  assignmentId: number;
  modules: ModuleCompletionState[];
  action: ActionFn;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1" aria-label="Moduli completati, correggi con un tocco">
      {modules.map((module, index) => (
        <ActionForm key={module.moduleId} action={action} className="inline-block">
          <input type="hidden" name="courseId" value={courseId} />
          <input type="hidden" name="assignmentId" value={assignmentId} />
          <input type="hidden" name="moduleId" value={module.moduleId} />
          <input type="hidden" name="completed" value={module.completed ? '0' : '1'} />
          <button
            type="submit"
            title={`${module.title} — ${module.completed ? 'completato, tocca per correggere' : 'non completato, tocca per segnare completato'}`}
            className={`flex h-6 w-6 items-center justify-center rounded-full border text-[11px] font-semibold transition-colors ${
              module.completed
                ? 'border-indigo-600 bg-indigo-600 text-white'
                : 'border-gray-200 text-gray-400 hover:border-indigo-300 hover:text-indigo-500'
            }`}
          >
            {index + 1}
          </button>
        </ActionForm>
      ))}
    </div>
  );
}
