import {
  CalendarClock,
  CheckCircle2,
  Circle,
  Clock,
  FileText,
  GraduationCap,
  Layers,
  Pencil,
  Sparkles,
} from 'lucide-react';
import { ActionForm } from '@/components/action-form';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusPill } from '@/components/admin/academy/status-pill';
import { JumpToTabButton } from '@/components/admin/academy/jump-to-tab-button';
import type { ActionState } from '@/lib/auth/middleware';
import type { CourseDetail } from '@/lib/core/academy/courses';
import type { CourseInstructor } from '@/lib/core/academy/instructors';
import type { CourseAssignment } from '@/lib/core/academy/assignments';
import type { CourseSessionRow } from '@/lib/core/academy/sessions';
import type { ModuleMaterial } from '@/lib/core/academy/materials';

type BoundAction = (state: ActionState, formData: FormData) => Promise<ActionState>;

function formatSessionTime(date: Date): string {
  return new Intl.DateTimeFormat('it-IT', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Rome',
  }).format(date);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export type CourseOverviewRole = 'admin' | 'instructor' | 'participant';

export type OwnProgress = {
  completedModules: number;
  totalModules: number;
  modules: { moduleId: number; title: string; completed: boolean }[];
};

export function CourseOverview({
  course,
  instructors,
  sessions,
  materialsByModule,
  heroImageUrl,
  role,
  updateCourseOverviewAction,
  uploadCourseHeroAction,
  allParticipants,
  ownProgress,
}: {
  course: CourseDetail;
  instructors: CourseInstructor[];
  sessions: CourseSessionRow[];
  materialsByModule: Map<number, ModuleMaterial[]>;
  heroImageUrl: string | null;
  role: CourseOverviewRole;
  updateCourseOverviewAction?: BoundAction;
  uploadCourseHeroAction?: BoundAction;
  /** Per admin/docente: il riepilogo di tutti i partecipanti. */
  allParticipants?: CourseAssignment[];
  /** Per il partecipante: solo il proprio avanzamento. */
  ownProgress?: OwnProgress | null;
}) {
  const now = Date.now();
  const nextSession = sessions
    .filter((s) => s.status === 'scheduled' && s.scheduledFor.getTime() > now)
    .sort((a, b) => a.scheduledFor.getTime() - b.scheduledFor.getTime())[0];
  const upcoming = sessions
    .filter((s) => s.status === 'scheduled' && s.scheduledFor.getTime() > now)
    .sort((a, b) => a.scheduledFor.getTime() - b.scheduledFor.getTime());

  const publishedMaterials = [...course.modules]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .flatMap((module) =>
      (materialsByModule.get(module.id) ?? [])
        .filter((m) => role === 'admin' || role === 'instructor' || m.published)
        .map((material) => ({ module, material }))
    );

  const canScheduleFirstSession =
    (role === 'admin' || role === 'instructor') &&
    course.status === 'active' &&
    course.modules.length > 0 &&
    sessions.filter((s) => s.status === 'scheduled').length === 0;

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="overflow-hidden rounded-2xl border border-gray-800 bg-gray-950 text-white">
        <div
          className="relative flex min-h-[220px] flex-col justify-end p-6 sm:p-8"
          style={
            heroImageUrl
              ? {
                  backgroundImage: `linear-gradient(180deg, rgba(5,10,8,0.35) 0%, rgba(5,10,8,0.92) 100%), url(${heroImageUrl})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                }
              : {
                  backgroundImage:
                    'radial-gradient(120% 140% at 15% 0%, rgba(220,38,38,0.18) 0%, rgba(5,10,8,0) 55%), linear-gradient(160deg, #0a1410 0%, #050807 100%)',
                }
          }
        >
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={course.status} />
            {course.edition && (
              <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-medium text-white/80">
                Edizione {course.edition}
              </span>
            )}
            {course.level && (
              <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-medium text-white/80">
                {course.level}
              </span>
            )}
          </div>
          <h1 className="mt-3 max-w-2xl text-3xl font-bold sm:text-4xl">{course.title}</h1>
          {course.description && (
            <p className="mt-2 max-w-xl text-sm text-white/70 sm:text-base">{course.description}</p>
          )}
          {instructors.length > 0 && (
            <p className="mt-3 flex items-center gap-1.5 text-sm text-white/70">
              <GraduationCap className="h-4 w-4" aria-hidden="true" />
              {instructors.map((i) => i.displayName).join(' · ')}
            </p>
          )}

          <div className="mt-5 flex flex-wrap items-center gap-5 border-t border-white/10 pt-4 text-sm">
            <span className="flex items-center gap-1.5 text-white/80">
              <Clock className="h-4 w-4" aria-hidden="true" />
              {course.totalHours} ore
              {course.modules.some((m) => m.hours === 0) && (
                <span className="text-white/40">(da confermare)</span>
              )}
            </span>
            <span className="flex items-center gap-1.5 text-white/80">
              <Layers className="h-4 w-4" aria-hidden="true" />
              {course.modules.length} moduli
            </span>
            {allParticipants && (
              <span className="flex items-center gap-1.5 text-white/80">
                <GraduationCap className="h-4 w-4" aria-hidden="true" />
                {allParticipants.length} partecipanti
              </span>
            )}

            {canScheduleFirstSession && (
              <JumpToTabButton targetKey="sessioni" className="ml-auto">
                Pianifica la prima sessione
              </JumpToTabButton>
            )}
          </div>
        </div>
      </div>

      {role === 'admin' && (updateCourseOverviewAction || uploadCourseHeroAction) && (
        <details>
          <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-900 [&::-webkit-details-marker]:hidden">
            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
            Modifica hero, livello e "cosa imparerai"
          </summary>
          <div className="mt-2 space-y-3 rounded-xl border border-gray-200 p-3">
            {uploadCourseHeroAction && (
              <ActionForm action={uploadCourseHeroAction} className="flex flex-wrap items-center gap-3">
                <input
                  name="file"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  required
                  className="text-sm"
                />
                <Button type="submit" size="sm">
                  Carica immagine hero
                </Button>
              </ActionForm>
            )}
            {updateCourseOverviewAction && (
              <ActionForm action={updateCourseOverviewAction} className="flex flex-col gap-2">
                <label className="text-sm">
                  <span className="mb-1 block text-xs font-medium text-gray-500">Livello</span>
                  <input
                    name="level"
                    defaultValue={course.level ?? ''}
                    placeholder="es. Livello avanzato"
                    maxLength={60}
                    className="w-full max-w-xs rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                  />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block text-xs font-medium text-gray-500">
                    Cosa imparerai (una riga per punto)
                  </span>
                  <textarea
                    name="whatYoullLearn"
                    defaultValue={(course.whatYoullLearn ?? []).join('\n')}
                    rows={5}
                    className="w-full resize-y rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                  />
                </label>
                <Button type="submit" size="sm" className="self-start">
                  Salva
                </Button>
              </ActionForm>
            )}
          </div>
        </details>
      )}

      {/* Cosa imparerai */}
      {course.whatYoullLearn && course.whatYoullLearn.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cosa imparerai</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {course.whatYoullLearn.map((point, index) => (
                <li key={index} className="flex items-start gap-2 text-sm text-gray-700">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" aria-hidden="true" />
                  {point}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Programma */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Programma</CardTitle>
        </CardHeader>
        <CardContent>
          {course.modules.length === 0 ? (
            <p className="text-sm text-gray-400">Nessun modulo ancora.</p>
          ) : (
            <ol className="space-y-2">
              {course.modules.map((module, index) => (
                <li key={module.id} className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-3">
                  <div className="flex items-start gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-indigo-100 bg-white text-xs font-semibold text-indigo-700">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{module.title}</p>
                      {module.description && (
                        <p className="mt-0.5 text-xs text-gray-500">{module.description}</p>
                      )}
                      <p className="mt-1 text-xs text-gray-500">
                        {module.hours > 0 ? `${module.hours} ore` : 'Ore da confermare'}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      {/* Prossima sessione + calendario compatto */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Prossima sessione</CardTitle>
        </CardHeader>
        <CardContent>
          {!nextSession ? (
            <p className="text-sm text-gray-400">
              {sessions.length === 0
                ? 'Nessuna sessione pianificata ancora.'
                : 'Nessuna sessione futura in programma.'}
            </p>
          ) : (
            <div className="rounded-xl border border-indigo-300 bg-indigo-50/60 p-4">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
                <CalendarClock className="h-4 w-4 text-indigo-600" aria-hidden="true" />
                {formatSessionTime(nextSession.scheduledFor)} · {nextSession.durationMin} min
              </p>
              <p className="mt-1 text-xs text-gray-600">
                {nextSession.moduleTitle} · Docente: {nextSession.instructorName} ·{' '}
                {nextSession.mode === 'group' ? 'sessione di gruppo' : 'sessione individuale'}
              </p>
              {nextSession.participants.length > 0 && (
                <p className="mt-1 text-xs text-gray-500">
                  Partecipanti: {nextSession.participants.map((p) => p.displayName).join(', ')}
                </p>
              )}
            </div>
          )}

          {upcoming.length > 1 && (
            <div className="mt-3 border-t border-gray-100 pt-3">
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">
                Anche in programma
              </p>
              <ul className="space-y-1">
                {upcoming.slice(1).map((session) => (
                  <li key={session.id} className="flex items-center gap-2 text-sm text-gray-700">
                    <CalendarClock className="h-3.5 w-3.5 shrink-0 text-gray-400" aria-hidden="true" />
                    {formatSessionTime(session.scheduledFor)} · {session.moduleTitle}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Materiali */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Materiali</CardTitle>
        </CardHeader>
        <CardContent>
          {publishedMaterials.length === 0 ? (
            <p className="text-sm text-gray-400">Nessun materiale pubblicato ancora.</p>
          ) : (
            <ul className="space-y-1.5">
              {publishedMaterials.map(({ module, material }) => (
                <li key={material.id} className="flex items-center justify-between gap-2 text-sm">
                  <a
                    href={`/api/academy/materials/${material.id}`}
                    className="flex min-w-0 items-center gap-2 text-gray-700 hover:underline"
                  >
                    <FileText className="h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
                    <span className="truncate">{material.title}</span>
                  </a>
                  <span className="shrink-0 text-xs text-gray-400">
                    {module.title} · {formatBytes(material.fileSizeBytes)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Avanzamento */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Avanzamento</CardTitle>
        </CardHeader>
        <CardContent>
          {ownProgress && (
            <ul className="space-y-1.5">
              {ownProgress.modules.map((module, index) => (
                <li key={module.moduleId} className="flex items-center gap-2 text-sm text-gray-700">
                  {module.completed ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" aria-label="Completato" />
                  ) : (
                    <Circle className="h-4 w-4 shrink-0 text-gray-300" aria-label="Da completare" />
                  )}
                  Modulo {index + 1} — {module.title}
                </li>
              ))}
            </ul>
          )}
          {allParticipants && (
            <ul className="space-y-1.5">
              {allParticipants.length === 0 ? (
                <p className="text-sm text-gray-400">Nessun partecipante assegnato.</p>
              ) : (
                allParticipants.map((participant) => (
                  <li key={participant.assignmentId} className="flex items-center gap-2 text-sm text-gray-700">
                    <span className="min-w-0 flex-1 truncate">{participant.displayName}</span>
                    <StatusPill status={participant.status} />
                    <span className="shrink-0 text-xs text-gray-400">
                      {participant.completedModules}/{participant.totalModules} moduli
                    </span>
                  </li>
                ))
              )}
            </ul>
          )}
          {!ownProgress && !allParticipants && (
            <p className="text-sm text-gray-400">
              <Sparkles className="mr-1.5 inline h-4 w-4 text-gray-300" aria-hidden="true" />
              Nessun avanzamento da mostrare ancora.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
