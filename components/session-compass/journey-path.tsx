import Link from 'next/link';
import {
  Send,
  ArrowRight,
  Ban,
  CalendarClock,
  Clock3,
  CirclePlay,
  Flag,
  Puzzle,
  Repeat,
  Search,
  Target,
  TrendingUp,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import {
  JOURNEY_STAGE_KINDS,
  JOURNEY_STAGE_LABELS,
  MIN_JOURNEY_STAGES,
  type JourneyStage,
  type JourneyStageKind,
} from '@/lib/core/ai-session-notes/journey-stages';
import type { KeyMomentCategory } from '@/lib/core/ai-session-notes/session-compass-contract';

/**
 * «Il percorso»: la prima cosa che un coach vede aprendo la scheda di una
 * persona.
 *
 * Non è un elenco di sedute — quello sta sotto, e serve a un'altra domanda.
 * Questa striscia risponde a «dove siamo arrivati», e deve rispondere prima
 * che si legga una parola: il colore dice la fase, la linea dice che è una
 * sequenza, l'ultimo pallino dice dove si sta lavorando adesso.
 *
 * Il componente disegna `JourneyStage[]` e non sa nient'altro: non conosce i
 * momenti chiave, non conosce le categorie del report, non decide che cosa
 * meriti una tappa. Quella regola vive in `lib/core/ai-session-notes/
 * journey-stages.ts` con il suo test, e può cambiare — o passare da un
 * modello — senza che qui si muova un pixel.
 */

/** Una tinta per fase. Bordo, testo, pallino e linea nascono tutte da qui. */
const STAGE_TINT: Record<JourneyStageKind, string> = {
  problema: 'var(--color-jp-problema)',
  strategia: 'var(--color-jp-strategia)',
  applicazione: 'var(--color-jp-applicazione)',
  progresso: 'var(--color-jp-progresso)',
  focus_attuale: 'var(--color-jp-focus)',
  pianificata: 'var(--color-jp-pianificata)',
};

/**
 * L'icona segue la categoria del momento, non la fase.
 *
 * Dentro «Strategia» un esercizio proposto e una presa di consapevolezza sono
 * lo stesso passo del lavoro ma non la stessa cosa: due icone lo dicono senza
 * spendere una parola, che sulla card non c'è.
 */
const ICON_BY_CATEGORY: Record<KeyMomentCategory, LucideIcon> = {
  goal: Flag,
  resistance: Ban,
  risk: TriangleAlert,
  awareness: Search,
  exercise: Puzzle,
  commitment: CirclePlay,
  follow_up: Repeat,
  turning_point: TrendingUp,
};

/**
 * Larghezza **fissa** di una card, non minima.
 *
 * Con `1fr` due sole tappe si allargavano fino a mezza pagina e la striscia
 * cambiava aspetto a seconda di quante sedute avesse l'atleta. Una card larga
 * uguale sempre e' anche l'unico modo perche' due percorsi diversi si possano
 * confrontare a colpo d'occhio.
 */
const CARD_WIDTH_PX = 176;
/**
 * La gronda fra due card. Vive qui e non solo nella classe Tailwind perché la
 * linea sotto deve scavalcarla: se i due valori divergono, la linea si spezza.
 */
const GRID_GAP = '0.75rem';

function mix(tint: string, percent: number, into = 'white'): string {
  return `color-mix(in srgb, ${tint} ${percent}%, ${into})`;
}

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

/**
 * «12 MAG», oppure «OGGI» quando la seduta è davvero di oggi.
 *
 * Il mockup segna l'ultima tappa come OGGI perché è lì che si sta lavorando.
 * Ma l'ultima seduta approvata può essere di tre settimane fa, e scriverci
 * sopra «oggi» sarebbe l'unica bugia della pagina. Stesso spazio, stesso peso,
 * parola vera.
 */
function stageDateLabel(iso: string | null, now: Date): string {
  if (!iso) return 'SENZA DATA';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'SENZA DATA';
  if (dayKey.format(date) === dayKey.format(now)) return 'OGGI';
  return shortDate.format(date).replace('.', '').toUpperCase();
}

/** «Da validare · seduta del 19 agosto 2026», o l'equivalente per lo stato. */
function stageTooltip(stage: JourneyStage): string {
  const state = stage.isPlanned
    ? 'In agenda'
    : stage.isShared
      ? 'Condiviso con l’atleta'
      : stage.isApproved
        ? 'Riepilogo approvato, non ancora condiviso'
        : 'Riepilogo da validare';
  const when = stage.sessionDate
    ? ` · ${stage.isPlanned ? 'in programma il' : 'seduta del'} ${fullDate.format(new Date(stage.sessionDate))}`
    : '';
  return `${state}${when}`;
}

function StageCard({
  stage,
  index,
  now,
}: {
  stage: JourneyStage;
  index: number;
  now: Date;
}) {
  const tint = STAGE_TINT[stage.kind];
  const Icon = stage.isPlanned
    ? CalendarClock
    : stage.isCurrent
      ? Target
      : stage.category
        ? ICON_BY_CATEGORY[stage.category]
        : Flag;

  // Una seduta in agenda non ha un riepilogo da aprire: non deve nemmeno
  // sembrare cliccabile. Il tipo lo impone — `href` è `null` — e qui la card
  // diventa un riquadro invece di un collegamento.
  const Tag = stage.href ? Link : 'div';
  const linkProps = stage.href
    ? { href: stage.href }
    : { 'aria-hidden': false as const };

  return (
    <Tag
      {...(linkProps as { href: string })}
      aria-label={`${stage.isPlanned ? 'Sessione in agenda' : JOURNEY_STAGE_LABELS[stage.kind]}: ${stage.title}${
        stage.sessionDate
          ? `, seduta del ${fullDate.format(new Date(stage.sessionDate))}`
          : ''
      }`}
      // Il fumetto nativo: al passaggio dice in che stato è quella seduta, che
      // dal solo bordo tratteggiato non si capisce senza saperlo già.
      title={stageTooltip(stage)}
      className={`jp-rise group flex flex-col rounded-xl border p-3.5 transition duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${
        stage.isApproved || stage.isPlanned ? '' : 'border-dashed'
      } ${stage.href ? 'hover:-translate-y-1 focus-visible:-translate-y-1' : 'cursor-default'}`}
      style={{
        // Le tappe salgono da sinistra a destra, nel verso in cui si legge il
        // percorso: l'entrata dice «sequenza» prima di qualunque data.
        animationDelay: `${index * 70}ms`,
        borderColor: mix(
          tint,
          stage.isPlanned ? 35 : stage.isApproved ? (stage.isCurrent ? 55 : 24) : 45,
          'transparent'
        ),
        backgroundColor:
          stage.isCurrent || (!stage.isApproved && !stage.isPlanned)
            ? 'white'
            : mix(tint, stage.isPlanned ? 7 : 5),
        // La tappa corrente si stacca dal piano: è l'unica che non è finita.
        boxShadow: stage.isCurrent
          ? `0 1px 2px ${mix(tint, 12, 'transparent')}, 0 8px 24px -12px ${mix(tint, 55, 'transparent')}`
          : undefined,
        ['--tw-ring-color' as string]: mix(tint, 45, 'transparent'),
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <span
          className="text-[11px] font-bold uppercase leading-none tracking-[0.1em]"
          style={{ color: mix(tint, 82, 'black') }}
        >
          {stage.sessionDate ? (
            <time dateTime={stage.sessionDate}>
              {stageDateLabel(stage.sessionDate, now)}
            </time>
          ) : (
            stageDateLabel(null, now)
          )}
        </span>
        <Icon
          className="h-4 w-4 shrink-0 transition-transform duration-200 group-hover:scale-110"
          style={{ color: tint }}
          aria-hidden="true"
        />
      </div>

      <p
        className="mt-2.5 text-[15px] font-bold leading-[1.2] tracking-tight"
        style={{ color: mix(tint, 78, 'black') }}
      >
        {stage.title}
      </p>

      {stage.description && (
        <p className="mt-1.5 text-xs leading-relaxed text-gray-600">
          {stage.description}
        </p>
      )}

      {/* Non basta il tratteggio: un bordo diverso si nota solo se si sa che
          cosa cercare. La riga lo dice a parole. */}
      {!stage.isApproved && !stage.isPlanned && (
        <p className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-kp-red">
          <Clock3 className="h-3 w-3" aria-hidden="true" />
          Da validare
        </p>
      )}
      {/* Consegnato all'atleta. Sta accanto a «Da validare» perche' sono i due
          estremi della stessa domanda: a che punto e' questa seduta. Un
          riepilogo approvato e non condiviso non porta niente — e' lo stato
          normale, e non merita rumore. */}
      {stage.isShared && (
        <p className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-sky-700">
          <Send className="h-3 w-3" aria-hidden="true" />
          Condiviso
        </p>
      )}
      {stage.isPlanned && (
        <p
          className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold"
          style={{ color: mix(tint, 75, 'black') }}
        >
          <CalendarClock className="h-3 w-3" aria-hidden="true" />
          In agenda
        </p>
      )}
    </Tag>
  );
}

/**
 * La linea sotto le card.
 *
 * Ogni pallino sta al centro della sua card — è la stessa colonna della
 * griglia, quindi l'allineamento non può scollarsi. Il segmento fra due
 * pallini sfuma da una tinta all'altra: il passaggio di fase si vede sulla
 * linea, non solo sulle card. Dopo l'ultimo, il tratteggio dice che il
 * percorso continua.
 */
function StageRail({
  stage,
  next,
}: {
  stage: JourneyStage;
  next: JourneyStage | null;
}) {
  const tint = STAGE_TINT[stage.kind];

  return (
    <div className="relative h-11">
      {/* La stanghetta che scende dalla card al suo pallino: senza, le card e
          la linea sono due righe che si somigliano; con, sono una cosa sola. */}
      <span
        className="absolute left-1/2 top-0 w-px -translate-x-1/2"
        style={{
          height: '50%',
          backgroundColor: mix(tint, stage.isApproved ? 30 : 18, 'white'),
        }}
      />
      {/* Un solo segmento per tappa, da questo pallino al prossimo: scavalca
          la gronda fra le due colonne (`calc(100% + gap)`), altrimenti la
          linea si spezzerebbe a ogni card. Disegnarla invece in due metà —
          una per colonna — rimetterebbe la sfumatura da capo a metà strada,
          e il passaggio di fase si leggerebbe due volte. */}
      {next ? (
        <span
          className="absolute left-1/2 top-1/2 h-0.5 -translate-y-1/2"
          style={{
            width: `calc(100% + ${GRID_GAP})`,
            background: `linear-gradient(in oklab, ${tint}, ${STAGE_TINT[next.kind]})`,
          }}
        />
      ) : (
        <span
          className="absolute left-1/2 top-1/2 h-0.5 w-1/2 -translate-y-1/2"
          style={{
            background: `repeating-linear-gradient(to right, ${mix(tint, 55, 'transparent')} 0 5px, transparent 5px 11px)`,
          }}
        />
      )}

      {/* Le sedute che stanno fra questa tappa e la prossima. Sedici puntini
          fitti e sei radi raccontano due percorsi diversi, e con le sole card
          si assomiglierebbero. L'alone bianco li stacca dalla linea su cui
          poggiano. */}
      {stage.ticksToNext.map((tick) => {
        // Il segno prende il colore della linea *nel punto in cui poggia*, non
        // quello d'inizio del tratto: sotto una sfumatura blu→arancio, un
        // puntino azzurro appoggiato sull'arancio diventa fango.
        const under = next
          ? `color-mix(in oklab, ${STAGE_TINT[next.kind]} ${(tick.fraction * 100).toFixed(1)}%, ${tint})`
          : tint;
        return (
          <span
            key={`tick-${tick.sessionId}`}
            // Il fumetto nativo del browser: al passaggio del mouse il puntino
            // dice di quale seduta è, senza aggiungere una riga di JavaScript.
            title={
              tick.sessionDate
                ? `Seduta del ${fullDate.format(new Date(tick.sessionDate))}`
                : undefined
            }
            className="absolute top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              left: `calc(50% + ${tick.fraction} * (100% + ${GRID_GAP}))`,
              backgroundColor: mix(under, 55),
              boxShadow: '0 0 0 1.5px white',
            }}
          />
        );
      })}

      {stage.isCurrent && (
        <span
          className="jp-beat absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ backgroundColor: tint }}
        />
      )}
      <span
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white"
        style={{
          height: stage.isCurrent ? 17 : 14,
          width: stage.isCurrent ? 17 : 14,
          // Non tratteggiato: su un cerchio di quattordici pixel un bordo
          // tratteggiato diventa tre archi storti. Il pallino di una tappa non
          // validata resta pieno e si smorza — lo dicono già la card e la
          // legenda.
          border: `${stage.isCurrent ? 4 : 3}px solid ${
            stage.isApproved ? tint : mix(tint, 45, 'white')
          }`,
        }}
      />
    </div>
  );
}

function Legend({
  hasTicks,
  hasDrafts,
  hasPlanned,
}: {
  hasTicks: boolean;
  hasDrafts: boolean;
  hasPlanned: boolean;
}) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {JOURNEY_STAGE_KINDS.filter(
        (kind) => kind !== 'pianificata' || hasPlanned
      ).map((kind) => (
        <li key={kind} className="flex items-center gap-1.5">
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: STAGE_TINT[kind] }}
            aria-hidden="true"
          />
          <span className="text-xs font-medium text-gray-600">
            {JOURNEY_STAGE_LABELS[kind]}
          </span>
        </li>
      ))}

      {/* I puntini piccoli sulla linea non si spiegano da soli: chi li vede la
          prima volta chiede che cosa siano, e una legenda che descrive i
          colori può descrivere anche una dimensione. Il filetto li separa
          perché rispondono a un'altra domanda: le voci sopra dicono che cosa
          significa un colore, questa che cosa significa un punto piccolo.

          Compare solo quando ce ne sono: su un percorso corto ogni seduta ha
          la sua card, e spiegare qualcosa che non c'è è peggio che tacere. */}
      {hasDrafts && (
        <li className="flex items-center gap-1.5 border-l border-gray-200 pl-4">
          <Clock3 className="h-3 w-3 text-gray-400" aria-hidden="true" />
          <span className="text-xs font-medium text-gray-500">Da validare</span>
        </li>
      )}

      {hasTicks && (
        <li className="flex items-center gap-1.5 border-l border-gray-200 pl-4">
          <span
            className="h-1.5 w-1.5 rounded-full bg-gray-400"
            aria-hidden="true"
          />
          <span className="text-xs font-medium text-gray-500">
            Altre sedute
          </span>
        </li>
      )}
    </ul>
  );
}

