import Link from 'next/link';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  type LucideIcon,
} from 'lucide-react';

/**
 * Dashboard KPI widget: soft-tinted icon, big number, a trend footnote and a
 * colored bottom bar. Tones map to fixed Tailwind classes (no dynamic class
 * names, or the compiler would purge them).
 */

export type CardTone = 'red' | 'green' | 'purple' | 'amber' | 'blue' | 'gray';

const TONES: Record<
  CardTone,
  { iconBox: string; bar: string; trend: string }
> = {
  red: {
    iconBox: 'bg-red-50 text-red-500',
    bar: 'bg-red-500',
    trend: 'text-red-600',
  },
  green: {
    iconBox: 'bg-emerald-50 text-emerald-500',
    bar: 'bg-emerald-500',
    trend: 'text-emerald-600',
  },
  purple: {
    iconBox: 'bg-violet-50 text-violet-500',
    bar: 'bg-violet-500',
    trend: 'text-violet-600',
  },
  amber: {
    iconBox: 'bg-amber-50 text-amber-500',
    bar: 'bg-amber-400',
    trend: 'text-amber-600',
  },
  blue: {
    iconBox: 'bg-blue-50 text-blue-500',
    bar: 'bg-blue-500',
    trend: 'text-blue-600',
  },
  gray: {
    iconBox: 'bg-gray-100 text-gray-500',
    bar: 'bg-gray-300',
    trend: 'text-gray-500',
  },
};

export function SummaryCard({
  icon: Icon,
  label,
  value,
  tone = 'gray',
  note,
  trend = 'flat',
  href,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  tone?: CardTone;
  /** Footnote under the number, e.g. "2 nuove oggi". */
  note?: string;
  trend?: 'up' | 'down' | 'flat';
  href?: string;
}) {
  const t = TONES[tone];
  const TrendIcon =
    trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;

  const content = (
    <>
      <div className="flex items-start gap-3 p-4 pb-3">
        <span
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${t.iconBox}`}
        >
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-3xl font-semibold leading-none text-gray-900">
            {value}
          </p>
          <p className="mt-1 text-sm leading-snug text-gray-500">{label}</p>
        </div>
      </div>
      {note && (
        <div className="flex items-center gap-1.5 border-t border-gray-100 px-4 py-2">
          <TrendIcon className={`h-3.5 w-3.5 shrink-0 ${t.trend}`} />
          <span className={`truncate text-xs font-medium ${t.trend}`}>
            {note}
          </span>
        </div>
      )}
      {/* colored bottom bar */}
      <div className={`h-1 w-full ${t.bar}`} />
    </>
  );

  const cls =
    'flex flex-col justify-between overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm';

  // Only clickable when there's something behind the number to jump to —
  // a "0" widget has no destination worth navigating for.
  return href && value > 0 ? (
    <Link
      href={href}
      className={`${cls} transition-shadow hover:shadow-md`}
    >
      {content}
    </Link>
  ) : (
    <div className={cls}>{content}</div>
  );
}
