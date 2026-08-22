import Link from 'next/link';
import {
  Brain,
  ChevronRight,
  Crosshair,
  Shield,
  Target,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import {
  type CommitmentBreakdown,
  type CommitmentRowKey,
  type ThemeBar,
} from '@/lib/core/ai-session-notes/journey-panels';
import { MIN_COMMITMENTS_FOR_RATE } from '@/lib/core/ai-session-notes/mental-journey';

/**
 * I due riquadri accanto al percorso: che fine hanno fatto gli impegni presi,
 * e su che cosa si torna sempre.
 *
 * Rispondono a domande diverse e per questo non sono lo stesso riquadro: gli
 * impegni raccontano la realtà — che cosa è stato fatto davvero — mentre i
 * temi raccontano di che cosa si parla. Si leggono uno accanto all'altro.
 */

/**
 * Una tinta e un'icona per riga, cicliche.
 *
 * Non hanno un significato: i temi li scrive il modello e non portano una
 * categoria da cui ricavarli. Servono a distinguere quattro righe a colpo
 * d'occhio, ed è per questo che l'ordine è stabile — la stessa posizione dà
 * sempre lo stesso colore, così la scheda non cambia aspetto a ogni ricarica.
 */
const THEME_TINTS = [
  'var(--color-jp-problema)',
  'var(--color-jp-focus)',
  'var(--color-jp-strategia)',
  'var(--color-jp-progresso)',
  'var(--color-jp-applicazione)',
];
const THEME_ICONS: LucideIcon[] = [Crosshair, Zap, Brain, Shield, Target];

const RING_RADIUS = 42;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/**
 * Due soli colori, non quattro.
 *
 * La striscia sopra usa già cinque tinte per dire le fasi del lavoro. Dare
 * un'altra tinta a ogni stato di impegno significherebbe insegnare due
 * alfabeti di colore nella stessa schermata. Qui basta distinguere ciò che è
 * chiuso bene da ciò che è ancora aperto; il resto è testo.
 */
const ROW_TONE: Record<CommitmentRowKey, string> = {
  completed: 'text-[var(--color-jp-progresso)]',
  inProgress: 'text-[var(--color-jp-focus)]',
  skipped: 'text-[var(--color-jp-problema)]',
};

function Panel({
  title,
  children,
  action,
  footnote,
}: {
  title: string;
  children: React.ReactNode;
  action?: { label: string; href: string };
  footnote?: string;
}) {
  return (
    <section className="flex h-full flex-col rounded-2xl border border-gray-200/70 bg-white p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-base font-bold tracking-tight text-gray-900">
          {title}
        </h2>
        {action && (
          <Link
            href={action.href}
            className="group inline-flex items-center gap-0.5 text-xs font-semibold text-violet-700 transition hover:text-violet-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
          >
            {action.label}
            <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </Link>
        )}
      </div>

      <div className="mt-4 flex-1">{children}</div>

      {footnote && (
        <p className="mt-4 border-t border-gray-100 pt-3 text-xs text-gray-400">
          {footnote}
        </p>
      )}
    </section>
  );
}

/**
 * L'anello.
 *
 * Compare solo quando il dominio ha prodotto una quota. Sotto la soglia non
 * si disegna un anello «quasi vuoto» né uno 0%: una percentuale su tre
 * impegni descrive il caso, non il percorso — e un anello è una percentuale
 * disegnata, quindi vale la stessa regola.
 */
/**
 * Che cosa dice davvero l'anello.
 *
 * L'ultima frase esiste perché un anello a metà si legge come una pagella
 * dell'atleta, e non lo è: lo stato di un impegno lo aggiorna lui, quando si
 * ricorda di farlo. «Non completato» e «non spuntato» sono la stessa cosa
 * qui dentro, e sono due fatti molto diversi.
 */
function completionRingTooltip(
  rate: number,
  breakdown: CommitmentBreakdown
): string {
  const done = breakdown.rows.find((row) => row.key === 'completed')?.count;
  const counted =
    done === undefined
      ? `${rate}% degli impegni concordati risulta completato`
      : `${done} impegni completati su ${breakdown.total} concordati (${rate}%)`;
  return `${counted}. Lo stato lo aggiorna l’atleta: un impegno non spuntato non vuol dire che non sia stato fatto.`;
}

function CompletionRing({
  rate,
  breakdown,
}: {
  rate: number;
  breakdown: CommitmentBreakdown;
}) {
  // `rate` arriva in centesimi dal dominio: 73 vuol dire 73%.
  const filled = Math.max(0, Math.min(1, rate / 100));

  return (
    <div className="relative shrink-0" title={completionRingTooltip(rate, breakdown)}>
      <svg viewBox="0 0 100 100" className="h-28 w-28 -rotate-90" aria-hidden="true">
        <circle
          cx="50"
          cy="50"
          r={RING_RADIUS}
          fill="none"
          strokeWidth="11"
          className="stroke-gray-100"
        />
        <circle
          cx="50"
          cy="50"
          r={RING_RADIUS}
          fill="none"
          strokeWidth="11"
          strokeLinecap="round"
          stroke="var(--color-jp-progresso)"
          strokeDasharray={`${(filled * RING_CIRCUMFERENCE).toFixed(2)} ${RING_CIRCUMFERENCE.toFixed(2)}`}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-xl font-bold tracking-tight text-gray-900">
        {Math.round(rate)}%
      </span>
    </div>
  );
}

export function JourneyCommitmentsPanel({
  breakdown,
  allCommitmentsHref,
}: {
  breakdown: CommitmentBreakdown;
  allCommitmentsHref: string;
}) {
  if (breakdown.total === 0) {
    return (
      <Panel title="Azioni concordate">
        <p className="text-sm leading-relaxed text-gray-500">
          Non è ancora stato concordato nessun impegno. Compaiono qui quando un
          riepilogo che li contiene viene approvato.
        </p>
      </Panel>
    );
  }

  return (
    <Panel
      title="Azioni concordate"
      action={{ label: 'Vedi tutte le azioni', href: allCommitmentsHref }}
      footnote={
        breakdown.completionRate === null
          ? `Sotto ${MIN_COMMITMENTS_FOR_RATE} impegni una percentuale racconterebbe più rumore che percorso.`
          : undefined
      }
    >
      <div className="flex h-full items-center gap-6">
        {breakdown.completionRate !== null && (
          <CompletionRing rate={breakdown.completionRate} breakdown={breakdown} />
        )}

        <dl className="min-w-0 flex-1 text-sm">
          <div className="flex items-baseline justify-between gap-3 border-b border-gray-100 pb-2">
            <dt className="font-medium text-gray-500">Totali</dt>
            <dd className="font-bold tabular-nums text-gray-900">
              {breakdown.total}
            </dd>
          </div>
          {breakdown.rows.map((row) => (
            <div
              key={row.key}
              className="flex items-baseline justify-between gap-3 pt-2"
            >
              <dt className={ROW_TONE[row.key]}>{row.label}</dt>
              <dd className={`font-semibold tabular-nums ${ROW_TONE[row.key]}`}>
                {row.count}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </Panel>
  );
}

/**
 * Che cos'è un tema, e che cosa dice questa barra.
 *
 * Prima il fumetto diceva «In 6 sedute su 8»: il conteggio da cui nasce la
 * percentuale stampata a fianco, cioè la stessa cosa detta due volte.
 * Mancava l'unica frase che serve a chi guarda per la prima volta una barra
 * lunga — che misura **quante volte se n'è parlato**, non quanto quel tema
 * sia importante per la persona.
 */
function themeBarTooltip(bar: ThemeBar): string {
  return `«${bar.label}» — ${bar.countLabel.toLocaleLowerCase('it')} (${bar.percent}%). Un tema è un filone che il riepilogo ha riconosciuto in più di una seduta: la barra dice quante volte è tornato, non quanto conta.`;
}

export function JourneyThemesPanel({
  bars,
  approvedSessionCount,
  detailsHref,
  periodPhrase = null,
}: {
  bars: readonly ThemeBar[];
  approvedSessionCount: number;
  detailsHref: string;
  /** «negli ultimi 3 mesi», quando il percorso è ristretto a una finestra. */
  periodPhrase?: string | null;
}) {
  if (bars.length === 0) {
    return (
      <Panel title="Temi principali">
        <p className="text-sm leading-relaxed text-gray-500">
          Un tema compare qui quando torna in più di una seduta. Con un percorso
          ancora breve non c'è ricorrenza da mostrare.
        </p>
      </Panel>
    );
  }

  return (
    <Panel
      title="Temi principali"
      action={{ label: 'Vedi dettagli', href: detailsHref }}
      // Con una finestra attiva il denominatore cambia: dirlo qui evita che
      // «17 su 29» e «6 su 8» sembrino due misure in disaccordo.
      footnote={`Su ${approvedSessionCount} sedute con riepilogo approvato${
        periodPhrase ? ` ${periodPhrase}` : ''
      }.`}
    >
      <ul className="flex flex-col gap-4">
        {bars.map((bar, index) => {
          const tint = THEME_TINTS[index % THEME_TINTS.length];
          const Icon = THEME_ICONS[index % THEME_ICONS.length];
          return (
            <li
              key={bar.key}
              // Il fumetto sta sulla riga intera, non sulla sola barra: così
              // risponde anche a chi passa sopra il titolo troncato o la
              // percentuale, che sono i due punti da cui nasce la domanda.
              title={themeBarTooltip(bar)}
              className="flex items-center gap-3"
            >
              <span
                className="flex size-8 shrink-0 items-center justify-center rounded-full"
                style={{ backgroundColor: `color-mix(in srgb, ${tint} 10%, white)` }}
              >
                <Icon className="h-4 w-4" style={{ color: tint }} aria-hidden="true" />
              </span>

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-800">
                  {bar.label}
                </p>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-gray-100">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${(bar.fill * 100).toFixed(1)}%`, backgroundColor: tint }}
                  />
                </div>
              </div>

              <span className="w-10 shrink-0 text-right text-sm tabular-nums text-gray-500">
                {bar.percent}%
              </span>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
