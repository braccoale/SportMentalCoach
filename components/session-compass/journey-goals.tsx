import Link from 'next/link';
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
  summarizeGoalTrack,
  type GoalTrackSummary,
  type JourneyGoalRow,
  type JourneyGoalSession,
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

/**
 * A che punto è un obiettivo, in una riga.
 *
 * La griglia che stava qui prima chiedeva a chi guarda di contare dei
 * cerchietti e di ricostruirsi da solo la frase. Questa la scrive.
 */
function trackSentence(summary: GoalTrackSummary): string {
  if (summary.totalCount === 0) {
    return 'Non ci sono ancora sedute su cui segnarlo.';
  }
  if (summary.touchedCount === 0) {
    return summary.totalCount === 1
      ? 'Mai segnato nell’unica seduta del percorso.'
      : `Mai segnato nelle ultime ${summary.totalCount} sedute.`;
  }

  const coverage = `Segnato in ${summary.touchedCount} ${
    summary.touchedCount === 1 ? 'seduta' : 'sedute'
  } su ${summary.totalCount}`;

  if (summary.sessionsSinceLastTouch === 0) {
    return `${coverage} · l’ultima è la più recente.`;
  }

  const when = summary.lastTouchedAt
    ? ` · l’ultima il ${shortDate.format(new Date(summary.lastTouchedAt))}`
    : '';
  const gap =
    summary.sessionsSinceLastTouch && summary.stale
      ? `, non ripreso nelle ${summary.sessionsSinceLastTouch} sedute successive`
      : '';
  return `${coverage}${when}${gap}.`;
}

/**
 * La traccia, ridotta a quello che sa dire davvero.
 *
 * Non porta più le date in testa e non è più un modulo: è una fila di
 * pallini che dice **se il lavoro è stato continuo**, e ogni pallino porta a
 * quella seduta. La differenza fra segnato e non segnato è pieno contro
 * vuoto — prima erano due anelli di colore diverso, e su dieci pixel non li
 * distingueva nessuno.
 */
