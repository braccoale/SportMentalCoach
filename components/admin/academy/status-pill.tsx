import { cn } from '@/lib/utils';

const STYLES: Record<string, string> = {
  draft: 'bg-amber-50 text-amber-700 border-amber-200',
  active: 'bg-green-50 text-green-700 border-green-200',
  cancelled: 'bg-gray-100 text-gray-500 border-gray-200',
  assigned: 'bg-gray-100 text-gray-600 border-gray-200',
  in_progress: 'bg-blue-50 text-blue-700 border-blue-200',
  completed: 'bg-green-50 text-green-700 border-green-200',
};

const LABELS: Record<string, string> = {
  draft: 'Bozza',
  active: 'Attivo',
  cancelled: 'Annullato',
  assigned: 'Assegnato',
  in_progress: 'In corso',
  completed: 'Completato',
};

export function StatusPill({ status, className }: { status: string; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold',
        STYLES[status] ?? 'border-gray-200 bg-gray-100 text-gray-600',
        className
      )}
    >
      {LABELS[status] ?? status}
    </span>
  );
}
