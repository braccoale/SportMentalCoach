import { Users, Clock } from 'lucide-react';
import { formatTotalHours } from '@/lib/core/format';

/**
 * Circular "gauge" fill for a raw count with no natural upper bound. Uses a
 * diminishing-returns curve (value / (value + cap)) rather than a hard cap —
 * the ring keeps growing toward full as the coach's track record grows, but
 * never actually maxes out (there's always more experience to gain).
 */
export function gaugeProgress(value: number, cap: number): number {
  return value <= 0 ? 0 : value / (value + cap);
}

export function GaugeRing({
  progress,
  className,
  size = 96,
}: {
  progress: number;
  className: string;
  /** Pixel size of the ring (it's a square SVG). */
  size?: number;
}) {
  const r = 40;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - progress);
  return (
    <svg
      viewBox="0 0 100 100"
      style={{ height: size, width: size }}
      className="-rotate-90"
    >
      <circle
        cx="50"
        cy="50"
        r={r}
        strokeWidth="8"
        className="fill-none stroke-gray-100"
      />
      <circle
        cx="50"
        cy="50"
        r={r}
        strokeWidth="8"
        strokeDasharray={c}
        strokeDashoffset={offset}
        strokeLinecap="round"
        className={`fill-none transition-[stroke-dashoffset] duration-700 ${className}`}
      />
    </svg>
  );
}

/**
 * Trust/experience showcase for the coach profile: two glass-morphism gauge
 * rings for athletes coached and total coaching hours delivered. Hidden for
 * coaches with no completed sessions yet — there's nothing to show off.
 */
export function CoachExperienceStats({
  athletesCount,
  totalMinutes,
}: {
  athletesCount: number;
  totalMinutes: number;
}) {
  if (athletesCount === 0) return null;

  return (
    <div className="relative mt-6 overflow-hidden rounded-3xl border border-white/60 bg-white/70 p-6 shadow-xl ring-1 ring-black/5 backdrop-blur-xl">
      <div
        aria-hidden
        className="pointer-events-none absolute -left-10 -top-10 h-40 w-40 rounded-full bg-blue-200/40 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-10 -right-10 h-40 w-40 rounded-full bg-sky-300/30 blur-3xl"
      />
      <div className="relative grid grid-cols-2 gap-6">
        <div className="flex flex-col items-center text-center">
          <div className="relative flex h-24 w-24 items-center justify-center">
            <GaugeRing
              progress={gaugeProgress(athletesCount, 20)}
              className="stroke-blue-500"
            />
            <div className="absolute flex flex-col items-center">
              <Users className="h-4 w-4 text-blue-500" />
              <span className="mt-0.5 text-xl font-bold text-gray-900">
                {athletesCount}
              </span>
            </div>
          </div>
          <p className="mt-2 text-xs font-medium uppercase tracking-wide text-gray-500">
            {athletesCount === 1 ? 'Atleta seguito' : 'Atleti seguiti'}
          </p>
        </div>

        <div className="flex flex-col items-center text-center">
          <div className="relative flex h-24 w-24 items-center justify-center">
            <GaugeRing
              progress={gaugeProgress(totalMinutes, 600)}
              className="stroke-sky-500"
            />
            <div className="absolute flex flex-col items-center">
              <Clock className="h-4 w-4 text-sky-500" />
              <span className="mt-0.5 text-xl font-bold text-gray-900">
                {formatTotalHours(totalMinutes)}
              </span>
            </div>
          </div>
          <p className="mt-2 text-xs font-medium uppercase tracking-wide text-gray-500">
            Ore di coaching erogate
          </p>
        </div>
      </div>
    </div>
  );
}
