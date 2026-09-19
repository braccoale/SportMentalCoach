import type { AcademyAssignmentStatus } from '@/lib/db/schema';

/**
 * Il riepilogo che oggi non esiste da nessuna parte: il docente vede solo
 * righe grezze, una per partecipante, e deve contarsele a mano. Puro: prende
 * in input quello che `listAssignments` (lib/core/academy/assignments.ts) già
 * restituisce, non tocca il database.
 */

export type AssignmentOutcomeInput = {
  assignmentId: number;
  userId: number;
  displayName: string;
  status: AcademyAssignmentStatus;
  completedModules: number;
  totalModules: number;
  /** Ultimo completamento, o l'assegnazione se non ce n'è ancora nessuno. */
  lastActivityAt: Date;
};

export type StuckAssignment = {
  assignmentId: number;
  userId: number;
  displayName: string;
  completedModules: number;
  totalModules: number;
  daysSinceActivity: number;
};

export type CourseOutcomesSummary = {
  total: number;
  completed: number;
  inProgress: number;
  notStarted: number;
  /** Non completati, ordinati dal più fermo — solo chi supera la soglia di inattività. */
  stuck: StuckAssignment[];
};

/**
 * Oltre questa soglia di inattività un'assegnazione non completata è
 * "ferma", non solo "in corso". Una scelta di prodotto, non tecnica —
 * arbitraria per definizione, ma esplicita e in un solo punto.
 */
export const STUCK_THRESHOLD_DAYS = 14;

const MS_PER_DAY = 86_400_000;

export function summarizeCourseOutcomes(
  assignments: readonly AssignmentOutcomeInput[],
  now = new Date(),
  stuckThresholdDays = STUCK_THRESHOLD_DAYS
): CourseOutcomesSummary {
  let completed = 0;
  let inProgress = 0;
  let notStarted = 0;
  const stuck: StuckAssignment[] = [];

  for (const assignment of assignments) {
    if (assignment.status === 'completed') completed += 1;
    else if (assignment.status === 'in_progress') inProgress += 1;
    else notStarted += 1;

    if (assignment.status !== 'completed') {
      const daysSinceActivity = Math.floor((now.getTime() - assignment.lastActivityAt.getTime()) / MS_PER_DAY);
      if (daysSinceActivity >= stuckThresholdDays) {
        stuck.push({
          assignmentId: assignment.assignmentId,
          userId: assignment.userId,
          displayName: assignment.displayName,
          completedModules: assignment.completedModules,
          totalModules: assignment.totalModules,
          daysSinceActivity,
        });
      }
    }
  }

  stuck.sort((a, b) => b.daysSinceActivity - a.daysSinceActivity);
  return { total: assignments.length, completed, inProgress, notStarted, stuck };
}

export type ModuleOutcome = {
  moduleId: number;
  title: string;
  sortOrder: number;
  completedCount: number;
  totalParticipants: number;
};

export type AssignmentModuleInput = {
  modules: readonly { moduleId: number; title: string; sortOrder: number; completed: boolean }[];
};

/** Per modulo, quanti partecipanti l'hanno completato — dove tipicamente si vede accumularsi il blocco. */
export function summarizeModuleOutcomes(assignments: readonly AssignmentModuleInput[]): ModuleOutcome[] {
  const byModule = new Map<number, ModuleOutcome>();
  for (const assignment of assignments) {
    for (const module of assignment.modules) {
      const entry = byModule.get(module.moduleId) ?? {
        moduleId: module.moduleId,
        title: module.title,
        sortOrder: module.sortOrder,
        completedCount: 0,
        totalParticipants: 0,
      };
      entry.totalParticipants += 1;
      if (module.completed) entry.completedCount += 1;
      byModule.set(module.moduleId, entry);
    }
  }
  return [...byModule.values()].sort((a, b) => a.sortOrder - b.sortOrder || a.moduleId - b.moduleId);
}
