import Link from 'next/link';
import { CalendarClock, CheckCircle2, Circle, GraduationCap, Sparkles } from 'lucide-react';
import { requireRole } from '@/lib/core/auth';
import { listAssignmentsForUser } from '@/lib/core/academy/assignments';
import { listInstructorCourses } from '@/lib/core/academy/instructors';
import { listSessionsForUser } from '@/lib/core/academy/sessions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusPill } from '@/components/admin/academy/status-pill';

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
            <Card key={course.courseId}>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-gray-900">
                      {course.title}
                      {course.edition ? (
                        <span className="ml-1.5 font-normal text-gray-400">— {course.edition}</span>
                      ) : null}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-500">
                      {course.status === 'active'
                        ? `Attivo · ${course.moduleCount} moduli`
                        : "Non ancora attivo: gli iscritti non lo vedono finché l'admin non lo attiva."}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <StatusPill status={course.status} />
                    <Button asChild variant="outline" className="h-8 px-3 text-xs">
                      <Link href={`/dashboard/coach/academy/${course.courseId}`}>Apri corso</Link>
                    </Button>
                  </div>
                </div>

                {course.status === 'active' && course.sessionCount === 0 && (
                  <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-indigo-100 bg-indigo-50/60 p-3">
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
                )}
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
            const courseSessions = (participantSessionsByCourse.get(assignment.courseId) ?? []).sort(
              (a, b) => a.scheduledFor.getTime() - b.scheduledFor.getTime()
            );
            return (
              <Card key={assignment.assignmentId}>
                <CardHeader>
                  <div className="flex items-center justify-between gap-3">
                    <CardTitle className="text-base">
                      <Link href={`/dashboard/coach/academy/${assignment.courseId}`} className="hover:underline">
                        {assignment.courseTitle}
                      </Link>
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
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </section>
  );
}
