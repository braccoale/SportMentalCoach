import Link from 'next/link';
import { ArrowRight, Clock, PlayCircle, TrendingUp } from 'lucide-react';
import { StatusPill } from '@/components/admin/academy/status-pill';

/**
 * Stessa decorazione fissa già usata nell'hero della pagina corso — non è
 * legata ai contenuti reali del corso, è identità di brand: la si ripete
 * qui per coerenza invece di inventarne una seconda diversa.
 */
const BRAND_WORDS = ['Disciplina', 'Mentalità', 'Crescita', 'Risultati'];

export function CourseListCard({
  href,
  title,
  edition,
  level,
  moduleCount,
  totalHours,
  status,
  heroImageUrl,
  badgeLabel,
  progress,
  ctaLabel,
  footer,
}: {
  href: string;
  title: string;
  edition: string | null;
  level: string | null;
  moduleCount: number;
  totalHours: number;
  status: string;
  heroImageUrl: string | null;
  badgeLabel: string;
  /** Solo per la vista partecipante: barra di avanzamento reale sui moduli completati. */
  progress?: { completed: number; total: number };
  ctaLabel: string;
  footer?: React.ReactNode;
}) {
  const percent = progress && progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : null;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div
          className="relative h-28 w-full shrink-0 overflow-hidden rounded-xl bg-gray-900 sm:h-24 sm:w-36"
          style={
            heroImageUrl
              ? {
                  backgroundImage: `linear-gradient(180deg, rgba(5,10,8,0.15) 0%, rgba(5,10,8,0.55) 100%), url(${heroImageUrl})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                }
              : {
                  backgroundImage:
                    'linear-gradient(160deg, #0a1410 0%, #050807 100%)',
                }
          }
        >
          <div className="absolute left-2.5 top-2.5 flex flex-col gap-0.5 text-[9px] font-semibold uppercase tracking-wide text-white/85">
            {BRAND_WORDS.map((word) => (
              <span key={word}>{word}</span>
            ))}
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <span className="inline-flex items-center rounded-full bg-indigo-50 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-indigo-700">
            {badgeLabel}
          </span>
          <h3 className="mt-1.5 text-base font-semibold text-gray-900">
            <Link href={href} className="hover:underline">
              {title}
            </Link>
          </h3>
          <p className="mt-0.5 text-xs text-gray-500">
            {[
              edition ? `Edizione ${edition}` : null,
              `${moduleCount} moduli`,
              `${totalHours} ore di contenuti`,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>

          {percent !== null && (
            <div className="mt-2.5 max-w-xs">
              <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
                <div
                  className="h-full rounded-full bg-indigo-600"
                  style={{ width: `${percent}%` }}
                />
              </div>
              <p className="mt-1 text-[11px] text-gray-500">{percent}% completato</p>
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-row items-center gap-3 sm:flex-col sm:items-end">
          <StatusPill status={status} />
          <Link
            href={href}
            className="inline-flex items-center gap-1.5 rounded-full bg-gray-900 px-4 py-2 text-xs font-semibold text-white hover:bg-gray-800"
          >
            {ctaLabel}
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t border-gray-100 pt-3 text-xs text-gray-600">
        <span className="flex items-center gap-1.5">
          <PlayCircle className="h-3.5 w-3.5 text-gray-400" aria-hidden="true" />
          {moduleCount} moduli
        </span>
        <span className="flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5 text-gray-400" aria-hidden="true" />
          {totalHours} ore
        </span>
        {level && (
          <span className="flex items-center gap-1.5">
            <TrendingUp className="h-3.5 w-3.5 text-gray-400" aria-hidden="true" />
            Livello {level}
          </span>
        )}
      </div>

      {footer}
    </div>
  );
}
