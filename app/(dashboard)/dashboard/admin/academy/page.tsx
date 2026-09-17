import Link from 'next/link';
import { Clock, Layers, Lock, Pencil } from 'lucide-react';
import { requireRole } from '@/lib/core/auth';
import { listCourses } from '@/lib/core/academy/courses';
import { ActionForm } from '@/components/action-form';
import { Button } from '@/components/ui/button';
import { StatusPill } from '@/components/admin/academy/status-pill';
import { createCourseAction, updateCourseAction } from './actions';

export const dynamic = 'force-dynamic';

export default async function AdminAcademyPage() {
  const admin = await requireRole('admin');
  const courses = await listCourses(admin.id);

  return (
    <section className="space-y-8 p-4 lg:p-0">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Academy</h1>
        <p className="mt-1 max-w-2xl text-sm text-gray-600">
          Corsi di formazione per i coach: moduli, docenti, assegnazioni e sessioni.
        </p>
      </div>

      <div className="rounded-xl border border-gray-200 p-4">
        <h2 className="text-lg font-semibold text-gray-900">Nuovo corso</h2>
        <ActionForm action={createCourseAction} className="mt-3 flex flex-wrap gap-3">
          <input
            name="title"
            placeholder="titolo (es. Mastery Level)"
            required
            maxLength={200}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
          <input
            name="edition"
            placeholder="edizione (opzionale, es. Autunno 2026)"
            maxLength={60}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
          <textarea
            name="description"
            placeholder="descrizione (opzionale)"
            rows={2}
            className="min-w-[16rem] flex-1 resize-y rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
          <Button type="submit">Crea</Button>
        </ActionForm>
      </div>

      <div className="rounded-xl border border-gray-200 p-4">
        <h2 className="text-lg font-semibold text-gray-900">Corsi</h2>
        {courses.length === 0 ? (
          <p className="mt-3 text-sm text-gray-400">Nessun corso ancora — crealo qui sopra.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {courses.map((course, index) => (
              <li key={course.id} className="rounded-xl border border-gray-100 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-sm font-semibold text-gray-700">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <div>
                      <Link
                        href={`/dashboard/admin/academy/${course.id}`}
                        className="font-medium text-gray-900 hover:underline"
                      >
                        {course.title}
                        {course.edition ? (
                          <span className="ml-1.5 font-normal text-gray-400">— {course.edition}</span>
                        ) : null}
                      </Link>
                      {course.description && (
                        <p className="mt-0.5 max-w-xl text-xs text-gray-500">{course.description}</p>
                      )}
                      <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-gray-500">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                          {course.totalHours} ore totali
                        </span>
                        <span className="flex items-center gap-1">
                          <Layers className="h-3.5 w-3.5" aria-hidden="true" />
                          {course.moduleCount} moduli
                        </span>
                        {course.structureLocked && (
                          <span className="flex items-center gap-1">
                            <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                            programma bloccato
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {!course.structureLocked && (
                      <details className="relative">
                        <summary
                          aria-label={`Modifica ${course.title}`}
                          className="flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded-md border border-gray-200 text-gray-500 hover:bg-gray-50 [&::-webkit-details-marker]:hidden"
                        >
                          <Pencil className="h-4 w-4" aria-hidden="true" />
                        </summary>
                        <div className="absolute right-0 z-10 mt-2 w-80 rounded-xl border border-gray-200 bg-white p-3 shadow-lg">
                          <ActionForm action={updateCourseAction} className="flex flex-col gap-2">
                            <input type="hidden" name="courseId" value={course.id} />
                            <input
                              name="title"
                              defaultValue={course.title}
                              required
                              maxLength={200}
                              placeholder="titolo"
                              className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                            />
                            <input
                              name="edition"
                              defaultValue={course.edition ?? ''}
                              placeholder="edizione (opzionale)"
                              maxLength={60}
                              className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                            />
                            <textarea
                              name="description"
                              defaultValue={course.description ?? ''}
                              placeholder="descrizione (opzionale)"
                              rows={3}
                              className="resize-y rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                            />
                            <Button type="submit" size="sm">Salva</Button>
                          </ActionForm>
                        </div>
                      </details>
                    )}
                    <StatusPill status={course.status} />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
