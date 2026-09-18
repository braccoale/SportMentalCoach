import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { CalendarClock, CheckCircle2, Circle, GraduationCap, Sparkles } from 'lucide-react';
import { requireRole } from '@/lib/core/auth';
import { listAssignmentsForUser } from '@/lib/core/academy/assignments';
import { listInstructorCourses } from '@/lib/core/academy/instructors';
import { listSessionsForUser } from '@/lib/core/academy/sessions';
import { CourseListCard } from '@/components/coach/academy/course-list-card';

export const dynamic = 'force-dynamic';

function formatSessionTime(date: Date): string {
  return new Intl.DateTimeFormat('it-IT', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Rome',
  }).format(date);
}

export default async function CoachAcademyPage() {
  const coach = await requireRole('coach');
  const [assignments, teaching, allSessions] = await Promise.all([
    listAssignmentsForUser(coach.id),
    listInstructorCourses(coach.id),
    listSessionsForUser(coach.id),
  ]);

  // Il partecipante vede solo le sessioni a cui è invitato per i corsi che
  // segue — mai quelle di un corso che insegna soltanto, e mai quelle
  // annullate (restano nello storico, non nella lista attiva).
  const participantSessionsByCourse = new Map<number, typeof allSessions>();
  for (const session of allSessions) {
    if (session.asInstructor || session.status !== 'scheduled') continue;
    const list = participantSessionsByCourse.get(session.courseId) ?? [];
    list.push(session);
    participantSessionsByCourse.set(session.courseId, list);
  }

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
            <CourseListCard
              key={course.courseId}
              href={`/dashboard/coach/academy/${course.courseId}`}
              title={course.title}
              edition={course.edition}
              level={course.level}
              moduleCount={course.moduleCount}
              totalHours={course.totalHours}
              status={course.status}
              heroImageUrl={course.heroImageKey ? `/api/academy/courses/${course.courseId}/hero` : null}
              badgeLabel="Docente"
              ctaLabel="Apri corso"
              footer={
                course.status === 'active' && course.sessionCount === 0 ? (
                  <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-indigo-100 bg-indigo-50/60 p-3">
                    <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900">Prossimo passo</p>
                      <p className="mt-0.5 text-xs text-gray-600">
                        Questo corso è attivo ma non ha ancora sessioni. Crea la prima sessione per
                        iniziare la formazione.
                      </p>
                      <Button asChild size="sm" className="mt-2">
                        <Link href={`/dashboard/coach/academy/${course.courseId}`}>
                          Crea la prima sessione
                        </Link>
                      </Button>
                    </div>
                  </div>
                ) : course.status !== 'active' ? (
                  <p className="mt-3 text-xs text-gray-400">
                    Non ancora attivo: gli iscritti non lo vedono finché l'admin non lo attiva.
                  </p>
                ) : (
                  <p className="mt-3 text-xs text-gray-400">
                    {course.participantCount} partecipant{course.participantCount === 1 ? 'e' : 'i'} ·{' '}
                    {course.sessionCount} session{course.sessionCount === 1 ? 'e' : 'i'} programmat
                    {course.sessionCount === 1 ? 'a' : 'e'}
                  </p>
                )
              }
            />
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
            const courseSessions = (participantSessionsByCourse.get(assignment.courseId) ?? []).sort(
              (a, b) => a.scheduledFor.getTime() - b.scheduledFor.getTime()
            );
            return (
              <CourseListCard
                key={assignment.assignmentId}
                href={`/dashboard/coach/academy/${assignment.courseId}`}
                title={assignment.courseTitle}
                edition={assignment.courseEdition}
                level={assignment.courseLevel}
                moduleCount={assignment.modules.length}
                totalHours={assignment.courseTotalHours}
                status={assignment.status}
                heroImageUrl={
                  assignment.heroImageKey ? `/api/academy/courses/${assignment.courseId}/hero` : null
                }
                badgeLabel="Il tuo corso"
                progress={{ completed: completedCount, total: assignment.modules.length }}
                ctaLabel={completedCount === 0 ? 'Inizia corso' : 'Continua corso'}
                footer={
                  <div className="mt-4 border-t border-gray-100 pt-3">
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

                    <div className="mt-4 border-t border-gray-100 pt-3">
                      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">
                        Le tue sessioni
                      </p>
                      {courseSessions.length === 0 ? (
                        <p className="text-xs text-gray-400">
                          Nessuna sessione pianificata ancora per questo corso.
                        </p>
                      ) : (
                        <ul className="space-y-1.5">
                          {courseSessions.map((session) => (
                            <li key={session.id} className="flex items-center gap-2 text-sm text-gray-700">
                              <CalendarClock className="h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
                              {formatSessionTime(session.scheduledFor)} · {session.moduleTitle} · Docente:{' '}
                              {session.instructorName}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                }
              />
            );
          })}
        </div>
      )}
    </section>
  );
}
