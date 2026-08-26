import { Sparkles, Target, Bookmark, PenLine } from 'lucide-react';
import {
  COLLAPSED_EXCERPT_TURNS,
  type BriefTurn,
  type SessionBrief,
} from '@/lib/core/ai-session-notes/session-brief';

/**
 * La sintesi che il coach legge prima della seduta, sul web.
 *
 * **Che cosa non fa.** Non genera niente. Ogni riga qui dentro è qualcosa che
 * il coach ha già scritto o già validato: gli obiettivi che ha concordato con
 * l'atleta, la sintesi del riepilogo che ha approvato, la sua nota libera —
 * che l'AI non produce e non sovrascrive mai — e i momenti che ha marcato dal
 * vivo durante la chiamata. Quando quel materiale non c'è, la sezione lo dice
 * e si ferma: da qui esce il piano di una seduta con una persona reale, e una
 * frase inventata diventerebbe parte di quel piano.
 *
 * **Perché quest'ordine.** Prima dove state andando, perché è la cornice che
 * rende leggibile il resto; poi dove eravate rimasti; infine che cosa
 * riprendere. È l'ordine in cui servono a chi apre la pagina un quarto d'ora
 * prima della call.
 *
 * La sezione si disegna anche quando è vuota, di proposito: «Preparati», nella
 * scheda della prossima call, punta alla sua ancora. Se sparisse, il pulsante
 * aprirebbe la pagina in cima e sembrerebbe rotto — è già successo con
 * `#session-compass`.
 */
