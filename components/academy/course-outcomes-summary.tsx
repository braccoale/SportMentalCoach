import type { CourseOutcomesSummary, ModuleOutcome } from '@/lib/core/academy/outcomes';

/**
 * Il riepilogo che il docente non aveva: quanti hanno finito, chi è fermo,
 * dove si accumula il blocco modulo per modulo. Sola lettura — le correzioni
 * restano nella lista partecipanti, riga per riga.
 */
export function CourseOutcomesSummaryCard({
  summary,
  moduleOutcomes,
}: {
  summary: CourseOutcomesSummary;
  moduleOutcomes: ModuleOutcome[];
}) {
  if (summary.total === 0) return null;

  return (
    <div className="mb-4 rounded-xl border border-gray-200 bg-gray-50/60 p-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span className="font-semibold text-gray-900">{summary.total} partecipanti</span>
        <span className="text-gray-600">{summary.completed} completati</span>
        <span className="text-gray-600">{summary.inProgress} in corso</span>
        {summary.notStarted > 0 && <span className="text-gray-600">{summary.notStarted} non iniziati</span>}
      </div>

      {summary.stuck.length > 0 && (
        <div className="mt-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Fermi da più tempo</p>
          <ul className="mt-1 space-y-0.5">
            {summary.stuck.slice(0, 5).map((s) => (
              <li key={s.assignmentId} className="text-xs text-gray-600">
                {s.displayName} — modulo {s.completedModules}/{s.totalModules}, ultima attività {s.daysSinceActivity} giorni fa
              </li>
            ))}
          </ul>
        </div>
      )}

      {moduleOutcomes.length > 0 && (
        <div className="mt-3 space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Per modulo</p>
          {moduleOutcomes.map((module) => {
            const pct =
              module.totalParticipants === 0 ? 0 : Math.round((module.completedCount / module.totalParticipants) * 100);
            return (
              <div key={module.moduleId} className="flex items-center gap-2 text-xs text-gray-600">
                <span className="w-36 shrink-0 truncate sm:w-48">{module.title}</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-200">
                  <div className="h-full rounded-full bg-indigo-500" style={{ width: `${pct}%` }} />
                </div>
                <span className="w-14 shrink-0 text-right">
                  {module.completedCount}/{module.totalParticipants}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
