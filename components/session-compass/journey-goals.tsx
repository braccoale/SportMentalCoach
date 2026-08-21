import {
  Brain,
  CirclePlus,
  Crosshair,
  TriangleAlert,
  Users,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import {
  JOURNEY_GOAL_STATUSES,
  JOURNEY_GOAL_STATUS_LABELS,
  type JourneyGoalRow,
  type JourneyGoalStatus,
} from '@/lib/core/ai-session-notes/journey-goals';

/**
 * «Temi e obiettivi nel tempo»: come evolvono i filoni di lavoro, seduta dopo
 * seduta.
 *
 * La differenza con un elenco di obiettivi è l'**asse condiviso**. Le sedute
 * sono le stesse colonne per tutte le righe, con la loro data in testa: così
 * una colonna si legge anche in verticale — «il 23 giugno abbiamo toccato
 * questi due filoni e non quest'altro» — e non serve confrontare a memoria
 * tracce che partono in punti diversi.
 *
 * I pallini non sono una stima: vengono dagli agganci scritti in tabella. Una
 * traccia vuota vuol dire davvero «non ci abbiamo lavorato», non «il
 * collegamento si è rotto» — che era il difetto della versione precedente.
 */

const STATUS_TONE: Record<JourneyGoalStatus, string> = {
  in_miglioramento: 'bg-green-50 text-green-700',
  in_corso: 'bg-blue-50 text-blue-700',
  da_riprendere: 'bg-amber-50 text-amber-800',
  raggiunto: 'bg-violet-50 text-violet-700',
};

/**
 * Una tinta e un'icona per riga, cicliche e stabili.
 *
 * Non significano niente: un obiettivo lo scrive il coach in testo libero e
 * non porta una categoria. Servono a distinguere quattro righe a colpo
 * d'occhio, e l'ordine è fisso perché la scheda non cambi aspetto a ogni
 * ricarica.
 */
const GOAL_ICONS: LucideIcon[] = [Crosshair, Brain, Zap, Users];
const TRACK_TINTS = [
  'var(--color-jp-problema)',
  'var(--color-jp-strategia)',
  'var(--color-jp-focus)',
  'var(--color-jp-applicazione)',
  'var(--color-jp-progresso)',
];

/** Larghezza fissa di una colonna-seduta: le righe devono incolonnarsi. */
const COLUMN_WIDTH_PX = 68;
/** Larghezza della colonna dei nomi, a sinistra dell'asse. */
const LABEL_WIDTH_PX = 208;

const shortDate = new Intl.DateTimeFormat('it-IT', {
  day: 'numeric',
  month: 'short',
  timeZone: 'Europe/Rome',
});
const fullDate = new Intl.DateTimeFormat('it-IT', {
  dateStyle: 'long',
  timeZone: 'Europe/Rome',
});
const dayKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' });

function columnLabel(iso: string | null, now: Date): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  if (dayKey.format(date) === dayKey.format(now)) return 'OGGI';
  return shortDate.format(date).replace('.', '').toUpperCase();
}

