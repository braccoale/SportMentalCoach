import Link from 'next/link';
import { requireRole } from '@/lib/core/auth';
import { listCourses } from '@/lib/core/academy/courses';
import { ActionForm } from '@/components/action-form';
import { Button } from '@/components/ui/button';
import { createCourseAction } from './actions';

export const dynamic = 'force-dynamic';

const STATUS_LABEL: Record<string, string> = {
  draft: 'Bozza',
  active: 'Attivo',
  cancelled: 'Annullato',
};

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
          <input
            name="description"
            placeholder="descrizione (opzionale)"
            className="min-w-[16rem] flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
          <Button type="submit">Crea</Button>
        </ActionForm>
      </div>

      <div className="rounded-xl border border-gray-200 p-4">
        <h2 className="text-lg font-semibold text-gray-900">Corsi</h2>
        {courses.length === 0 ? (
          <p className="mt-3 text-sm text-gray-400">Nessun corso ancora — crealo qui sopra.</p>
        ) : (
          <ul className="mt-3 divide-y divide-gray-100">
            {courses.map((course) => (
              <li key={course.id} className="flex items-center justify-between gap-3 py-3">
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
                  <p className="text-xs text-gray-500">
                    {course.totalHours} ore totali
                    {course.structureLocked ? ' · programma bloccato' : ''}
                  </p>
                </div>
                <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">
                  {STATUS_LABEL[course.status] ?? course.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
