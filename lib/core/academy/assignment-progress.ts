import type { AcademyAssignmentStatus } from '@/lib/db/schema';

export type { AcademyAssignmentStatus };

/**
 * Lo stato di un'assegnazione, sempre derivato — mai una bandiera scritta e
 * poi lasciata a sé stessa. Usata sia quando un modulo viene segnato
 * completato sia quando un modulo nuovo si aggiunge a un corso che aveva
 * già assegnazioni `completed`: in entrambi i casi lo stato si ricalcola da
 * zero dai moduli attuali del corso e dai completamenti registrati, non si
 * aggiorna in modo incrementale.
 */
export function computeAssignmentStatus(
  moduleIds: readonly number[],
  completedModuleIds: readonly number[]
): AcademyAssignmentStatus {
  if (moduleIds.length === 0) return 'assigned';
  const completed = new Set(completedModuleIds);
  const completedCount = moduleIds.filter((id) => completed.has(id)).length;
  if (completedCount === 0) return 'assigned';
  if (completedCount === moduleIds.length) return 'completed';
  return 'in_progress';
}
