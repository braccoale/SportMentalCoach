import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CheckCircle2, Circle, Clock, Layers, Lock, Pencil, ShieldCheck, Trash2 } from 'lucide-react';
import { requireRole } from '@/lib/core/auth';
import { getCourseDetail } from '@/lib/core/academy/courses';
import { listApprovedCoaches } from '@/lib/core/academy/coaches';
import { listInstructors } from '@/lib/core/academy/instructors';
import { listAssignments } from '@/lib/core/academy/assignments';
import { listMaterials, type ModuleMaterial } from '@/lib/core/academy/materials';
import { ActionForm } from '@/components/action-form';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CourseTabs } from '@/components/admin/academy/course-tabs';
import { StatusPill } from '@/components/admin/academy/status-pill';
import {
  assignCourseAction,
  createModuleAction,
  createNewEditionAction,
  deleteMaterialAction,
  deleteModuleAction,
  nominateInstructorAction,
  toggleMaterialPublishedAction,
  updateCourseAction,
  updateCourseStatusAction,
  updateModuleAction,
  uploadMaterialAction,
} from '../actions';

export const dynamic = 'force-dynamic';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

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

  const [coaches, instructors, assignments, materialsByModule] = await Promise.all([
    listApprovedCoaches(admin.id),
    listInstructors(admin.id, courseId),
    listAssignments(admin.id, courseId),
    Promise.all(
      course.modules.map(async (module) => [module.id, await listMaterials(admin.id, module.id)] as const)
    ),
  ]);
  const materials = new Map<number, ModuleMaterial[]>(materialsByModule);
  const instructorIds = new Set(instructors.map((i) => i.userId));
  const assignedIds = new Set(assignments.map((a) => a.userId));
  const eligibleInstructors = coaches.filter((c) => !instructorIds.has(c.userId));
  const eligibleParticipants = coaches.filter((c) => !assignedIds.has(c.userId));

  const checklist = [
    { label: 'Programma definito', done: course.modules.length > 0 },
    { label: 'Ore di formazione', done: course.totalHours > 0 },
    { label: 'Docente nominato', done: instructors.length > 0 },
  ];

  const configPanel = (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Layers className="h-4 w-4 text-gray-400" aria-hidden="true" />
              Programma del corso
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {course.modules.length === 0 ? (
            <p className="text-sm text-gray-400">Nessun modulo ancora.</p>
          ) : (
            <ol className="space-y-2">
              {course.modules.map((module, index) => (
                <li key={module.id} className="rounded-xl border border-gray-200 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-sm font-semibold text-gray-700">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <div>
                        <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
                          Modulo {index + 1}
                        </p>
                        <p className="text-sm font-semibold text-gray-900">{module.title}</p>
                        {module.description && (
                          <p className="mt-0.5 text-xs text-gray-500">{module.description}</p>
                        )}
                        <p className="mt-1.5 flex items-center gap-1 text-xs text-gray-500">
                          <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                          {module.hours} ore
                        </p>
                      </div>
                    </div>
                    {!course.structureLocked && (
                      <div className="flex shrink-0 items-center gap-1.5">
                        <details className="relative">
                          <summary
                            aria-label={`Modifica ${module.title}`}
                            className="flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded-md border border-gray-200 text-gray-500 hover:bg-gray-50 [&::-webkit-details-marker]:hidden"
                          >
                            <Pencil className="h-4 w-4" aria-hidden="true" />
                          </summary>
                          <div className="absolute right-0 z-10 mt-2 w-72 rounded-xl border border-gray-200 bg-white p-3 shadow-lg">
                            <ActionForm action={updateModuleAction} className="flex flex-col gap-2">
                              <input type="hidden" name="moduleId" value={module.id} />
                              <input type="hidden" name="courseId" value={course.id} />
                              <input type="hidden" name="sortOrder" value={module.sortOrder} />
                              <input
                                name="title"
                                defaultValue={module.title}
                                required
                                maxLength={200}
                                placeholder="titolo"
                                className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                              />
                              <input
                                name="description"
                                defaultValue={module.description ?? ''}
                                placeholder="descrizione (opzionale)"
                                className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                              />
                              <input
                                name="hours"
                                type="number"
                                min={0}
                                step={0.5}
                                defaultValue={module.hours}
                                required
                                className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                              />
                              <Button type="submit" size="sm">Salva modulo</Button>
                            </ActionForm>
                          </div>
                        </details>
                        <ActionForm
                          action={deleteModuleAction}
                          confirmTitle="Eliminare il modulo?"
                          confirmMessage={`"${module.title}" verrà rimosso dal programma.`}
                          confirmActionLabel="Elimina"
                        >
                          <input type="hidden" name="moduleId" value={module.id} />
                          <input type="hidden" name="courseId" value={course.id} />
                          <Button
                            type="submit"
                            variant="outline"
                            size="icon"
                            className="h-8 w-8"
                            aria-label={`Elimina ${module.title}`}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        </ActionForm>
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}

          {!course.structureLocked && (
            <ActionForm action={createModuleAction} className="mt-4 flex flex-wrap gap-3 border-t border-gray-100 pt-4">
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
              <Button type="submit">+ Aggiungi un modulo al percorso</Button>
            </ActionForm>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Docenti</CardTitle>
        </CardHeader>
        <CardContent>
          {instructors.length === 0 ? (
            <p className="text-sm text-gray-400">Nessun docente nominato per questo corso.</p>
          ) : (
            <ul className="mb-3 space-y-1 text-sm text-gray-700">
              {instructors.map((instructor) => (
                <li key={instructor.userId}>
                  {instructor.displayName}{' '}
                  <span className="text-xs text-gray-400">({instructor.email})</span>
                </li>
              ))}
            </ul>
          )}
          {eligibleInstructors.length > 0 && (
            <ActionForm action={nominateInstructorAction} className="flex flex-wrap gap-3">
              <input type="hidden" name="courseId" value={course.id} />
              <select
                name="userId"
                required
                className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
              >
                {eligibleInstructors.map((coach) => (
                  <option key={coach.userId} value={coach.userId}>
                    {coach.displayName} ({coach.email})
                  </option>
                ))}
              </select>
              <Button type="submit">Aggiungi Docente</Button>
            </ActionForm>
          )}
        </CardContent>
      </Card>
    </div>
  );

  const materialsPanel = (
    <div className="space-y-6">
      {course.modules.length === 0 ? (
        <p className="text-sm text-gray-400">
          Aggiungi almeno un modulo nella tab Configurazione prima di caricare materiali.
        </p>
      ) : (
        course.modules.map((module, index) => {
          const moduleMaterials = materials.get(module.id) ?? [];
          return (
            <Card key={module.id}>
              <CardHeader>
                <CardTitle className="text-base">
                  Modulo {index + 1} — {module.title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {moduleMaterials.length === 0 ? (
                  <p className="mb-3 text-sm text-gray-400">Nessun materiale caricato.</p>
                ) : (
                  <ul className="mb-4 space-y-2">
                    {moduleMaterials.map((material) => (
                      <li
                        key={material.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-100 px-3 py-2"
                      >
                        <div className="min-w-0">
                          <a
                            href={`/api/academy/materials/${material.id}`}
                            className="text-sm font-medium text-gray-900 hover:underline"
                          >
                            {material.title}
                          </a>
                          <p className="text-xs text-gray-400">
                            {material.fileName} · {formatBytes(material.fileSizeBytes)}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span
                            className={
                              material.published
                                ? 'rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-medium text-green-700'
                                : 'rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500'
                            }
                          >
                            {material.published ? 'Pubblicato' : 'Bozza'}
                          </span>
                          <ActionForm action={toggleMaterialPublishedAction}>
                            <input type="hidden" name="attachmentId" value={material.id} />
                            <input type="hidden" name="courseId" value={course.id} />
                            <input type="hidden" name="published" value={material.published ? '0' : '1'} />
                            <Button type="submit" variant="outline" className="h-7 px-2 text-xs">
                              {material.published ? 'Nascondi' : 'Pubblica'}
                            </Button>
                          </ActionForm>
                          <ActionForm
                            action={deleteMaterialAction}
                            confirmTitle="Eliminare il materiale?"
                            confirmMessage={`"${material.title}" verrà rimosso.`}
                            confirmActionLabel="Elimina"
                          >
                            <input type="hidden" name="attachmentId" value={material.id} />
                            <input type="hidden" name="courseId" value={course.id} />
                            <Button
                              type="submit"
                              variant="outline"
                              size="icon"
                              className="h-7 w-7"
                              aria-label={`Elimina ${material.title}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                            </Button>
                          </ActionForm>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}

                <ActionForm
                  action={uploadMaterialAction}
                  className="flex flex-wrap items-center gap-3 border-t border-gray-100 pt-3"
                >
                  <input type="hidden" name="moduleId" value={module.id} />
                  <input type="hidden" name="courseId" value={course.id} />
                  <input
                    name="title"
                    placeholder="titolo materiale"
                    required
                    maxLength={200}
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                  <input
                    name="file"
                    type="file"
                    required
                    accept=".pdf,.doc,.docx,.ppt,.pptx,.jpg,.jpeg,.png,.mp4,.mov"
                    className="text-sm"
                  />
                  <Button type="submit">Carica</Button>
                </ActionForm>
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );

  const participantsPanel = (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Partecipanti</CardTitle>
      </CardHeader>
      <CardContent>
        {assignments.length === 0 ? (
          <p className="mb-3 text-sm text-gray-400">
            Le iscrizioni si aprono quando attivi il corso. Nessun coach assegnato per ora.
          </p>
        ) : (
          <ul className="mb-4 space-y-1 text-sm text-gray-700">
            {assignments.map((assignment) => (
              <li key={assignment.assignmentId} className="flex items-center gap-2">
                {assignment.displayName}
                <StatusPill status={assignment.status} />
              </li>
            ))}
          </ul>
        )}
        {course.status !== 'active' ? (
          <p className="text-xs text-gray-400">
            Solo un corso attivo con almeno un modulo può essere assegnato.
          </p>
        ) : eligibleParticipants.length > 0 ? (
          <ActionForm action={assignCourseAction} className="flex flex-wrap gap-3">
            <input type="hidden" name="courseId" value={course.id} />
            <select name="userId" required className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm">
              {eligibleParticipants.map((coach) => (
                <option key={coach.userId} value={coach.userId}>
                  {coach.displayName} ({coach.email})
                </option>
              ))}
            </select>
            <Button type="submit">Assegna partecipanti</Button>
          </ActionForm>
        ) : null}
      </CardContent>
    </Card>
  );

  return (
    <section className="space-y-6 p-4 lg:p-0">
      <nav className="flex items-center gap-1.5 text-xs text-gray-400">
        <Link href="/dashboard/admin/academy" className="hover:text-gray-600">
          Academy
        </Link>
        <span>/</span>
        <Link href="/dashboard/admin/academy" className="hover:text-gray-600">
          Corsi
        </Link>
        <span>/</span>
        <span className="text-gray-600">{course.title}</span>
      </nav>

      <div>
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-2xl font-bold text-gray-900">{course.title}</h1>
          {course.edition && <span className="text-lg font-normal text-gray-400">Edizione {course.edition}</span>}
          <StatusPill status={course.status} />
        </div>
        {course.description && <p className="mt-1 max-w-2xl text-sm text-gray-600">{course.description}</p>}
        <div className="mt-2 flex items-center gap-4 text-xs text-gray-500">
          <span className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
            {course.totalHours} ore totali
          </span>
          <span className="flex items-center gap-1.5">
            <Layers className="h-3.5 w-3.5" aria-hidden="true" />
            {course.modules.length} moduli
          </span>
        </div>

        {!course.structureLocked && (
          <details className="mt-3">
            <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-900 [&::-webkit-details-marker]:hidden">
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
              Modifica titolo e descrizione
            </summary>
            <ActionForm
              action={updateCourseAction}
              className="mt-2 flex max-w-xl flex-wrap gap-3 rounded-xl border border-gray-200 p-3"
            >
              <input type="hidden" name="courseId" value={course.id} />
              <input
                name="title"
                defaultValue={course.title}
                required
                maxLength={200}
                className="min-w-[12rem] flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              <input
                name="edition"
                defaultValue={course.edition ?? ''}
                placeholder="edizione"
                maxLength={60}
                className="w-40 rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              <input
                name="description"
                defaultValue={course.description ?? ''}
                placeholder="descrizione"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              <Button type="submit" size="sm">Salva</Button>
            </ActionForm>
          </details>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        <div>
          <CourseTabs
            tabs={[
              { key: 'configurazione', label: 'Configurazione', content: configPanel },
              { key: 'materiali', label: 'Materiali', content: materialsPanel },
              { key: 'partecipanti', label: 'Partecipanti', content: participantsPanel },
            ]}
          />
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Pubblicazione</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <ActionForm action={updateCourseStatusAction} className="space-y-2">
                <input type="hidden" name="courseId" value={course.id} />
                <label className="block text-xs font-medium text-gray-500">Stato del corso</label>
                <select
                  name="status"
                  defaultValue={course.status}
                  className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                >
                  <option value="draft">Bozza</option>
                  <option value="active">Attivo</option>
                  <option value="cancelled">Annullato</option>
                </select>
                <Button type="submit" variant="outline" className="w-full">
                  Salva modifiche
                </Button>
              </ActionForm>

              <div className="space-y-1.5 border-t border-gray-100 pt-3">
                <p className="text-xs font-medium text-gray-500">Stato di completamento</p>
                {checklist.map((item) => (
                  <div key={item.label} className="flex items-center gap-2 text-sm">
                    {item.done ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" aria-hidden="true" />
                    ) : (
                      <Circle className="h-4 w-4 shrink-0 text-gray-300" aria-hidden="true" />
                    )}
                    <span className={item.done ? 'text-gray-700' : 'text-gray-400'}>{item.label}</span>
                  </div>
                ))}
              </div>

              {course.status === 'draft' && (
                <ActionForm action={updateCourseStatusAction}>
                  <input type="hidden" name="courseId" value={course.id} />
                  <input type="hidden" name="status" value="active" />
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={course.modules.length === 0}
                  >
                    Attiva corso
                  </Button>
                </ActionForm>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex items-start gap-3 pt-6">
              {course.structureLocked ? (
                <>
                  <Lock className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-semibold text-gray-900">Programma bloccato</p>
                    <p className="mt-0.5 text-xs text-gray-500">
                      Almeno un coach è già assegnato. Crea una nuova edizione per modificare i moduli.
                    </p>
                    <ActionForm action={createNewEditionAction} className="mt-2 flex flex-wrap gap-2">
                      <input type="hidden" name="courseId" value={course.id} />
                      <input
                        name="edition"
                        placeholder="nome edizione (opzionale)"
                        maxLength={60}
                        className="min-w-0 flex-1 rounded-lg border border-gray-300 px-2 py-1.5 text-xs"
                      />
                      <Button type="submit" variant="outline" className="h-8 px-2.5 text-xs">
                        Crea nuova edizione
                      </Button>
                    </ActionForm>
                  </div>
                </>
              ) : (
                <>
                  <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-green-600" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-semibold text-gray-900">Struttura modificabile</p>
                    <p className="mt-0.5 text-xs text-gray-500">
                      Puoi ancora modificare titolo, moduli e ore.
                    </p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}
