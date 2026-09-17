import { CheckCircle2, Circle, GraduationCap } from 'lucide-react';
import { requireRole } from '@/lib/core/auth';
import { listAssignmentsForUser } from '@/lib/core/academy/assignments';
import { listInstructorCourses } from '@/lib/core/academy/instructors';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusPill } from '@/components/admin/academy/status-pill';

export const dynamic = 'force-dynamic';

export default async function CoachAcademyPage() {
  const coach = await requireRole('coach');
  const [assignments, teaching] = await Promise.all([
    listAssignmentsForUser(coach.id),
    listInstructorCourses(coach.id),
  ]);

  if (assignments.length === 0 && teaching.length === 0) {
    return (
      <section className="p-4 lg:p-0">
        <div className="rounded-xl border border-dashed border-gray-300 p-8 text-center">
          <GraduationCap className="mx-auto h-8 w-8 text-gray-300" aria-hidden="true" />
          <h1 className="mt-3 text-lg font-semibold text-gray-900">Nessun corso per ora</h1>
          <p className="mx-auto mt-1 max-w-sm text-sm text-gray-500">
            L'Academy è gestita dall'amministrazione: quando ti verrà assegnato un corso da
            seguire o da insegnare, lo vedrai qui.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-8 p-4 lg:p-0">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Academy</h1>
        <p className="mt-1 text-sm text-gray-600">I corsi di formazione che segui e che insegni.</p>
      </div>

      {teaching.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
            Corsi che tieni
          </h2>
          {teaching.map((course) => (
            <Card key={course.courseId}>
              <CardContent className="flex items-center justify-between gap-3 pt-6">
                <div>
                  <p className="font-medium text-gray-900">
                    {course.title}
                    {course.edition ? (
                      <span className="ml-1.5 font-normal text-gray-400">— {course.edition}</span>
                    ) : null}
                  </p>
                  {course.status !== 'active' && (
                    <p className="mt-0.5 text-xs text-gray-400">
                      Non ancora attivo: gli iscritti non lo vedono finché l'admin non lo attiva.
                    </p>
                  )}
                </div>
                <StatusPill status={course.status} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {assignments.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
            Corsi che segui
          </h2>
          {assignments.map((assignment) => {
            const completedCount = assignment.modules.filter((m) => m.completed).length;
            return (
              <Card key={assignment.assignmentId}>
                <CardHeader>
                  <div className="flex items-center justify-between gap-3">
                    <CardTitle className="text-base">
                      {assignment.courseTitle}
                      {assignment.courseEdition ? (
                        <span className="ml-1.5 font-normal text-gray-400">
                          — {assignment.courseEdition}
                        </span>
                      ) : null}
                    </CardTitle>
                    <span className="text-xs font-medium text-gray-500">
                      {completedCount}/{assignment.modules.length} moduli completati
                    </span>
                  </div>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-1.5">
                    {assignment.modules.map((module, index) => (
                      <li
                        key={module.moduleId}
                        className="flex items-center gap-2 text-sm text-gray-700"
                      >
                        {module.completed ? (
                          <CheckCircle2
                            className="h-4 w-4 shrink-0 text-green-600"
                            aria-label="Completato"
                          />
                        ) : (
                          <Circle className="h-4 w-4 shrink-0 text-gray-300" aria-label="Da completare" />
                        )}
                        Modulo {index + 1} — {module.title}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </section>
  );
}