function MiniTrack({ row, tint }: { row: JourneyGoalRow; tint: string }) {
  if (row.track.length === 0) return null;

  return (
    <ol className="mt-2 flex items-center gap-1">
      {row.track.map((dot) => {
        const when = dot.sessionDate
          ? `seduta del ${fullDate.format(new Date(dot.sessionDate))}`
          : 'seduta senza data';
        return (
          <li key={dot.sessionId}>
            <Link
              href={dot.href}
              title={`${
                dot.touched ? 'Segnato' : 'Non segnato'
              } · ${when} · apri il riepilogo per cambiarlo`}
              className="block size-2.5 rounded-full border transition-transform hover:scale-[1.6]"
              style={{
                borderColor: dot.touched ? tint : '#d1d5db',
                backgroundColor: dot.touched ? tint : 'transparent',
              }}
            >
              <span className="sr-only">
                {dot.touched ? 'Segnato' : 'Non segnato'}: {when}
              </span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}

function GoalRow({
  row,
  index,
  athleteUserId,
  setStatusAction,
}: {
  row: JourneyGoalRow;
  index: number;
  athleteUserId: number;
  setStatusAction: (formData: FormData) => Promise<void>;
}) {
  const tint = TRACK_TINTS[index % TRACK_TINTS.length];
  const Icon = GOAL_ICONS[index % GOAL_ICONS.length];
  const summary = summarizeGoalTrack(row);

  return (
    <li className="flex items-start gap-3 py-3.5">
      <span
        className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full"
        style={{ backgroundColor: `color-mix(in srgb, ${tint} 10%, white)` }}
      >
        <Icon className="h-4 w-4" style={{ color: tint }} aria-hidden="true" />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
          {/* Il titolo non si tronca più. Era largo 208 px perché doveva
              stare a sinistra di otto colonne; adesso ha tutta la riga, e un
              obiettivo scritto da una persona si legge per intero. */}
          <p className="min-w-0 flex-1 text-sm font-semibold leading-6 text-gray-900">
            {row.title}
          </p>

          {/* Lo stato è l'unica cosa qui dentro scritta da un essere umano.
              Stava dopo le otto colonne, cioè oltre il bordo dello
              scorrimento: c'era, e non lo vedeva nessuno. */}
          <details className="relative shrink-0">
            <summary
              className={`cursor-pointer list-none whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_TONE[row.status]} [&::-webkit-details-marker]:hidden`}
              title="Il giudizio del coach su questo obiettivo. Clicca per cambiarlo."
            >
              {JOURNEY_GOAL_STATUS_LABELS[row.status]}
            </summary>
            <form
              action={setStatusAction}
              className="absolute right-0 z-20 mt-1.5 w-44 overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-lg"
            >
              <input type="hidden" name="athleteUserId" value={athleteUserId} />
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

        {row.isPrimary && (
          <p className="text-xs text-gray-400">Obiettivo principale</p>
        )}

        <p
          className={`mt-1 flex items-center gap-1.5 text-xs ${
            summary.stale ? 'font-medium text-amber-700' : 'text-gray-500'
          }`}
        >
          {summary.stale && (
            <TriangleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          )}
          {trackSentence(summary)}
        </p>

        <MiniTrack row={row} tint={tint} />
      </div>
    </li>
  );
}

/**
 * «Obiettivi del percorso»: su che cosa il coach sta lavorando con questa
 * persona, e se ci sta ancora lavorando.
 *
 * Si chiamava «Temi e obiettivi nel tempo» ed era una griglia: una colonna
 * per seduta, una riga per obiettivo, un cerchietto per incrocio. Tre difetti
 * che si sommavano — il pallino «segnato» non era pieno ma solo di un altro
 * colore, i titoli erano troncati a 208 px, e lo stato scritto dal coach
 * finiva oltre il bordo dello scorrimento. Il risultato è che la contabilità
 * occupava tutto lo spazio e nascondeva l'unica informazione che valeva.
 *
 * Adesso ogni obiettivo è una riga che si legge: titolo intero, giudizio del
 * coach sempre in vista, e una frase che dice se il filone è vivo o fermo. La
 * traccia resta sotto, piccola, per rispondere alla sola domanda a cui i
 * pallini rispondono bene: il lavoro è stato continuo o a singhiozzo.
 *
 * **Le sedute non si spuntano più qui.** Il gesto è passato in fondo al
 * riepilogo di seduta, dove il coach ha appena letto di che cosa si è parlato
 * e la risposta è ovvia. Nella scheda erano ventiquattro clic da fare
 * ricordandosi otto sedute a memoria, ed è il motivo per cui in produzione
 * questa griglia era vuota per tutti.
 */
export function JourneyGoalsPanel({
  rows,
  athleteUserId,
  sessions,
  addGoalAction,
  setStatusAction,
  now = new Date(),
}: {
  rows: readonly JourneyGoalRow[];
  athleteUserId: number;
  /**
   * Le sedute su cui si puo' spuntare scrivendo un obiettivo nuovo. Arrivano
   * dall'esterno e non da `rows[0].track` perche' servono anche quando gli
   * obiettivi sono zero: e' proprio allora che il coach scrive il primo.
   */
  sessions: readonly JourneyGoalSession[];
  addGoalAction: (formData: FormData) => Promise<void>;
  setStatusAction: (formData: FormData) => Promise<void>;
  now?: Date;
}) {
  const axis = sessions;

  return (
    <section className="flex h-full flex-col rounded-2xl border border-gray-200/70 bg-white p-5">
      <div>
        <h2 className="text-base font-bold tracking-tight text-gray-900">
          Obiettivi del percorso
        </h2>
        <p className="mt-0.5 text-sm text-gray-500">
          Che cosa state cercando di ottenere, e se ci state ancora lavorando.
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="mt-5 flex-1 text-sm leading-relaxed text-gray-500">
          Non hai ancora fissato nessun obiettivo per questo percorso. Un
          obiettivo è il filo che tiene insieme le sedute: senza, ogni riepilogo
          resta una cosa a sé.
        </p>
      ) : (
        <ul className="mt-4 flex-1 divide-y divide-gray-100">
          {rows.map((row, index) => (
            <GoalRow
              key={row.id}
              row={row}
              index={index}
              athleteUserId={athleteUserId}
              setStatusAction={setStatusAction}
            />
          ))}
        </ul>
      )}

      {/* Il modulo sta dentro un `<details>`: chiuso è la riga del disegno,
          aperto è il posto dove si scrive. Nessuna seconda pagina, e nessuna
          riga di JavaScript per aprirlo. */}
      <details className="group mt-4 border-t border-gray-100 pt-3">
        <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 text-sm font-semibold text-violet-700 transition hover:text-violet-900 [&::-webkit-details-marker]:hidden">
          Aggiungi obiettivo
          <CirclePlus className="h-4 w-4 transition-transform group-open:rotate-45" />
        </summary>

        <form action={addGoalAction} className="mt-3">
          <input type="hidden" name="athleteUserId" value={athleteUserId} />
          <div className="flex flex-wrap items-end gap-2">
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

            <button
              type="submit"
              className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-700"
            >
              Aggiungi
            </button>
          </div>

          {/* Spuntare le sedute in cui l'obiettivo è già in gioco fa nascere la
              traccia con la sua storia, invece che vuota su un percorso che
              dura da mesi. È facoltativo: i pallini si accendono anche dopo,
              uno a uno, dalla riga. */}
          {axis.length > 0 && (
            <fieldset className="mt-3">
              <legend className="mb-1.5 text-xs font-medium text-gray-500">
                Sedute in cui è già in gioco{' '}
                <span className="text-gray-400">(facoltativo)</span>
              </legend>
              <div className="flex flex-wrap gap-1.5">
                {axis.map((session) => (
                  <label
                    key={session.sessionId}
                    className="cursor-pointer select-none"
                  >
                    <input
                      type="checkbox"
                      name="sessionIds"
                      value={session.sessionId}
                      className="peer sr-only"
                    />
                    <span className="inline-flex items-center gap-1 rounded-full border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 transition peer-checked:border-violet-500 peer-checked:bg-violet-50 peer-checked:text-violet-800 peer-focus-visible:ring-2 peer-focus-visible:ring-violet-400 peer-focus-visible:ring-offset-1">
                      S{session.ordinal}
                      {/* L'opacità e non un colore: il colore lo decide lo
                          stato del `peer`, che è un fratello dello span
                          esterno e non di questo. */}
                      <span className="opacity-60">
                        {columnLabel(session.sessionDate, now)}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}
        </form>
      </details>
    </section>
  );
}
