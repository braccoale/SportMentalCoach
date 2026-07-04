import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';

/**
 * Dashboard KPI widget (coach + athlete dashboards). Optionally links to a
 * detail page; the accent classes color the icon disc.
 */
export function SummaryCard({
  icon: Icon,
  label,
  value,
  accent,
  href,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  accent: string;
  href?: string;
}) {
  const content = (
    <>
      <span
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${accent}`}
      >
        <Icon className="h-5 w-5" />
      </span>
      <div>
        <p className="text-2xl font-semibold leading-none text-gray-900">
          {value}
        </p>
        <p className="mt-1 text-sm text-gray-500">{label}</p>
      </div>
    </>
  );

  const cls =
    'flex items-center gap-4 rounded-xl border border-gray-200 bg-white p-4';

  return href ? (
    <Link href={href} className={`${cls} transition-colors hover:border-red-300`}>
      {content}
    </Link>
  ) : (
    <div className={cls}>{content}</div>
  );
}