export function SessionBriefSection({
  brief,
  athleteName,
}: {
  brief: SessionBrief | null;
  /** Il nome di chi si ha davanti: uno stralcio con «Lui/lei» non e' un dialogo. */
  athleteName?: string | null;
}) {
  return (
    <section
      id="session-brief"
      aria-labelledby="session-brief-heading"
      className="rounded-3xl bg-white p-6 ring-1 ring-gray-200"
    >
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-violet-600" />
        <h2
          id="session-brief-heading"
          className="text-xs font-bold uppercase tracking-[0.16em] text-gray-500"
        >
          Da portare in questa seduta
        </h2>
      </div>

      {brief === null || !brief.hasContent ? (
        <EmptyBrief reason={brief?.emptyReason ?? 'no_sessions'} />
      ) : (
        <div className="mt-5 space-y-6">
          {brief.goals.length > 0 ? (
            <Block icon={<Target className="h-4 w-4" />} title="Dove siete">
              <ul className="space-y-2">
                {brief.goals.map((goal) => (
                  <li
                    key={goal.id}
                    className="flex items-baseline justify-between gap-4"
                  >
                    <span className="text-[15px] leading-6 text-gray-900">
                      {goal.isPrimary ? (
                        <span
                          className="mr-1.5 text-amber-500"
                          aria-label="Obiettivo principale"
                        >
                          ★
                        </span>
                      ) : null}
                      {goal.title}
                    </span>
                    <span className="shrink-0 text-xs text-gray-500">
                      {goal.statusLabel}
                    </span>
                  </li>
                ))}
              </ul>
            </Block>
          ) : null}

          {brief.lastSession ? (
            <Block
              icon={<PenLine className="h-4 w-4" />}
              title={
                brief.lastSession.date
                  ? `L’ultima seduta · ${formatDay(brief.lastSession.date)}`
                  : 'L’ultima seduta'
              }
            >
              {brief.lastSession.summary ? (
                <p className="text-[15px] leading-6 text-gray-900">
                  {brief.lastSession.summary}
                </p>
              ) : null}

              {/* La nota del coach è l'unica cosa qui dentro scritta da lui e
                  non dall'AI: la barra a lato lo dice senza spiegarlo. */}
              {brief.lastSession.coachNote ? (
                <div className="mt-3 border-l-2 border-violet-300 pl-3">
                  <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-gray-500">
                    La tua nota
                  </p>
                  <p className="mt-0.5 text-sm leading-6 text-gray-900">
                    {brief.lastSession.coachNote}
                  </p>
                </div>
              ) : null}

              {brief.lastSession.bookmarks.length > 0 ? (
                <ul className="mt-3 space-y-1.5">
                  {brief.lastSession.bookmarks.map((bookmark) => (
                    <li key={bookmark.id} className="flex items-start gap-2.5">
                      <Bookmark className="mt-1 h-3.5 w-3.5 shrink-0 text-violet-500" />
                      <div className="min-w-0 flex-1 text-sm leading-6 text-gray-700">
                        <span className="mr-2 font-semibold text-gray-500">
                          {bookmark.minute}′
                        </span>
                        {/*
                          Ordine: la nota del coach se c'è, altrimenti lo
                          scambio dalla trascrizione. Non un frammento: i
                          segmenti durano due secondi, e citarne uno mostrava
                          cose come «ad ascoltare di più».
                        */}
                        {bookmark.note ? (
                          bookmark.note
                        ) : bookmark.turns.length > 0 ? (
                          <BookmarkExcerpt
                            turns={bookmark.turns}
                            athleteName={athleteName}
                          />
                        ) : (
                          <span className="text-gray-500">
                            Segnato qui, ma la trascrizione di questa seduta non
                            è disponibile.
                          </span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : null}
            </Block>
          ) : null}

          {brief.pointsToRevisit.length > 0 ? (
            <Block
              icon={<Sparkles className="h-4 w-4" />}
              title="Da riprendere"
            >
              <ul className="space-y-3">
                {brief.pointsToRevisit.map((point) => (
                  <li key={point.id}>
                    <p className="text-[15px] leading-6 text-gray-900">
                      {point.text}
                    </p>
                    <p className="mt-0.5 flex items-center gap-2 text-xs text-gray-500">
                      {point.sourceLabel}
                      {/* Un punto preso da una bozza non è sbagliato, ma
                          nessuno l'ha ancora letto — e da qui diventa il piano
                          della seduta. */}
                      {point.fromDraft ? (
                        <span className="rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-700 ring-1 ring-amber-200">
                          Da validare
                        </span>
                      ) : null}
                    </p>
                  </li>
                ))}
              </ul>
            </Block>
          ) : null}
        </div>
      )}
    </section>
  );
}

function Block({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-gray-500">
        {icon}
        <h3 className="text-[11px] font-bold uppercase tracking-[0.14em]">
          {title}
        </h3>
      </div>
      <div className="mt-2">{children}</div>
    </div>
  );
}

/**
 * Il vuoto si dichiara, non si riempie — e le due ragioni non sono la stessa
 * cosa. Al primo incontro con un atleta, «niente da riprendere» suonerebbe
 * come un guasto invece che come un fatto.
 */
function EmptyBrief({ reason }: { reason: 'no_sessions' | 'nothing_to_carry' }) {
  return (
    <div className="mt-4">
      <p className="text-[15px] font-semibold text-gray-900">
        {reason === 'nothing_to_carry'
          ? 'Niente rimasto in sospeso.'
          : 'Non ci sono ancora sedute con un riepilogo.'}
      </p>
      <p className="mt-1 text-sm leading-6 text-gray-600">
        {reason === 'nothing_to_carry'
          ? 'Le sedute precedenti hanno un riepilogo, ma non hanno lasciato impegni aperti né punti da riprendere. Quello che segni durante questa chiamata comparirà qui la prossima volta.'
          : 'Questa sintesi mette insieme gli obiettivi del percorso, il riepilogo dell’ultima seduta e i momenti che segni durante la chiamata. Finché non c’è quel materiale non viene inventato niente: dopo la prima seduta registrata, qui trovi che cosa portare alla successiva.'}
      </p>
    </div>
  );
}

/**
 * Lo scambio attorno al segnalibro.
 *
 * Due battute in riga, il resto si apre. Aperto tutto d'un fiato, uno stralcio
 * di sei battute spingerebbe fuori dallo schermo il resto della sintesi — e
 * questa e' una preparazione, non la trascrizione. Usa `<details>`, che si
 * apre senza JavaScript e resta accessibile da tastiera.
 */
function BookmarkExcerpt({
  turns,
  athleteName,
}: {
  turns: readonly BriefTurn[];
  athleteName?: string | null;
}) {
  const visible = turns.slice(0, COLLAPSED_EXCERPT_TURNS);
  const hidden = turns.slice(COLLAPSED_EXCERPT_TURNS);
  const label = (turn: BriefTurn) =>
    turn.speaker === 'coach' ? 'Tu' : athleteName?.trim() || 'Atleta';

  return (
    <span className="align-top">
      {visible.map((turn, index) => (
        <span key={index} className="block">
          <span className="text-gray-500">{label(turn)}: </span>
          <span className="italic">{turn.text}</span>
        </span>
      ))}
      {hidden.length > 0 ? (
        <details className="group/excerpt mt-1">
          <summary className="cursor-pointer list-none text-xs font-medium text-violet-700 hover:text-violet-900">
            <span className="group-open/excerpt:hidden">
              Continua a leggere ({hidden.length} in piu&#39;)
            </span>
            <span className="hidden group-open/excerpt:inline">Riduci</span>
          </summary>
          <span className="mt-1 block">
            {hidden.map((turn, index) => (
              <span key={index} className="block">
                <span className="text-gray-500">{label(turn)}: </span>
                <span className="italic">{turn.text}</span>
              </span>
            ))}
          </span>
        </details>
      ) : null}
    </span>
  );
}

function formatDay(date: Date): string {
  return new Intl.DateTimeFormat('it-IT', {
    day: 'numeric',
    month: 'long',
  }).format(date);
}
