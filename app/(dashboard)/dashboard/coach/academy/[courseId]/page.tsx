import { notFound } from 'next/navigation';
import { CalendarClock, Clock, Layers, Trash2, Users2 } from 'lucide-react';
import { requireRole } from '@/lib/core/auth';
import { getCourseDetail } from '@/lib/core/academy/courses';
import { listInstructors } from '@/lib/core/academy/instructors';
import { listAssignments } from '@/lib/core/academy/assignments';
import { listMaterials, type ModuleMaterial } from '@/lib/core/academy/materials';
import { listSessionsForCourse } from '@/lib/core/academy/sessions';
import { ActionForm } from '@/components/action-form';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CourseTabs } from '@/components/admin/academy/course-tabs';
import { StatusPill } from '@/components/admin/academy/status-pill';
import { cn } from '@/lib/utils';
import {
  cancelSessionAction,
  createSessionAction,
  deleteMaterialAction,
  toggleMaterialPublishedAction,
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
  const rome = new Date(now.getTime() + 10 * 60_000); // almeno 10 minuti da adesso
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

export default async function CoachAcademyCourseDetailPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const coach = await requireRole('coach');
  const { courseId: courseIdRaw } = await params;
  const courseId = Number(courseIdRaw);
  if (!Number.isInteger(courseId) || courseId <= 0) notFound();

  let course;
  try {
    course = await getCourseDetail(coach.id, courseId);
  } catch {
    notFound();
  }
  if (!course) notFound();

  const [instructors, assignments, sessions, materialsByModule] = await Promise.all([
    listInstructors(coach.id, courseId),
    listAssignments(coach.id, courseId),
    listSessionsForCourse(coach.id, courseId),
    Promise.all(
      course.modules.map(
        async (module) => [module.id, await listMaterials(coach.id, courseId, module.id)] as const
      )
    ),
  ]);
  const materials = new Map<number, ModuleMaterial[]>(materialsByModule);
  const eligibleParticipants = assignments; // ogni coach assegnato al corso può essere invitato a una sessione

  const now = Date.now();
  const nextSession = sessions
    .filter((s) => s.status === 'scheduled' && s.scheduledFor.getTime() > now)
    .sort((a, b) => a.scheduledFor.getTime() - b.scheduledFor.getTime())[0];
  const nextSessionId = nextSession?.id ?? null;

  const overviewPanel = (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-6">
          {course.description ? (
            <p className="text-sm text-gray-700">{course.description}</p>
          ) : (
            <p className="text-sm text-gray-400">Nessuna descrizione.</p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-gray-500">
            <span className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" aria-hidden="true" />
              {course.totalHours} ore totali
            </span>
            <span className="flex items-center gap-1.5">
              <Layers className="h-3.5 w-3.5" aria-hidden="true" />
              {course.modules.length} moduli
            </span>
            <span className="flex items-center gap-1.5">
              <Users2 className="h-3.5 w-3.5" aria-hidden="true" />
              {assignments.length} partecipanti
            </span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Moduli</CardTitle>
        </CardHeader>
        <CardContent>
          {course.modules.length === 0 ? (
            <p className="text-sm text-gray-400">Nessun modulo ancora.</p>
          ) : (
            <ol className="space-y-2">
              {course.modules.map((module, index) => (
                <li
                  key={module.id}
                  className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-4"
                >
                  <div className="flex items-start gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-indigo-100 bg-white text-sm font-semibold text-indigo-700">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{module.title}</p>
                      {module.description && (
                        <p className="mt-0.5 text-xs text-gray-500">{module.description}</p>
                      )}
                      <p className="mt-1.5 text-xs text-gray-500">{module.hours} ore</p>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Docenti</CardTitle>
        </CardHeader>
        <CardContent>
          {instructors.length === 0 ? (
            <p className="text-sm text-gray-400">Nessun docente nominato.</p>
          ) : (
            <ul className="space-y-1 text-sm text-gray-700">
              {instructors.map((instructor) => (
                <li key={instructor.userId}>{instructor.displayName}</li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
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
          ) : eligibleParticipants.length === 0 ? (
            <p className="text-sm text-gray-400">
              Nessun coach è ancora assegnato a questo corso: l'admin deve assegnarne almeno uno
              prima che tu possa pianificare una sessione.
            </p>
          ) : (
            <ActionForm action={createSessionAction} className="flex flex-col gap-3">
              <input type="hidden" name="courseId" value={course.id} />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
                  {eligibleParticipants.map((participant) => (
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
                      {session.moduleTitle} ·{' '}
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

  const materialsPanel = (
    <div className="space-y-6">
      {course.modules.length === 0 ? (
        <p className="text-sm text-gray-400">Il corso non ha ancora moduli.</p>
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
          <p className="text-sm text-gray-400">Nessun coach assegnato a questo corso.</p>
        ) : (
          <ul className="space-y-1.5 text-sm text-gray-700">
            {assignments.map((assignment) => (
              <li key={assignment.assignmentId} className="flex items-center gap-2">
                {assignment.displayName}
                <StatusPill status={assignment.status} />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );

  return (
    <section className="space-y-6 p-4 lg:p-0">
      <div>
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-2xl font-bold text-gray-900">{course.title}</h1>
          {course.edition && <span className="text-lg font-normal text-gray-400">Edizione {course.edition}</span>}
          <StatusPill status={course.status} />
        </div>
      </div>

      <CourseTabs
        tabs={[
          { key: 'panoramica', label: 'Panoramica', content: overviewPanel },
          { key: 'sessioni', label: 'Sessioni', content: sessionsPanel },
          { key: 'materiali', label: 'Materiali', content: materialsPanel },
          { key: 'partecipanti', label: 'Partecipanti', content: participantsPanel },
        ]}
      />
    </section>
  );
}
