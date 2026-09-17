import { notFound } from 'next/navigation';
import { Lock } from 'lucide-react';
import { requireRole } from '@/lib/core/auth';
import { getCourseDetail } from '@/lib/core/academy/courses';
import { listApprovedCoaches } from '@/lib/core/academy/coaches';
import { listInstructors } from '@/lib/core/academy/instructors';
import { listAssignments } from '@/lib/core/academy/assignments';
import { ActionForm } from '@/components/action-form';
import { Button } from '@/components/ui/button';
import {
  assignCourseAction,
  createModuleAction,
  createNewEditionAction,
  deleteModuleAction,
  nominateInstructorAction,
  updateCourseStatusAction,
} from '../actions';

export const dynamic = 'force-dynamic';

const STATUS_LABEL: Record<string, string> = {
  draft: 'Bozza',
  active: 'Attivo',
  cancelled: 'Annullato',
  assigned: 'Assegnato',
  in_progress: 'In corso',
  completed: 'Completato',
};

export default async function AdminAcademyCourseDetailPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const admin = await requireRole('admin');
  const { courseId: courseIdRaw } = await params;
  const courseId = Number(courseIdRaw);
  if (!Number.isInteger(courseId) || courseId <= 0) notFound();

  const course = await getCourseDetail(admin.id, courseId);
  if (!course) notFound();

  const [coaches, instructors, assignments] = await Promise.all([
    listApprovedCoaches(admin.id),
    listInstructors(admin.id, courseId),
    listAssignments(admin.id, courseId),
  ]);
  const instructorIds = new Set(instructors.map((i) => i.userId));
  const assignedIds = new Set(assignments.map((a) => a.userId));
  const eligibleInstructors = coaches.filter((c) => !instructorIds.has(c.userId));
  const eligibleParticipants = coaches.filter((c) => !assignedIds.has(c.userId));

  return (
    <section className="space-y-8 p-4 lg:p-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">
            {course.title}
            {course.edition ? (
              <span className="ml-1.5 text-lg font-normal text-gray-400">— {course.edition}</span>
            ) : null}
          </h1>
          {course.description && (
            <p className="mt-1 max-w-2xl text-sm text-gray-600">{course.description}</p>
          )}
          <p className="mt-1 text-xs text-gray-500">{course.totalHours} ore totali</p>
        </div>
        <ActionForm action={updateCourseStatusAction} className="flex items-center gap-2">
          <input type="hidden" name="courseId" value={course.id} />
          <select
            name="status"
            defaultValue={course.status}
            className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
          >
            <option value="draft">Bozza</option>
            <option value="active">Attivo</option>
            <option value="cancelled">Annullato</option>
          </select>
          <Button type="submit" variant="outline" className="h-8 px-3 text-xs">
            Salva stato
          </Button>
        </ActionForm>
      </div>

      {course.structureLocked && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <Lock className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="flex-1">
            Programma bloccato: almeno un coach è già assegnato. Per modificare moduli o ore crea
            una nuova edizione.
          </span>
          <ActionForm action={createNewEditionAction}>
            <input type="hidden" name="courseId" value={course.id} />
            <input
              name="edition"
              placeholder="nome edizione (opzionale)"
              maxLength={60}
              className="mr-2 rounded-lg border border-amber-300 bg-white px-2 py-1 text-xs"
            />
            <Button type="submit" variant="outline" className="h-7 px-2 text-xs">
              Crea nuova edizione
            </Button>
          </ActionForm>
        </div>
      )}

      <div className="rounded-xl border border-gray-200 p-4">
        <h2 className="text-lg font-semibold text-gray-900">Moduli</h2>
        {course.modules.length === 0 ? (
          <p className="mt-3 text-sm text-gray-400">Nessun modulo ancora.</p>
        ) : (
          <ol className="mt-3 space-y-2">
            {course.modules.map((module, index) => (
              <li
                key={module.id}
                className="flex items-start justify-between gap-3 rounded-lg border border-gray-100 p-3"
              >
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    Modulo {index + 1} — {module.title}{' '}
                    <span className="font-normal text-gray-400">({module.hours} ore)</span>
                  </p>
                  {module.description && (
                    <p className="mt-1 text-xs text-gray-500">{module.description}</p>
                  )}
                </div>
                {!course.structureLocked && (
                  <ActionForm
                    action={deleteModuleAction}
                    confirmTitle="Eliminare il modulo?"
                    confirmMessage={`"${module.title}" verrà rimosso dal programma.`}
                    confirmActionLabel="Elimina"
                  >
                    <input type="hidden" name="moduleId" value={module.id} />
                    <input type="hidden" name="courseId" value={course.id} />
                    <Button type="submit" variant="outline" className="h-7 shrink-0 px-2 text-xs">
                      Elimina
                    </Button>
                  </ActionForm>
                )}
              </li>
            ))}
          </ol>
        )}

        {!course.structureLocked && (
          <ActionForm action={createModuleAction} className="mt-4 flex flex-wrap gap-3">
            <input type="hidden" name="courseId" value={course.id} />
            <input type="hidden" name="sortOrder" value={course.modules.length} />
            <input
              name="title"
              placeholder="titolo modulo"
              required
              maxLength={200}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
            <input
              name="description"
              placeholder="descrizione (opzionale)"
              className="min-w-[14rem] flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
            <input
              name="hours"
              type="number"
              min={0}
              step={0.5}
              placeholder="ore"
              required
              className="w-24 rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
            <Button type="submit">Aggiungi modulo</Button>
          </ActionForm>
        )}
      </div>

      <div className="rounded-xl border border-gray-200 p-4">
        <h2 className="text-lg font-semibold text-gray-900">Docenti</h2>
        {instructors.length === 0 ? (
          <p className="mt-3 text-sm text-gray-400">Nessun docente nominato per questo corso.</p>
        ) : (
          <ul className="mt-3 space-y-1 text-sm text-gray-700">
            {instructors.map((instructor) => (
              <li key={instructor.userId}>
                {instructor.displayName}{' '}
                <span className="text-xs text-gray-400">({instructor.email})</span>
              </li>
            ))}
          </ul>
        )}
        {eligibleInstructors.length > 0 && (
          <ActionForm action={nominateInstructorAction} className="mt-3 flex flex-wrap gap-3">
            <input type="hidden" name="courseId" value={course.id} />
            <select name="userId" required className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm">
              {eligibleInstructors.map((coach) => (
                <option key={coach.userId} value={coach.userId}>
                  {coach.displayName} ({coach.email})
                </option>
              ))}
            </select>
            <Button type="submit">Nomina docente</Button>
          </ActionForm>
        )}
      </div>

      <div className="rounded-xl border border-gray-200 p-4">
        <h2 className="text-lg font-semibold text-gray-900">Partecipanti</h2>
        {assignments.length === 0 ? (
          <p className="mt-3 text-sm text-gray-400">Nessun coach assegnato a questo corso.</p>
        ) : (
          <ul className="mt-3 space-y-1 text-sm text-gray-700">
            {assignments.map((assignment) => (
              <li key={assignment.assignmentId}>
                {assignment.displayName}{' '}
                <span className="text-xs text-gray-400">
                  — {STATUS_LABEL[assignment.status] ?? assignment.status}
                </span>
              </li>
            ))}
          </ul>
        )}
        {course.status !== 'active' ? (
          <p className="mt-3 text-xs text-gray-400">
            Solo un corso attivo con almeno un modulo può essere assegnato.
          </p>
        ) : eligibleParticipants.length > 0 ? (
          <ActionForm action={assignCourseAction} className="mt-3 flex flex-wrap gap-3">
            <input type="hidden" name="courseId" value={course.id} />
            <select name="userId" required className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm">
              {eligibleParticipants.map((coach) => (
                <option key={coach.userId} value={coach.userId}>
                  {coach.displayName} ({coach.email})
                </option>
              ))}
            </select>
            <Button type="submit">Assegna</Button>
          </ActionForm>
        ) : null}
      </div>
    </section>
  );
}
