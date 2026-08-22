import { Check, Target } from 'lucide-react';
import {
  JOURNEY_GOAL_STATUS_LABELS,
  type JourneyGoalStatus,
} from '@/lib/core/ai-session-notes/journey-goals';

export type SessionGoalCheck = {
  id: number;
  title: string;
  isPrimary: boolean;
  status: JourneyGoalStatus;
  /** Questa seduta è già segnata su questo obiettivo. */
  touched: boolean;
};

/**
 * «Su quali obiettivi avete lavorato in questa seduta?»
 *
 * È il posto in cui nasce la traccia degli obiettivi, e sta qui per una
 * ragione che non è di disegno. Prima si spuntava nella scheda dell'atleta,
 * dentro una griglia di otto colonne: ventiquattro caselle da riempire in un
 * punto dove il coach non ha davanti nessun riepilogo e dovrebbe ricordarsi a
 * memoria di che cosa si è parlato in otto sedute. In produzione quella
 * griglia era vuota per **tutti** — l'unico percorso popolato era quello della
 * demo, riempito da uno script.
 *
 * Qui la domanda arriva quando il coach ha appena finito di leggere di che
 * cosa si è parlato, e la risposta è ovvia: un clic per obiettivo, una volta,
 * e resta.
 *
 * Nessun JavaScript: ogni obiettivo è un `form` con la sua azione. Un
 * interruttore che ha bisogno del client per esistere è un interruttore che
 * non funziona finché la pagina non ha finito di caricarsi, e questo compare
 * in fondo a una pagina lunga.
 */
export function SessionGoalsCheck({
  goals,
  athleteUserId,
  sessionId,
  toggleAction,
  athleteCardHref,
}: {
  goals: readonly SessionGoalCheck[];
  athleteUserId: number;
  sessionId: number;
  toggleAction: (formData: FormData) => Promise<void>;
  /** Dove si scrivono gli obiettivi, quando non ce n'è ancora nessuno. */
  athleteCardHref: string;
}) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-violet-50">
          <Target className="h-4 w-4 text-violet-700" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h3 className="text-base font-bold tracking-tight text-gray-950">
            Su quali obiettivi avete lavorato oggi?
          </h3>
          <p className="mt-0.5 text-sm leading-6 text-gray-600">
            Quello che segni qui costruisce il percorso nella scheda
            dell&rsquo;atleta. Puoi cambiarlo quando vuoi.
          </p>
        </div>
      </div>

      {goals.length === 0 ? (
        <p className="mt-4 text-sm leading-relaxed text-gray-500">
          Per questa persona non è ancora stato fissato nessun obiettivo. Si
          scrivono nella{' '}
          <a
            href={athleteCardHref}
            className="font-semibold text-violet-700 underline underline-offset-2 hover:text-violet-900"
          >
            sua scheda
          </a>
          , e da lì in poi compaiono qui a ogni seduta.
        </p>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {goals.map((goal) => (
            <li key={goal.id}>
              <form action={toggleAction}>
                <input
                  type="hidden"
                  name="athleteUserId"
                  value={athleteUserId}
                />
                <input type="hidden" name="goalId" value={goal.id} />
                {/* `sessionId` viaggia come valore del bottone: così il
                    modulo ha un campo in meno e il gesto resta uno solo. */}
                <button
                  type="submit"
                  name="sessionId"
                  value={sessionId}
                  title={
                    goal.touched
                      ? 'Questa seduta risulta aver lavorato su questo obiettivo. Clicca per togliere il segno.'
                      : 'Segna che in questa seduta avete lavorato su questo obiettivo.'
                  }
                  className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition ${
                    goal.touched
                      ? 'border-violet-300 bg-violet-50/70'
                      : 'border-gray-200 bg-white hover:border-violet-200 hover:bg-violet-50/40'
                  } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500`}
                >
                  {/* Una casella vera: piena o vuota, non due bordi di colore
                      diverso. È il difetto che rendeva illeggibile la griglia
                      da cui questo blocco nasce. */}
                  <span
                    aria-hidden="true"
                    className={`flex size-5 shrink-0 items-center justify-center rounded-md border-2 ${
                      goal.touched
                        ? 'border-violet-600 bg-violet-600 text-white'
                        : 'border-gray-300 bg-white'
                    }`}
                  >
                    {goal.touched && <Check className="h-3.5 w-3.5" />}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium leading-6 text-gray-900">
                      {goal.title}
                    </span>
                    <span className="block text-xs text-gray-500">
                      {[
                        goal.isPrimary ? 'Obiettivo principale' : null,
                        JOURNEY_GOAL_STATUS_LABELS[goal.status],
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>

                  <span className="sr-only">
                    {goal.touched
                      ? 'Segnato. Premi per togliere il segno.'
                      : 'Non segnato. Premi per segnarlo.'}
                  </span>
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
