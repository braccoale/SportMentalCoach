import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  CalendarClock,
  CheckCircle2,
  Circle,
  Clock,
  Layers,
  Lock,
  Pencil,
  ShieldCheck,
  Trash2,
  Users2,
} from 'lucide-react';
import { requireRole } from '@/lib/core/auth';
import { getCourseDetail } from '@/lib/core/academy/courses';
import { listApprovedCoaches } from '@/lib/core/academy/coaches';
import { listInstructors } from '@/lib/core/academy/instructors';
import { listAssignments } from '@/lib/core/academy/assignments';
import { listMaterials, type ModuleMaterial } from '@/lib/core/academy/materials';
import { listSessionsForCourse } from '@/lib/core/academy/sessions';
import { ActionForm } from '@/components/action-form';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CourseTabs } from '@/components/admin/academy/course-tabs';
import { ReorderableModules } from '@/components/admin/academy/reorderable-modules';
import { StatusPill } from '@/components/admin/academy/status-pill';
import { cn } from '@/lib/utils';
import {
  assignCourseAction,
  cancelSessionAction,
  createModuleAction,
  createNewEditionAction,
  createSessionAction,
  deleteMaterialAction,
  deleteModuleAction,
  nominateInstructorAction,
  removeInstructorAction,
  reorderModulesAction,
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

/** Il valore locale che `<input type="datetime-local">` produce e si aspetta, in ora di Roma. */
function minDateTimeLocal(): string {
  const now = new Date();
  const rome = new Date(now.getTime() + 10 * 60_000);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Rome',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(rome);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
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

  const courseOrNull = await getCourseDetail(admin.id, courseId);
  if (!courseOrNull) notFound();
  // Un alias con tipo esplicitamente non-null: le funzioni annidate più
  // sotto (`moduleRowContent`) chiudono su questa variabile, e TypeScript
  // non riporta dentro una closure il narrowing ottenuto da `if (!x) return`
  // nello scope esterno.
  const course: NonNullable<typeof courseOrNull> = courseOrNull;

  const [coaches, instructors, assignments, sessions, materialsByModule] = await Promise.all([
    listApprovedCoaches(admin.id),
    listInstructors(admin.id, courseId),
    listAssignments(admin.id, courseId),
    listSessionsForCourse(admin.id, courseId),
    Promise.all(
      course.modules.map(
        async (module) => [module.id, await listMaterials(admin.id, courseId, module.id)] as const
      )
    ),
  ]);
  const materials = new Map<number, ModuleMaterial[]>(materialsByModule);
  const instructorIds = new Set(instructors.map((i) => i.userId));
  const assignedIds = new Set(assignments.map((a) => a.userId));
  const eligibleInstructors = coaches.filter((c) => !instructorIds.has(c.userId));
  const eligibleParticipants = coaches.filter((c) => !assignedIds.has(c.userId));

  const now = Date.now();
  const nextSession = sessions
    .filter((s) => s.status === 'scheduled' && s.scheduledFor.getTime() > now)
    .sort((a, b) => a.scheduledFor.getTime() - b.scheduledFor.getTime())[0];
  const nextSessionId = nextSession?.id ?? null;

  const checklist = [
    { label: 'Programma definito', done: course.modules.length > 0 },
    { label: 'Ore di formazione', done: course.totalHours > 0 },
    { label: 'Docente nominato', done: instructors.length > 0 },
  ];

  function moduleRowContent(module: (typeof course.modules)[number], index: number) {
    return (
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-indigo-100 bg-white text-sm font-semibold text-indigo-700">
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
                  <textarea
                    name="description"
                    defaultValue={module.description ?? ''}
                    placeholder="descrizione (opzionale)"
                    rows={3}
                    className="resize-y rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
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
    );
  }

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
          ) : course.structureLocked ? (
            <ol className="space-y-2">
              {course.modules.map((module, index) => (
                <li
                  key={module.id}
                  className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-4"
                >
                  {moduleRowContent(module, index)}
                </li>
              ))}
            </ol>
          ) : (
            <ReorderableModules
              items={course.modules.map((module, index) => ({
                id: module.id,
                node: moduleRowContent(module, index),
              }))}
              onReorder={async (orderedModuleIds) => {
                'use server';
                await reorderModulesAction(course.id, orderedModuleIds);
              }}
            />
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
              <textarea
                name="description"
                placeholder="descrizione (opzionale)"
                rows={2}
                className="min-w-[14rem] flex-1 resize-y rounded-lg border border-gray-300 px-3 py-2 text-sm"
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
            <ul className="mb-3 space-y-1.5">
              {instructors.map((instructor) => (
                <li
                  key={instructor.userId}
                  className="flex items-center justify-between gap-2 text-sm text-gray-700"
                >
                  <span>
                    {instructor.displayName}{' '}
                    <span className="text-xs text-gray-400">({instructor.email})</span>
                  </span>
                  <ActionForm
                    action={removeInstructorAction}
                    confirmTitle="Rimuovere il docente?"
                    confirmMessage={`${instructor.displayName} non sarà più docente di questo corso.`}
                    confirmActionLabel="Rimuovi"
                  >
                    <input type="hidden" name="courseId" value={course.id} />
                    <input type="hidden" name="userId" value={instructor.userId} />
                    <Button
                      type="submit"
                      variant="outline"
                      size="icon"
                      className="h-7 w-7"
                      aria-label={`Rimuovi ${instructor.displayName}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                  </ActionForm>
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

  const assignForm =
    course.status !== 'active' ? (
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
        <Button type="submit">Assegna coach</Button>
      </ActionForm>
    ) : null;

  const participantsPanel = (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Partecipanti</CardTitle>
      </CardHeader>
      <CardContent>
        {assignments.length === 0 ? (
          <div className="mb-4 rounded-xl border border-dashed border-gray-300 p-6 text-center">
            <Users2 className="mx-auto h-6 w-6 text-gray-300" aria-hidden="true" />
            <p className="mt-2 text-sm font-medium text-gray-900">Nessun coach assegnato</p>
            <p className="mt-0.5 text-xs text-gray-500">
              Assegna i coach al corso per aprire l'Academy ai partecipanti.
            </p>
            <div className="mt-3 flex justify-center">{assignForm}</div>
          </div>
        ) : (
          <>
            <ul className="mb-4 space-y-1.5 text-sm text-gray-700">
              {assignments.map((assignment) => (
                <li key={assignment.assignmentId} className="flex items-center gap-2">
                  {assignment.displayName}
                  <StatusPill status={assignment.status} />
                  <span className="text-xs text-gray-400">
                    {assignment.completedModules}/{assignment.totalModules} moduli completati
                  </span>
                </li>
              ))}
            </ul>
            {assignForm}
          </>
        )}
      </CardContent>
    </Card>
  );

  const sessionsPanel = (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pianifica sessione</CardTitle>
        </CardHeader>
        <CardContent>
          {course.status !== 'active' ? (
            <p className="text-sm text-gray-400">
              Il corso non è attivo: la pianificazione delle sessioni è disponibile solo per corsi
              attivi.
            </p>
          ) : course.modules.length === 0 ? (
            <p className="text-sm text-gray-400">
              Il corso non ha ancora moduli: aggiungine almeno uno prima di pianificare una
              sessione.
            </p>
          ) : instructors.length === 0 ? (
            <p className="text-sm text-gray-400">Nomina almeno un docente prima di pianificare una sessione.</p>
          ) : assignments.length === 0 ? (
            <p className="text-sm text-gray-400">
              Nessun coach è ancora assegnato a questo corso: assegnane almeno uno prima di
              pianificare una sessione.
            </p>
          ) : (
            <ActionForm action={createSessionAction} className="flex flex-col gap-3">
              <input type="hidden" name="courseId" value={course.id} />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="text-sm">
                  <span className="mb-1 block text-xs font-medium text-gray-500">Docente</span>
                  <select
                    name="instructorUserId"
                    required
                    className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                  >
                    {instructors.map((instructor) => (
                      <option key={instructor.userId} value={instructor.userId}>
                        {instructor.displayName}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm">
                  <span className="mb-1 block text-xs font-medium text-gray-500">Modulo</span>
                  <select
                    name="moduleId"
                    required
                    className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                  >
                    {course.modules.map((module, index) => (
                      <option key={module.id} value={module.id}>
                        Modulo {index + 1} — {module.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm">
                  <span className="mb-1 block text-xs font-medium text-gray-500">Modalità</span>
                  <select
                    name="mode"
                    required
                    className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                  >
                    <option value="individual">Individuale</option>
                    <option value="group">Di gruppo</option>
                  </select>
                </label>
                <label className="text-sm">
                  <span className="mb-1 block text-xs font-medium text-gray-500">Data e ora</span>
                  <input
                    type="datetime-local"
                    name="scheduledFor"
                    required
                    min={minDateTimeLocal()}
                    className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                  />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block text-xs font-medium text-gray-500">Durata (minuti)</span>
                  <input
                    type="number"
                    name="durationMin"
                    required
                    min={15}
                    step={5}
                    defaultValue={60}
                    className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                  />
                </label>
              </div>
              <label className="text-sm">
                <span className="mb-1 block text-xs font-medium text-gray-500">
                  Descrizione (opzionale)
                </span>
                <textarea
                  name="description"
                  rows={2}
                  placeholder="agenda, note per i partecipanti…"
                  className="w-full resize-y rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                />
              </label>
              <fieldset>
                <legend className="mb-1 text-xs font-medium text-gray-500">
                  Partecipanti — individuale: esattamente uno, gruppo: almeno due
                </legend>
                <div className="flex flex-wrap gap-3">
                  {assignments.map((participant) => (
                    <label
                      key={participant.assignmentId}
                      className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm"
                    >
                      <input
                        type="checkbox"
                        name="participantAssignmentIds"
                        value={participant.assignmentId}
                        className="size-4 rounded border-gray-300"
                      />
                      {participant.displayName}
                    </label>
                  ))}
                </div>
              </fieldset>
              <Button type="submit" className="self-start">
                Pianifica sessione
              </Button>
            </ActionForm>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sessioni programmate</CardTitle>
        </CardHeader>
        <CardContent>
          {sessions.length === 0 ? (
            <p className="text-sm text-gray-400">
              I partecipanti non hanno ancora sessioni. Pianifica la prima sessione qui sopra.
            </p>
          ) : (
            <ul className="space-y-2">
              {sessions.map((session) => {
                const isNext = session.id === nextSessionId;
                return (
                  <li
                    key={session.id}
                    className={cn(
                      'flex flex-wrap items-start justify-between gap-3 rounded-xl border p-4',
                      isNext ? 'border-indigo-300 bg-indigo-50/60' : 'border-gray-200'
                    )}
                  >
                    <div>
                      {isNext && (
                        <span className="mb-1.5 inline-flex items-center rounded-full bg-indigo-600 px-2 py-0.5 text-[11px] font-semibold text-white">
                          Prossima sessione
                        </span>
                      )}
                      <p className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
                        <CalendarClock className="h-4 w-4 text-gray-400" aria-hidden="true" />
                        {formatSessionTime(session.scheduledFor)} · {session.durationMin} min
                      </p>
                      <p className="mt-0.5 text-xs text-gray-500">
                        {session.moduleTitle} · Docente: {session.instructorName} ·{' '}
                        {session.mode === 'group' ? 'Sessione di gruppo' : 'Sessione individuale'}
                      </p>
                      {session.description && (
                        <p className="mt-1 text-xs text-gray-500">{session.description}</p>
                      )}
                      <p className="mt-1 text-xs text-gray-500">
                        Partecipanti: {session.participants.map((p) => p.displayName).join(', ')}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <StatusPill status={session.status} />
                      {session.status === 'scheduled' && (
                        <ActionForm
                          action={cancelSessionAction}
                          confirmTitle="Annullare la sessione?"
                          confirmMessage="I partecipanti non potranno più entrare in questa sessione."
                          confirmActionLabel="Annulla"
                        >
                          <input type="hidden" name="sessionId" value={session.id} />
                          <input type="hidden" name="courseId" value={course.id} />
                          <Button
                            type="submit"
                            variant="outline"
                            size="icon"
                            className="h-8 w-8"
                            aria-label="Annulla sessione"
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        </ActionForm>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
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
              <textarea
                name="description"
                defaultValue={course.description ?? ''}
                placeholder="descrizione"
                rows={3}
                className="w-full resize-y rounded-lg border border-gray-300 px-3 py-2 text-sm"
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
              { key: 'sessioni', label: 'Sessioni', content: sessionsPanel },
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
