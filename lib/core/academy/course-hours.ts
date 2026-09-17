export type CourseModuleHours = { hours: number };

/**
 * Le ore totali di un corso — sempre questa funzione, mai una colonna
 * separata: `academyCourses` non ha un campo "ore totali" apposta perché
 * possa disallinearsi dai moduli reali.
 */
export function courseTotalHours(modules: readonly CourseModuleHours[]): number {
  return modules.reduce(
    (sum, module) => sum + (Number.isFinite(module.hours) ? module.hours : 0),
    0
  );
}