export function JourneyGoalsPanel({
  rows,
  athleteUserId,
  themes,
  addGoalAction,
  setStatusAction,
  now = new Date(),
}: {
  rows: readonly JourneyGoalRow[];
  athleteUserId: number;
  /** I temi ricorrenti a cui un obiettivo si può agganciare. */
  themes: ReadonlyArray<{ key: string; label: string; occurrences: number }>;
  addGoalAction: (formData: FormData) => Promise<void>;
  setStatusAction: (formData: FormData) => Promise<void>;
  now?: Date;
}) {
  // L'asse è lo stesso per tutte le righe: `buildJourneyGoalRows` costruisce
  // ogni traccia sulle stesse sedute, quindi la prima riga lo definisce.
  const axis = rows[0]?.track ?? [];

  return (
    <section className="flex h-full flex-col rounded-2xl border border-gray-200/70 bg-white p-5">
      <div>
        <h2 className="text-base font-bold tracking-tight text-gray-900">
          Temi e obiettivi nel tempo
        </h2>
        <p className="mt-0.5 text-sm text-gray-500">
          Come evolvono i filoni principali attraverso le sessioni.
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="mt-5 flex-1 text-sm leading-relaxed text-gray-500">
          Non hai ancora fissato nessun obiettivo per questo percorso. Un
          obiettivo è il filo che tiene insieme le sedute: senza, ogni riepilogo
          resta una cosa a sé.
        </p>
      ) : (
        <div className="-mx-1 mt-5 flex-1 overflow-x-auto px-1 pb-1">
          <div
            style={{
              minWidth: LABEL_WIDTH_PX + axis.length * COLUMN_WIDTH_PX + 150,
            }}
          >
            {/* Le date in testa: è ciò che rende leggibile una colonna in
                verticale. Senza, la traccia sarebbe una fila di pallini senza
                un quando. */}
            <div className="flex items-end">
              <div style={{ width: LABEL_WIDTH_PX }} />
              <div className="flex">
                {axis.map((dot, index) => (
                  <div
                    key={dot.sessionId}
                    style={{ width: COLUMN_WIDTH_PX }}
                    className="text-center"
                  >
                    <p className="text-[11px] font-semibold text-gray-400">
                      S{index + 1}
                    </p>
                    <p className="text-[11px] font-medium text-gray-500">
                      {columnLabel(dot.sessionDate, now)}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <ul className="mt-3 divide-y divide-gray-100">
              {rows.map((row, rowIndex) => {
                const tint = TRACK_TINTS[rowIndex % TRACK_TINTS.length];
                const Icon = GOAL_ICONS[rowIndex % GOAL_ICONS.length];
                return (
                  <li key={row.id} className="flex items-center py-3.5">
                    <div
                      className="flex shrink-0 items-center gap-3 pr-4"
                      style={{ width: LABEL_WIDTH_PX }}
                    >
                      <span
                        className="flex size-8 shrink-0 items-center justify-center rounded-full"
                        style={{
                          backgroundColor: `color-mix(in srgb, ${tint} 10%, white)`,
                        }}
                      >
                        <Icon
                          className="h-4 w-4"
                          style={{ color: tint }}
                          aria-hidden="true"
                        />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-gray-900">
                          {row.title}
                        </p>
                        {/* L'avviso vale anche per l'obiettivo principale:
                            prima «Obiettivo principale» lo copriva, e proprio
                            la riga più importante era l'unica a non dire
                            perché la sua traccia era vuota. */}
                        <p className="truncate text-xs text-gray-400">
                          {[
                            row.isPrimary ? 'Obiettivo principale' : null,
                            row.isTracked ? null : 'nessuna seduta agganciata',
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      </div>
                    </div>

                    {/* Un pallino per seduta, pieno dove l'obiettivo è stato
                        toccato. Il segmento fra due pallini si colora solo se
                        entrambi lo sono: così si vede dove il lavoro è stato
                        continuo e dove si è interrotto. */}
                    <div className="flex items-center">
                      {row.track.map((dot, index) => {
                        const previous = index > 0 ? row.track[index - 1] : null;
                        const continuous = Boolean(previous?.touched && dot.touched);
                        return (
                          <div
                            key={dot.sessionId}
                            style={{ width: COLUMN_WIDTH_PX }}
                            className="flex items-center"
                          >
                            <span
                              className="h-px flex-1"
                              style={{
                                backgroundColor: previous
                                  ? continuous
                                    ? `color-mix(in srgb, ${tint} 55%, white)`
                                    : '#e5e7eb'
                                  : 'transparent',
                              }}
                              aria-hidden="true"
                            />
                            <span
                              title={
                                dot.sessionDate
                                  ? `${dot.touched ? 'Toccato' : 'Non toccato'} · seduta del ${fullDate.format(new Date(dot.sessionDate))}`
                                  : undefined
                              }
                              className="size-2.5 shrink-0 rounded-full border-2"
                              style={{
                                borderColor: dot.touched ? tint : '#d1d5db',
                                backgroundColor: dot.touched
                                  ? 'white'
                                  : 'transparent',
                              }}
                            />
                            <span className="h-px flex-1" aria-hidden="true" />
                          </div>
                        );
                      })}
                      {/* Il percorso continua oltre l'ultima seduta registrata. */}
                      <span
                        className="ml-1 shrink-0 text-xs leading-none"
                        style={{
                          color: `color-mix(in srgb, ${tint} 60%, white)`,
                        }}
                        aria-hidden="true"
                      >
                        →
                      </span>
                    </div>

                    <div className="ml-auto flex shrink-0 items-center gap-2 pl-4">
                      {row.status === 'da_riprendere' && (
                        <TriangleAlert
                          className="h-3.5 w-3.5 text-amber-600"
                          aria-hidden="true"
                        />
                      )}
                      <details className="relative">
                        <summary
                          className={`cursor-pointer list-none whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_TONE[row.status]} [&::-webkit-details-marker]:hidden`}
                        >
                          {JOURNEY_GOAL_STATUS_LABELS[row.status]}
                        </summary>
                        <form
                          action={setStatusAction}
                          className="absolute right-0 z-20 mt-1.5 w-44 overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-lg"
                        >
                          <input
                            type="hidden"
                            name="athleteUserId"
                            value={athleteUserId}
                          />
                          <input type="hidden" name="goalId" value={row.id} />
                          {JOURNEY_GOAL_STATUSES.map((status) => (
                            <button
                              key={status}
                              type="submit"
                              name="status"
                              value={status}
                              className={`block w-full px-3 py-1.5 text-left text-sm transition hover:bg-gray-50 ${
                                status === row.status
                                  ? 'font-semibold text-gray-900'
                                  : 'text-gray-600'
                              }`}
                            >
                              {JOURNEY_GOAL_STATUS_LABELS[status]}
                            </button>
                          ))}
                        </form>
                      </details>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}

      {/* Il modulo sta dentro un `<details>`: chiuso è la riga del disegno,
          aperto è il posto dove si scrive. Nessuna seconda pagina, e nessuna
          riga di JavaScript per aprirlo. */}
      <details className="group mt-4 border-t border-gray-100 pt-3">
        <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 text-sm font-semibold text-violet-700 transition hover:text-violet-900 [&::-webkit-details-marker]:hidden">
          Aggiungi obiettivo
          <CirclePlus className="h-4 w-4 transition-transform group-open:rotate-45" />
        </summary>

        <form
          action={addGoalAction}
          className="mt-3 flex flex-wrap items-end gap-2"
        >
          <input type="hidden" name="athleteUserId" value={athleteUserId} />
          <label className="min-w-[12rem] flex-1">
            <span className="mb-1 block text-xs font-medium text-gray-500">
              Obiettivo
            </span>
            <input
              name="title"
              required
              maxLength={160}
              placeholder="Gestione dell'errore"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
            />
          </label>

          {/* Agganciarlo a un tema riempie subito la traccia con le sedute in
              cui quel tema è già emerso: un obiettivo nato oggi non parte da
              zero su un percorso che dura da mesi. */}
          <label className="min-w-[11rem] flex-1">
            <span className="mb-1 block text-xs font-medium text-gray-500">
              Tema collegato
            </span>
            <select
              name="themeKey"
              defaultValue=""
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
            >
              <option value="">Nessuno</option>
              {themes.map((theme) => (
                <option key={theme.key} value={theme.key}>
                  {theme.label} · {theme.occurrences}
                </option>
              ))}
            </select>
          </label>

          <button
            type="submit"
            className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-700"
          >
            Aggiungi
          </button>
        </form>
      </details>
    </section>
  );
}