export function JourneyPath({
  stages,
  totalSessions,
  allSessionsHref,
  now = new Date(),
}: {
  stages: readonly JourneyStage[];
  /** Sedute approvate nel percorso: la striscia ne mostra al più sei. */
  totalSessions: number;
  allSessionsHref: string;
  now?: Date;
}) {
  // Con una tappa sola non c'è un percorso, c'è una seduta: la striscia tace
  // invece di disegnare una linea con un punto.
  if (stages.length < MIN_JOURNEY_STAGES) return null;

  return (
    <section
      aria-labelledby="journey-path-title"
      className="rounded-2xl border border-gray-200/70 bg-white p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <div>
          <h2
            id="journey-path-title"
            className="text-lg font-bold tracking-tight text-gray-900"
          >
            Il percorso
          </h2>
          <p className="mt-0.5 text-sm text-gray-500">
            La storia del lavoro insieme, sessione dopo sessione.
          </p>
        </div>
        <Legend
          hasTicks={stages.some((stage) => stage.ticksToNext.length > 0)}
          // Una seduta in agenda non è «da validare»: non è ancora avvenuta,
          // e non c'è niente da approvare.
          hasDrafts={stages.some(
            (stage) => !stage.isApproved && !stage.isPlanned
          )}
          hasPlanned={stages.some((stage) => stage.isPlanned)}
        />
      </div>

      {/* Sotto la larghezza delle sei card la striscia scorre invece di
          comprimersi: un arco schiacciato non si legge, e le card diventano
          colonne di parole singole. */}
      {/* `overflow-x-auto` ritaglia anche in verticale — è la regola CSS: se
          un asse non è `visible`, l'altro smette di esserlo. Senza spazio in
          cima, la card che si solleva al passaggio del mouse finiva tagliata
          sotto il bordo della fascia. Il margine negativo restituisce lo
          spazio preso dal riempimento. */}
      <div className="-mx-1 -mt-1 mt-4 overflow-x-auto px-1 pb-1 pt-3">
        <div
          className="grid"
          style={{
            columnGap: GRID_GAP,
            gridTemplateColumns: `repeat(${stages.length}, ${CARD_WIDTH_PX}px)`,
            // Allineate a sinistra: la striscia comincia dove comincia il
            // percorso, non al centro dello spazio disponibile.
            justifyContent: 'start',
          }}
        >
          {stages.map((stage, index) => (
            <StageCard
              key={`card-${stage.sessionId}`}
              stage={stage}
              index={index}
              now={now}
            />
          ))}
          {/* Decorativa: dice con una linea quello che le card dicono a
              parole, e ripeterlo a chi legge con lo screen reader è rumore. */}
          {stages.map((stage, index) => (
            <div key={`rail-${stage.sessionId}`} aria-hidden="true">
              <StageRail
                stage={stage}
                next={index < stages.length - 1 ? stages[index + 1] : null}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-center">
        <Link
          href={allSessionsHref}
          className="group inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-4 py-1.5 text-sm font-medium text-gray-600 transition hover:border-gray-300 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
        >
          Vedi tutte le sessioni ({totalSessions})
          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>
    </section>
  );
}
