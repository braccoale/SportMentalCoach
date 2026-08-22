import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import {
  MIN_PROGRESS_POINTS,
  type JourneyInsight,
  type JourneyProgress,
} from '@/lib/core/ai-session-notes/journey-progress';

/**
 * «Progresso complessivo», con l'insight del percorso accanto.
 *
 * Stanno nello stesso riquadro perché si leggono insieme: la linea dice come
 * si è mosso il livello, il testo dice che cosa quel movimento significa
 * secondo il riepilogo che il coach ha approvato. Separarli produrrebbe un
 * grafico senza parole e delle parole senza prove.
 *
 * Il grafico dichiara la propria scala — 1–5, quella del Compass — e quanti
 * indicatori stanno dietro il punto più debole. Una linea che non dice su
 * quanti dati poggia è una linea che si fa credere più di quanto sa.
 */

const shortDate = new Intl.DateTimeFormat('it-IT', {
  day: 'numeric',
  month: 'short',
  timeZone: 'Europe/Rome',
});

const LEVELS = ['Alto', 'Medio', 'Basso'];

/**
 * Che cosa dice un punto della linea.
 *
 * Prima diceva «3.4 su 5 · 5 indicatori», cioè ripeteva in cifre quello
 * che il pallino già mostrava in altezza. Non diceva la cosa che serve: che
 * quel numero è una **media** di stime diverse fra loro, e che sotto c'è il
 * testo di una conversazione, non una misura.
 */
function progressPointTooltip(point: JourneyProgress['points'][number]): string {
  const when = point.sessionDate
    ? `Seduta del ${shortDate.format(new Date(point.sessionDate))}`
    : 'Seduta senza data';
  const how =
    point.metricCount === 1
      ? 'un solo indicatore stimato in quella seduta: un punto che si muove molto con poco'
      : `media dei ${point.metricCount} indicatori stimati in quella seduta`;
  return `${when}: ${point.value.toFixed(1)} su 5 — ${how}. Le stime nascono dalle parole dette, non dal tono della voce.`;
}

function InsightPanel({ insight }: { insight: JourneyInsight | null }) {
  return (
    <aside className="flex min-w-0 flex-1 flex-col rounded-xl bg-violet-50/60 p-4 lg:max-w-[15rem]">
      <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-violet-700">
        <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
        Insight AI
      </p>
      {insight ? (
        <>
          <p className="mt-2 flex-1 text-sm leading-relaxed text-gray-700">
            {insight.text}
          </p>
          {/* Da dove viene: è il filo scritto in un riepilogo che il coach ha
              già approvato, non un secondo testo generato per questo riquadro
              e mai validato da nessuno. */}
          <Link
            href={insight.href}
            className="mt-3 text-xs text-violet-700 underline-offset-2 hover:underline"
          >
            Dal riepilogo del{' '}
            {insight.sessionDate
              ? shortDate.format(new Date(insight.sessionDate))
              : 'percorso'}
          </Link>
        </>
      ) : (
        <p className="mt-2 flex-1 text-sm leading-relaxed text-gray-500">
          Comparirà qui quando un riepilogo approvato collegherà una seduta a
          quelle precedenti.
        </p>
      )}
    </aside>
  );
}

export function JourneyProgressPanel({
  progress,
  insight,
}: {
  progress: JourneyProgress | null;
  insight: JourneyInsight | null;
}) {
  return (
    <section className="rounded-2xl border border-gray-200/70 bg-white p-5">
      <h2 className="text-base font-bold tracking-tight text-gray-900">
        Progresso complessivo
      </h2>

      <div className="mt-4 flex flex-col gap-4 lg:flex-row">
        <div className="min-w-0 flex-1">
          {progress ? (
            <>
              <div className="flex gap-3">
                <div className="flex h-32 shrink-0 flex-col justify-between py-1 text-[11px] text-gray-400">
                  {LEVELS.map((level) => (
                    <span key={level}>{level}</span>
                  ))}
                </div>

                <div className="relative min-w-0 flex-1">
                  <svg
                    viewBox="0 0 100 100"
                    preserveAspectRatio="none"
                    className="h-32 w-full"
                    role="img"
                    aria-label={`Andamento su ${progress.points.length} sedute, scala da 1 a 5`}
                  >
                    {[0, 50, 100].map((y) => (
                      <line
                        key={y}
                        x1="0"
                        x2="100"
                        y1={y}
                        y2={y}
                        stroke="#f3f4f6"
                        strokeWidth="1"
                        vectorEffect="non-scaling-stroke"
                      />
                    ))}
                    <path
                      d={progress.areaPath}
                      fill="color-mix(in srgb, var(--color-jp-strategia) 12%, transparent)"
                    />
                    <polyline
                      points={progress.polyline}
                      fill="none"
                      stroke="var(--color-jp-strategia)"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      vectorEffect="non-scaling-stroke"
                    />
                  </svg>

                  {/* I pallini stanno fuori dall'SVG: dentro, il
                      `preserveAspectRatio="none"` li schiaccerebbe in ellissi. */}
                  {progress.points.map((point, index) => {
                    const x = (index / (progress.points.length - 1)) * 100;
                    const y = 100 - ((point.value - 1) / 4) * 100;
                    return (
                      <span
                        key={point.sessionId}
                        title={progressPointTooltip(point)}
                        className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-white"
                        style={{
                          left: `${x}%`,
                          top: `${y}%`,
                          borderColor: 'var(--color-jp-strategia)',
                        }}
                      />
                    );
                  })}
                </div>
              </div>

              <div className="ml-12 mt-2 flex justify-between text-[11px] text-gray-400">
                {progress.points.map((point) => (
                  <span key={point.sessionId}>
                    {point.sessionDate
                      ? shortDate.format(new Date(point.sessionDate)).toUpperCase()
                      : '—'}
                  </span>
                ))}
              </div>

              <p className="mt-3 text-xs text-gray-400">
                Media degli indicatori del Compass, scala 1–5. Il punto più
                debole poggia su{' '}
                {progress.weakestMetricCount === 1
                  ? '1 indicatore'
                  : `${progress.weakestMetricCount} indicatori`}
                .
              </p>
            </>
          ) : (
            <div className="flex h-full min-h-32 items-center">
              <p className="text-sm leading-relaxed text-gray-500">
                Servono almeno {MIN_PROGRESS_POINTS} sedute approvate con
                indicatori per disegnare un andamento. Con meno, una linea
                racconterebbe un caso invece di una tendenza.
              </p>
            </div>
          )}
        </div>

        <InsightPanel insight={insight} />
      </div>
    </section>
  );
}
